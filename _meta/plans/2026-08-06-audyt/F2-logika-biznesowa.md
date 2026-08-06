# F2 — Jak sprawdzać logikę biznesową taniej

Badanie, nie naprawa. Nic w drzewie nie zostało zmienione.
Źródła: kod repo (stan 2026-08-06), `_meta/plans/2026-08-05-noc/*`, historia gita, dokumentacja
Postgresa i npm.

---

## Sześć niezmienników — etykiety używane dalej

| | niezmiennik | jak został złamany |
|---|---|---|
| **I1** | ilość jest zachowana | brak wiersza księgi (P0.3, P0.7, P0.10) i **odwrócony znak** (P0.8) — 50/100/200 kg |
| **I2** | koszt w jednostce bazowej | 200 g @ 5/kg → 1000 zamiast 1,00 |
| **I3** | bramka odmawia przy awarii | trzy bramki łapały `42P01` i mówiły „brak blokady" |
| **I4** | świadectwo mówi prawdę | `validation_result='passed'` obok `atp_evidence='FAIL'` w TYM SAMYM wierszu |
| **I5** | izolacja organizacji | trzyma się, ale 14 testów dowodzących nie uruchamia się |
| **I6** | dane bez zakładu nie istnieją | 37 wierszy z `site_id IS NULL`, migracja 551 odmawia |

---

## Najważniejsza liczba tego raportu

```
pliki *.pg.test.ts w repo                                  43
z nich cicho pomijanych bez DATABASE_URL (describe.skip)   42
z nich rzucających, gdy bazy brak                           2
```

**Jedyny w repo wzór na „sumę z księgi" leży w jednym z tych 42 plików.**
`LEDGER_RECONCILIATION_SQL` — `apps/web/lib/production/__tests__/stock-moves-production-ledger.pg.test.ts:499-515`,
skopiowany drugi raz do `apps/web/app/[locale]/(app)/(modules)/shipping/_actions/__tests__/wave8-shipping-integrity.pg.test.ts`.

To zmienia postać całego zadania. Pytanie nie brzmi „jakiej techniki brakuje" — brzmi
**„dlaczego techniki, które już są, nie mierzą"**. Repo ma dojrzałą kulturę testów
kontraktowych czytających źródło (5 plików + analizator AST), ma sondy na żywej bazie,
ma jeden wzór uzgadniania. Wszystko to jest wyłączone albo schowane.

Dlatego ranking niżej zaczyna się od rzeczy, które **nic nie dodają**, tylko odblokowują
to, co jest.

---

## Ranking — ile ręcznej pracy zdejmuje

| # | propozycja | łapie | przed wdrożeniem? | wdrożenie | utrzymanie | polecam |
|---|---|---|---|---|---|---|
| 1 | Uzgadnianie: jeden wzór, moduł, trzech konsumentów | **I1** (obie klasy) | tak (test) + po (cron) | **~4 h** | **niskie** | **TAK** |
| 2 | Bramka anty-pominięciowa | **I5**, pośrednio I1 I2 I4 | tak | **~3 h** | zerowe | **TAK** |
| 3 | Wyzwalacz odroczony LP ↔ księga | **I1** (brak wiersza) | tak | **~1 dzień** | niskie | **TAK, etapami** |
| 4 | `CHECK … NOT VALID` na `site_id` | **I6** | tak | **~1 h** | zerowe | **TAK** |
| 5 | Testy kontraktowe czytające źródło (4 przypadki) | **I3, I2, I1** | tak | ~2 dni | średnie | **TAK** |
| 6 | `CHECK` zakazujący sprzecznego świadectwa | **I4** | tak | ~30 min | niskie | **TAK, wąsko** |
| 7 | FK `uom` → `unit_of_measure` | klasa obok I2 | tak | ~2 h | zerowe | **TAK** |
| 8 | PBT modelowe (`fc.asyncModelRun`) na żywej bazie | I1 | tak | ~3 dni | **wysokie** | **ODŁOŻYĆ** |

Sekcja „czego NIE polecam" na końcu — tam trafiły: PBT na czystych funkcjach, TLA+/Alloy,
pgTAP, snapshot schematu jako nowa inwestycja, biblioteka do liczb.

---

# 1. Uzgadnianie — jeden wzór, jeden moduł, trzech konsumentów

**To jest pozycja o najlepszym stosunku zysku do kosztu w całym raporcie.**

## Stan faktyczny — sprostowanie do zlecenia

Zlecenie mówi: *„dziś nie ma w repo kanonicznego wzoru na sumę z księgi; agent musiał
napisać go od zera"*. To jest **prawie** prawda i różnica jest istotna. Wzór **jest**:

```sql
-- apps/web/lib/production/__tests__/stock-moves-production-ledger.pg.test.ts:499-515
coalesce((
  select sum(case
               when sm.move_type = 'receipt'                          then  sm.quantity
               when sm.move_type in ('issue','consume_to_wo','return') then -sm.quantity
               when sm.move_type = 'adjustment'                       then  sm.quantity
               else 0
             end)
    from public.stock_moves sm
   where sm.org_id = lp.org_id and sm.lp_id = lp.id
), 0)::text as ledger_sum
```

`putaway` / `transfer` / `quarantine` / `split` / `merge` celowo dają 0 — przenoszą towar,
nie tworzą go ani nie niszczą.

Problem nie polega na tym, że wzoru nie ma. Polega na tym, że jest **`const`-em wewnątrz
pliku testowego**, ma **drugą kopię** w `wave8-shipping-integrity.pg.test.ts`, i **obie kopie
cicho pomijają się bez `DATABASE_URL`**. Każdy, kto będzie uzgadniał, faktycznie napisze
swój — bo tego nie da się zaimportować.

**Jedna zaobserwowana dziura w samym wzorze:** brak filtra `sm.status = 'completed'`, mimo że
`stock_moves_status_check` dopuszcza `'cancelled'`. Dziś nic nie pisze `'cancelled'`, więc to
utajone, nie żywe — ale przy przenoszeniu wzoru do modułu należy to domknąć świadomie.

## Co zrobić

Trzy kroki, żaden nie wymaga nowej techniki:

**(a) Wyciągnąć wzór do modułu.** `apps/web/lib/warehouse/ledger-reconciliation.ts` — jedna
stała SQL + jedna funkcja `readLedgerDrift(client, { orgId, lpId? })` zwracająca wiersze
`{ lp_id, lp_quantity, ledger_sum, drift }`. Oba istniejące testy importują zamiast kopiować.

**(b) Jedna asercja współdzielona.** `expectLedgerBalanced(client, orgId)` — wołana na końcu
**każdego** `.pg.test.ts`, który dotyka zapasu. To jest ten sam ruch, który zrobiła sonda
z nocy (`_meta/plans/2026-08-05-noc/probes/`), tylko trwały. Koszt dopisania jednej linijki
do istniejącego testu jest zerowy, a wyłapuje klasę „operacja przeszła, ale księga została
w tyle" **przy każdym przyszłym teście, którego nikt specjalnie nie napisze pod to**.

**(c) Cron.** Repo ma gotowy szablon: `apps/web/app/api/internal/cron/catch-weight-variance/route.ts`
robi dokładnie to, co potrzebne — fan-out po organizacjach na puli aktora systemowego,
`app.set_org_context` per organizacja, autoryzacja `x-vercel-cron` / `CRON_SECRET`
fail-closed na produkcji, emisja zdarzenia outboxu przy przekroczeniu progu. Nowa trasa
`/api/internal/cron/ledger-drift` to kopia z podmienionym zapytaniem. Wpis w `scripts/cron.json`.

Indeks już jest: `stock_moves_lp_idx on (org_id, lp_id, move_date)` — migracja 193:329.

## Bilans

