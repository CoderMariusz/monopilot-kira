-- Migration 255: add the 'packaging' item_type to the item master.
--
-- Mirrors migration 248's idempotent drop+recreate pattern for the canonical
-- item_type CHECK constraints. Wave0 lock: org_id remains the business scope;
-- RLS continues to use app.current_org_id().

alter table public.items
  drop constraint if exists items_item_type_check;

alter table public.items
  add constraint items_item_type_check
  check (item_type in ('rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging'));

alter table public.work_orders
  drop constraint if exists work_orders_item_type_at_creation_check;

alter table public.work_orders
  add constraint work_orders_item_type_at_creation_check
  check (item_type_at_creation in ('rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging'));

insert into public.items
  (org_id, item_code, item_type, name, description, status, product_group,
   uom_base, weight_mode, cost_per_kg)
select
  '00000000-0000-0000-0000-000000000002'::uuid as org_id,
  v.item_code,
  'packaging',
  v.name,
  v.description,
  'active',
  'packaging',
  'pcs',
  'fixed',
  v.cost_per_kg
from (values
  ('PKG-FOIL-MAP',  'MAP tray foil lid',      'MAP tray foil lid',      0.05),
  ('PKG-TRAY-MAP',  'MAP seal tray 200g',     'MAP seal tray 200g',     0.08),
  ('PKG-LABEL-STD', 'Standard product label', 'Standard product label', 0.01),
  ('PKG-BOX-CARTON','Outer carton box',       'Outer carton box',       0.35),
  ('PKG-CASING-NET','Net casing 45mm',        'Net casing 45mm',        0.12)
) as v(item_code, name, description, cost_per_kg)
on conflict (org_id, item_code) do update
  set item_type     = excluded.item_type,
      name          = excluded.name,
      description   = excluded.description,
      product_group = excluded.product_group,
      uom_base      = excluded.uom_base,
      cost_per_kg   = excluded.cost_per_kg,
      status        = 'active';
