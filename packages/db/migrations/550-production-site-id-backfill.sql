-- Migration 550 — site_id producer-chain repair before site-visibility RLS.
--
-- Canonical source: work_orders.site_id. The work_orders insert trigger derives
-- that value from production_lines.site_id, so the related line is only a
-- fallback for legacy rows where the WO stamp is still NULL.

do $$
declare
  v_outputs_updated integer;
  v_events_updated integer;
  v_downtime_updated integer;
begin
  with resolved as (
    select output_row.id, coalesce(wo.site_id, wo_line.site_id) as site_id
      from public.wo_outputs output_row
      left join public.work_orders wo
        on wo.id = output_row.wo_id
       and wo.org_id = output_row.org_id
      left join public.production_lines wo_line
        on wo_line.id = wo.production_line_id
       and wo_line.org_id = wo.org_id
     where output_row.site_id is null
  )
  update public.wo_outputs output_row
     set site_id = resolved.site_id
    from resolved
   where output_row.id = resolved.id
     and resolved.site_id is not null;
  get diagnostics v_outputs_updated = row_count;

  with resolved as (
    select event_row.id, coalesce(wo.site_id, wo_line.site_id) as site_id
      from public.wo_events event_row
      left join public.work_orders wo
        on wo.id = event_row.wo_id
       and wo.org_id = event_row.org_id
      left join public.production_lines wo_line
        on wo_line.id = wo.production_line_id
       and wo_line.org_id = wo.org_id
     where event_row.site_id is null
  )
  update public.wo_events event_row
     set site_id = resolved.site_id
    from resolved
   where event_row.id = resolved.id
     and resolved.site_id is not null;
  get diagnostics v_events_updated = row_count;

  with resolved as (
    select downtime_row.id,
           coalesce(wo.site_id, wo_line.site_id, input_line.site_id) as site_id
      from public.downtime_events downtime_row
      left join public.work_orders wo
        on wo.id = downtime_row.wo_id
       and wo.org_id = downtime_row.org_id
      left join public.production_lines wo_line
        on wo_line.id = wo.production_line_id
       and wo_line.org_id = wo.org_id
      left join public.production_lines input_line
        on input_line.id::text = downtime_row.line_id
       and input_line.org_id = downtime_row.org_id
     where downtime_row.site_id is null
  )
  update public.downtime_events downtime_row
     set site_id = resolved.site_id
    from resolved
   where downtime_row.id = resolved.id
     and resolved.site_id is not null;
  get diagnostics v_downtime_updated = row_count;

  raise notice
    'migration 550 backfill: wo_outputs updated=%, wo_events updated=%, downtime_events updated=%',
    v_outputs_updated, v_events_updated, v_downtime_updated;
end
$$;

-- The fail-closed audit in migration 551 covers every table already protected
-- by app.user_can_see_site(site_id), including shipments. Repair the remaining
-- producer chain here, before that audit. Conflicting or absent evidence is
-- never guessed; 551 still refuses the flip while any protected row is NULL.

create temporary table migration_550_site_candidates (
  entity text not null,
  subject_id uuid not null,
  org_id uuid not null,
  site_id uuid not null,
  source text not null
);