| | |
|---|---|
| **co złapie** | **I1, obie klasy.** Brak wiersza (P0.3 anulowanie WO, P0.7 unieważnienie odpadu, P0.10 anulowanie wysyłki, P0.2 demontaż, P0.4 replacement) **oraz odwrócony znak** (P0.8) — bo suma nie zgadza się w obu przypadkach. |
| **przed czy po?** | **Obie.** Jako asercja w teście — **przed wdrożeniem**. Jako cron — po, i to jest jedyne narzędzie na **dane historyczne** (pozycja D1 z biblii: trzy naprawy naprawiły pisarza, nie księgę). |
| **koszt wdrożenia** | ~4 h. Wzór istnieje, szablon crona istnieje, indeks istnieje. To przenosiny, nie budowa. |
| **koszt utrzymania** | Niski, ale **niezerowy**: dodanie nowego `move_type` wymaga decyzji, po której stronie równania stoi. Dziś ta decyzja i tak musi zapaść — tylko w trzech miejscach naraz i nikt tego nie pilnuje. |
| **polecam** | **TAK — pozycja nr 1.** |

**Uczciwe zastrzeżenie:** włączenie tego dziś zapali się natychmiast, i to szeroko. Ścieżka
`receive-po-line-core.ts` w ogóle nie pisze kanonicznego `receipt` (P0.9), więc **każda paleta
z przyjęcia PO** pokaże `ledger_sum = 0` przy niezerowej ilości. To nie jest wada narzędzia —
to jest pierwszy wynik pomiaru. Ale trzeba to zaplanować jako raport, nie jako czerwony build:
cron pisze do tabeli `ledger_discrepancies` i alarmuje **przy wzroście**, nie przy stanie.

---

# 2. Bramka anty-pominięciowa — „test nie może zameldować zielono bez bazy"

## Co jest zepsute

Cztery niezależne mechanizmy „zieleni przez pominięcie", wszystkie zmierzone tej nocy:

1. **42 z 43 plików `.pg.test.ts`** ma `const run = databaseUrl ? describe : describe.skip`.
   Bez `DATABASE_URL` melduje sukces przy zerze wykonanych asercji.
2. **`vitest` raportuje awarię `beforeAll` jako `skipped`, nie `failed`** — 39 plików
   „pominiętych", które naprawdę padały na dryfie schematu (`users.role_id NOT NULL` itd.).
3. **`apps/web` skrypt `test` spina dwie suity operatorem `&&`** — czerwona suita node
   powoduje, że **3583 testy UI nie startują**. Odnotowane wprost w `CLAUDE.md`, i mimo to
   działa tak w CI.
4. **Playwright: `e2e/**/*.spec.ts` bez `globstar`** rozwija się do `e2e/*/*.spec.ts` —
   **11 plików z 381 testów**, i wszystkie 11 pomijane przez zły `baseURL`.

Skutek dla I5 jest dosłowny: izolacja organizacji **działa** (pomiar: 279 tabel z `org_id`,
279 z RLS, 0 wycieków na żywej próbie) — ale **14 testów, które miały to udowadniać, nie
uruchamia się, i padłyby nawet w CI z Dockerem**, bo suita za flagą `RLS_LIVE_TESTS` używa
`new Function('specifier','return import(specifier)')`, co nie działa pod module runnerem vitesta.

Do tego dwa dodatkowe mechanizmy, które unieważniają konkretnie I5 — oba zweryfikowane
bezpośrednio, nie z raportu:

5. **Suita izolacji stoi za flagą, której nikt nigdy nie ustawił.**
   `packages/db/__tests__/rls-public-exposure-remediation.test.ts:20-25` i
   `516-npd-sensory-project-integrity.test.ts:63` — obie zaczynają się od
   `hasPostgresTestcontainer && process.env.RLS_LIVE_TESTS === '1' ? describe : describe.skip`,
   z komentarzem *„opt-in via RLS_LIVE_TESTS=1 (set in Docker-enabled CI)"*.
   **`rg RLS_LIVE_TESTS .github/workflows/` → zero trafień.** Komentarz jest nieprawdziwy;
   flaga nie jest ustawiona nigdzie. To jest te 14 testów (5 + 5 przypadków, jeden przez
   `it.each` po 3 tabelach).
6. **A gdyby flagę ustawić — i tak by padły.** Oba pliki ładują testcontainers przez
   `new Function('specifier','return import(specifier)')`, co nie rozwiązuje się pod module
   runnerem vitesta. Awaria w `beforeAll` + punkt 2 wyżej = **„skipped", nie „failed"**.
   Suita jest martwa **strukturalnie**, nie konfiguracyjnie.

## Co zrobić

**(a) Odwrócić domyślną postawę w `.pg.test.ts`.** Zamiast `describe.skip` — rzucać.
Wzorzec już jest w repo, wprowadzony tej nocy w `changeover-atp-verdict.pg.test.ts`:
plik rzuca przy braku `DATABASE_URL` zamiast się pominąć. Trzeba to zrobić w pozostałych 41.
Środowiska bez bazy (jeśli takie zostaną) wykluczają te pliki **jawnie, w konfiguracji** —
czyli decyzja jest widoczna w gicie, a nie ukryta w ternary.

**(b) Test kontraktowy „spis kolekcji".** Czyta wszystkie `*.test.ts(x)` z dysku, czyta
`include`/`exclude` ze wszystkich konfiguracji vitesta i playwrighta, i pada, gdy jakiś plik
nie należy do dokładnie jednej konfiguracji. To jest **dokładnie ten wzorzec, o który pytasz
w punkcie 4** — tani, skuteczny, niemożliwy do obejścia przez zapomnienie.

Potwierdzone: **taka bramka w repo nie istnieje.** Żaden test nie czyta `.github/workflows`,
żaden nie wylicza `*.test.ts` z dysku i nie porównuje z `include`. Najbliższy kształt do
skopiowania to `scripts/lint-drift-fixtures.test.mjs` (sprawdza, że każdy pakiet ma
`eslint.config.mjs`).

**(c) Rozdzielić `&&` na dwa kroki CI.** Jednoliniowa zmiana w `package.json` + w `ci.yml`.

**(d) Trzy poprawki w jednej linijce CI playwrighta**, wszystkie zweryfikowane:
`PLAYWRIGHT_BASE_URL: http://127.0.0.1:3000` (serwer stoi na 3000, domyślny `baseURL`
konfiguracji to 3100 — `playwright.config.ts:15`), `--config=../../playwright.config.ts`
(`apps/web` nie ma własnej konfiguracji, więc root nie jest ładowany w ogóle),
i **cudzysłów wokół globu** (`e2e/**/*.spec.ts` bez `globstar` zwija się do `e2e/*/*.spec.ts`
= 11 plików z 381 testów). Wśród niewykonywanych: `scanner-rbac-org-scoping.spec.ts`
i `scanner-isolation.spec.ts` — czyli znowu I5.

## Bilans

| | |
|---|---|
| **co złapie** | **I5 bezpośrednio** — 14 martwych testów izolacji zapala się na czerwono. Pośrednio: **I1** (obie kopie wzoru uzgadniania leżą w plikach `.pg.test.ts`), **I2** (`recipe-cost-uom.pg.test.ts` — jedyny dowód naprawy błędu tysiąckrotnego, też pomijany), **I4** (test świadectwa). |
| **przed czy po?** | **Przed.** To jest bramka na PR. |
| **koszt wdrożenia** | ~3 h: 41 plików × jedna zmieniona linia (mechaniczne) + ~60 linii testu spisu + 2 linie w CI. |
| **koszt utrzymania** | **Zerowe.** Test spisu utrzymuje się sam — nowy plik testowy albo należy do konfiguracji, albo test pada. |
| **polecam** | **TAK.** Nie dlatego, że sam coś łapie, tylko dlatego, że **mnoży wartość każdej innej pozycji w tym raporcie przez różną od zera**. Bez tego wszystkie propozycje niżej mogą wylądować w pliku, który się nie uruchamia. |

**Zastrzeżenie:** to zapali się szeroko na starcie (39 plików padających w `beforeAll`).
Sam raport z nocy odzyskał 35 suit i zmierzył 33 czerwone testy = 33 defekty, które przez
ten czas nie istniały dla nikogo. Trzeba się na to przygotować budżetem, nie zaskoczeniem.

---

