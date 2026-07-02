# Fleet-B Reconciliation — 2026-07-02
Baseline: F3 gaps report (`_meta/audits/2026-07-02-f3-gaps-report.md`) vs B's 10 docs in
`_meta/reviews/2026-07-02-fleet-audit-B/`. Git HEAD `ae20c5a9`.

---

## 1. NET-NEW gaps (not in F3 report, not closed by F3 wave commits 8a350c80 / 1d560dc0)

Excluded: UX/styling items (those belong to B's planned 04/05 wave). Excluded: items where
the F3 report already carries the same finding (e.g. SO un-ship = #3; silent no-ops user-invite
already #6; stock_moves ledger completeness = #5; trace truncation = #10).

| ID | Sev | Finding | File:line (spot-verified vs HEAD) | B-doc / section |
|----|-----|---------|----------------------------------|-----------------|
| NN-PROD-1 | P0 | `startWo` self-heal auto-binds NEWEST active BOM + factory_spec when snapshot is missing — no site filter, corrupts as-produced record silently | `apps/web/lib/production/start-wo.ts:98-143` (`order by fs.version desc limit 1`, `order by bh.version desc limit 1` — CONFIRMED) | 00 §3 / 06 T-D1-02 |
| NN-FIN-1 | P0 | WAC pool is add-only: `consume-material-actions.ts` and `ship-actions.ts` have ZERO `upsertWac` calls — lifetime avg_cost is diluted by material that physically left; all post-first-receipt valuations are wrong | `apps/web/lib/production/consume-material-actions.ts` (grep-empty for `upsertWac`) / `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts` (grep-empty) — CONFIRMED | 00 §3 NN-FIN-1 / 06 T-D2-01 |
| NN-FIN-2 | P0 | `resolveWacDeltaQtyKg` returns `{resolved:false}` for non-kg UoMs; both `receive-po-line.ts:71` and `receipt-corrections-actions.ts:433` destructure only `{qtyKg}`, booking raw each/box counts as kg | `apps/web/lib/finance/upsert-wac.ts:95/106`; call sites confirmed in prior wave notes | 00 §3 NN-FIN-2 / 06 T-D1-01 |
| NN-HOLD-1 | P1 | `releaseHoldCore` line 683: `lpQaStatus = disposition === 'scrap' ? 'rejected' : 'released'` — a `rework` release sets LP `qa_status='released'`, freeing contaminated stock into production/shipping | `apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:683` — CONFIRMED (rework → released, not on_hold) | 03-quality #1 / 06 T-D1-03 |
| NN-HOLD-2 | P1 | `partial` disposition: hold unconditionally set to `'released'` at line 688, all LPs flipped to `'released'`/`'available'`; `qty_released_kg` case branch fires only for `'released'` literal (line 706), never for `partial_released` → partial holds are fully closed with no qty audit | `apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:682-706` — CONFIRMED | 03-quality #1 |
| NN-CCP | P1 | `classifyCcpHoldDisposition` uses free-text substring tokenization: "cannot be released, hold for retest" contains token `release` → classifies as `{kind:'release'}`, auto-releasing a CCP breach hold | `apps/web/app/[locale]/(app)/(modules)/quality/_actions/ccp-deviation-actions.ts:75-96` — CONFIRMED (line 91: `tokens.has('release') → {kind:'release'}`) | 03-quality #2 / 06 T-D1-04 |
| NN-RECALL-DRILL | P1 | `completeRecallDrill` stores caller-supplied `result` verbatim (line 800: `result_jsonb = $2::jsonb`); no server recompute; a compliance record (kg, customers affected) can be fabricated | `apps/web/app/[locale]/(app)/(modules)/quality/trace/_actions/trace-actions.ts:791-815` — CONFIRMED | 03-quality #4 |
| NN-RECALL-TRUNC | P1 | Trace seed caps at 200 LP / 500 batch with no operator warning; silent partial recall re-introduces the BRCGS 3.9.2 gap the org-wide DEFINER was built to close | `apps/web/app/[locale]/(app)/(modules)/quality/trace/_actions/trace-actions.ts:289,302,315` — CONFIRMED | 03-quality #3 / 06 T-D3-05 |
| NN-RECALL-PERM | P2 | `startRecallDrill` + `completeRecallDrill` gated on `quality.dashboard.view` (READ perm, TODO in code); any read-only quality viewer can CREATE recall-drill records and expose every customer/supplier/PO/shipment | `apps/web/app/[locale]/(app)/(modules)/quality/trace/_actions/trace-actions.ts:202` | 03-quality #5 |
| NN-ESIGN | P2 | `hold-actions.ts:698` stores `receipt.subjectHash` as `release_signature_hash`; `ncr-actions.ts:684/696/707` store `receipt.subjectHash` as `closure_signature_hash`. `subjectHash = sha256(canonicalJson(subject))` is deterministic/reproducible by anyone who knows the input — no signer identity, no nonce, no FK to `e_sign_log`. CCP correctly stores `receipt.signatureId`. | `packages/e-sign/src/sign.ts:36-38`; `hold-actions.ts:698`; `ncr-actions.ts:684` | 03-quality #6 |
| NN-WH-1 | P1 | Direct-adjust `upsertAdjustmentWac` passes raw `quantity` as `signedDeltaQtyKg` (line 644) without calling `resolveWacDeltaQtyKg` — adjustments in each/box/case silently corrupt `total_qty_kg` and `total_value` | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/direct-adjust-actions.ts:448-461,642-644` — CONFIRMED | 00 §3 NN-WH-1 |
| NN-WH-2 | P1 | `approveAndApplyVariance` (count-actions.ts) mints/reduces LPs and writes stock_adjustments but zero `upsertWac` calls → `item_wac_state` drifts on every applied cycle count | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/count-actions.ts` (grep-empty for `upsertWac`) — CONFIRMED | 00 §3 NN-WH-2 |
| NN-WH-3 | P1 | `destroyLp` writes a negative stock_move but no `upsertWac` decrement → disposed material stays valued in `item_wac_state` indefinitely | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/lp-split-merge-destroy-actions.ts` (grep-empty for `upsertWac`) — CONFIRMED | 00 §3 NN-WH-3 |
| NN-SC1 | P1 | Scanner write endpoints have zero RBAC: `/api/scanner/labor/route.ts` — no `hasPermission`/`requirePermission` (grep-empty, CONFIRMED); `/api/scanner/lock-lp/route.ts` — same (CONFIRMED). Desktop twins enforce `production.consumption.write` / `warehouse.grn.receive` respectively | `apps/web/app/api/scanner/labor/route.ts`; `apps/web/app/api/scanner/lock-lp/route.ts` | 00 §3 NN-SC1 |
| NN-SC2 | P2 | `/api/scanner/context` writes `lineId` + `shift` unvalidated (only `siteId` checked); a cross-org/invisible `line_id` pinned to session is later trusted by output-route WO filter and labor clockIn | 00 §3 NN-SC2 |
| NN-SHIP-1 | P1 | `packLpIntoBoxCore` has no shipment-status guard: LPs can be packed into an already-shipped/cancelled shipment → phantom shipped contents, double-counted stock (QA-hold recheck fixed in F3; lifecycle guard still missing) | `apps/web/lib/shipping/pack-lp-into-box.ts:54` | 00 §3 NN-SHIP-1 |
| NN-SHIP-2 | P1 | `recordPod` sibling check (`ship-actions.ts:521`) uses `status <> 'delivered'` — cancelled shipments count as "non-delivered" → SO permanently trapped in `partially_delivered` | `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:521` — CONFIRMED | 00 §3 NN-SHIP-2 |
| NN-SHIP-3 | P1 | `shipShipment` never decrements `sales_order_lines.quantity_allocated` — stale allocation post-ship; cancel/deallocate do decrement; grep-empty on `ship-actions.ts` — CONFIRMED | `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts` | 00 §3 NN-SHIP-3 |
| NN-PUR-1 | P1 | `create-purchase-order-core.ts:175` inserts `input.status` verbatim; Zod schema only `.default('draft')` (no enum-restrict to draft-only); a PO can be created directly as `received`/`confirmed` with zero GRNs | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-purchase-order-core.ts:175`; `apps/web/app/[locale]/(app)/(modules)/planning/_actions/procurement-shared.ts:77` — CONFIRMED (`PurchaseOrderStatusSchema.default('draft')` does not restrict to draft-only) | 00 §3 NN-PUR-1 |
| NN-PUR-4 | P2 | `suppliers.status='blocked'` is never read at PO-create or GRN-receive; POs can be raised against blocked suppliers | 00 §3 NN-PUR-4 / 03 §3.6 |
| NN-SET-1 | P1 | Split-brain audit trail: `role-admin-actions.ts:344` writes RBAC events to `public.audit_events`; `audit-log-loader.ts:204/224/254` reads ONLY `public.audit_log` (UNION absent — CONFIRMED). Highest-value security events invisible to compliance viewer | `apps/web/app/[locale]/(app)/(admin)/settings/audit/audit-log-loader.ts:204,224,254` — CONFIRMED | 00 §3 NN-SET-1 / 06 T-D3-03 |
| NN-SET-2 | P1 | `deactivateUser` has no sole-owner guard; only blocks self-deactivation (line 93 checks `settings.users.deactivate`, no owner_count CTE); one call strips all active admins from an org with no in-app recovery | `apps/web/actions/users/deactivate.ts:83-141` — CONFIRMED | 00 §3 NN-SET-2 / 06 T-D3-04 |
| NN-TEC-5 | P2 | Allergen declaration accept/revoke authorizes by role code `'npd_manager'` slug (name-based bypass, dual SoT against `role_permissions`) | `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/allergens/_actions/accept-declaration.ts:166-173` — CONFIRMED | 00 §3 NN-TEC-5 |
| NN-PROD-1-WO | P1 | `completeWo`/`closeWo` ignore WO-grain hold (`assertWoNotOnHold` wired only into consume paths); a WO under an active WO-level hold can be completed and e-sign closed | `apps/web/lib/production/complete-cancel-wo.ts` — roadmap 0.6 wider-than-scoped | 00 §1 NN-P1 |
| NN-PROD-6 | P1 | Completion yield-gate bypassed via any non-empty ≤64-char free-text `overrideReasonCode` string — no distinct permission, no reason-code taxonomy; any `production.wo.complete` holder can close a zero-output WO | `apps/web/lib/production/complete-cancel-wo.ts:119` — CONFIRMED | 00 §3 NN-PROD-6 |
| NN-MNT-1 | P1 | Maintenance runs on two disjoint registries: MWOs key on `public.machines` (mwo-actions.ts:376,410,451); PM schedules + calibration instruments key on `public.equipment` (:652). No bridge → PM-due events can never become MWOs; planned-vs-unplanned KPI is structurally 0 | `apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:376,410,451,652` — CONFIRMED | 00 §3 NN-MNT-1/2 |
| NN-PLAN-1 | P1 | Allergen changeover cost is silently 0 for every multi-allergen product: scheduler builds cost lookup keyed on single codes; allergen profile is pipe-joined (`egg|milk`) → miss → `?? 0`; whole changeover matrix unused | 00 §3 NN-PLAN-1 |
| NN-PLAN-2 | P1 | Scheduler emits zero-duration assignments: open WOs have no scheduled timestamps → `plannedStart==plannedEnd==now` for every WO | 00 §3 NN-PLAN-2 |
| NN-FIN-3 | P2 | FG output valued at standard `cost_per_kg` with NULL→0 in `register-output.ts:788/850`; un-costed FG enters WAC at zero, drags avg_cost down | 00 §3 NN-FIN-3 |

**Items already in F3 report (not re-listed above):** SO un-ship transitions (F3 #3), cancelWo WAC reversal (F3 #4), stock_moves ledger completeness (F3 #5), trace mass-balance + truncation warning (F3 #10), user reactivate / MFA reset (F3 #8), signoff_policies unenforced (F3 #1), calibration zero writers (F3 #2), RBAC residue (F3 #12). GS1/SSCC (F3 #11).

---

## 2. CODE CHANGES by B?

Doc 08 (`08-UI-RESPONSIVENESS-fixes-applied.md`) claims "real, committed edits on 8 isolated
local branches — not merged, not pushed."

**Evidence:**
- `git branch -a` lists exactly the 8 branches named in the doc: `worktree-wf_5932831b-5ef-1`
  through `-8` (CONFIRMED present as remote-tracking refs marked `+`).
- `git log --oneline worktree-wf_5932831b-5ef-1` shows commit `0f50cdf6` ("ui(production+scanner):
  responsive + design-consistency fixes") with the stated 4-file diff — CONFIRMED.
- `git log --oneline worktree-wf_5932831b-5ef-8` shows commit `180c85f4` with the stated
  platform-bundle changes — CONFIRMED.
- `git log --oneline main` does NOT contain any of the 8 commit hashes (`0f50cdf6`,
  `7774e751`, etc.) — CONFIRMED: **not on main**.
- `git diff main..worktree-wf_5932831b-5ef-1` shows the expected 4 production/scanner files
  changed plus the shared baseline files that diverged from main (docs/audits from the F3 wave
  on main but absent from the worktree base) — net production code diff is exactly the claimed
  `+20/−10`.

**Verdict: B DID touch the tree.** Eight real commits exist on eight local worktree branches
under `.claude/worktrees/wf_5932831b-5ef-*`. They are isolated, not merged, not pushed. The
"applied" in the doc title means "committed to isolated worktrees, ready for cherry-pick review"
— not "landed on main". The code is behaviorally-preserving className/markup/i18n changes only
(confirmed by the diff stats). Main is clean.

One real i18n functional fix is buried in branch 8 (login card EN hardcode → localized). Doc 08
calls this out explicitly.

---

## 3. F4 OVERLAP check

F4 lanes (from F3 gaps report §Suggested-next-wave):
- A: `signoff_policies` enforcement
- B: calibration writers
- C: SO transition narrowing
- D: cancelWo-from-completed WAC reversal + WAC unknown-UoM residual
- E: silent no-ops (user invite + inspection create)
- F: "All sites" traps (PO create + count session)
- G: stock_moves for consume/output
- H: trace mass-balance + truncation warning
- I: user reactivate + MFA reset
- J: small i18n/UI batch

B's 06 doc (3-day roadmap) tasks that collide with F4:

| B Task | Collides with F4 lane | Shared files / feature |
|--------|----------------------|------------------------|
| T-D1-01 NN-FIN-2 (upsert-wac resolved:false) | D (WAC unknown-UoM residual) | `apps/web/lib/finance/upsert-wac.ts`, `apps/web/lib/warehouse/_actions/receive-po-line.ts` |
| T-D2-01 NN-FIN-1 (WAC debit on consume/ship) | G (stock_moves for consume/output) + D | `apps/web/lib/production/consume-material-actions.ts`, `ship-actions.ts`, `upsert-wac.ts` — **must serialize after D or after T-D1-01** |
| T-D1-02 NN-PROD-1 (startWo fail-closed) | No direct F4 lane, but touches `lib/production/start-wo.ts` which is also read by the WO cancel path in D (cancelWo WAC reversal) | Low conflict; caution on `start-wo.ts` |
| T-D1-03 NN-HOLD-1/2 (hold rework/partial semantics) | Shares `hold-actions.ts` with F4-E (inspection create — different file) | No collision; different files |
| T-D1-04 NN-CCP (CCP enum replace free-text) | No F4 lane directly | No collision |
| T-D3-05 NN-RECALL-TRUNC (recall seed truncation) | H (trace truncation warning) | `apps/web/app/[locale]/(app)/(modules)/quality/trace/_actions/trace-actions.ts:288-315` — **DIRECT COLLISION: same file, same lines** |
| T-D3-03 NN-SET-1 (audit viewer UNION) | No F4 lane | No collision |
| T-D3-04 NN-SET-2 (deactivateUser sole-owner) | I (user reactivate + MFA reset) — same `apps/web/actions/users/` folder; different files (`deactivate.ts` vs reactivate — non-existent yet), but any new user-lifecycle actions land in the same directory | Low collision; serialize within lane I |
| T-D2-09 NN-SHIP-1 (pack status guard) | C (SO transition narrowing — related shipping lifecycle) | Both touch `lib/shipping/`; `pack-lp-into-box.ts` vs `so-transitions.ts` — different files, safe to parallel |
| T-D2-10 NN-PUR-1 (PO draft-only) | F ("All sites" PO create trap) | Both touch `planning/purchase-orders/_actions/create-purchase-order-core.ts` — **COLLISION: same file** |

**Summary of hard serialization requirements:**
1. B-T-D3-05 (recall truncation fix) vs F4-H (trace truncation warning): **same file, same lines** — claim one lane, not both.
2. B-T-D2-10 (PO draft-only) vs F4-F (All-sites PO create trap): **same file** (`create-purchase-order-core.ts`) — serialize or combine.
3. B-T-D1-01 + B-T-D2-01 vs F4-D (WAC residual): **same file** (`upsert-wac.ts`, `receive-po-line.ts`) — B's chain must land before or be merged with F4-D; never in parallel.

