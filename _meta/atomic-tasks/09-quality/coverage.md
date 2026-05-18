# 09-QUALITY Atomic Task Coverage

PRD: `docs/prd/09-QUALITY-PRD.md` (v3.0 2026-04-20 + gold-standard completion 2026-05-14)
Generated: 2026-05-14 by `gold-standard-completion-2026-05-14`

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **09-a** Hold/Release & Status | quality_holds + quality_hold_items + quality_status_types + qa_status_state_machine_v1 rule + hold CRUD/release/e-sign | T-001..T-016 (cross-module reference seeds T-001/T-002/T-003 + schema T-004/T-005 + APIs T-006/T-007/T-008 + audit T-009 + read APIs T-010 + outbox T-011 + UI cross-cut esign T-012 + dashboard T-013 + Holds UI T-014/T-015/T-016) |
| **09-b** Specifications & Test Parameters | quality_specifications + quality_spec_parameters + versioned approval + allergen profile snapshot | T-017..T-024 (schema T-017 + APIs T-018/T-019/T-020 + UI T-021/T-022/T-023/T-024) |
| **09-c** Incoming Inspection & Test Results | quality_inspections + quality_test_results + sampling_plans + scanner handoff + GRN consumer | T-025..T-036 (schema T-025/T-031 + APIs T-026/T-027/T-028/T-029 + GRN consumer T-030 + UI T-032/T-033/T-034/T-035/T-036) |
| **09-d** NCR (Non-Conformance Reports) | ncr_reports + Server Actions + dual-sign critical close + outbox + auto-create wiring + UI list/detail/create/close modals | T-037..T-046 (10 new 2026-05-14) |
| **09-e** HACCP + CCP + Incidents + Complaints + Allergen Gates | haccp_plans/ccps/monitoring_records + quality_incidents + quality_complaints + lab_results ATP extension + ccp_deviation_escalation_v1 DSL rule + APIs + outbox + seeds + UI haccp_plans/ccp_monitoring/ccp_deviations/allergen_gates + E2E wiring | T-047..T-062 (16 new 2026-05-14) |
| **09-cross** Cross-module contract pins | GRN→Quality event contract; WO/LP consume gate via v_active_holds | T-063, T-064 (2 new 2026-05-14) |

## Coverage table

