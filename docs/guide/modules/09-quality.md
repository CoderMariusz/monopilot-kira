# Quality — holds / NCR / inspections / specs / HACCP-CCP / cold-chain / recall (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module lives almost
> entirely in **one route group** — the desktop **Quality** screens under
> `…/(modules)/quality/**` — plus two satellites: the **GRN delivery-temperature**
> control surfaces in **Warehouse** (`/warehouse/grns/[grnId]`, wired via a
> page-local adapter that calls back into Quality), and a **scanner** QC fast-path
> (`POST /api/quality/scanner/inspect`). The **temperature-range master** is edited
> in **Settings** (`/settings/quality/temp-ranges`).
>
> 09-quality **owns** `quality_holds`, `ncr_reports`, `quality_inspections`,
> `quality_specifications`, the HACCP plan/CCP tables, `ccp_deviations`,
> `delivery_condition_checks`, `complaints`, `capa_actions` and `recall_drills`. It
> is the **producer** of the **T-064 consume gate** that 08-production reads on every
> consume/output/waste/complete path (a `quality_holds`/LP `qa_status` block). It
> never writes `wo_outputs` except to flip their `qa_status` (the hold/release seam).
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (E2A trace/recall, E2B cold-chain, E3 HACCP plans,
> complaints/CAPA, CCP-deviation register).

---

## a. Overview

The Quality module is the plant's **disposition authority**. It quarantines stock
and work (**holds**), formalizes problems (**NCR** → root cause → **CAPA**), gates
incoming/in-process/final material (**inspections**), defines the acceptance
criteria those inspections check against (**specifications**, versioned + e-signed),
governs food-safety control points (**HACCP plans → CCPs → monitoring readings →
deviations**), verifies delivery temperature (**cold-chain**), captures customer
**complaints**, and rehearses traceability under the clock (**recall drills /
trace**). Almost every terminal transition is a **CFR-21 Part 11 e-signature**
(`@monopilot/e-sign` `signEvent`, PIN/password verified server-side, immutable
`e_sign_log` row) — hold release, spec approval, HACCP plan activation, critical-NCR
close, inspection decision, CCP-deviation resolve, CAPA close.

The mechanism that makes Quality *bite* is the **LP `qa_status` machine** plus the
`quality_holds` table. A License Plate is born `qa_status='pending'`; placing a hold
or failing an inspection flips it to `on_hold`/`rejected` (which 08-production's
`holdsGuard` refuses to consume); releasing the hold (with a disposition) or passing
an inspection flips it to `released` (FEFO-consumable) or `rejected` (blocked). The
same hold path is reused by everything that detects a problem — a manual hold, an
inspection `hold`/`fail` decision, a CCP critical-limit breach, and an out-of-range
delivery temperature all converge on `quality_holds` + a `quality.hold.created`
outbox event, so a single release path unblocks them all.

