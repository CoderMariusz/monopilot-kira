# Translation Notes — Multi-Site Module (14)

Scanned: 2026-04-23
Source files: `design/Monopilot Design System/multi-site/` (6 files)
Total components indexed: 25
Known bugs cross-referenced from: `design/Monopilot Design System/BACKLOG.md` §Multi-Site (BL-MS-01..07)

---

## How to use this document

Each section below corresponds to one entry in `prototype-index-multi-site.json`. Agents
implementing production components should:
1. Open the prototype file at the stated line range
2. Follow the translation_notes in the JSON (the bullets here expand on them)
3. Respect known_bugs — do not carry prototype shortcuts into production

---

## Shared Primitives Used Across Multi-Site

All prototype components rely on shared primitives defined in `_shared/`. These must exist before
translating any multi-site component:

| Prototype Primitive | Production Equivalent |
|---|---|
| `Modal` | `@radix-ui/react-dialog Dialog` + `DialogContent` `DialogHeader` `DialogFooter` |
| `Stepper` | Custom component using shadcn `cn()` utility; or `@radix-ui/react-progress` |
| `Field` | shadcn `FormField` + `FormLabel` + `FormMessage` via `react-hook-form` Controller |
| `ReasonInput` | shadcn `Textarea` + zod `.min(N)` guard |
| `Summary` | shadcn `Card` with `dl`/`dt`/`dd` definition list |
| `SiteRef` | Server Component reading from `sites` table, renders code badge |
| `ISTStatus` | shadcn `Badge` with variant derived from IST status enum |
| `RepStatus` | shadcn `Badge` with variant derived from replication status enum |
| `LaneHealth` | shadcn `Badge` with variant for active/stale/failed |
| `StatusDot` | Tiny colored dot component using Tailwind `bg-green-500` etc. |
| `SiteTypeBadge` | shadcn `Badge` for plant/warehouse/office/copack types |
| `ActState` | shadcn `Badge` for activation state machine values |
| `AllSitesBanner` | shadcn `Alert` shown only when site scope is "ALL" |
| `SiteCrumb` | Breadcrumb segment from session site context |

---

## modals.jsx — M-01 · site_create_modal (lines 21–175)

**Pattern:** 4-step modal wizard (Identity → Modules → TZ & Currency → Bootstrap Users)

**Key translation decisions:**

- The wizard is modal-contained (not a page). Use `Dialog` with `size='wide'` via a className variant.
- Step state (current + completed Set) → translate to a `currentStep: number` and `completedSteps: Set<string>` managed by `useForm` context or a lightweight `useReducer`.
- `canNext` per-step validation → call `form.trigger(['code', 'name'])` (react-hook-form) rather than manual length checks.
- Module checkboxes (15 modules) → `useFieldArray` or a `Set<string>` controlled by shadcn `Checkbox` + `Controller`.
- Bootstrap Users table with radio for primary → `useFieldArray` rows, each with a `Checkbox` (assign) and a `RadioGroup` (primary); only one primary allowed — enforce with a `.refine()` on the array.
- Dual-mode (create vs edit): on edit, skip the Stepper and show a single flat form. The `isEdit` flag controls this — translate to a prop-driven layout switch.
- `Save as Draft` → Server Action `createSite({ ...form, status: 'draft' })`.
- Country/timezone options are hardcoded — replace with a shared reference data table (countries, timezones).
- The `isDefault` checkbox has a side-effect note ("existing data migrates during activation") — add a shadcn `Alert` info block beside the field.

**RBAC:** Admin only for create. Admin or Site Manager for edit.

---

## modals.jsx — M-02 · ist_cancel_modal (lines 177–208)

**Pattern:** Destructive confirm with required reason select

**Key translation decisions:**

- Danger button must remain disabled until `reason !== ""`. In production, bind to `!form.formState.isValid` via zod schema with required reason field.
- The alert describes the side-effect (LP release). Keep this prominently above the form — use shadcn `Alert` with `AlertTriangle` icon from lucide-react.
- Server Action `cancelIST(id, reason, notes)` must: (a) check IST is not already closed/cancelled, (b) update status to `cancelled`, (c) release all hard-locked LPs back to `available`, (d) emit `ist_cancelled` outbox event.
- Reason options are hardcoded — move to a database-backed enum or `next-intl` translation keys.

