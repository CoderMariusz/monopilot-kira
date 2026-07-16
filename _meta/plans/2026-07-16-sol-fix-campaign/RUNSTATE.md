# RUNSTATE — live campaign state (survives compaction)

## ✅ W1 DONE — DEPLOYED (commit 00e1bd4e, dpl rk8ta4pxh READY) + VERIFIED
11 findings (5 P0 + 6 P1). 4 Codex cross-review rounds (R1 impl→R2→R3→R4). mig 496-500 applied+logged on prod. tsc+build green, i18n added (parity), no regressions.
Live-prod proof: NPD-014 G0+recipe→G0+brief (mig500), routing b1edf8c3→draft (C041 containment), codeci indexes (C036), calibration receipt FKs (C115). Browser: C104 All-sites shows 2 NCRs. Full proof: waveW1/E2E-PROOF.md. LEDGER updated.
Deferred (documented, non-blocking): C115 distinct-session (owner UX); pl/ro/uk i18n EN-fallback needs translation.
⚠️ Owner flag: Composer agents applied some migrations directly to prod via .env.local creds (harmless — idempotent, not double-logged in schema_migrations).

## Method that worked (apply to all waves)
- Composer impl (≤2 findings/track, DISJOINT files, batches to avoid overlap) → Codex whole-wave review → Opus arbitrate → fix rounds until Codex CLEAN → gate (tsc + pnpm --filter web test + next build + PREPARE every new SQL on prod) → commit precise paths (NEVER git add -A) → push (main) → Vercel Ready (watch db:migrate in build log) → browser E2E + live-DB proof → LEDGER + E2E-PROOF.
- W2 _SHARED front-loads W1 Codex lessons (server-guard not UI, throw-for-rollback, no reward-hack tests, idempotent-mig+FK+Drizzle, i18n-to-catalogs, NUMERIC precision) to cut fix rounds.
- Runner: bash ~/.claude/scripts/cursor-exec.sh composer-2.5 <ws> <prompt> <out.raw> via run_in_background Bash (survives turns). Codex review: codex exec --full-auto --skip-git-repo-check -C <ws> "$(cat prompt)" > out 2> err via run_in_background.
- Migration numbering: next free = check `ls packages/db/migrations/ | tail`; W1 used through 500.

## Gate cmds
- tsc: pnpm --filter web exec tsc --noEmit -p tsconfig.json
- test: pnpm --filter web test (canonical). Pre-existing reds (~66) documented — verify vs base by stashing.
- build: pkill -9 -f 'next build'; rm -f apps/web/.next/build.lock; pnpm --filter web build
- PREPARE prod: DB=$(grep '^DATABASE_URL_OWNER=' apps/web/.env.local|head -1|cut -d= -f2-|tr -d '"'|sed 's/sslmode=no-verify/sslmode=require/'); export PGSSLMODE=require; psql "$DB" <<'SQL'\nbegin;\n\i file\nrollback;\nSQL
- creds E2E: admin@monopilot.test / Admin2026!!! (NEVER to disk); org …0002 Apex 22; prod https://monopilot-kira.vercel.app
- deploy check: vercel ls monopilot-kira ; build log: vercel inspect --logs <url> (bound with bg+sleep+kill, no `timeout` on macOS)
- commit trailers: Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com> + Claude-Session: https://claude.ai/code/session_01SRWRNorGKrXTsi1Nybd9nt

## 🔄 W2 IN-FLIGHT — NPD/Technical/costing (16 findings)
Batch A (harness-tracked, DISJOINT modules):
| Track | Findings | Task ID | Module |
|---|---|---|---|
| T2 | C030 live-nutrition-WIP + C032 lineage | b192jaumj | technical/nutrition + npd nutrition-compute + packages/domain |
| T3 | C026 project↔FG name + C027 delete-leaves-FG | bnawa9lwe | (npd)/pipeline/_actions |
| T6 | C042 routing precision/rate + C047 FG net content | b37oem6ip | technical/routings (cost only) + technical/items |
| T7 | C043 spec bundle gate + C046 BOM versioning | br15jpyjo | technical/factory-specs + technical/boms |
Batch A ✅ DONE: T2 (shared resolve-component-nutrition.ts live+persisted, C032 lineage label+i18n), T3 (project-fg-sync.ts canonical npd_projects.name, C027 archive FG+block+throw), T6 (C042 schema omitted costPerHour→NULL fixed, C047 exact-string NUMERIC net content), T7 (C043 validateBomApprovalGuards+UI success-only-complete, C046 BOM versioning).
Batch B1 in-flight (harness-tracked, disjoint):
| Track | Findings | Task ID | Module |
|---|---|---|---|
| T1 | C033/C034 WIP cost per-kg + double BAKE labor | bu0z5o6as | (npd)/pipeline/costing + maybe mig |
| T4 | C020 npd dup fields + C028 price precision | b0bwb8eho | settings/npd-fields + npd review |
| T8 | C044 WIP BOM from Technical + C045 WIP supplier block | bxugvhlfs | technical/boms + wip-definition-actions.ts (sourcing only) |
Batch B2 PENDING: T5 C035/C031 (WIP edit empty-v1 + Export label no-op) — wip-definition-actions.ts + wip UI → LAUNCH AFTER T8 (shared file).
wip-library/_actions has only 2 files (wip-definition-actions.ts + schemas) — T5/T8 serialize on it.
After all 8: Codex whole-wave review (waveW2/REVIEW-codex.md) → fix rounds until CLEAN → gate → deploy → E2E.

