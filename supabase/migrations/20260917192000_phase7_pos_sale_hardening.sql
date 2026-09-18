-- Phase 7: POS sale hardening
-- 1) complete_sale: Phase 3.1 cash tender/change; non-cash cannot exceed balance
-- 2) complete_held_sale: safely convert held → completed without duplicating cart
-- 3) cancel_sale: cashiers may cancel held sales only
-- 4) refund_sale: enforce remaining refundable qty per sale line

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
  method public.payment_method;
  requested numeric(12,2);
  tendered numeric(12,2);
  pay_amt numeric(12,2);
  line_change numeric(12,2);
  remaining numeric(12,2);
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
  if sale_discount < 0 then
    raise exception 'Invalid discount' using errcode = '22023';
  end if;

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

    if coalesce((item->>'discount_amount')::numeric, 0) < 0 then
      raise exception 'Invalid discount' using errcode = '22023';
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

    if tax_row.line_total < 0 then
      raise exception 'Discount cannot create a negative line total' using errcode = '22023';
    end if;

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
    method := (payment->>'method')::public.payment_method;
    requested := nullif(payment->>'amount', '')::numeric;
    tendered := nullif(payment->>'tendered_amount', '')::numeric;
    remaining := public.money_round(grand - paid);
    line_change := 0;

    if method = 'cash' then
      if tendered is not null then
        if tendered <= 0 then
          raise exception 'Invalid tendered amount' using errcode = '22023';
        end if;
        if tendered < remaining then
          raise exception 'Cash tendered is insufficient' using errcode = 'P0001';
        end if;
        pay_amt := remaining;
        line_change := public.money_round(tendered - pay_amt);
      else
        if requested is null or requested <= 0 then
          raise exception 'Invalid payment amount' using errcode = '22023';
        end if;
        if requested > remaining then
          -- cash without tender: treat excess as change, record only remaining as revenue
          pay_amt := remaining;
          line_change := public.money_round(requested - remaining);
          tendered := requested;
        else
          pay_amt := public.money_round(requested);
        end if;
      end if;
    else
      if requested is null or requested <= 0 then
        raise exception 'Invalid payment amount' using errcode = '22023';
      end if;
      if public.money_round(requested) > remaining then
        raise exception 'Payment exceeds outstanding balance' using errcode = 'P0001';
      end if;
      pay_amt := public.money_round(requested);
      tendered := null;
    end if;

    if pay_amt <= 0 then
      raise exception 'Invalid payment amount' using errcode = '22023';
    end if;

    insert into public.payments (
      organization_id, shop_id, reference_type, reference_id, method, entry_type, amount,
      tendered_amount, change_amount, notes, idempotency_key, received_by
    ) values (
      profile.organization_id, shop, 'sale', sale_id,
      method,
      'receipt',
      pay_amt,
      tendered,
      line_change,
      payment->>'notes',
      nullif(payment->>'idempotency_key', '')::uuid,
      profile.id
    );
    paid := public.money_round(paid + pay_amt);
    change_amt := public.money_round(change_amt + line_change);
  end loop;

  if paid < grand then
    raise exception 'Sale is not fully paid'
      using errcode = 'P0001';
  end if;

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
    jsonb_build_object('total', grand, 'paid', paid, 'change', change_amt)
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

