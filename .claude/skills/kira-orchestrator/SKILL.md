---
name: kira-orchestrator
description: >-
  The multi-model orchestration playbook for MonoPilot Kira long-runs. Use this
  WHENEVER you are running an autonomous/overnight build session, fanning work
  out across Codex + Opus sub-agents, clearing a backlog with multiple lanes, or
  deciding who should do a task and how to verify it — even if the user just says
  "keep the lanes going", "use Codex", "fix these bugs", "run the backlog", or
  "orchestrate this". It encodes WHO does what (Codex = backend grunt wiring;
  Opus = UI + architecture + orchestration), the mandatory cross-model review,
  the live-DB verification gates, the build/push discipline, and the lane-
  discipline lessons that keep flaky agents from corrupting the tree. Reach for
  it before dispatching the first lane, not after something breaks.
---

# Kira Orchestrator

You are the **orchestrator** (the main Opus loop). Your job is **decisions, task
distribution, verification, and integration** — NOT doing the tasks yourself when
a sub-agent can. You hold the plan and the context; the lanes hold the typing.
Delegate the work, keep the conclusion.

## Why this exists

A long-run touches dozens of files across many modules. One model can't hold it
all, and a single flaked write-path agent can leave a non-compiling tree. This
playbook is the harness that lets you run 2-6 lanes safely: route each task to the
model that's best at it, have the *other* model adversarially check it, prove
correctness against the live system (not the agent's own say-so), and integrate
through one disciplined build→commit→push gate. Every rule below was paid for with
a real failure — the "why" is in the text so you can adapt, not just obey.

## The model roster — who does what

| Lane | Agent | Owns | Never |
|---|---|---|---|
| **Orchestration** | you (main Opus loop) | decisions, routing, verification, migrations (MCP), build-gate, commit, push, the final report | grinding out code a sub-agent could write while you hold context |
| **Backend / wiring** | `codex:codex-rescue` (Codex) | Server Actions, SQL read-models, schema-adjacent wiring, mechanical refactors, tests — small tasks (≤4 files) of *any* difficulty | migrations (it dies on them); UI/architecture; anything it can't verify by a targeted test |
| **UI** | `kira-ui` (Opus) | any `apps/web/app/**` page/component, prototype-parity translation, modals, i18n wiring | backend logic; schema |
| **Review (of Codex)** | `kira-codex-review` (Opus) | adversarial review of Codex backend before push | rubber-stamping |
| **Review (of UI/Opus)** | a fresh Opus sub-agent / `kira-codex-review` | adversarial review of write-path UI / risky Opus output | — |
| **Research / audit** | `kira-research` / `Explore` (read-only) | ground-truth audits, gaps analysis, "what exists vs declared" | editing code |
| **Trivial edits** | `kira-easy` / `kira-mechanical` | renames, i18n key moves, one-line fixes | design judgment |

Default instinct: **Codex writes backend, Opus writes UI, the OTHER model reviews,
you verify against the live system and integrate.** The user's framing of this
exact split is the contract — honor it.

## The orchestration loop (run every tick)

1. **Report state.** What lanes are running? What finished? Append one line to the
   session progress log (`_meta/plans/<date>-autonomous-progress.md`).
2. **Integrate finished lanes** (see §Integration). Only when no lane is mid-edit.
3. **Route + dispatch** new lanes to keep the target count running (the user sets
   it — e.g. "2-3 Codex"). Pick from the backlog; give each a tight, single-purpose
   brief.
4. **Verify** everything that comes back (see §Verification). Never trust a
   self-declared GREEN.
5. **Reassess.** Re-read each result before deciding the next lane — you stay in
   the loop; you don't fire-and-forget a giant fan-out.

## Routing a task — the decision

- **SQL / schema migration?** → *you* do it via the Supabase MCP. Codex cannot
  reach the live DB and dies mid-migration. Write the `.sql` file, apply the DDL
  via MCP, record it in `schema_migrations` (real file sha256 checksum — the deploy
  gate compares it), verify live.
- **Backend Server Action / read-model / mechanical refactor / test?** → Codex, in
  a ≤4-file brief. Even hard logic is fine — just keep the *surface* small.
- **Any page/component/modal/i18n?** → `kira-ui`.
- **"Where is X / does Y exist"?** → `Explore` or `kira-research` (read-only).
- **A reversal / RBAC / money / regulatory backend change?** → whoever writes it,
  the OTHER model reviews it before push (non-negotiable — see §Cross-review).
- **Trivial mechanical edit you can do faster than briefing?** → still prefer to
  delegate if you're context-deep; your tokens are the scarce resource in a long-run.

## Cross-model review — the rule

**Every write-path change to a reversal, RBAC/permission, money, inventory, or
regulatory surface gets adversarially reviewed by the *other* model before it is
pushed.** Codex output → `kira-codex-review` (Opus). Risky Opus/UI output → a fresh
Opus skeptic or `kira-codex-review`.

This is not ceremony: Codex *keeps failing review* on exactly these surfaces — it
silently makes a natural key editable, bypasses a state machine, grants the wrong
permission, or uses the wrong audit table. The reviewer reads the whole
surrounding file, checks the specific failure modes, and returns SHIP /
FIX-FIRST / REJECT. You apply the FIX-FIRST fixes yourself (you have the context),
re-verify, then push. A SHIP verdict that's *conditional* on a live check (e.g. "a
generated uuid cast executes") is not done until you've run that check.

The reviewer's generic suggestion can itself be wrong — read it critically. (Real
case: a reviewer said "add `and status = $current` to the UPDATE"; that would have
broken the cancel path because a helper mutated status mid-function. The row lock
alone was the correct fix.)

