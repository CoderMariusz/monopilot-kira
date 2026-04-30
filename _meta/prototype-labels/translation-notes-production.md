# Translation Notes — Production Module (Prototype → Production Stack)

Generated: 2026-04-23  
Source files: `design/Monopilot Design System/production/`  
Components indexed: 31  
Total estimated translation time: ~2 395 min (~40 hours)

---

## Index

| Label | File | Lines | Type | Domain | Interaction | Complexity | Est. (min) |
|---|---|---|---|---|---|---|---|
| release_wo_modal | modals.jsx | 3-46 | modal | WO | create | composite | 75 |
| start_wo_modal | modals.jsx | 48-67 | modal | WO | approve | composite | 45 |
| pause_line_modal | modals.jsx | 69-117 | modal | WO | edit | composite | 60 |
| complete_wo_modal | modals.jsx | 119-155 | modal | WO | sign-off | composite | 90 |
| over_consume_modal | modals.jsx | 157-183 | modal | WO | approve | composite | 55 |
| waste_modal | modals.jsx | 185-204 | modal | WO | create | composite | 50 |
| catch_weight_modal | modals.jsx | 206-244 | modal | LP | create | composite | 90 |
| scanner_modal | modals.jsx | 246-278 | modal | LP | read-only | primitive | 30 |
| dlq_inspect_modal | modals.jsx | 280-326 | modal | WO | edit | composite | 55 |
| resume_line_modal | modals.jsx | 328-342 | modal | WO | edit | primitive | 40 |
| changeover_gate_modal | modals.jsx | 344-364 | modal | WO | sign-off | composite | 65 |
| assign_crew_modal | modals.jsx | 366-386 | modal | WO | edit | composite | 50 |
| tweaks_panel | modals.jsx | 389-428 | sidebar | WO | edit | primitive | 35 |
| shift_start_modal | modals.jsx | 438-497 | modal | WO | sign-off | composite | 90 |
| shift_end_modal | modals.jsx | 500-557 | modal | WO | sign-off | composite | 95 |
| oee_target_edit_modal | modals.jsx | 560-635 | modal | WO | edit | composite | 70 |
| wo_list | wo-list.jsx | 3-104 | page-layout | WO | read-only | page-level | 80 |
| wo_detail | wo-detail.jsx | 3-87 | page-layout | WO | edit | page-level | 100 |
| consumption_tab | wo-detail.jsx | 90-176 | table | WO | read-only | composite | 85 |
| output_tab | wo-detail.jsx | 179-238 | table | LP | create | composite | 65 |
| genealogy_tab | wo-detail.jsx | 285-332 | tabs | WO | read-only | composite | 70 |
| history_tab | wo-detail.jsx | 335-358 | table | WO | read-only | primitive | 40 |
| production_dashboard | dashboard.jsx | 3-146 | page-layout | WO | read-only | page-level | 130 |
| line_card | dashboard.jsx | 149-229 | dashboard-tile | WO | read-only | composite | 65 |
| waste_analytics_screen | new-screens.jsx | 4-209 | page-layout | WO | read-only | page-level | 110 |
| line_detail | new-screens.jsx | 212-478 | page-layout | WO | read-only | page-level | 130 |
| oee_screen | other-screens.jsx | 4-121 | page-layout | WO | read-only | page-level | 95 |
| downtime_screen | other-screens.jsx | 124-212 | page-layout | WO | read-only | page-level | 85 |
| shifts_screen | other-screens.jsx | 215-291 | page-layout | WO | edit | page-level | 80 |
| changeover_screen | other-screens.jsx | 294-390 | page-layout | WO | sign-off | page-level | 100 |
| analytics_screen | other-screens.jsx | 393-496 | page-layout | WO | read-only | page-level | 100 |
| dlq_screen | other-screens.jsx | 499-557 | page-layout | WO | edit | page-level | 70 |
| settings_screen | other-screens.jsx | 560-649 | page-layout | WO | edit | page-level | 110 |

---

## Known Bugs (from BACKLOG.md — Production section BL-PROD-01..05)

| ID | Component | Severity | Description |
|---|---|---|---|
| BL-PROD-01 | line_detail | Medium | LineDetail today-output table is static — real impl must pull from Warehouse LP registry filtered by line + date |
| BL-PROD-02 | waste_analytics_screen | Medium | Waste analytics rolling% and totals are hard-coded — needs rolling-14d window query from event store |
| BL-PROD-03 | shift_start_modal | Low | Modal assumes single plant (Factory-A) — multi-plant operators need a plant picker field |
| BL-PROD-04 | oee_target_edit_modal, settings_screen | Medium | OEE target edits stored in memory — needs `prod_oee_targets` table with effective-date window for historic comparison |
| BL-PROD-05 | complete_wo_modal | **HIGH** | `.btn-danger` class referenced in MODAL-SCHEMA but missing from `production.css` and `_shared/shared.css` — destructive confirm falls back to primary styling |

Additional bugs from other BACKLOG sections affecting Production components:

| ID | Component | Severity | Description |
|---|---|---|---|
| BL-OEE-01 | oee_screen | Medium | Chart data is full refresh only — incremental append via `?since=last_ts` not implemented |
| BL-OEE-09 | oee_screen | Low | Recharts vs inline SVG decision pending for production charting |
| BL-RPT-04 | analytics_screen | Medium | `@media print` stylesheet for Puppeteer PDF export not yet built |
| BL-SCN-01 | scanner_modal | Medium | `_shared/ScannerModal.jsx` bottom-sheet primitive not built — scanner_modal uses CSS-override approach |

---

## Detailed Translation Notes

---

### release_wo_modal (modals.jsx:3-46)

**Pattern:** Simple form + BOM snapshot preview card + dual action buttons (Release READY vs auto-start).

- `window.Modal` wrapper → `@radix-ui/react-dialog` Dialog with `DialogContent` / `DialogHeader` / `DialogFooter`; layout parity achieved via shadcn primitives
- Local `<select>` for WO list → Server Component query from `wo` table filtered by `status='DRAFT' AND bom_released=true`, fed into shadcn `Select`
- BOM snapshot preview card → dedicated `BomSnapshotSummary` Server Component reading the frozen `bom_snapshot` row; allergen-change badge derived from diff between current BOM and snapshot allergens
- Inline date inputs → shadcn `DateTimePicker` or `react-day-picker` with controlled `useForm` state; planned start must be >= NOW()
- Operator assignment select → query `users WHERE certified_for_line=lineId` passed as prop from parent Server Component
- Hardcoded info alert text → `next-intl` `t('production.release_wo.info')`
- On submit: Server Action validates BOM snapshot exists, sets WO status to `READY` or `IN_PROGRESS` depending on radio, emits `wo.released` outbox event

---

### start_wo_modal (modals.jsx:48-67)

**Pattern:** Confirmation card + single PIN gate.

- `window.Modal` → `Dialog` with `DialogContent`; title via `DialogHeader`
- Summary card (WO/Line/Operator/Planned) → read from WO Server Component prop, not raw string interpolation
- PIN `input[type=password]` maxLength=4 → shadcn `Input` type="password"; validated with zod `z.string().length(4).regex(/^\d+$/)`
- On submit: Server Action hashes/verifies PIN against `users.pin_hash`, sets WO status to `IN_PROGRESS`, freezes BOM snapshot, starts event log row with `event_type='WO_STARTED'`
- Hardcoded labels → `next-intl` keys (e.g. `production.start_wo.pin_help`)

---

### pause_line_modal (modals.jsx:69-117)

**Pattern:** 4P category pill selector → dynamic sub-category → linked WO → reason textarea → optional notify toggle.

- `React.useState(cat)` pill selector → shadcn `ToggleGroup` (single) or `RadioGroup`; "Product" option is disabled and routes to QA hold, not downtime — enforce server-side
- Dynamic `subs[cat]` map → derive options from `downtime_categories` lookup table filtered by `group=cat`, rendered as shadcn `Select`
- Linked WO → query active WOs on the paused line, defaulting to current active WO
- Reason `textarea` → shadcn `Textarea` with zod `.min(5)` validation; feeds downtime Pareto report — enforce richness
- Notify maintenance `toggle` → shadcn `Switch`; on=true triggers `maintenance_notification` Server Action side-effect (notify via email/Slack)
- On submit: Server Action creates `downtime_event` record, sets `line.status='PAUSED'`, pauses linked WO, emits `line.paused` outbox event
- Hardcoded category map → drive from `prod_downtime_categories` table or typed config constant

---

### complete_wo_modal (modals.jsx:119-155)

**Pattern:** Gate-check grid (6 gates, pass/fail) + PIN sign-off + dual footer actions.

- Gate rows with hardcoded mock status → each gate is a Server Component reading real data: `qa_samples` for sampling gate, `lp_outputs` count for LP gate, `waste_log` for waste gate
- 2-column CSS grid → shadcn `Card` grid or a `GateCheckGrid` component mapping over gate results from server
- Pass/fail icon + color → derive from `gate.passed` boolean; `text-green-600` / `text-red-600` tailwind; do NOT use static emoji in production
- PIN input → same verification pattern as `start_wo_modal`; role must be Shift Lead or above
- On submit: Server Action transitions WO to `COMPLETED`, enqueues D365 push job via outbox pattern, releases LPs to warehouse pending QA clearance
- Gate sub-text (e.g. "1 of 12 samples pending") → dynamic from `qa_samples WHERE wo_id=X AND status='PENDING'` count
- **BL-PROD-05:** `.btn-danger` missing from CSS — "Complete with exceptions" currently uses btn-secondary styling; add to `_shared/shared.css` before implementation

---

### over_consume_modal (modals.jsx:157-183)

**Pattern:** Amber amber info card (component/planned/over/tolerance) + operator reason display + reviewer note + PIN approve/reject.

