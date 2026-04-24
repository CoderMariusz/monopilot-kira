# Finance Module — Prototype Translation Notes

**Source files scanned:** 6 prototype JSX files + BACKLOG.md  
**Date indexed:** 2026-04-23  
**Components indexed:** 22 (≥20 lines)  
**Relevant BACKLOG entries:** BL-FIN-01 through BL-FIN-08 (plus BL-PROD-05 for `.btn-danger`)

---

## Cross-cutting concerns (apply to ALL Finance components)

| Concern | Prototype pattern | Production equivalent |
|---|---|---|
| Money formatting | `fmtMoney()` / `fmtMoneySigned()` inline helpers | `Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })` wrapped in a `formatGbp(value, signed?)` util in `lib/format.ts` |
| Mono-font numbers | `className="mono"` / `fontFamily: var(--font-mono)` | Tailwind `font-mono` class; set up via `@font-face` in `globals.css` |
| CSS variables (`var(--blue)`, `var(--red)`, etc.) | Global CSS custom properties | Tailwind CSS variables via `tailwind.config.ts` theme extension; map each `--color` to a Tailwind token |
| Role checks (`role === "Finance Manager"`) | Prop-drilled `role` string | `auth()` from next-auth / clerk in Server Component; derive `isManager: boolean` and pass as prop or use a `hasPermission(session, 'finance.approve')` utility |
| `window.Modal` | Global modal primitive from `_shared/` | `@radix-ui/react-dialog` Dialog; create a shared `Modal` wrapper in `components/ui/modal.tsx` mirroring the same API (open, onClose, title, size, foot) |
| `Field` / `ReasonInput` / `Summary` | Shared primitives from `_shared/` | `shadcn/ui` FormField + Label + Textarea; create matching shared primitives in `components/finance/` |
| `TrendChart` | Custom zero-dep inline SVG | `shadcn/ui` Chart (Recharts LineChart); series/labels/colors API is compatible — just swap the render |
| `Stepper` | Custom stepper primitive | No shadcn Stepper yet — build `components/ui/stepper.tsx` using `ol` + CSS classes; or use a simple state machine |
| Hardcoded GBP everywhere | `£` symbol + `GBP` hardcoded | Read `finance_settings.base_currency` from DB; pass to format helpers; use `Intl.NumberFormat` with the configured currency code |
| E-signature PIN | `<input type="password" maxLength=6>` | `react-input-otp` or a custom OTP input component; PIN hashing (`SHA-256(approver_id + record_id + timestamp + PIN)`) done server-side in Node.js `crypto` module — never client-side |
| Hardcoded string labels | All user-facing strings inline | `next-intl` with `t('finance.module.key')` lookup; namespace per screen |
| `btn-danger` CSS class | Referenced in BACKLOG BL-PROD-05 as missing from `production.css` | Use shadcn `Button` with `variant="destructive"` — no custom CSS class needed |

---

## MODAL-01 — `std_cost_create_modal` (modals.jsx:21-101)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | create | composite

### Key translation decisions

- **Live cost breakdown bar** (`stack-bar` + `stack-legend`): The prototype uses three `<span>` elements with dynamic `width` set inline from percentage state. In production, compute percentages via `useWatch` on the three cost fields and render with Tailwind `style={{ width: \`${pct}%\` }}`. A CSS transition `transition-all duration-200` gives smooth bar animation on input.

- **>20% change warning** (`warnChange` flag): In the prototype this is pure client-side state comparison. In production the previous approved cost must come from the Server Component (fetched server-side); the threshold must come from `finance_settings.cost_change_warning_threshold_pct`. The warning banner is a shadcn `Alert` with `variant="warning"`.

- **Item dropdown** (hardcoded 5 items): Replace with a Drizzle query `SELECT item_code, item_name, item_type FROM items ORDER BY item_code` in the Server Component. Consider using a `Combobox` (shadcn) for searchable selection when the item count is large.

- **Draft vs Submit footer**: Both actions call the same Server Action `upsertStdCost(data, { status: 'draft' | 'pending' })`. The "submit for approval" path should also trigger a notification to Finance Managers via the notification outbox.

- **BL-FIN-07**: Dual sign-off for >20% cost change is deferred to Phase 2. When implementing, add a step after save that opens `ApproveStdCostModal` in "dual approver" mode requiring a second different approver's PIN.

---

## MODAL-02 — `approve_std_cost_modal` (modals.jsx:103-175)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | approve | composite

### Key translation decisions

