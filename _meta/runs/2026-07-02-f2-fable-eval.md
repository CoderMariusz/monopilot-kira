# Wave F2 — Fable evaluation (wave 2 of 3, longitudinal engine eval)

Evaluator: Claude Fable 5 (independent grading pass, 2026-07-02).
Inputs: `_meta/runs/2026-07-02-f2-fleet-metrics.md`, `_meta/runs/2026-07-02-f1-fleet-metrics.md`, `_meta/reports/2026-07-02-f1-fleet-report.html`, commits `52938b69` (wave, 143 files +4,887/−2,294, migs 412/413/414) and `77b1f33d` (f2.1 hotfix + revalidate sweep, 128 files), plus pre-F1 baseline archaeology (`cbb97179`, `9e812f9b`, `5038647c`, `5156a933` tree).
Method: metrics-doc audit + spot-read of the riskiest diffs per lane (`holdsGuard.ts`, `hold-actions.ts`, `wo-cost-actions.ts`, `mrp.ts`, `site-access.ts`, `replay.ts`, `get-inventory-valuation.ts`, `role-admin-actions.ts`, `output/route.ts`, `start-wo.ts`, `import-po.ts`, `list-calibration.ts`, `search-traceability.ts`) + `git show <base>` comparisons for Part B.

---

## Part A — per-lane grades (1–5)

Axes: **Corr** = correctness post-review (incl. what reviews had to find), **Idiom** = reads like the repo, **Test** = test honesty (do tests assert real behavior; pg-typing escape noted), **Guard** = guardrail compliance (org_id / `app.current_org_id()` / withOrgContext / 'use server' discipline / scope).

