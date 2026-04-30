# OEE Module — Prototype Translation Notes

Scanned: 2026-04-23  
Source files: `oee/modals.jsx`, `oee/dashboard.jsx`, `oee/screens.jsx`  
Backlog reference: `BACKLOG.md §OEE (BL-OEE-01..09)`  
Total components indexed: 23  
Total estimated translation time: ~1,720 min (~29 developer-hours)

---

## Summary by file

| File | Components | Est. minutes |
|---|---|---|
| `oee/modals.jsx` | 12 modals | 505 |
| `oee/dashboard.jsx` | 3 (OeeSummary + 2 tabs) | 340 |
| `oee/screens.jsx` | 12 screens + 1 shell | 875 |

---

## Cross-cutting patterns (apply to ALL OEE components)

### 1. Data layer
All mock constants (`OEE_TODAY`, `SIX_BIG_LOSSES`, `CHANGEOVER_EVENTS`, `HEATMAP`, `OEE_THRESHOLDS`, etc.) are prototype-only. Production must:
- Read from Postgres via Drizzle ORM in Server Components
- Primary materialized views: `oee_daily_summary`, `oee_shift_metrics`, `oee_snapshots`
- Downtime data is **read from 08-PRODUCTION** (`downtime_events`); OEE module does not write to it directly
- Threshold data lives in **02-SETTINGS** (`oee_alert_thresholds`, `shift_configs`)

### 2. State management
All `React.useState` instances in the prototype will split in production:
- **URL search params** for shareable, bookmarkable page state (date, lineFilter, tab, sort, window, shift)
- **useForm + zodResolver** for form state inside modals
- **Zustand / jotai atom** only for transient client-only state (auto-refresh pause timer, hovered gauge highlight)

### 3. Modal primitives
All modals use `window.Modal` (prototype primitive). Production mapping:
- `size="sm"` → `DialogContent className="max-w-sm"`
- `size="default"` → `DialogContent className="max-w-lg"`
- `size="wide"` → `DialogContent className="max-w-3xl"`
- `size="fullpage"` → `Sheet` (slide-over) with `SheetContent side="right" className="w-full sm:max-w-full"`
- `dismissible={false}` → `onInteractOutside={(e) => e.preventDefault()}` + `onEscapeKeyDown={(e) => e.preventDefault()}`

### 4. RBAC
All role checks (inline `role === "Admin"`, `role === "Shift Supervisor"`, etc.) must move server-side:
- Route-level guard via Next.js middleware for admin-only pages (`/oee/settings`, `/oee/shifts`)
- Server Action guard using `can(session.user.role, resource, action)` policy function
- Never pass raw role strings to client components

### 5. Charts (BL-OEE-09 decision point)
The prototype uses zero-dependency inline SVG for all charts (`TrendChart`, `ArcGauge`, `Spark`, `pareto-bar` divs). Production must decide:
- **Option A:** Recharts (ComposedChart, BarChart, LineChart, RadialBarChart) — recommended for maintainability
- **Option B:** D3 + custom SVG components — more control, higher complexity
- Whichever is chosen, `ArcGauge` is the most reused primitive (appears in line-trend, heatmap cell detail, drill-down pages, and 4 modals); build it first as a shared component

### 6. Internationalization
All hardcoded English labels must use `next-intl` with the namespace pattern `t('oee.<screen>.<key>')`. Priority keys:
- OEE factor names: Availability / Performance / Quality → `t('oee.factors.availability')` etc.
- Six Big Losses category labels → `t('oee.bigLoss.<code>')` per Nakajima TPM taxonomy
- Status labels: world-class / on-target / below-target → `t('oee.status.<level>')`

### 7. P2 components
The following are P2 only — add feature flag guards before rendering:
- `OeeAnomalies` → flag `oee.anomaly_detection_enabled`
- `OeeEquipmentHealth` → flag `oee.equipment_health_enabled` + requires 13-MAINTENANCE module
- `OeeTV` → flag `oee.tv_dashboard_enabled` (OS kiosk decision still open per BL-OEE-06)
- `AcknowledgeAnomalyModal` (M-11) → same flag as OeeAnomalies
- `CompareWeeksModal` (M-10) diff view → flag `oee.compare_weeks_diff_enabled` (BL-OEE-05)

---

## Component-by-component notes

### M-01 `annotate_downtime_modal` (modals.jsx:19-93) — est. 90 min

