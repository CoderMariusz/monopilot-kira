# Phase 0 — Meta-spec + Skill Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ustanowić meta-model architektury Monopilot (schema-driven + rule-engine + multi-tenant + reality-sync) i zbudować bazę skillów + markerów zanim ruszy Phase A (dokumentacja PLD v7).

**Architecture:** Pure documentation phase — zero kodu produktowego. Piszemy META-MODEL.md + 4 ADRs (028–031) + 4 nowe skille + update 1 istniejącego + pattern REALITY-SYNC.md. Równolegle subagent audytuje 51 istniejących skilli → raport → aktualizacja REGISTRY.yaml + nowa SKILL-MAP.yaml. Wszystko w `new-doc/` (OneDrive). Źródło prawdy: `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`.

**Tech Stack (docelowy, opisywany — nie implementowany w tej fazie):** Next.js 16 / React 19 / Supabase (Postgres + RLS + Auth + Realtime) / TypeScript / Zod v4 / Tailwind / Playwright / **Vitest** (decyzja 2026-04-17 po audit: Jest → Vitest ze względu na natywny ESM/TS/JSX dla Next 16 i zgodność z `testing-monopilot`) / MSW. Dla Phase 0 technologia = markdown + YAML.

**Decyzje userskie (2026-04-17, przed execution):**
- **Vitest > Jest** — update spec Monopilot Migration stackiem, usunąć zadeklarowany ale nieistniejący `testing-jest` z REGISTRY.
- **Dodać `domain/food-industry-mes`** jako 5-ty nowy skill — ale **placeholder w Phase 0**, pełny draft dopiero w Phase A po napisaniu reality PLD v7.
- **Konsolidacja skilli > rozbudowa** — zamiast 48 → 62 celujemy w ~25–30 dobrze skonsolidowanych (zobacz Task 13 rozszerzony o mergy).

**Źródła prawdy (czytane w kolejności):**
1. `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md` — spec migracji (§2 meta-model, §4 zasady dokumentacji, §5.6 skille)
2. `new-doc/_meta/handoffs/2026-04-17-phase-0-bootstrap.md` — handoff z deliverables
3. `new-doc/00-foundation/ANALYSIS.md` — stan istniejącej foundation (60+ plików, 25+ ADRs, 48+ skilli)
4. `new-doc/00-foundation/skills/REGISTRY.yaml` — rejestr skilli (metadata 51, na dysku 48 katalogów — discrepancy)
5. `new-doc/00-foundation/patterns/DOCUMENTATION-SYNC.md` — wzorzec bazowy dla REALITY-SYNC
6. `new-doc/00-foundation/decisions/ADR-003-multi-tenancy-rls.md`, `ADR-011-module-toggle-storage.md`, `ADR-012-role-permission-storage.md`, `ADR-015-centralized-constants-pattern.md` — relevant ADRs do cross-ref / superseding

**Ograniczenia (obowiązkowe — spec §4.3):**
- **NO CODE SNIPPETS** w nowych ADRs i nowych patternach: żadnego SQL, TypeScript, VBA, konkretnych YAML-i schemy. Tylko: opisy semantyczne, tabele data-contract (col name, type, owner, rule), Mermaid, tabele decyzji.
- **Wyjątek:** skille mogą zawierać krótkie przykłady użycia (to praktyka wszystkich obecnych skilli), ale nowe skille dot. meta-modelu same w sobie są bardziej zasadami niż kodem.
- **Markery obowiązkowe** na każdym wymaganiu/regule w nowych dokumentach: `[UNIVERSAL]` / `[APEX-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]`.
- Polski język (spójność z projektem), chyba że istniejący kontekst wymaga angielskiego (np. ADRs — patrz ADR-003, ADR-013 → wszystkie po angielsku; zachowaj konwencję).

---

## File Structure

**Nowe pliki (11):**
```
new-doc/00-foundation/
├── decisions/
│   ├── META-MODEL.md                          ← single source of truth (§2.1 spec, 8 punktów)
│   ├── ADR-028-schema-driven-column-definition.md
│   ├── ADR-029-rule-engine-dsl-and-workflow-as-data.md
│   ├── ADR-030-configurable-department-taxonomy.md
│   └── ADR-031-schema-variation-per-org.md
├── patterns/
│   └── REALITY-SYNC.md                        ← pattern dyscypliny sync reality sources
└── skills/
    ├── SKILL-MAP.yaml                         ← mapa phase/moduł → skille (Task 13)
    ├── SKILL-AUDIT.md                         ← raport subagenta (Task 13; tworzy agent)
    ├── schema-driven-design/SKILL.md
    ├── rule-engine-dsl/SKILL.md
    ├── reality-sync-workflow/SKILL.md
    └── multi-tenant-variation/SKILL.md
```

**Modyfikowane pliki (2+):**
```
new-doc/00-foundation/
├── skills/
│   ├── REGISTRY.yaml                          ← update po Task 13 (+4 nowe skille, +audit results)
│   └── documentation-patterns/SKILL.md        ← dodanie sekcji markerów (Task 7)
└── decisions/
    └── ADR-003, ADR-011, ADR-012              ← opcjonalnie markery [SUPERSEDED by ADR-028/029/030/031] jeśli sprzeczne (Task 6)
```

**Handoff + memory updates (Task 15):**
```
new-doc/_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md   ← nowy
~/.claude/.../memory/project_monopilot_migration.md                         ← update statusu fazy
~/.claude/.../memory/MEMORY.md                                              ← niezmienny (entry już istnieje)
```

**Responsibilities (jedno zadanie → jeden plik → jeden deliverable):**
- `META-MODEL.md`: mapa co jest schema-driven vs code-driven w Monopilot (8 sekcji = 8 punktów spec §2.1)
- ADR-028: zasada kolumny-jako-metadane (Level "a" konfigurowalności)
- ADR-029: scope DSL rule-engine (cascading, conditional, gate criteria) + workflow jako dane
- ADR-030: taxonomia działów jako config, nie hardcoded enum
- ADR-031: schema variation per org (multi-tenant from day 1)
- `REALITY-SYNC.md`: protokół sync PLD v7 / Power Automate / D365 / Access / other Excels → Monopilot docs
- 4 skille: operacjonalizacja powyższych ADRs dla agentów
- `documentation-patterns` update: dodanie sekcji o 4 markerach
- `SKILL-MAP.yaml`: phase/moduł → skille (rozwiązanie problemu "30 skilli do zapamiętania")

---

## Konwencja task steps (doc-adapted TDD)

Standardowe kroki per task (tam gdzie applicable):

1. **Outline** — sekcje h2/h3 + jedna linia content-cue per sekcja (szybki szkic)
2. **Write** — rozwinięcie outline-u do pełnej treści z zawartością wymienioną w tym planie
3. **Validation pass** — checklist:
   - [ ] Markery `[UNIVERSAL]` / `[APEX-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]` obecne tam gdzie należy
   - [ ] Zero code snippets (SQL/TS/VBA/konkretny YAML) — tylko proza + tabele + Mermaid
   - [ ] Cross-references używają pełnych ścieżek (`new-doc/00-foundation/...`)
   - [ ] Link do źródła prawdy: spec `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`
   - [ ] Spójność terminologiczna z glossary (spec §8): PLD, Monopilot, reality source, meta-model, schema-driven, marker, HANDOFF.md, SKILL-MAP
4. **Save** — zapis pliku + potwierdzenie nagłówka (frontmatter / Status / Date w ADR) i że plik jest w poprawnej lokalizacji

Dla skillów dodatkowo: zachowana konwencja `name`/`description`/`tags` z istniejących skilli (zobacz `documentation-patterns/SKILL.md` jako wzór).

---

## Zależności taskowe

- Task 1 (META-MODEL) jest fundamentem — wszystkie 4 ADRs cross-referencują META-MODEL.
- ADRs 028–031 (Task 2–5) są niezależne od siebie — mogą być pisane równolegle po ukończeniu Task 1.
- Task 6 (marking superseded) robimy po 2–5, bo marker używa numerów 028–031.
- Task 7 (`documentation-patterns` update) jest niezależny — może iść równolegle z ADRs.
- Skille 8–11 zależą od odpowiednich ADRs (schema-driven-design ↔ ADR-028, rule-engine-dsl ↔ ADR-029, multi-tenant-variation ↔ ADR-031, reality-sync-workflow ↔ REALITY-SYNC pattern Task 12).
- Task 12 (REALITY-SYNC.md) niezależny od ADRs — może iść wcześniej.
- Task 13 (SKILL-AUDIT review + REGISTRY.yaml + SKILL-MAP.yaml) **blokuje się** na output subagenta (spawned at session start, background).
- Task 14 (quality gate) wymaga wszystkich 1–13.
- Task 15 (HANDOFF + memory update) wymaga 14.

