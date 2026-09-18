-- Private storage buckets and tenant-scoped object policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'shop-assets',
    'shop-assets',
    false,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'repair-photos',
    'repair-photos',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_org_id(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

create or replace function public.storage_shop_id(p_name text)
returns uuid
language sql
stable
as $$
  select case
    when split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 2)::uuid
    else null
  end;
$$;

drop policy if exists shop_assets_select on storage.objects;
drop policy if exists shop_assets_insert on storage.objects;
drop policy if exists shop_assets_update on storage.objects;
drop policy if exists shop_assets_delete on storage.objects;
drop policy if exists repair_photos_select on storage.objects;
drop policy if exists repair_photos_insert on storage.objects;
drop policy if exists repair_photos_delete on storage.objects;

create policy shop_assets_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'shop-assets'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.has_shop_access(public.storage_shop_id(name))
  );

create policy shop_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'shop-assets'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.has_shop_access(public.storage_shop_id(name))
    and public.is_org_role('owner', 'admin')
  );

create policy shop_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'shop-assets'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  )
  with check (
    bucket_id = 'shop-assets'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

create policy shop_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'shop-assets'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

create policy repair_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'repair-photos'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.has_shop_access(public.storage_shop_id(name))
  );

create policy repair_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'repair-photos'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.has_shop_access(public.storage_shop_id(name))
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );

create policy repair_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'repair-photos'
    and public.storage_org_id(name) = public.current_organization_id()
    and public.has_shop_access(public.storage_shop_id(name))
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );
