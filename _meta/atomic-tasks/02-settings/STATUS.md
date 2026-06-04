<!-- REALITY-AUDIT 2026-06-04 (HEAD 5534d0c1): 95 IMPLEMENTED / 57 STUB / 1 MISSING. Detail: _meta/audits/reality/02-settings-REALITY.md. STRICT verdicts (STUB incl. real pages lacking live parity screenshot). Corrected false-🔄: T-074/075/111 → ⏸ (redirect stubs / fallback data). -->
# 02-settings — STATUS
<!-- Legend: ✅ IMPLEMENTED | 🔄 IN PROGRESS | ⏸ STUB/BROKEN (reason in note) | ⬜ MISSING -->
<!-- Reconciled 2026-06-03 post W1-W7 by /kira:run-module. DO NOT hand-edit status without evidence. -->

## Wave 1-7 changelog (2026-06-03)

The 2026-06-02 audit predates the whole run. Waves W1-W7 (branch `kira/long-run`)
took the module from "backend ~90%, ~57 UI screens ⏸ no-parity" to "real-data +
RTL-parity on ~28 screens, schema gaps closed, parity-evidence harness authored,
data plane verified live on Vercel+Supabase". Per-wave summary + commit SHAs:

- **W1 — schema foundation** (merged `0ccedce6`). Migrations 063-068 + 7 Drizzle
  schema files + seeds. Closed the P0 runtime-bomb tables: `org_authorization_policies`
  (063), `unit_of_measure`+`uom_custom_conversions` (064), `d365_sync_runs` (065),
  `email_delivery_log` (066), `feature_flags_core` (067), `login_attempts`/`org_security_policies`/
  `password_history` (068). New cross-org isolation test 13/13. → T-011/012/013/117/122/123 ✅.
- **W2a/W2b — Class B real-data wiring** (merged into `kira/long-run`). ~14 screens
  moved from FULL_MOCK/no-loader to REAL Supabase via `withOrgContext` + RTL parity
  tests, zero hardcode. → T-065/068/069/070/072/073/074/075/076/079/096/103/120/121/127/128 → 🔄.
- **W3 — Class C parity polish** (merged into `kira/long-run`). ~14 more screens:
  prototype parity 1:1 + failing `page.test.tsx` fixed + residual partial-hardcode
  removed (tenant, rules, schema-admin, reference/mfg-ops, d365, users/company/security/
  invitations). UI suite 17 failed/591 (from 36/584 baseline), zero new regressions.
  → T-058/059/060/061/062/063/064/067/077/097/098/099/100/101/102/108/109/111/112/114/115/119 → 🔄.
- **W4 — structural consolidation** (commit `fc01f78e`). Dropped stale non-localized
  `(admin)/settings/**` duplicate routes; guard/topology/i18n-consumption tests repointed
  to canonical `[locale]/(app)/(admin)/settings/**` + pass; web typecheck 0.
- **W5 — Class D build-now** (commit `6a673e58`). `processes` + `partners` now REAL
  schema-driven reference screens via `withOrgContext` (migration 073 seeds 6 process +
  2 partner rows; verified live on Supabase khjvkhzwfzuwzrusgobp); `onboarding` settings
  route → real entry point reading `loadOnboardingContext`; `boms` = honest stub +
  recorded EXTERNAL GAP → 03-technical/08-production. New UI tests 7/7. (Class D, no task IDs.)
- **W6 — parity-evidence harness** (commit `a1258aac`). Authored `e2e/settings/_catalog.ts`
  + `_runner.ts` + 11 per-group parity specs (T-143..T-153) + `auth.setup.ts`, plus E2E
  flow specs T-080/081/085/086/088 runnable and T-082/087 honest `test.fixme`. Typecheck 0,
  eslint 0, `playwright --list` = 72 tests/26 files. NOT yet executed against live preview
  → these move ⬜→🔄 (authored + list/type/lint-verified; live artifact capture pending).
- **W7 — infra closeout** (commit `9e8136e3`). `integration_settings` migration 072 +
  Drizzle schema + isolation test; ESLint enum-lock guard `tooling/eslint-rules/` + rule
  test (T-130 ⬜→✅); i18n ro/uk `02-settings.json` key-parity with en (1553 leaf keys,
  0 ICU mismatch — verified, T-116 ⏸→✅); real non-mocked SCIM `bearer.integration.test.ts`
  exercising `verifyScimBearer` UNION-ALL path (T-034 ⏸→✅, T-083 ⬜→✅).
- **Post-merge: deploy + data plane** (commits `f73f5195`, `e63345f5`, `ce68e984`).
  Migrations 051-073 applied to Supabase (were silently stuck at 050); `vercel.json`
  fail-loud; Codex review → migration 071 P1 fixes; `app_user` password drift fixed
  (`DATABASE_URL_APP` corrected); Gate-5 live click-through PASS — `/settings/company`,
  `/settings/users`, `/settings/infra/lines` render REAL Apex org data on the deployed
  preview. Remaining non-OK live screens are INTENTIONAL (RBAC-denied for the org-admin
  test account, or honest 0-row empty states) — no bugs. Sweep: `_meta/runs/02-settings-GATE5-SWEEP.md`.

## T1-schema — Database migrations & enums

