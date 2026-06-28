# A3 slice-3 — FA render: DeptColumns → npd_field_catalog (kill the duplication)

Vetted design (read-only scout, 2026-06-28). The 3-section LAYOUT (slice-2) is shipped + live; slice-3
swaps only the field DATA SOURCE so the dynamic catalog (+ Settings NPD field-config + A2 auto-fields)
becomes authoritative for the FA render. **GO. ~2.5h. Hard prerequisite: Phase 1 backfill before Phase 2.**

## The gap (what the catalog lacks)
The current render's column contract (page.tsx `DeptColumnRow` → `mapDeptColumn` → `GenericDeptColumn`)
needs per-field metadata. After mig 370 (catalog seed) + mig 374 (is_auto/auto_source_field), the ONLY
missing pieces are **2 columns**: `dropdown_source` + `blocking_rule`. Everything else is covered:
- `required_for_done` → `npd_department_field.required`
- `display_order` → `npd_department_field.display_order`
- `visible` → `npd_department_field.visible` (net-new: lets Settings HIDE a field)
- `data_type` → `npd_field_catalog.data_type` (`field_type` is the legacy alias; not needed)
- `is_auto` / `auto_source_field` → already on `npd_field_catalog` (mig 374)
- `marker` → not consumed by the render; skip. `MONO_KEYS` (bar_codes, dev_code) → hardcoded render hint; keep.

## Phase 1 — mig 376 enrichment (ZERO-RISK, additive; do FIRST, verify before Phase 2)
```sql
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
     where dc.dept_code <> 'System' and dc.column_key is not null and btrim(dc.column_key) <> ''
     order by dc.org_id, dc.column_key, coalesce(dc.display_order, 0)
  ) dc
 where f.org_id = dc.org_id and lower(f.code) = lower(dc.column_key)
   and (f.dropdown_source is null or f.blocking_rule is null);
```
Verify: `select code, dropdown_source from npd_field_catalog where org_id='…0002'` shows PackSizes/CloseConfirm/etc.
(dropdown_source/blocking_rule are field-level, not assignment-level — same field always uses the same source.)

## Phase 2 — render swap (one file: page.tsx `readDeptColumns` SQL; components + mapDeptColumn UNCHANGED)
Replace the readDeptColumns SQL (page.tsx ~240-270) with the catalog join — it must emit the SAME aliases
mapDeptColumn already reads:
```sql
select lower(f.code) as physical_column, f.code as column_key,
       null::text as field_type, f.data_type as data_type,
       df.required as required_for_done, f.dropdown_source as dropdown_source,
       f.blocking_rule as blocking_rule, df.display_order as display_order,
       coalesce(f.is_auto,false) as is_auto, f.auto_source_field as auto_source_field
  from public.npd_departments d
  join public.npd_department_field df on df.department_id=d.id and df.org_id=d.org_id and df.visible=true
  join public.npd_field_catalog f on f.id=df.field_id and f.org_id=df.org_id and f.active=true
 where d.org_id=app.current_org_id() and lower(d.code)=lower($1::text) and d.active=true
 order by df.display_order asc nulls last, f.code asc;
```
mapDeptColumn already does `row.data_type ?? row.field_type ?? 'string'` so `field_type=null` is safe.
`readDropdowns` (keyed by dropdownSource against the hardcoded `DROPDOWN_SOURCE_TABLE` allow-list) is UNCHANGED.
Tab components are UNCHANGED (same GenericDeptColumn shape).

## Phase 3 — verify (browser): all 7 dept tabs render correct fields/dropdowns/required-markers/auto-styling/price-gate; run the FA vitest suite.

## SCOPED OUT — slice-4 (write path still DeptColumns-authoritative; document the residual split-brain)
These still read "Reference"."DeptColumns" directly and are NOT changed by slice-3:
- `apps/web/app/(npd)/fa/actions/update-fa-cell.ts` `loadDeptColumn` (write authorization).
- DB fn `is_all_required_filled` (mig 097) — the dept-CLOSE gate. So after slice-3, a Settings `required`
  toggle changes the amber alert + gate strip but NOT the actual close-gate until slice-4. Document it.
- `get-required-fields-for-dept.ts`, `close-dept-section.ts` (close modal checklist).

## Risks
1. HIGH: Phase 2 BEFORE Phase 1 backfill = empty dropdowns org-wide. Phase 1 is a hard gate.
2. New-org seeding gap (pre-existing, noted in mig 370): new orgs get the DeptColumns seed but not the catalog
   — needs an org-creation trigger eventually (out of slice-3 scope).
3. A field in the catalog but not DeptColumns would be read-only in the FA (update-fa-cell rejects) until slice-4 — acceptable.

Key files: page.tsx:181-270; lib/npd/derive-dept-statuses.ts:35-52 (GenericDeptColumn); mig 370 (join pattern);
mig 374 (is_auto); mig 097 (is_all_required_filled); update-fa-cell.ts:117-135; settings npd-field-config.ts.
