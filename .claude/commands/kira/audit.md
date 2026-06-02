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

**Follow `docs/workflow/05-AUDIT-PLAYBOOK.md`** for the verdict vocabulary
(✅/🟡/⛔/👻/🔴/🧩), the per-`task_type` inspection checklist, the Walking Skeleton
audit, and the `REALITY.md` template. Infra context: DB + auth = **Supabase**,
deploy = **Vercel** (both already wired) — judge "real data" as querying Supabase,
not mocks.

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

3. **Walking Skeleton audit (PRIORITY — do this regardless of module filter).**
   Per `05-AUDIT-PLAYBOOK.md` → Walking Skeleton section, assess what the human
   flagged was never tasked: **login/auth (Supabase Auth), the app shell
   (sidebar/topbar/menu), navigation, and whether reachable pages render real
   Supabase data or mocks.** Compare the shell against
   `prototypes/design/Monopilot Design System/settings/shell.jsx` +
   `_meta/prototype-labels/prototype-index-foundation-shell.json`. Confirm
   `pnpm build` status. Output a one-line verdict: *can a user log in and navigate
   a clickable, Supabase-backed product today — yes/no + exact gap list.* This
   drives `/kira:skeleton` (Wave 0).

4. **Harvest carry-forwards.** Grep existing notes for deferred work that may
   not be tracked:
   `grep -rEo 'carry-forward[s]? T-[0-9]+|CF-T[0-9]+' _meta/atomic-tasks/*/STATUS.md`
   Collect into a candidate backlog (these feed Phase 1).

5. **Synthesize (research-synth → Opus, you).** Per module, write
   `_meta/audits/reality/<module>-REALITY.md` (use the playbook template):
   - reality table (task → verdict → evidence path → gap)
   - count reconciliation (files vs manifest vs STATUS)
   - phantom/carry-forward list + extra (code with no task)
   - top integration risks for this module
   Then write/refresh `_meta/atomic-tasks/<module>/STATUS.md` using the existing
   foundation legend (✅/🔄/⏸/⬜), marking honestly. Preserve existing rich notes;
   correct false ✅s to the real state.

6. **Scorecard.** Emit a repo-wide table: `module | declared | implemented | stub | missing | phantom | status-file?`, plus the Walking Skeleton verdict at the top.

## Gate (STOP here)

Print the scorecard + the Walking Skeleton verdict + the list of REALITY.md files
written + the carry-forward backlog size. Do NOT proceed to consolidation. Wait
for human "go".

Do not modify task JSONs, app code, or skills in this phase — audit only.