The Server Actions live in `quality/_actions/*` (`hold-actions.ts`, `ncr-actions.ts`,
`inspection-actions.ts`, `spec-actions.ts`, `haccp-actions.ts` (CCP + monitoring),
`haccp-plan-actions.ts`, `ccp-deviation-actions.ts`, `cold-chain-actions.ts`,
`complaint-actions.ts`, `lookup-actions.ts`); recall/trace is
`quality/trace/_actions/trace-actions.ts`; the cold-chain settings master is
`cold-chain-actions.ts` too (`upsertProductTempRange`). The scanner QC fast-path is
`app/api/quality/scanner/inspect/route.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action — a missing permission returns a typed
> `{ ok:false, reason:'forbidden' }` (hold/ncr/inspection/spec/haccp/ccp families)
> or `{ ok:false, error:'forbidden' }` (cold-chain / complaint / trace families),
> **never a 500**. The scanner inspect route additionally requires the **scanner PIN
> session** (`requireScannerSession`) **and** re-checks `quality.inspection.execute`.
> All actions run inside `withOrgContext` (RLS `app.current_org_id()`).

### Holds — `quality/_actions/hold-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listHolds({status,referenceType,search,limit})` | List holds (Active/Released/All tab + reference-type filter + search on hold #/reference/LP/WO/GRN number). Resolves a human `referenceDisplay` and the reason label from `reference.quality_hold_reasons`. | reads `quality_holds`, `quality_hold_items`, `license_plates`, `items`, `work_orders`, `grns`, `reference_tables` | `quality.dashboard.view` | — (read) |
| `getHoldDetail(holdId)` | Header + held items (LP/qty/status) + linked NCRs for the detail screen. | reads `quality_holds`, `quality_hold_items`, `license_plates`, `items`, `ncr_reports` | `quality.dashboard.view` | — (read) |
| `createHold({referenceType,referenceId,reasonCodeId?,reasonText?,priority,lpIds?,estimatedReleaseAt?})` | Open a hold on an LP/batch/WO/PO/GRN. Inserts `quality_holds` (`hold_status='open'`), inserts a `quality_hold_items` row per LP, flips each non-terminal LP `qa_status='on_hold'`, and (for a `wo` reference) flips that WO's `wo_outputs.qa_status='ON_HOLD'`. Derives `default_hold_duration_days` from an explicit est-release date or the reason-code default. Emits `quality.hold.created`. | writes `quality_holds`, `quality_hold_items`, `license_plates`, `wo_outputs`, `outbox_events` | `quality.hold.create` | `releaseHold` |
| `releaseHold({holdId,disposition,reasonText,signature})` | **CFR-21 e-sign** (intent `qa.hold.release`). Row-locks the hold (already-released → error), records the disposition (`release`/`scrap`/`rework`/`partial`), updates `quality_hold_items` status, and flips held LPs' `qa_status` (`released` on release/rework/partial, `rejected` on scrap; `release` also restores a `blocked` LP to `available`) with an `lp_state_history` row each. Re-opens the WO outputs (`ON_HOLD → PENDING`) on a `wo` release. Emits `quality.hold.released`. | writes `quality_holds`, `quality_hold_items`, `license_plates`, `lp_state_history`, `wo_outputs`, `e_sign_log`, `outbox_events` | `quality.hold.release` | — (terminal; this **is** the reverse of `createHold`) |
| `releaseHoldFromWarehouseLpUnblock({lpId,reasonText})` | Warehouse-side "unblock LP" seam: finds the LP's latest active hold and releases it via the shared `releaseHoldCore` (no `signEvent` — a hashed subject stands in). LP must be `blocked` + `on_hold`. | same writes as `releaseHold` (minus `e_sign_log`) | `warehouse.lp.block` | — |

### NCR — `quality/_actions/ncr-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listNcrs({status,severity,ncrType,search,limit})` | NCR list (status/severity/type filters + search on #/title/description/product/hold). | reads `ncr_reports`, `items`, `quality_holds` | `quality.dashboard.view` | — (read) |
| `getNcrDetail(ncrId)` | NCR detail; when `reference_type='ccp_deviation'`, resolves the **CCP-breach context** (CCP code/limits/uom + measured value/time/reader) from `haccp_ccps` + the linked `haccp_monitoring_log`. | reads `ncr_reports`, `items`, `quality_holds`, `haccp_ccps`, `haccp_monitoring_log`, `users` | `quality.dashboard.view` | — (read) |
| `createNcr({ncrType,severity,title?,description?,referenceType?,referenceId?,productId?,affectedQtyKg?,linkedHoldId?})` | Insert an NCR (`status='open'`). Emits `quality.ncr.opened`. Also called internally by CCP-breach auto-NCR and complaint conversion. | writes `ncr_reports`, `outbox_events` | `quality.ncr.create` | `closeNcr` |
| `updateNcrInvestigation({ncrId,rootCause?,rootCauseCategory?,immediateAction?,correctiveAction?,capaRecordId?,assignedTo?,investigatorId?})` | Record investigation; bumps `open/draft/reopened → investigating`. Refuses on `closed`/`cancelled`. Emits `quality.ncr.updated`. | writes `ncr_reports`, `outbox_events` | `quality.ncr.create` | edit again (until closed) |
| `closeNcr({ncrId,resolution,signature?})` | Close an NCR. **Critical NCRs require `quality.ncr.close_critical` + a CFR-21 e-sign** (intent `qa.ncr.close`); minor/major close on `quality.ncr.create` without a signature. Row-locked; already-terminal → error. Emits `quality.ncr.closed`. | writes `ncr_reports`, `e_sign_log` (critical), `outbox_events` | `quality.ncr.create` (non-critical) **or** `quality.ncr.close_critical` (critical) | — (terminal; **no reopen action — see gaps**) |

### Inspections — `quality/_actions/inspection-actions.ts` + scanner `…/api/quality/scanner/inspect/route.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listInspections({status,search,limit})` | Inspection list (status tab + search on #/LP/GRN/WO/item); resolves `referenceDisplay` + assignee name. | reads `quality_inspections`, `license_plates`, `grns`, `wo_outputs`, `work_orders`, `items`, `users` | `quality.inspection.execute` | — (read) |
| `getInspectionDetail(inspectionId)` | Detail bundle incl. parsed parameters, decider/creator names, and a lateral-join to the latest **active hold** for the inspection's LP (deep-link, no FK). | reads `quality_inspections`, `license_plates`, `grns`, `wo_outputs`, `work_orders`, `items`, `users`, `quality_holds` | `quality.inspection.execute` | — (read) |
| `searchInspectionLps` / `resolveInspectionGrn` / `resolveInspectionWoOutput` / `searchInspectionAssignees` | Reference + assignee pickers for the create modal (LP autocomplete, GRN# → uuid, WO-output batch# → uuid, user autocomplete). | reads `license_plates`/`items`, `grns`, `wo_outputs`/`work_orders`, `users` | `quality.inspection.assign` | — (read) |
| `createInspection({referenceType,referenceId,productId?,assignedTo?,dueDate?,notes?})` | Open an inspection (`status='pending'`). `inspection_number` minted by `public.next_quality_inspection_number(org)` → **`INSP-NNNNNNNN`** (8-pad, no date part; mig 272). `revalidatePath('/quality')`. | writes `quality_inspections` | `quality.inspection.assign` | — (cancel only via DB; **no cancel action — see gaps**) |
| `recordInspectionResult({inspectionId,parameters[],notes?})` | Record per-parameter pass/fail + notes; `pending/in_progress → in_progress`. Parameters stored as JSONB. | writes `quality_inspections` | `quality.inspection.execute` | re-record (until decided) |
| `submitInspectionDecision({inspectionId,decision,signature,note?})` | **CFR-21 e-sign** (intent `qa.inspection.submit`). Row-locked; already-final → error. `pass → passed`, `fail → failed`, `hold → on_hold`. **LP side-effects (atomic):** `pass → qa_status='released'`, `fail → 'rejected'`, `hold → 'on_hold'` + opens a high-priority `quality_holds` (with item + `quality.hold.created` outbox). | writes `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `e_sign_log`, `outbox_events` | `quality.inspection.execute` | one-way (decision is final); reverse the LP state via a hold |
| Scanner inspect `POST …/api/quality/scanner/inspect` | Handheld QC fast-path. Mints an inspection (same INSP allocator) + applies the same LP decision side-effects (`release`/`reject`/open-hold). **Deliberately NO e-sign** (PIN-bound session is the identity; `signature_hash=NULL`). Idempotent on `scanner_audit_log(org_id, client_op_id)`; advisory-locked per LP + op-id. | writes `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log` | scanner PIN session + `quality.inspection.execute` | one-way |

