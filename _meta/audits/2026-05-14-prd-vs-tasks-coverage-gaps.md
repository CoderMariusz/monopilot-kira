# Auditor A — PRD vs Atomic-Tasks Coverage Gap Audit

Date: 2026-05-14
Auditor: AUDITOR A (read-only coverage gap research)
Scope: PRDs `docs/prd/00-FOUNDATION-PRD.md` through `docs/prd/15-OEE-PRD.md` vs `_meta/atomic-tasks/00-foundation` through `_meta/atomic-tasks/09-quality`.
Read-only: no task JSON modified. Modules 03/05/06/07/08 had only `coverage.md`, `manifest.json`, and a small task sample read (per audit scope rules).

---

## Executive Summary

Coverage is uneven across the program. Modules 00-Foundation, 02-Settings, 01-NPD and 04-Planning-Basic are deeply atomized (~65–129 tasks each, full PRD-§ coverage matrices in their `coverage.md`). Modules 03-Technical, 05-Warehouse, 06-Scanner-P1, 07-Planning-Ext, 08-Production were hardened in Wave Next-3 but most of their coverage is expressed at PRD-§-area granularity rather than per-screen / per-validation. Module 09-Quality has tasks (36) but **no `coverage.md`, no `manifest.json`**, and structurally covers only 09-a (Holds) and partial 09-b/09-c — three of the five PRD epics are essentially un-atomized. Modules 10–15 have no atomic-tasks directory at all (only PRDs + prototype-index entries).

The cross-cutting concerns most consistently slipping are:

- **Permission strings**: `packages/rbac/src/permissions.enum.ts` is only updated by Foundation + Settings tasks; NPD/Planning/Warehouse/Scanner/Production/Quality define permissions implicitly via reference-tables or never. The enum currently holds ~17 permissions and is the single source-of-truth for RBAC — every PRD-mandated capability per `<module>.*.*` must add to it.
- **GDPR right-to-erasure**: only one explicit task exists (NPD T-089). Foundation §13 mandates the function exist; no Foundation atomic task implements it. Settings, Warehouse, Scanner, Quality, Production have no erasure path despite holding PII (signatures, operator profiles, audit rows referencing user IDs).
- **Audit log coverage of R13 cols**: Foundation T-040 declares placeholder R13 tables, but downstream modules' tables (e.g., Quality `quality_holds`, `quality_inspections`; Warehouse stock moves; Production WO events) do not have explicit task assertions that they participate in `audit_events`.
- **Worker / cron**: only NPD (T-090) and Settings (T-028 deferred to background) reference scheduled work. There is no `apps/worker` task in any module, yet Foundation §10 outbox dispatcher, Settings §9.4 canary worker, Warehouse §12 expiry cron, NPD §11.7 dashboard refresh, Reporting §8 MV refresh, OEE §8 aggregation all require it.
- **Quality integration touchpoints**: Quality only references the GRN auto-inspection consumer (T-030) and the Quality holds outbox publisher (T-011). The Warehouse GRN / Production WO sides do not have task contracts to call into Quality.

The five worst cross-module integration gaps are listed below.

### Total gap count by module

| Module | Tasks | Coverage doc | Structural gaps found |
|---|---:|---|---|
| 00-foundation | 61 | strong | 1 (GDPR erasure, §13) |
| 01-npd | 100 | strong | 3 (tenant_id legacy in T-006; allergens cascade evolving; no permissions.enum delta) |
| 02-settings | 129 | strong | 3 (P2 features explicit OOS; canary worker OOS; no GDPR-tooling task even though §4.3 is P3) |
| 03-technical | 90 | medium (only "final decision coverage" rows) | 4 (per-§ matrix missing; no per-validation row; no permissions.enum delta; no i18n task) |
| 04-planning-basic | 65 | strong | 2 (no permissions.enum delta despite plan.* PRD perms; supplier_catalog import) |
| 05-warehouse | 57 | medium | 4 (no permissions.enum delta; no i18n task; cycle count full = P2; ASN P2) |
| 06-scanner-p1 | 48 | medium | 4 (no permissions.enum delta; no i18n task; SCN-090 offline queue P2; outbox not referenced) |
| 07-planning-ext | 57 | strong | 2 (Prophet P2, what-if P2, disposition P2 all explicit) |
| 08-production | 55 | strong | 2 (no permissions.enum delta; tweaks_panel deferred; D365 push under feature flag) |
| 09-quality | 36 | **MISSING** | 9 (no coverage.md, no manifest.json, no cross_module_deps, no 09-d NCR full, no 09-e HACCP/CCP/incidents/complaints, no Quality dashboard mat view task, no full UI parity §8.5, no i18n, no permissions.enum) |
| 10-finance | 0 | N/A | full module uncovered |
| 11-shipping | 0 | N/A | full module uncovered |
| 12-reporting | 0 | N/A | full module uncovered |
| 13-maintenance | 0 | N/A | full module uncovered |
| 14-multi-site | 0 | N/A | full module uncovered |
| 15-oee | 0 | N/A | full module uncovered |

### Top 10 highest-priority gaps (overall)

