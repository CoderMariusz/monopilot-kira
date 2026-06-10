# MonoPilot Kira — Frontier Audit Report (2026-06-09)

Audyt read-only wykonany przez 6 równoległych agentów: NPD, Technical, sweep pozostałych modułów,
infra/build health, dryf plan-vs-rzeczywistość, research rynkowy (MES/PLM dla food manufacturing).
Żadne zmiany w kodzie nie zostały wprowadzone.

---

## 1. Werdykt ogólny

**Projekt jest w znacznie lepszym stanie, niż sugeruje odczucie "dziurawej aplikacji" — ale ta
dziurawość jest realna i skoncentrowana w module Technical oraz w 10 modułach-stubach.**

- **NPD: ~95% funkcjonalnie kompletny.** Pełen przepływ Brief → Project → Formulation → Gates
  G0–G4 (e-sign) → FG → Release działa end-to-end i jest pokryty testami E2E (83 pliki testów).
  Ostatnie commity (dede79b1, e45a9cc8, acb16c32) naprawiły dokładnie te rzeczy, na które
  narzekał właściciel: martwe ghost-buttony formulacji, upserty Trial/Pilot, % kompozycji,
  infinite-loading modala BOM.
- **Technical: fundament solidny (schema, RLS, migracje 153–163), ale 5 blockerów funkcjonalnych**
  — w tym dokładnie "dodawanie elementów nie zapisuje danych": wagi itemów są zbierane w
  formularzu i **po cichu gubione** przy zapisie.
- **Build przechodzi** (typecheck 0 błędów, Next build 10.2 s, 200+ routes), ale **CI jest
  czerwone**: 3 błędy lint + **duplikat migracji 238** (dwa różne pliki o tym samym numerze).
- **Bezpieczeństwo: patche reopen z 2026-06-04 (P0 RBAC overgrant + open redirect) leżą
  niezmergowane od 5 dni** w `_meta/runs/reopen/codex/`.
- **Korpus 1063 atomic-tasków rozjechał się z rzeczywistością** — 50 ostatnich commitów nie
  ma task ID, decyzje (costing-v2, gate redesign, D365 namespace) zapadły poza systemem zadań.

## 2. Macierz dojrzałości modułów

| Moduł | Stan | Uwagi |
|---|---|---|
| Settings | FUNCTIONAL (~95/120 ekranów) | design-parity zmergowane do main, live na Vercel |
| NPD | FUNCTIONAL (~95%) | deferred: D365 wizard, Config templates, PDF label |
| Technical | PARTIAL (~36/80 ekranów) | 5 blockerów (sekcja 3), masa stubów |
| Dashboard | FUNCTIONAL | realne dane org-scoped |
| Production | SCHEMA MISSING | brak wo_executions/wo_outputs/downtime_events; 1 strona-stub |
| Warehouse | MISSING | brak license_plates/GRN/genealogii; 0/57 tasków |
| Quality | STUB | 1 strona-licznik |
| Planning / Scheduler | STUB | landing pages |
| Finance | MISSING + P0 (brak fin.* w enum RBAC) | 0 schema |
| Shipping / Reporting / Maintenance / Multi-Site / OEE | STUB/MISSING | landing pages |

## 3. Blockery Technical (priorytet napraw)

1. **[CRITICAL] Wagi itemów gubione przy create/edit** — `item-create-wizard.tsx:413-427`
   zbiera nominal/gross weight w kroku 3, ale submit() ich nie wysyła; CreateItemInput/
   UpdateItemInput (zod) w ogóle nie mają tych pól. `tare_weight` i `gs1_gtin` są w schemacie
   DB, ale nie mają inputów w UI. ~2-3h roboty.
2. **[CRITICAL] Brak workflow zatwierdzania BOM** — bom_headers ma maszynę stanów
   (draft → in_review → technical_approved → active), ale nie istnieją Server Actions ani
   przyciski do przejść. BOM-y zostają draftami na zawsze; blokuje handoff NPD→Planning. ~8h.
3. **[CRITICAL] Dwa źródła prawdy: `items` (Technical) vs `product` (NPD)** —
   `create-draft.ts:76-83` tworzy wiersz product na żądanie; brak rekonsyliacji przy edycji
   itemu. Wymaga decyzji projektowej (krótkoterminowo: zawsze twórz product przy create-item).
4. **[CRITICAL] Kaskada alergenów niewyzwalalna z UI** — serwis
   `lib/technical/allergens/cascade.ts` istnieje, ale nie ma przycisku "Recalculate";
   zdarzenie outbox (T-024) odroczone. Luka compliance. ~4h.
5. **[HIGH] Dual-write kosztu** (items.cost_per_kg + item_cost_history) bez ścieżki update —
   ryzyko rozjazdu z Finance.

Plus: ~15 ekranów Technical to stuby (nutrition, sensory, shelf-life, lab-results,
factory-specs, allergen matrix/contamination-risk, cost, tooling, BOM graph/history/recipe).

## 4. Blockery CI / deploy (szybkie)

1. **Duplikat migracji 238**: `238-npd-core-extra-fields.sql` i
   `238-settings-scanner-devices.sql` — przenumerować drugi na 252. ~5 min.
2. **3 błędy ESLint**: control-char regex w `migrations-queue.client.tsx:87` + brak definicji
   reguły `react-hooks/exhaustive-deps` w `formulation-editor.tsx:820` i
   `log-trial-modal.tsx:93`. ~15 min.
3. **Niezmergowane patche reopen (P0 security)**: RBAC overgrant (`org.schema.admin` w grancie
   admin-family) + open redirect. Patche gotowe w `_meta/runs/reopen/codex/diff-*.patch`.
