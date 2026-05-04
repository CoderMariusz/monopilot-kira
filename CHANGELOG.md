# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **RBAC permission enum** (`packages/rbac/src/permissions.enum.ts`): Source-of-truth lock for org-scoped permission strings. Exports `Permission` const-object with canonical values (`org.access.admin`, `org.schema.admin`, `org.scim.write`, `fg.create`, `fg.edit`, `brief.convert_to_npd_project`, `ref.edit`, `audit.read`, `outbox.admin`, `impersonate.org`), `LegacyPermissionAlias` map for backward-compat aliases (`fa.create → fg.create`, `fa.edit → fg.edit`, `brief.convert_to_fa → brief.convert_to_npd_project`), `ALL_PERMISSIONS` (canonical values only, no duplicates), `SOD_EXCLUSIVE_PAIRS` locking the Org Admin / Schema Admin separation-of-duties constraint, and `normalizePermission()` helper that resolves legacy aliases and throws on unknown strings.
- **RBAC permission tests** (`packages/rbac/src/__tests__/permissions.test.ts`): 14 passing tests covering format validation, SoD pair integrity, fg.* canonical contract, legacy alias normalization, and CODEOWNERS lock.
- **CODEOWNERS entry**: `permissions.enum.ts` gated behind `@monopilot/architect` review to prevent accidental drift (T-004 / TASK-000208).
