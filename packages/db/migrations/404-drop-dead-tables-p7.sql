-- 404-drop-dead-tables-p7.sql
-- DB cleanup audit P7 (owner: drop all confirmed-dead). Applied AFTER the repoint commit
-- (1cce1640) deployed READY, so no live code reads a dropped object. No inbound FKs to any
-- target (verified live). Placeholder tables (mig 014) + schema-only finance tables (mig 199)
-- + fa_bom_view (0-rows-by-design) + the decorative uom_reference reference rows.
-- KEPT: public.work_order_items (live catch-weight cron source); public.work_orders (canonical).
drop view  if exists public.fa_bom_view;
drop table if exists public.lot;
drop table if exists public.quality_event;
drop table if exists public.bom_item;
drop table if exists public.shipment;
drop table if exists public.work_order;
drop table if exists public.wo_actual_costing;
drop table if exists public.inventory_cost_layers;
drop table if exists public.cost_variances;
drop table if exists public.d365_finance_dlq;
drop table if exists public.standard_costs;
delete from public.reference_tables where table_code = 'uom_reference';
