# Prototype Translation Notes — Maintenance Module

Generated: 2026-04-23
Source files: `design/Monopilot Design System/maintenance/`
Covers: modals.jsx, dashboard.jsx, assets.jsx, work-orders.jsx, pm-schedules.jsx, spares.jsx, other-screens.jsx
Backlog cross-reference: BACKLOG.md § Maintenance (BL-MAINT-01..07)

---

## Component Index (35 entries)

| Label | File | Lines | Type | Domain | Est. min |
|---|---|---|---|---|---|
| asset_edit_modal | modals.jsx | 29-79 | modal | Asset | 90 |
| wr_create_modal | modals.jsx | 81-121 | modal | WR | 75 |
| wr_triage_modal | modals.jsx | 123-183 | modal | WR | 90 |
| mwo_create_modal | modals.jsx | 185-234 | modal | MWO | 90 |
| task_checkoff_modal | modals.jsx | 236-294 | modal | MWO | 90 |
| mwo_complete_signoff_modal | modals.jsx | 296-355 | modal | MWO | 120 |
| pm_schedule_edit_wizard | modals.jsx | 357-472 | wizard | PMSchedule | 150 |
| pm_occurrence_skip_modal | modals.jsx | 474-498 | modal | PMSchedule | 60 |
| calibration_reading_modal | modals.jsx | 500-568 | modal | Asset | 120 |
| calibration_cert_upload_modal | modals.jsx | 570-593 | modal | Asset | 45 |
| spare_reorder_modal | modals.jsx | 595-619 | modal | Spare | 60 |
| technician_skill_edit_modal | modals.jsx | 621-657 | modal | Role | 90 |
| loto_apply_modal | modals.jsx | 659-731 | wizard | Asset | 120 |
| loto_clear_modal | modals.jsx | 733-802 | modal | Asset | 120 |
| delete_confirm_modal | modals.jsx | 804-822 | modal | Asset | 30 |
| criticality_override_modal | modals.jsx | 824-844 | modal | Asset | 45 |
| downtime_linkage_modal | modals.jsx | 846-879 | modal | MWO | 45 |
| spare_adjust_modal | modals.jsx | 902-925 | modal | Spare | 60 |
| maintenance_dashboard | dashboard.jsx | 1-257 | page-layout | MWO | 180 |
| asset_list_page | assets.jsx | 1-183 | page-layout | Asset | 180 |
| asset_detail_page | assets.jsx | 185-518 | page-layout | Asset | 240 |
| wr_list_page | work-orders.jsx | 1-132 | page-layout | WR | 150 |
| mwo_list_page | work-orders.jsx | 134-259 | page-layout | MWO | 180 |
| mwo_detail_page | work-orders.jsx | 261-584 | page-layout | MWO | 300 |
| pm_schedules_list_page | pm-schedules.jsx | 1-138 | page-layout | PMSchedule | 150 |
| pm_month_calendar | pm-schedules.jsx | 140-216 | page-layout | PMSchedule | 90 |
| pm_week_calendar | pm-schedules.jsx | 218-275 | page-layout | PMSchedule | 90 |
| spares_list_page | spares.jsx | 1-115 | page-layout | Spare | 150 |
| spare_detail_page | spares.jsx | 117-261 | page-layout | Spare | 180 |
| calibration_list_page | other-screens.jsx | 1-127 | page-layout | Asset | 150 |
| calibration_detail_page | other-screens.jsx | 129-264 | page-layout | Asset | 180 |
| technicians_list_page | other-screens.jsx | 266-374 | page-layout | Role | 150 |
| technician_detail_page | other-screens.jsx | 376-486 | page-layout | Role | 120 |
| loto_list_page | other-screens.jsx | 488-598 | page-layout | Asset | 150 |
| maintenance_analytics_page | other-screens.jsx | 601-803 | page-layout | MWO | 240 |
| maintenance_settings_page | other-screens.jsx | 805-964 | page-layout | Asset | 180 |

**Total estimated translation: ~4,225 minutes (~70 hours)**

---

## Cross-Cutting Translation Patterns

These patterns appear in multiple components and should be extracted as shared utilities before per-component translation begins.

### 1. Shared Primitive: `window.Modal` → `@radix-ui/react-dialog`

