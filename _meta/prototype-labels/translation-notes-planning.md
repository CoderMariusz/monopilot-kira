# Translation Notes — Planning Module (WO / PO / TO / Gantt)

Generated: 2026-04-23
Source files scanned: modals.jsx, wo-list.jsx, wo-detail.jsx, po-screens.jsx, to-screens.jsx, dashboard.jsx, gantt.jsx, other-screens.jsx, cascade.jsx
BACKLOG cross-reference: design/Monopilot Design System/BACKLOG.md

---

## Summary

30 components indexed across 9 prototype files. Total estimated translation time: **3 205 minutes (~53 hours)**.

| # | Label | File | Lines | Type | Domain | Est. min |
|---|-------|------|-------|------|--------|----------|
| 1 | po_fast_flow_wizard | modals.jsx | 21-179 | wizard | PO | 120 |
| 2 | add_po_line_modal | modals.jsx | 182-225 | modal | PO | 45 |
| 3 | po_approval_modal | modals.jsx | 228-264 | modal | PO | 60 |
| 4 | lp_picker_modal | modals.jsx | 269-341 | modal | LP | 90 |
| 5 | cascade_preview_modal | modals.jsx | 346-396 | modal | WO | 90 |
| 6 | wo_create_wizard | modals.jsx | 399-500 | wizard | WO | 120 |
| 7 | reservation_override_modal | modals.jsx | 505-549 | modal | LP | 60 |
| 8 | cycle_check_warning_modal | modals.jsx | 552-583 | modal | WO | 30 |
| 9 | d365_trigger_confirm_modal | modals.jsx | 586-606 | modal | WO | 30 |
| 10 | to_create_edit_modal | modals.jsx | 697-845 | modal | TO | 90 |
| 11 | ship_to_modal | modals.jsx | 852-931 | modal | TO | 60 |
| 12 | draft_wo_review_modal | modals.jsx | 937-1046 | modal | WO | 90 |
| 13 | delete_confirm_modal | modals.jsx | 609-629 | modal | WO | 30 |
| 14 | hard_lock_release_confirm_modal | modals.jsx | 632-671 | modal | LP | 60 |
| 15 | sequencing_apply_confirm_modal | modals.jsx | 1053-1100 | modal | WO | 45 |
| 16 | plan_dashboard | dashboard.jsx | 3-261 | page-layout | WO | 180 |
| 17 | plan_wo_list | wo-list.jsx | 3-177 | table | WO | 180 |
| 18 | plan_wo_detail | wo-detail.jsx | 3-99 | tabs | WO | 90 |
| 19 | wo_overview_tab | wo-detail.jsx | 102-239 | tabs | WO | 120 |
| 20 | wo_dependencies_tab | wo-detail.jsx | 292-372 | tabs | WO | 90 |
| 21 | wo_reservations_tab | wo-detail.jsx | 375-417 | tabs | LP | 60 |
| 22 | wo_sequencing_tab | wo-detail.jsx | 420-494 | tabs | WO | 60 |
| 23 | wo_history_tab | wo-detail.jsx | 497-526 | tabs | WO | 30 |
| 24 | plan_po_list | po-screens.jsx | 3-139 | table | PO | 150 |
| 25 | plan_po_detail | po-screens.jsx | 143-353 | page-layout | PO | 180 |
| 26 | plan_to_list | to-screens.jsx | 3-99 | table | TO | 120 |
| 27 | plan_to_detail | to-screens.jsx | 103-281 | page-layout | TO | 180 |
| 28 | plan_gantt | gantt.jsx | 7-162 | page-layout | WO | 240 |
| 29 | plan_cascade_dag | cascade.jsx | 3-239 | page-layout | WO | 240 |
| 30 | plan_reservations | other-screens.jsx | 3-120 | table | LP | 120 |
| 31 | plan_sequencing | other-screens.jsx | 124-252 | page-layout | WO | 180 |
| 32 | plan_settings | other-screens.jsx | 256-490 | page-layout | WO | 300 |
| 33 | plan_d365_queue | other-screens.jsx | 510-648 | page-layout | WO | 150 |

---

## Cross-cutting patterns (apply to all components)

### 1. Primitive replacement map

