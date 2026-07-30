# ROADMAPA NAPRAWCZA — po dniu 2026-07-30

Aplikacja działa na głównych ścieżkach i w wielu miejscach liczy poprawnie, ale w kilkunastu
udowodnionych punktach **melduje użytkownikowi coś innego, niż faktycznie zrobiła** — i to jest
klasa problemu, którą trzeba zamknąć przed czymkolwiek innym.

---

## Jak to uszeregowałem

Cztery pytania, w tej kolejności. Przy każdej pozycji poniżej widać, które zadziałało.

| # | pytanie | co robi z priorytetem |
|---|---|---|
| **1** | **Osiągalne dziś, czy dopiero po zmianie warunków?** | Dziś osiągalne → wyżej. Ale „dopiero po zmianie" ≠ „później": izolacja zakładów odpali **dokładnie wtedy, gdy klient uwierzy, że działa** — więc ląduje przed pracą kosmetyczną, tylko za pracą na żywych ranach. |
| **2** | **Skutek cichy czy głośny?** | Cichy → wyżej. `persistence_failed` na ekranie kosztuje telefon do supportu. Import, który zapisał 49 wierszy i powiedział „nie zapisałem", kosztuje tydzień szukania, skąd wzięły się duplikaty. |
| **3** | **Naprawa domknięta czy wymaga decyzji produktowej?** | To **dwie różne kolejki**. Fale A-C to praca inżynierska, może ruszyć jutro rano. Fala D i sekcja „Decyzje" nie mogą ruszyć wcale, dopóki właściciel nie rozstrzygnie. Mieszanie ich zamraża obie. |
| **4** | **Dowód uruchomieniowy czy poszlaka?** | Bez dowodu → **osobna sekcja „Do potwierdzenia"**, nigdy w falach A-E. Dzień pokazał trzy razy, że narzędzie liczące potrafi skłamać (raz o mało nie poszło dalej jako „bramka bezpieczeństwa żywności nie działa" — a zapis był w linii 481, tylko `grep` uznał plik za binarny). |

