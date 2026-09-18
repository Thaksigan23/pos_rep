-- Phase 6: efficient per-shop inventory listing with derived stock status.
-- security_invoker keeps underlying RLS (FORCE RLS) authoritative.

create or replace view public.shop_product_inventory
with (security_invoker = true) as
select
  p.id as product_id,
  p.organization_id,
  s.id as shop_id,
  p.sku,
  p.barcode,
  p.name,
  p.product_type,
  p.category_id,
  p.brand_id,
  p.selling_price,
  p.min_stock,
  p.reorder_level,
  p.location_bin,
  p.is_active,
  p.track_inventory,
  coalesce(ps.quantity, 0)::numeric(12, 3) as quantity,
  case
    when not p.track_inventory then 'not_tracked'
    when coalesce(ps.quantity, 0) <= 0 then 'out_of_stock'
    when coalesce(ps.quantity, 0) <= greatest(p.reorder_level, p.min_stock)
      then 'low_stock'
    else 'in_stock'
  end as stock_status
from public.products p
inner join public.shops s
  on s.organization_id = p.organization_id
 and s.is_active = true
left join public.product_stocks ps
  on ps.product_id = p.id
 and ps.shop_id = s.id;

comment on view public.shop_product_inventory is
  'Per-shop product stock with derived status for inventory filters. RLS via security_invoker.';

grant select on public.shop_product_inventory to authenticated;
