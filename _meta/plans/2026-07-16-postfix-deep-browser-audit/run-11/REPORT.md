# RUN 11/20 — WO chain creation, editing, release and dependency integrity

## 1. Deployment, marker and verdict

- Production target: `https://monopilot-kira.vercel.app`
- Expected deployment from dispatch: `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm`
- Expected SHA from dispatch: `2eb57cf7b90c23d4c55afeb01116eaabc3250385`
- Exact owned marker: `NIGHT-R11-2222`
- Organization: Apex 22
- Initial and final site filter: `Main Factory`
- Browser path: installed Playwright MCP fallback, used only after the in-app Browser runtime returned no available browsers.
- Verdict: **FAIL — 1 P1 + 2 P2 findings.** Quantity propagation, material resnapshot, dependency relinking, release ordering, duplicate-release protection and chain cancellation worked. Parent date propagation, child audit history and direct-link site filtering did not.

Owned records:

| Role | WO | ID | Final state |
|---|---|---|---|
| FG parent | `WO-202607-0030` | `853bbb5a-02cb-4a56-84e2-0680e14f0162` | Cancelled |
| WIP child | `WO-202607-0030-W1` | `2c4dea11-437b-4c1c-9d79-d8ea0526a893` | Cancelled |

## 2. Scenario matrix

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| R11-S01 | Login and open Planning WO create flow | PASS | `evidence/R11-01-dashboard-after-login.yml`, `evidence/R11-02-wo-create-modal-initial.yml` |
| R11-S02 | Select released FG and inspect chain preview | PASS | `evidence/R11-03-product-picker.yml`, `evidence/R11-04-chain-preview.png` |
| R11-S03 | Create 12.345 kg FG parent and materialize WIP child | PASS | `evidence/R11-05-create-result.yml` |
| R11-S04 | Verify pinned BOM/spec, material snapshot and dependency | PASS | `evidence/R11-06-parent-detail-created.yml`, `evidence/R11-07-parent-dependencies-created.yml` |
| R11-S05 | Direct deep link to child, pinned WIP BOM and material snapshot | PASS | `evidence/R11-08-child-direct-deeplink.yml`, `evidence/R11-09-child-dependency-created.yml` |
| R11-S06 | Draft edit 12.345→14.875 kg, LINE03→LINE1; propagate/relink/resnapshot | PASS | `evidence/R11-10-edit-draft-modal.yml`, `evidence/R11-11-parent-after-draft-edit.yml`, `evidence/R11-12-child-after-parent-edit.yml`, `evidence/R11-13-chain-after-edit-dependency.yml` |
| R11-S07 | Draft parent civil date Jul 25→Jul 26 propagates to child | **FAIL** | `evidence/R11-11-parent-after-draft-edit.yml`, `evidence/R11-12-child-after-parent-edit.yml` |
| R11-S08 | Derived child quantity edit is visible in child audit history | **FAIL** | `evidence/R11-08-child-direct-deeplink.yml`, `evidence/R11-12-child-after-parent-edit.yml`, `evidence/R11-21-child-after-cancel-direct.yml` |
| R11-S09 | Reject positive quantity with more than 3 decimals without mutation | PASS | `evidence/R11-14-high-precision-rejected.yml` |
| R11-S10 | Parent release is blocked until upstream WIP is released | PASS | `evidence/R11-15-parent-after-release.yml` |
| R11-S11 | Release child then parent; double-click parent release is idempotent | PASS | `evidence/R11-16-child-released.yml`, `evidence/R11-17-parent-released-doubleclick.yml`, `evidence/R11-18-parent-state-history-release.yml` |
| R11-S12 | Edit/release controls disappear after release | PASS | `evidence/R11-16-child-released.yml`, `evidence/R11-17-parent-released-doubleclick.yml` |
| R11-S13 | Cancel released chain, retain lineage/materials, prevent repeat cancel | PASS | `evidence/R11-19-cancel-chain-list.yml`, `evidence/R11-20-parent-after-cancel-direct.yml`, `evidence/R11-21-child-after-cancel-direct.yml` |
| R11-S14 | Active site filter applies equally to WO list and direct detail | **FAIL** | `evidence/R11-22-cross-site-deeplink-filter.yml`, `evidence/R11-24-tester1-list-without-owned-chain.yml`, `evidence/R11-25-final-site-reset.yml` |
| R11-S15 | Delete an unreleased draft chain | NOT RUN | The owned chain was intentionally taken through release/cancel; no second setup was created solely for destructive duplication. |
| R11-S16 | Invalid production yield / completion gate | NOT RUN | No safe owned material LPs were available in this planning-only chain run; production execution was not bypassed. |

## 3. Findings

### PF-R11-01 — P1 — Editing the FG parent scheduled date leaves the child WIP on the old date

