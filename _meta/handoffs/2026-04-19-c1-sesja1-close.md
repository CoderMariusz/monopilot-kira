# HANDOFF — Phase C1 Sesja 1 CLOSE → Sesja 2 bootstrap (03-TECHNICAL)

**From:** 2026-04-19 Phase C1 Sesja 1 writing (02-SETTINGS v3.0 full rewrite)
**To:** Phase C1 Sesja 2 — 03-TECHNICAL v3.0
**Phase:** C1 Sesja 1 CLOSED → C1 Sesja 2 next

---

## 🏁 Sesja 1 — Deliverable

✅ **`02-SETTINGS-PRD.md` v3.0** — 1343 linii, 16 sekcji, full rewrite baseline (652l, 8 epics pre-Phase-D → Phase D architecture).

### Core sekcje

| § | Sekcja | Novelty vs baseline |
|---|---|---|
| §1 | Exec Summary | v3.0 vs v1.x delta |
| §2 | Objectives + metryki | Rewrite |
| §3 | Personas + RBAC | Refined |
| §4 | Scope (P1 MVP / P2 / P3 / exclusions) | Rewrite |
| §5 | Entity Model (SQL schemas — 7 grup: identity, schema metadata, rule registry, L2 variations, generic reference storage, infra + master, security) | NEW |
| §6 | **Schema Admin Wizard [ADR-028]** | NEW (blocker P1 "easy extension") |
| §7 | **Rule Definitions Registry [ADR-029] read-only** | NEW — **kluczowa decyzja Q2**: rules dev-authored, admin read-only |
| §8 | **Reference Tables CRUD generic** (11 tabel = 8 v7 + AlertThresholds + AllergensRef + D365_Constants) | NEW — generic metadata-driven storage vs per-table baseline |
| §9 | **Multi-tenant L2 Config [ADR-031]** (dept taxonomy, rule variant, upgrade orchestration) | NEW |
| §10 | Module Toggles + Feature Flags (PostHog + built-in fallback) | Expanded |
| §11 | **D365 Constants Admin [LEGACY-D365] — INTEGRATIONS stage 1 inline** | NEW (tab SETTINGS > Integrations > D365) |
| §12 | Infrastructure (Warehouses/Locations/Machines/Lines) | Refined (ltree, JSONB specs L3) |
| §13 | EmailConfig + Notifications (Resend + outbox pattern) | Refined |
| §14 | Security + i18n (pl/en/uk/ro) + Onboarding 6-step | Refined |
| §15 | Validations V-SET-01..84 + KPIs + Success Criteria | Rewrite |
| §16 | Dependencies + Build Sequence 02-SETTINGS-a..e + Open Items + Refs | NEW sub-module split |

### Kluczowe decyzje Sesja 1 (Q1-Q4)

- **Q1:** L1 promotion flow = admin approval queue + background migration job + notification ✅
- **Q2:** Rule registry = **read-only admin UI**. Rules authored by dev (PR → migration deploy). Rationale: safety, type-safety, testing discipline, Apex context (Jane power-user ale nie programmer). §7.1 rationale detail. ✅
- **Q3:** PostHog self-host + built-in fallback (`feature_flags_core` table) dla core toggles: `maintenance_mode`, `integration.d365.enabled`, `scanner.pwa.enabled`, `npd.d365_builder.execute` ✅
- **Q4:** D365 Constants w osobnym tabie `SETTINGS > Integrations > D365` — 4 screens (SET-080..083) ✅

### Hard-lock semantyka rule registry (§7.5)

Carry-forward do 02-SETTINGS-d impl. Proposal (not locked):
- L1 rule (universal) = dev PR → deploy bez admin click
- L2 variant = dev PR → deploy + admin acknowledge (soft gate, audit-only)
- L3 custom = dev PR → deploy + admin approval required

---

## 02-SETTINGS build sub-modules (future impl reference)

Total **22-27 sesji impl est.**

| Sub-module | Scope | Sesji est. |
|---|---|---|
| **02-SETTINGS-a** | Foundation: Org + Users + RBAC + Audit | 4-5 |
| **02-SETTINGS-b** | Module toggles + Feature flags + Tenant L2 variations | 3-4 |
| **02-SETTINGS-c** | Schema admin wizard (ADR-028) + Reference.DeptColumns | 5-6 |
| **02-SETTINGS-d** | Rule registry read-only + 11 Reference CRUD generic + CSV import/export | 6-7 |
| **02-SETTINGS-e** | Infra + D365 Constants + EmailConfig + Onboarding + security + Phase 2 i18n | 4-5 |

---

## Sesja 2 — Bootstrap 03-TECHNICAL

### Scope

`03-TECHNICAL-PRD.md` v3.0 full rewrite (baseline 828 linii pre-Phase-D).

**Core content:**
- Product master CRUD (extending FA z 01-NPD — item master universal schema)
- BOM versioning + co-products (building na 01-NPD §6 cascade)
- Catch weight + tare/gross/nominal model
- Shelf-life regulatory (BRCGS v9, FSMA 204, packaging regs)
- **Allergens full** (building na 01-NPD §8 + Reference.Allergens z 02-SETTINGS) — allergen profile per item, supplier spec integration, lab result tracking (ATP swab)
- Material cost_per_kg (per Phase D decision — cost attr na product, nie settings globalne)
- Routing costs + resource mapping
- **INTEGRATIONS stage 1 technical side** — D365 items/BOM/formula **one-way sync pull** (read-mostly cache, nightly + on-demand), production confirmations **push** to D365 journal