- Amber summary block → derive dynamically from `over_consumption_requests` record joined to `bom_component`; tolerance % from `prod_settings.consumption_tolerance_pct`
- Operator reason display → pull from `over_consumption_requests.operator_reason`, stored when operator submitted the request
- Reviewer note `textarea` → shadcn `Textarea`, value stored on `over_consumption_requests.reviewer_note`
- Approve PIN → verified server-side against session user's `pin_hash`; updates `status='APPROVED'`, records `approved_by_user_id` + `approved_at`
- Reject → separate Server Action setting `status='REJECTED'`; does not require PIN
- Emit `over_consumption.approved` or `over_consumption.rejected` event on respective action

---

### waste_modal (modals.jsx:185-204)

**Pattern:** Linked WO + category + qty + optional component + reason + optional photo.

- WO select → query active WOs on current line, default to current active WO
- Category select (Trim/Spillage/Out-of-spec/Expired/Packaging) → drive from `waste_categories` lookup table or static enum; extensible for future categories
- Component select → query `bom_components WHERE wo_id=X` from the active WO snapshot; optional FK on `waste_events.component_id`
- Qty input → shadcn `Input` type="number" step="0.1"; zod `.positive()` validation
- Photo upload → shadcn file `Input` or drag-drop zone; upload to Vercel Blob / S3, store URL on `waste_events.photo_url`; `photo_url` nullable
- On submit: Server Action inserts `waste_event`, updates waste totals materialized view, emits `waste.logged` event

---

### catch_weight_modal (modals.jsx:206-244)

**Pattern:** LP/nominal header → unit capture grid (14 of 24) → MQTT scanner deep-link.

- Unit capture grid → driven by `catch_weight_captures` table rows for current LP; real-time via SSE or SWR polling against `/api/lp/[id]/captures`
- `Math.random()` weight generation → replace with actual scale readings streamed over MQTT → Edge Route Handler → client `EventSource`
- LP and nominal fields (readOnly) → derive from `lp_output` record joined to `bom_output.nominal_weight_per_unit`
- Running total / avg / variance → memoize with `useMemo` client-side; server validates final totals on registration
- "Send to scanner device" → creates `scanner_session` record with deep-link token; MQTT topic subscribed to `device_id`
- On submit: Server Action registers LP as finalized when `unit_count >= lot_size`, stores `actual_weight_kg` on `lp_output`
- Lot size of 24 → read from `prod_settings.catch_weight_lot_size` per line config (BL-PROD-04 adjacency: same settings table)

---

### scanner_modal (modals.jsx:246-278)

**Pattern:** Navigation list of 3 scanner deep-links (Consume LP / Register output / Catch-weight).

- Three action items → generate real deep-link URLs with signed JWT containing `wo_id + line_id + action_type`; JWT signed with `SCANNER_JWT_SECRET` env var
- Launch buttons → anchor tags or `router.push()` to scanner PWA URL; scanner PWA is a separate Next.js app (fullscreen mobile, per BACKLOG BL-SCN-01)
- Shared auth session between production web app and scanner PWA → use a shared cookie domain or cross-app token exchange
- **BL-SCN-01:** `_shared/ScannerModal.jsx` bottom-sheet primitive not yet built — current prototype uses CSS-override approach; build before second mobile module arrives

---

### dlq_inspect_modal (modals.jsx:280-326)

**Pattern:** Metadata grid + raw error payload pre block + retry / mark-resolved actions.

- `DLQ[0]` mock → query `d365_dlq WHERE id=eventId`; passed as prop from DLQScreen
- Metadata grid (Event/Attempts/Moved at/Last error at) → shadcn description list (`dl`/`dt`/`dd`) with tailwind typography
- Raw error payload `pre` block → shadcn `pre` or a `CodeBlock` component; `last_error_payload` stored as JSONB on `d365_dlq`; apply syntax highlight via `shiki` or `prism`
- Retry → Server Action re-enqueues DLQ item, increments `attempts`, clears `last_error_at`; returns updated status optimistically
- Mark resolved → Server Action sets `d365_dlq.status='RESOLVED_NO_PUSH'`, records `resolved_by_user_id` + `resolved_at`
- Correlation ID → clickable link to structured log search (Datadog/Grafana) with `correlationId` query param in production

---

### resume_line_modal (modals.jsx:328-342)

**Pattern:** Downtime summary card + resolution note + PIN.

- Downtime summary (23 min / Plant — Breakdown) → derive from open `downtime_event` for the line; calculate `duration = NOW() - started_at` server-side
- Resolution note → shadcn `Textarea` with zod `.min(5)` validation; stored on `downtime_events.resolution_note`
- PIN → same verification pattern; stored on `downtime_events.resumed_by_user_id + resumed_at`
- On submit: Server Action sets `downtime_event.ended_at=NOW()`, calculates final `duration_min`, sets `line.status='RUNNING'`, resumes linked WO, emits `line.resumed` event

---

### changeover_gate_modal (modals.jsx:344-364)

