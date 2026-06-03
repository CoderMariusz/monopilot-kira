# Module-by-Module Execution — the primary execution model

The long-run does **not** build all modules at once. It builds **one module at a
time**, in dependency order. Within a module the orchestrator has **full
autonomy** (it iterates until Claude *and* Codex agree the module's implemented
scope is complete and correct). At the **module boundary it STOPS** and hands you
a sign-off report for human review. This is the one deliberate human checkpoint
that overrides the otherwise-unattended autonomy — because you want to eyeball
each module on the deployed app before moving on.

## Why per-module (not global waves)

You review the product module by module. So the unit of "done + review" is a
module, not a wave. Waves still exist — they order tasks *inside* a module by
dependency — but the orchestrator finishes a whole module, reaches consensus, and
presents it, rather than scattering half-finished work across 16 modules.

## Module rollout order

`/kira:plan` emits a module-level topological order (foundation first, then
dependents). Default spine:

```
00-foundation → (02-settings, 03-technical) → 01-npd → 04-planning-basic
→ 05-warehouse → 08-production → 09-quality → 07-planning-ext → 10-finance
→ 11-shipping → 06-scanner-p1 → 13-maintenance → 15-oee → 12-reporting → 14-multi-site
```

Plus **Wave 0 (Walking Skeleton)** runs before everything (login + shell + nav +
Supabase data). The exact order is whatever the repaired cross-module dependency
graph dictates; the above is the expected shape.

## Within a module: full autonomy

1. Pull the module's tasks + intra-module dependency waves from the plan.
2. **Known external gaps:** any task here blocked by a *not-yet-built* upstream
   module is recorded as an EXPECTED EXTERNAL GAP (feature → blocking module/task)
   — it is NOT a failure and does NOT stop the module. Build everything that
   isn't externally blocked.
3. Run the waves to completion (`/kira:run-wave` mechanics: worktrees, routed
   models, the four gates, cross-provider review, merge). No human stop between
   intra-module waves — just phone pings.
4. **Claude+Codex consensus gate:** when the module's buildable scope is done,
   Claude and Codex each independently judge it against the module's tasks +
   `MON-domain-*` rules + prototype parity. Iterate fixes until **both** sign off
   (or escalate a true deadlock per the autonomy profile). Only then do you
   present it.
5. **Live-deploy verification (MANDATORY pre-sign-off) — Gate 5 in `02-QUALITY-GATES.md`:**
   green-local is NOT acceptance. Push → confirm Vercel build `READY` with a
   **fail-loud** migrate → verify Supabase `max(filename)` in `public.schema_migrations`
   equals the repo's highest migration (no stale schema) → log in to the deployed
   PREVIEW (`/en/login`, `admin@monopilot.test`) and Playwright-click EVERY module
   route, classifying OK/EMPTY/ERROR and pulling the exact server error
   (`get_runtime_logs` + Supabase `get_logs`) for any failure. Only present once the
   live click-through is clean or each failure is a recorded external gap.

## Module Sign-off Report (committed + pushed + phone push, then STOP)

At module completion, write `_meta/runs/<NN-module>-SIGNOFF.md` and push a phone
notification. The report MUST contain:

1. **Task → feature map** — every task in the module, its verdict (✅ done /
   ⏸ blocked-external / ⛔ not-applicable), and the user-visible feature it
   delivers. This is how we guarantee *no piece of work is missed*: if a feature
   you expect isn't in this map, it either has no task (→ create one) or belongs
   to another module (→ named there).
2. **Known external gaps** — features that look incomplete *on purpose* because
   they depend on a module not built yet, each with the blocking `module / T-NNN`.
3. **Evidence** — real test results, UI parity screenshots/trace/axe, AND the
   captured Gate-5 live-deploy click-through result (every route OK/EMPTY/ERROR on
   the deployed Vercel+Supabase preview, with the exact server error for any
   failure). The routes to click are listed for the human to re-verify.
4. **Consensus note** — Claude's and Codex's sign-off, and any deviations.

Then **STOP** and wait for your review. Ping says: "Module <NN> ready — review on
<routes>."

## Gap triage (when you leave review comments)

For each thing you say "doesn't work", the orchestrator classifies it into exactly
one bucket and acts:

| Bucket | Meaning | Action |
|---|---|---|
| **A — external dependency** | Broken because an upstream module isn't built yet | Point to the blocking `module / T-NNN`; record as external gap; revisit when that module lands. No new work now. |
| **B — in-scope, has an owning task** | Should work in this module; a task owns it | Name the task `T-NNN`; if its gate was wrongly passed → reopen + fix; re-run gates + consensus. |
| **C — in-scope, NO owning task (missed work)** | Should be in this module but no task covers it | **Create the task** (`prd-decompose-hybrid`), add to manifest/STATUS + the dependency graph, schedule it, implement it. This is the safety net against missed work. |
| **D — wrong module** | Belongs to a different module | Move/record it as that module's task; note it so it's not lost. |

The orchestrator reports the triage table back (phone + chat), implements buckets
B and C, and only then re-presents the module. You never have to remember which
task owns which feature — the task→feature map + triage table track it.

## Reconciling with cross-module ownership

Honor the canonical owners (`wo_outputs`→08, `schedule_outputs`→planning,
`oee_snapshots`→08 producer / 15 read-only, enum locks). If a review comment in
module X is really about a piece owned by module Y, that's bucket A or D — never
duplicate an owner across modules to "fill a gap."
