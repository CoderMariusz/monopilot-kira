---
description: "Phase 2 — topo-sort the repaired DAG into execution waves, assign model + review tier per task, emit EXECUTION-PLAN.md"
argument-hint: "[module-filter | all]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit
model: opus
---

# /kira:plan — Phase 2 Mega Execution Plan

Target: `$1` (module or `all`). Prereq: Phase 1 graph is consolidated + acyclic.

Turn the dependency DAG into a wave-based, model-routed, review-tiered plan that
Phase 4 executes deterministically.

## Procedure

0. **Reserve Wave 0 = Walking Skeleton.** Before the topo sort, pin the
   login/auth (Supabase Auth) + app-shell + navigation + DB-backed-data tasks
   (the ones `/kira:skeleton` materializes) to **Wave 0**, even if they would
   naturally fall later. This is the human's Definition-of-Done gate: a clickable,
   Supabase-backed product must exist before broad module work. Everything else
   starts at Wave 1 and may depend on Wave 0.

1. **Topological sort into waves.** Wave `N` = all tasks whose dependencies AND
   cross_module_dependencies are satisfied by waves `< N`. Within a wave, tasks
   must be mutually independent AND must not collide on the same file or
   migration number (per `03-WORKTREE-PROTOCOL.md`). Pull collisions apart into
   adjacent waves; place **serialization points** (enum files, manifests,
   migration-number-bearing tasks) alone or first in their wave.

2. **Assign per task:**
   - `writer` model/agent from `01-MODEL-ROUTING.md` (by task_type + logic-heaviness).
   - `risk_tier` (high/low) and the resulting review pairing (Gate 4).
   - which gates apply (Gate 2 only for UI; Gate 1 always; Gate 3 already encoded by wave order).
   - rough effort + whether it's a Codex-Cloud-friendly delegation.

3. **Compute the critical path** (longest dependency chain) — this bounds the
   minimum wall-clock; surface it so the human sees what can't be parallelized.

4. **Emit artifacts:**
   - `_meta/plans/EXECUTION-PLAN.md` — overview: total tasks, wave count,
     critical path, parallelism per wave, risk-tier distribution, module rollout
     order (foundation-first, then dependents).
   - `_meta/plans/waves/wave-NN.json` — per wave: ordered task list with
     `{task_id, module, task_type, writer, risk_tier, gates, deps_satisfied_by}`.

5. **Sanity checks (fail loud):** every task lands in exactly one wave; no task
   precedes a dependency; no wave has a file/migration collision; every UI task
   carries Gate 2; every high-risk task carries a cross-provider reviewer.

## Gate (STOP here)

Print: total tasks, number of waves, critical-path length, and **waves 1–3 in
full detail** (task → writer → risk → gates). Wait for human "go" before
execution. Do not write app code in this phase.
