# ADR-028 — Schema-driven column definition

**Status:** ACCEPTED
**Date:** 2026-04-17
**Context:** Monopilot Migration Phase 0
**Extends:** [ADR-015 Centralized constants pattern](ADR-015-centralized-constants-pattern.md) — rozszerza o user-editable subset konfiguracji
**Related meta-model:** [META-MODEL.md §1](META-MODEL.md) (Level "a" — schema-driven domain)

---

## Context

Rzeczywistość PLD v7 (Phase A reality source): Main Table `[UNIVERSAL]` struktura, ale zawartość ~60–80 kolumn, z czego znacząca część jest zmieniana przez Forzę miesięcznie (Commercial dodaje pole handlowe, MRP wyspecjalizowuje kolumnę, Quality wycofuje nieaktualne pole). Hardcodowanie tego zbioru jako enum / migration-only schema blokuje:

- konfigurację per-org (różni klienci mają różne zestawy kolumn — zob. [ADR-031](ADR-031-schema-variation-per-org.md)),
- szybkość iteracji Forzy (obecnie zmiana kolumny = VBA edit),
- automatyczną integrację z raportami i workflow engine (META-MODEL §7, §8),
- audytowalność zmian konfiguracji (każda zmiana powinna być audit event — [ADR-008](ADR-008-audit-trail-strategy.md)).

Kluczowy rozdział w Monopilot: *kolumny jako dane* (user-editable w Settings przez administratora Forzy) vs *kolumny jako kod* (core infra, tabele transakcyjne, struktury stabilne i regulowane standardami).

---

## Decision

Definicja kolumny tabeli głównej (per moduł: NPD Main Table, Planning Main Table, Production WO Table, QA Inspection Table itp.) jest przechowywana jako **metadata row w dedykowanej config-tabeli** per org. Silnik renderu formularzy, tabel, walidacji i raportów czyta te metadane i generuje UI dynamicznie — zero hard-codowanego schematu Main Table w kodzie aplikacyjnym.

### Atrybuty metadanych kolumny

| Atrybut | Opis | Przykład użycia |
|---|---|---|
| label | Wyświetlana nazwa kolumny | "Pack Size", "Alergeny" |
| kod | Stabilny identyfikator techniczny (nie zmienia się z labelem) | `pack_size`, `allergens` |
| typ danych | text / number / enum / date / boolean / reference-lookup / checklist | — |
| owner department | FK do `departments` ([ADR-030](ADR-030-configurable-department-taxonomy.md)) | Quality, Commercial |
| required | czy pole wymagane w save / transition | true / false |
| validation type | reguła walidacji (regex / range / enum / reference lookup) | regex GS1-128 |
| default value | wartość pre-fill | — |
| hard-lock | czy administrator org-a może zmienić / usunąć (`false` dla universal) | true / false |
| visible-for-role | które role widzą kolumnę (role-permission matrix — [ADR-012](ADR-012-role-permission-storage.md)) | — |
| sort order | kolejność w UI | — |
| marker | `[UNIVERSAL]` / `[FORZA-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]` | meta-marker dziedziczenia |

Zmiana dowolnej metadanej kolumny jest audit event (ADR-008).

### Scope of applicability

| Scope | Schema-driven? | Examples |
|---|---|---|
| Main Tables per moduł (NPD, Planning, Production, QA, …) | TAK | NPD `Pack_Size` `[FORZA-CONFIG]`, Planning `MRP_Category` `[FORZA-CONFIG]` |
| Reference tables | TAK | Forza PackSizes `[FORZA-CONFIG]`, Lines `[FORZA-CONFIG]`, allergen EU-14 lista `[UNIVERSAL]` |
| Form-field metadata (required, optional, validation regex) | TAK | Regex GS1-128 `[UNIVERSAL]`, required na NPD name `[UNIVERSAL]` |
| Core infra tables (`users`, `organizations`, `roles`, `audit_log`) | NIE | Struktury stałe, migration-only, `[UNIVERSAL]` |
| Transactional tables (`license_plates`, `lot_genealogy`, `bom_snapshot`) | NIE | Struktury stałe bo regulatoryjne (GS1, traceability) — `[UNIVERSAL]` |

Atrybuty meta-kolumny (label/type/required/owner-dept/itp.) są `[UNIVERSAL]` — to *struktura* metadanych jest jedna dla wszystkich org-ów. Konkretne **wartości** (które kolumny istnieją, z jakim labelem i regułą) są `[FORZA-CONFIG]` per org.

---

## Rationale

1. **Szybkość iteracji Forzy.** Administrator dodaje kolumnę w Settings, zapisuje — od tej chwili jest w formularzu, tabeli, raportach, workflow. Nie potrzebuje dewelopera ani release-u.
2. **Multi-tenant from day 1 ([ADR-031](ADR-031-schema-variation-per-org.md)).** Inny org ma inną strukturę Main Table (inne kolumny, inne reguły, inne owners) bez zmiany kodu — konfiguracja per `org_id`, RLS izoluje.
3. **Aktualizacja per org bez migracji DB.** Nowa kolumna = nowy wiersz w config-tabeli, nie `ALTER TABLE`. Operacyjnie prostsze, bezpieczniejsze, odwracalne.
4. **Automatyczna integracja z engine-ami.** Raport Table/Aggregation (META-MODEL §7) i workflow rule engine (META-MODEL §8, [ADR-029](ADR-029-rule-engine-dsl-and-workflow-as-data.md)) czytają te same metadane — dodanie kolumny automatycznie udostępnia ją raportom i regułom bez osobnej pracy.

