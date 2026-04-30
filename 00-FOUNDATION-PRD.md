---
title: PRD 00-FOUNDATION — Monopilot MES
version: 3.0
date: 2026-04-18
phase: Phase B.1 (Phase D renumbered + Research R1-R15 embedded)
status: Draft v3.0 — pending user review
supersedes: v2.3 (2026-02-18, pre-Phase-D)
references:
  - _foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md
  - _foundation/research/MES-TRENDS-2026.md
  - _foundation/META-MODEL.md
  - _foundation/decisions/ADR-028-schema-driven-column-definition.md
  - _foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md
  - _foundation/decisions/ADR-030-configurable-department-taxonomy.md
  - _foundation/decisions/ADR-031-schema-variation-per-org.md
  - _meta/reality-sources/pld-v7-excel/
  - _meta/reality-sources/brief-excels/
---

# PRD 00-FOUNDATION — Monopilot MES

> **Fundament architektoniczny dla 15-modułowego schema-driven multi-tenant MES.**
>
> Nie zawiera requirements per-moduł (te są w 01-NPD, 02-SETTINGS, …, 15-OEE). Zawiera: principles, marker discipline, module map, tech stack, schema-driven + rule engine + multi-tenant + event-first foundations, cross-cutting requirements, ADRs list, open items.

---

## Executive Summary

**Monopilot** to cloud-native, schema-driven, multi-tenant MES zastępujący Smart PLD v7 (Excel) + D365 manufacturing functionality. Apex Foods = pierwsza konfiguracja; architektura multi-tenant from day 1.

**Positioning (z MES-TRENDS-2026.md §3):** pomiędzy Excelem (SMB food-mfg pen-and-paper replacement) a enterprise ERP (SAP/D365). Strip-down pattern: GL/AP/AR/HR/CRM zostają w D365/Xero/dedicated, Monopilot przejmuje Manufacturing Execution + Quality + Warehouse + Shipping + NPD + Reporting + Maintenance + OEE. **NIE budujemy pełnego ERP.**

**Two-systems principle (Phase D P2):** przez 12 miesięcy v7 Excel i Monopilot są dwoma interfejsami jednego logicznego systemu (parallel-run, strangler-fig migration per MES-TRENDS-2026 §3).

**Model biznesowy:** SaaS, multi-tenant, EU data residency default. Konkretne metryki sukcesu (klienci, MRR, churn) **out-of-scope tego PRD** — living w osobnym business plan doc.

---

## §1 — Six Architectural Principles [Phase D]

Six principles stanowią architectural contract Monopilot. Każdy PRD modułu MUSI być zgodny; każdy ADR MUSI explicite odnosić się do relevantych principles.

### P1 — Easy extension contract
Nowe kolumny / dept / workflows / rules dodawane przez **schema-driven Admin UI wizard** (ADR-028), nie przez code changes ani migration per-org. Marker [APEX-CONFIG] ≠ hard-coded exception; to konfiguracja w UI lub metadata. Source: Phase D decision #17 ("easy extension = architectural contract").

### P2 — Two-systems principle
V7 Excel i Monopilot są **dwoma UX layers tego samego logicznego systemu** przez 12 miesięcy transition. Reality fidelity PRD = 1:1 v7, speculation deferred. REALITY-SYNC pattern (obowiązkowy): zmiana v7 → update `_meta/reality-sources/pld-v7-excel/*` w tej samej sesji (Session A), propagacja do PRDów osobna sesja (Session B). Source: Phase D §4 + MES-TRENDS-2026.md §3 (strangler fig).

### P3 — Schema-driven + Rule engine DSL
Main Table 69 cols definiowany w `Reference.DeptColumns` (ADR-028). Rules (cascading / conditional required / gate / workflow) w DSL stored as data (ADR-029), **nie w kodzie**. Admin UI wizard jako blocker dla P1. Runtime engine generuje forms/validators/views/flows z metadata. Source: ADR-028, ADR-029, META-MODEL §4-6.

### P4 — Reality fidelity
Phase B PRDs replikują v7 1:1 (7 depts z fixed names, 69 cols Main Table, cascading rules zgodne z obecnymi). Speculation (Multi-site, OEE advanced, AI features) deferred do Phase C/D. Source: Phase D §5-6.

### P5 — Multi-tenant from day 1
4-warstwowy model L1-L4 (ADR-031): L1 core universal, L2 org config, L3 tenant extensions, L4 org-private. RLS baseline, EU data residency cluster default, schema variation per org. Source: ADR-031, MES-TRENDS-2026.md §5.

### P6 — Marker discipline
Każdy fragment PRD / ADR / skill oznaczony jednym z 4 markerów (patrz §2). Marker kategoryzuje co jest universal vs per-tenant-config vs evolving vs legacy. Nie ma fragmentu "bez markera". Source: Phase D decision #9.

---

## §2 — Marker Discipline

Cztery markery obowiązkowe w każdym PRD / ADR / skill / code comment dotyczącym behawioru biznesowego:

### `[UNIVERSAL]`
**Definicja:** Działa identycznie dla wszystkich tenantów. Część L1 core architecture. Upgrades = automatic rolling dla wszystkich.

**Przykłady:**
- Outbox pattern event-first architecture
- GS1-128 barcode parsing (AI 01/10/17/21/37)
- RLS `tenant_id` enforcement
- EPCIS 2.0 event shape
- 14 alergenów EU FIC 1169/2011 (regulatory baseline)

### `[APEX-CONFIG]`
**Definicja:** Konfiguracja per-tenant aktualnie ustawiona dla Apex, ale **pattern universal**. Inni klienci skonfigurują inaczej przez Admin UI. NIE code-level exception.

**Przykłady:**
- 7 fixed dept names (Core/Technical/Packaging/MRP/Planning/Production/Price) — ADR-030 pozwala innym orgom split/merge
- Jane = NPD Manager orchestrator — rola UNIVERSAL, osoba APEX-CONFIG
- Builder_FA5101 D365 constants (FNOR/APX100048/ApexDG/FinGoods/APXProd01) — proponowana nowa tabela `Reference.D365_Constants`
- PR_Code_Final format `PR<digits><process_letter>` — regex schema-driven per-org

### `[EVOLVING]`
**Definicja:** W trakcie zmian (Phase B/C/D będzie uzupełniać). Znany open question lub partial implementation. Require review in future phases.

