# NPD - tester how-to guide

> Per-module tester guide for the NPD (New Product Development) flow as implemented today. Routes are
> written without the `[locale]` prefix; use `/<locale>/...` in the browser, for
> example `/pl/pipeline`.
>
> NPD is split across the localized route group in `apps/web/app/[locale]/(app)/(npd)`
> and shared Server Actions in `apps/web/app/(npd)`. The prompt's
> `supabase/migrations` directory does not exist in this checkout; migration 333 is
> `packages/db/migrations/333-npd-dynamic-fields.sql`.

---

### Section 1: Function Inventory

| Action | What it does | Where (page/route) | Data source (table) | Reverse/correction |
|---|---|---|---|---|
| `createProject` (`pipeline/_actions/create-project.ts`) | Creates an NPD project, allocates `NPD-###`, stores brief fields, seeds gate checklist items and emits `npd.project.created`. | `/pipeline/new` | writes `npd_projects`, `org_sequences`, `gate_checklist_items`, `outbox_events`; reads `Reference.GateChecklistTemplates` | Delete while allowed with `deleteProject`; otherwise move forward through stage actions. |
| `listProjects` (`pipeline/_actions/list-projects.ts`) | Lists NPD projects with current stage, gate, closeout and progress data. | `/pipeline` | reads `npd_projects`, `gate_checklist_items`, `npd_legacy_closeout` | Read-only. |
| `getProject` (`pipeline/_actions/get-project.ts`) | Loads one project, checklist rows, approval timeline, recipe ingredient count and header permissions. `Done_<Dept>:` checklist rows are derived from FA closure flags. | `/pipeline/[projectId]`, `/pipeline/[projectId]/gate` | reads `npd_projects`, `gate_checklist_items`, `gate_approvals`, `formulations`, `formulation_versions`, `formulation_ingredients`, `product` | Read-only; corrections use checklist toggle, gate approval, advance or rollback actions. |
| `toggleGateChecklistItem` (`pipeline/_actions/toggle-gate-checklist-item.ts`) | Sets or clears a manual checklist item and writes an audit row. Refuses `Done_<Dept>:` rows because they are FA-derived. | `/pipeline/[projectId]/gate` | writes `gate_checklist_items`, `audit_events`; reads `npd_projects`, `product` | Toggle the same manual item back. FA-derived rows reverse by reopening the FA department. |
| `advanceProjectGate` (`pipeline/_actions/advance-project-gate.ts`) | Advances exactly one operational stage: `brief -> recipe -> packaging -> trial -> sensory -> pilot -> approval -> handoff -> launched`; derives the gate and emits `npd.gate.advanced`. Creates/maps FG entering `packaging`, requires G4 e-sign entering `handoff`, and runs closeout entering `launched`. | `/pipeline`, `/pipeline/[projectId]`, `/pipeline/[projectId]/gate` | writes `npd_projects`, `outbox_events`; side effects may write `product`, `handoff_checklists`, `handoff_checklist_items`, `npd_legacy_closeout` | Roll back earlier gates with `rollbackGate` before launch. `launched` returns `ALREADY_CLOSED` and is terminal. |
| `approveProjectGate` (`pipeline/_actions/approve-project-gate.ts`) | Records G3/G4 approval or rejection. Approval requires password e-sign and writes `gate_approvals`; it does not auto-advance. | `/pipeline/[projectId]/gate`, `/pipeline/[projectId]/approval` | writes `gate_approvals`, `outbox_events`, e-sign tables via `signEvent`; reads `npd_projects`, `gate_checklist_items` | Rejection records a reason. Approved records are append-only; advance remains a separate action. |
| `rollbackGate` / `revertGate` (`pipeline/_actions/revert-gate.ts`) | Reverts a non-launched project to an earlier gate with a reason, audit row and `npd.gate.reverted` event. | Gate/admin correction seam | writes `npd_projects`, `audit_events`, `outbox_events` | Forward again with `advanceProjectGate`; refused once launched. |
| `createOrMapFgCandidateAtG3` (`pipeline/_actions/create-or-map-fg-candidate-at-g3.ts`) | Explicitly creates or maps the FG candidate for a G2/G3 project. | G3 candidate seam; normally entered via `/pipeline/[projectId]` advance into packaging | writes/updates `npd_projects`, `product`, `outbox_events` through `createFgCandidate` | Map another candidate only while the gate helper permits it; no separate unmap action was found. |
| `closeOutLegacyStages` (`pipeline/_actions/close-out-legacy-stages.ts`) | Terminal closeout from `handoff` to launched; materializes NPD BOM, verifies release/spec/pilot/shelf-life/MRP/allergen evidence, writes `npd_legacy_closeout` and sets stage `launched`. | `/pipeline/[projectId]/gate`; also called by `advanceProjectGate` when target stage is `launched` | writes `npd_legacy_closeout`, `npd_projects`; reads `factory_release_status`, `product`, `gate_approvals`, `bom_headers`, pilot evidence | None after success. Existing closeout returns already closed; launched is terminal. |
| `createFa` (`fa/actions/create-fa.ts`) | Creates a standalone FG/FA product with V01 product-code and V02 name validation, emits `fa.created`. | `/fa`, `/products/new` | writes `product`, `outbox_events` | Soft-delete with `deleteFa` if not built or released. |
| `deleteFa` (`fa/actions/delete-fa.ts`) | Soft-deletes an unbuilt/unreleased FA/FG, audits and emits `fa.deleted`. | `/fa/[productCode]` | writes `product.deleted_at`, `audit_events`, `outbox_events`; reads `factory_release_status` | No restore action found in NPD; create a new product or restore manually outside UI. |
| `updateFaCell` (`fa/actions/update-fa-cell.ts`) | Updates a schema-driven FA cell after DeptColumns validation and per-department RBAC; resets `built`; recipe component edits sync `prod_detail`. | `/fa/[productCode]?tab=core`, `?tab=planning`, `?tab=commercial`, `?tab=production`, `?tab=technical`, `?tab=mrp`, `?tab=procurement` | writes `product`, `outbox_events`; reads `Reference.DeptColumns`, reference dropdown tables; may call `sync_prod_detail_rows` | Edit the field again. Formula/read-only columns are rejected. |
| `closeDeptSection` (`fa/actions/close-dept-section.ts`) | Closes one FA department after `is_all_required_filled(productCode, dept)` passes; emits `fa.dept_closed`. | `/fa/[productCode]` right panel **Zamknij dział** / **Potwierdź zamknięcie** | writes `product.closed_*`, `outbox_events`; reads required DeptColumns through DB function | Reopen with `reopenDeptSection` if user has `npd.closed_flag.unset`. |
| `reopenDeptSection` (`fa/actions/reopen-dept-section.ts`) | Clears a department closure flag and emits `fa.dept_reopened`. | `/fa/[productCode]` correction seam | writes `product.closed_*`, `outbox_events` | Close again with `closeDeptSection` after required fields pass. |
| `getRequiredFieldsForDept` (`fa/actions/get-required-fields-for-dept.ts`) | Reads required-field status for the close-department modal. | `/fa/[productCode]` close modal | reads `Reference.DeptColumns`, `product` | Read-only. |
| `addProdDetailComponent` (`fa/actions/add-prod-detail-component.ts`) | Adds an org-scoped production component backed by a real item; idempotent on product + item. | `/fa/[productCode]?tab=production` | writes `prod_detail`, `outbox_events`; reads `product`, `items` | Remove with `removeProdDetailComponent`. |
| `removeProdDetailComponent` (`fa/actions/add-prod-detail-component.ts`) | Deletes a production component and emits `fa.recipe_changed`. | `/fa/[productCode]?tab=production` | deletes `prod_detail`, writes `outbox_events` | Add the component again with `addProdDetailComponent`. |
| `setAllergenOverride` (`fa/actions/set-allergen-override.ts`) | Adds or removes a manual allergen override, supersedes the previous active override, then refreshes the FA allergen set. | `/fa/[productCode]/allergens`, allergen override modal | writes `fa_allergen_overrides`; calls `update_fa_allergen_set`; reads `product` | Submit a new opposite override with a reason; history is append-only/superseded, not deleted. |
| `readAllergenCascade` (`fa/[productCode]/allergens/_actions/read-allergen-cascade.ts`) | Reads derived/final allergen cascade for the FA allergen widget. | `/fa/[productCode]/allergens`, FA detail allergen slot | reads allergen cascade functions/tables including `fa_allergen_cascade`, `fa_allergen_overrides` | Read-only; correction is `setAllergenOverride`. |
| `refreshAllergenCascade` (`fa/[productCode]/allergens/_actions/refresh-allergen-cascade.ts`) | Rebuilds the cascade for the FA. | `/fa/[productCode]/allergens` | calls cascade refresh function; reads/writes allergen cascade tables | Refresh again after source ingredient/process changes. |
| `createFormulationDraft` (`pipeline/[projectId]/formulation/_actions/create-draft.ts`) | Creates the first formulation header/version or returns the existing current draft. | `/pipeline/[projectId]/formulation` | writes `formulations`, `formulation_versions`; reads `npd_projects` | No delete version action found; continue editing the draft. |
| `getFormulation` (`pipeline/[projectId]/formulation/_actions/get-formulation.ts`) | Loads formulation header, current version, ingredients, cached cost/nutrition/allergen results. Allergens for item-linked rows are resolved from `item_allergen_profiles`. | `/pipeline/[projectId]/formulation` | reads `formulations`, `formulation_versions`, `formulation_ingredients`, `formulation_calc_cache`, `items`, `item_allergen_profiles`, `Reference.RawMaterials` | Read-only. |
| `saveDraft` (`pipeline/[projectId]/formulation/_actions/save-draft.ts`) | Replaces draft ingredients, validates real item IDs, derives master cost and allergen arrays server-side, and writes audit. | `/pipeline/[projectId]/formulation` | deletes/inserts `formulation_ingredients`; writes `formulation_audit_log`; reads `items`, `item_allergen_profiles`, `Reference.Allergens` | Edit and save the draft again while state is `draft`; locked/submitted versions are refused. |
| `recomputeAndCache` (`pipeline/[projectId]/formulation/_actions/recompute.ts`) | Recomputes cost, nutrition and allergen JSON from the version ingredients using decimal strings, then upserts cache. | `/pipeline/[projectId]/formulation` after save/recompute | writes `formulation_calc_cache`; reads `formulation_versions`, `formulations`, `npd_projects`, `formulation_ingredients`, `item_allergen_profiles`, `Reference.RawMaterials` | Recompute again after ingredient/cost/source data corrections. |
| `submitForTrial` (`pipeline/[projectId]/formulation/_actions/submit-for-trial.ts`) | Moves a draft version to `submitted_for_trial` after 100% total, cost and nutrition-target gates pass; audits and emits outbox. | `/pipeline/[projectId]/formulation` **Zgłoś do próby** | writes `formulation_versions`, `formulation_audit_log`, `outbox_events`; reads `formulations`, `formulation_ingredients`, `formulation_calc_cache` | No revert-to-draft action found; create a later version or continue to lock. |
| `lockVersion` (`pipeline/[projectId]/formulation/_actions/lock-version.ts`) | Locks a draft or trial version, stamps formulation lock metadata, and cascades recipe components to `product` when mapped. | `/pipeline/[projectId]/formulation` **Zablokuj recepturę** | writes `formulation_versions`, `formulations`, `product`, `formulation_audit_log`, `outbox_events`; reads `formulations`, `formulation_versions`, `formulation_ingredients` | No unlock action found; locked version is view-only. |
| `compareVersions` (`pipeline/[projectId]/formulation/_actions/compare-versions.ts`) | Read-only diff of two formulation versions, capped at 50 ingredient rows. | `/pipeline/[projectId]/formulation` **Porównaj wersje** | reads `formulation_versions`, `formulations`, `formulation_ingredients` | Read-only. |
| `listTrialBatches` (`trial/_actions/list-trial-batches.ts`) | Lists project trial batches with decimal values as strings. | `/pipeline/[projectId]/trial` | reads `trial_batches`, `users`, `npd_projects` | Read-only; correction uses `updateTrialBatch`. |
| `logTrialBatch` (`trial/_actions/log-trial-batch.ts`) | Inserts a trial batch, enforces duplicate `trial_no`, writes audit, and revalidates the trial page. | `/pipeline/[projectId]/trial` **+ Dodaj próbę** / **Zapisz próbę** | writes `trial_batches`, `audit_log`; reads `npd_projects` | Edit with `updateTrialBatch`; no delete action found. |
| `updateTrialBatch` (`trial/_actions/update-trial-batch.ts`) | Edits an existing trial batch and writes before/after audit. | `/pipeline/[projectId]/trial` **Edytuj** / **Zapisz zmiany** | writes `trial_batches`, `audit_log`; reads `trial_batches` | Edit again; no hard-delete/cancel action found. |
| `getSensoryPanel` (`sensory/_actions/getSensoryPanel.ts`) | Read-only NPD display of Technical-owned sensory panel for the project product. | `/pipeline/[projectId]/sensory` | reads `npd_projects`, `product`, `technical_sensory_evaluations`, `technical_sensory_attribute_scores`, `technical_sensory_panelist_comments` | Not corrected in NPD; writes belong to Technical. |
| `computeAndSaveInitialBreakdown` (`costing/_actions/compute.ts`) | Computes initial costing from the current recipe and saves a breakdown when an FG is mapped and all costs exist. | `/pipeline/[projectId]/costing` **Oblicz kalkulację** | writes `costing_breakdowns`, `costing_waterfall_steps`; reads `formulations`, `formulation_versions`, `formulation_ingredients`, `npd_projects`, `Reference.AlertThresholds` | Recompute after fixing ingredients/costs; hard-fail margins are not saved. |
| `computeCosting` (`costing/_actions/compute.ts`) | Computes and persists a named costing waterfall for a product/scenario; refuses negative margin. | `/pipeline/[projectId]/costing` | writes `costing_breakdowns`, `costing_waterfall_steps`; reads `Reference.AlertThresholds` | Recompute/overwrite the same scenario. |
| `saveCostingScenario` (`costing/_actions/save-scenario.ts`) | Saves a what-if scenario's exact decimal-string parameters and computed snapshot. | `/pipeline/[projectId]/costing` **Zapisz scenariusz** | writes `costing_breakdowns` | Save the same scenario name again to overwrite. |
| `getHandoff` (`handoff/_actions/get-handoff.ts`) | Reads handoff checklist, destination BOM facts, release gate status, and self-heals missing checklist rows for handoff/launched projects. | `/pipeline/[projectId]/handoff` | reads/writes `handoff_checklists`, `handoff_checklist_items`; reads `npd_projects`, `product`, `warehouses`, `factory_release_status`, `bom_headers` | Read-only apart from self-heal; toggle checklist or promote for changes. |
| `toggleHandoffChecklistItem` (`handoff/_actions/toggle-handoff-checklist-item.ts`) | Toggles a handoff checklist item unless the checklist is already promoted; audits the toggle. | `/pipeline/[projectId]/handoff` | writes `handoff_checklist_items`, `audit_events`; reads `handoff_checklists` | Toggle the item back before promotion. |
| `promoteToProduction` (`handoff/_actions/promote-to-production.ts`) | Runs the real factory release flow, requires complete handoff checklist, stamps `promoted` and destination BOM details. | `/pipeline/[projectId]/handoff` **✓ Promuj do BOM produkcyjnego** | writes `handoff_checklists`, `audit_events`; calls `releaseNpdProjectToFactory` which writes factory release state/outbox | Not a launch. After promotion, checklist toggles are blocked; terminal launch is separate. |
| `releaseNpdProjectToFactory` (`builder/_actions/release-npd-project-to-factory.ts`) | Releases the NPD FG/BOM to factory after preflight gates pass. | Handoff promotion path | writes `factory_release_status`, outbox/release records; reads `npd_projects`, BOM/spec/release preflight data | Block/retry through release status helpers; no NPD UI unrelease found. |
| `listDepartments` / `listFieldCatalog` / `listDepartmentFields` (`settings/npd-fields/_actions/npd-field-config.ts`) | Reads NPD dynamic department and field configuration. | `/settings/npd-fields` | reads `npd_departments`, `npd_field_catalog`, `npd_department_field` | Read-only. |
| `createDepartment` / `updateDepartment` / `setDepartmentActive` (`settings/npd-fields/_actions/npd-field-config.ts`) | Creates/edits/deactivates dynamic NPD departments; requires `npd.schema.edit`. | `/settings/npd-fields` | writes `npd_departments` | Reactivate with `setDepartmentActive`; update fields again. |
| `createField` / `updateField` / `setFieldActive` (`settings/npd-fields/_actions/npd-field-config.ts`) | Creates/edits/deactivates field catalog rows; data type limited by migration 333. | `/settings/npd-fields` | writes `npd_field_catalog` | Reactivate/update the field. Existing assignments remain unless removed. |
| `assignFieldToDepartment` / `updateAssignment` / `removeAssignment` (`settings/npd-fields/_actions/npd-field-config.ts`) | Assigns catalog fields to departments, with `required`, `visible`, `stage_code`, and order. | `/settings/npd-fields` | writes/deletes `npd_department_field` | Update assignment or remove/reassign. |

