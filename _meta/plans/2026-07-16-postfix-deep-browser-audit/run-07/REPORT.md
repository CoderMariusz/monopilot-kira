# RUN 07/20 — Suppliers, PO arithmetic and receiving handoff

## Verdict

**FAIL — 8 production defects: 4 P1 and 4 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

Marker: `NIGHT-R07`. The browser walk created one owned supplier, one three-line mixed-UoM PO, one disposable PO, one GRN and two LPs. It exercised supplier lifecycle, block/reactivate/deactivate, site stamping, draft line CRUD, repeated item lines, decimal price/tax calculations, status transitions, partial receipts, over-receipt, duplicate clicks, receipt cancellation and GRN→LP lineage.

The PO commercial totals are exact after a valid four-decimal price edit, kg receipt conservation is correct, blocked suppliers are excluded from new orders and the PO/GRN/LP links survive refresh. The run nevertheless found four workflow-breaking defects: create silently turns an over-precision price into zero, the receipt form cannot finish a six-decimal order, priced `g`/`pcs` lines cannot be received, and the advertised receipt reversal crashes on every eligible row.

All mutations were made through the visible production UI. Source and Vercel runtime logs were inspected read-only only after browser reproduction.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Supplier create and duplicate submit | PASS | Double-click created exactly one supplier. [created](evidence/R07-02-supplier-created-double-submit.yml) |
| Supplier edit and refresh | PASS | Name, lead time and notes persisted after direct revisit. [detail](evidence/R07-05-supplier-edit-persisted.yml) |
| Negative supplier lead time | PASS | Native `min=0` blocked the value with a concrete browser validation message. [evidence](evidence/R07-04-supplier-negative-lead-native-block.yml) |
| Supplier block/reactivate/deactivate | PASS | Active→Blocked→Active→Inactive persisted. Blocked supplier disappeared from the PO selector. [blocked](evidence/R07-35-supplier-blocked.yml), [excluded](evidence/R07-36-blocked-supplier-excluded.yml), [cleanup](evidence/R07-40-cleanup-supplier-inactive.yml) |
| Required site and warehouse stamping | PASS | Creation required a selected site; Main Factory and WH1 persisted on the PO/GRN. |
| PO create duplicate click | PASS | Exactly one `NIGHT-R07-PO-1300` was created. [list](evidence/R07-08-po-created-double-submit.yml) |
| Create with price having more than four decimals | **FAIL / P1** | Entered `0.005432`; persisted price became `0.0000`, silently removing the entire line from net/tax. [before](evidence/R07-07-po-three-lines-before-create.yml), [persisted](evidence/R07-12-line2-edit-shows-zero.yml) |
| Header edit and civil date | PASS | `2026-07-25` edited to `2026-07-26` and displayed exactly as Jul 26 after refresh. [evidence](evidence/R07-13-line2-edited-price-rounding.yml) |
| Line edit/delete/add CRUD | PASS | Repeated RM line edited, packaging line deleted, re-added and totals recomputed. [delete](evidence/R07-14-line-delete-persisted.yml), [re-add](evidence/R07-16-line-readded-crud.yml) |
| Four-decimal price/tax arithmetic | PASS calculation / **FAIL display** | Exact net/tax/gross match manual arithmetic, but unit-price cells round to two decimals. [detail](evidence/R07-16-line-readded-crud.yml), [calculation](evidence/R07-45-exact-calculations.txt) |
| Draft→Sent→Confirmed | PASS | Double-clicks produced one confirmation and one transition each; edit actions disappeared after submit. [Sent](evidence/R07-17-po-sent-double-submit.yml), [Confirmed](evidence/R07-18-po-confirmed.yml) |
| Partial kg receipt and duplicate click | PASS once | `2.346 kg` created one GRN and one LP; conservation was exact. [receipt](evidence/R07-22-receipt-three-decimals.yml), [GRN](evidence/R07-23-grn-lineage-detail.yml) |
| Six-decimal receipt precision | **FAIL / P1** | Form rounds the remaining amount to three decimals, proposes an over-receipt, and rejects the exact four-decimal remainder. [rounded default](evidence/R07-29-unreceivable-final-fraction-modal.yml), [exact rejected](evidence/R07-30-exact-final-fraction-rejected.yml) |
| Over-receipt boundary | PASS gate / **FAIL UX** | Rounded-up `10.000` was blocked, but only with “Something went wrong”. [evidence](evidence/R07-26-rounded-overreceipt-result.yml) |
| Receive priced `g` line | **FAIL / P1** | Both double-click and single submit left received qty at zero; WAC logged `unresolved_uom: g`. [double](evidence/R07-41-valid-receipt-double-click.yml), [single](evidence/R07-42-single-receipt-after-doubleclick-failure.yml) |
| Receive priced `pcs` packaging line | **FAIL / P1** | `7.5 pcs` was rejected before any GRN/LP write; WAC logged `unresolved_uom: pcs`. [evidence](evidence/R07-43-packaging-pcs-receipt-result.yml) |
| GRN→LP lineage | PASS core / **FAIL supplier-batch display** | Quantity, internal batch, expiry, warehouse and source persisted; GRN falsely repeats batch as supplier batch while LP shows supplier batch absent. [GRN](evidence/R07-23-grn-lineage-detail.yml), [LP](evidence/R07-24-lp-created-lineage.yml) |
| Receipt cancellation/reversal | **FAIL / P1** | Eligible Draft GRN row offered cancellation, but submission rolled back with a Postgres outer-join lock error. [UI](evidence/R07-33-receipt-cancelled-reversal.yml), [runtime](evidence/R07-44-vercel-runtime-root-causes.txt) |
| Cancel PO with receipts | PASS | Server preserved status and returned “Cannot cancel — the purchase order has receipts.” [evidence](evidence/R07-39-received-po-cancel-blocked.yml) |
| Disposable draft cancellation | PASS | Draft PO was cancelled and retained as audit history rather than hard-deleted. [evidence](evidence/R07-38-disposable-po-cancelled.yml) |