4. Drzewo robocze: 482 pliki _meta (czyszczenie referencji skilli — niegroźne), 2 realne
   edycje źródeł (advance-gate-modal), 55 artefaktów PNG/MD. Posprzątać commitem porządkowym.

## 5. NPD↔Technical — kontrakt i rekomendacja przenosin

Kontrakt danych jest **czysty**: NPD pisze product/formulation/allergen-state, Technical jest
SSOT dla items/bom_headers/bom_lines/routings; Production robi immutable snapshoty BOM przy WO
(ADR-002). Nie przenosić ekranów między modułami — zamiast tego:

- **Skróty (deep-linki)**: z FA Technical tab → `/technical/items/[code]` i
  `/technical/bom/[code]`; z formulacji → karta itemu RM. Tanio i zgodnie z prototypami.
- **Zostają w Technical**: BOM authoring/approval, item master, routings, supplier specs.
- **Realny dług**: rekonsyliacja items↔product (blocker #3) — to jest właściwe "połączenie
  modułów", nie przenosiny ekranów.

## 6. Research rynkowy — implikacje

- Małe zakłady mięsne kupują najpierw **traceability/lot-tracking + compliance** (trigger:
  gotowość na recall/audyt), nie NPD. NPD to upsell dla mid-market (wzorce: FoodReady,
  Wherefour vs Aptean/Infor/TraceGains).
- **Pierwsza sprzedawalna wersja** = Technical master data (items, BOM/receptury z roll-upem
  alergenów, koszt, specs) **+ ścieżka lot: GRN → rejestracja produkcji → wysyłka + raport
  trace/recall jednym klikiem**. To dokładnie Warehouse+Production schema, których dziś brak.
- **Mięso-specyficzne braki w modelu danych: catch weight i disassembly/reverse BOM**
  (1 tusza → wiele wyrobów z alokacją ko-produktów). Retrofit jest brutalny — dodać do schematu
  teraz, UI później. (bom_co_products już istnieje — dobry zaczątek.)
- Model G1–G4 z e-sign jest **zgodny ze standardem Cooper Stage-Gate** dla food; dodać wynik
  "recycle/revise" obok pass/fail i cross-funkcyjny sign-off.

## 7. Diagnoza dryfu i proces na przyszłość

Korpus 1063 tasków + 14 fal zaprojektowano pod orkiestrację multi-agentową; solo-właściciel
pracuje w cyklach 2-3-dniowych "live-verify → fix → commit" i system zadań nie nadąża (lag 5+
dni, fałszywe statusy ✅, np. T-074/075 settings). Rekomendacja:

- Commity bez task ID są OK, ale raz na falę aktualizować STATUS.md skryptem/przy closeout.
- Decyzje (`_meta/decisions/`) tagować dotkniętymi taskami.
- Zarzucić ceremonię pre-planowania nowych modułów na 1000 tasków — moduł = checklista
  ~20-40 pozycji + parity-evidence po fakcie (to i tak już się dzieje).
- Patche security z review mergować w ≤24h albo świadomie odrzucać — nie zostawiać w limbo.

## 8. Plan na 2 miesiące (2026-06-09 → 2026-08-09)

**Tydzień 1 — Stabilizacja i bezpieczeństwo (cel: zielone CI, zielony deploy)**
- Migracja 238 rename; 3 fixy lint; commit porządkowy drzewa roboczego.
- Przegląd i merge patchy reopen (P0 RBAC + open redirect) + re-weryfikacja.
- Technical blocker #1 (wagi + tare + gtin w zapisie) i #4 (przycisk kaskady alergenów).

**Tydzień 2–3 — Technical do stanu funkcjonalnego (cel: NPD+Technical jako spójny slice)**
- Blocker #2: BOM approval workflow (3 akcje + modale + RBAC + testy).
- Blocker #3: decyzja items↔product + implementacja wariantu krótkoterminowego.
- Supplier spec review UI; allergen contamination-risk/process-additions CRUD.
- Skróty NPD↔Technical (deep-linki z FA/formulacji).
- Decyzja schematu: catch weight + disassembly BOM (sam model danych + migracje).
- Gate-5 live verification NPD+Technical na produkcyjnym Supabase (Playwright + ręcznie).

**Tydzień 4–6 — Wedge traceability: Warehouse + Production schema-first**
- Warehouse: license_plates, lp_genealogy (ltree), grns, stock_moves, FEFO/FIFO rules + minimalny UI (GRN przyjęcie, podgląd LP).
- Production: wo_executions, wo_outputs, wo_waste_log, downtime_events + permission enums; minimalny WO start/consume/output (desktop, scanner później).
- BOM snapshot przy tworzeniu WO (wiring istnieje — podpiąć).

**Tydzień 7–8 — Trace/recall + pilot**
- Raport trace jednym klikiem (lot → wstecz do GRN, wprzód do wysyłki).
- Quality minimal: lab_results read-model + rejestracja zdarzenia QC.
- Hardening E2E całej ścieżki; pilot na danych design-partnera (Apex).
- NIE ruszać w tym oknie: Finance, OEE, Reporting, Maintenance, Multi-Site, Scheduler, D365 wizard.

**Definicja "pierwszej działającej wersji" (koniec sierpnia):** użytkownik loguje się, ma
kompletne master data (Technical), prowadzi projekt NPD przez bramki do release, przyjmuje
surowiec na LP, rejestruje produkcję z konsumpcją wg BOM i wyciąga raport trace — wszystko na
żywym Supabase/Vercel.

---
*Szczegółowe znaleziska per-ekran (NPD: 30+ ekranów, Technical: 28 routes) — w transkryptach
agentów audytu; kluczowe pozycje wciągnięte powyżej.*
