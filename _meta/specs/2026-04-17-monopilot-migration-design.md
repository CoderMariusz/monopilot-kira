# Monopilot Migration — Design Spec

**Date:** 2026-04-17
**Status:** Draft — pending user review
**Scope:** Migracja dokumentacji `new-doc/` z 16 modułami + wchłonięcie Smart PLD v7 (Excel/VBA) jako pierwszego "reality source" do docelowego Monopilot (NPD-first → MES → docelowe zastąpienie D365)
**Supersedes:** n/a (uzupełnia `2026-04-16-smart-pld-v7-redesign-design.md` — PLD v7 pozostaje aktywny ~12 miesięcy jako równoległy system)
**Related:** `00-foundation/prd/prd.md`, `00-foundation/decisions/*` (ADRs 001-027), `_meta/HANDOVER-2026-02-16.md`

---

## 1. Kontekst i cel

### 1.1 Tło

Forza rozwija równolegle dwa projekty które zaczynają się pokrywać:

1. **Smart PLD v7** — Excel/VBA system aktywnie używany w firmie (product lifecycle + 7 działów + main table ~60-80 kolumn + D365 integration via paste/export). Jeszcze projektowany — schema kolumn, walidacje, struktura działów nie są zamknięte.
2. **Monopilot** — web-app MES dla SMB food-manufacturing (16 modułów docelowo, `new-doc/` zawiera 114+ plików dla samego NPD, setki dla reszty). Moduł `09-npd/` pokrywa się z tym co PLD v7 robi dziś.

### 1.2 Cel strategiczny (12-miesięczny horyzont)

- **Dual maintenance:** PLD v7 żyje i rośnie (Forza operuje na Excelu). Monopilot budowany równolegle, tak by docelowo **migracja = przełączenie systemu, nie rewrite procesu**.
- **NPD-first implementation order:** Monopilot nie zaczyna od MES — zaczyna od produktów → BOM → kalkulacji → pilot WO → docelowo MES + reszta.
- **Multi-tenant ready from day 1:** Monopilot ma obsługiwać inne firmy bez zmian core. Forza = pierwsza konfiguracja, nie jedyna.
- **D365 replacement:** długoterminowo Monopilot zastępuje także D365, konkurując modularnością i niższymi kosztami utrzymania.

### 1.3 Cel tego spec-a

Zaprojektować **plan migracji dokumentacji** który:
- Ustanawia meta-model architektury (schema-driven / configurable) zanim ruszymy przepisywanie dokumentów
- Dokumentuje PLD v7 jako "ground truth" (reality source)
- Domyka kolejność implementacji Monopilot (NPD-first)
- Aktualizuje moduł NPD `09-npd/` 1:1 z procesami PLD v7
- Propaguje wzorzec na pozostałe 15 modułów przez armię agentów
- Utrzymuje czystość dokumentacji (**no code snippets**, pure docs + decisions)

### 1.4 Goals / Non-goals

**Goals:**
- Kompletny, spójny `new-doc/` w którym każdy moduł jest schema-driven i multi-tenant ready
- Jawny separator między tym co **uniwersalne** dla food-manufacturing MES a co **specyficzne dla Forzy**
- Skalowalna warstwa skilli (agenty wiedzą które skille wywołać w jakim module/fazie bez manualnej pamięci użytkownika)
- Utrzymalny sync PLD v7 ↔ `new-doc/` przez 12 miesięcy dual-maintenance
- Przygotowanie gruntu pod docelową migrację D365 → Monopilot

**Non-goals:**
- Pisanie kodu implementacji Monopilot (to po domknięciu dokumentacji, przez osobne spec + plan)
- Redesign PLD v7 Excel (v7 działa — nie dotykamy, tylko dokumentujemy)
- Pisanie testów / PoC-ów funkcji Monopilot
- Decyzje biznesowe dot. pricing / sprzedaży do innych firm

---

## 2. Meta-model — fundament wszystkiego co napiszemy

