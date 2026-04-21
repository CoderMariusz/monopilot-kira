---
title: MES-TRENDS-2026 — Industry Research dla Monopilot
date: 2026-04-18
phase: Pre-Phase-B (one-pass research)
authors: 3× research agent (Opus 4.7) + consolidation
status: draft v1 — pending user review
scope: 8 obszarów research §8 MONOPILOT-V2-ARCHITECTURE.md
---

# MES-TRENDS-2026 — Industry Research dla Monopilot

> **Cel:** jednorazowy pass research przed Phase B (00-FOUNDATION + 01-NPD rewrite). Dokument referencowany w każdym kolejnym PRD rewrite (token-efficient, zero duplicate research).
>
> **Jak powstał:** 3 research agenty równolegle (MES/food/D365 · schema-driven/multi-tenant · AI-ML/mobile/supply-chain), WebSearch + WebFetch na źródła 2024-2026, model Opus 4.7. Konsolidacja: intro + TOC + sekcje verbatim + per-module rollup + decisions summary.
>
> **Styl:** polski narrative + angielskie tech terms (spójny z MONOPILOT-V2-ARCHITECTURE.md).
> **Markery w rekomendacjach:** [UNIVERSAL] / [FORZA-CONFIG] / [EVOLVING] / [LEGACY-D365] per ADR discipline.

---

## Executive summary

Research potwierdza **strategię Monopilot bezpośrednio**: composable MES + schema-driven + event-first + multi-tenant z RLS to mainstream kierunek 2026 (nie niche). Krytyczne findings:

1. **Stack walidacja.** Next.js App Router + RSC + PWA + Postgres JSONB-hybrid + RLS = 2026 default dla modern MES/SaaS. Phase D decyzje architektoniczne są zbieżne z trendem.
2. **Event-first jest must, nie nice-to-have.** Nawet MVP powinien mieć **outbox pattern w Postgres** (domain events → worker → konsumenci). Daje za darmo: audit log, D365 integration, przyszły MQTT/Sparkplug B bridge, feature store dla ML, EPCIS traceability.
3. **Food-mfg regulatory runway ma konkretne deadliny.** FSMA 204 (**2028-07-20**), EUDR (**2026-12-30**), Belgium Peppol (**2026-01-01**), ViDA (**2030-07-01**), BRCGS Issue 10 (2026). Schema musi być "traceability-ready" od dnia 1 (EPCIS-compatible event fields).
4. **HACCP paperless + digital allergen management = table stakes.** Rule engine DSL idealnie pasuje ("IF temp > X FOR 15min AT ccp THEN escalate"). EU FIC 1169/2011 + Reg 2021/382 wymuszają allergen segregation w ERP/MES, nie tylko labelling.
5. **D365 replacement wzorzec jest stabilny.** Strip-down: D365 trzyma GL/finance, Monopilot przejmuje manufacturing/quality/warehouse/shipping. **Strangler fig** + parallel-run (zgodny z "Two-systems principle" Phase D). One-way sync D365→MES na start.
6. **Postgres JSONB hybrid > EAV** (3× mniej storage, ~15000× szybsze queries z GIN). Core 69 cols typed + `jsonb_ext` (L3) + `jsonb_private` (L4) + `schema_version`. Nie Notion block-monolith, nie Salesforce Value1..ValueN, nie pure EAV.
7. **RLS default + app-level tenant_id defense-in-depth.** Composite indeksy `(tenant_id, dept_id, status, ...)`, LEAKPROOF functions w policies, nigdy superuser w testach. Data residency EU cluster dla Forza.
8. **PWA jako 06-SCANNER P1.** ~90% use-case'ów pokryje Workbox Background Sync + IndexedDB queue + DataWedge keyboard-wedge. Capacitor wrapper Phase 2 dla raw camera / BLE sled. Multi-lang pl/en/uk/ro **od dnia 1** (nie retrofit).
9. **AI/ML roadmap warstwowa.** L0 LLM dla SOP/troubleshooting = bezpieczny start. L1 forecasting (Prophet/TimeGPT) + vision QA (emerging, partner hardware). L2 autonomous agents — 12-18 mies. production data najpierw.
10. **GS1-first identyfikatory** (GTIN/SSCC/GLN/GRAI) zamiast własnych ID gdzie możliwe. Interop z retail + traceability "za darmo". Internal ID może żyć obok.

**Decyzja do potwierdzenia w Phase B:** patrz §10 (4 otwarte pytania: storage partition strategy, event bus MVP, LLM platform, Peppol access point vendor).

---

## Jak używać tego dokumentu

**Per PRD rewrite:**
1. Otwórz swój moduł w §9 (per-module rollup) — tam są konkretne actionable hints z cross-refami do §1-§8.
2. Zacznij PRD od sekcji "Research inputs" cytującej odpowiednie §§ tego doca.
3. Nie re-researchuj — jeśli czegoś brakuje, dodaj do §10 "open research items" (następny research pass).
4. Decision markers: każda rekomendacja w §9 powinna dostać marker [UNIVERSAL]/[FORZA-CONFIG]/[EVOLVING]/[LEGACY-D365] w PRD.

**Per ADR update:**
- §4 schema-driven bezpośrednio wspiera ADR-028.
- §5 multi-tenant bezpośrednio wspiera ADR-031.
- Rule engine DSL (ADR-029) — patrz §2 (food-mfg rule examples) + §6 (LLM Level 2 caveats).
- Dept taxonomy (ADR-030) — patrz §3 (D365 strip-down) + §5 (L2 opt-in).

**Per Phase B execution:**
- 00-FOUNDATION rewrite: czytaj §9 "00-FOUNDATION" + §4 + §5.
- 01-NPD rewrite: czytaj §9 "01-NPD" + §2 (allergen/labelling) + §6.1 (LLM SOP).
- Integration stage 1 (D365 Builder): §3 + §9 "11-SHIPPING" (GS1 Digital Link).

---

## Table of Contents

