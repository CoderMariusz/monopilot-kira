# PROPOSED REFINEMENT — 09-quality T-065 RBAC must be a wave-1 blocker

**Type:** edit task metadata + wave plan. **Priority:** MED. **Finding:** Q-5.

## Problem
T-065 adds the 13 `quality.*` permission strings + `ALL_QUALITY_PERMISSIONS` to `packages/rbac/src/permissions.enum.ts`. STATUS.md confirms the enum currently has ZERO `quality.*` entries. Every Server Action task (T-006/007/018/019/026/027/028/038/051/053/054/055) gates on these strings — so T-065 is a hard prerequisite. But it is numbered last (T-065) and is NOT marked as a p0 blocker (unlike 11-shipping T-031 which IS).

## Proposed change
1. Add `"p0_blockers": ["T-065"]` to `09-quality/manifest.json` (mirror 11-shipping manifest pattern).
2. Place T-065 in **wave 1** of the execution plan, before any T2-api task.
3. Optionally raise its `priority` to match other wave-1 schema/RBAC tasks.

## Acceptance
- Execution plan schedules T-065 before the first quality Server Action task.
- 02-settings T-001 (enum owner) + T-130 (ESLint enum-lock guard) land before T-065 (already declared as xdeps).
