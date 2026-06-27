# Big Initiatives Plan — 2026-06-27

Written for owner review BEFORE orchestration starts (per owner directive: finish deep-walk + LOC,
then big initiatives, but write the plan first). Grounded in two fresh read-only current-state audits
(NPD-DYN: agent ac4967df; site-scoping: agent afa7612c), NOT the stale design docs. Division of labour
unchanged: **Codex codes backend, Claude orchestrates + reviews + does UI + authors/applies migrations + verifies live.**

---

## 0. Verified foundation — DONE, do NOT rebuild

The biggest/riskiest pieces are already shipped (much of it this session):

- **product → items FULL MERGE** (migs 354–365): `public.product` is a SECURITY-INVOKER view over `items ⨝ fg_npd_ext`; `bom_headers`/`work_orders` carry `item_id`; allergen vocab canonical. The single most-risky initiative (build-queue #5) is COMPLETE. (`product_id` physical drop parked as a harmless shadow column — owner decision.)
- **Code-mask engine + schema**: `lib/documents/code-mask.ts` (tokens `xxxx`/`[DATE]`/`[YY]`/`[SITE]`) + mig 344 (`org_document_settings.code_mask`, doc_types fg/wip/lp/rm/ing/grn seeded). Engine tested. **Not yet adopted by generators** (see A4).
- **withSiteContext backbone**: `lib/auth/with-site-context.ts` (fallback chain, fail-closed) + DB primitives (mig 215). Tested. **Not yet adopted by any action** (see B1).
- **Site schema**: mig 334 added `site_id` to purchase_orders/quality_inspections/stock_adjustments/transfer_orders; mig 312 to warehouses/production_lines.
- **Scanner LP→site** (S3): DONE end-to-end (`register-output`, `receive-po`, `no_warehouse_for_site` guard surfaced on WO page).
- **NPD field-catalog backend** (mig 333): `npd_departments`/`npd_field_catalog`/`npd_department_field` + full CRUD Server Actions. **UI partially wired** (see A1).
- **FG Create/Link modal** (DONE core), **BOM co-products edit/delete** (DONE), **HACCP CCP per-row edit** (DONE), **Sensory write-path** (DONE), **admin super-user parity** (mig 332).

---

## Initiative A — NPD-DYN + FG as a dynamic extension of the Project (kill double data-entry)

Owner one-liner: the SAME data is entered twice (project brief AND FA/FG dept screens). Make FG a DYNAMIC
EXTENSION of the project: project = static minimum; FA/FG sections = built from a per-dept field catalog;
fields pre-fill from the project.

| Slice | State | Remaining work | Lane | Mig? |
|---|---|---|---|---|
| **A1** Field-catalog + Departments UI | PARTIAL | Wire "New field" + "New department" forms in `settings/npd-fields` (actions exist, UI doesn't expose them); add **Delete department**; unify `settings/tenant/depts` to read `npd_departments` (today reads `reference_schemas`). | Codex backend + Claude-UI | no |
| **A2** `auto` / `auto_source_field` derived fields | MISSING | Migration: add `auto_source_field_id` + `data_type='auto'` to `npd_field_catalog`; catalog UI to pick source field; FA runtime renders `auto` read-only pulled from source. | Claude mig + Codex + Claude-UI | **yes** |
| **A3** Dynamic FA/FG detail from catalog | PARTIAL | Switch `fa/[code]` `readDeptColumns()` from `Reference.DeptColumns` → `npd_department_field ⨝ npd_field_catalog`; consolidate 8 tabs → 3 sections (Core / Commercial+Planning / Production+Technical); **pre-fill from project** (product_name, pack size, cases). | Claude-UI + Codex loader | no |
| **A4** Code-mask adoption | MISSING (engine done, 0 callers) | Wire `nextEntityCode('fg'…)` into `gate-helpers.ts:557` (replace `normalizeProductCode`), + LP/WIP/GRN/RM/ING generators; add a settings page to edit masks per entity. | Codex + Claude-UI | no |
| **A5** FA→FG rename residuals | PARTIAL | 4 hint strings still say "FA prefix" (`i18n/en.json:1786,1793,2043,2050`); decide URL `/fa`→`/fg` (breaking) y/n; perm strings `npd.fa.*` (internal, low prio). | kira-mechanical | no |
| **A6** Recipe unlock-PIN | MISSING | Migration (perm seed `npd.formulation.unlock` dual-store + trigger locked→draft); `unlockVersion` action w/ signEvent PIN; Unlock button. | Claude mig + Codex + Claude-UI | **yes** |
| minor | — | pack_weight on pipeline overview (today brief-only); verify spec-params per-row edit scope. | kira-easy | no |

**Owner decisions for A:** (1) confirm the 3-section grouping for A3; (2) URL `/fa`→`/fg` rename — do it or keep route internal? (3) `auto`-field UX (dropdown of same-dept vs any-dept source fields).

### A — OWNER ADDITIONS (2026-06-27) — all "kill double-entry" / recipe fixes
- **A7 Recipe Version locked + "Add version" submit broken.** Version field is locked; add-version doesn't submit. Fix: unlock + working add-version (new = draft, editable, in selector, per-version lock). [folds into A6 + NPD-flow-blocker #3]
- **A8 Submit "For trial" → create a trial in step 4 as a DRAFT.** For-trial submission must create the trial record (draft) at step 4.
- **A9 Recipe ingredient price AUTO-COPY** from the item master (price set at product creation, per kg or per piece) when an ingredient is selected — kill manual entry.
- **A10 Packaging AUTO-PULL supplier + price** assigned to the product.
- **A11 Add SUPPLIER field to create-item step 2 (Classification).** Today there is none. The supplier must follow the component, be auto-added to the supplier-spec (with FILE-UPLOAD if the supplier supplies a spec), and appear in Packaging.
- **A12 FG detail PRE-FILL from brief** (repro `/en/fa/FG-NPD-012`): copy Volume/Weights (g), Price (Brief), Packs per case from the project/brief — currently not copied. [= A3 with these exact fields]
- **A13 REMOVE the "Number of cases *" field** from FG detail (redundant double-entry).

---

## Initiative B — Site-scoping: the top-bar Site selector must define everything on screen

Owner: site ≡ warehouse; LP/WO/SO/PO/GRN of the active site only; pickers/functions scoped to it;
"kiepsko widać stan magazynu". Backbone EXISTS; this initiative is mostly **adoption** (broad but mechanical).

| Slice | State | Remaining work | Lane | Mig? |
|---|---|---|---|---|
| **B0** Drizzle model sync | MISSING | `productionLines` Drizzle model (`schema/infra-master.ts:119`) lacks `site_id`/`warehouse_id` that live DB already has — sync (no DB change); verify TO model. | kira-mechanical | no |
| **B1** Adopt withSiteContext in reads (S4) | MISSING (22 of 23) | Add active-site filter to the 22 org-only list/read actions (getLpDetail, listGrns, inspections, PO/TO/SO lists, allocateSalesOrder LP candidates, analytics/reports…), fail-closed/empty when no site. Batch by module. | Codex (batched) + kira-codex-review | maybe |
| **B2** Pickers + selector (S5) | MISSING | Site-filter the 7 pickers (WO/SO/PO/TO/LP-move); wire the site selector into planning/purchasing/sales/quality/transfers (only prod-WO/wh-LP/OEE have it now). | Codex + Claude-UI | no |
| **B3** Warehouse per-site visibility (S6) | MISSING | Scope warehouse dashboard KPIs / inventory / GRN list / adjustments to active site; add a visible "Site: X" header on every warehouse screen. **This is the owner's most-felt pain.** | Claude-UI + Codex | no |
| **B4** Cross-site leakage tests (S8) | STUB | Action-level tests: a site-A user must not receive site-B rows from each B1 action; DB-suite tests for the 4 mig-334 tables. | Codex / kira-easy | no |
| **B5** S7 residuals | PARTIAL | Live-verify `scheduler.*` / `npd.released_product_edit.*` seeds; SoD UI copy ("requires a different person"); non-scanner `forbidden` clarity. | Claude live-check + kira-mechanical | no |

**Owner decisions for B:** (1) reads fail-CLOSED (empty + "select a site") vs default-to-all-sites when no site picked? (2) scanner soft-fallback: keep allowing LP `site_id`=NULL when no warehouse matches the site, or make it hard fail-closed?

---

## Recommended sequence + rationale

Two genuinely independent tracks (A = NPD/Technical surface; B = ops/warehouse surface) → run in **parallel**.
Within each, order by unblock-value:

1. **B0 + B1 first** (site-scoping): B0 unblocks type-safe site columns; B1 (adopt the backbone in reads) is the foundation every other B slice leans on, and it directly answers "site must define what's on screen". Do B1 module-by-module with B4 tests as the per-module gate. *(Codex batches, Claude reviews.)*
2. **A4 (code-mask adoption) early** — small, high-visibility, the engine is already built; just wiring. *(quick win)*
3. **A1 → A3 (field-catalog UI → dynamic FA + pre-fill)** — the core "kill double-entry" deliverable; A1 unblocks A3. Run alongside **B2 + B3** (B3 = the warehouse-visibility pain).
4. **A2 (auto-fields), A6 (recipe unlock-PIN)** — both need migrations (Claude) + are more contained; do after A1/A3 land.
5. **B5 + A5 + minors** — cleanup tail.

Effort gut-feel (relative): B1 ≈ largest (22 actions, mechanical); A3 + B3 medium-large; A1/A2/A4/A6/B2 medium; A5/B0/B4/B5 small.

## Risks + gates
- The merge being done removes the biggest landmine. Remaining migrations (A2, A6) are small + additive — Claude authors, adversarial-review before apply (as established this session).
- B1/B2/B4 are broad but low-risk read-path; the gate is the cross-site leakage test (B4) per module — never ship a B1 batch without it.
- Codex stays on backend slices (≤5 files, no `pnpm build`, verify by targeted vitest); Claude owns all migrations + UI + the per-batch review + live verify + push.

## Owner decisions — LOCKED 2026-06-27
- **Priority: BOTH tracks in parallel.** Start B1 (site read adoption) + A4 (code-mask) first; rest in waves.
- **Site reads = FAIL-CLOSED.** No active site → lists return empty + "select a site" notice; never leak cross-site.
- **FA→FG = FULL route rename `/fa` → `/fg`** (breaking) WITH redirects from `/fa/*` → `/fg/*` so existing links/bookmarks don't 404. Rename route segment + nav + filenames-where-cheap; keep `public.product` table + internal architecture.
- Still-open per-slice (decide at kickoff, non-blocking): A3 3-section grouping; A2 auto-field source scope (same-dept vs any-dept); B scanner soft-fallback strictness.

---

## Progress — autonomous run 2026-06-27 (post-compact, owner 3h autonomy)

SHIPPED + VERIFIED this run (Codex-style verify-by-reality; all pushed to main):
- **A7 (DONE, live-verified end-to-end)** — "Add version" did nothing / "can't select any version". ROOT CAUSE found in **live Postgres logs**: `create-version.ts` audit-log INSERT passed an untyped bind param to `jsonb_build_object('versionNumber', $4)`; jsonb_build_object args are `"any"` so Postgres failed at PREPARE with *"could not determine data type of parameter $4"* → action threw → caught as persistence_failed → adapter stripped to `{ok:false}` → editor swallowed silently → **no version was ever created** (every formulation stuck at v1, selector disabled <2). Fix = `$4::int` + UI now surfaces ok:false. Swept the whole repo for the class: only 1 real instance (pause-resume-wo `$7` is text-pinned by a sibling usage, PREPARE-verified — no false fix). Commit `b7c1d74e`. Live: clicking Add version created v2 + navigated to it.
- **A12 (DONE, live-verified)** — FG detail blank Volume/Weight(g)/Price(Brief). `createFgCandidate` never copied the brief. Now copies `pack_weight_g→weight`, `target_retail_price_eur→price_brief`, `expected_volume(numeric-only)→volume` from npd_projects (coalesce). **mig 368** backfilled 5 existing FGs (FG-NPD-012 now weight 500 / price 12.20 / volume 2000). packs-per-case has no brief source → stays manual. Commit `a1c2ca5b`.
- **A13 (DONE)** — removed redundant required "Number of cases" field. **mig 367** deletes the `Reference.DeptColumns` `Number_of_Cases` row (both orgs); zero UI change (Core tab is DeptColumns-driven), also drops it as a Close-Core gate. Commit `a1c2ca5b`.
- **A8 (DONE, code; live-verify pending deploy)** — "Submit for trial" now seeds a placeholder "draft" trial at step 4 (`trial_batches`, result='pending' = the placeholder state; batch_size_kg pre-filled from the version; idempotent WHERE NOT EXISTS). Commit `846265c9`.
- **A9 (NO-OP, already works)** — ingredient price auto-copy is ALREADY wired (`handleSelectItem` copies `item.costPerKgEur`; picker SELECTs `items.cost_per_kg`; live RM-001 shows €3.50). Blanks only when `items.cost_per_kg` is NULL — a create-item data-entry gap (folds into A11). No code change.

NEXT migration = **369**. migs 367/368 applied live + recorded in schema_migrations.

### A10 / A11 — supplier flow (NOT shipped — ready-to-execute brief, ~half-day, multi-surface)

Scoped via read-only audit (agent a126af2a). Data model TODAY: `public.items` has **no** supplier column; the canonical item↔supplier link is `public.supplier_specs(item_id, supplier_code, spec_document_url, lifecycle_status, review_status, …)` (many-to-many); `public.suppliers` master exists (SUP-DEMO-01/PKG-01/ING-01). NO migration needed (use supplier_specs as the link).

- **Slice 1 — A11 core (MEDIUM, no migration).** Add a Supplier `<select>` to create-item wizard step 2 "Classification" (`item-create-wizard.tsx` step `classification`, lines ~603-656; add to `WizardFormState`+`emptyWizardForm` lines 95-144). Thread a `suppliers` list into the wizard (fetch via planning/suppliers `listSuppliers` in the wizard's server parent). Extend `CreateItemInput` zod (`technical/items/_actions/shared.ts:180`) with `supplierCode?`. In `create-item.ts` (after the item INSERT, line 73) insert an approved `supplier_specs` row reusing the exact shape in `supplier-spec-actions.ts:195-215` (org_id,item_id,supplier_code,supplier_status='approved',spec_version='1',issued_date=current_date,lifecycle_status='active',review_status='approved',uploaded_by; the partial-unique upsert handles re-runs). The item's **Supplier specs tab then renders it automatically** (read path `listSupplierSpecs` already exists). → delivers A11 (i)+(ii, minus file).
- **Slice 2 — A10 auto-pull (MEDIUM, dep on data only).** Extend the item-picker search action (`fa/actions/search-items.ts` / the packaging item-search) to LEFT JOIN the item's approved `supplier_specs.supplier_code`; add `supplierCode` to `ItemPickerOption`. In the packaging component modal `onPickItem` (`packaging-component-modal.tsx:102-118`) copy `item.supplierCode → form.supplierCode` (cost already pre-fills from `items.cost_per_kg`). `packaging_components.supplier_code` already exists. → delivers A10.
- **Slice 3 — A11 file upload (LARGE, greenfield UI, reusable pattern).** Add `<input type=file>` to the supplier-spec add modal (`supplier-spec-add.client.tsx`) + a new `uploadSupplierSpecDoc` action writing `supplier_specs.spec_document_url`+`document_sha256`+`document_mime_type`. Reuse the storage pattern in `lib/storage/npd-attachments.ts` / `fa/[productCode]/docs/_actions/upload-doc.ts` (new prefix `supplier-specs/{orgId}/{itemId}/`). The display link `<a href={specDocumentUrl}>` already renders once set.