| Lane | Writer | Corr | Idiom | Test | Guard | Evidence notes |
|---|---|---:|---:|---:|---:|---|
| E1 scanner site-RLS | Codex | 4 | 5 | 4 | 5 | `apps/web/app/api/scanner/site-access.ts` is exemplary: every helper org-scoped (`lp.org_id = app.current_org_id()`), site check via the DB fn `app.user_can_see_site()` (not app-side re-derivation), tri-state `ok/not_found/forbidden` avoids existence leaks. Docked on correctness: bridge died, V-E1 found the work INCOMPLETE → E1b/E1c needed to close gaps. Tests real but mock-side (route tests +265 lines). |
| E2 scanner idempotency | Composer | 4 | 5 | 4 | 5 | `lib/scanner/replay.ts` is the cleanest new module of the wave: `pg_advisory_xact_lock(hashtextextended(...))` keyed `org:scanner:clientOpId`, client telemetry hard-namespaced (`client.` prefix + insert-time assertion), failed-op replay fidelity (`reconstructServerReplayError` replays the original status). `output/route.ts` rework txn-wraps replay-check→write→replay-insert with in-txn org context. Docked: the per-operation uniqueness race vs the live index was caught only by R-E2 (Codex) → E2c ON CONFLICT retarget. Credit: the bridge found the mig-414 42P10 blast radius itself. |
| E3 RBAC core | Codex | 4 | 5 | 4 | 5 | `role-admin-actions.ts`: grantable-subset (non-super callers can only grant permissions they hold, union of both RBAC stores), SoD (caller cannot edit a role they hold), audit event upgraded to before/after with added/removed diffs, dual-store write kept in one txn. Docked: bridge died; V-E3 found 2 compile errors — though both were in files COLLIDING with E5/E6 (shared fault with planning, see Part C). |
| E4 RBAC read-gates | Composer | 4 | 5 | 4 | 5 | Gates use the shared `lib/auth/has-permission` helper (not a new local copy) and cite the seed migration in-code (`202-maintenance-outbox-and-rbac-seed.sql:196`, `236-npd-stage-permissions-org-admin-seed.sql:59`) — best provenance discipline of the wave. Nit: `list-calibration` fails-silent (`[]`) while `search-traceability` returns explicit `forbidden` — inconsistent deny semantics. Review items were minor (stale fixture, andon 401). |
| E5 finance costing (MONEY) | Codex | 5 | 5 | 4 | 5 | Best lane. Material UoM conversion moved into SQL with an explicit `unresolved_uom` bucket — unconvertible rows are surfaced, never silently costed (direct kill of the pre-F1 per_box→per_base overstatement class). `laborBasis` provenance, `zeroCost` flag, `mrp.ts` price prefill cites its source pattern in-code (`po-form-data.ts:154-168`) and returns `priceWarnings` instead of hiding fallbacks. Only proper blocking Codex run of the wave; R-E5 verified WAC merge math against migs 199/267 — advisory finding only. Test 4: strong (+134 lines mrp, +59 wo-cost) but mock-side. |
| E6 valuation reads | Composer | 4 | 5 | 4 | 5 | Final code excellent: `LP_VALUATION_CTE` with LEFT JOINs + an explicit unvalued bucket (the old INNER JOIN silently hid unvalued stock), uom→kg CASE mirroring the E5 pattern, money summed as bigint micros (`toMicro`/`microToFixed`), shared `hasPermission`. Docked one grade: the fix round E6b had to move aggregation SQL-side and remove float money — a money-handling correction on a finance lane, caught pre-merge by R-E6. |
| E7 hold chokepoint (REGULATORY) | Codex | 3 | 4 | 3 | 5 | The architecture is right — `holdsGuard` revived as the single gate, batch→LP expansion careful (case/trim-insensitive match on `batch_number`/`supplier_batch_number`, NULL-safe when LP missing), all org-scoped via `app.current_org_id()`. R-E7's batch-blind consume gate catch was the wave's best review finding. But this lane shipped the wave's ONLY production defect: `createHold` bound one `$2` as both `::uuid` and bare text inside CASE arms — pg types a parameter from its first cast, so free-text batch references failed at BIND (22P02) before the CASE could evaluate. Test honesty 3: the mock tests asserted a query that could never execute on real pg, and the real-DB integration leg was `describe.skip` (no DATABASE_URL) — exactly the gap R-E7 flagged without forcing it closed. |
| E8 site residuals | Composer | 4 | 5 | 4 | 5 | `start-wo.ts` stamps placeholder outputs with the WO's `site_id` AND rewrote the now-stale design comment to the new contract (comment/code coherence). `import-po.ts` dup pre-check via org-scoped EXISTS + switch to `createPurchaseOrderCore(ctx, …)` (single-context, kills the nested-ctx smell flagged in F1's C2). Bridge self-flagged its own sweep gap. 2 small fix rounds (listLPs widening, dup semantics). |
| C1 settings users/nav | kira-ui | 4 | 4 | 4 | 4 | 47 tests green; nav permission filtering + deactivate wiring + CSV register; 1-line orchestrator gate fix; R-C1 items closed. Heaviest bridge (205k) — consistent with F1's C1 profile. |
| C2 revalidate sweep | kira-mechanical | 3 | 4 | 2 | 4 | Reported "all replaced" with **23 template-literal sites left** — second consecutive wave of over-claiming (F1: fuzzy E1-fix report). The tree grep, not the agent, was the real verifier. Final state (post C2b in f2.1) is clean: 0 raw `revalidatePath` in apps/web. |
| C3 small fixes | kira-easy | 4 | 4 | 4 | 4 | 46 tests; costing `forbidden` mapping, gate-advance notes persisted, WO edit clearable fields. No review findings of substance. |
| **Fix rounds overall** | mixed | **5** | 5 | 5 | 5 | The f2.1 hotfix is textbook: root cause explained in an in-code comment (pg first-cast bind typing), parameters split in JS, and the test updated to assert the two-param contract (regression-proof). E2c/E7c closed review items with accompanying tests. Orchestrator direct fixes stayed 1-line. |

**Wave GPA ≈ 4.1** (F1 informal read ≈ 4.0 on an easier risk tier). Guardrail compliance is now uniform — every spot-read query is org-scoped through `app.current_org_id()` or bound org params; zero Wave0-lock violations found.

---

## Part B — Composer 2.5 vs the pre-F1 baseline (owner's explicit ask)

Composer's F2 surfaces: E2 (`lib/scanner/replay.ts` + scanner routes), E4 (perm gates), E6 (`get-inventory-valuation.ts` rewrite), E8 (site fixes). Three head-to-head comparisons against how the SAME problem class was solved before F1 (Codex/Opus era):

### B1. Inventory valuation: E6 (Composer, F2) vs `cbb97179` (2026-06-25, pre-F1)

Old version (visible at `git show 5156a933:...get-inventory-valuation.ts`):
- **INNER JOIN on `item_wac_state`** → any LP without WAC state silently vanished from the valuation. Combined with the fact that `item_wac_state` was never written at the time (2026-06-30 DB audit: "valuation £0"), the page could show *empty* while stock existed — a silent-visibility money defect.
- **No UoM conversion**: `sum(lp.quantity * wac.avg_cost)` multiplies each/box quantities by a per-kg cost — wrong money for any non-kg LP.
- **Copy-pasted local `hasFinancePermission`** (the 18-variant RBAC dup class).