## W2 ALL 8 TRACKS DONE. Review + gate in-flight.
- Batch B: T1 ✅ (C033 batch-normalize mig501, C034 no double labor), T4 ✅ (C020 semantic uniqueness+i18n, C028 price), T8 ✅ (C044 intermediate BOM, C045 sourcing gate off for internal WIP), T5 ✅ (C035 resolveWipReadTarget+redirect active, C031 export label).
- ✅ i18n parity 604 pass (W2 agents added keys to all 4 locales — lesson worked). ✅ mig501 PREPARE-clean rc=0. 🔄 tsc (bid4l784n). 🔄 Codex review W2 (bkxl65ydz).
- Migrations W2: 501 (intermediate-cost-batch-normalize). Next free = 502.
- NEXT: Codex verdict → fix rounds if needed → gate (tsc+test+build) → commit precise paths → push → Vercel Ready → E2E (esp. C033 cost £1.446/kg, C030 nutrition parity, C042 non-zero routing cost).

## Waves remaining
W3 Scheduler/Planning (16) · W4 Procurement/Warehouse (16) · FABLE REGRESSION #1 · W5 Production exec (16) · W6 Quality/Shipping (16) · W7 Settings/users (16) · W8 Scanner/PWA (13) · FABLE REGRESSION #2 · FINAL full regression + HTML report. Ledger: LEDGER.md.

## W2 CODEX REVIEW #1 → BLOCKER. 5 CLOSED (C030/C031/C032/C034/C035). Round 2 in-flight.
Blockers: C027(P0 partial-commit), C033(P0 cost math yield+clamp+float), C043(orphan e-sign), C044(WIP BOM FK product_id), C045(sourcing gate absence-of-spec), C047(numeric 12,4 truncate), C028(clone/formulation price bypass). NEEDS-FIX: C020(dup cleanup+race), C026(update-item/import bypass), C042(cost_per_hour 6dp), C046(op validator server-side).
R2 Batch 1 (harness-tracked, disjoint):
| Track | Findings | Task ID |
|---|---|---|
| A | C027 delete-project throw-after-write+FOR UPDATE | b9ybw2gee |
| B | C033 exact-decimal yield math + mig501 unclamp + no-Number | b780szwt5 |
| C | C043 release-bundle throw-after-signEvent | bojq6p1wo |
| D | C044 item_id-authoritative BOM + C045 positive-source-of-truth + fix 3 red line-actions | bdq35paoo |
| F | C028 parseOptionalRetailPriceEur in clone+formulation | bnwud1ps8 |
R2 Batch 2 PENDING: E (C047 net_qty new-mig-6dp+Drizzle + C042 routing cost_per_hour precision), G (C020 dup-cleanup-mig+DB-unique + C026 update-item/import name guard), H (C046 server op validator — AFTER D, shares bom/shared.ts+line-actions.ts).
Opus hygiene PENDING: T2 42P01 regression (nutrition/_actions/compute.ts:84-139 ignores sourceAvailable=false → upserts zero nutrient rows + deletes allergens; must abort-before-write on 42P01); ro/uk translations for new duplicate_*/approvalRecorded keys (still English); fix 3 red line-actions.unit.test (D handles). Migration next free after 501 = 502.
After R2: 2nd Codex review → gate → deploy → E2E. NOTE evidence HTML/parity artifacts still in tree (pre-existing dirty, exclude from commit like W1).

## ⚠️ R2 batch 1 KILLED (external, 5 simultaneous) → RELAUNCHED. Left tree with 9 tsc errors (R2-B mid-refactor of wip-cost types number→string broke callers get-component-processes/map-definition-process-chain/costing compute.ts). No accompanying user redirect → treated as system/session event, relaunched to complete (converge partial→done+fix tsc).
Relaunched task IDs: B(C033)=b8l4kvi3o, A(C027)=b3gpyu18i, C(C043)=b5his8ygs, D(C044+C045)=bs77vdum8, F(C028)=b58xqaqvk. WATCH for re-kill → if killed again = systemic limit, run fewer concurrent.

