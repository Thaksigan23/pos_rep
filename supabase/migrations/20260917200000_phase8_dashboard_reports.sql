-- Phase 8: dashboard/report aggregates + warranty claim RPCs
-- Read-focused; preserves RLS/tenancy. No notification_outbox exposure.

create or replace function public.shop_local_day_bounds(
  p_shop_id uuid,
  p_date date default null
)
returns table (
  local_date date,
  start_at timestamptz,
  end_at timestamptz,
  timezone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tz text;
  d date;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  select coalesce(s.timezone, 'UTC') into tz
  from public.shop_settings s
  where s.shop_id = p_shop_id;

  if tz is null then
    tz := 'UTC';
  end if;

  d := coalesce(p_date, (timezone(tz, now()))::date);
  return query
  select
    d,
    (d::timestamp AT TIME ZONE tz),
    ((d + 1)::timestamp AT TIME ZONE tz),
    tz;
end;
$$;

create or replace function public.dashboard_summary(p_shop_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  bounds record;
  result jsonb := '{}'::jsonb;
  role public.app_role;
  sales_rev numeric(12,2) := 0;
  repair_collected numeric(12,2) := 0;
  expenses_total numeric(12,2) := 0;
  refunds_total numeric(12,2) := 0;
  sales_count integer := 0;
  collected numeric(12,2) := 0;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  role := profile.role;
  shop := coalesce(p_shop_id, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  select * into bounds from public.shop_local_day_bounds(shop, null);

  result := result || jsonb_build_object(
    'shop_id', shop,
    'local_date', bounds.local_date,
    'timezone', bounds.timezone,
    'repairs', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select rj.status::text as status, count(*)::int as cnt
        from public.repair_jobs rj
        where rj.shop_id = shop
          and rj.organization_id = profile.organization_id
          and rj.status not in ('cancelled', 'delivered')
        group by rj.status
      ) s
    ),
    'ready_for_pickup', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select rj.id, rj.ticket_number, rj.total, rj.updated_at,
               c.first_name, c.last_name
        from public.repair_jobs rj
        left join public.customers c on c.id = rj.customer_id
        where rj.shop_id = shop
          and rj.organization_id = profile.organization_id
          and rj.status = 'ready_for_pickup'
        order by rj.updated_at desc
        limit 10
      ) x
    ),
    'overdue_repairs', (
      select count(*)::int
      from public.repair_jobs rj
      where rj.shop_id = shop
        and rj.organization_id = profile.organization_id
        and rj.status not in ('completed', 'delivered', 'cancelled')
        and rj.estimated_completion_date is not null
        and rj.estimated_completion_date < bounds.local_date
    )
  );

  if role = 'technician' then
    result := result || jsonb_build_object(
      'assigned_jobs', (
        select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
        from (
          select rj.id, rj.ticket_number, rj.status, rj.priority,
                 rj.reported_issue, rj.updated_at
          from public.repair_jobs rj
          where rj.shop_id = shop
            and rj.organization_id = profile.organization_id
            and rj.assigned_technician_id = profile.id
            and rj.status not in ('completed', 'delivered', 'cancelled')
          order by
            case rj.priority
              when 'urgent' then 0
              when 'high' then 1
              when 'normal' then 2
              else 3
            end,
            rj.updated_at
          limit 20
        ) x
      )
    );
  end if;

  if role in ('owner', 'admin', 'cashier') then
    select
      coalesce(sum(s.total), 0),
      count(*)::int
    into sales_rev, sales_count
    from public.sales s
    where s.shop_id = shop
      and s.organization_id = profile.organization_id
      and s.status = 'completed'
      and s.completed_at >= bounds.start_at
      and s.completed_at < bounds.end_at;

    select coalesce(sum(p.amount), 0) into repair_collected
    from public.payments p
    where p.shop_id = shop
      and p.organization_id = profile.organization_id
      and p.reference_type = 'repair'
      and p.entry_type = 'receipt'
      and p.voided_at is null
      and p.created_at >= bounds.start_at
      and p.created_at < bounds.end_at;

    select coalesce(sum(p.amount), 0) into refunds_total
    from public.payments p
    where p.shop_id = shop
      and p.organization_id = profile.organization_id
      and p.entry_type = 'refund'
      and p.voided_at is null
      and p.created_at >= bounds.start_at
      and p.created_at < bounds.end_at;

    collected := public.money_round(sales_rev + repair_collected - refunds_total);

    result := result || jsonb_build_object(
      'today', jsonb_build_object(
        'sales_revenue', sales_rev,
        'sales_count', sales_count,
        'repair_collected', repair_collected,
        'refunds', refunds_total,
        'total_collected', collected
      ),
      'recent_sales', (
        select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
        from (
          select s.id, s.sale_number, s.total, s.completed_at, s.status
          from public.sales s
          where s.shop_id = shop
            and s.organization_id = profile.organization_id
            and s.status = 'completed'
          order by s.completed_at desc nulls last
          limit 8
        ) x
      ),
      'outstanding_repairs', (
        select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
        from (
          select rj.id, rj.ticket_number, rj.total,
                 public.paid_total('repair', rj.id) as paid,
                 public.money_round(
                   coalesce(rj.total, 0) - public.paid_total('repair', rj.id)
                 ) as outstanding
          from public.repair_jobs rj
          where rj.shop_id = shop
            and rj.organization_id = profile.organization_id
            and rj.status not in ('cancelled')
            and public.money_round(
              coalesce(rj.total, 0) - public.paid_total('repair', rj.id)
            ) > 0
          order by outstanding desc
          limit 10
        ) x
      )
    );
  end if;

  if role in ('owner', 'admin') then
    select coalesce(sum(e.amount), 0) into expenses_total
    from public.expenses e
    where e.shop_id = shop
      and e.organization_id = profile.organization_id
      and e.expense_date = bounds.local_date;

    result := result || jsonb_build_object(
      'today', coalesce(result->'today', '{}'::jsonb) || jsonb_build_object(
        'expenses', expenses_total,
        'net_cashflow', public.money_round(collected - expenses_total)
      ),
      'inventory', jsonb_build_object(
        'low_stock', (
          select count(*)::int
          from public.shop_product_inventory i
          where i.shop_id = shop
            and i.is_active = true
            and i.stock_status = 'low_stock'
        ),
        'out_of_stock', (
          select count(*)::int
          from public.shop_product_inventory i
          where i.shop_id = shop
            and i.is_active = true
            and i.stock_status = 'out_of_stock'
        ),
        'low_stock_items', (
          select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
          from (
            select i.product_id, i.name, i.sku, i.quantity, i.stock_status
            from public.shop_product_inventory i
            where i.shop_id = shop
              and i.is_active = true
              and i.stock_status in ('low_stock', 'out_of_stock')
            order by i.quantity asc nulls first, i.name
            limit 15
          ) x
        )
      )
    );
  end if;

  return result;
