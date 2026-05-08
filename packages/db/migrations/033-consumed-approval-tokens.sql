-- Migration 033 — FT-011: approval-token jti replay protection.
--
-- Problem:
--   `grantRole` (packages/rbac/src/grant.ts) verifies an HMAC-SHA256 signed
--   approval token to authorise SoD-violating / dual-control role grants but
--   does NOT track which tokens have already been consumed. An attacker who
--   intercepts a valid token (within its 5-minute TTL) can replay it any
--   number of times to grant the same role to the same target — defeating
--   the whole point of single-use approval semantics.
--
-- Strategy:
--   Persist the token's `jti` (UUID, generated at token creation) the first
--   time `grantRole` consumes it. Every subsequent call sees the row and
--   short-circuits with `invalid_token`. The INSERT happens inside the same
--   transaction as the role grant so the atomicity guarantee holds: either
--   both jti row and user_roles row land, or neither does.
--
-- Cleanup:
--   Token TTL is 5 minutes; rows older than 7 days are vestigial. The actual
--   prune is the responsibility of the audit-prune cron job (Slot F-4) — this
--   migration only provides the index that makes the prune sweep cheap.
--
-- RLS / privileges:
--   The table is owner-scoped only. `grantRole` runs through getOwnerConnection
--   (BYPASSRLS) so app_user grants are not required. Do NOT expose this table
--   to app_user — `jti` values are sensitive (knowing a jti is sufficient for
--   the replay attack we are guarding against here).

CREATE TABLE IF NOT EXISTS public.consumed_approval_tokens (
  jti         uuid         PRIMARY KEY,
  org_id      uuid         NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consumed_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index supports the audit-prune cron's (org_id, consumed_at < cutoff) sweep
-- and ad-hoc per-org forensic queries (e.g. "how many approvals burned this
-- week in org X?").
CREATE INDEX IF NOT EXISTS consumed_approval_tokens_org_idx
  ON public.consumed_approval_tokens (org_id, consumed_at);

-- Defensive: revoke from PUBLIC and app_user. The grant flow uses the owner
-- pool (BYPASSRLS), so app_user MUST NOT be able to read or write here.
REVOKE ALL ON public.consumed_approval_tokens FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'REVOKE ALL ON public.consumed_approval_tokens FROM app_user';
  END IF;
END
$$;
