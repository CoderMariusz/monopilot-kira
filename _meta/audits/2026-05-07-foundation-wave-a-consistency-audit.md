# Foundation Wave A — Cross-Cutting Consistency Audit (2026-05-07)

Auditor: Opus DEEP-REVIEWER
Scope: 21/52 atomic tasks completed in 00-foundation. Each task was reviewed in isolation; this audit looks for cross-task drift.

---

## Executive summary

**Severity rating: AMBER (trending RED if the migration runner is exercised before fixes land).**

Three structural issues stand out:

1. **No real migration runner.** `packages/db/scripts/migrate.ts` shells out to `drizzle-kit push`, which diff-applies a TypeScript schema, not the 12 hand-written SQL files. The hand-written `*.sql` migrations have **never been auto-applied** by the existing tooling. They are loaded ad-hoc by integration tests via `readFileSync`. This silently invalidates Concern A from the T-045 review and means most "applied to test DB" assertions are vacuous in CI.
2. **Migration-filename ordering hazard is real.** Under any lexicographic sort the order is `001, 0010, 0014, 002, 003, 004, 005, 009, 010, 011, 013, 015`. `0010_app_role.sql` would run **before** `002-rls-baseline.sql` (which creates `app.current_org_id`), and `0014_r13-placeholder-tables.sql` would run before `002` *and* `004`. Today this is masked because no runner sorts them; if the team ever introduces a generic sort-and-apply runner this corrupts state.
3. **Dual schema directories are a latent drizzle-kit gap.** `drizzle.config.ts` points at `./schema` (which only re-exports `{}` after T-038's split), so `tenantMigrations`, `lot`, `workOrder`, etc. are **invisible to drizzle-kit diff/push**. Combined with finding 1, drizzle-kit push would apply a schema that does not include the new tables and would not silently break anything — but it also won't help.

There are several smaller-but-real findings (RLS on the orchestration `tenant_migrations` table is intentionally absent — clearly documented; ESLint coverage is `apps/web` + `packages/db` only; tests still mostly use superuser pools). None block Wave A as already shipped, but several should be fixed before Wave B starts adding tasks that depend on a working migration pipeline (T-039 canary upgrade, T-034 schema drift detection).

---

## Findings by section

### A. Migration ordering & numbering consistency — **P0**

Evidence:
- `packages/db/migrations/` directory listing — 12 SQL files, two distinct naming conventions:
  - `NNN-name.sql`: `001-baseline`, `002-rls-baseline`, `003-outbox`, `004-audit`, `005-tenant-idp-config`, `009-schema-driven`, `010-rules`, `011-departments`, `013-tenant-migrations`, `015-idempotency` (10 files).
  - `NNNN_name.sql`: `0010_app_role.sql`, `0014_r13-placeholder-tables.sql` (2 files — both authored after T-038 by a different convention).
- Lexicographic sort: `001-baseline.sql, 0010_app_role.sql, 0014_r13-placeholder-tables.sql, 002-rls-baseline.sql, 003-outbox.sql, ...`. Confirmed by `ls | sort`.
- `0010_app_role.sql` lines 65–67 GRANT on `public.tenants/organizations/users` — fine, those exist after 001.
- `0010_app_role.sql` does NOT depend on `app.current_org_id()` — only roles + GRANT + FORCE RLS. Safe.
- `0014_r13-placeholder-tables.sql` lines 31, 60, 89, 117, 146 reference `app.current_org_id()` (created in `002-rls-baseline.sql`) and `app_user` role (created/granted by 002 and 0010). **If a sort-by-filename runner applies in lex order, `0014` runs before `002` and CREATE POLICY fails because `app.current_org_id()` does not exist.**
- `packages/db/scripts/migrate.ts` runs `drizzle-kit push` only — does not apply raw SQL. Hand-written SQL files are loaded by individual tests via `readFileSync` in test setup, in a manually chosen order.
- Numbering gaps: 006/007/008 are unassigned (T-011/T-012/T-013 — Supabase Auth/SAML/SCIM — are pending). 012 is reserved for T-020 (manufacturing-operations, pending). 014 was claimed by both T-038's `0014_r13-placeholder-tables.sql` (4-digit form) and the implicit "014 r13-placeholder-tables (T-040)" line in STATUS.md. T-040 picked the 4-digit form despite T-038 demonstrating the 3-digit-dash form. T-024's `015-idempotency.sql` jumped over `013` because that slot was already claimed by T-038 (documented in `015-idempotency.sql` line 4).
- Recommendation/severity: **P0** — rename `0010_app_role.sql` → `006-app-role.sql` and `0014_r13-placeholder-tables.sql` → `014-r13-placeholder-tables.sql` to restore monotonic ordering. Add a real SQL migration runner (e.g., `node-pg-migrate` or a 30-line custom runner that sorts by the leading numeric prefix and tracks applied migrations in a `schema_migrations` table). T-039's canary-upgrade orchestration directly depends on a real SQL runner; this cannot wait.

### B. Schema directory split — **P1**

Evidence:
- `packages/db/schema/baseline.ts` (87 lines): drizzle definitions for `tenants`, `organizations`, `users`. Exports `tenants`, `organizations`, `users`.
- `packages/db/schema/index.ts` (1 line): `export {};`. Empty barrel.
- `packages/db/src/schema/index.ts` (2 lines): re-exports `tenantMigrations`, `lot`, `workOrder`, `qualityEvent`, `shipment`, `bomItem`.
- `packages/db/src/schema/tenant-migrations.ts` and `r13-business-tables.ts`: drizzle definitions for the new tables.
- `drizzle.config.ts` line 11: `schema: './schema'`. Points at the OLD directory — which exports nothing useful through its index. drizzle-kit therefore sees the file system inside `./schema` (it does walk the directory) and picks up `baseline.ts`'s exports, but it does NOT pick up anything in `./src/schema/`. The new tables are invisible to drizzle-kit diff/push.
- `packages/db/lib/client.ts` line 3: `import * as schema from '../schema';` — also bound to the old directory. Drizzle's `db` object therefore has no typed access to `tenantMigrations`, `lot`, etc.
- `packages/db/src/migrations` is a SYMLINK to `../migrations` (absolute path: `/home/user/monopilot-kira/packages/db/migrations`). Confirmed by `ls -la`. Documented as carry-forward in T-038. The absolute-path target is fragile (will break on any clone path other than `/home/user/monopilot-kira` and on Windows without `core.symlinks=true`).
- Recommendation/severity: **P1** — converge on one of two options:
  - (preferred) Make `packages/db/schema/index.ts` a barrel that re-exports from `../src/schema/*` (or delete `./schema` entirely and update `drizzle.config.ts` + `lib/client.ts` to point at `./src/schema`).
  - Update `drizzle.config.ts.schema` to `['./schema', './src/schema']` (drizzle-kit accepts an array since 0.20.x).
  Convert the symlink to a relative path (`ln -s ../migrations packages/db/src/migrations`) or eliminate the need by adjusting test `packageRoot` resolution.

### C. Client/connection layering — **P1**

Evidence:
- `packages/db/lib/client.ts`: legacy `db` export. Reads `DATABASE_URL` directly, does NOT rewrite to `app_user`. If `DATABASE_URL` points at a superuser (which it does in CI today), `db.*` queries run as superuser and bypass RLS.
- `packages/db/src/clients.ts`: T-045's new layered clients. `getAppConnection()` rewrites `DATABASE_URL` to `app_user` with hardcoded password fallback `'app_user_test_password'` when `DATABASE_URL_APP` is unset (lines 21–24). `getOwnerConnection()` returns superuser pool (line 41).
- `packages/db/src/index.ts`: re-exports only `getAppConnection`. `getOwnerConnection` deliberately gated.
- The 8 integration test files in `packages/db/__tests__/` ALL use `new pg.Pool({ connectionString: databaseUrl })` directly — confirmed via grep on `baseline.integration.test.ts:46`, `audit.integration.test.ts:67`, `r13-business-tables.test.ts:204`, etc. Only `src/__tests__/app-role.test.ts` uses `getAppConnection`. The "every test connects via getAppConnection()" AC4 from T-045 is **not** met for any pre-existing test; this was flagged in the T-045 REVIEW as PARTIAL but the REWORK never happened (T-045 still PENDING in STATUS.md).
- The legacy `db` export is still imported at the package boundary (`packages/db/package.json:main: ./lib/client.ts`). Any package that imports `@monopilot/db` and uses `.db` gets the superuser pool.
- Recommendation/severity: **P1** — finish T-045: migrate the 8 legacy tests to `getAppConnection()`, add the AC2 "0-rows without org context" RLS-enforcement test, and either (a) delete `packages/db/lib/client.ts` and re-point `package.json:main` to `./src/index.ts`, or (b) make `db` in `lib/client.ts` use `app_user` credentials. Add an env-guard to `getAppConnection` so the `'app_user_test_password'` fallback throws unless `NODE_ENV=test`.

### D. RLS pattern uniformity — **P2**

Evidence (per migration):
- `001-baseline.sql`: NO RLS (correct — owned by 002).
- `002-rls-baseline.sql`: ENABLE + FORCE RLS on `organizations`, `users`. Policies use `id = app.current_org_id()` (organizations) and `org_id = app.current_org_id()` (users). REVOKE on `tenants`. Standard.
- `003-outbox.sql` (lines 39–48): ENABLE + FORCE RLS on `outbox_events` with `org_id = app.current_org_id()`. ✓
- `004-audit.sql` (lines 95–104): ENABLE + FORCE RLS on `audit_events` with `org_id = app.current_org_id()`. ✓ Plus REVOKE UPDATE/DELETE.
- `005-tenant-idp-config.sql` (line 58): NO RLS, REVOKE all from `app_user`. **Control-plane only — intentional and correct** (mirrors `tenants` pattern).
- `009-schema-driven.sql` (lines 188–220): ENABLE + FORCE on `FieldTypes`, `DeptColumns`, `Formulas`. `FieldTypes` uses `using (true)` (universal-read), the other two use `org_id = app.current_org_id()`. ✓
- `010-rules.sql` (lines 99–108): ENABLE + FORCE RLS on `Rules` with `org_id = app.current_org_id()`. ✓
- `011-departments.sql`: **No RLS clause at all** for `Reference.Departments`. The table has `org_id` and seeds use `org_id = Apex`, but `enable row level security` / `force row level security` / `create policy` statements are absent. (Lines 13–39 of the migration — verified.) This is an **outlier**.
- `013-tenant-migrations.sql`: NO RLS. **Intentional and correct** — orchestration control-plane table, not org-scoped.
- `0010_app_role.sql` (lines 70–76): re-applies ENABLE + FORCE on `tenants`/`organizations`/`users`. The ENABLE/FORCE on organizations/users is redundant with 002 (idempotent in PG, no error). The ENABLE/FORCE on `tenants` is the new contribution. Note: there are no `CREATE POLICY` statements for `tenants` — it has FORCE RLS but no policies, which means `app_user` (who has been REVOKEd from tenants in 002) cannot SELECT anything. Acceptable defense-in-depth.
- `0014_r13-placeholder-tables.sql`: ENABLE + FORCE + policies on all 5 tables, all with `org_id = app.current_org_id()`. ✓
- `015-idempotency.sql` (lines 23–32): ENABLE + FORCE + policy `org_id = app.current_org_id()`. ✓
- Recommendation/severity: **P2** — add ENABLE + FORCE RLS + policy to `Reference.Departments` in `011-departments.sql`. The Apex seed pattern means cross-org SELECT could leak Apex's department list to any authenticated user; the table is also writable, so the leak surface is non-trivial.

### E. ESLint coverage — **P1**

Evidence:
- Only two ESLint configs in the repo: `apps/web/eslint.config.mjs` (flat v9) and `packages/db/.eslintrc.cjs` (legacy v8 format).
- Root `package.json`: `"lint": "pnpm --filter web lint"`. Lints **only** `apps/web`. Confirmed in T-045 REVIEW concern #4 ("BLOCKING").
- The T-046 `Reference.*` literal-drift rule lives in `apps/web/eslint.config.mjs` lines 29–37. It will catch hardcoded literals only inside `apps/web`.
- The T-025 `@radix-ui/react-dialog` import-restriction lives in the same flat config, lines 41–58. Same scoping issue.
- The T-045 `getOwnerConnection` import restriction lives in `packages/db/.eslintrc.cjs`. ESLint v9 (which apps/web uses) cannot read `.eslintrc.cjs` without `ESLINT_USE_FLAT_CONFIG=false`. There is no `eslint` dependency or `lint` script in `packages/db/package.json`. **The rule never runs.** T-045 REVIEW already flagged this as BLOCKING; T-045 status is PENDING.
- Existing drift confirmed: `packages/schema-runtime/src/compile.ts` lines 39 and 46 contain hardcoded string literals `"Reference.DeptColumns"` and `"Reference.FieldTypes"`. These are exactly what T-046's rule was meant to prevent. They sit in a package that ESLint never lints.
- Eight other packages (`outbox`, `rbac`, `rule-engine`, `schema-runtime`, `server`, `sync-queue`, `gs1`, `ui`) have no lint config.
- Recommendation/severity: **P1** — convert `packages/db/.eslintrc.cjs` to flat v9 (`packages/db/eslint.config.mjs`), add a root-level flat config that applies the T-025/T-046/T-045 rules across the entire workspace, change root `lint` script to `eslint .` (or per-package fan-out via pnpm). Track separately the `Reference.*` literals already drifting in `schema-runtime`.

### F. Test infrastructure split — **P2**

Evidence:
- Two test directories under `packages/db`: `__tests__/` (8 files, all old-pattern direct-Pool tests) and `src/__tests__/` (2 files, T-038 + T-045).
- Root `vitest.config.ts` line 5: no `include` or `exclude` patterns. Vitest defaults pick up `**/*.test.ts` everywhere, so both directories are visible to a workspace-level run.
- `packages/db/package.json` script: `"test": "vitest run"` — runs from `packages/db` cwd, picks up both `__tests__` and `src/__tests__` (vitest defaults).
- Verified: `pnpm --filter @monopilot/db test` exercises both directories. So no silent skip in CI.
- Note: `vitest.config.ts` at the root has alias `'@monopilot/*': path.resolve(__dirname, 'packages/*/src')`. T-038's tests under `src/__tests__` import `../schema/tenant-migrations.js` (relative). T-045's tests import `../../src/clients` (relative). Both work with current cwd-based resolution. No drift hazard at test time.
- Recommendation/severity: **P2** — consolidate into one test directory before tests sprawl further. Either move all `__tests__` under `src/__tests__` (consistent with the new `src/` layout) or move all under top-level `__tests__`. Don't ship Wave B with both.

### G. Migration filename collision — see Section A

The collision concern in the brief is moot in lex sort: `0010_app_role.sql < 010-rules.sql` because `0` (0x30) < `1` (0x31) at position 3. Lex sort gives:
`0010_app_role, 010-rules`. So `app_role` does precede `rules`, which is the intended dependency order.

But the broader sort order (Section A) puts `0010_app_role` BEFORE `002-rls-baseline`, which is the actual problem. Severity rolled into Section A finding.

---

## Recommended new tasks

### T-053 — SQL migration runner with monotonic ordering [P0]
- **Scope:** Replace `packages/db/scripts/migrate.ts`'s drizzle-kit shim with a real runner that (a) reads `migrations/*.sql` sorted by leading numeric prefix (`/^(\d+)/`), (b) records applied migrations in `public.schema_migrations(version, applied_at)`, (c) is idempotent, (d) runs as `getOwnerConnection()`. Rename `0010_app_role.sql` → `006-app-role.sql` and `0014_r13-placeholder-tables.sql` → `014-r13-placeholder-tables.sql`. Update the two `readFileSync` test sites to follow the new names.
- **ACs:** runner applies all 12 migrations in numeric order on a fresh DB; second `pnpm db:migrate` is a no-op; `tenant_migrations`, `r13-business-tables` policies create cleanly because `002-rls-baseline` has run first.
- **Why now:** T-039 (canary upgrade orchestration) cannot proceed without a real runner. Wave B-blocking.

### T-054 — Drizzle schema convergence [P1]
- **Scope:** Either delete `packages/db/schema/` and point `drizzle.config.ts` + `lib/client.ts` at `./src/schema/` (with `baseline.ts` moved across), OR add a re-export layer so `./schema/index.ts` exposes everything from `./src/schema/`. Update `drizzle.config.ts.schema` to include both directories during the transition. Convert the absolute-path symlink at `packages/db/src/migrations` to a relative-path symlink (or remove it by fixing test `packageRoot` resolution).
- **ACs:** `drizzle-kit generate` and `drizzle-kit push` see all 8 tables (tenants, organizations, users, tenantMigrations, lot, workOrder, qualityEvent, shipment, bomItem). The legacy `db` export from `lib/client.ts` resolves the same schema set OR is removed entirely.
- **Why now:** Without this, drizzle-kit is half-blind, and any new task that adds a Drizzle table will accumulate the same gap.

### T-055 — Workspace-wide ESLint with universal drift gates [P1]
- **Scope:** Add a root `eslint.config.mjs` that applies the T-046 (`Reference.*` literal), T-025 (`@radix-ui/react-dialog`), and T-045 (`getOwnerConnection`) rules across all packages. Add `eslint` as a root devDependency. Change root `package.json:lint` to `eslint . --max-warnings=0`. Convert `packages/db/.eslintrc.cjs` to flat v9 or remove (rules absorbed into root config). Apps and packages that need overrides keep their own flat configs that extend the root.
- **ACs:** `pnpm lint` errors on a deliberate `Reference.DeptColumns` literal in `packages/schema-runtime/src/compile.ts` (which is the existing drift to fix). `pnpm lint` errors on `getOwnerConnection` imported outside `packages/db/src/migrations/**` and `packages/db/scripts/migrate.ts`. `pnpm lint` errors on `@radix-ui/react-dialog` imported outside `packages/ui/**`.
- **Why now:** Three drift gates have been individually shipped but none runs in CI for any package other than apps/web. Real drift already exists in `schema-runtime`. Wave B will add packages/server endpoints that need the rules to be active.

### T-056 — Reference.Departments RLS hardening [P2]
- **Scope:** Amend `011-departments.sql` to add `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + `CREATE POLICY departments_org_context FOR ALL TO app_user USING (org_id = app.current_org_id()) WITH CHECK (org_id = app.current_org_id())`. Add cross-org isolation test in `__tests__/departments.integration.test.ts`.
- **ACs:** SELECT * FROM "Reference"."Departments" returns 0 rows for app_user without org context; returns only Apex's 7 rows when `app.set_org_context` is set to Apex's org_id.
- **Why now:** Single missing-RLS table in Wave A. Cheap to fix. Prevents pattern erosion as more `Reference.*` tables land.

### T-057 — Tests-as-app-user migration [P1] (subsumes T-045's open carry-forward)
- **Scope:** Migrate the 8 pre-existing integration tests under `packages/db/__tests__/` from `new pg.Pool({connectionString: DATABASE_URL})` (superuser) to `getAppConnection()` (app_user). For tests that legitimately need DDL or seed inserts that violate RLS, use `getOwnerConnection()` for setup and `getAppConnection()` for assertions. Add an ESLint rule (in T-055's config) blocking `new pg.Pool` outside `clients.ts` and migration scripts.
- **ACs:** All `packages/db` integration tests pass with app_user; superuser pool is used only in beforeAll/afterAll setup blocks via `getOwnerConnection()`.
- **Why now:** T-045 was reviewed REWORK and remains PENDING. AC4 ("every test connects via getAppConnection()") is unmet. Closes the audit-trail gap.

### T-058 — Test directory consolidation [P2]
- **Scope:** Move all `packages/db/__tests__/*.test.ts` under `packages/db/src/__tests__/` (or vice-versa, whichever the team prefers). Update vitest include patterns if needed.
- **ACs:** One test directory; both old test files run identically; CI green.
- **Why now:** Cosmetic but cheap; keeps Wave B from forking the layout further.

---

## Acceptable carry-forwards

- **T-038 absolute-path symlink** at `packages/db/src/migrations`: low-severity (CI runs at `/home/user/...`), but bundle into T-054.
- **`tenant_migrations` no FK to `organizations`**: documented in T-038 review concern #1 with explicit T-039 application-layer enforcement requirement. Acceptable.
- **`tenant_migrations` no RLS**: control-plane orchestration table, not org-scoped. Correct by design.
- **`tenants` has FORCE RLS but no policies after 0010**: defense-in-depth. `app_user` is REVOKEd anyway. Acceptable.
- **`getAppConnection` hardcoded test password fallback**: acceptable in CI; T-045 review noted "should be guarded with an env-guard against production use." Bundle this into T-057 (env-guard added there) rather than spinning a new task.
- **Migration numbering gaps (006/007/008/012)**: intentional reservations for pending tasks. Document explicitly in STATUS.md migration ordering section.
- **15-idempotency.sql jumping over 013**: documented in the file header (line 4). Acceptable historical ordering note.

---

## Reply

**Top 3 findings ranked by severity**

1. **(P0) No real SQL migration runner.** `migrate.ts` shells out to `drizzle-kit push`, which does not apply any of the 12 hand-written `*.sql` files. The hand-written migrations are loaded ad-hoc by individual tests. Combined with mixed `NNN-` vs `NNNN_` filename conventions, lex sort would order `0010_app_role` before `002-rls-baseline` and `0014_r13-placeholder-tables` before its `app.current_org_id()` dependency. Today this is masked because nothing sorts; T-039 (canary upgrade) needs a real runner to exist.
2. **(P1) ESLint covers `apps/web` only.** T-046 `Reference.*` drift gate, T-025 radix-dialog gate, and T-045 `getOwnerConnection` gate were each shipped per task but none runs against `packages/*`. Real drift already exists: `packages/schema-runtime/src/compile.ts:39,46` has hardcoded `"Reference.DeptColumns"` / `"Reference.FieldTypes"` literals. T-045's REVIEW already flagged the eslint-coverage issue as BLOCKING; T-045 is PENDING, not DONE — STATUS.md should be re-checked.
3. **(P1) Schema split + legacy client.** `drizzle.config.ts` and `packages/db/lib/client.ts` both bind to the old `./schema/` directory; new tables (tenantMigrations, lot, workOrder, etc.) live in `./src/schema/`. Drizzle-kit can't see them, and `packages/db/package.json:main` still exposes the legacy superuser-pool `db` export. The 8 pre-existing integration tests still connect as superuser and silently bypass RLS.

**Did the parallel-task pipeline introduce structural risk that must be fixed before Wave B?**

Yes. Two specific items:
- The migration-runner gap (T-053) is Wave-B-blocking because T-039 depends on it. Without a real runner, "apply migrations" is a manual ordered list that drifts every time someone adds a file.
- ESLint coverage (T-055) is Wave-B-blocking because Wave B will add server endpoints in `packages/server` and `packages/sync-queue` that import from `@monopilot/db`. Without workspace-wide lint, the `getOwnerConnection` and RefTables drift gates have zero teeth in those packages.

The rest (RLS on Departments, schema convergence, test-directory consolidation, tests-as-app-user) is cleanup that can run in parallel with Wave B but should be assigned, not left as folklore.

**Recommended new tasks count: 6** — T-053 (P0), T-054 (P1), T-055 (P1), T-056 (P2), T-057 (P1), T-058 (P2). T-053 and T-055 are Wave-B-blocking; the rest can run in parallel.