### Bootstrap steps

1. Read ten HANDOFF
2. Read `02-SETTINGS-PRD.md` v3.0 — zwłaszcza:
   - §5.2 `reference_schemas` + `schema_migrations` (ADR-028 SQL)
   - §5.3 `rule_definitions` + `rule_dry_runs`
   - §5.5 `reference_tables` generic storage (03-TECHNICAL używa tego dla BOM + specs)
   - §8 Reference tables CRUD (allergens_reference row schema)
   - §11 D365 Constants admin (stage 1 overlap)
3. Read `01-NPD-PRD.md` v3.0 — zwłaszcza:
   - §4 Entity model (FA → item master extension path)
   - §6 Cascading rules (BOM AutoGen rule spec)
   - §8 Allergens multi-level cascade (foundation dla 03-TECHNICAL extension)
   - §10 D365 Builder N+1 (item per intermediate PR — 03-TECHNICAL item master wspiera intermediate)
4. Read `00-FOUNDATION-PRD.md` v3.0 — §5 Tech Stack, §6-8 schema/rule/tenant
5. Read `MES-TRENDS-2026.md` §9 "03-TECHNICAL" (Digital SOPs + LLM copilot) + §2 food-mfg (allergens + catch weight + regulatory)
6. Read pre-Phase-D baseline `03-TECHNICAL-PRD.md` (828 linii)
7. Read reality:
   - `_meta/reality-sources/pld-v7-excel/D365-INTEGRATION.md` §7 BOM AutoGen (M06)
   - `_meta/reality-sources/pld-v7-excel/EVOLVING.md` §4 Allergens cascade full + §10 D365 Builder + §11 BOM Generator
8. Propose outline → user approve → full rewrite (est. 900-1200 linii)
9. Update memory + HANDOFF C1 close → Phase C2 bootstrap

### Proposed outline preview (do ustalenia w Sesja 2)

| § | Sekcja | ~linie |
|---|---|---|
| 1-4 | Exec + Objectives + Personas + Scope | 200 |
| 5 | Entity Model (items, boms, co_products, allergen_profiles, lab_results, routing, resources, d365_sync_state) | 200 |
| 6 | **Product Master** (CRUD, item types: RM/intermediate/FA, schema-driven extensions) | 150 |
| 7 | **BOM Versioning + Co-products** (version history, effective dates, co-product allocation, scrap) | 150 |
| 8 | **Catch Weight + tare/gross/nominal** (per-item mode, scale integration) | 80 |
| 9 | **Shelf-life + Regulatory** (BRCGS v9, FSMA 204 traceability, date code, use-by vs best-before) | 100 |
| 10 | **Allergens Full** (profile per item, supplier spec, ATP swab results, cross-contamination risk) | 150 |
| 11 | **Cost_per_kg** (per-item attr, version history, variance roll w 10-FINANCE) | 50 |
| 12 | **Routing + Resources** (operations, setup/run times, resource mapping) | 100 |
| 13 | **D365 Integration stage 1 technical** (one-way pull items/BOM nightly+on-demand, push WO confirmations, retry + DLQ) | 120 |
| 14 | Validations V-TEC + KPIs + Success Criteria | 80 |
| 15 | Dependencies + Build Sequence 03-TECHNICAL-a..d + Open Items | 100 |
| 16 | References + Changelog | 40 |

**Total est.:** ~1020 linii, 16 sekcji.

---

## Carry-forward do Sesja 2

**Z 02-SETTINGS (just-written):**
- Allergens storage split: Reference.allergens_reference (global EU-14 + org extensions) — defined w 02-SETTINGS §8.1, authoring w 03-TECHNICAL
- Rule definitions dev-authored — BOM AutoGen rule + Allergen cascade rule = PR w Sesja 2+ impl
- Schema admin wizard available — 03-TECHNICAL product master extension points realized przez ADR-028

**Z 01-NPD (B.2):**
- 8 Phase B.2 discovery open items (allergens lokalizacja w brief, supplier per-FA, Brief C21-C37 rescan — czeka na brief rescan)
- Multi-component Volume brief 2 (deferred)

**Z Phase D EVOLVING §19:**
- BOM Generator button flow (EVOLVING §11) — decision w 03-TECHNICAL §7
- Dieset material consumption (EVOLVING §7) — decision w 03-TECHNICAL §7 albo 01-NPD impl sub-module

---

## Related

- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0 — Sesja 1 primary deliverable
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0
- [`01-NPD-PRD.md`](../../01-NPD-PRD.md) v3.0
- [`2026-04-19-phase-b-close.md`](./2026-04-19-phase-b-close.md) — Phase B close HANDOFF (predecessor)
- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) §9

---

## Closing note

Sesja 1 (02-SETTINGS v3.0, 1343 linii) zamknięta efektywnie. Kluczowa decyzja sesji = **Q2 Rule registry read-only** — upraszcza admin UI, wzmacnia safety/testing discipline, zgodna z Apex context (Jane = power-user NPD, nie programmer).

**Pozostało Phase C1:** 1 sesja (03-TECHNICAL + INTEGRATIONS stage 1 technical side).

**Pozostało Phase C total:** C1 Sesja 2 + C2-C5 = ~11-14 sesji writing. Po tym impl start.

**Session reset rekomendowane** przed C1 Sesja 2 — świeży context dla 03-TECHNICAL (BOM + allergens deep specs).
