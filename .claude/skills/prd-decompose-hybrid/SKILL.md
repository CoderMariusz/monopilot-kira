---
name: prd-decompose-hybrid
description: Decompose a PRD section into atomic JSON task files for the kira_dev pipeline. Use when filling gaps in _meta/atomic-tasks/{module}/tasks/ or generating tasks for a new PRD section. Produces T-NNN.json files + updates manifest.json + coverage.md. Required model: Opus (Haiku fails tech-stack accuracy). Do NOT use Haiku for this skill.
version: 1.1.0
model: opus
canonical_spec: _meta/plans/atomic-task-decomposition-guide.md
---

# PRD Decompose Hybrid Skill (Opus)

**Purpose:** decompose a PRD section into atomic tasks (T1-T5 types) and emit them as JSON files in `_meta/atomic-tasks/{module}/tasks/T-NNN.json`, then update `manifest.json` and `coverage.md`.

**Why Opus only:** Haiku hallucinates the tech stack (writes FastAPI/pytest instead of Next.js/Vitest), invents priority values, and misses E2E tasks. All confirmed in `_meta/skill-tests/2026-04-30-haiku-set144/VERDICT.md`.

## When to use

- Filling gap tasks identified by comparison analysis (missing sub-modules, missing screens, missing validators)
- Generating tasks for a new PRD section that has no T-NNN.json files yet
- Validating + splitting existing tasks that fail the atomicity gate (§11.3 of guide)

**Do NOT use when:**
- Writing implementation code (this skill only produces task specs)
- Generating tasks for a module you haven't read the PRD for

## Required reading (load in this order)

1. `_meta/plans/atomic-task-decomposition-guide.md` — full spec (T1-T5 types, JSON shape, atomicity gate, dependency conventions)
2. The target PRD file (e.g., `01-NPD-PRD.md`) — read ONLY the sections relevant to the gap being filled
3. Existing tasks in target module (`_meta/atomic-tasks/{module}/tasks/`) — read ALL to avoid duplicates and understand numbering
4. `_meta/atomic-tasks/{module}/manifest.json` — to know current task_count and file list
5. One example task JSON from same module — to match exact field conventions

**Do NOT read:**
- Other modules' tasks (out of scope)
- Full PRD if only filling a specific gap — read targeted sections only

## Task JSON shape (exact — validated by 180/180 checks in VERDICT.md)

```json
{
  "title": "T-NNN — <short imperative title> (<PRD sub-module ref>)",
  "prompt": "# T-NNN — <title>\n\nPRD: <prd-file> §<section>\nProject root: /Users/mariuszkrawczyk/Projects/monopilot-kira\n\n## Goal\n<2-3 sentences>\n\n## Implementation contract\n<numbered list, max 5 items>\n\n## Files\n- <path> [create|modify]\n\n## Acceptance criteria\n<numbered AC list>\n\n## Test strategy\n<RED/GREEN steps>\n\n## Risk red lines\n<bullet list of hard constraints>",
  "labels": ["prd", "<category>", "<subcategory>", "<task_type>"],
  "priority": 50,
  "max_attempts": 3,
  "pipeline_name": "kira_dev",
  "pipeline_inputs": {
    "root_path": "/Users/mariuszkrawczyk/Projects/monopilot-kira",
    "prd_task_id": "T-NNN",
    "source_prd": "<PRD-filename>.md",
    "prd_refs": ["§X.Y"],
    "category": "data|api|auth|ui|test|docs|infra",
    "subcategory": "<specific-area>",
    "task_type": "T1-schema|T2-api|T3-ui|T4-wiring-test|T5-seed",
    "parent_feature": "<sub-module name>",
    "context_budget": "<N>k",
    "estimated_effort": "<X-Y>h",
    "description": "<one sentence>",
    "details": "<2-4 sentences with implementation detail>",
    "scope_files": ["path/to/file.ts [create|modify]"],
    "out_of_scope": ["Do not do X (belongs to T-NNN)"],
    "dependencies": ["T-NNN"],
    "parallel_safe_with": ["T-NNN"],
    "acceptance_criteria": [
      "Given <state> when <action> then <outcome>"
    ],
    "test_strategy": [
      "RED: write test before impl",
      "Run '<command>'"
    ],
    "risk_red_lines": ["Do not ..."],
    "skills": ["test-driven-development", "requesting-code-review"],
    "checkpoint_policy": {
      "required_checkpoints": ["RED", "GREEN", "REVIEW", "CLOSEOUT"],
      "closeout_requires": ["changed_files", "test_commands_and_results", "acceptance_criteria_status", "deviations_from_prd", "git_status"]
    },
    "routing_hints": {
      "red": "hermes_gpt55",
      "implementation": "hermes_gpt55",
      "review": "opus_if_high_risk_or_ui_or_architecture",
      "close": "spark_low_risk_else_opus"
    }
  }
}
```

