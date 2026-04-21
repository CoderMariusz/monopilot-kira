# SKILL-AUDIT — Phase 0 Monopilot Migration

**Data audytu:** 2026-04-17
**Auditor:** agent (Claude Opus 4.7, 1M)
**Zakres:** `new-doc/00-foundation/skills/` (48 katalogów skilli + REGISTRY.yaml)
**Cel:** ocena dopasowania do docelowego stacka Monopilot (Next.js 16 / React 19 / Supabase / TypeScript / Zod v4 / Tailwind / Playwright / Jest / MSW / Docker) oraz do meta-modelu (schema-driven, rule engine DSL, multi-tenant, reality-sync, markery UNIVERSAL/FORZA-CONFIG/EVOLVING/LEGACY-D365).
**Input do:** `skill-creator:skill-creator` w Phase 0 (deprecate / merge / tune / add).

---

## 1. Summary

| Metryka | Wartość |
|---|---|
| Skille w REGISTRY.yaml | 51 (zadeklarowane) |
| Skille fizycznie na dysku (katalogi z `SKILL.md`) | **48** |
| **Discrepancja** | **3 brakujące na dysku, 3 istniejące poza rejestrem** |
| Skille aktualne wersjowo (React 19, Next 16, Zod v4, WCAG 2.2, RFC 9110/9457, Node 22) | 46 / 48 = **96 %** |
| Skille do tuningu pod meta-model | 12 (głównie markery, multi-tenant kontekst) |
| Skille do deprecate | 1 (`fix-bugs` — nie-doc skill) |
| Skille do merge | 1 para (`testing-monopilot` ↔ `testing-jest`) |
| Gap-y do dopełnienia (poza 4 planowanymi) | 4 propozycje (zobacz §5 i §3 ADD) |
| Sekcja `domain: {}` | **pusta — do wypełnienia** (food-industry) |
| SKILL-MAP istnieje? | NIE — do utworzenia |

**Zdrowie ogólne: 85 %.** Główne problemy:
1. Rozjazd REGISTRY ↔ filesystem (brakuje 6 skilli zadeklarowanych; istnieją 3 poza rejestrem).
2. Dwa skille projektowe (`monopilot-patterns`, `testing-monopilot`) używają **starego brandu "MonoPilot"** i **Vitest zamiast Jest** — sprzeczność z nowym stackiem spec-a.
3. Zero markerów UNIVERSAL/FORZA-CONFIG w skillach (`documentation-patterns` wymaga update).
4. Brak skilli dla: accessibility-testing, supabase-migrations, observability/logging, domain food-industry.

---

## 2. Findings per kategorii

### 2.1 Supabase (6 skilli) — stan: GOOD, drobny tuning
| Skill | Status | Uwagi |
|---|---|---|
| supabase-rls | OK | Pattern 3 "Org Isolation" to już zalążek multi-tenant — można dociągnąć do ADR-031 schema-variation |
| supabase-queries | OK | Brak wzmianki o schema-driven queries (kolumny z DB zamiast hard-coded) |
| supabase-realtime | OK | — |
| supabase-auth | OK | — |
| supabase-storage | OK | — |
| supabase-edge-functions | OK | Deno patterns current |

**Brakuje:** `supabase-migrations` (migration policies, squashing, branching), `supabase-testing` (local supabase + pgTAP patterns).

### 2.2 React & Frontend (11 skilli) — stan: VERY GOOD
| Skill | Status | Uwagi |
|---|---|---|
| react-hooks | OK | Zaktualizowany do React 19 (useActionState, useEffectEvent) |
| react-performance | OK | React Compiler context dodany |
| react-forms | OK | — |
| react-state-management | OK | Zustand + TanStack — zgodne ze stackiem |
| nextjs-app-router | OK | Next 16 async params pokryte |
| nextjs-data-fetching | OK | — |
| nextjs-api-routes | OK | Overlap z `monopilot-patterns` (zobacz 2.10) |
| nextjs-server-components | OK | — |
| nextjs-middleware | OK | — |
| nextjs-server-actions | OK | `useActionState` dla Next 16 — OK |
| tailwind-patterns | OK | — |

