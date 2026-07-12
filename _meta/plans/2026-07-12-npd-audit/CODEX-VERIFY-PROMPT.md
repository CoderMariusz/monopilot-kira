# Codex — independent verification of NPD/production bugs (monopilot-kira, prod 034b2808)

You are an independent reviewer. Do NOT fix anything. For EACH item below: reproduce it on prod (real browser) and/or read the code, then state **CONFIRMED / NOT-REPRODUCED / PARTIAL**, with the file:line root cause and a one-line repro. At the end, give your independent opinion on the NPD-consolidation question.

**Env:** https://monopilot-kira.vercel.app · login `admin@monopilot.test` / `Admin2026!!!` · org **Apex 22** (`00000000-0000-0000-0000-000000000002`) · top-bar site currently "test site". DB (read-only): `DATABASE_URL_OWNER` in `.env.local` (sslmode no-verify→require). Repo: this checkout on `main`.

## Context: there are TWO parallel NPD systems (the core complaint)
1. **`/pipeline/[projectId]`** — the "project" system: brief, formulation, approval, packaging, costing, handoff, trial, gate, pilot, sensory, nutrition. KEEP.
2. **`/fg/[productCode]` + `/npd`** — a SECOND "department-workspace" FG system: Core/Commercial/Production department tabs, D365 build, compliance docs (`_components/fa-*`, screens 3 & 4). The owner wants this REMOVED and its remaining useful logic (process assignment, create-WIP-from-process, compliance docs) folded into the `/pipeline` project stages.

## Bugs to verify

**B1 — NPD gate: required stage checks can't be completed.** Gate advance (`pipeline/[projectId]/gate` → `_actions/advance-project-gate.ts`, `_modals/advance-gate-modal.tsx`) shows "Required stage checks are incomplete — add an override note" listing e.g. "FG candidate created or mapped", "Initial shared BOM ready and linked". There is NO UI to actually COMPLETE those checklist items — so the gate always forces an override note. Verify: is the checklist-completion path missing/mis-wired, and are the gate requirements evaluated against real state (FG created, BOM linked) or a field that's never set?

**B2 — line dropdown ignores selected site.** Production "Book line time" modal → "Production line" dropdown lists lines from ALL warehouses/sites (BAKE, LINE01×3, Oven Line, Assembly, Packing Line 1, LINE11…) even though the top-bar site is "test site". Verify the line-options query is not filtered by the active site context.

**B3 — NPD-created WO invisible in Planning + not schedulable.** The pilot stage (`pipeline/[projectId]/pilot`) creates a WO named `WO-pilot-FG-016`; it appears under "WO alerts" ("Past scheduled start and not yet running") but Planning → Work orders shows an EMPTY table and "Schedule run" does not position it on a line. Verify: pilot-created WOs are filtered out of `listPlanningWorkOrders` / the scheduler (site/status/source_of_demand mismatch?), so NPD WOs are orphaned from planning.

**B4 — approval demands an override note even when checks are satisfiable.** Approval should pass WITHOUT an override note once the required items are actually completed in the system; today it always requires the note (tie to B1 — the checks can't be satisfied, so override is the only path). Verify whether a genuinely-complete stage still forces the note.

**B5 — "process" module moved to the wrong place.** The process module that belongs under Recipe/Receipt disappeared and now renders under **Planning → Work orders** where it does not belong. Verify where the process UI/actions are mounted vs where they should be (recipe stage), and whether it leaked into planning/work-orders.

**B6 — WO creation fails: "Something went wrong saving."** Create work order for FG0014 Butter Shortbread (chain: FG 300 kg consumes WIP-20260707-0006 252 kg), order unit box, qty 200, scheduled start 12/07/2026, line "LINE01 — LINE 1 BAKE" → the modal returns "Something went wrong saving. Please retry shortly." Verify the failing server path (createWorkOrder / create-work-order-chain / core) — capture the real error (Vercel runtime logs for the window, or the returned error code). NOTE: a simpler FG0014 chain create succeeded earlier this week, so this may be a specific-input regression (box UoM 200, this line, or a recent migration 486/487/488). Find the actual cause.

## Consolidation question (opinion, not a fix)
Given the two systems above, is removing `/fg` + `/npd` (the department-workspace FG system) and consolidating ALL NPD into `/pipeline/[projectId]` — including process assignment, create-WIP-from-process, and compliance documents as project stages — the right call? List what unique logic in `/fg` must be preserved (D365/build, validation V01–V08, department-close, compliance docs, allergen cascade) and where in the pipeline it should live, and the top risks of the removal (data references, links, in-flight FGs).

## Output
A table: item → CONFIRMED/NOT-REPRODUCED/PARTIAL → root-cause file:line → one-line repro. Then the consolidation opinion. Reproduce with real interactions where possible; read code to confirm root cause. Do NOT edit code.
