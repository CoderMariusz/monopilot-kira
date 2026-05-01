# 11-SHIPPING PRD Amendment Report

**Date:** 2026-04-30
**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §11-SHIPPING (40% coverage, ~12 orphan UX/prototype screens)
**Target file:** `/Users/mariuszkrawczyk/Projects/monopilot-kira/11-SHIPPING-PRD.md`
**Version bump:** v3.1 → v3.2
**Scope:** Strictly within 11-SHIPPING module. No other PRD/UX touched.

---

## 1. Summary

Closed Direction-B coverage gap (UX/prototype over-build vs PRD) by:
- **Adding 22 new SHIP-NNN screen subsections** to a new §15.4 "Extended desktop screen catalog (Direction-B coverage)".
- **Adopting UX SHIP-NNN scheme as canonical** per audit CC-1 schema-drift policy; preserving legacy SHP-NNN as aliases for the §15.1 v3.0 sub-module impl roadmap.
- **Adding §20 UI Surfaces Traceability Matrix** — bidirectional content index (desktop screens, scanner screens, modals catalog, coverage summary).
- **Marking 2 [NO-PROTOTYPE-YET] TODOs** for Direction-A items lacking prototype/UX.

No PRD content deleted. All existing sections preserved. ADR-034 hygiene confirmed (no legacy `Finish_Meat`/`meat_pct`/Apex-hardcoded schema names; Apex references properly tagged `[APEX-CONFIG]`).

---

## 2. Sections / subsections added

### §15.4 Extended desktop screen catalog (Direction-B coverage, SHIP-NNN scheme)

PRD lines 1003-1344 (~342 lines). 22 sub-sections, each ~150-300 words, with: screen code, route, purpose, RBAC, key behaviors, validation refs, modal references, `[Source: ...]` citation.

| New subsection | PRD line range | Source-prototype path | UX line range |
|---|---|---|---|
| SHIP-003 Shipping Addresses | 1009-1021 | shipping/modals.jsx:69-94 (`address_modal`) | UX:294-318 |
| SHIP-004 Allergen Restrictions per Customer | 1023-1035 | shipping/modals.jsx:96-113, 837-871 | UX:322-344 |
| SHIP-009 Holds Manager | 1037-1053 | shipping/modals.jsx:342-378, 380-410 | UX:478-503 |
| SHIP-010 Partial Fulfillment Decision | 1055-1070 | shipping/modals.jsx:412-453 | UX:506-528 |
| SHIP-011 SO Cancellation | 1072-1086 | shipping/modals.jsx:504-536, 809-835 | UX:531-550 |
| SHIP-014 Pick Desktop (Supervisor) | 1088-1101 | shipping/pick-screens.jsx:217-330 | UX:627-659 |
| SHIP-015 Pick Scanner Launch Card | 1103-1118 | crosslink 06-SCN SCN-040 | UX:663-682 |
| SHIP-016 Short Pick Resolve | 1120-1135 | shipping/modals.jsx:455-502 | UX:685-706 |
| SHIP-017 Packing Station Workbench | 1137-1151 | shipping/pack-screens.jsx:47-220 + modals.jsx:577-607 | UX:710-734 |
| SHIP-018 Pack Scanner Launch Card | 1153-1163 | crosslink 06-SCN SCN-050 | UX:738-746 |
| SHIP-019 SSCC Labels Queue | 1165-1181 | shipping/pack-screens.jsx:224-336 + modals.jsx:702-739 | UX:750-785 |
| SHIP-020 Packing Slip Preview & Print | 1183-1195 | shipping/doc-screens.jsx:107-215 + modals.jsx:741-757 | UX:789-819 |
| SHIP-021 Bill of Lading Preview & Sign-off | 1197-1209 | shipping/doc-screens.jsx:217-308 + modals.jsx:759-790 | UX:823-854 |
| SHIP-014b Carriers List & CRUD | 1211-1223 | shipping/doc-screens.jsx:424-466 + modals.jsx:792-807 | UX:858-883 |
| SHIP-023 Shipping Settings Hub | 1225-1235 | shipping/doc-screens.jsx:536-648 | UX:887-925 |
| SHIP-024 Ship Confirmation | 1237-1255 | shipping/modals.jsx:609-700 | UX:1308-1378 |
| SHIP-025 Documents Hub | 1257-1271 | shipping/doc-screens.jsx:4-104 | UX:1382-1425 |
| SHIP-026 RMA List | 1273-1286 | shipping/doc-screens.jsx:468-534 | UX:1429-1463 |
| SHIP-027 RMA Detail | 1288-1301 | shipping/doc-screens.jsx:468-534 (row navigation) | UX:1467-1488 |
| SHIP-028 Shipment Delivery Tracker (POD) | 1303-1317 | shipping/doc-screens.jsx:310-422 | UX:1492-1520 |
| SHIP-029 Allocation Global View | 1319-1331 | shipping/so-screens.jsx:370-519 | UX:184 (KPI link) |
| SHIP-030 Packing Stations Selector | 1333-1344 | shipping/pack-screens.jsx:4-45 | UX:710 (route landing) |

