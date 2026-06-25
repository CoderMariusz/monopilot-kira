# NPD — New Product Development (Brief → Stage-Gate → FG launch) module guide

> Per-module deep guide. Every claim below is anchored to a real file under
> `apps/web/…` or `packages/…`; nothing is invented. The module lives in **one
> route group** — the desktop **NPD** screens under the `(npd)` route group — but
> across **two physical trees**: the **active pages** are
> `apps/web/app/[locale]/(app)/(npd)/**/page.tsx`, and they import their Server
> Actions from the non-localized **action tree** `apps/web/app/(npd)/**/_actions/**`
> (the pipeline/gate/formulation/FA/builder core) plus the stage-local `_actions`
> that sit next to the pages (brief, trial, pilot, sensory, packaging, costing,
> handoff). The route group `(npd)` adds **no path segment**, so the user-facing
> routes are `/pipeline`, `/formulations`, `/allergen-cascade`, `/npd` (FG
> Dashboard) and `/fa` (Finished Goods) — see `lib/navigation/npd-nav.ts`.
>
> 01-npd **owns** the product launch lifecycle from **Brief → NPD project
> (`NPD-NNN`) → Stage-Gate G0–G4 → the FG candidate → the *initial* shared BOM /
> factory spec → Launched**. It writes `npd_projects`, `gate_checklist_items`,
> `gate_approvals`, `formulations*`, the `product`/`fa`-view Main Table,
> `prod_detail`, `risks`, `compliance_docs`, the stage tables (trial / pilot /
> sensory / packaging / costing) and `factory_release_status` /
> `npd_legacy_closeout`. It is the **producer** of the factory release read-model
> (`fg.released_to_factory`, `npd.project.legacy_stages_closed`) that Technical /
> Planning / Production consume. After release, ongoing factory-spec / BOM
> correctness belongs to **03-Technical** (BOM SSOT hand-off), not NPD.
>
> **Terminology:** `FG`/Finished Good is the canonical user-facing term; `FA`
> (Factory Article) is a **legacy compatibility alias only** — DB fields, route
> segments (`/fa`), seed codes and event prefixes (`fa.*`) still use it, but the
> physical table is `public.product` and `public.fa` is a read-only SQL view over
> it (`MON-domain-npd` SKILL).
>
> Routes are written without the `[locale]` prefix. Last reviewed against the
> uncommitted working tree (2026-06-06 stage-native pivot, mig 242/243 brief-merge,
> W11 reversibility wave).

---

## a. Overview

The NPD module turns an idea into a sellable, factory-released Finished Good. A
developer raises a **project** through a create-wizard (the standalone Brief screen
was folded into project create + detail — `npd-nav.ts:19-21`), and the project then
walks an **8-stage operational pipeline** — `brief → recipe → packaging → trial →
sensory → pilot → approval → handoff` — to the terminal `launched` stage. Each
stage **derives** a Stage-Gate (G0–G4); the stage is the authoritative step the
user drives and the gate is computed from it (`gate-helpers.ts:22-100`). Along the
way the developer edits a **formulation** (versioned `draft → submitted_for_trial →
locked`), computes **nutrition** and **costing**, runs **trial** and **pilot**
batches, fills the **69-column FG Main Table** across 7 departments, tracks
**risks** (with a V18 high-risk built-blocker) and **compliance docs**, and collects
two **CFR-21 e-signatures** (at G3 and G4). Entering the `packaging` stage mints the
**FG candidate** (`public.product` row + product code); the `handoff` →
`launched` transition materializes the **initial shared BOM + factory spec** and
**promotes the FG to production** through the shared factory-release flow.

The lifecycle is reversible only in narrow, audited ways: a draft formulation
version is editable until submitted; an **admin** can revert a project to an earlier
gate (`revert-gate.ts`); a department section can be reopened
(`reopen-dept-section.ts`); a risk can re-open from `Closed → Open`. There is **no
revert-from-Launched** and **no e-signed gate "reject" that rolls the stage back**
(see *Known gaps*).

The pipeline/gate/formulation/FA/builder actions live in
`apps/web/app/(npd)/{pipeline,fa,builder,dashboard}/**/_actions/**`; the stage-local
actions (brief/trial/pilot/sensory/packaging/costing/handoff) live next to their
pages under `apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/**/_actions/**`.
The state-machine engine is `pipeline/_actions/_lib/gate-helpers.ts`; the
factory-release engine is `builder/_actions/release-npd-project-to-factory.ts` +
`builder/_lib/release-preflight.ts` + `pipeline/_actions/_lib/materialize-npd-bom.ts`.

---

## b. Function inventory

> Reads/writes name the Postgres tables touched. "Gate" is the permission checked
> server-side **inside** the action (a missing permission returns a typed
> `{ ok:false, error:'FORBIDDEN' }` / `'forbidden'`, never a 500). Every action runs
> inside `withOrgContext` (RLS via `app.current_org_id()`). Permission is verified
> by the shared `hasPermission` helper that checks **both** `role_permissions` and
> the legacy `roles.permissions` jsonb (`pipeline/_actions/shared.ts:28-44`).

### Project lifecycle — `pipeline/_actions/*`

