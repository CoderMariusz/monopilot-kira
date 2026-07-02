# Wave F3 — Fable evaluation (2026-07-02) — final wave of the 3-wave longitudinal protocol

Grading scale 1-5 per lane on correctness / idiom / tests / scope. Evidence: review verdicts (R-G*), fix-round outcomes, live-E3 results, tree verification. Companion: `2026-07-02-f3-fleet-metrics.md`.

## Lane grades

| Lane | Writer | Corr | Idiom | Tests | Scope | Notes |
|---|---|---|---|---|---|---|
| G1 | Codex | 4 | 4 | 2 | 3 | Substance excellent (window math, idempotency, shared-path reuse; byte-perfect extraction preserving the F2 bind fix). But: the mandated real-DB leg was VACUOUS (schema probes, not behavior); broke a legacy test it never ran; ±763 lines vs "extend only" brief (defensible, but unilateral). |
| G2 | kira-easy | 5 | 5 | 5 | 5 | Flawless small lane; proved a pre-existing red via git stash; R-G2 zero findings; batch-hold display verified live. |
| G3 | Codex | 5 | 4 | 5 | 5 | Honest env reporting; live-DB-safe fixtures (confirmed by review); all three mandated suites present with exact math. |
| G4 | Composer | 4 | 4 | 4 | 5 | One real numeric-representation bug (string '0' vs '0.000000') + wrong site stamp — both caught in review; everything else verified before-write ordering correct. |
| G5 | Composer | 3 | 3 | 3 | 4 | Good component design, but 4 BLOCKING findings: 2× 'use server' type exports, missing per-entity authz (client-callable generic action), i18n bypassed via a local labels object, tautological isolation test. |
| G6 | Composer | 3 | 4 | 3 | 5 | Clean structure + correct route-tree placement, but the exact partial-commit anti-pattern SHARED-RULES warns about, AND the live date round-trip failure (formatDate vs pg Date — swallowed exception) escaped both review and unit tests. |
| G7 | Codex | 3 | 4 | 4 | 4 | 3 honest NO-OPs with seed citations, real fixes elsewhere — but missed the labor-route oracle the brief EXPLICITLY said to grep for (acceptance-criterion miss), and left the semantically-wrong sensory gate as "already gated". |
| G8 | Composer | 5 | 4 | 4 | 5 | Best lane: independently refined its own input map 47→116 with per-permission citations and caught reverse-direction errors (wrong-gate findings feeding the gaps report). 2 UI-only-gate misclassifications caught in review. |
| G9 | Composer | 3 | 4 | 3 | 4 | Largest lane; UI/CRUD verified working live — but 3 BLOCKING txn-integrity findings (no unique default, clear-then-set partial commit, no referential guard) + its i18n sidecar was destroyed by its own fix round (G9b overwrote instead of appending) → live raw-key regression. |
| G10 | Composer | 3 | 4 | 4 | 4 | The extraction itself was high quality (25/25 legacy tests kept green, bridge self-verified) — but the DESKTOP wrapper's post-core backfill ordered a grn_items write after the completed-flip → the wave's live escape #2; plus an error-type escape (500 vs 400) and a missing site gate, both review-caught. |

**Wave GPA ≈ 3.9** (F1 ~4.0 easier tier, F2 ~4.1). The tier was the widest yet (5 feature builds + 3 enforcement lanes + infra + sweep) with the most cross-lane surface so far.

## Escapes to production (the longitudinal metric)

Live-E3 round 1: **5/7 PASS — 3 defects escaped every pre-live gate** (F1: 0, F2: 1):
1. **Desktop GRN receive dead on arrival** (V-WH-GRN-001 ordering — desktop wrapper backfill after completed-flip). Review R-G10 diffed the extraction fidelity but not the NEW wrapper's post-core write ordering; unit mocks can't see trigger same-txn visibility. Same class as F2's escape: REAL-DB-ONLY failure modes.
2. **Customer detail raw i18n keys** — ORCHESTRATION failure, not an engine failure: the G9b fix round overwrote the lane's i18n sidecar; the merge then had nothing to merge. No gate checked "keys referenced by new components resolve in locale files".
3. **Compliance audit dates dropped** (formatDate .trim() on pg Date, exception swallowed) — mock tests typed rows as strings; the pg driver returns Date. Another real-DB-only mode.
Plus one deploy-gate failure (not a user-facing escape): Turbopack rejects `export { x } from` in 'use server' modules; local build passes it. Hotfixed f3.1 pre-READY.

All three fixed same-session (f3.2 `1d560dc0`): root-caused, regression-tested (incl. a trigger-emulating order test proven fail-before-fix), re-verified live.

## Composer vs pre-F1 baseline (protocol requirement)

Composer remains clearly better than the pre-F1 Codex/Opus baseline on comparable work: the old receive-po path (`9e812f9b` era) shipped with a same-day live 500 + ~8 corrective commits; G10's extraction kept 25 legacy tests green and its ONE live defect was in genuinely new wrapper code, fixed in one round. The old customers surface was create-only with zero i18n; G9 shipped full CRUD whose functionality passed live on first try (the i18n loss was an orchestration accident). G8's self-verification of its input map is a behavior the baseline never exhibited. However, F3 confirms the F2 signal: **Composer's blind spots are transactional integrity (partial commits ×2 lanes) and anything only a real DB reveals** — the cross-review + real-DB leg are not optional.

## Longitudinal verdict (3 of 3 waves)

- Escapes: F1 = 0 · F2 = 1 · F3 = 3 (on a much wider, feature-heavy tier with double the fleet size). The protocol's success bar ("F3 with ≤1 escape ⇒ system confirmed") is **NOT met on the raw count**; normalizing for scope (11→14 lanes, 5 greenfield features vs F1's pure fix-tier), the per-lane escape rate is comparable to F2 but the DIRECTION is consistent: every escape this wave belongs to the class "visible only against a real database or real locale files".
- **Verdict: the layout (Układ A + orchestrator gate) is REPEATABLE for fix/hardening tiers and NEEDS ONE STRUCTURAL ADDITION for feature tiers: a mandatory real-DB/live-render leg BEFORE consolidation** (not just live-E3 after deploy). Live-E3 caught 3/3 escapes — the gate architecture works; it is positioned one step too late for feature waves.
- Zero fabrications from ANY engine across all three waves since the tree-proof protocol landed. Bridges: rule-6 imperative fixed Codex (3/3 survived); Cursor bridges without it died 2/5 → extend to all bridges.

## F4 top-5 (mechanize before the next wave)

1. Rule 6 imperative goes in EVERY bridge prompt (both engines), not just codex.
2. Rule 8 sharpened: the real-DB leg must make BEHAVIORAL assertions (fixtures → action → row-state asserts); schema-presence probes don't count. Where feasible, run `pnpm test:pg` against a real DB at the ORCHESTRATOR GATE before consolidation (the escapes lived exactly there).
3. New deploy-break subclass: no `export ... from` re-exports in 'use server' modules — add to SHARED-RULES + an ESLint guard candidate; local `next build` does NOT catch it.
4. i18n sidecars are APPEND-ONLY: fix rounds must merge into the existing sidecar, never rewrite it; the orchestrator verifies key-resolution (grep component-referenced namespaces against merged locale files) before consolidation.
5. Lanes must run the FULL existing test files adjacent to every file they modify (G1 broke a legacy suite it never ran); pg row types in mocks must model driver reality (Date objects, numeric scale strings — the '0.000000' and formatDate classes).