Meta-model to centralny dokument (`00-foundation/decisions/META-MODEL.md`) definiujący **co w Monopilot jest schema-driven (edytowalne przez użytkownika w Settings) a co code-driven**. Wszystkie 16 modułów są projektowane przez tę soczewkę.

### 2.1 Zawartość meta-modelu

**Punkt 1 — Schema-driven domain (Level "a" konfigurowalności):**
Obiekty CRUD-owalne w Settings bez dewelopera:
- Kolumny tabel (label, type, required, owner department, visible-for-role, validation regex, default)
- Departamenty (name, code, color, sort, leader)
- Reguły walidacji per kolumna (required / regex / range / enum)
- Reference tables (PackSizes, Lines, Dieset, Templates, EmailConfig + dowolne nowe lookup-y)
- Role × permissions matrix (rozszerzenie ADR-012)
- Module toggles (rozszerzenie ADR-011)
- Status colors / workflow stage names / gate checklist items
- Notification templates

**Punkt 2 — Rule engine furtka (Level "b"):**
Mały DSL (interpretowany z danych, nie kodu) dla 3–5 obszarów:
- Cascading dropdowns (np. Pack_Size → Line → Dieset → Material)
- Conditional required (np. "pole X required gdy Dept Y aktywny")
- Gate entry criteria (dynamiczne checklisty bramkowe)
- **Workflow definitions as data** (zobacz punkt 8) — state machine zdefiniowana jako JSON/DB, nie kod

Jeden runtime silnik rule engine dla wszystkich modułów (nie per-moduł).

**Punkt 3 — Code-driven domain (pozostaje w kodzie, YAGNI):**
- Workflow state machines (rozszerzenie ADR-007 — silnik, nie definicje)
- Integracje zewnętrzne (D365, email providers, scanner SDK)
- Obliczenia kosztów BOM (formuła matematyczna, niekonfigurowalna per user)
- UI layouts (strukturalnie stabilne)
- Silnik rule engine (meta-warstwa)

**Punkt 4 — Multi-tenant variation points:**
Oparte o ADR-003 (RLS). Każda firma ma *własną konfigurację* na tych samych tabelach — `org_id` izoluje schema. Nowy **ADR-031: Schema variation per org**.

**Punkt 5 — Migracja z D365 (mapa pojęć):**
Mapping D365 encji/tabel na schema-driven Monopilot. Długoterminowy punkt zaczepienia dla wychłonięcia D365. Żyje w `_meta/reality-sources/d365-integration/` (zobacz §4).

**Punkt 6 — Zasada universal vs Forza-specific:**
Każdy dokument modułu **musi** jawnie oznaczać które wymagania są uniwersalne a które to Forza config (zobacz markery w §4.2).

**Punkt 7 — Custom reports (refinement bezpieczniejszy):**
Raporty *nie* są pisane per-client w kodzie. Zamiast tego: **report templates** to universal code components (Table Report, Aggregation Report, Trend Report). Content (które kolumny, filtry, grupowania) czytany z konfiguracji org-a. Dodanie kolumny przez Forzę = raport automatycznie może jej użyć, bez dewelopera. Tańsze niż full no-code report builder, skalowalne.

**Punkt 8 — Custom workflows (refinement bezpieczniejszy):**
Workflow jako **dane** (JSON/DB), nie kod. *Silnik workflow* = universal code napisany raz. *Definicja workflow* (jakie stages, jakie kryteria, jakie transitions) = dane per org. Forza dostaje predefiniowaną definicję (NPD Stage-Gate G0→G4). Inny klient ma inną (np. G0→G3) — zmiana w Settings/JSON, nie w kodzie. Część rule engine (punkt 2).

### 2.2 Deliverable meta-modelu

1. `META-MODEL.md` — single source of truth dla punktów 1–8
2. `ADR-028: Schema-driven column definition`
3. `ADR-029: Rule engine DSL scope + workflow definitions as data`
4. `ADR-030: Configurable department taxonomy`
5. `ADR-031: Schema variation per org (multi-tenant)`