| Action (file) | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `listProjects({status?,search?,…})` (`list-projects.ts`) | Pipeline list: projects + per-project checklist progress + launch closeout warning code. | reads `npd_projects`, `gate_checklist_items`, `npd_legacy_closeout` | `npd.project.view` | — (read) |
| `getProject({projectId})` (`get-project.ts`) | Project detail header + derived stage/gate + capability flags (canAdvance/canCreate). | reads `npd_projects`, `gate_checklist_items` | `npd.project.view` (+ probes `npd.gate.advance`, `npd.project.create` for UI flags) | — (read) |
| `createProject(input)` (`create-project.ts`) | Insert project at `stage='brief', gate='G0'`; allocate per-org `NPD-NNN` code; fold-in brief fields (pack format/weight, channel, claims…); seed the gate checklist from `GateChecklistTemplates`. Emits `npd.project.created`. | writes `npd_projects`, `gate_checklist_items`, `outbox_events`; reads `org_sequences`, `"Reference"."GateChecklistTemplates"` | `npd.project.create` | `deleteProject` (no dependents) |
| `cloneProject({ sourceProjectId, …overrides })` (`clone-project.ts`) | **#3/#4 (2026-06-25):** seed a new `brief`/`G0` project from an existing one — copy header + gate checklist, apply wizard brief overrides, fresh `NPD-NNN`. Backs both the wizard **Clone existing project** card and the project-header **Duplicate** button. | writes `npd_projects`, `gate_checklist_items`, `outbox_events`; reads source `npd_projects` | `npd.project.create` | `deleteProject` (no dependents) |
| `deleteProject({projectId})` (`delete-project.ts`) | Hard-delete a project that has no dependents (`HAS_DEPENDENTS` on FK violation). Emits `npd.project.deleted`. | deletes `npd_projects`; writes `outbox_events` | `npd.project.create` | — (terminal) |
| `advanceProjectGate({projectId,targetStage,productCode?})` (`advance-project-gate.ts`) | **The forward driver.** Advances exactly ONE adjacent stage (`assertAdjacentStage`). Side effects keyed to the stage entered: entering `packaging` → `createFgCandidate`; `approval→handoff` → assert a valid G4 e-sign + seed handoff checklist; entering `launched` → `closeOutLegacyStagesForLaunch`. Emits `npd.gate.advanced`. | writes `npd_projects`, `product`, `formulations`, `handoff_checklists*`, `npd_legacy_closeout`, `outbox_events` | `npd.gate.advance` | `revertGate` (admin, gate-space) |
| `approveProjectGate({projectId,gateCode:G3\|G4,decision,notes,password?})` (`approve-project-gate.ts`) | Records a gate **approval checkpoint**. Approve = **CFR-21 e-sign** (`signEvent` intent `npd.gate.approved`) → `gate_approvals` with `esigned_at`+`esign_hash`. Reject = reason only, no password, no signature. **Does NOT auto-advance** (advance is the separate stage step). Emits `npd.gate.approved`. | writes `gate_approvals`, `e_sign_log` (approve), `outbox_events` | `npd.gate.approve` | — (the recorded checkpoint; reject is a separate record) |
| `createOrMapFgCandidateAtG3({projectId,mode:create\|map,productCode?})` (`create-or-map-fg-candidate-at-g3.ts`) | Explicitly create or map the FG candidate while at G2/G3 (the same `createFgCandidate` that the packaging-stage advance triggers). | writes `product`, `npd_projects`, `formulations`, `outbox_events` (`fg.created`, `npd.fg_candidate_mapped`) | `npd.gate.advance` | — |
| `revertGate / rollbackGate({projectId,targetGate:G0–G3,reason})` (`revert-gate.ts`) | **Admin-only gate revert** to any earlier gate (`ROLLBACK_VIOLATION` if not strictly earlier). Append-only audit + `npd.gate.reverted`. The one downward path. | writes `npd_projects`, `audit_events`, `outbox_events` | `requireAdmin` (`admin` perm or role code `admin`) — NOT a `npd.*` string | This **is** the reverse of `advance`; only down to G3 (cannot revert from/through Launched) |
| `closeOutLegacyStages({projectId})` (`close-out-legacy-stages.ts`) | Standalone terminal closeout (also called internally by the `handoff→launched` advance). Verifies the full launch evidence set (release status, G4 e-sign, shelf-life, allergen recompute, pilot evidence, active BOM, packaging MRP) then writes `npd_legacy_closeout` and sets `stage='launched'` (gate derives `Launched`). Emits `npd.project.legacy_stages_closed`. | writes `npd_legacy_closeout`, `npd_projects`, `outbox_events`; reads `factory_release_status`, `product`, `gate_approvals`, `bom_headers`, `pilot_runs`, `allergen_cascade_rebuild_jobs` | `npd.gate.advance` | — (terminal — **no un-launch**) |
| `bulkAssignOwner / bulkSetPriority / bulkMoveGate(rows)` (`bulk-update-projects.ts`) | Bulk pipeline ops. `bulkMoveGate` translates a gate target into per-project single-stage `advanceProjectGate` calls (partial-success result with per-row failures). | writes `npd_projects`, `audit_events` (+ advance writes) | `npd.core.write` | per-row revert |
| `toggleGateChecklistItem({itemId,checked})` (`toggle-gate-checklist-item.ts`) | Tick / untick a seeded gate checklist item (advisory progress only — does **not** hard-block advance). | writes `gate_checklist_items`, `audit_events` | `npd.core.write` | toggle again |

