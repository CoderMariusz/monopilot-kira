# PRD Coverage — docs/prd/00-FOUNDATION-PRD.md (v4.3 Wave0 readiness)


## Wave0 v4.3 readiness patch (2026-05-03)

Readiness assessment: **96%+ ACP implementation readiness** for 00-FOUNDATION after locked user decisions and real ACP task-shape review. Remaining 4% is intentionally deferred to downstream module PRDs where business implementation belongs.

| Locked decision / readiness rule | Task file(s) | Status |
|---|---|---|
| ACP real TaskCreate shape: top-level title/prompt/labels/priority/max_attempts/pipeline_name/pipeline_inputs; root_path required; no generated ACP fields | T-052 plus all patched JSON | covered |
| Lower priority value is picked sooner | manifest + T-003/T-004/T-005/T-006/T-007/T-014/T-032/T-040/T-047..T-052 | covered |
| Dependencies are local T-XXX only; cross-module blockers live in cross_module_dependencies | all patched JSON; T-049/T-050/T-051 | covered |
| Business scope column is org_id, not tenant_id | T-006, T-007, T-014, T-040, T-048, T-050 | covered |
| Canonical finished-good/domain events use fg.*; FA/fa.* only legacy compatibility alias | T-003, T-004, T-021 follow-up by glossary, T-047, T-048 | covered |
| Shared BOM SSOT skeleton/contract in Foundation | T-049 | covered |
| factory_spec/internal_product_spec foundation terminology and Technical implementation contract boundary | T-047, T-048, T-049 | covered |
| Authorization policy foundation with SoD and Settings flag permission decision | T-004, T-014, T-050 | covered |
| D365 optional integration posture; never source of truth; export is not factory release | T-047, T-051 | covered |
| Manifest/coverage readiness patch and JSON validity | T-052 | covered |

## Coverage by PRD section

| PRD ref | Requirement | Task file(s) | Status |
|---|---|---|---|
| §1 | Six architectural principles | T-005 | covered |
| §2 | Marker discipline (4 markers) | T-005 | covered |
| §3 | Personas + Org Admin / Schema Admin SoD split (F-U4) | T-004, T-014 | covered |
| §4.1 | PRD writing phases | T-005 (registry seed) | covered |
| §4.2 | Build sequence + Phase E-0 + impl-j addendum (F-A4) | T-001, T-005, T-025 | covered |
| §4.3 | 15-module table + ADR-034 product rename | T-005, T-006 | covered |
| §5 Tech stack — Next.js + RSC + TS strict + tailwind | monorepo bootstrap | T-001 | covered |
| §5 Tech stack — Postgres 16 + JSONB hybrid + RLS | DB scaffold | T-002, T-006, T-007 | covered |
| §5 Tech stack — Outbox + Zod runtime + i18n + GS1 + idempotent | infra wiring | T-008, T-017, T-022, T-023, T-024 | covered |
| §5 Tech stack — feature flags PostHog | feature-flags wiring | T-033 | covered |
| §5 frontend — PWA Workbox (service worker + manifest) | PWA scaffold + E2E | T-041, T-042 | covered |
| §5 frontend — IndexedDB sync queue (R14 idempotent) | offline queue primitive + flusher | T-043, T-044 | covered |
| §5 RLS default — testy zawsze z app-role / §13 Tests run w app-role | app-role connection split + ESLint guard | T-045 | covered |
| §5.x Auth & Identity (F-A1, 6 OSS libs) | Supabase + SAML + SCIM + TOTP + verify-PIN | T-011, T-012, T-013, T-015, T-016 | covered |
| §5.y UI primitives @monopilot/ui (F-A3) + 10 MODAL-SCHEMA patterns | primitives + Storybook + axe | T-025, T-026, T-027, T-028, T-029, T-030, T-031 | covered |
| §6 Schema-driven foundation (ADR-028) | DeptColumns + Zod runtime | T-017 | covered |
| §6 Schema-driven Admin UI wizard (ADR-028) — backend draft/publish + 5-step UI | Server Actions + Stepper UI | T-036, T-037 | covered |
| §7 Rule engine DSL (ADR-029) | Reference.Rules + executor stub | T-018 | covered |
| §7 Workflow-as-data (4th rule_type, ADR-029) | state-machine evaluator | T-035 | covered |
| §8 Multi-tenant L1-L4 (ADR-031) + RLS + tenant_idp_config (F-A2) | tenants/orgs + RLS + idp config | T-006, T-007, T-010 | covered |
| §8 Upgrade orchestration — tenant_migrations table + canary cohort progression | schema + advanceCohort/recordMigrationRun actions | T-038, T-039 | covered |
| §9 Configurable dept taxonomy (ADR-030) | Reference.Departments + dept_overrides | T-019 | covered |
| §9.1 Manufacturing Operations Pattern | Reference.ManufacturingOperations + cascade | T-020, T-021 | covered |
| §10 Outbox + R13 cols + GS1-first + idempotency | outbox_events + GS1 + idempotency | T-003, T-006, T-008, T-023, T-024 | covered |
| §10 R13 identity columns on lot/work_order/quality_event/shipment/bom_item | placeholder R13 tables migration + RLS | T-040 | covered |
| Decomp guide §5 — ref-tables.enum.ts source-of-truth lock (4th architect lock) | Reference.* registry + ESLint guard | T-046 | covered |
| §11 i18n + Audit log F-U3 (13-field, retention tiers) + regulatory | i18n + audit_events + regulatory | T-022, T-009, T-032 | covered |
| §12 ADRs 028-031 active + R1-R15 candidate | marker discipline + governance | T-005 | covered |
| §13 Success criteria + F-U5 (MFA-by-default, NIST password, idle 60min, SSO baseline, magic-link 7d) | tenant_idp_config seed + tests | T-010, T-011 | covered |
| §13 Niefunkcjonalne — drift detection + RLS coverage 100% | drift detection job + RLS test | T-007, T-034 | covered |
| §14 Open items — pre-Phase-D ADR review / regulatory artifact / dry-run scope | regulatory + dry-run mode | T-018 (dry-run), T-032 (regulatory) | covered |
| §15 References | out-of-scope per PRD §15 (links only) | none | out-of-scope per PRD §15 (PRD-internal references) |
| §W0-v4.3 | Wave0 final domain amendment / org_id / fg.* / shared BOM / D365 posture | T-047, T-048, T-049, T-050, T-051, T-052 | covered |

