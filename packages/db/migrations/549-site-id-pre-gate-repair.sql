-- Migration 549 — repair site_id on every table migration 551 audits, BEFORE the gate.
--
-- WHY THIS NUMBER (549) AND NOT THE NEXT FREE ONE (565)
--   packages/db/scripts/migrate.ts sorts strictly by the 3-digit prefix and applies
--   pending files in that order, each in its own transaction, stopping at the first
--   failure. Migration 551 refuses to flip app.user_can_see_site() to fail-closed while
--   ANY table carrying a RESTRICTIVE user_can_see_site(site_id) policy still has
--   site_id IS NULL. Anything numbered above 551 therefore cannot unblock it.
--     * 550 repairs wo_outputs / wo_events / downtime_events / sales_orders /
--       sales_order_lines / shipments / warehouses  -> runs BEFORE the gate. Good.
--     * 557 repairs license_plates                  -> runs AFTER the gate. Too late.
--     * NOTHING repairs schedule_outputs / quality_inspections / ncr_reports at all.
--   Measured on production (dry run, rolled back): after 549+550 the first group is
--   clean, and the gate still refuses on schedule_outputs 19, quality_inspections 4,
--   ncr_reports 2. Those three are repaired here as well.
--
-- ORDER INSIDE THIS FILE IS LOAD-BEARING
--   license_plates -> schedule_outputs -> quality_inspections -> ncr_reports.
--   A quality inspection can hang off a license plate, and an NCR can hang off an
--   inspection, so each block consumes the site_id the previous block just repaired.
--
-- WHAT IT DOES NOT DO (blocks 1-4)
--   No default, no fallback, no "single active site" guess. A wrong site_id silently
--   shows one plant another plant's stock, quality records and non-conformances, which
--   is worse than a NULL that keeps the gate shut. Only same-org operational evidence
--   is used, and only when every piece of evidence agrees on exactly one site. Rows that
--   stay NULL are listed individually in the post-check, never left anonymous.
--
-- THE ONE EXCEPTION (block 5/5)
--   Block 5 stamps the organization's default site onto exactly two rows that have no
--   relations at all: NCR-00001004 and NCR-00001005, closed test scaffolding left in the
--   live database by a browser audit on 2026-07-15. This is an owner decision about two
--   specific pieces of litter, NOT a general rule — read the block's own comment before
--   extending it. Its filter requires reference_type, reference_id, linked_hold_id AND
--   product_id to all be NULL, so it cannot reach a real quality record.
--
-- 557 is left untouched and becomes a no-op after this migration: both are guarded by
-- `where site_id is null`, so whichever runs first wins and the second updates 0 rows.

-- Same temp-table pattern as migration 550: explicit drop at the end, NOT `on commit
-- drop`. The runner wraps every migration in one transaction, where both work — but with
-- `on commit drop` a manual `psql -f` dry-run (no explicit BEGIN) loses the table the
-- instant the CREATE autocommits, and the very next INSERT fails. `if not exists` +
-- truncate keeps the file re-runnable inside a single psql session.
create temporary table if not exists migration_549_site_candidates (
  entity     text not null,
  subject_id uuid not null,
  org_id     uuid not null,
  site_id    uuid not null,
  source     text not null
);
truncate table migration_549_site_candidates;

