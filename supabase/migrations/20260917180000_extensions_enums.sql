-- Extensions, enums, and shared trigger/helpers used by every later migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.app_role as enum ('owner', 'admin', 'cashier', 'technician');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_type as enum (
    'phone',
    'accessory',
    'spare_part',
    'other',
    'service'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_movement_type as enum (
    'purchase',
    'sale',
    'sale_return',
    'customer_return',
    'repair_usage',
    'repair_return',
    'return_to_supplier',
    'adjustment',
    'damaged',
    'stock_count',
    'stock_count_correction'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum (
    'cash',
    'card',
    'bank_transfer',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_reference_type as enum (
    'sale',
    'repair',
    'purchase'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_entry_type as enum (
    'receipt',
    'refund'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sale_status as enum (
    'held',
    'completed',
    'cancelled',
    'refunded',
    'partially_refunded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.purchase_status as enum (
    'draft',
    'ordered',
    'partially_received',
    'received',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.repair_status as enum (
    'received',
    'diagnosing',
    'waiting_for_customer_approval',
    'approved',
    'waiting_for_parts',
    'in_repair',
    'testing',
    'ready_for_pickup',
    'completed',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.repair_priority as enum (
    'low',
    'normal',
    'high',
    'urgent'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.estimate_status as enum (
    'draft',
    'sent',
    'approved',
    'rejected',
    'expired',
    'superseded'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.estimate_line_type as enum ('labor', 'part');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.approval_method as enum (
    'in_person',
    'phone',
    'email',
    'portal',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.intake_check_result as enum (
    'working',
    'not_working',
    'not_tested',
    'not_applicable'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.device_type as enum (
    'phone',
    'tablet',
    'laptop',
    'watch',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.accessory_type as enum (
    'sim',
    'sim_tray',
    'charger',
    'cable',
    'case',
    'memory_card',
    'box',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.warranty_status as enum (
    'active',
    'expired',
    'voided',
    'claimed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cancellation_kind as enum ('normal', 'exceptional');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.document_type as enum (
    'repair',
    'invoice',
    'purchase',
    'customer',
    'estimate'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.notification_event_type as enum (
    'repair_ready_for_pickup',
    'repair_completed',
    'waiting_for_customer_approval',
    'low_stock',
    'warranty_expiring'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.outbox_channel as enum (
    'in_app',
    'sms',
    'email',
    'whatsapp'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.outbox_status as enum (
    'pending',
    'sent',
    'failed'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Shared utilities
-- ---------------------------------------------------------------------------

create or replace function public.money_round(amount numeric)
returns numeric(12,2)
language sql
immutable
as $$
  select round(coalesce(amount, 0), 2)::numeric(12,2);
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are immutable', tg_table_name
    using errcode = 'P0001';
end;
$$;