- **Two-phase modal render** (form → success screen): Use a local `step: 'form' | 'success'` state. After the Server Action `approveStdCost(id, reason, pin)` resolves successfully, set `step = 'success'`. The success screen shows the SHA-256 audit hash returned by the Server Action.

- **PIN validation**: The Server Action receives the PIN as a plain string, computes `SHA256(approverId + recordId + timestamp + PIN)`, stores the hash in `std_cost_approvals.esig_hash`, and checks the PIN against the user's stored PIN hash (bcrypt) in the users table. Never store or log the raw PIN.

- **Bulk approve path**: When `data.bulk` is set (from the bulk action bar in `FinStandardCosts`), the Server Action receives an array of `ids[]` and approves each within a single DB transaction. On failure, the entire batch rolls back. Show a result summary in the success screen: "48 of 50 approved; 2 failed".

- **Old vs New cost diff panel**: The prototype fetches `oldRec` from the mock array. In production this requires a second Drizzle query `SELECT * FROM std_costs WHERE item_code = ? AND status = 'active' LIMIT 1` run server-side and passed as prop.

---

## MODAL-03 — `cost_history_modal` (modals.jsx:177-245)

**Taxonomy:** modal | detail-view | StandardCost | read-only | composite

### Key translation decisions

- **Version history data**: Prototype hardcodes 3 versions. Production fetches `SELECT * FROM std_costs WHERE item_code = ? ORDER BY effective_from DESC` — this includes all statuses (active, superseded, draft, pending). No editing occurs here; the "Create New Version" button closes the dialog and opens `StdCostCreateModal`.

- **Version compare selects**: The diff computation (`Change GBP` and `Change %`) is a client-side derived value from two selected version objects. No server round-trip needed. Use `useMemo` with the two selected version indices.

- **TrendChart data**: Prototype reverses the history array for chronological order and multiplies by 10000 for the SVG integer math. In production, pass the actual floating-point `total` values to Recharts — no multiplication needed.

- **Active row highlight** (blue left border): Use TanStack Table's row `className` callback: `className={row.original.status === 'active' ? 'border-l-2 border-blue-600' : ''}`.

---

## MODAL-04 — `bulk_import_csv_modal` (modals.jsx:247-340)

**Taxonomy:** wizard | import-export | StandardCost | import | composite

### Key translation decisions

- **File upload**: Use `react-dropzone` with `accept={{ 'text/csv': ['.csv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }}`. On drop, POST the file to a Next.js Route Handler `/api/finance/std-costs/import/parse` that streams CSV parsing via `papaparse` (CSV) or `xlsx` (Excel) and returns a `ParseResult` JSON.

- **Validate step (step 2)**: The `ParseResult` from the Route Handler contains `{ valid: Row[], errors: ErrorRow[], warnings: WarnRow[] }`. Render counts in the 3 summary tiles. Error rows get `className="bg-red-50"` in the DataTable.

- **Skip errors checkbox**: Passed as a boolean option to the final import Server Action `importStdCosts({ rows, skipErrors, submitForApproval })`. The action wraps all INSERTs in a DB transaction; skipped rows are logged to `import_skipped_rows` table for audit.

- **Template download**: Route Handler GET `/api/finance/std-costs/import/template` streams a CSV with headers derived from the Zod import schema's field names. This keeps template and validation in sync automatically.

- **Stepper component**: Build `components/ui/stepper.tsx` as a shared primitive — it will be reused by any other multi-step wizard across the app. Accept `steps: {key: string, label: string}[]`, `current: string`, `completed: Set<string>` props.

---

## MODAL-05 — `fx_rate_override_modal` (modals.jsx:342-383)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | edit | primitive

### Key translation decisions

- **Conditional validation**: Zod `superRefine` rule: `if (data.source === 'manual' && data.reason.length < 20) ctx.addIssue(...)`. This mirrors the prototype's `valid` boolean that requires reason only for manual source.

- **API Pull option**: When source = 'API Pull', the Server Action triggers an external FX rate fetch from a configured provider (e.g. Open Exchange Rates). The reason field is auto-populated with `"API pull from [provider] at [timestamp]"` and is not user-editable.

- **Historical transactions**: The prototype's disclaimer ("not recalculated") must be enforced in the Server Action — the UPDATE only affects the `fx_rates` record and its `effective_date`. Past `material_consumption_costs` records retain their original unit costs.

---

## MODAL-06 — `fifo_layers_modal` (modals.jsx:385-428)

**Taxonomy:** modal | detail-view | StandardCost | read-only | composite

### Key translation decisions

