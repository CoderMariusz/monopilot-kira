# DB cleanup audit — 2026-06-30 (7-run multi-agent: Codex + Claude)

Owner asked for a comprehensive DB→app audit (duplicates, dead columns/tables, missing
elements, single-source for price/units/quantity, logical holes). Ran **7 read-only lanes**
(3 Codex via codex-rescue + 4 Claude via kira-research). This is the synthesis + a prioritized
remediation plan. **Nothing here is auto-fixed** — cleanup = structural decisions; owner picks.

Evidence = code (migrations `packages/db/migrations/*`, `packages/db/schema/*`, app `apps/web/**`).
Live-data confirmation is mostly N/A right now (org -002 was just wiped to a clean field), so
findings are code-structural (they hold regardless of data); flagged items need live re-check
once the owner re-enters data.

---

## A. Confirmed: the "rozjazdy" are real — price/units are NOT single-source

### A1. PRICE / COST is scattered across 6+ columns, read inconsistently (HIGH)
Same business value lives in many places; different consumers read different ones:
- `items.cost_per_kg` (no currency col) — denormalized standard cost (ledger `item_cost_history` is SoT).
- `items.list_price_gbp` (GBP) — user-entered "List price".
- `supplier_specs.unit_price` + `price_currency` — purchase price per supplier (mig 392).
- `purchase_order_lines.unit_price` — transactional snapshot (correctly historical).
- `formulation_ingredients.cost_per_kg_eur` (EUR) — recipe snapshot.
- `packaging_components.cost_per_unit` (no currency) / `standard_costs` (unused).