---

## modals.jsx — M-03 · ist_amend_modal (lines 210–239)

**Pattern:** Simple edit form — fields that can change post-creation

**Key translation decisions:**

- Note: item quantities cannot be amended (prominent muted text). Enforce server-side too — Server Action ignores any quantity fields.
- Date fields → shadcn `DatePicker` (Popover + Calendar combination).
- The info alert "changing ship date resets from-site approval" must trigger an actual approval reset in the Server Action: when `plannedShipDate` changes, set `fromMgrApprovedBy = null`.
- Cost allocation select maps to `cost_allocation` enum: `sender | receiver | split | none`.

---

## modals.jsx — M-04 · replication_retry_modal (lines 241–270)

**Pattern:** Priority-select confirm for bulk or single replication job retry

**Key translation decisions:**

- Three scope modes driven by `data.scope` prop: `'failed'` (retry all failed), `'all'` (full sync), or single job ID. In production, derive the label and description from scope.
- Priority field (`normal | high`) maps to a queue priority integer in the background job table.
- Target sites list — prototype hardcodes `MS_SITES.filter(s => s.active)`. In production, fetch from DB.
- Server Action `retryReplicationJobs({ scope, jobId?, priority })` enqueues jobs; returns job IDs for optimistic UI.

---

## modals.jsx — M-05 · conflict_resolve_modal (lines 272–354) — SIGNATURE WIDE MODAL

**Pattern:** Side-by-side diff table with per-field source/site radio selection + audit reason + optional e-sig

**Key translation decisions:**

- This is the most complex modal in the multi-site module. Allocate 120 min.
- Wide modal (`max-w-4xl`) → extend Dialog size via `className` prop on `DialogContent`.
- Diff table: each row is a field with `source value`, `site value`, and two radio buttons. Use shadcn `RadioGroup` per row with `RadioGroupItem` values `'source'` and `'site'`.
- "Choose All Source" / "Choose All Site" → iterate all field keys and call `form.setValue` in a loop.
- Reason select is required before submit — zod `.min(1)` guard, `Apply Resolution` Button `disabled` until valid.
- E-signature gate (optional per org config): render conditionally based on `org.esigRequired` setting.
  - **BL-MS-02:** The prototype renders the password input but does not wire it to any auth check. In production, the Server Action must re-validate the user's password before applying the resolution.
- Server Action `resolveConflict({ entityId, siteId, fieldChoices, reason, notes, esig? })` must:
  1. Validate esig if org requires it (re-auth check against auth provider)
  2. Apply the chosen field values to the site record
  3. Write a `conflict_resolution` audit log entry with the full `fieldChoices` diff
  4. Mark the conflict as resolved in `replication_conflicts` table

---

## modals.jsx — M-06 · lane_create_modal (lines 356–388)

**Pattern:** Dual-use create/edit form for transport lanes

**Key translation decisions:**

- Same create/edit dual mode as SiteCreateModal. `isEdit` → `defaultValues` from lane prop.
- Carriers field: comma-separated string in prototype → in production store as `text[]` column in Postgres, parse on Server Action.
- HAZMAT / cold chain / customs / active checkboxes → shadcn `Checkbox` with `Controller`, 4 boolean columns in `transport_lanes` table.
- Auto-generated lane code (`LN-006`) → generate server-side using a sequence or UUID prefix.
- Server Action `createLane` / `updateLane` must re-check no in-transit ISTs exist if `active` is set to false.

---

## modals.jsx — M-07 · rate_card_upload_modal (lines 390–470)

**Pattern:** 4-step CSV/XLSX import wizard for lane rate cards

**Key translation decisions:**

- Step 1 (Upload): use `react-dropzone` for drag-and-drop. Validate file type (csv/xlsx) and size (<5MB) client-side; re-validate server-side in the Server Action.
- Step 2 (Column mapping): each table row maps a detected CSV header to a target field. Store mapping as `{ csvColumn: string, targetField: string }[]` in form state.
- Step 3 (Preview): call a Server Action `parseRateCardFile(file, mapping)` that returns first 5 rows as JSON; show in shadcn Table. Do not persist yet.
- Step 4 (Confirm): show Summary primitive with total rows to import.
- On Upload (final): Server Action `importRateCard(laneId, file, mapping)` processes all rows, inserts into `lane_rates` table, returns import summary.
- Large files → process as background job; return a jobId, poll for completion.
- Template download: expose a static CSV template via a public route.

