---
description: "Phase 4 — execute one planned wave: parallel worktrees, routed models, four gates, cross-provider review, merge winners, refresh STATUS"
argument-hint: "<wave-number> [--auto N to run N waves]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit, TodoWrite
model: opus
---

# /kira:run-wave — Phase 4 Wave Executor

Wave: `$1`. Optional `--auto N` runs N consecutive waves without stopping.
Prereq: `_meta/plans/waves/wave-$1.json` exists from Phase 2.

Execute the wave under the worktree protocol with all gates enforced. You are
the orchestrator; sub-agents and Codex do the work in isolation.

## Procedure

1. **Load** `_meta/plans/waves/wave-$1.json`. Build a TodoWrite ledger:
   one item per task `{task_id, writer, risk_tier, gates, worktree, branch, state}`.

2. **Verify Gate 3 (deps).** For every task, confirm all `dependencies` +
   `cross_module_dependencies` are ✅ DONE in the owning `STATUS.md`. Any
   unsatisfied → hold that task, report it; do not dispatch.

3. **Spawn worktrees** (`03-WORKTREE-PROTOCOL.md`). Serialization points
   (enum/manifest/migration-number tasks) run alone first. Respect local
   capacity (default 3–4 local worktrees); send Codex-friendly `impl-logic`
   tasks to Codex (Cloud) in addition.

4. **Implement (routed writer).** Per `01-MODEL-ROUTING.md`:
   - `impl-standard`/`mechanical`/`impl-ui`/`test` → Claude `Agent` (Sonnet/Haiku/Opus) scoped to the worktree, loading the task-type + domain skills first.
   - `impl-logic` → `/codex:rescue` scoped to the worktree.
   Each writer follows RED → GREEN → CLOSEOUT from the task's `checkpoint_policy`.

5. **Gate 1 (real tests).** Inside each worktree run the applicable commands and
   capture real output:
   `pnpm --filter web vitest run <path>`, `pnpm db:test` (after `pnpm db:up`),
   `pnpm --filter web exec playwright test <spec> --trace on`, `pnpm lint`,
   `pnpm typecheck`. No captured pass = FAIL, send back to writer.

6. **Gate 2 (UI parity)** for UI tasks: verify literal anchor (`wc -l "<path>"`),
   five states, and capture screenshots + Playwright trace + axe + parity diff +
   deviation log per `UI-PROTOTYPE-PARITY-POLICY.md`. Missing evidence = FAIL.

7. **Gate 4 (review).** Call `/kira:review <task-id>` — risk-based cross-provider:
   Claude-written high-risk → Codex; Codex-written high-risk → Opus; low-risk →
   single cheaper-model self-check. Address findings; re-review; escalate after
   2 unresolved rounds.

8. **Merge winners.** Rebase the worktree onto integration HEAD, re-run the gate
   if integration moved, then `merge --no-ff`. Flip the task to ✅ in its
   `STATUS.md` with a concise evidence note (commands+results, files, review
   verdict). Tear down the worktree. Failed tasks stay ⏸ with the reason; keep
   their branch for rework.

9. **Wave report.** Print per-task pass/fail + evidence pointers + merged SHAs.
   If reality drifted from plan (new deps discovered, scope wrong), note it and
   recommend a targeted `/kira:consolidate` + `/kira:plan` re-run.

## Gate (STOP here)

Unless `--auto N` was given (then continue to the next wave automatically up to
N), STOP after the wave report and wait for human "go".

Never merge a task with a red/ungated gate. The writer never signs off its own work.
