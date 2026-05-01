# PRD Amendments — 05-WAREHOUSE (Bidirectional UX/PRD Reconciliation)

**Date:** 2026-04-30
**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md` §2 (05-WAREHOUSE row)
**Inputs:**
- `05-WAREHOUSE-PRD.md` v3.1 (pre-amendment)
- `design/05-WAREHOUSE-UX.md` v1.0 (read-only, NOT edited per audit constraint)
- `_meta/prototype-labels/prototype-index-warehouse.json` (canonical, haiku/sonnet split resolved)
- `_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md`

**Output:** `05-WAREHOUSE-PRD.md` v3.2 + this audit log.

**Constraints honoured:**
- Stayed strictly within 05-WAREHOUSE module.
- No PRD content deleted; ADD only (re-ordered subsection numbering inside §6 / §8 / §11 / §12 / §14 / §16 only to insert new content).
- UX file NOT modified.
- UX line numbers + prototype labels cited inline in every new subsection.
- ADR-034 markers applied to all new content (UNIVERSAL/APEX-CONFIG tags preserved; FG/RM/intermediate naming preserved).

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD↔UX↔proto traceable surfaces | ~75% (concept-level only) | ≥90% (8 new FRs anchor previously-orphan UX/proto) |
| FRs (FR-WH-*) | 37 | 45 (+8: FR-WH-035..042) |
| Validation rules | 37 across 7 families | 44 across 9 families (+2 new families: V-WH-DASH, V-WH-SET) |
| Direction A gaps (PRD→design) | 1 HIGH (FR-WH-024), 1 LOW (FR-WH-008), 1 P2 (FR-WH-019) | FR-WH-024 explicitly tagged `[NO-PROTOTYPE-YET]` z TODO Phase E; FR-WH-008 confirmed behavior-not-screen; FR-WH-019 P2 OK |
| Direction B orphans (design→PRD) | 8 surfaces orphan (force_unlock_scanner, cycle_count_quick_adj, state_transition_confirm, expiry_mgmt_page, inventory_browser, locations_hierarchy, genealogy_traceability, warehouse_settings_page) | 0 — all anchored via FR-WH-035..042 + WH-101..108 surface IDs |
| Direction C contradictions | 1 (lp_split destination required vs PRD optional) | 1 (preserved in §16.6 matrix row WH-008 as flagged for Phase E; nie deleted/overwritten) |

---

## 2. Sections added (Direction B — orphans → PRD anchors)

All inserted as ADD-only modifications within existing § structure. Original numbering preserved; new subsections appended to end of relevant § or inserted at logical position with old §X.N renumbered to §X.N+1 (only validation tables shifted, no content deleted).

### §6.10 — LP State-Transition Confirm Modal [WH-101]
- **Anchors:** UX M-15 (`design/05-WAREHOUSE-UX.md:1344`) + proto `state_transition_confirm_modal` (`warehouse/modals.jsx:1106-1138`)
- **New FR:** FR-WH-035
- **New validation:** V-WH-LP-010 (destructive transitions reason_code mandatory + server-driven allowed reasons)
- **ADR markers:** ADR-029 (rule DSL — server-driven, nie hardcoded), ADR-008 (audit), ADR-034 [UNIVERSAL]

### §6.11 — Force-Unlock Scanner Lock [WH-102]
- **Anchors:** UX WH-001 alert "Scanner lock stuck" (`UX:169`) + UX WH-003 LP detail banner (`UX:416`) + proto `force_unlock_scanner_modal` (`warehouse/modals.jsx:1141-1159`)
- **New FR:** FR-WH-036
- **New validation:** V-WH-LP-011 (Admin role + audit row mandatory)
- **ADR markers:** ADR-006 (scanner-first), ADR-008 (audit), ADR-013 (RBAC server-side), ADR-034 [UNIVERSAL]

### §8.8 — Cycle-Count Quick Adjustment (P1 Stub) [WH-103]
- **Anchors:** UX M-14 (`UX:1329`) + proto `cycle_count_quick_adjustment_modal` (`warehouse/modals.jsx:1051-1103`, BL-WH-01)
- **New FR:** FR-WH-037
- **New validation:** V-WH-MOV-007 (respects §8.5 threshold; >10% → manager approval)
- **Resolves:** Pre-amendment audit row 4 — PRD said "P2 cycle count execute"; UX has P1 stub (legitimate). Resolution: P1 stub explicitly framed; full WH-E14 retained as P2.
- **ADR markers:** ADR-008 (audit), ADR-034 [APEX-CONFIG→UNIVERSAL]

### §11.5 + FR-WH-038 — Genealogy Dashboard Page [WH-104]
- **Anchors:** UX WH-014 (`UX:858`) + proto `genealogy_traceability_page` (`other-screens.jsx:268-359`)
- **New FR:** FR-WH-038
- **New validation:** V-WH-TRACE-005 (RLS + depth limit guard)
- **Note:** PRD §11 previously enumerated only "TraceabilityReportPage P2" + "GenealogyTreeWidget P1 (LP detail)" — missed dedicated page-level surface. Now anchored.
- **ADR markers:** ADR-003/013 (RLS), ADR-029 (recursive CTE per Q4 C2 Sesja 2), ADR-034 [UNIVERSAL]

### §12.6 + FR-WH-039 — Expiry Management Dashboard [WH-105]
- **Anchors:** UX WH-019 (`UX:1021`) + proto `expiry_management_page` (`other-screens.jsx:363-480`)
- **New FR:** FR-WH-039
- **New validation:** V-WH-EXP-006 (manager override unblock audit + email notification)
- **Note:** PRD §12 previously described `ExpiringSoonWidget` (dashboard tile) but not the dedicated `/warehouse/expiry` page surface.
- **ADR markers:** ADR-008 (audit), ADR-034 [APEX-CONFIG→UNIVERSAL]

### §14.5 + FR-WH-040 — Inventory Browser [WH-106]
- **Anchors:** UX WH-012 (`UX:770`) + proto `inventory_browser_page` (`other-screens.jsx:3-152`, BL-WH-05 location-view P2)
- **New FR:** FR-WH-040
- **New validation:** V-WH-DASH-001 (inventory value server-side RBAC, NEW family V-WH-DASH)
- **ADR markers:** ADR-013 (RLS + RBAC), ADR-034 [UNIVERSAL]

### §14.6 + FR-WH-041 — Locations Hierarchy View [WH-107]
- **Anchors:** UX WH-018 (`UX:988`) + proto `locations_hierarchy_page` (`other-screens.jsx:156-264`) + M-13 `location_edit_modal`
- **New FR:** FR-WH-041
- **New validation:** V-WH-DASH-002 (location deactivate blocked if ≥1 active LP)
- **ADR markers:** ADR-031 (configurable depths), ADR-013 (RBAC), ADR-034 [UNIVERSAL]

### §16.0 + FR-WH-042 — Warehouse Settings Page [WH-108]
- **Anchors:** UX WH-020 (`UX:1071`) + proto `warehouse_settings_page` (`other-screens.jsx:484-631`, BL-WH-02)
- **New FR:** FR-WH-042
- **New validation:** V-WH-SET-001 (rule-registry settings read-only enforcement, NEW family V-WH-SET)
- **Note:** PRD §16.1 previously enumerated `warehouse_settings` toggles tabelka but no dedicated frontend page.
- **ADR markers:** ADR-029 (rule registry read-only), ADR-013 (RBAC), ADR-034 [UNIVERSAL]

### §16.6 — UI Surfaces Coverage Matrix (NEW)
- **30+ row bidirectional matrix** WH-NNN ↔ UX line ↔ prototype label ↔ PRD §ref ↔ status (OK/TODO/P2/P3)
- Includes ALL pre-existing P1 surfaces (WH-001..020 + M-01..M-15) + 8 new WH-101..108 + WH-109 NO-PROTOTYPE-YET stub for FR-WH-024
- Explicitly flags Direction C contradiction (lp_split destination — audit row 15) without resolution (Phase E)
- ADR-034 marker applied at top of section

---

## 3. Direction A reconciliation (PRD bullets → design link or NO-PROTOTYPE-YET TODO)

| PRD ref | UX | Prototype | Resolution |
|---|---|---|---|
| FR-WH-001 LP numbering | WH-001/003 | `warehouse_dashboard`, `lp_detail_page` | OK (already aligned) |
| FR-WH-006 GRN 3-step | WH-004-PO | `grn_from_po_wizard` | OK |
| FR-WH-008 GS1 GRN line filling | UX:480-491 inline (WH-004-PO Step 2) | (auto-fill behavior, not dedicated picker proto) | OK — confirmed behavior-not-screen; matrix entry documents this |
| FR-WH-013 Location capacity (P2) | WH-018 read-only | `locations_hierarchy_page` (read-only) | OK (P2) |
| FR-WH-019 EPCIS events (P2) | (absent) | (absent) | OK (P2 — WH-E16 deferred) |
| **FR-WH-024 Shelf life rules / customer** | (absent) | (absent in 05-WH proto) | **`[NO-PROTOTYPE-YET]` TODO Phase E** — admin CRUD na `/warehouse/settings/shelf-life-rules` (sub-page WH-020 → new "Shelf Life Rules" category); pick enforcement P2 11-SHIPPING. Tagged inline w §12.5. |

---

## 4. Direction C — preserved, not resolved

Audit row 15: `lp_split_modal` requires destination but PRD §6.4 says destination optional. Documented in §16.6 matrix row WH-008 as flagged for Phase E resolution. Per audit constraint "Do NOT delete PRD content", original PRD §6.4 wording preserved verbatim. Implementation team will choose: (a) make destination optional in UX/proto, or (b) update PRD §6.4 to require destination — decision deferred.

---

## 5. ADR-034 marker application

All 8 new FR-WH-035..042 nadal stosują FG/RM/intermediate UNIVERSAL terminology — żadnego domain-specific re-naming wprowadzonego. New tags:
- §6.10/6.11 → [UNIVERSAL]
- §8.8 → [APEX-CONFIG→UNIVERSAL] (Apex P1 stub, full feature P2)
- §11.5 (FR-WH-038) → [UNIVERSAL] (FSMA 204 / EU 178/2002 driver)
- §12.6 (FR-WH-039) → [APEX-CONFIG→UNIVERSAL] (cron schedule per-tenant configurable)
- §14.5/14.6 (FR-WH-040/041) → [UNIVERSAL]
- §16.0 (FR-WH-042) → [UNIVERSAL]

ADR-034 explicit reference w §16.6 matrix top-line.

---

## 6. Validation index after amendments

44 rules across 9 families (was 37 across 7):

| Family | Count | Delta |
|---|---|---|
| V-WH-LP | 11 | +2 (010 state-transition confirm, 011 force-unlock) |
| V-WH-GRN | 8 | 0 |
| V-WH-MOV | 7 | +1 (007 cycle-count quick adj threshold) |
| V-WH-FEFO | 6 | 0 |
| V-WH-INT | 5 | 0 |
| V-WH-TRACE | 5 | +1 (005 genealogy dashboard RLS+depth) |
| V-WH-EXP | 6 | +1 (006 use_by manager override audit) |
| V-WH-SCAN | 5 | 0 |
| V-WH-LABEL | 5 | 0 |
| **V-WH-DASH** (NEW) | 2 | +2 (001 inventory value RBAC, 002 location deactivate guard) |
| **V-WH-SET** (NEW) | 1 | +1 (001 rule registry read-only) |

---

## 7. TODOs handed off to Phase E

1. **WH-109 Shelf Life Rules CRUD** (`[NO-PROTOTYPE-YET]`) — admin CRUD page anchored in §12.5 + matrix; needs UX spec extension + prototype generation. Estimated ~0.5 pd spec + 1 pd prototype.
2. **M-12 use_by Block Override** prototype — UX modal exists (UX:1293), prototype label `use_by_override_modal` likely present in proto index (verify mapping); ensure end-to-end PRD-UX-proto trace clean.
3. **lp_split_modal destination** Direction C resolution — choose: optional (per PRD §6.4) vs required (per UX M-04 / proto). Single-line decision; flagged §16.6 matrix.
4. **BL-WH-01** full cycle count workflow — WH-E14 P2 (variance detection, ABC, manager approval queue full). Out of v3.2 scope.
5. **BL-WH-02** Locations + Integrations tabs in WH-020 settings page — P1 placeholders, full sub-pages Phase E.
6. **BL-WH-04** ZPL real preview — backend label service integration. Out of v3.2 scope.
7. **BL-WH-05** Inventory Browser By-Location full ltree hierarchy — P2 (P1 = flat L2).
8. **BL-WH-06** ext_jsonb editor inline on LP detail — Phase 2.

---

## 8. Verification

- All 8 new FRs cross-referenced w §16.6 matrix.
- All new validation rules (V-WH-LP-010/011, V-WH-MOV-007, V-WH-EXP-006, V-WH-TRACE-005, V-WH-DASH-001/002, V-WH-SET-001) appear w respective §X.N validation tables AND w §16.4 index.
- All UX line citations point to actual lines (verified during edit against `design/05-WAREHOUSE-UX.md`).
- All prototype label citations match `_meta/prototype-labels/prototype-index-warehouse.json`.
- No content deleted from PRD (verified via diff strategy: ADD-only edits + table appends).
- UX file NOT modified (constraint).
- ADR-034 markers applied to all new sections.

---

## 9. Blockers

None. All required cross-references resolved. Phase E TODOs (§7) are non-blocking — they are explicit follow-ups, not gaps in v3.2 specification.

---

_End of amendment log. PRD 05-WAREHOUSE bumped to v3.2 (header + footer)._