---

## modals.jsx — M-08 · site_config_override_modal (lines 472–512)

**Pattern:** Dynamic field form — input type changes based on selected setting key

**Key translation decisions:**

- Setting key drives the input type: `fefo_strategy` → Select, `default_currency` → Select, `language` → Select, numeric/text keys → Input. In production, store this type mapping in a `config_schema` lookup table.
- L1 base value display box: fetch from `org_config` table, render as read-only `Card` section.
- Effective From date picker → shadcn DatePicker; if not provided, default to `now()` in Server Action.
- Server Action `upsertSiteConfigOverride({ siteId, key, value, effectiveFrom, notes })`:
  - Requires Admin or Site Manager role
  - Upserts into `site_config_overrides` table with L2 source label
  - Writes audit log entry
  - Returns updated config row for optimistic UI update

---

## modals.jsx — M-09 · permission_bulk_assign_modal (lines 514–575)

**Pattern:** Tabbed modal — single assignment form + bulk CSV import

**Key translation decisions:**

- Tab state (single/bulk) → shadcn `Tabs` + `TabsList` + `TabsContent`.
- Single tab: user select → shadcn `Select` populated from `users` query; site select → active sites; role select → roles enum.
- Primary site checkbox → only one primary per user enforced: Server Action checks and unsets previous primary if needed.
- Bulk tab CSV path: upload → column mapping → preview → confirm. This is the same 4-step wizard as RateCardUploadModal — extract a shared `CsvImportWizard` component.
- Bulk Server Action `bulkAssignUsersFromCSV(file)`:
  1. Parse CSV, validate email exists, site code valid, role valid
  2. Return validation errors per row before applying
  3. Apply all valid rows in a single transaction
  4. Return summary: `{ succeeded: N, failed: N, errors: [...] }`

---

## modals.jsx — M-10 · site_decommission_modal (lines 577–633)

**Pattern:** Destructive type-to-confirm with blocking pre-condition checklist

**Key translation decisions:**

- Pre-condition checks (open WOs, in-transit ISTs, quality holds, unassigned users) must be computed server-side before rendering the modal. Pass counts as props from Server Component.
- Checklist items with action links: "Close N WO(s) →" → navigate to Production WO list filtered to this site. Implement as `<Link>` inside Alert.
- Type-to-confirm: compare input value to `siteCode` — exact match required, case-sensitive. In production, enforce server-side too: Server Action checks `confirmCode === site.code`.
- `dismissible=false` → on `DialogContent`, add `onInteractOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`.
- Server Action `decommissionSite(siteId, confirmCode)`:
  1. Re-check all pre-conditions (re-query, not just trust client)
  2. Archive all site-scoped records (set `archived_at`, `archived_site_id`)
  3. Revoke all user site assignments for this site
  4. Update site status to `decommissioned`
  5. Emit `site_decommissioned` event with 7-year retention metadata

---

## modals.jsx — M-11 · activation_confirm_modal (lines 635–662)

**Pattern:** Destructive confirm with impact summary and simulated progress

**Key translation decisions:**

- Summary rows (tables affected, users, sites, duration) → shadcn Card or `dl`/`dt`/`dd` definition list, data pre-computed by Server Component.
- Progress indicator (simulated "Applying RLS policies...") → real production implementation uses a background job. Show shadcn `Progress` bar with polling, or use Server-Sent Events to stream progress.
- `dismissible=false` → prevent outside click and Escape during activation (activation is not cancellable mid-run).
- Server Action `activateMultiSite()`:
  1. Creates a background job in `activation_jobs` table
  2. Returns jobId
  3. Client polls `/api/activation-status?jobId=X` or subscribes to SSE
  4. Job applies RLS policies to 20 tables, updates `org_settings.activationState` to `activated`
  5. Emits `multisite_activated` audit event

---

## modals.jsx — M-12 · rollback_confirm_modal (lines 664–686)

**Pattern:** Type-to-confirm destructive — type 'ROLLBACK' to enable button

**Key translation decisions:**

