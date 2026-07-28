# RUN 10/20 — Transfer orders and cross-site conservation

## Verdict

**FAIL — 3 confirmed production defects: 2 P1 and 1 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

Marker: `NIGHT-R10-20260717T174328Z`.

The browser walk created owned source stock and a cross-warehouse transfer with two duplicate-product lines. It exercised self-transfer validation, double-submit, draft edit, mixed UoM, ship, receive, receipt reversal with e-sign, repeat-reversal protection, cancellation, hard refresh, direct links and site switching.

Matter remained physically conserved, but document truth did not. The most serious reproduction closes a 10 kg transfer as **Received** after only 6.125 kg exists at the destination; the missing 3.875 kg remains available at the source and line 2 has no destination LP.

All mutations were made through the visible production UI and only against owned records. Product source was inspected read-only after browser reproduction.

## Owned production data

| Object | State at closeout |
|---|---|
| PO | `NIGHT-R10-PO-174328`, Received, `20.000000 kg` ING-FLOUR |
| GRN | `GRN-20260717-0004`, Completed |
| Source LP | `LP-1784310651421-D2PF`, Available + Released, `13.875000 kg`, WH1 / RECV |
| Transfer order | `NIGHT-R10-TO-174328`, terminal **Received**, WH1 → BAKERY, scheduled Jul 20, 2026 |
| TO line 1 | `6.125000 kg`, received into `LP-1784311327233-1IIY` |
| TO line 2 | `3.875000 kg`, status implied received by the header but no destination LP/link |
| Accepted destination LP | `LP-1784311327233-1IIY`, Available + Released, `6.125000 kg`, BAKERY |
| Reversed destination LP | `LP-1784311327088-47QJ`, `0.000000 kg`, status `returned`, BAKERY |

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Main Factory context and cross-site warehouses | PASS | WH1 → BAKERY was available and persisted. [context](evidence/R10-02-multisite-home.yml) |
| Same-warehouse/self-transfer | PASS gate | PRODUCTION → PRODUCTION was rejected with `To warehouse must differ from From warehouse.` [guard](evidence/R10-04-self-transfer-guard.yml) |
| Owned source stock | PASS | PO/GRN created a `20.000000 kg` released source LP. [GRN](evidence/R10-06-source-grn-lp.yml), [LP](evidence/R10-07-source-lp-detail.yml) |
| Duplicate-product lines | PASS create | Two ING-FLOUR lines persisted independently. |
| Create double-submit | PASS | Double click created one TO, not two. [list](evidence/R10-08-to-created-doubleclick.yml) |
| Civil-date create/edit/refresh | PASS | Jul 19 was edited to Jul 20 before ship and survived direct refresh. [draft](evidence/R10-09-to-detail-draft.yml), [final refresh](evidence/R10-20-direct-refresh-final.yml) |
| Mixed-UoM ship: `6.125 kg + 3875 g` | **FAIL / P1** | With 20 kg released stock, Ship returned `Insufficient stock to fulfill this transfer`. [failure](evidence/R10-10-to-ship-result.yml) |
| Equivalent kg control | PASS | Editing only line 2 to `3.875 kg` made the same physical 10 kg order ship immediately. [control](evidence/R10-11-to-ship-kg-control.yml) |
| Edit before release | PASS | Header date/notes and line UoM/quantity persisted. |
| Edit after release | PASS gate | In-transit state removed header and line edit/delete actions. |
| Ship stock movement | PASS | Source changed exactly `20.000000 → 10.000000 kg`. [source](evidence/R10-12-source-lp-after-ship.yml) |
| Partial ship | **BLOCKED / P2** | Ship is a whole-order confirmation; no line or quantity selection exists. |
| Partial receive / over-receipt | **BLOCKED / P2** | Receive is a whole-order confirmation; no received-quantity or over-receipt field exists. |
| Whole receive | PASS | Two destination LPs initially totalled `6.125 + 3.875 = 10.000 kg`. [received](evidence/R10-13-to-received.yml) |
| Full-line receipt reversal + e-sign | PASS | Reversing line 2 restored `3.875 kg` to source, zeroed its destination LP and emitted `planning.transfer_order.receive_reversed`. [TO](evidence/R10-14-line2-reversal.yml), [returned LP](evidence/R10-18-reversed-destination-detail.yml) |
| Repeat-reversal guard | PASS | Reversed line lost the Reverse action; only the still-received line retained it. |
| Cancel outstanding remainder | **FAIL / P2** | Visible Cancel always rejected a Partially received TO because any destination LP exists. [blocked cancel](evidence/R10-19-cancel-partial-blocked.yml) |
| Receive remainder after reversal | **FAIL / P1** | Header became terminal Received, but line 2 received no destination LP and no stock moved from source. [TO after hard refresh](evidence/R10-22-receive-after-reversal.yml) |
| Final direct-link/site refresh | PASS persistence / **FAIL truth** | Main Factory and direct link retained the state, including the inconsistent terminal status. [site/deep link](evidence/R10-21-site-filter-deeplink.yml) |

