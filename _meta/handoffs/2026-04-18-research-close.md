# HANDOFF — Pre-Phase-B Research CLOSE → Phase B.1 bootstrap

**From:** 2026-04-18 Research session (3 agenty parallel + consolidation)
**To:** Phase B.1 — 00-FOUNDATION PRD rewrite
**Phase:** Research CLOSED → Phase B.1 next

---

## 🏁 Research COMPLETE — Quality gate ✅

Pre-Phase-B Industry Research zamknięty w 1 sesji. Wszystkie deliverables z Phase D HANDOFF §8 dostarczone.

- [x] 8 obszarów research pokrytych (MES Trends / Food-mfg / D365 replacement / Schema-driven SaaS / Multi-tenant / AI-ML / Mobile UX / Supply chain) ✅
- [x] 3 agenty parallel (context-economy) — każdy ~230-330 linii draft ✅
- [x] Consolidation: `_foundation/research/MES-TRENDS-2026.md` (810 lines) ✅
- [x] Executive summary + TOC + per-module rollup + R-decisions + regulatory roadmap ✅
- [x] User review + approve ✅

---

## Deliverables Research

**Primary:**
- ✅ `_foundation/research/MES-TRENDS-2026.md` — consolidated research (810 lines)
- ✅ Ten HANDOFF

**Zawartość MES-TRENDS-2026.md:**

### Struktura (10 sekcji)

| Sekcja | Content |
|---|---|
| Exec summary | 10 key findings, cross-ref do § |
| §1 MES Trends 2026 | Composable MES, UNS/Sparkplug B, Next.js RSC, digital twin |
| §2 Food-mfg | HACCP paperless, EU FIC 1169/2011, BRCGS v9, GS1 Digital Link, FEFO/genealogy |
| §3 D365 replacement | Strip-down pattern, strangler fig, one-way sync, TCO, Aptean/Infor positioning |
| §4 Schema-driven SaaS | 10-platform matrix, JSONB hybrid (3× mniej storage, 15000× szybsze od EAV), Zod runtime |
| §5 Multi-tenant | RLS best practices, L1-L4 model, upgrade canary rollout, PostHog flags |
| §6 AI/ML in food-mfg | 7 use-case maturity matrix, L0 LLM/L1 forecasting/L2 agents warstwy |
| §7 Mobile UX | Zebra TC53/TC73 + Honeywell CT45/CT60, PWA-first, GS1-128 AI parser, multi-lang pl/en/uk/ro |
| §8 Supply chain | FSMA 204 (2028-07-20), EUDR (2026-12-30), ViDA (2030-07-01), EPCIS 2.0 |
| **§9 Per-module rollup** | **00-FOUNDATION → 15-OEE**, każdy bullet z cross-ref § |
| **§10 Decisions + open items** | **R1-R15 candidate ADRs, regulatory roadmap table, 4 open research items** |

### 15 R-decisions locked (candidate ADR / Phase B)

| # | Decision | Marker |
|---|---|---|
| R1 | Event-first architecture via outbox pattern w Postgres od MVP | [UNIVERSAL] |
| R2 | Postgres JSONB hybrid storage (core typed + ext + private + schema_version) | [UNIVERSAL] |
| R3 | RLS default + composite indexes + LEAKPROOF SECURITY DEFINER wrappers | [UNIVERSAL] |
| R4 | Zod + json-schema-to-zod runtime dla schema-driven form/validator gen | [UNIVERSAL] |
| R5 | PWA P1 + Capacitor P2 dla 06-SCANNER | [UNIVERSAL] |
| R6 | PostHog self-host jako feature flags + analytics stack | [UNIVERSAL] |
| R7 | EU data residency cluster default dla Forza + EU klientów | [FORZA-CONFIG]→[UNIVERSAL] |
| R8 | One-way D365→Monopilot sync + one-way Monopilot→D365 push | [LEGACY-D365] |
| R9 | Strangler Fig migracja z v7 Excel + parallel run (Phase D "Two-systems") | [EVOLVING] |
| R10 | GS1 Digital Link + EPCIS 2.0 JSON-LD dla traceability; NIE blockchain | [UNIVERSAL] |
| R11 | i18n od dnia 1 (pl/en/uk/ro baseline, ICU MessageFormat) | [UNIVERSAL] |
| R12 | AI/ML warstwy: L0 LLM docs (P2), L1 forecasting/vision (P3), L2 autonomous (P4+) | [UNIVERSAL] |
| R13 | Schema "AI-ready + traceability-ready" od dnia 1 (model_prediction_id, epcis_event_id) | [UNIVERSAL] |
| R14 | Idempotent scanner mutations (UUID v7 client-generated transaction_id) | [UNIVERSAL] |
| R15 | GS1-first identifiers (GTIN/SSCC/GLN/GRAI) zamiast własnych | [UNIVERSAL] |

