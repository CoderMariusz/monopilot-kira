# 2026-05-14 — Foundation Primitives Additions

**Author:** parallel Opus agent (foundation primitives), responding to both 2026-05-14 audits.
**Sources:**
- `_meta/audits/2026-05-14-architecture-and-cross-cutting-gaps.md` (Auditor B — Top-10 architecture/foundation gaps).
- `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A — PRD-vs-tasks coverage gaps).
**Scope:** create 14 new atomic tasks under `_meta/atomic-tasks/00-foundation/tasks/` covering platform primitives that every module task implicitly assumed. Read-only on every other module's task graph.
**Coordination note:** at write time, a sibling Opus had materialized FT-002..FT-050 as T-062..T-110 (49 tasks). FT-001 (`withOrgContext`) was still pending another Opus. After collision the next free slot was **T-111**, so this batch occupies T-111..T-124.

---

## 14 new tasks

| Task | One-line scope |
|---|---|
| **T-111** | apps/worker scaffold — @monopilot/worker package, JobRegistry interface, env loader (Zod fail-closed), SIGTERM-draining shutdown, empty-registry vitest. |
| **T-112** | Outbox worker consumer — register @monopilot/outbox runOnce as 5s interval job, attempts column + outbox_dead_letter table migration, exponential backoff retry, testcontainers Postgres. |
| **T-113** | @monopilot/gdpr — per-domain ErasureHandler registry + tx-scoped runErasure dispatcher + `_foundation/contracts/gdpr.md` normative contract. |
| **T-114** | GDPR erasure cron — gdpr_erasure_requests migration (RLS), SELECT FOR UPDATE SKIP LOCKED cron in apps/worker, state machine pending→running→completed|failed. |
| **T-115** | NPD T-089 wire-up test — registers NPD erasure handler with @monopilot/gdpr; skips gracefully if NPD T-089 not yet merged; does NOT modify any 01-NPD task JSON. |
| **T-116** | OpenTelemetry baseline — @monopilot/observability package, NodeSDK + OTLP exporter, Next.js instrumentation.ts, worker init, InMemorySpanExporter smoke test. |
| **T-117** | Structured pino logger — re-exported from @monopilot/observability with curated redact allowlist (password/pin/token/subject_id/actor_user_id/etc); replaces apps/worker shim. |
| **T-118** | Sentry SDK — @sentry/nextjs in apps/web (client+server+edge configs) + @sentry/node in apps/worker, env-gated DSN, release tagging, redactBeforeSend reusing T-117 allowlist. |
| **T-119** | Backup policy spec — `_foundation/contracts/backup-policy.md` (RPO≤24h, RTO≤8h, 4 data classes) + apps/worker verification cron writing backup.verification.succeeded\|failed audit rows. |
| **T-120** | Restore drill runner — tooling/restore-drill/ script performing logical restore + smoke-query suite (schema, RLS, org-context, audit_events, outbox); quarterly cron wiring deferred to T-122. |
| **T-121** | @monopilot/rate-limit — token-bucket via Upstash/in-memory store, Next middleware + Server Action wrappers, presets for auth-login/magic-link/saml/scim/pin-verify, bound in apps/web/middleware.ts. |
| **T-122** | CI/CD hardening — `.github/workflows/ci.yml` removes continue-on-error from typecheck/lint/vitest/migration-check/playwright; adds drift check + PR-label gate + concurrency cancel + quarterly restore-drill.yml. |
| **T-123** | Playwright harness — production playwright.config.ts (4 projects: chromium/webkit/mobile-chrome/scanner-emulation), apps/web/e2e/fixtures.ts + smoke.spec.ts with @axe-core/playwright. |
| **T-124** | @monopilot/e-sign — CFR 21 Part 11 signEvent + dualSign (SoD enforced) + server-verified PIN via @monopilot/auth + replay-nonce guard + e_sign_log RLS table + paired audit_events (retention_class='security'). |

---

## P0 blockers (priority 90, `p0-blocker` label)

Seven of the 14 tasks are P0 deploy blockers per auditor B's top-10 list:

1. **T-111** apps/worker scaffold — blocks every background job in the system.
2. **T-112** Outbox worker consumer — without it every domain event accumulates (audited 2026-05-14, §4.3).
3. **T-113** @monopilot/gdpr registry+dispatcher — required by §13 success criterion.
4. **T-116** OpenTelemetry baseline — auditor B Top-10 Gap #3.
5. **T-121** Rate-limit middleware — auth/SAML/SCIM/magic-link endpoints unbound today.
6. **T-122** CI/CD hardened workflow — `pnpm lint` currently fails at root; Playwright + Storybook jobs are continue-on-error.
7. **T-123** Playwright harness — UI-PROTOTYPE-PARITY-POLICY requires Playwright traces in closeout; current `playwright.config.ts` is a 12-line stub.

---

## Contracts created under `_foundation/contracts/`

- `_foundation/contracts/gdpr.md` (created by T-113) — per-domain erasure handler protocol, tx-scoped semantics, audit-event names, sibling implementations, normative scope ("every module that holds user-FK PII").
- `_foundation/contracts/backup-policy.md` (created by T-119, appended to by T-120) — RPO/RTO table per data class, backup strategy (Supabase managed + WAL-G self-host), Postgres role list, encryption-at-rest, verification cron description, quarterly restore drill section pointing to `tooling/restore-drill/`.

The contract `_foundation/contracts/gdpr.md` is also referenced (appended) by T-117 to make the logger's PII-redaction policy normative for any code path touching `subject_id`.

---

## Manifest delta

Before this batch: `task_count: 110` (T-001..T-110, of which T-062..T-110 are FT-002..FT-050 carry-forward materializations).
After this batch: `task_count: 124` (T-001..T-124).

FT-001 (`withOrgContext` HOF) was being created concurrently by another Opus agent; it is **not** in this batch.

---

## Coverage delta

`_meta/atomic-tasks/00-foundation/coverage.md` appended with a `## Foundation primitives 2026-05-14` section listing all 14 tasks with their PRD anchors, P0 status, contracts created, and the inter-task dependency chain.

