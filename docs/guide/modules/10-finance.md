# Finance — WO actual costing, cost-per-kg, valuation schema (module guide)

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. Finance is **module 10**
> (`10-finance` in `.claude/skills/MON-project-overview/SKILL.md`; canonical event
> prefix `finance.*`). It is the costing/valuation authority: **WO actual
> costing**, **standard cost**, **FIFO/WAC inventory valuation**, **standard-vs-
> actual variance**, and the **D365 stage-5 export-only** outbox (R15
> anti-corruption).
>
> The **live surface is small**: one desktop screen at `/finance`
> (`apps/web/app/[locale]/(app)/(modules)/finance/`) that renders **read-only WO
> actual costs**. The full valuation/standard-cost/variance DDL ships in the DB
> (`packages/db/migrations/199-finance-schema-and-rbac-seed.sql` +
> `packages/db/schema/finance.ts`) but is **not yet wired to any Server Action or
> page** (see Known gaps). Routes are written without the `[locale]` prefix. Last
> reviewed against the working tree (R4d finance refresh fix, commit `ec5a3ef3`).
>
> **Ownership the whole module turns on:** the per-item **cost-per-kg master is
> dual-owned** — Technical (03) is the **only writer** of `items.cost_per_kg` +
> `item_cost_history` (via `writeItemCostLedger`); Finance is a **pure reader** of
> that master and of the canonical 08-production / 05-warehouse tables, and never
> writes them (`packages/db/schema/finance.ts:36-44`,
> `finance/_actions/wo-cost-actions.ts:3-25`).

---

## a. Overview

