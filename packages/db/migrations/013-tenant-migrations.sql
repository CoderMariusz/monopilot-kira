-- T-038: tenant_migrations table (canary upgrade orchestration baseline)
-- Creates the tenant_migrations table recording per-tenant component versions,
-- cohort segmentation (canary/early/general), and migration run state.
-- Note: tenant_id is a UUID referencing an organization, but no FK constraint
-- is enforced here to keep the table lightweight and avoid cascade complexity
-- in the upgrade orchestrator (the application layer enforces referential integrity).

create table if not exists public.tenant_migrations (
  tenant_id         uuid    not null,
  component         text    not null,
  current_version   text    not null,
  target_version    text,
  cohort            text    not null default 'general',
  last_run_at       timestamptz,
  status            text    not null default 'idle',
  failure_reason    text,
  constraint tenant_migrations_pkey
    primary key (tenant_id, component),
  constraint tenant_migrations_cohort_check
    check (cohort in ('canary', 'early', 'general')),
  constraint tenant_migrations_status_check
    check (status in ('idle', 'pending', 'running', 'succeeded', 'failed', 'rolled_back'))
);

create index if not exists tenant_migrations_cohort_status_idx
  on public.tenant_migrations (cohort, status);
