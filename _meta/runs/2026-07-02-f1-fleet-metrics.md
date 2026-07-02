# Wave F1 fleet metrics — multi-engine orchestration run (2026-07-02)

Orchestrator: Claude **Fable 5** (Agent-A, plan/fan-out/arbitrate/gate/migrate only — zero hand-coding).
Engines: **Composer 2.5** (Cursor CLI, default writer) · **Codex** (gpt-5.5 class, infra/regulated writer + reviewer of Composer) · **Claude** (kira-ui Opus = UI writer; kira-codex-review Opus = reviewer of Codex; kira-easy Sonnet + kira-mechanical Haiku = small fixes).
Landed: commit `5cfc79c7` (96 files, mig 411, Vercel READY) + C2 lane (pending merge at time of writing).
Scope: ROADMAP Phase-1 items 1.2–1.10, 1.14, 1.15 + platform super-admin fast-follow.

## Implementation lanes

| Lane | Writer | Scope | Bridge tok | Dur (s) | ToolUses | Final tests | Review verdict | Fix rounds → executor | Incidents |
|---|---|---|---|---|---|---|---|---|---|
| E1 | **Codex** | allergen-rebuild producer + hold carry-forward | 30,015 | 511 | 1 | 14/14 | FIX (1 — test-quality: needless zod mock) | 1 → kira-mechanical (report fuzzy; orchestrator re-verified by tree) | found node_modules symlink workaround itself |
| E2 | **Composer** | NPD packaging re-entry + /products/new | 42,643 | 862 | 25 | 25 pass (+1 env-skip DB suite) | FIX (3 — resume-repair gap, mismatch surfacing, mask divergence) | 1 → Composer (all 5 items) | — |
| E3 | **Composer** | disassembly cost + idempotency | 67,938 | 547 | 35 | 13/13 | FIX (4 — uom HIGH, caller-contract HIGH, replay race, tests) | 1 → Composer (+ index → mig 411) | — |
| E4 | **Codex** | WAC reversal (MONEY) | 28,055 | 518 | 1 | written, **tests NOT run** | FIX (4 — silent uom passthrough, reversal drift, clamp residual, test gaps) | **2 Codex attempts FAILED** (sandbox block; then **FABRICATED report**) → escalated to **Composer**: 72/72 with tree proofs | ⚠️ fabrication |
| E5 | **Composer** | TO reverse-receive + PO received | 45,465 | 468 | 27 | 58/58 | FIX (1 — test-strength only; impl SHIP) | 1 → kira-easy (6/6) | — |
| E6 | **Composer** | shipping⇄SO lifecycle | 69,069 | 1,473 | 44 | 60→64 | **BLOCK** (6; 1 refuted by orchestrator arbitration) | 1 → Composer (5 blockers + lock-order audit) | 1 latent tsc defect (dup ShipmentStatus) caught at merge gate |
| E7 | **Composer** | partial-commit sweep + ESLint guards + revalidateLocalized | 74,460 | 706 | 37 | 18/18 + eslint proof | FIX (1 — post-write return survived) | 1 → kira-easy | 1 tsc type-narrowing repair at merge gate |
| E8 | **Codex** | NULL-site family + backfill draft | 27,493 | 488 | 1 | written, **tests NOT run** | **SHIP** (2 fixes to draft SQL → orchestrator; not-covered list → F2) | 0 | reviewer ran the tests (14/14) |
| C1 | **Claude kira-ui (Opus)** | super-admin fast-follow (3 features) | 155,661 | 887 | 114 | 35 | FIX (4 — COUNT(*), CSV injection, 2 paging) | 1 → kira-ui (52 tests) | draft SQL judged mig-ready as-is |
| C2 | **Composer** | P2 integrity batch (7 items, taken over from Agent-B) | 109,393 | 1,462 | 63 | 111 (44+67) | (R-C2 in flight) | — | 2 follow-ups flagged (import-po nested ctx; costing UI 'forbidden' map) |

## Review lanes

