# 15-OEE — UX Specification (for prototype generation)

**Version:** 1.1
**Date:** 2026-04-21
**Source PRD:** 15-OEE-PRD v3.1 (authoritative, Phase C5 Sesja 1 + stakeholder decisions 2026-04-21)
**Target:** Claude Design — interactive HTML prototypes
**Status:** Ready for prototyping
**Updated:** 2026-04-21 — 9 of 10 open questions resolved; TV OS decision still open

---

## 0. Module Overview

Module **15-OEE** is the analytics and visualization layer for Overall Equipment Effectiveness. It is a **read-only consumer** of production events produced by 08-PRODUCTION, and a **data producer** for 12-REPORTING and (in Phase 2) 13-MAINTENANCE and 14-MULTI-SITE.

**The OEE formula:**

```
OEE = Availability × Performance × Quality

Availability  = (planned_min − downtime_min) / planned_min
Performance   = (output_qty × ideal_cycle_time_sec) / (run_time_min × 60)
Quality       = good_qty / total_output_qty

Baseline: P1 target 70% (Apex ramp-up baseline, configurable via 02-SETTINGS `oee_alert_thresholds.oee_target_pct`)
           Industry world-class: 85% (food manufacturing)
           65–85% = typical food-manufacturing range
           < 65% = poor, requires immediate investigation
```

**What 15-OEE owns vs what 08-PRODUCTION shows inline:**

| Concern | Owner | Location |
|---|---|---|
| OEE formula calculation (per-minute batch) | 08-PRODUCTION cron `oee_aggregator` | `oee_snapshots` table |
| Live OEE dashboard on active WO / current shift | 08-PRODUCTION | `/production/oee` (PROD-006) |
| Per-line 24h trend (historical + current) | 15-OEE | `/oee/line/[line_id]` (OEE-001) |
| Per-shift heatmap (multi-line × multi-day) | 15-OEE | `/oee/heatmap` (OEE-002) |
| Per-day summary rollup with sparklines | 15-OEE | `/oee/summary` (OEE-003) |
| Six Big Losses breakdown view | 15-OEE | `/oee/summary` tab (OEE-003) |
| Changeover analysis (basic P1) | 15-OEE | `/oee/summary` tab (OEE-003) |
| `oee_daily_summary` MV (consumed by 12-REPORTING) | 15-OEE | Postgres MV, refresh 15 min |
| `oee_shift_metrics` MV (shift rollup) | 15-OEE | Postgres MV, refresh post-shift |
| OEE Summary consumer card | 12-REPORTING | `/reporting/oee-summary` (RPT-005) |
| Anomaly detection EWMA alerts | 15-OEE (P2) | `/oee/anomalies` (OEE-P2-A) |
| Plant-floor TV dashboard | 15-OEE (P2) | `/oee/tv/[line_id]` (OEE-P2-B) |

**Primary personas:**

| Persona | Primary screens | Typical use |
|---|---|---|
| Line Operator | OEE-001 (per-line trend) | Monitor own line's OEE in shift; respond to dips below target |
| Shift Supervisor | OEE-002 (heatmap), OEE-001 (drill-down) | Compare all lines across shifts; identify worst-performing cells |
| Production Manager | OEE-003 (daily summary), OEE-002 (heatmap) | Daily/weekly review; 7-day trend; best/worst line |
| Plant Director | OEE-003, 12-REPORTING RPT-005 | Factory KPI read; board reporting |
| Continuous Improvement Engineer | OEE-003 Six Big Losses tab, OEE-002 | Pareto analysis of losses; Lean improvement targeting |

**RBAC roles specific to 15-OEE:**

| Role | Capabilities |
|---|---|
| `oee_viewer` | Read all P1 OEE dashboards; export CSV/PDF |
| `oee_operator` | `oee_viewer` + annotate downtime reason notes from dashboard |
| `oee_supervisor` | `oee_operator` + override downtime category (with audit trail) |
| `oee_admin` | `oee_supervisor` + configure `oee_alert_thresholds`; manage shift boundaries via 02-SETTINGS |

**Cross-module positions:**

- **Upstream (consumers):** 08-PRODUCTION (`oee_snapshots`, `downtime_events`, `changeover_events`); 02-SETTINGS (`shift_configs`, `oee_alert_thresholds`, `downtime_categories`, rule registry §7.8); 09-QUALITY (Quality factor cross-reference for Q component context).
- **Downstream (producers):** 12-REPORTING reads `oee_daily_summary` MV; 13-MAINTENANCE (P2) reads `oee_shift_metrics` MTBF/MTTR; 14-MULTI-SITE (P2) reads per-site OEE rollup.

---

## 1. Design System (Inherited)

All tokens are sourced from MONOPILOT-SITEMAP.html and are identical to the system defined in 08-PRODUCTION-UX §1 and 12-REPORTING-UX §1. Apply them as-is. No overrides are made except the OEE-specific color additions in §1.3 below.

### 1.1 Base tokens

| Token | Value | Usage |
|---|---|---|
| `--blue` | `#1976D2` | Primary actions, active sidebar border, links, tab underline |
| `--green` | `#22c55e` | Success, favorable KPI, OEE world-class |
| `--amber` | `#f59e0b` | Warnings, approaching threshold, typical OEE range |
| `--red` | `#ef4444` | Errors, critical variance, poor OEE |
| `--info` | `#3b82f6` | Informational alerts, target reference lines on charts |
| `--bg` | `#f8fafc` | Page background |
| `--sidebar` | `#1e293b` | Sidebar background |
| `--card` | `#ffffff` | Card / panel background |
| `--text` | `#1e293b` | Primary body text |
| `--muted` | `#64748b` | Secondary text, timestamps, column headers |
| `--border` | `#e2e8f0` | Card borders, table dividers |
| `--radius` | `6px` | Card border radius |

**Typography:** Inter, system-ui, -apple-system, sans-serif. Base 14px / line-height 1.4. Page titles 20px bold. Card titles 14px semibold. Labels 12px medium (`#374151`). Muted/secondary 11–12px (`#64748b`). Monospace for codes and routes.

**Spacing / Radius:** Sidebar 220px wide. Card radius 6px. Modal width 560px, max-height 80vh, scroll inside. Button radius 4px. Main content margin-left 220px, padding 40px 20px.

### 1.2 Component classes

Use these class names in all HTML prototype output — identical to 08-PRODUCTION and 12-REPORTING:

- `.kpi` — KPI card with colored bottom border (3px). Modifiers: `.green`, `.amber`, `.red` change `border-bottom-color`.
- `.kpi-label` — 11px muted label. `.kpi-value` — 26px bold. `.kpi-change` — 11px delta text.
- `.badge` — inline pill. `.badge-green`, `.badge-amber`, `.badge-red`, `.badge-blue`, `.badge-gray`.
- `.tabs` / `.tab` / `.tab.active` — horizontal tab bar. Active tab: blue bottom border + blue text + weight 600.
- `.tl-item` — timeline row with `.tl-dot` colored circle, description text, `.tl-time` on right.
- `.alert-red`, `.alert-amber`, `.alert-blue`, `.alert-green` — alert boxes with left border and background tint.
- `.btn-primary` (blue fill), `.btn-secondary` (white/border), `.btn-danger` (red fill), `.btn-success` (green fill).
- `.form-field` / `.form-label` / `.form-input` — standard form layout. `.req` marks required fields in red.
- `.grid-2`, `.grid-3`, `.grid-4` — equal-column CSS grids with `gap: 12px`.
- `.card` with `.card-title` — standard content card.
- `#modal-overlay` / `#modal-box` / `.modal-title` — shared modal shell at page level.

### 1.3 OEE-specific color coding

These additions are specific to 15-OEE and extend (do not override) the base palette.

**OEE composite threshold mapping:**

| OEE Range | Classification | Color token | Hex | Badge class |
|---|---|---|---|---|
| ≥ 85% | World-class | `--green` | `#22c55e` | `.badge-green` |
| 65–84.9% | Typical food-mfg | `--amber` | `#f59e0b` | `.badge-amber` |
| < 65% | Poor — action required | `--red` | `#ef4444` | `.badge-red` |
| = 100% | Unrealistic — investigate | purple `#a855f7` | `#a855f7` | `.badge-purple` (custom) |

Note: P1 uses fixed industry thresholds (65/85) for OEE color coding — these are hard-coded in the D3 color scale for P1 (per OQ-OEE-07 decision 2026-04-21). The per-line OEE target (default 70% for Apex, configurable via `oee_alert_thresholds.oee_target_pct`) is shown as the target reference line on charts but does not shift the green/amber/red color boundaries in P1. P2: color scale thresholds become tenant-configurable via 02-SETTINGS `oee_alert_thresholds`, replacing the fixed 65/85 values.

**A / P / Q component colors (chart lines and gauge arcs):**

| Component | Color | Hex | Usage |
|---|---|---|---|
| Availability | Blue-500 | `#3b82f6` | Chart line A, gauge arc A |
| Performance | Green-500 | `#22c55e` | Chart line P, gauge arc P |
| Quality | Amber-500 | `#f59e0b` | Chart line Q, gauge arc Q |
| OEE (combined) | Black | `#000000` bold | Chart line OEE, combined gauge |
| Target reference line | `--info` dashed | `#3b82f6` | Dashed horizontal or gauge marker |

**Downtime category colors (Six Big Losses / Pareto):**

| Category | Lean class | Color | Hex |
|---|---|---|---|
| People (breaks, missing, training) | People | Blue-500 | `#3b82f6` |
| Process (material wait, upstream, QA hold) | Process | Amber-500 | `#f59e0b` |
| Plant (machine fault, cleaning, changeover) | Plant | Red-500 | `#ef4444` |

### 1.4 Gauge component specification

15-OEE uses a set of four linked gauge components on the per-line trend dashboard. Each gauge is a D3.js arc gauge (semi-circle, 180°). The designer renders four gauges per line: A, P, Q, and combined OEE. Specifications:

- **Shape:** Semi-circle arc, 120px wide × 60px tall per gauge. Stroke width 12px. Background arc color: `#e2e8f0`. Foreground arc: colored per §1.3 component colors.
- **Label:** Component letter (A / P / Q / OEE) centered below arc in 11px `--muted`. Value large (20px bold) centered inside arc.
- **Target marker:** A small tick mark at the target angle (default 85% = 153° from left). Color: `--info` dashed.
- **OEE combined gauge:** Same shape; foreground arc color transitions: green if ≥ 85%, amber if 65–84.9%, red if <65%.
- **Linked behavior:** Hovering any of the four gauges highlights all four simultaneously (shared state via JavaScript event bridge).
- **Accessibility:** Each gauge has `aria-label="Availability: 87.5%, target 85%"` (or equivalent for P, Q, OEE). Color-blind-safe alternative: display numeric value prominently; do not rely on color alone. Add a text annotation below each arc: "▼ 2.5pp vs target" or "▲ 1.5pp vs target".

### 1.5 Number formatting (inherited from 12-REPORTING §1.4)

