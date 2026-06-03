#!/usr/bin/env bash
# Wave A1 launcher — 12 parallel Codex impls, each in its own worktree + cloned DB.
set -uo pipefail
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
WT=/Users/mariuszkrawczyk/Projects/kira-wt
PG=postgres://mariuszkrawczyk@127.0.0.1:5432
cd "$REPO"

# task:migration pairs (per _meta/decisions/2026-06-03-npd-migration-renumber.md) — no assoc arrays (bash 3.2)
PAIRS="T-002:076 T-003:077 T-004:078 T-005:079 T-006:080 T-030:081 T-036:082 T-041:083 T-049:084 T-054:085 T-069:086 T-070:087"
TASKS="T-002 T-003 T-004 T-005 T-006 T-030 T-036 T-041 T-049 T-054 T-069 T-070"

echo "=== Wave A1 setup $(date) ==="
# free the template DB so CREATE DATABASE ... TEMPLATE works
psql "$PG/postgres" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='monopilot' and pid<>pg_backend_pid();" >/dev/null 2>&1

for pair in $PAIRS; do
  T="${pair%%:*}"; m="${pair##*:}"
  db="monopilot_$(echo "$T" | tr 'A-Z-' 'a-z_')"   # T-002 -> monopilot_t_002
  json="$REPO/_meta/atomic-tasks/01-npd/tasks/$T.json"
  echo "--- setup $T (mig $m, db $db) ---"
  # isolated DB clone at canon+075
  psql "$PG/postgres" -c "drop database if exists $db;" >/dev/null 2>&1
  psql "$PG/postgres" -c "create database $db template monopilot;" >/dev/null 2>&1 || { echo "CLONE FAILED $T"; continue; }
  # worktree from integration HEAD (has T-001/075)
  rm -rf "$WT/$T" 2>/dev/null
  git worktree add "$WT/$T" -b "wt/$T" >/dev/null 2>&1 || git worktree add "$WT/$T" "wt/$T" >/dev/null 2>&1
  # per-task Codex prompt
  cat > "$WT/$T/.codex-task.md" <<PROMPT
# Implement $T (NPD module, T1-schema) — Codex implementer, TDD pipeline

Work ONLY in this worktree: $WT/$T . Read and faithfully implement the full atomic task contract:
$json
(honor its goal, files, acceptance_criteria, test_strategy, out_of_scope, risk_red_lines).

## CRITICAL OVERRIDES
- Migration filename: create it as **$m-<kebab>.sql** (3-digit prefix). The JSON's 4-digit
  "0010_"-style name is STALE — the runner only accepts 3-digit NNN-kebab.sql names.
- Real Drizzle schema dir is **packages/db/schema/** (NOT packages/db/src/schema/ — that dir was
  deleted by foundation T-053; do NOT recreate it). Add your table there and export it from
  packages/db/schema/index.ts.
- Wave0 lock: business-scope column is **org_id** (never tenant_id). RLS USING/WITH CHECK via
  **app.current_org_id()** + ENABLE + FORCE ROW LEVEL SECURITY. NEVER read
  current_setting('app.tenant_id') or current_setting('app.current_org_id'). Grant app_user the
  needed DML following the idiom in a recent org-scoped migration (read one first).
- Any compat view that must be read-only: a simple SELECT * view is AUTO-UPDATABLE in Postgres, so
  enforce read-only with an INSTEAD OF trigger that RAISEs — do not rely on a missing GRANT.
- If the task includes an Apex/default SEED, include it in the migration or a seed file per the task.

## Your isolated DB (already at migration 075 = product+fa present)
export DATABASE_URL='$PG/$db'
export DATABASE_URL_OWNER='$PG/$db'
export APP_USER_PASSWORD='app-user-test-password'

## TDD (MANDATORY, run for real)
1. RED: write the test(s) from the task's test_strategy; run and SHOW they fail.
2. GREEN: write the migration (+ Drizzle schema, + seed if required), then:
     pnpm --filter @monopilot/db exec tsx scripts/migrate.ts
     pnpm --filter @monopilot/db test <the test file/pattern for this task>
   Reuse existing test helpers for session-token + org bootstrap + app.set_org_context — don't invent.
3. Run  pnpm --filter @monopilot/db lint  on touched files.

## Closeout — print at the very end:
changed files, the EXACT test command + REAL pass/fail output, AC-by-AC status, deviations from PRD,
git status. NEVER claim GREEN without showing the actual passing test output.
PROMPT
done

echo "=== Wave A1 launching $(date): 12 parallel Codex ==="
pids=""
for T in $TASKS; do
  ( timeout 1500 codex exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
      -o "$WT/$T/.codex-last.md" - < "$WT/$T/.codex-task.md" > "$WT/$T/.codex-out.log" 2>&1
    echo "$T exit=$?" >> "$WT/$T/.codex-out.log" ) &
  pids="$pids $!"
  echo "launched $T pid=$!"
done
wait $pids
echo "=== Wave A1 ALL CODEX DONE $(date) ===" | tee "$REPO/_meta/runs/.wave-a1-done"
for T in $TASKS; do echo "$T: $(tail -1 "$WT/$T/.codex-out.log" 2>/dev/null)"; done
