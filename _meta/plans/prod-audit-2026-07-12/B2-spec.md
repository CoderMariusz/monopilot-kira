# Wave B2 — Production & Quality UI: yield-override path, incoming-inspection RM specs, stale lists, allergen buttons (P1). Prod-repro'd 2026-07-12 (round-2).

Repo: monopilot-kira. THIS worktree only. DISCIPLINE: SQL valid on real PG (columns vs migrations); withOrgContext throws-to-rollback; no non-async export from 'use server'; next free migration = 487 (say LOUDLY).

## B2a (P1) — yield-gate override unusable from UI (frontend thinks gate is green)
Repro: backend correctly rejected completion at 2.6% yield, but the complete modal treated the gate as GREEN — no out-of-tolerance warning, no override-reason picker, no e-sign fields — so the legitimate supervisor override path (A2/C4: overrideReasonCode + overridePin + overrideEsignReason, intent prod.wo.yield_override) is unreachable.
Files: production/wos/[id]/_components/wo-detail-screen.tsx + the complete modal component; the complete route/action response shape (lib/production/complete-cancel-wo.ts error payload `closed_production_strict_failed`).
FIX: (a) the complete modal must PRE-EVALUATE or react to the gate result: when completion fails with closed_production_strict_failed, surface the failure (expected vs actual consumption) and expose the override path — reason code dropdown (yield_gate_override_reasons taxonomy), e-sign PIN + reason fields — then resubmit with the override payload. (b) The gate indicator must not show green when consumption is out of tolerance. Test (RTL): a failed-gate response renders the override form; submitting it passes the override fields to the action.

## B2b (P1) — Incoming inspection specs cannot target raw materials
Repro: inspection INSP-* for ING-FLOUR has 0 parameters; the Incoming quality-specification product selector only offers FG/WIP items — RM/ingredient can't be configured → Pass/Fail/Hold permanently blocked for raw materials.
Files: quality specifications screens/_actions (grep the item-picker filter: likely `item_type in ('fg','intermediate')`).
FIX: the Incoming spec product selector must include rm/ingredient/packaging item types (incoming inspection is FOR raw materials). Verify the parameter-resolution path (A5 S15 helper lib/quality/resolve-inspection-parameters.ts) then also resolves specs for RM items. Test: an RM item is selectable and its spec parameters resolve on a new inspection.

## B2c (P2) — stale lists after mutations: inspections, holds, products
Repro: after mutations the lists stay stale until manual reload. FIX: add revalidation after the mutating actions for quality inspections, quality holds, and (coordinate: products list is Wave B3's module — only do inspections+holds here). Same pattern as A3 S4 (revalidateLocalized). Test/assert revalidate fires.

## B2d (P2) — allergen-cascade Override buttons unresponsive
Repro: Override buttons in the allergen cascade do nothing on click. Files: the allergen cascade component (npd). Root-cause (missing handler? disabled state? swallowed promise?) and fix so Override triggers its action + updates state. Test: clicking Override calls the action.

## Requirements
Read fully, grep callers, choke-point fixes. Tests per finding. Gates: tsc clean + touched vitest green; full build if 'use server' shape changes. Summary → _meta/plans/prod-audit-2026-07-12/B2-summary.md (+ paste any NEW SQL). No git add -A, no commit.