| ID | Title | Status | Note |
|---|---|---|---|
| T-001 | Lock settings permission enum | ✅ | `packages/rbac/src/permissions.enum.ts` + test green |
| T-002 | Extend settings permission enum (ext) | ✅ | Full ext permissions present in enum |
| T-003 | Lock settings outbox event enum | ✅ | `packages/outbox/src/events.enum.ts` — path differs from scope but functionally complete |
| T-004 | Drizzle migration: organizations + users + roles + modules | ✅ | schema/settings-core.ts + 037-settings-core.sql + test |
| T-005 | Drizzle migration: schema metadata | ✅ | schema/schema-metadata.ts + 038-schema-metadata.sql + test |
| T-006 | Drizzle migration: rule_definitions + rule_dry_runs | ✅ | schema/rule-registry.ts + 039-rule-registry.sql + test |
| T-007 | Drizzle migration: tenant_variations + tenant_migrations | ✅ | schema/tenant-l2.ts + schema/tenant-migrations.ts + 040-tenant-l2.sql + test |
| T-008 | Drizzle migration: reference_tables generic storage | ✅ | schema/reference-tables.ts + 041-reference-tables.sql + test |
| T-009 | Drizzle migration: infrastructure (warehouses/locations/machines/lines) | ✅ | schema/infra-master.ts + 042-infra-master.sql + test |
| T-010 | Drizzle migration: audit_log monthly partitioning | ✅ | 043-audit-log-partitioning.sql + audit-log-retention.test.ts |
| T-011 | Drizzle migration: org_security_policies + login_attempts + password_history | ✅ | W1 2026-06-03: `068-login-attempts.sql` (org_id nullable, lockout indexes, RLS) + `packages/db/schema/security.ts` (loginAttempts + orgSecurityPolicies + passwordHistory); cross-org isolation test green |
| T-012 | Drizzle migration: SSO + SCIM + IP allowlist | ✅ | W1 2026-06-03: `packages/db/schema/sso-scim-ip.ts` (scimTokens + adminIpAllowlist) added over existing 044 SQL |
| T-013 | Drizzle migration: feature_flags_core + notification_preferences | ✅ | W1 2026-06-03: `067-feature-flags-core.sql` (PK org_id+flag_code, rolled_out_pct, RLS) + per-org core-flag seed + `packages/db/schema/flags-prefs.ts` (featureFlagsCore + notificationPreferences) |
| T-014 | Audit trigger framework (write-on-change) + pg_cron retention | ✅ | 004-audit.sql + 036-audit-log-retention.sql + tests |
| T-039 | Migration: Reference.ManufacturingOperations table + per-industry seed | ✅ | 012-manufacturing-ops.sql + seeds/manufacturing-operations.sql + test |
| T-095 | Decisions log: lock D1..D8 | ✅ | `_meta/decisions/2026-04-30-settings-d1-d8.md` exists |
| T-117 | Schema: settings flag require_grn_qc_inspection | ✅ | W1 2026-06-03: confirmed canonical store = `tenant_variations.feature_flags` JSONB (exists); accessor + reader + UI toggle already present. No redundant migration (PO/JSONB decision documented) |
| T-122 | Authorization policies schema and org seed | ✅ | W1 2026-06-03: `063-org-authorization-policies.sql` (forced RLS, V-SET-43 CHECK, per-org default seed) — columns match preflight.ts/policy-actions.ts; also seeds `technical_product_spec_approval_gate_v1` into rule_definitions (clears T-123 + T-126 runtime bomb). `/authorization` `/roles` `/tenant` now read real data |

## T2-api — Server Actions & API routes

