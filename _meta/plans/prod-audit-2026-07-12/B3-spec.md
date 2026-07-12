# Wave B3 — Access & product CRUD: unban on reactivate, product reactivation, onboarding status, item-form polish (P1). Prod-repro'd 2026-07-12 (round-2).

Repo: monopilot-kira. THIS worktree only. DISCIPLINE: SQL valid on real PG; withOrgContext throws-to-rollback; no non-async export from 'use server'; next free migration = 487 (say LOUDLY).

## B3a (P1) — user reactivation does not lift the Supabase Auth ban
Repro: deactivation works (A6 C6 sets is_active=false + bans via updateUserById ban_duration). Reactivating flips the app row to Active but the auth user KEEPS the ban (until year 2126) → cannot log in. Affected: e2e-r08-signer-20260711@monopilot.test.
Files: apps/web/actions/users/ (reactivate action — find it; it may be the same module as deactivate.ts).
FIX: on reactivation, ALSO clear the auth ban (updateUserById with ban_duration 'none' / 0 — check supabase admin API semantics) and check the returned {error} (same lesson as C6). Deactivate/reactivate must be symmetric. ALSO: write a small one-off is fine, but the FIX must repair the state for any currently-banned-but-active users — either in the action or note it for the orchestrator to run manually (list the exact admin call). Test: reactivate calls the unban and surfaces a failed unban.

## B3b (P1) — blocked product cannot be reactivated
Repro: product E2E-CRUD-0712 deactivated (status blocked); the edit wizard lets you pick Active and completes without error, but the DB row stays blocked → silent no-op write.
Files: items/products edit action (find where item status is persisted; likely the update never includes status, or a guard filters blocked rows from the UPDATE).
FIX: root-cause why the status change isn't persisted (payload dropped? WHERE excludes blocked? separate transition needed?) and make Active persist — or, if reactivation must be a dedicated transition, expose it and make the wizard reflect reality (never fake success). Test: blocked → Active persists in DB.

## B3c (P2) — onboarding shows contradictory state
Repro: simultaneously "Onboarding complete", "3/6 steps", "50% complete". Files: onboarding status component + its data source. FIX: derive ONE consistent status (if org onboarding_completed_at is set → complete; don't show step counters that contradict it). Test: completed org renders consistent state.

## B3d (P2) — product edit form mislabeled + wizard premature "Ready to create"
(a) The EDIT product form is titled "Create item" and its save button says "Create item" — label by mode (Edit item / Save changes). (b) The create wizard shows "Ready to create" before server-side validation; an invalid product code is safely rejected server-side but the final error is generic. Surface the server's specific validation error at the failing step, and don't claim Ready when the code is invalid (mirror the server rule client-side if cheap). Tests: labels by mode; server error message surfaced.

## B3e (P2) — products list stale after mutations
Same class as A3 S4: revalidate the products list after create/edit/deactivate mutations. Test/assert revalidate fires.

## Requirements
Read fully, grep callers. Tests per finding. Gates: tsc clean + touched vitest green; full build if 'use server' shape changes. Summary → _meta/plans/prod-audit-2026-07-12/B3-summary.md (+ any NEW SQL pasted; + the exact admin unban call for existing banned users). No git add -A, no commit.
