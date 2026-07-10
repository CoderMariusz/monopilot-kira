-- Migration 466 — Document app.user_can_see_site fail-open semantics (comment-only).
--
-- Wave 7 app-layer fix (assign-user-sites) now refuses empty site assignments for
-- ordinary users. The RLS predicate still treats zero user_sites rows as unrestricted
-- (mig 383 condition 3) — a staged backfill + restrictive flip is required before
-- changing the function body. See _meta/plans/wave-7-summary.md for the follow-up.

comment on function app.user_can_see_site(uuid) is
  'Site visibility predicate for RESTRICTIVE RLS policies (mig 383). '
  'TODO(wave-7-rls-flip): condition (3) currently returns TRUE when the user has zero '
  'public.user_sites rows (fail-open / opt-in rollout). After backfilling assignments '
  'for all non-admin users, flip (3) to restrictive semantics (zero rows = no site '
  'access) and keep admin-slug bypass (condition 2) as the only unrestricted path. '
  'Do NOT flip without the backfill window documented in mig 382.';
