# RUN 13/20 — Production execution state machine and downtime

## Deployment and verdict

- Production: `https://monopilot-kira.vercel.app`
- Expected deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Deployment state supplied by the campaign gate: `READY`
- Organization/site: `Apex 22` / `Main Factory`; `All sites` and `tester1` were exercised and `Main Factory` was restored.
- Run marker: `NIGHT-R13-20260718T0542Z`
- Verdict: **FAIL — 2 P1 defects and 1 P2 defect reproduced on production.**

Owned chain:

| WO | Product | Planned qty | Line | Final state | Purpose |
|---|---|---:|---|---|---|
| `WO-202607-0035-W1` | `WIP-20260707-0006` | 10.370 kg | `LINE02` | Cancelled | execution, downtime, e-sign and audit |
| `WO-202607-0035` | `FG0014` | 12.345 kg | `LINE03` | Cancelled | dependency and illegal-start gate |

## Scenario results

| ID | Scenario | Result | Evidence / observation |
|---|---|---|---|
| S13-01 | Login, org and explicit-site context | PASS | Apex 22 / Main Factory on the live deployment. |
| S13-02 | Production dashboard load and one fresh retry | **FAIL** | `/en/production` returned only `Live production data is currently unavailable. Please retry shortly.` on three separated visits; `evidence/S13-02-production-dashboard-unavailable.png`. |
| S13-03 | Owned WO-chain create, quantity lineage and child-first release | PASS | Root `0035`, child `0035-W1`; exact WIP requirement retained and both released. |
| S13-04 | Illegal parent start before upstream WIP completion | PASS | Server returned `Upstream WIP work order(s) must finish ... WO-202607-0035-W1`; parent did not start. |
| S13-05 | Child Start with LINE02, AM Shift and double-submit | PASS | One transition only: event count `2→3`, status In progress, Actual start `2026-07-18 05:47`. |
| S13-06 | Pause with reason, line, shift, notes and double-submit | PASS | One pause event and one open downtime only: Equipment breakdown, LINE02, AM Shift, started `05:48`. |
| S13-07 | Resume duration boundaries: negative and zero | **FAIL** | `-1` was silently converted to timestamp mode; explicit `0` persisted a canonical `05:52→05:52, 0m` downtime event; `evidence/S13-06-zero-minute-downtime.png`. |
| S13-08 | Resume, refresh/revisit and timestamp persistence | PASS | Actual start remained `05:47`; first downtime closed `05:48→05:50, 2m`; status and counts survived revisit. |
| S13-09 | Output-less Complete gate and invalid e-sign | PASS | 0% output triggered `Yield gate: blocked — supervisor override required`; missing inputs disabled Confirm and an invalid credential returned `Invalid password or PIN`; no transition was appended. |
| S13-10 | Timeline/audit idempotence | PASS | Create, release, start, pause, resume, pause, resume appeared exactly once each; `evidence/S13-07-event-log-once.png`. |
| S13-11 | OEE read-only surface and site filtering | PASS | In-progress owned WO produced no completed-WO snapshot. Main Factory showed 2 snapshots; All sites showed 3; no duplicate snapshot was observed. |
| S13-12 | Explicit-site list/detail scope | **FAIL — known duplicate** | With site set to `tester1`, the Main Factory child remained fully visible by direct detail URL. This independently reconfirms `PF-R11-03`; it is not counted as a new Run-13 finding. |
| S13-13 | Cancel cleanup and terminal elapsed freeze | **FAIL** | Both WOs cancelled, but the child header kept increasing from Elapsed 9 min to 10 min after terminal cancellation; `evidence/S13-09-cancelled-elapsed-keeps-running.png` and `evidence/S13-10-cleanup-cancelled.png`. |

## Findings

### PF-R13-01 — P1 — Production dashboard is unavailable while its WO sub-route remains usable

- URL: `https://monopilot-kira.vercel.app/en/production`
- Reproduction:
  1. Log in to Apex 22 with Main Factory selected.
  2. Open **Production** from the primary navigation.
  3. Observe the error-only page.
  4. Reload once and revisit after completing the execution checks.
