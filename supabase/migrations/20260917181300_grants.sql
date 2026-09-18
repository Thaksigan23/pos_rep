-- Lock down default privileges. Authenticated sessions rely on RLS + RPCs.
-- Anon has no table or function access.

revoke all on schema public from anon;
grant usage on schema public to authenticated, service_role;

revoke all on all tables in schema public from anon, public;
revoke all on all sequences in schema public from anon, public;
revoke all on all routines in schema public from anon, public;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

-- Keep helper/RPC grants already issued to authenticated. Re-deny internals.
revoke execute on function public.seed_org_defaults(uuid) from public, anon, authenticated;
revoke execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.enqueue_notification(uuid, uuid, public.notification_event_type, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.recalc_estimate_totals(uuid) from public, anon, authenticated;
revoke execute on function public.insert_estimate_items(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.ensure_stock_row(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.apply_inventory_movement() from public, anon, authenticated;
revoke execute on function public.block_direct_stock_writes() from public, anon, authenticated;
revoke execute on function public.forbid_mutation() from public, anon, authenticated;
revoke execute on function public.forbid_payment_delete() from public, anon, authenticated;
revoke execute on function public.protect_approved_estimates() from public, anon, authenticated;
revoke execute on function public.protect_estimate_items() from public, anon, authenticated;
revoke execute on function public.protect_profile_privileges() from public, anon, authenticated;
revoke execute on function public.enforce_tenant_id() from public, anon, authenticated;
revoke execute on function public.assign_customer_number() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

alter default privileges in schema public
  revoke all on tables from anon, public;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  revoke execute on routines from public, anon;
