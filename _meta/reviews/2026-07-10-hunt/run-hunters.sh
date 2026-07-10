#!/bin/bash
# 10 Codex gpt-5.6-sol bug hunters, 5 at a time
cd ~/Projects/monopilot-kira
H=_meta/reviews/2026-07-10-hunt
run() {
  local n=$1
  codex exec --full-auto --skip-git-repo-check -m gpt-5.6-sol -C ~/Projects/monopilot-kira \
    "$(cat $H/prompts/h$n.txt)" > $H/h$n-findings.md 2> $H/h$n.err
  echo "h$n rc=$?" >> $H/hunt-status.log
}
export -f run 2>/dev/null
for n in 1 2 3 4 5; do run $n & done
wait
for n in 6 7 8 9 10; do run $n & done
wait
echo "ALL DONE" >> $H/hunt-status.log
