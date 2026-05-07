-- T-062 hardening: enable RLS on tenant_idp_config + revoke broad app_user SELECT.
-- Migration 027: lock down tenant_idp_config so secrets (x509_cert, scim_token_hash,
-- entity_id, metadata_url, …) cannot be read directly by the app role. Replaces
-- the broad `grant select` from 025-tenant-idp-config-app-grant.sql with a
-- narrow SECURITY DEFINER reader that exposes only the safe policy fields the
-- app actually needs at request time.
--
-- BEFORE: 025-tenant-idp-config-app-grant.sql granted SELECT to app_user with
--         no RLS (the table was keyed by tenant_id and "scoped by callers").
--         Effect: any app_user could
--           `select x509_cert, scim_token_hash from public.tenant_idp_config`
--         and exfiltrate IdP signing certificates and SCIM token hashes.
--
-- AFTER:  RLS enabled + force; broad SELECT revoked from app_user; app reads
--         go through `app.get_my_tenant_idp_config(p_tenant_id uuid)` which
--         returns ONLY the policy fields needed for SAML enforcement
--         (provider_type, enforce_for_non_admins, jit_provisioning,
--          mfa_required, mfa_required_for_roles, mfa_allowed_methods).
--         Secrets stay control-plane-only.
--
-- Mutation proof:
--   * As app_user before: `SELECT x509_cert FROM public.tenant_idp_config`
--     → returns rows.
--   * As app_user after:  same query → permission denied (no SELECT grant).
--   * `SELECT app.get_my_tenant_idp_config('<tenant>')` returns only the
--     allow-listed policy columns; calling it with a tenant the caller has
--     no current org context for returns NULL (no row).
--
-- Reversibility: dropping the function and re-granting SELECT restores the
-- previous (insecure) state. Documented for completeness; do NOT run in prod.

-- 1. Lock the table down: enable + force RLS, revoke broad SELECT grant.
alter table public.tenant_idp_config enable row level security;
alter table public.tenant_idp_config force row level security;
revoke select on public.tenant_idp_config from app_user;

-- 2. Narrow reader function — returns ONLY the safe policy fields that
--    enforceSamlPolicy / SAML route handlers need. Secrets are intentionally
--    excluded (no x509_cert, no scim_token_hash, no metadata_url, no entity_id).
--
--    SECURITY DEFINER: runs with the migration owner's privileges (which has
--    full SELECT on tenant_idp_config) so it can bypass the table-level
--    revoke for the explicitly-allow-listed columns.
--    SET search_path = pg_catalog hardens against search-path injection.
create or replace function app.get_my_tenant_idp_config(p_tenant_id uuid)
returns table (
  tenant_id              uuid,
  provider_type          varchar,
  enforce_for_non_admins boolean,
  jit_provisioning       boolean,
  mfa_required           boolean,
  mfa_required_for_roles text[],
  mfa_allowed_methods    text[],
  password_complexity    varchar,
  idle_timeout_min       int,
  session_max_h          int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  -- Only return rows whose tenant_id matches BOTH the caller-supplied tenant
  -- AND an organization the current session has been bound to. This prevents
  -- a session bound to org A from reading org B's IdP policy.
  return query
    select
      t.tenant_id,
      t.provider_type,
      t.enforce_for_non_admins,
      t.jit_provisioning,
      t.mfa_required,
      t.mfa_required_for_roles,
      t.mfa_allowed_methods,
      t.password_complexity,
      t.idle_timeout_min,
      t.session_max_h
    from public.tenant_idp_config t
    where t.tenant_id = p_tenant_id
      and exists (
        select 1
        from public.organizations o
        where o.tenant_id = t.tenant_id
          and o.id = app.current_org_id()
      );
end;
$$;

-- 3. Lock down the function and grant execute to app_user only.
revoke all on function app.get_my_tenant_idp_config(uuid) from public;
grant execute on function app.get_my_tenant_idp_config(uuid) to app_user;

-- 4. We deliberately do NOT add a SELECT policy to the table itself —
--    callers must use the function. Anyone trying the old direct path will
--    get 0 rows back (RLS denies, since no policy is defined for app_user).