-- ===========================================================================
-- 1/5 license_plates
-- ===========================================================================
-- A license plate is a physical carrier; site_id NULL is never a legal cross-site
-- state. Evidence: the LP warehouse, the LP location's warehouse, the GRN header /
-- GRN item / GRN's purchase order, stock adjustments, the count session behind an
-- adjustment, stock moves, lp_state_history, the producing work order, the wo_output
-- that created the plate, and the destination warehouse of a received transfer.
-- Note the warehouse itself frequently has no site (measured: 227 of 246 on the test
-- clone), which is exactly why the other twelve sources matter.
with null_lps as (
  select lp.id, lp.org_id, lp.warehouse_id, lp.location_id, lp.grn_id, lp.wo_id
    from public.license_plates lp
   where lp.site_id is null
),
candidate_rows as (
  select lp.id as subject_id, lp.org_id, warehouse.site_id, 'lp_warehouse'::text as source
    from null_lps lp
    join public.warehouses warehouse
      on warehouse.id = lp.warehouse_id
     and warehouse.org_id = lp.org_id
   where warehouse.site_id is not null

  union all
  select lp.id, lp.org_id, location_warehouse.site_id, 'lp_location_warehouse'
    from null_lps lp
    join public.locations location
      on location.id = lp.location_id
     and location.org_id = lp.org_id
    join public.warehouses location_warehouse
      on location_warehouse.id = location.warehouse_id
     and location_warehouse.org_id = location.org_id
   where location_warehouse.site_id is not null

  union all
  select lp.id, lp.org_id, grn.site_id, 'grn'
    from null_lps lp
    join public.grns grn on grn.id = lp.grn_id and grn.org_id = lp.org_id
   where grn.site_id is not null

  union all
  select lp.id, lp.org_id, grn_item.site_id, 'grn_item'
    from null_lps lp
    join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
   where grn_item.site_id is not null

  union all
  select lp.id, lp.org_id, grn.site_id, 'grn_item_header'
    from null_lps lp
    join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
    join public.grns grn on grn.id = grn_item.grn_id and grn.org_id = grn_item.org_id
   where grn.site_id is not null

  union all
  select lp.id, lp.org_id, purchase_order.site_id, 'grn_purchase_order'
    from null_lps lp
    join public.grns grn on grn.id = lp.grn_id and grn.org_id = lp.org_id
    join public.purchase_orders purchase_order
      on purchase_order.id = grn.po_id
     and purchase_order.org_id = grn.org_id
   where purchase_order.site_id is not null

  union all
  select lp.id, lp.org_id, adjustment.site_id, 'stock_adjustment'
    from null_lps lp
    join public.stock_adjustments adjustment
      on adjustment.lp_id = lp.id
     and adjustment.org_id = lp.org_id
   where adjustment.site_id is not null

  union all
  select lp.id, lp.org_id, count_session.site_id, 'count_session'
    from null_lps lp
    join public.stock_adjustments adjustment
      on adjustment.lp_id = lp.id
     and adjustment.org_id = lp.org_id
    join public.count_lines count_line
      on count_line.id = adjustment.count_line_id
     and count_line.org_id = adjustment.org_id
    join public.count_sessions count_session
      on count_session.id = count_line.session_id
     and count_session.org_id = count_line.org_id
   where count_session.site_id is not null

  union all
  select lp.id, lp.org_id, move.site_id, 'stock_move'
    from null_lps lp
    join public.stock_moves move on move.lp_id = lp.id and move.org_id = lp.org_id
   where move.site_id is not null

  union all
  select lp.id, lp.org_id, history.site_id, 'lp_state_history'
    from null_lps lp
    join public.lp_state_history history on history.lp_id = lp.id and history.org_id = lp.org_id
   where history.site_id is not null

  union all
  select lp.id, lp.org_id, work_order.site_id, 'work_order'
    from null_lps lp
    join public.work_orders work_order on work_order.id = lp.wo_id and work_order.org_id = lp.org_id
   where work_order.site_id is not null

  union all
  select lp.id, lp.org_id, output.site_id, 'wo_output'
    from null_lps lp
    join public.wo_outputs output on output.lp_id = lp.id and output.org_id = lp.org_id
   where output.site_id is not null

  union all
  select lp.id, lp.org_id, destination_warehouse.site_id, 'transfer_destination_warehouse'
    from null_lps lp
    join public.transfer_order_line_lps transfer_lp
      on transfer_lp.dest_lp_id = lp.id
     and transfer_lp.org_id = lp.org_id
    join public.transfer_orders transfer_order
      on transfer_order.id = transfer_lp.to_id
     and transfer_order.org_id = transfer_lp.org_id
    join public.warehouses destination_warehouse
      on destination_warehouse.id = transfer_order.to_warehouse_id
     and destination_warehouse.org_id = transfer_order.org_id
   where destination_warehouse.site_id is not null
)
insert into migration_549_site_candidates (entity, subject_id, org_id, site_id, source)
select 'license_plates', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
  from candidate_rows candidate
  -- A candidate site that does not belong to the subject's own org is not evidence,
  -- it is the exact cross-tenant leak this gate exists to prevent.
  join public.sites site
    on site.id = candidate.site_id
   and site.org_id = candidate.org_id;