## Findings

### PF-R07-01 — P1 — PO creation silently replaces an over-precision price with zero

The create form accepted and displayed unit price `0.005432` on the repeated Butter line. After creation, the detail showed `0.00 GBP`; opening Edit proved the persisted value was exactly `0.0000`. The ordered `789.123 g` therefore contributed neither net nor tax.

This is silent commercial data corruption rather than ordinary rounding. The same line edited later to a valid four-decimal `0.0199` calculated correctly, proving that the arithmetic engine and edit action preserve supported precision.

Source correlation is exact:

- [`create-po-modal.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/create-po-modal.tsx) defines `PRICE_PATTERN` as at most four decimals.
- Price validity is omitted from `validLines`, so the line remains eligible.
- Mapping the payload uses `PRICE_PATTERN.test(...) ? enteredPrice : '0'`, silently substituting zero instead of rendering validation.

The safe behavior is to reject the line before any write with a field-level precision message, or explicitly round according to an agreed monetary rule and show the normalized value before confirmation. Evidence: [entered value](evidence/R07-07-po-three-lines-before-create.yml), [persisted zero](evidence/R07-12-line2-edit-shows-zero.yml).

### PF-R07-02 — P1 — Six-decimal ordered quantities cannot always be fully received

The PO line stored `12.345600 kg`. The desktop receipt form supports only three decimals. It first proposed `12.346`, which exceeds the order. After valid receipts of `2.346` and `9.999`, the conserved state was:

- ordered `12.345600`
- received `12.345000`
- outstanding `0.000600`

The form then proposed `0.001`, again exceeding the order. Entering the exact `0.0006` returned the false message “Enter a quantity greater than zero”. The line therefore cannot reach Fully received through this UI.

[`receive-po-line-modal.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/receive-po-line-modal.tsx) confirms both sides of the mismatch: `QTY_PATTERN` permits only 1–3 decimals, while `remaining()` rounds a six-decimal database amount with `toFixed(3)`. The PO create/edit contracts allow six decimals.

The receipt precision contract must be at least as expressive as the ordered-quantity contract, and remaining quantity should be calculated with exact decimal arithmetic rather than `Number` rounding. Evidence: [initial rounded-up default](evidence/R07-19-receive-line1-modal.yml), [final default](evidence/R07-29-unreceivable-final-fraction-modal.yml), [exact remainder rejected](evidence/R07-30-exact-final-fraction-rejected.yml), [math](evidence/R07-45-exact-calculations.txt).

### PF-R07-03 — P1 — Priced `g` and `pcs` PO lines can be ordered but cannot be received