Divergences (each = a real bug class, like the ones already fixed this session):
- **GBP stored as EUR with NO FX**: recipe cost = `coalesce(items.cost_per_kg, list_price_gbp)` → written to `formulation_ingredients.cost_per_kg_eur` → consumed as `rawCostEur`. A GBP number labelled EUR. (`save-draft.ts:127`→`compute.ts:263`).
- **`items.cost_per_kg` has no currency** yet is mapped to `costPerKgEur` (search-items, to-form-data) and hardcoded PLN in portfolio cost / disassembly. (lane 4 #3)
- PO prefill reads supplier_spec→list_price; recipe reads cost_per_kg→list_price; BOM cost reads only cost_per_kg; WO actual cost reads item_cost_history→cost_per_kg. **None agree.**
- **Recommendation (P1):** one `getEffectiveCost(itemId, currency, date)` resolver (supplier_spec → ledger → list_price priority, returns `{amount, currency, source}`), called by ALL consumers; add a currency column wherever cost is stored; decide GBP vs EUR base + a real FX or single-currency policy.

### A2. UNITS — silent wrong-magnitude fallbacks (HIGH)
- **per_box → per_base silent fallback (HIGH, ~×kg_per_box overstatement):** `computeWoMaterialScalar` returns raw `plannedBaseQty` when `each_per_box` OR `net_qty_per_each` is NULL on a per_box BOM → material requirement inflated by the kg-per-box factor (e.g. 5× for a 5kg box). Affects createWorkOrder/update-work-order/mrp. (lane 5 RISK-3, lane 6 Gap A) `lib/production/wo-material-scalar.ts:21`.
- **`items.uom_base` unconstrained free-text** ('kg'/'szt'/'each'…): MRP `normalizeToBaseMicro` silently EXCLUDES demand/supply whose uom it can't map → buckets vanish from netting with no error. (lane 5 RISK-4)
- **`output_uom` never set to 'box'** by materialize (only 'each'/'base'); relies on WO entry being 'each'. (lane 5 RISK-1)
- **SO/shipping chain has NO uom column** on sales_order_lines/inventory_allocations/pick_list_lines/shipment_box_contents → cross-uom comparisons unguarded. (lane 5 RISK-8, lane 6 Gap G)

### A3. QUANTITY / YIELD (HIGH)
- **`work_orders.actual_qty` is NEVER written** → `yield_percent` (generated from it) is permanently NULL → every yield KPI/finance view shows NULL. `produced_quantity` likewise never written by production. (lane 6 Gap C, lane 7 — dashboards instead aggregate wo_outputs directly)
- **`item_wac_state` never written by the app** → Finance → Inventory Valuation JOINs it → shows £0 for ALL items regardless of stock. (lane 7 H4) — needs a WAC write path on GRN/output/adjust.
- **`packaging_components.qty_per_pack` has no write path** (mig 350 column, not in the upsert schema/UI) → materialize defaults `coalesce(qty_per_pack,1)` → multi-unit packs computed at 1/pack. (lane 6 Gap B, lane 7 M3)
- **0-qty PRIMARY output stub** created at WO start; aggregates that don't filter it under-count. (lane 6 Gap, prior 2026-06-24 finding)
- **Mass-balance / close-time yield-release UNBUILT** (the mig-335 design `released_qty`/`needs_reweigh` columns never created). (lane 6 Gap D)

---

## B. Double-maintained entities (DUPLICATES, lane 1) — drift HIGH
- **product ↔ items ↔ product_legacy ↔ fg_npd_ext:** `public.product` is now a VIEW over items (mig 359), `product_legacy` is an FK-anchor skeleton, `fg_npd_ext` is a half-finished bridge with many always-null columns. NPD writes via the `product` view (3-way fan-out); Technical writes `items` directly. The P2 product→view merge is PARKED. → finish the merge or freeze direct product-view writes. (lane 1 F3)
- **npd_projects ↔ fg_npd_ext ↔ items** (name/pack_weight/packs_per_case/shelf_life): copied on materialize with `coalesce`, NOT continuously synced → editing the project after release doesn't propagate. (lane 1 F4, lane 7 H3) → one "publish project FG attrs" function.
- **Allergens — 7+ stores:** `item_allergen_profiles` (item SoT) + `fa_allergen_overrides` + Reference.Allergens/_by_RM/_added_by_Process + `nutrition_allergens` + `manufacturing_operation_allergen_additions` + `npd_wip_processes`; derived snapshots (`fg_npd_ext.allergens`, `formulation_ingredients.allergens_inherited`, `nutrition_allergens`) can go stale. (lane 1 F6) → stamp `recomputed_at` + force recompute before approval.
- **Process model split:** legacy `prod_detail.manufacturing_operation_1..4` + `fg_npd_ext.process_1..4` vs new `npd_wip_processes` (target SoT). Old cols KEPT pending S5 repoint. (lane 1 F7)

---

## C. Dead / unused — drop or repurpose (lane 2)
**Drop candidates (never written by app):** placeholder tables `lot`, `quality_event`, `bom_item`, `shipment` (mig 014); `Reference.FieldTypes`, `Reference.Formulas`; capacity tables `capacity_plans`/`_lines`; finance `wo_actual_costing`/`inventory_cost_layers`/`cost_variances`/`d365_finance_dlq`; `fa_bom_view` (returns 0 rows by design); `work_order_items` (empty shell); ~30 dead `product` columns (number_of_cases, cases_per_week_*, pr_code_*, dieset, pallet_stacking_plan, …) + their `fg_npd_ext` mirrors; R13 placeholder cols (`model_prediction_id`/`epcis_event_id`/`schema_version`/`created_by_device` on items/product/users/organizations); WO `disposition_policy`/`routing_id`/`factory_release_status_at_creation`; `bom_headers.technical_review_requested_*` (read in SELECT* never written).
**REUSE opportunities (schema ready, no code):**
- `items.default_line_id` (FK to production_lines, indexed) → default line on WO creation.
- `work_orders.is_rework` + `released_to_warehouse` (booleans, indexed) → rework tracking / warehouse release gate.
- `packaging_components.artwork_file_id`/`artwork_status` → wire Supabase Storage artwork upload.
- `standard_costs` (full table, RBAC-seeded) → standard-cost targets + variance vs actual.
- `items.gs1_gtin` (written, UI doesn't surface) → barcode display.

---

## D. Missing / integrity gaps (lane 3) + new-org seeding
- **`public.user_sessions` table referenced but DOES NOT EXIST** → `reset-password.ts:99` `UPDATE user_sessions …` will throw 42P01 at runtime. (HIGH) → create the table or remove the call.
- **Missing FKs (shipping):** `sales_order_lines.product_id`, `inventory_allocations.license_plate_id`, `shipment_box_contents.license_plate_id` → orphan-data risk. (HIGH)
- **New-org seeding gap:** a fresh org has NO default warehouse/location → production output (LP create) fails; also `org_sequences`, UoM, `costing_margin_warn_pct` threshold. (HIGH) → add an org-insert seed/trigger. (Relevant NOW — DB just wiped; owner must hand-create a warehouse+location before receiving.)
- **Missing CHECKs:** non-negative quantity/price on shipping lines, credit_limit, allocated/picked/packed/shipped. (MED)
- **Missing composite indexes:** shipments(org_id,status,created_at), maintenance_work_orders(org_id,state). (MED)
- **WO BOM lookup by legacy text `product_id`** (createWorkOrder, factory-specs, materialize nextBomVersion) works only via the dual-write trigger — latent break if trigger dropped. (MED/LOW, lane 7 M5/L1)

---

## E. Logical holes — write→read source mismatches (lane 7) — same class as the bugs already fixed
- **H1 (HIGH):** BOM detail header reads `public.product.product_name`; for Technical-only FGs that's null, and after an item rename it's stale (no `UPDATE product` on item edit). Fix: read `items.name`. (`bom/detail-page.ts:222`)
- **H2 (HIGH):** Batch BOM generator eligibility reads `product.status_overall='complete'` (NPD-only) → Technical FGs with `items.status='active'` never appear. Fix: join `items WHERE item_type='fg' AND status='active'`. (`bom/queries.ts:205`)
- **H3 (HIGH):** brief `packs_per_case` edit not synced to `items.each_per_box` until next materialize → WO snapshot stale per-box count. Fix: sync on brief save.
- **H4 (HIGH):** `item_wac_state` never written → valuation £0 (see A3).
- **H5 (HIGH):** nutrition allergen codes copied verbatim (mixed 'A01'/'gluten') → LEFT JOIN Reference.Allergens null display name → unreadable badges. Fix: `normalize_allergen_code()` at compute. (`nutrition compute.ts:98`)
- **M4:** Nutrition panel name from `public.product` (same root as H1). **L3:** packaging cost_per_unit no auto-fill from supplier_spec (PO has it, packaging doesn't). **L4:** OEE snapshot writer (`oee-snapshot-producer.ts`) not wired to any API route → OEE tiles may be all-zero. **M2:** PO receipt never updates standard cost (actual price vs standard never bridged).

---

## F. Cross-cutting structural fix: Drizzle schema drift (HIGH, easy)
`packages/db/schema/*.ts` is behind the SQL migrations: `items` missing `list_price_gbp`/`output_uom`/`net_qty_per_each`/`each_per_box`/`boxes_per_pallet`/`origin_module`; `work_orders` missing `qty_entered`/`qty_entered_uom`/`uom_snapshot`; `bom_headers` missing `line_basis`; `product` modeled as table not view; `fg_npd_ext` absent. All current code uses raw `client.query` so no runtime impact, but the ORM types are wrong. → regenerate/sync Drizzle from the live schema.

---

## Prioritized remediation plan (owner picks)

**P0 — correctness (wrong numbers shipping):**
1. per_box→per_base silent fallback: make the scalar FAIL LOUD (or block WO) when a per_box BOM item lacks each_per_box/net_qty_per_each, instead of silently 5×-overstating. (A2)
2. `item_wac_state` write path on GRN/output/adjust → fix £0 valuation. (A3/H4)
3. `work_orders.actual_qty`/`produced_quantity` write on WO complete → fix NULL yield. (A3)
4. `packaging_components.qty_per_pack` write path (UI field + upsert + schema). (A3/M3)
5. BOM detail/nutrition name from `items.name`; BOM generator eligibility from `items`. (H1/H2/M4)
6. brief `packs_per_case` → `items.each_per_box` sync. (H3)
7. nutrition allergen `normalize_allergen_code` at compute. (H5)

**P1 — single-source + integrity:**
8. `getEffectiveCost` resolver + currency columns + GBP/EUR policy. (A1)
9. new-org seed (default warehouse+location, sequences, thresholds) — relevant immediately. (D)
10. create/remove `user_sessions`; add shipping FKs + non-neg CHECKs. (D)
11. Drizzle schema sync. (F)

**P2 — declutter + reuse (after data model settled):**
12. Drop dead tables/columns (Section C) — in a reviewed migration, after live null-rate confirmation.
13. Finish product→items merge; freeze product-view writes; retire prod_detail legacy process slots after S5. (B)
14. Repurpose ready columns: default_line_id, is_rework, released_to_warehouse, artwork_file_id, standard_costs. (C)
15. Allergen snapshot `recomputed_at` + recompute-before-approval. (B)

**Quick wins I can ship immediately if you say go (low-risk, clearly-correct):** #5 (BOM/nutrition name + generator from items), #6 (packs_per_case sync), #7 (allergen normalize), #4 (qty_per_pack field), #9 (new-org seed), #11 (Drizzle sync), #1 (per_box fail-loud guard).
The structural ones (#8 price resolver, #12 drops, #13 merge) want your decision first.

---

## WAVE 2 — owner lead + 5 more agents (in progress; this section grows)

### CONFIRMED CRITICAL: SUPPLIER is double-stored in two disconnected systems
Owner found it: a supplier created in Planning ≠ a supplier created in Settings; one store has 2, the other 4 totally different rows.
- **Planning → Suppliers** writes/reads `public.suppliers` (mig 261): the OPERATIONAL master (id, code, currency) — the one PO + `supplier_specs` + price resolution actually use. (`planning/suppliers/_actions/actions.ts:93,114,187`)
- **Settings → Partners** ("Suppliers & customers") is a SCHEMA-DRIVEN reference store: `settings/partners/page.tsx` renders `SingleReferenceScreen` with `tableCode: 'partners'` → rows live in the dynamic reference-data system (`reference_tables`/`reference_schemas`, seed `reference-schemas.sql`), NOT in `public.suppliers`. Customers are also in here (partner_type).
- **No link, no sync** between the two → the Settings list is decorative; nothing operational reads it. Same likely for any other entity exposed both as a typed table AND a `SingleReferenceScreen` tableCode.
- This is almost certainly a class, not a one-off → wave-2 agents are mapping every typed-table↔reference-screen split.
- **Owner decision (approved): full P0–P2 refactor scope.** Sequencing: finish this deep audit → write memory → owner `/compact` → execute the deep refactor with fresh context.

### Wave-2 agents (5: 4 Codex + 1 Claude) — appending findings here when done:
1. Master-entity two-store hunt (Settings/reference ↔ operational) — seed = supplier split.
2. Calculation-correctness deep trace (every number → inputs → source → why rozjazdy).
3. Update/propagation gaps (edit-here-stale-there; missing sync; dropped hops; jsonb-vs-column).
4. More duplicate stores (twin transactional tables, same-entity-two-modules, jsonb-vs-typed).
5. Entity-ownership & SoT master map + proposed consolidation order (refactor backbone).

### WAVE-2 CONSOLIDATED FINDINGS (all 5 agents in)

**The dual-system root cause:** the `SingleReferenceScreen` + `public.reference_tables`/`reference_schemas` dynamic-reference system shadows typed operational tables for 5 entities, with NO sync/FK. Plus twin placeholder tables + a multi-store process model. This is why the owner sees "2 vs 4 suppliers" and why calculations diverge.

**Duplicate stores (canonical SoT → shadow):**
| Entity | SoT (canonical) | Shadow / dead / disconnected | Worst symptom |
|---|---|---|---|
| Supplier | `public.suppliers` (Planning) | `reference_tables.partners` (Settings), `supplier_specs.supplier_code` (loose text, no FK), `"Reference"."Suppliers"` **PHANTOM** | Settings supplier ≠ Planning supplier (2 vs 4); NPD Procurement supplier dropdown → 42P01 (phantom table) |
| Customer | `public.customers` (Shipping) | `reference_tables.partners` (partner_type='customer') | Settings customer invisible to SO picker & vice-versa |
| **Manufacturing op/process** | `"Reference"."ManufacturingOperations"` (routing/NPD) | `reference_tables.processes` (**Finance WO cost rates read THIS**), `npd_wip_processes`, `prod_detail.manufacturing_operation_1..4`, `fg_npd_ext.process_1..4` | **Finance costs operations from a DIFFERENT store than NPD/Technical** → WO cost ↔ operation disconnect (a top rozjazd) |
| Allergen | `"Reference"."Allergens"` | `reference_tables.allergens_reference` (Settings writes a dead store), `public.allergens` (numeric A01, dead/empty), `nutrition_allergens` (mixed A01/semantic), `fg_npd_ext.allergens` (stale) | Settings-added allergen not valid in Technical; nutrition badges show codes not names |
| UoM | `public.unit_of_measure` (Settings→Units) | `reference_tables.uom_reference` (zombie, no operational reader), `items.uom_base` (free text, unconstrained) | unknown uom silently EXCLUDED from MRP netting |
| Department | `public.npd_departments`+`npd_field_catalog` | `"Reference"."Departments"`/`"DeptColumns"` (still seed source; `build-dept-zod`/`drift-detect` read the OLD one) | UI edits go to npd_field_catalog but validation reads DeptColumns → drift |
| Item/Product/FG | `public.items`+`fg_npd_ext` | `public.product` (view, OK), `public.product_legacy` (FK anchor) | suppressed by mig-359 triggers; P3-FK parked = latent |
| work_order | `public.work_orders` | `public.work_order` (placeholder) — **NPD closeout `close-out-legacy-stages.ts:356` reads the DEAD table** | NPD closeout counts wrong table |
| shipment / bom_item | `public.shipments` / `public.bom_lines` | `public.shipment` / `public.bom_item` (placeholders, only DB tests) | dead, drop |

**Propagation / sync gaps (edit-here-stale-there):** allergen profile edit → fg_npd_ext/formulation/nutrition stale; **NPD brief edit → items/fg_npd_ext stale (materialize even hardcodes `items.shelf_life_days=30`!)**; packs_per_case → items.each_per_box only at materialize → stale WO uom_snapshot; RM nutrition edit → nutrition_profiles stale; cost edit → formulation/costing snapshots stale; settings/products can edit `items.item_code` → formulations/npd_projects/costing/bom hold old code (verify — update-item treats it immutable). CLEAN (confirmed): item.name → product_name (product is a view + trigger); PO supplier-name (live join). jsonb-vs-typed: product/items jsonb clean (view+trigger); `npd_projects.field_values` likely DEAD; `stock_moves.ext_jsonb` mixed typed+json.

**Calculation-correctness (why obliczenia się nie zgadzają) — ranked CRITICAL:** BOM cost ignores uom/line_basis/currency (`list-recipe-cost.ts:186`); NPD waterfall packaging cost hardcoded `'0'` (`compute.ts:301-310`, packaging_components.cost_per_unit never summed); per_box→per_base ~×kg/box overstatement; `work_orders.actual_qty` never written → yield NULL; `item_wac_state` never written → inventory valuation £0; OEE producer can insert NULL into NOT NULL → WO-close abort; nutrition allergen rollup omits process-added allergens; unpriced material → WO cost silently 0.

**NEW phantoms/broken:** `"Reference"."Suppliers"` (NPD Procurement supplier dropdown → 42P01); `public.user_sessions` (reset-password → 42P01); `public.fa_bom_view` (returns 0 rows by design).

### PROPOSED CONSOLIDATION ORDER (refactor blueprint — owner approved full scope, execute POST-COMPACT)
- **Phase 1 (correctness blockers, ship first):** phantom `"Reference"."Suppliers"` (create view or fix dropdown_source) — NPD Procurement broken NOW; normalize nutrition_allergens codes; fix formulation cost currency label; constrain `items.uom_base` to unit_of_measure; sync packs_per_case→each_per_box on brief save; per_box fail-loud guard; write actual_qty + item_wac_state.
- **Phase 2 (single-source price/cost):** `getEffectiveCost(itemId,supplierId,date)→{amount,currency,source}`; add currency cols to cost_per_kg/cost_per_unit; packaging cost into waterfall.
- **Phase 3 (supplier/customer unify):** supplier_specs.supplier_code + packaging_components.supplier_code → supplier_id FK; retire/project reference_tables.partners.
- **Phase 4 (process unify):** link reference_tables.processes ↔ ManufacturingOperations (Finance JOINs canonical); retire fg_npd_ext.process_1..4 + prod_detail slots after NPD S5.
- **Phase 5 (allergen single-vocab):** drop public.allergens; enforce Reference.Allergens; snapshot `recomputed_at` + gate approval on freshness.
- **Phase 6 (item/product completion):** finish P3-FK (bom_headers.product_id→item_id); drop product_legacy; sync Reference.Departments↔npd_departments.
- **Phase 7 (dead drop):** lot, quality_event, shipment, bom_item, work_order, work_order_items, standard_costs, wo_actual_costing, inventory_cost_layers, cost_variances, d365_finance_dlq, fa_bom_view, allergens; review uom_reference rows.
- **+** Drizzle schema sync; new-org seed (warehouse/location/sequences/thresholds); create-or-remove user_sessions; shipping FKs + non-neg CHECKs.

Full per-agent evidence (file:line) is in the wave-1+wave-2 task transcripts; this doc is the decision-ready synthesis. **Next: owner `/compact` → execute the refactor phase-by-phase with fresh context.**

