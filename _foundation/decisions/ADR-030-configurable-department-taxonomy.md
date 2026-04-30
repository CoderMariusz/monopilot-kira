# ADR-030 — Configurable department taxonomy

**Status:** ACCEPTED
**Date:** 2026-04-17
**Context:** Monopilot Migration Phase 0
**Related meta-model:** [META-MODEL.md §1](META-MODEL.md) (schema-driven domain — departamenty) + [§4](META-MODEL.md) (multi-tenant variation)

---

## Context

PLD v7 (Phase A reality source) ma 7 działów Apexa: Commercial, Development, Production, Quality, Planning, Procurement, MRP. Każdy dział posiada: nazwę, kod, kolor statusu (UI), kolejność w UI, lidera, zakres odpowiedzialności (które kolumny Main Table właściwe do tego działu).

Inne firmy z segmentu food-manufacturing mają **inne taksonomie działów**:
- Logistics osobno (Apex łączy z Planning),
- R&D niezintegrowany z Development,
- QA rozdzielone na Microbiological QA i Process QA,
- brak dedykowanego MRP (łączone z Procurement).

Hardcoding 7 działów Apexa jako enum w kodzie = blokada multi-tenancy ([ADR-031](ADR-031-schema-variation-per-org.md)). Ponieważ każda kolumna Main Table ma `owner_department` ([ADR-028](ADR-028-schema-driven-column-definition.md)), taksonomia działów **musi** być schema-driven równolegle.

---

## Decision

Departamenty przechowywane są jako wiersze w tabeli `departments` — per org przez RLS ([ADR-003](ADR-003-multi-tenancy-rls.md)). Zmiana (dodanie / edycja / soft-delete) w Settings przez administratora org-a, audytowana ([ADR-008](ADR-008-audit-trail-strategy.md)).

### Atrybuty departamentu

| Atrybut | Opis | Marker |
|---|---|---|
| `code` | Stabilny identyfikator (np. `QA`, `PROD`) — nie zmienia się wraz z labelem | `[UNIVERSAL]` struktura atrybutu |
| `label` | Wyświetlana nazwa | `[UNIVERSAL]` struktura atrybutu |
| `color` | Kolor dla UI (status badges, sekcje formularzy) | `[UNIVERSAL]` struktura atrybutu |
| `sort_order` | Kolejność prezentacji w listach i filtrach | `[UNIVERSAL]` struktura atrybutu |
| `leader_user_id` | FK do `users` — lider działu | `[UNIVERSAL]` struktura atrybutu |
| `active` | Soft-delete flag (dział wycofany, ale historia zachowana) | `[UNIVERSAL]` struktura atrybutu |
| `marker` | `[UNIVERSAL]` / `[APEX-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]` per wiersz — meta-marker dziedziczenia | `[UNIVERSAL]` struktura atrybutu |

Atrybuty (nazwy kolumn `departments`) są `[UNIVERSAL]` — struktura taka sama dla wszystkich org-ów. **Wartości** (konkretne działy) są `[APEX-CONFIG]` per org.

### Scope

Ta konfiguracja dotyczy **business departments** — owners kolumn Main Table, assignees workflow steps, filtry raportów po "dziale odpowiedzialnym". **Nie dotyczy**:
- *Roles* ([ADR-012](ADR-012-role-permission-storage.md)) — cross-cutting identity / permissions, nie biznes dept.
- *Warehouses* ([ADR-010 Product-level procurement fields](ADR-010-product-level-procurement-fields.md) + inventory model) — fizyczne lokalizacje, orthogonal concept.

---

## Rationale

1. **Multi-tenant from day 1 ([ADR-031](ADR-031-schema-variation-per-org.md)).** Apex = pierwsza konfiguracja, nie jedyna. Inny klient przychodzi z inną taksonomią — bez kodu.
2. **Spójność z [ADR-028](ADR-028-schema-driven-column-definition.md).** Kolumny Main Table mają `owner_department` jako FK. Jeśli kolumny są schema-driven, to departamenty **muszą** być config-table (inaczej FK do hardcoded enum = regres do code-driven).
3. **Ewolucyjność.** Apex może dodać dział (np. split MRP `[EVOLVING]` → MRP-Planning i MRP-Procurement), zmienić label, soft-delete wycofany dział — bez dewelopera, bez release-u.

---

## Trade-offs accepted