1. **09-Quality epics 09-d (Basic NCR) and 09-e (HACCP + CCP + incidents + complaints) are essentially un-atomized.** Quality PRD §7.1 mandates them in P1; tasks cover only NCR auto-draft side-effect (T-028). No `ncr_reports` CRUD/list/UI, no HACCP plans/CCPs/monitoring, no `quality_incidents`, no `quality_complaints`. Impact: blocks Quality P1 deliverable and Production WO failure escalation E2E.
2. **09-Quality has no `coverage.md` and no `manifest.json`.** Every other module has them and they are required by the validator pattern. Without them the module fails the consistency contract from `_meta/reviews/2026-05-03-final-wave-closeout.md`.
3. **GDPR right-to-erasure foundation function does not exist as an atomic task.** PRD `docs/prd/00-FOUNDATION-PRD.md:§13` lists "GDPR right-to-erasure function działa" as a success criterion. NPD T-089 redacts NPD tables only; no Foundation/Settings task generalizes the function or covers Warehouse / Scanner / Quality / Production user-FK columns.
4. **`packages/rbac/src/permissions.enum.ts` is only touched by Foundation + Settings.** 10+ PRD modules declare `<module>.<resource>.<verb>` permissions (NPD §2.2 has 19; Planning §3; Warehouse §3; Quality §13.1; Production §3) but only 17 permissions exist in the enum. No atomic task adds the rest. ESLint enum-lock guard (T-046) will block downstream modules at compile time.
5. **Outbox dispatcher / `apps/worker` package has no atomic task** in any module despite NPD T-089/T-090, Settings §9.4 canary, Warehouse §12.4 expiry cron, Production T-041 D365 outbox dispatcher, Reporting §8 MV refresh, OEE §8 aggregation, NPD T-090 dashboard cache all assuming it exists. NPD coverage.md explicitly flags this: "The SECURITY DEFINER + cron pattern (T-085, T-090) requires a worker package (apps/worker) — assumed present from Foundation 00-f outbox/worker scope" — but Foundation does not have an `apps/worker` scaffold task.
6. **i18n (next-intl) is missing for 03, 05, 06, 09.** Only Settings (T-116, T-129), Planning (23 task refs), Production (6 refs) and Planning-Ext (2 refs) declare next-intl key generation. NPD, Technical, Warehouse, Scanner, Quality have zero i18n tasks — yet all have user-visible UI surfaces per their PRDs (§14 of Quality, §10 of NPD Dashboard, etc.).
7. **NPD T-006 still uses `tenant_id`** instead of canonical `org_id` per Wave0 decision #1 (`_meta/decisions/2026-05-03-wave0-readiness-answers.md:§1`). The Reference.RolePermissions schema declares `tenant_id UUID` and `PK(tenant_id,role,permission,scope_qualifier)`. This is the only NPD task still on legacy scope column.
8. **Cross_module_dependencies metadata missing from 09-Quality tasks.** Sample of 5 Quality tasks shows empty/no `pipeline_inputs.cross_module_dependencies` despite Quality being a heavy consumer (Warehouse GRN, Production WO, Scanner inspect, Settings ref). Every other recent-wave module (04/05/06/07/08) requires it.
9. **Empty/loading/error/permission states**: only 02-Settings (35), 04-Planning (19), 08-Production (6), 07-Planning-Ext (2), 01-NPD (2) carry tasks that mention all four states. 00, 03, 05, 06, 09 have zero. UI parity policy (`_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`) requires all four for every screen.
10. **Module 10-FINANCE through 15-OEE: zero atomic tasks.** Six PRDs (≈ 8000 lines total) with mature prototype-index entries (25–41 labels each) have no decomposition. These modules block reporting, shipping, OEE dashboards from operating against Production/Planning/Quality data.

### Top 5 cross-module integration gaps

1. **Shared BOM SSOT consumer tasks in Planning and Production are present, but no integration test spans NPD T-097 → Technical T-081 → Planning T-001 → Production T-001 with the SAME BOM header ID.** NPD T-098 covers Brief→release E2E; Planning/Production each test their consumer in isolation. No single task asserts the BOM ID round-trips through all four modules unchanged.
2. **Warehouse GRN ⇄ Quality auto-inspection.** Quality T-030 consumes `grn.created` outbox events. Warehouse coverage.md does not list a producer task for that exact outbox shape. Warehouse T-021 (GRN from PO) and T-022 (GRN from TO) prompts must publish `grn.created` with the schema Quality expects — currently not asserted on the Warehouse side.
3. **Production WO consumption ⇄ Quality hold check.** Production §1.1A says START is blocked if release model is not approved, but says nothing about active `quality_holds` on the LP. Quality holds are LP-scoped; Production T-023..T-027 (consumption API) does not gate on `v_active_holds`. PRD 05-Warehouse §6.2 + 09-Quality §6.3 require it. Production coverage.md mentions Quality as cross-module but lists "exact task IDs are pending Quality decomposition".
4. **Settings onboarding ⇄ Warehouse/Scanner first-run.** Settings T-041..T-046 (onboarding wizard) sets up org infra including warehouses and locations, but Scanner T-020 (operator profile / PIN setup) has no task linking back to Settings seat-limit / SCIM / IdP — Scanner operators are created where? No task asserts that. Warehouse needs `gs1_prefix` from Settings infra (02-SETTINGS §12.1) — Warehouse T-001..T-012 reads it but no Settings task seeds a default that Warehouse depends on.
5. **D365 export contract enforcement is split: Foundation T-051 owns posture, Technical T-028/T-055..T-059/T-068/T-083 owns adapter, Production T-041 owns dispatcher.** But there is no single integration test that proves "D365 export never sets factory release state" end-to-end across modules. Every coverage.md claims the contract; no atomic task verifies it across the boundary. (NPD T-098 verifies it within NPD; cross-module is not covered.)

### Modules without atomic-tasks dir

| Module | Prototype labels indexed | Priority slice count proposed |
|---|---:|---:|
| 10-FINANCE | 25 | 10 |
| 11-SHIPPING | 41 | 10 |
| 12-REPORTING | 28 | 8 |
| 13-MAINTENANCE | 36 | 9 |
| 14-MULTI-SITE | 28 | 8 |
| 15-OEE | 28 | 8 |

Path to detailed slices: see §6 below.

---

## Per-module Coverage Matrix

Throughout: PRD anchors cited as `docs/prd/<file>:§X.Y` (Foundation uses `§N` only); task IDs cited as `T-XXX` (module-local). "GAP" = no atomic task; "covered" = explicitly mapped in module `coverage.md`; "implicit" = referenced inside another task's prompt but not its own row in coverage.md.

### 00-FOUNDATION (`docs/prd/00-FOUNDATION-PRD.md`)

`coverage.md` is exhaustive (per-§ table with status). Audit verified the matrix; only one substantive gap.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Six architectural principles | T-005 | covered |
| §2 Marker discipline | T-005 | covered |
| §3 Personas + Org/Schema Admin SoD | T-004, T-014 | covered |
| §4 Module map | T-005, T-006 | covered |
| §5 Tech stack (Next.js/RSC/TS) | T-001 | covered |
| §5 Postgres/RLS/Drizzle | T-002, T-006, T-007 | covered |
| §5 Outbox/Zod/i18n/GS1 | T-003, T-008, T-022, T-023, T-024 | covered |
| §5 PWA Workbox | T-041, T-042 | covered |
| §5 IndexedDB sync queue | T-043, T-044 | covered |
| §5.x Auth/Identity (6 OSS libs) | T-011..T-016 | covered |
| §5.y UI primitives @monopilot/ui | T-025..T-031 | covered |
| §6 Schema-driven (ADR-028) | T-017, T-036, T-037 | covered |
| §7 Rule engine DSL | T-018, T-035 | covered |
| §8 Multi-tenant L1-L4 | T-006, T-007, T-010 | covered |
| §8 Upgrade orchestration | T-038, T-039 | covered |
| §9 Dept taxonomy | T-019 | covered |
| §9.1 ManufacturingOperations pattern | T-020, T-021 | covered |
| §10 Outbox/R13/idempotency | T-003, T-006, T-008, T-023, T-024, T-040 | covered |
| §11 i18n + audit log F-U3 | T-022, T-009, T-032 | covered |
| §11 Regulatory artifact | T-032 | covered |
| §12 ADRs / R1-R15 | T-005 | covered |
| §13 Success criteria | T-010, T-011 | covered (NB GDPR sub-item is a GAP — see below) |
| §13 RLS coverage 100% | T-007, T-034 | covered |
| **§13 GDPR right-to-erasure function** | none | **GAP** — declared as success criterion ("GDPR right-to-erasure function działa", `docs/prd/00-FOUNDATION-PRD.md:1064`); only implementation is NPD T-089 scoped to fa/brief tables; no Foundation-level reusable function. |
| §14 Open items (dry-run, regulatory) | T-018, T-032 | covered |
| §W0-v4.3 Wave0 amendment | T-047..T-052 | covered |
| Wave A consolidation | T-053..T-061 | covered |
| **`apps/worker` package scaffold** | none | **GAP** — Foundation §5 Tech stack lists "Outbox dispatcher" but no atomic task creates `apps/worker`. Downstream NPD/Settings/Warehouse/Production all assume it exists. |

