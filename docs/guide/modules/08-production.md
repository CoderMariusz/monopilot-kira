# Production — WO execution / consume → output → waste + corrections (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module spans **two
> route groups** plus a shared lib layer: the **desktop** WO screens live in
> **Production** (`/production/wos`, `…/(modules)/production/`) and the
> shop-floor **scanner** execute flow lives in the scanner PWA
> (`/scanner/wos/[woId]/{consume,output,waste}`). Both call **one shared
> service layer** under `apps/web/lib/production/**` — desktop via Server
> Actions / route handlers, scanner via `/api/production/scanner/...` routes.
>
> 08-production is the **canonical owner** of `wo_outputs`, `wo_waste_log`,
> `downtime_events`, and the sole **producer** of `oee_snapshots`
> (D-OEE-1; 15-oee is read-only). It **consumes** the 09-quality T-064 hold gate
> on every consume/output/waste/complete path.
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (W11 R2/R3/R4 reversibility, E4B labor, E7
> disassembly).

---

## a. Overview

The Production module **executes** a work order: it freezes the BOM, consumes
materials (FEFO License Plates), records produced output (incl. catch-weight),
records waste, and walks the WO through its runtime lifecycle to a financial
close. The WO arrives **RELEASED** from Planning (with an active BOM + an
approved/released factory spec — that gate is enforced in `releaseWorkOrder`,
not here); Production then drives `planned → in_progress → paused → completed →
closed`, plus `cancelled` as a terminal branch.

The lifecycle is enforced by a **single state machine**
(`lib/production/wo-state-machine.ts`): a transition is never a free-form
`UPDATE status` — it (1) validates the verb is legal, (2) appends an immutable
`wo_events` row (R14-idempotent on `transaction_id`), (3) CAS-materializes
`wo_executions.status` under an optimistic lock, and (4) mirrors the canonical
state onto `work_orders.status`. Every stock mutation is NUMERIC-exact (decimal
strings straight to `NUMERIC` columns, never a JS float) and idempotent on a
client-supplied transaction/op id.

Mistakes are **reversible** (W11 R2/R3/R4): a wrong output is **voided**, a
wrong waste entry is **voided**, and a wrong consumption is **reversed** — each
posts a **storno** counter-entry (a negated mirror row with `correction_of_id`
pointing at the original), restores/voids the affected LP, and writes an audit
event. Output / consumption reversals require a **CFR-21 e-signature**; waste
void does not.

The desktop service layer lives in `apps/web/lib/production/` (`start-wo.ts`,
`pause-resume-wo.ts`, `complete-cancel-wo.ts`, `close-wo.ts`,
`output/register-output.ts`, `output/register-disassembly-output.ts`,
`waste/record-waste.ts`); the page-local Server Actions live in
`production/_actions/` (`consume-material-actions.ts`, `output-qa-actions.ts`,
`corrections-actions.ts`, `changeover-actions.ts`, `labor-actions.ts`); the
storno/e-sign primitives are `lib/corrections/correct-ledger-entry.ts`. The
scanner write paths mirror the same SQL in `apps/web/app/api/production/scanner/wos/[id]/...`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission
> checked server-side **inside** the action (a missing permission returns a
> typed `forbidden`, never a 500). Scanner routes additionally require the
> **scanner PIN session** (`requireScannerSession`) **and** re-check the same
> RBAC string.