## Coverage by category

### data (16 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §5, §10 | T-002 | scaffold |
| §8, §10 | T-006 | migration |
| §5, §8 | T-007 | security |
| §10 | T-008 | event-bus |
| §11 | T-009 | audit |
| §6, §5 | T-017 | schema-driven |
| §7 | T-018 | rule-engine |
| §9 | T-019 | taxonomy |
| §9.1 | T-020 | manufacturing |
| §9.1, §7 | T-021 | rule-cascade |
| §7 | T-035 | rule-engine |
| §8 | T-038 | multi-tenant |
| §10 | T-040 | migration |
| §5, §13 | T-045 | security |

### auth (6 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §3, §13 | T-004 | enum-lock |
| §8.x, §5.x | T-010 | schema |
| §5.x | T-011 | identity |
| §5.x, §8.x | T-012 | federation |
| §5.x, §8.x | T-013 | provisioning |
| §3, §8 | T-014 | rbac |
| §5.x | T-015 | mfa |
| §5.x | T-016 | step-up |

### ui (8 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §5.y | T-025 | primitives |
| §5.y | T-026 | primitives |
| §5.y, §5 | T-027 | primitives |
| §5.y | T-028 | primitives |
| §5.y | T-029 | primitives |
| §5.y | T-030 | tuning |
| §5.y | T-031 | patterns |
| §6, §5.y | T-037 | schema-driven |

### infra (10 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §5, §4.2-AMENDMENT | T-001 | scaffold |
| §10 | T-003 | enum-lock |
| §5, §11 | T-022 | i18n |
| §5, §10 | T-023 | gs1 |
| §10 | T-024 | idempotency |
| §5, §8 | T-033 | feature-flags |
| §6, §11 | T-034 | ops |
| §5 | T-041 | pwa |
| §5, §10 | T-043 | offline-queue |
| §6, §7, §9, §9.1 | T-046 | enum-lock |

