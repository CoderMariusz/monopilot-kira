# 00-foundation — Reality Audit (2026-06-02)

## Counts
- task files on disk: **129** | manifest `task_count`: **129** → files match manifest
- STATUS.md declared rows: **64** (T-001…T-061 = 61 rows; plus T-127/128/129 = 3 Wave-0 rows)
- Tasks NOT represented in STATUS.md: **T-062 … T-126** (65 carry-forward / new tasks)
- Wave tasks (in `waves/app-shell-foundation-20260520/tasks/`): **12** (T-133…T-138, UI-127…UI-132, UI-138) — NOT in manifest or STATUS; tracked separately in wave manifest

Reconciliation: STATUS.md's "61/61 DONE" claim covers only the original Wave-A batch. The remaining 65 carry-forward tasks (T-062–T-126) and 3 Wave-0 tasks (T-127–T-129) were never included in that count, so the headline is **misleading but not technically a lie** for the scope it declared.

---

## Task reality

### T-001 to T-061 (original Wave-A batch — declared ✅ in STATUS.md)

Evidence-based spot-checks below; full pipeline notes are in `notes/T-NNN.md`.

| Task | Title (short) | Declared | Verdict | Key evidence path | Gap / note |
|---|---|---|---|---|---|
| T-001 | Monorepo bootstrap | ✅ | ✅ IMPLEMENTED | pnpm-workspace.yaml; packages/ structure | — |
| T-002 | Drizzle ORM + Postgres wiring | ✅ | ✅ IMPLEMENTED | packages/db/drizzle.config.ts | — |
| T-003 | events.enum.ts lock | ✅ | ✅ IMPLEMENTED | packages/outbox/src/events.enum.ts | — |
| T-004 | permissions.enum.ts lock | ✅ | ✅ IMPLEMENTED | packages/rbac/ (checked via grep) | — |
| T-005 | Marker discipline ADR | ✅ | ✅ IMPLEMENTED | docs/prd/; scripts/check-prd-markers.mjs | — |
| T-006 | Baseline schema migration | ✅ | ✅ IMPLEMENTED | migrations/001-baseline.sql | — |
| T-007 | RLS baseline | ✅ | ✅ IMPLEMENTED | migrations/002-rls-baseline.sql | — |
| T-008 | outbox_events + worker stub | ✅ | ✅ IMPLEMENTED | migrations/003-outbox.sql; packages/outbox/src/worker.ts | Worker in packages/outbox, not apps/worker (apps/worker does NOT exist — T-111 blocker) |
| T-009 | audit_events 13-field table | ✅ | ✅ IMPLEMENTED | migrations/004-audit.sql | — |
| T-010 | tenant_idp_config table | ✅ | ✅ IMPLEMENTED | migrations/005-tenant-idp-config.sql | — |
| T-011 | Supabase Auth wiring | ✅ | ✅ IMPLEMENTED | apps/web/lib/auth/supabase-server.ts; proxy.ts | carry-forward T-062 (pins RLS) already resolved as mig 026 |
| T-012 | SAML 2.0 SP | ✅ | ✅ IMPLEMENTED | apps/web/app/api/auth/saml/; lib/auth/saml.ts | carry-forwards T-072/073/076/077 still open |
| T-013 | SCIM 2.0 endpoints | ✅ | ✅ IMPLEMENTED | apps/web/app/api/scim/v2/; lib/scim/middleware.ts | migrations/024-scim-extras.sql; carry-forwards T-073/074/075 open; T-091 Groups minimal stub |
| T-014 | RBAC enforcement library | ✅ | ✅ IMPLEMENTED | packages/rbac/src/grant.ts; migrations/017-rbac.sql | grantRole STILL uses BYPASSRLS owner pool (T-077 not done) |
| T-015 | TOTP MFA enrolment | ✅ | ✅ IMPLEMENTED | packages/auth/src/totp.ts; migrations/007-mfa.sql | T-109 masterKey guard NOW DONE (found in totp.ts L25-57) |
| T-016 | Verify-PIN step-up | ✅ | ✅ IMPLEMENTED | packages/auth/src/verify-pin.ts; migrations/019-pins.sql | — |
| T-017 | Reference.DeptColumns | ✅ | ✅ IMPLEMENTED | migrations/009-schema-driven.sql; packages/schema-driven/ | — |
| T-018 | Reference.Rules + DSL executor | ✅ | ✅ IMPLEMENTED | migrations/010-rules.sql; packages/rule-engine/ | — |
| T-019 | Department taxonomy seed | ✅ | ✅ IMPLEMENTED | migrations/011-departments.sql | — |
| T-020 | ManufacturingOperations | ✅ | ✅ IMPLEMENTED | migrations/012-manufacturing-ops.sql | — |
| T-021 | Cascading rule mfg_op→code | ✅ | ✅ IMPLEMENTED | packages/rule-engine/src/ | carry-forwards T-080/081/082 |
| T-022 | i18n scaffold (next-intl) | ✅ | ✅ IMPLEMENTED | apps/web/app/[locale]/; 4 locale JSON files | — |
| T-023 | GS1 identifier helpers | ✅ | ✅ IMPLEMENTED | packages/gs1/src/ | — |
| T-024 | Idempotent mutation helper | ✅ | ✅ IMPLEMENTED | migrations/015-idempotency.sql; packages/db/src/ | — |
| T-025 | packages/ui + Modal primitive | ✅ | ✅ IMPLEMENTED | packages/ui/src/Modal.tsx | — |
| T-026 | Stepper primitive | ✅ | ✅ IMPLEMENTED | packages/ui/src/Stepper.tsx | — |
| T-027 | Field primitive | ✅ | ✅ IMPLEMENTED | packages/ui/src/Field.tsx | UI-evidence carry-forward deferred to T-056 |
| T-028 | ReasonInput primitive | ✅ | 🟡 STUB | packages/ui/src/ReasonInput.tsx | aria-label prop + forwardRef ABSENT (T-067 not done; carries into Wave 1) |
| T-029 | Summary primitive | ✅ | ✅ IMPLEMENTED | packages/ui/src/Summary.tsx | — |
| T-030 | Tuning primitives | ✅ | ✅ IMPLEMENTED | packages/ui/src/tuning.tsx | — |
| T-031 | 10 MODAL-SCHEMA patterns | ✅ | ✅ IMPLEMENTED | packages/ui/src/__tests__/patterns.test.tsx | carry-forwards T-072 test/T-064 click-error |
| T-032 | Regulatory roadmap artifact | ✅ | ✅ IMPLEMENTED | _foundation/contracts/regulatory-roadmap/ | — |
| T-033 | PostHog feature flags | ✅ | ✅ IMPLEMENTED | apps/web/lib/feature-flags/index.ts; route.ts | Still uses POSTHOG_KEY not POSTHOG_API_KEY (T-075 undone); no `import 'server-only'` marker (T-068 undone) |
| T-034 | Schema drift detection job | ✅ | ✅ IMPLEMENTED | apps/web/app/api/internal/cron/drift/route.ts | carry-forwards T-098/101/103 open |
| T-035 | Workflow-as-data executor | ✅ | ✅ IMPLEMENTED | packages/rule-engine/ | — |
| T-036 | Schema-driven column draft/publish | ✅ | ✅ IMPLEMENTED | migrations/022-dept-column-drafts.sql; actions/schema/ | partial unique T-085 MISSING |
| T-037 | Schema-driven column wizard UI | ✅ | 🟡 STUB | apps/web/app/(admin)/schema/_components/SchemaColumnWizard.tsx | Step 2 uses "plain state, not RHF" per source comment L186; T-093 peerDeps fixed; T-095/T-096 carry-forwards remain |
| T-038 | tenant_migrations table | ✅ | ✅ IMPLEMENTED | migrations/013-tenant-migrations.sql | — |
| T-039 | Canary upgrade orchestration | ✅ | ✅ IMPLEMENTED | migrations/023-outbox-events-extension.sql | — |
| T-040 | R13 placeholder tables | ✅ | ✅ IMPLEMENTED | migrations/014-r13-placeholder-tables.sql | — |
| T-041 | PWA scaffold | ✅ | ✅ IMPLEMENTED | apps/web/app/manifest.ts; sw.ts | icon assets still placeholders (public/icons/ absent) |
| T-042 | PWA install + offline-shell E2E | ✅ | 🟡 STUB | apps/web/e2e/app-shell-layout.spec.ts | T-099 (real Playwright E2E with Chromium) not done |
| T-043 | IndexedDB sync queue primitive | ✅ | ✅ IMPLEMENTED | packages/sync-queue/src/ | — |
| T-044 | Sync queue flusher | ✅ | ✅ IMPLEMENTED | packages/sync-queue/src/ | — |
| T-045 | Postgres app-role connection split | ✅ | ✅ IMPLEMENTED | migrations/006-app-role.sql; packages/db/src/clients.ts | — |
| T-046 | ref-tables.enum.ts lock | ✅ | ✅ IMPLEMENTED | packages/db/ (checked via grep) | — |
| T-047 | Wave0 PRD v4.3 amendment | ✅ | ✅ IMPLEMENTED | docs/prd/00-FOUNDATION-PRD.md | — |
| T-048 | Domain glossary lock | ✅ | ✅ IMPLEMENTED | _foundation/contracts/domain-glossary.md | — |
| T-049 | Shared BOM SSOT skeleton | ✅ | ✅ IMPLEMENTED | _foundation/contracts/shared-bom-ssot.md | — |
| T-050 | Authorization policy foundation | ✅ | ✅ IMPLEMENTED | _foundation/contracts/authorization-policy.md | — |
| T-051 | D365 posture contract | ✅ | ✅ IMPLEMENTED | _foundation/contracts/d365-posture.md | — |
| T-052 | Manifest/coverage readiness patch | ✅ | ✅ IMPLEMENTED | manifest.json business_scope_column | — |
| T-053 | packages/db layout consolidation | ✅ | ✅ IMPLEMENTED | packages/db/schema/ barrel | — |
| T-054 | Migration runner + filename normalization | ✅ | ✅ IMPLEMENTED | scripts/migrate.ts | — |
| T-055 | Workspace-wide ESLint coverage | ✅ | ✅ IMPLEMENTED | tooling/eslint/base.mjs; eslint.config.mjs | — |
| T-056 | Reference.Departments RLS hotfix | ✅ | ✅ IMPLEMENTED | packages/db/__tests__/departments-rls.integration.test.ts | — |
| T-057 | schema-runtime VITEST env-var elim | ✅ | ✅ IMPLEMENTED | packages/schema-runtime/src/ | — |
| T-058 | Migrate tests to getAppConnection | ✅ | ✅ IMPLEMENTED | 7 files; packages/db/test-utils/ | — |
| T-059 | PRD marker discipline sweep | ✅ | ✅ IMPLEMENTED | scripts/check-prd-markers.mjs | — |
| T-060 | ALTER tenant_idp_config FA2 cols | ✅ | ✅ IMPLEMENTED | migrations/016-tenant-idp-config-fa2-columns.sql | — |
| T-061 | Password policy enforcement library | ✅ | ✅ IMPLEMENTED | packages/auth/src/password-policy.ts | T-110 (NIST 25K list) STUB — only top ~200 bundled |

