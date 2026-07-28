# Run 17/20 — Scanner/PWA mobile execution and failure recovery

## Deployment, marker, verdict

- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Run marker: `NIGHT-R17-20260718T0823Z`
- Verdict: **FAIL (2 fresh P2 findings)**. Scanner login, PIN enrollment, manual-code fallback, PO receiving, quantity freshness, session persistence/logout and the fixed Move-LP same-location guard worked. The scanner Putaway path still accepts and repeats a same-location no-op, while revisiting an already-received line collapses to a generic 404-derived error instead of an idempotent completion state.

The in-app Browser backend was unavailable, so the authorized Playwright MCP fallback was used. Per dispatch, no viewport resize was attempted. The default browser window was 1185–1200 px wide; scanner pages rendered a centered 390 px mobile shell. Touch/layout observations below are therefore limited to that shell, not a true device viewport.

## Scenarios

| ID | Scenario | Status | Result / evidence |
|---|---|---|---|
| S01 | Desktop invalid credential error accessibility | PASS | Error rendered as an active `alert`; [S01](evidence/S01-login-invalid-alert.png). |
| S02 | Scanner login shell, online indicator, touch targets | PASS | 390 px shell; ONLINE status; Back 44×44 px; PIN keys 109×58 px; [S02](evidence/S02-scanner-login-online-touch.png). |
| S03 | Invalid scanner PIN error accessibility | PASS | Active alert “Invalid email or PIN”; login textbox marked invalid; evidence login redacted; [S03](evidence/S03-scanner-pin-error-a11y.md). |
| S04 | First-time PIN enrollment and scanner sign-in | PASS | Two-step PIN setup completed via UI, then sign-in reached site/shift selection. PIN is intentionally absent from evidence/report. |
| S05 | Site, production line and shift selection | PASS | Main Factory → Assembly Line → Morning; Start shift reached scanner home. |
| S06 | Unknown LP manual entry and repeated scan | PASS | Marker-based unknown code returned an accessible “License plate not found” alert twice without mutation; [S05](evidence/S05-lp-unknown-manual-alert.png). |
| S07 | Camera unavailable → manual-code fallback | PASS | Camera dialog explained device limitation and offered Enter manually; [S06](evidence/S06-camera-unavailable-manual-fallback.png). |
| S08 | Back navigation and hard refresh/session persistence | PASS | Back returned to scanner home; hard navigation to LP route retained scanner session and selected shift. |
| S09 | Owned PO setup and high-precision quantity/cost | PASS | Created and confirmed owned PO with 3.125 kg at 12.3456 GBP/kg; desktop displayed exact 38.58 GBP total; [S07](evidence/S07-owned-po-detail-calculation.png). |
| S10 | Scanner Receive PO happy path | PASS | Received 3.125 kg to RECV and created `LP-1784363420662-6L1D`; [S08](evidence/S08-scanner-receive-success.png). |
| S11 | Revisit/repeat an already-received scanner line | FAIL | No duplicate receipt, but hard revisit produced duplicated generic “Could not load data” and disabled Receive instead of an already-completed state; PF-R17-01; [S09](evidence/S09-receive-repeat-generic-404.png). |
| S12 | Scanner result → desktop detail freshness | PASS | PO immediately showed Received, 3.125000 kg received, 0 / 1 outstanding semantics resolved, and unchanged 38.58 GBP; [S10](evidence/S10-desktop-po-fresh-received.png). |
| S13 | Move LP to its current location | PASS | Move flow selected RECV then correctly disabled Move with “LP is already in this location.” This freshly confirms the prior C101 Move fix. |
| S14 | Putaway LP to its current location and repeat | FAIL | Putaway suggested current RECV, accepted it, showed RECV→RECV success, and accepted the same flow again with a new operation ID; PF-R17-02; [S12 screenshot](evidence/S12-putaway-same-location-accepted.png), [POST 200](evidence/S12-putaway-network.txt). |
| S15 | Pick / consume / produce on an owned work order | BLOCKED | Main Factory/Assembly Line had no active WO even with All selected; foreign WOs were not mutated; [S11](evidence/S11-wo-actions-blocked-empty.png). |
| S16 | Held and expired LP consume gates / e-sign override | BLOCKED | Owned LP was QA Pending, but there was no active owned WO/consume surface through which to exercise the server gate. No foreign held/expired LP was mutated. |
| S17 | Wrong-site LP operation | BLOCKED | Alternative sites exposed no usable owned line/shift/data prerequisite. The owned LP remained Main Factory/WH1-scoped; no site bypass was attempted. |
| S18 | Offline indicator and recovery | BLOCKED | Browser environment offline-control call hung and was aborted after 347.6 s; it was not retried. A subsequent live snapshot remained healthy and showed ONLINE, so no app conclusion is drawn. |
| S19 | Logout/session end | PASS | Scanner logout returned to scanner login and ended the shift session; [S13](evidence/S13-scanner-logout-session-end.png). |
| S20 | Receive zero/negative/over-remaining boundary | NOT RUN | Timebox reached after the successful owned receipt; no second PO was created. |
| S21 | Print-label path | NOT RUN | Avoided a nonessential label side effect after receipt. |
| S22 | Pack/ship scanner path | NOT RUN | No owned SO/shipment prerequisite in this run. |

