-- Repair catalog, jobs, estimates, intake, parts, and status history.

create table public.repair_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  default_labor_charge numeric(12,2) not null default 0 check (default_labor_charge >= 0),
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  default_warranty_days integer not null default 0 check (default_warranty_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.repair_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  ticket_number text not null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  device_id uuid not null references public.customer_devices (id) on delete restrict,
  reported_issue text not null,
  device_condition text,
  diagnosis text,
  technician_notes text,
  internal_notes text,
  status public.repair_status not null default 'received',
  priority public.repair_priority not null default 'normal',
  assigned_technician_id uuid references public.profiles (id) on delete set null,
  estimated_completion_date date,
  estimated_cost numeric(12,2) not null default 0,
  labor_total numeric(12,2) not null default 0,
  parts_total numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  warranty_duration_days integer not null default 0 check (warranty_duration_days >= 0),
  warranty_expires_at date,
  received_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  cancellation_kind public.cancellation_kind,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, ticket_number)
);

create index repair_jobs_shop_status_idx on public.repair_jobs (shop_id, status);
create index repair_jobs_technician_idx on public.repair_jobs (assigned_technician_id, status);
create index repair_jobs_customer_idx on public.repair_jobs (customer_id, created_at desc);
create index repair_jobs_ticket_trgm_idx on public.repair_jobs using gin (ticket_number extensions.gin_trgm_ops);

create table public.repair_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  previous_status public.repair_status,
  new_status public.repair_status not null,
  changed_by uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index repair_status_history_job_idx
  on public.repair_status_history (repair_job_id, created_at);

create table public.repair_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  estimate_number text not null,
  version integer not null check (version >= 1),
  status public.estimate_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  valid_until date,
  sent_at timestamptz,
  sent_by uuid references public.profiles (id) on delete set null,
  customer_approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approval_method public.approval_method,
  rejected_at timestamptz,
  rejection_reason text,
  superseded_at timestamptz,
  superseded_by_estimate_id uuid references public.repair_estimates (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (repair_job_id, version),
  unique (organization_id, estimate_number)
);

create index repair_estimates_job_idx on public.repair_estimates (repair_job_id, version desc);

create table public.repair_estimate_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  estimate_id uuid not null references public.repair_estimates (id) on delete cascade,
  line_type public.estimate_line_type not null,
  repair_service_id uuid references public.repair_services (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  description_snapshot text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (line_type = 'labor' and repair_service_id is not null)
    or (line_type = 'part' and product_id is not null)
  )
);

create index repair_estimate_items_estimate_idx on public.repair_estimate_items (estimate_id, sort_order);

create table public.repair_job_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  repair_service_id uuid references public.repair_services (id) on delete restrict,
  name_snapshot text not null,
  labor_charge numeric(12,2) not null default 0 check (labor_charge >= 0),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  warranty_days integer not null default 0 check (warranty_days >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.repair_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_reserved numeric(12,3) not null default 0 check (quantity_reserved >= 0),
  quantity_consumed numeric(12,3) not null default 0 check (quantity_consumed >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  check (quantity_consumed <= quantity_reserved or quantity_reserved = 0)
);

create table public.repair_part_costs (
  repair_part_id uuid primary key references public.repair_parts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0)
);

create table public.intake_check_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (organization_id, code)
);

create table public.device_intake_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  check_definition_id uuid not null references public.intake_check_definitions (id) on delete restrict,
  result public.intake_check_result not null default 'not_tested',
  notes text,
  unique (repair_job_id, check_definition_id)
);

create table public.repair_accessories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  accessory_type public.accessory_type not null,
  present boolean not null default false,
  notes text,
  unique (repair_job_id, accessory_type)
);

create table public.repair_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create trigger repair_status_history_forbid_update
  before update on public.repair_status_history
  for each row execute function public.forbid_mutation();

create trigger repair_status_history_forbid_delete
  before delete on public.repair_status_history
  for each row execute function public.forbid_mutation();

create or replace function public.protect_approved_estimates()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'repair_estimates' then
    if old.status = 'approved' then
      if new.status not in ('approved', 'superseded') then
        raise exception 'Approved estimates cannot change status except to superseded'
          using errcode = 'P0001';
      end if;
      if new.subtotal is distinct from old.subtotal
         or new.discount_amount is distinct from old.discount_amount
         or new.tax_amount is distinct from old.tax_amount
         or new.total is distinct from old.total
         or new.repair_job_id is distinct from old.repair_job_id
         or new.version is distinct from old.version then
        raise exception 'Approved estimates are immutable'
          using errcode = 'P0001';
      end if;
    elsif old.status in ('rejected', 'expired', 'superseded') then
      raise exception 'This estimate can no longer be edited'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger repair_estimates_protect_approved
  before update on public.repair_estimates
  for each row execute function public.protect_approved_estimates();

create or replace function public.protect_estimate_items()
returns trigger
language plpgsql
as $$
declare
  estimate_row public.repair_estimates;
  estimate_id uuid;
begin
  estimate_id := coalesce(new.estimate_id, old.estimate_id);
  select * into estimate_row from public.repair_estimates where id = estimate_id;
  if estimate_row.status not in ('draft') then
    raise exception 'Estimate items can only be changed while the quote is draft'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger repair_estimate_items_protect
  before insert or update or delete on public.repair_estimate_items
  for each row execute function public.protect_estimate_items();

create trigger repair_services_set_updated_at
  before update on public.repair_services
  for each row execute function public.set_updated_at();
create trigger repair_services_enforce_tenant
  before insert or update on public.repair_services
  for each row execute function public.enforce_tenant_id();

create trigger repair_jobs_set_updated_at
  before update on public.repair_jobs
  for each row execute function public.set_updated_at();
create trigger repair_jobs_enforce_tenant
  before insert or update on public.repair_jobs
  for each row execute function public.enforce_tenant_id();

create trigger repair_status_history_enforce_tenant
  before insert or update on public.repair_status_history
  for each row execute function public.enforce_tenant_id();

create trigger repair_estimates_set_updated_at
  before update on public.repair_estimates
  for each row execute function public.set_updated_at();
create trigger repair_estimates_enforce_tenant
  before insert or update on public.repair_estimates
  for each row execute function public.enforce_tenant_id();
create trigger repair_estimate_items_enforce_tenant
  before insert or update on public.repair_estimate_items
  for each row execute function public.enforce_tenant_id();

create trigger repair_job_services_enforce_tenant
  before insert or update on public.repair_job_services
  for each row execute function public.enforce_tenant_id();
create trigger repair_parts_enforce_tenant
  before insert or update on public.repair_parts
  for each row execute function public.enforce_tenant_id();
create trigger repair_part_costs_enforce_tenant
  before insert or update on public.repair_part_costs
  for each row execute function public.enforce_tenant_id();
create trigger intake_check_definitions_enforce_tenant
  before insert or update on public.intake_check_definitions
  for each row execute function public.enforce_tenant_id();
create trigger device_intake_checks_enforce_tenant
  before insert or update on public.device_intake_checks
  for each row execute function public.enforce_tenant_id();
create trigger repair_accessories_enforce_tenant
  before insert or update on public.repair_accessories
  for each row execute function public.enforce_tenant_id();
create trigger repair_photos_enforce_tenant
  before insert or update on public.repair_photos
  for each row execute function public.enforce_tenant_id();
