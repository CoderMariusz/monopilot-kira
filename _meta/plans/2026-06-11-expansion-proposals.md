# MonoPilot — 20 propozycji rozbudowy (2026-06-11)

Kontekst: naprawy łańcucha (audyty 2026-06-11) prowadzi osobny tor; ten dokument = kierunki
ROZBUDOWY. Każda propozycja: co to / wartość dla zakładu / na czym budujemy (istniejące
zasoby w repo!) / wysiłek S-M-L / dopasowanie do wedge'a sprzedażowego (traceability+compliance
dla małych zakładów mięsnych — research 2026-06-09).

Legenda wysiłku: S = dni, M = 1-2 tyg., L = 3+ tyg. ★ = sugerowany priorytet.

## A. TRANSPORT / YARD / LOGISTYKA

**1. ★ Yard Management + Gatehouse (rejestracja ciężarówek na site'ach)** — L
Bramka: wjazd/wyjazd ciężarówki (rejestracja, kierowca, naczepa, plomby, cel wizyty),
kolejka do doków, statusy (awizowany→na bramie→pod dokiem→załadunek/rozładunek→wyjazd),
czasy postoju per dostawca/przewoźnik. Wartość: porządek na placu, dowody dla audytów
(kto/kiedy/plomba), KPI czasu rozładunku. Budujemy na: `sites`, inbound (PO/TO), shipments;
nowe tabele: `yard_visits`, `dock_doors`, `seals`. Skaner: kafel "Gate" dla ochrony.

**2. ★ Awizacje dostaw (dock slot booking)** — M
Kalendarz okien dokowych per magazyn; planista przypina PO/TO do slotu; w przyszłości
mini-portal dla dostawcy (link z tokenem, bez logowania) do samodzielnej rezerwacji.
Wartość: koniec korków rano, inbound z wyprzedzeniem wie co jedzie. Budujemy na:
purchase_orders/transfer_orders + warehouse inbound (już listuje PO/TO).

**3. Integracja wagi samochodowej (weighbridge)** — M
Ważenie wjazd/wyjazd → tara/netto per wizyta; automatyczna kontrola netto vs suma GRN
(przyjęcie) lub shipment (wysyłka) z progiem alarmu. Wartość: wyłapywanie braków/nadwyżek
na bramie — twardy pieniądz w mięsie. Budujemy na: yard_visits (#1) + grns/shipments;
sterownik wagi przez prosty endpoint/plik.

**4. ★ Cold chain przy przyjęciu i wysyłce** — S/M
Obowiązkowe pola przy GRN/załadunku: temperatura naczepy (+zdjęcie wyświetlacza), stan
higieny, plomba zgodna, checklist kierowcy. Blokada przyjęcia poza zakresem temp. dla
kategorii produktu. Wartość: wymóg BRCGS/IFS wprost; dziś brak w aplikacji. Budujemy na:
scanner receive (działa!) + shipment confirm; konfig progów w Settings.

**5. Przewoźnicy + koszty frachtu** — M
Master przewoźników (taska T-027 w shipping już zaplanowana), stawki per lane/paleta/kg,
przypisanie do shipmentu → koszt frachtu do waterfalla kosztowego (krok "Logistics" dziś
zawsze 0!). Budujemy na: shipments + transport_lanes (PRD multi-site) + costing NPD.

## B. PRODUKCJA+

**6. ★ Andon / Live Line Dashboard (TV na halę)** — M
Pełnoekranowy widok per linia: bieżące WO, postęp vs plan, OEE na żywo, ostatni downtime,
licznik od ostatniego wypadku/QA-incydentu. Tryb kiosk (permission `OEE_TV_KIOSK_VIEW` już
jest w enum!). Wartość: widoczność = dyscyplina; ulubiony "wow" na demo. Budujemy na:
wo_executions/downtime_events/oee_snapshots (producer do dokończenia w torze napraw).

**7. ★ Załoga i robocizna (labour tracking)** — M/L
Operator loguje się do linii/WO (PIN ze skanera już jest!), system liczy roboczogodziny
per WO → stawka z Settings → krok "Process labour" w costingu przestaje być 0; przy okazji
zamyka brak "operator identity" z audytu. Budujemy na: user_pins/scanner_sessions, shifts,
wo_executions; nowe: `wo_labor_log`, stawki w Settings.

**8. Changeover + CIP/mycie z walidacją** — M
Pełny przepływ przezbrojenia: plan mycia, checklist CIP, wynik ATP, dual sign-off →
odblokowanie linii. Bramka B13 w kodzie już istnieje (uśpiona — tor napraw ją zasili
danymi); my dobudowujemy harmonogram myć i rejestr ATP. Wartość: alergeny+audyt.

**9. ★ Rozbiór / disassembly BOM (reverse BOM)** — L
Jedno wejście (tusza/element) → wiele wyjść (klasy mięsa, kości, tłuszcz) z % uzysku i
alokacją kosztu (bom_co_products + allocation_pct JUŻ SĄ w schemacie). Rejestracja uzysków
rozbioru na skanerze, porównanie plan vs rzeczywisty per partia. Wartość: wg researchu
DYSKWALIFIKUJĄCY brak przy sprzedaży do zakładów mięsnych. Budujemy na: bom_co_products,
wo_outputs multi-output, catch_weight kolumny.

**10. Naważalnia / kitting (pre-weigh)** — M/L
Stanowisko naważania składników per WO: kolejka naważek z BOM, waga z tolerancją
(variance_tolerance_pct już na items), podwójna kontrola przy alergenach, etykieta kitu,
kit = LP konsumowany w całości na linii. Wartość: precyzja receptur + czystość alergenowa;
klasyk spożywczy. Budujemy na: wo_materials, LP, drukarka etykiet (#19).

## C. JAKOŚĆ / COMPLIANCE+

**11. ★ HACCP / monitoring CCP** — L
Plany HACCP per produkt/linia, punkty CCP z harmonogramem odczytów, odczyty na skanerze
(temperatura, metal detektor), eskalacja przekroczeń → hold automatyczny. PRD 09 ma
gotowe definicje tabel (haccp_plans/ccps/monitoring) — kod nie istnieje. Wartość: drugi
filar wedge'a compliance (FoodReady sprzedaje DOKŁADNIE to).

**12. ★ Mock recall / trace drill jednym klikiem** — M
Z partii/LP: pełny raport wstecz (dostawcy, GRN) i wprzód (WO, wysyłki, klienci) + czas
wygenerowania + eksport PDF dla audytora; tryb "ćwiczenie recall" z metryką czasu.
Budujemy na: genealogy CTE (gotowy reader!), trace UI w Technical — zależy od naprawy
F-B08 (output→LP). To jest nasz killer-demo sprzedażowy.

**13. Scorecard dostawców + portal dokumentów** — M
Ocena dostawcy: terminowość (PO vs GRN), odchyłki wag (weighbridge #3), NCR-y, ważność
certyfikatów; przypomnienia o wygasających specach (compliance engine już skanuje expiry!).
Budujemy na: supplier_specs, grns, ncr_reports.

**14. Reklamacje klientów (complaints → NCR → CAPA)** — M
Rejestr reklamacji z powiązaniem do partii/wysyłki, konwersja do NCR, proste CAPA
(działania korygujące z terminami i właścicielami). PRD 09 P2 ma quality_complaints.
Wartość: zamyka pętlę jakości; audytorzy o to pytają.

## D. MAGAZYN+

**15. Inwentaryzacja + cycle counting** — M
Liczenie cykliczne ABC ze skanera (kafel "Count"): zlecenia liczenia per lokalizacja,
ślepe liczenie, rozjazdy → korekta z approvalem + audit. Wartość: bez tego stany zawsze
"prawie" się zgadzają. Budujemy na: license_plates, locations, scanner shell.

**16. Etykiety + drukowanie GS1/ZPL** — M ★
Projektant etykiet (label_templates tabela istnieje, TODO "ZPL export" wisi w kodzie),
druk LP przy przyjęciu/output, SSCC dla palet wysyłkowych (generate_sscc() w mig 211!),
etykieta produktowa z alergenami z SSOT. Wartość: domyka fizyczny obieg — bez etykiet
skaner nie ma czego skanować.

## E. PLANOWANIE+

**17. ★ MRP + prognozy (dokończenie istniejącego schematu)** — M/L
mrp_runs/mrp_requirements/mrp_planned_orders/reorder_thresholds SĄ w bazie od mig 178 —
bez żadnego UI. Dobudować: przebieg MRP z BOM+stany+PO w drodze → propozycje PO/WO
jednym klikiem; proste prognozy tygodniowe per produkt. Wartość: planista przestaje
liczyć w Excelu.

**18. Scheduler z sekwencjonowaniem alergenowym** — L
Schema gotowa (scheduler_runs/assignments/config + changeover_matrix, mig 204). Dobudować
solver: kolejność WO na linii minimalizująca przezbrojenia/mycia (macierz changeover ×
profil alergenowy), drag&drop Gantt z konfliktami. Wartość: realna oszczędność godzin
myć — policzalna na demo.

## F. SPRZEDAŻ / EKOSYSTEM

**19. Portal klienta B2B (zamówienia + dokumenty)** — L
Klient loguje się, składa SO (cennik per klient), widzi statusy/awiza wysyłek, pobiera
CoA/packing slip/fakturę pro-forma. Budujemy na: customers/sales_orders (mig 211 — komplet
tabel bez UI). Wartość: feature, którym mały zakład wygrywa serwisem u swoich klientów;
przy okazji wymusza dokończenie shippingu.

**20. Asystent AI "zapytaj fabrykę"** — M
Czat nad danymi org-scoped: "ile mamy partii AUDIT2-RM1 i kiedy wygasają?", "pokaż WO z
najgorszym uzyskiem w tym tygodniu", "wygeneruj raport trace dla partii X". Read-only,
na istniejących akcjach/widokach, z cytowaniem źródła. Wartość: ogromny efekt demo,
niska inwazyjność (zero nowych writerów).

---

## Sugerowana kolejność (3 horyzonty)

**H1 — domyka wedge sprzedażowy (po naprawach łańcucha):**
#16 etykiety/SSCC → #12 mock recall → #4 cold chain → #11 HACCP → #6 Andon (demo).

**H2 — pieniądze i plac:** #1 yard + #2 awizacje + #3 waga → #7 robocizna → #17 MRP →
#9 rozbiór (otwiera segment mięsny na poważnie).

**H3 — ekosystem:** #18 scheduler → #5/#13 fracht+scorecard → #10 naważalnia →
#14 reklamacje → #15 inwentaryzacja → #19 portal B2B → #20 AI.

Zasada przekrojowa: KAŻDA nowa funkcja od pierwszego dnia przestrzega wiring-contract
(producer+consumer+test E2E) i SSOT-ów z audytu 2026-06-11 — żeby nie odtworzyć tych
samych szwów, które właśnie naprawiamy.