- Percentage: 1 decimal place — `87.5%`
- Weight (kg): thousands separator, no decimal — `1,234 kg`
- Duration: `2h 14m` above 60 min; `45 min` below 60 min
- Date: UK default `DD/MM/YYYY`; ISO for filenames `YYYY-MM-DD`
- Shift label: `AM` / `PM` / `Night` (Apex baseline)
- Timestamp: `HH:MM:SS` for refresh indicators; `HH:MM` elsewhere

### 1.6 Freshness indicator (all dashboards)

Immediately below the filter bar on every 15-OEE screen: "Last aggregation: HH:MM:SS" in 11px `--muted`. If `now() − max(snapshot_minute) > 120s`, show `.badge-amber` "Data stale — aggregation may have paused" with a [Retry] icon button. A 2px indigo progress bar slides across the top of the main content area during a manual refresh.

Auto-refresh: every 60 seconds via `setInterval`. A small top-right control shows an "Auto-refresh 60s" toggle and a manual [Refresh] button, consistent with 08-PRODUCTION standard.

### 1.7 Status badge mapping (OEE-specific additions)

| State | Badge class | Label |
|---|---|---|
| World-class OEE ≥ 85% | `.badge-green` | On target |
| Typical OEE 65–84.9% | `.badge-amber` | Below target |
| Poor OEE < 65% | `.badge-red` | Action required |
| Shift aggregation pending | `.badge-blue` | Calculating |
| No data (empty shift) | `.badge-gray` | No data |
| Data stale | `.badge-amber` | Data stale |
| P2 feature stub | `.badge-gray` | Coming in P2 |

---

## 2. Information Architecture

### 2.1 Sidebar entry

Sidebar group: **OPERATIONS** (same group as 08-PRODUCTION, per OQ-OEE-09 decision 2026-04-21). The OEE entry sits below 08-PRODUCTION in the OPERATIONS group. It is NOT under ANALYTICS (12-REPORTING remains in ANALYTICS).

- Label: `OEE`
- Icon: SVG gauge icon (or placeholder emoji equivalent)
- Active: `border-left: 3px solid #1976D2; background: #1e3a5f`
- Collapsed sub-items expand on click (class `.sidebar-sub.open`)

Sub-items (sidebar-subitem):

1. Line Trend → `/oee/line` (or last-viewed line)
2. Shift Heatmap → `/oee/heatmap`
3. Daily Summary → `/oee/summary`
4. Settings → `/oee/settings` _(admin only)_
5. Shift Config → `/oee/shift-configs` _(admin only, cross-link 02-SETTINGS)_

P2 sub-items (grayed, `.badge-gray` "P2" beside label):

6. Anomalies → `/oee/anomalies`
7. Equipment Health → `/oee/equipment-health`
8. Pareto Analysis → `/oee/pareto`
9. TV Dashboard → `/oee/tv/[line_id]`

### 2.2 Route map

| Route | Screen ID | Dashboard |
|---|---|---|
| `/oee/line/[line_id]` | OEE-001 | Per-line 24h OEE Trend |
| `/oee/heatmap` | OEE-002 | Per-shift Heatmap |
| `/oee/summary` | OEE-003 | Per-day OEE Summary |
| `/oee/settings` | OEE-ADM-001 | OEE Alert Thresholds (admin) |
| `/oee/shift-configs` | OEE-ADM-002 | Shift Config Viewer (admin, cross-link 02-SET) |
| `/oee/anomalies` | OEE-P2-A | Anomaly History (P2) |
| `/oee/equipment-health` | OEE-P2-B | Equipment Health (P2) |
| `/oee/pareto` | OEE-P2-C | Pareto Loss Analysis (P2) |
| `/oee/tv/[line_id]` | OEE-P2-D | Plant-floor TV (P2) |
| `/oee/benchmark` | OEE-P2-E | Industry Benchmark (P2) |

**Deep-link from 08-PRODUCTION:** PROD-006 (`/production/oee`) shows a bottom link card "Advanced OEE analytics → 15-OEE module" with [Go to 15-OEE] button navigating to `/oee/summary`. 15-OEE screens with a specific `line_id` link back to `/production/lines/:id` for live WO execution data.

### 2.3 Permissions matrix

| Capability | Operator | Shift Supervisor | Prod Manager | CI Engineer | Plant Director | Admin |
|---|---|---|---|---|---|---|
| View per-line trend (own line) | Read | Read all | Read all | Read all | Read all | Full |
| View per-line trend (other lines) | Denied | Read | Read | Read | Read | Full |
| View heatmap | Denied | Read | Read | Read | Read | Full |
| View daily summary | Read (own line) | Read | Read | Read | Read | Full |
| Export CSV/PDF | Yes | Yes | Yes | Yes | Yes | Full |
| Annotate downtime notes | oee_operator+ | Yes | Yes | Yes | No | Full |
| Override downtime category | No | oee_supervisor+ | oee_supervisor+ | No | No | Full |
| Configure OEE thresholds | No | No | No | No | No | oee_admin |
| Configure shift boundaries | No | No | No | No | No | oee_admin (02-SET) |
| View P2 placeholder screens | All (banner shown) | All | All | All | All | Full |

**Permission-denied state:** Any screen or action beyond the current role shows either a disabled button (grayed, `cursor: not-allowed`, tooltip "Insufficient permissions") or a full-page `.alert-red` with "You do not have permission to view this page. Contact your administrator."

---

## 3. Screens

---

### SCREEN OEE-001 — Per-line 24h OEE Trend Dashboard

**Screen ID:** OEE-001
**Route:** `/oee/line/[line_id]`
**Purpose:** Real-time and historical view of OEE for a single production line over a configurable window (1h / 6h / 24h). Primary screen for Line Operators and Shift Supervisors. Shows four linked gauges (A, P, Q, OEE), a four-line D3.js trend chart, a downtime cause breakdown, and a changeover summary. Auto-refreshes every 60 seconds (incremental fetch).

**Data source:** `oee_snapshots` (08-PROD §9.9) for trend data; `oee_shift_metrics` for shift summary; `downtime_events` (08-PROD §9.6) for downtime cause list; `changeover_events` (08-PROD §9.7) for changeover duration.

**API endpoint:** `GET /api/oee/line/[line_id]/trend?window=24h&shift_filter=all`

**Layout description:**

```
+------------------------------------------------------------------+
| Breadcrumb: OEE / Line Trend / LINE-01                          |
| [Line: LINE-01 ▼]  [Window: 24h ▼]  [Shift: All ▼]  [Refresh] |
| Last aggregation: 14:32:05  [Auto-refresh 60s ●]               |
+------------------------------------------------------------------+
| [GAUGE A]  [GAUGE P]  [GAUGE Q]  [GAUGE OEE]  | [Shift Summary] |
|  87.5%       90.0%      95.0%      74.8%      | AM: 81.2%       |
|  Avail.      Perf.      Qual.      OEE         | PM: 74.8%       |
|  ▲ +2.1pp    ▼ −1.0pp   ▲ +0.5pp  ▼ −3.2pp   | Night: 78.5%    |
+------------------------------------------------------------------+
| CHART: 4-line D3.js trend (A blue / P green / Q amber / OEE blk)|
| x-axis: time  y-axis: 0–100%  target dashed at 85%             |
| [1h] [6h] [24h]  controls top-right of chart card              |
+------------------------------------------------------------------+
| Top 3 Downtime Causes (last N hours)  | Changeover Summary       |
| 1. Machine Fault — 24 min (2 events)  | Last C/O: 14:10 — 35 min|
| 2. Material Wait — 12 min (1 event)   | Target: 30 min           |
| 3. Operator Break — 6 min (1 event)   | Allergen delta: Medium   |
+------------------------------------------------------------------+
| [Export CSV]  [Export PDF]  [View in 08-PRODUCTION →]          |
+------------------------------------------------------------------+
```

**Zone 1 — Page header and filters:**

Breadcrumb: "OEE / Line Trend / [Line Name]" at 12px `--muted`. Below it, a filter bar (`.card` style, 8px padding) containing:

- **Line selector:** Dropdown listing all lines the user has permission to view. Default: the line from the URL param `[line_id]`. Changing line navigates to `/oee/line/[new_line_id]`.
- **Window toggle:** Segmented control `[1h] [6h] [24h]`. Default 24h. Updates the chart and downtime list without page reload.
- **Shift filter:** Dropdown `All Shifts / AM (00:00–08:00) / PM (08:00–16:00) / Night (16:00–00:00)`. Default: All. When a specific shift is selected, the chart and gauges scope to that shift's data only.
- **Refresh button:** Manual refresh icon (secondary). Triggers incremental fetch.
- **Freshness indicator:** "Last aggregation: HH:MM:SS" per §1.6. Stale warning if >120s.

**Zone 2 — Four linked gauges:**

Rendered in a `.grid-4` layout within a `.card`. Each gauge follows the D3.js arc spec in §1.4.

Left three-quarters of the row: four gauges side by side (A, P, Q, OEE). Right quarter (on screens ≥ 1280px): a compact Shift Summary sub-card showing OEE% per shift for today — three rows: AM / PM / Night with color-coded values (`.badge-green`, `.badge-amber`, `.badge-red`) and a small sparkline (Recharts, 60×20px) showing that shift's OEE over its duration.

Below each gauge: the component value in 26px bold, a delta line (`↑ +2.1pp vs prev hour` or `↓ −1.0pp`) in 11px `--muted`. The OEE gauge also shows `.badge-red "Action required"` or `.badge-green "On target"` pill beneath the delta.

**Zone 3 — OEE trend chart:**

A `.card` with `.card-title` "OEE Trend — LINE-01". D3.js multi-line chart:

- **X-axis:** Time. Ticks: every 15 min for 1h window; every 1h for 6h; every 2h for 24h. Format: `HH:MM`.
- **Y-axis:** 0–100%. Grid lines every 20%. Reference line at target OEE (default 85%, dashed `--info` blue).
- **Four lines:**
  - Availability: `#3b82f6` (blue-500), 1.5px stroke.
  - Performance: `#22c55e` (green-500), 1.5px stroke.
  - Quality: `#f59e0b` (amber-500), 1.5px stroke.
  - OEE combined: `#000000` (black), 2.5px stroke bold.
- **Hover tooltip:** Vertical crosshair line. Tooltip card (white, shadow, 6px radius) shows: time, A%, P%, Q%, OEE%, active WO code (if `active_wo_id` is not null in the snapshot).
- **Downtime segments:** Where `downtime_min_delta > 0`, overlay a translucent red band on the chart background (`rgba(239,68,68,0.1)`) to visually indicate downtime periods.
- **Changeover markers:** Where a changeover event overlaps the window, a vertical dashed amber line with a tooltip "Changeover — 35 min · Medium allergen risk".
- **Chart controls (top-right of card):** Three-segment `[1h] [6h] [24h]` buttons matching Zone 1 window toggle (synchronized). Adjacent: a small legend (colored line + label for A / P / Q / OEE).
- **Chart footer stat row:** "Avg: 74.8% · Best: 88.5% · Worst: 52.1% · vs Target: −10.2pp" in 11px `--muted`.

**Zone 4 — Bottom two-column row (`.grid-2`):**

**Left card — Top 3 Downtime Causes:**

