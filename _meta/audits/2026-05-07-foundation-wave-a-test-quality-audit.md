# Foundation Wave A — Test Quality Audit (2026-05-07)

## Executive summary

Severity: **HIGH**. After auditing 27 test files spanning the 21 done Foundation tasks, I found **30+ vacuous or weak assertions** across 9 files, including five `expect(true).toBe(true)` placeholders that masquerade as service-worker tests, an entire family of `formatNumber → toContain('1')` checks (1234.56 contains '1' regardless of locale), and a fleet of `expect(domNode).toBeDefined()` assertions where `querySelector` returns `Element | null` — both branches are "defined". Two whole task suites (T-040 RLS, T-022 i18n middleware) claim to enforce critical ACs (cross-org isolation, locale negotiation) but the tests merely assert hardcoded constants or metadata bits, never exercising the SUT. The DB-skip pattern is used appropriately for most genuine integration tests, but T-022 i18n hides skipped vacuous tests behind file-existence checks. A new task **foundation-test-hardening** is recommended before Wave B opens to prevent these tests from masking regressions in future modules.

## Findings table

| Task | File | Line | Pattern | Severity | Recommended fix |
|---|---|---|---|---|---|
| T-022 | apps/web/lib/i18n/__tests__/format.test.ts | 39, 44, 49, 54 | `expect(result).toContain('1')` — `1234.56` always contains '1' regardless of locale formatting (`A.1` Vacuous) | HIGH | Assert decimal separator: `pl` → `,`, `en` → `.` and thousands grouping; verify exact output e.g. `'1 234,56'` |
| T-022 | apps/web/lib/i18n/__tests__/format.test.ts | 68-71, 77-80, 88-92, 100-104 | `expect(pluralForms).toHaveProperty('one')` on a hardcoded literal — proves nothing about ICU runtime (`A.3` + `B.2` Vacuous) | HIGH | Call `new Intl.PluralRules('pl').select(2)` and assert `'few'`; do same for ru/uk/ro corner-cases |
| T-022 | apps/web/app/__tests__/i18n.test.ts | 60-78 | "Middleware locale negotiation" tests assert `'pl'.match(/pl|en|uk|ro/)` — never imports/calls middleware (`B` SUT not exercised) | HIGH | Import `middleware.ts`, invoke with mocked `NextRequest` for `/pl/page`, assert `request.nextUrl.locale` |
| T-022 | apps/web/app/__tests__/i18n.test.ts | 82-108 | `pathname.match(/^\/([a-z]{2})/)` — tests the regex literal in the test, not `routing.ts` (`B`) | HIGH | Import `routing` from app code; call its locale-extraction function |
| T-041 | apps/web/app/__tests__/sw.test.ts | 14, 19, 24, 29, 34, 40 | Five tests are bare `expect(true).toBe(true)` with comments saying "tested in T-042" (`A.1` + `B`) | CRITICAL | Either delete and mark AC carry-forward, or add real assertions on `sw.ts` exports/precaching strategies |
| T-041 | apps/web/app/__tests__/sw.test.ts | 7-9 | `expect(sw).toBeDefined()` after dynamic import — module namespace is always defined | MEDIUM | Assert specific exports and their types |
| T-041 | apps/web/app/_components/__tests__/RegisterSW.test.tsx | 35-63 | All four tests do `expect(RegisterSW).toBeDefined()` and then comment "tested via integration"; component never rendered (`B`) | HIGH | `render(<RegisterSW />)` with NODE_ENV mocked, assert `registerSpy` called/not-called |
| T-040 | packages/db/__tests__/r13-business-tables.test.ts | 464-537 | 10 tests for "AC3 RLS isolation" only check `relrowsecurity=true` and `pg_policies.length>0` — never connect as `app_user` and verify cross-org filter (`E` + `B`) | HIGH | Replicate rls.cross-org pattern: connect as app_user, set org context, INSERT for org A, attempt SELECT for org B, expect 0 rows |
| T-040 | packages/db/__tests__/r13-business-tables.test.ts | 421, 430, 439, 448, 457 | `rejects.toThrow(/not-null constraint|violates.*null/i)` — accepts any null violation but does not pin SQLSTATE `23502` | LOW | Add `expect(err.code).toBe('23502')` |
| T-040 | packages/db/__tests__/r13-business-tables.test.ts | 99-187 | Drizzle schema tests use `expect(lot).toHaveProperty('id')` etc. — passes whether column has correct type, default, or nullability | MEDIUM | Inspect column metadata: `lot.modelPredictionId.notNull` should be `false`; assert SQL types |
| T-010 | packages/db/__tests__/tenant-idp-config.integration.test.ts | 209, 269, 310 | `await expect(invalidInsert).rejects.toThrow();` no regex/code — would also pass on a parameter-mismatch protocol error (`C`, the exact T-009 vacuous-bug pattern) | HIGH | `.rejects.toMatchObject({ code: '23514' })` for CHECK and `'23503'` for FK |
| T-010 | packages/db/__tests__/tenant-idp-config.integration.test.ts | 351-357 | "idempotent migration" test only asserts `expect(schemaName).toBeDefined()` — schemaName is always defined (`A.3` Vacuous) | HIGH | Re-run the migration twice in the same transaction and assert no error |
| T-008 | packages/outbox/src/__tests__/worker.e2e.test.ts | 178-185 | `errorMsg.includes('invalid') OR includes('constraint') OR includes('check')` — overly broad, would match unrelated errors (`C`) | MEDIUM | Pin SQLSTATE `23514` (CHECK) explicitly |
| T-008 | packages/outbox/src/__tests__/events.test.ts | 36-37 | `expect(queue.Queue || queue.default).toBeDefined()` — short-circuit means the assertion always sees something | LOW | `expect(queue).toHaveProperty('Queue')` (specific export) |
| T-025 | packages/ui/src/__tests__/Modal.test.tsx | 22-23, 24-26, 27-29, 31-46, 49-69, 71-86, ... | ~12 tests use `container.querySelector(...).toBeDefined()` — `querySelector` returns `Element | null`; both are "defined". Should use `toBeInTheDocument()` or `not.toBeNull()` | HIGH | Replace with `expect(node).not.toBeNull()` or jest-dom `toBeInTheDocument()` |
| T-025 | packages/ui/src/__tests__/Modal.test.tsx | 187-191 | "returns focus to triggering element on close" — never triggers close, never asserts focus (`B`) | MEDIUM | Open then close; assert `document.activeElement === trigger` |
| T-025 | packages/ui/src/__tests__/Modal.test.tsx | 247-251 | `expect(true).toBe(true)` placeholder claiming ESLint enforcement (`A.1` Vacuous) | HIGH | Use `tseslint.RuleTester` or inspect lint config file content |
| T-025 | packages/ui/src/__tests__/Modal.test.tsx | 273-300 | dismissible AC — neither test actually clicks the backdrop nor verifies `onOpenChange` is/isn't called (`B`) | HIGH | `userEvent.click(overlay)` and assert `onOpenChange` mock |
| T-038 | packages/db/src/__tests__/tenant-migrations.test.ts | 343-369 | Drizzle schema tests use `(tableConfig.columns.x as any)` then `.toBeDefined()`/`.dataType==='uuid'` — column object is always defined, no enum-CHECK metadata is verified | MEDIUM | Verify the CHECK constraints exist via `pg_constraint` (already done in integration block); for unit, assert `cohortColumn.notNull === true` |
| T-018 | packages/rule-engine/src/__tests__/executor.test.ts | 200-203, 386-392 | `expect(...).not.toThrow()` and `expect(result.fired).toBeDefined()` — boolean fields are always defined; `not.toThrow` passes for any unhandled rule_type (`A.3`) | MEDIUM | Assert specific `result.fired === true/false` for each rule_type |
| T-024 | packages/server/src/__tests__/idempotent.test.ts | 207, 339, 392 | `expect(handlerCalled).toBe(true)` and `expect(row.created_at).toBeDefined()` — defaulted timestamp always set | LOW | Reasonable; not a regression, but timestamp could assert `Date` type |
| T-019 | packages/db/__tests__/departments.integration.test.ts | 33-65 | "Static shape contract" tests only `existsSync(file).toBe(true)` and grep migration text — proves nothing about runtime correctness (`E`) | MEDIUM | Acceptable as a static gate, but AC3 marker test should also run regardless of DB (parse seed SQL and assert `APEX-CONFIG` strings) |
| T-017 | packages/schema-runtime/src/__tests__/compile.test.ts | 80-88 | "GREEN: compile() and clearCache() functions are implemented" — only checks `typeof === 'function'` and `clearCache().not.toThrow()` (`A.3`) | LOW | Could add: `compile` is async, throws on missing schema |

