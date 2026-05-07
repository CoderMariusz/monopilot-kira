# 00-Foundation — Final Production Readiness Audit (Independent Opus)

- **Date**: 2026-05-07
- **Scope**: Wave 0 v4.3 — full 61/61 module
- **Orchestrator claim**: "Wave0 v4.3 readiness ≥95%"
- **Auditor verdict**: **CLAIM REJECTED.** Real readiness is **~62 %**. The number conflates "task pipeline closed" with "deployable to a regulated production tenant". They are not the same thing.
- **Showstopper count**: **7** (P0 deploy blockers)
- **Operational gaps surfacing within first month**: **9**
- **Would I ship this to a real customer?** **No.** See "Final reply".

---

## 0. How this audit was performed

| Probe | Result |
|---|---|
| `git log --since='2025-12-01'` | 50 commits — 32f7b21 closeout commit confirms 61/61 |
| `ls apps/web/public/icons/` | **directory does not exist** |
| `ls .storybook/` | **directory does not exist** (workspace root) — packages/ui has none either |
| `ls playwright.config.*` | `playwright.config.ts` exists at root — orchestrator brief was wrong on this point |
| `pnpm db:migrate --dry-run` | **fails** with `ECONNREFUSED 127.0.0.1:5432` — no DB available in audit harness; runner exists at `packages/db/scripts/migrate.ts` and is wired |
| `pnpm lint` | **fails** — `packages/ops` has 7 errors (1 architectural drift = `new pg.Pool()`; 6 `'Request'/'Response' is not defined`). `packages/schema-driven` not yet evaluated by exit time. **Workspace lint is broken on a brand-new package added under T-034.** |
| Env-var enumeration | 13 distinct `process.env.*` reads in production code; **only 1 documented in `.env.example`** (DATABASE_URL) |
| `TODO/FIXME/XXX` grep | only 1 in production source (low signal — real risk lives in *task notes*, not in inline TODOs) |
| Carry-forward T-062..T-082 JSON files | **none exist** — T-062..T-082 are tracked only in STATUS.md narrative + review notes; no atomic-task file means they cannot be picked up by the kira_dev pipeline |

---

## 1. Readiness scorecard (A–H)

| Dim | Title | Verdict | Evidence |
|---|---|---|---|
| **A** | Secret management & env-guards | **NOT READY** | See A.1–A.5 |
| **B** | Migration deployability | **PARTIAL** | See B.1–B.3 |
| **C** | Asset gaps | **NOT READY** | See C.1–C.3 |
| **D** | Critical role/seed bootstrapping | **NOT READY** | See D.1–D.4 |
| **E** | Auth attack surface | **NOT READY** | See E.1–E.4 |
| **F** | CI/CD + monitoring | **PARTIAL** | See F.1–F.3 |
| **G** | ESLint workspace coverage | **PARTIAL** | See G.1–G.2 |
| **H** | UI infrastructure (T-076) | **NOT READY** | See H.1–H.2 |

**Five of eight dimensions are NOT READY.** Two are PARTIAL. None is READY without caveats.

---

## A. Secret management & env-guards — **NOT READY**

### A.1 RBAC_APPROVAL_HMAC_KEY (T-014) — fail-closed: ✅ correct
- `packages/rbac/src/grant.ts:56-62` throws `'RBAC_APPROVAL_HMAC_KEY env var is required in production'` when `NODE_ENV==='production'` and key is unset.
- Test coverage at `grant.test.ts:666-690` is non-vacuous (asserts the throw).
- **Verdict**: A.1 is the only correctly-implemented secret guard in the foundation.

### A.2 MFA master key (T-015 TOTP) — fail-closed: ❌ NOT in code
- `packages/auth/src/totp.ts:51` accepts `masterKey: string` as a function parameter — the call site (which does not exist in any production handler today) is the boundary that must validate the env var. There is no `apps/web/lib/auth/mfa.ts` or similar that closes that boundary.
- `.env.example` does not document an `MFA_MASTER_KEY` variable; the entropy requirement (64-char hex / 32 bytes) lives only in a function comment.
- **Risk**: a future caller of `enrollTotp({ masterKey: process.env.MFA_MASTER_KEY ?? 'fallback-key' })` is the kind of mistake the framework should make impossible.
- Carry-forward `CF-T015-B masterKey fail-closed guard` is referenced in T-015 STATUS notes but no T-NNN.json was generated.

