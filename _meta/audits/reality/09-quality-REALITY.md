# 09-quality — Reality Audit (2026-06-02)

## Counts
- task files: 65 | manifest task_count: 65 | STATUS rows: 0 (no STATUS.md existed)
- reconciliation: files == manifest, perfect match. No STATUS.md exists — this audit creates it.

## Task reality

| Task | Title (abbrev) | Type | Verdict | Evidence (path) | Gap / note |
|---|---|---|---|---|---|
| T-001 | quality_hold_reasons ref table | T1-schema | ⛔ MISSING | `packages/db/migrations/0090_quality_hold_reasons_reftable.sql` absent; `apps/web/src/server/quality/holdReasons.ts` absent | Migration, server helper, test all absent. Only partial seed in `packages/db/seeds/reference-schemas.sql` (schema column row, not the 0090 migration) |
| T-002 | qa_failure_reasons ref table | T1-schema | ⛔ MISSING | `packages/db/migrations/0091_qa_failure_reasons_reftable.sql` absent | Seed reference-schemas.sql has column row entry, but no dedicated migration or server helper |
| T-003 | waste_categories ref table | T1-schema | ⛔ MISSING | `packages/db/migrations/0092_waste_categories_reftable.sql` absent | No migration, no server helper |
| T-004 | quality_holds + quality_hold_items schema + RLS | T1-schema | ⛔ MISSING | `packages/db/migrations/0100_quality_holds.sql` absent; `packages/db/src/schema/qualityHolds.ts` absent | No schema, no Drizzle types, no RLS policy |
| T-005 | quality_status_types + 7-row seed | T5-seed | ⛔ MISSING | No migration `0101_quality_status_types.sql`; no seed file | Table and seed absent |
| T-006 | Hold create Server Action | T2-api | ⛔ MISSING | `apps/web/src/server/quality/createHold.ts` absent | No Server Action; `apps/web/src/` does not exist at all |
| T-007 | Hold release Server Action + e-signature | T2-api | ⛔ MISSING | `apps/web/src/server/quality/releaseHold.ts` absent | Same — `apps/web/src/` path entirely absent |
| T-008 | qa_status_state_machine_v1 DSL rule | T2-api | ⛔ MISSING | `packages/db/migrations/0102_qa_status_rule.sql` absent | Rule not registered |
| T-009 | quality_audit_log + audit triggers | T1-schema | ⛔ MISSING | `packages/db/migrations/0103_quality_audit_log.sql` absent | No audit log table for quality |
| T-010 | Hold list/read API + v_active_holds view | T2-api | ⛔ MISSING | `packages/db/migrations/0104_v_active_holds.sql` absent; `apps/web/src/server/quality/queryHolds.ts` absent | View and query helper absent |
| T-011 | Outbox publisher quality.hold.* events | T4-wiring-test | ⛔ MISSING | No quality outbox publishers found in `apps/web/` | No `quality.hold.*` event strings in codebase |
| T-012 | esign_modal primitive (EsignBlock) | T3-ui | ⛔ MISSING | `apps/web/src/components/quality/EsignBlock.tsx` absent; `packages/ui/src/quality/` absent | No ESignBlock component anywhere |
| T-013 | QA-001 Quality Dashboard | T3-ui | 🟡 STUB | `apps/web/app/[locale]/(app)/(modules)/quality/page.tsx` exists | Page is a Wave-0 skeleton landing (calls `getModuleCount("quality_event")`); no 6-widget grid, no holds/NCR/HACCP widgets, no real quality tables, no prototype parity evidence |
| T-014 | QA-010 Holds list page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/holds/page.tsx` absent | `apps/web/src/` directory does not exist |
| T-015 | QA-012 hold_create_modal | T3-ui | ⛔ MISSING | `apps/web/src/components/quality/holds/HoldCreateModal.tsx` absent | |
| T-016 | QA-011 hold detail + hold_release_modal | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/holds/[id]/page.tsx` absent | |
| T-017 | quality_specifications + quality_spec_parameters schema | T1-schema | ⛔ MISSING | `packages/db/migrations/0110_quality_specifications.sql` absent | No schema files |
| T-018 | Spec CRUD + version clone Server Actions | T2-api | ⛔ MISSING | `apps/web/src/server/quality/specs.ts` absent | |
| T-019 | Spec approval flow (e-signature + supersede) | T2-api | ⛔ MISSING | `apps/web/src/server/quality/approveSpec.ts` absent | |
| T-020 | Allergen profile snapshot at spec activation | T2-api | ⛔ MISSING | `apps/web/src/server/quality/snapshotAllergenProfile.ts` absent | |
| T-021 | QA-020 specs_list page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/specs/page.tsx` absent | |
| T-022 | QA-021 spec wizard (3-step) + edit mode | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/specs/new/page.tsx` absent | |
| T-023 | QA-003b spec detail page (read-only) | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/specs/[id]/page.tsx` absent | |
| T-024 | spec_sign_modal | T3-ui | ⛔ MISSING | `apps/web/src/components/quality/specs/SpecSignModal.tsx` absent | |
| T-025 | quality_inspections + quality_test_results schema | T1-schema | ⛔ MISSING | `packages/db/migrations/0120_quality_inspections.sql` absent | |
| T-026 | Inspection lifecycle Server Actions | T2-api | ⛔ MISSING | `apps/web/src/server/quality/inspections.ts` absent | |
| T-027 | Test result recording + auto pass/fail | T2-api | ⛔ MISSING | `apps/web/src/server/quality/recordTestResult.ts` absent | |
| T-028 | Inspection sign + auto-NCR draft on fail | T2-api | ⛔ MISSING | `apps/web/src/server/quality/signInspection.ts` absent | |
| T-029 | Scanner inspect API routes | T2-api | ⛔ MISSING | `apps/web/src/app/api/quality/scanner/` absent | `apps/web/src/` entirely absent |
| T-030 | GRN outbox consumer → auto-create incoming inspection | T4-wiring-test | ⛔ MISSING | No consumer code found | |
| T-031 | sampling_plans + sampling_records schema + AQL ISO | T1-schema | ⛔ MISSING | `packages/db/migrations/0121_sampling_plans.sql` absent | |
| T-032 | QA-030 incoming inspection list | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/inspections/incoming/page.tsx` absent | |
| T-033 | QA-031 inspection_detail page + sample_draw_modal | T3-ui | ⛔ MISSING | absent | |
| T-034 | QA-004 Test Templates page + template_create_modal | T3-ui | ⛔ MISSING | `packages/db/migrations/0122_quality_test_templates.sql` absent | |
| T-035 | QA-022 Sampling plans config page | T3-ui | ⛔ MISSING | `packages/db/migrations/0123_v_inspection_backlog.sql` absent | |
| T-036 | inspection_assign_modal | T3-ui | ⛔ MISSING | `apps/web/src/components/quality/inspections/InspectionAssignModal.tsx` absent | |
| T-037 | ncr_reports schema + RLS + retention | T1-schema | ⛔ MISSING | `packages/db/migrations/0130_ncr_reports.sql` absent; `packages/db/src/schema/ncrReports.ts` absent | |
| T-038 | NCR Server Actions | T2-api | ⛔ MISSING | `apps/web/src/server/quality/ncr/actions.ts` absent | |
| T-039 | ESignBlock shared Server Component + dual-sign | T2-api | ⛔ MISSING | `packages/ui/src/quality/ESignBlock.tsx` absent | `packages/ui/src/quality/` directory absent |
| T-040 | NCR outbox events + permission strings | T4-wiring-test | ⛔ MISSING | No `quality.ncr.*` event strings found in codebase | |
| T-041 | NCR auto-creation wiring (GRN-fail / inspection-fail) | T4-wiring-test | ⛔ MISSING | No wiring code found | |
| T-042 | ncr_root_cause_categories reference table seed | T5-seed | ⛔ MISSING | No migration `0131_ncr_root_cause_categories.sql` | |
| T-043 | QA-009 ncr_list page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/ncr/page.tsx` absent | |
| T-044 | QA-009a ncr_detail page + ncr_close_modal | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/ncr/[id]/page.tsx` absent | |
| T-045 | ncr_create_modal | T3-ui | ⛔ MISSING | `packages/ui/src/quality/NcrCreateModal.tsx` absent | |
| T-046 | ncr_close_modal | T3-ui | ⛔ MISSING | `packages/ui/src/quality/NcrCloseModal.tsx` absent | |
| T-047 | HACCP schema (haccp_plans + haccp_ccps + monitoring) | T1-schema | ⛔ MISSING | `packages/db/migrations/0140_haccp_tables.sql` absent | |
| T-048 | quality_incidents schema + RLS | T1-schema | ⛔ MISSING | `packages/db/migrations/0141_quality_incidents.sql` absent | |
| T-049 | quality_complaints schema + RLS | T1-schema | ⛔ MISSING | `packages/db/migrations/0142_quality_complaints.sql` absent | |
| T-050 | allergen_changeover_validations FK + lab_results ATP | T1-schema | ⛔ MISSING | `packages/db/migrations/0143_lab_results_atp_extension.sql` absent | |
| T-051 | HACCP CRUD APIs | T2-api | ⛔ MISSING | `apps/web/src/server/quality/haccp/actions.ts` absent | |
| T-052 | ccp_deviation_escalation_v1 DSL rule | T2-api | ⛔ MISSING | `packages/db/migrations/0144_ccp_deviation_escalation_v1.sql` absent | |
| T-053 | Complaint intake API + NCR link | T2-api | ⛔ MISSING | `apps/web/src/server/quality/complaint/actions.ts` absent | |
| T-054 | Incident intake API + 24h corrective-action enforcement | T2-api | ⛔ MISSING | `apps/web/src/server/quality/incident/actions.ts` absent | |
| T-055 | Allergen gate second-sign Server Action | T2-api | ⛔ MISSING | `apps/web/src/server/quality/allergenGates/signActions.ts` absent | |
| T-056 | quality.haccp.* / quality.ccp.* / quality.complaint.* outbox | T4-wiring-test | ⛔ MISSING | No event publishers found | |
| T-057 | Seed: ccp_hazard_classifications + sample HACCP plan | T5-seed | ⛔ MISSING | No migration `0146_ccp_hazard_classifications_seed.sql` | |
| T-058 | QA-050 haccp_plans page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/haccp/page.tsx` absent | |
| T-059 | QA-051 ccp_monitoring page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/ccp/page.tsx` absent | |
| T-060 | QA-015 ccp_deviations page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/ccp/deviations/page.tsx` absent | |
| T-061 | QA-016 allergen_gates page | T3-ui | ⛔ MISSING | `apps/web/src/app/quality/allergen-gates/page.tsx` absent | |
| T-062 | E2E pipeline: HACCP plan → CCP tick → deviation → NCR | T4-wiring-test | ⛔ MISSING | No E2E spec found | |
| T-063 | Cross-module contract pin: warehouse.grn.* → quality | T4-wiring-test | ⛔ MISSING | No contract test found | |
| T-064 | Cross-module contract pin: 08-PROD WO consume gate on v_active_holds | T4-wiring-test | ⛔ MISSING | `packages/server/src/quality/holdsGuard.ts` absent; `packages/server/` does not exist | Note: `apps/web/` scope files reference `apps/web/src/` which does not exist in repo |
| T-065 | Add quality permission strings to RBAC enum | T1-schema | ⛔ MISSING | `packages/rbac/src/permissions.enum.ts` exists but contains zero `quality.*` entries; no `QUALITY_HOLD_*`, `QUALITY_SPEC_*`, `QUALITY_NCR_*`, etc. | File exists but task not done |

## Phantom / carry-forward backlog
- None identified — all 65 tasks have files; no carry-forward notes from a prior STATUS.md
- Partial credit: `quality_hold_reasons` and `qa_failure_reasons` appear in `packages/db/seeds/reference-schemas.sql` (column schema definitions) but this predates and does not satisfy T-001/T-002 (which require dedicated migration 0090/0091 + server helper)

## Extra (code without a task)
- `apps/web/app/[locale]/(app)/(modules)/quality/page.tsx` — Wave-0 skeleton landing page. No owning task in 09-quality task list (belongs to 00-foundation Walking Skeleton, Wave 0). Queries `quality_event` table (R13 placeholder, not quality module tables).
- `apps/web/app/[locale]/(app)/(admin)/settings/quality/` — RequireGrnQcToggle component + setRequireGrnQcInspection action + tests. These are 02-SETTINGS extension code; may map to a 02-settings task, not any 09-quality task. Review: likely 🧩 EXTRA against 09-quality scope.
- `e2e/parity-evidence/shell/en-quality.png` — screenshot of the quality landing page shell. Evidence for the Wave-0 skeleton only, not for any T3-ui quality task.

## Top integration risks
1. **T-064 WO consume gate (quality_holds guard for 08-production)** — zero implementation exists. 08-production WO consume flow will proceed without checking active holds, breaking the hold-gate contract. This is a live safety/compliance risk once Wave 1 production features land.
2. **T-001/T-004 dependency chain blocks 64/65 tasks** — quality_hold_reasons (T-001) and quality_holds schema (T-004) are the foundation for the entire 09-a sub-module (T-006 through T-016) and are also cross-module dependencies for 05-warehouse and 08-production. Nothing downstream can start until these exist.
3. **apps/web/src/ directory does not exist** — all T2-api and T3-ui tasks declare scope_files under `apps/web/src/server/quality/` and `apps/web/src/app/quality/` which is a non-existent path. The actual app uses `apps/web/app/[locale]/(app)/(modules)/quality/`. Every scope_file path in 09-quality for T2-api and T3-ui tasks targets the wrong directory and will need path correction before implementation.

## Skeleton contribution
- The Wave-0 skeleton already placed a quality module landing page at `apps/web/app/[locale]/(app)/(modules)/quality/page.tsx` that queries `quality_event` (R13 placeholder) and renders a live Supabase record count. Navigation to the quality module works.
- Zero quality-domain tables (holds, specs, inspections, NCR, HACCP, incidents, complaints) exist in the DB. The landing page's `quality_event` table is a Wave-0 placeholder with no business columns.
- No quality permission strings exist in RBAC — no RBAC gating is possible for any quality-domain action until T-065 is done.
- Prototype files exist: `prototypes/design/Monopilot Design System/quality/` has 13 JSX/HTML/CSS files covering all sub-modules. These are ready references for T3-ui parity work.
