-- 054 — grant app_user USAGE on audit_events id sequence (T-113 follow-up / 004 schema gap)
--
-- 004-audit.sql:89 grants `select, insert on public.audit_events to app_user`
-- (single-org, RLS-scoped app-context audit writes are intended — distinct from the
-- cross-org owner-pool writes in packages/rbac/src/grant.ts). But `id bigserial`
-- auto-creates `audit_events_id_seq` and `GRANT INSERT` does NOT imply sequence
-- USAGE, so any app_user INSERT fails with 42501 "permission denied for sequence".
-- Surfaced by the first app_user audit writer: the GDPR erasure dispatcher (T-113).
--
-- Fix: complete the 004 grant so the documented app_user INSERT actually works.
-- Append-only enforcement (REVOKE UPDATE/DELETE) is unaffected.

GRANT USAGE, SELECT ON SEQUENCE public.audit_events_id_seq TO app_user;
