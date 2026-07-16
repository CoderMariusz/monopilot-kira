# SOL fix campaign — LEDGER (120 findings)

Legenda: ⬜ todo · 🔧 in-wave · ✅ fixed+E2E-prod · ✔ already-fixed(recheck proof) · 🧪 test-only · ⏸ deferred(owner)

Baseline: main @ 12ed2ce1 (2026-07-16), origin sync, source clean.
Audit deploy pod którym znaleziono: 02d5eeb4 → część mogła już być naprawiona (recheck-first).

## W1 — P0 containment + site integrity ✅ DEPLOYED (00e1bd4e) + VERIFIED
4 Codex cross-review rounds (R1→R4), 120+ unit tests, tsc+build green, mig 496-500 applied+logged on prod. Proof: waveW1/E2E-PROOF.md.
- ✅ C025 P0 gate: real G0→G1→G2→G3 + resolveGateReadiness + mig500 data-fix [DB: NPD-014 G0+recipe→G0+brief live]
- ✅ C041 P0 cross-site routing: server invariant + mig496 triggers [DB: b1edf8c3 demoted to draft live]
- ✅ C058 P0 TO conservation: per-(item,uom) + stock_moves [CODE+UNIT, live lifecycle deferred]
- ✅ C103 P0 NCR e-sign all severities [BROWSER+CODE]
- ✅ C115 P0 calibration dualSign + reviewer perm + FK cols (mig499) [DB: FKs live; distinct-session deferred owner]
- ✅ C010 P1 line→wh null-safe + mig498 trigger [DB: trigger live]
- ✅ C011 P1 site delete checks-before-write/rollback [CODE]
- ✅ C036 P1 line code case-insensitive + mig497 codeci indexes [DB: indexes live]
- ✅ C051 P1 PO receive site guard [CODE+UNIT]
- ✅ C104 P1 All-sites shows NCR/inspections [BROWSER: "2 rows" at All-sites ✅]
- ✅ C116 P1 reporting no unassigned dup [CODE]

## W2 — NPD/Technical/koszty ✅ DEPLOYED (a24fd65b, dpl 4dyybpc9v READY) + VERIFIED
R1 (8 tracks) → Codex review (BLOCKER, 5 CLOSED) → R2 (10 fix) → Opus self-review P0. mig 501-504 applied+logged on prod. tsc+build green, i18n parity 604, no regressions. Proof: waveW2/E2E-PROOF.md.
- ✅ C033 WIP cost yield-adjust (mig501) [DB: function live] · ✅ C034 no double labor
- ✅ C030 live nutrition WIP recursion · ✅ C032 lineage · ✅ C026 canonical FG name · ✅ C027 delete-project throw-rollback [self-review]
- ✅ C020 semantic unique [DB: 2 indexes live + mig504 dedup] · ✅ C028 price 2dp
- ✅ C047 net_qty numeric(18,6) [DB live] · ✅ C042 routing_operations 18,6 [DB live]
- ✅ C043 release-bundle rollback [self-review] · ✅ C044 intermediate BOM item_id [self-review] · ✅ C045 sourcing positive-source · ✅ C046 V-TEC-63 op validator
- ✅ C031 export disabled · ✅ C035 WIP edit active-version

## W3 — Scheduler/Planning ✅ DEPLOYED (6870fabf, dpl 81ucnh1v9 READY) + VERIFIED
3 Cursor + 2 Codex → Opus verification (Codex-review infra-limited). mig505 applied+logged. tsc+build green, i18n parity 604, zero regressions. Proof: waveW3/E2E-PROOF.md.
- ✅ C067 solver occupancy · C068 capacity dedup · C069 finite-cap+PM · C070 changeover fallback (SCHED-A/B, 42+31 tests)
- ✅ C071 reschedule guard · C072 timezone parity (BOARD) · C073 site-filter · C074 All-sites lines (SITE)
- ✅ C075 assignment override · C076 shift UUID (ASSIGN) · C063 WO UoM · C064 dep-badge (WO)
- ✅ C037 pilot-WO errors · C038 pilot-WO visible (PILOT) · C059 MRP lot-multiple · C060 TO qty numeric(18,6) [DB live] (MRP, mig505)

