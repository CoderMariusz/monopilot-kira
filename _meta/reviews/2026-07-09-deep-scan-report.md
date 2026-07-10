# Deep-Scan Report — Dead Code, Dead Schema & Unused i18n

**Date:** 2026-07-09
**Input:** 129 Codex-CONFIRMED dead / unreferenced findings (deduped to unique symbols below)
**Scope:** `apps/web`, `apps/worker`, `packages/*`, `packages/db/migrations`, i18n bundles

Findings are grouped by category, then by module (NPD → technical → planning → scheduler → production → quality → warehouse → finance → shipping → cross-cutting/db). Each row carries `file:line`, symbol, one-line evidence and a `safeDelete` flag.

> Note on duplicates: several findings appear twice in the raw input under both the `(npd)/...` and `[locale]/(app)/(npd)/...` path forms (same physical symbol), e.g. `saveCostingScenarioAction`, the three `gate-helpers.ts` functions, the ccp-deviation label builders, and the `sales_order_line_allocations` table. They are collapsed to one row each here; the totals table counts unique symbols.

---

## Totals

| Category | Unique findings | safeDelete=true | safeDelete=false |
|---|---:|---:|---:|
| 1. Dead code / unused exports | 78 | 78 | 0 |
| 2. Unreferenced tables | 2 | 1 | 1 |
| 3. Unreferenced columns | 7 | 7 | 0 |
| 4. Unreferenced pg functions | 1 | 0 | 1 |
| 5. Dead / redundant SQL | 1 | 1 | 0 |
| 6. Broken wiring | 1 | 0 | 1 |
| 7. Unused i18n | 30 | 30 | 0 |
| **Total** | **120** | **117** | **3** |

The 3 non-safe items require human/wiring review before removal: the disassembly-outputs route (may be a public API contract), `d365_finance_dlq` (already dropped by mig 404 — a no-op cleanup), and `prune_reference_csv_import_reports()` (janitor that may want cron wiring rather than deletion). `nextElementId` is also `safeDelete:false` but only because its `export` keyword is dead, not the function.

---

## 1. Dead code / unused exports

### NPD — costing
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_lib/page-loader.ts:474` | `saveCostingScenarioAction` | 'use server' action; only its own declaration matches — never imported; `CostingScreen.onSaveScenario` optional & never wired. Whole `save-scenario` path dead-ends. | yes |
| `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_components/waterfall-bar.tsx:37` | `WaterfallBar` (+ default @88, `WaterfallBarProps`, `WaterfallStepKind`) | Entire file zero importers; costing-screen renders bars inline. | yes |

### NPD — gate / pipeline / bom
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:205` | `assertAdjacent` | @deprecated; adjacency enforced by `assertAdjacentStage`; zero callers. | yes |
| `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:107` | `isProjectStage` | Exported type-guard; no callers. | yes |
| `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts:217` | `requireAdmin` | Exported async guard; siblings `requireAdvance/requireApprove` used, this orphaned. | yes |
| `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts:56` | `NPD_BOXES_OUTPUT_UNIT_PACK_FACTORS_MESSAGE` | Exported message const; single occurrence, no consumer. | yes |
| `apps/web/app/[locale]/(app)/(npd)/pipeline/_components/kanban-types.ts:63` | `PERSISTED_STAGES` | Exported `ProjectStage[]`; declared, never read. | yes |
| `apps/web/app/(npd)/_modals/advance-gate-modal-host.tsx:35` | `advanceGateTriggerHref` | Exported helper; zero refs outside `.next` artifacts. | yes |

