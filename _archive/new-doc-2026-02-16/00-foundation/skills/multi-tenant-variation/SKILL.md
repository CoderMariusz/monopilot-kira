---
name: multi-tenant-variation
description: Patterns for per-org schema variation in Monopilot multi-tenant architecture. 4-layer model (L1 core / L2 cols / L3 rules / L4 refs). Use when designing tables, reviewing proposed schema changes, or handling org-specific configuration.
tags: [monopilot, multi-tenant, rls, supabase, meta-model]
---

## When to Use

Aplikuj skill gdy:

- Projektujesz **nową tabelę / regułę / zasób** który musi mieć wariację per org.
- Robisz **review propozycji zmiany schemy** — sprawdzasz czy respektuje 4-warstwowy model i czy nie wprowadza hardcoded per-client values.
- **Onboarding nowego org** — wybór seed template + strategia override.
- **Review RLS policy** dla nowej config-tabeli — czy izolacja `org_id` trzyma się wzorca ADR-013.
- Piszesz **ADR dotyczący multi-tenancy** — decision warta layer placement + upgrade strategy.
- Forza zgłasza zmianę → rozstrzygnięcie czy to L1 (migration + ADR) czy L2-L4 (Settings CRUD).

Pomijaj gdy: piszesz kod czysto engine-owy (BOM calc, GS1 parser) bez interakcji z DB; piszesz UI components bez data binding; piszesz dokumentację wyłącznie universalnych konceptów.

---

## Core Model — 4 warstwy (z ADR-031)

Cała architektura multi-tenant opiera się o 4 warstwy. Każda warstwa ma inny scope, inny marker, inny change process, inne przykłady. Znajomość layer placement jest **obowiązkowa** przy projektowaniu czegokolwiek co dotyka DB.

| Layer | Scope | Marker | Change process | Examples |
|---|---|---|---|---|
| **L1 Core Infrastructure** | Stała struktura dla wszystkich org-ów | `[UNIVERSAL]` | Migration + ADR + release | `users`, `organizations`, `audit_log`, `license_plates`, `lot_genealogy`, GS1 format, EU-14 allergens |
| **L2 Column Definitions** | Per-org w config tables | `[UNIVERSAL]` meta-struktura + `[FORZA-CONFIG]` values | Settings CRUD (ADR-028) | NPD Main Table cols, Planning Main Table cols, Production WO cols |
| **L3 Rule Engine Definitions** | Per-org rules | `[UNIVERSAL]` engine + `[FORZA-CONFIG]` rules | Settings rule editor (ADR-029) | Cascading chains, gate criteria, workflow definitions |
| **L4 Reference Tables Data** | Per-org (struktura wspólna z L1) | `[UNIVERSAL]` structure + `[FORZA-CONFIG]` data | Settings CRUD | Pack sizes, lines, dieset values, allergen extensions |

**Zasada decyzyjna layer placement:**

- Czy struktura musi być identyczna dla *wszystkich* org-ów (kod na niej polega)? → **L1**.
- Czy to kolumna Main Table edytowalna w Settings? → **L2**.
- Czy to reguła walidacji / cascading / gate / workflow? → **L3**.
- Czy to dane lookup-owe z wspólną strukturą tabeli? → **L4**.

---

## RLS Pattern Reminder (ADR-013)

Wszystkie 4 warstwy używają **tego samego wzorca RLS** — users-lookup na `auth.uid()` → `org_id`:

- L1 tables: RLS filtering per `org_id`.
- L2 config tables: RLS filtering per `org_id` (jak data tables).
- L3 rule storage: RLS filtering per `org_id`.
- L4 reference tables: RLS filtering per `org_id`.

**Żadnych warstwowych wyjątków.** Config tables (L2-L4) są RLS-protected tak samo jak data tables (L1). Pominięcie RLS na config table = leak konfiguracji Forza do innego org-a (security + competitive intelligence leak).

---

## Seed Strategy

Nowy org przy onboardingu dostaje **seed template** — zestaw L2/L3/L4 defaults dla typowego klienta branży.