**Uwaga:** `nextjs-app-router` + `nextjs-server-components` + `nextjs-middleware` + `nextjs-server-actions` to 4 osobne skille — dla 1M kontekstu to jest OK, ale dla ORCHESTRATOR `max_skills_per_task: 3` to problem. Rozważyć **merge** w `nextjs-patterns-v16` master-skill z sekcjami (opcja rozmowy z userem).

### 2.3 TypeScript (4 skille) — stan: GOOD
| Skill | Status | Uwagi |
|---|---|---|
| typescript-patterns | OK | — |
| typescript-generics | OK | — |
| typescript-zod | OK, v4-ready | `api-validation` już oznaczone zod_version: 4.x. Skill v3 patterns nadal działają w v4 |
| typescript-api-types | OK | — |

**Dopięcie:** Po meta-modelu — `typescript-zod` powinien mieć pattern dla **schema-driven Zod** (schema generated from DB row describing column definitions). To prawdopodobnie leży w `schema-driven-design` (nowy), nie trzeba duplikować.

### 2.4 Testing (5 skilli) — stan: CONFLICT
| Skill | Status | Uwagi |
|---|---|---|
| testing-tdd-workflow | OK | — |
| testing-jest | **MISSING ON DISK** | Zadeklarowany w REGISTRY, ale katalog nie istnieje! |
| testing-react-testing-lib | OK | RTL 16.3 validated |
| testing-playwright | OK | 1.57.0 |
| testing-msw | OK | v2 API |
| testing-monopilot (extra) | **CONFLICT** | Używa **Vitest**, a spec Monopilot mówi **Jest**. Framework mismatch! |

**Konflikt:** `testing-monopilot` explicitnie mówi "CRITICAL: Vitest, NOT Jest" — ale design-spec Monopilot Migration wymienia Jest. **Decyzja potrzebna:** trzymamy Jest (per spec) czy Vitest (per obecna realizacja)?

### 2.5 API & Backend (4 skille) — stan: VERY GOOD
| Skill | Status | Uwagi |
|---|---|---|
| api-rest-design | OK, RFC 9110 | — |
| api-error-handling | OK, RFC 9457 | — |
| api-validation | OK, Zod v4 | — |
| api-authentication | OK, RFC 8725 | — |

### 2.6 Code Quality (5 skilli) — stan: GOOD
| Skill | Status | Uwagi |
|---|---|---|
| code-review-checklist | OK | — |
| git-workflow | OK | GitHub Flow |
| git-conventional-commits | OK | — |
| documentation-patterns | **TUNE** | JSDoc/README patterns OK, **ale brak markerów UNIVERSAL/FORZA-CONFIG/EVOLVING/LEGACY-D365** (spec §5.6 explicit wymaga update) |
| refactoring-patterns | OK | — |

### 2.7 DevOps & Tooling (3 skille) — stan: NIEKOMPLETNY
| Skill | Status | Uwagi |
|---|---|---|
| ci-github-actions | OK | actions v5/v6, Node 22 |
| docker-basics | **MISSING ON DISK** | Zadeklarowany, ale katalog nie istnieje |
| env-configuration | OK | — |

**Brakuje:** skill dla **observability/logging** (Supabase logs, Sentry, structured logging) — ważne dla multi-tenant MES.

### 2.8 UX & Security (3 skille) — stan: GOOD
| Skill | Status | Uwagi |
|---|---|---|
| accessibility-checklist | OK, WCAG 2.2 | — |
| security-backend-checklist | OK, OWASP 2025 RC | — |
| ui-ux-patterns | OK | — |

**Brakuje:** skill dla **accessibility-testing** (axe-core, Playwright a11y) — checklist jest, ale pattern testów nie.

### 2.9 Planning & Process (7 skilli) — stan: GOOD, kilka missing
| Skill | Status | Uwagi |
|---|---|---|
| invest-stories | OK | — |
| discovery-interview-patterns | OK | — |
| prd-structure | OK | — |
| architecture-adr | OK | — |
| requirements-clarity-scoring | **MISSING ON DISK** | — |
| qa-bug-reporting | OK | — |
| agile-retrospective | **MISSING ON DISK** | — |