Istniejące ADRs które są sprzeczne z meta-modelem oznaczamy `[SUPERSEDED by ADR-028/029/030/031]` — nie kasujemy.

---

## 3. Work breakdown — Phase 0 → A → D → B → C

### 3.1 Phase 0 — Meta-spec + Skill audit (1 sesja + parallel agent track)

**Claude track:**
- Zapisanie META-MODEL.md + 4 ADRs
- Draft 4 nowych skilli:
  - `schema-driven-design`
  - `rule-engine-dsl`
  - `reality-sync-workflow`
  - `multi-tenant-variation`
- Update `documentation-patterns` skill o markery UNIVERSAL/FORZA-CONFIG/EVOLVING/LEGACY-D365

**Parallel agent track (skill audit):**
- Agent audytuje 47 istniejących skilli w `00-foundation/skills/`
- Output: `SKILL-AUDIT.md` z rekomendacjami (deprecate / merge / tune / add)
- Weryfikacja dopasowania pod obecny tech stack
- Po review → update `REGISTRY.yaml` + nowy `SKILL-MAP.yaml`
- Selektywny tuning przez `skill-creator:skill-creator`

**Quality gate:** META-MODEL + 4 ADRs + 4 new skills + skill audit report — użytkownik review i akceptacja.

### 3.2 Phase A — Dokumentacja PLD v7 (3 sesje)

**Inputs:** `Smart_PLD_v7.xlsm`, `v7/` scripts, `v7/vba/` modules, wiedza procesowa użytkownika.

**Output — `new-doc/_meta/reality-sources/pld-v7-excel/`:**
- `PROCESS-OVERVIEW.md` — end-to-end flow (kto, co, kiedy, po co)
- `DEPARTMENTS.md` — 7 działów + odpowiedzialności + handoffs
- `MAIN-TABLE-SCHEMA.md` — ~60-80 kolumn pogrupowane (Core/Planning/Commercial/Production/Technical/MRP/Procurement/System) z label, type, owner dept, validation, required, hard-lock, dependencies
- `CASCADING-RULES.md` — Pack_Size → Line → Dieset → Material reguły
- `WORKFLOW-RULES.md` — status colors, autofilter Done, gate-like progression
- `REFERENCE-TABLES.md` — 6 config tables z realnymi danymi Forzy
- `D365-INTEGRATION.md` — import/export, kody walidacji, Builder logic
- `EVOLVING.md` — lista obszarów gdzie design jeszcze się zmienia (np. MRP → 2 działy)

Każdy dokument ma markery `[UNIVERSAL]` / `[FORZA-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]`.

**Sesja 1:** PROCESS-OVERVIEW + DEPARTMENTS + handoff notes.
**Sesja 2:** MAIN-TABLE-SCHEMA + CASCADING-RULES + WORKFLOW-RULES.
**Sesja 3:** REFERENCE-TABLES + D365-INTEGRATION + EVOLVING + brainstorm review całości.

Każda sesja zaczyna się od HANDOFF.md poprzedniej (zobacz §5.1).

**Quality gate:** 8 docs ukończone, markery na wszystkim, użytkownik potwierdza że opisane procesy = rzeczywistość.

### 3.3 Phase D — Domknięcie architektury Monopilot (1 sesja)

**Inputs:** Meta-model (Phase 0) + PLD v7 reality (A) + istniejące ADRs.

**Output — `00-foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`:**
- Nowa kolejność implementacji: NPD-first → BOM → Costing → Production → MES → reszta
- Mapowanie 16 modułów `new-doc/` na tę kolejność
- Reconcile z istniejącym planem Epic 1–11 w `00-foundation/prd/prd.md`
- Mapping PLD v7 procesów na moduły Monopilot (np. Main Table → NPD + BOM + Planning; D365 Builder → Integrations)
- Decision log: które moduły wymagają zmian po PLD v7 reality, które zostają bez zmian

