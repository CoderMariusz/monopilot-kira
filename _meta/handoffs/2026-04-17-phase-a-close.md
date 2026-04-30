# HANDOFF — Phase A CLOSE → Phase D bootstrap

**From:** 2026-04-17 Phase A Session 3 (REFERENCE-TABLES + D365-INTEGRATION + EVOLVING + BRIEF-FLOW init)
**To:** Phase D (architecture closure — MONOPILOT-V2-ARCHITECTURE.md) LUB Phase B (09-npd propagation)
**Phase:** A CLOSED → D next (recommended) albo B direct (alternative)

---

## 🏁 Phase A COMPLETE — Quality gate ✅

Phase A zakończony po 3 sesjach. Wszystkie deliverables z spec §3.2 dostarczone.

### Sessions summary

| Session | Docs | Focus |
|---|---|---|
| Session 1 | PROCESS-OVERVIEW + DEPARTMENTS | End-to-end flow + 7 działów Apex |
| Session 2 | MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES | 69 cols + cascades + workflow VBA details |
| Session 3 | REFERENCE-TABLES + D365-INTEGRATION + EVOLVING + (NEW) BRIEF-FLOW | 8 config tables + D365 Builder + evolving areas + brief reality source |

### Deliverables (final count)

**`_meta/reality-sources/pld-v7-excel/` — 8 docs:**

1. ✅ PROCESS-OVERVIEW.md (~310 lines) — end-to-end flow + upstream brief + stages 0-6
2. ✅ DEPARTMENTS.md (~270 lines) — 7 działów + Jane orchestrator + handoff map
3. ✅ MAIN-TABLE-SCHEMA.md (~540 lines) — 69 cols full metadata + ADR-028 confirmation
4. ✅ CASCADING-RULES.md (~370 lines) — 4 cascade triggers + refresh map + DSL projection
5. ✅ WORKFLOW-RULES.md (~480 lines) — status colors + hard-lock + autofilter + Built flag + Worksheet_Change
6. ✅ REFERENCE-TABLES.md (~400 lines) — 8 config tables + extension pattern
7. ✅ D365-INTEGRATION.md (~430 lines) — Import + Builder (WIP 3/8) + Builder_FA5101 reference
8. ✅ EVOLVING.md (~590 lines) — 15 evolving areas + priority matrix + "easy extension" contract

**`_meta/reality-sources/brief-excels/` — NEW reality source 2 files:**

9. ✅ README.md — reality source init
10. ✅ BRIEF-FLOW.md (~430 lines) — Brief Sheet V1 schema + 2 templates + multi-component pattern + mapping brief → PLD

**HANDOFFs:**

11. ✅ `2026-04-17-phase-0-close-and-phase-a-bootstrap.md`
12. ✅ `2026-04-17-phase-a-session-1-close.md`
13. ✅ `2026-04-17-phase-a-session-2-close.md`
14. ✅ `2026-04-17-phase-a-close.md` (ten plik — Phase A final)

---

## Quality gate check ✅

Z spec `_meta/specs/2026-04-17-monopilot-migration-design.md` §3.2:

- [x] 8 docs ukończone w `pld-v7-excel/` ✅
- [x] Markery na wszystkim ✅ ([UNIVERSAL] / [APEX-CONFIG] / [EVOLVING] / [LEGACY-D365])
- [x] Nowy reality source `brief-excels/` zainicjowany ✅
- [ ] User potwierdza że opisane procesy = rzeczywistość ⏳ **PENDING user sign-off**
- [ ] Wszystkie docs `sync_status: current` ⏳ (dziś `needs_review`, bump do `current` po user review)
- [ ] `food-industry-mes` skill full draft (upgrade z placeholder) ⏳ Phase D item

---

## Kluczowe odkrycia Phase A (consolidated)

### Architecture

1. **Reference.DeptColumns już realizuje ADR-028** — schema-driven metadata w Excel VBA; Monopilot kontynuuje + rozszerza
2. **4 blocking rules hardcoded** w M01 = ADR-029 Level "b" obszar 2 (conditional required)
3. **Cascade Level "b" obszar 1** — Pack_Size → Line → Dieset + 3 inne cascades w M04
4. **Template → ApplyTemplate** fills ProdDetail (nie Main Table) — workflow-as-data pattern
5. **ProdDetail hidden VBA-active** — multi-component Production detail, pusty dziś bo Main Table 100 empty rows