**Pattern:** Dual signature boxes (Shift Lead signed / Quality unassigned) + PIN per signer.

- Both sig boxes → derive signer status from `changeover_gate_signatures WHERE gate_id=X`; "signed" state read from DB, not local state
- Quality signer select → query `users WHERE role='QUALITY' AND factory_id=X AND shift_status='ACTIVE'`; only current shift members
- Each PIN validated server-side independently; stored as separate rows in `changeover_gate_signatures (gate_id, role, signed_by, signed_at, pin_hash_verified)`
- "Sign & advance" disabled → disabled when `quality_signer_id IS NULL` (server-derived prop); not purely client state
- Gate step unlocks next step only when `both_signed=true` enforced by Server Action guard
- Allergen context → from `changeover.allergen_in` / `allergen_out` fields (JSON array of allergen IDs)
- Emit `changeover.gate_signed` event on success

---

### assign_crew_modal (modals.jsx:366-386)

**Pattern:** Table of lines × operator select × cert badge.

- `SHIFT_CREW` mock → query `shift_assignments JOIN users WHERE shift_id=currentShiftId` as server prop
- Operator select per line → query `users WHERE line_id = ANY(user.certified_line_ids)` to show only certified operators; V-PROD-SHIFT-001 enforced server-side
- Cert badge → from `user.line_certifications` array; unassigned badge if operator null
- On submit: Server Action bulk-upserts `shift_assignments` rows; validates certification constraint before save; rejects with error message if uncertified assignment attempted

---

### tweaks_panel (modals.jsx:389-428)

**Pattern:** Floating devtools panel with density / layout / accent preference toggles.

- `position:fixed` inline style → shadcn `Sheet` (side='right') or `Popover` anchored to a toolbar button; avoid raw fixed positioning in production
- `tweaks` state via props → Zustand store or React Context; persist to `localStorage` or `user_preferences` table per user
- Density / card layout / KPI accent selects → shadcn `Select`; values drive CSS custom properties or tailwind class variants via a `data-density` attribute on `<html>`
- Toggle inputs → shadcn `Switch` components
- This is a prototype-only devtools panel — in production, preferences belong in a dedicated Settings page, not a floating panel; remove or gate behind `NODE_ENV=development`

---

### shift_start_modal (modals.jsx:438-497)

**Pattern:** PIN + crew table with overrides + previous handover notes + incoming handover text.

- `useState` for pin/handover/crewOverride → `useForm` (react-hook-form) + zodResolver; schema: `pin z.string().length(4).regex(/^\d+$/)`, `handover z.string().min(10)`
- `Field` primitive from `_shared/modals.jsx` → production `FormField` wrapper using shadcn `FormItem` / `FormLabel` / `FormControl` pattern
- `ReasonInput` primitive → shadcn `Textarea` with character count, wired to form state via `Controller`
- Previous shift handover (read-only) → query `shift_handovers WHERE previous_shift_id=X` from Server Component, not hardcoded text
- Crew table with overrides → same pattern as `assign_crew_modal`; merge overrides on submit
- V-PROD-SHIFT-001 guard → Server Action rejects if any critical line (`line.is_critical=true`) is unassigned
- On submit: creates `shift_start_event`, upserts `shift_assignments`, stores handover in `shift_handovers`, emits `shift.started`
- **BL-PROD-03:** Hardcodes Factory-A — add plant picker `<Select>` fetching from `factories WHERE user_id=X` for multi-plant operators

---

### shift_end_modal (modals.jsx:500-557)

**Pattern:** Shift summary card + gate checklist (4 items) + handover note + PIN.

- `checks` state booleans → gate truth should come from server: open downtime check queries `downtime_events WHERE ended_at IS NULL AND shift_id=X`; waste check queries `waste_log` completion
- `Summary` primitive → shadcn `Card`-based `ShiftSummary` Server Component reading from `shift_kpi_summary` view
- Gate-check items with inline checkbox → `Checkbox` (shadcn) in a controlled form; unchecked blocking gates cannot be overridden without entering a resolution note
- V-PROD-SHIFT-002: cannot end shift with open downtime and no reason → Server Action enforces this gate before committing
- Handover note → `Textarea` min(10) via zod; stored as `shift_handovers` row with `from_shift_id` + `to_shift_id`
- PIN sign-off → stored as `shift_end_events.signed_by_user_id + signed_at`
- On submit: closes shift, calculates final KPIs, emits `shift.ended`; hardcoded stats (3 842 kg etc.) → real-time aggregation from `wo_events + downtime_events` for shift window

---

### oee_target_edit_modal (modals.jsx:560-635)

**Pattern:** Admin role gate + line + effective date + A/P/Q numeric inputs + live OEE preview + reason + save.

