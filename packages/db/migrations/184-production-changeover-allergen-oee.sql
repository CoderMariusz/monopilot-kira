-- Migration 184: 08-Production — changeover_events + allergen_changeover_validations
-- (+ 7y-retention trigger) + oee_snapshots.
-- PRD: docs/prd/08-PRODUCTION-PRD.md §9.7, §9.8, §9.9, §5.3 (BRCGS), §16.4 V-PROD-08/09/10/23/25, §5.5.
-- Tasks: T-006 (changeover_events), T-007 (allergen_changeover_validations), T-008 (oee_snapshots).
--
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id day-1: nullable site_id uuid (no FK / registry yet).
-- NUMERIC-exact: all qty/pct columns NUMERIC (never float).
-- D-OEE-1: 08-production is the SOLE PRODUCER of oee_snapshots; 15-OEE is read-only.

-- ===========================================================================
-- changeover_events (T-006, §9.7) — allergen/product changeover window.
-- ===========================================================================
create table if not exists public.changeover_events (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  site_id              uuid,                                            -- site_id day-1
  line_id              text not null,
  wo_from_id           uuid references public.work_orders(id) on delete set null,
  wo_to_id             uuid references public.work_orders(id) on delete set null,

  allergen_from        text[],
  allergen_to          text[],
  risk_level           text not null,

  started_at           timestamptz not null,
  completed_at         timestamptz,
  planned_duration_min integer,
  actual_duration_min  integer,

  cleaning_completed   boolean not null default false,
  cleaning_checklist   jsonb,
  atp_required         boolean not null default false,
  atp_result           jsonb,

  dual_sign_off_status text not null default 'pending',
  first_signer         uuid references public.users(id) on delete set null,
  first_signed_at      timestamptz,
  second_signer        uuid references public.users(id) on delete set null,
  second_signed_at     timestamptz,

  ext_jsonb            jsonb not null default '{}'::jsonb,             -- D9 L3 extension

  created_at           timestamptz not null default pg_catalog.now(),
  updated_at           timestamptz not null default pg_catalog.now(),

  constraint changeover_events_risk_level_check check (
    risk_level in ('low', 'medium', 'high', 'segregated')
  ),
  -- V-PROD-23: started_at must precede completed_at when the changeover is finished.
  constraint chk_changeover_time check (completed_at is null or started_at < completed_at)
);

create index if not exists idx_changeover_line_time on public.changeover_events (line_id, started_at);
create index if not exists idx_changeover_wo_from on public.changeover_events (wo_from_id) where wo_from_id is not null;
create index if not exists idx_changeover_wo_to on public.changeover_events (wo_to_id) where wo_to_id is not null;

alter table public.changeover_events enable row level security;
alter table public.changeover_events force row level security;
drop policy if exists changeover_events_org_context on public.changeover_events;
create policy changeover_events_org_context
  on public.changeover_events
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.changeover_events from public;
revoke all on public.changeover_events from app_user;
grant select, insert, update, delete on public.changeover_events to app_user;

drop trigger if exists changeover_events_set_updated_at on public.changeover_events;
create trigger changeover_events_set_updated_at
  before update on public.changeover_events
  for each row execute function public.production_set_updated_at();

-- ===========================================================================
-- allergen_changeover_validations (T-007, §9.8) — BRCGS Issue 10 evidence record.
--   V-PROD-09: retention_until = validated_at + 7y (trigger, override below 7y forbidden).
--   V-PROD-08: signatures length >= 2 for risk in (medium, high, segregated) (CHECK).
-- ===========================================================================
create table if not exists public.allergen_changeover_validations (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,                                            -- site_id day-1
  changeover_event_id uuid not null references public.changeover_events(id) on delete cascade,

  validation_result   text not null,
  risk_level          text not null,

  cleaning_evidence   jsonb not null,
  atp_evidence        jsonb,
  signatures          jsonb not null,

  override_by         uuid references public.users(id) on delete set null,
  override_reason     text,

  validated_at        timestamptz not null default pg_catalog.now(),
  retention_until     date not null,

  -- V-PROD-08: dual signature required for risk >= medium.
  constraint chk_allergen_signatures check (
    jsonb_array_length(signatures) >= 2 or risk_level not in ('medium', 'high', 'segregated')
  )
);