Finance **costs what production already did**. The one live action,
`listCompletedWoCosts` (`finance/_actions/wo-cost-actions.ts:341`), takes recently
**completed/closed** work orders and rolls each one up into an **actual cost**:
materials (consumed kg × the item's `cost_per_kg`), process labor/machine/setup
(resolved from a `reference_tables.processes` row), waste (costed at the WO's
weighted-average material cost), and a **cost-per-kg of output**. It is strictly
**read-only**: "no postings, no new tables, no valuation snapshots, no D365"
(`wo-cost-actions.ts:25`). Every figure is **NUMERIC-exact** — costs flow as
decimal strings through a micro-scaled integer math kernel
(`finance/_actions/wo-cost-math.ts`, `lib/shared/decimal`), never a JS float.

Finance reads four cost sources, each documented in the action header
(`wo-cost-actions.ts:6-24`):

- **Materials** — `wo_material_consumption.qty_consumed` joined to `items` on
  `component_id`; `items.cost_per_kg` is the Technical/Finance dual-owned master.
- **Process** (labor / machine / setup) — process rows are JSON in
  `reference_tables` where `table_code='processes'` (migs 269/276); the WO has no
  process FK, so resolution is conservative: the lowest-sequence
  `wo_operations.operation_name` matched case-insensitively against the reference
  row's `row_key` / `row_data.name` / `row_data.process_code`. No match → labor is
  honest `null`.
- **Runtime** — reuses the OEE producer's downtime-merge rule
  (`totalDowntimeMinutes` from `lib/production/oee-snapshot-producer`); runtime =
  started→completed minus merged downtime. Finance does **not** read or write
  `oee_snapshots`.
- **Waste** — `wo_waste_log.qty_kg` costed at the WO's weighted-average material
  cost; `0.0000` rather than an invented valuation when no material basis exists.
- **Outputs** — `wo_outputs.qty_kg` is the denominator; `costPerKgOutput` is
  `null` when output kg is zero.

The **cost-per-kg master itself lives in Technical**: it is written by the
Technical cost ledger (`technical/cost/_actions/write-cost-ledger.ts`) and
surfaced as cost history + recipe roll-ups under `/technical/cost`. PO/invoice and
D365 cost capture also flow through that same ledger (sources `supplier_update` /
`d365_sync`), **not** through any Finance table (see f. Known gaps #3).

The deeper Finance DDL — `standard_costs`, `wo_actual_costing`,
`inventory_cost_layers`, `item_wac_state`, `cost_variances`,
`finance_outbox_events`, `d365_finance_dlq` — exists as a **schema foundation
only** (`packages/db/schema/finance.ts`, migration 199); no Server Action writes
or reads it yet.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns a typed
> `{ ok:false, reason:'forbidden' }`, never a 500). The whole `fin.*` family is
> seeded to the org-admin role family + a finance operator/analyst role family by
> migration 199 §(C) — the #1 403-everywhere fix
> (`199-finance-schema-and-rbac-seed.sql:527-667`).

### WO actual costing (the only live actions) — `finance/_actions/wo-cost-actions.ts`

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listCompletedWoCosts({days?})` (`wo-cost-actions.ts:341`) | The `/finance` page loader. Lists the **25 most recent** WOs `COMPLETED`/`CLOSED` (or `wo_executions.status in (completed,closed)`) within the window (`days` clamped 1..365, default 30), then rolls each up via `computeWoActualCostInContext`. **Pure read** — never writes. | reads `work_orders`, `wo_executions`, `wo_outputs`, `wo_waste_log`, `wo_material_consumption`, `items`, `wo_operations`, `reference_tables` (`processes`), `downtime_events`; **writes nothing** | `fin.costs.read` | — (read-only) |
| `computeWoActualCost(woId)` (`wo-cost-actions.ts:329`) | Single-WO version: validate the WO is completed/closed (`not_found` otherwise), pull materials / process / downtime, compute totals. Same RBAC + read-only contract. | same reads as above for one WO | `fin.costs.read` | — (read-only) |
| `computeWoActualCostTotals(input)` (`wo-cost-math.ts:62`) | Pure NUMERIC kernel (no DB, no `'use server'`). materials Σ(qty×cost), labor = runtimeHours × staffing × ratePerHour, waste = wasteKg × avg material cost, total = materials+labor+machine+setup+waste, `costPerKgOutput = total/outputKg`. Micro-scaled bigint math, banker-free half-up rounding (`divMicro`). | — (in-memory) | — (called inside the action under the gate) | — |

> `hasFinancePermission` (`wo-cost-actions.ts:147`) is the local RBAC helper:
> it checks BOTH the normalized `role_permissions` table AND the legacy
> `roles.permissions` jsonb cache for `fin.costs.read`, scoped to
> `(user_id, org_id)` under RLS — the same dual-storage pattern Technical's cost
> actions use.

### Cost-per-kg master — Technical-owned, Finance-read (`technical/cost/_actions/*`)

> These are **not Finance actions** — they live in module 03. They are listed
> here because they are the **only writers** of the cost-per-kg master that
> Finance reads, and the guide must be explicit about the dual-ownership boundary.

| Action (file) | What it does | Reads / writes | Gate | Owner |
|---|---|---|---|---|
| `postCost(input)` (`technical/cost/_actions/post-cost.ts:42` → `write-cost-ledger.ts:31`) | Post a new cost roll: close the prior active `item_cost_history` row (`effective_to`), insert the new one (`source` ∈ `manual`/`d365_sync`/`supplier_update`/`variance_roll`), **denormalize** `items.cost_per_kg`. V-TEC-53: >20 % delta on `manual`/`supplier_update` needs an approver → `approver_required` (the >20 % test is evaluated in SQL NUMERIC space, `write-cost-ledger.ts:59-70`). | writes `item_cost_history`, `items.cost_per_kg`, `audit_log` (`item_cost.recorded`) | `technical.cost.edit` | **03-technical** (Finance never writes) |
| `listCostHistory({itemId})` (`technical/cost/_actions/list-cost-history.ts:56`) | Per-item cost-roll history, `effective_from DESC`. cost stays a string (NUMERIC-exact). | reads `item_cost_history` | `technical.cost.edit` | 03-technical |
| `getRecipeCost(productCode)` / `listCostedProducts()` (`technical/cost/_actions/list-recipe-cost.ts:169` / `:110`) | BOM-driven **standard-cost roll-up** = Σ(`bom_lines.quantity` × component `items.cost_per_kg`), computed in SQL. Target/selling price are surfaced **N/A** — Technical's schema has no selling price (`list-recipe-cost.ts:20-24`). | reads `bom_headers`, `bom_lines`, `items`, `npd_projects` | RLS-scoped read | 03-technical |
| `triggerCostImport({reason})` (`settings/integrations/d365/cost-import/_actions/trigger-cost-import.ts:50`) | D365 cost-import: **enqueues** an idempotent pull job (append-only; never overwrites a local cost in place). The applied diff later goes through `postCost` with `source='d365_sync'`. | enqueues a D365 pull job | `technical.d365.sync_trigger` + `assertD365Enabled` | 03-technical / integrations |

**Action count inventoried: 3 live Finance actions** (`listCompletedWoCosts`,
`computeWoActualCost`, the `computeWoActualCostTotals` kernel) — all read-only —
plus the **4 Technical-owned** cost-master writers Finance depends on. There are
**no Finance write actions** in the working tree: standard-cost approve, valuation
close, variance finalize, and D365 export dispatch all have schema + RBAC strings
but **no Server Action** (see f. Known gaps).

---

## c. State machines

Finance has **no live state machine** — the one wired action is a read fold over
already-terminal WOs. The state vocabulary below is **declared in the schema**
(`packages/db/schema/finance.ts` CHECK constraints, mirrored in migration 199) and
will drive the costing/valuation flows when they are wired; no code transitions
these states today.

### WO actual-cost selection (the live read filter)

```
work_orders.status ∈ {COMPLETED, CLOSED}
   OR wo_executions.status ∈ {completed, closed}      (wo-cost-actions.ts:207-210)
        │  AND completed_at ≥ now() − days·interval     (window, default 30, ≤365)
        ▼
   listCompletedWoCosts → top 25 → computeWoActualCost per WO (read-only)
```

### Declared lifecycle states (schema-only, not yet transitioned)

| Table (`finance.ts`) | `status` CHECK | Intended meaning | Writer today |
|---|---|---|---|
| `standard_costs` (`:102-105`) | `draft → approved → superseded → archived` | Effective-dated target cost; approve carries a 21 CFR Part 11 SHA-256 e-sign snapshot (`approval_signature_sha256`, `:82`). Approved rows are immutable (trigger noted for a future mig, `200-finance-reserved.sql:1-9`). | **none** |
| `wo_actual_costing` (`:159-162`) | `open → closed → reversed` | Realized cost per WO, soft-ref to canonical `wo_outputs` (`wo_output_id`, never written by Finance, `:128-131`). | **none** |
| `cost_variances` (`:338-341`) | `open → finalized` | Standard-vs-actual per `(wo, category)`; `category ∈ material|labour|overhead|yield|waste` (`:330-332`); `variance_amount` is GENERATED `actual − standard` (mig `199:227`). | **none** |
| `inventory_cost_layers` (`:214-217`) | `source_type ∈ po_receipt|wo_output|adjustment` — **no `d365_import`** (R15 anti-corruption, `:212-213`) | FIFO per-LP lot ledger; FIFO consume partial index on `(org,item,currency,receipt_date asc) where not exhausted` (mig `199:170-173`). | **none** |
| `item_wac_state` (`:267-277`) | — (running state) | Weighted-average cost; `avg_cost` is GENERATED `round(total_value/total_qty_kg,6)` STORED (mig `199:189-194`). | **none** |
| `finance_outbox_events` (`:393-396`) | `pending → processing → sent | failed → dead_lettered` | D365 stage-5 **export-only** parallel outbox (R15); D365 ids live only in `d365_external_ids` metadata, never an RLS key (`:367-368`). | **none** |
| `d365_finance_dlq` (`:439-442`) | `dead_lettered → replaying → resolved` | Permanent-export-failure DLQ; replay is admin-only (V-FIN-INT-05). | **none** |

<!-- screenshot: finance landing (/finance) — WO actual-cost table + Refresh -->
<!-- screenshot: finance WO row expanded — material breakdown + setup/machine/waste -->

---

## d. User how-tos

> Button labels are the literal English copy from the `Finance.woCosts.*` i18n
> bundle (`apps/web/i18n/en.json`); the `data-testid`s in parentheses are the
> stable anchors in `finance/_components/wo-cost-table.client.tsx`.

### (i) View WO actual costs

1. Open **Finance** from the sidebar (`/finance`). The nav entry is gated on
   `fin.costs.read` (`lib/navigation/module-registry.ts:15`,`:181-193`); the page
   itself re-checks `fin.costs.read` inside `listCompletedWoCosts`.
2. The page (`module-landing-finance`) renders the **"WO actual costs"** table
   (`finance-wo-costs`): one row per completed WO in the last **30 days** (the
   page calls `listCompletedWoCosts({days:30})`, `finance/page.tsx:54`), with
   columns **WO / Product / Output kg / Materials / Labor / Total / Cost / kg**.
3. **Labor** shows **"No process cost"** when no `reference_tables.processes` row
   matched the WO's first operation; **Cost / kg** shows **"n/a"** when output kg
   is zero.

### (ii) Inspect a WO cost breakdown

1. Click the WO number (a `<details>` disclosure, `wo-cost-table.client.tsx:130`).
   The **"Material breakdown"** panel (`finance-breakdown-<woId>`) lists each
   consumed item with **Qty kg / Cost / kg / Cost**, plus a 3-up grid of **Setup /
   Machine / Waste** costs.
2. All figures are server-computed NUMERIC strings rendered verbatim (monospace);
   the client does no math.

### (iii) Refresh the costs (R4d)

1. Click **"Refresh"** (`finance-refresh`). It calls `router.refresh()` inside a
   `useTransition`, re-running the server component and re-reading Supabase
   (`wo-cost-table.client.tsx:96`). While pending the button reads **"Refreshing…"**
   and a `finance-optimistic` banner shows.
2. This was fixed in **R4d** (commit `ec5a3ef3`): the button previously bumped an
   orphan `refreshCount` state that re-fetched nothing (dead-end S2-13); it now
   actually re-fetches the server data.

### (iv) Where cost-per-kg is actually edited (Technical, not Finance)

Finance only **reads** `items.cost_per_kg`. To **change** a cost you go to
**Technical → Cost** (`/technical/cost`) and post a roll (`postCost`,
`technical.cost.edit`) — manual, supplier-update, or a D365 import diff. The new
value denormalizes onto `items.cost_per_kg` and immediately changes what the
Finance WO-cost page computes on the next **Refresh**. See the Technical guide
(`docs/guide/modules/03-technical.md` §"Cost-per-kg (dual-owned with Finance)").

---

## e. Data sources (Supabase tables)

Live WO actual costing reads (08-production / 03-technical / 05-warehouse owned —
Finance never writes any of them):

- `work_orders`, `wo_executions` — WO header + runtime status; the completed/closed
  filter and `started_at`/`completed_at` window.
- `wo_outputs` — **canonical (08-production)**; `qty_kg` is the output denominator.
- `wo_material_consumption` — **canonical (08-production)**; `qty_consumed` × cost.
- `wo_waste_log` — **canonical (08-production)**; `qty_kg` costed at WAC material cost.
- `downtime_events` — **canonical (08-production)**; merged for the runtime window.
- `wo_operations` — first operation name → process resolution.
- `items` — `cost_per_kg` (dual-owned master) + product `item_code`/`name`.
- `reference_tables` (`table_code='processes'`) — JSON process rows (`cost_mode`,
  `cost_rate`, `currency`, `staffing_count`, `setup_cost`); migs 269/276.

Cost-per-kg master (03-technical owned — Finance reads `items.cost_per_kg` only):

- `item_cost_history` — cost-roll ledger (`packages/db/migrations/160-item-cost-history.sql`);
  `source ∈ manual|d365_sync|supplier_update|variance_roll`; effective-dated;
  written by `write-cost-ledger.ts`, **dual-owned with Finance** (`160:4-5`).
- `items.cost_per_kg` — `NUMERIC` denorm of the active history row.

Finance-owned schema (created by migration 199 — **defined, not yet read/written
by any action**):

- `standard_costs` — versioned target cost per `(org,item,currency)` (T-009).
- `wo_actual_costing` — realized cost per WO, soft-ref to `wo_outputs` (T-015).
- `inventory_cost_layers` — FIFO per-LP lot ledger (T-021).
- `item_wac_state` — weighted-average cost running state (T-021).
- `cost_variances` — standard-vs-actual per `(wo, category)` (T-021).
- `finance_outbox_events`, `d365_finance_dlq` — D365 stage-5 export-only (T-027, R15).

Governance / cross-cutting:

- `role_permissions` + `roles.permissions` — the `fin.*` family (dual storage),
  seeded by migration 199 §(C) to the org-admin + finance-operator role families.
- `audit_log` — cost rolls land here (`item_cost.recorded`); there is **no**
  finance-specific outbox emission in the working tree (see gaps).
- `outbox_events` CHECK — admits the 5 `finance.*` event types
  (`199:422-426`: `finance.consumption.valued`, `finance.cost_per_kg.changed`,
  `finance.standard_cost.approved`, `finance.valuation.closed_monthly`,
  `finance.variance.computed`) but **nothing emits them yet**.

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **Only WO actual costing is wired; the rest of Finance is schema-only.** The
   live module is one read-only page + 3 read actions
   (`finance/_actions/wo-cost-actions.ts`). `standard_costs`, `wo_actual_costing`,
   `inventory_cost_layers`, `item_wac_state`, `cost_variances`,
   `finance_outbox_events`, `d365_finance_dlq` exist in `packages/db/schema/finance.ts`
   + migration 199 with full CHECKs, RLS and indexes, but **no Server Action or
   page reads or writes them**. Standard-cost approve, valuation close, variance
   finalize and D365 export are unimplemented.

2. **The 5 `finance.*` outbox events are declared but never emitted.** They are in
   the enum SoT (`packages/outbox/src/events.enum.ts:56-60`) and admitted by the
   `outbox_events` CHECK (`199:422-426`), but a code search finds no emitter
   outside `.next/` build artifacts. Downstream consumers cannot subscribe to
   finance cost/valuation/variance changes.

3. **PO / invoice cost capture is not a Finance flow.** There is no Finance PO or
   invoice cost-capture action. Supplier/PO-driven and D365-driven cost changes
   land on the **Technical** ledger via `postCost`/`writeItemCostLedger` with
   `source='supplier_update'` / `'d365_sync'`
   (`technical/cost/_actions/write-cost-ledger.ts`,
   `settings/integrations/d365/cost-import/_actions/trigger-cost-import.ts:18-20`).
   Finance only re-reads the resulting `items.cost_per_kg`. `inventory_cost_layers`
   (the place a PO **receipt** valuation layer would post, `source_type='po_receipt'`)
   is never written.

4. **Two overlapping cost-read permissions; the live page uses the off-PRD one.**
   The page + nav gate on **`fin.costs.read`** (`wo-cost-actions.ts:36`,
   `module-registry.ts:15`), a "minimal sitemap RBAC family, 2026-06-09 audit"
   string (`permissions.enum.ts:325-326`), **not** the PRD-canonical
   `fin.actual_cost.view` (`:323-324`) — which migration 199 seeds but no code
   checks. Same duplication exists for `fin.valuation.read` vs `.valuation.view`
   and `fin.variance.read` vs `.variance.view` (`:329-338`). The duplicates are a
   seam to reconcile.

5. **Process costing is best-effort name matching, not a real cost model.** The WO
   has no process FK; labor/machine/setup are resolved by case-insensitive name
   match of the **first** WO operation against a `reference_tables.processes` JSON
   row (`wo-cost-actions.ts:8-16`,`:232-260`). A WO whose operation name does not
   match any active reference row gets **honest `null` labor** and `0` setup/machine
   — not an error, but the costing is silently incomplete. Multi-operation WOs only
   cost the lowest-sequence operation.

6. **`site_id` is day-1 nullable across all 7 finance tables with no per-site
   scoping yet.** Every finance table carries a nullable `site_id` with no FK / no
   registry; the RLS predicate is org-only (`app.current_org_id()`) until 14-MS
   T-030 lands `app.current_site_id()` (`finance.ts:26-29`, `199:26-27`). Valuation
   ledgers are documented as per-site but are not yet scoped that way.

7. **Migration 200 is a reserved no-op.** `200-finance-reserved.sql` is an
   intentional placeholder (`select 1 where false`) holding the slot; the future
   GIST-EXCLUDE no-overlap on approved `standard_costs`, the approved-row
   immutability trigger, and the monthly-close freeze table are explicitly deferred
   to forward migrations `≥ 201`, never by editing 199/200 (`200:1-9`).

8. **No DB row-level audit trigger; audit is Server-Action-emitted.** Like planning
   176/177 and production 181, the finance schema has audit **columns** +
   `updated_at` trigger only; mutating-action `audit_events` rows are the action
   layer's job (`199:325-331`). Since no finance write actions exist, the only
   finance-adjacent audit today is Technical's `item_cost.recorded` row.

The action count and every gap above is derived from the files cited; the only WO
costing logic in the module is the read-only `wo-cost-actions.ts` +
`wo-cost-math.ts` pair, and the cost-per-kg master is written exclusively by the
03-technical cost ledger.