`.card` title "Top Downtime Causes — Last [N]h". Ordered list (1–3) of downtime causes sourced from `downtime_events` aggregated by category. Each item:
- Category label (from `downtime_categories` admin taxonomy).
- Total duration: `24 min (2 events)`.
- Category classification badge: `.badge-blue` "People" / `.badge-amber` "Process" / `.badge-red` "Plant".
- A mini horizontal bar (proportional to total downtime).
- [View in Downtime →] link: navigates to `/production/downtime?line=LINE-01&date_from=X`.

If no downtime events in window: ".alert-green" "No downtime recorded in this window — line running to plan."

**Right card — Changeover Summary:**

`.card` title "Changeover Summary". Shows the most recent changeover event (from `changeover_events`):
- Last changeover: timestamp `DD/MM/YYYY HH:MM`.
- Actual duration: `35 min`. Target duration: `30 min`. Variance: `+5 min` in `.badge-amber`.
- Allergen delta badge: `.badge-amber "Medium risk"` or `.badge-red "High risk"` or `.badge-green "Low risk"`.
- [View full changeover record →] navigates to `/production/changeover/:event_id` (08-PRODUCTION module).

If no changeover in current window: muted text "No changeover in this period."

**Zone 5 — Action bar:**

Horizontal row of secondary actions:
- `[Export CSV]` — triggers export via `/api/reporting/export` (reuses 12-REPORTING engine) with payload `{dashboard: 'oee_line_trend', line_id, window, shift_filter}`.
- `[Export PDF]` — same engine, PDF format.
- `[View in 08-PRODUCTION →]` — link to `/production/lines/[line_id]` for live WO execution context.

**Interactions:**

- **Window toggle:** Updates chart, gauges, downtime list, and changeover summary simultaneously. URL param `?window=6h` persists selection.
- **Shift filter:** Narrows all data to selected shift. Gauge values re-compute. Breadcrumb sub-label updates to "AM Shift".
- **Line selector change:** Full navigation to new line URL. Preserves current `?window` param.
- **Chart hover:** Crosshair + tooltip (see above). Hover over downtime band shows category name.
- **Gauge hover:** All four gauges highlight simultaneously (shared JS state). Tooltip shows full formula breakdown for that component.
- **[View in Downtime →]:** Cross-module navigation to 08-PRODUCTION downtime screen pre-filtered.
- **Auto-refresh:** Every 60s, `GET /api/oee/line/[id]/trend?since=last_fetched_ts` appends new snapshots to chart without re-rendering full DOM. Progress bar slides along top.

**State variants:**

*Loading:* Four gauge placeholders (gray circles, animated shimmer). Chart area: gray rectangle 280px tall with centered spinner. Bottom cards: two skeleton rows each.

*Empty (no snapshots in window):* Gauges show `—`. Chart shows empty axes with message "No OEE data for this window. The aggregation job runs every 60 seconds." + [Check System Status] link. Downtime card: muted "No events."

*Stale data (>120s since last snapshot):* `.alert-amber` banner below filter bar: "OEE data stale — last aggregation [N]s ago. The aggregation job may have paused." + [Retry] button. Gauges remain visible but border changes to amber to indicate stale state.

*Aggregation error (job failed):* `.alert-red` banner: "OEE aggregation job error detected. Contact system administrator. Last successful snapshot: HH:MM:SS." Gauges show last known values with a `.badge-amber "Stale"` overlay.

*No production scheduled (OEE correctly 0):* Gauges show `0%`. `.alert-blue` info notice: "No active work order on this line for the selected period. OEE = 0% is expected."

*Permission denied (operator viewing another line):* Full-page permission-denied state per §2.3.

**Edge cases and validation:**

- `oee_pct = 100%`: Display `.badge-purple "Data error — investigate"` per §1.3 color table.
- Missing `downtime_categories` taxonomy: Category displays as `Uncategorized` with a `.badge-gray` and a note "Category pending — click to add in 08-PRODUCTION Downtime."
- Incomplete shift (aggregation mid-shift): Gauge shows current-period values. Chart X-axis extends to `now()` with dotted extension line (future portion grayed).
- `shift_id` mismatch in `oee_snapshots` vs `shift_configs`: Show `.alert-amber` "Shift configuration mismatch detected. Contact 02-SETTINGS administrator." (validation V-OEE-DATA-3).

**Accessibility notes:**

- Each gauge has `role="img"` with `aria-label` including component name, value, and target comparison.
- Chart lines have distinct widths (not just color): A=1.5px, P=1.5px, Q=1.5px, OEE=2.5px bold. Shape differentiators can be added (dashed/dotted for P and Q in colorblind mode, future enhancement — open question §12.OQ-OEE-08).
- All interactive controls (window toggle, line selector) are keyboard-navigable.
- Export buttons are labeled with accessible text ("Export OEE trend as CSV for LINE-01, last 24 hours").

---

### SCREEN OEE-002 — Per-shift Heatmap Dashboard

**Screen ID:** OEE-002
**Route:** `/oee/heatmap`
**Purpose:** Matrix view of OEE across all production lines (rows) × shifts × days (columns). Enables Shift Supervisors and Production Managers to quickly identify which line/shift combinations underperform. Click any cell drills down to OEE-001 (per-line trend) filtered to that specific shift/day.

**Data source:** `oee_shift_metrics` MV (refreshed post-shift-end by `shift_aggregator_v1`).

**API endpoint:** `GET /api/oee/heatmap?week=2026-W16&site_id=[current_site]`

**Layout description:**

```
+------------------------------------------------------------------+
| Breadcrumb: OEE / Shift Heatmap                                 |
| [Week: W/E 19/04/2026 ◀ ▶]  [Line: All ▼]  [Export ▼]        |
| Last aggregation: 14:32:05  [Auto-refresh 60s ●]               |
+------------------------------------------------------------------+
| KPI row: [Factory OEE Avg] [Best Line] [Worst Line] [Best Shift]|
+------------------------------------------------------------------+
| HEATMAP GRID (D3.js)                                            |
|         Mon 14  Mon 14  Mon 14  Tue 15  ...  Sun 20             |
|         AM      PM      Night   AM      ...  Night              |
| LINE-01 [88.2%] [74.1%] [81.5%] [85.3%] ... [79.0%]           |
| LINE-02 [62.1%] [91.0%] [77.8%] [88.4%] ... [55.2%]           |
| LINE-03 [85.5%] [85.0%] [84.1%] [89.2%] ... [82.0%]           |
| LINE-04 [—]     [71.2%] [—]     [90.0%] ... [68.9%]           |
| LINE-05 [79.4%] [83.3%] [81.0%] [77.6%] ... [84.1%]           |
|                                                                  |
| Color: RED <65% / AMBER 65–85% / GREEN ≥85%                    |
+------------------------------------------------------------------+
| [Selected cell detail: LINE-02 / Night / Sat 19 / OEE: 55.2%] |
| A: 62.1%  P: 91.0%  Q: 98.0%  |  Top cause: Machine Fault 48m |
+------------------------------------------------------------------+
```

**Zone 1 — Header and filters:**

Breadcrumb: "OEE / Shift Heatmap". Filter bar:
- **Week selector:** Dropdown `W/E DD/MM/YYYY` format, defaulting to current week. Left/right arrow buttons for previous/next week. URL param `?week=2026-W16`.
- **Line filter:** Dropdown `All Lines / LINE-01 / LINE-02 / ...`. Filtering to a single line narrows the heatmap to one row and expands the cell detail below.
- **Export dropdown:** PDF / CSV. Exports the full matrix for the selected week.
- **Freshness indicator:** Per §1.6.

**Zone 2 — KPI summary row:**

Four `.kpi` cards in `.grid-4`:

1. **Factory OEE (week avg):** Weighted average across all lines × shifts in the week. Border color per §1.3 OEE threshold. Sub-label: "N line-shifts · N days".
2. **Best Line:** Line name + its week-average OEE in `.badge-green`. Sub-label: "Best shift: AM · 91.2%".
3. **Worst Line:** Line name + its week-average OEE in `.badge-red`. Sub-label: "Worst shift: Night · 55.2%".
4. **Best Shift (factory-wide):** Shift label (AM/PM/Night) + its factory-average OEE. Sub-label: "Across all lines".

**Zone 3 — Heatmap grid (D3.js):**

The heatmap is a `.card` with `.card-title` "Shift OEE Heatmap — W/E [date]".

Grid dimensions:
- Rows: production lines (up to 10). Row header: line code (monospace) + line name.
- Columns: 7 days × 3 shifts = 21 columns. Column group headers: day abbreviation (Mon / Tue / ... / Sun) spanning 3 sub-columns. Sub-column headers: `AM` / `PM` / `Night`.

Each cell contains:
- **OEE% value** — large, centered, 13px bold.
- **Micro-bar:** Three stacked segments within the cell bottom (3px height each): A (blue), P (green), Q (amber) proportional to their pct. This gives a visual A/P/Q ratio at a glance.
- **Cell background color:** Continuous color scale from red (`#ef4444`) through amber (`#f59e0b`) to green (`#22c55e`) mapped to 0–100%. Cells with no data (`oee_shift_metrics` row absent) render as `--border` gray with `—` centered.

Cell color scale breakpoints (P1 — fixed industry thresholds per OQ-OEE-07 decision 2026-04-21):
- 0–64.9%: red spectrum (interpolated between `#ef4444` and `#f59e0b`).
- 65–84.9%: amber spectrum (interpolated).
- 85–100%: green spectrum (interpolated between `#f59e0b` and `#22c55e`).

Note: P1 uses fixed 65/85 industry thresholds for the heatmap color scale (not driven by `oee_alert_thresholds`). P2 will switch to tenant-configurable thresholds via `oee_alert_thresholds.oee_target_pct`, replacing the fixed breakpoints.

**Hover tooltip:** On cell hover, a floating tooltip card (white, shadow) shows:
- Line name, shift label, date (`DD/MM/YYYY`).
- OEE: `74.1%` (`.badge-amber`).
- A: `81.5%` · P: `90.0%` · Q: `99.9%`.
- Total output: `1,234 kg`. Total downtime: `87 min`.
- `snapshot_count` (number of per-minute snapshots in shift — indicates data completeness).
- "Click to drill down →" hint.

**Click behavior:** Clicking a cell navigates to `/oee/line/[line_id]?window=8h&shift=AM&date=2026-04-14`, opening OEE-001 filtered to exactly that line/shift/day combination.

**Zone 4 — Selected cell detail panel:**

Below the heatmap grid, a detail panel (`.card`) appears when a cell is clicked (without leaving the page). Shows:
- Line name / shift / date in the card title.
- Four inline gauges (mini version, 80px each, same D3.js arc style as §1.4 but smaller).
- Top downtime cause: category + duration.
- Comparison: delta vs line's 7-day average for that shift.
- Two action buttons: `[Drill to Line Trend →]` (navigates OEE-001) and `[View Downtime Events →]` (navigates 08-PROD downtime filtered).

Default state (no cell clicked): The panel shows muted text "Click any cell to see shift details."

**Interactions:**

