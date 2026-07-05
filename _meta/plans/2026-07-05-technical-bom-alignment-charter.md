# W5 Charter — Technical ↔ BOM ↔ NPD alignment (2026-07-05)

Owner mandate: scan the whole Technical module focusing on BOM; align it 100% with NPD;
identify mismatched/missing columns; map how the BOM tree is built in NPD vs how it is
handed to Technical; fix routing (NPD processes should become the product routing);
brainstorm how the two departments fit together while each module stays independent.
Orchestration: 6 lanes (Composer 2.5 / Codex / Opus 4.8). Questions go to owner first.

## Ground truth (5 read-only lanes + live DB verification on FG0012)

### 1. NPD→BOM handoff (materializeNpdBom)
- Single NPD-path writer: `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts`.
  Header `line_basis='per_box'`; RM/WIP qty = `formulation_ingredients.qty_kg (per pack) × packs_per_case`;
  PM qty = `qty_per_pack × packs_per_case`, uom 'each'.
- **CONFIRMED LIVE (FG0012)**: packaging rows `box 1` and `LAB1` have `item_id NULL` →
  `loadPackagingComponents` filters them out (materialize-npd-bom.ts:843) → BOM has NO PM lines.
  Silent omission, no warning. This is the owner's "box and label missing from BOM".