| PRD § | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §6.3 quality_hold_reasons FK + §16.3 reference-table directive + §14.1 i18n + §5.1 BRCGS | tasks/T-001.json | 09-a | T1-schema | covered (refs tightened 2026-05-14) |
| §6.3 fail_reason_code_id + §8.1 SCN-072 + §16.3 + §11.2 V-QA-INSP-006 | tasks/T-002.json | 09-a | T1-schema | covered (refs tightened 2026-05-14) |
| §16.3 + §6.3 yield columns + §14.1 i18n | tasks/T-003.json | 09-a | T1-schema | covered (refs tightened 2026-05-14) |
| §6.3 quality_holds + §9.1 RLS + §13.1 RBAC | tasks/T-004.json | 09-a | T1-schema | covered |
| §6.3 quality_status_types + §10.1 qa_status_state_machine_v1 | tasks/T-005.json | 09-a | T5-seed | covered |
| §8.2 QA-012 + §11.1 V-QA-HOLD + §12.1 + §2.3 | tasks/T-006.json | 09-a | T2-api | covered |
| §5.3 signature + §11.1 V-QA-HOLD-005..007 + §13.2 e-sign + §12.1 outbox | tasks/T-007.json | 09-a | T2-api | covered |
| §10.1, §10.2 qa_status_state_machine_v1 | tasks/T-008.json | 09-a | T2-api | covered |
| §5.2, §9.1 RLS, §13.3 audit | tasks/T-009.json | 09-a | T1-schema | covered |
| §8.2 QA-010 + §9.2 v_active_holds | tasks/T-010.json | 09-a | T2-api | covered |
| §12.1 outbox | tasks/T-011.json | 09-a | T4-wiring-test | covered |
| §5.3 + §13.2 + §8.5 | tasks/T-012.json | 09-cross-cut e-sign | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-001 + §8.5 | tasks/T-013.json | 09-cross-cut Dashboard | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-010 + §8.5 | tasks/T-014.json | 09-a | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-012 + §8.5 | tasks/T-015.json | 09-a | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-011 + §8.3 QUA-101 + §8.5 | tasks/T-016.json | 09-a | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §6.3 quality_specifications + §9.1 + §11.3 | tasks/T-017.json | 09-b | T1-schema | covered |
| §7.1 + §11.3 V-QA-SPEC | tasks/T-018.json | 09-b | T2-api | covered |
| §5.3 + §11.3 + §13.2 | tasks/T-019.json | 09-b | T2-api | covered |
| §6.3 allergen snapshot + §10.3 consumer | tasks/T-020.json | 09-b | T2-api | covered |
| §8.2 QA-020 + §8.5 | tasks/T-021.json | 09-b | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-021 + §8.3 QUA-103 + §8.5 | tasks/T-022.json | 09-b | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.3 QUA-102 + §8.5 | tasks/T-023.json | 09-b | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §11.3 + §13.2 + §8.5 | tasks/T-024.json | 09-b | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §6.3 quality_inspections + §9.1 + §11.2 | tasks/T-025.json | 09-c | T1-schema | covered |
| §7.1 + §11.2 + §8.2 QA-031 | tasks/T-026.json | 09-c | T2-api | covered |
| §6.3 quality_test_results + §11.2 | tasks/T-027.json | 09-c | T2-api | covered |
| §11.2 V-QA-INSP-009 + §13.2 + §12.1 | tasks/T-028.json | 09-c | T2-api | covered |
| §7.1 + §8.1 SCN-070..073 scanner | tasks/T-029.json | 09-c | T2-api | covered |
| §12.1 + §7.1 09-c-05 | tasks/T-030.json | 09-c | T4-wiring-test | covered |
| §6.3 sampling_plans + §7.1 | tasks/T-031.json | 09-c | T1-schema | covered |
| §8.2 QA-030 + §8.5 | tasks/T-032.json | 09-c | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-031 + §8.3 QUA-104 + §8.5 | tasks/T-033.json | 09-c | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.5 templates | tasks/T-034.json | 09-c | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.2 QA-022 + §9.2 + §8.5 | tasks/T-035.json | 09-c | T3-ui | covered (ui_evidence_policy added 2026-05-14) |
| §8.3 QUA-111 + §8.5 | tasks/T-036.json | 09-c | T3-ui | covered (ui_evidence_policy added 2026-05-14) |

## Coverage rows (gold-standard re-author 2026-05-14)

### 09-d NCR (T-037..T-046, 10 new tasks)

| PRD § | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §6.3 ncr_reports + §9.1 + §11.4 + §13.3 | tasks/T-037.json | 09-d | T1-schema | added 2026-05-14 |
| §11.4 V-QA-NCR-001..007 + §5.3 + §7.1 + §13.2 | tasks/T-038.json | 09-d | T2-api | added 2026-05-14 |
| §5.3 + §13.2 + §13.3 ESignBlock primitive | tasks/T-039.json | 09-cross e-sign | T2-api | added 2026-05-14 |
| §12.1 + §13.3 + §7.1 quality.ncr.* outbox | tasks/T-040.json | 09-d | T4-wiring-test | added 2026-05-14 |
| §12.1 + §11.2 + §10.2 + §7.1 auto-create wiring | tasks/T-041.json | 09-d | T4-wiring-test | added 2026-05-14 |
| §16.3 + §8.3 QUA-105 + §11.4 rcCat seed | tasks/T-042.json | 09-d | T5-seed | added 2026-05-14 |
| §8.5 + §8.3 QUA-105 + §7.1 ncr_list UI | tasks/T-043.json | 09-d | T3-ui | added 2026-05-14 |
| §8.3 QUA-105 + §8.5 + §11.4 + §5.3 ncr_detail UI | tasks/T-044.json | 09-d | T3-ui | added 2026-05-14 |
| §11.4 + §5.3 + §8.5 ncr_create_modal | tasks/T-045.json | 09-d | T3-ui | added 2026-05-14 |
| §11.4 V-QA-NCR-005/006 + §5.3 + §13.2 + §8.5 ncr_close_modal | tasks/T-046.json | 09-d | T3-ui | added 2026-05-14 |

