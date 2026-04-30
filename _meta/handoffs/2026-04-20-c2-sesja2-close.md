# HANDOFF — Phase C2 Sesja 2 CLOSE → C2 Sesja 3 bootstrap

**From:** Phase C2 Sesja 2 (2026-04-20) — 05-WAREHOUSE writing + 04-PLANNING v3.1 revision
**To:** Phase C2 Sesja 3 — 06-SCANNER-P1 writing
**Phase:** C1 CLOSED → C2 Sesja 1 CLOSED → **C2 Sesja 2 CLOSED** → C2 Sesja 3 NEXT

---

## 🏁 Phase C2 Sesja 2 COMPLETE

### Deliverables

1. ✅ **`05-WAREHOUSE-PRD.md` v3.0** — **~1700 linii, 16 sekcji, 37 FRs, 11 tabel core, 37 validation rules**
2. ✅ **`04-PLANNING-BASIC-PRD.md` v3.1** — rewizja §5.10, §8.5, §8.6, §9.2, §9.4 + changelog entry (cross-PRD consistency z 05 Q6 revised)

### Kluczowe decyzje Sesji 2

**Q1-Q7 (user approved 2026-04-20):**
- **Q1 ✅ Multi-LP per GRN line** — operator adds N rows per PO line, każdy row = 1 LP z własnym batch/expiry/pallet/location. Example case: PO 100 box → 40 batch B + 60 batch B' na 2 palletach → 2 `grn_items` rows → 2 LP. System NIE auto-splituje, per-row qty = operator-entered.
- **Q2 ✅ Apex 3-level location** (warehouse → zone → bin), system supports 2-5 levels via ltree per tenant L2 config.
- **Q3 ✅ Per-product picking_strategy + per-pick runtime override** (both). Items.picking_strategy ENUM (fefo/fifo/manual), Scanner runtime może override z reason_code audit.
- **Q4 ✅ Postgres recursive CTE P1** (native, 100K LP + depth≤10 <30s). Graph DB deferred → Phase 3 (WH-E18).
- **Q5 ✅ Basic stock adjustment P1** (stock_moves move_type='adjustment' + reason_code + manager approval >10%). Full cycle counts → P2 (WH-E14).
- **Q6 ✅ REVISED (kluczowa decyzja sesji):** **Intermediate LP always `to_stock` w P1.** `direct_continue` + `planner_decides` wycofane z P1 (deferred → P2 WH-E17). Consumption = Scanner scan-to-WO runtime z FEFO suggestion + soft warning + operator confirm on deviation (Q6B).
- **Q6A ✅** Revision applied cross-PRD — 04-PLANNING v3.1 §5.10, §8.5, §8.6, §9.2, §9.4 zsynchronizowane.
- **Q6B ✅** Allow operator pick z **warning + operator confirm + reason_code** (pick_overrides audit).
- **Q7 ✅ Outbox events P1** — all LP ops emit `outbox_events.lp.<op>`. EPCIS format → P2 consumer service (WH-E16).

### Core innovations v3.0 vs v2.1 baseline

| # | Innovation | Section | Marker |
|---|------------|---------|--------|
| 1 | **Intermediate LP Handling** (§10 NEW) — scan-to-consume pattern | §10 | [UNIVERSAL] |
| 2 | **Zero inter-WO reservation** dla cascade (Q6 revised) | §9.4 | [UNIVERSAL] |
| 3 | **FEFO jako DSL rule** (`fefo_strategy_v1` w 02§7 registry) | §9.1 | [UNIVERSAL] |
| 4 | **LP state machine jako workflow-as-data** (`lp_state_machine_v1` ADR-029) | §6.1 | [UNIVERSAL] |
| 5 | **Multi-LP per GRN line** (per-row batch/expiry/pallet) — Q1 clarified | §7.1 | [UNIVERSAL] |
| 6 | **Lot genealogy recursive CTE** — FSMA 204 <30s | §11.2 | [UNIVERSAL] |
| 7 | **Use_by vs best_before gating** (EU 1169/2011) | §12.2 | [UNIVERSAL] |
| 8 | **Daily expiry cron + auto-block** | §12.3 | [APEX-CONFIG→UNIVERSAL] |
| 9 | **Schema-driven ext cols** (ADR-028 L3) na LP/GRN/stock_moves | §6.8 | [UNIVERSAL] |
| 10 | **Scanner LP inventory query API** — consumer contract dla 06-SCANNER-P1 | §13 | [UNIVERSAL] |
| 11 | **Outbox events P1** — EPCIS consumer P2 | §11.4 | [UNIVERSAL] |
| 12 | **3-level Apex location + ltree 2-5** | §8.6 | [APEX-CONFIG] |

