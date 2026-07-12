# Wave A2 — WO lifecycle & release gating (P0). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
KEY: withOrgContext COMMITS unless you THROW. All qty math SQL numeric/Dec. New SQL PREPAREs (non-reserved aliases). NEVER export non-async from 'use server'. Next free migration = 486 (max 485) — say so LOUDLY if used.
Independent from Wave A1 (that owns consume/genealogy). This wave owns WO state transitions.

Primary files: `apps/web/lib/production/complete-cancel-wo.ts`, `apps/web/lib/production/yield-gate-override.ts`,
`apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/complete/route.ts`,
`apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/create-work-order-chain.ts` (release/start gating),
WO release/start actions (grep `factory_release_incomplete`, `factory_spec`, `started_at`, `completed_at`).

## C3 (P0) — WIP→FG dependency not enforced
Repro: a parent FG WO was released, started, AND completed while its prerequisite WIP child stayed DRAFT (and could not be released — `factory_release_incomplete`). The chain dependency is not gating the FG.
FIX: FG release (and start) must verify every upstream `wo_dependencies` prerequisite WO is at least released/started as the chain requires; block FG start/complete until upstream WIP has produced the required output. Return a typed "upstream WIP not ready" error. Fix at the release/start choke point so both UI and API callers are covered.
Test: FG with a DRAFT WIP prerequisite → FG release/start rejected; only after WIP is released+produced can FG proceed.

## C4 (P0) — WO completed at 2.6% consumption (yield gate advisory)
Repro: registered 3 kg output, completed WO with ~2.6% of material consumed; the out-of-tolerance yield warning did NOT block completion.
Files: complete gate + yield-gate-override.ts.
FIX: when actual consumption/yield is outside the configured tolerance, completion must be BLOCKED unless a supervisor yield-gate override with e-sign + reason (existing `yield_gate_override_reasons` taxonomy) is supplied — mirror the existing override mechanism, do not leave the warning advisory. No override → typed error, WO stays open.
Test: complete with consumption far below tolerance and no override → rejected; with a valid override+e-sign → allowed and the override is recorded.

## S5 — failed WIP release not surfaced
Repro: WIP release failed with `factory_release_incomplete` (missing `factory_spec`) but the user saw nothing.
FIX: propagate the typed failure to the UI with an actionable message ("factory spec missing — generate/complete factory spec before release"). Do not swallow. Add the error surface in the release action's result + the calling component's toast/inline error.
Test: release a WIP with no factory_spec → user-visible typed error, not a silent no-op.

## S8 — started_at / completed_at stay NULL
Repro: after Start and Complete, `started_at` and `completed_at` remained empty on the WO row.
FIX: the start and complete transitions must set `started_at`/`completed_at` (SQL now() in the same txn as the state change). Grep for where state moves to in_progress/completed and ensure the timestamp columns are written. Backfill not required; fix forward.
Test: start → `started_at` set; complete → `completed_at` set, in the same transaction as the state change.

## S19 — "Submit for trial" VERSION_NOT_LOCKED despite locked version
Repro: NPD "Submit for trial" returned `VERSION_NOT_LOCKED` though DB confirmed the version locked; UI showed no error either.
FIX: (a) the lock-state read used by submit-for-trial reads a stale/wrong version — resolve the CURRENT locked version in the same txn/query rather than a cached value; (b) surface the error to the UI when it does occur. Root-cause the mismatch (likely reading a different version row or pre-lock snapshot). Grep `VERSION_NOT_LOCKED`.
Test: a locked version submits for trial successfully; an unlocked one returns a USER-VISIBLE error.

## Requirements
- Read touched files FULLY; grep callers; fix at shared choke points (UI action + API route often share a lib).
- Tests per bug (existing __tests__ patterns; `.ts` vitest, `.tsx` under vitest.ui.config.ts). DB-faithful for the state-transition/timestamp bugs.
- Gates: `pnpm --filter web exec tsc --noEmit` clean + touched vitest green. FULL `pnpm --filter web run build` if you touch any 'use server' export shape.
- Summary → `_meta/plans/prod-audit-2026-07-12/A2-summary.md` (root cause + diff locations + repro pinned per bug).
