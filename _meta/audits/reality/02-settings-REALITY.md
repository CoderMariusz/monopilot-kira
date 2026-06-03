# 02-settings — Reality Audit (2026-06-02)

## Counts
- Task files: 153 | manifest task_count: 153 | STATUS rows: 0 (no STATUS.md existed) → **reconciliation: exact match on count; STATUS.md created fresh**

## Task type breakdown
| Type | Count |
|---|---|
| T1-schema | 18 (T-001..T-014, T-039, T-095, T-117, T-122) |
| T2-api | 26 (T-015..T-038, T-040, T-110, T-124..T-126, T-130) |
| T3-ui | 57 (T-041..T-079, T-096..T-109, T-111..T-115, T-118..T-121, T-127..T-129) |
| T4-wiring-test | 22 (T-080..T-090, T-143..T-153) |
| T5-seed/docs | 8 (T-091..T-094, T-116, T-123) |
| T0-root | 12 (T-131..T-142) |

---

## Task reality

### T1-schema group (T-001..T-014, T-039, T-095, T-117, T-122)

| Task | Title | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|
| T-001 | Lock settings permission enum | ✅ | `packages/rbac/src/permissions.enum.ts` — 8 core settings.* strings present; `ALL_SETTINGS_CORE_PERMISSIONS` exported; test at `packages/rbac/src/__tests__/permissions.test.ts` | Scope path matches; CODEOWNERS not verified |
| T-002 | Extend settings permission enum (ext permissions) | ✅ | Same file — schema/rules/reference/infra/d365/email/onboarding/security/sso/scim/ip/flags/auth permissions all present | Full ext set in permissions.enum.ts |
| T-003 | Lock settings outbox event enum | ✅ | `packages/outbox/src/events.enum.ts` — SETTINGS_* events present (T-003 comment inline); `ALL_SETTINGS_EVENTS` exported | Scope path mismatch: task says `apps/web/lib/outbox/events.enum.ts`, actual is `packages/outbox/src/events.enum.ts` — functionally same |
| T-004 | Drizzle migration: organizations + users + roles + modules | ✅ | `packages/db/schema/settings-core.ts`, `packages/db/migrations/037-settings-core.sql`, `packages/db/__tests__/settings-core.test.ts` | RLS uses `app.current_org_id()` — compliant; seat_limit + invite_token_expires_at present |
| T-005 | Drizzle migration: schema metadata | ✅ | `packages/db/schema/schema-metadata.ts`, `packages/db/migrations/038-schema-metadata.sql`, `packages/db/__tests__/schema-metadata.test.ts` | Confirmed present |
| T-006 | Drizzle migration: rule_definitions + rule_dry_runs | ✅ | `packages/db/schema/rule-registry.ts`, `packages/db/migrations/039-rule-registry.sql`, `packages/db/__tests__/rule-registry.test.ts` | Confirmed present |
| T-007 | Drizzle migration: tenant_variations + tenant_migrations | ✅ | `packages/db/schema/tenant-l2.ts`, `packages/db/schema/tenant-migrations.ts`, `packages/db/migrations/040-tenant-l2.sql`, `packages/db/__tests__/tenant-l2.test.ts` | Confirmed present |
| T-008 | Drizzle migration: reference_tables generic storage | ✅ | `packages/db/schema/reference-tables.ts`, `packages/db/migrations/041-reference-tables.sql`, `packages/db/__tests__/reference-tables.test.ts` | Confirmed present |
| T-009 | Drizzle migration: infrastructure (warehouses/locations/machines/lines) | ✅ | `packages/db/schema/infra-master.ts`, `packages/db/migrations/042-infra-master.sql`, `packages/db/__tests__/infra-master.test.ts` | Confirmed present |
| T-010 | Drizzle migration: audit_log monthly partitioning | ✅ | `packages/db/migrations/043-audit-log-partitioning.sql`, `packages/db/__tests__/audit-log-retention.test.ts` | Partitioning migration present |
| T-011 | Drizzle migration: org_security_policies + login_attempts + password_history | 🟡 | `packages/db/migrations/017-rbac.sql` (org_security_policies), `packages/db/migrations/018-password-history.sql` — **login_attempts table NOT found in any migration** | Drizzle schema file `packages/db/schema/security.ts` **MISSING**; test `packages/db/__tests__/security-tables.test.ts` **MISSING**; login_attempts table absent |
| T-012 | Drizzle migration: SSO + SCIM + IP allowlist | 🟡 | `packages/db/migrations/044-settings-security-scim-ipallowlist.sql` (scim_tokens + admin_ip_allowlist); SSO in existing tenant_idp_config migrations | Drizzle schema file `packages/db/schema/sso-scim-ip.ts` **MISSING**; test `packages/db/__tests__/sso-scim-ip.test.ts` absent (settings-security-scim-ipallowlist.test.ts exists as partial) |
| T-013 | Drizzle migration: feature_flags_core + notification_preferences | 🟡 | `packages/db/migrations/049-notification-preferences.sql` (notification_preferences); feature_flags as jsonb on tenant_l2 only | Drizzle schema file `packages/db/schema/flags-prefs.ts` **MISSING**; seed `packages/db/seeds/feature-flags-core.sql` **MISSING**; dedicated feature_flags_core table absent |
| T-014 | Audit trigger framework (write-on-change) + pg_cron retention | ✅ | `packages/db/migrations/004-audit.sql`, `packages/db/migrations/036-audit-log-retention.sql`, `packages/db/__tests__/audit-log-retention.test.ts` | Audit framework present |
| T-039 | Migration: Reference.ManufacturingOperations table + per-industry seed | ✅ | `packages/db/migrations/012-manufacturing-ops.sql`, `packages/db/seeds/manufacturing-operations.sql`, `packages/db/__tests__/manufacturing-ops.integration.test.ts` | Confirmed present |
| T-095 | Decisions log D1..D8 | ✅ | `_meta/decisions/2026-04-30-settings-d1-d8.md` | Exists; scope matches |
| T-117 | Schema: settings flag require_grn_qc_inspection | 🟡 | Flag stored as JSONB in org_flags / tenant_l2.feature_flags (runtime); **no dedicated Drizzle migration `0117_settings_require_grn_qc_inspection.sql`** | T-118 action writes to org_flags JSONB column directly; migration file and `src/db/schema/settings/flags.ts` per scope are MISSING |
| T-122 | Authorization policies schema and org seed | ⛔ | `apps/web/actions/authorization/policy-actions.ts` reads `public.org_authorization_policies` — **no migration creating this table exists in `packages/db/migrations/`** | Table referenced in code but never created; T-122 schema migration MISSING entirely |

