# HANDOFF — Phase D CLOSE → Research → Phase B bootstrap

**From:** 2026-04-18 Phase D closure session (23 open questions settled)
**To:** Pre-Phase-B Industry Research (MES-TRENDS-2026.md) → Phase B (00-FOUNDATION + 01-NPD rewrite)
**Phase:** D CLOSED → Research next → Phase B after

---

## 🏁 Phase D COMPLETE — Quality gate ✅

Phase D zamknięty w 1 sesji (plan zakładał ~2h). Wszystkie deliverables z Phase A HANDOFF §Bootstrap dostarczone:

- [x] Re-read 10 reality docs (8 pld-v7-excel + 2 brief-excels) ✅
- [x] Re-read META-MODEL + 4 Phase-0 ADRs (028-031) ✅
- [x] Walk through EVOLVING §17 priority matrix + §19 open questions (23 items) ✅
- [x] Architecture closure — 23 decisions settled w 4 grupach (Schema/Rule engine/Business/Integration) ✅
- [x] NPD-first order reconfirmed ✅
- [x] 15 modułów mapping → implementation batches (Phase C1-C5) ✅
- [x] Output: `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` (~500 lines) ✅

---

## Deliverables Phase D

**Primary:**
- ✅ `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` — full Phase D closure
- ✅ Ten HANDOFF

**Ustalenia kluczowe (z MONOPILOT-V2-ARCHITECTURE.md):**

### Architektoniczne principles (6)

| # | Principle |
|---|---|
| P1 | Easy extension contract — NPD 1:1 v7 + clean add-column pathway (ADR-028 full) |
| P2 | **Two-systems principle** — v7 Excel + Monopilot = ten sam logiczny system, różne UX layers |
| P3 | Schema-driven + rule engine DSL (META-MODEL Levels a/b) |
| P4 | Reality fidelity — Phase B = 1:1 v7, speculation deferred |
| P5 | Multi-tenant from day 1 (ADR-031) |
| P6 | Marker discipline (`[UNIVERSAL]`/`[APEX-CONFIG]`/`[EVOLVING]`/`[LEGACY-D365]`) |

### 23 decisions settled

**Schema (8):**
1. Multi-component = Main Table agregacja, ProdDetail per-component
2. Done_<Dept> = IsAllRequiredFilled (independent readiness)
3. Status_Overall 5-enum: Built/Complete/Alert/InProgress/Pending
4. Days_To_Launch = computed on-the-fly
5. FA_Code = hybrid (auto-propose + user approve)
6. Dev_Code ↔ FA_Code = 2 niezależne kody coexist
7. Price blocking → `Core + Production done`
8. Built auto-reset fix — ProdDetail edits też resetują

**Rule engine (3):**
9. DSL hybrid: JSON runtime + Mermaid docs + wizard Admin UI
10. PR_Code_Final format per org (schema-driven); multi-comp = comma-sep concat
11. Blocking rules → rule engine obszar (b) conditional required

**Business (7):**
12. Dept name `Technical` (1:1 v7, stabilny code)
13. Brief = pierwszy ekran 01-NPD module (Phase C import → native)
14. Meat_Pct zostaje w Planning, multi-comp agregacja comma-sep
15. Nowa tabela `Reference.Dieset_Material_Consumption`
16. **Allergens multi-level cascade** RM → PR_step → FA (process steps mogą dodawać allergeny)
17. Closed_Production strict all-must-complete
18. Alert thresholds → `Reference.Alert_Thresholds` config

**Integration (5):**
19. Builder: każdy process step = osobny D365 product (N+1 per FA), OP=10 always
20. BOM + Builder osobne feature, wspólny trigger
21. Per-FA file: `Builder_FA<code>.xlsx` zawiera wszystkie PR + FA
22. Nowa tabela `Reference.D365_Constants`
23. CloseConfirm binary default, architecture-ready dla state machine

### Module renumbering (15 modules, new build order)

| Nowy | Moduł | Phase |
|---|---|---|
| 00 | FOUNDATION | **B first** |
| 01 | NPD | **B primary** |
| 02 | SETTINGS | C1 |
| 03 | TECHNICAL | C1 |
| 04 | PLANNING-BASIC | C2 |
| 05 | WAREHOUSE | C2 |
| 06 | SCANNER-P1 | C2 |
| 07 | PLANNING-EXT | C3 |
| 08 | PRODUCTION (WO exec, ≠ PLD.Production dept) | C3 |
| 09 | QUALITY | C4 |
| 10 | FINANCE | C4 |
| 11 | SHIPPING | C4 |
| 12 | REPORTING | C5 |
| 13 | MAINTENANCE | C5 |
| 14 | MULTI-SITE | C5 |
| 15 | OEE | C5 |

INTEGRATIONS = multi-stage, rozproszone C1-C5.

---

## Kluczowe Phase B clarifications

**Phase B scope:** 00-FOUNDATION + 01-NPD **razem** (user decision Phase D — Foundation first bo wszystkie PRD z niego korzystają).