## Verification gates — prove it, don't trust it

A self-declared "tests pass / build green" is a FAIL until you've reproduced it.
The agent ran mocked tests; mocks happily return a row for a column that doesn't
exist.

1. **PREPARE-test SQL on the LIVE DB.** For any new/changed query, run it through
   the Supabase MCP (`execute_sql`) against the real project, substituting the org
   literal for `app.current_org_id()` (it reads a per-session context table MCP
   can't set). Use `prepare … / execute … / deallocate …`. This catches 42703
   (missing column), 42P01 (missing table/grant), 22P02 (bad cast), 42501 (missing
   GRANT/RLS), 42P10 (SELECT DISTINCT order-by). **Verify the agent's ACTUAL
   columns**, not your assumption — read the query it wrote; a wrong column passes
   tsc and mocked tests but 500s live. Do NOT grep-and-cast: a grep sweep
   false-positives (e.g. "this DISTINCT needs an ORDER-BY fix") on queries that are
   fine. Confirm against the live schema before "fixing".
2. **Build gate — one, clean, never masked.**
   `pnpm --filter web build > /tmp/mk_build.log 2>&1; echo BUILD_EXIT=$?`
   NEVER pipe it through `| tail` (that masks the real exit code). Never run a build
   while a lane is mid-edit (it type-checks the working tree, including half-written
   files). A migration-only or docs-only change doesn't need a build.
3. **Re-run the real test** under the right config — `.tsx` RTL only runs under
   `vitest.ui.config.ts`; `.ts` under the default. The i18n parity test
   (`app/__tests__/i18n.test.ts`) must stay green when locale JSON changes.
4. **Spot-check the deliverable's substance**, not just exit codes — e.g. read the
   PL JSON values to confirm they're real translations, not English fallbacks.

## Integration & push discipline

- Stage **explicitly** (named paths). A long-run tree is full of untracked
  screenshots / regenerated test-evidence; `git add -A` would sweep them in.
- `cd` to the **repo root** before git ops — a compound `cd apps/web && …` leaves
  the shell there and doubles relative add-paths ("apps/web/apps/web/…").
- Commit in **logical groups** with a real message (what + why + the verification
  you ran). Co-author line per repo convention.
- Push via the out-of-session helper if in-session push is blocked (the project
  uses `open /tmp/mk_push.command`; clear `/tmp/mk_push.log` first, poll it for
  `EXIT=`). Confirm `0 unpushed` after.
- After a push, the green push ≠ a green deploy — verify the deployment state if it
  matters.

## Codex operating manual (put this in every Codex brief)

Codex is powerful but fragile. The brief must pin:
- **`task --wait --timeout-ms 3000000`** — without it the wrapper backgrounds and
  the child dies at ~240s, reporting "running in background" while leaving partial
  work. Even so it sometimes forward-flakes (returns early); **poll the working
  tree** for the real result.
- **Never run `pnpm build` / `next build`** — it hangs 6+ min and holds the
  next-build lock, flaking the lane.
- **≤4 files, single purpose.** Bigger = it dies mid-task and leaves a broken tree.
- **Verify by a targeted vitest + `tsc --noEmit`, not by its own summary.**
- **It can't reach the live DB** and **dies on migrations** — never give it either.
- Tell it the exact files + the exact bug (you investigate first); a vague brief
  multiplies its flake rate.
- If it touches the same i18n JSON another lane is editing → clobber. **One JSON
  editor at a time.**

## Lane discipline (hard-won)

- **Revert, don't salvage, a flaked write-path Codex lane.** If it stalled with a
  broad shared-type ripple touching a dozen files, `git checkout -- .` (preserve
  the diff to `/tmp` first) and re-dispatch as smaller slices. Salvaging a
  half-baked write path costs more than redoing it clean.
- **One JSON editor at a time.** Concurrent i18n edits silently clobber.
- **Build HEAD, not a half-edited tree.** Don't build during a concurrent code-edit.
- **rtk/proxy filters `git diff` and `grep` output** — when you need the raw diff
  or to confirm a value, read the file directly (Read tool / `node -e` on JSON),
  don't trust a filtered diff.
- **Don't over-spawn.** More lanes = more review burden on your deep context.
  Asymmetric pairing helps: one review-heavy lane + one trivial lane, not two hard
  backend lanes you must review simultaneously.

## Anti-patterns (stop if you catch yourself)

- Dispatching a fleet against an explicit "close the lanes" — the user's latest
  explicit instruction beats any automated tick/heartbeat.
- Applying an RBAC/SoD or money change the agent proposed without verifying each
  grant/column against the live system.
- "The tests passed" as your only evidence for a SQL change.
- Re-auditing already-covered surface to look busy — once coverage is complete,
  switch to fixing/building, or stop.
- Grinding code yourself while 3 lanes idle waiting for your routing decisions.

## Pointers

- Backlog map: `_meta/plans/BACKLOG.md` → the gaps reports (~100 tasks).
- Session ship log: `_meta/plans/<date>-autonomous-progress.md`.
- Project rules: `CLAUDE.md` + the `MON-*` domain skills.
- Codex death root-cause + fixes: the project memory `codex-plugin-model` /
  `codex-build-hang-and-broken-tree`.