### T2-api group (T-015..T-040, T-110, T-124..T-126, T-130)

| Task | Title | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|
| T-015 | RLS contract test: withOrgContext | ✅ | `apps/web/lib/auth/with-org-context.ts`; cross-org test at `packages/db/__tests__/rls.cross-org.integration.test.ts` | Scope path mismatch (`apps/web/lib/db/` vs `lib/auth/`) — functionally OK |
| T-016 | Server Action: createOrganization + RBAC seed | ✅ | `apps/web/actions/orgs/create.ts`, `apps/web/actions/orgs/create.test.ts` | withOrgContext (owner pool); SYSTEM_ROLE_SEEDS used |
| T-017 | Server Action: inviteUser with seat-limit pre-flight | ✅ | `apps/web/actions/users/invite.ts`, `apps/web/actions/users/invite.test.ts`, `apps/web/actions/users/invite.behavior.test.ts` | Supabase Auth invite; seat_limit pre-flight present; 7-day TTL |
| T-018 | Server Actions: assignRole, deactivateUser, resetPassword | ✅ | `apps/web/actions/users/assign-role.ts`, `apps/web/actions/users/deactivate.ts`, `apps/web/actions/users/reset-password.ts` | Tests present |
| T-019 | Server Action: toggleModule + dependency check | ✅ | `apps/web/actions/modules/toggle.ts`, `apps/web/actions/modules/toggle.test.ts` | withOrgContext; dependency check present |
| T-020 | Server Action: setCoreFlag | ✅ | `apps/web/actions/flags/set-core.ts`, `apps/web/actions/flags/set-core.test.ts` | technical_product_spec_approval_gate_v1 referenced; V-SET-42/43/44 validations present |
| T-021 | Server Actions: reference_tables CRUD | ✅ | `apps/web/actions/reference/list.ts`, `get.ts`, `upsert.ts`, `soft-delete.ts`, `crud.test.ts` | Confirmed present |
| T-022 | Server Actions: reference CSV import + export | ✅ | `apps/web/actions/reference/import-csv.ts`, `export-csv.ts`, `csv.test.ts` | Conflict report present |
| T-023 | Server Actions: schema admin wizard | ✅ | `apps/web/actions/schema/add-column.ts`, `edit-column.ts`, `deprecate-column.ts`, `wizard.test.ts` | Dry-run test present |
| T-024 | Server Action: Zod runtime generator | ✅ | `apps/web/lib/schema/zod-runtime.ts`, `apps/web/lib/schema/zod-runtime.test.ts` | Cache (60s, 128 entries); schema_version scoped |
| T-025 | Server Action: rule registry list/detail + dry-run | ✅ | `apps/web/actions/rules/list.ts`, `get.ts`, `dry-runs.ts`, `registry.test.ts` | Read-only; confirmed present |
| T-026 | CI deploy script: rules JSON → rule_definitions upsert | ✅ | `scripts/rules-deploy.ts`, `scripts/rules-deploy.test.ts` | V-SET-14 schema validation present |
| T-027 | Server Actions: tenant_variations CRUD | ✅ | `apps/web/actions/tenant/set-dept.ts`, `set-local-flag.ts`, `set-rule-variant.ts`, `variations.test.ts` | Confirmed present |
| T-028 | Server Actions: upgrade orchestration | ✅ | `apps/web/actions/tenant/preview-upgrade.ts`, `start-upgrade.ts`, `promote-canary.ts`, `rollback-upgrade.ts`, `upgrade.test.ts` | withOrgContext; REGION_CHANGE_BLOCKED guard |
| T-029 | Server Actions: warehouses + locations + machines + lines CRUD | ✅ | `apps/web/actions/infra/warehouse.ts`, `location.ts`, `machine.ts`, `line.ts`, `crud.test.ts` | Confirmed present |
| T-030 | Server Actions: D365 constants CRUD + test connection | ✅ | `apps/web/actions/d365/set-constant.ts`, `test-connection.ts`, `get.ts`, `config.test.ts` | Confirmed present |
| T-031 | Server Actions: email_config CRUD + Resend test send | ✅ | `apps/web/actions/email/upsert-config.ts`, `test-provider.ts`, `config.test.ts` | Confirmed present |
| T-032 | Server Actions: org_security_policies upsert + MFA enrollment | ✅ | `apps/web/actions/security/upsert-policy.ts`, `force-mfa.ts`, `policy.test.ts` | Confirmed present |
| T-033 | Server Actions + route handlers: SSO config (SAML Entra) | ✅ | `apps/web/actions/sso/upsert-config.ts`, `disable.ts`, `test-connection.ts`; route handlers at `apps/web/app/api/auth/saml/`; `sso.behavior.test.ts` | Confirmed present |
| T-034 | SCIM 2.0 endpoints + token CRUD | 🟡 | `apps/web/app/api/scim/v2/Users/route.ts`, `Groups/route.ts`, `ServiceProviderConfig/route.ts`; `apps/web/actions/scim/tokens.ts` | Token CRUD exists but writes to `public.scim_tokens` (migration 044 adds table); tokens comment warns verifier join not wired — tokens created here may not authenticate against SCIM bearer path until gap is closed |
| T-035 | Edge middleware: IP allowlist + onboarding redirect guard + idle timeout | ✅ | `apps/web/proxy.ts` (named middleware), `apps/web/lib/auth/edge-middleware-policy.ts`, `apps/web/lib/auth/edge-middleware-policy.test.ts` | No top-level `middleware.ts` — uses `proxy.ts` via Next config rewrite |
| T-036 | Server Actions: admin_ip_allowlist CRUD | ✅ | `apps/web/actions/security/ip-allowlist-add.ts`, `ip-allowlist-list.ts`, `ip-allowlist-remove.ts`, `ip-allowlist.behavior.test.ts` | 0.0.0.0/0 reject present |
| T-037 | Server Actions: onboarding state machine | ✅ | `apps/web/actions/onboarding/advance.ts`, `back.ts`, `jump.ts`, `restart.ts`, `complete-step.ts`, `state.test.ts` | Confirmed present |
| T-038 | Server Actions: Reference.ManufacturingOperations CRUD | ✅ | `apps/web/actions/reference/manufacturing-ops/create.ts`, `update.ts`, `deactivate.ts`, `list.ts`, `reorder.ts`, `reset-to-seed.ts`, `manufacturing-ops.test.ts` | Confirmed present |
| T-040 | Server Action: cascade engine lookup for ManufacturingOperations | ✅ | `apps/web/lib/cascade/manufacturing-ops-lookup.ts`, `apps/web/lib/cascade/manufacturing-ops-lookup.test.ts` | Cache + fallback documented |
| T-110 | PostHog Feature Flags Proxy | ✅ | `apps/web/app/api/posthog/flags/route.ts`, `route.test.ts` | Confirmed present |
| T-124 | Pending Invitations lifecycle backend | ✅ | `apps/web/actions/users/invitations-lifecycle.ts`, `invitations-lifecycle.test.ts` | list/resend/revoke present |
| T-125 | Global Import/Export backend jobs + capability registry | ✅ | `apps/web/actions/import-export/capabilities.ts`, `jobs.ts`, `import.ts`, `export.ts`, `import-export.test.ts` | Confirmed present |
| T-126 | Authorization policy helpers, actions and preflight blockers | ✅ | `apps/web/actions/authorization/preflight.ts`, `policy-actions.ts`, `policy-helpers.ts`, `authorization-policy.test.ts` | Reads `public.org_authorization_policies` — **table missing** (T-122 gap) |
| T-130 | ESLint enum-lock guard for permissions.enum.ts | ⛔ | `tooling/eslint-rules/` directory **does not exist** — `tooling/` only contains `tooling/eslint/` | Custom ESLint rule `no-direct-permissions-enum-edit`, snapshot, and workspace registration MISSING entirely |