- **FIFO layer query**: `SELECT id, receipt_date, source_type, source_ref, qty_in, qty_remaining, unit_cost, (qty_remaining * unit_cost) as layer_value, (qty_remaining = 0) as exhausted FROM inventory_fifo_layers WHERE item_code = ? AND warehouse_id = ? ORDER BY receipt_date ASC`.

- **Exhausted rows**: In the prototype, exhausted rows use a `.exhausted` CSS class for strikethrough and dim. In production, use Tailwind `line-through opacity-50` conditional class on the TableRow.

- **Source ref link**: The `l.ref` field (e.g. `PO-2026-0042`) is a clickable link in the prototype. In production this should be a Next.js `Link` routing to the relevant PO or TO detail page based on `source_type`.

- **Performance**: FIFO layer queries can be expensive for high-turnover items. Add a React `cache()` wrapper and consider a short `revalidate: 30` on the layer data. The modal is opened from two places: FinInventoryValuation table and inline from the detail view.

---

## MODAL-07 — `variance_note_modal` (modals.jsx:430-463)

**Taxonomy:** modal | crud-form-with-validation | Variance | create | primitive

### Key translation decisions

- **Polymorphic context**: The modal accepts either a WO reference (`ctx.wo`) or an item reference (`ctx.item`). The DB schema should have `variance_notes(id, wo_id NULLABLE, item_code NULLABLE, category, text, created_by, created_at)` with a CHECK constraint ensuring at least one of `wo_id` or `item_code` is non-null.

- **Category enum**: Define as a TypeScript const `VARIANCE_NOTE_CATEGORIES = ['Root Cause', 'Supplier Issue', 'Production Issue', 'Quality Hold', 'Planned', 'Other'] as const`. Use this as the Zod enum source and the Select options source — single source of truth.

- **Notification**: After saving, optionally notify Finance Manager users via the notification outbox (INSERT into `notifications` table). This can be a background job to avoid blocking the modal close.

---

## MODAL-08 — `dlq_replay_modal` (modals.jsx:465-505)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | edit | primitive

### Key translation decisions

- **Idempotency key**: The Server Action `replayDlqEvent(id, reason)` must generate a new UUID v7 (`uuidv7()` from the `uuidv7` npm package) as the new idempotency key. This prevents duplicate processing if the replay is clicked multiple times.

- **Permanent error guard**: The `permanent` category warning (shown when `r.category === 'permanent'`) is cosmetic in the prototype. In production, consider blocking the replay button for permanent errors unless the user has an `Admin` role (Finance Manager can only replay transient errors).

- **Retry schedule**: The note "6-attempt retry schedule: immediate → +5m → +30m → +2h → +12h → +24h → DLQ" should be read from `d365_integration_settings.retry_schedule_json` rather than hardcoded. Render as a formatted list in the modal.

---

## MODAL-09 — `dlq_resolve_modal` (modals.jsx:507-537)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | approve | primitive

### Key translation decisions

- **Acknowledgement checkbox as required field**: Use `zod.literal(true, { errorMap: () => ({ message: 'You must acknowledge before resolving' }) })` to force the checkbox. The shadcn `FormMessage` will display this message below the checkbox if unchecked on submit.

- **Audit trail**: The `resolved_notes` field (min 30 chars) is stored in `dlq_events.resolution_notes` alongside `resolved_by`, `resolved_at`. An `audit_log` entry with `action='dlq.manual_resolve'` and `details={dlqId, notes}` must also be written.

- **Irreversibility**: Once resolved, the DLQ event cannot be replayed. The Server Action should set `status='resolved'` atomically and confirm no retry-eligible status is left.

---

## MODAL-10 — `export_report_modal` (modals.jsx:539-584)

**Taxonomy:** modal | import-export | StandardCost | export | primitive

### Key translation decisions

- **Async export pattern**: Server Action `requestExport(config)` INSERTs a row into `export_queue` and returns `{ jobId }`. The client polls `GET /api/finance/exports/[jobId]/status` every 3 seconds via SWR. When status = 'complete', the response includes a signed URL from Vercel Blob / R2. The client auto-triggers `window.location.href = signedUrl` to download.

- **PDF export**: Requires a Puppeteer edge function or a serverless Lambda that renders the report as HTML and uses Chromium to PDF. Reference BL-RPT-04 (`@media print` stylesheet). Pass the `notes` field as a footer annotation.

- **CSV export**: A Next.js Route Handler `/api/finance/exports/[jobId]/download` streams the Drizzle query result as CSV using `papa.unparse()`. No file stored server-side for CSV — stream directly on download.

