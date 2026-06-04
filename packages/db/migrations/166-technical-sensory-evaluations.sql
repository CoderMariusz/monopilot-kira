-- Migration 166: 03-Technical — sensory evaluation read model / contract.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5, §17 (T-084).
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
--
-- Technical owns the sensory evaluation READ MODEL. NPD approval treats sensory as
-- N/A (not_required) unless org policy requires it; downstream release guards read
-- this table to surface a SENSORIAL_BLOCKED reason for fail/hold. This migration is
-- the schema/contract ONLY — the sensory UI is T-092 (later, consumes this).
--
-- Red lines honoured:
--   * Does NOT move NPD gate ownership into Technical (read model + contract only).
--   * No external lab/sensory vendor integration.
--   * FG is canonical — no legacy FA aliases introduced.
--   * d365_* are soft TEXT references only; never hard FKs (none introduced here).
--   * subject_item_id is a soft FK to public.items(id) (mig 153) — the canonical FG/item.
--
-- site_id day-1: site_id uuid NULL on the operational table (no FK, no registry) per
-- the multi-site forward-compatibility rule.

create table if not exists public.technical_sensory_evaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- site_id day-1: nullable, no FK/registry (operational table forward-compat).
  site_id uuid,

  -- Subject of the evaluation. The read model is product/project/work-order scoped;
  -- subject_type names which one this row evaluates and subject_ref is the soft
  -- identifier (uuid/code) of that subject. subject_item_id is the canonical FG/item
  -- soft FK to public.items(id) (mig 153) when the subject is an item/FG.
  subject_type text not null,
  subject_ref text not null,
  subject_item_id uuid references public.items(id) on delete restrict,

  -- The contract status set. `not_required` is first-class: when org policy does not
  -- require sensory, the read model returns not_required and NPD proceeds without
  -- fabricated Technical evidence. required/pending/pass/fail/hold cover the lifecycle.
  status text not null default 'not_required',

  -- Why the subject is in this status. For fail/hold this becomes the downstream
  -- SENSORIAL_BLOCKED reason surfaced by release guards.
  status_reason text,

  -- Whether org policy requires sensory for this subject. Decoupled from `status`
  -- so a required-but-unevaluated subject is required/pending (not not_required).
  policy_required boolean not null default false,

  evaluated_at timestamptz,
  evaluated_by uuid references public.users(id) on delete restrict,

  schema_version integer not null default 1,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint technical_sensory_evaluations_status_check check (
    status in ('required', 'pending', 'pass', 'fail', 'hold', 'not_required')
  ),
  constraint technical_sensory_evaluations_subject_type_check check (
    subject_type in ('product', 'project', 'work_order', 'item')
  ),
  -- not_required must not be marked policy_required (would be a contradiction the
  -- read model cannot resolve into a coherent NPD answer).
  constraint technical_sensory_evaluations_not_required_policy_check check (
    status <> 'not_required' or policy_required = false
  ),
  constraint technical_sensory_evaluations_schema_version_check check (schema_version >= 1),
  -- One canonical read-model row per (org, subject) — the latest evaluation state.
  constraint technical_sensory_evaluations_org_subject_unique
    unique (org_id, subject_type, subject_ref)
);

-- Indexes — org_id always first; hot read path is by subject + by blocked status.
create index if not exists idx_technical_sensory_evaluations_org_subject
  on public.technical_sensory_evaluations (org_id, subject_type, subject_ref);

create index if not exists idx_technical_sensory_evaluations_org_site
  on public.technical_sensory_evaluations (org_id, site_id);

create index if not exists idx_technical_sensory_evaluations_org_status
  on public.technical_sensory_evaluations (org_id, status);

create index if not exists idx_technical_sensory_evaluations_item
  on public.technical_sensory_evaluations (org_id, subject_item_id)
  where subject_item_id is not null;

-- RLS — enable + FORCE (owner also subject to policy).
alter table public.technical_sensory_evaluations enable row level security;
alter table public.technical_sensory_evaluations force row level security;

drop policy if exists technical_sensory_evaluations_org_isolation
  on public.technical_sensory_evaluations;
create policy technical_sensory_evaluations_org_isolation
  on public.technical_sensory_evaluations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

-- Grants — fail-closed default, DML to app_user only.
revoke all on public.technical_sensory_evaluations from public;
revoke all on public.technical_sensory_evaluations from app_user;
grant select, insert, update, delete on public.technical_sensory_evaluations to app_user;

-- updated_at trigger (per-table, mirrors the items-master pattern, mig 153).
create or replace function public.technical_sensory_evaluations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists technical_sensory_evaluations_set_updated_at
  on public.technical_sensory_evaluations;
create trigger technical_sensory_evaluations_set_updated_at
  before update on public.technical_sensory_evaluations
  for each row execute function public.technical_sensory_evaluations_set_updated_at();
