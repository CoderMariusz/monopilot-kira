# 05 — Module Status Matrix & Known Gaps

A reality map of MonoPilot Kira: what is production-ready vs partial vs stub. Every verdict
below is grounded in a real file or migration — paths are absolute from the repo root.

**Honesty rule applied throughout:** a route that only renders `ModuleStubNotice` or a bare
`ModuleDataPanel` (a live row-count with no actions) is a **🔴 stub** — not "done". A route is
only **✅ built** when it renders a real screen whose buttons drive working Server Actions
against live Supabase data.

Status legend: ✅ built · 🟡 partial · 🔴 stub.

Verified against the live `Monopilot` Supabase project (`khjvkhzwfzuwzrusgobp`) on 2026-06-18.

---

## 1. Shipped today (2026-06-18)

These changes are in the working tree (uncommitted at the time of writing) and the supporting
migrations (300/301/302) are **applied live** — see §4.

| Change | Route / file | What landed |
| --- | --- | --- |
| **Scanner de-mock** | `apps/web/components/shell/scanner-frame.tsx` | Removed the faked OS chrome (no fake signal/battery glyphs). The desktop preview strip now shows only the app name, a live clock, and a genuine `navigator.onLine` dot; on a real phone the whole strip is hidden by the `max-width:640px` block in `apps/web/app/globals.css`, giving the app the full 100vw × 100dvh field. |
| **W11 R4 — reverse TO receive** | `apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/reverse-receive.ts` | `reverseToReceiveLine` — e-sign-gated (`warehouse.transfer.correct`), write-ordering hardened (all validation/locking before any mutation), voids the dest LP → `returned` (qty 0), credits the source LP, writes LP history + stock moves + audit + outbox event, rerolls TO status. |
| **W11 R4 — recall factory spec** | `apps/web/app/[locale]/(app)/(modules)/technical/factory-specs/_actions/recall-spec.ts` | `recallFactorySpec` — `technical.factory_spec.recall`-gated; `released_to_factory` → `draft`, blocked if any RELEASED/IN_PROGRESS WO references the spec; clears approved/released stamps + audit. |
| **W11 R4 perms seed** | `packages/db/migrations/300-r4-correction-perms-seed.sql` | Seeds `warehouse.transfer.correct` + `technical.factory_spec.recall` (live: 6 role grants each). |
| **E6 — MRP convert** | `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts` | `convertPlannedToPo` / `convertPlannedToWo` — gated on `planning.mrp.convert` (live), idempotent (`mrp_planned_orders.converted_at` guard, `already converted`), delegate to the real `createPurchaseOrder` / `createWorkOrder`. |
| **E6 — demand forecasts** | `apps/web/app/[locale]/(app)/(modules)/planning/forecasts/page.tsx` + `_actions/forecasts.ts` + `_components/forecasts-view.tsx` | New `/planning/forecasts` screen: item × ISO-week grid with inline-edit, copy-week, CSV import, item picker. Read `scheduler.run.read`, write `planning.forecast.manage` (live). |
| **E6 migrations** | `packages/db/migrations/301-e6-mrp-perms-and-event-seed.sql`, `302-demand-forecasts.sql` | 301 = MRP convert perm + `planning.mrp.completed` event seed; 302 = `public.demand_forecasts` table (org-scoped RLS, NUMERIC-exact qty, ISO-week unique). Both applied live (table `demand_forecasts` confirmed present). |
| **E3 — CCP monitoring** | `apps/web/app/[locale]/(app)/(modules)/quality/ccp-monitoring/page.tsx` + `_components/ccp-board.client.tsx` | New `/quality/ccp-monitoring` board: KPI strip + per-CCP latest-reading cards + "Record reading" modal. Reads `listCcps`/`listMonitoringLog`, writes `recordMonitoring` (from the reviewed `quality/_actions/haccp-actions.ts`, table `haccp_ccps`). Linked from the quality landing nav. |
| **E-IO — PO CSV export** | `apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/create-export-job.ts` | `createExportJob` — exports the PO list (same readers as the screen) to RFC-4180 CSV, human-readable columns only (no UUIDs), writes an `import_export_jobs` ledger row. Wired into the PO list view (`po-list-view.tsx:257`). |
| **UUID-leak fix — devices** | `apps/web/app/[locale]/(app)/(admin)/settings/devices/devices-screen.client.tsx` | Dropped the raw `device.id` column; `site_id`/`line_id` replaced with resolved `site_name`/`line_name`. |
| **UUID-leak fix — BOM snapshots** | `apps/web/app/[locale]/(app)/(modules)/technical/boms/snapshots/_components/snapshots-viewer.client.tsx` | Raw `s.id` / `s.workOrderId` UUIDs replaced with a human `snapshotLabel` (`FG5101 · v7`) + WO number; UUID kept only as React key / testid. |
| **UUID-leak fix — labels** | `apps/web/app/[locale]/(app)/(admin)/settings/labels/label-editor.client.tsx` | Small label-editor UUID-display correction. |
| **GRN-QC banner reword** | `apps/web/app/[locale]/(app)/(admin)/settings/quality/page.tsx` | The "Require GRN QC" flag banner changed from a generic "enforcement coming soon" to the real behavior: "goods received against a PO are placed on a QA hold until a quality inspection is recorded." |
| **Disabled-button tooltips** | e.g. `production/wos/[id]/_components/wo-detail-screen.tsx` | `title={!canSubmit ? labels.formIncomplete : undefined}` added to disabled submit buttons so users see why an action is unavailable. |

