-- Warranties, expenses, notifications, outbox, and immutable audit log.

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  repair_job_id uuid not null references public.repair_jobs (id) on delete cascade,
  repair_job_service_id uuid references public.repair_job_services (id) on delete set null,
  start_date date not null,
  end_date date not null,
  terms text,
  status public.warranty_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  check (end_date >= start_date)
);

create index warranties_job_idx on public.warranties (repair_job_id);
create index warranties_status_end_idx on public.warranties (status, end_date);

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  warranty_id uuid not null references public.warranties (id) on delete restrict,
  claim_date date not null default (timezone('utc', now()))::date,
  description text not null,
  resolution text,
  status text not null default 'open',
  related_repair_job_id uuid references public.repair_jobs (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  unique (organization_id, name)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete restrict,
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default (timezone('utc', now()))::date,
  description text,
  payment_method public.payment_method not null default 'cash',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index expenses_shop_date_idx on public.expenses (shop_id, expense_date desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  event_type public.notification_event_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  notification_id uuid references public.notifications (id) on delete set null,
  channel public.outbox_channel not null,
  destination text,
  payload jsonb not null default '{}'::jsonb,
  status public.outbox_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  performed_by uuid references public.profiles (id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create trigger audit_logs_forbid_update
  before update on public.audit_logs
  for each row execute function public.forbid_mutation();

create trigger audit_logs_forbid_delete
  before delete on public.audit_logs
  for each row execute function public.forbid_mutation();

create trigger warranties_enforce_tenant
  before insert or update on public.warranties
  for each row execute function public.enforce_tenant_id();
create trigger warranty_claims_enforce_tenant
  before insert or update on public.warranty_claims
  for each row execute function public.enforce_tenant_id();
create trigger expense_categories_enforce_tenant
  before insert or update on public.expense_categories
  for each row execute function public.enforce_tenant_id();
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();
create trigger expenses_enforce_tenant
  before insert or update on public.expenses
  for each row execute function public.enforce_tenant_id();
create trigger notifications_enforce_tenant
  before insert or update on public.notifications
  for each row execute function public.enforce_tenant_id();
create trigger notification_outbox_enforce_tenant
  before insert or update on public.notification_outbox
  for each row execute function public.enforce_tenant_id();
create trigger audit_logs_enforce_tenant
  before insert or update on public.audit_logs
  for each row execute function public.enforce_tenant_id();