### Specifications — `quality/_actions/spec-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listSpecs({status,search,limit})` / `getSpecDetail(specId)` | Spec list + detail (header + ordered parameters). | reads `quality_specifications`, `quality_spec_parameters`, `items` | `quality.dashboard.view` | — (read) |
| `createSpec({productId,specCode,parameters[]})` | Create a **draft** spec; `version` = `max(version)+1` for that product+code; inserts ≥1 `quality_spec_parameters` row (target/min/max/unit/critical, NUMERIC). | writes `quality_specifications`, `quality_spec_parameters` | `quality.spec.approve` | `supersedeSpec` |
| `submitSpecForReview({specId})` | `draft → under_review` (locks it for approval). | writes `quality_specifications` | `quality.spec.approve` | (no explicit un-submit) |
| `approveSpec({specId,signature})` | **CFR-21 e-sign** (intent `qa.spec.approve`). `under_review → active`; stamps approver + `approval_signature_hash`. Row-locked; must be `under_review`. | writes `quality_specifications`, `e_sign_log` | `quality.spec.approve` | `supersedeSpec` |
| `supersedeSpec({specId,bySpecId})` | `* → superseded`, recording the replacing spec id. | writes `quality_specifications` | `quality.spec.approve` | — (terminal) |

### HACCP plans — `quality/_actions/haccp-plan-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listHaccpPlans()` / `getHaccpPlan(id)` | Plans + their CCPs (grouped). | reads `haccp_plans`, `haccp_ccps` | `quality.haccp.plan_edit` | — (read) |
| `upsertHaccpPlan({id?,name,scopeType,scopeRef?,siteId?})` | Create (`status='draft'`, version 1) or amend a plan header. | writes `haccp_plans` | `quality.haccp.plan_edit` | edit again (draft) |
| `activateHaccpPlan(planId,{password})` | **CFR-21 e-sign** (intent `qa.haccp.plan.activate`). Supersedes any other `active` plan of the same name, then `* → active` (stamps approver). | writes `haccp_plans`, `e_sign_log` | `quality.haccp.plan_edit` | `newPlanVersion` |
| `newPlanVersion(planId)` | Clone an `active` plan into a new **draft** at `version+1`, copying its CCPs (codes suffixed `-vN`). | writes `haccp_plans`, `haccp_ccps` | `quality.haccp.plan_edit` | — |

### CCP + monitoring — `quality/_actions/haccp-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listCcps({activeOnly?})` / `listMonitoringLog({ccpId?,days?})` | CCP board + monitoring readings. **Read gate relaxed (P1):** `quality.haccp.plan_edit` **OR** `quality.ccp.deviation_override` (a reader who can record but not edit still sees the board). | reads `haccp_ccps`, `haccp_monitoring_log` | `plan_edit` OR `ccp.deviation_override` | — (read) |
| `upsertCcp({…})` | Create/edit a CCP (code/hazard/critical limits/frequency/corrective action; min≤max validated client+server). | writes `haccp_ccps` | `quality.haccp.plan_edit` | edit again |
| `recordMonitoring({ccpId,measuredValue,woId?,note?})` | Record a CCP reading (NUMERIC-exact compare vs limits). **In-limit:** just logs. **Out-of-limit (auto-cascade):** logs the breach, **auto-opens a critical NCR** (`reference_type='ccp_deviation'`, links `breach_ncr_id`), inserts a `ccp_deviations` row, and — if a `woId` resolves to a current output LP — opens a **critical `quality_holds`** on that LP + flips it `on_hold`. Emits `quality.ncr.opened` + `quality.hold.created`. Dedupes on an existing deviation for the same log. | reads `haccp_ccps`; writes `haccp_monitoring_log`, `ncr_reports`, `ccp_deviations`, `quality_holds`, `quality_hold_items`, `license_plates`, `outbox_events` | `quality.ccp.deviation_override` | `resolveCcpDeviation` |