---

## 2. Module status matrix

| Module | Status | Key working features (routes) | Gaps / not-built |
| --- | --- | --- | --- |
| **Settings / Admin** | ✅ built | 79 pages under `app/[locale]/(app)/(admin)`: users/roles/RBAC, security/MFA/SAML/SCIM, reference data, schema-driven columns, feature flags, integrations (D365), audit log, devices, labels, sites, account. | Import side of import-export is disabled (see §3); some integration screens are thin. |
| **Technical** | ✅ built | 31 pages: item master, shared BOMs + snapshots, **factory-specs** (approve + release + recall, `recall-spec.ts`), allergens/contamination, routings, cost history, nutrition, shelf-life, sensory, supplier specs, traceability. | A few sub-tabs (item detail) carry "coming soon" affordances. |
| **NPD** | ✅ built | 23 pages under `(npd)`: Brief→Project→FG pipeline + stage-gates, FA aggregate, formulations, allergen cascade, products, docs. | Some side-car decisions / G-gaps tracked in module STATUS; D365 builder is export-only. |
| **Planning — PO** | ✅ built | `planning/purchase-orders` — list/detail/create/edit/lines, draft editability (W11 R1), **CSV export** (`create-export-job.ts`). | Import not built (export-only). |
| **Planning — TO** | ✅ built | `planning/transfer-orders` — list/detail/create/edit, receive, **reverse-receive** (`reverse-receive.ts`, W11 R4). | — |
| **Planning — WO** | ✅ built | `planning/work-orders` — list/detail/create/edit + draft editability. | — |
| **Planning — MRP** | 🟡 partial | `planning/mrp` — netting run, persists `mrp_runs`+`mrp_requirements`, planned-order convert to PO/WO (`mrp.ts`, `planning.mrp.convert` live). | Single-bucket netting, no full multi-level BOM explosion (documented in `mrp.ts` header). |
| **Planning — Forecasts** | ✅ built | `planning/forecasts` — item × ISO-week grid, inline-edit/copy/import (`forecasts.ts`, mig 302, shipped today). | New this session; no prototype anchor existed (DS-conformant). |
| **Planning — Reorder** | ✅ built | `planning/reorder-thresholds` — list + manage (`listReorderThresholds`, mig 178). | — |
| **Warehouse** | ✅ built | 12 pages: dashboard (real KPI strip), inventory, license-plates (detail + move), GRNs (detail + **line cancel**), locations, movements, reservations, genealogy, expiry, inbound. | LP "Print label" is a disabled "coming soon" affordance (see §3). |
| **Production** | ✅ built | 9 pages: WO detail (consume / output / waste / **void** / **reverse-consumption**), changeovers (dual-sign), downtime, shifts, analytics. Canonical owner of `wo_outputs`. | — |
| **Quality — Holds** | ✅ built | `quality/holds` — create/release modals, T-064 consume gate. | — |
| **Quality — NCR** | ✅ built | `quality/ncrs` — create/detail/close workflow. | — |
| **Quality — Specs** | 🟡 partial | `quality/specifications` — detail + create modal exist. | Quality-landing "Specifications" nav card is honestly disabled ("Coming soon", `quality/page.tsx:88`). |
| **Quality — Inspections** | ✅ built | `quality/inspections` — list/detail/create. | — |
| **Quality — HACCP/CCP** | ✅ built | `quality/ccp-monitoring` — board + record-reading modal (shipped today; `haccp_ccps` live). | Prototype's filter bar / timeline chart / full readings table deferred (documented deviation). |
| **Scanner** | ✅ built | 20 pages under `(scanner)`: PIN login, home hub, receive, putaway, move LP, pick, consume, output, LP info, warehouse tiles. De-mocked shell (shipped today). | `production_lines` → `site_id` always NULL in bootstrap (see §3). |
| **OEE** | 🟡 partial | `oee` (1 page) — real dashboard screen (`oee-data.ts`, site-scoped), KPI cards + drilldown. Read-only by design (08-production owns the producer). | Single landing route; deeper drill modals limited. |
| **Maintenance** | 🟡 partial | `maintenance` (1 page) — **real MWO list** + PM schedule list + create/transition modals (`mwo-actions.ts`, mig 201/202). NOT a stub despite a stale comment. | Single route; LOTO/calibration/spares are backend-seeded but lack dedicated UI routes. |
| **Finance** | 🟡 partial | `finance` (1 page) — completed-WO cost table (`wo-cost-actions.ts`, `fin.*` perms live). | Single route; standard-cost/variance/valuation screens not surfaced as routes (D365 export-only per R15). |
| **Shipping** | 🔴 stub (UI) | Landing renders `ModuleDataPanel` count only (`shipping/page.tsx`). SO backend exists (`_actions/so-actions.ts` — create/allocate/transition state machine, mig 288). | **No UI route drives the SO backend** — no page imports `so-actions.ts`. See §3. |
| **Scheduler** | 🔴 stub | `scheduler/page.tsx` renders `ModuleStubNotice` only. | No screen, no actions. (Note: planning MRP/WO scheduling lives under `planning`, not here.) |
| **Multi-site** | 🔴 stub | `multi-site/page.tsx` renders `ModuleStubNotice` only. | DB foundation + site-context primitives exist (mig 215; see `04-architecture-multitenancy.md`) but the module page and IST workflow UI are not built. |
| **Reporting** | 🟡 partial | `reporting` (1 page) — real report screen (`report-read-actions.ts`, `rpt-labels`). | Single landing route; limited report catalog. |