**Rekomendowany porządek wykonania sekwencyjny (subagent-driven mode):** 1 → 12 → 2, 3, 4, 5 (można parallel) → 6 → 7 → 8, 9, 10, 11 (można parallel, ale każdy cross-refs swój ADR) → 13 (czekamy na agent audit) → 14 → 15.

---

## Task 1: META-MODEL.md

**Files:**
- Create: `new-doc/00-foundation/decisions/META-MODEL.md`

**Source of truth:** spec §2.1 (8 punktów) + §2.2 (deliverable).

- [ ] **Step 1: Outline 8 sekcji + header**

Frontmatter + tytuł. Struktura:
- **Status:** ACCEPTED. Date: 2026-04-17. Supersedes: partial overlap with ADR-003 (multi-tenancy), ADR-011 (module toggle), ADR-012 (role-permission) — wskazujemy extension relation, nie superseding per se. Related: ADR-028, 029, 030, 031.
- **Purpose** — 3 linie: po co meta-model; że wszystkie 16 modułów są projektowane przez tę soczewkę; że to kontrakt który decyduje co agent może zmienić config-em vs kodem.
- **§1 — Schema-driven domain (Level "a")** — tabela obiektów CRUD-owalnych w Settings (8 grup z spec §2.1.1): Kolumny tabel / Departamenty / Reguły walidacji / Reference tables / Role × permissions / Module toggles / Status colors + workflow stage names / Notification templates. Każdy wpis: label, co zawiera, marker, powiązany ADR (np. kolumny → ADR-028; role → ADR-012+ADR-031; departamenty → ADR-030).
- **§2 — Rule engine furtka (Level "b")** — DSL dla 3–5 obszarów z twardym limitem: (a) cascading dropdowns — przykład Pack_Size → Line → Dieset → Material oznaczony `[APEX-CONFIG]`, (b) conditional required — "pole X required gdy Dept Y aktywny", (c) gate entry criteria — checklisty bramek, (d) workflow definitions as data — state machine jako JSON/DB. Jeden runtime engine dla wszystkich modułów. Marker: `[UNIVERSAL]` silnik, `[APEX-CONFIG]` definicje. Powiązanie z ADR-029.
- **§3 — Code-driven domain (YAGNI)** — lista obszarów pozostających w kodzie: workflow state machine engine (silnik, nie definicje; ADR-007 extension), integracje zewnętrzne (D365 → `[LEGACY-D365]`, email, scanner SDK), obliczenia kosztów BOM, UI layouts, silnik rule engine. Uzasadnienie: nie konfigurowalne per użytkownik, matematyka lub integracja.
- **§4 — Multi-tenant variation points** — odwołanie do ADR-003 (RLS) + nowy ADR-031. Model: każdy org ma własną konfigurację na tych samych tabelach; org_id izoluje schema. Tabela: co się zmienia per-org (kolumny / departamenty / reguły / role / reference) vs. co jest stałe (core schema tabel, engines, integracje).
- **§5 — Migracja z D365 (mapa pojęć)** — high-level tabela D365-entity → Monopilot-schema-driven-equivalent. Pełna mapa żyje w `_meta/reality-sources/d365-integration/` (Phase A lub późniejsza). Marker `[LEGACY-D365]` dla wszystkiego co istnieje tylko z powodu D365.
- **§6 — Universal vs Apex-specific** — zasada dokumentacyjna: każdy moduł musi jawnie oznaczać markerem każde wymaganie. Tabela decyzyjna: kiedy UNIVERSAL (fundamentalne dla food-manufacturing MES), kiedy APEX-CONFIG (konfigurowalne w Settings), kiedy EVOLVING (jeszcze zmienia się, trzymamy w DB), kiedy LEGACY-D365 (zniknie po migracji, feature flag `integration.d365.enabled`).
- **§7 — Custom reports (refinement)** — report templates jako universal code (Table / Aggregation / Trend Report). Content (kolumny, filtry, grupowania) czytane z org config. Dodanie kolumny przez Apexa = raport automatycznie może jej użyć. Tańsze niż full no-code report builder, ale skalowalne.
- **§8 — Custom workflows (refinement)** — workflow jako dane: silnik universal, definicje (stages, criteria, transitions) jako dane per org. Apex dostaje predefiniowaną definicję NPD Stage-Gate G0→G4. Inny klient ma G0→G3 — zmiana w Settings/JSON. Część rule engine (§2).
- **Deliverable checklist** (z spec §2.2): this file + ADR-028 + ADR-029 + ADR-030 + ADR-031. Supersede markers na sprzecznych ADRs.

- [ ] **Step 2: Write full content per outline**

Każda sekcja: 100–200 linii. Dla tabel: kolumny `Obszar | Level | Marker | Powiązany ADR | Przykład Apex | Przykład inny org`. Mermaid diagram w §4 pokazujący: `Org-A config → Shared Core Tables ← Org-B config`. W §7 i §8 tabela "Co universal" vs "Co per-org". NO CODE (SQL/TS/YAML konkretny — tylko pseudo-tabele i prozą).

- [ ] **Step 3: Validation pass**

- [ ] Wszystkie 8 sekcji obecne, wszystkie sekcje cross-refs do odpowiednich ADRs (028–031)
- [ ] Markery pokazane jako tabela reference + użyte w przykładach w sekcjach
- [ ] Zero SQL/TS/VBA; Mermaid dozwolony; pseudo-tabele dozwolone
- [ ] Link do spec (§2 pierwszy link w header, inne przy punktach gdzie mapują się 1:1)
- [ ] Terminologia: "schema-driven", "Level a/b", "universal/Apex-config/evolving/legacy-D365" użyte konsekwentnie

- [ ] **Step 4: Save**

Zapis pod ścieżką wskazaną w files. Weryfikacja że plik jest czytelny (otwórz i sprawdź renderuje się strukturę). Dodaj wpis w session notes: "META-MODEL.md ukończony, X linii".

---

## Task 2: ADR-028 Schema-driven column definition

**Files:**
- Create: `new-doc/00-foundation/decisions/ADR-028-schema-driven-column-definition.md`

**Source of truth:** spec §2.1 punkt 1 + §2.2.

- [ ] **Step 1: Outline sekcji (format zgodny z istniejącymi ADRs ale BEZ SQL)**

Sekcje:
- **Status:** ACCEPTED. Date: 2026-04-17. Context: Monopilot Migration Phase 0. Supersedes: nothing (extends ADR-015 centralized-constants w zakresie kolumn tabel głównych).
- **Context** — dlaczego decyzja: PLD v7 reality ma ~60–80 kolumn w Main Table które Apex zmienia miesięcznie (nowe pola MRP, nowe walidacje). Hardcodowanie enum/schema w kodzie blokuje konfigurację per-org (ADR-031). Trzeba rozdzielić: *kolumny jako dane* (user-editable w Settings) vs *kolumny jako kod* (core/infra).
- **Decision** — definicja kolumny tabeli głównej (per moduł, np. NPD Main Table, Production WO Table, itp.) przechowywana jako *metadata row* w dedicated config table. Atrybuty metadanych: label, kod, typ danych, owner department, required, validation type, default value, hard-lock (tak/nie), visible-for-role, sort order, marker (UNIVERSAL / APEX-CONFIG / EVOLVING / LEGACY-D365).
- **Scope of applicability** — które tabele są schema-driven (tabela): Main Tables per moduł (NPD, Planning, Production, itp.), Reference Tables (Pack Sizes, Lines, itp.), form-field meta. Które NIE: tabele core infra (users, organizations, roles, audit_log), tabele transakcyjne (license_plates, lot_genealogy — schema stała bo regulatoryjna).
- **Rationale** — 4 punkty: (1) Apex dodaje kolumnę bez developera, (2) inny org ma inną strukturę bez zmiany kodu, (3) aktualizacja per org nie wymaga migracji DB (nowy wiersz w config, nie nowa kolumna), (4) reports i workflow automatycznie widzą nowe kolumny (§7, §8 META-MODEL).
- **Trade-offs accepted** — (1) UI musi być generic table renderer (większa inwestycja frontend), (2) query performance — schema-driven cols żyją w JSONB albo "entity-attribute-value" style, wymaga indexing strategy (opisane w ADR-013 i ADR-031 level); tutaj tylko zarysowane; (3) dyscyplina — każda zmiana konfiguracji audytowana i wersjonowana (ADR-008).
- **Alternatives considered (rejected):** (A) Hardcoded schema per client — odrzucone bo nie skaluje, (B) Full no-code builder (jak Airtable) — odrzucone bo over-scope, (C) Only reference tables are schema-driven, main tables stay code-driven — odrzucone bo Apex main table rośnie miesięcznie.
- **Consequences** — Positive: elastyczność, multi-tenant ready, report/workflow auto-awareness. Negative: generic UI overhead, performance concerns, migration complexity dla kolumn z hard-constraints. Neutral: migration template musi obsługiwać "add schema-driven col" jako event (nowy wiersz, nie ALTER TABLE).
- **Markery przy wszystkich examples** — APEX-CONFIG dla konkretnych przykładów Apexa, UNIVERSAL dla atrybutów meta-kolumny (label/type/required).
- **Open questions (to Phase D)** — które konkretnie kolumny w NPD są UNIVERSAL vs APEX-CONFIG (decision w Phase B po reality sync Phase A).
- **Related** — META-MODEL.md (§1), ADR-003 (RLS), ADR-015 (constants), ADR-031 (schema variation per org). Affected stories: po Phase B NPD update.

