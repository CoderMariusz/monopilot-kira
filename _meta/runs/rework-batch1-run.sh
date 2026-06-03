#!/usr/bin/env bash
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
TASKS="T-003 T-006 T-069"
echo "=== rework batch-1 launch $(date) ==="
pids=""
for T in $TASKS; do
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 1800 \
      "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
      -o "$WT/$T/.codex-rework-last.md" - < "$WT/$T/.codex-rework.md" > "$WT/$T/.codex-rework-out.log" 2>&1
    echo "$T exit=$?" >> "$WT/$T/.codex-rework-out.log" ) &
  pids="$pids $!"
  echo "launched rework $T pid=$!"
done
wait $pids
echo "=== rework batch-1 DONE $(date) ===" | tee "$REPO/_meta/runs/.rework-batch1-done"
for T in $TASKS; do echo "$T: $(tail -1 "$WT/$T/.codex-rework-out.log" 2>/dev/null)"; done
