# F3 A2 — Whole-app gap audit, Domain 2: Planning + Production + Scanner + OEE/Maintenance

Tree @ 4248cbc0. READ-ONLY. Every finding has real file:line evidence read during this audit.
Cross-ref: `_meta/plans/2026-07-02-ROADMAP-master.md`. F2/F3 in-flight items marked [IN-FLIGHT].

Legend: severity P0 (safety/security/data-loss) · P1 (broken core flow) · P2 (missing leg/dead-end) · P3 (polish).
Tag: [NEW] (not in roadmap) · [KNOWN <phase.item>] · [IN-FLIGHT] (F2/F3 actively fixing this exact spot).

---

## Section 1 — PRODUCTION (WO lifecycle, corrections, changeover, downtime)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| PR-1 | P1 | [NEW] | **cancelWo from `completed` destroys output LPs but NEVER reverses WAC.** `registerOutput` adds output value to `item_wac_state` via `upsertWac` and stamps `wac_qty_kg`/`wac_value` in `wo_outputs.ext_jsonb`. `voidWoOutput` reads that snapshot and reverses WAC. But `cancelWo` (previousStatus==='completed') marks the same output LPs `destroyed`/qty=0 and writes `lp_state_history` with ZERO `upsertWac` call — so cancelling a completed WO permanently overstates inventory valuation by the full output value. Roadmap 1.5 covers WAC-reversal-on-cancel *generally*; the completed-WO-cancel path is a concrete uncovered leg and the cancelWo output-LP void itself is IN-FLIGHT but WAC was not added. | `lib/production/complete-cancel-wo.ts:247-324` (no `upsertWac`; `grep upsertWac` → 0 hits) vs `lib/production/output/register-output.ts:734` (adds) + `production/_actions/corrections-actions.ts:963-982` (voidWoOutput reverses) |
| PR-2 | P2 | [NEW] | **Material consumption never writes a `stock_moves` ledger row — on EITHER surface.** Desktop `recordDesktopConsumption` and scanner consume both decrement `license_plates.quantity`, write `wo_material_consumption`, and emit `warehouse.material.consumed` — but neither inserts `stock_moves`. The outbox consumer is a generic queue relay with no handler that materializes a stock_move (`grep material.consumed` in worker → only dashboard label). So the stock ledger is missing ALL consumption. record-waste (with lp) now DOES write stock_moves [IN-FLIGHT], making the gap asymmetric within production. | desktop: `production/_actions/consume-material-actions.ts:455-569` (LP decrement + `wo_material_consumption`, no `stock_moves`); scanner: `app/api/production/scanner/wos/[id]/consume/route.ts:409-498`; worker: `apps/worker/src/jobs/outbox-consumer.ts` (no stock_move handler) |
| PR-3 | P2 | [NEW] | **Production output (FG receipt) never writes a `stock_moves` row.** `registerOutput` inserts `license_plates` + `lp_genealogy` + `lp_state_history` + `wo_outputs` + WAC, but `grep stock_moves lib/production/output/register-output.ts` = 0. A warehouse stock-ledger/movements report omits every production receipt. (PO receive/GRN has the same gap — `receive-po-line.ts` writes GRN+LP+inspections, no stock_moves — noted PL-side.) | `lib/production/output/register-output.ts:479,513,525,642` (no `insert into public.stock_moves`) |
| PR-4 | P2 | [NEW] | **Outputs & waste are recordable AFTER completion, but yield is frozen at completion.** `OUTPUT_RECORDABLE_STATES` includes `'completed'`, so operators may register more output post-complete; but `completeWo` computes `actual_qty`/`produced_quantity` (→ generated `yield_percent`) ONLY inside the complete transition. Post-completion outputs never update `actual_qty`/yield — the WO silently under-reports produced qty. | `lib/production/shared.ts:204-208` (recordable incl. `completed`) vs `lib/production/complete-cancel-wo.ts:139-168` (actual_qty computed only at complete) |
| PR-5 | P2 | [KNOWN 4.4/O2] | **WO-detail "Log downtime" is a permanently-dead `DeferredButton`.** No manual downtime entry exists anywhere; `downtime_events` is written ONLY by WO pause (source='wo_pause'). The table's `source` enum has 4 values (manual/wo_pause/plc_auto/changeover) but only `wo_pause` is ever produced — the Downtime page renders labels for all 4 sources that can never appear. | `production/wos/[id]/_components/wo-detail-screen.tsx:1190` (`<DeferredButton … testid="wo-downtime-add">`); only writer `lib/production/pause-resume-wo.ts:88`; downtime page read-only `production/downtime/page.tsx:14` |
| PR-6 | P3 | [NEW] | **`cancelWo.reservationsReleased` is dead — always `[]`.** The result type + outbox payload advertise `reservationsReleased: string[]`, but the array is declared empty and never appended to (the "05-warehouse reservation-release seam" is a documented no-op). Consumers reading the WO-closed event get a permanently empty list. | `production/complete-cancel-wo.ts:244` (declared `const reservationsReleased: string[] = []`), never pushed; payload at :335 |
| PR-7 | P3 | [NEW] | **Changeover completion produces no downtime record.** `createChangeoverEvent`/`signChangeover` fully wire the dual-sign allergen flow and stamp `completed_at`, but never insert a `downtime_events` row with source='changeover'. A changeover's line-stop time is invisible to Downtime/OEE. | `production/_actions/changeover-actions.ts:440-472` (insert changeover_events, no downtime_events); enum has unused 'changeover' source at `production/downtime/page.tsx:154` |
| PR-8 | P3 | [NEW] | **Two changeover route trees (`/changeover` read-only register vs `/changeovers` interactive dual-sign) — near-duplicate screens, same prototype anchor.** Both render `data-prototype-label="changeover_screen"`. Confusing nav duplication; not broken. | `production/changeover/page.tsx:2,150` vs `production/changeovers/page.tsx:13,220` |
| PR-9 | P3 | [NEW] | **`changeovers-lines.ts` uses a LOCAL `hasPermission` copy instead of the canonical helper** (RBAC-honesty drift; roadmap T2). Reads `production.oee.read` via an inline user_roles/role_permissions query. | `production/changeovers/_actions/changeovers-lines.ts:25-43` |
| PR-10 | — | [IN-FLIGHT] | cancelWo output-LP void (destroys FG pallets on cancel) — landed this wave; WAC reversal on that path is the still-open piece (see PR-1). record-waste gates + stock_moves — landed. Scanner consume/output/waste site-RLS (`app.user_can_see_site`) — landed. | `complete-cancel-wo.ts:247-324`; `record-waste.ts:190-253`; `scanner/wos/[id]/consume/route.ts:275,392,421` |

