# RUN 02/20 — Sites, warehouses, lines, locations and infrastructure correctability

## Verdict

**FAIL — 7 production defects reproduced: 3 P1, 2 P2 and 2 P3.**

Target: `https://monopilot-kira.vercel.app` · deployment `dpl_F8hRCBXB7tdWmNKqMHD7LxnMy3Vm` · commit `2eb57cf7b90c23d4c55afeb01116eaabc3250385` · Vercel state `READY`.

The walk was executed directly in the Codex/Sol Playwright browser as the supplied Apex 22 administrator. The complete temporary site → warehouse → line → three-level location → dock chain was created and mutated through visible UI controls only. Persistence claims were checked after hard navigation/refresh. Product source was read only after browser reproduction to correlate observed behavior.

## Scenario matrix

| Scenario | Result | Evidence / observation |
|---|---|---|
| Site create and durable refresh | PASS | `N17R02` was created with Europe/London, GB and legal-entity data and remained visible after navigation. [created](evidence/R02-02-site-created.yml) |
| Duplicate site code | **FAIL / P3** | A duplicate of `N17R02` was rejected as `This field is required` instead of the implemented duplicate-code message. [error](evidence/R02-03-duplicate-code-wrong-error.yml) |
| Line create/edit/status lifecycle | PASS with fragmented controls | Create, rename, site, warehouse and status persisted. Deactivation was available through Sites & lines/bulk controls, not from the active row's edit status selector. [created](evidence/R02-04-line-created.yml), [inactive](evidence/R02-05-line-edited-inactive.yml) |
| Cross-site line reassignment | PASS | Moving the line to Main Factory changed both site counts and cleared incompatible warehouse/location selections; moving it back restored a same-site warehouse. |
| Line default output location | **FAIL / P1** | Both inactive and active locations could be selected. Save reported success, but the table and reopened dialog remained `—`; hard navigation confirmed no visible persisted value. [selected](evidence/R02-15-active-line-inactive-output-ready.yml), [after refresh](evidence/R02-22-default-output-not-persisted-cleanup.yml) |
| Warehouse create/rename | PASS with correctability defect | Code/site/address creation and name rename worked, but site and address have no edit surface after creation. [create dialog](evidence/R02-06-add-warehouse-ready.yml), [name-only edit](evidence/R02-08-warehouse-rename-only.yml) |
| Warehouse dependency-safe delete | PASS | Deletion was blocked while locations existed and succeeded after bottom-up cleanup. [blocked](evidence/R02-18-warehouse-delete-blocked.yml) |
| Location create/edit/deactivate | PASS | Root and child creation, rename/status editing and refresh all worked. [root](evidence/R02-09-location-zone-created.yml), [child](evidence/R02-10-location-child-created.yml), [inactive parent](evidence/R02-11-location-edited-inactive.yml) |
| Active child under inactive parent | **FAIL / P1** | The server accepted an Active level-3 location under an Inactive level-2 parent. [hierarchy](evidence/R02-12-active-child-under-inactive-parent.yml) |
| Location depth and parent delete gates | PASS | A fourth level was disabled with an explicit max-depth message; a parent with children could not be deleted. [depth](evidence/R02-13-depth-limit-dialog.yml), [delete gate](evidence/R02-14-parent-delete-blocked.yml) |
| Printer settings route | **FAIL / P1** | The whole route consistently crashed at the RSC boundary with reference `3974216983`, including after Try again. [screen](evidence/R02-16-printers-rsc-crash.yml), [console](evidence/R02-printers-console.txt) |
| Dock create/edit/deactivate/delete | PASS with accessibility defect | CRUD and refresh worked, but opening delete emitted a missing DialogTitle accessibility error. [created](evidence/R02-17-dock-created.yml), [delete dialog](evidence/R02-20-dock-delete-dialog.yml), [console](evidence/R02-dock-delete-console.txt) |
| Site rename propagation | PASS | The new site name propagated into the global site selector and warehouse site label without corrupting IDs. [renamed](evidence/R02-19-site-renamed.yml) |
| Cleanup | PASS except retained soft-deleted line | Dock, locations, warehouse and site were deleted bottom-up. The line was moved to Main Factory and left Inactive because no delete action exists. [site absent](evidence/R02-21-cleanup-site-removed.yml), [retained inactive line](evidence/R02-22-default-output-not-persisted-cleanup.yml) |

