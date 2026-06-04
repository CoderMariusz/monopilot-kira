# Forward-Looking PLAN/TASK Audit — 09-quality + 11-shipping

**Date:** 2026-06-04
**Mode:** READ-ONLY (no code modified). Pre-build clarity audit.
**Scope:** Make tasks CLEAR + complete before build. Modules NOT yet implemented (every task ⬜ NOT STARTED per both STATUS.md).
**Inputs read:** `docs/prd/09-QUALITY-PRD.md` (1877 ln, v3.1), `docs/prd/11-SHIPPING-PRD.md` (1604 ln, v3.2), both `manifest.json`, `STATUS.md`, `coverage.md`, representative `tasks/T-*.json`, cross-module deps in `08-production/tasks/`.

---

## Executive verdict

Both modules are **BUILD-READY with minor gaps**. Task corpora are high-quality: atomic, TDD-shaped (RED-first), PRD-anchored, with verbatim-DDL contracts, RLS red-lines (`app.current_org_id()` Wave0 lock enforced in every schema task), e-signature/retention red-lines, and explicit out-of-scope blocks. The headline cross-seam (quality holds blocking production consume, sidecar **F-6**) is **fully contracted on both sides**.

- **09-quality:** 65 tasks, all ⬜ (T-013 🟡 Wave-0 skeleton stub). Clarity: **HIGH**. Gaps are small (2 missing cross-module dep declarations, 1 vague compound nav-wiring expectation).
- **11-shipping:** 32 tasks, all ⬜ (4 ⏸ with Wave-0/placeholder stubs). Clarity: **HIGH for spine, MEDIUM for 3 compound tasks** (T-026/T-027/T-029 each bundle schema+API+UI into one task). One genuine missing-task candidate (allergen ASN document / V-SHIP-LBL validators not owned by any task).

No blocking ambiguity found. Stubs below are refinements, not new epics.

---

## Note on the brief's event names

The brief references a `quality.recorded` event and a `shipment.created` event. **Neither literal name exists in the PRDs.** The actual contracted events are granular and are all covered by tasks:

- **09 outbound (PRD §12, all P1):** `quality.hold.created`, `quality.hold.released`, `quality.inspection.completed`, `quality.ncr.created`, `quality.ccp.deviation`. Covered by T-011, T-040, T-056 (publishers) + T-028/T-041/T-052/T-053 (emit sites).
- **11 outbound (PRD §12, P1):** `shipment.confirmed` (→ D365), `shipment.delivered`, `rma.processed`, `shipping.quality_hold.overridden` (→ 09 consumer). Covered by T-013, T-020, T-025, T-029.

Treat the brief's names as generic placeholders; no task is missing on this account. **Recommendation:** keep the granular naming — it is the registered contract.

---

# MODULE 09-QUALITY

## Task count / status
- **Manifest:** 65 tasks (T-001..T-065). Sub-modules 09-a Hold/Release (T-001..016), 09-b Specs (T-017..024), 09-c Incoming Inspection (T-025..036), 09-d NCR basic (T-037..046), 09-e HACCP/CCP/Incidents/Complaints/Allergen-gates (T-047..062), 09-cross contract pins (T-063..064) + RBAC (T-065).
- **Status:** 64 ⬜ NOT STARTED, 1 🟡 STUB (T-013 = Wave-0 quality landing page, not the 6-widget dashboard deliverable). Zero implementation in repo.
- **Audit caveat already captured in STATUS.md:** `apps/web/src/` prefix in scope_files is WRONG; correct prefix is `apps/web/app/[locale]/(app)/(modules)/quality/`. This is acknowledged but **not yet fixed in the task JSONs** — see finding Q-3.

## Task completeness vs PRD
PRD P1 scope = hold/release + specs + incoming inspection + lab results + basic NCR + basic HACCP/CCP. **All five sub-modules are represented.** P2 epics (8F in-process/final inspection + batch_release_gate_v1, 8G full CAPA, 8H operation checkpoints, 8I HACCP-advanced, 8J CoA, 8K supplier quality, 8L analytics/retention-samples) are correctly **excluded** and tracked in `coverage.md` §155. CoA absence from P1 tasks is **correct** (explicit P2).

