# 11-SHIPPING Bootstrap Report

Date: 2026-05-14
Author: Atomic-task bootstrap agent (Opus)
Trigger: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §6 11-SHIPPING (10 priority slices SHP-001..010)
Prior state: 0 tasks, no `manifest.json`, no `coverage.md`.
Final state: 32 tasks T-001..T-032 + `manifest.json` + `coverage.md`.

## Output summary

| Item | Value |
|---|---|
| Total tasks created | **32** (T-001..T-032) |
| Sub-modules | 11 (11-shipping-a through 11-shipping-k) |
| Schema tasks (T1) | 7 (T-001, T-006, T-011, T-015, T-018 + schema portions of T-026, T-027, T-029) |
| Server Action tasks (T2) | 11 (T-002, T-007, T-012, T-013, T-016, T-019, T-020, T-023, T-025-SA, T-026-SA, T-027, T-029-dispatcher, T-031-permissions) |
| UI tasks (T3) | 14 (T-003, T-004, T-005, T-008, T-009, T-010, T-014, T-017, T-021, T-022, T-024, T-025-UI, T-026-UI, T-028, T-030) |
| E2E task (T4) | 1 (T-032) |
| Tasks with prototype_match=true | 15 |
| p0-blocker | T-031 (priority 90, `p0-blocker` label) |
| PRD anchors cited | §1..§19 (all real §X.Y headings verified in `docs/prd/11-SHIPPING-PRD.md`) |
| Prototype line ranges cited | sourced from `_meta/prototype-labels/prototype-index-shipping.json` (38 indexed entries) |

## Sub-module map

| Code | Title | Tasks |
|---|---|---:|
| 11-shipping-a | Customer domain (customers + contacts + addresses + allergen restrictions) | 5 |
| 11-shipping-b | Sales Orders (schema + status machine + wizard + list + detail) | 5 |
| 11-shipping-c | Allocation + Quality Hold gate (D-SHP-13) | 4 |
| 11-shipping-d | Pick + Wave (schema + APIs + UI) | 3 |
| 11-shipping-e | Pack + SSCC-18 + Ship confirm | 5 |
| 11-shipping-f | Documents (packing slip + BOL + POD) + BRCGS 7y retention | 3 |
| 11-shipping-g | RMA Phase 1 | 1 |
| 11-shipping-h | Carriers + Shipping Settings | 2 |
| 11-shipping-i | INTEGRATIONS Stage 3 D365 SalesOrder Confirm Push | 1 |
| 11-shipping-j | Dashboard + E2E spine | 2 |
| 11-shipping-k | Permissions enum delta (p0-blocker) | 1 |

## Auditor A priority-slice mapping

| Auditor A slice | Mapped tasks |
|---|---|
| SHP-001 customers/addresses/allergen restrictions | T-001, T-002, T-003, T-004, T-005 |
| SHP-002 sales_orders / so_lines / so_allocations | T-006, T-007, T-008, T-009, T-010, T-011, T-012 |
| SHP-003 shipments / cartons / SSCC-18 | T-018, T-019, T-020, T-021, T-022 |
| SHP-004 Pick wave APIs | T-015, T-016, T-017 |
| SHP-005 Pack/Ship APIs (carton close, BOL, packing slip) | T-019, T-020, T-021, T-022, T-023, T-024 |
| SHP-006 RMA flow | T-026 |
| SHP-007 D365 SalesOrder confirm push dispatcher | T-029 |
| SHP-008 dashboard + so_list + so_detail UI | T-009, T-010, T-030 |
| SHP-009 Quality Hold integration (D-SHP-13) | T-013 + consumed by T-007, T-012, T-016, T-020 |
| SHP-010 Permissions enum delta | T-031 (the p0-blocker) |

## P0-blocker list

- **T-031** — Append 14 `ship.*` permission strings to `packages/rbac/src/permissions.enum.ts` (priority 90, label `p0-blocker`). Without this task GREEN every Server Action task fails the ESLint enum-lock guard from 02-settings T-046.

## Cross-module dependencies declared

- **00-foundation**: T-040 (audit_events R13), T-051 (D365 export-only posture), T-111 (apps/worker JobRegistry), T-112 (@monopilot/outbox), T-113 (@monopilot/gdpr registry), T-116 (OpenTelemetry), T-117 (pino redact), T-121 (@monopilot/rate-limit), T-123 (Playwright harness), T-124 (@monopilot/e-sign), T-125 (withOrgContext + app.current_org_id()).
- **01-npd**: T-001 (product FG SSOT — `sales_order_lines.product_id`, allergen cascade, variance_tolerance_pct).
- **02-settings**: allergen_families ref table, reason_codes ref table, organizations.gs1_company_prefix, printers + packing_stations, tenant L2 config infra (shipping_config UPSERT), D365_Constants.
- **05-warehouse**: T-002 (license_plates), T-013 (transition_lp DSL), create_lp Server Action (RMA restock).
- **06-scanner-p1**: operator role model, scan_event_id session contract (V-SHIP-PICK-01), SHIP-015 / SHIP-018 owned by scanner module.
- **08-production**: outbox_status_enum (shared ENUM).
- **09-quality**: T-010 (v_active_holds), T-011 (audit consumer of shipping.quality_hold.overridden), create_hold action.
- **10-finance**: future P2 invoicing/credit-note consumer of shipping.shipment.delivered + shipping.rma.processed.

