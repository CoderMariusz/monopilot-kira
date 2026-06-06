-- Migration 237: 03-Technical sensory PANEL detail — attribute-level extension of the
-- Technical-owned sensory model. Wave3a BE-2.
--
-- ============================================================================
-- CROSS-MODULE NOTE FOR CODEX REVIEW (NPD-driven extension of a Technical-owned model)
-- ----------------------------------------------------------------------------
-- The user decided sensory must REUSE/EXTEND the 03-Technical sensory model, NOT spawn
-- a competing NPD sensory table. The canonical owner is 03-Technical
-- (public.technical_sensory_evaluations, migration 166 / T-084 — a status-level read
-- model: required/pending/pass/fail/hold/not_required per (org, subject)). The Fala-3
-- NPD sensory PANEL screen needs ATTRIBUTE-level detail (radar attributes + score/10 +
-- ±benchmark + panelist comments) that the status read model does not carry.
--
-- This migration was AUTHORED in the NPD wave (BE-2) but every object it adds lives in
-- the Technical canonical namespace (`technical_` prefix) and ATTACHES to the existing
-- technical_sensory_evaluations row via FK — it does NOT fork a parallel panel table.
-- The existing evaluation row IS the panel; we add the missing panel-level columns to
-- it and two Technical-owned child tables for the per-attribute / per-panelist detail.
-- Reviewers: confirm this stays within the Technical owner boundary (no second sensory
-- write path; no NPD gate ownership moved into Technical).
-- ============================================================================
--
-- PRD: docs/prd/03-TECHNICAL-PRD.md §0, §5, §17 (T-084 extension); 01-NPD sensory panel.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger; NUMERIC not float.

-- ---------------------------------------------------------------------------
-- (1) Extend the existing panel/evaluation row with panel-level attributes.
--     Prefer-reuse: technical_sensory_evaluations already models the panel
--     (one canonical row per org+subject with status + evaluated_at/by). We add
--     ONLY the panel-level columns it is missing — we do NOT create a separate
--     technical_sensory_panels table.
-- ---------------------------------------------------------------------------
alter table public.technical_sensory_evaluations
  add column if not exists panel_date date,
  add column if not exists panelist_count integer,
  add column if not exists benchmark_product_code text,
  add column if not exists overall_score numeric(4, 2);

-- Guard the new numeric ranges (idempotent: drop-then-add).
alter table public.technical_sensory_evaluations
  drop constraint if exists technical_sensory_evaluations_panelist_count_check;
alter table public.technical_sensory_evaluations
  add constraint technical_sensory_evaluations_panelist_count_check
    check (panelist_count is null or panelist_count >= 0);

alter table public.technical_sensory_evaluations
  drop constraint if exists technical_sensory_evaluations_overall_score_check;
alter table public.technical_sensory_evaluations
  add constraint technical_sensory_evaluations_overall_score_check
    check (overall_score is null or (overall_score >= 0 and overall_score <= 10));

comment on column public.technical_sensory_evaluations.panel_date
  is 'Sensory PANEL extension (mig 237): date the tasting panel was run.';
comment on column public.technical_sensory_evaluations.panelist_count
  is 'Sensory PANEL extension (mig 237): number of panelists in the session.';
comment on column public.technical_sensory_evaluations.benchmark_product_code
  is 'Sensory PANEL extension (mig 237): nullable benchmark product code the panel scored against.';
comment on column public.technical_sensory_evaluations.overall_score
  is 'Sensory PANEL extension (mig 237): overall panel score out of 10 (NUMERIC(4,2)).';

