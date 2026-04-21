# HANDOFF — Phase C2 Sesja 1 CLOSE → C2 Sesja 2 bootstrap

**From:** Phase C2 Sesja 1 (2026-04-20) — 04-PLANNING-BASIC writing
**To:** Phase C2 Sesja 2 — 05-WAREHOUSE writing
**Phase:** C1 CLOSED → C2 Sesja 1 CLOSED → C2 Sesja 2 NEXT

---

## 🏁 Phase C2 Sesja 1 COMPLETE

### Deliverable

✅ `04-PLANNING-BASIC-PRD.md` v3.0 — **1528 linii, 16 sekcji, 40+ FRs, 13 tabel (3 new), 37 validation rules**

### Kluczowe decyzje Sesji 1

**Q1-Q6 (user approved 2026-04-20):**
- Q1 ✅ Allergen-aware sequencing P1 basic heuristic (group by family), full optimizer → 07-PLANNING-EXT
- Q2 ✅ D365 SO trigger P1 MVP (nightly + on-demand pull, flag `integration.d365.so_trigger.enabled`)
- Q3 ✅ Meat_Pct multi-comp inline §8.9 (Phase D #14)
- Q4 ✅ Workflow-as-data: state machines jako DSL rules w 02-SETTINGS §7 registry, transitions stałe v1.0, admin tylko names/colors
- Q5 ✅ Co-products w `wo_outputs` P1 (primary + co + by, allocation_pct z BOM)
- **Q6 ✅ REVISED: Intermediate cascade = P1 core, nie flag-gated** — user clarification: Forza tropi intermediate steps, każdy step produkuje storable LP. Catalog-driven: intermediate items w catalog → N-layer BOM → N+1 WO DAG auto-generated. Zero config switches.

### Core innovations v3.0 vs v3.2 baseline

| # | Innovation | Section |
|---|------------|---------|
| 1 | **Intermediate cascade DAG** catalog-driven (Phase D #19 N+1) | §8.4 |
| 2 | **wo_outputs** table (primary + co_product + byproduct) | §5.8 |
| 3 | **wo_dependencies** DAG edges z cycle detection | §5.9 |
| 4 | **Disposition policy** (to_stock / direct_continue / planner_decides) | §8.5 |
| 5 | **Allergen-aware sequencing** heuristic | §10 |
| 6 | **D365 SO trigger** pull → draft WO gen | §15.2 |
| 7 | **Workflow-as-data** state machines w rule registry | §16.1 |
| 8 | **Meat_Pct multi-comp aggregation** [FORZA-CONFIG] | §8.9 |
| 9 | **Schema-driven ext cols** (ADR-028 L3) na wszystkich planning tables | §5 |
| 10 | **Outbox events** per PO/TO/WO state transition | §6.5, §7.6, §8.7 |

### Build sequence output

**4 sub-modules 04-PLANNING-a..d (18-23 sesji impl est.):**
- a: Suppliers + PO (5-6 sesji)
- b: Transfer Orders (3-4 sesji)
- c: Work Orders + DAG + reservations + workflow-as-data (6-8 sesji)
- d: Dashboard + Settings + sequencing + D365 SO trigger (4-5 sesji)

---

## Phase C2 Sesja 2 scope (05-WAREHOUSE) + bootstrap

### Scope

**05-WAREHOUSE-PRD.md** — LP (License Plate) lifecycle, location hierarchy, put-away, pick, move, count, FEFO enforcement, lot genealogy (FSMA 204 foundation), GRN receiving (PO consumer), TO ship/receive transit, intermediate LP handling (cascade output from 04-PLANNING §8).

**Key dependencies (z C2 Sesja 1 output):**

| 04-PLANNING ref | 05-WAREHOUSE coverage needed |
|-----------------|------------------------------|
| §6.4 PO → GRN | Full GRN workflow, PO.received_qty aggregation |
| §7.5 TO ship/receive | Transit location pattern, stock_move records |
| §8.5 wo_outputs disposition | to_stock → put-away; direct_continue → skip put-away + reserve for downstream |
| §9.1 Hard-lock reservation | LP.reserved_for_wo_id semantics, visibility badges |
| §9.2 FEFO suggestion source | LP inventory query API dla Scanner dynamicznych pick suggestions |
| §12.3 Scanner visibility | LP inventory query filtered by warehouse + status |

### Bootstrap C2 Sesja 2

1. Read `_meta/handoffs/2026-04-20-c2-sesja1-close.md` (this file)
2. Read `04-PLANNING-BASIC-PRD.md` v3.0 (dependency) — especially §5.10 reservations, §6.4 GRN, §7.5 TO handoff, §8.3-§8.5 wo_outputs, §12 release-to-warehouse
3. Read `03-TECHNICAL-PRD.md` v3.0 §6 item types (intermediate LP handling), §8 catch weight (LP qty tracking), §9 shelf life (FEFO driver)
4. Read `02-SETTINGS-PRD.md` v3.0 §12 infrastructure (warehouses, locations hierarchy), §10 feature flags (warehouse features)
5. Read `_foundation/research/MES-TRENDS-2026.md` §2 food-mfg (FEFO + lot genealogy + batch tracking), §9 05-WAREHOUSE specifics
6. Read baseline `05-WAREHOUSE-PRD.md` (pre-Phase-D)
7. Propose outline → user Q1-Q? → full write

### Key questions do rozstrzygnięcia w Sesji 2

**Q1:** LP granularity — one LP per receipt/output, or splittable during put-away? (Impact: inventory precision vs scanner UX)
**Q2:** Location hierarchy depth — warehouse → zone → aisle → rack → bin? Flexible per tenant (L2 config)?
**Q3:** FEFO vs FIFO override — per-product setting (03-TECHNICAL) czy per-pick (Scanner runtime)?
**Q4:** Lot genealogy storage — graph DB (Neo4j-like overhead) vs Postgres recursive CTE?
**Q5:** Cycle count / physical inventory scope P1 vs P2?
**Q6:** Intermediate LP lifecycle — same state machine as RM/FA czy osobny (np. "in_production" state)?
**Q7:** EPCIS event generation — inline w 05-WAREHOUSE czy outbox → separate service?

### Open items carry-forward z 04-PLANNING

Z §16.3 OQ1-OQ8, relevantne dla 05-WAREHOUSE:
- **OQ4** — hard-lock w scheduling window: P1 = hard on release only. Confirm w 05 design
- **OQ5** — WO cancellation cascade: reservation release behavior — spec w 05
- Żadne inne OQ nie mają bezpośredniego impact na 05

---

## Phase C progress overall

| Batch | Status | Moduły | Sesji est. vs actual |
|---|---|---|---|
| **C1** | ✅ COMPLETE | 02-SETTINGS + 03-TECHNICAL | 2 (est. 2-3) |
| **C2 Sesja 1** | ✅ COMPLETE | 04-PLANNING-BASIC | 1 (2026-04-20) |
| **C2 Sesja 2** | ⏭ NEXT | 05-WAREHOUSE | ~1 |
| **C2 Sesja 3** | pending | 06-SCANNER-P1 | ~1 |
| **C3** | pending | 07-PLANNING-EXT + 08-PRODUCTION | ~2-3 |
| **C4** | pending | 09-QUALITY + 10-FINANCE + 11-SHIPPING + INTEGRATIONS 2-3 | ~3-4 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE + INTEGRATIONS 4-5 | ~3-4 |

**Pozostało writing Phase C:** C2 Sesja 2 + Sesja 3 + C3 + C4 + C5 = **10-13 sesji**.

---

## Related

- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.0 — primary deliverable
- [`2026-04-20-c1-close.md`](./2026-04-20-c1-close.md) — Phase C1 close HANDOFF
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0
- [`01-NPD-PRD.md`](../../01-NPD-PRD.md) v3.0
- [`02-SETTINGS-PRD.md`](../../02-SETTINGS-PRD.md) v3.0
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0

---

## Closing note

Phase C2 Sesja 1 efektywnie zamknęła 04-PLANNING-BASIC w **1 sesji (split B approach — per-PRD outline → approve → write)**. Kluczowa decyzja sesji = **Q6 revision** na user input: Forza tropi intermediate steps jako storable LPs, więc intermediate cascade DAG jest P1 core requirement nie flag-gated feature. To wzmacnia alignment z Phase D #19 (N+1 Builder per FA) i upraszcza multi-tenant story (catalog-driven adaptation zamiast config switches).

**Next**: Session reset recommended. Faktyczna waga 04-PLANNING (1528 linii + DAG complexity) sugeruje że Sesja 2 startuje fresh context dla 05-WAREHOUSE deep dive na LP lifecycle + FEFO + lot genealogy.