- Type value is a fixed constant `'ROLLBACK'` — not site code. Enforce server-side too.
- State machine guard: Server Action must verify `org_settings.activationState === 'dual_run'`. Rollback from `activated` state requires support escalation — show different informational text for that state.
- `dismissible=false` → same as M-10 and M-11.

---

## modals.jsx — MODAL-PROMOTE-ENV · promote_env_modal (lines 688–730)

**Pattern:** Config key promotion with env ladder visualization and reason

**Key translation decisions:**

- Env ladder (L1 → L2 → L3 visual) → custom flex layout using shadcn Card nodes with arrow separators. Active nodes use a highlighted variant.
- Target scope select changes options based on `level` prop (L2 → sites, L3 → production lines).
- Multi-select for keys to promote → shadcn `Command` + popover pattern, or native `<select multiple>` with shadcn styling. Selected keys shown as `Badge` chips.
- `ReasonInput` with `minLength={10}` → shadcn `Textarea` + `CharacterCount` hint + zod `.min(10)`.
- Server Action `promoteConfigKeys({ level, targetScope, keys, reason })`:
  1. For each key, reads current org baseline (L1)
  2. Writes override records at target scope (L2 site_id or L3 line_id)
  3. Writes `config_promotion` audit log row per key
  4. Returns list of promoted keys with old/new values

---

## dashboard.jsx — ms_dashboard (lines 6–227)

**Pattern:** Full-page network dashboard with KPI strip, site tree, active transfers feed, replication health

**Key translation decisions:**

- KPI strip: 5 cards with role-gated value. `canSeeValue` check → in production use session RBAC from `auth()`, restrict `kpi.restricted` cards at Server Component level (omit value from server response, not just hide client-side).
- Network tree (L0 org → L1 sites → L2 buildings → L3 lines): prototype uses simple `div` nesting with CSS classes. In production, use shadcn `Collapsible` per node, or `react-arborist` for keyboard accessibility. Tree data loaded from `sites` + `buildings` + `lines` joined query.
- Map View → **BL-MS-01**: library decision pending (react-leaflet vs mapbox-gl). Placeholder stub is correct for now — do not implement map in production until library is chosen.
- Alerts strip with dismiss → dismissed state must persist (user preference in DB), not just local state. On dismiss, call Server Action `dismissAlert(alertCode, userId)`.
- Active Transfers feed: `MS_ACTIVE_ISTS` → Drizzle query: `WHERE status IN ('shipped', 'in_transit') ORDER BY eta ASC LIMIT 10`.
- Replication Health mini-panel: aggregate counts from `replication_jobs` table grouped by status.
- Site Status widget: `last_seen` from `site_heartbeats` table (cron-updated). **BL-MS-06**: real pinger is P2.
- Auto-refresh 60s: use SWR `refreshInterval: 60000` or React Query `staleTime: 0, refetchInterval: 60000`.

**Known bugs to address in production:**
- BL-MS-01: Map view — await library decision before implementing
- BL-MS-06: Heartbeat pinger is static mock; real implementation is P2

---

## sites-screens.jsx — ms_sites_list (lines 4–100)

**Pattern:** Search + filter table of all sites

**Key translation decisions:**

- Filter state in URL params via `useSearchParams` / Next.js `searchParams` prop for Server Component.
- Server Component queries `sites` table with `WHERE type = $type AND active = $active AND (code ILIKE $search OR name ILIKE $search)`.
- Module count (12/15) → computed from `site_modules` join table count.
- Last Sync → formatted from `site_heartbeats.last_seen` with `date-fns formatDistanceToNow`.
- Export → Server Action returning `StreamingResponse` with CSV MIME type.
- Row click → `router.push('/multi-site/sites/[siteId]')`.
- Edit/Decommission buttons: Admin-only, omit from render at Server Component level (not just CSS hidden).

---

## sites-screens.jsx — ms_site_detail (lines 102–410)

**Pattern:** 8-tab detail page for a single site

**Key translation decisions:**

