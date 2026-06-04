-- Migration 165: 03-Technical — factory_specs Technical-owned versioned production spec.
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5.1A, §7.4. Task T-079.
--
-- factory_specs is the Technical-owned canonical production specification
-- (factory_spec / internal_product_spec) for a Finished Good (FG), VERSIONED.
-- NPD Builder may seed the initial draft (source='npd_builder') but cannot approve
-- for factory use — Technical approval is a separate workflow (T-080/T-081).
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id day-1: nullable uuid, NO FK / NO registry (REC-L1-style soft column).
-- Clone-on-write: an approved/released version is immutable — edits create a NEW version
--   (new row, status='draft'); the DB trigger here rejects in-place mutation of business
--   fields on approved/released rows. Lifecycle terminalization (-> superseded/archived)
--   and recording the release transition are the only permitted updates.
-- FG canonical: fg_item_id -> public.items(id) (migration 153). No FA-* identifiers.
-- BOM reference is SOFT: bom_header_id is a nullable composite FK to bom_headers
--   (which exists from migration 090); bom_version is an integer soft ref. We do NOT
--   hard-depend on the parallel snapshot migration (159 / T-002).
-- D365 is integration-only: d365_item_id is a TEXT soft reference, never an FK.
-- Approval emits the outbox event 'technical.factory_spec.approved' (already registered
--   in the outbox event-type SoT); the event wiring itself is T-080/T-081 — not this task.
-- 01-npd factory_release_status.active_factory_spec_id is a SOFT uuid consumer of this
--   table's id (see migration 125); we deliberately do NOT add a hard FK from NPD here.

create table if not exists public.factory_specs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- site_id day-1: nullable, no FK, no registry.
  site_id uuid,

  -- FG canonical owner of this spec. FK to items master (migration 153).
  fg_item_id uuid not null references public.items(id) on delete restrict,

  spec_code text not null,
  version integer not null default 1,

  -- Versioned status lifecycle. approved_for_factory / released_to_factory are the
  -- factory-usable (immutable) states; draft / in_review are mutable working states.
  status text not null default 'draft',

  -- Provenance of the version. npd_builder = seeded by NPD Builder (draft only, no approval).
  source text not null default 'technical',

  -- Soft BOM bundle reference (T-080 wires the approval bundle). Nullable composite FK
  -- to bom_headers(id, org_id) — table exists from migration 090.
  bom_header_id uuid,
  bom_version integer,

  -- Clone-on-write lineage: the version this row supersedes (same fg_item_id).
  supersedes_factory_spec_id uuid,

  -- Approval / release audit columns (the workflow that sets these is T-080/T-081).
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  released_by uuid references public.users(id) on delete restrict,
  released_at timestamptz,

  notes text,

  -- D365 soft integration mirror only; never an FK.
  d365_item_id text,

  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  schema_version integer not null default 1,

  constraint factory_specs_org_fg_version_unique unique (org_id, fg_item_id, version),

  constraint factory_specs_status_check check (
    status in ('draft', 'in_review', 'approved_for_factory', 'released_to_factory', 'superseded', 'archived')
  ),
  constraint factory_specs_source_check check (
    source in ('technical', 'npd_builder', 'd365_import')
  ),
  constraint factory_specs_version_positive_check check (version > 0),
  constraint factory_specs_bom_version_check check (bom_version is null or bom_version > 0),
  constraint factory_specs_schema_version_check check (schema_version >= 1),

  -- npd_builder seeds DRAFT versions with no approval fields (AC3). Technical owns approval.
  constraint factory_specs_npd_builder_draft_check check (
    source <> 'npd_builder'
    or (status = 'draft' and approved_by is null and approved_at is null
        and released_by is null and released_at is null)
  ),
  -- d365_import may only create draft / in_review records (D365 is never authoritative).
  constraint factory_specs_d365_import_status_check check (
    source <> 'd365_import' or status in ('draft', 'in_review')
  ),
  -- Approved/released versions must carry their approval evidence.
  constraint factory_specs_approved_requires_evidence_check check (
    status not in ('approved_for_factory', 'released_to_factory')
    or (approved_by is not null and approved_at is not null)
  ),
  -- Released versions must additionally carry release evidence.
  constraint factory_specs_released_requires_evidence_check check (
    status <> 'released_to_factory'
    or (released_by is not null and released_at is not null)
  )
);

-- Soft (nullable) composite FK to the shared BOM SSOT header. bom_headers exists from
-- migration 090 with a (id, org_id) identity unique. We attach it conditionally so the
-- migration is robust even if bom_headers' identity-unique name changes; the FK is the
-- only place that couples to BOM, and it is nullable so it never blocks a spec without a
-- bundle yet (the bundle approval is T-080).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'factory_specs_bom_header_fk'
  ) then
    if exists (
      select 1 from pg_constraint
      where conrelid = 'public.bom_headers'::regclass
        and contype in ('p', 'u')
        and conkey = (
          select array_agg(attnum order by attnum)
          from pg_attribute
          where attrelid = 'public.bom_headers'::regclass
            and attname in ('id', 'org_id')
        )
    ) then
      alter table public.factory_specs
        add constraint factory_specs_bom_header_fk
        foreign key (bom_header_id, org_id)
        references public.bom_headers (id, org_id)
        on delete restrict;
    end if;
  end if;
