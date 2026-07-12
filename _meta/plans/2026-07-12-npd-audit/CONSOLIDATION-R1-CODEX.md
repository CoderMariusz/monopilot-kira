# NPD consolidation execution plan — Round 1/3

## 0. Architecture decision

### Recommended target

- Canonical workflow: `/{locale}/pipeline/[projectId]/**`.
- Canonical aggregate identity while in NPD: `npd_projects.id`.
- FG/product identity remains `product_code`, linked through `npd_projects.product_code`.
- Existing FG tables, actions, audit events, storage objects, and history remain intact.
- `/fg/**` and `/npd` become compatibility entry points before their view code is deleted.
- No destructive migration.
- No historical row rewrite.
- No second “department completion” workflow.

### Refinement to the proposed mapping

The pipeline currently exposes nine rail stages, not eleven:

```text
brief
recipe → /formulation
packaging
costing_nutrition → /costing-nutrition
trial
sensory
pilot
approval
handoff
```

Source: [stage-routes.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/npd/stage-routes.ts).

`costing`, `nutrition`, and `gate` are supporting routes, not separate rail stages. Preserve this topology during consolidation; do not add more stages merely to mirror old FG tabs.

Recommended placement:

| Legacy capability | Canonical pipeline location |
|---|---|
| Process assignment, roles, WIP, ProdDetail | Recipe → `Process & WIP` panel |
| Initial BOM preview/materialization | Recipe preview; authoritative release in Handoff |
| V01–V08 | Shared validation panel available in Recipe, Approval, Gate, Handoff |
| Risks/V18 | Approval → `Risks` section; blocker also surfaced in Gate/Handoff |
| Compliance documents | Approval → `Compliance` section |
| Allergen cascade | Recipe read-only cascade; Approval declaration/sign-off |
| Department completion | Gate checklist predicates; no department-close state machine |
| D365 build/export | Handoff → `D365 Export` section |
| Historical FG department data | Pipeline read-only `Legacy details` drawer/tab |
| Audit/build/document history | Pipeline `History` view; source records unchanged |

---

# 1. Route/component move map

## 1.1 `/npd` dashboard

| Current surface | Current files | Destination | Disposition |
|---|---|---|---|
| NPD dashboard route | [npd/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/npd/page.tsx) | `/pipeline`, using existing pipeline KPI/table/kanban views | Delete view after redirect soak |
| KPI, department progress, launch-alert dashboard | [dashboard-screen.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/npd/_components/dashboard-screen.tsx) | Pipeline list header/analytics; retain only unique launch-alert widgets | Split/reuse, then delete old composition |
| Dashboard summary/alerts | [get-dashboard-summary.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/get-dashboard-summary.ts), [get-launch-alerts.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/get-launch-alerts.ts) | Pipeline analytics loaders | Reuse initially; rename only after callers move |
| Recent pipeline preview | [dashboard-pipeline-preview.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx) | Redundant with `/pipeline` | Delete |
| D365 cache refresh | [refresh-d365-cache.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/refresh-d365-cache.ts) | Handoff → informational D365 reference-status refresh | Keep action, remove dashboard CTA |

`/npd` should redirect to `/{locale}/pipeline?view=table`; no separate dashboard remains.

## 1.2 `/fg` list and creation

| Current surface | Current files | Destination | Disposition |
|---|---|---|---|
| FG list | [fg/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/page.tsx), [fa-list-table.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/_components/fa-list-table.tsx) | `/pipeline?view=table`; add FG code/status columns and filters there | Delete after redirect soak |
| Standalone FG creation | [fa-create-host.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/_components/fa-create-host.tsx), [fa-create-modal.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/_components/fa-create-modal.tsx) | Pipeline create-project wizard; FG creation/mapping remains at G3 | Delete direct create entry point |
| Product creation alternative | [products/new/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/products/new/page.tsx) | Redirect to `/pipeline/new` | Delete NPD-facing standalone creation view |
| Create action | [create-fa.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/create-fa.ts) | Called only by `create-or-map-fg-candidate-at-g3.ts` or an extracted shared helper | Keep backend; remove public UI caller |
| Delete FG action | [delete-fa.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/delete-fa.ts) | Pipeline project administration, only before protected dependencies exist | Keep but do not expose as general FG-list action |

