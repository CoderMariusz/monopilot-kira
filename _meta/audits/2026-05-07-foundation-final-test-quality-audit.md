# Foundation Final Test-Quality Audit (2026-05-07, Opus)

> Independent audit of test quality across **all 54 test files** in the foundation
> module, covering T-001 through T-061. Focus: vacuous tests, missing SQLSTATE
> pins, weak assertions, mock-bypass vacuity, SUT-not-exercised cases, and the
> status of the 8 P0 items recommended in the Wave A test-quality audit.

## Executive summary — HONEST

Severity: **HIGH (regression-prone tier)**.

54 test files were scanned. 41 properly pin Postgres SQLSTATE codes and write
mutation-proof assertions (audit_events, departments-rls, manufacturing-ops,
schema-driven, rbac, totp, rule-engine cascade, password-policy, idempotent,
gs1, outbox events, rls.cross-org). The remaining ~13 files contain the legacy
weakness pattern flagged in Wave A but never fixed:

- The T-022 i18n suite still ships 4 × `formatNumber → toContain('1')` plus 4 ×
  hardcoded plural-form `.toHaveProperty('one')` checks (still **literally
  vacuous** — would pass on any impl).
- T-022 routing tests still match a regex literal in the test rather than
  importing `routing.ts`. `middleware.ts` is never invoked.
- T-041 RegisterSW test imports the component but **never renders it**; all
  four assertions are `expect(RegisterSW).toBeDefined()`. Module-namespace
  default export is always defined.
- T-025 Modal still has **37 `querySelector(…).toBeDefined()` assertions**.
  `Element | null` is "defined" in both branches; the test would pass even if
  the node was missing. The only-spy assertion `not.toBeNull()` is used in 3
  out of ~37 sites.
- 1 × `expect(true).toBe(true)` placeholder remains in `Modal.test.tsx:250`
  ("ESLint AC2 documented") and 1 × in `schema-discovery.test.ts:95`
  (placeholder for manual `ls -la`) and 1 × in
  `pwa/install-offline.e2e.test.ts:315` (Playwright availability doc).
- 8 × `await expect(...).rejects.toThrow()` with **no SQLSTATE pin and no
  regex** in `tenant-idp-config.integration.test.ts`,
  `tenant-migrations.test.ts`. Same anti-pattern that caused T-009 ↔ T-010
  cycles.

**The recommended P0 task `foundation-test-hardening` (originally T-053) was
NEVER executed**. Slot T-053 was repurposed for `packages/db` layout
consolidation. None of the 8 hardening items from the Wave A audit landed
(verified by re-grep). STATUS.md does not list a follow-up.

The CI matrix risk is acute: there is **no `.github/workflows/` directory in
the repo**. Every DB-skip integration test (≈ 60 % of all foundation ACs)
relies on a developer running `DATABASE_URL=... pnpm test` locally. If a
critical AC like cross-org RLS isolation regresses and a developer forgets to
set `DATABASE_URL`, the suite reports green.

---

## Counts

| Metric | Value |
|---|---|
| Total test files scanned | **54** |
| `expect(true).toBe(true)` placeholders | **3** (down from 5; sw.test.ts cleaned) |
| `querySelector(…).toBeDefined()` (Element\|null) | **~37 in Modal.test.tsx alone**, ~3 elsewhere |
| Bare `rejects.toThrow()` no regex/code | **8** |
| `rejects.toThrow(/regex/)` (acceptable but not SQLSTATE-pinned) | **10** |
| `rejects.toMatchObject({ code: 'NNNNN' })` (gold standard) | **41** |
| DB-gated tests (`it.skip` if no DATABASE_URL) | ~30 of 54 files |
| `.github/workflows/` files in repo | **0 (does not exist)** |
| SQLSTATE pins in HIGH-risk integration tests (audit/rbac/dept-rls/mfg-ops) | comprehensive |

---

## Findings table