### CCP deviations — `quality/_actions/ccp-deviations/… / _actions/ccp-deviation-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listCcpDeviations({status?})` / `getCcpDeviation(id)` | Deviation register (open/resolved), resolving the linked hold + opener/closer names. Read gate relaxed: `quality.dashboard.view` OR `quality.ccp.deviation_override`. | reads `ccp_deviations`, `haccp_ccps`, `quality_holds`, `license_plates`, `items`, `work_orders`, `grns`, `users` | `dashboard.view` OR `ccp.deviation_override` | — (read) |
| `resolveCcpDeviation(id,{actionTaken,disposition,signature})` | **CFR-21 e-sign** (intent `qa.haccp.ccp.deviation`). `open → resolved` (records action/disposition + `esign_ref`); if a hold is linked, **releases it** through `releaseHold` (disposition `release`, same signature). | writes `ccp_deviations`, `quality_holds` (+ release writes), `e_sign_log` | `quality.ccp.deviation_override` | — (terminal) |

### Cold-chain (delivery temperature) — `quality/_actions/cold-chain-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listProductTempRanges()` | Per-product temperature-range master (Settings → temp-ranges screen). | reads `product_temp_ranges`, `items` | `quality.coldchain.manage` | — (read) |
| `upsertProductTempRange({itemId,minTempC,maxTempC,requiresCheck})` | Create/edit a product's temp range (min≤max validated). | writes `product_temp_ranges` | `quality.coldchain.manage` | edit again |
| `submitConditionCheck({itemId,measuredTempC,grnItemId?,lpId?})` | **E2B** delivery-temperature check on a received GRN line (called from Warehouse via `cold-chain-adapter.ts`). Loads the item's range; if `requires_check` and the reading is out of bounds with an LP supplied, opens (or reuses, within 24h) a **critical `quality_holds`** via `createHold`. Records the check either way. | reads `product_temp_ranges`, `grn_items`, `license_plates`; writes `delivery_condition_checks`, `quality_holds` (on breach, via `createHold`) | `quality.coldchain.record` | hold release in Quality |

### Complaints + CAPA — `quality/_actions/complaint-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `createComplaint({customerId?,lpId?,batchRef?,description,severity})` | Log a customer complaint (`status='open'`); resolves customer/LP/batch display. | writes `complaints` | `quality.ncr.create` | (close via convert) |
| `listComplaints({status?})` / `getComplaint(id)` | Complaints register + detail. | reads `complaints`, `customers`, `license_plates` | `quality.dashboard.view` | — (read) |
| `convertComplaintToNcr(complaintId)` | Raise an NCR (`ncrType='complaint_related'`, severity mapped) from the complaint via `createNcr`, then links it + sets the complaint `status='converted'`. | reads `complaints`, `license_plates`; writes `complaints`, `ncr_reports`, `outbox_events` (via `createNcr`) | `quality.ncr.create` | — |
| `createCapaAction({sourceType,sourceId,actionType,description,ownerUserId?,dueDate?})` | Add a corrective/preventive CAPA action against a complaint or NCR (`status='open'`). | writes `capa_actions` | `quality.ncr.create` | `resolveCapaAction` |
| `listCapaActions({sourceType?,sourceId?,status?})` | CAPA list (filterable). | reads `capa_actions` | `quality.dashboard.view` | — (read) |
| `resolveCapaAction(id,{signature})` | **CFR-21 e-sign** (intent `qa.capa.close`). `* → closed` (records `esign_ref`). | writes `capa_actions`, `e_sign_log` | `quality.ncr.create` | — (terminal) |

### Trace + recall drills — `quality/trace/_actions/trace-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `runTraceReport({inputType,inputRef,direction})` | Walk the LP **genealogy** (`queryGenealogy`) up/down from an LP/batch/item seed; build a supplier→PO→GRN→LP→WO→output node/edge graph + a flat list + a kg roll-up. Read-only. | reads `license_plates`, `grn_items`, `grns`, `purchase_order_lines`, `purchase_orders`, `suppliers`, `wo_material_consumption`, `wo_outputs`, `work_orders`, `items`, `lp_genealogy` | `quality.dashboard.view` (TODO: dedicated `quality.trace.run`) | — (read) |
| `startRecallDrill({inputType,inputRef,direction,is_drill?})` | Insert a `recall_drills` row (`started_at`) and run the trace; returns `{drillId, report}` (for the timed-drill flow). | writes `recall_drills` (+ trace reads) | `quality.dashboard.view` | — |
| `completeRecallDrill(drillId,result)` | Stamp `completed_at` + GENERATED `duration_ms` + the result JSONB (measured against the 4h target). | writes `recall_drills` | `quality.dashboard.view` | — |
| `getRecallDrills()` / `getRecallDrill(id)` | Recall-drill list + detail. | reads `recall_drills` | `quality.dashboard.view` | — (read) |

### Lookups (modal helpers) — `quality/_actions/lookup-actions.ts`

