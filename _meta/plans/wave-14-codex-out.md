Review written to [wave-14-codex-review.md](/Users/mariuszkrawczyk/Projects/monopilot-worktrees/wave14/_meta/plans/wave-14-codex-review.md).

Verdict: **fail**. The implementations appear correct, but the PO and TO rollback tests mock away transaction semantics and do not prove that group/order 1 is absent from persisted state after group/order 2 fails.

Targeted tests: 24 passed across 4 files. No other files were modified.
