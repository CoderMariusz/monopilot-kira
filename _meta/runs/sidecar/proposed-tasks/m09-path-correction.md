# PROPOSED REFINEMENT — 09-quality corpus-wide UI path correction

**Type:** corpus-wide find/replace across all 09 task JSONs. **Priority:** MED. **Finding:** Q-3 (already flagged in STATUS.md, NOT yet applied).

## Problem
STATUS.md header states: `apps/web/src/` directory does not exist — all scope_file paths under that prefix are WRONG. Correct prefix is the locale/route-group App Router path.

## Proposed change
In every `09-quality/tasks/T-*.json`, rewrite `scope_files` (and `prompt`/`details` mentions):
```
apps/web/src/...   →   apps/web/app/[locale]/(app)/(modules)/quality/...
```
Apply only to UI/page/component paths under that prefix. Do NOT touch `packages/db/...`, `packages/server/...`, `packages/rbac/...`, `packages/ui/...` paths (those are correct).

## Verification
- `grep -l 'apps/web/src/' _meta/atomic-tasks/09-quality/tasks/*.json` returns ZERO after the fix.
- Spot-check one page task resolves to a real route group matching the Wave-0 skeleton (`apps/web/app/[locale]/(app)/(modules)/quality/page.tsx` already exists).
