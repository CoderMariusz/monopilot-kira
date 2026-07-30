-- Migration 550 — production site_id repair before site-visibility RLS.
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