- **Week navigation:** Arrow buttons update the week param and re-fetch the matrix. No full-page reload (AJAX update).
- **Line filter:** Collapses the heatmap to one row; expands the cell detail panel to show shift-by-shift comparison for that line.
- **Column sort:** Clicking a shift sub-column header sorts lines by that shift's OEE (descending). An arrow indicator shows sort direction.
- **Color scale toggle (P2 consideration):** An open question (§12.OQ) whether to allow toggling the color axis. P1: fixed green/amber/red.
- **Export:** CSV exports a flat table: `line_id, shift_date, shift_id, oee_pct, availability_pct, performance_pct, quality_pct, total_output_qty, total_downtime_min`. PDF exports a screenshot-quality render of the heatmap grid plus the KPI row.

**State variants:**

*Loading:* Heatmap cells render as animated shimmer rectangles (same grid layout). KPI cards show shimmer skeletons.

*Empty (no shift data for week):* Heatmap renders all cells as `—` gray. `.alert-blue` below grid: "No shift data available for this week. Shift metrics are computed after each shift ends. If this week has not yet ended, data will populate progressively." `[Go to current week]` button.

*Partial data (mid-week):* Cells for future shifts render as `—` gray. Current/past shifts show normally. A dotted vertical separator line divides past data from future empty cells.

*Single shift missing (aggregation failure):* Individual cell renders `!` icon with `.badge-amber`. Tooltip: "Shift aggregation may have failed. Check system status."

*Error (API failure):* `.alert-red` card replacing the heatmap: "Could not load shift heatmap. The aggregation service may be unavailable." + [Retry] button.

*Permission denied (operator):* Heatmap shows only the operator's assigned line row. All other rows are hidden. A notice reads "Showing your assigned line only."

**Edge cases and validation:**

- `oee_shift_metrics.snapshot_count = 0` for a shift: Cell renders as `—` gray (not 0%). Tooltip explains "No snapshots recorded for this shift."
- Line newly added (no historical data): Row shows all `—` cells with a `.badge-blue` "New line — data accumulating" label in the row header.
- Shift boundary mismatch (V-OEE-SHIFT-1): `.alert-amber` above grid: "Shift configuration may have changed during the selected week. Some cells may reflect mixed shift boundaries. Review 02-SETTINGS shift configuration."
- >10 lines: Heatmap scrolls vertically. Row headers remain sticky. Performance note: max 10 lines × 21 cells = 210 cells renders within P95 < 2s (specified in PRD §2).

**Accessibility notes:**

- Each cell has `aria-label="LINE-01, Monday 14 April, AM shift: OEE 88.2%, Availability 91%, Performance 90%, Quality 98%"`.
- Color is not the sole indicator — OEE value is always shown as text in the cell.
- Heatmap grid uses `role="grid"`, row headers use `role="rowheader"`, cells use `role="gridcell"`.

---

### SCREEN OEE-003 — Per-day OEE Summary Dashboard

**Screen ID:** OEE-003
**Route:** `/oee/summary`
**Purpose:** Daily rollup of OEE across all production lines. Primary screen for Production Managers and Continuous Improvement Engineers. Shows a summary table with 7-day sparklines, factory-level summary KPI cards, a Six Big Losses breakdown tab, and a basic changeover analysis tab. Data from `oee_daily_summary` MV (refreshed every 15 minutes).

**Data source:** `oee_daily_summary` MV for table and KPI cards; `downtime_events` JOIN `downtime_categories` for Six Big Losses tab; `changeover_events` for Changeover tab.

**API endpoint:** `GET /api/oee/daily?date=2026-04-20` (also `GET /api/oee/daily/summary?date_from=X&date_to=Y` for 7-day sparklines).

**Layout description:**

```
+------------------------------------------------------------------+
| Breadcrumb: OEE / Daily Summary                                 |
| [Date: 20/04/2026 ◀ ▶] [Line: All ▼] [Export ▼]              |
| Last aggregation: 14:32:05  [Auto-refresh 60s ●]               |
+------------------------------------------------------------------+
| KPI row: [Factory OEE] [Best Line] [Worst Line] [Total Output] [Total Downtime] |
+------------------------------------------------------------------+
| TABS: [OEE Summary] [Six Big Losses] [Changeover Analysis]      |
+------------------------------------------------------------------+
| TAB: OEE SUMMARY                                                |
| Table: Line | OEE% | A% | P% | Q% | Best Shift | Worst Shift   |
|             | Top Downtime Reason | Output (kg) | 7-day Sparkline|
| LINE-01  88.2% 91.5% 94.0% 99.5%  AM(91.2%)  Night(81.5%)     |
|          Machine Fault  1,234 kg   [sparkline]                  |
| LINE-02  62.1% 68.0% 91.0% 98.0%  PM(91.0%)  Night(55.2%)     |
|          Bearing Fail   987 kg     [sparkline]                  |
| Factory  78.5% 83.2% 92.0% 98.8%  —          —                 |
+------------------------------------------------------------------+
| TAB: SIX BIG LOSSES (hidden, switched by tab)                   |
| TAB: CHANGEOVER ANALYSIS (hidden, switched by tab)              |
+------------------------------------------------------------------+
| [Export CSV]  [Export PDF]  [Copy to Clipboard]                 |
+------------------------------------------------------------------+
```

**Zone 1 — Header and filters:**

Breadcrumb: "OEE / Daily Summary". Filter bar:
- **Date picker:** Single date selector, default **yesterday** (`DD/MM/YYYY`) — morning review persona default (per OQ-OEE-10 decision 2026-04-21). Left/right arrow for previous/next day. URL param `?date=2026-04-20`. Selecting a date > today shows `.alert-amber` "Future date selected — no data available." Quick-switch buttons `[Today]` and `[Yesterday]` appear in the filter bar beside the date picker. Last selected date is persisted per user in `localStorage` key `oee.summary.last_date` and restored on next visit (overrides the yesterday default after first interaction).
- **Line filter:** Dropdown `All Lines / LINE-01 / ...`. When a specific line is selected, the summary table collapses to one row and the KPI cards scope to that line.
- **Export dropdown:** PDF / CSV / Copy to Clipboard.
- **Freshness indicator:** Per §1.6. Note: `oee_daily_summary` refreshes every 15 min; if `now() − max_refresh > 20 min`, show `.badge-amber "Data stale"`.

**Zone 2 — KPI summary row:**

Five `.kpi` cards in `.grid-4` (or `.grid-5` if viewport allows):

1. **Factory OEE (today):** Weighted average across all lines for the selected date. Border color per §1.3. Sub-label: "N lines · N shifts completed". Click scrolls to summary table.
2. **Best Line:** Line name + OEE in `.badge-green`. Sub-label: "Best shift: AM · 91.2%".
3. **Worst Line:** Line name + OEE in `.badge-red`. Sub-label: "Worst shift: Night · 55.2%".
4. **Total Output (kg):** Sum of `oee_daily_summary.total_output` across all lines. Border blue (neutral). Sub-label: "All lines combined".
5. **Total Downtime (min):** Sum of `oee_daily_summary.total_downtime_min`. Border amber if >60 min collective; red if >240 min. Sub-label: "Across all lines · click to view causes". Click navigates to `/production/downtime?date=2026-04-20`.

**Zone 3 — Tabbed content:**

Horizontal tab bar (`.tabs`) with three tabs: `OEE Summary` (active default), `Six Big Losses`, `Changeover Analysis`.

---

**Tab 1 — OEE Summary:**

A `.card` containing a sortable table with columns (sticky header row):

| Column | Type | Notes |
|---|---|---|
| Line | Text | Line code + name. Sticky left column. Click navigates to OEE-001 for that line. |
| OEE % | Numeric, 1dp | Color-coded cell background (green/amber/red per §1.3). |
| A % | Numeric, 1dp | `.badge-green` ≥85%, `.badge-amber` 70–84.9%, `.badge-red` <70% |
| P % | Numeric, 1dp | `.badge-green` ≥80%, `.badge-amber` 65–79.9%, `.badge-red` <65% |
| Q % | Numeric, 1dp | `.badge-green` ≥95%, `.badge-amber` 90–94.9%, `.badge-red` <90% |
| Best Shift | Text | Shift label + OEE in parentheses. Source: `oee_daily_summary.best_shift_id`. |
| Worst Shift | Text | Shift label + OEE in parentheses. Source: `oee_daily_summary.worst_shift_id`. |
| Top Downtime | Text | Most frequent downtime category for this line/date. "—" if no downtime. |
| Output (kg) | Numeric | `total_output` from MV. Thousands separator. |
| 7-day Sparkline | Chart | Recharts inline sparkline (80×30px). OEE% for last 7 days (from `oee_daily_summary` ORDER BY date DESC LIMIT 7). Color: last point's color (green/amber/red). |
| Actions | Buttons | `[→]` icon button navigates to `/oee/line/[line_id]?date=[date]`. |

**Footer row:** "Factory Average" spanning Line column. Weighted averages for all numeric columns. Bold weight 600. Top border 2px `--border`.

All numeric columns are sortable (click header, arrow indicator). Default sort: by OEE% descending.

Thresholds for A/P/Q column badge cutoffs source from `oee_alert_thresholds` per tenant (defaults: A ≥70%, P ≥80%, Q ≥95%). These are the per-component minimums, not the composite OEE target.

---

**Tab 2 — Six Big Losses:**

A `.card` with `.card-title` "Six Big Losses Analysis — [selected date]".

The Six Big Losses (lean manufacturing framework) are mapped to the `downtime_categories` taxonomy per §1.3:

| Loss | Lean Class | Category mapping (from 08-PROD D6 taxonomy) |
|---|---|---|
| Equipment Failure | Plant | Machine fault, bearing failure, motor fault, PLC error |
| Setup & Adjustment | Plant | Changeover, cleaning, line setup |
| Idling & Minor Stops | Process | Material wait, upstream block, downstream block |
| Reduced Speed | Process | Speed restriction, product jam, belt slip |
| Process Defects (in-process waste) | Process | Quality hold (in-process rejects) |
| Startup Rejects | People | First-off reject, line warm-up |

Note: The mapping from raw `downtime_categories` to Six Big Losses classifications is performed at the display layer using the `parent_category_id` chain from `downtime_categories` (02-SETTINGS §8.1). If a category cannot be mapped, it renders under "Other — Uncategorized" and a `.badge-amber` "Review taxonomy" notice appears.

**Layout of Six Big Losses tab:**

Left side (`.grid-2` left column): D3.js stacked horizontal bar chart. X-axis: total downtime minutes. Y-axis: Six Big Losses categories. Bars use the People/Process/Plant color coding (blue/amber/red). Each bar shows the total minutes and % of total downtime.

Right side (`.grid-2` right column): Summary table:

| Loss | Category | Minutes | % of Total | Events | Lean Classification |
|---|---|---|---|---|---|
| Equipment Failure | Machine fault | 48 | 34.3% | 2 | Plant `.badge-red` |
| ... | ... | ... | ... | ... | ... |

Below the chart and table: a calculation note card:

```
OEE impact decomposition:
  Availability loss (A): 12.5pp  ← Equipment Failure + Setup
  Performance loss (P):  10.0pp  ← Idling + Reduced Speed
  Quality loss (Q):       5.0pp  ← Defects + Startup Rejects
  Total OEE loss:        27.5pp  (OEE = 72.5%, target 85%)
```

