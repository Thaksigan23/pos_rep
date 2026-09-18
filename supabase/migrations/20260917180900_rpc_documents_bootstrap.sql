-- Document numbers, audit writer, money helpers, and organization bootstrap.

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := public.current_organization_id();
begin
  if org_id is null then
    return;
  end if;

  insert into public.audit_logs (
    organization_id, action, entity_type, entity_id, performed_by, before_data, after_data
  ) values (
    org_id, p_action, p_entity_type, p_entity_id, auth.uid(), p_before, p_after
  );
end;
$$;

create or replace function public.next_document_number(
  p_doc_type public.document_type,
  p_shop_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid := public.current_organization_id();
  shop uuid;
  prefix text;
  year int := extract(year from timezone('utc', now()))::int;
  next_val int;
begin
  if auth.uid() is null or org_id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  shop := coalesce(p_shop_id, (select default_shop_id from public.current_profile()));
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied'
      using errcode = '42501';
  end if;

  select case p_doc_type
    when 'invoice' then ss.invoice_prefix
    when 'repair' then ss.repair_prefix
    when 'purchase' then ss.purchase_prefix
    when 'customer' then ss.customer_prefix
    when 'estimate' then ss.estimate_prefix
  end
    into prefix
  from public.shop_settings ss
  where ss.shop_id = shop;

  prefix := coalesce(prefix, upper(p_doc_type::text));

  insert into public.document_sequences (organization_id, doc_type, year, last_value)
  values (org_id, p_doc_type, year, 0)
  on conflict (organization_id, doc_type, year) do nothing;

  update public.document_sequences
     set last_value = last_value + 1
   where organization_id = org_id
     and doc_type = p_doc_type
     and year = year
   returning last_value into next_val;

  return prefix || '-' || year::text || '-' || lpad(next_val::text, 6, '0');
end;
$$;

create or replace function public.line_tax(
  p_shop_id uuid,
  p_qty numeric,
  p_unit_price numeric,
  p_discount numeric,
  p_is_taxable boolean,
  p_tax_override numeric
)
returns table (
  net_amount numeric(12,2),
  tax_amount numeric(12,2),
  line_total numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.shop_settings;
  rate numeric(7,4);
  gross numeric(12,2);
  net numeric(12,2);
  tax numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  select * into settings from public.shop_settings where shop_id = p_shop_id;
  rate := 0;
  if coalesce(p_is_taxable, true) and coalesce(settings.tax_enabled, false) then
    rate := coalesce(p_tax_override, settings.tax_rate, 0);
  end if;

  gross := public.money_round(coalesce(p_qty, 0) * coalesce(p_unit_price, 0) - coalesce(p_discount, 0));
  if gross < 0 then
    gross := 0;
  end if;

  if coalesce(settings.tax_inclusive, false) and rate > 0 then
    net := public.money_round(gross / (1 + rate));
    tax := public.money_round(gross - net);
    return query select net, tax, gross;
  else
    tax := public.money_round(gross * rate);
    net := gross;
    return query select net, tax, public.money_round(net + tax);
  end if;
end;
$$;

create or replace function public.seed_org_defaults(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.intake_check_definitions (organization_id, code, label, sort_order)
  values
    (p_organization_id, 'screen', 'Screen', 10),
    (p_organization_id, 'touch', 'Touch', 20),
    (p_organization_id, 'front_camera', 'Front camera', 30),
    (p_organization_id, 'rear_camera', 'Rear camera', 40),
    (p_organization_id, 'speaker', 'Speaker', 50),
    (p_organization_id, 'earpiece', 'Earpiece', 60),
    (p_organization_id, 'microphone', 'Microphone', 70),
    (p_organization_id, 'charging', 'Charging', 80),
    (p_organization_id, 'battery', 'Battery', 90),
    (p_organization_id, 'wifi', 'Wi-Fi', 100),
    (p_organization_id, 'bluetooth', 'Bluetooth', 110),
    (p_organization_id, 'cellular', 'Cellular', 120),
    (p_organization_id, 'power_button', 'Power button', 130),
    (p_organization_id, 'volume_buttons', 'Volume buttons', 140),
    (p_organization_id, 'fingerprint', 'Fingerprint sensor', 150),
    (p_organization_id, 'face', 'Face recognition', 160),
    (p_organization_id, 'physical_damage', 'Physical damage', 170),
    (p_organization_id, 'water_damage', 'Water damage indicator', 180)
  on conflict (organization_id, code) do nothing;

  insert into public.expense_categories (organization_id, name)
  values
    (p_organization_id, 'Rent'),
    (p_organization_id, 'Electricity'),
    (p_organization_id, 'Internet'),
    (p_organization_id, 'Salaries'),
    (p_organization_id, 'Tools'),
    (p_organization_id, 'Transport'),
    (p_organization_id, 'Miscellaneous')
  on conflict (organization_id, name) do nothing;
end;
$$;

create or replace function public.bootstrap_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  shop_id uuid;
  slug text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id is not null) then
    raise exception 'Profile already belongs to an organization'
      using errcode = 'P0001';
  end if;

  slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'))
          || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.organizations (name, slug)
  values (trim(p_name), slug)
  returning id into org_id;

  insert into public.shops (organization_id, name)
  values (org_id, 'Main shop')
  returning id into shop_id;

  insert into public.shop_settings (shop_id, organization_id)
  values (shop_id, org_id);

  insert into public.profiles (
    id, organization_id, default_shop_id, role, first_name
  )
  values (
    auth.uid(), org_id, shop_id, 'owner', coalesce((select raw_user_meta_data->>'first_name' from auth.users where id = auth.uid()), 'Owner')
  )
  on conflict (id) do update
    set organization_id = excluded.organization_id,
        default_shop_id = excluded.default_shop_id,
        role = 'owner',
        is_active = true;

  insert into public.shop_members (organization_id, shop_id, user_id)
  values (org_id, shop_id, auth.uid());

  insert into public.customers (
    organization_id, shop_id, customer_number, first_name, last_name, is_walk_in
  ) values (
    org_id, shop_id, 'WALK-IN', 'Walk-in', 'Customer', true
  );

  perform public.seed_org_defaults(org_id);
  return org_id;
end;
$$;

create or replace function public.require_role(variadic roles public.app_role[])
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile public.profiles;
begin
  select * into profile from public.current_profile();
  if profile.id is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;
  if profile.organization_id is null then
    raise exception 'Profile is missing an organization'
      using errcode = '42501';
  end if;
  if not (profile.role = any (roles)) then
    raise exception 'Insufficient role'
      using errcode = '42501';
  end if;
  return profile;
end;
$$;

grant execute on function public.require_role(public.app_role[]) to authenticated;

create or replace function public.assign_customer_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_walk_in then
    new.customer_number := coalesce(nullif(trim(new.customer_number), ''), 'WALK-IN');
  elsif new.customer_number is null or trim(new.customer_number) = '' then
    new.customer_number := public.next_document_number('customer', new.shop_id);
  end if;
  return new;
end;
$$;

create trigger customers_assign_number
  before insert on public.customers
  for each row execute function public.assign_customer_number();

create or replace function public.create_customer(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  customer_id uuid;
begin
  profile := public.require_role('owner', 'admin', 'cashier', 'technician');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  insert into public.customers (
    organization_id, shop_id, first_name, last_name, phone, alternate_phone,
    email, address, notes
  ) values (
    profile.organization_id,
    shop,
    coalesce(p_payload->>'first_name', ''),
    coalesce(p_payload->>'last_name', ''),
    p_payload->>'phone',
    p_payload->>'alternate_phone',
    p_payload->>'email',
    p_payload->>'address',
    p_payload->>'notes'
  ) returning id into customer_id;

  return customer_id;
end;
$$;

create or replace function public.assign_staff_profile(
  p_user_id uuid,
  p_role public.app_role,
  p_shop_id uuid,
  p_first_name text default null,
  p_last_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
begin
  profile := public.require_role('owner', 'admin');
  if p_role = 'owner' then
    raise exception 'Owner role cannot be assigned this way'
      using errcode = '42501';
  end if;
  if profile.role = 'admin' and p_role = 'admin' then
    raise exception 'Admin cannot assign the admin role'
      using errcode = '42501';
  end if;
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'User does not exist' using errcode = 'P0001';
  end if;

  insert into public.profiles (
    id, organization_id, default_shop_id, role, first_name, last_name
  ) values (
    p_user_id, profile.organization_id, p_shop_id, p_role, p_first_name, p_last_name
  )
  on conflict (id) do update
    set default_shop_id = excluded.default_shop_id,
        role = excluded.role,
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        is_active = true
  where public.profiles.organization_id is null
     or public.profiles.organization_id = profile.organization_id;

  if not found then
    raise exception 'User already belongs to another organization'
      using errcode = 'P0001';
  end if;

  insert into public.shop_members (organization_id, shop_id, user_id)
  values (profile.organization_id, p_shop_id, p_user_id)
  on conflict (shop_id, user_id) do nothing;

  perform public.write_audit_log(
    'staff.assign',
    'profiles',
    p_user_id,
    null,
    jsonb_build_object('role', p_role, 'shop_id', p_shop_id)
  );

  return p_user_id;
end;
$$;

revoke execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.next_document_number(public.document_type, uuid) to authenticated;
grant execute on function public.line_tax(uuid, numeric, numeric, numeric, boolean, numeric) to authenticated;
grant execute on function public.bootstrap_organization(text) to authenticated;
grant execute on function public.create_customer(jsonb) to authenticated;
grant execute on function public.assign_staff_profile(uuid, public.app_role, uuid, text, text) to authenticated;
revoke execute on function public.seed_org_defaults(uuid) from public, anon, authenticated;
grant execute on function public.seed_org_defaults(uuid) to service_role;