### Section 2: User How-To (Tester Walkthroughs)

1. Create an NPD project (wizard)
   1. Go to `/pipeline/new`.
   2. The page title is **Utwórz projekt NPD**. The wizard steps are **Basics**, **Brief**, **Starting point** and **Review** in the component, localized by the page labels.
   3. On the first step, fill **Robocza nazwa produktu**, choose **Kategoria**, and optionally set **Docelowa data wprowadzenia**.
   4. On the brief step, fill optional product evidence such as pack format, pack weight, channel, target price, audience, claims, constraints and notes.
   5. On the starting step, use the blank start. Clone/template cards are visible but disabled because no backend exists.
   6. Click **Utwórz projekt**. The action is `createProject` and the result starts at `current_gate='G0'`, `current_stage='brief'`, with seeded checklist rows.

2. Fill a gate's required fields and advance to the next stage
   1. Open `/pipeline/[projectId]/gate`.
   2. In **Lista kontrolna bramki**, complete manual required rows. The button text is **Przejdź do {gate}: {nextLabel} →** for normal advances, or **Poproś o zatwierdzenie →** on approval gates.
   3. Do not expect `Done_<Dept>:` rows to be clickable. Those rows show **Zamknięte w FA →** / **Wyliczane z FA** and are derived from FA department close flags.
   4. Click **Przejdź do ...**. In **Przejście do następnej bramki**, add **Notatki dotyczące przejścia bramki** and confirm.
   5. For G3/G4 approval, use **Zatwierdzenie bramki**, choose **Zatwierdź przejście bramki** or **Odrzuć przejście bramki**. Approval requires **Hasło** and **Potwierdź i podpisz**; rejection records a reason without e-sign.
   6. Expected state movement is stage-native and one step only: brief -> recipe -> packaging -> trial -> sensory -> pilot -> approval -> handoff -> launched. Checklist completeness is shown, but the server blockers are the real source of truth.