### Build sequence output

**4 sub-modules 05-WAREHOUSE-a..d (16-20 sesji impl est.):**
- **a**: LP Core (lifecycle DSL, split/merge, genealogy, locking, ext cols) + Dashboard shell (5-6 sesji)
- **b**: GRN from PO/TO + over/under-receipt + multi-LP + GS1-128 + transit (4-5 sesji)
- **c**: Stock moves + put-away manual + FEFO/FIFO DSL + reservations consumer RM root + override audit (4-5 sesji)
- **d**: Intermediate scan-to-consume + expiry cron + labels ZPL + dashboard KPIs + scanner APIs (3-4 sesji)

### 04-PLANNING v3.1 revision details

**Cross-PRD consistency enforced — revised sections:**

| Section | Change |
|---|---|
| Header | v3.0 → v3.1, note explaining Q6 revision |
| §5.10 wo_material_reservations | Scope narrowed: RM root only (material_source='stock'). V-PLAN-RES-005 insert guard dodany. |
| §8.5 Disposition policy | `to_stock` only P1 enforced (CHECK constraint). direct_continue + planner_decides → P2 deferred. Rationale documented. |
| §8.6 Material availability | Projection-based dla upstream_wo_output (zero reservation). Actual @ COMPLETED, projected @ IN_PROGRESS/RELEASED. |
| §9.2 Reservation creation | DRAFT→RELEASED trigger creates reservations only dla material_source='stock'. Intermediate = Scanner scan-to-wo runtime. |
| §9.4 Cancellation handling | Intermediate WO cancel = zero cleanup (resilience pattern). |
| §16.6 Changelog | v3.1 entry z full revision summary. |

---

## Phase C2 Sesja 3 scope (06-SCANNER-P1) + bootstrap

### Scope

**06-SCANNER-P1-PRD.md** — Scanner mobile app workflows (PWA, React Native lub hybrid — TBD w sesji), 9 screens (SCN-010..090), dedicated `/scanner/*` routes, username+PIN auth, touch ≥48px, audio/vibration feedback, consumer dla 05-WAREHOUSE APIs (LP inventory, barcode lookup, FEFO suggest, consume-to-WO, GS1-128 parse).

**Key dependencies (z C2 Sesja 2 output):**

| 05-WAREHOUSE ref | 06-SCANNER-P1 coverage needed |
|-----------------|-------------------------------|
| §13.1 LP inventory query API | Inventory browser screen + search workflows |
| §13.2 Barcode lookup endpoints | Universal scan dispatcher (LP/location/product/WO) |
| §13.3 Scanner auth username+PIN | SCN-010 Login + PIN setup + session timeout |
| §13.4 LP lock protocol | Scan LP → lock-LP API → UI "in use" modal |
| §13.5 FEFO suggestion endpoint | SCN-050 Pick + SCN-080 Consume FEFO ranked list |
| §10.5 Scan-to-consume workflow | **SCN-080 NEW** — intermediate cascade core consumption screen |
| §7.1 GRN multi-LP per line | SCN-020 Receive z multi-row support |
| §8.1 Move types + putaway | SCN-030 Move + SCN-040 Putaway |
| §6.4-6.5 Split/Merge | SCN-060 Split + SCN-070 Merge |
| §13.6 Offline queue (P2) | SCN-090 Offline indicator + IndexedDB sync |

### Bootstrap C2 Sesja 3

1. Read `_meta/handoffs/2026-04-20-c2-sesja2-close.md` (this file)
2. Read `05-WAREHOUSE-PRD.md` v3.0 §13 Scanner Integration (full contract), §6 LP Core, §7 Receiving, §9 FEFO, §10 Intermediate LP Handling (scan-to-consume)
3. Read `04-PLANNING-BASIC-PRD.md` v3.1 §12 Release-to-warehouse (scanner visibility trigger), §8 WO + cascade context
4. Read `03-TECHNICAL-PRD.md` v3.0 §8 catch weight (scanner CW entry UX), §9 date code rendering
5. Read `02-SETTINGS-PRD.md` v3.0 §14 security/PIN policy (scanner_idle_timeout_sec, scanner_lock_timeout_sec)
6. Read `_foundation/research/MES-TRENDS-2026.md` §9 "06-SCANNER-P1" + §2 food-mfg scanner UX patterns
7. Read baseline `06-SCANNER-P1-PRD.md` (pre-Phase-D)
8. Read `SCANNER-PROTOTYPE (2).html` + `SCANNER-SCREEN-INDEX (1).md` (UX reference z pre-Phase-D)
9. Propose outline → user Q1-Q? → full write

