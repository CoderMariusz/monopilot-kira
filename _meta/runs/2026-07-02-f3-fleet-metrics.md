# Wave F3 — fleet metrics (2026-07-02)

Commits: `4248cbc0` (kickoff docs) + `8a350c80` (wave, 112 files +9,928/−2,153) + `28b58511` (f3.1 Turbopack re-export hotfix). Migs **415/416/417** applied live + recorded BEFORE code push. Base: `4248cbc0`. Gate: tsc=0, ~380 targeted tests green (1 documented pre-existing red: resetPassword), dual-cast scan clean on 88 changed .ts files, local `next build` green. **First Vercel deploy of 8a350c80 ERRORED** (Turbopack rejects `export { x } from` re-export statements in `'use server'` modules — the local build gate does NOT catch this class); f3.1 hotfix → READY `28b58511`. Fleet: 9 engine lanes + 3 Claude lanes + 4 Opus audit lanes (owner expansion; wave 3/3 of the longitudinal eval).

## Lane ledger

| Lane | Writer | Result | Fix rounds | Review verdict |
|---|---|---|---|---|
| G1 CCP auto-hold + inspection effects (REGULATORY) | Codex | GREEN (bridge survived w/ rule-6 imperative); ±634/455 = byte-verified mechanical extraction | 2 (G1b behavioral pg leg + idempotency tests; G1c legacy-test mock repair — G1 broke a test it never ran) | R-G1 Opus **SHIP w/ fixes** (real-DB leg was vacuous → G1b; SHOULD-3 escalation flagged for owner) |
| G2 batch-hold display + mig 415 + deactivate perm union | kira-easy | GREEN (honest: proved pre-existing red via git stash) | 0 | R-G2 Codex **SHIP** (0 findings) |
| G3 real-DB test leg (infra) | Codex | GREEN (bridge survived; honest docker-absent report) | 0 (2 SHOULDs folded in at gate: `--environment node`) | R-G3 kira-easy **SHIP** (live-DB safety confirmed) |
| G4 P2 integrity batch | Composer | GREEN 1st attempt | 1 (G4b: numeric-zero string compare; LP-vs-WO site stamp) | R-G4 Codex **FIX→closed** |
| G5 audit timeline (7 screens) | Composer | GREEN 1st attempt | 1 (G5b: 2× 'use server' type exports; gate-parity authz map; i18n bypass; isolation test) | R-G5 Codex **FIX→closed** (4 BLOCKING) |
| G6 compliance profile + mig 416 | Composer | GREEN 1st attempt | 1 (G6b: partial-commit throw-Abort; isolation test) | R-G6 Codex **FIX→closed** (route-tree placement verified CORRECT) |
| G7 security batch (AUTH) | Codex | GREEN (bridge survived) | 1 (G7b: labor-route oracle miss; sensory→quality.dashboard.view gate swap; type-narrowing) | R-G7 Opus **FIX→closed** (caught an explicit acceptance-criterion miss) |
| G8 RBAC honesty badges | Composer | GREEN; independently REFINED the enforcement map 47→116 (+69 with citations, 4 reverse-corrections) | 1 (G8b: 2 UI-only-gate misclassifications; phantom regen script) | R-G8 Codex **FIX→closed** |
| G9 customer master slice + mig 417 | Composer | GREEN (largest lane: 15 files +2,294) | 1 (G9b: default-address partial unique mig; clear-then-set Abort; live-doc deactivate guard) | R-G9 Codex **FIX→closed** (3 BLOCKING — txn integrity) |
| G10 desktop GRN + receive-core extraction | Composer | GREEN; bridge independently re-ran the 25 legacy scanner tests | 1 (G10b: core-error type escape 500→400; 'use server' type export; desktop site gate; audit payload fields) | R-G10 Codex **FIX→closed** (3 BLOCKING) |
| A1 audit NPD/Technical/Settings | Opus (kira-research) | delivered /tmp/f3/audit-A1.md — headline NEW: signoff_policies UNENFORCED (P1) | — | — |
| A2 audit Planning/Production/Scanner/OEE | Opus (kira-research) | delivered /tmp/f3/audit-A2.md — headline NEW: calibration ZERO writers (P1); cancelWo-from-completed no WAC reversal (P1); consume/output write no stock_moves | — | — |
| A3 audit Warehouse/Shipping/Quality/Finance | Opus (kira-research) | delivered /tmp/f3/audit-A3.md — headline NEW: wo_actual_costing DROPPED in mig 404 (roadmap 4.8 stale); SO un-ship transitions (P1) | — | — |
| A4 browser CRUD walk (17 entities) | Opus (browser) | delivered /tmp/f3/audit-A4-crud.md — 2 silent CREATE no-ops (User invite, Inspection); customer create-only (fixed by G9 same wave); site-scoping traps | — | — |
| E3-live | Opus (browser) | post-deploy verification of all F3 features | — | (in flight at write) |

Fix-round writers: kira-easy ×9 (G1b, G1c, G4b, G5b, G6b, G7b, G8b, G9b, G10b), orchestrator direct ×3 (GRN-page import conflict, receipt-corrections grep-assertion adaptation, f3.1 Turbopack shim).

## Incidents & engine reliability

1. **Rule 6 WORKED for Codex**: all 3 Codex write bridges (G1/G3/G7) survived with the DIRECT+BLOCKING imperative (F2: 3/4 died). **But 2 of 5 CURSOR bridges died** by backgrounding (G4, G9) — the imperative was only in codex bridge prompts. Jobs kept running; recovered via out-file watcher. → F4 rule: the blocking imperative goes in ALL bridge prompts, both engines.
2. **Codex rogue-daemon struck main mid-wave**: 47 tracked files + 5 planted untracked `*-types.ts` files (a stale NPD types-split diff) replayed onto the main working tree during the wave. Detected at consolidation preflight (tree-verify), surgically reverted per the known procedure. The owner's untracked pile was untouched.
3. **Orchestrator self-inflicted**: the i18n sidecar merger had a missing `cur = nxt` descent bug — wrote leaf keys at JSON top level. Caught by post-merge verification probe; locale files restored from HEAD, merger fixed, re-run clean (61 keys en+pl + ro/uk EN-mirror).
4. **New deploy-break subclass discovered**: `export { x } from` re-export statements in `'use server'` files pass tsc AND the LOCAL `next build`, but fail Vercel's Turbopack. The class list grows: (a) type exports [known], (b) re-export statements [NEW — f3.1]. Local build is NOT a sufficient gate for (b).
5. **Composer quality**: 6/6 lanes rc=0 single attempt, zero fabrications; G8 independently improved its own input (enforcement map 47→116 with citations). Every Composer lane still needed exactly one review fix round — the cross-review remains load-bearing.
6. **Codex quality**: zero fabrications; G2/G3 exemplary honesty. G1 shipped a vacuous "integration test" (schema-presence only) for the mandated real-DB leg — rule 8 needs a sharper definition (behavioral assertions, not schema probes) — and broke a legacy test it never ran (targeted-test blind spot: lanes must run the FULL test set of files adjacent to what they modify).

## Consolidation

10 patches applied `--3way` onto main: 9 clean (incl. the anticipated G1+G2 hold-actions.ts overlap — merged automatically), 1 conflict (G5+G10 both edited warehouse GRN detail page — trivial import-section merge). One cross-lane test interaction surfaced only on the assembled tree (G4's source-grep assertion vs G10's extraction — assertion adapted to sum both files). i18n merged from 5 lane sidecars. Migs renumbered 417→416, 418→417 for density.