| # | File | Line(s) | Pattern | Severity | Recommended fix |
|---|---|---|---|---|---|
| 1 | apps/web/lib/i18n/__tests__/format.test.ts | 37, 43, 49, 55 | `expect(formatNumber(1234.56, …)).toContain('1')` — `1234.56` always contains '1' (`A.1`) | HIGH | Pin exact strings: `pl → '1 234,56'`, `en → '1,234.56'`. Plus assert decimal separator |
| 2 | apps/web/lib/i18n/__tests__/format.test.ts | 11, 17, 24, 30 | `expect(result).toBeTruthy()` after `toMatch(...)` — redundant; toMatch already proves non-empty | LOW | Delete the `.toBeTruthy()` calls |
| 3 | apps/web/lib/i18n/__tests__/format.test.ts | 60–106 | `expect(pluralForms).toHaveProperty('one')` on a literal object the test itself defined (`A.3`) | HIGH | Call `new Intl.PluralRules('pl').select(2)` and assert `'few'`, `select(5) === 'many'`, etc. |
| 4 | apps/web/app/__tests__/i18n.test.ts | 60–78 | "Middleware locale negotiation" tests assert `'pl'.match(/pl|en|uk|ro/)` — middleware never invoked (`E` SUT) | HIGH | Import `middleware`, invoke with mocked `NextRequest('/pl/page')`, assert response cookie or rewrite |
| 5 | apps/web/app/__tests__/i18n.test.ts | 82–108 | `pathname.match(/^\/([a-z]{2})/)` against the regex literal in the test, not against `routing.ts` (`E`) | HIGH | Import `routing` and call its locale-extraction; or remove duplicate-of-built-in-Intl tests |
| 6 | apps/web/app/_components/__tests__/RegisterSW.test.tsx | 35–63 | All 4 tests do `expect(RegisterSW).toBeDefined()` — never `render(<RegisterSW />)`, never check `registerSpy.called` (`E`) | HIGH | Render with NODE_ENV='production', `await microtask()`, assert `registerSpy` called with `/sw.js`. Inverse for development |
| 7 | apps/web/app/__tests__/sw.test.ts | (cleaned)  | sw.test.ts now reads sw.ts source and asserts skipWaiting, clientsClaim, defaultCache, NetworkFirst — GOOD | — | (no fix needed — kept as good example) |
| 8 | apps/web/app/__tests__/sw.test.ts | 79–83 | `it.skip(...moved to T-042 E2E)` — silently dormant; comment says T-042 owns this but T-042 also lacks Playwright | MEDIUM | Add a documented "carry-forward" CI signal or a static fallback (parse sw.ts for offline fallback handler) |
| 9 | apps/web/__tests__/pwa/install-offline.e2e.test.ts | 315 | `expect(true).toBe(true); // Playwright blocked — vitest fallback active` (`A.1`) | MEDIUM | Acceptable as a documentation marker but should at minimum import & dynamic-shape-assert `playwright.config.ts` once added |
| 10 | packages/db/__tests__/schema-discovery.test.ts | 95 | `expect(true).toBe(true); // Placeholder; real check is manual ls -la` (`A.1`) | MEDIUM | Replace with `fs.lstatSync(...).isSymbolicLink()` and `path.relative()` not-absolute check |
| 11 | packages/ui/src/__tests__/Modal.test.tsx | 22, 26, 29, 46, 62, 65, 68, 81, 100, 121, 152, 153, 154, 155, 156, 161, 187, 241, 268, 285, 299 (and ~12 more) | `expect(container.querySelector(...)).toBeDefined()` — querySelector returns Element\|null, both "defined" (`A.2`) | HIGH | Replace with `not.toBeNull()` or `toBeInTheDocument()`. ~37 sites in this one file |
| 12 | packages/ui/src/__tests__/Modal.test.tsx | 247–251 | `expect(true).toBe(true)` — claimed "ESLint AC2 documented" (`A.1`) | HIGH | Read `eslint.config.*`, parse rules, assert `no-restricted-imports` blocks `@radix-ui/react-dialog` |
| 13 | packages/ui/src/__tests__/Modal.test.tsx | 273–300 | "Dismissible AC4" — never clicks the backdrop, never asserts `onOpenChange` was/wasn't called (`E`) | HIGH | `userEvent.click(overlay)`, await, assert `onOpenChange` mock invocation |
| 14 | packages/ui/src/__tests__/Modal.test.tsx | 187–191 | "returns focus to trigger" — never closes; never asserts focus (`E`) | MEDIUM | Open then close; assert `document.activeElement === trigger` |
| 15 | packages/db/__tests__/tenant-idp-config.integration.test.ts | 210, 270, 311 | bare `await expect(invalidInsert).rejects.toThrow();` — would pass on any error including pg-protocol mismatch (`B`) | HIGH | `.rejects.toMatchObject({ code: '23514' })` for CHECK and `'23503'` for FK |
| 16 | packages/db/__tests__/tenant-idp-config.integration.test.ts | 351–357 | `expect(schemaName).toBeDefined()` — schemaName always defined (`A.3`) | HIGH | Run migration005 twice in same TX; assert no duplicate-table error |
| 17 | packages/db/src/__tests__/tenant-migrations.test.ts | 233, 259, 292 | bare `rejects.toThrow()` for invalid CHECK / PK / status enum (`B`) | HIGH | Pin `code: '23514'` (CHECK) and `'23505'` (PK) |
| 18 | packages/db/__tests__/r13-business-tables.test.ts | 455, 464, 473, 482, 491 | `rejects.toThrow(/not-null constraint|violates.*null/i)` — accepts any null violation but no SQLSTATE 23502 pin (`B`) | LOW | Pin `code: '23502'` |
| 19 | packages/db/__tests__/r13-business-tables.test.ts | 530–600 | T-040 AC3 cross-org RLS now uses real app_user pattern (matches rls.cross-org pattern) — GOOD | — | (Hardened post-Wave-A; was a HIGH item, fixed) |
| 20 | packages/db/__tests__/r13-business-tables.test.ts | 99–187 | Drizzle schema tests use `expect(lot).toBeDefined()` and `toHaveProperty('id')` — passes regardless of column type/nullability | MEDIUM | Inspect column metadata: `lot.id.notNull === true`; assert SQL types |
| 21 | packages/outbox/src/__tests__/worker.e2e.test.ts | 178–185 | `errorMsg.includes('invalid') OR includes('constraint') OR includes('check')` — overly broad (`B`) | MEDIUM | Pin `code: '23514'` (CHECK) explicitly |
| 22 | packages/outbox/src/__tests__/worker.e2e.test.ts | 36–37 | `expect(queue.Queue || queue.default).toBeDefined()` — short-circuit means `||` always sees something (`A.3`, `D`) | LOW | Use specific export: `expect(queue).toHaveProperty('Queue')` |
| 23 | packages/auth/src/__tests__/totp.test.ts | 402–426 | "no @simplewebauthn import" mutation-proof — uses `vi.spyOn(globalThis, 'fetch')` plus throws-on-resolution argument. Solid. | — | — (good) |
| 24 | packages/db/src/__tests__/app-role.test.ts | 30–33, 160–161 | `expect(typeof clients.getAppConnection).toBe('function')` — passes for any function (`C`) | LOW | Already exercised end-to-end in other tests; redundant typeof check is fine |
| 25 | packages/ops/src/__tests__/drift-detect.e2e.test.ts | 122, 133, 276 | `expect(typeof handler).toBe('function')` (`C`) | LOW | Acceptable — handler is then invoked in subsequent assertions in same test |
| 26 | packages/ui/src/__tests__/tuning.test.tsx | 59, 63, 66, 295, 323, 362, 363, 380 | `expect(screen.getByText('foo')).toBeDefined()` — getBy throws if absent, redundant but not vacuous | LOW | Acceptable per audit policy; redundant `.toBeDefined()` could be deleted |
| 27 | packages/server/src/__tests__/idempotent.test.ts | 280–289 | hash test forces canonicalStringify nested-object correctness — gold standard mutation-proof | — | (good) |
| 28 | packages/db/__tests__/audit.integration.test.ts | 388–407 | impersonation guard test: `await expect(insertPromise).rejects.toMatchObject({ code: 'P0001' })` — gold standard | — | (good) |
| 29 | packages/db/__tests__/audit.integration.test.ts | 312–349 | UPDATE/DELETE as app_user with explicit `caughtError?.code === '42501'` — gold standard | — | (good) |
| 30 | packages/db/__tests__/rls.cross-org.integration.test.ts | 156–204 | Real app_user RLS rejection + spoofed-GUC counterproof — gold standard. T-040 mirrored this. | — | (good) |
| 31 | packages/auth/src/__tests__/password-policy.test.ts | (full file) | Multiple mutation experiments verified by reviewer (REWORK fixed whitespace_only guard) | — | (good) |
| 32 | packages/rbac/src/__tests__/grant.test.ts | 542, 686, 757 | Regex-pinned throw matchers (`actor.*approver`, `RBAC_APPROVAL_HMAC_KEY`, `actor does not belong`) — strong | — | (good) |

