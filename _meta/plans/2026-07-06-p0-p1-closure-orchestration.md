# P0 + P1 closure — 6-track orchestration plan (autonomous ~6h)

**Goal:** close ALL fleet-audit-B **P0 (3) + P1 (21)** net-new gaps + the 3-station scanner gap,
with cross-review + **E2E-on-deploy gates**, and ≥1 (ideally 2) full acceptance walkthroughs.
Source: `_meta/reviews/2026-07-02-fleet-audit-B/00-REMAINING-WORK-status.md §3`.

## Orchestration model (Claude = orchestrator)
- **Engines** per `engine-delegation`: Composer-2.5 = impl (bulk), Codex = review + migrations/infra. Writer≠reviewer. Composer code ALWAYS reviewed.
- **Isolation:** each track works in its own **git worktree** so parallel engine edits never race. A track's wave merges to `main` only after: Codex review clean + tsc 0 + targeted tests green + **E2E affected-flow smoke on the deployed prod**.
- **Cadence:** a **cron wakes me every ~25 min** to shepherd — advance any track whose workflow finished (review→arbitrate→fix→merge→deploy→E2E→next item), and keep every idle track's engine busy. Workflow-completion notifications also re-invoke me between crons. No track sits idle.
- **Per-wave gate (NO shortcuts):** impl → Codex review → I arbitrate → fix → `tsc --noEmit` 0 → targeted vitest → merge → Vercel deploy Ready → **browser E2E of the affected flow on prod** (the confirmation it actually works) → commit gate passed. A red gate blocks merge; fix-forward before advancing.
- **Safety:** git tag per wave; `pg_dump` before any destructive migration; deploy CODE before column-drop migrations; never commit the ~560 dirty evidence files.