- Role comes from `React.useState("Plant Manager")` demo switch → in production read from `auth()` session; block non-Plant-Manager at Server Action layer (V-PROD-OEE-001)
- A/P/Q inputs → shadcn `Input` type="number" min=50 max=100; derived OEE `(A*P*Q/10000)` is client-side preview only; server re-validates numeric range
- Effective date → shadcn `DatePicker`; min date = tomorrow (cannot backdate)
- `LINES.map()` → query `lines WHERE factory_id=X` from Server Component
- On submit: Server Action inserts into `prod_oee_targets (effective_date, line_id, target_a, target_p, target_q, changed_by_user_id, change_reason)`; existing window with same line + future date is superseded
- **BL-PROD-04:** Currently stores in memory — implement `prod_oee_targets` table with effective-date windowing before this modal is useful in production

---

### wo_list (wo-list.jsx:3-104)

**Pattern:** Status tabs with counts + search + line/period filters + sortable table + per-row context actions.

- `WOS` mock filtered by status/search → Drizzle query with `.where(and(eq(wo.status, tab), or(ilike(wo.code, search), ilike(wo.name, search))))` in a Server Component; `tab='all'` omits status filter
- Tab counts → single `GROUP BY status` aggregation to avoid N+1; render counts without extra fetches
- Line + date range filters → URL search params `?line=LINE-01&period=today`; consumed by Server Component; shadcn `Select` triggers `router.replace()`
- `WOStatus` badge variant map: `in_progress=green, paused=amber, ready=blue, completed=gray, draft=outline`
- Progress bar per row → shadcn `Progress` value={pct}, capped at 100; no manual `<div>` bar
- Row click → navigates to `/production/wo/[id]`; action buttons use `e.stopPropagation()`
- Export button → Server Action streaming CSV response from same Drizzle query with current filters
- Allergen gate badge → from `wo.allergen_gate` boolean, not computed client-side

---

### wo_detail (wo-detail.jsx:3-87)

**Pattern:** Breadcrumb + WO header with dual progress bars + over-consumption alert + 6-tab content area.

- `WO_DETAIL` mock → Server Component fetching WO with Drizzle `with` relations: `bomComponents`, `consumedLPs`, `outputs`, `coProducts`, `byProducts`, `wasteLog`, `history`
- Tab state → URL-based via `searchParams.tab`; shadcn `Tabs` with each tab as a lazy-loaded Server Component wrapped in `Suspense`
- Over-consumption alert banner → rendered from `wo.pendingOverConsumptions.length > 0`; Approve/Reject are Client Component buttons
- Progress bars → shadcn `Progress` for consumption and output; values from server not computed in render
- Action buttons (Pause/Waste/Catch-weight/Complete) → Client Component group; status-guard checks run server-side before returning page; disabled state if WO status doesn't allow action
- BOM snapshot badge → display `wo.bomSnapshotVersion`, link to Technical module BOM detail view at `/technical/bom/[bomId]/snapshots/[snapshotId]`

---

### consumption_tab (wo-detail.jsx:90-176)

**Pattern:** BOM table with per-component progress + over-consumption flags + FEFO badges + LP scan log sidebar + operator hints.

- BOM components → `SELECT bom_component JOIN consumption_events WHERE wo_id=X GROUP BY component_id`; remaining = planned - consumed
- Over-consumption flag → `consumed_qty - planned_qty > 0`; row highlighted amber; variance shown in parentheses
- FEFO badge → from `lp_consumptions.fefo_compliant`; deviation badge shows `fefo_deviation_reason`
- Auto-consumed badge → from `bom_component.auto_consume`; no scan required
- LP scan log sidebar → `lp_consumptions WHERE wo_id=X ORDER BY scanned_at DESC`; scrollable `ScrollArea`
- Operator hints card → computed server-side: next FEFO pick from `lp_inventory WHERE component_id IN (...) ORDER BY best_before ASC LIMIT 1`; batch fit from remaining BOM / avg batch size; ETA from historical throughput
- "Scan next LP" button → opens `ScannerModal` with action=`CONSUME_LP` + `wo_id` + `line_id` deep-link

---

### output_tab (wo-detail.jsx:179-238)

**Pattern:** Primary output table + co-products table + by-products table with registration actions.

- Primary output → `lp_outputs WHERE wo_id=X AND output_type='PRIMARY'`; QA status from `qa_samples JOIN lp_id`
- Co-products and by-products → `bom_co_products WHERE wo_id=X GROUP BY output_type`; registered qty from `lp_outputs` aggregation
- "Register output LP" → opens `RegisterOutputModal` (not yet built in prototype, needs design); creates `lp_output` row
- QA badge → from `qa_samples.status`; link to Quality module hold detail
- Catch-weight mode toggle → sets `line_config.weighing_mode='CATCH_WEIGHT'`, opens `CatchWeightModal`
- Label column → trigger label print action via Warehouse LP label flow (BL-WH-04 adjacency)

---

### genealogy_tab (wo-detail.jsx:285-332)

**Pattern:** Two-column tree (consumed inputs → output LPs) + shipment link section.

