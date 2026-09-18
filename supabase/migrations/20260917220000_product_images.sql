-- Product catalog images (shop-scoped) using private shop-assets storage.
-- Extends Phase 9 catalog without changing POS/inventory transaction semantics.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint product_images_storage_path_unique unique (storage_path)
);

create index product_images_product_idx
  on public.product_images (product_id, sort_order, created_at);

create index product_images_shop_product_idx
  on public.product_images (shop_id, product_id);

create unique index product_images_one_primary_per_shop_product
  on public.product_images (shop_id, product_id)
  where is_primary;

comment on table public.product_images is
  'Shop-scoped product catalog images stored in private shop-assets bucket.';

-- ---------------------------------------------------------------------------
-- Tenant + relationship validation
-- ---------------------------------------------------------------------------

create or replace function public.enforce_product_image_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  product_org uuid;
  shop_org uuid;
  image_count integer;
begin
  if auth.uid() is not null then
    org_id := public.current_organization_id();
    if tg_op = 'INSERT' then
      if org_id is not null then
        new.organization_id := org_id;
      elsif new.organization_id is null then
        raise exception 'Authenticated profile is missing an organization'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.organization_id is distinct from old.organization_id then
        raise exception 'organization_id cannot be changed' using errcode = '42501';
      end if;
      new.organization_id := old.organization_id;
    end if;
  end if;

  select p.organization_id into product_org
  from public.products p
  where p.id = new.product_id;

  if product_org is null then
    raise exception 'Unknown product' using errcode = 'P0001';
  end if;
  if product_org is distinct from new.organization_id then
    raise exception 'Product does not belong to organization' using errcode = '42501';
  end if;

  select s.organization_id into shop_org
  from public.shops s
  where s.id = new.shop_id;

  if shop_org is null then
    raise exception 'Unknown shop' using errcode = 'P0001';
  end if;
  if shop_org is distinct from new.organization_id then
    raise exception 'Shop does not belong to organization' using errcode = '42501';
  end if;

  if auth.uid() is not null and not public.has_shop_access(new.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::int into image_count
    from public.product_images pi
    where pi.shop_id = new.shop_id
      and pi.product_id = new.product_id;
    if image_count >= 5 then
      raise exception 'Maximum of 5 images per product' using errcode = 'P0001';
    end if;
  end if;

  -- Path must follow {org}/{shop}/products/{product}/...
  if new.storage_path is null
     or split_part(new.storage_path, '/', 1) is distinct from new.organization_id::text
     or split_part(new.storage_path, '/', 2) is distinct from new.shop_id::text
     or split_part(new.storage_path, '/', 3) is distinct from 'products'
     or split_part(new.storage_path, '/', 4) is distinct from new.product_id::text then
    raise exception 'Invalid product image storage path' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger product_images_enforce_tenant
  before insert or update on public.product_images
  for each row execute function public.enforce_product_image_tenant();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.product_images enable row level security;
alter table public.product_images force row level security;

create policy product_images_select on public.product_images
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
  );

create policy product_images_insert on public.product_images
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
    and public.is_org_role('owner', 'admin')
  );

create policy product_images_update on public.product_images
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
    and public.is_org_role('owner', 'admin')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
    and public.is_org_role('owner', 'admin')
  );

-- No broad DELETE policy — use authorize + delete RPCs (same discipline as repair photos).

grant select, insert, update on public.product_images to authenticated;
grant select, insert, update, delete on public.product_images to service_role;

-- ---------------------------------------------------------------------------
-- Safe delete helpers
-- ---------------------------------------------------------------------------

