# Run 20/20 — Maintenance plus global CRUD and consistency crawl

## Deployment, verdict and ownership

- Production: `https://monopilot-kira.vercel.app`
- Expected and locally confirmed deployment SHA: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Expected Vercel deployment: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Owned marker: `NIGHT-R20-20260718T102013Z`
- Verdict: **FAIL — 1 P0, 3 P1 and 3 P2 findings**
- Browser method: the required in-app-browser setup returned no available browser, so the authorized Playwright MCP fallback was used. All product mutations were made through visible production UI. No database/API writes, product edits, commits or deploys were made.

The main safety result is a live LOTO bypass: one signer can mark zero-energy lockout verified and start a LOTO-required MWO, although the binding maintenance contract requires a paired, distinct-person `dualSign` for LOTO apply. The server did correctly enforce a different signer for LOTO release and refused completion before release.

## Scenario ledger

| ID | Scenario | Status | Evidence / result |
|---|---|---|---|
| S01 | Production deployment, login and organization context | PASS | Authenticated production session; local tree matched the expected SHA. |
| S02 | Create owned asset and rapidly repeat Save | PASS | Exactly one `NIGHT-R20-20260718T102013Z-AST` row persisted. |
| S03 | Asset edit, safety-flag correction, deactivate/reactivate and delete/archive | FAIL | No row action, detail link or lifecycle control exists; [asset register](evidence/PF-R20-01-asset-registry-no-actions.png). |
| S04 | Create owned MWO and rapidly repeat Create | PASS | Exactly one `MWO-2026-00003` persisted. |
| S05 | Edit MWO title, description and due date; fresh navigation persistence | PASS | Title, description and due date `2026-08-01` persisted. This confirms the C120 edit-path fix. |
| S06 | Assign mechanic and pause/resume MWO | BLOCKED | The owned detail exposed Start/Complete/Cancel and LOTO controls, but no assignment or pause/resume surface. No unsafe workaround was used. |
| S07 | Reject invalid LOTO credential | PASS | Invalid credential was rejected and the MWO remained Open. |
| S08 | Apply LOTO with distinct zero-energy verifier and isolation steps | FAIL | One credential immediately activated LOTO and enabled Start; no second verifier or isolation-step capture existed; [LOTO state](evidence/PF-R20-02-loto-single-signer-no-steps.png). |
| S09 | Start only after LOTO gate | PASS core | Start became available after the single-sign apply and the MWO persisted as In progress. The apply gate itself is unsafe per S08. |
| S10 | Complete while LOTO remains active | PASS | Server rejected completion with “LOTO release verification is required before completing work.” |
| S11 | Release LOTO with the lockout signer | PASS | Server rejected the same actor: release signer must be distinct. |
| S12 | Release with an authorized second person | BLOCKED | No second authorized credential was provided. The active safety lock was retained. |
| S13 | Cancel/close/reopen/void after safe release | BLOCKED | Safe release was unavailable, so destructive lifecycle testing stopped. |
| S14 | PM schedule list/empty state | PASS | The PM tab rendered an honest empty state. |
| S15 | PM schedule create/edit, recurrence, next-due and generated MWO | FAIL | UI explicitly says the PM engine/editor arrives later; [PM stub](evidence/PF-R20-03-pm-schedules-stub.png). |
| S16 | Instrument required fields and interval lower bound | PASS | Interval `0` was rejected; a valid 31-day instrument persisted. |
| S17 | Instrument range invariant (`min <= max`) | FAIL | `10.0000 - 0.0000 kg` was accepted and persisted; [reversed range](evidence/PF-R20-04-calibration-reversed-range.png). |
| S18 | Correct range/decimal edit | PASS | Corrected range `-0.5000 - 100.0100 kg` and interval `31` persisted exactly. |
| S19 | Calibration same-actor separation of duties and atomic failure | PASS | Same actor was rejected and no record/next-due state persisted. C115 is confirmed. |
| S20 | Valid calibration dual sign with an independent reviewer | BLOCKED | Form requires an opaque reviewer UUID and exposes no reviewer picker; [dead-end form](evidence/PF-R20-05-calibration-reviewer-uuid-dead-end.png). |
| S21 | C119 fresh-list update after valid calibration | BLOCKED | No valid two-person record could be created, so stale-refresh behavior could not be retested. |
| S22 | Deactivate owned calibration instrument during cleanup | PASS | Instrument now shows Out of service; [cleanup state](evidence/R20-cleanup-instrument-out-of-service.png). |
| S23 | Read-only crawl of every main navigation module | PASS | Dashboard, Settings/Users/D365, NPD, Planning, Freight, Scheduler, Production, Yard, Warehouse, Scanner, Quality, Shipping, Technical, Finance, OEE, Maintenance, Reporting and Multi-Site were opened. |
| S24 | Broad non-maintenance create/detail/edit mutation crawl | NOT RUN | The run stopped new scenarios within its timebox and did not mutate foreign or cross-module data. |
| S25 | D365 export-only UI boundary | FAIL | Inbound pull/polling/import concepts remain advertised, although controls/actions are currently blocked; [settings](evidence/PF-R20-06-d365-import-config.png), [Planning control](evidence/PF-R20-06-d365-pull-control.png). |
| S26 | Multi-Site inventory quantity/UOM consistency | FAIL | A unitless total sums raw LP quantities across UOMs; [Multi-Site KPI](evidence/PF-R20-07-multi-site-unitless-inventory.png). |

