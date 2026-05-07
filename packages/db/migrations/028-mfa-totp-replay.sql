-- T-062 hardening: TOTP replay protection on mfa_secrets.
-- Migration 028: track the last consumed TOTP step per user so the same OTP
-- code cannot be replayed within its 30-second window.
--
-- BEFORE: packages/auth/src/totp.ts:128 verifies a presented TOTP token via
--         otplib's `verifySync` and returns true on the first valid match.
--         An attacker who intercepts the 6-digit code (over the wire, via
--         shoulder surfing, MFA prompt phishing, etc.) can replay it within
--         the same 30-second epoch and get a second successful verification.
--
-- AFTER:  verifyTotp atomically claims the current TOTP step by writing the
--         epoch number into `last_otp_window`. The atomic UPDATE has the
--         predicate `(last_otp_window IS NULL OR last_otp_window <> $window)`
--         so the second concurrent verifier sees `rowCount === 0` and returns
--         { ok: false, reason: 'replay' }.
--
-- Mutation proof:
--   1. Enroll user with secret S.
--   2. Generate TOTP code C for current epoch E.
--   3. verifyTotp(C) → { ok: true } and DB row has last_otp_window = E.
--   4. verifyTotp(C) immediately after (same epoch) → UPDATE matches 0 rows
--      (predicate `last_otp_window <> E` is false) → { ok: false, reason: 'replay' }.
--
-- Reversibility: drop the two columns + index. No data loss (purely additive
-- audit columns; no behaviour change for existing flows besides replay block).

alter table public.mfa_secrets
  add column if not exists last_otp_used_at timestamptz,
  add column if not exists last_otp_window  bigint;

-- Index supports the verify-time UPDATE predicate (user_id is already PK so
-- the lookup is O(1); the index also helps audit queries grouping by window).
create index if not exists mfa_secrets_last_otp_window_idx
  on public.mfa_secrets (user_id, last_otp_window);

-- No grant changes required: app_user already has UPDATE on mfa_secrets per
-- 007-mfa.sql line 49 (`GRANT SELECT, INSERT, UPDATE ON public.mfa_secrets`).