-- Sales orders: use downstream documents and inventory references first.
-- A single active org site is an unambiguous fallback; multiple active sites
-- without related evidence deliberately leave the order unresolved.
with null_subjects as (
  select sales_order.id, sales_order.org_id
    from public.sales_orders sales_order
   where sales_order.site_id is null
),
single_active_site as (
  select site.org_id, (array_agg(site.id order by site.id))[1] as site_id
    from public.sites site
   where site.is_active
   group by site.org_id
  having count(*) = 1
),
candidate_rows as (
  select subject.id as subject_id, subject.org_id, sales_order_line.site_id, 'sales_order_line'::text as source
    from null_subjects subject
    join public.sales_order_lines sales_order_line
      on sales_order_line.sales_order_id = subject.id
     and sales_order_line.org_id = subject.org_id
   where sales_order_line.site_id is not null

  union all
  select subject.id, subject.org_id, allocation.site_id, 'inventory_allocation'
    from null_subjects subject
    join public.sales_order_lines sales_order_line
      on sales_order_line.sales_order_id = subject.id
     and sales_order_line.org_id = subject.org_id
    join public.inventory_allocations allocation
      on allocation.sales_order_line_id = sales_order_line.id
     and allocation.org_id = sales_order_line.org_id
   where allocation.site_id is not null

  union all
  select subject.id, subject.org_id, license_plate.site_id, 'allocated_license_plate'
    from null_subjects subject
    join public.sales_order_lines sales_order_line
      on sales_order_line.sales_order_id = subject.id
     and sales_order_line.org_id = subject.org_id
    join public.inventory_allocations allocation
      on allocation.sales_order_line_id = sales_order_line.id
     and allocation.org_id = sales_order_line.org_id
    join public.license_plates license_plate
      on license_plate.id = allocation.license_plate_id
     and license_plate.org_id = allocation.org_id
   where license_plate.site_id is not null

  union all
  select subject.id, subject.org_id, pick_list.site_id, 'pick_list'
    from null_subjects subject
    join public.pick_lists pick_list
      on pick_list.sales_order_id = subject.id
     and pick_list.org_id = subject.org_id
   where pick_list.site_id is not null

  union all
  select subject.id, subject.org_id, shipment.site_id, 'shipment'
    from null_subjects subject
    join public.shipments shipment
      on shipment.sales_order_id = subject.id
     and shipment.org_id = subject.org_id
   where shipment.site_id is not null

  union all
  select subject.id, subject.org_id, single_site.site_id, 'single_active_org_site'
    from null_subjects subject
    join single_active_site single_site on single_site.org_id = subject.org_id
)
insert into migration_550_site_candidates (entity, subject_id, org_id, site_id, source)
select 'sales_orders', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
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
      from migration_550_site_candidates candidate
     where candidate.entity = 'sales_orders'
     group by candidate.subject_id
  )
  update public.sales_orders sales_order
     set site_id = resolved.site_id,
         updated_at = pg_catalog.now()
    from resolved
   where sales_order.id = resolved.subject_id
     and sales_order.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 550 chain backfill: sales_orders updated=%', v_updated;
end
$$;

-- Lines inherit the now-resolved header. This single parent relation cannot
-- introduce ambiguity.
do $$
declare
  v_updated integer;
begin
  update public.sales_order_lines sales_order_line
     set site_id = sales_order.site_id,
         updated_at = pg_catalog.now()
    from public.sales_orders sales_order
   where sales_order_line.sales_order_id = sales_order.id
     and sales_order_line.org_id = sales_order.org_id
     and sales_order_line.site_id is null
     and sales_order.site_id is not null;

  get diagnostics v_updated = row_count;
  raise notice 'migration 550 chain backfill: sales_order_lines updated=%', v_updated;
end
$$;

-- Shipments: the repaired sales order is canonical. Boxes/BOL remain useful
-- evidence for legacy rows; disagreement leaves the shipment unresolved.
with null_subjects as (
  select shipment.id, shipment.org_id, shipment.sales_order_id
    from public.shipments shipment
   where shipment.site_id is null
),
single_active_site as (
  select site.org_id, (array_agg(site.id order by site.id))[1] as site_id
    from public.sites site
   where site.is_active
   group by site.org_id
  having count(*) = 1
),
candidate_rows as (
  select subject.id as subject_id, subject.org_id, sales_order.site_id, 'sales_order'::text as source
    from null_subjects subject
    join public.sales_orders sales_order
      on sales_order.id = subject.sales_order_id
     and sales_order.org_id = subject.org_id
   where sales_order.site_id is not null

  union all
  select subject.id, subject.org_id, shipment_box.site_id, 'shipment_box'
    from null_subjects subject
    join public.shipment_boxes shipment_box
      on shipment_box.shipment_id = subject.id
     and shipment_box.org_id = subject.org_id
   where shipment_box.site_id is not null

  union all
  select subject.id, subject.org_id, bol.site_id, 'bill_of_lading'
    from null_subjects subject
    join public.bill_of_lading bol
      on bol.shipment_id = subject.id
     and bol.org_id = subject.org_id
   where bol.site_id is not null

  union all
  select subject.id, subject.org_id, single_site.site_id, 'single_active_org_site'
    from null_subjects subject
    join single_active_site single_site on single_site.org_id = subject.org_id
)
insert into migration_550_site_candidates (entity, subject_id, org_id, site_id, source)
select 'shipments', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
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
      from migration_550_site_candidates candidate
     where candidate.entity = 'shipments'
     group by candidate.subject_id
  )
  update public.shipments shipment
     set site_id = resolved.site_id,
         updated_at = pg_catalog.now()
    from resolved
   where shipment.id = resolved.subject_id
     and shipment.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 550 chain backfill: shipments updated=%', v_updated;