- Tab state in URL: `?tab=config` so deep links work. Use Next.js `searchParams` to initialize tab.
- **Overview tab**: Identity + Status cards → Server Component fetches full site record with join to heartbeats, perm_matrix count, inventory aggregate.
- **Config (L2 Overrides) tab**: `site_config_overrides` table with join to `org_config` for base values. Edit/Clear Server Actions gated to Admin or Site Manager.
- **Inventory Snapshot tab**: Top-5 items from `inventory` view filtered to `site_id`. KPI cards from aggregate.
- **Production Snapshot tab**: recent WOs from `work_orders` table filtered to `site_id`.
- **Users tab**: `perm_matrix` join `users` filtered to this site. Edit/Remove actions.
- **Transfers tab**: ISTs where `from_site_id = X OR to_site_id = X`, split into inbound/outbound.
- **Calendar tab**: `site_holidays` table filtered to site + month. Render as 7-column CSS grid.
- **Docs tab**: Files from object storage (Vercel Blob / S3), metadata in `site_documents` table.

**Known bug to address:** BL-MS-04 — IST detail tabs need mobile accordion at <768px.

---

## ist-screens.jsx — ms_ist_list (lines 6–120)

**Pattern:** Filterable IST table with route filter and status filter

**Key translation decisions:**

- Route filter (only visible when scope = ALL sites): derive from session site context.
- ETA coloring (red for overdue, amber for borderline): use `cn()` utility with conditional Tailwind classes — never inline style in production.
- Linked TO/WO references: render as `<Link href="/planning/transfer-orders/[id]">` or `/planning/work-orders/[id]`.
- Row actions (view/amend/cancel): status-gated. Use Server Component to pass permissible actions per row, avoiding client-side status checks.
- `isOperator` hides Freight column: pass allowed columns from Server Component based on role.

---

## ist-screens.jsx — ms_ist_detail (lines 122–341)

**Pattern:** 7-tab IST detail with state machine progress bar and dual approval

**Key translation decisions:**

- State machine progress bar: derives step index from IST status enum `[draft, planned, shipped, in_transit, received, closed]`. Render as a custom step indicator (6 nodes with connecting lines).
- Dual approval cards (from-site + to-site): approval state from `ist_approvals` table. Approve button only shown if `session.site_id === ist.fromSite AND session.role === 'site_manager'`.
- Status-gated action buttons: "Submit for Approval" → `status === 'draft'`, "Receive Goods" → `status === 'in_transit'`, "Close IST" → `status === 'received'`. Server Component renders correct buttons.
- Items tab LP chips: shadcn `Badge` with `variant='outline'` and lock icon from lucide-react.
- Audit tab timeline: `ist_events` table ordered by `created_at DESC`, with color-coded dots per event type.
- Finance tab: inter-company charge posting via `postISTCharge(istId)` Server Action → creates journal entries in both site ledgers. Admin only.

---

## ist-screens.jsx — ms_ist_create (lines 343–490)

**Pattern:** Single-page form with 4 numbered sections and dynamic item rows

**Key translation decisions:**

- Section 2 shows auto-suggested lane based on from/to site pair: use `useEffect` (or `onChange` handler) calling a server-side lookup `GET /api/lanes?from=X&to=Y` or a Server Action, return default lane.
- Cross-field validation (same site error, ETA-before-ship): zod `.superRefine()` or `.refine()`.
- Items table with `useFieldArray` (react-hook-form): each row has item search input (Combobox autocomplete against `items` table), qty, uom (read-only from item), LP picker.
- LP picker per item: shadcn `Command` palette filtered to available LPs at fromSite with qty >= row.qty.
- Availability badge per item: resolved by Server Action or debounced query when item + qty changes.
- On submit: Server Action `createIST(form)`:
  1. Validate cross-field rules
  2. Hard-lock selected LPs (`UPDATE lps SET status = 'hard_locked', locked_by_ist = $id`)
  3. Auto-create outbound shipment record in `shipments` table (with `inter_site = true`)
  4. Auto-create inbound GRN placeholder in `grns` table (status = 'pending')
  5. Return new IST ID, redirect to detail page

---

## ist-screens.jsx — ms_lanes_list (lines 492–548)

**Pattern:** Transport lanes table with health indicator

**Key translation decisions:**

- Lane health (`active/stale/failed`) computed from: last IST date + on-time % threshold. Implement as a computed column or view in Postgres.
- Edit lane → Admin only, opens LaneCreateModal.
- Upload Rate Card → opens RateCardUploadModal.
- Filter bar: from site, to site, active/inactive — URL params for Server Component filtering.

---

## ist-screens.jsx — ms_lane_detail (lines 551–672)

**Pattern:** 4-tab lane detail — overview, rates, history, constraints

