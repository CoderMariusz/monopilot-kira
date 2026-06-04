-- Migration 168: 03-Technical T-073 — shared BOM SSOT version state machine +
-- clone-on-write enforcement (DB layer).
--
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.1, §7.4, §7.6. Task T-073.
--
-- The shared BOM SSOT (bom_headers/bom_lines/bom_co_products) ships from migrations
-- 090 / 159. Migration 090 already:
--   * defines the status vocabulary (draft, in_review, technical_approved, active,
--     superseded, archived) via bom_headers_status_check, AND
--   * rejects in-place CONTENT mutation of technical_approved/active rows
--     (bom_headers_reject_approved_content_update + bom_lines_reject_approved_header_update).
-- Migration 099 ships request_npd_released_bom_edit() — a clone-on-write helper scoped
-- to NPD-origin, product-keyed ACTIVE BOMs.
--
-- This migration (T-073) adds the missing TECHNICAL-OWNED, generic enforcement that the
-- 159 header comment reserves for T-073:
--   1. bom_headers version STATE-MACHINE guard: only valid forward transitions are allowed
--      (draft -> in_review -> technical_approved -> active -> superseded/archived, plus the
--      symmetric review-rejection draft<->in_review and terminal archival). Illegal jumps
--      (e.g. draft -> active) and backward moves (e.g. active -> draft) are rejected. This
--      complements (does NOT replace) the 090 content-immutability trigger.
--   2. bom_request_version_edit(): a GENERIC clone-on-write helper that, for ANY immutable
--      (technical_approved/active) BOM version, creates a NEW draft version (same product/
--      npd/fa identity, bumped version, supersedes set) routed back to Technical approval —
--      copying lines + co-products — and returns a TYPED decision row. Mirrors the
--      factory_specs clone-on-write contract (migration 165) and the NPD helper (099) but
--      is origin-agnostic and Technical-owned. NEVER mutates the approved/active row.
--   3. bom_factory_release_bundle_decision(): a bundle-aware, ATOMIC FactorySpec+BOM release
--      decision (AC5). A BOM cannot be released for factory use unless the paired factory_spec
--      is approved_for_factory/released_to_factory; the function returns a single typed
--      decision (approve | reject) so a partial release is impossible unless a Technical
--      approver explicitly splits the bundle (split_allowed input).
--
-- Wave0 lock: org_id is the business scope; all helpers resolve org via app.current_org_id().
-- D365 is integration only — no D365 hard FK, no new outbox event types are introduced here
-- (the outbox event_type vocabulary is the events.enum.ts SoT, migration 151; this migration
-- reuses only the already-registered 'bom.version_submitted'). FG canonical; no FA-* ids.
-- Idempotent: create-or-replace functions + drop-if-exists triggers.

-- ===========================================================================
-- 1. bom_headers version state-machine guard
-- ===========================================================================
-- Valid transition graph (status BEFORE -> status AFTER), evaluated only when status changes:
--   draft              -> in_review | archived
--   draft              -> in_review | technical_approved | active | archived
--   in_review          -> draft (rejected back to author) | technical_approved | active | archived
--   technical_approved -> in_review (re-review) | active | superseded | archived
--   active             -> superseded | archived
--   superseded         -> archived
--   archived           -> (terminal; no transition out)
-- The PRD lifecycle is draft -> in_review -> technical_approved -> active, but a DIRECT
-- forward activation (draft/in_review -> active or -> technical_approved) is permitted for
-- atomic administrative/seed activation: any active/technical_approved row must already carry
-- approval evidence (approved_by/approved_at), enforced independently by the 090 CHECK
-- bom_headers_approved_status_requires_approval_check. What this guard PROHIBITS is any
-- BACKWARD move out of an immutable (technical_approved/active) state into a working state
-- (e.g. active -> draft/in_review) and any move out of a terminal state. That is the
-- clone-on-write invariant: once immutable, a version may only terminalize, never re-open.
-- The 090 trigger independently blocks CONTENT changes on technical_approved/active rows, so
-- the only legal UPDATE on those rows is the lifecycle transition itself (plus updated_at).
create or replace function public.bom_headers_enforce_status_transition()
returns trigger
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  v_ok := case old.status
    when 'draft'              then new.status in ('in_review', 'technical_approved', 'active', 'archived')
    when 'in_review'          then new.status in ('draft', 'technical_approved', 'active', 'archived')
    when 'technical_approved' then new.status in ('in_review', 'active', 'superseded', 'archived')
    when 'active'             then new.status in ('superseded', 'archived')
    when 'superseded'         then new.status in ('archived')
    when 'archived'           then false
    else false
  end;

  if not v_ok then
    raise exception
      'invalid BOM version status transition % -> % (clone-on-write: an immutable version may only terminalize, never re-open; create a new draft version instead)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- This guard must run BEFORE the 090 content-immutability trigger fires on the SAME row so