# 3. Wyzwalacz odroczony: zmiana ilości palety ⇒ ruch w tej samej transakcji

## Dlaczego to jest właściwe miejsce

Zlecenie pyta, które niezmienniki dałoby się przenieść do bazy. **I1 to najlepszy kandydat
w całym zestawie**, i to nie dlatego, że jest łatwy, tylko dlatego, że kod **nie ma jednego
miejsca zapisu**:

```
21 instrukcji INSERT INTO stock_moves w 17 plikach
5 niezależnych, prywatnych funkcji nazwanych insertStockMove (żadna nie eksportowana)
8 różnie nazwanych helperów write*
7 zapisów całkowicie wklejonych w miejscu
3 identyczne kopie generatora numeru ruchu
1 writer odwrócenia zduplikowany dosłownie (dlatego commit 58900b69 musiał łatać dwa pliki)
```

Trzy z czterech ostatnich awarii to **trzy różne tryby awarii w trzech różnych miejscach
zapisu**. To jest bezpośredni, przewidywalny koszt braku wspólnego pisarza. Reguła w kodzie
musiałaby zostać powtórzona 21 razy. Reguła w bazie obowiązuje raz i **nie da się jej ominąć**.

## Co konkretnie

`CREATE CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` na `license_plates`, wyzwalany
przy `UPDATE OF quantity`, sprawdzający **przy COMMIT**, że w tej samej transakcji powstał
co najmniej jeden `stock_moves` wskazujący na tę paletę.

**Świadomie NIE sprawdzam tu sumy.** To jest ważne. Wersja „suma = stan" byłaby ładniejsza
i natychmiast wywróciłaby przyjęcia PO (P0.9), inwentaryzacje i historyczne palety —
czyli włączenie jej to zatrzymanie zakładu. Wersja „istnieje jakikolwiek ruch" jest o klasę
tańsza, o klasę bezpieczniejsza, i łapie **dokładnie tę klasę, która pękła trzy razy w dobę**:
kod, który wyzerował paletę i nie napisał nic.

Suma idzie do crona z pozycji 1. Podział jest celowy: **naruszenie „brak wiersza" to błąd
programisty i ma wywalić transakcję; rozjazd sumy to stan danych i ma być raportem.**

Indeks pod to już istnieje (`stock_moves_lp_idx`).

## Bilans

| | |
|---|---|
| **co złapie** | **I1, klasa „brak wiersza"**: P0.3 (anulowanie zakończonego WO zeruje LP), P0.7 (unieważnienie odpadu), P0.10 (anulowanie wysyłki), P0.4 (replacement), P0.2 (demontaż), P0.6 (konsumpcja/odpad bez LP — tu akurat LP się nie zmienia, więc **nie złapie**; uczciwie). |
| **czego NIE złapie** | Odwróconego znaku (P0.8) — wiersz istnieje, więc wyzwalacz przechodzi. To zostaje dla crona z poz. 1. |
| **przed czy po?** | **Przed.** Każdy test, każde kliknięcie w dev, każdy przebieg sondy na tej ścieżce dostaje wyjątek. Awaria staje się głośna w miejscu powstania, nie trzy tygodnie później w rozjeździe stanu. |
| **koszt wdrożenia** | **~1 dzień, w tym rozpoznanie.** Sama funkcja to ~40 linii plpgsql + migracja. Dzień idzie na ustalenie, które ścieżki dziś legalnie zmieniają `quantity` bez ruchu (podejrzewam: żadna, ale to trzeba zmierzyć, nie założyć) i na etapowanie. |
| **koszt utrzymania** | Niskie. To obiekt schematu — utrzymuje się sam. Jedyna praca to gdy pojawi się legalna zmiana ilości bez ruchu; wtedy albo wyjątek jest słuszny, albo trzeba go świadomie dopuścić. |
| **polecam** | **TAK, ale etapami:** najpierw wersja pisząca do tabeli naruszeń (bez `raise exception`), przez jeden przebieg pełnej suity + jeden dzień na dev. Dopiero gdy tabela jest pusta — flip na wyjątek. |

**Uwaga o FK, którą warto znać przy tej okazji:**
`stock_moves.lp_id → license_plates(id) ON DELETE CASCADE` (migracja 193). **Skasowanie
palety kasuje całą jej historię w księdze.** Dla tabeli, która ma być księgą audytową
w zakładzie mięsnym, `CASCADE` to zły domyślnik — powinno być `RESTRICT` albo
`ON DELETE SET NULL` z zachowanym `lp_number` w treści. To osobne znalezisko, nie propozycja
narzędziowa, ale leży dokładnie w tym samym miejscu.

---

# 4. `CHECK … NOT VALID` na `site_id` — najtańsza pozycja w raporcie

## Problem

Wiersze z `site_id IS NULL` blokują migrację 551, która **jawnie odmawia**:

```sql
-- 551-production-site-visibility-rls.sql
if v_total_null > 0 then
  raise exception 'migration 551 refuses fail-closed flip: % site-scoped rows still have NULL site_id;
                   repair their producers/backfill first', v_total_null;
end if;
```

Kod **nadal produkuje nowe** — najgroźniejsza czynna ścieżka ma to wprost w komentarzu:

```
apps/web/lib/production/start-wo.ts:263  „When the WO has no site, site_id stays NULL"
```

plus propagacja przez `wo-state-machine.ts:237` (podzapytanie bez `and wo.site_id is not null`)
i **trigger bazodanowy** `384-trigger-user-default-site.sql`, który robi `coalesce(linia,
domyślny użytkownika, domyślny organizacji)` i **przy pustym wyniku zwraca rekord zamiast
odmówić**. `license_plates` nie ma nawet tego triggera.

To jest klasyczne zakleszczenie: nie da się postawić `NOT NULL`, bo są wiersze; nie da się
posprzątać wierszy, bo kod dokłada nowe.

**Do tego zakleszczenie kolejnościowe:** migracja **557** (naprawa `license_plates.site_id`)
ma numer **wyższy niż 551**, a runner (`packages/db/scripts/migrate.ts`) sortuje po prefiksie
i zatrzymuje się na pierwszej porażce. Nagłówek 549 mówi to wprost: *„557 repairs
license_plates → runs AFTER the gate. Too late."* Naprawa jest w repo i jest nieosiągalna.

## Dwa sprostowania do zlecenia

**(1) Liczba 37 nie występuje w żadnym pomiarze tego repozytorium.** `RAPORT-PUSTY-ZAKLAD.md:3`
sam prostuje: *„komunikat migracji mówił o 7 wierszach (baza monopilot), a moja tabela
w dzienniku o 11 (monopilot_t1). To były dwie różne bazy."* Migracja 549 cytuje suchy przebieg
na produkcji: `schedule_outputs 19 + quality_inspections 4 + ncr_reports 2 = 25`.
**Przed wymiarowaniem naprawy trzeba zrobić świeży `SELECT`** — nie brać żadnej z tych liczb.

**(2) To nie jest 5 tabel, tylko 45.** W `packages/db/__expected__/schema.sql` **45 tabel niesie
`site_id uuid` i ANI JEDNA nie jest `NOT NULL`**. Pięć tabel z runbooka w biblii to zbiór
audytowany przez bramkę 551, nie cała powierzchnia. Migracja `334-site-scoping-columns.sql:1-13`
mówi wprost, że tak zostało zaprojektowane:

> *„New columns are NULLABLE uuid REFERENCES public.sites(id) ON DELETE SET NULL — backfill
> FAILS-OPEN: existing rows we cannot resolve stay NULL (app code fail-CLOSES new writes —
> **NOT enforced here**)."*

„Egzekwowane w kodzie aplikacji" to dokładnie to założenie, które nie wytrzymało.

## Rozwiązanie, które Postgres ma od dawna

```sql
alter table public.license_plates
  add constraint license_plates_site_id_present
  check (site_id is not null) not valid;
```

