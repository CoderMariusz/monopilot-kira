# 00-Foundation — Final Consistency Audit (2026-05-07)

**Auditor:** OPUS (independent, post-61/61 close-out)
**Scope:** All 61 tasks in `_meta/atomic-tasks/00-foundation/STATUS.md`. Cross-cutting drift between tasks, latent bugs from inter-task wiring, hidden technical debt patterns. Reports against the entire module — *not* per task.

---

## Executive summary

**RAG status: AMBER, leaning RED.** The module reached 61/61 DONE, but several P0 blockers concentrated in `apps/web` data-plane wiring, `packages/ui` consumability, the `tenant_idp_config` exposure surface, and a sprawl of `getOwnerConnection() + pool.end()`-per-request anti-patterns that turn each authenticated request into a fresh TCP+auth handshake against Postgres. The Wave A audit (carry-forward backlog of 31 items) was largely closed by T-053..T-061, but a *new* class of problems has accumulated since: production-grade auth code importing from `test-utils`, RBAC HMAC compared with non-timing-safe `!==`, and a Server Action wrapper resolving session identity from `process.env`. **Foundation is feature-complete; it is not production-deployable in its current form.**

**Top three findings (full evidence below):**

1. **`packages/ui` peer-deps lock React 18 while `apps/web` is on React 19; only 1 of 13 primitives is actually consumed by web** — Stepper, Field, Input, ReasonInput, Button, EmptyState, RunStrip, etc. are functionally orphaned. T-037 already self-flagged this; T-076 carry-forward not opened. **Wizard UI is still inline, not the design-system primitives.**

2. **Org-context wiring inconsistency: middleware does NOT call `set_org_context`; every Server Action / Route Handler must call it manually, but most do not.** `(auth)/actions.ts`, `(settings)/schema/_actions/draft.ts`, `api/internal/flags/route.ts`, `api/internal/cron/drift/route.ts`, `api/internal/upgrade/_actions/*.ts` all skip it (some legitimately use BYPASSRLS owner pool; the **silent-bypass risk** is when a future contributor wires `getAppConnection()` in without realising RLS resolves to NULL). Plus `(settings)/schema/_actions/draft.ts:29` resolves caller identity from `process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID` — **a stub that ships in production**.

3. **`tenant_idp_config` is GRANT SELECT to app_user with NO RLS** (migration 025), and the SAML login route accepts any `?tenant=` from the URL with no auth-binding. Combined: any unauthenticated request can enumerate every tenant's IdP config (x509_cert, metadata_url, jit setting). T-012 carry-forward T-072 already flags this; not closed.

---

## Findings table