do $$
declare
  v_updated integer;
begin
  with resolved as (
    select candidate.subject_id,
           (array_agg(distinct candidate.site_id order by candidate.site_id))[1] as site_id,
           count(distinct candidate.site_id) as site_count
      from migration_549_site_candidates candidate
     where candidate.entity = 'license_plates'
     group by candidate.subject_id
  )
  update public.license_plates lp
     set site_id = resolved.site_id,
         updated_at = pg_catalog.now()
    from resolved
   where lp.id = resolved.subject_id
     and lp.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 549 backfill: license_plates updated=%', v_updated;
end
$$;

-- ===========================================================================
-- 2/5 schedule_outputs
-- ===========================================================================
-- Unambiguous by construction: schedule_outputs.planned_wo_id is NOT NULL with a hard
-- FK to work_orders ON DELETE CASCADE, so the parent work order always exists. Its
-- production line is the same fallback migration 550 uses for wo_outputs/wo_events.
--
-- downstream_wo_id is deliberately NOT used as evidence. A schedule_output is the
-- planning-time projection of what the PLANNED work order produces (schema comment,
-- schema/schedule-outputs.ts); downstream_wo_id is where that output is consumed next,
-- and with disposition='direct_continue' that can legitimately be a different site.
-- Treating it as a second witness would do real damage in both directions: a legal
-- cross-site continue would look like "conflicting evidence" and freeze a row whose
-- answer is unambiguous, and if the planned WO ever lacked a site we would stamp the
-- CONSUMING site instead of the producing one.
with null_outputs as (
  select so.id, so.org_id, so.planned_wo_id
    from public.schedule_outputs so
   where so.site_id is null
),
candidate_rows as (
  select so.id as subject_id, so.org_id, planned_wo.site_id, 'planned_work_order'::text as source
    from null_outputs so
    join public.work_orders planned_wo
      on planned_wo.id = so.planned_wo_id
     and planned_wo.org_id = so.org_id
   where planned_wo.site_id is not null

  union all
  select so.id, so.org_id, planned_line.site_id, 'planned_work_order_line'
    from null_outputs so
    join public.work_orders planned_wo
      on planned_wo.id = so.planned_wo_id
     and planned_wo.org_id = so.org_id
    join public.production_lines planned_line
      on planned_line.id = planned_wo.production_line_id
     and planned_line.org_id = planned_wo.org_id
   where planned_wo.site_id is null
     and planned_line.site_id is not null
)
insert into migration_549_site_candidates (entity, subject_id, org_id, site_id, source)
select 'schedule_outputs', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
  from candidate_rows candidate
  join public.sites site
    on site.id = candidate.site_id
   and site.org_id = candidate.org_id;

do $$
declare
  v_updated integer;
begin
  with resolved as (
    select candidate.subject_id,
           (array_agg(distinct candidate.site_id order by candidate.site_id))[1] as site_id,
           count(distinct candidate.site_id) as site_count
      from migration_549_site_candidates candidate
     where candidate.entity = 'schedule_outputs'
     group by candidate.subject_id
  )
  update public.schedule_outputs so
     set site_id = resolved.site_id
    from resolved
   where so.id = resolved.subject_id
     and so.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 549 backfill: schedule_outputs updated=%', v_updated;