create or replace function public.authorize_product_image_deletion(p_image_id uuid)
returns table (
  image_id uuid,
  storage_path text,
  product_id uuid,
  shop_id uuid,
  organization_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  img public.product_images;
begin
  profile := public.require_role('owner', 'admin');

  select * into img
  from public.product_images
  where id = p_image_id
  for update;

  if img.id is null or img.organization_id <> profile.organization_id then
    raise exception 'Product image not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(img.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  image_id := img.id;
  storage_path := img.storage_path;
  product_id := img.product_id;
  shop_id := img.shop_id;
  organization_id := img.organization_id;
  return next;
end;
$$;

create or replace function public.delete_product_image(p_image_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  img public.product_images;
  trusted_path text;
  was_primary boolean;
begin
  profile := public.require_role('owner', 'admin');

  select * into img
  from public.product_images
  where id = p_image_id
  for update;

  if img.id is null or img.organization_id <> profile.organization_id then
    raise exception 'Product image not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(img.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  trusted_path := img.storage_path;
  was_primary := img.is_primary;

  delete from public.product_images where id = img.id;

  if was_primary then
    update public.product_images
       set is_primary = true
     where id = (
       select pi.id
       from public.product_images pi
       where pi.shop_id = img.shop_id
         and pi.product_id = img.product_id
       order by pi.sort_order, pi.created_at
       limit 1
     );
  end if;

  perform public.write_audit_log(
    'product.image.delete',
    'product_images',
    img.id,
    jsonb_build_object(
      'product_id', img.product_id,
      'shop_id', img.shop_id,
      'storage_path', trusted_path
    ),
    null
  );

  return trusted_path;
end;
$$;

create or replace function public.set_primary_product_image(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  img public.product_images;
begin
  profile := public.require_role('owner', 'admin');

  select * into img
  from public.product_images
  where id = p_image_id
  for update;

  if img.id is null or img.organization_id <> profile.organization_id then
    raise exception 'Product image not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(img.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  update public.product_images
     set is_primary = false
   where shop_id = img.shop_id
     and product_id = img.product_id
     and is_primary
     and id is distinct from img.id;

  update public.product_images
     set is_primary = true
   where id = img.id;
end;
$$;

grant execute on function public.authorize_product_image_deletion(uuid) to authenticated;
grant execute on function public.delete_product_image(uuid) to authenticated;
grant execute on function public.set_primary_product_image(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory view: include primary image path (one join, no N+1)
-- ---------------------------------------------------------------------------

create or replace view public.shop_product_inventory
with (security_invoker = true) as
select
  p.id as product_id,
  p.organization_id,
  s.id as shop_id,
  p.sku,
  p.barcode,
  p.name,
  p.product_type,
  p.category_id,
  p.brand_id,
  p.selling_price,
  p.min_stock,
  p.reorder_level,
  p.location_bin,
  p.is_active,
  p.track_inventory,
  coalesce(ps.quantity, 0)::numeric(12, 3) as quantity,
  case
    when not p.track_inventory then 'not_tracked'
    when coalesce(ps.quantity, 0) <= 0 then 'out_of_stock'
    when coalesce(ps.quantity, 0) <= greatest(p.reorder_level, p.min_stock)
      then 'low_stock'
    else 'in_stock'
  end as stock_status,
  pi.storage_path as primary_image_path
from public.products p
inner join public.shops s
  on s.organization_id = p.organization_id
 and s.is_active = true
left join public.product_stocks ps
  on ps.product_id = p.id
 and ps.shop_id = s.id
left join public.product_images pi
  on pi.product_id = p.id
 and pi.shop_id = s.id
 and pi.is_primary = true;

comment on view public.shop_product_inventory is
  'Per-shop product stock with derived status and primary catalog image path. RLS via security_invoker.';

grant select on public.shop_product_inventory to authenticated;

-- ---------------------------------------------------------------------------
-- Shop logo helpers via update_shop_settings payload keys
-- (logo_path already exists on shop_settings)
-- ---------------------------------------------------------------------------

create or replace function public.set_shop_logo_path(
  p_shop_id uuid,
  p_logo_path text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop public.shops;
begin
  profile := public.require_role('owner', 'admin');

  select * into shop from public.shops where id = p_shop_id for update;
  if shop.id is null or shop.organization_id <> profile.organization_id then
    raise exception 'Shop not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if p_logo_path is not null then
    if split_part(p_logo_path, '/', 1) is distinct from shop.organization_id::text
       or split_part(p_logo_path, '/', 2) is distinct from shop.id::text
       or split_part(p_logo_path, '/', 3) is distinct from 'branding' then
      raise exception 'Invalid shop logo storage path' using errcode = '22023';
    end if;
  end if;

  update public.shop_settings
     set logo_path = p_logo_path,
         updated_at = timezone('utc', now())
   where shop_id = p_shop_id;

  perform public.write_audit_log(
    'settings.logo',
    'shop_settings',
    p_shop_id,
    null,
    jsonb_build_object('logo_path', p_logo_path)
  );
end;
$$;

grant execute on function public.set_shop_logo_path(uuid, text) to authenticated;
