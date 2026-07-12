# Wave A5 — Quality, config seed & NPD gates (P1). Prod-repro'd 2026-07-12.

Repo: monopilot-kira. Work in THIS worktree only. DB ground truth: packages/db/migrations.
DISCIPLINE: every NEW raw SQL must PREPARE on real Postgres (verify columns vs migrations, no reserved aliases). withOrgContext COMMITS unless you THROW. NEVER export non-async from a 'use server' module. If you add SEED/config data use an additive migration, next free = 486 (max 485) — say so LOUDLY; idempotent + live-safe.

Files: `apps/web/app/[locale]/(app)/(modules)/quality/_actions/*` (inspection templates), production downtime/waste category config + `production/downtime`/`production/waste` pages, NPD pipeline gate actions `apps/web/app/(npd)/pipeline/[projectId]/*`, allergen remediation component.

## S15 (P1) — inspection for a new material has zero parameters; Pass/Fail/Hold blocked
A new material's inspection renders with no parameters, so a QA decision can't be recorded. Root: no inspection template/parameter resolution for materials without an explicit template (no default/fallback). FIX: resolve a default parameter set (or clearly require template assignment with a surfaced message) so an inspection is actionable; do not render an empty, dead inspection. Test: a material with no explicit template yields either a usable default parameter set or a clear "assign template" gate — never a blocked empty form.

## S16 (P1) — missing downtime & waste categories block pause + waste entirely
Pause (downtime) and waste registration are impossible because no downtime/waste categories exist. Root: the org has no seeded category taxonomy and the UI hard-requires one. FIX: seed a baseline downtime-reason + waste-reason taxonomy (additive idempotent migration, next free number — say LOUDLY) OR provide an in-app way to create them; the pause/waste flow must be usable. Mirror the yield_gate_override_reasons seed pattern. Test: with the seed, pause and waste registration succeed.

## S7 (P2) — consumption indicator sums across different UoM (kg + pcs)
The consumption progress indicator adds quantities of different units (kg + pcs) into one number. FIX: aggregate per-UoM (or normalize to a canonical unit) — never sum kg and pcs into a single scalar; show per-unit or percentage-of-plan instead. Test: a WO consuming kg and pcs shows correct per-UoM progress, not a nonsensical sum.

## S18 (P1) — NPD gate allowed advance to G2 with 0/3 required checklist points
A stage-gate advanced despite 0 of 3 required checklist items complete. Root: the gate advance doesn't enforce required-checklist completion (override path taken without the checks). FIX: block advance unless required checklist items are satisfied OR a genuine override with reason+e-sign is recorded; 0/3 must not silently pass. Test: advancing with unmet required items is blocked (or requires a recorded override), not silently allowed.

## S20 (P2) — allergen-criterion remediation link leads to a page with no accept mechanism
The "fix allergen criterion" link routes to a page lacking any way to accept/acknowledge the declaration, so the criterion can't be resolved. FIX: the remediation target must render the accept/acknowledge action that clears the criterion. Test: the remediation flow can actually mark the allergen criterion satisfied.

## Requirements
- Read touched files FULLY; grep callers. Seed migrations idempotent + additive + PREPARE on real PG.
- Tests per finding. tsc --noEmit clean + touched vitest green; FULL build if 'use server' export shape changes.
- Summary → `_meta/plans/prod-audit-2026-07-12/A5-summary.md`. Do NOT git add -A, no commit.
