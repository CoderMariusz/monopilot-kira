-- Migration 389: NPD v2 slice S3 — dynamic WIP process model (owner decision D6).
--
-- Replaces the fixed 4 prod_detail process slots (manufacturing_operation_1..4) with an unlimited,
-- dynamic per-component process list. Each process carries a duration + an additional cost and an
-- optional WIP item; each process has one or more assigned labor ROLES with a headcount. Process
-- cost = Σ(role rate_per_hour × headcount × duration_hours) + additional_cost (computed in slice S4
-- via the existing labor_rates table — mig 311 — keyed by role_group; D6's "role" is a labor role,
-- NOT an RBAC role, so no new rate table is created here).
--
-- ADDITIVE ONLY: prod_detail.manufacturing_operation_1..4 are KEPT — the fa_allergen_cascade view
-- (mig 359) + app.queue_allergen_cascade_rebuild (mig 139) + the BOM backfill/release functions
-- still read them. They are rewritten to read npd_wip_processes in slice S5, and only then can the
-- 4 columns be dropped. Idempotent. Wave0 lock: org_id + RLS via app.current_org_id().

create table if not exists public.npd_wip_processes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  prod_detail_id uuid not null references public.prod_detail(id) on delete cascade,
  process_name text not null,
  display_order int not null default 0,
  duration_hours numeric(10,4) not null default 0,
  additional_cost numeric(14,4) not null default 0,
  creates_wip_item bool not null default false,
  wip_item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  constraint npd_wip_processes_duration_nonneg check (duration_hours >= 0),
  constraint npd_wip_processes_addcost_nonneg check (additional_cost >= 0)
);

create table if not exists public.npd_wip_process_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  process_id uuid not null references public.npd_wip_processes(id) on delete cascade,
  role_group text not null,
  headcount int not null default 1,
  -- Snapshot of the labor_rates.rate_per_hour at save time (reproducible costing: a later rate
  -- change does not silently alter saved NPD costs). NULL ⇒ fall back to a live labor_rates lookup.
  rate_per_hour numeric(18,4),
  created_at timestamptz not null default now(),
  unique (org_id, process_id, role_group),
  constraint npd_wip_process_roles_headcount_pos check (headcount > 0),
  constraint npd_wip_process_roles_rate_nonneg check (rate_per_hour is null or rate_per_hour >= 0)
);

-- Composite FK so a process role can never point at a process in another org (mirrors mig 333).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_wip_process_roles_process_org_fkey'
       and conrelid = 'public.npd_wip_process_roles'::regclass
  ) then
    alter table public.npd_wip_process_roles
      add constraint npd_wip_process_roles_process_org_fkey
      foreign key (process_id, org_id) references public.npd_wip_processes (id, org_id) on delete cascade;
  end if;
end $$;

create index if not exists npd_wip_processes_org_detail_order_idx
  on public.npd_wip_processes (org_id, prod_detail_id, display_order);

create index if not exists npd_wip_process_roles_org_process_idx
  on public.npd_wip_process_roles (org_id, process_id);

alter table public.npd_wip_processes enable row level security;
alter table public.npd_wip_processes force row level security;
drop policy if exists npd_wip_processes_org_context on public.npd_wip_processes;
create policy npd_wip_processes_org_context
  on public.npd_wip_processes
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.npd_wip_process_roles enable row level security;
alter table public.npd_wip_process_roles force row level security;
drop policy if exists npd_wip_process_roles_org_context on public.npd_wip_process_roles;
create policy npd_wip_process_roles_org_context
  on public.npd_wip_process_roles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_wip_processes from public;
revoke all on public.npd_wip_processes from app_user;
grant select, insert, update, delete on public.npd_wip_processes to app_user;

revoke all on public.npd_wip_process_roles from public;
revoke all on public.npd_wip_process_roles from app_user;
grant select, insert, update, delete on public.npd_wip_process_roles to app_user;

-- Backfill: one process row per non-empty manufacturing_operation_N slot on each prod_detail row.
-- duration_hours / additional_cost default 0 (the legacy 4-slot data had no time/cost). Idempotent
-- via the not-exists guard on (prod_detail_id, display_order).
insert into public.npd_wip_processes (org_id, prod_detail_id, process_name, display_order)
select pd.org_id, pd.id, op.process_name, op.ord
  from public.prod_detail pd
  cross join lateral (values
    (pd.manufacturing_operation_1, 0),
    (pd.manufacturing_operation_2, 1),
    (pd.manufacturing_operation_3, 2),
    (pd.manufacturing_operation_4, 3)
  ) op(process_name, ord)
 where op.process_name is not null
   and trim(op.process_name) <> ''
   and not exists (
     select 1 from public.npd_wip_processes w
      where w.prod_detail_id = pd.id
        and w.org_id = pd.org_id
        and w.display_order = op.ord
   );