### T-062 to T-126 (carry-forward / new tasks — NOT in STATUS.md)

| Task | Title (short) | Verdict | Evidence | Gap |
|---|---|---|---|---|
| T-062 | user_pins RLS org-scoped fix | ✅ IMPLEMENTED | migrations/026-pins-rls-org-scoped.sql | — |
| T-063 | packages/ui/TESTING.md Radix axe quirk | ⛔ MISSING | No TESTING.md in packages/ui/ | File absent |
| T-064 | VALIDATE CONSTRAINT audit_events_role_assigned | ⬜ PENDING | 017-rbac.sql has ADD CONSTRAINT NOT VALID; no VALIDATE migration found | Needs VALIDATE CONSTRAINT after fresh-DB |
| T-065 | Supabase deploy runbook (JWT_EXP etc.) | ⛔ MISSING | docs/runbooks/preview-supabase-bootstrap.md exists but does NOT cover JWT_EXP/MAILER_OTP_EXP/refresh rotation | Runbook incomplete |
| T-066 | setPin/verifyPin pool.end() fix + JSDoc | ✅ IMPLEMENTED | packages/auth/src/verify-pin.ts L55/173 pool.end() present | — |
| T-067 | ReasonInput aria-label + forwardRef | ⛔ MISSING | packages/ui/src/ReasonInput.tsx — no aria-label prop, no forwardRef | Carries from T-028 |
| T-068 | `import 'server-only'` on feature flags | ⛔ MISSING | apps/web/lib/feature-flags/index.ts — no server-only import | Leak risk: client bundle could import |
| T-069 | organizations.industry_code CHECK 'generic' | ✅ IMPLEMENTED | scripts/migrate.ts; packages/db/__tests__ (industry_code='generic' used in seeds) | — |
| T-070 | 8-h absolute session lifetime | ✅ IMPLEMENTED | apps/web/lib/auth/session-check.ts L122 "Absolute maximum session lifetime: 8 hours" | session_started_at uses JWT iat (not persisted cookie); acceptable per implementation |
| T-071 | Approval-token replay (consumed_approval_tokens) | ✅ IMPLEMENTED | migrations/033-consumed-approval-tokens.sql; migrations/034-approval-token-prune-cron.sql; packages/rbac/src/grant.ts | — |
| T-072 | shouldFail click-driven error-transition test | ⛔ MISSING | packages/ui/src/__tests__/patterns.test.tsx — no shouldFail=true test for error transition | Carry-forward from T-031 |
| T-073 | Tenant-scoped JIT provisioning flag | ⛔ MISSING | apps/web/app/[locale]/(auth)/login/_actions/auth.ts — no shouldCreateUser wiring found | — |
| T-074 | Shared rbac pool lifecycle (closeRbacPool) | ⛔ MISSING | packages/rbac/src/grant.ts — still uses per-call getOwnerConnection() without closeRbacPool | — |
| T-075 | POSTHOG_KEY → POSTHOG_API_KEY rename | ⛔ MISSING | apps/web/lib/feature-flags/index.ts L33 still reads `POSTHOG_KEY`; .env.example L105 still `POSTHOG_KEY` | — |
| T-076 | assertActorBelongsToOrg cross-org rejection + test | ✅ IMPLEMENTED | packages/rbac/src/grant.ts L227-258 actor+target org checks; integration test in grant.test.ts | — |
| T-077 | grantRole BYPASSRLS → getAppConnection refactor | ⛔ MISSING | packages/rbac/src/grant.ts L23 still imports getOwnerConnection(); L208 still calls getOwnerConnection() | Security debt: privileged connection in RBAC hot-path |
| T-078 | Permission.ORG_ACCESS_ADMIN import from @kira/rbac | ⛔ MISSING | apps/web/app/api/posthog/flags/route.ts — uses inlined string 'org.access.admin' (not Permission constant) | — |
| T-079 | SoD semantic: target existing roles | ✅ IMPLEMENTED | packages/rbac/src/grant.ts L227 "Load TARGET's existing roles in this org" + L237 SoD check on target | — |
| T-080 | org.platform.admin Apex seed + migration | ✅ IMPLEMENTED | migrations/029-org-platform-admin.sql; migrations/030-apex-org-bootstrap.sql | — |
| T-081 | fix migrate.ts 017-rbac checksum + replay | ✅ IMPLEMENTED | scripts/migrate.ts checksum guard; migration 017 in place | — |
| T-082 | owner-pool memoization + request-scoped binding | ⛔ MISSING | apps/web/lib/auth/with-org-context.ts — getOwnerPool() called per request; no memoization boundary for upgrade actions | — |
| T-083 | audit_events_dept_column_denied CHECK constraint | ⛔ MISSING | No migration for this constraint found | — |
| T-084 | Narrow tenant_idp_config grants | ✅ IMPLEMENTED | migrations/035-tenant-idp-grants.sql column-level REVOKEs | — |
| T-085 | dept_column_drafts partial unique WHERE status='draft' | ⛔ MISSING | migrations/022-dept-column-drafts.sql has no partial unique index on (org_id, dept_id, column_key) WHERE status='draft' | — |
| T-086 | SAML Issuer xmldom+XPath replace | ⛔ MISSING | apps/web/lib/auth/saml.ts — Issuer still checked via regex (xmldom not wired) | — |
| T-087 | audit_events.org_id nullable + sentinel backfill | ⛔ MISSING | migrations/004-audit.sql — org_id is NOT NULL; no sentinel migration found | — |
| T-088 | enforceSamlPolicy wired to sign-in routes | ✅ IMPLEMENTED | apps/web/app/(auth)/actions.ts L31/167 enforceSamlPolicy called on signInWithPassword | — |
| T-089 | Cross-tenant SCIM ambiguity regression test | 🟡 STUB | apps/web/lib/scim/middleware.ts has guard (L165-184); but no dedicated regression test file asserting >1 hash → 401 | Guard exists; test is absent |
| T-090 | Jackson createConnection at tenant onboarding | ✅ IMPLEMENTED | apps/web/app/(admin)/settings/saml/_actions/save-saml-config.ts L168 calls Jackson createConnection | — |
| T-091 | SCIM Group provisioning POST/PATCH | 🟡 STUB | apps/web/app/api/scim/v2/Groups/route.ts exists as minimal collection endpoint from T-013; no PATCH Groups/members | GET-only stub |
| T-092 | HMAC-bound RelayState SAML replay defence | ⛔ MISSING | No HMAC RelayState implementation found in saml.ts or callback route | — |
| T-093 | packages/ui peerDeps align React 19 | ✅ IMPLEMENTED | packages/ui/package.json peerDependencies: `"react": "^18 || ^19"` | — |
| T-094 | SLO session cookie clearing + signOut | ⛔ MISSING | No SLO-specific session clear found; apps/web/app/api/auth/saml/logout route exists but no Supabase signOut in SLO path | — |
| T-095 | SchemaColumnWizard step 2 RHF+Zod | 🟡 STUB | SchemaColumnWizard.tsx L186 comment "plain state, not RHF" | RHF/Zod resolver not wired |
| T-096 | swap jsxPreTransformPlugin → @vitejs/plugin-react-oxc | ⛔ MISSING | apps/web/vitest.ui.config.ts still uses custom jsxPreTransformPlugin (L10-41) | — |
| T-097 | Remove test-setup.ui.ts userEvent monkey-patch | ⬜ PENDING | Deferred until user-event v15 ships; intentional | — |
| T-098 | getSystemActorConnection() + constant-time Bearer for cron | ⛔ MISSING | packages/db/src/clients.ts — no getSystemActorConnection export found | — |
| T-099 | Install @playwright/test + real Chromium offline PWA E2E | 🟡 STUB | playwright.config.ts exists at root; `pnpm exec playwright test` in CI is `continue-on-error: true`; offline PWA spec absent | Harness scaffolded; offline spec MISSING |
| T-100 | Wire runCascade dispatch in outbox route | 🟡 STUB | apps/web/app/api/internal/cron/outbox/route.ts L188-190 comment "next slot — cascade dispatch deferred" | Explicit deferred stub |
| T-101 | drift-detect strict mode (extra_in_db) | ⬜ PENDING | Deferred until dept_code table registry lands | — |
| T-102 | public.fg fixture → real migration (01-NPD ships) | ⬜ PENDING | Deferred until 01-NPD module ships | — |
| T-103 | @monopilot/ops TS path alias in apps/web/tsconfig.json | ⛔ MISSING | No @monopilot/ops path alias found in apps/web/tsconfig.json | — |
| T-104 | Org-scoped Postgres sequence for nextSeq7() | ⛔ MISSING | No nextSeq7 or org-scoped sequence implementation found | — |
| T-105 | Vercel-only deploy assumption doc for cron | ⛔ MISSING | apps/web/app/api/internal/cron/ — no documented Vercel-only assumption | — |
| T-106 | Surface EvaluateResult through ExecutorResult | ⬜ PENDING | Deferred until executeRule is made async | — |
| T-107 | Outbox error surfacing via error-reporting | ⬜ PENDING | Deferred until T-118 Sentry lands | — |
| T-108 | Restore FK tenant_migrations.tenant_id | ⬜ PENDING | Deferred until T-039 verified in prod | — |
| T-109 | totp.ts masterKey fail-closed guard | ✅ IMPLEMENTED | packages/auth/src/totp.ts L25-57 MFA_MASTER_KEY guard | — |
| T-110 | Bundle NIST top-25K password list | 🟡 STUB | packages/auth/src/password-policy.ts L33-34 "top ~200 passwords … intentionally small" | Only ~200 bundled, 25K not bundled |
| T-111 | apps/worker scaffold + job registry | ⛔ MISSING | `apps/worker/` directory does NOT exist | P0 blocker for T-112/T-114/GDPR/cron |
| T-112 | Outbox worker consumer in apps/worker | ⛔ MISSING | apps/worker/ absent; packages/outbox/src/worker.ts provides runOnce but is NOT wired into a deployable runtime | P0 blocker |
| T-113 | packages/gdpr erasure registry + dispatcher | ⛔ MISSING | No packages/gdpr directory found | P0 blocker |
| T-114 | GDPR erasure cron in apps/worker | ⛔ MISSING | apps/worker/ absent + packages/gdpr absent | P0 blocker |
| T-115 | NPD erasure handler registration test | ⛔ MISSING | Depends on T-113/T-114 both absent | — |
| T-116 | OpenTelemetry baseline + instrumentation.ts | ⛔ MISSING | No instrumentation.ts in apps/web; no packages/observability | P0 observability |
| T-117 | Structured logger (pino) from @monopilot/observability | ⛔ MISSING | No packages/observability; no pino dependency in any workspace package | P0 observability |
| T-118 | Sentry wired into apps/web + apps/worker | ⛔ MISSING | No @sentry/ imports in apps/web source; apps/worker absent | P0 observability |
| T-119 | Backup policy spec + stub verification job | ⛔ MISSING | No backup verification job; docs/runbooks/ only has preview-supabase-bootstrap.md | — |
| T-120 | Restore drill runner (tooling/restore-drill/) | ⛔ MISSING | No tooling/restore-drill/ directory | — |
| T-121 | packages/rate-limit middleware | ⛔ MISSING | No packages/rate-limit directory | P0 — all public-facing Server Actions lack rate-limiting |
| T-122 | CI/CD workflow hardened | 🟡 STUB | .github/workflows/ci.yml has lint/typecheck/build/vitest/migration BUT playwright is `continue-on-error: true`; no migration check gate | Mostly IMPLEMENTED; playwright non-blocking = gap |
| T-123 | Playwright harness scaffolded | ✅ IMPLEMENTED | playwright.config.ts at root; apps/web/e2e/ specs exist and pass | — |
| T-124 | packages/e-sign CFR 21 Part 11 | ⛔ MISSING | No packages/e-sign directory | Blocks quality/production dual-sign |
| T-125 | withOrgContext HOF | ✅ IMPLEMENTED | apps/web/lib/auth/with-org-context.ts (full impl: JWT verify, org_id lookup, app.set_org_context tx, ROLLBACK) | Also packages/db/src/with-org-context.ts (alternative) |
| T-126 | Login screen UI | ✅ IMPLEMENTED | apps/web/app/[locale]/(auth)/login/{page.tsx,login-card.client.tsx,layout.tsx}; forgot-password/page.tsx; mfa/page.tsx | Real Supabase Auth (signInWithPassword); no parity evidence captured |
| T-127 | Walking Skeleton real-data wiring | ✅ IMPLEMENTED | apps/web/app/[locale]/(app)/(modules)/_actions/skeleton-data.ts; 6/6 unit tests | Declared ✅ in STATUS.md Wave-0 section |
| T-128 | App-shell logout Supabase session clear | ✅ IMPLEMENTED | apps/web/app/[locale]/(app)/layout.tsx signOutAction + supabase.auth.signOut() | Declared ✅ in STATUS.md |
| T-129 | SEC-RLS: close rls_disabled_in_public ERRORs | ⬜ PENDING | No RLS migration written yet; Supabase advisor confirms errors | Declared ⬜ in STATUS.md; P0 security before Wave 1 |