- **Date range presets**: `MTD`, `Last Month`, `QTD`, `YTD` are computed server-side from the current date. Custom range uses two DatePicker inputs. Pass the resolved `{ from: string, to: string }` to the export Server Action.

---

## MODAL-11 — `supersede_std_cost_modal` (modals.jsx:586-613)

**Taxonomy:** modal | crud-form-with-validation | StandardCost | edit | primitive

### Key translation decisions

- **21 CFR Part 11 enforcement**: The Server Action `supersedeStdCost(id, supDate)` must verify server-side that the record's current `status === 'active'`. If not, return a 422 error. The original approval hash (`std_cost_approvals.esig_hash`) must NOT be modified or deleted.

- **Effective_to date**: Default to `new Date().toISOString().split('T')[0]` (today) server-side. The DatePicker should disallow dates before the record's `effective_from` date (min date constraint).

- **Flow after supersede**: After successful supersede, the dialog should close and either redirect to `StdCostCreateModal` (to create the replacement) or show a toast with a "Create Replacement" CTA button.

---

## MODAL-12 — `period_lock_modal` (modals.jsx:615-647)

**Taxonomy:** modal | crud-form-with-validation | CostCenter | approve | primitive

### Key translation decisions

- **Irreversible action**: The prototype notes "cannot be undone". Enforce this in the Server Action — there is NO unlock Server Action in Phase 1. The shadcn `Button` for "Lock Period" must use `variant="destructive"`.

- **Period options**: Fetch `SELECT id, period_name FROM fiscal_periods WHERE status = 'open' ORDER BY period_start` from Drizzle. Do not hardcode months.

- **PIN + reason**: Same PIN validation pattern as `ApproveStdCostModal`. Extract to a shared `validateEsignature(userId, pin): Promise<boolean>` utility. The audit log entry must include `SHA256(userId + periodId + timestamp + PIN)`.

- **Phase 2 gate**: This modal is accessible from `FinSettings` with a "Phase 2" badge. In Phase 1 production, keep the button but show a `toast` "Period locking available in Phase 2" instead of opening the modal — or gate it behind a `fiscal_period_lock.enabled` feature flag.

---

## FIN-001 — `fin_dashboard` (dashboard.jsx:1-215)

**Taxonomy:** page-layout | dashboard-tile | Variance | read-only | page-level

### Key translation decisions

- **Data fetching**: Six independent data sources (KPIs, alerts, trend, contributors, breakdown, yield loss) should be fetched in parallel via `Promise.all([ ... ])` in the Server Component. Each fetch is a Drizzle call wrapped in `React.cache()` to avoid duplicate queries if the data is shared across components.

- **KPI 6-card row**: Build a reusable `<FinKpiCard label trend sub accent href>` client component. The `accent` prop maps to a Tailwind ring/border color (blue, red, amber, green, gray). The card is clickable (`href` → Next.js Link).

- **Inline banner alerts with dismiss**: The `dismissed` Set in prototype `useState` needs persistence. Option A: localStorage (client-only, resets on new session). Option B: `user_preferences` table (persists across devices). Implement with a Server Action `dismissAlert(userId, alertCode)` + optimistic update.

- **Variance Alerts panel**: Real-time data from `SELECT wo_id, variance_type, variance_amount, variance_pct FROM wo_variance_alerts WHERE severity IN ('critical','warning') ORDER BY severity DESC, ABS(variance_pct) DESC LIMIT 10`. Link each row to `/finance/wo-costs/[woId]`.

- **Waterfall chart**: The `waterfall` div pattern in the prototype uses CSS-width bars for each variance component. In production, build a `<WaterfallChart>` client component using Recharts `ComposedChart` (Bar + Line) or a custom SVG — this is a commonly needed chart type; abstract it.

- **Onboarding checklist**: The `FIN_ONBOARD` steps map to a `finance_onboarding_steps(user_id, step_key, completed_at)` table. Pre-seed the 5 steps for each Finance user at account setup. Hide the checklist when all steps are complete.

---

## FIN-002 — `fin_standard_costs_list` (standard-screens.jsx:1-208)

**Taxonomy:** page-layout | search-filter-list | StandardCost | bulk | page-level

### Key translation decisions

- **URL-first filter state**: Use `nuqs` for all filter params (`?tab=active&search=nugget&itemType=FA&effFrom=2026-01-01&costBasis=Quoted`). This makes filters shareable as URLs and survives page reload.

- **Tab counts**: Use a single Drizzle query `SELECT status, COUNT(*) FROM std_costs GROUP BY status` to get all counts in one round-trip; render all tabs from the result.

