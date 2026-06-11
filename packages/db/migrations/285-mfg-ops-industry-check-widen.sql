-- Migration 285: widen ManufacturingOperations.industry_code CHECK (W9-L5 FIX 2)
--
-- Root cause (2026-06-11 live clickthrough §1): creating a manufacturing
-- operation from /settings/reference/manufacturing-operations failed.
-- The create modal had no Industry field and silently derived
-- industryCode from the page filter — with the default "All industries"
-- filter it sent 'custom', and update/reset paths can send 'generic'.
-- The app-layer contract (actions/reference/manufacturing-ops/*.ts) allows
-- ('bakery','pharma','fmcg','generic','custom'), but migration 078 pinned the
-- table CHECK to ('bakery','pharma','fmcg') — so the insert was rejected by
-- the DB and the UI showed a generic "Unable to create".
--
-- Fix: align the CHECK with the app contract. Idempotent re-create.

alter table "Reference"."ManufacturingOperations"
  drop constraint if exists manufacturing_operations_industry_code_check;

alter table "Reference"."ManufacturingOperations"
  add constraint manufacturing_operations_industry_code_check
  check (industry_code in ('bakery', 'pharma', 'fmcg', 'generic', 'custom')) not valid;

alter table "Reference"."ManufacturingOperations"
  validate constraint manufacturing_operations_industry_code_check;
