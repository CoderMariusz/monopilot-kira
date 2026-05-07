# Foundation Wave A — Carry-Forward Backlog (2026-05-07)

## Executive summary

Reviewed all 17 task notes in `_meta/atomic-tasks/00-foundation/notes/` (T-008, T-009, T-010, T-017, T-018, T-019, T-022, T-023, T-024, T-025, T-038, T-040, T-041, T-043, T-045, T-046, T-047 — plus T-001..T-007 marked pre-existing in STATUS.md). Wave A consolidates **18 distinct carry-forward items** with one currently-blocked task (T-045 in REWORK). Issues cluster around three themes: (1) pre-existing test-vs-source layout drift in `packages/db/` (dual schema dirs, dual `__tests__` dirs, absolute symlink), (2) ESLint coverage limited to `apps/web/` only (drift gates from T-025 and T-046 cannot fire on packages outside that directory), and (3) several test-quality items where vacuous-pass tests slipped GREEN review and had to be re-fixed in REWORK (T-009 round 2, T-024 hashPayload). T-045's REWORK is genuinely blocking AC3 (no eslint binary in `packages/db`), and proposed P0 task **T-053** addresses workspace-wide lint scaffolding which simultaneously closes T-045 AC3 and the T-046 known limitation.

## Consolidated carry-forwards

| ID | Source task | Item | Severity | Proposed disposition |
|----|----|----|----|----|
| CF-1 | T-038 | No FK on `tenant_migrations.tenant_id` (PRD says REF organizations(id)); app-layer enforcement is now T-039's contract | P1 | Embed in T-039 (already T-039's responsibility per REVIEW carry-forward note) |
| CF-2 | T-038 | Dual schema directories: `packages/db/schema/` (drizzle.config.ts target) vs `packages/db/src/schema/` (T-038 scope_files). New `tenantMigrations` invisible to drizzle-kit | P1 | New task **T-053** (consolidate db package layout) |
| CF-3 | T-038 | Absolute-path symlink `packages/db/src/migrations -> /home/user/...` breaks on other machines / Windows / CI | P1 | New task **T-053** (subsumes) |
| CF-4 | T-038 | Migration numbering inconsistency: 3-digit dash (`013-tenant-migrations.sql`) vs 4-digit underscore (`0014_r13-placeholder-tables.sql`, `0010_app_role.sql`) — alphabetic sort breaks (`0010` < `002` < `013`) | P0 | New task **T-054** (migration numbering normalization + runner) |
| CF-5 | T-038 | No raw-SQL migration runner. `scripts/migrate.ts` uses `drizzle-kit push` which only applies Drizzle TS schema, NOT the raw `migrations/*.sql` files | P0 | New task **T-054** (subsumes) |
| CF-6 | T-040 | Dead `r13Columns` helper unreferenced in `packages/db/src/schema/r13-business-tables.ts` | P3 | Cleanup as part of **T-053** |
| CF-7 | T-040 | Drizzle `orgId` columns lack `.references()` — FK enforced only at DB level | P2 | Embed in **T-053** |
| CF-8 | T-041 | `navigationPreload` omitted from Serwist constructor (perf, not correctness) | P2 | Add to existing T-042 acceptance criteria |
| CF-9 | T-041 | AC3 NetworkFirst `/api` timeout 10s (`defaultCache`) vs spec 5s | P1 | Add to existing T-042 acceptance criteria |
| CF-10 | T-041 | AC3 offline-fallback E2E deferred to T-042 (already-known) | P1 | Existing T-042 |
| CF-11 | T-046 | ESLint drift gate only fires in `apps/web/`. `lib/`, `packages/db`, `packages/outbox`, `packages/gs1`, `packages/sync-queue`, `packages/schema-runtime`, `packages/rule-engine`, `packages/server` have no lint scripts and no ESLint config | P0 | New task **T-053** (workspace-wide lint scaffolding) |
| CF-12 | T-022 | `smoke.test.ts` excluded from `pnpm --filter web test` script (pre-existing failure carry-forward; needs live dev server) | P2 | New task **T-055** (smoke test as Playwright E2E or remove) |
| CF-13 | T-024 | Local-mirror drift between test `canonicalStringify` and production `canonicalStringify` in `idempotent.ts` | P3 | Tech debt note — accept as-is (integration tests catch divergence) |
| CF-14 | T-025 | Dialog.Portal removed from Modal for RTL test compatibility — production z-index/stacking regression | P1 | New task **T-056** (Modal portal restoration + Storybook + Playwright a11y) |
| CF-15 | T-025 | Storybook + `test:a11y` script absent — AC3 axe-core CI scan deferred to jest-axe RTL fallback | P1 | New task **T-056** (subsumes) |
| CF-16 | T-025 | `packages/ui/tsconfig.json` excludes `src/__tests__/` and `test/` due to pnpm symlink moduleResolution quirk | P3 | Embed in **T-056** |
| CF-17 | T-017 | `VITEST` env-var schema routing in `compile.ts` (test concern in production code) | P1 | New task **T-057** (compile.ts pool injection) |
| CF-18 | T-008 | `Queue` exported as abstract class instead of TS interface (runtime check workaround) | P3 | Tech debt — accept |
| CF-19 | T-045 | `getAppConnection` rewrites `DATABASE_URL` username to `app_user` with hardcoded password fallback `'app_user_test_password'` | P0 | T-045 REWORK already-required (in flight) |
| CF-20 | T-045 | AC3 BLOCKED — no eslint binary or lint script in `packages/db`; root `pnpm lint` skips packages/db | P0 | T-045 REWORK + **T-053** workspace lint task (mutually reinforcing) |
| CF-21 | T-045 | AC2 missing SELECT-0-rows RLS-enforcement test | P0 | T-045 REWORK already-required |
| CF-22 | T-045 | AC4 not enforced — pre-existing integration tests use direct `pg.Pool` superuser, not `getAppConnection()` | P0 | New task **T-058** (migrate integration tests to getAppConnection) |
| CF-23 | T-045 | `0010_app_role.sql` sorts before `002-rls-baseline.sql` alphabetically — latent ordering hazard | P0 | **T-054** (migration normalization) |
| CF-24 | T-045 | `0010_app_role.sql` not actually applied to test DB (no SQL runner) | P0 | **T-054** |
| CF-25 | T-047 | 87 pre-existing unmarked headings in `00-FOUNDATION-PRD.md` | P2 | New task **T-059** (PRD marker-discipline sweep) |
| CF-26 | T-047 | §9.1 DSL JSON snippet contains `//` comment (not strict JSON) | P3 | Optional — fix if PRD JSON linter ever runs |
| CF-27 | T-009 | 2 REWORK rounds (impersonation guard test was vacuously true; UPDATE/DELETE tests vacuously true; trigger needed SECURITY DEFINER added) | meta | Process signal — see "Sequencing" |
| CF-28 | T-024 | 1 REWORK round (hashPayload nested-object drop violated AC2 silently; missing GRANT TO app_user) | meta | Process signal — see "Sequencing" |
| CF-29 | T-025 | 1 REWORK round (AC2 ESLint not implemented at GREEN) | meta | Process signal |
| CF-30 | T-046 | 1 REWORK round (AC3 ESLint not implemented at GREEN — RED notes incorrectly said "GREEN phase task") | meta | Process signal — RED-note discipline |
| CF-31 | T-023 | T-023.json AC3 spec contains arithmetically-wrong SSCC vector (correct check digit is 9, not 6) — task spec bug | P3 | Fix in T-023.json (one-line edit, can be done in T-052) |