end
$$;

-- Self-lineage soft FK: superseded version must belong to the same org.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'factory_specs_supersedes_fk'
  ) then
    alter table public.factory_specs
      add constraint factory_specs_supersedes_fk
      foreign key (supersedes_factory_spec_id) references public.factory_specs (id)
      on delete restrict;
  end if;
end
$$;

-- Indexes: org_id always first; FK indexes for fg_item_id and bom_header_id.
create index if not exists idx_factory_specs_org_fg
  on public.factory_specs (org_id, fg_item_id, version desc);

create index if not exists idx_factory_specs_org_status
  on public.factory_specs (org_id, status, fg_item_id);

create index if not exists idx_factory_specs_bom_header
  on public.factory_specs (org_id, bom_header_id)
  where bom_header_id is not null;

create index if not exists idx_factory_specs_d365
  on public.factory_specs (org_id, d365_item_id)
  where d365_item_id is not null;

-- At most ONE factory-usable (approved_for_factory) version per (org, fg).
create unique index if not exists factory_specs_one_active_approved_per_fg
  on public.factory_specs (org_id, fg_item_id)
  where status = 'approved_for_factory';

-- At most ONE released version per (org, fg).
create unique index if not exists factory_specs_one_released_per_fg
  on public.factory_specs (org_id, fg_item_id)
  where status = 'released_to_factory';

alter table public.factory_specs enable row level security;
alter table public.factory_specs force row level security;

drop policy if exists factory_specs_org_isolation on public.factory_specs;
create policy factory_specs_org_isolation
  on public.factory_specs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.factory_specs from public;
revoke all on public.factory_specs from app_user;
grant select, insert, update, delete on public.factory_specs to app_user;

-- updated_at maintenance.
create or replace function public.factory_specs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists factory_specs_set_updated_at on public.factory_specs;
create trigger factory_specs_set_updated_at
  before update on public.factory_specs
  for each row execute function public.factory_specs_set_updated_at();

-- Clone-on-write immutability guard.
-- A version in a factory-usable state (approved_for_factory / released_to_factory) is
-- IMMUTABLE: business fields cannot change in place. Edits must create a NEW version
-- (a new row with status='draft') — this is enforced at the service layer (T-080) and
-- protected here at the DB layer. The only permitted updates on a factory-usable row are:
--   - lifecycle terminalization: status -> 'superseded' or 'archived'
--   - the approved_for_factory -> released_to_factory transition (recording release_*),
--     leaving the business payload unchanged.
-- updated_at is managed by the trigger above and is ignored by this guard.
create or replace function public.factory_specs_enforce_clone_on_write()
returns trigger
language plpgsql
as $$
declare
  business_changed boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Only guard rows that are already in a factory-usable (immutable) state.
  if old.status not in ('approved_for_factory', 'released_to_factory') then
    return new;
  end if;

  -- Did any immutable business field change?
  business_changed := (
    new.org_id is distinct from old.org_id
    or new.fg_item_id is distinct from old.fg_item_id
    or new.spec_code is distinct from old.spec_code
    or new.version is distinct from old.version
    or new.source is distinct from old.source
    or new.bom_header_id is distinct from old.bom_header_id
    or new.bom_version is distinct from old.bom_version
    or new.supersedes_factory_spec_id is distinct from old.supersedes_factory_spec_id
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.notes is distinct from old.notes
    or new.site_id is distinct from old.site_id
    or new.d365_item_id is distinct from old.d365_item_id
    or new.schema_version is distinct from old.schema_version
  );

  if business_changed then
    raise exception
      'factory_specs version % (status %) is immutable; edits must create a new version (clone-on-write)',
      old.version, old.status
      using errcode = '23514';
  end if;

  -- Status may only move forward to a terminal/release state — never back to a draft/working state.
  if new.status is distinct from old.status
     and new.status not in ('released_to_factory', 'superseded', 'archived') then
    raise exception
      'factory_specs approved version cannot transition from % to % in place (clone-on-write)',
      old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists factory_specs_enforce_clone_on_write on public.factory_specs;
create trigger factory_specs_enforce_clone_on_write
  before update on public.factory_specs
  for each row execute function public.factory_specs_enforce_clone_on_write();

comment on table public.factory_specs is
  'Technical-owned, versioned canonical production spec (factory_spec / internal_product_spec) per FG. Clone-on-write: approved/released versions are immutable. Approval emits technical.factory_spec.approved (wired in T-080/T-081).';
comment on column public.factory_specs.site_id is
  'site_id day-1 soft column: nullable uuid, no FK / no registry (REC-L1 style).';
comment on column public.factory_specs.bom_header_id is
  'Soft (nullable) composite FK to the shared BOM SSOT header (bom_headers). The bundle approval is T-080.';
comment on column public.factory_specs.d365_item_id is
  'D365 soft TEXT reference only; D365 is never authoritative for approved specs (no FK).';