### Regulatory roadmap

| Regulacja | Enforcement | Dotyka modułów |
|---|---|---|
| **FSMA 204** (USA) | 2028-07-20 (opóźnione) | 01-NPD, 05-WAREHOUSE, 11-SHIPPING, 08-PRODUCTION |
| **EUDR** (EU) | 2026-12-30 | 01-NPD (BOM commodities), 11-SHIPPING, future Procurement |
| **Peppol B2B Belgium** | 2026-01-01 | 11-SHIPPING e-invoice |
| **EU ViDA** | 2030-07-01 | 11-SHIPPING, 10-FINANCE export |
| **BRCGS Food Issue 10** | 2026 (post consultation) | 09-QUALITY, 03-TECHNICAL |
| **EU FIC 1169/2011 + 2021/382** | Active | 01-NPD, 11-SHIPPING labelling |
| **Polska KSeF** | Opóźniony, kierunek pewny | 11-SHIPPING, 10-FINANCE |

### Open research items (deferred do Phase B start / later)

1. Storage partition strategy (partition by tenant_id od MVP vs później?)
2. Event bus MVP consumer (Azure Service Bus vs SQS vs RabbitMQ)
3. LLM platform (Claude API direct vs Azure OpenAI vs Modal)
4. Peppol access point vendor (Storecove vs Pagero vs Tradeshift)

---

## Phase B — Strategy & Split

**Phase B scope (per Phase D HANDOFF):** 00-FOUNDATION + 01-NPD **razem**.

**Decyzja strategiczna:** split Phase B na B.1 + B.2 dla fokusu i session-size management.

### Phase B.1 — 00-FOUNDATION rewrite (1 sesja)

**Scope:**
- Full rewrite current `00-FOUNDATION-PRD.md` (453 lines, pre-Phase-D, stare numerowanie)
- Zaktualizować numerowanie M00-M15 → **Phase D renumbering** (00-FOUNDATION, 01-NPD primary, 02-SETTINGS, 03-TECHNICAL, 04-PLANNING-BASIC, 05-WAREHOUSE, 06-SCANNER-P1, 07-PLANNING-EXT, 08-PRODUCTION, 09-QUALITY, 10-FINANCE, 11-SHIPPING, 12-REPORTING, 13-MAINTENANCE, 14-MULTI-SITE, 15-OEE)
- Wbudować 6 Phase D principles (Easy extension / Two-systems / Schema-driven + DSL / Reality fidelity / Multi-tenant / Marker discipline)
- Wbudować R1-R15 research decisions jako ADRs/decisions list
- Marker discipline wszędzie ([UNIVERSAL]/[FORZA-CONFIG]/[EVOLVING]/[LEGACY-D365])
- Cross-refs do META-MODEL.md + ADR-028/029/030/031 + MES-TRENDS-2026.md
- Usunąć pre-Phase-D decisions (złe metryki sukcesu, złe role mapping, itd.)
- Dodać: META-MODEL ref, rule engine DSL ref, L1-L4 multi-tenant, outbox pattern od MVP

**Keeping:** nazwa pliku `00-FOUNDATION-PRD.md` (numer 00 pozostaje zgodny z Phase D renumbering).

**NIE w B.1 scope:** rename innych plików (01-SETTINGS, 02-TECHNICAL, itd.) — pozostają stare nazwy do odpowiednich Phase C batches.

### Phase B.2 — 01-NPD full rewrite (2-3 sesje)