### 09-e HACCP + CCP + Incidents + Complaints + Allergen Gates (T-047..T-062, 16 new tasks)

| PRD § | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §6.3 haccp_* + §9.1 + §11.5 | tasks/T-047.json | 09-e | T1-schema | added 2026-05-14 |
| §6.3 quality_incidents + §9.1 + §11.6 | tasks/T-048.json | 09-e | T1-schema | added 2026-05-14 |
| §6.3 quality_complaints + §9.1 + §11.6 | tasks/T-049.json | 09-e | T1-schema | added 2026-05-14 |
| §6.3 lab_results ATP ext + §10.3 + §11.6 + §16.3 | tasks/T-050.json | 09-e (cross 08-PROD) | T1-schema | added 2026-05-14 |
| §11.5 V-QA-HACCP/CCP + §7.1 + §5.3 | tasks/T-051.json | 09-e | T2-api | added 2026-05-14 |
| §10.1 + §10.2 + §11.5 + §7.1 ccp_deviation_escalation_v1 rule | tasks/T-052.json | 09-e | T2-api | added 2026-05-14 |
| §11.6 V-QA-COMPLAINT + §7.1 + §12.1 | tasks/T-053.json | 09-e | T2-api | added 2026-05-14 |
| §11.6 V-QA-INCIDENT-001 + §7.1 + §12.1 | tasks/T-054.json | 09-e | T2-api | added 2026-05-14 |
| §11.6 V-QA-ALLERGEN-001/002 + §10.3 + §16.3 + §5.3 | tasks/T-055.json | 09-e (cross 08-PROD) | T2-api | added 2026-05-14 |
| §12.1 + §13.3 + §7.1 outbox/permissions consolidation | tasks/T-056.json | 09-e | T4-wiring-test | added 2026-05-14 |
| §16.3 + §7.1 + §6.3 HACCP demo seed | tasks/T-057.json | 09-e | T5-seed | added 2026-05-14 |
| §8.5 + §11.5 + §7.1 haccp_plans UI | tasks/T-058.json | 09-e | T3-ui | added 2026-05-14 |
| §8.5 + §11.5 + §7.1 ccp_monitoring UI | tasks/T-059.json | 09-e | T3-ui | added 2026-05-14 |
| §8.5 + §8.3 QUA-107 + §11.5 + §7.1 ccp_deviations UI | tasks/T-060.json | 09-e | T3-ui | added 2026-05-14 |
| §8.5 + §11.6 + §10.3 + §5.3 allergen_gates UI | tasks/T-061.json | 09-e | T3-ui | added 2026-05-14 |
| §10.2 + §11.5 + §11.6 + §12.1 E2E wiring | tasks/T-062.json | 09-e | T4-wiring-test | added 2026-05-14 |

### 09-cross Cross-module contract pins (T-063..T-064, 2 new tasks)

| PRD § | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §12.1 + §7.1 + §9.1 warehouse.grn.* event contract | tasks/T-063.json | 09-cross | T4-wiring-test | added 2026-05-14 |
| §9.2 v_active_holds + §12.1 + §9.1 consume-gate contract | tasks/T-064.json | 09-cross | T4-wiring-test | added 2026-05-14 |

