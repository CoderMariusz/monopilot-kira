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

### Wave A1 batch-2 IN FLIGHT (launched 2026-06-03 ~23:50, bk07794g5)
T-080(088 risks+V18 trigger), T-083(089 compliance_docs), T-092(090 BOM SSOT). Reusable launcher
`_meta/runs/launch-batch.sh a2 "T-080:088 T-083:089 T-092:090"`. Clone DBs monopilot_a2_t_*. Done-marker
`.batch-a2-done`. ON COMPLETE: review → integration migrate → merge → then Wave B.

### Wave B PLAN (after batch-2 merged) — mix Codex(schema, ≤4) + Sonnet(seeds, ≤8)
- Codex (schema/api): T-015 (done-views), T-037 (fa_allergen_overrides), T-055 (GateChecklistTemplates),
  T-063 (formulations+versions+ingredients), T-077-task (ApprovalChainTemplates), T-101 (npd permission
  enum — AUTHORITATIVE; re-verify T-006 seed after), T-093 (BOM writer, needs T-092), T-007 (outbox fa.* emitter).
- Sonnet (T5 seeds): T-016 (DeptColumns Apex seed), T-032 (BriefFieldMapping seed), T-050 (AlertThresholds
  default seed), T-056 (G0-G4 GateChecklistTemplates seed — AFTER T-055, intra-wave edge → serialize).
- Migration numbers allocate from 091+ in dep order. T-056 after T-055; T-093 after T-092.

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

### Wave A COMPLETE (2026-06-04) — 16/16 schema tasks merged, canon DB @090
T-001,002,003,004,005,006,030,036,041,049,054,069,070,080,083,092. Integration migrate clean (88 applied).
**Deferred to MODULE-CLOSE:** (1) regenerate `packages/db/__expected__/schema.sql` drift snapshot (stale
since pre-npd — settings 063-074 + all npd objects missing; CI check:drift); (2) T-004 drop redundant
012 `mfg_ops_org_industry_suffix_unique`; (3) T-080 downgrade-guard vs T-009 reset_built interaction;
(4) add ALLOW-path tests for V18 (T-080).

### Wave B round-1 (2026-06-04)
- Codex B1 IN FLIGHT (b6mzeq9nw): T-101(091 npd perm enum), T-055(092 GateChecklistTemplates),
  T-063(093 formulations+versions+ingredients), T-037(094 fa_allergen_overrides). Clones monopilot_b1_t_*.
- Sonnet seeds DONE (in worktrees, awaiting merge): T-016(095 DeptColumns Apex seed, 6/6, 69 rows),
  T-050(096 AlertThresholds default seed, 9/9, matches T-049 threshold_key schema). Clones monopilot_b1seed_t_*.
- ON B1 COMPLETE: review B1 (+ light cross-check seeds) → merge ALL round-1 (091-096) → integration migrate → then
  round-2 Codex (T-015 views, T-077 ApprovalChainTemplates, T-093 BOM writer[needs T-092✓], T-007 outbox emitter,
  T-032 BriefFieldMapping table+seed) + Sonnet T-056 (G0-G4 seed, after T-055 merged). Allocate migs 097+.
- After T-101 merged: RE-VERIFY T-006 permission seed against T-101's final enum.

### Wave B COMPLETE (2026-06-04) — 12 tasks (round-1: 6, round-2: 5, +T-007 finishing)
Migs 092-101 + T-101 enum (no mig). Canon @101. T-007 (102 outbox fa.* emitter) running detached (b3,
poll `.batch-b3-done`, NOT harness-tracked — launched with & not run_in_background).