Critical detail: the 1-hour edit window (`editWindowClosed`) is hardcoded `false` in the prototype. Production must compute server-side: `event.ended_at + interval '1 hour' < now()`. This must be returned from the Server Component loader, not computed client-side (prevents clock skew exploits).

The supervisor category override select is powered by `BIG_LOSS_MAPPING` array. In production this must be a server-fetched list from `oee_big_loss_mapping` (editable via M-04). Changing a category must write to `downtime_events.override_category` and log an audit row in `downtime_override_audit`.

The API note in the prototype (`PATCH /api/production/downtime-events/:id`) is intentional — OEE does not own this table. The Server Action must call 08-PRODUCTION's service layer.

---

### M-02 `export_oee_modal` (modals.jsx:95-161) — est. 60 min

Format radio group: XLSX is explicitly P2 (disabled badge). In production, render only CSV and PDF options when flag `oee.export.xlsx_enabled` is false — do not render disabled XLSX at all in production.

The raw snapshot warning (5 MB / 15–30 s) applies when `sections.raw` is selected. In production, the Server Action should validate the estimated size server-side before accepting the job, and return an error if it exceeds a configurable limit.

Export job should be queued (background job) and the user notified via in-app toast when ready — not a synchronous download.

---

### M-03 `line_override_modal` (modals.jsx:163-204) — est. 50 min

Create vs Edit mode is determined by `data` prop presence. Production should use the same modal for both paths; the form's `defaultValues` differ. The line select is disabled in edit mode — enforce server-side as well (PUT endpoint should 400 if `line` changes).

Info note mentions heatmap colour scale stays fixed (65/85) in P1. This is a documented limitation. The per-line override affects KPI badge colours and target reference lines only, not the heatmap cell colours.

---

### M-04 `big_loss_mapping_modal` (modals.jsx:206-259) — est. 75 min

This is the most consequential settings modal. Changing a mapping instantly re-classifies all historical data dynamically (per prototype note). Production must:
1. Validate no orphaned `OTHER_UNCATEGORIZED` entries after save
2. Emit a background job to invalidate and refresh `oee_daily_summary` + `oee_shift_metrics` MVs
3. Warn the admin in the modal that refresh may take N minutes (show estimated time)

The `dirty` flag pattern maps to `formState.isDirty` from react-hook-form. Use `useFieldArray` for the dynamic rows.

---

### M-05 `changeover_detail_modal` (modals.jsx:261-298) — est. 40 min

Read-only modal. The cross-link to 08-PRODUCTION (`/production/changeover/:event_id`) should be a real Next.js `<Link>` — it navigates away from the OEE context, so consider opening in a new tab (`target="_blank"`).

Allergen risk, target durations, and the BRCGS audit field all originate outside OEE. The prototype notes this correctly. Do not duplicate this data in OEE tables.

---

### M-06 `cell_drill_modal` (modals.jsx:300-326) — est. 50 min

Four ArcGauge components are the visual core. In production these must be real SVG arcs (not CSS divs) with smooth animation on data change. The `highlighted` prop for synchronized hover effect across gauges → use React context or Zustand to share hover state between gauge instances.

The snapshot gap detection (hardcoded "432 / 480 · 1 gap") must be a real query: `COUNT(*) FILTER (WHERE snapshot IS NULL)` from `oee_snapshots` for the shift window.

---

### M-07 `request_edit_modal` (modals.jsx:328-348) — est. 35 min

Escalation flow: the Server Action must find the nearest `oee_supervisor` by site/line and send an in-app notification. Do not hardcode a supervisor lookup — use the `user_roles` table filtered by `role = 'oee_supervisor'` and `site_id = event.site_id`.

Minimum 10-character reason is a zod constraint. Also enforce server-side — the Server Action should validate before writing.

---

### M-08 `delete_override_modal` (modals.jsx:350-370) — est. 30 min

Type-to-confirm pattern requires a client component (controlled input). The zod schema `z.literal(data.line)` is applied via `superRefine`. The delete Server Action must also clear any cached threshold values (Redis or Next.js cache tags) for that line.

---

### M-09 `copy_clipboard_modal` (modals.jsx:372-408) — est. 25 min

The plain-text block is hardcoded in the prototype. Production must generate it server-side from `oee_daily_summary` for the requested date. Consider a dedicated `/api/oee/clipboard-summary?date=...` endpoint that returns the formatted string, cached per date.

Use `navigator.clipboard.writeText()` with a fallback for non-HTTPS environments. Show a Sonner toast on success and on `NotAllowedError`.

