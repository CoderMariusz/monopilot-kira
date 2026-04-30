# Translation Notes — Technical Module (BOM, Specs, Formulations)

Prototype scan date: 2026-04-23
Source files scanned: `modals.jsx`, `bom-list.jsx`, `bom-detail.jsx`, `other-screens.jsx`
Backlog cross-reference: `BACKLOG.md` § Technical (BL-TEC-01..04)

---

## Summary

| # | Label | File | Lines | Type | Domain | Est. min |
|---|-------|------|-------|------|--------|----------|
| 1 | product_create_modal | modals.jsx | 22–136 | wizard | FA | 120 |
| 2 | archive_product_modal | modals.jsx | 138–163 | modal | FA | 45 |
| 3 | bom_version_save_modal | modals.jsx | 168–190 | modal | BOM | 40 |
| 4 | bom_component_add_modal | modals.jsx | 192–243 | modal | BOM | 75 |
| 5 | delete_bom_version_modal | modals.jsx | 245–266 | modal | BOM | 35 |
| 6 | routing_step_add_modal | modals.jsx | 271–304 | modal | Recipe | 40 |
| 7 | allergen_declaration_modal | modals.jsx | 309–347 | modal | Allergen | 60 |
| 8 | eco_change_request_modal | modals.jsx | 352–414 | wizard | Recipe | 90 |
| 9 | eco_approval_modal | modals.jsx | 417–455 | modal | Recipe | 50 |
| 10 | spec_review_modal | modals.jsx | 460–483 | modal | Spec | 30 |
| 11 | shelf_life_override_modal | modals.jsx | 486–513 | modal | Spec | 55 |
| 12 | cost_rollup_recompute_modal | modals.jsx | 518–537 | modal | BOM | 30 |
| 13 | d365_item_sync_confirm_modal | modals.jsx | 542–559 | modal | FA | 25 |
| 14 | d365_drift_resolve_modal | modals.jsx | 562–598 | modal | BOM | 65 |
| 15 | tech_modal_gallery | modals.jsx | 619–655 | page-layout | FA | 20 |
| 16 | bom_list | bom-list.jsx | 3–95 | table | BOM | 80 |
| 17 | kpi_tile | bom-list.jsx | 97–106 | dashboard-tile | BOM | 20 |
| 18 | bom_detail_page | bom-detail.jsx | 3–60 | tabs | BOM | 60 |
| 19 | bom_ingredients_tree_tab | bom-detail.jsx | 63–152 | table | BOM | 90 |
| 20 | bom_cost_panel | bom-detail.jsx | 154–206 | sidebar | BOM | 45 |
| 21 | bom_routing_tab | bom-detail.jsx | 209–249 | table | Recipe | 40 |
| 22 | bom_process_params_tab | bom-detail.jsx | 252–307 | table | Recipe | 50 |
| 23 | bom_costs_tab | bom-detail.jsx | 310–370 | tabs | BOM | 55 |
| 24 | bom_versions_tab | bom-detail.jsx | 373–468 | tabs | BOM | 70 |
| 25 | bom_graph_tab | bom-detail.jsx | 471–544 | dashboard-tile | BOM | 120 |
| 26 | bom_recipe_sheet_tab | bom-detail.jsx | 551–603 | page-layout | Recipe | 45 |
| 27 | routings_screen | other-screens.jsx | 4–34 | table | Recipe | 35 |
| 28 | work_centers_screen | other-screens.jsx | 37–71 | dashboard-tile | Recipe | 40 |
| 29 | specs_screen | other-screens.jsx | 74–108 | table | Spec | 35 |
| 30 | allergen_matrix_screen | other-screens.jsx | 111–159 | table | Allergen | 65 |
| 31 | eco_screen | other-screens.jsx | 180–227 | table | Recipe | 40 |
| 32 | history_screen | other-screens.jsx | 230–263 | table | BOM | 35 |
| 33 | maintenance_screen | other-screens.jsx | 266–311 | table | Recipe | 45 |
| 34 | tooling_screen | other-screens.jsx | 314–352 | table | Recipe | 35 |
| 35 | tech_dashboard_screen | other-screens.jsx | 370–429 | page-layout | BOM | 90 |
| 36 | materials_list_screen | other-screens.jsx | 432–480 | table | Formulation | 50 |
| 37 | material_detail_screen | other-screens.jsx | 483–605 | tabs | Formulation | 85 |
| 38 | nutrition_screen | other-screens.jsx | 608–661 | table | Spec | 55 |
| 39 | costing_screen | other-screens.jsx | 664–712 | dashboard-tile | BOM | 60 |
| 40 | shelf_life_screen | other-screens.jsx | 715–758 | table | Spec | 50 |
| 41 | cost_history_screen | other-screens.jsx | 761–820 | table | BOM | 40 |
| 42 | traceability_screen | other-screens.jsx | 823–901 | page-layout | LP | 75 |
| 43 | d365_status_screen | other-screens.jsx | 904–935 | dashboard-tile | FA | 45 |
| 44 | d365_mapping_screen | other-screens.jsx | 938–978 | table | FA | 40 |
| 45 | d365_drift_screen | other-screens.jsx | 981–1022 | table | BOM | 55 |
| 46 | d365_log_screen | other-screens.jsx | 1025–1051 | table | FA | 35 |
| 47 | page_header | other-screens.jsx | 354–363 | page-layout | BOM | 15 |