## Prototype label coverage (32 labels indexed in prototype-index-quality.json)

| Prototype label | Covered by | Status |
|---|---|---|
| hold_create_modal | T-015 | covered |
| hold_release_modal | T-016 | covered |
| spec_sign_modal | T-024 | covered |
| template_create_modal | T-034 | covered |
| sample_draw_modal | T-033 | covered |
| ncr_create_modal | T-045 | **new 2026-05-14** |
| ncr_close_modal | T-046 | **new 2026-05-14** |
| ccp_reading_modal | T-059 (embedded in ccp_monitoring page) | **new 2026-05-14** |
| ccp_deviation_log_modal | T-060 (embedded in ccp_deviations page) | **new 2026-05-14** |
| esign_modal | T-012 + T-039 (primitive) | covered |
| allergen_dual_sign_modal | T-061 (embedded in allergen_gates page) | **new 2026-05-14** |
| audit_export_modal | (deferred to 09-cross Audit Trail page — out of this batch; existing T-009 covers backend) | partial |
| delete_with_reason_modal | (cross-screen primitive — partial via T-038 V-QA-NCR-005 draft-only delete; UI binding deferred) | partial |
| inspection_assign_modal | T-036 | covered |
| qa_dashboard | T-013 | covered |
| ncr_list | T-043 | **new 2026-05-14** |
| ncr_detail | T-044 | **new 2026-05-14** |
| incoming_inspection_list | T-032 | covered |
| inspection_detail | T-033 | covered |
| holds_list | T-014 | covered |
| hold_detail | T-016 | covered |
| specs_list | T-021 | covered |
| spec_wizard | T-022 | covered |
| spec_detail | T-023 | covered |
| haccp_plans | T-058 | **new 2026-05-14** |
| ccp_monitoring | T-059 | **new 2026-05-14** |
| ccp_deviations | T-060 | **new 2026-05-14** |
| allergen_gates | T-061 | **new 2026-05-14** |
| qa_templates | T-034 | covered |
| sampling_plans | T-035 | covered |
| audit_trail | (deferred — backend §13.3 audit covered by T-009 + per-action audit rows; dedicated audit_trail page is post-P1 follow-up) | partial |
| qa_settings | (deferred — admin tab page is post-P1 follow-up; tenant_settings.quality_regulations + ccp_escalation_delay_minutes already pinned by §16.3 / §10.2 rule defs) | partial |

**Result: All 6 previously uncovered labels flagged by audit B §2 (ncr_list, ncr_detail, haccp_plans, ccp_monitoring, ccp_deviations, allergen_gates) are now covered.**

## Notes

