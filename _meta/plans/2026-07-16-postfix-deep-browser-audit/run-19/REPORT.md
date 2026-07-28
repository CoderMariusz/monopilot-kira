# Run 19/20 — Finance, WAC/FIFO, reporting and OEE reconciliation

## Deployment, marker, verdict

- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Run marker: `NIGHT-R19-20260718T095001Z`
- Verdict: **FAIL (1 P2 finding)**. The owned PO→GRN→LP receipt was single-write under rapid repeat activation, posted the expected quantity into WAC, and survived fresh navigation. OEE date/site/error/null behavior reconciled to its documented snapshot-average semantics. The remaining new defect is that WO actual-cost money has no visible currency label and its CSV has no first-class currency column.

The in-app Browser backend reported no available browser, so the authorized Playwright MCP fallback was used. No viewport resize was attempted. All mutations were performed through visible UI controls in one authenticated browser context; no API, SQL, product-source edit, commit or deployment was used. Source inspection was read-only and began only after browser reproduction.

## Scenarios

| ID | Scenario | Status | Result / evidence |
|---|---|---|---|
| S01 | Production authentication, organization and site context | PASS | Authenticated in the authorized Apex 22 context; exercised Main Factory, All sites and makery through the visible Site selector. |
| S02 | Owned PO create and rapid-repeat resilience | PASS | Created exactly one `NIGHT-R19-20260718T095001Z` PO after synchronous repeat activation. |
| S03 | Decimal quantity and unit-price behavior | PASS core / PRIOR KNOWN display issue | Quantity `1.111000` persisted and downstream value was consistent with `1.111 × 2.3456`; PO detail still rendered unit price as `2.35 GBP`, the already-reported PF-R07-07. |
| S04 | PO submit and confirmation lifecycle | PASS | The marker PO moved Draft → Submitted → Confirmed and remained receivable. |
| S05 | Receipt quantity boundary gates | PASS | `0` and `-0.001` were rejected with “Enter a quantity greater than zero”; `1.111` was accepted. |
| S06 | Receipt rapid-repeat resilience | PASS | Repeat activation produced one completed GRN and one LP; returning to receive reported the PO closed. |
| S07 | GRN→LP quantity/batch/expiry/location lineage | PASS core / PRIOR KNOWN supplier-batch issue | Quantity, internal batch, expiry, site, warehouse and location persisted. LP supplier batch remained `—`, matching prior PF-R07-06 rather than a new finding; [fresh LP evidence](evidence/PF-R19-01-lp-supplier-batch-missing.png). |
| S08 | QC release and fresh-navigation persistence | PASS | LP `LP-1784368479499-JM3M` moved to Available / Released with `1.111000 kg` and survived fresh navigation. |
| S09 | WAC receipt quantity/value/average reconciliation | PASS within exposed UI scale | All-sites RM-BUTTER moved `562.690000 → 563.801000 kg`; displayed value moved `2244.0527 → 2246.6590 GBP`; resulting WAC was `3.984844`. No float-shaped error was visible at the six/four-decimal presentation scales; [Main Factory post-receipt valuation](evidence/PF-R19-WAC-after-owned-receipt.png). |
| S10 | FIFO exact receipt-layer behavior | BLOCKED | The production valuation UI identifies its method as WAC and exposes no FIFO selector or FIFO-layer drilldown. |
| S11 | Owned WO chain create and release prerequisites | PASS | Created root `WO-202607-0038` and child `WO-202607-0038-W1`, then released both through UI. |
| S12 | Consumption → output → signed reversal/correction → actual variance | BLOCKED | The chain required ING-FLOUR, ING-SUGAR, WIP and packaging/labor inputs not owned by this run. Mutating foreign LPs would violate the audit boundary. |
| S13 | WO chain cleanup | PASS | Cancel chain from the child cascaded; fresh root detail showed Cancelled. |
| S14 | One-day OEE A/P/Q and waste-rate reconciliation | PASS | For 2026-07-18 Main Factory: A `100.0%`, P `—`, Q `95.4%`, OEE `—`; Q and waste recomputed exactly from `2.523 kg` good + `0.123 kg` waste. |
| S15 | Multi-snapshot quality aggregation semantics | PASS | UI `98.5%` equals the documented arithmetic mean of snapshot quality percentages. Pooled mass yield is `99.1%`, but that is not what the tile labeled “Avg quality” claims; [evidence](evidence/PF-R19-02-oee-quality-unweighted.png). |
| S16 | All-sites versus two-site reconciliation | PASS | On the one-day window, All sites `1 snapshot` equalled Main Factory `1` + makery `0`; prior site double-counting C116 did not reproduce. |
| S17 | Reversed OEE range | PASS | `2026-07-19 → 2026-07-18` rendered the explicit start-before-end validation error and no data; prior C118 did not reproduce. |
| S18 | Valid empty OEE range | PASS | makery on 2026-07-19 rendered “No snapshots yet”, distinct from the invalid-range state. |
| S19 | OEE navigation/cache freshness | PASS | Site/date transitions changed snapshot count and rows consistently; returning to valid ranges restored the same persisted facts. |
| S20 | OEE export/UI parity | BLOCKED | No OEE export control was exposed on the production OEE page. |
| S21 | OEE drilldown-total reconciliation | BLOCKED | No factor/snapshot drilldown link was exposed; only Open Andon was available. |
| S22 | Finance WO actual-cost currency and export parity | FAIL | KPI, headers and cells omitted currency. The CSV values matched the visible rows, but currency appeared only inside opaque `processResolution` JSON and not as a first-class column. PF-R19-03; [UI](evidence/PF-R19-03-finance-currency-labels.png), [CSV](evidence/PF-R19-03-finance-export.csv). |
| S23 | Finance refresh/stale-cache control | PASS | Refresh completed and preserved the same `2 of 2` rows and amounts. |
| S24 | Dedicated Reporting-module cross-check | NOT RUN | Timebox and the blocked owned production chain prevented a defensible same-lineage reporting comparison. |