---

### M-10 `compare_weeks_modal` (modals.jsx:410-446) — est. 40 min

BL-OEE-05: The "Compare →" button currently navigates to a diff view that does not yet exist. In production, implement the diff view as URL params on the heatmap page (`?compareWeekA=W15&compareWeekB=W16`). The modal becomes a picker only; the diff renders inline in the heatmap.

Week options are hardcoded to 4 weeks. Production: fetch distinct `week_key` values from `oee_shift_metrics` with `LIMIT 52` ordered DESC.

---

### M-11 `acknowledge_anomaly_modal` (modals.jsx:448-484) — est. 45 min

P2 only. The dual-path action (investigate vs false-positive) drives different Server Action branches:
- `investigate`: sets `anomaly.status = 'ack'`, logs `ack_by` + `ack_at`, creates investigation task
- `false-positive`: sets `anomaly.status = 'false_positive'`, logs reason; feeds back to EWMA detector to adjust baseline

The anomaly workflow is defined in OQ-OEE-08. Implement the audit log first before the workflow branching.

---

### M-12 `auto_refresh_pause_modal` (modals.jsx:486-509) — est. 20 min

Purely client-side. `pauseUntil` timestamp stored in a jotai atom or Zustand slice. The auto-refresh `useInterval` hook reads this atom and skips the tick while `Date.now() < pauseUntil`.

Do not persist pause state to the server or across browser tabs.

---

### `oee_daily_summary_page` (dashboard.jsx:1-198) — est. 180 min

This is the primary OEE landing screen (OEE-003). Key architectural decisions:

**Date default:** Prototype defaults to "yesterday" via hardcoded `"2026-04-20"`. Production: Server Component computes `yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)` in UTC. Support `?date=` URL param for navigation.

**Line filter:** Prototype filters client-side. Production: pass `line` URL param to Drizzle query. Server Component re-renders on navigation.

**Tab state:** Three tabs (Summary / Six Big Losses / Changeover) → `?tab=summary|losses|changeover` URL param. Default: `summary`. Tabs are implemented as `<Tabs>` with `defaultValue` from searchParams.

**KPI row:** Five cards clicking to different destinations — use `<button onClick={() => router.push(...)}>`  or make the card itself a `<Link>`. The "Total downtime → Production" cross-link must be a real `/production/downtime?date=...` href.

**Sortable table:** Use TanStack Table v8 with server-side sort. Pass `sortCol` + `sortDir` as URL params. The factory avg footer row must come from SQL, not client-side reduce.

**Stale alert:** `stale = false` is hardcoded. Production: Server Component reads `oee_daily_summary.last_refreshed_at`; if older than 20 minutes render a `<Alert variant="warning">` above the table.

---

### `six_big_losses_tab` (dashboard.jsx:200-306) — est. 90 min

The OEE impact decomposition `<pre>` block is a key feature. In production, compute A/P/Q loss percentages server-side (SQL window functions over downtime minutes vs planned time). The formula comments in the prototype are correct and should be preserved as inline docs in the Server Component.

The downtime events table at the bottom of this tab is the annotation workflow entry point. In production, this table uses cursor-based pagination (the full event list can be long). Implement `?cursor=` URL param or infinite scroll with `useInfiniteQuery`.

Role-conditional annotation hint: pass `session.user.role` as a server prop; never expose raw role to client components beyond the minimum required.

---

### `changeover_tab` (dashboard.jsx:308-390) — est. 70 min

The four KPI mini-cards compute values from CHANGEOVER_EVENTS via JS reduce in the prototype. In production all four values (total duration, avg, high-allergen count, longest) must come from a single SQL aggregation query — not computed client-side.

The allergen risk color mapping (High/Medium/Low → red/amber/green) is used here, in M-05, and in the line trend screen. Extract to a shared `allergenRiskVariant` cva helper.

---

### `oee_line_trend_page` (screens.jsx:3-209) — est. 200 min

This is the most complex single screen. Key notes:

**Time window:** `1h / 6h / 24h` pill selection must narrow the `oee_snapshots` query WHERE clause, not filter client-side. The trend chart data volume varies significantly (60 points for 1h vs 1440 for 24h at 1-min granularity) — implement server-side downsampling for the 24h window.

**Downtime bands on chart:** Rendered as `ReferenceArea` in recharts. Source from `downtime_events` for the selected line + window. Do not hardcode LINE-02 bands.

