# Run 18/20 — Customer, SO, allocation, shipping, POD and RMA

## Deployment, marker, verdict

- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Run marker: `NIGHT-R18-20260718T0853Z`
- Verdict: **FAIL (3 P1 and 1 P2 findings)**. Customer/contact/address creation, decimal persistence, FEFO allocation, expired/QA stock rejection, short-pick, full pick and initial partial packing worked. Allergen restriction creation is unavailable, duplicate SO submission creates two commercial documents, displayed SO amounts do not reconcile by one penny, and the shipment can be sealed with 2.625 kg still unpacked after the post-first-pack entry path becomes unusable.

The in-app Browser backend was unavailable, so the authorized Playwright MCP fallback was used. No viewport resize was attempted. All mutations were performed through visible UI controls in a single authenticated browser context; no API, SQL, product-source edit, commit or deployment was used.

## Scenarios

| ID | Scenario | Status | Result / evidence |
|---|---|---|---|
| S01 | Production authentication, organization and site context | PASS | Authenticated as the authorized Apex Admin in Apex 22. Site was changed from Main Factory to All sites; Shipping declared itself org-wide. |
| S02 | Owned customer create with marker and precision fields | PASS | Created customer `NIGHT-R18-20260718T0853Z` with address/contact-ready data and 1,234.56 GBP credit limit; [evidence](evidence/R18-S01-customer-created.png). |
| S03 | Customer contact create | PASS | Created a primary marker contact with title, email and phone; the previous contact-create failure is not present on current production. |
| S04 | Default shipping address create | PASS | Created default shipping address at 18 Audit Lane, Unit R18, London, EC1A 1BB, GB with marker loading-bay notes. |
| S05 | Customer allergen restriction create | FAIL | Allergen selector remained disabled and empty; submit was disabled after a retry/wait. PF-R18-01; [evidence](evidence/R18-S03-allergen-disabled.png). |
| S06 | Multi-line SO decimal/trailing-zero persistence | PASS | Quantities `1.2500` and `2.3750`, unit prices `3.33330` and `1.23456`, discount/tax and GBP persisted with the expected database-scale normalization. |
| S07 | Commercial total reconciliation | FAIL | Displayed lines were 4.38 GBP and 3.08 GBP while displayed order total was 7.45 GBP; the visible components differ by 0.01 GBP. PF-R18-03. |
| S08 | SO create double-submit resilience | FAIL | Two synchronous clicks produced two persisted drafts, `SO-202607-00012` and `SO-202607-00013`, with identical customer, lines and 7.45 GBP total. PF-R18-02; [evidence](evidence/R18-S04-duplicate-so.png). |
| S09 | SO edit and refresh persistence | PASS | `SO-202607-00013` persisted edited quantities `1.500` + `2.125`, date 2026-07-26, marker notes and 8.00 GBP total. |
| S10 | SO cancel/delete | NOT RUN | Both orders became test lineage for allocation/pick/shipment; destructive cleanup was not safe after dependent facts existed. |
| S11 | Allocation and FEFO/eligibility selection | PASS | Expired 4 kg LP and QA-pending 3 kg LP were excluded; the released, non-expired 60 kg LP was allocated. [Evidence](evidence/R18-S06-fefo-candidates.png). |
| S12 | Expired and ineligible LP reassign gates | PASS | Reassigning the expired LP returned “cannot be picked (hold, QA, or expired)”; reusing the already allocated LP was also rejected. |
| S13 | Short-pick with exact remainder | PASS | On `SO-202607-00013`, 1.000 of 1.500 kg was picked with a marker reason, producing an exact 0.500 kg pending remainder; the second 2.125 kg line was fully picked. |
| S14 | Short-pick reassign to alternate eligible LP | BLOCKED | No alternate released, non-expired eligible FG0014 LP existed. Foreign stock was not mutated. |
| S15 | Full pick spine | PASS | Duplicate `SO-202607-00012` allocated and picked the exact full 3.625 kg through pick list `PL-2026-00004`. |
| S16 | Initial partial pack | PASS | Packed exactly 1.000 kg from `LP-1783403708585-ARVA` into Box 1 of `SH-2026-00012`. |
| S17 | Pack correction/unpack | BLOCKED | No unpack, remove or quantity-correction control rendered for the persisted box-content row. |
| S18 | Continue/repack remaining 2.625 kg | FAIL | Existing-box and new-box submissions, including real sequential typing and hard refresh, showed “Enter a license plate code” despite visibly populated LP and quantity. PF-R18-04; [evidence](evidence/R18-S07-partial-repack-blocked.png). |
| S19 | SSCC-18 validity | PASS | Box 1 SSCC `012345670000000039` has 18 digits and the correct GS1 mod-10 check digit `9`. |
| S20 | Seal completeness gate | FAIL | Seal was enabled and the server accepted it with only 1.000 of 3.625 kg packed. Shipment became Packed and Ship/BOL became enabled with 2.625 kg missing. PF-R18-04; [evidence](evidence/R18-S08-partial-seal-allowed.png). |
| S21 | BOL invalid/valid e-sign and persistence | BLOCKED | Stopped at the newly enabled BOL gate because the shipment was already in an invalid incomplete-packed state; no signature was submitted. |
| S22 | Partial/full ship, POD and delivery retention | BLOCKED | Not safe to advance the incomplete packed shipment. No Ship or POD mutation was made. |
| S23 | RMA lifecycle and returned-quantity reconciliation | NOT RUN | Timebox and upstream shipment-integrity failure prevented a valid delivered-shipment prerequisite. |

