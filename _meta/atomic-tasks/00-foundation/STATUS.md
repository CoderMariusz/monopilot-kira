# 00-Foundation — Task Status Tracker

Updated by orchestrator after every PASS review.

## Legend
- ✅ DONE — implementation merged, review passed
- 🔄 IN PROGRESS — agent currently working
- ⏸ BLOCKED — failing review or unmet dependency
- ⬜ PENDING — not started

## Status

| Task | Title | Status | Notes |
|---|---|---|---|
| T-001 | Monorepo bootstrap | ✅ DONE | pre-existing (CHANGELOG, files verified) |
| T-002 | Drizzle ORM + Postgres dev wiring | ✅ DONE | pre-existing |
| T-003 | events.enum.ts source-of-truth lock | ✅ DONE | pre-existing |
| T-004 | permissions.enum.ts source-of-truth lock | ✅ DONE | pre-existing |
| T-005 | Marker discipline ADR + 15-module registry | ✅ DONE | pre-existing |
| T-006 | Baseline schema migration | ✅ DONE | pre-existing |
| T-007 | RLS baseline | ✅ DONE | pre-existing |
| T-008 | outbox_events table + worker stub | ✅ DONE | 003-outbox.sql R13+RLS+12-event CHECK; worker runOnce at-least-once; InMemoryQueue; 9 pass + 3 skip (no DB) |
| T-009 | audit_events 13-field table | ✅ DONE | RED+GREEN+REVIEW+REWORK×2+RE-REVIEW×2 PASS; 15/15 tests; trigger SECURITY DEFINER; UPDATE/DELETE assert real 42501; impersonation guard non-vacuous (proven by trigger-disable experiment) |
| T-010 | tenant_idp_config table | ✅ DONE | RED+GREEN+REVIEW PASS; 11/11 tests; 005 migration with F-U5 defaults + both admin roles in MFA + control-plane app_user revoke |
| T-011 | Supabase Auth wiring | ✅ DONE | RED+GREEN+OPUS-REVIEW+REWORK PASS; 13/13 + 55 web regression OK; @supabase/ssr server+browser clients; (auth)/actions.ts magic-link 7d; middleware chain (Supabase idle-check → next-intl); REWORK fixed: cookies() async per Next 16, anchored PUBLIC_PATHS; carry-forward T-062 withOrgContext HOF (P0 blocker for Server Action data-plane work); T-063 deploy runbook; T-064 8h absolute; T-065 tenant-scoped sign-up |
| T-012 | SAML 2.0 SP | ✅ DONE | RED+GREEN+OPUS-REVIEW PASS; 15/15 + 88/88 web; lazy Jackson singleton; RelayState equality + Issuer regex DiD; mig 025 GRANT SELECT app_user (out-of-scope, justified); carry-forwards T-072 narrow grant or service-role-only path, T-073 RelayState HMAC binding, T-074 enforceSamlPolicy caller wiring (currently dead code), T-075 Jackson createConnection x509 setup, T-076 SLO cookie/session clear, T-077 issuer XML namespace robustness |
| T-013 | SCIM 2.0 endpoints | ✅ DONE | RED+GREEN+OPUS-REVIEW PASS; 88 pass total + 10/10 SCIM + 12/12 mutation experiments; verifyScimBearer (last_4 → argon2id <10ms); withScimOrgContext (txn-scoped set_org_context + RLS app_user); soft-delete users.deleted_at; cross-tenant ambiguity guard (red line); carry-forwards T-073 nullable audit_events.org_id for security events, T-074 ambiguity guard regression test, T-075 Group provisioning; T-070 017-rbac checksum tracked |
| T-014 | RBAC enforcement library | ✅ DONE | RED+GREEN+OPUS-REVIEW+REWORK PASS; 26/26 tests (was 22 + 3 new + AC1 fixture corrected); 017-rbac.sql with seed_system_roles trigger + audit CHECK NOT VALID; REWORK fixed 3 P0: HMAC fail-closed in prod, assertUserBelongsToOrg actor+target guard, SoD on TARGET roles (not actor); carry-forward T-064 jti replay, T-065 pool.end fix, T-067 BYPASSRLS refactor, T-068 SoD-on-target test |
| T-015 | TOTP MFA enrolment | ✅ DONE | RED+GREEN+REVIEW+REWORK PASS; 60/60 tests (was 59 + 1 concurrent regression); 9 mutation experiments + 1 race-condition mutation; otplib v13 functional + libsodium secretbox HKDF; recovery codes argon2id BEGIN/FOR UPDATE atomic; WebAuthn stub phase_3_deferred; carry-forward CF-T015-B masterKey fail-closed guard |
| T-016 | Verify-PIN step-up | ✅ DONE | RED+GREEN+OPUS-REVIEW+REWORK PASS; 37/37 verify-pin+password tests; 019-pins.sql; argon2id m=65536/t=3/p=1; lockout 15min after 5 failures in 10min window; 5 mutation experiments confirmed; REWORK γ: REVERTED migrations 020+021 (production schema bandage); fixed verify-pin.test.ts seed instead (industry_code='generic', data_plane_url, region_cluster='eu'); carry-forward T-062 RLS USING(true) restore, T-063 caller-contract docs |
| T-017 | Reference.DeptColumns + json-schema-to-zod | ✅ DONE | GREEN+REVIEW PASS; 009-schema-driven.sql R13+RLS+8 seeds; compile.ts LRU cache; 1 pass + 4 skip |
| T-018 | Reference.Rules + DSL executor stub | ✅ DONE | RED+GREEN+REVIEW pipeline complete; 14/14 tests pass; 010-rules.sql with R13+RLS |
| T-019 | Department taxonomy seed | ✅ DONE | T5-seed (RED skipped); GREEN+REVIEW PASS; 7 Apex depts + dept_overrides JSONB |
| T-020 | ManufacturingOperations + seeds | ✅ DONE | RED+GREEN+REVIEW+REWORK PASS; 26 tests (was 25 + 1 cross-industry countercheck); UNIQUE widened to 3-col (org_id, industry_code, process_suffix) per Option B — bakery-MX + fmcg-MX both seed cleanly to same Apex org; mutation experiments hold; org_id (not tenant_id) per Wave0 v4.3 |
| T-021 | Cascading rule mfg_op→intermediate code | ✅ DONE | RED+GREEN+OPUS-REVIEW PASS; 29/29 (5 static + 9 db-skipped + 14 executor regression + 10 workflow regression); 7/7 mutations confirmed; runCascade single-tx + org-scoping + active-window race-free; carry-forwards T-080 executor wire-up, T-081 public.fg migration in 01-NPD, T-082 org-scoped Postgres sequence |
| T-022 | i18n scaffold (next-intl) | ✅ DONE | RED+GREEN+REVIEW PASS; 32/32 tests; 4 locales (pl/en/uk/ro) with CLDR plural rules; middleware.ts + routing.ts deviations accepted |
| T-023 | GS1 identifier helpers | ✅ DONE | RED+GREEN+REVIEW PASS; 43/43 tests; mod-10 + 5 parsers (GTIN/SSCC/GLN/GRAI/GDTI); review spot-checked check-digit arithmetic |
| T-024 | Idempotent mutation helper | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 17/17 tests; canonicalStringify (key-order invariant, no nested-object drop); 015-idempotency.sql + GRANT to app_user |
| T-025 | packages/ui + Modal primitive | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 18/18 tests; ESLint no-restricted-imports for radix-dialog (jest-axe fallback for axe scan documented) |
| T-026 | Stepper primitive | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 31/31 tests; @radix-ui/react-tabs (manual activation) + Zustand store keyed by wizardId; AC4 density made non-vacuous (`toHaveAttribute('data-density','default')`); canEnter dual-guard hardened (preventDefault + stopPropagation) |
| T-027 | Field primitive | ✅ DONE | RED+GREEN+REVIEW PASS; 16/16 tests; RHF Controller + useFormContext; Input.tsx wrapper (data-slot); aria-invalid + aria-describedby; required asterisk with aria-label="required"; UI-evidence carry-forward (Storybook screenshots policy gap, deferred to T-056) |
| T-028 | ReasonInput primitive | ✅ DONE | **DONE 2026-06-03** (run-module, kira-ui). forwardRef<HTMLTextAreaElement> + aria-label/label props + always-accessible-name (fixed pre-existing axe violation); inline-style red-line removed→CSS module; CSF3 Storybook 5 states; parity vs settings/modals.jsx:72-108. ReasonInput 17/17, UI suite 147 pass, jest-axe 0, lint 0. (Was ⏸ BLOCKED.) |
| T-029 | Summary primitive | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 20/20 tests; <dl>/<dt>/<dd>; CSS module with var(--color-warning); REWORK fixed inline-styles on VisuallyHidden span (red-line violation) + added [style] full-subtree mutation-proof assertion |
| T-030 | Tuning primitives | ✅ DONE | RED+GREEN+REVIEW PASS; 22/22 tests (5 prim + deriveRunHistory + Button); EmptyState uses cloneElement to avoid nested button (AC1 marker satisfied via data-slot); RunStrip prop narrowed to RunStatus[]; data-domain-agnostic verified (no outbox imports) |
| T-031 | 10 MODAL-SCHEMA pattern templates | ✅ DONE | RED+GREEN+REVIEW PASS (opus); 149/149 tests (123→149 +26 via AC3 loop expansion); 4 deviations accepted (useSanitiseRadixIds story-only, label-wrap ReasonInput, P10 ErrorState initial-render, P1 padded 3→8 steps); carry-forwards T-062 testing docs, T-063 ReasonInput aria-label/forwardRef, T-064 P10 click-error transition |
| T-032 | Regulatory roadmap artifact | ✅ DONE | T5-seed full cycle PASS (sonnet); 7 regulation files + README + check-regulatory-staleness.mjs; YAML front matter (title/enforcement_date/scope_modules/last_reviewed_at/source_url) + body sections (Scope/Impacted contracts/Open questions); AC1-4 evidence; KSeF uses direction-known-date-explicitly-unset; 2 minor deviations documented (BRCGS 2026-12-31 placeholder, EU FIC 1169/2011 review-date proxy) — not invented |
| T-033 | PostHog feature flags | ✅ DONE | RED+GREEN+REVIEW PASS (sonnet); 7/7 + 63 total / 0 regression; lib/feature-flags + route handler; fail-closed undefined→false; org.access.admin guard 403 with null body (no flag-key leak); carry-forward: server-only marker, POSTHOG_API_KEY rename, Permission.ORG_ACCESS_ADMIN constant import |
| T-034 | Schema drift detection job | ✅ DONE | RED+GREEN+OPUS-REVIEW PASS; 5/5 + 4 db-skipped; info_schema ↔ Reference.DeptColumns diff + cron route (x-vercel-cron OR Bearer CRON_SECRET, fail-closed prod) + scripts/cron.json daily 06:00 UTC; carry-forwards T-080 getSystemActorConnection helper + crypto.timingSafeEqual Bearer, T-081 strict-mode extra_in_db, T-082 @monopilot/ops alias |
| T-035 | Workflow-as-data executor | ✅ DONE | RED+GREEN+REVIEW PASS; 27/27 (24+3 db-skipped) + 14 executor regression; 10/10 mutations; namespace import + fire-and-forget dispatch + hybrid Rule shape; dry-run triple-gated outbox INSERT; carry-forwards: executeRule async upgrade, outbox INSERT error surfacing |
| T-036 | Schema-driven column draft/publish | ✅ DONE | RED+GREEN+OPUS-REVIEW+REWORK PASS; 10/10 tests (was 9 + 1 missing-dept path); HARD BLOCKER fixed: dept_code='production' fallback removed → returns `{success:false, error:'dept_not_found'}` with ROLLBACK; test seeds Reference.Departments; carry-forwards T-069 actor-org assertion, T-071 DB CHECK denied-action security, T-072 drafts uniqueness |
| T-037 | Schema-driven column wizard UI | ⏸ BLOCKED | RED+GREEN+OPUS-REVIEW PASS-with-major-carry-forwards; 32/32 tests; AC1/AC4 PASS, AC2/AC3 DOM-pass via inline impl; **P0 ROOT-CAUSE FLAGGED**: React 18/19 peer mismatch w packages/ui → primitives T-026/T-027/Stepper/Field UNCONSUMABLE w apps/web. Carry-forwards: T-076 (P0) packages/ui peerDeps align to React 19 [NOW DONE — peerDeps ^18||^19 in T-093], T-077 (P1) refactor wizard with real Stepper+RHF+Zod [T-095 not done], T-078 (P1) @vitejs/plugin-react-oxc [T-096 not done], T-079 (P2) userEvent v15. **Reality-audit 2026-06-02: SchemaColumnWizard.tsx step 2 comment L186 explicitly states "plain state, not RHF" — step 2 refactor NOT done.** |
| T-038 | tenant_migrations table | ✅ DONE | RED+GREEN+REVIEW PASS; 11/11 tests pass; 013-tenant-migrations.sql idempotent; no FK (app-layer carry-forward to T-039); dual schema dir + symlink carry-forward |
| T-039 | Canary upgrade orchestration | ✅ DONE | RED+GREEN+OPUS-REVIEW PASS; 16/16 (RED count typo); 13/13 mutation experiments verified by reviewer; events.enum.ts +3 (tenant.migration.run / .failed / cohort.advanced); 023-outbox-events-extension.sql ALTER CHECK; BEGIN/COMMIT atomicity confirmed; 15-min strict-< boundary; RBAC org.platform.admin retention='security' on deny; carry-forwards T-069 platform.admin Apex bootstrap migration, T-070 fix migrate.ts pre-existing 017 checksum, T-071 derive orgId from session + ESLint owner-conn check |
| T-040 | R13 columns on placeholder tables | ✅ DONE | RED+GREEN+REVIEW PASS; 33/33 tests; 014-r13-placeholder-tables.sql (renamed from 0014_ by T-054); 5 tables (lot/work_order/quality_event/shipment/bom_item) with R13 cols + org_id RLS via app.current_org_id() |
| T-041 | PWA scaffold | ✅ DONE | RED+GREEN+REVIEW PASS; 54/54 tests; manifest.ts+sw.ts+RegisterSW.tsx; withNextIntl(withSerwist()); carry-forward to T-042: navigationPreload, AC3 offline E2E, 10s vs 5s timeout |
| T-042 | PWA install + offline-shell E2E | ✅ DONE | RED+GREEN+REVIEW PASS; 18/18 PWA E2E + 92 web pass; sw.ts navigationPreload:true + NetworkFirst /api/ networkTimeoutSeconds:5; manifest categories + maskable icon; vitest fallback (Playwright still blocked); carry-forwards T-080 add @playwright/test + e2e/pwa.spec.ts; minor: icon assets are placeholders (apps/web/public/icons/ doesn't exist — must populate before prod) |
| T-043 | IndexedDB sync queue primitive | ✅ DONE | RED+GREEN+REVIEW PASS; 19/19 tests; raw IDB (idb-keyval deleted-db fix); inline UUID v7 (jsdom/uuid esm-node crypto fix); all 4 ACs satisfied |
| T-044 | Sync queue flusher | ✅ DONE | RED+GREEN+REVIEW PASS (sonnet); 34/34 (19 queue + 15 flusher); FIFO + 409 dedup + 503 retry (5min/30min/2h/12h cap) + idempotent start; deviations accepted: chained setTimeout (vitest fake-timer infinite-loop fix), fakeTimers.toFake allowlist; carry-forwards: backoff>12h UI alert (06-SCANNER), multi-tab dedup architecture note |
| T-045 | Postgres app-role connection split | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 10/10 tests; 006-app-role.sql; eslint.config.mjs flat config; SELECT-0-rows RLS test; production guard |
| T-046 | ref-tables.enum.ts source-of-truth lock | ✅ DONE | Full pipeline + 1 rework cycle (ESLint drift gate added to apps/web flat-config); workspace-wide lint coverage flagged as pre-existing infra debt |
| T-047 | Wave0 PRD v4.3 domain amendment | ✅ DONE | docs (RED skipped); GREEN+REVIEW PASS; 6 surgical amendments (fg.* canonical, org_id business scope, [LEGACY-D365] qualification on fa.*); 87 unmarked headings = pre-existing debt |
| T-048 | Domain glossary lock | ✅ DONE | T0-docs full cycle PASS; 13 canonical terms + checker; negative test verified (factory_spec removal → exit 1 with MISSING name); §W0-v4.3 lock honoured |
| T-049 | Shared BOM SSOT skeleton | ✅ DONE | T1-schema docs full cycle PASS (opus); _foundation/contracts/shared-bom-ssot.md + .schema.json (draft 2020-12); 4/4 ACs evidence; jsonschema 4.26.0 valid+invalid roundtrip; 35 grep hits; ownership matrix Foundation/Technical/NPD; D365 NEVER source of truth; status enum draft|in_review|approved|superseded |
| T-050 | Authorization policy foundation | ✅ DONE | T1-schema docs full cycle PASS (opus); _foundation/contracts/authorization-policy.md (10 sekcji); 4/4 ACs evidence; grep 33 hits (≥8); settings.quality.* 4× w red-line context; cytuje T-004 + T-014 + T-039 + T-062 carry-forwards; helper contracts (requireOrgPermission, preflightAction, assertSodGrantAllowed, withAuditContext) defined as signatures only |
| T-051 | D365 posture contract | ✅ DONE | T0-docs full cycle PASS; _foundation/contracts/d365-posture.md (8 sekcji, ~320 LOC); 4/4 ACs evidence-quoted; D365 capability registry entry; non-usable preload override; 41 grep hits; cytuje §W0-v4.3 §6 + §9 |
| T-052 | Manifest/coverage readiness patch | ✅ DONE | T0-docs (RED skipped); GREEN+REVIEW PASS; manifest business_scope_column added; coverage Wave0 v4.3 Readiness section + ACP shape + dep rules documented |
| T-053 | packages/db layout consolidation | ✅ DONE | RED+GREEN+REVIEW PASS; 106/106 tests; src/schema/ removed, schema/ canonical with 9-table barrel; symlink relative; FK added on R13 org_id |
| T-054 | Migration runner + filename normalization | ✅ DONE | GREEN PASS; raw-SQL runner in scripts/migrate.ts; 0014_→014- rename; schema_migrations table; idempotent; --dry-run; checksum guard; 8/8 tests |
| T-055 | Workspace-wide ESLint coverage | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; tooling/eslint/base.mjs shared; 8 packages get drift rules; pg.Pool override per-test only; 7/7 fixture tests + root pnpm lint exit 0 |
| T-056 | Reference.Departments RLS hotfix follow-up | ✅ DONE | GREEN+REVIEW PASS; Option A (no 017, hot-fix in 011 sufficient); 9 dedicated RLS tests; AC4 pins SQLSTATE 42501 (non-vacuous) |
| T-057 | schema-runtime VITEST env-var elimination | ✅ DONE | RED+GREEN+REVIEW PASS; _setPool/_clearPool exported test seams; isTestMode derived from injected pool; 7/7 (3 pass + 4 skip) |
| T-058 | Migrate integration tests to getAppConnection | ✅ DONE | RED+GREEN+REVIEW PASS; 7 files migrated to getOwner/getAppConnection; lib/client.ts deleted; test-utils/test-pool.ts helper; 128/130 tests pass (2 pre-existing migrate-runner failures, out-of-scope) |
| T-059 | PRD marker discipline sweep | ✅ DONE | GREEN+REVIEW PASS; 75 heading lines marked + 10 allowlisted + leading-dash fix; exit 0 on 00-FOUNDATION-PRD.md; 55/56 web tests pass; T-047 amendments intact |
| T-060 | ALTER tenant_idp_config: 11 missing F-A2 cols | ✅ DONE | RED+GREEN PASS; 16/16 FA2 tests + 11/11 existing tests; 016 migration with 11 cols + updated_at trigger |
| T-061 | Password policy enforcement library | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 19/19 tests (mutation-proven non-vacuous); whitespace_only guard; 018-password-history.sql; HIBP injectable + fail-open |

**Wave-A batch: 61/61 DONE (as declared). Reality audit 2026-06-02 corrects T-028→⏸ (aria-label/forwardRef absent), T-037→⏸ (step 2 not RHF+Zod). Carry-forward tasks T-062…T-126 added below.**

## Carry-forward + New tasks (T-062 … T-126) — Reality audit 2026-06-02

| Task | Title (short) | Status | Notes |
|---|---|---|---|
| T-062 | user_pins RLS org-scoped fix | ✅ DONE | migrations/026-pins-rls-org-scoped.sql — USING(true) replaced with org-scoped USING; cross-org SELECT returns 0 rows |
| T-063 | packages/ui/TESTING.md Radix axe quirk | ✅ DONE | **DONE 2026-06-03** (run-module, kira-easy). packages/ui/TESTING.md documents Radix colon-id axe-core quirk + useSanitiseRadixIds workaround; test JSDoc link. UI suite 140 pass. |
| T-064 | VALIDATE CONSTRAINT audit_events_role_assigned | ✅ DONE | **DONE 2026-06-03** (run-module). Mig 052-validate-role-assigned-check.sql: pre-flight guard (raise 23514 if role.assigned w/ retention<>security) + VALIDATE CONSTRAINT. Validated on Supabase test proj: 0 violators, convalidated=true, violating insert→23514. Static+DB-gated tests. Codex impl, Opus review PASS. |
| T-065 | Supabase deploy runbook JWT_EXP/MAILER_OTP_EXP | 🔄 IN PROGRESS | docs/runbooks/supabase-deploy.md DONE (JWT_EXP=900, MAILER_OTP_EXP=604800 [code not contract's 420s], refresh rotation). Verification SCRIPT (scripts/verify-supabase-config.ts) → Codex in flight. |
| T-066 | verifyPin pool.end() lifecycle fix + JSDoc | ✅ DONE | packages/auth/src/verify-pin.ts L55/173 pool.end() present |
| T-067 | ReasonInput aria-label + forwardRef | ✅ DONE | **DONE 2026-06-03** (run-module, kira-ui; bundled w/ T-028). aria-label prop forwarded to textarea + React.forwardRef ref→textarea; dev-warn on label+aria-label both. Tested (ref.focus()/value, getByLabelText, axe 0). |
| T-068 | `import 'server-only'` on feature flags | ⬜ PENDING | apps/web/lib/feature-flags/index.ts missing server-only import |
| T-069 | organizations.industry_code CHECK 'generic' | ✅ DONE | industry_code='generic' accepted in test seeds; CHECK constraint verified |
| T-070 | 8-h absolute session lifetime | ✅ DONE | apps/web/lib/auth/session-check.ts L122 — 8h cap enforced via JWT iat |
| T-071 | Approval-token replay protection | ✅ DONE | migrations/033-consumed-approval-tokens.sql + 034-approval-token-prune-cron.sql; packages/rbac/src/grant.ts |
| T-072 | shouldFail click-driven error-transition test | ⬜ PENDING | packages/ui/src/__tests__/patterns.test.tsx — no shouldFail=true error-transition test |
| T-073 | Tenant-scoped JIT provisioning flag | ✅ DONE | **DONE 2026-06-03** (run-module). Live `(auth)/actions.ts signInWithMagicLink` reads `tenant_idp_config.jit_provisioning` (left join) → `shouldCreateUser = jit===true`, DENY-BY-DEFAULT. Codex round0 wrote dead helper→Opus REWORK→fixed into live path. 9/9 action tests, tc/lint 0. Column verified on Supabase. |
| T-074 | Shared rbac pool lifecycle (closeRbacPool) | ✅ DONE | **DONE 2026-06-03** (run-module). grant.ts memoizes owner pool + closeRbacPool() teardown. rbac 45/45 real DB (grantRole/revokeRole intact). |
| T-075 | POSTHOG_KEY → POSTHOG_API_KEY rename | ✅ DONE | **DONE 2026-06-03** (mechanical batch). Renamed in .env.example + feature-flags/index.ts; whole-word grep clean. |
| T-076 | assertActorBelongsToOrg cross-org rejection + test | ✅ DONE | packages/rbac/src/grant.ts L227-258 actor+target org checks wired |
| T-077 | grantRole BYPASSRLS → getAppConnection refactor | ⬜ PENDING | packages/rbac/src/grant.ts L208 still getOwnerConnection() — security debt |
| T-078 | Permission.ORG_ACCESS_ADMIN import from @kira/rbac | ✅ DONE | **DONE 2026-06-03** (mechanical). flags route imports `Permission.ORG_ACCESS_ADMIN` from rbac permissions.enum (repo uses relative paths; no rbac index). |
| T-079 | SoD semantic: check target existing roles | ✅ DONE | packages/rbac/src/grant.ts L237 SoD on TARGET roles implemented |
| T-080 | org.platform.admin Apex seed + migration | ✅ DONE | migrations/029-org-platform-admin.sql + 030-apex-org-bootstrap.sql |
| T-081 | fix migrate.ts 017-rbac checksum + replay | ✅ DONE | scripts/migrate.ts checksum guard; 017 in place |
| T-082 | owner-pool memoization + request-scoped binding | ✅ DONE (OBSOLETE) | **CLOSED 2026-06-03 as superseded by T-125** (run-module). Contract (FT-022) premise invalid: references `user_org_memberships` table + `app.actor_org_id` GUC that DO NOT EXIST; assumes upgrade actions read orgId from URL. Reality: all `apps/web/actions/tenant/*` upgrade actions already wrap `withOrgContext` (T-125), resolve org from verified `app.current_org_id()` (not URL), and the owner pool is module-cached in with-org-context.ts. Opus review flagged Codex's attempt as dead code on fictional schema → discarded, not merged. No further work. |
| T-083 | audit_events_dept_column_denied CHECK constraint | ✅ DONE | **DONE 2026-06-03** (run-module). mig 058: CHECK dept_column_denied rows carry after_state{dept_id,column_key,actor_user_id} (NOT VALID). 4/4 real DB. |
| T-084 | Narrow tenant_idp_config grants | ✅ DONE | migrations/035-tenant-idp-grants.sql column-level REVOKEs |
| T-085 | dept_column_drafts partial unique WHERE status='draft' | ✅ DONE | **DONE 2026-06-03** (run-module). mig 059 partial UNIQUE (one active draft per org/dept/column; draft+published coexist). 4/4 real DB (dup→23505). |
| T-086 | SAML Issuer xmldom+XPath replace | ✅ DONE | **DONE 2026-06-03** (run-module). packages/auth/src/saml/issuer-parser.ts: @xmldom/xmldom DOMParser + XPath //saml:Issuer[1] w SAML2 namespace (namespace-robust); wired into apps/web/lib/auth/saml.ts (regex removed). issuer-parser 6/6, web tc 0. |
| T-087 | audit_events.org_id nullable + sentinel backfill | ⬜ PENDING | migrations/004-audit.sql — org_id NOT NULL; no sentinel migration |
| T-088 | enforceSamlPolicy wired to sign-in routes | ✅ DONE | apps/web/app/(auth)/actions.ts L31/167 calls enforceSamlPolicy |
| T-089 | Cross-tenant SCIM ambiguity regression test | ⏸ BLOCKED | Guard exists in lib/scim/middleware.ts L165-184; but no dedicated >1-hash→401 regression test file |
| T-090 | Jackson createConnection at tenant onboarding | ✅ DONE | apps/web/app/(admin)/settings/saml/_actions/save-saml-config.ts L168 |
| T-091 | SCIM Group provisioning (POST/PATCH) | ✅ DONE | **DONE 2026-06-03** (run-module, 3 Opus REWORK rounds). Mig 053-scim-groups.sql (scim_groups+members, org-scoped RLS app.current_org_id(), force RLS, FK cascade, app_user grants) + tenant_idp_config.scim_group_role_map. Routes /scim/v2/Groups(+[id]) replace 501 stub; verifyScimBearer+withScimOrgContext. Member add/remove via CANONICAL @monopilot/rbac grantRole + NEW canonical revokeRole (org-scoped, audited, actorType:'system' path for SCIM). REWORK fixed: forked RBAC, missing tables, wrong path, multi-org system-actor, DB-test fixtures. **Real local Postgres: scim cross-org isolation 2/2, rbac 42/42 (grantRole intact), auth groups 7/7.** |
| T-092 | HMAC-bound RelayState SAML replay defence | ✅ DONE | **DONE 2026-06-03** (run-module). packages/auth/src/saml/relay-state.ts: HMAC(orgId,nonce,exp) + timingSafeEqual + fail-closed prod (SAML_RELAY_STATE_HMAC_KEY) + nonce replay + exp. Wired into saml login(generate)+callback(verify; reject tampered/expired/org-mismatch/replay). relay-state 6/6, web tc 0. |
| T-093 | packages/ui peerDeps align React 19 | ✅ DONE | packages/ui/package.json peerDependencies `"react": "^18 || ^19"` |
| T-094 | SLO session cookie clearing + Supabase signOut | ✅ DONE | **DONE 2026-06-03** (run-module). packages/auth/src/saml/slo.ts clears cookies + Supabase admin signOut(jwt); wired into saml logout route. slo 3/3, auth 50 pass, web tc 0. |
| T-095 | SchemaColumnWizard step 2 RHF+Zod | ⏸ BLOCKED | SchemaColumnWizard.tsx L186 explicitly "plain state, not RHF" — refactor not done |
| T-096 | swap jsxPreTransformPlugin → @vitejs/plugin-react-oxc | ⬜ PENDING | apps/web/vitest.ui.config.ts L10-41 still uses custom jsxPreTransformPlugin |
| T-097 | Remove userEvent monkey-patch (user-event v15) | ⬜ PENDING | Intentionally deferred until user-event v15 ships |
| T-098 | getSystemActorConnection() + constant-time Bearer for cron | ✅ DONE | **DONE 2026-06-03** (run-module). packages/db/system-actor-connection.ts: getSystemActorConnection (fresh owner pool per call + app.actor_type='system') + cronBearerMatches (length-guarded timingSafeEqual, fail-closed). Wired into REAL cron routes (internal/cron/drift+outbox), replaced new pg.Pool+inline safeCompare. ESLint gate hardened (closed './clients.js' bypass + scoped override). Codex round0 dead /cron/[name] route→Opus REWORK→fixed. **DB test 4/4 on real local Postgres** (incl app.actor_type='system'); web tc 0; scoped lint 0. |
| T-099 | @playwright/test + real-Chromium offline PWA E2E | ✅ DONE | **DONE 2026-06-03** (run-module). @playwright/test dep + apps/web/e2e/pwa.spec.ts (offline-shell/serviceWorker E2E). playwright discovers spec, web tc 0. Browser run = CI (T-122 blocking playwright job); local Chromium sandbox N/A. |
| T-100 | wire runCascade dispatch in outbox route | ✅ DONE | **DONE 2026-06-03** (run-module). rule-engine/dispatch.ts (isCascadeEvent + extract org_id/fg_id→runCascade); outbox cron cascadeHandler calls dispatchCascade (was console.info stub). Codex round0 dead packages/executor→Opus REWORK→moved to @monopilot/rule-engine + wired real route. 2/2 tests, web tc/lint 0. |
| T-101 | drift-detect strict mode (extra_in_db) | ⬜ PENDING | Deferred until dept_code table registry lands |
| T-102 | public.fg fixture → real migration (01-NPD) | ⬜ PENDING | Deferred until 01-NPD ships |
| T-103 | @monopilot/ops TS path alias in apps/web/tsconfig.json | ✅ DONE | **DONE 2026-06-03** (mechanical, orchestrator-fixed). cron drift route imports `@monopilot/ops`; added packages/ops/src/index.ts (fixed broken main) + @monopilot/ops dep; removed redundant apps/web tsconfig paths block (base already provides @monopilot/*; local block broke baseUrl resolution). tc/lint 0. |
| T-104 | Org-scoped Postgres sequence for nextSeq7() | ⬜ PENDING | No nextSeq7 or org-scoped sequence found |
| T-105 | Vercel-only deploy assumption doc for cron | ✅ DONE | **DONE 2026-06-03** (run-module, kira-easy). docs/runbooks/cron-auth.md: x-vercel-cron Vercel-only assumption + non-Vercel migration (Bearer-only). (scope route.ts path stale; docs satisfy AC.) |
| T-106 | Surface EvaluateResult through ExecutorResult | ⬜ PENDING | Deferred until executeRule made async |
| T-107 | Outbox error surfacing via error-reporting | ⬜ PENDING | Deferred until T-118 Sentry lands |
| T-108 | Restore FK tenant_migrations.tenant_id | ⬜ PENDING | Deferred until T-039 verified in prod |
| T-109 | totp.ts masterKey fail-closed guard | ✅ DONE | packages/auth/src/totp.ts L25-57 MFA_MASTER_KEY guard; CF-T015-B resolved |
| T-110 | Bundle NIST top-25K common password list | ✅ DONE | **DONE 2026-06-03** (run-module). packages/auth/data/common-passwords-25k.txt (25,000 unique) + deterministic fetch script; password-policy rejects lowercased matches (lazy memoized). common-passwords 4/4 + password-policy 19/19 (no T-061 regression). |
| T-111 | apps/worker scaffold + job registry | ✅ DONE | **DONE 2026-06-03** (run-module). Codex impl + Opus review. `@monopilot/worker`: JobRegistry (register/start/runOnceForTest/draining shutdown) + zod env (prod fail-closed) + structured logger (T-117 hook) + entrypoint w/ shared pg.Pool + SIGTERM drain. 5/5 vitest, typecheck 0, lint 0. **Carry-forward:** `registry.start()` skips `cron` schedule (warn) — T-114 must add cron eval or use interval. Unblocks T-112/114/116/118/119. |
| T-112 | Outbox worker consumer in apps/worker | ✅ DONE | **DONE 2026-06-03** (run-module, 1 rework). apps/worker outbox-consumer interval job: system-actor sweep→publish to @monopilot/outbox queue + consumed_at; attempts++ on fail; DLQ at >=5 (outbox_dead_letter). mig 056 (attempts col + outbox_dead_letter org-scoped RLS). worker 16/16 real DB (consume/attempt/DLQ). Rework: test had wrong migrations path→seed-only convention. |
| T-113 | packages/gdpr erasure registry + dispatcher | ✅ DONE | **DONE 2026-06-03** (run-module). @monopilot/gdpr: registry + two-pool runErasure (owner registers session_org_contexts token, app pool RLS tx + ordered handlers), resource_id text, failure-audit separate conn + no-mask, dry-run savepoint. Codex round0→Opus REWORK (3 P0: app_user INSERT denied, uuid-cast, fake tests)→fixed. Schema verified live on Supabase. Non-vacuous DB-gated integration suite (CI); registry unit 3/3; tc/lint 0. Unblocks T-114. | **Real-DB verified 2026-06-03: full gdpr suite 7/7 against local Postgres (001-052 migrated). Follow-up mig 054-audit-events-seq-grant.sql added — 004 granted app_user INSERT on audit_events but missed USAGE on the bigserial id sequence (42501); 054 completes it.**
| T-114 | GDPR erasure cron in apps/worker | ✅ DONE | **DONE 2026-06-03** (run-module). mig 057 gdpr_erasure_requests (org-scoped RLS). apps/worker gdpr-erasure-cron interval job → canonical runErasure(owner,app,org,subject) from @monopilot/gdpr. worker 21/21 real DB (gdpr cron 5/5). Worker runs backup+outbox+gdpr. |
| T-115 | NPD erasure handler registration test | ⬜ PENDING | Depends on T-113/T-114 |
| T-116 | OpenTelemetry baseline + instrumentation.ts | ✅ DONE | **DONE 2026-06-03** (run-module). @monopilot/observability: tracer/meter/sdk-node (startNodeSdk, OTEL_SDK_DISABLED no-op) + in-memory exporter. apps/web/instrumentation.ts register()→startNodeSdk(web) on nodejs; apps/worker startNodeSdk(worker) before JobRegistry. otel-smoke 3/3, worker 5/5, web tc 0. Unblocks T-117/T-118. |
| T-117 | Structured logger (pino) @monopilot/observability | ✅ DONE | **DONE 2026-06-03** (run-module). packages/observability/logger.ts pino + secret redaction (password/token/secret/authorization/api_key + DB-URL mask); apps/worker logger backed by it (T-111 console shim retired). observability 8/8 (incl redaction), worker 5/5, tc/lint 0. Unblocks T-118/T-121. |
| T-118 | Sentry wired into apps/web + apps/worker | ✅ DONE | **DONE 2026-06-03** (run-module). sentry.{client,server,edge}.config + withSentryConfig; worker sentry.ts init before JobRegistry + captureRegistryJobFailures; observability redactBeforeSend (recursive PII/secret redaction). No-op when SENTRY_DSN unset. sentry-redact 3/3, worker 8/8, obs 8/8, tc 0. |
| T-119 | Backup policy spec + stub verification job | ✅ DONE | **DONE 2026-06-03** (run-module). _foundation/contracts/backup-policy.md (RPO/RTO 4-class, role list, restore-drill ref, encryption, out-of-scope). apps/worker backup-verification-cron INTERVAL job (daily; registry interval-only); BACKUP_VERIFICATION_MODE; audits succeeded/failed. worker 13/13 real DB, tc/lint 0. Unblocks T-120. |
| T-120 | Restore drill runner (tooling/restore-drill/) | ✅ DONE | **DONE 2026-06-03** (run-module). tooling/restore-drill: pg_dump→ephemeral temp DB restore→migrate→smoke-queries→JSON report; corrupt dump→non-zero+passed:false. backup-policy.md restore-drill section. 5/5 on real local Postgres. Unblocks T-122. |
| T-121 | packages/rate-limit middleware | ✅ DONE | **DONE 2026-06-03** (run-module). Edge-safe Store iface: InMemoryStore (Map sliding-window/token-bucket, default) + UpstashStore (Redis distributed prod). Integrated into apps/web/proxy.ts (Next16 middleware, NOT dead middleware.ts) → 429+Retry-After; auth presets. No node-only imports (edge). rate-limit 6/6, proxy-rate-limit 1/1, web tc 0. |
| T-122 | CI/CD workflow hardened | ✅ DONE | **DONE 2026-06-03** (run-module). ci.yml: continue-on-error removed (typecheck/lint/build/vitest/migration-check/playwright blocking); restore-drill.yml scheduled workflow; check:drift gate (pg_dump vs __expected__/schema.sql baseline, regenerated for 001-056). check:drift exit 0 on clean DB. |
| T-123 | Playwright harness scaffolded | ✅ DONE | playwright.config.ts at root; apps/web/e2e/ specs exist |
| T-124 | packages/e-sign CFR 21 Part 11 | ✅ DONE | **DONE 2026-06-03** (run-module, 1 rework). mig 055-e-sign-log (append-only REVOKE UPD/DEL, org-scoped RLS). sign.ts CFR-21 manifest (signer/intent/ts/SHA-256+nonce) in e_sign_log+audit_events; locale-independent codepoint canonical JSON; replay double-guard; client/org-context required. dual.ts case-insensitive distinct-signer SoD. Opus PASS-WITH-NITS→3 MEDIUM fixed (locale hash, SoD case-bypass, dead path). **12/12 on real local Postgres.** Unblocks quality/production dual-sign. |
| T-125 | withOrgContext HOF | ✅ DONE | apps/web/lib/auth/with-org-context.ts — full impl: JWT verify + org_id lookup + app.set_org_context tx + ROLLBACK |
| T-126 | Login screen UI | ✅ DONE | apps/web/app/[locale]/(auth)/login/{page,login-card,layout,forgot-password,mfa} all present; real Supabase Auth |

## Wave 0 — Walking Skeleton (`/kira:skeleton`, 2026-06-02)

Brownfield audit of the hand-added skeleton (login + app shell + nav) found
DoD #1/#2/#3/#5 already ✅ (login via Supabase Auth, shell + 15 nav links +
36 settings sub-nav links resolve, parity_report.json PASS, build green). The
"missing middleware.ts" flagged by the audit was a **false positive** — this is
Next.js 16 where `proxy.ts` IS the middleware (build shows `ƒ Proxy
(Middleware)`). Only DoD #4 (real data) was a genuine gap. Audited-OK pieces
were NOT rebuilt.

| Task | Title | Status | Notes |
|---|---|---|---|
| T-127 | Walking Skeleton real-data wiring (DoD #4) | ✅ DONE | `(modules)/_actions/skeleton-data.ts` org-scoped counts via `withOrgContext` (RLS); dashboard 6-metric summary + technical/production/quality/shipping/warehouse wired to public.bom_item/work_order/quality_event/shipment/lot (migration 014); 8 table-less modules → honest `module-stub-notice`; `Skeleton` i18n ns in en/pl/uk/ro; unit 6/6, nav+contract 14/14, `tsc` 0, `eslint` 0, `next build` 0 (all routes ƒ dynamic). E2E `walking-skeleton.spec.ts` added (login→shell→full menu→data); strict DB-value assertion gated behind `WALKING_SKELETON_REQUIRE_DB` for a real Supabase target. |
| T-128 | App-shell logout clears Supabase session (DoD #1) | ✅ DONE | `(app)/layout.tsx` `signOutAction` now `await supabase.auth.signOut()` before redirect (was redirect-only → stale session re-admit). `tsc`/`eslint`/`build` green. |
| T-129 | SEC-RLS: close rls_disabled_in_public ERRORs | ✅ DONE | **DONE 2026-06-03** (run-module foundation, first task). Migration `packages/db/migrations/051-rls-public-exposure-remediation.sql` (Codex-written; Opus review caught `ALTER FUNCTION IF EXISTS` invalid syntax → fixed with `to_regprocedure` guard, and testcontainers→repo-convention divergence). Applied to test project khjvkhzwfzuwzrusgobp via Supabase MCP → **`get_advisors security` = 0 ERROR** (all 20 rls_disabled_in_public cleared; tenant_idp_config/tenants no-policy cleared; SECURITY DEFINER anon/auth EXECUTE revoked; set_user_pins_updated_at search_path fixed). Test `packages/db/__tests__/rls-public-exposure-remediation.test.ts` GREEN (10 static-contract assertions pass; live cross-org isolation suite opt-in via `RLS_LIVE_TESTS=1` for Docker CI). Cross-provider review closed (Codex P2 on suite-skip resolved: dep+lockfile added, env-gated). **Residual (non-blocking):** (a) leaked-password-protection = Auth dashboard toggle, manual; (b) audit partitions now INFO rls_enabled_no_policy = intentional fail-closed for internal audit; (c) citext-in-public = out of scope (advisor 0014). |

**Live-DB / Vercel deploy smoke = final CI/human step** (docker unavailable locally for `db:up`; Supabase MCP needs interactive auth). Schema + RLS the pages depend on are verified from migration `014` source + unit tests; tables: lot/work_order/quality_event/shipment/bom_item all `force row level security` + `org_id = app.current_org_id()` policies.

## Migration ordering lock

**Use exactly the migration filename specified in your task JSON's `scope_files`.** Do not invent your own number. The JSON is the source of truth.

For reference, current assignments per task JSONs:
- 001 baseline (T-006) — done
- 002 rls-baseline (T-007) — done
- 003 outbox (T-008)
- 004 audit (T-009)
- 005 tenant-idp-config (T-010)
- 006 app-role (T-045) — renamed from 0010_app_role.sql to match NNN- convention
- 009 schema-driven (T-017)
- 010 rules (T-018)
- 011 departments (T-019)
- 012 manufacturing-operations (T-020)
- 013 tenant-migrations (T-038)
- 014 r13-placeholder-tables (T-040) — renamed from 0014_r13-placeholder-tables.sql to match NNN- convention (T-054)
- 015 idempotency (T-024)
- 016 tenant-idp-config-fa2-columns (T-060)
- 017 rbac (T-014) — REASSIGNED from JSON's "006-rbac.sql" because 006 is taken by T-045 app-role per T-054 lock
- 018 password-history (T-061)
- 019 pins (T-016) — REASSIGNED from JSON's "008-pins.sql" because 008 is reserved for T-013 SCIM (Wave C)
- 020/021 — REVERTED (T-016 REWORK γ: production schema bandage; deleted from filesystem AND from schema_migrations; test seed fixed at correct layer)
- 022 dept-column-drafts (T-036) — REASSIGNED from JSON's "011-dept-column-drafts.sql" because 011 is taken by T-019 departments. Also: T-036 internal table `schema_migrations` collides with T-054's runner table — agent must rename to `dept_column_migrations`
- 023 outbox-events-extension (T-039) — RESERVED. T-039 GREEN must add 3 events to `outbox_events_event_type_check` (`tenant.migration.run`, `tenant.migration.run.failed`, `tenant.cohort.advanced`) AND extend `packages/outbox/src/events.enum.ts` ALL_EVENTS in same atomic step (DONE)
- 007 mfa (T-015) — slot 007 was reserved for T-012 SAML but T-012 has no migration; reassigned to T-015 MFA (mfa_secrets + recovery_codes + RLS+GRANT)
- 024 scim-extras (T-013) — RESERVED. T-013 GREEN needs to ALTER users ADD COLUMN deleted_at timestamptz + CREATE INDEX tenant_idp_config_scim_last_four_idx ON tenant_idp_config(scim_token_last_four)

If your task is not in the list above and is not a migration task, do not create migration files.
