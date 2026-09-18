-- Customers and normalized device catalog.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid references public.shops (id) on delete set null,
  customer_number text not null,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  alternate_phone text,
  email text,
  address text,
  notes text,
  is_walk_in boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, customer_number)
);

create unique index customers_one_walk_in_per_org
  on public.customers (organization_id)
  where is_walk_in;

create index customers_org_phone_idx on public.customers (organization_id, phone);
create index customers_org_name_idx on public.customers (organization_id, last_name, first_name);
create index customers_phone_trgm_idx on public.customers using gin (phone extensions.gin_trgm_ops);
create index customers_name_trgm_idx on public.customers using gin (
  (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) extensions.gin_trgm_ops
);

create table public.device_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, name)
);

create table public.device_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  device_brand_id uuid not null references public.device_brands (id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  device_type public.device_type not null default 'phone',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (device_brand_id, name)
);

create index device_models_org_idx on public.device_models (organization_id);
create index device_models_brand_idx on public.device_models (device_brand_id);

create table public.customer_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  device_model_id uuid references public.device_models (id) on delete set null,
  device_type public.device_type not null default 'phone',
  model_label text,
  color text,
  imei text,
  serial_number text,
  storage_capacity text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index customer_devices_customer_idx on public.customer_devices (customer_id);
create index customer_devices_org_imei_idx on public.customer_devices (organization_id, imei);
create index customer_devices_org_serial_idx on public.customer_devices (organization_id, serial_number);
create index customer_devices_imei_trgm_idx on public.customer_devices using gin (imei extensions.gin_trgm_ops);
create index customer_devices_serial_trgm_idx on public.customer_devices using gin (serial_number extensions.gin_trgm_ops);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create trigger customers_enforce_tenant
  before insert or update on public.customers
  for each row execute function public.enforce_tenant_id();

create trigger device_brands_set_updated_at
  before update on public.device_brands
  for each row execute function public.set_updated_at();

create trigger device_brands_enforce_tenant
  before insert or update on public.device_brands
  for each row execute function public.enforce_tenant_id();

create trigger device_models_set_updated_at
  before update on public.device_models
  for each row execute function public.set_updated_at();

create trigger device_models_enforce_tenant
  before insert or update on public.device_models
  for each row execute function public.enforce_tenant_id();

create trigger customer_devices_set_updated_at
  before update on public.customer_devices
  for each row execute function public.set_updated_at();

create trigger customer_devices_enforce_tenant
  before insert or update on public.customer_devices
  for each row execute function public.enforce_tenant_id();