**Scope:**
- Rename `09-NPD-PRD.md` → `01-NPD-PRD.md`
- Full rewrite z reality sources (8 pld-v7-excel docs + 2 brief-excels docs)
- 7 dept columns (Core + Technical + Packaging + MRP + Planning + Production + Price) + workflow + cascade + Dashboard
- Brief import tool (Excel → PLD row) — pre-PLD NPD stage
- D365 Builder logic (N+1 products per FA, OP=10, per-FA file format)
- Allergens multi-level cascade (RM → PR_step → FA) + EU14 + custom
- Multi-component agregacja (Main Table comma-sep + ProdDetail per-comp)
- Markery wszędzie + cross-refs do reality docs
- Integration stage 1 (D365 Builder) — inline w 01-NPD

**Estimate:** 2-3 sesje zależnie od scope (D365 Builder może być osobną sesją jeśli detail wysoki).

---

## Bootstrap Phase B.1 session

1. Read ten HANDOFF
2. Read `_foundation/research/MES-TRENDS-2026.md` — szczególnie §9 "00-FOUNDATION" + §10 R1-R15 + regulatory roadmap
3. Read `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` — 6 principles + 23 decisions + 15 modules
4. Read `_foundation/META-MODEL.md` + 4 ADRs (028/029/030/031)
5. Read current baseline `00-FOUNDATION-PRD.md` (453 lines)
6. Propose rewrite outline do user (10-15 sekcji skeleton)
7. User approve scope → full rewrite (~1000-1500 linii docelowo)
8. Post-rewrite: update memory + HANDOFF do Phase B.2

## Bootstrap Phase B.2 session (post B.1)

1. Rename `09-NPD-PRD.md` → `01-NPD-PRD.md`
2. Read MES-TRENDS-2026.md §9 "01-NPD" + §2 (allergens/labelling) + §6.1 (LLM SOP) + §3 (D365 Builder)
3. Read 8 pld-v7-excel reality docs + 2 brief-excels reality docs
4. Propose 01-NPD rewrite outline
5. User approve → full rewrite (potencjalnie w 2 sesjach — 01-NPD core + D365 Builder detail)

---

## Carry-forward do Phase B

### Z Phase D EVOLVING §19 (deferred, research nie zamyka — user call w B start)

1. Brief allergens lokalizacja (rescan brief schema)
2. Multi-component Volume w brief 2
3. Brief → Multi-FA split semantyka
4. Hard-lock semantyka (ADR-028 — developer vs superadmin)
5. Rule engine versioning (ADR-029 — v1 active vs v2 draft)
6. Upgrade strategy L2/L3/L4 opt-in granularity (ADR-031) — research §5.4 daje framework
7. Commercial upstream od briefu — deferred
8. MRP split — nieaktualne (pozostaje 1 dept)

### Z research §10.3 (open research items)

1. Storage partition strategy — rekomendacja: start bez partitioningu, monitor EXPLAIN
2. Event bus MVP — rekomendacja wstępna: Azure Service Bus (D365 adapter pattern)
3. LLM platform — rekomendacja wstępna: Claude API direct + Modal dla custom models
4. Peppol access point — deferred do Phase C (11-SHIPPING)

---

## Memory update po Research close

**`project_monopilot_migration.md`:**
- Status: Research COMPLETE (2026-04-18) — zamiast "Next step: Pre-Phase-B Research"
- Deliverable added: MES-TRENDS-2026.md (810 lines, R1-R15)
- Next: Phase B.1 → Phase B.2
- Bootstrap sections updated dla B.1 i B.2
- Remaining sesje: ~20-22 (B×3-4 + C×12-15)

**`project_smart_pld.md`:**
- Zostaje aktualny (v7 reality ground truth nie zmienia się)
- REALITY-SYNC discipline obowiązuje

---

## Related

- [`_foundation/research/MES-TRENDS-2026.md`](../../_foundation/research/MES-TRENDS-2026.md) — Research primary deliverable
- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](../../_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — Phase D primary
- [`2026-04-18-phase-d-close.md`](2026-04-18-phase-d-close.md) — predecessor HANDOFF
- [`_foundation/META-MODEL.md`](../../_foundation/META-MODEL.md) — Phase 0 foundation
- [4 ADRs 028-031](../../_foundation/decisions/) — Phase 0 foundation (extended by Phase D decisions + R1-R15)
