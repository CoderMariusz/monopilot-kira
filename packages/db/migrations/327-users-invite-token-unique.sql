-- Migration 327: partial-unique index on public.users.invite_token
--
-- Defense-in-depth for the owner-pool (BYPASSRLS) invite-accept flow:
--   apps/web/app/api/auth/invite/accept/route.ts does
--     select ... from public.users where invite_token = $1
--     update public.users ... where invite_token = $1 returning org_id ...
-- with NO org_id predicate. That is correct by design — the token IS the
-- credential and is how the org is resolved (you don't know the org until you
-- resolve the token, same shape as a password-reset token). BUT invite_token
-- had NO unique constraint, so a token collision could make the UPDATE affect
-- >1 row across orgs (accepting one invite would mutate another user's row).
-- Tokens are random secrets so the practical risk is ~0, but a unique index
-- makes `where invite_token = $1` provably single-row — the proper guarantee.
--
-- Partial (WHERE invite_token IS NOT NULL): users who have already accepted
-- their invite carry NULL invite_token, and many NULLs must coexist. Only the
-- pending, non-null tokens must be unique.
--
-- Verified live via Supabase MCP before creating: zero duplicate non-null
-- invite_token values exist, so the index builds cleanly. Idempotent.
-- Found by the 2026-06-24 owner-pool cross-tenant sweep (RANK 1-2).
create unique index if not exists users_invite_token_unique
  on public.users (invite_token)
  where invite_token is not null;
