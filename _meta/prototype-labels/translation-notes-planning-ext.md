# Translation Notes — Planning Extended (planning-ext)

Prototype module: `design/Monopilot Design System/planning-ext/`
Generated: 2026-04-23
Components indexed: 23

---

## How to use this document

Each section maps one prototype component to its production translation concerns. Agents implementing production code should:

1. Read the prototype file at the listed line range.
2. Apply every bullet in the section as a concrete implementation requirement.
3. Check `known_bugs` — each item links to a `BL-PEXT-*` entry in `BACKLOG.md` that must be resolved during translation.
4. Use only the listed `shadcn_equivalent` primitives; do not introduce new UI libraries without ADR approval.

---

## Modals (`modals.jsx`)

### `run_scheduler_modal` — lines 21–95

**Label:** `run_scheduler_modal` | **Domain:** Sequence | **Time estimate:** 90 min

Wizard-style run launcher. Collects horizon, line selection (multi-checkbox), and forecast inclusion flag before submitting a solver run.

**Translation notes:**
- `Modal` primitive → `@radix-ui/react-dialog` `Dialog` with controlled `open`/`onOpenChange`.
- Local `useState` (horizon, linesChecked, includeForecast, submitting) → `useForm` (react-hook-form) + `zodResolver`; add Zod rule `linesChecked.size >= 1` for the "at least one line" validation.
- Mock `PEXT_LINES` array → Drizzle query `db.select().from(productionLines).where(eq(lines.active, true))` in Server Component loader; pass as prop.
- Hardcoded `setTimeout` fake submit → Server Action `runOptimizerAction(formData)` calling solver microservice endpoint; RBAC guard (role IN `['Planner','Admin']`).
- Emit outbox event `scheduler.run.requested` on submit success.
- Optimizer version string → read from `feature_flags` table key `allergen_sequencing_optimizer_v2`; do not hardcode.
- Hardcoded labels → next-intl keys `scheduler.run.*`.

**shadcn:** Dialog, DialogContent, DialogHeader, DialogFooter, Checkbox, Button, Label, Badge

---

### `override_assignment_modal` — lines 98–212

**Label:** `override_assignment_modal` | **Domain:** WO | **Time estimate:** 120 min

Override with reason code, allergen conflict detection, and impact preview. Wide modal.

**Translation notes:**
- `size='wide'` → Dialog with `className max-w-3xl` in DialogContent.
- Allergen incompatibility computed inline (`wo.allergen.includes`) → derive from `changeover_matrix` join in loader; pass `allergenConflict: boolean` and `blocked: boolean` as typed props to eliminate client-side matrix lookups.
- Reason code dropdown options → reference data table `override_reason_codes`; labels via next-intl.
- Impact preview (new CO delta) → compute server-side via `getChangeoverImpact(fromAllergen, toAllergen, lineId)` helper; return with form action result.
- Fake submit `setTimeout` → Server Action `overrideAssignmentAction` with V-SCHED-02/03/04 validators, audit log write, outbox `scheduler.assignment.overridden`.
- `blocked` hard-stops the submit button → also enforce in Server Action; return structured error for toast display.
- Hardcoded labels → next-intl keys `scheduler.override.*`.

**shadcn:** Dialog, DialogContent, Select, Input, Textarea, Button, Alert, Label

---

### `reschedule_wo_modal` — lines 214–287

**Label:** `reschedule_wo_modal` | **Domain:** WO | **Time estimate:** 100 min

Manual reschedule variant of override modal. Adds FA–line eligibility gate with explicit acknowledgement checkbox.

**Translation notes:**
- FA-line eligibility mock array → derive from `fa_line_compatibility` join table in Server Component loader; pass `eligibleLineIds: string[]` as prop.
- `size='wide'` → Dialog with `className max-w-3xl`.
- Acknowledgement checkbox for ineligible line → record `ack_override_reason: true` in Server Action payload; store in `scheduler_assignment_overrides.ack_ineligible` column.
- Cross-field validation `isEligible || ackIneligible` → zod `.superRefine()` rule matching V-SCHED-03.
- Fake submit → Server Action `rescheduleWOAction` with cascade dependency check (V-SCHED-04 no overlap) + outbox `scheduler.wo.rescheduled`.
- Shift window constraint on `datetime-local` → enforce in Server Action using `shift_definitions` table; return field-level error on violation.
- Hardcoded reason codes → reference data; next-intl for labels.