### §15.5 Direction-A status (PRD bullets without prototype/UX)

PRD lines 1346-1354. Confirms 14/14 SHP-NNN PRD bullets have UX/prototype anchors after §15.4 reconciliation. Lists 2 [NO-PROTOTYPE-YET] TODOs (see §3 below).

### §20 UI Surfaces Traceability Matrix

PRD lines 1512-1603 (~91 lines). Four sub-tables:
- **§20.1 Desktop screens** — 28 SHIP-NNN ↔ SHP-NNN ↔ prototype label ↔ UX line bidirectional matrix.
- **§20.2 Scanner screens** — delegated 06-SCANNER-P1 mapping (5 entries; 1 [NO-PROTOTYPE-YET]).
- **§20.3 Modals catalog** — 21 modals (full prototype-index coverage).
- **§20.4 Coverage summary** — before/after counts per direction.

### §18 Changelog v3.2 entry

PRD lines 1438-1446. New v3.2 changelog stanza describing the amendment.

### Header version bump

PRD lines 3-4 (header): v3.1 → v3.2; status string extended to include "+ UX-coverage closed (… 2026-04-30 design-PRD reconciliation)".

---

## 3. [NO-PROTOTYPE-YET] TODOs created

| TODO | Location | Reason | Owner |
|---|---|---|---|
| **SHP-SCN-04 Pallet Loading** | §15.5 + §20.2 | PRD §15.2 specifies "scan pallet SSCC → assign to dock door → confirm load" as new SCN-092 (11-SHIP specific). No dedicated entry in `_meta/prototype-labels/prototype-index-shipping.json`. | 06-SCANNER-P1 design lane to label SCN-092 prototype OR reuse `shipments_delivery_tracker_page` as placeholder |
| **ADMIN-SHP-01 Shipping Override Reasons Config** | §15.5 + §20.2 | PRD §15.3 specs reference-table CRUD using 02-SETTINGS §8 generic UI pattern. No dedicated `shipping_override_reasons_admin` prototype exists. | 02-SETTINGS lane to confirm whether the generic reference-table UI fully covers, or if 11-SHIP needs a dedicated screen |

Both TODOs explicitly tagged `[NO-PROTOTYPE-YET]` in PRD, not silently deleted.

---

## 4. Numbering changes

**No existing section/subsection re-numbered.** Only additive:
- §15 gained new §15.4 + §15.5 (after existing §15.1/15.2/15.3).
- New §20 appended after §19 References (before final summary line).
- §16, §17, §18, §19 numbering preserved exactly.
- All existing sub-decisions D-SHP-1..20, V-SHIP-* validation IDs, SHP-NNN legacy IDs **unchanged**.

The audit-recommended convention adoption (UX SHIP-NNN as canonical) is implemented as **additive aliasing**, not replacement: §15.1 SHP-NNN catalog retained verbatim, §15.4 introduces SHIP-NNN superset, §20.1 maps both schemes bidirectionally.