end
$$;

-- Warehouses: use rows whose natural owner is the warehouse. A unique active
-- org site repairs an empty onboarding warehouse; no default is selected from
-- a multi-site org because that would be a guess.
with null_subjects as (
  select warehouse.id, warehouse.org_id
    from public.warehouses warehouse
   where warehouse.site_id is null
),
single_active_site as (
  select site.org_id, (array_agg(site.id order by site.id))[1] as site_id
    from public.sites site
   where site.is_active
   group by site.org_id
  having count(*) = 1
),
candidate_rows as (
  select subject.id as subject_id, subject.org_id, license_plate.site_id, 'license_plate'::text as source
    from null_subjects subject
    join public.license_plates license_plate
      on license_plate.warehouse_id = subject.id
     and license_plate.org_id = subject.org_id
   where license_plate.site_id is not null

  union all
  select subject.id, subject.org_id, grn.site_id, 'grn'
    from null_subjects subject
    join public.grns grn
      on grn.warehouse_id = subject.id
     and grn.org_id = subject.org_id
   where grn.site_id is not null

  union all
  select subject.id, subject.org_id, purchase_order.site_id, 'purchase_order'
    from null_subjects subject
    join public.purchase_orders purchase_order
      on purchase_order.destination_warehouse_id = subject.id
     and purchase_order.org_id = subject.org_id
   where purchase_order.site_id is not null

  union all
  select subject.id, subject.org_id, count_session.site_id, 'count_session'
    from null_subjects subject
    join public.count_sessions count_session
      on count_session.warehouse_id = subject.id
     and count_session.org_id = subject.org_id
   where count_session.site_id is not null

  union all
  select subject.id, subject.org_id, adjustment.site_id, 'stock_adjustment'
    from null_subjects subject
    join public.stock_adjustments adjustment
      on adjustment.warehouse_id = subject.id
     and adjustment.org_id = subject.org_id
   where adjustment.site_id is not null

  union all
  select subject.id, subject.org_id, production_line.site_id, 'production_line'
    from null_subjects subject
    join public.production_lines production_line
      on production_line.warehouse_id = subject.id
     and production_line.org_id = subject.org_id
   where production_line.site_id is not null

  union all
  select subject.id, subject.org_id, single_site.site_id, 'single_active_org_site'
    from null_subjects subject
    join single_active_site single_site on single_site.org_id = subject.org_id
)
insert into migration_550_site_candidates (entity, subject_id, org_id, site_id, source)
select 'warehouses', candidate.subject_id, candidate.org_id, candidate.site_id, candidate.source
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
      from migration_550_site_candidates candidate
     where candidate.entity = 'warehouses'
     group by candidate.subject_id
  )
  update public.warehouses warehouse
     set site_id = resolved.site_id
    from resolved
   where warehouse.id = resolved.subject_id
     and warehouse.site_id is null
     and resolved.site_count = 1;

  get diagnostics v_updated = row_count;
  raise notice 'migration 550 chain backfill: warehouses updated=%', v_updated;
end
$$;

-- Report every remaining NULL by reason. A row still NULL despite one distinct
-- candidate means this migration failed to apply its own resolution and aborts.
-- Conflicts/no-candidate rows remain visible to the unchanged audit in 551.
do $$
declare
  v_so_remaining integer;
  v_so_derivable integer;
  v_so_conflicts integer;
  v_so_no_candidate integer;
  v_shipment_remaining integer;
  v_shipment_derivable integer;
  v_shipment_conflicts integer;
  v_shipment_no_candidate integer;
  v_warehouse_remaining integer;
  v_warehouse_derivable integer;
  v_warehouse_conflicts integer;
  v_warehouse_no_candidate integer;
  v_line_parent_mismatch integer;
  v_conflict record;