Every modal in `modals.jsx` wraps the `Modal` prototype primitive. In production:
- `Modal` → shadcn `Dialog` with `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- `size="wide"` → `max-w-3xl` Tailwind class on `DialogContent`
- `size="sm"` → `max-w-sm`
- `size="default"` → `max-w-lg` (shadcn default)
- `dismissible={false}` → `onInteractOutside={(e) => e.preventDefault()}` on `DialogContent`
- `foot` prop → `DialogFooter` children
- `subtitle` prop → `DialogDescription`

### 2. Shared Primitive: `Stepper` → Custom shadcn-compatible Steps

Used by `pm_schedule_edit_wizard` and `loto_apply_modal`. Build a `<Stepper steps completed current />` client component using `ol/li` with Tailwind:
- Completed step: `bg-primary text-primary-foreground`
- Current step: `ring-2 ring-primary`
- Future step: `bg-muted text-muted-foreground`

### 3. Shared Primitive: `Field` → `FormField` + `FormItem` + `FormLabel` + `FormMessage`

Every `<Field label required help>` wrapper maps to this shadcn Form pattern:
```tsx
<FormField control={form.control} name="fieldName" render={({ field }) => (
  <FormItem>
    <FormLabel>Label <span>*</span></FormLabel>
    <FormControl><Input {...field}/></FormControl>
    <FormDescription>Help text</FormDescription>
    <FormMessage/>
  </FormItem>
)}/>
```

### 4. Shared Primitive: `ReasonInput` → `Textarea` + `zod .min(10)`

Used in: wr_triage_modal (reject path), pm_occurrence_skip_modal, loto_apply_modal (notes), criticality_override_modal, spare_adjust_modal, state_transition_modal.

```tsx
// zod schema
reason: z.string().min(10, "Reason must be at least 10 characters")
// component
<FormField name="reason" render={({ field }) => (
  <FormItem>
    <FormControl><Textarea {...field} placeholder="Explain why…"/></FormControl>
    <FormMessage/>
  </FormItem>
)}/>
```

### 5. Shared Primitive: `PriorityBadge` / `CritBadge` / `MwoStatus` / `MwoType` → shadcn Badge variants

Each badge primitive → shadcn `Badge` with a variant or custom className:
- `PriorityBadge p="critical"` → `<Badge className="bg-red-600 text-white">Critical</Badge>`
- `CritBadge c="high"` → `<Badge variant="outline" className="border-orange-500 text-orange-600">High</Badge>`
- `MwoStatus s="in_progress"` → `<Badge variant="secondary">In Progress</Badge>`
- `MwoType t="preventive"` → `<Badge className="bg-blue-100 text-blue-700">Preventive</Badge>`

Map all variants via a `cn()` helper lookup table keyed by value string.

### 6. Shared Primitive: `DueCell` → Date display with color

```tsx
// Compute days from date string, apply Tailwind color
function DueCell({ date, days }: { date: string; days?: number }) {
  const d = days ?? differenceInCalendarDays(parseISO(date), new Date())
  return (
    <span className={cn("font-mono text-sm", d < 0 && "text-red-600 font-bold", d >= 0 && d <= 7 && "text-amber-600", d > 7 && "text-foreground")}>
      {date}
    </span>
  )
}
```

### 7. Mock Data → Drizzle Queries (naming convention)

| Prototype mock | Production table |
|---|---|
| `MNT_ASSETS` | `assets` |
| `MNT_MWOS` | `mwos` (maintenance_work_orders) |
| `MNT_WRS` | `work_requests` |
| `MNT_PM_SCHEDULES` | `pm_schedules` |
| `MNT_INSTRUMENTS` | `calibration_instruments` |
| `MNT_SPARES` | `spare_parts` |
| `MNT_TECHNICIANS` | `technicians` |
| `MNT_SKILL_MATRIX` | `tech_skill_matrix` (join table) |
| `MNT_SKILLS` | `settings_ref_technician_skills` |
| `MNT_TEMPLATES` | `task_templates` |
| `MNT_ACTIVE_LOTO` | `loto_procedures WHERE status='active'` |
| `MNT_LOTO_PROCS` | `loto_procedures` |
| `MNT_ANALYTICS` | Aggregate queries / `maintenance_kpis` materialized view |
| `MNT_SETTINGS` | `maintenance_settings` (key-value + typed config) |
| `MNT_KPIS` | Computed from above tables in Server Component |
| `MNT_ALERTS` | `alert_notifications WHERE module='maintenance'` |

### 8. RBAC Pattern

All prototype `const isManager = role === "Manager" || role === "Admin"` checks become server-side:

```tsx
// Server Component
const session = await auth()
const isManager = session.user.roles.some(r => ['MANAGER', 'ADMIN'].includes(r))
// Pass as prop to Client Component or conditionally render server-side
```

Never pass `isManager` from client-side session only — re-validate in Server Actions.

### 9. URL Search Params Pattern

All filter state (search, typeFilter, statusFilter, view toggle) uses `nuqs` for Next.js-native URL params:

```tsx
const [view, setView] = useQueryState('view', parseAsString.withDefault('list'))
const [typeFilter, setTypeFilter] = useQueryState('type', parseAsString.withDefault('all'))
```

Filters are passed directly to Drizzle WHERE clause in Server Components — no client-side filtering of full datasets.

### 10. Server Action Pattern (standard template)

```tsx
"use server"
export async function createMwo(input: MwoCreateInput) {
  const session = await auth()
  if (!session) throw new Error("Unauthorized")
  const parsed = mwoCreateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.flatten() }
  
  const mwo = await db.insert(mwos).values({ ...parsed.data, createdBy: session.user.id }).returning()
  
  // Outbox event
  await db.insert(outbox_events).values({ type: 'mwo.created', payload: mwo[0] })
  
  revalidatePath('/maintenance/mwos')
  return { data: mwo[0] }
}
```

---

## Module-Specific Notes

### modals.jsx — Safety-Critical Components

**loto_apply_modal** and **loto_clear_modal** have non-standard safety requirements:
- `dismissible={false}` is mandatory — never allow accidental close
- Two-person verification must be enforced in Server Action, not just client
- BL-MAINT-04: Remote second-person confirmation requires WebSocket or SSE; prototype assumes separate browser sessions

**mwo_complete_signoff_modal** pre-condition gates:
- `allOk` must be computed server-side from actual DB state (tasks complete count, LOTO cleared status)
- Client receives pre-condition status as a prop — do not derive client-side from stale state
- Three-role signoff strip (technician auto-applied, supervisor, safety officer) maps to `mwo_signoffs` table with role enum

**task_checkoff_modal** step.type variants:
- `"measure"`: Input + unit Select; pass/fail auto-computed in Server Action; persist to `mwo_task_results`
- `"photo"`: S3 upload with `capture="environment"` for mobile camera; URL stored in `mwo_task_photos`
- `"signoff"`: PIN input validates against `user_credentials.pin_hash` in Server Action
- `"check"` (implied): simple checkbox completion

### dashboard.jsx — Real-Time Concerns

The dashboard auto-refreshes every 30s in the prototype (`Data refreshed 18s ago · Auto-refresh 30s`). In production:
- Use Server-Sent Events (SSE) for critical alert strip and active LOTO panel
- KPI grid: ISR (Incremental Static Regeneration) with `revalidate: 30` for less critical tiles
- MTBF sparkline data sourced from 15-OEE `oee_shift_metrics` — read-only cross-module join; cache aggressively

Onboarding card (5 steps, isManager only):
- Step completion computed from DB state checks (asset count > 0, technician count > 0, pm_schedule count > 0, etc.)
- Dismissal stored in `user_preferences.onboarding_dismissed_modules` JSONB column

### assets.jsx — Hierarchy Tree

The asset hierarchy sidebar uses `MNT_ASSET_HIER` with `level` and `parent` fields:
- In production: ltree extension in PostgreSQL; use `@>` operator for ancestor queries
- `visibleHier` filter (collapse/expand) → client-side state only; no server round-trip needed
- `selectedLine` filter → URL param `?line=LINE-01` applied to Drizzle WHERE `assets.line = ?`
- Tree toggle state stored in `useState(Set)` → consider `localStorage` persistence for UX

### work-orders.jsx — Kanban View

Kanban columns in `wr_list_page` are prototype-level only (no drag-and-drop):
- Production: use `@hello-pangea/dnd` (`DragDropContext`, `Droppable`, `Draggable`)
- Column membership computed server-side; card drop triggers Server Action updating `work_requests.status`
- Kanban card click behavior differs by column (submitted → triage modal, others → mwo detail)

`mwo_detail_page` state machine strip (`stateSteps`):
- State transitions (open → in_progress, etc.) each have their own `StateTransitionModal` confirmation
- Production: state machine enforced in `wo_state_machine_v1` rule; Server Action validates allowed transition before persisting

### pm-schedules.jsx — Calendar Views

Hand-rolled calendar math (firstDayOfWeek, daysInMonth, cells array):
- Replace with `date-fns` helpers: `startOfMonth`, `eachDayOfInterval`, `startOfWeek`, `endOfMonth`
- `monthOffset` URL param drives month navigation; `?month=2026-05` format preferred over integer offset
- `eventsMap` keyed by `yyyy-mm-dd` → SQL `GROUP BY next_due_date::date` with array_agg of pm_schedule ids

### spares.jsx — Architecture Boundary

The spare parts module explicitly has no LP picker and no FEFO logic (architecture note at spares_detail line 249-254):
- `qty_on_hand` is a simple integer counter on `spare_parts` table
- Warehouse LP field (`s.whLp`) is a cross-link reference only — navigates to warehouse module but does not control allocation
- `spare_transactions` table records all movements (consume/receipt/adjust) for audit
- Stock by warehouse location is a separate `spare_stock_by_location` view/table, not derived from LP movements

### other-screens.jsx — Calibration Compliance

Calibration module has 21 CFR Part 11 and BRCGS Issue 10 compliance requirements:
- SHA-256 hash computed server-side (crypto.subtle.digest) immediately after S3 upload; stored immutably
- 7-year retention: `cert_retention_until = calibrated_at + interval '7 years'`; enforce via DB policy, not application logic
- FAIL result triggers cross-module event: `calibration.fail` → Quality module creates `quality_hold_candidate` if instrument linked to a CCP
- Export for audit CSV must include: instrument code, calibrated_at, by, standard, test points (ref/measured/tol/inSpec), result, SHA-256, retention_until

### other-screens.jsx — LOTO List Real-Time

Active LOTO count in header and alert banner must reflect live DB state:
- Use SSE subscription on `loto_procedures WHERE status='active'` changes
- Active procedure detail expansion (bottom card) shows first active procedure details; in production, make this expandable per row
- Two-person verification display: `loto_energy_sources.verified_by` + `second_verified_by` from join

### other-screens.jsx — Analytics Cross-Module Reads

`maintenance_analytics_page` reads from multiple modules:
- MTBF/MTTR trend: `oee_shift_metrics` (15-OEE) — read-only, cache aggressively (ISR 1h)
- Pareto causes: `downtime_events` (08-PRODUCTION) joined with `mwos` on `downtime_event_id`
- PM compliance: `pm_occurrences` with `completed_at IS NOT NULL` ratio over time window
- Per-asset availability: `oee_shift_metrics` filtered by asset_id — read-only from OEE module

---

## Known Bugs (from BACKLOG.md § Maintenance)

| ID | Description | Priority | Affects |
|---|---|---|---|
| BL-MAINT-01 | IoT sensors tab on Asset Detail — placeholder only; needs time-series chart | P2 | asset_detail_page |
| BL-MAINT-02 | LOTO photo evidence currently "Recommended"; awaiting Forza safety sign-off to gate as Required | Medium | loto_clear_modal |
| BL-MAINT-03 | Offline tablet mode — no Service Worker / IndexedDB | P2 | All page-level components |
| BL-MAINT-04 | Two-person LOTO remote confirmation flow — prototype assumes separate sessions | Medium | loto_apply_modal, loto_list_page |
| BL-MAINT-05 | Skills Matrix PDF export with attached cert scans — button stub only | Low | technicians_list_page |
| BL-MAINT-06 | OEE auto-PM trigger settings toggle — rendered disabled | P2 | maintenance_settings_page |
| BL-MAINT-07 | Purchase Request in Spare Reorder — internal notification only; P2 integration with 04-Planning PO | Medium | spare_reorder_modal |

Additional shared bug from BACKLOG.md:
- **BL-PROD-05** (HIGH): `.btn-danger` missing from shared.css — destructive confirms in loto_clear_modal and delete_confirm_modal fall back to primary styling. Fix at `_shared/shared.css` before production translation.

---

## Translation Priority Order (suggested)

1. **Shared primitives first** (Dialog, Field/FormField, Badge variants, DueCell) — unblocks all modal work
2. **delete_confirm_modal** (30 min) — simplest, validates the AlertDialog pattern
3. **criticality_override_modal + spare_adjust_modal + pm_occurrence_skip_modal** (45-60 min each) — simple override-with-reason pattern
4. **asset_edit_modal + mwo_create_modal + wr_create_modal** (75-90 min each) — core CRUD forms
5. **wr_triage_modal + mwo_complete_signoff_modal** (90-120 min each) — multi-path + pre-condition gates
6. **calibration_reading_modal + loto_apply_modal + loto_clear_modal** (120 min each) — safety-critical, highest review burden
7. **pm_schedule_edit_wizard** (150 min) — multi-step wizard, needs Stepper primitive ready
8. **List pages** — after modals; share filter/table patterns
9. **Detail pages** — after list pages; depend on all modals
10. **Dashboard + Analytics** — last; depend on all other data queries being available
