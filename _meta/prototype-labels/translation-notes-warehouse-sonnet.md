# Warehouse Module — Prototype Translation Notes
**Scanned by:** claude-sonnet-4-6  
**Date:** 2026-04-23  
**Files scanned:** modals.jsx, dashboard.jsx, lp-screens.jsx, grn-screens.jsx, movement-screens.jsx, other-screens.jsx, shell.jsx  
**Total labelled components:** 29

---

## All Component Labels

| Label | File | Lines | Type | Domain | Est. (min) |
|---|---|---|---|---|---|
| `grn_from_po_wizard` | modals.jsx | 24-280 | wizard | GRN | 240 |
| `grn_from_to_modal` | modals.jsx | 283-331 | modal | GRN | 90 |
| `stock_move_modal` | modals.jsx | 334-445 | modal | Movement | 90 |
| `lp_split_modal` | modals.jsx | 448-506 | modal | LP | 75 |
| `lp_merge_modal` | modals.jsx | 509-586 | wizard | LP | 100 |
| `qa_status_change_modal` | modals.jsx | 589-664 | modal | LP | 70 |
| `label_print_modal` | modals.jsx | 667-745 | modal | LP | 90 |
| `reserve_lp_modal` | modals.jsx | 748-805 | modal | LP | 65 |
| `release_reservation_modal` | modals.jsx | 808-852 | modal | LP | 55 |
| `fefo_deviation_modal` | modals.jsx | 855-913 | modal | Inventory | 65 |
| `destroy_scrap_lp_modal` | modals.jsx | 916-963 | modal | LP | 65 |
| `use_by_override_modal` | modals.jsx | 966-1007 | modal | LP | 60 |
| `location_edit_modal` | modals.jsx | 1010-1048 | modal | Location | 55 |
| `cycle_count_adjustment_modal` | modals.jsx | 1051-1103 | modal | Inventory | 60 |
| `state_transition_confirm_modal` | modals.jsx | 1106-1138 | modal | LP | 50 |
| `force_unlock_scanner_modal` | modals.jsx | 1141-1159 | modal | Warehouse | 30 |
| `warehouse_dashboard` | dashboard.jsx | 1-213 | page-layout | Warehouse | 200 |
| `lp_list_page` | lp-screens.jsx | 3-198 | page-layout | LP | 180 |
| `lp_detail_page` | lp-screens.jsx | 205-558 | page-layout | LP | 240 |
| `grn_list_page` | grn-screens.jsx | 3-77 | page-layout | GRN | 80 |
| `grn_detail_page` | grn-screens.jsx | 83-157 | page-layout | GRN | 70 |
| `stock_movement_list_page` | movement-screens.jsx | 3-136 | page-layout | Movement | 130 |
| `reservations_list_page` | movement-screens.jsx | 140-221 | page-layout | LP | 80 |
| `inventory_browser_page` | other-screens.jsx | 3-152 | page-layout | Inventory | 150 |
| `locations_hierarchy_page` | other-screens.jsx | 156-264 | page-layout | Location | 130 |
| `genealogy_traceability_page` | other-screens.jsx | 268-359 | page-layout | LP | 180 |
| `expiry_management_page` | other-screens.jsx | 363-480 | page-layout | LP | 130 |
| `warehouse_settings_page` | other-screens.jsx | 484-631 | page-layout | Warehouse | 160 |
| `app_sidebar` | shell.jsx | 3-22 | sidebar | Warehouse | 40 |
| `app_topbar` | shell.jsx | 24-41 | sidebar | Warehouse | 50 |
| `warehouse_sub_nav` | shell.jsx | 43-67 | sidebar | Warehouse | 35 |

**Total estimated translation time: ~3,075 minutes (~51 hours)**

---

## Key Translation Patterns

### 1. Modal primitives
Every modal uses a `window.Modal` prototype wrapper. In production this maps to `@radix-ui/react-dialog` (`Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`). The prototype's `foot` prop maps to `DialogFooter`. Modal sizes (`sm`, `default`, `wide`, `fullpage`) map to Tailwind `max-w-*` overrides on `DialogContent`.

### 2. Form state management
All prototype modals use inline `React.useState` for form data (often a single object like `const [form, setForm] = React.useState({...})`). In production every form must use `react-hook-form` + `zodResolver`. The Zod schema is the canonical source of truth for validation — derived booleans like `isPartial`, `needsApproval`, `reasonRequired`, and `valid` all become Zod `refine` or `superRefine` rules, not client-side logic.

### 3. Mock data → server fetches
Every `WH_*` constant (WH_LPS, WH_GRNS, WH_MOVEMENTS, WH_KPIS, etc.) is a hardcoded array in the prototype. In production these are Drizzle ORM queries run in Next.js Server Components. Page-level data fetching should be parallelised with `Promise.all`. Dashboard KPIs should use `unstable_cache` with a 60-second TTL (matching `WH_SETTINGS.general.dashboardCacheTtl`).

### 4. Approval gates (>10% threshold)
Three components implement the >10% adjustment approval gate: `stock_move_modal` (M-03), `cycle_count_adjustment_modal` (M-14), and the manager approval tab in `stock_movement_list_page`. The pattern is consistent: compute `deltaPct`, if `> 10` change the submit button label to "Submit for approval" and the Server Action path writes to a `movement_approvals` table instead of applying directly. The same gate appears in the warehouse settings (V-WH-MOV-004). Centralise this threshold as a tenant-level setting.

