-- Migration 297: relax wo_material_consumption qty CHECK for correction counter-rows.
--
-- Wave R3 reverseConsumption writes signed negative counter-entries against
-- posted consumption rows. The original mig-181 table had no correction_of_id
-- and kept qty_consumed strictly positive, so reversal rows need the same
-- signed correction pattern used by waste/output corrections.

alter table public.wo_material_consumption
  add column if not exists correction_of_id uuid;

comment on column public.wo_material_consumption.correction_of_id is
  'Soft self-reference to the original wo_material_consumption row corrected by this counter-entry. No FK: ledger retention/export must not couple correction rows to source-row lifecycle.';

create index if not exists idx_wo_material_consumption_correction_of_id
  on public.wo_material_consumption (correction_of_id)
  where correction_of_id is not null;

alter table public.wo_material_consumption
  drop constraint if exists wo_material_consumption_qty_consumed_positive_check;

alter table public.wo_material_consumption
  add constraint wo_material_consumption_qty_consumed_positive_check
  check (
    (correction_of_id is null and qty_consumed > 0)
    or
    (correction_of_id is not null and qty_consumed < 0)
  ) not valid;

alter table public.wo_material_consumption
  validate constraint wo_material_consumption_qty_consumed_positive_check;

comment on constraint wo_material_consumption_qty_consumed_positive_check on public.wo_material_consumption is
  'Original consumption rows must be positive; correction rows (correction_of_id set) are signed negative counter-entries so ledger sums naturally net reversed consumption out.';

create unique index if not exists uq_wo_material_consumption_one_correction
  on public.wo_material_consumption (org_id, correction_of_id)
  where correction_of_id is not null;

comment on index public.uq_wo_material_consumption_one_correction is
  'Wave R3 hardening: at most one counter-entry per original consumption row. Backstops the service-layer already-corrected pre-check under concurrent reversals (app maps 23505 to already_corrected).';
