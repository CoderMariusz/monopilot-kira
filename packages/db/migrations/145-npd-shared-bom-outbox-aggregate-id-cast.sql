-- Migration 145: reconcile NPD shared BOM builder functions with the
-- outbox_events.aggregate_id type change introduced by migration 102.
--
-- Background:
--   * Migration 099 (T-093) defined create_initial_shared_bom_version_for_npd_project
--     and request_npd_released_bom_edit. At that time public.outbox_events.aggregate_id
--     was UUID, so the idempotency guards compared `event.aggregate_id = <uuid var>`
--     (uuid = uuid) cleanly.
--   * Migration 102 (T-?? FA event emitter) altered outbox_events.aggregate_id (and
--     outbox_dead_letter.aggregate_id) to TEXT via `alter column ... type text`.
--   * After 102 the 099 functions raise `operator does not exist: text = uuid`
--     whenever they reach the idempotency WHERE clause, because aggregate_id is now
--     text but the local UUID variables are still uuid.
--
-- Fix:
--   create or replace the two affected functions, casting the UUID values to ::text
--   in every comparison against outbox_events.aggregate_id. INSERTs are unaffected
--   (uuid -> text is an assignment cast). No behavior change beyond the cast; the
--   shared BOM SSOT contract (org_id scope, app.current_org_id() RLS, idempotency,
--   D365 integration-only) is preserved exactly. We do NOT edit the already-applied
--   099 file.
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id().

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
      and event.aggregate_id = v_header_id::text
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
      and event.aggregate_id = p_project_id::text
      and event.payload->>'bom_header_id' = v_header_id::text
  );

  return query
  select v_header_id, header.status, header.version, v_line_count
  from public.bom_headers header
  where header.id = v_header_id
    and header.org_id = v_org_id;
end;
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
      and event.aggregate_id = v_new_id::text
  );

  return query
  select header.id, header.status, header.version, header.supersedes_bom_header_id
  from public.bom_headers header
  where header.id = v_new_id
    and header.org_id = v_org_id;
end;
$$;

revoke all on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer) from public;
grant execute on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer) to app_user;

revoke all on function public.request_npd_released_bom_edit(uuid, uuid, text) from public;
grant execute on function public.request_npd_released_bom_edit(uuid, uuid, text) to app_user;

comment on function public.create_initial_shared_bom_version_for_npd_project(uuid, text, uuid, integer)
  is 'T-093: NPD Builder primitive that writes the initial shared BOM SSOT version from Monopilot-owned prod_detail rows; idempotent and pending Technical approval. (145: outbox aggregate_id text cast)';

comment on function public.request_npd_released_bom_edit(uuid, uuid, text)
  is 'T-093: Guards post-release NPD edits by creating a superseding in_review BOM version for Technical approval. (145: outbox aggregate_id text cast)';

-- Restore the deprecated/preview-only marker on the legacy NPD computed BOM
-- compatibility view. Migration 090 set this comment to flag fa_bom_view as the
-- DEPRECATED/preview-only legacy artifact (the canonical SSOT is
-- public.bom_headers/public.bom_lines per T-092). Migration 133 (T-045) recreated
-- the view and inadvertently dropped that marker. Per the T-092 SSOT intent, the
-- legacy computed view must remain flagged DEPRECATED/preview-only.
comment on view public.fa_bom_view
  is 'T-045 / T-092: DEPRECATED/preview-only legacy NPD FA BOM compatibility view (computed via get_fa_bom). Not canonical; the shared BOM SSOT is public.bom_headers/public.bom_lines. Surfaces D365 status badges only; D365 is integration only, never source of truth.';