3. Edit the FA (core tab / procurement tab)
   1. Open `/fa/[productCode]`.
   2. Use the tabs **Podstawowe**, **Planowanie**, **Handlowe**, **Produkcja**, **Techniczne**, **MRP**, **Zakupy**, **BOM** and **Historia**. Planning, Commercial, Technical and Procurement are locked until Core is closed; MRP is locked until Core and Production are closed.
   3. On **Podstawowe**, edit schema-driven fields such as **Kod FG**, **Nazwa produktu**, **Rozmiar opakowania**, **Liczba kartonów**, **Składniki receptury**, **Kody składników (auto)**, **Szablon** and **Uwagi**. Click **Zapisz Core**.
   4. Use the right panel **Zamknij dział**. In **Zamknij sekcję Core**, verify V05 field checks and click **Potwierdź zamknięcie**.
   5. Open **Zakupy**. The section title is **Sekcja zaopatrzenia**. Fill **Dostawca**, **Czas realizacji (dni)**, **Termin przydatności zaopatrzenia (dni)** and **Cena (€/kg)** when available, then click **Zapisz zaopatrzenie**.
   6. If **V-NPD-PROC-001** appears, price is blocked until **Rdzeń** and **Produkcja** are closed. That is enforced by the UI and by the server update path.

4. Build a formulation and set allergens
   1. Open `/pipeline/[projectId]/formulation`.
   2. If the empty state shows **Brak wersji roboczej receptury**, click **Utwórz wersję roboczą**.
   3. In **Receptura**, click **Dodaj składnik** and use **Wybierz pozycję** / item search. Enter **Ilość / opak. (kg)** and verify **€ / kg**. Server save resolves costs and allergen arrays from the item master where possible.
   4. Click **Zapisz wersję roboczą**. The page recomputes **Koszt**, **Wartości odżywcze** and **Alergeny** into `formulation_calc_cache`.
   5. When ingredients total the pack weight and required cost/nutrition data exists, click **Zgłoś do próby**. Optionally click **Zablokuj recepturę** to freeze the version.
   6. To override final FA allergens, open `/fa/[productCode]/allergens`, click **Nadpisz**, pick **Alergen**, choose **✓ Uwzględnij (Zawiera)** or **✗ Wyklucz (Nieobecny)**, enter **Powód**, and click **Zapisz nadpisanie**. Overrides are append-only and refresh the cascade.