**Changeover markers:** `ReferenceLine` at changeover start time. Source from `changeover_events`.

**Alert for long downtime events:** The LINE-02 Mixer M-002 alert is hardcoded. Production: if any downtime event in the current window exceeds 60 minutes (or a configurable threshold), render an Alert. This is a pure data-driven condition.

**BL-OEE-01:** Incremental chart append (`?since=last_ts`) is not implemented in the prototype. In production, implement as a `useInterval` hook that fetches only new snapshot points since the last known timestamp and appends to the chart data array.

---

### `oee_shift_heatmap_page` (screens.jsx:211-377) — est. 180 min

The heatmap grid uses `role="grid"` and `role="gridcell"` with `aria-label` — keep these in production. The keyboard navigation (BL-OEE-04) must be wired: `onKeyDown` on the grid element handles ArrowUp/ArrowDown/ArrowLeft/ArrowRight to move `selected` state between cells.

**Color scale:** Fixed at red <65% / amber 65–85% / green ≥85% in P1. The prototype notes this stays fixed even with per-line overrides. In P2 this should become tenant-configurable via `oee_alert_thresholds`. Use CSS custom properties so the color scale can be changed at runtime without a code deploy.

**Selected cell detail panel:** When a cell is clicked, the detail panel below the grid updates. In production, this detail should be loaded via a Server Action on cell click (not embedded in the page payload for all cells). The panel shows 4 ArcGauges + KPI rows — same data shape as M-06 cell_drill_modal.

---

### `oee_downtime_pareto_page` (screens.jsx:379-469) — est. 100 min

P2 preview — the page currently has a prominent info alert pointing to the Six Big Losses tab. Keep this alert in production until the full Pareto drill-down (with line/machine/category breakdown) ships.

The cumulative Pareto calculation (sort + running sum) should move to SQL:
```sql
SELECT label, mins,
       SUM(mins) OVER (ORDER BY mins DESC) AS cum_mins,
       ROUND(SUM(mins) OVER (ORDER BY mins DESC) / SUM(mins) OVER () * 100, 1) AS cum_pct
FROM oee_loss_summary
WHERE date = $1
ORDER BY mins DESC;
```

The 80% threshold line index (`eightyLine`) becomes a simple `WHERE cum_pct <= 80` filter to identify which bars are in the "vital few."

---

### `oee_availability_drilldown_page` (screens.jsx:471-543) — est. 90 min
### `oee_performance_drilldown_page` (screens.jsx:546-598) — est. 60 min
### `oee_quality_drilldown_page` (screens.jsx:600-655) — est. 60 min

These three pages share an identical structure (factory gauge + by-line table + loss categories list + 7-day trend). In production, extract a single `<OeeFactorDrillPage>` layout component parameterized by `factor: 'A' | 'P' | 'Q'` with:
- `color`: `#3b82f6` / `#22c55e` / `#f59e0b`
- `target`: from `oee_alert_thresholds.a_min` / `p_min` / `q_min`
- `formulaLabel`: locale string from `t('oee.factors.formula.a')`
- `impactDimension`: passed to the WHERE clause of the loss categories query

The P factor's "micro stops" column uses `Math.round(d.downtime/8)` as a mock approximation. Production must use a real `micro_stop_count` column from `oee_snapshots` (count of downtime events < 5 minutes).

The Q factor's "Rejects" column derives reject weight from output × (1 - q/100). Production: use actual `reject_kg` or `reject_units` from `production_output_events` — the formula-derived value may differ from reality due to partial yields.

---

### `oee_settings_page` (screens.jsx:698-833) — est. 120 min

Three logical sections rendered on one page:
1. **Tenant default thresholds** — inline edit table with save/cancel
2. **Per-line overrides** — table with modal-backed CRUD
3. **Big Loss mapping preview** — read-only snippet + link to full editor modal

Production note: sections 1 and 3 write to 02-SETTINGS. Section 2 writes to `oee_line_threshold_overrides`. All three Server Actions must `revalidatePath('/oee/settings')` and also invalidate any cached threshold values used by the dashboard pages.

The P2 rows (Anomaly EWMA Alpha, Anomaly Sigma Threshold, Maintenance Trigger Availability) should be rendered as non-editable rows with a P2 badge and `<Tooltip>` explaining availability. Do not hide them — they communicate the roadmap.

---

### `oee_shift_configs_page` (screens.jsx:836-900) — est. 50 min