Rendered as a `.card` with monospace font for the calculation block.

**Annotation action (oee_operator+ role):** A downtime event in this view can be annotated if `reason_notes` is empty. An `[Add note]` inline link opens a small modal:

- **Fields:** `reason_notes` (textarea, 500 chars max), `category_id` (dropdown, optional — `oee_supervisor+` only to change category).
- **Submit:** PATCH `/api/production/downtime-events/:id` (08-PRODUCTION endpoint). 15-OEE does not write to `downtime_events` directly — routes through 08-PROD API. On success, refreshes the downtime section.
- **Audit trail:** Category override by `oee_supervisor` creates an audit log entry with old/new category values and user ID.

---

**Tab 3 — Changeover Analysis:**

A `.card` with `.card-title` "Changeover Analysis — [selected date]". Consumes `changeover_events` table from 08-PRODUCTION (§9.7).

**Summary KPI row (2 cards):**

- **Total Changeover Time:** Sum of changeover duration minutes for selected date + line. `.badge-amber` if > configured threshold sourced from 02-SETTINGS `changeover_target_duration_min` (per line; optional per-FA override). If no target is configured, threshold badge is suppressed and "—" is shown.
- **Avg Changeover Duration:** Average duration in minutes. Delta vs 7-day avg.

**Changeover events table:**

Columns: Line | WO From | WO To | Start Time | Duration (min) | Target (min) | Variance | Allergen Risk | Status.

- **Target (min):** Sourced from 02-SETTINGS `changeover_target_duration_min` per line (with optional per-FA override). If no target is configured for a line, the Target column displays "—" and no breach detection is applied (per OQ-OEE-05 decision 2026-04-21).
- Duration variance: `+5 min` in `.badge-amber` if over target; `−2 min` in `.badge-green` if under. Hidden if no target configured.
- Allergen Risk badge: `.badge-green "Low"` / `.badge-amber "Medium"` / `.badge-red "High"` / `.badge-red "Segregated"`.
- Status badge: `.badge-green "Completed"` / `.badge-amber "In progress"` / `.badge-red "Overrun"`.

Actions: `[View record →]` navigates to `/production/changeover/:event_id` in 08-PRODUCTION module.

**Allergen risk summary note:** Below table, an `.alert-blue` info card: "Changeover target durations are configured in 02-SETTINGS (`changeover_target_duration_min` per line). Allergen risk levels are defined in the 02-SETTINGS allergen matrix and 13-MAINTENANCE cleaning procedures."

If no changeovers on selected date: Muted text "No changeover events on this date."

**Zone 4 — Action bar (all tabs):**

Fixed at bottom of the content area: `[Export CSV]` / `[Export PDF]` / `[Copy to Clipboard]`. Exports include the currently active tab's data. Export file name format: `oee-summary-YYYY-MM-DD.csv`.

**State variants:**

*Loading:* KPI cards show shimmer skeletons. Table body shows 5 skeleton rows (shimmer). Tab bar renders normally (not skeleton — improves perceived performance).

*Empty (no data for selected date):* Table shows single-row empty state: centered illustration + "No OEE data for [date]. Work orders may not have been active, or the daily summary may not have been refreshed yet." Note: `oee_daily_summary` refreshes every 15 min — if today and <15 min since last refresh, show "Data populating — refresh in [X] min."

*Weekend / no production days:* If `shift_configs.active_days` does not include the selected weekday, show `.alert-blue` "No production scheduled on this day per shift configuration."

*Error:* `.alert-red` banner inside the KPI area: "Could not load daily OEE summary. Please wait — the materialized view refreshes every 15 minutes." + [Retry] button.

*Stale data:* Per §1.6. If >20 min since last MV refresh, all KPI values show with `.badge-amber "Stale"` and a notice: "Daily summary last refreshed [N] min ago. Refresh is scheduled every 15 min."

*Single line selected:* KPI cards scope to that line. Summary table shows one data row + factory average for comparison. Six Big Losses and Changeover tabs filter to that line's events.

**Edge cases and validation:**

- `best_shift_id = worst_shift_id` (single shift run): Both cells show same value. No error — expected for a 1-shift day.
- `quality_pct > 100%` in MV (data anomaly): Cell shows `!` icon + `.badge-red "Data error"`. Tooltip: "Quality > 100% — investigate source data in 08-PRODUCTION."
- Missing `downtime_categories` link for a `downtime_events` row: Six Big Losses tab shows that event under "Other — Uncategorized" + tooltip "Category not mapped to lean taxonomy. Edit in 02-SETTINGS."
- No `target_kpis.oee_target_pct` configured for a line: Thresholds fall back to tenant default from `oee_alert_thresholds` (default 85%). A tooltip note: "Using tenant default target. Configure per-line target in OEE Settings."

**Accessibility notes:**

- Table column headers have `scope="col"` and are keyboard-sortable (Enter/Space activates sort).
- Sparkline charts include `aria-label="7-day OEE trend for LINE-01: Mon 82%, Tue 77%, ..."` (last 7 values).
- Color-coded cells also include a text indicator (`▲` green / `▼` red arrow) so color is not the sole differentiator.

---

### SCREEN OEE-ADM-001 — OEE Alert Thresholds Settings

**Screen ID:** OEE-ADM-001
**Route:** `/oee/settings`
**Purpose:** Admin-only. Configure per-line (or tenant-default) OEE target percentage and A/P/Q component minimum thresholds. Also configure anomaly detection parameters (P2 fields shown as disabled stubs). Data stored in `oee_alert_thresholds` (02-SETTINGS §8.1). Access: `oee_admin` role only.

**Access control:** Non-admin users attempting this route see the full-page permission-denied state.

**Layout description:**

Breadcrumb: "OEE / Settings". Page title: "OEE Alert Thresholds". `.badge-blue` "Admin Only" pill next to title.

**Dependency notice strip:** `.alert-blue` banner: "These thresholds control the green/amber/red color coding across all OEE dashboards. Changes take effect immediately on the next dashboard refresh. Shift boundaries are configured in 02-SETTINGS → Reference Tables → shift_configs." Right side: "Edit Shift Configs →" link navigating to `/oee/shift-configs`.

**Tenant-default card:**

`.card` with `.card-title` "Tenant Default Thresholds". A form (read mode by default, [Edit] button top-right):

| Field | Label | Type | Apex Default | Notes |
|---|---|---|---|---|
| `oee_target_pct` | OEE Target % | Number, 1dp | `70.0` | P1 Apex ramp-up baseline (OQ-OEE-02 decision 2026-04-21). Range 0–100. Note: in P1 this value controls the target reference line on charts; it does NOT shift the heatmap color scale (fixed 65/85 per OQ-OEE-07). In P2 this value will also control the color scale thresholds. |
| `availability_min_pct` | Availability Minimum % | Number, 1dp | `70.0` | Below = red. |
| `performance_min_pct` | Performance Minimum % | Number, 1dp | `80.0` | Below = red. |
| `quality_min_pct` | Quality Minimum % | Number, 1dp | `95.0` | Below = red. |
| `anomaly_alpha` | Anomaly EWMA Alpha (P2) | Number, 2dp | `0.30` | Disabled stub in P1. |
| `anomaly_sigma_threshold` | Anomaly Sigma Threshold (P2) | Number, 1dp | `2.0` | Disabled stub in P1. |
| `maintenance_trigger_threshold_pct` | Maintenance Trigger Availability % (P2) | Number, 1dp | `70.0` | Disabled stub in P1. |
| `maintenance_trigger_consecutive_days` | Consecutive Days (P2) | Integer | `3` | Disabled stub in P1. |

P2 fields render with opacity 0.5, `cursor: not-allowed`, and a `.badge-gray "P2"` badge. Tooltip: "This setting controls Phase 2 anomaly detection. Enable in 02-SETTINGS feature flags when P2 is deployed."

When [Edit] is clicked, the form switches to edit mode. [Save] / [Cancel] buttons appear. Save calls `PATCH /api/settings/oee-thresholds` (upserts tenant default row with `line_id = NULL`). On success: `.alert-green` "Thresholds updated. All dashboards will reflect new colors on next refresh."

**Per-line overrides table:**

Below the tenant-default card, a `.card` with `.card-title` "Per-Line Overrides". A table listing all lines with configured overrides:

Columns: Line | OEE Target % | A Min % | P Min % | Q Min % | Actions.

Actions: [Edit] opens an inline edit row, [Delete] removes the override (line reverts to tenant default).

Below the table: `[+ Add Line Override]` button. Clicking appends a new empty row in the table with all fields editable (line selector dropdown + four number inputs). [Save Row] / [Discard Row].

**Six Big Losses Mapping Editor (per OQ-OEE-06 decision 2026-04-21):**

Below the per-line overrides card, a `.card` with `.card-title` "Six Big Losses Category Mapping". This mapping is admin-configurable per tenant. The table maps `downtime_reason_code` (from `downtime_categories` 02-SETTINGS §8.1) to one of the Six Big Loss categories.

`.alert-blue` banner: "This mapping controls how raw downtime reasons are classified into Six Big Losses on the OEE-003 Six Big Losses tab. Changes apply immediately to new dashboard views. Historical data is re-classified dynamically."

**Mapping table:**

Columns: Downtime Reason Code | Downtime Reason Label | Big Loss Category | Actions.

Big Loss Category dropdown values (fixed enum, not tenant-configurable):
- `Equipment Failure`
- `Setup/Adjustments`
- `Idling/Minor Stops`
- `Reduced Speed`
- `Defects/Rework`
- `Startup/Yield Losses`

**Default mapping seeded from industry standard (Nakajima TPM):**

| Downtime Reason | Default Big Loss Category |
|---|---|
| Machine fault, bearing failure, motor fault, PLC error | Equipment Failure |
| Changeover, cleaning, line setup | Setup/Adjustments |
| Material wait, upstream block, downstream block | Idling/Minor Stops |
| Speed restriction, product jam, belt slip | Reduced Speed |
| Quality hold (in-process rejects) | Defects/Rework |
| First-off reject, line warm-up | Startup/Yield Losses |

Admin can edit any row inline and click `[Save Row]`. A `[Reset to Defaults]` button resets all rows to the industry-standard mapping (with confirmation prompt). A `[Publish]` button applies changes tenant-wide. Unpublished changes show a `.badge-amber "Unpublished changes"` indicator.

Unmapped reason codes (no mapping assigned) render under "Other — Uncategorized" in OEE-003 Six Big Losses tab with a `.badge-amber "Review taxonomy"` notice (prompts admin to assign a category here).

**API:** `GET /api/settings/oee/big-loss-mapping` and `PUT /api/settings/oee/big-loss-mapping` (admin only).

**State variants:**

*Loading:* Skeleton form fields.
*Error (save failed):* `.alert-red` below the save button: "Save failed — [error message from API]." Form remains in edit mode.
*Permission denied:* Full-page permission-denied state.

---

### SCREEN OEE-ADM-002 — Shift Config Viewer