### 5. RBAC gates
The prototype uses a `role` prop with values `"Operator" | "Manager" | "QA" | "Admin"`. In production RBAC must be enforced server-side. Client components should never render sensitive data based solely on a client-side role. Pattern: derive `hasAccess` boolean in the Server Component from the session, pass it as a prop to client islands. Server Actions must re-check permissions before executing mutations.

### 6. Reason code + free text pattern
Many modals use a two-level reason pattern: `reason` (select, required) + `reasonText` (textarea, required only when `reason === "other"`, min 10 chars). This pattern appears in M-03, M-06, M-09, M-10, M-11, M-12, M-14, M-15. Extract as a reusable `ReasonField` compound component in production (wraps shadcn `FormField` + `Select` + conditional `Textarea`).

### 7. Ltree location paths
The `Ltree` primitive (`["WH-Factory-A", "Cold", "B3"]` → `WH-Factory-A › Cold › B3`) is used across almost every screen. In production, implement as a small utility component using `Array.join` with a `›` separator and Tailwind classes for ancestor (muted) vs leaf (normal) styling. The DB column type is PostgreSQL `ltree`; queries use `@>` operator for subtree lookups.

### 8. Expiry colour coding
`ExpiryCell` uses three tiers: `< 0 days + use_by` = expired/blocked (red), `<= 7 days` = urgent (red), `<= 30 days` = amber, otherwise green. In production compute `days_until_expiry` server-side (DB column or computed in SELECT) and pass to the client; never compute date math client-side from raw strings to avoid timezone bugs.

### 9. Status badges
`LPStatus`, `QAStatus`, `GRNStatus`, `MoveType`, `ShelfMode` are all thin wrappers around CSS class lookups. In production these map to shadcn `Badge` with `variant` prop or custom `cn()` class maps. Centralise badge maps in a `lib/badges.ts` module.

### 10. URL state and navigation
The prototype uses `onNav("key")` callbacks for all navigation. In production replace with Next.js `Link` components and dynamic routes (e.g. `/warehouse/lps/[id]`). Filter bar state should use `nuqs` for URL search param management to keep state shareable and browser-history-friendly.

### 11. Timeline / activity feeds
Several screens (LP detail state history, GRN status history, dashboard activity feed) use a `.tl-item` CSS pattern. shadcn has no built-in Timeline component. Use a `ul` with `li` items, a vertical `border-left` line on the `ul`, and absolutely-positioned dots on each `li`. Or adopt a community Timeline recipe.

### 12. Side panel detail (Sheet)
`stock_movement_list_page` renders a custom absolute-positioned side panel `.mv-side` for movement detail on row click. In production replace with shadcn `Sheet` (`SheetContent` from the right). This is cleaner, accessible, and handles focus management automatically.

---

## Common Gotchas

1. **BL-PROD-05 — `.btn-danger` missing from production CSS.** Both `destroy_scrap_lp_modal` and `state_transition_confirm_modal` use destructive button styling. Fix the shared CSS before building these modals or both fall back to primary styling, which is a UX regression for irreversible actions.

2. **BL-WH-04 — Label ZPL preview is HTML-only.** `label_print_modal` renders a structured HTML block for the label preview. This is not real ZPL. In production you need to integrate with a label-rendering service that generates a ZPL preview image (or use an HTML-to-ZPL library). The print action itself must POST ZPL to the printer service, not a DOM element.

3. **BL-WH-01 — Cycle count is a P1 stub.** `cycle_count_adjustment_modal` (M-14) shows a "Full cycle count workflow is available in Phase 2" banner. The modal is a basic qty adjustment only. Do not build the full cycle count plan/assign/reconcile flow from this modal alone — it requires a dedicated Phase 2 feature with its own screens.

4. **BL-WH-02 — Warehouse Settings tabs.** Two tabs in `warehouse_settings_page` (Locations, Integrations) render `<ScaffoldedScreen/>` placeholders. The full location CRUD is on the Locations hierarchy page; integrations admin lives in the global Settings module (SET-040/041).

5. **BL-WH-05 — Inventory By Location is a flat table.** The By Location view in `inventory_browser_page` only shows L2 locations as a flat table. The spec calls for a full ltree `@>` hierarchical browser. Plan for a recursive tree expansion using a CTE query and a recursive client component.

6. **BL-WH-06 — LP ext_jsonb custom fields are read-only.** The LP detail custom fields panel only shows existing fields. The schema extension editor is a Phase 2 feature.

7. **GRN from PO wizard is the most complex component (~240 min).** It combines a 3-step Stepper, a searchable PO list, a dynamic multi-LP row grid per PO line with individual quantity validation, and a review/preview step. Translate this last after establishing the shared form primitives and Modal wrapper.

8. **Mock submit uses `setTimeout` as delay.** All prototype submit handlers use `await new Promise(r => setTimeout(r, 900))` to simulate async. In production these are Server Actions; loading state comes from `useFormStatus` or `useTransition`. Remove all fake delays.

9. **Hardcoded Polish strings throughout.** Product names (`Wieprzowina kl. II`, `Pieprz czarny mielony`, `Kiełbasa śląska`), supplier names, location names, and some UI labels are hardcoded in Polish. These are mock data and must be replaced with real DB data. Static UI labels must go through next-intl.

10. **Genealogy DAG needs a graph library.** The `.gen-canvas` / `.gen-node` CSS indentation in `genealogy_traceability_page` and the LP detail genealogy tab only works for linear chains. For multi-parent / multi-child graphs (which FSMA 204 traceability requires) you must use `react-flow` or `dagre-d3`. See BACKLOG.md Q2 note.
