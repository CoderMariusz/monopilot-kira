-- Migration 334: site_id scoping columns for tables still missing a direct site_id.
--
-- WAVE SW continuation (owner-decided: app-level site scoping, not RLS — the top-bar
-- site filters views/functions app-side; mirrors mig 312-site-warehouse-scope-columns.sql).
-- Adds a DIRECT, nullable site_id to operational tables that today scope only indirectly
-- (PO via receiving GRN, stock_adjustment via LP, transfer_order via from/to warehouse).
--
-- Pattern (verified against mig 312 + 215 + 191):
--   * New columns are NULLABLE uuid REFERENCES public.sites(id) ON DELETE SET NULL
--     (same FK style mig 312 used for warehouses.site_id; sites is the canonical FK
--     target from mig 215).
--   * Backfill FAILS-OPEN: existing rows we cannot resolve stay NULL (app code
--     fail-CLOSES new writes — NOT enforced here).
--   * Composite (org_id, site_id) index per §9.9 so the planner hits the site-scoped read.
--   * ADD COLUMN IF NOT EXISTS + create index if not exists => fully re-runnable.
--   * NO RLS/GRANT changes: every target already has org RLS (mig 262/263/272/318) and
--     is already granted to app_user (mig 262/263/272 grant directly; mig 318's
--     stock_adjustments was re-granted to app_user by mig 323). Adding a nullable column
--     requires no privilege/policy change. (We GRANT to app_user, NEVER 'authenticated'.)
--
-- purchase_order_lines is INTENTIONALLY NOT scoped: it is never queried by site directly
-- (always loaded via parent po_id); a redundant line-level site_id would only invite
-- denormalization drift. Site scope is inherited from purchase_orders.site_id.

-- ===========================================================================
-- (1) purchase_orders.site_id  (mig 262 owns the table)
--     Backfill priority: receiving GRN's own site_id -> GRN warehouse's site_id
--     -> org default site. (grns.po_id is the soft link; grns.site_id @193,
--     warehouses.site_id @312, sites.is_default @215.)
-- ===========================================================================
alter table public.purchase_orders
  add column if not exists site_id uuid references public.sites(id) on delete set null;

update public.purchase_orders po
set site_id = sub.site_id
from (
  select distinct on (g.po_id)
    g.po_id,
    coalesce(g.site_id, w.site_id) as site_id
  from public.grns g
  left join public.warehouses w
    on w.id = g.warehouse_id
   and w.org_id = g.org_id
  where g.po_id is not null
    and coalesce(g.site_id, w.site_id) is not null
  order by g.po_id, g.receipt_date desc, g.created_at desc
) sub
where po.id = sub.po_id
  and po.site_id is null;

-- Fallback: org default site for any PO still unresolved.
update public.purchase_orders po
set site_id = s.id
from public.sites s
where s.org_id = po.org_id
  and s.is_default = true
  and po.site_id is null;

create index if not exists purchase_orders_org_site_idx
  on public.purchase_orders (org_id, site_id);

-- ===========================================================================
-- (2) quality_inspections.site_id  (mig 272 owns the table)
--     Polymorphic reference_type/reference_id (mig 272 CHECK: 'lp' | 'grn' | 'wo_output').
--     Backfill: 'lp' -> license_plates.site_id; 'grn' -> grns.site_id.
--     'wo_output' has no resolvable site on this path -> left NULL (documented).
-- ===========================================================================
alter table public.quality_inspections
  add column if not exists site_id uuid references public.sites(id) on delete set null;

update public.quality_inspections qi
set site_id = lp.site_id
from public.license_plates lp
where qi.reference_type = 'lp'
  and qi.reference_id = lp.id
  and lp.org_id = qi.org_id
  and lp.site_id is not null
  and qi.site_id is null;

update public.quality_inspections qi
set site_id = g.site_id
from public.grns g
where qi.reference_type = 'grn'
  and qi.reference_id = g.id
  and g.org_id = qi.org_id
  and g.site_id is not null
  and qi.site_id is null;

create index if not exists quality_inspections_org_site_idx
  on public.quality_inspections (org_id, site_id);

-- ===========================================================================
-- (3) stock_adjustments.site_id  (mig 318 owns the table; mig 323 fixed its grant)
--     Backfill: adjusted LP's site_id -> adjustment warehouse's site_id.
--     (stock_adjustments.lp_id + warehouse_id @318; license_plates.site_id @191.)
-- ===========================================================================
alter table public.stock_adjustments
  add column if not exists site_id uuid references public.sites(id) on delete set null;

update public.stock_adjustments sa
set site_id = lp.site_id
from public.license_plates lp
where sa.lp_id = lp.id
  and lp.org_id = sa.org_id
  and lp.site_id is not null
  and sa.site_id is null;

update public.stock_adjustments sa
set site_id = w.site_id
from public.warehouses w
where sa.warehouse_id = w.id
  and w.org_id = sa.org_id
  and w.site_id is not null
  and sa.site_id is null;

create index if not exists stock_adjustments_org_site_idx
  on public.stock_adjustments (org_id, site_id);

-- ===========================================================================
-- (4) transfer_orders.site_id  (mig 263 owns the table)
--     Today only indirect via from/to_warehouse_id. Add a DIRECT originating site_id.
--     Backfill: from_warehouse_id's site_id, falling back to to_warehouse_id's site_id.
--     (transfer_orders.from/to_warehouse_id @263; warehouses.site_id @312.)
-- ===========================================================================
alter table public.transfer_orders
  add column if not exists site_id uuid references public.sites(id) on delete set null;

update public.transfer_orders t
set site_id = coalesce(wf.site_id, wt.site_id)
from public.transfer_orders t2
left join public.warehouses wf
  on wf.id = t2.from_warehouse_id
 and wf.org_id = t2.org_id
left join public.warehouses wt
  on wt.id = t2.to_warehouse_id
 and wt.org_id = t2.org_id
where t.id = t2.id
  and t.site_id is null
  and coalesce(wf.site_id, wt.site_id) is not null;

create index if not exists transfer_orders_org_site_idx
  on public.transfer_orders (org_id, site_id);

-- ===========================================================================
-- (5) Registry bookkeeping (mig 215 operational_tables) — mark the day-1 site_id
--     column as now present for the tables that are in the §9.8 registry.
--     quality_inspections is the only one of the four registered there. PO / TO /
--     stock_adjustments are NOT in the §9.8 registry, so nothing to flip for them.
--     (scoping_status stays 'pending': this is the app-level fail-open backfill, NOT
--      the T-030 NOT NULL + site policy activation.)
-- ===========================================================================
update public.operational_tables
set site_id_present = true,
    notes = coalesce(notes, '') || ' | site_id added @334 (app-level, nullable, fail-open)'
where table_name = 'quality_inspections'
  and site_id_present = false;
