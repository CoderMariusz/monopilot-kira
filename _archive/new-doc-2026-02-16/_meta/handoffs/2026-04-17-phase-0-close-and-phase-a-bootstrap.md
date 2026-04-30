# HANDOFF — Phase 0 close + Phase A bootstrap

**From session:** 2026-04-17 Phase 0 execution (subagent-driven)
**To session:** Phase A Session 1 (PLD v7 reality — PROCESS-OVERVIEW + DEPARTMENTS)
**Phase:** A of (0 → A → D → B → C)

---

## Co zrobione (Phase 0 — complete)

**Meta-model fundament:**
- `new-doc/00-foundation/decisions/META-MODEL.md` — 279 linii, 8 sekcji (Level "a" schema-driven / Level "b" rule engine / Code-driven YAGNI / Multi-tenant variation / D365 mapping / Universal vs Apex-specific / Custom reports / Custom workflows) + Purpose + Deliverable checklist + Open questions.

**4 nowe ADRs (pure-doc, zero code snippets):**
- `ADR-028-schema-driven-column-definition.md` — 123 linii (Level "a" operationalization)
- `ADR-029-rule-engine-dsl-and-workflow-as-data.md` — 151 linii (DSL scope, 4 obszary, workflow as data)
- `ADR-030-configurable-department-taxonomy.md` — 123 linii (departamenty jako config-table)
- `ADR-031-schema-variation-per-org.md` — 123 linii (4-warstwowy multi-tenant schema)

**Supersede markers na istniejących ADRs (Status Update appendix, 2026-04-17):**
- ADR-003 — EXTENDED by ADR-031
- ADR-011 — EXTENDED by ADR-028/029
- ADR-012 — EXTENDED by ADR-031
- ADR-015 — PARTIALLY SUPERSEDED by ADR-028 (user-editable subset)

**Pattern:**
- `new-doc/00-foundation/patterns/REALITY-SYNC.md` — 170 linii, two-session pattern + Mermaid sequence + 6 anti-patterns + drift detection + VBA pipeline integration

**documentation-patterns skill updated:**
- Dodana sekcja "Monopilot Documentation Markers" z 4 markerami (UNIVERSAL / APEX-CONFIG / EVOLVING / LEGACY-D365), application rules, conflict resolution, conservative universality.

**4 nowe skille meta-model:**
- `schema-driven-design/SKILL.md` — 141 linii (3-question decision rule)
- `rule-engine-dsl/SKILL.md` — 188 linii (DSL scope, 3 Mermaid examples)
- `reality-sync-workflow/SKILL.md` — 168 linii (operational guide two-session)
- `multi-tenant-variation/SKILL.md` — 149 linii (4-layer model patterns)

**Skill consolidation (Task 13):**
- 51 declared / 48 on disk → **39 aktywnych, 0 drift**
- 6 consolidated skille: `nextjs-v16-patterns`, `react-19-patterns`, `typescript-patterns-v2`, `api-design`, `api-security`, `testing-patterns` (Vitest focus)
- 20 folders archived do `new-doc/00-foundation/other/archive/skills-consolidated-2026-04-17/`
- 6 missing skilli usunięte z REGISTRY (nie odtwarzamy — user decision)
- `fix-bugs` deprecated (operational, nie pattern)
- `monopilot-patterns` rebrand MonoPilot → Monopilot + See-also meta-model skille
- **Testing framework decision:** Jest → **Vitest** (docelowy stack Next 16 ESM + React 19)
- `domain/food-industry-mes/SKILL.md` — placeholder (full draft w Phase A)
- REGISTRY.yaml v2.0.0 (`max_skills_per_task: 5`)
- SKILL-MAP.yaml nowy (5 phases + 11 task_types + 4 markers + 3/16 modules filled)
- CONSOLIDATION-REPORT.md raport

---

## Co dalej — Phase A Session 1

**Deliverables (2 pliki):**
- `new-doc/_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md` — end-to-end flow PLD v7 (kto, co, kiedy, po co)
- `new-doc/_meta/reality-sources/pld-v7-excel/DEPARTMENTS.md` — 7 działów Apexa + odpowiedzialności + handoffs między działami

**Scope:** reality capture — opisujemy co RZECZYWIŚCIE dzieje się w Apex z PLD v7 Excel. Nie projektujemy Monopilot, dokumentujemy *ground truth*. Markery na wszystkim (głównie `[APEX-CONFIG]` + `[EVOLVING]` gdzie MRP itd.).

**Two-session dyscyplina (obowiązkowa, zobacz REALITY-SYNC.md):**
- Session 1 = capture → update reality source files + note HANDOFF
- Session 2+ = propagate do modułów (NIE w tej sesji)