### Wave C PLAN (server actions + compute cores) — layered; Codex≤4 medium, Opus hard cores
HARD cores → Opus (impl-hard, kira-ui/direct), Codex reviews: T-038 allergen cascade engine,
T-042 exceljs D365 builder, T-065 formulation compute, T-073 costing 9-step waterfall, T-089 GDPR erasure.
Medium (Codex≤4/batch):
- C1 (deps done, no T-007): T-057(createProject/list/get), T-064(formulation lifecycle), T-081(risks CRUD),
  T-048(dashboard views), T-072(nutrition compute), T-028(V03/V04 validators), T-043(builder storage),
  T-084(compliance upload), T-085(compliance expiry cron), T-090(d365 import sync), T-097(factory release RM),
  T-014(schema-driven Zod runtime), T-010/T-011/T-012(cascade chains 1-3).
- C1-needs-T-007: T-008(createFa), T-009(updateFaCell+reset_built — MIND T-080 V18 downgrade-guard!),
  T-017(closeDeptSection), T-029(deleteFa).
- C2 (need C1): T-013(cascade4←T-011), T-018(←T-017), T-033(convertBriefToFa←T-008,T-031),
  T-039(setAllergenOverride←T-038), T-044(buildD365←many), T-045(bom_export←T-028), T-051(dashboard actions←T-048),
  T-058(advanceProjectGate←T-057,T-095), T-078(approval criteria←T-064,T-072,T-073), T-095(G3 FG←T-031,T-057,T-058),
  T-096(releaseToFactory), T-099(allergen bulk-rebuild←T-011/12/13), T-031(createBrief←T-007).
Mig numbers from 103+. Watch: T-009 reset_built vs T-080 V18 downgrade-guard interaction (deferred nit).

### Wave C progress (2026-06-04, canon @116) — 41/139 DONE
- C batch-1 merged: T-057(103 createProject+code-constraint-fix), T-064(104 formulation lifecycle+immutability), T-081(105 risks), T-048(106 dashboard views), T-065(107 RawMaterials+formulation compute @monopilot/domain), T-073(108 costing waterfall+scenario params). + reconciliation 109 (outbox CHECK union).
- C batch-2 merged: T-072(110 nutrition compute), T-028(111 validators), T-043(112 builder storage), T-031(createBrief REAL tests), T-038(114 allergen cascade ENGINE), T-089(115/116 GDPR erasure — satisfies foundation T-115).
- **RECURRING ISSUE: Codex writes MOCK-ONLY tests for T2-api server actions** (T-064, T-031 both caught). launch-batch.sh prompt now MANDATES real integration tests (copy recompute.integration.test.ts). Always Opus-review server actions for this.
- **Accumulated gaps / module-close TODO:**
  - regen `packages/db/__expected__/schema.sql` (stale wave-wide; CI check:drift) — file currently absent on kira/long-run branch; recreate from canon.
  - T-004 drop redundant 012 `mfg_ops_org_industry_suffix_unique`.
  - T-080 V18 downgrade-guard vs T-009 reset_built: when T-009 built, its reset MUST be allowed past the guard (audited path).
  - T-054 test `npd-projects-and-gates.test.ts` asserts old constraint name — T-057 renamed to `npd_projects_org_code_unique`; update the assertion.
  - NEW perm `npd.allergen.write` (T-038 action) needs enum+seed (mirror gdpr.erasure.execute pattern in 116).
  - Reconcile MON-domain-npd skill: allergen cascade is "derived" BUT now also materializes to product.allergens/may_contain + emits fa.allergens_changed (engine, T-038).
  - Pure NPD compute consolidated under @monopilot/domain (T-065/T-072); T-073 costing lives in apps/web/lib/costing — consider consolidating.
- **Remaining Wave C** (~20): T-008 createFa, T-009 updateFaCell+reset_built, T-010/011/012/013 cascade chains, T-014 schema-driven Zod, T-017 closeDeptSection, T-018 reopen, T-029 deleteFa, T-033 convertBriefToFa, T-039 setAllergenOverride, T-042 exceljs builder(Opus), T-044 buildD365, T-045 bom_export, T-047 wizard actions, T-051 dashboard actions, T-058 advanceGate, T-078 approval criteria, T-084 compliance upload, T-085 expiry cron, T-090 d365 import sync, T-095 G3 FG, T-096 release-to-factory, T-097 factory release RM, T-099 allergen bulk-rebuild, T-100 G4 closeout.
- **Then Wave D** (UI ~30, Opus impl-ui + prototype parity — heavy) + **Wave E** (wiring/E2E ~30) + consensus + Gate-5 + sign-off.
- Time note: at ~03:30 with 41/139, the full module will NOT complete by 5am — this is a multi-session long-run. State is fully checkpointed; resume from here.

