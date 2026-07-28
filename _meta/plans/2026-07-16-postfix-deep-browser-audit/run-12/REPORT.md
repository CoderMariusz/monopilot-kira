# RUN 12/20 — Scheduler capacity, dependencies and temporal edges

## Deployment and verdict

- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Deployment state supplied by the campaign gate: `READY`
- Organization/site: `Apex 22` / `Main Factory`; `All sites` was exercised and the original site was restored.
- Run marker: `NIGHT-R12-20260718T050612Z`
- Verdict: **FAIL — 2 fresh P1 scheduler/capacity defects reproduced on production.**

The releaseable owned chain was:

| WO | Product | Qty | Line | Status during test | Dependency |
|---|---|---:|---|---|---|
| `WO-202607-0034-W1` | `WIP-20260707-0006` | 12.600 kg | `LINE02` | Released | upstream producer |
| `WO-202607-0034` | `FG0014` | 15.000 kg | `LINE03` | Released | requires 12.600 kg from child |

Three additional owned draft WOs (`0031`–`0033`) were used to exercise release guards and were deleted during cleanup.

## Scenario results

| ID | Scenario | Result | Evidence / observation |
|---|---|---|---|
| S12-01 | Production login, org and selected site | PASS | Live `/en/dashboard`, Apex 22, Main Factory. |
| S12-02 | Create/editable owned WO inputs with high-precision quantities | PASS | `0031` 12.345 kg, `0032` 27.500 kg, `0033` 9.876 kg, then releaseable `0034` 15.000 kg; final state in `evidence/S12-10-cleanup.png`. |
| S12-03 | Release guard for products without active BOM/factory spec | PASS | `0031`–`0033` remained Draft; current UI returned `Factory spec or active BOM missing — generate and complete the factory spec in Technical before release.` |
| S12-04 | Child-first release then parent release | PASS | `0034-W1` and `0034` both reached Released; parent dependency was retained in `evidence/S12-05-dependency-present.png`. |
| S12-05 | Scheduler math and cross-line dependency ordering | **FAIL** | Both dependent WOs were proposed for the same 60-minute interval; `evidence/S12-04-scheduler-proposal.png`. |
| S12-06 | Fresh revisit/rerun determinism for dependency ordering | **FAIL** | Fresh revisit reproduced simultaneous `05:23→06:23` intervals; `evidence/S12-07-revisit-overlap.png`. |
| S12-07 | All-sites vs explicit-site scope and infeasible isolation | PASS | All-sites added one foreign read-only infeasible WO while both feasible owned WOs remained assigned; `evidence/S12-08-all-sites-isolation.png`. |
| S12-08 | Capacity reconciliation after scheduler proposal/rerun | **FAIL** | One 60-minute WO on each owned line displayed as `2h`; `evidence/S12-09-capacity-double-count.png`. |
| S12-09 | Apply schedule / e-sign / SoD | BLOCKED | The same single admin created and attempted to approve the run; server-side same-actor SoD prevents using this account to prove publish persistence. No defect claimed for the unchanged WO start/end after the attempt. |
| S12-10 | Shift, zero-capacity, PM and DST-boundary scheduling | BLOCKED | The tested lines displayed `No daily cap/day`; no owned shift/PM/line fixtures existed and foreign master data was not mutated. |
| S12-11 | Line deactivation while referenced | NOT RUN | Would require mutating a foreign production line or building a larger owned line/site fixture after the closeout threshold. |
| S12-12 | CRUD cleanup and site restoration | PASS | `0031`–`0033` deleted, `0034` chain cancelled, Main Factory restored; `evidence/S12-10-cleanup.png`. |

## Findings

### PF-R12-01 — P1 — Scheduler runs dependent WIP and FG work orders simultaneously

- URL: `https://monopilot-kira.vercel.app/en/scheduler`
- Reproduction:
  1. Under Main Factory create FG WO `WO-202607-0034` for 15.000 kg of `FG0014` on `LINE03`, scheduled Jul 18.
  2. Confirm the materializer creates child `WO-202607-0034-W1` for 12.600 kg on `LINE02`.
  3. Release the child, then release the parent.
  4. On the parent, open **Dependencies** and confirm one upstream dependency requiring 12.600 kg.
  5. Run the scheduler with the 7-day horizon.
  6. Revisit `/en/scheduler` and run it again.
- Expected:
  - The child must complete before the parent begins: `parent.start >= child.end`.
  - With a 60-minute child starting at 05:21, the earliest valid parent start is 06:21.
- Actual:
  - First run: child `05:21→06:21` and parent `05:21→06:21`.
  - Fresh revisit: child `05:23→06:23` and parent `05:23→06:23`.
  - The dependency exists in the WO UI but has no scheduling effect.
- Manual equation:
  - Child duration: `06:21 − 05:21 = 60 min`.
  - Required dependency lag: `parent.start − child.end >= 0 min`.
  - Actual: `05:21 − 06:21 = −60 min` (**60 minutes too early**).
