---
name: MON-orchestration
description: The canonical multi-engine wave orchestration playbook for MonoPilot Kira. Use whenever you coordinate parallel implementation tracks (Composer/Codex/Opus/any engine), run a fix/build wave, merge track branches, deploy to Vercel, or resume a crashed session. Covers track design, worktree discipline, the impl → cross-review → arbitrate → fix → merge → deploy → live-E2E pipeline, and the recurring anti-overengineering pass. Pair with MON-verify-and-review (the per-agent quality schema) — this skill is the conductor, that one is the sheet music.
tags: [monopilot, orchestration, waves, worktrees, composer, codex, opus, deploy]
---

# MON-orchestration

Proven shape (waves R1–R4 + C1, 2026-07): parallel single-focus tracks, mandatory
cross-review by a different model family, human-grade arbitration, serial merge with a
gate on main, deploy, then **live E2E on prod as the final reviewer**. The engines are
interchangeable; the pipeline is not.

## 1. Design the wave

- 1 track = 1 focused task (2–3 small items max). Engines lose focus with more —
  a fat prompt buys you a shallow diff.
- Track count: as many as are truly independent (6–8 works). Overlapping files are
  allowed if you expect and plan the merge conflicts (uom-vocab unions etc.).
- Engine routing: **Composer** bulk implementation/refactors/tests (cheap, fast);
  **Codex** terminal/infra work and ALL cross-reviews (different family than the
  writer); **Opus/strong agent** UI and architecture-heavy tracks. The orchestrator
  never merges its own unreviewed work except surgical ≤20-line arbitration fixes.

## 2. Set up tracks

```bash
git worktree add ~/Projects/wt/<track> -b track-<track> main   # NEVER under /tmp
```
A crashed session once vaporized a whole wave of uncommitted /tmp worktrees; durable
path + commit-early is non-negotiable.

Write `.agent-prompt.md` into each worktree:
- context with **verified file:line anchors** (send a scout first if you lack them),
- exact scope + explicit OUT-of-scope (name the sibling tracks' territory),
- migration number assignment (serialize numbers across tracks yourself),
- the Discipline block: `CI=true pnpm install` first; tsc = 0; touched vitest files with
  **pasted real output**; commit early to the track branch; NEVER push; org_id/RLS rules,
- required Final report shape (files, decisions, ambiguities, what was NOT done).

Launch engines blocking, output to files (async bridges lose outputs):
`bash ~/.claude/scripts/cursor-exec.sh composer-2.5 <wt> <prompt> <out>` /
`codex exec --full-auto --skip-git-repo-check -C <wt> "$(cat prompt)" > out`.

## 3. Pipeline per track (no barriers — each track flows independently)

impl → **Codex cross-review** → arbitrate → fix-round (writer engine) →
re-check only if high-risk (data migration, tx semantics) → ready-to-merge.

- Review prompts are written by the orchestrator, per-track, with named risks and the
  writer's own flagged decisions as arbitration questions (see MON-verify-and-review §5).
- Arbitrate per MON-verify-and-review §6: verify findings in code, kill false positives
  (branch-base drift is the classic), turn accepted findings into DECISIONS in the fix
  prompt.

## 4. Merge, gate, deploy

1. Serial `git merge --no-ff track-*` into main; resolve conflicts as unions where both
   sides are additive; re-run the union of touched tests **on merged main** + tsc.
2. Strip orchestration artifacts before push (`.agent-*/.review-*` — agents sometimes
   `git add -A` them; also revert accidentally-swept generated files to main's version,
   don't delete them).
3. **Vercel auto-applies migrations on push.** Data migration in the wave ⇒ CSV backup
   of affected tables + live dry-run first (MON-verify-and-review §3), THEN push.
4. Watch the deploy (`vercel ls`), run any post-deploy sweep file manually, then
   **drive the changed flows in the browser on prod** with the docs/guide test login.
   Unit-green ≠ done: triggers, FKs and RSC boundaries only fail live.
5. Prod 500 → `get_runtime_errors` digest → root-cause fix same wave.

## 5. Cadence and hygiene

- **Anti-overengineering pass every 2–3 waves** (owner directive): a Codex review over
  the whole wave-range diff hunting deletions only; apply pure deletions, reject
  findings that add abstraction.
- Memory checkpoint (auto-memory file) after each wave: state, live-found bug classes,
  next steps — this is what survives a session crash.
- Cleanup after merge: `git worktree remove`, `git branch -D track-*`.
- Report to the owner after each wave in closeout format: co doszło / jak pomaga /
  gdzie fizycznie widać różnicę (route).

## 6. Crash recovery

Branches survive; /tmp worktrees don't. On resume: `git worktree prune`,
`git branch -a` for `track-*` ahead of main, `git fsck --lost-found` for dangling
commits, memory checkpoint for wave state — then relaunch unfinished tracks from their
prompts (they live in the worktrees; keep copies in scratchpad).