**Total estimated translation time: ~2,375 minutes (~40 hours)**

---

## Cross-Cutting Patterns

### 1. Global state → Server Components + Drizzle queries

Every prototype file reads from global window variables (`BOM_LIST`, `ROUTING`, `MATERIALS`, `D365_STATUS`, etc.). Production equivalents must:

- Run Drizzle queries in Next.js Server Components or Route Handlers
- Pass typed results as props to Client Components
- Use Suspense boundaries for independent data fetching
- Move filter state to URL searchParams for shareability and SSR

### 2. Modal primitives → @radix-ui/react-dialog + shadcn Dialog

All modals wrap a shared `Modal` primitive from `_shared/modals.jsx`. Production mapping:

| Prototype primitive | Production equivalent |
|--------------------|-----------------------|
| `Modal` | `@radix-ui/react-dialog` + shadcn `Dialog` |
| `Stepper` | Custom stepper built from shadcn primitives with `aria-current='step'` |
| `Field` | shadcn `FormField` + `FormLabel` + `FormMessage` via `react-hook-form` |
| `ReasonInput` | shadcn `Textarea` with character count; validated by zod `.min(10)` |
| `Summary` | shadcn `dl`/`dt`/`dd` list or a read-only key-value Card |

### 3. Form validation: inline booleans → zod + react-hook-form

The prototype uses inline boolean validation (e.g. `valid = reason.length >= 10 && ack`). Production must:

- Define a zod schema per modal (e.g. `archiveProductSchema`, `bomVersionSaveSchema`)
- Use `useForm({ resolver: zodResolver(schema) })` from `react-hook-form`
- Surface `FieldErrors` under each field via `FormMessage`
- Never disable the submit button as the only validation feedback — also show inline errors

### 4. Server Actions pattern

All `onConfirm` callbacks become Next.js Server Actions:

```
'use server'
export async function saveBomVersion(input: BomVersionSaveInput) {
  const session = await getServerSession()
  if (!can(session, 'edit', 'BOM')) throw new Error('Forbidden')
  const data = bomVersionSaveSchema.parse(input)
  await db.insert(bomVersions).values(data)
  await emitOutboxEvent('bom.version_saved', { bomId: data.bomId })
}
```

Always: (1) authenticate, (2) RBAC check, (3) zod parse, (4) DB write, (5) emit outbox event.

### 5. Hardcoded Polish strings → next-intl

Every hardcoded Polish string in the prototype (`np. Kiełbasa śląska...`, `gorczyca (ślad ryzyka)`, etc.) must become a `next-intl` key. String structure convention: `{module}.{screen}.{element}.{variant}`.

### 6. Inline styles → Tailwind utility classes

The prototype uses extensive inline styles (`style={{ fontSize: 12, color: 'var(--muted)' }}`). Production:

- Replace all inline styles with Tailwind classes
- Use `cn()` (clsx + twMerge) for conditional classes
- Use `cva()` (class-variance-authority) for multi-variant components (Badge, KPI tile tone)
- Define CSS custom properties in `globals.css` only for design tokens

### 7. CSS grid layouts → Tailwind Grid

| Prototype CSS class | Tailwind production equivalent |
|--------------------|-------------------------------|
| `.bom-grid` | `grid grid-cols-[100px_1fr_120px_60px_80px_60px_100px_80px_24px]` |
| `.bom-split` | `grid grid-cols-[1fr_280px] gap-4` |
| `.ff-inline` | `flex gap-4` |
| `.page-head` | `flex items-start justify-between mb-6` |
| `.tabs-bar` | shadcn `TabsList` |
| `.gallery-grid` | `grid grid-cols-3 gap-4` |

### 8. `<Status>` component → shadcn Badge with variant map

The prototype uses a `<Status s="active" />` component. Production:

```typescript
const statusVariant: Record<string, BadgeVariant> = {
  active: 'default',
  draft: 'secondary',
  review: 'outline',
  archived: 'secondary',
  closed: 'secondary',
}
```

---

## Known Bugs (from BACKLOG.md § Technical BL-TEC-01..04)