end;
$$;

create or replace function public.report_summary(
  p_shop_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  tz text;
  start_at timestamptz;
  end_at timestamptz;
  today_local date;
  sales_revenue numeric(12,2) := 0;
  sales_count integer := 0;
  sales_discount numeric(12,2) := 0;
  sales_tax numeric(12,2) := 0;
  refunds numeric(12,2) := 0;
  cogs numeric(12,2) := 0;
  expenses_total numeric(12,2) := 0;
  repair_billed numeric(12,2) := 0;
  repair_collected numeric(12,2) := 0;
  repair_completed integer := 0;
  cash_collected numeric(12,2) := 0;
  card_collected numeric(12,2) := 0;
  bank_collected numeric(12,2) := 0;
  other_collected numeric(12,2) := 0;
begin
  profile := public.require_role('owner', 'admin');
  shop := coalesce(p_shop_id, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  select coalesce(s.timezone, 'UTC') into tz
  from public.shop_settings s where s.shop_id = shop;
  if tz is null then tz := 'UTC'; end if;

  start_at := (p_from::timestamp AT TIME ZONE tz);
  end_at := ((p_to + 1)::timestamp AT TIME ZONE tz);
  today_local := (timezone(tz, now()))::date;

  select
    coalesce(sum(s.total), 0),
    count(*)::int,
    coalesce(sum(s.discount_amount), 0),
    coalesce(sum(s.tax_amount), 0)
  into sales_revenue, sales_count, sales_discount, sales_tax
  from public.sales s
  where s.shop_id = shop
    and s.organization_id = profile.organization_id
    and s.status = 'completed'
    and s.completed_at >= start_at
    and s.completed_at < end_at;

  select coalesce(sum(p.amount), 0) into refunds
  from public.payments p
  where p.shop_id = shop
    and p.organization_id = profile.organization_id
    and p.entry_type = 'refund'
    and p.voided_at is null
    and p.created_at >= start_at
    and p.created_at < end_at;

  select coalesce(sum(si.quantity * coalesce(sic.unit_cost, 0)), 0) into cogs
  from public.sales s
  join public.sale_items si on si.sale_id = s.id
  left join public.sale_item_costs sic on sic.sale_item_id = si.id
  where s.shop_id = shop
    and s.organization_id = profile.organization_id
    and s.status = 'completed'
    and s.completed_at >= start_at
    and s.completed_at < end_at;

  select coalesce(sum(e.amount), 0) into expenses_total
  from public.expenses e
  where e.shop_id = shop
    and e.organization_id = profile.organization_id
    and e.expense_date >= p_from
    and e.expense_date <= p_to;

  select
    coalesce(sum(rj.total), 0),
    count(*) filter (where rj.status in ('completed', 'delivered'))::int
  into repair_billed, repair_completed
  from public.repair_jobs rj
  where rj.shop_id = shop
    and rj.organization_id = profile.organization_id
    and rj.created_at >= start_at
    and rj.created_at < end_at
    and rj.status <> 'cancelled';

  select coalesce(sum(p.amount), 0) into repair_collected
  from public.payments p
  where p.shop_id = shop
    and p.organization_id = profile.organization_id
    and p.reference_type = 'repair'
    and p.entry_type = 'receipt'
    and p.voided_at is null
    and p.created_at >= start_at
    and p.created_at < end_at;

  select
    coalesce(sum(p.amount) filter (where p.method = 'cash'), 0),
    coalesce(sum(p.amount) filter (where p.method = 'card'), 0),
    coalesce(sum(p.amount) filter (where p.method = 'bank_transfer'), 0),
    coalesce(sum(p.amount) filter (where p.method = 'other'), 0)
  into cash_collected, card_collected, bank_collected, other_collected
  from public.payments p
  where p.shop_id = shop
    and p.organization_id = profile.organization_id
    and p.entry_type = 'receipt'
    and p.voided_at is null
    and p.created_at >= start_at
    and p.created_at < end_at;

  return jsonb_build_object(
    'shop_id', shop,
    'from', p_from,
    'to', p_to,
    'timezone', tz,
    'sales', jsonb_build_object(
      'revenue', sales_revenue,
      'count', sales_count,
      'average_ticket', case when sales_count > 0
        then public.money_round(sales_revenue / sales_count) else 0 end,
      'discounts', sales_discount,
      'tax', sales_tax,
      'refunds', refunds,
      'net_sales', public.money_round(sales_revenue - refunds),
      'cogs', cogs,
      'gross_profit', public.money_round(sales_revenue - cogs)
    ),
    'repairs', jsonb_build_object(
      'billed', repair_billed,
      'collected', repair_collected,
      'completed_count', repair_completed,
      'status_distribution', (
        select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        from (
          select rj.status::text as status, count(*)::int as cnt
          from public.repair_jobs rj
          where rj.shop_id = shop
            and rj.organization_id = profile.organization_id
            and rj.created_at >= start_at
            and rj.created_at < end_at
          group by rj.status
        ) s
      )
    ),
    'payments', jsonb_build_object(
      'cash', cash_collected,
      'card', card_collected,
      'bank_transfer', bank_collected,
      'other', other_collected,
      'refunds', refunds,
      'net_collected', public.money_round(
        cash_collected + card_collected + bank_collected + other_collected - refunds
      )
    ),
    'expenses', jsonb_build_object(
      'total', expenses_total,
      'by_category', (
        select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
        from (
          select ec.name as category, coalesce(sum(e.amount), 0) as total
          from public.expenses e
          join public.expense_categories ec on ec.id = e.category_id
          where e.shop_id = shop
            and e.organization_id = profile.organization_id
            and e.expense_date >= p_from
            and e.expense_date <= p_to
          group by ec.name
          order by total desc
        ) x
      )
    ),
    'inventory', jsonb_build_object(
      'low_stock', (
        select count(*)::int from public.shop_product_inventory i
        where i.shop_id = shop and i.is_active and i.stock_status = 'low_stock'
      ),
      'out_of_stock', (
        select count(*)::int from public.shop_product_inventory i
        where i.shop_id = shop and i.is_active and i.stock_status = 'out_of_stock'
      )
    ),
    'warranties', jsonb_build_object(
      'active', (
        select count(*)::int from public.warranties w
        join public.repair_jobs rj on rj.id = w.repair_job_id
        where w.organization_id = profile.organization_id
          and rj.shop_id = shop
          and w.status = 'active'
      ),
      'expiring_soon', (
        select count(*)::int from public.warranties w
        join public.repair_jobs rj on rj.id = w.repair_job_id
        where w.organization_id = profile.organization_id
          and rj.shop_id = shop
          and w.status = 'active'
          and w.end_date >= today_local
          and w.end_date <= today_local + 30
      ),
      'claims_opened', (
        select count(*)::int from public.warranty_claims wc
        join public.warranties w on w.id = wc.warranty_id
        join public.repair_jobs rj on rj.id = w.repair_job_id
        where wc.organization_id = profile.organization_id
          and rj.shop_id = shop
          and wc.claim_date >= p_from
          and wc.claim_date <= p_to
      )
    ),
    'sales_over_time', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select (timezone(tz, s.completed_at))::date as day,
               coalesce(sum(s.total), 0) as revenue,
               count(*)::int as count
        from public.sales s
        where s.shop_id = shop
          and s.organization_id = profile.organization_id
          and s.status = 'completed'
          and s.completed_at >= start_at
          and s.completed_at < end_at
        group by 1
        order by 1
      ) x
    ),
    'expenses_over_time', (
      select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
      from (
        select e.expense_date as day, coalesce(sum(e.amount), 0) as total
        from public.expenses e
        where e.shop_id = shop
          and e.organization_id = profile.organization_id
          and e.expense_date >= p_from
          and e.expense_date <= p_to
        group by 1
        order by 1
      ) x
    )
  );
