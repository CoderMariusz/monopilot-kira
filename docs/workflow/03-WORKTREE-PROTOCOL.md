# Worktree Protocol — hybrid parallelism

**Model:** parallel **within** a wave (tasks in a wave are mutually independent
by construction), serialized **across** dependency edges. Each task runs in its
own `git worktree` on its own branch, so concurrent agents never collide. The
orchestrator reviews diffs and merges only winners.

## Layout

```
<repo>/                      # integration branch (e.g. kira/long-run)
../kira-wt/<task-id>/        # one worktree per in-flight task
```

## Lifecycle per task

```bash
# 1. spawn (from the integration branch HEAD)
git worktree add ../kira-wt/T-042 -b wt/T-042

# 2. the routed agent works ONLY inside ../kira-wt/T-042
#    (Claude sub-agent with cwd there, or Codex via /codex:rescue scoped to it)

# 3. gates run inside the worktree (real tests, parity evidence, review)

# 4. merge winner back (fast-forward-friendly; rebase if integration moved)
git -C <repo> merge --no-ff wt/T-042   # or cherry-pick the reviewed commits

# 5. teardown
git worktree remove ../kira-wt/T-042
git branch -d wt/T-042
```

## Concurrency rules

- **Max parallel worktrees** = your local capacity (CPU/RAM/DB connections). A
  practical default is 3–4 local Claude worktrees. Codex Cloud tasks run *in
  addition* (they don't use local resources) — so e.g. 3 local + 4 Codex Cloud.
- **Never** put two tasks that touch the same file or the same migration number
  in the same wave. The planner (`/kira:plan`) enforces this; if reality forces
  it, serialize them.
- **Shared-resource tasks** (migration numbering, `events.enum.ts`,
  `permissions.enum.ts`, `MON-INDEX.md`, manifests) are **serialization points**
  — run alone, merge, then fan out the next batch. Migration filename is taken
  verbatim from the task JSON `scope_files` (per `00-foundation/STATUS.md` lock).
- **DB-touching tasks** need a live Postgres (`pnpm db:up`). If worktrees share
  one local DB, run DB tests serially or give each worktree its own schema/db
  to avoid RLS/seed cross-talk.

## Merge & conflict policy

- Rebase a worktree branch onto the latest integration HEAD before its final
  gate run if integration advanced — catch integration breakage *before* merge,
  not after.
- Merge order within a wave is arbitrary (tasks are independent) **except**
  serialization points, which merge first.
- A worktree that fails gates is **not** merged; its branch is kept for rework
  (re-route or escalate), not deleted.

## Codex worktrees

`/codex:rescue` can be scoped to a worktree path so a Codex implementation task
stays isolated exactly like a Claude one. For Codex **Cloud** delegation, hand
it the task contract + the target branch; pull its branch into a local worktree
for the gate run and merge. Either way the same four gates apply before merge.

## Bookkeeping

The orchestrator maintains a live in-session ledger (task → worktree → branch →
gate status → merged?) and reflects merged tasks into the module `STATUS.md`.
Worktrees are ephemeral; only merged commits + `STATUS.md`/plan updates are
durable.