**shadcn:** Dialog, DialogContent, Select, Input, Checkbox, Button, Alert, Label

---

### `approve_all_modal` — lines 289–320

**Label:** `approve_all_modal` | **Domain:** WO | **Time estimate:** 45 min

Bulk confirm dialog. Approves all draft assignments from a run group.

**Translation notes:**
- `size='default'` → Dialog with `className max-w-lg`.
- Hardcoded `count` prop → pass as `draftCount: number` derived from `db.select().from(schedulerAssignments).where(eq(status,'draft'))` scoped to run group.
- Fake submit → Server Action `approveAllAssignmentsAction(runGroupId)` with RBAC (Planner Advanced or Scheduling Officer); bulk UPDATE + outbox `scheduler.assignment.approved` × N.
- Summary rows → extract to shared `<SummaryList rows={[]} />` server component for reuse across modals M-04, M-06, M-11.
- Warning alert "approves from all runs" → keep as permanent static text, not dismissible.
- Prefer single batched outbox event `scheduler.assignments.bulk_approved` with array payload over N individual events.
- Hardcoded labels → next-intl keys `scheduler.approveAll.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Button, Alert

---

### `matrix_cell_edit_modal` — lines 322–378

**Label:** `matrix_cell_edit_modal` | **Domain:** Allergen | **Time estimate:** 75 min

Edit a single changeover matrix cell. Admin-only `segregation_required` field.

**Translation notes:**
- Dynamic title `${from} → ${to}${lineId ? ' · '+lineId : ''}` → computed from typed props; never from URL string manipulation.
- `segregation` checkbox disabled for Planner → **hide** entirely for non-Admin role (do not just disable); enforce in Server Action via RBAC check matching V-CM-04.
- V-CM-02 (minutes int ≥ 0) → zod `z.number().int().min(0)` with `.refine(v => v <= 120, { message: 'Validate >120 with production team' })` as warning.
- Fake `onSave` callback → Server Action `updateMatrixCellAction` writing to `changeover_matrix_cells` staging table; creates pending version draft, no immediate publish.
- Notes field → `changeover_matrix_cells.notes` column; add `z.string().max(500)` validation.
- When `segregation_required` toggled to `true` → require a separate admin-only confirmation step (separate small Dialog or AlertDialog).
- Hardcoded labels → next-intl keys `matrix.cell.*`.

**shadcn:** Dialog, DialogContent, Input, Checkbox, Textarea, Button, Alert, Label

---

### `matrix_publish_modal` — lines 380–412

**Label:** `matrix_publish_modal` | **Domain:** Allergen | **Time estimate:** 50 min

Confirm publish of a new changeover matrix version with version notes.

**Translation notes:**
- New version number → derive from `MAX(version_number) + 1` inside Server Action `publishMatrixVersionAction`; never compute on client.
- Pre-confirm summary (cells modified, per-line overrides count) → Server Action returns a diff summary response before final commit step; render in Dialog before user confirms.
- Version notes textarea → `changeover_matrix_versions.notes` column.
- Warning "affects next scheduler run" → accurate description; in-progress runs use a snapshot version_id captured at run start.
- Outbox event `changeover_matrix.version.published` with `{ version_id, cells_changed, overrides_modified }` payload.
- Hardcoded `PEXT_MATRIX_VERSIONS` → Drizzle query for latest version metadata.
- Hardcoded labels → next-intl keys `matrix.publish.*`.

**shadcn:** Dialog, DialogContent, Textarea, Button, Alert, Label

---

### `matrix_import_modal` — lines 414–470

**Label:** `matrix_import_modal` | **Domain:** Allergen | **Time estimate:** 150 min

3-stage CSV import wizard (upload → validate → preview diff).

**Known bugs:** BL-PEXT-09 (diff rows are sample data, not real diff vs historical version)

**Translation notes:**
- 3-stage state machine (`upload | validate | preview`) → `useReducer` with discriminated union `ImportStage`; upload triggers Server Action `validateMatrixCSVAction` returning `{ rows: MatrixRow[], errors: ValidationError[], diff: MatrixCellDiff[] }`.
- Dropzone `div onClick` → `react-dropzone` with `.csv,.txt` accept; enforce 5 MB / 10,000 rows server-side.
- Simulated parsing delay → real CSV parse on server (Papa.parse or Node stream); for >1,000 rows stream progress via Server-Sent Events.
- Preview diff table → server returns typed `MatrixCellDiff[]` with `change: 'modified' | 'added' | 'removed'` field; render color-coded rows matching heatmap legend classes.
- V-CM-01..V-CM-04 server errors → map error array to row-level feedback in preview table.
- "Apply import" → Server Action `applyMatrixImportAction(draftId)` promoting staging rows to active draft version.
- Hardcoded labels → next-intl keys `matrix.import.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Button, Alert, Table, TableHeader, TableBody, TableRow, TableCell, Badge

