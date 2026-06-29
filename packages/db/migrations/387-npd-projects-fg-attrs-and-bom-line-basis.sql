-- Migration 387 — NPD v2 slice S2: project = FG aggregate (additive) + per-box BOM marker.
--
-- Owner decisions D1/D2/D8 (plan _meta/plans/2026-06-29-npd-v2-redesign-plan.md §10):
--   * Promote the cross-module FG attribute columns that today live only on fg_npd_ext onto
--     npd_projects, so the project is the single editable home (D1 — project = FG). Long-tail
--     dept-specific fields move to npd_projects.field_values jsonb (D2) — wired by later slices.
--   * Stamp items.each_per_box from the project's packs_per_case for NPD FGs so 'box' UoM entry
--     works AND kg_per_box (= each_per_box × net_qty_per_each) is computable for the per-box BOM
--     consumption scaling (D8 — BOM stored PER BOX, WO planned in BOXES).
--   * Mark BOM lines' basis so the WO materials snapshot knows whether to scale by base-qty or by
--     number-of-boxes. Default 'per_base' (existing BOMs, incl. the legacy NPD ones built with the
--     old per-pack math, keep base scaling). materialize-npd-bom sets 'per_box' on NEW NPD BOMs.
--     The flag is CONSUMED in slice S2-WO (createWorkOrder + sibling wo_materials snapshot sites);
--     this migration only STORES it, so there is no consumer behaviour change here.
--
-- ADDITIVE ONLY — no drops. Fully idempotent. Reversible (drop the added columns/constraint).
-- The public.product view stays green (this only adds columns to npd_projects / bom_headers and
-- backfills; no reader is repointed — that is slice S8).

-- 1. FG attribute columns on npd_projects (cross-module essentials absent before this mig).
alter table public.npd_projects
  add column if not exists pack_size  text,
  add column if not exists shelf_life text,
  add column if not exists line       text,
  add column if not exists dieset     text,
  add column if not exists field_values jsonb not null default '{}'::jsonb;

-- 2. Backfill the new project columns from fg_npd_ext (only for projects with a linked FG).
--    coalesce → never clobber a value already on the project.
update public.npd_projects np
   set pack_size  = coalesce(np.pack_size,  x.pack_size),
       shelf_life = coalesce(np.shelf_life, x.shelf_life),
       line       = coalesce(np.line,       x.line),
       dieset     = coalesce(np.dieset,     x.dieset)
  from public.items i
  join public.fg_npd_ext x on x.item_id = i.id
 where i.org_id = np.org_id
   and i.item_code = np.product_code
   and np.product_code is not null;

-- 3. Stamp items.each_per_box from packs_per_case for NPD FGs (D8). Idempotent (only when differing).
update public.items i
   set each_per_box = np.packs_per_case
  from public.npd_projects np
 where i.org_id = np.org_id
   and i.item_code = np.product_code
   and np.product_code is not null
   and np.packs_per_case is not null
   and np.packs_per_case > 0
   and coalesce(i.each_per_box, 0) <> np.packs_per_case;

-- 4. BOM line basis marker (D8). Default 'per_base'; materialize sets 'per_box' on new NPD BOMs.
alter table public.bom_headers
  add column if not exists line_basis text not null default 'per_base';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'bom_headers_line_basis_chk'
       and conrelid = 'public.bom_headers'::regclass
  ) then
    alter table public.bom_headers
      add constraint bom_headers_line_basis_chk check (line_basis in ('per_base','per_box'));
  end if;
end $$;