**Phase A ma 3 sesje łącznie:**
- Session 1: PROCESS-OVERVIEW + DEPARTMENTS (ta)
- Session 2: MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES
- Session 3: REFERENCE-TABLES + D365-INTEGRATION + EVOLVING + full brainstorm review

---

## Kontekst do odświeżenia (MUSI przeczytać na starcie)

Kolejność od najważniejszego:

1. **Ten HANDOFF** — stan Phase 0 close + Phase A Session 1 scope
2. `new-doc/00-foundation/decisions/META-MODEL.md` — świeży fundament (szczególnie §1, §4, §6)
3. `new-doc/00-foundation/patterns/REALITY-SYNC.md` — świeży pattern, operational discipline
4. `new-doc/00-foundation/skills/reality-sync-workflow/SKILL.md` — świeży skill, step-by-step
5. Spec: `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md` **§3.2** (Phase A detail)
6. `Smart_PLD_v7.xlsm` + `v7/` scripts (reality source — użyj `excel-windows-automation` skilla dla read)
7. User memory: `project_smart_pld` (kontekst PLD v7 aktywny)

**Zasada minimalizacji:** NIE czytać 16 modułów. NIE czytać foundation/skills poza tymi wymienionymi. Phase A dotyczy reality layer + świeżej foundation.

---

## Skille do inwokowania (z SKILL-MAP phase-A)

**Required:**
- `documentation-patterns` (markery discipline)
- `discovery-interview-patterns` (pytania do użytkownika o reality)
- `reality-sync-workflow` (two-session operational)

**Optional:**
- `food-industry-mes` (placeholder — pełny draft dopiero na końcu Phase A, użyć do sprawdzenia scope)
- `excel-windows-automation` (dla read Smart_PLD_v7.xlsm)
- `apex-vba-builder` (kontekst VBA modułów v7)

---

## Open questions (carried forward do Phase A i dalej)

Z Phase 0 deliverables + otwarte decisions:

1. **Konkretna składnia DSL** (rule-engine-dsl) — finalne decisions post-C implementation. W Phase A nie dotykamy.
2. **NPD Main Table: które kolumny UNIVERSAL vs APEX-CONFIG** — rozstrzygane w Phase B po Phase A reality (~60-80 kolumn do review).
3. **Upgrade strategy** Monopilot universal features (auto vs opt-in per org) — ADR-031 open question, decyzja w implementation phase.
4. **EVOLVING promotion process** (kto decyduje, kiedy pattern się ustabilizował) — Phase B praktyka + formal process.
5. **Module map w SKILL-MAP** — 3/16 wypełnione, pozostałe 13 dostaną skille po Phase D module reordering.
6. **Food-industry-mes pełny content** — na końcu Phase A, po napisaniu 8 docs reality PLD v7.

---

## Zasady (przypomnienie — obowiązują od Phase A)

- **Pure documentation, NO CODE SNIPPETS** (spec §4.3): zero SQL / TypeScript / VBA / konkretnego YAML składnia w dokumentach modułowych i reality-sources. Dozwolone: proza, tabele, Mermaid. Wyjątek: skille mogą mieć pseudo-code gdy naturalne.
- **Markery obowiązkowe** na każdym wymaganiu / kolumnie / regule (spec §4.2, documentation-patterns SKILL.md, META-MODEL §6).
- **Two-session pattern** (REALITY-SYNC.md §3): capture ≠ propagation. Brainstorm markera wymaga odstępu.
- **Cross-referencing** pełnymi ścieżkami (spec §4.4): `new-doc/00-foundation/...` w linkach.
- **Brainstorm przed pisaniem** (superpowers:brainstorming) gdy niejasność przed touching docs.
- **Target total skills = 39** (po konsolidacji 2026-04-17). Nowe skille tylko po dedicated audit, nie ad-hoc.
- **max_skills_per_task = 5** (podniesione z 3 po konsolidacji).

---

## Następny krok po Phase A close

Phase A wygeneruje:
- `_meta/reality-sources/pld-v7-excel/` — 8 docs (PROCESS-OVERVIEW, DEPARTMENTS, MAIN-TABLE-SCHEMA, CASCADING-RULES, WORKFLOW-RULES, REFERENCE-TABLES, D365-INTEGRATION, EVOLVING)
- `food-industry-mes/SKILL.md` — pełny draft (upgrade z placeholder)
- Nowy HANDOFF dla Phase D (architecture closure)

**Phase D** — domknięcie architektury Monopilot (1 sesja): MONOPILOT-V2-ARCHITECTURE.md + reconcile 16 modułów z NPD-first order.

Potem Phase B (NPD module update, 2-3 sesje) → Phase C (15 modułów przez agenty, 5 batchów × 3 moduły).

**Łącznie pozostało:** ~11 sesji (A ×3 + D ×1 + B ×2-3 + C ×5 nadzór).
