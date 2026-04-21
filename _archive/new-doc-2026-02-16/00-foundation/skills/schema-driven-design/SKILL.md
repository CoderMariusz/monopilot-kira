---
name: schema-driven-design
description: Decide when to model domain as user-editable metadata (schema-driven in Settings) vs code-driven. Monopilot architectural pattern. Use during module design, ADR writing, or reviewing feature proposals.
tags: [monopilot, schema, configuration, meta-model, architecture]
---

## When to Use

Aplikuj skill gdy:

- Projektujesz **nowy moduł / tabelę / zestaw walidacji** i rozstrzygasz gdzie żyje definicja (kod vs Settings).
- Dodajesz **nową kolumnę** (Main Table, reference table) i musisz zdecydować czy to metadata row w config-tabeli czy ALTER TABLE + migration.
- Dodajesz **nową regułę walidacji** (required / regex / range) i rozważasz czy hardcodować czy trzymać jako dane rule-engine.
- Piszesz **ADR** dotyczący domeny (czy rozstrzygnięcie ma być "kod" czy "konfiguracja").
- Robisz **review propozycji zmiany** od innego developera / PM — sprawdzasz czy proponowana struktura respektuje meta-model.

Pomijaj skill gdy: piszesz czysto obliczeniowy kod (BOM roll-up, GS1 parser), touchujesz core infra tabel (`users`, `organizations`), albo piszesz transactional logic (LPN picking algorithm).

---

## Core Rule of Thumb — 3 pytania decyzyjne

| # | Pytanie | Jeśli TAK → |
|---|---|---|
| 1 | Czy *inna firma* (inny org Monopilot) mogłaby tego potrzebować inaczej? | schema-driven (Settings config) |
| 2 | Czy *Forza* zmienia to częściej niż raz na 6 miesięcy? | schema-driven (Settings config) |
| 3 | Czy to regulatoryjne (GS1, HACCP), matematyczne (formuły kosztowe) albo standard branżowy (EU-14 allergens)? | code-driven (hardcoded) |

**Zasada rozstrzygania konfliktu:**

- Gdy **tylko 1 lub 2 = TAK** → schema-driven.
- Gdy **3 = TAK** → code-driven (wygrywa nad 1/2, nawet jeśli inny org mógłby *chcieć* inaczej — nie można łamać standardu).
- Gdy niepewność → domyślnie schema-driven + marker `[FORZA-CONFIG]` (zasada konserwatywnej uniwersalności, zob. `documentation-patterns`).

---

## Patterns

### Pattern 1 — Atrybuty metadanej kolumny (schema-driven)

Kolumna jako row w config-tabeli `column_definitions` (per `org_id`). Zestaw atrybutów (za ADR-028):

- `label`, `code` (stabilny ID techniczny, nie zmienia się z labelem),
- `type` (text / number / enum / date / boolean / reference-lookup / checklist),
- `required`, `default`, `validation_type`,
- `owner_department` (FK do departments, ADR-030),
- `visible_for_role` (role-permission matrix, ADR-012),
- `hard_lock` (czy org admin może zmienić / usunąć),
- `sort_order`,
- `marker` (`[UNIVERSAL]` / `[FORZA-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]`).

Struktura tabeli metadanych = `[UNIVERSAL]`. Konkretne wiersze = `[FORZA-CONFIG]` (lub inne, per org).

### Pattern 2 — Reference tables (zawsze schema-driven)

Pack sizes, lines, dieset values, material codes, template definitions — każdy org ma inny zestaw, struktura tabeli wspólna. Przykładowa dyscyplina:

- Struktura tabeli `pack_sizes(id, org_id, code, label, sort)` → `[UNIVERSAL]`.
- Konkretne wartości (Forza: "500g Tray", "1kg Vac Pack", …) → `[FORZA-CONFIG]`.

### Pattern 3 — Hybryda (universal structure + per-org data)

Gdy *struktura* jest stała branżowo, ale *zawartość* rozszerzalna per org. Przykład allergen framework:

- EU-14 lista allergenów (Gluten, Crustaceans, Eggs, …) → `[UNIVERSAL]` (regulacja 1169/2011 — nie można tego edytować w Settings).
- Custom allergen markers dodawane przez org (np. "Sesame batch risk") → `[FORZA-CONFIG]` (config row w Settings).

Hybryda = rzecz referencyjnie wspólna + overlay per org. Oba layers żyją w tej samej tabeli, odróżniane `source_marker` columnem.

### Pattern 4 — Code-driven hold-outs

Kolumny / reguły które NIGDY nie lądują w Settings:

- FK między core tables (`license_plates.lot_id` → `lot_genealogy.id`).
- Formuły kosztowe BOM (roll-up, unit conversion, yield).
- Algorytmy traceability (forward/backward within <30s).
- Parser/encoder GS1-128, LPN format.

Zmiana tych rzeczy = migration + ADR + release cycle.

---

## Anti-patterns