**Przykłady:**
- Brief allergens lokalizacja (Phase D §10 carry-forward)
- Hard-lock semantyka ADR-028 (developer vs superadmin)
- Rule engine versioning (v1 active vs v2 draft)
- Commercial upstream od briefu

### `[LEGACY-D365]`
**Definicja:** Field shape / logic dziedziczone z D365 dla bridge-period compatibility. **NIE** dla business logic która sama z siebie jest universal (CCP logic, alergeny = [UNIVERSAL]). Tylko D365-specific quirks.

**Przykłady:**
- D365 Item entity field shape (dimensions, tracking dimension hierarchy)
- D365 Release Workflow states mapping
- DMF (Data Management Framework) entity format dla outbound sync
- N+1 product structure w D365 Builder (OP=10 always) — struktura wymuszona D365, nie przez nasze preferencje

**Rule:** jeśli nie jesteś pewny → użyj [EVOLVING] i flag w open items.

---

## §3 — Personas [UNIVERSAL z [APEX-CONFIG] nazwiskami]

### Primary (z reality sources)

| Persona | Opis | Modules primary | Markery |
|---|---|---|---|
| **NPD Manager** (Jane @ Apex) | Orchestrator 01-NPD pipeline; Brief import → Core → depts cascade → D365 Builder | 01-NPD, 02-SETTINGS (read) | role [UNIVERSAL], osoba [APEX-CONFIG] |
| **Technical / Quality** | Dept owner 03-TECHNICAL + 09-QUALITY (HACCP/CCP/holds) | 03-TECHNICAL, 09-QUALITY | [UNIVERSAL] |
| **Planning** | PO/TO/WO creation, MRP basic | 04-PLANNING-BASIC | [UNIVERSAL] |
| **Production Manager** | Dept owner 08-PRODUCTION (WO execution, operator sign-off) | 08-PRODUCTION | [UNIVERSAL] |
| **Warehouse Operator** | GRN, LP moves, FEFO picking | 05-WAREHOUSE, 06-SCANNER-P1 | [UNIVERSAL] |
| **Shipping Lead** | SO, pack, EDI/EPCIS events, Peppol invoicing | 11-SHIPPING | [UNIVERSAL] |

### Secondary

| Persona | Modules |
|---|---|
| Dyrektor zakładu | Wszystkie (read-only), 12-REPORTING |
| Administrator | 02-SETTINGS (schema-driven config, rule engine wizard) |
| Maintenance Tech | 13-MAINTENANCE, 02-SETTINGS (maszyny) |
| Finance Analyst | 10-FINANCE (cost roll, variance); GL/AP/AR w D365/Xero |
| Site Manager (multi-site) | 14-MULTI-SITE, 12-REPORTING filtered |