Solid (no gap): WO state machine (`wo-state-machine.ts` — optimistic-lock CAS, immutable wo_events, R14 idempotency); corrections framework (voidWasteEntry/voidWoOutput/reverseConsumption — counter-entry + e-sign + WAC reversal on output void + QA-aware LP restore); complete gate (holdsGuard + yield gate + oee snapshot); labor clock-in/out (`labor-actions.ts:184` writes wo_labor_log). NOTE: voidWasteEntry inserts a negating waste row but does NOT restore the LP quantity that record-waste decremented — acceptable IF waste-with-lp is treated as irreversible destruction, but worth an owner ruling.

---

## Section 2 — PLANNING (MRP, planned orders, schedule board, forecasts)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| PL-1 | P2 | [KNOWN 5.1] | **MRP is single-level, not time-phased / not multi-level BOM explosion.** `computeMrp` nets `onHand − reserved + openSupply − demand` per item in one bucket; dependent demand = direct `wo_materials` only (a planned MAKE order does NOT explode into component demand). Header self-documents "read-first slice". This is the big-rock 5.1, correctly deferred — flagged so the app's "MRP" claim is understood as netting, not planning. | `planning/_actions/mrp-compute.ts:1-59,225-312` |
| PL-2 | P2 | [KNOWN 4.14] | **Schedule board is a fixed today+7d window with no prev/next navigation.** `getScheduleBoard` hardcodes `windowStart = new Date()` (today midnight) + `BOARD_WINDOW_DAYS=7`; takes no offset param. Can't view next/prior week. | `planning/schedule/_actions/schedule-board.ts:100-102`; `planning/schedule/_lib/board.ts:16` |
| PL-3 | P2 | [NEW] | **Schedule board silently truncates unscheduled WOs at 50.** The `unscheduledResult` query has a hard `limit 50` with no count/"more" indicator — WO #51+ vanish from the board. | `planning/schedule/_actions/schedule-board.ts:138-145` (`limit 50`) |
| PL-4 | P3 | [NEW] | **Stale header comment in `mrp.ts` claims planned orders are never written.** Lines 12-13 say "mrp_planned_orders is NOT written in this slice — planned_order_count stays 0 (honest)" but line 556 clearly inserts into `mrp_planned_orders` and lines 1020/1102 convert them to PO/WO. Doc lies about behavior; not a functional bug but misleads maintainers. | `planning/_actions/mrp.ts:12-13` vs `:556`, `:1020`, `:1102` |
| PL-5 | P3 | [KNOWN 1.13] | **MRP→PO conversion falls back to `unitPrice '0'`** when no supplier-spec/list price resolves (a priceWarning is emitted, so improved from roadmap's assessment, but still creates a £0 PO line silently unless the caller surfaces the warning). | `planning/_actions/mrp.ts:1082` (`prices[index]?.unitPrice ?? '0'`) + warnings at :1064-1070 |

Solid: MRP now persists `mrp_runs`/`mrp_requirements`/`mrp_planned_orders` + convert-to-PO/WO (with supplier-spec price resolution + fallback warnings); forecasts CRUD (upsert/delete `demand_forecasts`); PO state machine (`PO_TRANSITIONS` re-validated server-side, reopen path guards receipts) — the roadmap-1.7 "manual received irreversible" concern is handled via GRN rollup, not a dead button.

---

## Section 3 — SCHEDULER (sequence solver, changeover matrix)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| SC-1 | P2 | [NEW] | **Scheduler apply has NO segregation-of-duties: the same user runs, applies, and approves each assignment.** `applySchedule` calls `applyAssignmentToWorkOrder` then `approveSchedulerAssignment` for every row with an explicit `TODO: enforce separate approver-role SoD once scheduler roles are split`. A single `scheduler.run.dispatch` holder self-approves the whole schedule. | `scheduler/_actions/scheduler-actions.ts:610` (TODO), `:614-623` (apply+approve same ctx) |

Solid: `sequenceWorkOrders` solver + `scheduler_runs`/`scheduler_assignments` persistence; `applySchedule` writes back to `work_orders` (real dispatch, not a stub).

---

## Section 4 — SCANNER surface (tiles + production API routes)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| SN-1 | P2 | [KNOWN 4.3] | **No scanner cycle-count tile.** Home has Production (wos/consume/output/pick) + Warehouse (receive/putaway/move/ship) + Quality (qa/inquiry). No counts tile despite `warehouse/counts` desktop flow existing → scanner operators can't count. | `scanner/home/_components/home-screen.tsx:34-54` (tile list) |
| SN-2 | P3 | [NEW] | **No scanner waste HOME tile, and no scanner adjustment/RMA tiles.** Waste exists only as a WO sub-route (`scanner/wos/[id]/waste`), not a top-level tile; unplanned adjustments & returns have no scanner entry at all (roadmap 5.7 tile expansion). | `scanner/home/_components/home-screen.tsx:34-54`; waste route exists at `scanner/wos/[woId]/waste/page.tsx` |
| SN-3 | P2 | [NEW] | **Desktop↔scanner ledger asymmetry (consume/output): NEITHER writes stock_moves (see PR-2/PR-3), but scanner ALSO writes `scanner_audit_log` while desktop writes nothing equivalent.** So a consumption's provenance depends on which surface did it — cross-surface reporting (movements, ledger) can't reconcile. | scanner writes audit at `app/api/production/scanner/wos/[id]/consume/route.ts:500-530`; desktop explicitly skips it `consume-material-actions.ts:20-22` |

Solid/[IN-FLIGHT]: scanner consume/output/waste/start routes all gate on `app.user_can_see_site` (F2 site-RLS landed); consume RBAC re-check + two-tier over-consume + PIN-approval + FEFO adherence; server-replay idempotency (`findServerReplay`/`insertServerReplay`); reverse-consume route present (Q2 `::uuid` crash-fix landed).

---

## Section 5 — OEE + MAINTENANCE (snapshots, andon, PM/MWO, calibration)

| ID | Sev | Tag | Finding | Evidence |
|----|-----|-----|---------|----------|
| MT-1 | P1 | [NEW] | **Calibration is fully read-only — `calibration_records` and `calibration_instruments` have NO app writer anywhere.** The register lists instruments + latest record (next-due, result, certificate URL columns), but you cannot record a calibration result, upload a cert, or add/edit an instrument. `grep 'calibration_records'` (non-test, non-list) = 0 writers. The screen IMPLIES records exist and are maintained; nothing can create them. Roadmap 3.9/4.4 tag it, but the total absence of any writer (not even instrument CRUD) is worth surfacing as the concrete gap. | `maintenance/calibration/_actions/list-calibration.ts:98-147` (only read); no writer for `calibration_records`/`calibration_instruments` |
| MT-2 | P2 | [KNOWN 4.4/O5] | **No PM→MWO generation.** PM schedules are LISTED (`listPmSchedules`) with next-due dates, but nothing generates an MWO from a due PM. `createMwo` only sets source `manual_request` or `auto_downtime`; the MWO `source` enum has `pm_schedule`/`oee_trigger`/`calibration_alert` that are NEVER produced. | `maintenance/_actions/mwo-actions.ts:476` (source only manual/auto_downtime); `:625` listPmSchedules read-only |
| MT-3 | P2 | [KNOWN 4.4/O4] | **No MWO detail route — completion is a bare state flip with no work-log/parts/labor/photos/cost.** Only `maintenance/page.tsx` + `maintenance/calibration/page.tsx` exist. `transitionMwo` to 'completed' records nothing about what was done. | route scan: only 2 pages under `maintenance/`; `mwo-actions.ts:538-` transitionMwo (state only) |
| MT-4 | P2 | [NEW] | **Latent MWO state-machine dead-end for auto-sourced rows.** `LEGAL_TRANSITIONS` lets `requested`/`approved` MWOs go ONLY to `cancelled` (comment: "cannot be started here"). Any MWO seeded by a future PM/calibration/downtime producer in `requested`/`approved` can never reach `in_progress` — it's a terminal dead branch. Currently unreachable only because `createMwo` hardcodes `'open'` (:485) and no auto-producer exists (see MT-2). | `maintenance/_actions/mwo-actions.ts:92-99` (LEGAL_TRANSITIONS), `:485` (createMwo → 'open') |
| MT-5 | P2 | [KNOWN 5.8] | **Andon is a read-only kiosk — no acknowledge/resolve action.** `oee/andon/[lineId]/page.tsx` has no mutation; no `andon_event` acknowledge writer. Operators can view line status but not act on it. | `oee/andon/page.tsx` (read-only); andon-detail page: 0 action handlers; `grep acknowledge oee/` = 0 |

Solid: MWO create + transition (legal-transition map, FOR UPDATE lock, mnt.* RBAC, SoD on cancel vs execute, outbox on completion); OEE snapshots (08-production is sole producer via `recordWoCompletionSnapshot` inside complete txn — canonical-owner rule respected); andon live line status read.

---

## TOP-10 (NEW first, then by severity)

1. **MT-1 (P1, NEW)** — Calibration has zero writers: `calibration_records`/`calibration_instruments` are read-only app-wide; the register displays maintained records that nothing can create. `maintenance/calibration/_actions/list-calibration.ts:98-147`.
2. **PR-1 (P1, NEW)** — `cancelWo` from `completed` destroys output LPs but never reverses WAC → permanent inventory over-valuation. `lib/production/complete-cancel-wo.ts:247-324` (no upsertWac) vs `register-output.ts:734`.
3. **PR-2 (P2, NEW)** — Material consumption writes no `stock_moves` on either desktop or scanner; outbox has no handler to materialize one. `consume-material-actions.ts:455-569`; `scanner/wos/[id]/consume/route.ts:409-498`; `apps/worker/src/jobs/outbox-consumer.ts`.
4. **PR-3 (P2, NEW)** — Production output (FG receipt) writes no `stock_moves`; warehouse movements ledger omits all production receipts. `lib/production/output/register-output.ts` (0 stock_moves).
5. **PR-4 (P2, NEW)** — Outputs/waste recordable after `completed`, but `actual_qty`/yield frozen at completion → silent under-report. `lib/production/shared.ts:204-208` vs `complete-cancel-wo.ts:139-168`.
6. **PL-3 (P2, NEW)** — Schedule board silently truncates unscheduled WOs at `limit 50`, no indicator. `planning/schedule/_actions/schedule-board.ts:138-145`.
7. **SC-1 (P2, NEW)** — Scheduler apply has no SoD: same user applies AND approves every assignment (explicit TODO). `scheduler/_actions/scheduler-actions.ts:610,614-623`.
8. **SN-3 (P2, NEW)** — Consume ledger asymmetry: scanner writes `scanner_audit_log`, desktop writes nothing equivalent; neither writes stock_moves → cross-surface reconciliation impossible. `scanner .../consume/route.ts:500-530` vs `consume-material-actions.ts:20-22`.
9. **MT-4 (P2, NEW)** — Latent MWO dead-end: `requested`/`approved` MWOs can only be cancelled, never worked (activates the moment any auto-producer lands). `mwo-actions.ts:92-99`.
10. **PR-7 (P3, NEW)** — Changeover completion emits no downtime_events(source='changeover'); line-stop time invisible to Downtime/OEE. `production/_actions/changeover-actions.ts:440-472`.

Also-ran NEW: PR-6 (dead `reservationsReleased`), PR-8/PR-9 (changeover route/RBAC dup), PL-4 (stale mrp.ts header), SN-2 (missing scanner waste/adjust/RMA tiles).
Notable KNOWN carry-forwards confirmed live: PR-5 (dead Log-downtime button, 4.4), PL-1 (single-level MRP, 5.1), PL-2 (fixed schedule window, 4.14), SN-1 (no scanner counts tile, 4.3), MT-2/MT-3 (no PM→MWO, no MWO detail, 4.4), MT-5 (andon read-only, 5.8).
