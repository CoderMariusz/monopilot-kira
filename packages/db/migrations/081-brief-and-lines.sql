-- Migration 081: T-030 — NPD brief + brief_lines schema with Brief→Project spine.
-- PRD: docs/prd/01-NPD-PRD.md §4.4, §9.1, §9.2.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.npd_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null,
  current_gate text not null default 'G0',
  current_stage text not null default 'brief',
  prio text not null default 'normal',
  owner text,
  target_launch date,
  notes text,
  start_from text,
  clone_source text,
  created_at timestamptz not null default now(),
  created_by_user uuid references public.users(id),
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  external_id text,
  schema_version integer not null default 1,
  constraint npd_projects_org_code_unique unique (org_id, code),
  constraint npd_projects_current_gate_check
    check (current_gate in ('G0', 'G1', 'G2', 'G3', 'G4', 'Launched')),
  constraint npd_projects_current_stage_check
    check (current_stage in ('brief', 'recipe', 'trial', 'approval', 'handoff')),
  constraint npd_projects_prio_check
    check (prio in ('high', 'normal', 'low')),
  constraint npd_projects_start_from_check
    check (start_from is null or start_from in ('blank', 'clone', 'template')),
  constraint npd_projects_schema_version_check
    check (schema_version >= 1)
);

create index if not exists npd_projects_org_stage_gate_idx
  on public.npd_projects (org_id, current_stage, current_gate);

alter table public.npd_projects enable row level security;
alter table public.npd_projects force row level security;

drop policy if exists npd_projects_org_context on public.npd_projects;
create policy npd_projects_org_context
  on public.npd_projects
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_projects from public;
revoke all on public.npd_projects from app_user;
grant select, insert, update, delete on public.npd_projects to app_user;

comment on table public.npd_projects
  is 'T-030 minimum NPD Stage-Gate project spine. Brief owns this project before any FG/product mapping at G3.';

create table if not exists public.brief (
  brief_id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  npd_project_id uuid not null references public.npd_projects(id) on delete cascade,
  template text not null,
  dev_code text not null,
  status text not null default 'draft',
  product_name text,
  volume numeric,
  converted_at timestamptz,
  converted_by_user uuid references public.users(id),
  created_at timestamptz not null default now(),
  created_by_user uuid references public.users(id),
  created_by_device text,
  app_version text,
  model_prediction_id uuid,
  epcis_event_id uuid,
  external_id text,
  schema_version integer not null default 1,
  constraint brief_npd_project_unique unique (npd_project_id),
  constraint brief_org_dev_code_unique unique (org_id, dev_code),
  constraint brief_id_org_unique unique (brief_id, org_id),
  constraint brief_template_check
    check (template in ('single_component', 'multi_component')),
  constraint brief_status_check
    check (status in ('draft', 'complete', 'converted', 'abandoned')),
  constraint brief_volume_positive_check
    check (volume is null or volume > 0),
  constraint brief_schema_version_check
    check (schema_version >= 1)
);

create index if not exists brief_org_status_idx
  on public.brief (org_id, status);
create index if not exists brief_org_project_idx
  on public.brief (org_id, npd_project_id);

alter table public.brief enable row level security;
alter table public.brief force row level security;

drop policy if exists brief_org_context on public.brief;
create policy brief_org_context
  on public.brief
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.brief from public;
revoke all on public.brief from app_user;
grant select, insert, update, delete on public.brief to app_user;

comment on table public.brief
  is 'T-030 NPD brief header. Canonical conversion target is npd_projects; FG/product mapping is deferred to G3.';

create table if not exists public.brief_lines (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.brief(brief_id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  line_type text not null,
  line_index integer not null,

  -- Section A: Product Details (C1-C13)
  product text,
  volume numeric,
  dev_code text,
  component text,
  slice_count integer,
  supplier text,
  code text,
  price text,
  weights numeric,
  pct numeric,
  packs_per_case integer,
  comments text,
  benchmark_identified text,

  -- Section B: Packaging scanned fields; remaining unscanned packaging fields stay in packaging_ext pending rescan.
  primary_packaging text,
  secondary_packaging text,
  base_web_code text,
  base_web_price numeric,
  top_web_type text,
  sleeve_carton_code text,
  sleeve_carton_price numeric,
  packaging_ext jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint brief_lines_brief_org_fkey
    foreign key (brief_id, org_id) references public.brief(brief_id, org_id) on delete cascade,
  constraint brief_lines_brief_line_unique unique (brief_id, line_type, line_index),
  constraint brief_lines_line_type_check
    check (line_type in ('product', 'component', 'summary')),
  constraint brief_lines_line_index_positive_check
    check (line_index >= 0),
  constraint brief_lines_volume_positive_check
    check (volume is null or volume > 0),
  constraint brief_lines_slice_count_nonnegative_check
    check (slice_count is null or slice_count >= 0),
  constraint brief_lines_weights_nonnegative_check
    check (weights is null or weights >= 0),
  constraint brief_lines_pct_range_check
    check (pct is null or (pct >= 0 and pct <= 100)),
  constraint brief_lines_packs_per_case_positive_check
    check (packs_per_case is null or packs_per_case > 0)
);

create index if not exists brief_lines_org_brief_idx
  on public.brief_lines (org_id, brief_id);
create index if not exists brief_lines_brief_order_idx
  on public.brief_lines (brief_id, line_index);

alter table public.brief_lines enable row level security;
alter table public.brief_lines force row level security;

drop policy if exists brief_lines_org_context on public.brief_lines;
create policy brief_lines_org_context
  on public.brief_lines
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.brief_lines from public;
revoke all on public.brief_lines from app_user;
grant select, insert, update, delete on public.brief_lines to app_user;

comment on table public.brief_lines
  is 'T-030 NPD brief lines. Unknown Section B packaging fields are stored only in packaging_ext JSONB until rescan.';