5. Mark launched (terminal gate)
   1. First complete handoff at `/pipeline/[projectId]/handoff`. The handoff screen shows **Lista kontrolna przekazania** and **Bramki wydania**.
   2. When all handoff checklist rows and release gates pass, click **✓ Promuj do BOM produkcyjnego**. This calls `promoteToProduction`, which reuses the factory-release path; it does not mark the project launched.
   3. Return to `/pipeline/[projectId]/gate`.
   4. At the terminal G4/handoff checklist footer, click **Oznacz jako wdrożone ✓**. The same advance modal is used; confirm the launch advance.
   5. Expected result: `advanceProjectGate` enters `launched`, writes the closeout evidence and derives gate **Wprowadzony** / `Launched`. After that, the header shows the terminal hint and the project is view-only for gate advance/revert.

### Section 3: Reverse / Correction Map

#### Project stage / gate

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| `brief` / `G0` at creation | Edit brief fields, advance to recipe | `/pipeline/[projectId]/brief`, `/pipeline/[projectId]/gate` **Przejdź do...** | Updates `npd_projects`; advance is one step and derives the next gate. |
| Any non-terminal stage before `launched` | Manual checklist toggle, approval/rejection, one-step advance, rollback to earlier gate | `/pipeline/[projectId]/gate` | Writes checklist, approval, project stage/gate, audit and outbox rows. |
| `approval -> handoff` | Requires existing approved G4 e-sign checkpoint | **Zatwierdzenie bramki** then **Przejdź do...** | `assertG4ESignForHandoff` blocks handoff until approval exists. |
| `handoff` | Toggle handoff checklist, promote to factory, then mark launched | `/pipeline/[projectId]/handoff`, then `/pipeline/[projectId]/gate` | Promotion releases to factory; launch writes closeout and sets terminal stage. |
| `launched` / `Launched` | View only for gate flow | None | `advanceProjectGate` returns `ALREADY_CLOSED`; `rollbackGate` returns `launched_is_terminal`. |