- Consumed inputs + output LPs → single genealogy CTE query: backward trace via `lp_consumptions`, forward trace via `lp_outputs`
- For complex recalls consider react-flow for interactive nodes; prototype CSS tree is adequate for read-only display
- Shipment links → `shipment_lines WHERE lp_id = ANY(output_lp_ids)`; section hidden if no allocations yet
- Export → Server Action generating JSON from recursive genealogy CTE, streamed as file download with `Content-Disposition: attachment`
- Forward/Backward toggle → URL param `?direction=forward|backward`; adjusts CTE traversal direction

---

### history_tab (wo-detail.jsx:335-358)

**Pattern:** Append-only event log table with export.

- `w.history` mock → `wo_events WHERE wo_id=X ORDER BY occurred_at DESC`; table is INSERT-only (no UPDATE/DELETE per audit requirements)
- Tx column (`h.tx`) → `wo_events.tx_id` UUID from database transaction; optionally link to structured log search
- Export JSON → Server Action streaming `wo_events` as JSON array; suitable for audit/compliance export
- Pagination → server-side if > 100 rows; use shadcn `Table` with cursor-based pagination
- Actor → `wo_events.actor_name` (denormalized at write time) for immutable audit trail

---

### production_dashboard (dashboard.jsx:3-146)

**Pattern:** KPI row (6 tiles) + attention ribbon + lines grid + recent events feed + quick actions + shift targets.

- `LINES` / `EVENTS_FEED` mock → Server Component fetching: lines with active WO + recent events; use React Suspense streaming for independent sections
- Each KPI tile → separate async Server Component with own Drizzle fetch; wrap in `<Suspense fallback={<KpiSkeleton/>}>` for independent loading without waterfall
- Attention ribbon → query `lines WHERE status='DOWN' OR (status='CHANGEOVER' AND pending_signatures > 0)`; dismiss via user_dismissed_alerts table
- Lines grid → `LineCard` per line; CSS `grid-cols-3` desktop / `grid-cols-1` mobile
- Recent events feed → `wo_events + downtime_events` last 30 min merged + sorted; consider Server-Sent Events for live updates on a plant floor display
- Shift targets panel → `shift_kpi_summary` view for current shift window
- TV mode → CSS class toggle for fullscreen layout; relevant to BL-OEE-06 TV OS kiosk open question

---

### line_card (dashboard.jsx:149-229)

**Pattern:** Compact status card per line: name/status → active WO progress → operator + next WO → alert strip → action buttons.

- `line` prop from `LINES` mock → Drizzle-fetched line record including `active_wo`, `operator`, `status`, `consumed/planned`, `downtime_events` for current shift
- Status-conditional sections (down/changeover/allergen alerts) → render from `line.status`; wrap in a Client Component boundary for low-latency interactivity
- Progress bar color → shadcn `Progress` with `className` variant: `green` (running), `amber` (changeover), `red` (down)
- Operator avatar `opInit` abbreviation → derive from `operator.first_name[0] + operator.last_name[0]`; shadcn `Avatar` with `AvatarFallback`
- Next WO → `wo WHERE line_id=X AND status='READY' ORDER BY planned_start LIMIT 1`
- Action buttons vary by status → Client Component; all modal triggers are client interactions; line data server-fetched
- Allergen change warning → `line.nextWoAllergenChange` boolean derived from WO-to-WO allergen diff computed at WO release time

---

### waste_analytics_screen (new-screens.jsx:4-209)

**Pattern:** 4 KPI tiles + Pareto bar chart + trend sparkline + by-line table + filtered event log.

- `WASTE_PARETO` / `WASTE_TREND` / `WASTE_BY_LINE` / `WASTE_EVENTS` → Drizzle queries: `GROUP BY category` for pareto, daily bucket aggregation for trend, `GROUP BY line_id` for by-line, paginated event list
- **BL-PROD-02:** Hard-coded `rollingPct=1.4` / `totalKg` — needs rolling-14d window query: `SELECT SUM(qty_kg) / SUM(consumed_kg) * 100 FROM waste_events WHERE occurred_at >= NOW()-14d`
- Pareto bar chart (CSS `.pareto-bar`) → Recharts `BarChart` or Victory in production; BL-RPT-02 recommends D3-shape for real build
- Trend sparkline (`Spark` component) → Recharts `LineChart` or `AreaChart`; target line (1.5%) from `prod_settings.waste_target_pct`
- `catFilter` / `lineFilter` local state → URL search params `?cat=Trim&line=LINE-01`; Server Component re-fetches on change
- Waste by line table → highlight rows where `pct > prod_settings.waste_alert_threshold_pct`; threshold from settings not hardcoded 2%
- Export CSV → Server Action streaming `waste_events` as CSV with applied filters

---

### line_detail (new-screens.jsx:212-478)

**Pattern:** Status ribbon + 5 KPI tiles + 6-tab content area + live event stream sidebar + line health card.