### NPD — action `z.infer` type-alias exports (never imported)
| file:line | symbol | safe |
|---|---|---|
| `.../pipeline/[projectId]/nutrition/_actions/compute.ts:19` | `ComputeNutritionInput` | yes |
| `.../pipeline/[projectId]/handoff/_actions/get-handoff.ts:31` | `GetHandoffInput` | yes |
| `.../pipeline/[projectId]/handoff/_actions/promote-to-production.ts:41` | `PromoteToProductionInput` | yes |
| `.../pipeline/[projectId]/handoff/_actions/revert-to-npd.types.ts:1` | `RevertToNpdInput` | yes |
| `.../pipeline/[projectId]/handoff/_actions/toggle-handoff-checklist-item.ts:27` | `ToggleHandoffChecklistItemInput` | yes |
| `.../pipeline/[projectId]/packaging/_actions/shared.ts:68` | `UpsertPackagingComponentInput` | yes |
| `.../pipeline/[projectId]/packaging/_actions/shared.ts:74` | `DeletePackagingComponentInput` | yes |
| `.../pipeline/[projectId]/packaging/_actions/shared.ts:79` | `ListPackagingComponentsInput` | yes |
| `.../pipeline/[projectId]/pilot/_actions/get-pilot-recipe-materials.ts:18` | `GetPilotRecipeMaterialsInput` | yes |
| `.../pipeline/[projectId]/pilot/_actions/get-pilot-run.ts:24` | `GetPilotRunInput` | yes |
| `.../pipeline/[projectId]/pilot/_actions/toggle-pilot-checklist-item.ts:25` | `TogglePilotChecklistItemInput` | yes |
| `.../pipeline/[projectId]/pilot/_actions/upsert-pilot-material.ts:37` | `UpsertPilotMaterialInput` | yes |
| `.../pipeline/[projectId]/pilot/_actions/upsert-pilot-run.ts:47` | `UpsertPilotRunInput` | yes |
| `.../pipeline/[projectId]/trial/_actions/log-trial-batch.ts:63` | `LogTrialBatchInput` | yes |

### NPD — FG / FA
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/app/(npd)/fa/_components/fa-production-tab.tsx:1` | `FaProductionTab` re-export shim | Pure re-export of the fg module; zero importers (all consumers import fg directly). | yes |
| `apps/web/app/[locale]/(app)/(npd)/fg/[productCode]/_actions/finish-wip-types.ts:24` | `FINISH_WIP_EVENT` | `'fa.recipe_changed'`; event emitted via string literal + outbox enum, const never imported. | yes |

### Technical — allergens-config / eco / wip-library
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../technical/allergens-config/_components/config-labels.ts:75` | `buildAllergensConfigLabels` | Async label builder, zero callers; fed the orphan AllergensConfig component. | yes |
| `.../technical/allergens-config/_actions/shared.ts:59` | `hasAllergensEdit` | Permission helper, zero refs; sibling `hasAnyTechnicalAccess` used. | yes |
| `.../technical/eco/_actions/shared.ts:78` | `UpdateEcoDraftInput` / `UpdateEcoDraftInputType` | Zod schema + type; no `updateEcoDraft` action exists. | yes |
| `.../technical/wip-library/_lib/wip-definition-contract.ts:77` | `SaveWipDefinitionInput` | Duplicate of schema version in `wip-definition-schemas.ts`; contract copy unimported. | yes |
| `.../technical/wip-library/_lib/wip-definition-contract.ts:88` | `ListWipDefinitionsFilter` | Exported type, no importer. | yes |

### Planning — schedule / work-orders / forecasts / suppliers / transfer-orders
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../planning/transfer-orders/_actions/reverse-receive.ts:377` | `consumeTransferReceiveReversalEvent` | **high**: exported fn, exactly 1 repo-wide hit (its def) — never called. | yes |
| `.../planning/schedule/_lib/board.ts:122` | `capacityBlockInterval` | **high**: exported helper, zero refs; sibling `barInterval` used. | yes |
| `.../planning/_actions/forecasts.ts:439` | `ImportForecastCsvInputType` | z.infer alias, no importer. | yes |
| `.../planning/_actions/forecasts.ts:111` | `UpsertForecastInputType` | z.infer alias, no importer. | yes |
| `.../planning/_actions/reorder-thresholds.ts:88` | `UpsertThresholdInputType` | z.infer alias, no importer. | yes |
| `.../planning/work-orders/_actions/shared.ts:234` | `CreateWorkOrderInputType` | `z.input` alias never referenced (schema + z.infer type used instead). | yes |
| `.../planning/suppliers/_components/supplier-labels.ts:27` | `SupplierMessages` | Exported type, no importer. | yes |
| `.../planning/suppliers/_components/supplier-types.ts:43` | `ListSuppliersResult` | Exported type, no importer. | yes |

### Scheduler
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../scheduler/_components/scheduler-view-model.ts:189` | `unwrapMatrix` | Zero refs; changeover-matrix uses `matrixProfileKeys/matrixCellIndex` directly. | yes |

