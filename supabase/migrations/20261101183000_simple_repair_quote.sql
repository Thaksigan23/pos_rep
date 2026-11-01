-- Simple repair counter flow:
-- accept with an agreed price, then mark completed in one step and record the work.

create or replace function public.repair_transition_allowed(
  p_from public.repair_status,
  p_to public.repair_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_to = 'completed'
      and p_from not in ('completed', 'delivered', 'cancelled')
      then true
    else case p_from
      when 'received' then p_to in ('diagnosing')
      when 'diagnosing' then p_to in ('waiting_for_customer_approval', 'approved')
      when 'waiting_for_customer_approval' then p_to in ('approved', 'diagnosing')
      when 'approved' then p_to in ('waiting_for_parts', 'in_repair')
      when 'waiting_for_parts' then p_to in ('in_repair')
      when 'in_repair' then p_to in ('testing', 'waiting_for_parts')
      when 'testing' then p_to in ('ready_for_pickup', 'in_repair')
      when 'ready_for_pickup' then p_to in ('completed')
      when 'completed' then p_to in ('delivered')
      else false
    end
  end;
$$;

create or replace function public.create_repair_job(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  job_id uuid;
  accessory jsonb;
  intake jsonb;
  quoted numeric(12,2) := 0;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_payload->>'reported_issue', ''))) = 0 then
    raise exception 'Reported issue is required' using errcode = '22023';
  end if;

  if nullif(p_payload->>'quoted_price', '') is not null then
    quoted := public.money_round((p_payload->>'quoted_price')::numeric);
    if quoted < 0 then
      raise exception 'Price cannot be negative' using errcode = '22023';
    end if;
  end if;

  insert into public.repair_jobs (
    organization_id, shop_id, ticket_number, customer_id, device_id,
    reported_issue, device_condition, diagnosis, technician_notes, internal_notes,
    status, priority, assigned_technician_id, estimated_completion_date,
    estimated_cost, labor_total, total,
    created_by
  ) values (
    profile.organization_id,
    shop,
    public.next_document_number('repair', shop),
    (p_payload->>'customer_id')::uuid,
    (p_payload->>'device_id')::uuid,
    p_payload->>'reported_issue',
    p_payload->>'device_condition',
    p_payload->>'diagnosis',
    p_payload->>'technician_notes',
    p_payload->>'internal_notes',
    'received',
    coalesce((p_payload->>'priority')::public.repair_priority, 'normal'),
    nullif(p_payload->>'assigned_technician_id', '')::uuid,
    nullif(p_payload->>'estimated_completion_date', '')::date,
    quoted,
    quoted,
    quoted,
    profile.id
  ) returning id into job_id;

  insert into public.repair_status_history (
    organization_id, repair_job_id, previous_status, new_status, changed_by, note
  ) values (
    profile.organization_id, job_id, null, 'received', profile.id, 'Job created'
  );

  for accessory in select * from jsonb_array_elements(coalesce(p_payload->'accessories', '[]'::jsonb))
  loop
    insert into public.repair_accessories (
      organization_id, repair_job_id, accessory_type, present, notes
    ) values (
      profile.organization_id, job_id,
      (accessory->>'accessory_type')::public.accessory_type,
      coalesce((accessory->>'present')::boolean, false),
      accessory->>'notes'
    );
  end loop;

  for intake in select * from jsonb_array_elements(coalesce(p_payload->'intake_checks', '[]'::jsonb))
  loop
    insert into public.device_intake_checks (
      organization_id, repair_job_id, check_definition_id, result, notes
    ) values (
      profile.organization_id, job_id,
      (intake->>'check_definition_id')::uuid,
      coalesce((intake->>'result')::public.intake_check_result, 'not_tested'),
      intake->>'notes'
    );
  end loop;

  perform public.write_audit_log('repair.create', 'repair_jobs', job_id, null,
    jsonb_build_object(
      'ticket', (select ticket_number from public.repair_jobs where id = job_id),
      'quoted_price', quoted
    ));

  return job_id;
end;
$$;