- Business impact: the published plan can start FG consumption before its WIP exists, creating an impossible production sequence and invalid material availability.
- Persistence: reproduced after a fresh navigation and rerun.
- Evidence:
  - `evidence/S12-04-scheduler-proposal.png`
  - `evidence/S12-05-dependency-present.png`
  - `evidence/S12-07-revisit-overlap.png`
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/scheduler-actions.ts:1049` loads WOs, matrix, occupancy and shift calendar, but not `wo_dependencies`.
  - `apps/web/app/[locale]/(app)/(modules)/scheduler/_actions/sequence-solver.ts:562` places WOs using per-line end/capacity state; it has no dependency graph or predecessor-end constraint.
- Suggested fix: load org-scoped WO dependencies for the candidate set, topologically order the graph, and pass each predecessor's planned end as the dependent WO's earliest start; reject/report cycles and infeasible dependency chains.

### PF-R12-02 — P1 — Capacity adds a WO's current slot and its draft scheduler alternative

- URL: `https://monopilot-kira.vercel.app/en/scheduler/capacity`
- Reproduction:
  1. Release the `0034-W1`/`0034` chain.
  2. Run the scheduler, attempt apply as the same actor (SoD correctly prevents publish), then rerun.
  3. Open **Scheduler → Capacity**.
- Expected:
  - A draft assignment is an alternative placement for the same WO, not an additional physical job.
  - Each line contains one 60-minute owned WO, so occupancy attributable to it should be `1h`, not `2h`.
- Actual:
  - `LINE02` Jul 18: `2h`.
  - `LINE03` Jul 18: `2h`.
  - The page sums the released WO's existing one-hour fallback window and the latest draft assignment for the same `wo_id`.
- Manual equation:
  - Real job capacity: `60 min / 60 = 1.00 h`.
  - Displayed: `1.00 h (WO) + 1.00 h (draft alternative) = 2.00 h`.
  - Delta: `+1.00 h`, or **+100%** per line.
- Business impact: capacity is overstated, utilisation becomes false, and otherwise feasible work can be rejected or pushed out.
- Persistence: present after route navigation and page reload; both tested lines showed the same error.
- Evidence: `evidence/S12-09-capacity-double-count.png`.
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/scheduler/capacity/_actions/capacity-loaders.ts:155` unions WO and draft intervals.
  - Lines `218–236` deduplicate drafts only against other drafts by `wo_id`; they never replace/exclude the corresponding WO interval.
- Suggested fix: model draft rows as alternatives keyed by `wo_id`; when a draft exists, either replace that WO's current interval in the proposal view or expose WO/draft scenarios separately, never add both to physical occupancy.

## Manual calculations and lineage

1. Child assignment:
   - Input: 12.600 kg WIP on LINE02.
   - Displayed interval: 05:21–06:21.
   - Duration: `(06:21 − 05:21) = 60 min`.
   - Implied rate: `12.600 / 60 = 0.210 kg/min = 12.600 kg/h`.
2. Parent assignment:
   - Input: 15.000 kg FG on LINE03.
   - Displayed interval: 05:21–06:21.
   - Duration: `60 min`.
   - Implied rate: `15.000 / 60 = 0.250 kg/min = 15.000 kg/h`.
3. Dependency:
   - Parent requires 12.600 kg from the child.
   - Minimum valid parent start: child end, 06:21.
   - Actual parent start: 05:21; delta `−60 min`.
4. Capacity:
   - One 60-minute WO per tested line should occupy 1.00 h.
   - Capacity page displayed 2.00 h per line; delta `+1.00 h` / `+100%`.
5. Changeover:
   - Both assignments carried allergen group `gluten`; total displayed changeover cost was `0`.
   - A non-zero owned matrix transition was not created, so no claim is made about changeover-minute arithmetic.
6. Daily available minutes:
   - Capacity UI showed `No daily cap/day`; therefore an exact shift/zero-capacity denominator could not be truthfully reconciled in this run.

## Prior fixes opportunistically confirmed

- Parent creation still materializes the WIP child and exact `15.000 × 0.84 = 12.600 kg`.
- Child-first release gate works and both WOs retain a visible dependency.
- Products without an active BOM/factory spec fail loudly on release.
- An infeasible All-sites job is isolated without suppressing feasible owned assignments.
- Cancel-chain transitions both released WOs to Cancelled.
- Draft deletion works for all three owned no-BOM WOs.

## Cleanup and limitations

- Deleted through UI: `WO-202607-0031`, `WO-202607-0032`, `WO-202607-0033`.
- Cancelled through UI: `WO-202607-0034`, `WO-202607-0034-W1`.
- Retained intentionally: scheduler runs/assignments and cancelled WO audit history; no UI delete exists and removing audit evidence would be unsafe.
- Site filter restored to Main Factory.
- No foreign/seed record was mutated.
- Not fully exercised: owned shift calendars, zero-capacity days, PM windows, DST/midnight windows, line deactivation, second-approver/e-sign publish. These require owned master-data fixtures and/or a second authorized account.

## Counts

- Scenarios listed: 12
- PASS: 5
- FAIL: 3 scenario checks (2 unique findings)
- BLOCKED: 2
- NOT RUN: 1
- Findings: **2 total — P0 0 · P1 2 · P2 0 · P3 0**

