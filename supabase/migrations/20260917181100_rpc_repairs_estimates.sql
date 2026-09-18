-- Repair jobs, status machine, parts consumption, privileged cancel, and versioned estimates.

create or replace function public.repair_transition_allowed(
  p_from public.repair_status,
  p_to public.repair_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
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
  end;
$$;

create or replace function public.enqueue_notification(
  p_organization_id uuid,
  p_user_id uuid,
  p_event public.notification_event_type,
  p_title text,
  p_body text,
  p_entity_type text,
  p_entity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id uuid;
begin
  insert into public.notifications (
    organization_id, user_id, event_type, title, body, entity_type, entity_id
  ) values (
    p_organization_id, p_user_id, p_event, p_title, p_body, p_entity_type, p_entity_id
  ) returning id into notification_id;

  insert into public.notification_outbox (
    organization_id, notification_id, channel, payload
  ) values (
    p_organization_id, notification_id, 'in_app',
    jsonb_build_object('event_type', p_event, 'entity_id', p_entity_id)
  );
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
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_payload->>'reported_issue', ''))) = 0 then
    raise exception 'Reported issue is required' using errcode = '22023';
  end if;

  insert into public.repair_jobs (
    organization_id, shop_id, ticket_number, customer_id, device_id,
    reported_issue, device_condition, diagnosis, technician_notes, internal_notes,
    status, priority, assigned_technician_id, estimated_completion_date,
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
    jsonb_build_object('ticket', (select ticket_number from public.repair_jobs where id = job_id)));

  return job_id;
end;
$$;