- `LINE_DETAIL` mock → Server Component fetching: line, active WO, `downtimeEvents` for current shift, `shiftLog` events, `yieldRolling` hourly aggregation, OEE A/P/Q from `oee_daily`
- Status ribbon → `line.status` enum drives `rtext` / `rcolor`; shadcn `Alert` variant or a dedicated `StatusRibbon` Client Component
- 6-tab layout → URL-based `searchParams.tab`; shadcn `Tabs`
- **BL-PROD-01:** Today's output table is static mock rows — real impl queries `lp_outputs WHERE line_id=X AND registered_at::date=TODAY`
- Yield rolling 4h chart (`Spark`) → Recharts `AreaChart` with hourly bucket data from `wo_events` aggregation
- OEE breakdown (`GaugeRing` SVG) → Recharts `RadialBarChart` or a dedicated gauge library; A/P/Q formulas documented in component
- Live event stream sidebar → Server-Sent Events from `/api/lines/[id]/events` replacing static `d.events` mock; use `EventSource` in Client Component with `useEffect`

---

### oee_screen (other-screens.jsx:4-121)

**Pattern:** 4 OEE gauges (Plant/Availability/Performance/Quality) + by-line table + performance/quality loss breakdown cards.

- `plantA/plantP/plantQ` hardcoded → query `oee_daily WHERE date=TODAY AND scope='PLANT'`; store A/P/Q as separate columns with formula metadata
- `GaugeRing` SVG → Recharts `RadialBarChart` or a dedicated gauge; see BL-OEE-09 for dependency decision
- OEE by line table (`OEE_LINES`) → `SELECT line_id, availability, performance, quality, oee FROM oee_daily WHERE date=TODAY GROUP BY line_id`
- `Spark` per line → `oee_daily` for past 7 days per line; BL-OEE-01: incremental append via `?since=last_ts` not yet implemented
- Performance loss / Quality loss cards → aggregation from `downtime_categories` and `qa_holds` + `rework_events` for today
- Period toggle → URL param `?period=today|7d|30d`; adjusts query window

---

### downtime_screen (other-screens.jsx:124-212)

**Pattern:** Pareto bar chart + distribution summary + filtered event log table.

- `DOWNTIME` mock → `downtime_events WHERE factory_id=X AND period=?` ordered by `started_at DESC`; period from URL param
- Pareto → `SELECT category, SUM(duration_min) as min, COUNT(*) as events FROM downtime_events WHERE ... GROUP BY category ORDER BY min DESC`; color by `group` (plant/process/people)
- Distribution card (Plant/Process/People totals with %) → compute from same GROUP BY query
- Search + category filter → URL search params `?q=mixer&cat=Plant`; Server Component re-fetches
- Source column → `downtime_events.source` enum: `'WO_PAUSE'` (auto) or `'MANUAL'`; badge derived from value
- "Log downtime" → opens `PauseLineModal`

---

### shifts_screen (other-screens.jsx:215-291)

**Pattern:** Line assignments table + handover notes card + shift targets vs actual card.

- `SHIFT_CREW` mock → `shift_assignments JOIN users WHERE shift_id=currentShiftId`; include `line_certifications` for cert badge
- Operator status badge (active/break/unassigned) → from `shift_assignments.status` enum
- Current WO per line → join via `lines.active_wo_id`
- Handover notes → `shift_handovers WHERE factory_id=X ORDER BY created_at DESC LIMIT 10`; new note via Server Action inserting to `shift_handovers`
- Shift targets vs actual → `shift_kpi_summary` view for `shift_id=currentShiftId`
- Re-assign individual operator → triggers `AssignCrewModal` with pre-selected line
- Start/End shift buttons → disabled if no active shift or already ended

---

### changeover_screen (other-screens.jsx:294-390)

**Pattern:** Multi-step allergen changeover wizard with done/in-progress/locked step sections and checklist.

- 5 hardcoded changeover steps → query `changeover_steps WHERE changeover_id=X ORDER BY step_number`; step status from `changeover_steps.status` enum (DONE/IN_PROGRESS/LOCKED)
- Cleaning checklist (14 of 18 done) → `changeover_checklist_items WHERE step_id=X`; `completed` boolean + `requires_photo` boolean
- Photo upload per item → file upload to blob storage; `photo_url` stored on `changeover_checklist_items`; `requires_photo=true` blocks step completion
- Dual sign-off step (step 4) → reads from `changeover_gate_signatures`; locked until all checklist items `completed=true`
- Done/In Progress/Locked section border → CSS `border-left` color keyed by status; tailwind `border-l-4 border-green-500` pattern
- Allergen info → from `changeover.allergen_in` / `changeover.allergen_out` JSONB (allergen IDs array compared to allergen lookup table)
- Release next WO button → enabled only when all steps done + dual sign-off complete; triggers `ReleaseWoModal`; server enforces the gate

---

### analytics_screen (other-screens.jsx:393-496)

**Pattern:** 4 KPI tiles + OEE trend chart + yield by line bars + top downtime drivers table.

