-- Migration 376 — A3 slice-3 Phase 1: enrich npd_field_catalog with dropdown_source + blocking_rule.
-- These are the ONLY two per-field properties the FA render needs that the catalog did not yet carry
-- (mig 370 seeded code/label/data_type; mig 374 added is_auto/auto_source_field). With these, readDeptColumns
-- can be rewritten (Phase 2) to read the dynamic catalog instead of "Reference"."DeptColumns", killing the
-- duplication. Placed on npd_field_catalog (field-level: the same field always uses the same dropdown source
-- + price-gate rule regardless of department). Backfill from DeptColumns via the mig-370 join (code=column_key).
-- Idempotent (coalesce-only on NULLs). ZERO behaviour change on its own — the render still reads DeptColumns
-- until Phase 2 swaps readDeptColumns.

alter table public.npd_field_catalog
  add column if not exists dropdown_source text,
  add column if not exists blocking_rule   text;

update public.npd_field_catalog f
   set dropdown_source = dc.dropdown_source,
       blocking_rule   = dc.blocking_rule
  from (
    select distinct on (dc.org_id, dc.column_key)
           dc.org_id, dc.column_key, dc.dropdown_source, dc.blocking_rule
      from "Reference"."DeptColumns" dc
     where dc.dept_code <> 'System'
       and dc.column_key is not null
       and btrim(dc.column_key) <> ''
     order by dc.org_id, dc.column_key, coalesce(dc.display_order, 0)
  ) dc
 where f.org_id = dc.org_id
   and lower(f.code) = lower(dc.column_key)
   and (f.dropdown_source is null or f.blocking_rule is null);
