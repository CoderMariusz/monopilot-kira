-- Migration 557 — repair license_plates.site_id before fail-closed site RLS.
--
-- A license plate is a physical inventory carrier. site_id=NULL is therefore
-- never a legal cross-site state (migration 551 enforces the same invariant).
--
-- Resolve only from same-org operational evidence:
--   * the LP warehouse / location warehouse,
--   * GRN header or item,
--   * stock adjustment / stock move / LP state history,
--   * count session,
--   * production WO / output,
--   * destination warehouse of a received transfer.
--
-- Multiple relations may repeat the same site; that is safe. If they point to
-- different sites, do not guess: leave the LP unchanged and report a conflict.

do $$
declare
  v_updated integer;
begin
  with null_lps as (
    select lp.id, lp.org_id
      from public.license_plates lp
     where lp.site_id is null
  ),
  candidate_rows as (
    select lp.id as lp_id, w.site_id
      from null_lps lp
      join public.license_plates subject on subject.id = lp.id and subject.org_id = lp.org_id
      join public.warehouses w on w.id = subject.warehouse_id and w.org_id = subject.org_id
     where w.site_id is not null

    union all
    select lp.id, location_warehouse.site_id
      from null_lps lp
      join public.license_plates subject on subject.id = lp.id and subject.org_id = lp.org_id
      join public.locations location on location.id = subject.location_id and location.org_id = subject.org_id
      join public.warehouses location_warehouse
        on location_warehouse.id = location.warehouse_id
       and location_warehouse.org_id = location.org_id
     where location_warehouse.site_id is not null

    union all
    select lp.id, grn.site_id
      from null_lps lp
      join public.license_plates subject on subject.id = lp.id and subject.org_id = lp.org_id
      join public.grns grn on grn.id = subject.grn_id and grn.org_id = subject.org_id
     where grn.site_id is not null

    union all
    select lp.id, grn_item.site_id
      from null_lps lp
      join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
     where grn_item.site_id is not null

    union all
    select lp.id, grn.site_id
      from null_lps lp
      join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
      join public.grns grn on grn.id = grn_item.grn_id and grn.org_id = grn_item.org_id
     where grn.site_id is not null

    union all
    select lp.id, purchase_order.site_id
      from null_lps lp
      join public.license_plates subject on subject.id = lp.id and subject.org_id = lp.org_id
      join public.grns grn on grn.id = subject.grn_id and grn.org_id = subject.org_id
      join public.purchase_orders purchase_order
        on purchase_order.id = grn.po_id
       and purchase_order.org_id = grn.org_id
     where purchase_order.site_id is not null

    union all
    select lp.id, adjustment.site_id
      from null_lps lp
      join public.stock_adjustments adjustment
        on adjustment.lp_id = lp.id
       and adjustment.org_id = lp.org_id
     where adjustment.site_id is not null

    union all
    select lp.id, count_session.site_id
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
    select lp.id, move.site_id
      from null_lps lp
      join public.stock_moves move on move.lp_id = lp.id and move.org_id = lp.org_id
     where move.site_id is not null

    union all
    select lp.id, history.site_id
      from null_lps lp
      join public.lp_state_history history on history.lp_id = lp.id and history.org_id = lp.org_id
     where history.site_id is not null

    union all
    select lp.id, work_order.site_id
      from null_lps lp
      join public.license_plates subject on subject.id = lp.id and subject.org_id = lp.org_id
      join public.work_orders work_order
        on work_order.id = subject.wo_id
       and work_order.org_id = subject.org_id
     where work_order.site_id is not null

    union all
    select lp.id, output.site_id
      from null_lps lp
      join public.wo_outputs output on output.lp_id = lp.id and output.org_id = lp.org_id
     where output.site_id is not null

    union all
    select lp.id, destination_warehouse.site_id
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
  ),
  resolved as (
    select candidates.lp_id,
           (array_agg(distinct candidates.site_id order by candidates.site_id))[1] as site_id,
           count(distinct candidates.site_id) as site_count
      from candidate_rows candidates
     group by candidates.lp_id
  )
  update public.license_plates lp
     set site_id = resolved.site_id,
         updated_at = pg_catalog.now()
    from resolved
   where lp.id = resolved.lp_id
     and lp.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 557 backfill: license_plates updated=%', v_updated;
end
$$;

-- Post-check. A uniquely derivable LP must not remain NULL. Unresolvable rows
-- are retained (never guessed) and counted by reason; migration 551 will keep
-- the global fail-closed visibility switch blocked until they are investigated.
do $$
declare
  v_remaining_null integer;
  v_derivable_null integer;
  v_conflicting_sources integer;
  v_related_sources_site_null integer;
  v_missing_related_records integer;
  v_origin_breakdown text;