**Quality gate:** Akceptacja reorderingu + mapowania przez użytkownika.

### 3.4 Phase B — Update modułu NPD 1:1 z PLD v7 (2–3 sesje)

**Inputs:** Phase A + Phase D + obecne `09-npd/`.

**Output — pełna aktualizacja `new-doc/09-npd/`:**
- PRD update (sync z PLD v7 reality)
- 18 stories review (poprawki wg learningów, usunięcie redundancji 08.17 itp.)
- Markery meta-model we wszystkich stories
- Uzupełnienie brakujących obszarów (PLD v7 ma a NPD doc nie ma)
- UX wireframes review (czy odzwierciedlają realne flow)
- Jawne linki do `_meta/reality-sources/pld-v7-excel/*`

**Quality gate:** Cross-walk report "NPD vs PLD v7" — lista 1:1 + lista luk, wszystkie luki zaadresowane. Użytkownik akceptuje.

### 3.5 Phase C — Update pozostałych 15 modułów (5 batchów × 3 moduły)

**Inputs:** Meta-model + PLD v7 reality + Phase B golden example.

**Output:** 15 modułów zaktualizowanych tym samym template'm co NPD.

**Wykonanie — batching 5×3:** 5 batchów po 3 moduły, między batchami Claude cross-review + HANDOFF update. Daje czas na wychwycenie driftu zanim propaguje się na kolejne moduły.

**Agent prompt template (każdy agent Phase C):**
```
Kontekst: Monopilot documentation migration, Phase C.
Moduł: {NN-module}
Twoje wejście:
  - META-MODEL.md (meta-model i markery)
  - _meta/reality-sources/pld-v7-excel/* (ground truth procesów Forza)
  - 09-npd/* (golden example)
  - SKILL-MAP.yaml (które skille invokować dla tego modułu)
  - CHECKLIST.md (co zrobić)
Twój output: zaktualizowany {NN-module}/ + RAPORT.md ze zmianami i open questions.
Ogranicz do: dokumentacja czysta, bez kodu. Nie dotykaj archive/, experiments/, bugs/.
```

**Quality gate per batch:** Każdy moduł ma raport agenta + Claude cross-review report. Zero broken links. Wszystkie markery aplikowane.

**Sugerowane grupowanie batchów** (w finalnym implementation plan dostosuje się do priorytetu NPD-first):
- Batch 1: moduły zbliżone do NPD (produkty/BOM) — pierwsze dla ciągłości
- Batch 2-5: pozostałe, pogrupowane tematycznie (production cluster / logistics cluster / admin cluster)

---

## 4. Zasady dokumentacji

### 4.1 Struktura dokumentu modułowego (szablon wspólny dla 16 modułów)

```
NN-module/
├── ANALYSIS.md              ← inventory + gaps + updates after each phase
├── prd/
│   └── NN-MODULE-PRD.md    ← single source of truth for requirements
├── decisions/
│   └── *-arch.md           ← architecture + data model + API design
├── stories/                 ← user stories (epic.N.*.md)
│   ├── context/             ← YAML per story (api, database, frontend, tests)
│   └── IMPLEMENTATION-ROADMAP.yaml
├── ux/                      ← wireframes, mockups (visual specs only)
├── api/                     ← API reference docs
├── guides/                  ← end-user guides
└── qa/                      ← acceptance criteria, test specs
```

**Zasada:** jeśli moduł czegoś nie ma (np. scanner bez `api/` bo mobilny) — podkatalog nie istnieje. Nie tworzymy pustych szkieletów.

### 4.2 Markery (obowiązkowe na każdym wymaganiu / kolumnie / regule)

- `[UNIVERSAL]` — fundamentalne dla food-manufacturing MES, każdy klient to ma
- `[FORZA-CONFIG]` — Forza ustawiła tak, inny klient może mieć inaczej (konfigurowalne w Settings)
- `[EVOLVING]` — projekt jeszcze się zmienia, nie twarde (trzymamy w DB nawet jeśli dziś tylko Forza)
- `[LEGACY-D365]` — istnieje tylko z powodu D365, zniknie po migracji (feature flag `integration.d365.enabled`)