## Findings

### PF-R02-01 — P1 — Production-line default output location fake-saves into the wrong column

**Reproduction:** Production lines → edit `N17R02L1` → select its warehouse and `R02-ZONE` (also reproduced with inactive `R02-BIN1`) → Save changes → observe `Production line updated` → hard navigate/reopen.

- Expected: the selected default output location appears in the row and is restored in the edit dialog.
- Actual: the row remains `—`, and the reopened selector returns to `— none —`, despite a success banner and durable persistence of other fields from the same save.
- Root cause: the mutation writes `production_lines.default_output_location_id` at [`line.ts:92`](../../../../apps/web/actions/infra/line.ts), while the route read model selects and joins `production_lines.default_location_id` at [`page.tsx:223`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx>). Both columns exist; the UI writes one and reads the other.
- Impact: an administrator receives a false success and cannot configure the output destination used by legacy readers/scanner flows. This is data divergence, not merely stale rendering.
- Evidence: [selection before save](evidence/R02-15-active-line-inactive-output-ready.yml), [hard-navigation truth](evidence/R02-22-default-output-not-persisted-cleanup.yml).

### PF-R02-02 — P1 — Printers route is unusable because an ordinary closure crosses the RSC boundary

**Reproduction:** Settings → Printers, then Try again.

- Expected: printer list/empty/error state with Add printer controls.
- Actual: the global RSC error boundary replaces the screen on every attempt; browser console reports an error while production suppresses its full message.
- Root cause correlation: the Server Component passes an inline wrapper as `deletePrinter` to the client at [`page.tsx:216`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/printers/page.tsx>). Unlike the directly passed `persistPrinter` Server Action, that newly-created closure is not marked `use server` and is not serializable across the RSC boundary. The loader's own query failures are caught into an error state, so they cannot explain the global boundary crash.
- Impact: all printer create/edit/deactivate/delete operations are unavailable in production.
- Evidence: [RSC error screen](evidence/R02-16-printers-rsc-crash.yml), [console](evidence/R02-printers-console.txt).

### PF-R02-03 — P1 — Active storage can be created beneath an inactive parent

**Reproduction:** create `R02-ZONE` → create child `R02-BIN1` → edit `R02-BIN1` to Inactive → click + Child → leave the default Active checkbox enabled → create `R02-SUB1`.

- Expected: child creation is blocked, defaults inactive, or requires the parent to be reactivated.
- Actual: `R02-SUB1` is accepted as Active while its direct parent is Inactive.
- Root cause: the client includes every same-warehouse location in parent options without filtering `isActive` at [`location-tree-client.tsx:171`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/location-tree-client.tsx>) and defaults every create form to active. The server verifies only parent existence, warehouse and cycle/depth at [`location.ts:111`](../../../../apps/web/actions/infra/location.ts); it never enforces parent activity.
- Impact: hierarchy status no longer provides a reliable operational gate; active destinations can remain reachable through a branch an administrator explicitly disabled.
- Evidence: [inactive parent](evidence/R02-11-location-edited-inactive.yml), [active descendant](evidence/R02-12-active-child-under-inactive-parent.yml).

### PF-R02-04 — P2 — Inactive locations are offered as active-line output destinations

After `R02-BIN1` was deactivated, it remained selectable as the default output of an Active production line. This is independent of PF-R02-01: once the column mismatch is repaired, the unsafe selection would become durable.

- Expected: only active, same-warehouse locations are offered for an active line, and the server rechecks that invariant.
- Actual: the UI filters only by warehouse at [`lines-screen.client.tsx:271`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/lines-screen.client.tsx>); the action validates only that the location belongs to the warehouse at [`line.ts:78`](../../../../apps/web/actions/infra/line.ts).
- Impact: production output can be routed to a disabled storage node after the fake-save defect is fixed or through another reader of the written column.
- Evidence: [inactive location selected for active line](evidence/R02-15-active-line-inactive-output-ready.yml).