### Schema precision

6. **69 kolumn Main Table** (memory "60-80") z header **row 3**
7. **7 działów Apex:** Core / Planning / Commercial / Production / Technical / MRP / Procurement
8. **Jane = NPD Manager orchestrator** (D365 Builder exclusive, Dashboard daily)
9. **Closed vs Done system** — Closed_<Dept> manual, Done_<Dept> system col logic TBD
10. **PR_Code_Final format:** `"PR" + <RM_digits> + <last_filled_PR_suffix>` (iteracja P4→P1)

### Reference content

11. **5 PackSizes** (20x30cm, 25x35cm, 18x24cm, 30x40cm, 15x20cm)
12. **5 Lines** (Line3, Line5, Line6, Line9, Line17) z filtered dropdown per Pack_Size
13. **10 Dieset combinations** — format `DIE_<pack>_L<line>`
14. **4 Templates** (Standard Meat FA / Simple Pack FA / Roasting Chicken / Full Process FA)
15. **8 Processes** (Strip/A, Coat/B, Honey/C, Smoke/E, Slice/F, Tumble/G, Dice/H, Roast/R, brak D reserved)

### D365 integration (LEGACY-D365)

16. **Builder_FA5101.xlsx reference** = docelowy output 7 tabów (FNOR, FOR100048, ApexDG, FinGoods, FProd01 Apex-specific constants)
17. **M08 WIP**: buduje 3 z 8 tabów dziś (D365_Data / Formula_Version / Route_Headers), 5 do dokończenia
18. **V04 material validation**: Found/NoCost/Missing per cell (green/yellow/red)
19. **BOM generator osobny** od Builder (user preference: osobny plik per FA)

### Brief upstream

20. **2 brief templates** (single + multi-component) Brief Sheet V1 37 cols
21. **Multi-component brief 2**: 1 product = N component rows + sum row
22. **7+ Core cols planned from brief** (Volume, Dev_Code, Packs_Per_Case, Weights, Benchmark, Comments, Price_Brief)
23. **Brief → PLD manual rewrite** dziś — Monopilot target: auto-convert button

### Evolving (15 areas total — EVOLVING.md)

24. Brief ↔ PLD integration
25. Core cols expansion (7 from brief)
26. Technical Allergens cascade RM→FA (EU14 + custom, archived story 08.5 confirmed)
27. Reference.Processes expansion + 25-process scale limit
28. EmailConfig activation (recipients puste dziś)
29. Dieset material consumption tabela
30. ProdDetail semantyka decyzja
31. Done_<Dept> logic settlement
32. M08 D365 Builder completion
33. BOM generator button + flow
34. Status_Overall semantyka
35. FA_Code generation policy
36. Alert thresholds config
37. Procurement Price blocking rule refinement
38. Close state enum expansion

---

## Dual-session niezgodności (Session N1-N2 → N3 docs)

**Session 3 docs NIE modyfikują Session 1-2 docs.** Session 3 dodaje niższą warstwę detail (Reference + D365 + Evolving + Brief) — orthogonalne warstwy, no conflicts.

Jedyny edge case: Session 3 EVOLVING uwzględnia niektóre niejasności z Session 1-2 jako open questions zamiast domykać ich tam. To jest zamierzone — Phase D ma zamknąć architektoniczne decyzje na podstawie całego reality + EVOLVING.md.

---

## Pending propagations (Session B)

**Z WSZYSTKICH 3 Sessions Phase A:**

