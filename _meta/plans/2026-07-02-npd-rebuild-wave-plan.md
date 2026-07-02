# NPD Rebuild — target model + wave plan (F5 / F6)

Date: 2026-07-02 · Author: orchestrator (Fable) · Status: OWNER-RULED (answers below), open questions in §7
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
- **Retirements**: FG detail as an *edit* surface (D1 — the FG list + read-only dashboard stay; production/WIP editing follows Q2 below); the phantom `npd_department_field.stage_code` column (dept→stage assignment replaces it); the per-stage dead submit buttons either work (D7) or are removed; gate-modal manual checklists.
- **FG dashboard rebuild**: reads ACTIVE departments only, groups by stage→dept, read-only; a project/FG is "red" only on missing REQUIRED fields that some stage screen actually renders.

## 3. Feature specs (new)

**Secondary components (D11)** — `recipe_lines.component_role` (`primary`|`secondary`) or a sibling table mirroring the packaging-components pattern. Secondary lines: excluded from composition %/yield/batch-mass checks; included in recipe cost (same supplier-spec price source); carried into the production BOM at handover flagged secondary (consumed by WO like any line, just not part of the mass balance). UI: separate table under the ingredients table, packaging-style.

**Substitutes (D12)** — item-level relation `item_substitutes(org_id, item_id, substitute_item_id)` (rm3→rm1). Consumption: a WO material requirement for rm3 accepts LPs of rm1 (desktop consume + scanner consume + reverse paths); consumed qty counts toward the same requirement; stock_moves/genealogy record the ACTUAL item consumed. Guards: substitute must pass the same holds/qa gates; **allergen/QA parity check at declaration time** (see Q4). Touches production+warehouse consume paths ⇒ REGULATORY-adjacent tier (Codex + Opus review).

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
- **N4** [Codex, REGULATORY — Opus review] gate unification: one gate per stage (required-fields + auto-derived checks + e-sign); kill manual checklists; ESIGN errors surfaced; collapse `done_mrp/closed_mrp` dual path.
- **N5** [Composer] new stage Costing+Nutrition: merged screen, pipeline dot, routes/i18n, C2/C3 auto-derive; negative-margin fix (D10).
- **N6** [Composer] FG dashboard rebuild (active depts, read-only, stage-grouped) + FG-detail retirement per Q2 answer + projects-table NPD-xxx link (D6).
- **N7** [kira-easy/Composer] recipe flow smalls: wizard auto-draft (bug 4), submit-to-trial enable + trial-draft create (D7/bug 3).
- **N8** [kira-mechanical] cleanup: E2E-NPD leftovers, i18n sidecars, dead code from retirements.

**F6 — NPD-materials + planning integration** (depends on F5 spine):
- **M1** [Codex, schema+cost] secondary components (D11) end-to-end: recipe UI table → cost → handover BOM flag → WO consume.
- **M2** [Codex, REGULATORY — Opus review] item substitutes (D12): schema, item-master UI, consume-path acceptance (desktop+scanner+reverse), allergen/QA parity guard, genealogy correctness.
- **M3** [Codex] trial→planning bookable time (D8, planning-owner seam).
- **M4** [Composer] pilot→`WO-pilot-FG####` (D9, mask + WO create + gate wiring).

**F7 — (unchanged, ex-F5 backlog)**: WAC integrity wave, real-DB gate infra, 28 B-gaps, rule-13 ESLint, UX-branch harvest — see memory `f4-wave-state`.

## 6. Risks / guardrails

- Canonical owners: `schedule_outputs`=planning, WO creation=08-production — N/M lanes call their actions, never write cross-module tables.
- Substitutes + secondary touch money (cost) and food-safety (allergens): Codex-tier writers, Opus reviews, behavioral pg legs (rule 12), live-E3 with fix-and-re-test.
- FG-detail retirement must not orphan the sub-routes approval depends on (allergens/docs) until their replacement lands — sequence inside F5 (N4 before N6).
- i18n: append-only sidecars (rule 14); stage screens are i18n-heavy.

## 7. Open questions for the owner (round 2)

1. **FG detail retirement scope**: does the WHOLE edit surface go (Core/Production/… sections move to stage screens), keeping only the FG LIST + read-only dashboard? Where do you edit FG data AFTER handover/launch — Technical items? And the Production/WIP process editor currently living on FG detail — move to which stage (Recipe? Pilot?)?
2. **Costing+Nutrition stage name** (one dot): "Kalkulacja" / "Koszt i żywienie" / other? Confirm position Packaging → C+N → Trial.
3. **Gate hardness**: early gates (Brief…Sensory) — hard-block until required fields filled, or keep soft override-with-note? Approval/G4 stays hard + e-sign.
4. **Substitutes safety**: block declaring a substitute whose allergen profile differs from the primary (fail-closed), or warn-only? Do substitutes also apply in MRP/PO suggestion, or ONLY at consumption?
5. **Secondary components at production**: consumed by the WO as normal BOM lines (scanner shows them), correct? And packaging-table "substitute" column relation to D12 substitutes — same mechanism or packaging keeps its own?
6. **Trial booking shape**: a schedule BLOCK on a line (time reservation, no WO), with the pilot WO being the first real WO — correct?

## 8. Definition of done (per wave)

F5: create→handover walkable end-to-end on production using ONLY on-screen controls; a field configured in Settings for dept X assigned to stage Y renders on stage Y, gates it when required, and disappears (with values) when the dept is deleted; FG dashboard shows only active depts; live-E3 walk + fix loop GREEN.
F6: a WO for an item with a substitute consumes either item against one requirement with correct genealogy/ledger; secondary component priced into recipe cost but absent from composition; trial bookable in planning; pilot WO minted with mask.