**Screen ID:** OEE-ADM-002
**Route:** `/oee/shift-configs`
**Purpose:** Admin read-only view of `shift_configs` reference table. 15-OEE shows this as a convenience cross-link from the Settings sidebar item. Editing shift configs is performed in 02-SETTINGS (`/settings/reference-tables/shift-configs`). Access: `oee_admin` role.

**Layout description:**

Breadcrumb: "OEE / Shift Configs". Page title: "Shift Configuration". `.badge-blue` "Admin Only".

`.alert-blue` banner: "Shift configurations are owned by 02-SETTINGS. This is a read-only view. To modify shift boundaries, go to 02-SETTINGS → Reference Tables → Shift Configs." Right side: `[Edit in 02-SETTINGS →]` button (`.btn-secondary`) navigating to `/settings/reference-tables/shift-configs`.

**Table (read-only):**

Columns: Shift ID | Label | Start Time (UTC) | End Time (UTC) | Timezone | Active Days | Sort Order | Active.

Current Apex baseline rows:
- `AM` — Morning Shift — 00:00 — 08:00 — UTC — Mon–Sun — 1 — `.badge-green "Active"`
- `PM` — Afternoon Shift — 08:00 — 16:00 — UTC — Mon–Sun — 2 — `.badge-green "Active"`
- `Night` — Night Shift — 16:00 — 00:00 — UTC — Mon–Sun — 3 — `.badge-green "Active"`

DSL rule notice: "Shift aggregation rule `shift_aggregator_v1` is registered as P1 Active in 02-SETTINGS §7.8. It fires 5 minutes after each shift end time. Status:" + `[Check Rule Status →]` link to 12-REPORTING Rules Usage dashboard.

**State variants:**

*Loading:* Skeleton table rows.
*Error:* `.alert-red` "Could not load shift configuration. Check 02-SETTINGS availability."
*Empty (no shift_configs rows):* `.alert-red` "No shift configurations found. The DSL rule `shift_aggregator_v1` will fail without at least one shift configuration. Add shifts in 02-SETTINGS immediately."

---

### MODAL OEE-M-001 — Downtime Note Annotation

**Modal ID:** OEE-M-001
**Trigger:** `[Add note]` link on a downtime event row in OEE-003 Six Big Losses tab (role `oee_operator+`).
**Purpose:** Allow operators and supervisors to add or update `reason_notes` on a downtime event without leaving the OEE dashboard. Category override available to `oee_supervisor+`.

**Layout description (`#modal-box`, 560px wide):**

```
+------------------------------------------------+
| [X]  Annotate Downtime Event                   |
+------------------------------------------------+
| Event:   Machine Fault — LINE-01               |
| Duration: 48 min  |  14/04/2026 09:12          |
| Current category: Plant > Machine Fault        |
| Reason notes: [empty]                          |
+------------------------------------------------+
| Reason Notes *                                 |
| [textarea, 500 chars, placeholder: "Describe   |
|  the root cause, corrective action taken..."]  |
+------------------------------------------------+
| Change Category (Supervisor+)                  |
| [Parent Category ▼] [Sub-Category ▼]          |
| Note: Category change creates an audit entry   |
+------------------------------------------------+
| [Cancel]                           [Save Note] |
+------------------------------------------------+
```

**Edit window (OQ-OEE-04 decision 2026-04-21):**

The annotation modal is editable for **1 hour post-event** (based on `downtime_events.ended_at`). After 1 hour, the annotation becomes **read-only** — the `[Save Note]` button is replaced by a `[Request Edit]` button that escalates to the supervisor. The modal shows a banner: `.alert-amber` "Edit window closed (1h post-event). This annotation is now read-only. Use [Request Edit] to request a supervisor override."

`[Request Edit]` creates an escalation request (audit log entry with `{user_id, event_id, requested_at, reason}`) and notifies the nearest `oee_supervisor` role user via in-app toast. The supervisor can then reopen the edit window for this specific event (via an admin action creating a 30-minute extension, logged in audit trail).

**Fields:**

- **Reason Notes** (required for `oee_operator`; optional for `oee_supervisor` who only changes category): `<textarea>` 500 chars max. `req` marker. Placeholder: "Describe the root cause and corrective action taken."
- **Change Category** (visible + enabled for `oee_supervisor+` only; grayed for `oee_operator`): Two cascading dropdowns — Parent Category (People / Process / Plant) and Sub-Category (populated from `downtime_categories` filtered by parent_id). Tooltip: "Changing category is logged for audit purposes."

**Submit:** `PATCH /api/production/downtime-events/:id` with `{reason_notes, category_id}`. On success: modal closes, `.alert-green` toast "Note saved successfully." Downtime table row updates inline.

**Validation:**
- `reason_notes` blank + no category change: Save button disabled. Error: "Please add a note or change the category."
- Category downgrade (from specific to parent-only): Show warning "You are setting a less specific category. This may affect Six Big Losses reporting accuracy."
- Edit window expired (>1h post-event, non-supervisor): `[Save Note]` hidden, `[Request Edit]` shown. `PATCH` API rejects with 403 if called directly after window expiry.

**Audit trail:** All saves logged to `downtime_events.updated_at` + a new row in `downtime_events_audit` (scoped to 08-PRODUCTION audit log pattern). Category changes include `{old_category_id, new_category_id, changed_by_user_id, changed_at}`. Edit-window escalations logged separately with `action='edit_escalation_requested'`.

---

### MODAL OEE-M-002 — Export Modal

**Modal ID:** OEE-M-002
**Trigger:** Any `[Export ▼]` or `[Export CSV]` / `[Export PDF]` button across OEE-001, OEE-002, OEE-003.
**Purpose:** Configure and initiate data export via the 12-REPORTING export engine (`POST /api/reporting/export`). Reuses the shared export modal pattern from 12-REPORTING.

**Layout description (`#modal-box`, 560px wide):**

```
+------------------------------------------------+
| [X]  Export OEE Data                           |
+------------------------------------------------+
| Dashboard: OEE Daily Summary                   |
| Date / Range: 20/04/2026                       |
| Line: All Lines                                |
+------------------------------------------------+
| Format *                                       |
| [o] CSV    [o] PDF    [ ] XLSX (P2)            |
+------------------------------------------------+
| Include sections (multi-select checkboxes):    |
| [x] OEE Summary table                         |
| [x] Six Big Losses breakdown                  |
| [x] Changeover Analysis                       |
| [ ] Raw snapshot data (large file warning)    |
+------------------------------------------------+
| File name preview:                             |
| oee-summary-2026-04-20-all-lines.csv          |
+------------------------------------------------+
| [Cancel]                         [Export Now] |
+------------------------------------------------+
```

**Fields:**
- **Format:** Radio buttons CSV (default) / PDF. XLSX shown but disabled with `.badge-gray "P2"` tooltip.
- **Include sections:** Checkboxes for which tabs/sections to include. "Raw snapshot data" warns: "Including raw per-minute snapshots may produce a large file (up to 5 MB for a 24h window)."
- **File name preview:** Auto-generated `oee-[screen]-[date]-[line].csv` in monospace text. Read-only.

**Submit:** `POST /api/reporting/export` with `{dashboard: 'oee_daily_summary', format: 'csv', filters: {...}, sections: [...]}`. On submit: modal closes, `.alert-blue` toast "Export started — you will receive a download link in a few seconds." File download triggers automatically when ready. Export record logged to `report_exports` (12-REPORTING engine).

---

## 4. P2 Dashboard Placeholders

The following P2 screens are reachable via the sidebar (with `.badge-gray "P2"` labels) and via feature-flag-gated routes. In P1, clicking any P2 sidebar item shows a placeholder page.

### SCREEN OEE-P2-A — Anomaly History (P2 placeholder)

**Route:** `/oee/anomalies`

**P1 placeholder layout:**

`.card` centered with icon. Title: "Anomaly Detection — Coming in Phase 2". Description: "15-OEE will detect OEE anomalies using an Exponentially Weighted Moving Average (EWMA) algorithm. When an anomaly is detected, it will appear here with acknowledgment workflow." Key details:

- Rule: `oee_anomaly_detector_v1` (registered as P2 stub in 02-SETTINGS §7.8).
- Algorithm: EWMA, α=0.3, 2σ threshold, rolling 30-min window.
- Alert latency target: <60 seconds from anomaly event.

Two buttons: `[View Rule Config →]` (12-REPORTING Rules Usage) and `[Check Feature Flag →]` (02-SETTINGS feature flags: `oee.anomaly_detection_enabled`).

**Data table (P1 stub):** Greyed table with columns: Line | Detected At | OEE Actual | OEE Expected | Deviation (σ) | Severity | Status | Acknowledged By. Tooltip on table: "Anomaly data will populate when Phase 2 is deployed."

### SCREEN OEE-P2-B — Equipment Health Dashboard (P2 placeholder)

**Route:** `/oee/equipment-health`

**P1 placeholder layout:** `.card` centered. Title: "Equipment Health — Coming in Phase 2". Description: "Cross-module dashboard combining 15-OEE availability trends with 13-MAINTENANCE MTBF/MTTR data. Requires 13-MAINTENANCE module to be implemented." Cross-reference: 13-MAINTENANCE PRD (Phase C5 Sesja 2 deliverable).

### SCREEN OEE-P2-C — Pareto Loss Analysis (P2 placeholder)

**Route:** `/oee/pareto`

**P1 placeholder layout:** `.card` centered. Title: "Pareto Loss Analysis — Coming in Phase 2". Description: "80/20 Pareto chart of top downtime causes across all lines and shifts. Six Big Losses drill-down with root cause analysis. P1 provides the Six Big Losses tab in OEE-003 as an interim view."

**Cross-reference:** OEE-003 Six Big Losses tab provides P1 equivalent. `[Go to Six Big Losses tab →]` button navigates to `/oee/summary` and auto-opens the Six Big Losses tab.

### SCREEN OEE-P2-D — Plant-floor TV Dashboard (P2 placeholder)

**Route:** `/oee/tv/[line_id]`

**P1 placeholder layout:** `.card` centered. Title: "TV Dashboard — Coming in Phase 2". Description: "Full-screen 1920×1080 OEE dashboard for plant-floor television screens. Auto-refresh 30s. Large font (operator-readable from 3–5m). Color-blind safe ColorBrewer divergent palette. No interactive controls — read-only kiosk mode."

P2 spec notes (for future implementation):
- Route: `/oee/tv/[line_id]` — hidden header and sidebar (full-screen).
- Auto-refresh: 30s (more aggressive than desktop 60s).
- Font scaling: body 20px, KPI values 48px bold.
- Color-blind safe: ColorBrewer "RdYlGn" divergent palette for gauges and heatmap cells.
- Auto-recovery: if browser crashes, OS-level kiosk restarts the URL.
- **Kiosk OS: OPEN (OQ-OEE-03 — no decision yet).** Options under consideration: Raspberry Pi, Windows kiosk mode, ChromeOS kiosk. Requires Apex IT hardware consultation. This is the only remaining open question.
- Feature flag: `oee.tv_dashboard_enabled` in 02-SETTINGS §10.

### P2 Notifications Specification (OQ-OEE-08 decision 2026-04-21)

**Scope:** P2. No browser push, no service worker, no PWA, no SMS.