### WO lifecycle services — `apps/web/lib/production/*` (via `work-orders/[id]/{verb}/route.ts`)

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `startWo` (`start-wo.ts`) | `planned/RELEASED → in_progress`. Factory-release preflight on the WO **snapshot** (`active_bom_header_id`/`active_factory_spec_id`, self-heals from FG if missing → else `factory_release_missing`); **freezes the BOM** (`createBomSnapshot`, idempotent); **allergen gate** (open medium+ `changeover_events` on the line, OR snapshot `segregation_required` → `changeover_signoff_required`, hard-block); **materializes `wo_outputs`** (one placeholder row per `schedule_outputs` role, qty 0); emits `production.wo.started`. | reads `work_orders`, `factory_specs`, `bom_headers`, `items`, `changeover_events`, `production_lines`, `schedule_outputs`; writes `wo_events`, `wo_executions`, `work_orders`, `wo_outputs`, `bom_snapshots`, `outbox_events` | `production.wo.start` | `cancelWo` (no "un-start") |
| `pauseWo` (`pause-resume-wo.ts`) | `in_progress → paused`. Opens a categorized `downtime_events` row (`source='wo_pause'`, `ended_at` NULL) atomically; `category_id` mandatory (V-PROD-22). Idempotent on the lifecycle `transactionId`. | writes `wo_events`, `wo_executions`, `work_orders`, `downtime_events`, `outbox_events` (`production.downtime.recorded`) | `production.wo.pause` | `resumeWo` |
| `resumeWo` (`pause-resume-wo.ts`) | `paused → in_progress`. Closes the open `wo_pause` downtime row (`ended_at`; `duration_min` is GENERATED, never written). | writes `wo_events`, `wo_executions`, `work_orders`, `downtime_events`, `outbox_events` | `production.wo.resume` | `pauseWo` again |
| `completeWo` (`complete-cancel-wo.ts`) | `in_progress → completed`. **Output yield gate**: ≥1 `primary` output with `qty_kg>0` (corrected rows excluded) unless an `overrideReasonCode` is supplied → else `output_yield_gate_failed`. **holdsGuard (T-064)** on every output LP first. **Writes the `oee_snapshots` row** (D-OEE-1, sole producer) in the same txn. Emits `production.wo.completed`. | reads `wo_outputs`; writes `wo_events`, `wo_executions`, `work_orders`, `oee_snapshots`, `outbox_events` | `production.wo.complete` | `cancelWo` (from `completed`) |
| `cancelWo` (`complete-cancel-wo.ts`) | `planned/in_progress/paused/completed → cancelled` (terminal). `reasonCode` mandatory. Records a reservation-release seam on the event payload. Emits `production.wo.closed` (`terminal:'cancelled'`). | writes `wo_events`, `wo_executions`, `work_orders`, `outbox_events` | `production.wo.cancel` **(seeded by mig 225 — NOT in the `Permission` enum; see gaps)** | — (terminal) |
| `closeWo` (`close-wo.ts`) | `completed → closed` (terminal). **CFR-21 supervisor e-sign FIRST** (`signEvent`, intent `production.wo.close`, PIN + mandatory reason), validated atomically before the transition (orphan-attestation guard). Emits `production.wo.closed` (10-finance / 12-reporting / 14-multi-site; D365 close is async outbox only). | writes `e_sign_log`, `audit_events`, `wo_events`, `wo_executions`, `work_orders`, `outbox_events` | `production.wo.close` | — (terminal; reverse individual entries via corrections) |

### Consume — `production/_actions/consume-material-actions.ts` + scanner `…/consume/route.ts`

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `recordDesktopConsumption` (`consume-material-actions.ts`) | Desktop consume against a WO material. **LP safety gate** (`lp-safety-guard.ts`: not-released → `lp_not_released`, stale, expired, + T-064 `holdsGuard` → `quality_hold_active` + emits `production.consume.blocked`). **Two-tier over-consume gate** (warn band → success+warning; approve band `overconsume_threshold_pct` → `overconsume_blocked`). Bumps `wo_materials.consumed_qty`, decrements the LP (reserved-safe), inserts the consumption ledger LAST (UNIQUE `transaction_id` = exactly-once), records FEFO adherence. Idempotent via deterministic txn id from `clientOpId`. | reads `wo_materials`, `v_inventory_available`, `license_plates`, `tenant_variations`; writes `wo_materials`, `license_plates`, `wo_material_consumption`, `outbox_events` (`warehouse.material.consumed`) | `production.consumption.write` | `reverseConsumption` |
| `listConsumableLps` (`consume-material-actions.ts`) | FEFO-ordered consumable LP candidates for a WO material (`v_inventory_available`: `status='available' AND qa_status='released'`, minus reserved; `order by expiry asc nulls last`). | reads `wo_materials`, `v_inventory_available` | `production.consumption.write` | — (read) |
| Scanner consume `POST …/wos/[id]/consume/route.ts` | The handheld equivalent — **mirrors the desktop SQL exactly**. Adds the **supervisor-PIN over-consume approval** path: above the approve tier with no approver → `overconsume_approval_required` (409); an approver `{email,pin}` is verified (`verifyPin`), must be a **different** in-org user holding `production.consumption.override_approve`. Idempotent on `scanner_audit_log(org_id, client_op_id)`. | same as desktop + writes `scanner_audit_log` | scanner PIN session + `production.consumption.write` (+ approver `production.consumption.override_approve` over-limit) | `reverseConsumption` |