## Tests that genuinely fail without impl (good)

Anchoring examples:

- **packages/db/__tests__/audit.integration.test.ts:388-407** — impersonation guard test (the one that was reworked twice). Uses `await expect(insertPromise).rejects.toMatchObject({ code: 'P0001' })` — **specifically pins the trigger's errcode**. This is the gold-standard pattern.
- **packages/db/__tests__/audit.integration.test.ts:312-349** — `rejects` UPDATE with explicit `caughtError?.code` check for `'42501'` (insufficient_privilege). Mutation testing: if the REVOKE were missing, this fails with no code or a different code, and the assertion catches it.
- **packages/db/__tests__/rls.cross-org.integration.test.ts:156-204** — connects as real `app_user` role, sets org context, INSERTs with the wrong org, expects RLS rejection. Sees BOTH the visible-row count (=1, org A row) AND the cross-org INSERT rejection. This is the pattern T-040 should mirror.
- **packages/db/__tests__/rls.cross-org.integration.test.ts:184-204** — actively tries to spoof a custom GUC and asserts the spoof is **ignored** — directly verifies the threat model.
- **packages/server/src/__tests__/idempotent.test.ts:280-289** — pure-unit hash test: `expect(testHash(original)).not.toBe(testHash(modified))`. Forced GREEN authors to fix the canonicalStringify nested-object bug — a true RED→GREEN.
- **packages/gs1/src/__tests__/parse.test.ts:34-72** — known-good and known-bad GTIN-13 vectors tied to specific check-digit arithmetic, with explicit `error: 'check_digit_mismatch'` assertions — would fail loudly if mod-10 logic broke.
- **packages/outbox/src/__tests__/events.test.ts:91-101** — `normalizeEventType('fa.unknown')` must throw with regex match; valid roundtrip preserved; would catch any silent acceptance.

