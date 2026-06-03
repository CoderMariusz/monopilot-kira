-- Migration 085: T-054 NPD Stage-Gate core tables.
-- PRD: docs/prd/01-NPD-PRD.md §17.3-§17.5.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.npd_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  code text not null unique,
  name text not null,
  type text not null,
  current_gate text not null default 'G0',
  current_stage text not null default 'brief',
  prio text not null default 'normal',
  owner text,
  target_launch date,
  notes text,
  product_code text references public.product(product_code),
  start_from text,
  clone_source text,
  created_at timestamptz not null default now(),
  created_by_user uuid references public.users(id),
  created_by_device uuid,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  external_id text,
  schema_version integer not null default 1,
  constraint npd_projects_current_gate_check
    check (current_gate in ('G0', 'G1', 'G2', 'G3', 'G4', 'Launched')),
  constraint npd_projects_current_stage_check
    check (current_stage in ('brief', 'recipe', 'trial', 'approval', 'handoff')),
  constraint npd_projects_prio_check
    check (prio in ('high', 'normal', 'low')),
  constraint npd_projects_start_from_check
    check (start_from is null or start_from in ('blank', 'clone', 'template'))
);

create table if not exists public.gate_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  gate_code text not null,
  category_code text not null,
  item_text text not null,
  required boolean not null default false,
  completed_at timestamptz,
  completed_by_user uuid references public.users(id),
  evidence_file text,
  created_at timestamptz not null default now(),
  schema_version integer not null default 1,
  constraint gate_checklist_items_gate_code_check
    check (gate_code in ('G0', 'G1', 'G2', 'G3', 'G4')),
  constraint gate_checklist_items_category_code_check
    check (category_code in ('technical', 'business', 'compliance'))
);

create index if not exists gate_checklist_items_org_project_gate_idx
  on public.gate_checklist_items (org_id, project_id, gate_code);

create table if not exists public.gate_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid references public.npd_projects(id) on delete set null,
  gate_code text not null,
  decision text not null,
  approver_user_id uuid not null references public.users(id),
  notes text,
  rejection_reason text,
  esigned_at timestamptz,
  esign_hash text,
  created_at timestamptz not null default now(),
  schema_version integer not null default 1,
  constraint gate_approvals_gate_code_check
    check (gate_code in ('G0', 'G1', 'G2', 'G3', 'G4')),
  constraint gate_approvals_decision_check
    check (decision in ('approved', 'rejected'))
);

create index if not exists gate_approvals_org_project_gate_idx
  on public.gate_approvals (org_id, project_id, gate_code);

alter table public.npd_projects enable row level security;
alter table public.npd_projects force row level security;

drop policy if exists npd_projects_org_context on public.npd_projects;
create policy npd_projects_org_context
  on public.npd_projects
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.gate_checklist_items enable row level security;
alter table public.gate_checklist_items force row level security;

drop policy if exists gate_checklist_items_org_context on public.gate_checklist_items;
create policy gate_checklist_items_org_context
  on public.gate_checklist_items
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.gate_approvals enable row level security;
alter table public.gate_approvals force row level security;

drop policy if exists gate_approvals_org_context on public.gate_approvals;
create policy gate_approvals_org_context
  on public.gate_approvals
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_projects from public;
revoke all on public.npd_projects from app_user;
grant select, insert, update, delete on public.npd_projects to app_user;

revoke all on public.gate_checklist_items from public;
revoke all on public.gate_checklist_items from app_user;
grant select, insert, update, delete on public.gate_checklist_items to app_user;

revoke all on public.gate_approvals from public;
revoke all on public.gate_approvals from app_user;
grant select, insert, update, delete on public.gate_approvals to app_user;