## DIAGNOSIS: R2 kills = background-task CONCURRENCY limit (NOT Cursor, NOT memory)
- composer-2.5 foreground: WORKS (rc=0 test). Single background task: SURVIVES (trivial sleep + W2 Codex review both fine). 5 concurrent cursor-agent bg tasks: KILLED ×2 immediately. Memory 64% free, 0 lingering procs, load 8.6.
- Conclusion: harness caps concurrent background tasks. Run impl ONE-AT-A-TIME via background.
- OWNER DIRECTIVE (2026-07-16): if Cursor unreliable → Codex (gpt-5.6-sol) does IMPL, Opus does REVIEW (role reversal). Execute R2 fixes via `codex exec --full-auto` ONE background task at a time.
- R2-B (C033) launched via Codex: becyvver5 (also fixes the 9 tsc errors from prior cursor mid-refactor). Then A, C, D, F sequentially. Tree currently tsc-broken (9 err) until B lands.
- Pending R2: A(C027) C(C043) D(C044+C045) F(C028) + batch2 E(C047+C042) G(C020+C026) H(C046). All via Codex 1-at-a-time. Prompts in waveW2/R2/*.md.

## TEST config 3 Cursor + 2 Codex (owner directive 2026-07-16): does mixed 5 survive?
- Codex: B(C033)=becyvver5, F(C028)=bq3w1jcg0. Cursor: A(C027)=bz1jtxbl4, C(C043)=b8qkvthy9, D(C044+C045)=b8r6xfs3t.
- If survives → use 3cursor+2codex/wave, then 1 Codex reviews the 3 cursor outputs, all → Opus final review.
- If cursors killed again → cursor-bg is the limiter, go codex-heavy sequential.

## ✅ CONFIG CONFIRMED: 3 Cursor + 2 Codex concurrent SURVIVES (owner's config works)
- C(C043) completed clean; A/D(cursor)+B/F(codex) all alive (cursor 20 procs, codex procs many) — none killed.
- Root cause of earlier kills: 5× cursor-agent concurrent (~10 procs each → ~50 procs) tripped a process/resource limit. Mixed 3cursor+2codex stays under.
- GOING-FORWARD CONFIG per wave: ≤3 Cursor + ≤2 Codex concurrent for impl → then 1 Codex reviews the Cursor outputs → all → Opus final review → gate → deploy → E2E.
- C043 fix: BundleApprovalRollbackError re-throw after signEvent → withOrgContext rolls back orphan e_sign_log. Good.

## R2 progress (3cursor+2codex config working)
- DONE: A(C027 throw-after-write) C(C043 rollback-signEvent) D(C044/C045 item_id BOM) B(C033 exact-decimal yield+mig501 unclamp — tsc back to 0).
- Running: F(C028 codex bq3w1jcg0). Batch 2: E(C047+C042 cursor b7miimn03), G(C020+C026 cursor bjg5uatnj), H(C046 cursor b8o9hpmx0).
- Migrations: 501(C033). E→502/503, G→504 (verify no collision at gate). H no mig.
- After all 10 land → Codex whole-R2 review + Opus review → gate (tsc+test+build+PREPARE new migs) → commit → deploy → E2E.

## R2 ALL 10 DONE. tsc CLEAN (fixed E's off-by-one ../ import in item-overview-tab.tsx). i18n parity 604. mig 501-504 all PREPARE-clean rc=0.
- E ✅ (mig502 net_qty numeric(18,6) + mig503 routing precision), G ✅ (mig504 semantic-unique + update-item/import name guard), H ✅ (V-TEC-63 op validator).
- Codex R2 review launched: br7yjjzzj (prompt REVIEW2-codex.md). After verdict → fix rounds if needed → gate (test+build) → commit → deploy → E2E.
- Migrations to deploy W2: 501,502,503,504. All PREPARE-clean.

## KEY: background bash "killed" ≠ child dead. Harness kills tracked bash wrapper, but detached codex/cursor CHILD survives + completes. → POLL output files, don't rely on completion notification, don't relaunch blindly.
- Codex R2 review bash br7yjjzzj "killed" but 23 codex procs ALIVE (err fresh). Poll waveW2/R2/out/REVIEW2-codex.md for completion.

## R2 TEST TRIAGE: 97 fail/3881 pass. ~34 pre-existing (production/quality/shipping/warehouse — not W2). R2 regressions:
- 3 DB pg.test loud-fail no DATABASE_URL (delete-project, npd-field-uniqueness, update-item-linked-fg) = EXPECTED.
- 2 pre-existing (transition-item-status, wip-definition-actions — red since W1).
- REAL regressions: bundle-data.unit.test (5 subtests — mock missing new `select item_id,component_code from bom_lines where bom_header_id` query added by C043/C046) + createWorkOrder(.chain/.npd-bom-product-id) (D's bom_headers.product_id→NULL ripple + revalidate-in-test env artifact).
- REGFIX track (cursor beja6nv89): fix bundle-data mock + createWorkOrder product_id-NULL handling + safeRevalidate wrapper.
## Codex review: full R2 review (br7yjjzzj) DIED (bash killed → output-pipe fds closed → output LOST even though codex child ran). Likely harness TIME-LIMIT on long background bash (~15-20min). Mitigation: SHORT focused reviews. Launched REVIEW2b (b5iib9sum): only C027/C033/C043 (3 P0, fast). Poll REVIEW2b-codex.md.
## Config learnings: ≤3 cursor concurrent OK; single codex OK for SHORT tasks; LONG codex (30-40min review) → bash killed by time-limit, output lost → keep reviews SHORT/focused or poll+accept partial.

## OPUS SELF-REVIEW R2 (Codex reviews kept dying → Opus is final reviewer anyway):
- C027 CLOSED: HasDependentsError thrown inside withOrgContext + FOR UPDATE lock + NOT_FOUND return only when no archive (throw precedes) + map outside catch. ✅
- C043 CLOSED: BundleApprovalRollbackError thrown after signEvent, re-thrown out of withOrgContext (rollback). ✅
- C044 CLOSED: headerProductId = intermediate ? null : input.productId (FG flow via product_id preserved, intermediate via item_id). ✅
- C033 CLOSED (B: 0.7500 yield math, mig501 unclamp, 71 tests). All match original Codex MUST-FIX.
## Remaining test debt: materialize-npd-bom.test.ts mock (C045 classifier query ripple) → REGFIX2 (cursor bha1x9roz) fixing per-scenario returns. Then full suite → back to ~baseline (pre-existing + DB-loud-fails only). Then gate build → deploy → E2E.

## W2 DEPLOYED: commit a24fd65b pushed (00e1bd4e..a24fd65b). Vercel building 4dyybpc9v (auto-migrate 501-504). 111 files staged (no evidence). Backup: npd_field_catalog-pre504.csv (2617 rows). 
- Test state at deploy: 60 fail/3918 pass — all pre-existing OR DB-loud-fail (no R2 regressions). tsc+build green. i18n parity 604.
- NEXT: confirm Vercel Ready + migrations applied in build log → browser E2E per finding on prod (C033 cost, C030 nutrition, C042 routing cost, C027 delete-project, C047 precision) → LEDGER + W2 E2E-PROOF → then W3.

## ✅ W2 CLOSED (a24fd65b, dpl 4dyybpc9v READY). Migrations 501-504 applied+logged. Proof waveW2/E2E-PROOF.md. LEDGER updated. 2/8 waves done, 27 findings live.
## 🔄 W3 IN-FLIGHT — Scheduler/Planning (16 findings). Config: 3 Cursor + 2 Codex.
Batch 1 (harness-tracked):
| Track | Findings | Task ID | Engine |
|---|---|---|---|
| MRP | C059 reorder-lot + C060 TO 6dp | brmkafi7f | cursor |
| WO | C063 WO edit UoM + C064 dep-badge reversed | bhcc32ov8 | cursor |
| PILOT | C037 pilot-WO error + C038 pilot-WO invisible-in-Planning | bb53ntfjf | cursor |
| SCHED-A | C068 capacity-alt-drafts + C070 changeover-unknown-reverse | by8ylmi6p | codex |
| SCHED-B | C067 solver-occupancy + C069 finite-cap/PM | b9i795cgu | codex |
Batch 2 PENDING: planning/schedule C071(reschedule Draft/InProgress)+C072(board vs detail ±1h TZ)+C074(All-sites empty lines); scheduler capacity-view C073(ignores site filter); scheduler assignment/shift C075(override unreachable)+C076(shift stale UUID).
Scheduler files: sequence-solver.ts(C067/C069-B), pm-windows.ts(C069-B), capacity-loaders.ts(C068-A/C073), changeover-matrix-lookup.ts(C070-A), scheduler-actions.ts. planning/schedule: schedule-board.ts, wo-cycle.ts, board.ts, capacity-block-actions.ts.
After all 16: Codex whole-wave review (or Opus if Codex-review dies) → fix rounds → gate → deploy → E2E. Next mig # = 505.
## Waves remaining after W3: W4 Procurement/Warehouse (16) · FABLE#1 · W5 Production (16) · W6 Quality/Shipping (16) · W7 Settings (16) · W8 Scanner (13) · FABLE#2 · FINAL report.

## W3 progress: MRP✅(C059 lot-multiple+mig505 C060 TO-scale) WO✅(C063 UoM C064 badge) PILOT✅(C037 errors+i18n C038). Running: SCHED-A(by8ylmi6p codex C068/C070), SCHED-B(b9i795cgu codex C067/C069), BOARD(bk480vwcm cursor C071/C072), ASSIGN(b38pcmogs cursor C075/C076). PENDING: SITE(C073/C074) — launch AFTER SCHED-A (shares capacity-loaders.ts).
## W3 migrations: 505(TO qty scale). Next # = 506.

## W3 ALL 16 DONE + gate. SCHED-A✅(C068/C070 42t) SCHED-B✅(C067/C069 31t) BOARD✅(C071/C072) ASSIGN✅(C075/C076) SITE✅(C073/C074) + MRP/WO/PILOT.
- Opus fixed tsc ripple: create-work-order-chain.ts:481 missing WOHeader qtyEntered/qtyEnteredUom/uomSnapshot (from C063) → added base-qty defaults. tsc=0.
- C069 "residual" (scheduler-actions PM no-config) = NON-ISSUE (intended no-config-skips-PM contract; my !==false fix broke 2 tests → reverted). C069 CLOSED as SCHED-B built it.
- ✅ tsc 0, full suite 60 fail/3934 pass (= W2-close baseline, ZERO W3 regressions; only W1-C058 DB-loud-fail in W3-area), mig505 PREPARE-clean, i18n parity 604.
- Running: Codex W3 review (bxurh2uf7 bonus, may die), build gate (b5iqv6bzy).
- NEXT: build green + review verdict/death → commit precise paths → push → Vercel Ready (mig505) → E2E → LEDGER + W3-PROOF → W4. Mig # next = 506.

## W3 DEPLOYED: commit 6870fabf pushed (a24fd65b..6870fabf). Vercel building (auto-migrate 505). 54 files, no evidence. Codex W3 review died (bash time-limit) → deployed on Opus verification (tsc+build+suite-no-regression+track-tests). 3/8 waves.
- NEXT: Vercel Ready + mig505 applied in log → E2E (C067 solver occupancy, C059 MRP lot, C073 site-filter, C072 timezone) → LEDGER + W3 E2E-PROOF → W4 Procurement/Warehouse.

## ✅ W3 CLOSED (6870fabf, dpl 81ucnh1v9 READY). mig505 applied. Proof waveW3/E2E-PROOF.md. LEDGER updated. 3/8 waves, 43 findings live.
## 🔄 W4 IN-FLIGHT — Procurement/Warehouse (16). Config 3 Cursor + 2 Codex.
Batch 1:
| Track | Findings | Task ID | Engine |
|---|---|---|---|
| GRN-1 | C052 completed-GRN-mutable + C053 outstanding/short multi-receipt | bd2uup9i1 | cursor |
| PO-1 | C050 inactive-supplier PO-transition + C098 PO 6dp | byrgr4ek7 | cursor |
| WH-LP | C099 print-LP-label-500 + C100 cycle-count-0-lines | b7133wq52 | cursor |
| MISC | C061 MRP provenance + C065 WO-detail BOM-version | bbm9sjmqv | codex |
| UNITS | C018 unit-zero-factor-RSC + C019 operation-create-failed | b9n5sx803 | codex |
Batch 2 PENDING: GRN-2(C054 GRN-items=0 + C055 expiry-in-GRN — after GRN-1, shares grns), PO-2(C056 PO-tax-model + C057 PO↔GRN-nav — after PO-1, shares PO), WH-2(C101 same-loc-move + C102 terminal-LP-block — after WH-LP, shares warehouse).
After all 16: review (Codex-may-die → Opus) → gate → deploy → E2E → then FABLE REGRESSION #1 (after W4). Mig # next = 506.

## W4 progress: PO-1✅(C050 supplier-guard+mig506 C098) GRN-1✅(C052 status-guard C053 grn-line-aggregates) WH-LP✅(C099 GS1-error→failed C100). Running: MISC(bbm9sjmqv codex C061/C065), UNITS(b9n5sx803 codex C018/C019), GRN-2(DETACHED cursor C054/C055 — monitor GRN-2.raw, relaunch if empty), WH-2(bje60x76a cursor C101/C102), PO-2(br6frl9v0 cursor C056/C057).
## W4 migrations: 506(PO qty scale). PO-2 may add 507(PO tax_pct). Next # = 507+.

## ⚠️ CONCURRENCY LESSON: keep TOTAL concurrent (incl detached) ≤5, ideally ≤3 cursor + ≤2 codex. Overshot at W4 batch2 (GRN-2 detached + WH-2 + PO-2 + MISC + UNITS = 6) → killed MISC/UNITS(codex)+PO-2(cursor). NEVER use `& disown` — always run_in_background.
## W4 recovery: WH-2✅. MISC+UNITS relaunched (b5tahu7gb, bm6zr7u71 codex). GRN-2(detached C054/C055) + PO-2(killed, child maybe alive, C056/C057) — MONITOR GRN-2.raw/PO-2.raw; relaunch via run_in_background if 0 after codex done. Done so far: PO-1/GRN-1/WH-LP/WH-2 (8 findings). Pending verify: GRN-2, PO-2, MISC, UNITS (8 findings).

## W4 recovery v2: codex-background now UNRELIABLE (MISC/UNITS codex killed 2×, even at 4 concurrent). Cursor is reliable. → MISC/UNITS relaunched as CURSOR (b5a7nr7fz→MISC.raw, bnomf34n4→UNITS.raw). GRN-2+PO-2 cursor children still alive+editing (PO-2 +102 lines). 4 cursor total. If MISC/UNITS survive → all 16 W4 dispatched.
## REVISED ENGINE POLICY: prefer CURSOR for impl (reliable). Codex only if needed + short. Keep ≤4-5 cursor concurrent.

## W4 assembly: UNITS✅(edits+182) MISC✅(C061/C065) done. GRN-2 edits present (+59, tsc-clean → likely complete, .raw empty from detached-death). PO-2 INCOMPLETE (died mid-way, taxPct not fully wired → 7 tsc errors across manufacturing-ops/mrp/import-po/actions/lp/chain).
- Opus fixed chain-mapper C065 WOHeader fields (activeBom*/activeFactorySpec* null).
- W4-FIX cursor (bn67vs27f) dispatched: fix remaining 6 tsc errors + complete PO-2 tax wiring + verify GRN-2. Target tsc=0.
- W4 migrations: 506(PO qty), 507(PO tax_pct). Next # = 508.
- After tsc green → gate build → PREPARE 506/507 → deploy → E2E → FABLE#1.