create or replace function public.update_repair_job_details(
  p_repair_job_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  job public.repair_jobs;
  key text;
  allowed_keys text[];
  assignee public.profiles;
  before_data jsonb;
  after_data jsonb;
  new_diagnosis text;
  new_tech_notes text;
  new_internal_notes text;
  new_device_condition text;
  new_priority public.repair_priority;
  new_eta date;
  new_assignee uuid;
  has_assignee_key boolean := false;
  price_value numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object' using errcode = '22023';
  end if;

  profile := public.require_role('owner', 'admin', 'cashier', 'technician');

  select * into job
  from public.repair_jobs
  where id = p_repair_job_id
  for update;

  if job.id is null or job.organization_id <> profile.organization_id then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;

  if not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if job.status = 'cancelled' then
    raise exception 'Cancelled repairs cannot be edited' using errcode = 'P0001';
  end if;

  if profile.role = 'technician' then
    if job.assigned_technician_id is not null
       and job.assigned_technician_id <> profile.id then
      raise exception 'Technicians may only update jobs assigned to them'
        using errcode = '42501';
    end if;
  end if;

  if profile.role in ('owner', 'admin') then
    allowed_keys := array[
      'diagnosis', 'technician_notes', 'internal_notes',
      'assigned_technician_id', 'priority', 'estimated_completion_date',
      'device_condition', 'work_done', 'final_price'
    ];
  elsif profile.role = 'cashier' then
    allowed_keys := array[
      'internal_notes', 'assigned_technician_id', 'priority',
      'estimated_completion_date', 'device_condition', 'work_done', 'final_price'
    ];
  else
    allowed_keys := array[
      'diagnosis', 'technician_notes', 'device_condition', 'work_done', 'final_price'
    ];
  end if;

  for key in select jsonb_object_keys(p_payload)
  loop
    if not (key = any (allowed_keys)) then
      raise exception 'Forbidden or unknown repair field: %', key
        using errcode = '42501';
    end if;
  end loop;

  before_data := jsonb_build_object(
    'diagnosis', job.diagnosis,
    'technician_notes', job.technician_notes,
    'internal_notes', job.internal_notes,
    'assigned_technician_id', job.assigned_technician_id,
    'priority', job.priority,
    'estimated_completion_date', job.estimated_completion_date,
    'device_condition', job.device_condition,
    'total', job.total
  );

  new_diagnosis := job.diagnosis;
  new_tech_notes := job.technician_notes;
  new_internal_notes := job.internal_notes;
  new_device_condition := job.device_condition;
  new_priority := job.priority;
  new_eta := job.estimated_completion_date;
  new_assignee := job.assigned_technician_id;

  if p_payload ? 'diagnosis' then
    new_diagnosis := nullif(p_payload->>'diagnosis', '');
  end if;
  if p_payload ? 'technician_notes' then
    new_tech_notes := nullif(p_payload->>'technician_notes', '');
  end if;
  if p_payload ? 'work_done' then
    new_diagnosis := nullif(btrim(p_payload->>'work_done'), '');
    new_tech_notes := new_diagnosis;
  end if;
  if p_payload ? 'internal_notes' then
    new_internal_notes := nullif(p_payload->>'internal_notes', '');
  end if;
  if p_payload ? 'device_condition' then
    new_device_condition := nullif(p_payload->>'device_condition', '');
  end if;
  if p_payload ? 'priority' then
    new_priority := (p_payload->>'priority')::public.repair_priority;
  end if;
  if p_payload ? 'estimated_completion_date' then
    new_eta := nullif(p_payload->>'estimated_completion_date', '')::date;
  end if;

  if p_payload ? 'assigned_technician_id' then
    has_assignee_key := true;
    if nullif(p_payload->>'assigned_technician_id', '') is null then
      new_assignee := null;
    else
      new_assignee := (p_payload->>'assigned_technician_id')::uuid;
      select * into assignee
      from public.profiles
      where id = new_assignee;

      if assignee.id is null
         or assignee.organization_id is distinct from profile.organization_id
         or not assignee.is_active then
        raise exception 'Assigned technician not found in organization'
          using errcode = 'P0001';
      end if;

      if assignee.role not in ('technician', 'owner', 'admin') then
        raise exception 'Assigned user is not eligible for repair assignment'
          using errcode = '22023';
      end if;

      if assignee.role not in ('owner', 'admin') then
        if not exists (
          select 1
          from public.shop_members m
          where m.user_id = assignee.id
            and m.shop_id = job.shop_id
        ) and assignee.default_shop_id is distinct from job.shop_id then
          raise exception 'Assigned technician does not have access to this shop'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  update public.repair_jobs
     set diagnosis = new_diagnosis,
         technician_notes = new_tech_notes,
         internal_notes = new_internal_notes,
         device_condition = new_device_condition,
         priority = new_priority,
         estimated_completion_date = new_eta,
         assigned_technician_id = new_assignee
   where id = job.id;

  if p_payload ? 'final_price' then
    price_value := public.money_round(coalesce(nullif(p_payload->>'final_price', '')::numeric, 0));
    if price_value < 0 then
      raise exception 'Price cannot be negative' using errcode = '22023';
    end if;
    update public.repair_jobs
       set labor_total = price_value,
           total = price_value
     where id = job.id;
  end if;

  after_data := jsonb_build_object(
    'diagnosis', new_diagnosis,
    'technician_notes', new_tech_notes,
    'internal_notes', new_internal_notes,
    'assigned_technician_id', new_assignee,
    'priority', new_priority,
    'estimated_completion_date', new_eta,
    'device_condition', new_device_condition,
    'total', coalesce(price_value, job.total)
  );

  if before_data is distinct from after_data then
    perform public.write_audit_log(
      'repair.update_details',
      'repair_jobs',
      job.id,
      before_data,
      after_data
    );
  end if;

  if has_assignee_key
     and job.assigned_technician_id is distinct from new_assignee then
    perform public.write_audit_log(
      'repair.assign_technician',
      'repair_jobs',
      job.id,
      jsonb_build_object('assigned_technician_id', job.assigned_technician_id),
      jsonb_build_object('assigned_technician_id', new_assignee)
    );
  end if;

  return job.id;
end;
$$;
