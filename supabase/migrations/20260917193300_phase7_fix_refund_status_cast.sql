-- Cast refund_sale status CASE to sale_status enum.

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
  existing uuid;
  item jsonb;
  sale_item public.sale_items;
  qty numeric;
  amount numeric(12,2);
  refund_total numeric(12,2) := 0;
  already_refunded numeric(12,2);
  already_qty numeric(12,3);
  remaining_qty numeric(12,3);
begin
  profile := public.require_role('owner', 'admin');

  if nullif(p_payload->>'idempotency_key', '') is not null then
    select r.id into existing
    from public.refunds r
    where r.idempotency_key = (p_payload->>'idempotency_key')::uuid
      and r.organization_id = profile.organization_id;
    if existing is not null then
      return existing;
    end if;
  end if;

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

  insert into public.refunds (
    organization_id, shop_id, sale_id, reason, created_by, idempotency_key
  ) values (
    profile.organization_id,
    sale.shop_id,
    sale.id,
    p_payload->>'reason',
    profile.id,
    nullif(p_payload->>'idempotency_key', '')::uuid
  )
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

    select coalesce(sum(ri.quantity), 0) into already_qty
    from public.refund_items ri
    join public.refunds r on r.id = ri.refund_id
    where ri.sale_item_id = sale_item.id
      and r.sale_id = sale.id;

    remaining_qty := sale_item.quantity - already_qty;
    qty := (item->>'quantity')::numeric;
    if qty is null or qty <= 0 or qty > remaining_qty then
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
       when public.money_round(already_refunded + refund_total) >= sale.total
         then 'refunded'::public.sale_status
       else 'partially_refunded'::public.sale_status
     end
   where id = sale.id;

  perform public.write_audit_log('sale.refund', 'sales', sale.id,
    jsonb_build_object('status', sale.status),
    jsonb_build_object('refund_id', refund_id, 'total', refund_total));

  return refund_id;
exception
  when unique_violation then
    if nullif(p_payload->>'idempotency_key', '') is not null then
      select r.id into existing
      from public.refunds r
      where r.idempotency_key = (p_payload->>'idempotency_key')::uuid
        and r.organization_id = profile.organization_id;
      if existing is not null then
        return existing;
      end if;
    end if;
    raise;
end;
$$;

grant execute on function public.refund_sale(jsonb) to authenticated;
