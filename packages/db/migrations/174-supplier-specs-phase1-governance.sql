-- Migration 174: 03-Technical T-075 — supplier_specs Phase 1 governance.
--
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §5.5. Task T-075.
--
-- supplier_specs ships from migration 162 (Technical-owned master data) with the
-- supplier_status / lifecycle_status / review_status vocabularies, approval+rejection audit
-- columns, the expiry>=effective CHECK, and the partial unique index
-- supplier_specs_one_active_approved (one active+approved spec per org/item/supplier).
--
-- This migration adds the Phase-1 GOVERNANCE layer the task reserves for T-075:
--   1. supplier_spec_review_proposals: PO actuals (or any reviewer) may PROPOSE a supplier-spec
--      change WITHOUT mutating supplier_specs. The proposal carries observed/non-conformance
--      data and a review state; supplier_specs only changes via the explicit Technical approval
--      path (approve_supplier_spec_review). This is the DB enforcement of red line
--      "Do not automatically overwrite supplier_specs from PO actuals".
--   2. supplier_spec_resolved_lifecycle(): a STABLE helper that resolves the EFFECTIVE
--      lifecycle status of a spec — an active spec whose expiry_date is in the past resolves
--      to 'expired' (AC2) regardless of the stored column, so RM usability cannot pass on a
--      lapsed spec even if a background expiry sweep has not yet run.
--   3. supplier_spec_rm_usability(): a STABLE typed-decision helper returning
--      usable (boolean) + reason (stable machine code) for RM usability gating:
--        'OK' | 'SUPPLIER_NOT_APPROVED' | 'EXPIRED' | 'NOT_REVIEW_APPROVED' |
--        'SPEC_BLOCKED' | 'NOT_FOUND'. (AC4/AC6/AC7).
--   4. approve_supplier_spec_review() / reject_supplier_spec_review(): the ONLY governed
--      mutation path for a proposal -> spec transition. approve sets review/lifecycle to the
--      approved/active state (preserving the single-active uniqueness by superseding the prior
--      active+approved spec); reject/block leaves the prior active+approved spec UNTOUCHED
--      (AC3/AC7).
--
-- Wave0 lock: org_id business scope; RLS via app.current_org_id(). site_id day-1 nullable, no
-- FK / no registry on the new operational table. declared_allergens compatibility is preserved
-- (untouched). D365 is integration only — no D365 hard FK. No new outbox event types here.
-- Idempotent: create-if-not-exists table, create-or-replace functions, drop-if-exists triggers.

-- ===========================================================================
-- 1. supplier_spec_review_proposals — non-mutating PO/review proposal channel
-- ===========================================================================
create table if not exists public.supplier_spec_review_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Day-1 multi-site: nullable, no FK, no registry. 14-multi-site/T-030 backfills + tightens.
  site_id uuid,
  -- The supplier_spec this proposal targets (the record that MAY be superseded on approval).
  supplier_spec_id uuid not null,
  -- Provenance of the proposal. 'po_actual' = observed at goods-in / PO review (cannot mutate
  -- supplier_specs directly); 'technical' = a Technical-authored revision proposal.
  source text not null default 'po_actual',
  -- Where this proposal sits in its own review lifecycle.
  proposal_status text not null default 'pending',
  -- Observed / proposed payload (e.g. measured nutrition, allergen deltas, certificate refs).
  proposed_attrs jsonb not null default '{}'::jsonb,
  observed_notes text,
  is_non_conformance boolean not null default false,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text,
  -- On approval, the NEW supplier_spec row created from this proposal (clone-on-write lineage).
  resulting_supplier_spec_id uuid,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,

  constraint supplier_spec_review_proposals_spec_org_fk
    foreign key (supplier_spec_id) references public.supplier_specs(id) on delete cascade,
  constraint supplier_spec_review_proposals_resulting_spec_fk
    foreign key (resulting_supplier_spec_id) references public.supplier_specs(id) on delete set null,
  constraint supplier_spec_review_proposals_source_check
    check (source in ('po_actual', 'technical', 'import')),
  constraint supplier_spec_review_proposals_status_check
    check (proposal_status in ('pending', 'approved', 'rejected', 'blocked')),
  constraint supplier_spec_review_proposals_proposed_attrs_object_check
    check (jsonb_typeof(proposed_attrs) = 'object'),
  -- An approved proposal must record the resulting spec; a non-approved one must not.
  constraint supplier_spec_review_proposals_resulting_spec_consistency_check
    check (
      (proposal_status = 'approved' and resulting_supplier_spec_id is not null)
      or (proposal_status <> 'approved' and resulting_supplier_spec_id is null)
    )
);

create index if not exists idx_supplier_spec_review_proposals_org_spec
  on public.supplier_spec_review_proposals (org_id, supplier_spec_id);
create index if not exists idx_supplier_spec_review_proposals_org_status
  on public.supplier_spec_review_proposals (org_id, proposal_status);
create index if not exists idx_supplier_spec_review_proposals_org_site
  on public.supplier_spec_review_proposals (org_id, site_id);

alter table public.supplier_spec_review_proposals enable row level security;
alter table public.supplier_spec_review_proposals force row level security;

