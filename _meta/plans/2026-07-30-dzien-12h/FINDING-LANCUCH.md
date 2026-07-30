# FINDING-ŁAŃCUCH — logika głównej ścieżki biznesowej

Tor: łańcuch NPD → technical → planning → produkcja → magazyn → wysyłka → finanse.
Baza dowodowa: `monopilot_t2` (drugi przydział; wcześniejsze odczyty z `t1` powtórzone na `t2`).
Stan drzewa: `a4793ff5` (HEAD w chwili audytu). Nic nie naprawiano, nic nie commitowano.
Fixture'y dowodowe wyłącznie w transakcjach z ROLLBACK.

**Nie powtarzam** znalezisk z `FAZA-1-WERDYKTY.md` / `DEFEKTY-DO-DECYZJI.md` (PRD-008, WH-125,
SFQ-072/075, NSA-067, netting WAC po anulowaniu, `revalidatePath` no-op itd.) — odwołuję się
do nich tylko tam, gdzie nowe znalezisko z nimi graniczy.

## Tabela znalezisk

| # | kategoria | co jest złe | plik:linia | dowód | gdzie łańcuch się rwie | pewność |
|---|---|---|---|---|---|---|
| 1 | **BLOKER** (deadlock pary guardów) | Zakończone (COMPLETED) WO z żywym output LP nie ma ŻADNEJ drogi korekty: anulowanie WO odpowiada *„Registered output license plates are still live — **void each output** before cancelling"*, a `voidWoOutput` na completed zwraca `invalid_state` (guard PF-R15-01 odpala się PRZED wszystkimi innymi kontrolami). Przejścia `reopen` nie ma (`completed: {close, cancel}`). Błędnie zarejestrowany output i jego wkład do WAC są zamrożone na zawsze. | `apps/web/lib/corrections/correct-ledger-entry.ts:76-79` (guard)<br>`apps/web/app/[locale]/(app)/(modules)/production/_actions/corrections-actions.ts:954-956` (użycie, przed e-sign/LP-checkami)<br>`apps/web/lib/production/complete-cancel-wo.ts:483-486` (komunikat każący zrobić void)<br>`apps/web/lib/production/wo-state-machine.ts:50-52` (brak reopen) | Uruchomienie suity na `t2`: 27 PASS / **13 FAIL**; 12 z 13 pada w `voidWoOutput` z `invalid_state`, w tym testy negatywne oczekujące `lp_not_voidable`/`esign_failed` (guard je uprzedza). Git: guard + 3 nowe testy odrzucenia weszły w `ce072fdf` (Fala 10, PF-R15-01); domyślny fixture `woStatus: 'completed'` (test:419) z kontraktu frameworku korekt `6183b69c` nie został zmigrowany. | **produkcja → finanse** (ścieżka korekty outputu i odwrócenia WAC po zakończeniu WO) | wysoka — uruchomione + git |
| 1a | **ROZJAZD** (asymetria rodzeństwa, część #1) | Na tym samym COMPLETED WO **wolno** odwrócić konsumpcję (`reverseConsumption`, z kredytem WAC komponentu) i **wolno** unieważnić waste — tylko output jest zablokowany. Strona wejściowa zakończonego WO jest korygowalna, wyjściowa nie; bilans masy i wycena po zakończeniu są modyfikowalne jednostronnie. | `corrections-actions.ts` — `reverseConsumption`/`voidWasteEntry` nie mają guardu terminalnego (tylko tier `production.corrections.closed_wo` dla `closed`) | Ta sama suita: happy-path `reverseConsumption` i `voidWasteEntry` **przechodzą** na domyślnym fixture `completed`; `voidWoOutput` pada. | **produkcja → finanse** (spójność polityki korekt) | wysoka — uruchomione |
| 2 | **ROZJAZD** (site-scope, dowód uruchomieniowy) | Desktopowa konsumpcja materiału NIE filtruje zakładu: ani FEFO, ani ścieżka jawnego LP nie porównują `lp.site_id` z `wo.site_id` (żadnego predykatu site w zapytaniu). WO w zakładzie A automatycznie konsumuje najwcześniej przeterminowujący się LP z zakładu B — zapas przepływa między zakładami bez transfer orderu, a `stock_moves`/historia dostają site **LP**, nie WO. Kontrast-sibling: `registerOutput` dla supplied LP wymusza `lp.site_id = wo.site_id` (`register-output.ts:534-547`), scanner-consume ma przynajmniej podłogę `app.user_can_see_site`. RLS na `license_plates` chroni tylko widoczność USER↔site, nie zgodność WO↔site (użytkownik bez przypisań site'ów = unrestricted — „every user today" wg komentarza w `app.user_can_see_site`). | `apps/web/lib/production/consume-material-core.ts:92-124` (FEFO bez site), `:234-247` (explicit bez site)<br>caller: `production/_actions/consume-material-actions.ts:663-668` (przekazuje tylko productIds/uom/qty) | **Probe na `t2` (BEGIN…ROLLBACK):** 2 LP Demo Flour — `LP-PROBE-SAME` (site WO, expiry +30d) i `LP-PROBE-OTHER` (drugi site, expiry +5d); dosłowne zapytanie FEFO z kodu wybrało `LP-PROBE-OTHER`, `same_site_as_wo = f`. | **magazyn → produkcja** (konsumpcja przy WO wielozakładowym) | wysoka — dowód uruchomieniowy na SQL z kodu |
| 3 | **ROZJAZD** (UoM na granicy magazyn→wysyłka) | Alokacja SO nie filtruje kandydatów po `lp.uom`: potrzebna ilość jest przeliczana do „canonical inventory grain" itemu (`resolveOrderQtyToInventoryQty`), po czym porównywana z `lp.quantity - lp.reserved_qty` **niezależnie od jednostki LP**. Przy mieszanych grainach zapasu (realne: output LP powstaje w `wo.uom`, np. `each`, GRN w uom dostawy) 100 szt. „zaspokaja" zapotrzebowanie 100 kg 1:1. Sibling-dowód, że filtr jest standardem: konsumpcja produkcyjna filtruje `cand.uom = $2` (`consume-material-core.ts:103`), genealogia rzuca `uom_mismatch`, a `debitWac` przy wysyłce konwertuje per-uom — tylko alokacja sumuje na ślepo. | `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts:1315-1352` (kandydaci bez `lp.uom`)<br>kontrakt grain: `apps/web/lib/shipping/order-line-uom.ts:41-49` | Analiza kodu + kontrast z trzema sąsiadami, którzy jednostkę egzekwują. Bez uruchomienia (wymaga fixture mieszanych grainów). | **magazyn → wysyłka** (alokacja/rezerwacja/pick liczą różne jednostki jak jedną) | średnio-wysoka — kod, bez uruchomienia |
| 4 | **ROZJAZD** (ledger ruchów nie widzi wysyłki) | `shipShipment` dekrementuje `license_plates.quantity`, obciąża WAC i flipuje status na `shipped`, ale **nie pisze żadnego `stock_moves`** (typ `'issue'` z CHECK-a migracji 193 pisze wyłącznie scanner przy stagingu do produkcji) ani `lp_state_history` (0 wystąpień w pliku). Każdy inny przepływ ilościowy (output, konsumpcja, korekty, split/merge, TO, counts) pisze ruch. Historia ruchów magazynu kończy się w momencie, gdy towar opuszcza budynek — najcięższy ubytek śladu w całym łańcuchu. | `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts:462-508` (dekrement bez ruchu)<br>jedyny pisarz `'issue'`: `apps/web/lib/warehouse/scanner/movement.ts:584-596` | Grep pisarzy `insert into public.stock_moves` (14 plików, zero w shipping) + grep `'issue'` (1 plik, scanner) + `lp_state_history` w ship-actions = 0. Deklaracja kontraktu ledgera: `stock-move-actions.ts:42` („putaway / transfer / issue / adjustment"). | **magazyn → wysyłka** (trwały ślad rozchodu) | wysoka co do faktów; średnia co do rangi (kontrakt ledgera vs `shipments.ext_data`) |
| 5 | **NIEDZIAŁAJĄCA FUNKCJA** (obiecana architektura zdarzeń) | Worker outboxu ma dokładnie **jednego** konsumenta: `dispatchCascade`, który no-opuje wszystko poza `manufacturing_operation*`/`*cascade*`/`fg.intermediate_code_changed`. Konsumenci deklarowani w enumie zdarzeń — „schedule.published → WO commits (08)", „SO confirm → AR (10-finance)", „12-reporting MV refresh", consume-gate po `quality.hold.*` — **nie istnieją jako subskrybenci**; cała reszta wokabularza (~180 typów) jest stemplowana `consumed_at` bez żadnego efektu. Łańcuch działa dziś wyłącznie na synchronicznych odczytach tabel; po naprawie cronów (`739f9223`) nie zmaterializuje się nic poza kaskadą alergenów. Jedyni realni czytelnicy poza workerem: `factory-release-status` + `list-fa-history` (czytają tabelę wprost). | `apps/web/app/api/internal/cron/outbox/route.ts:` (LocalDispatchQueue z 1 handlerem)<br>`packages/rule-engine/src/dispatch.ts:16-24,74-76` (no-op dla nie-cascade)<br>`packages/outbox/src/events.enum.ts` (komentarze-obietnice konsumentów) | Odczyt kodu + grep czytelników `from public.outbox_events` (5 plików, żaden nie jest subskrybentem lifecycle'u). Kontekst: to also wyjaśnia, czemu duplikat z PRD-008 jest dziś bezobjawowy. | **wszystkie przejścia oparte na zdarzeniach** (planowanie→produkcja commit, wysyłka→finanse AR, raportowanie) | wysoka |
| 6 | **NIEDZIAŁAJĄCA FUNKCJA** (stale test, 13. czerwony) | Asercja WAC-kredytu przy odwróceniu konsumpcji oczekuje 5 parametrów `insert into item_wac_state`, a `upsertWac` binduje ich 7 (doszły `site_id` i `currency_id`). Sam kredyt WAC wykonuje się (`ok:true`) — czerwony jest wyłącznie kształt parametrów. To NIE jest część deadlocku #1. | `corrections-actions.test.ts:532` vs `apps/web/lib/finance/upsert-wac.ts:179-208` | Uruchomienie suity: `expected [ …(7) ] to deeply equal [ …(5) ]`. | nigdzie (dług testowy przy module finansowym) | wysoka — uruchomione |
| 7 | **ROZJAZD** (sibling w registerOutput) | Dla supplied LP magazynem docelowym jest default site'u sesji (`resolveWarehouseForSessionSite`), a dla LP tworzonego przez system — skonfigurowany output linii (`resolveLineOutputTarget`) z fallbackiem. Przy skonfigurowanym magazynie wyjściowym linii ≠ default, poprawny supplied LP w magazynie linii zostanie odrzucony: „Supplied license plate warehouse does not match the work order output destination". | `apps/web/lib/production/output/register-output.ts:950-966` (supplied → session default) vs `:749` (created → line target) | Analiza kodu; obie gałęzie w jednej funkcji. | **produkcja → magazyn** (rejestracja outputu na istniejący nośnik) | średnia — kod, bez uruchomienia |
| 8 | **OBSERWACJA** (nazewnictwo, nie defekt) | Cały tor kosztowy NPD trzyma wartości w kolumnach `*_eur` (`target_retail_price_eur`, `value_eur`, `raw_cost_eur`), ale semantyka jest GBP end-to-end: label briefu = „Target retail price (GBP)", `item_cost_history` przy promote dostaje `'GBP'`, `list_price_gbp` = wprost `target_retail_price_eur`. Wartości są spójne; mylą wyłącznie nazwy kolumn i pojedyncze komentarze („€15.17" w `waterfall-bar.tsx:28`). Odnotowane, żeby następny audytor nie zgłosił tego jako rozjazdu walut. | `release-npd-project-to-factory.ts:217-226,285-291`; `brief/page.tsx:78` | Porównanie label ↔ kolumna ↔ konsumenci `list_price_gbp` (wszyscy komentują „GBP-denominated"). | nigdzie (ryzyko przyszłej pomyłki dewelopera) | wysoka |

Pomniejsze, jednozdaniowe: alokacja SO filtruje site tylko gdy linia SO **ma** site (`so-actions.ts:1328` — `$2 is null or lp.site_id = $2`); SO bez site alokuje cross-site — to łagodniejszy krewny #2.

## Odpowiedź na pytanie koordynatora: DLACZEGO guard `invalid_state` blokuje ścieżkę, którą testy uznają za legalną

Sekwencja (git):

1. **`6183b69c`** (framework korekt, W11-R2) ustanowił kontrakt: *void outputu na COMPLETED WO
   z nietkniętym LP (`received`/`pending`, 0 rezerwacji, bez konsumpcji/dzieci) jest legalny* —
   to jest domyślny fixture całej suity (`corrections-actions.test.ts:419`, `woStatus: 'completed'`).
   Sens biznesowy: pomyłkę wpisu wykrywa się zwykle PO zakończeniu zlecenia.
2. **`ce072fdf`** (Fala 10, PF-R15-01 „zakończone WO nie gubi podpisanego wyjścia") dołożył
   `isTerminalOutputVoidForbiddenStatus` jako PIERWSZĄ kontrolę `voidWoOutput` — odrzuca
   `completed` i `closed` zanim wykonają się kontrole LP, e-sign i uprawnień (dlatego czerwone są
   nawet testy negatywne oczekujące `lp_not_voidable`/`esign_failed`). Tor zaktualizował suitę
   tylko punktowo (dodał 3 testy odrzucenia), **nie migrując 12 testów starego kontraktu** —
   klasyczne 5.1 z WZORCÓW (tor pisze testy, których nie uruchamia).
3. Komentarz guardu odsyła do „full reopen/compensation workflow" — **który nie istnieje**:
   maszyna stanów nie ma `reopen` (propozycja reopen z tej samej fali została słusznie wycofana,
   patrz WZORCE 5.3), a bramka anulowania (`complete-cancel-wo.ts:483-486`) każe *najpierw
   zrobić void*, czyli dokładnie to, co guard zabrania. Dwa guardy — każdy broniący swojego
   przypadku — łącznie zamrażają KAŻDĄ legalną ścieżkę wyjścia. To wzorzec 1.1 („guard chroniący
   jeden przypadek zamraża sąsiedni") w wariancie międzyguardowym.
4. Guard chroni przed real­nym ryzykiem (utrata podpisanego, żywego wyjścia), ale strzela za
   szeroko: blokuje też przypadek, dla którego framework korekt powstał (LP nietknięty,
   storno + e-sign + pełny audyt). Równocześnie `reverseConsumption` i `voidWasteEntry` na tym
   samym COMPLETED WO działają — więc „ochrona zakończonego WO" jest dziurawa od strony wejścia,
   a szczelna tylko od strony wyjścia.

**Werdykt:** to nie jest „czerwone testy do podbicia" ani „zły guard do skasowania" — to
nierozstrzygnięty spór o kontrakt (ta sama klasa co `TEC-049` / `E2E-054-10`), tyle że z twardym
skutkiem ubocznym: deadlock korekty na COMPLETED WO. Decyzja produktowa musi wybrać:
(a) void dozwolony przy nietkniętym LP (przywraca kontrakt frameworku, 12 testów zielenieje,
deadlock znika), albo (b) fail-closed zostaje — wtedy trzeba dostarczyć obiecany workflow
kompensacji, naprawić komunikat bramki anulowania (obiecuje niemożliwe) i przepisać 12 testów.
Rozstrzygnięcie powinno zapaść RAZEM z decyzją o `E2E-054-10` (completed→cancelled) i nettingiem
WAC — to jeden węzeł polityki.

## Mapa przepływu — gdzie kończy się etap, a zaczyna następny

```
NPD ──(releaseNpdProjectToFactory: items + bom_headers[active] + factory_specs[released] + outbox)──▶ TECHNICAL
  stan przejścia: BOM 'active', spec 'released_to_factory', cost→item_cost_history(GBP)   [DZIAŁA]

TECHNICAL ──(dane referencyjne)──▶ PLANNING
  releaseWorkOrder: wymaga bom_headers.status='active' + factory_spec approved/released
  (z self-healing coalesce); intermediates zwolnione z factory spec                        [DZIAŁA]

PLANNING ──(WO RELEASED → start-wo → wo_executions)──▶ PRODUKCJA
  znane: PRD-008 (duplikat wo.started przy replayu); scheduler commit przez outbox NIE istnieje (#5)

PRODUKCJA ──(konsumpcja: wo_material_consumption + LP dec)──▶ ◀──(magazyn)
  ★ NAJSŁABSZE #2: brak WO↔site w konsumpcji (dowód uruchomieniowy)
  ★ #1/#1a: korekta po COMPLETED = deadlock (output) / jednostronna (konsumpcja)

PRODUKCJA ──(registerOutput: wo_outputs + LP received/pending + stock_move receipt + WAC)──▶ MAGAZYN
  QA release: received/pending → available/released (transition-output-qa)                 [DZIAŁA]
  #7: supplied-LP vs line-output-target (sibling)

MAGAZYN ──(alokacja SO: inventory_allocations + reserved_qty)──▶ WYSYŁKA
  reserved_qty podnoszone i respektowane przez konsumpcję                                  [DZIAŁA]
  ★ #3: kandydaci alokacji bez filtra lp.uom (mieszane grainy sumowane 1:1)
  pick: wymaga qa_status='released' (LP z produkcji po QA release przechodzi)              [DZIAŁA]

WYSYŁKA ──(shipShipment: LP dec + status shipped + debitWac + outbox)──▶ FINANSE
  ★ #4: zero stock_moves/lp_state_history przy wyjściu towaru (ledger ślepnie)
  AR/faktura z shipping.so.confirmed: konsument NIE istnieje (#5)

FINANSE: WAC in (output/receipt) / WAC out (ship, konwersja per-uom) — spójne,
  ALE korekta wkładu outputu po COMPLETED zamrożona (#1); netting po anulowaniu znany (poza zakresem)
```

**Trzy najsłabsze przejścia:** (1) produkcja→finanse po COMPLETED (deadlock korekt, #1),
(2) magazyn→produkcja w multi-site (konsumpcja bez site, #2, jedyny dowód uruchomieniowy
cross-site w tym audycie), (3) magazyn→wysyłka (alokacja bez UoM #3 + ślepy ledger #4).

## Metryka

- Uruchomieniowo potwierdzone: #1, #1a, #6 (suita 27/13 na t2), #2 (SQL probe BEGIN/ROLLBACK na t2).
- Z kodu, bez uruchomienia: #3, #4 (fakty grep-potwierdzone), #5, #7, #8.
- Nic nie naprawiano; żadne fixture'y nie zostały w bazie (wszystko w ROLLBACK).