---

## Tests that genuinely fail without impl (good examples to anchor on)

1. `packages/db/__tests__/audit.integration.test.ts:388–407` — impersonation guard, pins **P0001**.
2. `packages/db/__tests__/audit.integration.test.ts:312–349` — UPDATE as app_user pins **42501**.
3. `packages/db/__tests__/rls.cross-org.integration.test.ts:156–204` — connects as real `app_user`, sets org context, asserts cross-org isolation; counterproof spoofed GUC.
4. `packages/db/__tests__/manufacturing-ops.integration.test.ts:343–667` — UNIQUE 23505, CHECK 23514 pinned with dedicated tests for `'!!'`, lowercase `'a1'`, length 1, length 5.
5. `packages/db/__tests__/departments-rls.integration.test.ts:300–334` — AC4 cross-org INSERT pins 42501 with explicit `caughtCode === '42501'`.
6. `packages/db/__tests__/r13-business-tables.test.ts:530–620` — AC3 RLS isolation with real app_user pool (post-Wave-A hardening).
7. `packages/server/src/__tests__/idempotent.test.ts:280–289` — canonicalStringify hash test forced impl fix.
8. `packages/gs1/src/__tests__/parse.test.ts:34–72` — known-good/bad GTIN-13 vectors with explicit `error: 'check_digit_mismatch'`.
9. `packages/outbox/src/__tests__/events.test.ts:91–101` — `normalizeEventType('fa.unknown')` throws with regex match.
10. `packages/auth/src/__tests__/totp.test.ts:402–426` — fetch-spy + module-resolution counterproof.
11. `packages/auth/src/__tests__/password-policy.test.ts` — whitespace_only mutation experiments (REWORK fixed real bug).
12. `packages/rule-engine/src/__tests__/cascade-mfg-intermediate.test.ts:648–700` — SQLSTATE pins for cascading mfg_op.
13. `packages/rbac/src/__tests__/grant.test.ts:427–440` — `audit_events.retention_class` CHECK 23514 pinned.
14. `packages/schema-driven/src/__tests__/draft.test.ts:249–258, 656–665` — field_type CHECK 23514 + retention_class CHECK 23514.
15. `apps/web/__tests__/auth/saml.integration.test.ts:181–532` — RelayState equality + Issuer DiD + SLO end-to-end.