create index if not exists idx_allergen_val_changeover on public.allergen_changeover_validations (changeover_event_id);
create index if not exists idx_allergen_val_retention on public.allergen_changeover_validations (retention_until);

-- V-PROD-09 trigger: stamp retention_until = validated_at + 7y, never allowing a shorter
-- retention than BRCGS Issue 10 §5.3#1 requires. If a caller supplies an earlier date it is
-- clamped UP to validated_at + 7y; a later date (longer retention) is left untouched.
create or replace function public.fn_set_allergen_retention_until()
returns trigger
language plpgsql
as $$
declare
  v_min_retention date := (new.validated_at + interval '7 years')::date;
begin
  if new.retention_until is null or new.retention_until < v_min_retention then
    new.retention_until := v_min_retention;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_allergen_retention_until on public.allergen_changeover_validations;
create trigger trg_set_allergen_retention_until
  before insert or update on public.allergen_changeover_validations
  for each row execute function public.fn_set_allergen_retention_until();

alter table public.allergen_changeover_validations enable row level security;
alter table public.allergen_changeover_validations force row level security;
drop policy if exists allergen_changeover_validations_org_context on public.allergen_changeover_validations;
create policy allergen_changeover_validations_org_context
  on public.allergen_changeover_validations
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.allergen_changeover_validations from public;
revoke all on public.allergen_changeover_validations from app_user;
grant select, insert, update, delete on public.allergen_changeover_validations to app_user;

-- ===========================================================================
-- oee_snapshots (T-008, §9.9) — per-minute OEE producer (D-OEE-1: 08 is sole writer).
--   V-PROD-10: UNIQUE (org_id, line_id, shift_id, snapshot_minute).
--   V-PROD-25: A/P/Q each CHECK BETWEEN 0 AND 100.
--   oee_pct GENERATED ALWAYS AS (A*P*Q/10000) STORED — never user-settable.
--   90-day retention (§5.5) — enforced by the cross-module sweeper; noted for provenance.
-- ===========================================================================
create table if not exists public.oee_snapshots (
  id                  bigserial primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  site_id             uuid,                                            -- site_id day-1
  line_id             text not null,
  shift_id            text not null,
  snapshot_minute     timestamptz not null,

  availability_pct    numeric(5, 2) not null,
  performance_pct     numeric(5, 2) not null,
  quality_pct         numeric(5, 2) not null,
  oee_pct             numeric(5, 2) generated always as (
    availability_pct * performance_pct * quality_pct / 10000
  ) stored,

  active_wo_id        uuid,                                            -- soft ref (snapshot fact)
  output_qty_delta    numeric(12, 3),
  downtime_min_delta  integer,
  waste_qty_delta     numeric(12, 3),
  ideal_cycle_time_sec numeric(8, 2),

  created_at          timestamptz not null default pg_catalog.now(),

  constraint oee_snapshots_line_shift_minute_unique unique (org_id, line_id, shift_id, snapshot_minute),
  constraint oee_snapshots_availability_pct_range_check check (availability_pct between 0 and 100),
  constraint oee_snapshots_performance_pct_range_check check (performance_pct between 0 and 100),
  constraint oee_snapshots_quality_pct_range_check check (quality_pct between 0 and 100)
);

create index if not exists idx_oee_line_time on public.oee_snapshots (line_id, snapshot_minute desc);

alter table public.oee_snapshots enable row level security;
alter table public.oee_snapshots force row level security;
drop policy if exists oee_snapshots_org_context on public.oee_snapshots;
create policy oee_snapshots_org_context
  on public.oee_snapshots
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.oee_snapshots from public;
revoke all on public.oee_snapshots from app_user;
grant select, insert, update, delete on public.oee_snapshots to app_user;
