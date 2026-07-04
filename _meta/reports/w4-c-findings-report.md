# W4-C Findings Report

## FINDING #6 — Production Unlock Deadlock

Old predicate:
- `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_components/fa-production-tab.tsx:1362` before this change: `const locked = !packSizeFilled;`
- Old prop source: `packSizeFilled` was computed from `product.pack_size` in the FG page and formulation WIP loader.

New predicate:
- `FaProductionTab` now unlocks Production when `formulationIngredientCount >= 1`, via `canEditProductionFromFormulationIngredientCount`.
- Runtime fallback to `packSizeFilled` remains only for older isolated test fixtures that do not pass the new prop.

Loader changes:
- `apps/web/app/(npd)/fa/_actions/load-formulation-wip-panel.ts` now counts `public.formulation_ingredients` through `formulations.current_version_id` for the current project and returns `formulationIngredientCount`.
- `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/page.tsx` now performs the same count by `product_code` and passes it into `FaProductionTab`.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/formulation/_components/formulation-wip-panel.tsx` passes `data.formulationIngredientCount`.

Prod detail fallback:
- Added `packages/db/migrations/433-sync-prod-detail-formulation-fallback.sql`.
- Existing `product.recipe_components` sync path remains first priority.
- When Core text is empty/null, `sync_prod_detail_rows` now falls back to current formulation ingredient rows: `formulations.current_version_id -> formulation_versions -> formulation_ingredients`, using item-linked rows (`fi.item_id is not null`) and their `rm_code`s in sequence order.

Gate copy:
- Before: “Pack Size must be filled in Core first.”
- After: “Add at least one ingredient to the current recipe/formulation before editing Production.”
- i18n delta written only to `_meta/tmp/w4-i18n-C.json`.

Test result:
```text
pnpm --filter web exec vitest run 'app/[locale]/(app)/(npd)/fg/[productCode]/_components/__tests__/production-unlock.test.ts'
Test Files  1 passed (1)
Tests  2 passed (2)
Duration  163ms
```

## FINDING #5 — Waste/Scrap Duplication

Consumer map:
- `packages/db/migrations/393-packaging-components-scrap-pct.sql:13` adds `packaging_components.scrap_pct`.
- `packages/db/migrations/427-npd-unit-foundation-fields.sql:48` adds `packaging_components.waste_pct`.
- `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:839` reads `scrap_pct`; lines `543-545` carry it onto PM BOM lines for WO material inflation.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_actions/compute.ts:342` reads `waste_pct`; line `411` passes it into packaging cost math.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_actions/listPackagingComponents.ts:73-96` reads both into the packaging read model.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_actions/upsertPackagingComponent.ts:96-97` writes both columns.
- `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_components/packaging-component-modal.tsx:298-307` now renders only the Waste % input.

Unification approach:
- Chosen alias approach, no column drop.
- The modal keeps one input labelled `Waste %`.
- On submit, the entered value is sent as both `scrapPct` and `wastePct`.
- The server action defensively aliases direct callers too: a supplied `wastePct` wins; legacy `scrapPct`-only input is mirrored to both columns.

Migration note:
- No packaging migration required. Both columns already exist (`393` and `427`).

Modal UI change:
- Removed duplicate Scrap % field and helper copy.
- Kept Waste % field; helper now describes the unified meaning for costing and material inflation.

Test result:
```text
pnpm --filter web exec vitest run 'app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_actions/__tests__/packaging-actions.test.ts'
Test Files  1 passed (1)
Tests  19 passed (19)
Duration  199ms

pnpm --filter web exec vitest run --config vitest.ui.config.ts 'app/[locale]/(app)/(npd)/pipeline/[projectId]/packaging/_components/__tests__/packaging-screen.test.tsx'
Test Files  1 passed (1)
Tests  24 passed (24)
Duration  710ms
```

## RISKS

- Existing packaging rows where `scrap_pct` and `waste_pct` already diverged are not backfilled because both columns exist and the task only allowed migration if a column was missing. New saves will converge both columns.
- `sync_prod_detail_rows` fallback only uses item-linked formulation rows, per requirement. Free-text formulation rows without `item_id` will not create prod_detail rows.
- The `packSizeFilled` prop remains as a deprecated fallback for older component tests; real loaders now pass `formulationIngredientCount`.