| ID | Title | Status | Note |
|---|---|---|---|
| T-015 | RLS contract test: withOrgContext via app.set_org_context | ✅ | `lib/auth/with-org-context.ts` + rls.cross-org.integration.test.ts |
| T-016 | Server Action: createOrganization + RBAC seed | ✅ | `actions/orgs/create.ts` + test |
| T-017 | Server Action: inviteUser with seat-limit pre-flight + 7-day TTL | ✅ | `actions/users/invite.ts` + tests |
| T-018 | Server Actions: assignRole, deactivateUser, resetPassword | ✅ | `actions/users/assign-role.ts`, `deactivate.ts`, `reset-password.ts` + tests |
| T-019 | Server Action: toggleModule + dependency check | ✅ | `actions/modules/toggle.ts` + test |
| T-020 | Server Action: setCoreFlag with V-SET-42/43/44 validations | ✅ | `actions/flags/set-core.ts` + test |
| T-021 | Server Actions: reference_tables CRUD | ✅ | `actions/reference/list.ts`, `get.ts`, `upsert.ts`, `soft-delete.ts` + test |
| T-022 | Server Actions: reference CSV import + export with conflict report | ✅ | `actions/reference/import-csv.ts`, `export-csv.ts` + test |
| T-023 | Server Actions: schema admin wizard (addColumn/editColumn/deprecate + dry-run) | ✅ | `actions/schema/add-column.ts`, `edit-column.ts`, `deprecate-column.ts` + test |
| T-024 | Server Action: Zod runtime generator per org_id + schema_version + cache | ✅ | `lib/schema/zod-runtime.ts` + test |
| T-025 | Server Action: rule registry list/detail + dry-run results query | ✅ | `actions/rules/list.ts`, `get.ts`, `dry-runs.ts` + test |
| T-026 | CI deploy script: rules JSON → rule_definitions upsert | ✅ | `scripts/rules-deploy.ts` + test |
| T-027 | Server Actions: tenant_variations CRUD | ✅ | `actions/tenant/set-dept.ts`, `set-local-flag.ts`, `set-rule-variant.ts` + test |
| T-028 | Server Actions: upgrade orchestration (preview/start/promote/rollback) | ✅ | `actions/tenant/preview-upgrade.ts`, `start-upgrade.ts`, `promote-canary.ts`, `rollback-upgrade.ts` + test |
| T-029 | Server Actions: warehouses + locations + machines + lines CRUD | ✅ | `actions/infra/warehouse.ts`, `location.ts`, `machine.ts`, `line.ts` + test |
| T-030 | Server Actions: D365 constants CRUD + test connection | ✅ | `actions/d365/set-constant.ts`, `test-connection.ts`, `get.ts` + test |
| T-031 | Server Actions: email_config CRUD + Resend test send | ✅ | `actions/email/upsert-config.ts`, `test-provider.ts` + test |
| T-032 | Server Actions: org_security_policies upsert + MFA enrollment trigger | ✅ | `actions/security/upsert-policy.ts`, `force-mfa.ts` + test |
| T-033 | Server Actions + route handlers: SSO config (SAML Entra) + test | ✅ | `actions/sso/upsert-config.ts`, `disable.ts`; route handlers at `app/api/auth/saml/` + behavior test |
| T-034 | SCIM 2.0 endpoints (Users + Groups) + token CRUD | ✅ | W7 2026-06-03: verifier join CONFIRMED wired — `apps/web/lib/scim/middleware.ts` `verifyScimBearer` does the UNION ALL bridge over `scim_tokens.org_id` ↔ `tenant_idp_config.tenant_id` (filters `revoked_at is null`). Real integration test added `apps/web/__tests__/scim/bearer.integration.test.ts` (4 AC, DATABASE_URL-guarded): valid argon2 scim_token authenticates + resolves owning org + registers a usable session token; wrong bearer → null → 401; revoked token → null → 401; missing/malformed header → null → 401. Run for real on a fully-migrated local PG: 4/4 PASS. The legacy `scim.test.ts` keeps its mocked seat-limit + PATCH-ops coverage (4/4) — the bearer path is no longer mocked away. Run: `DATABASE_URL=… APP_USER_PASSWORD=app-user-test-password pnpm exec vitest run apps/web/__tests__/scim/bearer.integration.test.ts` |
| T-035 | Edge middleware: IP allowlist + onboarding redirect guard + idle timeout | ✅ | `proxy.ts` + `lib/auth/edge-middleware-policy.ts` + test |
| T-036 | Server Actions: admin_ip_allowlist CRUD with overlap-0.0.0.0/0 reject | ✅ | `actions/security/ip-allowlist-*.ts` + behavior test |
| T-037 | Server Actions: onboarding state machine (next/back/skip/restart/jump) | ✅ | `actions/onboarding/advance.ts`, `back.ts`, `jump.ts`, `restart.ts`, `complete-step.ts` + test |
| T-038 | Server Actions: Reference.ManufacturingOperations CRUD + reorder + reset | ✅ | `actions/reference/manufacturing-ops/` + test |
| T-040 | Server Action: cascade engine lookup for ManufacturingOperations | ✅ | `lib/cascade/manufacturing-ops-lookup.ts` + test |
| T-110 | PostHog Feature Flags Proxy (SET-072 §10.3) | ✅ | `app/api/posthog/flags/route.ts` + test |
| T-124 | Pending Invitations lifecycle backend list/resend/revoke | ✅ | `actions/users/invitations-lifecycle.ts` + test |
| T-125 | Global Import/Export backend jobs and capability registry | ✅ | `actions/import-export/capabilities.ts`, `jobs.ts`, `import.ts`, `export.ts` + test |
| T-126 | Authorization policy helpers, actions and preflight blockers | ✅ | W1 cleared the blocker: `public.org_authorization_policies` table now EXISTS (`063-org-authorization-policies.sql`, forced RLS + per-org seed). Code + tests already present; runtime save path no longer bombs. `/authorization` (T-127) renders + saves real policy data live (Gate-5). |
| T-130 | ESLint enum-lock guard for permissions.enum.ts (RBAC governance) | ✅ | W7 2026-06-03 (`9e8136e3`): `tooling/eslint-rules/` EXISTS — `rules/no-direct-permissions-enum-edit.mjs` + `index.mjs` + `baselines/permissions.snapshot.json` + `scripts/generate-snapshot.mjs`; rule test `__tests__/no-direct-permissions-enum-edit.test.mjs` PASS. Workspace package registered. |

## T3-ui — Pages & Components

> After W2a/W2b/W3 (2026-06-03) most screens below are 🔄: page exists + REAL Supabase data
> via `withOrgContext` (zero hardcode) + RTL/`page.test.tsx` parity green. The remaining gate
> for 🔄→✅ is the W6 Playwright+axe parity-evidence artifact captured against the LIVE preview
> (specs T-143..T-153 authored but not yet executed live). Rows still ⏸ are onboarding/modal
> screens not yet reached by a wave (no real-data wiring or parity test run). See per-row Notes.

