-- Migration 007: TOTP MFA enrolment tables (T-015)
-- Tables: mfa_secrets (libsodium secretbox encrypted TOTP secret)
--         recovery_codes (argon2id hashed one-time recovery codes)
-- Scope: T-015 — TOTP enrolment via otplib + argon2id recovery codes + WebAuthn stub

-- ============================================================
-- 1. mfa_secrets: one row per enrolled user
--    secret_encrypted = base64(nonce + libsodium.crypto_secretbox_easy(rawSecret, nonce, key))
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mfa_secrets (
  user_id          uuid        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  secret_encrypted text        NOT NULL,
  enrolled_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. recovery_codes: 10 codes per user, argon2id hashed, one-time use
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recovery_codes (
  id         bigserial   PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Enable + Force RLS on both tables
-- ============================================================
ALTER TABLE public.mfa_secrets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_secrets     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes  FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS policies: org-scoped via JOIN to users.org_id
-- ============================================================
DROP POLICY IF EXISTS mfa_secrets_org_context ON public.mfa_secrets;
CREATE POLICY mfa_secrets_org_context ON public.mfa_secrets
  USING (user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id()));

DROP POLICY IF EXISTS recovery_codes_org_context ON public.recovery_codes;
CREATE POLICY recovery_codes_org_context ON public.recovery_codes
  USING (user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id()));

-- ============================================================
-- 5. GRANTs
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.mfa_secrets    TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.recovery_codes TO app_user;
GRANT USAGE ON SEQUENCE public.recovery_codes_id_seq TO app_user;