## Findings

### PF-R17-01 — P2 — already-received line revisit becomes a generic load failure

- URL: `https://monopilot-kira.vercel.app/en/scanner/receive-po/e815e11d-79ec-4f33-b590-5d079a772d88/a8b756ea-b517-488c-81e8-632961d7a0c3`
- Reproduction:
  1. Create and Confirm owned PO `NIGHT-R17-20260718T0823Z-PO`.
  2. Receive its only line in Scanner; observe success and LP creation.
  3. Hard-revisit the same scanner line URL.
- Expected: stable idempotent completion view such as “Already received”, with the created LP/received quantity and a safe navigation action.
- Actual: GET `/api/warehouse/scanner/pos/e815e11d-79ec-4f33-b590-5d079a772d88` returned 404; UI displayed the generic message “Could not load data.” twice and disabled Receive.
- Impact: after refresh, back-forward recovery, copied deep link, or uncertain connectivity, an operator cannot distinguish completed receipt from system/data failure. This encourages manual retry/escalation and undermines recovery confidence, though this reproduction did not duplicate quantity.
- Persistence: reproduced on a hard revisit after the committed receipt; desktop detail simultaneously showed the receipt persisted.
- Evidence: [S08 success](evidence/S08-scanner-receive-success.png), [S09 revisit](evidence/S09-receive-repeat-generic-404.png), [S10 desktop freshness](evidence/S10-desktop-po-fresh-received.png).
- Likely source:
  - `apps/web/lib/warehouse/scanner/receive-po.ts:226-234` filters detail reads to `OPEN_PO_STATUSES`, so a fully received PO returns `null`.
  - `apps/web/app/api/warehouse/scanner/pos/[id]/route.ts:32-36` maps that completed PO to `po_not_found` 404.
  - `apps/web/app/[locale]/(scanner)/scanner/receive-po/[poId]/[lineId]/_components/receive-po-item-screen.tsx:75-90` collapses all non-auth failures to the generic error state.
- Minimal fix: keep completed PO/line readable for the scanner detail route (read-only completed shape), or return a distinct `already_received` response and render the committed receipt/LP state.

### PF-R17-02 — P2 — scanner Putaway accepts and repeats RECV→RECV no-op moves

- URL: `https://monopilot-kira.vercel.app/en/scanner/putaway`
- Reproduction:
  1. Scan owned `LP-1784363420662-6L1D`, currently at RECV.
  2. Choose location.
  3. Select the only suggestion, RECV / Receiving Bay (“Same product”).
  4. Confirm putaway.
  5. Observe success `Current location RECV → Moved to RECV`.
  6. Start Next LP and repeat the identical flow; another POST succeeds with a fresh operation ID.
- Expected: current location excluded from suggestions and a server-side `fromLocationId !== toLocationId` guard; repeated no-op should not create movement/audit facts.
- Actual: current RECV is suggested, confirmation is enabled, POST returns 200, success claims a move from RECV to RECV, and a second independently identified operation also succeeds.
- Impact: false stock-movement and transition history can be created repeatedly without physical movement, polluting traceability/audit data and operator KPIs. The first same-location putaway may also promote `received→available`, obscuring that no physical putaway occurred.
- Persistence: reproduced twice in the same authenticated session with separate operation IDs; network evidence captured POST 200.
- Evidence: [S12 success](evidence/S12-putaway-same-location-accepted.png), [S12 network](evidence/S12-putaway-network.txt).
- Likely source:
  - `apps/web/lib/warehouse/scanner/movement.ts:212-305` loads only `warehouse_id`/`product_id` and never excludes the LP's current `location_id` from suggestions.
  - `apps/web/lib/warehouse/scanner/movement.ts:443-462` inserts a stock move and updates the LP without an equality guard.
  - `apps/web/app/[locale]/(scanner)/scanner/putaway/_components/putaway-screen.tsx:213-239` posts any chosen suggestion and treats 200 as done.