**Key translation decisions:**

- History tab bar chart: **BL-MS-05** — CSS-only placeholder. In production use Recharts `BarChart` with `lane_ist_monthly_counts` aggregate query (group by month, last 12).
- Rates table: `lane_rates` table with carrier/type/rate/currency/effective_from columns. Add Rate → inline row form or separate modal.
- Constraints tab: derived from `transport_lanes` columns (hazmat, cold_chain, max_weight, customs). Edit Constraints → LaneCreateModal (edit mode).
- Deactivate lane: check no in-transit ISTs on this lane before allowing, then set `active = false`.

**Known bug to address:** BL-MS-05 — real chart rendering required for lane history.

---

## replication-screens.jsx — ms_master_data_sync (lines 4–132)

**Pattern:** Expandable table of master data sync status with conflict resolution

**Key translation decisions:**

- Expandable rows: use TanStack Table `getExpandedRowModel()`. Sub-row renders conflict diff (field-level table) or sync log text.
- `MS_MDS_ROWS` → Drizzle query from `replication_status` view (join `master_data_entities` + `site_sync_state` + `replication_conflicts`).
- Conflict expand sub-row shows field diff from `replication_conflicts.field_diffs jsonb` column.
- RepStatus badge colors: synced=green, pending=amber, conflict=red — use shadcn Badge `variant` prop.
- Run Sync Now → Server Action `triggerReplicationSync({ scope: 'all' })`, Admin only. Returns jobId.
- Resolve button → opens `ConflictResolveModal` with conflict data pre-populated.

---

## replication-screens.jsx — ms_replication_queue (lines 134–292)

**Pattern:** 3-tab DLQ-style queue view (active/historical/schedule)

**Key translation decisions:**

- Active jobs table: `replication_jobs` table with status in `[running, pending, failed, retrying]`. Expandable row for failed jobs shows `job_errors` sub-rows.
- Running job spinner: lucide-react `Loader2` with `className="animate-spin"` next to duration.
- Retry All Failed: disabled when `failedCount === 0` — Server Action `retryAllFailedJobs({ priority })`.
- Retry single: opens `ReplicationRetryModal` with job data.
- Historical tab: `replication_jobs` table with status `completed`, paginated, no expand.
- Schedule tab: `replication_schedules` table. Edit Schedule → Admin only, opens schedule edit form.
- All-green alert: show only when active tab is selected AND `failedCount === 0` — shadcn Alert with `variant='default'` styled green.

---

## admin-screens.jsx — ms_permissions (lines 4–138)

**Pattern:** User × site permission matrix with 3 views

**Key translation decisions:**

- Matrix view: this is the most visually complex table — sticky first column with user name/email, remaining columns are active sites. Use CSS `position: sticky; left: 0` on the user column.
- Empty cell click (Admin only) → opens AssignUserModal pre-populated with user + site.
- Super-admin users show "ALL" badge in all site columns — do not render per-site role badges for these users.
- User view (flat list): TanStack Table with user + site + role + primary columns.
- Site view (per-site accordion): shadcn `Accordion` per site, expanded by default for sites with fewer than 5 users.
- All three views share the same Server Component data load (`users` + `perm_matrix` + `sites` joined query). Pass as single prop.

---

## admin-screens.jsx — ms_analytics (lines 140–333)

**Pattern:** 5-tab analytics dashboard (cross-site KPIs and charts)

**Key translation decisions:**

- **BL-MS-05 applies to all chart tabs.** The prototype uses CSS-only bar/line placeholders. In production, use Recharts or @tremor/react.
- Inventory balance: horizontal bar chart → Recharts `BarChart` with `layout='vertical'` + conditional fill colors for low/high balance sites.
- Shipping cost monthly: Recharts `AreaChart` or `BarChart` from `shipment_costs_monthly` materialized view.
- Rebalance suggestions: Drizzle query comparing site inventory levels against configured balance targets. Create IST button pre-fills `MsISTCreate` with suggestion data.
- Conflict trend: Recharts `BarChart` with conditional bar fill (red when count > 2). Data from `conflict_events` grouped by week.
- Per-site benchmark: TanStack Table with conditional text colors via `cn()`. OEE data requires OEE module enabled per site — show `—` if module not enabled.
- Date range select drives Server Component data re-fetch via URL param `?range=30d|7d|90d`.