### 4.3 Pure documentation — no code snippets

- **Brak:** SQL, TypeScript, VBA, YAML schema z konkretną składnią
- **Tak:** opisy semantyczne, data contracts jako tabele (col name, type, owner, rule), przepływy opisane prozą / diagramami Mermaid, tabele decyzji
- **Wyjątek:** istniejące `context/*.yaml` stories files — zostają (są contract files, nie code). Ale żadnych **nowych** yaml-i z implementation details.

### 4.4 Cross-referencing (obowiązkowy system linków)

- Moduł → moduł: `See 00-foundation/decisions/ADR-003-multi-tenancy-rls.md`
- Story → PRD: `Covers FR-NPD-13, FR-NPD-14`
- Story → UX: `See ux/NPD-007-formulation-editor.md`
- Moduł → reality: `Mapped from: _meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md#mrp-columns`

**Po Phase A:** każdy moduł który odzwierciedla PLD v7 proces ma jawny link do `_meta/reality-sources/pld-v7-excel/*`.

### 4.5 REALITY-SYNC pattern (dyscyplina obowiązkowa)

Nowy pattern: `00-foundation/patterns/REALITY-SYNC.md`.

**Reality sources** (każdy to osobny katalog pod `new-doc/_meta/reality-sources/`):
- `pld-v7-excel/` — pierwsze źródło (Phase A)
- `power-automate/` — flow-y automatyzacji firmy
- `d365-integration/` — procesy które dziś robi D365
- `access-databases/` — data w Access
- `other-excels/` — pozostałe arkusze operacyjne

**Zasady synchronizacji:**
1. PLD v7 zmiana → update `_meta/reality-sources/pld-v7-excel/*` w tej samej sesji (mini-skill: dodać do vba-pipeline handoff)
2. Update propagowany do modułów Monopilot w **osobnej** sesji z brainstormem "czy to [UNIVERSAL]/[FORZA-CONFIG]/[EVOLVING]/[LEGACY-D365]?"
3. Nigdy nie aktualizujemy modułu Monopilot bezpośrednio pomijając reality-layer
4. Analogicznie dla pozostałych reality sources w miarę jak są wchłaniane

### 4.6 Co nie idzie do dokumentacji

- `other/archive/` — zostawiamy, nie czytamy
- `experiments/` — zostawiamy
- Bug trackers — zostają, nie aktualizujemy w ramach migracji
- Sprzeczne ADR-y — oznaczamy `[SUPERSEDED by ADR-028/029/030/031]`, nie kasujemy

---

## 5. Execution model

### 5.1 Struktura sesji (każda sesja ma ten sam szkielet)

```
1. BOOTSTRAP  — auto-memory load + read HANDOFF.md poprzedniej sesji
2. PLAN       — TaskList dla tej sesji (z HANDOFF inputs)
3. WORK       — właściwa robota (dokumentacja / brainstorm / review)
4. CLOSE      — update memory + napisanie HANDOFF.md dla następnej sesji
```

**HANDOFF.md** (`new-doc/_meta/handoffs/YYYY-MM-DD-phase-N-session-M.md`):
- **Co zrobione:** bullet-list deliverables tej sesji
- **Co dalej:** następny krok, konkretne pliki do utworzenia/zaktualizowania
- **Kontekst do odświeżenia:** lista ścieżek do przeczytania (3–7 plików, nie więcej)
- **Open questions:** decyzje odłożone
- **Skille użyte:** zapisane dla traceability

**Zasada minimalizacji kontekstu:** kolejna sesja NIE czyta całego `new-doc/` — tylko co HANDOFF wskazuje + świeżo utworzone/zaktualizowane pliki.

### 5.2 SKILL-MAP — rozwiązanie problemu "30 skilli do zapamiętania"

