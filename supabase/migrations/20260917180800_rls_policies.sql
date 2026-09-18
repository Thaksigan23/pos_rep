-- Row Level Security for every tenant table.
-- Direct writes to ledger/stock/payments-deletes are denied; RPCs are the mutation API.

create or replace function public.customer_visible(p_customer_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  role public.app_role;
  org uuid;
begin
  role := public.current_role();
  org := public.current_organization_id();
  if role is null or org is null then
    return false;
  end if;

  if role in ('owner', 'admin', 'cashier') then
    return exists (
      select 1 from public.customers c
      where c.id = p_customer_id
        and c.organization_id = org
    );
  end if;

  return exists (
    select 1
    from public.customers c
    join public.customer_devices d on d.customer_id = c.id
    join public.repair_jobs j on j.device_id = d.id
    where c.id = p_customer_id
      and c.organization_id = org
      and public.has_shop_access(j.shop_id)
  ) or exists (
    select 1 from public.customers c
    where c.id = p_customer_id
      and c.organization_id = org
      and c.is_walk_in
  );
end;
$$;

grant execute on function public.customer_visible(uuid) to authenticated;

-- Enable + force RLS
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'organizations','shops','shop_settings','profiles','shop_members','document_sequences',
      'customers','device_brands','device_models','customer_devices',
      'categories','brands','suppliers','products','product_device_compatibility',
      'product_costs','product_stocks','inventory_movements','inventory_movement_costs',
      'purchases','purchase_items','sales','sale_items','sale_item_costs',
      'payments','refunds','refund_items',
      'repair_services','repair_jobs','repair_status_history','repair_estimates',
      'repair_estimate_items','repair_job_services','repair_parts','repair_part_costs',
      'intake_check_definitions','device_intake_checks','repair_accessories','repair_photos',
      'warranties','warranty_claims','expense_categories','expenses',
      'notifications','notification_outbox','audit_logs'
    ])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Organizations
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = public.current_organization_id());

create policy organizations_update on public.organizations
  for update to authenticated
  using (id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Shops
create policy shops_select on public.shops
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy shops_insert on public.shops
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

create policy shops_update on public.shops
  for update to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Shop settings
create policy shop_settings_select on public.shop_settings
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
  );

create policy shop_settings_insert on public.shop_settings
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
    and public.has_shop_access(shop_id)
  );

create policy shop_settings_update on public.shop_settings
  for update to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or organization_id = public.current_organization_id()
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (
    id = auth.uid()
    or (
      organization_id = public.current_organization_id()
      and public.is_org_role('owner', 'admin')
    )
  )
  with check (
    id = auth.uid()
    or (
      organization_id = public.current_organization_id()
      and public.is_org_role('owner', 'admin')
    )
  );

-- Shop members
create policy shop_members_select on public.shop_members
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy shop_members_write on public.shop_members
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Document sequences: no client writes
create policy document_sequences_select on public.document_sequences
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

-- Customers
create policy customers_select on public.customers
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );

create policy customers_insert on public.customers
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );

create policy customers_update on public.customers
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier')
  )
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier')
  );

-- Device catalog
create policy device_brands_select on public.device_brands
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy device_brands_write on public.device_brands
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin', 'cashier'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin', 'cashier'));

create policy device_models_select on public.device_models
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy device_models_write on public.device_models
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin', 'cashier'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin', 'cashier'));

create policy customer_devices_select on public.customer_devices
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );
create policy customer_devices_insert on public.customer_devices
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
    and exists (
      select 1
      from public.customers c
      where c.id = customer_id
        and c.organization_id = public.current_organization_id()
    )
  );
create policy customer_devices_update on public.customer_devices
  for update to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  )
  with check (
    organization_id = public.current_organization_id()
  );

-- Catalog
create policy categories_select on public.categories
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy categories_write on public.categories
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy brands_select on public.brands
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy brands_write on public.brands
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy suppliers_select on public.suppliers
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy suppliers_write on public.suppliers
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy products_select on public.products
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy products_write on public.products
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy product_compat_select on public.product_device_compatibility
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy product_compat_write on public.product_device_compatibility
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Cost tables: owner/admin only
create policy product_costs_select on public.product_costs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy product_costs_write on public.product_costs
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy sale_item_costs_select on public.sale_item_costs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy inventory_movement_costs_select on public.inventory_movement_costs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy repair_part_costs_select on public.repair_part_costs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Stock: readable, never directly writable via RLS
create policy product_stocks_select on public.product_stocks
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
  );

create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

-- Purchases
create policy purchases_select on public.purchases
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy purchases_write on public.purchases
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy purchase_items_select on public.purchase_items
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy purchase_items_write on public.purchase_items
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

-- Sales / POS
create policy sales_select on public.sales
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier')
    and public.has_shop_access(shop_id)
  );

create policy sale_items_select on public.sale_items
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier')
  );

create policy payments_select on public.payments
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier')
    and public.has_shop_access(shop_id)
  );

create policy refunds_select on public.refunds
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

create policy refund_items_select on public.refund_items
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin')
  );

-- Repairs
create policy repair_services_select on public.repair_services
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy repair_services_write on public.repair_services
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy repair_jobs_select on public.repair_jobs
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
    and (
      public.is_org_role('owner', 'admin', 'cashier')
      or public.is_org_role('technician')
    )
  );

create policy repair_status_history_select on public.repair_status_history
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_estimates_select on public.repair_estimates
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.has_shop_access(shop_id)
  );

create policy repair_estimate_items_select on public.repair_estimate_items
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_job_services_select on public.repair_job_services
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_parts_select on public.repair_parts
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.has_shop_access(shop_id));

create policy intake_defs_select on public.intake_check_definitions
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy intake_defs_write on public.intake_check_definitions
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy intake_checks_select on public.device_intake_checks
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_accessories_select on public.repair_accessories
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_photos_select on public.repair_photos
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy repair_photos_insert on public.repair_photos
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );

-- Warranties / expenses / notifications / audit
create policy warranties_select on public.warranties
  for select to authenticated
  using (organization_id = public.current_organization_id());

create policy warranty_claims_select on public.warranty_claims
  for select to authenticated
  using (organization_id = public.current_organization_id());
create policy warranty_claims_insert on public.warranty_claims
  for insert to authenticated
  with check (
    organization_id = public.current_organization_id()
    and public.is_org_role('owner', 'admin', 'cashier', 'technician')
  );

create policy expense_categories_select on public.expense_categories
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy expense_categories_write on public.expense_categories
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy expenses_select on public.expenses
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
create policy expenses_write on public.expenses
  for all to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'))
  with check (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and (user_id is null or user_id = auth.uid())
  );
create policy notifications_update on public.notifications
  for update to authenticated
  using (organization_id = public.current_organization_id() and user_id = auth.uid())
  with check (organization_id = public.current_organization_id() and user_id = auth.uid());

create policy notification_outbox_select on public.notification_outbox
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (organization_id = public.current_organization_id() and public.is_org_role('owner', 'admin'));
