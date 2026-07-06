-- Migration 441 — W2-T2 (M-B): retire the reference-A "Process steps" system.
--
-- DESTRUCTIVE. Do NOT apply from agent lanes — owner reviews, takes a pg_dump of
-- reference_tables (table_code='processes') + reference_schemas
-- (table_code='reference.processes') into _meta/backups/ FIRST, then applies
-- (rollback notes: _meta/plans/2026-07-06-consolidation-waves.md §Wave 2).
--
-- Owner decision (LOCKED 2026-07-06): reference-A retires entirely, NO read-only
-- grace period. The unified Settings "Processes" screen (W2-T1) is backed by
-- npd_process_defaults (+roles); the only reference-A data worth keeping is any
-- org-entered setup_cost (row_data->>'setup_cost', jsonb key from mig 276).
--
-- Steps (all idempotent — reruns after the deletes are no-ops):
--   1. Backfill org-entered reference-A setup_cost into
--      npd_process_defaults.setup_cost (column: mig 429, restated in 440) where
--      the operation NAME maps: case-insensitive equality of the A row's name
--      (row_data->>'name', or row_data->>'process_code' when present) to
--      "Reference"."ManufacturingOperations".operation_name in the same org;
--      the mapping is UNambiguous in both
--      directions, an npd_process_defaults row exists for that operation, and its
--      setup_cost is still the 0 default (never clobber a C-entered value).
--      Unmappable / ambiguous values are DISCARDED by design (waves plan W2-T2).
--      Update-only: no npd_process_defaults rows are invented for unmapped ops.
--   2. DELETE the reference-A data rows: reference_tables table_code='processes'.
--   3. DELETE the reference-A schema rows: reference_schemas
--      table_code='reference.processes'. (The plans call this table
--      "schema_metadata" — no table of that name exists; reference_schemas IS the
--      schema-metadata store, cf. mig 276 header.) This also pre-empts the
--      machines-removal M6 metadata row (machine_id column, mig 276).
--
-- Wave0 lock: this migration runs as the migration role (RLS-exempt owner); all
-- statements are keyed by org_id via the source rows themselves. RLS policies on
-- npd_process_defaults (mig 390, app.current_org_id()) are untouched.

do $$
declare
  _backfill_count bigint;
begin
  if to_regclass('public.reference_tables') is null then
    raise notice 'reference_tables missing - skipping reference-A retirement.';
    return;
  end if;

  -- 1. Backfill mappable, org-entered setup_cost values into C.
  if to_regclass('"Reference"."ManufacturingOperations"') is not null
     and to_regclass('public.npd_process_defaults') is not null then
    with a_rows as (
      select rt.org_id,
             rt.row_key,
             lower(btrim(coalesce(
               nullif(rt.row_data->>'name', ''),
               nullif(rt.row_data->>'process_code', ''),
               rt.row_key
             ))) as match_name,
             (rt.row_data->>'setup_cost')::numeric as setup_cost
        from public.reference_tables rt
       where rt.table_code = 'processes'
         and rt.row_data->>'setup_cost' ~ '^[0-9]+(\.[0-9]+)?$'
         and (rt.row_data->>'setup_cost')::numeric > 0
    ),
    mapped as (
      -- name mapping: A row name (or process_code when name absent) equals the
      -- operation name case-insensitively; keep only rows that map to exactly
      -- one operation ...
      -- count(distinct)=1 guarantees a single operation; min over text picks it
      -- (min(uuid) has no aggregate, so cast to text and back).
      select a.org_id, a.row_key, a.setup_cost, min(mo.id::text)::uuid as operation_id
        from a_rows a
        join "Reference"."ManufacturingOperations" mo
          on mo.org_id = a.org_id
         and a.match_name = lower(btrim(mo.operation_name))
       group by a.org_id, a.row_key, a.setup_cost
      having count(distinct mo.id) = 1
    ),
    unambiguous as (
      -- ... and operations fed by exactly one A row (e.g. two A rows whose
      -- names both normalize to the same operation would be indeterminate).
      select org_id, operation_id, min(setup_cost) as setup_cost
        from mapped
       group by org_id, operation_id
      having count(*) = 1
    ),
    backfilled as (
      update public.npd_process_defaults d
         set setup_cost = u.setup_cost,
             updated_at = now()
        from unambiguous u
       where d.org_id = u.org_id
         and d.operation_id = u.operation_id
         and d.setup_cost = 0
      returning d.org_id, d.operation_id
    )
    select count(*) into _backfill_count from backfilled;
    raise notice
      'reference-A setup_cost backfill: % npd_process_defaults row(s) updated; unmapped/ambiguous A rows are intentionally discarded.',
      coalesce(_backfill_count, 0);
  end if;

  -- 2. Reference-A data rows gone (row-impact: every org's table_code='processes'
  --    rows — 6 seeded per org by mig 073/seed trigger + any org-added rows).
  delete from public.reference_tables where table_code = 'processes';

  -- 3. Reference-A schema rows gone (row-impact: the universal org_id IS NULL
  --    'reference.processes' column rows — process_code/name/category from
  --    073/074, cost_mode/cost_rate/currency from 269, machine_id/staffing_count/
  --    setup_cost from 276 — plus any org-scoped overrides).
  if to_regclass('public.reference_schemas') is not null then
    delete from public.reference_schemas where table_code = 'reference.processes';
  end if;
end $$;