| Sev | Finding | Evidence (file:line) | Recommended action |
|-----|---------|----------------------|--------------------|
| **P0** | `packages/ui` pins `react: ^18.3.1` / `react-dom: ^18.3.1` / `@types/react: ^18.3.3`; `apps/web` pins `react: ^19.2.0`. Bumping `apps/web` will hoist mismatched React in pnpm; primitives risk hooks-rule violations and `useId` instability across boundaries. | `packages/ui/package.json:24-25,39-40` vs `apps/web/package.json:23-25,38-39` | **NEW TASK T-076**: align `packages/ui` to React 19 peerDeps + bump `@types/react`. Re-run T-026/T-027 RTL suite. |
| **P0** | Only **5 of 13 UI primitives** are exposed via `packages/ui/package.json#exports`; only **1 (Summary)** is actually imported by `apps/web`. Stepper/Field/Input/ReasonInput/Button/EmptyState/RunStrip/CompactActivity/DryRunButton/TabsCounted/Textarea are orphaned. Wizard inline-impl still in place. | `packages/ui/package.json:7-13`; `grep -rn "from '@monopilot/ui" apps/` returns 1 hit (`apps/web/app/(admin)/schema/_components/SchemaColumnWizard.tsx:23`) | **NEW TASK T-077**: expand `exports`, replace wizard inline impls with primitives, add a smoke test that imports each primitive in apps/web. |
| **P0** | Production auth code imports from `test-utils`. `packages/auth/src/{totp,verify-pin,recovery}.ts` all `import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js'` — defeating the very purpose of `packages/db/src/index.ts:3` which intentionally does NOT re-export `getOwnerConnection` (ESLint guard). | `packages/auth/src/totp.ts:18`, `verify-pin.ts:17`, `recovery.ts:16`; `packages/db/src/index.ts:3-4` | **REWORK INLINE**: change all three imports to `../../db/src/clients.js` (matching grant.ts/draft.ts/cron-drift); add an ESLint `no-restricted-imports` rule banning `test-utils/test-pool` outside `*.test.ts`. |
| **P0** | `pool.end()` called in `finally` of every request handler — the pool returned by `getOwnerConnection()` is freshly constructed each call (`new pg.Pool(...)`), so each invocation pays full TCP+TLS+auth handshake. **14 production sites** affected. Production performance regression (will surface as P95 spikes once load hits the prod cluster). | `packages/auth/src/{verify-pin.ts:55,173, totp.ts:78,113, recovery.ts:52}`, `packages/rbac/src/grant.ts:297`, `packages/server/src/idempotent.ts:153`, `apps/web/app/api/auth/saml/{callback/route.ts:73,login/route.ts:54}`, `apps/web/app/api/internal/cron/drift/route.ts:108`, `apps/web/app/api/internal/upgrade/_actions/{advanceCohort.ts:129,recordMigrationRun.ts:163}`, `apps/web/lib/auth/saml.ts:384`, `packages/db/scripts/migrate.ts:138` (last is fine — script lifecycle) | **NEW TASK T-080** (system-actor pool helper): refactor `getOwnerConnection` to return a **memoized** pool (or expose `getSystemActorConnection()` per Wave A note). Remove `await pool.end()` from per-request paths. T-034 already self-flagged this in carry-forward T-080. |
| **P0** | RBAC HMAC signature compared with `!==` not `crypto.timingSafeEqual`. Token-forgery oracle on the approval token verifier. | `packages/rbac/src/grant.ts:127` (`if (signature !== expectedSig) ...`) | **REWORK INLINE**: replace with `timingSafeEqual(Buffer.from(signature,'hex'), Buffer.from(expectedSig,'hex'))` plus length check. Trivial fix; no behaviour change. |
| **P0** | SAML login route accepts `?tenant=` from URL with **no auth binding**, queries `tenant_idp_config` (which has GRANT SELECT to app_user, **no RLS** — see migration 025), and returns the resolved x509_cert / metadata_url / jit_provisioning. Unauthenticated tenant enumeration. | `apps/web/app/api/auth/saml/login/route.ts:22-77`; `packages/db/migrations/025-tenant-idp-config-app-grant.sql:17` (`grant select … to app_user`); `packages/db/migrations/005-tenant-idp-config.sql` has no `ENABLE ROW LEVEL SECURITY` | **NEW TASK T-072** (already opened by T-012, **not closed**): either (a) add tenant_id-scoped RLS, or (b) move SAML config reads to a service-role-only endpoint and never expose via app_user. Until then, treat this as a deployment blocker. |
| **P0** | `(settings)/schema/_actions/draft.ts:29` resolves caller identity from **environment variables** (`NEXT_SERVER_ACTION_ACTOR_USER_ID`, `NEXT_SERVER_ACTION_ORG_ID`) — a literal stub shipped in production. Any user-triggered call uses the same actor identity. RBAC enforcement downstream is fooled. | `apps/web/app/(settings)/schema/_actions/draft.ts:28-37` (the `resolveSessionContext` stub) | **REWORK INLINE**: replace with the real Supabase session adapter (see `(auth)/actions.ts` pattern). T-036 self-flagged this as a "T-069 actor-org assertion" carry-forward; not closed. |
| **P0** | `user_pins` RLS uses `USING (true)` (read-side wide open) — explicitly weakened so test seed works. Mitigated only because verify-pin.ts uses `getOwnerConnection`. Future code that calls `getAppConnection().query('select … from public.user_pins')` cross-leaks PIN hashes between tenants. | `packages/db/migrations/019-pins.sql:29` (`using (true)`); T-016 carry-forward documented in `_meta/atomic-tasks/00-foundation/notes/T-016.md:200-205` | **NEW TASK T-062** (already opened by T-016, **not closed**): restore `using (user_id in (select id from public.users where org_id = app.current_org_id()))` and fix the test-seed at the test-helper layer instead. |
| **P1** | `tenant_migrations` table has **no RLS, no FK to organizations**. App-layer enforces ref integrity. Cross-tenant leak risk if any future code reads via app_user (currently only owner-pool reads). | `packages/db/migrations/013-tenant-migrations.sql:8-23` | **NEW TASK** (carry-over from T-038 CF-1 → T-039 — *closure incomplete*): add `enable + force RLS` plus FK; revoke app_user (control-plane only). |
| **P1** | `packages/server/src/idempotent.ts:98` constructs raw `new pg.Pool` and uses `process.env.DATABASE_URL` directly (not the role-split). Bypasses `getAppConnection`/`getOwnerConnection` and the production guard. T-058 was meant to migrate everything to the helpers. | `packages/server/src/idempotent.ts:94-99` | **REWORK INLINE**: switch to `getAppConnection()` (idempotency rows are tenant-scoped under RLS — app role is correct). |
| **P1** | SCIM emits `audit_events` with `org_id = '00000000-0000-0000-0000-000000000000'` sentinel UUID for unauthenticated bearer rejections. Pollutes RLS-bounded queries on audit_events; no FK on org_id NOT NULL prevents this. T-013 self-flagged via T-073 carry-forward — *not closed*. | `apps/web/lib/scim/middleware.ts:80,85-90`; `packages/db/migrations/004-audit.sql:13` | **NEW TASK T-073** (already opened): make `audit_events.org_id` nullable for security retention class; backfill sentinel rows; or accept-as-debt and document the sentinel in retention worker. |
| **P1** | SAML callback route registers `app.set_org_context(gen_random_uuid(), $1)` on a fresh owner pool that is `pool.end()`-ed two lines later. The `set_org_context` is bound to that connection only, then immediately discarded — **dead code**. The comment ("middleware will re-establish on next request") acknowledges this; middleware does NOT re-establish (T-011 carry-forward T-062). | `apps/web/app/api/auth/saml/callback/route.ts:108-119` | **NEW TASK** (T-074 RelayState HMAC binding already covers RelayState; this needs its own line): wire SAML callback to issue a real session token + persist it into `app.session_org_contexts`, OR document that SAML JIT path produces no live RLS context (broken until T-062 lands). |
| **P1** | `recordMigrationRun.ts` and `advanceCohort.ts` accept `orgId` as RPC parameter with **no actor-org-binding check**. RBAC query checks `r.org_id = $orgId` against the caller's `user_roles` row, but the orgId itself is caller-supplied. Privileged-caller across-org escalation risk if a `org.platform.admin` for org A calls with `orgId = org B`. T-039 self-flagged via T-071. | `apps/web/app/api/internal/upgrade/_actions/advanceCohort.ts:51-60`; `notes/T-039.md:379-380` | **NEW TASK T-071** (open, *not closed*): derive actor's `orgId` from session; refuse mismatched param. |
| **P1** | T-015 TOTP module accepts `masterKey` as opts param with NO env-guard / fail-closed in production. T-014 RBAC HMAC and T-034 cron each have their own production guard; T-015 self-flagged this as CF-T015-B but never closed. | `packages/auth/src/totp.ts:31-37,49-90` (no env guard); compare `packages/rbac/src/grant.ts:55-66` | **NEW TASK CF-T015-B** (still open): add `getMasterKey()` helper with `if (NODE_ENV==='production' && !VITEST && !MFA_MASTER_KEY) throw`. Inject from env, not from caller. |
| **P1** | `api/internal/flags/route.ts:33-36` checks `org.access.admin` via Supabase RPC with `.eq('user_id', user.id).eq('roles.slug', ORG_ACCESS_ADMIN)` — does **NOT** scope by `org_id`. A user with `org.access.admin` in *any* org passes the check globally. | `apps/web/app/api/internal/flags/route.ts:29-50` | **REWORK INLINE**: add `.eq('org_id', resolvedOrgIdFromSession)` — and resolve org from session (currently no org-resolver on this route). |
| **P1** | `tenant-idp-config-fa2.integration.test.ts` (T-060) created **after** T-058 with `eslint-disable no-restricted-syntax` to keep raw `new pg.Pool`. T-058 contract was that all tests use getApp/getOwner. Sets a precedent: future tests will copy the disable. | `packages/db/__tests__/tenant-idp-config-fa2.integration.test.ts:56-57` | **REWORK INLINE**: migrate to `getOwnerConnection()`. The eslint-disable comment is the lint-gate's failure mode — a soft drift. |
| **P1** | Migration 023 was **applied via raw psql + manual schema_migrations row insert** because of a pre-existing 017-rbac.sql checksum mismatch. T-013 (024-scim-extras) followed the same pattern. The hosted DB and `pnpm db:migrate` are out of sync; a fresh-deploy CI run hits the same checksum hard error. T-070 carry-forward exists but is not closed. | `notes/T-013.md:193-194`, `notes/T-039.md:380` | **NEW TASK T-070** (open): either re-checksum 017-rbac.sql (allowed: edit, then update applied checksum row) OR add a one-off "checksum-tolerance" mode to the runner. Until then, fresh-deploy is broken. |
| **P1** | Migration ordering "lock" in STATUS.md is documentation only — the runner sorts by **numeric prefix**, not lex order. Gaps at 008, 020, 021 are deliberate (008 reserved for SCIM but reassigned to 024; 020/021 reverted). The numeric prefix sort handles gaps fine, but a contributor reading the ordered list of `ls migrations/` may not realize 022/023/024 were inserted out-of-order with respect to the original task numbering. | `packages/db/migrations/` (gaps at 008, 020, 021); `STATUS.md:79-107` | **ACCEPT-AS-DEBT**: add a `MIGRATIONS.md` adjacent to migrations folder explaining the gaps. |
| **P1** | `outbox_events_event_type_check` in 023 is a "drop-and-replace" that re-creates the constraint with all 15 events. If any earlier migration order-of-application is wrong (e.g. a future migration tries to insert pre-CHECK), the constraint silently drops first. **Idempotent re-runs are fine** but **rolling-deploy** during the migration could miss the constraint. Acceptable for foundation but risky pattern for Wave B. | `packages/db/migrations/023-outbox-events-extension.sql:15-19` | **ACCEPT-AS-DEBT**: document the drop-and-replace pattern; consider `ALTER ... ADD VALUE` style for future event additions. |
| **P2** | BYPASSRLS / `getOwnerConnection()` sprawl: 9 production sites use it (auth/totp, auth/recovery, auth/verify-pin, schema-driven/draft, rbac/grant, ops/drift, internal/upgrade/advanceCohort, internal/upgrade/recordMigrationRun, plus migrate runner). Each is "justified" but the pattern is now the default for any cross-org write. No formal `SystemActor` abstraction exists. | All sites listed above | **NEW TASK T-080** (already opened by T-034 carry-forward, *not closed*): introduce `getSystemActorConnection()` with explicit `actor_type='system'` audit context. Forces every BYPASSRLS site to declare its system-actor identity. |
| **P2** | `apps/web` middleware skips `set_org_context`. T-011 deferred via T-062 carry-forward (*not closed*). Every Server Action / Route Handler must remember to call it manually. Code review can't catch silent bypasses (a Server Action that writes via `getAppConnection()` without setting context resolves `app.current_org_id()` to NULL → RLS denies → 0 rows / 0 inserts → silent failure). | `apps/web/middleware.ts:13-18` (the comment); `apps/web/lib/auth/session-check.ts:18-24` | **NEW TASK T-062** (open): implement `withOrgContext` HOF that wraps Server Actions. Make it the only path to `getAppConnection()`. |
| **P2** | RBAC `assertUserBelongsToOrg` and similar guards do raw `SELECT 1 FROM users WHERE id=$1 AND org_id=$2` from BYPASSRLS connection — bypasses the `users` RLS. Acceptable for owner pool, but pattern means there is no DB-level guarantee that `actor_user_id` belongs to `org_id`. T-014 carry-forward T-067 covers this. | `packages/rbac/src/grant.ts:152-165` | **NEW TASK T-067** (open): consider DB-level FK constraint `(actor_user_id, org_id) → users(id, org_id)` via deferred FK or trigger. |
| **P2** | `Reference.*` literal hardcodes (`Reference.DeptColumns`, `Reference.Departments`, `Reference.Rules`, `Reference.ManufacturingOperations`) appear at 5 sites in production code. T-046 ESLint rule blocks **new** literals. Verified: no new literals introduced post-T-046; all 5 sites pre-date the rule and are allowlisted by reference. | `packages/ops/src/drift-detect.ts:211`, `packages/schema-driven/src/actions/draft.ts:232,249`, `packages/rule-engine/src/cascade-handler.ts:61,84` | **ACCEPT-AS-DEBT**: T-046 prevents drift forward; refactor cost > value here. |
| **P3** | TOTP/PIN/recovery code uses production *single-table* references but imports from `@monopilot/db/test-utils/test-pool.js` (P0 above). Even after import-path fix, `packages/db/package.json` has no `"exports"` field — *any* internal path is importable. Drift surface. | `packages/db/package.json:1-28` | **ACCEPT-AS-DEBT**: future cleanup. Add `"exports"` map after fixing the auth imports. |