The create-project wizard remains canonical: [create-project-wizard.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/_components/create-project-wizard.tsx).

## 1.3 `/fg/[productCode]` department workspace

| Current page/component | Destination | Disposition |
|---|---|---|
| FG shell/page | [fg/[productCode]/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/page.tsx) | Compatibility resolver to linked pipeline project; fallback read-only legacy page if unresolved/ambiguous | Replace after pipeline coverage |
| Department tab shell | [fa-tabs.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-tabs.tsx) | None | Delete |
| Core tab | [fa-core-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-core-tab.tsx) | Brief for project-owned fields; read-only `Legacy details` for remaining product fields | Split, then delete |
| Commercial tab | [commercial-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/commercial-tab.tsx) | Brief + Costing + Packaging, according to field catalog stage mapping | Replace with existing stage forms |
| Planning tab | [fa-planning-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-planning-tab.tsx) | Brief volume/date inputs; Handoff readiness summary | Move unique fields; otherwise delete |
| Production/ProdDetail | [fa-production-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-production-tab.tsx) | Recipe → `Process & WIP` | Reuse initially through `FormulationWipPanel`, then rename away from `Fa*` |
| Finish/create WIP | [finish-wip-editor.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/finish-wip-editor.tsx) | Recipe → `Process & WIP` | Move |
| BOM tab | [fa-bom-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-bom-tab.tsx) | Recipe read-only initial-BOM preview; Handoff authoritative BOM/release panel | Split/reuse |
| Technical tab | [fa-technical-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-technical-tab.tsx) | Recipe allergen data + Approval compliance/sign-off; post-release Technical remains external | Split, then delete |
| Procurement tab | [fa-procurement-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-procurement-tab.tsx) | Costing material status and Handoff readiness | Move only unique read model |
| Benchmark editor | [benchmark-editor.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/benchmark-editor.tsx) | Brief or Sensory benchmark selector | Reuse |
| Department wrapper/status | [fa-section-wrapper.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-section-wrapper.tsx), [dept-status-strip.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/npd/dept-status-strip.tsx) | Gate checklist/validation summary | Replace; keep status strip only if useful as read-only history |
| Right panel/actions | [fa-right-panel.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-right-panel.tsx), [fa-header-actions.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-header-actions.tsx) | Pipeline project header + Validation panel + Handoff actions | Delete after feature transfer |
| History tab | [fa-history-tab.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-history-tab.tsx) | Pipeline project `History` drawer/tab | Move; keep source queries/events unchanged |
| Department-close modal | [dept-close-modal.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/_modals/dept-close-modal.tsx) | None after checklist equivalence and legacy closeout | Delete last |
| D365 modal placeholder | [fa-detail-modal-host.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-detail-modal-host.tsx) | Handoff D365 export panel | Delete placeholder; it currently does not implement a build |

## 1.4 Dedicated FG subroutes

