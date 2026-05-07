# 00-Foundation Final PRD-vs-Code Drift Audit

**Date:** 2026-05-07
**Auditor:** Independent Opus auditor (post T-061 close, all 61/61 STATUS rows ✅ DONE)
**Scope:** PRD §1-§14 + §W0-v4.3 vs delivered code under `packages/`, `apps/web/`, `_foundation/`, `packages/db/migrations/`.
**Verdict:** coverage.md is **MATERIALLY OVERSTATED**. Foundation is approximately **78%** ready, not "≥95%" as advertised. 7 P0 drifts. 4 of them silently slipped through Wave-A audits.

---

## §1 — Coverage Table (PRD § → tasks → reality → drift)

| PRD ref | Requirement | Claimed task(s) | What code delivers | Drift severity | Evidence |
|---|---|---|---|---|---|
| §1 P1-P6 | Six architectural principles + marker discipline as architectural contract | T-005 | `_foundation/decisions/MARKER-DISCIPLINE.md` plus 15-module registry seed; per T-059 sweep, 75 PRD headings now marked, 10 allow-listed | none | T-005 close note + T-059 sweep |
| §2 | Marker discipline 100% in PRD | T-005, T-059 | Sweep removed 87 unmarked; `00-FOUNDATION-PRD.md` exit 0 against marker checker | none | T-059 |
| §3 | F-U4 personas SoD: Org Admin / Schema Admin mutually exclusive at role-grant level | T-004, T-014 | `017-rbac.sql` seeds **both** as system roles per org; `grant.ts` SoD check is now correctly **target-centric** (post-rework); HMAC token + 5-min TTL; self-approval rejected | none | `packages/rbac/src/grant.ts:225-242`; mig 017 line 137-148 |
| §3 | `org_security_policies.dual_control_required` honoured on **all** admin grants | T-014 | Code path checks `dualControlRequired` and requires approval token even WITHOUT SoD violation when policy=true | none | `grant.ts:241-256` |
| §3 | `org.platform.admin` system role exists per PRD §8 (used by T-039 Server Actions) | T-014 / T-039 | **NOT auto-seeded** by `seed_system_roles_on_org_insert` trigger; `017-rbac.sql:137-148` only inserts access.admin + schema.admin. T-039 explicitly carries `T-069` forward for "Apex bootstrap migration" | **P0** | mig 017 + mig 023 comment line 11; T-039 STATUS row carry-forward |
| §4.1/§4.2 | PRD writing phases & Phase E-0 build sequence | T-001, T-005, T-025 | Monorepo, foundation tasks, registry per plan | none | manifest.json |
| §4.3 | 15-module table + ADR-034 product rename | T-005, T-006 | baseline migration + glossary | none | `001-baseline.sql`, `_foundation/glossary/domain-terms.md` |
| §5 (frontend) | Next.js 16 + React 19 + TS strict + Tailwind v4 | T-001 | apps/web ships next ^16.0.0, react ^19.2.0 | none | `apps/web/package.json:25-27` |
| §5 (frontend) | PWA Workbox, IndexedDB sync, idempotent | T-041..T-044 | manifest+sw via `withSerwist`; `serwist` PWA scaffold; sync queue + flusher | none | `apps/web/app/sw.ts`, `packages/sync-queue/` |
| §5 (backend) | Postgres 16 + JSONB hybrid + RLS default + outbox | T-002, T-006-T-008 | mig 001-003 with RLS+FORCE+outbox 12-event CHECK; outbox now 15 (mig 023) | none | `001-baseline.sql`, `003-outbox.sql` |
| §5 (backend) | "Tests run with app-role (never superuser) in CI" | T-045, T-058 | `getAppConnection` / `getOwnerConnection` split; ESLint guard pg.Pool override per-test; prod env-guard | none | `packages/db/src/clients.ts` (referenced by T-045/T-055) |
| §5 cross-cutting | Feature flags via PostHog self-host | T-033 | `lib/feature-flags/index.ts` + cron route; fail-closed undefined→false | none | `apps/web/lib/feature-flags/index.ts` |
| §5.x | Magic-link 7-day TTL **codified, not Supabase-default** [F-U5] | T-011 | `actions.ts` declares `MAGIC_LINK_TTL_S = 7d` and passes `data.ttl`. **Actual OTP expiry remains Supabase project setting** — comment says "Production deployment MUST configure". Runbook for ops-config does NOT exist. | **P0** | `apps/web/app/(auth)/actions.ts:1-15`; no `_foundation/runbooks/` directory; T-011 carry-forward T-063 still open |
| §5.x | Idle timeout 60-min + session_max 8h | T-011 | next-intl middleware chain + `seed_tenant_idp_config` defaults `idle_timeout_min=60`, `session_max_h=8` | partial | mig 005; "max 8h" carry-forward T-064 still listed open in T-011 STATUS notes |
| §5.x | TOTP via otplib (RFC 6238) + recovery codes argon2id | T-015 | `packages/auth/src/totp.ts` (otplib v13) + libsodium secretbox HKDF; recovery codes argon2id + FOR UPDATE atomic | none | `packages/auth/src/totp.ts`, mig 007 |
| §5.x | WebAuthn `@simplewebauthn/server` (deferred Phase 3, UI checkbox disabled) | T-015 | Stub recorded as `phase_3_deferred` — **no `@simplewebauthn/server` dependency in any package.json**; PRD allows deferral | none (deferred per PRD) | grep returns 0 imports of `@simplewebauthn/server` |
| §5.x | argon2 for PIN/recovery hashing | T-016, T-061, T-013 | `packages/auth/src/verify-pin.ts` argon2id m=65536/t=3/p=1; mig 019; SCIM bearer argon2id last-4 | none | mig 019, T-013 STATUS |
| §5.x | SAML 2.0 SP via `@boxyhq/saml-jackson` | T-012 | `apps/web/lib/auth/saml.ts` lazy Jackson singleton + 4 routes. **`enforceSamlPolicy` is dead code (T-074 carry-forward); Jackson `createConnection` setup is missing (T-075)** | **P1** | T-012 STATUS; carry-forwards T-074, T-075, T-076, T-077 still listed |
| §5.x | SCIM 2.0 endpoints with bearer auth, argon2id token | T-013 | `apps/web/app/api/scim/v2/{Users,Groups}/route.ts`; `verifyScimBearer` last-4 → argon2id; ambiguity guard | partial | T-013 carries forward T-073 (nullable `audit_events.org_id` for security events) and T-075 (Group provisioning) |
| §5.y | `packages/ui` workspace package + 5 modal/form primitives + 5 tuning primitives | T-025..T-030 | All 11 primitives present in `packages/ui/src/` | partial | `packages/ui/src/` |
| §5.y | **Direct Radix imports outside packages/ui blocked by ESLint** | T-025 | `eslint.config.mjs` has `no-restricted-imports` rule for `@radix-ui/react-dialog` | none | T-025 close note |
| §5.y | Storybook 8 with **≥21 stories** (11 primitives × 1 + 10 patterns) **+ axe-core CI** running on every PR | T-025..T-031 | 5 primitive `.stories.tsx` + 10 pattern `.stories.tsx` = **15 stories total** (PRD demands ≥21). **`packages/ui/.storybook/main.ts` does NOT exist**, only stories files. `storybook dev` and `storybook:build` scripts will fail. Axe-core runs only via vitest `jest-axe` fallback inside individual test files; **NO PR-level axe gate** | **P0** | `ls packages/ui/.storybook/` shows 0 main.ts/preview.ts; `package.json` scripts reference non-existent config |
| §5.y | `@monopilot/ui/Stepper` consumed by all wizards (canonical contract) | T-026, T-037 | `packages/ui/package.json` exports map omits Stepper; only Modal/Summary/Field/Input/tokens exported. Wizard `SchemaColumnWizard.tsx` uses an **InlineStepper** (deviation explicitly noted) | **P0** | `packages/ui/package.json` exports; `SchemaColumnWizard.tsx:79-101` |
| §5.y | React peer deps consistent so primitives are consumable in apps/web | T-025..T-031 | `packages/ui` pins **react ^18.3.1**; apps/web uses **react ^19.2.0**. T-037 OPUS REVIEW flagged this; carry-forward T-076 (P0) is still listed in T-037 STATUS as unresolved | **P0** | `packages/ui/package.json:24-25` vs `apps/web/package.json:25-27` |
| §6 | ADR-028 schema-driven `Reference.DeptColumns` + json-schema-to-zod runtime | T-017 | mig 009 + `packages/schema-driven/src/compile.ts` LRU cache | none | mig 009 |
| §6 | Admin UI wizard 5-step Stepper backend draft/publish + schema_version bump | T-036, T-037 | Server Actions `apps/web/app/(settings)/schema/_actions/draft.ts`; UI uses InlineStepper not the canonical primitive | partial | see §5.y row above |
| §7 | Rule engine DSL — 4 obszary (cascading / conditional_required / gate / workflow-as-data) — executor dispatches all 4 | T-018 (stub), T-021 (cascade), T-035 (workflow) | Executor switch dispatches all 4 type names BUT: cascading/conditional_required/gate cases all fall through to identical `evaluateConditions(...)`. **`runCascade()` is never invoked from `executeRule`**; cascade-handler is a sibling function called only by integration tests. Trigger event `fg.manufacturing_operation_N.changed` will NOT actually mutate `fg.intermediate_code_pN` at runtime through the executor. | **P0** | `packages/rule-engine/src/executor.ts:131-180`; `cascade-handler.ts:106` (referenced only from `__tests__`) |
| §7 | Workflow case dispatches to `evaluateTransition` | T-035 | Workflow case fires `void workflowModule.evaluateTransition(...)` fire-and-forget; rule shape is hybrid (`states`/`transitions` optional on base Rule) | partial | `executor.ts:155-178`; T-035 deviations accepted |
| §8 | `tenant_idp_config` 17 PRD columns | T-010, T-060 | mig 005 (8 cols) + mig 016 (11 cols) + mig 025 (GRANT). All 17 present: tenant_id, provider_type, provider_label, metadata_url, entity_id, x509_cert, jit_provisioning, scim_token_hash, scim_token_last_four, enforce_for_non_admins, idle_timeout_min, session_max_h, mfa_required, mfa_required_for_roles, mfa_allowed_methods, password_complexity, password_expiry_days + created_at + updated_at = **18** | none | mig 005 + mig 016 |
| §8 | `tenant_id` is control-plane only (Wave0 §1) | T-010 | mig 005 uses `tenant_id`; mig 002 RLS predicates use `org_id`; idp_config has no RLS (single row per tenant) | none | mig 005 |
| §8 | Upgrade orchestration `tenant_migrations` + canary cohort progression | T-038, T-039 | mig 013 + advanceCohort/recordMigrationRun Server Actions; events.enum.ts +3; outbox CHECK extended (mig 023) | partial — see §3 platform.admin row | mig 013, mig 023 |
| §9 | ADR-030 configurable dept taxonomy | T-019 | mig 011 `Reference.Departments` + `dept_overrides` JSONB + RLS+FORCE | none | mig 011 |
| §9.1 | `Reference.ManufacturingOperations` with `tenant_id` per PRD DDL | T-020 | mig 012 uses **`org_id` (not tenant_id)** per Wave0 v4.3 §1; UNIQUE widened to 3-col `(org_id, industry_code, process_suffix)` | divergence documented (none vs Wave0) | mig 012; T-020 STATUS notes Wave0 v4.3 |
| §9.1 | Cascade `manufacturing_operation_N → intermediate_code_pN` wired via rule engine | T-021 | `runCascade` is single-tx + org-scoped + active-window race-free, **but never called from executor**. T-021 carry-forwards T-080 "executor wire-up" still open | **P0** (same finding as §7) | `cascade-handler.ts`; T-021 STATUS T-080 carry-forward |
| §10 | Outbox + R13 cols + GS1-first + idempotency | T-003, T-006, T-008, T-023, T-024 | mig 003 outbox + mig 014 R13 (5 placeholder tables w/ all 9 R13 cols) + GS1 helpers + mig 015 idempotency_keys | none | migs 003/014/015 |
| §10 | R14 idempotency `transaction_id` UUID v7 + canonicalStringify | T-024, T-043 | mig 015 + `packages/sync-queue` inline UUID v7; canonicalStringify key-order invariant; flusher 409 dedup + 503 retry | none | mig 015; T-024 STATUS |
| §11 | i18n pl/en/uk/ro baseline ICU | T-022 | `apps/web/i18n/routing.ts` with 4 locales; CLDR plural rules; middleware | none | `apps/web/i18n/` |
| §11 | Audit log 13-field schema + 3 indexes per PRD spec **with DESC + actor partial** | T-009 | mig 004 has all 13 columns + retention_class CHECK + impersonation guard + append-only. **PRD specifies 3 indexes including `(tenant_id, occurred_at DESC)`, `(tenant_id, resource_type, resource_id, occurred_at DESC)`, and partial `WHERE actor_user_id IS NOT NULL`. Migration 004 ships 3 indexes BUT no DESC, no resource_type composite occurred_at column, no partial-on-actor.** | **P1** | mig 004 lines 47-61 vs PRD §11 lines 931-933 |
| §11 | Audit retention tiers (security 7y / standard 3y / operational 18mo / ephemeral 30d) | T-009 | CHECK constraint enforces 4 valid classes; **no automated retention pruning job exists**, no S3 Glacier object-lock wiring | partial | mig 004; no `packages/ops/src/audit-retention.ts` |
| §11 | Regulatory roadmap first-class artifact | T-032 | `_foundation/regulatory/` + 7 regulation files + check-regulatory-staleness; YAML front-matter | none | T-032 close |
| §12 | ADR-028..031 Active + R1-R15 candidate registry | T-005 | per T-005 close | none | — |
| §13 | F-U5 NIST password policy: min-12 + HIBP k-anonymity + last-5 history | T-061 | `password-policy.ts` enforces length, common-list, HIBP k-anon (fail-open unless HIBP_FAIL_HARD), last-5 history via `password_history` (mig 018) + argon2 verify | none | `packages/auth/src/password-policy.ts`; mig 018 |
| §13 | MFA-by-default for org.access.admin AND org.schema.admin | T-010 | mig 005 seeds `mfa_required_for_roles=ARRAY['org.access.admin','org.schema.admin']` per row | none | mig 005 |
| §13 | SSO baseline = SAML 2.0 + Microsoft Entra ID connector available day-1 (no upsell gating) | T-012 | SAML SP wired but `enforceSamlPolicy` is **dead code (T-074 carry-forward)** — never invoked from any route handler | **P1** | T-012 STATUS T-074 |
| §13 | RLS coverage 100% business tables | T-007, T-034 | RLS+FORCE on: outbox_events, audit_events, lot, work_order, quality_event, shipment, bom_item, idempotency_keys, password_history, roles, role_permissions, user_roles, org_security_policies, Reference.Departments, Reference.ManufacturingOperations, Reference.DeptColumns, Reference.Rules, dept_column_drafts. **`tenant_idp_config` deliberately NO RLS (single row per tenant; control-plane). `tenant_migrations` — verify.**  | partial | mig 002, 003, 004, 014, 015, 017, 018, 011, 012, 009, 010 |
| §13 | Schema drift detection daily job | T-034 | `packages/ops/src/drift-detect.ts` + cron route 06:00 UTC. **Scope is DeptColumns ↔ information_schema ONLY**; does NOT cover other Reference.* tables, audit_events column drift, or org_security_policies schema | partial | `packages/ops/src/drift-detect.ts:1-30` |
| §13 | DR documented + tested quarterly | T-051 | `_foundation/contracts/d365-posture.md` exists; **no DR runbook, no quarterly test record** | **P1** | no `_foundation/runbooks/dr-*.md` |
| §14 (open) | Pre-Phase-D ADR review (001-019) | — | per PRD §14 explicitly out-of-scope (separate session) | n/a | PRD §14 |
| §W0-v4.3 §1 | `org_id` business scope | T-006, T-007, T-014, T-040, T-048, T-049, T-050 | RBAC mig 017 uses `org_id`; R13 mig 014 uses `org_id`; idempotency mig 015 uses `org_id`; cascade `org_id`; audit `org_id` | none | various migs |
| §W0-v4.3 §2 | `fg.*` canonical / `fa.*` legacy alias | T-003, T-048 | `events.enum.ts` ALL_EVENTS + LegacyEventAlias; mig 023 lists `fg.created/.allergens_changed/.intermediate_code_changed` in CHECK | none | `packages/outbox/src/events.enum.ts` |
| §W0-v4.3 §4 | Shared BOM SSOT skeleton | T-049 | `_foundation/contracts/shared-bom-ssot.md` + `.schema.json` (draft 2020-12); jsonschema validate roundtrip | none | T-049 |
| §W0-v4.3 §6 | D365 optional integration posture | T-051 | `_foundation/contracts/d365-posture.md` 8 sections | none | T-051 |
| §W0-v4.3 §7 | Safe non-spoofable RLS pattern | T-007, T-014, T-045 | mig 002 introduces `app.session_org_contexts` + `app.set_org_context` + `app.current_org_id` (SECURITY DEFINER, no GUC SET by app users) | none | mig 002 |
| §W0-v4.3 §10 | ACP TaskCreate shape | T-052 | manifest + coverage patched | none | T-052 |

