# Wzorce kampanii naprawczych — monopilot-kira

Destylat z **dwóch kampanii**: SOL deep-browser-audit (139 findingów, 11 fal) i post-fix
deep-browser-audit (113 findingów, 12 fal, zamknięta 2026-07-29). Plus fale bugfix W1-W17.

**Po co ten plik:** te same klasy defektów wracały falami, w różnych modułach, u różnych silników.
Poniżej są sformułowane jako **reguły do sprawdzenia**, nie jako opowieść. Czytaj przed
planowaniem fali i przed arbitrażem cross-review.

---

# 1. KLASY DEFEKTÓW, KTÓRE WRACAJĄ

## 1.1. Guard chroniący jeden przypadek ZAMRAŻA sąsiednie ⚠️ NAJCZĘSTSZY
**Osiem wystąpień jednej nocy, w ośmiu niezależnych modułach.** To jest najdroższy wzorzec
w całej kampanii.

| moduł | co guard miał chronić | co zamroził |
|---|---|---|
| lokalizacje | kasowanie lokalizacji z zapasem | przeniesienie wiersza i dezaktywację pustego rodzica |
| transfery | konserwację ilości | legalne przejście `in_transit → received` |
| łańcuchy WO | cykl zależności A→B→A | **zwykły łańcuch rodzic→dziecko** |
| prognozy MRP | zakres site | **wszystkie** wiersze produkcyjne (`site_id IS NULL`) |
| obłożenie schedulera | stare szkice | także szkic bieżący → obłożenie 0 zamiast 2 h |
| jakość | fail-open przez pominięty parametr | zapis wyników i decyzję o blokadzie |
| zamówienia sprzedaży | podwójny submit | **oba** żądania zamiast jednego |
| plombowanie wysyłki | niekompletną wysyłkę | wysyłkę z co najmniej jednym pudłem |
| NPD (Fala 3) | próg etapu pilota | zamrażał pilota **na stałe** — wyjście = 4 awanse etapu |

**REGUŁA:** dowód „złe wejście odrzucone" to **połowa** roboty. Druga połowa: udowodnić,
że **sąsiednia legalna ścieżka nadal przechodzi**. Wymagaj testu w OBIE strony przy każdym
zacieśnieniu warunku.

**Wariant odwrotny — za luźny i za ciasny naraz.** Guard plombowania przepuszczał pustą wysyłkę
(znalazła recenzja) i blokował wysyłkę z jednym pudłem (znalazła bramka). Warunek napisany „na oko"
zwykle myli się w obie strony jednocześnie.

## 1.2. Naprawa jednego miejsca, gdy rodzeństwo ma tę samą wadę
- zdublowany komunikat skanera naprawiony w jednym pliku z dwóch — a stan `not_found` **dodano
  do drugiego w tym samym commicie**, czyli defekt powielono obok miejsca, gdzie go usuwano;
- total zamówienia poprawiony w szczegółach, ominięty na liście;
- jedna martwa kontrolka D365 usunięta, druga została;
- „ułamkowy setup" naprawiony na **zapisie**, odczyt dalej zaokrąglał (Fala 4);
- zamrożenie definicji G4 obchodzone dwiema innymi akcjami — guard był w jednym miejscu (Fala 2).

**REGUŁA:** po znalezieniu defektu **grep po wzorcu, nie po pliku**. Zapytaj: „ile jeszcze miejsc
robi to samo?". Przeżywa, bo testy asertują „jest obecny", nie „występuje **dokładnie raz**".

## 1.3. Fail-open — brak danych przepuszcza zamiast odmówić
- `canManageInvitations !== false` → **pominięta** flaga uchodziła za przyznaną (Fala 6);
- pominięcie albo zmiana nazwy parametru **omijało cały guard specyfikacji** (Fala 11);
- kolizja klucza idempotencji między organizacjami (Fala 11);
- site-RLS **oślepiało** guard kasowania routingu — liczył 0 zamiast N (Fala 4).

**REGUŁA:** brak danych = **odmowa**. Wzorzec do naśladowania: `withSiteContext` w trybie write.