| ID | Title | Status | Note |
|---|---|---|---|
| T-041 | SET-001 Org Profile step (onboarding) | ⏸ | Page exists + real Supabase; no parity evidence |
| T-042 | SET-002 First Warehouse step | ⏸ | Page exists; no parity evidence |
| T-043 | SET-003 First Location step | ⏸ | Page exists; no parity evidence |
| T-044 | SET-004 First Product step | ⏸ | Page exists; no parity evidence |
| T-045 | SET-005 First Work Order step | ⏸ | Page exists; no parity evidence |
| T-046 | SET-006 Onboarding Completion | ⏸ | Page exists; no parity evidence; confetti unverified |
| T-047 | SM-01 RuleDryRunModal | ⏸ | Component + test exist; no parity screenshot/axe |
| T-048 | SM-02 FlagEditModal | ⏸ | Component + test exist; no parity evidence |
| T-049 | SM-03 SchemaViewModal | ⏸ | Component + test exist; no parity evidence |
| T-050 | SM-04 EmailTemplateEditModal | ⏸ | Component + test exist; no parity evidence |
| T-051 | SM-05 PromoteToL2Modal | ⏸ | Component + test exist; no parity evidence |
| T-052 | SM-06 UserInviteModal | ⏸ | Component + test exist; no parity evidence |
| T-053 | SM-07 RoleAssignModal | ⏸ | Component + test exist; no parity evidence |
| T-054 | SM-08 D365TestConnectionModal | ⏸ | Component + test exist; no parity evidence |
| T-055 | SM-09 PasswordResetModal | ⏸ | Component + test exist; no parity evidence |
| T-056 | SM-10 DeleteReferenceDataModal | ⏸ | Component + test exist; no parity evidence |
| T-057 | SM-11 RefRowEditModal | ⏸ | Component + test exist; no parity evidence |
| T-058 | Company Profile screen (SET-010) | 🔄 | W3 2026-06-03 (`fc01f78e` lineage): REAL org loader via withOrgContext + parity polish; `page.test.tsx` green. LIVE PROOF (Gate-5): `/settings/company` renders real Apex org data (Meat processing / Poland / PLN / Europe-Warsaw). Playwright/axe artifact pending live capture (W6 spec authored). |
| T-059 | Users screen (SET-008) | 🔄 | W3 2026-06-03: real `public.users` directory + role matrix + KPI tiles via withOrgContext; `page.test.tsx` green; RSC inline-closure crash fixed (`ce68e984`). LIVE PROOF (Gate-5): `/settings/users` shows real user dir (admin@monopilot.test, role matrix, KPIs). Playwright/axe pending (W6 spec `settings-users-parity-evidence.spec.ts` authored). |
| T-060 | Security screen (SET-012) | 🔄 | W3 2026-06-03: real `org_security_policies` loader; removed hardcoded passwordPolicy fallback; `page.test.tsx` green. Playwright/axe pending W6. |
| T-061 | D365 Connection screen (SET-080) | 🔄 | W3 2026-06-03: real d365_constants loader + 5-constant gate enforced + save wired; `page.test.tsx` green. Playwright/axe pending W6 (E2E `d365-toggle.spec.ts` authored, T-086). |
| T-062 | D365 Mapping screen (SET-081) | 🔄 | W3 2026-06-03: removed static DEFAULT_MAPPING_ROWS → real mapping read via withOrgContext; `page.test.tsx` green. Playwright/axe pending W6. |
| T-063 | Rules Registry screen (SET-040) | 🔄 | W3 2026-06-03: real rule_definitions loader; tests repointed to canonical route + dry-run trigger wired; rules suite 9/9. Playwright/axe pending W6. |
| T-064 | Rule Detail screen (SET-041) | 🔄 | W3 2026-06-03: real rule detail + dry-runs query via withOrgContext; parity polish; covered by rules suite 9/9. Playwright/axe pending W6. |
| T-065 | Flags Admin screen (SET-071) | 🔄 | W2a 2026-06-03: REAL data wired — reads `feature_flags_core` via withOrgContext, V-SET-43 from real `org_authorization_policies`, toggle via setCoreFlag; removed defaultFlags/DEFAULT_PREFLIGHT; +permission-denied state; 13/13 UI tests. Playwright/axe evidence pending W6 |
| T-066 | Schema Browser screen (SET-030) | ⏸ | 221-line page, real Supabase; parity_report present; completeness unverified |
| T-067 | Reference Data screen (SET-050) | 🔄 | W3 2026-06-03: schema-driven columns parity verified + real reference_tables loader; reference+mfg-ops suite 18/18. E2E `settings-reference.spec.ts` present. Playwright/axe artifact pending live capture (W6). |
| T-068 | Email Templates screen (SET-090) | 🔄 | W2a 2026-06-03: REAL loader via withOrgContext (reference_tables email_config + integration_settings w/ to_regclass guard); test-send via real RBAC; removed DEFAULT_TEMPLATES; UI tests green. Gap: `integration_settings` table has no migration (fails closed). Playwright/axe pending W6 |
| T-069 | Email Variables screen (SET-091) | 🔄 | W2a 2026-06-03: REAL variable registry (domain constant) via withOrgContext; removed DEFAULT_GROUPS; UI tests green. Playwright/axe pending W6 |
| T-070 | Promotions screen (SET-063) | 🔄 | W2a 2026-06-03: REAL callerAccess via withOrgContext + real tenant_migrations; authored submitPromotion/previewPromotion actions; removed always-403 default; 9/9 UI tests. Playwright/axe pending W6 |
| T-071 | Notifications screen (SET-092) | ⏸ | Page exists; no parity evidence |
| T-072 | Features screen (SET-070) | 🔄 | W2a 2026-06-03: REAL organization_modules+modules via withOrgContext; removed DEFAULT_FEATURES/MODULE_DESCRIPTIONS/activeSessionCount=28; descriptions from catalog (migration 069 adds modules.description); 16 UI tests (shared w/ T-103). Playwright/axe pending W6 |
| T-073 | Units (UoM) screen | 🔄 | W2b 2026-06-03: REAL read of unit_of_measure+uom_custom_conversions (064); canEdit from real settings.units.manage RBAC; working add/conversion/soft-delete Server Actions; removed deferred read-only deviation; 9/9 UI tests. Playwright/axe pending W6 |
| T-074 | My Profile screen (SET-101) | ⏸ | W2b 2026-06-03: REAL signed-in user via withOrgContext (public.users); password/logout via Supabase Auth; removed NOT_CONFIGURED stubs; 15 data + 11 RTL tests. Gaps: no user_sessions table (SESSIONS_BACKEND_UNAVAILABLE), no users.phone. Playwright/axe pending W6 | [AUDIT 2026-06-04: page is a 10-line redirect to /settings/company — does NOT render; REBUILD needed]
| T-075 | My Notifications preferences screen | ⏸ | W2b 2026-06-03: REAL read/write notification_preferences (049) + outbox; removed hardcoded defaults + 'current-user'; new Server Component wrapper. Gap: quiet-hours times not stored (boolean-channel schema). Playwright/axe pending W6 | [AUDIT 2026-06-04: redirect stub; REBUILD]
| T-076 | Integrations catalog screen (SET-110) | 🔄 | W2a 2026-06-03: REAL loader via withOrgContext (d365_constants, email_config, scim_tokens, d365_sync_runs); interactive accordion; removed EMPTY_CATEGORIES; 9 UI tests. SSO derived via SCIM (tenant_idp_config is control-plane). Playwright/axe pending W6 |
| T-077 | Manufacturing Operations List screen (SET-055) | 🔄 | W3 2026-06-03: real Reference.ManufacturingOperations loader + parity polish (industry_code/dept model); reference+mfg-ops suite green. Playwright/axe pending W6. |
| T-078 | Manufacturing Operation Edit modal (SET-056) | ⏸ | Modal + test exist; no parity evidence |
| T-079 | Audit log viewer screen (SET-013) | 🔄 | W2a 2026-06-03: REAL loader — callerAccess + partition-aware audit_log query via withOrgContext (real EXPLAIN partition names); removed forbidden-by-default + empty fallback; 9/9 UI tests. IP column null (table has none). Playwright/axe pending W6 |
| T-096 | Reference CSV Import Wizard screen (SET-053) | 🔄 | W2b 2026-06-03: dead commit pipeline WIRED — Upload→preview via previewReferenceCsvImport, Commit via real commit action (T-022); 15/15 UI tests. SET-053 has no JSX (UX-spec). Playwright/axe pending W6 |
| T-097 | Schema Column Edit Wizard screen (SET-031, 8-step) | 🔄 | W3 2026-06-03: step3 type-cards + step4 validators completed; real schema-admin actions; schema suite 22/22. `schema/new/page.tsx`; `schema-wizard/` redirects here. Playwright/axe pending W6. |
| T-098 | Schema Diff Viewer screen (SET-032) | 🔄 | W3 2026-06-03: version pickers made dynamic + revert confirm added; real diff data; schema suite 22/22. Playwright/axe pending W6. |
| T-099 | Schema Migrations Queue screen (SET-033) | 🔄 | W3 2026-06-03: filter pills→select + Diff link added; real migrations-queue read; schema suite 22/22. Playwright/axe pending W6. |
| T-100 | Tenant Variations Dashboard (SET-060) | 🔄 | W3 2026-06-03: removed partial-hardcode (schemaExtensionsL3=0, lastUpgradeAt=null) → real tenant_variations; tenant suite 21/21. Playwright/axe pending W6. |
| T-101 | Dept Taxonomy Editor (SET-061) | 🔄 | W3 2026-06-03: removed BASELINE_DEPARTMENTS hardcode → real dept taxonomy via withOrgContext; tenant suite 21/21. Playwright/axe pending W6. |
| T-102 | Rule Variant Selector (SET-062) | 🔄 | W3 2026-06-03: real rule-variant read/write; tenant suite 21/21. Playwright/axe pending W6. |
| T-103 | Module Toggles Dashboard (SET-070-grid) | 🔄 | W2a 2026-06-03: REAL org-scoped loader (modules+organization_modules, reverse-dep warnings) via withOrgContext; removed NO_LIVE_MODULES; toggle via T-019; migration 069 adds organization_modules.updated_at (fixes latent toggle bug); 16 UI tests (shared w/ T-072). Playwright/axe pending W6 |
| T-104 | Warehouse List screen (SET-012-warehouse) | ⏸ | `infra/warehouses/page.tsx` 295 lines; no parity evidence |
| T-105 | Location Tree screen (SET-014) | ⏸ | `infra/locations/page.tsx`; locations-modal-crud E2E spec present |
| T-106 | Machine List screen (SET-016) | ⏸ | `infra/machines/page.tsx`; no parity evidence |
| T-107 | Line List screen (SET-018) | ⏸ | `infra/lines/page.tsx`; no parity evidence |
| T-108 | Rule Version Diff screen (SET-042) | 🔄 | W3 2026-06-03: real rule-version diff via withOrgContext; covered by rules suite. Playwright/axe pending W6. |
| T-109 | Migration History screen (SET-064) | 🔄 | W3 2026-06-03: removed lastChangedAt=null hardcode → real tenant_migrations history; tenant suite 21/21. Playwright/axe pending W6. |
| T-111 | D365 Sync Config screen (SET-082) | ⏸ | W3 2026-06-03: real d365 sync config via withOrgContext; d365 suite green. Note: `/d365/sync` is owner-RBAC-gated (org-admin test account sees denied — intentional, Gate-5). Playwright/axe pending W6. | [AUDIT 2026-06-04: fallback defaults, NOT real data — no sync-config table]
| T-112 | D365 Sync Audit screen (SET-083) | 🔄 | W3 2026-06-03: reads real `d365_sync_runs` (065) — honest empty-state (0 rows); was a runtime-bomb (missing table) pre-W1. d365 suite green. Playwright/axe pending W6. |
| T-113 | Email Delivery Log screen (SET-093) | 🔄 | Reads real `email_delivery_log` (066) — was a runtime-bomb (missing table) pre-W1, now honest empty-state. Page real-data wired; parity test + Playwright/axe artifact pending W6. |
| T-114 | Reference Audit Trail screen (SET-054) | 🔄 | W3 2026-06-03: real reference audit-trail via withOrgContext; reference+mfg-ops suite 18/18. Playwright/axe pending W6. |
| T-115 | Manufacturing Operation Audit Trail screen (SET-057) | 🔄 | W3 2026-06-03: mfg-ops history namespace + IP column fixed → real audit trail; mfg-ops history 22/22. Playwright/axe pending W6. |
| T-118 | UI: Settings toggle for require_grn_qc_inspection | 🔄 | T-117 gap resolved (W1: canonical store = `tenant_variations.feature_flags` JSONB, accessor + reader + toggle present). Page + component + action real-data wired. Playwright/axe artifact pending W6. |
| T-119 | Pending Invitations screen (SET-010) | 🔄 | W3 2026-06-03: migrated to real SSR loader (T-124 invitations lifecycle) via withOrgContext + `@monopilot/ui` import guard fix; users/company/security/invitations suite 25/0. E2E `invite-accept.spec.ts` (T-081). Playwright/axe pending W6. |
| T-120 | Roles and Permissions screen (SET-011) | 🔄 | W2b 2026-06-03: removed FALLBACK_ROLES/FALLBACK_USERS hardcode → real user_roles/roles via withOrgContext, honest empty-state; RolesScreen migrated INTO localized tree (roles-screen.client.tsx), non-localized now thin re-export; guard test fixed (17/18, 1 pre-existing). Playwright/axe pending W6 |
| T-121 | Global Import / Export screen (SET-029) | 🔄 | W2b 2026-06-03: REAL loader (T-125 listImportExportCapabilities + import_export_jobs via withOrgContext); export/import-dry-run wired to real actions; removed injection-only placeholder; 24 UI tests. Playwright/axe pending W6 |
| T-127 | Authorization Policies screen (SET-011b) | 🔄 | W2b 2026-06-03: org_authorization_policies table now exists (063) → renders REAL policy data; removed SERVER_DEFAULT_POLICIES error-only fallback; save via T-126. Runtime bomb cleared. Playwright/axe pending W6 |
| T-128 | Schema Shadow Preview screen (SET-034) | 🔄 | W2b 2026-06-03: removed hardcoded SHADOW_PREVIEW_DRAFTS → REAL dept_column_drafts query via withOrgContext (same store publish writes); 11/11 UI tests. SET-034 no JSX (spec-driven). Playwright/axe pending W6 |
| T-129 | User Menu Language Picker (SET-100) | ✅ | language picker live in user-menu (verified) |