## Findings

### PF-R18-01 — P1 — allergen restriction CRUD has no selectable reference data

- URL: `https://monopilot-kira.vercel.app/en/shipping/customers/b41cb800-1baa-412e-a0bd-9013bcc21918`
- Reproduction:
  1. Open the owned customer.
  2. Open Allergens.
  3. Choose Add allergen restriction.
  4. Wait and retry the allergen selector.
- Expected: active allergen reference options are available and an authorized operator can persist a customer refusal/declaration restriction.
- Actual: the allergen selector is disabled and empty, and the create action remains disabled.
- Impact: shipping/customer master data cannot record allergen restrictions. This blocks a food-safety control and regresses the prior allergen-CRUD fix.
- Persistence: reproduced after waiting in the open modal; no option appeared and no safe create mutation was possible.
- Evidence: [disabled allergen modal](evidence/R18-S03-allergen-disabled.png).
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/shipping/customers/_components/customer-allergen-modal.tsx:120-139` disables the selector whenever the supplied option list is empty.
  - `apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.ts:152-169` only reads active org-scoped rows under `reference.allergens_reference`; current production returned no usable options.
- Minimal fix: ensure the org receives the canonical allergen reference seed/lookup and render an explicit load/configuration error instead of a permanently disabled empty control; cover current-production seed presence and create/edit/delete in an end-to-end test.

### PF-R18-02 — P1 — duplicate SO submission creates two independent sales orders

- URL: `https://monopilot-kira.vercel.app/en/shipping`
- Reproduction:
  1. Fill the owned two-line SO form.
  2. Activate Create sales order twice synchronously.
  3. Return to the SO list.
- Expected: one logical submission creates one order; an immediate repeat is ignored or resolves to the same order.
- Actual: `SO-202607-00012` and `SO-202607-00013` both persisted with the same customer, two lines and 7.45 GBP.
- Impact: duplicate commercial demand, reservations, pick work and shipments can be created from a single operator intent. The audit intentionally used one duplicate for the full spine and the other for short-pick proof, but they remain distinct records.
- Persistence: both drafts survived list refresh and independently accepted later lifecycle mutations.
- Evidence: [duplicate SO list](evidence/R18-S04-duplicate-so.png).
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/shipping/_components/create-so-modal.tsx:296-338` has no synchronous re-entry latch before awaiting the action; `pending` only disables the button after a React render (`:608-617`).
  - `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:599-603` accepts no client idempotency key, so both requests are authoritative creates.
- Minimal fix: add an immediate ref/mutex guard in the client handler and a server-side org-scoped idempotency key with unique enforcement; test two same-tick submits and a network retry.

### PF-R18-03 — P2 — displayed SO line amounts do not add to the displayed order total

- URL: `https://monopilot-kira.vercel.app/en/shipping`
- Reproduction:
  1. Create two lines: `1.2500 × 3.33330`, discount `12.500%`, tax `20.000%`; and `2.3750 × 1.23456`, discount `0%`, tax `5%`.
  2. Observe line displays 4.38 GBP and 3.08 GBP.
  3. Observe order display 7.45 GBP.
