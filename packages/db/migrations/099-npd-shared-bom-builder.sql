-- Migration 099: T-093 NPD Builder writes initial shared BOM versions.
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().
-- Shared public.bom_headers/public.bom_lines remain the BOM SSOT. D365 cache/export data is integration-only.

alter table public.outbox_events
  drop constraint if exists outbox_events_event_type_check;

alter table public.outbox_events
  add constraint outbox_events_event_type_check check (
    event_type in (
      'org.created', 'user.invited', 'role.assigned', 'audit.recorded',
      'brief.created',
      'fg.created', 'fg.allergens_changed', 'fg.intermediate_code_changed',
      'fa.created', 'fa.allergens_changed', 'fa.intermediate_code_changed',
      'bom.initial_version_created', 'fg.bom.released', 'bom.version_submitted',
      'lp.received', 'wo.ready', 'quality.recorded', 'shipment.created',
      'tenant.migration.run', 'tenant.migration.run.failed', 'tenant.cohort.advanced',
      'settings.schema.migration_requested',
      'settings.rule.deployed', 'rule.deployed',
      'settings.location.upserted', 'settings.machine.upserted', 'settings.line.upserted',
      'settings.warehouse.deactivated',
      'settings.module.toggled',
      'settings.org.created', 'settings.org.updated',
      'settings.reference.row_updated',
      'settings.role.assigned',
      'settings.scim.token_created', 'settings.sso.config_changed',
      'settings.user.invited', 'settings.user.accepted', 'settings.user.deactivated',
      'settings.notification_rule_updated', 'settings.notification_channel_updated',
      'settings.notification_digest_updated',
      'onboarding.step.advance', 'onboarding.step.back', 'onboarding.step.skip',
      'onboarding.step.jump', 'onboarding.step.restart', 'onboarding.first_wo_recorded'
    )
  );

comment on constraint outbox_events_event_type_check on public.outbox_events
  is 'T-093: includes shared BOM SSOT events emitted by NPD Builder and post-release version submissions.';

create or replace function public.create_initial_shared_bom_version_for_npd_project(
  p_project_id uuid,
  p_product_id text default null,
  p_created_by_user uuid default null,
  p_initial_version integer default 1
)
returns table (
  bom_header_id uuid,
  status text,
  version integer,
  line_count bigint
)
language plpgsql
security invoker
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_product_id text;
  v_header_id uuid;
  v_line_count bigint;
begin
  if p_initial_version is null or p_initial_version < 1 then
    raise exception 'initial BOM version must be a positive integer';
  end if;

  select coalesce(p_product_id, project.product_code)
    into v_product_id
  from public.npd_projects project
  where project.id = p_project_id
    and project.org_id = v_org_id;

  if v_product_id is null then
    raise exception 'NPD project not found or has no released FG product mapping: %', p_project_id;
  end if;

  if not exists (
    select 1
    from public.product product_row
    where product_row.product_code = v_product_id
      and product_row.org_id = v_org_id
  ) then
    raise exception 'Released FG product not found for NPD project: %', v_product_id;
  end if;

  select header.id
    into v_header_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.product_id = v_product_id
    and header.version = p_initial_version
  order by header.created_at
  limit 1;

  if v_header_id is null then
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    values (
      v_org_id,
      v_product_id,
      p_project_id,
      v_product_id,
      'npd',
      'in_review',
      p_initial_version,
      p_created_by_user,
      pg_catalog.now(),
      'Initial shared BOM version created by NPD Builder; pending Technical approval before factory use.',
      p_created_by_user
    )
    returning id into v_header_id;
  end if;

  insert into public.bom_lines (
    org_id,
    bom_header_id,
    line_no,
    component_code,
    component_type,
    quantity,
    uom,
    manufacturing_operation_name,
    sequence,
    source,
    notes
  )
  select
    detail.org_id,
    v_header_id,
    detail.component_index,
    detail.intermediate_code,
    'WIP',
    coalesce(detail.component_weight, 1.000000)::numeric(14,6),
    'kg',
    coalesce(
      nullif(detail.manufacturing_operation_1, ''),
      nullif(detail.manufacturing_operation_2, ''),
      nullif(detail.manufacturing_operation_3, ''),
      nullif(detail.manufacturing_operation_4, '')
    ),
    detail.component_index,
    'prod_detail',
    'Copied from NPD production detail at initial release.'
  from public.prod_detail detail
  where detail.org_id = v_org_id
    and detail.product_code = v_product_id
    and nullif(detail.intermediate_code, '') is not null
  on conflict on constraint bom_lines_header_line_unique do nothing;

  select count(*)::bigint
    into v_line_count
  from public.bom_lines line
  where line.org_id = v_org_id
    and line.bom_header_id = v_header_id;

  if v_line_count = 0 then
    raise exception 'Initial shared BOM for % has no component lines', v_product_id;
  end if;

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'bom.initial_version_created',
    'bom',
    v_header_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'product_id', v_product_id,
      'bom_header_id', v_header_id,
      'version', p_initial_version,
      'line_count', v_line_count,
      'origin_module', 'npd',
      'status', 'in_review'
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'bom.initial_version_created'
      and event.aggregate_id = v_header_id
  );

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'fg.bom.released',
    'fg',
    p_project_id,
    jsonb_build_object(
      'project_id', p_project_id,
      'product_id', v_product_id,
      'bom_header_id', v_header_id,
      'version', p_initial_version,
      'factory_active', false,
      'requires_technical_approval', true
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'fg.bom.released'
      and event.aggregate_id = p_project_id
      and event.payload->>'bom_header_id' = v_header_id::text
  );

  return query
  select v_header_id, header.status, header.version, v_line_count
  from public.bom_headers header
  where header.id = v_header_id
    and header.org_id = v_org_id;
