-- 399-remove-decorative-partners-reference-rows.sql
-- DB cleanup audit Phase 3 — remove the decorative reference_tables 'partners' data.
-- The Settings "Suppliers & customers" SingleReferenceScreen wrote these rows into
-- public.reference_tables (table_code='partners') with ZERO operational readers — the
-- source of the owner's "Settings shows N, Planning shows M" confusion. The Settings
-- screen now redirects to the operational masters (public.suppliers / public.customers),
-- so these rows are orphaned decorative data. The reference_schemas column definitions
-- are intentionally LEFT in place (harmless metadata; no page renders tableCode
-- 'partners' anymore, and the org-insert reference seed is idempotent).
delete from public.reference_tables where table_code = 'partners';
