# 2026-05-14 — Tenant-context API drift remediation

**Author:** Tenant-context remediation pass (post-Auditor B).
**Source audit:** `_meta/audits/2026-05-14-architecture-and-cross-cutting-gaps.md` §4.1, §4.2, §1.3, §5.2.
**Canonical foundation API:** `packages/db/migrations/002-rls-baseline.sql`
- Setter (non-spoofable, SECURITY DEFINER): `app.set_org_context(session_token uuid, org uuid) returns uuid`
- Reader (SQL function): `app.current_org_id() returns uuid`
- Trust store: `app.session_org_contexts` (PK session_token) + transaction-local `app.active_org_contexts`

**Wave0 v4.3 lock:** business-scope column is `org_id`, not `tenant_id`. RLS policies use `org_id = app.current_org_id()` for USING and WITH CHECK. The GUC patterns `current_setting('app.tenant_id')` and `current_setting('app.current_org_id')` are non-canonical and resolve to NULL at runtime — they would silently return zero rows or break RLS.

## Scope

16 task JSONs across 7 modules + Foundation were rewritten in place. The audit noted ~20; the actual drift was 16 task JSONs (some of the audit's count was already-correct policy descriptions or negative red-line references). NPD T-006 was additionally normalized from `tenant_id` column to `org_id` per Wave0.

## Files changed

### Module tasks (15)

| Module | File | Drift before | Fix |
|---|---|---|---|
| 01-NPD | `_meta/atomic-tasks/01-npd/tasks/T-001.json` | RLS: `(tenant_id = current_setting('app.tenant_id')::uuid)` (FG primary table!) | Policy `product_org_context` USING `(org_id = app.current_org_id())` WITH CHECK same. `tenant_id` column renamed to `org_id`. Added FORCE RLS + pg_policies-references-function AC. |
| 01-NPD | `_meta/atomic-tasks/01-npd/tasks/T-006.json` | DDL column `tenant_id UUID` + PK `(tenant_id, …)` | Renamed to `org_id` per Wave0; policy `role_permissions_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`. |
| 02-Settings | `_meta/atomic-tasks/02-settings/tasks/T-004.json` | RLS: `USING (org_id = current_setting('app.current_org_id')::uuid)` | Policy USING `(org_id = app.current_org_id())` WITH CHECK same. Added pg_policies-references-function AC. |
| 02-Settings | `_meta/atomic-tasks/02-settings/tasks/T-015.json` | Helper described as `SET LOCAL app.current_org_id = $1` (spoofable GUC) | Helper now calls `app.set_org_context(sessionToken, orgId)`; signature changed to `withOrgContext(sessionToken, orgId, fn)`; added grep-assertion AC. |
| 03-Technical | `_meta/atomic-tasks/03-technical/tasks/T-001.json` | AC referred to `SELECT runs without app.current_org_id` (ambiguous GUC pattern) | Policy USING `(org_id = app.current_org_id())`; AC clarified to "no prior app.set_org_context call → app.current_org_id() returns NULL → zero rows"; added pg_policies-references-function AC. |
| 04-Planning-basic | `_meta/atomic-tasks/04-planning-basic/tasks/T-008.json` | `getTenantId()` helper that "sets app.tenant_id Postgres GUC" | Replaced with foundation `withOrgContext()` wrapping that calls `app.set_org_context(session_token, org_id)`; added AC asserting no app.tenant_id GUC write. |
| 05-Warehouse | `_meta/atomic-tasks/05-warehouse/tasks/T-002.json` | Policy `tenant_isolation_license_plates` USING `(tenant_id = current_setting('app.tenant_id')::uuid)` + `UNIQUE(tenant_id, …)` + FEFO index `(tenant_id, …)` | Policy `license_plates_org_context` USING `(org_id = app.current_org_id())`; column + UNIQUE + FEFO index renamed `tenant_id`→`org_id`. Added FORCE RLS + pg_policies AC. |
| 05-Warehouse | `_meta/atomic-tasks/05-warehouse/tasks/T-012.json` | All 9 warehouse tables: policy `tenant_isolation_*` USING `(tenant_id = current_setting('app.tenant_id')::uuid)`; AC "app.tenant_id setting is unset" | All 9 tables: policy `<table>_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; AC rewritten to "no app.set_org_context → app.current_org_id() returns NULL → fail-closed"; added pg_policies AC. |
| 07-Planning-ext | `_meta/atomic-tasks/07-planning-ext/tasks/T-001.json` | Policy `scheduler_runs_tenant_isolation` on `tenant_id = current_setting('app.tenant_id')::uuid` + `idx_scheduler_runs_tenant_status` + DDL `tenant_id` | Renamed to `org_id`; policy `scheduler_runs_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; FORCE RLS; pg_policies AC. |
| 07-Planning-ext | `_meta/atomic-tasks/07-planning-ext/tasks/T-002.json` | "RLS policy on tenant_id" + "two tenants insert assignments, when each SELECTs under app.tenant_id" | Policy `scheduler_assignments_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; AC rewritten to "app.set_org_context per org as app_user"; FORCE RLS; pg_policies AC. |
| 07-Planning-ext | `_meta/atomic-tasks/07-planning-ext/tasks/T-008.json` | "tenant_id PK" + "RLS by tenant_id" + AC "each SELECTs under app.tenant_id" | `org_id` PK; policy `scheduler_config_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; FORCE RLS; pg_policies AC. |
| 07-Planning-ext | `_meta/atomic-tasks/07-planning-ext/tasks/T-013.json` | Route handler scoping `WHERE tenant_id = current_setting('app.tenant_id')` | Replaced with `withOrgContext(sessionToken, orgId, fn)` HOF wrapping; AC asserts no GUC reads remain in source; cross-org 404 via app.current_org_id(). |
| 08-Production | `_meta/atomic-tasks/08-production/tasks/T-010.json` | `tenant_id NOT NULL` column + AC "SELECT runs without app.tenant_id" + "RLS by tenant_id" | `org_id NOT NULL`; policy `d365_push_dlq_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; FORCE RLS; pg_policies AC. |
| 09-Quality | `_meta/atomic-tasks/09-quality/tasks/T-004.json` | RLS `USING/WITH CHECK (org_id = current_setting('app.current_org_id')::uuid)` per §9.1 | Policy `quality_holds_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; FORCE RLS; pg_policies AC; AC rewritten to "app.set_org_context per org as app_user". |
| 09-Quality | `_meta/atomic-tasks/09-quality/tasks/T-009.json` | Audit trigger reads `current_setting('app.tenant_id')`-style and AC "app.current_user_id and app.current_org_id settings" | Trigger reads `app.current_org_id()` for audit row's `org_id`; actor `user_id` still via `current_setting('app.current_user_id', true)` (different concern, kept). Policy `quality_audit_log_org_context` USING/WITH CHECK `(org_id = app.current_org_id())`; FORCE RLS; pg_policies + trigger-source grep AC. |

### Foundation tasks (1 edited, 1 new)

| File | Change |
|---|---|
| `_meta/atomic-tasks/00-foundation/tasks/T-011.json` | Middleware described as setting `app.current_org_id` via `app.set_tenant` was rewritten to explicitly call `app.set_org_context(session_token, org_id)` and have RLS read via `app.current_org_id()`. AC3 changed from `current_setting('app.current_org_id') resolves` to `app.current_org_id() function resolves`. Added the GUC-grep red line. |
| `_meta/atomic-tasks/00-foundation/tasks/T-125.json` | **NEW.** FT-001 atomized: `withOrgContext` HOF in `packages/db/src/with-org-context.ts` + Next.js wrapper in `apps/web/lib/auth/with-org-context-route.ts`; testcontainers Postgres 16 parallel-tx isolation test; source-grep AC bans `current_setting('app.tenant_id'|'app.current_org_id')` and `SET LOCAL app.current_org_id` from the helper file. |

### Manifest + coverage

| File | Change |
|---|---|
| `_meta/atomic-tasks/00-foundation/manifest.json` | `task_count`: 124 → 125; added `tasks/T-125.json` to list. |
| `_meta/atomic-tasks/00-foundation/coverage.md` | Appended `## Tenant-context remediation 2026-05-14` section linking to FT-001 (T-125) and naming the 16 rewritten task JSONs. |

## Before / after — representative RLS-policy line per fix

| Task | Before (drift) | After (canonical) |
|---|---|---|
| 01-NPD T-001 | `(tenant_id = current_setting('app.tenant_id')::uuid)` | `(org_id = app.current_org_id())` |
| 01-NPD T-006 | `tenant_id UUID, PK(tenant_id, role, permission, scope_qualifier)` | `org_id UUID, PK(org_id, role, permission, scope_qualifier)` |
| 02-Settings T-004 | `USING (org_id = current_setting('app.current_org_id')::uuid)` | `USING (org_id = app.current_org_id()) WITH CHECK (org_id = app.current_org_id())` |
| 02-Settings T-015 | `SET LOCAL app.current_org_id = $1` (spoofable GUC) | `SELECT app.set_org_context($1::uuid, $2::uuid)` (non-spoofable setter) |
| 03-Technical T-001 | `SELECT runs without app.current_org_id` (ambiguous) | `as app_user without a prior app.set_org_context(...) call (so app.current_org_id() returns NULL)` |
| 04-Planning-basic T-008 | `getTenantId() … sets app.tenant_id Postgres GUC` | `withOrgContext(sessionToken, orgId, fn) … calls app.set_org_context(session_token, org_id)` |
| 05-Warehouse T-002 | `tenant_isolation_license_plates` on `(tenant_id = current_setting('app.tenant_id')::uuid)` | `license_plates_org_context` USING `(org_id = app.current_org_id())` WITH CHECK same |
| 05-Warehouse T-012 | `tenant_isolation_*` USING `(tenant_id = current_setting('app.tenant_id')::uuid)` on 9 tables | `<table>_org_context` USING/WITH CHECK `(org_id = app.current_org_id())` on 9 tables |
| 07-Planning-ext T-001 | `scheduler_runs_tenant_isolation` on `tenant_id = current_setting('app.tenant_id')::uuid` | `scheduler_runs_org_context` USING/WITH CHECK `(org_id = app.current_org_id())` |
| 07-Planning-ext T-002 | `RLS policy on tenant_id` | `scheduler_assignments_org_context` USING/WITH CHECK `(org_id = app.current_org_id())` |
| 07-Planning-ext T-008 | `RLS policy on tenant_id` + `tenant_id PK` | `scheduler_config_org_context` USING/WITH CHECK `(org_id = app.current_org_id())` + `org_id PK` |
| 07-Planning-ext T-013 | `WHERE tenant_id = current_setting('app.tenant_id') (RLS enforces too)` | `withOrgContext(sessionToken, orgId, fn) … RLS enforces via app.current_org_id() from packages/db/migrations/002-rls-baseline.sql` |
| 08-Production T-010 | `tenant_id NOT NULL` + `RLS by tenant_id` | `org_id NOT NULL` + `d365_push_dlq_org_context` USING/WITH CHECK `(org_id = app.current_org_id())` |
| 09-Quality T-004 | `USING/WITH CHECK (org_id = current_setting('app.current_org_id')::uuid)` | `USING/WITH CHECK (org_id = app.current_org_id())` |
| 09-Quality T-009 | `request_id from current_setting` (trigger ambiguity over which GUC) | Trigger reads `app.current_org_id()` for `org_id`; actor `user_id` via `current_setting('app.current_user_id', true)` only; `request_id` via `current_setting('app.request_id', true)` |
| 00-Foundation T-011 | `setting app.current_org_id via app.set_org_context(...)` + AC `current_setting('app.current_org_id') resolves to the user's org UUID (set via app.set_tenant)` | `establishing org context by calling app.set_org_context(session_token, org_id)` + AC `app.current_org_id() (the foundation function) resolves to the user's org UUID and RLS-scoped SELECTs see exactly that org's rows` |

## Risk red line added to every rewritten task

> "Do not read `current_setting('app.tenant_id')` or `current_setting('app.current_org_id')` directly — use the foundation `app.current_org_id()` function so the NULL-safe setter contract is preserved."

(NPD T-006, Warehouse T-002, and other tasks that previously used a `tenant_id` column additionally received the red line: "Do not use `tenant_id` as the business-scope column; per Wave0 v4.3 lock it is `org_id`.")

## Details note added to every rewritten task

> "RLS uses foundation `app.current_org_id()` function (Wave0 decision; see `_meta/audits/2026-05-14-architecture-and-cross-cutting-gaps.md` §Tenant-context)."

## Not changed (intentionally)

- Foundation T-007 (`_meta/atomic-tasks/00-foundation/tasks/T-007.json`) — the task that originally established the proper pattern. Its only `current_setting('app.tenant_id')` reference is a NEGATIVE red line saying pg_policies MUST NOT use that pattern. Already canonical.
- Foundation T-013/T-045/T-054/T-056/T-061 — no GUC-write drift (only contextual or negative references).
- 09-Quality T-037 — already contains a correct negative red line forbidding the GUC.
- All other 600+ task JSONs — read-only sweep confirmed no further GUC drift in the policy/AC/details/prompt sections.

## Validation

All 16 edited JSON files validated with `python3 -c "import json; json.load(open(f))"` — 0 syntax errors.

## Next steps (out of scope for this remediation)

1. Execute T-125 (FT-001 `withOrgContext` HOF) — the implementation task.
2. Retrofit per-Server-Action call sites under `apps/web/app/**/actions.ts` and route handlers under `apps/web/app/api/**/route.ts` to call `withOrgContext` — module-level work, not foundation.
3. Add an ESLint rule under `tooling/eslint/` that flags any new `current_setting\('app\.(tenant_id|current_org_id)'\)` string literal in `packages/db/**` and `apps/web/**`. Pair with the marker-discipline test (`_foundation/__tests__/marker-discipline.test.ts`).