1. **Generic department picker w UI.** Frontend nie może mieć hardcoded 7-item dropdown-u — musi czytać `departments` per org. Jednorazowa inwestycja, reużywana wszędzie.
2. **Raporty parametryzowane po dept.** Filtry "pokaż kolumny QA" są config-driven (reference do `departments.code`), nie string-match. Wymaga dyscypliny w report metadata.
3. **Walidacje "musi wypełnić Quality Dept"** stają się config-driven rule ([ADR-029](ADR-029-rule-engine-dsl-and-workflow-as-data.md) obszar b — conditional required z org-config-value reference).

---

## Alternatives considered (rejected)

- **A) Hardcoded enum 7 działów Apexa w kodzie.** Odrzucone — blokuje multi-tenancy, każdy nowy klient = rewrite enum-a + migration.
- **B) Fixed set per industry template (np. "food-manufacturing departments template").** Odrzucone — nie skaluje nawet wewnątrz segmentu food-manufacturing (jak widać z przykładów: Apex vs typowy producent bez MRP). Template może być **seed-em** (zob. [ADR-031](ADR-031-schema-variation-per-org.md) §Seed strategy), ale nie twardym zbiorem.

---

## Consequences

**Positive:**
- Multi-tenant ready, zgodność z [ADR-028](ADR-028-schema-driven-column-definition.md) i [ADR-031](ADR-031-schema-variation-per-org.md).
- Apex zmienia taksonomię bez dewelopera.
- Audyt zmian w `audit_log` ([ADR-008](ADR-008-audit-trail-strategy.md)).

**Negative:**
- Generic UI component dyscyplina (department picker, filtry raportów, sekcje formularzy).
- Cross-org reporting (agregat po "Quality" w różnych orgs) — nietrywialny bo codes mogą się różnić; adresowane service-role patternem z [ADR-013](ADR-013-rls-org-isolation-pattern.md).

**Neutral:**
- Soft-delete zamiast hard-delete — historia zachowana, wymagane dla audit i dla starych rekordów referujących wycofany dział.

---

## Migration concern — PLD v7 → Monopilot

Departamenty Apex = **pierwsza seed data** dla `org_id=Apex`. Żaden inny org nie widzi tych działów (RLS izoluje przez `org_id`). 7 działów Apexa — initial seed markery:

| Dział | Code | Marker |
|---|---|---|
| Commercial | `CMRC` | `[APEX-CONFIG]` |
| Development | `DEV` | `[APEX-CONFIG]` |
| Production | `PROD` | `[APEX-CONFIG]` |
| Quality | `QA` | `[APEX-CONFIG]` |
| Planning | `PLN` | `[APEX-CONFIG]` |
| Procurement | `PROC` | `[APEX-CONFIG]` |
| MRP | `MRP` | `[APEX-CONFIG]` `[EVOLVING]` (spec §7.2: MRP potencjalnie split na 2 działy — Planning-MRP i Procurement-MRP) |

Kandydaci do promocji `[APEX-CONFIG]` → `[UNIVERSAL seed]` (po reality sync z innymi klientami): Quality, Production — zazwyczaj obecne w każdym food-manufacturing MES. Procedura promocji: META-MODEL §6.3.

---

## Open questions (→ Phase B)

- **Czy `owner_department` na kolumnie Main Table jest required czy optional.** Apex: każda kolumna ma owner. Inne orgs może dopuścić kolumny "shared" bez ownera — decyzja per org lub uniwersalna? Do Phase B.
- **Seed "food-manufacturing-SMB default" template** — czy powinien mieć pre-defined 5–6 działów (Production, Quality, Planning, Procurement, Commercial) zanim org customize w Settings. Jeśli tak, który minimalny zestaw — do Phase B.

---

## Related

- [META-MODEL.md §1](META-MODEL.md) — primary reference (departamenty jako Level "a")
- [META-MODEL.md §4](META-MODEL.md) — multi-tenant variation points
- [ADR-003 Multi-tenancy RLS](ADR-003-multi-tenancy-rls.md) — RLS dla `departments` config-tabeli
- [ADR-008 Audit trail strategy](ADR-008-audit-trail-strategy.md) — audyt zmian
- [ADR-012 Role-permission storage](ADR-012-role-permission-storage.md) — distinct concept (roles ≠ departments), orthogonal
- [ADR-013 RLS org isolation pattern](ADR-013-rls-org-isolation-pattern.md) — szablon policy
- [ADR-028 Schema-driven column definition](ADR-028-schema-driven-column-definition.md) — kolumny referują `departments` przez `owner_department`
- [ADR-031 Schema variation per org](ADR-031-schema-variation-per-org.md) — departamenty jako Layer L4 (per-org data)
