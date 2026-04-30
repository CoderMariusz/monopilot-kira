# Translation Notes — Reporting Module (Prototype → Production)

Scanned: 2026-04-23  
Files: modals.jsx · dashboard.jsx · kpi-screens.jsx · catalog-screens.jsx · admin-screens.jsx · other-screens.jsx  
Total indexed components: 26  
Total estimated translation time: ~3,165 minutes (~52.7 hours)

---

## Cross-Cutting Concerns

These apply to every component in this index and should be resolved once at the infrastructure level, not per-component.

### 1. Modal Primitive (`window.Modal`)
All 12 modals use a shared `window.Modal` wrapper (from `_shared/modals.jsx`) that is referenced as a global. In production:
- Replace with `@radix-ui/react-dialog` (via shadcn `Dialog`/`DialogContent`/`DialogFooter`)
- Size variants (`size="sm"`, `size="default"`, `size="wide"`) → `cn()` width classes applied to `DialogContent`
- The `Stepper`, `Field`, `Summary`, `ReasonInput` shared primitives need production equivalents extracted to `components/shared/`

### 2. RBAC Guards
Several components do client-side `role !== 'Admin'` early returns. In production:
- **Page-level guard**: `middleware.ts` redirects unauthenticated/unauthorised users before React renders
- **Admin pages** (`RptIntegrationHealth`, `RptRulesUsage`, `RptSettings`): protected at route group level with Next.js Route Segment Config
- **Manager pages** (`RptSavedFilters`, `RptScheduled`): role checked in Server Component from session; never pass raw role string from client
- Modal-level access denied (`AccessDeniedModal`) is a fallback for inline actions that fail at runtime, not the primary guard

### 3. Mock Data → Drizzle Queries
All `RPT_*` arrays (e.g. `RPT_FO_KPIS`, `RPT_QC_HOLDS`, `RPT_OEE_TREND`) are hardcoded in `data.jsx`. In production:
- Each page is a Next.js App Router Server Component (RSC)
- Data fetched with Drizzle ORM queries against materialised views (`mv_factory_overview_week`, `mv_yield_by_line_week`, etc.)
- Wrap data-heavy sections in `<Suspense>` with skeleton fallbacks
- Freshness (FreshnessStrip) reads `last_refresh` from `mv_refresh_log` or `pg_stat_user_tables`

### 4. Charts (BL-RPT-02 — P2)
All inline SVG charts (`ChartCombo`, `ChartLine`, `ChartMultiLine`, `ChartGroupedBar`, `ChartStackedBarH`, `ChartBarH`) are hand-rolled zero-dependency SVGs. BACKLOG.md BL-RPT-02 explicitly flags these for replacement with D3-shape + d3-scale. Recommended path:
- Use **Recharts** (maintained, React-native, tree-shakeable) for line, bar, grouped bar, stacked bar
- `GaugeRing` → `Recharts.RadialBarChart` or a minimal custom SVG component
- `Spark` inline sparklines → `Recharts.Sparklines` or keep lightweight SVG (acceptable for table cells)
- `@media print` stylesheet (BL-RPT-04, Medium) needed for Puppeteer PDF export — add before shipping export feature

### 5. Server Actions Pattern
All form submissions in prototype use `onClick → onClose()` (fire-and-forget). In production:
- Each form modal (export, save-preset, schedule, schedule-edit, settings) → dedicated Next.js Server Action
- Use `useTransition` / `useFormStatus` for pending state (disable buttons while in-flight)
- Add toast feedback via **Sonner** on success/error
- Emit outbox events on mutations (per architecture: monopilot-kira → ACP → outbox)

### 6. Internationalisation
All visible strings are English hardcoded. Map to `next-intl` keys under the `reporting.*` namespace before merging. Key prefixes:
- `reporting.modals.*` — modal titles, field labels, button text
- `reporting.pages.*` — page titles, breadcrumbs, KPI labels
- `reporting.alerts.*` — alert/banner copy
- `reporting.badges.*` — status badge labels