- **Template dla Monopilot** = "food-manufacturing-SMB default" (typowy producent żywności, 3-7 działów, podstawowy Stage-Gate, bazowe kolumny Main Table).
- Po onboardingu org customizuje w Settings — override konkretnych kolumn / reguł / reference values.
- **Forza = PLD v7 seed + 12 miesięcy customizacji** (historical context; Phase A reality sync ekstraktuje Forza-specific config → baseline dla "food-manufacturing-SMB" template).
- Template to **dane** (JSON / SQL seed file), nie kod — więc seed sam też jest `[UNIVERSAL]` struktura + `[FORZA-CONFIG]` lub universal defaults values.

---

## Upgrade Strategy

Gdy Monopilot uwalnia nowe funkcjonalności:

| Typ zmiany | Strategia | Uzasadnienie |
|---|---|---|
| **L1 changes** (nowa core table, migration) | Auto-propagate do wszystkich orgs | L1 = stały kontrakt, wszyscy muszą mieć |
| **L2 changes** (nowa universal kolumna w defaults) | Opt-in per org (review w Settings) | Org może mieć custom kolumnę z tym samym code → conflict resolve manualnie |
| **L3 changes** (nowa universal reguła) | Opt-in per org | Ta sama logika — org mógł zbudować własną |
| **L4 changes** (nowy universal reference entry) | Opt-in per org | Np. EU-14 → EU-15 allergeny (hypothetical) — universal dla struktury, per-org czy importować |

Monopilot release notes **musi** oznaczyć który layer się zmienia. Bez tego upgrade-y są nietestowalne per org.

---

## Anti-patterns

- ❌ **Hardcoded per-client values w kodzie** (if (org === 'forza') …). Blokuje onboarding nowego org-a, wymaga rewrite kodu. Zamiast tego: L2/L3/L4 config row per org.
- ❌ **Separate DB per tenant.** Odrzucone w ADR-003 — operational overhead (N DB to backup, N migrations, N monitors, N schedulerów). Single DB + RLS wygrywa operacyjnie.
- ❌ **L1 schema change bez migration + ADR.** L1 = stały kontrakt — zmiana bez ADR + migration łamie wszystkie org-y i nie jest audytowalna.
- ❌ **Zapominanie RLS na new config table.** Security leak — jeden org widzi config drugiego org-a. Każda tabela (L1-L4) wymaga RLS z pierwszego migration.
- ❌ **Schema-per-industry** (food, pharma, textile → osobny schema kod). Zbyt grubo-ziarniste — nawet w food-manufacturing orgs mają różne struktury Main Table, różne działy, różne workflow. Per-org wygrywa.
- ❌ **L2-L4 change przez migration** (zamiast Settings CRUD). Defeat purpose of schema-driven — jeśli "dodanie kolumny" wymaga migration to równie dobrze może być L1.
- ❌ **L1 zawierające org-specific data.** Core tables nie mogą mieć kolumn pochodzących od konkretnego org-a (np. `users.forza_employee_id` = anti-pattern, powinno być `[FORZA-CONFIG]` w L2 config).
- ❌ **L2 kolumna bez `org_id` w config-tabeli.** Brak izolacji = wyciek konfiguracji między org-ami.

---

## Examples (z markerami)

- **`products` table** → L1 struktura `[UNIVERSAL]` (wszystkie orgs mają tabelę produktów), ale `products.custom_fields` (JSONB) jako schema-driven L2 `[FORZA-CONFIG]` (Forza ma inne extra cols niż inny org).
- **Forza 7 działów** (Commercial, Development, Production, Quality, Planning, Procurement, MRP) → L4 reference data `[FORZA-CONFIG]`; struktura tabeli `departments` = L1 `[UNIVERSAL]` (ADR-030).
- **NPD Stage-Gate G0→G4 definition** → L3 workflow definition `[FORZA-CONFIG]`; workflow engine (state machine interpreter) = L1 `[UNIVERSAL]` (rozszerzenie ADR-007).
- **D365 feature flag** → L1 toggle structure `[UNIVERSAL]` (wszystkie orgs mają mechanism feature flags — ADR-011); per-org flag value `[FORZA-CONFIG]` (wartość Forza = TRUE `[LEGACY-D365]`).
- **Cascading chain Pack_Size → Line → Dieset → Material** → L3 rule definition `[FORZA-CONFIG]` (Forza-specific łańcuch); engine DSL runtime = L1 `[UNIVERSAL]`.
- **Pack sizes data** ("500g Tray", "1kg Vac Pack", …) → L4 reference data `[FORZA-CONFIG]`; struktura `pack_sizes(id, org_id, code, label, sort)` = L1 `[UNIVERSAL]`.
- **GS1-128 regex validation** → L1 `[UNIVERSAL]` (kod, regulacja — żaden org nie może zmienić formatu).
- **Kolumna `Pack_Size` w NPD Main Table** → L2 column definition `[FORZA-CONFIG]`; struktura `column_definitions` tabeli = L1 `[UNIVERSAL]` (ADR-028).
- **Gate criterion "BOM_complete=true AND Costing_approved=true"** → L3 rule `[FORZA-CONFIG]`; gate engine = L1 `[UNIVERSAL]`.
- **Role-permission matrix Forzy** → L2/L3 mix (ADR-012 extended) `[FORZA-CONFIG]`; RBAC engine = L1 `[UNIVERSAL]`.