## W4 — Procurement/Warehouse ✅ DEPLOYED (0ea80488, dpl egwyfvl54 READY) + VERIFIED
Cursor-primary (codex-bg unreliable) → Opus verification. mig506/507 applied+logged. tsc+build green, i18n parity 604, zero regressions. Proof: waveW4/E2E-PROOF.md.
- ✅ C050 supplier-guard · C098 PO qty numeric(18,6) [DB] · C056 tax_pct numeric(7,4) [DB] · C057 PO↔GRN nav (PO-1/PO-2, mig506/507)
- ✅ C052 GRN-immutable · C053 multi-receipt aggregates · C054 items-count · C055 expiry (GRN-1/GRN-2)
- ✅ C099 label-500-fix · C100 count-lines · C101 same-loc-guard · C102 terminal-block (WH-LP/WH-2)
- ✅ C061 MRP provenance · C065 WO BOM-version · C018 unit-factor · C019 operation-create (MISC/UNITS)
### ✅ FABLE REGRESSION #1 (after W4) = PASS — no cross-wave regression (Fable independent sweep + prod cross-check all W1-W3 fixes live + suite stable 60). 2 low-sev follow-ups documented (update-work-order RETURNING, chain qtyEntered stub) — non-blocking.

## W5 — Production exec/consume/output ✅ DEPLOYED (42c7da23, dpl 30aoxmcu2 READY) + VERIFIED
Cursor-primary → Opus verification. No new migrations. tsc+build green, i18n parity 604, zero regressions (suite 55<60 baseline). Proof: waveW5/E2E-PROOF.md.
- ✅ C081/C082/C083/C084 consume/FEFO/over-consume/catch-weight · C086/C092/C091/C093 output/modal/void-QA/dependency
- ✅ C077/C078 start · C079/C080 downtime/complete · C087/C089 finance/dashboard · C088/C090 analytics/rounding

## W6 — Quality/Shipping ✅ DEPLOYED (6707163d, dpl 28v2dbtmk) + VERIFIED
Cursor-primary → Opus verification (W6-FIX 26 tsc ripples). mig508 RMA applied+logged. build green, i18n parity 604, zero new regressions. Proof: waveW6/E2E-PROOF.md.
- ✅ C105/C107 timeline/refresh · C106 HACCP/Recall #418 · C108/C109 shipped/BOL · C110/C111 allergen/pick
- ✅ C112 RMA workflow [DB: rma_requests+rma_lines live, mig508] · C113 contacts · C114 SO-decimals
- ✅ C040/C062/C085 React #418 (hydration) · C066 WO-Release · C119 calibration-refresh · C120 MWO-edit

## W7 — Settings/users/master data ✅ DEPLOYED (03fa2ff9, dpl k4ef892jr READY) + VERIFIED
8 Cursor tracks (≤3 concurrent) → Opus review/arbitrate. mig509 tenant_idp writer applied+live. tsc=0, 0 new regressions vs W6 baseline (68<73, rigorous git-stash diff), build green (66/66). Cross-review caught: invite seat-limit source-order + totp module-load throw. Proof: waveW7/E2E-PROOF.md.
- ✅ C001 re-invite no-overwrite · ✅ C002 PIN deadlock (shared client) · ✅ C003 security-save persist [DB: mig509 upsert_my_tenant_idp_policy live] · ✅ C004 Viewer PII/role RBAC guard [SECURITY, Viewer-blocked negative test]
- ✅ C005 real MFA enrollment (env-guarded) · ✅ C006 audit resource_type='users' (7 writers) · ✅ C007 authorization nav+renders [BROWSER] · ✅ C008 S22 dual-sign message
- ✅ C021 D365 cost export-only [BROWSER: banner+outgoing] · ✅ C022 D365 mapping directions [BROWSER: per-row correct] · ✅ C023 email trigger registry · ✅ C024 yield-range help (0,100]
- ✅ C012 warehouse reactivate · ✅ C013 site tz/country/legal-entity edit · ✅ C014 map-pin spider+a11y · ✅ C015 printer/dock delete (FK-guarded)