| Prototype primitive | Production equivalent |
|---|---|
| `window.Modal` + `open` prop | `@radix-ui/react-dialog` Dialog + DialogContent |
| `<Stepper steps current completed/>` | Custom Stepper built on Radix UI Steps or shadcn `Steps` (not yet in shadcn core; use custom) |
| `<Field label required help error/>` | shadcn `FormField` + `FormLabel` + `FormDescription` + `FormMessage` |
| `<ReasonInput value onChange minLength/>` | shadcn `Textarea` + react-hook-form field with `zod .min(N)` |
| `<Summary rows/>` | Definition list (`dl/dt/dd`) with Tailwind prose or a custom `SummaryTable` primitive |
| `<Toggle defaultChecked disabled onChange/>` | shadcn `Switch` |
| `WOPlanStatus / POStatus / TOStatus` badge | shadcn `Badge` with `variant` derived from status enum map |
| `Priority` badge | shadcn `Badge` with colour token derived from priority level |
| `AllergenCluster` | Custom component with coloured dots per allergen family; reuse across modules |
| `Avail` indicator | Coloured dot or Badge (green/amber/red) based on availability_status enum |
| `SourceBadge` | shadcn `Badge` (manual / D365 SO / Cascade / Rework) |

### 2. State management strategy

- **Modal state**: Never lift modal open/close state higher than the nearest interactive parent. Use `useState` locally. Pass data as props from the Server Component that fetched it.
- **Multi-step wizards** (POFastFlow, WOCreate): `useReducer` with a step enum; do not use `useState` for each field — use `react-hook-form`.
- **Bulk selection**: `useReducer` or `useState(Set)` for selected IDs; bulk Server Actions accept an array of IDs.
- **Dirty tracking**: `useForm({ mode: 'onChange' })` provides `isDirty`; use `useBeforeUnload` for navigation guard in settings pages.

### 3. Server Action pattern

All write operations follow this pattern:

```typescript
// Server Action
"use server"
export async function createWO(formData: WOCreateInput) {
  // 1. RBAC guard
  const session = await auth(); // e.g., next-auth
  if (!session || !hasRole(session, "planner")) throw new Error("Forbidden");

  // 2. Validate with zod
  const parsed = WOCreateSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.flatten() };

  // 3. DB write with Drizzle in transaction
  await db.transaction(async (tx) => {
    const wo = await tx.insert(workOrders).values(parsed.data).returning();
    // cascade generation, reservations, etc.
    await tx.insert(outbox).values({ event: "wo.created", payload: wo });
  });

  // 4. Revalidate RSC cache
  revalidatePath("/planning/work-orders");
}
```

### 4. Hardcoded mock data → DB queries

| Prototype global | Production source | Drizzle table |
|---|---|---|
| `PLAN_WOS` | `work_orders` join `wo_materials`, `sequencing_queue` | `work_orders` |
| `PLAN_POS` | `purchase_orders` join `po_lines`, `suppliers` | `purchase_orders` |
| `PLAN_TOS` | `transfer_orders` join `to_lines`, `to_lp_reservations` | `transfer_orders` |
| `PLAN_RESERVATIONS` | `lp_reservations` join `lps`, `work_orders`, `materials` | `lp_reservations` |
| `GANTT_BARS` | `work_orders` WHERE planned_start BETWEEN week_start AND week_end | `work_orders` |
| `CASCADE_DAG` | `cascade_edges` join `work_orders` | `cascade_edges` |
| `SEQ_QUEUE` | `sequencing_queue` WHERE line = ? ORDER BY position | `sequencing_queue` |
| `SEQ_KPIS` | Aggregate on `sequencing_queue` comparing to baseline | `sequencing_queue` |
| `D365_DRAFT_WOS` | `work_orders` WHERE source='d365' AND status='draft' | `work_orders` |
| `D365_PULL_HISTORY` | `d365_pull_log` ORDER BY run_at DESC LIMIT 1 | `d365_pull_log` |
| `PLAN_SETTINGS` | `plan_settings` (single-row config table) | `plan_settings` |
| `RES_AVAILABILITY` | `lps` WHERE product_code = ? ORDER BY expiry_date ASC | `lps` |
| `PLAN_KPIS` | Aggregated COUNT queries per entity type | multiple |
| `ACTIVITY_FEED` | `audit_log` WHERE module='planning' ORDER BY created_at DESC LIMIT 10 | `audit_log` |