**Channels:**
- **In-app toast/banner** — reuses existing 12-REPORTING alert system. Appears as a dismissible banner at the top of any 15-OEE screen.
- **Daily email digest** — sent via 02-SETTINGS §13 Resend integration when OEE <60% is sustained.

**Triggers:**
- OEE <60% sustained for 15 minutes on any line.
- Line DOWN >15 minutes (no `oee_snapshots` rows while WO active).
- Changeover duration breach (actual > `changeover_target_duration_min`).

**Opt-in:** Per user, via `notification_preferences` (02-SETTINGS §13.3). Default: in-app on, email digest off.

**Not in scope (ever):** Browser push notifications (service worker), PWA install prompts, SMS.

---

## 5. Cross-Module Integration Reference

### 5.1 Links from 15-OEE to other modules

| From | To | Navigation | Context |
|---|---|---|---|
| OEE-001 bottom link | 08-PRODUCTION `/production/lines/[line_id]` | [View in 08-PRODUCTION →] | Live WO execution and current shift data |
| OEE-001 downtime cause | 08-PRODUCTION `/production/downtime?line=X&date=Y` | [View in Downtime →] | Full downtime event log for the line |
| OEE-001 changeover card | 08-PRODUCTION `/production/changeover/:event_id` | [View changeover record →] | Full BRCGS audit record for changeover |
| OEE-002 cell click | 15-OEE `/oee/line/[id]?shift=AM&date=X` | Direct navigation | Drill-down to line trend filtered to shift/day |
| OEE-003 Changeover tab | 08-PRODUCTION `/production/changeover/:event_id` | [View record →] | Individual changeover detail |
| OEE-003 Total Downtime KPI | 08-PRODUCTION `/production/downtime?date=X` | Click KPI card | 08-PROD downtime tracking for same date |
| OEE-ADM-001 | 02-SETTINGS `/settings/reference-tables/oee-alert-thresholds` | Internal config, 02-SET is authoritative | PATCH via API |
| OEE-ADM-002 | 02-SETTINGS `/settings/reference-tables/shift-configs` | [Edit in 02-SETTINGS →] | Cross-link, editing delegated |

### 5.2 Links from other modules into 15-OEE

| From | To | Navigation trigger |
|---|---|---|
| 08-PRODUCTION PROD-006 bottom card | 15-OEE `/oee/summary` | [Go to 15-OEE] button |
| 12-REPORTING RPT-005 OEE dependency strip | 15-OEE `/oee/summary` | [Open 15-OEE →] link |
| 12-REPORTING RPT-001 OEE Summary card | 15-OEE `/oee/summary` | "Full OEE Dashboard →" link |
| 12-REPORTING RPT-005 line table row | 15-OEE `/oee/line/[line_id]` | Drill-through per line |

### 5.3 Data flow summary

```
08-PRODUCTION oee_aggregator (every 60s)
  → writes oee_snapshots (per-minute, per-line)
    → 15-OEE reads: OEE-001 trend chart
    → 15-OEE reads: shift_aggregator_v1 (post-shift)
         → writes oee_shift_metrics MV
            → OEE-002 heatmap
            → 13-MAINTENANCE (P2) MTBF/MTTR
    → 15-OEE reads: oee_daily_summary MV (refresh 15min)
         → OEE-003 summary table + sparklines
         → 12-REPORTING RPT-001 OEE card
         → 12-REPORTING RPT-005 OEE Summary

08-PRODUCTION downtime_events
  → 15-OEE reads: OEE-001 downtime causes
  → 15-OEE reads: OEE-003 Six Big Losses tab

08-PRODUCTION changeover_events
  → 15-OEE reads: OEE-001 changeover summary
  → 15-OEE reads: OEE-003 Changeover Analysis tab

02-SETTINGS shift_configs
  → 15-OEE reads: shift_aggregator_v1 shift boundaries
  → OEE-ADM-002 read-only view

02-SETTINGS oee_alert_thresholds
  → 15-OEE reads: color thresholds for all screens
  → OEE-ADM-001 admin edit

09-QUALITY (indirect)
  → quality_pct component in oee_snapshots computed by 08-PROD
  → 15-OEE shows Q factor context: "Quality = good_qty / total_output_qty"
  → cross-link: QA holds that affect output quality visible in OEE-001 tooltip
```

### 5.4 02-SETTINGS dependency

| Reference table / config | Used by | Notes |
|---|---|---|
| `shift_configs` | `shift_aggregator_v1`, OEE-002, OEE-ADM-002 | Apex P1: AM/PM/Night fixed |
| `oee_alert_thresholds` | Color coding on all screens | Per-line or tenant default |
| `downtime_categories` | OEE-001 downtime causes, OEE-003 Six Big Losses | Admin-configured taxonomy |
| `target_kpis.oee_target_pct` | Fallback if `oee_alert_thresholds` not set | 85% Apex default |
| Rule `shift_aggregator_v1` (§7.8) | Post-shift `oee_shift_metrics` population | P1 active |
| Rule `oee_anomaly_detector_v1` (§7.8) | P2 stub | P2 only |
| Rule `oee_maintenance_trigger_v1` (§7.8) | P2 stub, 13-MAINT consumer | P2 only |
| Feature flag `oee.anomaly_detection_enabled` | OEE-P2-A guard | 02-SET §10 |
| Feature flag `oee.tv_dashboard_enabled` | OEE-P2-D guard | 02-SET §10 |

### 5.5 13-MAINTENANCE (P2) cross-reference

When 13-MAINTENANCE is implemented (Phase C5 Sesja 2), the following integration activates:

- `oee_shift_metrics.mtbf_min` and `mttr_min` (stubs computed by `shift_aggregator_v1`) are consumed by 13-MAINT Equipment Health screens.
- `oee_maintenance_trigger_v1` rule creates PM work orders when `availability_pct < 70%` for 3 consecutive days (V-OEE-MAINT-1 / V-OEE-MAINT-2 deduplication).
- OEE-P2-B Equipment Health dashboard cross-links 13-MAINT work order detail.

---

## 6. Validation Rules — UX Implications

The following PRD validation rules (V-OEE-*) have direct UX surface implications:

| Validation | UX surface | Behavior when triggered |
|---|---|---|
| V-OEE-DATA-1: `oee_pct` GENERATED constraint | All screens | Never show raw inserts; frontend always reads computed value |
| V-OEE-DATA-3: `shift_id` mismatch | OEE-002, OEE-ADM-002 | `.alert-amber` "Shift configuration mismatch detected" |
| V-OEE-DATA-4: Gap >5 min in snapshots | OEE-001 freshness indicator | Stale warning + gap shown as gray band on trend chart |
| V-OEE-AGG-3: empty shift → skip row | OEE-002 | Cell renders `—` gray (no 0% placeholder) |
| V-OEE-AGG-4: MTBF/MTTR NULL if no events | OEE-P2-B (P2) | "N/A" displayed, not 0 |
| V-OEE-SHIFT-1: Shift configs must cover 24h | OEE-ADM-002 | Warning banner if gaps detected |
| V-OEE-SHIFT-3: Overlap detection | OEE-ADM-002 | Error state: "Shift overlap detected — fix in 02-SETTINGS" |
| V-OEE-ACCESS-1: No session | All routes | Redirect to `/login` with return URL |
| V-OEE-ACCESS-2: Role not in allowed list | All routes | Permission-denied full-page state |

---

## 7. API Endpoints Reference

All endpoints are read-only for 15-OEE (consumer pattern). Writes route through 08-PRODUCTION API for downtime annotations.

| Endpoint | Method | Screen | Notes |
|---|---|---|---|
| `/api/oee/line/[id]/trend` | GET | OEE-001 | Params: `window`, `shift_filter`, `since` (incremental) |
| `/api/oee/heatmap` | GET | OEE-002 | Params: `week`, `site_id`, `line_id` (optional) |
| `/api/oee/daily` | GET | OEE-003 | Params: `date` |
| `/api/oee/daily/summary` | GET | OEE-003 sparklines | Params: `date_from`, `date_to`, `line_id` |
| `/api/oee/settings/thresholds` | GET/PATCH | OEE-ADM-001 | PATCH requires `oee_admin` |
| `/api/oee/shift-configs` | GET | OEE-ADM-002 | Read-only view of 02-SET `shift_configs` |
| `/api/reporting/export` | POST | OEE-M-002 | Reuse 12-REPORTING export engine |
| `/api/production/downtime-events/:id` | PATCH | OEE-M-001 | 08-PROD endpoint — annotation only |

**Performance targets (from PRD §2):**

| Endpoint | P95 target |
|---|---|
| Any `/api/oee/*` | < 400 ms |
| Dashboard load (full page) | < 2 s |
| `oee_daily_summary` query (7-day range) | < 200 ms |
| Shift rollup MV refresh | < 10 s post-shift-end |

---

## 8. Data Freshness and Staleness Handling

All three P1 dashboards implement a consistent freshness model:

| Dashboard | Data source | Normal refresh cadence | Stale threshold |
|---|---|---|---|
| OEE-001 (trend) | `oee_snapshots` | 60s (per-minute batch) | >120s |
| OEE-002 (heatmap) | `oee_shift_metrics` MV | Post-shift-end (+5 min buffer) | Shift ended >30 min ago with no row |
| OEE-003 (summary) | `oee_daily_summary` MV | 15 min | >20 min since last MV refresh |

**Stale data visual treatment:**
- KPI card border switches from the status color to amber.
- Freshness indicator shows `.badge-amber "Data stale"`.
- A 2px amber top bar replaces the indigo progress bar.
- Individual data values remain visible (do not hide stale data — operators need context even if stale).
- [Retry] button triggers manual refresh poll.

**Aggregation job failure recovery (V-OEE-DATA-4):**

If `oee_aggregator` job fails (detected by gap >5 min in `oee_snapshots`):
1. Frontend shows `.alert-red` staleness banner on OEE-001.
2. OEE-001 trend chart shows a gray band over the gap period, labeled "Aggregation gap — HH:MM to HH:MM".
3. OEE-002 heatmap: affected cells show `!` icon. Tooltip: "Snapshot gap detected during this shift. Data may be incomplete."
4. 08-PRODUCTION's backfill job (`oee_aggregator` with `--backfill` flag) will recover missing snapshots automatically. Once recovered, the next 60s poll restores normal data.

---

## 9. Responsive Behavior

| Viewport | OEE-001 | OEE-002 | OEE-003 |
|---|---|---|---|
| ≥ 1280px (desktop) | Four gauges in `.grid-4` + shift summary sidebar | Full heatmap (10 lines × 21 cells) | Full table + sparklines visible |
| 768–1279px (tablet) | Gauges in `.grid-2` + `.grid-2` row. Shift summary below gauges. | Heatmap scrolls horizontally; fewer columns visible (scroll indicator) | Table: sparkline column hidden; stacked KPI cards |
| < 768px (mobile) | Redirect to desktop (no mobile layout — mobile users use 08-PRODUCTION scanner flows). Show `.alert-blue` "For mobile OEE monitoring, use 08-PRODUCTION dashboard on your device." | Redirect | Redirect |