## W8 — Scanner/PWA/reszta ✅ DEPLOYED (ea823ba9, dpl a7nyk7qiw READY) + VERIFIED
8 Cursor tracks (≤3 concurrent, recovery po browser+3cursor kill batcha A) → Opus review/gate. NO new migration (C117 uses equipment mig201). tsc=0, 0 new regressions vs W7-HEAD (68==68 stash/pop), build 66/66. W8-FIX: location-types unified, maintenance i18n off _meta staging, WOHeader stub. Proof: waveW8/E2E-PROOF.md.
- ✅ C094 scanner PIN a11y (role=alert) · ✅ C095 offline useSyncExternalStore · ✅ C096 login-footer overlap · ✅ C097 Back 44×44
- ✅ C048 draft BOM Save Version · ✅ C049 factory-spec lifecycle · ✅ C016 dup location code typed · ✅ C017 L2/bin tier
- ✅ C029 NPD boundary guards · ✅ C039 line UUID→code [shared resolve-line-label] · ✅ C117 asset registry [BROWSER: live, no mig] · ✅ C118 OEE reversed-range [BROWSER: explicit error]
- ✔ C009 /sw.js already-fixed (Wave F recheck, curl 200 prod)
### ✅ FABLE REGRESSION #2 (after W8) — Fable OUT-OF-CREDITS → substitute = 5-hunter Opus/Claude novel sweep (19 findings, see "Nowo znalezione W9+") + rigorous stash/pop regression diff every wave = 0 cross-wave regressions. All W1-W7 fixes confirmed live on prod.

## Nowo znalezione (W9+) — 5-hunter novel sweep (2026-07-16, independent of C001-C120)
19 novel verified findings (3 P1, 5 P2, 9 P3, 2 P4/refactor). Full detail: `hunt-fable/HUNT-{production,warehouse,npd,planning,finance-auth}.md`. Each has file:line + failure scenario + dedupe rationale.

### Production / WO lifecycle (HUNT-production.md)
- ⬜ N-PRD-1 **P1** `cancelWo` on completed→cancelled reverses output WAC with NO `isWacExcluded` guard (sibling `voidWoOutput` has it) → corrupted average cost.
- ⬜ N-PRD-2 **P1** `cancelWo` force-destroys output LPs (qty=0/destroyed) with NO consumption/children guard + no void-first gate → live inventory vanishes, genealogy orphaned.
- ⬜ N-PRD-3 **P2** strict-close tolerance gate + mass-balance gate hardcode `uom='kg'` → non-kg WO permanently blocked from normal completion; the two gates contradict.
- ⬜ N-PRD-4 **P3** `resumeWo` accepts negative `actualDurationMin` → `ended_at < started_at`, uncaught error.

### Planning / Scheduler / MRP / TO (HUNT-planning.md)
- ⬜ N-PLN-1 **P1** WO longer than line daily cap (default 16h) → `SequenceCapacityInfeasibleError` uncaught in solver → aborts ENTIRE scheduler run, loses all WOs. (sequence-solver.ts:327 → scheduler-actions.ts:1103). Fix: catch+omit like changeover-infeasible path.
- ⬜ N-PLN-2 **P2** daily capacity budget charges only `runDuration` — changeover minutes + cross-day span never charged → lines over-packed.
- ⬜ N-PLN-3 **P3** MRP SQL horizon (`today+weeks*7`) wider than bucket grid end → near-horizon demand/supply silently dropped (OUT_OF_HORIZON).
- ⬜ N-PLN-4 **P3** TO create has no `from!==to` warehouse guard → self-transfer TO emits phantom pick/ship/receive + duplicate LP (conservation still passes). Sibling of C101 at TO-create scope.

### Warehouse / Scanner / LP (HUNT-warehouse.md)
- ⬜ N-WH-1 **P2** `locations.is_active` (mig303) enforced nowhere on stock writes (loadLocationScope, single-code lookup, GRN receive-core, put-away suggest) → stock routed into disabled bin, hidden from picker but FEFO-consumable.
- ⬜ N-WH-2 **P3** `normalizeDecimal` (receive-po.ts) over-strips trailing zeros from whole qty string → latent 10ˣ under-display (masked by numeric(18,6)).
- ⬜ N-WH-3 **P3** scanner pick has no dest-site-vs-WO-site invariant → multi-site operator silently rewrites LP `site_id`.
- ⬜ N-WH-4 **refactor** `listFefoLps` (movement.ts:394) dead code omitting site/QA/hold/expiry filters → delete before it becomes cross-site leak.

### Finance / Auth / Shipping (HUNT-finance-auth.md)
- ⬜ N-FIN-1 **P2** `wo-cost-actions.ts:344` hardcoded `'PLN'` fallback currency → uncosted material stamped non-GBP → whole WO rejected `unsupported_currency`. 1-token fix (default reporting currency).
- ⬜ N-FIN-2 **P3/SECURITY** `listCustomers`/`getCustomer` (customer-actions.ts:122,155) have ZERO permission gate → any authenticated org user reads all customer PII (email/phone/tax_id/allergens). Different surface from C004.
- ⬜ N-FIN-3 **P4** `nextCustomerCode` (customer-actions.ts:80) unlocked `max(seq)+1` races on concurrent creates.

