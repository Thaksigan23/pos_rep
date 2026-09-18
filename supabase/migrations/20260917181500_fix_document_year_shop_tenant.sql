-- Fix ambiguous year in document sequences and stamp tenant on shop writes.

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
  doc_year int := extract(year from timezone('utc', now()))::int;
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
  values (org_id, p_doc_type, doc_year, 0)
  on conflict (organization_id, doc_type, year) do nothing;

  update public.document_sequences as seq
     set last_value = seq.last_value + 1
   where seq.organization_id = org_id
     and seq.doc_type = p_doc_type
     and seq.year = doc_year
   returning seq.last_value into next_val;

  if next_val is null then
    raise exception 'Failed to allocate document number'
      using errcode = 'P0001';
  end if;

  return prefix || '-' || doc_year::text || '-' || lpad(next_val::text, 6, '0');
end;
$$;

grant execute on function public.next_document_number(public.document_type, uuid) to authenticated;

drop trigger if exists shops_enforce_tenant on public.shops;
create trigger shops_enforce_tenant
  before insert or update on public.shops
  for each row execute function public.enforce_tenant_id();

drop trigger if exists shop_settings_enforce_tenant on public.shop_settings;
create trigger shop_settings_enforce_tenant
  before insert or update on public.shop_settings
  for each row execute function public.enforce_tenant_id();

drop trigger if exists shop_members_enforce_tenant on public.shop_members;
create trigger shop_members_enforce_tenant
  before insert or update on public.shop_members
  for each row execute function public.enforce_tenant_id();