Counts: **26 total; 25 attempted; 14 PASS; 6 FAIL; 5 BLOCKED; 1 NOT RUN**.

## Findings

### PF-R20-02 — P0 — A single signer can verify zero energy and start a LOTO-required MWO

Reproduction:

1. Create an owned asset with LOTO required.
2. Create and open an owned MWO for that asset.
3. Choose Apply LOTO.
4. Enter only the current operator's valid credential. There is no isolation checklist, second-user selector or second credential.
5. Observe “LOTO active — zero-energy lockout verified” and start the MWO.
6. Navigate away and back; the MWO remains In progress with LOTO active.

Expected: LOTO apply must invoke a paired `dualSign`: the first person applies the lockout and a distinct second person verifies the zero-energy state. Isolation steps must be captured before the start gate opens.

Actual: one `signEvent` is accepted as the complete zero-energy verification. Start is then allowed. The owned MWO remains in that unsafe persisted state. Release behaves better: the same signer was rejected, and completion was refused until release.

Impact: this bypasses the OSHA-critical two-person verification contract and can authorize maintenance work without independent proof of isolation. It is a life-safety and regulatory defect, not merely missing UI.

Root cause: [`mwo-actions.ts`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts#L1054) calls single-signer `signEvent` and writes `zero_energy_verified_by = ctx.userId`; the transition gate only checks that this one field exists. The distinct-actor check exists later for release, not for apply. Evidence: [single-sign active state](evidence/PF-R20-02-loto-single-signer-no-steps.png), [retained final state](evidence/R20-cleanup-retained-loto-mwo.png).

Suggested fix: replace apply with server-side `dualSign` over one immutable LOTO subject, require distinct active signers/sessions, persist both receipt IDs plus completed isolation steps, and open Start only after the paired attestation commits atomically. Add a real-DB test proving one signature cannot set the gate.

### PF-R20-04 — P1 — Calibration instruments accept an inverted measurement range

Reproduction:

1. Add an instrument with interval `31`, range minimum `10.0000`, range maximum `0.0000`, UOM `kg`.
2. Save.
3. Observe the persisted row `10.0000 - 0.0000 kg`.

Expected: the server rejects `rangeMin > rangeMax` with an actionable validation message.

Actual: the inverted range persisted. It was subsequently corrected to `-0.5000 - 100.0100 kg` and the instrument was deactivated.

Impact: an impossible operating range can enter a safety/quality master record and undermine due/calibration decisions and audit evidence.

Root cause: [`calibration-schemas.ts`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_types/calibration-schemas.ts#L24) validates each endpoint only as an optional numeric string; there is no cross-field refinement. The client in [`instrument-form-modal.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_components/instrument-form-modal.tsx#L109) similarly checks only code and interval. Evidence: [persisted inverted range](evidence/PF-R20-04-calibration-reversed-range.png).

Suggested fix: parse both endpoints as exact decimals and add a server-authoritative `rangeMin <= rangeMax` refinement, with boundary/equality/negative/precision tests and a clear field-level error.

### PF-R20-05 — P1 — Valid calibration dual-sign is a reviewer-UUID dead end

Reproduction:

1. Open Record calibration and select the owned instrument.
2. Enter date `2026-07-18`, result Pass and a valid measured-values JSON payload.
3. Reach the reviewer field. The production form asks for a reviewer user ID/UUID rather than offering active eligible users.
4. Use the current user's ID to test separation of duties; the server correctly rejects it and persists no calibration record.

Expected: an authorized calibrator can select an independent, active, eligible reviewer by human-readable identity and complete the paired e-sign flow. The UI must not require operators to discover internal UUIDs.

Actual: the form exposes a plain monospaced reviewer-ID textbox and raw/humanized technical labels. No valid reviewer-discovery path exists in the modal. A valid record was blocked without a pre-known internal UUID and separate authorized credential.

Impact: the mandatory FDA/BRCGS dual-witness workflow is effectively unusable for normal operators, so calibration evidence and next-due state cannot be recorded through the supported UI.

Root cause: [`record-calibration-modal.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/calibration/_components/record-calibration-modal.tsx#L232) renders `reviewerUserId` as an unconstrained text input. The server-side same-actor/atomic guard is working and is not the defect. Evidence: [reviewer dead end](evidence/PF-R20-05-calibration-reviewer-uuid-dead-end.png).

Suggested fix: load only active, authorized, non-self reviewers under org context; render a searchable shadcn Select/combobox showing name/email but submit the UUID; keep both credentials ephemeral; map SoD and eligibility failures to actionable localized messages.

### PF-R20-07 — P1 — Multi-Site adds unlike quantities into a unitless inventory total

Reproduction:

1. Open Multi-Site.
2. Observe `Aggregated inventory 3289.663001` with no UOM or normalization explanation.
3. Compare with Warehouse Reporting, which explicitly limits its quantity total to kg LPs because mixed UOM cannot be summed.

Expected: inventory is grouped by UOM, converted through an approved exact conversion into a named base UOM, or omitted when quantities are dimensionally incompatible.

Actual: a single unitless total is displayed.

Impact: a network inventory KPI can silently combine kilograms, pieces and other units, producing a numerically precise but dimensionally meaningless value for operational decisions.

Root cause: [`multi-site/page.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx#L91) executes `sum(lp.quantity)` over all active LPs without joining/grouping by UOM or applying conversions, and renders the result without a unit at line 165. Evidence: [unitless aggregate](evidence/PF-R20-07-multi-site-unitless-inventory.png).

Suggested fix: return exact totals by UOM, or normalize only with explicit approved conversion lineage; label every total with its unit and add mixed-UOM tests.

### PF-R20-01 — P2 — The asset register creates safety-critical records but provides no correction or retirement path

Reproduction:

1. Create `NIGHT-R20-20260718T102013Z-AST` with LOTO and calibration required.
2. Refresh the asset register.
3. Inspect and activate the row/code.

Expected: authorized users can open/edit the asset, correct LOTO/calibration flags and deactivate/reactivate or safely archive it.

Actual: the table has no Actions column, links or row interaction. The only mutation is Add asset.

Impact: erroneous safety flags or obsolete equipment remain active and selectable for MWOs. This also prevented full cleanup of the owned asset.

Root cause: [`asset-register.client.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_components/asset-register.client.tsx#L108) exposes only Add; rows at lines 144–165 are plain cells and the only modal is create. Evidence: [asset register](evidence/PF-R20-01-asset-registry-no-actions.png).

Suggested fix: add permission-gated detail/edit and deactivate/reactivate/archive actions, forbid hard delete when referenced, record audit/outbox events and remove inactive assets from new-MWO selection.

### PF-R20-03 — P2 — Preventive maintenance is a read-only placeholder, so recurrence cannot be managed

Reproduction:

1. Open Maintenance.
2. Switch to PM schedules.
3. Observe the empty state and explicit message that the PM engine and schedule editor arrive later.

Expected: authorized users can create/edit/deactivate schedules, define recurrence, inspect the calculated next due date and generate a due MWO idempotently.

Actual: only a read-only list/generate-from-existing shape exists; with no schedules, there is no supported way to create one or exercise recurrence.

Impact: preventive work cannot be configured in production, leaving Maintenance limited to reactive work and blocking required due-date/recurrence validation.

Root cause: [`mwo-list.client.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/maintenance/_components/mwo-list.client.tsx#L161) documents “no schedule editor yet”; the screen only passes existing rows to `PmScheduleList`. Evidence: [PM placeholder](evidence/PF-R20-03-pm-schedules-stub.png).

Suggested fix: ship PM schedule CRUD with exact recurrence semantics, timezone-safe next-due calculation, inactive-equipment handling and idempotent generation tests before exposing the PM feature as production-ready.

### PF-R20-06 — P2 — Production UI advertises forbidden D365 pull/import concepts despite export-only enforcement

Reproduction:

1. Open Planning and observe disabled `Trigger D365 pull`.
2. Open Settings → D365 connection.
3. Observe “polling schedule,” `Pull cron schedule`, `Integration enabled`, and the `D365 cost import` navigation item.

Expected: every production surface describes and configures only Monopilot → D365 export. Forbidden inbound behavior should not appear as a future or configurable capability.

Actual: inbound pull/polling/import language is prominent. No inbound mutation was performed: Planning is hard-disabled, connection prerequisites prevent enablement, and the cost-import server action returns `export_only_violation`.

Impact: administrators are directed toward a prohibited integration direction, and the retained `pull_cron` configuration model creates a high-risk future implementation seam even though current server enforcement prevents cost import.

Root cause: legacy parity and sync settings still carry pull concepts. [`header-actions.tsx`](../../../../../../apps/web/app/[locale]/(app)/(modules)/planning/_components/header-actions.tsx#L39) deliberately renders the disabled pull control, while D365 sync configuration retains `pull_cron`. The good server boundary is [`export-only-policy.ts`](../../../../../../apps/web/actions/d365/export-only-policy.ts#L19), where `isCostImportPermitted()` is constant false. Evidence: [D365 settings](evidence/PF-R20-06-d365-import-config.png), [disabled Planning control](evidence/PF-R20-06-d365-pull-control.png).

Suggested fix: remove inbound labels/routes/config fields from production UI and model; rename remaining schedules to outbound queue/export semantics; retain the server deny guard and add a navigation/content test asserting no inbound D365 capability is advertised.

## Manual calculations and lineage

### Calibration

- Rejected invariant that should have been enforced: `10.0000 > 0.0000`; displayed span is `0.0000 - 10.0000 = -10.0000 kg`, therefore invalid.
- Corrected exact range: `-0.5000 <= 100.0100`; span `100.0100 - (-0.5000) = 100.5100 kg`.
- Interval `31` from calibration date `2026-07-18` would produce expected next due `2026-08-18`. No valid record was persisted, so the UI correctly remained Never / No record / No due date.
- Test point: reference `100.0000 kg`, measured `100.0099`; delta `+0.0099 kg`; relative error `0.0099 / 100.0000 × 100 = 0.0099%`, within the entered `0.01%` tolerance. The valid measurement could not be signed by two authorized people.

### MWO / LOTO

- Lineage: asset `NIGHT-R20-20260718T102013Z-AST` → `MWO-2026-00003` → active LOTO checklist.
- State: Open → In progress after the single-sign apply.
- Edited due date persisted exactly as `2026-08-01`.
- Same-actor release was rejected, and completion while release was absent was rejected. No unsafe direct write or foreign-account workaround was attempted.

### Global read consistency

- Production dashboard still returned “Live production data is currently unavailable,” matching prior PF-R13-01.
- Warehouse still displayed the known civil-day expiry off-by-one/missing traceability behavior from PF-R08-07/PF-R08-08; not recounted.
- Finance still omitted currency on actual-cost amounts, matching PF-R19-01; not recounted.
- OEE honestly rendered Performance/OEE as `—` where the basis was absent, consistent with Run 19.
- Reporting yield reconciled: `(20.02% + 3.00%) / 2 = 11.51%`.

## Prior fixes confirmed or blocked

- **C115 calibration distinct approver / atomic rollback: confirmed.** Same actor was rejected; instrument remained Never / No record / No due date.
- **C119 calibration list refresh: blocked.** No authorized second reviewer was available, so a valid new record could not be created.
- **C120 MWO edit path: confirmed.** Title, description and due date survived fresh navigation.
- Asset create path delivered by the prior maintenance slice: confirmed for create and duplicate-submit protection, but lifecycle CRUD remains absent.
- Production dashboard prior PF-R13-01: still present.

## Cleanup, retained artifacts and limitations

- Deactivated owned calibration instrument `NIGHT-R20-20260718T102013Z-CAL`; final state Out of service.
- No calibration record was created.
- Retained owned asset `NIGHT-R20-20260718T102013Z-AST` as Active because the UI provides no deactivate/archive/delete action (PF-R20-01).
- **Retained `MWO-2026-00003` In progress with LOTO active.** A safe clear requires a different authorized signer. The same signer was correctly rejected; cancel/close was not forced. This is an intentionally retained safety state, not forgotten cleanup.
- No PM schedule was created.
- No foreign records were mutated.
- Scanner redirected to its separate PIN login; no PIN setup/login mutation was attempted.
- Browser console evidence contained only a favicon `404`; no application runtime console error was observed: [console log](evidence/R20-console-errors.txt).
- The global crawl emphasized route/runtime/stub/consistency basics. Broad mutations outside the owned Maintenance records were intentionally not run.

## Totals

- Scenarios: **26 total; 25 attempted**
- Outcomes: **14 PASS / 6 FAIL / 5 BLOCKED / 1 NOT RUN**
- Findings: **7 total — P0: 1 / P1: 3 / P2: 3 / P3: 0**

