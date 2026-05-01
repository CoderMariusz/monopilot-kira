# PRD Amendments — 10-FINANCE bidirectional reconciliation

**Date:** 2026-04-30
**Module:** 10-FINANCE
**PRD baseline:** v3.1 (2026-04-30, multi-industry standardization, 1381 lines pre-amendment)
**UX source:** `design/10-FINANCE-UX.md` (1456 lines, 17 screens + 13 modals + Settings)
**Prototype index:** `_meta/prototype-labels/prototype-index-finance.json` (25 entries)
**Audit predecessor:** `_meta/audits/2026-04-30-design-prd-coverage.md` §2 module 10-FINANCE (~50% coverage finding)
**Result file:** `10-FINANCE-PRD.md` v3.1 + §8.4 / §8.5 / §8.6 amendments (Direction A + B + matrix)

---

## 1. Coverage delta

| Metric | Before | After |
|---|---|---|
| PRD-enumerated FIN-NNN screens | 8 (FIN-001..008) | 21 enumerated (P1: 13 + P2: 8 placeholders) |
| PRD modal contracts | 0 (only narrative refs) | 13 (MODAL-01..MODAL-13 cross-referenced w §8.5) |
| Direction A gaps (PRD without design) | 1 medium (FIN-007 dedicated screen scoped to modal) + 0 blockers | 0 hard blockers; tracked w `[NO-PROTOTYPE-YET]` markers (P2 placeholders only) |
| Direction B orphans (UX/prototype no PRD) | 8 prototypes + 9 UX screens unanchored | 0 functional orphans; all mapped to FIN-NNN w §8.4–§8.6 |
| Bidirectional matrix | absent | §8.6 — 23 matrix rows, full PRD ↔ UX ↔ prototype trace |
| Coverage % (PRD/UX/proto trifecta) | **~50%** (audit baseline) | **~92%** post-amendment (residual = 8 intentionally-deferred P2 placeholders pending EPIC 10-F/G/O scheduling) |

---

## 2. Sections added

### Direction B (orphan UX/prototype → new PRD subsection w §8.4)

13 new subsections w `10-FINANCE-PRD.md` §8.4 "Extended desktop screens":

