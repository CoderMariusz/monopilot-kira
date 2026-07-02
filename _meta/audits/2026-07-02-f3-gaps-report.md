# F3 whole-app gaps report ("raport braków") — 2026-07-02

Sources: 4 Opus audit lanes (A1 NPD/Technical/Settings · A2 Planning/Production/Scanner/OEE · A3 Warehouse/Shipping/Quality/Finance · A4 live-browser CRUD walk of 17 entities) run against main `4248cbc0` + production, cross-referenced with `_meta/plans/2026-07-02-ROADMAP-master.md`. Full per-finding evidence (file:line) in `/tmp/f3/audit-A{1,2,3}.md` + `/tmp/f3/audit-A4-crud.md` (copies preserved below the fold of each lane report). Agent-B is running an independent second-pass audit (`_meta/reviews/2026-07-02-fleet-audit-B/`) — merge its net-new items when it lands.

## Verdict in one paragraph

The machinery keeps getting more honest: F1-F3 closed most of the claim-vs-enforcement P0s (forward trace names customers, holds have one gate, CCP deviations honor disposition, scanner respects per-user-site). What remains splits into (a) a small set of NEW P1 enforcement lies found this wave — configurable sign-off policies that nothing reads, a calibration register with zero writers, an SO state machine that lets shipped orders be un-shipped — (b) systematic ledger incompleteness (consumption/production write no stock_moves), and (c) missing CRUD legs and silent-failure UX that the A4 walk pinned precisely (2 silent CREATE no-ops). The ROADMAP is structurally right but stale in spots (its 4.8 finance table was dropped in mig 404).

## TOP-12 (NEW findings first, then sharpest KNOWN)