| Action | What it does | Reads | Gate |
|---|---|---|---|
| `resolveLpByNumber` / `searchLps` / `resolveWoByNumber` / `resolveGrnByNumber` | Human LP/WO/GRN **number → uuid** resolution + LP autocomplete for the create-hold modal (operators never paste UUIDs). | `license_plates`, `items`, `work_orders`, `grns` | `quality.dashboard.view` |

**Action count inventoried: 40** (5 holds, 5 NCR, 8 inspections incl. scanner+4 pickers, 5 specs, 4 HACCP-plan, 3 CCP/monitoring, 3 CCP-deviation, 3 cold-chain, 6 complaints/CAPA, 5 trace/recall, 4 lookups). The disposition core is `createHold`/`releaseHold` + `submitInspectionDecision` + the spec approve + the `recordMonitoring` auto-cascade.

---

## c. State machine

### Hold lifecycle (`quality_holds.hold_status`, mig 197)

```
 open ──┬─► investigating ──┐
        ├─► escalated ──────┼──── releaseHold (e-sign + disposition) ──► released
        └─► quarantined ────┘                                            (terminal)
   (open / investigating / escalated / quarantined = ACTIVE)
```

| State | Meaning | Who writes it | Notes |
|---|---|---|---|
| `open` | Active hold (default on create) | `createHold` / inspection `hold` / CCP breach / cold-chain breach | The four active statuses (`open`/`investigating`/`escalated`/`quarantined`) are the **T-064 gate** — an LP under one of these has `qa_status='on_hold'` and is not consumable. |
| `investigating` / `escalated` / `quarantined` | Still active | (DB-level; no dedicated transition action) | All count as "active" in `listHolds` + the `v_active_holds` view (mig 197). |
| `released` | Disposed (terminal) | `releaseHold` (+ `releaseHoldFromWarehouseLpUnblock`, `resolveCcpDeviation`) | Disposition ∈ `release`/`scrap`/`rework`/`partial`; scrap → LP `rejected`, others → LP `released`. **No "un-release."** |

### NCR lifecycle (`ncr_reports.status`)

```
 open ──investigation──► investigating ──closeNcr (e-sign if critical)──► closed (terminal)
   │                                                                         ▲
   └─────────────────────────── closeNcr ────────────────────────────────────┘
```

| State | Legal transition | Who writes it | Notes |
|---|---|---|---|
| `open` | → `investigating` (record investigation) or → `closed` | `createNcr` / `recordMonitoring` (critical CCP breach) | CCP-breach NCRs are born `open`, `severity='critical'`, `reference_type='ccp_deviation'`. |
| `investigating` | → `closed` | `updateNcrInvestigation` | Root cause / immediate / corrective action + CAPA link. |
| `closed` | — (terminal) | `closeNcr` | **Critical** ⇒ `quality.ncr.close_critical` + CFR-21 e-sign; otherwise `quality.ncr.create`, no sig. |
| `draft` / `reopened` / `awaiting_capa` / `cancelled` | declared in the type | — | **Present in the enum/type but no action writes them — see gaps (no reopen/cancel/draft path).** |

### Inspection lifecycle (`quality_inspections.status`, mig 272)

```
 pending ──record──► in_progress ──submitDecision (e-sign)──┬─► passed   (LP released)
   │                                                        ├─► failed   (LP rejected)
   └──────────────── submitDecision ───────────────────────┴─► on_hold  (LP on_hold + new hold)
                                                              (passed/failed/on_hold/cancelled = final)
```

| State | Legal next | Who writes it | LP side-effect |
|---|---|---|---|
| `pending` | `in_progress` (record), or a direct decision | `createInspection` | — |
| `in_progress` | `passed`/`failed`/`on_hold` | `recordInspectionResult` | — |
| `passed` | — (final) | `submitInspectionDecision` (`pass`) | LP `qa_status='released'` (FEFO-consumable) |
| `failed` | — (final) | `submitInspectionDecision` (`fail`) | LP `qa_status='rejected'` |
| `on_hold` | — (final) | `submitInspectionDecision` (`hold`) | LP `qa_status='on_hold'` + a new `quality_holds` opened |
| `cancelled` | — (final) | (no action; reserved) | — |

### Spec lifecycle (`quality_specifications.status`)

```
 draft ──submit──► under_review ──approve (e-sign)──► active ──supersede──► superseded
                                                         │                   (terminal)
                                                         └── (expired) ───────┘
```

| State | Legal next | Who writes it | Notes |
|---|---|---|---|
| `draft` | `under_review` | `createSpec` → `submitSpecForReview` | Editable only as draft (creation; no separate line-edit action). |
| `under_review` | `active` | `approveSpec` | **CFR-21 e-sign required** to go active. |
| `active` | `superseded` | `supersedeSpec` | A new approved version supersedes the old one. |
| `superseded` / `expired` | — (terminal) | `supersedeSpec` / (DB) | Immutable. |

### LP `qa_status` through Quality (the T-064 gate)

```
pending ──createHold / inspection hold / CCP breach / cold-chain breach──► on_hold
   │                                                                          │ releaseHold(release/rework/partial)
   │  inspection pass ──► released (FEFO-consumable)                          ▼
   │  inspection fail / hold-scrap ──► rejected (blocked)                 released / rejected
```

