-- Organizations, shops, settings, profiles, shop membership, document sequences.

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index shops_organization_id_idx on public.shops (organization_id);

create table public.shop_settings (
  shop_id uuid primary key references public.shops (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  logo_path text,
  currency_code text not null default 'LKR' check (char_length(currency_code) = 3),
  currency_locale text not null default 'en-LK',
  timezone text not null default 'Asia/Colombo',
  tax_enabled boolean not null default true,
  tax_rate numeric(7,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 1),
  tax_inclusive boolean not null default false,
  tax_label text not null default 'VAT',
  business_registration text,
  tax_id text,
  invoice_prefix text not null default 'INV',
  repair_prefix text not null default 'REP',
  purchase_prefix text not null default 'PO',
  customer_prefix text not null default 'CUS',
  estimate_prefix text not null default 'EST',
  receipt_footer text,
  default_warranty_days integer not null default 30 check (default_warranty_days >= 0),
  low_stock_threshold numeric(12,3) not null default 2 check (low_stock_threshold >= 0),
  allow_partial_payments boolean not null default true,
  allow_negative_stock boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete restrict,
  default_shop_id uuid references public.shops (id) on delete set null,
  role public.app_role not null default 'cashier',
  first_name text,
  last_name text,
  phone text,
  avatar_path text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_default_shop_id_idx on public.profiles (default_shop_id);

create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (shop_id, user_id)
);

create index shop_members_user_id_idx on public.shop_members (user_id);
create index shop_members_organization_id_idx on public.shop_members (organization_id);

create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  doc_type public.document_type not null,
  year integer not null check (year >= 2000),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (organization_id, doc_type, year)
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger shops_set_updated_at
  before update on public.shops
  for each row execute function public.set_updated_at();

create trigger shop_settings_set_updated_at
  before update on public.shop_settings
  for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
