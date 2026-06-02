---
description: "Execute ONE module end-to-end: run its waves to completion (full autonomy), reach Claude+Codex consensus, emit a sign-off report, then STOP for human review"
argument-hint: "<NN-module> (e.g. 02-settings)"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit, TodoWrite
model: opus
---

# /kira:run-module — build one module, then hand it to the human

Module: `$1`. The execution unit is a **module**, not a wave (see
`docs/workflow/07-MODULE-EXECUTION.md`). Within the module you have full
autonomy; at the module boundary you STOP for review.

Prereq: Phases 0–3 done; the Walking Skeleton (`/kira:skeleton`) is green; the
plan defines this module's intra-module waves and its place in the rollout order.

## Procedure

1. **Scope the module.** Load every task in `_meta/atomic-tasks/$1/tasks/` and the
   plan's intra-module waves. Build a TodoWrite ledger.

2. **Mark known external gaps.** For each task whose `cross_module_dependencies`
   point to a module that is NOT yet built, record it as an EXPECTED EXTERNAL GAP
   (feature → blocking `module / T-NNN`). Do not fail or stop on these; build
   everything not externally blocked.

3. **Run the module's waves to completion.** Per wave, apply `/kira:run-wave`
   mechanics: worktrees per task (`03-WORKTREE-PROTOCOL.md`), routed writer
   (`01-MODEL-ROUTING.md`), the four gates (`02-QUALITY-GATES.md`), cross-provider
   review (`/kira:review`), merge winners, refresh `STATUS.md`. No human stop
   between intra-module waves — push a one-line phone ping per wave and continue.

4. **Claude + Codex consensus gate.** When the buildable scope is done, run an
   independent dual assessment: Claude (Opus) and Codex each judge the module
   against its tasks + the `MON-domain-$1` rules + prototype parity + the four
   gates. Resolve findings and iterate until **both** sign off. A genuine deadlock
   after 2 rounds escalates to the human (autonomy profile); otherwise do NOT
   involve the human yet.

5. **Sign-off report.** Write `_meta/runs/$1-SIGNOFF.md` containing:
   - **Task → feature map** (every task → verdict → user-visible feature) so no
     work is missed;
   - **Known external gaps** (feature → blocking module/T-NNN);
   - **Evidence** (real test results, UI parity artifacts, the exact routes to
     click on the Vercel+Supabase app);
   - **Consensus note** (Claude + Codex sign-off, deviations).
   Commit + push it. Then `bash .claude/hooks/notify.sh "Module $1 ready for review — routes: <…>"`.

6. **STOP for human review.** This is a deliberate checkpoint. Wait for the
   human's comments. (They review on the deployed app and may reply from their
   phone — see `06-AUTONOMY-AND-REMOTE.md`.)

## Handling the human's review comments — gap triage

For each comment, classify into one bucket (`07-MODULE-EXECUTION.md` → Gap triage)
and act:
- **A external dep** → name blocking `module/T-NNN`, record as external gap, no work now.
- **B owning task exists** → name `T-NNN`; if its gate was wrongly passed, reopen + fix; re-run gates + consensus.
- **C missed work, no task** → create the task (`prd-decompose-hybrid`), register in manifest/STATUS + graph, implement it now.
- **D wrong module** → record as the other module's task so it isn't lost.

Report the triage table (chat + phone), implement B and C, re-run the consensus
gate, and re-present. Only advance to the next module in the rollout order once
the human signs off (or explicitly says "proceed, track the rest as gaps").

## Never

- Never duplicate a canonical owner across modules to "fill a gap" (that's bucket A/D).
- Never mark a task ✅ without its real gates green.
- Never skip the sign-off STOP — the module boundary is the human's review point.