- [§1 MES Trends 2026](#1-mes-trends-2026)
- [§2 Food-mfg Best Practices](#2-food-mfg-best-practices)
- [§3 D365 Replacement Patterns](#3-d365-replacement-patterns)
- [§4 Schema-driven Architecture](#4-schema-driven-architecture)
- [§5 Multi-tenant Patterns](#5-multi-tenant-patterns)
- [§6 AI/ML in Food-mfg MES](#6-aiml-in-food-mfg-mes)
- [§7 Mobile UX for Industrial Scanners](#7-mobile-ux-for-industrial-scanners)
- [§8 Supply Chain & Procurement Trends](#8-supply-chain--procurement-trends)
- [§9 Cross-cutting Recommendations (per-module rollup)](#9-cross-cutting-recommendations-per-module-rollup)
- [§10 Key Decisions & Open Research Items](#10-key-decisions--open-research-items)

---

## §1 MES Trends 2026

### Key findings

- **Market context.** Globalny rynek MES rośnie z ~$19.09 B (2025) do ~$20.58 B (2026) i projekcja $40 B+ w 2035. Równocześnie IoT Analytics raportuje >300 aktywnych vendorów — mocna fragmentacja, "pen-and-paper/spreadsheet replacement" wciąż dominuje jako use-case (→ Smart PLD v7 jest dokładnie w tym segmencie). [iot-analytics.com]
- **Composable MES to default RFP w 2026.** Korporacyjne RFP explicite żądające "composable architectures" rosną +40% YoY. Dominujące cechy: microservices + kontenery (K8s), modularne funkcje zamiast monolitycznych suit, niezakłócające upgrade'y ("spin up new workflows in days, not months"). [spkaa.com, criticalmanufacturing.com]
- **Unified Namespace (UNS) + event-driven.** Vendorzy przesuwają complexity z punktowych integracji do pub/sub brokera. Sparkplug B na MQTT staje się de-facto standardem dla ISA-95 payloadów (Enterprise→Site→Area→Line→Cell). ANSI/ISA-95.00.01-**2025** (wyd. kwiecień 2025) explicite legitymizuje cloud-hybrid, kontenery i data-centric architectures — odchodzi od piramidy ISA-95 jako wymogu deploymentu. [hivemq.com, isa.org, bowdark.com]
- **OPC UA + TSN dla real-time cell-level, MQTT dla wider visibility.** Wzorzec stabilizuje się: deterministyczna komunikacja (OPC UA PubSub / TSN) wewnątrz komórki, event streaming (Sparkplug B → Kafka/Redpanda/HiveMQ) dla enterprise. [hivemq.com, ifactoryapp.com]
- **Cloud-native + GenAI embedded.** Rockwell (grudzień 2025) wypuścił "elastic MES" — cloud-native platforma z embedded analytics + GenAI naturalny-język nad danymi MES. GenAI w MES jest pozycjonowany jako "usability layer" (czat z shop floor data zamiast wertowania ekranów). [spkaa.com]
- **Digital twin → mainstream w food.** Bakery case study: -24.4% czas produkcji, -23% energii przy closed-loop twinach. Rynek digital twin w manufacturingu: $3.6 B (2024) → $42.6 B (2034). [mdpi.com, fabrico.io]
- **Scanner-first UX.** Zebra >50% market share w warehouse scannerach; dominują rugged Android devices (TC52x, Dolphin CT60). Offline engine + on-device ZPL/CPCL print + guided workflows to baseline. Klasyczne PWA w rugged segmentcie jest mniej popularne niż native Android apps — ale wybór PWA ma sens jeśli hardware-agnostic i offline-sync queue jest dobrze zaprojektowany. [tera-digital.com, cleverence.com]
- **Next.js App Router + RSC dla admin UI.** Wzorzec multi-tenant: `/app/[tenant]/...` + middleware tenant-aware + RSC dla ciężkich list/widoków, leaf client components dla interakcji. Server Actions zastępują wiele REST endpointów w admin panelach. [nextjs.org/docs/app/guides/multi-tenant]
- **Micro-frontends w 2026.** Module Federation 3.0 + Native ESM Federation — wyszło poza webpack (Vite plugins). Dla MES: każdy z 15 modułów Monopilot może być osobną federation remote, shared design-system library, niezależne deploy cadence. [elysiate.com, blog.weskill.org]

### Implications for Monopilot

- **Stack walidacja.** Next.js App Router + RSC jest w mainstreamie dla 2026 admin UI — decyzja Phase D jest spójna z trendem. Multi-tenant from day 1 przez path-based `/[tenant]/...` + middleware (Forza = tenant #1).
- **Event-driven to future-proof.** Nawet jeśli MVP używa Postgres + REST, zaprojektuj boundary "domain events" (production_started, ccp_recorded, wo_closed) tak, żeby kiedyś wpiąć je w Redpanda/Kafka bez rewrite. Wersja-lite: outbox pattern w Postgres → konsumenci w aplikacji.
- **UNS-compatible event shape.** Nazewnictwo topiców / event types zgodne z ISA-95 hierarchy (`forza/uk-site/mixing-line/wo-4521/ccp-chilling`). To da swobodę wpięcia MQTT brokera w Phase 2 bez renegocjacji schematu.
- **Composable = schema-driven + rule engine DSL.** Zasada "Easy extension" i rule engine Monopilot to lokalna wersja "composable MES". Rozważ Module Federation wyłącznie jeśli moduły będą deployowane przez różne zespoły / różnym cadencem — na start jeden monorepo + route-based code splitting wystarczy.
- **GenAI jako warstwa "spytaj produkcji".** W Phase 2+ warto zarezerwować miejsce na "ask-your-MES" nad zdarzeniami (MCP server nad event store).
- **Scanner tier decision.** Rekomendacja: **PWA + Service Worker + IndexedDB queue** zamiast native Android — uzasadnione przez schema-driven/multi-tenant (jeden codebase dla Forza i kolejnych klientów) + SSE/WebSocket do real-time. Hardening: duże targety dotykowe, focus na hardware scanner key events (Zebra DataWedge, Honeywell uBrowser intents → broadcast intents widoczne w PWA via Chrome custom tabs lub Kiosk mode). Szczegóły §7.
- **Digital twin = aspiracja Phase 3.** Na MVP wystarczy real-time dashboard agregujący eventy; twin-simulacja (what-if scheduling) to roadmap 12–18 mies.

### Sources

- [MES Market 2025–2031: 300+ Vendors Replace Pen & Paper — IoT Analytics](https://iot-analytics.com/mes-vendors-replace-pen-paper-spreadsheets/)
- [5 MES Trends for 2026 — SPK & Associates](https://www.spkaa.com/blog/5-mes-trends-for-2026-and-how-to-get-ahead)
- [Gartner Market Guide for MES 2026 — Critical Manufacturing](https://www.criticalmanufacturing.com/campaign/gartner-market-guide-for-mes-2026/)
- [Smart Manufacturing w/ ISA-95, MQTT Sparkplug, UNS — HiveMQ](https://www.hivemq.com/resources/smart-manufacturing-using-isa95-mqtt-sparkplug-and-uns/)
- [ISA-95 & Digital Manufacturing Transformation — bowdark.com](https://www.bowdark.com/blog/isa95-and-americas-digital-manufacturing-transformation)
- [OPC UA vs MQTT Sparkplug — HiveMQ](https://www.hivemq.com/resources/iiot-protocols-opc-ua-mqtt-sparkplug-comparison/)
- [Next.js Multi-tenant Guide — nextjs.org](https://nextjs.org/docs/app/guides/multi-tenant)
- [Micro-Frontends 2026: Module Federation 3.0 — weskill.org](https://blog.weskill.org/2026/03/micro-frontends-2026-module-federation_0688468676.html)
- [Closed-Loop Digital Twin for Food Manufacturing — MDPI 2025](https://www.mdpi.com/2078-2489/17/2/195)
- [Recommended Barcode Scanners for Warehouse 2026 — Tasklet](https://taskletfactory.com/learn/insights/recommended-barcode-scanners-for-warehouse-management-2025/)

---

## §2 Food-mfg Best Practices

### Key findings

- **HACCP paperless = nowy baseline.** W 2025–2026 cloud-based digital HACCP (FoodDocs, SafetyCulture, SafetyChain, Safely, FoodReady) stały się dominujące wśród średnich zakładów; papierowe logbooki traktowane są jako audit risk. Kluczowe funkcje: IoT sensors (temp probes w cold storage / pasteryzatorach) → continuous readings → auto-flag out-of-spec + eskalacja do supervisora. [iqx.net, alleratech.com, safely-systems.com, fooddocs.com]
- **EU FIC 1169/2011 + Commission Regulation 2021/382.** 14 obowiązkowych alergenów (US Big 9 + celery, lupin, molluscs, mustard, SO₂/sulphites >10 mg/kg). Wymóg: wyróżnienie (bold/podkreślenie) alergenów w liście składników; mandatory nutrition declaration; QUID; front-of-pack formatting. 2021/382 dokłada wprost obowiązki food business w zakresie zarządzania alergenami (nie tylko etykietowania) — digital segregation w ERP/MES staje się de-facto wymogiem audytowym. [eur-lex.europa.eu, food.ec.europa.eu, menutech.com]
- **Allergen management w ERP/MES.** Standardowy stack: (1) flagi na item master (14 alergenów + "may contain"), (2) batch-level allergen carry-over, (3) cleaning validation gate (tryb allergen-clean vs allergen-dirty przy line changeover), (4) labelling generator z QUID + nutrition autocalc z BOM, (5) precautionary labeling logic (VITAL 3.0 reference doses). [foodtech.folio3.com, sciencedirect.com/position-paper-allergen]
- **BRCGS Food Safety Issue 9 (obowiązuje od lutego 2023, Issue 10 w public consultation od 2026).** Nowe akcenty: food safety culture, validation/verification, "blended audit" — do 50% audytu zdalnie. Wniosek: digital evidence (dashboards, trend charts, CCP logs z timestampami i sygnaturami) staje się argumentem audytowym. IFS Food v8 (2023) idzie w tym samym kierunku. [brcgs.com, food-safety.com, nemistech.com, bluekango.com]
- **GS1 Digital Link + EPCIS 2.0 = standards-led traceability.** GS1 Digital Link embed w QR kodzie: GTIN + batch + expiry + serial w jednym scanalnym linku (+ redirect do konsumenckich informacji). EPCIS 2.0 jako event-sharing layer między supplierami. Blockchain pozostaje niszą — "rarely necessary for supplier-processor use cases; GS1 + cloud platform delivers most of the benefit without multi-party ledger overhead". [gs1.org, bl.ink, potatonewstoday.com]
- **FEFO + Batch Genealogy jako must-have.** Bidirectional traceability (one-step-forward/one-step-back) raw-material → FG → distribution, WMS captures identifiers na goods receipt, directed picking wymusza FEFO, lot status holds. Monitor market: $21–23 B (2024) → $38–44 B (2029–2033). [trustwell.com, mdpi.com]
- **Mass balance alergenów + gluten-free workflows.** Rosnąca presja na mass balance reconciliation (wejście alergenu vs wyjście w produkcie deklarowanym jako "free-from"). Gluten-free cert (AOECS Crossed Grain, GFCO) wymaga dedicated workflows (dedicated lines, ATP/ELISA swabs log, release-gate sign-off).

### Implications for Monopilot

- **Moduł 09-QUALITY to serce.** CCP runtime monitoring z IoT ingestion + auto-escalation; rule engine DSL idealnie pasuje ("IF temperature > 4°C for 15min AT ccp_chilling THEN flag AND notify hygiene_lead"). Digital signatures + immutable audit log to sine qua non dla BRCGS v9/v10 blended audit.
- **Allergen model w schema (01-NPD + 02-SETTINGS).** 14 alergenów jako first-class enum (EU FIC compliant), plus `may_contain[]` dla cross-contamination. Każdy BOM item dziedziczy alergeny z components + allow manual override + log change history. QUID + nutrition autocalc z recipe (suma weighted nutrients).
- **Line changeover gate (08-PRODUCTION).** Przy WO setup: jeśli poprzednie WO miało alergen X a następne jest "free-from X" → wymuś cleaning validation checklist + ATP swab result + dual sign-off. Rule engine DSL.
- **Labelling compliance (11-SHIPPING + 01-NPD).** Front-of-pack, QUID, nutrition declaration, allergen bolding — auto-generate z NPD dataset; label preview musi być WYSIWYG bo drukarki różnych klientów różnie interpretują spec.
- **Traceability przez GS1 Digital Link.** SSCC na paletach, GTIN+batch+expiry na unit, QR encode w GS1 Digital Link syntax. EPCIS 2.0 events jako wewnętrzny event log (commissioning, aggregation, shipping, receiving). To od razu daje "ready-to-share" format dla retailers.
- **FEFO + batch genealogy w 05-WAREHOUSE + 06-SCANNER.** Directed picking wymusza FEFO (shortest expiry first), holds/quarantine statuses, forward+backward trace w 4 sekundy (BRCGS wymaga <4h dla recall drill — digital to sekundy).
- **"Reality fidelity" w practice.** Forza dzisiaj trzyma część logiki w Excelu (PLD v7). Zmapuj co obecnie robią PAPER vs EXCEL vs nic — moduł 09 powinien wchłaniać CCP logs z Excela przez adapter (LEGACY-D365 marker nie pasuje; to raczej [EVOLVING]).

### Sources

- [Regulation (EU) 1169/2011 — EUR-Lex](https://eur-lex.europa.eu/eli/reg/2011/1169/oj/eng)
- [Food Information to Consumers — European Commission](https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation_en)
- [EU 1169/2011 Allergen Labelling Guide — Menutech](https://menutech.com/en/blog/legal-requirements/eu-11692011-guide-allergen-labelling-requirements)
- [Changing Food Allergen Landscape in Europe — Position Paper ScienceDirect 2024](https://www.sciencedirect.com/science/article/abs/pii/S0956713524006327)
- [HACCP in 2025: What the Future Holds — iqx.net](https://iqx.net/blog/haccp-in-2025)
- [Best 7 HACCP Compliance Software for 2026 — Allera](https://www.alleratech.com/blog/haccp-compliance-software)
- [BRCGS Food Safety Issue 9 — Food-Safety.com](https://www.food-safety.com/articles/8046-brcgs-food-safety-issue-9)
- [BRCGS Public Consultation Issue 10 (2026) — BRCGS](https://www.brcgs.com/about-brcgs/news/2026/public-consultation-food-safety-issue-9/)
- [BRC v9 vs IFS v8 comparison — BlueKango](https://www.bluekango.com/en/food-safety-standards-brc-ifs-bluekango/)
- [GS1 Digital Link standard — GS1](https://www.gs1.org/standards/gs1-digital-link)
- [GS1 Digital Link 2025 Guide — info.link](https://site.info.link/en/resources/gs1-digital-link-2025-guide-qr-code-examples-setup-tips)
- [Traceability on Trial (Blockchain vs GS1) — Potato News Today 2025-11](https://www.potatonewstoday.com/2025/11/12/traceability-on-trial-is-blockchain-and-end-to-end-tracking-finally-useful-for-potatoes-or-just-expensive/)
- [Advanced Digital Solutions for Food Traceability — MDPI 2025](https://www.mdpi.com/2224-2708/14/1/21)

---

## §3 D365 Replacement Patterns

### Key findings

- **Landscape competitors.** Dla food mfg Tier-2/3 (Forza scale): Aptean Food & Beverage (zbudowany na D365 BC!), Infor CloudSuite F&B (purpose-built process mfg, catch-weight, multi-level formulas z yield), SAP Digital Manufacturing (Tier-1, Nestle/PepsiCo/Danone — overkill dla Forza), Plex (Rockwell, discrete/continuous), Tulip (low-code apps dla operatorów — nie full MES). [elevatiq.com, erp.compare, anchorgroup.tech, top10erp.org]
- **Strip-down pattern: co zostaje w D365, co przejmuje MES.** Najczęstszy wzorzec:
  - **Zostaje w D365 F&O (lub BC):** General Ledger, AP/AR, cash management, procurement, sales orders (invoicing), tax, consolidations, HR/payroll.
  - **Przejmuje MES:** Production (WO execution, dispatch, status), Quality (HACCP/CCP/holds), Warehouse (receipt/pick/pack/ship), Planning (finite capacity scheduling), Maintenance (CMMS), Scanner/shop-floor UX, Labelling, Batch genealogy.
  - **Shared master data:** Item master, BOM/formula, BOM versions, customers, suppliers, locations, UoM — synchronized bidirectionally lub one-way (D365 → MES) w zależności od kto jest system-of-record. [velosio.com, techcronus.com]
- **Sync strategy: two-way vs one-way.**
  - **One-way (D365 → MES, recommended for start):** prostsze, mniej konfliktów, D365 pozostaje SoR dla finance-relevant data. MES ma read-only kopię itemów + pisze do D365 tylko production confirmations i inventory movements.
  - **Two-way (later):** gdy MES potrzebuje być SoR dla BOM/routing (bo jakość recipe management jest lepsza w dedykowanym systemie — patrz Infor CloudSuite, Aptean). Wymaga conflict resolution rules + "owner field" per attribute.
- **Integration middleware.** Standard dla D365 F&O ekosystemu: Azure Service Bus + Logic Apps + Dataverse + custom API gateway. Dla custom MES: **outbox pattern po stronie MES + Azure Function consumer → D365 Data Management Framework (DMF) entities**. Dla real-time (inventory, WO status): Business Events (D365 F&O → Azure Service Bus → MES). [learn.microsoft.com]
- **Strangler Fig jako wzorzec migracji.** Trzy cechy: facade-first (routing layer), incremental (każdy krok z rollback path), value-continuous (system w produkcji cały czas). Parallel-run: shadow writes do obu DB, reads validate przeciw legacy, potem new = SoR. Zdecydowanie wygrywa z big-bang dla MES migracji gdzie downtime kosztuje kilka£/min. [gartsolutions.com, learn.microsoft.com/azure/architecture/strangler-fig, altexsoft.com]
- **TCO D365 vs custom SaaS.** D365 F&O: ~$210/user/month (full) + ~$30/user/month (activity/team), plus Azure consumption, plus implementation partner (~$500k-$2M wdrożenie dla mid-size food). Custom SaaS MES: $0 per-user (self-hosted) lub flat tenant fee; cost shifts do dev+ops team. Break-even zwykle przy ~150-300 users zależnie od złożoności. [Gartner ranges, sector reports]
- **Aptean specific insight.** Aptean F&B jest zbudowany na Dynamics 365 BC (nie F&O) — to pokazuje, że BC stack dla food SMB/mid-market jest zwycięski. Klienci raportują 25% szybsze order-to-shipment cycles. UI jest krytykowane jako "outdated" — to luka do zagospodarowania przez Monopilot (nowoczesny UX nad nowoczesnym event-driven core). [erp.compare/aptean]

### Implications for Monopilot

- **Settled scope: Monopilot NIE robi GL/AP/AR.** Zostaje Dynamics (F&O lub BC) / Xero / inny finance. Monopilot = manufacturing execution + quality + warehouse + shipping + NPD. To dobrze pasuje do 15-modułowego blueprintu (brak modułu "Finance-GL"; moduł 10-FINANCE to prawdopodobnie cost-roll + landed cost + variance, nie księgowość).
- **D365 integration boundary (v1).** One-way pull: Items, BOM/formula, Customers, Suppliers, Locations, UoM z D365 → Monopilot (nightly + on-demand). One-way push: Production confirmations, Inventory movements, Shipments, Quality holds releases → D365 (near-real-time via Azure Service Bus).
- **Marker `[LEGACY-D365]` doprecyzowany.** Używaj dla: (a) field shape odziedziczony z D365 Item/Release entity który Monopilot utrzymuje dla compatybilności, (b) logika biznesowa dziedziczona 1:1 z v7 której źródło to był D365 config. NIE używaj dla: CCP logic (to [UNIVERSAL] w food) ani alergenów (to [UNIVERSAL]/[FORZA-CONFIG]).
- **Strangler migracja z v7 Excel.** Phase 0: facade = Excel exporter/adapter; nowy Monopilot wchłania moduł po module (zacznij od 09-QUALITY bo papier+Excel są tu najboleśniejsze dla HACCP audytów). Two-systems principle = exactly parallel run.
- **Outbox pattern w Postgres od MVP.** Tania implementacja event-driven: domain events w tabeli `outbox`, worker publishuje do queue (Azure Service Bus / SQS / RabbitMQ). Daje D365 integration + audit log + przyszły MQTT bridge za darmo.
- **Integration layer = osobny service / Next.js route handler domain.** Nie wciśnij D365 API calls do rule engine DSL ani UI actions. Odseparuj `@monopilot/d365-adapter` (schema mapping + DMF client + retry/DLQ).
- **Competitive positioning.** Monopilot vs Aptean: nowoczesny UX (Next.js App Router + RSC) + schema-driven config zamiast code-level customization + multi-tenant SaaS TCO. vs Infor/SAP: tańsze, szybsze, food-specific z pudełka dla SMB/mid. Nie konkuruj z SAP dla Fortune-500.

### Sources

- [Aptean Food & Beverage review — erp.compare](https://erp.compare/blogs/is-aptean-the-best-erp-for-the-food-and-beverage-industry/)
- [Top 10 Food & Beverage ERP 2025 — ElevatIQ](https://www.elevatiq.com/post/top-food-beverage-erp-systems/)
- [Compare ERP for F&B 2025 — erp.compare](https://erp.compare/blogs/compare-erp-for-the-food-and-beverage-industry/)
- [D365 F&O Environment Migration — Microsoft Learn](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/deployment/environment-migration-process)
- [Dynamics 365 Migration Guide 2025 — Velosio](https://www.velosio.com/blog/dynamics-365-migration-guide/)
- [Master Data Migration in D365 F&O — 7F Technology Partners](https://www.7f-tp.com/en/articles-eng/master-data-migration-in-dynamics-365-fo-a-practical-guide/)
- [Strangler Fig Pattern — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)
- [Strangler Fig Pattern deep dive — Gart Solutions](https://gartsolutions.com/strangler-fig-pattern/)
- [Strangler Fig Legacy Migration — AltexSoft](https://www.altexsoft.com/blog/strangler-fig-legacy-system-migration/)
- [Top 8 ERP Systems for F&B — StellarOne](https://www.stellarone.io/stellar-one-blog/erp-systems-for-food-beverage-industry)

---

## §4 Schema-driven Architecture

### 4.1 Comparison matrix

| Platform | Dynamic cols storage model | Form / validation gen | Performance profile | Verdict dla Monopilot |
|---|---|---|---|---|
| **Retool** | External (connects to user's DB); JSON Schema describes form only | JSON Schema Form component — runtime-generated z JSON schematu; programmatic updates | Zależy od backingu (user DB); UI lekki | **Borrow**: JSON Schema Form pattern jako wzór dla Admin UI wizard. **Reject**: cała platforma (nie chcemy low-code'a). |
| **Airtable** | Closed proprietary; pod spodem MySQL + Parquet (archive tier). Field types ściśle typowane, brak raw JSON field | Pre-built field editors per type; validation baked-in | Sparse filter issues (per ich eng blog); per-field indexing | **Borrow**: struktura Field Types jako enum (nie free-form). **Reject**: closed, brak self-host |
| **Notion Databases** | **Block-based**: wszystko (row, page, property) = block z uniform schema `{id, type, properties, content, parent}` w Postgres; 200B+ bloków | Properties decoupled od block type — zmiana typu nie niszczy danych. Formulas 2.0 z `prop()` cross-DB references | 200B rows Postgres + Spark data-lake dla analytics/denormalization | **Borrow**: decoupling *data* od *presentation type* (kluczowe dla workflow migrations). **Reject**: monoblock model (dla 69-col Main Table za mało structural) |
| **Baserow** | Per-table Postgres schema generowany dynamicznie (true DDL za kulisami) | Field UI auto-generated; role-based perms | DDL per table = real indexes, ale migrations heavy | **Borrow**: pattern "schema = source of truth, forms są widokiem". |
| **NocoDB** | Thin layer na istniejącym SQL (user owns schema) | Metadata-driven | Ograniczone przez backing DB | **Reject**: nie tworzy schemy — my potrzebujemy owner'a schemy. |
| **Directus** | Headless CMS nad existing SQL; metadata w `directus_collections/fields` | Auto-generated REST+GraphQL + Admin panel z field UI | PostgreSQL native, ale EAV-like metadata | **Borrow**: metadata-driven API generation (nasz Reference.DeptColumns + auto-API to ten wzorzec). |
| **Supabase + PostgREST** | DB-first; schema = source of truth; zmiany DDL → auto API | PostgREST generuje REST; generate TS types via CLI; Zod schemas manual lub via `zod-from-json-schema` | Postgres native, ale RLS performance pitfalls (patrz §5) | **Borrow**: database-first philosophy. Nasz Reference.DeptColumns może być warstwą NAD Postgresem (nie replace DDL). |
| **Hasura / PostGraphile** | DB schema → GraphQL auto | Instant CRUD + subscriptions; permission rules declarative | Postgres RLS + custom resolvers; PostGraphile szczególnie lean | **Borrow**: declarative permissions jako metadata. Hasura multi-tenant pattern (multiple Postgres dbs since 2.0). |
| **Appsmith / Budibase** | External DB; metadata per-app | Drag'n'drop builder | N/A | **Reject**: nie nasza liga (low-code enduser). |
| **Salesforce Force.com** | **EAV + flex cols**: `MT_Fields` + `MT_Data` z `Value1..ValueN` kolumnami typowanymi; OrgID na każdym rzędzie | Metadata-driven page layouts; formulas = special field type | Bardzo zoptymalizowana (flex cols > pure EAV); pivot index tables | **Borrow**: konceptu "deklaratywna definicja kolumny = metadata row" (ADR-028 już tak robi). **Reject**: Value1..ValueN flex-column hack (Postgres JSONB lepszy dziś). |

### 4.2 Key findings — storage models dla dynamic columns

**Trzy główne modele (per Leapcell, SitePoint, razsamuel.com benchmarks 2024-2025):**

1. **Sparse columns** — wszystkie kolumny w jednej tabeli z dużą liczbą NULL. Tylko sensowne przy <~100 opcjonalnych polach, sztywno zdefiniowanych. Nie skaluje się na multi-tenant custom fields.
2. **EAV (Entity-Attribute-Value)** — klasyczny wzorzec; elastyczny, ale z "eksplozją" rzędów (1 entity × N fields = N rzędów) i wymaga skomplikowanych JOINów. Zaleta: granular locking per-attribute, możliwa bezindeksowa filter-by-value.
3. **JSONB w Postgres** — współczesny default. ~3× mniej storage niż EAV; **GIN index z `@>` operator ~15000× szybszy niż EAV w zapytaniach containment**; 1.3× szybszy nawet z porównywalnymi indeksami. Wady: heavier row locks, brak schema constraints (trzeba walidować w app/triggerach), indeksowanie każdej ścieżki osobno.

**Hybrid JSONB pattern** (najbardziej adoptowany 2024-2026): *core columns* jako native typed columns (PK, FK, tenant_id, status) + *flex columns* jako JSONB. Indeksy ekspresyjne (`CREATE INDEX ... ON t ((jsonb_col->>'field'))`) dla hot-path filtrów.

**Salesforce wybrał EAV z "flex column" twistem** w 2000s (wtedy JSONB nie istniał); dziś równoważny efekt daje JSONB + ekspresyjne indeksy.

### 4.3 Form/validation generation z schema

- **JSON Schema** jako *lingua franca* — Retool JSON Schema Form, RJSF, większość form builderów. Nadaje się do UI layoutu + walidacji.
- **Zod 4** (stable 2025) — runtime validation TypeScript-first. `json-schema-to-zod` (codegen) i `zod-from-json-schema` (runtime) pozwalają generować Zod schemas on-the-fly z JSON stored w DB. Przepływ: `Reference.DeptColumns` → JSON Schema → Zod → React Hook Form + generowany UI.
- **Pattern Dynamic Forms**: fn `generateZodSchema(fieldDefs)` iteruje field definitions, mapuje typ/constraints na Zod primitives, składa `z.object({...})`. Wtedy RHF resolver = `zodResolver(schema)`. Źródło: Medium "Engineering Dynamic Forms" (listopad 2025).

### 4.4 Performance trade-offs dla manufacturing MES (nie generic CRM)

- MES ma **znanych z góry ~69 kolumn** w Main Table plus rzadkie extensions per-org → **core + JSONB hybrid** jest idealny (nie pure EAV, nie pure JSONB).
- 7 departments × tysiące rekordów/mc → joins + filter-heavy workload. Indeksy na `(tenant_id, dept_id, status, created_at)` musi być first-class.
- Workflow state + formulas w `Reference.DeptColumns` wymagają **audit log**. Cascading rules (ADR-029) na zapis → triggery lub app-layer (preferowane dla testability).
- Nie kopiować Notion block monoliticznego modelu — 69 zdefiniowanych cols w Main Table = typed, nie block-based. Notion to CMS/wiki use-case.

### 4.5 Wersjonowanie schematu

- **Reference.DeptColumns** jako *versioned config* — każda zmiana produkuje migration record.
- Backward compat: stare rekordy mają `schema_version`, migrations idempotent (add column z defaultem, never drop w-locie).
- Wzór z Retool/Directus: schema stored as metadata → shipping new version = metadata upsert + optional DDL (dla hot-path cols).
- Lesson z Baserow: jeśli metadata → real DDL, migrations są heavy; dla Monopilot rekomendacja: **metadata + JSONB hybrid, real DDL tylko dla L1 core cols**.

### 4.6 Implications for Monopilot (per ADR-028/029)

**Borrow:**
- **Directus model**: metadata tables (`Reference.DeptColumns`) są prawdziwym source-of-truth, API/forms/validators generowane runtime.
- **Supabase DB-first philosophy**: Postgres to nie implementation detail — to kontrakt. ADR-028 spójne.
- **Salesforce declarative formula field**: formula jako metadata `{type:'formula', expr:'...'}` — nie kod.
- **Zod + json-schema-to-zod**: runtime generation Zod z JSON stored w DB. Jedna definicja → validator + TS types + form.
- **Notion decoupling**: zmiana *typu* kolumny nie niszczy danych istniejących (np. text → select z mapowaniem).

**Reject:**
- Pure EAV (Salesforce-style MT_Data) — Postgres JSONB robi to lepiej dziś.
- Notion block monolith — nie pasuje do sztywno zdefiniowanych 69 kolumn.
- Retool/Appsmith jako platforma — to narzędzia, nie architektura.
- Pure "schema = DDL" (Baserow) — migrations stają się koszmarem przy L3/L4.

**Rekomendowany stack storage dla Main Table:**
```
core cols (69, typed Postgres) + jsonb_ext (L3 custom) + jsonb_private (L4)
+ schema_version INT
+ indexes: (tenant_id, dept_id, status), GIN on jsonb_ext
```

### 4.7 Sources

- Notion — [Exploring Notion's Data Model: A Block-Based Architecture](https://www.notion.com/blog/data-model-behind-notion)
- Notion Eng — [Building and scaling Notion's data lake](https://www.notion.com/blog/building-and-scaling-notions-data-lake)
- Retool Docs — [JSON Schema Form component](https://docs.retool.com/apps/guides/forms-inputs/json-schema-form)
- Salesforce Architects — [Platform Multitenant Architecture](https://architect.salesforce.com/fundamentals/platform-multitenant-architecture)
- Salesforce Force.com Whitepaper — [Multitenancy Architecture PDF](https://www.developerforce.com/media/ForcedotcomBookLibrary/Force.com_Multitenancy_WP_101508.pdf)
- Leapcell — [Storing Dynamic Attributes: Sparse Columns, EAV, and JSONB](https://leapcell.io/blog/storing-dynamic-attributes-sparse-columns-eav-and-jsonb-explained)
- razsamuel.com — [PostgreSQL JSONB vs. EAV for Dynamic Data](https://www.razsamuel.com/postgresql-jsonb-vs-eav-dynamic-data/)
- SitePoint — [PostgreSQL JSONB Performance Guide](https://www.sitepoint.com/postgresql-jsonb-query-performance-indexing/)
- Coussej — [Replacing EAV with JSONB in PostgreSQL](https://coussej.github.io/2016/01/14/Replacing-EAV-with-JSONB-in-PostgreSQL/)
- Superjson — [TypeScript JSON Schema Validation with Zod (2025)](https://superjson.ai/blog/2025-08-25-json-schema-validation-typescript-zod-guide/)
- dmitryrechkin — [json-schema-to-zod](https://github.com/dmitryrechkin/json-schema-to-zod)
- npm — [zod-from-json-schema (runtime)](https://www.npmjs.com/package/zod-from-json-schema)
- Airtable Eng — [How we reduced archive storage 100×](https://medium.com/airtable-eng/how-we-reduced-archive-storage-costs-by-100x-and-saved-millions-21754b5a6c8e)
- Baserow — [NocoDB vs Baserow](https://baserow.io/blog/nocodb-vs-baserow)
- Notion.com — [Formulas 2.0: what's changed](https://www.notion.com/help/guides/new-formulas-whats-changed)

---

## §5 Multi-tenant Patterns

### 5.1 Isolation models

| Model | Isolation | Cost | Upgrade complexity | Compliance fit |
|---|---|---|---|---|
| **Shared DB, shared schema + tenant_id + RLS** | Logical only (RLS enforced) | Najtańszy | Pojedyncza migracja dla wszystkich | Wystarcza dla SOC 2; GDPR OK jeśli dane personal usuwalne per-subject. Nie wystarcza gdy klient żąda "dane NIE mogą dzielić tabel" |
| **Shared DB, schema-per-tenant** | Silniejsza (separate schemas) | Średni | Migracje × N schemas (problem przy 200+) | Lepsza dla klientów regulowanych |
| **DB-per-tenant (silo)** | Maksymalna | Najwyższy (infra + ops) | Każda DB migrowana osobno | Data residency, enterprise, white-label |
| **Hybrid (pool + silo)** | Mixed | Adaptive | Complex tooling needed | Best-of-both — default 2025 |

**Consensus 2025** (Bytebase, WorkOS, Debugg.ai): *Zacznij od shared DB + RLS, przechodź do silo tylko gdy compliance/skala wymaga*. Szczególnie unikaj "shared DB, separate schemas" jako default — łączy wady obu.

**Shopify pod-based model** jako case-study silo w praktyce: każdy "pod" = własny MySQL + Redis + Memcached; niektórzy merchanci mają dedykowany pod. Dobrze skaluje, ale to ops-heavy.

### 5.2 Postgres RLS — best practices 2024-2026

**Core pattern:**
```sql
ALTER TABLE main_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON main_table
  USING (tenant_id = (current_setting('app.current_tenant'))::uuid)
  WITH CHECK (tenant_id = (current_setting('app.current_tenant'))::uuid);
```
Alternatywnie z JWT claim (Supabase): `tenant_id = auth.jwt()->>'tenant_id'`.

**Performance pitfalls (permit.io, Supabase troubleshooting, scottpierce.dev):**
1. **Brak indexu na `tenant_id`** — #1 killer. Złoty wzorzec: composite `(tenant_id, <frequently_filtered>)`.
2. **Non-LEAKPROOF functions w policy** — blokują index usage. Użyj `SECURITY DEFINER` wrapper functions.
3. **RLS chaining** — policy wywołująca subquery do tabeli z własnymi RLS → kaskada evaluacji. Wrap w SECURITY DEFINER function.
4. **Testing z superuser** — RLS bypassowany. Testy MUSZĄ używać app-role connection.
5. **Complex joins w policy** — każdy row wywołuje. Uproszczaj, cache via `initPlan`.

**Monopilot posture**: RLS jako default (L1), ale z app-level `tenant_id` validation jako defense-in-depth. Zawsze `current_setting('app.current_tenant', true)` set per-request.

### 5.3 Schema variation per tenant (ADR-031 alignment)

**Salesforce model:**
- Core universal (sObjects) = L1.
- Custom objects/fields = L3 (metadata rows w MT_Fields/MT_Data, z OrgID).
- Per-tenant page layouts, formulas, validation rules = L2/L3 mix.

**Zendesk "Custom Fields", Segment "Tracking Plans"** pokazują, że *field catalog per tenant* to normalny pattern. Tracking Plans u Segment = *kontrakt* tego, jakie eventy/properties są legalne dla tenanta → walidacja runtime.

**Monopilot L1-L4 mapping (ADR-031):**
- **L1 (core universal)**: 69 kolumn Main Table, core rules (ADR-028/029), podstawowe dept taxonomy z ADR-030. Wszyscy dostają upgrade'y automatycznie (security/perf).
- **L2 (org config)**: wybory między L1 opcjami (dept split/merge per ADR-030, rule flavor v1/v2). Opt-in upgrade.
- **L3 (extensions)**: custom kolumny per org (JSONB slot), custom rules (DSL stored). Tenant owned, upgrade handled per tenant.
- **L4 (org-private)**: completely private schemas/tables per tenant. Full ownership.

### 5.4 Upgrade strategies L1-L4 (opt-in granularity)

**Wzór z Azure Architecture Center + Solly Bombe Medium (2025):**
1. **Canary tenants** (5-10%) → monitor 15-30min → progressive rollout.
2. **Tenant migrations table** — `(tenant_id, component, current_version, target_version, last_run_at)`.
3. **Feature flags** (LaunchDarkly/PostHog/Flagsmith) jako gate — per-tenant targeting.
4. **Opt-in, ale nie permanent opt-out** — max 2-3 major versions back supported.

**Monopilot konkrety:**
- **L1 upgrades** = global, automatic, rolling (canary → 10% → 50% → 100% w ciągu 2-4 tygodni).
- **L2 upgrades** = opt-in per tenant, UI wizard "migrate to rules engine v2". Dual-run obu wersji N miesięcy.
- **L3 upgrades** = tenant-initiated (ich własne custom rules/columns). Monopilot dostarcza tooling (CLI, migrations runner) ale nie wymusza.
- **L4** = full tenant ownership, Monopilot nie touch.

**Feature flag stack zalecany:** PostHog (tańszy, self-hostable, built-in analytics) dla early Monopilot; LaunchDarkly gdy enterprise targeting potrzebne.

### 5.5 Admin tooling (impersonation, cross-tenant analytics)

- **Impersonation** = explicit flag w session (`impersonating_as`) + audit log każdej operacji. Nigdy nie pozwalaj RLS bypass ciche.
- **Cross-tenant analytics** — *drugi* schemat (analytics/warehouse) zbudowany z denormalized snapshots; nigdy query prod RLS bypass. Supabase + dbt / Notion data-lake pattern.
- **Tenant switcher** UI — tylko dla superadminów z MFA, logowane do SIEM.

### 5.6 Audit / compliance

- **SOC 2** — kontrolki pokrywające: access control, encryption at rest/in-transit, audit logging (append-only), change management dla schema migrations, incident response.
- **GDPR** — personal data catalog (wiedzieć co/gdzie); right-to-erasure = funkcja `delete_subject(subject_id)` na wszystkich tabelach zawierających PII; data residency (multi-region) gdy klient EU-only.
- **Data residency** w shared-pool jest trudne — wymusza minimum schema-per-tenant albo region-per-tenant cluster. Dla Forza (EU) — EU-only Postgres cluster default.

### 5.7 Billing / metering

- Per-tenant usage: event-sourced `usage_events(tenant_id, metric, value, ts)` → aggregate.
- Feature tiers = feature flag platform (LaunchDarkly "Entitlements" pattern).
- Unikaj liczenia w głównych tabelach — osobny pipeline (Kafka/PostHog).

### 5.8 Case studies summary

- **Salesforce Force.com**: shared DB, shared schema EAV-flex-cols + OrgID RLS-equivalent; ~22 lata produkcji.
- **Shopify Plus**: pod-based silo, merchant-level isolation dla performance, MySQL sharded.
- **GitHub Enterprise Cloud**: per-org schema isolation + dedicated data plane opcja.
- **Segment Tracking Plans**: tenant = own contract; validation runtime rejects non-conforming.
- **Notion**: shared Postgres, block-based, dorobione data-lake dla analytics.

### 5.9 Implications for Monopilot

**Rekomendacje:**
1. **Default isolation**: shared DB + RLS + `tenant_id`. Forza = pool tenant. Enterprise later = silo option.
2. **RLS policies** z composite indeksami `(tenant_id, dept_id, status, ...)`. Benchmark od day-1.
3. **Tenant context**: `app.current_tenant` per request, set by middleware przed każdym query.
4. **L1 upgrades** = canary + rolling (2-4 tyg), monitored. L2/L3 = opt-in, tenant migration table.
5. **Feature flags**: PostHog self-host dla Monopilot (już fits budget/simplicity).
6. **Audit log**: append-only `audit_events` tabela per row change (triggers OR event sourcing — ADR-029 rule engine prawdopodobnie event-sourced naturalnie).
7. **Data residency**: EU cluster dla Forza + wszystkich EU klientów. US cluster gdy pojawi się USA customer. Global control plane + regional data planes.
8. **Nigdy superuser w app-path**. Tests z app-role.

### 5.10 Sources

- Bytebase — [Multi-Tenant Database Architecture Patterns Explained](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/)
- Bytebase — [PostgreSQL RLS Limitations and Alternatives](https://www.bytebase.com/blog/postgres-row-level-security-limitations-and-alternatives/)
- Bytebase — [Common Postgres RLS Footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/)
- Supabase Docs — [RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- Supabase — [Row Level Security Guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Permit.io — [Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide)
- Scott Pierce — [Optimizing Postgres RLS Performance](https://scottpierce.dev/posts/optimizing-postgres-rls/)
- Debugg.ai — [Postgres Multitenancy Playbook 2025](https://debugg.ai/resources/postgres-multitenancy-rls-vs-schemas-vs-separate-dbs-performance-isolation-migration-playbook-2025)
- AWS — [RLS recommendations for SaaS Postgres](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html)
- WorkOS — [Developer's guide to SaaS multi-tenant architecture](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- Microsoft Azure — [Considerations for Updating a Multitenant Solution](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/updates)
- Solly Bombe — [Schema Migrations Across Tenants 2025](https://sollybombe.medium.com/how-to-handle-schema-migrations-safely-across-tenants-in-multi-tenant-saas-2025-edition-0c4e4fb3103b)
- Konfirmity — [SOC 2 Multi-Region Architectures](https://www.konfirmity.com/blog/soc-2-multi-region-architectures)
- Askantech — [Multi-Tenant SaaS Isolation, Scale, Compliance](https://www.askantech.com/multi-tenant-saas-architecture-isolation-scale-compliance/)
- USENIX SREcon — [Scaling Shopify's Multi-Tenant Architecture](https://www.usenix.org/conference/srecon16europe/program/presentation/weingarten)
- Educative — [Inside Shopify's multi-tenant platform during BFCM](https://www.educative.io/newsletter/system-design/inside-shopifys-multi-tenant-platform-during-bfcm)
- PostHog — [Feature Flags Docs](https://posthog.com/docs/feature-flags)
- LaunchDarkly — [Flags for modern software delivery](https://launchdarkly.com/features/feature-flags/)
- Hasura — [Multi-tenancy how-to with Hasura](https://hasura.io/blog/multi-tenancy-history-quick-take-and-how-to-with-hasura)
- PropelAuth — [Multi-Tenant GraphQL APIs with PostGraphile + RLS](https://www.propelauth.com/post/instant-multi-tenant-graphql-apis-with-postgraphile-rls-and-propelauth)

---

## §6 AI/ML in Food-mfg MES

Obszar AI/ML w MES dojrzewa bardzo nierównomiernie — niektóre use-case'y są już table-stakes (demand forecasting z Prophet/SARIMA, vision-based QA), inne pozostają w fazie badawczej (transformer RUL, LLM SOP-agenci). Rynek AI in manufacturing prognozowany jest na wzrost z $8.57B (2025) do $287B (2035), co oznacza **42% CAGR** — oznacza to że decyzje architektoniczne podjęte teraz muszą być "AI-ready" (schema w DB z polami na model predictions, feature store-friendly event log, webhook/queue do inference endpointów).

### 6.1 Use cases matrix

| Use case | Maturity 2026 | Monopilot fit | Implementation path |
|---|---|---|---|
| **Demand forecasting SKU-level** | Production-grade (Prophet, SARIMA, N-BEATS; 20-50% błędu ↓, 30% stock ↓) | Wysoki — 04/07-PLANNING już generuje długoterminowy plan | Phase 2: Prophet MVP → Phase 3: TimeGPT / Chronos foundation models |
| **Yield optimization (MILP recipe blending)** | Production-grade (Gurobi/HiGHS/OR-Tools; Dassault DELMIA ma gotowe) | Średni — 01-NPD (BOM) + 08-PRODUCTION (actuals) | Phase 3: OR-Tools CBC solver w Python service; constraint: allergens, cost, nutrition targets |
| **Vision QA (defects, foreign material)** | Production-grade — **82% dyrektorów food safety** inwestowało w autonomous visual inspection jako #1 priorytet 2025 | Niski w P1 (kamery IP na linii) — potencjał dla 09-QUALITY Phase 4 | Edge inference (NVIDIA Jetson / Intel Movidius), integracja przez MQTT/REST z reject log → EPCIS event |
| **Predictive maintenance (vibration RUL)** | Emerging — LSTM-autoencoder + Transformer encoder hybrids publikowane w 2024-2025 (Sensors MDPI, Nature Scientific Reports) | Średni — 13-MAINTENANCE + 15-OEE | Phase 3: IoT sensors → TimescaleDB → LSTM model served via BentoML/MLflow |
| **Allergen cross-contamination risk** | Novel — brak gotowych produktów; mix rule-based + ML feature importance | Wysoki (Forza: multi-level cascade RM→PR_step→FA) | Hybrid: deterministic cascade (rule) + anomaly detector (isolation forest) na event log "shared equipment without sanitation" |
| **LLM copilot (SOP authoring, troubleshooting)** | Emerging — SOP-Bench (arXiv 2506.08119) używa Claude 3.5 Sonnet; Microsoft 365 Copilot dodał Claude (IX.2025) | Wysoki — 03-TECHNICAL SOP generation z BOM+process | Retrieval-augmented (RAG) nad BOM+spec+regulatory corpus; function-calling agent dla "ask-to-fix" scenariuszy |
| **Metal detector FP reduction** | Research-to-production | Niski P1 | Out-of-scope; rekomendacja partner-vendor (Mettler-Toledo, KPM SiftAI) |

### 6.2 Key findings

- **Foundation models** (TimeGPT, Chronos, Moirai) stają się atrakcyjną alternatywą dla Prophet/SARIMA gdy SKU count > 10k i cold-start jest problemem (nowe produkty, sezonowe SKU). Zero-shot forecasting działa zaskakująco dobrze dla FMCG-food patterns (weekly seasonality, holiday spikes).
- **Vision inspection** — realna przewaga AI nad X-ray/metal detectors w detekcji **defektów organicznych** (fragmenty roślin, owady), których metal detector nie widzi. KPM SiftAI FM jest przykładem komplementarnego systemu — nie zastępuje, uzupełnia.
- **Hybrid LSTM + Transformer** to dominujący pattern 2025 dla RUL — LSTM-autoencoder detektuje anomalie, Transformer-encoder robi long-range RUL estimation. Ważne: **osobny model per klasa urządzeń** (pompy, motory, przenośniki) > jeden generyczny.
- **LLM w MES** — największa wartość w **Level 0** (dokumentacja, SOP, troubleshooting chat) i **Level 1** (classification, extraction z PDF-regulacji). **Level 2** (autonomous agent wykonujący akcje na MES) jest ryzykowny — audit trail, rollback, safety interlock nieoptymalne.
- **MLOps stack 2026:** MLflow (model registry) + BentoML/Modal (serving) + Feast (feature store) + Weights & Biases (experiment tracking). **Replicate / Modal** dla ad-hoc inference bez własnego GPU — bardzo atrakcyjne dla SMB/mid-market.

### 6.3 Implications (per moduł Monopilot)

- **01-NPD:** schema musi trzymać "predicted yield %" i "predicted shelf-life" jako osobne pola (obok spec/target). LLM-assisted SOP authoring — przycisk "Draft SOP from BOM" w UI, wywołujący RAG nad existing SOPs + current BOM.
- **09-QUALITY:** event table musi być "AI-ready" — structured fields (defect_class, confidence_score, image_url, model_version, reviewed_by_human) od dnia 1. Bez tego retraining jest bolesny.
- **13-MAINTENANCE:** time-series storage (TimescaleDB hypertable lub dedicated InfluxDB) dla sensor data; separowany od OLTP schema. Predicted_failure_date + confidence_interval jako osobne pole w work_order.
- **15-OEE:** anomaly detection na rolling window (cel: wczesne wykrycie downtrendu OEE przed manager-alertem). Prosty model (EWMA + std-dev gates) wystarczy jako MVP.

### 6.4 Sources

- [AI Demand Forecasting in 2025: Trends and Use Cases (InData Labs)](https://indatalabs.com/blog/ai-demand-forecasting)
- [Guide to AI Demand Planning for Food Businesses (OrderGrid)](https://www.ordergrid.com/blog/master-resource-a-complete-guide-to-ai-demand-planning-how-food-businesses-of-all-sizes-benefit)
- [AI on the line: AI transforming vision inspection tech (FoodBev Media)](https://www.foodbev.com/news/ai-on-the-line-how-ai-is-transforming-vision-inspection-technologies)
- [SiftAI FM Vision-Based Foreign Material Detection (KPM Analytics)](https://www.kpmanalytics.com/products/vision/siftai-foreign-material-detection-system)
- [Condition Monitoring + Predictive Maintenance with LSTM-Autoencoders + Transformer Encoders (Sensors MDPI 2024)](https://www.mdpi.com/1424-8220/24/10/3215)
- [Deep learning models comparison for predictive maintenance (Nature Sci Reports 2025)](https://www.nature.com/articles/s41598-025-08515-z)
- [SOP-Bench: Complex Industrial SOPs for LLM Agents (arXiv 2506.08119)](https://arxiv.org/html/2506.08119v1)
- [LLM-Based Copilot for Manufacturing Equipment Selection (arXiv 2412.13774)](https://arxiv.org/html/2412.13774v1)
- [Master Recipe & Blending Optimization (Dassault Systèmes DELMIA)](https://discover.3ds.com/blending-optimization-food-manufacturing)
- [Food Manufacturing MILP example (Gurobi)](https://www.gurobi.com/jupyter_models/food-manufacturing/)

---

## §7 Mobile UX for Industrial Scanners

Moduł 06-SCANNER-P1 jest operational-critical dla Forza — to tam pracownicy linii/magazynu spędzają 100% zmiany. Zła UX = odrzucenie systemu. Rynek industrial handheld skonsolidował się wokół **Zebra (~50% share), Honeywell (~25%), Datalogic (~10%)** — wszyscy na Androidzie, wszyscy wspierają webview/PWA.

### 7.1 Hardware capability matrix

| Device | Scanner engine | RAM/Storage | Drop/IP | Display | Wi-Fi | Battery | Best for |
|---|---|---|---|---|---|---|---|
| **Zebra TC53** | SE4720 (standard) lub SE55 IntelliFocus (long-range) | 4/64 GB | 6ft / IP65,IP68 | 6" FHD | Wi-Fi 6E | 4680 mAh removable | All-purpose retail/warehouse, inventory audits |
| **Zebra TC73** (ultra-rugged) | SE4770 ultra-performance | do 8/128 GB + 2TB microSD | **10ft** / IP65,IP68 + 2000 tumbles | 6" FHD | Wi-Fi 6E + **5G / CBRS** | High-volume picking, cross-docking, yards |
| **Honeywell CT45 / CT45 XP** | N6703 (N3601 opcja) | 4/64 GB (XP: 6/64) | 6ft (boot: 8ft) / IP65,IP68 | 5" HD | Wi-Fi 6 | Swappable | Front-line retail/logistics, mid-tier cost |
| **Honeywell CT60** (Mobility Edge) | N6703SR | 3-4/32 GB | 8ft / IP65,IP68 | 4.7" HD | Wi-Fi 6 | Removable | Legacy enterprise fleet (upgradable 5+ lat firmware) |
| **Datalogic Memor 11** | 2D imager + opt. RFID UHF | 4/64 GB | 5ft / IP65 | 5" HD | Wi-Fi 6 | Swappable | Retail/healthcare, lżejszy niż Zebra |

**Uwagi:**
- Wszystkie urządzenia wspierają Chrome/WebView — **PWA jest realną opcją** (nie tylko native Android).
- Scan trigger to hardware button → Android KeyEvent (Zebra: DataWedge intent; Honeywell: Intent + Honeywell AIDC Android service; Datalogic: SDK Intent). **PWA dostaje scan przez keyboard wedge emulation** — działa out-of-the-box, ale traci access do raw image / OCR / multi-code batch.

### 7.2 UX patterns

**Scan-first flow.** Dominujący paradygmat: user nie nawiguje po aplikacji — *skanuje*, a system decyduje co zrobić. Przykład: scan GTIN → jeśli nieznany RM → show "Create RM?" modal; jeśli open WO wymaga tego RM → auto-route do "Confirm pick". Oszczędność: ~40% czasu transakcji vs menu-driven.

**Offline-first architecture.**
- **Service Worker** — cache app shell + read-mostly reference data (master data: GTIN lookup, locations, product catalog).
- **IndexedDB** — write-queue dla transakcji (pick/put/move/count). Struktura: `syncQueue` store z polami `{id, type, payload, timestamp, retryCount, status}`.
- **Conflict resolution** — dla scanner ops rekomendacja: **server-authoritative z optimistic UI**. CRDT (Yjs, Automerge) jest overkill dla pick-confirm — LWW timestamp wystarczy. CRDT ma sens tylko dla "shared state editing" (np. dwóch operatorów edytuje ten sam count sheet).
- **Sync queue visualization** — dedykowana ikona statusu w app shell (dom/chmurka + liczba pending). UX debt jeśli nie ma.

**Glove-friendly & sunlight readability.**
- **Touch target: min 48×48dp** (Google Material), rekomendacja Monopilot: **56-64dp** na primary actions (confirm, scan-fallback). W rękawicach zimowych Google Design for Driving sugeruje nawet 76dp.
- Spacing między targetami: **≥8dp** (rekomendacja: 12-16dp).
- Kontrast: AAA (7:1) dla outdoor/warehouse — WCAG AA 4.5:1 jest za mało przy 50k lux.
- Haptics: krótki pulse na scan-OK, długi double-pulse na scan-error. Audio opcjonalny (w hali hałas).

**Barcode/RFID w food:**
- **GS1-128** (EAN-128) z AI:
  - `(01)` GTIN-14 — trade item
  - `(10)` BATCH/LOT — kluczowy dla FSMA 204 TLC
  - `(17)` BEST BEFORE date (YYMMDD)
  - `(21)` SERIAL
  - `(37)` COUNT of trade items
  - `(310n)` NET WEIGHT kg (n=decimal)
- **2D DataMatrix** — rośnie na primary packaging (place-of-origin, catch weights dla drobiu/mięsa).
- **RFID UHF Gen2** — wartościowe dla pallet-level (MoveWithoutScan), drogie dla case/item-level w food (tags ~$0.08 vs margines produktu).

**Auth na współdzielonych device'ach:**
- **NFC badge tap** to standard w PL food plants (Mifare Classic / DESFire). Auto-logout po 30-60s bezczynności.
- **Short PIN** (4-6 cyfr) jako fallback. Nigdy password z klawiatury.
- **Shift-handoff**: scroll "Swap user" przycisk zawsze widoczny, 1-tap.

**Accessibility / multi-language.**
- **TTS voice confirmation** — hands-busy scenarios (operator w rękawicach trzyma produkt w obu rękach, system mówi "pick 12 units of RM-4521"). Android TTS natywny, PL/EN/UK/RO all supported.
- **i18n**: minimum **pl, en, uk, ro** dla PL food plants (Forza realnie ma UA+RO workers). ICU MessageFormat, nie string concat.

### 7.3 Implications for 06-SCANNER-P1

1. **PWA jako P1, native wrapper jako P2.** Start od PWA (Next.js + next-pwa / Workbox), deploy na TC5x/CT45 przez Chrome. Jeśli potrzebny raw camera / offline tesseract OCR / DataWedge deep integration → Capacitor wrapper Phase 2.
2. **Schema events: append-only, monotonic timestamp, user_id, device_id, app_version.** Bez tego debug offline-sync conflicts jest piekłem.
3. **Scan-first routing engine** (osobny serwis / hook): scanned_code → type detection (GTIN/SSCC/internal) → context lookup (open WOs, current location) → target screen. Testowalne jednostkowo, niezależne od UI.
4. **GS1 AI parser** jako biblioteka wspólna (backend + frontend) — nie ad-hoc regex. Rekomendacja: `@gs1/barcode-parser` lub własna implementacja zgodna z GS1 General Specs 24.0.
5. **Feature detection:** PWA musi wiedzieć czy leci na TC53 (SE4720) vs TC73 (SE4770) vs web-browser-fallback. DataWedge może nadawać custom User-Agent → routing do optymalnego trigger mode.
6. **Battery telemetry** — scanner device battery level → server (przez Workbox background sync), żeby IT widziało "Unit #42 battery 12%, needs swap".

### 7.4 Sources

- [Zebra TC53 product page](https://www.zebra.com/us/en/products/mobile-computers/handheld/tc5x-series/tc53.html)
- [Zebra TC73/TC78 spec sheet](https://www.zebra.com/us/en/products/spec-sheets/mobile-computers/handheld/tc73-tc78.html)
- [Honeywell CT45 / CT45 XP product page](https://automation.honeywell.com/us/en/products/productivity-solutions/mobile-computers/handheld-computers/ct45-ct45-xp-mobile-computer)
- [Honeywell Dolphin CT60 product page](https://automation.honeywell.com/us/en/products/productivity-solutions/mobile-computers/handheld-computers/dolphin-ct60-handheld-computer)
- [GS1 Application Identifiers reference](https://ref.gs1.org/ai/)
- [GS1-128 Application Identifiers explained (Commport)](https://www.commport.com/gs1-application-identifiers/)
- [Offline data (web.dev PWA Learn)](https://web.dev/learn/pwa/offline-data)
- [Background Sync for PWA (Microsoft Edge docs)](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs)
- [All accessible touch target sizes (LogRocket)](https://blog.logrocket.com/ux-design/all-accessible-touch-target-sizes/)
- [Target Size and 2.5.5 (Adrian Roselli / WCAG)](https://adrianroselli.com/2019/06/target-size-and-2-5-5.html)

---

## §8 Supply Chain & Procurement Trends

Procurement & supply-chain w food-mfg 2024-2026 jest napędzany przez trzy równoległe siły: **regulacje** (FSMA 204, EUDR, ViDA), **technologie** (API-first EDI, AI control towers) i **geopolitykę** (tier-2/3 visibility po COVID + sankcjach). Dla Monopilot (SMB/mid-market, food) większość enterprise-grade control towerów (o9, Kinaxis, Blue Yonder) jest nieosiągalna cenowo — fokus na light-weight, standards-based integration.

### 8.1 Trends overview

**Regulacje — hard deadlines:**
- **FSMA 204 (USA):** Critical Tracking Events (CTEs) + Key Data Elements (KDEs) + Traceability Lot Codes (TLCs) dla produktów z Food Traceability List (liście kilkaset kategorii — sery, owoce sw., vege, seafood, deli). **Enforcement data przesunięta: Congress directed FDA not to enforce before July 20, 2028** (Continuing Appropriations Act 2026). Mimo opóźnienia — US retailers (Walmart, Kroger) wymagają już teraz od dostawców.
- **EUDR (EU):** przesunięta (po raz drugi) na **30 grudnia 2026**. 9 commodities: beef, cocoa, coffee, leather, palm oil, pulp/paper, rubber, **soy**, timber. Soy & palm oil bezpośrednio dotykają food-mfg. Due Diligence Statement (DDS) w EU TRACES system. SME mają uproszczenia (bez full DDS), ale wciąż deforestation-free evidence wymagane. Simplification review przez KE do 30 kwietnia 2026.
- **EU ViDA (VAT in the Digital Age):** **1 lipca 2030** — wszystkie intra-EU B2B/B2G invoices jako structured e-invoice w EN-16931 przez **Peppol**. Belgium już od **1 stycznia 2026** mandatory B2B e-invoicing. Polska KSeF — opóźniony, ale kierunek niezmienny.

**EDI evolution:**
- Klasyczny EDIFACT/X12 **nie umiera** (retail giants w USA, pharma, automotive) — ale **nie rośnie**. API-first suppliers (JSON over REST/GraphQL) dominują dla new integrations.
- AS2/SFTP file-drop pozostaje w enterprise supply chains; **webhook + REST** to default dla SMB food suppliers.
- **Peppol** ≠ tylko e-invoicing — to standardized B2B document exchange framework (orders, despatch advice, invoices). Rośnie jako "common pipe" w EU.

**Procurement automation:**
- **AI-native platforms** — Jaggaer JAI (Digital Mind), Coupa Navi, Ariba Joule — agentic AI dla auto-approval, three-way match, anomaly detection na invoices. Mid-market: Proactis, Precoro, Kissflow.
- **Three-way match** (PO vs GR vs invoice) jest minimum viable automation — ROI mierzalny w 6 miesięcy.
- **Contract lifecycle management (CLM)** — Icertis, DocuSign CLM; dla SMB out-of-scope, rekomendacja light-weight (Notion / SharePoint + pre-approved clause library).

**Traceability upstream:**
- **GS1 EPCIS 2.0** — kluczowy standard. JSON-LD payloads + Web API, replacing XML. Event model: what/when/where/why/how. GS1 US wydało dedykowaną rekomendację dla FSMA 204 CTEs (mapping KDE → EPCIS event fields).
- **Verifiable Credentials + EPCIS** — emerging pattern dla tamper-evident traceability (GS1 white paper 2025).
- **Supplier scorecards** — min. required fields: on-time delivery %, quality RFT %, non-conformances count, allergen-audit status, deforestation-DDS status.

**Control towers:**
- Nucleus Research 2025 Value Matrix: **Blue Yonder, E2open, Infor Nexus, Kinaxis, o9** jako leaders. Wszyscy z AI agents 2025+.
- Dla mid-market food-mfg (Forza-scale): **Infor Nexus** lub **Kinaxis** najbardziej skalowalne cenowo; alternatywnie własne dashboarding na top MES events (Monopilot MVP path).

### 8.2 Minimum viable procurement for food-mfg SMB

Zestaw **must-have** dla Monopilot-scale food-mfg klienta (obok core MES):

1. **Supplier master** — GLN-addressable entities, certifikaty (BRC, IFS, ISO 22000, HACCP, kosher/halal), allergen profile per supplier.
2. **Purchase order workflow** — multi-level approval (value-based), 3-way match ready.
3. **ASN / Despatch Advice receipt** — EDI 856 (ANSI X12) lub EDIFACT DESADV albo Peppol ASN equivalent. Scanner-enabled GR na TC5x.
4. **Lot-level traceability inbound** — KDE captured at receiving: supplier_lot, mfg_date, best_before, GTIN, weight, temp log (cold chain). Mapowane na internal lot_code 1:1.
5. **Supplier portal (light)** — self-service upload certyfikatów, view open POs, ACK/reject, non-conformance response. Nie musi być własna platforma — Peppol access point + dedicated portal strona wystarczy P1.
6. **E-invoicing (Peppol-ready)** — od dnia 1 struktura XML UBL 2.1 / EN-16931, nawet jeśli legacy PDF nadal wysyłany.
7. **EUDR due-diligence capture** dla soy/palm/cocoa (jeśli w BOM) — geolocation plots, harvest date, DDS reference number.
8. **FSMA 204 export bundle** — na request (audit lub recall) generate CSV/JSON zgodny z GS1 EPCIS mapping: CTE events + KDE fields + TLC, ostatnie 24 miesiące.

**Out-of-scope P1 (ale schema-ready):** TCO analytics, category spend cubes, supplier risk scoring ML, CLM.

### 8.3 Implications for 11-SHIPPING + future procurement module

- **11-SHIPPING** musi wystawiać **EPCIS 2.0 "shipping" event** (ObjectEvent: bizStep=shipping) z polami: `epcList`, `bizLocation`, `readPoint`, `bizTransactionList` (PO/ASN), `quantityList` (catch-weight). JSON-LD format jako default.
- **ASN generation** po packing/palletizing — automatyczne z pack hierarchy (SSCC pallet → GTIN+batch case → unit). GS1-128 etykieta logistyczna zgodna z GS1 General Specs.
- **E-invoice hook** — po shipping confirm, webhook do invoicing service (Peppol access point SaaS: Storecove, Pagero, Tradeshift — lub on-prem Phase 2).
- **Future procurement module (Phase 3):** schema z `supplier`, `purchase_order`, `goods_receipt`, `non_conformance`, `supplier_certificate`, `supplier_scorecard_metric`. Multi-tenant — supplier może być shared entity między tenantami (GLN-indexed global dict) lub tenant-private.
- **EUDR hook** — jeśli FA zawiera commodity z EUDR list, require `supplier_dds_reference` field na PO line przed GR confirm.

### 8.4 Sources

- [FSMA Final Rule: Additional Traceability Records (FDA)](https://www.fda.gov/food/food-safety-modernization-act-fsma/fsma-final-rule-requirements-additional-traceability-records-certain-foods)
- [FSMA 204 Compliance Date Extension (Federal Register 2025)](https://www.federalregister.gov/documents/2025/08/07/2025-14967/requirements-for-additional-traceability-records-for-certain-foods-compliance-date-extension)
- [Food Traceability List (FDA)](https://www.fda.gov/food/food-safety-modernization-act-fsma/food-traceability-list)
- [GS1 US EPCIS Recommendations for FSMA 204 CTEs (PDF)](https://documents.gs1us.org/adobe/assets/deliver/urn:aaid:aem:0c934e38-7cd7-4a86-aac3-c54b4c9ef293/EPCIS-Recommendations-FSMA-204-Critical-Tracking-Events.pdf)
- [EPCIS & CBV standard (GS1)](https://www.gs1.org/standards/epcis)
- [EU Regulation on Deforestation-free products (EC Environment)](https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en)
- [EUDR 2026 outlook (Mayer Brown)](https://www.mayerbrown.com/en/insights/publications/2026/02/eu-regulation-on-deforestation-free-products-eudr-what-lies-ahead-in-2026)
- [E-Invoicing Europe 2025-2027 mandate guide (Novutech)](https://www.novutech.com/news/e-invoicing-in-europe-overview-of-mandates-2025-2027)
- [EU ViDA Digital Reporting Requirements July 2030 (VATCalc)](https://www.vatcalc.com/eu/eu-2028-digital-reporting-requirements-drr-e-invoice/)
- [Nucleus Research 2025 Control Tower Value Matrix](https://nucleusresearch.com/research/single/control-tower-technology-value-matrix-2025/)
- [Top 10 Procure-to-Pay Platforms (Procurement Magazine)](https://procurementmag.com/top10/top-10-procure-to-pay-platforms)
- [Verifiable Credentials + EPCIS end-to-end traceability (GS1 white paper)](https://gs1.github.io/EndToEndTraceability/GS1-WhitePaper-VerifiableCredentials-EPCIS-end-to-end-traceability.pdf)

---

## §9 Cross-cutting Recommendations (per-module rollup)

Zkonsolidowane rekomendacje per moduł — każdy bullet ma cross-ref do source §. Używać jako checklistę w PRD rewrite.

### 00-FOUNDATION

- **Storage model** [§4.2, §4.6]: hybrid core + JSONB. Main Table = 69 typed cols + `ext_jsonb` (L3 custom) + `private_jsonb` (L4) + `schema_version`. Indexes: `(tenant_id, dept_id, status, created_at)` + GIN on `jsonb_ext`.
- **Reference.DeptColumns** [§4.6] jako versioned metadata = source of truth dla Admin UI wizard (ADR-028). Metadata + JSONB default; real DDL tylko dla L1 hot-path cols.
- **Zod runtime** [§4.3]: generuj validators z DeptColumns per request via `zod-from-json-schema`. Cache in-memory LRU per `schema_version`. Jedna definicja → validator + TS types + form.
- **Event-first (outbox)** [§1, §3, §6]: append-only `outbox_events` w Postgres + worker publikujący do Azure Service Bus / SQS / RabbitMQ. Event shape ISA-95-compatible (`tenant/site/area/line/event`). Daje D365 integration + audit log + przyszły MQTT bridge + feature store dla ML + EPCIS traceability.
- **RLS baseline** [§5.2, §5.9]: `tenant_id UUID NOT NULL` na każdej tabeli biznesowej; policy USING + WITH CHECK; `SECURITY DEFINER` wrappers dla złożonych checks; composite indeksy. Testy z app-role (nigdy superuser).
- **Schema "AI-ready + traceability-ready"** [§6.3, §8.3]: każda kluczowa encja (`lot`, `work_order`, `quality_event`, `maintenance_event`, `shipment`) ma: stabilny `external_id`/`uuid`, monotonic `created_at`, `created_by_user`, `created_by_device`, `app_version`, `tenant_id`, `model_prediction_id` (nullable, hook dla ML), `epcis_event_id` (nullable, hook dla traceability). Dodanie tych pól później = migration hell.
- **i18n** [§7.2]: multi-language od dnia 1 (pl/en/uk/ro baseline). ICU MessageFormat, locale-aware date/number, RTL-ready. Retrofit blokuje go-live z doświadczenia.
- **Audit log** [§5.9]: append-only `audit_events` (wypada naturalnie z rule engine event-sourced ADR-029).

### 01-NPD

- **Allergen model first-class** [§2]: 14 alergenów EU FIC jako enum (ADR-028 schema-driven), plus `may_contain[]` (cross-contamination). BOM item dziedziczy alergeny z components + manual override + change history. **Multi-level cascade** RM → PR_step → FA (kluczowe dla Forza, Phase D decision #16).
- **QUID + nutrition autocalc** [§2]: z recipe (suma weighted nutrients). Label preview WYSIWYG.
- **Recipe versioning + approval workflow** [§2]: quality sign-off przed release to production.
- **GS1 GTIN assignment** [§8]: GTIN dla każdego SKU, SSCC dla palety, GLN dla lokalizacji. Internal code może żyć obok.
- **Predicted yield% + shelf-life fields** [§6.3]: schema-ready dla ML even jeśli P1 nie ma modelu.
- **LLM SOP authoring (Phase 2)** [§6.1, §6.3]: przycisk "Draft SOP from BOM" w UI, RAG nad existing SOPs + current BOM + regulatory corpus. Human-approved output.
- **Brief → NPD integration** [Phase D decision #13]: Brief = pierwszy ekran 01-NPD. Import z Excel templates (brief 1/2) → native after.
- **D365 Builder out** [§3]: N+1 products per FA (każdy process step = osobny D365 product), OP=10 always. Osobny `@monopilot/d365-adapter`.

### 02-SETTINGS

- **Admin UI wizard (ADR-028)** [§4.6]: UI generuje JSON Schema → zapis do Reference.DeptColumns; nie modyfikuje DDL (wyjątek: L1 promotions via controlled migration).
- **Rules wizard (ADR-029)** [§1, §2]: DSL editor + Mermaid preview + dry-run na sample data + version history + diff. Przykład rules: allergen changeover gate, CCP out-of-spec escalation, cascading cell fill.
- **Tenant settings L2** [§5.3]: opcje między L1 wariantami (dept split/merge per ADR-030, rule engine v1/v2 per ADR-031).
- **Feature flags view** [§5.4]: co tenant ma enabled; "migrate to L2 v2" button z preview diff. PostHog self-host.

### 03-TECHNICAL

- **Digital SOPs z versionowaniem** [§2]: link do training records (BRCGS v9 "training and competence"). Signed-off SOPs są audit evidence.
- **LLM copilot** [§6.1]: troubleshooting Q&A over SOPs + regulatory corpus (Level 0/1 use). Function-calling agent TYLKO Phase 3+ (Level 2 ryzykowny).

### 04-PLANNING-BASIC / 07-PLANNING-EXT

- **Finite-capacity scheduling** [§3]: integracja z D365 SO jako trigger. **Allergen-aware sequencing** — group by allergen family to minimize changeovers (minimalizuje cleaning time, §2).
- **Demand forecasting (Phase 2+)** [§6.1]: Prophet MVP → TimeGPT/Chronos foundation models gdy SKU count > 10k. Zero-shot forecasting dobry dla food seasonality.
- **Meat_Pct multi-comp** [Phase D decision #14]: zostaje w Planning, multi-comp agregacja comma-sep.

### 05-WAREHOUSE

- **FEFO enforcement** [§2] w directed picking. Shortest expiry first.
- **Lot status** [§2]: released/hold/rejected/expired/quarantine. Immutable transitions.
- **Batch genealogy** [§2]: forward+backward queries w <2s (BRCGS wymaga <4h dla recall drill — digital sekundy).
- **GR przez scanner** [§7, §8]: KDE captured at receiving (supplier_lot, mfg_date, best_before, GTIN, weight, temp log). Mapowane 1:1 na internal `lot_code`.

### 06-SCANNER-P1

- **PWA P1, Capacitor P2** [§7.3]: PWA pokryje ~90% use-case'ów (Workbox Background Sync + IndexedDB queue + DataWedge keyboard-wedge). Capacitor tylko dla raw camera / BLE sled / persistent background.
- **Scan-first routing engine** [§7.2, §7.3]: osobny serwis — scanned_code → type detection (GTIN/SSCC/internal) → context lookup (open WOs, current location) → target screen. Unit-testowalne.
- **GS1 AI parser** [§7.3, §7.2]: shared lib backend+frontend (parser AI 01/10/17/21/37/310n). Nie ad-hoc regex.
- **Idempotent mutations** [§8 cross-cutting]: client-generated `transaction_id` (UUID v7 time-ordered), deterministic response na replay.
- **Offline-first** [§7.2]: Service Worker + IndexedDB sync queue, server-authoritative + LWW (CRDT overkill dla pick-confirm). Sync queue status icon w app shell.
- **UX** [§7.2]: touch target 56-64dp (primary actions), spacing ≥12dp, kontrast AAA outdoor/warehouse. Haptics + optional audio. NFC badge auth + short PIN fallback. Auto-logout 30-60s.
- **Device telemetry** [§7.3]: battery, Wi-Fi RSSI, crash rate, scan fail rate, sync queue depth → central observability.

### 08-PRODUCTION (WO execution)

- **WO execution z line changeover gate** [§2]: allergen-aware cleaning validation (jeśli poprzednie WO = allergen X, następne = "free-from X" → cleaning checklist + ATP swab result + dual sign-off). Rule engine DSL.
- **Operator sign-off + digital signatures** [§2]: BRCGS-ready audit trail.
- **Real-time status events** [§1]: → dashboards (15-OEE) + D365 push (§3).
- **Closed_Production strict all-must-complete** [Phase D decision #17].

### 09-QUALITY

- **CCP runtime z IoT ingestion** [§2]: rule engine DSL ("IF temperature > 4°C for 15min AT ccp_chilling THEN flag AND notify hygiene_lead"). Digital signatures + immutable audit log.
- **Allergen swab logs** [§2]: ATP/ELISA results na line changeover.
- **Release gate** [§2]: Quality approve przed shipping; "hold" status releasable tylko przez Quality role.
- **Event fields "AI-ready"** [§6.3]: `defect_class`, `confidence_score`, `image_url`, `model_version`, `reviewed_by_human`. Od dnia 1, bez tego retraining bolesny.
- **Vision QA (Phase 4)** [§6.1]: partner hardware (KPM, Mettler-Toledo); integracja przez MQTT/REST → reject log → EPCIS event.

### 10-FINANCE

- **Standard cost roll + landed cost + variance** [§3]. NIE GL/AP/AR (zostaje D365).
- **Export do D365 via DMF** [§3]: outbox events → `@monopilot/d365-adapter` → DMF entities.

### 11-SHIPPING

- **SSCC labels + GS1 Digital Link QR** [§2, §7]: GTIN+batch+expiry+serial encoded w Digital Link syntax.
- **Allergen-aware label generation** [§2]: auto-bold z recipe, front-of-pack + QUID + nutrition declaration.
- **EPCIS 2.0 events** [§2, §8]: ObjectEvent bizStep=shipping z `epcList`, `bizLocation`, `readPoint`, `bizTransactionList` (PO/ASN), `quantityList` (catch-weight). JSON-LD default.
- **ASN generation** [§8]: automatycznie z pack hierarchy (SSCC pallet → GTIN+batch case → unit).
- **E-invoice hook** [§8]: webhook do Peppol access point (Storecove/Pagero/Tradeshift SaaS P1, on-prem Phase 2).
- **EUDR hook** [§8]: jeśli FA zawiera commodity z EUDR list, require `supplier_dds_reference` na PO line przed GR.

### 12-REPORTING

- **Real-time shop floor dashboard** [§1]: digital twin light. OEE per line, CCP compliance %, allergen incidents trend, recall drill timer.
- **Per-tenant theming** [§5.3]: L2 option.
- **Cross-tenant analytics** [§5.5]: osobny warehouse schema (nigdy prod RLS bypass). Supabase + dbt / data-lake pattern.

### 13-MAINTENANCE

- **CMMS event-driven** [§1]: work orders ↔ production line downtime events; preventive triggers z equipment runtime counters.
- **Predictive maintenance (Phase 3)** [§6.1, §6.3]: IoT sensors → TimescaleDB hypertable → LSTM-autoencoder + Transformer encoder hybrids. Osobny model per klasa urządzeń (pompy/motory/przenośniki). `predicted_failure_date` + `confidence_interval` jako pole w `work_order`.

### 14-MULTI-SITE

- **Isolation** [§5.1, §5.9]: shared DB + RLS default (L1). Silo opt-in dla enterprise.
- **Tenant context middleware** [§5.2]: `app.current_tenant` set per-request; enforce przed każdym query.
- **Data residency** [§5.6]: region-per-cluster (EU/US); global control plane routing. Forza = EU cluster.
- **Migration orchestrator** [§5.4]: `tenant_migrations` table, canary → progressive rollout (5%→10%→50%→100% w 2-4 tyg). L1 auto, L2/L3 opt-in z UI wizard.
- **Config inheritance** [ADR-030, §5.3]: global L1 → tenant L2 → site L3 via rule engine DSL.
- **Admin tooling** [§5.5]: impersonation z audit + tenant switcher (superadmin MFA). Cross-site stock transfers tracked via EPCIS aggregation events.
- **Billing/metering** [§5.7]: event-sourced `usage_events` → aggregate. Feature tiers = feature flags entitlements.

### 15-OEE

- **Event-driven OEE calc** [§1, §15-OEE]: availability / performance / quality z produkcji eventów. Event store z pełną historią, replay capability.
- **Anomaly detection (simple MVP)** [§6.3]: rolling window EWMA + std-dev gates; cel wczesne wykrycie downtrendu przed manager-alertem.
- **Digital twin Phase 3** [§1]: closed-loop scheduling twin (MDPI 2025 bakery case: -24% time, -23% energy).

### Module-agnostic guardrails

- **Nigdy DDL w-locie w request path** [§4.5]: schema changes = jobs z approval.
- **Testing posture** [§5.2]: wszystkie testy z app-role connection (nie superuser), RLS active w CI.
- **Index audit co release** [§5.9]: query plans na hot paths.
- **Schema drift detection** [§4.5]: compare `information_schema` vs `Reference.DeptColumns` w daily job.
- **"Buy vs build" decisions** [§8 cross-cutting]:
  - **Build:** scanner PWA, MES core, schema, core workflows, rule engine DSL — domain differentiation.
  - **Buy/integrate:** Peppol access point (Storecove/Pagero), e-signature (DocuSign), ML infra (Modal/Replicate dla GPU), observability (Sentry, Datadog), i18n (Crowdin/Lokalise), feature flags (PostHog).
  - **Partner:** vision QA hardware (KPM, Mettler-Toledo), control tower analytics (Infor Nexus dla mid-market).

---

## §10 Key Decisions & Open Research Items

### 10.1 Locked decisions z research (candidates for ADR / Phase B)

| # | Decision | Marker | Source § |
|---|---|---|---|
| R1 | **Event-first architecture via outbox pattern w Postgres** od MVP | [UNIVERSAL] | §1, §3, §6 |
| R2 | **Postgres JSONB hybrid storage** (core typed + ext JSONB + private JSONB + schema_version) — NIE EAV, NIE block-monolith, NIE DDL-per-change | [UNIVERSAL] | §4 |
| R3 | **RLS default + composite indexes + LEAKPROOF SECURITY DEFINER wrappers** dla multi-tenant isolation | [UNIVERSAL] | §5 |
| R4 | **Zod + json-schema-to-zod runtime** dla schema-driven form/validator generation | [UNIVERSAL] | §4 |
| R5 | **PWA P1 + Capacitor P2** dla 06-SCANNER (nie native Android first) | [UNIVERSAL] | §7 |
| R6 | **PostHog self-host** jako feature flags + analytics stack dla early Monopilot | [UNIVERSAL] | §5 |
| R7 | **EU data residency cluster default** dla Forza + wszystkich EU klientów | [FORZA-CONFIG]→[UNIVERSAL] | §5 |
| R8 | **One-way D365→Monopilot sync na start** (item master, BOM, customers); **one-way Monopilot→D365** push production confirmations/inventory/shipments | [LEGACY-D365] | §3 |
| R9 | **Strangler Fig migracja z v7 Excel** + parallel run (realizuje Phase D "Two-systems principle") | [EVOLVING] | §3 |
| R10 | **GS1 Digital Link + EPCIS 2.0 JSON-LD** dla traceability; NIE blockchain | [UNIVERSAL] | §2, §8 |
| R11 | **i18n od dnia 1** (pl/en/uk/ro baseline, ICU MessageFormat) | [UNIVERSAL] | §7 |
| R12 | **AI/ML warstwy**: L0 LLM docs (P2), L1 forecasting/vision (P3), L2 autonomous agents (P4+) — nie wcześniej bez audit infra | [UNIVERSAL] | §6 |
| R13 | **Schema "AI-ready + traceability-ready"** od dnia 1 (model_prediction_id, epcis_event_id nullable fields) | [UNIVERSAL] | §6, §8 |
| R14 | **Idempotent scanner mutations** (UUID v7 client-generated transaction_id) | [UNIVERSAL] | §7, §8 |
| R15 | **GS1-first identifiers** (GTIN/SSCC/GLN/GRAI) zamiast własnych gdzie możliwe; internal ID może żyć obok | [UNIVERSAL] | §8 |

### 10.2 Regulatory roadmap (first-class artifact)

Proponowane utrzymanie w `_foundation/regulatory/` z datami enforcement + mapowaniem na moduły. Review kwartalny (FDA/KE zmieniają terminy).

| Regulacja | Enforcement | Dotyka modułów | Status |
|---|---|---|---|
| **FSMA 204** (USA) | **2028-07-20** (opóźnione) | 01-NPD, 05-WAREHOUSE, 11-SHIPPING, 08-PRODUCTION | US retailers wymagają wcześniej |
| **EUDR** (EU) | **2026-12-30** | 01-NPD (BOM commodities), 11-SHIPPING, future Procurement | Soy+palm+cocoa w food BOM |
| **Peppol B2B Belgium** | **2026-01-01** | 11-SHIPPING e-invoice | Precursor ViDA |
| **EU ViDA** | **2030-07-01** | 11-SHIPPING, 10-FINANCE export | Wszystkie intra-EU B2B/B2G |
| **BRCGS Food Issue 10** | 2026 (post consultation) | 09-QUALITY, 03-TECHNICAL | Blended audit 50% zdalnie |
| **EU FIC 1169/2011 + 2021/382** | Active | 01-NPD, 11-SHIPPING labelling | Allergen digital segregation |
| **Polska KSeF** | Opóźniony, kierunek pewny | 11-SHIPPING, 10-FINANCE | Monitorować |

### 10.3 Open research items (następny research pass, post Phase B)

4 pytania do rozstrzygnięcia w Phase B sam start (nie blokujące, ale warto flagować):

1. **Storage partition strategy** — czy Main Table w L1 powinien być partycjonowany po `tenant_id` od MVP, czy tylko gdy hit >10k tenants? Trade-off: partition pruning performance vs ops complexity. **Rekomendacja**: start bez partitioningu, monitor EXPLAIN na hot queries.
2. **Event bus MVP** — outbox + który consumer na start? Azure Service Bus (fit z D365 ekosystemem), AWS SQS/SNS, self-host RabbitMQ/NATS? **Rekomendacja wstępna**: Azure Service Bus (D365 adapter pattern). Weryfikacja w Phase B.
3. **LLM platform** — Claude API direct, OpenAI direct, Azure OpenAI, Modal/Replicate, lub dedicated manager agents SDK? **Rekomendacja wstępna**: Claude API direct dla jakości + Modal dla custom models. Microsoft 365 Copilot Connector jeśli klient ma enterprise M365.
4. **Peppol access point vendor** — Storecove (Netherlands, developer-friendly), Pagero (Sweden, mid-market, enterprise), Tradeshift (large enterprise). Decyzja zależy od Forza's actual invoicing volume + partner network. **Deferred** do Phase C (11-SHIPPING).

### 10.4 Carry-forward z Phase D EVOLVING §19

Te pytania zostały deferred w Phase D, research ich nie zamyka — potrzebna user decision w Phase B start:

1. Brief allergens lokalizacja (rescan brief schema)
2. Multi-component Volume w brief 2
3. Brief → Multi-FA split semantyka
4. Hard-lock semantyka (developer vs superadmin) — ADR-028
5. Rule engine versioning (v1 active vs v2 draft) — ADR-029
6. Upgrade strategy L2/L3/L4 opt-in granularity — ADR-031 (§5.4 daje framework, ale konkretna polityka per tenant wymaga user call)
7. Commercial upstream od briefu — deferred, post-research
8. MRP split — user confirmed nieaktualne, pozostaje 1 dept

---

## Wersjonowanie tego dokumentu

- **v1** (2026-04-18): initial one-pass research przed Phase B. 3 agenty parallel + consolidation.
- **v2** (planned Phase C mid): review regulatory deadlines (FSMA/EUDR updates), dodać nowsze vendor releases, refresh AI/ML maturity matrix.

**Next doc:** `MES-TRENDS-2027.md` lub incremental update w-locie jeśli minor changes.

---

**Koniec MES-TRENDS-2026.md.** Referenced przez każdy PRD rewrite w Phase B/C/D.