`NOT VALID` znaczy: **ograniczenie obowiązuje natychmiast dla nowych i aktualizowanych wierszy,
istniejące nie są skanowane.** Później, gdy 37 wierszy zostanie posprzątane,
`ALTER TABLE … VALIDATE CONSTRAINT` domyka sprawę — i robi to bez `AccessExclusive`,
czyli bez okna serwisowego.

To rozcina zakleszczenie w obie strony naraz:

- **krwawienie staje przed sprzątaniem** — nowe wiersze bez zakładu przestają powstawać
  natychmiast, zanim ktokolwiek dotknie tych 7/11/25 istniejących;
- **migracja 551 przestaje być warunkiem wstępnym czegokolwiek** — a więc 557 (naprawa palet,
  dziś nieosiągalna, bo stoi za bramką o niższym numerze) staje się osiągalna.

Zacząć od pięciu tabel audytowanych przez 551 (`license_plates`, `lp_state_history`,
`work_orders`, `wo_events`, `wo_outputs`), rozszerzać po jednej — każda `NOT VALID`, każda
osobno walidowana, gdy jej dane są czyste. Nic tu nie musi iść naraz.

## Bilans

| | |
|---|---|
| **co złapie** | **I6.** Każdy nowy zapis bez zakładu. W tym `start-wo.ts:263`, `wo-state-machine.ts:237`, trigger 384 i ~12 miejsc z `?? null` w historii palet — czyli **to, co dokłada wiersze dzisiaj**. |
| **przed czy po?** | **Przed** — na dev, na CI (baza z migracji), w każdym `.pg.test.ts` na tej ścieżce. Na produkcji: w momencie zapisu, głośno, zamiast cicho. |
| **koszt wdrożenia** | **~1 h** dla pierwszych pięciu tabel. Jedna migracja, ~15 linii. |
| **koszt utrzymania** | **Zerowe.** |
| **polecam** | **TAK. Najlepszy stosunek zysku do kosztu w całym zestawie — jedna godzina.** |

**Trzy zastrzeżenia, wszystkie realne:**

1. Ścieżka „WO bez zakładu" zacznie rzucać zamiast pisać `NULL`. Biblia sugeruje, że to
   pozostałość po testach, nie funkcja — ale **to trzeba sprawdzić zapytaniem, nie założeniem.**
2. **Kolizja z `ON DELETE SET NULL`.** Klucze obce zakładu są zdefiniowane jako
   `ON DELETE SET NULL` (migracja 334), więc **skasowanie zakładu dziś po cichu zeruje
   `site_id` w wierszach, które na niego wskazywały** — migracja 549 nazywa
   `quality_inspections_site_id_fkey` jako żywego producenta tych NULL-i i zaznacza, że tego
   nie naprawia. Z `CHECK`-iem skasowanie zakładu zacznie rzucać. **To jest poprawne
   zachowanie** (lepiej odmówić niż po cichu odpiąć inspekcję jakościową od zakładu), ale
   jest zmianą zachowania i trzeba ją zaplanować — docelowo `ON DELETE RESTRICT`.
3. Osobno, poza zakresem tej pozycji: `app.user_can_see_site` (migracja 383:22-52) ma **trzy
   żywe gałęzie fail-open**, w tym `p_site_id is null → widoczny` i „zero przypisań do zakładu
   → bez ograniczeń (**każdy użytkownik dzisiaj**)". Migracja `466-user-can-see-site-failopen-todo.sql`
   to **migracja złożona wyłącznie z komentarza**, dokumentująca to jako znane TODO. `CHECK`
   nie dotyka funkcji — to osobna decyzja, wpisana w biblii jako D5.

---

# 5. Testy kontraktowe czytające źródło — cztery konkretne przypadki

## Wzorzec już jest — pytanie brzmi, gdzie jeszcze pasuje

Repo ma pięć takich testów, w tym jeden z analizatorem AST wydzielonym do modułu:

| plik | co pilnuje |
|---|---|
| `apps/web/tests/pack-error-label-contract.test.ts` | każdy kod błędu z `pack-lp-into-box.ts` ma etykietę operatorską w 4 lokalizacjach *(ten z tej nocy)* |
| `apps/web/tests/multi-write-transaction-contract.test.ts` | + `tests/lib/multi-write-transaction-analyzer` — skan AST, akcje z wieloma zapisami muszą mieć granicę transakcji |
| `apps/web/tests/use-server-export-contract.test.ts` | moduły `'use server'` eksportują wyłącznie funkcje asynchroniczne |
| `apps/web/tests/settings-wiring-contract.test.ts` | 49 KB, okablowanie ekranów ustawień |
| `scripts/lint-no-hardcoded-strings.mjs`, `lint-use-server-exports.mjs` | te same reguły w warstwie lintu |

**Koszt wprowadzenia wzorca = zero.** Infrastruktura, konwencja i analizator AST istnieją.
Poniżej cztery przypadki, w których to się opłaca — każdy trafia w konkretny niezmiennik.

## ⚠️ Warunek wstępny, bez którego cała ta sekcja ma dziurę

**`changeover-actions.ts` jest niewidoczny dla wyszukiwania tekstowego.** Linia 307 wstawia
**dosłowny bajt NUL** jako separator klucza mapy:

```ts
const key = `${entry.allergen_from}\0${entry.allergen_to}`;
```

`rg` melduje *„binary file matches"*, BSD `grep` *„1 matches in 0 files"* — bez numerów linii,
bez treści. **Każdy audyt tekstowy po cichu pomija plik zawierający logikę świadectwa
alergenowego** (m.in. `matrixRiskLevel`, która liczy `risk_level` drukowany na tym samym
świadectwie).

To jest **mechanizm „zieleni przez pominięcie" wewnątrz techniki, którą właśnie polecam.**
Test kontraktowy czytający źródło pominąłby ten plik i zameldował zieleń. Dwa wnioski,
oba obowiązkowe:

1. Zamiana `\0` na `` albo `|` przywraca wyszukiwalność za darmo — i biorąc pod uwagę,
   że ten plik właśnie wyprodukował defekt bezpieczeństwa żywności, który przeżył kilka
   przebiegów audytu, traktuję to jako czynnik współsprawczy, nie ciekawostkę.
2. **Każdy test z tej sekcji musi mieć asercję nie-pustości** — „wczytałem N plików, N > oczekiwane"
   i „regex trafił w cokolwiek". Wzorzec jest już w repo, w teście z tej nocy:
   `pack-error-label-contract.test.ts:43` — `it('reads a non-trivial set of codes out of the
   source (guards the regexes above)')`, plus `throw` w ekstraktorze, gdy blok się nie dopasował.
   Bez tego test czytający źródło jest tylko droższym sposobem na fałszywą zieleń.

---

## 5a. Skaner fail-open — **I3**

**Reguła:** w pliku, którego nazwa lub ścieżka zawiera `guard` / `gate` / `hold` / `permission`
/ `qc` / `release`, blok `catch` **nie może** zwrócić wartości przepuszczającej.
Sygnatury do wykrycia: `return { ok: true`, `passed: true`, `blocked: false`, `allowed: true`,
`return []`, `?? true`, `.catch(() => [])`.

**To złapałoby wszystkie trzy bramki.** Kluczowa obserwacja z commita `bf7f0579`, która czyni
tę regułę bezpieczną:

> „BRAK BLOKADY" PRZYCHODZI JAKO PUSTY ZBIÓR WYNIKÓW, NIGDY JAKO WYJĄTEK.

Czyli w bramce bezpieczeństwa **nie istnieje legalny spodziewany wyjątek**. Każdy wyjątek to
awaria. To znaczy, że reguła nie potrzebuje heurystyki „czy ten catch jest w porządku" —
w tej rodzinie plików **żaden nie jest**.

