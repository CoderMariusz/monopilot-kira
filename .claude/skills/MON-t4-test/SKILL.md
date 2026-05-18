---
name: MON-t4-test
description: Use when implementing T4-wiring-test tasks (Vitest + Playwright) OR writing the test portion of any T1/T2/T3 task. RED-first TDD, fixtures, factories, evidence capture.
version: 1.0.0
model: sonnet
canonical_spec: _meta/plans/atomic-task-decomposition-guide.md
---

# MON-t4-test — Test implementation playbook (Vitest + Playwright)

**Tech stack (HARD):** Vitest v4 for unit/integration, `@playwright/test` v1.58 for E2E, real Postgres (Supabase test instance) for integration. This is a TypeScript monorepo — no pytest, no Jest, no FastAPI test client.

**Goal:** Implement the test layer for a T4-wiring-test task (or write the RED step for any T1/T2/T3 task) so the failing test exists *before* implementation, fixtures are reusable, and closeout evidence is captured.

## When to use

- Implementing a `"task_type": "T4-wiring-test"` JSON task end-to-end (Playwright spec + Vitest companion)
- Writing the RED step inside any T1/T2/T3 task (schema, API, UI) — even when implementation will follow in the same task
- Adding an RLS isolation test alongside any new tenant-scoped table or query

## Do NOT use when

- Writing production code (use [[MON-t1-schema]], [[MON-t2-api]], [[MON-t3-ui]])
- Decomposing PRDs into JSON tasks (use `prd-decompose-hybrid`)
- Editing `vitest.config.ts` or `playwright.config.ts` — those are foundation files; touch them only as part of a `00-foundation` task

## RED-first discipline (HARD)

Provenance: `superpowers:test-driven-development`.

1. Write the failing test FIRST. Implementation code does not exist yet.
2. Run the test. It MUST fail with a **specific assertion error** that matches the expected behavior — NOT an import error, NOT a config error, NOT a "module not found".
3. Paste the failing output into the task's RED checkpoint note (`hermes_handoff` or `closeout_requires.test_commands_and_results`).
4. Only then write implementation. Re-run the test until GREEN.
5. If the test passes on the first run (before implementation), the test is wrong — it is not actually exercising the new behavior. Rewrite it.

**RED proof minimum:** the failing assertion line (e.g., `expected 'completed' but got 'requested'`) AND the test file path. No "tests failed" hand-waving.

## Vitest patterns

### Layout

| Test type | Path | Environment |
|---|---|---|
| Package unit | `packages/<pkg>/src/__tests__/<thing>.test.ts` | `node` (root `vitest.config.ts`) |
| Package integration (DB) | `packages/<pkg>/src/__tests__/<thing>.int.test.ts` | `node` + real Postgres |
| Web app middleware/route unit | `apps/web/__tests__/<thing>.test.ts` | `node` |
| Web app React component | `apps/web/__tests__/<component>.test.tsx` | `jsdom` (via `apps/web/vitest.ui.config.ts`) |

### Run commands

```bash
pnpm --filter @monopilot/<pkg> test                       # all tests in package
pnpm --filter @monopilot/<pkg> test -- <pattern>          # filter by file pattern
pnpm --filter @monopilot/web vitest run <pattern>         # web app tests
pnpm --filter @monopilot/web vitest run -c vitest.ui.config.ts <pattern>   # React component (jsdom)
```

### Structure (arrange / act / assert — one behavior per test)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeOrg, makeWorkOrder } from '@monopilot/db/factories';
import { withOrgContext } from '@monopilot/db/test-helpers';

describe('approveWorkOrder', () => {
  it('transitions state from requested to approved', async () => {
    // arrange
    const org = await makeOrg();
    const wo = await makeWorkOrder({ orgId: org.id, state: 'requested' });

    // act
    const result = await withOrgContext(org.id, () => approveWorkOrder(wo.id));

    // assert
    expect(result.state).toBe('approved');
  });
});
```

Rules: one logical assertion per test, no shared mutable state between tests, no `beforeAll` for DB rows (use per-test factories).

### Integration tests (real DB)

- Always wrap DB calls in `withOrgContext(orgId, fn)` to set `current_setting('app.org_id')` for RLS.
- Use Testcontainers Postgres or Supabase test branch — never the dev DB.
- Truncate or transaction-rollback between tests (decided by harness; do not invent your own).
- File suffix `.int.test.ts` keeps integration tests separable from unit runs.

## Playwright patterns

### Layout

```
apps/web/e2e/
  <module>/
    <feature>.spec.ts            # the spec
    fixtures/
      seed-helpers.ts            # module-specific seed
  _fixtures/
    <shared-fixture>.ts          # cross-module helpers (auth, org context)
