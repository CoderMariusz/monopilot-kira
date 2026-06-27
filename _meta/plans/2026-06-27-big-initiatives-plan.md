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

## What I need from the owner before orchestrating
- A: the 3 decisions above (3-section grouping, `/fa`→`/fg` route, auto-field UX).
- B: the 2 decisions above (reads fail-closed vs all-sites; scanner fallback strictness).
- Priority steer: start with **B (site-scoping, the felt pain)**, **A (kill double-entry P0)**, or **both in parallel** (my recommendation).