| ID | Severity | Description | Affected components |
|----|----------|-------------|---------------------|
| BL-TEC-01 | Medium | `Item.allergens[]` unmapped to D365 (MIG-D365-ALLG-01) — values lost on push | `d365_mapping_screen`, `d365_drift_resolve_modal`, `d365_drift_screen` |
| BL-TEC-02 | Medium | Traceability screen is static on LP-2026-04-19-00142 — not wired to WO_LIST | `traceability_screen` |
| BL-TEC-03 | P2 | MODAL-NUTRITION-CALC not built — 'Open Nutrition Calculator' link has no target | `nutrition_screen` |
| BL-TEC-04 | Medium | Shelf-life regulatory preset switch not wired — override must trigger ECO creation | `shelf_life_override_modal`, `shelf_life_screen` |
| BL-PROD-05 | HIGH | `.btn-danger` missing from production.css — destructive confirms fall back to primary styling (affects Archive, Delete BOM version, ECO Reject, D365 Drift Apply) | `archive_product_modal`, `delete_bom_version_modal`, `eco_approval_modal`, `d365_drift_resolve_modal` |

---

## High-Complexity Components — Additional Notes

### `bom_ingredients_tree_tab` (90 min)

The recursive `renderRow` function is the most complex pattern in the technical module. Production implementation must:

1. Use TanStack Table with `getExpandedRowModel()` and typed row data
2. Support three `costLayout` variants: `side` (CostPanel aside), `inline` (percentage bar column), `drawer` (Sheet component)
3. Add keyboard navigation: expand/collapse with Enter/Space on parent rows
4. The scrap % threshold (>2% = amber warning) must be a named constant, not an inline magic number
5. Total row at the bottom must recompute dynamically from tree data, not be hardcoded as 11.82

### `bom_graph_tab` (120 min)

The CSS flexbox multi-column flow visualization is a prototype placeholder. Production requires:

1. `react-flow` library with dagre layout engine for proper DAG rendering (see BACKLOG.md Q2)
2. Custom node types: `RawMaterialNode`, `SubBomNode`, `ProcessNode`, `CcpProcessNode`, `OutputNode`
3. CCP nodes require red border + extra aria-label warning
4. Edges carry quantity labels; edge thickness scales with `required_qty`
5. The prototype has no panning/zooming — react-flow provides this natively

### `eco_change_request_modal` (90 min)

Two-step wizard with dynamic approver list. Production complexity:

1. Approvers must be fetched dynamically based on selected `impact_scope` — different roles required per impact type
2. The wizard state machine (steps, validation per step) should use `useReducer` or xstate
3. Submitting must create an `eco_requests` row, notify approvers via email (SET-090 templates), and emit an outbox event
4. Consider an auto-draft save mechanism so users don't lose data if the modal is accidentally closed

### `tech_dashboard_screen` (90 min)

The dashboard aggregates data from multiple domains. Production concerns:

1. Each KPI should be a separate Server Component with its own Suspense boundary and loading skeleton
2. The BOM change velocity chart needs real weekly aggregation from `bom_version_history`
3. Active alerts (allergen conflict, cost drift, D365 drift) must come from a dedicated `technical_alerts` table populated by background jobs, not hardcoded
4. The Recent BOM changes table links to individual BOM versions — ensure URLs are stable and deep-linkable

### `product_create_modal` (120 min)

Three-step wizard to create a Finished Article. Production concerns:

1. Step validation must be enforced server-side too — client validation can be bypassed
2. The `FA code` auto-uppercasing should be a zod `.transform()` not a client-side `toUpperCase()` to keep client/server contracts aligned
3. Category and UoM options should come from reference tables, not hardcoded option lists
4. After creation, the product must appear immediately in BOM pickers — invalidate the materials/products cache on success

---

## Shared Dependencies Map

All modals in `modals.jsx` depend on shared primitives from `_shared/modals.jsx`:

```
_shared/modals.jsx
  ├── Modal             → @radix-ui/react-dialog Dialog
  ├── Stepper           → custom StepIndicator (aria-current)
  ├── Field             → shadcn FormField + FormLabel + FormMessage
  ├── ReasonInput       → shadcn Textarea with minLength validation
  └── Summary           → dl/dt/dd semantic list inside Card
```

`KPI` tile from `bom-list.jsx` is reused in:
- `bom-list.jsx` (BOMList KPI strip)
- `other-screens.jsx` (ParamsScreen, MaintenanceScreen, TechDashboardScreen, CostingScreen, ShelfLifeScreen)

Recommend extracting as `components/ui/KpiTile.tsx` before translating any of these screens.

`PageHeader` from `other-screens.jsx` is reused in all 16 adjacent screens. Translate this primitive first (15 min, low risk) to unblock all screen translations.
