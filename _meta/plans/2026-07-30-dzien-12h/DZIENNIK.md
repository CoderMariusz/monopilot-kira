# DZIENNIK 2026-07-30 — bieżący stan pracy

> Aktualizowany na bieżąco. **Po kompakcie czytaj to jako drugie, zaraz po `PLAN-DNIA.md`.**
> Koniec pracy: **20:00**. Ostatnie zlecenie: **19:45**.

## OSTATNI RAPORT DLA OWNERA: 18:55 (pełny raport dnia na życzenie ownera)

**Na każdym checkpointcie (co 10 min): `date "+%H:%M"` i porównaj z tą linią. Minęło ≥55 min →
NAPISZ RAPORT ZANIM ZROBISZ COKOLWIEK INNEGO, potem zaktualizuj tę godzinę.**
Powód: cron odpala się TYLKO gdy jesteś bezczynny, a bramka trwa 10-30 min ciągłego wykonywania
i zjada okno. 30.07 owner został bez raportu przez 68 min, bo raport wisiał na jednym oknie `:52`.

## ⛔ Trzy komendy, które dziś SKŁAMAŁY (nie ufaj im)

| komenda | fałszywy wynik | dlaczego | zamiast tego |
|---|---|---|---|
| `pgrep -f 'codex exec'` | „6 torów żyje" gdy żaden nie żył | dopasowuje **własną powłokę**, w której linii poleceń jest ten napis | `ps -Ao pid,comm > plik` → `grep` na pliku |
| `ls <katalog>` | pusty katalog, choć miał 16 plików | hook rtk zjada wynik | `find <katalog> -name '...'` |
| `wc -l < plik` | `0` dla pliku z 50 liniami | j.w. | `stat -f%z` |
| `grep` bez `-a` | „nikt nie zapisuje do `changeover_events`" — a zapis jest w linii 481 | plik uznany za **BINARNY**, pominięty z komunikatem „Binary file matches" zamiast treści | `grep -a`; a przy wniosku „nikt tego nie woła" **zawsze druga metoda** |
| `rtk grep` z `> plik` | nadpisał baseline swoim podsumowaniem („14 matches in 14 files") zamiast treścią | wrapper wypisuje raport, nie wynik | do zapisu przez potok **nie używać wrappera** |

**Wzorzec:** narzędzie do liczenia/listowania zwraca „0/pusto" → to najpierw podejrzenie o filtr,
a dopiero potem fakt. Zerowy wynik potwierdź DRUGĄ, inną metodą, zanim wyciągniesz wniosek.

## ✅ FALA L ZAMKNIĘTA — commit `31d23e78` (12:50)

Bramka: typecheck `rc=0` · 114 testów node (4 pliki) · 15 UI. Każde twierdzenie toru
zweryfikowane MOIM uruchomieniem, nie zacytowane.

| co | przed → po |
|---|---|
| deadlock korekt na COMPLETED WO | 13 czerwonych → **40/40**; z 13: **12 pinowało poprawny kontrakt**, 1 defekt |
| `routing_duration` liczone 2× | 183 min → **91,67 min** |
| okno kalendarza jako czas pracy | 48 h → **4 h** |
| matryca alergenów gubiła produkty czyste | nie JOIN — guard na jednostronnie pustym profilu |
| „Start" na MWO bez efektu | odrzucona obietnica omijała `setError` i wywracała komponent |

**Do decyzji ownera:** filtr `ro.line_id = wo.production_line_id` może zaniżać czas marszruty
wieloliniowej — czy obciążenie ma obejmować całą marszrutę, czy tylko operacje wybranej linii.

## ⛔ PUSH WSTRZYMANY mimo zgody ownera (12:40)
Owner zgodził się na push, ale **minutę później** wyszedł fakt, którego przy pytaniu nie było:
```
bash scripts/test-db.sh reset t2  →  rc=1
Migration failed: 551-production-site-visibility-rls.sql
migration 551 refuses fail-closed flip: 1 site-scoped rows still have NULL site_id
```
Build Vercela sam stosuje migracje → push = **zatrzymany deploy**, nie wdrożenie.
Winny wiersz: **wysyłka utworzona dziś o 11:09 przez samą aplikację**. Migracja `558` istnieje
lokalnie, jest **nieśledzona przez git** i leży PO 551 — błąd kolejności. Naprawia tor M1.

## ⛔ PUSH ZABLOKOWANY PRZEZ KLASYFIKATOR (13:08) — POTRZEBNY OWNER
`git push origin main` **odrzucony przez klasyfikator uprawnień**. Nie obchodzę tego.
Odczyt z produkcji (audyt wierszy bez `site_id` przed pushem) — **też zablokowany**.
Owner ma wpisać u siebie: `! git push origin main`.
**17 commitów czeka.** Bloker deployu NAPRAWIONY i udowodniony (patrz niżej).

**Ryzyko resztkowe, którego nie zdołałem zbadać:** jeśli produkcja ma wiersze bez zakładu,
których backfill nie rozstrzygnie, bramka 551 odmówi i **deploy się zatrzyma**. To awaria
BEZPIECZNA — zatrzymany deploy, nie uszkodzone dane.

## ✅ BLOKER DEPLOYU ZAMKNIĘTY — commit `c316d6c9` (13:05)
Dowód dwustopniowy, drugi stopień jest tym istotnym:
1. cały łańcuch od zera na czystej bazie `monopilot_migcheck` → **512 migracji, rc=0**;
2. **to jeszcze nie dowód** — pusta baza nie ma czego audytować. Więc 550+551 uruchomione
   w transakcji na bazie ZAWIERAJĄCEJ wiersz łamiący bramkę → `shipments: remaining_null=0`,
   551 przechodzi. Rollback, dane nietknięte.

Zostaje **1 magazyn bez zakładu i bez źródła** (`no_candidate=1`) — 551 na to nie patrzy, do decyzji.
Uwaga na przyszłość: `test-db.sh reset` NIE wystarcza po zmianie treści zastosowanej migracji —
runner rzuca `CHECKSUM MISMATCH`. Trzeba czystej bazy. Na produkcji tego konfliktu NIE MA,
bo 550 nigdy tam nie była zastosowana.

## ✅ Commit `1a0bce31` — bramka widząca testy
`pnpm typecheck:tests` (nowy `apps/web/tsconfig.tests.json`). **Celowo czerwona: 1644 diagnostyki
w 450 plikach.** Używać jako RÓŻNICY ZBIORÓW, nie pass/fail. Martwa forma `vi.fn<Args,Return>`
(36 użyć, 11 plików) wyczyszczona → `TS2558: 33→0`, znikły 104 kaskadowe.
Największa nienaprawiona klasa: **677 × TS2835** (importy NodeNext) — nie zamaskowana.

## ✅ FAZA 2 RUSZYŁA — pilot zdał, 4 szardy w biegu (13:38)
Commit `45502a26`: **11 z 567** pozycji GAP zamkniętych (planowanie, same P0).
Pilot puszczony CELOWO sam, przed resztą, żeby sprawdzić jakość — i to się opłaciło.

**Wymóg, który czyni te testy wartościowymi:** każdy zielony test zweryfikowany przez
**tymczasowe zepsucie kodu produkcyjnego** (dzielenie→mnożenie, `greatest`→`least`, usunięte
`CANCELLED`, wyłączona bramka uprawnień, przesunięta reguła czwartku ISO). Każda mutacja
wywróciła swój test, wszystkie cofnięte. **Ten wymóg zostaje w każdym szardzie.**

Szardy w biegu: **S1** technika (165 GAP) · **S3** magazyn/wysyłka/finanse (53) ·
**S4** produkcja/jakość/harmonogram (37). **S5 (NPD/costing) CZEKA** — tam nowe testy byłyby
czerwone od kodu, nie od testu, dopóki nie naprawimy waterfall/wip-cost.

## 🔴 MRP liczy zlecenia ROBOCZE jako podaż (ujawnione przez pilota)
`PLN-038`: `Expected "50.000" Received "90.000"` — **potwierdzone moim uruchomieniem**.
`mrp.ts:114-119`: `SCHEDULABLE_WO_SUPPLY_STATUSES` zawiera `DRAFT`, podczas gdy `OPEN_PO_STATUSES`
wyklucza wersje robocze z jawnym komentarzem „draft POs are not yet committed".
System zna zasadę, ale stosuje ją tylko do zakupów.

**⚠️ PUŁAPKA dla naprawiającego (tor N6 dostał to wprost):** `DRAFT` jest na OBU listach —
popytu i podaży. Usunięcie go tylko z podaży → popyt policzony, podaż nie → **NADZAKUP**,
czyli defekt naprawiony dziś rano w `a595b8e2`. Model trzeba rozstrzygnąć w całości:
zlecenie robocze uczestniczy w MRP **całe albo wcale**. Tor ma też prawo orzec, że
**kontrakt katalogu jest błędny, a kod ma rację** — to dopuszczalny wynik.

Czerwony test NIE został wpuszczony do suity — leży razem z naprawą.

## 🔴🔴 MODUŁ NPD ZAMKNIĘTY OD WEJŚCIA — jedna kolumna (14:35)
Pełne przejście łańcucha: **NIE da się przeprowadzić wyrobu od NPD do kosztu.** Urywa się na
PIERWSZEJ spoinie `brief → recipe`. Dalsze spoiny (technika→planowanie→produkcja→finanse)
PRZESZŁY na wyrobie z Technical — łańcuch nie jest zepsuty na całej długości, jest **odcięty
od wejścia**.

Przyczyna: bramka G0 wymaga `weekly_volume_packs`, ale **to nie jest kolumna widoku
`public.product`**, a `resolveGateFieldValues` (`evaluate-stage-gate.ts:42-56`) robi **zwarcie
na `product_json`**, gdy projekt ma `product_code` (kreator mintuje wyrób od razu) → wartości
z `npd_projects` są ignorowane. `HARD_BLOCKED` **nie ma nadpisania**.

**Kontrola przeciwna (to czyni z tego dowód):** wpisanie wartości w UI zapisuje ją do
`npd_projects`, widok bez zmian, **lista blokerów identyczna, potwierdzenie nadal zablokowane**.
Zasięg: **19/19 projektów stoi na brief/G0, 0 zwolnień do fabryki, 0 BOM-ów z NPD.**
To JEDYNE strukturalnie nieosiągalne pole w całej konfiguracji bramek — i siedzi tam, gdzie musi
przejść każdy projekt. Naprawia tor **P1**.

## ⚠️ ROZJAZD, KTÓRY SAMI DZIŚ STWORZYLIŚMY (14:35)
Commit `c6ca0889` naprawił **wyświetlanie**, ale nie **księgowanie**. Wiersze zużycia zaksięgowane
wcześniej mają zamrożony stempel `wac_value = 0`; odczyt liczy je dziś z cennika.
`DEMO-WO-259-004`: ekran **MATERIALS 1750**, księga **0.000000** → 640 z 700 kg bez wartości.
**Przed naprawą oba źródła zgodnie pokazywały zero.** To regresja w sensie SPÓJNOŚCI, nawet jeśli
każda strona z osobna pokazuje „lepszą" liczbę. Naprawia tor **P2** — z wymogiem rozstrzygnięcia
kontraktu księgowego (stempel czy bieżąca wycena) i **zakazem cichego przeliczania historii**.

Kontrola pozytywna, której nie wolno zepsuć: na zleceniu z realnym WAC bilans domyka się co do
cyfry — wejście `0.666653` = wyjście `0.666653`.

## 📈 DŁUG TYPÓW W TESTACH ROŚNIE (17:17) — pomiar, nie domysł
`pnpm typecheck:tests`: **13:00 → 1644 błędy · 17:17 → 1699**. Przyrost **+55 w 4 godziny**,
mimo że bramka istnieje od 13:00.

Powód: nowe pliki testowe (katalog Fazy 2, kontrakty przekrojowe, nowe fixture'y) powstają
z **tą samą martwą formą `vi.fn<Args, Return>`** i innymi wzorcami, które ta bramka wykrywa —
ale **nikt jej nie odpala przed dodaniem pliku**, bo nie jest w `make verify`.

**Wniosek: sama bramka nie wystarczy, jeśli nie jest w domyślnej ścieżce.** Kandydat na tor:
podpiąć `typecheck:tests` do bramki wejściowej z progiem (nie zero, tylko „nie więcej niż dziś"),
żeby dług przestał rosnąć, nawet zanim go spłacimy.

## 🚫 CODEX WYCZERPANY (16:19) — `try again at Aug 5th`
Padły na tym dwa tory (montowanie ekranów NPD, cztery czerwone testy pg). **Oba przepuszczone
przez Opusa i skończone z sukcesem.** Od 16:20 wszystko idzie przez Opusa i Fable.
Przy okazji wyszedł mój błąd routingu: montowanie ekranów to zadanie **interfejsowe**,
czyli od początku należało do Opusa, nie do Codeksa.

## 📋 STAN 16:20 — 10 TOROW W BIEGU, 33 COMMITY NIEWYPCHNIETE

**Owner zdecydowal (15:50):** (1) BUDUJEMY prawdziwy drugi podpis dla NCR/blokad/CCP —
nie poprawiamy tylko interfejsu; (2) reszta dnia na KATALOG testow.

### Tory naprawcze w biegu
| tor | co |
|---|---|
| Q1 | **budowa drugiego podpisu** (decyzja ownera) — wzorzec: LOTO + przezbrojenie alergenowe |
| Q2 | jednostka jako WOLNY TEKST w liniach PO/TO + spis `min(inv.uom)` — ten sam mechanizm, co blad 1000× |
| Q3 | spis zamykany z pominieciem przegladu · 4 odmowy skanera BEZ audytu · partia przeterminowana znika z FEFO |
| Q4 | **etykieta identyfikuje INNY produkt** (EAN-13 + doklejona 2. cyfra kontrolna) · druk z produkcji zawsze 500 |
| Q5 | „Zaproszenie wysłane" bez wysylki · cron D365 martwy 3× · outbox 100 zdarzen NA DOBE |
| Q6 | **act-as przezywa wylogowanie** (bezpieczenstwo) · awaria zjada zdarzenie · flaga D365 nie blokuje · korekta gubi wpis zastepujacy |

### Katalog Faza 2 — stan
Zamkniete: **S2** 11 (1 defekt) · **S1** 12 (0) · **S3/S4** czesc (2 defekty) · **S8** 3 (3 defekty) ·
**S5** 12 (0) · **S6** 12 (0) · **S7** 12 (**4 defekty**).
Razem **~62 z 567 pozycji GAP**, **10 ujawnionych defektow kodu**.
S5 (NPD/kosztorysowanie) i S6 (jakosc) — ZERO defektow, kontrakty faktycznie spelnione.

### 🔴 ZNALEZISKO ARCHITEKTONICZNE — decyzja ownera, NIE defekt kodowy
**Caly `apps/worker` (6 zadan) nie jest nigdzie uruchamiany.** Wdrozenie obejmuje tylko `apps/web`;
docker-compose to sam Postgres; brak Dockerfile, CI i skryptu startowego.
Skutki: usuwanie danych osobowych **bez zadnej zywej sciezki**, maile o wygasajacych dokumentach
zgodnosci nigdy nie wychodza, ponawianie nieudanych wysylek nie istnieje — mimo ze ekran obiecuje,
ze „obsluguje to worker outboxu". Architektura zaklada, ze tlo dokonczy robote; tla nie ma w deployu.
**NIE naprawiac w torze kodowym.**

### Wzorce dnia (do sprawdzania, nie odkrywania od nowa)
- **„wiersz powstaje bez zakladu" — 5 wystapien**: zlecenia produkcyjne, nosniki, wysylki,
  pozycje GRN, niezgodnosci z CCP. Za kazdym razem inne miejsce, ta sama klasa.
- **anty-test — 14 wystapien**. Najnowszy: suita GS1 74/74 zielona, ZERO testow kodu 13-cyfrowego.
- **„guard chroniacy jeden przypadek zamraza sasiednie" — 12 wystapien.**
- **„ekran istnieje, dane nigdy nie powstaja"**: `recall_drills`, D365 Drift/Audit, „Run import".

## ⚠️ PUŁAPKA MIGRACYJNA — zmiana treści ZASTOSOWANEJ migracji jest cicha (14:08)
Baza `monopilot` ma 550 zastosowaną **o 10:17, w wersji sprzed naprawy**. Runner pomija ją jako
`already applied`, więc **nowy backfill NIGDY się nie wykonuje** — i 551 słusznie odmawia.

**Na produkcji tego problemu NIE MA** (550 nigdy tam nie była zastosowana), ale dotyczy
KAŻDEGO środowiska, które zmigrowało dziś między 10:17 a naprawą: `monopilot`, klony.
Na klonie `t2` ten sam stan objawił się jako `CHECKSUM MISMATCH`; tutaj przeszedł po cichu.

**Reguła:** po zmianie treści migracji, która gdzieś już poszła, `reset` NIE wystarcza —
potrzeba bazy od zera albo ręcznego uruchomienia nowej treści.

## ⛔ TRZY AKCJE ZABLOKOWANE PRZEZ KLASYFIKATOR (nie obchodzić)
1. `git push origin main` — **25 commitów czeka**, owner ma wpisać `! git push origin main`
2. odczyt z produkcji (audyt wierszy bez `site_id` przed pushem)
3. zapis do lokalnej bazy poza transakcją (ręczne domknięcie backfillu na `monopilot`)
Skutek (3): pełne przejście E2E jedzie na bazie bez migracji 551/556/557/558 — tor dostał
listę znanych skutków, żeby nie zgłosił ich jako nowych defektów.

## 🔴🔴 P0 NA PRODUKCJI: zasiana polityka zatwierdzeń jest SPRZECZNA (13:22)
**Potwierdzone przeze mnie zapytaniem do bazy ORAZ odczytem kodu**, nie zacytowane z raportu:

```
technical_product_spec_approval | is_enabled=t | min_approvers=1 | {"require_dual_sign_off": true}
```
we WSZYSTKICH organizacjach klonu. A `preflight.ts:99-101` odrzuca dokładnie tę kombinację
(`min_approvers_dual_sign_invalid`).

**Skutek:** `release-bundle-service.ts:637` to JEDYNE miejsce ustawiające `approved_for_factory`,
a `releaseWorkOrder` wymaga zatwierdzonej specyfikacji → **żadne zlecenie na produkt utworzony
w module Technical nie może zostać zwolnione do produkcji. U każdego klienta, od pierwszego dnia,
bez żadnej akcji użytkownika.** Produkty z NPD tego nie odczuwają (`materialize-npd-bom.ts:1668`
wstawia spec od razu jako `approved_for_factory`) — to osobna asymetria do rozstrzygnięcia.

Źródło: migracje `063` i `487`. Naprawia tor **N5** (zasiew + migracja danych + CHECK w bazie +
post-check wykonywalny, w tej kolejności — CHECK PO naprawie danych).

## ✅ E2E BOM→ZLECENIE — poprzedni bloker był FAŁSZYWY
„Nie da się utworzyć BOM-u z interfejsu" było **opisem nietkniętej bazy, nie produktu**.
Da się: Technical → BOMs → New BOM → picker → „+ Add first component". Powtórzone na 5 różnych FG,
approve → `technical_approved`, publish → `active`. Nowy spec `bom-to-wo-material-chain.spec.ts`,
**11 passed**. Zlecenie z materiałami i wydanie materiału też przechodzą (po obejściu F-1).

Pozostałe znaleziska tego przejścia:
- **F-2 (P1)** zużycie bez nośnika **obciąża koszt, ale nie rusza zapasu**: `consumed_qty` i WAC
  rosną, `license_plates` bez zmian (32,0005 przed i po), `stock_moves`=0,
  `wo_material_consumption.site_id = NULL`. Ten sam wzorzec co FINDING-LANCUCH #4.
- **F-3 (P2)** ~7-10 serwerowych `FORMATTING_ERROR` na każdy render ekranu BOM-u.
- **Import w Settings to ATRAPA** — „Run import" nie ma akcji serwerowej
  (`import-export-hub.client.tsx:407-413`).
- ⚠️ **Zmiana stanu:** `min_approvers` w bazie `monopilot` został trwale ustawiony na 2 przez UI.

## FALA N — odpalona 13:08 (z audytu ruchów zapasu Fable)
| tor | co robi |
|---|---|
| N1 | **P0** spis z natury PODWAJA zapas (50 kg → 100 kg); anty-test nr 13 |
| N2 | **P0** korekta stanu ignoruje JM: „−500 g" zdejmuje **500 kg**. Znalezisko WNIOSKOWANE — tor ma najpierw POTWIERDZIĆ albo obalić |
| N3 | rozbicie palety `returned` tworzy zapas z niczego · `destroyLp` zostawia linie-widma |

**Wspólny korzeń Z1/Z3/Z4 wg Fable: trzy różne definicje „co jest zapasem"** (seed spisu /
`v_inventory_available` / pivoty). Tory mają najpierw wypisać je obok siebie — naprawa jednej
pary tylko przesunie defekt.

## 📋 FAZA 2 KATALOGU — rozpoznana (13:02)
Klasyfikacja NIE jest w `FULL-TEST-CATALOG.md`, tylko w
`_meta/plans/2026-07-29-katalog-testow-egzekucja/FAZA-2-GAP-{TEC,SFQ,PLN,NSA,WH,E2E,PRD,UI,XC}.md`
(jeden wiersz = jeden GAP, stąd `grep GAP` nic nie dawał).
**Liczby przeliczone niezależnie i zgodne: 502 PASS / 55 FAIL / 567 GAP / 335 BLOCKED.**
Priorytet ownera: **174 z 567 to obliczenia** (73× P0), 60 to niedziałające funkcje.
Rozkład GAP: TEC 165 · SFQ 72 · PLN 67 · NSA 63 · WH 53 · E2E 51 · PRD 37 · UI 32 · XC 27.
5 szardów rozłącznych po katalogach; tylko 3 pliki dzielone między domenami.
**~~Bloker: klonów są 3, nie 5~~ — TO NIE JEST BLOKER.** Rozpoznanie założyło, że szardy piszą
do bazy. **Nie piszą: sandbox Codeksa w ogóle nie ma dostępu do Postgresa** (`EPERM`), więc tory
piszące testy klonów nie potrzebują. Klony służą MOJEJ weryfikacji i agentom Fable/Opus — trzy
w zupełności wystarczą. **Nie rozszerzaj `CLONES` w `test-db.sh`** — to byłaby naprawa problemu,
którego nie ma.
**Zalecenie: S1/S2/S4 startują od razu; S3/S5 dopiero PO naprawach WAC/waterfall**, bo tam nowe
testy będą czerwone od kodu, nie od testu.

## 🚨 BRAMKA BYŁA ŚLEPA NA TESTY (odkryte 12:55)
`apps/web/tsconfig.json` ma w `exclude`: `e2e`, `**/*.test.ts`, `**/*.test.tsx`, `**/__tests__/**`.
Czyli **`pnpm -r typecheck` nie widzi ANI JEDNEGO pliku testowego** i zwraca `rc=0` niezależnie
od tego, czy fixture'y się kompilują. Potwierdzone odczytem configu, nie domysłem.

**Co ta dziura kosztowała dziś:** fixture rozjechał się z typem → produkcyjny modal PO wywalał się
u użytkownika · w jednym pliku testowym siedziało **40 błędów typów** niewidocznych dla bramki ·
przyczyna zbiorcza to **martwa forma `vi.fn<[Args],Return>()`** (Vitest ≤0.34); tutejszy Vitest to
**4.1.5**, gdzie `vi.fn<T>` bierze CAŁY typ funkcji → stara forma daje `never` i kaskadę błędów.

Tor **M7** buduje drugą bramkę (`typecheck:tests`) i liczy, ile jest do posprzątania.
**Do czasu jej powstania nie traktuj `typecheck rc=0` jako dowodu, że testy się kompilują.**

## ✅ Commit `6d53959c` (12:53)
crash modala PO (zabezpieczenie w kodzie produkcyjnym, bo brak klucza w dowolnym języku daje ten sam
crash) · wspólny helper fixture'ów `owner-org-context` (4 nawracające defekty miały jedną przyczynę:
każdy test budował organizację od zera) · 40 typów w fixturze · 7 komunikatów przetłumaczonych na ro/uk.
Bramka: 37/37 UI · 180 node/pg na `t1` · typecheck `rc=0`.

## FALA M — odpalona 12:35
| tor | co robi | silnik |
|---|---|---|
| M1 | **BLOKER DEPLOYU**: wysyłki bez `site_id` + kolejność migracji 550/551/558 | Codex SOL |
| M2 | zużycie materiału wyceniane na 0 mimo kosztu (dowód stemplami czasu) | Codex SOL |
| M3 | waluty EUR+GBP sumowane 1:1 w zamówieniach sprzedaży + anty-test | Codex SOL |
| M4 | zwroty RMA: wycena 2× i cena od cudzego klienta | Codex SOL |
| M5 | porządek typów: spec E2E + fixture `purchase-orders.test.tsx` | Opus |
| M6 | audyt Fable: ruchy zapasu, przesunięcia, inwentaryzacja | **Fable**, klon `t3` |

## ⛔ CZWARTA komenda, która skłamała
`ps -Ao comm` + `grep -c codex` → **0**, choć tory żyły. Powód: `comm` pokazuje `node`, nie `codex`,
a `grep -c` przez hook rtk zwraca sformatowany tekst zamiast liczby.
**Rozwiązanie: `bash $CLAUDE_JOB_DIR/tmp/tory.sh`** — mierzy stan torów mtime'em logu, nie `ps`.

## FALA L — odpalona 11:42 (poprzednie tory stały bezczynnie od ~11:35)

| tor | co robi | silnik | zasób |
|---|---|---|---|
| L1 | DEADLOCK korekt na COMPLETED WO + 13 czerwonych `corrections-actions` | Codex SOL | kod |
| L2 | harmonogram: `routing_duration` liczone 2× · okno kalendarza jako czas pracy | Codex SOL | kod |
| L3 | matryca alergenów gubi produkty bez alergenów · „Start" na MWO bez efektu | Codex SOL | kod |
| L4 | audyt Fable: wycena → marża → cennik → faktura (obszar nietknięty) | **Fable** | read-only |
| L5 | E2E w przeglądarce: produkcja → finanse | Opus | **przeglądarka** + `monopilot` |
| L6 | crash modala PO: `map[error.field].replace` na `undefined` (brak klucza i18n) | Opus | `create-po-modal.tsx` + `i18n/*` |

**NIE commituj `apps/web/i18n/*.json`, `create-po-modal.tsx` ani `purchase-orders.test.tsx`,
dopóki L6 nie skończy** — są w trakcie edycji.

## Fixture `dashboard-data.pg.test.ts` — czerwień ZASTANA, nie regresja
Sprawdzone przez odtworzenie wersji z HEAD: HEAD pada **wcześniej** (`users.role_id`) niż wersja
przepisana przez tor. Łańcuch dryfu schematu w tym jednym pliku: `users.role_id` →
`bom_headers.created_by` (jest `created_by_user`) → brak `approved_by`+`approved_at` przy statusie
`active` → `bom_headers_not_orphaned_check` **przedefiniowany na `item_id`** → `wo_outputs.transaction_id`.
Pierwsze cztery naprawione, piąte zostaje. **Wolno to commitować** — mniej czerwone niż baseline.

## Bieżące tory

| tor | co robi | silnik | zasób | status |
|---|---|---|---|---|
| Fable-obliczenia | audyt WAC / konwersji / skal / wariancji | **Fable** | klon `t3` | 🔵 od 08:20 |
| Fable-łańcuch | logika NPD→finanse, blokery, niedziałające funkcje | **Fable** | klon `t2` | 🔵 od 08:20 |
| E2E-ścieżka | przejście NPD→finanse w przeglądarce | Opus | **przeglądarka** + `monopilot` | 🔵 od 08:50 |
| F4 | konwersja g→kg · netting WAC · NSA-027 (preflight) | Codex SOL | klon `t1` | 🔵 od 09:00 |

**Przydział zasobów jest ROZŁĄCZNY** — `monopilot`=przeglądarka, `t1`=F4, `t2`=Fable-łańcuch,
`t3`=Fable-obliczenia. Nie łam tego: dwa tory na jednym klonie dają wyniki nieodróżnialne
od kolizji fixture'ów (zdarzyło się dziś, poprawione).

## Zamknięte dziś

### `a4793ff5` — cztery naprawy, wszystkie zweryfikowane uruchomieniem
| naprawa | dowód |
|---|---|
| **PRD-008** duplikat zdarzeń przy replayu | `wo-lifecycle.integration` **10/10**, w tym test idempotencji — wcześniej czerwony |
| **NSA-150** RODO, 3 przeciekające odwołania | AC1 przechodzi — wcześniej `expected 3 to be +0`. Mig **545**, PREPARE na prodzie 3× |
| **Onboarding** (3 ID katalogu) | RED `2 failed` → GREEN **4/4**; anty-testy zamienione na kontraktowe |
| **Bramka anulowania WO** | oba kierunki: skonsumowany blokuje ✓, nieskonsumowany przechodzi ✓ |

Plus korekty katalogu wg decyzji ownera (`WH-066` fail-closed, `SFQ-072` blokada, oba przejścia zostają).

**Bramka:** typecheck 0 · obie suity osobno · PREPARE 545 3× · **różnica ZBIORÓW**:
6 plików naprawionych, 2 nowe czerwone — **oba nie-regresje** (nowy test PG padający jawnie bez
`DATABASE_URL`; flak od obciążenia potwierdzony 3× szeregowo 5/5).
Rdzeń: **39 → 34** czerwonych plików, **57 → 39** czerwonych testów.

### Wcześniej (noc)
- 457 zdarzeń outboxu ostemplowanych na prodzie · push `9f9dd557..1323a7ae` (15 commitów)

## ⚠️ Do pilnowania
- **`corrections-actions.test.ts` — 13 czerwonych** wokół unieważniania outputu i odwracania WAC.
  Objaw: `expected { ok: false, error: 'invalid_state' } to deeply equal { ok: true }`.
  **Czerwień ZASTANA** (była w pomiarze bazowym). Wzorzec „guard zamraża sąsiedni przypadek".
  Kandydat na osobny tor.
- **`npd-gdpr-erasure.test.ts`** — 3 pozostałe czerwone padają na `product delete requires an org
  context`. To sprzątanie fixture'u, **nie kontrakt**. Rdzeń defektu naprawiony.
- `UI-003` (global search) — **bez decyzji ownera**.
- Obejście B w `lp-downstream-guard.ts` (netto konsumpcji = 0) — **świadomie zostawione**, do decyzji.

## Nauczki z dziś (nie powtarzać)
1. **Dałem dwóm torom ten sam klon** — poprawione, ale kosztowało rundę. Przydział musi być rozłączny.
2. **Pierwsza ścieżka E2E wyglądała na bloker produktu** (kreator NPD nie odblokowywał „Dalej").
   Naprawdę: **spec starszy od formularza** — wypełnia 1 pole, walidacja wymaga 3 (doszły mig 427).
   Zgłoszenie bez sprawdzenia dałoby fałszywy bloker na głównej ścieżce.

## Następne w kolejce
1. Odbiór F4 (obliczenia — priorytet ownera) + bramka + commit.
2. Odbiór obu Fable → z ich znalezisk uformować kolejną falę napraw.
3. Faza 2: szardy P1-P5 (klony wolne po zakończeniu torów).
4. `corrections-actions` — 13 czerwonych, osobny tor.

---

# ZNALEZISKA FABLE (08:20-08:45) — 16 defektów, 10 potwierdzonych uruchomieniem

Pełne raporty: `FINDING-OBLICZENIA.md` (8) · `FINDING-LANCUCH.md` (8 + 1 obserwacja)

## 🔴 Integralność finansowa — pieniądze (raport obliczeń)
| # | co | plik | dowód |
|---|---|---|---|
| 1 | **void + ponowna rejestracja outputu = wyrób za £0** | `resolve-output-wac.ts:103-113` | £500 → output 100 kg (£500 ✓) → void (0/0 ✓) → ponowna rejestracja → **100 kg / £0 / śr. £0**, `applied:true` |
| 2 | **storno zużycia = £500 z niczego** | `resolve-output-wac.ts:66-102` | WO z netto 0 kg wycenia output na £500, a pula surowca już dostała zwrot → **wartość zapasów podwojona** |
| 3 | **zużycie w tonach nie schodzi z wyceny** | `upsert-wac.ts:316-342` | `debitWac(2 t)` na 3000 kg/£15000 → **pula nietknięta**, tylko `console.warn`. Konwerter obok liczy `2 t = 2000 kg` |
| 4 | pack→kg bez wagi bazowej | — | 10 each × 250 g → **2500 kg zamiast 2,5** (1000×) |
| 5 | kosztorys NPD bez wagi paczki | — | koszt 1,70→1,00, marża 66%→80%, `missing:[]` |
| 6-8 | blokada outputu przy historycznych gramach (422) · reversal WAC pomijany bez snapshotu · yield WIP 150%/0% traktowany jak 100% | | |

## 🔴 Łańcuch biznesowy (raport łańcucha)
| # | co | dowód |
|---|---|---|
| 1 | **DEADLOCK korekt na COMPLETED WO** — bramka anulowania każe „void each output before cancelling", a void odpowiada `invalid_state`; `reopen` nie istnieje | guard `isTerminalOutputVoidForbiddenStatus` (`correct-ledger-entry.ts:76-79`, Fala 10) stał się **pierwszą** kontrolą i odrzuca przed kontrolami LP/e-sign. Fala 10 dodała guard + 3 testy, **nie zmigrowała 12 testów starego kontraktu** |
| 2 | **konsumpcja bez site-scope** | **potwierdzone uruchomieniem**: FEFO wybrał LP z **cudzego zakładu** dla warszawskiego WO. Bliźniaczy `registerOutput` zakład **wymusza** |
| 3 | **outbox ma JEDNEGO konsumenta** | obiecani (scheduler→WO, finanse AR, raportowanie) **nie istnieją** — po naprawie cronów nie zmaterializuje się nic poza kaskadą. Tłumaczy, czemu duplikat PRD-008 był bezobjawowy |
| 4 | alokacja SO bez filtra `lp.uom` · wysyłka nie pisze `stock_moves`/`lp_state_history` (ledger ślepnie na rozchód) · sibling warehouse-target w `registerOutput` | |
| — | kolumny `*_eur` mają semantykę GBP — **odnotowane, żeby nikt nie zgłosił fałszywego rozjazdu walut** | |

## Rozwiązana zagadka 13 czerwonych w `corrections-actions.test.ts`
To **spór o kontrakt z twardym skutkiem**, nie zwykła czerwień. Asymetria: `reverseConsumption`
i `voidWasteEntry` na tym samym COMPLETED WO **działają** — korekta zakończonego zlecenia jest
jednostronna (wejście tak, wyjście nie). 13. czerwony jest osobny: `upsertWac` urósł do 7
parametrów, test asertuje stare 5.
**Decyzję trzeba spiąć z `E2E-054-10` i nettingiem WAC — to jeden węzeł polityki.**

## ⚠️ POWTÓRZONY BŁĄD ORCHESTRATORA (2× dziś)
**Przydzieliłem ten sam klon dwóm torom** — raz Fable-łańcuch + F1, raz Fable-uprawnienia + F4.
Oba razy poprawione, ale kosztowało rundy. **Przed każdym uruchomieniem toru sprawdź tabelę
przydziału zasobów na górze tego pliku.**

## Do decyzji ownera (kolejka)
1. **Deadlock korekt COMPLETED WO** — spiąć z `E2E-054-10` i nettingiem WAC, jeden węzeł polityki
2. `UI-003` global search — budujemy czy topbar przestaje obiecywać
3. Obejście B w `lp-downstream-guard.ts` (netto konsumpcji = 0)

---

# 🔴 AUDYT UPRAWNIEŃ (09:20) — ZAPIS PRZED BRAMKĄ

Raport: `FINDING-UPRAWNIENIA.md`. **3 defekty jednej klasy, 2 potwierdzone PARĄ uruchomieniem.**

Trzy akcje onboardingu robią mutację we **własnej, samodzielnie commitującej** transakcji
`withOrgContext` **zanim** wykona się jakakolwiek bramka. Jedyne sprawdzenie
(`settings.onboarding.complete`) siedzi w NASTĘPNYM kroku → odpala **po commicie**.
RLS na tych tabelach jest **tylko org-scope, bez roli** — nie ratuje.

| akcja | plik | co zapisuje bez uprawnień |
|---|---|---|
| `saveOrgProfile` | `save-org-profile.ts:65-66` → UPDATE `:127-143` | `name`, `currency`, `locale`, `timezone`, **`gs1_prefix`** |
| `createFirstWarehouse` | `create-first-warehouse.ts:37` → INSERT `:88-90` | wiersz w `warehouses` |
| `createFirstLocation` | `create-first-location.ts:31` → INSERT `:74-79` | wiersz w `locations` |

**`gs1_prefix` steruje generowaniem SSCC i kodów kreskowych CAŁEJ organizacji.**
Okno: każda org z `onboarding_completed_at IS NULL` — **Apex jest w oknie**.

**Dowód pary:** `no_module_access` (0 uprawnień) → `saveOrgProfile` zwraca `PERSISTENCE_FAILED`,
ale `organizations.name` i `gs1_prefix` **zmienione w bazie**. Kontrola: ta sama persona →
`advanceOnboarding` → `forbidden`, stan bez zmian; `admin` → przechodzi. 3/3 zielone.
**Bramka działa tam, gdzie jest — w tych trzech miejscach jest za późno.** Naprawia tor F8.

## Trzy rzeczy poboczne, ważniejsze niż wyglądają
1. **`requireAdmin()` to MARTWY KOD** — `gate-helpers.ts:475`, **0 wywołań** w repo.
   Wyjaśnia, czemu `revertNpdGate` bramkuje się uprawnieniem modułowym: **nie ma czym**.
   Każde miejsce, które „powinno wymagać admina", wymaga czegoś słabszego.
2. **`app.user_can_see_site` jest FAIL-OPEN przy `site_id IS NULL`**, a `wo_outputs`,
   `wo_events`, `downtime_events` mają **tylko** org-scope RLS — bez restrykcyjnej polityki
   widoczności zakładu, którą mają `work_orders`/`license_plates`.
   To rodzeństwo defektu „konsumpcja ignoruje zakład".
3. `deleteProject` bramkowany uprawnieniem **create** (`delete-project.ts:121`).

## ✅ Pokrycie negatywne — sprawdzone i POPRAWNE
Utrzymanie ruchu (deactivate/reactivate aktywu, MWO, LOTO + podział obowiązków) · onboarding-core
(`advance/back/jump/skip/restart/first_wo`) · bramki pipeline NPD · site-scope produkcji
(`work_orders` + `license_plates`, RESTRICTIVE `FOR ALL`) · brak fail-open w helperach auth/rbac/site.
**To pierwszy raz w tej kampanii, gdy mogę powiedzieć nie tylko „co zepsute", ale i „gdzie
sprawdziłem i jest dobrze".**

---

# KOREKTA WŁASNEGO TWIERDZENIA (09:00)
Zgłosiłem ownerowi „konwersja g→kg zwraca 0" jako defekt pieniężny. **NIEPRAWDA.**
`upsert-wac.ts:319` robi poprawne `round($1::numeric / 1000, scale)`. Objaw `qtyKg:'0'` brał się
z **testu repo** ustawiającego surowy GUC `app.current_org_id` zamiast `app.set_org_context` —
zapytanie nie widziało wiersza `items` i wpadało w `unresolved_uom`. Fixture naprawiony, **8/8**.

**Co się POTWIERDZA** (zweryfikowane przeze mnie wprost w zapytaniu `resolveWacDeltaQtyKg`):
resolver zna **dokładnie sześć** przypadków (`kg`,`g`,`base`,`uom_base=kg`,`each`,`box`);
`t`, `mg`, `mL` → `resolved:false` i ilość **wraca niezmieniona**; katalog jednostek organizacji
**nie jest w ogóle odpytywany**. Przy `each`/`box` mnożenie przez `net_qty_per_each` **bez
normalizacji** → błąd **1000×**. Naprawia tor F6.

**Nauczka do wzorców:** „potwierdzone uruchomieniem" znaczy tyle, ile warte jest środowisko,
w którym uruchomiono. Fable uruchomił poprawnie (używał `set_org_context`) — to **test repo**
był zepsuty. Dwa różne artefakty, jeden objaw.

---

# 🔴 E2E ŚCIEŻKA NPD→FINANSE (10:15) — 5 BLOKERÓW PRODUKTU

Raport: `E2E-SCIEZKA-NPD-FINANSE.md`. **8 z 12 przejść przeszedłem, 6/6 kroków głównego specu
zielonych z dowodem w bazie.** Naprawionych 9 przestarzałych specyfikacji.

| # | bloker | dowód |
|---|---|---|
| **P0-1** | **panel pickera wychodzi poza okno** — `item-picker.tsx:135`, `position:fixed` przycina oś POZIOMĄ, pionowej NIE, brak odbicia w górę | **1280×720**: klik timeoutuje, `formulation_ingredients` = **0 przez 11 przebiegów**. **1280×1600**: ten sam klik ~50 ms, wiersz **zapisany**. Wzorzec powtórzony **7×**, w tym `packages/ui/src/Select.tsx:427` — **pod KAŻDYM dropdownem aplikacji** |
| **P0-2** | linia SO z ceną 0 nie da się zapisać, a komunikat wskazuje **nie te pola** | `so-line-numeric.ts:12-21` odrzuca `0.0000`; świeży FG ma `list_price_gbp = NULL`, a modal mówi o ilości |
| **P0-3** | **„Confirm" nie wyprowadza SO z `draft`** — status zostaje, przycisk aktywny, **zero błędu** | odcina 4 ostatnie etapy (kompletacja→wysyłka→POD→finanse) |
| **P0-4** | **receptura NPD nigdy nie staje się BOM-em** | `bom_headers` = **0 dla wszystkich 17 projektów**; WO powstaje pusty, aplikacja sama mówi „no active BOM" |
| **P0-5** | **bramka „NPD → tylko przez Handoff" jest MARTWA** | `factory-spec-flow.ts:285-330` pyta o `items.npd_project_id`, a kreator mintuje FG przez widok `public.product`, którego trigger tej kolumny **nie ustawia** → wszystkie FG mają NULL, warunek **zawsze fałszywy** |

**P0-4 + P0-5 razem:** legalnie przejść się nie da, nielegalnie — bez przeszkód.

## 🔑 Najważniejsza obserwacja metodyczna całej kampanii
**P0-1 leżał pod ZIELONYM testem**, który logował „no items available — degrading" i przechodził.
Dowodem nie było wyrenderowanie ekranu, tylko **`formulation_ingredients = 0` po jedenastu
przebiegach**. To jest, w jednym przykładzie, cała różnica między „ekran się pokazał"
a „akcja zmieniła stan trwały".

## Znaleziska poboczne
`Select` po cichu gubi `data-testid` w 10 miejscach (`SelectProps` go nie deklaruje, atrybuty
z myślnikiem omijają kontrolę typów w JSX) · ~21 błędów i18n `FORMATTING_ERROR` na etapie Recipe ·
zdublowane kody w `unit_of_measure` (22 wiersze = 11 jednostek × 2).

## Kolejka napraw
- **P0-1** → 🔵 tor Opus (UI, wspólny prymityw, przeglądarka + `monopilot`)
- **P0-4 + P0-5** (most receptura→BOM + martwa bramka) → czeka na wolny klon
- **P0-2 + P0-3** (cena 0, Confirm nie opuszcza draft) → czeka na wolny klon

---

# AUDYT SCHEDULER / MRP / JAKOŚĆ (09:35) — 13 znalezisk, 8 potwierdzonych uruchomieniem
Raport: `FINDING-SCHEDULER-MRP-JAKOSC.md`.
**Fable OBALIŁ własną hipotezę** (rzekomo martwe SLA dla niezgodności — trigger działa)
i jej NIE zgłosił. Ta dyscyplina jest warta tyle, co same znaleziska.

## Trzy najgroźniejsze
| # | co | dowód |
|---|---|---|
| **MRP** | **zaalokowane SO odjęte DWA RAZY** (rezerwacja + pełny popyt) | 100 kg na stanie, SO 60 → „niedobór −20, kup 20"; przy pełnej alokacji → „kup 60". **Cichy, ciągły nadzakup przy KAŻDYM przeliczeniu** |
| **JAKOŚĆ** | **„partial" zwalnia 100% nośnika** | QA zwalnia część wstrzymanej partii, system uwalnia całość do wysyłki, **bez śladu ilościowego**. Bezpieczeństwo żywności |
| **SCHEDULER** | macierz przezbrojeń wyrzuca z harmonogramu **produkty bez alergenów** (`no_feasible_changeover`) | im staranniej wypełniona macierz, tym więcej czystych WO wypada z planowania |

## Pozostałe
**Scheduler:** okno kalendarzowe WO liczone jako czas biegu → WO z oknem >1 dnia **nigdy** nie
znajdzie zdolności nawet na pustej linii · przezbrojenie rozliczane w środku okna PM (bieg rusza
bez czasu na mycie/ATP) · `routing_duration` sumuje wersje `active`+`approved` (**91,7 → 183,3 min**)
i wycina operacje innych linii (→70 min).
**MRP:** prognoza niekonsumowana zamówieniami (1000 prognozy + 800 SO = popyt 1800) ·
DRAFT WO liczy materiały jako popyt, ale **nie output jako podaż** → sugeruje zdublowanie
własnego zlecenia.
**Jakość:** PASS inspekcji LP zostawia `status='received'` → towar zatwierdzony przez QA
**niewidoczny** w `v_inventory_available` · hold WO z dyspozycją scrap/rework/partial zamraża
`wo_outputs` w ON_HOLD **na zawsze** · decyzja „hold" dla GRN/`wo_output` nic nie wstrzymuje
i jest **terminalna** · cold-chain **fail-open** (`requires_check=false` gasi ocenę wykonanego
pomiaru) · KPI pass-rate zaniżany przez zaległe inspekcje.

---

# STAN NA 09:47
**7 commitów dziś · 37 defektów znalezionych · 17 naprawionych i ZWERYFIKOWANYCH uruchomieniem**

## Tory w locie
| tor | co | zasób |
|---|---|---|
| G1 | site-scope: konsumpcja ignoruje zakład · fail-open `user_can_see_site` · 3 tabele bez polityki | `t1` |
| G2 | ledger wysyłki (brak `stock_moves`/`lp_state_history`) · alokacja bez filtra UoM | `t2` |
| H1 | **bezpieczeństwo żywności**: partial=całość · hold zamraża outputy · „hold" terminalny | `t3` |
| Opus-picker | **P0-1** przycinanie dropdownów (7 wystąpień, wspólny prymityw) | przeglądarka + `monopilot` |

## Kolejka (gdy zwolni się klon)
1. **MRP** — podwójne odjęcie alokacji + prognoza niekonsumowana + DRAFT WO
2. **Scheduler** — macierz alergenowa · okno jako czas biegu · `routing_duration` 2×
3. **P0-4/P0-5** — most receptura→BOM + martwa bramka Handoff
4. **P0-2/P0-3** — cena 0 w linii SO · „Confirm" nie opuszcza `draft`
5. Fixture: `warehouses_site_id_fkey` — **12 plików** wstawia magazyny, defekt ujawnia się
   tylko z prawdziwą bazą (nie było go w baseline, bo tamten przebieg szedł bez `DATABASE_URL`)

---

# STAN NA 19:00
**56 commitów, WSZYSTKIE LOKALNE** — `git push` blokuje klasyfikator, musi puścić owner:
`! git push origin main`. Ryzyko przy pushu: Vercel migruje w buildzie; jeśli prod ma wiersze
bez zakładu, **mig 551 odmówi i deploy stanie** (awaria bezpieczna, nie utrata danych).
Sprawdzone dwoma sposobami lokalnie: 512 migracji na czystej bazie rc=0 ORAZ 550+551
w transakcji na bazie ZAWIERAJĄCEJ problematyczny wiersz → `remaining_null=0`.

## Silniki
**Codex wyczerpał limit ~16:20** („try again at Aug 5th"). Od tego czasu wszystkie tory
na Opusie; od 19:00 trzy tory na **Fable**. Lekcja o rutingu: montowanie ekranów to praca UI
i od początku należało do Opusa, nie do Codexa — mój błąd, nie awaria silnika.

## Tory w locie (ostatnie zlecenie 19:45)
| tor | co | silnik |
|---|---|---|
| NPD-gate | modal miękkiej bramki pokazuje JEDNOCZEŚNIE „gotowy" i „niekompletny"; `readiness` pomija warunek, który stosuje `advance` → pierwsze kliknięcie zawsze w próżnię | Opus |
| i18n-buildery | buildery pętlowe: jedna edycja zdejmuje kilkanaście pozycji długu naraz | Opus |
| anty-testy | testy przechodzące przy ZEPSUTYM kodzie — dowód przez mutację, nie lekturę | Fable |
| site-visibility | czy dane wyciekają MIĘDZY ZAKŁADAMI (13 tabel poza predykatem) | Fable |
| pieniądze | zaokrąglenia i waluty: kwota poprawna „prawie" | Fable |

## Domknięte po 18:15
- `dd944867` E2E ekranów etapów NPD: **6 etapów przeklikane**, kontrola przeciwna zdana.
  Łańcuch urywa się na `pilot`→`approval` = ZAPROJEKTOWANA bramka e-podpisu, nie defekt.
- `c4204f67` i18n: zgłoszenie mówiło 39 przecieków, **detektor znalazł 261 w ~90 plikach**
  (6× niedoszacowanie — dlatego ta klasa wracała 3 razy). Zamknięta ZAPADKĄ w obie strony,
  236 pozycji w jawnej liście długu, która może tylko maleć.
- `ebb15250` pulpit sumował SZTUKI z KILOGRAMAMI 1:1. 7 konsumentów, **każdy rozstrzygnięty
  osobno**. OEE filtruje do jednostki WŁASNEJ zlecenia, nie do literalnego 'kg' — filtr na kg
  dałby jakość 0% dla zlecenia w sztukach = ten sam błąd „0% zamiast braku danych".

## GOTCHA dnia (dopisane do tabeli kłamiących narzędzi)
Sprawdzałem zapadkę i18n usuwając linię z baseline — test przeszedł. **Trafiłem w pustą linię.**
Gdybym na tym poprzestał, zaraportowałbym „zapadka nie działa". Po usunięciu RZECZYWISTEGO
wpisu test padł z nazwą pliku i klucza. **Liczy się nie to, że kontrola przeszła — tylko w co
trafiła.** Kontrola negatywna sama wymaga kontroli.
