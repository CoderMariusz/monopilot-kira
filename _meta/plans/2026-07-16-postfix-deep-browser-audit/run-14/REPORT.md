# Run 14/20 — Consumption, FEFO, holds, substitutions and genealogy

## Deployment and verdict

- Production: `https://monopilot-kira.vercel.app`
- Deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Commit: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Deployment state observed before the walk: `READY`
- Organization/site: Apex 22 / Main Factory
- Run marker: `NIGHT-R14-20260718T060817Z`
- Verdict: **FAIL — 1 P1 and 1 P2 fresh production finding.** FEFO ordering, quantity arithmetic, stock conservation, hold exclusion, hold release e-sign and reversal all worked. The controlled FEFO-deviation path cannot be completed in the desktop UI, and the WO/LP genealogy UI does not expose an operator-usable bidirectional LP↔WO identity.
- Browser: the prescribed in-app browser backend returned no available browser after its documented troubleshooting. The permitted Playwright MCP fallback was used with exactly one tab.

## Scenario results

| ID | Scenario | Result | Production evidence |
|---|---|---:|---|
| R14-S01 | Deployment, authentication, Apex 22 and Main Factory context | PASS | Production chrome and site selector; GRN screenshot: `evidence/R14-S01-grn-stock.png` |
| R14-S02 | Create and release owned root/child WO chain | PASS | Root `WO-202607-0036`, child `WO-202607-0036-W1`; Planning persisted both as Released |
| R14-S03 | PO → GRN → three owned LPs | PASS | `PO-202607-0024` → `GRN-20260718-0001`; `evidence/R14-S01-grn-stock.png` |
| R14-S04 | QA-release all three received LPs | PASS | LP rows persisted as `released`; `evidence/R14-S01-grn-stock.png` |
| R14-S05 | Production dashboard entry route | BLOCKED | `/en/production` twice showed only “Live production data is currently unavailable”; `evidence/R14-S02-production-unavailable.png`. This reconfirms known `PF-R13-01` and is not counted again |
| R14-S06 | Direct production WO detail and Start | PASS | `/en/production/wos/314d0661-9f09-43fd-aa91-1b539d90d1f3`; In progress, actual start `2026-07-18 06:24` |
| R14-S07 | FEFO suggestion with two owned flour LPs | PASS | Earliest `LP-1784355388076-524S`, expiry `2026-08-01`, was suggested ahead of `LP-1784355430268-CT67`, expiry `2026-09-01` |
| R14-S08 | Zero quantity server gate | PASS | Submit returned “Enter a quantity greater than zero”; consumed remained `0 kg` |
| R14-S09 | Extreme over-consumption gate | PASS | `99 kg` blocked with required/consumed/attempted values and supervisor-approval message |
| R14-S10 | Exact `0.480 kg` FEFO consume, refresh/revisit and stock persistence | PASS | WO displayed `0.48 kg` consumed / `7.08 kg` remaining; LP displayed `11.520000 kg`; `evidence/R14-S03-consume-048.png` |
| R14-S11 | LP movement and WO genealogy reconciliation | FAIL | WO genealogy rendered the input only as `c4413a17`; LP Movements showed `consume_to_wo 0.480000 kg`, while LP Genealogy had no WO link; see `PF-R14-02` |
| R14-S12 | Correct/reverse `0.480 kg` with reason and e-sign | PASS | Original row became Reversed, correction `-0.48 kg`; WO net `0.0%`; LP returned to `12.000000 kg` |
| R14-S13 | Manually choose later-expiry LP and enter controlled FEFO deviation | FAIL | Server returned `fefo_deviation_approval_required`, UI rendered only “The action could not be completed”; `evidence/R14-S04-fefo-late-generic-error.png` |
| R14-S14 | Active quality hold excludes an otherwise-earliest LP | PASS | Own held early LP disappeared from options; next eligible `2026-08-08` LP became suggested; `evidence/R14-S05-held-lp-excluded.png` |
| R14-S15 | Release own medium hold with disposition and Part 11 e-sign | PASS | `HLD-00001026` persisted Released / `release_as_is`, immutable `quality.hold.released` audit event |
| R14-S16 | Site-list isolation | PASS | Switching to `CODEX-R14 SITE` produced `0 orders` and hid both Main Factory WOs; Main Factory restored afterwards |
| R14-S17 | Catch-weight consume | NOT RUN | The selected BOM materials were ordinary kg components; no safe configured catch-weight input was available within the timebox |
| R14-S18 | Double-submit/idempotent repeat | NOT RUN | Not attempted after the exact consume/reversal sequence to avoid leaving duplicate production ledger rows |
| R14-S19 | Exact hold-after-selection race | BLOCKED | Single-tab UI cannot keep a consume modal selection alive while creating a hold elsewhere. The stronger normal-state invariant—an already-held LP is excluded—was verified in R14-S14 |
| R14-S20 | Cleanup and safe final state | PASS | Both WOs Cancelled, consumption net zero, own hold Released, site restored |