- 4 KPI tiles → async Server Components fetching from `analytics_kpi_summary` view for selected period; wrap in `Suspense`
- OEE 7-day trend → Recharts `AreaChart` or `LineChart` with daily `oee_daily` data points; replace `Spark` SVG placeholder
- Yield by line bars → Recharts `BarChart`; green if `>= line.target_yield_pct`, amber below
- Top downtime drivers → `downtime_events GROUP BY category, line_id` for past 30 days, sorted by `SUM(duration_min) DESC`; `top_reason` from `MODE()` aggregate or most frequent `reason` text
- Period toggle (Today/7d/30d/Custom) → URL params; Custom triggers `Calendar`-based `DateRangePicker` popover
- Export PDF → Server Action calling Puppeteer-based PDF route; **BL-RPT-04** `@media print` stylesheet needed

---

### dlq_screen (other-screens.jsx:499-557)

**Pattern:** Connector health strip + 3 tabs (DLQ / Resolved / All events) + event table with inspect + retry.

- `DLQ` mock → `d365_dlq WHERE status='OPEN' ORDER BY moved_to_dlq_at ASC`; Resolved tab: `status='RESOLVED'`; All: `d365_push_events`
- Health strip → Server Component fetching `d365_connector_health` view; refresh on page load or SSE for live status
- Tab counts → COUNT queries per tab embedded in Server Component loader; avoid separate COUNT fetches
- Inspect → opens `DlqInspectModal` with `d` row as data prop
- Inline Retry → Server Action re-enqueuing single event; "Retry all open" → bulk Server Action with `WHERE status='OPEN'`
- Error column truncation → shadcn `Tooltip` for full error text; full payload in `DlqInspectModal`
- Design principle alert → `next-intl` key `production.dlq.design_principle`; MES-as-source-of-truth framing important for operator training

---

### settings_screen (other-screens.jsx:560-649)

**Pattern:** 5 accordion sections (Lines / 4P categories / Tolerances / Shifts / D365 push) with inline editable tables and toggle settings.

- Accordion sections → shadcn `Accordion` with `AccordionItem` / `AccordionTrigger` / `AccordionContent`
- Lines table with inline inputs → on-blur Save triggers Server Action updating `lines (nominal_cycle_kg_h, target_oee_pct, weighing_mode)`; validate numeric ranges
- Downtime categories tags → query `downtime_categories`; add button opens inline form; changes apply to future events only (immutable past events)
- Tolerances section → query / update `prod_settings WHERE factory_id=X`; `waste_capture_mandatory` and `dual_signoff_allergen` use shadcn `Switch`; `consumption_tolerance_pct` uses `Input` type="number"
- Shift definitions → query `shifts` table; edit per row via `ShiftEditModal` (not yet built); `rollover_rule` as `enum` in schema
- D365 push settings → query `d365_connector_config`; all fields stored there; update via Server Action with Plant Manager RBAC guard
- All settings → Server Actions must verify `session.user.role === 'PLANT_MANAGER'`; non-PM users see disabled inputs + shadcn `Tooltip` explaining required role
- **BL-PROD-04 adjacency:** "Edit OEE targets" button links to `OEETargetEditModal` — that modal's data layer also needs `prod_oee_targets` table

---

## Cross-Cutting Patterns

### PIN Verification (used in 7 modals)

All PIN inputs follow the same pattern:
1. Client: `<Input type="password" maxLength={4}>` with zod `z.string().length(4).regex(/^\d+$/)`
2. Server Action: compare submitted PIN against `users.pin_hash` using `bcrypt.compare()`
3. On success: record `{action}_by_user_id` + `{action}_at` on the relevant record
4. On failure: return `{ error: 'PIN_INVALID' }` — do NOT expose hash details

**BL-QA-06 note:** Virtual-keypad PIN anti-keylogger (OQ#8) — currently plain masked input; consider an on-screen PIN pad for touch-screen plant floor use.

### Outbox Event Pattern

All state-changing Server Actions should emit an outbox event after the primary DB write (same transaction):

```
INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, created_at)
VALUES ('WO', $woId, $eventType, $payload, NOW())
```

A background worker (Bull MQ / Temporal) polls outbox and pushes to D365.

### Mock Data → Real Data Migration Priority

1. **HIGH:** `WOS`, `WO_DETAIL`, `LINES`, `LINE_DETAIL` — core operational data
2. **HIGH:** `SHIFT_CREW`, `SHIFT_ASSIGNMENTS` — real-time shift state
3. **MEDIUM:** `WASTE_PARETO`, `WASTE_TREND`, `OEE_LINES`, `PARETO` — analytics views (can use materialized views)
4. **LOW:** `EVENTS_FEED`, `SPARK_OEE` — live streams (SSE or polling)
5. **PROTOTYPE ONLY:** `TweaksPanel` state — remove or gate behind dev mode

### next-intl Key Namespace Convention

All Production module strings should use the `production.*` namespace:
- Modals: `production.{modal_name}.{key}`
- Pages: `production.{screen_name}.{key}`
- Shared alerts: `production.alerts.{key}`
- Gate check texts: `production.gate.{gate_id}`
