-- Migration 177: 04-Planning-Basic — schedule_outputs + wo_dependencies + wo_status_history.
-- PRD: docs/prd/04-PLANNING-BASIC-PRD.md §5.8, §5.9, §5.11.
-- Task: _meta/atomic-tasks/04-planning-basic/tasks/T-005.json.
--
-- Wave0 lock: org_id is the business scope (NOT tenant_id); RLS via app.current_org_id().
-- site_id day-1: site_id uuid nullable, no FK, no registry (per-site backfill lands later).
-- NUMERIC-exact: expected_qty / required_qty NUMERIC(12,3); allocation_pct NUMERIC(5,2).
--
-- CANONICAL OWNERSHIP (2026-05-14 user decision — see
--   _meta/audits/2026-05-14-fixer-F5-wo-outputs-and-quality-gate.md):
--   04-Planning owns `schedule_outputs` — the planning-time projection of expected WO
--   outputs (primary / co_product / byproduct). It does NOT create `wo_outputs`; that
--   canonical runtime table is owned by 08-production T-003 and is materialized from
--   schedule_outputs on the wo.start event. THIS MIGRATION CREATES NO wo_outputs TABLE.
--
-- Cycle prevention for wo_dependencies is SERVICE-LAYER (DFS / topological sort,
--   V-PLAN-WO-CYCLE, T-020). The DB only enforces UNIQUE(org_id, parent_wo_id, child_wo_id)
--   — a DB-level acyclicity check would be performance-prohibitive on insert (T-005 red line).

-- ---------------------------------------------------------------------------
-- schedule_outputs — planning projection (one row per primary/co/byproduct output).
-- ---------------------------------------------------------------------------
create table if not exists public.schedule_outputs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  site_id          uuid,

  planned_wo_id    uuid not null references public.work_orders(id) on delete cascade,
  product_id       uuid not null, -- soft FK to 03-Technical public.items; service-layer-validated

  output_role      text not null,
  expected_qty     numeric(12, 3) not null,
  uom              text not null,
  allocation_pct   numeric(5, 2) not null,
  disposition      text not null default 'to_stock',
  downstream_wo_id uuid references public.work_orders(id) on delete set null,
  notes            text,

  created_at       timestamptz not null default pg_catalog.now(),
  updated_at       timestamptz not null default pg_catalog.now(),

  constraint schedule_outputs_output_role_check check (
    output_role in ('primary', 'co_product', 'byproduct')
  ),
  constraint schedule_outputs_disposition_check check (
    disposition in ('to_stock', 'direct_continue', 'pending_decision')
  ),
  constraint schedule_outputs_expected_qty_nonneg_check check (expected_qty >= 0),
  constraint schedule_outputs_allocation_pct_range_check check (
    allocation_pct >= 0 and allocation_pct <= 100
  )
);

-- Partial-unique: at most one primary output per WO.
create unique index if not exists schedule_outputs_one_primary_per_wo
  on public.schedule_outputs (org_id, planned_wo_id)
  where output_role = 'primary';

create index if not exists idx_schedule_outputs_planned_wo
  on public.schedule_outputs (planned_wo_id);
create index if not exists idx_schedule_outputs_org_planned_wo
  on public.schedule_outputs (org_id, planned_wo_id);
create index if not exists idx_schedule_outputs_downstream
  on public.schedule_outputs (downstream_wo_id)
  where downstream_wo_id is not null;
create index if not exists idx_schedule_outputs_product
  on public.schedule_outputs (org_id, product_id);

alter table public.schedule_outputs enable row level security;
alter table public.schedule_outputs force row level security;

drop policy if exists schedule_outputs_org_context on public.schedule_outputs;
create policy schedule_outputs_org_context
  on public.schedule_outputs
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.schedule_outputs from public;
revoke all on public.schedule_outputs from app_user;
grant select, insert, update, delete on public.schedule_outputs to app_user;