| Current route | Destination | Disposition |
|---|---|---|
| `/fg/[productCode]/allergens` | Recipe cascade panel + Approval declaration/sign-off | Redirect after both panels exist |
| Allergen page | [allergens/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/allergens/page.tsx) | Pipeline | Delete view only |
| Allergen loader/widget | [allergen-cascade-widget.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/_components/allergen-cascade-widget.tsx), [read-allergen-cascade.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/allergens/_actions/read-allergen-cascade.ts) | Recipe | Reuse |
| Allergen sign-off | [accept-declaration.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/allergens/_actions/accept-declaration.ts) | Approval | Reuse; change revalidation targets |
| `/fg/[productCode]/docs` | `/pipeline/[projectId]/approval?panel=compliance` | Redirect |
| Compliance UI | [compliance-docs-screen.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/docs/_components/compliance-docs-screen.tsx) | Approval | Move/reuse |
| Compliance actions | [docs/_actions](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/docs/_actions) | Approval-owned UI imports same actions | Reuse as-is initially |
| `/fg/[productCode]/risks` | `/pipeline/[projectId]/approval?panel=risks` | Redirect |
| Risk UI | [risk-register-screen.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/risks/_components/risk-register-screen.tsx) | Approval | Move/reuse |
| Risk actions | [risks/_actions](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/risks/_actions) | Approval-owned UI imports same actions | Reuse |

## 1.5 Existing pipeline surfaces to extend

| Pipeline surface | Change |
|---|---|
| [formulation/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/page.tsx) | Mount `FormulationWipPanel`; add recipe validation summary |
| [formulation-wip-panel.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/formulation-wip-panel.tsx) | Make canonical process/WIP/ProdDetail surface |
| [approval/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/approval/page.tsx) | Add Compliance, Allergens, Risks, Validations panels |
| [gate/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx) | Replace links back to `/fg`; display blocker details inline |
| [handoff/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/page.tsx) | Add D365 export and final validation preflight |
| [project-header.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/_components/project-header.tsx) | Replace “Open FG” with internal stage/history navigation |
| [validation-status-panel.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/components/npd/validation-status-panel.tsx) | Keep presentation; wire to one server-side V01–V08 evaluator |
| [approval-history-timeline.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/_components/approval-history-timeline.tsx) | Extend to include existing FG history without rewriting it |

---

# 2. Data/backend plan

## 2.1 Data identity and joins

```text
npd_projects.id
  └── npd_projects.product_code
        └── product view (items + fg_npd_ext)
              ├── prod_detail
              │     └── npd_wip_processes
              │           └── formulation_ingredients.npd_wip_process_id
              ├── compliance_docs
              ├── risks
              ├── fa_allergen_overrides
              ├── formulations
              ├── costing/nutrition rows
              ├── fa_builder_outputs
              ├── bom_headers
              └── factory_release_status
```

Important correction: [product.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/schema/product.ts) describes the legacy shape, but live migration topology changed `public.product` into an items-backed compatibility view. Migration authority is [359-product-as-items-view-cut.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/359-product-as-items-view-cut.sql). Do not design a new product table or migrate these rows into `npd_projects`.

## 2.2 Reuse as-is

- Project/gate actions:

  - [create-project.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/create-project.ts)
  - [create-or-map-fg-candidate-at-g3.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/create-or-map-fg-candidate-at-g3.ts)
  - [advance-project-gate.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/advance-project-gate.ts)
  - [approve-project-gate.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/approve-project-gate.ts)
  - [gate-checklist-auto-satisfy.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_lib/gate-checklist-auto-satisfy.ts)

- Process/WIP actions:

  - [add-prod-detail-component.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/add-prod-detail-component.ts)
  - [assign-ingredient-process.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/assign-ingredient-process.ts)
  - [wip-process-actions.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/wip-process-actions.ts)
  - [map-definition-process-chain.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/map-definition-process-chain.ts)
  - [load-formulation-wip-panel.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/_actions/load-formulation-wip-panel.ts)

- Compliance, allergen, risk actions remain product-code based. The pipeline page resolves the linked product code and calls them.
- BOM/release actions:

  - [materialize-npd-bom.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts)
  - [generate-production-bom.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/generate-production-bom.ts)
  - [release-to-factory.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/release-to-factory.ts)
  - [promote-to-production.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/handoff/_actions/promote-to-production.ts)

## 2.3 Backend changes

### A. Add a shared project-product resolver

Minimum API:

```ts
resolveProjectProduct({ projectId }): {
  projectId;
  projectCode;
  productCode: string | null;
}

resolveProductProject({ productCode }): {
  kind: 'single' | 'ambiguous' | 'unlinked';
  projects: Array<{ id; code; currentGate; currentStage; createdAt }>;
}
```

Rules:

- Always filter by `org_id = app.current_org_id()`.
- `/fg/[productCode]` redirects only for `kind='single'`.
- Ambiguous product linkage renders a read-only chooser; never guess the newest project.
- Unlinked historical FG renders the temporary read-only compatibility view.

### B. Add one V01–V08 evaluation service

One server-side evaluator returns:

```ts
{
  rules: Array<{
    id: 'V01' | ... | 'V08';
    status: 'pass' | 'warn' | 'fail' | 'info';
    title;
    detail;
    blockingGates: string[];
    targetStageHref;
  }>;
  blockers: string[];
}
```

It must become the sole source for:

- Recipe validation panel.
- Approval validation panel.
- Gate blockers.
- Handoff/D365 preflight.
- Existing `ValidationStatusPanel`.

Do not duplicate rule evaluation inside each stage.

### C. Replace department-close with checklist predicates

- Freeze `closeDeptSection`/`reopenDeptSection` as compatibility-only actions.
- Existing `closed_*` and `done_*` values remain readable for history and legacy-project readiness.
- New pipeline work never requires a user to close a department.
- Add auto-satisfy predicates for the real conditions currently represented by V05/department close.
- `advance-project-gate.ts` must evaluate these predicates directly; visual checklist completion must not be the only enforcement.

### D. D365

Current code has:

- A deferred D365 modal, not a functioning builder.
- `fa_builder_outputs` persistence and export-status helpers.
- An informational `d365_import_cache`.

Therefore this is a build gap, not merely a component move.

Handoff implementation must:

1. Run shared validation/V18/release preflight.
2. Generate the export artifact server-side.
3. Write `fa_builder_outputs`.
4. Record export audit/outbox history.
5. Return signed download access.
6. Never set `built`, factory release, BOM status, or MES master state from D365 results.

`d365_import_cache` may remain an informational external-code lookup cache only. It must not write canonical product/BOM/project state.

## 2.4 FK/reference inventory

### Direct product references

The composite `(org_id, product_code)` relationships are re-established in [142-product-per-org-pk.sql](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/142-product-per-org-pk.sql):

- `prod_detail` — cascade.
- `npd_projects` — no action.
- `nutrition_profiles` — cascade.
- `nutrition_allergens` — cascade.
- `nutri_score_results` — cascade.
- `costing_breakdowns` — cascade.
- `risks` — cascade.
- `compliance_docs` — cascade.
- `formulations` — no action.
- `fa_allergen_overrides` — cascade.
- `fa_builder_outputs` — cascade.
- `allergen_cascade_rebuild_jobs` — cascade.
- `bom_headers.product_id` — restrict.
- `factory_release_status` — restrict.
- `npd_fa_benchmarks` also references product.
- Product compatibility FKs currently anchor on `product_legacy` after migration 359.

### Process graph

- [prod-detail.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/schema/prod-detail.ts): `prod_detail → product`.
- [npd-wip-processes.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/schema/npd-wip-processes.ts): `npd_wip_processes → prod_detail`.
- `npd_wip_process_consumptions → npd_wip_processes`.
- `formulation_ingredients.npd_wip_process_id → npd_wip_processes`.
- WIP definitions may reference `npd_projects` as source project.

### Project graph

Direct `npd_projects` dependents include:

- Gate checklist items and gate approvals.
- Formulations.
- Packaging components/artwork.
- Trial batches.
- Pilot runs/materials.
- Handoff checklist.
- Capacity blocks.
- Factory release status.
- Initial/shared BOM headers.
- WIP definitions.
- Legacy closeout records.

### Migration decision

**Default: no migration.**

