# PRD Coverage — 00-FOUNDATION-PRD.md (v4.2)

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
