-- Migration 016: ALTER tenant_idp_config — add 11 missing F-A2 columns
-- Scope: additive ALTER TABLE only; do NOT modify 005-tenant-idp-config.sql
-- PRD refs: §8.x (Multi-tenant F-A2 columns), §13 (F-U5 password lifecycle)
-- Blocker: Wave-B (T-011/T-012/T-013 depend on these columns)

-- SAML columns
alter table public.tenant_idp_config
  add column if not exists metadata_url    text,
  add column if not exists entity_id       text,
  add column if not exists x509_cert       text,
  add column if not exists provider_label  text;

-- SCIM columns
alter table public.tenant_idp_config
  add column if not exists scim_token_hash      text,
  add column if not exists scim_token_last_four text;

-- JIT provisioning column
alter table public.tenant_idp_config
  add column if not exists jit_provisioning boolean not null default false;

-- Enforcement column
alter table public.tenant_idp_config
  add column if not exists enforce_for_non_admins boolean not null default false;

-- Password lifecycle columns
alter table public.tenant_idp_config
  add column if not exists password_expiry_days integer not null default 0;

-- Timestamp columns (idempotent — skipped if already present)
alter table public.tenant_idp_config
  add column if not exists created_at timestamptz not null default now();

alter table public.tenant_idp_config
  add column if not exists updated_at timestamptz not null default now();

-- updated_at trigger function (SECURITY DEFINER, restricted search_path)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

-- BEFORE UPDATE trigger on tenant_idp_config
drop trigger if exists tenant_idp_config_touch_updated_at on public.tenant_idp_config;
create trigger tenant_idp_config_touch_updated_at
  before update on public.tenant_idp_config
  for each row
  execute function public.touch_updated_at();
