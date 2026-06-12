# MonoPilot — Plan implementacji rozbudowy: fale, ekrany, przyciski, backend, styki, weryfikacja

Wersja 1.0 · 2026-06-11 · Dokument dla agenta planująco-implementacyjnego.
CZYSTY PLAN — zero kodu. Źródła prawdy: audyty `_meta/audits/2026-06-11-cross-module-consistency.md`
i `_meta/reviews/2026-06-11-live-clickthrough-gaps.md`, propozycje
`_meta/plans/2026-06-11-expansion-proposals.md`.

---

## 0. KONWENCJE OBOWIĄZUJĄCE KAŻDĄ FALĘ (przeczytaj zanim rozpiszesz pierwszy task)

0.1 **Routing**: ekrany desktop pod `apps/web/app/[locale]/(app)/(modules)/<modul>/...`;
ekrany skanera pod `apps/web/app/[locale]/(scanner)/scanner/...`. Server Actions w
`_actions/`, komponenty w `_components/`.
0.2 **Tenant**: org_id + RLS `app.current_org_id()` (Wave0 lock; skill MON-multi-tenant-site).
Tabele operacyjne dostają też `site_id uuid NULL` day-1. Scanner org-context WYŁĄCZNIE
przez transakcyjny `app.set_org_context` (wariant 3-argumentowy jest usuwany — finding F-D13b).
0.3 **RBAC**: każda nowa rodzina uprawnień NAJPIERW do enum (`permissions.enum.ts`) + seed
ról w migracji (wzór: mig 214 reporting). ESLint enum-lock blokuje PR bez tego.
0.4 **Eventy**: `events.enum.ts` = SoT, DB CHECK generowany z niego; KAŻDY nowy event musi
mieć emitera + konsumenta + test (lekcja F-D01: deklaracja ≠ emisja). Zakaz wprowadzania
typu eventu bez wiring-testu.
0.5 **Wiring contract**: każde nowe pole/tabela/event = producer + consumer + test E2E
(wzór tests/test_wiring_contract.py z ACP). To jest WARUNEK ZALICZENIA fali, nie sugestia.
0.6 **Statusy/enumy**: jeden kanoniczny słownik per byt, zdefiniowany w fali, która go
tworzy; zakaz lokalnych wariantów pisowni (lekcja F-A02 qa_status).
0.7 **UoM/waluty**: wyłącznie `lib/uom/convert.ts`; każda kolumna ilości ma sąsiednią
kolumnę uom; ceny zawsze z kodem waluty (lekcja F-D08a/b).
0.8 **Numeracja dokumentów**: przez `org_document_settings` + nextDocumentNumber (wzór
PO/TO/WO z mig 270). Nowe typy dokumentów (wizyta YV-, awizacja DA-, liczenie CC-,
reklamacja CMP-) dopisać do tego mechanizmu, nie wynajdywać własnego.
0.9 **E-sign**: wyłącznie kanoniczny `signEvent` (packages/e-sign). Decyzja PO o separacji
PIN e-sign vs PIN skanera (decyzja #10 audytu) musi zapaść przed falą używającą e-sign.
0.10 **i18n**: en+pl realne, ro/uk mirror EN. ZAKAZ kluczy w plikach staging
(lekcja F-D08a — preview konwersji nie działał, bo klucze były w nieistniejącym pliku).
0.11 **UI**: design system per MON-design-system + MON-t3-ui; nowe moduły bez prototypów
JSX → obowiązuje konformancja z design systemem (18-punktowa checklista), nie literal parity.
Stany obowiązkowe każdego ekranu: loading / empty (z CTA) / error (z komunikatem) / data.
ZAKAZ surowych UUID w UI (lekcja: wszędzie wyciekały) — zawsze nazwa + kod.
0.12 **Zależności od toru napraw** (drugi agent — naprawy łańcucha): fale oznaczone
[WYMAGA: F-XXX] nie mogą wejść do implementacji przed zamknięciem wskazanych findingów.
Lista krytycznych: F-A01 (put-away/available), F-C01 (Catch-22 spec↔BOM), F-B08
(output→LP), F-B07 (expiry kolumna), F-A06/A07 (SSOT alergenów), F-C02 (bramki consume),
F-D13a/b (scanner waste/consume), F-D05 (RLS line_machines).
0.13 **Definicja ukończenia fali**: (a) wszystkie ekrany przechodzą swój skrypt
weryfikacyjny z sekcji "PLAN SPRAWDZENIA" na ŻYWYM deployu; (b) wiring-testy zielone;
(c) zero martwych przycisków (każdy przycisk albo działa, albo jest disabled z tooltipem
wyjaśniającym); (d) i18n 4 locale; (e) wpis w CHANGELOG.

---

# HORYZONT 1 — domknięcie wedge'a (traceability + compliance)

## FALA E1 — Etykiety i druk GS1/ZPL (propozycja #16)

**Cel**: fizyczny obieg — każda paleta/karton ma etykietę, skaner ma co skanować.
**Zależności**: [WYMAGA: F-B08 output→LP] dla etykiet outputu; przyjęcia działają już dziś.

### Backend
- Tabele: `label_templates` (ISTNIEJE — rozszerzyć o: typ etykiety enum
  `lp|sscc_pallet|product|kit|location`, zpl_source, wymiary, default_printer_id),
  NOWE: `printers` (org_id, site_id, nazwa, typ ZPL/PDF, adres IP/kolejka, lokalizacja,
  aktywna), `print_jobs` (org_id, printer_id, template_id, payload_jsonb, status
  queued|sent|failed, error, created_by) — print_jobs = bufor + audyt.
- Server Actions: upsertLabelTemplate, previewLabel (render ZPL→PNG po stronie serwera),
  printLabel(entityType, entityId, templateId, printerId, copies), reprintFromHistory,
  upsertPrinter, testPrinter.
- Generacja danych: LP → GS1-128 (AI 00 SSCC z gotowej `generate_sscc()`, AI 01 GTIN z
  items.gs1_gtin, AI 10 batch, AI 17 expiry z `expiry_date` PO NAPRAWIE F-B07, AI 310x
  waga dla catch-weight). Pakiet `packages/gs1` jest — użyć, nie duplikować.
- Eventy: `warehouse.label.printed` (emiter printLabel; konsument: brak w P1 — wpisać do
  enum z adnotacją "audit-only", test emisji obowiązkowy).
- RBAC: `settings.labels.manage` (istnieje obszar labels), NOWE `warehouse.label.print`.

### Ekrany i przyciski
1. **/settings/labels** (rozbudowa istniejącego) — lista szablonów.
   Przyciski: [+ Nowy szablon] → modal (nazwa, typ, rozmiar, edytor pól: przeciągane pola
   danych z listy dozwolonych per typ) → upsertLabelTemplate · [Podgląd] → previewLabel
   renderuje PNG w modalu · [Ustaw domyślny dla typu] · [Duplikuj] · [Archiwizuj]
   (soft-delete, nie kasować — historia druku wskazuje szablon).
2. **/settings/infra/printers** (NOWY; dodać do NAV settings — pamiętaj o lekcji "lines/
   machines poza nawigacją") — lista drukarek.
   Przyciski: [+ Dodaj drukarkę] → modal (nazwa, typ, IP/kolejka, site, lokalizacja) ·
   [Testuj] → testPrinter drukuje etykietę testową, wynik inline · [Edytuj] · [Dezaktywuj].
3. **Przycisk [Drukuj etykietę] wpinany w istniejące ekrany** (to jest clou fali):
   - LP detail (PO NAPRAWIE crasha LP detail) → drukuje etykietę LP.
   - GRN detail, wiersz linii → drukuje etykiety LP z tej linii (xN kopii).
   - Scanner receive: po "✓ Received" ekran sukcesu dostaje [Drukuj etykietę] +
     auto-print jeśli skonfigurowany default printer dla magazynu.
   - Production output (desktop + scanner): po rejestracji outputu → etykieta FG LP.
   - Shipping (przyszła fala): SSCC palety.
4. **/warehouse/print-history** (NOWY, prosty) — lista print_jobs ze statusem.
   Przyciski: [Ponów] → reprintFromHistory · filtr statusu failed.

### Punkty styku (sprawdzić producer+consumer+test)
- S-E1-1: items.gs1_gtin → generator etykiety (co gdy NULL? etykieta bez AI 01 + warning,
  NIE błąd).
- S-E1-2: expiry na etykiecie czyta TĘ SAMĄ kolumnę co FEFO (decyzja #9 audytu — kolumna
  kanoniczna expiry_date). Test: przyjęcie z BB → etykieta pokazuje tę datę → FEFO widzi tę datę.
- S-E1-3: catch-weight: waga na etykiecie = license_plates.catch_weight_kg (producer:
  receive/output; consumer: etykieta + przyszły pricing).
- S-E1-4: scanner auto-print używa org-contextu 2-arg (0.2).
- S-E1-5: szablon zarchiwizowany nie może być default; print_jobs.template_id przeżywa
  archiwizację (FK bez kaskady).

### Plan sprawdzenia fali E1
1. Utwórz szablon LP → podgląd renderuje → ustaw default.
2. Dodaj drukarkę (może być "PDF printer" bez fizycznego sprzętu — print_jobs status sent
   + plik PDF do pobrania; tryb bez sprzętu MUSI istnieć do testów).
3. Skaner: przyjmij linię PO → auto-print → wpis w print-history → otwórz PDF → zeskanuj
   kod z PDF telefonem → poprawny GS1 (sprawdź AI 10 batch i AI 17 datę).
4. Zarejestruj output WO → [Drukuj] → etykieta FG ma GTIN FG i batch outputu.
5. Wyłącz drukarkę (zły IP) → print → job failed z komunikatem → [Ponów] po poprawie.
6. Wiring-test: warehouse.label.printed emitowany przy każdym print (assert outbox row).
7. Negatywne: item bez GTIN → etykieta drukuje się bez AI 01, UI pokazuje badge "brak GTIN".

---

## FALA E2 — Mock recall / trace drill (propozycja #12) + Cold chain (propozycja #4)

**Zależności**: [WYMAGA: F-B08 output→LP, F-B07 expiry, F-A01 put-away] — bez tego trace
nie ma danych. Cold chain bez zależności.

### Część A: Trace & Recall

#### Backend
- Tabele: NOWE `recall_drills` (org_id, site_id, initiated_by, batch/lp wejściowy,
  kierunek backward|forward|both, started_at, completed_at, duration_ms, result_jsonb
  snapshot wyniku, report_file_id, is_drill bool, notes). Genealogia: ISTNIEJĄCY reader
  (rekurencyjny CTE w genealogy-actions) — NIE pisać drugiego.
- Server Actions: runTraceReport(input: lp|batch|item+daterange, direction) → zwraca graf
  (węzły: dostawca→PO→GRN→LP→WO→output LP→shipment→klient) + listę płaską z ilościami;
  exportTraceReportPdf; startRecallDrill / completeRecallDrill (mierzy czas).
- Eventy: `quality.recall_drill.completed` (audit-only P1).
- RBAC: NOWE `quality.trace.run`, `quality.recall.manage`.

#### Ekrany i przyciski
1. **/quality/trace** (NOWY; podpiąć też skrót z /technical/traceability — DECYZJA: ekran
   żyje w Quality, Technical dostaje deep-link, nie kopię — lekcja o duplikatach).
   Elementy: pole wejścia (skan/wpis LP, batch, item+zakres dat), przełącznik kierunku,
   graf (drzewo rozwijane) + tabela płaska, panel podsumowania (ile LP, ile WO, ile
   wysyłek, ilu klientów dotkniętych, suma kg).
   Przyciski: [Uruchom trace] → runTraceReport · [Eksport PDF] → exportTraceReportPdf
   (PDF z nagłówkiem org, datą, parametrami — dokument dla audytora) · [Zapisz jako
   drill] → startRecallDrill/complete · klik w węzeł → nawigacja do GRN/WO/LP/shipment.
2. **/quality/recall-drills** (NOWY) — lista ćwiczeń z czasem wykonania (KPI: czas od
   startu do PDF), porównanie z celem (np. <4h wymagane przez BRCGS).
   Przyciski: [Nowe ćwiczenie] → kreator (wybór partii "na ślepo" — system losuje partię
   z ostatnich 30 dni) · [Otwórz raport].

#### Punkty styku
- S-E2-1: trace czyta WYŁĄCZNIE license_plates.parent_lp_id + wo_materials/wo_outputs +
  grn_items + shipment_box_contents — wszystkie 4 producery muszą istnieć (3 powstają w
  torze napraw, shipment w fali E9). P1: trace działa do poziomu "output LP", sekcja
  shipment renderuje "moduł wysyłek nieaktywny" zamiast pustki.
- S-E2-2: ilości w trace: jednostka z LP (uom) — nie przeliczać bez lib/uom.
- S-E2-3: RLS — trace przebiega org-scoped (reader już jest org-scoped — test cross-org:
  druga organizacja nie widzi grafu).

#### Plan sprawdzenia (część A)
1. Po naprawach: przyjmij partię (skaner) → zużyj do WO → zarejestruj output → uruchom
   trace backward z output LP → graf pokazuje: output→WO→LP wejściowy→GRN→PO→dostawca.
2. Trace forward z LP wejściowego → pokazuje WO i output.
3. PDF: zawiera wszystkie węzły z grafu + parametry + czas wygenerowania.
4. Drill: start→trace→PDF→complete; czas zapisany; lista drillów pokazuje KPI.
5. Negatywne: LP bez genealogii → komunikat "brak powiązań" (nie pusty ekran); batch
   nieistniejący → "nie znaleziono".
6. Cross-org test (dwa orgi w bazie testowej).

### Część B: Cold chain przy przyjęciu i wysyłce

#### Backend
- Tabele: NOWE `delivery_condition_checks` (org_id, ref_type grn|shipment, ref_id,
  temperatura_naczepy NUMERIC, temp_uom, plomba_nr, plomba_zgodna bool, higiena_ok bool,
  uwagi, foto_file_ids[], checked_by, checked_at) + w Settings: `product_temp_ranges`
  (kategoria produktu → min/max temp transportu).
- Server Actions: submitConditionCheck (walidacja temp vs zakres kategorii — poza zakresem
  → wynik "failed" + AUTOMATYCZNY hold na powstałe LP przez ISTNIEJĄCE createHold z
  quality), getConditionChecks.
- Eventy: `warehouse.condition_check.failed` → konsument: quality (tworzy hold) — pełny
  wiring producer+consumer+test.
- RBAC: `warehouse.grn.receive` (istnieje) pokrywa zapis; konfiguracja zakresów =
  `settings.reference.update`.

#### Ekrany i przyciski
1. **Scanner receive — NOWY KROK w istniejącym flow** (przed keypadem ilości): formularz
   warunków: temp (keypad), plomba nr + [zgodna/niezgodna], higiena [OK/NOK], [+ Zdjęcie]
   (kamera/upload). Przycisk [Dalej] → walidacja zakresu → jeśli poza zakresem: ekran
   ostrzeżenia "Przyjęcie z holdem QA — wymagana decyzja jakości" [Kontynuuj z holdem] /
   [Anuluj]. KROK KONFIGUROWALNY per org (Settings toggle "wymagaj kontroli warunków") —
   nie wymuszać na orgach bez chłodni.
2. **GRN detail (desktop)** — nowa sekcja "Warunki dostawy" (read-only wynik + zdjęcia +
   badge failed/passed). Przycisk [Uzupełnij kontrolę] gdy brak (desktop fallback).
3. **/settings/quality/temp-ranges** (NOWY mały ekran) — tabela kategoria→zakres.
   Przyciski: [+ Dodaj zakres] / [Edytuj] / [Usuń] (z potwierdzeniem).

#### Punkty styku
- S-E2-4: condition_check failed → hold przez KANONICZNĄ akcję quality createHold (nie
  własny INSERT — single writer, lekcja F-A09).
- S-E2-5: zdjęcia → istniejący storage pattern (packages/storage, signed URLs jak
  compliance docs).
- S-E2-6: toggle w Settings → scanner flow respektuje go (wiring-test: org z toggle OFF
  nie widzi kroku).

#### Plan sprawdzenia (część B)
1. Ustaw zakres dla kategorii "mięso świeże" 0–4°C → przyjmij z temp 3°C → check passed,
   LP bez holdu. 2. Przyjmij z temp 9°C → ostrzeżenie → kontynuuj → LP ma qa hold; hold
   widoczny w /quality/holds z referencją do GRN. 3. Zdjęcie uploaduje się i otwiera z GRN.
   4. Org z toggle OFF: krok nie występuje. 5. Wiring: event failed → hold (assert).

---

## FALA E3 — HACCP / monitoring CCP (propozycja #11)

**Zależności**: brak twardych (holds już działają). [SYNERGIA: E2B zakresy temperatur].

### Backend
- Tabele (definicje są w PRD 09 — użyć ich jako specyfikacji): `haccp_plans` (org, site,
  produkt/kategoria/linia, wersja, status draft|active|superseded, approved_by, e-sign),
  `haccp_ccps` (plan_id, nr CCP, zagrożenie, limit krytyczny min/max+uom, częstotliwość
  odczytu cron-like, akcja korygująca tekst, monitoring_type temp|metal|wizualny|ph|inne),
  `ccp_monitoring_records` (org, ccp_id, wo_id NULL, linia, wartość, uom, w_limicie bool,
  odczytał, odczytano_at, deviation_id NULL), `ccp_deviations` (record_id, akcja podjęta,
  dyspozycja produktu, zamknięte_by/at, e-sign, hold_id NULL).
- Server Actions: upsertHaccpPlan, activateHaccpPlan (e-sign, klonowanie wersji —
  clone-on-write jak BOM), recordCcpReading (walidacja limitu → w razie przekroczenia:
  auto-hold na bieżące LP/WO output + utworzenie deviation), resolveCcpDeviation (e-sign),
  listy/odczyty.
- Scheduler odczytów: worker job (apps/worker — wzór allergen-cascade-rebuild) generujący
  "due readings" + eskalacja braku odczytu (notyfikacja po X min).
- Eventy: `quality.ccp.deviation_opened` (konsument: hold — wiring), `quality.ccp.reading_missed`.
- RBAC: rodzina `quality.haccp.*` (manage_plan, record_reading, resolve_deviation) — enum+seed.

### Ekrany i przyciski
1. **/quality/haccp** — lista planów (status, produkt/linia, wersja, #CCP).
   Przyciski: [+ Nowy plan] → kreator 3 kroki (dane planu → CCP z limitami → przegląd) ·
   [Aktywuj] → modal e-sign · [Nowa wersja] (clone) · [Archiwum wersji].
2. **/quality/haccp/[id]** — detal planu: tabela CCP, harmonogram odczytów, historia wersji.
   Przyciski: [+ Dodaj CCP] / [Edytuj CCP] (tylko draft) · [Aktywuj].
3. **/quality/ccp-monitoring** — tablica "do odczytu teraz" (due) + ostatnie odczyty +
   przekroczenia. Przyciski: [Zarejestruj odczyt] → modal (CCP, wartość, opcjonalnie WO) ·
   filtr linii/zmiany.
4. **Scanner: kafel "QC / CCP"** (zastępuje "QC Inspection — coming soon") — lista due
   readings dla mojej linii → keypad wartości → wynik natychmiast (zielony/czerwony) →
   przy przekroczeniu wymusza notatkę akcji.
5. **/quality/ccp-deviations** — lista odchyleń (otwarte/zamknięte).
   Przyciski: [Rozwiąż] → modal (akcja, dyspozycja, e-sign) · link do holdu.

### Punkty styku
- S-E3-1: deviation → hold przez kanoniczny createHold (jak S-E2-4).
- S-E3-2: odczyt z WO kontekstem → wo_id realne (picker z bieżących WO na linii — czyta
  work_orders, nie kopiuje).
- S-E3-3: harmonogram = worker job; brak workera w deployu = odczyty due liczone w locie
  (fallback query) — NIE blokować fali na infrze.
- S-E3-4: e-sign przez signEvent (0.9); aktywacja planu pisze audit_events.
- S-E3-5: limity z uom — porównanie przez lib/uom (odczyt w °C vs limit w °C — bez konwersji
  na sztywno).

### Plan sprawdzenia E3
1. Stwórz plan z 2 CCP (temp ≤4°C co 2h; metal detektor każda partia) → aktywuj z e-sign.
2. Zarejestruj odczyt w limicie → zielony, bez skutków. 3. Odczyt poza limitem → deviation
   + auto-hold na WO output → widoczny w holds. 4. Rozwiąż deviation z e-sign → hold do
   release w quality (osobno — SoD!). 5. Scanner: due reading pojawia się, odczyt
   z keypada zapisuje. 6. Nowa wersja planu → stara superseded, odczyty wskazują wersję.
7. Wiring: deviation_opened event + konsument hold. 8. Negatywne: aktywacja planu bez CCP
   → walidacja; odczyt do nieaktywnego planu → odmowa.

---

## FALA E4 — Andon/TV (propozycja #6) + Załoga i robocizna (propozycja #7)

**Zależności**: [WYMAGA: F-C01+F-A01 — produkcja musi RUSZYĆ, żeby było co pokazywać];
oee_snapshots producer (tor napraw / istniejący plan produkcji).

### Część A: Andon / TV

#### Backend
- Bez nowych tabel (czyta: work_orders, wo_executions, downtime_events, oee_snapshots,
  wo_outputs). NOWE: `kiosk_tokens` (org, site, linia, token, expires) — TV loguje się
  tokenem bez sesji użytkownika.
- Server Actions: getLineLiveStatus(lineId) — agregat: bieżące WO, % postępu, tempo
  (kg/h ostatnia godzina), aktywny downtime, OEE dzienne, ostatni alert QA.
  Odświeżanie: polling 10–15 s (P1; bez websocketów).
- RBAC: `OEE_TV_KIOSK_VIEW` (JEST w enum) + generacja tokenu = `settings.infra.update`.

#### Ekrany i przyciski
1. **/oee/andon/[lineId]?token=** (NOWY, layout pełnoekranowy BEZ shella aplikacji) —
   kafle: WO (numer, produkt, plan/wykonanie, ETA), OEE dziś (A/P/Q), downtime (czerwony
   banner gdy aktywny, licznik minut), tempo godzinowe (sparkline), output ostatnie 3.
   Zero przycisków (kiosk). Auto-refresh. Stan "linia bez WO" = szary ekran z nazwą linii.
2. **/oee/andon** (konfigurator) — lista linii → [Generuj link TV] → token+URL+QR do
   wklejenia w TV · [Unieważnij token].

#### Punkty styku
- S-E4-1: token NIE daje dostępu do niczego poza getLineLiveStatus tej jednej linii
  (test: token linii A na URL linii B → 403).
- S-E4-2: dane = te same query co dashboard produkcji (reuse akcji, nie kopiuj agregacji).

#### Plan sprawdzenia (A): wygeneruj link → otwórz w trybie incognito (bez sesji) → dane
żywe; start downtime → banner w ≤15 s; unieważnij token → ekran "token wygasł"; token
cross-line → 403.

### Część B: Załoga i robocizna

#### Backend
- Tabele: NOWE `wo_labor_log` (org, wo_id, user_id, line_id, started_at, ended_at NULL,
  source scanner|desktop, shift_pattern_id), `labor_rates` w Settings (org, rola/grupa
  stawek, stawka/h, waluta, obowiązuje_od — effective-dated jak cost history).
- Server Actions: clockInToWo / clockOutFromWo (skaner; automatyczny clock-out przy
  starcie na innym WO i przy końcu zmiany), getWoLaborSummary (roboczogodziny × stawka →
  koszt robocizny WO), upsertLaborRate.
- STYK Z COSTINGIEM: koszt robocizny WO → (a) zakładka kosztów WO, (b) źródło stawki dla
  kroku "Process labour" w NPD costing (zastępuje hardcoded 8% — finding z klikania) —
  pole konfig "domyślna stawka robocizny" czytane przez costing waterfall.
- Eventy: `production.labor.clocked_in/out` (audit-only P1, z testem emisji).
- RBAC: `production.labor.record` (operator), `production.labor.read`, `settings.labor_rates.manage`.

#### Ekrany i przyciski
1. **Scanner: WO execute hub** — nowe przyciski [Dołączam do WO] / [Schodzę z WO]
   (toggle, wielki target dla rękawic); pasek "na WO pracują: X, Y (od hh:mm)".
2. **WO detail (desktop) — nowa zakładka "Załoga"**: tabela wpisów (kto, od-do, h),
   suma h, koszt (h × stawka). Przycisk [Koryguj wpis] (manager, z powodem — append-only
   korekta, nie edycja in-place; wzór allergen overrides).
3. **/settings/labor-rates** (NOWY) — tabela stawek effective-dated.
   Przyciski: [+ Stawka] / [Nowa stawka od daty] (nie edytuj historycznych — pattern
   item_cost_history).
4. **Shift management (istniejący /production/shifts)** — wzbogacić o realne dane z
   wo_labor_log zamiast wolnotekstowych zmian (styk z naprawą "shift free text").

### Punkty styku
- S-E4-3: clock-in wymaga aktywnej sesji skanera (site+shift) — shift_pattern_id z sesji,
  NIE wolny tekst (zamyka fragmentację "A" vs "SHIFT-A").
- S-E4-4: koszt robocizny do costingu NPD: producer = getWoLaborSummary/stawka domyślna,
  consumer = waterfall "Process labour", test E2E: ustaw stawkę → costing pokazuje
  niezerową robociznę.
- S-E4-5: clock-out automatyczny przy wo complete (hook w complete — nie zostawiać
  wiszących wpisów; test).

#### Plan sprawdzenia (B): operator A dołącza do WO → wpis started; dołącza do WO2 →
auto-clock-out z WO1; complete WO2 → auto-clock-out; zakładka Załoga sumuje h; stawka
50 zł/h → koszt = h×50; korekta wpisu wymaga powodu i zostawia ślad; costing NPD pokazuje
robociznę z konfiguracji.

---

# HORYZONT 2 — plac, pieniądze, planowanie

## FALA E5 — Yard: Gatehouse + Awizacje + Waga (propozycje #1+#2+#3)

**Zależności**: brak twardych od toru napraw (moduł brzegowy). Site'y i magazyny istnieją.

### Backend
- Tabele: NOWE `dock_doors` (org, site, warehouse_id, kod, typ inbound|outbound|both,
  aktywny), `dock_appointments` (org, site, dock_door_id, okno od-do, ref_type po|to|shipment|inne,
  ref_id NULL, przewoźnik tekst/carrier_id NULL, status planned|confirmed|arrived|no_show|done|cancelled,
  notatki, created_by), `yard_visits` (org, site, nr dokumentu YV- z org_document_settings,
  appointment_id NULL — wizyty bez awizacji legalne, rejestracja pojazdu, naczepa, kierowca
  imię+dokument, przewoźnik, cel, plomba_in/out, status at_gate|on_yard|at_dock|loading|
  unloading|departed, gate_in_at, dock_in_at, dock_out_at, gate_out_at, dock_door_id NULL),
  `weighings` (org, yard_visit_id, typ in|out, masa_kg NUMERIC, źródło manual|device,
  device_id NULL, weighed_at, weighed_by) — netto = out-in liczone, nie przechowywane.
- Server Actions: createAppointment/confirm/cancel (kolizje okien per dock!), gateIn
  (tworzy yard_visit; jeśli appointment → link + status arrived), assignDock, startDock /
  endDock, gateOut (walidacja: plomba_out wpisana dla załadunków; ostrzeżenie gdy netto
  vs dokumenty > próg), recordWeighing (manual keypad P1; endpoint device P2),
  getYardBoard, getDockCalendar.
- Walidacja netto: dla wizyt powiązanych z PO → porównaj netto z sumą przyjętych kg w GRN
  tej dostawy (tolerancja % w Settings); dla shipmentów analogicznie (P2 do fali E9).
- Eventy: `yard.visit.gate_in/gate_out`, `yard.appointment.no_show` (worker oznacza po
  oknie+grace). Konsument P1: dashboard inbound (badge "ciężarówka na placu" przy PO).
- RBAC: rodzina `yard.*` (appointment.manage, gate.operate, weighing.record) — enum+seed.

### Ekrany i przyciski
1. **/yard** (NOWY moduł w nav, grupa Operations) — Yard Board: kolumny statusów wizyt
   (kanban: Brama → Plac → Dok → Wyjazd), karta wizyty (pojazd, przewoźnik, cel, czas w
   statusie, dok). Przyciski: [+ Rejestruj wjazd] → modal gate-in (rejestracja — keypad,
   kierowca, cel: dropdown z dzisiejszych awizacji LUB "bez awizacji", plomba) ·
   na karcie: [Przydziel dok] (dropdown wolnych doków) · [Start rozładunku/załadunku] ·
   [Koniec] · [Wyjazd] → modal gate-out (plomba_out, ważenie out jeśli włączone).
2. **/yard/appointments** — kalendarz tygodniowy per dok (siatka godzinowa).
   Przyciski: [+ Awizacja] → modal (dok, okno, typ+referencja PO/TO — picker z otwartych,
   przewoźnik) · drag&drop zmiany okna (P2; P1 = edycja modalem) · [Potwierdź] / [Anuluj] ·
   [No-show] manualny.
3. **/yard/weighbridge** (prosty) — kolejka wizyt oczekujących ważenia.
   Przyciski: [Waż IN] / [Waż OUT] → keypad kg → zapis; po OUT pokazuje netto + porównanie
   z dokumentami (zielone/czerwone z różnicą %).
4. **/settings/infra/docks** — CRUD doków (wzór warehouses). [+ Dodaj dok] / [Edytuj] /
   [Dezaktywuj].
5. **Wpięcia w istniejące**: /warehouse/inbound — kolumna "Awizacja/Status placu" przy
   PO/TO (badge z yard_visits); PO detail — sekcja "Dostawy na placu".

### Punkty styku
- S-E5-1: appointment.ref_id → purchase_orders/transfer_orders (FK miękkie + walidacja
  istnienia w akcji; picker tylko z otwartych PO/TO).
- S-E5-2: inbound badge: producer = yard status, consumer = warehouse inbound page, test:
  gate-in z referencją PO → badge na inbound w ≤1 odświeżeniu.
- S-E5-3: netto vs GRN: porównanie używa kg (uom konwersja przez lib/uom gdy linie w szt).
- S-E5-4: numeracja YV- przez org_document_settings (0.8) — dopisać typ dokumentu.
- S-E5-5: site_id wszędzie (wizyty są per site!) — RLS org + filtr site z kontekstu.
- S-E5-6: kolizje okien doków — constraint/walidacja serwerowa (nie tylko UI kalendarza).

### Plan sprawdzenia E5
1. Dodaj 2 doki → awizacja PO-X jutro 8:00-9:00 dok D1 → druga awizacja D1 8:30 → odmowa
   kolizji. 2. Gate-in z awizacją → wizyta arrived, badge na inbound przy PO-X. 3. Przydziel
   dok → start → przyjmij PO skanerem (równolegle) → koniec → waż out → gate-out; netto vs
   GRN w tolerancji → zielono. 4. Gate-in BEZ awizacji (walk-in) → działa. 5. No-show:
   awizacja bez gate-in po oknie → status no_show (worker lub przycisk). 6. Ważenie:
   in 18 000 kg, out 14 000 → netto 4 000 vs GRN 3 900 (2,5%) → w progu 3% zielono; zmień
   próg na 2% → czerwono. 7. Wizyta na site B niewidoczna w kontekście site A. 8. YV-numeracja
   rośnie wg formatu z Settings/Documents. 9. Wiring eventów gate_in/out.

---

## FALA E6 — MRP + prognozy (propozycja #17)

**Zależności**: [WYMAGA: F-A01 — stany muszą być widoczne]; BOM-y wieloskładnikowe
[WYMAGA: F-B01]. Schema JUŻ JEST: mrp_runs, mrp_requirements, mrp_planned_orders,
reorder_thresholds (mig 178) — NIE tworzyć nowych tabel bez sprawdzenia istniejących.

### Backend
- Tabele: istniejące 4 + NOWE `demand_forecasts` (org, site, item_id, tydzień ISO, qty,
  uom, źródło manual|import, created_by) — UWAGA: planning-ext PRD też definiuje
  demand_forecasts — użyć jednej definicji (styk z przyszłą falą E8!).
- Server Actions: runMrp (wejście: horyzont tyg.; logika: zapotrzebowanie = forecast +
  potwierdzone SO P2 − stany dostępne (v_inventory_available!) − PO/TO/WO w drodze;
  eksplozja przez AKTYWNE BOM-y; wynik: mrp_requirements + mrp_planned_orders typu
  buy|make|transfer), convertPlannedToPo (grupowanie po dostawcy → szkic PO z pickerem
  dostawcy z PLANNING master), convertPlannedToWo (szkic WO), upsertForecast, importForecastCsv,
  upsertReorderThreshold.
- Eventy: `planning.mrp.completed` (payload: run_id, liczby) — konsument: dashboard
  planning KPI.
- RBAC: `planning.mrp.run`, `planning.mrp.convert`, `planning.forecast.manage` — enum+seed.

### Ekrany i przyciski
1. **/planning/mrp** (NOWY; usunąć 404) — góra: [Uruchom MRP] (modal: horyzont, site) +
   status ostatniego przebiegu; tabela wyników per item: zapotrzebowanie, pokrycie,
   brakujące, propozycja (buy/make, qty, data potrzeby), tygodniowy heatmap pokrycia.
   Przyciski: [Zaznacz wszystkie buy od dostawcy X] → [Utwórz PO] → przekierowanie do
   szkicu PO z liniami · [Utwórz WO] dla make · [Odrzuć propozycję] (z powodem) ·
   [Szczegóły] → drawer: skąd zapotrzebowanie (forecast/SO/WO-materiał), eksplozja BOM.
2. **/planning/forecasts** (NOWY) — siatka item × tydzień (12 tyg.), edycja inline.
   Przyciski: [Import CSV] (wzór items/import 4-krokowy) · [Kopiuj poprzedni tydzień] ·
   [+ Dodaj produkt].
3. **/planning/reorder-points** (NOWY prosty) — tabela progów min/max per item+magazyn.
   [+ Próg] / [Edytuj]. Item poniżej min → wiersz w MRP nawet bez forecastu.
4. **Wpięcie**: landing /planning — kafel "MRP: ostatni przebieg, N propozycji" (zastąpić
   martwy przycisk "Run MRP" prawdziwym linkiem).

### Punkty styku
- S-E6-1: stany = v_inventory_available (PO NAPRAWIE F-A01) — NIE własne query po LP.
- S-E6-2: BOM = bom_headers status active (SSOT) — test: item z draftem bez active → MRP
  zgłasza "brak aktywnego BOM" zamiast liczyć z draftu.
- S-E6-3: convertPlannedToPo → dostawca z PLANNING suppliers (po unifikacji rejestrów —
  decyzja toru napraw; jeśli niezunifikowane: jawnie planning master).
- S-E6-4: "w drodze" = PO confirmed+partially_received (reszta linii!) + TO in_transit +
  WO released/in_progress (output oczekiwany) — każda składowa z testem.
- S-E6-5: forecast w uom bazowym itemu; konwersje przez lib/uom.
- S-E6-6: wspólna tabela demand_forecasts z falą E8 (scheduler) — jedna definicja, dwóch
  konsumentów.

### Plan sprawdzenia E6
1. Forecast FG 100 kg/tydz ×4 tyg.; stan 0; aktywny BOM FG (2 RM). 2. Run MRP → planned
   make FG 4×100 + planned buy RM wg eksplozji minus stany RM. 3. Przyjmij 50 kg RM →
   ponów MRP → buy zmalał o 50. 4. Utwórz PO z propozycji → szkic z poprawnymi liniami,
   cena z ostatniej ceny PO (jeśli brak — puste, do ręcznego). 5. Utwórz WO → szkic na FG.
6. Reorder point: item bez forecastu poniżej min → pojawia się w MRP. 7. Item bez aktywnego
   BOM → sekcja "wymaga uwagi", nie wynik. 8. Run zapisany w mrp_runs (status, czas);
   wiring event planning.mrp.completed. 9. CSV import forecastu: błędne wiersze raportowane
   per numer wiersza.

---

## FALA E7 — Rozbiór / disassembly BOM (propozycja #9)

**Zależności**: [WYMAGA: F-B01 BOM multi-line, F-B08 output→LP, F-B10 zalecane (trigger
sumy alokacji)]. Schema bom_co_products ISTNIEJE (mig 159) z allocation_pct.

### Backend
- Model: BOM typu "disassembly" = nagłówek z flagą NOWĄ `bom_headers.bom_type`
  forward|disassembly (migracja: kolumna + CHECK; default forward). Dla disassembly:
  1 linia wejściowa (tusza/element) + N bom_co_products jako WYJŚCIA z expected_yield_pct
  i allocation_pct (koszt). WO na taki BOM = "WO rozbioru": konsumuje wejście, rejestruje
  WIELE outputów.
- Server Actions: rozszerzyć createBomDraft o bom_type + walidacje disassembly (suma
  expected_yield ≤ 100+tolerancja; suma allocation = 100 — V-TEC-12); registerDisassemblyOutput
  (jeden ekran, wiele pozycji naraz: co-product → qty kg → LP per pozycja); getYieldReport
  (plan vs rzeczywiste uzyski per WO/partia/okres).
- Koszt: koszt wejścia (LP × cost_per_kg) alokowany na outputy wg allocation_pct →
  zapis do item_cost_history outputów ze źródłem `disassembly_allocation` (rozszerzyć
  enum źródeł) — przez ISTNIEJĄCY writeItemCostLedger (jedyny writer kosztu! F-PASS I-15).
- Eventy: `production.disassembly.completed` (payload: wejście, outputy, uzyski).
- RBAC: istniejące production.output.* pokrywa; BOM disassembly = technical.bom.create.

### Ekrany i przyciski
1. **BOM detail — wariant disassembly**: sekcja "Wejście" (1 pozycja) + tabela "Wyjścia"
   (co-product, oczekiwany uzysk %, alokacja kosztu %, suma w stopce z walidacją na żywo).
   Przyciski: [+ Dodaj wyjście] → modal (item picker typ co_product/fg, uzysk, alokacja) ·
   [Edytuj] / [Usuń] (tylko draft) · standardowy cykl Approve/Publish.
2. **Kreator BOM** (istniejący) — krok 1 dostaje przełącznik typu [Forward | Rozbiór].
3. **WO rozbioru — Output tab (wariant)**: tabela wszystkich zdefiniowanych wyjść z
   polami qty (keypad per wiersz), kolumna "oczekiwane kg" (wejście × uzysk%), odchyłka %
   na żywo. Przyciski: [Zarejestruj wszystkie] → registerDisassemblyOutput (tworzy N LP +
   N wo_outputs w jednej transakcji) · [Drukuj etykiety] (fala E1) dla wszystkich naraz.
4. **Scanner: WO rozbioru** — lista wyjść jako duże kafle z keypadem (jeden ekran,
   przewijany), [Zatwierdź wszystko].
5. **/production/yield-report** (NOWY) — plan vs rzeczywisty uzysk: per WO, per produkt,
   per okres; tabela + odchyłki kolorowane. Przycisk [Eksport CSV].

### Punkty styku
- S-E7-1: alokacja kosztu → wyłącznie writeItemCostLedger (single writer).
- S-E7-2: outputy → LP z genealogią parent = LP wejściowy (wszystkie N dzieci jednego
  rodzica — trace fala E2 pokaże drzewo rozbioru; TEST integracyjny z trace!).
- S-E7-3: catch-weight: wyjścia rozbioru zwykle catch-weight — qty z wag per LP.
- S-E7-4: walidacja sumy alokacji server-side (nie tylko stopka UI) — B10.
- S-E7-5: registerDisassemblyOutput = atomowe (N outputów albo nic).

### Plan sprawdzenia E7
1. BOM rozbioru: wejście "półtusza", wyjścia: schab 18%/30%, karkówka 12%/20%, boczek
   15%/25%, kości 30%/5%, tłuszcz 20%/20% (alokacja=100) → aktywuj. 2. Suma alokacji 95 →
   walidacja blokuje. 3. WO na 200 kg wejścia → start → konsumuj LP wejściowy → zarejestruj
   wyjścia (36/24/30/60/40 kg) → 5 LP powstaje, każdy z parentem. 4. Trace backward ze
   schabu → pokazuje półtuszę i jej GRN. 5. Koszt: wejście 200 kg×10 zł=2000 → schab dostaje
   600 zł/36 kg=16,67 zł/kg w cost_history (źródło disassembly_allocation). 6. Yield report:
   schab plan 18% vs real 18% OK; zmień jedną wagę → odchyłka widoczna. 7. Odchylenie
   sumy uzysków > tolerancji → ostrzeżenie przy rejestracji (nie twardy blok — straty
   naturalne). 8. Etykiety dla 5 LP jednym przyciskiem.

---

## FALA E-IO — Bulk import/eksport Excel (WO/PO/TO + silnik przekrojowy)

**Cel**: masowe tworzenie dokumentów z Excela (planista dostaje plan tygodnia w xlsx i
wrzuca go jednym ruchem) + eksport każdej listy do Excela. Budujemy JEDEN silnik i
adaptery per encja — nie N osobnych importerów (anty-zakres!).
**Zależności**: brak twardych dla importu jako DRAFT (PO/TO/WO create działa); release
zaimportowanych WO podlega bramce B9 jak każde WO [WYMAGA: F-C01 dla startu produkcji].
Istniejące zasoby do reużycia: tabela `import_export_jobs` + hub `/settings/import-export`
(panel "Settings entities" czeka właśnie na workera!), wzorzec kreatora 4-krokowego z
`/technical/items/import` (upload→walidacja→diff→commit), exceljs (planowany dla D365
Buildera), worker `apps/worker`.

### Backend — silnik wspólny
- Tabele: `import_export_jobs` (ISTNIEJE — rozszerzyć o: entity_type enum, direction
  import|export, file_id wejściowy, result_file_id (raport błędów / plik eksportu),
  stats_jsonb {rows_total, ok, failed, skipped}, status queued|processing|done|failed,
  idempotency_key). NOWE nic więcej — żadnych tabel per encja.
- Architektura: **rejestr adapterów importu** — adapter per encja deklaruje: (a) szablon
  (kolumny: nazwa, typ, wymagana, dozwolone wartości, przykładowy wiersz), (b) walidator
  wiersza (zwraca błędy z numerem wiersza i kolumną), (c) komit wiersza/grupy (która
  ISTNIEJĄCA Server Action tworzy byt — adapter NIE pisze do DB bezpośrednio; lekcja
  single-writer). Eksport analogicznie: adapter deklaruje kolumny + źródłowe query
  (to samo, którego używa lista ekranowa — z jej filtrami).
- Server Actions: downloadImportTemplate(entityType) → xlsx z nagłówkami + wierszem
  przykładowym + arkuszem "Instrukcja" (dozwolone wartości, formaty dat); createImportJob
  (upload, parsowanie, walidacja WSZYSTKICH wierszy przed jakimkolwiek zapisem, zwrot
  podglądu); commitImportJob (zapis przez akcje kanoniczne; tryb all-or-nothing LUB
  "pomiń błędne" — wybór usera w kroku 3); downloadErrorReport (wejściowy plik + kolumna
  "Błąd" przy każdym odrzuconym wierszu); createExportJob(entityType, filters) → xlsx.
- Wykonanie: pliki ≤500 wierszy synchronicznie; większe → worker (job w import_export_jobs;
  limit twardy np. 5 000 wierszy/plik — komunikat, nie ścięcie po cichu).
- Idempotencja: kolumna szablonu "Ref zewn." (external_ref) — ponowny import tego samego
  pliku nie dubluje dokumentów (unikalność org+entity+external_ref; wiersz duplikat →
  skipped w raporcie).
- Eventy: `io.import.completed` / `io.export.completed` (payload: entity, stats) — emiter
  commit/export, konsument: powiadomienie + audit; dokumenty utworzone importem emitują
  SWOJE zwykłe eventy (po/to/wo created — skoordynować z F-D01, gdzie po/to eventy są
  do zadeklarowania).
- RBAC: import używa uprawnienia CREATE danej encji (np. planning.po.create) + NOWE
  `io.export.run` dla eksportów (eksport = wyciek danych — osobne uprawnienie, seed do
  ról admin/manager).

### Adaptery importu — transza 1 (ta fala)
| Encja | Kolumny szablonu (minimum) | Komit przez | Walidacje kluczowe |
|---|---|---|---|
| **PO bulk** | external_ref, dostawca (kod), item (kod), qty, uom, cena, waluta, data dostawy, magazyn docelowy, notatka | createPurchaseOrder (grupowanie wierszy po dostawcy+external_ref → 1 PO z N liniami) | dostawca istnieje w planning master; item aktywny; uom zgodny z itemem (lib/uom); data ≥ dziś; waluta ISO |
| **TO bulk** | external_ref, magazyn z, magazyn do, item, qty, uom, data | createTransferOrder (grupowanie jw.) | magazyny różne i istnieją; item aktywny |
| **WO bulk** | external_ref, produkt FG (kod), qty, uom, data plan., linia (kod), priorytet | createWorkOrder per wiersz | FG ma AKTYWNY BOM (inaczej wiersz failed z powodem "brak aktywnego BOM" — NIE tworzyć WO-zombie bez materiałów, lekcja F-B03); linia istnieje; konwersja uom JAWNA w podglądzie (lekcja F-D08a: pokazać "100 szt → 50 kg" w kroku diff!) |

Dokumenty powstają jako **DRAFT** z numeracją z org_document_settings (0.8); external_ref
zapisany na dokumencie (kolumna nowa, indeks unikalny org+typ+external_ref NULL-owalny).

### Eksporty — transza 1
Przycisk [Eksport do Excela] na listach: PO, TO, WO (z filtrami i tabami statusów jak na
ekranie), items, BOM-y (nagłówki + arkusz linii), stany magazynowe (v_inventory_available),
LP lista, GRN-y. Plik = kolumny widoczne + klucze techniczne (kody, nie UUID), arkusz
"Parametry" (kto, kiedy, filtry).

### Ekrany i przyciski
1. **/planning/import** (NOWY) — hub importu planowania, 3 kafle: PO / TO / WO.
   Każdy kafel: [Pobierz szablon] → downloadImportTemplate · [Importuj plik] → kreator
   4-krokowy (wzór items/import): (1) upload xlsx → (2) walidacja: tabela wierszy ze
   statusem ok/błąd per wiersz, licznik "47 ok / 3 błędy", [Pobierz raport błędów] →
   (3) podgląd skutków: ile dokumentów powstanie, grupowanie linii, JAWNE konwersje uom,
   przełącznik [Wszystko albo nic | Pomiń błędne] → (4) [Zatwierdź import] → ekran wyniku
   z linkami do utworzonych dokumentów.
2. **Listy PO/TO/WO** — przycisk [Importuj] (→ hub z pre-wyborem encji) obok istniejącego
   [+ Nowy]; przycisk [Eksport xlsx] na pasku filtrów (eksportuje TO CO WIDAĆ z filtrami).
3. **/settings/import-export** (ISTNIEJE) — ożywić: tabela WSZYSTKICH jobów (import i
   eksport, każdej encji) ze statusem, statystyką, [Pobierz raport/plik] · panel "Settings
   entities" przestaje być disabled (worker z tej fali go zasila).
4. **Pozostałe listy z eksportem** — sam przycisk [Eksport xlsx] (bez importu): inventory,
   license-plates, grns, cost history, allergen matrix, compliance, revisions.

### Punkty styku
- S-IO-1: komit WYŁĄCZNIE przez kanoniczne akcje create (nie INSERT-y adaptera) — dzięki
  temu walidacje, numeracja, eventy i RBAC działają identycznie jak przy ręcznym tworzeniu.
  Test: PO z importu nieodróżnialne od ręcznego (te same pola, event, numer wg formatu).
- S-IO-2: external_ref unikalny — ponowny upload tego samego pliku → 0 nowych dokumentów,
  wszystkie wiersze "skipped (duplikat)".
- S-IO-3: konwersje uom w podglądzie kroku 3 — liczba pokazana użytkownikowi MUSI równać
  się liczbie zapisanej (wiring-test na lib/uom; lekcja cichej konwersji 100 szt→50 kg).
- S-IO-4: dostawca/item/linia resolwowane po KODACH (nie UUID) — kody są stabilne w
  Excelu; błąd wiersza wskazuje kolumnę i wartość ("dostawca 'SUP-XX' nie istnieje").
- S-IO-5: eksport używa query listy ekranowej (jeden reader) — liczba wierszy w pliku ==
  liczba na ekranie przy tych samych filtrach (test).
- S-IO-6: worker path: job >500 wierszy przetwarza się w tle, status na hubie się
  odświeża, powiadomienie po zakończeniu; awaria workera → job failed z komunikatem,
  ŻADNYCH częściowych zapisów bez raportu.
- S-IO-7: RBAC — user bez planning.po.create nie zaimportuje PO (403 w kroku commit, a
  kafel disabled z tooltipem); io.export.run wymagany dla eksportu.
- S-IO-8: import WO nie omija bramki B9 — tworzy DRAFT; release nadal przez standardową
  ścieżkę z walidacjami.

### Plan sprawdzenia E-IO
1. Pobierz szablon PO → wypełnij 5 wierszy (2 dostawców, w tym 1 błędny kod itemu) →
   upload → walidacja: 4 ok / 1 błąd ze wskazaniem kolumny → raport błędów otwiera się w
   Excelu z kolumną "Błąd". 2. Tryb "pomiń błędne" → commit → powstają 2 PO (grupowanie po
   dostawcy), linie się zgadzają, numery wg formatu z Settings, status Draft. 3. Ponowny
   upload tego samego pliku → 0 nowych (duplikaty po external_ref). 4. Tryb "wszystko albo
   nic" z 1 błędem → 0 dokumentów. 5. WO bulk: wiersz z FG bez aktywnego BOM → failed z
   powodem; wiersz z "100 szt" → podgląd pokazuje "100 szt → 50 kg" PRZED commitem.
6. Plik 600 wierszy → job w tle → status processing → done → dokumenty są. 7. Eksport WO
   z filtrem "In progress" → plik ma dokładnie tyle wierszy co lista. 8. Cross-org: job
   orga A niewidoczny dla orga B. 9. RBAC: viewer bez create → kafel disabled; bez
   io.export.run → brak przycisku eksportu. 10. Wiring: io.import.completed emitowany,
   po/to/wo created emitowane per dokument.

### Adaptery — transze kolejne (dopisywać do rejestru, bez zmian silnika)
- **Transza 2 (z falą E6)**: prognozy popytu (item × tydzień), progi min/max (reorder).
- **Transza 3 (z E4B/E5/E8)**: stawki robocizny, macierz changeover, awizacje dostaw
  (dostawca przysyła xlsx), kalendarz zmian.
- **Transza 4 (master data, rozbudowa istniejących CSV→xlsx)**: items (jest CSV — ujednolicić
  na silnik), BOM-y wielopoziomowe (arkusz nagłówków + arkusz linii), dostawcy, klienci,
  cenniki zakupowe (gdy powstaną w E9), wartości odżywcze per RM (nutrition_per_100g —
  duża wartość: technolog ma je w Excelu!), profile alergenowe RM (przez kanoniczny
  upsertProfile — SSOT!), lokalizacje (jest CSV), zakresy temperatur (E2B).
- **Eksporty kolejne**: wyniki MRP (E6), yield report (E7), plan produkcji/Gantt (E8),
  odczyty CCP + odchylenia (E3 — audytor prosi o to w Excelu), rejestr wizyt yard (E5),
  scorecard dostawców (E9), trace report jako xlsx obok PDF (E2).

---

# HORYZONT 3 — ekosystem (skróty planistyczne — rozpisać analogicznie przy starcie)

## FALA E8 — Scheduler z sekwencjonowaniem alergenowym (#18)
Schema gotowa (mig 204). Ekrany: /scheduler (tablica przebiegów + [Uruchom planowanie]),
/scheduler/board (Gantt linii × czas, drag&drop assignmentów, badge konfliktów
alergenowych/changeover), /scheduler/changeover-matrix (edycja macierzy czasów),
/scheduler/config. Backend: solver (heurystyka grupowania po profilu alergenowym z
item_allergen_profiles → minimalizacja myć), scheduler_runs/assignments, akcja
applySchedule → aktualizuje scheduled_date WO. STYKI: profil alergenowy = SSOT
item_allergen_profiles (decyzja #3); changeover_matrix współdzielona z falą E4/CIP;
forecast z E6. WERYFIKACJA: 6 WO (3 z glutenem, 3 bez) → plan grupuje bezglutenowe przed
glutenowymi na tej samej linii; ręczne przeciągnięcie łamiące → czerwony konflikt;
apply → daty WO zmienione.

## FALA E9 — Fracht + scorecard dostawców (#5+#13)
Carriers CRUD (/planning/carriers), stawki per lane (tabele transport_lanes z PRD 14 —
jedna definicja!), koszt frachtu na shipment → krok Logistics w costingu. Scorecard:
/planning/suppliers/[id]/scorecard — KPI z istniejących danych (terminowość PO vs GRN,
odchyłki wag z E5, NCR, expiry speców). STYKI: lane'y współdzielone z multi-site;
koszt → waterfall (producer/consumer test jak S-E4-4).

## FALA E10 — Naważalnia/kitting (#10) + Inwentaryzacja (#15)
Kitting: kolejka naważek z wo_materials, stanowisko wagowe (tolerancja z
variance_tolerance_pct), dual-check przy alergenach (porównanie profili przez SSOT), kit
jako LP z genealogią składników. Inwentaryzacja: zlecenia liczenia (cykl ABC), scanner
kafel "Count", ślepe liczenie, rozjazd → korekta z approvalem (e-sign) + audit_events.
STYKI: korekta stanów = jedyny legalny writer ilości LP poza consume/receive/move —
wymaga decyzji właściciela (warehouse) + append-only historia.

## FALA E11 — Reklamacje → NCR → CAPA (#14)
/quality/complaints (rejestr z partią/wysyłką → picker z trace), konwersja [Utwórz NCR]
(istniejący moduł NCR z wave7!), CAPA (działania z terminami, właścicielami, statusem).
STYKI: complaint→partia przez trace (E2); NCR istniejący — nie duplikować.

## FALA E12 — Portal B2B (#19) + Asystent AI (#20)
B2B: osobna powierzchnia auth (rola customer, scope: własne SO/wysyłki/dokumenty) —
UWAGA styk: RLS musi dostać wymiar customer_id (duża decyzja architektoniczna — osobny
spec przed startem). AI: read-only tool-calling na istniejących akcjach listujących +
trace; każda odpowiedź z linkiem źródłowym; zero writerów.

---

## PLAN SPRAWDZENIA CAŁOŚCI (cross-wave, po każdej fali)

**Złoty scenariusz E2E (rozszerzany falami)** — odpalany na żywym deployu po każdej fali:
1. [bazowy, po naprawach] dostawca → item RM (koszt+alergen+nutrition) → FG → BOM
   multi-line → routing → spec approved → PO → awizacja (E5) → gate-in (E5) → przyjęcie
   częściowe z temp (E2B) + etykieta (E1) → put-away → WO → start → clock-in (E4B) →
   consume LP → odczyt CCP (E3) → output multi (E7) + etykiety → QA release → trace PDF
   (E2A) → MRP widzi stany (E6) → andon pokazywał przebieg (E4A).
2. Po każdej fali: pełny przebieg + assert nowych ogniw; czas przebiegu logowany (regresja
   wydajności).
3. **Testy styków**: każdy S-x-y z tego dokumentu = minimum 1 test automatyczny (wiring)
   + 1 krok w skrypcie klikania.
4. **Sweep martwych przycisków**: po fali agent klikający przechodzi WSZYSTKIE nowe ekrany
   wzorem audytu 2026-06-11 (każdy przycisk: działa / disabled-z-tooltipem; żadnych no-op).
5. **Sweep kontraktów**: grep nowych event types → emiter+konsument; nowe kolumny →
   producer+consumer; nowe enumy → jeden słownik.
6. **RLS**: każda nowa tabela w teście cross-org (org B nie widzi danych org A) + advisors
   Supabase bez nowych ERROR.
7. **RBAC**: nowe permission strings w enum+seed; test 403 dla roli bez uprawnienia.
8. **i18n**: 0 surowych kluczy na ekranach (automat: grep renderu po wzorcu \w+\.\w+\.\w+).

## KOLEJNOŚĆ I BRAMKI WEJŚCIA

| Fala | Wejście dozwolone gdy | Szac. rozmiar |
|---|---|---|
| E1 etykiety | F-B08, F-B07 zamknięte | M |
| E2 trace+cold chain | F-B08, F-B07, F-A01 zamknięte (cold chain: od razu) | M |
| E3 HACCP | od razu (holds działają) | L |
| E4 andon+robocizna | F-C01, F-A01 zamknięte (produkcja startuje) | M/L |
| E5 yard | od razu (moduł brzegowy) | L |
| E6 MRP | F-A01, F-B01 zamknięte | M/L |
| E7 rozbiór | F-B01, F-B08 zamknięte + E1 zalecana | L |
| E-IO bulk import/eksport | od razu (PO/TO/WO create działa; dokumenty powstają jako DRAFT) | M |
| E8-E12 | po H1+H2; E12 wymaga osobnego specu auth | — |

Sugerowane pary równoległe (różne moduły, brak wspólnych plików): E3+E5 · E1+E4A ·
E2+E4B · E-IO+E3 (silnik IO nie dotyka quality) · E6+E7 sekwencyjnie po naprawach BOM.
E-IO warto wciągnąć WCZEŚNIE: transza 2 (prognozy) jest wejściem dla E6, a transza 4
(nutrition/alergeny RM z Excela) przyspiesza zasilenie danymi każdej kolejnej fali.

## CZEGO NIE ROBIĆ (anty-zakres)

- Nie budować drugiego rejestru dostawców/przewoźników — przewoźnik to typ partnera albo
  planning master (decyzja przy E5/E9, JEDNA tabela).
- Nie pisać własnych agregacji stanów — tylko v_inventory_available.
- Nie dodawać kolumn ilości poza license_plates (I-07).
- Nie tworzyć nowych mechanizmów numeracji, e-sign, idempotencji, konwersji UoM, druku —
  istnieją kanoniczne.
- Nie wprowadzać event types bez emitera+konsumenta+testu.
- Żadnych "coming soon" bez tooltipa wyjaśniającego i wpisu w backlogu.