---

## Suspected vacuous tests requiring rework (numbered)

1. **apps/web/lib/i18n/__tests__/format.test.ts:34–58** — `formatNumber → toContain('1')`. **Same anti-pattern flagged in Wave A on 2026-05-07. Not fixed. T-053 was repurposed.**
2. **apps/web/lib/i18n/__tests__/format.test.ts:60–106** — plural-rules tests on hardcoded literals. **Not fixed.**
3. **apps/web/app/__tests__/i18n.test.ts:60–108** — middleware/routing literal-regex tests. **Not fixed.**
4. **apps/web/app/_components/__tests__/RegisterSW.test.tsx:35–63** — never renders. **Not fixed.**
5. **packages/ui/src/__tests__/Modal.test.tsx querySelector→toBeDefined sites** (~37). **Not fixed.**
6. **packages/ui/src/__tests__/Modal.test.tsx:247–251** — ESLint AC2 placeholder. **Not fixed.**
7. **packages/ui/src/__tests__/Modal.test.tsx:273–300** — dismissible AC4 untested. **Not fixed.**
8. **packages/db/__tests__/tenant-idp-config.integration.test.ts:210, 270, 311** — bare `.rejects.toThrow()`. **Same anti-pattern as T-009 round-1; not fixed.**
9. **packages/db/__tests__/tenant-idp-config.integration.test.ts:351–357** — `schemaName).toBeDefined()`. **Not fixed.**
10. **packages/db/src/__tests__/tenant-migrations.test.ts:233, 259, 292** — bare `rejects.toThrow()` on CHECK / PK / status. **Not fixed.**
11. **packages/outbox/src/__tests__/worker.e2e.test.ts:178–185** — substring includes-OR — broad enough to pass on noise. **Not fixed.**