The machine is enforced **server-side inside each action** (status pre-checks +
`for update` row locks + `status <> all(TERMINAL_LP_STATUSES)` guards), and the UI
renders only legal/permitted buttons (`canRelease`, `canEdit*` resolved server-side
and passed into the client islands). Terminal states have **no successors**; a wrong
hold release / inspection decision is not reversible in place — you re-hold the LP.

<!-- screenshot: quality/holds list (Active/Released tabs + Create hold) -->
<!-- screenshot: quality/holds/[holdId] detail (held items + Release hold + signed banner) -->
<!-- screenshot: quality/inspections/[inspectionId] detail (parameters + Pass/Fail + e-sign) -->
<!-- screenshot: quality/specifications/[specId] detail (parameters + Approve specification) -->
<!-- screenshot: quality/ccp-monitoring board (CCP cards + Record reading) -->

---

## d. User how-tos

> Button labels below are the literal English copy: holds/NCR/inspections/specs come
> from the staged bundles `_meta/i18n-staging/quality-{holds,ncrs,inspections,specs}.json`;
> HACCP/CCP/deviations/complaints/trace come from the live next-intl `quality.*`
> namespace (`apps/web/i18n/en.json`). `data-testid`s in parentheses are the stable
> anchors in the component code.

### (i) Place a hold + release it (with e-sign)

1. Go to **Quality → Holds** (`/quality/holds`). Click **"Create hold"**
   (`holds-create-open`).
2. In the create modal (`hold-create-modal.client.tsx`):
   - **Reference type** (`hold-create-reftype-{lp|batch|wo|po|grn}`).
   - For **LP**: type the LP number / item code in the **"License plate"** search
     (`hold-create-lp-search`, `searchLps`) and pick a match — **no UUIDs**. For
     **WO/GRN/PO/batch** paste the number (resolved on submit via `resolveWoByNumber`/
     `resolveGrnByNumber`). Optionally add **Additional LPs** (one per line).
   - **Reason** (`hold-create-reason`), **Priority** (`hold-create-priority-{p}`),
     optional **Estimated release date**.
   - Submit (**"Create hold"**) → `createHold`. The held LP(s) flip to `on_hold` and
     drop out of FEFO consumption immediately.
3. To release: open the hold (`/quality/holds/[holdId]`) and click **"Release hold"**
   (in the Actions card; hidden once released).
4. In the release modal (`hold-release-modal.client.tsx`): pick a **Disposition**
   (**Release as-is** / **Scrap** / **Rework** / **Partial release** — must not be
   Pending), write **Release notes**, and enter your **account password** under
   **"Electronic signature (21 CFR Part 11)"**. Submit (**"Release hold"**) →
   `releaseHold`. A signed, immutable banner replaces the actions; **Scrap** rejects
   the LP, the others release it back to consumable.

### (ii) Open + close an NCR

1. **Quality → NCRs** (`/quality/ncrs`) → **"Create NCR"** (`ncrs-create-open`).
2. In the create modal: pick **NCR type** and **Severity** (sets the BRCGS response
   window: critical 24h / major 48h / minor 7 days), write a **Title** + **Description**
   (min 20 chars), optionally link a **hold** (type its number) and an **affected qty**.
   Submit (**"Create NCR"**) → `createNcr`. The NCR opens.
3. On the detail screen, fill the **Investigation** section (root cause, root-cause
   category, immediate action) and click **"Save changes"** →
   `updateNcrInvestigation` (the NCR moves to *investigating*). Add **CAPA** actions
   from the CAPA card (`createCapaAction`).
4. To close: click **"Close NCR"**. Write **Closure notes** (min 10 chars). If the
   NCR is **critical**, the **"Electronic signature (21 CFR Part 11)"** block appears
   and a closure password is required (`quality.ncr.close_critical`); minor/major
   close without a signature. Submit (**"Close NCR"**) → `closeNcr` — closure is
   immutable.

### (iii) Run an inspection

1. **Quality → Inspections** (`/quality/inspections`) → **"New inspection"**.
2. In the create modal: choose **Reference type** (**License plate** / **GRN** /
   **WO output**), pick/resolve the reference (LP search, GRN number, or WO-output
   batch number), optionally **Assign to** an inspector and set a **Due date**.
   Submit (**"Create inspection"**) → `createInspection` (number `INSP-NNNNNNNN`).
3. Open the inspection (`/quality/inspections/[inspectionId]`). Under **Test
   Parameters** enter each parameter's **actual** value and mark **Pass**/**Fail**,
   then **"Save results"** → `recordInspectionResult` (status → *in progress*).
4. Make the call in the **Decision** card: choose **Pass** / **Fail**, enter your
   **account password** under **"Electronic signature (21 CFR Part 11)"**, and
   **"Sign & submit"** → `submitInspectionDecision`. **Pass** releases the LP
   (consumable); **Fail** rejects it; a **Hold** decision opens a quality hold.
   *(Shop floor:* the scanner QC tile posts to `/api/quality/scanner/inspect` and
   records the same decision **without** an e-sign — the PIN session is the identity.)*

