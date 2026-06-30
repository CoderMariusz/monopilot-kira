# Programming Error Analysis — 2026-06-30

Scope: this retro covers seven mistakes found during the Codex second pass and Opus `kira-codex-review` for MonoPilot Kira. It is a meta/prevention artifact only; it does not change app code.

Context read before drafting:
- `.claude/skills/MON-t1-schema/SKILL.md`
- `.claude/skills/MON-t2-api/SKILL.md`
- `.claude/skills/MON-t3-ui/SKILL.md`
- `.claude/skills/MON-domain-planning/SKILL.md` recurring live-bug section
- `docs/workflow/02-QUALITY-GATES.md`
- `docs/workflow/03-WORKTREE-PROTOCOL.md`
- `docs/workflow/04-CODEX-INTEGRATION.md`
- `.claude/agents/kira-codex-review.md`

## 1. Transaction Partial-Commit

### Failure

Three work-order Server Action callers wrote to the database inside `withOrgContext`, then returned `{ ok: false }` after detecting a later validation or state error. `withOrgContext` commits on normal return and rolls back only on throw, so the returned failure still committed earlier writes. The result was orphaned or half-mutated rows.

### Why It Slipped

The T2 pattern emphasized wrapping DB work in `withOrgContext`, but did not make the commit-on-return trap explicit enough. Tests checked the returned `{ ok: false }` shape but did not assert that no rows were committed after failure. Review also treated all failure returns as equivalent, without distinguishing pre-write failures from post-write failures.

Missed gate: Gate 1 tests lacked rollback-boundary assertions; Gate 4 review did not inspect every `{ ok: false }` path after the first write.

### Prevention Rule

In any `withOrgContext` callback:
- Validate all deterministic input, permission, and state preconditions before the first write whenever possible.
- After the first write, never return `{ ok: false }` for a condition that should roll back that write. Throw a domain rollback error and map it outside the transaction, or restructure so the check happens before the write.
- Add a negative test that forces the late-failure path and asserts the earlier row/outbox/audit write is absent.

## 2. SQL Aggregate Fanout

### Failure

A multi-table join from operations to roles silently multiplied the inner operation rows. A primary `SUM`/denominator happened to cancel out by coincidence, but a derived downtime-cost term was deflated by role count.

### Why It Slipped

The query returned plausible top-level values and the test asserted the primary number, not the derived term under a multi-role fixture. Review checked the broad query shape but did not reason about the grain of each aggregate.

Missed gate: Gate 1 SQL tests did not include a role fanout fixture; Gate 4 review did not require a CTE-first grain check for aggregates joined to many-side tables.

### Prevention Rule

For any reporting or cost query that aggregates one entity and then joins to roles, tags, permissions, lines, or other one-to-many tables:
- Aggregate at the true inner grain first in a CTE, usually one row per operation/work order/license plate.
- Join many-side dimensions only after the aggregate CTE.
- Add a test fixture with two joined child rows for one parent and assert all derived terms, not just the headline number.

## 3. ON CONFLICT Cardinality

### Failure

An `INSERT ... SELECT` normalized input values with a `normalize()` function, then used `ON CONFLICT`. Two different source rows normalized to the same target key, so Postgres raised `ON CONFLICT cannot affect row a second time`.

### Why It Slipped

The test data did not include duplicate-after-normalization inputs, and review saw `ON CONFLICT DO NOTHING/UPDATE` as sufficient idempotency without checking source cardinality.

Missed gate: Gate 1 lacked a duplicate-normalized fixture; Gate 4 did not require testing the actual insert source under `PREPARE` or execution with colliding normalized inputs.

### Prevention Rule

Every `INSERT ... SELECT ... ON CONFLICT` whose conflict key uses normalized, lowercased, trimmed, coalesced, or computed values must deduplicate the source by the exact conflict key:

```sql
with normalized as (
  select distinct normalize(raw_name) as key, ...
  from source_rows
)
insert into target (key, ...)
select key, ...
from normalized
on conflict (key) do nothing;
```

Add a test with two raw inputs that normalize to the same key.

## 4. Migration Checksum Immutability

### Failure

An already-applied migration file was edited, even only in a comment, without re-recording `schema_migrations.checksum`. Vercel deploy failed at the `@monopilot/db migrate` gate with a checksum mismatch. Local Next build did not catch it because local build does not run the Supabase migration gate.

### Why It Slipped

The existing skills warn never to edit applied migrations, but the review loop treated a local green build as sufficient. The team also conflated local `next build` with the Vercel deploy pipeline, where `pnpm --filter @monopilot/db migrate` runs against Supabase before the app is accepted.

Missed gate: Gate 5 live deploy verification was not treated as mandatory for migration edits; Gate 4 review did not compare changed migration files against deployed `schema_migrations.checksum`.

### Prevention Rule

Never edit an applied migration. Add a new forward migration for every change, including comment/documentation corrections that affect a file already recorded by the deploy database. After pushing a migration change, verify the Vercel deploy state, not just local build state:
- Vercel build must be `READY`.
- The `@monopilot/db migrate` step must be fail-loud.
- Supabase `public.schema_migrations` must reflect the expected filenames and checksums.

## 5. Test Co-Update

### Failure

A literal changed in code, such as currency `EUR` to `GBP` or a table name, but the test asserting that literal was not updated. Codex lanes scoped as "do not touch tests" left red tests behind after legitimate literal changes.

