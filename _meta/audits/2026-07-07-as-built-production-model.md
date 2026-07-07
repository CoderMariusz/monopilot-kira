# AS-BUILT: production model, processes, consumption, UoM, pricing, WO chain

**Date:** 2026-07-07 · **Source:** 6-reader code investigation (file:line verified) triggered by the owner's
12-finding walkthrough. This is the "how it ACTUALLY works" doc to compare against the owner's vision
before the repair waves. Companion plan: `_meta/plans/2026-07-07-owner-walkthrough-repair.md`.

---

## 1. NPD Production tab (owner finding #8) — as-built

**Line is chosen ONCE per project**, not per process: `npd_projects.production_line_id`
(mig 436:55-70, written by `set-production-line.ts`, rendered once in `fa-production-tab.tsx:1592-1609`).
`npd_wip_processes` has **NO line column** (verified across migs 389/429/430/436 — grep 0 hits).
Legacy `prod_detail.line` (per component) exists in DB but is hidden from the grid (`w5-production-constants.ts:2-6`).

**"Dieset" / "Staffing" / "Closed_Production"** — the fields the owner flagged as noise:
- Dieset = renamed `equipment_setup`, auto-derived read-only from the ONE line (rename mig 425:15).
- Staffing = renamed `resource_requirement`, a free-TEXT column per component (seed 095:210-212) —
  duplicates the real roles×headcount model on `npd_wip_process_roles`.
- Closed_Production = per-dept close flag (DeptColumns #39, dropdown CloseConfirm, 095:239-241) feeding
  `fa.dept_closed` outbox — legacy dept-flow artifact in the middle of the production grid.

**Consumption per process DOES NOT EXIST.** Ingredients live only in `formulation_ingredients`
keyed by formulation `version_id` (mig 093:53-76). There is no process→ingredient table (grep
`process_ingredients|wip_process_inputs` → nothing). "Mixing consumes flour+sugar, cooking adds butter"
is **not expressible** — the only approximation is splitting each stage into its own WIP definition
(`wip_definition_ingredients` is definition-scoped, mig 430:26-37).

**Not expressible today (one line each):** per-process line; per-process ingredient consumption;
staged ingredient quantities; per-process equipment; different lines per component (new model);
step-scoped ingredients inside one WIP definition.

## 2. WO chain + why "everything is in one order" (findings #8/#12)

Two independent reasons, both confirmed:

**A. The planning "New WO" modal NEVER runs the chain.** `page.tsx:256` wires `createWorkOrder` →
`createWorkOrderCore` (single WO, zero fan-out). `createWorkOrderChain` is invoked from exactly ONE
place: the NPD **pilot** WO action (`create-pilot-wo.ts:412`). So any WO from Planning = 1 WO always.

**B. Even in the chain, child WIP WOs require FG-BOM lines with `component_type='WIP'`** — and those
are only written by `materializeNpdBom` from formulation ingredients carrying `wip_definition_id`
(materialize-npd-bom.ts:154-156, 657-678). **`npd_wip_processes.creates_wip_item` mints an
intermediate ITEM but never a BOM WIP line** — it feeds only yield compounding (:701-749). So the
owner's approved WIP-creating process → no BOM line → `loadWipBomLines` returns [] → no child WO →
all ingredients land as materials on the single FG WO (core copies ALL bom_lines, no type filter,
`create-work-order-core.ts:219-239`).

**Materials split happens at BOM-materialization time, not WO time**: ingredients linked to a
wip_definition are excluded from the FG BOM and live in the WIP's own BOM (`ensureActiveWipBom`,
materialize-npd-bom.ts:940-981). `npd_wip_processes` is wired into planning ONLY as read-only preview
decoration (chain-preview.ts:137-162).

## 3. WO-create gating (finding #9) — why FG0014 at APPROVAL was plannable

