#!/usr/bin/env bash
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt; CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
pids=""
for T in T-057 T-064; do
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 1500 "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
     -o "$WT/$T/.codex-rework2-last.md" - < "$WT/$T/.codex-rework.md" > "$WT/$T/.codex-rework2-out.log" 2>&1
    echo "$T exit=$?" >> "$WT/$T/.codex-rework2-out.log" ) &
  pids="$pids $!"; echo "launched rework $T pid=$!"
done
wait $pids
echo "=== C1 codex reworks DONE ===" | tee /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/runs/.rework-c1-done
