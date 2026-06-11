# MonoPilot — raport z żywego przeklikania aplikacji (2026-06-11)

Audyt kliknięty ręcznie (Playwright) na deployu produkcyjnym
`monopilot-kira-git-main-codermariuszs-projects.vercel.app`, stan ~commit 8273cd45.
Trasa: Settings → Technical → NPD → Planning → Warehouse → Production → Scanner.
Metoda: realny łańcuch fabryczny na danych testowych `AUDIT2-*` (dostawca → surowiec →
FG → BOM → routing → spec → PO → przyjęcie częściowe → WO → konsumpcja → output → trace).

Uwaga: lokalny dev (`pnpm dev` na starym checkoucie) ma DODATKOWO zepsuty org-context
(`DATABASE_URL_OWNER` w apps/web/.env.local wskazuje RLS-owanego usera → ~25 ekranów
Settings "Unable to load" tylko lokalnie). Hasło admina na żywo: `Admin2026!!!` (3×!),
a `scripts/setup-dev.sh` dokumentuje `!!` — do ujednolicenia.

---

## 0. ŁAŃCUCH FABRYCZNY — gdzie się rwie (najważniejsza sekcja)

| # | Ogniwo | Status | Punkt zerwania |
|---|---|---|---|
| 1 | Master data (site, linia, maszyna, magazyn, zmiana, dostawca, proces) | ✅ działa | drobiazgi: ekrany linii/maszyn POZA nawigacją; UUID w dropdownach |
| 2 | Tabele referencyjne (alergeny, UoM, waluty, kraje) | ❌ DEAD END | `/settings/reference` — każdy zapis → `invalid_input`, 4 tabele puste i nie do wypełnienia |
| 3 | Operacje produkcyjne (manufacturing operations) | ❌ DEAD END | create → `invalid_input` (brak pola Industry w modalu, tabela wymaga industry_code); Edit/Delete wyłączone na wszystkich wierszach |
| 4 | Item RM + koszt + nutrition + alergeny + spec dostawcy | ✅ działa | ale rozbite na 4 ekrany po utworzeniu (wizard nie ma kosztu/dostawcy/nutrition/alergenów) |
| 5 | Item FG | ✅ działa | brak ceny sprzedaży GDZIEKOLWIEK |
| 6 | **BOM wieloskładnikowy** | ❌ **KRYTYCZNE** | każde "Add component" tworzy NOWĄ 1-linijkową wersję zamiast dopisać linię — receptura z >1 składnika niemożliwa przez UI |
| 7 | Routing | ⚠️ działa "na ślepo" | builder ma PUSTE etykiety/przyciski (i18n) — użytkownik nie wie co klika |
| 8 | **Factory spec → approve** | ❌ **CATCH-22** | bundle approval wymaga BOM draft/in_review, a BOM już opublikowany (active); nie ma UI cofnięcia BOM do draft → spec wiecznie in_review |
| 9 | PO (zamówienie surowca) | ✅ działa | cena zawsze ręczna (brak cennika dostawcy, brak podpowiedzi z kosztu itemu); AUDIT2-SUPPLIER z Settings NIEWIDOCZNY (dwa rozłączne rejestry dostawców) |
| 10 | Przyjęcie częściowe (40/100 kg) | ✅ działa (tylko skaner) | LP+GRN powstają, PO → "Partially received". ALE: data przydatności WYRZUCANA (LP bez expiry), brak wyboru lokalizacji (wszystko ląduje w LOC1·FG), desktop nie ma przyjęć w ogóle, PO nie pokazuje postępu per linia |
| 11 | Detal palety (LP) | ❌ CRASH | każdy LP detail → server error (digest 1984471676) → Move/Split/Block/Print nieosiągalne |
| 12 | Stan magazynowy | ❌ **KRYTYCZNE** | inventory browser = 0 wierszy mimo 5 palet — agregacja wymaga statusu `available`, a przyjęcie zapisuje `received` i QA release tego nie zmienia |
| 13 | **Start WO** | ❌ **KRYTYCZNE** | KAŻDE Released WO → 409 `factory_release_missing` (skutek #8). W systemie nie ma WO, które da się wystartować z UI |
| 14 | Konsumpcja z palety | ❌ **KRYTYCZNE** | picker LP pusty: wymaga `status='available' AND qa_status='released'`, magazyn zapisuje `status='received'` → rozjazd słowników; ścieżka "bez LP" działa, ale nie zdejmuje stocku |
| 15 | Output produkcji | ⚠️ połowiczne | rejestruje qty/batch, ALE nie tworzy LP (wo_outputs.lp_id NULL), brak pola expiry, brak lokalizacji, catch-weight = zwykły modal bez wag per sztuka (desktop); skaner MA pole actual weight |
| 16 | Waste | ❌ skaner / ✅ desktop | skaner: zawsze 422 "Invalid waste quantity or category"; desktop działa (1 kategoria seed) |
| 17 | Zamknięcie WO (Close) | ❌ DEAD END | e-podpis żąda PIN, ale nie istnieje UI zarządzania PIN; PIN współdzielony z loginem skanera (1 rekord user_pins) |
| 18 | Genealogia / traceability | ❌ pusta z konstrukcji | konsumpcja bez LP + output bez LP ⇒ lp_genealogy nigdy się nie zapełni |
| 19 | TO (transfer między magazynami) | ❌ **integralność danych** | "Receive" = goła zmiana statusu: przyjęto 25 kg FG, którego NIGDZIE nie ma — żadnego GRN/LP/stocku, zero walidacji dostępności przy Ship |
| 20 | OEE | ❌ nic nie pisze | oee_snapshots = 0 wierszy po pause/resume/complete; ekran /oee = stub |

**Wniosek:** pojedyncze moduły są zaskakująco kompletne, ale łańcuch rwie się w 6 miejscach
na styku modułów (8→13→14→15→18 to jedna kaskada). Sednem są DWA defekty: (a) Catch-22
spec↔BOM, (b) rozjazd słownika statusów LP magazyn↔produkcja. Naprawa tych dwóch odblokuje
produkcję end-to-end.

---

## 1. SETTINGS (żywy deploy)

**Działa:** sites, lines (+sekwencja maszyn), machines, warehouses+locations (z importem CSV),
shifts, units (/settings/units), partners, processes (z costingiem per_hour/per_run),
users (invite modal), documents (numeracja PO/TO/WO z podglądem), import-export (master data).

**Dead endy:**
- `/settings/reference` — alergeny/UoM/waluty/kraje: zapis → `invalid_input` bez wskazania pola; 4 tabele uniwersalne puste (HIGH — alergeny EU-14 to fundament food safety).
- Manufacturing operations: create → "Unable to create"; modal nie ma pola Industry, którego wymaga tabela; Edit/Delete trwale wyłączone (HIGH).
- Panel "lines" na ekranie Sites zawsze "No production lines assigned" mimo licznika "5 lines" (MED).

**Martwe przyciski:** `/settings/products` "+ New product"/"Import CSV" disabled bez wyjaśnienia; klik w wiersz linii nic nie robi.

**Braki nawigacji:** `/settings/infra/lines`, `/settings/infra/machines`, `/settings/infra/locations` DZIAŁAJĄ, ale nie ma ich w menu (dostęp tylko z URL).

**Duplikacja:** UoM w dwóch miejscach (/settings/units = realne dane; /settings/reference UoM = pusta tabela) — dwa źródła prawdy.

**Kosmetyka systemowa:** dropdowny pokazują surowe UUID (site przy linii, lokalizacja przy maszynie, site przy zmianie) + literal `__none__`; kod maszyny zapisywany lowercase; audit log renderuje surowy SQL EXPLAIN; sw.js 404 na każdej stronie.

## 2. TECHNICAL

**Działa:** dashboard (realne KPI), items (55) + wizard 4-krokowy (z catch-weight: nominal/
tare/gross/variance — persystują!), materials, supplier specs (approve-now), cost history
z regułą >20% approver, allergen declaration + matrix + contamination-risk, compliance
(żywy silnik — sam wykrył braki AUDIT2-FG1), shelf-life, ECO, revisions, items/import CSV,
BOM snapshots, traceability UI.

**Krytyczne/wysokie:**
- **BOM: "Add component" forkuje nową 1-linijkową wersję** zamiast dopisać linię (CRITICAL — patrz łańcuch #6). Statusy działają (Draft→Approve→Publish→Active), edycja linii poprawnie zablokowana na active.
- **Routings: cały builder bez etykiet** (puste nagłówki, przyciski bez tekstu, "undefined1 undefined") — funkcjonalnie działa, wizualnie nieużywalny (HIGH).
- `/technical/lab-results` — crash Server Components (HIGH).
- Nutrition panel: tylko FG z NPD; FG z Technical nie do wybrania; brak wyliczenia nutrition z BOM (HIGH).
- Spec fabryczny: pułapka sekwencji approve (CRITICAL — łańcuch #8).
- Kaskada alergenów: strona read-only jednego produktu, bez selektora i bez przycisku przeliczenia (MED).
- Quick actions dashboardu (`?modal=create`) nie otwierają modala (MED).
- Dropdown dostawców w spec pokazuje tylko SUP-* (AUDIT2-SUPPLIER odfiltrowany bez wyjaśnienia).

**Brakujące pola (nigdzie w aplikacji):** cena sprzedaży FG, cena zakupu/MOQ/lead time u dostawcy, stawki robocizny/overhead, EAN per poziom opakowania, temperatura przechowywania.

## 3. NPD

**Działa:** dashboard z realnymi KPI, wizard projektu (NPD-006), brief, formulation editor
(picker WIDZI itemy Technical + link "Open item in Technical", koszt liczy się z item cost,
kompozycja % działa), trial log, packaging (picker PKG-* z Technical, koszt autofill),
pilot plan, FA list/detail (AUDIT2-FG1 widoczny, taby odblokowywane przez Close Core),
handoff (na launched projekcie) z eksportem JSON.

**Krytyczne/wysokie:**
- **Alergeny w formulation: zawsze "Absent"** mimo musztardy zadeklarowanej na AUDIT2-RM1 — panel nie czyta item-master (HIGH, **food safety: fałszywie negatywna deklaracja**).
- **Nutrition w formulation: zawsze puste** — linie receptury trzymają tylko qty+koszt, nie czytają nutrition itemów (HIGH).
- **G3→G4: cichy fail** — POST 200, modal się zamyka, gate bez zmiany, zero komunikatu (HIGH).
- **Kanban "Advance →" omija całą bramkę** (bez modala/notatek/checklisty/e-sign) i rozjeżdża stage-machine z gate-machine (nagłówek "Development"/G3, karta w Pilot) (HIGH).
- Costing na nowym projekcie: "No formulation available" mimo zalockowanej v1 (HIGH); na seedzie waterfall działa, ale tylko Raw materials + Margin mają dane — labour/packaging/overhead/logistics/distributor/retail zawsze 0 (brak pól źródłowych), margin 25% vs 20% niespójny na jednym ekranie.
- Gate checklisty read-only — ręcznych pozycji nie da się odhaczyć (zawsze 0%); auto-ewaluacja błędna ("Formulation locked ✗" gdy JEST locked).
- Numeracja bramek: advance z G0 ląduje na G2 zamiast G1.
- E-sign na bramkach NIE istnieje (mimo copy "Manager/Director must sign off").
- /pipeline/{id}/gates, /docs, /risks → 404 (checklist G3 odwołuje się do risk/compliance docs, których ekranów nie ma).
- Waluty: koszt wpisany w PLN wyświetlany jako € (brak konwersji); target price z wizarda nie płynie do formulation/costing; yield % nie persystuje.
- Pilot: linia = wolny tekst (bez powiązania z Settings).
- Trial: optimistic duplicate wiersza do czasu reloadu; statusy surowe (`submitted_for_trial`); packaging tytułowany UUID-em projektu.

## 4. PLANNING

**Działa:** PO create end-to-end (auto-numer z Settings/Documents, picker itemów, suma,
Draft→Sent→Confirmed), TO create+Ship, WO create (snapshot BOM ✅, linia+maszyna z Settings),
suppliers (osobny master z lead time), archive taby.

**Krytyczne/wysokie:**
- **WO release: Catch-22 ze spec** (CRITICAL — łańcuch #8/#13).
- **Routing NIE jest snapshotowany do WO** — zakładka Operations pusta mimo aktywnego routingu (HIGH — produkcja nie ma operacji do wykonania).
- **Dwa rejestry dostawców**: Settings→Partners i Planning→Suppliers rozłączne; dostawca z Settings niewidoczny na PO (HIGH).
- PO: brak per-linia postępu przyjęć, brak qty przy "Mark partially received" (gołe statusy) (HIGH).
- TO Ship bez sprawdzenia dostępności stocku (HIGH — patrz łańcuch #19).
- Cichy przelicznik 100 szt → 50 kg bez podglądu (label "(each)", zapis w kg) (MED); data 2026-06-12 → wyświetla "Jun 11, 11:00 PM" (off-by-one TZ) (MED).
- MRP nie istnieje (404); scheduler = stub; "Run sequencing"/"Trigger D365 pull"/"PO calendar"/"TO timeline" disabled; karty PO/TO na landingu kłamią "Module not live yet" (moduły żyją).
- WO detail: linia jako surowy UUID; Reservations = jawny stub.

**Brakujące pola:** źródło ceny (cennik dostawcy), payment terms, adres dostawy, VAT, Incoterms, walidacja expected-delivery vs lead time dostawcy, capacity check przy WO.

## 5. WAREHOUSE

**Działa:** dashboard (uczciwe KPI z notkami o brakujących źródłach), inbound (listuje PO/TO),
GRN lista+detal z per-linia "Release QC" (QA pending→released ✅), LP lista, genealogy
(prawdziwy ekran z wyszukiwarką), reservations (pusty, z opisem), expiry (puste tiery).

**Krytyczne/wysokie:**
- **LP detail: crash na KAŻDEJ palecie** (CRITICAL — Move/Split/Block/Print nieosiągalne).
- **Inventory = 0 wierszy mimo stocku** (CRITICAL — filtr statusu; QA release nie flipuje statusu na available).
- **TO receive = fantomowy stock** (CRITICAL — łańcuch #19).
- **Expiry ginie przy przyjęciu** — wpisany best-before nie trafia do LP/GRN (HIGH; przez to tiery expiry zawsze puste).
- Desktop nie ma przyjęć (tylko "Receive on scanner →"); brak ręcznego ruchu LP gdziekolwiek (HIGH).
- Brak wyboru lokalizacji docelowej przy przyjęciu — wszystko twardo w LOC1·FG (HIGH).
- GRN-y wiecznie Draft (brak akcji complete); kolumna Items zawsze "—"; "Unique SKUs 0" przy 5 LP.
- Locations = "Coming soon"; genealogy bez karty na dashboardzie (tylko URL).

## 6. PRODUCTION

**Działa:** dashboard z REALNYMI KPI i bez 404 w kartach, WO lista (taby+quick actions),
WO detail z 8 tabami, Pause/Resume (= mechanizm downtime, pełny cykl), output register
(qty+batch, QA pass/fail inline), waste desktop, Complete z yield-gate (74% bez override).

**Krytyczne/wysokie:**
- **Start: 409 na każdym Released WO** (CRITICAL — łańcuch #13; błąd maskowany generycznym "not valid for current state", badge pokazuje "Planned" dla RELEASED).
- **Konsumpcja LP niemożliwa** (CRITICAL — łańcuch #14); "Record without LP" → `{"ok":false,"reason":"error"}` bez wyjaśnienia.
- **Output nie tworzy LP, bez expiry/lokalizacji** (HIGH — łańcuch #15); przycisk "Catch-weight" otwiera ten sam generyczny modal (bez wag per sztuka).
- **Close: ściana e-sign PIN bez UI do PIN** (HIGH — łańcuch #17).
- Genealogia WO pusta z konstrukcji; OEE nic nie pisze (oee_snapshots=0).
- "Log downtime" trwale disabled (jedyna ścieżka = Pause); kategorie downtime/waste = po 1 seed.
- Brak: tożsamości operatora, zmian z master data (wolny tekst "A" vs "SHIFT-A" = osobne wiersze), actual_qty zostaje NULL po komplecie z 15 kg outputu.
- UUID-y w kolumnach Line/Machine/Product na downtime/waste/analytics.

## 7. SCANNER

**Działa:** PIN login (setup/zmiana PIN, wybór site+shift), WO lista z filtrami, execute hub,
consume (ścieżka manual/no-LP), output (keypad, actual weight = catch-weight, batch),
receive PO (pełny happy path z batch+qty, auto LP+GRN, postęp linii 60/100).

**Krytyczne/wysokie:**
- **Waste: zawsze 422** "Invalid waste quantity or category" przy poprawnych danych (HIGH — operator w ogóle nie zarejestruje odpadu ze skanera).
- **Consume LP picker: 422** "Could not load license plates" (HIGH — wymusza ścieżkę bez LP → brak traceability).
- Brak pola lokalizacji i druku etykiety przy przyjęciu; brak expiry przy output.
- 5 kafli "Coming soon": Pick, Putaway, Move LP, QC Inspection, LP info; Pack/Transfer nie istnieją wcale.
- Kamera nic nie robi (bez podglądu/błędu); brak parsera GS1 (zwykły substring filter); puste wyniki bez komunikatu "not found".
- Site flow nie ma wyboru LINII (copy obiecuje "site, line and shift").
- PIN: brak ostrzeżenia o pozostałych próbach (twardy lockout przy 5); **PIN skanera = PIN e-sign** (jeden rekord user_pins) — wątpliwy design.
- sw.js 404 = service worker martwy ⇒ tryb offline (obiecany "P1 no offline queue") nie istnieje.
- Profil miga "A"/"JK" między ekranami.

---

## 8. TOP 10 NAPRAW WG DŹWIGNI (kolejność proponowana)

1. **Słownik statusów LP** magazyn↔produkcja (`received`→`available` po QA release, albo
   wspólny enum + jedna funkcja przejść) — odblokowuje konsumpcję, inventory, expiry tiery.
2. **Catch-22 spec↔BOM**: pozwól zatwierdzić bundle ze spec'iem dla AKTYWNEGO BOM-u (albo
   automatycznie paruj wersje) — odblokowuje release i start WSZYSTKICH WO.
3. **BOM add-component**: dopisywanie linii do bieżącego draftu zamiast forka wersji.
4. **Output → LP** (z expiry z shelf_life_days + lokalizacją) — domyka traceability;
   wtedy też genealogia zacznie się budować.
5. **Expiry przy przyjęciu**: przestań gubić best-before (scanner receive → LP.expiry).
6. **TO receive**: realny ruch stocku (LP transfer) zamiast zmiany statusu + walidacja Ship.
7. **Scanner waste + consume LP picker**: naprawa dwóch 422.
8. **Reference data + manufacturing ops**: naprawa `invalid_input` (alergeny EU-14!, UoM,
   waluty) i modala operacji (pole Industry).
9. **NPD formulation czyta item-master**: alergeny (safety!) i nutrition z items.
10. **Unifikacja dostawców** (Settings Partners ↔ Planning Suppliers) + cennik/lead time na PO.

Plus szybkie kosmetyki o dużym efekcie zaufania: UUID→nazwy w dropdownach/kolumnach,
etykiety routings buildera, LP detail crash, PIN management UI, sw.js.

---

## 9. Dane testowe pozostawione w systemie (do ewentualnego sprzątnięcia)

Settings: AUDIT2-SITE, AUDIT2-LINE, AUDIT2-LINE2, audit2-machine, AUDIT2-WH (+ AUDIT2 Zone 1),
AUDIT2-SHIFT Morning, A2KG, AUDIT2-SUPPLIER, AUDIT2-PROC. Technical: AUDIT2-RM1 (koszt 12.50,
nutrition, alergen Mustard, spec SUP-DEMO-01 approved), AUDIT2-FG1, BOM v1-v3 (v3 ACTIVE),
routing v1 ACTIVE, spec AUDIT2-SPEC-FG1 (in_review). NPD: projekt NPD-006 (G3, formulation v1
locked, trial AUDIT2-T1, packaging MAP tray, pilot 2026-06-20). Planning: PO-202606-0001
(Partially received 60/100), TO-202606-0001 (Received — fantom), WO-202606-0003 (Draft,
nie do release). Warehouse: LP-1781182577695-S52I (40 kg, QA released), LP-1781185243605-12FE
(20 kg), GRN-20260611-0003. Production (na seedowym WO-202606-0001): +5 kg output
AUDIT3-PROD-OUT-001, +1 kg waste, WO COMPLETED. Scanner: PIN 4242 dla admina (= PIN e-sign!),
konsumpcja 1 kg na WO-20260610231609-B0E84A24 + output AUDIT3-OUT-001.
