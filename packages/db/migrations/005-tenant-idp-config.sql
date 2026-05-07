-- Migration 005: tenant_idp_config table per PRD §8.x with F-U5 default seed values
-- Scope: control-plane only (tenant-scoped; app_user has no access per 002-rls-baseline pattern)
-- Trigger: AFTER INSERT on tenants auto-seeds one default row per F-U5 / PRD §13

create table if not exists public.tenant_idp_config (
  tenant_id            uuid         not null primary key references public.tenants(id) on delete cascade,
  provider_type        varchar      not null default 'password',
  idle_timeout_min     int          not null default 60,
  session_max_h        int          not null default 8,
  mfa_required         boolean      not null default true,
  mfa_required_for_roles text[]     not null default array['org.access.admin', 'org.schema.admin'],
  mfa_allowed_methods  text[]       not null default array['totp'],
  password_complexity  varchar      not null default 'strong',
  constraint tenant_idp_config_provider_type_check
    check (provider_type in ('saml', 'oidc', 'password', 'magic'))
);

-- Seed function: inserts F-U5 default row for each new tenant
create or replace function public.seed_tenant_idp_config()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.tenant_idp_config (
    tenant_id,
    provider_type,
    idle_timeout_min,
    session_max_h,
    mfa_required,
    mfa_required_for_roles,
    mfa_allowed_methods,
    password_complexity
  ) values (
    new.id,
    'password',
    60,
    8,
    true,
    array['org.access.admin', 'org.schema.admin'],
    array['totp'],
    'strong'
  )
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

-- AFTER INSERT trigger on tenants
drop trigger if exists tenants_seed_idp_config on public.tenants;
create trigger tenants_seed_idp_config
  after insert on public.tenants
  for each row
  execute function public.seed_tenant_idp_config();

-- RLS: tenant_idp_config is control-plane-only; revoke app_user access (mirrors tenants pattern from 002)
revoke all on public.tenant_idp_config from app_user;