#### FA

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| Active, unbuilt, unreleased FA | Edit schema-driven cells, close/reopen departments, allergen overrides, soft-delete | `/fa/[productCode]` tabs and right panel | Writes `product`, department close flags, allergen override/audit/outbox rows. |
| Closed department | Reopen if user has `npd.closed_flag.unset` | Reopen correction action | Clears `closed_*`; derived `Done_<Dept>:` gate row becomes incomplete. |
| Built/released/launched FA | Delete blocked; edits may reset built before release | `deleteFa` guards built/released states | Released state is not reversed in NPD. |

#### Formulation line

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| Draft formulation version | Add/delete/edit ingredient rows, save, recompute, compare | `/pipeline/[projectId]/formulation` **Zapisz wersję roboczą** | `saveDraft` replaces rows; `recomputeAndCache` refreshes exact cost/nutrition/allergen cache. |
| Submitted for trial | Lock allowed; draft save refused | **Zablokuj recepturę** | `lockVersion` freezes the version and cascades recipe components to mapped product. |
| Locked | View/compare only | Formulation page | Save/submit/lock return locked/not-submitted errors; no unlock action found. |

#### Trial

| State | Allowed operations | How to trigger | Result |
|---|---|---|---|
| Existing trial batch | Edit fields/result/notes | `/pipeline/[projectId]/trial` **Edytuj** -> **Zapisz zmiany** | `updateTrialBatch` updates row and writes before/after audit. |
| New trial batch | Log trial | **+ Dodaj próbę** -> **Zapisz próbę** | `logTrialBatch` inserts row; duplicate trial number returns `duplicate_trial_no`. |
| Bad/obsolete trial | No delete/cancel action found | Not found in code | Leave as edited result/notes or correct by updating the row. |