- Expected: live production KPIs, lines, WO list, output, OEE and downtime load; a failure in one optional tile should not suppress every other production surface.
- Actual: all three visits rendered only `Live production data is currently unavailable. Please retry shortly.` The direct `/en/production/wos` list and owned WO detail remained operational.
- Business impact: the primary shop-floor production dashboard is unusable even though execution data is available; operators lose line status, open-downtime and WO visibility from the main entry point.
- Persistence: reproduced on an immediate retry and again about twelve minutes later.
- Evidence: `evidence/S13-02-production-dashboard-unavailable.png`.
- Likely source:
  - `apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts:126` executes every dashboard query inside one all-or-nothing function.
  - `apps/web/app/[locale]/(app)/(modules)/production/_actions/dashboard-data.ts:347` catches any one query failure and returns the undifferentiated `reason: 'error'`.
  - `apps/web/app/[locale]/(app)/(modules)/production/page.tsx:105` replaces the full dashboard with the generic banner. The exact failing SQL statement requires the correlated production runtime error.
- Suggested fix: identify and repair the failing aggregate query from the runtime digest, then isolate non-critical KPI failures so the WO list and healthy tiles remain available with an honest per-tile error.

### PF-R13-02 — P1 — Cancelled WO elapsed time continues increasing forever

- URL: `https://monopilot-kira.vercel.app/en/production/wos/bcf62e5b-b251-4962-ab2a-beba69c17f61`
- Reproduction:
  1. Start `WO-202607-0035-W1` at `05:47`.
  2. Pause/resume twice.
  3. Cancel it through the production UI with reason `AUDIT_CLEANUP`.
  4. Revisit the cancelled detail.
  5. Observe Elapsed `9 min`; keep the detail open and observe it advance to `10 min`.
- Expected: terminal cancellation freezes elapsed time at the cancellation timestamp; elapsed must never grow after the WO can no longer execute.
- Actual: status is Cancelled but Elapsed continues to use the current clock and increments indefinitely.
- Business impact: cancelled execution duration, labor/capacity interpretation and any downstream cycle-time analysis become progressively false. Old cancelled WOs will appear to have run for days or years.
- Persistence: reproduced after direct revisit and a subsequent live refresh interval.
- Evidence:
  - `evidence/S13-09-cancelled-elapsed-keeps-running.png`
  - `evidence/S13-10-cleanup-cancelled.png`
- Root cause: `apps/web/app/[locale]/(app)/(modules)/production/_actions/get-work-order-detail.ts:751-755` uses `Date.now()` whenever `completed_at` is null. Cancelled executions have no `completed_at`, and the calculation does not use a terminal/cancelled timestamp.
- Suggested fix: persist/read the terminal event timestamp and use it as the elapsed end for Cancelled; use `Date.now()` only for In progress/Paused. Add a regression proving repeated reads of a cancelled WO return an identical elapsed value.

### PF-R13-03 — P2 — Resume accepts a zero-minute stop and persists it as canonical downtime

- URL: `https://monopilot-kira.vercel.app/en/production/wos/bcf62e5b-b251-4962-ab2a-beba69c17f61`
- Reproduction:
  1. Pause an in-progress WO with reason `Operator break`.
  2. Immediately click Resume.
  3. Enter `0` in **Actual downtime (minutes)** and Confirm.
  4. Open the Downtime tab.
- Expected: non-positive values are rejected with a validation error, or an elapsed-time close must require a positive measured duration before emitting a canonical downtime event.
- Actual: Confirm succeeds and stores `Operator break · 2026-07-18 05:52 → 05:52 · 0m`; normal pause and resume audit events are also emitted. Entering `-1` likewise produced no validation error and silently fell back to timestamp mode.
- Business impact: zero-length stops pollute stop counts, downtime Pareto frequency and MTBF/MTTR/event-based analytics even though they contribute no unavailable minutes.
- Persistence: row and both audit transitions remained after revisit and after WO cancellation.
- Evidence:
  - `evidence/S13-06-zero-minute-downtime.png`
  - `evidence/S13-07-event-log-once.png`
