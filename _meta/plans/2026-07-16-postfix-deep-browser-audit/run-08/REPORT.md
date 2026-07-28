# RUN 08/20 — Warehouse LP lifecycle and stock conservation

## Verdict

**FAIL — 9 new production defects: 3 P1 and 6 P2.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

Marker: `NIGHT-R08-1400`. The browser walk created one exact-decimal PO, received it into a GRN/LP, released QA, split and moved stock, exercised an LP quality hold with signed release, merged the LPs, created and closed a blind-count session, validated adjustment guards, checked label/reprint behavior, FEFO expiry tiers and site filtering.

Core quantity arithmetic, GRN→LP lineage, hold e-sign, state gates and merge conservation work. The run nevertheless found three workflow-breaking problems: a location can be deactivated while it contains live stock, split has no destination control despite the warehouse contract requiring one, and blind-count rows omit the LP identity even when several indistinguishable LPs share the same location/item.

All mutations were made through the visible production UI. Repository source was inspected read-only only after browser reproduction.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Exact-decimal PO create and persistence | PASS | `12.345 kg × 4.0000 GBP`; exact net/tax/gross persisted. [draft](evidence/R08-03-po-draft-detail.yml) |
| Draft→Sent→Confirmed→Closed receipt lifecycle | PASS | One complete receipt closed the PO; the receive screen then correctly blocked another receipt. [receive](evidence/R08-05-receive-form-complete.yml), [result](evidence/R08-06-receipt-result.yml) |
| GRN detail and LP creation | PASS core / **FAIL list count** | Detail contains one receipt line and linked LP, while the fresh GRN list reports Items `0`. [detail](evidence/R08-07-grn-completed-detail.yml), [list](evidence/R08-23-grn-list-items-zero.yml) |
| QA release from receiving | PASS | Pending LP became Available + Released and remained so after direct revisit. [LP](evidence/R08-08-lp-released-detail.yml) |
| Full-quantity split guard | PASS | `12.345` against `12.345` kept Split disabled, preventing a zero-quantity source. [modal](evidence/R08-09-split-missing-destination.yml) |
| Valid split and conservation | PASS math / **FAIL destination control** | `12.345 = 10.000 + 2.345`; modal had only quantity and reason and silently inherited `RECV`. [modal](evidence/R08-09-split-missing-destination.yml), [genealogy](evidence/R08-10-split-genealogy.yml) |
| Move and persistence | PASS | Child moved `RECV → NIGHT-R08-1400`, retained `2.345 kg`, Available + Released, then moved back to `RECV`. [child](evidence/R08-11-child-lp-detail.yml) |
| Deactivate occupied location | **FAIL / P1** | Save succeeded with one live LP; direct LP detail still referenced the inactive location while the location panel changed its count to zero. [location](evidence/R08-13-location-deactivated-with-inventory.yml), [LP truth](evidence/R08-14-lp-remains-in-inactive-location.yml) |
| LP block / quality hold | PASS | Block required a reason, created `HLD-00001025`, set LP to On hold and disabled Split/Merge/Reserve. [gates](evidence/R08-15-blocked-action-gates.yml) |
| Quality hold release and e-sign | PASS | Disposition, notes and password/PIN were required; signed release persisted an immutable event and released exactly `2.345 kg`. [release](evidence/R08-16-hold-esign-released.yml) |
| Merge and terminal secondary | PASS | `2.345 + 10.000 = 12.345`; primary is Available/Released and secondary is Merged at `0.000`. [primary](evidence/R08-17-merge-conservation-primary.yml), [secondary](evidence/R08-18-merge-secondary-terminal.yml) |
| Label print | **FAIL / P2** | Print executes immediately with one copy and Direct PDF; there is no copies field or printer selector. [history](evidence/R08-12-print-and-reprint-history.yml) |
| Reprint | **FAIL / P2** | Reprint created a new job that remained Queued after 13 minutes while the source Direct PDF job was Sent. [persistent state](evidence/R08-19-reprint-stuck-queued-13min.yml) |
| Blind stock count | **FAIL / P1** | Three rows were all presented as `RECV / Butter / RM-BUTTER` with the same accessible input name and no LP number. [evidence](evidence/R08-20-blind-count-indistinguishable-lps.yml) |
| Direct adjustment validation | PASS guard / mutation not run | Empty submit returned the concrete first error “Select a location”; the page exposes e-sign and states that decreases require a second-person countersign. |
| FEFO/expiry visibility | **FAIL / P2** | Owned LP is present in the red tier, but civil-day count is one day short and batch/status are blank. [evidence](evidence/R08-21-expiry-off-by-one-and-missing-batch.yml) |
| Site filter | PASS list / **FAIL detail route** | Under `tester1`, list search returned zero rows, but direct navigation still exposed the Main Factory LP and all actions. [direct detail](evidence/R08-22-cross-site-direct-detail-visible.yml) |
| Catch-weight receipt | NOT RUN | The selected owned RM seed was not catch-weight enabled; no foreign catch-weight stock was mutated. |