### Module-close HIGH (added 2026-06-04): product_code global PK
T-001's `product` table uses `product_code` as a GLOBAL primary key (mig 075) — two orgs cannot share a
product code (multi-tenant defect, same class as the npd_projects.code bug fixed in T-057). HUMAN DECISION
needed: are product codes globally unique by design (SKU-like) or per-org? If per-org, migrate PK→(org_id,
product_code) + update all FKs (prod_detail, compliance_docs, factory_release_status, etc. reference
product(product_code)). Flagged by T-008 review. Do NOT silently change — affects many FKs.

## ============ RUN PAUSED 2026-06-04 ~04:10 (overnight long-run boundary) ============
**64/139 tasks merged to kira/long-run. Canon local DB @ mig 141. Clean state: 0 worktrees, 0 clone DBs, web+packages typecheck 0 errors, every integration migrate green.**

### Done by wave
- **Wave A (16/16 schema)** ✅ — product+fa view, prod_detail, reference (DeptColumns/ManufacturingOps/lookups/RolePermissions/D365Constants/AlertThresholds/Allergens), brief, npd_projects+gates, nutrition, costing, risks+V18, compliance_docs, BOM SSOT.
- **Wave B (12/12)** ✅ — perm enum(T-101), gate-templates, formulations, allergen-overrides(append-only), views(status-overall), approval-chains, BOM-writer, brief-mapping, seeds(DeptColumns/AlertThresholds/G0-G4), outbox emitter.
- **Wave C (~26 done, ~10 remain)** — DONE: createProject, formulation lifecycle+compute(@monopilot/domain), risks CRUD, dashboard views+actions, costing 9-step waterfall, nutrition compute, validators(V01-V08), builder storage, createBrief(real tests), convertBriefToFa, allergen cascade ENGINE(materialize+events), GDPR erasure(→foundation T-115), cascade chains 1-4(@monopilot/cascade-engine), createFa, deleteFa, closeDeptSection, reopenDept, approval-criteria, allergen-bulk-rebuild, compliance upload+expiry-cron, d365-import-sync, factory-release read-model, updateFaCell+reset_built(V18-reconciled), schema-driven-Zod-runtime. REMAINING: T-042 exceljs builder(OPUS; D365 mappings PRD-TBD), T-044 buildD365, T-047 wizard, T-058 advanceGate, T-095 G3-FG, T-096 release-to-factory, T-100 G4-closeout (gate+D365 coupled clusters — build sequentially), T-016/032/050/053/062/068/087/088/091/098 E2E specs.
- **Wave D (3 done, ~27 remain)** — DONE pilots: T-019 FA list, T-074 NutritionScreen, T-082 RiskRegisterScreen (kira-ui, prototype parity, real data, tsc0). REMAINING: ~27 UI screens/modals/wiring/parity (T-021-027, T-034-035, T-040, T-052, T-059-061, T-066-067, T-075-076, T-079, T-086, T-102-139 UI/WIRING/PARITY).
- **Wave E (0 done)** — E2E + wiring specs (T-053, T-062, T-068, T-087, T-088, T-091, T-098, etc.).
- **Deferred (cross-module):** T-071, T-076 (Sensory → 03-technical).