end
$$;

-- ===========================================================================
-- 3/5 quality_inspections
-- ===========================================================================
-- Polymorphic subject: reference_type is NOT NULL and constrained to
-- ('lp', 'grn', 'wo_output'), reference_id points at that table's row. All three
-- targets carry a site.
--
-- The wo_output branch deliberately reads through to work_orders and does NOT rely on
-- wo_outputs.site_id: that column is repaired by migration 550, which runs AFTER this
-- file. work_orders.site_id is the canonical source and is already complete.
-- The lp branch relies on block 1/5 above having just repaired license_plates.
with null_inspections as (
  select qi.id, qi.org_id, qi.reference_type, qi.reference_id
    from public.quality_inspections qi
   where qi.site_id is null
),
candidate_rows as (
  select qi.id as subject_id, qi.org_id, lp.site_id, 'reference_lp'::text as source
    from null_inspections qi
    join public.license_plates lp on lp.id = qi.reference_id and lp.org_id = qi.org_id
   where qi.reference_type = 'lp'
     and lp.site_id is not null

  union all
  select qi.id, qi.org_id, grn.site_id, 'reference_grn'
    from null_inspections qi
    join public.grns grn on grn.id = qi.reference_id and grn.org_id = qi.org_id
   where qi.reference_type = 'grn'
     and grn.site_id is not null

  union all
  select qi.id, qi.org_id, coalesce(output.site_id, output_wo.site_id), 'reference_wo_output'
    from null_inspections qi
    join public.wo_outputs output on output.id = qi.reference_id and output.org_id = qi.org_id
    left join public.work_orders output_wo
      on output_wo.id = output.wo_id
     and output_wo.org_id = output.org_id
   where qi.reference_type = 'wo_output'
     and coalesce(output.site_id, output_wo.site_id) is not null
)
insert into migration_549_site_candidates (entity, subject_id, org_id, site_id, source)
select 'quality_inspections', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
  from candidate_rows candidate
  join public.sites site
    on site.id = candidate.site_id
   and site.org_id = candidate.org_id;

do $$
declare
  v_updated integer;
begin
  with resolved as (
    select candidate.subject_id,
           (array_agg(distinct candidate.site_id order by candidate.site_id))[1] as site_id,
           count(distinct candidate.site_id) as site_count
      from migration_549_site_candidates candidate
     where candidate.entity = 'quality_inspections'
     group by candidate.subject_id
  )
  update public.quality_inspections qi
     set site_id = resolved.site_id
    from resolved
   where qi.id = resolved.subject_id
     and qi.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 549 backfill: quality_inspections updated=%', v_updated;
end
$$;

