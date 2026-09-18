-- Enum CASE expressions must be typed; untyped text fails assignment to purchase_status/sale_status.

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
  next_status public.purchase_status;
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

  next_status := case
    when fully_received then 'received'::public.purchase_status
    else 'partially_received'::public.purchase_status
  end;

  update public.purchases
     set status = next_status,
         received_at = case when fully_received then timezone('utc', now()) else received_at end
   where id = purchase.id;

  perform public.write_audit_log('purchase.receive', 'purchases', purchase.id, null,
    jsonb_build_object('status', next_status));

  return purchase.id;
end;
$$;

create or replace function public.refund_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
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
  next_status public.sale_status;
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

  next_status := case
    when public.money_round(already_refunded + refund_total) >= sale.total then 'refunded'::public.sale_status
    else 'partially_refunded'::public.sale_status
  end;

  update public.sales
     set status = next_status
   where id = sale.id;

  perform public.write_audit_log('sale.refund', 'sales', sale.id,
    jsonb_build_object('status', sale.status),
    jsonb_build_object('refund_id', refund_id, 'total', refund_total));

  return refund_id;
end;
$$;

grant execute on function public.receive_purchase(jsonb) to authenticated;
grant execute on function public.refund_sale(jsonb) to authenticated;
