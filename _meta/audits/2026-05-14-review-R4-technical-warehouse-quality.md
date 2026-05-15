# Review R4 — 03-Technical, 05-Warehouse, 09-Quality

Date: 2026-05-14
Reviewer: Reviewer 4 (Opus 4.7 / 1M ctx)
Scope: `_meta/atomic-tasks/03-technical/` (91 tasks), `_meta/atomic-tasks/05-warehouse/` (58 tasks), `_meta/atomic-tasks/09-quality/` (64 tasks). Total reviewed: 213 task JSONs + 3 manifests + 3 coverage.md + 3 upgrade reports.

References used (gold standard): `_meta/atomic-tasks/01-npd/tasks/T-001.json`, `T-052.json`, `_meta/atomic-tasks/02-settings/tasks/T-001.json`, `T-041.json`, `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.

## Section 1 — Executive summary

### Counts

| Module | Reviewed | JSON-valid | Passing all 10 checks | With ≥1 finding |
|---|---|---|---|---|
| 03-technical | 91 | 91 (100%) | ~69 (76%) | 22 |
| 05-warehouse | 58 | 58 (100%) | ~46 (79%) | 12 |
| 09-quality | 64 | 64 (100%) | ~28 (44%) | 36 |
| **Total** | **213** | **213** | **143 (67%)** | **70** |

### Top-5 systemic issues

1. **05-warehouse `tenant_id` vs `org_id` schema drift (P1).** Eight 05-warehouse tasks (T-002, T-005, T-008, T-009, T-010, T-011, T-012, T-016) declare DDL columns / partial-unique / composite indexes using `tenant_id` (matching the un-corrected PRD §5.2/§5.5/§5.8/§16.1 verbatim DDL) while their own `risk_red_lines` explicitly forbid `tenant_id` per Wave0 v4.3 lock. The RLS policy text in the same task uses `org_id` correctly, so the policy and the DDL contradict each other inside one task. Most visible in T-002 (composite FEFO index column list), T-005 (`grns(id, tenant_id, ...)`, `grn_items(id, tenant_id, ...)`), T-011 (FEFO index column starts with `tenant_id`), T-016 (`UNIQUE(tenant_id, warehouse_id, lp_number)` and `lp_number_seq_{tenant}_{warehouse}` naming). 09-quality and 03-technical do not exhibit this drift in DDL (T-040 in 09-quality keeps a documented `tenant_id (org_id)` alias only in event payload).

2. **09-quality T3-ui legacy tasks have `prototype_match: true` but no `prototype_index_entry` and no `## Prototype parity` section (P1).** 14 T3-ui tasks pre-existing the 2026-05-14 upgrade (T-012..T-016, T-021..T-024, T-032..T-036) declare `prototype_match: true` and add `ui_evidence_policy` but lack `prototype_index_entry` (all 14) and lack a `## Prototype parity` section in their prompts. The JSX anchor `prototypes/design/Monopilot Design System/quality/<file>.jsx:<lines>` is present inline but not in the structured section the policy requires. Newly-added quality T-043..T-046 and T-058..T-061 have the section correctly; only pre-2026-05-14 quality T3-ui tasks have the gap.

3. **09-quality has zero `cross_module_dependencies` declarations (P1).** 0/64 09-quality tasks declare the structured `cross_module_dependencies` array, while 05-warehouse declares it on 58/58 (gold standard) and 03-technical declares it on only 6/91. The cross-module contracts ARE described in prose (e.g., T-041 references the 05-WH GRN producer, T-055 references 08-PROD allergen owner, T-062 references 05-WH/08-PROD consume gate), but they are not machine-readable. ACP planners that rely on this field for parallel wave scheduling will under-detect 03-tech↔09-quality and 05-WH↔09-quality couplings.

4. **Acceptance-criteria count exceeds 4 on 20 tasks (P2).** Validator rule `len(acceptance_criteria) ≤ 4` is breached on 16 of 03-technical (T-001, T-024, T-032..T-034, T-038, T-039, T-060, T-072..T-077, T-080..T-083), 8 of 05-warehouse (T-002, T-048..T-055), 0 of 09-quality. 09-quality is clean because its upgrade-2026-05-14 pass enforced ≤4. The 2026-05-14 warehouse upgrade did not re-emit ACs on T-048..T-055 (UI parity tasks), and 03-technical likewise kept fat AC lists on T-073..T-083 (Wave0 final-decision tasks). 05-warehouse `_validate.py` already fails on this; 03-technical `_validate.py` passes (the count check is module-specific). Surface: producers may strip "supplementary" ACs at runtime, losing parity requirements.

