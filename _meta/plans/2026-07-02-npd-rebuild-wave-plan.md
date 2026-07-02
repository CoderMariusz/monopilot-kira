# NPD Rebuild — target model + wave plan (F5 / F6)

Date: 2026-07-02, round-2 rulings 2026-07-03 · Author: orchestrator (Fable) · Status: OWNER-RULED incl. round 2 (D14-D18); only two documented defaults remain in §7
Evidence base: `_meta/audits/2026-07-02-npd/{code-audit.md,browser-walk.md}` (+ screenshots), FG-detail hotfix `ef5b9886`.

## 1. Owner decisions (2026-07-02, verbatim-derived)

| # | Decision |
|---|---|
| D1 | **FG detail edit surface DISAPPEARS.** FG dashboard remains ONLY as a read-only overview of what exists. |
| D2 | **Hierarchy: 8(+1) stages ← departments ← fields.** A department is ASSIGNED TO A STAGE in Settings (e.g. Production→Brief, MRP→Packaging, QA+Technical→Sensory). Department list fully arbitrary (can start with one). Fields are assigned to departments (as today). Stage screens render their departments' fields — "responsywność na wszystkich etapach" = ALL stages render their assigned dept sections. |
| D3 | Field `required` flag stays and is chooseable; required fields gate the stage. |
| D4 | Deleting/disabling a department: **everything disappears, including its stored cells/values and its gate dependencies** (hard cascade). |
| D5 | Stage order stays, **plus ONE NEW stage dot between Packaging and Trial: Costing + Nutrition merged into one screen** (the two hidden sub-routes /costing + /nutrition die as separate pages). |
| D6 | Projects table: clicking the `NPD-xxx` code opens the project. |
| D7 | Recipe **Submit-to-trial** must be ENABLED once a version is locked, and clicking it **creates a draft trial** in the Trial stage. |
| D8 | **Trial → Planning**: a trial is visible in Planning as time to book on a line. |
| D9 | **Pilot → creates a pilot work order `WO-pilot-FG####`**. |
| D10 | BUG: costing "The target margin is negative, so the breakdown cannot be saved" (product `fwef`) — must not dead-end. |
| D11 | **Recipe secondary components**: a component NOT counted toward main yield/composition but COUNTED in cost. Similar table to the packaging one. |
| D12 | **Item substitutes**: rm3 declares substitute rm1 → they work INTERCHANGEABLY in an order: the substitute is an additional consumable source, not required when the primary is available. |
| D13 | General mandate: review the WHOLE NPD module together with Settings and lay it out logically (one coherent progression system). |
| D14 | (R2 2026-07-03) **WIP ≡ recipe.** The Production/WIP process editor merges into the RECIPE stage screen — no separate surface; FG-detail edit surface fully retired. |
| D15 | (R2) **Recipe cascade tree**: a component that is itself a processed item (has its own recipe) renders as an EXPANDABLE tree node in the recipe view, cascading its WIP cost + nutrition into the parent. |
| D16 | (R2) **Gate hardness**: G4/Approval ALWAYS hard (+e-sign); all earlier stage gates SOFT (override-with-note). Per-stage hardness toggle in Settings = LATER (deferred, not F5). |
| D17 | (R2) **D11 secondary components CANCELLED** — concept replaced by component-level SUBSTITUTES: a column on the recipe components table sets a substitute item per component; the substitute may be consumed when the primary is unavailable (if so configured). Supersedes the item-level shape of D12. |
| D18 | (R2) **Trial booking** = a capacity-reducing time block (day + time) on a line, NO WO; scheduling then shows it as a trial on the line. The pilot WO stays the first real WO. |

## 2. Target domain model

```
pipeline stage (9 dots, fixed order)
  Brief → Recipe → Packaging → Costing+Nutrition → Trial → Sensory → Pilot → Approval → Handover
        ▲ department (org-defined, ARBITRARY list; each dept assigned to exactly ONE stage)
              ▲ field (catalog; label/type/help/auto; flags: required, visible)
                    ▲ value (per project; jsonb field_values — NPD v2 S2 store)
```