drop policy if exists supplier_spec_review_proposals_org_context on public.supplier_spec_review_proposals;
create policy supplier_spec_review_proposals_org_context
  on public.supplier_spec_review_proposals
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.supplier_spec_review_proposals from public;
revoke all on public.supplier_spec_review_proposals from app_user;
grant select, insert, update, delete on public.supplier_spec_review_proposals to app_user;

create or replace function public.supplier_spec_review_proposals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists supplier_spec_review_proposals_set_updated_at on public.supplier_spec_review_proposals;
create trigger supplier_spec_review_proposals_set_updated_at
  before update on public.supplier_spec_review_proposals
  for each row execute function public.supplier_spec_review_proposals_set_updated_at();

-- ===========================================================================
-- 2. Effective-lifecycle resolver (expiry-aware)
-- ===========================================================================
-- Resolve the EFFECTIVE lifecycle status: an 'active' spec whose expiry_date is in the past is
-- reported as 'expired' (AC2). Stored terminal/blocked states are passed through unchanged.
create or replace function public.supplier_spec_resolved_lifecycle(
  p_lifecycle_status text,
  p_expiry_date date
)
returns text
language sql
immutable
as $$
  select case
    when p_expiry_date is not null and p_expiry_date < current_date
         and p_lifecycle_status in ('draft', 'active')
      then 'expired'
    else p_lifecycle_status
  end;
$$;

-- ===========================================================================
-- 3. RM usability typed-decision helper
-- ===========================================================================
-- Returns whether a supplier_spec may be used for RM usability + a stable reason code.
-- Gating order (most blocking first): not found -> spec/supplier blocked -> supplier not
-- approved -> not review-approved -> expired -> OK.
create or replace function public.supplier_spec_rm_usability(
  p_supplier_spec_id uuid
)
returns table (usable boolean, reason text)
language plpgsql
stable
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_spec public.supplier_specs%rowtype;
  v_effective_lifecycle text;
begin
  select *
    into v_spec
  from public.supplier_specs spec
  where spec.id = p_supplier_spec_id
    and spec.org_id = v_org_id;

  if v_spec.id is null then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;

  if v_spec.lifecycle_status = 'blocked'
     or v_spec.review_status = 'blocked'
     or v_spec.spec_review_blocked then
    return query select false, 'SPEC_BLOCKED'::text;
    return;
  end if;

  if v_spec.supplier_status <> 'approved' then
    return query select false, 'SUPPLIER_NOT_APPROVED'::text;
    return;
  end if;

  if v_spec.review_status <> 'approved' then
    return query select false, 'NOT_REVIEW_APPROVED'::text;
    return;
  end if;

  v_effective_lifecycle :=
    public.supplier_spec_resolved_lifecycle(v_spec.lifecycle_status, v_spec.expiry_date);

  if v_effective_lifecycle <> 'active' then
    -- Surface EXPIRED specifically; any other non-active resolves to the generic lifecycle code.
    if v_effective_lifecycle = 'expired' then
      return query select false, 'EXPIRED'::text;
    else
      return query select false, ('LIFECYCLE_' || upper(v_effective_lifecycle))::text;
    end if;
    return;
  end if;

  return query select true, 'OK'::text;
end;
$$;

revoke all on function public.supplier_spec_rm_usability(uuid) from public;
grant execute on function public.supplier_spec_rm_usability(uuid) to app_user;

-- ===========================================================================
-- 4. Governed proposal -> spec transitions (the ONLY mutation path)
-- ===========================================================================
-- approve_supplier_spec_review(): Technical approves a pending proposal. Creates a NEW
-- active+approved supplier_spec (clone-on-write from the targeted spec, overlaying the
-- proposed_attrs) and supersedes the prior active+approved spec for the same
-- (org,item,supplier) so the single-active uniqueness index is preserved. The proposal is
-- marked approved with resulting_supplier_spec_id set. NEVER overwrites the prior spec row's
-- identity columns in place.
create or replace function public.approve_supplier_spec_review(
  p_proposal_id uuid,
  p_approved_by uuid,
  p_new_spec_version text default null,
  p_new_expiry_date date default null,
  p_review_notes text default null
)
returns uuid
language plpgsql
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_proposal public.supplier_spec_review_proposals%rowtype;
  v_base public.supplier_specs%rowtype;
  v_new_spec_id uuid;
