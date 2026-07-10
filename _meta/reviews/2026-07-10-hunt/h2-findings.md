## Findings

### P1 — Creating a formulation version silently drops current formulation data

[create-version.ts:56](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/create-version.ts:56) clones only the original version fields, omitting `processing_overhead_pct`, which is a persisted recipe percentage added at [342-formulation-processing-overhead-pct.sql:5](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/342-formulation-processing-overhead-pct.sql:5).

Likewise, the ingredient clone at [create-version.ts:85](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/create-version.ts:85) omits:

- `cost_currency`, added at [397-formulation-ingredients-cost-currency.sql:8](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/397-formulation-ingredients-cost-currency.sql:8)
- `substitute_item_id`, added at [424-recipe-line-substitutes.sql:7](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/424-recipe-line-substitutes.sql:7)
- `wip_definition_id`, added at [430-wip-definitions-platform.sql:160](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/430-wip-definitions-platform.sql:160)
- `npd_wip_process_id`, added at [450-npd-per-process-line-and-consumption.sql:31](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/450-npd-per-process-line-and-consumption.sql:31)

Failure scenario: selecting “Add version” from a configured formulation creates an apparently valid draft but resets its processing overhead and strips WIP routing, substitute, and currency provenance from every ingredient. Subsequent costing and production handoff operate on materially different data without warning.

Suggested fix: explicitly clone every current version/ingredient business column and add a regression test populated with non-default values for each field.

### P2 — Formulation deletion leaves orphaned nutrition records

`formulation_versions` correctly cascades from formulations at [093-formulations.sql:18](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/093-formulations.sql:18), but the following child-like columns are plain UUIDs with no FK or deletion cleanup:

- `nutrition_profiles.formulation_version_id` at [086-nutrition.sql:34](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/086-nutrition.sql:34)
- `nutrition_allergens.formulation_version_id` at [086-nutrition.sql:48](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/086-nutrition.sql:48)
- `nutri_score_results.formulation_version_id` at [086-nutrition.sql:64](/Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/086-nutrition.sql:64)

Failure scenario: deleting an NPD project cascades through formulations and versions, but computed nutrition rows retain UUIDs for versions that no longer exist. This creates unverifiable derived records and permits unbounded orphan accumulation.

Suggested fix: add org-safe foreign keys with `ON DELETE CASCADE`, after detecting and resolving existing orphans. If retention is intentional, use `ON DELETE SET NULL` and preserve explicit provenance separately.

## Clean areas verified

- Formulation, packaging, and handoff mutations consistently execute through `withOrgContext`.
- Examined writes use `app.current_org_id()` or forced org-scoped RLS; no unscoped cross-org write was found.
- Packaging decimal inputs are transported as strings and cast to PostgreSQL `numeric`.
- Formulation draft saving performs percentage derivation in PostgreSQL numeric arithmetic.
- Packaging mutations refresh the RSC through `router.refresh()`.
- Formulation create/save/submit/lock/unlock success paths reload, navigate, or refresh the RSC.
- Handoff promotion, generation, release, and revert flows refresh their RSC state.
- Core formulation, packaging, and handoff parent-child FKs otherwise use the expected cascades.

## Not covered

- Areas outside the three specified route stages and `apps/web/lib/npd`, except migrations required to establish schema truth.
- Live Supabase trigger and RLS execution.
- Browser behavior, concurrency/load testing, and runtime test suites.
- RBAC completeness except where needed to understand a write path.
- Previously excluded known bugs.
- UI parity, accessibility, and i18n.

This was a read-only static audit. No files were modified and no tests were run. `git diff --stat` was empty; pre-existing untracked `_meta` files were left untouched.