- **Settings** (`settings/npd-fields`): create dept → assign dept to stage → create fields → assign fields to dept (+required/visible). Delete = hard, cascading values + gate deps (D4). Fix the two UX traps: reactive table refresh after create/delete; the unassign-first delete hint visible inline (not hover-only tooltip).
- **Stage screens**: every stage page renders `<DeptSection>` blocks for each ACTIVE dept assigned to that stage (reuse the FG-detail dynamic-section machinery — `readDeptColumns`/`load-fa-dynamic-sections` generalized to a stage-filtered loader). Existing hardcoded stage content (brief core form, packaging spec tables, trial table) stays ABOVE the dept sections.
- **ONE gate system**: stage advance gate = (a) all `required` fields of that stage's depts filled, (b) auto-derived system checks (see below), (c) e-sign where chartered (G4/approval). The generic manual G-checklist items DIE; approval C1–C7 become the Approval stage's auto-derived gate. Errors always surfaced (no ESIGN silent no-op — browser-walk BREAK#3).
- **Auto-derived checks by stage**: Recipe = version locked; Packaging = ≥1 primary component; Costing+Nutrition = cost computed + NutriScore computed; Approval = C1..C7 equivalents (allergens declared, docs, no open high risks); Handover = production BOM built. All derived from live data, never manual checkboxes.
- **Under-gating fix**: `is_all_required_filled` semantics move to the new gate (empty catalog ⇒ nothing required ⇒ pass is now BY DESIGN, not an accident); `done_mrp OR closed_mrp` dual path collapses into the single gate.
- **Retirements**: FG detail as an *edit* surface (D1 — the FG list + read-only dashboard stay; production/WIP editing merges into the Recipe stage per D14); the phantom `npd_department_field.stage_code` column (dept→stage assignment replaces it); the per-stage dead submit buttons either work (D7) or are removed; gate-modal manual checklists.
- **FG dashboard rebuild**: reads ACTIVE departments only, groups by stage→dept, read-only; a project/FG is "red" only on missing REQUIRED fields that some stage screen actually renders.

## 3. Feature specs (new)

**Secondary components (D11)** — CANCELLED by D17 (round 2). Replaced by component-level substitutes below.

**Substitutes (D12 + D17, component-level)** — the recipe components table gains a SUBSTITUTE column: `substitute_item_id` on the recipe/BOM line (or sibling `recipe_line_substitutes` if >1 per line is ever needed — start with one). Carried into the production BOM at handover. Consumption: a WO material requirement whose line declares a substitute accepts LPs of the substitute item WHEN the primary is unavailable (desktop consume + scanner consume + reverse paths); consumed qty counts toward the same requirement; stock_moves/genealogy record the ACTUAL item consumed; substitute passes the same holds/qa gates. DEFAULTS (owner silent on Q4, applied unless vetoed): allergen-profile mismatch = FAIL-CLOSED at declaration; substitution applies at CONSUMPTION ONLY (no MRP/PO suggestion) in F6. Touches production+warehouse consume paths ⇒ REGULATORY tier (Codex + Opus review).

**Recipe cascade tree (D15)** — a recipe line whose component is itself a processed item (has its own locked/active recipe) renders as an expandable tree node: expanding shows the sub-recipe's components with the sub-item's WIP cost and nutrition rolled up into the parent view. Read-only explosion (no cross-recipe editing from the parent); depth-limited recursion with cycle guard; cost source = the same canonical `v_item_effective_cost` path.

**Trial→Planning (D8)** — submit-to-trial creates a trial draft (D7); the trial becomes a plannable demand visible on the planning board as bookable line-time. Canonical owners respected: `schedule_outputs` = planning; NPD only emits/creates the demand row.

**Pilot→WO (D9)** — "Zaplanuj próbę pilotażową" creates a real WO with mask `WO-pilot-FG####` (org_document_settings mask family), site-scoped, linked back to the project (pilot gate auto-derives from WO existence/completion).

## 4. Bug-fix list (rides with the wave)

1. Costing negative-target-margin blocks save (D10) — allow save with warning OR fix the root computation (fwef repro; likely missing price ⇒ negative margin).
2. ESIGN_REQUIRED 403 silently swallowed by the gate modal (BREAK#3 HIGH).
3. Recipe "Zgłoś do próby" permanently disabled (BREAK#2 HIGH) — becomes D7's live button.
4. Create-wizard promises a recipe draft, none is created (BREAK#1) — auto-create draft v1.
5. Projects table NPD-xxx not clickable (D6).
6. Settings npd-fields non-reactive create/delete; hover-only delete hint.
7. Leftover walk data cleanup: project E2E-NPD-WALK1 (NPD-017) + FG0004.

## 5. Wave breakdown

**F5 — NPD-core (the logical spine).** Lanes (Układ A; writer/review split per rules 1–15):
- **N1** [Codex, schema] mig 421+: `npd_departments.stage_code` (dept→stage) + backfill; hard-delete cascade for dept/field incl. jsonb value scrub (D4); drop phantom `npd_department_field.stage_code`; seed updates (mig-386 family).
- **N2** [Composer, UI] Settings npd-fields rework: stage-assignment picker on dept, reactive refresh, inline delete-hint (§2).
- **N3** [Codex] stage-section engine: stage-filtered loader (generalize `load-fa-dynamic-sections`), per-field save action (RBAC + validation + auto-derive mirror), wire `<DeptSections>` into ALL stage pages.
- **N4** [Codex, REGULATORY — Opus review] gate unification: one gate per stage (required-fields + auto-derived checks + e-sign); kill manual checklists; ESIGN errors surfaced; collapse `done_mrp/closed_mrp` dual path. Hardness per D16: G4/Approval hard, earlier stages soft override-with-note (audit-logged); Settings hardness toggle DEFERRED.
- **N5** [Composer] new stage Costing+Nutrition: merged screen, pipeline dot, routes/i18n, C2/C3 auto-derive; negative-margin fix (D10).
- **N6** [Composer] FG dashboard rebuild (active depts, read-only, stage-grouped) + FG-detail retirement per Q2 answer + projects-table NPD-xxx link (D6).
- **N7** [kira-easy/Composer] recipe flow smalls: wizard auto-draft (bug 4), submit-to-trial enable + trial-draft create (D7/bug 3).
- **N8** [kira-mechanical] cleanup: E2E-NPD leftovers, i18n sidecars, dead code from retirements.

**F6 — NPD-materials + planning integration** (depends on F5 spine; reshaped by R2):
- **M1** [Codex engine + Composer/kira-ui tree UI] recipe cascade tree (D15): recursive cost+nutrition rollup for processed components, expandable tree in the recipe view, cycle guard.
- **M2** [Codex, REGULATORY — Opus review] component-level substitutes (D17): recipe-line substitute column (schema+UI), handover BOM carry, consume-path acceptance (desktop+scanner+reverse), allergen fail-closed guard at declaration, genealogy correctness. (Secondary components CANCELLED.)
- **M3** [Codex] trial→planning capacity block (D8+D18): trial draft books a day+time block on a line REDUCING its capacity, no WO; planning-owner seam respected.
- **M4** [Composer] pilot→`WO-pilot-FG####` (D9, mask + WO create + gate wiring).

**F7 — (unchanged, ex-F5 backlog)**: WAC integrity wave, real-DB gate infra, 28 B-gaps, rule-13 ESLint, UX-branch harvest — see memory `f4-wave-state`.

## 6. Risks / guardrails

- Canonical owners: `schedule_outputs`=planning, WO creation=08-production — N/M lanes call their actions, never write cross-module tables.
- Substitutes + secondary touch money (cost) and food-safety (allergens): Codex-tier writers, Opus reviews, behavioral pg legs (rule 12), live-E3 with fix-and-re-test.
- FG-detail retirement must not orphan the sub-routes approval depends on (allergens/docs) until their replacement lands — sequence inside F5 (N4 before N6).
- i18n: append-only sidecars (rule 14); stage screens are i18n-heavy.

## 7. Round-2 rulings (2026-07-03) — ANSWERED, captured as D14-D18

Q1→D14+D15 (WIP≡recipe, cascade tree) · Q3→D16 (G4 hard, rest soft, Settings toggle later) · Q5→D17 (secondary cancelled → component-level substitutes) · Q6→D18 (capacity block, no WO). Two DOCUMENTED DEFAULTS applied unless the owner vetoes:
- **Q2 stage name**: "Koszt i żywienie" (EN "Costing & Nutrition"), position Packaging → C+N → Trial.
- **Q4 substitutes safety**: allergen-profile mismatch = BLOCKED at declaration (fail-closed); substitution at CONSUMPTION only (no MRP/PO) in F6.

## 8. Definition of done (per wave)

F5: create→handover walkable end-to-end on production using ONLY on-screen controls; a field configured in Settings for dept X assigned to stage Y renders on stage Y, gates it when required, and disappears (with values) when the dept is deleted; FG dashboard shows only active depts; live-E3 walk + fix loop GREEN.
F6: a WO whose recipe line declares a substitute consumes either item against one requirement with correct genealogy/ledger (fail-closed allergen guard at declaration); a processed component expands in the recipe as a cascade tree with rolled-up WIP cost + nutrition; a trial books a capacity-reducing block on a line with NO WO; pilot WO minted with mask.