### 2.10 Skills Meta (3 skille) — stan: PARTIALLY MISSING
| Skill | Status | Uwagi |
|---|---|---|
| research-source-evaluation | **MISSING ON DISK** | — |
| version-changelog-patterns | OK | — |
| skill-quality-standards | **MISSING ON DISK** | — |

### 2.11 Projektowe (extra, poza REGISTRY)
| Skill | Status | Uwagi |
|---|---|---|
| monopilot-patterns | **CONFLICT / TUNE** | Pełne snippet-y kodu TS z "MonoPilot"-brand, Pattern 6 słusznie zakazuje `@supabase/auth-helpers-nextjs` na rzecz `@supabase/ssr`. **Problem:** pure-documentation zasada spec §4.3 — ten skill jest czystą ściągawką kodową. Decyzja: trzymamy jako *implementation-only* skill (nie używany w docs) albo przepisujemy na pattern-description. |
| testing-monopilot | **CONFLICT** | Vitest ≠ Jest (zobacz 2.4) |
| fix-bugs | **DEPRECATE** | To orchestracyjny skill "user-invocable: true" z `argument-hint` — nie pattern-skill. Nie pasuje do REGISTRY foundation. Przenieść do `.claude/skills/` lub usunąć |

---

## 3. Rekomendowane akcje

### 3.1 DEPRECATE (1)
- **`fix-bugs`** — to user-invocable slash-command skill, nie pattern-skill. Należy do warstwy CLI/agent-toolkit, nie do `00-foundation/skills/`. Przenieść do `.claude/skills/` albo usunąć (i tak jest dostępny jako global skill Claude Code).

### 3.2 MERGE (2 propozycje)

1. **`testing-monopilot` → rozpuścić w `testing-jest` + `monopilot-patterns`**
   Po rozstrzygnięciu Jest vs Vitest: generyczne Jest patterns w `testing-jest`, Supabase chainable mock + Next API route testing w nowym `testing-supabase-nextjs` (lub w `monopilot-patterns`). Obecny `testing-monopilot` miesza trzy warstwy.

2. **(opcjonalnie)** `nextjs-app-router` + `nextjs-server-components` + `nextjs-server-actions` + `nextjs-middleware` → pakiet **`nextjs-v16-suite`** (dalej jako 4 pliki, ale bundle-referencje w SKILL-MAP).
   Nie twarde merge, raczej logiczne grupowanie w SKILL-MAP. Decyzja usera.

### 3.3 TUNE (12 skilli)
| Skill | Co zmienić |
|---|---|
| `documentation-patterns` | **OBOWIĄZKOWO** — dodać sekcję "Markers" (UNIVERSAL / FORZA-CONFIG / EVOLVING / LEGACY-D365) z przykładami, semantyką, gdzie wolno kłaść. Spec §5.6 explicit. |
| `supabase-rls` | Dopisać link-reference do ADR-031 (schema variation per org) gdy powstanie |
| `supabase-queries` | Dopisać pattern "dynamic column projection" (dla schema-driven kolumn) — integruje się z `schema-driven-design` |
| `api-validation` | Dopisać pattern "runtime schema from DB" (Zod zbudowane z metadanych kolumn) |
| `typescript-zod` | Dopisać pattern "z.discriminatedUnion dla tenant-variation" |
| `invest-stories` | Dopisać pattern "marker-tagged stories" (AC oznaczone [UNIVERSAL]/[FORZA-CONFIG]) |
| `prd-structure` | Dopisać sekcję "Universal vs Tenant-specific requirements" |
| `architecture-adr` | Dopisać wzorzec "Superseded by ADR-XXX" (spec §2.2) oraz linkage do meta-model |
| `nextjs-api-routes` | Deduplikować z `monopilot-patterns` Pattern 1 (albo wskazać "see monopilot-patterns dla project wiring") |
| `react-forms` | Dopisać pattern "schema-driven form" (fields rendering z metadanych, nie statyczny JSX) |
| `monopilot-patterns` | Rebrand **MonoPilot → Monopilot** (konsystencja). Dodać kontekst multi-tenant (org_id w RLS default — już jest, doprecyzować) |
| `testing-monopilot` | Jeżeli zostaje → dodać pattern dla RLS-testing (anon vs service role) |

