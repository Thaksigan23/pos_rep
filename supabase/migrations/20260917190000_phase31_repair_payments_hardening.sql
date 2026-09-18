-- Phase 3.1: safe repair detail updates, photo deletion, payment overpayment hardening.

-- ---------------------------------------------------------------------------
-- 1) Payments: tender / change columns
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists tendered_amount numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0;

alter table public.payments
  drop constraint if exists payments_tendered_nonneg;

alter table public.payments
  add constraint payments_tendered_nonneg
  check (tendered_amount is null or tendered_amount >= 0);

alter table public.payments
  drop constraint if exists payments_change_nonneg;

alter table public.payments
  add constraint payments_change_nonneg
  check (change_amount >= 0);

comment on column public.payments.tendered_amount is
  'Cash presented by customer. Null for non-cash. Not revenue.';
comment on column public.payments.change_amount is
  'Cash returned to customer (tendered - amount). Not a payment reversal.';

-- ---------------------------------------------------------------------------
-- 2) update_repair_job_details
-- ---------------------------------------------------------------------------

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

  -- Technicians may only edit jobs assigned to them (or unassigned intake they can work).
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
      'device_condition'
    ];
  elsif profile.role = 'cashier' then
    allowed_keys := array[
      'internal_notes', 'assigned_technician_id', 'priority',
      'estimated_completion_date', 'device_condition'
    ];
  else
    allowed_keys := array['diagnosis', 'technician_notes', 'device_condition'];
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
    'device_condition', job.device_condition
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

      -- Validate assignee shop access using their membership/role.
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

  after_data := jsonb_build_object(
    'diagnosis', new_diagnosis,
    'technician_notes', new_tech_notes,
    'internal_notes', new_internal_notes,
    'assigned_technician_id', new_assignee,
    'priority', new_priority,
    'estimated_completion_date', new_eta,
    'device_condition', new_device_condition
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

grant execute on function public.update_repair_job_details(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Repair photo metadata deletion (Storage object deleted by app first)
-- ---------------------------------------------------------------------------

create or replace function public.delete_repair_photo(p_photo_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  photo public.repair_photos;
  job public.repair_jobs;
  trusted_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  profile := public.require_role('owner', 'admin', 'cashier', 'technician');

  select * into photo
  from public.repair_photos
  where id = p_photo_id
  for update;

  if photo.id is null or photo.organization_id <> profile.organization_id then
    raise exception 'Repair photo not found' using errcode = 'P0001';
  end if;

  select * into job
  from public.repair_jobs
  where id = photo.repair_job_id;

  if job.id is null or job.organization_id <> profile.organization_id then
    raise exception 'Repair photo not found' using errcode = 'P0001';
  end if;

  if not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if profile.role = 'technician'
     and job.assigned_technician_id is not null
     and job.assigned_technician_id <> profile.id then
    raise exception 'Technicians may only delete photos on jobs assigned to them'
      using errcode = '42501';
  end if;

  trusted_path := photo.storage_path;

  delete from public.repair_photos where id = photo.id;

  perform public.write_audit_log(
    'repair.photo.delete',
    'repair_photos',
    photo.id,
    jsonb_build_object(
      'repair_job_id', photo.repair_job_id,
      'storage_path', trusted_path
    ),
    null
  );

  return trusted_path;
end;
$$;

grant execute on function public.delete_repair_photo(uuid) to authenticated;

-- Optional helper: return trusted path after authorization without deleting metadata.
-- Used when the app must delete Storage first, then finalize metadata deletion.
create or replace function public.authorize_repair_photo_deletion(p_photo_id uuid)
returns table (
  photo_id uuid,
  storage_path text,
  repair_job_id uuid,
  organization_id uuid,
  shop_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  photo public.repair_photos;
  job public.repair_jobs;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  profile := public.require_role('owner', 'admin', 'cashier', 'technician');

  select * into photo from public.repair_photos where id = p_photo_id;
  if photo.id is null or photo.organization_id <> profile.organization_id then
    raise exception 'Repair photo not found' using errcode = 'P0001';
  end if;

  select * into job from public.repair_jobs where id = photo.repair_job_id;
  if job.id is null or not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if profile.role = 'technician'
     and job.assigned_technician_id is not null
     and job.assigned_technician_id <> profile.id then
    raise exception 'Technicians may only delete photos on jobs assigned to them'
      using errcode = '42501';
  end if;

  photo_id := photo.id;
  storage_path := photo.storage_path;
  repair_job_id := photo.repair_job_id;
  organization_id := photo.organization_id;
  shop_id := job.shop_id;
  return next;
end;
$$;

grant execute on function public.authorize_repair_photo_deletion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Hardened record_payment
-- ---------------------------------------------------------------------------

create or replace function public.document_payable_total(
  p_reference_type public.payment_reference_type,
  p_reference_id uuid,
  p_organization_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  payable numeric(12,2);
begin
  if p_reference_type = 'sale' then
    select s.total into payable
    from public.sales s
    where s.id = p_reference_id
      and s.organization_id = p_organization_id
      and s.status in ('completed', 'partially_refunded');
  elsif p_reference_type = 'repair' then
    select j.total into payable
    from public.repair_jobs j
    where j.id = p_reference_id
      and j.organization_id = p_organization_id
      and j.status <> 'cancelled';
  elsif p_reference_type = 'purchase' then
    select pu.total into payable
    from public.purchases pu
    where pu.id = p_reference_id
      and pu.organization_id = p_organization_id
      and pu.status <> 'cancelled';
  else
    raise exception 'Invalid payment reference' using errcode = '22023';
  end if;

  return coalesce(payable, null);
end;
$$;

revoke execute on function public.document_payable_total(
  public.payment_reference_type, uuid, uuid
) from public, anon, authenticated;

create or replace function public.record_payment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  profile public.profiles;
  shop uuid;
  payment_id uuid;
  existing uuid;
  ref_type public.payment_reference_type;
  ref_id uuid;
  requested_shop uuid;
  method public.payment_method;
  requested_amount numeric(12,2);
  tendered numeric(12,2);
  change_amt numeric(12,2) := 0;
  payable numeric(12,2);
  already_paid numeric(12,2);
  outstanding numeric(12,2);
  recorded_amount numeric(12,2);
begin
  profile := public.require_role('owner', 'admin', 'cashier');
  requested_shop := nullif(p_payload->>'shop_id', '')::uuid;
  ref_type := (p_payload->>'reference_type')::public.payment_reference_type;
  ref_id := (p_payload->>'reference_id')::uuid;
  method := (p_payload->>'method')::public.payment_method;

  if nullif(p_payload->>'idempotency_key', '') is not null then
    select p.id into existing
    from public.payments p
    where p.idempotency_key = (p_payload->>'idempotency_key')::uuid
      and p.organization_id = profile.organization_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if ref_type = 'sale' then
    select s.shop_id into shop
    from public.sales s
    where s.id = ref_id and s.organization_id = profile.organization_id
    for update;
    if shop is null then
      raise exception 'Sale not found' using errcode = 'P0001';
    end if;
  elsif ref_type = 'repair' then
    select j.shop_id into shop
    from public.repair_jobs j
    where j.id = ref_id and j.organization_id = profile.organization_id
    for update;
    if shop is null then
      raise exception 'Repair job not found' using errcode = 'P0001';
    end if;
  elsif ref_type = 'purchase' then
    profile := public.require_role('owner', 'admin');
    select pu.shop_id into shop
    from public.purchases pu
    where pu.id = ref_id and pu.organization_id = profile.organization_id
    for update;
    if shop is null then
      raise exception 'Purchase not found' using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid payment reference' using errcode = '22023';
  end if;

  if requested_shop is not null and requested_shop is distinct from shop then
    raise exception 'Shop does not match payment reference' using errcode = '42501';
  end if;
  if not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  payable := public.document_payable_total(ref_type, ref_id, profile.organization_id);
  if payable is null then
    raise exception 'Payable document not found or not payable' using errcode = 'P0001';
  end if;

  already_paid := public.paid_total(ref_type, ref_id);
  outstanding := public.money_round(payable - already_paid);

  if outstanding <= 0 then
    raise exception 'Document is already fully paid' using errcode = 'P0001';
  end if;

  requested_amount := nullif(p_payload->>'amount', '')::numeric;
  tendered := nullif(p_payload->>'tendered_amount', '')::numeric;

  if method = 'cash' then
    if tendered is not null then
      if tendered <= 0 then
        raise exception 'Tendered amount must be greater than zero' using errcode = '22023';
      end if;
      -- Apply the lesser of requested amount (if provided), tendered, and outstanding.
      recorded_amount := public.money_round(
        least(
          coalesce(requested_amount, tendered),
          tendered,
          outstanding
        )
      );
      if recorded_amount <= 0 then
        raise exception 'Payment amount must be greater than zero' using errcode = '22023';
      end if;
      if tendered < recorded_amount then
        raise exception 'Tendered cash is less than payment amount' using errcode = '22023';
      end if;
      change_amt := public.money_round(tendered - recorded_amount);
    else
      if requested_amount is null or requested_amount <= 0 then
        raise exception 'Payment amount must be greater than zero' using errcode = '22023';
      end if;
      if requested_amount > outstanding then
        raise exception 'Payment exceeds outstanding balance' using errcode = 'P0001';
      end if;
      recorded_amount := public.money_round(requested_amount);
      tendered := recorded_amount;
      change_amt := 0;
    end if;
  else
    -- Non-cash: no tender/change; may not exceed outstanding.
    if tendered is not null then
      raise exception 'Tendered amount is only valid for cash payments'
        using errcode = '22023';
    end if;
    if requested_amount is null or requested_amount <= 0 then
      raise exception 'Payment amount must be greater than zero' using errcode = '22023';
    end if;
    if requested_amount > outstanding then
      raise exception 'Payment exceeds outstanding balance' using errcode = 'P0001';
    end if;
    recorded_amount := public.money_round(requested_amount);
    tendered := null;
    change_amt := 0;
  end if;

  insert into public.payments (
    organization_id, shop_id, reference_type, reference_id, method, entry_type,
    amount, tendered_amount, change_amount, notes, idempotency_key, received_by
  ) values (
    profile.organization_id, shop, ref_type, ref_id, method, 'receipt',
    recorded_amount, tendered, change_amt,
    p_payload->>'notes',
    nullif(p_payload->>'idempotency_key', '')::uuid,
    profile.id
  ) returning id into payment_id;

  return payment_id;
exception
  when unique_violation then
    if nullif(p_payload->>'idempotency_key', '') is not null then
      select p.id into existing
      from public.payments p
      where p.idempotency_key = (p_payload->>'idempotency_key')::uuid
        and p.organization_id = profile.organization_id;
      if existing is not null then
        return existing;
      end if;
    end if;
    raise;
end;
$$;

grant execute on function public.record_payment(jsonb) to authenticated;
