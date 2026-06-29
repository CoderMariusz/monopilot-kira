-- Migration 390: NPD v2 slice S5a — per-process cost/role DEFAULTS configured in Settings (D9).
--
-- Owner decision D9: a process is "set up in Settings" with its default role(s) + headcount + a
-- standard cost (+ duration). In the NPD Production tab you SELECT a process from the master list
-- (`Reference."ManufacturingOperations"` — operation_name, which is ALSO the allergen-cascade join
-- key) and it pre-fills these defaults into the per-component instance rows (npd_wip_processes /
-- npd_wip_process_roles, mig 389), editable per use. Role RATES come from the existing
-- `labor_rates` table (mig 311, /settings/labor-rates) — NOT duplicated here.
--
-- This adds the DEFAULTS layer keyed to ManufacturingOperations. ADDITIVE, org-RLS, idempotent.

create table if not exists public.npd_process_defaults (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  operation_id uuid not null references "Reference"."ManufacturingOperations"(id) on delete cascade,
  standard_cost numeric(14,4) not null default 0,
  default_duration_hours numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, operation_id),
  unique (id, org_id),
  constraint npd_process_defaults_cost_nonneg check (standard_cost >= 0),
  constraint npd_process_defaults_duration_nonneg check (default_duration_hours >= 0)
);

create table if not exists public.npd_process_default_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  process_default_id uuid not null references public.npd_process_defaults(id) on delete cascade,
  role_group text not null,
  default_headcount int not null default 1,
  created_at timestamptz not null default now(),
  unique (org_id, process_default_id, role_group),
  constraint npd_process_default_roles_headcount_pos check (default_headcount > 0)
);

-- Composite FK so a default-role can never point at a process-default in another org (mirrors mig 333/389).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'npd_process_default_roles_parent_org_fkey'
       and conrelid = 'public.npd_process_default_roles'::regclass
  ) then
    alter table public.npd_process_default_roles
      add constraint npd_process_default_roles_parent_org_fkey
      foreign key (process_default_id, org_id) references public.npd_process_defaults (id, org_id) on delete cascade;
  end if;
end $$;

create index if not exists npd_process_defaults_org_operation_idx
  on public.npd_process_defaults (org_id, operation_id);
create index if not exists npd_process_default_roles_org_parent_idx
  on public.npd_process_default_roles (org_id, process_default_id);

alter table public.npd_process_defaults enable row level security;
alter table public.npd_process_defaults force row level security;
drop policy if exists npd_process_defaults_org_context on public.npd_process_defaults;
create policy npd_process_defaults_org_context
  on public.npd_process_defaults
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

alter table public.npd_process_default_roles enable row level security;
alter table public.npd_process_default_roles force row level security;
drop policy if exists npd_process_default_roles_org_context on public.npd_process_default_roles;
create policy npd_process_default_roles_org_context
  on public.npd_process_default_roles
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.npd_process_defaults from public;
revoke all on public.npd_process_defaults from app_user;
grant select, insert, update, delete on public.npd_process_defaults to app_user;

revoke all on public.npd_process_default_roles from public;
revoke all on public.npd_process_default_roles from app_user;
grant select, insert, update, delete on public.npd_process_default_roles to app_user;