- [ ] **Step 2: Write full content**

80–150 linii. Tabele zamiast SQL. Np. "Metadata attributes" jako tabela: `Atrybut | Typ | Required | Example (Apex) | Marker`.

- [ ] **Step 3: Validation pass**

Standard: markery, no-code-snippets (!), cross-refs do META-MODEL + ADR-003/015/031, link do spec §2.1.1.

- [ ] **Step 4: Save**

---

## Task 3: ADR-029 Rule engine DSL + workflow as data

**Files:**
- Create: `new-doc/00-foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md`

**Source of truth:** spec §2.1 punkt 2 + §2.1 punkt 8 (merged — spec explicitly pakuje workflow-as-data jako część rule engine).

- [ ] **Step 1: Outline**

Sekcje:
- **Status / Date / Context / Supersedes** — Supersedes: none; extends ADR-007 (work-order-state-machine) w zakresie "engine vs definition separation".
- **Context** — PLD v7 ma cascading Pack_Size → Line → Dieset → Material. Monopilot musi obsługiwać takie reguły dla wielu org-ów bez kodowania per klient. Również workflow state machine: Apex = NPD G0→G4, inny org = G0→G3 lub completely different set. Rozwiązanie: mini DSL + jeden engine.
- **Decision — DSL scope (twardy limit 4 obszary):**
  - (a) Cascading dropdowns: "Pole Y dopuszczalne wartości zależą od wartości pola X" (1-level lub multi-level chain).
  - (b) Conditional required: "Pole Z required gdy predykat P jest prawdziwy" (predykat = kombinacja wartości pól + toggles dept).
  - (c) Gate entry criteria: "Stage S można opuścić gdy checklist C complete" (checklist = dane, nie kod).
  - (d) Workflow definitions: state machine (nodes=stages, edges=transitions) zdefiniowana jako struktura danych; engine uniwersalny wykonuje dowolną definicję.
- **DSL semantyka (high-level, NO concrete syntax):** opis semantyczny w prozie + tabele decyzyjne. Predykaty: field-comparison (`=`, `≠`, `>`, `<`, `in`, `not in`), boolean combinators (AND/OR/NOT). Actions: allow-values, set-required, block-transition, require-checklist. Wartości referencyjne: literały, other-field-value, reference-table-lookup, org-config-value.
- **Składnia (Open Question — decyzja w podrozdziale "Chosen form"):** trzy opcje:
  - Opcja 1: Mermaid-style pseudo-code — wizualne, dobre do dokumentacji, mniej dobrze do runtime.
  - Opcja 2: JSON Schema z reserved keys — runtime-friendly, harder do ludzkiego edytowania.
  - Opcja 3: Textual DSL (pseudo-angielski) — łatwe do czytania, wymaga parser implementation.
  - **Rekomendacja w ADR:** hybryda — JSON schema jako runtime form + Mermaid pseudo-code w dokumentacji + textual opis w Settings UI. Uzasadnienie: nie zmuszamy jednej formy.
- **Rationale (4 punkty):** uniwersalność (jeden silnik dla wszystkich 16 modułów), multi-tenant (definicje per org), ewolucyjność (Apex zmienia regułę bez dewelopera), bezpieczeństwo (DSL ma ograniczony scope — nie Turing-complete).
- **Trade-offs:** (1) edge cases reguł które nie mieszczą się w DSL muszą iść do code-driven (twarde escape hatch dokumentowany per moduł), (2) debugging reguł wymaga dedicated UI tools, (3) performance runtime evaluator — caching strategy.
- **Alternatives rejected:** (A) Hardcoded if/else per moduł — nie skaluje, (B) Full Rules Engine like Drools — over-scope, (C) Frontend-only validation — nie działa w multi-tenant API.
- **Scope enforcement — "twardy limit"** — ADR explicite zabrania rozszerzania DSL poza 4 obszary bez nowego ADR. Mitiguje R1 (schema-driven overreach) z spec §7.2.
- **Markery:** silnik = `[UNIVERSAL]`, definicje reguł (konkretne cascading chains, konkretne gate checklists, konkretne workflow definitions) = `[APEX-CONFIG]` lub `[EVOLVING]` gdy Apex jeszcze się decyduje.
- **Open questions (to Phase B):** konkretna składnia DSL w implementation (wybór biblioteki parsera lub własny), mechanizm wersjonowania reguł (reguła v1 aktywna vs v2 draft).
- **Related** — META-MODEL §2 i §8, ADR-007 (state machine engine basis), ADR-028 (cols which rules reference), ADR-031 (per-org schemas).

- [ ] **Step 2: Write full content**

120–200 linii. Tabela DSL-scope z 4 obszarami + examples (z markerami). Mermaid diagram dla workflow-as-data concept.

- [ ] **Step 3: Validation pass**

Jak standard + dodatkowo: (1) twardy limit 4 obszary explicite wspomniany, (2) markery poprawnie rozgraniczają universal engine / per-org definitions, (3) żadnego konkretnego JSON schema ani TypeScript — tylko opis semantyki.

- [ ] **Step 4: Save**

---

## Task 4: ADR-030 Configurable department taxonomy

**Files:**
- Create: `new-doc/00-foundation/decisions/ADR-030-configurable-department-taxonomy.md`

**Source of truth:** spec §2.1 punkt 1 (departamenty w schema-driven grupie) + PLD v7 reality (7 działów Apexa).

- [ ] **Step 1: Outline**

Sekcje:
- **Status / Date / Context** — Supersedes: nothing; wprowadza jawną zasadę dla obiektu "department".
- **Context** — PLD v7 ma 7 działów Apexa (Commercial, Development, Production, Quality, Planning, Procurement, MRP). Każdy dział: nazwa, kod, kolor statusu, kolejność w UI, leader. Inne firmy będą miały inne działy (inny food-manufacturing org może mieć Logistics osobno, R&D nie zintegrowany z Development, itp.). Hardcoding = blokada multi-tenancy.
- **Decision** — departamenty przechowywane jako wiersze w `departments` table (per org przez RLS — ADR-003). Atrybuty: code (stabilny identyfikator), label, color, sort_order, leader_user_id, active, marker (UNIVERSAL/APEX-CONFIG), created_at, updated_at. Zmiany audytowane (ADR-008).
- **Scope** — ten schema dotyczy *business departments* (owners kolumn Main Table, assignment workflow steps). Nie dotyczy *roles* (ADR-012 — cross-cutting identity) ani *warehouses* (ADR-010 — physical locations).
- **Rationale** — multi-tenant from day 1 (ADR-031), Apex = pierwsza konfiguracja, nie jedyna. Departamenty są *owners* wielu kolumn (ADR-028: `owner department`), więc *muszą* być config-table gdy kolumny są config.
- **Trade-offs:** UI musi wspierać generic department picker, raporty muszą być parametryzowane. Walidacje typu "musi być wypełnione przez Quality Dept" stają się config-driven.
- **Alternatives rejected:** (A) Hardcoded enum in code — blokuje multi-tenant, (B) Fixed set per industry template — nie skaluje nawet wewnątrz food-manufacturing.
- **Migration concern** — jak PLD v7 data trafia do Monopilot: departamenty Apex = pierwsza seed data dla org=Apex. Żaden inny org nie widzi tych działów (RLS). Marker wszystkich 7 działów Apexa: `[APEX-CONFIG]`.
- **Open questions (do Phase B):** czy "owner department" na kolumnie Main Table jest required czy optional (Apex 7 działów ownership — każda kolumna ma owner).
- **Related** — META-MODEL §1, §4; ADR-003; ADR-012 (roles — different concept); ADR-028 (cols reference departments); ADR-031.

- [ ] **Step 2: Write full content**

60–100 linii. Tabela attribute-schema. Tabela 7 departamentów Apexa jako *example seed* z markerem APEX-CONFIG per każdy.

- [ ] **Step 3: Validation pass**

Standard + separacja department vs role vs warehouse jasno wytłumaczona.