---

## Trade-offs accepted

1. **Generic UI renderer overhead.** Frontend musi być generic table / form renderer czytający metadane. Inwestycja początkowa większa niż hardcoded UI, ale amortyzuje się per moduł (16 modułów korzysta z jednego renderera).
2. **Query performance.** Kolumny schema-driven fizycznie żyją w JSONB w tabeli głównej albo w EAV-style value table. Obie opcje wymagają przemyślanej strategii indexing-u (partial indexes, GIN dla JSONB, kompozytowe PK dla EAV). Wybór storage strategy — otwarta decyzja Phase D (niżej).
3. **Dyscyplina konfiguracji.** Każda zmiana metadanych audytowana i wersjonowana ([ADR-008](ADR-008-audit-trail-strategy.md)). Bez dyscypliny administrator może rozregulować system — stąd `hard-lock` + role-permission matrix ([ADR-012](ADR-012-role-permission-storage.md)).

---

## Alternatives considered (rejected)

- **A) Hardcoded schema per klient (osobny kod / branch).** Odrzucone — nie skaluje poza 1–2 klientów, każdy klient = rewrite, regresy krzyżowe.
- **B) Full no-code builder w stylu Airtable / Notion Databases.** Odrzucone — over-scope (META-MODEL §3 YAGNI). Wymaga query builder-a, pivotów, relacji ad-hoc — ryzyko "half-baked database inside database" (spec §7.2 R1).
- **C) Tylko reference tables schema-driven, Main Tables code-driven.** Odrzucone — Forza Main Table rośnie miesięcznie, to jest właśnie obszar, który *musi* być edytowalny bez dewelopera.

---

## Consequences

**Positive:**
- Elastyczność konfiguracji per org bez release-u.
- Multi-tenant ready od day 1 (fundament [ADR-031](ADR-031-schema-variation-per-org.md)).
- Report i workflow engine auto-awareness nowych kolumn.
- Szybsze onboardingi nowych klientów (seed template + customize w Settings).

**Negative:**
- Generic UI rendering overhead (jednorazowa inwestycja frontend).
- Performance concerns z JSONB / EAV — wymaga przemyślanej strategii storage i indexing-u.
- Migration complexity dla kolumn z hard-constraints (np. FK, unique indexes) — te pozostają code-driven ([ADR-031 L1](ADR-031-schema-variation-per-org.md)).

**Neutral:**
- Migration template musi obsługiwać "dodanie schema-driven kolumny" jako event (insert do config-tabeli + audit row), a nie jako DDL event.
- Wymaga review dokumentacyjnego gdy kolumna kandyduje do promocji `[FORZA-CONFIG]` → `[UNIVERSAL]` (META-MODEL §6.3).

---

## Open questions (→ Phase D / Phase B)

- **Które konkretnie kolumny Main Table NPD są `[UNIVERSAL]` vs `[FORZA-CONFIG]`** — decyzja w Phase B po Phase A reality sync (~60–80 kolumn PLD v7 wymaga klasyfikacji per kolumna).
- **Storage strategy: JSONB w tabeli głównej vs EAV w osobnej tabeli.** Decyzja implementation Phase D — profilowanie zapytań raportowych i workflow przed wyborem. Obie opcje kompatybilne z metadata model z tego ADR.
- **Hard-lock semantyka** — czy `hard-lock=true` oznacza "tylko developer może zmienić" czy "tylko superadmin w Settings"? Do decyzji w Phase B.

---

## Related

- [META-MODEL.md §1](META-MODEL.md) — primary reference (schema-driven domain / Level "a")
- [ADR-003 Multi-tenancy RLS](ADR-003-multi-tenancy-rls.md) — izolacja config tables per org
- [ADR-008 Audit trail strategy](ADR-008-audit-trail-strategy.md) — audytowalność zmian metadanych
- [ADR-012 Role-permission storage](ADR-012-role-permission-storage.md) — visible-for-role w metadanych kolumny
- [ADR-013 RLS org isolation pattern](ADR-013-rls-org-isolation-pattern.md) — szablon RLS dla config-tabel (reużywany)
- [ADR-015 Centralized constants pattern](ADR-015-centralized-constants-pattern.md) — extended by ADR-028 dla user-editable subset
- [ADR-029 Rule engine DSL + workflow as data](ADR-029-rule-engine-dsl-and-workflow-as-data.md) — reguły referencują kolumny
- [ADR-030 Configurable department taxonomy](ADR-030-configurable-department-taxonomy.md) — `owner_department` FK
- [ADR-031 Schema variation per org](ADR-031-schema-variation-per-org.md) — L2 layer of schema variation
- Spec: [`docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`](../../../docs/superpowers/specs/2026-04-17-monopilot-migration-design.md) §2.1 punkt 1