### 5. i18n strategy

All hardcoded English strings must be replaced with `next-intl` keys before production. Namespace map:

```
planning.po.*           — Purchase Order labels
planning.po.line.*      — PO line form fields
planning.po.approval.*  — PO approval modal
planning.to.*           — Transfer Order labels
planning.to.ship.*      — Ship TO modal
planning.wo.*           — Work Order labels
planning.wo.detail.*    — WO detail page tabs and fields
planning.wo.overview.*  — Materials + Operations tables
planning.wo.dependencies.* — DAG / dependency tab
planning.wo.reservations.* — Reservations tab
planning.wo.sequencing.* — Sequencing tab
planning.wo.history.*   — State history tab
planning.wo.hardLockRelease.* — Hard lock release modal
planning.cascade.*      — Cascade DAG page and preview
planning.cascade.cycleError.* — Cycle check warning
planning.d365.*         — D365 integration labels
planning.d365.draftReview.* — Draft WO review modal
planning.d365.queue.*   — D365 SO queue page
planning.sequencing.*   — Sequencing page
planning.sequencing.applyConfirm.* — Apply confirm modal
planning.reservation.*  — Reservation override modal
shared.deleteConfirm.*  — Generic delete confirm modal
```

---

## Component-level notes

### po_fast_flow_wizard (modals.jsx 21-179)

**Key design decisions:**
- Three-step wizard (Supplier → Products → Review & Submit). Step machine is managed by local `useState` with `completed` Set tracking visited steps.
- Smart defaults banner (currency, payment terms, lead time) appears after supplier selection. In production, this is a Server Action call on supplier select that returns supplier defaults.
- Line items table with inline qty/unit price inputs calculates subtotal/tax/total on every render without separate state.
- Approval banner (total > £15,000) is client-side in prototype. In production, the threshold must come from `plan_settings.po.approval_threshold` and the Server Action enforces it regardless of client state.
- "Paste CSV" button is a placeholder; CSV import is a separate workflow (MODAL-BULK-IMPORT, not yet built).

**Validation rules to encode in zod:**
- `supplier`: required string
- `warehouse`: required string
- `expDate`: required date, min today
- `lines`: array min length 1 (V-PLAN-PO-003 implied)
- `lines[].qty`: number > 0 (V-PLAN-PO-004)

---

### add_po_line_modal (modals.jsx 182-225)

**Key design decisions:**
- Single-step form. Triggered from PO Fast Flow wizard (step 2) or from PO Detail "Add line" button.
- UoM auto-fills from product's UoM on product select; displayed as read-only. In production, fetch from `products.uom` on product selection.
- Unit price auto-fills from `supplier_products` table (supplier × product price agreement). Editable post-fill.
- Line total shown as live preview (no submit, purely derived).

---

### po_approval_modal (modals.jsx 228-264)

**Key design decisions:**
- Dual-path: approve (optional notes) vs reject (required reason ≥10 chars). Mode toggled by pill buttons.
- RBAC: only users with `production_manager` or `admin` role may approve. Guard enforced in Server Action, not just UI.
- PO summary is passed as prop; the modal does not fetch its own data.
- Outbox events: `po.approved` / `po.rejected`; downstream triggers email notification to PO creator.

---

### lp_picker_modal (modals.jsx 269-341)

**Key design decisions:**
- FEFO default sort (by expiry_date ASC); FIFO toggle re-sorts by lp_created_at ASC. Sort is client-side for already-fetched LP list.
- Status filtering: only `available` LPs are selectable; `reserved`, `hard_lock`, `quarantine` shown but checkbox disabled.
- totalSelected >= requiredQty gate: Confirm button disabled until selection covers required qty. Shows surplus/deficit.
- Scan button: stub for future barcode scanner integration (BarcodeDetector API or zxing-js).
- In production, LP list is fetched once on modal open filtered by product_code and site; no live search to DB (set is small).

---

### cascade_preview_modal (modals.jsx 346-396)