The UI allowed a priced Butter line in grams and a priced packaging line in pieces. Both persisted and affected PO totals. Receipt of `100.125 g` failed on repeated and single submissions; receipt of `7.5 pcs` also failed. No GRN, LP or received quantity was written.

Production logs identified `wac_unresolved_uom` for both requests. [`upsert-wac.ts`](../../../../apps/web/lib/finance/upsert-wac.ts) resolves `kg`, kg-base identity, `each` with `net_qty_per_each`, or `box` with both pack factors. It has no `g→kg` conversion. `pcs` is normalized to `each`, but packaging without a mass-per-each factor is also unresolved. [`book-receipt-wac.ts`](../../../../apps/web/lib/finance/book-receipt-wac.ts) deliberately blocks any priced receipt whose UoM cannot enter the kg WAC pool.

The product therefore permits commercial lines that its valuation/receiving subsystem cannot execute. At minimum `g` requires an exact `÷1000` conversion. Piece-valued packaging needs a coherent per-UoM WAC strategy or the incompatible UoM must be rejected before PO confirmation, not at physical receipt. Evidence: [g failure](evidence/R07-42-single-receipt-after-doubleclick-failure.yml), [pcs failure](evidence/R07-43-packaging-pcs-receipt-result.yml), [production warnings](evidence/R07-44-vercel-runtime-root-causes.txt).

### PF-R07-04 — P1 — Every eligible GRN receipt cancellation crashes before reversal

The Draft GRN displayed an enabled **Cancel receipt…** action on a pending, unused LP. Selecting `Wrong quantity` and entering a note returned “We could not cancel this receipt line. Try again.” The row remained live, received quantity was unchanged and the LP was not voided.

The production error is deterministic:

> `FOR UPDATE cannot be applied to the nullable side of an outer join`

[`receipt-corrections-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/receipt-corrections-actions.ts) loads the GRN line with `LEFT JOIN public.grns g ... FOR UPDATE OF gi, g`. PostgreSQL rejects locking nullable outer-join relation `g`, so the transaction never reaches LP return, GRN-item cancellation, WAC reversal or PO status roll-up.

Use an inner join for the required GRN parent, or lock only `gi` and lock `g` in a separate query. Add a live-Postgres test because the current query-mock tests cannot detect this planner rule. Evidence: [failed reversal](evidence/R07-33-receipt-cancelled-reversal.yml), [runtime error](evidence/R07-44-vercel-runtime-root-causes.txt).

### PF-R07-05 — P2 — The receipt UI masks `wac_unresolved_uom` as an unrelated generic failure

The server result union explicitly includes `wac_unresolved_uom`, and `receivePoLineDesktop` returns it for the g/pcs preflight. `ReceivePoLineLabels.errors` and all locale bundles omit that key. The component’s dynamic map therefore falls through to “Something went wrong receiving. Please retry.”

Retry cannot help; the line/UoM contract is incompatible. The UI should name the item and UoM and explain the required conversion/master-data field, or prevent confirmation earlier. Source: [`receive-po-line.types.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/receive-po-line.types.ts), [`receive-po-line-modal.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/receive-po-line-modal.tsx). Evidence: [g generic error](evidence/R07-42-single-receipt-after-doubleclick-failure.yml), [pcs generic error](evidence/R07-43-packaging-pcs-receipt-result.yml).

### PF-R07-06 — P2 — GRN detail fabricates a supplier batch by copying the internal batch

The receive form collected one `Batch / Lot` field. GRN detail then showed the same marker in both **Batch** and **Supplier batch**. Opening the linked LP proved `Supplier batch: —`; only the internal batch exists.

[`grn-detail.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/grns/[grnId]/_components/grn-detail.client.tsx) renders `it.batchNumber` in both columns. [`grn-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/grn-actions.ts) does not load a separate supplier-batch value.

This is traceability misrepresentation. The supplier-batch column must read the actual LP/GRN supplier-batch field or display `—`; the input flow should expose separate fields if both are required. Evidence: [GRN duplicate](evidence/R07-23-grn-lineage-detail.yml), [LP truth](evidence/R07-24-lp-created-lineage.yml).

### PF-R07-07 — P2 — PO detail hides the persisted unit-price precision

After editing the line to `0.0199`, the edit modal retained `0.0199` and totals used that exact value, but the detail table displayed only `0.02 GBP`. The first line similarly showed `3.46` for persisted `3.4567`.

[`po-detail-view.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_components/po-detail-view.tsx) formats unit price with `maximumFractionDigits: 2`, while line and order totals permit four. Operators cannot audit or distinguish sub-cent prices from the read-only document view.