### Output / waste / disassembly — `apps/web/lib/production/*` (via route handlers)

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `registerOutput` (`output/register-output.ts`, via `…/outputs/route.ts` + scanner `…/output/route.ts`) | Insert a `primary/co_product/by_product` row into **`wo_outputs`**. WO must be in an output-recordable state. **holdsGuard FIRST**. Generates `batch_number = {wo}-OUT-NNN` + `expiry = today + shelf_life`. **Catch-weight (T-032)**: when `weight_mode='catch'`, persists `catch_weight_details` + ±tolerance variance (SOFT warning, never a block); rejects catch weights on a `fixed` item. **Mints the output LP** in the same txn (`status='received', qa_status='pending'`) when no LP supplied; genealogy `parent_lp_id` = **first consumed LP**, all consumed in `ext_jsonb.consumed_lp_ids` + `lp_genealogy` rows. Emits `production.output.recorded`. | reads `work_orders`, `items`, `wo_executions`, `wo_material_consumption`; writes `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `outbox_events` | `production.output.write` | `voidWoOutput` |
| `registerDisassemblyOutput` (`output/register-disassembly-output.ts`, via `…/disassembly-outputs/route.ts`) | **E7** — break ONE input LP into N co-product outputs (disassembly BOM). Validates `bom_type='disassembly'` + the output set matches `bom_co_products`; allocates input cost across outputs per `allocation_pct` (NUMERIC-exact, last output absorbs the remainder); mints a derived LP per output (`relation_type='derived'`), writes the cost ledger (`source='disassembly_allocation'`), emits one `production.output.recorded` per output. | reads `work_orders`, `bom_headers`, `bom_co_products`, `license_plates`, `item_cost_history`; writes `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `item_cost_history`, `outbox_events` | `production.output.write` | `voidWoOutput` (per output row) |
| `recordWaste` (`waste/record-waste.ts`, via `…/waste/route.ts` + scanner `…/waste/route.ts`) | Insert a categorized `wo_waste_log` row (qty **always kg**, >0). WO must be recordable. Resolves `category_code → waste_categories.id` (unknown/inactive → `invalid_reference`). **holdsGuard FIRST**. Emits `production.waste.recorded` (feeds the yield gate, finance loss, reporting). Idempotent on `transaction_id`. | reads `work_orders`, `wo_executions`, `waste_categories`; writes `wo_waste_log`, `outbox_events` | `production.waste.write` | `voidWasteEntry` |

### QA release of outputs — `production/_actions/output-qa-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `releaseWoOutputQa({outputId,decision})` | QA-gate a production output (`PENDING`-only). `PASSED` → output `qa_status='PASSED'` + LP `qa_status='released'` (FEFO-consumable); `FAILED` → `qa_status='FAILED'` + LP `qa_status='rejected'`. `ON_HOLD` routes to the holds flow (refused here). | reads `wo_outputs`, `license_plates`; writes `wo_outputs`, `license_plates`, `lp_state_history` | `quality.batch.release` **(borrowed from 09-quality — no production-side batch-QA write perm exists; see gaps)** | one-way (`PENDING`-only) |

### Corrections / reversibility — `production/_actions/corrections-actions.ts` (+ `lib/corrections/correct-ledger-entry.ts`)

