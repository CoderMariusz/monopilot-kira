-- Migration 039: Settings rule registry tables (T-006)
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.3, §7; ADR-029.
-- Wave0: org_id business scope. RLS uses app.current_org_id().

create table if not exists public.rule_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rule_code text not null,
  rule_type text not null constraint rule_definitions_rule_type_check check (rule_type in ('cascading', 'conditional', 'gate', 'workflow')),
  tier text not null default 'L1' constraint rule_definitions_tier_check check (tier in ('L1', 'L2', 'L3', 'L4')),
  definition_json jsonb not null,
  version int not null default 1,
  active_from timestamptz not null default pg_catalog.now(),
  active_to timestamptz,
  deployed_by uuid references public.users(id) on delete set null,
  deploy_ref text,
  unique (org_id, rule_code, version)
);

create index if not exists rule_definitions_org_rule_code_idx
  on public.rule_definitions (org_id, rule_code);
create index if not exists rule_definitions_org_id_idx
  on public.rule_definitions (org_id);

alter table public.rule_definitions enable row level security;
alter table public.rule_definitions force row level security;

drop policy if exists rule_definitions_org_context_select on public.rule_definitions;
create policy rule_definitions_org_context_select on public.rule_definitions
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists rule_definitions_org_context_insert on public.rule_definitions;
create policy rule_definitions_org_context_insert on public.rule_definitions
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists rule_definitions_org_context_update on public.rule_definitions;
create policy rule_definitions_org_context_update on public.rule_definitions
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists rule_definitions_org_context_delete on public.rule_definitions;
create policy rule_definitions_org_context_delete on public.rule_definitions
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.rule_definitions from public;
grant select, insert, update, delete on public.rule_definitions to app_user;

create table if not exists public.rule_dry_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  rule_definition_id uuid not null references public.rule_definitions(id) on delete cascade,
  sample_input_json jsonb not null,
  result_json jsonb not null,
  ran_at timestamptz default pg_catalog.now(),
  ran_by uuid references public.users(id) on delete set null
);

create index if not exists rule_dry_runs_org_rule_definition_idx
  on public.rule_dry_runs (org_id, rule_definition_id);
create index if not exists rule_dry_runs_org_id_idx
  on public.rule_dry_runs (org_id);

alter table public.rule_dry_runs enable row level security;
alter table public.rule_dry_runs force row level security;

drop policy if exists rule_dry_runs_org_context_select on public.rule_dry_runs;
create policy rule_dry_runs_org_context_select on public.rule_dry_runs
  for select to app_user
  using (org_id = app.current_org_id());

drop policy if exists rule_dry_runs_org_context_insert on public.rule_dry_runs;
create policy rule_dry_runs_org_context_insert on public.rule_dry_runs
  for insert to app_user
  with check (org_id = app.current_org_id());

drop policy if exists rule_dry_runs_org_context_update on public.rule_dry_runs;
create policy rule_dry_runs_org_context_update on public.rule_dry_runs
  for update to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

drop policy if exists rule_dry_runs_org_context_delete on public.rule_dry_runs;
create policy rule_dry_runs_org_context_delete on public.rule_dry_runs
  for delete to app_user
  using (org_id = app.current_org_id());

revoke all on public.rule_dry_runs from public;
grant select, insert, update, delete on public.rule_dry_runs to app_user;