### 3.4 ADD (4 propozycje — **poza** 4 już planowanymi w spec §5.6)

Poza `schema-driven-design`, `rule-engine-dsl`, `reality-sync-workflow`, `multi-tenant-variation`:

1. **`supabase-migrations`** — patterns dla migration scripts, branching, `seed.sql`, snapshot testing. Dla multi-tenant schema critical.
2. **`observability-logging`** — structured logging, Supabase logs, error tracking (Sentry), correlation IDs w Next 16. Dla produkcyjnego MES.
3. **`accessibility-testing`** — axe-core w Jest + Playwright a11y snapshots. Checklist jest, testów nie.
4. **`domain/food-industry-mes`** — first **domain** skill. Pokrywa: BOM modeling, lot/traceability, allergen management, shelf-life calc, Stage-Gate NPD, GMP baseline. Sekcja `domain: {}` w REGISTRY pusta — aż się prosi.

**Opcjonalnie (rozmowa z userem):**
- `d365-integration-patterns` (mapping Main Table ↔ D365 columns, paste-format output) — pod `[LEGACY-D365]` flag. Reality-source-first, może żyć w `_meta/reality-sources/d365-integration/` zamiast w skills.

### 3.5 FIX INTEGRITY (rozjazd REGISTRY ↔ FS)
REGISTRY deklaruje 51 skilli, ale 6 nie istnieje fizycznie:
- `agile-retrospective` — brak pliku
- `requirements-clarity-scoring` — brak pliku
- `research-source-evaluation` — brak pliku
- `skill-quality-standards` — brak pliku
- `docker-basics` — brak pliku
- `testing-jest` — brak pliku

Plus 3 istnieją poza REGISTRY:
- `fix-bugs`, `monopilot-patterns`, `testing-monopilot`

**Akcja:** odtworzyć 6 brakujących (pewnie były kiedyś zlane lub katalog nie został skopiowany z OneDrive) albo usunąć z REGISTRY. Dodać 3 brakujące wpisy albo usunąć katalogi.

---

## 4. Tech stack alignment

| Stack component | Target (spec) | Skille aktualne? |
|---|---|---|
| Next.js | 16 | TAK — `nextjs-app-router` v1.1 updated (async params), `nextjs-server-actions` (useActionState) |
| React | 19 | TAK — `react-hooks`, `react-performance` 1.1 updated |
| Supabase | latest | TAK — 6 skilli `active`, `@supabase/ssr` w `monopilot-patterns` (zgodne) |
| TypeScript | aktualne | TAK |
| Zod | v4 | TAK — `api-validation` v1.1 `zod_version: 4.x` |
| Tailwind | (bez wersji w spec) | TAK — `tailwind-patterns` |
| Playwright | 1.57+ | TAK |
| Jest | aktualny | **CONFLICT** — `testing-monopilot` mówi Vitest; `testing-jest` katalog missing. Decyzja userska potrzebna. |
| MSW | v2 | TAK — `testing-msw` v2 validated |
| Docker | (wymieniony w spec) | **MISSING** — `docker-basics` w REGISTRY, brak pliku |
| Node | 22 LTS | TAK — `ci-github-actions`, `docker-basics` (deklaracja) |

**Werdyk:** stack 90 % pokryty, główne luki — rozjazd testing framework (Jest/Vitest) + brakujący docker-basics.

---

## 5. Gaps względem meta-modelu

### 5.1 Schema-driven design
- **Brakuje w foundation:** nowy skill `schema-driven-design` (planowany) — OK.
- **Brakuje w istniejących:** pattern "Zod from DB metadata" (→ `typescript-zod`, `api-validation`), pattern "dynamic form render" (→ `react-forms`), pattern "column-as-row in DB" (→ `supabase-queries`).