- Expected: the visible order total reconciles to the visible line totals, or the UI exposes the higher-precision subtotal/rounding adjustment.
- Actual: `4.38 + 3.08 = 7.46 GBP`, but the header/list total is `7.45 GBP`; visible delta is `-0.01 GBP`.
- Impact: operators cannot reconcile a commercial document from the amounts shown on screen, creating invoice/customer-service ambiguity even though underlying NUMERIC arithmetic remains deterministic.
- Persistence: both duplicate orders showed the same 7.45 GBP total; values persisted across refresh.
- Likely source:
  `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/sales-line-price.ts:51-63`
  computes/stores each line to four decimals, while lines `85-90` format each
  amount independently to currency cents; the order total is formatted from the
  sum of four-decimal line facts.
- Minimal fix: choose and document one accounting rounding policy. Prefer summing posted two-decimal line amounts, or display a separate rounding adjustment/high-precision subtotal so visible components reconcile exactly.

### PF-R18-04 — P1 — partial packing strands the remaining quantity and incomplete shipment can be sealed

- URL: `https://monopilot-kira.vercel.app/en/shipping/shipments/8770f9a6-f245-4a37-8484-597f6c04f38b`
- Reproduction:
  1. From fully picked `SO-202607-00012` (3.625 kg), create shipment `SH-2026-00012`.
  2. Pack 1.000 kg from `LP-1783403708585-ARVA`.
  3. Enter the same LP and remaining 2.625 kg for existing Box 1 or New box; submit.
  4. Repeat after a hard refresh with real sequential typing.
  5. Observe the enabled Seal shipment control and activate it.
- Expected: subsequent pack entries are accepted, correction/unpack is available before seal, and the server rejects seal unless packed quantity exactly reconciles to shipment/picked requirements.
- Actual: all subsequent pack submissions report “Enter a license plate code” while the populated value remains visible; no correction control exists. Seal remains enabled and server transitions the shipment to Packed with only 1.000 kg. Ship shipment and Generate BOL become enabled although 2.625 kg is missing.
- Impact: an operator can create a legally/logistically incomplete shipment, BOL and downstream ship state while the UI prevents completion of the pack. Inventory, customer delivery and traceability quantities can diverge.
- Persistence: the 1.000 kg box content survived multiple hard refreshes; after seal, status persisted as Packed and the downstream controls remained enabled.
- Evidence: [repack blocked](evidence/R18-S07-partial-repack-blocked.png), [incomplete seal accepted](evidence/R18-S08-partial-seal-allowed.png).
- Likely source:
  - `shipment-pack-view.tsx:183-190` validates the React `lp` state, which was empty after the first `router.refresh()` despite the controlled input displaying typed text; `:203-217` clears local fields and refreshes after a successful pack. The exact hydration/state desynchronization requires focused reproduction.
  - `shipment-pack-view.tsx:174-181` enables Seal based only on permission, box count and status.
  - `ship-actions.ts:292-329` authoritatively checks only `status='packing'` and `box_count >= 1`; it does not reconcile required/picked quantity to box contents.
- Minimal fix: repair the post-refresh controlled-input state and add correction/unpack. More importantly, make `sealShipment` atomically compare org-scoped required shipment quantities with summed non-deleted box contents and reject every under/over-pack; keep the client button disabled with an exact remaining-quantity message. Test partial pack → refresh → complete pack and partial pack → seal rejection.

## Manual calculations and lineage

### Commercial arithmetic

Original `SO-202607-00012` / pre-edit duplicate:

- Line 1 raw: `1.250 × 3.3333 × (1 - 0.125) × (1 + 0.20) = 4.37495625 GBP`; database line scale gives `4.3750`, display `4.38`.
- Line 2 persisted-price basis: input `1.23456` normalizes to `1.2346`; `2.375 × 1.2346 × 1.05 = 3.07878375 GBP`; database line scale gives `3.0788`, display `3.08`.
- Four-decimal document sum: `4.3750 + 3.0788 = 7.4538 GBP`; display `7.45`.
- Display reconciliation: `4.38 + 3.08 = 7.46`; document display `7.45`; delta `-0.01 GBP`.