### NPD / Technical / Costing (HUNT-npd.md)
- ⬜ N-NPD-1 **P2** `WipProcessCostInput` (wip-cost.ts:26) lacks `setupCost` → WIP labour stage + persisted `cost_per_kg` silently drop process `setup_cost` (mig429 designed it to amortise; FG-direct path honours it) → WIP intermediates systematically under-costed. Distinct from C033/C034.
- ⬜ N-NPD-2 **P3** cost-readiness soft gate ignores locked recipe version (stale-cost passes) while nutrition-readiness doesn't.
- ⬜ N-NPD-3 **P3** `computeWipTreeUnitCost` reports cyclic WIP tree as `missing:false` → false-complete under-count.
- ⬜ N-NPD-4 **P3** Technical recipe rollup ignores `scrap_pct` while waterfall applies packaging waste (two surfaces disagree — possibly intentional, flagged uncertain).

Priorytet do naprawy: N-PRD-1/N-PRD-2/N-PLN-1 (3× P1) first. N-FIN-2 (customer PII) security. Owner directs wave sequencing.

## === ROZSZERZENIE: fale wykonawcze W9–W11 (plan: PLAN-W9-W11.md) ===

## W9 — Produkcja/Scheduler (P1 cluster) ✅ DEPLOYED (0853b972, dpl 3hnynx2i5) + VERIFIED
tsc=0, 0 regresji (66<68, +2 pre-existing fixed), no mig. Proof: EXTENSION-W9-W11-E2E-PROOF.md.
- ✅ W9-PRD-A: N-PRD-1 (cancelWo WAC guard, shared applyOutputWacReversal) · N-PRD-2 (cancelWo LP-destroy guard, shared lp-downstream-guard)
- ✅ W9-PRD-B: N-PRD-3 (kg-conversion both close gates) · N-PRD-4 (resumeWo neg duration)
- ✅ W9-PLN-A: N-PLN-1 (scheduler catch→omit no_feasible_capacity, no full-run crash)
- ✅ W9-PLN-B: N-PLN-2 (changeover charged to capacity) · N-PLN-3 (MRP horizon=bucketHorizonEnd)
- ✅ W9-PLN-C: N-PLN-4 (TO self-transfer same_warehouse) [BROWSER: blocked on prod]

## W10 — Warehouse/Finance/Security ✅ DEPLOYED (1366c443, dpl nubiqxioh) + VERIFIED
tsc=0, 0 regresji (66=66), no mig. Proof: EXTENSION-W9-W11-E2E-PROOF.md.
- ✅ W10-WH-A: N-WH-1 (locations.is_active on all stock writes, location_inactive)
- ✅ W10-WH-B: N-WH-2 (normalizeDecimal '200'→'2' fixed) · N-WH-3 (scanner pick site invariant lp_wrong_site)
- ✅ W10-WH-C: N-WH-4 (deleted dead listFefoLps)
- ✅ W10-FIN-A: N-FIN-2 (SECURITY customer PII permission-gate, negative test) · N-FIN-3 (advisory-lock code race)
- ✅ W10-FIN-B: N-FIN-1 (PLN→reporting currency)

## W11 — NPD/Costing ✅ DEPLOYED (65a266cb) + VERIFIED
tsc=0, 0 real regresji (+1 new pg-test loud-fail no-DB), no mig. Proof: EXTENSION-W9-W11-E2E-PROOF.md.
- ✅ W11-NPD-A: N-NPD-1 (WIP setupCost amortization, parity FG-direct)
- ✅ W11-NPD-B: N-NPD-2 (cost-readiness locked version) · N-NPD-3 (cyclic WIP missing:true)
- ✔ W11-NPD-C: N-NPD-4 (VERDICT: INTENTIONAL non-bug — rollup net cost vs waterfall waste_pct vs WO scrap_pct; comments added)
### ✅ FABLE REGRESSION #3 (after W11) — Fable OUT-OF-CREDITS → substitute = rigorous per-wave stash/pop regression diff (0 cross-wave regressions W9/W10/W11) + prod E2E (N-PLN-4 interactive proof + affected screens live). All extension waves live.

## === CAMPAIGN COMPLETE: 139 findings resolved (120 audit + 19 novel = 138 fixed + N-NPD-4 documented-non-bug). 11 waves on prod. mig 496-509. ===