- [ ] **Step 4: Save**

---

## Task 5: ADR-031 Schema variation per org (multi-tenant)

**Files:**
- Create: `new-doc/00-foundation/decisions/ADR-031-schema-variation-per-org.md`

**Source of truth:** spec §2.1 punkt 4 + ADR-003 (RLS foundation).

- [ ] **Step 1: Outline**

Sekcje:
- **Status / Date / Context** — Supersedes: partial ADR-003 (ADR-003 zakłada że schema stała, tylko data per-org; ADR-031 rozszerza do schema-per-org).
- **Context** — Dotychczas: ADR-003 RLS izoluje data per org na *identycznej* schemie. Monopilot target: również konfiguracja *schemy* per org (które kolumny istnieją, jakie reguły, jakie działy). Apex = pierwsza konfiguracja, nie jedyna. Musimy zdefiniować co się zmienia vs. co jest wspólne.
- **Decision — 4 warstwy:**
  - (L1) **Core infrastructure schema** — stała dla wszystkich orgs: users, organizations, roles, audit_log, license_plates, lot_genealogy (regulatoryjne), reference universal (np. EU-14 allergens). Zmienia się tylko przez migration + nowy ADR.
  - (L2) **Schema-driven column definitions** — per-org w config tables (ADR-028). Np. Main Table "kolumny" są wierszami w `column_definitions` table, filtrowane przez RLS.
  - (L3) **Rule engine definitions** — per-org (ADR-029). Cascading chains, gate criteria, workflow definitions są danymi filtrowanymi RLS.
  - (L4) **Reference tables data** — per-org (ADR-010 extended). Pack sizes, lines, dieset — zawartość per-org, struktura wspólna (L1).
- **RLS pattern extended** — standardowy ADR-013 (users lookup) działa dla L2/L3/L4 tak samo jak dla L1. Nowe policies dla config tables: identyczny szablon, `org_id = (SELECT org_id FROM users WHERE id = auth.uid())`.
- **Seed strategy** — nowy org dostaje seed templates: "food-manufacturing-SMB default" (zestaw kolumn / reguł / działów dla typowego producenta), potem customize w Settings. Apex = seed + 12 miesięcy customizacji. Template = data, nie kod.
- **Rationale:** (1) multi-tenant from day 1 (business requirement), (2) PLD v7 migration nie będzie rewrite — Apex dostaje seed z PLD v7 reality Phase A, (3) D365 replacement długoterminowo (inni klienci nie mają D365 = legacy-D365 kolumny wyłączone feature flag).
- **Trade-offs:** (1) seed template maintenance overhead, (2) generic UI component dyscyplina, (3) cross-org reporting (service role z explicit org filter — ADR-013 trade-off), (4) upgrade strategy — zmiana L1 schema propaguje do wszystkich orgs automatycznie, zmiana L2+ per org wymaga opt-in.
- **Alternatives rejected:** (A) One schema for all clients — spec's fundamental rejection, (B) Separate DB per tenant — operational overhead, regressy w ADR-003 reasoning, (C) Schema per industry — nie skaluje w ramach food-manufacturing.
- **Markery:** L1 = `[UNIVERSAL]` per definition, L2–L4 = `[APEX-CONFIG]` dla konkretów, `[UNIVERSAL]` dla meta-schemy.
- **Open questions:** (a) migrowalność między orgami template-ów ("copy config from org X"), (b) upgrade workflow gdy Monopilot uwalnia nową kolumnę UNIVERSAL — czy automatycznie, czy opt-in.
- **Related** — META-MODEL §4, ADR-003, ADR-013, ADR-028, ADR-029, ADR-030.

- [ ] **Step 2: Write full content**

100–150 linii. Tabela 4-layer z kolumnami `Layer | Scope | Marker | Change process | Examples`. Mermaid diagram: "Core (L1) ← shared | L2/L3/L4 ← per org via RLS".

- [ ] **Step 3: Validation pass**

Standard + (1) wyraźny contrast z ADR-003 (extension, nie rejection), (2) wszystkie 4 warstwy mają concrete examples, (3) Mermaid diagram jasny.

- [ ] **Step 4: Save**

---

## Task 6: Mark superseded/extended ADRs

**Files:**
- Modify: `new-doc/00-foundation/decisions/ADR-003-multi-tenancy-rls.md` (append status note, nie kasować)
- Modify: `new-doc/00-foundation/decisions/ADR-011-module-toggle-storage.md` (append)
- Modify: `new-doc/00-foundation/decisions/ADR-012-role-permission-storage.md` (append)
- Potentially: `new-doc/00-foundation/decisions/ADR-015-centralized-constants-pattern.md` (append extension note dla kolumn schema-driven)

**Source of truth:** spec §2.2 ("Istniejące ADRs które są sprzeczne z meta-modelem oznaczamy [SUPERSEDED by ADR-028/029/030/031] — nie kasujemy").

- [ ] **Step 1: Identify each ADR's relationship**

Analiza per ADR:
- **ADR-003 (RLS):** EXTENDED by ADR-031 — ADR-003 pozostaje fundamentem (users-lookup RLS pattern zachowany ADR-013), ADR-031 dodaje *schema-variation* na wierzchu.
- **ADR-011 (module toggle):** EXTENDED by ADR-028/029 — moduł toggles są jednym z obszarów schema-driven (META-MODEL §1); ADR-011 definiuje storage pattern, nowe ADRs rozszerzają scope do kolumn/reguł.
- **ADR-012 (role-permission):** EXTENDED by ADR-031 — role definitions per org (ADR-031 L2/L3 layer), ADR-012 pattern wciąż aktualny.
- **ADR-015 (centralized constants):** PARTIALLY SUPERSEDED by ADR-028 — dla *user-editable constants* (kolumny, departamenty, reference data) przechodzimy na schema-driven. Dla *code-level constants* (e.g. HTTP status enums, regulatoryjne stałe) ADR-015 pozostaje w mocy.

- [ ] **Step 2: Write status appendix per ADR**

Format (append to existing ADR, nie edytuj original sections):

```markdown
---

## Status Update — 2026-04-17 (Monopilot Migration Phase 0)

**Relationship:** EXTENDED by ADR-028 / ADR-029 / ADR-031 [wybierz właściwe].

See `META-MODEL.md` for the broader meta-model context.

**What remains:** [1–2 linie co zostaje w mocy z tego ADR]
**What changes:** [1–2 linie co zmienia meta-model]
```

Dla ADR-015: zamiast `EXTENDED` użyj `PARTIALLY SUPERSEDED by ADR-028` z jasnym rozgraniczeniem user-editable vs code-level.

- [ ] **Step 3: Validation pass**

- [ ] Każdy ADR zachowuje originalną treść (tylko appendix)
- [ ] Linkowanie do ADR-028/029/030/031 i META-MODEL.md używa pełnych ścieżek
- [ ] Żadnego usuwania istniejącej treści

- [ ] **Step 4: Save each ADR**

---

## Task 7: Update `documentation-patterns` skill — dodanie markerów

**Files:**
- Modify: `new-doc/00-foundation/skills/documentation-patterns/SKILL.md`

**Source of truth:** spec §4.2 + §5.6 ("Update 1 istniejącego: `documentation-patterns` — markery UNIVERSAL/APEX-CONFIG/EVOLVING/LEGACY-D365").

- [ ] **Step 1: Read current skill**

Otwórz plik, zrozum istniejącą strukturę (frontmatter, sections). **Nie edytuj bez kontekstu.**

- [ ] **Step 2: Outline new section "Monopilot Documentation Markers"**

Nowa sekcja między istniejącymi. Zawartość:
- **Purpose:** markery oznaczają pochodzenie / stabilność / konfigurowalność wymagania.
- **4 markery — tabela:**

| Marker | Znaczenie | Kiedy użyć | Przykład |
|---|---|---|---|
| `[UNIVERSAL]` | Fundamentalne dla food-manufacturing MES, każdy klient to ma | Traceability lot, BOM structure, WO state machine | "System MUSI zapewniać forward/backward traceability <30s [UNIVERSAL]" |
| `[APEX-CONFIG]` | Apex ustawiła tak, inny klient może mieć inaczej (konfigurowalne w Settings) | Departamenty, kolumny Main Table, cascading reguły | "7 działów: Commercial, Development, Production, Quality, Planning, Procurement, MRP [APEX-CONFIG]" |
| `[EVOLVING]` | Projekt jeszcze się zmienia, trzymamy w DB nawet jeśli dziś tylko Apex | MRP struktura (2 działy?), niektóre walidacje | "MRP potencjalnie split na 2 działy [EVOLVING]" |
| `[LEGACY-D365]` | Istnieje tylko z powodu D365, zniknie po migracji (feature flag `integration.d365.enabled`) | D365 Builder logic, D365 error codes, D365 kolumny | "Kolumna D365_ItemNumber [LEGACY-D365]" |