The pipeline can resolve every existing product-bound surface through `npd_projects.product_code`. Add schema only if live preflight proves one of these conditions:

- A product used by active NPD has no project.
- Multiple active projects share a product and require an explicit canonical relationship.
- Compliance/risk records need project-specific version isolation beyond the existing product version.

If explicit disambiguation is required, add a small additive linkage table; do not rewrite product-bound history:

```text
npd_project_product_links
- org_id
- project_id
- product_code
- relationship: candidate | released | superseded
- linked_at
- linked_by
```

Do not add this table speculatively.

## 2.5 In-flight FG handling

The named records `FG-016`, `NPD-013`, `NPD-014`, and `NPD-015` are not present in repository fixtures, so their live relationships must be inventoried before phase 1.

Mandatory preflight report per record:

```text
project id/code/current_gate/current_stage/product_code
product/items/fg_npd_ext existence
prod_detail count
npd_wip_process count
formulation/current version/lock state
compliance document count
risk/V18 state
allergen declaration state
gate checklist/approval state
BOM header/version/status
pilot WO
factory release status
D365 export outputs
```

Handling:

- Project plus linked product: route directly to its current pipeline stage.
- Project without product before G3: keep project; candidate is created normally at G3.
- Project without product at/after G3: block advancement and require create/map repair.
- Product plus exactly one project: redirect compatibility route to pipeline.
- Product without project: keep `/fg/[code]` read-only; create an explicit “adopt into project” operation only if the owner requests it.
- Product linked to multiple projects: show project chooser; preserve every history chain.
- Do not backfill gates, checklists, signatures, history, or timestamps from inferred state.

---

# 3. Link/redirect strategy

## 3.1 Internal links to repoint

| Current source | Current target | New target |
|---|---|---|
| [npd-nav.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/navigation/npd-nav.ts) | `/npd`, `/fg` Apex group | Remove group; Projects points to `/pipeline` |
| [dashboard-screen.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/npd/_components/dashboard-screen.tsx) | `/fg/[productCode]` | `/pipeline/[projectId]/[stage]` |
| [dashboard-pipeline-preview.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/_components/dashboard-pipeline-preview.tsx) | `/fg/[productCode]` fallback | Always pipeline when project exists; compatibility resolver otherwise |
| [gate/page.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/gate/page.tsx) | `/fg/[code]?dept=...` | Appropriate pipeline stage with `?panel=` anchor |
| [project-header.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/_components/project-header.tsx) | “Open FG” | Recipe, Approval, Handoff, or History within same project |
| FG list/table/create hosts | `/fg/[code]` | Removed; creation flows into project/G3 |
| Compliance/risk/allergen revalidation paths | `/npd/fg/...`, `/fg/...` | Pipeline Approval/Recipe plus temporary old path during soak |
| Builder release action | `/npd/fg/[code]` revalidation | Pipeline Handoff and project root |
| E2E/spec expectations | `/fg/**` | Canonical pipeline URLs; retain separate redirect-contract tests |

Also update comments/tests whose asserted contract is `/fg`, including:

- `npd-dashboard-interactive.spec.ts`
- `npd-compliance-expiry.spec.ts`
- `npd-v18-built-blocker.spec.ts`
- `npd-fa-production-processes.spec.ts`
- `npd-fa-allergens.spec.ts`
- `npd-create-to-wo-flow.e2e.spec.ts`
- `npd-project-detail-header-rail.spec.ts`
- `route-topology.spec.ts`
- NPD subnav tests.

## 3.2 Compatibility behavior

### `/npd`

```text
302/307 temporary redirect
/{locale}/npd → /{locale}/pipeline?view=table
```

### `/fg`

```text
/{locale}/fg → /{locale}/pipeline?view=table
```

### `/fg/[productCode]`

1. Resolve product to project inside org context.
2. One project: redirect to its canonical current stage.
3. Multiple projects: read-only project chooser.
4. No project: read-only legacy FG detail.

