# PRD Amendments — 03-TECHNICAL

**Date:** 2026-04-30
**Source audit:** `_meta/audits/2026-04-30-design-prd-coverage.md §Module 03-TECHNICAL`
**Target file:** `03-TECHNICAL-PRD.md` (bumped v3.1 → v3.2)
**Companion files (read-only this run):**
- `design/03-TECHNICAL-UX.md` (out-of-scope for edits — separate UX workstream)
- `_meta/prototype-labels/prototype-index-technical.json`
- `_foundation/decisions/ADR-034-generic-product-lifecycle-naming-and-industry-configuration.md`

---

## 1. What changed

### 1a. New sections / tables added to the PRD

| Section | Purpose | Lines (approx, post-edit) |
|---|---|---|
| §4A — PRD ↔ UX numbering reconciliation | Canonical TEC-NNN map covering every PRD ID + Direction-B prototype closures. Establishes PRD numbering range (TEC-010..TEC-099) as authoritative. | New, ~80 rows total in two tables |
| §6A — Additional Item-Master UI surfaces | Direction B closures for `tech_dashboard_screen` (TEC-080), `archive_product_modal` (TEC-081). | New |
| §7A — Additional BOM UI surfaces | Direction B closures for `delete_bom_version_modal` (TEC-082), `bom_graph_tab` (TEC-083), `bom_recipe_sheet_tab` (TEC-084), `history_screen` (TEC-089), ECO prototypes (TEC-092 Phase 2). | New |
| §10A — Additional Allergen / Spec / Traceability UI surfaces | Direction B closures for `spec_review_modal` (TEC-085), `specs_screen` (TEC-086); cross-tagged entries TEC-093 (Nutrition → 01-NPD) and TEC-095 (Traceability → 05-WAREHOUSE). | New |
| §11A — Additional Cost UI surfaces | Direction B closure for TEC-094 Recipe Costing (cross-tagged → 10-FINANCE) + TEC-051 enrichment with `cost_rollup_recompute_modal`. | New |
| §12A — Additional Routing / Resource UI surfaces | Direction B closures for `tooling_screen` (TEC-087, marked UX-MISSING), `maintenance_screen` (TEC-088, cross-link to 13-MAINTENANCE). | New |
| §13A — Additional D365 UI surfaces | Direction B closures for `d365_mapping_screen` (TEC-090), `d365_drift_screen` (TEC-091, distinct from TEC-073 DLQ). | New |
| §17 — UI Surfaces Master Table | End-of-document canonical table covering every TEC-NNN with PRD §, UX line, prototype path, status, marker. | New |
| Changelog v3.2 entry | Documents amendment reason + audit citation. | New |

### 1b. In-place markers added (no content deleted)

The five PRD-only entries flagged by audit row 4 (BLOCKER) gained inline `[NO-PROTOTYPE-YET]` + TODO markers in their existing PRD subsections (`§6.5`, `§7.5`, `§9.5`, `§10.7`, `§11.5`):

| TEC ID | PRD § | Marker added |
|---|---|---|
| TEC-014 Bulk Import CSV | §6.5 :468 | `[NO-PROTOTYPE-YET]` + suggested 3-step wizard sketch |
| TEC-025 BOM Snapshots Viewer | §7.5 :540 | `[NO-PROTOTYPE-YET]` + suggested list + JSON-diff viewer |
| TEC-031 Regulatory Compliance Dashboard | §9.5 :662 | `[NO-PROTOTYPE-YET]` + suggested 7-regulation KPI strip |
| TEC-045 Lab Results Log | §10.7 :766 | `[NO-PROTOTYPE-YET]` + suggested cross-item filter table |
| TEC-052 Cost Import from D365 | §11.5 :810 | `[NO-PROTOTYPE-YET]` + suggested diff-preview workflow |

Each TODO sentence is exactly: `**TODO Prototype creation needed before T3-ui task can be drafted.**` per the task's required wording.

---

## 2. Numbering reconciliation table

