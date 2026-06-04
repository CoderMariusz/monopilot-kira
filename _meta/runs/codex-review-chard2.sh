#!/usr/bin/env bash
set -uo pipefail
WT=/Users/mariuszkrawczyk/Projects/kira-wt; CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
rev() { local T="$1" db="$2" d="$3"
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 900 "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 -o "$WT/$T/.codex-review-last.md" - > "$WT/$T/.codex-review-out.log" 2>&1 <<PROMPT
Cross-provider (Codex) adversarial review of OPUS-written code for $T ($d). Writer=Opus; review uncommitted changes in this worktree. Re-run tests on the clone DB (export DATABASE_URL=postgres://mariuszkrawczyk@127.0.0.1:5432/$db DATABASE_URL_OWNER=same APP_USER_PASSWORD=app-user-test-password) and verify they are NON-VACUOUS (not mock-only). Check vs contract _meta/atomic-tasks/01-npd/tasks/$T.json + skill MON-domain-npd. Focus: correctness of the core logic, org_id/RLS scoping (app.current_org_id, never tenant_id/current_setting), regulatory/audit integrity (for GDPR: erase-vs-preserve correctness, idempotency, no data loss of audit), food-safety union correctness (for cascade), any silent failure. Output VERDICT: PASS|PASS-WITH-NITS|REWORK + numbered findings (sev, file:line, fix). Do NOT edit.
PROMPT
    echo "$T review exit=$?" >> "$WT/$T/.codex-review-out.log" ) &
}
rev T-038 monopilot_chard2_t_038 "allergen cascade engine + view"
rev T-089 monopilot_chard2_t_089 "NPD GDPR right-to-erasure"
wait
echo done | tee /Users/mariuszkrawczyk/Projects/monopilot-kira/_meta/runs/.codex-review-chard2-done