begin
  with null_lps as (
    select lp.id, lp.org_id, lp.origin, lp.warehouse_id, lp.location_id, lp.grn_id, lp.wo_id
      from public.license_plates lp
     where lp.site_id is null
  ),
  candidate_rows as (
    select lp.id as lp_id, w.site_id
      from null_lps lp
      join public.warehouses w on w.id = lp.warehouse_id and w.org_id = lp.org_id
     where w.site_id is not null

    union all
    select lp.id, location_warehouse.site_id
      from null_lps lp
      join public.locations location on location.id = lp.location_id and location.org_id = lp.org_id
      join public.warehouses location_warehouse
        on location_warehouse.id = location.warehouse_id
       and location_warehouse.org_id = location.org_id
     where location_warehouse.site_id is not null

    union all
    select lp.id, grn.site_id
      from null_lps lp
      join public.grns grn on grn.id = lp.grn_id and grn.org_id = lp.org_id
     where grn.site_id is not null

    union all
    select lp.id, grn_item.site_id
      from null_lps lp
      join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
     where grn_item.site_id is not null

    union all
    select lp.id, grn.site_id
      from null_lps lp
      join public.grn_items grn_item on grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
      join public.grns grn on grn.id = grn_item.grn_id and grn.org_id = grn_item.org_id
     where grn.site_id is not null

    union all
    select lp.id, purchase_order.site_id
      from null_lps lp
      join public.grns grn on grn.id = lp.grn_id and grn.org_id = lp.org_id
      join public.purchase_orders purchase_order
        on purchase_order.id = grn.po_id
       and purchase_order.org_id = grn.org_id
     where purchase_order.site_id is not null

    union all
    select lp.id, adjustment.site_id
      from null_lps lp
      join public.stock_adjustments adjustment
        on adjustment.lp_id = lp.id
       and adjustment.org_id = lp.org_id
     where adjustment.site_id is not null

    union all
    select lp.id, count_session.site_id
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
    select lp.id, move.site_id
      from null_lps lp
      join public.stock_moves move on move.lp_id = lp.id and move.org_id = lp.org_id
     where move.site_id is not null

    union all
    select lp.id, history.site_id
      from null_lps lp
      join public.lp_state_history history on history.lp_id = lp.id and history.org_id = lp.org_id
     where history.site_id is not null

    union all
    select lp.id, work_order.site_id
      from null_lps lp
      join public.work_orders work_order on work_order.id = lp.wo_id and work_order.org_id = lp.org_id
     where work_order.site_id is not null

    union all
    select lp.id, output.site_id
      from null_lps lp
      join public.wo_outputs output on output.lp_id = lp.id and output.org_id = lp.org_id
     where output.site_id is not null

    union all
    select lp.id, destination_warehouse.site_id
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
  ),
  candidate_summary as (
    select candidates.lp_id, count(distinct candidates.site_id) as site_count
      from candidate_rows candidates
     group by candidates.lp_id
  ),
  classified as (
    select lp.id,
           lp.origin,
           coalesce(summary.site_count, 0) as site_count,
           (
             exists (
               select 1 from public.warehouses w
                where w.id = lp.warehouse_id and w.org_id = lp.org_id
             )
             or exists (
               select 1 from public.locations location
                where location.id = lp.location_id and location.org_id = lp.org_id
             )
             or exists (
               select 1 from public.grns grn
                where grn.id = lp.grn_id and grn.org_id = lp.org_id
             )
             or exists (
               select 1 from public.grn_items grn_item
                where grn_item.lp_id = lp.id and grn_item.org_id = lp.org_id
             )
             or exists (
               select 1 from public.stock_adjustments adjustment
                where adjustment.lp_id = lp.id and adjustment.org_id = lp.org_id
             )
             or exists (
               select 1 from public.stock_moves move
                where move.lp_id = lp.id and move.org_id = lp.org_id
             )
             or exists (
               select 1 from public.lp_state_history history
                where history.lp_id = lp.id and history.org_id = lp.org_id
             )
             or exists (
               select 1 from public.work_orders work_order
                where work_order.id = lp.wo_id and work_order.org_id = lp.org_id
             )
             or exists (
               select 1 from public.wo_outputs output
                where output.lp_id = lp.id and output.org_id = lp.org_id
             )
             or exists (
               select 1 from public.transfer_order_line_lps transfer_lp
                where transfer_lp.dest_lp_id = lp.id and transfer_lp.org_id = lp.org_id
             )
           ) as has_related_record
      from null_lps lp
      left join candidate_summary summary on summary.lp_id = lp.id
  )
  select count(*),
         count(*) filter (where site_count = 1),
         count(*) filter (where site_count > 1),
         count(*) filter (where site_count = 0 and has_related_record),
         count(*) filter (where site_count = 0 and not has_related_record)
    into
      v_remaining_null,
      v_derivable_null,
      v_conflicting_sources,
      v_related_sources_site_null,
      v_missing_related_records
    from classified;

  select coalesce(
           string_agg(origin_counts.origin || '=' || origin_counts.row_count::text, ', ' order by origin_counts.origin),
           'none'
         )
    into v_origin_breakdown
    from (
      select lp.origin, count(*) as row_count
        from public.license_plates lp
       where lp.site_id is null
       group by lp.origin
    ) origin_counts;

  raise notice
    'migration 557 post-check license_plates: remaining_null=%, derivable_null=%, conflicting_related_sites=%, related_records_but_all_sites_null=%, missing_related_records=%',
    v_remaining_null,
    v_derivable_null,
    v_conflicting_sources,
    v_related_sources_site_null,
    v_missing_related_records;
  raise notice
    'migration 557 post-check remaining NULL by origin: %',
    v_origin_breakdown;

  if v_derivable_null > 0 then
    raise exception
      'migration 557 post-check failed: % license_plates rows remain NULL despite exactly one derivable site_id',
      v_derivable_null;
  end if;
end
$$;