**Key design decisions:**
- Sub-modal opened from WOCreateModal when `hasIntermediate` is true. Opens as a full-page dialog on top.
- Cascade tree is a read-only preview (no edits). Rendered as layered rows separated by `↓ to_stock` arrows.
- BACKLOG Q2: Upgrade to react-flow DAG with SVG directed edges before production implementation. Current CSS layering is prototype-only.
- Cycle-check result shown in blue banner (passed = no cycles). If cycles existed, CycleCheckWarningModal would show instead.
- Confirm from this modal finalises WO creation including all cascade children atomically.

---

### wo_create_wizard (modals.jsx 399-500)

**Key design decisions:**
- Two-step wizard (Basic info → Confirm & Create). Cascade detection happens client-side (`product.startsWith("FA5301")` in prototype; in production, product has `has_intermediate` boolean from BOM table).
- CascadePreviewModal opens as a nested Dialog when cascade is detected and user clicks "Preview cascade chain".
- Rework WOs flagged separately; they bypass normal material reservation and require approval (plan_settings.wo.require_rework_approval).
- BOM auto-selection follows FR-PLAN-018: latest active BOM version is pre-selected but user can override.
- Create WO action: if cascade, creates root WO + N intermediate WOs in a single DB transaction with cascade_generation_v1 rule output.

**Validation rules:**
- `product`: required
- `qty`: number > 0 (V-PLAN-WO-001)
- `startDate`: required date
- `bom`: required (auto-selected but must exist)

---

### reservation_override_modal (modals.jsx 505-549)

**Key design decisions:**
- Destructive action: releases an LP hard lock, making the LP available to other WOs. Owning WO loses its reservation.
- Triple gate: category selection + reason ≥10 chars (V-PLAN-RES-003/004) + confirmation checkbox + audit-log acknowledgement.
- Admin-only: Server Action checks for `admin` role.
- Category enum drives downstream audit record; reason goes to `lp_reservation_history.release_reason`.
- Outbox: `reservation.released` event triggers downstream availability recalculation.

---

### to_create_edit_modal (modals.jsx 697-845)

**Key design decisions:**
- Single-step form supporting both Create and Edit modes. Edit mode pre-fills from `editing` prop.
- Full inline validation (`validate()` function) runs only on submit (audit decision Q3:c — "block at save"). Errors shown per-field after first save attempt.
- V-PLAN-TO-001 (From ≠ To) enforced as blocking error. V-PLAN-TO-002 (same site) advisory-only in prototype — BACKLOG: add sites lookup to enforce as blocking.
- Dual CTA: "Save Draft" (status=draft) vs "Save & Plan" (status=planned). Both paths use same validation.
- `requireLpSelection` setting: when ON, shows an inline CTA to open LPPickerModal per line before saving.
- Line UoM auto-fills from product on select; product list covers FA, intermediate, and RM types.

**Known gap:** V-PLAN-TO-002 site check is advisory. See BACKLOG "warehouse → site taxonomy" item.

---

### ship_to_modal (modals.jsx 852-931)

**Key design decisions:**
- Per-line qty inputs pre-seeded with remaining unshipped qty (line.qty - line.shipped).
- V-PLAN-TO-004: shipped qty per line must not exceed remaining qty. Validated per-line; error shown inline below input.
- Status transition preview (`TOStatus` before → after badges) is purely derived; no extra state.
- `willBeFull` uses floating-point epsilon (0.0001) to handle rounding; replicate this guard in Server Action.
- `nextStatus` transitions: if all lines fully shipped → `shipped`; partial → `partially_shipped`; zero → no change.
- Outbox: `to.shipped` event triggers downstream inventory update and GRN pre-creation.

---

### draft_wo_review_modal (modals.jsx 937-1046)

**Key design decisions:**
- Opens from D365 Queue page (SCREEN-13) when planner clicks "Review" on a draft WO.
- Fetches review detail (materials + cascade chain + allergen hint) via Server Action before modal opens.
- Three-way radio action: Approve & Release / Keep as Draft / Reject (delete chain). Reject requires reason ≥10 chars.
- Material availability uses coloured dots (green/yellow/red); these come from availability_status enum on each material row.
- Allergen hint shows current sequencing position for the WO's line; from `sequencing_queue` table.
- Approve action: releases all WOs in the cascade chain, creates LP reservations atomically.
- Reject action: hard-deletes draft WO and all cascade children in a single transaction.