create or replace function public.change_repair_status(
  p_repair_job_id uuid,
  p_new_status public.repair_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  job public.repair_jobs;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into job from public.repair_jobs where id = p_repair_job_id for update;
  if job.id is null or job.organization_id <> profile.organization_id then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if p_new_status = 'cancelled' then
    raise exception 'Use cancel_repair to cancel a job'
      using errcode = 'P0001';
  end if;
  if not public.repair_transition_allowed(job.status, p_new_status) then
    raise exception 'Invalid repair status transition from % to %', job.status, p_new_status
      using errcode = 'P0001';
  end if;

  update public.repair_jobs
     set status = p_new_status,
         completed_at = case when p_new_status = 'completed' then timezone('utc', now()) else completed_at end,
         delivered_at = case when p_new_status = 'delivered' then timezone('utc', now()) else delivered_at end,
         warranty_expires_at = case
           when p_new_status = 'completed' and warranty_duration_days > 0
             then (timezone('utc', now()))::date + warranty_duration_days
           else warranty_expires_at
         end
   where id = job.id;

  insert into public.repair_status_history (
    organization_id, repair_job_id, previous_status, new_status, changed_by, note
  ) values (
    profile.organization_id, job.id, job.status, p_new_status, profile.id, p_note
  );

  if p_new_status = 'completed' and job.warranty_duration_days > 0 then
    insert into public.warranties (
      organization_id, repair_job_id, start_date, end_date, status
    ) values (
      profile.organization_id, job.id,
      (timezone('utc', now()))::date,
      (timezone('utc', now()))::date + job.warranty_duration_days,
      'active'
    );
  end if;

  if p_new_status = 'waiting_for_customer_approval' then
    perform public.enqueue_notification(
      profile.organization_id, job.assigned_technician_id,
      'waiting_for_customer_approval',
      'Waiting for customer approval',
      'Repair ' || job.ticket_number || ' needs customer approval.',
      'repair_jobs', job.id
    );
  elsif p_new_status = 'ready_for_pickup' then
    perform public.enqueue_notification(
      profile.organization_id, job.assigned_technician_id,
      'repair_ready_for_pickup',
      'Ready for pickup',
      'Repair ' || job.ticket_number || ' is ready for pickup.',
      'repair_jobs', job.id
    );
  elsif p_new_status = 'completed' then
    perform public.enqueue_notification(
      profile.organization_id, job.assigned_technician_id,
      'repair_completed',
      'Repair completed',
      'Repair ' || job.ticket_number || ' is completed.',
      'repair_jobs', job.id
    );
  end if;
end;
$$;

create or replace function public.consume_repair_parts(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  job public.repair_jobs;
  item jsonb;
  product public.products;
  qty numeric;
  part_id uuid;
  cost_price numeric(12,2);
  reserved numeric(12,3);
  consumed numeric(12,3);
begin
  profile := public.require_role('owner', 'admin', 'technician');
  select * into job from public.repair_jobs where id = (p_payload->>'repair_job_id')::uuid for update;
  if job.id is null or job.organization_id <> profile.organization_id then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if job.status not in ('approved', 'waiting_for_parts', 'in_repair', 'testing') then
    raise exception 'Parts cannot be consumed in the current repair status'
      using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    select * into product
    from public.products
    where id = (item->>'product_id')::uuid
      and organization_id = profile.organization_id;
    qty := (item->>'quantity')::numeric;
    if product.id is null or qty is null or qty <= 0 then
      raise exception 'Invalid repair part' using errcode = '22023';
    end if;

    select rp.id, rp.quantity_reserved, rp.quantity_consumed
      into part_id, reserved, consumed
    from public.repair_parts rp
    where rp.repair_job_id = job.id
      and rp.product_id = product.id
    for update;

    if part_id is null then
      insert into public.repair_parts (
        organization_id, shop_id, repair_job_id, product_id,
        quantity_reserved, quantity_consumed, unit_price
      ) values (
        profile.organization_id, job.shop_id, job.id, product.id,
        0, qty, product.selling_price
      ) returning id into part_id;
    else
      if reserved > 0 and consumed + qty > reserved then
        raise exception 'Consumed quantity exceeds reserved quantity'
          using errcode = 'P0001';
      end if;
      update public.repair_parts
         set quantity_consumed = quantity_consumed + qty
       where id = part_id;
    end if;

    select pc.cost_price into cost_price from public.product_costs pc where pc.product_id = product.id;
    insert into public.repair_part_costs (repair_part_id, organization_id, unit_cost)
    values (part_id, profile.organization_id, coalesce(cost_price, 0))
    on conflict (repair_part_id) do update
      set unit_cost = excluded.unit_cost;

    if product.track_inventory then
      insert into public.inventory_movements (
        organization_id, shop_id, product_id, quantity_change, movement_type,
        reference_type, reference_id, created_by
      ) values (
        profile.organization_id, job.shop_id, product.id, -qty, 'repair_usage',
        'repair', job.id, profile.id
      );
    end if;
  end loop;
end;
$$;

create or replace function public.cancel_repair(
  p_repair_job_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  job public.repair_jobs;
  kind public.cancellation_kind;
  part public.repair_parts;
begin
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;

  select * into job from public.repair_jobs where id = p_repair_job_id for update;
  if job.id is null then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;

  if job.status in ('ready_for_pickup', 'completed', 'delivered') then
    profile := public.require_role('owner', 'admin');
    kind := 'exceptional';
  elsif job.status in ('received', 'diagnosing', 'waiting_for_customer_approval', 'approved', 'waiting_for_parts', 'in_repair', 'testing') then
    profile := public.require_role('owner', 'admin', 'cashier');
    kind := 'normal';
  else
    raise exception 'Repair job cannot be cancelled from status %', job.status
      using errcode = 'P0001';
  end if;

  if job.organization_id <> profile.organization_id or not public.has_shop_access(job.shop_id) then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;

  for part in
    select * from public.repair_parts
    where repair_job_id = job.id
      and quantity_consumed > 0
    for update
  loop
    insert into public.inventory_movements (
      organization_id, shop_id, product_id, quantity_change, movement_type,
      reference_type, reference_id, notes, created_by
    ) values (
      profile.organization_id, job.shop_id, part.product_id, part.quantity_consumed,
      'repair_return', 'repair', job.id, p_reason, profile.id
    );
  end loop;

  update public.warranties
     set status = 'voided'
   where repair_job_id = job.id
     and status in ('active', 'claimed');

  update public.repair_estimates
     set status = 'superseded',
         superseded_at = timezone('utc', now())
   where repair_job_id = job.id
     and status in ('draft', 'sent');

  update public.repair_jobs
     set status = 'cancelled',
         cancelled_at = timezone('utc', now()),
         cancelled_by = profile.id,
         cancellation_reason = p_reason,
         cancellation_kind = kind
   where id = job.id;

  insert into public.repair_status_history (
    organization_id, repair_job_id, previous_status, new_status, changed_by, note
  ) values (
    profile.organization_id, job.id, job.status, 'cancelled', profile.id, p_reason
  );

  perform public.write_audit_log(
    case when kind = 'exceptional' then 'repair.cancel.exceptional' else 'repair.cancel' end,
    'repair_jobs',
    job.id,
    jsonb_build_object('status', job.status),
    jsonb_build_object(
      'reason', p_reason,
      'kind', kind,
      'actor', profile.id,
      'at', timezone('utc', now())
    )
  );
end;
$$;

create or replace function public.recalc_estimate_totals(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate public.repair_estimates;
  subtotal numeric(12,2);
  tax_total numeric(12,2);
begin
  select * into estimate from public.repair_estimates where id = p_estimate_id;
  select coalesce(sum(line_total - tax_amount), 0), coalesce(sum(tax_amount), 0)
    into subtotal, tax_total
  from public.repair_estimate_items
  where estimate_id = p_estimate_id;

  update public.repair_estimates
     set subtotal = public.money_round(subtotal),
         tax_amount = public.money_round(tax_total),
         total = public.money_round(subtotal + tax_total - discount_amount)
   where id = p_estimate_id;
end;
$$;

create or replace function public.insert_estimate_items(
  p_organization_id uuid,
  p_shop_id uuid,
  p_estimate_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  line_type public.estimate_line_type;
  service public.repair_services;
  product public.products;
  description text;
  qty numeric;
  unit_price numeric(12,2);
  tax_row record;
  sort_order int := 0;
begin
  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    sort_order := sort_order + 1;
    line_type := (item->>'line_type')::public.estimate_line_type;
    qty := coalesce((item->>'quantity')::numeric, 1);
    description := coalesce(item->>'description', '');

    if line_type = 'labor' then
      select * into service from public.repair_services
      where id = (item->>'repair_service_id')::uuid and organization_id = p_organization_id;
      if service.id is null then
        raise exception 'Unknown repair service' using errcode = 'P0001';
      end if;
      unit_price := service.default_labor_charge;
      description := coalesce(nullif(description, ''), service.name);
      select * into tax_row from public.line_tax(p_shop_id, qty, unit_price, coalesce((item->>'discount_amount')::numeric, 0), true, null);
      insert into public.repair_estimate_items (
        organization_id, estimate_id, line_type, repair_service_id, description_snapshot,
        quantity, unit_price, discount_amount, tax_amount, line_total, sort_order
      ) values (
        p_organization_id, p_estimate_id, 'labor', service.id, description,
        qty, unit_price,
        public.money_round(coalesce((item->>'discount_amount')::numeric, 0)),
        tax_row.tax_amount, tax_row.line_total, sort_order
      );
    else
      select * into product from public.products
      where id = (item->>'product_id')::uuid and organization_id = p_organization_id;
      if product.id is null then
        raise exception 'Unknown product' using errcode = 'P0001';
      end if;
      unit_price := product.selling_price;
      description := coalesce(nullif(description, ''), product.name);
      select * into tax_row from public.line_tax(
        p_shop_id, qty, unit_price, coalesce((item->>'discount_amount')::numeric, 0),
        product.is_taxable, product.tax_rate_override
      );
      insert into public.repair_estimate_items (
        organization_id, estimate_id, line_type, product_id, description_snapshot,
        quantity, unit_price, discount_amount, tax_amount, line_total, sort_order
      ) values (
        p_organization_id, p_estimate_id, 'part', product.id, description,
        qty, unit_price,
        public.money_round(coalesce((item->>'discount_amount')::numeric, 0)),
        tax_row.tax_amount, tax_row.line_total, sort_order
      );
    end if;
  end loop;

  perform public.recalc_estimate_totals(p_estimate_id);
end;
$$;

create or replace function public.create_repair_estimate(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  job public.repair_jobs;
  estimate_id uuid;
  next_version int;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into job from public.repair_jobs where id = (p_payload->>'repair_job_id')::uuid for update;
  if job.id is null or job.organization_id <> profile.organization_id then
    raise exception 'Repair job not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(job.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.repair_estimates
  where repair_job_id = job.id;

  insert into public.repair_estimates (
    organization_id, shop_id, repair_job_id, estimate_number, version, status,
    notes, valid_until, created_by, discount_amount
  ) values (
    profile.organization_id, job.shop_id, job.id,
    public.next_document_number('estimate', job.shop_id),
    next_version, 'draft',
    p_payload->>'notes',
    nullif(p_payload->>'valid_until', '')::date,
    profile.id,
    public.money_round(coalesce((p_payload->>'discount_amount')::numeric, 0))
  ) returning id into estimate_id;

  perform public.insert_estimate_items(
    profile.organization_id, job.shop_id, estimate_id, p_payload->'items'
  );

  return estimate_id;
end;
$$;

create or replace function public.update_draft_estimate(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  estimate public.repair_estimates;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into estimate from public.repair_estimates where id = (p_payload->>'estimate_id')::uuid for update;
  if estimate.id is null or estimate.organization_id <> profile.organization_id then
    raise exception 'Estimate not found' using errcode = 'P0001';
  end if;
  if estimate.status <> 'draft' then
    raise exception 'Only draft estimates can be edited. Create a new version instead.'
      using errcode = 'P0001';
  end if;

  update public.repair_estimates
     set notes = coalesce(p_payload->>'notes', notes),
         valid_until = coalesce(nullif(p_payload->>'valid_until', '')::date, valid_until),
         discount_amount = coalesce(
           public.money_round((p_payload->>'discount_amount')::numeric),
           discount_amount
         )
   where id = estimate.id;

  if p_payload ? 'items' then
    delete from public.repair_estimate_items where estimate_id = estimate.id;
    perform public.insert_estimate_items(
      profile.organization_id, estimate.shop_id, estimate.id, p_payload->'items'
    );
  else
    perform public.recalc_estimate_totals(estimate.id);
  end if;

  return estimate.id;
end;
$$;

create or replace function public.revise_repair_estimate(p_estimate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  estimate public.repair_estimates;
  new_id uuid;
  next_version int;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into estimate from public.repair_estimates where id = p_estimate_id for update;
  if estimate.id is null or estimate.organization_id <> profile.organization_id then
    raise exception 'Estimate not found' using errcode = 'P0001';
  end if;
  if estimate.status = 'draft' then
    raise exception 'Edit the draft estimate instead of creating a new version'
      using errcode = 'P0001';
  end if;
  if estimate.status in ('rejected', 'expired', 'superseded') then
    raise exception 'This estimate cannot be revised'
      using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.repair_estimates
  where repair_job_id = estimate.repair_job_id;

  insert into public.repair_estimates (
    organization_id, shop_id, repair_job_id, estimate_number, version, status,
    notes, valid_until, created_by, discount_amount
  ) values (
    estimate.organization_id, estimate.shop_id, estimate.repair_job_id,
    public.next_document_number('estimate', estimate.shop_id),
    next_version, 'draft',
    estimate.notes, estimate.valid_until, profile.id, estimate.discount_amount
  ) returning id into new_id;

  insert into public.repair_estimate_items (
    organization_id, estimate_id, line_type, repair_service_id, product_id,
    description_snapshot, quantity, unit_price, discount_amount, tax_amount, line_total, sort_order
  )
  select
    organization_id, new_id, line_type, repair_service_id, product_id,
    description_snapshot, quantity, unit_price, discount_amount, tax_amount, line_total, sort_order
  from public.repair_estimate_items
  where estimate_id = estimate.id;

  perform public.recalc_estimate_totals(new_id);

  update public.repair_estimates
     set status = 'superseded',
         superseded_at = timezone('utc', now()),
         superseded_by_estimate_id = new_id
   where id = estimate.id;

  return new_id;
end;
$$;

create or replace function public.send_repair_estimate(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  estimate public.repair_estimates;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into estimate from public.repair_estimates where id = p_estimate_id for update;
  if estimate.id is null or estimate.organization_id <> profile.organization_id then
    raise exception 'Estimate not found' using errcode = 'P0001';
  end if;
  if estimate.status <> 'draft' then
    raise exception 'Only draft estimates can be sent' using errcode = 'P0001';
  end if;

  update public.repair_estimates
     set status = 'sent',
         sent_at = timezone('utc', now()),
         sent_by = profile.id
   where id = estimate.id;
end;
$$;

create or replace function public.approve_repair_estimate(
  p_estimate_id uuid,
  p_method public.approval_method default 'in_person'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  estimate public.repair_estimates;
  job public.repair_jobs;
  item public.repair_estimate_items;
  labor numeric(12,2) := 0;
  parts numeric(12,2) := 0;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into estimate from public.repair_estimates where id = p_estimate_id for update;
  if estimate.id is null or estimate.organization_id <> profile.organization_id then
    raise exception 'Estimate not found' using errcode = 'P0001';
  end if;
  if estimate.status not in ('draft', 'sent') then
    raise exception 'Estimate cannot be approved' using errcode = 'P0001';
  end if;

  select * into job from public.repair_jobs where id = estimate.repair_job_id for update;

  update public.repair_estimates
     set status = 'approved',
         customer_approved_at = timezone('utc', now()),
         approved_by = profile.id,
         approval_method = p_method
   where id = estimate.id;

  delete from public.repair_job_services where repair_job_id = job.id;
  delete from public.repair_parts where repair_job_id = job.id and quantity_consumed = 0;

  for item in
    select * from public.repair_estimate_items
    where estimate_id = estimate.id
    order by sort_order
  loop
    if item.line_type = 'labor' then
      insert into public.repair_job_services (
        organization_id, repair_job_id, repair_service_id, name_snapshot,
        labor_charge, quantity, warranty_days
      )
      select
        profile.organization_id, job.id, item.repair_service_id, item.description_snapshot,
        item.unit_price, item.quantity, coalesce(rs.default_warranty_days, 0)
      from public.repair_services rs
      where rs.id = item.repair_service_id;
      labor := public.money_round(labor + item.line_total);
    else
      insert into public.repair_parts (
        organization_id, shop_id, repair_job_id, product_id,
        quantity_reserved, quantity_consumed, unit_price
      ) values (
        profile.organization_id, job.shop_id, job.id, item.product_id,
        item.quantity, 0, item.unit_price
      );
      parts := public.money_round(parts + item.line_total);
    end if;
  end loop;

  update public.repair_jobs
     set labor_total = labor,
         parts_total = parts,
         discount_amount = estimate.discount_amount,
         tax_amount = estimate.tax_amount,
         total = estimate.total,
         estimated_cost = estimate.total,
         warranty_duration_days = coalesce((
           select max(warranty_days) from public.repair_job_services where repair_job_id = job.id
         ), warranty_duration_days),
         status = case
           when job.status in ('received', 'diagnosing', 'waiting_for_customer_approval') then 'approved'
           else job.status
         end
   where id = job.id;

  if job.status in ('received', 'diagnosing', 'waiting_for_customer_approval') then
    insert into public.repair_status_history (
      organization_id, repair_job_id, previous_status, new_status, changed_by, note
    ) values (
      profile.organization_id, job.id, job.status, 'approved', profile.id, 'Estimate approved'
    );
  end if;
end;
$$;

create or replace function public.reject_repair_estimate(
  p_estimate_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  estimate public.repair_estimates;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  select * into estimate from public.repair_estimates where id = p_estimate_id for update;
  if estimate.id is null or estimate.organization_id <> profile.organization_id then
    raise exception 'Estimate not found' using errcode = 'P0001';
  end if;
  if estimate.status not in ('draft', 'sent') then
    raise exception 'Estimate cannot be rejected' using errcode = 'P0001';
  end if;

  update public.repair_estimates
     set status = 'rejected',
         rejected_at = timezone('utc', now()),
         rejection_reason = p_reason
   where id = estimate.id;
end;
$$;

grant execute on function public.repair_transition_allowed(public.repair_status, public.repair_status) to authenticated;
grant execute on function public.create_repair_job(jsonb) to authenticated;
grant execute on function public.change_repair_status(uuid, public.repair_status, text) to authenticated;
grant execute on function public.consume_repair_parts(jsonb) to authenticated;
grant execute on function public.cancel_repair(uuid, text) to authenticated;
grant execute on function public.create_repair_estimate(jsonb) to authenticated;
grant execute on function public.update_draft_estimate(jsonb) to authenticated;
grant execute on function public.revise_repair_estimate(uuid) to authenticated;
grant execute on function public.send_repair_estimate(uuid) to authenticated;
grant execute on function public.approve_repair_estimate(uuid, public.approval_method) to authenticated;
grant execute on function public.reject_repair_estimate(uuid, text) to authenticated;
revoke execute on function public.enqueue_notification(uuid, uuid, public.notification_event_type, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.recalc_estimate_totals(uuid) from public, anon, authenticated;
revoke execute on function public.insert_estimate_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