---

### `matrix_diff_modal` — lines 472–496

**Label:** `matrix_diff_modal` | **Domain:** Allergen | **Time estimate:** 60 min

Full-page read-only diff of a historical matrix version vs the active version.

**Known bugs:** BL-PEXT-09 (version diff modal shows sample rows, not real diff vs historical)

**Translation notes:**
- `size='fullpage'` → Dialog with `className max-w-6xl` or a full-width `Sheet` (side='bottom') for very wide matrices.
- Hardcoded diff rows → loader or Server Action `getMatrixVersionDiff(versionId, activeVersionId)` returning typed `MatrixCellDiff[]`.
- Color-coded diff cells → CSS classes driven by `diff.change` field; extract to shared `<DiffCell change="modified|added|removed" />` component.
- Delta column (±N min) → compute server-side `override_min - default_min`; color-code negative (green) vs positive (red).
- Add a "Download diff as CSV" button using Server Action streaming CSV response.
- Hardcoded labels → next-intl keys `matrix.diff.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Button, Alert, Table, TableHeader, TableBody, TableRow, TableCell

---

### `forecast_upload_modal` — lines 498–560

**Label:** `forecast_upload_modal` | **Domain:** Forecast | **Time estimate:** 120 min

2-stage CSV upload wizard for demand forecast data with overwrite policy.

**Translation notes:**
- 2-stage state machine (`upload | preview`) → `useReducer`; upload triggers Server Action `validateForecastCSVAction` parsing `product_code, week_iso, qty_kg` columns.
- Dropzone → `react-dropzone` with `.csv,.txt` accept; 5 MB / 10,000 rows enforced server-side.
- Overwrite policy radio (`replace | keep`) → `upsert_policy: 'replace' | 'upsert'` param in `uploadForecastAction`.
- Preview table → server returns paginated `ForecastRow[]`; render max 20 rows with "…N more rows" indicator; full data available after commit.
- V-SCHED-09 retention window (3-year) → enforce in Server Action; return field-level error if `week_iso` out of range.
- Outbox event `forecast.upload.completed` with `{ weeks_covered, products_count }` payload on commit.
- Download CSV template → static asset at `/files/forecast-template.csv` served from object storage or Edge Route.
- Hardcoded labels → next-intl keys `forecast.upload.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Button, Alert, Table, TableHeader, TableBody, RadioGroup, RadioGroupItem, Label

---

### `disposition_decision_modal` — lines 562–629

**Label:** `disposition_decision_modal` | **Domain:** LP | **Time estimate:** 150 min

P2 countdown-driven disposition decision (To Stock vs Direct Continue) for finished-good LPs.

**Known bugs:** BL-PEXT-03 (disposition bridge wiring to notification tray + reminder-after-15min loop is P2)

**Translation notes:**
- Countdown `setInterval` → compute `deadline` server-side; client renders remaining time via `useInterval(callback, 1000)` against `Date.now()` with `deadline` as stable reference to avoid drift.
- "+1h / +4h" extend buttons → Server Action `extendDispositionDeadlineAction(lpId, extensionHours)` updating `disposition_deadline` column; revalidate path.
- Radio card selection → shadcn `RadioGroup` with styled card items; form value, not local `useState`.
- LP shelf-life display (V-SCHED-10) → derive from `lot_palettes.expiry_date - now()` in loader; pass as `shelfLifeHoursRemaining: number`.
- Default auto-decision "To Stock" at deadline → background `pg_cron` job or Temporal workflow writing to `disposition_decisions` and emitting outbox.
- P2 gate → check `feature_flags.disposition_bridge` in parent layout; show locked card if disabled.
- All Polish strings (e.g. "Farsz pierogowy") → replace with data from `work_orders.product_name_display` using the user locale; next-intl keys `disposition.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, RadioGroup, RadioGroupItem, Button, Alert, Label

---

### `rerun_confirm_modal` — lines 631–648

**Label:** `rerun_confirm_modal` | **Domain:** Sequence | **Time estimate:** 35 min

Simple confirm dialog to re-run the scheduler with identical parameters.

**Translation notes:**
- `size='sm'` → Dialog with `className max-w-md`.
- New run ID preview → do not display a speculative ID on the client; show "Run ID: auto-generated" and reveal actual ID in the success toast.
- Summary rows (source run, horizon, lines) → props derived from the `scheduler_runs` row in parent; no additional fetch needed.
- Confirm → Server Action `rerunSchedulerAction(sourceRunId)` cloning input snapshot and enqueuing solver job.
- Disclaimer "existing run is unchanged" → keep as static disclaimer text below summary rows.
- Hardcoded labels → next-intl keys `scheduler.rerun.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Button