## Findings

### PF-R08-01 — P1 — An occupied location can be deactivated and its LP count disappears

The owned location contained one live, Available + Released LP of `2.345 kg`. Editing the location, clearing **Is active**, and saving succeeded without a warning or blocking error. The selected-location panel immediately changed from one LP to zero. A direct LP revisit proved the stock had not moved: it still referenced the now-inactive location with unchanged quantity and status.

This violates the warehouse deactivation guard and creates a dangerous split view: location management says no stock, while the LP remains physically assigned there. Scanner destinations correctly reject inactive locations, so the orphaned inventory also cannot be handled normally until an operator discovers it by another route.

Source correlation is exact:

- [`location.ts`](../../../../apps/web/actions/infra/location.ts) persists `is_active` in `upsertLocation` without checking for non-terminal LPs.
- [`location-tree-client.tsx`](../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/location-tree-client.tsx) replaces the saved row with a new object that omits `lpCount`, making the UI optimistically display zero.
- [`page.tsx`](../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/page.tsx) otherwise has the correct live-LP count query.

Reject active→inactive while any non-terminal LP references the location, return the exact dependency count, and preserve or refresh `lpCount` after every edit. Evidence: [successful deactivation](evidence/R08-13-location-deactivated-with-inventory.yml), [LP still assigned](evidence/R08-14-lp-remains-in-inactive-location.yml).

### PF-R08-02 — P1 — Split silently inherits the source location instead of requiring an output destination

The Split modal exposed only split quantity and reason. There was no destination field. A valid `2.345 kg` split created the child at `RECV` without asking where the new pallet was physically placed.

The binding warehouse split contract requires a destination for every output. Silent inheritance can place the newly labelled pallet in the wrong logical bin, breaking put-away control and physical traceability even though quantity conservation and genealogy are correct.

[`lp-split-modal.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-split-modal.client.tsx) has no destination state or control and calls `splitLp(lpId, qty, reason, clientOpId)`. [`lp-split-merge-destroy-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts) then copies `source.location_id` into the child.

Add a required, active, same-site destination picker and validate it in the transaction before minting the child. Evidence: [modal](evidence/R08-09-split-missing-destination.yml), [child inherited RECV](evidence/R08-11-child-lp-detail.yml).

### PF-R08-03 — P1 — Blind-count rows omit LP identity and become indistinguishable

The new WH1 spot-count session contained three Butter/RM-BUTTER rows at `RECV`. Every row displayed only location, item and unit. All three quantity inputs also had the identical accessible name `Counted qty — RECV RM-BUTTER`.