---

## §2 — Critical (P0) Drifts

### P0-1 — Rule executor never wires the cascade handler
**File:** `packages/rule-engine/src/executor.ts:131-180`
The `case 'cascading':` arm calls `evaluateConditions(...)` only. The actual cascade handler `runCascade()` in `cascade-handler.ts` is imported by **zero** non-test sites. So when an outbox event `fg.manufacturing_operation_1.changed` arrives, the executor returns `{fired:true, actions:[…]}` — **but no UPDATE on `public.fg.intermediate_code_pN` is issued**. T-021's own STATUS line carries forward `T-080 executor wire-up`. coverage.md row "§9.1 Manufacturing Operations Pattern" claims "covered". Reality: the engine fires lights but no work happens.

### P0-2 — `org.platform.admin` system role has no bootstrap path
**File:** `packages/db/migrations/017-rbac.sql:133-158`
The seeding trigger inserts `org.access.admin` + `org.schema.admin` only. T-039 Server Actions `advanceCohort.ts:41` and `recordMigrationRun.ts:40` both require `org.platform.admin` for authorization. No mechanism creates that role. First production call will 403. Migration 023 even comments this gap explicitly. coverage.md row "§8 Upgrade orchestration" claims "covered".

### P0-3 — `packages/ui` React 18 vs apps/web React 19 peer mismatch makes primitives unconsumable
**Files:** `packages/ui/package.json:24-25` (react ^18.3.1) vs `apps/web/package.json:25-27` (react ^19.2.0).
T-037 OPUS REVIEW flagged the root cause. Carry-forward T-076 is still listed open in T-037 STATUS. Concrete consequence: SchemaColumnWizard.tsx is forced to ship an **InlineStepper** (lines 79-101) instead of importing `@monopilot/ui/Stepper`. The §5.y "single source of truth" contract is broken at the consumer side; every downstream module (12 modules per PRD §5.y rationale) will replicate the inline pattern unless the peer deps are fixed before the next module's first T3-ui task. The PRD §4.2-AMENDMENT addendum makes this a **critical-path blocker**.

