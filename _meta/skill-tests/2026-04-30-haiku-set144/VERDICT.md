# Skill test verdict — Haiku replay (prd-decompose-hybrid, 02-SETTINGS §14.3-14.4)

**Date:** 2026-04-30
**Generator model:** claude-haiku-4-5 (general-purpose subagent)
**Same slice:** 02-SETTINGS-PRD.md §14.3 + §14.4 (lines 1516-1547)
**Comparison baseline:** `_meta/skill-tests/2026-04-30-opus-set144/`

## Result: ⚠️ SOFT FAIL — passes formal validator (164/164) but fails quality gates

## A/B comparison

| Dimension | Opus | Haiku | Winner |
|---|---|---|---|
| Task count | 11 | 10 | Opus |
| Task types covered | T1+T2(2)+T3(7)+**T4(1)** | T1+T2(2)+T3(7) | **Opus** (Haiku missing E2E) |
| Tech stack accuracy | Next.js + Drizzle + vitest ✓ | **FastAPI + pytest in T-002/3** ✗, App Router-but-`pages/` in T-004 ✗, generic `src/` ✗ | **Opus** |
| Atomicity strictness | T-002 read/write only; T-003 skip separate | T-002 bundles read+write+skip+jump-validation+step-6 completion | **Opus** |
| AC count utilization (≤4 limit) | 11×4 (saturated) | 1×4 + 9×3 (under-used) | **Opus** |
| AC specificity | line-level PRD refs, idempotency cases, edge cases | section-level PRD refs, missing edge cases | **Opus** |
| Priority band discipline | 50/80/100 (canonical 50/80/100/120/150) | **80/85/90/95/100/105 (invented values)** | **Opus** |
| KPI assertion (line 57) | T-011 concrete `last_activity_at - started_at < 15min` | "measurement infrastructure assumed" weasel | **Opus** |
| Out-of-scope thoroughness | gap-backlog enhancements explicit per task | thinner — only SET-100/101 noted | **Opus** |
| Coverage GAP rows | 0 | 0 | tie |
| Formal validator pass rate | 180/180 | 164/164 | tie (both pass) |
| Generation cost | ~6×Haiku | 1× | Haiku (cheap) |

## Critical hallucinations (project context drift)

Haiku assumed a different stack despite all clues in the project being TypeScript/Next.js:

| File | Should be | Haiku wrote |
|---|---|---|
| API endpoint | Next.js Server Action `apps/web/app/(onboarding)/_actions/*.ts` | `src/api/routes/onboarding.py` (FastAPI) |
| Tests | `pnpm vitest`, `apps/web/e2e/*.spec.ts` | `pytest tests/api/test_onboarding_step.py` |
| Migrations | `packages/db/migrations/*.sql` (Drizzle) | `migrations/` + `schema.sql` (generic) |
| UI step page (T-004) | `apps/web/app/(onboarding)/6/page.tsx` (App Router) | `src/pages/settings/onboarding/step-6.tsx` (Pages Router) |
| Schema barrel | `packages/db/schema/organizations.ts` | `src/models/organization.py` |

Worse: Haiku is **internally inconsistent** — Python in T-002/T-003, TypeScript in T-004..T-010. A worker picking up T-002 would write FastAPI; T-004 would write TS Next.js. Stack split.

## Atomicity violation in T-002

Haiku's T-002 bundles:
1. POST endpoint route handler
2. Step number validation (1-6)
3. Form-data validation per step
4. Skip handling (which Opus extracted to dedicated T-003)
5. Step transition validation (no-jump rules)
6. Step 6 completion logic

That's 5+ deliverables in one task. Skill atomicity gate says ≤5 implementation steps AND single deliverable. Schema validator counted it as one task because it has one task_type, but the spirit of the gate is broken.

## Coverage gap masquerading as coverage

PRD line 57 KPI: `Onboarding time (first WO created) <15min P50, <30min P95`.

- Opus: T-011 E2E asserts `last_activity_at - started_at < 15min` against real DB.
- Haiku: marks T-002 as covering it via "state tracking with timestamps" + footnote "validation of <15min P50 / <30min P95 is monitoring/analytics work (not included in decomposition)".

That's a coverage hole. Without an E2E or load-test task, KPI is unverifiable from this backlog. Haiku effectively dropped the requirement while marking it covered.

## What Haiku did well

- Followed ACP TaskCreate top-level shape correctly (no forbidden keys).
- All canonical kira_dev pipeline_inputs fields populated.
- Coverage table format clean and thorough.
- AC ≤4 constraint respected (formally).
- No placeholders (TBD/TODO/etc.).
- Self-review accurately listed own decisions (didn't claim parity with Opus).

## Decision gate for Step 3

**Haiku is NOT trusted for autonomous PRD decomposition** without a project-context primer. Required mitigations if used for decomposition:
1. Inject explicit stack constraints into the prompt: "TypeScript only; Next.js App Router; Drizzle migrations under `packages/db/migrations/`; vitest for unit, Playwright for E2E; Server Actions over REST endpoints."
2. Inject example file paths from existing taskmaster (T-00a-001..T-00d-005) so Haiku anchors on real project layout.
3. Treat Haiku output as draft → require Opus review pass per task before ACP import.

**However**, Step 3 is a different workload: ADR-034 compliance audit. That's pattern-match against a checklist, NOT generation against an underspecified target. Haiku is well-suited for it because:
- Input: ADR-034 (transformation table) + 1 PRD per agent.
- Output: structured table of "found / not found / partial" per transformation.
- No project-stack inference required.
- No new content generation — only reading + classifying.

## Recommendation

✅ **PROCEED to Step 3** (15 Haiku in parallel for ADR-034 audit). The failure mode that hurt Step 2 (tech-stack hallucination) does NOT apply to ADR-034 audit, which is a pure read-and-classify task.

⚠️ **DO NOT use Haiku for full PRD decomposition** without project-context primer + Opus review gate.

✅ **For taskmaster→ACP migration**: use Opus (or Sonnet at minimum) with `prd-decompose-hybrid` skill, batch import as `draft`.
