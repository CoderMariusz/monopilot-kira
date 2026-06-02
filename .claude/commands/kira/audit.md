---
description: "Phase 0 — repo-wide ground-truth audit (declared tasks vs real code), refresh per-module STATUS.md"
argument-hint: "[module-filter, e.g. 02-settings | all]"
allowed-tools: Agent, Bash, Read, Grep, Glob, Write, Edit
model: opus
---

# /kira:audit — Phase 0 Ground-Truth Audit

Target: `$1` (a module folder like `02-settings`, or `all` / empty = every module under `_meta/atomic-tasks/`).

You are establishing reality. The declared task state is NOT trustworthy — e.g.
`00-foundation` shows 126 task files, manifest says 125, and `STATUS.md` claims
"61/61 DONE". Find the truth with file evidence.

## Procedure

1. **Enumerate** modules and, per module, the task files, the `manifest.json`
   `task_count`, and whether a `STATUS.md` exists.
   - `ls _meta/atomic-tasks/*/tasks/ | wc -l` per module; compare to manifest.

2. **Fan out (research-fanout → Sonnet).** For each module, launch a Sonnet
   `Agent` (parallel, independent) with this brief:
   > Read every `T-NNN.json` in `_meta/atomic-tasks/<module>/tasks/`. For each
   > task, determine its TRUE state by inspecting the actual repo:
   > - schema tasks → check `packages/db/` (migrations, schema, RLS) for the named artifacts
   > - api tasks → check `apps/web/app/**/_actions/*.ts`
   > - ui tasks → check `apps/web/app/**/page.tsx` + `_components/*` AND whether prototype-parity evidence exists
   > - test tasks → check for the named specs and whether they pass
   > Classify each: IMPLEMENTED (with file paths) / STUB (file exists, incomplete) /
   > MISSING / PHANTOM (referenced but no task file) / BROKEN (exists but failing).
   > Quote file paths as evidence. Do NOT fix anything. Report a compact table.

3. **Harvest carry-forwards.** Grep existing notes for deferred work that may
   not be tracked:
   `grep -rEo 'carry-forward[s]? T-[0-9]+|CF-T[0-9]+' _meta/atomic-tasks/*/STATUS.md`
   Collect into a candidate backlog (these feed Phase 1).

4. **Synthesize (research-synth → Opus, you).** Per module, write
   `_meta/audits/reality/<module>-REALITY.md`:
   - reality table (task → state → evidence path → note)
   - count reconciliation (files vs manifest vs STATUS)
   - phantom/carry-forward list
   - top integration risks for this module
   Then write/refresh `_meta/atomic-tasks/<module>/STATUS.md` using the existing
   foundation legend (✅/🔄/⏸/⬜), marking honestly. Preserve existing rich notes;
   correct false ✅s to the real state.

5. **Scorecard.** Emit a repo-wide table: `module | declared | implemented | stub | missing | phantom | status-file?`.

## Gate (STOP here)

Print the scorecard + the list of REALITY.md files written + the carry-forward
backlog size. Do NOT proceed to consolidation. Wait for human "go".

Do not modify task JSONs, app code, or skills in this phase — audit only.