---

## 3. Known dead-ends / gaps (grounded)

1. **`/scheduler` is a pure stub.**
   `apps/web/app/[locale]/(app)/(modules)/scheduler/page.tsx:15` — renders only `ModuleStubNotice`.
   *Fix:* either remove the nav entry or build the planning-ext scheduling board; the live MRP/WO
   scheduling already lives under `/planning`.

2. **`/multi-site` is a pure stub.**
   `apps/web/app/[locale]/(app)/(modules)/multi-site/page.tsx:15` — renders only `ModuleStubNotice`.
   *Fix:* build the sites overview + IST workflow on top of the existing mig-215 foundation.

3. **`/shipping` landing is a count-only stub; the SO backend has no driving UI.**
   `apps/web/app/[locale]/(app)/(modules)/shipping/page.tsx` renders a bare `ModuleDataPanel`.
   `so-actions.ts` (create/allocate/confirm/cancel, mig 288) exists but **no page imports it**
   (verified: zero non-test importers).
   *Fix:* add a `/shipping/sales-orders` list+detail route that consumes `so-actions.ts`.

4. **Shipping SO actions throw uncaught `PermissionDenied`.**
   `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:122` —
   `requirePermission` does `throw new Error(\`PermissionDenied:${permission}\`)`. If a UI ever calls
   these without permission this surfaces as an unhandled 500, not a graceful `forbidden` result.
   *Fix:* return a typed `{ error: 'forbidden' }` result like the sibling planning/technical actions do.