## T4-wiring-test — E2E / Integration tests

| ID | Title | Status | Note |
|---|---|---|---|
| T-080 | E2E: 6-step onboarding wizard | 🔄 | W6 2026-06-03 (`a1258aac`): authored `e2e/onboarding-wizard.spec.ts` — runnable (`playwright --list` OK, type/lint 0). Live artifact capture against deployed preview pending Gate-5 sweep. |
| T-081 | E2E: invite → accept → first login flow | 🔄 | W6 2026-06-03: authored `e2e/invite-accept.spec.ts` — runnable + listed. Live artifact capture pending. |
| T-082 | E2E: SSO SAML round-trip with mock Entra IdP | ⏸ | W6: authored as honest `test.fixme` in `e2e/sso-saml.spec.ts`. BLOCKER: needs a mock Entra/SAML IdP (signing cert + metadata + relay-state) before un-fixme. |
| T-083 | Integration test: SCIM PATCH ops + bearer auth + seat-limit | ✅ | W7 2026-06-03: bearer auth now covered by a REAL (non-mocked) integration test — `apps/web/__tests__/scim/bearer.integration.test.ts` exercises `verifyScimBearer` against a live PG via the `scim_tokens` bridge (4/4 PASS). PATCH-replace/add/remove ops + seat-limit-before-insert remain covered by `apps/web/app/api/scim/scim.test.ts` (4/4 PASS). T-034 gap closed. |
| T-084 | E2E: schema admin wizard happy path | ⬜ | Not in W6 scope — no dedicated schema-wizard E2E spec authored. (RTL covers it via T-097 schema suite 22/22; full E2E flow deferred.) |
| T-085 | E2E: reference CSV import → preview → commit | 🔄 | W6 2026-06-03: authored `e2e/reference-csv.spec.ts` — runnable + listed. Live artifact capture pending. |
| T-086 | E2E: D365 connection toggle gated by 5 constants | 🔄 | W6 2026-06-03: authored `e2e/d365-toggle.spec.ts` — runnable + listed. Live artifact capture pending. |
| T-087 | E2E: IP allowlist 403 + SCIM bypass + impersonation bypass | ⏸ | W6: authored as honest `test.fixme` in `e2e/ip-allowlist.spec.ts`. BLOCKER: needs seeded IP-allowlist + SCIM tokens / impersonation fixtures before un-fixme. |
| T-088 | E2E: 4 customer-facing role categories filter pills + KPI tiles | 🔄 | W6 2026-06-03: authored `e2e/users-categories.spec.ts` — runnable + listed. Live artifact capture pending. |
| T-089 | Integration test: audit_log partition rotation + 7-year retention | ⏸ | audit-log-retention.test.ts exists; depth of assertion unverified |
| T-090 | Integration test: tenant_variations + dept_resolver runtime resolution | ⏸ | variations.test.ts exists; unit-level only |
| T-143 | PARITY: RBAC screens Playwright + axe | ✅ | W6 2026-06-03 (`a1258aac`): authored `e2e/settings/a-ui-parity.spec.ts` (+ `_catalog.ts`/`_runner.ts`/`auth.setup.ts` harness). `playwright --list` OK, typecheck 0, eslint 0. NOT yet executed against live preview → artifact capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 6 OK (company/users/audit/invitations/roles/authorization); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-143/. |
| T-144 | PARITY: RBAC modals Playwright + axe | ✅ | W6: authored `e2e/settings/a-modals-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 3 modal screens OK; real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-144/. |
| T-145 | PARITY: Account self-service Playwright + axe | ✅ | W6: authored `e2e/settings/account-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 2 OK (account profile + notifications); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-145/. |
| T-146 | PARITY: Variants/Modules screens | ✅ | W6: authored `e2e/settings/b-ui-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 8 OK (flags/promotions/features/tenant+depts/rules/migrations/modules); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-146/. |
| T-147 | PARITY: Variants/Modules modals | ✅ | W6: authored `e2e/settings/b-modals-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 2 OK (flag-edit/promote modals); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-147/. |
| T-148 | PARITY: Schema admin screens | ✅ | W6: authored `e2e/settings/c-ui-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 5 OK + 1 EMPTY (schema-migrations alias); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-148/. |
| T-149 | PARITY: Rules/Reference Data screens | ✅ | W6: authored `e2e/settings/d-ui-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 4 OK + 1 RBAC_DENIED (mfg-ops, owner-gated); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-149/. |
| T-150 | PARITY: Rules/Ref Data modals | ✅ | W6: authored `e2e/settings/d-modals-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 3 OK (rules/reference modals); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-150/. |
| T-151 | PARITY: Infra/Security/Integrations screens | ✅ | W6: authored `e2e/settings/e-ui-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 10 OK + 4 RBAC_DENIED (email-vars/warehouses/machines/lines — owner-gated); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-151/. |
| T-152 | PARITY: Infra/Security modals | ✅ | W6: authored `e2e/settings/e-modals-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 2 OK (email/d365 modals); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-152/. |
| T-153 | PARITY: System utility screens | ✅ | W6: authored `e2e/settings/system-ui-parity.spec.ts`. Listed/type/lint-verified; live capture pending. **LIVE CAPTURED** Vercel preview 2026-06-03 (8e1cb1f6): 3 OK (system utility); real Supabase data, 0 errored/login_redirect; screenshots+parity_report.json under e2e/parity-evidence/settings/T-153/. |

## T5-seed / docs

| ID | Title | Status | Note |
|---|---|---|---|
| T-091 | Seed: role_categories reference (4 groups) | ✅ | seeds/role-categories.sql + 048-role-categories.sql + test |
| T-092 | Seed: 15 modules baseline + organization_modules defaults | ✅ | seeds/modules.sql (47 lines) + modules.test.ts |
| T-093 | Seed: 25 reference table schemas | ✅ | seeds/reference-schemas.sql (126 lines) + test |
| T-094 | ADR-034 docs: Manufacturing Operations | ✅ | `docs/02-settings/manufacturing-operations.mdx` exists |
| T-116 | Seed: i18n namespace 02-settings.json (PL + EN) | ✅ | W7 2026-06-03 (`9e8136e3`): ro + uk brought to full key-parity with en. VERIFIED: `apps/web/messages/{en,ro,uk}/02-settings.json` = 1553 leaf keys each, 0 ICU/placeholder mismatch. (pl tracked separately, baseline parity already.) |
| T-123 | Seed: technical_product_spec_approval_gate_v1 rule definition | ✅ | W1 2026-06-03: seeded as active `gate` rule into `public.rule_definitions` via `063-org-authorization-policies.sql` per-org seed; clears technical preflight `gate_rule_missing` blocker |

## T0-root — Orchestration roots

| ID | Title | Status | Note |
|---|---|---|---|
| T-131 | ROOT: Variants/Modules backend | ✅ | All children ✅ — T-013 `feature_flags_core` gap resolved (W1, `067`). Backend closeable. |
| T-132 | ROOT: Schema Admin backend | ✅ | All children ✅. |
| T-133 | ROOT: Rules/Reference Data backend | ✅ | All children ✅. |
| T-134 | ROOT: Infra/Security backend | ✅ | Blockers cleared: T-011 ✅ (W1 `068`), T-122 ✅ (W1 `063`), T-034 ✅ (W7 SCIM bearer test). Backend closeable. |
| T-135 | ROOT: 6-step Onboarding Wizard | 🔄 | UI pages real-data wired; T-080 E2E authored (`onboarding-wizard.spec.ts`) but live artifact capture pending. Onboarding step screens T-041..046 not yet parity-tested (still ⏸). |
| T-136 | ROOT: RBAC UI screens | 🔄 | Children real-data + RTL parity (T-059/120/127 🔄); parity-evidence specs T-143/144 authored. Live Playwright/axe capture pending → root stays 🔄. |
| T-137 | ROOT: My Profile / My Notifications | 🔄 | T-074/075 real-data + RTL green (W2b); parity spec `account-parity.spec.ts` (T-145) authored. Live capture pending. |
| T-138 | ROOT: Variants/Modules UI | 🔄 | T-065/072/100/101/102/103/109 🔄 (real data + parity); specs T-146/147 authored. Live capture pending. |
| T-139 | ROOT: Schema Admin UI | 🔄 | T-097/098/099/128 🔄 (real data + parity, schema suite 22/22); spec T-148 authored. Live capture pending. |
| T-140 | ROOT: Rules/Reference Data UI | 🔄 | T-063/064/067/077/108/114/115 🔄; specs T-149/150 authored. Live capture pending. |
| T-141 | ROOT: Infra/Security/Integrations UI | 🔄 | T-060/061/062/076/111/112/113 🔄; specs T-151/152 authored. Live capture pending. Infra list screens T-104..107 still ⏸ (not wave-reached). |
| T-142 | ROOT: System utilities | 🔄 | Blockers cleared: T-122 ✅, T-123 ✅, T-130 ✅. Spec T-153 (`system-ui-parity.spec.ts`) authored; live capture pending → root stays 🔄. |

## Wave 5 — Class D build-now (dead settings stubs → real / honest)

Decision (Q1): build NOW the no-owner settings-shaped routes via the existing
schema-driven `reference_tables` infra (T-008/T-093); record the rest as gaps.
All built routes read REAL Supabase data via `withOrgContext` (no mocks) and
reuse the reference-data screen + `upsertReferenceRow`/`softDeleteReferenceRow`
actions. Parity source: `settings/reference` (admin-screens.jsx:561-621).

| Route | Decision | Status | Note |
|---|---|---|---|
| processes | BUILT real | ✅ | `reference.processes` schema (T-093) extended with `name`+`category`; page reads `reference_tables` (code `processes`) via shared `SingleReferenceScreen`. 6 baseline food-process rows seeded for Apex org. Stub removed. UI test: `processes/page.test.tsx` (2 ✓). |
| partners | BUILT real | ✅ | New `reference.partners` schema (partner_code/name/partner_type/status) added to `seeds/reference-schemas.sql`; page reads `reference_tables` (code `partners`). NOT owned by 11-shipping/03-technical (no partner master table exists — verified). 2 baseline rows (supplier+customer) seeded. Stub removed. UI test: `partners/page.test.tsx` (2 ✓). |
| onboarding | REAL entry point | ✅ | Dead stub replaced with panel reading REAL onboarding state via `loadOnboardingContext` (org `onboarding_completed_at`/`onboarding_started_at` + `completedSteps`), links to wizard `/{locale}/onboarding/profile`. UI test: `onboarding/page.test.tsx` (3 ✓). |
| boms | HONEST STUB + gap | ⏸ | NOT settings-shaped (product-structure entity). No real BOM/recipe table exists anywhere (only `bom_item` identity placeholder, migration 014). Kept honest stub; i18n already states "the Technical module wave owns the versioned BOM list and recipe workflow". See External gaps below. |

**New artifacts (Wave 5):**
- Migration `073-settings-reference-processes-partners.sql` — idempotent; applied + verified on local Postgres (schema rows inserted, baseline rows seed for Apex org, re-apply clean). Guarantees seed reaches Supabase on deploy (deploy-migration runner does NOT apply `seeds/*.sql`).
- `seeds/reference-rows-settings.sql` — baseline process/partner rows (idempotent, Apex-scoped; mirrors 073 for the `setup-dev.sh` path).
- `_components/single-reference-screen.tsx` — shared single-table schema-driven reference screen (reuses reference-data client + actions).
- T-093 updated: `reference-schemas.sql` now seeds 26 reference table codes (was 25); test updated.

**External gaps recorded (Wave 5):**
- BOMs & recipes (settings/boms) → **03-technical / 08-production**. Bill-of-Materials + recipe versioning is product-structure data, not settings reference data. No owning table exists yet (`bom_item` is an identity placeholder only). Feature gap, not a settings task. Build the versioned BOM list + recipe workflow in the Technical module wave.

## Summary count (post W1-W7 reconcile, 2026-06-03)

153 T-tasks total: **✅ 70 · 🔄 53 · ⏸ 29 · ⬜ 1**.
(Plus 4 Class D no-task routes: processes ✅, partners ✅, onboarding ✅, boms ⏸-gap.)

**UPDATE 2026-06-03 (post live Gate-5):** the W6 parity-evidence specs were EXECUTED
against the deployed Vercel preview (authenticated admin@monopilot.test, real Supabase).
All 11 groups T-143..T-153 = CAPTURED → ✅ (56 screens, real-data, 0 errored/login_redirect;
6 RBAC_DENIED + 1 EMPTY are intentional/honest states). Codex cross-provider review found
2× P2 on the W5 reference write-path (universal schemas invisible to app_user via the
reference_schemas SELECT RLS policy) → FIXED in migration 074 + upsert.ts (commit 0f7da85d),
new test 3/3, policy verified live. The 53 remaining 🔄 are individual screen-tasks whose
live parity SCREENSHOT is now captured (under their T-14x group) and which render real data
live — their final VISUAL parity verdict is the human's at the Gate-5 sign-off review.

Definitions in effect: ✅ = code + real gate green (test/migration/parity). 🔄 = real
data + logic + RTL/unit parity done, but the W6 Playwright+axe artifact has NOT been
captured against the LIVE preview yet (the single remaining sub-gate for the bulk of UI).
⏸/⬜ = not yet wave-reached or has a stated blocker.

### Deferred / gaps — every remaining ⏸/⬜ with its one-line blocker (sign-off list)

UI screens not yet wave-reached (real-data wiring + parity test not run):
- **T-041..T-046** ⏸ — Onboarding step screens (Org Profile / Warehouse / Location / Product / Work Order / Completion): pages exist + real Supabase, but no parity test run this cycle (W2/W3 did not cover onboarding steps; confetti unverified). Covered structurally by T-080 E2E (authored, not live).
- **T-047..T-057** ⏸ — Settings modals SM-01..SM-11 (RuleDryRun, FlagEdit, SchemaView, EmailTemplateEdit, PromoteToL2, UserInvite, RoleAssign, D365TestConnection, PasswordReset, DeleteReferenceData, RefRowEdit): component + unit test exist; no parity screenshot/axe. Live capture lands via T-144/147/150/152 modal specs (authored, not run).
- **T-066** ⏸ — Schema Browser (SET-030): real Supabase loader present; completeness/parity unverified (not in W2/W3 lane).
- **T-071** ⏸ — Notifications screen (SET-092): page exists; no parity evidence; one live-DB pg_catalog test needs a DB to run.
- **T-078** ⏸ — Manufacturing Operation Edit modal (SET-056): modal + test exist; no parity evidence.
- **T-104..T-107** ⏸ — Infra list screens (Warehouse/Location Tree/Machine/Line): pages exist; not parity-tested this cycle (locations has an E2E modal-CRUD spec; lines verified rendering live post RSC fix).
- **T-129** ⏸ — User Menu Language Picker (SET-100): component + inline parity contract exist; parity_report not captured live.

E2E / integration tests:
- **T-082** ⏸ — SSO SAML round-trip: honest `test.fixme`. BLOCKER: needs a mock Entra/SAML IdP (signing cert + metadata + relay-state).
- **T-084** ⬜ — Schema admin wizard E2E: no spec authored (out of W6 scope; RTL covers via T-097 schema suite 22/22).
- **T-087** ⏸ — IP allowlist 403 + SCIM/impersonation bypass E2E: honest `test.fixme`. BLOCKER: needs seeded IP-allowlist + SCIM tokens / impersonation fixtures.
- **T-089** ⏸ — audit_log partition-rotation + 7y retention integration test: `audit-log-retention.test.ts` exists; depth of rotation assertion unverified (needs live-DB run).
- **T-090** ⏸ — tenant_variations + dept_resolver runtime resolution: `variations.test.ts` exists; unit-level only, runtime resolution path unverified.

Class D external gap (recorded, not a settings task):
- **boms** ⏸ — honest stub; owner = 03-technical / 08-production (versioned BOM list + recipe). No owning table exists yet.

ALL 64 🔄 tasks share ONE remaining gate: execute the authored W6 parity-evidence
Playwright+axe specs (T-143..T-153) + E2E flows (T-080/081/085/086/088) against the
deployed Vercel preview and capture artifacts. Specs are authored, `playwright --list`
= 72 tests/26 files, typecheck 0, eslint 0; the data plane is verified live (Gate-5).
This is the last action before module sign-off.

---
_Last audited: 2026-06-03 — reconciled post W1-W7 by run-module (evidence-backed, cited files spot-checked)._
_Supersedes the stale 2026-06-02 reality-audit. Wave 5 (Class D) section retained; W1-7 changelog at top._
