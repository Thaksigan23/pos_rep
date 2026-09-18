-- Atomic inventory, checkout, receiving, payments, and refunds.

create or replace function public.paid_total(
  p_reference_type public.payment_reference_type,
  p_reference_id uuid
)
returns numeric(12,2)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  org uuid := public.current_organization_id();
  total numeric(12,2);
begin
  if auth.uid() is null or org is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_org_role('owner', 'admin', 'cashier') then
    raise exception 'Insufficient role' using errcode = '42501';
  end if;

  select coalesce(sum(
    case
      when p.entry_type = 'receipt' then p.amount
      else -p.amount
    end
  ), 0)::numeric(12,2)
    into total
  from public.payments p
  where p.reference_type = p_reference_type
    and p.reference_id = p_reference_id
    and p.organization_id = org
    and p.voided_at is null;

  return total;
end;
$$;

grant execute on function public.paid_total(public.payment_reference_type, uuid) to authenticated;

create or replace function public.adjust_inventory(
  p_shop_id uuid,
  p_product_id uuid,
  p_quantity_change numeric,
  p_movement_type public.inventory_movement_type,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  movement_id uuid;
begin
  profile := public.require_role('owner', 'admin');
  if not public.has_shop_access(p_shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if p_movement_type not in ('adjustment', 'damaged', 'stock_count', 'stock_count_correction') then
    raise exception 'Invalid adjustment movement type' using errcode = '22023';
  end if;
  if p_quantity_change = 0 then
    raise exception 'Quantity change cannot be zero' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = p_product_id
      and p.organization_id = profile.organization_id
  ) then
    raise exception 'Unknown product' using errcode = 'P0001';
  end if;

  insert into public.inventory_movements (
    organization_id, shop_id, product_id, quantity_change, movement_type,
    reference_type, notes, created_by
  ) values (
    profile.organization_id, p_shop_id, p_product_id, p_quantity_change, p_movement_type,
    'adjustment', p_notes, profile.id
  ) returning id into movement_id;

  perform public.write_audit_log(
    'inventory.adjust',
    'inventory_movements',
    movement_id,
    null,
    jsonb_build_object(
      'product_id', p_product_id,
      'quantity_change', p_quantity_change,
      'movement_type', p_movement_type
    )
  );
  return movement_id;
end;
$$;

create or replace function public.create_purchase(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  purchase_id uuid;
  item jsonb;
  line_total numeric(12,2);
  subtotal numeric(12,2) := 0;
begin
  profile := public.require_role('owner', 'admin');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.suppliers s
    where s.id = (p_payload->>'supplier_id')::uuid
      and s.organization_id = profile.organization_id
  ) then
    raise exception 'Unknown supplier' using errcode = 'P0001';
  end if;

  insert into public.purchases (
    organization_id, shop_id, purchase_number, supplier_id, status, notes, created_by
  ) values (
    profile.organization_id,
    shop,
    public.next_document_number('purchase', shop),
    (p_payload->>'supplier_id')::uuid,
    'ordered',
    p_payload->>'notes',
    profile.id
  ) returning id into purchase_id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    if not exists (
      select 1 from public.products p
      where p.id = (item->>'product_id')::uuid
        and p.organization_id = profile.organization_id
    ) then
      raise exception 'Unknown product' using errcode = 'P0001';
    end if;
    line_total := public.money_round(
      (item->>'quantity_ordered')::numeric * (item->>'unit_cost')::numeric
    );
    insert into public.purchase_items (
      organization_id, purchase_id, product_id, quantity_ordered, unit_cost, line_total
    ) values (
      profile.organization_id,
      purchase_id,
      (item->>'product_id')::uuid,
      (item->>'quantity_ordered')::numeric,
      public.money_round((item->>'unit_cost')::numeric),
      line_total
    );
    subtotal := public.money_round(subtotal + line_total);
  end loop;

  update public.purchases
     set subtotal = subtotal,
         total = subtotal
   where id = purchase_id;

  return purchase_id;
end;
$$;

create or replace function public.receive_purchase(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  purchase public.purchases;
  item jsonb;
  purchase_item public.purchase_items;
  qty numeric;
  remaining numeric;
  fully_received boolean;
  movement_id uuid;
begin
  profile := public.require_role('owner', 'admin');
  select * into purchase
  from public.purchases
  where id = (p_payload->>'purchase_id')::uuid
  for update;

  if purchase.id is null or purchase.organization_id <> profile.organization_id then
    raise exception 'Purchase not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(purchase.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if purchase.status in ('cancelled', 'received') then
    raise exception 'Purchase cannot be received' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    select * into purchase_item
    from public.purchase_items
    where id = (item->>'purchase_item_id')::uuid
      and purchase_id = purchase.id
    for update;

    qty := (item->>'quantity')::numeric;
    if qty is null or qty <= 0 then
      raise exception 'Invalid receive quantity' using errcode = '22023';
    end if;

    remaining := purchase_item.quantity_ordered - purchase_item.quantity_received;
    if qty > remaining then
      raise exception 'Cannot receive more than ordered' using errcode = 'P0001';
    end if;

    insert into public.inventory_movements (
      organization_id, shop_id, product_id, quantity_change, movement_type,
      reference_type, reference_id, created_by
    ) values (
      profile.organization_id, purchase.shop_id, purchase_item.product_id, qty, 'purchase',
      'purchase', purchase.id, profile.id
    ) returning id into movement_id;

    insert into public.inventory_movement_costs (movement_id, organization_id, unit_cost)
    values (movement_id, profile.organization_id, purchase_item.unit_cost);

    insert into public.product_costs (product_id, organization_id, cost_price, updated_by)
    values (purchase_item.product_id, profile.organization_id, purchase_item.unit_cost, profile.id)
    on conflict (product_id) do update
      set cost_price = excluded.cost_price,
          updated_by = excluded.updated_by,
          updated_at = timezone('utc', now());

    update public.purchase_items
       set quantity_received = quantity_received + qty
     where id = purchase_item.id;
  end loop;

  select bool_and(pi.quantity_received >= pi.quantity_ordered)
    into fully_received
  from public.purchase_items pi
  where pi.purchase_id = purchase.id;

  update public.purchases
     set status = case when fully_received then 'received' else 'partially_received' end,
         received_at = case when fully_received then timezone('utc', now()) else received_at end
   where id = purchase.id;

  perform public.write_audit_log('purchase.receive', 'purchases', purchase.id, null,
    jsonb_build_object('status', case when fully_received then 'received' else 'partially_received' end));

  return purchase.id;
end;
$$;

create or replace function public.complete_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  existing uuid;
  sale_id uuid;
  item jsonb;
  payment jsonb;
  product public.products;
  tax_row record;
  subtotal numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  sale_discount numeric(12,2);
  grand numeric(12,2);
  paid numeric(12,2) := 0;
  change_amt numeric(12,2) := 0;
  cost_price numeric(12,2);
  sale_item_id uuid;
  qty numeric;
begin
  profile := public.require_role('owner', 'admin', 'cashier');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  if nullif(p_payload->>'idempotency_key', '') is not null then
    select s.id into existing
    from public.sales s
    where s.idempotency_key = (p_payload->>'idempotency_key')::uuid
      and s.organization_id = profile.organization_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  sale_discount := public.money_round(coalesce((p_payload->>'discount_amount')::numeric, 0));

  insert into public.sales (
    organization_id, shop_id, customer_id, status, notes, idempotency_key,
    held_at, created_by
  ) values (
    profile.organization_id,
    shop,
    nullif(p_payload->>'customer_id', '')::uuid,
    'held',
    p_payload->>'notes',
    nullif(p_payload->>'idempotency_key', '')::uuid,
    timezone('utc', now()),
    profile.id
  ) returning id into sale_id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    select * into product
    from public.products
    where id = (item->>'product_id')::uuid
      and organization_id = profile.organization_id
      and is_active;

    if product.id is null then
      raise exception 'Unknown product' using errcode = 'P0001';
    end if;

    qty := (item->>'quantity')::numeric;
    if qty is null or qty <= 0 then
      raise exception 'Invalid quantity' using errcode = '22023';
    end if;

    select * into tax_row
    from public.line_tax(
      shop,
      qty,
      product.selling_price,
      coalesce((item->>'discount_amount')::numeric, 0),
      product.is_taxable,
      product.tax_rate_override
    );

    insert into public.sale_items (
      organization_id, sale_id, product_id, description_snapshot, quantity,
      unit_price, discount_amount, tax_amount, line_total
    ) values (
      profile.organization_id, sale_id, product.id, product.name, qty,
      product.selling_price,
      public.money_round(coalesce((item->>'discount_amount')::numeric, 0)),
      tax_row.tax_amount,
      tax_row.line_total
    ) returning id into sale_item_id;

    select pc.cost_price into cost_price
    from public.product_costs pc
    where pc.product_id = product.id;

    insert into public.sale_item_costs (sale_item_id, organization_id, unit_cost)
    values (sale_item_id, profile.organization_id, coalesce(cost_price, 0));

    subtotal := public.money_round(subtotal + tax_row.net_amount);
    tax_total := public.money_round(tax_total + tax_row.tax_amount);

    if product.track_inventory then
      insert into public.inventory_movements (
        organization_id, shop_id, product_id, quantity_change, movement_type,
        reference_type, reference_id, created_by
      ) values (
        profile.organization_id, shop, product.id, -qty, 'sale',
        'sale', sale_id, profile.id
      );
    end if;
  end loop;

  grand := public.money_round(subtotal + tax_total - sale_discount);
  if grand < 0 then
    grand := 0;
  end if;

  for payment in select * from jsonb_array_elements(coalesce(p_payload->'payments', '[]'::jsonb))
  loop
    insert into public.payments (
      organization_id, shop_id, reference_type, reference_id, method, entry_type, amount,
      notes, idempotency_key, received_by
    ) values (
      profile.organization_id, shop, 'sale', sale_id,
      (payment->>'method')::public.payment_method,
      'receipt',
      public.money_round((payment->>'amount')::numeric),
      payment->>'notes',
      nullif(payment->>'idempotency_key', '')::uuid,
      profile.id
    );
    paid := public.money_round(paid + public.money_round((payment->>'amount')::numeric));
  end loop;

  if paid < grand then
    raise exception 'Sale is not fully paid'
      using errcode = 'P0001';
  end if;

  change_amt := public.money_round(paid - grand);

  update public.sales
     set status = 'completed',
         sale_number = public.next_document_number('invoice', shop),
         subtotal = subtotal,
         discount_amount = sale_discount,
         tax_amount = tax_total,
         total = grand,
         change_amount = change_amt,
         completed_at = timezone('utc', now())
   where id = sale_id;

  perform public.write_audit_log(
    'sale.complete',
    'sales',
    sale_id,
    null,
    jsonb_build_object('total', grand, 'paid', paid)
  );

  return sale_id;
exception
  when unique_violation then
    if nullif(p_payload->>'idempotency_key', '') is not null then
      select s.id into existing
      from public.sales s
      where s.idempotency_key = (p_payload->>'idempotency_key')::uuid
        and s.organization_id = profile.organization_id;
      if existing is not null then
        return existing;
      end if;
    end if;
    raise;
end;
$$;

create or replace function public.hold_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  sale_id uuid;
  item jsonb;
  product public.products;
  tax_row record;
  qty numeric;
begin
  profile := public.require_role('owner', 'admin', 'cashier');
  shop := coalesce((p_payload->>'shop_id')::uuid, profile.default_shop_id);
  if shop is null or not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  insert into public.sales (
    organization_id, shop_id, customer_id, status, notes, created_by, held_at
  ) values (
    profile.organization_id, shop,
    nullif(p_payload->>'customer_id', '')::uuid,
    'held', p_payload->>'notes', profile.id, timezone('utc', now())
  ) returning id into sale_id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    select * into product
    from public.products
    where id = (item->>'product_id')::uuid
      and organization_id = profile.organization_id;
    qty := (item->>'quantity')::numeric;
    select * into tax_row from public.line_tax(
      shop, qty, product.selling_price,
      coalesce((item->>'discount_amount')::numeric, 0),
      product.is_taxable, product.tax_rate_override
    );
    insert into public.sale_items (
      organization_id, sale_id, product_id, description_snapshot, quantity,
      unit_price, discount_amount, tax_amount, line_total
    ) values (
      profile.organization_id, sale_id, product.id, product.name, qty,
      product.selling_price,
      public.money_round(coalesce((item->>'discount_amount')::numeric, 0)),
      tax_row.tax_amount, tax_row.line_total
    );
  end loop;

  return sale_id;
end;
$$;

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  sale public.sales;
begin
  profile := public.require_role('owner', 'admin');
  select * into sale from public.sales where id = p_sale_id for update;
  if sale.id is null or sale.organization_id <> profile.organization_id then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;
  if sale.status in ('cancelled', 'refunded') then
    raise exception 'Sale already closed' using errcode = 'P0001';
  end if;
  if sale.status in ('completed', 'partially_refunded') then
    insert into public.inventory_movements (
      organization_id, shop_id, product_id, quantity_change, movement_type,
      reference_type, reference_id, notes, created_by
    )
    select sale.organization_id, sale.shop_id, si.product_id, si.quantity, 'sale_return',
           'sale', sale.id, p_reason, profile.id
    from public.sale_items si
    join public.products p on p.id = si.product_id
    where si.sale_id = sale.id
      and p.track_inventory;
  end if;

  update public.sales
     set status = 'cancelled',
         cancelled_at = timezone('utc', now())
   where id = sale.id;

  perform public.write_audit_log('sale.cancel', 'sales', sale.id,
    jsonb_build_object('status', sale.status),
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.refund_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  sale public.sales;
  refund_id uuid;
  item jsonb;
  sale_item public.sale_items;
  qty numeric;
  amount numeric(12,2);
  refund_total numeric(12,2) := 0;
  already_refunded numeric(12,2);
begin
  profile := public.require_role('owner', 'admin');
  select * into sale from public.sales where id = (p_payload->>'sale_id')::uuid for update;
  if sale.id is null or sale.organization_id <> profile.organization_id then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(sale.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if sale.status not in ('completed', 'partially_refunded') then
    raise exception 'Sale cannot be refunded' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_payload->>'reason', ''))) = 0 then
    raise exception 'Refund reason is required' using errcode = '22023';
  end if;

  select coalesce(sum(r.total), 0) into already_refunded
  from public.refunds r
  where r.sale_id = sale.id;

  insert into public.refunds (organization_id, shop_id, sale_id, reason, created_by)
  values (profile.organization_id, sale.shop_id, sale.id, p_payload->>'reason', profile.id)
  returning id into refund_id;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'items', '[]'::jsonb))
  loop
    select * into sale_item
    from public.sale_items
    where id = (item->>'sale_item_id')::uuid
      and sale_id = sale.id;
    if sale_item.id is null then
      raise exception 'Sale item not found' using errcode = 'P0001';
    end if;

    qty := (item->>'quantity')::numeric;
    if qty is null or qty <= 0 or qty > sale_item.quantity then
      raise exception 'Invalid refund quantity' using errcode = '22023';
    end if;

    amount := public.money_round(sale_item.line_total * (qty / sale_item.quantity));

    insert into public.refund_items (
      organization_id, refund_id, sale_item_id, product_id, quantity, amount
    ) values (
      profile.organization_id, refund_id, sale_item.id, sale_item.product_id, qty, amount
    );
    refund_total := public.money_round(refund_total + amount);

    insert into public.inventory_movements (
      organization_id, shop_id, product_id, quantity_change, movement_type,
      reference_type, reference_id, created_by
    )
    select profile.organization_id, sale.shop_id, sale_item.product_id, qty, 'customer_return',
           'refund', refund_id, profile.id
    from public.products p
    where p.id = sale_item.product_id
      and p.track_inventory;
  end loop;

  if refund_total <= 0 then
    raise exception 'Refund total must be greater than zero' using errcode = '22023';
  end if;
  if public.money_round(already_refunded + refund_total) > sale.total then
    raise exception 'Refund exceeds sale total' using errcode = 'P0001';
  end if;

  update public.refunds set total = refund_total where id = refund_id;

  insert into public.payments (
    organization_id, shop_id, reference_type, reference_id, method, entry_type, amount,
    notes, received_by
  ) values (
    profile.organization_id, sale.shop_id, 'sale', sale.id,
    coalesce((p_payload->>'method')::public.payment_method, 'cash'),
    'refund',
    refund_total,
    'Refund ' || refund_id::text || ': ' || (p_payload->>'reason'),
    profile.id
  );

  update public.sales
     set status = case
       when public.money_round(already_refunded + refund_total) >= sale.total then 'refunded'
       else 'partially_refunded'
     end
   where id = sale.id;

  perform public.write_audit_log('sale.refund', 'sales', sale.id,
    jsonb_build_object('status', sale.status),
    jsonb_build_object('refund_id', refund_id, 'total', refund_total));

  return refund_id;