### (iv) Create + approve a specification

1. **Quality → Specifications** (`/quality/specifications`) → **"Create
   specification"**.
2. In the create modal: **Select product**, set a **Spec code** (unique per
   product + applies-to), and **"+ Add parameter"** rows (name, **Type**
   visual/measurement/attribute/microbiological/chemical/sensory/equipment, target/
   min/max/unit, **Critical** flag — Min ≤ Max enforced). Submit (**"Create
   specification"**) → `createSpec`. The spec is created as **draft v1** (or the next
   version for that product+code).
3. On the detail screen, click **"Submit for review"** (`submitSpecForReview`) →
   *under review* (locked).
4. Click **"🔒 Approve specification"**. Work through the pre-approval checklist,
   enter your **account password** under the e-signature block, and submit
   (**"🔒 Approve specification"**) → `approveSpec`. The spec goes **active**
   (CFR-21-signed). Later, **"Supersede"** points it at a newer version
   (`supersedeSpec`).

### (v) Record a cold-chain delivery-temperature check

1. **Prerequisite (Settings → Quality → Temperature ranges,
   `/settings/quality/temp-ranges`):** add the product's range with
   `upsertProductTempRange` (min/max °C + **requires check**).
2. On the **GRN detail** (`/warehouse/grns/[grnId]`), each received line shows a
   compact **°C input + Record** control (`grn-temp-check.client.tsx`,
   `grn-temp-check-submit-…`). Enter the measured temperature and click **Record** →
   `submitConditionCheck` (via the warehouse `cold-chain-adapter.ts`).
3. The result renders **green "in range"** or **red "out of range → quality hold
   created"**: an out-of-bounds reading (with an LP and a configured range) opens a
   **critical** `quality_holds` on that LP (reused within 24h), and the
   `delivery_condition_checks` row is written either way. Release the hold from
   **Quality → Holds** as in (i).

### (vi) Run a recall drill

1. **Quality → Trace & recall** (`/quality/trace`). Pick an **input type**
   (**License plate** / **Batch** / **Item**), type the reference, choose a
   **Direction** (**Backward** / **Forward** / **Both**), and click **"Run trace"**
   → `runTraceReport`. The genealogy graph + flat list + summary render (supplier →
   PO → GRN → LP → WO → output, with a kg roll-up).
2. To time a drill, click **"Save as drill"** → `startRecallDrill` (inserts a
   `recall_drills` row and stamps `started_at`); the resulting report is captured via
   `completeRecallDrill`, which records the start-to-complete **duration** against the
   **4h target**.
3. Review past drills under **Quality → Recall drills** (`/quality/recall-drills`,
   **"New drill"** deep-links back to trace); each row shows **Within target** /
   **Over target** and its duration, drillable to `/quality/recall-drills/[drillId]`.

### (vii) Bonus: HACCP plan → CCP reading → resolve a deviation

1. **Quality → HACCP Plans** (`/quality/haccp`) → **"New plan"** (`upsertHaccpPlan`),
   add CCPs (**"Add CCP"**, `upsertCcp`), then **"Sign & activate"** the plan
   (`activateHaccpPlan`, CFR-21 e-sign).