Full canonical map appears in `03-TECHNICAL-PRD.md §4A` and `§17`. Summary counts:

| Bucket | Count |
|---|---|
| Original PRD TEC IDs (TEC-010..073) | 33 |
| New PRD TEC IDs (TEC-080..095, with TEC-088 / TEC-093..095 marked cross-tagged) | 16 |
| **Total canonical PRD IDs (post-amend)** | **49** |
| UX IDs reachable (TEC-001..017 + TEC-070..073) | 21 |
| READY (PRD↔UX↔prototype all present) | 23 |
| PARTIAL (some surface embedded / not isolated) | 6 |
| BLOCKER / `[NO-PROTOTYPE-YET]` | 5 |
| UX-MISSING (prototype + PRD present, UX silent) | 1 (TEC-087) |
| PHASE-2 deferred (audit traceability only) | 1 (TEC-092) |
| Cross-tagged (CC-5 candidates for re-tag) | 3 (TEC-093 / TEC-094 / TEC-095) |

Pre-existing audit row mapping (now closed):

| Audit issue (row) | Resolution |
|---|---|
| BLOCKER row 4 — TEC-014/025/031/045/052 PRD-only | `[NO-PROTOTYPE-YET]` markers + TODO lines + §17 status BLOCKER |
| BLOCKER row 5 — Numbering schema diverges | §4A canonical map + §17 master table |
| HIGH row 10 — `eco_change_request_modal` + `eco_approval_modal` orphan | TEC-092 Phase 2 entry (re-anchored, not built) |
| HIGH row 13 — `tooling_screen` orphan | TEC-087 §12A |
| MED row 19 — `traceability_screen` / `nutrition_screen` / `costing_screen` mis-tag | TEC-093/094/095 cross-tagged entries with audit CC-5 reference |
| Direction B orphans (8 prototypes) | All anchored: `tech_dashboard_screen`→TEC-080, `archive_product_modal`→TEC-081, `delete_bom_version_modal`→TEC-082, `bom_graph_tab`→TEC-083, `bom_recipe_sheet_tab`→TEC-084, `spec_review_modal`→TEC-085, `specs_screen`→TEC-086, `maintenance_screen`→TEC-088, `history_screen`→TEC-089, `d365_mapping_screen`→TEC-090, `d365_drift_screen`→TEC-091 |

---

## 3. `[NO-PROTOTYPE-YET]` entries with reasons

| TEC ID | Reason no prototype | Suggested prototype outline (added inline to PRD) |
|---|---|---|
| TEC-014 Bulk Import CSV | UX absent. Prototype-index search returned only an "Import CSV" button stub on `materials_list_screen:1258`; no dedicated 3-step wizard prototype exists. | 3-step wizard: upload → validate → diff preview → confirm. RM-only first; FG/intermediate Phase 2. |
| TEC-025 BOM Snapshots Viewer | UX absent. UX TEC-006 mentions a Snapshot History tab inside BOM Detail (UX:469-471) but no isolated viewer prototype was built. | Filterable list of immutable snapshots per WO + JSON-diff viewer modal showing flattened header / lines / co-prods at snapshot moment. |
| TEC-031 Regulatory Compliance Dashboard | UX absent. UX:875-887 has a 7-preset chip selector inside TEC-014 Shelf-life but no aggregate cross-FG dashboard. | KPI strip per regulation (EU 1169/2011, FSMA 204, BRCGS v9, ISO 22000, EU 2023/915, GS1 Digital Link, Peppol) + per-FG flag table (missing shelf-life / missing allergen declaration / missing BRCGS training link). |
| TEC-045 Lab Results Log | UX TEC-002 has a Lab Results tab as per-item embed only (UX:310). No cross-item aggregate log surface in UX or prototype. | Filterable table (item / WO / test type / result status) + add-result modal + ATP RLU pass/fail visualization (≤10 RLU threshold per §10.6). |
| TEC-052 Cost Import from D365 | UX absent. `d365_item_sync_confirm_modal` (`modals.jsx:475`) handles generic items pull but not the cost-specific diff workflow per §11.5. | D365 cost pull → diff preview table (current vs incoming, % delta, source) → batch confirm with audit note. |