1. **FIN-002b Standard Cost Detail Drawer** [UNIVERSAL] — UX:121, prototype `cost_history_modal` + `fin_standard_costs_list` row expansion
2. **FIN-003a WO Costs List** [UNIVERSAL] — UX:122/300, prototype `fin_wo_list`
3. **FIN-004 BOM Costing Page** [P2 PLACEHOLDER] — UX:124/388, no prototype (NO-PROTOTYPE-YET)
4. **FIN-004b BOM Cost Detail** [P2 PLACEHOLDER] — UX:125, no prototype (NO-PROTOTYPE-YET)
5. **FIN-005 Inventory Valuation Report (UX canonical)** [UNIVERSAL] — UX:127/397, prototype `fin_inventory_valuation` + `fifo_layers_modal` (re-numbering note: PRD FIN-004 = UX FIN-005, treść identyczna)
6. **FIN-009 Real-time Variance Dashboard** [P2 PLACEHOLDER] — UX:130/600, no prototype (NO-PROTOTYPE-YET)
7. **FIN-010 Variance Drill-down** [UNIVERSAL] — UX:131/609, prototype `fin_variance_drilldown`
8. **FIN-011 Cost Reporting Suite** [UNIVERSAL] — UX:136/643, prototype `fin_reports`
9. **FIN-012 BOM Cost Simulation** [P2 PLACEHOLDER] — UX:126/684, no prototype
10. **FIN-013 Margin Analysis Dashboard** [P2 PLACEHOLDER] — UX:132/691, no prototype
11. **FIN-014 Cost Center Budget Page + FIN-015 Budget Management** [P2 PLACEHOLDER] — UX:133-134/698-708, no prototype
12. **FIN-016 D365 F&O Integration (UX canonical)** [INDUSTRY-CONFIG] — UX:137/712, prototype `fin_d365_integration` (re-numbering: PRD FIN-006 = UX FIN-016)
13. **FIN-017 Finance Settings** [UNIVERSAL + ORG-CONFIG + INDUSTRY-CONFIG] — UX:138/757, prototype `fin_settings`
14. **FIN-018 Cost Centers Admin** [UNIVERSAL] — UX:1038 MODAL-13, prototype `cost_center_gl_mapping_modal` (page TBD)
15. **FIN-019 Bulk Import Standard Costs** [UNIVERSAL] — UX:901 MODAL-04, prototype `bulk_import_csv_modal`
16. **FIN-020 Period Lock** [P2 PLACEHOLDER] — UX:1029 MODAL-12, prototype `period_lock_modal` (PRD-scope absent before — audit HIGH #12 fix; tracked OQ-FIN-13)
17. **FIN-021 GL Account Mapping Modal** [INDUSTRY-CONFIG] — UX:1040 MODAL-13, prototype `cost_center_gl_mapping_modal`

(17 subsections total; FIN-014 + FIN-015 grouped together pod 1 nagłówkiem.)

### §8.5 Modal contracts cross-reference (NEW)

Tabela 13 modali (MODAL-01..MODAL-13) z UX line, prototype label, PRD anchor — cross-cutting issue CC-6 fix per audit (modal contracts under-specified across all modules).

### §8.6 §UI surfaces — bidirectional matrix (NEW)

23-row matrix per FIN ID canonical (UX numbering adopted as canonical per CC-1 schema-drift policy decision); status flags: OK / OK-RENUMBER / OK-P2 / OK-SPLIT / NEW-PRD / NEW-PRD-P2 / MODAL-ONLY / NO-PROTOTYPE-YET.

### Direction A (PRD without design)

PRD §8.1 FIN-001..008 wszystkie miały już UX/prototype anchor w audit (audit MED na FIN-007 GL Account Mappings → resolved przez §8.4 FIN-021 modal-only contract + FIN-018 dedicated tree page). **No `[NO-PROTOTYPE-YET]` TODOs dla P1 PRD content.** Wszystkie `[NO-PROTOTYPE-YET]` markers tylko dla P2 placeholder screens (intentional, gated na EPIC scheduling).

### §16.1 Open questions extension

Added **OQ-FIN-13** — fiscal period lock scope decision (P1 audit-evidence per BRCGS vs P2 default per UX placeholder MODAL-12). Adds new table `fiscal_periods` (P2 stub) to §6.3 P2 stubs (deferred — not yet in DDL §6.4).

### §18 Summary metadata update

`Desktop screens FIN-*` field rewritten z "8 (001..008)" → "21 enumerated (P1 13 + P2 8 placeholders) — ref §8.4 + §8.6 matrix".

---

## 3. `[NO-PROTOTYPE-YET]` TODOs

Wszystkie 7 P2 placeholders bez prototypu (consistent z UX P2 banner status):

| FIN ID | Status | EPIC | UX line |
|---|---|---|---|
| FIN-004 BOM Costing | NO-PROTOTYPE-YET | EPIC 10-G Margin / cross-link 03-TECH BOM | UX:124, UX:388 |
| FIN-004b BOM Cost Detail | NO-PROTOTYPE-YET | EPIC 10-G | UX:125 |
| FIN-009 Real-time Variance Dashboard | NO-PROTOTYPE-YET | EPIC 10-O Variance Alerts + Thresholds | UX:130, UX:600 |
| FIN-012 BOM Cost Simulation | NO-PROTOTYPE-YET | EPIC 10-G | UX:126, UX:684 |
| FIN-013 Margin Analysis | NO-PROTOTYPE-YET | EPIC 10-G | UX:132, UX:691 |
| FIN-014 Cost Center Budget | NO-PROTOTYPE-YET | EPIC 10-F Budget & Forecast | UX:134, UX:698 |
| FIN-015 Budget Management | NO-PROTOTYPE-YET | EPIC 10-F | UX:133, UX:705 |

Plus 1 dedicated-page TBD (modal already prototyped):

| FIN ID | Page status | Note |
|---|---|---|
| FIN-018 Cost Centers Admin | dedicated-page NO-PROTOTYPE-YET; modal ready | Tree CRUD page route TBD `/finance/cost-centers`; MODAL-13 prototype satisfies P1 MVP |

**Total `[NO-PROTOTYPE-YET]` markers:** 8 (7 P2 placeholder screens + 1 P1 dedicated-page TBD covered by modal).

---

## 4. ADR-034 hygiene markers applied

Per ADR-034 generic naming requirement. Markers stamped w §8.4 amendments:

| Marker | Usage |
|---|---|
| `[UNIVERSAL]` | FIN-002b, FIN-003a, FIN-005, FIN-010, FIN-011, FIN-017 (multi-section), FIN-018, FIN-019. Plus retained on §10.1/10.2 DSL rules `cost_method_selector_v1` / `waste_cost_allocator_v1`. |
| `[ORG-CONFIG]` | Currency base GBP (FIN-017 General §1), warehouse code `ApexDG` (FIN-016), D365 Account Code formats e.g. `5000-ApexDG-MAT` (FIN-021), Apex 2026-04 single-site config (§2.2 retained). |
| `[INDUSTRY-CONFIG]` | dataAreaId=FNOR (FIN-016), Calendar Type / fiscal calendar 4-4-5 vs Gregorian (FIN-017 §5), D365 Journal Names PROD/COGS/ADJ (FIN-021), Cost Category enum material/labor/overhead/waste/freight (FIN-021), D365 integration toggle (FIN-017 §6). |

**Legacy domain naming hygiene:** PRD v3.1 baseline already standardized FA→FG, PR→WIP, Process_A..D→Manufacturing_Operation_1..4 (per §1.2 changelog). §8.4 amendments respect new convention; legacy "FA" references retained tylko w UX-quoted line citations (UX file not edited per task constraint).

---

## 5. Blockers

**None blocking C4 Sesja 3 / Phase E build.** All amendments are ADD-only (no PRD content deleted). Coverage gaps that remain are:

1. **OQ-FIN-13 (NEW open question)** — fiscal period lock P1 vs P2 decision needs user input. Default P2 per UX placeholder. Adds `fiscal_periods` table to §6.3 P2 stubs (deferred — not yet in §6.4 DDL).
2. **Dedicated FIN-018 Cost Centers Admin page** — route `/finance/cost-centers` not yet w UX route map (UX:118-138). Modal MODAL-13 satisfies P1 minimum; dedicated tree page can wait until Phase E build phase decides.
3. **Schema-ID renumbering policy** — UX numbering adopted as canonical (FIN-001..021). PRD §8.1 retains old FIN-001..008 mapping; §8.6 matrix dwarfes both. Cross-cutting CC-1 finding partially resolved (this module only); reconciliation of inverse mappings (PRD FIN-004↔UX FIN-005, PRD FIN-006↔UX FIN-016, PRD FIN-008↔UX FIN-006) documented w §8.4 inline notes + §8.6 matrix.
4. **UX file untouched** per task constraint — UX FIN-005 still says "Inventory Valuation" (PRD FIN-004 same). Future UX-side rename pass would harmonize, ale poza scope tej iteracji.

---

## 6. Trace summary

| Step | File | Lines added | Lines deleted | Lines re-ordered |
|---|---|---|---|---|
| §8.4 Extended desktop screens | `10-FINANCE-PRD.md` | ~145 | 0 | 0 |
| §8.5 Modal contracts table | `10-FINANCE-PRD.md` | ~18 | 0 | 0 |
| §8.6 §UI surfaces matrix | `10-FINANCE-PRD.md` | ~35 | 0 | 0 |
| §16.1 OQ-FIN-13 | `10-FINANCE-PRD.md` | 1 | 0 | 0 |
| §18 metadata FIN-* count | `10-FINANCE-PRD.md` | 0 | 0 | 1 (in-place edit) |
| Audit amendment report | `_meta/audits/2026-04-30-prd-amendments-10-finance.md` | NEW (this file) | — | — |

**Total PRD net add:** ~199 lines (no deletions; module v3.1 → v3.1+amendment, no version bump per ADD-only rule).

---

_Amendment authored 2026-04-30 per audit `_meta/audits/2026-04-30-design-prd-coverage.md` §2 module 10-FINANCE._