## Shipping domain red-lines enforced

1. **SSCC label numbering**: GS1 prefix sourced from `organizations.gs1_company_prefix` (02-SETTINGS §12.1); per-org atomic `sscc_counters` (T-018) guarantees V-SHIP-PACK-04 no-gaps; mod-10 server-side only (V-SHIP-LBL-03).
2. **Pallet/load building**: pack-station workbench (T-021) computes carton totals server-side; V-SHIP-PACK-01 (≥1 content per box) + V-SHIP-PACK-04 (variance) enforced in T-020.
3. **Carrier integration export-only**: T-027 + T-029 — carriers are config-only in P1; D365 dispatcher R15 adapter strictly export-only (no factory_release_state).
4. **Proof-of-delivery audit**: T-025 (POD upload modal NEW per BL-SHIP-01 fix) + SHA-256 + 7y retention parallel to BOL pattern.
5. **Lot/expiry traceability**: shipment_box_contents references license_plate_id + lot_number; FEFO sort by expiry_date (T-011 v_fefo_lp_candidates).
6. **Customs/HS-code**: optional fields surfaced in shipping_config (T-028); HAZMAT + EUDR P2 toggles disabled (BL-SHIP-13).
7. **Shared BOM SSOT**: `sales_order_lines.product_id` references NPD `product` table (FG SSOT); no parallel `fa_id` (T-006 risk red-line + audit `_meta/audits/2026-05-14-tenant-context-remediation.md` decision).

## Gold-standard exemplar conformance

All 32 task JSONs follow the 02-settings T-001 / 01-npd T-052 patterns:
- `title`: `T-XXX — <short imperative goal> (<PRD-anchor>)`
- `prompt`: Goal / Implementation contract / Files / AC Given-When-Then / Test strategy RED-first / Risk red lines / `## Prototype parity` (UI tasks) citing `prototypes/design/Monopilot Design System/shipping/<file>.jsx:<start>-<end>` from the prototype index.
- `priority`: 50 (schema/RED-base), 70 (server actions + UI), 90 (T-031 p0-blocker permission enum).
- `max_attempts: 3`, `pipeline_name: "kira_dev"`.
- `pipeline_inputs` full set: `root_path`, `prd_task_id`, `source_prd`, `prd_refs`, `category`, `subcategory`, `task_type`, `parent_feature`, `context_budget`, `estimated_effort`, `description`, `details`, `scope_files`, `out_of_scope`, `dependencies`, `parallel_safe_with`, `cross_module_dependencies`, `acceptance_criteria`, `test_strategy`, `risk_red_lines`, `skills`, `checkpoint_policy` (RED/GREEN/REVIEW/CLOSEOUT), `routing_hints`.
- UI tasks: `prototype_match: true` + `prototype_index_entry` + `ui_evidence_policy: "_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md"`.
- Skills baseline: `test-driven-development` + `requesting-code-review`; +`frontend-design` on UI tasks; +`systematic-debugging` on T1-schema/T2-api tasks with migration or concurrency risk.

## Validation performed

- Read full PRD (`docs/prd/11-SHIPPING-PRD.md`, 1603 lines) and verified all cited §X.Y headings against real PRD sections.
- Read full UX (`prototypes/design/11-SHIPPING-UX.md`, 1575 lines) for SHIP-* screens.
- Read prototype-index-shipping.json (38 indexed entries) and translation-notes-shipping.md (250 lines) for V-SHIP-* / known bugs / domain red-lines / SH_* mock-to-Drizzle mapping.
- Read 4 gold-standard exemplars (`01-npd/T-001.json`, `01-npd/T-052.json`, `02-settings/T-001.json`, `02-settings/T-041.json`) for shape conformance.
- Read 1 manifest exemplar (`01-npd/manifest.json`) and 1 coverage exemplar (`01-npd/coverage.md`).
- Read 4 audit artifacts: `2026-05-14-prd-vs-tasks-coverage-gaps.md` (Auditor A — 10 priority slices), `2026-05-14-foundation-primitives-additions.md` (T-111..T-124 + T-125 contracts), `2026-05-14-tenant-context-remediation.md` (org_id / app.current_org_id() canonical), `2026-05-14-permission-enum-addition.md` (per-module permission task pattern → T-031).
- JSON-validated all 32 task files individually with `python3 -c "import json; json.load(open(p))"` — all pass.
- Verified `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md` exists and is referenced from 15 UI tasks.

## Deviations from PRD

- §9.3 PRD wrote `tenant_id UUID` for shipping_outbox_events; per `_meta/audits/2026-05-14-tenant-context-remediation.md` Wave0 v4.3 lock the canonical column name is `org_id`. T-029 documents this rename as a known PRD-vs-task deviation and asserts `org_id` for RLS contracts via `app.current_org_id()`.

## Path to this report

- `_meta/atomic-tasks/11-shipping/BOOTSTRAP-REPORT-2026-05-14.md` (this file)
- `_meta/atomic-tasks/11-shipping/manifest.json`
- `_meta/atomic-tasks/11-shipping/coverage.md`
- `_meta/atomic-tasks/11-shipping/tasks/T-001.json` .. `T-032.json` (32 files)