---

### plan_dashboard (dashboard.jsx 3-261)

**Key design decisions:**
- Page-level RSC with multiple async sub-components. Each KPI tile, alert column, and upcoming table section is an independent async RSC wrapped in `<Suspense>`.
- Alert dismiss is client-side state in prototype (`dismissed` Set). In production: Server Action writes to `user_dismissed_alerts` table; dismissed alerts excluded from DB query on next load.
- Three-column alert layout (PO / WO / TO) has per-column severity colouring (red / amber / orange). Each column is an independent async RSC.
- Upcoming panel has 4 tabs (PO calendar / WO schedule / TO timeline / Cascade chains). Tab selection via URL search param for deep-linkability; each tab is a separate DB query.
- D365 drift info band: shown when any PO has `d365_drift=true`; dismissible per-session.
- Recent Activity feed: last 10 events from `audit_log WHERE module='planning'`; each entry has entity code, description, and timestamp.

---

### plan_wo_list (wo-list.jsx 3-177)

**Key design decisions:**
- Status tabs with counts: 7 tabs. Counts fetched in a single `GROUP BY status` DB query alongside the paginated list.
- Multi-filter bar: line, priority, allergen family, source, date range. All filters are URL search params; Drizzle `.where()` composition with optional clauses.
- Bulk actions: Release selected (Server Action, state-machine-guarded), Export to Excel (route handler CSV), Cancel selected (Server Action with cascade lock-release).
- KPI mini-cards: "On hold > 24h" requires `EXTRACT(EPOCH FROM (now() - on_hold_since)) / 3600 >= 24` in DB query.
- Row actions are status-conditional: only the allowed next actions per state machine are rendered. Client shows UI; Server Action re-validates status before executing.
- Allergen filter: multi-value OR filter on `wo_allergen_families` join table.
- Progress bar per row: `wo.progress_pct` computed field (actual_qty / planned_qty * 100).

---

### plan_wo_detail (wo-detail.jsx 3-99)

**Key design decisions:**
- Shell page with header, summary bar, cascade banner (if cascadeLayer set), and 7 tabs.
- Header actions are status-conditional (draft/planned/released/in_progress/on_hold/completed each has different button set).
- Cascade dependency banner links to full DAG view with `?highlight=<wo.id>` param.
- Tabs: Overview, Outputs, Dependencies, Reservations, Sequencing, State history, D365 sync. Each tab content is an async RSC sub-component.
- Summary bar (7 horizontal fields) should horizontally scroll on mobile.
- Tab selection via URL search param (`?tab=overview`) for deep-linkability and browser back-button support.

---

### wo_overview_tab (wo-detail.jsx 102-239)

**Key design decisions:**
- Two-column layout: left = Materials + Meat-pct + Operations; right = WO info + Capacity + BOM sidecars.
- Materials table: source enum (stock/upstream_wo_output/manual) drives the reserved/projected display. Hard lock LP shown with `reservedLP` + pending-release note.
- Meat-pct aggregation (FR-PLAN-026): computed from BOM expand across all meat-type materials; displayed as read-only horizontal list.
- Operations table: from `wo_operations` (routing snapshot at WO creation); actual duration populated by Scanner module events.
- Capacity card: slot overlap check (P1 stub = greedy); conflict badge shown if `scheduled_slot_conflict=true`.
- BOM card: links to Technical module BOM detail; version is immutable snapshot stored at WO creation.

---

### wo_dependencies_tab (wo-detail.jsx 292-372)

**Key design decisions:**
- Graph/List toggle. Graph view = CSS layered DAG (BACKLOG Q2 → replace with react-flow in production). List view = table of upstream/downstream dependencies.
- `byLayer` grouping: DAG nodes are grouped by `layer` integer (1 = root, N = deepest intermediate). Layer computed server-side via topological sort on `cascade_edges`.
- DAG legend (Completed/In progress/Released/Planned/Draft) maps to WO status → dot colours.
- Cycle-check result shown as green badge ("✓ Cycle-check passed"); if failed, CycleCheckWarningModal should have been shown at WO creation and chain should not exist.
- "Open full cascade" → `/planning/cascade?chain=<chainId>` with this WO highlighted.