### Why It Slipped

The work instruction constrained the implementation lane away from tests, and review focused on production behavior rather than assertion drift. Literal changes are small enough to look mechanical, but they often encode expected behavior in tests.

Missed gate: Gate 1 failed only after the fact; Gate 4 did not enforce a grep for tests that assert changed literals.

### Prevention Rule

Any changed literal that is user-visible, schema-visible, event-visible, permission-visible, or test-fixture-visible requires a grep across tests and snapshots before closeout:

```bash
rg "OLD_LITERAL|NEW_LITERAL" apps packages _meta
```

If the code change is legitimate, update the tests in the same change. "Do not touch tests" is not a valid constraint when the implementation changes an asserted contract.

## 6. `.tsx` vs `.ts` Vitest Config

### Failure

A server-action test was created as `.tsx`, with a redundant `.tsx` wrapper. In `apps/web`, `.tsx` tests run only under `vitest.ui.config.ts`; `.ts` server-action tests should run under `vitest.config.ts`. Running the wrong config produced a misleading `Unexpected JSX expression` parse failure.

### Why It Slipped

The current test-command guidance says `pnpm --filter web vitest run <path>` but does not force the reviewer to verify which config owns the file extension. The error looked like a code parse bug instead of a test-placement/config mismatch.

Missed gate: Gate 1 command selection was wrong for the file type; Gate 4 review did not check test extension against the intended runtime.

### Prevention Rule

Use file extension as a test-runtime contract:
- Server Action, route-handler, and non-React tests: `.test.ts`, run with `vitest.config.ts`.
- UI/RTL/component tests: `.test.tsx`, run with `vitest.ui.config.ts`.
- Explicit UI command: `node node_modules/vitest/vitest.mjs run --config vitest.ui.config.ts <path.test.tsx>`.
- Do not create `.tsx` wrappers for server-action tests.

## 7. Reviewer Over/Under-Trigger

### Failure

A Codex review flagged a pre-existing `'use server'` type-export as `[BLOCKER]`, even though it was not introduced by the reviewed diff and had built green for prior deploys. The issue may still deserve cleanup, but it was not a blocker for that PR.

### Why It Slipped

The reviewer correctly remembered a real risk class from `MON-t2-api`, but did not scope severity to the diff. It treated "bad pattern exists" as "this change introduced a blocking regression."

Missed gate: Gate 4 lacked an explicit diff-scoped blocker rule.

### Prevention Rule

Before elevating any finding to `BLOCKER`, reviewers must answer: did this PR introduce, expand, or make reachable the problem? If not, report it as pre-existing residual risk or a follow-up unless the change depends on it or makes it newly failing.

Use `git diff -- <path>` and compare against the integration base before assigning severity.

## Reviewer Quality

The review waves need to catch these earlier without generating false blockers.

1. **Diff-scoped severity first.** Reviews should start with the changed files and the task contract. A blocker must be caused by the diff, made reachable by the diff, or proven to fail a required gate now. Pre-existing issues can be findings, but their severity must reflect whether this PR regresses them.

2. **Transaction-path review for T2 actions.** For every Server Action using `withOrgContext`, reviewers should mark the first write, then inspect all later branches. A returned `{ ok: false }` after that point is a rollback bug unless the earlier write is intentionally committed and covered by an idempotent/audit rule.

3. **SQL grain review.** For any aggregate query, reviewers should name the grain of each CTE and the grain after every join. Joins to roles/permissions/tags/lines after aggregation are acceptable; joins before aggregation need proof that they do not fan out the metric.

4. **PREPARE or execute the actual SQL text.** SQL review should test the exact query text that ships, not a reconstructed approximation. This matters for `ON CONFLICT` cardinality, table names, function calls, and casts. Where practical, run a `PREPARE`/minimal execution with fixtures that include duplicate-normalized keys and many-side joins.

5. **Vitest config verification.** Reviewers should check every new/changed test path against the correct config. `.test.tsx` implies UI config; `.test.ts` implies server/node config. A parse failure from the wrong config is not a product failure until the command is corrected.

6. **Literal co-update grep.** When a diff changes a currency, table name, event type, permission string, enum value, role slug, or UI label, reviewers should grep both old and new literals across tests and snapshots. A green local command is not enough if the relevant assertion was never run.

7. **Deploy-state awareness for migrations.** Any changed migration file requires a Gate-5 question: is the file new and unapplied, or has it already been recorded in Supabase `schema_migrations`? Local `next build` is irrelevant to checksum safety.

## Top-3 Prevention Rules

1. **`withOrgContext` commits on normal return: after the first write, throw to roll back.** Validate before writes where possible. If a post-write failure must abort the mutation, throw a rollback-domain error and map it after the transaction. Every T2 write action needs a failure test proving no partial rows remain.

2. **The migration truth gate is Vercel `@monopilot/db migrate`, not local Next build.** Never edit applied migrations. For migration work, verify the deployed Supabase `schema_migrations.checksum` state and Vercel migrate result before calling the branch safe.

3. **Use the correct Vitest config by file type.** Server-action tests are `.test.ts` under `vitest.config.ts`; UI/RTL tests are `.test.tsx` under `vitest.ui.config.ts` using `node node_modules/vitest/vitest.mjs run --config vitest.ui.config.ts <path.test.tsx>`. A wrong-config parse failure is a process bug, not proof the implementation is broken.