### Child routes

```text
/fg/[code]/docs       → /pipeline/[id]/approval?panel=compliance
/fg/[code]/risks      → /pipeline/[id]/approval?panel=risks
/fg/[code]/allergens  → /pipeline/[id]/approval?panel=allergens
/fg/[code]?tab=production → /pipeline/[id]/formulation?panel=process-wip
/fg/[code]?tab=history    → /pipeline/[id]?panel=history
```

Use temporary redirects for at least one release cycle. Switch to permanent redirects only after access logs show no required unresolved/ambiguous legacy entries.

---

# 4. Safe ordering and implementation tracks

## Phase 0 — inventory and contracts

### Deliverables

- Live relationship report for `FG-016`, `NPD-013`, `NPD-014`, `NPD-015`.
- Route/link inventory frozen as a test fixture.
- Product→project resolver with ambiguity tests.
- Current V01–V08 behavior matrix.
- D365 gap report: implemented actions versus prototype/deferred UI.

### Acceptance

- Every named in-flight record classified.
- No write or migration.
- Existing E2E remains green.

## Phase 1 — Recipe owns process/WIP/ProdDetail

### Changes

- Mount [formulation-wip-panel.tsx](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/formulation-wip-panel.tsx).
- Reuse existing process/WIP actions.
- Add initial-BOM preview.
- Keep `/fg?...tab=production` fully operational.

### Acceptance

- Project at G3 with linked FG can add ProdDetail component.
- Assign ingredient to process.
- Add/reorder/update process.
- Assign roles and production line.
- Create WIP item.
- Initial BOM preview reflects saved data.
- Reload preserves data.
- Old FG production view shows the same rows.

## Phase 2 — shared validation engine and blockers

### Changes

- Implement one server-side V01–V08 evaluator.
- Wire it to Recipe, Approval, Gate, Handoff.
- Extend `gate-checklist-auto-satisfy`.
- Keep legacy department-close values read-only.

### Acceptance

- Each V01–V08 has a failing fixture.
- A FAIL blocks the configured gate server-side.
- WARN does not block unless explicitly configured.
- UI links each failure to its pipeline correction surface.
- Gate cannot advance by tampering with checklist UI.

## Phase 3 — Approval consolidation

### Changes

- Mount compliance documents.
- Mount risk register/V18.
- Mount allergen cascade summary and declaration sign-off.
- Preserve product-bound action/storage contracts.
- Repoint child-route links and revalidation.

### Acceptance

- Upload/version/download/soft-delete compliance document.
- Derived allergens remain read-only.
- Override requires reason and remains additive.
- Required sign-off/audit identity persists.
- Open High risk blocks required transition/export.
- `/fg/[code]/docs|risks|allergens` redirects correctly for uniquely linked projects.

## Phase 4 — Handoff/D365 export

### Changes

- Add real D365 export panel to Handoff.
- Connect validation, V18, release readiness, artifact generation, `fa_builder_outputs`, audit/outbox.
- Keep D365 cache informational.
- Remove deferred D365 modal CTA from canonical UI.

### Acceptance

- Export cannot run without permission/MFA requirements.
- Export cannot run with blocking validation/V18.
- Generated workbook/download is recorded.
- Export does not mutate canonical release/built state.
- Re-running follows defined version/idempotency behavior.
- Handoff/factory release remains a separate explicit operation.

## Phase 5 — repoint navigation and deploy redirects

### Changes

- Remove `/npd` and `/fg` from NPD subnav.
- Repoint every internal link.
- Deploy temporary redirect/resolver pages.
- Keep legacy page components available behind unresolved/read-only fallback.

### Acceptance

- Repository grep finds no canonical navigation to `/npd` or `/fg`.
- Only redirect handlers, compatibility fallbacks, tests, and revalidation-soak calls may contain legacy routes.
- Bookmarks for all old routes land safely.
- Ambiguous links never choose a project silently.