begin
  select *
    into v_proposal
  from public.supplier_spec_review_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.org_id = v_org_id
  for update;

  if v_proposal.id is null then
    raise exception 'supplier spec review proposal not found in current org: %', p_proposal_id
      using errcode = 'P0002';
  end if;

  if v_proposal.proposal_status <> 'pending' then
    raise exception 'supplier spec review proposal % is not pending (status %)',
      p_proposal_id, v_proposal.proposal_status
      using errcode = '23514';
  end if;

  select *
    into v_base
  from public.supplier_specs spec
  where spec.id = v_proposal.supplier_spec_id
    and spec.org_id = v_org_id
  for update;

  if v_base.id is null then
    raise exception 'targeted supplier_spec not found in current org: %', v_proposal.supplier_spec_id
      using errcode = 'P0002';
  end if;

  -- Supersede the prior active+approved spec for the same (org,item,supplier) so the new
  -- active+approved row does not violate supplier_specs_one_active_approved.
  update public.supplier_specs spec
     set lifecycle_status = 'superseded'
   where spec.org_id = v_org_id
     and spec.item_id = v_base.item_id
     and spec.supplier_code = v_base.supplier_code
     and spec.lifecycle_status = 'active'
     and spec.review_status = 'approved';

  -- Clone-on-write: a NEW supplier_spec row carrying the approved revision.
  insert into public.supplier_specs (
    org_id, site_id, item_id, supplier_code, supplier_status,
    spec_document_url, document_sha256, document_mime_type,
    spec_version, issued_date, effective_from, expiry_date,
    lifecycle_status, review_status, review_notes,
    approved_by, approved_at,
    declared_allergens, declared_attrs, certificate_refs,
    uploaded_by
  )
  values (
    v_org_id, v_base.site_id, v_base.item_id, v_base.supplier_code, 'approved',
    v_base.spec_document_url, v_base.document_sha256, v_base.document_mime_type,
    coalesce(p_new_spec_version, v_base.spec_version || '-rev'),
    v_base.issued_date, current_date, coalesce(p_new_expiry_date, v_base.expiry_date),
    'active', 'approved', coalesce(p_review_notes, 'Approved from supplier spec review proposal.'),
    p_approved_by, pg_catalog.now(),
    v_base.declared_allergens,
    v_base.declared_attrs || v_proposal.proposed_attrs,
    v_base.certificate_refs,
    p_approved_by
  )
  returning id into v_new_spec_id;

  update public.supplier_spec_review_proposals proposal
     set proposal_status = 'approved',
         reviewed_by = p_approved_by,
         reviewed_at = pg_catalog.now(),
         review_notes = coalesce(p_review_notes, proposal.review_notes),
         resulting_supplier_spec_id = v_new_spec_id
   where proposal.id = p_proposal_id
     and proposal.org_id = v_org_id;

  return v_new_spec_id;
end;
$$;

revoke all on function public.approve_supplier_spec_review(uuid, uuid, text, date, text) from public;
grant execute on function public.approve_supplier_spec_review(uuid, uuid, text, date, text) to app_user;

-- reject_supplier_spec_review(): mark a proposal rejected/blocked. The prior active+approved
-- spec is left UNTOUCHED (AC7). p_block=true records a blocking review (e.g. non-conformance).
create or replace function public.reject_supplier_spec_review(
  p_proposal_id uuid,
  p_reviewed_by uuid,
  p_review_notes text default null,
  p_block boolean default false
)
returns void
language plpgsql
as $$
declare
  v_org_id uuid := app.current_org_id();
  v_proposal public.supplier_spec_review_proposals%rowtype;
begin
  select *
    into v_proposal
  from public.supplier_spec_review_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.org_id = v_org_id
  for update;

  if v_proposal.id is null then
    raise exception 'supplier spec review proposal not found in current org: %', p_proposal_id
      using errcode = 'P0002';
  end if;

  if v_proposal.proposal_status <> 'pending' then
    raise exception 'supplier spec review proposal % is not pending (status %)',
      p_proposal_id, v_proposal.proposal_status
      using errcode = '23514';
  end if;

  update public.supplier_spec_review_proposals proposal
     set proposal_status = case when p_block then 'blocked' else 'rejected' end,
         reviewed_by = p_reviewed_by,
         reviewed_at = pg_catalog.now(),
         review_notes = p_review_notes
   where proposal.id = p_proposal_id
     and proposal.org_id = v_org_id;
end;
$$;

revoke all on function public.reject_supplier_spec_review(uuid, uuid, text, boolean) from public;
grant execute on function public.reject_supplier_spec_review(uuid, uuid, text, boolean) to app_user;

-- ===========================================================================
-- Comments
-- ===========================================================================
comment on table public.supplier_spec_review_proposals is
  'T-075: non-mutating PO/Technical review proposal channel for supplier_specs. PO actuals create proposals (review/non-conformance) but never overwrite supplier_specs; the only governed mutation path is approve_supplier_spec_review (Technical).';
comment on function public.supplier_spec_resolved_lifecycle(text, date) is
  'T-075: resolves effective lifecycle — an active/draft spec past its expiry_date resolves to expired (AC2).';
comment on function public.supplier_spec_rm_usability(uuid) is
  'T-075: typed RM-usability decision (usable, reason). reason in OK|SUPPLIER_NOT_APPROVED|EXPIRED|NOT_REVIEW_APPROVED|SPEC_BLOCKED|NOT_FOUND.';
comment on function public.approve_supplier_spec_review(uuid, uuid, text, date, text) is
  'T-075: Technical-only governed approval. Clones a new active+approved supplier_spec from a proposal and supersedes the prior active+approved spec (preserving single-active uniqueness).';
comment on function public.reject_supplier_spec_review(uuid, uuid, text, boolean) is
  'T-075: reject/block a supplier spec review proposal; the prior active+approved spec is left untouched (AC7).';