**Zastrzeżenie do liczb w tym dokumencie.** `git log origin/main..HEAD` to **72 commity**
(dziennik mówi 65 „dzisiaj" — 15 poszło nocnym pushem `9f9dd557..1323a7ae`, reszta czeka).
Commity z dziś niosą **i naprawy, i same znaleziska**. Tam, gdzie nie mam dowodu uruchomieniowego
**po** naprawie, piszę to wprost zamiast obiecywać, że zamknięte.

---

## Fala 0 — odblokować wypchnięcie (właściciel, nie programista)

**Cel:** doprowadzić do produkcji to, co już naprawione, zanim gałąź urośnie do rozmiaru,
w którym rollback przestaje być opcją.

- `git push origin main` — **72 commity czekają**, klasyfikator uprawnień odrzuca push po mojej
  stronie. Właściciel wpisuje u siebie: `! git push origin main`.
- Ryzyko przy pushu, zbadane dwoma sposobami: Vercel migruje w buildzie; jeśli produkcja ma
  wiersze bez zakładu, **migracja 551 odmówi i deploy stanie**. To awaria **bezpieczna** —
  zatrzymany deploy, nie uszkodzone dane. Sprawdzone lokalnie: 512 migracji na czystej bazie
  `rc=0` **oraz** 550+551 w transakcji na bazie zawierającej problematyczny wiersz →
  `remaining_null=0`.
- Czego nie wiem: **stanu produkcyjnej bazy** — odczyt z produkcji był dziś zablokowany.
  Wszystkie zliczenia w tym dokumencie pochodzą z baz testowych.

**Praca: 30 minut właściciela + 1 h obserwacji deployu.**

---

## Fala A — funkcje, które cicho psują dane albo cicho ich nie zapisują

**Cel:** żeby żadna operacja nie kończyła się stanem, w którym baza mówi co innego niż ekran.

Wszystkie cztery pozycje mają **dowód uruchomieniowy**, wszystkie są **osiągalne dziś**,
wszystkie mają **skutek cichy albo cicho-katastrofalny**, i żadna nie wymaga decyzji produktowej.
To jest jedyna fala, przy której nie ma się nad czym zastanawiać.

| # | co | dowód | dlaczego tu |
|---|---|---|---|
| **A1** | **Anulowania wysłanej wysyłki NIE DA SIĘ WYKONAĆ. Towar nie wraca na stan.** `audit_events.id` to `bigint`, `node-postgres` zwraca go jako **łańcuch znaków**, a kod sprawdza `typeof !== 'number'` → **każde** wywołanie rzuca i wycofuje transakcję. Dotyczy `cancelShipment`, `recordPod`, prawdopodobnie `unpackShipment` i `voidPod`. | wywołania akcji na żywo: paleta zostaje 4, wysyłka zostaje „wysłana", zero wpisów audytu | głośne dla operatora, **ciche dla stanu magazynu** — towar znika z obiegu i nikt tego nie widzi w liczbach |
| **A2** | **Import zapisuje połowę wierszy i mówi, że nie zapisał nic.** `return { ok: false }` w pętli zapisu, a `withOrgContext` **zatwierdza transakcję przy każdym zwykłym powrocie** i wycofuje tylko przy wyjątku. Prawdziwy wektor: **dwa wiersze o tym samym kluczu w jednym pliku CSV** — droga sekwencyjna, jednoużytkownikowa, żadnej równoległości nie trzeba. | ścieżka wykazana z numerami linii + odtworzony wektor duplikatu | najcichszy defekt dnia: użytkownik ponawia import, bo „nie przeszedł" |
| **A3** | **Ślepe sumowanie różnych walut w trzech miejscach**, a formatter podpisuje wynik **dolarem** — w aplikacji, która nie ma ani jednej kwoty w dolarach. Wyzwalacz realistyczny: domyślna wartość kolumny `currency` to `'GBP'`, dane są w euro. Ranking dostawców **sortuje po mieszance**, więc kolejność też kłamie. | `insert → dokładne zapytanie z kodu → ROLLBACK` na `monopilot_t3`: 1000 EUR + 500 GBP = `1500` | cichy, rośnie z liczbą zamówień, **wzorzec naprawy już jest w repo** (`so-actions.ts`: mieszane waluty → `NULL`, nie zmyślona liczba) |
| **A4** | **Pobranie palety w pełni zarezerwowanej pod wysyłkę** → cała paleta jedzie na produkcję, a księga zapisuje ruch o **ilości zero**. Wysyłka traci paletę, ślad mówi „nic się nie stało". | stan końcowy w bazie | cichy z definicji — księga sama zaciera dowód |

**Uwaga do A1, bo tu jest pułapka:** naprawa dotyka czterech akcji i wymaga rozstrzygnięcia,
czy parsować `bigint` **globalnie** (`setTypeParser` zmienia zachowanie **całej** aplikacji —
każde `count(*)`, każdy identyfikator), czy **punktowo**. Zła decyzja psuje więcej, niż naprawia.
Rekomendacja: punktowo w tych czterech miejscach + jeden test na prawdziwej bazie; globalny parser
jako osobna, świadoma zmiana z własną falą regresji.

**Praca: 2-3 dni.** A1 pół dnia + pół dnia weryfikacji, A2 dzień (naprawa jest jednolinijkowa,
ale trzeba przejrzeć **wszystkie** powroty w tym module — patrz Wzorzec 1), A3 pół dnia
(wzorzec gotowy), A4 pół dnia.

---

## Fala B — bramki, które meldują zieleń, nie sprawdziwszy niczego

**Cel:** żeby żadna kontrola bezpieczeństwa nie odpowiadała „czysto" w sytuacji, w której
nie miała czego odczytać.

To jest gorsze niż fail-open. Fail-open przepuszcza, bo nie wie. Te **twierdzą, że wiedzą**.
9 bramek sprawdzonych, **4 przepuszczają** — i wszystkie cztery przepuszczają cicho.

- **B1 — bramka blokad jakościowych połyka błąd „relacja nie istnieje" i mówi „brak blokady".**
  Udowodnione na żywo: usunięcie widoku w punkcie zapisu → guard zwraca „czysto",
  produkcja konsumuje surowiec z **aktywną blokadą**. **Trzy miejsca** mają ten sam połknięty błąd.
  Efekt uboczny: po połknięciu transakcja jest już przerwana, więc następne zapytanie pada
  komunikatem, który z blokadą nie ma nic wspólnego — czyli diagnoza prowadzi w złą stronę.
- **B2 — bramka QC surowców melduje zieleń, nie odpytując tabeli.** `requireQcRelease` nie jest
  przekazywany przez **żaden** kod produkcyjny, a `bom/_actions/shared.ts:403` ma zaszyte
  `required: false`. Raport wypisuje „QC release present" **ze wskazaniem źródła, którego
  nie odczytał**. Drugi konsument robi to na ścieżce **zatwierdzania**.
- **B3 — most laboratorium istnieje tylko w testach.** `registerQualityLabBridge`: 8 wywołań,
  **wszystkie w pliku testowym**. Produkcyjna trasa `POST /api/technical/lab-results` zawsze
  zwraca **501**. Tabelę `lab_results` czyta **dziewięć plików**, w tym **bramka użyteczności
  surowców** — podejmuje decyzję na podstawie tabeli, do której nic nigdy nie napisze.
- **B4 — pusta lista dopuszczalnych wartości = przyjmuje wszystko** (`row-validation.ts:42`)
  oraz **podgląd importu kłamie o poprawności**: jednostka `banana` i cena `abc` pokazują się
  jako poprawne, a błąd wychodzi dopiero przy zatwierdzeniu i **ubija cały dokument dostawcy**.
  Podgląd mówiący „poprawne" o czymś, co za chwilę odrzuci zapis, jest gorszy niż brak podglądu.
- **B5 — łańcuch zwolnienia jakościowego jest potrójnie martwy:** flaga „wymagane" zaszyta na
  `false` na ścieżce zatwierdzania, drugi konsument bierze ją z **wejścia klienta**, i nikt nigdzie
  nie przekazuje `true` — a tabela i tak jest zawsze pusta.

**Co czyni z tego dowód, a nie podejrzenie:** kontrpróby zdane. Przy obecnych danych bramki
blokują, przy włączonej fladze zwolnienie blokuje. **Logika jest poprawna — produkcja nigdy
na nią nie wchodzi.** To dobra wiadomość: naprawiamy okablowanie, nie algorytm.

**Praca: 2 dni.** Najwięcej zjada B3 — trzeba rozstrzygnąć, czy budujemy most laboratorium,
czy bramka użyteczności surowców przestaje udawać, że go ma (patrz Decyzja 3).

---

## Fala C — zegar: 12 miejsc liczy dobę, 1 liczy ją poprawnie

**Cel:** żeby „dzisiaj" znaczyło to samo w każdym miejscu aplikacji.

Fakt bazowy: strefa sesji lokalnej bazy to `Europe/London`, dane zakładów mówią `Europe/Warsaw`,
produkcja stoi na UTC. **Każde `current_date` liczy inną dobę niż doba zakładu.**

Skutki z dowodami: guard przeterminowanych palet **przepuszcza codziennie między 00:00 a 02:00**
(paleta z terminem 30.07, skan 31.07 o 01:30 → `expired = false`); termin przydatności o dzień
krótszy przy nocnym przyjęciu (31.07 o 00:30 + 30 dni → **29.08**); wskaźnik dobowy przypisuje
2 godziny nocnej produkcji do złej doby; ekran zmian **tnie zmianę nocną na pół**; „utworzone
dzisiaj" na pulpicie zmienia wartość zależnie od sesji.

**To jest fala tania w stosunku do zasięgu, bo wzorzec już istnieje:** `lib/site/site-day.ts`
liczy dobę w strefie zakładu i jest odporny na strefę sesji. Praca polega na **rozniesieniu go**,
nie na wymyśleniu.

**Jedna rzecz, o której właściciel musi wiedzieć:** kierunek błędu terminu przydatności jest
„bezpieczny" (za krótki) **wyłącznie dlatego, że Polska leży na wschód od UTC**. Ta sama formuła
u klienta w strefie zachodniej dałaby termin **za długi** — czyli towar po terminie uznany za dobry.
Przy eksporcie produktu poza Europę Środkową to przestaje być kosmetyką.

**Praca: 1,5-2 dni** (12 miejsc × podmiana na istniejący helper + test na granicy doby dla każdego).

---

## Fala D — izolacja między zakładami

**Cel:** żeby „przypisz użytkownika do zakładu" znaczyło to, co obiecuje.

**To jest najważniejszy wynik dnia i jedyna pozycja, przy której kryterium 1 odwraca intuicję.**

Zleciłem sprawdzenie 13 tabel poza predykatem zakładu. Tor policzył to z **katalogu Postgresa**
zamiast grepem: predykat zakładu istnieje na **11 tabelach**, a poza nim stoi **116 tabel bazowych
z kolumną `site_id`**. Liczba „124 pokryte" z wcześniejszego audytu to **artefakt grepa**.

Dowód: świeża organizacja, zakłady A i B, użytkownik przypisany **wyłącznie do B**, `SET ROLE
app_user`, wymuszone RLS. **6 z 6 badanych tabel przecieka** (`warehouses`, `grn_items`,
`sales_orders`, `maintenance_work_orders`, `quality_holds`, `downtime_events`). Kontrola przeciwna
zdana **w obie strony** — ta sama sesja, tabela z predykatem → zero wierszy dla obcego zakładu
**i jeden** dla własnego. Harness potrafi pokazać zarówno wyciek, jak i jego brak.

**Dlaczego to nie jest P0 na dziś:** `user_can_see_site` jest **opt-in** — restrykcja bierze się
z wpisów w `user_sites`, a dziś **żaden użytkownik nie ma przypisań**. Nikt nie jest ograniczony,
więc nic realnie nie wycieka.

**Dlaczego to mimo wszystko nie może zginąć w backlogu:** wyciek materializuje się **w chwili,
gdy ktoś zacznie przypisywać użytkowników do zakładów — czyli dokładnie wtedy, gdy klient uwierzy,
że izolacja działa.** To najgorszy możliwy moment: funkcja włączona świadomie, w zaufaniu.

To nie jest decyzja projektowa, tylko **porzucone wdrożenie**: rejestr `public.operational_tables`
ma **22 wpisy, wszystkie `scoping_status='pending'`**, cztery dotyczą tabel, które nie istnieją,
a flagi `site_id_present` są przestarzałe.

**Praca: 0,5 dnia inwentaryzacji + 3-5 dni wdrożenia — ale dopiero PO Decyzji 1.**
Dołożenie predykatu do 116 tabel na ślepo jest niebezpieczniejsze niż jego brak: **złe zawężenie
zamraża pracę użytkownikom, a ten wzorzec wystąpił w tej kampanii dwanaście razy.**

---

## Fala E — żeby suita przestała kłamać o sobie samej

**Cel:** żeby zielony przebieg testów znaczył cokolwiek.

Ta fala nie naprawia ani jednego defektu produktu. Naprawia **narzędzie, którym mierzymy**,
i dlatego jej wartość jest wyższa niż suma pozycji: bez niej każda następna fala kończy się
raportem „zielone", który nic nie znaczy.

- **E1 — testy pominięte, nie wykonane.** `wave8-shipping-integrity.pg.test.ts` asercjonuje
  **dokładnie to, co nie działa** (anulowanie po wysyłce zwraca towar) i wykonał się jako
  **7 pominiętych, 0 wykonanych**. Ten sam kształt ukrył rano **18 testów bezpieczeństwa**.
  **215 plików** ma `describe.skip` warunkowy na `DATABASE_URL` — lokalnie zielona pustka.
  Naprawa: bramka, która **odróżnia „przeszło" od „pominięto"** i traktuje drugie jako czerwień
  w CI. Bezwarunkowych `it.skip` jest zero, więc nie ma tu długu do odkopania — tylko okablowanie.
- **E2 — trzy miejsca, w których usunięcie filtru organizacji z produkcyjnego SQL nie rusza
  ani jednego testu** (24 + 5 + 3 zielone po mutacji). Najgorszy: **kasowanie danych osobowych** —
  dwie warstwy obrony, obie namalowane. Warstwa 2 nazywa się *„prawdziwe zapytanie pod kontekstem
  aplikacji"*, a zawiera **własną kopię zapytania wklejoną do testu** (`gdpr-erasure-rbac.test.ts:74-77`),
  więc mutacja produkcji jej nie dotyczy. Naprawa jest tania i wzorzec jest w repo:
  **jeden test przeciw prawdziwemu Postgresowi** (`*.pg.test.ts`).
- **E3 — cztery pliki „dowodowe" bez ani jednej asercji.** Renderują komponent i zrzucają HTML.
  Mutacje: wartości odżywcze → `999999` (zielony), każda kwota → `0.00` (zielony), koszt za kilogram
  → `−1.00` (zielony). **M2 dotyczy etykiety wartości odżywczych produktu spożywczego.**
  Uczciwie: siostrzany `costing-screen.test.tsx` tę samą mutację **złapał** — puste testy żyją
  **obok** realnego pokrycia, nie zamiast niego. Ale nie ostrzegają, że nic nie wnoszą.
- **E4 — wzorzec do naśladowania jest w repo i trzeba go nazwać.** `site-actions.test.ts`
  (atrapa zwraca surowe wiersze, test twardo sprawdza kształt zapytania i dokładne parametry)
  oraz cała rodzina w `packages/db`, `packages/rbac`, `packages/auth` (12 plików uderzających
  w prawdziwą bazę pod prawdziwym użytkownikiem aplikacji). **Wzorzec z `apps/web` nie rozlał się
  na pakiety** — czyli problem jest lokalny i da się go otoczyć.

**Praca: 1-1,5 dnia** na E1+E2+E3. E4 to nie praca kodowa, tylko wpis w regułach przeglądu.

---

## Do potwierdzenia — poszlaka, nie dowód

Te pozycje **nie są w falach**, bo nie mają dowodu uruchomieniowego. Przy każdej piszę,
**co dokładnie trzeba zrobić, żeby przestały być niepewne.**

| # | zgłoszenie | co je rozstrzygnie |
|---|---|---|
| **D1** | `unpackShipment` i `voidPod` padają tak samo jak A1 (ten sam zapis audytu) | wywołać obie akcje na żywej bazie — 20 minut, robi się razem z A1 |
| **D2** | Pozostałe **110 ze 116** tabel przecieka między zakładami | mają identyczny kształt polityk, ale bez testu wstawiającego to **inferencja**. Skrypt: dla każdej tabeli insert w zakładzie A → select z sesji zakładu B → ROLLBACK. Pół dnia, zwraca liczbę zamiast szacunku |
| **D3** | Nawet tabele **z** predykatem przeciekają dla wierszy z `site_id IS NULL` (gałąź fail-open) | policzyć wiersze bez zakładu w każdej z 11 tabel na produkcji — dziś odczyt z produkcji był zablokowany |
| **D4** | Zatwierdzenia zmian technicznych: trzy akcje **zapisują, nikt nie czyta** — użytkownik klika „Zatwierdź" i nie ma ekranu, który pokaże, kto co zatwierdził | otworzyć moduł i sprawdzić. Uwaga: **identyczne zgłoszenie o bramce alergenowej okazało się fałszywe** — `grep` pominął plik jako binarny, a zapis był w linii 481. Ta rodzina zgłoszeń wymaga **drugiej metody**, zanim pójdzie dalej |
| **D5** | Ćwiczenia wycofania z rynku, dni nieprodukcyjne, przełączniki modułów (seed **niepodpięty do migracji** → na bazie bez ręcznego seeda każdy przełącznik kończy się błędem) | sprawdzić **produkcyjną** bazę — wszystkie dzisiejsze zliczenia są z testowej |
| **D6** | Dwie listy bez rozstrzygnięcia remisów (produkcja, seedy identyfikowalności) | tor uczciwie napisał, że **nie zdołał tego odtworzyć**: transakcja z wycofaniem wymusza stabilny porządek. Na produkcji tej gwarancji nie ma, ale to argument z dokumentacji, nie pomiar |
| **D7** | Czy naprawy z dzisiejszych commitów rzeczywiście trzymają na produkcji | przejście E2E **po** pushu Fali 0. Część dzisiejszych torów jechała na bazie **bez** migracji 551/556/557/558 |

---

## Decyzje właściciela — nikt nie może zacząć kodować, dopóki ich nie ma

### 1. Izolacja zakładów: domyślnie szczelna czy opt-in?

- **Fail-closed (szczelna).** Predykat na 116 tabel, użytkownik bez przypisania nie widzi nic.
  *Skutek:* obietnica z ekranu staje się prawdą. *Koszt:* każdy istniejący użytkownik traci dostęp
  do wszystkiego, dopóki ktoś nie uzupełni `user_sites` — a wzorzec „guard chroniący jeden przypadek
  zamraża sąsiednie" wystąpił dziś **dwanaście razy**. Wymaga backfillu przypisań **przed** wdrożeniem.
- **Opt-in (jak dziś), ale uczciwie.** *Skutek:* zero ryzyka zamrożenia. *Koszt:* interfejs musi
  **przestać obiecywać** izolację, której nie ma — inaczej pierwszy klient, który przypisze
  użytkowników do zakładów, dostanie wyciek w prezencie za zaufanie.
- **Trzecia opcja, tańsza:** fail-closed **tylko na tabelach osiągalnych z ekranu**, reszta później.
  Wymaga D2, żeby wiedzieć, ile to tabel.

**Czego nie da się wybrać:** zostawić jak jest **i** dalej pokazywać przypisania do zakładów.
To jedyna kombinacja, która na pewno skończy się incydentem u klienta.

### 2. `apps/worker` — cała warstwa tła nie jest nigdzie uruchamiana

Sześć zadań, zero deploymentu: wdrożenie obejmuje tylko `apps/web`, `docker-compose` to sam Postgres,
brak Dockerfile, CI i skryptu startowego. **Usuwanie danych osobowych nie ma żadnej żywej ścieżki**
(to jest zobowiązanie prawne, nie funkcja), maile o wygasających dokumentach zgodności nigdy nie
wychodzą, ponawianie nieudanych wysyłek nie istnieje — **mimo że ekran obiecuje, że „obsługuje
to worker outboxu"**.

- **Wdrożyć workera** (Dockerfile + CI + monitoring). Koszt: 2-3 dni infrastruktury, nowy element
  do utrzymania. Zysk: obietnice z ekranów stają się prawdziwe.
- **Przenieść zadania do `apps/web`** jako cron Vercela. Koszt: 1-2 dni, ale zadania długie
  wchodzą w limity funkcji. Zysk: jeden deployment.
- **Usunąć obietnice z ekranów.** Koszt: kilka godzin. Zysk: uczciwość. **Nie rozwiązuje kwestii
  usuwania danych osobowych** — to zostaje jako dług prawny, świadomy.

**To nie jest zadanie dla toru kodowego.** Każdy programista, który to dostanie bez decyzji,
zbuduje jedną z trzech odpowiedzi na ślepo.

### 3. Moduł wyników laboratoryjnych: budujemy czy przestajemy obiecywać?

Most rejestrowany wyłącznie w testach, trasa produkcyjna zawsze zwraca 501, a **dziewięć plików
czyta tabelę** — w tym bramka użyteczności surowców, która podejmuje decyzję na podstawie danych,
które nigdy nie powstaną. Wybór: zbudować zapis (i wtedy bramka nabiera sensu) albo bramka
przestaje udawać, że ma źródło, i mówi „brak danych" zamiast „czysto".

### 4. Deadlock korekt na zakończonym zleceniu — jeden węzeł polityki

Bramka anulowania każe „void each output before cancelling", a `void` odpowiada `invalid_state`,
i `reopen` nie istnieje. Asymetria jest udokumentowana: `reverseConsumption` i `voidWasteEntry`
na tym samym zleceniu **działają** — korekta zakończonego zlecenia jest **jednostronna**
(wejście tak, wyjście nie). To spór o kontrakt z twardym skutkiem, spięty z `E2E-054-10`
i nettingiem WAC. **13 czerwonych testów czeka na to rozstrzygnięcie, nie na naprawę kodu.**

### 5. MRP i zlecenia robocze — całe albo wcale

`DRAFT` jest na **obu** listach: popytu i podaży. Usunięcie go tylko z podaży → popyt policzony,
podaż nie → **nadzakup** (defekt naprawiony dziś rano). Model trzeba rozstrzygnąć w całości.
Dopuszczalny wynik: **kontrakt katalogu jest błędny, a kod ma rację.**

### 6. Drobne, ale zablokowane

- **`UI-003` — globalne wyszukiwanie:** budujemy, czy pasek narzędzi przestaje je obiecywać?
- **Obejście B w `lp-downstream-guard.ts`** (netto konsumpcji = 0) — świadomie zostawione.
- **Filtr `ro.line_id = wo.production_line_id`** może zaniżać czas marszruty wieloliniowej:
  obciążenie ma obejmować całą marszrutę czy tylko operacje wybranej linii?
- **Jeden magazyn bez zakładu i bez źródła** (`no_candidate=1`) — migracja 551 na to nie patrzy.
- **Asymetria NPD vs Technical:** produkty z NPD dostają spec od razu jako `approved_for_factory`,
  produkty z Technical muszą przejść bramkę. Celowe czy przypadkowe?

---

## Wzorce systemowe — tu jest największy zwrot z pracy

Cztery kształty wróciły dziś **dwadzieścia trzy razy łącznie**. Naprawa wzorca zamyka klasę;
naprawa pojedynczej pozycji zamyka jeden przypadek i zostawia rodzeństwo.

### W1. „Zwykły powrót z funkcji zatwierdza transakcję" — 3 wystąpienia

`withOrgContext` (`with-org-context.ts:356-358`) **commituje przy każdym zwykłym `return`**
i wycofuje **wyłącznie przy rzuconym wyjątku**. Kod, który sygnalizuje błąd przez
`return { ok: false }`, **zapisuje to, co zdążył**, i melduje niepowodzenie.

Trafienia: rewalidacja w transakcji (**11 miejsc**, commit `52b7bbe8`), zapisy onboardingu,
import CSV. To nie są trzy wpadki — to **systematyczna pułapka tego API**.

**Naprawa klasy:** albo `withOrgContext` wycofuje przy `ok: false`, albo — bezpieczniej —
typ zwracany przestaje dopuszczać kształt „błąd bez wyjątku" wewnątrz transakcji.
Do tego **jeden test kontraktowy na sam `withOrgContext`**, który dziś nie istnieje.
**Praca: pół dnia na kontrakt + 1 dzień na przejrzenie wszystkich powrotów.**
**To jest najtańsza pozycja w całym dokumencie w stosunku do zasięgu.**

### W2. „Zielony przez pominięcie" — 3 wystąpienia w jednym dniu

18 testów bezpieczeństwa nie chodziło w CI (bramka na nazwie bazy). Test uprawnień — to samo.
`wave8-shipping-integrity` — 7 pominiętych, 0 wykonanych, przy asercji **dokładnie tego defektu,
który potem znalazłem ręcznie**.

**Naprawa klasy:** przebieg, w którym **liczba pominiętych > 0 jest czerwona**, plus raport
„ile testów faktycznie się wykonało" obok „ile przeszło". **215 plików** siedzi dziś za bramką
`DATABASE_URL`. **Praca: pół dnia.**

### W3. „Bramka przepuszcza przy braku danych" — 4 wystąpienia w bramkach + 1 w walidacji

Blokady jakościowe (połknięty błąd „relacja nie istnieje" → „czysto"), widoczność zakładu
bez kontekstu użytkownika → „wolno" (pełna widoczność), `user_can_see_site` przy `site_id IS NULL`,
`reporting/_actions/shared.ts` przy braku kontekstu zakładu **pokazuje wszystko**,
pusta lista dopuszczalnych wartości → przyjmuje cokolwiek.

**Naprawa klasy:** reguła przeglądu — **brak danych to `null`/odmowa, nigdy `true`**;
plus zakaz `catch` bez rozróżnienia „nie ma blokady" od „nie mogłem sprawdzić".
Osobno: bramka QC to **stopień wyżej** — nie przepuszcza po cichu, tylko **melduje zieleń
ze wskazaniem źródła, którego nie odczytała**. To zasługuje na własny wpis w regułach.
**Praca: 1 dzień + reguła przeglądu.**

### W4. „Zielony test obok żywego defektu" — 12 wystąpień, część udowodniona mutacyjnie

Najgorsze: usunięcie filtru organizacji z produkcyjnego SQL zostawia **12 z 12 zielonych** —
łącznie z testem nazwanym *„odmawia dostępu użytkownikowi z innej organizacji"*. Przyczyna:
atrapa w pliku testu **reimplementuje całą logikę grantu razem z filtrem organizacji**.
Prawdziwe zapytanie nigdy się nie wykonuje.

**Naprawa klasy — i to jest jedyny wymóg, który dziś zadziałał:** w Fazie 2 każdy nowy zielony
test był weryfikowany przez **tymczasowe zepsucie kodu produkcyjnego** (dzielenie→mnożenie,
`greatest`→`least`, usunięte `CANCELLED`, wyłączona bramka uprawnień). Każda mutacja wywróciła
swój test. **Ten wymóg musi zostać regułą stałą, nie zwyczajem jednej fazy.**

Dodatkowo: **kontrola negatywna sama wymaga kontroli.** Sprawdzałem dziś zapadkę i18n usuwając
linię z pliku bazowego — test przeszedł. **Trafiłem w pustą linię.** Gdybym na tym poprzestał,
zaraportowałbym „zapadka nie działa". Liczy się nie to, że kontrola przeszła — tylko **w co trafiła**.

### W5. Dodatkowo, bo wracało: „narzędzie liczące kłamie" — 5 komend w jednym dniu

`pgrep` dopasowujący własną powłokę, `grep` bez `-a` pomijający plik jako binarny (raz o mało
nie poszło dalej jako „bramka bezpieczeństwa żywności nie działa"), `ls` i `wc` zjadane przez
hook, wrapper nadpisujący plik swoim podsumowaniem. **Reguła:** zerowy wynik potwierdź **drugą,
inną metodą**, zanim wyciągniesz wniosek. Dwa dzisiejsze błędy premisy (13 tabel zamiast 116;
„124 pokryte") wzięły się dokładnie stąd.

### W6. „Wiersz powstaje bez zakładu" — 5 wystąpień

Zlecenia produkcyjne, nośniki, wysyłki, pozycje GRN, niezgodności z CCP. Za każdym razem inne
miejsce, ta sama klasa — i to jest ten sam mechanizm, który zablokował dziś deploy przez
migrację 551. **Naprawa klasy: `NOT NULL` na `site_id` po backfillu, zamiast pięciu guardów.**

---

## Czego ten dzień NIE objął

Właściciel musi wiedzieć, gdzie **nie patrzyliśmy** — brak znalezisk w tych obszarach
nie znaczy, że jest tam czysto.

**Pieniądze:** zwroty i reklamacje (`rma-actions.ts`), wycena MRP, wnętrze `upsert-wac.ts`
(874 linie — testy sugerują arytmetykę na bigintach, ale nikt tego nie otworzył),
import kosztów z systemu zewnętrznego.

**Izolacja:** 110 ze 116 tabel (inferencja, nie pomiar), 10 widoków `v_*`, dojście do zakładu
przez klucz obcy w tabelach bez kolumny `site_id`, warunki `WHERE` ekranów — defekt na ekranie
wykazany twardo **tylko dla listy zleceń utrzymania ruchu**.

**Wysyłka:** zwroty i kompletacja (poza budżetem czasu), anulowanie **przed** wysyłką.

**Testy:** ~150 plików w `packages/db` nieotwartych; szerokość kształtu „asercja na atrapie"
poza jednym dowodem mutacyjnym; **zachowanie CI** — twierdzenie „CI wykonuje pakiety" opiera się
na lekturze `ci.yml`, **nie na przebiegu**.

**Baza produkcyjna:** wszystkie zliczenia pochodzą z baz testowych. Odczyt z produkcji był dziś
zablokowany przez klasyfikator. To dotyczy **każdej liczby w tym dokumencie**.

**Nietknięte w ogóle:** wydajność poza jednym predykatem RLS (naprawiony: 10 995 ms → 26 ms),
dostępność, bezpieczeństwo aplikacyjne poza uprawnieniami (żadnego przeglądu klasy OWASP),
integracje D365 poza naprawą crona i outboxu, warstwa definicji raportów (6 tabel, zero
referencji poza dumpem schematu), ~16 tabel bez żadnego kodu (listy przewozowe, plany zdolności,
części zamienne, transfery międzyzakładowe, kody podatkowe), **677 × TS2835** (importy NodeNext) —
największa nienaprawiona klasa w bramce typów, świadomie niezamaskowana.

**Katalog testów kontraktowych Fazy 2: ~62 z 567 pozycji.** Zamknięte 11%. Z tego wyszło
10 defektów kodu — ale szardy NPD/kosztorysowanie i jakość dały **zero defektów**, czyli
kontrakty tam są faktycznie spełnione. Pozostałe 505 pozycji to najbliższe źródło nowych znalezisk.

---

## Podsumowanie kolejności

| kolejność | fala | praca | blokada |
|---|---|---|---|
| **1** | Fala 0 — push 72 commity | 30 min właściciela | **czeka na właściciela** |
| **2** | **W1 + W2** (wzorce: `return`=commit, pominięte testy) | 2 dni | — |
| **3** | Fala A — ciche uszkodzenia danych | 2-3 dni | A1 wymaga rozstrzygnięcia bigint |
| **4** | Fala B — bramki meldujące zieleń | 2 dni | B3 czeka na Decyzję 3 |
| **5** | Fala E — reszta pracy nad suitą | 1-1,5 dnia | — |
| **6** | Fala C — zegar | 1,5-2 dni | — |
| **7** | Fala D — izolacja zakładów | 0,5 + 3-5 dni | **czeka na Decyzję 1** |

**Razem: 10-14 dni pracy inżynierskiej**, z czego **6 dni jest zablokowane** decyzjami z sekcji
powyżej. W1 i W2 są przed Falą A świadomie: bez nich naprawy z Fali A zostaną zaraportowane
jako zielone i nikt nie będzie wiedział, czy to prawda.