| Action | What it does | Reads / writes | Gate | Reverse direction |
|---|---|---|---|---|
| `voidWoOutput({outputId,reasonCode,note,signature})` | **R2** — void a `wo_outputs` row. **CFR-21 e-sign** (intent `production.output.void`). Refuses if already corrected, or the LP isn't voidable (must be `received`/`qa pending`, reserved 0, no consumption/children → `lp_not_voidable`). Inserts a **storno** `wo_outputs` row (negated qty, `correction_of_id`, batch `…-VOID-…`); takes the LP to `status='destroyed', qty 0`; unlinks `lp_genealogy` children; writes LP history + audit `production.output.corrected`. | reads `wo_outputs`, `license_plates`, `work_orders`, `wo_executions`; writes `wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `audit_events`, `e_sign_log` | `production.output.correct` + e-sign (+ `production.corrections.closed_wo` if WO closed) | **is** the reverse of `registerOutput` |
| `voidWasteEntry({wasteId,reasonCode,note})` | **R2** — void a `wo_waste_log` row. **No e-sign** (lower-stakes). Inserts a negated-qty storno (`correction_of_id`); writes audit `production.waste.corrected`. mig-296 unique partial index `(org_id, correction_of_id)` backstops double-void → `already_corrected`. | reads `wo_waste_log`, `work_orders`, `wo_executions`; writes `wo_waste_log`, `audit_events` | `production.waste.correct` (+ `production.corrections.closed_wo` if WO closed) | **is** the reverse of `recordWaste` |
| `reverseConsumption({consumptionId,reasonCode,note,signature})` | **R3** — reverse a `wo_material_consumption` row. **CFR-21 e-sign** (intent `production.consumption.reverse`). Locks the LP (must be `consumed/available/received` → else `lp_not_restorable`) + `wo_materials` and SQL-validates the decrement stays ≥0 (→ `inconsistent_ledger`) **before** any write. Inserts a negated storno; **decrements** `wo_materials.consumed_qty`; **restores** the LP qty + QA-aware state (`consumed`→`available` only if still `qa released`, else `received`); writes LP history + audit `production.consumption.corrected`. | reads `wo_material_consumption`, `license_plates`, `wo_materials`, `work_orders`, `wo_executions`; writes `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `e_sign_log` | `production.consumption.correct` + e-sign (+ `production.corrections.closed_wo` if WO closed) | **is** the reverse of `recordDesktopConsumption` |

> All three corrections are exposed to the WO-detail UI via the import-only
> adapter `wos/[id]/void-actions-adapter.ts`
> (`voidWoOutputAction` / `voidWasteEntryAction` / `reverseConsumptionAction`).

### Changeover (B-2 allergen dual-sign) — `production/_actions/changeover-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `createChangeoverEvent({lineId,toProductId,…})` | Record an allergen changeover event. Resolves the line through `production_lines` (always persists `production_lines.id::text`); computes `risk_level` from the active `changeover_matrix` (line override wins) else a heuristic. | reads `production_lines`, `work_orders`, `items`, `changeover_matrix(_versions)`; writes `changeover_events` | `production.changeover.write` | — (sign, don't unrecord) |
| `signChangeover({changeoverId,signature})` | **Dual sign-off** (B-2). Reads the org `signoff_policies` (required signatures, first/second signer role, allow-same-user); row-locks the event; **CFR-21 e-sign per slot** (`signEvent`, intent `production.changeover.signoff`). Completion requires `cleaning_completed=true` (`cleaning_incomplete`) and a different second signer (`same_user_rejected`). On completion writes the `allergen_changeover_validations` evidence row. A completed medium+ changeover is what **unblocks `startWo`** on that line. | reads `signoff_policies`, `user_roles`, `changeover_events`; writes `changeover_events`, `allergen_changeover_validations`, `e_sign_log`, `audit_events` | 1st slot: `production.allergen_gate.sign_first` (or policy `first_signer_role_id`); 2nd slot: `production.allergen_gate.sign_second` (or policy `second_signer_role_id`) | — (audited evidence; no un-sign) |
| `listChangeovers({lineId,status,limit})` | List changeover events (line/status filter; resolves product **codes**, signer names). | reads `changeover_events`, `production_lines`, `work_orders`, `items`, `users` | RLS-scoped read | — (read) |

### Labor (E4B) — `production/_actions/labor-actions.ts`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `clockInToWo({woId,source})` | Clock the caller onto a WO (auto-closes any open log first). | writes `wo_labor_log` | `production.consumption.write` | `clockOutFromWo` |
| `clockOutFromWo({woId?})` | Close the caller's open labor log(s) (optionally scoped to one WO). | writes `wo_labor_log` | `production.consumption.write` | `clockInToWo` |
| `getWoLaborSummary(woId)` | Aggregate hours × `labor_rates` per operator (NUMERIC-exact; operator **name** resolved, never a UUID). | reads `wo_labor_log`, `users`, `labor_rates`, `user_roles`, `roles` | `production.oee.read` | — (read) |
| `upsertLaborRate(input)` / `listLaborRates()` | Manage `labor_rates` (role-group rate cards). | reads/writes `labor_rates` | write: `settings.org.update`; read: `settings.org.read` | edit again |

### Read actions — `production/_actions/*`

| Action (file) | What it does | Reads | Gate |
|---|---|---|---|
| `listWorkOrders` (`list-work-orders.ts`) | `/production/wos` list (status fold over `work_orders` + `wo_executions`; progress from canonical `wo_outputs` sum; allergen badge). | `work_orders`, `wo_executions`, `wo_outputs` | `production.oee.read` |
| `getWorkOrderDetail` (`get-work-order-detail.ts`) | WO detail bundle for the 8/9-tab screen (components, outputs, waste, downtime, QA, genealogy, history; corrected-row exclusion via `correction_of_id`). | `work_orders`, `wo_materials`, `wo_outputs`, `wo_waste_log`, `downtime_events`, `wo_material_consumption`, `wo_status_history`, `wo_events`, `bom_co_products` | `production.oee.read` |
| `getWoActionContext` / `getWoListActionContext` (`get-wo-action-context.ts`) | Flat per-WO permission map driving which action buttons render (start/pause/resume/cancel/complete/close/outputWrite/wasteWrite). | RLS + `hasPermission` per string | each `production.*` string |
| `getProductionDashboard` (`dashboard-data.ts`), `analytics-data.ts`, `downtime-data.ts`, `waste-data.ts`, `changeover-data.ts`, `changeovers-lines.ts`, `shifts-data.ts` | Dashboard KPIs + the per-screen list loaders (downtime / waste / changeover / shifts / analytics). | respective tables | RLS-scoped reads (`production.oee.read` family) |

**Action count inventoried: 31** (6 lifecycle, 3 consume incl. scanner, 4
output/waste/disassembly, 1 output-QA, 3 corrections, 3 changeover, 5 labor, 6
read/dashboard). The execution core is the 6 lifecycle services + the 3
consume/output/waste writers + the 3 corrections.

---

## c. State machine

### WO runtime lifecycle (`wo-state-machine.ts:46-53`)

```
 planned ──start──► in_progress ──pause──► paused
   │                  │  ▲                   │
   │                  │  └──────resume───────┘
   │                  │
   │             complete
   │                  │
   │                  ▼
   │              completed ──close──► closed (terminal)
   │
   └──────────────── cancel ──────────────► cancelled (terminal)
        (cancel is legal from planned / in_progress / paused / completed)
```

| State (`wo_executions.status`) | Mirrors `work_orders.status` | Legal verbs | Who writes it | Notes |
|---|---|---|---|---|
| `planned` | `RELEASED` | `start`, `cancel` | state machine (lazy-materialized) | The WO arrives here from Planning's `releaseWorkOrder`. |
| `in_progress` | `IN_PROGRESS` | `pause`, `complete`, `cancel` | `startWo` / `resumeWo` | The only state where consume/output/waste are recordable (with `paused`/`completed`). |
| `paused` | `ON_HOLD` | `resume`, `cancel` | `pauseWo` | Opens a `wo_pause` downtime row; closed on resume. |
| `completed` | `COMPLETED` | `close`, `cancel` | `completeWo` | Yield gate must be green; `oee_snapshots` written here. |
| `closed` | `CLOSED` | — (terminal) | `closeWo` | Supervisor e-sign required; financial close. |
| `cancelled` | `CANCELLED` | — (terminal) | `cancelWo` | `reasonCode` mandatory. No "uncancel." |

The machine is enforced **twice**: the detail UI renders only state-legal +
permitted buttons (`get-wo-action-context.ts` + `wos/_components/modals/gating.ts`),
and `applyTransition` re-validates against the `TRANSITIONS` table — an illegal
verb returns `invalid_state_transition`; a concurrent CAS miss **throws** so the
whole txn (incl. the appended `wo_events` row) rolls back (→ 409).

### Consumption sub-flow (`OUTPUT_RECORDABLE_STATES` = in_progress / paused / completed)

```
LP (qa_status='released', status='available')
   │  recordDesktopConsumption / scanner consume
   │  ── LP safety gate (lp-safety-guard) ──► quality_hold_active / lp_not_released / lp_expired …
   │  ── two-tier over-consume gate ───────►  warn band → ok+warning
   │                                          approve band → overconsume_blocked (desktop)
   │                                                       → overconsume_approval_required + supervisor PIN (scanner)
   ▼
wo_materials.consumed_qty += qty ; LP.quantity -= qty (→ 'consumed' at 0)
wo_material_consumption row (UNIQUE transaction_id)
   │  reverseConsumption (R3, e-sign)
   ▼
negated storno + consumed_qty -= qty + LP restored (QA-aware state)
```

### Output / waste sub-flow

```
registerOutput ──► wo_outputs row (qa_status='PENDING')  +  output LP (status='received', qa_status='pending')
   │  releaseWoOutputQa: PASSED → output PASSED + LP released (FEFO-consumable)
   │                     FAILED → output FAILED + LP rejected
   │  voidWoOutput (R2, e-sign): negated storno + LP → 'destroyed' qty 0
   ▼
recordWaste ──► wo_waste_log row (kg)
   │  voidWasteEntry (R2): negated storno (no e-sign)
```

**LP lifecycle through production:** an output/disassembly LP is born
`status='received', qa_status='pending'` (never auto-consumable) → QA
`releaseWoOutputQa` promotes it to `qa_status='released'` (consumable) or
`rejected` → `voidWoOutput` takes it to `status='destroyed', quantity=0`. A
consumed input LP goes `available → consumed`; `reverseConsumption` restores it
to `available` (only if still QA-released) or `received`.

<!-- screenshot: production/wos list (status tabs + search) -->
<!-- screenshot: production/wos/[id] detail (header action bar + 9 tabs) -->

---

## d. User how-tos

> Button labels below are the literal English copy from the `production.wos.*` /
> `production.changeovers.*` i18n bundles (`apps/web/i18n/en.json`); the
> `data-testid`s in parentheses are the stable anchors in the component code
> (`wos/[id]/_components/wo-detail-screen.tsx`).

### (i) Start a WO

1. Go to **Production → Work orders** (`/production/wos`) and open a `planned`
   (released) WO → `/production/wos/[id]`.
2. In the header **action bar** (`wo-action-bar`) click **"Start"**
   (`headerActions.start`). The modal optionally captures **Line** and **Shift**.
3. On submit → `startWo`: the BOM is frozen, `wo_outputs` placeholders are
   materialized, and the WO becomes `in_progress`.
4. **If start is blocked** by `changeover_signoff_required`, an amber callout
   (`wo-changeover-gate`) appears with a deep-link to
   `/production/changeovers?lineId=…` — clear the dual sign-off first (see vii),
   or the WO's `allergen_profile_snapshot.segregation_required` flag blocks start
   until segregation is signed off.

### (ii) Consume materials

**Desktop:**

1. On the running WO, open the **Consumption** tab. Click **"Record
   consumption"** (`wo-consumption-record`), or the per-row trigger
   (`wo-consumption-record-row-<id>`).
2. Pick the **material**, enter **Qty** (decimal, in the material's UoM), and
   pick a **suggested LP** (FEFO-ordered via `listConsumableLps`) — or consume
   without an LP by supplying a **reason code**.
3. Submit → `recordDesktopConsumption`. A warn-tier over-consume returns success
   with an amber warning line; the approve tier hard-blocks
   (`overconsume_blocked`). Quality holds / non-released LPs are refused.

**Scanner:** Home → **Consume** tile → `/scanner/wos/[woId]/consume`: scan the
LP, enter qty, **Receive**. Above the over-consume approve tier the scanner
prompts for a **supervisor email + PIN** (a different in-org user holding
`production.consumption.override_approve`) before it will proceed.

### (iii) Register output (fixed + catch-weight)

1. On the running/completed WO, open the **Output** tab and click **"Register
   output"** (`wo-output-add`) — or the header **"Catch-weight"**
   (`wo-action-catchweight`).
2. Pick the **output type** (primary / co-product / by-product), enter **qty**
   (kg, or units + UoM, or actual weight). **Fixed-weight** items just take a qty.
3. **Catch-weight** items (`weight_mode='catch'`) reveal the **"Per-unit weights
   (kg)"** section (`output.catchWeight.sectionTitle`) — enter the scale reading
   for each unit; the modal shows the running **Σ** and a SOFT ±tolerance variance
   warning (never a block).
4. Submit → `registerOutput`. The `wo_outputs` row is created and an **output
   LP** is minted (born on QA hold), genealogy-linked to the consumed LPs. You can
   then **Print FG label** (gated on `settings.org.update`).
5. **Disassembly WOs** show **"Register disassembly outputs"**
   (`wo-action-disassembly`) instead — one input LP → N co-product outputs with
   cost allocation.

### (iv) Record waste

1. Open the **Waste** tab → **"Log waste"** (`wo-waste-add`) — or header
   **"Waste"** (`wo-action-waste-header`).
2. Pick a **waste category**, enter **qty** (**always kg**), a **shift**, and an
   optional reason/notes. Submit → `recordWaste`. The tab footer shows the running
   total kg.

### (v) Reverse a wrong consumption

1. Open the **Genealogy** tab. On the consumed-input row click **"Reverse…"**
   (`wo-genealogy-reverse-<id>`).
2. The **reverse-consumption modal** asks for a **reason code** + note and your
   **e-sign PIN/password** (CFR-21). Submit → `reverseConsumption`.
3. The original row is struck-through + badged "Reversed"; `consumed_qty` is
   decremented and the LP qty/state restored (re-pickable only if it's still
   QA-released). On a **closed** WO the modal warns that supervisor authorization
   (`production.corrections.closed_wo`) is required.

### (vi) Void a wrong output / waste

- **Output:** Output tab → **"Void output…"** (`wo-output-void-<id>`) → reason +
  note + **e-sign PIN** → `voidWoOutput`. The row is badged "Voided", a negated
  counter-row appears ("Correction of #…"), and the output LP is destroyed.
  Refused if the LP already moved / was reserved / consumed / has children
  (`lp_not_voidable`).
- **Waste:** Waste tab → **"Void entry…"** (`wo-waste-void-<id>`) → reason + note
  → `voidWasteEntry` (**no e-sign**). A negated counter-row is posted.

### (vii) Clear an allergen changeover (dual-sign — B-2)

1. Go to **Production → Changeovers** (`/production/changeovers`) →
   **"+ New changeover"**; record line + from/to product + cleaning checklist →
   `createChangeoverEvent`.
2. On a medium+ event click **"Review & sign"**; the first signer signs
   **"Sign (1st)"** (`changeovers.sign.signFirst`) with their **account password**
   (CFR-21). A **different** second signer signs **"Sign (2nd)"** — cleaning must
   be complete first.
3. On completion the banner **"Dual sign-off complete — the next work order may
   start."** appears; that clears the `startWo` gate for that line.

### (viii) QA-release / complete / close a WO

- **QA-release an output:** Output tab, on a `PENDING` row click **"QA pass"** /
  **"QA fail"** (`wo-output-qa-pass-<id>` / `…-fail-<id>`) → `releaseWoOutputQa`.
  Pass makes the output LP FEFO-consumable; fail rejects it.
- **Complete:** header **"Complete"** → `completeWo` (yield gate must be green, or
  supply an **override reason code**). Writes the OEE snapshot.
- **Close:** header **"Close"** → `closeWo` — enter your **e-sign PIN** + reason;
  the financial close is terminal.

---

## e. Data sources (Supabase tables)

Lifecycle / execution (read/write):

- `work_orders` — WO header + snapshot (`status`, `active_bom_header_id`, `active_factory_spec_id`, `allergen_profile_snapshot`, `uom_snapshot`, `production_line_id`).
- `wo_executions` — runtime status + monotonic `version` (CAS optimistic lock).
- `wo_events` — immutable lifecycle ledger (R14-idempotent on `transaction_id`).
- `wo_status_history` — planning-facing status trail (read in detail).
- `bom_snapshots` — frozen BOM at start (`createBomSnapshot`).
- `schedule_outputs` — planned output roles materialized into `wo_outputs` at start (planning-owned; read).

Consume / output / waste (08-production canonical):

- `wo_materials` — BOM-snapshot components + `consumed_qty` (consume bumps it).
- `wo_material_consumption` — consumption ledger (UNIQUE `transaction_id`; storno via `correction_of_id`).
- `wo_outputs` — **canonical** output table (primary/co/by; `qa_status`, catch-weight, storno).
- `wo_waste_log` — **canonical** waste table (kg; storno).
- `downtime_events` — **canonical** downtime (wo_pause + manual; `duration_min` GENERATED).
- `oee_snapshots` — **producer** is 08-production only (written on complete).
- `wo_labor_log`, `labor_rates` — E4B labor (clock-in/out + rate cards).

Inventory / genealogy (shared with 05-warehouse):

- `license_plates` — LP state/qty (consume decrements; output mints; corrections destroy/restore).
- `v_inventory_available` — FEFO consumable-candidate view (mig-191; `available`+`released` minus reserved).
- `lp_genealogy` — child↔parent LP edges (`consumed` / `derived`).
- `lp_state_history` — LP transition ledger (genesis, QA, void, restore).
- `item_cost_history` — disassembly cost allocation (dual-owned with finance).

Allergen / changeover / config:

- `changeover_events`, `allergen_changeover_validations`, `changeover_matrix(_versions)` — B-2 dual-sign + risk matrix.
- `signoff_policies` — required signatures + signer roles for changeover dual-sign.
- `tenant_variations` — `feature_flags->overconsume_threshold_pct` / `overconsume_warn_pct`.
- `production_lines`, `waste_categories`, `items`, `bom_headers`, `bom_co_products`, `factory_specs` — reference reads.

Governance:

- `e_sign_log` + `audit_events` — CFR-21 e-sign (close, output/consumption void, changeover) + correction audit (`production.{output,waste,consumption}.corrected`).
- `outbox_events` — `production.wo.{started,completed,closed}`, `production.output.recorded`, `production.waste.recorded`, `production.downtime.recorded`, `production.consume.blocked`, `warehouse.material.consumed`.
- `scanner_audit_log` — scanner consume/output/waste idempotency + audit.

---

## f. Known gaps / TODO

Grounded in the code that was read — these feed the fix backlog:

1. **Correction permissions are NOT in the `Permission` enum.**
   `production.output.correct`, `production.consumption.correct`,
   `production.waste.correct`, and `production.corrections.closed_wo` are seeded
   only by migrations `293-corrections-foundation.sql` / `296-corrections-hardening.sql`
   and consumed by `corrections-actions.ts`, but never declared in
   `packages/rbac/src/permissions.enum.ts`. They are invisible to the enum-lock
   guard and to the Settings → Roles matrix (which renders the enum). Same story
   for **`production.wo.cancel`** (seeded by `225-production-wo-cancel-permission.sql`,
   checked in `cancelWo`, absent from the enum). Add them to the enum.

2. **Output QA release borrows a quality permission.**
   `releaseWoOutputQa` gates on **`quality.batch.release`** (09-quality) because
   "the existing RBAC enum has no production-side batch QA release write
   permission" (documented in `output-qa-actions.ts:3-10`). A
   production-owned action checking a quality permission blurs ownership — add a
   `production.output.qa_release` string.

3. **Two declared supervisor-override permissions are unused.**
   `production.output.catch_weight_override` and
   `production.waste.overthreshold_approve` exist in the enum but no code reads
   them: catch-weight variance is a SOFT warning (never gated), and there is no
   waste over-threshold approval path. Either wire them or mark them reserved.

4. **`production.downtime.write` is declared but there is no first-class downtime
   write action.** Downtime rows are only ever written as a side-effect of
   `pauseWo`/`resumeWo`; the WO-detail **Downtime** tab "Log downtime" button is a
   permanently **disabled** `DeferredButton` (`wo-detail-screen.tsx`), and the
   Consumption tab's "Scan LP" affordance is likewise deferred on desktop.

5. **Output LP genealogy is single-parent.** `license_plates.parent_lp_id` holds
   only the **first** consumed LP; all consumed LPs are stored in
   `ext_jsonb.consumed_lp_ids` + `lp_genealogy` rows. The single-parent column is
   a documented modelling gap (`register-output.ts:286-292`).

6. **`site_id` is NULL on start-materialized outputs.** `startWo` inserts
   `wo_outputs` with `site_id = null` until 14-multi-site attribution is wired
   (`start-wo.ts:264-268`); register-output / record-waste bind it explicitly, so
   it diverges across write paths.

7. **No production-side desktop "downtime" or "manual LP-less output" forms.**
   Operators register output / waste / consume from the desktop modals or the
   scanner; the desktop has no standalone downtime entry and no separate WO-level
   over-consume **approval banner** (the prototype's banner + the D365 push card
   are omitted — no backing read-model, `wo-detail-screen.tsx:26-27`).

8. **`apps/worker` outbox consumer does not run.** All `production.*` events are
   persisted to `outbox_events` but there is no live dispatcher (per
   `MON-project-overview`) — D365 financial-close dispatch on `production.wo.closed`
   is a seam, not yet delivered.

9. **`changeover_signoff_required` block is intentionally unbounded in time**
   (`start-wo.ts:162-167`) — an unsigned medium+ changeover blocks the line
   forever; the only escape is signing it. Documented BRCGS safety-first decision,
   flagged so the reader doesn't treat it as a stuck WO.

No raw `// TODO` markers were found in the lifecycle services beyond the
ownership/permission notes cited above; the gaps list is otherwise derived from
capability limits and the enum-vs-migration drift observed in the code.