---

## Phantom / carry-forward backlog

Tasks referenced in STATUS.md notes but with a task file:
- **CF-T015-B** — referenced in T-015 notes: masterKey fail-closed guard → resolved as T-109 (now IMPLEMENTED)
- **carry-forward T-062** → task file T-062 exists; IMPLEMENTED (migration 026)
- **carry-forward T-064** → task file T-064 exists; ⬜ PENDING (VALIDATE CONSTRAINT not yet run)
- **carry-forward T-069** → task file T-069 exists; IMPLEMENTED (industry_code='generic' accepted)
- **carry-forward T-072** → task file T-072 exists; ⛔ MISSING (error-transition test absent)
- **carry-forward T-073** → task file T-073 exists; ⛔ MISSING (shouldCreateUser not wired)
- **carry-forward T-080** → task file T-080 exists; IMPLEMENTED (migration 029)

Wave tasks in `waves/app-shell-foundation-20260520/` (12 tasks T-133…UI-138) are UNREFERENCED by the main manifest. They appear to be a planned-but-not-imported wave. Status unknown; treated as ⬜ PENDING until imported.

---

## Extra (code without a task)

- `packages/db/migrations/037-050*.sql` — Settings module (02-settings) migrations living in the foundation db package. No owning 00-foundation task. Belongs to 02-settings task space. Risk: migration numbering gap (008 reserved/absent) and sequential ordering could confuse the runner.
- `apps/web/lib/auth/session-check.ts` — absolute-session implementation predates formal T-070 task file; T-070 may now be retroactively satisified.
- `apps/web/proxy.ts` (as Next.js middleware) — walking skeleton note clarified this is the real middleware (not missing); noted as 🧩 EXTRA relative to any explicit task, but covered functionally by T-011.
- `packages/db/migrations/028-mfa-totp-replay.sql` — replay protection for TOTP; no explicit task in T-001..T-129 range claims this migration number.