---

## Skip-pattern abuse (HIGH)

The repo has **no `.github/workflows/` directory**. Verified by `find /home/user/monopilot-kira -name "ci.yml"` — only matches inside `node_modules/`. There is no CI Postgres job. Every test that does
`const runIntegrationTest = hasDatabaseUrl ? it : it.skip` will silently
skip in any environment without `DATABASE_URL`.

**This affects these tasks where a critical AC is ONLY verified with DB:**

| Task | Test file | DB-skip risk |
|---|---|---|
| T-007 | rls.cross-org.integration.test.ts | Cross-org RLS — silently skipped without DB |
| T-008 | outbox/worker.e2e.test.ts | 12-event CHECK + worker FIFO — silent skip |
| T-009 | audit.integration.test.ts | Impersonation P0001 + 42501 — silent skip |
| T-010 | tenant-idp-config.integration.test.ts | F-U5 trigger seed + FK + CHECK — silent skip |
| T-014 | rbac/grant.test.ts (DB tests) | retention CHECK 23514 — silent skip |
| T-017 | schema-runtime/compile.test.ts | LRU cache + recompile — silent skip |
| T-019 | departments.integration.test.ts | dept seed contract — silent skip |
| T-020 | manufacturing-ops.integration.test.ts | UNIQUE + CHECK regex — silent skip |
| T-021 | rule-engine/cascade-mfg-intermediate | runCascade single-tx — silent skip |
| T-024 | server/idempotent.test.ts | canonicalStringify hash test runs but DB integration silent-skips |
| T-038 | tenant-migrations.test.ts | cohort + status CHECK + PK — silent skip |
| T-039 | upgrade.test.ts | canary cohort advance — silent skip |
| T-040 | r13-business-tables.test.ts | RLS cross-org isolation — silent skip |
| T-045 | app-role.test.ts | role split — silent skip |
| T-056 | departments-rls.integration.test.ts | 42501 RLS hotfix — silent skip |

**Recommendation P0**: add `.github/workflows/ci.yml` with a `services: postgres` block that boots Postgres 16, runs `pnpm db:migrate`, then `DATABASE_URL=... pnpm -r test`. Without this, the DB-gated 60% of foundation ACs are unverified at PR time.

---

## Mutation experiments — claimed vs verified

Tasks with documented mutation experiments in notes:

- **T-009** — re-reviewed; trigger-disable counterproof real (`audit.integration.test.ts:388–407` would fail).
- **T-014** — 26 tests + AC1 fixture rework; SoD on TARGET roles non-vacuous (`grant.test.ts:542`).
- **T-015** — 9 mutation experiments + 1 race-condition in TOTP. `totp.test.ts:402–426` proves no @simplewebauthn import. Solid.
- **T-016** — 5 mutation experiments documented; `verify-pin.test.ts:191` exact-string match.
- **T-021** — 7/7 cascade mutations confirmed.
- **T-035** — 10/10 workflow mutations.
- **T-039** — 13/13 mutations on canary upgrade.
- **T-061** — whitespace_only guard mutation real (caused REWORK).

Verified by spot-reading the test files: claims are credible. **No fake mutation-proofs detected.**

---

## Test-fixture bugs masking impl reality

- **T-016 GREEN modified RED test fixtures** (`industry_code 'test' → 'generic'`). Re-read `verify-pin.test.ts:191`: comment says "Exact string match — toBeDefined() is forbidden per quality bar" — the fix was legitimate (prod check constraint did not include 'test', and the seed needed valid `industry_code`). Migrations 020/021 (originally added to bandage the test fixture) were correctly REVERTED in REWORK γ. **Verified clean.**
- **T-014 GREEN AC1 fixture** — corrected actor/target test fixture; was a legitimate fix to test setup, not assertion-weakening.
- No other tasks identified where the test fixture hides an impl bug.

---

## Mock-bypass vacuity

