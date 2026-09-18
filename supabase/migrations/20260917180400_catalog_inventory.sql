-- Catalog, cost isolation, per-shop stock, and immutable inventory ledger.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  parent_id uuid references public.categories (id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index suppliers_org_idx on public.suppliers (organization_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null check (char_length(trim(name)) > 0),
  category_id uuid references public.categories (id) on delete set null,
  brand_id uuid references public.brands (id) on delete set null,
  product_type public.product_type not null default 'accessory',
  description text,
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  tax_rate_override numeric(7,4) check (tax_rate_override is null or (tax_rate_override >= 0 and tax_rate_override <= 1)),
  is_taxable boolean not null default true,
  track_inventory boolean not null default true,
  min_stock numeric(12,3) not null default 0 check (min_stock >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  location_bin text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, sku)
);

create index products_org_barcode_idx on public.products (organization_id, barcode);
create index products_org_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_sku_trgm_idx on public.products using gin (sku extensions.gin_trgm_ops);
create index products_barcode_trgm_idx on public.products using gin (barcode extensions.gin_trgm_ops);

create table public.product_device_compatibility (
  product_id uuid not null references public.products (id) on delete cascade,
  device_model_id uuid not null references public.device_models (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (product_id, device_model_id)
);

create index product_compat_model_idx on public.product_device_compatibility (device_model_id);

create table public.product_costs (
  product_id uuid primary key references public.products (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.product_stocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  unique (shop_id, product_id)
);

create index product_stocks_product_idx on public.product_stocks (product_id);
create index product_stocks_org_idx on public.product_stocks (organization_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_change numeric(12,3) not null check (quantity_change <> 0),
  movement_type public.inventory_movement_type not null,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_reference_idx on public.inventory_movements (reference_type, reference_id);
create index inventory_movements_org_idx on public.inventory_movements (organization_id, created_at desc);

create table public.inventory_movement_costs (
  movement_id uuid primary key references public.inventory_movements (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0)
);

create or replace function public.ensure_stock_row(
  p_organization_id uuid,
  p_shop_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('mobilepos.allow_stock_write', 'true', true);
  insert into public.product_stocks (organization_id, shop_id, product_id, quantity)
  values (p_organization_id, p_shop_id, p_product_id, 0)
  on conflict (shop_id, product_id) do nothing;
end;
$$;

create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allow_negative boolean := false;
  new_qty numeric(12,3);
begin
  if new.quantity_change = 0 then
    raise exception 'Inventory movement quantity cannot be zero'
      using errcode = '22023';
  end if;

  perform set_config('mobilepos.allow_stock_write', 'true', true);
  perform public.ensure_stock_row(new.organization_id, new.shop_id, new.product_id);

  select coalesce(ss.allow_negative_stock, false)
    into allow_negative
  from public.shop_settings ss
  where ss.shop_id = new.shop_id;

  select ps.quantity + new.quantity_change
    into new_qty
  from public.product_stocks ps
  where ps.shop_id = new.shop_id
    and ps.product_id = new.product_id
  for update;

  if new_qty is null then
    raise exception 'Stock row could not be locked'
      using errcode = 'P0001';
  end if;

  if new_qty < 0 and not coalesce(allow_negative, false) then
    raise exception 'Insufficient stock'
      using errcode = 'P0001';
  end if;

  update public.product_stocks
     set quantity = new_qty
   where shop_id = new.shop_id
     and product_id = new.product_id;

  return new;
end;
$$;

create trigger inventory_movements_apply
  before insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

create trigger inventory_movements_forbid_update
  before update on public.inventory_movements
  for each row execute function public.forbid_mutation();

create trigger inventory_movements_forbid_delete
  before delete on public.inventory_movements
  for each row execute function public.forbid_mutation();

create trigger inventory_movement_costs_forbid_update
  before update on public.inventory_movement_costs
  for each row execute function public.forbid_mutation();

create trigger inventory_movement_costs_forbid_delete
  before delete on public.inventory_movement_costs
  for each row execute function public.forbid_mutation();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();
create trigger categories_enforce_tenant
  before insert or update on public.categories
  for each row execute function public.enforce_tenant_id();

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();
create trigger brands_enforce_tenant
  before insert or update on public.brands
  for each row execute function public.enforce_tenant_id();

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();
create trigger suppliers_enforce_tenant
  before insert or update on public.suppliers
  for each row execute function public.enforce_tenant_id();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();
create trigger products_enforce_tenant
  before insert or update on public.products
  for each row execute function public.enforce_tenant_id();

create trigger product_compat_enforce_tenant
  before insert or update on public.product_device_compatibility
  for each row execute function public.enforce_tenant_id();

create trigger product_costs_set_updated_at
  before update on public.product_costs
  for each row execute function public.set_updated_at();
create trigger product_costs_enforce_tenant
  before insert or update on public.product_costs
  for each row execute function public.enforce_tenant_id();

create trigger product_stocks_enforce_tenant
  before insert or update on public.product_stocks
  for each row execute function public.enforce_tenant_id();

create trigger inventory_movements_enforce_tenant
  before insert or update on public.inventory_movements
  for each row execute function public.enforce_tenant_id();

-- Direct stock edits are not part of the public API. The apply trigger
-- (SECURITY DEFINER) is the only supported writer.

create or replace function public.block_direct_stock_writes()
returns trigger
language plpgsql
as $$
begin
  if current_setting('mobilepos.allow_stock_write', true) = 'true' then
    return coalesce(new, old);
  end if;
  raise exception 'Direct product_stocks changes are not allowed. Use inventory movements.'
    using errcode = '42501';
end;
$$;

create trigger product_stocks_block_direct
  before insert or update or delete on public.product_stocks
  for each row execute function public.block_direct_stock_writes();
