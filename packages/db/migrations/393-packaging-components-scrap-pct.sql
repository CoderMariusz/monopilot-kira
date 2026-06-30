-- Migration 393 — scrap % per packaging component (owner 2026-06-30).
--
-- NPD packaging components (box, label, …) lose a fraction to damage/setup during packing, but NPD has
-- no field to record it, so the generated BOM line always carries scrap_pct 0.00 and the WO never
-- over-requisitions packaging to cover the loss. bom_lines already has scrap_pct (shared-bom.ts:135);
-- this adds the same column to packaging_components so the NPD packaging editor can capture it and the
-- BOM generator (materialize-npd-bom) can propagate it onto the PM line, after which the WO material
-- requirement inflates required_qty by 1 / (1 - scrap_pct/100).
--
-- ADDITIVE, idempotent. Same precision/scale + bounds as bom_lines.scrap_pct.

alter table public.packaging_components
  add column if not exists scrap_pct numeric(5,2) not null default 0.00;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'packaging_components_scrap_pct_range'
       and conrelid = 'public.packaging_components'::regclass
  ) then
    alter table public.packaging_components
      add constraint packaging_components_scrap_pct_range
      check (scrap_pct >= 0 and scrap_pct <= 100.00);
  end if;
end $$;
