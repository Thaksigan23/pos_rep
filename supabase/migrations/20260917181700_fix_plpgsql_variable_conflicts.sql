-- Resolve plpgsql variable/column name clashes in money RPCs.
-- Default #variable_conflict is error; these UPDATEs assign variables onto same-named columns.

create or replace function public.create_purchase(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
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

create or replace function public.complete_sale(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
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

create or replace function public.recalc_estimate_totals(p_estimate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  estimate public.repair_estimates;
  subtotal numeric(12,2);
  tax_total numeric(12,2);
begin
  select * into estimate from public.repair_estimates where id = p_estimate_id;
  select coalesce(sum(line_total - tax_amount), 0), coalesce(sum(tax_amount), 0)
    into subtotal, tax_total
  from public.repair_estimate_items
  where estimate_id = p_estimate_id;

  update public.repair_estimates
     set subtotal = public.money_round(subtotal),
         tax_amount = public.money_round(tax_total),
         total = public.money_round(subtotal + tax_total - estimate.discount_amount)
   where id = p_estimate_id;
end;
$$;

revoke execute on function public.recalc_estimate_totals(uuid) from public, anon, authenticated;
grant execute on function public.create_purchase(jsonb) to authenticated;
grant execute on function public.complete_sale(jsonb) to authenticated;