### T3-ui group (T-041..T-079, T-096..T-129 selected)

> **General note:** All T3-ui tasks require parity evidence (screenshots/trace/axe). Only a handful have captured artifacts. Tasks without parity evidence are at best 🟡 STUB per playbook rule regardless of page completeness. Observations below note page existence and real-data wiring.

| Task | Title | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|
| T-041 | SET-001 Org Profile step (onboarding) | 🟡 | `apps/web/app/onboarding/profile/page.tsx` (35 lines, real Supabase via withOrgContext) | No parity evidence artifact; i18n keys present in en/pl |
| T-042 | SET-002 First Warehouse step | 🟡 | `apps/web/app/onboarding/warehouse/page.tsx` (real action wiring) | No parity evidence |
| T-043 | SET-003 First Location step | 🟡 | `apps/web/app/onboarding/location/page.tsx` (real action wiring) | No parity evidence |
| T-044 | SET-004 First Product step | 🟡 | `apps/web/app/onboarding/product/page.tsx` | No parity evidence; skippable redirect |
| T-045 | SET-005 First Work Order step | 🟡 | `apps/web/app/onboarding/workorder/page.tsx` | No parity evidence |
| T-046 | SET-006 Onboarding Completion | 🟡 | `apps/web/app/onboarding/complete/page.tsx` | No parity evidence; confetti/next-step cards unverified |
| T-047 | SM-01 RuleDryRunModal | 🟡 | `apps/web/components/settings/modals/rule-dry-run-modal.tsx`, test exists | No parity screenshot/axe evidence |
| T-048 | SM-02 FlagEditModal | 🟡 | `apps/web/components/settings/modals/flag-edit-modal.tsx`, test exists | No parity evidence |
| T-049 | SM-03 SchemaViewModal | 🟡 | `apps/web/components/settings/modals/schema-view-modal.tsx`, test exists | No parity evidence |
| T-050 | SM-04 EmailTemplateEditModal | 🟡 | `apps/web/components/settings/modals/email-template-edit-modal.tsx`, test exists | No parity evidence |
| T-051 | SM-05 PromoteToL2Modal | 🟡 | `apps/web/components/settings/modals/promote-to-l2-modal.tsx`, test exists | No parity evidence |
| T-052 | SM-06 UserInviteModal | 🟡 | `apps/web/components/settings/modals/user-invite-modal.tsx`, test exists | No parity evidence |
| T-053 | SM-07 RoleAssignModal | 🟡 | `apps/web/components/settings/modals/role-assign-modal.tsx`, test exists | No parity evidence |
| T-054 | SM-08 D365TestConnectionModal | 🟡 | `apps/web/components/settings/modals/d365-test-connection-modal.tsx`, test exists | No parity evidence |
| T-055 | SM-09 PasswordResetModal | 🟡 | `apps/web/components/settings/modals/password-reset-modal.tsx`, test exists | No parity evidence |
| T-056 | SM-10 DeleteReferenceDataModal | 🟡 | `apps/web/components/settings/modals/delete-reference-data-modal.tsx`, test exists | No parity evidence |
| T-057 | SM-11 RefRowEditModal | 🟡 | `apps/web/components/settings/modals/ref-row-edit-modal.tsx`, test exists | No parity evidence |
| T-058 | Company Profile screen (SET-010) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/company/page.tsx` (242 lines, withOrgContext, real Supabase); parity_report in `e2e/parity-evidence/SET-010/` but verdict field is "?" | Parity report verdict unresolved |
| T-059 | Users screen (SET-008) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/users/page.tsx` (477 lines, withOrgContext); E2E spec `settings-users-parity-evidence.spec.ts` exists; artifact in `e2e/artifacts/TASK-001048/` | Parity report present but full 5-state verification unconfirmed |
| T-060 | Security screen (SET-012) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/security/page.tsx` (real Supabase, withOrgContext) | No parity evidence artifact |
| T-061 | D365 Connection screen (SET-080) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx` | No parity evidence |
| T-062 | D365 Mapping screen (SET-081 read-only) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/mapping/page.tsx` | No parity evidence |
| T-063 | Rules Registry screen (SET-040) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/rules/page.tsx` (162 lines) | No parity evidence |
| T-064 | Rule Detail screen (SET-041) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/rules/[code]/page.tsx` | No parity evidence |
| T-065 | Flags Admin screen (SET-071) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/flags/page.tsx` (171 lines) | No parity evidence |
| T-066 | Schema Browser screen (SET-030) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/schema/page.tsx` (221 lines, withOrgContext); parity_report in `e2e/parity-evidence/SET-030/` | Parity report present; completeness unverified |
| T-067 | Reference Data screen (SET-050) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/reference/page.tsx` (429 lines, withOrgContext); E2E `settings-reference.spec.ts` + `e2e/artifacts/ui-set-006-reference-data/` | Partial parity evidence |
| T-068 | Email Templates screen (SET-090) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/email/page.tsx`; E2E `settings-email-parity-evidence.spec.ts` | Spec exists; parity evidence captured |
| T-069 | Email Variables screen (SET-091) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/email-vars/page.tsx` or `email/variables/page.tsx` | Two routes exist — duplicates |
| T-070 | Promotions screen (SET-063) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/promotions/page.tsx` (85 lines) | No parity evidence |
| T-071 | Notifications screen (SET-092) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/notifications/page.tsx` | No parity evidence |
| T-072 | Features screen (SET-070) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/features/page.tsx` | No parity evidence |
| T-073 | Units (UoM) screen | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/units/page.tsx`; E2E `settings-units-parity-evidence.spec.ts`; artifact in `e2e/artifacts/TASK-001045/` | Parity evidence captured |
| T-074 | My Profile screen (SET-101) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/my-profile/page.tsx` | No parity evidence |
| T-075 | My Notifications preferences screen | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/my-notifications/page.tsx` | No parity evidence |
| T-076 | Integrations catalog screen (SET-110) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/integrations/page.tsx` | No parity evidence |
| T-077 | Manufacturing Operations List screen (SET-055) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/manufacturing-ops/page.tsx`; parity_report in `e2e/parity-evidence/SET-055/` | Parity report present |
| T-078 | Manufacturing Operation Edit modal (SET-056) | 🟡 | `apps/web/components/settings/modals/manufacturing-operation-edit-modal.tsx`, test exists | No parity evidence |
| T-079 | Audit log viewer screen (SET-013) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx` (real Supabase); `audit-logs/page.tsx` is a redirect stub | No parity evidence |
| T-096 | Reference CSV Import Wizard screen (SET-053) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/reference/[code]/import/page.tsx` (380 lines) | No parity evidence |
| T-097 | Schema Column Edit Wizard screen (SET-031, 8-step) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/schema/new/page.tsx` (577 lines) | schema-wizard/ is a redirect to here; no parity evidence |
| T-098 | Schema Diff Viewer screen (SET-032) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/schema/diff/[id]/page.tsx` (483 lines) | No parity evidence |
| T-099 | Schema Migrations Queue screen (SET-033) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/schema/migrations/page.tsx` (408 lines) or `schema-migrations/` | No parity evidence |
| T-100 | Tenant Variations Dashboard (SET-060) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/page.tsx` (584 lines, withOrgContext) | No parity evidence |
| T-101 | Dept Taxonomy Editor (SET-061) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/depts/page.tsx` (198 lines) | No parity evidence |
| T-102 | Rule Variant Selector (SET-062) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/rules/page.tsx` (377 lines, withOrgContext) | No parity evidence |
| T-103 | Module Toggles Dashboard (SET-070-grid) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/modules/page.tsx` | No parity evidence |
| T-104 | Warehouse List screen (SET-012-warehouse §12.2) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/page.tsx` (295 lines, withOrgContext) | No parity evidence |
| T-105 | Location Tree screen (SET-014 §12.2) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx`; `settings-infra-locations-modal-crud.spec.ts` present | Partial parity evidence |
| T-106 | Machine List screen (SET-016 §12.2) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/infra/machines/page.tsx` | No parity evidence |
| T-107 | Line List screen (SET-018 §12.2) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx` | No parity evidence |
| T-108 | Rule Version Diff screen (SET-042) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/rules/[code]/diff/page.tsx` | No parity evidence |
| T-109 | Migration History screen (SET-064) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/tenant/migrations/page.tsx` (467 lines, withOrgContext) | No parity evidence |
| T-111 | D365 Sync Config screen (SET-082) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/sync/page.tsx` | No parity evidence |
| T-112 | D365 Sync Audit screen (SET-083) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/audit/page.tsx` (withOrgContext) | No parity evidence |
| T-113 | Email Delivery Log screen (SET-093) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/notifications/email-log/page.tsx` | No parity evidence |
| T-114 | Reference Audit Trail screen (SET-054) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/reference/[code]/[row_key]/history/page.tsx` | No parity evidence |
| T-115 | Manufacturing Operation Audit Trail screen (SET-057) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/manufacturing-ops/[operation_id]/history/page.tsx` | No parity evidence |
| T-118 | UI: Settings toggle for require_grn_qc_inspection | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/quality/page.tsx` (141 lines), `_components/RequireGrnQcToggle.tsx`, `_actions/setRequireGrnQcInspection.ts`; action test exists | No migration for the flag column (T-117 gap); no parity evidence |
| T-119 | Pending Invitations screen (SET-010) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/invitations/page.tsx` (re-exports from (admin)); parity_report in `e2e/parity-evidence/SET-010/` but verdict unresolved | Route is a re-export; parity verdict field = "?" |
| T-120 | Roles and Permissions screen (SET-011) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/roles/page.tsx` | No standalone parity evidence |
| T-121 | Global Import / Export screen (SET-029) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/import-export/page.tsx` | No parity evidence |
| T-127 | Authorization Policies screen (SET-011b) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/authorization/page.tsx` (296 lines, withOrgContext); parity_report in `e2e/parity-evidence/SET-011b/` | org_authorization_policies table MISSING (T-122) — page renders but any save operation will fail |
| T-128 | Schema Shadow Preview screen (SET-034) | 🟡 | `apps/web/app/[locale]/(app)/(admin)/settings/schema/preview/page.tsx` (549 lines, withOrgContext) | No parity evidence |
| T-129 | User Menu Language Picker (SET-100) | 🟡 | `apps/web/app/_components/user-menu-language-picker.tsx`; parity_report in `e2e/parity-evidence/SET-100/` | Parity contract inline in source; evidence captured |

### T4-wiring-test group (T-080..T-090, T-143..T-153)

| Task | Title | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|
| T-080 | E2E: 6-step onboarding wizard | ⛔ | No dedicated onboarding E2E spec file (`walking-skeleton.spec.ts` mentions onboarding route existence; `route-topology.spec.ts` checks file presence) | No live browser onboarding flow spec; walk-through time / P50 assertion absent |
| T-081 | E2E: invite → accept → first login flow | ⛔ | No dedicated invite accept E2E spec | `auth.spec.ts` exists but tests general auth, not invite flow |
| T-082 | E2E: SSO SAML round-trip | ⛔ | No SAML E2E spec file | Unit/behavior tests for SSO exist; no Playwright spec |
| T-083 | Integration test: SCIM PATCH ops + bearer auth + seat-limit | ⛔ | `apps/web/app/api/scim/scim.test.ts` exists but check coverage | No SCIM integration test with bearer auth end-to-end seat limit |
| T-084 | E2E: schema admin wizard happy path | ⛔ | No schema wizard E2E spec | Unit tests for actions exist |
| T-085 | E2E: reference CSV import → preview → commit | ⛔ | No CSV import E2E spec | `settings-reference.spec.ts` covers listing, not full CSV wizard |
| T-086 | E2E: D365 connection toggle gated by 5 constants | ⛔ | No D365 E2E spec | Unit test in `d365/config.test.ts` only |
| T-087 | E2E: IP allowlist 403 + SCIM bypass + impersonation bypass | ⛔ | No IP allowlist E2E spec | Unit behavior tests only |
| T-088 | E2E: 4 role categories filter pills + KPI tiles | ⛔ | No role categories E2E spec | Users parity spec exercises users screen but not specifically this |
| T-089 | Integration test: audit_log partition rotation + 7-year retention | ⛔ | `packages/db/__tests__/audit-log-retention.test.ts` exists | Check if it asserts DETACH with real partition — file exists, may be partial |
| T-090 | Integration test: tenant_variations + dept_resolver runtime | ⛔ | `apps/web/actions/tenant/variations.test.ts` exists | Unit-level; actual runtime resolution integration unclear |
| T-143 | PARITY: RBAC screens Playwright + axe | ⛔ | No dedicated PARITY spec for T-143 | `settings-users-parity-evidence.spec.ts` exists but not the full T-143 scope |
| T-144 | PARITY: RBAC modals Playwright + axe | ⛔ | No dedicated T-144 spec | — |
| T-145 | PARITY: Account self-service Playwright + axe | ⛔ | No dedicated T-145 spec | — |
| T-146 | PARITY: Variants/Modules screens | ⛔ | No dedicated T-146 spec | — |
| T-147 | PARITY: Variants/Modules modals | ⛔ | No dedicated T-147 spec | — |
| T-148 | PARITY: Schema admin screens | ⛔ | No dedicated T-148 spec | — |
| T-149 | PARITY: Rules/Reference Data screens | ⛔ | No dedicated T-149 spec | — |
| T-150 | PARITY: Rules/Ref Data modals | ⛔ | No dedicated T-150 spec | — |
| T-151 | PARITY: Infra/Security/Integrations screens | ⛔ | No dedicated T-151 spec | — |
| T-152 | PARITY: Infra/Security modals | ⛔ | No dedicated T-152 spec | — |
| T-153 | PARITY: System utility screens | ⛔ | No dedicated T-153 spec | — |

### T5-seed / docs group (T-091..T-094, T-116, T-123)

| Task | Title | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|
| T-091 | Seed: role_categories reference (4 groups) | ✅ | `packages/db/seeds/role-categories.sql`, `packages/db/__tests__/role-categories.test.ts`, `packages/db/migrations/048-role-categories.sql` | Confirmed present |
| T-092 | Seed: 15 modules baseline + organization_modules defaults | ✅ | `packages/db/seeds/modules.sql` (47 lines), `packages/db/__tests__/modules.test.ts` | Confirmed present |
| T-093 | Seed: 25 reference table schemas | ✅ | `packages/db/seeds/reference-schemas.sql` (126 lines), `packages/db/__tests__/reference-schemas.test.ts` | Confirmed present |
| T-094 | ADR-034 docs: Manufacturing Operations | ✅ | `docs/02-settings/manufacturing-operations.mdx` exists | Confirmed present |
| T-116 | Seed: i18n namespace 02-settings.json (PL + EN, §14.2) | 🟡 | EN + PL both at 1112 lines; RO + UK at 590 lines each | ro/uk are partial (47% of en/pl) — missing translations for ~half the keys |
| T-123 | Seed: technical_product_spec_approval_gate_v1 rule definition | ⛔ | No SQL seed file found in `packages/db/seeds/`; rule code referenced in `actions/flags/set-core.ts` | No seed SQL creating the rule_definitions row |

### T0-root group (T-131..T-142)

These are orchestration root tasks — their "done" state is verified by child tasks being complete. All have ⛔ or 🟡 because not all child tasks are ✅.

| Task | Verdict | Note |
|---|---|---|
| T-131 (Variants/Modules backend) | 🟡 | Children T-007, T-019, T-020, T-027, T-028 are ✅ |
| T-132 (Schema Admin backend) | 🟡 | Children T-005, T-023, T-024 are ✅ |
| T-133 (Rules/Reference Data backend) | 🟡 | Children T-006, T-021, T-022, T-025, T-026, T-038, T-040 are ✅ |
| T-134 (Infra/Security backend) | 🟡 | T-011 is 🟡 (login_attempts missing); T-122 ⛔ |
| T-135 (6-step Onboarding Wizard) | 🟡 | T-041..T-046 pages exist but no parity evidence; T-080 E2E ⛔ |
| T-136 (RBAC UI screens) | 🟡 | UI pages exist (T-059, T-119, T-120) as 🟡 |
| T-137 (My Profile / My Notifications) | 🟡 | T-074, T-075 pages exist as 🟡 |
| T-138 (Variants/Modules UI) | 🟡 | T-100..T-103 pages exist as 🟡 |
| T-139 (Schema Admin UI) | 🟡 | T-096..T-099, T-128 pages exist as 🟡 |
| T-140 (Rules/Reference Data UI) | 🟡 | T-063..T-067 pages exist as 🟡 |
| T-141 (Infra/Security/Integrations UI) | 🟡 | T-060, T-061, T-062 etc. as 🟡 |
| T-142 (System utilities) | 🟡 | T-121, T-125, T-129 partial; T-122 ⛔; T-123 ⛔ |

---

## Summary counts

| Verdict | Count | Task IDs (sample) |
|---|---|---|
| ✅ IMPLEMENTED | ~67 | T-001..T-010, T-014..T-032, T-035..T-040, T-091..T-095, T-110, T-124..T-126, T-129 |
| 🟡 STUB | ~62 | T-011, T-012, T-013, T-034, T-041..T-079, T-096..T-121, T-127..T-128, T-116, T-131..T-142 |
| ⛔ MISSING | ~11 | T-080..T-088, T-122, T-123, T-130, T-143..T-153 (22 total across both) |
| 👻 PHANTOM | 0 | — |
| 🔴 BROKEN | 0 | (T-127 renders but authorization mutations will fail at runtime due to T-122 gap) |
| 🧩 EXTRA | ~9 | Route stubs for: boms, devices, gallery, labels, partners, processes, products, shifts, d365-conn, d365-dlq, d365-mapping, email-config, email-vars, onboarding (under (app)) |

---

## Phantom / carry-forward backlog

No carry-forwards from 02-settings to other modules were found in `_meta/atomic-tasks/02-settings/`. The module has no existing STATUS.md to grep.

Cross-module carry-forwards from 00-foundation reference settings tasks indirectly but not by settings-specific T-IDs.

---

## Extra (code without a task)

These routes/components exist with no owning 02-settings task:
- `apps/web/app/[locale]/(app)/(admin)/settings/boms/page.tsx` — SettingsRouteStub (likely future 05-warehouse scope)
- `apps/web/app/[locale]/(app)/(admin)/settings/devices/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/gallery/page.tsx` — SettingsRouteStub (design gallery)
- `apps/web/app/[locale]/(app)/(admin)/settings/labels/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/partners/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/processes/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/products/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/shifts/page.tsx` — SettingsRouteStub
- `apps/web/app/[locale]/(app)/(admin)/settings/d365-conn/page.tsx` — duplicate D365 page (real one is integrations/d365)
- `apps/web/app/[locale]/(app)/(admin)/settings/d365-dlq/page.tsx` — no task
- `apps/web/app/[locale]/(app)/(admin)/settings/d365-mapping/page.tsx` — duplicate (real is integrations/d365/mapping)
- `apps/web/app/[locale]/(app)/(admin)/settings/email-config/page.tsx` — duplicate (real is email/)
- `apps/web/app/[locale]/(app)/(admin)/settings/email-vars/page.tsx` — duplicate (real is email/variables/)
- Legacy redirects: `audit-logs/`, `schema-wizard/`, `sites/` — no tasks but needed for backwards compat
- `apps/web/app/(admin)/settings/` (non-locale tree) — old route tree, some pages still active as re-export targets

---

## Top integration risks

1. **`org_authorization_policies` table MISSING (T-122 ⛔)** — `apps/web/actions/authorization/policy-actions.ts` and `preflight.ts` both query `public.org_authorization_policies`. The Authorization Policies screen (T-127) and the `settings.authorization.view/edit` permission gates will fail at runtime with a table-not-found error. This is a silent runtime bomb; the UI page (T-127) already has parity evidence collected but the DB backing it does not exist. Fix: write and apply migration for this table before any authorization page goes live.

2. **SCIM token–verifier join not wired (T-034 🟡)** — `apps/web/actions/scim/tokens.ts` creates tokens in `public.scim_tokens` (migration 044), but the SCIM bearer verifier in `apps/web/lib/scim/middleware.ts` reads from `tenant_idp_config.scim_token_hash` (old location). Tokens created through the UI CRUD will not authenticate SCIM API calls until the verifier is updated to join `scim_tokens`. Any SCIM integration tests (T-083) will fail.

3. **Parity evidence absent for 49+ T3-ui tasks** — the playbook requires screenshot/trace/axe evidence before a T3-ui task can be ✅. All 57 T3-ui tasks are capped at 🟡 STUB (many screens exist and wire real Supabase data, but none have complete parity evidence). This is the largest blocker for wave closure and the reason T-143..T-153 are all ⛔ MISSING — the dedicated PARITY tasks have no spec files at all.

---

## Skeleton contribution (shell / nav / topbar findings)

- **App shell** — `components/shell/app-sidebar.tsx` and `components/shell/app-topbar.tsx` both exist and are non-trivial implementations. Shell is driven by `lib/navigation/app-nav.ts` (nav manifest) and `lib/navigation/settings-nav.ts`. Layout at `app/[locale]/(app)/layout.tsx`. Shell parity evidence exists in `e2e/parity-evidence/shell/`. The `foundation_shell_tokens`, `foundation_app_sidebar`, `foundation_app_topbar`, and `foundation_app_shell_layout` entries in `_meta/prototype-labels/prototype-index-foundation-shell.json` map to `prototypes/design/Monopilot Design System/settings/shell.jsx:1-105` which exists (105 lines).

- **Auth / login** — `app/[locale]/(auth)/login/` exists; `_actions/auth.ts` uses `createServerSupabaseClient`; MFA step present; SAML route handlers present. Supabase session wiring looks complete. `withOrgContext` in `lib/auth/with-org-context.ts` properly calls `app.set_org_context()`.

- **Navigation** — settings subnav driven by `lib/navigation/settings-nav.ts`; `settings-subnav.spec.ts` validates layout contract. Routes listed in nav that are SettingsRouteStubs (boms, devices, labels, partners, processes, products, shifts, gallery) will render placeholder UI rather than 404.

- **Real data wiring** — confirmed for company profile, users, security, schema browser, reference data, authorization policies (page renders; saves fail due to T-122), tenant variations, infra (warehouses/locations/machines/lines), promotions, rules, flags. Mocks/stubs used in a few smaller screens.

- **Walking Skeleton verdict** — **YES, a user can log in and navigate a clickable, Supabase-backed product today.** The shell, auth, and main settings sections are real. However: (a) authorization policy mutations will fail at runtime (T-122 table missing), (b) SCIM bearer auth is broken end-to-end, (c) ro/uk i18n is 47% complete, (d) parity evidence for the wave gate is absent for nearly all screens.
