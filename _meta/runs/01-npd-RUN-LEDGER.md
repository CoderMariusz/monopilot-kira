# 01-npd — Run Ledger (live)

Run started: 2026-06-03 (run-module 01-npd)
Integration branch: `kira/long-run`
**Operating concurrency (user directive 2026-06-03, revised): max 4 Codex + 8 Sonnet/Opus in parallel** (was "12 any"). Codex is the token sink → cap at 4; Claude subagents (reviews, Sonnet-easy, Opus UI/hard) up to 8.

## PROCESS LESSON (Wave A1) — integration migrate BEFORE merge
Isolated per-task clone DBs (each = canon@075 + own migration) do NOT catch **sibling collisions**
within a wave. Wave A1 had two: T-005/T-049 both made `Reference.AlertThresholds`; T-030/T-054 both
made `public.npd_projects`. Caught only at canon merge. **New rule: after a wave's Codex impls finish,
run a fresh-DB full migrate of ALL wave migrations in order to surface collisions BEFORE merging.**
Also: union-merged `schema/index.ts` can carry duplicate exports → typecheck after merge.
Single local Postgres on :5432 → impl/worktrees parallelize, but **migrate+test gate is serialized** against the one DB (per `03-WORKTREE-PROTOCOL.md`).

## Environment readiness (verified 2026-06-03)
- Local Postgres :5432: was divergent (stuck at mig 012, 008 missing, 013 broke). **Rebuilt clean 2026-06-03** (DROP+CREATE monopilot DB; cluster roles survive) → full chain 001-074 applied = matches Supabase canon. `app_user` login pwd set to test value (`app-user-test-password`); `app.set_org_context(session_token uuid, org uuid)` present. This is the isolated **gate DB**; Supabase stays pristine until deploy/Gate-5.
- Owner conn for local migrate/test: `postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot` (DATABASE_URL + DATABASE_URL_OWNER). App-role tests auto-rewrite to `app_user`.
- Migrations are self-contained (zero `auth.*` Supabase deps) → clean local rebuild is reliable.
- Codex CLI: codex-cli 0.124.0 (`/opt/homebrew/bin/codex`) — impl-standard lane available.
- 00-foundation cross-module deps DONE: T-111/112/113/124/125 ✅ → unblocks T-089 (NPD erasure handler; 00-foundation/T-115 is the reciprocal external gap, satisfied by us building T-089).
- Highest repo migration = `074-reference-processes-code-schema.sql` (3-digit format). NPD tasks were decomposed against 4-digit `0010_*` → **renumber to 075+** (see `_meta/decisions/2026-06-03-npd-migration-renumber.md`).

## Known module-prep gaps (recorded, not blocking start)
- **No `MON-domain-npd` skill** — consensus gate (step 4) references "MON-domain-npd rules". Must author a minimal one before the consensus gate. (GAP-NPD-1)
- Stale BLOCKED tasks with partial code to reconcile during their wave: T-007, T-020, T-052, T-101, T-132, T-133, T-136, T-137.

## Ledger (task → migration# → worktree → writer → gate status → merged?)

| Task | mig# | worktree | writer | RED | GREEN | review | merged |
|---|---|---|---|---|---|---|---|
| T-001 | 075 | (removed) | Codex | ✅ | ✅ 4/4 | ✅ Opus REWORK→fixed | ✅ 5253a0f4 |

## Wave A0 — COMPLETE (2026-06-03)
T-001 root blocker merged. Local canon DB now at 075 (product+fa). All 130+ downstream T1 unblocked.

## Wave A1 — NEXT (fan-out, concurrency 12, each owns pre-allocated mig 076-089)
Tasks: T-002(076) T-003(077) T-004(078) T-005(079) T-006(080) T-030(081) T-036(082)
T-041(083) T-049(084) T-054(085) T-069(086) T-070(087) T-080(088) T-083(089). Plus T-092 (BOM SSOT, no mig).
**Deadlock-safe scaling note:** parallel Codex impl is safe (distinct mig files); the migrate+test
GATE must be serialized on the single local DB OR give each worktree its own DB
(`monopilot_<task>` cloned from canon) to parallelize gates without 40P01 deadlocks.

### Wave A1 RESULT (2026-06-03)
- **9 MERGED** to kira/long-run (Codex impl → Opus cross-review → integration-fix → canon migrate clean):
  T-002(076 prod_detail), T-004(078 mfg-ops), T-005(079 lookups), T-030(081 brief), T-036(082 allergens),
  T-041(083 d365-constants), T-049(084 alert-thresholds+import-cache), T-054(085 npd-projects+gates),
  T-070(087 costing). Canon DB at 087, full chain migrates clean (82 applied).
- **3 REWORK in flight** (batch bxrcc41sj): T-003(077) P0 canonical-table collision (extend existing
  009 Reference.DeptColumns, not a new table); T-006(080) P1 permission strings → npd.* namespace per
  T-101; T-069(086) P2 unique nulls-not-distinct. Fresh worktrees from HEAD + clones monopilot_rw_t_*.
- Review nits deferred to wave-close: regenerate `packages/db/__expected__/schema.sql` (stale wave-wide,
  CI check:drift); T-004 drop redundant 012 unique constraint; various add-negative-RLS-write tests.
- Held migration numbers now free until reworks land: 077, 080, 086.

### Wave A1 launch history (reference)
12 parallel Codex, each in own worktree `../kira-wt/T-*` + own clone DB `monopilot_t_NNN` (cloned from
canon@075). Launcher: `_meta/runs/launch-wave-a1-run.sh` (perl-alarm timeout 1800s; macOS has no `timeout`,
use full `/opt/homebrew/bin/codex` path + explicit PATH). Done-marker: `_meta/runs/.wave-a1-done`.
ON BATCH COMPLETE: per task → kira-codex-review (Opus) → rework if needed → SERIALIZE merges (resolve
`packages/db/schema/index.ts` export conflicts) → apply each mig to canon local `monopilot` in number
order → STATUS+ledger → drop clone DB + remove worktree. Then batch-2 (T-080→088, T-083→089, T-092) → Wave B.

### Skills (done during waves, per user)
- `MON-domain-npd` SKILL.md authored (was missing; needed for consensus gate). Now discoverable.

### NPD PRD ambiguities flagged (resolve before the relevant task) — from skill authoring
- **PRD DDL uses `tenant_id`/`REFERENCES tenants(id)` everywhere** — contradicts Wave0 `org_id` lock.
  OVERRIDE in force: implement as `org_id` + `app.current_org_id()` (Codex prompts carry this red-line).
- **Sensory build shape TBD** (§17.11.4 "Decision pending D4") — T-071/T-076 deferred to 03-technical.
- **D365 Builder (T-042) mappings TBD**: QUANTITY (recipe calc), PROCESSTIME/PROCESSQUANTITY (from Rate),
  LOADPERCENTAGE (from Resource_Requirement), PRODUCTGROUPID_PR constant — need a decision before T-042.
