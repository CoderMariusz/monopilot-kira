-- Migration 035 — Slot F-4: defence-in-depth column-level revokes on
--                            public.tenant_idp_config.
--
-- Background:
--   Migration 027 already revokes the broad SELECT grant on
--   public.tenant_idp_config from app_user and forces RLS, so as of today
--   app_user cannot read this table at all. Migration 035 adds explicit,
--   column-scoped REVOKE statements as a defence-in-depth lock so that any
--   future migration which (intentionally or accidentally) re-grants
--   table-level SELECT to app_user does NOT also re-expose the secret
--   columns. The column revokes survive a subsequent table-level GRANT
--   SELECT — the most-specific privilege wins on a per-column basis.
--
-- Column scope (sensitive — must NEVER be readable by the RLS app role):
--   * metadata_url       — IdP metadata endpoint (probable IdP fingerprint)
--   * entity_id          — IdP entity identifier
--   * x509_cert          — IdP signing certificate
--   * scim_token_hash    — bcrypt hash of the SCIM bearer token
--   The prompt called out `metadata_xml / private_key / certificate`; those
--   columns do not exist on this table — the live equivalents that hold
--   IdP secret material are listed above. We revoke them all here.
--
-- This migration is idempotent. REVOKE on a privilege that isn't granted
-- is a no-op in Postgres, so re-running this migration on a fresh DB is
-- safe.

-- Belt-and-suspenders: revoke any column-level SELECT that may have been
-- granted to app_user on the secret columns. (Today the table-level grant
-- has been revoked entirely — this is forward-looking insurance.)
REVOKE SELECT (metadata_url, entity_id, x509_cert, scim_token_hash)
  ON public.tenant_idp_config
  FROM app_user;

-- Defensive: also strip these columns from PUBLIC.
REVOKE SELECT (metadata_url, entity_id, x509_cert, scim_token_hash)
  ON public.tenant_idp_config
  FROM PUBLIC;