| Priorytet | Moduł | Co propagować |
|---|---|---|
| 1 (adresat #1 Phase B) | `09-npd/` | Full NPD rewrite — 7 działów workflow + Main Table schema + cascade UX + Dashboard + brief upstream + markery wszędzie |
| 2 | `02-products/` | Core 7 cols → products schema (+ Dev_Code EVOLVING) |
| 2 | `04-integrations/d365/` | D365 Import + Builder 8 tabs (target Builder_FA5101) + V04 validation + [LEGACY-D365] flag + constants Apex |
| 3 (Phase C batch) | `11-planning/` | Planning 4 cols + Core-done blocker |
| 3 | `10-commercial/` | Commercial 8 cols + Launch_Date alerts |
| 3 | `12-production/` | Production 19 cols + ProdDetail multi-component + PR codes + Reference.Processes |
| 3 | `13-quality/` lub `NN-technical/` | Technical + Allergens cascade (EU14) + archived story 08.5 |
| 3 | `15-mrp/` | MRP 13 cols + Core+Production blocking |
| 3 | `14-procurement/` | Procurement 5 cols + Price punktowa zależność |
| 3 | `20-dashboards/` | Dashboard counters + alerts 10/21 config + widoczność per-role |
| 3 | `01-settings/` lub `21-admin/` | **Schema-driven admin UI** (add/edit/remove cols, Reference tables, blocking rules) — centralna dla easy extension contract |
| 3 | `NN-npd-upstream/` albo `09-npd` extension | Brief module (37 fields + 2 templates + Convert to PLD) |
| 3 | `NN-rule-engine/` (do stworzenia) | ADR-029 DSL — cascade/validation/gate/workflow-as-data |
| 4 | `NN-notifications/` | Email + triggers (from EmailConfig pattern) |

---

## Recommendation: Phase D przed Phase B

### Opcja A (RECOMMENDED) — Phase D następny

Phase D (`MONOPILOT-V2-ARCHITECTURE.md`) zamyka architectural decisions przed propagacją:

- Scope: 1 sesja, ~2h
- Input: META-MODEL + ADRs + ALL Phase A docs + EVOLVING open questions (§19)
- Output: `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` z rozstrzygniętymi ~20 open questions (§19 EVOLVING)
- Zamyka: NPD-first order reconfirm, multi-component semantyka, Done_<Dept>, Status_Overall enum, Price blocking, Allergens schema, brief integration strategy
- Enables clean Phase B (09-npd nie błądzi z niejasnymi decyzjami)

### Opcja B — Phase B direct

Skip Phase D, go direct to Phase B propagation do 09-npd:

- Risk: propagacja z 20 open questions — każda będzie "TBD" w stories, blocker dla implementation
- Benefit: faster perceived progress
- Możliwe gdy open questions dotyczące v7 mogą być odroczone do Phase C implementation decisions

**Moja rekomendacja: Opcja A** — dokumentacyjna czystość wymaga zamkniętej architektury przed propagacją. 1 sesja inwestycji zaoszczędzi rework przez 5+ sesji Phase B/C.

---

## Bootstrap Phase D

1. Read ten HANDOFF
2. Read wszystkie 10 reality docs (8 pld-v7-excel + README + BRIEF-FLOW)
3. Read `_foundation/META-MODEL.md` + 4 Phase 0 ADRs (028/029/030/031)
4. Read EVOLVING.md §17 priority matrix + §19 open questions
5. Architecture closure session — 1 sesja, ~2h:
   - Reconfirm NPD-first implementation order
   - Settle każde z 20+ open questions (z EVOLVING §19)
   - 16 modułów mapping → implementation batches
   - Output: `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`
6. Po Phase D → Phase B start (09-npd full rewrite)

---

## Pozostałe sesje end-to-end

Licznik aktualizowany:

- ✅ Phase 0 COMPLETE (meta-spec + skill audit)
- ✅ Phase A COMPLETE (3 sesje reality capture)
- ⏳ Phase D (1 sesja architecture closure) ← **NASTĘPNY**
- ⏳ Phase B (2-3 sesje 09-npd rewrite + propagation)
- ⏳ Phase C (5 batchów × 3 moduły = 15 modułów Monopilot, Claude nadzór)

**Pozostało:** ~6 sesji end-to-end (D×1 + B×2-3 + C×5 nadzór).

---

## Memory update po Phase A close

- `project_smart_pld.md` — pozostaje aktualny (Session 2 update)
- `project_monopilot_migration.md` — Phase A Session 3 complete, Phase D next, ~6 sesji pozostało

---

## Related

- [Reality docs Sessions 1-3](../reality-sources/pld-v7-excel/) + [Brief reality](../reality-sources/brief-excels/)
- Previous HANDOFFs: Phase 0 close + Session 1 close + Session 2 close (all in this folder)
- [`_foundation/META-MODEL.md`](../../_foundation/META-MODEL.md) — architectural contract
- [`_meta/specs/2026-04-17-monopilot-migration-design.md`](../specs/2026-04-17-monopilot-migration-design.md) §3.2 (Phase A completed) + §3.3 (Phase D next)
