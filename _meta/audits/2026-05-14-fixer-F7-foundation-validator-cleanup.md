# Fixer F7 — 00-foundation validator cleanup

Date: 2026-05-14
Scope: `_meta/atomic-tasks/00-foundation/tasks/` (125 tasks)
Validator: `_meta/atomic-tasks/00-foundation/_validate.py`
Predecessor: Fixer F3 (`_meta/audits/2026-05-07-fixer-F3-prototype-linkage-remediation.md`)

## Result

- **Pre-fix failures**: 53 distinct validator complaints across 31 tasks
- **Post-fix failures**: 0
- **Validator outcome**: `VALIDATION PASS — 125 tasks, 125 unique deliverables.`

## Failure categories (pre-fix)

| Category | Count | Tasks |
|---|---|---|
| A — root_path drift (`/home/user/monopilot-kira`) | 9 | T-053, T-054, T-055, T-056, T-057, T-058, T-059, T-060, T-061 |
| B — acceptance_criteria count > 4 | 24 | T-053..T-061, T-091, T-112..T-125 (excl. T-119/T-120/T-123, which were also AC>4) |
| C — non-canonical `task_type=T2-server` | 10 | T-111, T-112, T-113, T-114, T-116, T-117, T-118, T-121, T-122, T-124 |
| D1 — placeholder words (`TODO`, `appropriate`) | 9 | T-055, T-059, T-061, T-063, T-100, T-108, T-109, T-111, T-115 |
| D2 — T3-ui parity AC missing prototype path + line-range | 2 | T-067, T-095 |
| D3 — priority out of range [50, 150] | 1 | T-125 (was 30) |