5. **Import feature is hard-disabled.**
   `apps/web/actions/import-export/import.ts:60` — `const IMPORT_FEATURE_DISABLED = true;`. At
   line 84 an otherwise-valid request returns `{ error: 'not_implemented' }` (authz/preflight still
   run above it, so controls aren't bypassed). The export side (PO CSV, §1) works.
   *Fix:* build the worker that drains `public.import_export_jobs`, then flip the flag false.

6. **Scanner bootstrap never links a line to a site.**
   `apps/web/app/api/scanner/bootstrap/route.ts:18` — the production-lines query hardcodes
   `null::uuid as site_id`, so every line's `siteId` is NULL in the scanner bootstrap payload.
   *Fix:* join `production_lines` to its site (or select the real `site_id` column once
   `production_lines.site_id` is backfilled).

7. **LP "Print label" is a disabled "coming soon" affordance.**
   `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_components/lp-detail.client.tsx:443,666`
   — the button renders with `title={labels.actions.comingSoon}` and no working handler.
   *Fix:* wire a GS1 label-render action (SSCC-18 generator already exists in the shipping/packaging skills).

8. **Quality "Specifications" nav card is honestly disabled on the landing.**
   `apps/web/app/[locale]/(app)/(modules)/quality/page.tsx:88` shows a "Coming soon" badge on that
   card even though `/quality/specifications` detail+create routes exist. Cosmetic inconsistency.
   *Fix:* flip the card's `live`/`href` once the specs list view is considered complete.

9. **MRP nets a single bucket only.**
   `apps/web/app/[locale]/(app)/(modules)/planning/_actions/mrp.ts:12-13` — `mrp_planned_orders`
   netting is single-bucket with no multi-level BOM explosion (documented, `planned_order_count`
   stays honest). Works end-to-end for the convert flow but is not full MRP.
   *Fix:* add BOM-level explosion + multi-bucket time-phasing.

---

## 4. Migrations state

- **Highest numbered migration in the repo: `302`** —
  `packages/db/migrations/302-demand-forecasts.sql` (`public.demand_forecasts`). Verified
  **applied live** (`to_regclass('public.demand_forecasts')` returns the table).
- **Migrations 300 + 301 applied live today** — the seeded permissions are present in
  `public.role_permissions`: `warehouse.transfer.correct`, `technical.factory_spec.recall`
  (mig 300) and `planning.mrp.convert`, `planning.forecast.manage` (mig 301), all with 6 role grants.
- **`mrp_planned_orders` and `haccp_ccps` exist live**; there is **no** `po_export_jobs` /
  `export_jobs` / `ccp_records` table — PO export reuses `import_export_jobs` and CCP monitoring
  reuses `haccp_ccps` + the HACCP monitoring log (not a dedicated `ccp_records` table).
- **The live `supabase_migrations.schema_migrations` table only tracks MCP-applied migrations**, so
  it is a *partial* history. Its highest version timestamp is `20260618173132` (today's R4/E-wave
  applies); the numbered repo migrations (288–302) are **not** mirrored 1:1 as rows there. To audit
  "is X applied live?", check for the table/column/permission directly (as done above) rather than
  trusting the `schema_migrations` row list.

---

## Method note

Verdicts were derived by reading each module's root `page.tsx` and grepping for stub markers
(`ModuleStubNotice`, `ModuleDataPanel`, `IMPORT_FEATURE_DISABLED`, "coming soon"), then confirming
that "real screen" routes wire working Server Actions. Live presence of tables/permissions was
confirmed against the `Monopilot` Supabase project. A comment mentioning `ModuleStubNotice` (e.g.
`maintenance/page.tsx`) does **not** make a route a stub — only an actual render does.