-- ---------------------------------------------------------------------------
-- (2) technical_sensory_attribute_scores — radar attribute rows (score/10 + ±benchmark)
-- ---------------------------------------------------------------------------
create table if not exists public.technical_sensory_attribute_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  panel_id uuid not null
    references public.technical_sensory_evaluations(id) on delete cascade,
  attribute_name text not null,
  -- 0..10 attribute score for the radar chart.
  score_out_of_10 numeric(4, 2),
  -- signed delta vs the benchmark product for the same attribute (±).
  vs_benchmark numeric(4, 2),
  display_order integer not null default 0,
  -- Audit (R13)
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint technical_sensory_attribute_scores_score_check
    check (score_out_of_10 is null or (score_out_of_10 >= 0 and score_out_of_10 <= 10)),
  constraint technical_sensory_attribute_scores_vs_benchmark_range
    check (vs_benchmark is null or (vs_benchmark >= -10 and vs_benchmark <= 10)),
  -- one row per (panel, attribute).
  constraint technical_sensory_attribute_scores_panel_attribute_unique
    unique (panel_id, attribute_name)
);

create index if not exists idx_technical_sensory_attribute_scores_org_panel
  on public.technical_sensory_attribute_scores (org_id, panel_id);

create index if not exists idx_technical_sensory_attribute_scores_panel_order
  on public.technical_sensory_attribute_scores (panel_id, display_order);

alter table public.technical_sensory_attribute_scores enable row level security;
alter table public.technical_sensory_attribute_scores force row level security;

drop policy if exists technical_sensory_attribute_scores_org_isolation
  on public.technical_sensory_attribute_scores;
create policy technical_sensory_attribute_scores_org_isolation
  on public.technical_sensory_attribute_scores
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_sensory_attribute_scores from public;
revoke all on public.technical_sensory_attribute_scores from app_user;
grant select, insert, update, delete on public.technical_sensory_attribute_scores to app_user;

create or replace function public.technical_sensory_attribute_scores_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists technical_sensory_attribute_scores_set_updated_at
  on public.technical_sensory_attribute_scores;
create trigger technical_sensory_attribute_scores_set_updated_at
  before update on public.technical_sensory_attribute_scores
  for each row execute function public.technical_sensory_attribute_scores_set_updated_at();

comment on table public.technical_sensory_attribute_scores
  is 'Technical-owned (NPD-driven, mig 237) per-attribute sensory panel scores: radar attribute + score/10 + ±benchmark. FK panel_id -> technical_sensory_evaluations(id). org_id isolated by app.current_org_id().';

-- ---------------------------------------------------------------------------
-- (3) technical_sensory_panelist_comments — free-text panelist feedback
-- ---------------------------------------------------------------------------
create table if not exists public.technical_sensory_panelist_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  panel_id uuid not null
    references public.technical_sensory_evaluations(id) on delete cascade,
  panelist_code text not null,
  comment text not null,
  display_order integer not null default 0,
  -- Audit (R13)
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists idx_technical_sensory_panelist_comments_org_panel
  on public.technical_sensory_panelist_comments (org_id, panel_id);

create index if not exists idx_technical_sensory_panelist_comments_panel_order
  on public.technical_sensory_panelist_comments (panel_id, display_order);

alter table public.technical_sensory_panelist_comments enable row level security;
alter table public.technical_sensory_panelist_comments force row level security;

drop policy if exists technical_sensory_panelist_comments_org_isolation
  on public.technical_sensory_panelist_comments;
create policy technical_sensory_panelist_comments_org_isolation
  on public.technical_sensory_panelist_comments
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.technical_sensory_panelist_comments from public;
revoke all on public.technical_sensory_panelist_comments from app_user;
grant select, insert, update, delete on public.technical_sensory_panelist_comments to app_user;

create or replace function public.technical_sensory_panelist_comments_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists technical_sensory_panelist_comments_set_updated_at
  on public.technical_sensory_panelist_comments;
create trigger technical_sensory_panelist_comments_set_updated_at
  before update on public.technical_sensory_panelist_comments
  for each row execute function public.technical_sensory_panelist_comments_set_updated_at();

comment on table public.technical_sensory_panelist_comments
  is 'Technical-owned (NPD-driven, mig 237) per-panelist sensory comments. FK panel_id -> technical_sensory_evaluations(id). org_id isolated by app.current_org_id().';