create or replace function public.complete_held_sale(
  p_sale_id uuid,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  sale public.sales;
  existing uuid;
  payment jsonb;
  sale_item public.sale_items;
  product public.products;
  subtotal numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  sale_discount numeric(12,2);
  grand numeric(12,2);
  paid numeric(12,2) := 0;
  change_amt numeric(12,2) := 0;
  method public.payment_method;
  requested numeric(12,2);
  tendered numeric(12,2);
  pay_amt numeric(12,2);
  line_change numeric(12,2);
  remaining numeric(12,2);
begin
  profile := public.require_role('owner', 'admin', 'cashier');

  if nullif(p_payload->>'idempotency_key', '') is not null then
    select s.id into existing
    from public.sales s
    where s.idempotency_key = (p_payload->>'idempotency_key')::uuid
      and s.organization_id = profile.organization_id;
    if existing is not null then
      return existing;
    end if;
  end if;

  select * into sale from public.sales where id = p_sale_id for update;
  if sale.id is null or sale.organization_id <> profile.organization_id then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(sale.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
  end if;
  if sale.status <> 'held' then
    raise exception 'Only held sales can be completed this way' using errcode = 'P0001';
  end if;

  for sale_item in
    select * from public.sale_items where sale_id = sale.id order by created_at
  loop
    select * into product from public.products where id = sale_item.product_id;
    if product.id is null or not product.is_active then
      raise exception 'Unknown product' using errcode = 'P0001';
    end if;

    subtotal := public.money_round(subtotal + (sale_item.line_total - sale_item.tax_amount));
    tax_total := public.money_round(tax_total + sale_item.tax_amount);

    if product.track_inventory then
      insert into public.inventory_movements (
        organization_id, shop_id, product_id, quantity_change, movement_type,
        reference_type, reference_id, created_by
      ) values (
        profile.organization_id, sale.shop_id, product.id, -sale_item.quantity, 'sale',
        'sale', sale.id, profile.id
      );
    end if;
  end loop;

  sale_discount := public.money_round(
    coalesce(nullif(p_payload->>'discount_amount', '')::numeric, sale.discount_amount, 0)
  );
  if sale_discount < 0 then
    raise exception 'Invalid discount' using errcode = '22023';
  end if;

  grand := public.money_round(subtotal + tax_total - sale_discount);
  if grand < 0 then
    grand := 0;
  end if;

  for payment in select * from jsonb_array_elements(coalesce(p_payload->'payments', '[]'::jsonb))
  loop
    method := (payment->>'method')::public.payment_method;
    requested := nullif(payment->>'amount', '')::numeric;
    tendered := nullif(payment->>'tendered_amount', '')::numeric;
    remaining := public.money_round(grand - paid);
    line_change := 0;

    if method = 'cash' then
      if tendered is not null then
        if tendered <= 0 then
          raise exception 'Invalid tendered amount' using errcode = '22023';
        end if;
        if tendered < remaining then
          raise exception 'Cash tendered is insufficient' using errcode = 'P0001';
        end if;
        pay_amt := remaining;
        line_change := public.money_round(tendered - pay_amt);
      else
        if requested is null or requested <= 0 then
          raise exception 'Invalid payment amount' using errcode = '22023';
        end if;
        if requested > remaining then
          pay_amt := remaining;
          line_change := public.money_round(requested - remaining);
          tendered := requested;
        else
          pay_amt := public.money_round(requested);
        end if;
      end if;
    else
      if requested is null or requested <= 0 then
        raise exception 'Invalid payment amount' using errcode = '22023';
      end if;
      if public.money_round(requested) > remaining then
        raise exception 'Payment exceeds outstanding balance' using errcode = 'P0001';
      end if;
      pay_amt := public.money_round(requested);
      tendered := null;
    end if;

    insert into public.payments (
      organization_id, shop_id, reference_type, reference_id, method, entry_type, amount,
      tendered_amount, change_amount, notes, idempotency_key, received_by
    ) values (
      profile.organization_id, sale.shop_id, 'sale', sale.id,
      method, 'receipt', pay_amt, tendered, line_change,
      payment->>'notes',
      nullif(payment->>'idempotency_key', '')::uuid,
      profile.id
    );
    paid := public.money_round(paid + pay_amt);
    change_amt := public.money_round(change_amt + line_change);
  end loop;

  if paid < grand then
    raise exception 'Sale is not fully paid' using errcode = 'P0001';
  end if;

  update public.sales
     set status = 'completed',
         sale_number = coalesce(sale.sale_number, public.next_document_number('invoice', sale.shop_id)),
         subtotal = subtotal,
         discount_amount = sale_discount,
         tax_amount = tax_total,
         total = grand,
         change_amount = change_amt,
         notes = coalesce(nullif(p_payload->>'notes', ''), sale.notes),
         idempotency_key = coalesce(
           nullif(p_payload->>'idempotency_key', '')::uuid,
           sale.idempotency_key
         ),
         completed_at = timezone('utc', now())
   where id = sale.id;

  perform public.write_audit_log(
    'sale.complete_held',
    'sales',
    sale.id,
    jsonb_build_object('status', 'held'),
    jsonb_build_object('total', grand, 'paid', paid)
  );

  return sale.id;
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
  if char_length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;

  select * into sale from public.sales where id = p_sale_id for update;
  if sale.id is null then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;

  if sale.status = 'held' then
    profile := public.require_role('owner', 'admin', 'cashier');
  elsif sale.status in ('completed', 'partially_refunded') then
    profile := public.require_role('owner', 'admin');
  else
    raise exception 'Sale already closed' using errcode = 'P0001';
  end if;

  if sale.organization_id <> profile.organization_id then
    raise exception 'Sale not found' using errcode = 'P0001';
  end if;
  if not public.has_shop_access(sale.shop_id) then
    raise exception 'Shop access denied' using errcode = '42501';
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
  already_qty numeric(12,3);
  remaining_qty numeric(12,3);
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

grant execute on function public.complete_held_sale(uuid, jsonb) to authenticated;
grant execute on function public.complete_sale(jsonb) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.refund_sale(jsonb) to authenticated;