## Findings

### PF-R19-03 — P2 — WO actual-cost UI and CSV do not disclose currency as a first-class value

- URL: `https://monopilot-kira.vercel.app/en/finance`
- Reproduction:
  1. Select Main Factory and open Finance.
  2. Observe Scrap / waste cost and the Materials, Labor, Total and Cost / kg columns.
  3. Activate Refresh, then Export CSV.
  4. Inspect the downloaded header and rows.
- Expected: every monetary KPI/table is visibly denominated, and the export provides a normal `currency` column so rows can be interpreted without parsing unrelated JSON.
- Actual: the UI shows values such as waste `0.0737`, materials `1.5857`, total `1.6594` and cost/kg `1.4936` with no currency label. The CSV has no `currency` header; `GBP` exists only inside the serialized `processResolution` object. By contrast, Inventory valuation visibly labels Grand total and every row as GBP and has a Currency column.
- Impact: an operator cannot determine the denomination from the actual-cost screen, and ordinary CSV consumers can silently treat bare monetary values as their own/default currency. This is especially unsafe next to the explicitly multi-currency valuation model.
- Persistence: reproduced after the explicit Refresh; the downloaded CSV retained the same shape and values.
- Evidence: [actual-cost UI](evidence/PF-R19-03-finance-currency-labels.png), [exported CSV](evidence/PF-R19-03-finance-export.csv), [valuation contrast](evidence/PF-R19-WAC-after-owned-receipt.png).
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/finance/_components/wo-cost-table.client.tsx:17-30` defines monetary labels without currency, and `:292-295` renders bare monetary strings.
  - The export header at `wo-cost-table.client.tsx:125-139` has no currency field; currency is carried only in the serialized `processResolution` value.
  - `apps/web/app/[locale]/(app)/(modules)/finance/page.tsx:94-95` renders the waste KPI without denomination.
  - The correct contrast exists in `finance/valuation/page.tsx:58-60,95,106`, which renders explicit currency.
- Minimal fix: add currency to the actual-cost summary contract, visibly label the KPI and money columns (or each row), and emit a first-class `currency` CSV column. Add UI/export tests that reject unlabeled monetary values and prove mixed-currency rows cannot be merged silently.

## Manual calculations and lineage

### Receipt and WAC

- PO input: `1.111 kg × 2.3456 GBP/kg = 2.6059616 GBP`.
- PO detail displayed the extended value as `2.606 GBP`.
- All-sites quantity: `563.801000 - 562.690000 = 1.111000 kg`, exactly the owned receipt.
- All-sites displayed value: `2246.6590 - 2244.0527 = 2.6063 GBP`.
- Using the pre-receipt displayed total: `(2244.0527 + 2.6059616) / 563.801 = 3.984843342953 GBP/kg`.
- UI WAC: `3.984844 GBP/kg`. The difference is below one displayed WAC micro-unit and is compatible with hidden pre-state precision plus displayed total rounding; the UI does not expose enough scale for a stronger last-digit claim.

### OEE

- One-day quality: `2.523 / (2.523 + 0.123) × 100 = 95.3514739%`, displayed `95.4%`.
- One-day waste rate: `0.123 / 2.646 × 100 = 4.6485261%`, displayed row inputs support `4.6%`.
- Availability: positive planned interval with `0 min` downtime gives `100.0%`.
- Performance had no ideal/runtime basis and remained null; therefore A×P×Q and OEE are honestly undefined and displayed `—`.
- Multi-snapshot arithmetic average: `(95.3514739 + 100 + 100) / 3 = 98.4504913%`, displayed `98.5%`.
- Pooled mass yield for comparison only: `(2.523 + 7.800 + 3.000) / (13.323 + 0.123) × 100 = 99.0852298%`. The PRD explicitly specifies `AVG(quality_pct)` (`docs/prd/15-OEE-PRD.md:289`), and production uses it at `oee-data.ts:155`; pooled yield is not the current KPI contract.

### Owned lineage

| Handoff | Identifier | Quantity / final state |
|---|---|---|
| Purchase order | `NIGHT-R19-20260718T095001Z` | `1.111 kg` RM-BUTTER at `2.3456 GBP/kg`; Completed after receipt |
| GRN | `GRN-20260718-0005` / `538edbdc-84c1-4c8a-9564-e40397c8cd39` | `1.111000 kg`; marker internal batch; completed |
| License plate | `LP-1784368479499-JM3M` / `0082fe46-a527-4826-9bf8-f7a04174abfb` | `1.111000 kg`; Available / Released at Main Factory / WH1 / RECV |
| Root WO | `WO-202607-0038` / `47a24572-2d8f-4e2f-aaef-03939ac87126` | Created/released, then Cancelled |
| Child WO | `WO-202607-0038-W1` / `33f786c1-f26c-411d-995c-b068d80cd827` | Created/released, then Cancelled |

## Prior fixes opportunistically confirmed or regressed

- C116 site reporting double-count: **confirmed fixed for the tested one-day OEE scope**; All sites equalled Main Factory + makery.
- C118 reversed OEE range: **confirmed fixed**; explicit validation replaced reversed-window data.
- PF-R07-06 supplier-batch misrepresentation: **still observable, not counted again**. The marker batch persisted as internal batch while LP Supplier batch remained `—`.
- PF-R07-07 PO unit-price display precision: **still observable, not counted again**. Input `2.3456` rendered as `2.35 GBP` on PO detail.

## Cleanup and remaining artifacts

- Root and child WOs were cancelled through the visible chain control and remained Cancelled after fresh navigation.
- The completed marker PO, GRN and released LP remain as required accounting/traceability evidence. No destructive delete was available or safe after receipt posting.
- No consumption, output, reversal/correction or variance mutation was made because doing so required foreign inventory.
- No password, PIN, cookie, token or other credential is present in the report or retained evidence.

## Limitations

- In-app Browser was unavailable; Playwright MCP fallback was used.
- No viewport resize was used, so responsive/mobile claims are not made.
- The production valuation UI exposes WAC only; FIFO layer behavior was not reachable.
- Exact WO variance/reversal required BOM inputs not owned by this run.
- OEE performance/OEE remained honestly null for the tested snapshots because no ideal/runtime basis was exposed.
- OEE export and drilldown totals were blocked by absent UI controls.
- Dedicated Reporting-module parity was not run within the timebox.
- Source inspection was read-only and occurred only after UI observation; root-cause statements are marked likely.

## Counts

- Scenario rows: **24**
- Attempted: **23**
- PASS: **18**
- FAIL: **1**
- BLOCKED: **4**
- NOT RUN: **1**
- Findings: **P0 0 · P1 0 · P2 1 · P3 0**