## 1.4. Przycisk, który udaje, że działa
Częściowo przyjęte TO z akcją Anuluj, która nie anuluje · kontrolowane odstępstwo FEFO bez ekranu
domknięcia · D365 obiecujący import przy integracji tylko-eksportowej · „Export queue cron"
martwa kontrolka · Delete na drafcie obiecany przez poprawkę do poprawki (Fala 4).

**REGUŁA:** akcja niedostępna ma **podać powód**. Wyszarzenie bez wyjaśnienia wygląda jak awaria.

## 1.5. Ekran ≠ baza
Overlay kosztu nie docierał do źródła zapisu · pole ręcznej korekty nieedytowalne (kontrolowany
input nadpisywany co znak) · KPI dashboardu 4/5 przy listach pokazujących 3 · nagłówek
„Lines to receive (2)" przy 3 wierszach.

**REGUŁA:** licznik i lista na jednym ekranie muszą liczyć **ten sam zbiór**. Jeśli nie —
to jest defekt, nawet gdy obie liczby są „poprawne" osobno.

## 1.6. Utrata ilości / fałszywy zapis
- ponowne przyjęcie po wycofaniu **zamykało TO bez brakującej linii**;
- konwersja gramów potrafiła **wyzerować dodatnią ilość** i przepuścić wysyłkę bez pobrania;
- pomiar poza specyfikacją zapisany jako PASS;
- klucz idempotencji splitu bez ładunku → replay **raportował lokalizację, do której nic nie zapisano**;
- `cost_currency = NULL` przy każdym zapisie formulacji (Fala 3).

**REGUŁA:** to jest najcięższa klasa. Przy każdej zmianie dotykającej ilości/pieniędzy/werdyktów
wymagaj **dowodu na stanie trwałym**, nie na odpowiedzi akcji.

---

# 2. POSTGRES I SCHEMAT

## 2.1. `$2::uuid` PRZYPINA typ parametru dla CAŁEGO zapytania
Drugie użycie tego samego parametru przy kolumnie `text` → `42883 operator does not exist`.
**Ujawnia się wyłącznie przy parametrach bindowanych** — z literałami działa, więc ręczny psql
daje fałszywą zieleń. Odtwarzaj przez `prepare` bez deklaracji typu.
Rzutuj **kolumnę**, nie parametr, albo używaj osobnych parametrów.

## 2.2. `CURRENT_DATE` nie da się zakwalifikować schematem
`pg_catalog.current_date` → `42P01` (Postgres czyta to jako **tabelę**). Używaj `pg_catalog.now()::date`.
Cron `pm-schedule-due` padał z tego powodu **117 razy dla 3 organizacji**.

## 2.3. PREPARE nie waliduje ciał funkcji SQL
Postgres robi to dopiero przy **wykonaniu**. Migracja 517 przeszła PREPARE i padła na prodzie
(`digest()` z pgcrypto poza `search_path`).
**REGUŁA:** post-check `do $$` musi **FAKTYCZNIE WYWOŁAĆ** to, co dodajesz.

## 2.4. PREPARE bywa FAŁSZYWĄ ZIELENIĄ
Post-check migracji 523 brał dowolny wiersz (`limit 1` **bez `order by`**), a trigger blokuje
UPDATE operacji zablokowanego routingu → pierwszy przebieg trafił na `draft` (zielono),
powtórzony na `superseded`.
**REGUŁA:** post-check **samowystarczalny** (tworzy własny obiekt testowy i wycofuje go),
**PREPARE 3× pod rząd**. Po przepisaniu wykrył *drugą* wadę, której pierwsza wersja nie widziała.