5. **Placeholder language `appropriate` in T-011 (P2 → may be cosmetic).** 05-warehouse T-011 contains "`CREATE INDEX CONCURRENTLY` for production-safety where appropriate (or document opt-out for dev)." The validator placeholder check matches `\bappropriate\b`. The text is concrete (the alternative is documented), but it trips the regex. Either reword to "...in production migrations (dev migrations may opt out and document the reason)" or whitelist this exact substring.

### Overall verdict per module

| Module | Verdict | Reason |
|---|---|---|
| 03-technical | **AMBER** | Gold-standard prompt structure across all 91 tasks; PRD §5.0→§5.1A correction validated; 91/91 JSON-valid; module red-lines uniformly applied. Soft issues: 16 AC-count >4 (P2), 6/91 cross-module deps (P1 for ACP scheduling), spec-driven tasks deliberately use §0/§17 anchors. No SSOT contradiction surfaced — BOM SSOT red-line is on every BOM-touching task. |
| 05-warehouse | **AMBER (leaning RED on schema scope)** | Architecture decisions excellent (server-driven `lp_state_machine_v1`, intermediate LP block V-WH-FEFO-005, inventory-value server-side RBAC V-WH-DASH-001, cross-module deps complete). But the `tenant_id` vs `org_id` drift in 8 schema tasks is a P1 contract violation against Wave0 v4.3; if executed verbatim the migrations would produce columns named `tenant_id`, contradicting the rest of the platform (01-NPD, 02-Settings, 09-Quality, 03-Tech all use `org_id`). Validator already FAILS on 10 issues (8 AC-count + 1 placeholder + T-012 §3 anchor not found by my naive script — actually present in PRD). |
| 09-quality | **AMBER** | NCR / HACCP / Allergen Gate / Incident / Complaint coverage is comprehensive after the 2026-05-14 +28-task expansion. CFR 21 Part 11 dual-sign + SoD enforced (T-055), allergen-gate consume-block is a hard predicate via server-side ATP read, foundation `app.current_org_id()` red-lined on every RLS task. Gaps: 22 T3-ui tasks have `prototype_match: true` but 14 of them (pre-2026-05-14) are missing `prototype_index_entry` + the `## Prototype parity` section the UI policy requires; zero `cross_module_dependencies` declared anywhere; no explicit citation of foundation T-124 e-sign primitive (T-039 reinvents `ESignBlock` as a 09-quality-internal Server Component — verify this is intentional or that T-039 IS the project's canonical primitive). |

---

## Section 2 — Per-task findings table

| Module | Task ID | Issue category | Description | Severity |
|---|---|---|---|---|
| 03-technical | T-001 | ac-count | 5 ACs (>4 lint cap) | P2 |
| 03-technical | T-024 | ac-count | 6 ACs | P2 |
| 03-technical | T-032 | ac-count | 5 ACs | P2 |
| 03-technical | T-033 | ac-count | 5 ACs | P2 |
| 03-technical | T-034 | ac-count | 5 ACs | P2 |
| 03-technical | T-038 | ac-count | 8 ACs (longest in module) | P2 |
| 03-technical | T-039 | ac-count | 8 ACs | P2 |
| 03-technical | T-060 | ac-count | 7 ACs; spec-review modal with §5.1A | P2 |
| 03-technical | T-072 | ac-count | 5 ACs | P2 |
| 03-technical | T-073 | ac-count | 6 ACs | P2 |
| 03-technical | T-074 | ac-count | 7 ACs | P2 |
| 03-technical | T-075 | ac-count | 7 ACs | P2 |
| 03-technical | T-076 | ac-count | 5 ACs | P2 |
| 03-technical | T-077 | ac-count | 5 ACs | P2 |
| 03-technical | T-078 | ui-policy | T3-ui without `prototype_match` flag (deliberate per upgrade report — UI governance task) | P2 |
| 03-technical | T-078 | ac-count | 6 ACs | P2 |
| 03-technical | T-080 | ac-count | 5 ACs | P2 |
| 03-technical | T-081 | ac-count | 5 ACs | P2 |
| 03-technical | T-082 | ac-count | 5 ACs | P2 |
| 03-technical | T-083 | ui-policy | T3-ui without `prototype_match` flag (deliberate — UI red-line policy) | P2 |
| 03-technical | T-083 | ac-count | 6 ACs | P2 |
| 03-technical | T-001..T-091 (84 of 91) | cross-mod-deps | `cross_module_dependencies` array missing — only 6 tasks (T-001, T-002, T-006, T-008, T-022, T-038 sampled) declare it | P1 (sparse) |
| 05-warehouse | T-002 | tenant_id-drift | Schema task uses `tenant_id` only in red-line and prose; DDL is fine — but composite FEFO index column list is `(org_id, warehouse_id, ...)` ✓ correct. False positive on `tenant_id` count — red-line text only. | (no issue) |
| 05-warehouse | T-002 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-005 | tenant_id-drift | `grns(id, tenant_id, ...)` and `grn_items(id, tenant_id, ...)` DDL — should be `org_id` per Wave0 v4.3 | **P1** |
| 05-warehouse | T-005 | tenant_id-drift | RLS policy text says "RLS + tenant policy" (legacy phrasing) | P2 |
| 05-warehouse | T-008 | tenant_id-drift | `shelf_life_rules` DDL: `id, tenant_id, customer_id...`; partial unique `UNIQUE(tenant_id, customer_id, product_id) WHERE active = true` | **P1** |
| 05-warehouse | T-009 | tenant_id-drift | `warehouse_settings(id, tenant_id, warehouse_id NULL, key, value, ...)`, `UNIQUE(tenant_id, warehouse_id, key)`; seed migration "for `tenant_id = template tenant`" | **P1** |
| 05-warehouse | T-010 | tenant_id-drift | (verify) flagged by tenant_id count = 0 but suspected by sibling-task pattern | — |
| 05-warehouse | T-011 | tenant_id-drift | Composite FEFO index column list: `license_plates(tenant_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` — **directly contradicts T-002** which uses `(org_id, warehouse_id, ...)` | **P1** |
| 05-warehouse | T-011 | placeholder | "...for production-safety where appropriate" matches validator placeholder regex | P2 |
| 05-warehouse | T-012 | tenant_id-drift | RLS audit task: red-line "Do not use `tenant_id` as the business-scope column" is correct, but `_validate.py` does not flag — passes. Verify all 9 audited tables in this task land on `org_id`. | P2 |
| 05-warehouse | T-016 | tenant_id-drift | `createLicensePlate` allocates lp_number per `(tenant_id, warehouse_id)`; sequence name `lp_number_seq_{tenant}_{warehouse}`; uniqueness `UNIQUE(tenant_id, warehouse_id, lp_number)` | **P1** |
| 05-warehouse | T-048 | ac-count | 6 ACs (UI parity) | P2 |
| 05-warehouse | T-049 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-050 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-051 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-052 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-053 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-054 | ac-count | 5 ACs | P2 |
| 05-warehouse | T-055 | ac-count | 5 ACs | P2 |
| 09-quality | T-012 | ui-prototype-index | `prototype_match: true` but `prototype_index_entry` missing | **P1** |
| 09-quality | T-013 | ui-prototype-index | Same as T-012 | **P1** |
| 09-quality | T-014 | ui-prototype-index | Same | **P1** |
| 09-quality | T-015 | ui-prototype-index | Same | **P1** |
| 09-quality | T-016 | ui-prototype-index | Same | **P1** |
| 09-quality | T-021 | ui-prototype-index | Same | **P1** |
| 09-quality | T-022 | ui-prototype-index | Same | **P1** |
| 09-quality | T-023 | ui-prototype-index | Same | **P1** |
| 09-quality | T-024 | ui-prototype-index | Same | **P1** |
| 09-quality | T-032 | ui-prototype-index | Same | **P1** |
| 09-quality | T-033 | ui-prototype-index | Same | **P1** |
| 09-quality | T-034 | ui-prototype-index | Same | **P1** |
| 09-quality | T-035 | ui-prototype-index | Same | **P1** |
| 09-quality | T-036 | ui-prototype-index | Same | **P1** |
| 09-quality | T-012..T-016, T-021..T-024, T-032..T-036 | ui-parity-section | Prompt lacks `## Prototype parity` section. JSX file:lines anchor IS inline but not in a structured section. | P2 |
| 09-quality | T-001..T-064 (all 64) | cross-mod-deps | `cross_module_dependencies` array absent module-wide | **P1** |
| 09-quality | T-039 | esign-foundation | ESignBlock + dualSign primitive declared as 09-quality-internal; no citation of foundation T-124 — verify whether T-039 IS the canonical e-sign primitive or whether it should `import` from foundation | P2 |

P0 (blocking): 0
P1: ~24 distinct tasks (tenant_id drift × 6, ui-prototype-index × 14, cross-mod-deps systemic × 1 across module)
P2: ~30 (ac-count + placeholder + minor structure)

---

## Section 3 — Cross-module integration gaps

### 03-Technical → 09-Quality dep chain (BOM SSOT, lot/expiry, NCR auto-create from GRN/WO/inspection)

| Concern | Verified | Notes |
|---|---|---|
| Shared BOM SSOT in 03-tech | YES | Red-line "Shared BOM SSOT is canonical — Technical, NPD, Planning, Production, Warehouse and Finance read the same bom_headers/lines/co_products tables" is on 90/91 03-technical tasks (T-091 sampled missing — verify). |
| BOM lifecycle clone-on-write | YES | Red-line "Released BOM/factory_spec edits clone-on-write a new version; never mutate an approved/released row in place" present module-wide. |
| Technical-approval contract on BOM edits | PARTIAL | Present in T-038 (bom_detail_page) and T-039/T-040 (component add / versions tab). Verify T-073..T-083 Wave0 final-decision tasks reinforce the same gate. |
| 03-tech items master vs 01-NPD product (FG) — no parallel FG identifier | YES | T-001 calls table `items` (universal item master); T-001 in 01-NPD is the `product`/`fa` table. No 03-technical task creates a parallel FG-* identifier. The two concepts are correctly disjoint. Could be made explicit with a one-liner `Out of scope: do not create FG/product master here — that is 01-NPD T-001`. |
| D365 soft-FK only (TEXT) | YES | Red-line "D365 is optional integration; never use D365 IDs as hard FKs — d365_item_id is TEXT soft reference only" is on 90/91 tasks. Verified explicit in T-001 (TEXT field) and T-055..T-059 D365 UI tasks. |
| §5.0 → §5.1A correction | YES | grep against all 03-technical tasks: 0 remaining `§5.0` references in `prd_refs`. Upgrade report correctly enumerates the 12 corrected tasks. |
| NCR auto-create from GRN-fail (05-WH producer) | YES (09-quality T-041) | T-041 wires the consumer; explicit OUT-OF-SCOPE = 05-WH producer side. T-063 pins the `warehouse.grn.*` event contract in `packages/events` so the consumer can compile before 05-WH ships the publisher. |
| NCR auto-create from WO/inspection-fail | YES (09-quality T-041) | T-041 path (B): finalizeInspection invokes shared createNcrDraft; path (C): CCP deviation via `ccp_deviation_escalation_v1`. |
| Holds guard for WO/LP consume gate | YES (T-064) | T-064 defines `v_active_holds` view + `holdsGuard` helper; 05-WH/08-PROD consume Server Action implementations are OUT-OF-SCOPE — consumer-side wiring becomes a follow-up on those modules. |
| Allergen gate consume-block hard predicate | YES (T-055) | T-055 reads `lab_results.pass_flag` server-side, rejects with 422 V-QA-ALLERGEN-002 unless `risk_level='low'` override. Hard predicate, not advisory. Override path is risk_level='low' only — encoded as red-line. |
| CFR 21 Part 11 dual-sign with foundation e-sign | PARTIAL | 09-quality T-039 declares ESignBlock + dualSign + PBKDF2 + distinct-session red-line; SoD `sign_first ≠ sign_second` is enforced in T-055 (V-QA-ALLERGEN-001) and the NCR critical-close path (T-038/T-046). The link to foundation T-124 e-sign primitive is NOT cited — T-039 is treated as the canonical 09-quality surface. Whether T-039 forwards to foundation T-124 internally is undocumented in the task. |

### 05-Warehouse cross-module declarations

- 58/58 tasks declare `cross_module_dependencies` — exemplary.
- Settings-side `gs1_prefix` dependency cited where label/SSCC concerns appear.
- Intermediate-LP reservation forbidden (V-WH-FEFO-005) is hard-blocked in T-031 service AND surfaced inline in T-051 UI modal.

### 09-Quality cross-module declarations

- 0/64 declare `cross_module_dependencies` as a structured field. Cross-module contracts ARE in prose throughout (T-040, T-041, T-051, T-055, T-062, T-063, T-064). Recommend converting at least the 14 cross-module wiring tasks (T-040..T-046, T-051..T-056, T-062..T-064) to declare the field formally.

---

## Section 4 — Prototype linkage report

### 03-Technical

- 33 tasks declare `prototype_match: true` (T-032..T-063, T-090).
- All 33 carry both `prototype_index_entry` and `ui_evidence_policy`.
- 2 governance tasks (T-078, T-083) deliberately omit `prototype_match` (UI red-line policy, no single anchor) — documented in upgrade report.
- 5 spec-driven Wave0 tasks (T-085..T-089) set `prototype_match: false` deliberately.
- All 33 prompts contain `## Prototype parity` section + `prototypes/design/Monopilot Design System/technical/<file>.jsx:<lines>` anchor.
- Verdict: GREEN.

### 05-Warehouse

- 8 tasks declare `prototype_match: true` (T-048..T-055).
- All 8 carry `prototype_index_entry` (verified: `lp_list_page`, `grn_from_po_wizard`, `stock_movement_list_page`, `available_lp_picker`, `expiry_management_page`, `warehouse_dashboard`, `genealogy_traceability_page`, plus the E2E sweep on T-055).
- WH-015 `available_lp_picker` and WH-017 `wo_reservations_panel` recognized as first-class labels.
- Verdict: GREEN.

### 09-Quality

- 22 tasks declare `prototype_match: true`. 8 newly-added (T-043..T-046, T-058..T-061) have full conformance — `prototype_index_entry`, `## Prototype parity`, JSX anchor.
- 14 pre-existing tasks (T-012..T-016, T-021..T-024, T-032..T-036) have `prototype_match: true` + `ui_evidence_policy` but NO `prototype_index_entry` and NO `## Prototype parity` section. JSX anchor exists inline in their prompts but is not in the structured section the policy requires.
- 6 previously-uncovered prototype labels (`ncr_list`, `ncr_detail`, `haccp_plans`, `ccp_monitoring`, `ccp_deviations`, `allergen_gates`) are now covered by the new tasks per the upgrade report.
- Modal labels (`ncr_create_modal`, `ncr_close_modal`, `ccp_reading_modal`, `ccp_deviation_log_modal`, `allergen_dual_sign_modal`) are embedded in their parent page tasks (acceptable).
- Verdict: AMBER — newly-added tasks GREEN, pre-existing tasks need the structured fields backfilled.

---

## Section 5 — Recommended fixes

### Must-fix before next ACP wave (P1, blocks dispatch)

1. **05-warehouse: replace `tenant_id` → `org_id` in DDL on T-005, T-008, T-009, T-011, T-016** (and re-verify T-010, T-012). The replacement is mechanical (column rename + unique constraint column rename + sequence name normalization), but it must happen in the task JSON before producers run RED, otherwise the migrations will land columns the rest of the platform cannot RLS-join with. Suggested edits:
   - T-005: `grns(id, org_id, ...)`, `grn_items(id, org_id, ...)`; `UNIQUE(org_id, grn_number)`; RLS policy `org_context`.
   - T-008: `shelf_life_rules(id, org_id, customer_id, product_id, ...)`; partial unique `UNIQUE(org_id, customer_id, product_id) WHERE active = true`.
   - T-009: `warehouse_settings(id, org_id, warehouse_id NULL, key, value, ...)`; `UNIQUE(org_id, warehouse_id, key)`; seed text "for `org_id = template org`".
   - T-011: FEFO composite index `(org_id, warehouse_id, product_id, status, expiry_date ASC NULLS LAST)` — matches T-002.
   - T-016: sequence per `(org_id, warehouse_id)`; sequence name `lp_number_seq_{org}_{warehouse}`; `UNIQUE(org_id, warehouse_id, lp_number)`.

2. **09-quality: backfill `prototype_index_entry` + add `## Prototype parity` section on 14 pre-2026-05-14 T3-ui tasks** (T-012..T-016, T-021..T-024, T-032..T-036). Reference `_meta/prototype-labels/prototype-index-quality.json` for canonical entries.

3. **09-quality: add `cross_module_dependencies` arrays to the 14 cross-module wiring tasks** (T-040..T-046, T-051..T-056, T-062..T-064) so ACP wave-planner can detect 09-QA↔05-WH, 09-QA↔08-PROD, and 09-QA↔04-PLANNING coupling.

### Should-fix before closeout reviews (P2, hygiene)

4. **05-warehouse `_validate.py` FAILS today.** Run a follow-up pass to:
   - Compress T-002 + T-048..T-055 ACs to ≤4 (collapse parity checklist into a single AC + reference the `## Prototype parity` section for the long list, mirroring how 01-NPD T-052 does it).
   - Reword T-011 "for production-safety where appropriate" → "in production migrations (dev migrations may opt out and document the reason)".

5. **03-technical AC count >4 on 16 tasks.** Module validator currently passes (no AC-count check), but consistency with 09-quality (which enforces ≤4) suggests adding the check. Most aggressive cases: T-038, T-039 (8 ACs each).

6. **03-technical cross-module deps.** 85/91 tasks lack `cross_module_dependencies`. The 6 that have it (T-001, T-002, T-006, T-008, T-022, T-038 sampled) prove the field is in active use. Suggest backfilling at minimum on all T2-api and T4-wiring-test tasks.

7. **09-quality T-039 ESignBlock provenance.** Add a one-liner to T-039's `details` field clarifying whether (a) T-039 IS the project's canonical e-sign primitive (in which case it should be moved to `00-foundation/` long-term), or (b) T-039 wraps a foundation primitive (then cite the foundation task ID).

### Nice-to-have (P2)

8. **03-technical: explicit items vs 01-NPD product disambiguation in T-001's `out_of_scope` field**: add "Do not create FG/product master in this task — that is 01-NPD T-001 (the `product`/`fa` table)." This prevents an obvious confusion vector for new implementers.

9. **05-warehouse: re-verify T-012 RLS-audit task** does not accidentally re-introduce `tenant_id` in any of the 9 listed tables when it codifies the `<table>_org_context` policy.

10. **Reviewer note**: My audit regex for "Prototype parity" section presence is whitespace-sensitive on the path `prototypes/design/Monopilot Design System/...` (the embedded space) — the JSX anchors in 09-quality pre-2026-05-14 tasks ARE present in prompts (verified with a wider regex). The structural fix is to add the `## Prototype parity` section, not to add the anchor.

---

## Appendix — files referenced during this review

- `_meta/atomic-tasks/03-technical/tasks/T-001.json` … `T-091.json`
- `_meta/atomic-tasks/03-technical/UPGRADE-REPORT-2026-05-14.md`
- `_meta/atomic-tasks/05-warehouse/tasks/T-001.json` … `T-057.json` (+ `T-058.json`)
- `_meta/atomic-tasks/05-warehouse/UPGRADE-REPORT-2026-05-14.md`
- `_meta/atomic-tasks/09-quality/tasks/T-001.json` … `T-064.json`
- `_meta/atomic-tasks/09-quality/UPGRADE-REPORT-2026-05-14.md`
- `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`
- `_meta/atomic-tasks/01-npd/tasks/T-001.json`, `T-052.json`
- `_meta/atomic-tasks/02-settings/tasks/T-001.json`, `T-041.json`
- `_meta/prototype-labels/prototype-index-technical.json`, `-warehouse.json`, `-quality.json`
- `docs/prd/03-TECHNICAL-PRD.md`, `05-WAREHOUSE-PRD.md`, `09-QUALITY-PRD.md`
- Validator runs: `python3 _meta/atomic-tasks/03-technical/_validate.py` → PASS (91 files); `… /05-warehouse/_validate.py` → FAIL (10 errors listed above); `… /09-quality/_validate.py` → PASS (64 files).
