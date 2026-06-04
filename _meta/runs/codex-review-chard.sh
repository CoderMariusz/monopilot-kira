#!/usr/bin/env bash
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt; CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
review() {
  local T="$1" desc="$2"
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 900 "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
    -o "$WT/$T/.codex-review-last.md" - > "$WT/$T/.codex-review-out.log" 2>&1 <<PROMPT
You are the CROSS-PROVIDER reviewer (Codex) of OPUS-written code for task $T ($desc). The writer was Opus; you must adversarially review — writer never signs own work. Review the uncommitted changes in this worktree.
Focus: (1) money/NUMERIC EXACTNESS — confirm NO JS float is used for monetary values anywhere (no Number()/parseFloat on money; decimal/bigint kept exact); find any drift. (2) Correctness of the algorithm vs the task contract _meta/atomic-tasks/01-npd/tasks/$T.json + .claude/skills/MON-domain-npd/SKILL.md. (3) Are the tests NON-VACUOUS and do they actually run green? Re-run them. (4) org_id/RLS scoping for any DB access (app.current_org_id, never tenant_id/current_setting). (5) Any silent failure / edge case (empty ingredients, totalPct gate, margin thresholds).
Output: VERDICT: PASS | PASS-WITH-NITS | REWORK + numbered findings (severity, file:line, fix). Do NOT edit code.
PROMPT
    echo "$T review exit=$?" >> "$WT/$T/.codex-review-out.log" ) &
}
review T-065 "formulation pure compute cost/nutrition/allergen"
review T-073 "costing 9-step waterfall + scenario action"
wait
echo "=== codex reviews DONE ===" | tee /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/runs/.codex-review-chard-done