## Priority bands (canonical — do NOT invent values)

| Band | Value | When |
|---|---|---|
| P0 baseline | 50 | Schema/migration tasks (T1) that everything depends on |
| P1 foundation | 80 | API/Server Action tasks (T2) that UI depends on |
| P2 default | 100 | UI tasks (T3), wiring+test (T4), seeds (T5) |
| P3 extended | 120 | Optional/deferred features |
| P4 low | 150 | Docs, regulatory artifacts |

## Atomicity gate (apply before emitting EVERY task)

| Check | Pass | Fail → split |
|---|---|---|
| Single deliverable? | "Create migration for X table" | "Setup auth module" |
| ≤5 implementation steps? | 3 steps | 10+ steps |
| <100k context estimate? | ~40k | ~200k |
| Single task_type (T1/T2/T3/T4/T5)? | Only T1 | T1+T2+T3 bundled |

If any check fails → split into separate tasks. One task_type per file.

## AC rules

- Exactly 3-4 ACs per task (saturate the 4-AC limit for quality)
- Format: "Given <precondition> when <trigger> then <observable outcome>"
- Include edge cases and idempotency where relevant
- Reference PRD line/section explicitly in at least one AC

## Tech stack constraints (hard — do not hallucinate alternatives)

| Layer | Correct | Wrong |
|---|---|---|
| API | Next.js Server Actions in `apps/web/app/.../_actions/*.ts` | FastAPI, Express, `src/api/` |
| DB | Drizzle ORM + Postgres, `packages/db/migrations/*.sql` | SQLAlchemy, generic `migrations/` |
| Tests | Vitest (`pnpm --filter <pkg> test`), Playwright E2E | pytest, Jest standalone |
| UI | Next.js App Router `apps/web/app/.../(module)/page.tsx` | Pages Router `src/pages/` |
| Schema barrel | `packages/db/src/schema/*.ts` | `src/models/*.py` |
| i18n | next-intl | react-i18next |
| Auth | Supabase GoTrue + `@boxyhq/saml-jackson` | Clerk, Auth.js |

## Numbering convention

- Extend existing sequence in the module: if last task is T-047, next is T-048
- Never reuse existing numbers
- Update `manifest.json` task_count and tasks[] list after writing all files
- Write `coverage.md` rows for all new tasks (PRD ref → task file → status: covered)

## Output steps (in order)

1. Read PRD sections for the gap being filled
2. Read existing tasks in module to find last T-NNN number and avoid duplicates
3. For each gap area: plan the T1→T2→T3→T4 chain, apply atomicity gate
4. Write each `T-NNN.json` file
5. Update `manifest.json` (increment task_count, append to tasks[])
6. Append new rows to `coverage.md` (or create if missing)
7. Report: list of files written, coverage areas now filled, remaining gaps

## Dependency chain pattern (standard)

```
T-NNN (T1-schema) ← blocks → T-NNN+1 (T2-api) ← blocks → T-NNN+2 (T3-ui)
                                                           ↕ parallel_safe_with
                                                      T-NNN+3 (T3-ui, different files)
                                    └─ T-NNN+4 (T4-wiring-test) depends on all above
```

UI tasks that touch different files are `parallel_safe_with` each other.
T4 always depends on all T1/T2/T3 in its feature.
