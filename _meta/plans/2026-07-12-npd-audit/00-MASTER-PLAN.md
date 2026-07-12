# NPD/production repair + consolidation — master plan (2026-07-12, base 034b2808)

Verified by owner + Codex on prod. Two phases: A = discrete bugs (this file's D1-D3), B = NPD consolidation (remove /fg + /npd, fold into /pipeline).
Pipeline per wave: Composer (impl, worktree) → Codex (adversarial review, diff+spec) → Fable (arbitrate + integrate) → PREPARE every new SQL on prod → migration dry-run → tsc/build/tests → deploy → browser E2E with screenshots. Next migration = 489.

## Reconciled findings (owner + Codex)
- **B1 gate checklist** CONFIRMED — auto-satisfy is presentational only (gate-checklist-auto-satisfy.ts, no completed_at write); "initial shared bom ready" is satisfied by ANY ingredient (ingredientCount>=1) not by a real linked BOM (linked_bom_count>0); advance-project-gate.ts checks completed_at IS NULL → mismatch → always forces override note.
- **B4 mandatory override** CONFIRMED — same root as B1: G3 auto-requirements stay completed_at=NULL even when FG+real BOM exist, so server forces override. (Manually-completed G4 works.)
- **B2 line dropdown all-site (Book line time)** CONFIRMED — list-production-lines.ts filters org_id only, no site_id.
- **Extra-2 Create-WO line dropdown all-site** CONFIRMED — wo-form-data.ts loader same class; data already inconsistent (WO-...0011 site makery + line LINE03 of Main Factory).
- **Extra-1 WO scheduled date NULL** CONFIRMED (flaky) — created WOs get scheduled_start_time=NULL though the form shows a date; issue is between create-wo-modal.tsx form state and the action payload (state not updated unless the date input's onChange fires).
- **B3 pilot WO not schedulable** PARTIAL — WO-pilot-FG-016 IS visible in Planning under its real warehouse; but it's DRAFT and scheduler-actions.ts only takes RELEASED → "no open work orders". NPD→production handoff never yields a schedulable WO.
- **Extra-3 draft-chain undeletable** CONFIRMED — C5 guard (correctly) blocks deleting any active-dependency edge, but there's NO cancel-whole-chain affordance, so a fresh draft chain can't be cleaned up.
- **Extra-4 / C1d allergen Override still dead for real users** CONFIRMED — the handler works (JS .click opens the modal) but the Override <button> is covered by an overlapping grid cell (pointer-intercept: adjacent allergen-eu14-cell intercepts the click) → a real user cannot click it. Layout/CSS bug, on both /allergen-cascade and /fg/*/allergens.
- **B5 process module misplaced** PARTIAL — process editor deliberately removed from Recipe (formulation/page.tsx); FormulationWipPanel exists (formulation-wip-panel.tsx) but is mounted NOWHERE; real editor still only in old /fg.
- **B6 WO save error** NOT-REPRODUCED (Codex created WO-...0017 chain fine) — transient; leave unless it recurs. (Its NULL date = Extra-1.)

## Phase A waves (module-separated, parallel)
- **D1 — NPD gate/approval logic (B1+B4).** Files: gate-checklist-auto-satisfy.ts, advance-project-gate.ts, gate page/modal.
- **D2 — Planning/production WO+lines (B2, Extra-1, Extra-2, B3, Extra-3).** Files: list-production-lines.ts, wo-form-data.ts, create-wo-modal.tsx, pilot _actions, scheduler-actions.ts, wo-chain-delete-guard.ts + a cancel-chain action, planning WO detail/list.
- **D3 — Allergen clickability + Recipe WIP mount (Extra-4 + B5).** Files: allergen-cascade-widget.tsx (+ the /fg one), formulation-wip-panel.tsx + Recipe/formulation page to mount it.

## Phase B — NPD consolidation (after A; 3× brainstorm Fable↔Codex)
Remove /fg + /npd VIEWS; keep tables/actions. Move into /pipeline: process assignment + create-WIP + ProdDetail/initial-BOM → Recipe/G3; V01–V08 → shared validation panel + gate blockers; compliance documents → Approval; allergen cascade + sign-off → Recipe+Approval; department-close → stage checklists; D365 build/export → Handoff/Launch (export-only); keep build/doc/audit history. Safe order: (1) move UI into pipeline + repoint links, (2) /fg → temporary redirect/read-only, (3) delete dead code last. Risks: links to /fg, projects without npd_project, FKs to product/prod_detail, npd_wip_processes, compliance docs, in-flight FGs. Goal: NPD end-to-end with zero errors, E2E-verified.