## Findings

### PF-R10-01 — P1 — A physically sufficient mixed-UoM transfer cannot ship

The UI accepted and saved two lines for the same product:

- line 1: `6.125000 kg`
- line 2: `3875.000000 g = 3.875000 kg`
- physical total: `10.000000 kg`
- source: `20.000000 kg`, Available + Released

Ship nevertheless returned `Insufficient stock to fulfill this transfer`. Editing only line 2 to the equivalent `3.875000 kg` made Ship succeed immediately and reduced source stock by exactly 10 kg.

Read-only source correlation confirms that shipping requires `license_plates.uom = transfer_order_lines.uom` and plans each line without a conversion to the item's base UoM. The create/edit UI meanwhile offers organization units including `g`, so it permits an order the allocator cannot fulfill from equivalent kg stock.

Normalize convertible quantities to the item base UoM before allocation and conservation, or constrain each line to UoMs the item can actually source. Add a production-shaped test with duplicate lines `6.125 kg + 3875 g` against one `20 kg` LP. Evidence: [mixed-UoM failure](evidence/R10-10-to-ship-result.yml), [equivalent kg control](evidence/R10-11-to-ship-kg-control.yml), [source after successful control](evidence/R10-12-source-lp-after-ship.yml).

### PF-R10-02 — P1 — Re-receiving after one receipt reversal closes the TO without materializing the missing line

After the initial whole receipt, line 2 had destination LP `LP-1784311327088-47QJ` with `3.875000 kg`. Reversal correctly:

- restored source from `10.000000` to `13.875000 kg`;
- reduced that destination LP to `0.000000 kg`, status `returned`;
- removed the destination LP/link from line 2;
- changed the TO to Partially received.

The visible **Receive** action was then used once. It returned success and changed the header to terminal **Received**. After a hard direct navigation:

- line 1 still had destination LP `LP-1784311327233-1IIY`, `6.125000 kg`;
- line 2 still had no destination LP/link;
- source still had `13.875000 kg`;
- accepted destination stock remained only `6.125000 kg`;
- no further status action was available.

The document therefore asserts that all 10 kg was received while 3.875 kg remains at the source. This is a status/inventory-lineage integrity failure and can misstate destination availability, inter-site receipts and downstream planning.

Read-only source correlation explains the path: reversal removes the line allocation used as receive input, while the Partially received → Received branch can still update the header after a no-op materialization. Require every outstanding line to have a valid in-transit allocation and destination materialization before setting Received. The transaction must throw and roll back if `sum(received line qty) != sum(TO line qty)`. Add a ship → receive → reverse one line → receive remainder integration test that asserts destination LPs and source/destination quantities, not only header status. Evidence: [reversal](evidence/R10-14-line2-reversal.yml), [terminal false receipt](evidence/R10-22-receive-after-reversal.yml), [source unchanged](evidence/R10-23-source-after-rereceive.yml), [destination unchanged](evidence/R10-24-accepted-dest-after-rereceive.yml).