begin
  with candidate_counts as (
    select candidate.subject_id, count(distinct candidate.site_id) as site_count
      from migration_550_site_candidates candidate
     where candidate.entity = 'sales_orders'
     group by candidate.subject_id
  )
  select count(*),
         count(*) filter (where candidate_counts.site_count = 1),
         count(*) filter (where candidate_counts.site_count > 1),
         count(*) filter (where candidate_counts.subject_id is null)
    into v_so_remaining, v_so_derivable, v_so_conflicts, v_so_no_candidate
    from public.sales_orders sales_order
    left join candidate_counts on candidate_counts.subject_id = sales_order.id
   where sales_order.site_id is null;

  with candidate_counts as (
    select candidate.subject_id, count(distinct candidate.site_id) as site_count
      from migration_550_site_candidates candidate
     where candidate.entity = 'shipments'
     group by candidate.subject_id
  )
  select count(*),
         count(*) filter (where candidate_counts.site_count = 1),
         count(*) filter (where candidate_counts.site_count > 1),
         count(*) filter (where candidate_counts.subject_id is null)
    into
      v_shipment_remaining,
      v_shipment_derivable,
      v_shipment_conflicts,
      v_shipment_no_candidate
    from public.shipments shipment
    left join candidate_counts on candidate_counts.subject_id = shipment.id
   where shipment.site_id is null;

  with candidate_counts as (
    select candidate.subject_id, count(distinct candidate.site_id) as site_count
      from migration_550_site_candidates candidate
     where candidate.entity = 'warehouses'
     group by candidate.subject_id
  )
  select count(*),
         count(*) filter (where candidate_counts.site_count = 1),
         count(*) filter (where candidate_counts.site_count > 1),
         count(*) filter (where candidate_counts.subject_id is null)
    into
      v_warehouse_remaining,
      v_warehouse_derivable,
      v_warehouse_conflicts,
      v_warehouse_no_candidate
    from public.warehouses warehouse
    left join candidate_counts on candidate_counts.subject_id = warehouse.id
   where warehouse.site_id is null;

  select count(*)
    into v_line_parent_mismatch
    from public.sales_order_lines sales_order_line
    join public.sales_orders sales_order
      on sales_order.id = sales_order_line.sales_order_id
     and sales_order.org_id = sales_order_line.org_id
   where sales_order.site_id is not null
     and sales_order_line.site_id is null;

  raise notice
    'migration 550 chain post-check sales_orders: remaining_null=%, derivable_null=%, conflicting_candidates=%, no_candidate=%',
    v_so_remaining, v_so_derivable, v_so_conflicts, v_so_no_candidate;
  raise notice
    'migration 550 chain post-check shipments: remaining_null=%, derivable_null=%, conflicting_candidates=%, no_candidate=%',
    v_shipment_remaining, v_shipment_derivable, v_shipment_conflicts, v_shipment_no_candidate;
  raise notice
    'migration 550 chain post-check warehouses: remaining_null=%, derivable_null=%, conflicting_candidates=%, no_candidate=%',
    v_warehouse_remaining, v_warehouse_derivable, v_warehouse_conflicts, v_warehouse_no_candidate;
  raise notice
    'migration 550 chain post-check sales_order_lines: resolved_parent_but_line_null=%',
    v_line_parent_mismatch;

  for v_conflict in
    select candidate.entity,
           candidate.subject_id,
           string_agg(
             distinct candidate.site_id::text,
             ',' order by candidate.site_id::text
           ) as candidate_sites,
           string_agg(
             distinct candidate.source,
             ',' order by candidate.source
           ) as sources
      from migration_550_site_candidates candidate
     group by candidate.entity, candidate.subject_id
    having count(distinct candidate.site_id) > 1
     order by candidate.entity, candidate.subject_id
  loop
    raise notice
      'migration 550 chain conflict: entity=% id=% candidate_sites=% sources=%',
      v_conflict.entity,
      v_conflict.subject_id,
      v_conflict.candidate_sites,
      v_conflict.sources;
  end loop;

  if v_so_derivable + v_shipment_derivable + v_warehouse_derivable + v_line_parent_mismatch > 0 then
    raise exception
      'migration 550 chain post-check failed: % uniquely derivable rows remain NULL',
      v_so_derivable + v_shipment_derivable + v_warehouse_derivable + v_line_parent_mismatch;
  end if;
end
$$;

drop table pg_temp.migration_550_site_candidates;