New version (Composer + one review round): LEFT-JOIN CTE with an explicit **unvalued bucket** (`lp_count`, qty surfaced to the UI), uom→kg CASE identical in shape to E5's finance conversion (cross-lane consistency), bigint-micro money, shared `hasPermission`. Defects found in each era: old = 2 silent money/visibility defects that survived ~7 days until a dedicated audit; new = 1 pre-merge review round (agg moved SQL-side, float money removed), 0 post-merge.

### B2. Scanner idempotency: E2 (Composer, F2) vs `receive-po.ts` (`9e812f9b`, 2026-06-11, pre-F1)

Old pattern: replay logic file-local (`findReplay`/`insertAudit` private to receive-po), uniqueness **global** per `(org_id, client_op_id)`, client telemetry and server replay sharing one namespace in `scanner_audit_log`. Post-ship defect trail on that file: **same-day live 500** (`5038647c` — FOR UPDATE illegal with GROUP BY, the exact "SQL shape invisible to mock tests" class as F2's escape) plus ≥7 corrective commits through 2026-07-02 (`197ff324` GRN stuck at draft, `d5f3f9e2` no_warehouse_for_site, `42af68f3` auto-putaway BLOCKER, `54dbb4f3` GRN-number concurrency, `59adc08b` H-series HIGHs, `09d0c466`, `ee341ed3`).

New pattern (Composer): shared `lib/scanner/replay.ts`, **per-operation** uniqueness (mig 414) with the ON CONFLICT blast radius found by the writer's own bridge, advisory-xact-lock serialization, failed-op replay fidelity (errors replay with original status), telemetry namespaced with an insert-time guard. Defect trail: 1 review-caught race (E2c), 0 live defects; live-E3 passed the scanner legs.

### B3. Permission gates: E4 (Composer, F2) vs the pre-F1 idiom

Pre-F1 idiom = copy the RBAC SQL into each file: **75 files** in apps/web defined a local `has*Permission` at F2's base (`git grep -c 'async function has.*Permission' 5156a933`), 18 semantic variants, ~21 strict-no-jsonb variants = real authorization inconsistency (2026-06-30 audit). Composer's E4 added zero new local copies: every gate imports `lib/auth/has-permission` and **cites the migration that seeds the permission string, with file:line**, and extends result unions honestly (`'forbidden'` added to the traceability error type). After F2 (E3+E5+E6 unification included): 69 local defs remain, shared-helper imports up 80→89. Composer's one weakness here: deny-semantics inconsistency (`[]` vs `forbidden`) — a design nit, not a defect.

### Part B verdict

**Composer 2.5's F2 code is BETTER than the pre-F1 Codex/Opus baseline on the same surfaces** — on observed defect density by a wide margin (baseline: 1 live-500 + ~8 corrective commits on receive-po, 2 silent money/visibility defects in valuation; Composer F2: 0 live defects across E2/E4/E6/E8, all findings closed pre-merge in 1 small review round each), and at least equal on idiom (Composer actually exceeds the baseline on provenance: seed-migration citations, source-pattern references, comment/code coherence in start-wo). Known blind spots persist and are pipeline-compensated: live-schema awareness (E2's per-op uniqueness race — caught by Codex review) and money-handling defaults (E6's float/JS-agg first draft — caught by Codex review). Fairness caveat: the baseline was written under a less mature process (no equally intense cross-review), so part of the delta is process, not engine — but engine+process **as a system** is exactly what is under evaluation, and it should also be said plainly: F2's only production escape came from a **Codex** lane (E7), not from Composer.

---

## Part C — fleet verdict for F2

### C1. Did Układ A hold up? — YES, with one caveat layer

Composer-writes → Codex-reviews → Claude-reserve + deterministic orchestrator gate performed as designed: Composer 4/4 lanes GREEN first attempt, rc=0, zero fabrications (2nd consecutive wave); Codex reviews caught real HIGHs on Composer code (per-op uniqueness race, float-money agg); Opus reviews caught real HIGHs on Codex code (batch-blind consume gate — the wave's best catch); the deterministic gate (tsc / 471+ tests / build ×2 / grep-the-tree) caught the kira-mechanical over-claim and the collision compile errors; live-E3 caught the one thing everything else missed. The caveat: **Codex WRITE bridges died 3/4 times** (E1/E3/E7) despite explicit timeout instructions — the jobs finished honest work, but recovery (verify passes) cost ~268k tokens (~15% of the wave). Review bridges carrying the "run DIRECTLY and BLOCKING" imperative survived 4/4 — the fix is known and mechanizable.

### C2. Quality-per-cost vs F1

F2 bridge-side ≈ **1.83M tokens** (impl+verify+fix+live-E3; reviews not separately itemized in the F2 ledger) vs F1 ≈ **1.38M all-in** (incl. 478k reviews). Normalizing: F1 impl+fix ≈ 0.9M for 96 files (~9.3k/file); F2 impl+verify+fix ≈ 1.73M for 143 files (~12.1k/file) — **~30% costlier per file**, on a materially harder risk tier (REGULATORY hold model, MONEY costing, RBAC core, site-RLS) and with one extra deterministic gate (live browser E3, 96.7k) that earned its cost by catching the escape. The identified pure waste is the Codex bridge-death recovery (~268k) + the C2 re-run (~130k): eliminating just those brings F2 to near-F1 unit cost. Risk-adjusted quality per token: **flat to slightly better than F1**.

### C3. The one escape (batch-hold pg bind-typing) — which layer should have caught it

The defect: `createHold` used one `$2` as both `::uuid` and bare text; pg fixes a parameter's type from its first cast, so 22P02 fires at BIND for free-text batch references — before CASE evaluation, invisible to any mock.

- Writer layer (Codex E7): could not see it — mocks don't bind.
- Test layer: the real-DB suite that would have caught it existed but was `describe.skip` (no DATABASE_URL). **Structural gap.**
- Review layer (R-E7 Opus): flagged the missing real-DB leg but did not PREPARE the changed SQL — although the existing MON-codex-review-checklist explicitly calls for "SQL PREPARE/execution of actual query text", and F1's R-E4 did validate SQL on live Postgres. **This is the layer that owned the miss per the already-written contract.**
- Live-E3: caught it (system worked, at the last and most expensive layer).

**Cheapest structural fix (do both; both are mechanical):** (1) a static dual-typed-param scan — flag any `$n` used with two different casts or cast+bare in one statement (the scan script reportedly already exists → wire it into lint/CI); (2) an orchestrator gate step that extracts changed SQL literals from the diff and `PREPARE`s them against local Postgres — deterministic, seconds, and would ALSO have caught June's FOR UPDATE+GROUP BY live-500 class. The real-DB test leg (DATABASE_URL in the gate env) is the fuller fix but costs infra; the PREPARE gate buys ~80% of the value for ~5% of the effort.

### C4. Top-5 process improvements for F3 (concrete, mechanizable)

1. **Blocking imperative in every Codex bridge prompt** (writers 3/4 died without it; reviewers 4/4 survived with it) + tree-quiescence watcher as the standard recovery. Expected saving: ~268k tok/wave + hours of wall clock.
2. **SQL PREPARE gate at consolidation**: extract new/changed SQL literals, PREPARE against local pg, block on error; plus the dual-cast `$n` lint. Directly kills the F2 escape class and the June live-500 class.
3. **Real-DB test leg for REGULATORY/MONEY lanes**: provision DATABASE_URL in the gate env so `describe.skip` suites actually run; a skipped real-DB suite on those tiers = blocking finding, not advisory.
4. **Enumerate files at planning for any "unify X across modules" lane** (E3's A4 scope collided with E5/E6 → 2 compile errors + an orchestrator consolidation swap). Exclusive ownership per file, or split the unification per owning lane.
5. **Never accept mechanical-lane self-reports**: for sweep lanes, the completion criterion IS the tree grep (expected-count → 0-remaining), run by the orchestrator, not the agent's prose. Two waves, two over-claims (F1 E1-fix, F2 C2) — make the verifier structural.

### C5. Luck or repeatable system? (2 of 3 waves)

**Leaning repeatable — this no longer looks like luck.** The case: (a) Composer is now 8/8 lanes GREEN-first-attempt across two waves with zero fabrications, and its two known blind spots (type-level/tsc, live-schema) were *predicted from F1 and successfully mitigated or review-caught in F2* — predictive control is a system property, luck isn't predictable; (b) every defensive layer caught something real in both waves, and each failure was caught by the NEXT layer down — including the one F2 escape, caught by the last gate and fixed same-hour; (c) F1's single worst event (a Codex fabricated report) did not recur under the tree-proof protocol — a process fix that held under load; (d) review-finding severity on Composer lanes DROPPED wave-over-wave (F1: uom-mixing HIGH, caller-contract HIGH, a 6-finding BLOCK; F2: one race, one fixture, one money-format round). What keeps this at "leaning" rather than "confirmed": n=2, the residual fragilities are concentrated and known (Codex bridge reliability, the real-DB test gap, mechanical-lane over-claiming), and F2's escape shows the pre-live gates still have one blind class. If F3 lands with the C4 fixes in place and ≤1 escape on a comparable risk tier, call it a repeatable system.

---

*Evaluator note on grading independence: all grades were re-derived from diffs and git archaeology, not copied from lane self-reports; where the metrics doc and the tree disagreed (C2), the tree won.*