### Formulation editor — `pipeline/[projectId]/formulation/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse / correction |
|---|---|---|---|---|
| `getFormulation({projectId})` (`get-formulation.ts`) | Current formulation + version + ingredient rows for the editor. | reads `formulations`, `formulation_versions`, `formulation_ingredients` | (read; RLS-scoped) | — (read) |
| `createFormulationDraft({projectId})` (`create-draft.ts`) | Create the formulation (or a new draft version) → `formulation_versions(state='draft')`, set `current_version_id`. | writes `formulations`, `formulation_versions` | `npd.formulation.create_draft` | (draft is editable) |
| `saveDraft({projectId,versionId,ingredients[]})` (`save-draft.ts`) | Replace the draft's ingredient rows (delete-all + re-insert), recompute totals. **Draft-only** (`VERSION_LOCKED`/`VERSION_NOT_DRAFT`). | writes `formulation_ingredients`, `formulation_audit_log` | `npd.formulation.create_draft` | edit again (draft) |
| `recomputeAndCache(input)` (`recompute.ts`) | Recompute totals / cost / nutrition coverage for a version and cache the result. | reads/writes `formulation_versions` | (read-ish; RLS-scoped) | — |
| `compareVersions(input)` (`compare-versions.ts`) | Diff two formulation versions (ingredient deltas). | reads `formulation_versions`, `formulation_ingredients` | (read; RLS-scoped) | — (read) |
| `submitForTrial({projectId,versionId})` (`submit-for-trial.ts`) | `draft → submitted_for_trial`. Gated on `totalPct ∈ [99.99,100.01]` (`TOTAL_PCT_OUT_OF_RANGE`), every RM costed (`MISSING_COST`), nutrition targets present (`MISSING_NUTRITION_TARGET`). Emits a `formulation.*` outbox event. | writes `formulation_versions`, `formulation_audit_log`, `outbox_events` | `npd.recipe.submit_for_trial` | `lockVersion` forward; new draft to revise |
| `lockVersion({projectId,versionId})` (`lock-version.ts`) | `submitted_for_trial → locked`; stamp `locked_at/by`; cascade-derive the product's `recipe_components`/`ingredient_codes` from the locked ingredients. Emits `formulation.locked`. | writes `formulation_versions`, `formulations`, `product`, `formulation_audit_log`, `outbox_events` | `npd.formulation.lock` | — (terminal version; create a new draft to change) |

### Nutrition / costing / approval — stage `_actions`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `computeNutrition(input)` (`pipeline/[projectId]/nutrition/_actions/compute.ts`) | Compute a nutrition profile + Nutri-Score from the formulation; rewrite the nutrition allergen set. | writes `nutrition_profiles`, `nutrition_allergens`, `nutri_score_results` | (RLS-scoped) | recompute |
| `computeCosting / computeAndSaveInitialBreakdown(input)` (`pipeline/[projectId]/costing/_actions/compute.ts`) | Compute a cost waterfall / margin; `margin_hard_fail` blocks a below-floor scenario; `fg_not_mapped` until the FG candidate exists. | writes `costing_breakdowns`, `costing_waterfall_steps` | (RLS-scoped) | recompute / new scenario |
| `saveCostingScenario(input)` (`pipeline/[projectId]/costing/_actions/save-scenario.ts`) | Persist a named costing scenario (same margin floor). | writes `costing_breakdowns` | (RLS-scoped) | save again |
| `evaluateApprovalCriteria(input)` (`pipeline/[projectId]/approval/_actions/evaluate.ts`) | Evaluate the G4 approval-readiness criteria for the product (read-model that the approval screen renders). | reads `product` + related | (RLS-scoped) | — (read) |

### Trial / pilot / sensory / packaging — stage `_actions`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `logTrialBatch / updateTrialBatch / listTrialBatches(input)` (`pipeline/[projectId]/trial/_actions/*`) | Record / amend / list trial-batch results for the trial stage. | writes `trial_batches`, `audit_log` | `npd.trial.write` (writes) | edit again |
| `upsertPilotRun / upsertPilotMaterial / togglePilotChecklistItem / getPilotRun(input)` (`pipeline/[projectId]/pilot/_actions/*`) | Plan/record a pilot run (the launch "pilot evidence"), its material lines and checklist. A `completed` pilot run is the pilot evidence closeout looks for. | writes `pilot_runs`, `pilot_run_materials`, `pilot_run_checklist_items`, `audit_events` | `npd.pilot.write` (writes) | edit again |
| `getSensoryPanel(projectId)` (`pipeline/[projectId]/sensory/_actions/getSensoryPanel.ts`) | Read the sensory panel (sensory schema is **Technical-owned** per the domain boundary; NPD reads it for gating). | reads sensory tables | `npd.sensory.read` (read) | — (read) |
| `listPackagingComponents / upsertPackagingComponent / deletePackagingComponent(input)` (`pipeline/[projectId]/packaging/_actions/*`) | CRUD the packaging-component spec (film/tray/web/labels…) for the packaging stage. | writes `packaging_components` | `npd.packaging.write` (writes) / `npd.packaging.read` | upsert / delete |
| `uploadArtworkVersion / listArtworkVersions / deleteArtworkVersion(formData)` (`pipeline/[projectId]/packaging/_actions/*`) | Manage packaging-artwork file versions (Supabase storage + table). | writes artwork-version table + storage | `npd.packaging.write` | delete version |

