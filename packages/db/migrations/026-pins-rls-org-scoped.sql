-- T-062 hardening: org-scoped user_pins RLS (was using(true)) — Wave A.6 P0
-- Migration 026: replace fail-open SELECT policy on user_pins with org-scoped policy.
--
-- BEFORE this migration, 019-pins.sql installed:
--   create policy user_pins_org_context on public.user_pins for all to app_user
--     using (true)
--     with check (user_id in (select id from public.users where org_id = app.current_org_id()));
--
-- Effect of `using (true)`: any app_user (regardless of org context) could
--   `select pin_hash from public.user_pins where user_id = '<arbitrary-uuid>'`
-- and read PIN argon2id hashes belonging to users of OTHER organizations.
-- INSERT/UPDATE were correctly scoped, but SELECT and DELETE leaked.
--
-- AFTER this migration:
--   * SELECT/UPDATE/DELETE/INSERT all gated on
--     `user_id IN (SELECT id FROM public.users WHERE org_id = app.current_org_id())`.
--   * Cross-org SELECT returns 0 rows (RLS filters them out).
--
-- Mutation proof (manual, to be wired into the integration suite):
--   1. Seed orgA with userA + a pin row for userA.
--   2. Seed orgB with userB.
--   3. As app_user with current_org_id() set to orgB, run
--        SELECT count(*) FROM public.user_pins WHERE user_id = '<userA-uuid>';
--      BEFORE this migration → returns 1 (leak).
--      AFTER this migration → returns 0 (RLS hides cross-org rows).
--
-- Reversibility: this migration is reversible. To roll back, drop the new
-- policy and recreate the original `using (true)` policy from 019-pins.sql.
-- (We deliberately do NOT keep the old policy as a fallback — fail-closed.)

-- Drop the leaking policy so we can recreate it with org scope on USING.
drop policy if exists user_pins_org_context on public.user_pins;

create policy user_pins_org_context
  on public.user_pins
  for all
  to app_user
  using (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  )
  with check (
    user_id in (
      select id from public.users where org_id = app.current_org_id()
    )
  );