This page is explicitly read-only in OEE. The Edit button cross-links to 02-SETTINGS. In production, verify that the user's session has access to the 02-SETTINGS route before rendering the cross-link button (if they don't have settings admin, render it disabled or hidden).

The DSL rule status section (shift_aggregator_v1) should show the actual rule status from the `rule_registry` table — Active, Paused, or Error — with last-run timestamp and next-run timestamp.

---

### `oee_anomaly_detection_page` (screens.jsx:950-995) — est. 80 min

P2 only. Architecture notes for when this ships:

The EWMA rule (`oee_anomaly_detector_v1`) runs after each `oee_snapshots` insert (or on a rolling window schedule). It writes to `oee_anomalies` with fields: `line_id`, `detected_at`, `actual_oee`, `expected_oee`, `sigma_deviation`, `severity`, `status`, `ack_by`, `ack_at`.

The acknowledge workflow (M-11) must emit an event to the notification outbox. The daily email digest (OQ-OEE-08) is a separate scheduled job reading unacked anomalies from the past 24h.

Table row opacity:0.75 in the prototype is a visual "coming soon" hint — remove in production, use full opacity for real data.

---

### `oee_equipment_health_page` (screens.jsx:997-1036) — est. 70 min

P2 only. Depends on 13-MAINTENANCE module being live. The `oee_maintenance_trigger_v1` rule creates PM work orders when A < 70% for 3 consecutive days. In production, this page reads from:
- `equipment` table (13-MAINTENANCE) for asset metadata
- `oee_snapshots` aggregated over 30 days for availability %
- `maintenance_work_orders` fault history for MTBF/MTTR computation

MTBF = mean time between failures = (total runtime hours) / (number of fault events)
MTTR = mean time to repair = (sum of fault durations) / (number of fault events)

Both must be computed as SQL window functions or materialized in a dedicated `equipment_health_metrics` table refreshed nightly.

---

### `oee_tv_dashboard_page` (screens.jsx:1038-1080) — est. 60 min

P2 only. OS kiosk decision is open (BL-OEE-06). Key production decisions deferred:
- OS: Raspberry Pi vs Windows kiosk vs ChromeOS
- Auto-refresh: 30s `router.refresh()` vs WebSocket push
- Font scaling: 20px body / 48px values (spec OQ-OEE-08)
- Color-blind safety: ColorBrewer RdYlGn palette instead of red/amber/green

The TV layout (dark background, 16:9 aspect ratio, large OEE value) should be a separate Next.js route `/oee/tv` with its own layout that strips the navigation shell. No interactive controls.

---

### `p2_placeholder_shell` (screens.jsx:902-948) — est. 25 min

Shared component reused for Anomalies, Equipment Health, and TV when their feature flags are off. Production should implement this as a single `<ComingSoonPage>` server component in `/components/shared/`. Props:
- `title: string`
- `description: string`
- `featureFlag: string` (display only, not evaluated here — evaluated by the calling route)
- `alternativeLink?: { href: string; label: string }`
- `relatedRule?: string`

Cross-link buttons should be Next.js `<Link>` components, not `window.alert`.

---

## Known backlog items affecting OEE translation (from BACKLOG.md)

| ID | Item | Priority | Affects |
|---|---|---|---|
| BL-OEE-01 | Incremental chart append via `?since=last_ts` | Medium | oee_line_trend_page |
| BL-OEE-02 | Sort by shift column in heatmap | Low | oee_shift_heatmap_page |
| BL-OEE-03 | Color-blind mode (dashed/dotted lines) | Low | oee_line_trend_page, oee_tv_dashboard_page |
| BL-OEE-04 | Arrow-key nav on heatmap cells | Low | oee_shift_heatmap_page |
| BL-OEE-05 | Compare-weeks diff view (M-10 modal → full diff) | Medium | compare_weeks_modal, oee_shift_heatmap_page |
| BL-OEE-06 | TV OS kiosk decision | P2 | oee_tv_dashboard_page |
| BL-OEE-07 | Audit log viewer for category overrides | Low | oee_settings_page |
| BL-OEE-08 | localStorage persistence for last-viewed date | Low | oee_daily_summary_page |
| BL-OEE-09 | Recharts vs inline SVG decision | Low | All chart components |

Also note from `BACKLOG.md §Production (BL-PROD-05)`: `.btn-danger` is missing from `_shared/shared.css`. This affects `delete_override_modal` (M-08) and `request_edit_modal` (M-07) which use destructive button styling. Fix in shared CSS before translating any destructive confirm pattern.