- Substitute IS copied (`formulation_ingredients.substitute_item_id` → `bom_lines.substitute_item_id`,
  mig 424; confirmed on FG0012's RM line) and IS consumed by the WO consume gate.
  It is simply **not rendered** anywhere in Technical BOM UI → owner thinks it's lost.
- BOM is generated ONCE (first generateProductionBom or promote); promote reuses the existing
  active BOM unchanged → recipe edits after generation = stale BOM.
- RM scrap_pct hardcoded 0 (formulation has no per-line scrap); per-component yield param exists
  but never wired (always 100). packaging waste_pct is costing-only by design (mig 427).
- 6 distinct bom writers total (NPD materializer incl. WIP sub-BOMs, technical create-draft,
  line-actions, disassembly, clone-on-write DB fn).

### 2. Item master vs NPD (field parity)
- Technical item page DOES render cost_per_kg + list_price_gbp (item-overview-tab.tsx:151-152) —
  both NULL on FG0012 because **promotion never writes any price/cost to items**.
  `target_retail_price_eur` goes only to legacy `product.price_brief`. Costing outputs never persisted.
  Page reads `items.cost_per_kg` raw, not `v_item_effective_cost`.
- Category: stored in `npd_projects.type`; vocabulary = hardcoded 5 meat values duplicated in
  2 UI files; NO reference table; never flows to items; BOM list "category" column actually
  renders `fg_npd_ext.department_number` (different concept). items has free-text `product_group`
  (orphan — collected, never consumed).
- gross/tare/nominal weights = catch-weight-only fields on items (weight_mode gate); fine as-is.
- Wizard↔consumer mismatches: no category in wizard; gs1Gtin/boxes_per_pallet collected but unconsumed;
  shelf_life int (items) vs free text (product).

### 3. Pack hierarchy math ("0.300 szt")
- **CONFIRMED LIVE**: FG0012 `uom_base='szt'`, `output_uom='each'`, `net_qty_per_each=0.300`,
  `each_per_box=12`. The 0.300 is a kg value (pack_weight 300 g / 1000) written next to a count uom →
  physically nonsensical render "Each · 1 = 0.300 szt".
- Root cause: `ensureFgItemAndProduct` INSERT hardcodes uom_base 'kg' but `ON CONFLICT DO NOTHING`;
  pre-existing item (wizard-created with 'szt') never corrected. Post-conflict UPDATEs fix
  output_uom/net_qty but NOT uom_base.
- Also: output_uom set 'each' even when packs_per_case>0 — owner expects the box-level hierarchy
  ("Box · 1 = 12 × 0.300 kg = 3.600 kg"), i.e. output_uom='box'.
- The BOM "doesn't match recipe" quantity confusion = per_box basis (×12) rendered without
  annotating line_basis/packs-per-box next to the numbers. (FG0012: RM-PORK-01 3.6 kg per box
  = 0.3 kg/pack × 12 — mathematically correct.)

### 4. Routing — total gap (dual system, no bridge)
- `routings`/`routing_operations` (mig 163): item-centric, line/machine FK, setup+run time,
  cost_per_hour, draft→approved→active. ONLY consumer: create-work-order-core.ts:244-274
  copies active routing → wo_operations at WO create. No active routing ⇒ WO has ZERO operations
  (silent).
- NPD processes live in `npd_wip_processes`(+roles) / `wip_definition_processes`: duration,
  throughput, labor roles/rates — but NO line/machine FK, no op_no. Consumed only by NPD costing.
- **Zero code path creates a routing from NPD data.** Genuinely parallel systems.

### 5. Checklist regression (owner bug 1)
- Snapshot text "Recipe has at least one ingredient" (mig 426 seed) is NOT in
  `INGREDIENTS_PRESENT_TEXTS` and fails the substring fallback ('ingredient' + one of
  identified/specification/'shared bom') → auto-satisfy predicate never fires; advance modal
  correctly counts DB-done only. One-line fix in gate-checklist-auto-satisfy.ts.

## Design principle proposed to owner
NPD = development sandbox and the AUTHOR of the product definition. Technical = the OWNER of
master data after handoff. Handoff (promote) = one COMPLETE, validated materialization:
item master (uom + pack hierarchy + category + prices) + full BOM (RM+WIP+PM+substitutes) +
draft routing from NPD processes. After handoff, Technical's clone-on-write lifecycle governs.
Handoff must be a HARD GATE: incomplete inputs (packaging without item link) block promotion
loudly instead of silently dropping data.

## Question set → owner (T1–T12), with recommendations
T1 base UoM at project creation; T2 output_uom='box' default; T3 packaging item-link hard gate
vs auto-create PM item; T4 BOM staleness at promote (auto new version); T5 substitute rendering
(+PM/WIP substitutes?); T6 routing bridge (draft routing at handoff, line/machine source);
T7 category reference table (Reference.ProductCategories, per-org, Settings-managed) + fix BOM
list mislabel + items.category home; T8 persist price/cost at promote + Technical page reads
v_item_effective_cost; T9 minimal product field set confirmation; T10 recipe-line scrap% /
per-component yield; T11 legacy dual-store (product/fg_npd_ext vs items) merge direction —
defer or include; T12 no-ruling-needed fix list approval (checklist text, uom_base correction,
substitute display, per-box annotation).

Rulings to be recorded below when the owner answers.

## Owner rulings (2026-07-05)
- T1 YES — packs are counted in 'szt'/each at the SELL level, but base for FG weight math = kg;
  "1 each = 0.3 kg" is the correct reading; FG output level = pack or box. Fix the 'szt' record.
- T2 YES (output_uom='box' + full ladder render).
- T3 = option (a) HARD GATE at handoff (packaging must be item-linked before promote).
- T4 YES (auto new BOM version at promote when recipe changed).
- T5 YES + substitutes for packaging (PM) too; BOM tree view must EXPAND WIPs (show what's inside).
- T6 extended — see Resource Model below. Owner: too many line pickers (prod_detail line,
  "Production Line *", pilot run plan line) and none reaches routing. His model: Production
  detail defines the process list; each process has a YIELD; required material = qty compounded
  UP through process yields (0.300/0.95/0.95 = 0.3324); THAT drives BOM quantities and costs;
  data already lives in production details. Simplify: pick a PLACE (line) once → routing/process
  (assigned in NPD) carries staffing + cost rates inside → staffing chosen in Staffing settings.
  Owner asks: are machines even needed? Deliver a clear simplification proposal BEFORE build.
- T7 YES exactly (Reference.ProductCategories per-org + Settings + fix BOM list mislabel).
- T8 YES. T9 YES. T10 YES. T11 AGREED (dual-store merge parked to W6). T12 OK (ship now).

## Unified Resource Model (proposal v1 — awaiting owner OK)

Inventory verdict (lane a02470): 3 independent rate sources (npd_wip_process_roles.rate_per_hour
snapshot / labor_rates / routing_operations.cost_per_hour manual-never-consumed); 5 line
representations (production_lines UUID vs text in prod_detail, pilot_runs, downtime_events,
oee_snapshots); machines.capacity_per_hour never consumed; wo_operations lifecycle columns never
written by execution (only expected_duration read by Finance); Finance rate chain =
fragile name-matching wo_operations.operation_name → ManufacturingOperations →
npd_process_defaults → roles → labor_rates.

ONE-OF-EACH model:
1. ONE place: production_lines (UUID) is the only line entity. NPD Production detail picks the
   line ONCE (UUID FK, new column); pilot run + WO inherit as default. Kill Lines_By_PackSize
   dropdown, prod_detail.line text, pilot_runs.line text → FK columns.
2. ONE rate source: labor_rates (role_group × site, effective-dated) managed in Settings ›
   Staffing. Roles+headcount live on the process; rate ALWAYS resolved from labor_rates at
   compute; per-role rate_per_hour kept only as lock-time snapshot for audit. DELETE
   routing_operations.cost_per_hour + prod_detail.rate (dead).
3. ONE process model: the NPD/WIP process chain (name from ManufacturingOperations vocabulary,
   display_order, NEW yield_pct, throughput, roles+headcount, setup/additional cost) is the
   single definition of production steps. Handoff materializes routing_operations 1:1 from it
   (op_no=display_order, run time from throughput, line from product line). Technical Routings
   page = post-handoff EDITOR of the same rows, not a parallel authoring system. cost-preview
   computed from roles × labor_rates (drop manual cost_per_hour).
4. Yield compounding (owner's formula): add yield_pct to npd_wip_processes +
   wip_definition_processes; required qty per component = qty_per_pack / Π(yield of its process
   and all downstream processes); BOM materialization and cost engine both use it (wires the
   dormant per-component-yield stub; replaces legacy prod_detail.operation_yield_1..4).
5. Machines: DEMOTED out of the product flow — machine_id optional metadata on routing ops,
   hidden from WO create; machines table + Settings page remain only as the asset registry for
   Maintenance/calibration. capacity_per_hour dropped or left dormant.
6. wo_operations: keep as WO snapshot of routing ops; at creation ALSO copy crew
   (role_group+headcount) onto the op → Finance costs = duration × Σ(headcount × labor_rate),
   killing the 4-hop name-match chain. Per-op lifecycle columns stay dormant (future shop-floor
   tracking) — not in W5 scope.

Owner rulings 2026-07-05 (2): R1 OK (machines demoted to Maintenance asset registry).
R2 YES — yield per PROCESS, compounding over the chain ("to jest lepsze rozwiazanie").
R3 OK (live labor_rates until recipe lock, snapshot at lock).
GO: 8 lanes, 8h autonomous, 3-4 waves of 6-8 lanes. Goal = fully finished, PROVEN by browser
runs (handoff creates COMPLETE BOM; prices correct; WO pulls everything correctly from BOM),
final end-to-end logic audit at the end. Execution contract:
`_meta/plans/2026-07-05-w5-execution-contract.md`.