## Suspected vacuous tests (require rework)

Numbered, with hardening direction:

1. **apps/web/app/__tests__/sw.test.ts:14-42** — five `expect(true).toBe(true)`. **Fix**: delete or replace with assertions against `serwist.config.ts` and the generated `public/sw.js` (skipWaiting flag, runtime caching strategies enumerable from withSerwist config). Document explicitly which ACs carry forward to T-042.
2. **apps/web/lib/i18n/__tests__/format.test.ts:34-58** — `formatNumber → toContain('1')`. **Fix**: assert `formatNumber(1234.56, 'pl') === '1 234,56'` (NBSP) and `..., 'en') === '1,234.56'`. Then add an explicit assertion `result.includes(',')` for pl and `result.includes('.')` for en.
3. **apps/web/lib/i18n/__tests__/format.test.ts:60-106** — `expect(pluralForms).toHaveProperty('one')` on a literal object. **Fix**: `expect(new Intl.PluralRules('pl').select(2)).toBe('few')`; add 0/1/2/5/22 cases per locale.
4. **apps/web/app/__tests__/i18n.test.ts:60-108** — middleware/routing tests assert string literals. **Fix**: import `middleware` and call with a mock `NextRequest` for each prefix; assert redirect or `Accept-Language` fallback.
5. **apps/web/app/_components/__tests__/RegisterSW.test.tsx:40-63** — never renders the component. **Fix**: render with `NODE_ENV='production'`, await microtask, assert `registerSpy` called with `/sw.js`. Render with `NODE_ENV='development'`, assert `registerSpy` NOT called.
6. **packages/ui/src/__tests__/Modal.test.tsx querySelector→toBeDefined pattern** (lines 22, 28, 31, 45, 65, 80, 100, 121, 161, 222, 234, 285, 298). **Fix**: replace `expect(node).toBeDefined()` with `expect(node).not.toBeNull()` or import `@testing-library/jest-dom` and use `toBeInTheDocument()`.
7. **packages/ui/src/__tests__/Modal.test.tsx:247-251** — ESLint AC2 placeholder. **Fix**: read `eslint.config.*`, parse rule list, assert `no-restricted-imports` blocks `@radix-ui/react-dialog` outside `Modal.tsx`. Or run `eslint --rulesdir` programmatically.
8. **packages/ui/src/__tests__/Modal.test.tsx:273-300** — dismissible AC4 untested. **Fix**: `userEvent.click(overlay)`, await, assert `onOpenChange` called with `false` when dismissible=true; assert NOT called when dismissible=false.
9. **packages/db/__tests__/r13-business-tables.test.ts AC3 (lines 464-537)** — RLS metadata only. **Fix**: copy the rls.cross-org.integration.test.ts harness — connect as app_user, set org context to org A, INSERT a lot row for org A, INSERT a lot row for org B as superuser, then SELECT as app_user under org A context and assert exactly 1 row visible.
10. **packages/db/__tests__/tenant-idp-config.integration.test.ts:209, 269, 310** — bare `.rejects.toThrow()`. **Fix**: pin SQLSTATE: `'23514'` for CHECK violations, `'23503'` for FK. This is the **same vacuous pattern** that caused T-009's two rework rounds.
11. **packages/db/__tests__/tenant-idp-config.integration.test.ts:351-357** — `expect(schemaName).toBeDefined()`. **Fix**: actually re-apply migration005 a second time in the same client and assert no error; or assert `CREATE TABLE IF NOT EXISTS` text in migration.

