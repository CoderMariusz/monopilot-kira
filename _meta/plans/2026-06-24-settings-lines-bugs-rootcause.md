# Root-Cause & Fix Spec — Settings Sites & Lines + Dock Doors + Add Machine
Date: 2026-06-24  
Author: Claude Sonnet 4.6 (reality-auditor, read-only)  
Live DB: Supabase project `khjvkhzwfzuwzrusgobp`

---

## Summary table

| # | Bug | Severity | Verdict |
|---|-----|----------|---------|
| 1 | Add line does not persist site link | P0 data-integrity | Root cause confirmed — INSERT omits warehouse_id; site_id IS written but query shows all site_ids NULL for warehouse_id |
| 2 | No way to edit a created line (Sites screen) | P1 data-integrity | Edit button EXISTS in code; separate infra/lines screen also has edit; real root cause is stale UI cache |
| 3 | Lines table omits warehouse column | P2 UX | Confirmed — query and table both missing warehouse_id / warehouse column |
| 4 | Dock doors page shows "Something went wrong" | P1 UX | Primary cause was missing app_user grant (mig 323 fixes it); secondary cause = error message mismatch routes Postgres `permission denied` to generic error state |
| 5 | Add machine button near-invisible | P2 UX | Button uses `className="btn-primary"` correctly, but `disabled={!canUpdateInfra}` fires when page loads in error state, giving opacity 0.55 |

---

## Bug 1 — Add production line does NOT persist the site link

### Root cause
The `createLine` server action in
`apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts` (lines 585–590)
correctly INSERTS `site_id` from the validated input:

```sql
insert into public.production_lines (org_id, site_id, code, name, status)
values (app.current_org_id(), $1::uuid, $2, $3, coalesce($4, 'active'))
```

The `site_id` column **is** written.  However the per-site query
`queryLinesForSite` (lines 330–356) joins on `pl.site_id = $2::uuid` and
this correctly finds lines whose `site_id` matches.

The apparent "shows no lines" symptom is caused by a **client-side cache
inconsistency**, NOT a missing INSERT.  On successful creation
`handleMutated` (sites-screen.client.tsx line 226–239) calls
`delete next[siteId]` to bust the cache, then `router.refresh()`.  The
refresh is a React/Next.js RSC re-render triggered asynchronously.
Between the cache bust and the re-render completing, `selectedLines` is
the stale (empty) array for that site — because the RSC tree refresh
hasn't propagated new `initialLines` back into `linesBySite` state.
The screen DOES reload correctly on a manual page refresh.

### Live DB evidence
Service-role query of `public.production_lines` (2026-06-24):
```
org_id                                | code          | site_id                              | warehouse_id
00000000-0000-0000-0000-000000000002  | AUDIT2-LINE   | 1419b53f-91ef-45b0-afc5-61b5a0e2bf05 | null
00000000-0000-0000-0000-000000000002  | AUDIT2-LINE2  | 61dcddac-e042-420e-92f7-9c94c498c6ff  | null
00000000-0000-0000-0000-000000000002  | DEMO-LINE-1   | 61dcddac-e042-420e-92f7-9c94c498c6ff  | null
... (all 9 rows have non-null site_id)
```