### Key questions do rozstrzygnięcia w Sesji 3

**Q1:** Scanner tech stack — PWA (offline-capable, install as app) vs React Native (true native, camera API) vs hybrid Capacitor?
**Q2:** SCN-080 Consume-to-WO flow — scan LP first → suggest WO matching, czy scan WO first → pick LP via FEFO suggestion? (Impact on operator flow ergonomics)
**Q3:** Offline queue granularity — per operation lub per session (atomic multi-step ops)?
**Q4:** Scan camera fallback — keyboard mode dla hardware scanner input vs camera API dla phone?
**Q5:** Kiosk mode — shared tablet per line (multi-op session switch) czy 1:1 device-to-operator?
**Q6:** Error recovery UX — hard-stop na validation error vs soft-warn z retry?
**Q7:** PIN rotation policy — per 90 days forced czy admin-configurable?

### Open items carry-forward z Sesja 2

Z OQ1-OQ8 w 05-WAREHOUSE v3.0 §16.3:
- **OQ2** Scanner PIN complexity — needs decision przed 06-SCANNER-P1 build start (likely Sesja 3 resolves)
- **OQ4** EPCIS event buffering — nie blocker dla 06 (05-WH-E16 P2)
- **OQ8** Offline queue max size — Q3 w Sesja 3 may resolve

---

## Phase C progress overall

| Batch | Status | Moduły | Sesji est. vs actual |
|---|---|---|---|
| **C1** | ✅ COMPLETE | 02-SETTINGS + 03-TECHNICAL | 2 (est. 2-3) |
| **C2 Sesja 1** | ✅ COMPLETE | 04-PLANNING-BASIC | 1 (2026-04-20) |
| **C2 Sesja 2** | ✅ COMPLETE | 05-WAREHOUSE + 04-PLANNING v3.1 revision | 1 (2026-04-20) |
| **C2 Sesja 3** | ⏭ NEXT | 06-SCANNER-P1 | ~1 |
| **C3** | pending | 07-PLANNING-EXT + 08-PRODUCTION | ~2-3 |
| **C4** | pending | 09-QUALITY + 10-FINANCE + 11-SHIPPING + INTEGRATIONS 2-3 | ~3-4 |
| **C5** | pending | 12-REPORTING + 13-MAINTENANCE + 14-MULTI-SITE + 15-OEE + INTEGRATIONS 4-5 | ~3-4 |

**Pozostało writing Phase C:** C2 Sesja 3 + C3 + C4 + C5 = **9-12 sesji**.

---

## Related

- [`05-WAREHOUSE-PRD.md`](../../05-WAREHOUSE-PRD.md) v3.0 — primary deliverable Sesji 2
- [`04-PLANNING-BASIC-PRD.md`](../../04-PLANNING-BASIC-PRD.md) v3.1 — cross-PRD revision
- [`2026-04-20-c2-sesja1-close.md`](./2026-04-20-c2-sesja1-close.md) — C2 Sesja 1 close HANDOFF
- [`2026-04-20-c1-close.md`](./2026-04-20-c1-close.md) — Phase C1 close HANDOFF
- [`00-FOUNDATION-PRD.md`](../../00-FOUNDATION-PRD.md) v3.0
- [`03-TECHNICAL-PRD.md`](../../03-TECHNICAL-PRD.md) v3.0

---

## Closing note

Phase C2 Sesja 2 efektywnie zamknęła 05-WAREHOUSE + cross-PRD rewizję 04-PLANNING w **1 sesji**. Kluczowa decyzja sesji = **Q6 revision** — intermediate cascade w P1 zawsze `to_stock` (not disposition-gated). User rationale: (a) Apex reality (intermediate buffer), (b) WO interrupt resilience, (c) natural out-of-order consumption, (d) simpler audit chain. Revision zastosowany cross-PRD (04-PLANNING v3.0 → v3.1) dla pełnej spójności.

Faktycznie **upraszcza** cascade story — zero inter-WO LP locking, Scanner scan-to-consume jako jedyny consumption mechanism, pełny chronologiczny audit via lp_genealogy operation_type='consume' + wo_id.

**Next**: Session reset recommended. 06-SCANNER-P1 design wymaga fresh context dla UX flows (9 screens) + offline queue + tech stack decision (PWA vs RN).