## W4 GATE GREEN (pre-build): tsc 0, full suite 60 fail/3957 pass = baseline (ZERO W4 regressions), mig506/507 PREPARE-clean. All 16 findings done.
- W4-FIX completed PO-2 tax wiring + fixed 6 tsc ripples. Opus fixed: chain WOHeader C065 fields, mrp.test/actions.test taxPct assertions (2 test files).
- Build (bcg6em6nv) running incl i18n parity. On green → commit precise paths → push → Vercel Ready (mig506/507) → E2E → LEDGER + W4-PROOF → FABLE REGRESSION #1 (after W4).
- W4 tracks all done: PO-1(C050/C098) GRN-1(C052/C053) WH-LP(C099/C100) WH-2(C101/C102) UNITS(C018/C019) MISC(C061/C065) GRN-2(C054/C055) PO-2(C056/C057).

## W4 DEPLOYED: commit 0ea80488 pushed (6870fabf..0ea80488). Vercel building (auto-migrate 506/507). 75 files, no evidence. 4/8 waves. NEXT: Vercel Ready + mig506/507 in log → E2E → LEDGER + W4-PROOF → FABLE REGRESSION #1 (Fable checker over W1-W4 areas + spot prior fixes).

## ✅ W4 CLOSED (0ea80488, dpl egwyfvl54 READY). mig506/507 applied+verified (qty 18,6, tax_pct 7,4). Proof waveW4/E2E-PROOF.md. LEDGER updated. 4/8 waves, 59 findings live.
## 🔵 FABLE REGRESSION #1 (post-W4): cross-wave prod check CLEAN (all W1-W3 fixes still live: NPD-014 G0+brief, routing draft, codeci, calib-FK, net_qty 6, TO qty 6; 12/12 migs logged). Suite stable 60 across 4 waves. Fable code-review agent running (abaa1f2be18bcd5b3, cross-cutting: WOHeader/withOrgContext-rollback/site-scoping/precision). Incorporate its findings when done.
## 🔄 W5 STARTING — Production exec/consume/output (16). Config: Cursor-primary (codex-bg unreliable), ≤4-5 concurrent, NEVER & disown.
W5 findings: C077 released-WIP-WO-snapshot, C078 root-WO-error, C079 downtime-UUID, C080 actual-complete, C081 FEFO-silent, C082 FEFO-deviation-esign, C083 over-consume-approval, C084 catch-weight-metadata, C086 low-yield-reason-log, C091 correction-QA-no-LP, C087 completed-WO-finance, C089 dashboard-today, C088 analytics-vs-reporting-KPI, C090 dashboard-rounding, C092 output-modal-stale, C093 dependency-tab-ID.
Modules: production (start/consume/output/downtime), finance, reporting, dashboard, analytics.