---

## Cross-module impact (informational; no module JSON modified by this batch)

- Every module's coverage.md "assumed `apps/worker` exists" note (NPD coverage.md says this explicitly) is now satisfied by **T-111**.
- 09-Quality and 08-Production translation-notes architectural rules ("Build a single shared `<ESignBlock>`", "dual-sign pattern", "server-verified PIN") are unblocked by **T-124**. UI components remain module-owned.
- All modules holding user-FK PII (Warehouse `signed_by`, Scanner `operator_id`, Quality e-sign signers, Production WO actor cols, Settings users, etc.) now have a registration target: **T-113**'s `registerErasureHandler(domain, fn)`. Module-side handlers are per-module follow-up tasks.
- The Playwright trace requirement of `UI-PROTOTYPE-PARITY-POLICY.md` is now technically deliverable by every module that adds an `apps/web/e2e/*.spec.ts` consuming the fixtures from **T-123**.

---

## Open items / follow-ups (advisory; no JSON written)

1. Per-module GDPR handler registrations: Warehouse, Scanner, Quality, Production, Settings each need a wire-up task analogous to T-115.
2. ESLint rule banning `console.log` in production code paths (referenced as P1 in T-117 risk red lines).
3. Real queue adapter for Azure Service Bus (T-112 ships a `LoggingQueue` stub).
4. Cron-expression scheduler abstraction (T-111 ships interval-only; documented as out-of-scope).
5. Storybook deploy gate promotion in CI (T-122 leaves storybook-build as continue-on-error until storybook quality-gate task lands).
6. The `withOrgContext` HOF (FT-001) is still owned by a separate parallel Opus; T-111's risk red lines call out that handlers must adopt it once it lands.
