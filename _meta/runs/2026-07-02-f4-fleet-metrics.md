# Wave F4 — fleet metrics (2026-07-02)

Commit: `273246b7` (122 files, +8,880/−636). Migs **418** (outbox CHECK + settings.user.reactivated; verified superset of live: +1/−0) and **419** (signoff_policies status-quo seed for qa.hold.release + qa.ncr.close) applied live + recorded BEFORE push. Base `ae20c5a9`. Gate: tsc=0, ~560 targeted tests, dual-cast scan clean (89 files), local next build green, i18n rule-14 resolution check green (144 keys, 8 sidecars), **Vercel READY first try** (rule 13 held — no 'use server' re-export in the tree). Owner decisions executed: D1-F3 stock_moves=YES (H7), D2-F3 R-G1 approved.

## Lane ledger

| Lane | Writer | Result | Fix rounds | Review |
|---|---|---|---|---|
| H1 signoff enforcement (REGULATORY) | Codex | bridge DIED (backgrounded despite imperative); tree-quiescence + V-H1 GREEN | 1 heavy (H1b: changeover-bricking regression + inert consumers + mig 419) | R-H1 Opus **FAIL→fixed** — the wave's best catch: the chokepoint would have BRICKED allergen changeovers AND silently no-opped for its two chartered consumers |
| H2 calibration writers | Composer | GREEN 1st attempt | 1 (H2b: no reactivation path; G5-class i18n bundle RECURRED; raw selects) | R-H2 Codex **FIX→closed** |
| H3 SO transition narrowing | Codex | GREEN (bridge survived) | 0 | R-H3 Opus **SHIP** (transitive closure proven; flag unreachable from client) |
| H4 WAC pair (MONEY) | Codex | GREEN (bridge survived) | 1 (H4b: pg harness role_id + set_config→set_org_context) | R-H4 Opus **FIX→closed** (reviewer locally PROVED the money math on a reconstructed DB) |
| H5 silent no-ops | Composer | GREEN 1st attempt; both root causes traced to file:line | 1 (H5b: staging-bundle keys; canonical role-policy module — closed a real invite.ts divergence; F3 honestly BLOCKED) | R-H5 Codex **FIX→closed** |
| H6 all-sites traps | Composer | GREEN 1st attempt | 1 (H6b: count-detail cross-site stock leak → header/lines split) | R-H6 Codex **FIX→closed** (BLOCKING leak caught) |
| H7 stock_moves ledger (MONEY, owner D1) | Codex | bridge DIED; V-H7 GREEN (move types cited from mig-193 CHECK; deterministic idempotency) | 1 (H7b: pg leg upgraded from constraint-probe to real-writer behavioral) | R-H7 Opus **SHIP** w/ 2 follow-ups (movements double-representation → warehouse owner; ruled Codex correctly overrode an impossible brief instruction) |
| H8 trace mass-balance + truncation | Composer | GREEN 1st attempt; bridge independently verified all 3 caps | 1 (H8b: sibling co-product over-count; mixed-visibility delta fabrication → scopeLimited) | R-H8 Codex **FIX→closed** (2 HIGH in recall-evidence math) |
| H9 smalls | kira-easy | 3 FIXED + 1 honest BLOCKED (escalated → H12) | 0 | orchestrator gate review |
| H10 user lifecycle | Composer | GREEN; self-flagged the outbox CHECK gap pre-ship | 1 (H10b: rule-13 types AGAIN; mig 418; session revocation — **the long-red resetPassword revocation test is finally green**; seat FOR UPDATE) | R-H10 Codex **FIX→closed** |
| H11 startWo self-heal P0 (pulled from B-reconciliation) | Codex | GREEN (bridge survived); pure fail-closed shipped | 0 | R-H11 Opus **SHIP** (verified no flow can produce NULL-at-start; import path checked) |
| H12 deleteDraftWo | Codex | GREEN (PO/TO convention mirrored; audit-preserving physical delete) | 0 | R-H12 kira-easy **SHIP** |

Verify passes: V-H1, V-H7 (kira-research, after bridge deaths). Fix-round writers: kira-easy ×8, Codex ×1 (H1b), orchestrator direct ×1 (ESignPolicyError mock stubs in 2 legacy test files — a cross-lane assembled-tree interaction). B-reconciliation lane merged Agent-B's 10 docs: 28 net-new gaps (3 P0: startWo self-heal → H11 this wave; WAC add-only + WAC unit corruption → F5), confirmed B touched only isolated worktree branches (main clean), enumerated F4-collision serialization (absorbed as backlog, no active collision).

## Incidents

1. **Bridge deaths 2/6 Codex + 0/5 Cursor** (H1, H7 — WITH the rule-11 imperative). The imperative reduces but does not eliminate; recovery playbook (quiescence watcher → V-pass) now routine. Cursor bridges 5/5 survived with the imperative (F4 first wave applying rule 11 to them).
2. **Rogue daemon struck TWICE more**: main preflight clean, but the H1 WORKTREE was contaminated (76-file stale-diff replay + 3 planted files) — caught at patch extraction by size anomaly (554KB for a +316-line lane); patch rebuilt path-scoped. Worktrees are now also daemon territory: F5 rule candidate — extract patches path-scoped to the lane's declared file scope.
3. **Rule 13 violated by Composer despite SHARED-RULES stating it** (H10 type exports) — caught in review. The rule needs an automated check (ESLint guard candidate from roadmap 1.15).
4. **G5-class i18n local-bundle bypass recurred** (H2) — caught in review; the staging-bundle convention (module-local `_meta/i18n-staging/*.json` + orchestrator merge) is now the documented pattern.
5. **Rule-12 environmental limit**: the fixture-seeding pg suites cannot run against live Supabase (FORCE RLS on tenants blocks owner-pool seeding; no docker locally). Compensations this wave: R-H4's reviewer PROVED the money suite on a locally reconstructed schema; live-E3 exercises real paths. F5 infra item: dedicated test DB (Supabase branch or docker) for the gate's pg leg.
6. Assembled-tree interaction: H1's ESignPolicyError import broke 2 legacy test mocks that no lane ran (rule 15 miss) — fixed at gate, 20/20.

## Review scoreboard

12 reviews: 5 SHIP (H3, H7, H11, H12, + R-G2-style clean), 6 FIX→closed, 1 FAIL→fixed (H1 — both findings would have shipped a regulatory regression + a decorative feature). Every Opus review on Codex MONEY/REGULATORY work found something material. Cross-review remains the load-bearing component.