### 5.2 Rule engine DSL
- **Brakuje w foundation:** nowy skill `rule-engine-dsl` (planowany) — OK.
- **Nie ma nic w obecnych** — zero patternów dla cascading dropdowns / conditional required / gate criteria.

### 5.3 Multi-tenant variation
- **Brakuje w foundation:** nowy skill `multi-tenant-variation` (planowany) — OK.
- **Częściowo w istniejących:** `supabase-rls` ma Pattern 3 "Org Isolation" — bazowy. Trzeba dociągnąć org-scoped settings, RLS performance, role matrix per org.

### 5.4 Reality-sync
- **Brakuje w foundation:** nowy skill `reality-sync-workflow` (planowany) — OK.
- **Brakuje integracji:** `git-workflow` nie wspomina o reality-source sync dyscyplinie (spec §4.5 wymaga żeby update PLD v7 → update `_meta/reality-sources/pld-v7-excel/` w tej samej sesji). Dodać jako cross-link z `reality-sync-workflow`.

### 5.5 Markery
- **Blocker:** `documentation-patterns` obecnie NIE ma sekcji o markerach. Spec §5.6 explicit wymaga update.
- **Domino effect:** `invest-stories`, `prd-structure`, `architecture-adr` powinny referencować markery (TUNE — zobacz §3.3).

---

## 6. SKILL-MAP feasibility

**Feasible? TAK.** Tagowanie w REGISTRY jest spójne (tags: [supabase, ...], [react, ...], [testing, ...] — kilkanaście grup, bez kolizji). Można skonstruować mapowanie na bazie istniejących tagów + marker-tags po dodaniu meta-model.

### 6.1 Proponowana struktura `SKILL-MAP.yaml`

```yaml
# SKILL-MAP — map fazy i moduły → skille
# Używany przez Claude i agenty do automatycznego loadu na starcie sesji

version: 1.0.0
source_registry: REGISTRY.yaml

# ---------- PHASE → SKILLS ----------
phases:
  phase-0-meta-spec:
    required: [architecture-adr, documentation-patterns, schema-driven-design, rule-engine-dsl, multi-tenant-variation, reality-sync-workflow]
    optional: [prd-structure, skill-quality-standards]

  phase-A-pld-v7-reality:
    required: [documentation-patterns, discovery-interview-patterns, reality-sync-workflow]
    optional: [domain-food-industry-mes]

  phase-D-architecture:
    required: [architecture-adr, documentation-patterns]
    optional: [multi-tenant-variation]

  phase-B-npd-update:
    required: [monopilot-patterns, invest-stories, prd-structure, documentation-patterns]
    optional: [multi-tenant-variation, schema-driven-design]

  phase-C-module-swarm:
    agent-required: [documentation-patterns, prd-structure, monopilot-patterns]
    agent-optional: [invest-stories, schema-driven-design, reality-sync-workflow]

# ---------- MODULE → SKILLS (16 modules) ----------
modules:
  00-foundation: [architecture-adr, documentation-patterns]
  01-settings:   [schema-driven-design, multi-tenant-variation, supabase-rls]
  02-auth:       [supabase-auth, api-authentication, security-backend-checklist]
  # ... (15 more, wypełnić w Phase 0 zamknięciu)
  09-npd:        [monopilot-patterns, supabase-rls, invest-stories, domain-food-industry-mes, schema-driven-design]
  # ...

# ---------- TASK TYPE → SKILLS ----------
task_types:
  writing_story:       [invest-stories, prd-structure, documentation-patterns]
  writing_adr:         [architecture-adr, documentation-patterns]
  writing_prd:         [prd-structure, invest-stories]
  reality_sync:        [reality-sync-workflow, documentation-patterns]
  impl_api:            [monopilot-patterns, nextjs-api-routes, api-validation, api-error-handling]
  impl_component:      [react-hooks, react-forms, tailwind-patterns]
  impl_test:           [testing-tdd-workflow, testing-jest, testing-react-testing-lib, testing-msw]
  impl_e2e:            [testing-playwright, accessibility-testing]
  impl_supabase_schema: [supabase-rls, supabase-queries, supabase-migrations]

# ---------- MARKER → SKILL (dla auto-tagging przy pisaniu docs) ----------
markers:
  UNIVERSAL:    [documentation-patterns]
  FORZA-CONFIG: [documentation-patterns, multi-tenant-variation]
  EVOLVING:     [documentation-patterns, reality-sync-workflow]
  LEGACY-D365:  [documentation-patterns, reality-sync-workflow]
```