## Findings

### PF-R14-01 — P1 — Controlled FEFO deviation is a desktop-UI dead end

- URL: `https://monopilot-kira.vercel.app/en/production/wos/314d0661-9f09-43fd-aa91-1b539d90d1f3`
- Reproduction:
  1. Start `WO-202607-0036-W1`.
  2. Open Consumption → ING-FLOUR → Record.
  3. Confirm the suggested LP is `LP-1784355388076-524S`, expiry `2026-08-01`.
  4. Manually select owned later LP `LP-1784355430268-CT67`, expiry `2026-09-01`.
  5. Enter `0.480 kg` and submit.
  6. Repeat from a fresh modal; the same result persists.
- Expected: the UI should surface the controlled FEFO-deviation workflow: an explicit explanation, deviation reason and electronic-signature fields, then either a signed consume or a precise policy denial.
- Actual: the server correctly returns `{ ok:false, reason:"fefo_deviation_approval_required" }`, but the modal displays only “The action could not be completed.” There are no reason/e-sign controls, so an authorized deviation cannot be completed from the desktop UI.
- Impact: a legitimate substitute/lot deviation stops production without an actionable recovery path. Operators are encouraged to abandon the transaction or seek an out-of-band bypass, and the intended signed deviation record cannot be created.
- Persistence: reproduced in the same fresh production modal after prior stock reversal; the later LP remained unchanged at `8.000000 kg`.
- Evidence: `evidence/R14-S04-fefo-late-generic-error.png`; live response body returned `reason=fefo_deviation_approval_required`.
- Likely current-source cause:
  - `apps/web/app/[locale]/(app)/(modules)/production/_actions/consume-material-actions.ts:697-704` intentionally requires `fefoDeviationReason` and e-sign.
  - `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/_components/record-consumption-modal.tsx:112-146` has no mapping for `fefo_deviation_approval_required`.
  - The submit payload at `record-consumption-modal.tsx:158-173` sends neither a deviation reason nor signature, although the action accepts them.
- Suggested fix: add a reason + e-sign escalation state to the modal when this reason is returned, resubmit both fields, and map all FEFO/e-sign reasons to specific localized messages. Add a UI test that selects a non-suggested LP and completes the signed deviation.

### PF-R14-02 — P2 — LP↔WO genealogy uses a raw UUID prefix and is not bidirectionally navigable

- URLs:
  - `https://monopilot-kira.vercel.app/en/production/wos/314d0661-9f09-43fd-aa91-1b539d90d1f3`
  - `https://monopilot-kira.vercel.app/en/warehouse/license-plates/c4413a17-54f8-4f50-9b90-3a771f08654e`
- Reproduction:
  1. Consume `0.480 kg` from `LP-1784355388076-524S` into `WO-202607-0036-W1`.
  2. Refresh and open the WO Genealogy tab.
  3. Observe the consumed input label is only `c4413a17`, the first eight characters of the LP UUID, with no LP number or link.
  4. Open the LP detail. Movements records `consume_to_wo 0.480000 kg` with source document `SM-192B075043BB32AC91AD`, but no visible/clickable `WO-202607-0036-W1`; the LP Genealogy tab reports only LP parent/child relations and no consuming WO.
- Expected: the WO should show and link `LP-1784355388076-524S`, while the LP should identify and link the consuming `WO-202607-0036-W1`, so an operator can trace either direction without UUID knowledge.
- Actual: trace data exists, but the WO renders a raw UUID prefix and the LP side has no consuming-WO link.
- Impact: production investigation and recall tracing are unnecessarily manual and error-prone; an operator cannot reconcile a physical LP label to the WO genealogy row from the UI alone.
- Persistence: remained after refresh/revisit; reversal correctly added a counter row but retained the same opaque UUID labels.
- Evidence: exact consume and persisted stock are visible in `evidence/R14-S03-consume-048.png`; the live Genealogy DOM rendered `c4413a17`, `0.48 kg`, `FEFO`.
- Likely current-source cause:
  - `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-work-order-detail.ts:169-176,703-711` returns `lpId` but not `lpNumber`.
  - `apps/web/app/[locale]/(app)/(modules)/production/wos/[id]/_components/wo-detail-screen.tsx:1350-1385` deliberately renders `g.lpId.slice(0, 8)` and has no LP link.
