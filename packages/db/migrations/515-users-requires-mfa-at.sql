-- 515 — public.users.requires_mfa_at for forced MFA enrollment (PF-R01-02 completion)
--
-- Settings → Security save (actions/security/upsert-policy.ts) calls forceAdminMfa /
-- forceAllUsersMfa which UPDATE public.users SET requires_mfa_at = ... whenever 2FA
-- enforcement is on. The column was never added to the schema, so every Security policy
-- save threw SQLSTATE 42703 (column "requires_mfa_at" does not exist) and surfaced to the
-- operator as persistence_failed. Migration 510 fixed the tenant_idp_config writer half of
-- PF-R01-02; this adds the nullable timestamp the enforcement code already writes so the
-- save transaction can commit.

alter table public.users
  add column if not exists requires_mfa_at timestamptz;

comment on column public.users.requires_mfa_at is
  'When set, the user must (re)enroll MFA before continuing; stamped by org security policy MFA enforcement (forceAdminMfa / forceAllUsersMfa).';