### Process learnings (durable)
1. Per-task clone DBs miss SIBLING collisions → run fresh-DB integration migrate of ALL wave migs BEFORE merge. (Caught AlertThresholds, npd_projects, multiple.)
2. Outbox event_type CHECK is a serialization point — each event-adding task recreates it from a blind clone → **6 reconciliation migrations** (109/121/126/130/135 + 141 cumulative). Pattern: after any event-adding batch, regen a union migration.
3. **Codex writes mock-only tests for T2-api server actions** (T-064, T-031) → vacuous green hides real bugs. Mandate real integration tests (recompute.integration.test.ts pattern); always Opus-review server actions.
4. **integration-migrate (DB) does NOT catch TS errors** — vitest/esbuild transpile without type-checking. ALWAYS run `pnpm --filter web exec tsc --noEmit` + touched-package tsc after merges. (Caught chain3/chain4/v07/v08/emit-bulk-changed.)
5. Parallel tasks scaffolding the SAME new package (cascade-engine, @monopilot/domain) conflict on package.json/index.ts — union index.ts + restore dropped deps.
6. cascade-engine "1 failed" in parallel = 40P01 deadlock flake on shared DB → run tests --no-file-parallelism.

### MODULE-CLOSE TODO (before sign-off)
1. Regenerate `packages/db/__expected__/schema.sql` drift snapshot (absent on branch; CI check:drift). 
2. T-004: drop redundant 012 `mfg_ops_org_industry_suffix_unique`.
3. **product_code GLOBAL-PK (T-001)** — multi-tenant defect (two orgs can't share a code). HUMAN DECISION: global SKU vs per-org? If per-org, migrate PK→(org_id,product_code)+all FKs. (T-057 already fixed the analogous npd_projects.code.)
4. T-054 test `npd-projects-and-gates.test.ts` constraint-name assertion drift (T-057 renamed to org_code_unique).
5. `npd.allergen.write` permission (T-038 action) needs enum+seed (mirror 116 gdpr.erasure.execute pattern).
6. Consolidate pure compute: @monopilot/domain (T-065 formulation, T-072 nutrition) vs apps/web/lib/costing (T-073) — unify.
7. Reconcile MON-domain-npd skill: allergen cascade is "derived" AND now materializes to product.allergens/may_contain + emits fa.allergens_changed.
8. UI tasks: live Playwright + axe deferred to Gate-5 (env had no browser); capture at module-level live verification.
9. PRD-TBD blocking T-042/044: D365 mappings QUANTITY/PROCESSTIME/LOADPERCENTAGE/PRODUCTGROUPID_PR.

### RESUME RECIPE
Local gate DB: rebuild via `psql .../postgres -c "drop database monopilot" -c "create database monopilot owner mariuszkrawczyk"` then `DATABASE_URL=postgres://mariuszkrawczyk@127.0.0.1:5432/monopilot DATABASE_URL_OWNER=same pnpm --filter @monopilot/db exec tsx scripts/migrate.ts`. Codex lane: `bash _meta/runs/launch-batch.sh <tag> "T-xxx:mig ..."`. UI lane: kira-ui subagent. Cross-review: kira-codex-review (Opus) for Codex work; `codex exec` review for Opus work. Migrations continue from 142. NOT YET DONE: consensus gate (step 4), Gate-5 live (Vercel+Supabase), sign-off report _meta/runs/01-npd-SIGNOFF.md, human STOP.

## RESUMED 2026-06-04 (toward sign-off; user decisions applied)
- **product_code per-org PK: DONE** (mig 142) — PK (org_id,product_code) + 14 composite FKs + Drizzle. Codex review PASS, no findings. Canon @142. (module-close item #3 RESOLVED.)
- Decisions: D365 T-042/044/047 = DEFERRED-AS-GAP (PRD-TBD mappings); allergen engine kept; autonomous-to-sign-off.
- Pre-existing reds to fix at module-close (clone-passed-but-full-canon-fails): npd-shared-bom-builder (text=uuid), npd-projects-and-gates (pg array parse @ line 211), shared-bom-ssot (comment assertion).
- NEXT: Wave C gate cluster SEQUENTIAL (T-095 G3-FG + T-058 advanceGate coupled → T-096 release → T-100 G4) + Wave D UI parallel (kira-ui).
