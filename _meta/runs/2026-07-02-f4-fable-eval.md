# Wave F4 — Fable evaluation (2026-07-02)

Companion to `2026-07-02-f4-fleet-metrics.md`. Chain: `273246b7` (wave) → `ee604b7b` (f4.1) → `95e156d8` (f4.2).

## Lane grades (correctness / idiom / tests / scope)

| Lane | Writer | C | I | T | S | Note |
|---|---|---|---|---|---|---|
| H1 | Codex | 3 | 4 | 3 | 3 | Chokepoint architecture excellent (non-bypassable, fail-open semantics right) — but wired to BRICK the only live consumer and no-op for its two chartered ones; R-H1 (Opus) caught both pre-ship. The heaviest FAIL→fixed of four waves. |
| H2 | Composer | 4 | 3 | 4 | 5 | Full writer set first try; G5-class i18n bypass recurrence + no-reactivation + raw selects cost it. |
| H3 | Codex | 5 | 5 | 5 | 5 | Best lane: transitive closure held under adversarial proof; escape hatch airtight; zero findings. |
| H4 | Codex | 5 | 4 | 3 | 5 | Money math proven exact by the reviewer on a reconstructed DB; but claimed a "passing" pg leg that could not run (fixture defects) — the claim mattered more than the code. |
| H5 | Composer | 4 | 4 | 4 | 4 | Both root causes traced precisely; the deeper backend failure (outbox CHECK) was beyond its brief and surfaced properly by its own silence fix. |
| H6 | Composer | 4 | 4 | 4 | 4 | Good top-bar seam reuse; the count-detail cross-site stock leak was a real security miss caught in review. |
| H7 | Codex | 5 | 4 | 3 | 5 | Correctly overrode an impossible brief instruction with schema evidence; pg leg shipped as a constraint probe (rule-12 miss), upgraded in H7b. |
| H8 | Composer | 4 | 4 | 4 | 5 | All 3 truncation caps + clean math structure; sibling over-count + mixed-visibility delta (2 HIGH) caught in review. |
| H9/H12 | kira-easy/Codex | 5 | 5 | 4 | 5 | Honest escalation of the non-trivial item; clean conventions. |
| H10 | Composer | 3 | 4 | 4 | 4 | Self-flagged the outbox gap (good) but violated rule 13 AGAIN and its reactivate shipped dead against real data (blocked by H5's pre-existing id-mismatch + its own dialog swallowed the error — the exact silence class the wave was fixing). |
| H11 | Codex | 5 | 5 | 5 | 5 | P0 killed cleanly; characterization proven; every caller mapped. |

**Wave GPA ≈ 4.1** on the widest tier yet (12 lanes).

## Escapes (longitudinal metric, waves F1→F4: 0 · 1 · 3 · 1)

- **1 genuine new-code escape**: H10's reactivate dead on arrival (interaction with a pre-existing id-mismatch + its own silent dialog). Caught by live-E3 re-test; f4.2 same-session.
- NOT escapes: the user-create/invite failures were **pre-existing production bugs** (unlisted outbox event since the feature's birth — the true root of F3's "silent no-op" finding — and a session client on an admin API); F4's H5 exposed them by design. Root-caused via Supabase logs, fixed in f4.1 (mig 420), re-test PASS.
- Caught pre-ship by review (would have been catastrophic escapes): R-H1's changeover-bricking + inert consumers; R-H6's cross-site stock leak; R-H8's recall-math over-count.
- The rule-set worked: rule 11 kept 5/5 Cursor bridges alive (2/6 Codex still died — imperative helps, doesn't cure); rule 13 prevented a deploy break at build (0 Turbopack surprises); rule 14 kept i18n whole (0 raw-key regressions); rule 15 was violated twice and both were caught at the gate/review.

## Verdict

F4 confirms the F3 verdict with the trend improving: **feature-tier waves are repeatable when (a) the Opus review layer guards REGULATORY/MONEY lanes and (b) live-E3 runs with a fix-and-re-test loop.** The remaining structural gap is unchanged: a real-DB leg at the gate (blocked locally by no-docker + Supabase FORCE-RLS; F5 infra item — Supabase branch or docker test DB). Second insight: **live-E3 keeps finding pre-existing production bugs** (2 this wave) — the app benefits from E3 even where the wave's own code is clean.

## F5 top-5

1. Provision the gate's real-DB leg (Supabase branch / local docker) — the single highest-leverage gap, 3 waves running.
2. Patch extraction is now PATH-SCOPED to the lane's declared file scope (daemon contaminated a worktree this wave; size-anomaly caught it — make the scoping mechanical).
3. Rule-13 ESLint guard (no type exports / re-exports in 'use server') — violated by generation twice despite SHARED-RULES; automate (roadmap 1.15).
4. New-dialog checklist: every new modal ships with a failure-envelope RTL test (H10's dialog proved authors repeat the silence class in fresh code).
5. WAC integrity wave (B-reconciliation P0s: add-only pool — no debit on consume/ship; unit corruption at direct-adjust/count/destroy call sites) — the largest remaining money-correctness theme.
