-- Migration 025: GRANT SELECT on tenant_idp_config to app_user
-- T-012 — SAML SP needs to read enforce_for_non_admins and other policy fields
-- at request time when enforcing the SAML password-block policy. The original
-- 005-tenant-idp-config.sql `revoke all` from app_user is too restrictive for
-- runtime policy reads; it was designed for control-plane writes (provider_type,
-- x509_cert, etc.), but read access for policy enforcement is required.
--
-- Scope: SELECT only — INSERT/UPDATE/DELETE remain control-plane (revoked).
-- This mirrors the read-only operational pattern used by other policy tables
-- (e.g. org_security_policies has SELECT under RLS).
--
-- Note: tenant_idp_config has no RLS enabled — it is keyed by tenant_id and
-- there is one row per tenant. App-tier code must scope reads by the
-- session's tenant_id, which is enforced by callers (T-012 enforceSamlPolicy
-- always passes tenantId from the authenticated JWT/cookie).

grant select on public.tenant_idp_config to app_user;