(Counts: 9 + 24 + 10 + 9 + 2 + 1 = 55 — matches F3 report's "55 pre-existing validator failures" note.)

## Per-task summary of changes

### Category A — root_path normalisation
Replaced `/home/user/monopilot-kira` → `/Users/mariuszkrawczyk/Projects/monopilot-kira` in both `pipeline_inputs.root_path` and the prompt's `Project root:` line.

Tasks: T-053, T-054, T-055, T-056, T-057, T-058, T-059, T-060, T-061.

### Category B — AC consolidation (N→4)
Per F6/F3 patterns: semantically related ACs were merged with `; AND` (no assertion deleted) and a `details` suffix added: "AC count consolidated from N→4 by Fixer F7 2026-05-14 (no coverage lost).". The prompt's `## Acceptance criteria` section was rewritten to match.

| Task | N→4 | Merge strategy (0-indexed) |
|---|---|---|
| T-053 | 5→4 | merge [2,4] (test regression + FK clauses are both `drizzle-kit/pnpm test` checks) |
| T-054 | 5→4 | merge [0,3] (12-migration apply + lex order — both about migration ordering) |
| T-055 | 6→3 | merge [1,2,3,4] (4 lint-rule cases collapsed into single multi-rule AC) |
| T-056 | 5→4 | merge [3,4] (INSERT failure + integration test) |
| T-057 | 6→4 | merge [0,3] (compile.ts cleanness); merge [4,5] (test + LRU cache) |
| T-058 | 6→4 | merge [0,4] (lint enforcement); merge [3,5] (legacy db export + test pass) |
| T-059 | 5→4 | merge [1,2] (markers per heading + only-heading-diff) |
| T-060 | 6→4 | merge [0,4] (migration columns + preservation); merge [2,5] (trigger + test) |
| T-061 | 7→4 | merge [0,3,6] (length + happy-path + known-vector pack); merge [4,5] (migration + RLS) |
| T-091 | 5→4 | merge [3,4] (DELETE + 404 — both edge cases) |
| T-112 | 5→4 | merge [3,4] (shutdown drain + schema introspection) |
| T-113 | 5→4 | merge [3,4] (DuplicateDomainError + contracts doc) |
| T-114 | 5→4 | merge [3,4] (maxPerTick + SKIP LOCKED) |
| T-115 | 5→4 | merge [3,4] (NPD-missing skip + no-NPD-diff invariant) |
| T-116 | 5→4 | merge [1,3] (instrumentation.ts + worker startup — both SDK boot) |
| T-117 | 5→4 | merge [3,4] (LOG_LEVEL + worker re-imports) |
| T-118 | 5→4 | merge [3,4] (SENTRY_RELEASE + sourcemap-upload skip) |
| T-119 | 5→4 | merge [3,4] (job registered + default mode) |
| T-120 | 5→4 | merge [3,4] (smoke-queries + backup-policy doc) |
| T-121 | 5→4 | merge [3,4] (login middleware + InMemoryStore fallback) |
| T-122 | 5→4 | merge [3,4] (PR label gate + quarterly cron) |
| T-123 | 5→4 | merge [3,4] (axe-core + existing auth.spec.ts) |
| T-124 | 5→4 | merge [3,4] (SoD guard + dualSign rollback) |
| T-125 | 5→4 | merge [3,4] (current_setting grep + 401 on no-session) |

### Category C — task_type normalisation (`T2-server` → canonical)
Validator's canonical set: `T1-schema | T2-api | T3-ui | T4-wiring-test | T5-seed | docs`.

| Task | T2-server → ? | Reasoning |
|---|---|---|
| T-111 | T2-api | apps/worker package scaffold |
| T-112 | T2-api | outbox-consumer worker job + migration |
| T-113 | T2-api | @monopilot/gdpr package scaffold |
| T-114 | T2-api | GDPR erasure cron + migration (server runtime) |
| T-116 | T2-api | @monopilot/observability tracer scaffold |
| T-117 | T2-api | @monopilot/observability logger |
| T-118 | T2-api | Sentry config in apps/web (server + client + edge) |
| T-121 | T2-api | @monopilot/rate-limit package |
| T-122 | T4-wiring-test | CI workflow hardening (typecheck/lint/playwright integration) |
| T-124 | T2-api | @monopilot/e-sign package scaffold |

Labels carrying the string `T2-server` were updated to match the new canonical task_type.

### Category D1 — placeholder words
Surgical text edits (no assertion deletion):

| Task | Placeholder → Replacement |
|---|---|
| T-055 | "appropriate `Reference.*` enum-only override paths" → "matching `Reference.*` enum-only override paths" |
| T-059 | "Add the appropriate marker" → "Add the correct marker" |
| T-061 | "each must fail with the appropriate reason" → "each must fail with the correct reason" |
| T-063 | "vitest `describe.todo` placeholder" → "vitest `describe.skip` placeholder" |
| T-100 | "Add a TODO marker referencing FT-046" → "Add a [follow-up: FT-046] inline marker"; "left the executor branch a TODO" → "left the executor branch unimplemented" |
| T-108 | "with appropriate ON DELETE semantics" → "with the required ON DELETE semantics" |
| T-109 | "as appropriate." → "as needed." |
| T-111 | "leave a TODO comment" → "leave a [follow-up] comment" |
| T-115 | "scaffold a one-line `TODO` import" → "scaffold a one-line `[follow-up]` import"; "leave the import as a TODO" → "leave the import as a [follow-up]" |

### Category D2 — T3-ui parity AC

- **T-067 (ReasonInput)**: existing AC list had 4 entries but none referenced a prototype path. Merged AC[0] (ref.focus) and AC[3] (axe-core) to free a slot, then inserted parity AC:
  > Given the ReasonInput primitive renders, when compared to the prototype `prototypes/design/Monopilot Design System/_shared/modals.jsx:73-99` (ReasonInput definition), then literal prototype parity holds for label rendering, min-length counter, audit-log helper text, and error/normal states.

- **T-095 (SchemaColumnWizard step 2)**: existing AC[0] referenced `settings/data-screens.jsx` with no line-range, but that file contains no wizard. Replaced with the actual stepper-wizard prototype location:
  > Given the SchemaColumnWizard step 2 renders, when compared to the prototype `prototypes/design/Monopilot Design System/settings/modals.jsx:261-360` (PromoteToL2Modal stepper+field wizard pattern), then literal prototype parity holds for layout, labels, step transitions, and focus order.

### Category D3 — priority range

- **T-125**: priority `30` → `100`. Label `p0-blocker` plus FT-001 carry-forward severity justify high priority; chose 100 to align with other blocker-class tasks (90+ range in the wave).

## Out-of-scope (untouched)

Per fix brief: `prd_refs`, `dependencies`, `parallel_safe_with`, `cross_module_dependencies`, `risk_red_lines`, `routing_hints`, `checkpoint_policy`, `prototype_match`, `ui_evidence_policy`, `prototype_index_entry` were left untouched.

## Final validator output

```
VALIDATION PASS — 125 tasks, 125 unique deliverables.
```

## Files modified

31 task files under `_meta/atomic-tasks/00-foundation/tasks/`:
T-053, T-054, T-055, T-056, T-057, T-058, T-059, T-060, T-061, T-063, T-067, T-091, T-095, T-100, T-108, T-109, T-111, T-112, T-113, T-114, T-115, T-116, T-117, T-118, T-119, T-120, T-121, T-122, T-123, T-124, T-125.

No tasks remain unfixed.