### 7. Known Cross-Module Bugs
- **BL-PROD-05** (HIGH): `.btn-danger` CSS class referenced in modals but missing from `_shared/shared.css`. Destructive confirm buttons (`DeleteConfirmModal`) fall back to primary styling. Fix in `_shared/shared.css` before shipping delete flows.
- **BL-RPT-03** (Medium): Zero-state / fresh-install variant not implemented for catalog cards. KPIs show live numbers; add `—` placeholder state + helper card per §6 spec.
- **BL-RPT-04** (Medium): `@media print` stylesheet missing; Puppeteer PDF export will render without print-specific layout overrides.
- **BL-RPT-05** (Low): No responsive breakpoints; desktop-first only. Tablet/mobile reflows needed before production launch.

---

## Component-by-Component Notes

### M-RPT-01 · `ExportReportModal` (modals.jsx:20-112)

**Pattern:** Async form with loading/error state machine, delivery method branching, row-count validation.

Key production decisions:
- Row estimate must be server-computed, not client-guessed. Before opening modal, fetch `SELECT COUNT(*) FROM <view> WHERE <filters>` (or use MV metadata row count) to populate `rowEstimate` accurately.
- PDF generation: delegate to an edge function / Trigger.dev background job (30s+ timeout is unacceptable in a Server Action). Return a job ID; poll via `useQuery` or Server-Sent Events.
- SHA-256 fingerprint in PDF footer: embed actual hash of the serialised dataset, not a placeholder. Use `crypto.subtle.digest('SHA-256', ...)` in the edge function after rendering.
- Email delivery path: queue via Resend (configured in 02-SETTINGS §13); do not call Resend directly from Server Action — use the outbox pattern.

---

### M-RPT-02 · `SavePresetModal` (modals.jsx:115-148)

**Pattern:** Create/edit form with duplicate-name validation and filter snapshot.

Key production decisions:
- Filter snapshot serialises the current active `searchParams` as a JSON blob in `saved_filter_presets.filter_params`. On "Apply", restore via `router.push(dashboardPath + '?' + new URLSearchParams(preset.filter_params).toString())`.
- Duplicate check must be server-side (Server Action returns `{ error: 'duplicate' }`) AND client-side (optimistic zod `.refine()` with debounced async validator).
- Team visibility requires Manager+ role on save (RBAC guard in Server Action).

---

### M-RPT-03 · `ScheduleReportModal` (modals.jsx:151-255)

**Pattern:** 2-step wizard — Cadence & Filters → Recipients & Format.

Key production decisions:
- This modal is a lightweight wizard for quick scheduling. The full edit experience lives in `RptScheduledEdit` (other-screens.jsx:245-432). Decide in UX: does this modal create a draft and redirect to edit, or does it complete the creation fully?
- Recipients input (tag-input with Enter key) must validate each token as a valid email with `zod.email()` before adding to the chip list.
- Activation → Server Action must check `reporting.scheduled_delivery` PostHog flag; if OFF, return `{ error: 'feature_disabled' }`.
- Cron registration: use Trigger.dev scheduled tasks or pg_cron; store job ID in `scheduled_reports.trigger_job_id` for management.

---

### M-RPT-05 · `DeleteConfirmModal` (modals.jsx:285-303)

**Pattern:** Destructive confirm with audit log note.

Key production decisions:
- The prototype shows an audit log note as UI text only. In production, the Server Action **must** INSERT an audit record (`audit_log` table: user_id, entity_type, entity_id, action='delete', timestamp). This is not optional — it is a compliance requirement.
- For `kind='schedule'`, also cancel any pending Trigger.dev jobs (`trigger.cancel(jobId)`) before deleting the row.
- Fix BL-PROD-05 before shipping: `btn-danger` → `Button variant='destructive'` in shadcn.

---

### M-RPT-07 · `RegulatorySignoffModal` (modals.jsx:332-378)

**Pattern:** PIN-verified sign-off with immutable audit record.

Key production decisions:
- **PIN MUST be verified server-side.** Never check `pin === "0000"` client-side. Server Action receives PIN, compares bcrypt hash against `users.signing_pin_hash`.
- Lockout (3 attempts): track in `user_signing_attempts` table with `locked_until` timestamp. Client state alone is trivially bypassed (BL-QA-06 flags virtual-keypad as Medium).
- On successful sign: Server Action creates `regulatory_signoffs` row (user_id, export_id, regulation_ref, sha256_hash, signed_at, declaration_text). Row is immutable — no UPDATE/DELETE allowed.
- SHA-256 shown in modal must be the real hash of the export payload, pre-computed before modal opens.
- 7-year retention: enforced by Row Security Policy or scheduled soft-delete check that blocks deletion of records < 7 years old.

