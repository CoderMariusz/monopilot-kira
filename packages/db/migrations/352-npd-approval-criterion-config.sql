-- Migration 352: per-org configurable NPD approval criteria (#4).
-- Today approval criteria C1..C7 are a hardcoded list in
-- packages/domain/src/approval/evaluate-criteria.ts — every criterion is always
-- required, so a small-production org is blocked by checks it doesn't need
-- (e.g. microbiological). This table lets an org mark a criterion not-required
-- and/or override its threshold. EMPTY by default: a missing row = required=true
-- (current behaviour preserved — the evaluator coalesces to required when no row),
-- so no seed is needed and nothing changes until the owner configures it.
create table if not exists public.npd_approval_criterion_config (
  org_id        uuid    not null references public.organizations(id) on delete cascade,
  criterion_key text    not null,
  required      boolean not null default true,
  threshold_json jsonb,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint npd_approval_criterion_config_pkey primary key (org_id, criterion_key),
  constraint npd_approval_criterion_config_key_check check (criterion_key ~ '^C[1-9][0-9]?$')
);

alter table public.npd_approval_criterion_config enable row level security;
drop policy if exists npd_approval_criterion_config_org on public.npd_approval_criterion_config;
create policy npd_approval_criterion_config_org on public.npd_approval_criterion_config
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

grant select, insert, update, delete on public.npd_approval_criterion_config to app_user;