---

## Pipeline observations

### Rework rate
- 22 of 61 tasks (36%) needed at least one REWORK cycle. T-009, T-014, T-015, T-016, T-024, T-025, T-029, T-031, T-036, T-037, T-045, T-055, T-061 all had REWORK→RE-REVIEW loops.
- The **highest-friction tasks** (≥2 RE-REVIEW rounds): T-009, T-024, T-029, T-031. Common signal: vacuous RED tests slipping past GREEN review. Reviewers caught vacuousness via mutation experiments — without those, the "PASS" verdicts would have stuck.

### Agent failure modes
1. **RED-test vacuousness slipping into GREEN** (T-009 impersonation guard, T-024 hashPayload, T-029 [style] mutation-proof) — the loudest signal in the pipeline. Indicates RED authors didn't write a failing-mutation experiment up front.
2. **HARD BLOCKER fixes deferred to REWORK** when GREEN agent found an unexpected obstacle (T-016 reverted 020/021 in REWORK γ; T-036 dept_code='production' fallback removed in REWORK).
3. **Carry-forwards opened but not closed**: T-062 (org-context HOF), T-070 (017 checksum), T-072 (tenant_idp_config RLS), T-073 (audit_events.org_id nullable), T-076 (React 19 align), T-080 (system-actor pool). **6 P0/P1 carry-forwards remain open at module-close**.
4. **`eslint-disable` comments accumulating**: T-058 closed the migration in spirit, but T-060 added a new disable. Drift gates are only as strong as the willingness to keep them green.