- **Application rules:**
  - Markery obowiązkowe na każdym **wymaganiu** / **kolumnie tabeli** / **regule walidacji** / **punkcie workflow**.
  - Marker pisany bezpośrednio po treści (na końcu linii lub w nawiasie).
  - Niedozwolony brak markera w nowych dokumentach Phase A+ (review gate).
  - Istniejące dokumenty (pre-Phase 0) — progressive migration, nie big-bang.

- **Conflict resolution:** gdy wymaganie jest *zarówno* UNIVERSAL jak i ma Apex-specific value: użyj UNIVERSAL dla *zasady*, APEX-CONFIG dla *wartości*. Przykład: "System MUSI obsługiwać allergeny [UNIVERSAL]. Apex używa 14 EU allergens [APEX-CONFIG]."

- **Related:** META-MODEL.md, REALITY-SYNC.md (markery używane przy sync reality sources), spec §4.2.

- [ ] **Step 3: Write + insert section**

Wstaw sekcję w logicznym miejscu (np. po istniejącej sekcji "Comment patterns" albo jako nowy top-level section "Project-Specific Patterns: Monopilot Migration Markers"). Zachowaj istniejące sekcje nietknięte.

- [ ] **Step 4: Validation pass**

- [ ] Oryginalna treść nietknięta
- [ ] Frontmatter (name/description/tags) zaktualizowany o tag `monopilot` i wzmiankę "markery migration" w description (jeśli istnieje opis)
- [ ] Tabela markerów renderuje się poprawnie
- [ ] Zero code snippets w nowej sekcji

- [ ] **Step 5: Save**

---

## Task 8: New skill `schema-driven-design`

**Files:**
- Create: `new-doc/00-foundation/skills/schema-driven-design/SKILL.md`

**Source of truth:** ADR-028 (Task 2) + META-MODEL §1.

- [ ] **Step 1: Outline (wzór z istniejących skilli np. `architecture-adr/SKILL.md`)**

Struktura:
- **Frontmatter:** `name: schema-driven-design`, `description: "When to model domain as user-editable metadata (schema-driven) vs code-driven in Monopilot"`, `tags: [monopilot, schema, configuration, meta-model, architecture]`.
- **When to use:** projekt modułu / tabeli / zestawu walidacji; decyzja architektoniczna "czy to ma być w kodzie czy w Settings"; review proponowanej zmiany.
- **Rule of thumb — 3 pytania decyzyjne:**
  1. Czy *inna firma* mogłaby tego potrzebować inaczej? TAK → schema-driven.
  2. Czy *Apex* zmienia to częściej niż raz na 6 miesięcy? TAK → schema-driven.
  3. Czy to regulatoryjne lub matematyczne (formuły, identyfikatory GS1, itp.)? TAK → code-driven.
- **Pattern: atrybuty metadanej kolumny** (stabilny set atrybutów per obiekt) — bez konkretów technicznych, lista atrybutów jako tabela.
- **Anti-patterns:**
  - Full no-code builder (YAGNI — META-MODEL §3).
  - Hardcoded enums dla departamentów / kolumn / reguł (blokuje multi-tenant).
  - Schema-driven dla rzeczy stałych prawnie (allergeny EU-14, GTIN format).
- **Examples (z markerami):**
  - Kolumna `Pack_Size` w NPD Main Table → schema-driven [APEX-CONFIG], bo Apex dodaje rozmiary miesięcznie.
  - Walidacja GS1-128 format → code-driven [UNIVERSAL], bo regulatoryjne.
  - Departament `Quality` → schema-driven [APEX-CONFIG] (ADR-030).
- **Handoff do innych skilli:** `rule-engine-dsl` (gdy schema-driven potrzebuje reguł dynamicznych), `multi-tenant-variation` (gdy variation per org), `architecture-adr` (gdy decyzja warta ADR).
- **Related:** ADR-028, META-MODEL §1 i §3, spec §2.

- [ ] **Step 2: Write full content**

80–150 linii zgodnie z outline-m. Format spójny z np. `architecture-adr/SKILL.md` (sprawdź structure istniejącego skilla przed napisaniem).

- [ ] **Step 3: Validation pass**

- [ ] Frontmatter kompletny (name/description/tags)
- [ ] "When to use" jest konkretne (nie generic)
- [ ] 3 pytania decyzyjne jednoznaczne
- [ ] Examples z markerami
- [ ] Cross-ref do ADR-028 i META-MODEL

- [ ] **Step 4: Save**

---

## Task 9: New skill `rule-engine-dsl`

**Files:**
- Create: `new-doc/00-foundation/skills/rule-engine-dsl/SKILL.md`

**Source of truth:** ADR-029 (Task 3) + META-MODEL §2 i §8.

- [ ] **Step 1: Outline**

Struktura:
- **Frontmatter:** `name: rule-engine-dsl`, `description: "Scope and application of Monopilot's mini rule-engine DSL: cascading dropdowns, conditional required, gate criteria, workflow definitions as data"`, `tags: [monopilot, rules, dsl, workflow, meta-model]`.
- **When to use:** projektowanie reguły walidacji / cascading / gate / workflow w dowolnym module; review czy proponowana reguła mieści się w DSL scope.
- **Scope — 4 obszary (twardy limit):** lista z jednym przykładem per obszar (zgodnie z ADR-029).
- **When NOT to use:** reguły matematyczne (formuły BOM costing), integracje, logika transakcyjna, regulatoryjne (GS1, HACCP) — to code-driven, nie DSL.
- **Semantic primitives (bez konkretnej składni):** predicates (field-comparison, boolean combinators), actions (allow-values, set-required, block-transition, require-checklist), references (literals, other-field, reference-table, org-config).
- **Documentation format in ADRs / module docs:** gdy opisujesz regułę, użyj tabeli decyzyjnej albo Mermaid state diagram; NIE pisz konkretnego JSON / SQL / TS.
- **Markery application:** silnik DSL runtime = `[UNIVERSAL]`, każda konkretna reguła = `[APEX-CONFIG]` lub `[EVOLVING]`.
- **Handoff:** `schema-driven-design` (gdy reguła referencjuje schema-driven pole), `multi-tenant-variation` (gdy reguła różni się per org).
- **Related:** ADR-029, META-MODEL §2 i §8, ADR-007.

- [ ] **Step 2: Write full content**

80–150 linii. Mermaid example (np. cascading chain Pack_Size → Line → Dieset).

- [ ] **Step 3: Validation pass**

Standard + (1) twardy limit 4 obszary explicite, (2) anti-pattern "DSL over-reach" opisany.

- [ ] **Step 4: Save**

---

## Task 10: New skill `reality-sync-workflow`

**Files:**
- Create: `new-doc/00-foundation/skills/reality-sync-workflow/SKILL.md`

**Source of truth:** REALITY-SYNC.md (Task 12) + spec §4.5.

**Note:** Ten skill powinien być napisany PO Task 12 (REALITY-SYNC.md), żeby cross-ref był 1:1. Jeśli wykonywany równolegle, uzgodnij terminy.

- [ ] **Step 1: Outline**

Struktura:
- **Frontmatter:** `name: reality-sync-workflow`, `description: "Discipline for syncing external reality sources (PLD v7 Excel, Power Automate, D365, Access DBs, other Excels) into Monopilot documentation without drift"`, `tags: [monopilot, sync, reality-sources, documentation, meta-model]`.
- **When to use:** każda zmiana reality source (np. dodanie kolumny w Smart_PLD_v7.xlsm); review doc-u modułowego który powinien odzwierciedlać reality source.
- **Core principle:** zmiana reality source → update `_meta/reality-sources/<source>/*` w **tej samej sesji**. Update modułów Monopilot w **osobnej sesji** z brainstormem markera.
- **Two-session pattern:**
  - **Session 1 (sync):** identyfikuj zmianę → zaktualizuj reality source doc → zanotuj w HANDOFF.md że propagacja do modułów czeka.
  - **Session 2 (propagation):** przeczytaj HANDOFF → brainstorm marker per zmiana → update modułów Monopilot → link back do reality source.
- **Anti-patterns:**
  - Update modułu Monopilot bez update reality source (drift).
  - Update reality source i modułu w jednej sesji (brakuje brainstormu markera).
  - Brak markera w propagowanej zmianie.
- **Reality sources registry (bootstrap):** lista z spec §4.5 (pld-v7-excel, power-automate, d365-integration, access-databases, other-excels). Status: `pld-v7-excel` = Phase A target.
- **Handoff:** `documentation-patterns` (markery), `schema-driven-design` (decyzja czy nowa kolumna to schema-driven czy code-driven).
- **Related:** REALITY-SYNC.md, spec §4.5, DOCUMENTATION-SYNC.md (istniejący pattern na którym bazujemy).

