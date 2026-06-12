-- Migration 295: relax wo_outputs qty CHECK for correction counter-rows.
--
-- Wave R2 gap: migration 293 relaxed the signed-quantity rule on wo_waste_log
-- only; wo_outputs kept mig-181's `qty_kg >= 0` CHECK, so voidWoOutput's
-- negative counter-entry INSERT would fail at runtime (found by live-DDL
-- verification during the R2 review — mock-pg tests cannot catch this class).
--
-- Rule: original rows stay >= 0 (start-WO materializes legitimate 0-qty
-- placeholder rows, so zero must remain legal); correction rows (correction_of_id
-- NOT NULL) must be strictly negative so SUM(qty_kg) nets voided output out.
-- Idempotent: drop-if-exists + re-add (NOT VALID -> VALIDATE).

alter table public.wo_outputs
  drop constraint if exists wo_outputs_qty_kg_nonneg_check;

alter table public.wo_outputs
  add constraint wo_outputs_qty_kg_nonneg_check
  check (
    (correction_of_id is null and qty_kg >= 0)
    or
    (correction_of_id is not null and qty_kg < 0)
  ) not valid;

alter table public.wo_outputs
  validate constraint wo_outputs_qty_kg_nonneg_check;

comment on constraint wo_outputs_qty_kg_nonneg_check on public.wo_outputs is
  'Original output rows >= 0 (incl. start-WO 0-qty placeholders); correction rows (correction_of_id set, mig 293/Wave R2) are signed negative counter-entries.';