### PF-R10-03 — P2 — Partially received TO exposes a Cancel action that cannot cancel the outstanding remainder

After reversing only line 2, the TO was Partially received: line 1 was validly received and line 2 was outstanding. The UI showed **Cancel**, but confirmation always returned:

`This transfer has already-received stock. Receive the remainder or reverse the received license plates before cancelling.`

This is not a boundary case: a Partially received TO necessarily has at least one received destination LP, so the visible transition is predictably rejected. Operators cannot cancel only the outstanding 3.875 kg; they must either receive unwanted stock or reverse a valid receipt.

The same screen also lacks actual partial-ship, partial-receive and over-receipt quantity controls. Support line/quantity-level fulfillment and cancellation of only the remaining allocation, or remove the impossible Cancel transition and provide a dedicated “Cancel remainder” action with an audit reason. Evidence: [Partially received state](evidence/R10-14-line2-reversal.yml), [server rejection](evidence/R10-19-cancel-partial-blocked.yml).

## Exact conservation and document parity

| Checkpoint | Source WH1 | In transit | Destination active | Returned destination | Physical total | Document state |
|---|---:|---:|---:|---:|---:|---|
| Before ship | 20.000 | 0.000 | 0.000 | 0.000 | 20.000 kg | Draft |
| After 10 kg ship | 10.000 | 10.000 | 0.000 | 0.000 | 20.000 kg | In transit |
| After whole receive | 10.000 | 0.000 | 10.000 | 0.000 | 20.000 kg | Received |
| After reversing line 2 | 13.875 | 0.000 | 6.125 | 0.000 | 20.000 kg | Partially received |
| After “Receive remainder” | 13.875 | 0.000 | 6.125 | 0.000 | 20.000 kg | **Received — incorrect** |

Physical matter is conserved at six-decimal precision:

`13.875000 + 6.125000 + 0.000000 = 20.000000 kg`.

Document parity fails by:

`10.000000 ordered/claimed received − 6.125000 destination stock = 3.875000 kg`.

## Prior-fix and guard verification

| Contract | Result |
|---|---|
| Self-transfer server guard | PASS |
| Duplicate-line shadow allocation in one UoM | PASS |
| Exact decimal stock decrement | PASS |
| Civil-date UTC round trip | PASS |
| Edit lock after release | PASS |
| Receipt reversal e-sign and audit event | PASS |
| Reversal returns stock to source and zeroes destination LP | PASS |
| Repeat reversal UI guard | PASS |
| Cross-site LP parent lineage | PASS for line 1 and returned line 2 |
| Re-receive after reversal | **FAIL** |

## Cleanup and retained artifacts

- Site selector was restored to **Main Factory** before final lifecycle checks.
- Owned PO and GRN remain completed as the source lineage.
- Source LP remains Available + Released with `13.875000 kg`.
- Accepted destination LP remains Available + Released with `6.125000 kg`.
- Reversed destination LP remains `returned` with `0.000000 kg`.
- The owned TO remains terminal **Received** because the faulty re-receive path offers no further status action.
- No foreign record was edited, cancelled or deleted.

## Limitations

- Partial ship, partial receive and over-receipt could not be entered because the production UI exposes only whole-order confirmation.
- There is no visible transit-LP list; in-transit quantity was inferred from the TO line allocation lifecycle and exact source/destination deltas.
- The required in-app Browser session was unavailable, so the prescribed fallback Playwright browser was used.
- One known React hydration console error reproduced on direct TO navigation; it is not counted as a new RUN10 finding.
- No direct database mutation, API bypass, product-code edit, build, typecheck or dependency installation was performed.

## Finding count

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 2 |
| P2 | 1 |
| **Total** | **3** |