- URL:
  - Parent: `https://monopilot-kira.vercel.app/en/planning/work-orders/853bbb5a-02cb-4a56-84e2-0680e14f0162`
  - Child: `https://monopilot-kira.vercel.app/en/planning/work-orders/2c4dea11-437b-4c1c-9d79-d8ea0526a893`
- Reproduction:
  1. Under `Main Factory`, create FG0014 for 12.345 kg with scheduled start 2026-07-25.
  2. Confirm both generated WOs show Jul 25.
  3. Edit the parent to 14.875 kg, scheduled start 2026-07-26 and LINE1.
  4. Hard-navigate to both direct detail URLs.
- Expected: The linked child is rescheduled consistently with the edited parent, or the UI explicitly requests/maintains a defined dependency lag. A chain created with the same civil date must not silently split dates after the parent edit.
- Actual:
  - Parent persisted `Jul 26, 2026, 12:00 AM`.
  - Child persisted `Jul 25, 2026, 12:00 AM`.
  - Quantity, materials and dependency required quantity did propagate, isolating the failure to schedule metadata.
- Persistence: Reproduced on direct hard navigation after the edit and remained visible after release and cancellation.
- Business impact: Planning, scanner ordering, Gantt/capacity and shop-floor preparation can execute the WIP stage a day apart from the edited FG plan without warning.
- Evidence:
  - `evidence/R11-11-parent-after-draft-edit.yml`
  - `evidence/R11-12-child-after-parent-edit.yml`
  - `evidence/R11-19-cancel-chain-list.yml`
- Confirmed current-source root cause:
  - `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/update-work-order.ts:277` loads chain edges only for a quantity edit.
  - The parent timestamp is updated at `update-work-order.ts:312`.
  - Child propagation is called only under `input.plannedQuantity !== undefined` at `update-work-order.ts:389`.
  - `apps/web/lib/planning/wo-chain-qty-sync.ts:332` updates only child `planned_quantity`, `updated_by` and `updated_at`; it never updates `scheduled_start_time`.
- Minimal fix direction: In the same transaction, preflight the editable chain for a scheduled-date edit and propagate the defined date/lag contract to children; add a live-shaped regression covering date-only and combined qty+date edits.

### PF-R11-02 — P2 — Automatic child quantity propagation leaves no child `update` history entry

- URL: `https://monopilot-kira.vercel.app/en/planning/work-orders/2c4dea11-437b-4c1c-9d79-d8ea0526a893`
- Reproduction:
  1. Create the chain: child planned quantity is 10.370 kg and its State history count is 1 (`create`).
  2. Edit parent quantity 12.345→14.875 kg.
  3. Open child directly: quantity is now 12.495 kg, but State history count remains 1.
  4. Release and cancel the child: final State history count is 3 (`create`, `release`, `cancel`), still with no `update`.
- Expected: A server-driven material change to a WO records an auditable `Draft→Draft / update` entry with parent WO, old/new quantity and relink context.
- Actual: The child business row and material snapshot change, but the child history has no record of the update.
- Persistence: Confirmed after direct reload and again in the terminal Cancelled state.
- Business impact: Operators and auditors cannot reconstruct why or when the child WO quantity changed; the parent history alone does not identify the child old/new values.
- Evidence:
  - `evidence/R11-08-child-direct-deeplink.yml`
  - `evidence/R11-12-child-after-parent-edit.yml`
  - `evidence/R11-21-child-after-cancel-direct.yml`
- Confirmed current-source root cause: `apps/web/lib/planning/wo-chain-qty-sync.ts:332-342` updates `public.work_orders` directly; the propagation function contains no insert into `public.wo_status_history`.
- Minimal fix direction: Insert one child `Draft→Draft / update` history row in the same propagation transaction, including parent ID, old/new quantity and material-link replacement.

### PF-R11-03 — P2 — WO direct detail bypasses the active site filter used by the WO list

- URL:
  - List: `https://monopilot-kira.vercel.app/en/planning/work-orders`
  - Direct child detail: `https://monopilot-kira.vercel.app/en/planning/work-orders/2c4dea11-437b-4c1c-9d79-d8ea0526a893`
- Reproduction:
  1. Create the owned chain while `Main Factory` is selected.
  2. Switch the site selector to `tester1`.
  3. On the list, search/inspect: neither owned WO is present.
  4. Navigate directly to the known child URL while `tester1` remains selected.
- Expected: The top-bar contract says it filters work orders; direct WO detail should return not-found/permission-denied for a WO outside the active site, or clearly switch the site context.
- Actual: The `tester1` list filters the Main Factory WOs out, but the direct detail renders the full Main Factory child under the `tester1` selector.
- Persistence: Reproduced after full navigation. Resetting to Main Factory restores the records to the list.
- Business impact: Users can inspect a WO inconsistent with their active operational context, creating wrong-site decision and mutation risk. This run used an org admin and did not attempt a cross-site mutation, so this is classified P2 rather than an authorization P0/P1.
- Evidence:
  - `evidence/R11-22-cross-site-deeplink-filter.yml`
  - `evidence/R11-24-tester1-list-without-owned-chain.yml`
  - `evidence/R11-25-final-site-reset.yml`
