-- Migration 349: grant UPDATE on public.fa_allergen_overrides to app_user.
-- Same class as 348 (public.product). set-allergen-override.ts both INSERTs (line ~156)
-- and UPDATEs (line ~205) fa_allergen_overrides — the FG allergen "Override" control
-- toggles/edits an existing override row. app_user had SELECT/INSERT/DELETE but NOT
-- UPDATE while the table's RLS policy permits UPDATE (org-scoped), so re-overriding an
-- allergen failed at the privilege layer (42501). NOTE the sibling append-only ledger
-- public.item_allergen_profile_overrides is correctly left INSERT-only (immutable trail);
-- and immutable audit/e-sign/outbox/*_history tables are deliberately NOT granted UPDATE
-- (21 CFR Part 11 / event-log immutability). GRANT is idempotent. Wave0: org_id + RLS.
grant update on public.fa_allergen_overrides to app_user;
