#!/usr/bin/env bash
set -uo pipefail
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
WT=/Users/mariuszkrawczyk/Projects/kira-wt
PG=postgres://mariuszkrawczyk@127.0.0.1:5432
CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$REPO"

PAIRS="T-003:077 T-006:080 T-069:086"

echo "=== rework setup $(date) ==="
psql "$PG/postgres" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='monopilot' and pid<>pg_backend_pid();" >/dev/null 2>&1
for pair in $PAIRS; do
  T="${pair%%:*}"; m="${pair##*:}"
  db="monopilot_rw_$(echo "$T" | tr 'A-Z-' 'a-z_')"
  # teardown old wt/branch/clone
  git worktree remove --force "$WT/$T" >/dev/null 2>&1
  git branch -D "wt/$T" >/dev/null 2>&1
  rm -rf "$WT/$T" 2>/dev/null
  # fresh wt from current integration HEAD + fresh clone from canon
  git worktree add "$WT/$T" -b "wt/$T" >/dev/null 2>&1
  psql "$PG/postgres" -c "drop database if exists $db;" >/dev/null 2>&1
  psql "$PG/postgres" -c "create database $db template monopilot;" >/dev/null 2>&1 || { echo "CLONE FAILED $T"; continue; }
  echo "ready $T (mig $m, db $db)"
done
echo "=== rework prompts written separately; launch ==="