- [ ] **Step 2: Write full content**

80–150 linii.

- [ ] **Step 3: Validation pass**

Standard + (1) "two-session pattern" jasno opisany, (2) anti-patterns konkretne, (3) cross-ref do REALITY-SYNC.md pattern file.

- [ ] **Step 4: Save**

---

## Task 11: New skill `multi-tenant-variation`

**Files:**
- Create: `new-doc/00-foundation/skills/multi-tenant-variation/SKILL.md`

**Source of truth:** ADR-031 (Task 5) + META-MODEL §4 + ADR-003.

- [ ] **Step 1: Outline**

Struktura:
- **Frontmatter:** `name: multi-tenant-variation`, `description: "Patterns for per-org schema variation in Monopilot multi-tenant architecture"`, `tags: [monopilot, multi-tenant, rls, supabase, meta-model]`.
- **When to use:** projektowanie tabeli / reguły / zasobu w którym musi być variation per org; review czy proponowana zmiana respektuje 4-warstwowy model (L1 core / L2 column defs / L3 rules / L4 reference data).
- **Core model — 4 warstwy (z ADR-031):** szybka tabela z examples per layer.
- **RLS pattern reminder:** users-lookup (ADR-013) stosujemy jednolicie dla L1/L2/L3/L4 config tables.
- **Seed strategy:** food-manufacturing-SMB default template → customize per org. Apex = template + 12 miesięcy customizacji.
- **Anti-patterns:**
  - Hardcoded per-client values (blokuje onboarding nowego org).
  - Separate DB per tenant (ADR-003 rejected this).
  - L1 schema change bez migration + ADR (L1 jest stały).
- **Handoff:** `schema-driven-design` (L2), `rule-engine-dsl` (L3), `supabase-rls` (L1 RLS patterns).
- **Related:** ADR-031, ADR-003, ADR-013, META-MODEL §4.

- [ ] **Step 2: Write full content**

80–150 linii.

- [ ] **Step 3: Validation pass**

Standard + 4-warstwy model jasno przedstawiony + anti-patterns konkretne.

- [ ] **Step 4: Save**

---

## Task 12: REALITY-SYNC.md pattern

**Files:**
- Create: `new-doc/00-foundation/patterns/REALITY-SYNC.md`

**Source of truth:** spec §4.5. Wzór struktury: istniejący `DOCUMENTATION-SYNC.md`.

- [ ] **Step 1: Read existing DOCUMENTATION-SYNC.md as structural reference**

Otwórz i zrozum układ (już w kontekście). REALITY-SYNC ma podobną strukturę ale dla external sources (nie code).

- [ ] **Step 2: Outline**

Sekcje (wzorowane na DOCUMENTATION-SYNC):
- **Purpose:** prevent drift between external reality sources (Excel files, Access DBs, Power Automate flows, D365) and Monopilot documentation.
- **Reality sources inventory:** tabela z 5 źródeł (pld-v7-excel, power-automate, d365-integration, access-databases, other-excels), status (target Phase A / later), kontakt-agent (kto odpowiada za sync).
- **Sync triggers — 4 kategorie:**
  - (1) **Reality source change detected** — zmiana w external system (np. nowa kolumna w PLD v7) → immediate sync to `_meta/reality-sources/<source>/*`.
  - (2) **Periodic reality audit** — raz na kwartał, pełny scan źródeł vs `_meta/reality-sources/*`.
  - (3) **Module documentation change** — zmiana w `NN-module/*` która powinna mieć backing reality source → warn jeśli reality source out of date.
  - (4) **Release gate** — przed Phase closure (A/B/C/D), cała reality layer `_meta/reality-sources/*` musi być `current`.
- **Two-session pattern (obowiązkowy):**
  - **Session A — capture:** zmiana reality → update `_meta/reality-sources/<source>/<file>.md` + wpis w HANDOFF "needs propagation to modules X, Y, Z".
  - **Session B — propagate:** read HANDOFF → per zmiana brainstorm marker → update moduły → link back do reality source z pełną ścieżką.
- **Markery at sync time:** każda propagowana zmiana musi dostać marker (UNIVERSAL / APEX-CONFIG / EVOLVING / LEGACY-D365). Brainstorm "jakie to jest" to kluczowa aktywność Session B.
- **Drift detection:**
  - Green (<10%): reality source current, propagation complete.
  - Yellow (10–25%): reality source out-of-date lub propagation w backlog.
  - Red (>25%): priorytet, block new module work until synced.
- **Version tagging reality source files:** frontmatter identyczny z DOCUMENTATION-SYNC (`doc_version`, `source_version`, `last_sync`, `sync_status`).
- **Quality gates per phase:** Phase A = sync complete dla PLD v7, Phase B = NPD module propagation complete, Phase C = wszystkie 15 modułów sync, Phase D = cross-reality review.
- **Integration with VBA pipeline (PLD v7 specific):** zmiana v7 via vba-pipeline skill → hook / reminder: "add `_meta/reality-sources/pld-v7-excel/*` update to this session".
- **Related:** DOCUMENTATION-SYNC.md (wzór strukturalny — różnica: code vs external sources), spec §4.5, skill `reality-sync-workflow`, spec §7.2 R2 (risk mitigation).

- [ ] **Step 3: Write full content**

150–250 linii. Tabele dla reality sources, triggers, drift thresholds. Mermaid diagram pokazujący two-session pattern.

- [ ] **Step 4: Validation pass**

- [ ] Struktura analogiczna do DOCUMENTATION-SYNC.md (czytelność)
- [ ] Wszystkie 5 reality sources wymienione (nawet jeśli tylko PLD v7 jest Phase A target)
- [ ] Two-session pattern explicit
- [ ] Cross-ref do skill `reality-sync-workflow`, spec §4.5, DOCUMENTATION-SYNC.md

- [ ] **Step 5: Save**

---

## Task 13: SKILL-AUDIT review + CONSOLIDATION + REGISTRY/SKILL-MAP

**Rozszerzony zakres (decyzja 2026-04-17):** oryginalny task to review+REGISTRY+SKILL-MAP, ale użytkownik zaakceptował konsolidację skilli z 48 → ~25–30. Task 13 rośnie o consolidation subagent job.

**Files:**
- Read: `new-doc/00-foundation/skills/SKILL-AUDIT.md` (już utworzony przez subagent)
- Modify: `new-doc/00-foundation/skills/REGISTRY.yaml` — cleanup missing 6, deprecate orphan `fix-bugs`, accept merge groups, add 4 new meta-model skills + `food-industry-mes` placeholder
- Create: `new-doc/00-foundation/skills/SKILL-MAP.yaml` — mapa phase/moduł → skille (wg struktury z SKILL-AUDIT §6.1)
- Create (konsolidacja — nowe pakiety zastępujące duplikaty):
  - `new-doc/00-foundation/skills/nextjs-v16-patterns/SKILL.md` — merge z `nextjs-app-router` + `nextjs-server-components` + `nextjs-server-actions` + `nextjs-middleware`
  - `new-doc/00-foundation/skills/react-19-patterns/SKILL.md` — merge z `react-hooks` + `react-performance` + `react-forms` + `react-state-management`
  - `new-doc/00-foundation/skills/typescript-patterns-v2/SKILL.md` — merge z `typescript-patterns` + `typescript-generics` + `typescript-api-types` (NIE `typescript-zod` — osobno, validation-specific)
  - `new-doc/00-foundation/skills/api-design/SKILL.md` — merge z `api-rest-design` + `api-error-handling` + `api-validation`
  - `new-doc/00-foundation/skills/api-security/SKILL.md` — wyłonić z `api-authentication` + bits z `security-backend-checklist` dot. API
  - `new-doc/00-foundation/skills/testing-patterns/SKILL.md` — merge `testing-tdd-workflow` + `testing-react-testing-lib` + `testing-msw` wokół Vitest jako framework (zostaje osobno: `testing-playwright` — E2E)
  - `new-doc/00-foundation/skills/domain/food-industry-mes/SKILL.md` — PLACEHOLDER (pełny draft w Phase A)
- Delete (po merge — zachować w `other/archive/skills-consolidated-2026-04-17/` nie kasujemy hard):
  - `nextjs-app-router/`, `nextjs-server-components/`, `nextjs-server-actions/`, `nextjs-middleware/`
  - `react-hooks/`, `react-performance/`, `react-forms/`, `react-state-management/`
  - `typescript-patterns/`, `typescript-generics/`, `typescript-api-types/`
  - `api-rest-design/`, `api-error-handling/`, `api-validation/`, `api-authentication/`
  - `testing-tdd-workflow/`, `testing-react-testing-lib/`, `testing-msw/`, `testing-monopilot/`
  - `fix-bugs/` (deprecate — przeniesienie do archive)