-- that an illegal transition is reported as a transition error. Triggers fire in name order;
-- 'bom_headers_aa_enforce_status_transition' sorts before
-- 'bom_headers_reject_approved_content_update'.
drop trigger if exists bom_headers_aa_enforce_status_transition on public.bom_headers;
create trigger bom_headers_aa_enforce_status_transition
  before update on public.bom_headers
  for each row
  execute function public.bom_headers_enforce_status_transition();

-- ===========================================================================
-- 2. Generic clone-on-write: bom_request_version_edit()
-- ===========================================================================
-- Given an immutable (technical_approved or active) BOM version, create a NEW draft version
-- (status='in_review', routed to Technical approval) that supersedes it, copying lines and
-- co-products. The approved/active source row is NEVER mutated. Idempotent per (org, source):
-- if a non-terminal superseding version already exists it is returned instead of a duplicate.
-- Returns a TYPED decision: decision = 'cloned' | 'existing'.
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

  -- Idempotency: reuse an existing in-flight superseding draft/in_review version if present.
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

    -- Reuse the already-registered outbox event (migration 151 SoT). No new event type.
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

-- ===========================================================================
-- 3. Bundle-aware FactorySpec+BOM atomic release decision
-- ===========================================================================
-- Evaluate a combined FactorySpec + BOM release in ONE decision. A BOM may be released for
-- factory use only when the paired factory_spec is factory-usable
-- (approved_for_factory / released_to_factory). Partial release is rejected unless a Technical
-- approver explicitly splits the bundle (p_split_allowed = true). Returns a single typed row:
--   decision  = 'approve' | 'reject'
--   reason    = NULL on approve; a stable machine code on reject:
--               'BOM_NOT_APPROVED' | 'FACTORY_SPEC_NOT_APPROVED' | 'PARTIAL_RELEASE_NOT_ALLOWED'
-- The function is READ-ONLY (it makes no state change); the caller (T-080/T-081 service) applies
-- the transition atomically based on the decision.
create or replace function public.bom_factory_release_bundle_decision(
  p_bom_header_id uuid,
  p_factory_spec_id uuid,
  p_split_allowed boolean default false
)
returns table (
  decision text,
  reason text,
  bom_ready boolean,
  factory_spec_ready boolean
)
language plpgsql
stable
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_bom_status text;
  v_spec_status text;
  v_bom_ready boolean;
  v_spec_ready boolean;
begin
  select header.status into v_bom_status
  from public.bom_headers header
  where header.id = p_bom_header_id and header.org_id = v_org_id;

  if v_bom_status is null then
    raise exception 'BOM version not found in current org: %', p_bom_header_id
      using errcode = 'P0002';
  end if;

  select spec.status into v_spec_status
  from public.factory_specs spec
  where spec.id = p_factory_spec_id and spec.org_id = v_org_id;

  if v_spec_status is null then
    raise exception 'factory_spec version not found in current org: %', p_factory_spec_id
      using errcode = 'P0002';
  end if;

  -- A BOM is release-ready when Technical has approved/activated it.
  v_bom_ready  := v_bom_status in ('technical_approved', 'active');
  -- A factory_spec is release-ready when it is factory-usable.
  v_spec_ready := v_spec_status in ('approved_for_factory', 'released_to_factory');

  if v_bom_ready and v_spec_ready then
    return query select 'approve'::text, null::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  -- One side ready, the other not => partial. Only an explicit split unblocks the ready side.
  if (v_bom_ready or v_spec_ready) and p_split_allowed then
    return query select 'approve'::text, 'SPLIT_APPROVED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  if (v_bom_ready or v_spec_ready) and not p_split_allowed then
    return query select 'reject'::text, 'PARTIAL_RELEASE_NOT_ALLOWED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  -- Neither ready: surface the BOM reason first (deterministic), else the spec reason.
  if not v_bom_ready then
    return query select 'reject'::text, 'BOM_NOT_APPROVED'::text, v_bom_ready, v_spec_ready;
    return;
  end if;

  return query select 'reject'::text, 'FACTORY_SPEC_NOT_APPROVED'::text, v_bom_ready, v_spec_ready;
end;
$$;

revoke all on function public.bom_factory_release_bundle_decision(uuid, uuid, boolean) from public;
grant execute on function public.bom_factory_release_bundle_decision(uuid, uuid, boolean) to app_user;

-- ===========================================================================
-- Comments
-- ===========================================================================
comment on function public.bom_headers_enforce_status_transition() is
  'T-073: BOM version state-machine guard. Allows only valid forward lifecycle transitions; rejects illegal jumps/backward moves. Complements the 090 content-immutability trigger.';
comment on function public.bom_request_version_edit(uuid, uuid, text) is
  'T-073: generic clone-on-write for the shared BOM SSOT. Clones an immutable (technical_approved/active) version into a new in_review draft routed to Technical approval; never mutates the source. Returns a typed decision (cloned|existing).';
comment on function public.bom_factory_release_bundle_decision(uuid, uuid, boolean) is
  'T-073: atomic FactorySpec+BOM release decision. Rejects partial release unless a Technical approver explicitly splits the bundle. Read-only; caller applies the transition.';
