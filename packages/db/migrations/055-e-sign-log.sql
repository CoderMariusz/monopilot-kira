-- 055 — T-124 CFR 21 Part 11 e-signature log
--
-- Append-only org-scoped signature receipts. Each row is paired with a
-- public.audit_events row by @monopilot/e-sign in the same app_user transaction.

CREATE TABLE IF NOT EXISTS public.e_sign_log (
  signature_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  signer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  intent         TEXT NOT NULL,
  subject_hash   TEXT NOT NULL,
  nonce          TEXT NOT NULL,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (signer_user_id, subject_hash, intent, nonce)
);

CREATE INDEX IF NOT EXISTS e_sign_log_org_created_idx
  ON public.e_sign_log (org_id, created_at);

CREATE INDEX IF NOT EXISTS e_sign_log_subject_idx
  ON public.e_sign_log (org_id, subject_hash, intent);

ALTER TABLE public.e_sign_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.e_sign_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS e_sign_log_org_context ON public.e_sign_log;
CREATE POLICY e_sign_log_org_context
  ON public.e_sign_log
  FOR ALL
  TO app_user
  USING (org_id = app.current_org_id())
  WITH CHECK (org_id = app.current_org_id());

REVOKE ALL ON public.e_sign_log FROM PUBLIC;
GRANT SELECT, INSERT ON public.e_sign_log TO app_user;
REVOKE UPDATE, DELETE ON public.e_sign_log FROM app_user;
