#!/usr/bin/env bash
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt; CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
perl -e 'alarm shift @ARGV; exec @ARGV' 1500 "$CODEX" exec -C "$WT/T-031" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 -o "$WT/T-031/.codex-rework2-last.md" - < "$WT/T-031/.codex-rework.md" > "$WT/T-031/.codex-rework2-out.log" 2>&1
echo "T-031 rework exit=$?" >> "$WT/T-031/.codex-rework2-out.log"
echo done | tee /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/runs/.rework-t031-done