-- ===========================================================================
-- 4/5 ncr_reports
-- ===========================================================================
-- Two independent witnesses, so unanimity is a real check here, not a formality:
--   * the polymorphic reference (reference_type / reference_id), and
--   * linked_hold_id -> quality_holds.site_id.
-- reference_type is NULLABLE and allows nine values. Two of them are deliberately not
-- resolvable and are left NULL:
--   * 'batch'    — there is no batches table; a batch is a number on a plate/output,
--                  not a row this uuid can be joined to.
--   * 'supplier' — public.suppliers has no site_id at all; a supplier NCR is an
--                  org-level record, so inventing a site for it would be pure guesswork.
-- The 'inspection' branch relies on block 3/5 above having just repaired
-- quality_inspections.
--
-- Note: quality_inspections_site_id_fkey is ON DELETE SET NULL, i.e. deleting a site
-- silently NULLs the inspections that pointed at it. That is a live producer of the
-- very rows this migration repairs, and it is not fixed here.
with null_ncrs as (
  select ncr.id, ncr.org_id, ncr.reference_type, ncr.reference_id, ncr.linked_hold_id
    from public.ncr_reports ncr
   where ncr.site_id is null
),
candidate_rows as (
  select ncr.id as subject_id, ncr.org_id, lp.site_id, 'reference_lp'::text as source
    from null_ncrs ncr
    join public.license_plates lp on lp.id = ncr.reference_id and lp.org_id = ncr.org_id
   where ncr.reference_type = 'lp' and lp.site_id is not null

  union all
  select ncr.id, ncr.org_id, wo.site_id, 'reference_work_order'
    from null_ncrs ncr
    join public.work_orders wo on wo.id = ncr.reference_id and wo.org_id = ncr.org_id
   where ncr.reference_type = 'wo' and wo.site_id is not null

  union all
  select ncr.id, ncr.org_id, po.site_id, 'reference_purchase_order'
    from null_ncrs ncr
    join public.purchase_orders po on po.id = ncr.reference_id and po.org_id = ncr.org_id
   where ncr.reference_type = 'po' and po.site_id is not null

  union all
  select ncr.id, ncr.org_id, grn.site_id, 'reference_grn'
    from null_ncrs ncr
    join public.grns grn on grn.id = ncr.reference_id and grn.org_id = ncr.org_id
   where ncr.reference_type = 'grn' and grn.site_id is not null

  union all
  select ncr.id, ncr.org_id, qi.site_id, 'reference_inspection'
    from null_ncrs ncr
    join public.quality_inspections qi on qi.id = ncr.reference_id and qi.org_id = ncr.org_id
   where ncr.reference_type = 'inspection' and qi.site_id is not null

  union all
  select ncr.id, ncr.org_id, dev.site_id, 'reference_ccp_deviation'
    from null_ncrs ncr
    join public.ccp_deviations dev on dev.id = ncr.reference_id and dev.org_id = ncr.org_id
   where ncr.reference_type = 'ccp_deviation' and dev.site_id is not null

  union all
  select ncr.id, ncr.org_id, complaint.site_id, 'reference_complaint'
    from null_ncrs ncr
    join public.complaints complaint on complaint.id = ncr.reference_id and complaint.org_id = ncr.org_id
   where ncr.reference_type = 'complaint' and complaint.site_id is not null

  union all
  select ncr.id, ncr.org_id, hold.site_id, 'linked_quality_hold'
    from null_ncrs ncr
    join public.quality_holds hold on hold.id = ncr.linked_hold_id and hold.org_id = ncr.org_id
   where hold.site_id is not null
)
insert into migration_549_site_candidates (entity, subject_id, org_id, site_id, source)
select 'ncr_reports', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
  from candidate_rows candidate
  join public.sites site
    on site.id = candidate.site_id
   and site.org_id = candidate.org_id;

do $$
declare
  v_updated integer;
begin
  with resolved as (
    select candidate.subject_id,
           (array_agg(distinct candidate.site_id order by candidate.site_id))[1] as site_id,
           count(distinct candidate.site_id) as site_count
      from migration_549_site_candidates candidate
     where candidate.entity = 'ncr_reports'
     group by candidate.subject_id
  )
  update public.ncr_reports ncr
     set site_id = resolved.site_id
    from resolved
   where ncr.id = resolved.subject_id
     and ncr.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 549 backfill: ncr_reports updated=%', v_updated;
end
$$;

