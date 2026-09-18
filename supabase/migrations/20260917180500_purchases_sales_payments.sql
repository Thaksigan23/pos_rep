-- Purchases, POS sales, independent payments, and refunds.

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  purchase_number text not null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  status public.purchase_status not null default 'draft',
  order_date date not null default (timezone('utc', now()))::date,
  received_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, purchase_number)
);

create index purchases_supplier_idx on public.purchases (supplier_id, created_at desc);
create index purchases_shop_idx on public.purchases (shop_id, created_at desc);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_ordered numeric(12,3) not null check (quantity_ordered > 0),
  quantity_received numeric(12,3) not null default 0 check (quantity_received >= 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  tax_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  sale_number text,
  customer_id uuid references public.customers (id) on delete set null,
  status public.sale_status not null default 'held',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  notes text,
  idempotency_key uuid unique,
  held_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, sale_number)
);

create index sales_shop_created_idx on public.sales (shop_id, created_at desc);
create index sales_customer_idx on public.sales (customer_id, created_at desc);
create index sales_number_trgm_idx on public.sales using gin (sale_number extensions.gin_trgm_ops);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  description_snapshot text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index sale_items_sale_idx on public.sale_items (sale_id);

create table public.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  reference_type public.payment_reference_type not null,
  reference_id uuid not null,
  method public.payment_method not null,
  entry_type public.payment_entry_type not null default 'receipt',
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  idempotency_key uuid unique,
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index payments_reference_idx on public.payments (reference_type, reference_id, created_at);
create index payments_org_idx on public.payments (organization_id, created_at desc);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  sale_id uuid not null references public.sales (id) on delete restrict,
  reason text not null check (char_length(trim(reason)) > 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.refund_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  refund_id uuid not null references public.refunds (id) on delete cascade,
  sale_item_id uuid not null references public.sale_items (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create trigger purchases_set_updated_at
  before update on public.purchases
  for each row execute function public.set_updated_at();
create trigger purchases_enforce_tenant
  before insert or update on public.purchases
  for each row execute function public.enforce_tenant_id();
create trigger purchase_items_enforce_tenant
  before insert or update on public.purchase_items
  for each row execute function public.enforce_tenant_id();

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();
create trigger sales_enforce_tenant
  before insert or update on public.sales
  for each row execute function public.enforce_tenant_id();
create trigger sale_items_enforce_tenant
  before insert or update on public.sale_items
  for each row execute function public.enforce_tenant_id();
create trigger sale_item_costs_enforce_tenant
  before insert or update on public.sale_item_costs
  for each row execute function public.enforce_tenant_id();

create trigger payments_enforce_tenant
  before insert or update on public.payments
  for each row execute function public.enforce_tenant_id();

create trigger refunds_enforce_tenant
  before insert or update on public.refunds
  for each row execute function public.enforce_tenant_id();
create trigger refund_items_enforce_tenant
  before insert or update on public.refund_items
  for each row execute function public.enforce_tenant_id();

create or replace function public.forbid_payment_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Payments cannot be deleted. Void or refund instead.'
    using errcode = 'P0001';
end;
$$;

create trigger payments_forbid_delete
  before delete on public.payments
  for each row execute function public.forbid_payment_delete();