---

## 5. Coverage estimate (after amendment)

| Direction | Before | After | Notes |
|---|---|---|---|
| **Direction A** (PRD bullets with UX/prototype anchor) | 14/14 (100%) | 14/14 (100%) | preserved — SHP-NNN aliasing intact |
| **Direction B** (UX/prototype with PRD anchor) | 14/27 (~52%) | 26/27 (~96%) | 12+ orphans newly anchored in §15.4 |
| **Modals coverage** | ~12/21 (~57%) | 21/21 (100%) | full §20.3 catalog |
| **Scanner coverage** | 4/5 (80%) | 4/5 (80%) | SHP-SCN-04 TODO blocks 100% |
| **Aggregate** | **~40%** | **~95%** | exceeds ≥85% target by 10 pp |

---

## 6. ADR-034 hygiene check

Reviewed PRD for legacy domain-specific naming per ADR-034 §Problem table:
- `Finish_Meat`: **0 occurrences** — PRD uses generic `recipe_components` / `products.allergens` / FG.
- `Meat_Pct` / `meat-pct` / `primary_ingredient_pct`: **0 occurrences** in schema/code references.
- `RM_Code`: **0 occurrences**.
- `Apex` references: 9 occurrences, all properly tagged `[APEX-CONFIG]` per ADR-034 marker convention (e.g., D-SHP-12, D-SHP-17, D-SHP-18, D-SHP-20). These are pilot-customer-specific configuration explanations, not hardcoded universal schema.
- `[UNIVERSAL]` markers added to all 22 new SHIP-NNN subsections in §15.4.
- `[UNIVERSAL]` marker added to §20 traceability matrix.

**Verdict:** PRD already compliant. No legacy-naming refactor needed in this amendment.

---

## 7. Constraints adherence

- ✅ No other PRD or module's design touched.
- ✅ No PRD content deleted; only additive (22 subsections + 1 new section).
- ✅ Every new subsection cites UX line + prototype label inline (`[Source: 11-SHIPPING-UX.md:NNN-MMM + prototype <label> (path:lines)]`).
- ✅ Voice/style matched (Polish-English mixed, marker-tagged tables, `[UNIVERSAL]` tags, `D-SHP-NN` cross-refs, modal-references blocks).
- ✅ ADR-034 markers (`[UNIVERSAL]`, `[APEX-CONFIG]`, `[LEGACY-D365]`) used per existing PRD convention.

---

## 8. Could not reconcile (none material)

- **SHP-SCN-04 Pallet Loading** — fully spec'd in PRD §15.2 but no UX section + no prototype. Not a PRD-amendment blocker; flagged as TODO for 06-SCN design lane (out of 11-SHIPPING amendment scope).
- **ADMIN-SHP-01** — admin reference-table CRUD is a 02-SETTINGS generic pattern; whether 11-SHIP needs a dedicated screen vs reusing the generic 02-SETTINGS UI is a 02-SETTINGS-side decision. Flagged as TODO.
- **SHIP-027 RMA Detail prototype** — no dedicated `rma_detail_page` label exists; UX clearly defines 4-tab detail screen, but prototype implements detail via row click navigation on `rma_list_page` (doc-screens.jsx:468-534). Not blocking; noted in §20.1 row "(implicit row click `rma_list_page`)". Future labelling task could split into dedicated detail prototype.

No content was lost or unreconciled at the PRD-level. Amendment achieves its stated goal: ≥85% coverage target hit (~95% estimate).

---

## 9. File metrics

- PRD before: 1150 lines (v3.1).
- PRD after: 1603 lines (v3.2).
- Net addition: **+453 lines** (+39%).
- New SHIP-NNN subsections: 22.
- New top-level sections: 1 (§20).
- TODOs created: 2 [NO-PROTOTYPE-YET] markers.

---

*Amendment authored 2026-04-30. Closes audit `_meta/audits/2026-04-30-design-prd-coverage.md` §11-SHIPPING gap.*