- Suggested fix: join/select `license_plates.lp_number`, expose it in `WoDetailGenealogyInput`, render a link to the LP detail, and add a consuming-WO section/link on LP detail or global genealogy. Test both directions before and after reversal.

## Manual calculations and lineage

### WO material lineage

- Root: `WO-202607-0036`, FG0014, entered `40.000 box`.
- Product conversion displayed by Planning: `40 box × 1.5 kg/box = 60.000 kg`.
- Child: `WO-202607-0036-W1`, WIP-20260707-0006.
- Child quantity: `60.000 × 0.84 = 50.400 kg`; displayed `50.400 kg`, delta `0`.
- BOM snapshot:
  - ING-FLOUR required `7.560 kg`.
  - ING-SUGAR required `3.024 kg`.

### Receipt lineage

- `PO-202607-0024` → `GRN-20260718-0001`.
- Flour: `12.000 + 8.000 = 20.000 kg`, represented by two independent LPs with expiries `2026-08-01` and `2026-09-01`.
- Sugar: `5.000 kg`, one LP, expiry `2026-10-01`.
- GRN persisted all three line quantities exactly and all three LPs were QA released.

### Exact consumption and reversal

- Flour requirement before consume: `7.560 kg`.
- Consume: `0.480 kg`.
- Expected requirement remaining: `7.560 - 0.480 = 7.080 kg`.
- Displayed: consumed `0.48 kg`, remaining `7.08 kg`; delta `0.000 kg`.
- Early LP before: `12.000000 kg`.
- Expected LP after: `12.000000 - 0.480000 = 11.520000 kg`.
- Displayed after refresh/revisit: `11.520000 kg`; delta `0.000000 kg`.
- Reversal counter entry: `-0.480 kg`.
- Expected WO net: `0.480 + (-0.480) = 0.000 kg`; displayed `0.0%`.
- Expected LP restored: `11.520000 + 0.480000 = 12.000000 kg`; displayed `12.000000 kg`; delta `0.000000 kg`.

## Prior fixes opportunistically confirmed

- `0.48` is no longer rounded to zero: exact consumption persisted in WO totals, LP balance and movement ledger.
- Consumption requires a real released LP; the selected LP was QA released before use.
- FEFO ordering uses expiry and correctly suggested the earliest eligible LP.
- Active LP hold is enforced by excluding the LP from the consumable set.
- Consumption reversal is append-only, reasoned and electronically signed; original and counter rows remain visible.
- Hold release required disposition, notes and e-sign and produced an immutable audit event.
- Production dashboard failure is a current-production reconfirmation of known `PF-R13-01`, not a new Run 14 finding.

## Cleanup, remaining artifacts and limitations

- `WO-202607-0036-W1`: **Cancelled**, net consumption `0.000 kg`, no output.
- `WO-202607-0036`: **Cancelled**, no execution/output.
- `HLD-00001026`: **Released** as-is with immutable e-sign audit.
- `LP-1784355388076-524S`: Released, `12.000000 kg`.
- `LP-1784355430268-CT67`: Released, `8.000000 kg`.
- `LP-1784355463658-ZCV0`: Released, `5.000000 kg`.
- `PO-202607-0024` and completed `GRN-20260718-0001` remain as owned auditable receipt history; deleting them would destroy the provenance used by this run.
- Site selector restored to Main Factory.
- No foreign/seed records were mutated.
- Exact hold-after-selection concurrency race was not possible in the mandated single-tab session; pre-existing active-hold exclusion was verified instead.
- Catch-weight and double-submit were not run. No configured safe substitution was available; the controlled non-FEFO lot choice exposed `PF-R14-01`.
- Scanner was not used because it requires a separately enrolled scanner PIN; all core execution was completed through the desktop production UI.

## Counts

- Scenarios listed: **20**
- Attempted: **18**
- PASS: **14**
- FAIL: **2**
- BLOCKED: **2**
- NOT RUN: **2**
- Findings: **P0 0 · P1 1 · P2 1 · P3 0**