Coverage of the brief's required quality concerns:
| Concern | Task(s) | Verdict |
|---|---|---|
| Inspection plans | T-025/026/027 (lifecycle), T-034 (templates) | ✅ |
| NCR (basic) | T-037..046; CAPA explicitly P2 | ✅ (P1 scope) |
| CAPA | — | ✅ deferred P2 (Epic 8G) by design |
| Hold/release of lots | T-004/006/007/010 + T-064 view | ✅ |
| COA | — | ✅ deferred P2 (Epic 8J) by design |
| `quality.*` events | T-011/040/056 | ✅ (granular names, not `quality.recorded`) |
| Sampling (AQL ISO 2859) | T-031 (schema), T-035 (config UI) | ✅ |
| State machines | T-005/008 (`qa_status_state_machine_v1`), T-052 (`ccp_deviation_escalation_v1`) | ✅ |
| Validators (V-QA-*) | embedded in T-026/027/028 ACs | ✅ |

## Missing-logic findings (09)
- **Q-1 (dependency-DAG gap, MED):** `T-050` (allergen_changeover_validations FK + lab_results ATP extension) modifies `lab_results` — **owned by 03-TECHNICAL §10.4** — and creates an FK to `allergen_changeover_validations` (**08-PROD §9.8 E7**), yet declares `cross_module_dependencies: null`. The migration will fail or create a duplicate `lab_results` if 03-TECH has not landed its base table first. **Add cross-module deps:** `03-technical` (lab_results base) + `08-production:E7` (allergen_changeover_validations producer side). Stub: `m09-T-050-xdeps.md`.
- **Q-2 (soft dep, LOW):** `T-025` (quality_inspections) FK-references `items` (03-TECH product master) and `quality_specifications` (own T-017) but lists `dependencies:[]` and `cross_module_dependencies:null`. The `items` FK needs 03-TECH/01-NPD product table present. Add a soft cross-dep note so wave-planning doesn't schedule it before product SSOT. Stub: `m09-T-025-xdeps.md`.
- **Q-3 (path correctness, MED — already flagged in STATUS, not yet applied):** every UI task scope_file using `apps/web/src/...` must be rewritten to `apps/web/app/[locale]/(app)/(modules)/quality/...`. This is a corpus-wide find/replace before build, not a per-task stub. Flagged here so it is not lost. Stub: `m09-path-correction.md`.
- **Q-4 (nav wiring, LOW/clarity):** UI tasks mention `sidebar/nav` in ACs but there is no single task that owns the quality top-level nav entry + route group registration in the app shell. Each page assumes the menu item exists. Confirm 02-settings/Wave-0 owns the modules menu, or add an explicit nav-registration line to T-013 (dashboard / module entrypoint). Stub: `m09-nav-wiring.md`.

## Dependency / canonical-owner table (09)
| Direction | Counterpart | Contract | Owner | Status in tasks |
|---|---|---|---|---|
| IN | 00-foundation T-125 (withOrgContext), T-112 (outbox), T-124 (e-sign) | RLS context, outbox emit, signature hash | 00-foundation | ✅ referenced in schema/API tasks |
| IN | 03-TECHNICAL §10.4 `lab_results`, §10 allergen cascade, product master | extend lab_results; read allergen profile | **03-TECH** (lab_results canonical) | ⚠️ T-050 missing dep (Q-1) |
| IN | 05-WH `grn.received`, `license_plates.qa_status` write API, lot genealogy | GRN→auto-inspection; qa_status write client | **05-WH** (LP state machine §6.1) | ✅ T-030 xdeps present |
| IN | 08-PROD E7 allergen_changeover_gate, ATP result store | dual-sign + ATP storage | **08-PROD** (gate eval) | ⚠️ T-050/T-055 should pin E7 |
| IN | 06-SCANNER SCN-070..073 | scanner QA pass/fail/hold | 06-SCANNER | ✅ T-029 scanner API |
| IN | 02-SETTINGS §8 ref tables (`quality_hold_reasons`, `qa_failure_reasons`, `waste_categories`) | reference_tables_rows FK | 02-SETTINGS | ✅ T-001/002/003 |
| OUT | 08-PROD WO consume + 05-WH LP consume (**sidecar F-6**) | `v_active_holds` view + `holdsGuard` (409 `quality_hold_active`) | **09-QA owns the guard** (T-064) | ✅✅ pinned both sides |
| OUT | 11-SHIPPING pick/pack/ship gate | `v_active_holds` (T-010) + `holdsGuard` (T-064) + consumes `shipping.quality_hold.overridden` (T-011) | shared | ✅ aligned (see 11 finding S-cross) |
| OUT | 10-FIN (yield/waste P2), 12-REP (KPIs) | outbox events | downstream | ✅ event publishers present |

**Canonical-owner check:** 09-QA correctly does NOT own LP state machine (05-WH), allergen cascade rule (03-TECH), WO state machine (08-PROD), or `lab_results` base table (03-TECH). 09-QA OWNS `quality_holds`, `v_active_holds`, `holdsGuard`, and writes `qa_status` transitions via 05-WH API only. **No canonical-owner violation found.**