## Skip-pattern abuse

Tasks where critical ACs are **only** verifiable with DB and tests skip silently:

- **T-040 (r13-business-tables)** — AC3 (cross-org RLS isolation) is critical but only checked via metadata. Even when DB is present, the metadata-only test passes if RLS is mis-policied. **Always-skipped + insufficient-when-run.**
- **T-010 (tenant-idp-config)** — F-U5 trigger seeding, FK constraint, CHECK constraints — all skipped without DB. Skip is appropriate IF the CI matrix has a Postgres job, but no skip-explanation comment documents this. Action: confirm `db:test` runs in CI matrix; if not, these ACs are unverified.
- **T-009 (audit_events)** — all tests skip without DB. Same risk as T-010 but the tests themselves are well-hardened.
- **T-008 (outbox)** — AC1/AC2/AC3 all DB-only. Static contract has no fallback assertion (e.g. parse migration SQL for CHECK content).
- **T-017 (schema-runtime)** — AC1/AC2/AC3 (LRU cache, recompile on schema_version bump) are DB-only. AC2 in particular asserts `duration2 < 1ms` — flaky under CI load, and skipped entirely without DB.
- **T-038 (tenant_migrations)** — AC1-AC4 all DB-only.

**Recommendation**: introduce a "static fallback" tier for DB-skip tests — read the migration SQL, assert CHECK regex content as a stop-gap when DATABASE_URL is absent. T-019 already does this correctly (lines 32-66).

## Recommended new task: foundation-test-hardening

**Title**: T-053 Foundation test hardening pass

**Scope**:
1. Replace all `expect(node).toBeDefined()` with `expect(node).not.toBeNull()` or `toBeInTheDocument()` in Modal.test.tsx and r13-business-tables.test.ts (~15 sites).
2. Pin SQLSTATE codes in all `.rejects.toThrow()` against Postgres (T-010, T-040 AC2 — ~10 sites). Standard codes: 23502 (NOT NULL), 23503 (FK), 23505 (UNIQUE), 23514 (CHECK), 42501 (insufficient privilege), P0001 (raise exception).
3. Delete or harden the 5 `expect(true).toBe(true)` placeholders in sw.test.ts and the 1 in Modal.test.tsx; document carry-forward in T-042/T-025 acceptance notes.
4. Rewrite T-040 AC3 RLS tests to mirror rls.cross-org.integration.test.ts (cross-org INSERT/SELECT as real app_user).
5. Rewrite T-022 i18n format/middleware tests to actually invoke runtime functions (Intl.PluralRules, next-intl middleware with mocked NextRequest).
6. Rewrite T-041 RegisterSW.test.tsx to render the component and assert registerSpy invocations.
7. Add a CI gate verifying every `__tests__/*.test.*` file in `packages/` and `apps/web/` has zero `expect(true).toBe(true)` literals (grep guard).
8. Add a "no-skip-without-comment" lint rule (or test) that fails if a test file uses `it.skip` / conditional `runIntegrationTest` without a leading comment naming the skip reason.

**Estimated effort**: 1-2 days for hardening + 0.5 day for CI guards.

**Blocking**: should land before any Wave B task that depends on foundation primitives (especially T-014 RBAC enforcement and T-016 verify-PIN, which will hit similar `.rejects.toThrow()` weak-assertion patterns).