Nowy plik: `00-foundation/skills/SKILL-MAP.yaml`.

Struktura (przykład):
```
phases:
  phase-0-meta-spec:
    required: [architecture-adr, documentation-patterns, schema-driven-design]
    optional: [prd-structure]
  phase-A-pld-v7-reality:
    required: [documentation-patterns, discovery-interview-patterns, reality-sync-workflow]
  phase-B-npd-update:
    required: [monopilot-patterns, invest-stories, prd-structure, documentation-patterns]
    optional: [multi-tenant-variation]
  phase-C-module-swarm:
    agent-required: [documentation-patterns, prd-structure, monopilot-patterns]

modules:
  00-foundation: [architecture-adr, documentation-patterns]
  09-npd: [monopilot-patterns, supabase-rls, invest-stories]
  # ... per moduł
```

**Działanie:** Claude / agent na starcie sesji czyta SKILL-MAP, widzi "Phase B, moduł NPD → inwokować te 4 skille" — robi to automatycznie. Użytkownik nie musi pamiętać.

### 5.3 Agent delegation (tylko Phase C)

**Claude robi:** Phase 0, A, D, B (wymagają decyzji architektonicznych + pełnego kontekstu).
**Agenty robią:** Phase C (mechaniczne przepisanie 15 modułów wg wzorca z B).

Template promptu — zobacz §3.5.

Batching 5×3: 5 batchów po 3 moduły, cross-review po każdym batchu.

### 5.4 Quality gates (co musi być prawdą przed zamknięciem fazy)

| Faza | Quality gate |
|------|--------------|
| Phase 0 | META-MODEL + 4 ADRs + 4 new skills + SKILL-AUDIT ukończone, user review |
| Phase A | 8 docs w `_meta/reality-sources/pld-v7-excel/` ukończone, markery na wszystkim, user potwierdza reality |
| Phase D | Nowa kolejność + mapa 16 modułów zaakceptowana, ADRs reconciled |
| Phase B | Cross-walk NPD vs PLD v7 complete, wszystkie luki zaadresowane |
| Phase C | Per-moduł raport + Claude cross-review per batch, zero broken links, markery kompletne |

### 5.5 Memory hygiene

- **Auto-memory (MEMORY.md):** decyzje strategiczne + wskaźniki do kluczowych dokumentów (META-MODEL.md path, aktywny HANDOFF path, lista faz ze statusami). Update `project_smart_pld.md` o sekcję "Monopilot migration".
- **HANDOFF.md per sesja:** szczegóły operacyjne, nie idą do auto-memory.
- **Zakazane w auto-memory:** implementation details, kawałki docs, szczegóły procesu — to zaśmieca kontekst.

### 5.6 Nowe skille (4, Phase 0 deliverable)

- `schema-driven-design` — kiedy/jak modelować jako metadane, kiedy w kodzie
- `rule-engine-dsl` — scope i semantyka Level-b furtki
- `reality-sync-workflow` — dyscyplina sync z reality sources
- `multi-tenant-variation` — patterns per-org config

**Update 1 istniejącego:** `documentation-patterns` — markery UNIVERSAL/FORZA-CONFIG/EVOLVING/LEGACY-D365.

**Dalszy audit** — agent rewiduje wszystkie 47 skilli, proponuje deprecate/merge/tune/add pod tech stack.

---

## 6. Harmonogram i szacunki

| Faza | Sesje | Co | Deliverable |
|------|-------|----|-----|
| Phase 0 | 1 + parallel | Meta-spec + skill audit | META-MODEL.md, 4 ADRs, 4 nowe skille, SKILL-AUDIT.md, SKILL-MAP.yaml |
| Phase A | 3 | PLD v7 reality | 8 docs w `_meta/reality-sources/pld-v7-excel/` |
| Phase D | 1 | Domknięcie architektury | MONOPILOT-V2-ARCHITECTURE.md |
| Phase B | 2–3 | NPD module update | Zaktualizowany `09-npd/` + cross-walk report |
| Phase C | 5 nadzór | Pozostałe 15 modułów | Wszystkie moduły zaktualizowane + raporty batch |
| **Total** | **~12 sesji** | | Pełna `new-doc/` gotowa pod implementację Monopilot NPD-first |