## Dependency spine
`upsert-wac.ts` / `item_wac_state` is central — **Track FIN establishes the WAC-debit primitive first**; Tracks WH + PROD-disassembly reuse it (sequenced after FIN's primitive merges). All other tracks are independent and start immediately.

## The 6 tracks (24 P0/P1 + riders)

### Track 1 — FIN · WAC valuation integrity (P0 spine) — start immediately, blocks WH/disassembly
- **NN-FIN-1 (P0)** WAC never DEBITED on consume/ship — add `item_wac_state` debit at consume + ship (the primitive).
- **NN-FIN-2 (P0)** `resolved:false` UoM silently booked as kg on receipt — honor the flag (block/flag, don't book raw as kg).
- **NN-FIN-3** FG output valued standard `NULL→0` — value FG at real WO cost, post variance.
- **NN-FIN-4** upsert-wac clamps qty & value independently — clamp coherently (avoid value>0/qty=0).
- **NN-PUR-2** WAC hardcodes GBP + ignores site — key currency on PO currency, per-site valuation.
- E2E gate: receive (mixed UoM) → consume → ship → inventory valuation matches hand-calc; re-buy at new price moves avg_cost correctly.

### Track 2 — PROD · WO lifecycle + disassembly
- **NN-PROD-1 (P0)** startWo self-heal auto-binds newest active BOM+spec (no site filter) — bind ONLY the WO's released snapshot; never re-base; site-filter.
- **NN-P1** completeWo/closeWo ignore WO-grain hold — wire `assertWoNotOnHold(woId)` into complete + close.
- **NN-PROD-6** yield-gate bypass via ungated free-text override — require a reason-code taxonomy + distinct permission.
- **NN-PROD-2/3/4/5** disassembly: validate `allocation_pct` sums 100; fix WAC void-asymmetry (use FIN primitive); stamp `wo.site_id` not `ctx.siteId`; add mass-balance guard. (3 needs FIN primitive → sequence after FIN.)
- E2E gate: release WO on old BOM → start → BOM basis unchanged; put WO on hold → complete blocked; disassembly co-product costs sum to input.

### Track 3 — WH · warehouse WAC + SoD (after FIN primitive)
- **NN-WH-1** direct-adjust feeds raw UoM as kg to WAC — use `resolveWacDeltaQtyKg`.
- **NN-WH-2** cycle-count variance apply has no WAC leg — add WAC delta.
- **NN-WH-3** destroyLp no WAC reversal — decrement WAC.
- **NN-WH-4** count shrinkage no supervisor SoD — add supervisor+PIN like direct-adjust.
- E2E gate: adjust/count/destroy each move WAC; count write-off needs a second supervisor.

### Track 4 — PUR · purchasing lifecycle + RBAC (independent)
- **NN-PUR-1** createPO trusts client `status` — force draft-only on create.
- **NN-PUR-3** rollup can't return PO to `confirmed` after last receipt cancelled — add zero-receipt branch.
- **NN-PUR-4** `suppliers.status='blocked'` never read — block PO-create + GRN-receive on blocked supplier.
- **NN-PUR-5** PO/supplier READ actions ungated — add read RBAC (parity with GRN reads).
- E2E gate: PO cannot be created `received`; blocked supplier rejected at PO + GRN; non-purchasing user can't read PO prices.

### Track 5 — SHIP · shipping/sales lifecycle (independent)
- **NN-SHIP-1** pack has no shipment-status guard — reject pack into shipped/cancelled.
- **NN-SHIP-2** recordPod counts cancelled siblings — exclude cancelled (mirror shipShipment).
- **NN-SHIP-3** ship never decrements `quantity_allocated` — decrement on ship.
- **NN-SHIP-4** createSalesOrder ignores customer is_active — validate active/soft-delete.
- E2E gate: pack after ship blocked; POD closes SO with a cancelled sibling; allocation decrements on ship.

### Track 6 — SEC/OPS · scanner RBAC + 3-station + audit + scheduler + maintenance (independent)
- **NN-SC1** 3 scanner WRITE endpoints skip RBAC (receive/labor/lock-lp) — add the desktop-twin permission + org-site line_id validation.
- **NN-SC2** `/api/scanner/context` writes lineId/shift unvalidated — validate line belongs to org+site.
- **3-STATION scanner op-awareness (your question)** — make the scanner WO surface operation-aware: an operator's session-line shows the WOs whose routing has an op on that line (via `wo_operations.line_id`), scoped to their operation — so mixer/oven/packing each see their stage of a multi-line WO (today only WIP-modelled stages split; single multi-op WO shows to one line only). Design + build (owner's pizza flow).
- **NN-SET-1** split-brain audit — Settings audit viewer reads only `audit_log`; also read `audit_events` (RBAC changes visible).
- **NN-SET-2** deactivateUser no sole-owner guard — add last-owner guard + canonical permission checker.
- **NN-PLAN-1** allergen changeover cost always 0 — fix the matrix key (`allergen_from = any(profile)` like production).
- **NN-PLAN-2/3** scheduler zero-duration + discarded risk cols — derive duration; honor requires_cleaning/atp/risk_level.
- **NN-SCHED** scheduler_config unwired + applySchedule no SoD — wire config + add SoD.
- **NN-MNT-1/2** maintenance PM→MWO bridge — largely unblocked by W3-T4 (both on equipment now); VERIFY PM→MWO produces `PLANNED_MWO_SOURCES` + KPI no longer pinned 0.
- E2E gate: scanner write without permission rejected; 3-station WO visible per operator; RBAC change appears in audit viewer; scheduler emits non-zero durations.

## Full E2E acceptance runs (the proof)
- **Run 1 (mid, after Tracks FIN+PROD+WH merge):** clean-slate-ish → Site→WH→Line→Processes(roles)→Items→NPD(WIP-staged pizza, 3 stages)→PO→GRN(mixed UoM)→WO chain→consume→produce→**verify valuation + hold + BOM-basis fixes hold**.
- **Run 2 (end, after all tracks):** same + shipping + scanner per-station + blocked-supplier + audit — full order-to-cash, every fix exercised. Browser, on deployed prod.

## Wave count & realistic 6h scope
~**16 fix-waves** (Track FIN 3, PROD 3, WH 2, PUR 2, SHIP 2, SEC/OPS 4) + **2 full E2E runs**. With worktree parallelism (≤6 concurrent) + cron shepherding, 6h covers the **P0 spine + the high-severity P1** (holds, purchasing, shipping, scanner RBAC, WAC) with E2E gates for sure; the longer-tail P1 (scheduler internals, 3-station op-aware build) land if time holds. **Priority order if time runs short:** FIN(P0) → PROD(P0 startWo + holds) → PUR-1 → SHIP → WH → SEC → scheduler/3-station last. Every merged wave is independently deployed + E2E-verified, so a partial run still leaves prod green + a clear resume point.

## Guardrails recap (no shortcuts)
tsc 0 before every merge · Codex review every Composer diff · E2E on prod per wave · pg_dump before destructive migration · git tag per wave · deploy-order for schema drops · report every gate result honestly (red = blocked, not silently skipped).
