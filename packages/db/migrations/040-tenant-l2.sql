-- T-007 / ADR-031: tenant L2 variations and migration orchestration
-- PRD: docs/prd/02-SETTINGS-PRD.md §5.4, §9
-- Wave0: org_id is the business-scope column. L4 per-tenant DB schemas are deferred.

create table if not exists public.tenant_variations (
  org_id                  uuid primary key references public.organizations(id) on delete cascade,
  dept_overrides          jsonb not null default '{}'::jsonb,
  rule_variant_overrides  jsonb not null default '{}'::jsonb,
  feature_flags           jsonb not null default '{}'::jsonb,
  schema_extensions_count integer not null default 0,
  upgraded_at             timestamptz,
  upgraded_from_version   text,
  upgraded_to_version     text
);

-- Migration 013 created an earlier canary-orchestration table with the same
-- name. Preserve that shape under a legacy name when a full migration chain is
-- applied, then create the ADR-031 history table below.
do $$
declare
  target_schema text := current_schema();
  has_legacy_table boolean;
begin
  select to_regclass(format('%I.tenant_migrations', target_schema)) is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = target_schema
        and table_name = 'tenant_migrations'
        and column_name = 'id'
    )
  into has_legacy_table;

  if has_legacy_table then
    execute format(
      'alter table %I.tenant_migrations rename to tenant_migrations_legacy_t038',
      target_schema
    );
  end if;
end $$;

create table if not exists public.tenant_migrations (
  id               uuid constraint tenant_migrations_l2_pkey primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id),
  component        text not null,
  current_version  text not null,
  target_version   text not null,
  status           text not null default 'scheduled',
  canary_pct       numeric(7, 4) not null default 0,
  last_run_at      timestamptz,
  scheduled_by     uuid references public.users(id),
  created_at       timestamptz not null default now(),
  constraint tenant_migrations_l2_status_check
    check (status in ('scheduled', 'canary', 'progressive', 'completed', 'rolled_back', 'force_scheduled'))
);

create index if not exists tenant_migrations_l2_org_status_idx
  on public.tenant_migrations (org_id, status);

create index if not exists tenant_migrations_l2_org_component_idx
  on public.tenant_migrations (org_id, component);