REWORK cycle distribution (process signal): T-008 (0), T-009 (**2**), T-010 (0), T-017 (0), T-018 (0), T-019 (0 — T5-seed RED skipped), T-022 (0), T-023 (0), T-024 (1), T-025 (1), T-038 (0), T-040 (0), T-041 (0), T-043 (0), T-045 (in REWORK now — call it 1+), T-046 (1), T-047 (0). **5 of 17 tasks (29%) needed at least one rework cycle.** All rework triggers were either (a) RED-test vacuousness, or (b) missing AC implementation. No reviewer reversed a PASS verdict. The 2-round T-009 cycle is the highest-friction case and signals reviewer-pressure on impersonation/RLS tests.

## Proposed new tasks (T-053..T-059)

### T-053 — Consolidate `packages/db/` layout: single schema dir, single `__tests__` dir, no symlinks
- **Severity**: P0 (Wave-B blocker — drizzle-kit will diff against the wrong schema, and Wave B brings new tables in T-020/T-021/T-035/T-038/T-039 that must be discoverable)
- **ACs**:
  - AC1: Exactly one Drizzle schema directory exists (`packages/db/schema/` per existing `drizzle.config.ts`); all files from `packages/db/src/schema/` consolidated there or `drizzle.config.ts` updated with both paths and re-export through one barrel
  - AC2: Exactly one integration-test directory (`packages/db/__tests__/` OR `packages/db/src/__tests__/`); existing tests merged into the chosen path
  - AC3: `packages/db/src/migrations` symlink removed; tests resolve `migrations/` via relative `path.resolve(__dirname, '../../migrations')` or single canonical `packageRoot`
  - AC4: `drizzle-kit generate` and `drizzle-kit push` discover all consolidated tables without warning (run them in CI dry-run)
  - AC5: `r13Columns` dead helper removed; Drizzle `orgId` columns gain `.references(() => organizations.id)` annotations
