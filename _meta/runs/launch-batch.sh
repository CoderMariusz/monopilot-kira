#!/usr/bin/env bash
# Reusable wave-batch launcher. Args: BATCH_TAG "T-xxx:mig T-yyy:mig ..."
# Each task -> fresh worktree from HEAD + clone DB monopilot_<tag>_<task> + generic schema prompt + Codex.
set -uo pipefail
REPO=/Users/mariuszkrawczyk/Projects/monopilot-kira
WT=/Users/mariuszkrawczyk/Projects/kira-wt
PG=postgres://mariuszkrawczyk@127.0.0.1:5432
CODEX=/opt/homebrew/bin/codex
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$REPO"
TAG="$1"; PAIRS="$2"
echo "=== batch $TAG setup $(date) ==="
psql "$PG/postgres" -c "select pg_terminate_backend(pid) from pg_stat_activity where datname='monopilot' and pid<>pg_backend_pid();" >/dev/null 2>&1
TASKS=""
for pair in $PAIRS; do
  T="${pair%%:*}"; m="${pair##*:}"; TASKS="$TASKS $T"
  db="monopilot_${TAG}_$(echo "$T" | tr 'A-Z-' 'a-z_')"
  json="$REPO/_meta/atomic-tasks/01-npd/tasks/$T.json"
  git worktree remove --force "$WT/$T" >/dev/null 2>&1; git branch -D "wt/$T" >/dev/null 2>&1; rm -rf "$WT/$T" 2>/dev/null
  git worktree add "$WT/$T" -b "wt/$T" >/dev/null 2>&1
  psql "$PG/postgres" -c "drop database if exists $db;" >/dev/null 2>&1
  psql "$PG/postgres" -c "create database $db template monopilot;" >/dev/null 2>&1 || { echo "CLONE FAIL $T"; continue; }
  cat > "$WT/$T/.codex-task.md" <<PROMPT
# Implement $T (01-npd) — Codex implementer, TDD. Work ONLY in $WT/$T

Read & faithfully implement the full atomic task contract: $json
(goal, files, acceptance_criteria, test_strategy, out_of_scope, risk_red_lines).

## CRITICAL OVERRIDES
- Migration filename: create as **$m-<kebab>.sql** (3-digit; the JSON's 4-digit name is STALE).
- Real Drizzle schema dir is **packages/db/schema/** (NOT src/schema — deleted by T-053). Export from packages/db/schema/index.ts (avoid duplicate export names — check the barrel first).
- Wave0 lock: business-scope column **org_id** (never tenant_id); RLS USING/WITH CHECK via **app.current_org_id()** + ENABLE + FORCE ROW LEVEL SECURITY; NEVER current_setting('app.tenant_id'|'app.current_org_id'). Grant app_user DML per a recent org-scoped migration's idiom (read one).
- Canonical ownership: do NOT create a table another task/module owns. The canon DB already has migrations 075-087 (product/fa, prod_detail, brief, npd_projects+gates, allergens, costing, nutrition, alert-thresholds, d365-constants, reference lookups, dept-columns, role-permissions). Before CREATE, check the table does not already exist in those.
- Money columns NUMERIC (never float). Triggers/validators: implement real logic per the contract.

## Your isolated DB (clone of canon @087)
export DATABASE_URL='$PG/$db'
export DATABASE_URL_OWNER='$PG/$db'
export APP_USER_PASSWORD='app-user-test-password'

## TDD (run for real)
1. RED: write the test(s) from test_strategy; run, SHOW failing.
2. GREEN: migration (+Drizzle schema +seed if required), then:
   pnpm --filter @monopilot/db exec tsx scripts/migrate.ts
   pnpm --filter @monopilot/db test <pattern>
   Reuse existing helpers for set_org_context/org bootstrap. RLS isolation test must be NON-VACUOUS (two orgs, prove cross-org rows invisible + cross-org WITH CHECK insert rejected).
   **MANDATE for any T2-api Server Action: tests MUST be REAL DB integration** — drive the action through the REAL withOrgContext (app_user + RLS) against YOUR clone DB and assert real rows via owner SELECT. COPY the pattern from apps/web/app/(npd)/pipeline/[projectId]/formulation/_actions/__tests__/recompute.integration.test.ts (const run = process.env.DATABASE_URL ? describe : describe.skip). vi.fn()/FakeClient mock-only server-action tests are a FAIL (they pass vacuously and hide real schema/CHECK/RLS bugs).
   If your action emits an outbox event, confirm the event_type is already in outbox_events_event_type_check (mig 109 union); if NOT, add it in a small migration AND tell the orchestrator to re-reconcile.
3. pnpm --filter @monopilot/db lint on touched files.

## Closeout: changed files, EXACT test command + REAL pass/fail output, AC-by-AC status, deviations, git status. Never claim GREEN without real passing output.
PROMPT
done
echo "=== launch $TAG: Codex ==="
pids=""
for T in $TASKS; do
  ( perl -e 'alarm shift @ARGV; exec @ARGV' 1800 \
      "$CODEX" exec -C "$WT/$T" --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 \
      -o "$WT/$T/.codex-last.md" - < "$WT/$T/.codex-task.md" > "$WT/$T/.codex-out.log" 2>&1
    echo "$T exit=$?" >> "$WT/$T/.codex-out.log" ) &
  pids="$pids $!"; echo "launched $T pid=$!"
done
wait $pids
echo "=== batch $TAG DONE $(date) ===" | tee "$REPO/_meta/runs/.batch-$TAG-done"
for T in $TASKS; do echo "$T: $(tail -1 "$WT/$T/.codex-out.log" 2>/dev/null)"; done