Display the supported four-decimal unit price (with trailing-zero policy if desired), while keeping currency totals separately rounded. Evidence: [edit value](evidence/R07-13-line2-edited-price-rounding.yml), [detail table](evidence/R07-16-line-readded-crud.yml).

### PF-R07-08 — P2 — PO/GRN navigations emit a production React hydration error

Fresh direct navigations to the PO and GRN repeatedly emitted minified React error `#418` from the production bundle. Functional rendering recovered, but a hydration mismatch means server and client initially disagree and React discards/rebuilds part of the tree. This adds instability to already stateful document screens and pollutes production monitoring.

The browser console evidence is deterministic for this session, but the minified stack does not identify the component. Reproduce under a non-minified build or add hydration instrumentation around the shared app shell and PO/GRN dynamic content before assigning a narrower root cause. Evidence: [console log](evidence/R07-27-console-errors.txt).

## Exact calculation and conservation checks

| Calculation | Exact value | UI | Verdict |
|---|---:|---:|---|
| Line 1 net | `12.3456 × 3.4567 = 42.67503552` | included | PASS |
| Line 1 tax | `42.67503552 × 20% = 8.535007104` | included | PASS |
| Line 2 net | `789.125 × 0.0199 = 15.7035875` | included | PASS |
| Line 2 tax | `15.7035875 × 5.5% = 0.8636973125` | included | PASS |
| Line 3 net | `77.5 × 0.1234 = 9.5635` | included | PASS |
| PO net | `67.94212302` | `67.9421 GBP` | PASS presentation rounding |
| PO tax | `9.3987044165` | `9.3987 GBP` | PASS presentation rounding |
| PO gross | `77.3408274365` | `77.3408 GBP` | PASS presentation rounding |
| Line 1 conservation | `12.345000 received + 0.000600 outstanding = 12.345600 ordered` | exact | PASS |

Full derivation: [R07-45-exact-calculations.txt](evidence/R07-45-exact-calculations.txt).

## Prior-fix and guard verification

| Contract | Result |
|---|---|
| Site required and civil-date round trip | **PASS** — selected Main Factory persisted; Jul 26 stayed Jul 26. |
| Blocked/inactive supplier exclusion | **PASS** — blocked supplier was absent from the new-PO selector. |
| Supplier reactivation | **PASS** — Blocked→Active worked before final soft deactivation. |
| Draft PO header/line CRUD | **PASS** — edit, delete, re-add and refresh all persisted. |
| Duplicate PO create/status click | **PASS** — no duplicate document or transition. |
| Exact commercial totals | **PASS** for supported four-decimal inputs. |
| Over-receipt gate | **PASS server** — rounded-up quantity did not write stock. |
| GRN/LP lineage | **PASS core** — item, quantity, batch, expiry, site, warehouse and source linked correctly. |
| PO cancellation after receipt | **PASS** — explicitly blocked without mutating status. |
| Receipt reversal | **FAIL** — PostgreSQL lock query aborts before reversal. |

## Cleanup and retained artifacts

- Final owned supplier `NIGHT-R07-SUP-1300` is **Inactive**.
- Disposable `NIGHT-R07-PO-DEL-1300` is **Cancelled**.
- Primary `NIGHT-R07-PO-1300` remains **Partially received** as evidence. It retains the deliberate `0.000600 kg` precision remainder and unreceived g/pcs lines.
- GRN `GRN-20260717-0001` remains Draft with two kg receipt rows. Their LPs remain Received/Pending QA because the tested cancellation action failed and rolled back.
- The pre-existing `WEB` supplier and item masters were referenced read-only.
- Top-bar site filter was reset to All sites. [verification](evidence/R07-46-cleanup-site-reset.json)

## Limitations

- The g and pcs lines could not progress to GRN/LP verification because WAC preflight blocked them; this is the reported functional defect, not an untested branch.
- Receipt cleanup could not be completed because the production reversal action crashes before any mutation.
- The React hydration finding is limited to the observable production console error; no speculative component root cause is claimed.
- No production data was queried or modified outside application UI actions. Vercel logs and repository source were read-only.

## Finding count

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 4 |
| P2 | 4 |
| **Total** | **8** |