end;
$$;

create or replace function public.get_fa_bom(p_product_code text)
returns table (
  bom_header_id uuid,
  product_code text,
  status text,
  version integer,
  line_no integer,
  component_code text,
  component_type text,
  quantity numeric,
  uom text,
  manufacturing_operation_name text,
  source text
)
language sql
stable
security invoker
as $$
  with selected_header as (
    select header.id, header.product_id, header.status, header.version
    from public.bom_headers header
    where header.org_id = app.current_org_id()
      and header.product_id = p_product_code
      and header.status in ('active', 'technical_approved', 'in_review', 'draft')
    order by
      case header.status
        when 'active' then 1
        when 'technical_approved' then 2
        when 'in_review' then 3
        else 4
      end,
      header.version desc,
      header.created_at desc
    limit 1
  )
  select
    header.id,
    header.product_id,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.component_type,
    line.quantity,
    line.uom,
    line.manufacturing_operation_name,
    line.source
  from selected_header header
  join public.bom_lines line
    on line.org_id = app.current_org_id()
   and line.bom_header_id = header.id
  order by line.line_no;
$$;

create or replace function public.get_factory_active_bom(p_product_code text)
returns table (
  bom_header_id uuid,
  product_code text,
  status text,
  version integer,
  line_no integer,
  component_code text,
  quantity numeric,
  uom text,
  source text
)
language sql
stable
security invoker
as $$
  select
    header.id,
    header.product_id,
    header.status,
    header.version,
    line.line_no,
    line.component_code,
    line.quantity,
    line.uom,
    line.source
  from public.bom_headers header
  join public.bom_lines line
    on line.org_id = header.org_id
   and line.bom_header_id = header.id
  where header.org_id = app.current_org_id()
    and header.product_id = p_product_code
    and header.status = 'active'
  order by line.line_no;
$$;

create or replace function public.request_npd_released_bom_edit(
  p_active_bom_header_id uuid,
  p_requested_by uuid,
  p_notes text default null
)
returns table (
  bom_header_id uuid,
  status text,
  version integer,
  supersedes_bom_header_id uuid
)
language plpgsql
security invoker
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_active public.bom_headers%rowtype;
  v_new_id uuid;
begin
  select *
    into v_active
  from public.bom_headers header
  where header.id = p_active_bom_header_id
    and header.org_id = v_org_id
    and header.status = 'active';

  if v_active.id is null then
    raise exception 'Active released BOM version not found: %', p_active_bom_header_id;
  end if;

  select header.id
    into v_new_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.product_id = v_active.product_id
    and header.supersedes_bom_header_id = v_active.id
    and header.status = 'in_review'
  order by header.created_at
  limit 1;

  if v_new_id is null then
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      supersedes_bom_header_id,
      yield_pct,
      effective_from,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    values (
      v_org_id,
      v_active.product_id,
      v_active.npd_project_id,
      v_active.fa_code,
      'npd',
      'in_review',
      v_active.version + 1,
      v_active.id,
      v_active.yield_pct,
      current_date,
      p_requested_by,
      pg_catalog.now(),
      coalesce(p_notes, 'NPD post-release edit requested; pending Technical approval.'),
      p_requested_by
    )
    returning id into v_new_id;

    insert into public.bom_lines (
      org_id,
      bom_header_id,
      line_no,
      component_code,
      component_type,
      quantity,
      uom,
      scrap_pct,
      manufacturing_operation_name,
      sequence,
      is_phantom,
      source,
      notes
    )
    select
      line.org_id,
      v_new_id,
      line.line_no,
      line.component_code,
      line.component_type,
      line.quantity,
      line.uom,
      line.scrap_pct,
      line.manufacturing_operation_name,
      line.sequence,
      line.is_phantom,
      'superseded_copy',
      'Copied from prior active BOM for NPD edit request.'
    from public.bom_lines line
    where line.org_id = v_org_id
      and line.bom_header_id = v_active.id
    order by line.line_no;
  end if;

  insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
  select
    v_org_id,
    'bom.version_submitted',
    'bom',
    v_new_id,
    jsonb_build_object(
      'product_id', v_active.product_id,
      'previous_bom_header_id', v_active.id,
      'bom_header_id', v_new_id,
      'status', 'in_review',
      'requires_technical_approval', true
    ),
    'db-099'
  where not exists (
    select 1
    from public.outbox_events event
    where event.org_id = v_org_id
      and event.event_type = 'bom.version_submitted'
      and event.aggregate_id = v_new_id
  );

  return query
  select header.id, header.status, header.version, header.supersedes_bom_header_id
  from public.bom_headers header
  where header.id = v_new_id
    and header.org_id = v_org_id;
