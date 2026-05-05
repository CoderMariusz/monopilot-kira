# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Baseline DB schema migration** (`packages/db/migrations/001-baseline.sql`, `packages/db/schema/baseline.ts`): Establishes the three-table control-plane/business-scope foundation. `tenants` is the control-plane root (id UUID PK, name, region_cluster CHECK `eu|us`, data_plane_url, created_at). `organizations` is the canonical business scope root (id UUID PK used as `org_id` everywhere, tenant_id nullable FK to tenants, name, industry_code CHECK `bakery|pharma|fmcg|generic`, external_id, plus full R13 identity columns: created_at, created_by_user, created_by_device, app_version, model_prediction_id, epcis_event_id, schema_version). `users` is org-scoped (id UUID PK, org_id UUID NOT NULL FK to organizations, email CITEXT unique per org, display_name, external_id, full R13 columns). Business-facing indexes use `org_id`; `tenant_id` is not propagated to `users`. No RLS policies (owned by T-007). Integration tests verify R13 column presence and DB-level industry_code rejection via information_schema (T-006 / TASK-000210).
- **RBAC permission enum** (`packages/rbac/src/permissions.enum.ts`): Source-of-truth lock for org-scoped permission strings. Exports `Permission` const-object with canonical values (`org.access.admin`, `org.schema.admin`, `org.scim.write`, `fg.create`, `fg.edit`, `brief.convert_to_npd_project`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.org`), `LegacyPermissionAlias` map for backward-compat aliases (`fa.create → fg.create`, `fa.edit → fg.edit`, `brief.convert_to_fa → brief.convert_to_npd_project`), `ALL_PERMISSIONS` (canonical values only, no duplicates), `SOD_EXCLUSIVE_PAIRS` locking the Org Admin / Schema Admin separation-of-duties constraint, and `normalizePermission()` helper that resolves legacy aliases and throws on unknown strings.
- **RBAC permission tests** (`packages/rbac/src/__tests__/permissions.test.ts`): 14 passing tests covering format validation, SoD pair integrity, fg.* canonical contract, legacy alias normalization, and CODEOWNERS lock.
- **CODEOWNERS entry**: `permissions.enum.ts` gated behind `@monopilot/architect` review to prevent accidental drift (T-004 / TASK-000208).
