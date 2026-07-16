-- 509 — SECURITY DEFINER writer for tenant_idp_config policy fields (C003)
--
-- Settings → Security reads MFA/session/SSO policy through app.get_my_tenant_idp_config
-- (migration 027). app_user cannot UPDATE tenant_idp_config directly (broad SELECT was
-- revoked in 027). upsertSecurityPolicy must persist editable policy fields through
-- this narrow writer, mirroring the reader's org-context guard.

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

  update public.tenant_idp_config t
     set mfa_required = p_mfa_required,
         mfa_required_for_roles = coalesce(p_mfa_required_for_roles, '{}'::text[]),
         mfa_allowed_methods = coalesce(p_mfa_allowed_methods, array['totp']::text[]),
         enforce_for_non_admins = coalesce(p_enforce_for_non_admins, t.enforce_for_non_admins),
         updated_at = pg_catalog.now()
   where t.tenant_id = v_tenant_id;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) from public;
grant execute on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) to app_user;

comment on function app.upsert_my_tenant_idp_policy(boolean, text[], text[], boolean) is
  'C003: persist org-scoped IdP policy fields (MFA + optional SSO enforcement) for the current org tenant. Secrets remain control-plane-only.';
