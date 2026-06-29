# 2026-06-29 — NPD owner test findings: shipped bug fixes + the WIP/process redesign

Owner manually tested the NPD lifecycle (project NPD-012 / FG-NPD-012). This tracks the
fixes already shipped and the NEW items, including a feature-sized production-model redesign.
Owner directive: fix the new bugs with **Codex** + **cross-model review** (kira-codex-review);
report when everything is done.

## SHIPPED + PUSHED (live, HEAD d37ebc9a)
- **Bug 5/6 (be66456e):** `materializeNpdBom` PRODUCTION_CODE_CONFLICT when the FG item exists
  with `npd_project_id=NULL` (unclaimed). Now an unclaimed npd item is adoptable, not a conflict.
  → Handoff → "Generate production BOM" works from the locked recipe.
- **Bug 2 (7315a826):** approval `evaluate.ts` now reads the highest LOCKED formulation version,
  not `current_version_id` (which moves to the newest draft → false 'pending').
- **Bugs 1/3/4 (d37ebc9a):** per-version submit-trial (submitStatus reset on version switch);
  nutrition/costing links on the formulation stage + a `docs` link on the FG tab bar; "Reopen
  {dept}" affordance wired to reopenDeptSection; Finish WIP table made read-only.

## KEY CLARIFICATION — two BOM paths (owner kept using the wrong one)
- **Technical → BOM → "Generate BOM batch"**: an XLSX EXPORTER of EXISTING BOMs, gated on
  `fg_npd_ext.status_overall='Complete'` (all FG dept sections closed). FG-NPD-012 is NOT
  complete (closed_*=NULL) → does not appear. THIS IS NOT the recipe→BOM creator.
- **NPD → pipeline → Handoff → "Generate production BOM"**: the real recipe→BOM materialiser
  (RM lines from the locked formulation + factory spec). Needs only a LOCKED recipe (FG-NPD-012
  has 2 locked versions w/ 3 ingredients). THIS is where the owner generates the BOM.
- Bug "D" (FG not visible in the Technical batch) is downstream of FG-not-complete, which is
  blocked by the production-tab/WIP issue (Bug B below). Resolved either by using Handoff now,
  or by the WIP redesign letting the production tab close.

## NEW SMALL BUGS (Codex + review)
- **A — "Closed Commercial" renders as a free TEXT field; should be a yes/no DROPDOWN.** The
  closed_* dept-close flag (boolean yes/no) is rendered as text. Likely the dynamic field render
  (data_type 'boolean' → yes/no select) OR the closed-flag control in the Commercial section.
  Locate the render of the closed_commercial value on the FG detail and make it a yes/no dropdown.
- **E — Settings → NPD Fields → "Edit field" → "Data type" must be a DROPDOWN** (it's a fixed
  enum: text/integer/number/date/datetime/boolean/dropdown/formula). Currently a text input.
  File: settings/npd-fields edit form (createField/updateField UI). Make data_type a <select>.

## NEW FEATURE-SIZED REDESIGN — production WIP/process model (Bug B + C)
Owner's spec (verbatim intent):
- The Production tab currently shows **4 hardcoded read-only "PR" process cells** → CLEAR all of
  that. The owner cannot close the Production tab because there is a PR they cannot create, and a
  "dieset"/diet that isn't selectable.
- Replace with: **Ingredients (ING) + Raw Materials (RM) needed**, plus a **dynamic list of
  PROCESSES** that can be performed on each component — add/split processes dynamically (a process
  table you add rows to), NOT 4 fixed processes.
- **Rename PR → WIP** (universal name). Each operation produces a **WIP product** whose **price =
  process cost + RM cost + yield + process cost** (WIP item costing rolls up RM + process + yield).
- This removes the surplus unnecessary fields + validation that currently block closing Production.
- **FG**: select a production **line** + select the final output. 
- **Recipe yield (Bug C):** the recipe ingredient quantities sum EXACTLY to the pack weight
  (e.g. 0.38 + 0.1 + 0.02 + yeast = 200 g). That is acceptable as the NOMINAL recipe, BUT REAL
  consumption must factor per-ingredient **YIELD**: if water has 80% yield and "make" has 90%
  yield, real consumption = nominal_qty / yield. The BOM / consumption must apply per-component
  yield to compute true RM usage (and cost).

### Why this matters
This redesign is the ROOT of "can't complete the FG" → "FG not in Technical BOM batch" (Bug D).
It also makes the production cost real (WIP intermediates + yield-adjusted RM).

### Rough shape (to confirm/refine before/while building — Codex slices + review)
1. Schema (migration): a `wip_processes` / process-routing table per project/component (process
   name, applies-to component, sequence), process cost, per-component yield %. Possibly WIP item
   generation. Reuse existing prod_detail or replace it.
2. Production tab UI: remove the 4 hardcoded PR cells; render ING + RM (read-only, inherited from
   recipe) + a dynamic add/remove process table per component; remove the blocking validation +
   the un-creatable PR + the diet selector blocker so the tab can be CLOSED.
3. Costing: WIP price = RM cost + process cost, yield-adjusted; surface on the component.
4. Consumption / BOM: apply per-component yield (real_qty = nominal_qty / yield) in
   materializeNpdBom RM lines + any consumption rollup.
5. FG: line picker + final-output selection on the FG/handoff.

### Status: NOT yet built. Multi-step; spans schema + UI + costing + BOM. Build via Codex
(small slices, 3-5 files each) + kira-codex-review per slice; Claude runs build/test gates +
migrations. Likely spans a context reset — this doc + memory carry the spec.
