-- Migration 449: R3.3 — unify piece UOM codes ea / szt → canonical `pcs`.
-- Owner mandate (audit 2026-07-07-as-built-production-model.md §4): three piece codes
-- were treated as different units; canonical storage is `pcs` everywhere.
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- DESTRUCTIVE DATA MIGRATION — human-reviewed + DB backup required before apply.
--
-- unit_of_measure has NO inbound FKs; consumers match on the code string (PO/TO dropdown,
-- custom conversions). Merge per-org when both `ea` and `pcs` rows exist.
--
-- Idempotent: safe to re-run (only rows still holding szt/ea are touched).
--
-- Post-deploy: legacy app code may write szt/ea during the Vercel build window.
-- Section 5 below repeats the column sweep idempotently; the orchestrator MUST also
-- run packages/db/449-postdeploy-sweep.sql manually once deploy is live.

begin;

-- ── Helper: count + notice for a single UPDATE ───────────────────────────────
create or replace function pg_temp._migrate_piece_uom(p_label text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: % — % rows', p_label, v_n;
end;
$$;

-- ── 1. Raw text columns (szt|ea → pcs) ───────────────────────────────────────
select pg_temp._migrate_piece_uom(
  'items.uom_base',
  $$update public.items set uom_base = 'pcs' where uom_base in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'items.uom_secondary',
  $$update public.items set uom_secondary = 'pcs' where uom_secondary in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'bom_lines.uom',
  $$update public.bom_lines set uom = 'pcs'
    where uom in ('szt', 'ea')
      -- bom_lines_reject_approved_header_update: lines under technical_approved/
      -- active headers are immutable (mig 090). 0 such rows at authoring time;
      -- skip-with-notice below if any ever appear (escalate to owner).
      and bom_header_id in (select id from public.bom_headers where status not in ('technical_approved', 'active'))$$
);
select pg_temp._migrate_piece_uom(
  'bom_co_products.uom',
  $$update public.bom_co_products set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'work_orders.uom',
  $$update public.work_orders set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wo_materials.uom',
  $$update public.wo_materials set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wo_outputs.uom',
  $$update public.wo_outputs set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wo_material_consumption.uom',
  $$update public.wo_material_consumption set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'purchase_order_lines.uom',
  $$update public.purchase_order_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'transfer_order_lines.uom',
  $$update public.transfer_order_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'transfer_order_line_lps.uom',
  $$update public.transfer_order_line_lps set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'license_plates.uom',
  $$update public.license_plates set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'stock_moves.uom',
  $$update public.stock_moves set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'grn_items.uom',
  $$update public.grn_items set uom = 'pcs'
    where uom in ('szt', 'ea')
      -- V-WH-GRN-001: completed/cancelled GRN items are frozen history (trigger
      -- grn_items_block_completed_grn raises). Same ruling as bom_snapshots:
      -- leave frozen rows as-is; app normalizes piece codes on read.
      and grn_id in (select id from public.grns where status not in ('completed', 'cancelled'))$$
);
select pg_temp._migrate_piece_uom(
  'schedule_outputs.uom',
  $$update public.schedule_outputs set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'mrp_requirements.uom',
  $$update public.mrp_requirements set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'mrp_planned_orders.uom',
  $$update public.mrp_planned_orders set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'demand_forecasts.uom',
  $$update public.demand_forecasts set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'lp_genealogy.uom',
  $$update public.lp_genealogy set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'ccp_deviations.uom',
  $$update public.ccp_deviations set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'spare_parts.unit_of_measure',
  $$update public.spare_parts set unit_of_measure = 'pcs' where unit_of_measure in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'calibration_instruments.unit_of_measure',
  $$update public.calibration_instruments set unit_of_measure = 'pcs' where unit_of_measure in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wip_definitions.base_uom',
  $$update public.wip_definitions set base_uom = 'pcs' where base_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wip_definition_ingredients.uom',
  $$update public.wip_definition_ingredients set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'npd_wip_processes.throughput_uom',
  $$update public.npd_wip_processes set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'npd_process_defaults.throughput_uom',
  $$update public.npd_process_defaults set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'wip_definition_processes.throughput_uom',
  $$update public.wip_definition_processes set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'uom_custom_conversions.from_unit_code',
  $$update public.uom_custom_conversions set from_unit_code = 'pcs' where from_unit_code in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'uom_custom_conversions.to_unit_code',
  $$update public.uom_custom_conversions set to_unit_code = 'pcs' where to_unit_code in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'spare_parts_stock.uom',
  $$update public.spare_parts_stock set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'haccp_ccps.unit',
  $$update public.haccp_ccps set unit = 'pcs' where unit in ('szt', 'ea')$$
);

-- ── 2. JSONB snapshots (work_orders only; bom_snapshots are immutable — normalize on read) ──
select pg_temp._migrate_piece_uom(
  'work_orders.uom_snapshot.uom_base',
  $$update public.work_orders
      set uom_snapshot = jsonb_set(uom_snapshot, '{uom_base}', '"pcs"'::jsonb, false)
    where uom_snapshot is not null
      and uom_snapshot->>'uom_base' in ('szt', 'ea')$$
);

-- ── 3. unit_of_measure — ea → pcs (merge when both exist) ────────────────────
do $$
declare
  v_n integer;
begin
  -- When an org has both rows and ea is the count base, promote pcs before deleting ea.
  update public.unit_of_measure pcs
     set is_base = true
    from public.unit_of_measure ea
   where pcs.org_id = ea.org_id
     and pcs.code = 'pcs'
     and ea.code = 'ea'
     and pcs.deleted_at is null
     and ea.deleted_at is null
     and ea.is_base = true
     and pcs.is_base = false;
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: unit_of_measure pcs promoted to count base — % rows', v_n;

  -- Clear ea base flag so the partial unique index allows deletion when pcs exists.
  update public.unit_of_measure ea
     set is_base = false
   where ea.code = 'ea'
     and ea.deleted_at is null
     and ea.is_base = true
     and exists (
       select 1
         from public.unit_of_measure pcs
        where pcs.org_id = ea.org_id
          and pcs.code = 'pcs'
          and pcs.deleted_at is null
     );
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: unit_of_measure ea is_base cleared (both exist) — % rows', v_n;

  delete from public.unit_of_measure ea
   where ea.code = 'ea'
     and ea.deleted_at is null
     and exists (
       select 1
         from public.unit_of_measure pcs
        where pcs.org_id = ea.org_id
          and pcs.code = 'pcs'
          and pcs.deleted_at is null
     );
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: unit_of_measure ea deleted (pcs already present) — % rows', v_n;

  -- F1: hard-delete soft-deleted pcs rows that block ea→pcs rename (unique org_id,code).
  delete from public.unit_of_measure pcs
   where pcs.code = 'pcs'
     and pcs.deleted_at is not null
     and exists (
       select 1
         from public.unit_of_measure ea
        where ea.org_id = pcs.org_id
          and ea.code = 'ea'
          and ea.deleted_at is null
     );
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: unit_of_measure soft-deleted pcs purged (ea rename path) — % rows', v_n;

  update public.unit_of_measure
     set code = 'pcs',
         name = 'Each'
   where code = 'ea'
     and deleted_at is null;
  get diagnostics v_n = row_count;
  raise notice '449-unify-piece-uom-pcs: unit_of_measure ea renamed to pcs — % rows', v_n;
end;
$$;

-- ── 4. Reseed function for new orgs (064) ────────────────────────────────────
create or replace function public.seed_units_of_measure_for_org(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.unit_of_measure (org_id, category, code, name, factor_to_base, is_base)
  values
    (p_org_id, 'mass', 'kg', 'Kilogram', 1,         true),
    (p_org_id, 'mass', 'g',  'Gram',     0.001,     false),
    (p_org_id, 'mass', 'mg', 'Milligram',0.000001,  false),
    (p_org_id, 'mass', 't',  'Tonne',    1000,      false),
    (p_org_id, 'volume', 'L',  'Litre',      1,     true),
    (p_org_id, 'volume', 'mL', 'Millilitre', 0.001, false),
    (p_org_id, 'count', 'pcs',    'Each',   1,   true),
    (p_org_id, 'count', 'box',    'Box',    1,   false),
    (p_org_id, 'count', 'pallet', 'Pallet', 1,   false)
  on conflict (org_id, code) do nothing;
end;
$$;

-- ── 5. Final idempotent sweep (deploy-window mitigation; also in 449-postdeploy-sweep.sql) ──
-- Orchestrator: re-run packages/db/449-postdeploy-sweep.sql manually after deploy.
select pg_temp._migrate_piece_uom(
  'final-sweep: items.uom_base',
  $$update public.items set uom_base = 'pcs' where uom_base in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: items.uom_secondary',
  $$update public.items set uom_secondary = 'pcs' where uom_secondary in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: bom_lines.uom',
  $$update public.bom_lines set uom = 'pcs'
    where uom in ('szt', 'ea')
      -- bom_lines_reject_approved_header_update: lines under technical_approved/
      -- active headers are immutable (mig 090). 0 such rows at authoring time;
      -- skip-with-notice below if any ever appear (escalate to owner).
      and bom_header_id in (select id from public.bom_headers where status not in ('technical_approved', 'active'))$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: bom_co_products.uom',
  $$update public.bom_co_products set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: work_orders.uom',
  $$update public.work_orders set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wo_materials.uom',
  $$update public.wo_materials set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wo_outputs.uom',
  $$update public.wo_outputs set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wo_material_consumption.uom',
  $$update public.wo_material_consumption set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: purchase_order_lines.uom',
  $$update public.purchase_order_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: transfer_order_lines.uom',
  $$update public.transfer_order_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: transfer_order_line_lps.uom',
  $$update public.transfer_order_line_lps set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: license_plates.uom',
  $$update public.license_plates set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: stock_moves.uom',
  $$update public.stock_moves set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: grn_items.uom',
  $$update public.grn_items set uom = 'pcs'
    where uom in ('szt', 'ea')
      -- V-WH-GRN-001: completed/cancelled GRN items are frozen history (trigger
      -- grn_items_block_completed_grn raises). Same ruling as bom_snapshots:
      -- leave frozen rows as-is; app normalizes piece codes on read.
      and grn_id in (select id from public.grns where status not in ('completed', 'cancelled'))$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: schedule_outputs.uom',
  $$update public.schedule_outputs set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: mrp_requirements.uom',
  $$update public.mrp_requirements set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: mrp_planned_orders.uom',
  $$update public.mrp_planned_orders set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: demand_forecasts.uom',
  $$update public.demand_forecasts set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: lp_genealogy.uom',
  $$update public.lp_genealogy set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: ccp_deviations.uom',
  $$update public.ccp_deviations set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: spare_parts.unit_of_measure',
  $$update public.spare_parts set unit_of_measure = 'pcs' where unit_of_measure in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: calibration_instruments.unit_of_measure',
  $$update public.calibration_instruments set unit_of_measure = 'pcs' where unit_of_measure in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wip_definitions.base_uom',
  $$update public.wip_definitions set base_uom = 'pcs' where base_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wip_definition_ingredients.uom',
  $$update public.wip_definition_ingredients set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: npd_wip_processes.throughput_uom',
  $$update public.npd_wip_processes set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: npd_process_defaults.throughput_uom',
  $$update public.npd_process_defaults set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: wip_definition_processes.throughput_uom',
  $$update public.wip_definition_processes set throughput_uom = 'pcs' where throughput_uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: uom_custom_conversions.from_unit_code',
  $$update public.uom_custom_conversions set from_unit_code = 'pcs' where from_unit_code in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: uom_custom_conversions.to_unit_code',
  $$update public.uom_custom_conversions set to_unit_code = 'pcs' where to_unit_code in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: spare_parts_stock.uom',
  $$update public.spare_parts_stock set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: haccp_ccps.unit',
  $$update public.haccp_ccps set unit = 'pcs' where unit in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'final-sweep: work_orders.uom_snapshot.uom_base',
  $$update public.work_orders
      set uom_snapshot = jsonb_set(uom_snapshot, '{uom_base}', '"pcs"'::jsonb, false)
    where uom_snapshot is not null
      and uom_snapshot->>'uom_base' in ('szt', 'ea')$$
);

-- ── Frozen-row visibility: report legacy piece codes left in immutable rows ──
do $$
declare v_grn integer; v_bom integer;
begin
  select count(*) into v_grn from public.grn_items gi
    join public.grns g on g.id = gi.grn_id
   where gi.uom in ('szt', 'ea') and g.status in ('completed', 'cancelled');
  select count(*) into v_bom from public.bom_lines bl
    join public.bom_headers bh on bh.id = bl.bom_header_id
   where bl.uom in ('szt', 'ea') and bh.status in ('technical_approved', 'active');
  raise notice '449: frozen legacy rows left as-is (normalize-on-read) — grn_items: %, bom_lines(locked): %', v_grn, v_bom;
end
$$;

commit;
