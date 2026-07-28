# Run 15 — Production execution, yield override, corrections, and cost parity

## 1. Deployment and verdict

- Production URL: `https://monopilot-kira.vercel.app`
- Deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Commit: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Deployment state: `READY`
- Site exercised: Main Factory
- Run marker: `NIGHT-R15-20260718T064445Z`
- Verdict: **FAIL — one new P1 terminal-state integrity defect**

The end-to-end receipt, QA release, WO execution, exact material consumption,
waste, multi-output registration, low-yield override, e-signature, and finance
calculations were exercised in production. The WO correctly blocked low-yield
completion and completed only after a valid signed override. A subsequent
signed output void, however, reduced valid output from 2.523 kg to 1.111 kg
without reopening the completed WO or rerunning the yield gate.

## 2. Scenario results

| ID | Scenario | Result | Evidence / observed result |
|---|---|---:|---|
| R15-S01 | Create PO with two ingredient lines | PASS | `PO-R15-064445`, £18.00 total: flour 20 kg × £0.50 plus sugar 10 kg × £0.80 |
| R15-S02 | Send, confirm, receive PO and create GRN/LPs | PASS | `GRN-20260718-0002`; both LPs created with the entered batches and quantities |
| R15-S03 | QA-release received LPs and correct owned expiry metadata | PASS | Both owned LPs became QA Released; expiry edits persisted |
| R15-S04 | Create WO chain and edit parent quantity | PASS | Parent changed from 40 boxes / 60 kg to 10 boxes / 15 kg; child remained linked at 12.600 kg |
| R15-S05 | Release/start child WO and persist execution timestamps | PASS | Child `WO-202607-0037-W1` reached In progress; start persisted |
| R15-S06 | Consume exact BOM quantities from owned LPs | PASS | Flour 1.890 kg plus sugar 0.756 kg; both components and overall consumption displayed 100.0% |
| R15-S07 | Record waste and two outputs, including actual-weight output | PASS | Waste 0.123 kg; outputs 1.111 kg and 1.412 kg; pre-void mass balance was exact |
| R15-S08 | Exercise yield gate, invalid e-sign, valid override, and double submit | PASS | Completion blocked at 20.0%; invalid password rejected; valid signed override completed once; event count increased only 3→4 |
| R15-S09 | Revisit completed WO and verify timestamps | PASS | Status remained Completed; actual start `2026-07-18 06:55`, actual complete `2026-07-18 07:08` |
| R15-S10 | Void an output after completion | **FAIL** | Signed void reduced net output to 1.111 kg / 8.8%, but status stayed Completed and completion timestamp remained set |
| R15-S11 | Verify void ledger and LP reversal | PASS | Original output is struck as Voided, correction is −1.412 kg, and its LP is Destroyed with 0 balance |
| R15-S12 | Verify finance arithmetic after reversal | PASS | Materials £1.5857 + waste £0.0737 = total £1.6594; £1.6594 / 1.111 kg = £1.4936/kg |
| R15-S13 | Cancel the remaining parent chain during cleanup | BLOCKED | UI explicitly rejected cancellation because execution/output activity exists; parent remains Draft |
| R15-S14 | Cross-site isolation by switching to another site | NOT RUN | The run stayed explicitly scoped to Main Factory; no cross-site mutation was attempted |

Scenario rows: 14. Attempted: 13. PASS: 11. FAIL: 1. BLOCKED:
1. NOT RUN: 1.

## 3. Findings

### PF-R15-01 — P1 — Completed WO can lose signed output without reopening or rerunning the yield gate

**Area:** Production → WO execution → output corrections  
**WO:** `WO-202607-0037-W1`  
**Evidence:** `evidence/pf-r15-01-post-complete-output-void.png`

#### Preconditions

The WO consumed its full material requirement:

- flour: 1.890 kg;
- sugar: 0.756 kg;
- total consumed: 2.646 kg.

Waste was 0.123 kg. Two outputs totalled 2.523 kg. The application correctly
blocked completion at a displayed 20.0% yield and required a supervisor
override with a reason and e-signature. After a valid override the WO became
Completed and retained its completion timestamp.

#### Reproduction

1. Open the completed WO.
2. In Outputs, void the 1.412 kg output.
3. Select `Wrong quantity`, enter a reason, and provide a valid e-signature.
4. Confirm the void and revisit the WO overview.

#### Actual result

- The void succeeds.
- The original +1.412 kg output is marked Voided.
- A correction ledger row of −1.412 kg is created.
- The corresponding LP becomes Destroyed with 0.000000 kg.
- Net WO output falls from 2.523 kg to 1.111 kg.
- Displayed output/yield falls from 20.0% to 8.8%.
- The WO nevertheless remains **Completed**.
- `Actual complete` remains `2026-07-18 07:08`.
- The completion yield gate is not rerun and no reopening transition is
  required.
- Finance immediately uses the reduced 1.111 kg denominator and reports
  £1.4936/kg, so financial aggregates change while the lifecycle remains
  terminal.

After the void, retained output plus waste is only:

`1.111 + 0.123 = 1.234 kg`

against 2.646 kg consumed. The 1.412 kg difference is exactly the voided
output. The terminal lifecycle therefore no longer represents the production
record on which completion was authorized.

#### Expected result

A correction that invalidates the terminal yield basis should be atomic with a
defined lifecycle response. Safe alternatives include:

1. reject output voids while the WO is Completed/Closed and require an
   explicit signed reopen/correction workflow; or
2. transactionally reopen the WO, clear/revise terminal completion state,
   invalidate the prior yield authorization, recompute aggregates, and require
   the yield gate plus e-signature again before recompletion.

Dependent records, cost finalization, event/outbox history, and any parent-WO
readiness must be updated consistently in the same transaction.

#### Impact

The production ledger and finance calculations correctly reflect a signed
reversal, but the lifecycle and prior completion authorization do not. This
permits a terminal WO to assert completion after the evidence used to approve
that completion has materially changed. The inconsistency affects auditability,
yield controls, downstream planning, and production-cost interpretation.

#### Likely current-source cause

- `apps/web/lib/corrections/correct-ledger-entry.ts:79-84` applies special
  correction guards only to `closed` and `cancelled`; `completed` is allowed
  through the normal signed-correction path.
- `apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:929-1051`
  inserts the negative output, reverses WAC, destroys the LP and writes audit,
  but never locks/reopens the WO or reruns the yield/completion gate.

## 4. Manual calculations and lineage

### PO total

| Line | Calculation | Expected | UI |
|---|---:|---:|---:|
| Flour | 20.000 kg × £0.5000 | £10.00 | £10.00 |
| Sugar | 10.000 kg × £0.8000 | £8.00 | £8.00 |
| Total | £10.00 + £8.00 | £18.00 | £18.00 |

### Consumption and pre-void mass balance

| Measure | Calculation | Result |
|---|---:|---:|
| Total consumption | 1.890 + 0.756 | 2.646 kg |
| Total registered output | 1.111 + 1.412 | 2.523 kg |
| Waste | entered | 0.123 kg |
| Mass balance delta | 2.646 − 2.523 − 0.123 | **0.000 kg** |
| Displayed planned-output ratio | 2.523 / 12.600 | 20.0% rounded |

### Post-void yield basis

| Measure | Calculation | Result |
|---|---:|---:|
| Net output | 2.523 − 1.412 | 1.111 kg |
| Displayed planned-output ratio | 1.111 / 12.600 | 8.8% rounded |
| Retained output plus waste | 1.111 + 0.123 | 1.234 kg |
| Unaccounted relative to consumption | 2.646 − 1.234 | **1.412 kg** |

### Finance parity after the void

| Cost | Calculation | UI |
|---|---:|---:|
| Flour | 1.890 × £0.509874 | £0.9637 |
| Sugar | 0.756 × £0.822799 | £0.6220 |
| Materials | £0.9637 + £0.6220 | £1.5857 |
| Waste | displayed | £0.0737 |
| Total | £1.5857 + £0.0737 | £1.6594 |
| Cost/kg | £1.6594 / 1.111 kg | £1.4936/kg |

The post-void finance arithmetic is internally coherent. No process, setup,
machine, or downtime cost was present for this WO.

### Record lineage

- PO: `PO-R15-064445`
- GRN: `GRN-20260718-0002`
- Flour input LP: `LP-1784357298379-7Y37`; remaining 18.110 kg
- Sugar input LP: `LP-1784357336073-0JRO`; remaining 9.244 kg
- Parent WO: `WO-202607-0037`
- Executed child WO: `WO-202607-0037-W1`
- Retained output LP: `LP-1784358325131-DZ8G`; 1.111 kg, Received, QA pending
- Voided output LP: `LP-1784358365451-QLLR`; Destroyed, 0.000000 kg

## 5. Prior-fix regression coverage

### Confirmed

- Exact fractional material consumption is accepted without rounding to zero.
- QA release and owned LP metadata edits persist.
- WO start and completion timestamps persist across a full revisit.
- Low-yield completion is blocked and exposes the reason/e-sign override UI.
- An invalid e-signature leaves lifecycle state unchanged.
- Valid completion double-submit produced one lifecycle transition/event.
- Signed output void creates an auditable reversal ledger and destroys the
  reversed LP rather than silently deleting history.
- Finance materials, waste, total, output denominator, and cost/kg reconcile
  after the reversal.

### Previously known behavior, not counted as new

Selecting a non-FEFO owned flour LP initially returned the generic message
`The action could not be completed`. This reproduces the already-owned
PF-R14-01 behavior and is recorded only as confirmation:
`evidence/pf-r15-01-fefo-generic-error.png`.

## 6. Cleanup, remaining artifacts, and limitations

- All created records use marker `NIGHT-R15-20260718T064445Z`.
- Input LPs retain only the unconsumed quantities.
- The retained output LP remains as a real auditable inventory record:
  1.111 kg, Received, QA pending.
- The voided output LP is safely Destroyed with zero balance.
- Child WO remains Completed because PF-R15-01 is the finding under test.
- Parent `WO-202607-0037` remains Draft. Cancellation was explicitly blocked
  because its chain contains execution/output activity; no destructive bypass
  was attempted.
- No cross-site switch was performed.
- No product/source files, migrations, commits, or deployment state were
  modified.

## 7. Finding counts

| Severity | New findings |
|---|---:|
| P0 | 0 |
| P1 | **1** |
| P2 | 0 |
| P3 | 0 |
| Total | **1** |

Evidence files:

- `evidence/r15-yield-gate-blocked.png`
- `evidence/pf-r15-01-post-complete-output-void.png`
- `evidence/pf-r15-01-fefo-generic-error.png` — prior-finding confirmation only