### Hidden technical-debt patterns
- **Per-request pool construction**: 14 sites with `getOwnerConnection()` + `pool.end()` in finally. The function returns `new pg.Pool` each call, so finally-end means a new TCP/TLS+auth round-trip per request.
- **Stub session adapters in production**: `(settings)/schema/_actions/draft.ts:28-37` reads identity from env. **This will ship if not caught.**
- **Sentinel UUIDs**: `'00000000-...'` for SCIM unauth audit, `gen_random_uuid()` for one-shot SAML org context. Each is a "harmless" workaround that bypasses an invariant (NOT NULL, RLS).
- **Dual schema directories** (closed by T-053) and the **dual `__tests__` directories** (also closed) showed how easy it is to accumulate parallel structure that drifts silently.

---

## Severity counts

| Severity | Count |
|----------|-------|
| P0 | **8** |
| P1 | **12** |
| P2 | **4** |
| P3 | **1** |

---

## Reply to orchestrator

### Top 3 P0 findings (ranked by deploy-blocker impact)

1. **`(settings)/schema/_actions/draft.ts:28-37` resolves caller identity from `process.env`** — a stub that ships in production. Any authenticated caller invokes upsert/publish under a single shared identity; downstream RBAC check is meaningless. **Single-line fix in `resolveSessionContext`** but if missed, every dept-column publish trivially impersonates any user. *This is the most embarrassing-if-shipped finding.*