**Known bug to address:** BL-MS-05 — all chart widgets require real chart library implementation.

---

## admin-screens.jsx — ms_settings (lines 335–493)

**Pattern:** Multi-section settings page (7 sections, each independently saveable)

**Key translation decisions:**

- Each section is a separate shadcn `Card` with its own Save button. Each save triggers a dedicated Server Action.
- Activation state section: read-only. Rollback button opens `RollbackConfirmModal`. Admin only.
- Replication cadence section: `replication_schedules` table. Edit Schedule action per row — inline edit form or dedicated modal.
- Conflict policy: `org_settings.conflict_policy` column (enum: `manual | lww | source_of_truth`). Conditional "Source of Truth Site" select appears when policy is `source_of_truth`.
- Timezone/language toggles: `org_settings.tz_user_local` and `org_settings.site_specific_lang` boolean columns. **BL-MS-03**: toggle is wired in prototype but not applied to timestamp rendering — implement a global timezone context that all timestamp display components read.
- FX pairs: read from Finance module's `fx_rates` table. Missing rates → alert with link to Finance FX settings.
- Hierarchy section: **BL-MS-07**: Edit Hierarchy is a stub. Implement full hierarchy depth migration wizard before production.
- Config promotion section: env ladder + recent promotions from `config_promotions` audit table.

**Known bugs to address in production:**
- BL-MS-03: Implement global timezone context for consistent timestamp rendering
- BL-MS-07: Implement hierarchy depth migration wizard (MODAL-HIERARCHY-EDIT)

---

## admin-screens.jsx — ms_activation_wizard (lines 495–652)

**Pattern:** 3-step full-page activation wizard (not a modal)

**Key translation decisions:**

- This wizard lives at a dedicated route (`/multi-site/activate`), not inside a Dialog.
- Step 1 (Create Sites): `useFieldArray` for dynamic site list. Each site card has code, name, type, country, timezone, isDefault radio. Validation: code must be unique, at least one site with `isDefault = true`.
- Default site auto-creation note: fetch current org config to show the auto-created default site at top of list.
- Step 2 (Assign Users): complex matrix — `users` × `[default site, ...new sites]`. Each user row has checkboxes per site, a role select, and a primary radio. `useFieldArray` or `Record<userId, { sites: string[], role: string, primary: string }>` form state.
- "6 of 8 users assigned" readout: computed from form state (count users with at least one site checked).
- Step 3 (Backfill & Review): backfill preview table fetched from Server Action `previewBackfill()` — returns row counts per table that will be stamped with the default site_id.
- 3 confirm checkboxes + allChecked gate: zod `.refine()` requiring all three true before submit.
- Save & Exit: persist wizard state to `activation_wizard_draft` DB table for resumability.
- Final "Activate Multi-Site" button → opens `ActivationConfirmModal` (separate Dialog), not inline.
- State machine guard: wizard route only accessible when `org_settings.activationState === 'inactive'`. Redirect to dashboard if already activated.

---

## Cross-Cutting Production Requirements

The following apply to ALL multi-site components and are not repeated in individual entries:

1. **RBAC enforcement is server-side only.** Never conditionally render using client-side role checks alone. Pass only permitted data/actions from Server Components.
2. **All hardcoded mock data** (`MS_SITES`, `MS_ISTS`, `MS_MDS_ROWS`, `MS_LANES`, etc.) → replace with Drizzle queries in Server Components or Server Actions.
3. **Inline `style={}` props** → replace with Tailwind utility classes via `cn()`. No inline styles in production components.
4. **Hardcoded labels** → `next-intl` keys for all user-facing strings. Language switching per site (BL-MS-03 pattern) requires a language context.
5. **Outbox events**: every state-changing Server Action must emit an event to the outbox table for downstream consumers (notifications, audit, replication triggers).
6. **Audit log**: every admin/destructive action writes to `audit_events` with `user_id`, `entity_type`, `entity_id`, `action`, `old_value`, `new_value`, `timestamp`.
7. **Mobile (BL-MS-04)**: IST detail tabs need accordion layout at <768px — implement as responsive Tabs → Accordion switch.
8. **Charts (BL-MS-05)**: All analytics + lane history charts require Recharts or @tremor/react. Do not ship CSS-only chart placeholders to production.