The action already returns `lpNumber`, but [`count-session-detail.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/counts/_components/count-session-detail.client.tsx) renders only `locationCode`, `itemName` and `itemCode`. An operator cannot know which physical pallet a row represents and can record the correct quantity against the wrong LP. This defeats LP-granular counting and can produce false variances or adjust the wrong stock.

Show the LP number/barcode on every LP-grain row and include it in the input label. If a count is intentionally item/location aggregated, aggregate the server lines to that same grain instead of rendering duplicate anonymous rows. Evidence: [three indistinguishable rows](evidence/R08-20-blind-count-indistinguishable-lps.yml).

### PF-R08-04 — P2 — GRN list reports zero items for a completed one-line GRN

Fresh navigation to the GRN list showed `GRN-20260717-0002`, Completed, Items `0`. Opening the same GRN shows **Receipt lines (1)** with `12.345000 kg` ordered and received and a linked LP.

[`grn-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/grn-actions.ts) derives list count from non-cancelled `grn_items`, while detail renders all rows. Production therefore has a lifecycle/query disagreement for this valid completed row. Operators scanning the list will misread a received document as empty.

Use the same active-line predicate and grain for list count and detail, and add a production-shaped test covering a PO-created completed GRN. Evidence: [list zero](evidence/R08-23-grn-list-items-zero.yml), [detail one](evidence/R08-07-grn-completed-detail.yml).

### PF-R08-05 — P2 — LP label printing bypasses the required print configuration workflow

Clicking **Print label** immediately submitted a one-copy Direct PDF job. The user cannot choose a label quantity or printer. The print-history row confirms fixed copies `1` and Direct PDF.

[`lp-detail.client.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-detail.client.tsx) directly calls `printLabelAction({ entityType: 'lp', entityId })`; the labels tab contains only one button. The required PrintLabelModal workflow (copies plus printer selection) is absent.

This makes multi-label reprints and routing to an actual floor printer impossible from LP detail. Add the modal, validate copies as a positive integer, list active same-site printers, and pass both choices to the action. Evidence: [print history](evidence/R08-12-print-and-reprint-history.yml).

### PF-R08-06 — P2 — Reprinting a Direct PDF job converts it into a permanently queued ZPL job

The source label job was Sent with Direct PDF and a download. Reprint created a second row with the same LP and copies, but status remained Queued after 13 minutes and no download appeared.

The root cause is deterministic in [`printers.ts`](../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/printers/_actions/printers.ts): `reprintFromHistory` left-joins the printer, then defaults a missing `printer_type` to `'zpl'`. Direct PDF jobs have no printer row, so reprint incorrectly becomes a queue-dependent ZPL job rather than regenerating the original PDF.

Persist the output mode on every print job, or infer printerless source jobs as Direct PDF during reprint. Evidence: [source and new job](evidence/R08-12-print-and-reprint-history.yml), [still queued](evidence/R08-19-reprint-stuck-queued-13min.yml).

### PF-R08-07 — P2 — Expiry “days left” is off by one because it uses time-of-day arithmetic

On civil date 2026-07-17, the owned LP expiring 2026-07-24 displayed `6d`; the correct civil-day difference is seven. A row expiring 2026-07-16 displayed “expired 2d ago” instead of one day.

[`expiry/page.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/page.tsx) calculates `Math.floor((expiryMidnight - Date.now()) / 86_400_000)`. Any time after midnight consumes part of a day and floors the result, causing an early red-tier transition.

Normalize both dates to the same civil-day boundary in the selected business timezone before subtracting. Add noon, DST and UTC/local boundary tests. Evidence: [tier and day values](evidence/R08-21-expiry-off-by-one-and-missing-batch.yml).

### PF-R08-08 — P2 — Expiry dashboard deliberately drops batch and status traceability

The owned LP detail shows batch `NIGHT-R08-SB-1400`, status Available and QA Released. The expiry row for the same LP renders Batch `—` and Status `—`.

The mapper in [`expiry/page.tsx`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/expiry/page.tsx) explicitly assigns `batchNumber: null` and `status: ''` because the action does not expose them. This is not stale browser data; the production UI intentionally discards fields essential to identifying expiring food stock.

Return batch, LP state and QA state from the expiry read and display them without fabrication. Evidence: [LP truth](evidence/R08-17-merge-conservation-primary.yml), [expiry row](evidence/R08-21-expiry-off-by-one-and-missing-batch.yml).

### PF-R08-09 — P2 — Site-filtered LP list can be bypassed by direct detail navigation

With top-bar Site set to `tester1`, search for the owned Main Factory LP returned zero rows. Navigating directly to its saved detail URL still exposed the full LP, `12.345 kg`, location, lineage and all mutation actions while `tester1` remained selected.

