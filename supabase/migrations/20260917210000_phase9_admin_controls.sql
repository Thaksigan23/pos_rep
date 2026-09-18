-- Phase 9: business controls + administration RPCs
-- - cashier max line discount (server-enforced)
-- - refund restock disposition (restock | damaged | none)
-- - shop settings update (audited)
-- - staff update / membership (audited, role-safe)

alter table public.shop_settings
  add column if not exists cashier_max_line_discount_percent numeric(7,4)
    not null default 0.10
    check (cashier_max_line_discount_percent >= 0 and cashier_max_line_discount_percent <= 1);

comment on column public.shop_settings.cashier_max_line_discount_percent is
  'Max cashier line discount as fraction of (qty * unit_price). Owner/admin unrestricted. 0.10 = 10%.';

alter table public.refund_items
  add column if not exists restock_disposition text
    not null default 'restock'
    check (restock_disposition in ('restock', 'damaged', 'none'));

-- ---------------------------------------------------------------------------
-- Discount enforcement helper
-- ---------------------------------------------------------------------------
create or replace function public.assert_line_discount_allowed(
  p_shop_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_discount numeric
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role public.app_role;
  max_pct numeric(7,4);
  line_gross numeric(12,2);
  max_discount numeric(12,2);
begin
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Invalid discount' using errcode = '22023';
  end if;
  if coalesce(p_discount, 0) = 0 then
    return;
  end if;

  role := public.current_role();
  if role in ('owner', 'admin') then
    return;
  end if;

  if role is distinct from 'cashier' then
    raise exception 'Insufficient role for discounts' using errcode = '42501';
  end if;

  select ss.cashier_max_line_discount_percent into max_pct
  from public.shop_settings ss
  where ss.shop_id = p_shop_id;

  max_pct := coalesce(max_pct, 0);
  line_gross := public.money_round(coalesce(p_qty, 0) * coalesce(p_unit_price, 0));
  max_discount := public.money_round(line_gross * max_pct);

  if public.money_round(p_discount) > max_discount then
    raise exception 'Discount exceeds cashier maximum'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_line_discount_allowed(uuid, numeric, numeric, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_shop_settings
-- ---------------------------------------------------------------------------
create or replace function public.update_shop_settings(
  p_shop_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  before_row public.shop_settings;
  shop public.shops;
  tz text;
  currency text;
  locale text;
begin
  profile := public.require_role('owner', 'admin');
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  select * into shop from public.shops
  where id = p_shop_id and organization_id = profile.organization_id;
  if shop.id is null then
    raise exception 'Shop not found' using errcode = 'P0001';
  end if;

  select * into before_row from public.shop_settings where shop_id = p_shop_id for update;
  if before_row.shop_id is null then
    raise exception 'Shop settings not found' using errcode = 'P0001';
  end if;

  -- Shop identity fields live on shops
  if p_payload ? 'shop_name' then
    if char_length(trim(coalesce(p_payload->>'shop_name', ''))) = 0 then
      raise exception 'Shop name is required' using errcode = '22023';
    end if;
    update public.shops
       set name = trim(p_payload->>'shop_name'),
           phone = case when p_payload ? 'phone' then nullif(trim(p_payload->>'phone'), '') else phone end,
           email = case when p_payload ? 'email' then nullif(trim(p_payload->>'email'), '') else email end,
           address = case when p_payload ? 'address' then nullif(trim(p_payload->>'address'), '') else address end
     where id = p_shop_id;
  else
    update public.shops
       set phone = case when p_payload ? 'phone' then nullif(trim(p_payload->>'phone'), '') else phone end,
           email = case when p_payload ? 'email' then nullif(trim(p_payload->>'email'), '') else email end,
           address = case when p_payload ? 'address' then nullif(trim(p_payload->>'address'), '') else address end
     where id = p_shop_id
       and (p_payload ? 'phone' or p_payload ? 'email' or p_payload ? 'address');
  end if;

  tz := coalesce(nullif(trim(p_payload->>'timezone'), ''), before_row.timezone);
  currency := coalesce(nullif(upper(trim(p_payload->>'currency_code')), ''), before_row.currency_code);
  locale := coalesce(nullif(trim(p_payload->>'currency_locale'), ''), before_row.currency_locale);

  if char_length(currency) <> 3 then
    raise exception 'Invalid currency code' using errcode = '22023';
  end if;
  -- Basic IANA-ish timezone validation (must contain / or be UTC)
  if tz is distinct from 'UTC' and position('/' in tz) = 0 then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;

  update public.shop_settings
     set currency_code = currency,
         currency_locale = locale,
         timezone = tz,
         tax_enabled = coalesce((p_payload->>'tax_enabled')::boolean, tax_enabled),
         tax_rate = coalesce((p_payload->>'tax_rate')::numeric, tax_rate),
         tax_inclusive = coalesce((p_payload->>'tax_inclusive')::boolean, tax_inclusive),
         tax_label = coalesce(nullif(trim(p_payload->>'tax_label'), ''), tax_label),
         tax_id = case when p_payload ? 'tax_id' then nullif(trim(p_payload->>'tax_id'), '') else tax_id end,
         business_registration = case
           when p_payload ? 'business_registration'
             then nullif(trim(p_payload->>'business_registration'), '')
           else business_registration
         end,
         receipt_footer = case
           when p_payload ? 'receipt_footer'
             then nullif(trim(p_payload->>'receipt_footer'), '')
           else receipt_footer
         end,
         default_warranty_days = coalesce(
           (p_payload->>'default_warranty_days')::integer,
           default_warranty_days
         ),
         low_stock_threshold = coalesce(
           (p_payload->>'low_stock_threshold')::numeric,
           low_stock_threshold
         ),
         allow_negative_stock = coalesce(
           (p_payload->>'allow_negative_stock')::boolean,
           allow_negative_stock
         ),
         allow_partial_payments = coalesce(
           (p_payload->>'allow_partial_payments')::boolean,
           allow_partial_payments
         ),
         cashier_max_line_discount_percent = coalesce(
           (p_payload->>'cashier_max_line_discount_percent')::numeric,
           cashier_max_line_discount_percent
         ),
         invoice_prefix = coalesce(nullif(trim(p_payload->>'invoice_prefix'), ''), invoice_prefix),
         repair_prefix = coalesce(nullif(trim(p_payload->>'repair_prefix'), ''), repair_prefix),
         purchase_prefix = coalesce(nullif(trim(p_payload->>'purchase_prefix'), ''), purchase_prefix),
         customer_prefix = coalesce(nullif(trim(p_payload->>'customer_prefix'), ''), customer_prefix),
         estimate_prefix = coalesce(nullif(trim(p_payload->>'estimate_prefix'), ''), estimate_prefix),
         updated_at = timezone('utc', now())
   where shop_id = p_shop_id;

  if (select tax_rate from public.shop_settings where shop_id = p_shop_id) < 0
     or (select tax_rate from public.shop_settings where shop_id = p_shop_id) > 1 then
    raise exception 'Invalid tax rate' using errcode = '22023';
  end if;

  perform public.write_audit_log(
    'settings.update',
    'shop_settings',
    p_shop_id,
    jsonb_build_object(
      'currency_code', before_row.currency_code,
      'timezone', before_row.timezone,
      'tax_enabled', before_row.tax_enabled,
      'cashier_max_line_discount_percent', before_row.cashier_max_line_discount_percent
    ),
    p_payload
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- update_staff_profile (role / active / names) — not for creating auth users
-- ---------------------------------------------------------------------------
create or replace function public.update_staff_profile(
  p_user_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  target public.profiles;
  new_role public.app_role;
  new_active boolean;
  before_json jsonb;
begin
  profile := public.require_role('owner', 'admin');

  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null or target.organization_id is distinct from profile.organization_id then
    raise exception 'Staff member not found' using errcode = 'P0001';
  end if;

  before_json := jsonb_build_object(
    'role', target.role,
    'is_active', target.is_active,
    'first_name', target.first_name,
    'last_name', target.last_name,
    'default_shop_id', target.default_shop_id
  );

  new_role := coalesce(nullif(p_payload->>'role', '')::public.app_role, target.role);
  new_active := coalesce((p_payload->>'is_active')::boolean, target.is_active);

  -- Role change rules (mirrors protect_profile_privileges + RPC extras)
  if new_role is distinct from target.role then
    if p_user_id = profile.id then
      raise exception 'Users cannot change their own role' using errcode = '42501';
    end if;
    if new_role = 'owner' then
      raise exception 'Cannot assign owner role' using errcode = '42501';
    end if;
    if profile.role = 'admin' then
      if target.role = 'owner' or new_role = 'admin' then
        raise exception 'Admin cannot change this role' using errcode = '42501';
      end if;
    end if;
  end if;

  if new_active is distinct from target.is_active then
    if target.role = 'owner' and profile.role <> 'owner' then
      raise exception 'Only an owner can deactivate an owner' using errcode = '42501';
    end if;
    if target.role = 'owner' and not new_active then
      if (
        select count(*) from public.profiles p
        where p.organization_id = profile.organization_id
          and p.role = 'owner'
          and p.is_active
          and p.id <> target.id
      ) = 0 then
        raise exception 'Cannot deactivate the last active owner' using errcode = 'P0001';
      end if;
    end if;
    if p_user_id = profile.id and not new_active then
      raise exception 'Users cannot deactivate themselves' using errcode = '42501';
    end if;
  end if;

  update public.profiles
     set role = new_role,
         is_active = new_active,
         first_name = coalesce(nullif(trim(p_payload->>'first_name'), ''), first_name),
         last_name = coalesce(nullif(trim(p_payload->>'last_name'), ''), last_name),
         phone = case when p_payload ? 'phone' then nullif(trim(p_payload->>'phone'), '') else phone end,
         default_shop_id = coalesce(
           nullif(p_payload->>'default_shop_id', '')::uuid,
           default_shop_id
         ),
         updated_at = timezone('utc', now())
   where id = target.id;

  -- Validate default shop belongs to org and accessible
  if nullif(p_payload->>'default_shop_id', '') is not null then
    if not exists (
      select 1 from public.shops s
      where s.id = (p_payload->>'default_shop_id')::uuid
        and s.organization_id = profile.organization_id
    ) then
      raise exception 'Default shop not found' using errcode = 'P0001';
    end if;
  end if;

  perform public.write_audit_log(
    'staff.update',
    'profiles',
    target.id,
    before_json,
    jsonb_build_object(
      'role', new_role,
      'is_active', new_active,
      'payload', p_payload - 'phone'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- set_staff_shop_memberships — replace membership set for non-owner/admin roles
-- ---------------------------------------------------------------------------
create or replace function public.set_staff_shop_memberships(
  p_user_id uuid,
  p_shop_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  target public.profiles;
  shop_id uuid;
begin
  profile := public.require_role('owner', 'admin');

  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null or target.organization_id is distinct from profile.organization_id then
    raise exception 'Staff member not found' using errcode = 'P0001';
  end if;

  -- Owners/admins have implicit all-shop access; membership optional
  if p_shop_ids is null then
    raise exception 'Shop list is required' using errcode = '22023';
  end if;

  foreach shop_id in array p_shop_ids
  loop
    if not exists (
      select 1 from public.shops s
      where s.id = shop_id and s.organization_id = profile.organization_id
    ) then
      raise exception 'Shop not found' using errcode = 'P0001';
    end if;
  end loop;

  if target.role in ('cashier', 'technician') and coalesce(array_length(p_shop_ids, 1), 0) = 0 then
    raise exception 'Cashier/technician must retain at least one shop' using errcode = 'P0001';
  end if;

  delete from public.shop_members sm
  where sm.user_id = target.id
    and sm.organization_id = profile.organization_id
    and not (sm.shop_id = any (p_shop_ids));

  insert into public.shop_members (organization_id, shop_id, user_id)
  select profile.organization_id, x.shop_id, target.id
  from unnest(p_shop_ids) as x(shop_id)
  on conflict (shop_id, user_id) do nothing;

  if target.default_shop_id is null
     or target.default_shop_id <> all (p_shop_ids) then
    if coalesce(array_length(p_shop_ids, 1), 0) > 0 then
      update public.profiles
         set default_shop_id = p_shop_ids[1]
       where id = target.id;
    end if;
  end if;

  perform public.write_audit_log(
    'staff.memberships',
    'profiles',
    target.id,
    null,
    jsonb_build_object('shop_ids', to_jsonb(p_shop_ids))
  );
end;
$$;

grant execute on function public.update_shop_settings(uuid, jsonb) to authenticated;
grant execute on function public.update_staff_profile(uuid, jsonb) to authenticated;
grant execute on function public.set_staff_shop_memberships(uuid, uuid[]) to authenticated;