- **scope_files**:
  - `packages/db/schema/index.ts` [modify or create barrel]
  - `packages/db/schema/tenant-migrations.ts` [move from src/schema/]
  - `packages/db/schema/r13-business-tables.ts` [move from src/schema/]
  - `packages/db/__tests__/*.test.ts` [consolidate]
  - `packages/db/drizzle.config.ts` [verify schema path]
  - `packages/db/src/migrations` [delete symlink]
- **dependencies**: T-038, T-040 (both must be ✅ DONE — they are)
- **why now**: Wave B introduces ManufacturingOperations (T-020/T-021), workflow rules (T-035), canary actions (T-039) — all need clean Drizzle discovery. Defer = compounding debt.

### T-054 — Migration numbering normalization + raw-SQL runner
- **Severity**: P0 (Wave-B blocker — without a raw-SQL runner, T-045's `0010_app_role.sql` cannot be applied, and any new migration faces sort-order ambiguity)
- **ACs**:
  - AC1: All migration files renamed to one canonical convention (recommend `NNN-name.sql` 3-digit dash to match T-006/T-007/T-008/T-009/T-010/T-017/T-018/T-019/T-038); `0014_r13-placeholder-tables.sql` → `014-r13-placeholder-tables.sql`; `0010_app_role.sql` → `006-app-role.sql`
  - AC2: A raw-SQL migration runner script exists (`scripts/migrate-sql.ts` or extend existing `scripts/migrate.ts`) that applies `migrations/*.sql` in numeric order using `pg` directly
  - AC3: Runner records applied migrations in a `schema_migrations` table (filename + applied_at)
  - AC4: Idempotent re-run is safe (skip already-applied)
  - AC5: All test files referencing old filenames updated; `pnpm --filter @monopilot/db test:integration` passes against a fresh DB after running the runner
- **scope_files**: `packages/db/migrations/*.sql` [rename], `scripts/migrate-sql.ts` [create], `packages/db/__tests__/*.test.ts` [update file references], `STATUS.md` migration ordering lock section [update]
- **dependencies**: T-053 (clean layout first)
- **why now**: T-045 cannot complete without this; Wave B is full of new migrations that will inherit the inconsistency.

### T-055 — Workspace-wide ESLint coverage (close T-025 + T-046 lint gaps)
- **Severity**: P0 (drift gates from T-025 `no-restricted-imports @radix-ui/react-dialog` and T-046 `no-restricted-syntax Reference.*` are LOAD-BEARING but currently fire only in `apps/web/`)
- **ACs**:
  - AC1: A single `eslint.config.mjs` at workspace root (or per-package configs that all extend a shared `tooling/eslint/base.mjs`) covers `packages/**`, `lib/**`, and `apps/**`
  - AC2: `pnpm lint` (root) lints the entire monorepo, not just `apps/web/`
  - AC3: T-025's `no-restricted-imports @radix-ui/react-dialog` rule fires on a violation placed in `packages/server/` or `packages/db/` (not just `apps/web/`)
  - AC4: T-046's `no-restricted-syntax Literal[value=/^Reference\./]` rule fires on a violation in `packages/db/` outside `lib/reference/`
  - AC5: `packages/db/.eslintrc.cjs` (T-045 REWORK input) is migrated to flat config OR `packages/db` gets its own `eslint.config.mjs` consistent with workspace pattern; T-045 AC3 is now genuinely verifiable
  - AC6: `packages/{outbox,gs1,sync-queue,schema-runtime,rule-engine,server,ui}` each have a `lint` script that participates in `pnpm -r lint`
- **scope_files**: `eslint.config.mjs` [create at root or `tooling/eslint/`], `packages/*/package.json` [add lint script], `apps/web/eslint.config.mjs` [refactor to extend shared]
- **dependencies**: none (parallel-safe with T-053/T-054)
- **why now**: Two architectural drift gates already in scope are mechanically broken. Subsequent tasks adding new ESLint rules (Wave B will need more) will compound the broken pattern.

### T-056 — UI test infra completion: Storybook + Playwright a11y + Modal portal restoration
- **Severity**: P1 (T-025 AC3 has documented fallback; T-026..T-031 will inherit the same gap and amplify)
- **ACs**:
  - AC1: Storybook configured for `packages/ui/` (`.storybook/` dir + `package.json` storybook scripts)
  - AC2: Modal stories cover all 4 size variants (sm/md/lg/xl)
  - AC3: Playwright + axe-core configured; `pnpm --filter @monopilot/ui test:a11y` runs axe scan over Storybook stories and exits non-zero on violations
  - AC4: Modal restored to use `Dialog.Portal` (use Storybook play-functions for tests; or use `screen.getByRole('dialog')` + `document.body` queries in RTL instead of `container.querySelector`)
  - AC5: `packages/ui/tsconfig.json` re-includes `src/__tests__/` and `test/` once the pnpm symlink moduleResolution quirk is resolved (likely by switching `moduleResolution: 'bundler'` → `'NodeNext'` for tests)
- **scope_files**: `packages/ui/.storybook/main.ts` [create], `packages/ui/.storybook/preview.tsx` [create], `packages/ui/src/Modal.stories.tsx` [create], `packages/ui/src/Modal.tsx` [restore Dialog.Portal], `packages/ui/playwright.config.ts` [create], `packages/ui/package.json` [add storybook + test:a11y scripts]
- **dependencies**: T-025 (✅ DONE)
- **why now**: T-026..T-031 each need a Storybook + a11y harness to land cleanly; building it once after T-025 is cheaper than retrofitting 7 primitives.

### T-057 — `packages/schema-runtime/compile.ts` test/prod separation
- **Severity**: P1 (test concern in production code is a quality signal; will be touched again in T-035 and T-036)
- **ACs**:
  - AC1: `compile.ts` no longer reads `process.env.VITEST`
  - AC2: Module exports `_setPool(pool: Pool, schemaName?: string)` and `_clearPool()` (underscore-prefixed test injection points)
  - AC3: Existing test in `packages/schema-runtime/src/__tests__/compile.test.ts` migrates to call `_setPool` in `beforeAll`
  - AC4: Production behavior unchanged: `"Reference"` schema accessed by default; cache key remains `${orgId}:${schemaVersion}`
- **scope_files**: `packages/schema-runtime/src/compile.ts` [modify], `packages/schema-runtime/src/__tests__/compile.test.ts` [migrate]
- **dependencies**: T-017 (✅ DONE)
- **why now**: T-035 (workflow executor) and T-036 (admin UI server actions) will both call `compile()`; cleaning the API once is cheaper.

### T-058 — Migrate `packages/db/__tests__/*` integration tests to `getAppConnection()`
- **Severity**: P0 (T-045 AC4 explicitly requires "every test connects via getAppConnection()" — currently zero existing tests do)
- **ACs**:
  - AC1: All integration tests in `packages/db/__tests__/` and `packages/db/src/__tests__/` use `getAppConnection()` for app-role assertions and `getOwnerConnection()` only for setup/teardown DDL
  - AC2: A grep guard or ESLint rule (could land in T-055) blocks `new pg.Pool({connectionString: process.env.DATABASE_URL})` in test files outside `getOwnerConnection`'s implementation
  - AC3: Existing test count remains green (no regressions)
- **scope_files**: `packages/db/__tests__/baseline.integration.test.ts`, `packages/db/__tests__/rls.cross-org.integration.test.ts`, `packages/db/__tests__/audit.integration.test.ts`, `packages/db/__tests__/tenant-idp-config.integration.test.ts`, `packages/db/__tests__/departments.integration.test.ts`, `packages/db/__tests__/r13-business-tables.test.ts`, `packages/db/src/__tests__/tenant-migrations.test.ts`, `packages/db/src/__tests__/app-role.test.ts`
- **dependencies**: T-045 (REWORK PASS), T-053 (consolidated layout), T-054 (runner can apply 0010_app_role.sql)
- **why now**: T-045 cannot truly close without this, and Wave B adds 5+ new integration test files that will inherit the wrong pattern.

### T-059 — PRD marker-discipline sweep (00-FOUNDATION-PRD.md, 87 unmarked headings)
- **Severity**: P2 (does not block Wave B implementation; does block §1/§2 marker-discipline ADR compliance)
- **ACs**:
  - AC1: `node scripts/check-markers.mjs docs/prd/00-FOUNDATION-PRD.md` exits 0 (zero unmarked headings)
  - AC2: All 87 currently-unmarked headings receive their correct one of 4 PRD markers ([UNIVERSAL], [CRITICAL], [DEFERRED], [LEGACY])
  - AC3: Marker assignments reviewed against §1/§2 marker discipline ADR
- **scope_files**: `docs/prd/00-FOUNDATION-PRD.md`
- **dependencies**: T-005 (marker ADR — ✅ DONE), T-047 (Wave0 amendments — ✅ DONE)
- **why now**: Pre-existing debt; no functional impact. Can land any time before Wave-D documentation freeze.

## Items recommended for explicit OUT-OF-SCOPE

| Item | Source | Justification |
|------|--------|---------------|
| `Queue` exported as abstract class instead of TS interface (T-008 / CF-18) | T-008 review | Necessary runtime workaround for RED-test runtime check; zero behavioral impact; renaming would break test contract |
| Local-mirror drift in `idempotent.test.ts` for `canonicalStringify` (T-024 / CF-13) | T-024 re-review | Integration tests calling real `withIdempotency` are authoritative and would catch divergence; cosmetic |
| §9.1 DSL JSON `//` comment (T-047 / CF-26) | T-047 review | Snippet is illustrative pseudo-code, not executed JSON; `//` carries [LEGACY-D365] context that would be lost if stripped |
| `process.env.NODE_ENV` build-time inlining in RegisterSW.tsx | T-041 review | Webpack-correct behavior; both branches verified; not a defect |
| T-023 GRAI/GDTI test vectors with arithmetically wrong check digits (RED notes) | T-023 review minor | Tests exercise length/format paths only, not `valid=true` claim; non-blocking and can be improved opportunistically |
| 87 pre-existing unmarked PRD headings as a Foundation-blocker | T-047 deviation | Folded into proposed T-059; not an ACP-readiness blocker |

## Recommended sequencing

**Pre-Wave-B blockers (must resolve before T-020/T-021/T-035/T-039 start):**
1. **T-054** (migration numbering + raw-SQL runner) — without this, no new SQL migration can be applied; T-045 cannot finish
2. **T-053** (consolidate db layout) — runs in parallel with T-054; both feed into T-058
3. **T-045 REWORK** (in flight; must reach PASS) — depends on T-054 completion
4. **T-055** (workspace-wide ESLint) — drift gates need to actually fire before more rules pile up; parallel-safe with T-053/T-054

**Wave-B-concurrent (can run during T-020..T-039):**
5. **T-058** (migrate tests to getAppConnection) — depends on T-045+T-054 PASS
6. **T-057** (compile.ts pool injection) — schema-runtime cleanup before T-036/T-037 land
7. **T-056** (Storybook + Playwright a11y + Modal portal) — must land before T-031 (10 MODAL-SCHEMA pattern templates) so all primitives can story+a11y at landing time. Recommend during T-026 work.

**Deferrable (post-Wave-B):**
8. **T-059** (PRD marker-discipline sweep) — pure docs hygiene; no implementation dependency

**Suggested orchestrator move**: Insert T-053, T-054, T-055 as a fast 3-task pre-Wave-B sweep (label them collectively "Wave A.5 — infra normalization"). T-053 and T-055 are parallel-safe; T-054 depends on T-053 finishing first because the runner script needs the consolidated layout.

## Reply

- **Number of new tasks proposed**: 7 (T-053 through T-059)
- **Severity rollup**:
  - P0: **4** (T-053 db layout, T-054 migration runner, T-055 workspace lint, T-058 test migration to getAppConnection)
  - P1: **2** (T-056 UI test infra, T-057 schema-runtime pool injection)
  - P2: **1** (T-059 PRD marker sweep)
  - P3: **0** as standalone tasks (all P3 items folded into proposed tasks or accepted as out-of-scope)
- **Wave-B blockers**: **YES, 4 P0 items must block Wave B start.**
  - T-054 (migration runner) is hard-blocking: T-045 cannot reach PASS without it, and any new T-020/T-035/T-038-style migration will inherit the unsorted-numbering hazard.
  - T-053 (db layout) is hard-blocking: drizzle-kit currently doesn't see `tenantMigrations` or `r13-business-tables`; new Wave B tables would compound invisibility.
  - T-058 (getAppConnection migration) is required for T-045's AC4 truthfulness.
  - T-055 (workspace lint) is soft-blocking: not a runtime blocker but the T-025 and T-046 architectural drift gates are mechanically broken right now.
- **Process signal**: 5 of 17 reviewed tasks needed REWORK (29%). T-009 (2 rounds) and T-024 (1 round) shared the same failure mode — vacuously-passing tests slipping GREEN review. T-025 and T-046 shared the same failure mode — the GREEN agent skipped an AC that the JSON spec required. Recommend tightening RED-phase test design (every assertion must be paired with a "would this fail if the contract were broken?" justification) and tightening reviewer scrutiny of AC count vs scope_files count at REVIEW time.