### Section 4: Known Gaps / Not Yet Built

- `supabase/migrations/` is not present; migration 333 lives at `packages/db/migrations/333-npd-dynamic-fields.sql`.
- Clone/template start in the NPD project wizard is not built. `create-project-wizard.tsx` renders the cards disabled and comments that no backend exists; blank start is the only selectable start.
- Gate checklist completeness is partly advisory. `gate-helpers.ts` says seeded checklist rows are progress markers and do not hard-block stage advance; hard blockers are server-side transition rules.
- G1 is collapsed into the brief stage. `gate-helpers.ts` documents creation as `G0/brief` and first forward advance as `brief -> recipe` deriving `G2`; any UI claiming a forward G1 target is wrong.
- `Done_<Dept>` checklist items are not user-toggleable. `toggle-gate-checklist-item.ts` returns forbidden for FA-derived rows; close/reopen the FA department instead.
- Sensory writes are not built in NPD. `getSensoryPanel.ts` is read-only and states Technical owns sensory writes.
- Trial delete/cancel was not found. Trial actions only list, log and update batches.
- Formulation version delete/unlock/revert-to-draft was not found. Available lifecycle actions create draft, save draft, submit for trial, lock and compare.
- Handoff promotion is not the same as launch. `promote-to-production.ts` stamps factory release/handoff; terminal launch is `advanceProjectGate` to `launched`.
- FA -> FG rename is DEFERRED. The localized UI already uses FG labels such as **Wyroby gotowe**, **Kod FG** and **Utwórz FG**, but many action files, routes and events remain FA-prefixed (`/fa`, `createFa`, `deleteFa`, `fa.created`, `fa.dept_closed`, validation code pattern `^FA...`). Rename is incomplete.
- `/fa/[productCode]` prototype tabs for formulations/risks/docs are not all inside `fa-tabs.tsx`. The tab shell documents that Formulations/Risks/Docs live in separate routes or later slices.
- Product onboarding `/products/new` uses the FA create modal but disables the FA-prefix requirement because first-product settings are still pending; `product-create-wizard.client.tsx` notes the prefix will become configurable.
- Whole-project hard delete exists as `deleteProject`, but no user-facing walkthrough label was found in the reviewed PL labels; treat as not found in UI.