---

### M-RPT-09 · `RecipientGroupModal` (modals.jsx:403-435)

**Pattern:** Member list CRUD with email/name search.

Key production decisions:
- Member search input → Combobox backed by `/api/users/search?q=` Server Action (debounced 300ms); returns `{ id, name, email, role }`.
- Table inside modal is acceptable for small groups (<20 members). If recipient groups can be large (org-wide), replace with paginated list.
- Group Name uniqueness enforced per-site in Server Action.

---

### `RptHome` (dashboard.jsx:3-112)

**Pattern:** Search-filtered dashboard catalog with domain/phase facets.

Key production decisions:
- The `RPT_CATALOG` array becomes a `dashboards_catalog` table with columns: `id`, `name`, `description`, `domain`, `phase`, `admin_only`, `route_key`, `icon`, `domain_class`. Metadata-driven per Strategic Decision #6.
- Freshness badge (`staleCount`) → aggregate query: `SELECT COUNT(*) FROM mv_refresh_log WHERE last_refresh < NOW() - (cadence_seconds || ' seconds')::interval`.
- Phase 2 cards (click → P2 toast) → check PostHog `reporting.v2_dashboards` flag server-side; if ON, render real component; if OFF, render disabled card with Tooltip.
- BL-RPT-09 (Low): Drag-and-drop KPI tile editor deferred. Do not implement in Phase 1.

---

### `RptFactoryOverview` (catalog-screens.jsx:251-398)

**Pattern:** Executive summary dashboard — KPI row + combo chart + top-3 gains/losses + all-lines table.

Key production decisions:
- This is the highest-traffic dashboard. Materialise aggressively: `mv_factory_overview_week` should refresh every 2 minutes (cron per FreshnessStrip metadata). Add Redis cache layer for KPI row (TTL: 60s).
- OEE embed widget reads from `mv_oee_daily` (owned by 15-OEE module). In production, use a cross-module RSC that imports from `@monopilot/oee/components`. The "Consumer of 15-OEE" badge must remain in UI to communicate data ownership.
- Top 3 Gains/Losses mini-bars → computed by `ORDER BY var_gbp DESC LIMIT 3` and `ASC LIMIT 3`; not client-side array slice.

---

### `RptYieldBySku` (catalog-screens.jsx:496-617)

**Pattern:** SKU drill-down with expandable row showing 13-week trend chart.

Key production decisions:
- Expandable row loads 13-week trend data lazily: on row expand, fire a Server Action `getSkuTrend(skuCode, weekEnding)` rather than including all 13-week data in the initial page load.
- The inner `ChartLine` (13-week trend) is the most complex inline SVG in catalog-screens.jsx — prioritise this for Recharts replacement (BL-RPT-02).
- Cross-module 'View all runs in Production' → validate `skuCode` format server-side before constructing the URL to prevent injection.

---

### `RptIntegrationHealth` (admin-screens.jsx:4-144)

**Pattern:** Admin-only outbox health monitor with DLQ detail.

Key production decisions:
- This screen reads from the **integration outbox** — a core ACP concern. Confirm with ACP team which tables/views to query: likely `integration_outbox_stages` + a dedicated `integration_dlq` table.
- DLQ action button ('Go to DLQ Admin') is a cross-module navigation to the admin integrations area — ensure that route exists and is protected.
- Latency chart (24h rolling) → data from `integration_latency_log` aggregated by hour via materialized view or time-series query. Consider TimescaleDB extension if volume is high.

---

### `RptSettings` (admin-screens.jsx:287-466) — Tabbed admin form

**Pattern:** 6-tab admin settings with independent forms per tab.

Key production decisions:
- Each tab should have its own `<form>` with its own Server Action. Do not use a single monolithic save.
- **PDF Branding tab**: logo file upload → Vercel Blob `put()` from Server Action; validate file type and size (PNG/JPG, max 2MB).
- **Feature Flags tab**: read-only view fetched from PostHog REST API server-side. 'Manage in PostHog' is an external link. Do not allow flag mutation from the MES UI.
- **Data Sources tab**: each 'Force Refresh' button opens `RefreshConfirmModal` with the view name; view names are an enum in code (never user-provided strings interpolated into SQL).
- **Email Delivery tab**: sender identity is managed in 02-SETTINGS §13 (Resend); this tab shows it read-only and links to the Settings module for changes.