- REGISTRY cleanup (nie tworzymy plików — usuwamy wpisy):
  - Remove: `testing-jest`, `docker-basics`, `agile-retrospective`, `requirements-clarity-scoring`, `research-source-evaluation`, `skill-quality-standards` (6 missing — nigdy nie istniały fizycznie)

**Target po konsolidacji:** 48 istniejących → ~28 skilli:
- Supabase: 6 (bez zmian — każdy odrębny koncept)
- React/Frontend pakiet: 3 (nextjs-v16-patterns, react-19-patterns, tailwind-patterns)
- TypeScript: 2 (typescript-patterns-v2, typescript-zod)
- Testing: 2 (testing-patterns, testing-playwright)
- API: 2 (api-design, api-security)
- Code quality: 4 (code-review-checklist, git-workflow, git-conventional-commits, documentation-patterns, refactoring-patterns) — 5
- DevOps: 2 (ci-github-actions, env-configuration)
- UX/Security: 3 (accessibility-checklist, security-backend-checklist, ui-ux-patterns)
- Planning: 5 (invest-stories, discovery-interview-patterns, prd-structure, architecture-adr, qa-bug-reporting)
- Meta: 1 (version-changelog-patterns) — reszta usunięta bo missing
- Monopilot-specific: 1 (monopilot-patterns rebrand)
- Meta-model (nowe): 4 (schema-driven-design, rule-engine-dsl, reality-sync-workflow, multi-tenant-variation)
- Domain: 1 placeholder (food-industry-mes — full w Phase A)

Łącznie: ~31. Jeśli okaże się że `code-review-checklist` można zmergować z `refactoring-patterns` → 30. Celujemy w 28–31.

**Source of truth:** SKILL-AUDIT.md §3 (DEPRECATE/MERGE/TUNE/ADD) + §5 (gaps) + §6 (SKILL-MAP) + §7 (open questions — decyzje juz podjęte).

**Blocking dependency:** SKILL-AUDIT.md już istnieje (subagent skończył przed Task 14). Żadne dalsze czekanie.

- [ ] **Step 1: Read SKILL-AUDIT.md (już istnieje)**

Pełny read. Wszystkie decyzje userskie §7 są już rozstrzygnięte (zapisane w nagłówku tego task-u + w File Structure). Mass-delete/merge autoryzowany.

- [ ] **Step 2: Spawn consolidation subagent (background)**

Dispatch dedykowanego subagenta który wykona merge per grupa:

**Subagent zadania — pakiet 1 (Next.js + React + TS + API + Testing merges):**
Dla każdego merge-grupy z File Structure:
1. Przeczytaj SKILL.md każdego skill-a w grupie.
2. Zidentyfikuj wspólne patterny i unikalne zalety.
3. Napisz zmergowany SKILL.md (docelowy plik z File Structure) który:
   - Ma frontmatter (name/description/tags) scalony
   - Organizuje treść w sekcje per podobszar (np. `nextjs-v16-patterns` ma sekcje: App Router / Server Components / Server Actions / Middleware)
   - Zachowuje wszystkie unikalne patterny z originalnych skilli
   - Aktualizuje wersje (React 19, Next 16, Vitest zamiast Jest w przykładach testowych)
4. Dla `testing-patterns`: używaj Vitest API (nie Jest) — migration aware (Vitest API 95% kompatybilne z Jest).
5. Per każdy oryginał który wchodzi w merge: move folder do `new-doc/00-foundation/other/archive/skills-consolidated-2026-04-17/<oryginalna-nazwa>/` (zachować, nie kasować hard).
6. `fix-bugs` i `testing-monopilot` też idą do archive z komentarzem (fix-bugs deprecated, testing-monopilot merged into testing-patterns).

**Output:** 6 nowych SKILL.md + 18 archived originals + raport `CONSOLIDATION-REPORT.md` z listą co → gdzie.

- [ ] **Step 3: Checkpoint — user review consolidation report**

Przed commit REGISTRY, pokaż użytkownikowi `CONSOLIDATION-REPORT.md`. User ma zielone światło od początku (ta rozmowa), ale review + veto możliwe.

- [ ] **Step 4: Update REGISTRY.yaml**

Modyfikacje (po konsolidacji):
- **Remove** 6 missing skilli z REGISTRY: `testing-jest`, `docker-basics`, `agile-retrospective`, `requirements-clarity-scoring`, `research-source-evaluation`, `skill-quality-standards`.
- **Remove** wpisy merged originals (nextjs-*, react-*, typescript-patterns/generics/api-types, api-*, testing-* except playwright) i `fix-bugs`.
- **Add** 6 consolidated skilli: `nextjs-v16-patterns`, `react-19-patterns`, `typescript-patterns-v2`, `api-design`, `api-security`, `testing-patterns`.
- **Add** 4 meta-model skilli: `schema-driven-design`, `rule-engine-dsl`, `reality-sync-workflow`, `multi-tenant-variation`.
- **Add** sekcja `domain:` z `food-industry-mes` jako `status: draft` (placeholder, Phase A fills).
- **Add** `monopilot-patterns` i `testing-monopilot`→merged (wpis tylko za pierwszy, z notką "testing-monopilot merged 2026-04-17").
- **Rebrand:** gdziekolwiek "MonoPilot" → "Monopilot" w description/tags (konsystencja).
- Update `metadata.total_skills` do rzeczywistej liczby (target ~28–31).
- Update `metadata.version` do `2.0.0` (breaking change: struktura zmieniona) + `last_full_audit: 2026-04-17`.
- Update `skill_index` (na dole pliku) — przepisać z nową listą, usunąć merged.

Format identyczny jak istniejące skille (version/file/tokens/confidence/status/tags).

- [ ] **Step 4: Create SKILL-MAP.yaml**

Nowy plik. Struktura (z spec §5.2 + rozszerzenie):

```yaml
metadata:
  version: 1.0.0
  last_updated: 2026-04-17
  purpose: "Map which skills to invoke for each phase and module in Monopilot Migration"

phases:
  phase-0-meta-spec:
    required:
      - architecture-adr
      - documentation-patterns
      - schema-driven-design
      - rule-engine-dsl
      - multi-tenant-variation
      - reality-sync-workflow
    optional:
      - prd-structure
    rationale: "Writing META-MODEL + 4 ADRs + REALITY-SYNC + 4 new skills"

  phase-A-pld-v7-reality:
    required:
      - documentation-patterns
      - discovery-interview-patterns
      - reality-sync-workflow
    optional:
      - schema-driven-design
    rationale: "Documenting external reality (PLD v7 Excel) into _meta/reality-sources/"

  phase-D-architecture-closure:
    required:
      - architecture-adr
      - documentation-patterns
      - schema-driven-design
      - multi-tenant-variation
    rationale: "Reconcile 16 modules with NPD-first order"

  phase-B-npd-update:
    required:
      - monopilot-patterns
      - invest-stories
      - prd-structure
      - documentation-patterns
      - schema-driven-design
    optional:
      - multi-tenant-variation
      - rule-engine-dsl
    rationale: "Update NPD module 1:1 with PLD v7 reality"

  phase-C-module-swarm:
    agent-required:
      - documentation-patterns
      - prd-structure
      - monopilot-patterns
      - schema-driven-design
    agent-optional:
      - rule-engine-dsl
      - multi-tenant-variation
    rationale: "Agent propagates NPD pattern to 15 remaining modules"

modules:
  "00-foundation":
    - architecture-adr
    - documentation-patterns
    - schema-driven-design
  "01-settings":
    - architecture-adr
    - documentation-patterns
    - multi-tenant-variation
    - schema-driven-design
  "09-npd":
    - monopilot-patterns
    - invest-stories
    - schema-driven-design
    - rule-engine-dsl
    - reality-sync-workflow
  # ... placeholder dla pozostałych 13 — TBD w Phase D (open question)
```

Include comment at top: "Modules section jest partial w Phase 0 — complete after Phase D module reordering."

- [ ] **Step 5: Validation pass**

- [ ] REGISTRY.yaml: YAML waliduje, ~28–31 skilli obecnych, skill_index zaktualizowany, metadata.total_skills poprawiony, wersja 2.0.0
- [ ] Archive folder `other/archive/skills-consolidated-2026-04-17/` zawiera 18+ oryginałów
- [ ] CONSOLIDATION-REPORT.md obecny
- [ ] 6 nowych merged SKILL.md walidują (frontmatter kompletny, Vitest nie Jest w testing-patterns)
- [ ] SKILL-MAP.yaml: YAML waliduje, wszystkie 5 faz obecne, każda faza ma required + rationale
- [ ] Cross-references w SKILL-MAP do REGISTRY (wszystkie wymienione skille istnieją w REGISTRY — żadnego pointera do usuniętych/merged)
- [ ] food-industry-mes placeholder istnieje (domain/food-industry-mes/SKILL.md z "draft — Phase A" note)
- [ ] SKILL-AUDIT.md zachowany (nie kasujemy raportu agenta — to reference)
- [ ] Monopilot branding jednolity (nie MonoPilot)

