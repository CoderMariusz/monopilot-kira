---
title: PRD 00-FOUNDATION — Monopilot MES
version: 4.2
date: 2026-04-30
phase: Phase B.1 continued (Phase D renumbered + Research R1-R15 + Manufacturing Operations pattern + UX gap-backlog amendments)
status: Draft v4.2 — UX→PRD gap-backlog F-U1..F-U5 + F-A1..F-A4 applied
supersedes: v4.1 (2026-04-30, Phase E-0 prep clarifications)
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

| Persona | Modules | Pillar |
|---|---|---|
| Dyrektor zakładu | Wszystkie (read-only), 12-REPORTING | — |
| **Org Admin** | 02-SETTINGS users/roles/security/SSO/SCIM/IP allowlist/audit | **ACCESS** |
| **Schema Admin** | 02-SETTINGS schema-driven column wizard, rule engine wizard, reference data, feature flags | **ADMIN** |
| Maintenance Tech | 13-MAINTENANCE, 02-SETTINGS (maszyny) | — |
| Finance Analyst | 10-FINANCE (cost roll, variance); GL/AP/AR w D365/Xero | — |
| Site Manager (multi-site) | 14-MULTI-SITE, 12-REPORTING filtered | — |

> **Administrator split [F-U4 per gap-backlog 2026-04-30, UNIVERSAL]:** the prior single "Administrator" persona is split into **Org Admin** (ACCESS pillar — identity, authentication, authorization, session policy, audit visibility) and **Schema Admin** (ADMIN pillar — data model, business rules, reference data, feature flags) to satisfy **SOC 2 CC6.3 separation-of-duties**. The two personas are mutually exclusive at the role-grant level by default (an Org Admin cannot grant themselves Schema Admin without a second Org Admin's approval in `org_security_policies.dual_control_required=true` mode). UI surfaces partition accordingly: ACCESS-pillar screens (Users / Roles / Security / SSO / SCIM / IP Allowlist / Audit) live under `/settings/access/*` and require the `org.access.admin` system role; ADMIN-pillar screens (Schema / Rules / Reference Data / Feature Flags / Manufacturing Operations) live under `/settings/admin/*` and require the `org.schema.admin` system role.

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

> **§4.2-AMENDMENT (2026-04-22, per ADR-032):** build order row 2 dependency "Foundation infra w minimum scope" zastępujemy explicit Phase E-0 = `00-FOUNDATION-impl-a..i` (atomic task spec w `_meta/specs/00-FOUNDATION-impl-spec.md`; tasks listed in `_meta/plans/2026-04-25-foundation-tasks.md`). Row 3 prerequisite "01-NPD done" zmieniamy na **"02-SETTINGS-a minimum carveout done"** (orgs/users + RBAC + 7 ref tables + module toggles + i18n scaffold + org security baseline) z parallel Track A (01-NPD-a..e) / Track B (02-SETTINGS-b..e). Pełna revised tabela: patrz `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` §3.2. Foundation modules `00-FOUNDATION-impl-d/e/f/g/h` (DB+RLS, outbox, RBAC primitives, audit, i18n) MUST complete before 01-NPD-a can start.

> **§4.2-AMENDMENT addendum (2026-04-30) [F-A4 per gap-backlog 2026-04-30]:** the Phase E-0 Foundation set is extended with **`00-FOUNDATION-impl-j` (UI primitives + design-token package)** covering `packages/ui` bootstrap, the 5 modal/form primitives, the 5 tuning primitives, the 10 MODAL-SCHEMA pattern templates, design tokens, Storybook 8 + axe-core CI, and the `assertModalA11y()` helper (per §5.y / F-A3). Atomic tasks: `T-00j-001..007` in `_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md` §00-FOUNDATION ADD list. **Critical-path:** `impl-j` MUST complete **in parallel with `impl-d/e/f/g/h`** and **before any 01-NPD-a or 02-SETTINGS T3-ui task starts** (12 downstream modules consume the primitives — letting any T3-ui task ship first guarantees drift from MODAL-SCHEMA.md and forces re-work). The build sequence in `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` §3.2 is updated to add `impl-j` to the Foundation set; row 3 prerequisite becomes **"02-SETTINGS-a minimum carveout done AND `impl-j` complete"**.

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

> **§4.3-AMENDMENT — Table Naming Decision (2026-04-30, per ADR-034 finalisation):** the physical table for the NPD finished-article aggregate is **`product`** (singular, generic). This is **Option B** (chosen over Option A "keep `fa` as physical name" and Option C "dual-table `fa` + `product`"). Rationale: (1) generic naming aligns with multi-industry generalisation in ADR-034 (Bakery / Pharma / FMCG / meat all use the same physical schema), (2) avoids confusion with the `fa.*` event aggregate which is a domain-language label, not a table reference, (3) gives a clean target name for D365 item-master sync long-term. **Backward-compat for D365 Builder + legacy SQL:** create a SQL view `CREATE VIEW fa AS SELECT * FROM product;` (read-only, Phase E-0 → C1 deprecation window) so existing `Builder_FA<code>.xlsx` queries and any external integration referring to `fa` continue to resolve. The view is dropped at end of Phase C1 once D365 adapter migration completes. **Event aggregate prefix stays `fa.*`** (decoupled from storage — see §10 + `_meta/specs/event-naming-convention.md`). Acceptance-criteria impact: 01-NPD-a DDL emits `CREATE TABLE product (...)` + `CREATE VIEW fa AS SELECT * FROM product;`; 01-NPD §15 success criteria updated to reference `product` table for RLS coverage with `fa` listed as compat view.

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

### §5.x — Auth & Identity Stack [UNIVERSAL] [F-A1 per gap-backlog 2026-04-30]

> **Source for new requirement:** UX evidence in `design/Monopilot Design System/settings/access-screens.jsx:162-244` (TOTP/SMS/WebAuthn checkbox row, SAML Entra ID connector, SCIM token panel, password policy strong/standard/custom, idle timeout, max session, IP allowlist, audit log preview). Prior PRD §5 mentioned Supabase only as a Postgres host; the auth subsystem was invisible. **F-U1 update + F-A1 addition** make it explicit and lock 6 OSS libraries.

**Primary IdP:** **GoTrue / Supabase Auth** as the canonical first-party identity provider for all tenants on the EU and US clusters. Email+password, magic-link, OAuth social (deferred), and admin-issued invitations all flow through GoTrue. Sessions are JWT-based; the access token TTL is **15 minutes** with rotating refresh tokens; refresh enforces an **idle timeout of 60 minutes** (org-tunable per §8.x) and an **absolute session max of 8 hours** (org-tunable). Magic-link invitation tokens are signed, single-use, and carry a **7-day TTL** (codified, not Supabase-default).

**Federation (SAML 2.0):** **`@boxyhq/saml-jackson`** as the SAML SP. Each tenant connects an external IdP (Microsoft Entra ID baseline; Okta / Google Workspace / generic SAML 2.0 supported) via metadata URL or x509-cert upload. JIT user provisioning is per-tenant configurable (see §8.x `tenant_idp_config`). Routes: `/api/auth/saml/{login,callback,logout,metadata}`.

**Provisioning (SCIM 2.0):** SCIM `/Users` and `/Groups` endpoints with bearer-token auth scoped to a single tenant; tokens stored as **argon2id** hashes in `scim_tokens`. Soft-delete on `active=false`. Group sync maps to system roles per tenant policy.

**MFA:** **TOTP** primary via **`otplib`** (RFC 6238, 30-s window, 6-digit), with recovery codes hashed argon2id and one-time use. **WebAuthn** secondary via **`@simplewebauthn/server`** (deferred behaviour to Phase 3 per D7 — UI checkbox shown disabled with tooltip "Coming Phase 3"). SMS as fallback only (rate-limited). MFA enrolment is enforceable per-role via `org_security_policies.mfa_required_for_roles[]`.

**Verify-PIN / step-up auth:** secondary short-lived PINs for destructive admin actions are stored as **argon2id** hashes (memory=64 MiB, t=3, p=1) — never plaintext, never reversible. PIN entry is rate-limited identically to login (see lockout policy).

**Six OSS libraries locked:** `@supabase/supabase-js` (auth client), `@supabase/auth-helpers-nextjs`, `@boxyhq/saml-jackson` (SAML SP), `otplib` (TOTP), `@simplewebauthn/server` (WebAuthn), `argon2` (PIN/recovery-code hashing). Versions pinned in `apps/web/package.json` and tracked by Renovate.

### §5.y — Shared UI Primitives `@monopilot/ui` [UNIVERSAL] [F-A3 per gap-backlog 2026-04-30]

> **Source for new requirement:** UX evidence across all module prototypes (10 distinct modal patterns reused; 5 tuning primitives for run-strip / empty-state / counted-tabs / compact-activity / dry-run); `_shared/MODAL-SCHEMA.md` (225 lines) is the canonical contract but is **never referenced from any PRD or plan** — every module re-invents modal wiring and drifts. F-A3 makes the contract first-class.

**Workspace package:** `packages/ui` — published as `@monopilot/ui` inside the monorepo (npm workspace, not separate registry). Single source of truth for cross-module UI primitives; **direct imports from `@radix-ui/react-dialog` outside `packages/ui` are blocked** by ESLint `no-restricted-imports`.

**5 modal/form primitives:**
1. `<Modal/>` — Radix Dialog wrapper, size tokens (`sm` / `md` / `lg` / `xl`), dismissible flag, ESC-to-close, focus-trap, return-focus on close.
2. `<Stepper/>` — multi-step wizard chrome with Back / Next / Jump-to-step / Restart, persisted step state, progress indicator.
3. `<Field/>` — RHF Controller + Zod resolver wrapper with label / hint / error / required-mark / inline-validation states.
4. `<ReasonInput/>` — textarea + character counter + minLength enforcement (default 10 chars, configurable per modal); used by all destructive-with-reason patterns.
5. `<Summary/>` — read-only key/value summary with optional diff highlighting; consumed by Confirm patterns and Preview-compare pattern.

**5 tuning primitives** (ported from prototypes; Phase B.2 settings tuning audit): `<RunStrip/>`, `<EmptyState/>`, `<TabsCounted/>`, `<CompactActivity/>`, `<DryRunButton/>` plus `deriveRunHistory()` helper.

**Canonical modal contract:** `_shared/MODAL-SCHEMA.md` is **normative** and lists 10 patterns: Wizard (P1), SimpleForm (P2), DualPath (P3), Picker (P4), Override-with-reason (P5), Simple (P6), Async-with-states (P7), Confirm-non-destructive (P8 weak / P9 ack), Confirm-destructive-type-to-confirm (P8), Confirm-destructive-with-reason (P9), Preview-compare (P10). All settings/NPD/production modals MUST use a shared primitive and one of the 10 patterns.

**Quality gates:** Storybook 8 with **≥21 stories** (11 primitives × 1 + 10 pattern templates) + **axe-core CI** running on every PR; the `assertModalA11y()` RTL helper from `packages/ui/test` is required in every modal's test file. Design tokens live in `packages/ui/tokens.css` with a Tailwind theme map and a per-tenant override hook (Phase C5 multi-tenant theming).

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

### §8.x — Per-tenant IdP Mapping [UNIVERSAL] [F-A2 per gap-backlog 2026-04-30]

> **Source for new requirement:** UX `SecurityScreen` exposes an "Enforce SSO" toggle that disables password login for non-admins; SCIM provisions users from Entra ID directly into a tenant. The PRD previously treated `tenant_id` as the only multi-tenancy primitive and never specced the tenant→IdP mapping; F-U2 + F-A2 close that gap.

**Table `tenant_idp_config`** (one row per tenant, primary identity-policy record):

```sql
CREATE TABLE tenant_idp_config (
  tenant_id                   UUID PRIMARY KEY REFERENCES organizations(id),
  provider_type               TEXT NOT NULL
                              CHECK (provider_type IN ('saml','oidc','password','magic')),
  provider_label              TEXT,                       -- "Entra ID — Apex UK"
  metadata_url                TEXT,                       -- SAML/OIDC metadata document
  entity_id                   TEXT,                       -- SAML SP/IdP entity
  x509_cert                   TEXT,                       -- SAML signing cert (PEM)
  jit_provisioning            BOOLEAN NOT NULL DEFAULT false,
  scim_token_hash             TEXT,                       -- argon2id of the SCIM bearer token
  scim_token_last_four        TEXT,                       -- display-only, never the secret
  enforce_for_non_admins      BOOLEAN NOT NULL DEFAULT false,
  -- per-tenant session/MFA overrides (override §5.x defaults)
  idle_timeout_min            INT NOT NULL DEFAULT 60,
  session_max_h               INT NOT NULL DEFAULT 8,
  mfa_required                BOOLEAN NOT NULL DEFAULT true,
  mfa_required_for_roles      TEXT[] DEFAULT ARRAY['org.access.admin','org.schema.admin'],
  mfa_allowed_methods         TEXT[] DEFAULT ARRAY['totp'],   -- 'totp' | 'sms' | 'webauthn'
  password_complexity         TEXT NOT NULL DEFAULT 'strong', -- 'strong' | 'standard' | 'custom'
  password_expiry_days        INT,                        -- NULL = no expiry (NIST SP 800-63B default)
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Behaviour:**
- `provider_type='saml'` + `enforce_for_non_admins=true` → password login disabled for everyone except `org.access.admin` (break-glass account).
- `jit_provisioning=true` + first SAML assertion for an unknown email → user row created in `users` and assigned the default role per `org_default_role`.
- SCIM bearer requests authenticate via `scim_token_hash` argon2id-verify; on success, the request bypasses the normal session middleware and runs scoped to `tenant_id` + the `org.scim.write` system role.
- Per-tenant overrides stack on top of §5.x defaults; an org may only relax `idle_timeout_min` upward in `'standard'` complexity mode and may not exceed cluster-wide hard limits.

**UI:** the editor lives in **02-SETTINGS ACCESS pillar** (Org Admin only); see 02-SETTINGS-PRD §14.5 (SSO) / §14.6 (SCIM) / §14.7 (IP Allowlist).

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

## §9.1 — Manufacturing Operations (Process) Configuration Pattern [ADR-028 extension]

### Pattern Overview

Manufacturing operations (processes) use a configurable suffix-based naming scheme instead of hardcoded Process_A/B/C/D naming. This aligns with **P1 (Easy extension contract)** and **ADR-028 (schema-driven column definition)** by allowing per-tenant, per-industry process configuration through metadata lookup rather than code-level constants.

**Generic physical columns:** `manufacturing_operation_1`, `manufacturing_operation_2`, `manufacturing_operation_3`, `manufacturing_operation_4`

**Configuration source:** `Reference.ManufacturingOperations` table (operation_name → process_suffix mapping, per tenant)

**Dynamic suffix assignment:** Tenant-scoped and industry-scoped via seed data

**Examples:**

Bakery scenario:
- `manufacturing_operation_1 = "Mix"` → lookup Reference.ManufacturingOperations → retrieve `process_suffix = "MX"`
- `intermediate_code_p1` generated as: `"WIP-MX-0000001"`

Pharmacy scenario:
- `manufacturing_operation_1 = "Synthesis"` → lookup → retrieve `process_suffix = "SY"`
- `intermediate_code_p1` generated as: `"BATCH-SY-0000001"`

### Reference.ManufacturingOperations Table [UNIVERSAL pattern, ORG-CONFIG values]

**Table structure [UNIVERSAL]:**

```sql
CREATE TABLE "Reference.ManufacturingOperations" (
    id              UUID PRIMARY KEY,
    tenant_id       UUID NOT NULL,
    operation_name  TEXT NOT NULL,         -- "Mix", "Knead", "Bake", "Synthesis", "Drying", etc.
    process_suffix  TEXT NOT NULL,         -- "MX", "KN", "BK", "SY", "DR" (unique per tenant)
    description     TEXT,
    operation_seq   INT,                   -- Display/default order (1, 2, 3, 4, ...)
    industry_code   TEXT,                  -- 'bakery' | 'pharma' | 'fmcg' (seed categorization)
    is_active       BOOLEAN DEFAULT true,
    marker          TEXT NOT NULL,         -- 'ORG-CONFIG' (values differ per tenant/industry)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_manufacturing_operations_tenant_suffix 
  ON "Reference.ManufacturingOperations" (tenant_id, process_suffix);
```

**Marker distinction:**
- `[UNIVERSAL]`: Table structure, configuration concept, cascade logic, constraint enforcement
- `[ORG-CONFIG]`: `operation_name`, `process_suffix` values (differ per tenant and industry)

### Intermediate Code Generation Formula

**Generic pattern:**
```
intermediate_code_final = <prefix>-<process_suffix>-<sequence_number>
```

**Examples:**

Bakery (Reference.CodePrefixes[intermediate].prefix = "WIP"):
- `WIP-MX-0000001` (Mix operation, seq 1)
- `WIP-BK-0000002` (Bake operation, seq 2)

Pharmacy (Reference.CodePrefixes[intermediate].prefix = "BATCH"):
- `BATCH-SY-0000001` (Synthesis operation, seq 1)
- `BATCH-DR-0000004` (Drying operation, seq 4)

FMCG (Reference.CodePrefixes[intermediate].prefix = "SKU"):
- `SKU-MX-0000001` (Mix operation, seq 1)
- `SKU-FL-0000002` (Fill operation, seq 2)

The prefix is retrieved from `Reference.CodePrefixes` (existing table, [UNIVERSAL] structure with [ORG-CONFIG] values); the suffix is retrieved from `Reference.ManufacturingOperations` per-tenant lookup; the sequence number is auto-incremented per manufacturing operation per lots/work orders.

### Cascading Rule Integration — Chain 2 (Manufacturing_Operation_N → Intermediate_Code_P*)

**Rule type:** Cascading (ADR-029, [UNIVERSAL] logic with [ORG-CONFIG] suffix values)

**Trigger:** When `manufacturing_operation_1`, `manufacturing_operation_2`, `manufacturing_operation_3`, or `manufacturing_operation_4` changes (in 01-NPD module or upon 08-PRODUCTION work order initialization)

**Flow:**
1. Look up `operation_name` (e.g., "Mix") in `Reference.ManufacturingOperations` for the current tenant
2. Retrieve `process_suffix` (e.g., "MX")
3. Generate `intermediate_code_pN` = `<intermediate_prefix>-<process_suffix>-<next_sequence>`
4. Emit `fa.intermediate_code_changed` event (outbox pattern, [R1])

**Example DSL snippet (ADR-029 format):**

```json
{
  "rule_id": "manufacturing_operation_to_intermediate_code_cascade",
  "rule_type": "cascading",
  "triggers": [
    "fa.manufacturing_operation_1.changed",
    "fa.manufacturing_operation_2.changed",
    "fa.manufacturing_operation_3.changed",
    "fa.manufacturing_operation_4.changed"
  ],
  "actions": [
    {
      "lookup": "Reference.ManufacturingOperations",
      "on_field": "operation_name",
      "retrieve_field": "process_suffix",
      "assign_to": "intermediate_code_pN",
      "format": "{prefix}-{process_suffix}-{sequence}"
    },
    {
      "emit_event": "fa.intermediate_code_changed",
      "payload_fields": ["manufacturing_operation_N", "intermediate_code_pN", "process_suffix"]
    }
  ]
}
```

This rule is **[UNIVERSAL]** in logic (lookup + cascade structure) but **[ORG-CONFIG]** in suffix values (each tenant defines their own operation_name→process_suffix mappings).

### Template Application

Templates reference `operation_name` values (not hardcoded positions):

**Example template: "Mix-Knead-Proof-Bake" (Bakery [APEX-CONFIG] scenario)**

```
Template definition:
  operation_1: "Mix"
  operation_2: "Knead"
  operation_3: "Proof"
  operation_4: "Bake"
```

**On apply to FA (Final Assembly):**
1. `manufacturing_operation_1` ← "Mix" → lookup "Mix" in Reference.ManufacturingOperations → `process_suffix` = "MX" → `intermediate_code_p1` = "WIP-MX-..."
2. `manufacturing_operation_2` ← "Knead" → lookup → `process_suffix` = "KN" → `intermediate_code_p2` = "WIP-KN-..."
3. `manufacturing_operation_3` ← "Proof" → lookup → `process_suffix` = "PR" → `intermediate_code_p3` = "WIP-PR-..."
4. `manufacturing_operation_4` ← "Bake" → lookup → `process_suffix` = "BK" → `intermediate_code_p4` = "WIP-BK-..."

Cascade rule fires for each operation_N assignment, emitting intermediate_code_pN updates + events.

### Industry Seed Data [ORG-CONFIG]

**Bakery (Reference.ManufacturingOperations seed for industry_code='bakery')**

```json
[
  {
    "operation_name": "Mix",
    "process_suffix": "MX",
    "operation_seq": 1,
    "industry_code": "bakery",
    "description": "Dry ingredient mixing"
  },
  {
    "operation_name": "Knead",
    "process_suffix": "KN",
    "operation_seq": 2,
    "industry_code": "bakery",
    "description": "Dough kneading"
  },
  {
    "operation_name": "Proof",
    "process_suffix": "PR",
    "operation_seq": 3,
    "industry_code": "bakery",
    "description": "Fermentation/proofing"
  },
  {
    "operation_name": "Bake",
    "process_suffix": "BK",
    "operation_seq": 4,
    "industry_code": "bakery",
    "description": "Oven baking"
  }
]
```

**Pharmacy (Reference.ManufacturingOperations seed for industry_code='pharma')**

```json
[
  {
    "operation_name": "Synthesis",
    "process_suffix": "SY",
    "operation_seq": 1,
    "industry_code": "pharma",
    "description": "Chemical synthesis"
  },
  {
    "operation_name": "Separation",
    "process_suffix": "SE",
    "operation_seq": 2,
    "industry_code": "pharma",
    "description": "Chromatography/separation"
  },
  {
    "operation_name": "Crystallization",
    "process_suffix": "CZ",
    "operation_seq": 3,
    "industry_code": "pharma",
    "description": "Crystal formation"
  },
  {
    "operation_name": "Drying",
    "process_suffix": "DR",
    "operation_seq": 4,
    "industry_code": "pharma",
    "description": "Moisture removal"
  }
]
```

**FMCG (Reference.ManufacturingOperations seed for industry_code='fmcg')**

```json
[
  {
    "operation_name": "Mix",
    "process_suffix": "MX",
    "operation_seq": 1,
    "industry_code": "fmcg",
    "description": "Bulk ingredient mixing"
  },
  {
    "operation_name": "Fill",
    "process_suffix": "FL",
    "operation_seq": 2,
    "industry_code": "fmcg",
    "description": "Container filling"
  },
  {
    "operation_name": "Seal",
    "process_suffix": "SL",
    "operation_seq": 3,
    "industry_code": "fmcg",
    "description": "Lid/seal application"
  },
  {
    "operation_name": "Label",
    "process_suffix": "LB",
    "operation_seq": 4,
    "industry_code": "fmcg",
    "description": "Label placement"
  }
]
```

Seed data is applied **per new tenant** (Phase B.2 or Phase C.1 tenant onboarding flow), based on tenant's selected `industry_code`. Post-seed, tenant admins can edit operations via 02-SETTINGS Admin UI (Phase C.1).

### Phase Implementation

**Phase B.2 (01-NPD cascade engine):**
- Implement lookup from manufacturing_operation_N → Reference.ManufacturingOperations.process_suffix (seed hardcoded per industry initially)
- Integrate with Chain 2 cascading rule engine (ADR-029)
- Generate intermediate_code_pN with dynamic suffix
- Emit outbox events (R1, ADR-029)

**Phase C1 (02-SETTINGS Admin UI):**
- Add Manufacturing Operations editor in 02-SETTINGS schema-driven UI
- CRUD operations: add/edit/delete/reorder operations per tenant
- Validation: process_suffix uniqueness per tenant, alphanumeric 2-4 chars
- Soft-delete (is_active flag) for backward compatibility
- Dry-run capability (ADR-029 wizard): test suffix changes on sample FAs

**Phase C+:**
- Allow per-tenant customization (rename operation_name, adjust suffix, add new operations)
- Industry-specific variations (e.g., Bakery subtype "Artisanal" vs "Industrial" with different operations)
- Template library per operation set (Phase B.2 / C.1)

### Phase B.2 Migration (Existing Tenants)

**For tenants with existing hardcoded Process_1..4 (from v7 or earlier phases):**

1. **Identify existing data:** Query `product` table for non-null `manufacturing_operation_1..4` values that currently hold "Process_A", "Process_B", "Process_C", "Process_D" (letter-based placeholders).

2. **Seed generic operations:** Insert Reference.ManufacturingOperations rows with industry_code='generic':
   ```sql
   INSERT INTO "Reference.ManufacturingOperations" 
     (tenant_id, operation_name, process_suffix, operation_seq, industry_code, is_active, marker)
   VALUES 
     (tenant_id, 'Process_A', 'PA', 1, 'generic', true, 'ORG-CONFIG'),
     (tenant_id, 'Process_B', 'PB', 2, 'generic', true, 'ORG-CONFIG'),
     (tenant_id, 'Process_C', 'PC', 3, 'generic', true, 'ORG-CONFIG'),
     (tenant_id, 'Process_D', 'PD', 4, 'generic', true, 'ORG-CONFIG');
   ```

3. **Backfill existing FAs:** For each FA with non-null manufacturing_operation_N:
   - Copy as-is (Process_A, Process_B, etc. remain valid operation_names)
   - Cascade engine will look up process_suffix ("PA", "PB", "PC", "PD") at runtime
   - Existing intermediate_code_pN values are NOT regenerated (backward compat)

4. **Regenerate intermediate codes (optional, Phase C1+):** Tenant admin can trigger "Regenerate intermediate codes" wizard:
   - Preview mode: show sample FAs with old vs new codes (e.g., PR-A-001 → WIP-PA-000001)
   - User confirms scope (all FAs, date range, specific subset)
   - Background job updates intermediate_code_pN columns for selected FAs
   - Audit log tracks regeneration (user, timestamp, count of updated FAs)

5. **Post-migration:** Tenant can optionally upgrade to industry-specific operations (Bakery/Pharmacy/FMCG) or custom operations via Phase C1 admin UI (export/import migrations available for bulk rename).

### Related Architecture Decisions

- **ADR-028**: Generic column definition in Reference.DeptColumns; extends to Reference.ManufacturingOperations
- **ADR-029**: Rule engine DSL; Chain 2 cascade uses configurable suffix lookup
- **ADR-030**: Configurable department taxonomy; manufacturing operations are cross-dept (01-NPD + 08-PRODUCTION consumers)
- **P1**: Easy extension contract — operations configurable via UI, not hardcoded

### Validation & Constraints

- `process_suffix` must be **unique per tenant** (UNIQUE index enforced, ADR-028 constraint pattern)
- `process_suffix` must be **2-4 alphanumeric characters** (regex validation in Admin UI + DB check constraint)
- `operation_name` must be **non-empty** and unique within a tenant (optional: uniqueness enforced via UNIQUE index)
- **Deletion safeguard**: Cannot delete an operation if referenced by:
  - Active Template definitions (reference count check)
  - Active FAs (manufacturing_operation_N values)
  - Constraint enforced at application level (02-SETTINGS form cannot delete if count > 0)
- `is_active` boolean allows soft-delete without breaking historical FAs

### Cross-references (to be added in sibling PRDs)

- **01-NPD-PRD §6 (Cascading Rules):** Reference this section for Chain 2 implementation (manufacturing_operation_N → intermediate_code_pN)
- **02-SETTINGS-PRD § (Manufacturing Operations Editor):** Reference this section for UI requirements, validation, seed data structure
- **08-PRODUCTION-PRD §X (Work Order Initialization):** Reference this section for operation_name lookup during WO creation from template

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

Format (queue routing key): `<tenant>/<site>/<area>/<line>/<event_type>`

Przykłady:
- `apex/uk-site/mixing-line/wo-4521/ccp-chilling-out-of-spec`
- `apex/uk-site/warehouse/lp-8823/moved`
- `apex/uk-site/shipping/shipment-1234/epcis-commissioning`

**`event_type` aggregate prefixes (canonical):** `fa.*` (NPD 01 finished-article lifecycle — `fa.created`, `fa.core_closed`, `fa.dept_closed`, `fa.built`, `fa.built_reset`, `fa.allergens_changed`), `brief.*` (NPD brief), `org.*` / `user.*` / `role.*` / `audit.*` (foundation/settings), `lp.*` (warehouse), `wo.*` (production), `quality.*`, `shipment.*`. **`fa.*` is canonical for the NPD finished-article aggregate even after the ADR-034 physical rename of the underlying `fa` table to `product`** — event names are a domain contract, decoupled from storage. `product.*` is reserved for future product-master/reference-data events (D365 item master, BOM revisions) and is NOT a synonym for `fa.*`. Full aggregate registry + add-prefix process: `_meta/specs/event-naming-convention.md`. Source-of-truth enum: `lib/outbox/events.enum.ts`.

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

### Audit log [F-U3 per gap-backlog 2026-04-30, UNIVERSAL]

Append-only `audit_events` table; triggers on business tables + event-sourced integration with the rule engine (ADR-029). Append-only is enforced at the DB level (no UPDATE / DELETE policy for any non-superadmin role; superadmin DELETE is itself logged to a separate immutable WORM bucket).

**13-field schema:**

```sql
CREATE TABLE audit_events (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL,                           -- 1. RLS scope
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),      -- 2. monotonic
  actor_user_id   UUID,                                    -- 3. NULL when actor is system/SCIM
  actor_type      TEXT NOT NULL                            -- 4. 'user' | 'system' | 'scim' | 'impersonation'
                  CHECK (actor_type IN ('user','system','scim','impersonation')),
  impersonator_id UUID,                                    -- 5. NOT NULL when actor_type='impersonation'
  action          TEXT NOT NULL,                           -- 6. dot-string, e.g. 'org.security.policy.update'
  resource_type   TEXT NOT NULL,                           -- 7. 'user' | 'role' | 'fa' | 'wo' | …
  resource_id     TEXT NOT NULL,                           -- 8. UUID or natural key
  before_state    JSONB,                                   -- 9. nullable for create
  after_state     JSONB,                                   -- 10. nullable for delete
  ip_address      INET,                                    -- 11.
  user_agent      TEXT,                                    -- 12.
  request_id      UUID NOT NULL,                           -- 13. correlates with outbox + tracing
  retention_class TEXT NOT NULL DEFAULT 'standard'
                  CHECK (retention_class IN ('security','standard','operational','ephemeral'))
);
CREATE INDEX ON audit_events (tenant_id, occurred_at DESC);
CREATE INDEX ON audit_events (tenant_id, resource_type, resource_id, occurred_at DESC);
CREATE INDEX ON audit_events (tenant_id, actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL;
```

**Retention tiers** (per `retention_class`):

| Class | Examples | Retention | Storage |
|---|---|---|---|
| `security` | login / logout / MFA enrol / role grant / SSO config / impersonation start+end / SCIM token issue | **7 years** | hot 90d + cold S3 Glacier with object-lock |
| `standard` | business mutations on FA / WO / lot / shipment / quality_event | **3 years** | hot 1y + cold S3 |
| `operational` | reference-data edits, schema-driven column changes, feature-flag toggles | **18 months** | hot |
| `ephemeral` | UI-only navigation traces, dry-run previews | **30 days** | hot only |

**Compliance scope:** SOC 2 CC6.1/CC6.3/CC7.2; GDPR Art. 30 (processing records) + Art. 32 (security of processing); FDA 21 CFR Part 11 (electronic records — when a US tenant requires it, `retention_class='security'` extends to **10 years**); FSMA 204 traceability records (handled via `aggregate_type IN ('lot','shipment')` rows). The `before_state` / `after_state` JSONB columns make every change reversible at the audit level (Part 11 §11.10(e) "secure, computer-generated, time-stamped audit trails"). Impersonation flows MUST write a paired `impersonation.start` + `impersonation.end` row with `actor_type='impersonation'` and `impersonator_id` populated; the `org.access.admin` UI surfaces this as a yellow banner.

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
- [ ] **MFA-by-default** for both `org.access.admin` and `org.schema.admin` system roles in every new tenant (`tenant_idp_config.mfa_required_for_roles` seeded with both) [F-U5 per gap-backlog 2026-04-30]
- [ ] **Password policy = NIST SP 800-63B-aligned** by default: min 12 characters, no expiry, breach-check via HIBP k-anonymity, last-5 history; `password_complexity='strong'` is the seed value for every new `tenant_idp_config` row [F-U5]
- [ ] **Idle-timeout default = 60 minutes** absolute; **session_max_h default = 8 hours**; both org-tunable per §8.x within cluster-wide hard caps [F-U5]
- [ ] **SSO baseline = SAML 2.0 + Microsoft Entra ID connector** available to every tenant from day 1 (no upsell gating); SCIM 2.0 endpoints exposed when `tenant_idp_config.scim_token_hash IS NOT NULL` [F-U5]
- [ ] **Magic-link invitation TTL = 7 days, single-use, signed**; codified, not Supabase-default; expiry shown to inviter and a self-service "resend" path is available [F-U5]

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

- **v4.2 (2026-04-30, UX→PRD gap-backlog amendments)** — Applied UX→PRD gap-backlog (`_meta/plans/2026-04-30-ux-prd-plan-gap-backlog.md`) §MODULE 00-FOUNDATION. **Updates:** F-U1 §5 Tech Stack — Auth & Identity Stack (§5.x) added with 6 OSS libraries locked (GoTrue/Supabase Auth, `@boxyhq/saml-jackson`, `otplib`, `@simplewebauthn/server`, `argon2`, Supabase auth-helpers); F-U2 §8 Multi-tenant — `tenant_idp_config` table + per-tenant IdP mapping (§8.x); F-U3 §11 Audit log — expanded from 1 paragraph to 13-field schema with 4 retention tiers (security 7y / standard 3y / operational 18mo / ephemeral 30d) + Part 11 + GDPR Art. 30/32 alignment; F-U4 §3 Personas — Administrator split into Org Admin (ACCESS pillar) + Schema Admin (ADMIN pillar) per SOC 2 CC6.3 separation-of-duties; F-U5 §13 Success Criteria — added 5 niefunkcjonalne items (MFA-by-default, NIST password policy, idle timeout default, SSO baseline, magic-link 7-day TTL). **Additions:** F-A1 §5.x Auth & Identity Stack (~330 words, [UNIVERSAL]); F-A2 §8.x Per-tenant IdP Mapping with full DDL (~210 words, [UNIVERSAL]); F-A3 §5.y Shared UI Primitives `@monopilot/ui` workspace package + 10 MODAL-SCHEMA patterns + Storybook 8/axe-core CI (~210 words, [UNIVERSAL]); F-A4 §4.2-AMENDMENT addendum adding `00-FOUNDATION-impl-j` to the Foundation set as a critical-path blocker before any T3-ui task. ADR-034 markers `[UNIVERSAL]` applied to all new sections. Coverage 60% → ≥85% per gap-backlog target.

- **v4.1 (2026-04-30, Phase E-0 prep)** — Three Phase B.2 PRD-suite clarifications before Phase E-0 kickoff: (1) Added **§4.2-AMENDMENT** (per ADR-032) explicitly listing Phase E-0 atomic foundation tasks `00-FOUNDATION-impl-a..i` as the prerequisite for 01-NPD-a (replacing vague "Foundation infra w minimum scope"), and clarifying parallel Track A / Track B build sequence with `_meta/plans/2026-04-22-phase-e-kickoff-plan.md` as authoritative source; (2) Disambiguated event naming in §10 — `fa.*` is canonical for the NPD finished-article aggregate, `product.*` is reserved for future product-master/reference-data events; published full aggregate registry in `_meta/specs/event-naming-convention.md`; (3) Added **§4.3-AMENDMENT** finalising the table-naming decision: physical table renamed `fa` → `product` (Option B per ADR-034), `fa` retained as a backward-compat read-only SQL view through Phase C1 D365 adapter cutover. No structural changes to existing sections.

- **v4.0 (2026-04-30)** — Added §9.1 Manufacturing Operations (Process) Configuration Pattern. Documents configurable suffix-based naming scheme (Reference.ManufacturingOperations) for manufacturing_operation_1..4 fields. Includes pattern overview, table schema [UNIVERSAL] + [ORG-CONFIG] marker discipline, cascade rule integration (ADR-029 Chain 2), template application, industry seed data (bakery/pharma/fmcg), phase implementation roadmap (B.2/C1/C+), and cross-references to sibling PRDs (01-NPD, 02-SETTINGS, 08-PRODUCTION). Aligns with P1 (easy extension contract) and ADR-028 (schema-driven pattern).

- **v3.0 (2026-04-18)** — Phase B.1 full rewrite. Phase D renumbering (01-NPD primary, 02-SETTINGS, etc.), 6 principles embedded, marker discipline, R1-R15 research decisions, reference to MES-TRENDS-2026.md + MONOPILOT-V2-ARCHITECTURE.md + META-MODEL + ADR-028-031. Wycięte: stare metryki biznesowe, pre-Phase-D numbering, per-module requirements, Supabase lock-in language. Pre-Phase-D ADRs (001-019) deep review deferred do osobnej sesji (§14 open item #13). Old PRD v2.3 archived w git history.

- **v2.3 (2026-02-18)** — pre-Phase-D last version. 16 modułów M00-M15, 77 requirements, 18 ADRs (001-019). Stare numerowanie (M01=Settings, M09=NPD).

---

*PRD 00-FOUNDATION v4.2 — UX→PRD gap-backlog amendments F-U1..F-U5 + F-A1..F-A4 applied (auth subsystem, per-tenant IdP, expanded audit log, persona split, UI primitives package). Next: Phase E-0 kickoff (`00-FOUNDATION-impl-a..j`).*