end;
$$;

-- File a warranty claim (does not create a new repair)
create or replace function public.create_warranty_claim(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  warranty public.warranties;
  claim_id uuid;
  related_repair uuid;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');

  select * into warranty
  from public.warranties w
  where w.id = (p_payload->>'warranty_id')::uuid
  for update;

  if warranty.id is null or warranty.organization_id <> profile.organization_id then
    raise exception 'Warranty not found' using errcode = 'P0001';
  end if;
  if warranty.status not in ('active', 'claimed') then
    raise exception 'Warranty is not claimable' using errcode = 'P0001';
  end if;
  if warranty.end_date < (timezone('utc', now()))::date then
    raise exception 'Warranty has expired' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_payload->>'description', ''))) = 0 then
    raise exception 'Claim description is required' using errcode = '22023';
  end if;

  related_repair := nullif(p_payload->>'related_repair_job_id', '')::uuid;
  if related_repair is not null then
    if not exists (
      select 1 from public.repair_jobs rj
      where rj.id = related_repair
        and rj.organization_id = profile.organization_id
    ) then
      raise exception 'Related repair not found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.warranty_claims (
    organization_id, warranty_id, description, related_repair_job_id, created_by, status
  ) values (
    profile.organization_id,
    warranty.id,
    trim(p_payload->>'description'),
    related_repair,
    profile.id,
    'open'
  ) returning id into claim_id;

  update public.warranties
     set status = 'claimed'
   where id = warranty.id
     and status = 'active';

  perform public.write_audit_log(
    'warranty.claim',
    'warranty_claims',
    claim_id,
    null,
    jsonb_build_object('warranty_id', warranty.id)
  );

  return claim_id;