## RBAC / reachability (09)
- **T-065** adds 13 `quality.*` permission strings + `ALL_QUALITY_PERMISSIONS` export to `packages/rbac/src/permissions.enum.ts`. Correctly depends on 02-settings T-001 (enum owner) + T-130 (ESLint enum-lock guard). **STATUS.md confirms `permissions.enum.ts` currently has ZERO `quality.*` entries** — so T-065 is a true p0-style prerequisite for every Server Action task (T-006/007/018/026/038/051/etc.). **Finding Q-5 (sequencing, MED):** T-065 is buried at the end of the manifest but must run in the FIRST wave; its `priority` and wave placement should mark it a blocker like 11's T-031. Stub: `m09-T-065-sequencing.md`.
- RBAC matrix (PRD §2.3) is well-specified (create/release hold, approve spec, close critical NCR dual-sign, CCP override, dual-sign allergen gate). ACs in T-007 (release e-sign), T-019 (spec approval e-sign), T-044 (NCR critical dual-sign), T-055 (allergen second-sign) reflect it. ✅

## Build-readiness (09)
- **MON-domain-quality skill:** ✅ exists (`.claude/skills/MON-domain-quality/SKILL.md`).
- **Prototypes:** ✅ rich set under `prototypes/design/Monopilot Design System/quality/` (dashboard, holds, specs, inspection, ncr, haccp, modals). `coverage.md` confirms all 6 previously-uncovered UI labels now mapped + `ui_evidence_policy` added to all 14 T3-ui tasks.
- **Gaps:** path-prefix correction (Q-3) is the only material readiness blocker.

## Clarity verdict (09): **HIGH — build-ready after Q-1/Q-3/Q-5 applied.**

---

# MODULE 11-SHIPPING

## Task count / status
- **Manifest:** 32 tasks (T-001..T-032) across 11 sub-modules (a customers, b sales orders, c allocation+hold-gate, d pick/wave, e pack/SSCC/ship, f documents, g RMA, h carriers+settings, i D365 outbox, j dashboard+E2E, k permissions).
- **Status:** 28 ⬜ PENDING, 4 ⏸ BLOCKED with non-deliverable stubs: T-019 (gs1 utils exist, no SSCC generator), T-028 (SettingsRouteStub ≠ SHIP-023), T-030 (Wave-0 landing ≠ SHIP-022 dashboard), and placeholder `public.shipment` table (014-r13) which is NOT the T-018 contract.