### PF-R02-05 — P2 — Warehouse site and address cannot be corrected after creation

**Reproduction:** Add warehouse exposes Code, Name, Site and Address. After creation, the only master-data edit is `Rename warehouse`, whose dialog contains Name alone.

- Expected: mutable master data supplied during creation can be corrected later, with dependency validation for a site move.
- Actual: site and address are permanently absent from the edit surface; delete/recreate is the only visible correction path and becomes impossible once dependencies exist.
- Source correlation: create state and form include `site_id` and `address` at [`warehouse-list-screen.client.tsx:224`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/warehouse-list-screen.client.tsx>), while the only update action accepts `{warehouseId, name}` and the rename dialog contains only Name at [`warehouse-list-screen.client.tsx:915`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/warehouses/warehouse-list-screen.client.tsx>). The server exports no general warehouse master update, only create/rename/status/storage rules.
- Evidence: [creation fields](evidence/R02-06-add-warehouse-ready.yml), [name-only correction](evidence/R02-08-warehouse-rename-only.yml).

### PF-R02-06 — P3 — Duplicate site is reported as a missing required field

A second site using existing code `N17R02` returned `This field is required` even after Code, Name, timezone, country and legal entity were filled.

- Expected: `A site with this code already exists`/equivalent duplicate-code feedback.
- Actual: misleading missing-field guidance gives the administrator no actionable correction.
- Contract mismatch: the action has explicit SQLSTATE `23505` → `duplicate_code` handling at [`sites.ts:647`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts>) and the modal maps `duplicate_code` separately; the production path instead surfaced `invalid_input`/required semantics.
- Evidence: [duplicate attempt](evidence/R02-03-duplicate-code-wrong-error.yml).

### PF-R02-07 — P3 — Dock delete dialog lacks the Radix DialogTitle contract

Opening Delete for the temporary dock emits `DialogContent requires a DialogTitle for the component to be accessible for screen reader users`.

- Expected: a named dialog with no accessibility console error.
- Actual: visible text looks like a title, but the underlying dialog primitive does not receive its required accessible title component.
- Root cause: the delete modal renders a raw `<h2>` inside shared `Modal` at [`docks-view.client.tsx:217`](<../../../../apps/web/app/[locale]/(app)/(admin)/settings/infra/docks/docks-view.client.tsx>) instead of the shared title/header contract used by the create/edit modal.
- Evidence: [dialog](evidence/R02-20-dock-delete-dialog.yml), [console](evidence/R02-dock-delete-console.txt).

## Prior-fix verification

| Prior issue | Result |
|---|---|
| A3 cross-site line handling | **PASS** — site reassignment cleared incompatible warehouse/location state and counts followed the new site. |
| A3 site/date/site-label propagation | **PASS for site labels** — rename propagated into selector and warehouse read model; no civil-date field exists in this scope. |
| Infrastructure dependency-safe deletion | **PASS** — parent location and warehouse deletion were blocked while dependents existed. |
| Refresh/stale-list repair | **PASS for site/warehouse/location/dock CRUD** — committed mutations reconciled or appeared after hard navigation. **FAIL for default output** because the durable read column differs from the write column. |

## Cleanup and retained artifact

- Deleted `N17R02D1`, `R02-SUB1`, `R02-BIN1`, `R02-ZONE`, `N17R02WH` and site `N17R02` through visible controls, in dependency-safe order.
- Production line `N17R02L1` has no delete control. It was detached from the temporary site/warehouse, moved to Main Factory and set Inactive. It remains as the only documented audit artifact.
- The global site selector no longer contains the temporary site and the temporary warehouse no longer appears in Warehouses.
- No pre-existing production object was deleted or renamed.

## Limitations

- Printer CRUD could not be exercised because the route crashes before its own UI renders.
- No physical printer or label output was attempted.
- The retained production line prevents a strict zero-artifact cleanup because the product exposes deactivate/reactivate but no deletion lifecycle.
