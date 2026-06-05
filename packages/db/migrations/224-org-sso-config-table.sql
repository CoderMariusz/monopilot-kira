-- S-01: org_sso_config backing table for apps/web/actions/sso/*.
-- Column set mirrors upsert-config.ts, test-connection.ts, and disable.ts.
-- Wave0 lock: org_id business scope (NOT tenant_id); RLS via app.current_org_id().

create table if not exists public.org_sso_config (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  idp_type text not null,
  display_name text not null,
  metadata_url text not null default '',
  entity_id text not null default '',
  acs_url text not null,
  x509_cert text not null default '',
  oidc_issuer_url text not null default '',
  oidc_client_id text not null default '',
  oidc_client_secret_vault_key text not null default '',
  enforce_for_non_admins boolean not null default false,
  jit_provisioning boolean not null default true,
  default_role_code text not null,
  enabled boolean not null default false,
  last_test_status text not null default 'never',
  last_test_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  certificate jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint org_sso_config_idp_type_check
    check (idp_type in ('saml_entra', 'saml_generic', 'oidc')),
  constraint org_sso_config_last_test_status_check
    check (last_test_status in ('ok', 'failed', 'never')),
  constraint org_sso_config_display_name_nonblank_check
    check (length(btrim(display_name)) > 0),
  constraint org_sso_config_acs_url_nonblank_check
    check (length(btrim(acs_url)) > 0),
  constraint org_sso_config_default_role_code_nonblank_check
    check (length(btrim(default_role_code)) > 0)
);

create index if not exists org_sso_config_enabled_idx
  on public.org_sso_config (org_id, enabled);

alter table public.org_sso_config enable row level security;
alter table public.org_sso_config force row level security;

drop policy if exists org_sso_config_org_context on public.org_sso_config;
create policy org_sso_config_org_context
  on public.org_sso_config
  for all
  to app_user
  using (org_id = app.current_org_id())
  with check (org_id = app.current_org_id());

revoke all on public.org_sso_config from public;
revoke all on public.org_sso_config from app_user;
grant select, insert, update, delete on public.org_sso_config to app_user;

create or replace function public.org_sso_config_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.org_sso_config_set_updated_at() from public;

drop trigger if exists org_sso_config_set_updated_at on public.org_sso_config;
create trigger org_sso_config_set_updated_at
  before update on public.org_sso_config
  for each row
  execute function public.org_sso_config_set_updated_at();

comment on table public.org_sso_config is
  'S-01: one SSO configuration row per org; matches apps/web/actions/sso upsert ON CONFLICT (org_id).';
comment on column public.org_sso_config.metadata is
  'Reserved provider metadata JSON; action code currently persists metadata_url and Jackson-managed metadata outside this table.';
comment on column public.org_sso_config.certificate is
  'Reserved certificate metadata JSON; action code currently persists x509_cert text.';