- ❌ **Full no-code builder (Airtable / Notion Databases-style).** YAGNI, over-scope. META-MODEL §3 explicitly rejects — wymagałoby query builder-a, pivotów, ad-hoc relationships. Monopilot nie buduje drugiej bazy w bazie.
- ❌ **Hardcoded enumy dla departamentów / kolumn / reguł walidacji.** Blokuje multi-tenant (nowy org = rewrite kodu). Zamiast tego: tabela `departments` (ADR-030), tabela `column_definitions` (ADR-028).
- ❌ **Schema-driven dla rzeczy stałych prawnie.** EU-14 allergeny, GTIN format, HACCP CCP-threshold nie mogą być edytowalne w Settings — to by naruszało zgodność regulatoryjną.
- ❌ **Mixing** — kolumna częściowo hardcodowana w kodzie (label) + częściowo w config (validation rule). Bugi nieuniknione. Pojedyncza kolumna jest *albo* schema-driven w całości, *albo* code-driven w całości.
- ❌ **Schema-driven + brak hard-lock dla universal values.** Administrator Forzy przez pomyłkę wyłącza wymagalność `lot_number` — breaks traceability. Dla `[UNIVERSAL]` defaults zawsze ustaw `hard_lock=true`.
- ❌ **Promocja do `[UNIVERSAL]` bez cross-walk.** Forza robi X → to nie znaczy że to universal. Promocja wymaga review i potwierdzenia z innymi reality sources.

---

## Examples

- **Kolumna `Pack_Size` w NPD Main Table** → schema-driven `[FORZA-CONFIG]`. Uzasadnienie: Forza miesięcznie dodaje nowe pack sizes (trade launches, promo SKU), inny producent będzie miał inny zestaw.
- **Walidacja GS1-128 format (regex)** → code-driven `[UNIVERSAL]`. Uzasadnienie: standard regulatoryjny — żaden klient nie może "zmienić" formatu GS1.
- **Departament `Quality`** → schema-driven `[FORZA-CONFIG]` (pytanie 1 = TAK, każdy org ma inne działy — zob. ADR-030). Struktura tabeli `departments` = `[UNIVERSAL]`.
- **Formuła kosztowa BOM roll-up** → code-driven `[UNIVERSAL]` (pytanie 3 = TAK, matematyka niekonfigurowalna per user; zmiana = bug w wyliczeniach).
- **Kolumna `D365_ItemNumber`** → schema-driven z markerem `[LEGACY-D365]`. Uzasadnienie: istnieje tylko z powodu D365 integration, feature flag `integration.d365.enabled`; gdy flag = false → kolumna hidden w UI (historia zostaje).
- **NPD Stage-Gate `G0→G4` definition** → schema-driven `[FORZA-CONFIG]` (pytanie 1 = TAK, inny org może mieć G0→G3). Engine state machine = `[UNIVERSAL]` code.
- **Lista reference `Lines` (linie produkcyjne)** → schema-driven `[FORZA-CONFIG]` per org, struktura tabeli `[UNIVERSAL]`.
- **Kolumna `MRP_Category` w Planning Main Table** → schema-driven `[EVOLVING]`. Uzasadnienie: Forza w trakcie reorganizacji MRP (potencjalnie split na 2 działy) — trzymamy w DB zamiast hardcodować.

---

## Handoff do innych skilli

| Gdy | Użyj skilla | Dlaczego |
|---|---|---|
| Schema-driven decision podjęta i potrzebna reguła dynamiczna (cascading, conditional required, gate criterion) | `rule-engine-dsl` | Weryfikacja czy reguła mieści się w scope 4 DSL obszarów |
| Decision dotyczy per-org variation (prawie zawsze gdy `[FORZA-CONFIG]`) | `multi-tenant-variation` | Wybór layer L1/L2/L3/L4 + RLS pattern |
| Decision warta własnego ADR (istotna zmiana kontraktu) | `architecture-adr` | Struktura ADR + linkowanie do META-MODEL |
| Nowa kolumna pochodzi z reality source (PLD v7, D365) | `reality-sync-workflow` | Two-session pattern + brainstorm markera |
| Piszesz wymaganie / kolumnę w docs — trzeba marker | `documentation-patterns` | Marker rules + conflict resolution |

---

## Verification Checklist

- [ ] Zadałem 3 pytania decyzyjne (inna firma / Forza częstotliwość / regulatoryjne).
- [ ] Rozstrzygnięty konflikt gdy >1 pytanie wychodzi na TAK (pytanie 3 wygrywa).
- [ ] Dla schema-driven: zdefiniowane wszystkie atrybuty metadane (label, code, type, required, owner_dept, validation, default, hard_lock, visible_for_role, sort, marker).
- [ ] Dla schema-driven: `hard_lock=true` dla universal defaults (żeby admin nie zepsuł core contracts).
- [ ] Marker przypięty każdej kolumnie / regule / defaultowi (zgodnie z `documentation-patterns`).
- [ ] Cross-reference do ADR-028 / META-MODEL §1 / ADR-031 w dokumencie decyzji.
- [ ] Nie ma mixingu (kolumna w 100% code-driven albo w 100% schema-driven).

---

## Related

- [`META-MODEL.md`](../../decisions/META-MODEL.md) §1 i §3 (primary — schema-driven domain vs code-driven YAGNI)
- [ADR-028 Schema-driven column definition](../../decisions/ADR-028-schema-driven-column-definition.md) — atrybuty metadata + scope of applicability
- [ADR-031 Schema variation per org](../../decisions/ADR-031-schema-variation-per-org.md) — multi-tenant kontekst decyzji
- [ADR-030 Configurable department taxonomy](../../decisions/ADR-030-configurable-department-taxonomy.md) — `owner_department` w metadanych kolumny
- [ADR-015 Centralized constants pattern](../../decisions/ADR-015-centralized-constants-pattern.md) — extended by ADR-028
- Skill `rule-engine-dsl` — następny krok gdy potrzebne reguły dynamiczne
- Skill `multi-tenant-variation` — 4-warstwowy model wariacji per org
- Skill `documentation-patterns` — markery na każdej kolumnie/regule
- Spec: [`docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`](../../../../docs/superpowers/specs/2026-04-17-monopilot-migration-design.md) §2.1 punkt 1, §2.2, §7.2 R1
