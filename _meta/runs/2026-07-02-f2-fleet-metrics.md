# Wave F2 — fleet metrics (2026-07-02)

Commits: `52938b69` (wave, 143 files +4,887/−2,294) + `77b1f33d` (f2.1 follow-up: batch-hold pg bind fix + revalidateLocalized sweep, 128 files). Migs 412/413/414 applied live BEFORE code push (R-E7 hard order). Base: `5156a933`. Gate: tsc=0, 471+ targeted tests, next build ×2 green. Live-E3: 9/10 PASS → 1 FAIL (batch-hold 22P02) → hotfixed in f2.1.

## Lane ledger (bridge-side tokens / duration; engine-side not visible)

| Lane | Writer | Result | Bridge tok | Dur(s) | Fix rounds | Review verdict |
|---|---|---|---|---|---|---|
| E1 scanner site-RLS | Codex | bridge DIED (backgrounded); writer finished; V-E1 = INCOMPLETE → E1b → GREEN | 20.5k (+V 106.7k, +E1b 100.7k, +E1c 37.2k) | 634 (+328/+394/+104) | 2 (E1b gaps, E1c hardening) | R-E1 Opus **SHIP** (LOW-1 hardening applied) |
| E2 scanner idempotency | Composer | GREEN 1st attempt; bridge itself found mig-414 42P10 blast radius | 47.7k (+E2b 50.2k, +E2c 31.1k) | 605 (+511/+100) | 2 (E2b review items, E2c ON CONFLICT retarget) | R-E2 Codex **FIX→closed** (per-op uniqueness race — real) |
| E3 RBAC core | Codex | bridge DIED; V-E3 = BROKEN (2 compile errors in COLLIDING files) → E3b + consolidation swap → GREEN | 21.0k (+V 72.4k, +E3b 30.7k) | 641 (+320/+47) | 1 + orchestrator perm-swap | R-E3 Opus **SHIP** (every escalation vector probed) |
| E4 RBAC read-gates | Composer | GREEN 1st attempt | 32.8k (+E4b 67.4k) | 651 (+424) | 1 (stale fixture, andon 401) | R-E4 Codex **FIX→closed** |
| E5 finance costing (MONEY) | Codex | GREEN (proper blocking run) | 32.8k (+E5b 57.5k) | 448 (+183) | 1 (advisory: list-price fallback) | R-E5 Opus **SHIP** (WAC merge math verified vs migs 199/267) |
| E6 valuation reads | Composer | GREEN 1st attempt | 48.3k (+E6b 33.3k) | 628 (+286) | 1 (SQL-side agg + no-float money) | R-E6 Codex **FIX→closed** |
| E7 hold chokepoint (REGULATORY) | Codex | bridge DIED; V-E7 = INCOMPLETE (pkg exports) → E7b + E7c → GREEN | 21.6k (+V 88.9k, +E7b 56.0k, +E7c 90.4k) | 647 (+608/+380/+545) | 2 | R-E7 Opus **FIX→closed** (batch-blind consume gate = the wave's best catch) |
| E8 site residuals | Composer | GREEN 1st attempt; bridge flagged sweep gap itself | 45.8k (+E8b 24.9k, +E8c 42.7k) | 398 (+47/+201) | 2 (listLPs widen, import-po dup semantics) | R-E8 Codex **FIX→closed** |
| C1 settings users/nav | kira-ui | GREEN (47 tests) | 205.1k | 1241 | 1-line orchestrator fix | R-C1 Codex **FIX→closed** |
| C3 small fixes | kira-easy | GREEN (46 tests) | 146.9k | 831 | 1-line orchestrator fix | R-C3 Codex **FIX→closed** |
| C2 revalidate sweep | kira-mechanical | REPORTED complete, tree grep showed 23 missed template-literal sites → C2b | 88.4k (+C2b 130.5k) | 567 (+3012) | 1 | lint/tsc as reviewer (mechanical) |
| E3-live | Opus browser | **LIVE-RED 9/10** → orchestrator hotfix → f2.1 | 96.7k | 628 | — | 14 screenshots e2e-f2-*.png |

Fix-round writers: kira-easy ×8, kira-mechanical ×1, Composer ×2 (self-fix), orchestrator direct ×3 (1-line gate fixes + batch-hold hotfix).

## Incidents & engine reliability

1. **Codex WRITE bridges died 3/4 times** (E1/E3/E7): backgrounded the job (~640 s, 1 tool use) despite explicit `--timeout-ms 3000000` instruction; the codex jobs KEPT RUNNING and finished honest work. Recovery: tree-quiescence watchers + kira-research verify passes. Review bridges with a "run codex DIRECTLY and BLOCKING, never background" imperative did NOT die (4/4). → F3 rule: put the blocking imperative in ALL codex bridge prompts.
2. **Zero Codex fabrications this wave** (F1 had 1 full false-GREEN). The tree-proof protocol (AGENTS.md 15-17) held.
3. **Composer 4/4 rc=0 single attempt, zero fabrications, self-verifying bridges caught 2 real blockers** (mig-414 ON CONFLICT blast radius; env-artifact attribution). Its blind spots remain tsc (2 lanes needed type-level review fixes in F1; this wave 0 — scoped-tsc rule worked) and live-schema (per-op uniqueness index caught only in review).
4. **kira-mechanical over-claimed again** (C2 "all replaced" with 23 sites left) — grep-the-tree caught it; same class as F1's E1-fix fuzzy report.
5. **1 defect escaped every pre-live gate to production**: batch-hold pg BIND-typing (one `$n` used as `::uuid` + bare text — pg types from the first cast; 22P02 before CASE evaluates). Mock tests can't see pg parameter typing; the real-DB integration tests that would have caught it were `describe.skip` (no DATABASE_URL) — exactly the gap R-E7 flagged. Live-E3 (the last gate) caught it; hotfix landed same-hour. → F3 rules: real-DB test leg for new DML shapes; dual-typed-param lint/scan (the scan script exists now).
6. Env lessons: worktree bootstrap must symlink `packages/*/node_modules` (script updated); Turbopack can't build in symlinked worktrees (build gate on main checkout); macOS has no `/usr/bin/timeout`; `git apply --3way` stages into the index (reset --hard between rebuilds; exploited deliberately for E1-staged/E2-unstaged separation).

## Cross-lane collision (planning error, recovered)

E3's A4 scope (hasPermission unification) inherently touched `wo-cost-actions.ts` (owned by E5) and `get-inventory-valuation.ts` (owned by E6). Resolved: finance hunks excluded from E3's patch; orchestrator re-applied the swap onto the merged E5/E6 versions (incl. E3's 2 missed callsites). → F3 rule: when a lane's scope is "unify X across modules", enumerate the exact files at planning time and either give that lane exclusive ownership or split per owner.