Note: The PRD §10.3 specifies "mobile hidden (redirect to per-line dashboard #1)" for OEE-003. OEE-001 and OEE-002 follow the same mobile redirect pattern.

---

## 10. Labels and Microcopy

**Shift labels (Apex baseline):**
- `AM` — Morning Shift — 00:00–08:00 UTC
- `PM` — Afternoon Shift — 08:00–16:00 UTC
- `Night` — Night Shift — 16:00–00:00 UTC

**OEE status phrases:**
- ≥ 85%: "On target · World-class"
- 65–84.9%: "Below target · Typical range"
- < 65%: "Action required · Below acceptable threshold"

**Common microcopy strings:**

| Context | Microcopy |
|---|---|
| Empty OEE trend (no WO active) | "No active work order on this line for the selected period. OEE = 0% is expected." |
| Data stale banner | "OEE data stale — last aggregation [N]s ago. The aggregation job may have paused." |
| Aggregation error | "OEE aggregation job error. Last successful snapshot: HH:MM:SS. Recovery is automatic." |
| Heatmap cell: no data | "No shift data. Either no production scheduled or aggregation has not run for this shift." |
| OEE = 100% | "100% OEE is unrealistic — check source data in 08-PRODUCTION." |
| No downtime in window | "No downtime recorded in this window — line running to plan." |
| Export started | "Export started — download will begin shortly." |
| Annotation saved | "Note saved. Downtime event updated." |
| Category override saved | "Category updated. Audit entry created." |
| No production on selected day | "No production scheduled on this day per shift configuration." |
| Permission denied | "You do not have permission to view this page. Contact your OEE administrator." |
| P2 feature clicked | "This feature is coming in Phase 2. The [rule/table] is already registered — implementation is scheduled post-P1 pilot validation." |

---

## 11. Implementation Notes for Prototype Generator

These notes guide the HTML prototype build from this specification.

**1. Data model for prototype fixtures:**

Generate fixture data for 5 lines (LINE-01 through LINE-05), 3 shifts (AM/PM/Night), 7 days ending 2026-04-20. OEE values should vary realistically:
- LINE-01: consistently high (85–91%, world-class)
- LINE-02: problematic availability (55–74%, triggers red cells in heatmap)
- LINE-03: stable mid-range (78–86%)
- LINE-04: partial data (some shifts missing — test `—` rendering)
- LINE-05: improving trend (sparklines show upward direction)

**2. D3.js chart components:**

All D3.js charts are client-side. The prototype should include:
- `oee-trend-chart.js` — multi-line chart with hover tooltip, downtime bands, changeover markers.
- `oee-heatmap.js` — grid-based heatmap with color scale and cell detail panel.
- `oee-gauge.js` — reusable semi-circle arc gauge (shared across all four gauge instances on OEE-001). Export as a configurable web component `<oee-gauge value="87.5" target="85" label="Availability" color="#3b82f6" />`.
- `oee-sparkline.js` — thin wrapper around Recharts for inline table sparklines on OEE-003.

**3. Gauge component linking:**

On OEE-001, the four gauges share a JavaScript event bus. When a gauge is hovered, all four enter a `highlighted` state (1px blue outline, scale 1.02 transform). When mouse leaves any gauge, all return to normal. Implement via a shared `OEEGaugeGroup` class.

**4. Filter state persistence:**

All filter values (window, shift, line, week, date) persist in URL query params and survive page reload. On OEE-001, if no `line_id` is in the URL (i.e., user navigates to `/oee/line`), redirect to the first line available from the API.

**5. Auto-refresh implementation:**

```javascript
// Shared across all OEE screens
const REFRESH_INTERVAL = 60000; // 60 seconds
let lastFetchedAt = null;

const refreshTimer = setInterval(async () => {
  const data = await fetchOEEData({ since: lastFetchedAt });
  updateChartAndGauges(data);
  lastFetchedAt = data.meta.latest_snapshot_at;
  updateFreshnessIndicator(lastFetchedAt);
}, REFRESH_INTERVAL);
```

For OEE-001 trend chart, use incremental fetch (`?since=last_snapshot_minute`) to append new data points without re-rendering the full chart.

**6. Color scale for heatmap:**

Use D3 `scaleSequential` with a custom interpolator:
```javascript
const colorScale = d3.scaleLinear()
  .domain([0, 65, 85, 100])
  .range(['#ef4444', '#f59e0b', '#22c55e', '#16a34a'])
  .clamp(true);
```
Cells with `null` values use `#e2e8f0` (border color).

**7. Export integration:**

All export buttons call the same shared modal (OEE-M-002). The modal reads the current dashboard context from a global `window.oeeExportContext` object set by each screen on mount:
```javascript
window.oeeExportContext = {
  dashboard: 'oee_line_trend',
  line_id: 'LINE-01',
  window: '24h',
  shift_filter: 'all',
  date: '2026-04-20'
};
```

**8. Accessibility implementation:**

- Add `prefers-reduced-motion` media query: if active, disable chart animations and auto-refresh progress bar slide animation.
- All modals trap focus within the modal when open (`focus-trap` pattern).
- Gauge components render a visually-hidden `<span class="sr-only">` with the full metric value and target comparison for screen reader users.

**9. Component reuse from 08-PRODUCTION and 12-REPORTING:**

The prototype generator should reuse existing components:
- `.kpi` card component — identical markup to 08-PROD and 12-REPORTING.
- Export modal — reuse 12-REPORTING's export modal shell, parameterized.
- Freshness indicator widget — identical to 12-REPORTING §1.6 implementation.
- `.tabs` / `.tab` component — identical to 08-PRODUCTION WO detail tabs.

**10. P2 placeholder routing:**

All P2 routes (`/oee/anomalies`, `/oee/equipment-health`, `/oee/pareto`, `/oee/tv/[line_id]`, `/oee/benchmark`) render the same placeholder shell with screen-specific content. A shared `P2PlaceholderPage` component accepts props: `{title, description, relatedRule, featureFlag, alternativeLink}`.

---

## 12. Resolved Decisions (formerly Open Questions)

9 of 10 questions resolved at stakeholder session 2026-04-21. One question (OQ-OEE-03, TV OS) remains open — it does not block P1.

| ID | Question | Resolution | Date | Notes |
|---|---|---|---|---|
| OQ-OEE-01 | Per-product OEE drill-down (via `active_wo_id` join)? | CLOSED — deferred P2, remains sub-module 15-H | 2026-04-21 | No P1 impact. |
| OQ-OEE-02 | OEE target 85% vs lower Apex ramp-up baseline? | CLOSED — P1 target = **70%**. `oee_alert_thresholds.oee_target_pct = 70` (Apex baseline). Amber 55–70%, red <55% (derived proportionally). | 2026-04-21 | Conflict: P1 target 70% vs fixed color scale 65/85 (per OQ-OEE-07). Resolved: target line shows at 70% on charts; color scale stays fixed at 65/85 per OQ-OEE-07. Both documented. |
| OQ-OEE-03 | TV dashboard kiosk OS? | **OPEN** — no decision yet. Options: Raspberry Pi, Windows kiosk, ChromeOS. Requires Apex IT consultation. Does not block P1. | — | Only remaining open question. |
| OQ-OEE-04 | Operator annotation edit window — 1 hour or end of shift? | CLOSED — **1 hour post-event**. After 1h, read-only + `[Request Edit]` escalation to supervisor. | 2026-04-21 | See OEE-M-001 spec. |
| OQ-OEE-05 | Changeover target duration — configured where? | CLOSED — sourced from **02-SETTINGS** `changeover_target_duration_min` (per line, optional per-FA override). 15-OEE reads via settings API. | 2026-04-21 | New field added to 02-SETTINGS-PRD. |
| OQ-OEE-06 | Six Big Losses mapping — admin-configurable or fixed? | CLOSED — **admin-configurable per tenant**. Mapping editor added to OEE-ADM-001. Default seeded from industry standard. | 2026-04-21 | See OEE-ADM-001 Six Big Losses Mapping Editor section. |
| OQ-OEE-07 | OEE-002 heatmap color scale — fixed 65/85 or tenant-configurable? | CLOSED — **P1 fixed 65/85 industry thresholds**. P2 switches to tenant-configurable via `oee_alert_thresholds`. | 2026-04-21 | See §1.3 and OEE-002 color scale note. |
| OQ-OEE-08 | Push notifications scope and timing? | CLOSED — **P2, simplified**. In-app toast/banner via 12-REPORTING alert system + daily email digest (OEE <60% sustained). No browser push, no service worker, no PWA, no SMS. Triggers: OEE <60% sustained 15min, line DOWN >15min, changeover breach. Opt-in per user. | 2026-04-21 | See §4 P2 section update. |
| OQ-OEE-09 | Sidebar under ANALYTICS or OPERATIONS? | CLOSED — **OPERATIONS** (with 08-PRODUCTION). | 2026-04-21 | See §2.1. |
| OQ-OEE-10 | OEE-003 default date — today or yesterday? | CLOSED — **yesterday** (morning review persona). `[Today]` / `[Yesterday]` quick-switch in filter bar. Last choice persisted in `localStorage`. | 2026-04-21 | See OEE-003 Zone 1 filter bar spec. |

**1 open question remaining (TV OS, OQ-OEE-03). All P1-blocking questions resolved.**

---

## 13. References and Cross-PRD Links

| Document | Version | Relationship |
|---|---|---|
| `00-FOUNDATION-PRD.md` | v3.0 | R1 event-first, R4 Zod validation, R6 PostHog, R7 data residency |
| `02-SETTINGS-PRD.md` | v3.2 | `shift_configs`, `oee_alert_thresholds`, `downtime_categories`, rule registry §7.8 |
| `08-PRODUCTION-PRD.md` | v3.0 | `oee_snapshots` (primary source), `downtime_events`, `changeover_events`, D7 aggregation |
| `08-PRODUCTION-UX.md` | v1.0 | Design system inherited; PROD-006 is the inline OEE screen; 15 is the historical/analytical layer |
| `09-QUALITY-PRD.md` | v3.0 | Quality factor (Q) context: quality holds affect Q component |
| `09-QUALITY-UX.md` | v1.0 | Cross-reference for Q-factor badge styling |
| `12-REPORTING-PRD.md` | v3.0 | D-RPT-9 consumer integration; `oee_daily_summary` MV consumer |
| `12-REPORTING-UX.md` | v1.0 | RPT-005 OEE Summary screen; design system §1 inherited |
| `13-MAINTENANCE-PRD.md` | TBD (C5 Sesja 2) | P2 consumer: MTBF/MTTR, maintenance trigger |
| `14-MULTI-SITE-PRD.md` | TBD (C5 Sesja 2) | P2 consumer: per-site OEE rollup |
| `MONOPILOT-SITEMAP.html` | Current | Design token source of truth |

**ADR references:**
- ADR-028 (schema-driven L1–L4): L2 tenant `oee_alert_thresholds`
- ADR-029 (rule engine DSL / workflow-as-data): `shift_aggregator_v1`, `oee_anomaly_detector_v1`
- ADR-030 (configurable depts/modules): per-tenant shift config variation
- ADR-031 (schema variation per org): per-line OEE threshold overrides