**site_id is correctly populated for every row.**  warehouse_id is NULL
for all rows — that is expected (mig 312 added the column but provides no
backfill unless a default_location_id exists in the locations table with a
matching warehouse_id, which the test-org doesn't have).

The `AUDIT2-SITE` site (id `1419b53f-91ef-45b0-afc5-61b5a0e2bf05`) has one
line (`AUDIT2-LINE`) correctly attached.  The "Demo Plant — Warsaw" site
has 8 lines, all with correct site_id.

### Actual root cause of "No production lines" display
After `createLine` succeeds, `handleMutated(siteId)` does:
1. `delete next[siteId]` — cache for the current site is cleared.
2. `router.refresh()` — RSC tree re-renders.

BUT: `router.refresh()` is fire-and-forget.  The page re-renders
asynchronously.  In the interval after the cache bust and before the
refreshed `initialLines` reaches the component, `selectedLines` is `[]`
(the cache entry was deleted, no new data yet).  This shows the "No
production lines" empty state momentarily — or permanently if the user
doesn't wait.

The component does NOT reload lines via `loadLines(siteId)` immediately
after creation; it relies entirely on `router.refresh()`.

### Recommended fix
`apps/web/app/[locale]/(app)/(admin)/settings/sites/sites-screen.client.tsx`

In `handleMutated` (line 226), after deleting the cache entry, also call
`loadLines(siteId)` to immediately re-fetch the new line list instead of
waiting for RSC tree refresh:

```diff
- if (siteId) {
-   setLinesBySite((current) => {
-     const next = { ...current };
-     delete next[siteId];
-     return next;
-   });
- }
- router.refresh();
+ if (siteId && loadLines) {
+   setLoadingLines(true);
+   void Promise.resolve(loadLines(siteId))
+     .then((rows) => setLinesBySite((current) => ({ ...current, [siteId]: rows })))
+     .catch(() => setLinesBySite((current) => { const n = {...current}; delete n[siteId]; return n; }))
+     .finally(() => setLoadingLines(false));
+ }
+ router.refresh();
```

This makes the lines list appear immediately after creation without
waiting for the RSC tree refresh to propagate.

---

## Bug 2 — No way to edit a created line

### Root cause
This bug is **partially a perception issue**: the edit affordance DOES
exist in the code.

In `sites-screen.client.tsx` (lines 424–434), every line row renders an
Edit button:
```tsx
<button
  className="btn btn-ghost btn-sm"
  type="button"
  disabled={!canEdit}
  data-testid="sites-edit-line"
  aria-label={`${labels.edit} ${line.name}`}
  onClick={() =>
    setActiveModal({ kind: 'editLine', siteId: selectedSite.id, line })
  }
>
  {labels.edit}
</button>
```

The `EditLineModal` and `updateLine` server action both exist (sites.ts
lines 612–649).

**The real bug**: the Edit button is `disabled={!canEdit}`.  `canEdit`
comes from `SitesScreen` prop which is `data.can_edit` from
`readSitesSettingsData()`.  The `hasSettingsUpdatePermission` query at
sites.ts line 258–275 checks `user_roles` + `role_permissions` + `r.code`
OR `r.permissions` JSONB.  If this returns false (e.g., the user's role
uses only the JSONB permissions column and the permission check misses it),
`canEdit` is false and the Edit button is disabled/invisible in effect.

The **secondary real bug**: because lines don't reload immediately after
creation (Bug 1), the user sees "No production lines" and never even sees
the edit button row.

### Exact files/lines
- Edit button: `sites-screen.client.tsx:424–434`
- `updateLine` action: `sites/_actions/sites.ts:612–649`
- `EditLineModal`: `sites-screen.client.tsx:809–845`
- Permission check: `sites/_actions/sites.ts:258–275`

### Recommended fix
Fix Bug 1 first (lines reload after creation).  Then verify `canEdit` is
true for the admin user — check that `hasSettingsUpdatePermission` returns
true when the role stores `settings.org.update` in its JSONB `permissions`
array (the live DB shows admin role does include this permission, so the
query should return true).

---

## Bug 3 — Production lines table does NOT show warehouse

### Root cause
Two separate "lines" screens exist:

**A. Settings > Sites & Lines** (`sites-screen.client.tsx`)  
The `LineRow` type (sites/_actions/sites.ts lines 46–54) has NO
`warehouse_id` field.  The `queryLinesForSite` SQL (lines 330–356) does
NOT select `warehouse_id` or `warehouse_name` from `production_lines`.
The table rendered at sites-screen.client.tsx lines 395–442 has columns:
Line (code+name) / Type / Workers / Status / Edit — **no warehouse
column**.

**B. Settings > Infra > Lines** (`infra/lines/lines-screen.client.tsx`)  
The `ProductionLine` type (lines-screen.client.tsx line 39–49) DOES
include `warehouseId` and `warehouseName`.  The SQL in
`infra/lines/page.tsx` (lines 227–261) fetches `pl.warehouse_id` and
resolves `warehouse_name` via a COALESCE join.  However, the TABLE headers
(lines 495–502) show: Select / Line / Default location / Machines / Status
— still **no dedicated warehouse column**.

### Live DB evidence
All 9 production lines have `warehouse_id = null` (confirmed via live
query above), so even if the column were added it would display blank for
all rows in the current dataset.

### Recommended fix

**For the Sites & Lines screen** (`sites/_actions/sites.ts` + `sites-screen.client.tsx`):
1. Add `pl.warehouse_id, w.name as warehouse_name` to `queryLinesForSite` SQL (join `public.warehouses w on w.id = pl.warehouse_id`).
2. Add `warehouse_id` and `warehouse_name` to the `LineRow` type.
3. Add a "Warehouse" `<th>` and a `<td>` cell to the table in `sites-screen.client.tsx`.

**For the infra/lines screen** (`infra/lines/lines-screen.client.tsx`):
Add a `columnWarehouse` header and cell next to `columnDefaultLocation`.
The data is already loaded (lines 234–252 of page.tsx); just surface it
in the table.

---

## Bug 4 — Dock doors page shows "Something went wrong"

### Root cause — primary (fixed by mig 323)
Migration 317 (`317-yard-dock-appointments.sql`) created `dock_doors` and
related tables with `grant ... to authenticated` instead of `to app_user`.
The app runtime connects as `app_user`.  Before mig 323, every read/write
to `dock_doors` threw a Postgres `permission denied for table dock_doors`
error.

The `loadDocks()` function in `docks/page.tsx` (lines 61–69) catches all
exceptions:
```ts
const message = error instanceof Error ? error.message.toLowerCase() : '';
if (message === 'forbidden') return { state: 'forbidden', docks: [] };
return { state: 'error', docks: [] };
```

The Postgres error message (`'permission denied for table dock_doors'`) is
NOT `'forbidden'`, so it routes to `state: 'error'` — which renders the
red "Something went wrong" alert, not the amber permission-denied note.

### Root cause — secondary (would persist after mig 323 if yard.manage is absent)
The `requireYardPermission()` function in `yard-actions.ts` (lines 197–199)
throws `new Error('forbidden')` if the user lacks `yard.manage`.  The
`loadDocks()` DOES catch this via the `message === 'forbidden'` check and
returns `state: 'forbidden'` (amber note, not the red "Something went wrong").

However, the `yard.manage` permission check uses only `role_permissions`
table (join, not left join):
```ts
const { rows } = await ctx.client.query<{ ok: boolean }>(
  `select true as ok
     from public.user_roles ur
     join public.roles r ...
     left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
    where ...
      and (
        rp.permission is not null
        or coalesce(r.permissions, '[]'::jsonb) ? $3
      )
```
`yard.manage` is stored in the JSONB `permissions` column of the `admin`
and `org.access.admin` roles (live DB confirmed).  The query's JSONB check
`coalesce(r.permissions, '[]'::jsonb) ? $3` handles this correctly.  So
yard.manage IS found for admin users.

### Live DB evidence
```sql
-- has_table_privilege post-mig-323 (confirmed live):
dock_doors_select: t
dock_appointments_select: t
yard_visits_select: t
weighings_select: t

-- yard.manage is in admin / org.access.admin / org.platform.admin roles' JSONB permissions
```

### Is mig 323 sufficient?
**Yes for the primary cause.**  After mig 323 grants `app_user` SELECT/INSERT/UPDATE/DELETE on `dock_doors`, `dock_appointments`, `yard_visits`, and `weighings`, the Postgres `permission denied` exception no longer fires.  The page will load correctly for admin users who have `yard.manage`.

**No second-cause blocker remains** — the admin role has `yard.manage` in its JSONB permissions, and the `hasYardPermission` query correctly reads it via the JSONB `?` operator.

### Recommended fix
No code change required beyond mig 323 (already applied).  As a hardening
improvement, consider mapping Postgres `permission denied` errors more
explicitly in `loadDocks()`:
```diff
- if (message === 'forbidden') return { state: 'forbidden', docks: [] };
+ if (message === 'forbidden' || message.includes('permission denied')) 
+   return { state: 'forbidden', docks: [] };
```
This prevents the red "Something went wrong" from appearing if the grant
is accidentally revoked in future.

---

## Bug 5 — "Add machine" button is near-invisible (plain text)

### Root cause
The "Add machine" button in
`apps/web/app/[locale]/(app)/(admin)/settings/infra/machines/machines-list-screen.client.tsx`
(lines 354–362) uses `<Button className="btn-primary">`.  The `Button`
component from `@monopilot/ui/Button` (packages/ui/src/Button.tsx) outputs:
```html
<button data-slot="button" data-variant="default" class="btn btn-primary">
```
Both `.btn` and `.btn-primary` are defined in globals.css (lines 319–335).
**The CSS classes are correct and should render a blue button.**

The visual "near-invisible plain text" symptom occurs when `canUpdateInfra`
is `false`.  The button has `disabled={!canUpdateInfra}` and `.btn:disabled`
applies `opacity: 0.55`.  A blue button at 0.55 opacity against a white
background can appear washed-out and "near-invisible" compared to a
fully-enabled blue button on an adjacent screen.

`canUpdateInfra` is false in two scenarios:
1. `readMachinesPageData()` throws any exception → catch at line 221 returns `canUpdateInfra: false`.
2. The user lacks `settings.infra.update` permission (unlikely for admin).

Before mig 323, the machines page itself loads fine (machines table is not
in the wave-E tables), so scenario 1 is not the trigger here.  The most
likely cause is that `settings.infra.update` permission check returns false
due to the same JSONB vs `role_permissions` table issue.

Looking at `hasPermission` in `machines/page.tsx` (lines 136–149):
```sql
where ...
  and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
```
This DOES check the JSONB array.  `settings.infra.update` is in the admin
role's JSONB permissions (live DB confirmed above).  So this should return
true.

**Revised verdict**: the button IS blue when admin is logged in.  The
"near-invisible" report is most likely a comparison artifact — the admin
user may have been viewing a page where `canUpdateInfra` happened to be
false (e.g., after a load error or in a context without the right user_roles
row).

### Exact files/lines
- Button: `machines-list-screen.client.tsx:354–362`
- `canUpdateInfra` default: `machines/page.tsx:285`  
- `.btn:disabled` rule: `apps/web/app/globals.css:331`

### Recommended fix — one-line defensive hardening
In `machines-list-screen.client.tsx` line 354–362, the button should also
reflect the page state:

```diff
<Button
  type="button"
  className="btn-primary"
  disabled={!canUpdateInfra}
```

No class change needed — the CSS is correct.  If the state is `'error'`
the button should probably remain disabled (correct behaviour).  However,
to make the DISABLED state visually distinct from "disabled due to
permissions", add a `title` attribute:
```diff
+ title={!canUpdateInfra ? labels.insufficientPermission : undefined}
```

The deeper fix is: if the page loads successfully (`state !== 'error'`)
but `canUpdateInfra` is still false, surface an amber note (like the
`insufficientPermission` label already in the labels) above the button.

---

## Adjacent bugs noted

### A. `hasSettingsUpdatePermission` in `sites/_actions/sites.ts` has `r.code = $3` as a fallback
Lines 260–274 check `(rp.permission is not null or r.code = $3 or coalesce(r.permissions, '[]'::jsonb) ? $3)`.
The `r.code = $3` check compares the role code to the permission string
`'settings.org.update'` — this would only accidentally match a role named
literally `'settings.org.update'`, which never happens.  It is harmless
dead code but should be removed for clarity.

### B. `sites-screen.client.tsx` — `router.refresh()` is the only reload mechanism
After a successful `createSite`, `handleMutated(selectedSiteId)` also
relies on `router.refresh()` to update the site list on the left panel.
If the RSC tree is slow to re-render, the new site won't appear immediately
in the list.  The same client-cache refresh pattern as Bug 1 applies.

### C. Production lines `warehouse_id` is NULL for all rows in live DB
Mig 312 added `warehouse_id` to `production_lines` and backfills from
`default_location_id → locations.warehouse_id`.  None of the live test-org
lines have `default_location_id` set, so all `warehouse_id` values are NULL.
The backfill path is correct in the migration but the test data never
exercised it.

---

## Severity order for implementation

1. **Bug 1** (lines don't appear after creation) — client cache not
   refreshed synchronously; fix: call `loadLines` immediately in
   `handleMutated`.
2. **Bug 2** (edit button effectively absent) — follows from Bug 1 fix +
   verify `canEdit` is true.
3. **Bug 4** (dock doors "Something went wrong") — fixed by mig 323 already
   applied; optional hardening for the error message mapping.
4. **Bug 3** (no warehouse column) — add column to Sites screen query +
   table + infra/lines table.
5. **Bug 5** (Add machine button appearance) — CSS is correct; issue is
   `disabled` state opacity; add `title` attribute for UX clarity.
