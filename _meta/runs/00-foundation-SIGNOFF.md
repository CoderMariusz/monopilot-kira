# 00-foundation — Module Sign-off Report

**Run:** `/kira:run-module 00-foundation` · branch `kira/long-run` · 2026-06-03
**Result:** buildable scope COMPLETE. 129 module tasks → **123 done** (incl. 1 WONTFIX-by-design, 1 obsolete), **4 deferred** (upstream/lib/dead-scope/subsumed), **2 external gaps** (→ 01-npd). Zero tasks left in an unresolved (⬜/🔄/BLOCKED) state.

Validation env: **local Postgres** (`127.0.0.1:5432`, migrated 001-062) as the real Gate-1; docker unavailable so the DB-gated suites were run here directly. Supabase test project `khjvkhzwfzuwzrusgobp` is the deploy target (migrations apply at build time).

---

## 1. Task → feature map (by area)

Every pending task this run resolved to a user- or system-visible capability. Full per-task verdicts live in `_meta/atomic-tasks/00-foundation/STATUS.md`; grouped here:

### Background runtime — `apps/worker` (P0 spine)
- **T-111** worker scaffold + JobRegistry (interval scheduler, graceful SIGTERM drain). → a deployable worker process.
- **T-112** outbox consumer (all-org sweep → publish → `consumed_at`; attempts++; DLQ `outbox_dead_letter` at ≥5; mig 056). → reliable event delivery from the outbox.
- **T-114** GDPR erasure cron (claims pending requests → canonical two-pool `runErasure`; mig 057 `gdpr_erasure_requests`). → automated right-to-be-forgotten execution.
- **T-119** backup-verification cron (interval; `backup.verification.succeeded/failed` audit) + `_foundation/contracts/backup-policy.md` (RPO/RTO). → DR posture + verification.
- Worker control-plane pool = `getSystemActorConnection()` (owner/BYPASSRLS + `actor_type=system`) so cross-org sweeps are not RLS-blocked (consensus P1 fix).

### GDPR — `packages/gdpr`
- **T-113** erasure registry + two-pool dispatcher (owner registers `session_org_contexts` token; app pool runs RLS tx + ordered handlers; `resource_id` text; failure-audit on a separate connection, never masks the original error; dry-run SAVEPOINT). → org-scoped, audited, atomic PII erasure framework.

### Observability — `packages/observability`
- **T-116** OpenTelemetry baseline (tracer/meter/sdk-node, `OTEL_SDK_DISABLED` no-op) + `apps/web/instrumentation.ts` + worker `startNodeSdk`. → traces/metrics.
- **T-117** structured pino logger with secret redaction; worker logger backed by it. → safe structured logs.
- **T-118** Sentry (web client/server/edge + worker) with recursive PII/secret `redactBeforeSend`; no-op when DSN unset. → error reporting without leaking secrets.
- **T-107** outbox dispatch errors surfaced via observability (was silently swallowed; at-least-once preserved).

### AuthN/Z — `packages/auth`, `packages/rbac`
- **T-091** SCIM 2.0 Group provisioning (`/scim/v2/Groups` POST/PATCH/DELETE) via canonical `@monopilot/rbac.grantRole` + **new canonical `revokeRole`** (org-scoped, audited, `actorType:'system'` path for SCIM); mig 053 `scim_groups`/`scim_group_members` (org-scoped RLS). → IdP-driven group→role sync, cross-org-safe.
- **T-073** tenant-scoped JIT provisioning on magic-link (`shouldCreateUser = jit_provisioning===true`, deny-by-default). 
- **T-086** SAML Issuer parser (xmldom+XPath, namespace-robust) replacing the regex. **T-092** HMAC-bound RelayState (replay/tamper defence, fail-closed). **T-094** SLO clears cookies + Supabase signOut. **T-089** cross-tenant SCIM ambiguity regression test.
- **T-110** bundled 25k common-password list + policy rejection. **T-061-area** password policy intact.
- **T-074** rbac shared pool lifecycle + `closeRbacPool`. **T-077** WONTFIX-by-design (grantRole BYPASSRLS is the intended cross-org admin path, guarded by SoD/dual-control/membership/jti/HMAC — not RLS).
- **totp/verify-pin** pre-existing DB-test fixtures repaired (G1 debt) → full auth suite 84/84 → 89/89.

### Data plane — `packages/db` migrations 052-062
- **T-064** validate role-assigned audit CHECK (052). **T-083** dept-column-denied audit CHECK (058). **T-085** dept_column_drafts partial unique (059). **T-087** audit_events.org_id nullable for unauth events (060). **T-104** org-scoped `nextSeq7` sequence (061). **T-108** tenant_migrations_legacy_t038 FK restore (062). **mig 054** audit_events_id_seq grant (fixed a 004 gap blocking app_user audit writes).
- Drift gate (**T-122** `check:drift`) baseline regenerated from a pristine 001-062 migrate; **check:drift = 0 idempotent** (consensus P0 fix).

### Edge / platform
- **T-121** rate-limit integrated into `apps/web/proxy.ts` (Next 16 middleware) — edge-safe `InMemoryStore` default + `UpstashStore` for distributed prod; 429+Retry-After.
- **T-098** `getSystemActorConnection()` + constant-time cron Bearer wired into the real internal/cron routes; ESLint owner-conn gate hardened.
- **T-100** cascade dispatch wired into the outbox route (`runCascade`).
- **T-124** e-sign CFR-21 Part 11 (append-only `e_sign_log` mig 055, manifest = signer/intent/ts/SHA-256+nonce, locale-independent canonical hash, case-insensitive dual-signer SoD).
- **T-122** CI hardened (continue-on-error removed; restore-drill workflow; drift gate). **T-120** restore-drill runner (pg_dump→ephemeral restore→smoke). **T-099** Playwright offline-PWA E2E spec.

