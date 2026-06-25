# Production - tester how-to guide

> Routes below omit the `[locale]` prefix. In a running app use `/<locale>/production`, `/<locale>/production/wos`, `/<locale>/production/wos/[id]`, or scanner routes under `/<locale>/scanner/wos`.

---

### Section 1: Function Inventory

| Action | What it does | Page / Route | DB table(s) touched | Reverse / correction path | Draft-only? |
| --- | --- | --- | --- | --- | --- |
| Dashboard read model `(dashboard-data.ts)` | Loads WO status counts, active lines, output kg, OEE, downtime, and recent WO cards for the production landing page. | `/production` | `work_orders`, `wo_executions`, `wo_outputs`, `oee_snapshots`, `downtime_events`, `items`, `production_lines` | Read-only. | No |
| Work-order list `(list-work-orders.ts)` | Lists WOs with item, line, execution state, planned dates, and output progress. | `/production/wos` | `work_orders`, `wo_executions`, `production_lines`, `items`, `wo_outputs` | Read-only. | No |
| Work-order detail `(get-work-order-detail.ts)` | Loads header, materials, outputs, waste, downtime, consumption history, event timeline, disassembly co-products, and open changeover gate state. | `/production/wos/[id]` | `work_orders`, `wo_executions`, `items`, `production_lines`, `machines`, `bom_headers`, `wo_materials`, `wo_outputs`, `license_plates`, `wo_waste_log`, `waste_categories`, `downtime_events`, `downtime_categories`, `wo_material_consumption`, `wo_status_history`, `wo_events`, `bom_co_products`, `changeover_events` | Read-only; corrections are separate rows below. | No |
| WO action context `(get-wo-action-context.ts)` | Loads permission flags, shifts, downtime categories, waste categories, and lines used by action modals. | `/production/wos`, `/production/wos/[id]` | `user_roles`, `roles`, `role_permissions`, `shift_configs`, `downtime_categories`, `waste_categories`, `production_lines`, `work_orders` | Read-only. | No |
| Runtime WO API `(route.ts; get-wo-runtime-state.ts)` | Returns current execution status plus component and output progress. | `GET /production/work-orders/[id]` | `work_orders`, `wo_executions`, `wo_materials`, `wo_outputs` | Read-only. | No |
| Start WO `(start-wo.ts; route-helpers.ts)` | Starts a planned WO, heals missing BOM/spec/allergen snapshots, creates the BOM snapshot, blocks incomplete medium/high/segregated changeover gates, materializes planned schedule outputs, writes state events, and emits `production.wo.started`. Scanner start uses the same service. | `POST /production/work-orders/[id]/start`; `POST /api/production/scanner/wos/[id]/start` | `work_orders`, `wo_executions`, `wo_events`, `wo_outputs`, `schedule_outputs`, `changeover_events`, `production_lines`, `bom_headers`, `factory_specs`, `items`, outbox | Cancel from `in_progress`, or later complete/close. Start itself is not voided. | No |
| Pause WO `(pause-resume-wo.ts; route-helpers.ts)` | Moves `in_progress` to `paused`, requires `production.wo.pause`, and opens a `wo_pause` downtime event. | `POST /production/work-orders/[id]/pause` | `work_orders`, `wo_executions`, `wo_events`, `downtime_events` | Resume closes the open pause downtime row. | No |
| Resume WO `(pause-resume-wo.ts; route-helpers.ts)` | Moves `paused` to `in_progress`, requires `production.wo.resume`, and closes the open `wo_pause` downtime event. | `POST /production/work-orders/[id]/resume` | `work_orders`, `wo_executions`, `wo_events`, `downtime_events` | Pause again if work stops. | No |
| Complete WO `(complete-cancel-wo.ts; route-helpers.ts)` | Moves `in_progress` to `completed`, requires at least one positive primary output unless an override reason is supplied, checks output LP holds, writes OEE completion snapshot, and emits `production.wo.completed`. | `POST /production/work-orders/[id]/complete` | `work_orders`, `wo_executions`, `wo_events`, `wo_outputs`, `license_plates`, `oee_snapshots`, outbox | Completed WOs can still be cancelled or closed; corrections below still govern consumption/output/waste rows. | No |
| Cancel WO `(complete-cancel-wo.ts; route-helpers.ts)` | Cancels a WO from `planned`, `in_progress`, `paused`, or `completed` when a reason is supplied. | `POST /production/work-orders/[id]/cancel` | `work_orders`, `wo_executions`, `wo_events`, outbox | Terminal state; no uncancel action found. | No |
| Close WO `(close-wo.ts; route-helpers.ts)` | Closes only a `completed` WO after supervisor e-sign with PIN, reason, and optional nonce, then emits `production.wo.closed`. | `POST /production/work-orders/[id]/close` | `work_orders`, `wo_executions`, `wo_events`, e-sign/audit tables via `signEvent`, outbox | Closed-WO corrections require the closed-WO correction permission path in correction code. | No |
| Desktop FEFO LP list `(consume-material-actions.ts)` | Lists consumable LP candidates for a WO material, ordered FEFO by expiry then LP number. | `/production/wos/[id]`, Consumption tab | `wo_materials`, `v_inventory_available` | Read-only. | No |
| Desktop consume material `(consume-material-actions.ts)` | Records consumption from a selected LP or a manual no-LP reason, uses idempotent client operation IDs, enforces WO recordable states, LP safety, FEFO adherence flags, LP decrement, material consumed totals, warning/block over-consume thresholds, and emits `warehouse.material.consumed` for real LPs. | `/production/wos/[id]`, Consumption tab | `wo_materials`, `wo_material_consumption`, `license_plates`, outbox | Reverse with `reverseConsumptionAction`; desktop threshold block has no supervisor PIN approval path. | No |
| Scanner WO list `(api/production/scanner/wos/route.ts)` | Lists released, in-progress, or paused WOs assigned to the scanner line/session. | `/scanner/wos` | `work_orders`, `wo_executions`, `items`, `production_lines` | Read-only. | No |
| Scanner WO detail `(api/production/scanner/wos/[id]/route.ts)` | Loads scanner WO header, materials, and output aggregates. | `/scanner/wos/[woId]` | `work_orders`, `wo_executions`, `wo_materials`, `wo_outputs`, `items` | Read-only. | No |
| Scanner FEFO LP list `(api/production/scanner/wos/[id]/lps/route.ts)` | Lists FEFO candidate LPs for scanner consumption. | `/scanner/wos/[woId]/consume` | `wo_materials`, `v_inventory_available` | Read-only. | No |
| Scanner consume material `(api/production/scanner/wos/[id]/consume/route.ts)` | Records scanner consumption, logs scanner audit, supports manual/no-LP reason, warns over the warning threshold, and requires different-user supervisor email/PIN plus `production.consumption.override_approve` over the block threshold. | `/scanner/wos/[woId]/consume` | `wo_materials`, `wo_material_consumption`, `license_plates`, `scanner_audit_log`, outbox | Reverse through scanner reverse-consume or desktop `reverseConsumptionAction`. | No |
| Scanner reversible consumption list `(api/production/scanner/wos/[id]/consumptions/route.ts)` | Lists original positive consumption rows that do not already have a counter-entry. | `/scanner/wos/[woId]/reverse-consume` | `wo_material_consumption`, `wo_materials`, `license_plates`, `items` | Read-only list feeding scanner reversal. | No |
| Scanner reverse consumption `(api/production/scanner/wos/[id]/reverse-consume/route.ts)` | W11-R3 scanner correction: operator PIN is always required; supervisor PIN is required by default feature flag; closed WOs require closed-WO correction permission; inserts a negative counter-entry, restores LP quantity/status, writes LP history, audit, and scanner audit. | `/scanner/wos/[woId]/reverse-consume` | `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `scanner_audit_log` | Counter-entry is the correction; the original row remains. | No |
| Register output `(register-output.ts; outputs/route.ts)` | Registers primary/co-product/by-product output in recordable WO states, supports fixed or catch-weight items, creates output LPs when needed, links consumed LP genealogy, warns or blocks on mass-balance rules, and emits `production.output.recorded`. | `/production/wos/[id]`, Output tab; `POST /production/work-orders/[id]/outputs`; `/scanner/wos/[woId]/output` | `work_orders`, `items`, `wo_executions`, `wo_material_consumption`, `wo_outputs`, `wo_operations`, `bom_headers`, `license_plates`, `lp_genealogy`, `lp_state_history`, outbox | Void with `voidWoOutputAction` only while the created LP is still pending/received and unused. | No |
| Register disassembly outputs `(register-disassembly-output.ts; disassembly-outputs/route.ts)` | For disassembly BOMs, creates one LP and output row per allowed co-product from a consumed input LP, writes genealogy, state history, outbox, and item cost ledger. | `/production/wos/[id]`, Disassembly outputs modal; `POST /production/work-orders/[id]/disassembly-outputs` | `work_orders`, `bom_headers`, `bom_co_products`, `wo_material_consumption`, `license_plates`, `wo_outputs`, `lp_genealogy`, `lp_state_history`, cost ledger, outbox | Void output path applies per output if LP is still eligible. | No |
| Release output QA `(output-qa-actions.ts)` | Marks pending WO output QA as passed or failed and mirrors the LP QA status to released or rejected. | `/production/wos/[id]`, Output tab | `wo_outputs`, `license_plates`, `lp_state_history` | No unrelease action found; output void only accepts pending/received LPs, so QA release blocks the normal void path. | No |
| Record waste `(record-waste.ts; waste/route.ts)` | Records positive waste kg in recordable WO states, resolves active waste category, optionally decrements/destroys an LP, checks holds, and emits `production.waste.recorded`. | `/production/wos/[id]`, Waste tab; `POST /production/work-orders/[id]/waste`; `/scanner/wos/[woId]/waste` | `work_orders`, `wo_executions`, `waste_categories`, `wo_waste_log`, `license_plates`, outbox | Void with `voidWasteEntryAction`; correction is a negative `wo_waste_log` row. | No |
| Void waste `(corrections-actions.ts; void-actions-adapter.ts)` | W11-R2 storno: locks an original waste row, refuses already-corrected rows, inserts a negative waste counter-entry, writes audit, and revalidates production pages. | `/production/wos/[id]`, Waste tab | `wo_waste_log`, `audit_events` | Counter-entry is the correction; no e-sign required in code. | No |
| Void output `(corrections-actions.ts; void-actions-adapter.ts)` | W11-R2 storno: requires e-sign, locks original output and LP, refuses already-corrected rows, requires pending/received unused LP, inserts a negative output row, destroys the LP, deletes child genealogy, and writes audit/history. | `/production/wos/[id]`, Output tab | `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `audit_events`, e-sign/audit tables via `signEvent` | Counter-entry plus destroyed LP is the correction. | No |
| Reverse consumption `(corrections-actions.ts; void-actions-adapter.ts)` | W11-R3 desktop correction: requires e-sign, locks original consumption, refuses already-corrected rows, decrements material consumed totals, inserts a negative consumption row, restores LP quantity/status, and writes audit/history. | `/production/wos/[id]`, Consumption tab | `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, e-sign/audit tables via `signEvent` | Counter-entry is the correction; closed WO path is gated by correction permission. | No |
| Changeover line list `(changeover-actions.ts)` | Lists active production lines for changeover filters/forms. | `/production/changeovers` | `production_lines` | Read-only. | No |
| Changeover list `(changeover-actions.ts)` | Lists changeover events with line, WO, product, signer, and status context. | `/production/changeovers` | `changeover_events`, `production_lines`, `work_orders`, `items`, `users` | Read-only. | No |
| Create changeover `(changeover-actions.ts)` | Creates allergen/changeover gate events, deriving introduced allergens from item JSON and risk from active matrix rows or fallback heuristic. | `/production/changeovers` | `changeover_events`, `production_lines`, `work_orders`, `items`, `changeover_matrix_versions`, `changeover_matrix` | Complete with two signatures; incomplete medium/high/segregated gate blocks WO start. | No |
| Sign changeover `(changeover-actions.ts)` | Dual-signs the allergen gate under active signoff policy or two-signature default, requires separate signer permissions/roles, final signature requires cleaning complete, writes e-sign, and records validation. | `/production/changeovers` | `changeover_events`, `signoff_policies`, `allergen_changeover_validations`, e-sign/audit tables via `signEvent` | No unsign action found; completed gate satisfies start guard. | No |
| Legacy changeover screen `(changeover-data.ts)` | Read-only changeover board for the singular route. | `/production/changeover` | `changeover_events`, `work_orders` | Read-only. | No |
| Downtime screen `(downtime-data.ts)` | Lists downtime events with categories, WOs, and users. | `/production/downtime` | `downtime_events`, `downtime_categories`, `work_orders`, `users` | Pause/resume manages `wo_pause` events; no generic downtime correction action found. | No |
| Waste screen `(waste-data.ts)` | Lists waste rows and signed net totals; correction rows count negative and event counts exclude corrections. | `/production/waste` | `wo_waste_log`, `waste_categories`, `work_orders`, `users` | Void waste from WO detail. | No |
| Shifts screen `(shifts-data.ts)` | Aggregates shift metrics from operational rows; no shift master table is used. | `/production/shifts` | `downtime_events`, `wo_waste_log`, `oee_snapshots` | Read-only. | No |
| Analytics screen `(analytics-data.ts)` | Reads OEE, waste, output, and downtime analytics. | `/production/analytics` | `oee_snapshots`, `wo_waste_log`, `wo_outputs`, `downtime_events`, `downtime_categories` | Read-only. | No |
| Clock in `(labor-actions.ts)` | Closes any open labor log for the user, then starts a new WO labor log from desktop or scanner source. | `/production/wos/[id]`, Labor tab; `/scanner/wos/[woId]` | `wo_labor_log` | Clock out closes the open row. | No |
| Clock out `(labor-actions.ts)` | Closes the current open labor row, optionally scoped to the WO. | `/production/wos/[id]`, Labor tab; `/scanner/wos/[woId]` | `wo_labor_log` | Re-clock-in creates a new interval; no delete action found. | No |
| Labor summary `(labor-actions.ts)` | Computes WO labor hours and cost using labor rates and decimal arithmetic. | `/production/wos/[id]`, Labor tab | `wo_labor_log`, `users`, `labor_rates`, `roles` | Read-only. | No |
| Labor rates `(labor-actions.ts)` | Lists and upserts effective labor rates for settings/admin use. | Production labor settings surfaces | `labor_rates` | Future rate rows can be inserted/updated; no delete action found. | No |

### Section 2: User How-To (Tester Walkthroughs)

1. Start a WO and consume components
   1. Open `/production/wos`, then open a WO row to `/production/wos/[id]`.
   2. Use the row/detail action that posts `startWo`. If the WO line has an incomplete allergen/changeover gate, the start action is blocked until `/production/changeovers` has the required two signatures. Polish copy in the changeover UI includes `Przezbrojenia` and the start blocker text for `Bramka przezbrojenia`.
   3. On the WO detail Consumption tab, open the consume dialog. The code label is `Consume material`; scanner PL copy includes `skonsumowane`.
   4. Select a material and LP candidate. LP candidates come from the FEFO list. If no LP is selected, enter the required reason code.
   5. Enter quantity and submit. Desktop over-consume over the warning threshold proceeds with a warning, but over the block threshold is rejected. Scanner `/scanner/wos/[woId]/consume` can request supervisor email/PIN when the threshold is exceeded.

2. Register output including catch-weight
   1. Open `/production/wos/[id]` and use the Output tab action `Register output` (`Zarejestruj wyjście` / output tab `Wyjście` in PL copy).
   2. Choose output type when available, confirm the product, and enter quantity. For catch-weight items, fill per-unit weights or actual weighed kg. Code computes total/average and returns a tolerance warning instead of blocking.
   3. If there is no posted kg consumption yet, the UI can show a soft no-consumption warning and require `Continue anyway`.
   4. Submit. The service creates or links an FG LP, genealogy rows from consumed LPs, and may return a mass-balance warning. Scanner users can do the same from `/scanner/wos/[woId]/output`.

3. Record waste
   1. Open `/production/wos/[id]` and use the Waste tab action `Log waste`, or scanner `/scanner/wos/[woId]/waste`.
   2. Select an active waste category, enter kg, and optionally enter reason notes or an LP.
   3. Submit. If an LP is supplied, the service decrements that LP and destroys it when the remaining quantity is zero. Waste rows appear in `/production/waste`; PL copy includes `Odpad`, `Odpady`, and `Anuluj wpis...`.

4. Reverse a wrong consumption
   1. Desktop: open `/production/wos/[id]`, find the consumption row, and trigger the reverse action wired through `reverseConsumptionAction`.
   2. Enter the e-sign PIN/reason required by `production.consumption.reverse`.
   3. Scanner: open `/scanner/wos/[woId]/reverse-consume`, select an available original consumption, enter reason/note and the operator PIN. If the API asks for supervisor approval, enter supervisor email and PIN.
   4. The correction is a negative `wo_material_consumption` row; the original row is preserved and LP quantity/status are restored.

5. Void an output
   1. Open `/production/wos/[id]`, Output tab, and choose the void action for an eligible output.
   2. Enter the e-sign reason/PIN for `production.output.void`.
   3. The output can be voided only if its LP is still `received` with QA `pending`, has no reserved quantity, and has no consumption or child LPs. The correction inserts a negative output row and destroys the original LP.

6. Close a WO
   1. From `/production/wos/[id]`, complete the WO first. Completion requires a positive primary output unless an override reason is supplied.
   2. Trigger close. Enter supervisor signer, PIN, and reason.
   3. Close moves `completed` to `closed`, writes an e-sign event, and emits `production.wo.closed`. Scanner and desktop corrections after close require the closed-WO correction permission path where implemented.

### Section 3: Reverse / Correction Map

#### Consumption

| State | Allowed operations | How to trigger | Result |
| --- | --- | --- | --- |
| Original positive row, not already corrected | Reverse consumption on desktop with e-sign. | `/production/wos/[id]` Consumption tab via `reverseConsumptionAction`. | Negative `wo_material_consumption` counter-entry, `wo_materials.consumed_qty` decremented, LP quantity/status restored, audit and LP history written. |
| Original positive row, scanner-visible, not already corrected | Reverse consumption on scanner with operator PIN and, by default, supervisor PIN. | `/scanner/wos/[woId]/reverse-consume`. | Same counter-entry model plus `scanner_audit_log`. |
| Closed WO | Correction only through code paths that pass the closed-WO permission guard. | Desktop correction service or scanner reverse API. | Same correction rows; unauthorized users are blocked. |

#### Output

| State | Allowed operations | How to trigger | Result |
| --- | --- | --- | --- |
| Output has LP, LP `received`, QA `pending`, no reserved quantity, no consumption, no child LPs | Void output with e-sign. | `/production/wos/[id]` Output tab via `voidWoOutputAction`. | Negative `wo_outputs` row, original LP destroyed and zeroed, child genealogy deleted, audit/history written. |
| Output already corrected | No second void. | Service rejects by checking existing counter-entry. | Original and first correction remain. |
| Output QA released/rejected or LP used downstream | No normal void path found. | Not exposed in source. | Must use another operational correction outside the built production void flow; unverified in source. |

#### Waste

| State | Allowed operations | How to trigger | Result |
| --- | --- | --- | --- |
| Original positive waste row, not already corrected | Void waste. | `/production/wos/[id]` Waste tab via `voidWasteEntryAction`. | Negative `wo_waste_log` counter-entry and audit event. |
| Waste already corrected | No second void. | Service rejects by checking existing counter-entry. | Original and first correction remain. |

#### WO State

| State | Allowed operations | How to trigger | Result |
| --- | --- | --- | --- |
| `planned` | Start or cancel. | `/production/work-orders/[id]/start`; `/production/work-orders/[id]/cancel`; scanner start API. | Start creates/updates execution and event rows; cancel is terminal. |
| `in_progress` | Pause, complete, or cancel. | `/production/work-orders/[id]/pause`; `/complete`; `/cancel`. | Pause opens downtime; complete writes OEE snapshot; cancel is terminal. |
| `paused` | Resume or cancel. | `/production/work-orders/[id]/resume`; `/cancel`. | Resume closes pause downtime; cancel is terminal. |
| `completed` | Close or cancel; recordable output/consumption/waste states still include `completed`. | `/production/work-orders/[id]/close`; `/cancel`; WO detail action tabs. | Close requires e-sign and becomes terminal; cancel becomes terminal. |
| `closed` or `cancelled` | No lifecycle transition found. Corrections may still be allowed only by correction-specific guards. | Correction services where permitted. | State remains terminal. |

### Section 4: Known Gaps / Not Yet Built

- Mass-balance S4 close auto-release is DESIGNED-not-built. The plan `_meta/plans/2026-06-24-production-mass-balance-design.md` describes auto-release on close, but `close-wo.ts` only validates e-sign, applies the state transition, and emits `production.wo.closed`.
- Mass-balance S5 reweigh-on-move is DESIGNED-not-built. The production code read for this guide has no `needs_reweigh`, `lp_reweigh_events`, or scanner move reweigh action matching the plan.
- Mass-balance S6 remainder-to-WO reconcile is DESIGNED-not-built. No close/reconcile action in production code creates a remainder WO or performs the planned remainder allocation.
- S3 mass-balance output warning is built in `register-output.ts`, but the implementation is not the same as the design note's default-off wording: code returns a warning at a fixed 2% posted-consumption gap and hard-blocks only when tenant `massbalance_threshold_pct` is active.
- FG label PDF generation is stubbed in `register-output.ts`: the service returns `label_pdf_url: null`. Printing an LP label is a separate scanner/UI path, not a generated output PDF from registration.
- QA detail summary is not built in the WO detail read model. `get-work-order-detail.ts` returns a zeroed QA summary while output-level QA release exists in `output-qa-actions.ts`.
- Shift management is aggregate-only. `shifts-data.ts` derives shift metrics from downtime, waste, and OEE rows; no shift master, crew handover, or shift target table is used there.
- The hold guard is fail-open while `v_active_holds` is absent. `holds-guard.ts` documents that 09-quality owns the active-holds view, so production hold blocking depends on that view existing in the deployed database.
- Output QA release uses `quality.batch.release` in `output-qa-actions.ts` because no production-side batch QA release permission is present. No output QA unrelease action was found.
- D365 import, output-label PDF generation, generic downtime correction, uncancel, unclose, and changeover unsign actions were not found in the production sources read for this guide.