```

Spec discovery is locked to `**/e2e/**/*.spec.{js,ts}` by root `playwright.config.ts`. Do not place specs outside `apps/web/e2e/`.

### Run commands

```bash
pnpm --filter @monopilot/web exec playwright test <module>/<feature>           # filter
PLAYWRIGHT_WEB_SERVER=1 pnpm --filter @monopilot/web exec playwright test      # with dev server
pnpm --filter @monopilot/web exec playwright test --trace on --headed          # local debugging
```

### Fixture: signed-in user with org context

Use a Playwright `test.extend` fixture that:
1. Seeds an org + user via factories (`makeOrg`, `makeUser`).
2. Programmatically signs the user in (cookie injection or magic-link DB shortcut — never UI login per spec).
3. Exposes `{ org, user, page }` to the test body.

Reuse the existing fixture under `apps/web/e2e/_fixtures/`. Create a new one only when no existing fixture covers the role/permission combination.

### Spec structure

```ts
import { test, expect } from '@playwright/test';
import { seedMaintenanceOrg } from './fixtures/seed-helpers';

test.describe('maintenance work order lifecycle', () => {
  test('technician completes WO from requested to completed', async ({ page }) => {
    const { org, technician, wo } = await seedMaintenanceOrg();
    await page.goto(`/maintenance/mwos/${wo.id}`);
    await page.getByRole('button', { name: 'Start Work' }).click();
    await expect(page.getByTestId('mwo-state')).toHaveText('in_progress');
  });
});
```

- Interact via roles + accessible names first; `data-testid` only when no semantic selector exists.
- Never paste prototype JSX into the spec — drive through the rendered UI.
- Assert on visible state + DB state (via service helper) for cross-layer integration tests.

### Trace + screenshot evidence

Root `playwright.config.ts` already sets `trace: 'on-first-retry'` and `screenshot: 'only-on-failure'`. Do not override at spec level except to *increase* coverage (e.g., `trace: 'on'` for a one-off spine spec). Closeout must reference the artifact path.

### Accessibility assertion

Every visible-UI spec includes one `axe-core` scan:

```ts
import AxeBuilder from '@axe-core/playwright';
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

## Fixtures + factories

**Factories** live at `packages/db/src/factories/<entity>.ts` and export `makeFoo(overrides?: Partial<Foo>): Promise<Foo>`. They:
- Insert into the real test DB.
- Default every required field to a deterministic value (`crypto.randomUUID()` or counter-based).
- Accept `overrides` for the fields the test cares about.
- Return the full inserted row.

**Fixtures** are the Playwright/Vitest glue that composes factories + auth + org context. They live next to the spec under `apps/web/e2e/_fixtures/` or per-module `fixtures/`.

**Rule:** never inline raw `db.insert(...)` in a test body. If a fixture/factory does not exist, write it first. Tests stay declarative.

## RLS isolation tests (CRITICAL)

Every new tenant-scoped table or query needs a 3-row RLS test:

```ts
it('does not leak rows across orgs (RLS)', async () => {
  const orgA = await makeOrg();
  const orgB = await makeOrg();
  await makeWorkOrder({ orgId: orgA.id });

  const rowsFromB = await withOrgContext(orgB.id, () => listWorkOrders());

  expect(rowsFromB).toHaveLength(0);
});
```

This is a hard gate. See [[MON-multi-tenant-site]] for the `app.org_id` GUC convention and the `withOrgContext` helper. Missing RLS test on a tenant-scoped artifact is a review-blocker.

## Runnable test commands (must appear in task acceptance criteria)

Pick whichever apply to the task and paste into the AC list verbatim:

| Purpose | Command |
|---|---|
| Package unit/integration | `pnpm --filter @monopilot/<pkg> test -- <pattern>` |
| Web app server tests | `pnpm --filter @monopilot/web vitest run <pattern>` |
| Web app React component | `pnpm --filter @monopilot/web vitest run -c vitest.ui.config.ts <pattern>` |
| Playwright E2E | `pnpm --filter @monopilot/web exec playwright test <module>/<spec>` |
| Migration validity | `pnpm --filter @monopilot/db migrate:check` |
| Direct policy/index verify (sparingly) | `psql "$DATABASE_URL" -c "select policyname from pg_policies where tablename = '<table>'"` |

## Hard rules

| Wrong | Right |
|---|---|
| `jest`, `mocha`, `@jest/globals` | Vitest only (`vitest` imports) |
| `pytest`, `unittest`, `pytest-asyncio` | This is TypeScript — not Python |
| Mocked DB / in-memory ORM stub for integration | Real Postgres (Supabase test branch or Testcontainers) |
| Skipping RED — writing impl first | Always show failing run output before GREEN |
| Screenshot only on success | Trace + screenshot on failure (config-level, already set) |
| Spec in `apps/web/playwright/` | Spec under `apps/web/e2e/<module>/` (config discovery glob) |
| Inline `db.insert(...)` in test body | Use factory `makeFoo({...})` |
| UI login flow inside fixture | Programmatic cookie/session injection |
| Asserting via `data-testid` when a role exists | Prefer `getByRole` + accessible name |
| `toEqual` an entire row when only one field matters | One behavior per assertion |
| Skipping RLS test on tenant-scoped table | Add the cross-org leak test — hard gate |

## Evidence capture (closeout)

The T4 closeout MUST include:

1. **RED proof** — failing test output (file path + assertion message) committed to the task note before GREEN.
2. **GREEN proof** — passing test command + output paste:
   - `pnpm --filter @monopilot/<pkg> test -- <pattern>` → ✓ all tests passing
   - `pnpm --filter @monopilot/web exec playwright test <spec>` → ✓ all specs passing
3. **Artifacts** — Playwright trace.zip / screenshots / video paths under `e2e-artifacts/<feature>/` (per `UI-PROTOTYPE-PARITY-POLICY.md`).
4. **Coverage delta** (when applicable) — line/branch coverage diff for the touched package.
5. **Cross-org RLS proof** — explicit assertion that the new tenant-scoped behavior was tested with two orgs and rejected for the wrong tenant.

See `checkpoint_policy.closeout_requires` in the task JSON for the canonical field list.

## Acceptance criteria template (T4-wiring-test)

Saturate the 3-4 AC limit (per §11 of the decomposition guide). Recommended pattern:

1. **Given** the Vitest suite runs, **when** `pnpm --filter @monopilot/<pkg> test -- <pattern>` executes, **then** all listed integration tests pass with non-empty assertion counts (no skipped tests).
2. **Given** the Playwright spec runs, **when** `pnpm --filter @monopilot/web exec playwright test <module>/<spec>` executes, **then** the happy path + 1 documented edge case both pass and produce a trace artifact.
3. **Given** the RED step, **when** the spec was first run pre-implementation, **then** the failing assertion message + file path were captured in the task note (proof of TDD discipline).
4. **Given** the visible UI is exercised, **when** an `AxeBuilder({ page }).analyze()` runs, **then** `results.violations` is `[]` (axe-clean).

When the task is tenant-scoped, replace AC #4 (or add) with:

> **Given** two orgs A and B exist, **when** a user in org B queries the same resource created by org A, **then** zero rows are returned and no row IDs from A appear in B's response payload.

## Cross-links

- [[MON-t1-schema]] — schema/migration task layer; RLS tests live here too
- [[MON-t2-api]] — API/Server Action layer; unit tests pair with the action file
- [[MON-t3-ui]] — UI layer; component tests + Playwright E2E pair with the component
- [[MON-multi-tenant-site]] — `withOrgContext` helper + `app.org_id` GUC convention
- [[MON-foundation-primitives]] — Playwright harness, Testcontainers, factory base
- `_meta/plans/atomic-task-decomposition-guide.md` §1 (T1-T5 types), §4 (task metadata), §11 (atomicity)
- `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` — evidence requirements for UI closeouts
- `superpowers:test-driven-development` — canonical RED-first discipline
- `superpowers:verification-before-completion` — closeout proof gate