create or replace function public.schedule_outputs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists schedule_outputs_set_updated_at on public.schedule_outputs;
create trigger schedule_outputs_set_updated_at
  before update on public.schedule_outputs
  for each row execute function public.schedule_outputs_set_updated_at();

-- ---------------------------------------------------------------------------
-- wo_dependencies — DAG edges (predecessor/successor). Acyclicity enforced in service
-- layer (V-PLAN-WO-CYCLE). DB enforces only the UNIQUE edge constraint.
-- ---------------------------------------------------------------------------
create table if not exists public.wo_dependencies (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  site_id       uuid,

  parent_wo_id  uuid not null references public.work_orders(id) on delete cascade,
  child_wo_id   uuid not null references public.work_orders(id) on delete cascade,
  material_link uuid references public.wo_materials(id) on delete set null,
  required_qty  numeric(12, 3),

  created_at    timestamptz not null default pg_catalog.now(),

  constraint wo_dependencies_org_parent_child_unique unique (org_id, parent_wo_id, child_wo_id),
  constraint wo_dependencies_no_self_loop_check check (parent_wo_id <> child_wo_id),
  constraint wo_dependencies_required_qty_nonneg_check check (
    required_qty is null or required_qty >= 0
  )
);

create index if not exists idx_wo_dependencies_org_parent
  on public.wo_dependencies (org_id, parent_wo_id);
create index if not exists idx_wo_dependencies_org_child
  on public.wo_dependencies (org_id, child_wo_id);
create index if not exists idx_wo_dependencies_parent
  on public.wo_dependencies (parent_wo_id);
create index if not exists idx_wo_dependencies_child
  on public.wo_dependencies (child_wo_id);
create index if not exists idx_wo_dependencies_material_link
  on public.wo_dependencies (material_link)
  where material_link is not null;

alter table public.wo_dependencies enable row level security;
alter table public.wo_dependencies force row level security;

drop policy if exists wo_dependencies_org_context on public.wo_dependencies;
create policy wo_dependencies_org_context
  on public.wo_dependencies
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_dependencies from public;
revoke all on public.wo_dependencies from app_user;
grant select, insert, update, delete on public.wo_dependencies to app_user;

-- ---------------------------------------------------------------------------
-- wo_status_history — permanent audit log. History rows are NEVER deleted on WO delete
-- (T-005 red line). wo_id therefore carries NO cascade FK — it is a soft reference kept
-- as a plain uuid so the history survives a work_orders row removal.
-- ---------------------------------------------------------------------------
create table if not exists public.wo_status_history (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  site_id         uuid,

  wo_id           uuid not null, -- soft ref to work_orders.id; intentionally NO FK so history survives WO delete
  from_status     varchar(30),
  to_status       varchar(30) not null,
  action          varchar(60) not null,
  user_id         uuid references public.users(id) on delete set null,
  override_reason text,
  context_jsonb   jsonb not null default '{}'::jsonb,

  occurred_at     timestamptz not null default pg_catalog.now(),
  created_at      timestamptz not null default pg_catalog.now()
);

create index if not exists idx_wo_status_history_org_wo
  on public.wo_status_history (org_id, wo_id, occurred_at);
create index if not exists idx_wo_status_history_wo
  on public.wo_status_history (wo_id);
create index if not exists idx_wo_status_history_user
  on public.wo_status_history (user_id)
  where user_id is not null;

alter table public.wo_status_history enable row level security;
alter table public.wo_status_history force row level security;

drop policy if exists wo_status_history_org_context on public.wo_status_history;
create policy wo_status_history_org_context
  on public.wo_status_history
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.wo_status_history from public;
revoke all on public.wo_status_history from app_user;
-- History is append-only from the app role: grant SELECT + INSERT, withhold UPDATE/DELETE
-- so permanence is enforced at the grant layer (mirrors audit_events, migration 004).
grant select, insert on public.wo_status_history to app_user;