### Production — changeovers / waste
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../production/changeovers/_components/changeovers-contract.ts:58` | `ListChangeoversFn` | Contract type never referenced; siblings `CreateChangeoverFn/SignChangeoverFn` used. | yes |
| `apps/web/lib/production/waste/record-waste.ts:64` | `RecordWasteInputType` | `z.infer` alias, zero refs. | yes |

### Quality — deviations / trace / inspections / ncrs / complaints / specs / cold-chain
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../quality/_actions/ccp-deviation-actions.ts:190` | `getCcpDeviation` | **high**: exported fn, single occurrence — no caller. | yes |
| `.../quality/ccp-deviations/_components/labels.ts:96` | `buildDeviationEmptyLabels` | Empty-state labels never wired; page uses list/resolve builders only. | yes |
| `.../quality/ccp-deviations/_components/labels.ts:100` | `buildDeviationDeniedLabels` | Zero refs. | yes |
| `.../quality/ccp-deviations/_components/labels.ts:104` | `buildDeviationErrorLabels` | Zero refs. | yes |
| `.../quality/_actions/cold-chain-types.ts:45` | `DeliveryConditionCheck` | Exported type, no importer. | yes |
| `.../quality/complaints/_components/complaints-contracts.ts:118` | `ListCapaActionsAction` | Action-type alias, no importer. | yes |
| `.../quality/inspections/_components/inspection-contracts.ts:107` | `ListInspectionsAction` | Contract type alias, zero consumers. | yes |
| `.../quality/inspections/_components/inspection-contracts.ts:111` | `GetInspectionDetailAction` | Contract type alias, zero consumers. | yes |
| `.../quality/ncrs/_components/ncr-contracts.ts:220` | `ListNcrsAction` | Contract type alias, zero consumers. | yes |
| `.../quality/ncrs/_components/ncr-contracts.ts:221` | `GetNcrDetailAction` | Contract type alias, zero consumers. | yes |
| `.../quality/specifications/_components/spec-actions-contract.ts:90` | `ListSpecsFn` | Function-type alias, no importer. | yes |
| `.../quality/specifications/_components/spec-actions-contract.ts:96` | `GetSpecDetailFn` | Function-type alias, no consumer. | yes |
| `.../quality/trace/_actions/trace-input-schemas.ts:9` | `StartRecallDrillSchema` | Zod schema; no `startRecallDrill` action consumes it. | yes |
| `.../quality/trace/_actions/trace-types.ts:10` | `StartRecallDrillInput` | Type paired with the dead schema, never referenced. | yes |