**Uwaga:** harmonogram dotyczy tylko fazy dokumentacyjnej. Implementation Monopilot to osobny spec + plan po zamknięciu C.

---

## 7. Open questions / risks

### 7.1 Open questions (do rozstrzygnięcia w kolejnych fazach)

- **Phase 0:** konkretna składnia rule engine DSL — Mermaid pseudo-code? JSON schema? Textual opis? Decyzja w ADR-029.
- **Phase A:** jak głęboko opisywać VBA logikę v7 — semantycznie (co robi) czy też z listą funkcji / modułów? Decyzja w sesji 2 Phase A.
- **Phase D:** które moduły z Epic 1–11 (current PRD) zostają w planie a które zmieniamy kolejność? Reconcile robi Phase D.
- **Phase C:** czy 5×3 batching jest optymalny? Po batchu 1 recenzujemy tempo i adjust.

### 7.2 Risks

**R1 — Schema-driven overreach:** ryzyko że zbudujemy "half-baked database inside database" przez zbyt ambitne Level "b". **Mitigation:** twardy limit na 3–5 obszarów Level "b", konkretnie wymienionych w ADR-029.

**R2 — Dual maintenance drift:** przez 12 miesięcy PLD v7 i `new-doc/` mogą się rozjeżdżać. **Mitigation:** REALITY-SYNC pattern jako obowiązkowa dyscyplina, sync w tej samej sesji co zmiana v7.

**R3 — Agent output quality (Phase C):** agenty mogą produkować generyczne doc-y zamiast odzwierciedlać Forza reality. **Mitigation:** 5×3 batching z cross-review Claude po każdym batchu, golden example z Phase B, jawny SKILL-MAP per moduł.

**R4 — Context overflow:** kolejne sesje mogą wpadać w pułapkę czytania całego `new-doc/`. **Mitigation:** HANDOFF.md jako twarda brama — tylko wymienione pliki czytamy.

**R5 — Skill decay:** 47 istniejących skilli może być przestarzałych / niespójnych. **Mitigation:** dedicated skill audit w Phase 0 przez agenta + selektywny tuning.

---

## 8. Glossary

- **PLD** — Product Lifecycle Development (Smart PLD v7 = Excel/VBA system obecnie używany przez Forzę)
- **Monopilot** — docelowy web-app MES (16 modułów, schema-driven, multi-tenant)
- **Reality source** — zewnętrzny system/narzędzie obecnie używane w firmie, którego procesy dokumentujemy jako ground truth przed wchłonięciem przez Monopilot (PLD v7, Power Automate, D365, Access DBs, other Excels)
- **Meta-model** — centralny zestaw zasad określających co w Monopilot jest schema-driven vs code-driven
- **Schema-driven** — definicja przez dane/metadane edytowalne w Settings (Level "a") lub przez rule engine (Level "b")
- **Marker** — tag obowiązkowy na każdym wymaganiu: `[UNIVERSAL]` / `[FORZA-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]`
- **HANDOFF.md** — dokument transferu między sesjami (co zrobione, co dalej, co czytać)
- **SKILL-MAP** — mapa "faza/moduł → skille do wywołania" dla automatycznego wywoływania przez Claude/agenty

---

## 9. Next step

Po akceptacji tego spec-a: użycie `superpowers:writing-plans` do stworzenia **implementation plan** z task-ami per sesja Phase 0 → A → D → B → C. Plan będzie szczegółowy (checkpointy, konkretne pliki, task per sesja).

**Ta sesja zostaje zamknięta po akceptacji.** Phase 0 (meta-spec + skill audit) startuje w nowej, świeżej sesji z pełnym kontekstem na solidne zaprojektowanie meta-modelu.
