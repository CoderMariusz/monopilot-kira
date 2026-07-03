# NPD round-3 charter — pack/box units, real costing model, reusable WIPs, gate checklists, pilot WO

Date: 2026-07-03 · Owner feedback after his post-F6.1 walk · Investigation: 3 read-only lanes (I1 costing, I2 production/WIP, I3 pilot-WO/checklists), all file:line-evidenced.

## Ground truth (investigation findings)

### Costing (I1)
- TWO disconnected compute paths: Path A `recomputeCalc` (formulation save → `formulation_calc_cache`, v2 qty×cost per-pack math, pack_weight-aware) vs Path B waterfall (`compute.ts` — legacy pct×cost_per_kg SQL, ignores the cache). They can disagree on raw cost.
- Waterfall rows: Raw materials + Yield + Margin = real (Path B math); **Process labour / Packaging / Overhead / Logistics / Distributor / Retail = hardcoded '0'** at bootstrap (compute.ts:303-309). What-if sliders exist for only 3 of 9 params.
- **Per kg / Per pack / Per batch toggles are cosmetic** — `unit` state never read in display (costing-screen.tsx:283,537). Confirms owner's report.
- WIP process cost engine EXISTS (`npd_wip_processes` + `npd_wip_process_roles`, `computeWipProcessCost` = Σ(rate×headcount)×duration + additional; snapshot rates from `labor_rates`) and renders on the FG page — but is NEVER bridged into the waterfall. `computeWipComponentCost` (RM+processes)/yield exported with zero production callers.
- Unit data present: `pack_weight_g`, `packs_per_case`, `items.each_per_box`, `net_qty_per_each`, `bom_headers.line_basis`. MISSING: numeric weekly volume (`expected_volume` is free text), line run-rate (packs/h), setup cost, runs/week, overhead/logistics/markup sources.
- Packaging cost path: components + `supplier_specs.unit_price` + per-component scrap exist; NO code computes packaging £/pack into the waterfall.

### Production save bug + WIP model (I2)
- **BUG root cause (prime): field catalog registers `Resource_Requirement` (mig 333:253) but the `public.product` VIEW (mig 359:96) exposes it as `staffing`** → `assertProductColumn` throws COLUMN_NOT_IN_PRODUCT → generic "Could not save the Production section." Dormant sibling: `equipment_setup` vs view's `dieset` (currently shielded by AUTO_DERIVED_KEYS). Also: component-index arg silently ignored by updateFaCell (multi-component last-write-wins, semantic bug); add-component errors share the same generic string.
- WIP model: `npd_wip_processes.prod_detail_id NOT NULL` — every process chain is welded to one FG's prod_detail row. No WIP template/chain entity; `ensureWipItem` mints a NEW intermediate item per process instance (same dough → duplicate items); no pick-existing-WIP UI/action; `npd_process_defaults` is per-operation scalars, not chains.

### Pilot WO + checklists (I3)
- Pilot WO ranked failure modes: (1) `no_active_site` under top-bar "All sites" (F10 class), (2) FG in `product` but not `items`, (3) missing WO code-mask row, (4) user lacks `npd.planning.write` (core requires it BESIDES `npd.pilot.write`), (5) BOM product_id/item_id mismatch → silent no-BOM WO, (6) rename failure → orphan WO + duplicate on retry, (7) pack_hierarchy_incomplete. Pilot modal collects plannedDate/line/batchSizeKg/… but passes almost none to createWorkOrder (no scheduled date; qty falls back to '1').
- Checklists: templates in `Reference.GateChecklistTemplates` (mig 092/101/254), copied per project AT CREATION (no backfill), ADVISORY-only, NO Settings UI (table+RLS ready). 13 items misplaced vs stage reality (full inventory in I3 report — e.g. G3 requires Sensory/Costing/Nutrition/Label which happen later; G2 requires Target cost/margin which is costing_nutrition). Seed trigger still emits pre-254 text for new orgs.

## Owner's target model (from feedback, my synthesis)
1. Unit ladder: **recipe per single pack → packaging per full box (packs-per-box header) → costing per kg / pack / batch with real conversion**.
2. Costing = components (RM per pack, packaging per box amortized, waste on packaging) + processes (labour = rate×headcount×time, throughput-based line time from weekly volume, setup amortized by runs/week) + WIP-first recursion for multi-process products.
3. Reusable WIPs: pick existing WIP in recipe → imports its process chain; shared dough across bread+roll.
4. Gate checklists stage-accurate + configurable in Settings (+ custom items).
5. Pilot WO must work.

## Question set → sent to owner as D19-D40 (Polish message 2026-07-03)
See the conversation message; answers to be recorded here as rulings.

## Bug fixes needing NO ruling (queued for the build wave regardless)
- `resource_requirement`→`staffing` mapping (and audit ALL catalog keys vs product-view columns; fix equipment_setup mapping too).
- Pilot WO: explicit siteId (from picker per D39), items-row guarantee at FG creation, WO mask seed for org, `documentNumber` override in createWorkOrderCore (kills rename+orphan class), specific error surfaces instead of one generic toast, permission bundle fix.
- Unify costing Path A/B raw-cost math (Path A qty-based wins).
- Checklist seed-trigger text refresh (mig-254 parity).