---

### `RptScheduledEdit` (other-screens.jsx:245-432) — Full scheduled report create/edit form

**Pattern:** 4-section create/edit form for scheduled report configuration.

Key production decisions:
- This is the most complex single form in the Reporting module (estimated 240 min to translate).
- Custom cron validation: use `cron-validate` npm package client-side for UX + server-side for security. Never execute user-provided cron strings without parsing and whitelisting valid patterns.
- 'Next 3 runs' preview (sticky sidebar) → compute client-side with `cronstrue` + `date-fns-tz` for instant feedback without a server round-trip.
- Trigger.dev integration: on save, call `trigger.create(scheduledTask)` and store the returned job ID in `scheduled_reports.trigger_job_id`. On edit, call `trigger.update(jobId, ...)`.
- Recipient tag input must deduplicate emails (case-insensitive) before submitting to Server Action.
- Conditional Send (Phase 2, disabled checkbox) → do not wire in Phase 1; keep as disabled FormField with badge.

---

## BACKLOG Items Relevant to Reporting Translation

From BACKLOG.md §Reporting (BL-RPT-01..10):

| ID | Priority | Notes for Translation |
|---|---|---|
| BL-RPT-01 | Low | P2 catalog card routes — add feature-flag check in RSC; show real component when flag ON |
| BL-RPT-02 | P2 | Replace all inline SVG charts with Recharts. Block on D3-shape dependency decision. |
| BL-RPT-03 | Medium | Zero-state variants for fresh install — add EmptyState component per §6 spec |
| BL-RPT-04 | Medium | `@media print` CSS needed for Puppeteer edge function PDF export |
| BL-RPT-05 | Low | Responsive breakpoints — desktop-first only; add Tailwind responsive variants |
| BL-RPT-06 | P2 | Heatmap chart (ShiftPerformance) — `.heat-cell` CSS exists, no screen |
| BL-RPT-07 | P2 | Lot Genealogy FSMA tree — not in current prototype |
| BL-RPT-08 | P2 | Custom DSL builder behind feature flag |
| BL-RPT-09 | Low | Drag-and-drop KPI tile editor (ADR-031 L2) |
| BL-RPT-10 | Low | Row-level security scope pill placement per-KPI-card vs header |

Also relevant from other modules:
- **BL-PROD-05** (HIGH): `.btn-danger` missing from `_shared/shared.css` — affects `DeleteConfirmModal` and all destructive confirms system-wide.
- **BL-QA-06** (Medium): Virtual-keypad PIN anti-keylogger for `RegulatorySignoffModal`.

---

## shadcn Primitive Coverage Summary

| Primitive | Used by |
|---|---|
| Dialog, DialogContent, DialogFooter | All 12 modals |
| Form, FormField, FormLabel, FormMessage | export_report_modal, save_preset_modal, regulatory_signoff_modal, rpt_scheduled_edit |
| RadioGroup, RadioGroupItem | export_report_modal, save_preset_modal, schedule_report_modal |
| Tabs, TabsList, TabsTrigger, TabsContent | rpt_settings_tabbed |
| Collapsible, CollapsibleContent | rpt_yield_by_sku, rpt_rules_usage |
| Table, TableHeader, TableBody, TableRow, TableCell | all page-level components |
| Badge | all components |
| Button | all components |
| Alert, AlertDescription | export_report_modal, delete_confirm_modal, regulatory_signoff_modal, share_report_modal, rpt_qc_holds, rpt_oee_summary, rpt_integration_health |
| Select, SelectContent, SelectItem | rpt_home, rpt_settings_tabbed, rpt_exports_history, rpt_qc_holds, rpt_oee_summary, rpt_inventory_aging, rpt_wo_status, rpt_shipment_otd |
| Card, CardHeader, CardContent, CardFooter | rpt_home, all page-level layouts |
| Input | most modals, rpt_settings_tabbed |
| Checkbox | schedule_report_modal, share_report_modal, rpt_settings_tabbed, rpt_scheduled_edit |
| ToggleGroup, ToggleGroupItem | rpt_scheduled_edit (day-of-week) |
| Progress | rpt_wo_status (WIP by Line) |
| Combobox | recipient_group_modal, rpt_scheduled_edit |
| ScrollArea | rpt_rules_usage (pre block) |
| Separator | schedule_report_modal |
