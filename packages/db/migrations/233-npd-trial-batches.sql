-- Migration 233: 01-NPD TRIAL stage — trial_batches.
-- PRD: docs/prd/01-NPD-PRD.md (Trial stage); NPD-owned, project-scoped.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().
-- Supabase-applyable: no superuser ops; module-local updated_at trigger; text+CHECK enums.

create table if not exists public.trial_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.npd_projects(id) on delete cascade,
  trial_no text not null,
  trial_date date,
  batch_size_kg numeric(12, 4),
  yield_pct numeric(5, 2),
  technologist_user_id uuid references public.users(id),
  result text not null default 'pending',
  notes text,
  -- Audit (R13)
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  constraint trial_batches_result_check
    check (result in ('pass', 'fail', 'pending')),
  constraint trial_batches_org_project_trial_no_unique
    unique (org_id, project_id, trial_no),
  constraint trial_batches_batch_size_kg_nonneg
    check (batch_size_kg is null or batch_size_kg >= 0),
  constraint trial_batches_yield_pct_range
    check (yield_pct is null or (yield_pct >= 0 and yield_pct <= 100))
);

create index if not exists trial_batches_org_project_idx
  on public.trial_batches (org_id, project_id);

create or replace function public.npd_trial_batches_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists trial_batches_set_updated_at on public.trial_batches;
create trigger trial_batches_set_updated_at
  before update on public.trial_batches
  for each row execute function public.npd_trial_batches_set_updated_at();

alter table public.trial_batches enable row level security;
alter table public.trial_batches force row level security;

drop policy if exists trial_batches_org_context on public.trial_batches;
create policy trial_batches_org_context
  on public.trial_batches
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.trial_batches from public;
revoke all on public.trial_batches from app_user;
grant select, insert, update, delete on public.trial_batches to app_user;

comment on table public.trial_batches
  is 'NPD TRIAL stage batches per project. trial_no unique per (org_id, project_id); org_id isolated by app.current_org_id().';
