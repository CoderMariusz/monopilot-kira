-- 510 — tenant_idp_config upsert writer + legacy backfill (PF-R01-02 / C003 regression)
--
-- Migration 509's app.upsert_my_tenant_idp_policy only UPDATEd an existing row and
-- returned false when tenant_idp_config was missing (legacy tenants). Security settings
-- save then surfaced persistence_failed. Backfill missing rows and make the writer
-- INSERT … ON CONFLICT so saves succeed for every org with a tenant_id.

insert into public.tenant_idp_config (
  tenant_id,
  provider_type,
  idle_timeout_min,
  session_max_h,
  mfa_required,
  mfa_required_for_roles,
  mfa_allowed_methods,
  password_complexity
)
select t.id,
       'password',
       60,
       8,
       true,
       array['org.access.admin', 'org.schema.admin']::text[],
       array['totp']::text[],
       'strong'
  from public.tenants t
  left join public.tenant_idp_config c on c.tenant_id = t.id
 where c.tenant_id is null
on conflict (tenant_id) do nothing;

create or replace function app.upsert_my_tenant_idp_policy(
  p_mfa_required boolean,
  p_mfa_required_for_roles text[],
  p_mfa_allowed_methods text[],
  p_enforce_for_non_admins boolean default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_tenant_id uuid;
begin
  select o.tenant_id
    into v_tenant_id
    from public.organizations o
   where o.id = app.current_org_id();

  if v_tenant_id is null then
    return false;
  end if;

  insert into public.tenant_idp_config (
    tenant_id,
    provider_type,
    idle_timeout_min,
    session_max_h,
    mfa_required,
    mfa_required_for_roles,
    mfa_allowed_methods,
    password_complexity,
    enforce_for_non_admins
  ) values (
    v_tenant_id,
    'password',
    60,
    8,
    p_mfa_required,
    coalesce(p_mfa_required_for_roles, '{}'::text[]),
    coalesce(p_mfa_allowed_methods, array['totp']::text[]),
    'strong',
    coalesce(p_enforce_for_non_admins, false)
  )
  on conflict (tenant_id) do update
     set mfa_required = excluded.mfa_required,
         mfa_required_for_roles = excluded.mfa_required_for_roles,
         mfa_allowed_methods = excluded.mfa_allowed_methods,
         enforce_for_non_admins = coalesce(
           p_enforce_for_non_admins,
           public.tenant_idp_config.enforce_for_non_admins
         ),
         updated_at = pg_catalog.now();

  return true;
end;
$$;

revoke all on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) from public;
grant execute on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) to app_user;

comment on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) is
  'PF-R01-02: persist org-scoped IdP policy fields (MFA + optional SSO enforcement) for the current org tenant; inserts missing legacy rows.';
