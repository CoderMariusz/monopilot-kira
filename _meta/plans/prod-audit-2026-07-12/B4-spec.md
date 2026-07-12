# Wave B4 — NPD & authorization config: WIP costs persist, authorization-policy seed, gate-checklist display (P1). Prod-repro'd 2026-07-12 (round-2).

Repo: monopilot-kira. THIS worktree only. DISCIPLINE: SQL valid on real PG (columns vs migrations); withOrgContext throws-to-rollback; no non-async export from 'use server'; next free migration = 487 (say LOUDLY; it WILL auto-apply on Vercel — must be idempotent + additive + live-safe).

## B4a (P1) — manual WIP ingredient costs show "Saved" but do not persist
Repro: in the NPD formulation, entering a manual cost for a WIP ingredient shows "Saved" and recomputes the total, but after refresh the value is gone. This also blocks S19 end-to-end (submit-for-trial stops on MISSING_COST).
Files: NPD formulation cost actions (grep cost_per_kg_eur writers; formulation_ingredients update action; the "Saved" toast source).
FIX: root-cause the persistence gap — likely the action updates a different row/column than the loader reads (WIP-sourced ingredient rows may resolve cost from the WIP item, not the manual column), the write is swallowed (withOrgContext returns non-throw on failure), or the optimistic UI never awaits the server result. Make the manual cost persist and reload consistently; a failed write must NOT show "Saved". Test: setting a manual cost on a WIP ingredient survives a reload (loader returns it).

## B4b (P1) — org_authorization_policies records missing → S22 dual-sign unconfigurable
Repro: the Authorization screen shows "seed missing / misconfigured" because BOTH required org_authorization_policies rows are absent for the org → cannot set min_approvers/dual-sign at all.
Files: check migrations for org_authorization_policies (find the table + expected policy keys the Authorization screen reads — grep the screen's loader for policy names). The A6 work added server-side validation but assumed rows exist.
FIX: additive idempotent migration 487 seeding the required default policy rows per org (cross-join organizations, ON CONFLICT DO NOTHING — mirror the mig-486 downtime/waste seed pattern), with safe defaults (min_approvers=1, dual_sign=false). ALSO make the Authorization screen resilient: if a row is missing it should offer to create/init it rather than dead-end "seed missing". Test: migration test (pattern of 486 test) + screen loads with seeded rows.

## B4c (P2) — gate checklist item shows "Not started" after checking
Repro: checking a checklist item updates the checkbox and the counter, but the item's status text stays "Not started". Files: NPD gate checklist component. FIX: derive the per-item status text from the same state as the checkbox (completed_at / checked), not a stale field. Test: checked item renders completed status.

## B4d (P2) — fixture repair for reviewer E2E (seed file, not app code)
The repo seed _meta/plans/prod-audit-2026-07-12/seed-e2e.sql has two gaps found by the reviewer: (a) E2E-A-S8-TIMESTAMPS is RELEASED but lacks a factory-release snapshot so Start is impossible — find what factory-release writes (grep factory_release / release snapshot tables) and add the minimal rows to the seed so Start works; (b) the S19 NPD project lacks brief/costs so submit-for-trial still fails on MISSING_COST — extend the seed to fill the locked version's ingredient costs (formulation_ingredients.cost_per_kg_eur) and any required nutrition targets for project 21e26d40-8cf2-47d4-bfeb-9aad3fddc14c version a7b32f4e (check the gate query in submit-for-trial.ts for exactly what it needs: total_pct 99.99-100.01, no NULL cost, nutrition targets present in formulation_calc_cache). Keep the seed idempotent.

## Requirements
Read fully, grep callers. Tests per finding. Gates: tsc clean + touched vitest green; full build if 'use server' shape changes; migration 487 must dry-run clean (begin; \i; rollback). Summary → _meta/plans/prod-audit-2026-07-12/B4-summary.md (+ migration SQL + any NEW SQL pasted verbatim). No git add -A, no commit.