---

### wo_reservations_tab (wo-detail.jsx 375-417)

**Key design decisions:**
- P1 semantics banner: reservations are hard locks created only on RELEASED transition for RM (stock-source) materials only. Intermediate cascade materials are NOT reserved (consumed at production time by Scanner).
- Reservation statuses: pending (not yet released), active (live hard lock), pending-release (WO on hold), released.
- Release button is admin-only (disabled for non-admin users). Opens ReservationOverrideModal.
- Count summary in card header: pending/active/released counts from `lp_reservations` grouped by status for this WO.

---

### wo_sequencing_tab (wo-detail.jsx 420-494)

**Key design decisions:**
- Allergen profile snapshot captured at release; immutable after that (not recalculated from current materials).
- Changeover cost (low/medium/high) computed by `allergen_sequencing_heuristic_v1` rule; stored in `sequencing_queue.changeover_cost`.
- Position shown as "3 of 8 on LINE-04"; before/after WO identifiers from adjacent rows in sequencing_queue.
- Override active alert shown when `sequencing_queue.override_active=true`; "Clear override" → Server Action sets override_active=false.
- Queue preview (next 5) fetched from `sequencing_queue ORDER BY position` from current WO's position - 1, limit 5.

---

### wo_history_tab (wo-detail.jsx 497-526)

**Key design decisions:**
- Pure read-only audit log. No mutations on this tab.
- `context` column contains JSON blob (e.g., `{"qty": 800, "line": "LINE-04"}`); rendered as `JSON.stringify` in prototype. Production: use a Collapsible JSON tree or Tooltip to avoid table overflow.
- Override reason shown in amber when non-null; these are cases where a planner bypassed normal state machine rules.
- Workflow rule link → `/settings/rules/wo_state_machine_v1` (Q5 backlog: rules registry browser not yet built).

---

### plan_po_list (po-screens.jsx 3-139)

**Key design decisions:**
- 7 status tabs (All/Draft/Submitted/Pending approval/Confirmed/Receiving/Closed). Counts from `GROUP BY status`.
- D365 drift tag inline in PO number cell: shown when `po.d365_drift=true`. Requires admin resolve.
- Filter bar: supplier (foreign key select from suppliers table) + date range (expected delivery).
- Bulk actions: Release selected, Export to Excel (CSV route handler), Cancel selected.
- KPI: "Pending approval" amber card; "Overdue" red card (exp_date < now() for non-closed POs).
- Pagination: cursor-based; URL param `?cursor=<last_id>`.

---

### plan_po_detail (po-screens.jsx 143-353)

**Key design decisions:**
- Two-column layout: left = PO lines + Notes + Status history (collapsible); right = PO summary + Approval card + D365 sync card.
- PO lines table shows per-line received progress bar (received/qty%). From `grn_lines` aggregation join.
- Approval card shown only when `po.approval_required=true`. Inline Approve/Reject buttons open POApprovalModal.
- D365 drift card: amber alert shown when `po.d365.drift=true`; admin resolve required (navigates to Settings D365 admin).
- GRN progress bar in right sidebar: aggregate `SUM(received)` / `SUM(qty)` from all lines.
- Status-conditional action buttons match PO state machine; each action is a Server Action.
- Status history collapsible: rendered as a table of transitions; collapsed by default to save vertical space.

---

### plan_to_list (to-screens.jsx 3-99)

**Key design decisions:**
- 7 status tabs (All/Draft/Planned/Partially shipped/Shipped/Received/Closed).
- Filter bar: from warehouse, to warehouse, priority, date range. All URL search params.
- KPI: "In transit" = count of TOs where status IN ('shipped', 'partially_shipped', 'partially_received').
- Overdue TOs: `planned_ship_date < now()` AND status NOT IN ('shipped', 'received', 'closed', 'cancelled').
- Overdue relay (Overdue Xd): `EXTRACT(DAYS FROM now() - planned_ship_date)` shown in sub-line.
- Create TO button opens TOCreateModal; on close with confirm, `router.refresh()` to reload RSC.

---

### plan_to_detail (to-screens.jsx 103-281)

