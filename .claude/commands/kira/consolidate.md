---
description: "Phase 1 — reconcile manifests/STATUS, harvest carry-forwards into tasks, repair the dependency DAG, normalize routing_hints"
argument-hint: "[module-filter | all]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit
model: opus
---

# /kira:consolidate — Phase 1 Consolidation + Dependency Repair

Target: `$1` (module or `all`). Prereq: Phase 0 REALITY.md files exist.

Build a single trustworthy, acyclic task graph. Task count is expected to grow
toward 1,000–1,500 — adding missing tasks/edges is the point.

## Procedure

1. **Reconcile counts.** For each module, make `manifest.json` `tasks[]`, the
   files in `tasks/`, and `STATUS.md` agree. Add missing files to the manifest;
   flag files with no manifest entry; resolve the foundation 125/126/61 type
   mismatches with a documented decision per module.

2. **Harvest carry-forwards into real tasks.** For each carry-forward from
   Phase 0 (e.g. "carry-forward T-062 withOrgContext HOF (P0 blocker)"):
   - If it represents real undone work → create a proper `T-NNN.json` using the
     `prd-decompose-hybrid` skill (Opus) with full `pipeline_inputs`
     (acceptance_criteria, scope_files, dependencies, skills, checkpoint_policy).
   - If it's already covered by an existing task → instead add the dependency edge.
   - Register every new task in the manifest + STATUS (⬜ PENDING).

3. **Validate + repair the DAG.**
   - Build the edge set from every task's `dependencies` (local) and
     `cross_module_dependencies` (module + task_id/CONTRACT).
   - Detect **cycles** → break by re-ordering or splitting a task; document why.
   - Detect **orphans** (no path from a foundation/root) and **dangling refs**
     (a `cross_module_dependencies.task_id: "T-NNN"` that doesn't exist) → fix.
   - **Add missing dependencies** the audit surfaced (e.g. UI task depends on its
     T2 action; a consume task depends on the quality T-064 gate; planning
     `schedule_outputs` vs production `wo_outputs` ownership respected).
   - Use a Sonnet fan-out to *propose* edges per module; you (Opus) approve and apply.

4. **Normalize routing_hints.** Replace legacy agent names with routing tokens
   from `docs/workflow/01-MODEL-ROUTING.md`:
   `hermes_gpt55 → impl-logic`, `spark_low_risk_else_opus → impl-standard`,
   `opus_if_high_risk_or_ui_or_architecture → impl-ui`/`impl-standard` by task_type.
   Set a `risk_tier: high|low` hint per Gate-4 criteria so `/kira:plan` can route review.

5. **Write a consolidation report** at `_meta/audits/CONSOLIDATION-REPORT.md`:
   counts before/after, new tasks added, edges added, cycles broken, orphans/
   dangling refs fixed, routing_hints normalized.

## Gate (STOP here)

Print graph stats (tasks, edges, +new, cycles fixed, orphans resolved) and the
report path. Wait for human "go" before planning.

Keep edits surgical and reviewable — one logical change per commit. Validate
each module's JSON against the canonical shape before finishing
(`_meta/reviews/2026-05-03-acp-real-task-schema.md`).