end;
$$;

-- Resolve / update a warranty claim
create or replace function public.resolve_warranty_claim(
  p_claim_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  claim public.warranty_claims;
  new_status text;
begin
  profile := public.require_role('owner', 'admin');

  select * into claim
  from public.warranty_claims
  where id = p_claim_id
  for update;

  if claim.id is null or claim.organization_id <> profile.organization_id then
    raise exception 'Claim not found' using errcode = 'P0001';
  end if;

  new_status := coalesce(nullif(p_payload->>'status', ''), claim.status);
  if new_status not in ('open', 'in_progress', 'resolved', 'rejected', 'closed') then
    raise exception 'Invalid claim status' using errcode = '22023';
  end if;

  update public.warranty_claims
     set status = new_status,
         resolution = coalesce(nullif(p_payload->>'resolution', ''), claim.resolution),
         related_repair_job_id = coalesce(
           nullif(p_payload->>'related_repair_job_id', '')::uuid,
           claim.related_repair_job_id
         )
   where id = claim.id;

  perform public.write_audit_log(
    'warranty.claim.resolve',
    'warranty_claims',
    claim.id,
    jsonb_build_object('status', claim.status),
    jsonb_build_object('status', new_status)
  );
end;
$$;

grant execute on function public.shop_local_day_bounds(uuid, date) to authenticated;
grant execute on function public.dashboard_summary(uuid) to authenticated;
grant execute on function public.report_summary(uuid, date, date) to authenticated;
grant execute on function public.create_warranty_claim(jsonb) to authenticated;
grant execute on function public.resolve_warranty_claim(uuid, jsonb) to authenticated;