### 6.2 Ograniczenie `max_skills_per_task: 3`

REGISTRY ma `max_skills_per_task: 3`. To wymaga **prioritization** — SKILL-MAP musi rozróżniać `required` vs `optional`, a agent bierze **top-3 required**. Alternatywa: podnieść limit do 5 dla docs-heavy faz (Phase B, C).

---

## 7. Open questions (decyzje dla usera)

1. **Jest vs Vitest** — który trzyma się dla Monopilot? Spec wymienia Jest, `testing-monopilot` używa Vitest. Decyzja musi być zrobiona przed Phase 0 close (wpływa na merge/deprecate).

2. **`monopilot-patterns` — kod czy opis?** Skill zawiera pełne snippet-y TS. Spec §4.3 zakazuje code snippets w **dokumentacji modułów**, ale czy to dotyczy też foundation/skills/? Skille są z natury pattern-oriented i zwykle zawierają kod. Propozycja: **zostawić kod w skillach, zakaz dotyczy tylko `NN-module/` docs**. Potwierdź.

3. **`fix-bugs`** — deprecate (usunąć) czy zachować jako operational skill (przenieść poza foundation)?

4. **`nextjs-*` bundling** — czy chcesz master-skill `nextjs-v16-suite` z 4 pod-skillami, czy zostaje 4 osobne + grupowanie tylko w SKILL-MAP?

5. **Domain skills scope** — `food-industry-mes` jako **jeden** skill z sekcjami (BOM, traceability, allergens, shelf-life, stage-gate, GMP) czy **pięć** wyspecjalizowanych? Sugeruję jeden (~1500 tokens) w Phase A po napisaniu reality-source (wiemy co naprawdę potrzeba).

6. **Missing 6 skilli** — odtworzyć z pamięci/research (zadeklarowane w REGISTRY, ale brak plików) czy uznać za zaległość do zrobienia w Phase 0?

7. **REGISTRY.yaml update** — `total_skills` po tym audicie zmieni się: 48 obecnych + 4 nowe planowane + ew. 6 odtworzonych + 4 z ADD = **62**. Czy to akceptowalny target? Spec mówi "~47" dla audytu, więc target zależy od decyzji powyżej.

8. **SKILL-MAP moduły** — sekcja `modules:` w mojej propozycji ma 16 wpisów, ale nie znam precyzyjnie struktury wszystkich 16 modułów Monopilot. Wypełnić w osobnej sesji po przyjęciu meta-modelu? Sugeruję TAK.

---

## 8. Podsumowanie dla `skill-creator`

**Priorytet akcji w Phase 0 (po rozstrzygnięciu open questions):**

| Priorytet | Akcja | Liczba skilli |
|---|---|---|
| P0 | Fix integrity REGISTRY ↔ FS (6 missing) | 6 |
| P0 | TUNE `documentation-patterns` o markery | 1 |
| P0 | ADD 4 planowane (schema-driven-design, rule-engine-dsl, reality-sync-workflow, multi-tenant-variation) | 4 |
| P0 | Utworzyć SKILL-MAP.yaml | 1 plik |
| P1 | Rozstrzygnięcie Jest/Vitest + merge `testing-monopilot` | 1 |
| P1 | Rebrand MonoPilot → Monopilot w `monopilot-patterns` | 1 |
| P1 | TUNE 10 pozostałych skilli o markery/meta-model refs | 10 |
| P2 | ADD 4 dodatkowe (supabase-migrations, observability-logging, accessibility-testing, domain-food-industry-mes) | 4 |
| P2 | DEPRECATE `fix-bugs` | 1 |

**Raport zakończony.** Gotów do inwokacji `skill-creator:skill-creator`.