- `apps/web/__tests__/feature-flags.test.ts:36` — `vi.mock('posthog-node', …)` with explicit factory; not self-referencing. Counterproof tests assert `response.status === 403` for unauthorized callers — solid.
- `apps/web/__tests__/auth/magic-link.e2e.test.ts:55` — top-level `vi.mock('../../lib/auth/supabase-server')` with explicit factory at file top (T-035 hoisting fix).
- `apps/web/__tests__/auth/saml.integration.test.ts:120` — `vi.mock('@boxyhq/saml-jackson', …)` with explicit factory. Not self-mocking.
- `packages/auth/src/__tests__/totp.test.ts:402` — explicit fetch-spy + module-resolution check; documented mutation counterproof.
- `apps/web/app/(admin)/schema/_components/__tests__/SchemaColumnWizard.test.tsx:30, 52` — mocks `next/navigation` + the server action.
- **No detected case of the production module being its own mock.**

---

## Carry-forward into post-Wave-A backlog

The Wave A audit (2026-05-07) recommended **T-053 foundation-test-hardening**
with 8 P0 items. **T-053 was repurposed for `packages/db` layout consolidation**
(STATUS.md confirms). The 8 items are unimplemented:

1. ❌ Replace `expect(node).toBeDefined()` → `not.toBeNull()` / `toBeInTheDocument()` in Modal & r13 tests
2. ❌ Pin SQLSTATE in `.rejects.toThrow()` (T-010, T-040 AC2, T-038)
3. ❌ Delete or harden `expect(true).toBe(true)` placeholders (still 3)
4. ✅ Rewrite T-040 AC3 RLS — DONE (pattern matches rls.cross-org)
5. ❌ Rewrite T-022 i18n format/middleware to actually invoke runtime
6. ❌ Rewrite T-041 RegisterSW to render and assert registerSpy
7. ❌ CI gate verifying zero `expect(true).toBe(true)`
8. ❌ "no-skip-without-comment" lint rule

Recommend opening a NEW task `T-079 foundation-test-hardening` (or similar
free slot) BEFORE Wave B to clear items 1, 2, 3, 5, 6 (real test-quality
fixes) and item 7 (CI grep guard). Items 4 (RLS rework) is already done.

---

## Honest answer: would a non-trivial impl bug REGRESS undetected?

**Yes, with non-trivial probability**, in these specific surfaces:

- **i18n localisation regressions** (T-022): if `formatNumber` accidentally
  used the host-locale instead of the explicit locale arg, all 4 tests still
  pass because `1234.56.toLocaleString(host)` always contains '1'. Same for
  plural-rules: any object literal with a `'one'` key passes.
- **Modal accessibility regressions** (T-025): if Radix Dialog's role
  attribute disappeared (e.g. structural CSS rewrite removed the slot), 37
  `querySelector(...).toBeDefined()` checks would still pass because `null`
  is "defined" in jest semantics.
- **RegisterSW dev/prod guard regression** (T-041): the component could be
  changed to register in dev mode, and the suite would still pass because no
  test renders it.
- **tenant_idp_config CHECK constraint drift** (T-010): if the CHECK on
  `provider_type` accidentally allowed `'ldap'`, the bare `rejects.toThrow()`
  could still fire on a different error path (e.g. FK violation) — false
  green.
- **Without CI**: any DB-gated regression (60% of ACs) goes undetected by
  whatever automation runs PRs. There is no GitHub workflow file.

**Tasks safely covered by mutation-proof tests** include audit_events
(T-009), departments-rls (T-056), manufacturing-ops (T-020), rule cascade
(T-021), totp (T-015), password-policy (T-061), idempotent (T-024), GS1
(T-023), R13 business tables RLS post-T-053 (T-040), rbac (T-014), rls
cross-org (T-007), workflow (T-035), canary upgrade (T-039), schema-driven
draft (T-036).

**Bottom line**: ~10 of 54 test files contain regression-prone weak
assertions. Wave B should NOT proceed past its first DB-touching task without
either (a) a hardening pass executing items 1-3, 5-7 above, or (b) a CI
workflow that gates merges on full DB-integration runs. Without CI, the
hardening gives false confidence; with CI, the weak files become smoke
tests rather than acceptance gates. **Both are needed.**
