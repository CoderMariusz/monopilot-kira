# HANDOFF — Phase B CLOSE → Phase C1 bootstrap

**From:** 2026-04-19 Phase B writing session (B.1 00-FOUNDATION + B.2 01-NPD + 13-plik rename + INTEGRATIONS archive)
**To:** Phase C1 writing — 02-SETTINGS + 03-TECHNICAL + INTEGRATIONS stage 1 (D365 BOM sync)
**Phase:** B CLOSED → C1 next

---

## 🏁 Phase B COMPLETE — Quality gate ✅

Phase B (B.1 + B.2) zamknięta w 1 sesji (~8h ciągłej pracy). Dostarczone wszystkie deliverables z Phase D HANDOFF §Bootstrap i wcześniejszy research-close HANDOFF.

### Deliverables

**Primary:**
- ✅ `00-FOUNDATION-PRD.md` v3.0 — 744 linii, 15 sekcji
- ✅ `01-NPD-PRD.md` v3.0 — 1520 linii, 16 sekcji (primary module, 5 sub-modules build sequence)
- ✅ 13-plik rename (old numerowanie → Phase D numerowanie)
- ✅ `_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md` (multi-stage distribution C1-C5)
- ✅ Ten HANDOFF

**Supporting:**
- ✅ Memory updates (`project_monopilot_migration.md`)

---

## 00-FOUNDATION-PRD.md v3.0 — quick summary

15 sekcji, 744 linii. Kluczowe:

- **§1 Six Architectural Principles** (Phase D P1-P6): Easy extension / Two-systems / Schema-driven + Rule engine DSL / Reality fidelity / Multi-tenant / Marker discipline
- **§2 Marker Discipline** — 4 markery z definicjami + rules of use
- **§3 Personas + RBAC overview**
- **§4 Module Map** — nowa sekcja z podziałem:
  - **§4.1 PRD Writing Phases** — batch-based (B.1 + B.2 + C1-C5 = 7 writing stages total)
  - **§4.2 Build/Implementation Sequence** — per module/submodule sequential z rozbiciem na stories/tasks (nowa decyzja 2026-04-19 sesji — writing batch, build per-module)
  - **§4.3 Tabela 15 modułów** — z Build order column
- **§5 Tech Stack** — Next.js + RSC, Postgres 16+ JSONB hybrid, RLS, Zod + json-schema-to-zod, outbox od MVP, PostHog, Vitest + Playwright, i18n pl/en/uk/ro, D365 adapter
- **§6 Schema-driven Foundation** (ADR-028)
- **§7 Rule Engine DSL** (ADR-029) — przykład allergen changeover gate
- **§8 Multi-tenant L1-L4** (ADR-031) — RLS default + EU residency
- **§9 Configurable Dept Taxonomy** (ADR-030)
- **§10 Event-first + AI/Trace-ready Schema** — outbox pattern SQL + ISA-95 event naming
- **§11 Cross-cutting Requirements** — i18n, audit log, regulatory roadmap (7 regs), out-of-scope
- **§12 ADRs** — 4 active (028-031) + 15 candidate ADRs (R1-R15) + pre-Phase-D ADRs (001-019) deferred review
- **§13 Success Criteria** (architectural + funkcjonalne + niefunkcjonalne + compliance)
- **§14 Open Items** — 16 items (8 Phase D + 4 Research + 4 nowe)
- **§15 References**

**Kluczowa nowa decyzja 2026-04-19:** PRD writing fazami (batch-based, 5 Phase C batches C1-C5), ale **implementation/build = per module albo jego części, po kolei, z rozbiciem na stories/tasks**. Każdy module end-to-end przed następnym. Rozbicie dopuszczalne dla dużych (01-NPD, 08-PRODUCTION, 11-SHIPPING) — każda część osobny sprint z close przed następną. Regression rule: po każdym module impl → regression test suite.

---

## 01-NPD-PRD.md v3.0 — quick summary

16 sekcji, 1520 linii. Primary module — full v7 PLD equivalent + Brief upstream + D365 Builder.

Kluczowe sekcje:

- **§3 End-to-end flow (Mermaid)** — Brief → Core → 5 depts parallel + Procurement partial → Jane closure → D365 Builder
- **§4 Entity model** — FA (Main Table 69 cols) + ProdDetail (N per component) + Brief + brief_lines + outbox/audit; SQL schemas included
- **§5 Main Table schema 69 cols** — Core 8+7 brief extensions = 15, Planning 4, Commercial 8, Production 19, Technical 2+allergens, MRP 13, Procurement 5, System 10
- **§6 Cascading rules** — 4 chains jako DSL JSON (Pack_Size→Line→Dieset, Process_N→PR_Code, Finish_Meat→RM_Code+SyncProdDetail, Template→ApplyTemplate)
- **§7 Workflow rules** — 4 baseline blocking + Closed/Done semantics + Status_Overall 5-enum (Phase D #3) + Built auto-reset (Phase D #8 fix — trigger SQL)
- **§8 Allergens multi-level cascade** [UNIVERSAL food-mfg] — Reference.Allergens + Allergens_by_RM + Allergens_added_by_Process; cascade rule DSL; manual override + audit
- **§9 Brief module** — 2 templates, 37 cols (C21-C37 rescan pending), Convert-to-PLD flow, brief↔FA traceability, mapping table
- **§10 D365 Builder** — 8 tabs per-FA file (D365_Data + Formula_Version/Lines + 4×Route + Resource_Req), N+1 products per FA (Phase D #19), Reference.D365_Constants (FNOR/FOR100048/ApexDG/FinGoods/FProd01), retirement path
- **§11 Dashboard NPD-scoped** — counters, per-dept breakdown, RED/YELLOW/GREEN alerts (thresholds 10/21 days w Reference.AlertThresholds), Missing Data text
- **§12 Validations V01-V08** (2 new — V07 allergens, V08 brief mapping)
- **§13 Dependencies + Build sequence 5 sub-modules:**
  - 01-NPD-a: core cols + cascade + workflow (~5-8 sesji impl)
  - 01-NPD-b: Brief import (~3-4)
  - 01-NPD-c: Allergens cascade (~3-4)
  - 01-NPD-d: D365 Builder (~4-5)
  - 01-NPD-e: Dashboard subset (~2-3)
  - **Total ~17-24 sesji implementacji** per §4.2 build sequence
- **§14 Open Items** — 20 total (8 Phase D + 4 Research + 8 nowe z reality discovery Phase B.2)

---

## Rename 13 PRDs + INTEGRATIONS archive

Wykonano (kolejność avoided conflicts):

| Old | New |
|---|---|
| 09-NPD-PRD.md | 01-NPD-PRD.md |
| 01-SETTINGS-PRD.md | 02-SETTINGS-PRD.md |
| 02-TECHNICAL-PRD.md | 03-TECHNICAL-PRD.md |
| 04-PLANNING-PRD.md | 04-PLANNING-BASIC-PRD.md |
| 03-WAREHOUSE-PRD.md | 05-WAREHOUSE-PRD.md |
| 05-SCANNER-PRD.md | 06-SCANNER-P1-PRD.md |
| 06-PRODUCTION-PRD.md | 08-PRODUCTION-PRD.md |
| 08-QUALITY-PRD.md | 09-QUALITY-PRD.md |
| 10-FINANCE-PRD.md | 10-FINANCE-PRD.md (same) |
| 07-SHIPPING-PRD.md | 11-SHIPPING-PRD.md |
| 15-REPORTING-PRD.md | 12-REPORTING-PRD.md |
| 14-MAINTENANCE-PRD.md | 13-MAINTENANCE-PRD.md |
| 11-MULTI-SITE-PRD.md | 14-MULTI-SITE-PRD.md |
| 13-INTEGRATIONS-PRD.md | `_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md` |

**Missing (create w C3/C5):** 07-PLANNING-EXT-PRD.md, 15-OEE-PRD.md.

**Status:** 14 PRDów w Phase D numerowaniu. 2 PRDs do utworzenia w późniejszych fazach.

---

## Phase C preview

Per 00-FOUNDATION §4.1 i MONOPILOT-V2-ARCHITECTURE §9:

| Batch | Moduły + Integrations | Est. sesji writing |
|---|---|---|
| **C1** (next) | 02-SETTINGS (admin UI wizard dla schema/rules/Reference.*) + 03-TECHNICAL (product master, BOM, co-products, allergens full) + INTEGRATIONS stage 1 (D365 BOM/item sync inline w 03-TECHNICAL lub 02-SETTINGS) | 2-3 |
| C2 | 04-PLANNING-BASIC (PO/TO/WO state machines) + 05-WAREHOUSE (LP lifecycle, FEFO) + 06-SCANNER-P1 (PWA Receive/Move/Pick/Count) | 3-4 |
| C3 | 07-PLANNING-EXT (MRP advanced, demand forecasting) + 08-PRODUCTION (WO execution, changeover gate) | 2-3 |
| C4 | 09-QUALITY (CCP/HACCP) + 10-FINANCE (cost roll, variance) + 11-SHIPPING (EPCIS + SSCC + Peppol) + INTEGRATIONS stage 2/3 (Comarch + EDI EDIFACT + Peppol access point) | 3-4 |
| C5 | 12-REPORTING (dashboards full) + 13-MAINTENANCE (CMMS, predictive) + 14-MULTI-SITE (site_id activation) + 15-OEE (OEE real-time, digital twin prep) + INTEGRATIONS stage 4/5 (Supplier + Customer portals) | 3-4 |

**Total Phase C writing estimate:** 13-18 sesji.

---

## Bootstrap Phase C1 session (next)

1. Read ten HANDOFF
2. Read `00-FOUNDATION-PRD.md` v3.0 — zwłaszcza §4 Module Map + §5 Tech Stack + §6-10 foundations
3. Read `01-NPD-PRD.md` v3.0 — dla dependencies (SETTINGS pod admin wizard dla NPD's Reference.*; TECHNICAL rozszerza item master/BOM podstaw z NPD)
4. Read `_foundation/research/MES-TRENDS-2026.md` §9 "02-SETTINGS" + §9 "03-TECHNICAL" + §4 schema-driven SaaS + §2 food-mfg (allergens full)
5. Read current baselines:
   - `02-SETTINGS-PRD.md` (652 linii, pre-Phase-D)
   - `03-TECHNICAL-PRD.md` (828 linii, pre-Phase-D)
6. Read reality sources niezbędne dla SETTINGS/TECHNICAL:
   - `_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md` (8 config tables + EmailConfig)
   - `_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md` §7 BOM AutoGen (M06) — reference dla 03-TECHNICAL BOM scope
   - `_meta/reality-sources/pld-v7-excel/EVOLVING.md` — areas w zmianach potrzebne dla Admin wizard scope
7. Propose outline per PRD (3 PRDs, każdy osobno):
   - **02-SETTINGS-PRD.md v3.0:** Admin UI wizard dla schema/rules/Reference tables/D365 constants, tenant config L2, permission matrix, feature flags admin, rule engine DSL editor z dry-run, audit log viewer
   - **03-TECHNICAL-PRD.md v3.0:** Product master CRUD (extending FA z 01-NPD), BOM versioning + co-products, catch weight, shelf_life regulatory, allergens full (building na 01-NPD §8), material cost_per_kg, routing costs
   - **INTEGRATIONS stage 1:** Inline w 02-SETTINGS (D365 Constants admin) + 03-TECHNICAL (D365 item/BOM one-way sync — Items + BOM/formula from D365 as read-mostly cache; production confirmations push to D365)
8. User approve scope per PRD → full rewrite (każdy PRD ~700-1200 linii zależnie od complexity)
9. Post-writing: update memory + HANDOFF → Phase C2 bootstrap

---

## Carry-forward do Phase C1

### Z Phase D EVOLVING §19 (deferred, non-blocking dla C1)

- Brief allergens lokalizacja (rescan brief pełny schema)
- Multi-component Volume brief 2
- Brief → Multi-FA split semantyka
- Hard-lock semantyka ADR-028 (schema.edit vs rule.edit — **C1 relevant, 02-SETTINGS spec**)
- Rule engine versioning (ADR-029 — **C1 relevant, 02-SETTINGS DSL editor z version history**)
- Upgrade strategy L2/L3/L4 opt-in granularity (ADR-031 — **C1 relevant, 02-SETTINGS feature flags admin**)
- Commercial upstream od briefu (deferred)
- MRP split (nieaktualne)

### Z Research §10.3 (open items)

- Storage partition strategy (start bez, monitor)
- Event bus MVP (rekomendacja Azure Service Bus — **C1 relevant, INTEGRATIONS stage 1**)
- LLM platform (rekomendacja Claude API direct + Modal)
- Peppol access point (deferred C4)

### Z Phase B.2 discovery

- 20 open items w 01-NPD-PRD.md §14 (kluczowe dla C1: Brief C21-C37 full rescan, supplier per-FA vs per-component, allergens lokalizacja w brief)
- Pre-Phase-D ADRs 001-019 deep review (osobna sesja, preferably C1 start lub osobno)

---

## Phase B — kluczowe insights dla Phase C

1. **Schema-driven pattern dziala** — Reference.DeptColumns z v7 (pattern realizowany już w Excel) mapuje się 1:1 na Postgres metadata + Zod runtime. 03-TECHNICAL extends dla product master schema-driven.

2. **Rule engine DSL JSON format** — w 01-NPD §6 mamy działające przykłady (cascading / gate / workflow). 02-SETTINGS potrzebuje UI editor dla tych JSONów + Mermaid preview + dry-run na sample.

3. **Multi-tenant storage model** — hybrid core + JSONB działa, ALE Reference.* tabele mają `tenant_id` na KAŻDEJ. 14-MULTI-SITE (Phase C5) implementuje full L1-L4 upgrade orchestration.

4. **Allergens implementation w 03-TECHNICAL** — 01-NPD wytyczyło foundations (Reference.Allergens + Allergens_by_RM + Allergens_added_by_Process). 03-TECHNICAL rozszerza: allergen profile per item master, supplier spec integration, lab result tracking.

5. **D365 Builder N+1 pattern** — kluczowa decyzja (Phase D #19). 03-TECHNICAL item master musi wspierać intermediate products (PR codes), nie tylko finished goods (FA). Schema design w §4 01-NPD to baseline.

6. **Build sequence split** — writing vs build oddzielne tory (nowa decyzja). 02-SETTINGS writing razem z 03-TECHNICAL (C1 batch), build sekwencyjny (02 end-to-end → 03 end-to-end). Każdy sub-module ma własne stories + QA + regression.

---

## Memory update po Phase B close

**`project_monopilot_migration.md`** (updated 2026-04-19):
- Status: Phase B COMPLETE, Phase C1 NEXT
- Deliverables listed (00+01 PRD stats, rename log)
- Build sequence decision (writing fazami, build per-module) zanotowana
- Phase C preview (C1-C5) z estimates
- Bootstrap C1 rewritten

**`project_smart_pld.md`:** Zostaje aktualny (v7 reality nie zmienia się). REALITY-SYNC pattern obowiązuje.

---

## Related

- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0 — Phase B.1 primary
- [`01-NPD-PRD.md`](../../01-NPD-PRD.md) v3.0 — Phase B.2 primary
- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](../../_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — Phase D architecture
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — research 810 lines
- [`2026-04-18-phase-d-close.md`](2026-04-18-phase-d-close.md) — Phase D HANDOFF
- [`2026-04-18-research-close.md`](2026-04-18-research-close.md) — Research HANDOFF (predecessor do Phase B)
- [`_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md`](../../_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md) — archived, distributed multi-stage

---

## Closing note

Sesja 2026-04-19 osiągnęła **dużą produktywność**: Research + Phase B.1 + Phase B.2 + 13-plik rename w jednej sesji. Total ~3074 linii new PRD content (744 + 1520 + 810 research) + wszystkie meta docs (memory, handoffs).

**Kluczowa decyzja sesji:** writing batch, build sequential — scope/timing separation.

**Pozostało writing Phase C:** 13-18 sesji (C1-C5). Po tym implementation start.

Session reset rekomendowane przed Phase C1 — dłuższa przerwa + świeży context pomoże jakości 02-SETTINGS/03-TECHNICAL writing.