## Phase 6 — department workflow retirement

### Changes

- Stop presenting department close/reopen actions.
- Gate/checklist predicates become sole active workflow.
- Retain `closed_*`/`done_*` columns and history.
- Run explicit legacy-project closeout only through existing [close-out-legacy-stages.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/close-out-legacy-stages.ts), with no inferred signatures.

### Acceptance

- New project completes without department-close actions.
- Existing project remains readable and advanceable.
- Historical department values appear in history/read-only detail.
- No history timestamps or actors change.

## Phase 7 — delete dead view code last

Delete only after two successful deployed soak releases:

- `/npd` dashboard composition.
- `/fg` list/create views.
- `/fg/[productCode]` department tab shell.
- Dedicated FG docs/risks/allergens pages.
- Department-close modal and unused UI adapters.
- Legacy-only tests replaced by redirect/read-only compatibility tests.

Keep:

- Tables/schema.
- Server actions still used by pipeline.
- Audit/history queries.
- Compatibility resolver.
- Read-only legacy fallback until every unlinked FG is dispositioned.

### Acceptance

- `rg` proves no imports from deleted components.
- Route topology tests assert redirect topology.
- Full NPD lifecycle E2E passes on merged tree and deployed preview.

---

# 5. Required end-to-end NPD flow

| Step | User action | Backend invariant | Acceptance check |
|---:|---|---|---|
| 1 | Create project at `/pipeline/new` | Creates one org-scoped `npd_projects` row and initial checklist/formulation bootstrap | Project opens at Brief; no FG/product is created early |
| 2 | Complete Brief | Writes project brief fields only | Reload shows values; required Brief blockers clear |
| 3 | Advance to G3/create or map FG candidate | `npd_projects.product_code` links project to existing/new product | Exactly one linked FG candidate; V01/V02 enforced |
| 4 | Build Recipe | Formulation version is project-owned; numeric quantities remain exact | Total formulation is within 99.99–100.01%; invalid total cannot submit |
| 5 | Configure process/WIP/ProdDetail | Product→ProdDetail→WIP graph remains org-scoped and consistent | Components, processes, roles, yields, costs, WIP items survive reload |
| 6 | Preview/materialize initial BOM | Draft-first BOM ordering; shared BOM is SSOT | Initial BOM matches recipe/process inputs without duplicate lines |
| 7 | Run V01–V08 | One evaluator supplies panels and gate blockers | Forced failure appears consistently in Recipe, Approval, Gate, Handoff |
| 8 | Complete compliance | Product-bound document versions preserved | Upload/download/version/expiry state works from Approval |
| 9 | Review allergens and sign declaration | Cascade is derived; overrides additive; sign-off audited | Cascade updates; user cannot edit derived allergens; sign-off persists |
| 10 | Resolve risks | V18 High/Open is blocking | High/Open prevents gate/export; mitigation clears blocker |
| 11 | Approve gate | G3/G4 approval uses required e-signature | Immutable approval row contains signer/time/hash |
| 12 | Create pilot WO | Production/Planning ownership boundaries preserved | Pilot WO exists with linked product/BOM/route and no NPD write to `wo_outputs` |
| 13 | Verify schedulability | Planning consumes released product/BOM/routing | WO appears in Planning scheduler with valid line/material requirements |
| 14 | Complete Handoff | Factory release is explicit and separate from D365 export | Release event/read model created; BOM version becomes usable downstream |
| 15 | Export D365 artifact | Export-only anti-corruption | Workbook recorded/downloadable; MES canonical state unchanged by export |
| 16 | Audit history | Existing events/docs/build outputs remain in place | Pipeline History shows old FG events and new pipeline events in chronological order |

Canonical automated flow should replace legacy `/fg` navigation in [npd-create-to-wo-flow.e2e.spec.ts](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/e2e/npd-create-to-wo-flow.e2e.spec.ts).