## W5 Batch 1 (5 cursor):
| Track | Findings | Task ID |
|---|---|---|
| CONSUME | C081 FEFO-silent + C082 FEFO-deviation-esign | b0nkmypsa |
| OUTPUT | C086 low-yield-reason-log + C092 output-modal-stale | bj5bz4qeg |
| START | C077 released-WIP-WO-snapshot + C078 root-WO-error | be70ulkeh |
| DOWNTIME | C079 downtime-UUID + C080 actual-complete | ble6i8tn7 |
| FIN | C087 completed-WO-finance + C089 dashboard-today | b5uz9ybik |
Batch 2 PENDING: CONSUME2(C083 over-consume + C084 catch-weight — C083 shares consume-material-actions with CONSUME → after; C084 output-qa shares with OUTPUT → after), OUTPUT2(C091 correction-QA corrections-actions.ts + C093 dependency-tab get-work-order-detail.ts), ANALYTICS(C088 analytics-data.ts + C090 dashboard-rounding dashboard-data.ts — C090 shares dashboard with FIN's C089 → after FIN).
Prod files: consume-material-actions.ts, output-qa-actions.ts, corrections-actions.ts, start/route.ts, downtime-data.ts, dashboard-data.ts, analytics-data.ts, get-work-order-detail.ts.
After all 16: gate → deploy → E2E. Fable regression #1 agent (abaa1f2be18bcd5b3) running — incorporate findings.

## W5 progress: FIN✅(C087 wo_events lateral join, C089 dashboard-today) OUTPUT✅(C086/C092) DOWNTIME✅(C079/C080) START✅(C077/C078). Running: CONSUME(b0nkmypsa C081/C082), OUTPUT2(b7r8gw9xo C091/C093), ANALYTICS(bycyamdld C088/C090). PENDING: CONSUME2(C083 over-consume + C084 catch-weight) — launch AFTER CONSUME (shares consume-material-actions.ts). After all 16 → gate → deploy → E2E.

## ✅ FABLE REGRESSION #1 = PASS. Fable independent cross-wave sweep (44 tool-uses): NO substantive regression. WOHeader/withOrgContext-rollback/site-null-semantics/migration-chain-496-507/Drizzle all clean. Cleared C044-vs-MRP, C058-vs-C060, C059-vs-C061 interactions.
## 2 LOW-SEV FOLLOW-UPS (documented, non-blocking, not user-facing today):
1. update-work-order.ts:336-342 RETURNING omits W3/W4 cols (qty_entered/uom_snapshot/active_bom_*/active_factory_spec_*) → returned WOHeader nulls them (harmless: edit modal router.refresh re-fetches; future-consumer risk).
2. create-work-order-chain.ts chain-summary stubs qtyEntered=base (display-only; C063 re-enters if used to prefill edit).
Optional hygiene fix #1 later (add cols to RETURNING). Not blocking any wave.

## W5 ALL 16 DONE. tsc 0 (Opus removed duplicate local `num` in analytics-data.ts — conflicted w/ imported num + null-safety). i18n parity 604. No new W5 migrations.
- CONSUME(C081/C082 FEFO+esign) OUTPUT(C086/C092) START(C077/C078) DOWNTIME(C079/C080) FIN(C087 wo_events-lateral C089) CONSUME2(C083 over-consume-override C084 catch-weight) OUTPUT2(C091 void-QA C093 dep) ANALYTICS(C088 unified-yield-source C090 rounding).
- Full suite + build running (bufrolcfa). On green → commit precise paths → push → deploy → E2E → LEDGER + W5-PROOF. 5/8 waves. Next mig # = 508 (if needed).

## W5 DEPLOYED: commit 42c7da23 pushed (0ea80488..42c7da23). No new migrations. Build green (Opus fixed dashboard 'use server' export → moved formatter to _lib/dashboard-format.ts; removed duplicate num). Zero regressions (suite 55<60; 3 in-module fails pre-existing verified vs W4-close). 5/8 waves. NEXT: Vercel Ready → E2E (light, logic wave) → LEDGER + W5-PROOF → W6 Quality/Shipping (16).

## ✅ W5 CLOSED (42c7da23, dpl 30aoxmcu2 READY, no migs). Proof waveW5/E2E-PROOF.md. LEDGER updated. 5/8 waves, 75 findings live.
## 🔄 W6 IN-FLIGHT — Quality/Shipping (16). Config Cursor-primary, ≤5 concurrent, NEVER & disown (slipped again — killed+relaunched via run_in_background).
Batch 1 (5 cursor):
| Track | Findings | Task ID |
|---|---|---|
| QUAL1 | C105 hold/NCR-timeline + C107 investigation-refresh | bcb9xo3o1 |
| QUAL2 | C106 HACCP/Recall RSC-#418 (t-to-client) | b4nmpi29e |
| SHIP1 | C108 packed→shipped-post-BOL + C109 signed-BOL-rehydrate | bsylafspb |
| RSC | C040 scheduler-#418 + C062 production-#418 | btue0pukg |
| MAINT | C119 calibration-stale + C120 MWO-edit | bajhahg85 |
Batch 2 PENDING: SHIP-2(C110 allergen-CRUD + C111 short-pick/reassign/partial-pack — after SHIP1, shares shipping), SHIP-3(C112 RMA + C113 customer-contacts), SHIP-4(C114 SO-trailing-zeros + C066 WO-Release), + C085 LP-#418 (license-plates/[lpId]).
W6-lesson: React #418 = t-passed-to-Client-Component → use useTranslations in client or pass strings (Wave F pattern).
After all 16: gate → deploy → E2E. Then W7, W8, FABLE#2, FINAL report+HTML.

## W6 ALL 16 impl. tracks: QUAL1(C105/C107) QUAL2(C106 RSC-strings) SHIP1(C108/C109) SHIP2(C110/C111) SHIP3(C112 RMA-mig508 + C113 contacts) SHIP4(C114 so-line-numeric + C066 WO-Release) RSC(C040/C062 hydration-not-t) MAINT(C119/C120) LP(C085 hydration).
- mig508 (RMA rma_requests+rma_lines) PREPARE-clean. i18n parity 604.
- tsc=26 (RMA import/type 9, customers-modals 8, LP 7, MWO 1) → W6-FIX cursor (bxeyuk1m6) fixing all + build 'use server' check. Then full suite + build → commit → deploy → E2E → W7. Next mig#=509.

## W6 DEPLOYED: commit 6707163d pushed (42c7da23..6707163d). 109 files (RMA feature). Vercel building (auto-migrate 508). W6-FIX resolved 26 tsc ripples → tsc 0, build green, mig508 PREPARE-clean, i18n parity 604. Zero new regressions (suite 58; 4 in-module pre-existing). 6/8 waves.
- FOLLOW-UP (accumulating): English-only i18n keys need pl/ro/uk translation (format.test en/pl key-count drift). Non-blocking.
- NEXT: Vercel Ready + mig508 in log → E2E → LEDGER + W6-PROOF → W7 Settings/users (16). Then W8, FABLE#2, FINAL report.

## ✅ W6 CLOSED (6707163d, dpl 28v2dbtmk). mig508 RMA applied+verified (rma_requests/rma_lines live). Proof waveW6/E2E-PROOF.md. LEDGER updated. 6/8 waves, 91 findings live.
## 🔄 W7 IN-FLIGHT — Settings/users (16). Cursor-primary, ≤5 concurrent, run_in_background (NOT disown).
Batch 1 (5 cursor):
| Track | Findings | Task ID |
|---|---|---|
| SEC1 | C001 re-invite-overwrite + C002 PIN-change-hangs | behn8880u |
| SEC2 | C003 security-save-persist + C004 Viewer-PII-leak(security) | bqmw18grp |
| D365 | C021 cost-import(export-only) + C022 mapping-directions | bi0pxypcp |
| EMAIL | C023 placeholder-rejected + C024 yield-range-help | bseo867ds |
| INFRA | C012 warehouse-reactivate + C015 printer/dock-delete | bkw64tmg7 |
Batch 2 PENDING: SEC-3(C005 MFA + C007 auth-policy-screen-unreachable), SEC-4(C006 audit-wrong-resource + C008 false-S22-msg), SITE(C013 site-fields-create-time + C014 map-pins-overlap — settings/infra/sites). W7 agents locate files (security paths unclear from grep).
After all 16: gate → deploy → E2E. Then W8, FABLE#2, FINAL HTML report.

## ⚠️ W7 batch-1 (5 cursor) ALL rc=137 SIGKILL @0 bytes — 5-cursor kill threshold confirmed AGAIN. Reverted D365 partials (clean). Fable OUT-OF-CREDITS (regression #2 → will use Opus independent sweep instead).
## 🔄 W7 RELAUNCH 3-at-a-time. Batch A: SEC1=bpm7pk3dn SEC2=b47h4v4uu D365=b8wboy5of. Batch B (EMAIL/INFRA)=after A done. Batch 2 (SEC-3/SEC-4/SITE) after. Keep ≤3 cursor concurrent.
## W7 batch A results: SEC1✅(C001/C002 23t) D365✅(C021/C022 25t). SEC2/EMAIL running + INFRA=b1iyx8i8d launched (3 concurrent). Reverted regenerable e2e/artifacts+parity-evidence. Diff = code+i18n(4-locale) only. Next: batch 2 SEC-3(C005/C007) SEC-4(C006/C008) SITE(C013/C014).
## W7 done-so-far: SEC1✅ SEC2✅(mig509) D365✅ EMAIL✅ SEC4✅. Running: INFRA, SEC3, +SITE launched (3). 
## ⚠️ GATE-CHECK overlaps: invite.ts touched by SEC1(C001)+SEC4(C006 resource_type) — verify BOTH present. reset-user-mfa.ts SEC4(C006)+SEC3(C005 MFA, concurrent) — verify resource_type='users' survived. assign-role/deactivate/reactivate/assign-user-sites/create-user-with-password = SEC4 resource_type.
## mig509 (SEC2 tenant_idp policy writer) — PREPARE before deploy.
## W7 ALL 8 tracks done (16 findings): SEC1/SEC2/D365/EMAIL/SEC4/INFRA/SEC3/SITE. resource_type='users' verified in all overlap writers. mig509 PREPARE PASS.
## GATE: tsc had 15 type-ripples (2×DocksLabels desync, printer sig, mfa props, sites union, yard has_dependents) → W7-FIX=bftm2dv2q dispatched. Await tsc=0 → test+build → commit → deploy.
## W7 GATE: tsc=0 (W7-FIX unified DocksLabels→yard-types). Regression diff vs W6 baseline: W7=68 fails < baseline=73 → 0 regressions, +5 fixed. 
## Found+fixed 1 real regression: invite.ts seat-limit source-order guard (SEC1 extracted mintInviteLink/writeInviteAuditAndOutbox helpers ABOVE inviteUser → relocated BELOW; hoisted, zero logic change). Cross-review value: caught.
## Build running (bfv3v8hm7). Then commit (per-file, NO -A) + push + deploy. mig509 PREPARE PASS. i18n parity gap = pre-existing baseline (documented).
## ✅ W7 COMMITTED 03fa2ff9 + PUSHED (6707163d..03fa2ff9). Build blocker fixed: totp.ts module-load throw removed (SEC3 profile MFA import broke next build; MFA_MASTER_KEY intentionally unset in prod → point-of-use guard suffices). 93 files staged scoped (no -A, no stray). Vercel auto-deploy+mig509 in flight. 7/8 waves. Next: verify deploy Ready + mig509 live → browser-E2E W7 → W8 → FABLE#2(Opus, credits out) → FINAL HTML report.
## ✅ W7 deploy k4ef892jr READY. mig509 upsert_my_tenant_idp_policy LIVE on prod (verified). 7/8 waves live.
## W8 prompts written (8 tracks). Batch A launched: SCAN1=bq9jbvg1u SCAN2=bducttcy2 BOM=brsju7ta2. Batch B: LOC/NPD/UUID. Batch C: MAINT/PWA. ≤3 cursor.
## W8 grouping: SCAN1(C094/C096) SCAN2(C095/C097) PWA(C009 recheck) BOM(C048/C049) LOC(C016/C017) NPD(C029) UUID(C039) MAINT(C117 P1 asset-registry+mig510?/C118 OEE-range).
## ⚠️ LEKCJA: NIE odpalać Playwright browser przy 3 działających cursorach — Chrome+3cursor przekroczyło kill-threshold, zabiło SCAN1/BOM/LOC pre-finish. Browser-E2E TYLKO gdy 0 cursor działa.
## W7 E2E done (C007/C021/C022 browser-verified on prod, screenshot). LEDGER W7 ✅ VERIFIED.
## W8 recovery: SCAN2✅ complete (kept: scanner-primitives/globals/scanner-labels/i18n/topbar-a11y). Reverted SCAN1/BOM partials. Relaunched clean: SCAN1=bklfyyqnx BOM=bnedyfa39 LOC=b27dboz49. Then NPD/UUID/MAINT/PWA. NO browser during cursor runs.

## HUNT (owner req: 5 Fable → find NOVEL bugs ≠ my list, refactor, 1h). Fable OUT-OF-CREDITS → substitute = 5 general-purpose Claude agents (parallel, not cursor-pool). Areas: production(a278 relaunch) / warehouse(a08a) / npd(a9bb) / planning(a06b) / finance-auth(a4a5). Outputs → hunt-fable/HUNT-*.md. Rate-limits transient (agents retry). Aggregate → append LEDGER "Nowo znalezione (W9+)".
## W8 cursor: SCAN2✅ LOC✅ BOM✅ UUID✅ (C095/C097,C016/C017,C048/C049,C039). Running SCAN1/NPD/MAINT. Pending PWA. Then gate.

## W8 impl COMPLETE (8 tracks): SCAN1(C094/C096 edits landed, report lost—wrapper killed, cursor child finished 18:49)/SCAN2(C095/C097)/LOC(C016/C017)/BOM(C048/C049)/NPD(C029)/UUID(C039)/MAINT(C117 no-mig+C118)/PWA(C009 already-fixed recheck). 
## W8 GATE: tsc 5 ripples → W8-FIX=bujho12sd (LOC null-check/row-types/UpsertLocationInput, MAINT asset i18n moved off _meta staging → normal i18n, UUID WOHeader stub productionLineCode/Name). Await tsc=0 → test+build → commit → deploy → E2E(after cursors idle).
## 5-HUNTER SWEEP DONE: 19 novel findings in LEDGER "Nowo znalezione (W9+)" (3 P1, 5 P2, 9 P3, 2 P4/refactor). hunt-fable/HUNT-*.md.
## LESSON: pgrep -f cursor-agent self-matches poll-monitor shells (grep+seq) → false "cursor alive". Use `ps aux|grep cursor-agent|grep -v grep|grep -v cursor-exec` for REAL binary. SCAN1 looked hung but was done 40min prior.

## ✅ W8 COMMITTED ea823ba9 + PUSHED (03fa2ff9..ea823ba9). 13 findings. Gate: tsc=0, 0 regressions (68=68 vs W7-HEAD stash/pop), build 66/66, NO migration. 8/8 WAVES on prod. Deploy building.
## REMAINING: W8 deploy Ready + browser-E2E (0 cursors now — safe) → FABLE#2 regression (Opus cross-check, Fable out-of-credits) → FINAL HTML report (tokens/passes/engine eval).

## ✅✅ KAMPANIA KOMPLETNA (2026-07-16). 8/8 fal na prodzie + zweryfikowane (W8 dpl a7nyk7qiw READY; C117/C118/C009 browser-verified). FABLE#1 PASS. FABLE#2 = substytut 5-hunter sweep (19 novel findings w LEDGER W9+) + rygorystyczny stash/pop regression diff = 0 cross-wave regresji. Raport HTML: artifact 0def150f. Deliverable dostarczony.
## NEXT (owner directs): naprawa 19 novel findings — priorytet 3× P1 (N-PRD-1/N-PRD-2 cancelWo guards, N-PLN-1 scheduler crash) + N-FIN-2 customer PII security.
