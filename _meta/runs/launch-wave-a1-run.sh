#!/usr/bin/env bash
# Wave A1 LAUNCH-ONLY — reuse existing worktrees + clone DBs + prompts; run 12 Codex in parallel.
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
TASKS="T-002 T-003 T-004 T-005 T-006 T-030 T-036 T-041 T-049 T-054 T-069 T-070"

echo "=== Wave A1 (re)launch $(date): 12 parallel Codex ==="
pids=""
for T in $TASKS; do
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 1800 \
      "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
      -o "$WT/$T/.codex-last.md" - < "$WT/$T/.codex-task.md" > "$WT/$T/.codex-out.log" 2>&1
    echo "$T exit=$?" >> "$WT/$T/.codex-out.log" ) &
  pids="$pids $!"
  echo "launched $T pid=$!"
done
wait $pids
echo "=== Wave A1 ALL CODEX DONE $(date) ===" | tee "$REPO/_meta/runs/.wave-a1-done"
for T in $TASKS; do echo "$T: $(tail -1 "$WT/$T/.codex-out.log" 2>/dev/null)"; done
