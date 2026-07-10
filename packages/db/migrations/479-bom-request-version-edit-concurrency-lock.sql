-- Migration 479 — Serialize concurrent bom_request_version_edit forks (Wave 15 fix / N-20).
--
-- Per-(org, product) advisory xact lock + in-flight child recheck so two concurrent
-- immutable-version edits attach to the SAME draft instead of racing on version+1.

create or replace function public.bom_request_version_edit(
  p_source_bom_header_id uuid,
  p_requested_by uuid,
  p_notes text default null
)
returns table (
  decision text,
  bom_header_id uuid,
  status text,
  version integer,
  supersedes_bom_header_id uuid
)
language plpgsql
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_src public.bom_headers%rowtype;
  v_new_id uuid;
  v_decision text;
begin
  select *
    into v_src
  from public.bom_headers header
  where header.id = p_source_bom_header_id
    and header.org_id = v_org_id;

  if v_src.id is null then
    raise exception 'BOM version not found in current org: %', p_source_bom_header_id
      using errcode = 'P0002';
  end if;

  if v_src.status not in ('technical_approved', 'active') then
    raise exception
      'BOM version % is in status % and is directly editable; clone-on-write only applies to technical_approved/active versions',
      p_source_bom_header_id, v_src.status
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      'technical:bom_version_edit'
        || '::' || v_org_id::text
        || '::' || coalesce(v_src.product_id, '')
    )
  );

  select header.id
    into v_new_id
  from public.bom_headers header
  where header.org_id = v_org_id
    and header.supersedes_bom_header_id = v_src.id
    and header.status in ('draft', 'in_review')
  order by header.created_at
  limit 1;

  if v_new_id is not null then
    v_decision := 'existing';
  else
    v_decision := 'cloned';

    begin
      insert into public.bom_headers (
        org_id, product_id, npd_project_id, fa_code, origin_module, status, version,
        supersedes_bom_header_id, yield_pct, effective_from,
        technical_review_requested_by, technical_review_requested_at, notes, created_by_user
      )
      values (
        v_org_id, v_src.product_id, v_src.npd_project_id, v_src.fa_code, 'technical', 'in_review',
        v_src.version + 1, v_src.id, v_src.yield_pct, current_date,
        p_requested_by, pg_catalog.now(),
        coalesce(p_notes, 'Technical post-release edit; new version pending Technical approval (clone-on-write).'),
        p_requested_by
      )
      returning id into v_new_id;

      insert into public.bom_lines (
        org_id, bom_header_id, line_no, component_code, component_type, item_id, quantity, uom,
        scrap_pct, manufacturing_operation_name, sequence, is_phantom, source, notes
      )
      select
        line.org_id, v_new_id, line.line_no, line.component_code, line.component_type, line.item_id,
        line.quantity, line.uom, line.scrap_pct, line.manufacturing_operation_name, line.sequence,
        line.is_phantom, 'superseded_copy', 'Copied from prior immutable BOM version (clone-on-write).'
      from public.bom_lines line
      where line.org_id = v_org_id
        and line.bom_header_id = v_src.id
      order by line.line_no;

      insert into public.bom_co_products (
        org_id, bom_header_id, co_product_item_id, quantity, uom, allocation_pct, is_byproduct, site_id
      )
      select
        cp.org_id, v_new_id, cp.co_product_item_id, cp.quantity, cp.uom, cp.allocation_pct,
        cp.is_byproduct, cp.site_id
      from public.bom_co_products cp
      where cp.org_id = v_org_id
        and cp.bom_header_id = v_src.id;

      insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
      select
        v_org_id, 'bom.version_submitted', 'bom', v_new_id,
        jsonb_build_object(
          'previous_bom_header_id', v_src.id,
          'bom_header_id', v_new_id,
          'status', 'in_review',
          'origin', 'technical_clone_on_write',
          'requires_technical_approval', true
        ),
        'db-168'
      where not exists (
        select 1 from public.outbox_events event
        where event.org_id = v_org_id
          and event.event_type = 'bom.version_submitted'
          and event.aggregate_id = v_new_id::text
      );
    exception
      when unique_violation then
        select header.id
          into v_new_id
        from public.bom_headers header
        where header.org_id = v_org_id
          and header.supersedes_bom_header_id = v_src.id
          and header.status in ('draft', 'in_review')
        order by header.created_at
        limit 1;

        if v_new_id is null then
          raise;
        end if;

        v_decision := 'existing';
    end;
  end if;

  return query
  select v_decision, header.id, header.status, header.version, header.supersedes_bom_header_id
  from public.bom_headers header
  where header.id = v_new_id
    and header.org_id = v_org_id;
end;
$$;

revoke all on function public.bom_request_version_edit(uuid, uuid, text) from public;
grant execute on function public.bom_request_version_edit(uuid, uuid, text) to app_user;