- [ ] **Step 6: Save all files**

---

## Task 14: Quality gate — user review

**Files:** no file modifications — checkpoint human interaction.

**Source of truth:** spec §5.4 Phase 0 row ("META-MODEL + 4 ADRs + 4 new skills + SKILL-AUDIT ukończone, user review").

- [ ] **Step 1: Prepare review summary**

Sparsuj wszystkie deliverables z Task 1–13 w zwięzły overview:
- META-MODEL.md — X linii, 8 sekcji complete.
- ADR-028/029/030/031 — każdy Y linii, status ACCEPTED.
- Supersede notes — appended to ADR-003/011/012/015.
- `documentation-patterns` — nowa sekcja markery added.
- 4 nowe skille — szablony complete, cross-references valid.
- REALITY-SYNC.md — pattern complete.
- SKILL-AUDIT.md — recommendations accepted: [lista].
- REGISTRY.yaml — updated, SKILL-MAP.yaml created.

- [ ] **Step 2: Present review to user**

Lista kontrolna do weryfikacji:
- [ ] META-MODEL.md 8 sekcji oddaje intent meta-modelu
- [ ] ADRs cross-reference poprawnie
- [ ] Markery application zrozumiałe
- [ ] 4 nowe skille są konkretne (nie generic)
- [ ] SKILL-MAP phases alignują się z planem A/D/B/C
- [ ] Skill audit recommendations są sensowne
- [ ] Open questions do Phase D/B/C jasno oznaczone

- [ ] **Step 3: Address feedback**

Jeśli user zgłasza zmiany: zrób iterację per plik. Jeśli major redesign (np. "META-MODEL potrzebuje 9-tego punktu") — brainstorm przed, potem update.

- [ ] **Step 4: Close gate on user approval**

Zapisz w session log: "Phase 0 quality gate PASSED at YYYY-MM-DD by user".

---

## Task 15: Phase 0 close — HANDOFF + memory updates

**Files:**
- Create: `new-doc/_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md`
- Modify: `~/.claude/projects/C--Users-MaKrawczyk-PLD/memory/project_monopilot_migration.md` (aktualizacja statusu fazy)

**Source of truth:** spec §5.1 HANDOFF.md format.

- [ ] **Step 1: Draft HANDOFF for Phase A**

Format zgodny ze strukturą istniejącego HANDOFF (`2026-04-17-phase-0-bootstrap.md`):

```markdown
# HANDOFF — Phase 0 close + Phase A bootstrap

**From session:** 2026-04-17 Phase 0 execution
**To session:** Phase A Session 1 (PLD v7 reality — PROCESS-OVERVIEW + DEPARTMENTS)
**Phase:** A of (0 → A → D → B → C)

## Co zrobione (Phase 0)
[lista deliverables z Task 14 summary]

## Co dalej — Phase A Session 1
Deliverables:
- _meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md
- _meta/reality-sources/pld-v7-excel/DEPARTMENTS.md

Scope: End-to-end PLD v7 flow (kto, co, kiedy, po co) + 7 działów Apexa with handoffs between them.

## Kontekst do odświeżenia (MUSI przeczytać na starcie)
1. META-MODEL.md (świeży)
2. REALITY-SYNC.md (świeży)
3. skill: reality-sync-workflow (świeży)
4. spec §3.2 (Phase A detail)
5. Smart_PLD_v7.xlsm structure + v7/ scripts (reality source)

## Skille do inwokowania (z SKILL-MAP phase-A)
- documentation-patterns
- reality-sync-workflow
- discovery-interview-patterns

## Open questions (carried forward)
- [lista z Task 13 i earlier tasks które odłożyliśmy do Phase A/D]

## Zasady (przypomnienie)
- Pure documentation, NO CODE SNIPPETS
- Markery obowiązkowe
- Two-session pattern — Session 1 = capture reality, propagation do modułów w osobnej sesji
```

- [ ] **Step 2: Update memory `project_monopilot_migration.md`**

Zmiany:
- Sekcja "Stan projektu" — aktualizacja: "Phase 0 COMPLETE (2026-04-17). Phase A bootstrap gotowy."
- Sekcja "Plan faz (status)" — zmień "Phase 0 ← NASTĘPNY KROK" na "Phase 0 — COMPLETE (2026-04-17)", "Phase A ← NASTĘPNY KROK".
- Sekcja "Kluczowe dokumenty" — zaktualizuj "Aktywny HANDOFF" na nowy plik Phase A bootstrap.
- Zachowaj wszystko inne (decyzje, powiązania).

- [ ] **Step 3: Verify MEMORY.md index**

Check że `MEMORY.md` wciąż poprawnie linkuje do `project_monopilot_migration.md`. Nie modyfikuj chyba że wpis się zmienił (description nie powinien).

- [ ] **Step 4: Session close — final summary to user**

Zwięzłe podsumowanie (5–10 linii):
- Phase 0 complete: X deliverables (lista).
- Phase A Session 1 ready — HANDOFF gotowy.
- Memory zaktualizowana.
- Next session: user może resetować i odpalić "przeczytaj memory i wykonaj handoff" jak w tej sesji.

---

## Self-Review Checklist (run before marking plan complete)

**1. Spec coverage** — czy każdy deliverable z spec §2.2 (META-MODEL + 4 ADRs), §3.1 (Phase 0 Claude track: 4 skille + documentation-patterns update + REALITY-SYNC), §3.1 (parallel agent track: SKILL-AUDIT + REGISTRY update + SKILL-MAP) ma odpowiedni task?
- ✅ META-MODEL → Task 1
- ✅ ADR-028/029/030/031 → Task 2/3/4/5
- ✅ Supersede markers → Task 6
- ✅ `documentation-patterns` update → Task 7
- ✅ 4 nowe skille → Task 8/9/10/11
- ✅ REALITY-SYNC pattern → Task 12
- ✅ SKILL-AUDIT review + REGISTRY + SKILL-MAP → Task 13
- ✅ Quality gate → Task 14
- ✅ HANDOFF + memory close → Task 15

**2. Placeholder scan** — wszystkie "TBD" / "TODO" w tym planie są zamierzone jako *open questions to future phases* (Phase B/C/D) — explicite oznaczone i uzasadnione (np. module-specific skill map uzupełniony po Phase D reordering). Żadnego "fill in later" dla content który Phase 0 powinien wyprodukować.

**3. Type / identifier consistency:**
- ADR numery konsystentne: 028/029/030/031 wszędzie.
- Markery: zawsze `[UNIVERSAL]` / `[APEX-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]` — dokładnie ta forma, żadnych wariantów (`universal`, `UNIVERSAL`, `Universal`).
- Skill names: `schema-driven-design`, `rule-engine-dsl`, `reality-sync-workflow`, `multi-tenant-variation` — kebab-case, spójne z istniejącymi (np. `architecture-adr`).
- Path conventions: `new-doc/00-foundation/...` (pełne ścieżki w cross-references), oraz `_meta/reality-sources/pld-v7-excel/*` dla reality layer.
- Ścieżka spec-a: `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md` (single source).

**4. Konwencja steps:** każdy task ma Outline → Write → Validation → Save (czasem Read first dla modify tasks). Żadne skróty.

**5. No code snippets rule:** task 2–6 (ADRs) i 12 (pattern) explicite walidują brak SQL/TS/VBA. Tasks 7/8/9/10/11 (skille) dopuszczają pseudokod/Mermaid bo skille to guidance — ale też bez konkretnego SQL/TS.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-17-phase-0-meta-spec.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration. Good for Phase 0 because tasks are independent-ish and reviewable piecewise.

**2. Inline Execution** — wykonanie w bieżącej sesji z checkpointami po każdym task-u. Dobre gdy chcemy kompaktowo zamknąć Phase 0 w jednej sesji.

**Rekomendacja:** **Subagent-driven** — Phase 0 ma 15 tasków, inline to zbyt dużo kontekstu w jednej sesji. Subagent-driven pozwala:
- Parallel execution Task 2–5 (niezależne ADRs)
- Parallel Task 8–11 (niezależne skille, po swoich ADRs)
- Review między tasks — szybkie wychwycenie driftu zanim propaguje
- Subagent skill audit już działa w tle — pasuje do wzorca

**Która opcja?**