### 01-NPD (`docs/prd/01-NPD-PRD.md`)

`coverage.md` is exhaustive (T-001..T-100). Sampling confirms quality, with two issues.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Module scope | T-005..T-018 | covered |
| §2 Personas + RBAC | T-006 | covered (BUT see red flag #1: T-006 uses `tenant_id` instead of canonical `org_id`) |
| §3 End-to-end flow | T-030..T-035, T-095..T-098 | covered |
| §4 Entity model | T-001..T-018 | covered |
| §5 Main Table schema (69 cols) | T-001..T-018 | covered |
| §6 Cascading rules | T-009..T-017 | covered |
| §7 Workflow rules | T-009..T-017 | covered |
| §8 Allergens multi-level cascade | T-009..T-017 | covered |
| §9 Brief module | T-024..T-029, T-030..T-035 | covered |
| §10 D365 Builder | T-030..T-047 | covered |
| §10.8 D365 cache scheduled sync | T-090 | covered (assumes `apps/worker`) |
| §11 Dashboard | T-048..T-053, T-091 | covered |
| §12 Validation rules | T-001..T-018 | covered (per coverage matrix) |
| §13 Dependencies + build seq | manifest | covered |
| §14 Open items carry-forward | T-001..T-018 | covered |
| §15 Success criteria + GDPR | T-089 | covered |
| §16 References | n/a | n/a |
| §17 Stage-Gate Pipeline (G0-G4) | T-054..T-062, T-095..T-098 | covered |
| §17.11 Stage screen specs | T-063..T-076 | covered (Sensory T-071/T-076 deferred to Technical) |
| §18 Risk Register | T-080..T-082 | covered |
| §19 Compliance Documents | T-083..T-088 | covered |
| **§2.2 19 permissions added to permissions.enum.ts** | none | **GAP** — NPD T-006 writes to `Reference.RolePermissions` table, not to `packages/rbac/src/permissions.enum.ts`. The 19 permissions (risk.write, formulation.lock, npd.gate.advance, etc.) are not in the enum and will fail ESLint enum-lock guard (Foundation T-046). |
| Sensory schema/UI (Technical-owned) | T-071, T-076 deferred | covered (out-of-NPD per decision) |
| Allergens cascade rebuild on bulk import | none | implicit (T-009..T-017 cover schema, not cron rebuild) |

### 02-SETTINGS (`docs/prd/02-SETTINGS-PRD.md`)

`coverage.md` claims "every PRD section is either covered or explicitly out-of-scope". Audit verified. Gaps below are PRD-acknowledged out-of-scope (P2/P3).

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §0 Modal contract | T-047..T-057 | covered |
| §1 Executive Summary | n/a | n/a |
| §2 Objectives | T-001..T-129 | covered |
| §3 Personas & RBAC | T-001, T-016, T-018, T-053, T-059, T-088, T-091, T-119, T-120, T-122 | covered |
| §4 Scope | covered | covered |
| §4.2 Phase 2 features (VAT, fiscal calendar, MFA SMS) | none | **out-of-scope per §4.2** |
| §4.3 Phase 3 features (GDPR tooling, custom roles, L4) | none | **out-of-scope per §4.3** but Phase 1 needs Foundation-level GDPR erasure (see Foundation gap) |
| §5 Entity model | T-004..T-014 | covered |
| §6 Schema admin wizard | T-005, T-023, T-024, T-036, T-066, T-084, T-097..T-099, T-128 | covered |
| §7 Rule definitions registry | T-006, T-025, T-026, T-047, T-063, T-064, T-108 | covered |
| §7.5 Hard-lock semantyka | none | **out-of-scope per §7.5 EVOLVING** |
| §8 Reference tables CRUD | T-008, T-021, T-022, T-067, T-093, T-096, T-114 | covered |
| §9 Tenant L2 config | T-007, T-027, T-028, T-051, T-070, T-100..T-102 | covered |
| §9.4 Background canary worker | none | **out-of-scope per §9.4** (Server Action only via T-028) — but P1 SLO depends on it |
| §10 Module toggles + flags | T-013, T-019, T-020, T-048, T-065, T-072, T-092, T-103, T-110 | covered |
| §11 D365 constants admin | T-030, T-054, T-061, T-062, T-086, T-111, T-112 | covered |
| §12 Infrastructure | T-009, T-029, T-058, T-104..T-107 | covered (SET-015/017/019 edit screens deferred per `coverage.md` notes) |
| §13 EmailConfig + notifications | T-031, T-050, T-068, T-069, T-071, T-075, T-113 | covered |
| §14 Security + i18n + onboarding | T-011, T-012, T-032..T-037, T-041..T-046, T-074, T-080..T-088, T-116, T-129 | covered |
| §14.2 DE/FR/UK/RO i18n | T-129 PL/EN only | **out-of-scope per §14.2 Phase 2/3** |
| §15 Validations / KPIs | T-002, T-020, T-122, T-123 | covered |
| §16 Open items | none | **out-of-scope per §16.3** |

### 03-TECHNICAL (`docs/prd/03-TECHNICAL-PRD.md`)

`coverage.md` covers "final decision rebuild" only — no per-PRD-§ matrix. Tasks 001-071 are pre-rebuild and not enumerated in coverage. Module is in active upgrade — sample only, do not edit.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §0 / §15A FG canonical + posture | T-032..T-063, T-078 | covered |
| §1 Executive Summary | n/a | n/a |
| §2 Objectives | implicit | not explicit in coverage |
| §3 Personas & RBAC | implicit | **GAP** — no row in coverage; PRD declares roles; permissions.enum.ts not updated |
| §4 Scope | implicit | not explicit in coverage |
| §4A PRD↔UX reconciliation | T-085..T-089 | covered |
| §5 Entity model | T-020, T-060, T-072..T-082 | covered (final decision) |
| §6 Product Master | T-038, T-039, T-073 | covered |
| §7 BOM versioning + co-products | T-073 | covered (single task — verify depth) |
| §8 Catch weight / Tare/Gross/Nominal | implicit in pre-rebuild T-001..T-071 | **GAP in coverage.md** — must be checked once upgrade lands |
| §9 Shelf life + regulatory | implicit | **GAP in coverage.md** |
| §10 Allergens full | T-090 sensory; allergens implicit | **GAP** — no row for §10.1..§10.4 allergen P1 contracts |
| §11 cost_per_kg | T-074 RM usability | covered |
| §12 Routing + resources | implicit | **GAP in coverage.md** |
| §13 D365 Integration Stage 1 | T-028, T-055..T-059, T-068, T-083 | covered |
| §14 Validations / KPIs / Success | implicit | **GAP in coverage.md** |
| §15 Dependencies / build seq | manifest | covered |
| §15A PO/F/D amendment | T-072..T-090 | covered |
| §16 References + Changelog | n/a | n/a |
| §17 UI surfaces master table | T-085..T-089 | partial (no per-screen row) |
| §17A Spec-driven UI anchor map | T-085..T-090 | covered |
| §17B Staged ACP wave order | manifest | covered |
| **Permissions.enum.ts delta** | none | **GAP** |
| **i18n / next-intl keys for Technical UI** | none | **GAP** — 0 tasks reference next-intl |

### 04-PLANNING-BASIC (`docs/prd/04-PLANNING-BASIC-PRD.md`)

`coverage.md` exhaustive (per-§ and per-screen). Two minor gaps.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Executive Summary | T-001 | covered |
| §2 Objectives & SLOs | T-027, T-034 | covered |
| §3 Personas + RBAC | T-033, T-058, T-065 | covered |
| §4 Scope | manifest | covered |
| §5 Entity model | T-001..T-006, T-041, T-042 | covered |
| §6 Suppliers / POs | T-002, T-009..T-013, T-035..T-040, T-041..T-044, T-059 | covered |
| §6.6 Validations V-PLAN-PO | T-035..T-040 | covered |
| §7 Transfer orders | T-003, T-014..T-016, T-046..T-049, T-060 | covered |
| §8 Work orders + BOM snapshot + DAG | T-004..T-006, T-017..T-026, T-050..T-057 | covered |
| §9 Material availability / hard-lock | T-006, T-021..T-024, T-049, T-056, T-063 | covered |
| §10 Allergen-aware sequencing | T-025, T-057, T-062, T-064 | covered |
| §11 Finite-capacity stub | T-026, T-054 | covered |
| §12 Release-to-Warehouse flow | T-021, T-023, T-050, T-051, T-056 | covered |
| §13 Dashboard & KPIs | T-027, T-034, T-045 | covered |
| §14 Planning Settings | T-028, T-029, T-058, T-065 | covered |
| §15 D365 Integration Stage 1 consumer | T-030, T-031, T-037, T-061 | covered |
| §16 Workflow-as-data / build seq | T-007, T-028, T-058, T-065 | covered |
| **Permissions.enum.ts delta for plan.*** | none | **GAP** — no task adds plan.po.create/approve, plan.wo.create/release, plan.to.ship, plan.reservation.override |
| **Supplier_catalog mass import** | none | **GAP** — §6.1 references bulk supplier import (PLN-017 `po_bulk_import_modal` is PO-only); no supplier-master CSV import. |

### 05-WAREHOUSE (`docs/prd/05-WAREHOUSE-PRD.md`)

`coverage.md` solid at PRD-§ granularity; module in active upgrade — sample only.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Executive Summary | T-001..T-012 | covered |
| §2..§5 Core entities/enums | T-001..T-012 | covered |
| §6.1 LP lifecycle DSL | T-013, T-019, T-048 | covered |
| §6.2 QA gating | T-019, T-048 | covered (Quality-owned write seam) |
| §6.3 LP numbering | T-016, T-048 | covered |
| §6.4 LP split (WH-008 destination required) | T-017, T-048, T-055 | covered |
| §6.5 LP merge | T-018, T-048, T-055 | covered |
| §6.6 Scanner LP locking | T-020, T-044, T-048, T-056 | covered |
| §6.7 Dual UoM / catch weight | T-002, T-005, T-016, T-021, T-048, T-049 | covered |
| §6.8 Schema extensions editor | T-002, T-048 | P1 read covered; P2 editor deferred (BL-WH-06) |
| §7 GRN PO / TO / over/under | T-005, T-021..T-024, T-049, T-055, T-056 | covered |
| §7.4 GS1-128 auto-fill | T-023, T-049, T-056 | covered |
| §8 Stock moves / put-away / adjust | T-006, T-025..T-028, T-049, T-050, T-055 | covered |
| §8.8 Cycle count P1 stub | T-029, T-050 | covered (full = P2) |
| §9 FEFO/FIFO / reservations | T-004, T-014, T-015, T-030..T-033, T-051, T-055, T-056 | covered |
| §10 Intermediate LP handling | T-034, T-039, T-042, T-056 | covered |
| §11 Genealogy + traceability | T-003, T-038, T-054, T-055 | covered |
| §12 Expiry / shelf-life rules | T-008, T-035..T-037, T-052, T-055, T-056 | covered |
| §13 Scanner APIs | T-039..T-042, T-056 | covered |
| §14 Dashboard / inventory browser | T-045, T-046, T-053, T-055 | covered |
| §15 Labels / ZPL / GS1 | T-043, T-054, T-055 | covered |
| §16 Settings / cross-module deps | T-009, T-053, T-056, T-057 | covered |
| **Permissions.enum.ts delta** | none | **GAP** — wh.* permissions not in enum |
| **i18n / next-intl** | none | **GAP** — 0 tasks reference next-intl |
| **GDPR erasure for warehouse PII (signed_by / operator_id)** | none | **GAP** |
| **Worker task for §12.4 expiry cron** | implicit | **GAP** — no `apps/worker` task |

### 06-SCANNER-P1 (`docs/prd/06-SCANNER-P1-PRD.md`)

`coverage.md` covers area-level. Module in active upgrade — sample only.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1..§5 Exec/Personas/Scope/Constraints | T-001..T-026 | covered (shell + auth + permissions) |
| §6 Decisions D1-D9 | T-004, T-005, T-013..T-015 | covered |
| §7 Module map | manifest | covered |
| §8.1 BE-001..013 shell data model | T-001..T-011 | covered |
| §8.1 FE-001..015 shell screens | T-012, T-016..T-026, T-048 | covered |
| §8.2 Receive PO / TO / putaway | T-027..T-033 | covered |
| §8.3 Move / split | T-034..T-036 | covered |
| §8.4 Pick / consume / WO execute | T-037..T-041 | covered |
| §8.5 Output / co/by / waste / QA inspect | T-042..T-047 | covered |
| §8.6 Offline P1 stub | T-026, T-048 | covered (P2 deferred) |
| §9 UX patterns | parity tasks | covered |
| §10 Barcode / GS1 parsing | T-013..T-015 | covered |
| §11 Hardware integration | T-004, T-013 | covered |
| §12 Auth & Security | T-017..T-022 | covered |
| §13 Offline queue contract P2 | none P1 | covered (P2 deferred) |
| §14 API contract | T-027..T-047 | covered |
| §15 Validation rules V-SCAN-* | implicit | **GAP** — no per-validation row in coverage |
| §16 Telemetry / build seq | manifest | covered |
| **Permissions.enum.ts delta** | none | **GAP** — scanner.* permissions not in enum |
| **i18n / next-intl for scanner labels** | none | **GAP** — mobile UI, PL+EN required |
| **Outbox emission from scanner mutations** | implicit | **GAP** — only 2 task refs to "outbox" in scanner; scanner consume/produce/output should publish |

### 07-PLANNING-EXT (`docs/prd/07-PLANNING-EXT-PRD.md`)

`coverage.md` exhaustive. Module in active upgrade — sample only.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Exec | n/a | covered |
| §2 Objectives | T-001..T-057 | covered |
| §3 Personas & RBAC | T-008, T-048 | covered |
| §4 Scope | manifest | covered |
| §5 Constraints | manifest | covered |
| §6 Decisions D1-D5 | T-010, T-011 | covered |
| §7 Module map | manifest | covered |
| §8 Requirements per screen/API | T-012..T-035 | covered |
| §9 Data model | T-001..T-006 | covered |
| §10 Business rules (DSL) | T-025..T-027, T-049..T-051 | covered |
| §11 KPIs | implicit | covered |
| §12 Risks | manifest | covered |
| §13 Success criteria | manifest | covered |
| §14 Build sequence | manifest | covered |
| §15 Dependencies | cross-module-deps | covered |
| §16 Changelog | n/a | n/a |
| §17 UX/Prototype coverage | T-030..T-035, T-043..T-053, T-056 | covered |
| §18 UI surfaces matrix | T-030, T-056 | covered |
| **Permissions.enum.ts delta** | none | **GAP** |
| **GDPR erasure** | none | **GAP** |

### 08-PRODUCTION (`docs/prd/08-PRODUCTION-PRD.md`)

`coverage.md` exhaustive. Module in active upgrade — sample only.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Exec / §1.1A release contract | T-001 | covered |
| §2 Objectives & Metrics | T-011, T-044, T-046, T-052 | covered |
| §3 Personas & RBAC | T-045 | covered |
| §4 Scope | manifest | covered |
| §5 Constraints | manifest | covered |
| §6 Decisions | T-012..T-014 | covered |
| §7 Data model | T-002..T-010 | covered |
| §8.2.1 WO execution API | T-016..T-022 | covered |
| §8.2.2 Consumption | T-023..T-027 | covered |
| §8.2.3 Output/waste | T-028..T-034 | covered |
| §8.2.5 Downtime / shifts | T-035..T-040 | covered |
| §8.2.7 D365 outbox | T-041, T-042 | covered |
| §9 / §10 / §11 / §12 (KPI/Integrations/Risks/Success) | T-044, T-045, T-052..T-055 | covered |
| §13 / §14 / §15 / §16 build seq | manifest | covered |
| **Permissions.enum.ts delta** | none | **GAP** — prod.* perms not in enum |
| **Quality hold gate at consumption** | implicit | **GAP** — Production §8.2.2 must check Quality `v_active_holds` before consume; no task explicitly references Quality T-010 cross-module |
| **i18n / next-intl** | 6 refs | partial |

### 09-QUALITY (`docs/prd/09-QUALITY-PRD.md`)

**No `coverage.md` and no `manifest.json`.** 36 tasks present. Below is the audit-constructed coverage matrix.

| PRD ref | Task(s) | GAP? |
|---|---|---|
| §1 Exec summary | T-004..T-016 | covered |
| §2 Stakeholders & Personas | implicit | **GAP** — no RBAC task; no permissions.enum delta |
| §3 Out-of-scope (P1 clarifications) | n/a | n/a |
| §4 KPIs | implicit | **GAP** — no MV `mv_quality_kpis_daily` task; PRD §9.3 requires it |
| §5 Compliance & Regulatory | T-007, T-012, T-019, T-024, T-028 | covered (e-signature, Part 11) |
| §6 Data Model — Core Entities | T-004, T-005, T-009, T-017, T-025, T-031 | partial — see below |
| §6.1 Hold/Release entities | T-004..T-016 | covered |
| §6.2 Specifications | T-017..T-024 | covered |
| §6.3 Inspections + test results | T-025..T-029 | covered |
| §6.4 NCR reports | T-028 (auto-draft only) | **GAP** — no `ncr_reports` schema task, no NCR CRUD/list/UI |
| §6.5 HACCP plans + CCPs + monitoring | none | **GAP** — entire 09-e epic un-atomized |
| §6.6 Quality incidents | none | **GAP** |
| §6.7 Quality complaints | none | **GAP** |
| §6.8 Sampling plans + records | T-031, T-035 | covered (AQL ISO 2859 seed) |
| §6.9 Lab results read model | T-020 | covered |
| §7.1 Epic 8A 09-a Hold/Release | T-001..T-016 | covered |
| §7.1 Epic 8B 09-b Specifications | T-017..T-024 | covered |
| §7.1 Epic 8C 09-c Incoming inspection | T-025..T-035 | covered |
| §7.1 Epic 8D 09-d Basic NCR | T-028 only | **GAP** — 5 stories (09-d-01..05) missing |
| §7.1 Epic 8E 09-e Basic HACCP | none | **GAP** — 7 stories (09-e-01..07) missing |
| §8 UX screens (QA-001..QA-052) | T-013..T-016, T-021..T-024, T-032..T-036 | partial — QA-040/041 NCR list/form, QA-050/051/052 HACCP/complaint missing |
| §9 DB schema detail | T-004, T-009, T-017, T-025, T-031 | partial — `ncr_reports`, `haccp_*`, `quality_incidents`, `quality_complaints` missing |
| §9.3 mv_quality_kpis_daily | none | **GAP** |
| §10 DSL rules registered | T-008 (qa_status_state_machine_v1) | partial — `ccp_deviation_escalation_v1` (§10.1) missing |
| §11 Validations V-QA-* | T-006, T-007, T-018, T-019, T-026, T-028 | partial — V-QA-HACCP/CCP/HOLD-* not all enforced |
| §12 INTEGRATIONS P1 | T-011 (outbox publish), T-030 (GRN consumer) | covered for P1 |
| §13 Security & Audit | T-009, T-012, T-019, T-024, T-028 | covered |
| §13.4 GDPR data privacy | none | **GAP** |
| §14 i18n PL/EN+UK/RO | none | **GAP** — no i18n task |
| §15 Risks / Open items | manifest | covered |
| §16 Build sequence | implicit | **GAP** — no manifest.json |

---

## High-Risk Cross-Cutting Concerns

### RLS policies + tenant isolation per table

| Module | Status |
|---|---|
| 00 | covered (T-006, T-007, T-040, T-045) |
| 01 | covered per coverage.md (T-001..T-018 each include RLS) |
| 02 | covered (T-015) |
| 03 | covered (final decision rebuild) |
| 04 | covered (T-001..T-006) |
| 05 | covered (T-001..T-012) |
| 06 | covered (T-001..T-011) |
| 07 | covered (T-001..T-006) |
| 08 | covered (T-002..T-010) |
| 09 | **partial** — Holds/Specs/Inspections have RLS; NCR/HACCP/incidents/complaints would need it but tasks don't exist |

### Outbox / event emission for state changes

| Module | Status |
|---|---|
| 00 | covered (T-003, T-008) |
| 01 | covered (per coverage.md) |
| 02 | covered (T-003) |
| 03 | covered (T-082 NCR event contract) |
| 04 | covered (T-032) |
| 05 | covered (T-007..T-008 etc.) but **GAP for `grn.created`** explicit schema published — Quality T-030 consumes it |
| 06 | **GAP** — only 2 task refs to outbox; scanner mutations (consume, output, waste) should emit |
| 07 | covered |
| 08 | covered (T-041 D365 outbox) |
| 09 | covered for holds/inspections; **GAP** for NCR/HACCP/incidents/complaints (no tasks) |

### GDPR right-to-erasure

| Module | Status |
|---|---|
| 00 | **GAP** — Foundation §13 requires function; no atomic task |
| 01 | covered (T-089) |
| 02 | **GAP** — Phase 3, explicit OOS; but Phase 1 needs Foundation-level function |
| 03 | **GAP** |
| 04 | **GAP** |
| 05 | **GAP** |
| 06 | **GAP** |
| 07 | **GAP** |
| 08 | **GAP** |
| 09 | **GAP** — §13.4 declares it |

### Audit log (R13 audit cols) coverage

| Module | Status |
|---|---|
| 00 | covered (T-040 placeholder R13 tables) |
| Downstream | implicit in each migration task's RLS+audit triggers; **no module asserts coverage explicitly in the validator** |

### Permission strings (`<module>.*.*`) added to `packages/rbac/src/permissions.enum.ts`

| Module | Status |
|---|---|
| 00 | covered (T-003, T-004) — ~10 perms |
| 02 | covered (T-002, T-122) — ~10 perms |
| 01 | **GAP** — NPD uses Reference.RolePermissions table only (T-006), bypassing enum |
| 03 | **GAP** |
| 04 | **GAP** — plan.* perms not in enum |
| 05 | **GAP** — wh.* perms not in enum |
| 06 | **GAP** — scanner.* perms not in enum |
| 07 | **GAP** — sched.* perms not in enum |
| 08 | **GAP** — prod.* perms not in enum |
| 09 | **GAP** — qa.* perms not in enum |

### i18n / next-intl keys

| Module | Tasks referencing next-intl |
|---|---|
| 00 | 1 |
| 01 | 0 |
| 02 | 4 (incl T-116, T-129) |
| 03 | 0 |
| 04 | 23 |
| 05 | 0 |
| 06 | 0 |
| 07 | 2 |
| 08 | 6 |
| 09 | 0 |

Modules 01/03/05/06/09 are user-visible and need next-intl keys but have zero atomic tasks.

### Empty / loading / error / permission states

Only 00, 02, 04, 07, 08 have tasks that mention all four. 01, 03, 05, 06, 09 are below the bar set by `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`. (Note: 01-NPD has 2 task refs but coverage spans many UI tasks via shared primitive contracts in 00 T-025..T-031 — partial credit only.)

### D365 sync (scheduled, conflict handling, export-only contract)

| Module | Status |
|---|---|
| 00 | covered (T-051 posture) |
| 01 | covered (T-030..T-047, T-090 cache sync) |
| 02 | covered (T-030, T-054, T-061, T-062, T-086, T-111, T-112) |
| 03 | covered (T-028, T-055..T-059, T-068, T-083) |
| 04 | covered (T-030, T-031, T-037, T-061) |
| 08 | covered (T-041, T-042, T-051) |
| **End-to-end "export never sets factory release state" assertion** | **GAP** — no single integration test |

### Cron / worker tasks

**Module-wide GAP**: no `apps/worker` package scaffold task exists. NPD coverage.md explicitly assumes Foundation provides it; Foundation does not.

### Migrations idempotency + RLS enable

| Module | Status |
|---|---|
| 00 | covered (T-024 idempotency primitive, T-002 base RLS) |
| Downstream | each declares per-migration "RLS enabled" but **no module-level acceptance test** validates "every table in this module has RLS enabled". Foundation T-007 had this for foundation tables; a cross-module sweep task is missing. |

### E2E spine tasks

| Spine | Atomic task |
|---|---|
| Brief → factory release | NPD T-098 (covered) |
| Receive → consume | partial — Warehouse T-055 (E2E readiness) + Scanner T-048 (integration) + Production T-052 (approved WO to D365); no single cross-module E2E |
| Plan → WO → produce | Planning T-018..T-026 → Production T-046..T-055; no single E2E |
| Inspect → hold → release → ship | **GAP** — Quality has no E2E task; Shipping module has no tasks |

### Decisions in `_meta/decisions/`

| Decision | Reflected in tasks |
|---|---|
| `2026-05-03-flow-d365-settings-technical-decisions.md` | NPD T-095..T-098, Technical T-072..T-090, Settings T-119..T-129 — covered |
| `2026-05-03-next-modules-warehouse-scanner-planning-production-decisions.md` | Warehouse coverage.md, Scanner coverage.md, Planning/Production coverage.md — covered |
| `2026-05-03-wave0-readiness-answers.md` | NPD T-094..T-100, Settings T-122..T-128, Foundation T-047..T-052 — covered. **EXCEPT**: decision #1 (use `org_id` not `tenant_id`) is violated by NPD T-006 (still uses `tenant_id`). |

---

## Cross-module Integration Gaps (detailed)

### CIG-1: Shared BOM SSOT end-to-end (NPD → Technical → Planning → Production)

**Modules affected**: 01, 03, 04, 08
**Symptom**: each module has a consumer task for the shared BOM (NPD T-093/T-096; Technical T-073; Planning T-001; Production T-001). No task asserts the same `bom_header_id` round-trips unchanged.
**Remediation**: Add an integration E2E task in 00-Foundation or as a new cross-module `_meta/atomic-tasks/integration/` directory. Suggested: `T-INT-BOM-E2E` — Brief → NPD Builder release → Technical approval → Planning WO snapshot → Production consumption all reference the same `bom_header_id`; outbox events use `fg.*` namespace; tested with Playwright.

### CIG-2: Warehouse GRN ⇄ Quality auto-inspection contract

**Modules affected**: 05, 09
**Symptom**: Quality T-030 consumes `grn.created` outbox event. Warehouse T-021/T-022 mention publishing it but the exact schema (LP id, product_id, lot, supplier_id, qty, uom, gtin, occurred_at) is not pinned in either coverage.md.
**Remediation**: Add a Warehouse task `T-WH-GRN-OUTBOX-CONTRACT` that fixes the event schema in `packages/events/src/grn.ts` and adds Zod runtime validator; cross-reference in Quality T-030 update.

### CIG-3: Production WO consumption ⇄ Quality hold check

**Modules affected**: 05, 08, 09
**Symptom**: Quality holds are LP-scoped (`quality_holds.reference_type='lp'`). Production consumption API (T-023..T-027) does not query `v_active_holds`. PRD `docs/prd/05-WAREHOUSE-PRD.md:§6.2` + `docs/prd/09-QUALITY-PRD.md:§6.3` require it.
**Remediation**: Add task `T-PROD-QA-HOLD-GATE` (in 08-Production once unprotected) wiring Quality T-010 (listActiveHolds) into Production consumption preflight; emit blocker code `wo.consumption.qa_held`.

### CIG-4: Settings onboarding ⇄ Scanner operator/Warehouse first-run

**Modules affected**: 02, 05, 06
**Symptom**: Scanner T-001..T-022 covers operator/PIN/site selection but does not consume Settings users/SCIM. Warehouse T-009 (settings page) does not seed default `gs1_prefix` consumed by Warehouse T-023 (GS1 parser).
**Remediation**: (a) Add Settings task `T-SET-ONBOARDING-SCAN-OPERATOR-SEED` that creates a default `scanner_operator` role + first operator profile at end of onboarding wizard; (b) Add Warehouse task `T-WH-SETTINGS-GS1-PREFIX-CONSUMER` to read prefix from Settings infrastructure.

### CIG-5: D365 export-only contract enforcement across modules

**Modules affected**: 00, 01, 03, 04, 08
**Symptom**: Foundation T-051 declares posture. NPD T-098 verifies within NPD. Technical T-083 publishes red-lines. Production T-041/T-042 implements dispatcher. No single task verifies "D365 export never sets factory release state" across module boundaries.
**Remediation**: Add `T-INT-D365-POSTURE-E2E` (in 00-Foundation) — write a Playwright + DB test that (1) toggles `flags.d365.enabled=true`, (2) attempts to set FG state via D365 import, (3) asserts factory release read model unchanged, (4) confirms Production WO consumption stays blocked.

---

## Modules without Atomic-Tasks (10-15) — Priority Slices

For each uncovered module, the highest-priority atomic-task slices (foundation/schema first, then UI parity).

### 10-FINANCE (target ≥ 10 slices)

1. **FIN-001** `standard_costs` + `standard_cost_versions` schema + RLS + R13 audit (consume from 08-PROD outbox `wo.completed`).
2. **FIN-002** `fifo_layers` + `wac_inventory_value` schema (LP cost snapshot per 05-WH `lp.cost_snapshot` event).
3. **FIN-003** `cost_centers`, `gl_account_mappings`, `currencies`, `tax_codes` reference-tables seed (02-SETTINGS §8 extension).
4. **FIN-004** D365 cost posting daily consolidated outbox dispatcher (INTEGRATIONS stage 5; clone of 08-PROD §12 stage 2 pattern).
5. **FIN-005** WO yield variance computation Server Action (consumes 08-PROD `wo_outputs` + `wo_waste_log`).
6. **FIN-006** BOM cost rollup DAG cascade (recursive against 04-PLAN dependency DAG; reuses 01-NPD allergen-cascade pattern).
7. **FIN-007** `fin_standard_costs_list` UI + `std_cost_create_modal` + `approve_std_cost_modal` (dual sign-off ≥20% — BL-FIN-07).
8. **FIN-008** `fin_dashboard` UI + cost KPIs (consumer of 12-REP MVs).
9. **FIN-009** `fin_d365_integration` UI + DLQ list/replay + period_lock_modal.
10. **FIN-010** Permissions enum delta: `fin.cost.create/approve/supersede`, `fin.period.lock`, `fin.dlq.replay`.

### 11-SHIPPING (target ≥ 10 slices)

1. **SHP-001** `customers` + `customer_addresses` + `customer_allergen_restrictions` schema + RLS.
2. **SHP-002** `sales_orders` + `so_lines` + `so_allocations` schema (FEFO/FIFO consumer of 05-WH reservations).
3. **SHP-003** `shipments` + `cartons` + SSCC-18 generation (GS1-compliant; uses 00-Foundation T-023 GS1 primitives).
4. **SHP-004** Pick wave APIs: wave create, pick task assign, short-pick resolve.
5. **SHP-005** Pack/Ship APIs: carton close, BOL generate, packing slip PDF.
6. **SHP-006** RMA receive/disposition flow (writes back to 05-WH and 09-QA holds).
7. **SHP-007** D365 SalesOrder confirm push outbox dispatcher (Stage 3, clone of 08-PROD).
8. **SHP-008** `shipping_dashboard` + `so_list_page` + `so_detail_page` UI parity.
9. **SHP-009** Quality Hold integration (D-SHP-13): block allocation if LP `qa_status` in {Hold, Quarantine, Reject}.
10. **SHP-010** Permissions enum delta: `ship.so.create/approve`, `ship.alloc.override`, `ship.pick.execute`, `ship.pack.close`, `ship.bol.sign`, `ship.rma.disposition`.

### 12-REPORTING (target ≥ 8 slices)

1. **RPT-001** Materialized views base: `mv_yield_by_line`, `mv_yield_by_sku`, `mv_inventory_aging`, `mv_wo_status`, `mv_shipment_otd`, `mv_oee_summary` consumer.
2. **RPT-002** pg_cron refresh schedule (every 2 min) with Edge Function fallback.
3. **RPT-003** Dashboard catalog (`rpt_home_dashboard_catalog`) + 10 core dashboards.
4. **RPT-004** Export CSV/PDF P1 + saved-filter + share APIs.
5. **RPT-005** Scheduled reports email delivery (P2 stub; Resend consumer of 02-SET §13).
6. **RPT-006** Quality hold consumer dashboards (`rpt_qc_holds` reads from 09-QA `v_active_holds`).
7. **RPT-007** `rpt_integration_health` UI + D365 / outbox DLQ inspector.
8. **RPT-008** Permissions enum delta: `rpt.dashboard.view`, `rpt.export.csv/pdf`, `rpt.schedule.create`, `rpt.preset.save`.

### 13-MAINTENANCE (target ≥ 9 slices)

1. **MNT-001** `assets` + `asset_types` schema + criticality + RLS.
2. **MNT-002** `work_requests` + `mwos` schema (maintenance WO).
3. **MNT-003** `pm_schedules` + `pm_occurrences` (preventive maintenance calendar).
4. **MNT-004** `calibration_records` + cert upload.
5. **MNT-005** `spares` + reorder thresholds.
6. **MNT-006** LOTO (lock-out-tag-out) flow with dual sign-off.
7. **MNT-007** MTBF/MTTR producer for 15-OEE `oee_shift_metrics`.
8. **MNT-008** `maintenance_dashboard` + `asset_list_page` + `mwo_detail_page` UI parity.
9. **MNT-009** Permissions enum delta: `mnt.asset.edit`, `mnt.mwo.assign/sign`, `mnt.pm.skip`, `mnt.calib.upload`, `mnt.loto.apply/clear`.

### 14-MULTI-SITE (target ≥ 8 slices)

1. **MS-001** `sites` table + RLS extension (site_id scope on org-scoped tables; opt-in per table).
2. **MS-002** Inter-site transfers (IST) state machine + 05-WH TO extension.
3. **MS-003** Transport lanes + rate cards (closes audit BLOCKER #2 per PRD).
4. **MS-004** Master data sync (Settings reference-tables replication across sites).
5. **MS-005** Replication queue + conflict resolution.
6. **MS-006** Site activation wizard + decommission flow.
7. **MS-007** `ms_dashboard` + `ms_sites_list` + `ms_lanes_list` UI parity.
8. **MS-008** Permissions enum delta: `ms.site.create/decommission`, `ms.ist.amend`, `ms.lane.edit`, `ms.replication.retry`, `ms.permission.bulk_assign`.

### 15-OEE (target ≥ 8 slices)

1. **OEE-001** `oee_snapshots` per-minute schema (08-PROD §13 producer contract).
2. **OEE-002** `oee_daily_summary` + `oee_shift_metrics` materialized views.
3. **OEE-003** DSL rules: `oee_target_threshold_v1`, `oee_anomaly_detection_v1` registered in 02-SET §7.8.
4. **OEE-004** `oee_daily_summary_page` + `oee_line_trend_page` + `oee_shift_heatmap_page` UI parity.
5. **OEE-005** Downtime Pareto + six-big-losses dashboard.
6. **OEE-006** Availability/Performance/Quality drilldown pages (`oee_*_drilldown_page`).
7. **OEE-007** `oee_settings_page` + `oee_shift_configs_page` + line override modal.
8. **OEE-008** Permissions enum delta: `oee.target.edit`, `oee.override.create/delete`, `oee.export.csv`, `oee.anomaly.acknowledge`.

---

## Quality Red Flags

### Tasks whose AC contradicts current PRD section

- **NPD T-006** uses `tenant_id UUID` in `Reference.RolePermissions(role TEXT, permission TEXT, allowed BOOLEAN, scope_qualifier TEXT, tenant_id UUID, PK(tenant_id,role,permission,scope_qualifier))`. Wave0 decision #1 (`_meta/decisions/2026-05-03-wave0-readiness-answers.md:§1`) and Foundation `docs/prd/00-FOUNDATION-PRD.md:§W0-v4.3` mandate `org_id` for business-scope columns. NPD coverage.md/`Notes` does not flag this as a known exception.

### Tasks referencing §X.Y that does not exist in the PRD

- Spot-check found none in 00/01/02/09 sampled tasks (cross-checked PRD heading list).
- Caveat: Quality T-001 references `09-QUALITY-PRD.md §16.3` but PRD has no §16; max is `§16 Build Sequence & Summary` (line 1772). T-002, T-003 also reference §16.3. PRD section `§16.3` does not exist — these tasks should cite `§5 Compliance` + `02-SETTINGS-PRD.md:§8` (the cross-PRD reference home).
- Confirmed: `grep -nE '^### 16\\.' docs/prd/09-QUALITY-PRD.md` returns nothing. `§16` has no subsections.

### Tasks using `prototypes/...` paths that don't exist

- Cross-verified 00/01/02/09 task JSONs against the 428 actual files under `prototypes/`. **0 broken refs.** (Skipped 03/05/06/07/08 by audit scope rules — only sample sufficient.)

### Other anomalies worth flagging

- 09-Quality `tasks/` has 36 numbered files but no manifest.json — every other module enforces 1:1 manifest↔files. Validator pattern `_validate.py` exists but cannot run without manifest.
- 00-Foundation `STATUS.md` exists but other modules don't have one — inconsistent.
- 03-Technical coverage.md has only the "final decision rebuild" rows (post-Wave0); the earlier T-001..T-071 tasks are not row-mapped to PRD §s. Once the parallel upgrade lands, the coverage matrix should match the per-§ pattern used in 02/04.

---

## Validation Performed

- Read all 16 PRDs (top-level headings; deep-read for sections cited as gaps).
- Read every `coverage.md` and `manifest.json` (where present).
- Sampled 5–10 task JSONs per module via category counts (`category` + keyword scan for `rls`, `outbox`, `audit`, `permissions.enum.ts`, `next-intl`, `cron`, `apps/worker`, `d365`, `gdpr`, `idempot`).
- Cross-checked 4 PRDs (00/01/02/09) sample task prototype paths against actual files under `prototypes/` — no broken refs.
- Read `_meta/decisions/*.md` (3 files) — all reflected in tasks except NPD T-006 `tenant_id` legacy.
- Read 1 of 23 `_meta/reviews/*.md` (final-wave-closeout) for follow-ups; closeout tasks T-053..T-061 are tracked in Foundation coverage.md Wave A section.
- Did **not** modify any task JSON.

## Notes / Caveats

- 5 modules (03/05/06/07/08) are being rewritten in parallel; only their PRDs, coverage.md, manifest.json, and a small sample of task JSONs were read. Per-task quality findings for those modules are limited.
- Quality module is treated as the worst-coverage P1 module despite having 36 tasks because (a) no coverage.md/manifest, (b) 2 of 5 epics un-atomized, (c) bad PRD §16.3 ref, (d) no permissions.enum / i18n / GDPR / cross_module_deps metadata.
- Modules 10–15 are listed as zero-tasks; their prototype-index files are populated (25–41 entries each) so decomposition is unblocked.