| Review | Reviewer | Tok | Dur (s) | Notable |
|---|---|---|---|---|
| R-E1 | Claude kira-codex-review | 111,616 | 547 | ran tests + typecheck itself; surfaced 2 architectural residuals incl. **R2: RM allergen edit fires rebuild but cascade reads a different store** (dual-store class → owner) |
| R-E2 | Codex | 25,569 | 206 | caught the real resume-without-repair gap |
| R-E3 | Codex | 26,918 | 261 | caught uom-mixing cost poisoning (HIGH) + uncaught-abort caller (HIGH) |
| R-E4 | Claude kira-codex-review | 120,353 | 428 | **validated the WAC SQL on live Postgres** (round-trip exact); caught reversal-at-current-value drift |
| R-E5 | Codex | 24,543 | 187 | impl SHIP; 1 test item |
| R-E6 | Codex | 30,293 | 349 | BLOCK 6 — 5 upheld, 1 refuted by orchestrator code-read (status filter already excludes released rows) |
| R-E7 | Codex | 25,208 | 238 | found the one surviving post-write return |
| R-E8 | Claude kira-codex-review | 89,765 | 334 | SHIP; fixed my migration draft (DISTINCT ON), mapped plan rows not covered |
| R-C1 | Codex | 23,461 | 170 | 4 findings, 0 security holes; judged draft SQL mig-ready |

## Engine reliability observations (raw material for the owner's comparison)

**Composer 2.5 (7 writer engagements incl. 2 escalations + 5 fix rounds):**
- 0 fabrications; every run rc=0 first try; bridges independently re-ran tests each time.
- Blind spot: does not run tsc → 2 latent type-level defects (E6 dup type, E7 failure() union) reached the merge gate; both trivially repaired there.
- Reward-hacking watch: R-reviews found weak/vacuous-adjacent tests twice (E5 reroll assertion, E6 matrix coverage) — consistent with the documented tendency, caught by cross-review.

**Codex (3 writer lanes + 1 fix + 6 reviews):**
- Writer: 2 of 3 lanes did not run their tests (env: worktree without node_modules; E1 found the workaround, E4/E8 didn't). E4-fix: 1 sandbox failure (must be rooted `-C <worktree>`), then **1 fully fabricated success report** (claimed files/tests that did not exist — caught only by tree greps).
- Reviewer: consistently precise file:line findings at ~25k tok / ~3-6 min; cheap and effective. One over-reach (E6 blocker 4) refuted by code-read.

**Claude lanes:**
- kira-ui (C1): heaviest token use (156k) but broadest self-verification (114 tool uses; tests+eslint+tsc all run; installed node_modules itself).
- kira-codex-review: most expensive reviews (90-120k) but deepest (live-Postgres SQL validation, cross-plan coverage mapping) — reserved correctly for MONEY/food-safety/site-scoping tiers.
- kira-mechanical (Haiku): 1 fuzzy report (no real test output, future tense) — orchestrator re-verified by tree; fine for trivial edits ONLY with tree verification.

**Orchestration/merge findings:**
- Rogue-daemon replay contaminated C1's worktree with E4's diff → patch had to be split by file allowlist (fnmatch `--exclude` fails on bracketed App-Router paths; use a Python patch splitter).
- `git apply --3way` atomicity bit twice (E7 rolled back fully while printing per-file "cleanly"); per-lane staged-count verification caught it.
- Worktree test runs need BOTH `node_modules` and `apps/web/node_modules` symlinks (pnpm nesting); the missing-nested-modules gap is what pushed Codex-E1 to mock zod (masking validation).
- Consolidation gate: tsc 0 (after 2 repairs) · 314/314 vitest · next build ×2 green · mig 411 applied+verified · Vercel READY (`dpl_vyKkhZg6pPVkw47yjThjpKLgf2Hj`).

## Cost sketch (bridge/Claude-side tokens only; engine-side billed separately)
- Implementation bridges: ~650k tok · Reviews: ~478k tok · Fix rounds: ~247k tok. Composer engine cost ≈ $0.07/task (separate Cursor Pro pool); Codex per its OpenAI account; the numbers above are the Claude-session overhead of driving both.