### Warehouse — scanner / barcode / `ReturnType` translator aliases
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/lib/warehouse/scanner/movement.ts:394` | `listFefoLps` | Async helper, single repo-wide occurrence; scanner pick flow doesn't use it. | yes |
| `apps/web/lib/barcode/code128-barcode.tsx:38` | `resolveCode128Barcode` | Thin wrapper; `Code128Barcode` calls `resolveBarcodePayload` directly. | yes |
| `.../warehouse/wh-c-labels.ts:65` | `WhcTranslator` | `ReturnType<typeof getWhcTranslator>` alias never imported. | yes |
| `.../warehouse/wh-d-labels.ts:65` | `WhdTranslator` | ReturnType alias, never imported. | yes |
| `.../warehouse/wh-facility-labels.ts:66` | `WhFacilityTranslator` | ReturnType alias, no importer. | yes |
| `.../warehouse/adjustments/adjustments-labels.ts:68` | `AdjustmentsTranslator` | ReturnType alias, never imported. | yes |
| `.../warehouse/counts/counts-labels.ts:66` | `CountsTranslator` | ReturnType alias, no consumer. | yes |
| `.../warehouse/inbound/wh-inbound-labels.ts:66` | `WhInboundTranslator` | ReturnType alias, never imported. | yes |
| `.../warehouse/license-plates/lp-labels.ts:61` | `LpTranslator` | ReturnType alias, never imported. | yes |

### Finance / WAC
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/lib/finance/upsert-wac.ts:438` | `computeWacDebitDelta` | Zero callers; superseded by monolithic `debitWac`. Return type stays alive via `debitWac`. | yes |
| `apps/web/lib/finance/upsert-wac.ts:470` | `applyWacDebitDelta` | Zero callers; paired unused compute-then-apply split; `debitWac` calls `upsertWac` directly. | yes |