### api (2 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §6 | T-036 | schema-driven |
| §8 | T-039 | multi-tenant |

### test (1 task)
| PRD ref | Task | Subcategory |
|---|---|---|
| §5, §13 | T-042 | pwa |

### api/offline-queue (1 task)
| PRD ref | Task | Subcategory |
|---|---|---|
| §5, §10 | T-044 | offline-queue |

### docs (2 tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §1, §2, §4 | T-005 | adr |
| §11, §14 | T-032 | regulatory |

## Gaps closed in v1.1 (2026-05-01 — gap-fill batch T-035..T-046)

| Gap | Closed by |
|---|---|
| §7 Workflow-as-data (4th rule_type) executor (T-018 only stubbed it) | T-035 |
| §6 Admin UI wizard backend (draft/publish + schema_version bump) | T-036 |
| §6 Admin UI wizard frontend (5-step Stepper) | T-037 |
| §8 Canary upgrade orchestration — tenant_migrations table | T-038 |
| §8 Canary upgrade orchestration — advanceCohort + recordMigrationRun actions | T-039 |
| §10 R13 identity columns on lot/work_order/quality_event/shipment/bom_item | T-040 |
| §5 PWA scaffold (Workbox manifest + service worker registration) | T-041 |
| §5 PWA install + offline-shell Playwright E2E | T-042 |
| §5 IndexedDB sync queue primitive (enqueue/list/remove + UUID v7) | T-043 |
| §5 Sync queue flusher (online-event-driven replay with R14 dedup) | T-044 |
| §5/§13 Postgres app-role connection split (tests never as superuser) | T-045 |
| Decomp guide §5 ref-tables.enum.ts source-of-truth lock | T-046 |

## Gaps

| PRD ref | Requirement | Status |
|---|---|---|
| §14 open #4 (hard-lock semantyka ADR-028) | developer-only vs superadmin-only | out-of-scope per PRD §14 (Phase B.2 / C1 — not Foundation) |
| §14 open #5 (rule engine versioning v1/v2) | versioning UI/runtime | out-of-scope per PRD §14 (Phase D+ implementation) |
| §14 open #7 (commercial upstream brief) | NPD source decision | out-of-scope per PRD §4 (01-NPD module) |
| §14 open #11 (LLM platform Claude/Azure/Modal) | platform decision | out-of-scope per PRD §14 (open question, deferred) |
| §14 open #12 (Peppol vendor) | Storecove/Pagero/Tradeshift | out-of-scope per PRD §14 (Phase C4 / 11-SHIPPING) |
| §14 open #13 (pre-Phase-D ADR review 001-019) | ADR triage | out-of-scope per PRD §14 (separate session, Phase C start) |
| §11 — Out-of-scope Monopilot (GL/AP/AR/HR/CRM/On-prem/Blockchain/Autonomous LLM) | n/a | explicitly out-of-scope per PRD §11 |


## Gaps closed in v4.3 Wave0 readiness patch (2026-05-03)

| Gap | Closed by |
|---|---|
| Stale tenant_id business-scope wording in Foundation implementation tasks | T-006, T-007, T-014, T-040, T-048, T-050 |
| Stale FA/fa.* canonical naming in enum/permission tasks | T-003, T-004, T-047, T-048 |
| Missing shared BOM SSOT foundation skeleton | T-049 |
| Missing authorization policy foundation / Settings flag permission lock | T-050 |
| Missing D365 optional integration posture contract | T-051 |
| Missing ACP real-shape/readiness manifest patch | T-052 |

## Wave0 v4.3 Readiness

Foundation Wave0 v4.3 readiness ≥ 95% (per T-052 lock). All 61 tasks are DONE as of 2026-05-07.

### Locked decision → enforcing tasks