2. **Quality → CCP Monitoring** (`/quality/ccp-monitoring`) → **"Record reading"**:
   pick a CCP, enter the measured value (optionally link a WO), submit (**"Record
   reading"**) → `recordMonitoring`. An out-of-limit value **auto-opens a critical
   NCR** ("Out of limit — NCR opened", **View NCR**) and, if a WO output LP is found,
   a critical hold.
3. **Quality → CCP deviations** (`/quality/ccp-deviations`): on an open deviation
   click **"Resolve"**, record the **Corrective action** + **Disposition**, enter
   your **Sign-off PIN**, and submit (**"Resolve deviation"**) → `resolveCcpDeviation`
   (CFR-21 e-sign; auto-releases the linked hold).

---

## e. Data sources (Supabase tables)

Holds / NCR / inspections / specs (09-quality canonical):

- `quality_holds` + `quality_hold_items` — hold header (status/priority/disposition/release signature) + held LP rows (mig 197).
- `ncr_reports` — NCR header (type/severity/status, reference, root cause, CAPA link, closure signature).
- `quality_inspections` — inspection header (`INSP-NNNNNNNN`, reference, JSONB parameters, decision + signature; mig 272).
- `quality_specifications` + `quality_spec_parameters` — versioned spec header + parameters (NUMERIC target/min/max).

HACCP / CCP / deviations:

- `haccp_plans` — plan header (scope, version, status, approver).
- `haccp_ccps` — CCPs (hazard, critical_limit_min/max, unit, frequency, corrective action, plan link).
- `haccp_monitoring_log` — CCP readings (`measured_value`, `within_limits`, `breach_ncr_id`; mig 289).
- `ccp_deviations` — out-of-limit deviation register (action/disposition, hold link, `esign_ref`).

Cold-chain / complaints / CAPA / recall:

- `product_temp_ranges` — per-product min/max °C + `requires_check` (cold-chain master).
- `delivery_condition_checks` — recorded delivery-temperature checks (in_range, reason, hold link; E2B).
- `complaints` — customer complaints (customer/LP/batch, severity, status, NCR link).
- `capa_actions` — corrective/preventive actions against a complaint/NCR (`esign_ref`).
- `recall_drills` — saved trace runs (`started_at`/`completed_at`/`duration_ms`, result JSONB; E2A).

Reference / cross-module (read, plus the qa side-effects):

- `license_plates` + `lp_state_history` — the T-064 `qa_status` gate (Quality flips on_hold/released/rejected; consumed by 05-warehouse + 08-production).
- `lp_genealogy` — trace/recall genealogy walk (`queryGenealogy`).
- `wo_outputs` — WO-reference holds flip `qa_status` ON_HOLD/PENDING (read/limited write of `qa_status` only — 08-production stays the canonical owner).
- `work_orders`, `grns`, `grn_items`, `items`, `customers`, `suppliers`, `purchase_orders`, `purchase_order_lines`, `wo_material_consumption` — display/trace reads.
- `reference_tables` — `reference.quality_hold_reasons` (hold reason labels + default duration).
- `org_document_settings` — `insp` sequence for `next_quality_inspection_number` (mig 272).

Governance / RBAC:

- `e_sign_log` — CFR-21 signatures (hold release, spec approve, HACCP activate, critical-NCR close, inspection decision, CCP-deviation resolve, CAPA close).
- `outbox_events` — `quality.hold.created`, `quality.hold.released`, `quality.ncr.opened`, `quality.ncr.updated`, `quality.ncr.closed`.
- `scanner_audit_log` — scanner QC idempotency + audit (`quality.scanner.inspect`).
- `user_roles` / `roles` / `role_permissions` — the `hasPermission` check every action runs.

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **No NCR reopen / cancel / draft action.** `NcrStatus` declares
   `draft`/`reopened`/`awaiting_capa`/`cancelled` (`ncr-actions.ts:22`) but **no
   action writes them** — `closeNcr` is terminal with no inverse, and there is no
   create-as-draft or cancel path. A wrongly-closed NCR cannot be reopened in the app.

2. **Trace/recall reuses the dashboard permission.** `runTraceReport` /
   `startRecallDrill` / recall-drill reads gate on `quality.dashboard.view` with an
   explicit `TODO(E2A): dedicated quality.trace.run / quality.recall.manage permission`
   (`trace-actions.ts:167`). Any quality viewer can run/save recalls.

3. **Specs have no first-class line-edit and no `expired` writer.** `createSpec`
   inserts all parameters at once; there is no add/edit/delete-parameter action on an
   existing draft, and `expired` is in the type but only reachable via DB (no action).
   `applies_to` is hard-coded `'all'` on create (`spec-actions.ts:316`) despite the UI
   exposing an "Applies to" field.

4. **Scanner QC has NO e-signature (deliberate).** `POST …/scanner/inspect`
   records the decision with `signature_hash=NULL` — the PIN-bound session +
   `scanner_audit_log` are the identity/traceability, unlike the desktop
   `submitInspectionDecision` which collects a CFR-21 `signEvent`. Documented in the
   route (`route.ts` "DELIBERATE no-e-sign fast path"), flagged so an auditor knows
   the two paths differ.

5. **Cold-chain hold creation is not in the outer transaction.** `submitConditionCheck`
   calls `createHold` (its own `withOrgContext`) before inserting the
   `delivery_condition_checks` row — an explicit `// TODO: make hold creation share
   the outer txn` (`cold-chain-actions.ts:267`). A crash between the two leaves a hold
   without its check row.

6. **CCP-deviation resolve double-signs.** `resolveCcpDeviation` calls `signEvent`
   (intent `qa.haccp.ccp.deviation`) **and** then `releaseHold` — which runs its own
   `signEvent` (intent `qa.hold.release`) with the same password
   (`ccp-deviation-actions.ts:255,287`). One operator action produces two e-sign-log
   rows; acceptable for audit but worth noting.

7. **No hold sub-status transitions.** `investigating`/`escalated`/`quarantined`
   exist in the `quality_holds` check constraint (mig 197) and count as "active", but
   no action moves a hold between them — a hold is only ever `open` until `released`.
   The richer workflow is schema-only.

8. **No production-side / desktop "cancel inspection" action.** `quality_inspections`
   has a `cancelled` status but no action sets it; a mistaken inspection can only be
   decided, not voided. Similarly there is no inspection-result-template binding to
   `quality_spec_parameters` — parameters are free-form per inspection, not pulled
   from the approved spec.

9. **CCP-board read gate vs CCP-monitoring write asymmetry.** Reading the CCP board
   is relaxed to `plan_edit` OR `ccp.deviation_override` (`haccp-actions.ts:126`), but
   `recordMonitoring` requires `quality.ccp.deviation_override` only — a `plan_edit`
   user can see the board but not record a reading. Intentional, but a likely support
   question.

No raw `// TODO` markers were found beyond the trace-permission and cold-chain-txn
ones cited above; the rest of the gaps are derived from state-machine / enum-vs-action
drift observed in the code.