All five carry `**TODO Prototype creation needed before T3-ui task can be drafted.**` inline.

---

## 4. Coverage % estimate (before → after)

Per audit methodology (Direction A coverage of PRD-coded screens against UX + prototype):

- **Before:** ~55% (audit row 1, executive summary). PRD coded 33 TEC IDs; UX coded 21 TEC IDs; numbering schemas divergent; ~12 prototype Direction-B orphans.
- **After:** ~88% estimated. Bidirectional traceability achieved: every PRD ID has a status row; every prototype label has a TEC anchor (or explicit exclusion as primitive / mis-tag candidate). 5 entries remain BLOCKER (NO-PROTOTYPE-YET) — these reduce strict PRD↔UX↔prototype "all green" coverage from a theoretical 100% to ~88%.

This matches the audit's "Spec-only effort ~2.5 pd" estimate for 03-TECHNICAL: this run delivered the spec-side reconciliation (§4A, §17, Direction B closures, NO-PROTOTYPE-YET markers); the remaining work is (a) generating the 5 missing prototypes and (b) the UX-side numbering edit (separate workstream).

---

## 5. Blockers / open items deferred

1. **UX file edits out-of-scope** — UX still uses `TEC-001..017`. The §4A map and §17 master table provide bidirectional traceability without touching UX. UX renumbering must happen in the UX workstream.
2. **Cross-tag decision pending (audit CC-5)** — TEC-093 Nutrition (→ 01-NPD?), TEC-094 Costing (→ 10-FINANCE?), TEC-095 Traceability (→ 05-WAREHOUSE?). Retained in 03-TECHNICAL with explicit cross-tag note. Re-tag decision should be made when 01-NPD / 10-FINANCE / 05-WAREHOUSE PRD amendments run; until then, 03-TECHNICAL is dual-owner of these surfaces.
3. **TEC-024 BOM Generator Modal** — UX modal contract complete (UX:1314-1338); no isolated prototype label, only `tech_modal_gallery` reference. PARTIAL status until isolated prototype is generated. Not a Phase-1 blocker because the contract is fully specified PRD-side.
4. **TEC-051 Cost Edit Modal vs Cost Rollup Recompute Modal** — current prototype `cost_rollup_recompute_modal` covers recompute, not direct cost edit. UX:1220-1235 specs the latter. Either generate an isolated cost-edit modal prototype or remap UX/PRD to point to the recompute flow as the single-modal contract. Flagged PARTIAL.
5. **TEC-073 DLQ vs TEC-091 Drift** — disambiguated this run: TEC-073 = DLQ (transport failures), TEC-091 = Drift (content divergence per V-TEC-73). The single existing prototype `d365_drift_resolve_modal` is now correctly assigned to drift; an isolated DLQ-retry modal prototype is still needed for TEC-073 to flip from PARTIAL to READY.
6. **ADR-034 marker compliance** — verified in §4A and §17. PRD already used generic terms (`product`, `intermediate`, `manufacturing operation`, `ingredient`) consistently from v3.1; no normalization edits required. Markers `[UNIVERSAL]` / `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` / `[LEGACY-D365]` carried through. `[APEX-CONFIG]` (legacy) and `[EVOLVING]` markers are preserved where present in pre-existing PRD content (per ADR-034 they are scheduled to migrate to `[ORG-CONFIG]` / `[INDUSTRY-CONFIG]` in a future pass).

---

## 6. Files modified

- `/Users/mariuszkrawczyk/Projects/monopilot-kira/03-TECHNICAL-PRD.md` (v3.1 → v3.2)
- `/Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/audits/2026-04-30-prd-amendments-03-technical.md` (this report, new)

No other files touched. UX file deliberately untouched per task constraints.