Product picker filter = `item_type in ('fg','co_product') AND status='active'` — **nothing else**
(`wo-form-data.ts:84-102`). No NPD-stage / handoff / release gate exists (grep confirmed). FG items are
minted `status='active'` at **pilot-stage** materialization (`ensureFgItemAndProduct`,
materialize-npd-bom.ts:344-354; runs from create-pilot-wo.ts:365), which ALSO immediately creates an
`approved_for_factory` factory spec (:201-218). Release checks only need active BOM + spec
(`releaseWorkOrder.ts:106-123`) — both satisfied at pilot. **Pre-handoff WO creation is permitted by
design of the current code.**

## 4. UoM model (findings #4/#10)

**THREE parallel vocabularies, inconsistent piece codes:**
- DB `unit_of_measure` (mig 064): categories CHECK `mass|volume|count`; seed kg/g/mg/t, L/mL, **ea**/box/pallet.
  Consumed ONLY by PO/TO line editors (uom-dropdown.ts).
- `UOM_VALUES` const (uom-select.tsx:30): kg,g,l,ml,**pcs**,pack,box,pallet — shared dropdown fallback.
- `CANONICAL_UOMS` const (items shared.ts:53): kg,g,l,ml,**szt** — the CLOSED zod enum for items.uom_base
  (DB column itself is free text, no CHECK — mig 153:16).
- Plus `OUTPUT_UOMS` = base/each/box (pack level, unit-agnostic).

**Adding meters (m+cm) checklist** (from Area C): 1) mig: extend 064 category CHECK + seed m/cm
('length', factor 0.01) + backfill orgs; 2) manage-units zod enum + settings UI; 3) UOM_VALUES append;
4) CANONICAL_UOMS append; 5) item-wizard labels + i18n; 6) items-table display; (PO/TO import + MRP +
scanner are dynamic — no change; OUTPUT_UOMS unaffected).