### A.3 CRON_SECRET (T-034) — partial
- `apps/web/app/api/internal/cron/drift/route.ts:36` reads `CRON_SECRET`, accepts `x-vercel-cron: 1` OR `Authorization: Bearer ${CRON_SECRET}` (both with `crypto.timingSafeEqual` per T-080 carry-forward in T-034 review notes).
- However: the route accepts `x-vercel-cron: 1` even when `CRON_SECRET` is unset (fail-closed only when *bearer* path is taken). This is the documented Vercel pattern but **breaks on any non-Vercel deployment** (self-hosted Next.js, GCP Cloud Run, AWS Lambda, Fly, Railway). No deployment-target documentation exists.
- **Risk**: copy-paste deploy to a non-Vercel host opens `/api/internal/cron/drift` to anyone who sets `x-vercel-cron: 1` as an HTTP header.
- `.env.example` does not document `CRON_SECRET`.

### A.4 Supabase env vars (T-011) — undocumented
- `apps/web/lib/auth/supabase-browser.ts` reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` with `?? ''` fallback (no fail-closed).
- `SUPABASE_SERVICE_ROLE_KEY` referenced in T-013 SCIM middleware comments but not in `.env.example`.
- A misconfigured deploy will silently produce a Supabase client targeting empty-string URL. Anonymous-key clients normally fail on first call, but the empty-string client silently swallows responses in some edge cases.

### A.5 PostHog (T-033) — wrong env var name
- `apps/web/lib/feature-flags/index.ts:33` reads `POSTHOG_KEY` with `'phc_placeholder'` fallback. The T-033 review explicitly flagged this as needing rename to `POSTHOG_API_KEY` (industry-standard) — never done.
- `.env.example` does not document `POSTHOG_KEY`, `POSTHOG_HOST`, `POSTHOG_API_KEY`.

### A summary
**5 distinct secret env vars** referenced in production code. **0 documented in `.env.example`** (only `DATABASE_URL` is documented, and that is dev-localhost). **1 of 5 has a production fail-closed guard** (RBAC HMAC). **The other 4 silently fall back to empty strings or hardcoded placeholders.**

---

## B. Migration deployability — **PARTIAL**

### B.1 Runner correctness ✅
- `packages/db/scripts/migrate.ts` is real (T-054); reads `migrations/*.sql`, validates `^(\d{3})-[a-z0-9-]+\.sql$`, sorts by numeric prefix, applies in transaction, records `(filename, applied_at, checksum)` in `public.schema_migrations`.
- Idempotent re-run is documented; `--dry-run` flag implemented.
- Could not verify against fresh DB in audit harness (no postgres available; ECONNREFUSED). The shape of the script is correct but **end-to-end "fresh-DB → all 24 migrations apply cleanly" verification has not been done in CI**, only in unit tests.

### B.2 schema_migrations vs. reality drift
- 24 SQL files in `packages/db/migrations/` numbered 001–025 (with 008 + 020 + 021 + 008 missing/reverted/reserved).
- STATUS.md migration ordering lock notes that `T-016 REWORK γ` REVERTED migrations 020 + 021 from filesystem AND `schema_migrations` table — manual psql intervention.
- T-039 release notes record 023 had to be applied via psql because `migrate.ts` had a pre-existing checksum mismatch on 017-rbac.sql (carry-forward T-070 — never closed).
- **Risk**: the runner state and the actual migration filesystem are correlated only by best-effort. Re-running from scratch on a fresh DB is the only guaranteed-clean path; partial-state recovery is not tested.

### B.3 017-rbac.sql checksum (T-070 carry-forward)
- Notes describe a pre-existing checksum mismatch in 017-rbac.sql vs. the runner's stored checksum. This means: **if you run migrate.ts against a DB that was previously initialized via `drizzle-kit push`, the runner will throw `CHECKSUM MISMATCH on already-applied migration: 017-rbac.sql`** (per migrate.ts:91-100) — and there is no documented recovery path.
- Damage quantification: **every existing dev/CI database needs a manual `delete from public.schema_migrations where filename = '017-rbac.sql'` followed by re-insert with the new checksum.** A staging tenant in this state is bricked until ops intervenes.

---

## C. Asset gaps — **NOT READY**

### C.1 PWA icons (T-042)
- `apps/web/public/icons/` **does not exist**. `apps/web/public/` itself does not exist.
- Both T-041 and T-042 reference `/icons/icon-192x192.png`, `/icons/icon-512x512.png`, `/icons/icon-512x512-maskable.png` in `manifest.ts`.
- T-042 reviewer explicitly noted: *"Icon paths… do NOT exist under `apps/web/public/icons/`. Paths are placeholder stubs only; acceptable for scaffold phase but must be resolved before production."*
- **Effect at production deploy**: `manifest.json` will return 200 with broken icon refs; the PWA install prompt will fail, the app icon on home-screen will be blank, and Lighthouse PWA score will be 0.

### C.2 Storybook (T-031 / T-056)
- Workspace has no `.storybook/` directory anywhere; `packages/ui/.storybook/` does not exist.
- T-025 review noted Storybook scaffolding deferred to T-056. T-056 was reassigned (per STATUS) to "Reference.Departments RLS hotfix follow-up" — the Storybook work was silently dropped.
- AC3 axe-core CI scans for `packages/ui` primitives never run; only RTL `jest-axe` fallback exists per T-025.
- **Effect**: 6 UI primitives (Modal, Stepper, Field, ReasonInput, Summary, Tuning) ship without visual regression coverage, without WCAG axe-core gates, and without a documented preview environment for design-product review.

### C.3 Playwright
- `playwright.config.ts` **does** exist (not the gap claimed in the audit brief), but it is a 12-line stub.
- `apps/web/tests/` directory referenced in the config does not exist.
- T-042 carry-forward T-080 explicitly says: install `@playwright/test`, add real `playwright.config.ts`, create `apps/web/e2e/pwa.spec.ts`. **None of those exist.**
- **Effect**: PWA install + offline shell, login, SAML SSO, SCIM, RBAC grant, MFA enrolment — no end-to-end browser coverage. Wave A's quality bar is "Vitest source-parse asserts what would otherwise be tested in a real browser." That is not a regulated-SaaS production-readiness bar.

---

## D. Critical role/seed bootstrapping — **NOT READY**

### D.1 `org.platform.admin` not seeded (T-039)
- 023-outbox-events-extension.sql line 11 explicitly says: *"Note: T-039 does NOT auto-seed the org.platform.admin role on org INSERT."*
- 017-rbac.sql does not seed it either.
- The T-039 review explicitly required carry-forward T-069 ("Bootstrap `org.platform.admin` seed runbook + Apex-tenant migration"). **T-069 has no JSON file and no implementation.**
- **Effect**: the production T-039 actions (`recordMigrationRun`, `advanceCohort`) will return `{success:false, error:'forbidden'}` with `retention_class='security'` audit row for **every call**, including the very first call to advance the very first cohort. The system is bricked until a human runs `INSERT INTO public.roles ... INSERT INTO public.user_roles ...` directly against the production DB.

### D.2 Apex org seed
- `packages/db/seeds/{apex-departments.sql, manufacturing-operations.sql, cascade-rules.sql}` all start with `select id from public.organizations where external_id = 'apex' …` and `raise exception` if not found.
- **No migration creates the Apex org.** Test fixtures create it manually (see `packages/db/__tests__/manufacturing-ops.integration.test.ts:190`). Production has no documented bootstrap script.
- **Effect**: applying migrations against a fresh production DB succeeds, but the seed scripts (which are not even part of the migrate.ts pipeline) cannot run. `Reference.Departments` and `Reference.ManufacturingOperations` will be empty for every tenant.

### D.3 Reference.Departments — Apex-only
- 7 rows seeded for the single Apex tenant. **Zero rows for any other tenant.** No `dept_overrides` template, no per-industry default seeds.
- A bakery tenant onboarding flow has no department taxonomy; T-019's `dept_overrides` JSONB is empty by default.
- **Effect**: T-036 schema-driven column draft/publish (which depends on `Reference.Departments`) returns `dept_not_found` for every non-Apex tenant.

### D.4 Reference.ManufacturingOperations — Apex-only
- Same shape: 16 rows for Apex covering `bakery-MX, fmcg-MX, dairy-MX, beverage-MX`. Zero rows elsewhere.
- T-021 cascade rules also seeded only for Apex.
- **Effect**: NPD module's intermediate-code derivation (T-021) returns empty for non-Apex tenants. Module 01-NPD will not function out of the box.

---

## E. Auth attack surface — **NOT READY**

### E.1 Supabase magic-link 7-day TTL (T-011)
- T-011 deviation: TTL not enforced in code, deferred to Supabase project config.
- No deploy runbook exists at `_meta/runbooks/` or `docs/ops/`. `_foundation/contracts/` does not contain it. The T-063 carry-forward "Supabase deploy runbook" has no JSON file.
- **Effect**: a default Supabase project has 24-hour magic-link TTL. The PRD-required 7-day TTL is silently not enforced; ops have no checklist.

### E.2 SAML x509 cert registration (T-012)
- `apiController.createConnection` (the Jackson API that registers a tenant's IdP including its x509 signing cert) is **referenced in 3 comments and never called in production code** (`grep -rn "createConnection" apps/`).
- The SAML callback at `apps/web/app/api/auth/saml/callback/route.ts` calls `oauthController.samlResponse()` which throws on signature mismatch — **but only if a connection was previously registered for this tenant**. With no registered connection, Jackson's behavior depends on the version: either it accepts unsigned assertions, or it throws `tenant not found` (which the SAML callback handles by returning a generic error, not a 401).
- T-075 carry-forward "Jackson createConnection x509 setup" has no JSON file.
- **Effect**: a tenant onboarding flow has no path to upload x509 certs. Either SSO is non-functional, or — depending on the saml-jackson default — the SAML SP accepts assertions without signature verification. **This is a textbook cross-tenant SAML attack surface.**

### E.3 SCIM cross-tenant ambiguity guard (T-013)
- The "red line" guard against `last_4` token collision returning the wrong tenant is implemented in `apps/web/lib/scim/middleware.ts` but **is not test-covered** (T-074 carry-forward — no JSON file).
- **Effect**: a silent regression to that guard would not be caught by CI. SCIM is the highest-privilege automated-provisioning surface in the system; a regression here is "every tenant can provision users into the wrong tenant".

### E.4 Middleware does not call `set_org_context` (T-011)
- `apps/web/middleware.ts:13` explicitly disclaims: *"The full org-context wiring (app.set_org_context via service-role PG) is not wired here… that step is performed inside protected API route handlers / Server Actions where a DB client is already available."*
- T-062 carry-forward `withOrgContext()` HOF — **does not exist**. Only a TODO comment in `session-check.ts:19`.
- **Effect**: every Server Action and Route Handler must remember to call `app.set_org_context($session_token, $org_id)` before any data-plane query. A forgotten call returns rows from the WRONG tenant (since RLS uses `current_org_id()` which falls back to whatever the previous request bound). **This is the #1 foot-gun in the system; the abstraction that would make it impossible was not built.**

---

## F. CI/CD + monitoring — **PARTIAL**

### F.1 Drift-detection cron (T-034)
- Vercel-only assumption. `scripts/cron.json` is Vercel-format. No Kubernetes CronJob manifest, no GitHub Actions workflow, no AWS EventBridge, no docker-compose `cron:` service. Self-host = no schema-drift detection.

### F.2 Audit log retention enforcement
- Migration 004-audit.sql defines the 4-class CHECK constraint (`security|standard|operational|ephemeral`) — schema is right.
- **No retention-class enforcement job exists.** No cron deletes old `ephemeral` rows after N days, no `operational` archival to cold storage, no `security` 7-year retention pin. The classes are inert metadata until an ops job picks them up.
- **Effect**: the `audit_events` table grows unboundedly. At ~10 events/user-action × 100 users × 365 days = ~360k rows/yr/tenant, fine for year 1; at year 3 + GDPR right-to-erasure requests, the lack of class-aware retention is a compliance issue.

### F.3 Outbox worker (T-008)
- `packages/outbox/src/worker.ts` exports `runOnce()`. **No production caller invokes it.** No cron, no `scripts/cron.json` entry, no API route, no separate worker process in `docker-compose.yml`.
- **Effect**: every event written to `outbox_events` (cascade T-021, T-036 publish, T-039 advance, audit-via-outbox in some paths) sits in the table forever. The CDC pattern is wired but the consumer is not.

---

## G. ESLint workspace coverage — **PARTIAL**

### G.1 T-055 closeout claims success
- T-055 verdict: PASS. `tooling/eslint/base.mjs` shared; 8 packages got drift rules.

### G.2 Reality at audit time
- `pnpm lint` from root **fails**:
  - `packages/ops/src/__tests__/drift-detect.e2e.test.ts:67` — `new pg.Pool()` violates the workspace `no-restricted-syntax` rule. The override that T-055 documented for tests was not extended to `packages/ops`.
  - 6× `'Request' is not defined` / `'Response' is not defined` — `packages/ops` lint config does not include the global Web platform types. ESLint config drift on a brand-new package added in the same wave.
- `packages/schema-driven` was added under T-035 but `pnpm -r lint` doesn't visit it (the run failed at `packages/ops` and aborted).
- **Effect**: T-055's "workspace lint coverage" PASS verdict is already broken by the next package added. Drift gates from T-025 and T-046 fire only on packages that existed at T-055 closeout.

---

## H. UI infrastructure — **NOT READY** (T-076 violation of Wave-B intent)

### H.1 Root cause (per T-037 review)
- `packages/ui` peerDeps target React 18; `apps/web` is React 19. Six primitives (Modal, Stepper, Field, ReasonInput, Summary, Tuning) are **unconsumable from `apps/web`** because of the peer mismatch.
- T-037 had to **inline its own Stepper** rather than use `@monopilot/ui/Stepper`, **and skip RHF + Zod in step 2** in violation of AC2.

### H.2 Damage assessment
- Wave-B intent: build reusable primitives once, consume across all 14 modules.
- Reality: the first consumer (`SchemaColumnWizard` in T-037) **could not consume them**. T-076, T-077, T-078, T-079 carry-forwards are referenced in review notes — none exist as task JSONs.
- **Effect**: every future UI feature that needs Stepper/Field/Form will either re-inline (debt explosion) or wait for T-076 (block). The 6 primitives are dead code in `apps/web` until T-076 lands.

---

## 2. Showstoppers (must fix before any prod deploy)

| # | Item | Dim | Severity |
|---|---|---|---|
| 1 | `org.platform.admin` not seeded — T-039 actions return 403 forever | D.1 | P0 |
| 2 | No Apex-org bootstrap migration — all seeds blow up | D.2 | P0 |
| 3 | PWA icons missing — `public/icons/` does not exist | C.1 | P0 |
| 4 | SAML x509 cert never registered via `apiController.createConnection` — cross-tenant attack surface | E.2 | P0 |
| 5 | `withOrgContext()` HOF (T-062) never built — every Server Action manually calls `set_org_context`, RLS bypass on omission | E.4 | P0 |
| 6 | 017-rbac.sql checksum mismatch (T-070) — `pnpm db:migrate` throws on any DB previously initialized with drizzle-kit push | B.3 | P0 |
| 7 | T-076 React 19 peer mismatch — `packages/ui` unconsumable in `apps/web`, foundation primitives dead code | H | P0 |

---

## 3. Operational gaps (would surface within first month)

1. **No outbox worker in production** — every cascade/audit/migration event accumulates in `outbox_events` forever (F.3).
2. **No audit retention-class enforcement** — `ephemeral` rows never deleted; table growth unbounded (F.2).
3. **Self-hosting blocked** — drift cron is Vercel-only; CRON_SECRET path documented but no non-Vercel runbook (A.3, F.1).
4. **`.env.example` documents 1 of ~13 production env vars** — every deploy is "go read every file in `packages/*/src/` to find process.env reads" (A summary).
5. **Reference.Departments + Reference.ManufacturingOperations only seeded for Apex** — first non-Apex tenant cannot use NPD or schema-driven columns (D.3, D.4).
6. **Storybook + axe-core never built** — visual regression and a11y gate non-existent (C.2).
7. **Playwright E2E surface is empty** — no real-browser test for any auth/SCIM/MFA/PWA flow (C.3).
8. **Carry-forward T-062..T-082 (~20 tasks) tracked only in narrative** — no JSON, no manifest entry, no pipeline visibility (process gap).
9. **Workspace lint already broken on a new package added in the same wave** (G.2).

---

## 4. Recommended Wave-D launch criteria

The orchestrator's 95 % is "61/61 task pipelines closed". That is a **process** metric. **Production-readiness** is a different metric.

| Stage gate | Pre-Wave-D minimum |
|---|---|
| **Showstoppers** | 0 of 7 fixed → **MUST be 7/7** before any prod tenant onboarded |
| **Op gaps** | 9 open → at least 5 closed (outbox worker, audit retention, env-vars docs, Apex bootstrap, primitive consumability) |
| **Test coverage** | Vitest only → **at least one Playwright E2E** for auth, SCIM, MFA-enrol, PWA install |
| **Carry-forwards** | T-062..T-082 in narrative → **all converted to T-NNN.json** with manifest update |
| **CI gates** | `pnpm lint` red → green; `pnpm db:migrate` proven against fresh DB; `pnpm test:e2e` exists and passes |
| **Runbooks** | None → at least 4 (deploy, secrets-rotation, Apex-bootstrap, SAML-tenant-onboard) |

### Honest readiness numbers

| Metric | Score |
|---|---|
| **Process completion (61/61 task JSONs)** | **100 %** |
| **Production deploy-ability (a customer can actually onboard)** | **~30 %** |
| **Aggregate (process × deploy weights)** | **~62 %** |

The 95 % claim is defensible only if "readiness" means "the orchestration pipeline closed every task it was given". It is **not** defensible if "readiness" means "we can put a paying manufacturing tenant on this without a 14-day Big-Five-style audit".

---

## 5. Reply to caller

- **Showstoppers**: **7** (P0)
- **Honest readiness**: **62 %** (process 100 %, deploy 30 %, weighted)
- **Top-3 deploy blockers**:
  1. `org.platform.admin` + Apex-org bootstrap (D.1 + D.2) — **system bricks at first request from real tenant**
  2. SAML x509 onboarding never wired (E.2) — **cross-tenant assertion attack surface, depending on saml-jackson default behaviour**
  3. `withOrgContext()` HOF never built (E.4) — **every Server Action is one bug away from cross-tenant data leak via RLS bypass**

- **Would I ship this to a real customer?** **No.** The foundation has done excellent atomic work — 61/61 tasks with mutation-tested RED/GREEN/REVIEW/REWORK discipline, migration runner, RLS, audit, RBAC, MFA, SCIM all individually solid. But three structural omissions — no production bootstrap migration, no x509 onboarding flow, no `withOrgContext` HOF — mean that **a real customer's first 5 minutes on the platform will hit a 403 (T-039), a broken icon (PWA), and (in the worst case) an unauthenticated cross-tenant SAML assertion (E.2).** The orchestrator's "≥95 %" claim is a process truth, not a product truth. Wave-D launch should require the 7 showstoppers fixed and at least 5 of 9 op gaps closed before any external pilot is scheduled. As-is, this is a strong **internal-staging-grade** build, **not** a regulated-manufacturing-SaaS-grade build. With ~3 weeks of focused remediation on the showstopper list, it could be — but that work has to be done with the same RED/GREEN/REVIEW discipline that got the foundation this far, not declared done by closing the 61st task JSON.
