# Wave 9 fix-round 2 Codex re-review

Reviewed commit `600db08c`, the full current implementations, the new PostgreSQL test, the prior Bug 1/3/4 fixes, and the Quality-module ownership boundary. Only this review file was overwritten.

## Findings

### HIGH — the real-Postgres concurrency regression deadlocks instead of proving serialization

`apps/web/lib/production/output/__tests__/register-output-genealogy.pg.test.ts:172-203,320-336`

`withConcurrentAppOrg` begins two transactions and commits them only after its callback resolves. The callback awaits both `registerOutput` calls with `Promise.all`. Once one transaction acquires the WO genealogy transaction-level advisory lock, the other transaction blocks waiting for that lock; however, the first transaction cannot commit and release it until the callback's `Promise.all` resolves. The result is a deterministic wait cycle (ultimately a Vitest timeout), not a passing concurrency proof, whenever `DATABASE_URL` is present.

Minimal fix: let the first registration commit while the second is waiting, then await and commit the second (or give each concurrent worker its own begin/register/commit lifecycle). Assert that the second was actually blocked before releasing the first, and retain the final exact `numeric` sum assertion.

## Requested verification

### 1. WO-wide serialization and atomic parent cap — CODE FIXED

`allocateGenealogyContributionsForOutput` acquires `pg_advisory_xact_lock(hashtext($1::text || '::genealogy'))` using only `woId` (`apps/web/lib/production/output/register-output.ts:366-375`). Output type is absent from this lock key. The lock is acquired before both the mixed-UoM read and the allocation CTE, including `already_attributed`; it remains held through the subsequent LP/genealogy inserts because `registerOutput` uses the caller's transaction (`:397-469,741-812`). Therefore a later registration for any output type on the same WO reads the first transaction's committed edge, and `least(..., pn.net_qty - attributed_qty, ...)` enforces the remaining-parent cap under the same lock. The separate output-type lock at `nextBatchNumber` only protects sequencing and does not weaken the WO-wide genealogy lock.

### 2. Mixed parent-consumption UoM — CODE FIXED

Before allocation, the code groups consumption by parent LP and detects `having count(distinct mc.uom) > 1`, then throws `ProductionActionError('uom_mismatch', 409, ...)` with the LP and ordered UoM list (`register-output.ts:377-395`). The allocation CTE independently admits only groups with exactly one UoM (`:397-410`), so incompatible quantities are not silently summed and labeled with `min(uom)`. The error is thrown after an output-row write in this flow, so the caller transaction rolls back; it is not converted into a normal failure return.

### 3. New PostgreSQL regression — PARTIAL

The new `.pg.test.ts` imports and collects successfully and skips all three tests when `DATABASE_URL` is absent. Its mixed-UoM case calls the real `registerOutput` SQL and checks that no genealogy row exists. Its PREPARE case submits PostgreSQL SQL with non-reserved CTE aliases. The concurrency case also calls real `registerOutput`, but its transaction harness deadlocks as described above, so it does not currently provide runnable database evidence of the concurrency invariant.

Real PostgreSQL execution/PREPARE could not be performed in this worktree: `DATABASE_URL` is unset and neither local port 54322 nor 5432 accepts connections.

### 4. Regression audit — PASS in code

- Bug 1 remains fixed: supplied LP warehouse/site/WO validation is performed on the locked LP before the output insert, and receipt movement uses that locked LP's site/location.
- Bug 3 remains fixed: an active hold returns `quality_hold_active` before the first QA write; failures after writes throw.
- Bug 4/canonical ownership remains fixed: Quality delegates `wo_outputs` mutation to production-owned `transition-output-qa.ts`; no Quality production action directly writes `wo_outputs`.
- No new reserved-keyword alias was found in the round-2 SQL. The new CTE names (`parent_net`, `wo_output_total`, `already_attributed`) are safe, though live PREPARE is unverified in this environment.
- Genealogy quantity arithmetic remains PostgreSQL `numeric`; no production JavaScript float quantity calculation was added by round 2.
- No new `withOrgContext` normal-return-after-write partial-commit path was introduced.

## Verification evidence

`git diff --stat origin/main..HEAD`:

```text
_meta/plans/wave-9-summary.md                      | 101 ++++++
.../production/_actions/output-qa-actions.ts       | 143 ++-------
.../quality/__tests__/haccp-actions.test.ts        |  63 ++--
.../_actions/__tests__/inspection-actions.test.ts  |  61 +++-
.../(modules)/quality/_actions/haccp-actions.ts    |  19 +-
.../(modules)/quality/_actions/hold-actions.ts     |  46 +--
.../quality/_actions/inspection-actions.ts         |  67 ++--
.../register-output-genealogy-net-consumed.test.ts | 342 ++++++++++++++++++++
.../__tests__/register-output-genealogy.pg.test.ts | 352 +++++++++++++++++++++
.../__tests__/register-output-supplied-lp.test.ts  | 245 ++++++++++++++
.../output/__tests__/transition-output-qa.test.ts  | 190 +++++++++++
apps/web/lib/production/output/register-output.ts  | 344 +++++++++++++++++---
.../lib/production/output/transition-output-qa.ts  | 215 +++++++++++++
apps/web/lib/production/shared.ts                  |   1 +
14 files changed, 1910 insertions(+), 279 deletions(-)
```

Targeted test command:

```text
pnpm --filter web exec vitest run lib/production/output/__tests__/register-output-genealogy-net-consumed.test.ts lib/production/output/__tests__/register-output-genealogy.pg.test.ts lib/production/output/__tests__/register-output-supplied-lp.test.ts lib/production/output/__tests__/transition-output-qa.test.ts 'app/[locale]/(app)/(modules)/quality/_actions/__tests__/hold-actions.test.ts'
```

Raw stdout tail:

```text
 RUN  v4.1.5 /Users/mariuszkrawczyk/Projects/monopilot-worktrees/wave9/apps/web

 Test Files  4 passed | 1 skipped (5)
      Tests  32 passed | 3 skipped (35)
   Start at  11:40:31
   Duration  206ms (transform 237ms, setup 0ms, import 389ms, tests 24ms, environment 0ms)
```

VERDICT: fail
