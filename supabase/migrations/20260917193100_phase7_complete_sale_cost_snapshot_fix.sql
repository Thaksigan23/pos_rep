-- Align complete_sale cost snapshot with prior behavior (always write sale_item_costs).

create or replace function public.complete_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.profiles;
  shop uuid;
  sale_id uuid;
  existing uuid;
  item jsonb;
  payment jsonb;
  product public.products;
  tax_row record;
  qty numeric;
  subtotal numeric(12,2) := 0;
  tax_total numeric(12,2) := 0;
  sale_discount numeric(12,2) := 0;
  grand numeric(12,2) := 0;
  paid numeric(12,2) := 0;
  change_amt numeric(12,2) := 0;
  method public.payment_method;
  requested numeric(12,2);
  tendered numeric(12,2);
  pay_amt numeric(12,2);
  remaining numeric(12,2);
  line_change numeric(12,2);
  sale_item_id uuid;
  cost_price numeric(12,2);
  customer_id uuid;
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

  customer_id := nullif(p_payload->>'customer_id', '')::uuid;
  if customer_id is not null then
    if not exists (
      select 1
      from public.customers c
      where c.id = customer_id
        and c.organization_id = profile.organization_id
    ) then
      raise exception 'Customer not found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.sales (
    organization_id, shop_id, customer_id, status, notes, idempotency_key,
    held_at, created_by
  ) values (
    profile.organization_id,
    shop,
    customer_id,
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

grant execute on function public.complete_sale(jsonb) to authenticated;
