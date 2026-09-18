-- Read-only schema snapshot for Phase 3 verification. Service role only.

create or replace function public.phase3_schema_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Not allowed'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'tables', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'rls', c.relrowsecurity,
        'force_rls', c.relforcerowsecurity
      ) order by c.relname), '[]'::jsonb)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and c.relname not like 'pg_%'
    ),
    'functions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'security_definer', p.prosecdef
      ) order by p.proname), '[]'::jsonb)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ),
    'triggers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', t.tgname,
        'table', c.relname
      ) order by c.relname, t.tgname), '[]'::jsonb)
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and not t.tgisinternal
    ),
    'policies', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'table', tablename,
        'name', policyname,
        'cmd', cmd
      ) order by tablename, policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'public'
    ),
    'storage_buckets', (
      select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
      from storage.buckets
      where id in ('shop-assets', 'repair-photos')
    ),
    'storage_policies', (
      select coalesce(jsonb_agg(policyname order by policyname), '[]'::jsonb)
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and (
          policyname like 'shop_assets%'
          or policyname like 'repair_photos%'
        )
    ),
    'foreign_keys', (
      select count(*)::int
      from information_schema.table_constraints
      where constraint_schema = 'public'
        and constraint_type = 'FOREIGN KEY'
    ),
    'unique_constraints', (
      select count(*)::int
      from information_schema.table_constraints
      where constraint_schema = 'public'
        and constraint_type in ('UNIQUE', 'PRIMARY KEY')
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.phase3_schema_snapshot() from public, anon, authenticated;
grant execute on function public.phase3_schema_snapshot() to service_role;