| # | Sev | Tag | Finding | Source |
|---|-----|-----|---------|--------|
| 1 | P1 | NEW | **`signoff_policies` UNENFORCED** — Settings→Sign-off writes required-signatures/roles/same-user rules; zero readers outside the settings screen. The wave-8 dual-sign configuration is decorative. (Same screen's overconsume thresholds ARE live — it mixes one real control with one dead one.) | A1 SET-1 |
| 2 | P1 | NEW | **Calibration has ZERO writers** — register displays next-due/result/certificate; no action writes `calibration_records`/`calibration_instruments` anywhere. BRCGS calibration claim is display-only. | A2 MT-1 |
| 3 | P1 | NEW | **SO un-ship transitions** — `so-transitions.ts:50-52` allows `shipped/delivered → allocated/confirmed/packed`; un-shipping can re-allocate shipped stock and orphan shipments. | A3 S-4 |
| 4 | P1 | NEW | **cancelWo from `completed` destroys output LPs without WAC reversal** — valuation permanently overstated (register-output adds WAC; voidWoOutput reverses; this path doesn't). | A2 PR-1 |
| 5 | P2 | NEW | **Consumption + production output write NO `stock_moves`** — only waste/TO/adjust/counts/split-merge hit the ledger; a movements report omits receiving, consumption and production receipts. Needs an owner decision on ledger completeness scope. | A2 PR-2/3 |
| 6 | P1 | NEW | **2 silent CREATE no-ops on live prod** — User invite (`/settings/users`) and Inspection create POST 200, create nothing, show nothing. Operator gets zero feedback. | A4 |
| 7 | P2 | NEW | **Contamination-risk matrix feeds nothing** — screen docstring claims it feeds the allergen-changeover gate; `allergen_contamination_risk` has no reader in production/scheduler. | A1 TEC-1 |
| 8 | P2 | NEW | **User lifecycle dead-ends** — deactivate is one-way (no reactivate action exists); no admin MFA reset (lost authenticator = unrecoverable account). | A1 SET-2/3 |
| 9 | P2 | NEW | **Roadmap 4.8 is stale** — `wo_actual_costing` (the WO cost-snapshot backbone) was DROPPED in mig 404; the item now requires re-creating the table, not just wiring it. | A3 F-1 |
| 10 | P1 | KNOWN | **Trace still can't pass a mock recall**: no mass-balance/%-recovered reconciliation; graph silently truncates at limit 200/500 with no operator warning (a real recall under-reports). | A3 Q-1/Q-2 (roadmap 0.3 residual) |
| 11 | P1 | KNOWN | **GS1-128/SSCC absent** (retailer sell-blocker); BOL is JSON+hash in a column, not a document. | A3 S-2/S-3 (roadmap 3.4/2.2) |
| 12 | P2 | KNOWN | **Wrong-gate RBAC residue**: `releaseWorkOrder` gates on `npd.planning.write` (not a production perm); catalog `settings.impersonate.tenant` vs runtime `impersonate.tenant` mismatch; 146/262 catalog permissions unenforced (now BADGED honestly in the role editor as of F3-G8). | G8 + A1/A2 |

## Closed BY THIS WAVE (found by audits, already fixed in `8a350c80`)

- Customer master create-only (A4/A3 S-1) → G9 shipped detail/edit/addresses/deactivate + mig 417.
- Desktop GRN receiving missing (owner backlog B1) → G10.
- CCP auto-hold under-scoping M14 + inspection-decision no-ops M15 (A2 confirmed in-flight) → G1.
- Batch-hold blank reference display → G2.
- RBAC honesty badge (D3 short-term) → G8.
- mig 408 confirmed LIVE (A1's carry-forward flag) — verified in schema_migrations at the gate.

## Additional P2/P3 (schedulable filler)

- A2: post-completion outputs don't update yield (`shared.ts:204` vs `complete-cancel-wo.ts:139`); scheduler apply has no SoD (TODO at `scheduler-actions.ts:610`); schedule board truncates unscheduled WOs at 50; latent MWO dead-end (`requested/approved` only cancellable).
- A1: NPD sensory stage read-only in-pipeline (entry only via Technical); where-used only loads via `?code=` URL + hardcoded EN; materials list truncates at 200 silently.
- A3: WAC unknown-UoM path still adds raw qty to `total_qty_kg` (`upsert-wac.ts:95`); `exception` shipment status unreachable; PO status changes untimestamped; LP `source_so_id` never stamped at ship (trace uses the definer walk instead — decide one canonical path); hardcoded EN on finance page; `declared_allergens`/`declared_attrs` (mig 162) still 0 app refs; `certificate_refs` read but never verified/gated.
- A4: draft WO has no cancel/delete affordance in UI (action exists — G4 hardened it; UI button missing); draft SO no line/header edit; NCR no close button (gated behind unbuilt CAPA); "All sites" traps: PO create hard-blocked, count session 404s in own detail when site ≠ top bar; supplier detail raw i18n key `detail.scorecard`.
- Owner-flagged decision (R-G1 SHOULD-3): inspection-pass auto-release bypasses `quality.batch.release` via `requirePermission:false` — deliberate (the signed inspection decision is the gated act) but needs owner sign-off; documented in code.

## Suggested next-wave shape (F4 candidates, priority order)

1. **Enforcement-lies batch**: wire `signoff_policies` into dualSign/signEvent call sites (or remove the screen); calibration writer actions + instrument CRUD (roadmap 3.9 pull-forward); SO transition narrowing (kill un-ship); cancelWo WAC reversal.
2. **Silent-failure UX batch**: user-invite + inspection-create no-ops (root-cause: likely swallowed server errors); "All sites" guards (banner/auto-scope) for PO create + count sessions.
3. **Ledger completeness** (owner decision first): stock_moves for consume/output, or an explicit documented scope of what the ledger covers.
4. **Trace completion** (roadmap 0.3 residual): mass balance + truncation warning — the last blockers to a passable mock recall.
5. Stock UI legs: WO cancel button (draft), SO draft edit, NCR close (or hide with reason), user reactivate + MFA reset.
