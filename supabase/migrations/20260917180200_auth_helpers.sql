-- Session helpers used by RLS and RPCs. SECURITY DEFINER with fixed search_path.
-- organization_id and role are always read from profiles, never from the request body.

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
  limit 1;
$$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active;
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active;
$$;

create or replace function public.is_org_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = any (roles);
$$;

create or replace function public.has_shop_access(p_shop_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop_org uuid;
begin
  select * into profile from public.current_profile();
  if profile.id is null or profile.organization_id is null then
    return false;
  end if;

  select s.organization_id
    into shop_org
  from public.shops s
  where s.id = p_shop_id
    and s.is_active;

  if shop_org is null or shop_org <> profile.organization_id then
    return false;
  end if;

  if profile.role in ('owner', 'admin') then
    return true;
  end if;

  if exists (
    select 1
    from public.shop_members m
    where m.user_id = profile.id
      and m.shop_id = p_shop_id
  ) then
    return true;
  end if;

  -- v1 single-shop fallback when membership rows have not been assigned yet
  if not exists (
    select 1 from public.shop_members m where m.user_id = profile.id
  ) then
    return profile.default_shop_id = p_shop_id;
  end if;

  return false;
end;
$$;

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

  if org_id is null then
    raise exception 'Authenticated profile is missing an organization'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.organization_id := org_id;
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

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      if old.organization_id is not null then
        raise exception 'Users cannot change organization'
          using errcode = '42501';
      end if;
    end if;

    if new.role is distinct from old.role then
      if auth.uid() = old.id then
        raise exception 'Users cannot change their own role'
          using errcode = '42501';
      end if;

      actor_role := public.current_role();

      if actor_role is null then
        raise exception 'Not allowed to change roles'
          using errcode = '42501';
      end if;

      if actor_role = 'admin' then
        if old.role = 'owner' or new.role = 'owner' then
          raise exception 'Admin cannot change owner roles'
            using errcode = '42501';
        end if;
      elsif actor_role <> 'owner' then
        raise exception 'Not allowed to change roles'
          using errcode = '42501';
      end if;
    end if;

    if new.is_active is distinct from old.is_active
       and old.role = 'owner'
       and public.current_role() <> 'owner' then
      raise exception 'Only an owner can deactivate an owner'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

revoke all on function public.current_profile() from public;
revoke all on function public.current_organization_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.is_org_role(public.app_role[]) from public;
revoke all on function public.has_shop_access(uuid) from public;

grant execute on function public.current_profile() to authenticated;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_org_role(public.app_role[]) to authenticated;
grant execute on function public.has_shop_access(uuid) to authenticated;