**Phase B deliverables:**
1. 00-FOUNDATION rewrite — infra/engines alignment z ADR-028/029/030/031 + reality learnings z Phase A
2. 01-NPD rewrite — full PLD v7 equivalent:
   - 7 dept columns + workflow + cascade + Dashboard
   - Brief import tool (Excel → PLD row)
   - D365 Builder logic (N+1 products per FA, per-FA file)
   - Allergens multi-level cascade (RM → PR_step → FA)
   - Multi-component agregacja (Main Table comma-sep, ProdDetail per-comp)
   - Markery wszędzie + cross-refs do 10 reality docs
3. Integration stage 1 (D365 Builder) — inline w 01-NPD

**NIE w Phase B:** 02-SETTINGS, 03-TECHNICAL (pełny rewrite w C1, Phase B dotyka tylko scope potrzebny dla NPD).

---

## Pre-Phase-B: Industry Research

**User decision:** Jeden research pass przed Phase B, reused w każdym PRD rewrite (token-efficient).

**Scope:**
- Latest MES trends 2026
- Food-mfg best practices (HACCP/allergens/traceability post-1169/2011)
- D365 replacement patterns
- Schema-driven architecture (Retool/Airtable/Notion — patterns to borrow)
- Multi-tenant SaaS patterns
- AI/ML w food-mfg MES
- Mobile UX dla industrial scanners
- Supply chain / Procurement digital trends

**Output:** `_foundation/research/MES-TRENDS-2026.md` (single doc, referenced per PRD).

**Approach:** WebSearch + WebFetch + domain knowledge. Delegated to Explore agent (mogło być spory zapas context).

---

## Bootstrap pre-Phase-B Research session

1. Read `_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md` (Phase D primary)
2. Read this HANDOFF
3. Plan research scope (§8 architecture doc) — maybe split na 2-3 research agenty (trends / patterns / AI-ML / supply chain osobno)
4. Collect research w 1 doc: `_foundation/research/MES-TRENDS-2026.md`
5. User review — approve przed Phase B start
6. Handoff to Phase B

## Bootstrap Phase B session (post-research)

1. Read MES-TRENDS-2026.md + MONOPILOT-V2-ARCHITECTURE.md + Phase A reality docs
2. Prepare 00-FOUNDATION rewrite — ADR alignment z reality + research insights
3. Prepare 01-NPD rewrite — full v7 replication + brief + D365 Builder + allergens cascade
4. Phase B sesje estimate: 3-4 sesje (00-FOUNDATION refresh 1 sesja + 01-NPD 2-3 sesje depending on scope)

---

## Phase C preview (after Phase B)

| Batch | Moduły | Focus |
|---|---|---|
| C1 | 02-SETTINGS + 03-TECHNICAL | Admin UI dla config tables + Product Master/BOM/Allergens full |
| C2 | 04-PLANNING-BASIC + 05-WAREHOUSE + 06-SCANNER-P1 | Items creation → storage → scanning lifecycle |
| C3 | 07-PLANNING-EXT + 08-PRODUCTION | Orders to production + WO execution |
| C4 | 09-QUALITY + 10-FINANCE + 11-SHIPPING | Ongoing ops features + Comarch + EDI |
| C5 | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE | Analytics + CMMS + multi-org + OEE |

---

## Open items (carry-forward do Phase B)

Z Phase A EVOLVING §19 nie-settled w Phase D (deferred):

1. Brief allergens lokalizacja (rescan schema)
2. Multi-component Volume brief 2
3. Brief → Multi-FA split semantyka
4. Hard-lock semantyka (developer vs superadmin)
5. Rule engine versioning
6. Upgrade strategy L2/L3/L4 opt-in granularity
7. Commercial upstream od briefu (deferred, post-research)
8. MRP split na 2 — nieaktualne (pozostaje 1 dept)

---

## Memory update po Phase D close

**`project_monopilot_migration.md`:**
- Phase D status: COMPLETE (2026-04-18)
- Next step: Pre-Phase-B Research → Phase B (00-FOUNDATION + 01-NPD)
- Remaining sesje estimate: ~20-22 (research + B×3-4 + C×12-15)
- Replace "Phase D recommended" z "Phase D COMPLETE, research next"
- 23 decisions + 6 principles noted

**`project_smart_pld.md`:**
- Zostaje aktualny (v7 reality ground truth nie zmienia się)
- REALITY-SYNC discipline obowiązuje (v7 edits → `_meta/reality-sources/pld-v7-excel/*` same session)

---

## Related

- [`_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md`](../../_foundation/decisions/MONOPILOT-V2-ARCHITECTURE.md) — Phase D primary deliverable
- [`_meta/handoffs/2026-04-17-phase-a-close.md`](2026-04-17-phase-a-close.md) — Phase A HANDOFF (predecessor)
- [`_meta/reality-sources/pld-v7-excel/`](../reality-sources/pld-v7-excel/) — 8 reality docs
- [`_meta/reality-sources/brief-excels/`](../reality-sources/brief-excels/) — brief reality
- [META-MODEL + ADRs 028-031](../../_foundation/decisions/) — Phase 0 foundation (extended by Phase D)
