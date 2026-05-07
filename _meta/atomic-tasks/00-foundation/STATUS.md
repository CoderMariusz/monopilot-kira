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
| T-011 | Supabase Auth wiring | ⬜ PENDING | |
| T-012 | SAML 2.0 SP | ⬜ PENDING | |
| T-013 | SCIM 2.0 endpoints | ⬜ PENDING | |
| T-014 | RBAC enforcement library | ⬜ PENDING | |
| T-015 | TOTP MFA enrolment | ⬜ PENDING | |
| T-016 | Verify-PIN step-up | ⬜ PENDING | |
| T-017 | Reference.DeptColumns + json-schema-to-zod | ✅ DONE | GREEN+REVIEW PASS; 009-schema-driven.sql R13+RLS+8 seeds; compile.ts LRU cache; 1 pass + 4 skip |
| T-018 | Reference.Rules + DSL executor stub | ✅ DONE | RED+GREEN+REVIEW pipeline complete; 14/14 tests pass; 010-rules.sql with R13+RLS |
| T-019 | Department taxonomy seed | ✅ DONE | T5-seed (RED skipped); GREEN+REVIEW PASS; 7 Apex depts + dept_overrides JSONB |
| T-020 | ManufacturingOperations + seeds | ⬜ PENDING | |
| T-021 | Cascading rule (mfg_op → intermediate code) | ⬜ PENDING | |
| T-022 | i18n scaffold (next-intl) | ✅ DONE | RED+GREEN+REVIEW PASS; 32/32 tests; 4 locales (pl/en/uk/ro) with CLDR plural rules; middleware.ts + routing.ts deviations accepted |
| T-023 | GS1 identifier helpers | ✅ DONE | RED+GREEN+REVIEW PASS; 43/43 tests; mod-10 + 5 parsers (GTIN/SSCC/GLN/GRAI/GDTI); review spot-checked check-digit arithmetic |
| T-024 | Idempotent mutation helper | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 17/17 tests; canonicalStringify (key-order invariant, no nested-object drop); 015-idempotency.sql + GRANT to app_user |
| T-025 | packages/ui + Modal primitive | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 18/18 tests; ESLint no-restricted-imports for radix-dialog (jest-axe fallback for axe scan documented) |
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
| T-038 | tenant_migrations table | ✅ DONE | RED+GREEN+REVIEW PASS; 11/11 tests pass; 013-tenant-migrations.sql idempotent; no FK (app-layer carry-forward to T-039); dual schema dir + symlink carry-forward |
| T-039 | Canary upgrade orchestration | ⬜ PENDING | |
| T-040 | R13 columns on placeholder tables | ✅ DONE | RED+GREEN+REVIEW PASS; 33/33 tests; 014-r13-placeholder-tables.sql (renamed from 0014_ by T-054); 5 tables (lot/work_order/quality_event/shipment/bom_item) with R13 cols + org_id RLS via app.current_org_id() |
| T-041 | PWA scaffold | ✅ DONE | RED+GREEN+REVIEW PASS; 54/54 tests; manifest.ts+sw.ts+RegisterSW.tsx; withNextIntl(withSerwist()); carry-forward to T-042: navigationPreload, AC3 offline E2E, 10s vs 5s timeout |
| T-042 | PWA install + offline-shell E2E | ⬜ PENDING | |
| T-043 | IndexedDB sync queue primitive | ✅ DONE | RED+GREEN+REVIEW PASS; 19/19 tests; raw IDB (idb-keyval deleted-db fix); inline UUID v7 (jsdom/uuid esm-node crypto fix); all 4 ACs satisfied |
| T-044 | Sync queue flusher | ⬜ PENDING | |
| T-045 | Postgres app-role connection split | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 10/10 tests; 006-app-role.sql; eslint.config.mjs flat config; SELECT-0-rows RLS test; production guard |
| T-046 | ref-tables.enum.ts source-of-truth lock | ✅ DONE | Full pipeline + 1 rework cycle (ESLint drift gate added to apps/web flat-config); workspace-wide lint coverage flagged as pre-existing infra debt |
| T-047 | Wave0 PRD v4.3 domain amendment | ✅ DONE | docs (RED skipped); GREEN+REVIEW PASS; 6 surgical amendments (fg.* canonical, org_id business scope, [LEGACY-D365] qualification on fa.*); 87 unmarked headings = pre-existing debt |
| T-048 | Domain glossary lock | ⬜ PENDING | |
| T-049 | Shared BOM SSOT skeleton | ⬜ PENDING | |
| T-050 | Authorization policy foundation | ⬜ PENDING | |
| T-051 | D365 posture contract | ⬜ PENDING | |
| T-052 | Manifest/coverage readiness patch | ⬜ PENDING | |
| T-053 | packages/db layout consolidation | ✅ DONE | RED+GREEN+REVIEW PASS; 106/106 tests; src/schema/ removed, schema/ canonical with 9-table barrel; symlink relative; FK added on R13 org_id |
| T-054 | Migration runner + filename normalization | ✅ DONE | GREEN PASS; raw-SQL runner in scripts/migrate.ts; 0014_→014- rename; schema_migrations table; idempotent; --dry-run; checksum guard; 8/8 tests |
| T-055 | Workspace-wide ESLint coverage | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; tooling/eslint/base.mjs shared; 8 packages get drift rules; pg.Pool override per-test only; 7/7 fixture tests + root pnpm lint exit 0 |
| T-056 | Reference.Departments RLS hotfix follow-up | ✅ DONE | GREEN+REVIEW PASS; Option A (no 017, hot-fix in 011 sufficient); 9 dedicated RLS tests; AC4 pins SQLSTATE 42501 (non-vacuous) |
| T-057 | schema-runtime VITEST env-var elimination | ✅ DONE | RED+GREEN+REVIEW PASS; _setPool/_clearPool exported test seams; isTestMode derived from injected pool; 7/7 (3 pass + 4 skip) |
| T-058 | Migrate integration tests to getAppConnection | ✅ DONE | RED+GREEN+REVIEW PASS; 7 files migrated to getOwner/getAppConnection; lib/client.ts deleted; test-utils/test-pool.ts helper; 128/130 tests pass (2 pre-existing migrate-runner failures, out-of-scope) |
| T-059 | PRD marker discipline sweep | ✅ DONE | GREEN+REVIEW PASS; 75 heading lines marked + 10 allowlisted + leading-dash fix; exit 0 on 00-FOUNDATION-PRD.md; 55/56 web tests pass; T-047 amendments intact |
| T-060 | ALTER tenant_idp_config: 11 missing F-A2 cols | ✅ DONE | RED+GREEN PASS; 16/16 FA2 tests + 11/11 existing tests; 016 migration with 11 cols + updated_at trigger |
| T-061 | Password policy enforcement library | ✅ DONE | RED+GREEN+REVIEW+REWORK+RE-REVIEW PASS; 19/19 tests (mutation-proven non-vacuous); whitespace_only guard; 018-password-history.sql; HIBP injectable + fail-open |

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
- 018 password-history (T-061)

If your task is not in the list above and is not a migration task, do not create migration files.