end;
$$;

create or replace function public.backfill_initial_shared_boms_from_legacy_npd()
returns integer
language plpgsql
security invoker
as $$
declare
  v_created integer := 0;
begin
  with candidates as (
    select product_row.org_id, product_row.product_code, project.id as project_id, product_row.created_by_user
    from public.product product_row
    left join public.npd_projects project
      on project.org_id = product_row.org_id
     and project.product_code = product_row.product_code
    where (product_row.built = true or lower(coalesce(product_row.status_overall, '')) in ('released', 'built', 'complete', 'launched'))
      and not exists (
        select 1
        from public.bom_headers header
        where header.org_id = product_row.org_id
          and header.product_id = product_row.product_code
          and header.version = 1
      )
      and exists (
        select 1
        from public.prod_detail detail
        where detail.org_id = product_row.org_id
          and detail.product_code = product_row.product_code
          and nullif(detail.intermediate_code, '') is not null
      )
  ),
  inserted_headers as (
    insert into public.bom_headers (
      org_id,
      product_id,
      npd_project_id,
      fa_code,
      origin_module,
      status,
      version,
      technical_review_requested_by,
      technical_review_requested_at,
      notes,
      created_by_user
    )
    select
      candidate.org_id,
      candidate.product_code,
      candidate.project_id,
      candidate.product_code,
      'npd',
      'in_review',
      1,
      candidate.created_by_user,
      pg_catalog.now(),
      'Backfilled initial shared BOM version from Monopilot NPD production detail; pending Technical approval.',
      candidate.created_by_user
    from candidates candidate
    returning id, org_id, product_id, npd_project_id, created_by_user
  ),
  inserted_lines as (
    insert into public.bom_lines (
      org_id,
      bom_header_id,
      line_no,
      component_code,
      component_type,
      quantity,
      uom,
      manufacturing_operation_name,
      sequence,
      source,
      notes
    )
    select
      detail.org_id,
      header.id,
      detail.component_index,
      detail.intermediate_code,
      'WIP',
      coalesce(detail.component_weight, 1.000000)::numeric(14,6),
      'kg',
      coalesce(
        nullif(detail.manufacturing_operation_1, ''),
        nullif(detail.manufacturing_operation_2, ''),
        nullif(detail.manufacturing_operation_3, ''),
        nullif(detail.manufacturing_operation_4, '')
      ),
      detail.component_index,
      'prod_detail',
      'Backfilled from NPD production detail.'
    from inserted_headers header
    join public.prod_detail detail
      on detail.org_id = header.org_id
     and detail.product_code = header.product_id
    where nullif(detail.intermediate_code, '') is not null
    on conflict on constraint bom_lines_header_line_unique do nothing
    returning 1
  ),
  inserted_events as (
    insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
    select
      header.org_id,
      'bom.initial_version_created',
      'bom',
      header.id,
      jsonb_build_object(
        'project_id', header.npd_project_id,
        'product_id', header.product_id,
        'bom_header_id', header.id,
        'version', 1,
        'origin_module', 'npd',
        'status', 'in_review',
        'backfilled', true
      ),
      'db-099'
    from inserted_headers header
    returning 1
  )
  select count(*)::integer
    into v_created
  from inserted_headers;

  return v_created;
end;
$$;

revoke all on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer) from public;
grant execute on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer) to app_user;

revoke all on function public.get_fa_bom(text) from public;
grant execute on function public.get_fa_bom(text) to app_user;

revoke all on function public.get_factory_active_bom(text) from public;
grant execute on function public.get_factory_active_bom(text) to app_user;

revoke all on function public.request_npd_released_bom_edit(uuid, uuid, text) from public;
grant execute on function public.request_npd_released_bom_edit(uuid, uuid, text) to app_user;

revoke all on function public.backfill_initial_shared_boms_from_legacy_npd() from public;
grant execute on function public.backfill_initial_shared_boms_from_legacy_npd() to app_user;

comment on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer)
  is 'T-093: NPD Builder primitive that writes the initial shared BOM SSOT version from Monopilot-owned prod_detail rows; idempotent and pending Technical approval.';

comment on function public.get_fa_bom(text)
  is 'T-093: FA compatibility BOM reader backed by public.bom_headers/public.bom_lines, not the deprecated computed fa_bom_view.';

comment on function public.request_npd_released_bom_edit(uuid, uuid, text)
  is 'T-093: Guards post-release NPD edits by creating a superseding in_review BOM version for Technical approval.';

select public.backfill_initial_shared_boms_from_legacy_npd();