- **Expandable row detail**: TanStack Table's `getExpandedRowModel()` provides the expand/collapse toggle. The expanded sub-row renders the approval record (avatar + hash + timestamp) and the notes — both available from the same Drizzle query with a JOIN on `std_cost_approvals`.

- **Bulk action bar**: TanStack Table row selection state (`rowSelection` object) drives the bulk action bar visibility. Bulk approve calls `bulkApproveStdCosts(ids: string[])` Server Action that runs approval logic for each ID in a DB transaction. Partial failure returns `{ approved: string[], failed: { id: string, error: string }[] }`.

- **Coverage alert**: `SELECT COUNT(*) FROM items WHERE item_type='FA'` minus `SELECT COUNT(DISTINCT item_code) FROM std_costs WHERE status='active'` gives uncovered items. If >0, render the amber Alert.

---

## FIN-005 — `fin_inventory_valuation` (variance-screens.jsx:1-117)

**Taxonomy:** page-layout | search-filter-list | StandardCost | read-only | page-level

### Key translation decisions

- **FIFO vs WAC switch**: The valuation method and date are URL params. Switching triggers a server navigation (`router.replace('?method=WAC&asOf=...')`), which re-renders the Server Component with fresh Drizzle data. The recalculate button enqueues a background job, not a synchronous recalculation.

- **Value Distribution bars**: The `inv-dist-row` bars use `width: dist.pct + "%"` inline. In production, derive pct from the Drizzle GROUP BY query: `SELECT item_type, SUM(qty * avg_cost) as value FROM inventory_fifo_layers GROUP BY item_type`. Map item types to color classes.

- **FIFO layer link**: The `layers` column in the table is a clickable count that opens `FifoLayersModal`. In production this triggers a client-side modal with the item's data pre-loaded via a `useQuery` or `SWR` fetch.

- **Page total footer**: TanStack Table's `getFilteredRowModel()` gives the filtered rows; sum their `value` field client-side for the "Page total". The "All pages total" is a separate server-fetched scalar.

---

## FIN-006 — `fin_fx_rates` (variance-screens.jsx:119-250)

**Taxonomy:** page-layout | list-with-actions | StandardCost | edit | page-level

### Key translation decisions

- **Rate Age badge**: Computed server-side as `EXTRACT(EPOCH FROM (now() - updated_at)) / 86400` (days since update). Map to badge variants: >7 = `badge-red` (expired), >5 = `badge-amber` (stale), ≤5 = `badge-green` (fresh).

- **Rate History + TrendChart**: Fetched on currency selection change. Use SWR with `key = ['fx-history', selCurrency]` to cache per currency. TrendChart passes actual float rates to Recharts (no integer multiplication).

- **Stale rate auto-detection**: The stale rate Alert is rendered server-side. The server checks `WHERE updated_at < now() - INTERVAL '7 days' AND status = 'active'` — if any match, the Alert is pre-rendered.

---

## FIN-007 — `fin_material_variance` (variance-screens.jsx:252-357)

**Taxonomy:** page-layout | search-filter-list | Variance | read-only | page-level

**Known bugs from BACKLOG:** BL-FIN-01 (full MPV/MQV decomposition is Phase 2 only)

### Key translation decisions

- **Variance query**: The core query is a CTE or view: `WITH material_var AS (SELECT item_code, SUM(actual_qty) as actual_qty, SUM(std_qty) as std_qty, SUM(actual_qty - std_qty) as usage_delta, AVG(actual_unit_cost) as actual_unit, AVG(std_unit_cost) as std_unit, SUM(variance_amount) as total_var FROM material_consumption_costs WHERE period_start >= ? AND period_end <= ? GROUP BY item_code)`. Join with `items` for name/type.

- **WO count link**: The `woCount` column links to `/finance/variance/drilldown?item={itemCode}`. Alternatively, open an inline Popover listing the specific WO numbers.

- **Phase 2 KPI tiles (MPV/MQV)**: Render with muted values, a `Badge variant="secondary"` labeled "Phase 2", and a tooltip "Full decomposition available in EPIC 10-I". Do not hide them — visibility communicates the roadmap.

---

## FIN-008 — `fin_labor_variance` (variance-screens.jsx:359-452)

**Taxonomy:** page-layout | search-filter-list | Variance | read-only | page-level

**Known bugs from BACKLOG:** BL-FIN-01 (LRV/LEV decomposition is Phase 2 only)

### Key translation decisions

