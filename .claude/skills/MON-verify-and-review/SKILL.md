---
name: MON-verify-and-review
description: The analysis, verification and self-review schema EVERY agent working on MonoPilot Kira must follow — writers before coding and before claiming done, reviewers when cross-reviewing a diff, orchestrators when arbitrating findings. Use whenever you implement, review, or merge ANY change here (code, migration, UI), whenever a prod error digest appears, and whenever you are about to write "done", "fixed" or "passing". Battle-tested 2026-07-07: this schema caught ~35 real defects before prod in one day.
tags: [monopilot, review, verification, migrations, rsc, self-review]
---

# MON-verify-and-review

One schema, three hats: **writer**, **reviewer**, **arbiter**. Unit tests here mock the
database and the RSC runtime, so the two places bugs actually live — live Postgres
triggers and the server→client boundary — are invisible to green test suites. That is
why every step below exists.

## 1. Writer — before coding

- Trace the real flow end-to-end first (route → action → SQL → trigger → consumer).
  The smallest diff in the wrong place is a second bug.
- Verify schema claims against the **live DB**, never against drizzle mirrors or your
  memory: `select column_name from information_schema.columns where table_name='…'`.
  (A whole sweep statement once targeted a column that did not exist.)
- Before writing to ANY table, list its triggers:
  ```sql
  select t.tgname, p.proname from pg_trigger t
  join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid
  where c.relname='<table>' and not t.tgisinternal;
  ```
  Immutability guards exist on: `grn_items` (completed GRN), `bom_lines` (active header —
  ANY line op rejected), `factory_specs` (clone-on-write), `formulation_ingredients`
  (locked version), `bom_snapshots`. New tables get them too — always check.
- Known ordering contract: a new BOM header is created **draft-first** — insert header
  as draft → insert lines → supersede old active → activate. Never lines-into-active.
- Wave0 lock: `org_id` (never tenant_id), RLS via `app.current_org_id()` on every hop.

## 2. Writer — RSC and server-action rules (3 prod screens died on this in one day)

- Props crossing server→client must be JSON-serializable. No inline closures
  (`action={(p) => f(p, opts)}` from a page = crash on hard load), no function-valued
  fields inside label/config objects. Fix pattern: named `'use server'` wrapper action;
  pure exported helpers that take the data object as an argument.
- `'use server'` modules export **only async functions** — a `export type`/const passes
  tsc and kills `next build`.
- Every fixed page gets a serializability regression test (walk the props object,
  assert no `typeof === 'function'` — see `item-wizard-labels.test.ts`).

## 3. Writer — migrations

- Additive by default; number = next free (check `packages/db/migrations/`). Vercel
  build **auto-applies** migrations on push — there is no "later".
- **Data migration ritual (mandatory):**
  1. Backup every affected table first: `\copy (select * from t) to '_meta/backups/<date>-<wave>/t.csv' csv header`.
  2. **Dry-run on the live DB**: copy of the file with `commit;` → `rollback;`, run with
     `ON_ERROR_STOP=1`, and embed *probes* — one statement that must PASS and one that
     must still FAIL (guard intact). A dry-run once caught a phantom column and a
     freeze-trigger that both reviews missed.
  3. Idempotent (run-twice mentally), `RAISE NOTICE` row counts per statement.
  4. Frozen history (completed GRNs, snapshots) is skipped-with-notice and normalized
     on read — never rewritten.
  5. If old code can write legacy values during the deploy window: ship a self-contained
     post-deploy sweep file **outside** `packages/db/migrations/` (the runner globs only
     that dir) and run it manually after READY.

## 4. Writer — self-review before claiming done

- Re-read your diff cold. For every function you changed, grep its OTHER callers — the
  root-cause fix lives where all callers route through.
- Paste **real** command output for tsc and each test file. A self-declared GREEN with
  no output is a FAIL. `CI=true pnpm install` first if node_modules is broken.
- State explicitly what you did NOT do and every ambiguity you resolved (and why).
  Honest gaps get fixed in review; hidden gaps become prod incidents.
- Commit early and often to your track branch. Never push. Never work in /tmp
  (a session crash once erased an entire wave of uncommitted /tmp worktrees).

## 5. Reviewer — cross-review a diff

- Writer ≠ reviewer, different model family. You get diff + the writer's spec
  (`.agent-prompt.md`) + arbitration questions. Read FULL files, not just hunks —
  several fixes land the same day; the diff may be stale.
- Hunt ranked REAL defects only (no style nits), in this order:
  1. live-DB safety (triggers, FKs, uniques, deploy-window),
  2. security (org scoping on every SQL hop, RBAC, gate bypasses),
  3. correctness (mass balance / double-count / vanish paths; positional SQL params vs tests),
  4. contract for sibling tracks (fields the UI or chain expects),
  5. overengineering (single-use abstractions, duplicated SQL that will drift).
- Verify the writer's own inventory yourself (grep again). Run the test suites yourself
  when the sandbox allows; report honestly when it doesn't.
- Verdict: `MERGE` / `FIX-FIRST (list)` / `REWORK`. Each finding: severity, file:line,
  concrete failure scenario, minimal fix.

## 6. Arbiter — before findings go back to the writer

- Confirm each finding **in the code yourself** before accepting it. Codex/Composer
  reviews include plausible-but-wrong items.
- "This diff reintroduces X" on a branch → check **branch-base drift** first
  (`git diff main...branch --name-only`) — the branch may simply predate the fix.
- Reject fixes that ADD abstraction (shared fixtures, wrapper layers) when the finding
  was about deletion; reject deleting files whose types can't move into a
  `'use server'` module.
- Decide contract questions explicitly (e.g. "domain is per-product, not per-project")
  and write the DECISION into the fix prompt — writers implement decisions, not debates.
- Small surgical fixes (≤ ~20 lines, you fully understand them) you may apply yourself;
  everything else goes back to the writing engine. High-risk reworks get a Codex re-check.

## 7. After merge — the gate is on main, and prod is the last reviewer

- Serial merge; on merged main: tsc + the union of touched test suites (branch-green is
  not merge-green — conflict resolutions and sibling tracks interact).
- After deploy READY: drive the changed flow in the browser on prod. Any 500 → pull the
  Vercel runtime error digest (`get_runtime_errors`) — it names the real exception the
  UI hides. Fix root-cause the same day; each live-found bug class gets added to §1-§3.