## 2.5. Sprawdzaj po DEFINICJI, nie po nazwie
Odpytywanie o nazwę ograniczenia, którą się założyło, dało 9 minut fałszywego alarmu.
Nazwa jest hipotezą — definicja jest faktem:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.x'::regclass;
```

## 2.6. Zachowanie starej nazwy ograniczenia LIKWIDUJE okno wdrożeniowe
`drop` + `add` pod **tą samą nazwą** w jednej transakcji migracji → stary kod wołający
`ON CONFLICT ON CONSTRAINT <nazwa>` działa nieprzerwanie. Zmiana nazwy tworzy ~3,5-minutowe
okno błędów `42704` (czas builda Vercela).

## 2.7. Kolumny `GENERATED ALWAYS` — każdy zapis pada `428C9`
`work_orders.yield_percent`, `wo_outputs.registered_year`.
**`registered_year` liczony w UTC** i wchodzi w unique `(org_id, batch_number, registered_year)` →
rejestracja tuż po północy 1 stycznia czasu polskiego trafia do **poprzedniego roku**.

## 2.8. `persistence_failed` bywa CHECK-iem w bazie, nie bugiem kodu
`costing_breakdowns_margin_pct_check` (`margin_pct >= -100`) wywracał zapis przy koszcie
> 2× ceny docelowej. Zanim zaczniesz debugować kod — sprawdź ograniczenia tabeli.

## 2.9. Niejednolite skale NUMERIC gubią ilość na granicach modułów
MRP i TO = `numeric(18,6)`, WO = `(15,3)`/`(12,3)`/`(14,3)`, procenty `(7,4)`,
`allocation_pct (5,2)`, scheduler `(10,2)`. Przepływ TO→WO gubi 3 miejsca po przecinku.
`toBaseQtyFromDecimal` zwraca **3 dp**, a TO trzymają **6**.

## 2.10. NUMERIC wraca ze sterownika jako STRING
`Number(a) >= Number(b)` gubi precyzję. Używaj `apps/web/lib/shared/decimal.ts` (micro-bigint, 6 dp).
`toMicro`/`microToDecimal` mają **udokumentowany kontrakt**: śmieci (w tym `null`/`undefined`) → `0n`.

## 2.11. `ALTER TYPE` pada `0A000`, gdy od kolumny zależy widok
Poszerzenie `item_cost_history.cost_per_kg` zablokowane przez `v_item_effective_cost`.

## 2.12. Znane luki walidacyjne w schemacie
- `wo_dependencies` broni **wyłącznie self-loopa** — cykl A→B→A baza przepuści;
- `wo_status_history.from_status`/`to_status` **bez żadnego CHECK-a**;
- `work_orders.status` WERSALIKAMI vs `wo_executions.status` małymi — **dwie różne maszyny stanów**;
- `scheduler_*.line_id` to `text`, `work_orders.production_line_id` to `uuid` (patrz 2.1).

---

# 3. NEXT.JS / REACT

## 3.1. `export type { X }` BEZ `from` w module `'use server'` = 500 przy KAŻDYM zapisie
Kompilator emituje wiązanie runtime → `ReferenceError` **przy ewaluacji modułu**, zanim
jakakolwiek akcja wystartuje. Odczyty działają, każdy zapis daje 500. Żyło od ≥17.07,
niewidoczne w żadnej recenzji opartej na diffie (linia była zastana).

## 3.2. Grupy tras `(app)`, `(admin)`, `(npd)` NIE wnoszą segmentu URL
`revalidatePath('/npd/...')` to **cichy no-op** — znaleziono ~16 takich miejsc.
Realny URL: `/{locale}/pipeline/{id}`.

## 3.3. Funkcja inline przekazywana z RSC do klienta wywraca stronę
Zamień na **nazwaną Server Action** (tak naprawiono ekran Printers w Fali 6 i NCR w Fali 11).

## 3.4. Serwerowa kryptografia w bundlu klienta
Blokuje build. Zawsze `pnpm --filter web build` po rundzie poprawek, nie tylko typecheck.

## 3.5. Operator `!` zamienia błąd kompilacji w awarię produkcyjną
`scheduleId: schedule!.id` budowany **bezwarunkowo** przed rozgałęzieniem create/edit →
w trybie `create` `TypeError` wywracał **cały ekran** do error boundary.
Tworzenie harmonogramów przeglądów **nigdy nie zadziałało** (0 wierszy w całej bazie),
a bramka CI nie miała szans tego złapać.
**REGUŁA:** `!` w kodzie klienta = czerwona flaga w recenzji.

## 3.6. TRZY katalogi tłumaczeń — nie dwa
`apps/web/i18n/` · `apps/web/messages/{locale}/` · **`_meta/i18n-staging/*.json`**
(importowany bezpośrednio przez ~20 modułów etykiet).
Pominięcie któregokolwiek przy commicie = teksty nigdy nie trafiają na produkcję.
Wzorzec `opt('klucz', 'angielski fallback')` degraduje łagodnie, ale `t()` bez fallbacku
sypie `MISSING_MESSAGE` **na każdym renderze**.

**Konsekwencja gorsza niż wygląda:** operator zatrzymany przez POPRAWNIE działającą bramkę
widzący `Could not save results: {message}` uzna to za awarię aplikacji — i zacznie ją obchodzić.
**Zabezpieczenie wyglądające na usterkę jest groźniejsze od widocznego zakazu.**

## 3.7. `withOrgContext` COMMIT-uje przy zwykłym `return`
ROLLBACK tylko przy `throw`. Rollback po częściowym zapisie wymaga rzucenia **poza** blok.

---

# 4. BRAMKA — GDZIE DAJE FAŁSZYWĄ ZIELEŃ

## 4.1. Bramka mierzyła drzewo robocze, nie commit
Selektywny staging pominął `apps/web/components/` i `apps/web/messages/` → commit się nie
kompilował, choć lokalny typecheck był zielony.
**REGUŁA:** stage'uj **całe drzewa** (`apps/web/{app,lib,actions,components,i18n,messages,tests}
packages _meta/i18n-staging`), potem **zweryfikuj**, że nie zostało nic kodowego:
```
git status --porcelain -- apps packages _meta/i18n-staging | grep -vE '^M |^A '
```

## 4.2. Dwie ślepe plamki konfiguracji
1. `pnpm --filter web test` łączy dwa `vitest run` przez `&&` → **suita UI nigdy się nie wykonywała**;
2. `tsconfig.json` **wyklucza wszystkie testy** z typechecku.
**Mierz obie suity osobno.** Typecheck nie chroni testów.

## 4.3. Flaki od obciążenia ≠ regresja — i są PRZEWIDYWALNE
Rodzina widoków importu zbiorczego (`to-`, `wo-`, `po-bulk-import-view`) wypadała czerwona
**pięć razy** w przebiegu równoległym i **za każdym razem** przechodziła szeregowo (3× pod rząd).
Rozstrzygaj `--fileParallelism=false`. Nie zgłaszaj jako regresji.

## 4.4. Porównuj ZBIORY czerwonych plików, nie liczby
Liczba kłamie, gdy jeden plik zyskuje testy, a inny je traci. Baseline przez JSON reporter
+ różnica zbiorów. Baseline bierz **przed** falą (`git stash push -u -- apps packages` → testy → pop).

## 4.5. Bramka migracyjna CI jest MARTWA (zastane)
Mig 279 robi bezwarunkowe `insert into storage.buckets`, CI używa czystego `postgres:16-alpine`
→ `migrate` pada **przed** `check:drift`. Snapshot `__expected__/schema.sql` zamrożony sprzed 279.

## 4.6. Vercel `buildCommand` = `migrate && build`
**Migracja wchodzi na żywą bazę PRZED buildem.** Nieudany build zostawia bazę zmigrowaną.
Backup przed pushem; data-migracje review przed merge.

---

# 5. DELEGACJA SILNIKÓW — KOSZTY STAŁE

## 5.1. Tory piszą testy, których NIE URUCHAMIAJĄ
Zakaz jest celowy (chroni pipeline przed padaniem pod obciążeniem), więc skutek jest **systematyczny**:
testy deterministycznie czerwone · importujące nieistniejące moduły · niesprawdzające tego,
co obiecują w nazwie · deklarowane w raporcie i **nieobecne w patchu**.
**To koszt stały tego flow, nie wpadka.** Budżetuj czas na rundy naprawcze testów.

## 5.2. Raport toru bywa nieprawdziwy — cross-review to jedyna obrona
**W czterech torach jednej nocy główny finding NIE był naprawiony**, mimo raportu twierdzącego
inaczej. Bramka tego nie widzi: sprawdza, czy kod działa, nie czy robi to, co obiecuje raport.
**Cross-review musi być innym providerem** (writer ≠ reviewer).

## 5.3. Tor potrafi rozszerzyć zakres poza finding
Na „zakończone WO traci podpisane wyjście" odpowiedział **nowym przejściem `reopen`** z migracją —
cofającym stan `closed` **bez kompensacji domknięcia finansowego** i zostawiającym fałszywy OEE.
**REGUŁA:** przy rozszerzeniu zakresu żądaj dowodu testem albo **wycofaj**.
Wąska pewna naprawa > szeroka z dziurą w rozliczeniach.

## 5.4. Runda naprawcza potrafi pójść w ZŁĄ STRONĘ
Wiersz podsumowania MRP: przed rundą 9 pól / testy oczekują 5. Po rundzie **12 pól** / testy 9.
Zamiast pogodzić kod z testami — dołożyła pola i przesunęła oczekiwania.
**REGUŁA:** każ wypisać każde pole i **kto je czyta**; nieczytane usunąć.

## 5.5. Recenzent potrafi złamać „read-only"
Zdarzyło się raz — agent-recenzent mimo jawnego zakazu wprowadził poprawkę.
Weryfikuj diff recenzowanych plików.

## 5.6. Kod z Composera potrafi nie kompilować się wcale
15 błędów TS w jednej fali (złe głębokości `../`, niewyeksportowany typ, brak importu).
**Zawsze typecheck + build po rundzie poprawek.**
Częsty konkret: **pomyłka o jeden poziom w ścieżce względnej** — porównaj z plikiem
siostrzanym na tej samej głębokości.

## 5.7. Twarde reguły odpalania (empiryczne)
- Codex: `--sandbox workspace-write`, **nigdy `--full-auto`**, `< /dev/null` obowiązkowe;
- **NIE uruchamiaj `make verify`/testów/buildów WEWNĄTRZ delegowanego zadania** — to był root-cause
  ubijanych tasków, nie liczba torów;
- ~5 torów naraz jest OK przy poprawnym odpaleniu;
- `${x^^}` to **bash, nie zsh** — wywalił heredoc i dał **puste prompty recenzji** (Codex
  odpowiadał „What would you like me to work on?"). Używaj `tr 'a-z' 'A-Z'`.

---

# 6. WERYFIKACJA NA ŻYWYM PRODZIE

## 6.1. Renderowanie strony to NIE dowód
Dowód = odtworzenie akcji + **stan trwały** (baza albo stan po przeładowaniu).

## 6.2. Weryfikacja łapie to, czego nie złapie cross-review
- **zaszyty alias tabeli** w stałej wstawianej do zapytań o innych aliasach → `42P01`
  tylko na ścieżce ZAPISU („odczyt działa, zapis pada");
- żywe awarie **spoza zakresu fal** (`/en/production`, cron `pm-schedule-due`);
- funkcja, która **nigdy nie zadziałała** (0 wierszy w całej bazie).

## 6.3. Kontrola przeciwna — bez niej dowód jest połowiczny
Zamrożony licznik anulowanego WO mógłby znaczyć, że zegar zamarł globalnie. Dopiero pokazanie
**równolegle**, że WO w toku dalej tyka, dowodzi, że naprawa jest **celowana**.

## 6.4. Rozróżniaj „działa" od „udowodniłem, że działa tam, gdzie trzeba"
Odrzucenie zera zadziałało — ale w logu sieciowym **nie było POST-a**, więc zatrzymał to klient.
Bramka serwerowa istnieje w kodzie i **nie została wykonana**. Zaraportuj jako niedowiedzione.

## 6.5. NIE obchodź bramek bezpieczeństwa
Nie klikaj wyłączonych kontrolek przez DOM, nie zmyślaj PIN-ów. „Zablokowane przez bramkę"
to **akceptowalny wynik**; obejście nie jest. Kilka razy harness sam zablokował manipulację —
to znaczy, że zasada działa.

## 6.6. Zapisy tylko przez interfejs; psql wyłącznie SELECT
**Testy `*.pg.test.ts` tworzą fixture'y — NIGDY nie kieruj ich na produkcję.**
Do dowodzenia na prodzie: `PREPARE` w transakcji z `rollback` albo czysty SELECT.

## 6.7. Nieosiągalne na danych — zapisz, nie twórz sztucznie
Wielopoziomowe łańcuchy WO (0 wierszy w self-joinie), zablokowany dostawca niebędący preferowanym,
pusty horyzont schedulera. Uczciwe „nieosiągalne" > sfabrykowany dowód.

## 6.8. Gotchy narzędziowe weryfikacji
- `sslmode=no-verify` to składnia sterownika **Node**; `psql`/libpq wymaga `sslmode=require`
  (szyfruje bez weryfikacji łańcucha). Hasło z `!!!!` koduj jako `%21%21%21%21`;
- naiwny grep po `"Something went wrong"` w payloadzie daje **26 fałszywych trafień** —
  to łańcuchy i18n (`errorGeneric`). Sprawdzaj przez `innerText`;
- **wyklucz `.next/` i `node_modules/`** przy grepie po kodzie — inaczej czytasz artefakt builda
  sprzed zmian i wyciągasz wnioski o kodzie, który już nie istnieje;
- **grep po nazwie kolumny łapie ALIASY** — patrz na stronę `FROM`, nie na nazwę;
- RTK zniekształca `rg` (fałszywe „brak dopasowań") — do rzeczy krytycznych `/usr/bin/grep` i `git diff`.

---

# 7. DYSCYPLINY ORCHESTRATORA (o sobie)

1. **Nie cytuj twierdzenia silnika bez uruchomienia go.** Dwa razy podałem ownerowi twierdzenie
   jako fakt i oba były nieprawdziwe.
2. **Nie zgaduj nazw kolumn ani typów** — dwa razy w jednej nocy (`is_active` vs `active`,
   skala `numeric`). Sprawdź w `information_schema` albo w migracji.
3. **Sprawdzaj stan po definicji, nie po nazwie, którą sam założyłeś.**
4. **Nie kieruj testów tworzących dane na produkcję.**
5. **Weryfikuj bramkę na stanie ZACOMMITOWANYM**, nie na drzewie roboczym.
6. **Przy commicie sprawdź importy spoza `apps/web`** — `_meta/i18n-staging/` jest trzecim
   miejscem tej klasy.

---

# 8. CHECKLIST FALI (skrót operacyjny)

**Przed:** recon schematu na prodzie (typy kolumn, CHECK-i, triggery, GENERATED) → przydziel
numery migracji z góry → potnij wg **root-cause**, nie wg kolejności w planie (≤2 findingi/tor).

**W trakcie:** ~5 torów · cross-review innym providerem · arbitraż · rundy poprawek
(budżetuj ≥2, moduły wrażliwe ≥3).

**Bramka:** typecheck · **obie suity osobno** · build · PREPARE każdej migracji **3×** ·
różnica **zbiorów** czerwonych plików vs baseline · flaki rozstrzygnij szeregowo 3×.

**Commit:** całe drzewa + weryfikacja, że nic kodowego nie zostało niezastagowane.

**Po deployu:** poczekaj na READY (migracja wchodzi PRZED buildem!) · **E2E behawioralne
na stanie trwałym** · kontrola przeciwna · uczciwie oznacz nieudowodnione.

**Zawsze:** weryfikacja generuje nowe findingi — **budżetuj czas na naprawy PO wdrożeniu fali.**
W kampanii 2026-07-29 były to cztery blokery, w tym funkcja, która nigdy nie działała.