| Wave0 locked decision | Enforcing task(s) | Status |
|---|---|---|
| `org_id` business scope (not `tenant_id`) | T-001, T-002, T-007, T-014, T-017, T-019, T-020, T-040, T-049, T-050 (+ T-006, T-013, T-048) | covered |
| `tenant_id` control-plane only (tenant_idp_config) | T-010 | covered |
| `fg.*` canonical event prefix | T-003 (events.enum), T-008 (outbox), T-021 (cascade) | covered |
| `fa.*` legacy alias only | T-003 LegacyEventAlias + T-048 glossary | covered |
| Non-spoofable RLS pattern (app.set_org_context) | T-007 (app.set_org_context), T-045 (app-role split) | covered |
| LEAKPROOF discipline | none declared (per Wave0 lock; no task introduces LEAKPROOF without proof) | covered |
| Lower-priority-is-sooner + local T-XXX deps | all 61 task JSONs validated; cross-module blockers in pipeline_inputs.cross_module_dependencies | covered |
| Shared BOM SSOT skeleton/contract | T-049 | covered |
| factory_spec / internal_product_spec terminology | T-047, T-048, T-049 | covered |
| Authorization policy + Settings flag permission | T-004, T-014, T-050 | covered |
| D365 optional integration posture (never source of truth) | T-047, T-051 | covered |
| Manifest/coverage readiness patch + JSON validity | T-052 | covered |

### ACP import shape requirements

ACP tasks use top-level TaskCreate fields ONLY:
- `title` — required
- `prompt` — required
- `labels` — required
- `priority` — required (lower numeric value = picked sooner)
- `max_attempts` — required
- `pipeline_name` — required
- `pipeline_inputs` — required; `pipeline_inputs.root_path` is MANDATORY

Do NOT add generated ACP fields in task JSON (`task_id`, `status`, `project_id`). These are injected by ACP at import time.

### Dependency rules

- Dependencies are LOCAL `T-XXX` IDs (numeric references within 00-foundation module).
- Cross-module blockers belong in `pipeline_inputs.cross_module_dependencies`, NOT in the top-level `dependencies` list.
- All task JSONs in tasks/T-001.json through tasks/T-061.json have been validated against this rule.

## Wave A Consolidation (post-audit, 2026-05-07)

Tasks T-053..T-061 were generated from 4 audit reports (consistency, PRD-drift, test-quality, carry-forward backlog) following the 21-DONE-task Wave A milestone. Four are P0 Wave-B blockers; the rest are parallel-safe cleanup that should land before Wave-D documentation freeze.

| Task | Title | Severity | Audit source |
|---|---|---|---|
| T-053 | packages/db layout consolidation (single schema dir, relative symlink) | P0 (Wave-B blocker) | consistency §B; carry-forward CF-2/CF-3/CF-6/CF-7 |
| T-054 | Raw-SQL migration runner + filename normalization (NNN-name.sql) | P0 (Wave-B blocker) | consistency §A; carry-forward CF-4/CF-5/CF-23/CF-24 |
| T-055 | Workspace-wide ESLint coverage (drift gates fire on every package) | P0 (Wave-B blocker) | consistency §E; carry-forward CF-11/CF-20 |
| T-056 | Reference.Departments RLS hotfix follow-up + test contract | P1 | consistency §D |
| T-057 | schema-runtime VITEST env-var elimination (pool injection) | P1 | carry-forward CF-17 |
| T-058 | Migrate integration tests to getAppConnection() (T-045 AC4 truthing) | P0 (Wave-B blocker) | consistency §C; carry-forward CF-22 |
| T-059 | PRD marker discipline sweep (87 unmarked headings in 00-FOUNDATION-PRD.md) | P2 | carry-forward CF-25 |
| T-060 | ALTER tenant_idp_config: add 11 missing F-A2 columns | P0 (Wave-B blocker) | PRD-drift Critical drift #2 |
| T-061 | Password policy enforcement library (NIST: min-12, HIBP, last-5 history) | P1 | PRD-drift Critical drift #3 |

### Sequencing
- Pre-Wave-B blockers (must land before T-020/T-021/T-035/T-039 start): T-053 → T-054 → T-058; T-055 parallel-safe; T-060 parallel-safe.
- Wave-B-concurrent: T-056, T-057, T-061.
- Deferrable (post-Wave-B): T-059.

### Dependency edges
- T-054 depends on T-053 (consolidated layout).
- T-056 depends on T-054 (runner can apply 017 if needed).
- T-058 depends on T-053 + T-054 + T-055 (layout, runner, and lint rule).
- T-060 depends on T-054 (runner applies 016).
- T-061 depends on T-053 + T-054 + T-055 (uses migration runner, schema barrel, and lint config).
