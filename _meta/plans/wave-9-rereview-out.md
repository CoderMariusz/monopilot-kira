Re-review completed and [_meta/plans/wave-9-codex-review.md](/Users/mariuszkrawczyk/Projects/monopilot-worktrees/wave9/_meta/plans/wave-9-codex-review.md) overwritten.

Verdict: **fail**

Bug 1, Bug 3, and canonical ownership are fixed. Bug 2 still has:

- A concurrent, different-output-type race that can over-attribute genealogy.
- Unsafe mixed-UoM summing via `sum(qty_consumed)` with `min(uom)`.

Targeted tests passed: 4 files, 29 tests. No other files were modified.
