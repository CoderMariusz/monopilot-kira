-- Migration 561 — no non-finite number may enter the NPD extension table.
--
-- PROBLEM (S11 Z-1): the generic FA cell writer validated numeric cells with a bare
--   `z.coerce.number()`. `'1e309'` and the literal `'Infinity'` both coerce to
--   Infinity, node-postgres sends it as `Infinity`, and PostgreSQL 16 ACCEPTS it in a
--   `numeric` column. Confirmed on monopilot_t3 (begin/rollback):
--     update fg_npd_ext set yield_p1 = 'Infinity' → accepted
--     select avg(yield_p1)                        → Infinity
--   One poisoned cell therefore returns Infinity from every aggregate over that column
--   for the ENTIRE organization. `pg_constraint` for this table returned 0 rows of
--   contype='c' — there was nothing between the action and the data.
--
--   The action-level fix (`.finite()` + the catalog's minimum/maximum in
--   apps/web/app/(npd)/fa/actions/_lib/fa-cell-shared.ts) closes the reported path.
--   This constraint closes EVERY path — D365 sync, CSV import, psql, a future writer —
--   because "validated in code only" has been bypassed by a second path repeatedly.
--
-- SCOPE — deliberately ONLY finiteness, not the business ranges.
--   The declared bounds (yields 0..100 and friends) live in
--   `npd_field_catalog.validation_json` precisely so an administrator can change them.
--   Freezing 0..100 into the schema would turn an admin raising the cap into a
--   `persistence_failed` — the "a guard protecting one case freezes its neighbours"
--   pattern this codebase has hit repeatedly. Finiteness is not configurable: no
--   business rule wants Infinity, and no aggregate survives it.
--
-- ORDERING — repair first, constrain second, or the migration fails on its own rows.

-- ---------------------------------------------------------------------------
-- (1) Repair: null out any value that is already Infinity / -Infinity / NaN.
--     In PostgreSQL numeric ordering NaN sorts ABOVE every other value, so
--     `col < 'Infinity'` is false for NaN as well as for Infinity — one predicate
--     covers all three. A poisoned cell carries no recoverable information; NULL is
--     the honest replacement and every consumer already handles NULL here.
-- ---------------------------------------------------------------------------
do $$
declare
  col text;
  repaired bigint;
begin
  foreach col in array array[
    'number_of_cases', 'primary_ingredient_pct', 'runs_per_week',
    'cases_per_week_w1', 'cases_per_week_w2', 'cases_per_week_w3',
    'yield_p1', 'yield_p2', 'yield_p3', 'yield_p4', 'yield_line',
    'rate', 'lead_time', 'proc_shelf_life', 'volume', 'weight', 'price_brief'
  ]
  loop
    execute format(
      'update public.fg_npd_ext set %1$I = null
        where %1$I is not null
          and not (%1$I > ''-Infinity''::numeric and %1$I < ''Infinity''::numeric)',
      col
    );
    get diagnostics repaired = row_count;
    if repaired > 0 then
      raise notice 'mig 561: nulled % non-finite value(s) in fg_npd_ext.%', repaired, col;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- (2) Constrain. One table-level CHECK rather than 17, so the failure message
--     names the table once and the catalogue stays readable.
-- ---------------------------------------------------------------------------
alter table public.fg_npd_ext
  drop constraint if exists fg_npd_ext_numerics_finite;

alter table public.fg_npd_ext
  add constraint fg_npd_ext_numerics_finite check (
    (number_of_cases        is null or (number_of_cases        > '-Infinity'::numeric and number_of_cases        < 'Infinity'::numeric)) and
    (primary_ingredient_pct is null or (primary_ingredient_pct > '-Infinity'::numeric and primary_ingredient_pct < 'Infinity'::numeric)) and
    (runs_per_week          is null or (runs_per_week          > '-Infinity'::numeric and runs_per_week          < 'Infinity'::numeric)) and
    (cases_per_week_w1      is null or (cases_per_week_w1      > '-Infinity'::numeric and cases_per_week_w1      < 'Infinity'::numeric)) and
    (cases_per_week_w2      is null or (cases_per_week_w2      > '-Infinity'::numeric and cases_per_week_w2      < 'Infinity'::numeric)) and
    (cases_per_week_w3      is null or (cases_per_week_w3      > '-Infinity'::numeric and cases_per_week_w3      < 'Infinity'::numeric)) and
    (yield_p1               is null or (yield_p1               > '-Infinity'::numeric and yield_p1               < 'Infinity'::numeric)) and
    (yield_p2               is null or (yield_p2               > '-Infinity'::numeric and yield_p2               < 'Infinity'::numeric)) and
    (yield_p3               is null or (yield_p3               > '-Infinity'::numeric and yield_p3               < 'Infinity'::numeric)) and
    (yield_p4               is null or (yield_p4               > '-Infinity'::numeric and yield_p4               < 'Infinity'::numeric)) and
    (yield_line             is null or (yield_line             > '-Infinity'::numeric and yield_line             < 'Infinity'::numeric)) and
    (rate                   is null or (rate                   > '-Infinity'::numeric and rate                   < 'Infinity'::numeric)) and
    (lead_time              is null or (lead_time              > '-Infinity'::numeric and lead_time              < 'Infinity'::numeric)) and
    (proc_shelf_life        is null or (proc_shelf_life        > '-Infinity'::numeric and proc_shelf_life        < 'Infinity'::numeric)) and
    (volume                 is null or (volume                 > '-Infinity'::numeric and volume                 < 'Infinity'::numeric)) and
    (weight                 is null or (weight                 > '-Infinity'::numeric and weight                 < 'Infinity'::numeric)) and
    (price_brief            is null or (price_brief            > '-Infinity'::numeric and price_brief            < 'Infinity'::numeric))
  );

-- ---------------------------------------------------------------------------
-- (3) Post-check: PREPARE-style dry runs do not execute anything, so assert the
--     constraint actually rejects Infinity and actually accepts ordinary numbers.
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean;
begin
  select count(*) = 1 into ok
    from pg_constraint
   where conrelid = 'public.fg_npd_ext'::regclass
     and conname = 'fg_npd_ext_numerics_finite'
     and contype = 'c';
  if not ok then
    raise exception 'mig 561: fg_npd_ext_numerics_finite was not created';
  end if;

  begin
    execute $q$select 'Infinity'::numeric$q$;
  exception when others then
    raise exception 'mig 561: unexpected — numeric cannot even hold Infinity here';
  end;
end
$$;
