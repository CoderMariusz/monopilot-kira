# PROPOSED PASS (not a feature task) — 04 + 07: remap `src/` scope_files to real monorepo roots

**Affects:** 04-planning-basic tasks (most T2/T3 tasks) + 07-planning-ext tasks T-012..T-052
**Type:** consolidation/normalization pass (run via kira:consolidate, NOT a build task)
**Risk tier:** medium (every affected task mis-paths the repo → implementer drift on day 1)
**Closes:** audit finding X-3

## Problem
04 and 07 task `scope_files`/prompts reference a `src/` layer that does not exist in this monorepo:
- 04 examples: `src/db/schema/...`, `src/app/(planning)/...`, `src/server/jobs/...` (T-030, T-045, etc.).
- 07 examples: `apps/web/src/app/api/scheduler/...`, `apps/web/src/lib/scheduler/...` (T-012..T-052).
Both `STATUS.md` files already flag this. **08-production is already correct** and is the template.

## Correct root mapping (from STATUS warnings + 08 examples)
| Wrong (`src/`) | Correct (this repo) |
|---|---|
| `src/db/schema/<m>/*.ts`, `src/db/migrations/*.sql` | `packages/db/schema/...`, `packages/db/migrations/*.sql` |
| `src/app/(planning)/.../page.tsx` | `apps/web/app/[locale]/(app)/(modules)/<module>/.../page.tsx` |
| `src/app/.../_actions/*.ts` | `apps/web/app/[locale]/(app)/(modules)/<module>/.../_actions/*.ts` OR `packages/api-services/<module>/*.ts` |
| `src/app/.../_components/*.tsx` | `apps/web/components/<module>/...` |
| `src/app/api/...` | `apps/web/app/api/...` |
| `src/server/jobs/*.ts` | `apps/worker/...` (foundation T-111) for long-running; `apps/web/app/api/internal/jobs/...` for cron routes |

## Scope
- Rewrite `scope_files` arrays + prompt path references for all affected 04 + 07 tasks to the correct roots.
- Fix the malformed T-060 (04) ship/receive ref-string (actual `planning/modals.jsx` lines 852–931 + 1341–1474).
- Re-run each module `_validate.py` after.

## Acceptance criteria
- Zero `src/` occurrences remain in 04 + 07 `scope_files`/prompts.
- `python3 _meta/atomic-tasks/04-planning-basic/_validate.py` and `.../07-planning-ext/_validate.py` pass.
- Paths match the 08-production convention.

## Red lines
- Do not change task scope/behavior — paths only.
- Do not introduce a `src/` directory to "make tasks right" — the repo convention is no-`src/`.