### P0-4 — Storybook ≥21 stories + axe-core CI gate are not actually shipping
**Files:** `packages/ui/.storybook/` directory.
- Story count: 5 primitive stories + 10 pattern stories = **15** (PRD §5.y demands ≥21: "11 primitives × 1 + 10 pattern templates"). Missing 6 primitive stories.
- No `main.ts`, `preview.ts`, or `manager.ts` in `.storybook/`. The `storybook dev`/`storybook:build` scripts will fail with "no config".
- axe-core runs inside vitest test files via `jest-axe` fallback (T-025 close note acknowledges this). PRD demands "axe-core CI running on every PR" — there is no CI workflow file enforcing it.

### P0-5 — Magic-link 7-day TTL not codified — relies on undocumented Supabase project setting
**File:** `apps/web/app/(auth)/actions.ts:1-15`
Comment: "Production deployment MUST configure Supabase auth settings to match (7-day OTP window, 15-min access token TTL)". The TTL constant is sent as a `data.ttl` JWT claim only — not enforced server-side at sign-in. T-011 carry-forward T-063 ("deploy runbook") is still open; no `_foundation/runbooks/` directory exists. PRD §13 / F-U5 explicitly says "codified, not Supabase-default". Today it IS Supabase-default plus a non-load-bearing JWT claim.