-- ===========================================================================
-- 5/5 ncr_reports — two evidence-free audit leftovers, stamped with the org default
-- ===========================================================================
-- READ THIS BEFORE COPYING THE PATTERN. Every other block in this file refuses to
-- invent a site, because a wrong site_id silently shows one plant another plant's
-- records. This block does the one thing the rest of the file forbids, and it is
-- allowed to exist only because of what these specific rows are.
--
-- On 2026-07-15 a browser audit (SOL-R18) was run against the LIVE production
-- database and left two NCR rows behind:
--     NCR-00001004  'SOL-R18-2222 NCR browser audit'   closed, minor
--     NCR-00001005  'SOL-R18-2224 NCR explicit type'   closed, minor
-- They are test scaffolding, not non-conformances. Both are already closed, and both
-- have reference_type, reference_id, linked_hold_id and product_id all NULL — there is
-- no relation of any kind to derive a site from, so blocks 1-4 correctly leave them
-- alone. The owner reviewed them and decided to stamp them with the organization's
-- default site rather than let two pieces of test litter hold the site-visibility gate
-- (migration 551) shut forever.
--
-- The filter below is deliberately narrower than "NCRs without a site": it requires
-- that ALL FOUR reference columns are NULL. An NCR that has any relation at all is
-- someone's real quality record and must be resolved by the blocks above or left NULL
-- for a human — this block must never touch it. If that ever regresses, the fix is
-- here, not in the blocks above.
--
-- The default site is derived, not guessed: public.sites carries is_default, and
-- idx_sites_default is a UNIQUE index on (org_id) WHERE is_default, so an org cannot
-- have two defaults. The `having count(*) = 1` below therefore guards the real case —
-- an org with NO default site (7 of 273 on the test clone). Such a row stays NULL and
-- is listed by the post-check like any other unresolved row.
insert into migration_549_site_candidates (entity, subject_id, org_id, site_id, source)
select 'ncr_reports', ncr.id, ncr.org_id, org_default.site_id, 'org_default_site'
  from public.ncr_reports ncr
  join (
    select site.org_id, (array_agg(site.id))[1] as site_id
      from public.sites site
     where site.is_default
     group by site.org_id
    having count(*) = 1
  ) org_default on org_default.org_id = ncr.org_id
 where ncr.site_id is null
   and ncr.reference_type is null
   and ncr.reference_id is null
   and ncr.linked_hold_id is null
   and ncr.product_id is null;

do $$
declare
  v_updated integer;
begin
  with resolved as (
    select candidate.subject_id,
           (array_agg(distinct candidate.site_id order by candidate.site_id))[1] as site_id,
           count(distinct candidate.site_id) as site_count
      from migration_549_site_candidates candidate
     where candidate.entity = 'ncr_reports'
       and candidate.source = 'org_default_site'
     group by candidate.subject_id
  )
  update public.ncr_reports ncr
     set site_id = resolved.site_id
    from resolved
   where ncr.id = resolved.subject_id
     and ncr.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice
    'migration 549 backfill: ncr_reports stamped with org default site (evidence-free audit leftovers) updated=%',
    v_updated;
end
$$;

-- ===========================================================================
-- Post-check
-- ===========================================================================
--   (a) every row this migration could resolve must now be resolved,
--   (b) every row it could not resolve is listed individually with its reason, and
--   (c) the exact audit migration 551 is about to run is replayed, so the operator
--       sees BEFORE 551 executes whether the gate will open or refuse.
do $$
declare
  v_row        record;
  v_derivable  integer := 0;
  v_table      record;
  v_null_count bigint;
  v_total_null bigint := 0;