### UI — `packages/ui`, `apps/web`
- **T-028 + T-067** ReasonInput: forwardRef + aria-label + a11y (jest-axe 0) + Storybook + parity.
- **T-037 + T-095** SchemaColumnWizard: real Stepper + react-hook-form + Zod; **packages/ui migrated to React 19** (explicit, removing a monorepo-wide override flagged by review).
- **T-072** error-transition test; **T-063/T-065/T-105** docs (UI axe quirk, supabase-deploy runbook+verify script, cron-auth runbook); **T-068** `server-only` on feature-flags; **T-103/T-075/T-078** mechanical (`@monopilot/ops` alias, POSTHOG_API_KEY, Permission constant).

---

## 2. Known external gaps (do NOT block foundation — revisit when the named module lands)
- **T-102** — promote `public.fg` fixture → real migration. Blocking: **01-npd** (product/fg schema owner).
- **T-115** — NPD erasure handler registration test. Blocking: **01-npd/T-089** (the GDPR dispatcher framework + cron are done; the NPD-specific handler belongs to 01-npd).

## 3. Deferred (upstream/library/scope — not buildable now)
- **T-096** swap → `@vitejs/plugin-react-oxc` — no published version supports the repo's Vite 8 (would break the UI suite).
- **T-097** remove user-event monkey-patch — awaits `@testing-library/user-event` v15.
- **T-101** drift-detect strict mode — largely subsumed by T-122 `check:drift`; remainder awaits a dept_code table registry.
- **T-106** surface EvaluateResult through ExecutorResult — scope path (`packages/executor`) was retired into `@monopilot/rule-engine` by T-100; revisit when the rule-engine executor goes async.

## 4. Evidence
- **`pnpm --filter web build` → exit 0** (DoD; `ƒ Proxy (Middleware)` confirms Next 16 proxy.ts).
- **web typecheck = 0**; worker typecheck = 0.
- Foundation package suites on real local Postgres: auth **89**, rbac **45**, gdpr **7**, e-sign **12**, rate-limit **6**, observability **8**, worker **21**, ui **148** (+4 skip), outbox **18** (+3 skip) — all green.
- DB migrations **001-062** apply cleanly + idempotent; **check:drift = 0** across two independent reset→migrate cycles.
- Cross-org RLS isolation proven by the SCIM (2/2), GDPR, e-sign, and audit suites.
- Per-package lint = 0 (incl. the testcontainer raw-pool justification fix).
- **Routes to click (Vercel + Supabase):** `/{en}/login` → magic-link → app shell → 15 module nav links + 36 settings sub-nav → dashboard with real Supabase counts (Walking Skeleton T-127/128, still live). The foundation run hardened the infra beneath these routes (worker, RLS, observability, rate-limit, e-sign, SCIM) rather than adding new top-level screens; the one new admin surface is the SchemaColumnWizard at `/{en}/(admin)/schema`.

## 5. Known findings (non-blocking — flagged for the human / other modules)
- **[infra]** repo-wide `pnpm lint` OOMs locally (recursive eslint across ~21 packages); per-package lint is green. CI needs a heap bump or lint sharding.
- **[pre-existing, test-infra]** `@monopilot/db` FULL integration suite has ~10 failures when run together against a shared local DB (testcontainers-isolation-dependent: app-role SET-ROLE, migrate-runner stale "12 migrations"/0014-RED/drizzle-migrate, schema-metadata/tenant-l2 data-state). Each foundation task's own DB test passes individually; cross-org RLS proven. Needs per-test DB isolation (testcontainers/CI) the shared local DB can't provide. Also note: a destructive run of this suite can drop tables locally — run it in CI with a fresh DB.
- **[02-settings, cross-module]** mig 038-schema-metadata reuses `public.schema_migrations` (the foundation migrate runner's state table) for domain metadata — functional but a dual-use smell; 02-settings should rename it.
- **Manual:** enable Supabase Auth leaked-password protection (T-129 AC5, dashboard-only).

## 6. Consensus note
- **Claude (Opus):** reviewed every task during the run (cross-provider review of all Codex-written high-risk work; ~6/8 first-pass high-risk tasks were sent back for rework and re-verified). Sign-off: **YES** on the buildable scope.
- **Codex (gpt-5.5), independent module assessment:** round 1 = **BLOCK** (P0 drift baseline unsound; P1 worker control-plane pool RLS-scoped). Both resolved (P0 baseline regenerated from pristine migrate + idempotent check:drift=0; P1 worker → getSystemActorConnection). **Round 2 = SIGN-OFF** — Codex independently verified both: clean reset→migrate 000-062 + `check:drift` exit 0 (repeated twice; foundation placeholder tables lot/work_order/quality_event/shipment/bom_item present), worker 21/21 + typecheck 0, shared pool now `getSystemActorConnection()`. Agreed the 038 `schema_migrations` dual-use is non-blocking (02-settings). "No blocking findings remain."

**CONSENSUS: both providers sign off (Claude Opus YES + Codex SIGN-OFF round 2). Module ready for human review.**
