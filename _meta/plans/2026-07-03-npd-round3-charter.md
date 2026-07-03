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

## Owner rulings D19-D40 (2026-07-03)

- **D19** packs-per-box: ONE field (`npd_projects.packs_per_case`) editable from BOTH Brief and the packaging modal header.
- **D20** ALL packaging lines entered per full box.
- **D21** packaging waste: NOT from the component scrap field → separate waste input at costing (shape = follow-up D41).
- **D22** "batch" = manually entered avg batch, persisted per project (`avg_batch_kg`… unit per D40/D42 semantics).
- **D23** yield REQUIRED before costing computes (no silent 100%).
- **D24** process model = THROUGHPUT (kg/h; owner: "robimy to dobrze i dokładnie") + weekly volume → line time.
- **D25** setup cost PER PROCESS; runs/week = REQUIRED Brief field (universal field regardless of product).
- **D26** overhead = £/kg rate, org default in Settings + per-project override; orchestrator picks the Settings home → Settings › NPD › Cost parameters (new section, next to npd-approval).
- **D27** logistics = simple org £/box rate now; branch to grow later.
- **D28** Distributor/Retail rows REMOVED from waterfall until real trade terms exist.
- **D29** WIP-first recursion CONFIRMED, full depth. Owner warning: this creates many complex items/BOMs per project — design carefully + real tests.
- **D30** weekly volume = numeric packs/week, field in Brief.
- **D31** line run-rate: line-level default + per-product override in Production section.
- **D32** WIP sharing = REFERENCE to a WIP definition (not copy).
- **D33** WIP chain edits: notify + per-FG approval (no silent propagation).
- **D34** one org-wide WIP item (shared dough) CONFIRMED; code from mask, name user-given.
- **D35** WIP library lives in TECHNICAL (editing existing WIPs is Technical's domain, not NPD). Recipe dropdown shows all org WIPs.
- **D36** checklist remap of the 13 misplaced items APPROVED wholesale.
- **D37** template changes SYNC to open projects, preserving checked state.
- **D38** checklist stays ADVISORY for now.
- **D39** pilot WO MUST be created from a production line; line list filtered by the top-bar site (All sites → all lines). NPD can serve 2 sites; at handover the product lands in that line's site.
- **D40** pilot WO qty in the FG's BASE UNIT (each→each, kg→kg) = the WO-output base unit, not always kg.

## Owner rulings D41-D44 (2026-07-03)

- **D41** packaging waste: PER COMPONENT — each packaging line has its own waste %.
- **D42** throughput unit = the PROCESS OUTPUT unit (smoke kg/h, packing pack/h). That unit
  ALSO becomes the created WIP's base unit when the process creates a WIP.
- **D43** = option (a) **BOM PER LEVEL** — explicitly so WIPs are reusable across other
  production (owner example: gold+copper mix WIP → ring FG1 + chain FG2 + chain2 FG3).
  Both raw components AND the finished mix (WIP) must be STORABLE (WIP = stockable
  item/LP in the warehouse). Sub-question (pilot chain vs single WO) carried to U4.
- **D44** handoff site: DEFAULT from the pilot line's site, editable at handoff.

## Owner rulings U1-U4 (2026-07-03) — CHARTER CLOSED

- **U1** waste % = column in the packaging modal component table (costing reads it).
- **U2** ALL approved: 3 value columns at once (£/kg | £/pack | £/batch, no toggle);
  Setup as its OWN waterfall row; row order = Raw materials → Yield → Process labour →
  Setup → Packaging → Overhead → Logistics → **Total cost** → Margin vs target price.
- **U3** the existing `creates_wip_item` toggle IS the storable-WIP decision (weigh/store);
  ADD a separate `reusable` flag = explicit publication to the Technical library.
  Change approvals: banner on referencing projects PLUS a notification inbox; once an FG
  is IN PRODUCTION and the WIP formula changes, each FG must receive update + accept.
- **U4** pilot = FULL CHAIN (WO for the WIP → WO for the FG), consistent with per-level BOMs.

Build plan: `_meta/plans/2026-07-03-f-npd3-wave-plan.md`.

## Bug fixes needing NO ruling (queued for the build wave regardless)
- `resource_requirement`→`staffing` mapping (and audit ALL catalog keys vs product-view columns; fix equipment_setup mapping too).
- Pilot WO: explicit siteId (from picker per D39), items-row guarantee at FG creation, WO mask seed for org, `documentNumber` override in createWorkOrderCore (kills rename+orphan class), specific error surfaces instead of one generic toast, permission bundle fix.
- Unify costing Path A/B raw-cost math (Path A qty-based wins).
- Checklist seed-trigger text refresh (mig-254 parity).
