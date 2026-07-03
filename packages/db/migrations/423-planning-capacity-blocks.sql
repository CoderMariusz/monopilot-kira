-- Migration 423: 04-Planning — line capacity blocks for non-WO reservations.
-- Wave F6 M3: NPD trial books capacity-reducing line time without creating a WO.
-- Planning-owned store; org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.planning_capacity_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  line_id uuid not null references public.production_lines(id) on delete cascade,
  project_id uuid references public.npd_projects(id) on delete cascade,
  trial_id uuid references public.trial_batches(id) on delete cascade,
  label text,
  block_date date not null,
  start_time time not null,
  end_time time not null,
  block_type text not null default 'npd_trial',
  created_by uuid references public.users(id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint planning_capacity_blocks_time_order_check check (end_time > start_time),
  constraint planning_capacity_blocks_block_type_check check (block_type in ('npd_trial')),
  constraint planning_capacity_blocks_org_trial_unique unique (org_id, trial_id)
);

create index if not exists idx_planning_capacity_blocks_org_line_date
  on public.planning_capacity_blocks (org_id, line_id, block_date);

create index if not exists idx_planning_capacity_blocks_project
  on public.planning_capacity_blocks (org_id, project_id)
  where project_id is not null;

create or replace function public.planning_capacity_blocks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists planning_capacity_blocks_set_updated_at on public.planning_capacity_blocks;
create trigger planning_capacity_blocks_set_updated_at
  before update on public.planning_capacity_blocks
  for each row execute function public.planning_capacity_blocks_set_updated_at();

alter table public.planning_capacity_blocks enable row level security;
alter table public.planning_capacity_blocks force row level security;

drop policy if exists planning_capacity_blocks_org_context on public.planning_capacity_blocks;
create policy planning_capacity_blocks_org_context
  on public.planning_capacity_blocks
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.planning_capacity_blocks from public;
revoke all on public.planning_capacity_blocks from app_user;
grant select, insert, update, delete on public.planning_capacity_blocks to app_user;

comment on table public.planning_capacity_blocks
  is 'Planning-owned non-WO line capacity reservations. NPD trial rows upsert by (org_id, trial_id); org_id isolated by app.current_org_id().';
