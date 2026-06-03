-- Migration 072: 02-settings W7 — integration_settings (provider/integration config per org).
-- PRD: docs/prd/02-SETTINGS-PRD.md (Integrations / Email provider config).
-- Wave0: org_id business scope (NOT tenant_id). RLS via app.current_org_id().
--
-- Closes the gap behind apps/web/actions/email/load-email-config.ts:~153 which guards with
--   to_regclass('public.integration_settings') and fails closed when the table is absent.
-- One row per (org_id, category) holds the active provider + its config blob (e.g. email → Resend/Postmark/SES).
-- Structure mirrors the proven 064-unit-of-measure.sql template (forced RLS, app_user grants, inline updated_at trigger).

-- ============================================================
-- 1. integration_settings
-- ============================================================
create table if not exists public.integration_settings (
  id          uuid        primary key default gen_random_uuid(),
  org_id      uuid        not null references public.organizations(id) on delete cascade,
  category    text        not null,
  provider    text,
  config      jsonb       not null default '{}'::jsonb,
  is_active   boolean     not null default false,
  created_at  timestamptz not null default pg_catalog.now(),
  updated_at  timestamptz not null default pg_catalog.now(),
  constraint integration_settings_org_category_unique unique (org_id, category)
);

create index if not exists integration_settings_org_idx
  on public.integration_settings (org_id);
create index if not exists integration_settings_org_category_idx
  on public.integration_settings (org_id, category);

alter table public.integration_settings enable row level security;
alter table public.integration_settings force row level security;
drop policy if exists integration_settings_org_context on public.integration_settings;
create policy integration_settings_org_context
  on public.integration_settings
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());
revoke all on public.integration_settings from public;
grant select, insert, update, delete on public.integration_settings to app_user;

comment on table public.integration_settings
  is 'W7/T-090: per-org integration provider config (email/etc). One active row per (org, category).';

-- ============================================================
-- 2. updated_at trigger (inline; no shared app.set_updated_at() in this project — pattern from migration 064)
-- ============================================================
create or replace function public.integration_settings_set_updated_at()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin new.updated_at := pg_catalog.now(); return new; end; $$;

drop trigger if exists integration_settings_set_updated_at on public.integration_settings;
create trigger integration_settings_set_updated_at
  before update on public.integration_settings
  for each row execute function public.integration_settings_set_updated_at();