---

### `disable_v2_modal` — lines 650–675

**Label:** `disable_v2_modal` | **Domain:** Sequence | **Time estimate:** 55 min

Destructive type-to-confirm modal for disabling the v2 optimizer rule.

**Known bugs:** BL-PROD-05 (`.btn-danger` missing from shared.css — destructive confirms fall back to primary styling)

**Translation notes:**
- Type-to-confirm ("DISABLE") → zod `z.literal('DISABLE')` with `{ message: 'Type DISABLE to confirm' }`; Button enabled only when form is valid.
- Destructive button → shadcn Button `variant='destructive'`; fix BL-PROD-05 by adding `variant="destructive"` to shared component rather than custom CSS class.
- Server Action `disableOptimizerV2Action(auditReason)` → toggle `feature_flags.allergen_sequencing_optimizer_v2 = false`; write audit log; emit outbox `optimizer.v2.disabled`.
- Audit reason → Textarea with `z.string().min(10, ...)` validation; stored in `audit_log.notes`.
- Fallback rule display → read `rule_registry.id` where `key = 'allergen_sequencing_heuristic_v1'`; do not hardcode string.
- Admin-only → RBAC guard in Server Action; return `{ error: 'forbidden' }` for non-admin callers.
- Hardcoded labels → next-intl keys `optimizer.disable.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Input, Textarea, Button, Alert, Label

---

### `request_review_modal` — lines 677–696

**Label:** `request_review_modal` | **Domain:** Allergen | **Time estimate:** 40 min

Planner-facing modal to request admin review of a BLOCKED allergen matrix cell.

**Translation notes:**
- Dynamic title `${from} → ${to}` → typed props; allergen pair always comes from the matrix cell clicked — never from URL string parsing alone.
- Justification textarea → zod `.min(10, 'Min 10 characters required')`.
- Submit → Server Action `submitMatrixReviewRequestAction({ allergenFrom, allergenTo, justification })` inserting into `changeover_matrix_reviews` table.
- Admin notification → outbox event `changeover_matrix.review.requested`; Admin role sees it in notification tray.
- Info block ("This cell is BLOCKED, `segregation_required=true`") → keep as static content tied to V-CM-04 rule ID.
- Hardcoded labels → next-intl keys `matrix.review.*`.

**shadcn:** Dialog, DialogContent, DialogFooter, Textarea, Button, Alert, Label

---

## Dashboard (`dashboard.jsx`)

### `pext_dashboard_gantt` — lines 9–363

**Label:** `pext_dashboard_gantt` | **Domain:** Sequence | **Time estimate:** 480 min

Primary SCR-07-01 Gantt dashboard. Finite-capacity view with solver run trigger, allergen legend, and pending review panel.

**Known bugs:**
- BL-PEXT-05: hour-level Gantt zoom toggles state but does not re-render finer grid
- BL-PEXT-08: undo-approval 60s window is visual-only, no timer countdown

**Translation notes:**
- Hardcoded `DAY_W / HOUR_W / TOTAL_W` pixel math for Gantt bar positioning → consider adopting a Gantt library (Bryntum, frappe-gantt, DHTMLX) for production fidelity, or parameterize constants via CSS custom properties and a container-query-aware layout.
- All mock data (`PEXT_ASSIGNMENTS`, `PEXT_LINES`, `PEXT_DATES`) → parallel Drizzle queries in Server Component loader: `schedulerAssignments`, `productionLines`, `calendarDays` for the 7/14-day horizon.
- Solver progress simulation (`setInterval` runProgress) → poll `/api/scheduler/run/{runId}/status` Server-Sent Events every 5s using `useEventSource` or SWR with polling; real phase data from `scheduler_runs.phase` column.
- Pending approve/reject optimistic updates → TanStack Query mutation + Server Action; revalidate `scheduler_assignments` path on settle.
- RBAC `canSeeRunBtn` → derive from session in Server Component; pass as `canRun: boolean` prop.
- Allergen color legend → `allergen_types` table with `color_hex` column; not hardcoded.
- BL-PEXT-05 fix: recompute `HOUR_W` when zoom changes and re-render lane tracks with updated column width.
- BL-PEXT-08 fix: track `approved_at` timestamp from Server Action response; countdown via `useInterval` comparing `approved_at + 60s` to `Date.now()`; fire `undoApprovalAction` on undo click while within window.

**shadcn:** Button, Select, Badge, Alert, Tooltip, Popover

---

### `assignment_side_panel` — lines 365–451

**Label:** `assignment_side_panel` | **Domain:** WO | **Time estimate:** 150 min

Detail side panel for a selected Gantt assignment. Shows WO metadata, allergen/CO, materials, DAG deps, and approval actions.

**Known bugs:** BL-PEXT-08 (undo-approval 60s window is visual-only)

**Translation notes:**
- Custom `.asn-side` slide-in → shadcn `Sheet` (`side='right'`) with controlled `open` state; close on Escape or backdrop click.
- Hardcoded materials list → Drizzle query `db.select().from(woBomLines).where(eq(woBomLines.woId, asn.woId))` joining `materials`; show `material_code`, `required_qty`, `available_qty`, status pill.
- CO before/after → derive from `changeover_matrix_cells` join using previous/next WO allergen groups on the same line.
- Approval "Undo" link → render only if `approved_at > now() - 60s`; countdown via `useInterval`; Server Action `undoApprovalAction(assignmentId)` with audit log write.
- DAG dependencies section → `wo_dependencies` table; render as linked list with WO code links.
- Action buttons (Approve/Reject/Override/Reschedule) → all backed by Server Actions with RBAC; disable at both UI and server level.
- Hardcoded labels → next-intl keys `assignment.detail.*`.

**shadcn:** Sheet, SheetContent, SheetHeader, SheetFooter, Button, Badge, Alert, Separator

---

## Forecast screens (`forecast-screens.jsx`)

### `pext_forecasts_screen` — lines 3–155

**Label:** `pext_forecasts_screen` | **Domain:** Forecast | **Time estimate:** 200 min

SCR-07-03. Forecast upload, table view by product × week, and Prophet ML health panel.

**Known bugs:** BL-PEXT-01 (full Prophet chart integration with confidence bands and SMAPE drill-down is P2)

**Translation notes:**
- `PEXT_FORECASTS` mock → Drizzle query with week_iso range filter and source filter; support URL-driven params for source, week range, product search.
- Week column headers → derived from query distinct weeks; generate dynamically to support any coverage range; do not hardcode `PEXT_FORECAST_WEEKS`.
- Prophet health card → gate behind `feature_flags.prophet_ml` server-side; read SMAPE/health from `forecast_model_metrics` table.
- SVG sparklines → replace with Recharts or Tremor chart library; use `forecast_actuals` table for actual vs forecast comparison data.
- Filter bar → URL search params; nuqs library for type-safe param management.
- Override / Delete row actions → Server Actions `overrideForecastAction` / `deleteForecastRowAction` with audit log; optimistic UI with rollback on error.
- Hardcoded labels → next-intl keys `forecast.*`.

**shadcn:** Button, Select, Input, Table, TableHeader, TableBody, TableRow, TableCell, Badge, Alert

---

## Matrix screens (`matrix-screens.jsx`)

### `pext_matrix_editor` — lines 12–245

**Label:** `pext_matrix_editor` | **Domain:** Allergen | **Time estimate:** 360 min

SCR-07-02. Full N×N allergen changeover matrix editor with 3 tabs: Default Matrix / Per-Line Overrides / Review Requests.

**Known bugs:**
- BL-PEXT-06: matrix JSON viewer modal ("View Full Snapshot JSON") is a placeholder link
- BL-PEXT-09: version diff modal shows sample rows, not real diff vs historical

**Translation notes:**
- N×N matrix table → allergen row/column headers from `allergen_types` table; cells from `changeover_matrix_cells` with local draft overlay from session.
- Local `edits` state → optimistic draft stored in `changeover_matrix_drafts` table keyed by session ID; Server Action `saveCellDraftAction` on each cell; consolidate to version on publish.
- `classifyCell` heatmap utility → extract to `lib/matrix.ts`; reuse in ImportModal diff preview and Sequencing screen.
- 3-tab layout → shadcn `Tabs` with URL hash param for deep-linking (e.g. `?tab=overrides`).
- Per-line overrides accordion → shadcn `Accordion` per line; override data from `changeover_matrix_line_overrides` table.
- Review requests table → `changeover_matrix_reviews` where `status = 'pending'`; Admin Unblock/Reject → Server Actions with RBAC.
- BL-PEXT-06 fix: implement `MatrixSnapshotModal` showing prettified JSON from `changeover_matrix_snapshots` table for the selected version.
- Hardcoded labels → next-intl keys `matrix.*`.

**shadcn:** Tabs, TabsList, TabsTrigger, TabsContent, Accordion, AccordionItem, Button, Badge, Alert, Table

---

## Optimizer screens (`optimizer-screens.jsx`)

### `pext_pending_full_page` — lines 4–110

**Label:** `pext_pending_full_page` | **Domain:** WO | **Time estimate:** 180 min

SCR-07-01b. Full-page pending review queue with status filter tabs and bulk actions.

**Translation notes:**
- `PEXT_ASSIGNMENTS` mock → Drizzle query with status/line/shift/search URL params; support URL-driven filtering for deep-links from dashboard KPI tiles.
- Local `actions` optimistic state → `useOptimistic` (React 19) or TanStack Query mutation; Server Actions `approveAssignmentAction` / `rejectAssignmentAction`.
- 4 KPI tiles (In queue / Pending / Approved / Overridden) → aggregate query; include counts in same loader fetch as assignments to avoid waterfall.
- Filter bar → URL search params; nuqs for type-safe param management; "Clear filters" resets all params.
- Export queue CSV → Server Action streaming CSV response with current filter params applied.
- `AssnStatus` badge → extract to shared `<AssignmentStatusBadge status={...} />` using shadcn Badge with variant map.
- Hardcoded labels → next-intl keys `pending.*`.

**shadcn:** Button, Select, Input, Table, TableHeader, TableBody, TableRow, TableCell, Badge

---

### `pext_capacity_projection` — lines 113–206

**Label:** `pext_capacity_projection` | **Domain:** Sequence | **Time estimate:** 150 min

Line capacity utilisation table + micro-bar chart for 7-day horizon.

**Translation notes:**
- Mock data → Drizzle query joining `scheduler_assignments` with `production_lines`: `SUM(qty_kg / duration_h) / line.cap_kg_h * 100` per line per day.
- `utilColour(pct)` inline logic → extract to shared `lib/capacity.ts`; reuse in table cells, bar fills, and `assignment_side_panel`.
- V-SCHED-04 violation alert → query `WHERE pct > 100`; render violating line/day callouts as `AlertDescription` list items.
- Refresh button → Server Action `refreshCapacityProjectionAction` or SWR `mutate()`; show `last_refreshed_at` from `scheduler_runs.completed_at`.
- Export CSV → Server Action streaming CSV of the same dataset.
- Micro utilisation bars → shadcn `Progress` or `div` bars with `utilColour` class applied to fill.
- Hardcoded labels → next-intl keys `capacity.*`.

**shadcn:** Button, Alert, AlertDescription, Table, TableHeader, TableBody, Progress

---

## Run History screens (`runhistory-screens.jsx`)

### `pext_run_history` — lines 3–115

**Label:** `pext_run_history` | **Domain:** Sequence | **Time estimate:** 150 min

SCR-07-04. Audit trail of all scheduler runs with filter bar and KPI strip.

**Translation notes:**
- `PEXT_RUNS` mock → Drizzle query `db.select().from(schedulerRuns).orderBy(desc(startedAt))` with type/status/date range/user URL params.
- 4 KPI tiles → aggregate query (count by status, avg duration); include in same loader fetch.
- Row click → `router.push('/scheduler/runs/[runId]')` for production; prototype uses selectedRun local state — keep inline drill-in pattern during Phase 1, migrate to separate route in Phase 2.
- Re-run button → disabled for failed runs; RBAC in Server Action; `role !== 'Planner'` check from session.
- Duration variant utility `runDurationVariant(dur)` → extract to `lib/runs.ts`; returns `'default' | 'warning' | 'destructive'` for Badge variant.
- Export CSV → Server Action streaming filtered `scheduler_runs`.
- Hardcoded labels → next-intl keys `runHistory.*`.

**shadcn:** Button, Select, Input, Table, TableHeader, TableBody, TableRow, TableCell, Badge

---

### `pext_run_detail` — lines 119–260

**Label:** `pext_run_detail` | **Domain:** Sequence | **Time estimate:** 200 min

SCR-07-04-DETAIL. Full run detail page: metadata, input snapshot, output summary, assignments table, override log.

**Translation notes:**
- Dual-column layout (metadata left / output right) → CSS Grid `grid-cols-[1fr_1fr]` with responsive stack; extract `<RunMetaCard>` and `<RunOutputCard>` as RSC.
- `PEXT_RUN_DETAIL` mock → single Drizzle query with `with: { assignments: true, overrides: true }`.
- "View full snapshot JSON" link → `/scheduler/runs/{runId}/snapshot.json` route or inline shadcn `Collapsible` with `<pre>` content.
- Per-line utilisation bars → aggregate from assignments; reuse `utilColour` utility.
- Override log → `scheduler_assignment_overrides` joined to `override_reason_codes`; render as Card list or shadcn Timeline.
- Partial/failed alert → map `run.status` to `variant='warning' | 'destructive'` on shadcn `Alert`.
- Hardcoded labels → next-intl keys `runDetail.*`.

**shadcn:** Button, Alert, AlertDescription, Card, CardContent, Badge, Collapsible, Table, Progress, Separator

---

## Scenario screens (`scenario-screens.jsx`)

### `pext_scenarios` — lines 3–211

**Label:** `pext_scenarios` | **Domain:** Scenario | **Time estimate:** 360 min

SCR-07-05. P2 what-if simulation builder with KPI compare grid and dual Gantt.

**Known bugs:** BL-PEXT-02 (what-if simulation real solver hook-up is P2; currently preset-driven with canned deltas)

**Translation notes:**
- P2 gate → check `feature_flags.what_if_simulation` server-side in layout; show locked card with feature description when disabled.
- Left/right split layout → shadcn `ResizablePanel` or fixed `340px 1fr` Grid.
- `mods` array → `useReducer` with typed `ScenarioModification[]`; preset chips map to strongly-typed mod objects in `lib/scenario-presets.ts`.
- `runSim` canned deltas → Server Action `runScenarioSimulationAction(scenarioId, mods)` with `dry_run: true` flag; poll for result via SWR.
- KPI compare grid → shadcn `Table` with color-coded delta `Badge` per row; delta computed server-side.
- `MiniGantt` SVG → replace with shared mini-Gantt React component reusing GanttLane primitives from `pext_dashboard_gantt`; baseline vs scenario side-by-side.
- Saved scenarios list → Drizzle query `db.select().from(scenarios).orderBy(desc(createdAt))`; delete via Server Action with AlertDialog confirmation.
- Hardcoded labels → next-intl keys `scenario.*`.

**shadcn:** Button, Input, Select, Badge, Alert, Table, TableHeader, TableBody, Card, Collapsible

---

## Sequencing screens (`sequencing-screens.jsx`)

### `pext_sequencing` — lines 3–179

**Label:** `pext_sequencing` | **Domain:** Sequence | **Time estimate:** 250 min

SCR-07-06. Allergen sequencing v2 overlay: KPI strip, progress bar, dry-run preview compare, and sequence table.

**Translation notes:**
- v2 banner rule ID → read `rule_registry.id` and `fallback_rule` from DB; pass as `ruleId: string` and `fallbackRuleId: string` props; do not hardcode.
- 4 KPI tiles → aggregate from `scheduler_assignments` joined to `changeover_matrix_cells`; CO reduction target from `optimizer_targets` table.
- Dry-run preview → Server Action `previewSequenceAction(runId)` with `dry_run: true`; store result rows in `sequence_previews` table with 24-hour TTL.
- Sequence compare panels → `seq_baseline` and `seq_proposed` from `sequence_preview_rows`; `moved: boolean` flag highlighted with Badge; `saving_min` annotation from diff.
- Commit preview → Server Action `commitSequencePreviewAction(previewId)` writing draft assignments; emit `sequencing.preview.committed`.
- `CORisk` badge → extract to shared `<CORiskBadge risk='none|low|medium|high' />` with variant map; reuse from capacity screen.
- Hardcoded labels → next-intl keys `sequencing.*`.

**shadcn:** Button, Badge, Alert, AlertDescription, Table, TableHeader, TableBody, TableRow, TableCell, Progress

---

## Other screens (`other-screens.jsx`)

### `pext_rules_screen` — lines 4–76

**Label:** `pext_rules_screen` | **Domain:** Sequence | **Time estimate:** 120 min

Rule registry browser. Read-only for Planners, admin-only publish.

**Translation notes:**
- `PEXT_RULES` mock → Drizzle query `db.select().from(ruleRegistry).orderBy(asc(phase), asc(id))`; separate by status filter.
- Rule card list → shadcn `Card` per rule; "View source →" → shadcn `Sheet` or `Dialog` with DSL source in `<pre>` with syntax highlighting (Prism or Shiki).
- Feature flags table → `db.select().from(featureFlags)` with `phase` column.
- Publish button → RBAC from session; Server Action `publishRuleAction(ruleId)` creating new rule version; disabled for non-Admin.
- `invokes7d` stat → aggregate from `scheduler_run_rule_invocations` where `invoked_at > now() - interval '7 days'`.
- Gate entire page → session role check in layout middleware; redirect non-Admin attempting publish.
- Hardcoded labels → next-intl keys `rules.*`.

**shadcn:** Button, Badge, Card, CardContent, Table, TableHeader, TableBody, Alert

---

### `pext_settings_screen` — lines 79–133

**Label:** `pext_settings_screen` | **Domain:** Sequence | **Time estimate:** 120 min

Planning+ settings page: 4-card grid for run defaults, alerts, integration, and premium status.

**Translation notes:**
- 4-card 2-column grid → shadcn `Card` with responsive CSS Grid; collapse to single column on tablet.
- Default run parameters form → `useForm` + zod; Server Action `updateSchedulerSettingsAction` writing to `scheduler_config` table.
- Alerts config form → separate `scheduler_alert_config` table or JSON config column.
- Integration card fields (solver URL, circuit breaker) → Admin-only; **read environment config in production** — do not expose editable solver URL in UI; show as read-only with "contact DevOps to change" note.
- Premium status card → derive tier from `tenant_subscriptions`; feature list is i18n content.
- 14-day horizon option → gate via `feature_flags.scheduler.horizon_14d.enabled`; disabled Select option with shadcn `Tooltip` explaining it is P2.
- Hardcoded labels → next-intl keys `settings.*`.

**shadcn:** Card, CardHeader, CardContent, Select, Input, Button, Label, Badge

---

## Cross-cutting concerns (apply to ALL planning-ext components)

1. **RBAC pattern:** Every Server Action must independently verify the caller's role from the server-side session (`auth().user.role`). Client-side role checks (e.g. `role === 'Admin'`) are UX affordances only; the server is the authority.

2. **Outbox pattern:** Every mutating Server Action must write to the `outbox_events` table within the same Drizzle transaction as the domain write. Never fire a notification after the transaction commits.

3. **Audit log pattern:** Override, approve, reject, publish, import, and disable actions all write to `audit_log` with `{ actor_id, action_type, target_id, target_type, payload, created_at }`.

4. **Mock data elimination checklist:** Before marking any component done, verify that `PEXT_*` constants have been replaced by Drizzle queries and that no hardcoded arrays remain in component files.

5. **P2 feature gates:** Components tagged P2 (DispositionDecisionModal, PextScenarios, Prophet panel in PextForecasts) must check `feature_flags` in the Server Component; do not render any P2 content client-side based on local state alone.

6. **i18n:** Every user-visible string (including validation messages) must use a `next-intl` key. No hardcoded English or Polish strings in production components.

7. **BL-PROD-05 remediation:** The `.btn-danger` CSS class is referenced by MODAL-SCHEMA.md but missing from `shared.css`. Use shadcn `Button variant='destructive'` in all production destructive-action buttons; do not rely on the prototype CSS class.