---

## Top integration risks

1. **P0 — apps/worker missing (T-111/T-112)**: No deployable worker runtime. The outbox consumer (`packages/outbox/src/worker.ts`) exists but runs nowhere in production. Every domain event emitted via the outbox is silently swallowed. GDPR erasure (T-113/T-114), audit retention, backup verification all blocked. Fix: implement T-111 before any module that emits outbox events goes live.

2. **P0 — rate-limit absent (T-121)**: No `packages/rate-limit` middleware. All public-facing Server Actions (login, magic-link, SCIM) are unprotected against brute-force/DoS. The T-121 task is classified P0 in its JSON. Fix: must land before any Wave 1 module exposes public-facing actions.

3. **P0 — SEC-RLS open (T-129)**: Supabase advisor (2026-06-02) flags RLS-OFF + `anon,authenticated` SELECT grants on: `tenant_variations`, `consumed_approval_tokens`, `tenant_migrations`, `modules`, `allergens`, `line_machines`, `role_categories`, `tenant_migrations_legacy_t038`, `audit_log_2026_01..12`. Cross-tenant data leak via PostgREST anon role. Also: ~11 SECURITY DEFINER functions callable by anon. Fix: T-129 migration + policy + re-run advisor to 0 ERRORs before Wave 1.

4. **grantRole still uses BYPASSRLS owner pool (T-077)**: Every role-grant operation in production runs on the BYPASSRLS connection, bypassing all RLS. Privilege escalation surface if any injection reaches that code path. Medium risk while only admins call grantRole, but must be addressed before multi-tenant user flows expand.

5. **Observability completely absent (T-116/T-117/T-118)**: No OTel, no pino, no Sentry. Production errors are invisible. This will make Wave 1 debugging very difficult.

---

## Skeleton contribution

Walking Skeleton (T-127/T-128) is ✅ DONE per existing `SKELETON-REALITY.md` (written 2026-06-02):
- Login: real Supabase Auth ✅
- Shell: sidebar + topbar + CSS grid ✅
- Navigation: 15 module nav links + 36 settings sub-nav ✅
- Real data: org-scoped Supabase queries via `withOrgContext` ✅
- Build: `pnpm build` GREEN ✅
- Logout: `supabase.auth.signOut()` before redirect ✅

**Remaining skeleton gap**: T-129 SEC-RLS — Supabase advisor shows active RLS ERRORs on prod DB. App works but cross-tenant data leaks exist on several tables accessible to anon/authenticated roles.