### P0-6 — `org.platform.admin` granting flow + impersonation orchestration absent
Same root cause as P0-2; coverage row §8 / §13 SOC2 CC6 visibility cannot be satisfied because there is no UI/API to grant the role and no audit row pattern for it. (Sub-finding of P0-2 — counted separately because it affects §13 success criteria, not just §8.)

### P0-7 — Audit log indexes diverge from PRD §11 spec
**File:** `packages/db/migrations/004-audit.sql:47-61`
PRD §11 prescribes:
- `(tenant_id, occurred_at DESC)`
- `(tenant_id, resource_type, resource_id, occurred_at DESC)`
- `(tenant_id, actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL`

Migration ships:
- `(org_id, occurred_at)` — no DESC (acceptable per Postgres scan reversal but not what spec says)
- `(request_id)` — different column from PRD spec
- `(resource_type, resource_id)` — missing org_id prefix and missing `occurred_at DESC` tail

The actor partial index is entirely absent. Production audit-log query patterns (resource history per org, actor history per org) will full-scan the `(org_id, occurred_at)` index. (Severity P1 in audit table; promoted to P0-class finding because it's a measurable performance regression at first 10k tenants.)

---

## §3 — Coverage.md Corrections Proposal

The following coverage.md rows should be downgraded:

| Row | Current claim | Proposed status | Rationale |
|---|---|---|---|
| §3 Personas + Org Admin / Schema Admin SoD split (F-U4) | covered | **partial** (covered for SoD; missing platform.admin) | P0-2 |
| §5.x Auth & Identity (F-A1, 6 OSS libs) | covered | **partial** | T-074/T-075 SAML carry-forwards open; magic-link runbook missing (P0-5) |
| §5.y UI primitives @monopilot/ui (F-A3) + 10 MODAL-SCHEMA patterns | covered | **partial / carry-forward** | P0-3, P0-4: peer-dep mismatch + only 15 stories + no Storybook config |
| §6 Schema-driven Admin UI wizard (ADR-028) — backend draft/publish + 5-step UI | covered | **partial** | Wizard uses InlineStepper, not canonical primitive |
| §7 Workflow-as-data (4th rule_type, ADR-029) | covered | **partial** | P0-1: cascade handler not wired into executor |
| §8 Upgrade orchestration | covered | **partial / carry-forward** | P0-2 platform.admin seed missing |
| §9.1 Manufacturing Operations Pattern | covered | **partial** | P0-1 cascade handler unwired |
| §10 R13 identity columns / cascade integration | covered | **partial** | cascade integration depends on P0-1 fix |
| §11 i18n + Audit log F-U3 (13-field, retention tiers) + regulatory | covered | **partial** | P0-7 indexes diverge; no retention pruning job |
| §13 niefunkcjonalne — drift detection + RLS coverage 100% | covered | **partial** | drift-detect scope = DeptColumns only; doesn't cover audit_events, org_security_policies, Reference.Rules drift |
| §13 success criteria / F-U5 magic-link 7-day | covered | **partial** | P0-5 |
| §13 success criteria / DR documented + quarterly tested | (not separately listed) | **gap (out-of-scope or carry-forward)** | No DR runbook, no quarterly test record |

The Wave0 v4.3 readiness section line "Foundation Wave0 v4.3 readiness ≥ 95%" should be revised to **~78%**. The "All 61 tasks are DONE as of 2026-05-07" sentence is technically true but conflates "task closed via REVIEW PASS with carry-forwards" with "PRD requirement satisfied".

---

## §4 — Recommended New Tasks

| ID (suggested) | Title | Severity | Closes |
|---|---|---|---|
| T-062 | Wire `runCascade()` into rule-engine `executeRule` cascade arm; add integration test that `fg.manufacturing_operation_1.changed` event ⇒ row UPDATE + outbox INSERT | P0 | P0-1 / T-021 carry-forward T-080 |
| T-063 | Migration 026: extend `seed_system_roles_on_org_insert` to also create `org.platform.admin` (system=true); add Apex bootstrap migration to backfill existing orgs | P0 | P0-2 |
| T-064 | `packages/ui` React 19 peer-deps alignment + Stepper export in package.json + refactor `SchemaColumnWizard.tsx` to use canonical primitive | P0 | P0-3 / T-037 carry-forwards T-076/T-077 |
| T-065 | Storybook config (`main.ts`, `preview.ts`) + 6 missing primitive stories (Modal, Button, RunStrip, EmptyState, TabsCounted, CompactActivity, DryRunButton) + axe-core CI workflow file | P0 | P0-4 |
| T-066 | `_foundation/runbooks/auth-magic-link-7d.md` + `apps/web/scripts/check-supabase-otp-config.ts` smoke that fails CI if Supabase OTP expiry ≠ 7d | P0 | P0-5 / T-011 carry-forward T-063 |
| T-067 | Migration 027: align `audit_events` indexes with PRD §11 (DESC + 3-tuple resource composite + actor partial); drop superseded indexes | P1 | P0-7 |
| T-068 | Wire `enforceSamlPolicy` into SAML callback route; add policy-enforced regression test | P1 | T-012 carry-forward T-074 |
| T-069 | Extend drift detection scope to cover `Reference.Rules`, `Reference.ManufacturingOperations`, `audit_events`, `org_security_policies` schema drift | P1 | §13 partial |
| T-070 | Audit retention pruning job (`packages/ops/src/audit-retention.ts`) + S3 Glacier object-lock placeholder for `security` class | P1 | §11 partial |
| T-071 | DR runbook + quarterly test record template under `_foundation/runbooks/` | P1 | §13 success-criteria gap |

---

## §5 — Observations on coverage.md / STATUS.md credibility

1. coverage.md's "Wave0 v4.3 readiness ≥ 95%" claim is an aspirational metric, not measured. Of 61 closed tasks, **at least 5 ship with documented carry-forwards that materially block PRD acceptance** (T-011 T-063, T-012 T-074-T-077, T-014 T-064-T-068, T-021 T-080, T-037 T-076-T-079).
2. Several "covered" rows treat "task PIPELINE PASS" as equivalent to "PRD requirement satisfied". They are not. The audit table above re-evaluates from the PRD side.
3. The Wave-A consolidation tasks (T-053..T-061) are an honest acknowledgement of audit findings — but they did not catch P0-1 (cascade unwired), P0-2 (platform.admin), P0-3 (React peer-deps still listed in T-037 carry-forward), or P0-4 (Storybook config absent). Recommend a Wave-B consolidation pass (T-062..T-071) BEFORE module 01-NPD-a Track A starts, since the cascade handler and Stepper primitive are direct inputs.

---

**Coverage table row count:** 50 mapped rows.
**Top P0 drifts:** (1) cascade handler never wired into executor; (2) `org.platform.admin` has no bootstrap path; (3) `packages/ui` React 18 ↔ apps/web React 19 peer mismatch + Stepper not exported.