---

# 6. Execution tracks

| Track | Scope | Depends on |
|---|---|---|
| C1 | Product↔project resolver and redirect contract | Phase 0 inventory |
| C2 | Recipe Process/WIP/ProdDetail mount | Existing G3 link |
| C3 | Shared V01–V08 evaluator and gate integration | C1 |
| C4 | Approval compliance + allergens | C1 |
| C5 | Approval risks/V18 | C1, C3 |
| C6 | Handoff D365 export | C3, C5 |
| C7 | Navigation/link repoint and compatibility routes | C1–C6 |
| C8 | Legacy UI deletion and test consolidation | C7 soak complete |

Per track:

```text
implementation
→ cross-provider review
→ arbitration
→ targeted fix
→ targeted Vitest/Playwright
→ serial merge
→ assembled-tree gate
→ Vercel preview
→ live Supabase E2E
```

Do not combine UI movement, redirect rollout, and deletion in one track.

---

# 7. Top risks and mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Product is now a view while FKs remain anchored to `product_legacy` | Critical | No schema rewrite; verify live relation/trigger/FK catalog before any migration |
| One product may map to multiple NPD projects/versions | Critical | Resolver returns ambiguity; chooser instead of newest-project guessing |
| Unlinked historical FGs become unreachable | High | Keep read-only compatibility fallback until explicitly dispositioned |
| Department close and gate checklist disagree | High | Gate evaluates real predicates; legacy close state is history-only |
| V01–V08 logic duplicated across stages | High | One evaluator consumed by UI, gate, and export preflight |
| D365 “move” assumed complete although modal is deferred | High | Treat export as a dedicated implementation track with artifact/audit acceptance |
| D365 cache accidentally becomes an import path | Critical | Cache remains informational; prohibit canonical MES writes from cache/export result |
| Product-code actions used from project pages lose org scoping | Critical | Resolve project and product within the same `withOrgContext`; validate association before writes |
| Existing actions revalidate only `/fg` | Medium | During soak revalidate both paths; remove old targets only after redirect rollout |
| Deleting `/fg` breaks tests and hidden imports | High | Import/route grep gate; delete only after pipeline consumers own every action/component |
| History is rewritten to look like pipeline history | Critical | Render combined history read-only; never backfill actor/time/signature |
| BOM is materialized twice from Recipe and Handoff | Critical | Recipe shows preview/draft; Handoff owns authoritative release/materialization transition |
| Active BOM trigger rejects line changes | Critical | Preserve draft-first header → lines → supersede → activate ordering |
| In-flight records are at inconsistent gates | High | Per-record live inventory and explicit remediation; no inferred advancement |
| Pilot WO exists but is not schedulable | High | E2E must verify Planning consumption, line assignment, BOM/routing, not merely WO creation |
| Route redirects hide permission errors or cross-org existence | Critical | Resolver uses org-scoped lookup and returns generic not-found/read-only state |
| Current rail/stage model is expanded unnecessarily | Medium | Keep existing nine-stage topology; panels and gate views handle migrated capability |

---

# Round-2 questions for Fable

1. Should unlinked legacy FGs remain indefinitely read-only, or is explicit adoption into a new project required?
2. Is D365 reference-cache refresh allowed as informational export preparation, or must all inbound D365 connectivity be removed?
3. Should risks live only under Approval, or remain visible as a persistent project-level drawer?
4. Does one product legitimately support multiple concurrent NPD projects, making an explicit linkage table necessary?
5. Which legacy product fields must remain editable during pipeline execution versus read-only historical detail?
6. Is authoritative initial BOM creation at G3/Recipe lock or only at Handoff? The recommended plan uses Recipe preview/draft and Handoff release.
7. Should `sensory` remain in NPD navigation despite Technical owning its writes, or become a read-only Technical status panel?