**Key design decisions:**
- Two-column layout: left = TO lines + LP breakdown + Notes; right = TO summary + Status history (collapsible).
- TO lines table shows per-line shipped/received progress bars (shipped/qty%, received/shipped%).
- LP breakdown collapsible: shows LPs reserved for each TO line from `to_lp_reservations`. Add LP → LPPickerModal.
- Status history: rendered as a timeline list (not a table) for visual hierarchy; each entry has from/to status badges.
- Edit button → opens TOCreateModal in edit mode with current TO data.
- Ship button → opens ShipTOModal with full TO data as prop.
- Actual ship/receive dates filled when Ship/Receive actions are confirmed.

---

### plan_gantt (gantt.jsx 7-162)

**Key design decisions:**
- Fixed-width pixel constants (DAY_W=200, HOUR_W=200/24). In production, these must be responsive: compute from container width via ResizeObserver; expose as CSS custom properties for zoom support.
- Date header shows 7 days (Mon–Sun). "Today" column is highlighted. In production, week start derived from URL `?week=<ISO-week>` param.
- Bars: positioned via `left = day * DAY_W + start * HOUR_W; width = (end - start) * HOUR_W`. In production, compute day/start/end from ISO datetime strings (`planned_start`, `planned_end`).
- Allergen colour band: strip at bottom of each bar. In production, map allergen family → design token colour.
- Changeover markers: vertical dashed lines between allergen-incompatible adjacent WOs. Computed from sequencing_queue by comparing adjacent allergen families.
- Bar popover on click: absolute-positioned mini-card (not a full Dialog). Shows WO summary with links to edit and full detail.
- SVG dependency arrows: single hard-coded arrow in prototype. Production: dagre layout for cross-lane arrows; each arrow represents a cascade dependency edge.
- Bar conflict class (`.conflict`): from capacity slot overlap query; P1 = greedy allocation, P2 = finite-capacity engine.

**Zoom support:** UI shows +/- buttons; in production these adjust a `zoomLevel` state that scales DAY_W proportionally.

---

### plan_cascade_dag (cascade.jsx 3-239)

**Key design decisions:**
- Global cascade view: shows all active chains with a chain-list sidebar on the left and a canvas on the right.
- Chain selector: `activeChain` URL search param for deep-linkability and browser back-button.
- BACKLOG Q2: CSS layered canvas is a prototype approximation. Production implementation must use `react-flow` (or `dagre-d3`) with:
  - Directed SVG edges from parent WO node to child WO node
  - Edge labels: `{required_qty} {uom}` + disposition badge (`→ to_stock`)
  - Edge thickness scaling with `required_qty`
  - Cycle highlighting: red `CYCLE DETECTED` node + red edges for cycle participants
- Side panel: click a cascade node to open a right-side Sheet (shadcn) with Materials / Outputs / Deps tabs. Data from `CASCADE_EDGES` filtered by selected node.
- Stats bar: counts from aggregate queries on `cascade_edges` table; cycle count from `cycle_check_results`.
- Availability dot colours on nodes: from WO material availability summary (green/yellow/red/produced) stored per WO.

---

### plan_reservations (other-screens.jsx 3-120)

**Key design decisions:**
- Global hard-lock browser: shows all active reservations across all WOs. Not scoped to a single WO.
- Availability panel (right sidebar): shows LP-level net availability for a selected product. FEFO-sorted. Highlights over-committed LPs (net < 0 = DB constraint violation alert).
- Status filter includes admin_override as a valid status (manual release by admin).
- Release button (admin-only): opens ReservationOverrideModal.
- Click row → navigate to WO detail page for the owning WO.
- Export button: CSV route handler with current filter state as query params.

---

### plan_sequencing (other-screens.jsx 124-252)

**Key design decisions:**
- Line-scoped view: one production line at a time. Line selection via URL search param.
- Queue rows grouped by allergen family; changeover banners between groups show estimated cleaning time (20 min standard, 45 min for multi-allergen transitions).
- Drag handle (⋮⋮ icon): wired to `@dnd-kit/sortable` in production for manual override; Server Action updates `sequencing_queue.position`.
- Before/after compare inline modal: opens as a Dialog showing baseline vs heuristic changeover counts. From SEQ_KPIS prop.
- Apply Sequencing → opens SequencingApplyConfirmModal (audit decision Q1: preview inline, confirm modal separate).
- Override button per row: opens a per-WO override form.
- KPI strip: changeovers vs baseline vs target (>30% reduction). Target is configurable per plan_settings.sequencing.

