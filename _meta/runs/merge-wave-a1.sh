#!/usr/bin/env bash
set -uo pipefail
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
WTBASE=/Users/mariuszkrawczyk/Projects/kira-wt
cd "$REPO"
SCRATCH=".codex-task.md .codex-rework.md .codex-last.md .codex-rework-last.md .codex-out.log"
ORDER="T-002 T-004 T-005 T-030 T-036 T-041 T-049 T-054 T-070"
for T in $ORDER; do
  W="$WTBASE/$T"
  git -C "$W" add -A >/dev/null 2>&1
  git -C "$W" rm -q --cached --ignore-unmatch $SCRATCH >/dev/null 2>&1
  git -C "$W" commit -q -m "feat(01-npd): $T schema (Wave A1) — Codex impl, Opus cross-review

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" >/dev/null 2>&1
  out=$(git merge --no-ff "wt/$T" -m "merge(01-npd): $T [Wave A1]" 2>&1)
  uu=$(git diff --name-only --diff-filter=U)
  if [ -n "$uu" ]; then
    echo "$T RESIDUAL-CONFLICT: $uu"
  elif echo "$out" | grep -qiE 'conflict'; then
    git commit -q --no-edit && echo "$T merged (union-resolved)"
  elif echo "$out" | grep -qiE 'not something we can merge|fatal'; then
    echo "$T MERGE-FAILED: $out"
  else
    echo "$T merged OK"
  fi
done
echo "=== integration log (top 14) ==="
git log --oneline -14 | cat
