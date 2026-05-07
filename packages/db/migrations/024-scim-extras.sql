-- Migration 024: T-013 SCIM extras
--   1. ALTER public.users ADD COLUMN deleted_at timestamptz (nullable; soft-delete sentinel)
--   2. CREATE INDEX users_org_id_active_idx ON public.users (org_id) WHERE deleted_at IS NULL
--   3. CREATE INDEX tenant_idp_config_scim_last_four_idx ON public.tenant_idp_config(scim_token_last_four)
--      → enables O(1) SCIM bearer-token lookup so middleware verify-path completes <10ms
--        even on a miss (avoids scanning every tenant's argon2id hash).
--
-- All operations idempotent (IF NOT EXISTS).

alter table public.users
  add column if not exists deleted_at timestamptz;

create index if not exists users_org_id_active_idx
  on public.users (org_id)
  where deleted_at is null;

create index if not exists tenant_idp_config_scim_last_four_idx
  on public.tenant_idp_config (scim_token_last_four);