**Role naming (Phase D decision #15):** Core = **NPD team** (nie "Development"). Technical = Quality (QA). MRP **NIE** split.

---

## §4 — Module Map (15 modules, Phase D renumbering)

Two tracks — **PRD writing** i **Build/Implementation** — mają różne tempo i granularność.

### §4.1 PRD Writing Phases

PRD writing = **fazami (batch-based)** bo moduły w batchu dzielą common context (reality sources, dependencies, research insights) — efektywność tokenów + consistency.

| Track | Phase | Scope | Status |
|---|---|---|---|
| **Phase B** (foundation, in progress) | B.1 | 00-FOUNDATION rewrite | COMPLETE (this doc) |
| | B.2 | 01-NPD primary (Brief import + D365 Builder + allergens cascade) | NEXT |
| **Phase C** (5 writing batches) | C1 | 02-SETTINGS + 03-TECHNICAL + INTEGRATIONS stage 1 (D365 BOM sync) | Pending |
| | C2 | 04-PLANNING-BASIC + 05-WAREHOUSE + 06-SCANNER-P1 | Pending |
| | C3 | 07-PLANNING-EXT + 08-PRODUCTION | Pending |
| | C4 | 09-QUALITY + 10-FINANCE + 11-SHIPPING + INTEGRATIONS stage 2/3 | Pending |
| | C5 | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE + INTEGRATIONS stage 4/5 | Pending |

**Zasady writing phase:**
- 1 writing phase = 1-3 sesji, produkuje 1-4 gotowych PRDów (plus updated 00-FOUNDATION gdy pojawi się nowy decision)
- W batch PRDy piszemy **równolegle lub w krótkiej sekwencji w tej samej sesji** (common context reuse)
- Post-batch close handoff → following batch bootstrap

### §4.2 Build / Implementation Sequence

Build = **per module albo jego części, po kolei, z rozbiciem na stories/tasks**. Żadnych "batch implementations" — moduł lub submodule implementowany end-to-end (stories→QA→regression→done) zanim zaczyna się następny.

**Decyzja (2026-04-18):** Rozdzielamy writing od building. Writing C1 robi PRDy dla 02 + 03 razem, ale implementacja leci sequential: wszystkie stories 02-SETTINGS → QA → regression → close, potem 03-TECHNICAL tak samo.

**Granularność breakdown (per moduł):**
- PRD → Epics (jeden = jedna logiczna feature area, np. "Schema-driven column CRUD", "D365 Builder N+1 output")
- Epics → User Stories (per user skill `story-writing`: 1 story = 1 manageable logical block dla agenta, AC z GIVEN/WHEN/THEN + numbered sub-steps)
- Stories → Tasks (vba-pipeline-style dla kodu VBA / podobny pipeline dla Monopilot web-app)

**Build sequence master order** (po zamknięciu każdego PRD):

| # | Build order | Module/Part | Prerequisite (implementation) |
|---|---|---|---|
| 1 | B.1 post-writing | _skip — 00-FOUNDATION nie ma "build" (meta-PRD)_ | — |
| 2 | B.2 post-writing | **01-NPD implementation** z rozbiciem: (a) core dept cols + cascade, (b) Brief import, (c) allergens multi-level cascade, (d) D365 Builder N+1 output, (e) Dashboard | Foundation infra (rule engine, schema-driven, outbox) w minimum scope |
| 3 | C1 post-writing | **02-SETTINGS impl** (admin wizard schema+rules) → **03-TECHNICAL impl** (product master + BOM + allergens full) → **INTEGRATIONS stage 1** | 01-NPD done |
| 4 | C2 post-writing | **04-PLANNING-BASIC impl** → **05-WAREHOUSE impl** → **06-SCANNER-P1 impl** (PWA Receive/Move/Pick/Count) | 02+03 done |
| 5 | C3 post-writing | **07-PLANNING-EXT impl** → **08-PRODUCTION impl** (WO exec + changeover gate) | 04+05+06 done |
| 6 | C4 post-writing | **09-QUALITY impl** (CCP+holds) → **10-FINANCE impl** (cost roll) → **11-SHIPPING impl** (EPCIS+SSCC+Peppol) → **INTEGRATIONS stage 2/3** | 08 done |
| 7 | C5 post-writing | **12-REPORTING impl** → **13-MAINTENANCE impl** → **14-MULTI-SITE impl** (L2→L3 opt-in) → **15-OEE impl** → **INTEGRATIONS stage 4/5** | 08+05+09 done |

**Rozbicie modułu na części** — dopuszczalne gdy moduł duży (01-NPD, 08-PRODUCTION, 11-SHIPPING). Każda część = osobny sprint z własnymi stories + QA + regression. Kolejna część nie startuje przed close poprzedniej.

**Regression rule:** po każdym module impl → regression test suite (Vitest + Playwright) przed kolejnym. Skills: `vba-regression` pattern (for VBA) / analogous web-app regression pipeline (to be defined C1).

### §4.3 Tabela 15 modułów

| # | Moduł | PRD Writing | Build order | File | Dependencies |
|---|---|---|---|---|---|
| 00 | FOUNDATION | B.1 ✅ | — (meta) | `00-FOUNDATION-PRD.md` (this) | — |
| 01 | NPD | B.2 | 1 (primary) | `01-NPD-PRD.md` | 00 |
| 02 | SETTINGS | C1 | 2 | `02-SETTINGS-PRD.md` | 00, 01 (schema introspection) |
| 03 | TECHNICAL | C1 | 3 | `03-TECHNICAL-PRD.md` | 00, 01, 02 |
| 04 | PLANNING-BASIC | C2 | 4 | `04-PLANNING-BASIC-PRD.md` | 01, 02, 03 |
| 05 | WAREHOUSE | C2 | 5 | `05-WAREHOUSE-PRD.md` | 01, 02, 03 |
| 06 | SCANNER-P1 | C2 | 6 | `06-SCANNER-P1-PRD.md` | 05 (base), 04 |
| 07 | PLANNING-EXT | C3 | 7 | (new, C3) | 04, 05 |
| 08 | PRODUCTION | C3 | 8 | `08-PRODUCTION-PRD.md` | 01, 04, 05 |
| 09 | QUALITY | C4 | 9 | `09-QUALITY-PRD.md` | 05, 08 |
| 10 | FINANCE | C4 | 10 | `10-FINANCE-PRD.md` | 08, 05 |
| 11 | SHIPPING | C4 | 11 | `11-SHIPPING-PRD.md` | 05, 09 |
| 12 | REPORTING | C5 | 12 | `12-REPORTING-PRD.md` | 08, 05, 09 |
| 13 | MAINTENANCE | C5 | 13 | `13-MAINTENANCE-PRD.md` | 02, 08, 15 |
| 14 | MULTI-SITE | C5 | 14 | `14-MULTI-SITE-PRD.md` | 02, 05 |
| 15 | OEE | C5 | 15 | (new, C5) | 08 |

### INTEGRATIONS — distributed, not a single module

Phase D decision: INTEGRATIONS nie jest osobnym modułem. **Multi-stage, rozproszone C1-C5**:

| Stage | Phase | Integration | Target module |
|---|---|---|---|
| 1 | C1 | D365 BOM/item/supplier one-way pull + production confirmations push | 02-SETTINGS, 03-TECHNICAL |
| 2 | C4 | Comarch Optima (PL finance) batch export | 10-FINANCE |
| 3 | C4 | EDI EDIFACT (ORDERS / DESADV / INVOIC) + Peppol access point | 11-SHIPPING |
| 4 | C5 | Supplier portal (light) + supplier certs | (future procurement module, post-Phase-C) |
| 5 | C5 | Customer portal + webhooks | 11-SHIPPING |

**Odrzucony:** stary `13-INTEGRATIONS-PRD.md` (pre-Phase-D). Zarchiwizowany do `_archive/pre-phase-d-prds/`. Content cherry-pick per stage.

### Scanner (06-SCANNER-P1) — inkrementalny

Stare dokumenty opisywały "Scanner M05" z 5 epikami. Phase D: 06-SCANNER-P1 to **P1 slice** (Receive/Move/Pick/Count), dalsze zakresy (Offline deep, Split/Merge, Pack&Ship) = post-P1. Patrz §9 MES-TRENDS-2026.md + MES-TRENDS-2026 §7.

---

## §5 — Tech Stack [UNIVERSAL]

### Runtime + Frontend

- **Next.js App Router + RSC** [R1 MES-TRENDS-2026 §1]: multi-tenant `/app/[tenant]/...` + middleware. Server Actions > większość REST endpointów w admin panelach.
- **TypeScript 5+** strict mode.
- **React 19+**, React Hook Form + Zod resolver.
- **Tailwind** + minimal design system (per-tenant theming via L2 config).
- **PWA (Workbox)** dla 06-SCANNER-P1 [R5 MES-TRENDS-2026 §7]: Service Worker + IndexedDB sync queue + DataWedge keyboard-wedge. Capacitor wrapper jako P2 fallback.

### Backend

- **Postgres 16+** (Supabase lub self-host — nie vendor lock-in, standard SQL).
- **Storage pattern [R2]** (MES-TRENDS-2026 §4): hybrid core-typed + JSONB. Main Table = 69 typed cols + `ext_jsonb` (L3) + `private_jsonb` (L4) + `schema_version INT`. Composite indexes `(tenant_id, dept_id, status, created_at)`, GIN on `ext_jsonb`.
- **RLS default** [R3] (MES-TRENDS-2026 §5.2): `tenant_id UUID NOT NULL` na wszystkich tabelach biznesowych, policies USING + WITH CHECK, LEAKPROOF SECURITY DEFINER wrappers, testy zawsze z app-role (nigdy superuser).
- **Zod + json-schema-to-zod runtime** [R4] (MES-TRENDS-2026 §4.3): `Reference.DeptColumns` → JSON Schema → Zod runtime → RHF resolver. Cache LRU per `schema_version`.
- **Outbox pattern od MVP** [R1] (MES-TRENDS-2026 §3, §10): domain events w tabeli `outbox_events`, worker publikujący do queue. Event shape ISA-95-compatible. Hook dla D365 / MQTT / feature store / EPCIS.

### Cross-cutting infra

- **Feature flags**: PostHog self-host [R6] (MES-TRENDS-2026 §5.4).
- **Observability**: Sentry + Datadog / OpenTelemetry (MES-TRENDS-2026 §9 cross-cutting).
- **Event bus (open question R10.3 MES-TRENDS-2026)**: rekomendacja wstępna Azure Service Bus (D365 adapter pattern); weryfikacja Phase C.
- **LLM platform (open question)**: Claude API direct [R12] (MES-TRENDS-2026 §6) + Modal dla custom models. Warstwy L0/L1 only P1-P3; L2 autonomous agents = post-12mies production data.
- **Testing**: Vitest (Phase D decision #10) + Playwright (E2E per module).
- **i18n** [R11] (MES-TRENDS-2026 §7.2): pl/en/uk/ro baseline od dnia 1. ICU MessageFormat, nie string concat.

### Integration stack

- **D365 adapter** [R8] (`@monopilot/d365-adapter`): DMF client + retry/DLQ + schema mapping. One-way pull (items/BOM/customers/suppliers/locations/UoM nightly + on-demand); one-way push (production confirmations/inventory movements/shipments/quality holds near-real-time via Azure Service Bus).
- **Peppol access point (open question)** (MES-TRENDS-2026 §8): Storecove / Pagero / Tradeshift SaaS P1; on-prem Phase 2.
- **GS1 lib (shared backend + frontend)** [R15] (MES-TRENDS-2026 §7.3): GS1-128 AI parser zgodny z GS1 General Specs 24.0.

---

## §6 — Schema-driven Foundation [ADR-028]

### Koncepcja

Główne encje biznesowe (Main Table 69 cols, BOM, Reference tables) definiowane w **metadata tabelach** (`Reference.DeptColumns`, `Reference.FieldTypes`, `Reference.Formulas`). Runtime engine generuje:

- **React forms** (z RHF + Zod)
- **Server validators** (Zod runtime per request)
- **TS types** (codegen + runtime fallback)
- **List/detail views** (column visibility per role, per tenant)
- **REST/GraphQL API** (Directus-pattern, MES-TRENDS-2026 §4.1)

### Admin UI wizard (blocker dla P1 "easy extension")

UI flow do add/edit column:
1. User picks field type (string / number / date / enum / formula / relation) — enum-based, nie free-form
2. Validation rules (required / unique / regex / range) — DSL-stored
3. Presentation (form layout / list column / export flag)
4. Preview w sample data
5. Save → metadata upsert + schema_version bump + migration record

### Storage tiers

| Tier | Storage | When |
|---|---|---|
| L1 core (69 cols) | Native Postgres typed columns | Hot-path, performance-critical |
| L2 org config | Metadata + L1 combination flags | Per-tenant variation w L1 options |
| L3 custom cols | `ext_jsonb` + expression indexes | Per-tenant extensions |
| L4 org-private | `private_jsonb` | Tenant-owned, zero Monopilot visibility |

### Schema versioning

- Każda zmiana DeptColumns produkuje `schema_migration` record
- Stare rekordy noszą `schema_version INT` — backward compat guaranteed do N-2 major
- Migration idempotent: add column z defaultem, never drop w-locie (deprecate → wait N releases → remove)
- Drift detection daily job: compare `information_schema` vs `Reference.DeptColumns`

### Reject patterns (z MES-TRENDS-2026 §4.6)

- Pure EAV (Salesforce Value1..ValueN hack) — JSONB lepszy dziś
- Notion block monolith — za mało structural dla 69-col Main Table
- Retool/Appsmith jako platforma — to narzędzia, my budujemy własny produkt
- Pure "schema = DDL" (Baserow-style) — migrations koszmar przy L3/L4

---

## §7 — Rule Engine DSL [ADR-029]

### 4 obszary rule engine

| Obszar | Description | Przykłady Apex |
|---|---|---|
| **Cascading** | Auto-fill downstream fields z upstream dept | Core fills cascading (allergen/nutrition) do Technical/Packaging/MRP/Planning/Production/Price |
| **Conditional required** | Field requirements zależne od innych pól | Catch-weight product → require tare/gross; allergen-free product → require ATP swab result |
| **Gate rules** | Block transitions przed spełnieniem warunków | Price blocking → Core + Production done; Allergen changeover gate → cleaning validation + ATP swab + dual sign-off |
| **Workflow-as-data** | State machines definiowane metadata, nie kodem | WO state machine, TO lifecycle, Release-to-warehouse flow |

### Format (hybrid)

- **JSON runtime** — engine-executable format (stored w `Reference.Rules` z `tenant_id`, `rule_type`, `definition_json`, `version`, `active_from`, `active_to`)
- **Mermaid docs** — human-readable workflow diagrams auto-generated z JSON
- **Wizard Admin UI** — visual builder (condition → action), dry-run na sample data, diff preview, version history

### Example — Allergen changeover gate (08-PRODUCTION, [UNIVERSAL])

```json
{
  "rule_id": "allergen_changeover_gate",
  "rule_type": "gate",
  "triggers": ["wo.status_change.READY"],
  "conditions": [
    {"prev_wo.allergens", "CONTAINS_ANY", "next_wo.allergen_free_claim"}
  ],
  "actions": [
    {"require": "cleaning_validation_checklist_signed"},
    {"require": "atp_swab_result", "max_rlu": 10},
    {"require": "sign_off", "count": 2, "roles": ["quality_lead", "production_lead"]}
  ],
  "on_fail": {"block_transition": true, "notify": ["hygiene_lead"]}
}
```

### Open items rule engine

- Rule engine versioning (ADR-029 open): v1 active vs v2 draft — Phase D+ implementation
- Hard-lock semantyka ADR-028 open: rules dla schema changes "developer only" vs "superadmin only"
- Dry-run scope (complete replay vs sample)

---

## §8 — Multi-tenant Model L1-L4 [ADR-031]

### 4 warstwy schema

| Layer | Scope | Storage | Upgrade model |
|---|---|---|---|
| **L1 — Core universal** | 69 cols Main Table, core rules, podstawowa dept taxonomy (ADR-030) | Native Postgres typed + core rule metadata | Auto-rolling, canary → 10% → 50% → 100% w 2-4 tyg |
| **L2 — Org config** | Wybory między L1 opcjami (dept split/merge, rule flavor v1/v2, formula variants) | Metadata flags per tenant | Opt-in per tenant, UI wizard "migrate to v2", dual-run N miesięcy |
| **L3 — Tenant extensions** | Custom cols (JSONB), custom rules (DSL) | `ext_jsonb` + Reference.Rules filtered by tenant | Tenant-initiated, CLI + migration runner |
| **L4 — Org-private** | Completely private schemas/tables, zero Monopilot visibility | `private_jsonb` or per-tenant schema | Tenant-owned, zero Monopilot touch |

### Isolation default [R3, R7]

- **Shared DB + shared schema + tenant_id + RLS** (MES-TRENDS-2026 §5.1) — Apex Day 1
- **Silo opt-in dla enterprise** — per-tenant DB cluster później (data residency / white-label / compliance)
- **NIE** "shared DB + separate schemas" default — łączy wady (per Bytebase 2025)

### Data residency [R7] (APEX-CONFIG→UNIVERSAL)

- EU cluster default dla Apex + wszystkich EU klientów
- US cluster gdy pojawi się USA customer
- Global control plane + regional data planes

### Upgrade orchestration [MES-TRENDS-2026 §5.4]

- **Canary tenants** (5-10%) → monitor 15-30min → progressive
- **Tenant migrations table**: `(tenant_id, component, current_version, target_version, last_run_at)`
- **Feature flags per-tenant targeting** (PostHog)
- Opt-in, max 2-3 major versions back supported (no permanent opt-out)

### Admin tooling

- **Impersonation**: explicit `impersonating_as` flag w session + audit log każdej operacji. Nigdy silent RLS bypass.
- **Tenant switcher**: superadmin-only, MFA, SIEM logged.
- **Cross-tenant analytics**: osobny warehouse schema (denormalized snapshots), nigdy prod RLS bypass.

### Open items multi-tenant

- Upgrade strategy L2/L3/L4 opt-in granularity (Phase D §10 carry-forward; research §5.4 daje framework)
- Storage partition strategy (open question R10.3: partition by tenant_id od MVP czy później?) — rekomendacja wstępna: start bez partitioningu, monitor EXPLAIN

---

## §9 — Configurable Department Taxonomy [ADR-030]

### Koncepcja

Dept structure = L2 config per tenant. Apex = baseline 7 depts fixed names:

| Dept | Code | Role | Marker |
|---|---|---|---|
| Core | `core` | NPD orchestrator (Brief import → cascade) | [APEX-CONFIG] |
| Technical | `technical` | Quality / spec definition | [APEX-CONFIG] |
| Packaging | `packaging` | Label, shelf-life, GS1 | [APEX-CONFIG] |
| MRP | `mrp` | Material planning, supplier sourcing | [APEX-CONFIG] |
| Planning | `planning` | PO/TO/WO schedule | [APEX-CONFIG] |
| Production | `production` | WO execution spec (≠ 08-PRODUCTION module execution) | [APEX-CONFIG] |
| Price | `price` | Final pricing + margin validation | [APEX-CONFIG] |

### Other-org variation (ADR-030 [UNIVERSAL])

- **Dept split**: org może split "Technical" na "Food-Safety" + "Quality-Lab"
- **Dept merge**: org może merge "MRP" + "Planning" w "Supply-Chain"
- **Custom depts**: org dodaje "Regulatory-Affairs" jako nowy dept

Implementacja: L2 config `tenant.dept_overrides` JSONB, run-time re-mapping cascade/gate rules.

### Phase D decision #15 — role naming fix

- Core = **NPD team** (nie "Development")
- Technical = Quality (QA)
- **MRP NIE split** (wcześniejsze założenie wycofane)

---

## §10 — Event-first + AI/Trace-ready Schema [R1, R13]

### Outbox pattern od MVP

Wszystkie state changes emitują event do `outbox_events`:

```sql
CREATE TABLE outbox_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,         -- apex/uk-site/mixing-line/wo-4521/ccp-chilling
  aggregate_type TEXT NOT NULL,     -- wo / lot / quality_event / shipment
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  app_version TEXT NOT NULL
);
CREATE INDEX ON outbox_events (tenant_id, created_at) WHERE consumed_at IS NULL;
```

Worker publikuje do queue (Azure Service Bus / SQS / RabbitMQ). Hook za darmo dla: D365 adapter, MQTT bridge (future UNS), feature store (ML), EPCIS event stream (traceability).

### Event naming ISA-95-compatible

Format: `<tenant>/<site>/<area>/<line>/<event_type>`

Przykłady:
- `apex/uk-site/mixing-line/wo-4521/ccp-chilling-out-of-spec`
- `apex/uk-site/warehouse/lp-8823/moved`
- `apex/uk-site/shipping/shipment-1234/epcis-commissioning`

### Schema "AI-ready + traceability-ready" od dnia 1 [R13]

Każda kluczowa encja (`lot`, `work_order`, `quality_event`, `maintenance_event`, `shipment`, `bom_item`) MUSI mieć pola:

| Field | Purpose |
|---|---|
| `id UUID` (v7 time-ordered preferred) | Stabilny identyfikator |
| `external_id TEXT` | Integration key (D365 RecId, GS1 GTIN, etc.) |
| `tenant_id UUID NOT NULL` | RLS enforcement |
| `created_at TIMESTAMPTZ` (monotonic) | Event ordering |
| `created_by_user UUID` | Audit |
| `created_by_device TEXT` | Scanner telemetry (device_id) |
| `app_version TEXT` | Rollback/debug after release |
| `model_prediction_id UUID NULL` | Hook dla ML (Phase 3+) |
| `epcis_event_id UUID NULL` | Hook dla EPCIS 2.0 traceability |

Dodanie tych pól później = migration hell; koszt dodania teraz = ~0.

### GS1-first identifiers [R15]

- **GTIN** (produkt) — preferred zamiast własnego `sku`
- **SSCC** (pallet) — preferred zamiast własnego `pallet_code`
- **GLN** (location/partner) — preferred zamiast własnego `location_code`
- **GRAI** (reusable asset) — dla zwrotnej logistyki
- **GDTI** (document) — dla PO/ASN/invoice references

Internal ID może żyć obok, ale GS1 ID = paszport produktu dla retailer interop + traceability.

### Idempotent mutations [R14]

Wszystkie scanner-originated mutations (06-SCANNER) MUSZĄ akceptować client-generated `transaction_id` (UUID v7 preferred — time-ordered). Server zwraca deterministic response na replay.

---

## §11 — Cross-cutting Requirements

### i18n [R11] — UNIVERSAL od dnia 1
Minimum **pl, en, uk, ro** baseline (Apex realnie ma UA+RO workers). ICU MessageFormat. Locale-aware date/number parsing. RTL-ready structure. Nie string concat.

### Audit log
Append-only `audit_events` tabela; triggers na business tables + event-sourced integration z rule engine (ADR-029). Retention per tabela. Zgodność: SOC 2, GDPR, FDA 21 CFR Part 11 (gdy US klient), FSMA 204 (traceability records).

### Regulatory roadmap — first-class artifact
Proponowane utrzymanie w `_foundation/regulatory/` (Phase C task). Deadliny:

| Regulacja | Enforcement | Modules |
|---|---|---|
| FSMA 204 (USA) | 2028-07-20 | 01-NPD, 05-WAREHOUSE, 11-SHIPPING, 08-PRODUCTION |
| EUDR (EU) | 2026-12-30 | 01-NPD (BOM commodities), 11-SHIPPING, future Procurement |
| Peppol B2B Belgium | 2026-01-01 | 11-SHIPPING e-invoice |
| EU ViDA | 2030-07-01 | 11-SHIPPING, 10-FINANCE export |
| BRCGS Food Issue 10 | 2026 (post consultation) | 09-QUALITY, 03-TECHNICAL |
| EU FIC 1169/2011 + 2021/382 | Active | 01-NPD, 11-SHIPPING labelling |
| Polska KSeF | Opóźniony, kierunek pewny | 11-SHIPPING, 10-FINANCE |

Review kwartalny (FDA/KE zmieniają terminy).

### Out-of-scope Monopilot [R8 strip-down]

- **GL / AP / AR / Cash management** — zostaje D365 / Xero / Comarch
- **HR / Payroll** — osobna domena
- **CRM** — integracja z zewnętrznym
- **Custom dev per-client** — Monopilot = product-led schema-driven config, nie code-level customization
- **On-premise** — wyłącznie SaaS (z EU/US regional data planes)
- **Blockchain traceability** — GS1 Digital Link + EPCIS 2.0 wystarczą (MES-TRENDS-2026 §2)
- **Autonomous LLM agents executing MES actions** — Phase 4+, po 12-18 mies. production data + audit infra [R12]

### Build posture

- Nigdy DDL w-locie w request path (schema changes = jobs z approval)
- Testy zawsze z app-role connection (nigdy superuser)
- Index audit co release (query plans na hot paths)
- Schema drift detection daily job
- PR files cap ~18k tokenów; split jeśli większy

---

## §12 — ADRs (Active + Candidate)

### Active Phase 0 ADRs

| ADR | Title | Status |
|---|---|---|
| **ADR-028** | Schema-driven column definition | Active (foundation) |
| **ADR-029** | Rule engine DSL + workflow-as-data | Active (foundation) |
| **ADR-030** | Configurable department taxonomy | Active (foundation) |
| **ADR-031** | Schema variation per org (L1-L4 multi-tenant) | Active (foundation) |

### Candidate ADRs z Research (R1-R15) — do opisu w Phase B/C

| # | Title | Marker | Source § |
|---|---|---|---|
| R1 | Event-first via outbox pattern od MVP | [UNIVERSAL] | MES-TRENDS §1, §3, §6 |
| R2 | Postgres JSONB hybrid storage | [UNIVERSAL] | MES-TRENDS §4 |
| R3 | RLS default + LEAKPROOF SECURITY DEFINER wrappers | [UNIVERSAL] | MES-TRENDS §5 |
| R4 | Zod + json-schema-to-zod runtime | [UNIVERSAL] | MES-TRENDS §4 |
| R5 | PWA P1 + Capacitor P2 dla 06-SCANNER | [UNIVERSAL] | MES-TRENDS §7 |
| R6 | PostHog self-host feature flags | [UNIVERSAL] | MES-TRENDS §5 |
| R7 | EU data residency cluster default | [APEX-CONFIG]→[UNIVERSAL] | MES-TRENDS §5 |
| R8 | D365 sync: one-way pull + one-way push | [LEGACY-D365] | MES-TRENDS §3 |
| R9 | Strangler Fig v7 Excel migration (P2 principle) | [EVOLVING] | MES-TRENDS §3 |
| R10 | GS1 Digital Link + EPCIS 2.0 JSON-LD (nie blockchain) | [UNIVERSAL] | MES-TRENDS §2, §8 |
| R11 | i18n od dnia 1 (pl/en/uk/ro baseline) | [UNIVERSAL] | MES-TRENDS §7 |
| R12 | AI/ML warstwy L0/L1/L2 timeline | [UNIVERSAL] | MES-TRENDS §6 |
| R13 | Schema AI-ready + traceability-ready od dnia 1 | [UNIVERSAL] | MES-TRENDS §6, §8 |
| R14 | Idempotent scanner mutations (UUID v7 transaction_id) | [UNIVERSAL] | MES-TRENDS §7, §8 |
| R15 | GS1-first identifiers (GTIN/SSCC/GLN/GRAI) | [UNIVERSAL] | MES-TRENDS §8 |

### Pre-Phase-D ADRs (001-019) — DEFERRED REVIEW

Stare ADRs (ADR-001 LP / ADR-002 BOM Snapshot / ADR-003 Multi-Tenancy / ADR-004 GS1 / ADR-005 FIFO/FEFO / ADR-006 Scanner-First / ADR-007 WO State Machine / ADR-008 Audit Trail / ADR-009 Routing Costs / ADR-010 Product Procurement / ADR-011 Module Toggle / ADR-012 Role Permissions / ADR-013 RLS Pattern / ADR-015 Constants / ADR-016 CSV Parser / ADR-017 React.memo / ADR-018 API Errors / ADR-019 TO State Machine) **nie są zreviewane w Phase B.1**.

**Action:** Deep review w osobnej sesji (Phase C start preferably). Każdy ADR do oceny: **Active** / **Supersede przez ADR-028-031** / **Renumerować** / **Deprecate**. Szczególnie kolidują z nowym modelem schema-driven:
- ADR-002 (BOM Snapshot) — potencjalnie renumerować i re-align z JSONB storage
- ADR-003/013 (Multi-Tenancy RLS) — superseded by ADR-031
- ADR-006 (Scanner-First) — align with R5 (PWA P1)
- ADR-008 (Audit Trail) — align with R1 (outbox event-sourced)

Dodane do §13 open items.

---

## §13 — Success Criteria

### Architektoniczne (Phase B close criteria)

- [ ] 00-FOUNDATION PRD aligned z 6 principles + R1-R15 + ADR-028/029/030/031
- [ ] 01-NPD PRD covers full v7 equivalent (7 depts + workflow + cascade + Dashboard) + Brief import + D365 Builder + allergens multi-level cascade
- [ ] Marker discipline w 100% fragmentów PRD
- [ ] Cross-refs do reality docs (pld-v7-excel + brief-excels) w 100% fragmentów zawierających reality

### Funkcjonalne (MVP — post Phase C)

- [ ] 15 modułów rewriteowanych (Phase B + C complete)
- [ ] Schema-driven admin UI wizard działa (ADR-028)
- [ ] Rule engine DSL 4 obszary implementowane (ADR-029)
- [ ] Multi-tenant L1-L4 working w production (ADR-031 + R3)
- [ ] D365 adapter P1 operational (R8)
- [ ] 06-SCANNER-P1 PWA działa na Zebra TC53 + Honeywell CT45 (R5)
- [ ] Traceability forward+backward <30s (reality fidelity v7 + BRCGS <4h requirement)
- [ ] Outbox events emitowane dla każdej business mutacji (R1)

### Niefunkcjonalne

- [ ] Uptime ≥ 99.5% / 30 dni
- [ ] Page load P95 < 2s
- [ ] Scanner op < 30s (reality fidelity)
- [ ] RLS policy coverage 100% business tables
- [ ] DR documented + tested quarterly
- [ ] Tests run w app-role (nigdy superuser) w CI

### Compliance

- [ ] SOC 2 controls baseline implementowane
- [ ] GDPR right-to-erasure function działa
- [ ] EU FIC 1169/2011 + 2021/382 compliance (01-NPD + 11-SHIPPING)
- [ ] BRCGS v9/v10 audit-ready (09-QUALITY)
- [ ] Schema ready dla FSMA 204 (2028), EUDR (2026-12-30), Peppol (2026-01-01)

---

## §14 — Open Items (carry-forward)

### Z Phase D EVOLVING §19 (deferred, research nie zamyka)

1. **Brief allergens lokalizacja** — rescan brief pełny schema (C21-C37) w Phase B.2 start
2. **Multi-component Volume w brief 2** — clarify z user (sample miał empty — typowe czy pomyłka?)
3. **Brief → Multi-FA split semantyka** — gdy brief 2 multi-component staje się multiple FAs vs 1 FA z N components w ProdDetail? Phase B.2
4. **Hard-lock semantyka ADR-028** — "tylko developer" vs "tylko superadmin" — Phase B.2 / C1
5. **Rule engine versioning ADR-029** — v1 active vs v2 draft — Phase D+ implementation
6. **Upgrade strategy L2/L3/L4 opt-in granularity ADR-031** — research §5.4 daje framework; konkretna polityka user call Phase B/C
7. **Commercial upstream od briefu** (pkt 13 deferred) — Commercial vs NPD-internal brief source — future
8. **MRP split** — nieaktualne (pozostaje 1 dept)

### Z Research §10.3 (open research items)

9. **Storage partition strategy** — partition by tenant_id od MVP vs gdy >10k tenants? Rekomendacja wstępna: start bez partitioningu, monitor EXPLAIN
10. **Event bus MVP consumer** — Azure Service Bus (D365 ekosystem fit) vs SQS/RabbitMQ/NATS? Rekomendacja wstępna: Azure Service Bus. Weryfikacja Phase C1
11. **LLM platform** — Claude API direct vs Azure OpenAI vs Modal dla custom. Rekomendacja wstępna: Claude API direct + Modal dla custom models
12. **Peppol access point vendor** — Storecove (developer-friendly) vs Pagero (mid-market) vs Tradeshift (enterprise). Deferred do Phase C4 (11-SHIPPING)

### Nowe (z Phase B.1 writeup)

13. **Pre-Phase-D ADRs deep review (001-019)** — osobna sesja (Phase C start preferably). Każdy ADR do oceny: Active / Superseded / Renumber / Deprecate
14. **Regulatory roadmap artifact** — utworzenie `_foundation/regulatory/` z deadlinami + review process (Phase C1)
15. **Dry-run scope rule engine** — complete replay vs sample — Phase C1 (02-SETTINGS)
16. **Site vs Tenant relationship** — Apex UK + EDGE = 1 tenant 2 sites vs 2 tenants? ADR-030 + ADR-031 intersection — Phase B.2 decision needed dla NPD dept taxonomy

---

## §15 — References

### Phase D primary

- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — 6 principles + 23 decisions + 15 modules renumbering

### Research primary

- [`_foundation/research/MES-TRENDS-2026.md`](_foundation/research/MES-TRENDS-2026.md) — 810 lines, 8 sections, R1-R15 candidate ADRs, regulatory roadmap, per-module rollup

### Phase 0 foundation

- [`_foundation/META-MODEL.md`](_foundation/META-MODEL.md) — 8 sekcji, schema-driven vs code-driven contract
- [`_foundation/decisions/ADR-028-schema-driven-column-definition.md`](_foundation/decisions/ADR-028-schema-driven-column-definition.md)
- [`_foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md`](_foundation/decisions/ADR-029-rule-engine-dsl-and-workflow-as-data.md)
- [`_foundation/decisions/ADR-030-configurable-department-taxonomy.md`](_foundation/decisions/ADR-030-configurable-department-taxonomy.md)
- [`_foundation/decisions/ADR-031-schema-variation-per-org.md`](_foundation/decisions/ADR-031-schema-variation-per-org.md)
- [`_foundation/patterns/REALITY-SYNC.md`](_foundation/patterns/REALITY-SYNC.md) — two-session sync pattern
- [`_foundation/skills/SKILL-MAP.yaml`](_foundation/skills/SKILL-MAP.yaml) — 39 active skills registry
- [`_foundation/skills/REGISTRY.yaml`](_foundation/skills/REGISTRY.yaml) — v2.0.0, 0 drift

### Phase A reality sources

- [`_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md`](_meta/reality-sources/pld-v7-excel/PROCESS-OVERVIEW.md)
- [`_meta/reality-sources/pld-v7-excel/DEPARTMENTS.md`](_meta/reality-sources/pld-v7-excel/DEPARTMENTS.md)
- [`_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md`](_meta/reality-sources/pld-v7-excel/MAIN-TABLE-SCHEMA.md) — 69 cols baseline
- [`_meta/reality-sources/pld-v7-excel/CASCADING-RULES.md`](_meta/reality-sources/pld-v7-excel/CASCADING-RULES.md)
- [`_meta/reality-sources/pld-v7-excel/WORKFLOW-RULES.md`](_meta/reality-sources/pld-v7-excel/WORKFLOW-RULES.md)
- [`_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md`](_meta/reality-sources/pld-v7-excel/REFERENCE-TABLES.md)
- [`_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md`](_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md)
- [`_meta/reality-sources/pld-v7-excel/EVOLVING.md`](_meta/reality-sources/pld-v7-excel/EVOLVING.md) — 15 obszarów w zmianach + priority matrix
- [`_meta/reality-sources/brief-excels/README.md`](_meta/reality-sources/brief-excels/README.md)
- [`_meta/reality-sources/brief-excels/BRIEF-FLOW.md`](_meta/reality-sources/brief-excels/BRIEF-FLOW.md)

### HANDOFFs chain (chronological)

- [`_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md`](_meta/handoffs/2026-04-17-phase-0-close-and-phase-a-bootstrap.md)
- [`_meta/handoffs/2026-04-17-phase-a-session-1-close.md`](_meta/handoffs/2026-04-17-phase-a-session-1-close.md)
- [`_meta/handoffs/2026-04-17-phase-a-session-2-close.md`](_meta/handoffs/2026-04-17-phase-a-session-2-close.md)
- [`_meta/handoffs/2026-04-17-phase-a-close.md`](_meta/handoffs/2026-04-17-phase-a-close.md)
- [`_meta/handoffs/2026-04-18-phase-d-close.md`](_meta/handoffs/2026-04-18-phase-d-close.md)
- [`_meta/handoffs/2026-04-18-research-close.md`](_meta/handoffs/2026-04-18-research-close.md) — aktywny przed Phase B.1

### Design artifacts

- [`MONOPILOT-SITEMAP.html`](MONOPILOT-SITEMAP.html) — UX reference
- [`SCANNER-PROTOTYPE (2).html`](<SCANNER-PROTOTYPE (2).html>) — scanner UX prototype
- [`SCANNER-SCREEN-INDEX (1).md`](<SCANNER-SCREEN-INDEX (1).md>) — scanner screens index
- [`_meta/specs/2026-04-17-monopilot-migration-design.md`](_meta/specs/2026-04-17-monopilot-migration-design.md)
- [`_meta/plans/2026-04-17-phase-0-meta-spec.md`](_meta/plans/2026-04-17-phase-0-meta-spec.md)

### Module PRDs (Phase D renumbering — siblings)

- [`01-NPD-PRD.md`](01-NPD-PRD.md) — Phase B.2 primary (rewrite pending)
- [`02-SETTINGS-PRD.md`](02-SETTINGS-PRD.md) — Phase C1 (pre-Phase-D, pending rewrite)
- [`03-TECHNICAL-PRD.md`](03-TECHNICAL-PRD.md) — Phase C1
- [`04-PLANNING-BASIC-PRD.md`](04-PLANNING-BASIC-PRD.md) — Phase C2
- [`05-WAREHOUSE-PRD.md`](05-WAREHOUSE-PRD.md) — Phase C2
- [`06-SCANNER-P1-PRD.md`](06-SCANNER-P1-PRD.md) — Phase C2
- `07-PLANNING-EXT-PRD.md` — Phase C3 (new file, to be created)
- [`08-PRODUCTION-PRD.md`](08-PRODUCTION-PRD.md) — Phase C3
- [`09-QUALITY-PRD.md`](09-QUALITY-PRD.md) — Phase C4
- [`10-FINANCE-PRD.md`](10-FINANCE-PRD.md) — Phase C4
- [`11-SHIPPING-PRD.md`](11-SHIPPING-PRD.md) — Phase C4
- [`12-REPORTING-PRD.md`](12-REPORTING-PRD.md) — Phase C5
- [`13-MAINTENANCE-PRD.md`](13-MAINTENANCE-PRD.md) — Phase C5
- [`14-MULTI-SITE-PRD.md`](14-MULTI-SITE-PRD.md) — Phase C5
- `15-OEE-PRD.md` — Phase C5 (new file, to be created)

### Archived

- [`_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md`](_archive/pre-phase-d-prds/13-INTEGRATIONS-PRD.md) — superseded by INTEGRATIONS multi-stage distribution C1-C5
- [`_archive/new-doc-2026-02-16/`](_archive/new-doc-2026-02-16/) — pre-Phase-0 documentation (2912 files, cherry-pick only)

### External standards & regulations

- EU Regulation 1169/2011 — https://eur-lex.europa.eu/eli/reg/2011/1169/oj/eng
- EU FSMA 204 — https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods
- EUDR — https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en
- GS1 Digital Link — https://www.gs1.org/standards/gs1-digital-link
- EPCIS 2.0 — https://www.gs1.org/standards/epcis
- BRCGS Food Issue 9/10 — https://www.brcgs.com/
- ISA-95 (ANSI/ISA-95.00.01-2025) — https://www.isa.org/standards-and-publications/isa-standards/isa-95
- GS1 Application Identifiers — https://ref.gs1.org/ai/

---

## Changelog

- **v3.0 (2026-04-18)** — Phase B.1 full rewrite. Phase D renumbering (01-NPD primary, 02-SETTINGS, etc.), 6 principles embedded, marker discipline, R1-R15 research decisions, reference to MES-TRENDS-2026.md + MONOPILOT-V2-ARCHITECTURE.md + META-MODEL + ADR-028-031. Wycięte: stare metryki biznesowe, pre-Phase-D numbering, per-module requirements, Supabase lock-in language. Pre-Phase-D ADRs (001-019) deep review deferred do osobnej sesji (§14 open item #13). Old PRD v2.3 archived w git history.

- **v2.3 (2026-02-18)** — pre-Phase-D last version. 16 modułów M00-M15, 77 requirements, 18 ADRs (001-019). Stare numerowanie (M01=Settings, M09=NPD).

---

*PRD 00-FOUNDATION v3.0 — Phase B.1 rewrite. Next: Phase B.2 (01-NPD primary).*