2. **`tenant_idp_config` GRANT SELECT to app_user, NO RLS, AND `/api/auth/saml/login?tenant=…` accepts attacker-controlled tenant param** — unauthenticated cross-tenant IdP-config enumeration (x509 certs, metadata URLs, jit settings). This is reachable from the open internet today.

3. **`packages/auth/src/{totp,verify-pin,recovery}.ts` import `getOwnerConnection` from `@monopilot/db/test-utils/test-pool.js`** in production. The path bypasses the deliberate ESLint guard that blocks `getOwnerConnection` re-export in `packages/db/src/index.ts:3-4`. Plus per-request `pool.end()` (P0 perf finding) layered on top. Three-line fix per file.

### Is the work shippable to production today? — **No.**

Foundation is feature-complete and the test surface is broad (≈1100 tests across the module, integration + mutation experiments confirming non-vacuous coverage), but **6 open P0/P1 carry-forwards and 8 unflagged P0 findings prevent a clean prod deploy**:

- `set_org_context` is not wired from middleware → silent RLS-bypass risk on any future Server Action that uses `getAppConnection()` (T-062 not closed).
- `pool.end()`-per-request will kneecap P95 under load.
- Production code imports from `test-utils` (auth modules).
- Server Action stubs identity from env.
- SAML config exposed unauthenticated.
- React 18/19 peer mismatch leaves 12 of 13 UI primitives unconsumable.
- Migration runner cannot do a fresh-deploy due to 017-rbac.sql checksum debt (T-070).
- Cohort-advance + record-migration-run accept caller-supplied orgId without session binding (T-071).

**Recommended sequencing before prod cut:**
1. Close T-062, T-070, T-076 (three P0 infra blockers).
2. Inline-fix the 4 trivial P0s (timing-safe HMAC compare, draft.ts session stub, flags org_id scope, auth-package import paths).
3. Open and ship T-080 (system-actor pool helper) to retire the 14× `pool.end()`-per-request pattern.
4. Open T-072 (tenant_idp_config RLS or service-role-only).
5. Then call it shippable.

Estimated blocker-close window with focused effort: **~1 sprint**. Without it, foundation is "all green at the test level, structurally Amber/Red at the systems level" — exactly the failure mode this audit is designed to surface.

— OPUS auditor, 2026-05-07
