-- Migration 350: add qty_per_pack to public.packaging_components.
-- The BOM Generator (NPD->Technical handoff materializeNpdBom) must emit packaging (PM)
-- BOM lines from an FG's packaging_components, but the table had NO quantity column — so
-- the generator could only assume qty=1 per each. This adds an optional per-pack quantity
-- the NPD packaging stage can capture; the generator reads COALESCE(qty_per_pack, 1).
-- Additive, idempotent. app_user already has full DML on packaging_components. Wave0: org_id RLS.
alter table public.packaging_components
  add column if not exists qty_per_pack numeric(12,4)
  constraint packaging_components_qty_per_pack_positive
  check (qty_per_pack is null or qty_per_pack > 0);