Edited `SO-202607-00013`:

- Line 1 raw: `1.500 × 3.3333 × 0.875 × 1.20 = 5.2499475 GBP`.
- Line 2 raw: `2.125 × 1.2346 × 1.05 = 2.75470125 GBP`.
- Raw sum: `8.00464875 GBP`; displayed order total `8.00 GBP`.

### Quantity and lifecycle reconciliation

| Handoff | Identifier | Quantity / state |
|---|---|---|
| Customer | `NIGHT-R18-20260718T0853Z` / `b41cb800-1baa-412e-a0bd-9013bcc21918` | Active; owns contact/address and both SOs |
| Full-spine SO | `SO-202607-00012` | Ordered `1.250 + 2.375 = 3.625 kg` |
| Allocation | LP `LP-1783403708585-ARVA` | Allocated `3.625 kg`; released and non-expired |
| Full pick | `PL-2026-00004` | Picked `3.625 kg`; delta to order `0.000 kg` |
| Shipment | `SH-2026-00012` / `8770f9a6-f245-4a37-8484-597f6c04f38b` | Packed status with only `1.000 kg` in Box 1 |
| Missing at seal | same shipment | `3.625 - 1.000 = 2.625 kg` unpacked |
| Short-pick SO | `SO-202607-00013` / `PL-2026-00003` | Ordered/allocated `3.625`; picked `1.000 + 2.125 = 3.125`; pending remainder `0.500 kg` |

### SSCC-18

- SSCC: `012345670000000039`.
- First 17 digits weighted from the right by 3/1 give sum `61`.
- Check digit: `(10 - (61 mod 10)) mod 10 = 9`.
- Stored final digit is `9`: valid.

## Prior fixes opportunistically confirmed or regressed

- Customer contact create: **confirmed fixed for create** on current production. Edit/delete were not run.
- SO trailing-zero/high-precision input handling: **confirmed**; values persisted with explicit database-scale normalization rather than float drift.
- FEFO/eligibility and short-pick gates: **confirmed** for expired, QA-pending and already-allocated candidates.
- Prior customer allergen CRUD fix (C110): **regressed/incomplete on current production** because no allergen option can be selected.
- Shipping hydration/partial-pack continuation and BOL/POD/RMA fixes were not confirmed; PF-R18-04 blocks a valid BOL/POD spine.

## Cleanup and remaining artifacts

- Customer `b41cb800-1baa-412e-a0bd-9013bcc21918` remains active with its marker contact and default shipping address. It was retained because it is referenced by both SOs and the shipment.
- `SO-202607-00012` and `SO-202607-00013` remain as evidence. The former backs the packed shipment; the latter remains Partially picked with a 0.500 kg child remainder and no eligible alternate LP.
- Pick lists `PL-2026-00004` and `PL-2026-00003` remain as committed fulfillment lineage.
- Shipment `SH-2026-00012` remains Packed with Box 1 / SSCC `012345670000000039` and 1.000 kg content. No Ship, BOL, POD or RMA mutation was performed after the invalid incomplete seal.
- No safe delete/cancel/deactivate path was used after dependent records existed. Retaining these marker-owned facts preserves the exact audit trail and avoids orphaning lineage.
- No password, PIN, cookie, token or credential is present in report/evidence.

## Limitations

- In-app Browser was unavailable; Playwright MCP fallback was used.
- No viewport resize was used, so responsive/mobile-specific claims are not made.
- The absence of an alternate eligible FG0014 LP blocked successful short-pick reassignment.
- BOL e-sign, Ship, POD delivery/retention and RMA were blocked/not run after the shipment entered an invalid incomplete Packed state.
- Customer contact edit/delete and order cancel/delete were not exercised because time and dependent lineage made cleanup destructive.
- Two unsafe browser-code calls hung early in the run and were not repeated. Subsequent work used bounded element evaluation, snapshots, form typing and screenshots.
- Source inspection was read-only and performed only after browser reproduction; root-cause statements are explicitly marked likely where browser evidence cannot prove implementation causality.

## Counts

- Scenario rows: **23**
- Attempted: **21**
- PASS: **12**
- FAIL: **5**
- BLOCKED: **4**
- NOT RUN: **2**
- Findings: **P0 0 · P1 3 · P2 1 · P3 0**