---

### plan_settings (other-screens.jsx 256-490)

**Key design decisions:**
- 9-tab settings page (General, PO, TO, WO, Cascade, Sequencing, D365, Status display, Field visibility). Each tab is a separate form section.
- Dirty state tracked via react-hook-form `isDirty`; unsaved banner shown when dirty.
- Status display tab: inline-editable table for PO/TO/WO status labels, colors, and icons. Uses `useFieldArray` from react-hook-form.
- Field visibility tab: matrix of entity × field × role toggles. Required fields have disabled toggle. Server-side enforcement: hidden fields are also masked in API responses.
- D365 tab: cron expression validated with `cron-parser`; "Test D365 connection" is an async Server Action returning live status.
- Cascade tab: `intermediateDisposition` field disabled (always `to_stock` in P1; P2 adds direct-continue option).
- Save is per-tab section; Server Action validates entire section with zod schema. Emits `settings.updated` outbox event.

**BACKLOG Q5:** ~30 additional settings screens (SET-040 D365 connection config through SET-100 L1→L2 promotion) are not yet prototyped. These block D365 end-to-end demo and Rules Registry browsing.

---

### plan_d365_queue (other-screens.jsx 510-648)

**Key design decisions:**
- Gate page: if `plan_settings.d365.enabled=false`, renders a disabled-state page with link to Settings.
- Pull history strip: last pull timestamp, SO count, draft WO count, errors — from `d365_pull_log` table.
- Draft WOs table: expandable rows (click cascade depth indicator to expand child WOs). Expanded state is client-side via `useExpandedRows`.
- Pull errors collapsible card: from `d365_pull_errors` table; retry → Server Action re-queues SO.
- Review button → opens DraftWOReviewModal with WO data as prop; modal fetches full review detail (materials, cascade, allergen hint) via Server Action.
- Manual trigger button → Server Action enqueues `d365.so_pull` job to BullMQ/pg-boss; shows optimistic "Triggered" feedback.

---

## Known bugs cross-referenced from BACKLOG.md

| Component | Backlog ID | Description | Priority |
|---|---|---|---|
| cascade_preview_modal | Q2 | CSS layered DAG, not true SVG directed graph; missing edge labels, cycle highlight | pre-production |
| wo_dependencies_tab | Q2 | Same CSS layered DAG issue in WO detail Dependencies tab | pre-production |
| plan_cascade_dag | Q2 | Full cascade DAG page uses layered list; needs react-flow with SVG edges before production | pre-production |
| to_create_edit_modal | — | V-PLAN-TO-002 (same site check) advisory only; BACKLOG: add sites lookup to block at save | Medium |
| plan_settings | Q5 | ~30 additional settings screens (SET-040 through SET-100) not prototyped; blocks D365 e2e and Rules Registry | Medium |
| all modals | BL-PROD-05 | `.btn-danger` CSS class referenced in MODAL-SCHEMA but missing from production.css; destructive confirms fall back to primary styling — fix in `_shared/shared.css` | HIGH |

---

## Dependency graph (prototype-to-prototype)

```
_shared/modals.jsx (Modal, Stepper, Field, ReasonInput, Summary)
  └─ modals.jsx (all 15 modal components)
       └─ wo-list.jsx (WOCreateModal, DeleteConfirmModal via CTA)
       └─ po-screens.jsx (POFastFlowModal, POApprovalModal, AddPOLineModal)
       └─ to-screens.jsx (TOCreateModal, ShipTOModal)
       └─ other-screens.jsx (DraftWOReviewModal, SequencingApplyConfirmModal, ReservationOverrideModal)

_shared/ (WOPlanStatus, POStatus, TOStatus, Priority, AllergenCluster, Avail, SourceBadge)
  └─ wo-list.jsx, wo-detail.jsx, po-screens.jsx, to-screens.jsx,
     dashboard.jsx, gantt.jsx, other-screens.jsx, cascade.jsx (all pages)
```