- Root cause:
  - `apps/web/app/[locale]/(app)/(modules)/production/wos/_components/modals/shared.tsx:265` converts every invalid/non-positive entered value to `null` instead of blocking submission.
  - The HTML `min={1}` at line 283 is advisory; Confirm remains enabled.
  - `apps/web/app/[locale]/(app)/(modules)/production/work-orders/[id]/resume/route.ts:8` accepts null as timestamp mode.
  - `packages/db/schema/production/downtime-events.ts:47` truncates sub-minute intervals to integer zero.
- Suggested fix: distinguish blank from invalid input. Reject any nonblank value that is not a positive integer, and prevent closing a newly opened event while its generated duration is zero unless the user explicitly discards the pause instead of recording downtime.

## Manual calculations and lineage

1. WIP materialization:
   - Parent input: `12.345 kg`.
   - Recipe factor: `84%`.
   - Exact expected child: `12.345 × 0.84 = 10.3698 kg`.
   - Stored/displayed: `10.370 kg`.
   - Display rounding delta: `+0.0002 kg` at 3 decimals; correct.
2. First downtime:
   - Start `05:48`, end `05:50`.
   - Expected: `(05:50 − 05:48) = 2 min`.
   - Displayed: `2m`; delta `0`.
3. Second downtime:
   - Start `05:52`, end `05:52`.
   - Expected for a canonical recorded stop: `>0 min`.
   - Displayed/persisted: `0m`; invalid boundary accepted.
4. Execution clock before cancellation:
   - Actual start: `05:47`.
   - At `05:52`, wall elapsed displayed `5 min`.
   - Closed downtime: `2 + 0 = 2 min`.
   - Approximate active run time at that point: `5 − 2 = 3 min`.
5. Terminal clock:
   - After cancellation the value changed from `9 min` to `10 min`.
   - Expected delta after terminal transition: `0 min`.
   - Actual observed delta: `+1 min` over the observation interval and unbounded thereafter.
6. OEE site lineage:
   - Main Factory: 2 completed-WO snapshots.
   - All sites: 3.
   - Additional non-Main-Factory rows: `3 − 2 = 1`; site aggregation behaved consistently.

## Prior fixes opportunistically confirmed

- WIP→FG dependency gate blocks the parent until its exact child has produced.
- Start, Pause and Resume double interactions append only one transition each.
- `started_at` persists after refresh/revisit.
- Pause requires a real downtime taxonomy row and retains line, shift and marker notes.
- Output-less completion is blocked rather than silently completing at 0% yield.
- Invalid e-sign credentials are rejected server-side and append no completion event.
- Main Factory vs All-sites OEE counts differ consistently and the in-progress WO does not create a completed snapshot.
- `PF-R11-03` (direct WO detail bypasses the active site filter) is still reproducible; not duplicated in Run-13 counts.

## Cleanup and limitations

- Cancelled through UI: `WO-202607-0035-W1` and `WO-202607-0035`.
- Retained intentionally: cancelled WO history, two downtime rows and execution events. They are canonical audit/genealogy records and have no safe delete UI.
- Site filter restored to Main Factory.
- No foreign/seed record was mutated.
- No direct Server Action, REST or SQL write was used.
- Operator assignment was not exposed in the Start/Pause dialogs; no foreign operator or settings fixture was mutated.
- A valid supervisor override was deliberately not used: doing so would complete an output-less WO and weaken cleanup. The missing/invalid e-sign paths were exercised.
- The dashboard's exact failing SQL statement was not available from the visible browser error; the report does not speculate beyond the all-or-nothing loader boundary.

## Counts

- Scenarios listed: 13
- PASS: 9
- FAIL: 4 scenario checks, including one independently reconfirmed prior finding
- BLOCKED: 0
- NOT RUN: 0
- New findings: **3 total — P0 0 · P1 2 · P2 1 · P3 0**

