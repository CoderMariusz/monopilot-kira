# NPD-flow 8 fixes + P0 BOM Generator — execution plan (2026-06-26)

Owner mandate (autonomous): fix 8 NPD-flow problems + CONSOLIDATED-STATUS plan. **Coding → Codex; UI → kira-ui subagent** (preserve orchestrator context). Up to 4 Codex + 1 Claude UI lanes; one task per agent; **browser test every 5 tasks**. i18n is CENTRALIZED — UI agents return needed keys, orchestrator applies them (avoids JSON merge conflicts). Owner starts testing only AFTER the P0 BOM fix is live + browser-verified.

3 read-only research agents produced the specs below (evidence-backed, file:line).

## P0 (gating) — BOM Generator: auto-build production BOM from NPD at handoff
**Reality:** the auto-BOM path EXISTS — `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts`, called via `promoteToProduction → releaseNpdProjectToFactory`. It builds items + bom_headers + RM bom_lines from the latest `state='locked'` formulation. NOT a stub. The Technical "BOM Generator" button = a separate XLSX export (leave it). "New BOM" = manual path for existing products (leave it).
**Gaps fixed (Codex, T-BOM-BE, materialize-npd-bom.ts + result threading):**
1. Code derivation `FG-NPD-002`→`FG-002` (`replace(/-NPD-/i,'-')`), used for items.item_code + product.product_code + bom_headers.product_id; PRODUCTION_CODE_CONFLICT guard.
2. Pack-hierarchy snapshot on items insert (output_uom each/base, net_qty_per_each = pack_weight_g/1000).
3. BOM qty scaling by pack weight (each-level; box needs each_per_box, not in NPD yet).
4. Packaging (PM) lines from `packaging_components` (item_id set; qty = COALESCE(qty_per_pack,1) — **mig 350 added qty_per_pack**).
5. `yieldPromptRequired = !target_yield_pct` threaded up to promoteToProduction.data (+ productionCode + bomHeaderId).
**UI (kira-ui, T-BOM-UI, handoff-screen):** yield/waste prompt after promote (new `updateBomYield` action) + show generated production code + BOM link. Bundle #8 (handoff labels) here (same screen).
**Verify:** browser — run a handoff promote on a ready project → BOM with RM+PM lines, code FG-002, preflight gate still passes. app_user write grants on items/bom_headers/bom_lines/packaging_components CONFIRMED present.

## The 8 owner problems → tasks
1. **Costing roll-up edit/recompute** → recompute action `computeAndSaveInitialBreakdown` ALREADY exists (only shown in empty state). **kira-ui**: add "Recompute" button in the `ready` state of `costing-screen.tsx`. No mig.
2. **Nutrition (C2) + Cost (C3) recompute links** → `computeNutrition` recompute ALREADY exists (only empty state). **kira-ui**: surface "Recompute NutriScore" in `nutrition-screen.tsx` ready state (label `recomputeNutriScore` exists). Cost = same as #1. Fix-links already render on approval `criteria-card.tsx` (pending/warn only).
3. **Docs screen fix-links** → **kira-ui**: thread `projectId` into docs page (1 query: npd_projects.id WHERE product_code) + add a banner on `compliance-docs-screen.tsx` ("C7 requires ≥1 valid, in-date doc") + "Back to Approval →" link.
4. **Configurable approval requirements** (BIGGEST) → criteria C1–C7 are hardcoded in `packages/domain/src/approval/evaluate-criteria.ts`; NO config table exists. **NEEDS MIG** `npd_approval_criterion_config` (org_id, criterion_key, required, threshold_json, display_name) + seed trigger; **Codex** modifies evaluate.ts to read config (required=false → not_required; C3 margin/C2 grade/C4 required from config); **kira-ui** settings page `/settings/npd-approval` (mirror npd-fields). Custom criteria C8+ = later. Owner: microbiological testing optional for small production.
5. **Submit-for-approval modal buttons greyed** → **kira-ui** (T-MODAL): Confirm = `btn btn-primary`, Cancel = `btn btn-secondary`. No logic change.
6. **BOM** = the P0 above.
7. **Missing G1** → INTENTIONAL (G1 Feasibility collapsed into Brief; 2026-06-06 pivot, documented gate-helpers.ts:128 / layout.tsx:77). **kira-ui** (T-G1): make it explicit in the header badge/tooltip when current_gate='G0'. No new gate/step.
8. **Handoff release-gates show raw keys** (`npd.handoff.gate.G4_REQUIRED`) → flat dotted i18n keys vs next-intl v4 nested lookup; renders correct only via DEFAULT_LABELS fallback. **Fix (orchestrator/i18n)**: nest `gate: { G4_REQUIRED, FG_CANDIDATE_REQUIRED, ACTIVE_SHARED_BOM_REQUIRED, FACTORY_SPEC_REQUIRED, V18_OPEN_HIGH_RISK }` in en/pl/ro/uk.json under `npd.handoff`. Bundle with T-BOM-UI.

## Lane plan / batches
- **Batch 1 (running):** Codex T-BOM-BE (P0) · kira-ui T-MODAL (#5) · kira-ui T-G1 (#7). [mig 350 applied]
- **Batch 2:** kira-ui T-BOM-UI (#6 UI + #8 labels) after T-BOM-BE lands · kira-ui #1 costing-recompute · kira-ui #2 nutrition-recompute. → **browser test (5 done)**.
- **Batch 3:** kira-ui #3 docs banner · Codex #4-BE evaluate.ts + kira-ui #4-UI settings page + mig 351 (approval config). → browser test.
- **Batch 4+:** CONSOLIDATED-STATUS buildable items (decision-blocked ones flagged for owner: product→items merge, site scoping, RBAC matrix, mass-balance S4-S6, D365, bulk-import, etc.).

## Migrations (orchestrator applies; Codex never touches migrations)
- 350 ✅ applied: packaging_components.qty_per_pack.
- 351 (pending): npd_approval_criterion_config (#4).
HEAD before this batch = 349.

## Progress log
- 2026-06-26: research done; mig 350 applied; Batch 1 dispatched (T-BOM-BE codex, T-MODAL + T-G1 kira-ui).
