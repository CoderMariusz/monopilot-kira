# Wave A6 — Access control, onboarding & RLS (P0/P1). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
DISCIPLINE: every NEW raw SQL PREPAREs on real Postgres (verify columns vs migrations, no reserved aliases). withOrgContext COMMITS unless you THROW — a persistence failure that returns instead of throwing leaves partial state (this is the exact class behind C6). NEVER export non-async from a 'use server' module. Migrations additive, next free = 486 — say LOUDLY.

Files: `apps/web/app/[locale]/(app)/(modules)/settings/users/_actions/*` (deactivate), onboarding flow `apps/web/app/[locale]/(app)/onboarding/*` + role provisioning, NPD project-create action, RLS migration.

## C6 (P0) — user deactivation fails with persistence_failed; account stays active
Two deactivation attempts returned persistence_failed; the account remained active. Root: likely the deactivate action swallows an error and returns persistence_failed (or a constraint/permission blocks the update) — mirror the wo-state-machine class (must THROW to roll back, and diagnose WHY the update fails: RLS? missing column? FK?). FIX: root-cause the failing UPDATE (read the exact error — set deleted_at/is_active/status per the real schema), make deactivation actually persist, and surface a real error if it genuinely can't. Test: deactivating a user flips them inactive and blocks their login/access.

## S21 (P1) — new regular user lands only on "Onboarding in progress" while admin uses the app
A newly-created normal user can log in but is stuck on an onboarding-in-progress screen with no path into the app, while the admin uses it normally. Root: onboarding-completion gate never satisfied for org-invited users / role provisioning incomplete. FIX: an invited user with a role should reach the app (onboarding gate must complete or be skipped for org members). Root-cause the gate condition. Test: an invited Core User reaches the app shell, not a dead onboarding screen.

## S22 (P1/verify) — production approval chain configured as single approver; dual-sign untestable
The production approval chain is single-approver, so a two-signer flow can't be exercised. Determine whether this is a config default or a bug (the app should SUPPORT a 2-approver policy where required). If it's a missing capability, enable configuring ≥2 approvers and enforce distinct signers; if it's just this org's config, document with evidence and provide the config path. Test only if a real code fix is made.

## S23 (P2) — "Create project & open recipe" opens Brief; new recipe has empty code/header
The "Create project & open recipe" affordance lands on the Brief and the new recipe has an empty code/header. FIX: creating the project+recipe should populate the recipe code/header and route to the recipe (or clearly to Brief with the header filled). Root-cause the missing initialization. Test: create-and-open yields a recipe with a non-empty code/header.

## RLS advisor (P3) — 6 public reference tables flagged rls_disabled_in_public
5/6 are intentional global lookups already write-revoked in mig 408 (currencies, iso4217, big_loss_categories, dashboards_catalog, operational_tables); yield_gate_override_reasons self-revokes. FIX (low): silence the advisor without behavior change — enable RLS with a permissive `using (true)` SELECT policy on these global reference tables (additive idempotent migration, next free number — say LOUDLY), OR document as accepted risk with rationale. Do NOT break the app's reads (app_user must still SELECT). PREPARE/verify.

## Requirements
- Read touched files FULLY; grep callers. Root-cause C6 and S21 (don't guess). Any new SQL/migration PREPAREs on real PG, idempotent, additive.
- Tests per finding. tsc --noEmit clean + touched vitest green; FULL build if 'use server' export shape changes.
- Summary → `_meta/plans/prod-audit-2026-07-12/A6-summary.md`. Do NOT git add -A, no commit.