---

## Handoff do innych skilli

| Gdy | Użyj skilla | Dlaczego |
|---|---|---|
| L2 column definitions (bardzo ściśle powiązane) | `schema-driven-design` | Decyzja schema-driven + atrybuty metadane kolumny |
| L3 rule definitions | `rule-engine-dsl` | Scope 4 obszarów DSL + semantic primitives |
| Implementation detail RLS per layer (jak pisać policy) | `supabase-rls` | Operational skill — konkretne Supabase RLS syntax |
| Zmiana pochodzi z reality source | `reality-sync-workflow` | Two-session pattern przed propagacją |
| Layer placement warty ADR | `architecture-adr` | ADR template + linking do META-MODEL |
| Marker na każdym artefakcie | `documentation-patterns` | Obowiązkowe dla L2/L3/L4 values |

---

## Verification Checklist

- [ ] Dla każdego nowego artefaktu (tabela / reguła / reference value) — przypisany konkretny layer (L1 / L2 / L3 / L4).
- [ ] L1 changes: jest migration + ADR + release note z layer tag.
- [ ] L2-L4 changes: żyją w config-tabelach, change przez Settings CRUD (NIE migration).
- [ ] RLS policy obecne na każdej tabeli (L1-L4 — bez wyjątków).
- [ ] `org_id` obecny w każdej config-tabeli L2-L4.
- [ ] Marker przypięty: struktura = `[UNIVERSAL]`, wartości per-org = `[FORZA-CONFIG]` / `[EVOLVING]` / `[LEGACY-D365]`.
- [ ] Seed template aktualizowany gdy dodajemy L2-L4 universal default.
- [ ] Upgrade strategy zdefiniowana (auto vs opt-in) dla changes uwalnianych publicznie.
- [ ] Cross-reference do ADR-031 + META-MODEL §4 w dokumencie decyzji.

---

## Related

- [`META-MODEL.md`](../../decisions/META-MODEL.md) §4 (primary — multi-tenant variation points, 4-layer model)
- [ADR-031 Schema variation per org](../../decisions/ADR-031-schema-variation-per-org.md) — 4 warstwy + upgrade strategy
- [ADR-003 Multi-tenancy RLS](../../decisions/ADR-003-multi-tenancy-rls.md) — extended by ADR-031 (single DB + RLS, separate DB rejected)
- [ADR-013 RLS org isolation pattern](../../decisions/ADR-013-rls-org-isolation-pattern.md) — RLS implementation template (reużywany L1-L4)
- [ADR-028 Schema-driven column definition](../../decisions/ADR-028-schema-driven-column-definition.md) — L2 layer primary
- [ADR-029 Rule engine DSL + workflow as data](../../decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md) — L3 layer primary
- [ADR-030 Configurable department taxonomy](../../decisions/ADR-030-configurable-department-taxonomy.md) — L4 example (departments reference)
- Skill `schema-driven-design` — L2 (bardzo ściśle powiązane)
- Skill `rule-engine-dsl` — L3
- Skill `supabase-rls` — operational RLS implementation
- Skill `documentation-patterns` — markery L2-L4
- Spec: [`docs/superpowers/specs/2026-04-17-monopilot-migration-design.md`](../../../../docs/superpowers/specs/2026-04-17-monopilot-migration-design.md) §2.1 punkt 4
