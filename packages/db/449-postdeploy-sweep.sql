-- R3.3 post-deploy piece-UOM sweep (MANUAL — not run by schema_migrations).
--
-- Purpose: re-normalize szt/ea → pcs after migration 449-unify-piece-uom-pcs.sql
-- when old application code wrote legacy codes during the Vercel build/deploy window.
-- The orchestrator runs this file manually once deploy is live (psql / Supabase SQL).
--
-- Idempotent: safe to re-run; only rows still holding szt/ea are touched.
-- Copy kept next to packages/db/migrations/449-unify-piece-uom-pcs.sql.

begin;

create or replace function pg_temp._migrate_piece_uom(p_label text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_n integer;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  raise notice '449-postdeploy-sweep: % — % rows', p_label, v_n;
end;
$$;

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
  $$update public.bom_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
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
  $$update public.grn_items set uom = 'pcs' where uom in ('szt', 'ea')$$
);
select pg_temp._migrate_piece_uom(
  'sales_order_lines.uom',
  $$update public.sales_order_lines set uom = 'pcs' where uom in ('szt', 'ea')$$
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
select pg_temp._migrate_piece_uom(
  'work_orders.uom_snapshot.uom_base',
  $$update public.work_orders
      set uom_snapshot = jsonb_set(uom_snapshot, '{uom_base}', '"pcs"'::jsonb, false)
    where uom_snapshot is not null
      and uom_snapshot->>'uom_base' in ('szt', 'ea')$$
);

commit;