- Minimal fix: select the LP's current location in `suggestPutawayLocations`, exclude it in all suggestion CTEs, and add an authoritative same-location rejection before `insertStockMove`; cover scanner Putaway separately from Move.
- Dedupe classification: this is a **fresh current-production incomplete-fix
  regression of the C101 invariant on a different write path**, not a copied
  browser observation. C101's desktop/Move-LP path is freshly confirmed fixed in
  S13, while Scanner Putaway uses the separate scanner movement core and still
  accepts the same-location write. Count it once in this follow-up run; the final
  canonical roll-up should group it under `C101 incomplete cross-surface fix`
  rather than present it as a wholly unrelated invariant.

## Manual calculations and lineage

### PO line precision

- Input lineage: owned PO `NIGHT-R17-20260718T0823Z-PO`, item `flower2`, quantity `3.125 kg`, unit price `12.3456 GBP/kg`, tax `0%`.
- Manual equation: `3.125 × 12.3456 = 38.580000 GBP`.
- Display: unit price `12.35 GBP` (2-decimal presentation), line/net/gross total `38.58 GBP`.
- Rounding unit: GBP 0.01.
- Delta: `38.58 - 38.58 = 0.00 GBP`.

### Cross-module lineage

| Handoff | Identifier | Qty / status / site-location |
|---|---|---|
| Planning PO | `NIGHT-R17-20260718T0823Z-PO` (`e815e11d-79ec-4f33-b590-5d079a772d88`) | Confirmed before scan; 3.125 kg; Main Factory → WH1 |
| Scanner PO line | `a8b756ea-b517-488c-81e8-632961d7a0c3` | Remaining 3.125 kg before receipt |
| Scanner receipt | batch `NIGHT-R17-20260718T0823Z-BATCH` | 3.125 kg; expiry 2026-07-25; RECV |
| Created LP | `LP-1784363420662-6L1D` | 3.125000 kg; WH1/RECV; QA Pending |
| Desktop PO after receipt | same PO | Received; received 3.125000 kg; 38.58 GBP unchanged |

Mass reconciliation: `3.125 ordered - 3.125 received = 0.000 kg remaining`. Scanner-created LP quantity `3.125000 kg` exactly matches desktop received quantity; delta `0.000000 kg`.

## Prior fixes opportunistically confirmed

- C101 Move-LP same-location guard: **confirmed fixed on current prod**. Move LP selected current RECV and disabled Move with “LP is already in this location.” PF-R17-02 is the distinct Putaway gap.
- Unknown/manual scanner lookup: accessible not-found alert, no mutation, repeat remained stable.
- Camera unavailable recovery: explicit manual-entry path was present.
- Desktop detail freshness after scanner receipt: immediate and exact.

## Cleanup and remaining artifacts

- Scanner shift/session: logged out successfully.
- Owned PO `NIGHT-R17-20260718T0823Z-PO`: left `Received`; deletion/cancellation is unavailable and would destroy receipt lineage.
- Owned LP `LP-1784363420662-6L1D`: left at WH1/RECV with batch marker and QA Pending lineage. It was not deleted because it backs the immutable receipt.
- Two owned same-location Putaway attempts were intentionally left in audit history as evidence of PF-R17-02.
- PIN enrollment remains on the authorized test account because no safe “remove scanner PIN” UI was exposed. No PIN, password, cookie, token, or credential is present in report/evidence.

## Limitations

- No viewport resize was used. Scanner shell layout/touch measurements came from the app's 390 px centered shell inside the default 1185–1200 px browser window, not a true mobile browser viewport.
- In-app Browser was unavailable; Playwright MCP fallback was used.
- Offline control was not reliable: one environment-control call hung and was aborted; no offline app verdict is claimed.
- No active owned WO existed, so consume/output/pick, QA hold/expiry consume gates and their e-sign overrides were blocked rather than bypassed.
- No alternative site had a safe owned line/shift/data prerequisite for a wrong-site write test.
- Source inspection was read-only and performed only after browser reproduction.

## Counts

- Scenario rows: **22**
- Attempted: **19**
- PASS: **13**
- FAIL: **2**
- BLOCKED: **4**
- NOT RUN: **3**
- Findings: **P0 0 · P1 0 · P2 2 · P3 0**