- **Refs corrected 2026-05-14:** T-001/T-002/T-003 prd_refs were tightened. The audit A claim that §16.3 does not exist is inaccurate — §16.3 "Cross-PRD consistency impact" (PRD line 1824) DOES exist and explicitly lists `quality_hold_reasons`, `qa_failure_reasons`, `waste_categories` as the 3 reference tables migrated from hardcoded. The fix was to: (a) keep §16.3 (verified anchor), (b) add §5.1 / §6.3 / §11.2 / §14.1 supporting refs for compliance / FK consumer / V-QA-INSP-006 / i18n provenance, (c) replace the lossy `§8 SCN-072` citation in T-002 with the precise `§8.1` (the scanner table containing the SCN-072 row). Each fix is documented in the task's `details` field under "PRD anchor verification (gold-standard 2026-05-14)".
- **ui_evidence_policy:** 14 T3-ui tasks (T-012, T-013, T-014, T-015, T-016, T-021, T-022, T-023, T-024, T-032, T-033, T-034, T-035, T-036) had `prototype_match: true` but were missing `ui_evidence_policy` — added pointing to `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
- **Tenant context:** All new tasks use `app.current_org_id()` function-form RLS per Wave0 v4.3 lock (audit B §4.2 finding). GUC reads `current_setting('app.current_org_id')` are explicitly forbidden in risk_red_lines.
- **Permissions canonical surface:** `packages/rbac/src/permissions.enum.ts` is the single source of truth for `quality.*` permission strings (audit B §3 red-line lift). 09-d adds 8 quality.ncr.*; 09-e adds 18+ quality.{haccp,ccp,complaint,incident,allergen_gate}.*.
- **E-signature primitive (T-039):** Lifts 5 translation-notes-quality red-lines into a single audited surface: shared ESignBlock Server Component, PBKDF2 PIN verify Server Action, dual-sign distinct-session enforcement, server-computed signature_hash, server-driven verified state. BL-QA-06 (virtual numeric keypad anti-keylogger) is documented medium-prio follow-up — NOT in this batch.
- **NCR auto-create single audit path (T-041):** All 3 NCR creation paths (GRN-fail consumer, inspection-fail-on-sign, CCP deviation via rule) route through the shared `createNcrDraft` Server Action (T-038) — never direct DB INSERTs. Single audit + outbox path enforced.
- **Cross-module contract pins (T-063, T-064):** Audit A §1 cross-module event contract requirement satisfied. `packages/events/src/warehouse/grn.ts` pins warehouse.grn.* events; `packages/server/src/quality/holdsGuard.ts` + `v_active_holds` view pin the WO/LP consume-gate contract. 05-WH/08-PROD module implementation is OUT-OF-SCOPE — those modules import the pinned contracts.
- **09-d Epic 8D scope (NCR Basic) vs P2 Epic 8G (CAPA workflow):** §8.3 QUA-105 promotes NCR detail/close (read + close + critical dual-sign) to P1. Full CAPA workflow remains P2 — BL-QA-01 referenced in T-044 (CAPA placeholder card with `data-state="disabled"` + `opacity-50`).
- **Retention:** ncr_reports 10y (§6.3); haccp_monitoring_records 5y; quality_complaints 7y (BRCGS §3.11.1); quality_holds 7y; quality_inspections 7y; quality_incidents 10y. All retention_until GENERATED columns at the schema layer.
- **Audit log surface (T-009):** Quality module audit log is already in place. New Server Actions (T-038/T-051/T-053/T-054/T-055) emit audit rows via the same surface; e-signatures may live in either an extension of T-009 quality_audit_log or a dedicated esignatures table per T-039 decision.
- **Partial indexes:** idx_holds_active (T-004) + idx_ncr_open (T-037) + idx_haccp_mon_violations (T-047) + idx_complaint_open (T-049) are partial — assert via EXPLAIN in their schema tests.
- **Out of scope for this batch:** audit_trail dedicated page, qa_settings admin tabs page, delete_with_reason_modal cross-screen UI surface, virtual numeric keypad (BL-QA-06), batch_release_gate_v1 (P2 Epic 8F), CAPA workflow (P2 Epic 8G), HACCP IoT (P2 Epic 8I), CoA (P2 Epic 8J), Supplier Quality (P2 Epic 8K), full Dashboard analytics + retention jobs (P2 Epic 8L).

## Permission-enum reconciliation 2026-05-14

| PRD § | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §2.3 RBAC matrix + §6.4 NCR + §6.5 HACCP + §8 QA-031A + §8 QA-060 + §2.2 auditor export | tasks/T-065.json | 09-cross-rbac | T1-schema | added 2026-05-14 (F10 reconciliation) |

**F10 reconciliation note:** Wave1 Pt4 (`_meta/audits/2026-05-14-permission-enum-addition.md`) claimed to place the 09-quality perm-enum task at T-037, but T-037 was already the `ncr_reports schema` task created by Wave1 Pt3. The perm-enum task did NOT physically exist in the 09-quality tasks directory. F10 created it at T-065 (next free slot after T-064). 02-settings T-130 `cross_module_dependencies` updated from T-037 to T-065.