## Task completeness vs PRD
PRD P1 (§4.1, 12 Must items) → task mapping:
| PRD §4.1 area | Task(s) | Verdict |
|---|---|---|
| 1 Customer mgmt | T-001..005 | ✅ |
| 2 Sales Orders + status machine + allergen-validate | T-006..010 (T-007 owns `so_state_machine_v1` + V-SHIP-SO-*) | ✅ |
| 3 Allocation + FEFO + pick list + wave | T-011/012 + T-015/016/017 | ✅ |
| 4 Pack + SSCC-18 + BOL + packing slip | T-018/019/020/021/022 + T-023/024 | ✅ |
| 5 Quality hold gate (D-SHP-13) | T-013 | ✅ |
| 6 Allergen labelling (bold list packing slip/BOL/**SSCC ASN**) | T-023 (BOL/slip bold list) | ⚠️ ASN doc + V-SHIP-LBL validators unowned — finding S-1 |
| 7 RMA P1 | T-026 (compound) | ✅ but compound — S-2 |
| 8 Dashboard P1 | T-030 | ✅ (stub today) |
| 9 INTEGRATIONS stage 3 (D365 outbox+DLQ+dispatcher) | T-029 (compound, heavy infra) | ✅ but compound + infra gap — S-3 |
| 10 Partial shipments | T-006/007 (status='partial'), T-016 short-pick | ✅ |
| 11 Audit trail (PG triggers) | T-006 (`shipping_audit_log`) | ✅ |
| 12 RLS multi-tenant | every schema task | ✅ |

P2 carve-outs (CW lines, carrier API, dock mgmt, COGS, EPCIS, Digital-Link QR, EUDR gate, batch_release hard-gate, multi-warehouse) correctly **deferred** and tracked as disabled-UI red-lines in `coverage.md` §81.

## Missing-task list + missing-logic findings (11)
- **S-1 (MISSING TASK candidate, MED):** PRD §4.1 #6 lists allergen labelling on **"packing slip + BOL + SSCC ASN"** as P1 Must, and §11 defines **V-SHIP-LBL-01..05** validators (allergen list matches BOM cascade via `allergen_cascade_v1`, no missing EU-14, customer-restriction segregation warning). T-023 covers the *bold list on BOL/packing slip PDF*, but **no task owns (a) the SSCC ASN document element** (`Allergens` GTIN-linked list, §13.3) **nor (b) the V-SHIP-LBL validator suite as a testable unit.** Note: the full retailer ASN file (EDI-856 / EPCIS JSON-LD) IS P2 (§13.6, Epic 11-G/11-L) — so the *document* is correctly deferred, but the **V-SHIP-LBL validators are P1** and currently homeless. **Add a task** for the allergen-label validator suite. Stub: `m11-T-033-allergen-label-validators.md`.
- **S-2 (compound task, MED):** **T-026** bundles RMA schema + Server Actions + `rma_list_page` (13 scope files, 1 task). This violates the atomic-task norm (compare 09 where schema/API/UI are split). Risk: a single failed checkpoint blocks the whole RMA epic; reviewer context blows past budget. **Recommend split** into T-026a (schema+RLS), T-026b (server actions), T-026c (rma_list_page UI). Stub: `m11-T-026-split.md`.
- **S-3 (compound + infra gap, HIGH):** **T-029** bundles `shipping_outbox_events` + `shipping_push_dlq` schema + the **D365 dispatcher in `apps/worker`** — and STATUS.md confirms `apps/worker`, `packages/integrations-d365`, AND `packages/events` **do not exist yet**. This is the heaviest infra gap in the module and it is ONE task at risk_tier high. It depends on 00-foundation T-111 (apps/worker JobRegistry) + T-112 (@monopilot/outbox). **Recommend (a) split** schema vs dispatcher, and **(b) verify** the 00-foundation prerequisites are scheduled before it. Stub: `m11-T-029-split.md`.
- **S-4 (compound, LOW):** **T-027** bundles carriers schema + actions + `carriers_list_page`. Lower risk (carrier is P1-thin, P2-heavy) but same anti-pattern. Optional split. Stub: `m11-T-027-split.md`.

## State machines + validators (11)
- **SO state machine (D-SHP-8, `so_state_machine_v1`):** ✅ owned by T-007, which has an AC asserting "all 12 D-SHP-8 transitions return correct ok/blocker_code" via state-machine unit tests in `_so-status-machine.ts`. Registered read-only in 02-SETTINGS §7.
- **FEFO (`fefo_strategy_v1`):** ✅ consumed from 05-WH (T-011/T-012 candidate query).
- **V-SHIP-SO-* / V-SHIP-ALLOC-* / V-SHIP-PICK-*:** ✅ embedded in T-007/T-012/T-016 ACs.
- **V-SHIP-LBL-*:** ❌ unowned (S-1).
- **`eudr_compliance_gate_v1`:** P2 stub, correctly absent.

## Dependency / canonical-owner table (11)
| Direction | Counterpart | Contract | Owner | Status |
|---|---|---|---|---|
| IN | 00-foundation T-125/112/124/111/121/113/123 | withOrgContext, outbox, e-sign, worker, rate-limit, GDPR, Playwright | 00-foundation | ✅ in manifest cross_module_dependencies |
| IN | 01-NPD T-001 product FG SSOT | `sales_order_lines.product_id`, allergens, variance_tolerance_pct | **01-NPD/03-TECH** | ✅ declared |
| IN | 02-SETTINGS | allergen_families, reason_codes, `organizations.gs1_company_prefix`, printers/packing_stations, D365_Constants §11 | 02-SETTINGS | ✅ declared |
| IN | 05-WH T-002 (license_plates), T-013 (transition_lp DSL reserved→shipped), create_lp (RMA restock) | LP alloc + state transition | **05-WH** (LP canonical) | ✅ declared |
| IN | 06-SCANNER | SHIP-015 Pick + SHIP-018 Pack scanners owned by scanner module; operator role model | **06-SCANNER** | ✅ declared (scanners NOT in 11 scope) |
| IN | 08-PROD | `outbox_status_enum` shared ENUM; outbox template clone | **08-PROD** (enum owner) | ✅ declared |
| IN/OUT | 09-QA T-010 `v_active_holds`, T-064 `holdsGuard`, T-011 consumer | quality hold gate (D-SHP-13) | **09-QA owns guard** | ✅✅ aligned (S-cross) |
| OUT | D365 external | `shipment.confirmed` push via outbox, R14/R15 | 11-SHIP producer | ✅ T-029 |
| OUT | 10-FIN (COGS P2), 12-REP (OTD) | events | downstream P2 | ✅ deferred |

**Canonical-owner check:** 11-SHIP correctly does NOT own license_plates (05-WH), product master/pricing (03-TECH — "tylko odczytuje"), allergen cascade (03-TECH), scanner screens (06-SCANNER), or `outbox_status_enum` (08-PROD). RMA restock writes a new LP **via 05-WH create_lp** (cross-write, declared), not by owning LP creation. RMA scrap routes to **08-PROD waste_categories** (consumer). **No canonical-owner violation found.**

## S-cross — Quality-hold ↔ shipping seam (the brief's key cross-seam)
**FULLY DEFINED ON BOTH SIDES:**
- **09 side:** T-064 ships `v_active_holds` (SECURITY INVOKER view, RLS flows) + `packages/server/src/quality/holdsGuard.ts` with `assertNoActiveHoldForWo/Lp` throwing `QaHoldActiveError(409)` `{code:'QA_HOLD_ACTIVE', hold_number, priority, reason_code}`. Single-source-of-truth contract test forbids duplicate hold reads in 05-WH/08-PROD/11-SHIP.
- **11 side:** T-013 `shipping-quality-hold-gate.ts` explicitly declares xdep on `09-quality/T-064` ("evaluateLpForShipping IS the holdsGuard implementation"), consumes `v_active_holds` (T-010), emits `shipping.quality_hold.overridden` → consumed by 09 T-011. Soft (severity<critical, warn+reason_code+audit) vs hard (critical, block) gate per D-SHP-13.
- **08 side (sidecar F-6):** 08-production T-001/T-021/T-027 declare cross_module_dependency on 09-quality T-064 with matching `409 quality_hold_active` envelope + `production.consume.blocked` outbox event.

**Verdict: contract is symmetric and consistent across 08/09/11.** The sidecar F-6 concern is resolved in the task corpus. Only residual risk: P1 ships the soft-gate via direct `quality_holds` query in 09's holdsGuard; the **hard `batch_release_gate_v1` rule is P2** (correctly deferred), so severity='critical' hard-block in 11 P1 relies on holdsGuard severity field, not the DSL rule — this is intentional per D-SHP-13 §10.2 and is documented.

## RBAC / reachability (11)
- **T-031** appends 14 `ship.*` permission strings — correctly flagged as the sole **p0_blocker** in the manifest, scheduled wave 1, and listed as prerequisite for T-002/012/016/020. STATUS.md confirms zero `ship.*` entries exist today. ✅ (Contrast 09 finding Q-5 where the equivalent RBAC task is NOT marked p0.)
- RBAC mapping (§3: shipping_operator/manager/sales/qa/admin) reflected in role-gated ACs across SO/alloc/pick/pack tasks. ✅

## Build-readiness (11)
- **MON-domain-shipping skill:** ✅ exists (`.claude/skills/MON-domain-shipping/SKILL.md`).
- **Prototypes:** ✅ present under `prototypes/design/Monopilot Design System/ shipping` (note the literal leading space in the dir name — verify anchor strings use it). `coverage.md` maps SHIP-001..030 labels.
- **Infra gaps (must precede build):** `apps/worker`, `packages/integrations-d365`, `packages/events` do not exist → all owned by 00-foundation (T-111/112) and 11 T-029. These are declared as cross-module deps but the worker/events packages are a hard prerequisite for T-013 (emits events) and T-029 (dispatcher). **Verify 00-foundation T-111/112 land before 11 wave 2.**

## Clarity verdict (11): **HIGH for the SO→pick→pack→ship spine; MEDIUM for 3 compound tasks (T-026/027/029) and 1 missing validator task (S-1). Build-ready after S-1 added and S-3 prerequisites confirmed.**

---

## Consolidated action list (priority order)
1. **[HIGH] m11-T-029-split** — split D365 outbox schema vs dispatcher; confirm 00-foundation T-111/112 scheduled first.
2. **[MED] m09-T-050-xdeps** — add 03-TECH (lab_results) + 08-PROD E7 cross-module deps.
3. **[MED] m09-path-correction** — corpus-wide `apps/web/src/` → `apps/web/app/[locale]/(app)/(modules)/quality/`.
4. **[MED] m09-T-065-sequencing** — mark T-065 a wave-1 blocker (parity with 11 T-031).
5. **[MED] m11-T-033-allergen-label-validators** — new task for V-SHIP-LBL-01..05 + SSCC-ASN allergen element (P1 validators).
6. **[MED] m11-T-026-split** — split RMA compound task.
7. **[LOW] m09-T-025-xdeps, m09-nav-wiring, m11-T-027-split** — soft deps / nav / optional carrier split.

All findings are refinements; no missing epic, no canonical-owner violation, no broken cross-seam. Both modules can enter build after items 1–5.