- **Labor variance query**: `SELECT w.wo_id, op.operation_name, l.line_name, w.std_hours, w.actual_hours, (w.actual_hours - w.std_hours) as hrs_delta, w.std_rate, w.actual_rate, (w.std_hours * w.std_rate) as std_cost, (w.actual_hours * w.actual_rate) as actual_cost, ((w.actual_hours * w.actual_rate) - (w.std_hours * w.std_rate)) as variance FROM wo_labor_actuals w JOIN operations op ON ... JOIN production_lines l ON ...`.

- **Filter options for lines/operations**: Fetched from `production_lines` and `operations` tables server-side; passed as props to the filter bar Select components.

- **'View WO' button**: Routes to `/production/work-orders/[woId]` (cross-module link to Production module) or to `/finance/wo-costs/[woId]` for the cost view. Clarify with UX which destination is preferred.

---

## FIN-010 — `fin_variance_drilldown` (variance-screens.jsx:454-621)

**Taxonomy:** page-layout | detail-view | Variance | read-only | page-level

### Key translation decisions

- **URL-driven level state**: Use URL params `?level=2&cat=Material&item=RM-BREAST-001&wo=WO-2026-0108` instead of `useState`. This makes drill-down paths deep-linkable (e.g. Finance Manager can share a specific item's drill-down URL). On level change, call `router.replace(url)` with updated params. Each level's data is fetched by the Server Component based on the params present.

- **Level 0 category tiles**: Data from a single Drizzle query: `SELECT 'Material' as cat, SUM(variance_amount) as value FROM material_consumption_costs WHERE period = ? UNION ALL SELECT 'Labor', SUM(variance) FROM wo_labor_actuals WHERE period = ? ...`. Four categories, four tile cards.

- **Level 3 embedded WO summary**: Rather than a full WO detail page, render a condensed version of `FinWoDetail` (first card + variance breakdown). The transaction list is fetched from `material_consumption_costs WHERE wo_id = ? AND item_code = ?`.

- **Level 4 transaction**: Full raw record view from `material_consumption_costs` JOIN `inventory_fifo_layers` — the source link points to the Warehouse LP movement screen.

- **Side panel sticky**: Tailwind `sticky top-24` on the side card. The "running variance" value changes per level — computed from the URL params and current data.

---

## FIN-003a — `fin_wo_list` (wo-screens.jsx:1-122)

**Taxonomy:** page-layout | search-filter-list | WO | read-only | page-level

### Key translation decisions

- **Variance filter**: Maps to Drizzle WHERE clauses. For `>5%` filter: `WHERE ABS(variance_pct) > 5`. For `favorable`: `WHERE variance_amount < 0`. Combine with status filter and text search.

- **D365 Journal Ref column**: A `Link` to `/finance/d365?tab=batches&journal={journalRef}` when ref is present. The `—` state is rendered as `text-muted-foreground`.

- **Row click → WO detail**: Use Next.js `Link` wrapping the table row is problematic with interactive cells. Instead, use `useRouter().push()` on `onClick` for the row, and `e.stopPropagation()` on the action button cell — same pattern as the prototype.

- **WoCostStatus badge**: `open` → `amber`, `closed` → `blue`, `posted` → `green`. Build as a shared `<WoCostStatusBadge status={s} />` component reused in `FinWoDetail`.

---

## FIN-003b — `fin_wo_detail` (wo-screens.jsx:124-366)

**Taxonomy:** page-layout | detail-view | WO | read-only | page-level

### Key translation decisions

- **Data fetching strategy**: The WO detail aggregates from multiple tables. Use a single Drizzle `db.transaction(async tx => ...)` or a materialized `wo_cost_summary` view for performance. Key joins: `wo_completions` + `wo_cost_actuals` + `wo_labor_actuals` + `material_consumption_costs` + `variance_notes` + `wo_d365_postings`.

- **Cost breakdown bars + Waterfall**: These same UI patterns appear in `FinDashboard`. Extract `<CostBreakdownBars>` and `<WaterfallChart>` as shared client components in `components/finance/charts/`. Accept `{ cat, actual, std, color, variance }[]` as the data prop.

- **Expandable variance rows**: Use shadcn `Accordion`. Each `AccordionItem` corresponds to material/labor/overhead/waste. The Phase 2 sub-components (MPV/MQV, LRV/LEV) are rendered as muted placeholder text within the accordion content with a "Phase 2" badge.

- **Cascade table**: Only rendered when `cascade` data is present. The recursive CTE query for cascade cost rollup: `WITH RECURSIVE cascade AS (SELECT wo_id, parent_wo_id FROM wo_dependencies WHERE wo_id = ? UNION ALL SELECT d.wo_id, d.parent_wo_id FROM wo_dependencies d JOIN cascade c ON c.wo_id = d.parent_wo_id)`. Pass as a prop from the Server Component.

- **Border color driven by variancePct**: The cost summary card has a dynamic left border color. Use Tailwind dynamic classes: keep `border-l-4` static; add a dynamic color class via `cn({ 'border-red-500': pct >= 10, 'border-amber-500': pct >= 5 && pct < 10, 'border-green-500': pct < 5 })`.

- **D365 posting status**: A separate row in `wo_d365_postings` per WO. Pending = amber, posted = green, not yet closed = gray.

---

## FIN-011 — `fin_reports` (other-screens.jsx:1-142)

**Taxonomy:** page-layout | list-with-actions | StandardCost | export | page-level

### Key translation decisions

- **Saved reports catalog**: Seed system reports in a Drizzle migration as `{ id, name, description, report_type, config_json, is_system: true }`. User-created reports have `is_system: false` and `created_by: userId`. System reports cannot be deleted.

- **Custom report builder**: The left-panel form fields drive a `previewReport(config)` Server Action that runs the appropriate Drizzle query with LIMIT 25 and returns `{ rows, totalCount }`. Debounce the preview call by 500ms after the last field change.

- **Export Queue table**: Poll every 30s via `useEffect` + `router.refresh()` or SWR `refreshInterval: 30000`. The Download button uses a signed URL from Blob storage (Vercel Blob / R2 / S3) with a 1-hour expiry.

- **Report Type to query handler mapping**: Create `lib/finance/reports/handlers/` directory with one file per report type (e.g., `cost-by-product.ts`, `variance-summary.ts`). Each handler exports a `query(config, db): Promise<Row[]>` function. This makes adding new report types straightforward.

---

## FIN-016 — `fin_d365_integration` (other-screens.jsx:144-360)

**Taxonomy:** page-layout | list-with-actions | StandardCost | read-only | page-level

### Key translation decisions

- **Connection status**: Server Component calls `pingD365()` — a Server Action that makes a lightweight request to the D365 health-check endpoint with a 5-second timeout. The connected/disconnected status is rendered server-side (no client-side polling for initial render). Add a "Refresh Status" button that calls `router.refresh()`.

- **DLQ alert badge**: The 4-KPI row "DLQ Open" tile uses `variant="destructive"` when `dlqOpen > 0`. This is the most important metric on the page — consider adding a sticky alert bar at the top of the page (above the KPI tiles) when DLQ > 0, similar to the prototype's amber alert.

- **Outbox queue Last Error column**: Use a Tooltip that shows the full error text on hover (shadcn `Tooltip` + `TooltipContent`). The cell itself uses Tailwind `truncate max-w-xs` to clip the text.

- **DLQ Replay / Resolve**: Both buttons open modals via client-side state. The page needs to be a Client Component shell (or use a server/client boundary) for the modal state management.

- **GL Mapping tab**: Inline table with Edit buttons. Uses the same `CostCenterModal` for create and edit. The modal is opened via `openModal('costCenter', row)` pattern.

- **Settings tab**: Consider whether this tab should be deprecated in favor of `FinSettings` page — the two overlap on D365 fields. For Phase 1, keep the tab but mark it as read-only with a link to the full Settings page.

---

## Finance Settings — `fin_settings` (other-screens.jsx:362-458)

**Taxonomy:** page-layout | crud-form-with-validation | CostCenter | edit | page-level

### Key translation decisions

- **Dirty state + sticky save bar**: The sticky save bar is a pattern used across multiple settings screens. Extract `<UnsavedChangesBar onSave={...}>` as a shared component in `components/shared/`. It uses `position: sticky; top: 0; z-index: 50` with a backdrop blur.

- **7-section card layout**: Each section is a shadcn `Card` with a `CardHeader`. The section structure maps directly to the `finance_settings` DB table schema. Consider grouping related sections into a `Tabs` layout for mobile usability.

- **Fiscal Calendar type select** (Standard/4-4-5/4-5-4): Changing the calendar type affects how periods are calculated. Show an `Alert` warning "Changing the fiscal calendar type will affect all future period calculations. Existing period records are not affected." when the user changes this field.

- **Server Action `updateFinSettings(data)`**: This should be a single upsert on a `finance_settings` singleton table (one row per `site_id`). Include field-level RBAC: `cost_change_warning_threshold_pct` and variance thresholds editable by Finance Manager; all other fields require Admin.

- **Period Lock section (Phase 2)**: The "Lock Period (preview)" button is functional in the prototype — it opens `PeriodLockModal`. In production Phase 1, gate it behind `fiscal_period_lock.enabled` feature flag. If flag is off, show the button as disabled with a tooltip "Available in Phase 2".

---

## Known Bugs Summary (Finance module)

| BACKLOG ID | Description | Affects | Priority |
|---|---|---|---|
| BL-FIN-01 | Full MPV/MQV decomposition not implemented — P2 EPIC 10-I | `fin_material_variance`, `fin_labor_variance`, `fin_wo_detail` | P2 |
| BL-FIN-02 | Real-time variance tiles (FIN-009) scaffolded placeholder | `fin_d365_integration` | P2 |
| BL-FIN-03 | BOM cost rollup (FIN-004) scaffolded, links to 03-Technical BOM | None (P2 placeholder screen) | Medium |
| BL-FIN-04 | Margin analysis (FIN-013) needs Sales module + sell-price data | None (P2 placeholder screen) | P2 |
| BL-FIN-05 | Budget & forecast (FIN-014/015, EPIC 10-F) scaffolded | None (P2 placeholder screen) | P2 |
| BL-FIN-06 | BOM cost simulation (FIN-012) not built | None (P2 placeholder screen) | Medium |
| BL-FIN-07 | Dual sign-off for >20% cost change mentioned in MODAL-01 warning but not enforced | `std_cost_create_modal`, `approve_std_cost_modal` | Medium |
| BL-FIN-08 | Complaint cost allocation, AR/AP bridge, landed cost variance are P2 scope | None | P2 |
| BL-PROD-05 | `.btn-danger` CSS class missing from `_shared/shared.css` — affects `PeriodLockModal` and `FinStandardCosts` bulk delete button | `period_lock_modal`, `fin_standard_costs_list` | **HIGH** — use shadcn `Button variant="destructive"` to avoid this issue entirely in production |

---

## Shared component extraction checklist

Before translating individual screens, build these shared components first to avoid duplication:

| Component | Used by | Notes |
|---|---|---|
| `<Modal>` wrapper | All 13 modals | Wraps `@radix-ui/react-dialog`; API: `open`, `onClose`, `title`, `size ('default'\|'wide')`, `foot` |
| `<SummaryList rows=[{label,value,emphasis,mono}]>` | MODAL-02, 03, 05, 06, 07, 08, 09, 11 | dl/dt/dd pattern; emphasis → font-semibold; mono → font-mono |
| `<PinInput>` | MODAL-02, MODAL-12 | 6-digit OTP input; value/onChange; use `react-input-otp` |
| `<ReasonInput>` | MODAL-02, 05, 07, 08, 09, 12 | Textarea + Zod min-length + live char count |
| `<StdStatusBadge status>` | MODAL-01, 03, 11, FIN-002 | active→green, pending→amber, draft→outline, superseded→secondary |
| `<VarBadge value percent size>` | FIN-002, 003a, 003b, 007, 008 | Color: >10%=destructive, >5%=warning, ≤5%=secondary |
| `<WoCostStatusBadge status>` | FIN-003a, 003b | open=amber, closed=blue, posted=green |
| `<ItemTypeBadge t>` | MODAL-01, 04, FIN-002, 005 | FA/RM/Intermediate/Co-product/By-product color map |
| `<Stepper steps current completed>` | MODAL-04 (and future wizards) | shared primitive; no shadcn built-in |
| `<KpiCard label value sub accent href>` | FIN-001, 005, 007, 008, 016 | Reusable finance KPI tile |
| `<CostBreakdownBars breakdown>` | FIN-001, 003b | Bar rows per cost category |
| `<WaterfallChart bars>` | FIN-001, 003b | Std→Actual waterfall; Recharts ComposedChart |
| `<TrendChart series colors labels yMax>` | MODAL-03, FIN-001, 006 | Recharts LineChart wrapper |
| `<AgingBadge a>` | FIN-005 | 0-30d/30-60d/60-90d/90d+ badge variants |
| `<DlqCategoryBadge c>` | MODAL-08, 09, FIN-016 | permanent=destructive, transient=warning |
| `<FxSourceBadge s>` | FIN-006 | manual=outline, api=secondary |
| `<D365BatchStatus s>` | FIN-016 | posted=green, pending=amber, failed=red |
| `<RankBar pct dir>` | FIN-001, 010 | Horizontal bar with fav/unfav color |
| `<UnsavedChangesBar onSave>` | FinSettings (and other settings screens) | Sticky top save bar |
| `<EmptyState icon heading body ctas>` | FIN-002, 003a | Centered empty state panel |
