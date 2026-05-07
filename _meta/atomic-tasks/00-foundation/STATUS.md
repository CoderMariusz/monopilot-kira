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
| T-008 | outbox_events table + worker stub | ⬜ PENDING | |
| T-009 | audit_events 13-field table | ⬜ PENDING | |
| T-010 | tenant_idp_config table | ⬜ PENDING | |
| T-011 | Supabase Auth wiring | ⬜ PENDING | |
| T-012 | SAML 2.0 SP | ⬜ PENDING | |
| T-013 | SCIM 2.0 endpoints | ⬜ PENDING | |
| T-014 | RBAC enforcement library | ⬜ PENDING | |
| T-015 | TOTP MFA enrolment | ⬜ PENDING | |
| T-016 | Verify-PIN step-up | ⬜ PENDING | |
| T-017 | Reference.DeptColumns + json-schema-to-zod | ⬜ PENDING | |
| T-018 | Reference.Rules + DSL executor stub | ✅ DONE | RED+GREEN+REVIEW pipeline complete; 14/14 tests pass; 010-rules.sql with R13+RLS |
| T-019 | Department taxonomy seed | ⬜ PENDING | |
| T-020 | ManufacturingOperations + seeds | ⬜ PENDING | |
| T-021 | Cascading rule (mfg_op → intermediate code) | ⬜ PENDING | |
| T-022 | i18n scaffold (next-intl) | ⬜ PENDING | |
| T-023 | GS1 identifier helpers | ⬜ PENDING | |
| T-024 | Idempotent mutation helper | ⬜ PENDING | |
| T-025 | packages/ui + Modal primitive | ⬜ PENDING | |
| T-026 | Stepper primitive | ⬜ PENDING | |
| T-027 | Field primitive | ⬜ PENDING | |
| T-028 | ReasonInput primitive | ⬜ PENDING | |
| T-029 | Summary primitive | ⬜ PENDING | |
| T-030 | Tuning primitives | ⬜ PENDING | |
| T-031 | 10 MODAL-SCHEMA pattern templates | ⬜ PENDING | |
| T-032 | Regulatory roadmap artifact | ⬜ PENDING | |
| T-033 | PostHog feature flags | ⬜ PENDING | |
| T-034 | Schema drift detection job | ⬜ PENDING | |
| T-035 | Workflow-as-data executor | ⬜ PENDING | |
| T-036 | Schema-driven column draft/publish | ⬜ PENDING | |
| T-037 | Schema-driven column wizard UI | ⬜ PENDING | |
| T-038 | tenant_migrations table | ⬜ PENDING | |
| T-039 | Canary upgrade orchestration | ⬜ PENDING | |
| T-040 | R13 columns on placeholder tables | ⬜ PENDING | |
| T-041 | PWA scaffold | ⬜ PENDING | |
| T-042 | PWA install + offline-shell E2E | ⬜ PENDING | |
| T-043 | IndexedDB sync queue primitive | ⬜ PENDING | |
| T-044 | Sync queue flusher | ⬜ PENDING | |
| T-045 | Postgres app-role connection split | ⬜ PENDING | |
| T-046 | ref-tables.enum.ts source-of-truth lock | ⬜ PENDING | |
| T-047 | Wave0 PRD v4.3 domain amendment | ⬜ PENDING | |
| T-048 | Domain glossary lock | ⬜ PENDING | |
| T-049 | Shared BOM SSOT skeleton | ⬜ PENDING | |
| T-050 | Authorization policy foundation | ⬜ PENDING | |
| T-051 | D365 posture contract | ⬜ PENDING | |
| T-052 | Manifest/coverage readiness patch | ⬜ PENDING | |

## Migration ordering lock

**Use exactly the migration filename specified in your task JSON's `scope_files`.** Do not invent your own number. The JSON is the source of truth.

For reference, current assignments per task JSONs:
- 001 baseline (T-006) — done
- 002 rls-baseline (T-007) — done
- 003 outbox (T-008)
- 004 audit (T-009)
- 005 tenant-idp-config (T-010)
- 009 schema-driven (T-017)
- 010 rules (T-018)
- 011 departments (T-019)
- 012 manufacturing-operations (T-020)
- 013 tenant-migrations (T-038)
- 014 r13-placeholder-tables (T-040)

If your task is not in the list above and is not a migration task, do not create migration files.