**Output-UoM at brief (finding #10) — GAP CONFIRMED, mechanism:** output UoM is a *derived side-effect*:
`materialize-npd-bom.ts:340-342` — `pack_weight_g!=null ? (packs_per_case>0?'box':'each') : 'base'`;
`uom_base='kg'` hardcoded. Brief has NO output-UoM field (grep zero). Two failure paths: (1) FG first
materialized before weight set → stays 'base' forever (`on conflict do nothing`; base→each upgrade only
on a LATER materialize); (2) brief edited after handoff syncs only `each_per_box`, NOT
net_qty_per_each/output_uom (`update-project-brief.ts:206-218`). Live check: FG0014 = uom_base kg,
output_uom **box**, net_qty_per_each 0.25 — so the box path worked here; the missing piece is an
EXPLICIT choice at brief + re-sync on edit + a pieces-native base option.

## 5. Pricing fields (findings #5/#7)

| UI row (item Overview) | Source | Meaning |
|---|---|---|
| **Effective cost X (source)** | view `v_item_effective_cost` (mig 405): fallback `item_cost_history` (open row) → `supplier_specs.unit_price` (active+approved) → `items.list_price_gbp` | the cost the engines use; "(List price)" suffix = it FELL BACK to sell price |
| **Cost / base UoM** | `items.cost_per_kg` | standard cost — wizard never sets it → always "—" |
| **List price (GBP/base UoM)** | `items.list_price_gbb` | SELL price (shipping/PO fallback) |

**Buy/sell writes are separate** since commit 08342a2b (supplierUnitPrice → supplier_specs.unit_price;
listPriceGbp → items.list_price_gbp; unit-proven). **Why it LOOKS like one field:** (a) Overview has NO
"Supplier price" row at all; (b) with no cost-history/spec, effective cost coalesces to list price → same
number twice; (c) the spec insert is savepoint-wrapped WARN-ONLY (create-item.ts:129-136) — if it fails,
the buy price silently vanishes and effective cost shows "(List price)" — which is exactly what the owner
observed, i.e. evidence his spec row didn't land active+approved.

**Save bug (#7) root cause:** the historical F5 defect — old wizard called createItemSupplierSpec AFTER
createItem committed; the second call failed → false error while the item HAD persisted → every retry hits
`unique(org_id,item_code)` → `already_exists` → "cannot save even after clearing price". Fixed 2026-07-01
(5b8e7afd) + 08342a2b; regression-tested. **Residual today:** any half-created item still blocks its code
with a misleading generic error; Overview still hides the buy price.

## 6. Process cost + duplication (finding #8 tail)

**Prefill from process defaults is PARTIAL — a real bug:** `handlePick` (fa-production-tab.tsx:1114-1146)
copies name/duration/standardCost/roles but **hardcodes yield=100 and never passes
throughput_per_hour/uom/setup_cost** (schema defaults 0/'kg'/0) — despite mig 429/440 comments saying
"copied at prefill" and the payload carrying them (process-defaults-actions.ts:160-162). Same gap in
wip-process-chain-editor.tsx:380-383. So the owner re-enters throughput/yield per product — the
duplication he flagged.

**Handoff routing materialization**: `run_time_per_unit_sec = 3600/throughput`, crew jsonb from roles,
yield copied; **setup_cost + duration NOT carried; routing_operations.yield_pct is write-only** (no reader).

**Cost formulas as-built** (compute-waterfall.ts:332-354):
- crewRate = Σ(rate/h × headcount)
- throughput path: perPack += (crewRate / throughput_per_hour) × unitToPackFactor + additionalCost/packsPerBatch
- legacy duration path (no throughput): perPack += (crewRate × durationHours + additionalCost) / packsPerBatch
Owner's mental model ("duration ÷ producible units") = the legacy path; with throughput set it is
crew£/h ÷ units/h — correct shape, but only if throughput is actually filled (see prefill bug above).

## 7. Small UX findings (#1/#2/#3/#11/#12a)

- **#1 Lines edit:** UI-only gap — `upsertLine` already supports id+update (line.ts:50-88); screen has
  create+bulk activate/deactivate only. Effort S-M.
- **#2 Labor rates:** append-only BY DESIGN (audit trail; header comment says "NEVER edited in place").
  Need decision: in-place edit (M) vs "duplicate with corrected value" flow (S, works today).
- **#3 Shelf life:** already optional (nullable end-to-end); tickbox that disables+clears 2 fields = S.
- **#11 QA "Unable to update output QA":** generic message = `invalid_input` OR thrown exception
  (wo-detail-screen.tsx:630-635). Prime suspect (missing v_active_holds.reference_text) RULED OUT on
  live (column exists). Needs reproduction with server logs; candidates: holdsGuard LP branch exception,
  zod input, org-context. Effort S once reproduced.
- **#12a Overview total yield:** does not exist; total = Π(npd_wip_processes.yield_pct) — the compounding
  math already exists in materialize (`compoundedYieldPctForComponent`). Effort S.

## 8. Vision vs as-built — the core mismatch (owner's target model)

Owner's target: **add process → pick LINE → pick CONSUMED ingredients for that process → repeat;
packaging is also a process on a line; WO fans out per process-stage with the right components.**

| Vision | As-built | Gap class |
|---|---|---|
| Line per process | Line per project | schema + UI |
| Ingredients consumed per process | Ingredients per formulation version only | schema + UI |
| Process → WO stage with its consumption | Chain fans out only on wip_definition-linked BOM lines; planning modal never chains | wiring |
| Packaging as a process (staffing/line load) | Packaging is components-only (packaging_components), no process | model extension |
| Throughput/yield entered once (on process), lightly editable per product | Re-entered per product (prefill bug) + third copy on routing | bug + design |
| WO only after handoff | WO possible from pilot-stage materialization | gating |
| Output UoM chosen at brief | Derived from pack_weight at materialize; no field; no re-sync | schema + UI |