Uzasadnienia fail-open w komentarzach („09-quality jeszcze nie wysłane") były **martwe od
migracji 197** — widok `v_active_holds` istniał i w bazie, i w migracjach. Komentarz przeżył
swój powód o kilkaset migracji. Test tego nie przeżyje.

### Ta reguła zapala się dzisiaj, na miejscu, którego nikt nie naprawił

`packages/auth/src/password-policy.ts:133`:

```ts
} catch (_err) {            // SELECT z password_history
  // Fail-open: table may not exist yet or other transient error
  return false;             // → „hasło nie było użyte wcześniej"
}
```

**Dokładnie ten sam kształt co bramki blokad**: „nie było użyte wcześniej" przychodzi jako
pusty zbiór wyników, nigdy jako wyjątek — więc błąd bazy po cichu **przepuszcza ponowne użycie
starego hasła**. Uzasadnienie „tabela może jeszcze nie istnieć" jest martwe tak samo jak przy
`v_active_holds`: migracja 018 to wysłała. (Sąsiedni `catch` dla HIBP w tym samym pliku jest
świadomy i ma furtkę `HIBP_FAIL_HARD` — reguła musi umieć je rozróżnić przez listę wyjątków.)

### Przy okazji: przeterminowany komentarz na naprawionej bramce

`apps/web/lib/production/holds-guard.ts:65-67` — JSDoc **nadal mówi** *„or the `v_active_holds`
view does not yet exist — fail-open seam"*. Kod tego już nie robi. Następny audytujący albo
zgłosi naprawioną bramkę jako dziurę, albo uwierzy komentarzowi i przywróci gałąź.

| | |
|---|---|
| **łapie** | **I3** — wszystkie trzy bramki (`holds-guard.ts`, `scanner/movement.ts:781-803`, `lp-detail-actions.ts:501-518`) + czwarte miejsce z commita (`qc-release-policy.ts`) + **jedno żywe, nienaprawione** (`password-policy.ts:133`). |
| **przed?** | **Tak**, bramka na PR. |
| **wdrożenie** | ~4 h — analizator AST jest, to nowy zestaw reguł nad nim. |
| **utrzymanie** | Średnie: allowlist będzie rosnąć i trzeba pilnować, żeby wpisy miały uzasadnienie. Wzorzec z `multi-write-transaction-contract.test.ts` (`ALLOWLIST` z komentarzem „should stay empty") jest tu dobrym prototypem. |
| **polecam** | **TAK** |

**Kalibracja, żeby reguła nie utonęła w szumie:** szeroki przemiot `catch → return []/null`
po `apps/web` + `packages` daje ~40 dalszych trafień, ale **każde z nich to degradacja modelu
odczytu** (listy, ładowarki rozwijanych list, raporty, okruszek zakładu w pasku) — żadne nie
decyduje o zgodzie. Dlatego reguła musi być zakotwiczona w **rodzinie plików** (`guard`/`gate`/
`hold`/`permission`/`qc`/`release`/`policy`), nie w samym kształcie `catch`.

Bramki, które sprawdziłem i są **fail-closed** — nie ruszać, nie zgłaszać ponownie:
`fetch-stage-gate-readiness.ts` (`DEGRADED_READINESS = { status: 'HARD_BLOCKED' }`),
`lib/auth/has-permission.ts` (brak `catch`, błąd propaguje), `packages/server/src/quality/holdsGuard.ts`,
`lib/auth/saml.ts:416-449`, `proxy.ts:122-137` (503), `packages/e-sign/src/sign.ts:161-163`,
`lib/technical/rm-usability.ts:376-380`.

---

## 5b. `ilość × cena` bez konwersji — **I2**

**Reguła:** wyrażenie SQL mnożące kolumnę z rodziny ilości (`quantity`, `qty_*`, `*_kg`)
przez kolumnę z rodziny ceny (`vec.amount`, `cost_per_kg`, `unit_price`, `list_price_*`)
musi mieć po stronie ilości jeden z uznanych fragmentów sprowadzających do jednostki bazowej —
`BOM_LINE_BASE_QTY_SQL`, `wacQtyKgSql`, `WAC_SNAPSHOT_QTY_KG_SQL` — albo wpis na liście wyjątków.

**Ta reguła zapala się dzisiaj**, i to na trzech żywych miejscach, które są **dosłownym
rodzeństwem naprawionego błędu**:

```
apps/web/lib/npd/live-wip-cost-query.ts:101   sum(bl.quantity * vec.amount)
apps/web/lib/npd/live-wip-cost-query.ts:193   to samo
.../npd/pipeline/[projectId]/costing/_actions/compute.ts:692   to samo
```

To ta sama tabela `bom_lines` złączona z tym samym widokiem `v_item_effective_cost`, to samo
wyrażenie, które w `recipe-cost-rollup-sql.ts` zostało naprawione o 02:22. Naprawa stanęła
na granicy modułu. Commit `2dcd9a73` sam to eskaluje w treści.

Czwarte miejsce, o innej naturze: `complete-cancel-wo.ts:626` mnoży `o.qty_kg * cost_per_kg`,
a `wo_outputs.qty_kg` **nie jest w kilogramach** — trzyma ilość w tym, co mówi
`wo_outputs.uom`. Repo dokumentuje to samo o sobie w `apps/web/lib/uom/piece.ts:61-77`.
Regułę trzeba więc oprzeć na **nazwie kolumny źródłowej, nie na przyrostku `_kg`** —
bo przyrostek kłamie.

**Ekstraktor SQL już istnieje.** `scripts/extract-sql.mjs` + `scripts/prepare-check-sql.mjs`
wyciągają wszystkie literały szablonowe SQL z repo i puszczają je przez `PREPARE`. To była
najdroższa część tej reguły i jest napisana — koszt spada z ~6 h do ~3 h.

| | |
|---|---|
| **łapie** | **I2** — jego żywe rodzeństwo (3 miejsca + `complete-cancel-wo.ts:626`). Sam naprawiony przypadek jest już przypięty testem `recipe-cost-uom.pg.test.ts`, ale ten test **cicho się pomija** (poz. 2). |
| **przed?** | **Tak.** |
| **wdrożenie** | ~3 h — ekstraktor literałów SQL jest gotowy (`scripts/extract-sql.mjs`). |
| **utrzymanie** | Średnie — lista wyjątków będzie miała pozycje legalne (`sales-line-price.ts`, `get-po-aging.ts`, `rma-actions.ts:410` celowo wyceniają w jednostce zamówienia). Każdy wyjątek musi mieć jedno zdanie uzasadnienia. |
| **polecam** | **TAK** — bo to jedyna propozycja w raporcie, która zamyka **klasę**, a nie przypadek. |

**Sąsiednia dziura, którą ta reguła NIE złapie, a warto o niej wiedzieć:**
`formulation_ingredients(qty_kg, cost_per_kg_eur)` **nie ma kolumny `uom` w ogóle** — czysta
niejawna umowa o jednostce bazowej, zasilająca `compute-waterfall.ts`. Nie ma czego porównać,
więc reguła milczy. To znajduje dopiero spis do pozycji 7.

Druga: gałąź g→kg w `BOM_LINE_BASE_QTY_SQL` jest uzależniona od wypełnionego
`items.uom_secondary`. Gdy jest `NULL` (przypadek typowy — nikt tego nie wypełnia), pozycja
w gramach wpada w `else null` i **filtr `is not null` w klauzuli `where` wyrzuca ją z sumy**.
Siatka pokazuje „nieskosztowane", a suma jest po prostu po cichu za mała. To jest ta sama
klasa, przed którą ostrzega komentarz w tym samym pliku: *„nikt nie audytuje 30.00"*.

---

## 5c. Spis skal `numeric` — **I1** (utrata podziarnowa)

Zmierzone tej nocy: ta sama operacja zapisana jako dwie różne liczby.

```
request 1.2345  →  wo_outputs.qty_kg      = 1.235     numeric(12,3)
                   license_plates.quantity = 1.234500  numeric(18,6)
                   stock_moves.quantity    = 1.234500  numeric(18,6)
```

0,0005 kg na operację. 2000 operacji = 1 kg.

**Reguła:** czytać wszystkie migracje, zgrupować kolumny po roli semantycznej (ilość towaru),
i wymagać jednej skali w grupie. Odstępstwo = jawny wpis z uzasadnieniem.

| | |
|---|---|
| **łapie** | **I1**, wariant, którego ani wyzwalacz, ani cron nie zobaczą — bo obie strony równania mogą się zgadzać, a ubytek jest w zaokrągleniu. |
| **przed?** | **Tak** — na etapie pisania migracji. |
| **wdrożenie** | ~3 h. Czytanie SQL regexem, nie parserem — to jest do przyjęcia dla `numeric(a,b)`. |
| **utrzymanie** | Niskie. |
| **polecam** | **TAK** — tani, a to jedyna bramka na tę klasę. |

---

## 5d. Osiągalność stanów — zamiast weryfikacji formalnej

**Reguła:** dla każdej tabeli ze statusem: wyciągnąć listę dozwolonych wartości z `CHECK`
w migracji, wyciągnąć krawędzie przejść z tablicy przejść w kodzie, i sprawdzić, że
(1) każdy zadeklarowany status jest osiągalny ze stanu początkowego,
(2) każdy status nieterminalny ma wychodzącą krawędź **z istniejącą akcją**.

**Zapala się dzisiaj:**

```sql
-- 318-stock-count-adjustments.sql:13
status text not null default 'open'
  check (status in ('open','counting','review','closed','cancelled'))
```

Tworzenie zapisuje `open`. Zapis liczenia wymaga `counting`. Zamknięcie wymaga `review`.
**Żadna akcja nie wykonuje przejścia `open → counting`.** Inwentaryzacja nie działa w ogóle —
zmierzone: `counted_qty = null`. Ślepy zaułek istnieje od migracji 318.

To jest **cała wartość, jaką dałaby weryfikacja formalna maszyn stanów**, uzyskana za ~40 linii
kodu czytającego dwa źródła, które i tak są w repo. Szczegóły w sekcji „czego NIE polecam".

| | |
|---|---|
| **łapie** | Żadnego z sześciu bezpośrednio. **Łapie klasę sąsiednią** (martwe moduły: inwentaryzacja, RMA). |
| **przed?** | Tak. |
| **wdrożenie** | ~4 h. |
| **utrzymanie** | Niskie. |
| **polecam** | **TAK, ale z niższym priorytetem** — bo nie trafia w żaden z sześciu. Włączam go do raportu wyłącznie jako **tańszy zamiennik weryfikacji formalnej**, o którą pytasz w punkcie 5. |

---

# 6. `CHECK` zakazujący sprzecznego świadectwa — **I4**

## Najmocniejszy argument w całym raporcie leży tutaj

Kolumna `allergen_changeover_validations.validation_result` to **`text not null` bez żadnego
`CHECK`** (potwierdzone w `packages/db/__expected__/schema.sql:6454` — jedyne ograniczenie tej
tabeli to `chk_allergen_signatures`). Tabela jest opisana w migracji 184 jako *„BRCGS Issue 10
evidence record"* z siedmioletnią retencją.

**A dokładnie ta sama reguła ATP już istnieje w bazie — dla innej tabeli.**
`packages/db/migrations/187-atp-swab-autofail-trigger.sql:77-111` to trigger, który wymusza
`result_status := 'fail'` na `lab_results`, gdy RLU przekracza próg organizacji. Quality
dostało regułę jako obiekt schematu. Produkcja dostała drugą kopię tej samej reguły
**w TypeScripcie**. Rozjechała się ta w TypeScripcie.

Komentarz naprawy nazywa to wprost: *„druga wklejona kopia tej reguły to dokładnie sposób,
w jaki defekt «świadectwo mówi passed nad nieudanym wymazem» się dostał"*.

To jest empiryczna, zmierzona odpowiedź na Twoje pytanie z punktu 2: **ta sama reguła,
zapisana raz jako obiekt bazy i raz jako kod, po roku ma dwie różne wartości — i pęka ta
w kodzie.**

## Czego się NIE da

Naturalny odruch to kolumna generowana: `validation_result GENERATED ALWAYS AS (…)`.
Kusi tym bardziej, że **oba wejścia są w tym samym wierszu** (`cleaning_evidence`,
`atp_evidence`). Ale **pełnego werdyktu tak się nie da**: gałąź liczbowa czyta próg RLU
organizacji przez `public.atp_swab_threshold_rlu(org, null)` (migracja 187), a wyrażenie
kolumny generowanej musi być `IMMUTABLE`. Odczyt z innej tabeli tego nie spełnia. To jest
twarde ograniczenie Postgresa, nie kwestia gustu.

Gałąź słowna (`FAIL`/`PASS` z pola tekstowego) **byłaby** `IMMUTABLE` i dałoby się ją zamknąć
kolumną generowaną. Ale rozszczepienie werdyktu na dwie warstwy — połowa w kolumnie
generowanej, połowa w kodzie — to gorszy stan niż jedno miejsce. Dlatego niżej wersja tańsza
i całkowicie jednoznaczna.

## Co się da — i to wystarcza

Zakazać **konkretnej sprzeczności**, która wystąpiła:

```sql
alter table public.allergen_changeover_validations
  add constraint changeover_validation_not_contradicted
  check (
    validation_result <> 'passed'
    or atp_evidence is null
    or upper(btrim(atp_evidence)) not in ('FAIL','FAILED','F')
  );
```

`upper` i `btrim` są `IMMUTABLE`, więc to jest legalny `CHECK`. Wiersz, który wystąpił
w produkcji — `validation_result='passed'`, `risk_level='high'`, `atp_evidence='FAIL'` —
**staje się niezapisywalny**. Bez względu na to, ile warstw kodu leży wyżej i który parser
się pomyli.

**Dlaczego to jest ostatnia linia, a nie jedna z wielu:** dla tego świadectwa **nie ma
żadnego renderera** — PDF-u ani HTML-a. **Wiersz JEST świadectwem**: dopisywany, nigdy
nieaktualizowany w miejscu, bez klucza unikalnego na `changeover_event_id`, z siedmioletnią
retencją; powtórny wymaz pisze nowe świadectwo, które zastępuje poprzednie. Werdykt jest
policzony **raz, w chwili podpisu**, i od tej chwili każdy czytelnik po prostu ufa
zapisanemu łańcuchowi znaków. Dlatego jednolinijkowy błąd klasyfikacji stał się **trwałym
fałszywym poświadczeniem**, a nie chwilową pomyłką na ekranie. `CHECK` stoi dokładnie na
granicy między „pomyłką" a „dokumentem".

| | |
|---|---|
| **łapie** | **I4** — dokładnie ten wiersz. |
| **przed?** | **Tak** — każdy test, każdy zapis z dev. |
| **wdrożenie** | ~30 min. |
| **utrzymanie** | Niskie, ale **niezerowe i uczciwie: to nie jest naprawa klasy.** Lista tokenów będzie dryfować. Commit `11095c7c` świadomie pominął `negative`/`negatywny` — w mikrobiologii „negative" znaczy CZYSTO, a potocznie ZŁE; wieloznaczne słowo ma trafiać do „unknown", nie do zgadniętego werdyktu. Ta sama ostrożność musi obowiązywać w `CHECK`. |
| **polecam** | **TAK, wąsko.** Jako zakaz sprzeczności, nie jako wyprowadzenie werdyktu. |

**Dlaczego I4 nie da się przenieść do bazy w wersji ogólnej:** źródłem błędu było
**parsowanie werdyktu z wolnego tekstu**. Baza nie może wiedzieć, że pole tekstowe zasila
decyzję. Naprawa klasy jest w kodzie, i commit ją opisuje: reszta repo używa wyliczeniowych
werdyktów walidowanych na granicy zaufania; luźne parsowanie było wyłącznie tutaj.
Baza domyka tylko ostatni metr.

---

# 7. FK `uom` → `unit_of_measure` — klasa sąsiadująca z I2

Wszystkie tabele niosą jednostkę jako **kod tekstowy bez klucza obcego**:

```
bom_lines(quantity numeric(14,6), uom text NOT NULL)
license_plates(quantity numeric(18,6), uom NOT NULL)
wo_material_consumption(qty_consumed numeric(12,3), uom DEFAULT 'kg')
wo_outputs(qty_kg numeric(12,3), uom DEFAULT 'kg')
```

Nic nie łączy tych kolumn z `public.unit_of_measure(org_id, code, factor_to_base, category)`.
Nic nie zatrzymuje kodu, którego nie da się przeliczyć.

Klucz obcy złożony `(org_id, uom) → unit_of_measure(org_id, code)` zamyka to na poziomie bazy.

**Uczciwie: to NIE łapie I2.** I2 to „zapomniano zawołać konwersję" — kod jednostki był
poprawny (`g` jest w katalogu, `factor_to_base = 0.001`, migracja 064:120-129), tylko nikt go
nie odczytał. FK łapie klasę obok: „kod jednostki, którego nie ma w katalogu".

Włączam to, bo koszt jest jednogodzinny, a przy okazji ujawnia **prawdziwą dziurę**:
`formulation_ingredients(qty_kg, cost_per_kg_eur)` **nie ma kolumny `uom` w ogóle** — czysta
niejawna umowa o jednostce bazowej, i to ona zasila `compute-waterfall.ts`. FK tego nie
naprawi, ale spis do FK to znajdzie.

| | |
|---|---|
| **łapie** | Klasę obok I2. **Żadnego z sześciu wprost.** |
| **wdrożenie** | ~2 h (plus sprzątanie tego, co zapali). |
| **utrzymanie** | Zerowe. |
| **polecam** | **TAK, niski priorytet** — świadomie oznaczone jako niespełniające twardego kryterium. Zostaje w raporcie, bo koszt jest w granicach szumu, a spis przy okazji jest wartościowy. |

---

# 8. Testy własnościowe (property-based) — pytanie, które zadałeś wprost

Pytasz, czy niezmiennik „suma ruchów = stan palety" nadaje się na test własnościowy, przy
operacjach idącyach przez prawdziwego Postgresa i transakcje. **Rozdzielam to na dwie rzeczy,
bo mają różne odpowiedzi.**

## 8a. PBT na wartościach (czyste funkcje) — **NIE**

Naturalny cel to `apps/web/lib/shared/decimal.ts` — arytmetyka mikro-6 na `bigint`,
prawa algebraiczne aż się proszą: `microToDecimal(toMicro(x)) === x`, przemienność `mulMicro`,
zgodność `compareDecimalStrings` z `toMicro`.

Sprawdziłem to przeciwko twardemu kryterium i odpowiedź jest jednoznaczna:

**Ile z sześciu niezmienników by to złapało? Zero.**

- **I2** — arytmetyka była **poprawna**. Błąd polegał na tym, że `bom_lines.uom` stoi
  OBOK `bom_lines.quantity`, a `v_item_effective_cost.amount` jest kwotowane za jednostkę
  bazową, i nikt nie połączył tych dwóch faktów. Żadne prawo algebraiczne tego nie widzi.
- **I1** — liczby się zgadzały. Brakowało **wiersza** i **znaku**. Test własnościowy na
  `negateDecimalString` przechodzi, bo funkcja robi dokładnie to, co ma robić — tylko została
  zawołana tam, gdzie nie powinna.

Zgodnie z Twoim kryterium: **nie proponuję.**

Jedno uczciwe zastrzeżenie na marginesie: własność `convert(x, from, to) > 0 dla x > 0`
złapałaby udokumentowane rodzeństwo „g→kg zwraca 0" (`wac-qty-kg-sql.ts:27-29` — gałąź
`when uom = 'g'` odpala się bezwarunkowo, bez sprawdzenia jednostki bazowej indeksu;
`upsert-wac.ts:56` — `numeric(14,3)` zeruje przyjęcie subgramowe **i porzuca pieniądze**).
To nie jest żaden z sześciu. Zwykły test tablicowy z sześcioma przypadkami załatwia to samo
za jedną dziesiątą kosztu.

## 8b. PBT modelowe na żywej bazie — **TAK, ale nie teraz**

To jest odpowiedź na Twoje pytanie właściwe. `fc.asyncModelRun` / `fc.commands` generuje
**losowe ciągi operacji biznesowych** (przyjmij, skonsumuj, cofnij konsumpcję, zarejestruj
wyrób, wyślij, anuluj wysyłkę, spisz odpad, unieważnij odpad…), wykonuje je przeciwko
prawdziwej bazie i po każdym kroku sprawdza `suma(księga) == lp.quantity`.

**To by złapało I1, i to szerzej niż ręczne sondy** — bo dziury z tej nocy to w większości
**pary operacji** (zrób + cofnij), a przestrzeń par rośnie kwadratowo i nikt jej ręcznie nie
przejdzie.

Dojrzałość stosu jest w porządku:
- `fast-check` — 10 mln pobrań tygodniowo, typy w komplecie
- `@fast-check/vitest` 0.4.1, wymaga `vitest ^4.1.0`
- **repo ma `vitest 4.1.5` w korzeniu** ✅ (uwaga: `packages/db` siedzi na `vitest 2.1.8` —
  testy modelowe muszą mieszkać w `apps/web`)
- harness siedzenia bazy **już istnieje**: `_meta/plans/2026-08-05-noc/probes/seed.ts`
  + `vitest.probe.config.ts`, 18 sond, 18 wykonanych, 0 pominiętych

**A jednak: nie polecam tego jako następnego kroku.** Powody, wszystkie o koszcie utrzymania,
nie o technice:

1. **Kurczenie (shrinking) przez bazę jest wolne i zawodne.** Każdy krok kurczenia to powtórka
   transakcji. Przy 20 operacjach i losowej sekwencji to minuty na jeden przypadek, i po
   nieudanym kurczeniu dostajesz sekwencję, której nikt nie umie przeczytać.
2. **Model musi replikować regułę biznesową** — czyli piszesz drugą implementację tego samego.
   Gdy model i baza się nie zgadzają, **musisz rozstrzygnąć, które z dwóch jest błędem.**
   Przy jednoosobowym zespole to jest ten sam człowiek z tym samym martwym punktem.
3. **Rotuje.** Nowa operacja bez komendy w modelu = cicha luka w pokryciu. Dokładnie ta klasa
   „zieleni przez pominięcie", którą właśnie próbujemy wyplenić.
4. **80% wartości daje coś o rząd tańszego** — ten sam harness sond, ręcznie napisane pary
   operacji, plus **jedna współdzielona asercja `expectLedgerBalanced()` z pozycji 1**.
   To jest kilka godzin zamiast kilku dni, i łapie tę samą klasę.

| | |
|---|---|
| **łapie** | **I1** (obie klasy, szerzej niż ręcznie). Nic więcej z szóstki. |
| **przed?** | Tak. |
| **wdrożenie** | ~3 dni. |
| **utrzymanie** | **Wysokie** — to jedyna pozycja w raporcie z takim wpisem. |
| **polecam** | **ODŁOŻYĆ.** Wrócić do tego **wtedy i tylko wtedy**, gdy ręcznie pisane pary z pozycji 1 przestaną znajdować błędy. Wcześniej to jest droższe narzędzie na problem, który tańsze narzędzie jeszcze mierzy. |

---

# CZEGO NIE POLECAM I DLACZEGO

## Weryfikacja formalna maszyn stanów (TLA+, Alloy, TLC) — **NIE**

Prosiłeś o sceptycyzm. Oto on, oparty na pomiarze, nie na opinii o narzędziu.

**Ile z sześciu niezmienników złapałby model TLA+? Zero.**

Przeszedłem tę listę pozycja po pozycji:

- **I1** — nie były to złe przeploty ani wyścigi. Były to **brakujące skutki uboczne
  w pojedynczym, sekwencyjnym przejściu**: `cancelWo` zerował paletę i nie pisał ruchu.
  Model TLA+ złapałby to **tylko wtedy, gdyby specyfikacja modelowała księgę** — a specyfikację
  pisze ta sama osoba, która napisała kod, z tym samym martwym punktem. Weryfikujesz model,
  nie implementację. Nic w tym stosie nie sprawdza kodu **przeciwko** modelowi.
  Adwersaryjny tor z tej nocy potwierdził 10 z 13 tez przez **wywołanie prawdziwej ścieżki
  zapisu z pomiarem stanu przed/po**. Model tego nie zastąpi, bo problem był w tym, co kod
  robi, a nie w tym, co miał robić.
- **I2, I3, I4, I5, I6** — nie mają nic wspólnego z przestrzenią stanów. Zapomniana konwersja
  jednostki, połknięty wyjątek, sparsowany wolny tekst, konfiguracja testów, brakujący klucz obcy.

**Jedyna rzecz, którą model faktycznie by znalazł** — ślepy zaułek statusu `open`
w inwentaryzacji — **kosztuje 40 linii testu czytającego dwa źródła, które już są w repo**
(pozycja 5d). Sprawdzanie osiągalności grafu o 5 wierzchołkach nie potrzebuje TLC.

Do tego koszt wejścia przy jednoosobowym zespole: nauka języka, utrzymanie specyfikacji
w zgodzie z kodem (bez żadnego mechanizmu wymuszającego tę zgodność), i — najgorsze —
**specyfikacja, która się rozjedzie z kodem, jest gorsza niż brak specyfikacji**, bo daje
fałszywy dowód. To jest ta sama klasa co „test broniący starego kontraktu" i „zieleń przez
pominięcie", tylko droższa.

**Werdykt: przerost formy. Nie robić.**

## PBT na czystych funkcjach — **NIE**

Uzasadnione wyżej w 8a. Zero z sześciu. Eleganckie i bezużyteczne w tym konkretnym przypadku.

## pgTAP — **NIE**

Kusi, bo to „testy w bazie". Ale repo **już ma ~130 plików testów migracyjnych** w
`packages/db/__tests__/`, które chodzą przeciwko prawdziwemu Postgresowi z vitesta i mają
działający `test-pool.ts` z rozdziałem ról owner/app. pgTAP dokłada:
- drugi język testów (pl/pgSQL zamiast TS),
- drugi raportownik, którego CI nie umie czytać,
- rozszerzenie, które trzeba zapewnić w czterech środowiskach (docker, CI, klony testowe, Supabase).

Zero z sześciu niezmienników łapie coś, czego nie złapałby zwykły `.pg.test.ts` w istniejącym
harnessie. **Nowa zależność za funkcjonalność, która już jest.**

Uwaga o jakości tych 130 testów, bo ona zmienia obraz: **część z nich sprawdza, czy tekst
migracji ZAWIERA łańcuch znaków, a nie czy SQL DZIAŁA.** Wzorcowy przykład —
`packages/db/__tests__/557-license-plate-site-id-repair.test.ts` robi `readFileSync` na pliku
`.sql` i sprawdza `expect(sql).toContain('conflicting_related_sites')`. To jest test
kontraktowy czytający źródło — dobry wzorzec, ale zastosowany do rzeczy, którą **można było
po prostu wykonać**. Taki test przechodzi nad migracją, której Postgres nigdy nie zaakceptuje.
To nie jest argument za pgTAP-em; to argument za tym, żeby migracja z post-checkiem była
**uruchamiana**, a nie czytana.

## Nowa biblioteka do liczb (decimal.js, big.js, dinero) — **NIE**

Repo ma **dwie** własne implementacje stałoprzecinkowe: `packages/domain/src/formulation/decimal.ts`
(klasa `Dec`, skala 12) i `apps/web/lib/shared/decimal.ts` (mikro-6, `bigint`). Nie
współpracują ze sobą i zaokrąglają na różnych skalach.

Trzecia implementacja pogarsza sprawę. **Prawdziwy problem to nie brak biblioteki, tylko dwie
biblioteki i milczące porażki w obu**: `Dec.div()` zwraca `Dec.zero()` przy dzieleniu przez zero
(`:86-90`), `toMicro()` mapuje niesparsowalne wejście na `0n` (`:40`). Obie zamieniają błąd
w liczbę — i to jest dokładnie ta sama klasa co fail-open bramek (I3), tylko w arytmetyce.

Warta rozważenia jest **konsolidacja do jednej**, ale to refaktor, nie narzędzie, i nie łapie
żadnego z sześciu.

## Snapshot schematu (`check:drift`) jako **nowa** inwestycja — **NIE**

Sam mechanizm istnieje: `pnpm --filter @monopilot/db check:drift` porównuje
`pg_dump --schema-only` z `packages/db/__expected__/schema.sql`, i jest wpięty w CI jako
job `migration-check`.

Problem: **plik odniesienia stoi na okolicach migracji 281, a łańcuch dochodzi do 564.**
Ostatni commit tego pliku to `59d47c37` (fala 8). To jest bramka-teatr.

Nie umieszczam tego jako propozycji, bo: **zero z sześciu niezmienników.** Drift schematu to
inna klasa (i realna — baza `monopilot_qty` miała 15 wartości w `outbox_events_event_type_check`
zamiast ~190 z migracji 482, co dawało ciche `persistence_failed` w wielu modułach).
Regeneracja pliku jest już na Twojej liście z biblii jako pozycja 6, 15 minut, agent.
**To higiena istniejącej bramki, nie nowa technika** — i tam powinna zostać.

---

# Pokrycie sześciu niezmienników — tabela kontrolna

| | I1 ilość | I2 jednostka | I3 bramka | I4 świadectwo | I5 izolacja | I6 zakład |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1. Uzgadnianie | **przed + po** | | | | | |
| 2. Anty-pominięcie | pośrednio | pośrednio | | pośrednio | **przed** | |
| 3. Wyzwalacz odroczony | **przed** (brak wiersza) | | | | | |
| 4. `NOT VALID` | | | | | | **przed** |
| 5a. Skaner fail-open | | | **przed** | | | |
| 5b. `ilość × cena` | | **przed** | | | | |
| 5c. Spis skal | **przed** (ubytek) | | | | | |
| 5d. Osiągalność stanów | — | — | — | — | — | — |
| 6. `CHECK` sprzeczności | | | | **przed** | | |
| 7. FK `uom` | | klasa obok | | | | |
| 8. PBT modelowe | **przed** | | | | | |

**Każdy z sześciu jest pokryty co najmniej raz, i pięć z sześciu — przed wdrożeniem.**
Jedyny, dla którego nie ma bramki przedwdrożeniowej na klasę „odwrócony znak", to I1 —
tam zostaje uzgadnianie po fakcie (poz. 1), i to jest nieusuwalne: baza nie wie, w którą
stronę miał iść korygujący ruch.

Pozycja 5d nie trafia w żaden z sześciu i jest w raporcie **wyłącznie** jako tańszy zamiennik
weryfikacji formalnej, o którą pytasz.

---

# Podsumowanie

Repozytorium nie potrzebuje nowej techniki. Ma testy kontraktowe czytające źródło (5 plików
+ analizator AST + 9 skryptów lintu), ma sondy na żywej bazie (18 testów, 18 wykonanych),
ma wzór uzgadniania, ma ekstraktor literałów SQL, ma szablon crona z fan-outem po organizacjach,
ma ~130 testów migracyjnych na prawdziwym Postgresie. **Prawie wszystko, co potrzebne,
jest już napisane — i wyłączone albo schowane w pliku testowym.**

Potrzebuje trzech rzeczy: **wyjęcia jednego wzoru z pliku testowego do modułu**, **odebrania
42 plikom prawa do meldowania zieleni bez bazy**, i **przeniesienia dwóch niezmienników
do schematu, gdzie nie da się ich ominąć z żadnego z 21 miejsc zapisu**.

Najmocniejszy pojedynczy dowód na to, że warto celować w bazę, jest w tym repo i jest
zmierzony: reguła ATP istnieje **dwa razy** — raz jako trigger na `lab_results` (migracja 187),
raz jako TypeScript w produkcji. Po roku mają różne wartości. **Pękła ta w TypeScripcie.**

Weryfikacja formalna nie złapałaby ani jednego z sześciu. Testy własnościowe na czystych
funkcjach też nie. Jedna godzina na `CHECK … NOT VALID` załatwia cały niezmiennik I6.
