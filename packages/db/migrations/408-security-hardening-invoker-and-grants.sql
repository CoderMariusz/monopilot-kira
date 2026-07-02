-- 408-security-hardening-invoker-and-grants.sql
-- P0 security fixes from the 2026-07-02 DB deep-dive (W6A). Idempotent.

-- (1) fa_allergen_cascade lost its security_invoker flag: mig-391's bare
--     `create or replace view` reset reloptions, so the view reverted to
--     owner-rights (definer) semantics and bypassed RLS + per-user-site
--     visibility on its underlying tables -> a single SELECT could read another
--     org's allergen-cascade rows (cross-ORG leak). Restore invoker so the
--     querying app_user's RLS applies (matches __expected__/schema.sql).
alter view public.fa_allergen_cascade set (security_invoker = true);

-- (2) Supabase's default anon/authenticated DML grants (INSERT/UPDATE/DELETE,
--     incl. TRUNCATE) were never revoked on these RLS-OFF lookup/config tables.
--     The application connects as app_user; anon/authenticated are pure attack
--     surface here (operational_tables is read by the RLS helper
--     app.is_site_scoped_table, so tampering with it could unscope site RLS).
--     Revoke all write privileges from both roles. SELECT is left intact.
revoke insert, update, delete, truncate on
  public.currencies,
  public.iso4217,
  public.big_loss_categories,
  public.dashboards_catalog,
  public.operational_tables
from anon, authenticated;