### Brief / handoff — stage `_actions`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `readProjectBrief / updateProjectBrief(input)` (`pipeline/[projectId]/brief/_actions/*`) | Read / amend the project's folded-in brief fields (the standalone Brief table was dropped in mig 243 — brief now lives on `npd_projects`). | reads/writes `npd_projects`, `audit_events` | `npd.core.write` (write) | edit again |
| `uploadBriefAttachment / listBriefAttachments / deleteBriefAttachment(input)` (`pipeline/[projectId]/brief/_actions/*`) | Manage brief attachments (Supabase storage + table). | writes attachment table + storage | `npd.core.write` | delete |
| `getHandoff({projectId})` (`pipeline/[projectId]/handoff/_actions/get-handoff.ts`) | Handoff screen read-model: checklist + items + BOM-verification status. | reads `handoff_checklists`, `handoff_checklist_items` | `npd.handoff.read` | — (read) |
| `probeReleaseGates(input)` (`pipeline/[projectId]/handoff/_actions/release-gate-status.ts`) | Non-throwing GET of the release-gate status (`G4_REQUIRED` / FG / active-BOM / factory-spec / V18) for the handoff screen badges. | reads `npd_projects`, `bom_headers`, `bom_lines`, `factory_specs`, `risks` | (read; RLS-scoped) | — (read) |
| `toggleHandoffChecklistItem({itemId,checked})` (`pipeline/[projectId]/handoff/_actions/toggle-handoff-checklist-item.ts`) | Tick / untick a handoff checklist item (the **complete** checklist gates promotion). | writes `handoff_checklist_items`, `audit_events` | `npd.handoff.read` | toggle again |
| `promoteToProduction({projectId})` (`pipeline/[projectId]/handoff/_actions/promote-to-production.ts`) | **"Promote to production BOM."** Requires the handoff checklist COMPLETE, then **reuses** `releaseNpdProjectToFactory` (the real BOM/factory release) and records the promotion (`bom_verification_status='promoted'`) + audit. Surfaces `release_blocked` honestly if preflight fails. | writes `handoff_checklists`, `audit_events` (+ release writes) | `npd.handoff.promote` (+ release's own `npd.gate.approve`) | — (terminal promotion) |

### Factory release / BOM materialization — `builder/**`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `releaseNpdProjectToFactory(projectId)` (`builder/_actions/release-npd-project-to-factory.ts`) | **T-096 release.** `materializeNpdBom` (mints the FG `items` row, `bom_headers/bom_lines`, approved `factory_specs`), runs `runReleasePreflight` (G4, FG candidate, active shared BOM, factory-spec match, **V18 high-risk block**), then upserts `factory_release_status='released_to_factory'` + emits `fg.released_to_factory`. Revalidates the Technical lists. | writes `items`, `bom_headers`, `bom_lines`, `factory_specs`, `factory_release_status`, `formulations`, `product`, `outbox_events` | `npd.gate.approve` (`RELEASE_TO_FACTORY_PERMISSION`) | — (release is forward-only) |
| `upsert*/get* factory release status` (`builder/_lib/factory-release-status.ts`) | Read-model helpers for the release status row. | reads/writes `factory_release_status` | (internal) | — |
| `refreshD365Cache()` (`dashboard/_actions/refresh-d365-cache.ts`) | **D365 export/import only (R15).** Refresh the D365 import cache (material code status) for the Builder; `not_configured` when no integration. Emits an outbox event. | writes `d365_import_cache`, `outbox_events` | `npd.d365_builder.execute` (or legacy `d365_builder.execute`) | — |

### FG Main Table (Factory Article) — `fa/actions/*` + `fa/[productCode]/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `createFa(input)` (`fa/actions/create-fa.ts`) | Create a `product` (FG) row directly (Main Table). Emits `fa.created`. | writes `product`, `outbox_events` | `fg.create` | `deleteFa` |
| `updateFaCell(input)` (`fa/actions/update-fa-cell.ts`) | Edit one Main-Table cell, gated **per department** (`DEPT_PERMISSION` map → `npd.<dept>.write`). **Any edit auto-resets `built=FALSE`** (`built_reset` flag) — `built` is a `[LEGACY-D365]` flag, not a release state. Emits `fa.edit`. | writes `product`, `outbox_events` | per-dept `npd.<dept>.write` | edit again |
| `closeDeptSection / reopenDeptSection(input)` (`fa/actions/*`) | Close (`Done_<Dept>` readiness) or **reopen** a department section. Reopen is the audited reverse, gated by `npd.closed_flag.unset`. | writes `product`, `outbox_events` | close: per-dept; reopen: `npd.closed_flag.unset` | reopen ↔ close |
| `addProdDetailComponent / removeProdDetailComponent(input)` (`fa/actions/add-prod-detail-component.ts`) | Add/remove a multi-component `prod_detail` row (the N-component source of truth). Emits `fa.recipe_changed`. | writes `prod_detail`, `outbox_events` | `npd.production.write` | remove ↔ add |
| `setAllergenOverride(input)` (`fa/actions/set-allergen-override.ts`) | Manual additive allergen override (does NOT clear the auto-cascade source). | writes `fa_allergen_overrides` | `technical.write` OR `quality.write` | edit override |
| `deleteFa(input)` (`fa/actions/delete-fa.ts`) | Soft-delete a `product` (sets `deleted_at`). Emits `fa.deleted`. | writes `product`, `audit_events`, `outbox_events` | `npd.core.write` | — |
| `bom_export_csv(productCode)` (`fa/actions/bom-export-csv.ts`) | Export the FA BOM as CSV (HTTP `Response`). | reads BOM/product | `npd.dashboard.view` + `npd.bom.export` | — (read/export) |
| `searchItems / getRequiredFieldsForDept(input)` (`fa/actions/*`) | Item picker + per-dept required-field metadata (schema-driven from DeptColumns). | reads `items`, DeptColumns | (read; RLS-scoped) | — (read) |
| `listProdDetail / addProdDetailRow / updateProdDetailRow / removeProdDetailRow(input)` (`fa/[productCode]/_actions/finish-wip.ts`) | Finish-WIP / ProdDetail grid CRUD on a product. | reads/writes `product`, `prod_detail` | `npd.finish_wip.read` / `…write` | edit again |
| `getFaBom / benchmarks (3 fns)` (`fa/[productCode]/_actions/*`) | FA BOM read-model + cost benchmarks for the FA detail tabs. | reads BOM / benchmark tables | (read; RLS-scoped) | — (read) |

### Allergens — `fa/[productCode]/allergens/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `readAllergenCascade(productCode)` (`read-allergen-cascade.ts`) | Read the multi-level derived allergen cascade (RM → process → FG) + overrides. | reads allergen tables, `fa_allergen_overrides` | `npd.allergen.write` (read+write screen) | — (read) |
| `refreshAllergenCascade(productCode)` (`refresh-allergen-cascade.ts`) | Re-derive the cascade (enqueue/rebuild). | writes `allergen_cascade_rebuild_jobs` / cascade | (RLS-scoped) | re-run |
| `updateFaAllergenSet(input)` (`update-allergen-set.ts`) | Update the FG allergen set. | writes allergen tables | `npd.allergen.write` | edit again |
| `submitAllergenOverride(input)` (`submit-allergen-override.ts`) | Submit an additive override with reason (does not mutate the auto-cascade source). | writes `fa_allergen_overrides` | (RLS-scoped) | edit override |

### Risks (V18) — `fa/[productCode]/risks/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `listRisks(input)` (`list-risks.ts`) | List risks with `score = likelihood × impact`, bucket counts (High≥6 / Med 3-5 / Low). | reads `risks` | (read; RLS-scoped) | — (read) |
| `createRisk(input)` (`create-risk.ts`) | Insert a risk (`state='Open'`). Emits `risk.created`. | writes `risks`, `outbox_events` | `npd.risk.write` | transition to `Closed` |
| `updateRisk({riskId,patch,transition?,reason})` (`update-risk.ts`) | Edit a risk and/or transition its state. **State machine:** `Open→Mitigated→Closed→Open` (each transition needs a ≥10-char reason; `INVALID_TRANSITION` otherwise). Emits `risk.updated`/`risk.transitioned`. | writes `risks`, `audit_events` | `npd.risk.write` | `Closed→Open` re-opens (the one risk reverse) |

### Compliance docs — `fa/[productCode]/docs/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `uploadDoc(formData)` (`upload-doc.ts`) | Upload a compliance doc to Supabase storage (per-org bucket, auto-created) + `compliance_docs` row. | writes `compliance_docs` + storage | `npd.compliance_doc.write` | `softDeleteDoc` |
| `listDocs / getSignedUrl(input)` (`*.ts`) | List docs / mint a signed download URL (audited). | reads `compliance_docs`; writes `audit_events` (signed-url) | (read; RLS-scoped) | — (read) |
| `softDeleteDoc(input)` (`soft-delete-doc.ts`) | Soft-delete a compliance doc. | writes `compliance_docs` | (RLS-scoped) | — |

### Dashboard — `dashboard/_actions/*`

| Action | What it does | Reads / writes | Gate | Reverse |
|---|---|---|---|---|
| `getDashboardSummary()` (`get-dashboard-summary.ts`) | NPD dashboard KPI/summary read-model. | reads `npd_projects` + related | `npd.dashboard.view` (or legacy `dashboard.view`) | — (read) |
| `getLaunchAlerts(input)` (`get-launch-alerts.ts`) | Launch-alert tiles (projects approaching launch / blocked). | reads `npd_projects` + closeout | `npd.dashboard.view` | — (read) |

**Action count inventoried: 96 exported Server Actions** across both NPD trees
(measured: `export async function` in every `'use server'` file under
`app/(npd)/**` and `app/[locale]/(app)/(npd)/**`, excluding tests). The lifecycle
core is the 11 in `pipeline/_actions/`, the 7 formulation actions, and the
release/promote pair (`releaseNpdProjectToFactory` + `promoteToProduction`).

---

## c. State machine

### Project lifecycle — 8 stages + terminal (2026-06-06 stage-native pivot)

`current_stage` is the authoritative step; `current_gate` is **derived**
(`gate-helpers.ts:60-100`). The project advances exactly one adjacent stage at a
time (`assertAdjacentStage`); skipping throws `ADJACENCY_VIOLATION`.

```
 brief ──► recipe ──► packaging ──► trial ──► sensory ──► pilot ──► approval ──► handoff ──► launched
 (G0/G1)   (G2)       (G3)*         (G3)       (G3)        (G3)      (G4)†        (G4)        (Launched, terminal)

   * entering `packaging` mints the FG candidate (createFgCandidate)
   † approval→handoff is the enforced G4 e-sign checkpoint (assertG4ESignForHandoff)
   handoff→launched runs closeOutLegacyStagesForLaunch (full launch evidence set)
```

| Stage | Derived gate | Key entry side-effect / guard | Who writes it |
|---|---|---|---|
| `brief` | `G0` at creation, `G1` once advanced into | created here (`create-project.ts`) | developer |
| `recipe` | `G2` | leaving `recipe` requires ≥1 ingredient on the current formulation version (`RECIPE_INGREDIENTS_REQUIRED`) | `advanceProjectGate` |
| `packaging` | `G3` | **FG candidate created on entry** (`createFgCandidate`; `FG_ALREADY_LINKED` guard) | `advanceProjectGate` |
| `trial` / `sensory` / `pilot` | `G3` | (advisory checklist only) | `advanceProjectGate` |
| `approval` | `G4` | the gate where the G3/G4 e-sign approvals are collected | `advanceProjectGate` |
| `handoff` | `G4` | **entry requires a valid G4 e-sign** + seeds the handoff checklist | `advanceProjectGate` |
| `launched` | `Launched` | terminal closeout (`closeOutLegacyStagesForLaunch`) | `advance`(→launched) / `closeOutLegacyStages` |

**Deviation note (in-code, `gate-helpers.ts:44-56`):** G1 (Feasibility) is collapsed
into the `brief` stage — the first advance is `brief→recipe` which derives gate
**G2**; G1 is never a forward target and only appears via an admin gate revert.
`handoff` maps to **G4**, not `Launched`, so closeout status never surfaces while
handoff work is still in progress.

### Gate-approval flow (G3 / G4)

The e-sign approval is a **recorded checkpoint that no longer auto-advances**
(`approve-project-gate.ts:78-81`):

1. `approveProjectGate(decision='approved', password)` → `signEvent` (CFR-21,
   intent `npd.gate.approved`) → insert `gate_approvals(decision='approved',
   esigned_at, esign_hash)`. Project **stays on its current stage**.
2. The user then separately calls `advanceProjectGate` to move the stage. The
   `approval→handoff` step calls `assertG4ESignForHandoff`, which verifies an
   immutable approved G4 `gate_approvals` row exists — without it,
   `ESIGN_REQUIRED` (403).
3. `decision='rejected'` records a reason on `gate_approvals` with **no password,
   no signature** — it does **not** roll the stage back (it is a checkpoint record
   only). Rolling a gate backwards is the **admin** `revertGate` path.

### Reverse / downward paths

- **`revertGate`** (admin only) — gate-space rollback to any strictly-earlier gate
  `G0–G3`; cannot revert from or through `Launched`.
- **Formulation** — `draft` is freely editable; `submitted_for_trial` and `locked`
  are not (create a new draft version to revise).
- **Risk** — `Closed → Open` re-opens (`update-risk.ts:225-230`).
- **Dept section** — `reopenDeptSection` (`npd.closed_flag.unset`).
- **`built`** flag — auto-resets to FALSE on any Main-Table edit (`built_reset`).
- **No reverse exists** for: a launched project (terminal `npd_legacy_closeout`),
  a factory release, or a promoted handoff.

### Factory release preflight (blockers, `release-preflight.ts`)

`releaseNpdProjectToFactory` (and `promoteToProduction` which reuses it) throws
`PRECONDITION_BLOCKERS` unless ALL pass: `G4_REQUIRED` (project at G4),
`FG_CANDIDATE_REQUIRED` (product code mapped), `ACTIVE_SHARED_BOM_REQUIRED` (active
`bom_headers` with ≥1 line), `FACTORY_SPEC_REQUIRED` / `FACTORY_SPEC_MISMATCH`
(an approved factory_spec whose bundled BOM matches the active BOM), and
**`V18_OPEN_HIGH_RISK`** (no `risks` row with `bucket='High' AND state='Open'`).

<!-- screenshot: npd/pipeline list (Projects tab + Create wizard) -->
<!-- screenshot: npd/pipeline/[projectId] project detail (stage rail + advance / gate panel) -->
<!-- screenshot: npd/pipeline/[projectId]/gate approval modal (G3/G4 e-sign) -->

---

## d. User how-tos

> Button labels are i18n keys (the `Navigation.npd.*` and stage bundles supply the
> English copy). Routes are locale-relative (`/pipeline`, `/fa`, …).

### (i) Create an NPD project

1. Go to **NPD → Projects** (`/pipeline`).
2. Click **Create** (the create-wizard; the standalone Brief screen is folded in).
3. Fill the wizard: **Name** + **Category** (required), **Priority** (default
   normal), optional **Owner / Target launch / Notes**, and the brief block (pack
   format, **pack net weight (g)** = recipe batch size, sales channel, expected
   volume, target retail price, audience, marketing claims, constraints).
4. Pick the **Starting point** — **Blank recipe** or **Clone existing project**
   (the latter is wired to the real `cloneProject` Server Action since 2026-06-25,
   #3/#4 — selecting it reveals a *source-project* picker that copies the header +
   gate checklist into a fresh `brief`/`G0` draft). The **Category template** card
   stays **honestly disabled** ("not available yet" — no template schema exists).
5. **Submit** → `createProject` (or `cloneProject` when cloning). The project is
   created at **stage `brief`, gate `G0`**, with a `NPD-NNN` code and a seeded gate
   checklist.

> Project header (`/pipeline/[id]`) also exposes a **Duplicate** button wired to the
> same `cloneProject` action (#3/#4); the **⚑ Watch** button next to it stays
> honestly disabled until a watchers table lands (needs a migration).

### (ii) Advance through the gates (with approvals)

1. Open the project (`/pipeline/[projectId]`). The stage rail shows the current
   stage; the advance control offers exactly the **next** stage.
2. **Advance one stage** → `advanceProjectGate({targetStage})`. Notable steps:
   - Leaving `recipe` requires ≥1 ingredient on the recipe (otherwise
     `RECIPE_INGREDIENTS_REQUIRED`).
   - Entering `packaging` (= entering **G3**) **creates the FG candidate**
     automatically (or use `createOrMapFgCandidateAtG3` to set a specific product
     code / map an existing FG).
3. **Collect the G3 / G4 e-signature.** On the gate/approval screen run
   `approveProjectGate({gateCode:'G3'|'G4', decision:'approved', notes, password})`
   — your password is verified (CFR-21) and an immutable `gate_approvals` row is
   written. This is a **checkpoint** — it does **not** advance you.
4. **Advance `approval → handoff`** → `advanceProjectGate({targetStage:'handoff'})`.
   This **requires** a valid approved G4 e-sign (`ESIGN_REQUIRED` otherwise) and
   seeds the handoff checklist.
5. **Reject** (`decision:'rejected'`, no password) records a reason; to roll the
   stage backwards an **admin** uses `revertGate({targetGate, reason})`.

### (iii) Edit a formulation

1. Open **NPD → Formulations** / the project's **Formulation** tab
   (`/pipeline/[projectId]/formulation`).
2. If none exists, **create a draft** → `createFormulationDraft` (or create a new
   draft version off a locked one).
3. Add/edit ingredient rows and **Save** → `saveDraft({versionId, ingredients})`
   (draft-only; locked/submitted versions reject the save). Use
   `recomputeAndCache` to refresh totals, and **Compute nutrition** / **Compute
   costing** from the sibling tabs.
4. **Submit for trial** → `submitForTrial`. It must total **99.99–100.01 %**, every
   RM must be costed, and nutrition targets must be present.
5. **Lock** → `lockVersion` (`submitted_for_trial → locked`). Locking cascades the
   ingredient list into the product's `recipe_components` / `ingredient_codes`. To
   change a locked recipe, create a **new draft version**.

### (iv) Create + approve a factory spec (and the initial BOM)

There is no standalone "create factory spec" form in NPD — the factory spec + the
initial shared BOM are **materialized by the release flow**:

1. Ensure the project is at **G4** with a mapped FG candidate, a locked recipe and a
   recorded G4 e-sign.
2. Trigger the release — either directly (`releaseNpdProjectToFactory(projectId)`)
   or via the handoff screen's promote button (below). `materializeNpdBom` mints the
   FG `items` row, the `bom_headers`/`bom_lines`, and an **approved**
   `factory_specs` row; `runReleasePreflight` then enforces G4 / FG / active-BOM /
   factory-spec-match / **V18 no-open-high-risk**.
3. On success, `factory_release_status` flips to `released_to_factory` and
   `fg.released_to_factory` is emitted; the Technical item / BOM / factory-spec
   lists are revalidated so the newly-minted spec appears. **Ongoing factory-spec
   correctness then belongs to 03-Technical**, not NPD.

### (v) Hand off to production

1. Open the project's **Handoff** tab (`/pipeline/[projectId]/handoff`) — available
   only on the `handoff` stage (the advance into it seeds the checklist).
2. Work the handoff checklist (recipe locked, nutrition approved, artwork finalized,
   pilot successful, training prepared, first WO scheduled) → tick each via
   `toggleHandoffChecklistItem`. The release-gate badges (`probeReleaseGates`) show
   the G4 / FG / BOM / factory-spec / V18 status.
3. Click **✓ Promote to production BOM** → `promoteToProduction`. It requires the
   checklist **complete**, then runs the real factory release; a preflight failure
   returns `release_blocked` (no fake BOM) and leaves the handoff un-promoted.

### (vi) Launch

1. With the handoff promoted (release committed, BOM active, G4 signed), advance
   **`handoff → launched`** → `advanceProjectGate({targetStage:'launched'})` (or run
   `closeOutLegacyStages({projectId})`).
2. Closeout verifies the full evidence set — released factory status + release
   event, an approved+e-signed G4, product **shelf life set**, an allergen
   re-compute timestamp, **pilot evidence** (a linked pilot WO or a `completed`
   `pilot_runs`), an `active`/`technical_approved` BOM, and **packaging MRP
   complete** — then writes `npd_legacy_closeout` and sets stage `launched` (gate
   derives `Launched`) and emits `npd.project.legacy_stages_closed`.
3. **Launched is terminal** — there is no un-launch. A post-release change creates a
   **new** BOM / product-spec version routed through **Technical** approval (BOM
   SSOT rule), never an in-place mutation.

---

## e. Data sources (Supabase tables)

Project / gate lifecycle:

- `npd_projects` — the project (code, name, type, `current_stage`, derived `current_gate`, owner, priority, folded-in brief fields, `product_code`).
- `gate_checklist_items` — per-project seeded gate checklist (advisory progress).
- `gate_approvals` — G3/G4 approval checkpoints (decision, notes, `esigned_at`, `esign_hash`).
- `"Reference"."GateChecklistTemplates"` — checklist seed templates (read).
- `org_sequences` — per-org `NPD-NNN` code allocator.
- `handoff_checklists` / `handoff_checklist_items` — handoff stage gate.
- `npd_legacy_closeout` — terminal launch closeout snapshot.
- `factory_release_status` — the factory release read-model.

Formulation / nutrition / costing:

- `formulations` / `formulation_versions` / `formulation_ingredients` / `formulation_audit_log` — versioned recipe.
- `nutrition_profiles` / `nutrition_allergens` / `nutri_score_results` — nutrition compute.
- `costing_breakdowns` / `costing_waterfall_steps` — costing scenarios.

FG Main Table / spec / risk / docs:

- `product` — the 69-column FG Main Table (physical table behind the read-only `fa` view); `prod_detail` — multi-component source of truth.
- `items` / `bom_headers` / `bom_lines` / `factory_specs` — written by `materializeNpdBom` at release (shared BOM SSOT).
- `risks` — V18 risk register (`bucket`, `state`, `score`).
- `fa_allergen_overrides` + allergen cascade tables + `allergen_cascade_rebuild_jobs`.
- `compliance_docs` — compliance documents (+ Supabase storage bucket).

Stage tables: `trial_batches`, `pilot_runs` / `pilot_run_materials` / `pilot_run_checklist_items`, `packaging_components` + artwork-version table.

Cross-cutting: `outbox_events` (every `npd.*` / `fa.*` / `fg.*` / `formulation.*` / `risk.*` emission), `audit_events` / `audit_log` (writes), `e_sign_log` (gate e-signs), `d365_import_cache` (D365 Builder), `user_roles` / `roles` / `role_permissions` (RBAC checks).

---

## f. Known gaps / TODO

Grounded in the code that was read — no guesses:

1. **The FA → FG rename is incomplete (known pending).** The user-facing canon is
   FG, but the implementation still carries `FA` everywhere structural: the route
   segment `/fa`, the whole `fa/actions/*` + `fa/[productCode]/_actions/*` action
   directory, event prefixes `fa.created` / `fa.edit` / `fa.deleted` /
   `fa.recipe_changed` / `fa.dept_closed`, the `public.fa` read-only view, the
   `fg.create` / `FA_CREATE_PERMISSION` mismatch in `create-fa.ts`, and the
   navigation relabel (`npd-nav.ts:9-12` maps prototype "FA"→"FG" in copy only).
   A full rename pass is outstanding.
2. **No revert-from-Launched and no header un-release.** `launched` is terminal
   (`npd_legacy_closeout`, `close-out-legacy-stages.ts`), `revertGate` is capped at
   `G0–G3` (`revert-gate.ts:22`), and `releaseNpdProjectToFactory` /
   `promoteToProduction` are forward-only. The documented escape for a post-release
   change is a **new** BOM/spec version via Technical — there is no NPD action that
   un-launches or un-releases a project.
3. **Two parallel NPD trees.** The active pages live in
   `app/[locale]/(app)/(npd)/**` but the core actions live in the non-localized
   `app/(npd)/**/_actions/**`, imported via deep `../../../../../../(npd)/…`
   relative paths (e.g. `promote-to-production.ts:35`). It works but is brittle;
   the `app/(npd)` tree has `_actions` but no `page.tsx` of its own.
4. **Gate "reject" does not roll back.** `approveProjectGate(decision='rejected')`
   only records a reason on `gate_approvals` (`approve-project-gate.ts:39-44`); it
   does not move the stage. The only backward path is the **admin-gated**
   `revertGate`, which uses the bare `admin` permission / role code — **not** a
   `npd.*` permission string (`gate-helpers.ts:212-226`), so it sits outside the
   `npd.*` RBAC family.
5. **Gate checklist is advisory, not blocking.** Seeded `gate_checklist_items` are
   progress markers only — required-but-unchecked items do **not** hard-block stage
   advance (explicit decision, `gate-helpers.ts:281-283`). The only real
   completeness signals enforced are the recipe-ingredients guard, the FG-conflict
   guard, the G4 e-sign, the handoff-checklist-complete gate, and the release
   preflight.
6. **The D365 Builder is a cache-refresh stub here.** The only D365 action wired in
   this tree is `refreshD365Cache` (`d365_import_cache`); the full per-FA
   `Builder_FA<code>.xlsx` 8-tab export described in `MON-domain-npd` is not present
   as a Server Action in `app/(npd)` (no `fa_builder_outputs` writer was found).
   D365 stays **export/import-only** per R15.
7. **Sensory is read-only here by design.** `getSensoryPanel` reads the panel but
   there is no NPD sensory write action — sensory schema is **03-Technical-owned**
   (`MON-domain-npd` canonical-owner boundary); NPD only consumes it for gating.
8. **`built` is not a release state.** It auto-resets to FALSE on any Main-Table
   edit (`update-fa-cell.ts` `built_reset`) and is flagged `[LEGACY-D365]`; release
   state is `factory_release_status`, not `product.built`. Do not treat `built` as
   "launched".

No raw `// TODO` markers were found in the lifecycle services beyond the
ownership/rename notes cited above; the gaps list is otherwise derived from the
state-machine / capability limits and the FA↔FG naming drift observed in the code.