- Confirmed current-source root cause:
  - `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/listPlanningWorkOrders.ts:64-67` loads `getActiveSiteId` and passes it into list filters.
  - `apps/web/app/[locale]/(app)/(modules)/planning/work-orders/_actions/getPlanningWorkOrder.ts:24-50` filters only by `org_id + id`; it neither selects nor filters `wo.site_id`.
- Minimal fix direction: Apply the same active-site predicate to detail loading (including dependent reads) and return a typed not-found/forbidden result when the WO is outside the selected site.

## 4. Manual calculations and lineage

### Create

Input:

`FG0014 parent = 12.345 kg`

Preview WIP fraction:

`12.345 × 0.84 = 10.3698 kg`

Persisted/displayed:

- Child WO: 10.370 kg
- Parent WIP material: 10.370 kg
- Dependency required quantity: 10.370 kg
- Display rounding delta: `10.3700 - 10.3698 = +0.0002 kg` at the configured 3-decimal WO precision.

Other parent materials:

- RM-BUTTER: `12.345 × 0.16 = 1.9752 kg` → 1.975 kg
- PM-BOX: 51.979 each
- LAB-001: 329.200 each

Child WIP materials:

- ING-FLOUR: `10.3698 × 0.15 = 1.55547 kg` → 1.555 kg
- ING-SUGAR: `10.3698 × 0.06 = 0.622188 kg` → 0.622 kg

### After parent edit

Input:

`FG0014 parent = 14.875 kg`

Expected/persisted WIP:

`14.875 × 0.84 = 12.495 kg`

All three persisted surfaces matched exactly:

- Child WO planned quantity: 12.495 kg
- Parent WIP material: 12.495 kg
- Dependency required quantity: 12.495 kg

Other parent materials:

- RM-BUTTER: `14.875 × 0.16 = 2.380 kg` → 2.380 kg
- PM-BOX: 62.632 each
- LAB-001: 396.667 each

Child materials:

- ING-FLOUR: `12.495 × 0.15 = 1.87425 kg` → 1.874 kg
- ING-SUGAR: `12.495 × 0.06 = 0.74970 kg` → 0.750 kg

Lineage/relink:

- Child WO ID remained `2c4dea11-437b-4c1c-9d79-d8ea0526a893` — no stale/orphan replacement WO was visible.
- Dependency count remained exactly 1.
- Dependency material link changed from `40d26e08-ab80-4d69-a4ee-e6bc5dce9783` to `cdb2d435-52c5-42ac-a439-45ff2e04f45b`, matching parent material resnapshot/relink.
- Parent BOM remained version 3 and factory spec remained version 4 during this edit.
- Child BOM remained version 1.

## 5. Prior fixes opportunistically confirmed

- Parent quantity edit propagated to the existing child rather than creating a stale replacement.
- Dependency required quantity and material link were rebuilt consistently in one visible chain.
- Parent and child material snapshots reconciled to the edited quantities.
- The UI-facing entered quantity/unit reconciled: reopening the edit form showed 14.875 kg after save/reload.
- Parent civil date round-tripped as Jul 26 with no ±1-day shift.
- High precision `0.0004` was rejected with `Enter a positive quantity (up to 3 decimals).`; the saved 14.875 kg remained unchanged.
- Parent release before child was blocked with the exact prerequisite WO number.
- Child-first then parent release succeeded.
- A double-click on parent Release produced one confirmation and one `release` state-history row.
- Release/Edit controls disappeared after release.
- Chain cancellation moved both linked WOs to Cancelled while retaining BOM/material/dependency lineage.

Version-lock limitation: the pinned versions remained stable through the edit, but no safe owned active BOM/spec version change was available during the run, so rebinding behavior under a concurrently newer active master version was not proven.

## 6. Cleanup, retained artifacts and limitations

- Both owned WOs were cancelled through the UI.
- They were intentionally retained because deletion after release would destroy audit/chain evidence and no delete surface is offered in the terminal state.
- Final site filter was reset to `Main Factory`.
- No foreign WO or master-data record was mutated.
- No direct API, Server Action, SQL write, DB manipulation, code edit, commit, build, typecheck, install or deployment was performed.
- Source inspection was read-only and started only after browser reproduction.
- Delete-draft behavior and production invalid-yield completion were not run; see R11-S15/S16.
- The detail page does not display the WO site, so site ownership was inferred from creation under Main Factory plus list filtering.

## 7. Counts

- Scenario rows: 16
- Scenarios attempted: 14
- PASS: 11
- FAIL: 3
- BLOCKED: 0
- NOT RUN: 2
- Findings: 3
  - P0: 0
  - P1: 1
  - P2: 2
  - P3: 0