begin
  -- (a) + (b): one pass over every row still NULL in the four repaired tables.
  for v_row in
    with remaining as (
      select 'license_plates'::text as entity, lp.id, lp.org_id,
             'lp_number=' || lp.lp_number || ' origin=' || lp.origin
               || ' warehouse=' || coalesce(lp.warehouse_id::text, 'none') as detail
        from public.license_plates lp where lp.site_id is null
      union all
      select 'schedule_outputs', so.id, so.org_id,
             'planned_wo=' || so.planned_wo_id::text
               || ' downstream_wo=' || coalesce(so.downstream_wo_id::text, 'none')
        from public.schedule_outputs so where so.site_id is null
      union all
      select 'quality_inspections', qi.id, qi.org_id,
             'reference=' || qi.reference_type || ':' || coalesce(qi.reference_id::text, 'none')
        from public.quality_inspections qi where qi.site_id is null
      union all
      -- product_id and the org's default-site count are printed too: without them a
      -- row skipped by block 5/5 looks identical in the log to one it could not reach,
      -- and the reader cannot tell "it still has a relation" from "its org has no
      -- default site to stamp".
      select 'ncr_reports', ncr.id, ncr.org_id,
             'reference=' || coalesce(ncr.reference_type, 'none') || ':'
               || coalesce(ncr.reference_id::text, 'none')
               || ' linked_hold=' || coalesce(ncr.linked_hold_id::text, 'none')
               || ' product=' || coalesce(ncr.product_id::text, 'none')
               || ' org_default_sites=' || (
                    select count(*) from public.sites s
                     where s.org_id = ncr.org_id and s.is_default
                  )::text
        from public.ncr_reports ncr where ncr.site_id is null
    )
    select remaining.entity,
           remaining.id,
           remaining.org_id,
           remaining.detail,
           coalesce(count(distinct candidate.site_id), 0) as site_count,
           coalesce(
             string_agg(distinct candidate.site_id::text, ',' order by candidate.site_id::text),
             'none'
           ) as candidate_sites,
           coalesce(string_agg(distinct candidate.source, ',' order by candidate.source), 'none') as sources
      from remaining
      left join migration_549_site_candidates candidate
        on candidate.entity = remaining.entity
       and candidate.subject_id = remaining.id
     group by remaining.entity, remaining.id, remaining.org_id, remaining.detail
     order by remaining.entity, remaining.id
  loop
    if v_row.site_count = 1 then
      v_derivable := v_derivable + 1;
    end if;
    raise notice
      'migration 549 unresolved: entity=% id=% org=% % candidate_sites=% sources=% reason=%',
      v_row.entity, v_row.id, v_row.org_id, v_row.detail,
      v_row.candidate_sites, v_row.sources,
      case
        when v_row.site_count > 1 then 'conflicting evidence — needs an owner decision'
        when v_row.site_count = 1 then 'BUG: derivable but not applied'
        else 'no usable evidence — needs an owner decision'
      end;
  end loop;

  if v_derivable > 0 then
    raise exception
      'migration 549 post-check failed: % rows remain NULL despite exactly one derivable site_id',
      v_derivable;
  end if;

  -- (c) Replay 551's audit set: every table that already has a RESTRICTIVE
  -- user_can_see_site(site_id) policy, plus the three 551 is about to add.
  for v_table in
    select distinct policies.tablename
      from pg_catalog.pg_policies policies
     where policies.schemaname = 'public'
       and lower(policies.permissive) = 'restrictive'
       and (
         coalesce(policies.qual, '') ilike '%user_can_see_site(site_id)%'
         or coalesce(policies.with_check, '') ilike '%user_can_see_site(site_id)%'
       )
     union
    select unnest(array['wo_outputs', 'wo_events', 'downtime_events'])
     order by 1
  loop
    execute format(
      'select count(*) from public.%I where site_id is null',
      v_table.tablename
    ) into v_null_count;
    v_total_null := v_total_null + v_null_count;
    if v_null_count > 0 then
      raise notice
        'migration 549 gate forecast: table=% site_id_null=%',
        v_table.tablename, v_null_count;
    end if;
  end loop;

  if v_total_null > 0 then
    raise notice
      'migration 549 gate forecast: % rows still NULL across the 551 audit set. Migration 550 repairs wo_outputs/wo_events/downtime_events next; anything left after that WILL make 551 refuse.',
      v_total_null;
  else
    raise notice 'migration 549 gate forecast: 0 rows NULL across the 551 audit set.';
  end if;
end
$$;

-- The temp table is session-scoped scratch space; drop it explicitly so a manual
-- psql dry-run leaves nothing behind (migration 550 ends the same way).
drop table migration_549_site_candidates;