### Shipping — customers
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../shipping/customers/_components/customer-types.ts:55` | `ListCustomersResult` | Exported type, no consumer. | yes |
| `.../shipping/customers/_components/customer-types.ts:57` | `GetCustomerResult` | Exported type, never imported. | yes |

### Cross-cutting — auth / packages / units backups / labels
| file:line | symbol | evidence | safe |
|---|---|---|---|
| `apps/web/lib/auth/supabase-browser.ts:20` | `createBrowserSupabaseClient` | Entire file: browser Supabase factory nothing consumes. | yes |
| `packages/ui/src/Slider.tsx:1` | `Slider` (default) | Subpath-exported, zero importers. | yes |
| `packages/gs1/src/barcode-resolve.ts:88` | `resolveGtinBarcode` | Exported from gs1 index; no external/internal caller, no test (unlike `resolveSsccBarcode`). | yes |
| `packages/observability/src/meter.ts:5` | `getMeter` | One-line wrapper, zero references (sibling `getTracer` has smoke test). | yes |
| `.../settings/units/_actions/manage-units.ts.bak` | whole file | Git-tracked stale backup, never compiled/imported. | yes |
| `.../settings/units/page.tsx.bak` | whole file | Git-tracked stale backup, never compiled/imported. | yes |
| `.../settings/labels/_actions/label-elements.ts:62` | `nextElementId` | Only caller is `createElement()` in-file — the `export` keyword is dead, not the fn. | **no** (drop `export` only) |

---

## 2. Unreferenced tables

| file:line | symbol | evidence | safe |
|---|---|---|---|
| `packages/db/migrations/288-shipping-so-core.sql:166` | `public.sales_order_line_allocations` | RLS + FKs + unique index, but 0 reads/writes anywhere; SO-line allocations actually use `public.inventory_allocations` (13 refs). Orphaned duplicate. | yes |
| `packages/db/migrations/199-finance-schema-and-rbac-seed.sql:295` | `d365_finance_dlq` | Never referenced; **already dropped** by `404-drop-dead-tables-p7.sql:16` — object no longer exists. | **no** (already gone) |

---

## 3. Unreferenced columns

All referenced only by their defining migration + Drizzle schema + expected snapshot; no producer/consumer in app code.

| file:line | symbol | evidence | safe |
|---|---|---|---|
| `packages/db/schema/work-orders.ts:45` | `work_orders.factory_release_event_id` | mig 176 + schema + snapshot only. | yes |
| `packages/db/schema/work-orders.ts:46` | `work_orders.factory_release_status_at_creation` | mig 176 + schema + snapshot only. | yes |
| `packages/db/schema/work-orders.ts:81` | `work_orders.pause_reason` | `paused_at` is written by pause-resume-wo.ts, but `pause_reason` never set/read. | yes |
| `packages/db/schema/work-orders.ts:171` | `wo_materials.consume_whole_lp` | mig 176 + schema + snapshot only. | yes |
| `packages/db/schema/work-orders.ts:175` | `wo_materials.condition_flags` | mig 176 + schema + snapshot only. | yes |
| `packages/db/schema/work-orders.ts:174` | `wo_materials.scrap_percent` | mig 176 + schema + snapshot only; yield uses expected/actual columns. | yes |
| `packages/db/schema/warehouse-lp.ts:71` | `license_plates.date_code_rendered` | mig 191 + schema + snapshot only; siblings `date_code/gtin/lp_code` used. | yes |

> Removing columns requires a drop migration; keep the schema-file edit and the migration in the same change.

---

## 4. Unreferenced pg functions

| file:line | symbol | evidence | safe |
|---|---|---|---|
| `packages/db/migrations/045-reference-csv-import-reports.sql:36` | `public.prune_reference_csv_import_reports()` | CSV import-report janitor, never invoked — no pg_cron (siblings in mig 034/036 have `$cron$` wiring, this doesn't), no trigger, no app call. Only appears in mig-051 revoke loop + a test string literal. | **no** (decide: wire cron vs drop) |

---

## 5. Dead / redundant SQL

| file:line | symbol | evidence | safe |
|---|---|---|---|
| `scripts/combined-migrations.sql:1` | whole file | Stale snapshot ("Generated 2026-05-13, 33 files") vs 443 live migrations; real runner reads `migrations/*.sql` directly, nothing references this file. | yes |

---

## 6. Broken wiring

| file:line | symbol | evidence | safe |
|---|---|---|---|
| `.../production/work-orders/[id]/disassembly-outputs/route.ts:60` | `POST /work-orders/[id]/disassembly-outputs` | No client posts here; `use-wo-action.ts` `ROUTE_SEGMENT` has no disassembly segment; desktop modal wired to Server Action `registerDisassemblyOutputDesktop` instead. Only route file + doc comments reference the path. | **no** (confirm not a public/API contract before removing) |

---

## 7. Unused i18n

Present in `en/pl/ro/uk` — delete the key across all locale files. Grep evidence in parentheses.

### NPD
| symbol | evidence | safe |
|---|---|---|
| `npd.briefDetail.*` (~40 keys) | grep `briefDetail` = 0; page uses `npd.briefStage`. | yes |
| `npd.briefList.*` | grep = 0; never passed to next-intl. | yes |
| `npd.briefModals.*` (create.* + complete.*) | grep = 0. | yes |
| `npd.pipelineCreate.*` | grep = 0. | yes |
| `npd.pipelineSwitcher.filterG0..filterG4` | tabs switch on named keys, no `filterG*`. | yes |
| `npd.pipelineKpi.totalHint` | namespace loaded, leaf never referenced. | yes |
| `npd.projectDetail.deptStrip.pendingCaption`, `npd.projectDetail.stageRailAriaLabel` | grep = 0. | yes |
| `npd.projectWizard.fieldVolume`, `fieldVolumePlaceholder` | grep = 0. | yes |
| `npd.briefStage.fieldExpectedVolume` | grep = 0. | yes |
| `npd.faCoreTab.fields.volument_box` | typo key ("volument"); grep = 0. | yes |
| `npd.faProductionTab.effectiveKgPerPackHint` | grep = 0. | yes |
| `npd.formulationEditor.pctRangeError`, `totalPctWarning` | grep = 0. | yes |
| `npd.packaging.fieldScrapPctHelp` | grep = 0. | yes |
| `npd.handoff.warnings.routing_no_line`, `routing_no_processes` | superseded by `generateWarningNoLine/NoProcesses`. | yes |
| `npd.costing` snake_case twins (waterfall_title, col_step, col_per_kg/pack/batch, inputs_title, input_avg_batch/overhead/logistics/weekly_volume/runs_per_week, edit_in_brief, save_inputs, saving_inputs, saved_inputs, save_inputs_error, blocked_title/prefix, not_derivable, blocked_yield_required/brief_inputs/packs_per_case/ingredient_costs) | `buildCostingLabels()` reads only camelCase twins; `step_*` keys are NOT dead. | yes |

### Technical
| symbol | evidence | safe |
|---|---|---|
| `technical.routings.manager.fMachine/fResourceType/fResourceTypeLine/fResourceTypeMachine` | Machines removed (decision 2026-07-06); grep = 0. | yes |
| `technical.bom.disassembly.needCoProduct`, `needYield` | grep = 0. | yes |
| `technical.allergens.process.modal.intensityMayContain` | grep = 0. | yes |
| `Technical.factorySpecs.newSpec` | grep = 0. | yes |

### Quality
| symbol | evidence | safe |
|---|---|---|
| `quality.ccpMonitoring.record.{ccpOption,limitHint,woClear,woHelp,woNoMatches,woPickedChip,woSearching}` | not among resolved record.* keys; grep = 0. | yes |
| `quality.trace.{drillSaveError,drillSaved}`, `quality.trace.form.{saveDrill,savingDrill}` | grep = 0. | yes |

### Planning / production / items / oee
| symbol | evidence | safe |
|---|---|---|
| `Planning.import.comingSoonTooltip` | grep = 0. | yes |
| `production.dashboard.nav.changeover` (+ whole `production.changeover.*`) | NAV_CARDS use plural `changeovers`; singular consumed only by orphan `/production/changeover` page. | yes |
| `items.list_price_gbp_list_label`, `items.supplier_price_gbp_label` | grep = 0. | yes |
| `oee.andon.stubBadge`, `oee.andon.stubNotice` | grep = 0 (generic `Skeleton.stubBadge` is separate). | yes |

---

## Top safe-deletions (highest value first)

1. **Whole dead files** — biggest byte/line wins, zero risk:
   - `costing/_components/waterfall-bar.tsx` (whole file)
   - `lib/auth/supabase-browser.ts` (whole file)
   - `settings/units/manage-units.ts.bak` + `settings/units/page.tsx.bak` (git-tracked backups)
   - `scripts/combined-migrations.sql` (stale 33-file snapshot vs 443 live)
   - `fa/_components/fa-production-tab.tsx` (re-export shim)
2. **High-severity dead functions** — `consumeTransferReceiveReversalEvent`, `getCcpDeviation`, `capacityBlockInterval` (each a real fn, exactly one repo-wide hit).
3. **Dead WAC pair** — `computeWacDebitDelta` + `applyWacDebitDelta` (superseded by `debitWac`).
4. **gate-helpers trio** — `assertAdjacent` (@deprecated) + `isProjectStage` + `requireAdmin`.
5. **i18n namespace sweeps** — `npd.briefDetail.*`, `npd.briefList.*`, `npd.briefModals.*`, `npd.pipelineCreate.*` and the costing snake_case twins remove hundreds of keys across 4 locale files.
6. **Dead columns** — the 6 `work_orders`/`wo_materials` columns + `license_plates.date_code_rendered` (one drop migration).
7. **Orphan table** — `sales_order_line_allocations` (duplicate of `inventory_allocations`).

---

## Refactor clusters (agent-sized delete batches)

Each cluster is a group of `safeDelete=true` findings a single agent can remove together. Type-alias deletions must be preceded by a grep to confirm zero importers (already Codex-confirmed), then `pnpm typecheck` after.

### CLUSTER 1 — gate-helpers dead guards
- **Files:** `apps/web/app/(npd)/pipeline/_actions/_lib/gate-helpers.ts`
- **Deletions:** Remove `assertAdjacent` (@deprecated, line 205), `isProjectStage` (type guard, line 107), `requireAdmin` (async guard, line 217) and any now-unused imports they alone pulled in. Keep `requireAdvance`/`requireApprove`/`assertAdjacentStage`.

### CLUSTER 2 — costing save-scenario + waterfall
- **Files:** `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/costing/_lib/page-loader.ts`, `.../costing/_lib/save-scenario.ts`, `.../costing/_components/waterfall-bar.tsx`
- **Deletions:** Delete `saveCostingScenarioAction` (page-loader.ts:474) and the whole dead `save-scenario` module it's the sole non-test consumer of; delete `waterfall-bar.tsx` in full (`WaterfallBar` named+default, `WaterfallBarProps`, `WaterfallStepKind`). Drop the optional-never-wired `onSaveScenario` prop from `CostingScreen`.

### CLUSTER 3 — NPD action `z.infer`/`z.input` type aliases
- **Files:** nutrition/`compute.ts`, handoff/`get-handoff.ts` + `promote-to-production.ts` + `revert-to-npd.types.ts` + `toggle-handoff-checklist-item.ts`, packaging/`shared.ts`, pilot/`get-pilot-recipe-materials.ts` + `get-pilot-run.ts` + `toggle-pilot-checklist-item.ts` + `upsert-pilot-material.ts` + `upsert-pilot-run.ts`, trial/`log-trial-batch.ts` (all under `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/`)
- **Deletions:** Remove the 14 unused exported type aliases (`ComputeNutritionInput`, `GetHandoffInput`, `PromoteToProductionInput`, `RevertToNpdInput`, `ToggleHandoffChecklistItemInput`, `Upsert/Delete/ListPackagingComponentsInput`, `GetPilotRecipeMaterialsInput`, `GetPilotRunInput`, `TogglePilotChecklistItemInput`, `UpsertPilotMaterialInput`, `UpsertPilotRunInput`, `LogTrialBatchInput`). Keep the underlying `Input`/schema each derives from. `revert-to-npd.types.ts` becomes empty — delete the file and its `.types` import.

### CLUSTER 4 — NPD misc dead consts + shims
- **Files:** `_actions/_lib/materialize-npd-bom.ts`, `pipeline/_components/kanban-types.ts`, `_modals/advance-gate-modal-host.tsx`, `fg/[productCode]/_actions/finish-wip-types.ts`, `fa/_components/fa-production-tab.tsx`
- **Deletions:** Remove `NPD_BOXES_OUTPUT_UNIT_PACK_FACTORS_MESSAGE`, `PERSISTED_STAGES`, `advanceGateTriggerHref`, `FINISH_WIP_EVENT`; delete the `fa-production-tab.tsx` re-export shim file entirely.

### CLUSTER 5 — Quality contract/type aliases + trace recall-drill
- **Files:** inspections/`inspection-contracts.ts`, ncrs/`ncr-contracts.ts`, complaints/`complaints-contracts.ts`, specifications/`spec-actions-contract.ts`, `_actions/cold-chain-types.ts`, trace/`trace-input-schemas.ts`, trace/`trace-types.ts` (under `.../(modules)/quality/`)
- **Deletions:** Remove `ListInspectionsAction`, `GetInspectionDetailAction`, `ListNcrsAction`, `GetNcrDetailAction`, `ListCapaActionsAction`, `ListSpecsFn`, `GetSpecDetailFn`, `DeliveryConditionCheck`, plus the dead recall-drill pair `StartRecallDrillSchema` + `StartRecallDrillInput`.

### CLUSTER 6 — ccp-deviation label builders + dead action
- **Files:** `.../quality/ccp-deviations/_components/labels.ts`, `.../quality/_actions/ccp-deviation-actions.ts`
- **Deletions:** Remove `buildDeviationEmptyLabels`, `buildDeviationDeniedLabels`, `buildDeviationErrorLabels` from labels.ts (keep `buildDeviationListLabels`/`buildDeviationResolveLabels`); remove `getCcpDeviation` (line 190, no caller) from ccp-deviation-actions.ts.

### CLUSTER 7 — Warehouse `ReturnType` translator aliases
- **Files:** warehouse `wh-c-labels.ts`, `wh-d-labels.ts`, `wh-facility-labels.ts`, `adjustments/adjustments-labels.ts`, `counts/counts-labels.ts`, `inbound/wh-inbound-labels.ts`, `license-plates/lp-labels.ts`
- **Deletions:** Remove the 7 unused `export type XTranslator = ReturnType<typeof getXTranslator>` aliases. Keep every `getXTranslator` factory (35 uses).

### CLUSTER 8 — Planning + scheduler + production dead exports
- **Files:** planning `transfer-orders/_actions/reverse-receive.ts`, `schedule/_lib/board.ts`, `_actions/forecasts.ts`, `_actions/reorder-thresholds.ts`, `work-orders/_actions/shared.ts`, `suppliers/_components/supplier-labels.ts` + `supplier-types.ts`; scheduler `_components/scheduler-view-model.ts`; production `changeovers/_components/changeovers-contract.ts`, `lib/production/waste/record-waste.ts`
- **Deletions:** Remove `consumeTransferReceiveReversalEvent` (fn), `capacityBlockInterval` (fn), `unwrapMatrix` (fn), `ListChangeoversFn`, and the inferred-type aliases `ImportForecastCsvInputType`, `UpsertForecastInputType`, `UpsertThresholdInputType`, `CreateWorkOrderInputType`, `SupplierMessages`, `ListSuppliersResult`, `RecordWasteInputType`.

### CLUSTER 9 — Finance/WAC + technical + warehouse/barcode + shipping + packages + auth + backups
- **Files:** `lib/finance/upsert-wac.ts`; technical `allergens-config/_components/config-labels.ts` + `allergens-config/_actions/shared.ts` + `eco/_actions/shared.ts` + `wip-library/_lib/wip-definition-contract.ts`; `lib/warehouse/scanner/movement.ts`; `lib/barcode/code128-barcode.tsx`; shipping `customers/_components/customer-types.ts`; `lib/auth/supabase-browser.ts`; `packages/ui/src/Slider.tsx`; `packages/gs1/src/barcode-resolve.ts`; `packages/observability/src/meter.ts`; `settings/units/manage-units.ts.bak` + `page.tsx.bak`; `scripts/combined-migrations.sql`
- **Deletions:** Remove `computeWacDebitDelta` + `applyWacDebitDelta`; `buildAllergensConfigLabels`, `hasAllergensEdit`, `UpdateEcoDraftInput/Type`, `SaveWipDefinitionInput` + `ListWipDefinitionsFilter` (contract copies); `listFefoLps`; `resolveCode128Barcode`; `ListCustomersResult` + `GetCustomerResult`; whole file `supabase-browser.ts`; `Slider.tsx`; `resolveGtinBarcode` (+ drop from gs1 index); `getMeter` (+ drop from observability index); the two `.bak` files; `scripts/combined-migrations.sql`.

### CLUSTER 10 — Unused i18n sweep (en/pl/ro/uk)
- **Files:** `apps/web/i18n/{en,pl,ro,uk}.json`
- **Deletions:** Remove, across all four locale files: NPD namespaces `briefDetail.*`, `briefList.*`, `briefModals.*`, `pipelineCreate.*`; leaves `pipelineSwitcher.filterG0..4`, `pipelineKpi.totalHint`, `projectDetail.deptStrip.pendingCaption`, `projectDetail.stageRailAriaLabel`, `projectWizard.fieldVolume(+Placeholder)`, `briefStage.fieldExpectedVolume`, `faCoreTab.fields.volument_box`, `faProductionTab.effectiveKgPerPackHint`, `formulationEditor.pctRangeError/totalPctWarning`, `packaging.fieldScrapPctHelp`, `handoff.warnings.routing_no_line/routing_no_processes`; the `npd.costing` snake_case twins (keep camelCase + `step_*`); technical `routings.manager.fMachine/fResourceType*`, `bom.disassembly.needCoProduct/needYield`, `allergens.process.modal.intensityMayContain`, `factorySpecs.newSpec`; quality `ccpMonitoring.record.{ccpOption,limitHint,wo*}`, `trace.{drillSaveError,drillSaved}`, `trace.form.{saveDrill,savingDrill}`; `Planning.import.comingSoonTooltip`; `production.dashboard.nav.changeover` + `production.changeover.*`; `items.list_price_gbp_list_label` + `items.supplier_price_gbp_label`; `oee.andon.stubBadge/stubNotice`.