-- Post-check: no derivable row may remain NULL. Rows with no usable relation
-- are counted by cause so the migration never leaves an unexplained remainder.
do $$
declare
  v_outputs_null integer;
  v_outputs_derivable integer;
  v_outputs_missing_wo integer;
  v_outputs_source_null integer;
  v_events_null integer;
  v_events_derivable integer;
  v_events_missing_wo integer;
  v_events_source_null integer;
  v_downtime_null integer;
  v_downtime_derivable integer;
  v_downtime_missing_sources integer;
  v_downtime_sources_null integer;
  v_downtime_wo_line_mismatch integer;
begin
  select
    count(*) filter (where output_row.site_id is null),
    count(*) filter (
      where output_row.site_id is null
        and coalesce(wo.site_id, wo_line.site_id) is not null
    ),
    count(*) filter (where output_row.site_id is null and wo.id is null),
    count(*) filter (
      where output_row.site_id is null
        and wo.id is not null
        and wo.site_id is null
        and wo_line.site_id is null
    )
    into v_outputs_null, v_outputs_derivable, v_outputs_missing_wo, v_outputs_source_null
    from public.wo_outputs output_row
    left join public.work_orders wo
      on wo.id = output_row.wo_id
     and wo.org_id = output_row.org_id
    left join public.production_lines wo_line
      on wo_line.id = wo.production_line_id
     and wo_line.org_id = wo.org_id;

  select
    count(*) filter (where event_row.site_id is null),
    count(*) filter (
      where event_row.site_id is null
        and coalesce(wo.site_id, wo_line.site_id) is not null
    ),
    count(*) filter (where event_row.site_id is null and wo.id is null),
    count(*) filter (
      where event_row.site_id is null
        and wo.id is not null
        and wo.site_id is null
        and wo_line.site_id is null
    )
    into v_events_null, v_events_derivable, v_events_missing_wo, v_events_source_null
    from public.wo_events event_row
    left join public.work_orders wo
      on wo.id = event_row.wo_id
     and wo.org_id = event_row.org_id
    left join public.production_lines wo_line
      on wo_line.id = wo.production_line_id
     and wo_line.org_id = wo.org_id;

  select
    count(*) filter (where downtime_row.site_id is null),
    count(*) filter (
      where downtime_row.site_id is null
        and coalesce(wo.site_id, wo_line.site_id, input_line.site_id) is not null
    ),
    count(*) filter (
      where downtime_row.site_id is null
        and wo.id is null
        and input_line.id is null
    ),
    count(*) filter (
      where downtime_row.site_id is null
        and (wo.id is not null or input_line.id is not null)
        and coalesce(wo.site_id, wo_line.site_id, input_line.site_id) is null
    ),
    count(*) filter (
      where wo.site_id is not null
        and input_line.site_id is not null
        and wo.site_id <> input_line.site_id
    )
    into
      v_downtime_null,
      v_downtime_derivable,
      v_downtime_missing_sources,
      v_downtime_sources_null,
      v_downtime_wo_line_mismatch
    from public.downtime_events downtime_row
    left join public.work_orders wo
      on wo.id = downtime_row.wo_id
     and wo.org_id = downtime_row.org_id
    left join public.production_lines wo_line
      on wo_line.id = wo.production_line_id
     and wo_line.org_id = wo.org_id
    left join public.production_lines input_line
      on input_line.id::text = downtime_row.line_id
     and input_line.org_id = downtime_row.org_id;

  raise notice
    'migration 550 post-check wo_outputs: remaining_null=%, derivable_null=%, missing_same_org_wo=%, wo_and_line_site_null=%',
    v_outputs_null, v_outputs_derivable, v_outputs_missing_wo, v_outputs_source_null;
  raise notice
    'migration 550 post-check wo_events: remaining_null=%, derivable_null=%, missing_same_org_wo=%, wo_and_line_site_null=%',
    v_events_null, v_events_derivable, v_events_missing_wo, v_events_source_null;
  raise notice
    'migration 550 post-check downtime_events: remaining_null=%, derivable_null=%, missing_same_org_wo_and_line=%, related_sources_site_null=%, wo_vs_input_line_mismatch=%',
    v_downtime_null,
    v_downtime_derivable,
    v_downtime_missing_sources,
    v_downtime_sources_null,
    v_downtime_wo_line_mismatch;

  if v_outputs_derivable + v_events_derivable + v_downtime_derivable > 0 then
    raise exception
      'migration 550 post-check failed: % rows remain NULL despite a derivable site_id',
      v_outputs_derivable + v_events_derivable + v_downtime_derivable;
  end if;
end
$$;