[`lp-actions.ts`](../../../../apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/lp-actions.ts) applies `siteId` to list reads but `getLpDetail(lpId)` filters only by org and LP id. This makes the site context inconsistent and allows operators to mutate an off-context site through a bookmark.

Thread the selected site through detail and mutation reads, or explicitly label the site selector as list-only and show a clear cross-site context switch before enabling actions. Evidence: [direct detail under tester1](evidence/R08-22-cross-site-direct-detail-visible.yml).

## Exact calculations and stock conservation

| Check | Exact result | Production result | Verdict |
|---|---:|---:|---|
| PO net | `12.345 × 4.0000 = 49.380` | `49.38 GBP` | PASS |
| PO tax | `49.380 × 20% = 9.876` | `9.876 GBP` | PASS |
| PO gross | `49.380 + 9.876 = 59.256` | `59.256 GBP` | PASS |
| Receipt | `12.345 ordered - 12.345 received = 0` | Outstanding `0` | PASS |
| Split | `10.000 + 2.345 = 12.345` | exact six-decimal display | PASS |
| Hold | `2.345 held - 2.345 released = 0 held` | exact | PASS |
| Merge | `2.345 primary + 10.000 secondary = 12.345` | primary `12.345`, secondary `0.000` | PASS |

## Prior-fix and guard verification

| Contract | Result |
|---|---|
| QA release promotes LP | **PASS** — receiving release changed Pending to Available + Released. |
| Hold bypass prevention | **PASS** — held LP disabled Split/Merge/Reserve and server-linked quality hold contained the full quantity. |
| Hold e-sign / immutable audit | **PASS** — disposition, notes and valid e-sign were required; `quality.hold.released` persisted. |
| Full-quantity split / zero-LP guard | **PASS** — full available quantity could not be split. |
| Split genealogy and exact quantity | **PASS** — parent/child link and `10 + 2.345` conservation survived refresh. |
| Merge terminal state | **PASS** — merged secondary became zero quantity and all mutations disabled. |
| Move same-site location | **PASS** — destination required, reason recorded, and quantity/status persisted. |
| Inactive destination rejection | **PASS for destination selection** — inactive location was not available as a destination after cleanup. |
| Location deactivation with stock | **FAIL** — no dependency guard. |
| Supplier/internal batch truth | **Previously reported, confirmed** — GRN repeats the supplied lot as both Batch and Supplier batch while LP Supplier batch is absent. Not counted as a new Run 08 finding. |

## Cleanup and retained artifacts

- PO `NIGHT-R08-PO-1400` remains Closed as an auditable source document.
- GRN `GRN-20260717-0002` remains Completed.
- LP `LP-7A6E5C1FE645` remains Available + Released at `RECV`, quantity `12.345000 kg`.
- Parent LP `LP-1784297297223-HFWI` remains terminal Merged at `0.000000 kg`.
- Quality hold `HLD-00001025` remains Released with its immutable signed record.
- Audit location `NIGHT-R08-1400` was emptied, deactivated and deleted.
- Count session `CNT-B3A814DF` was closed without recording or applying any count.
- One Sent Direct PDF print job and one defective Queued reprint remain as audit evidence.
- No direct stock adjustment was applied.
- Top-bar site filter was restored to Main Factory.

## Limitations

- Catch-weight receipt was not mutated because the owned selected RM was not catch-weight enabled.
- A direct adjustment mutation was not applied: after merge there was one owned live LP, and an increase would mint another retained pallet while a decrease requires a separate supervisor. Validation and e-sign/countersign UI were inspected.
- No physical printer was configured; Direct PDF and its reprint path were the available production workflow.
- The single accumulated console capture includes an isolated 401/render error from an earlier PO navigation and favicon 404. It was not deterministic enough to count as a separate finding.
- No production database query or product-code mutation was performed.

## Finding count

| Severity | Count |
|---|---:|
| P0 | 0 |
| P1 | 3 |
| P2 | 6 |
| **Total** | **9** |
