-- Allow bootstrap to insert the first shop/settings before the owner profile
-- has organization_id, while still stamping tenant id for normal writes.

create or replace function public.enforce_tenant_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
begin
  org_id := public.current_organization_id();
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if org_id is not null then
      new.organization_id := org_id;
    elsif new.organization_id is null then
      raise exception 'Authenticated profile is missing an organization'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'organization_id cannot be changed'
        using errcode = '42501';
    end if;
    new.organization_id := old.organization_id;
  end if;

  return new;
end;
$$;