end;
$$;

create or replace function public.record_payment(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  payment_id uuid;
  existing uuid;
  ref_type public.payment_reference_type;
  ref_id uuid;
  requested_shop uuid;
begin
  profile := public.require_role('owner', 'admin', 'cashier');
  requested_shop := nullif(p_payload->>'shop_id', '')::uuid;
  ref_type := (p_payload->>'reference_type')::public.payment_reference_type;
  ref_id := (p_payload->>'reference_id')::uuid;

  if nullif(p_payload->>'idempotency_key', '') is not null then
    select p.id into existing
    from public.payments p
    where p.idempotency_key = (p_payload->>'idempotency_key')::uuid
      and p.organization_id = profile.organization_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  if ref_type = 'sale' then
    select s.shop_id into shop
    from public.sales s
    where s.id = ref_id and s.organization_id = profile.organization_id;
    if shop is null then
      raise exception 'Sale not found' using errcode = 'P0001';
    end if;
  elsif ref_type = 'repair' then
    select j.shop_id into shop
    from public.repair_jobs j
    where j.id = ref_id and j.organization_id = profile.organization_id;
    if shop is null then
      raise exception 'Repair job not found' using errcode = 'P0001';
    end if;
  elsif ref_type = 'purchase' then
    profile := public.require_role('owner', 'admin');
    select pu.shop_id into shop
    from public.purchases pu
    where pu.id = ref_id and pu.organization_id = profile.organization_id;
    if shop is null then
      raise exception 'Purchase not found' using errcode = 'P0001';
    end if;
  else
    raise exception 'Invalid payment reference' using errcode = '22023';
  end if;

  if requested_shop is not null and requested_shop is distinct from shop then
    raise exception 'Shop does not match payment reference' using errcode = '42501';
  end if;
  if not public.has_shop_access(shop) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;

  insert into public.payments (
    organization_id, shop_id, reference_type, reference_id, method, entry_type,
    amount, notes, idempotency_key, received_by
  ) values (
    profile.organization_id, shop, ref_type, ref_id,
    (p_payload->>'method')::public.payment_method,
    'receipt',
    public.money_round((p_payload->>'amount')::numeric),
    p_payload->>'notes',
    nullif(p_payload->>'idempotency_key', '')::uuid,
    profile.id
  ) returning id into payment_id;

  return payment_id;
exception
  when unique_violation then
    if nullif(p_payload->>'idempotency_key', '') is not null then
      select p.id into existing
      from public.payments p
      where p.idempotency_key = (p_payload->>'idempotency_key')::uuid
        and p.organization_id = profile.organization_id;
      if existing is not null then
        return existing;
      end if;
    end if;
    raise;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  payment public.payments;
begin
  profile := public.require_role('owner', 'admin');
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Void reason is required' using errcode = '22023';
  end if;

  select * into payment from public.payments where id = p_payment_id for update;
  if payment.id is null or payment.organization_id <> profile.organization_id then
    raise exception 'Payment not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(payment.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if payment.voided_at is not null then
    raise exception 'Payment already voided' using errcode = 'P0001';
  end if;

  update public.payments
     set voided_at = timezone('utc', now()),
         voided_by = profile.id,
         void_reason = p_reason
   where id = payment.id;

  perform public.write_audit_log(
    'payment.void',
    'payments',
    payment.id,
    jsonb_build_object('amount', payment.amount),
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

grant execute on function public.adjust_inventory(uuid, uuid, numeric, public.inventory_movement_type, text) to authenticated;
grant execute on function public.create_purchase(jsonb) to authenticated;
grant execute on function public.receive_purchase(jsonb) to authenticated;
grant execute on function public.complete_sale(jsonb) to authenticated;
grant execute on function public.hold_sale(jsonb) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.refund_sale(jsonb) to authenticated;
grant execute on function public.record_payment(jsonb) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
