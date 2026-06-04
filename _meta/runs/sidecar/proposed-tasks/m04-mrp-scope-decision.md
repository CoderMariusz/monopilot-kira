# PROPOSED DECISION/TASK — 04-planning-basic: resolve T-045 MRP scope drift

**Affects:** existing T-045 (Material Demand dashboard + `reorder_thresholds`)
**Type:** scope decision (then either accept-into-PRD or defer)
**Risk tier:** medium (scope integrity; silent un-PRD'd schema)
**Closes:** audit finding 04-F1

## Problem
T-045 implements an **MRP-min-viable** feature (per-RM netting: on_hand + in_transit − reserved vs reorder point) and introduces a **new `reorder_thresholds` table** (min_qty/reorder_qty/preferred_supplier_id). The PRD **explicitly defers** this:
- PRD §"Decyzje odroczone" (lines 186–187): *"MRP/MPS basic calculation engine"* and *"Auto-replenishment rules (reorder points)"* listed as out-of-scope-for-now.
The task itself admits a synthetic anchor: `prd_refs: ["§4 (was §MRP-gap)"]` and `"corrected §MRP-gap to nearest real heading"`. So the coverage table counts a feature the PRD does not authorize.

The task is otherwise well-authored (clear AC, no caching, reuses the existing PO wizard, RBAC noted) — the issue is scope authority, not quality.

## Decision required (pick one)
**Option A — Accept as approved scope addition:** add a real PRD section (e.g. §4.x "Material Demand — minimal MRP netting") that defines `reorder_thresholds`, the netting formula, and the OK/LOW/CRITICAL status bands; update T-045 `prd_refs` to the real anchor; keep T-045 in P1. Adds `reorder_thresholds` to the planning data model officially.
**Option B — Defer to P2:** mark T-045 P2-gated alongside the rest of MRP/MPS; remove it from P1 coverage-complete claims; drop the `reorder_thresholds` migration from P1.

## If Option A — follow-up task
T-068 — Author PRD §Material-Demand-netting + add `reorder_thresholds` to the §5 data-model section; re-anchor T-045; add the grant for `planning.material_demand.read` / `planning.thresholds.write` into the planning permission-seed (m04-rbac-grant-seed).

## Acceptance criteria (whichever option)
- No task claims PRD coverage against a synthetic `§MRP-gap` anchor.
- If A: PRD + T-045 anchors match; `reorder_thresholds` appears in the planning schema task set; perms seeded.
- If B: T-045 carries a P2 gate label and is excluded from P1 readiness math.

## Red lines
- Do not ship `reorder_thresholds` schema to P1 without either a PRD section (A) or a P2 gate (B).
