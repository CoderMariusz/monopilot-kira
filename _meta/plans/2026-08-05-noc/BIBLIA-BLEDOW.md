# Biblia błędów — noc 5/6 sierpnia 2026

Dokument uporządkowany **według tego, co trzeba zrobić**, nie chronologicznie.
Przebieg godzina po godzinie jest w `DZIENNIK-NOCY.md`.

---

# ZACZNIJ TUTAJ — kolejność na rano

## Jednym akapitem

Aplikacja **buduje się i przechodzi typecheck** — po raz pierwszy od co najmniej tygodnia.
Łańcuch migracji **dochodzi do 564**. **43 commity** napraw, każda zweryfikowana moim własnym
przebiegiem, a **dziewięć z nich dodatkowo przeklikanych w przeglądarce** (siedem potwierdzonych,
jedna okazała się niedziałająca i została domknięta, jedna częściowo).

**Aplikacja nie jest gotowa do wdrożenia** — nie z powodu kodu, tylko dlatego, że
**cztery rzeczy może zrobić wyłącznie człowiek**, i zajmą Ci około dwudziestu minut. Są niżej.

Poza tym: **zostaje lista defektów, których świadomie nie naprawialiśmy w nocy** — bo wymagają
Twojej decyzji produktowej albo migracji danych na żywej bazie. Też są niżej, z uzasadnieniem.

## Cztery rzeczy tylko dla Ciebie — razem ~20 minut



Kolejność nie jest dowolna: każdy krok odblokowuje następny. Robienie ich w innej kolejności
to strata czasu, bo np. podłączenie webhooka przy padającym buildzie nic nie da.

| # | co zrobić | czas | co odblokowuje | kto |
|---|---|---|---|---|
| **1** | **Decyzja o `yard.manage` i `freight.manage`** — snapshot RBAC albo rename na trzy człony | 5 min | job **`lint`** → a przez to **`build` przestaje być pomijany** | **tylko Ty** — to zmiana zamrożonego kontraktu uprawnień |
| **2** | **Migracja 051 ma tolerować brak ról Supabase** (`anon`, `authenticated`) | ~1 h | **`vitest` + `migration-check` + `playwright`** zaczynają cokolwiek mierzyć — pierwszy raz od 3 czerwca | agent |
| **3** | **Usunąć `\|\| echo "[WARN]"`** z polecenia budującego na Vercelu | 1 min | nieudana migracja **zatrzyma deploy** zamiast go po cichu przepuścić | **tylko Ty** — ustawienie projektu |
| **4** | **Sprawdzić stan migracji na produkcyjnej bazie** (zapytania niżej, poz. 4) **oraz zapytanie z ramki poniżej** | 10 min | wiadomo, czy deploy jest bezpieczny | **tylko Ty** — mnie blokuje klasyfikator |
| **5** | **Podłączyć repozytorium w ustawieniach Vercel** | 5 min | push zaczyna wdrażać | **tylko Ty** |
| **6** | Regeneracja `__expected__/schema.sql` | 15 min | bramka driftu przestaje być teatrem (stoi na migracji 281 z 564) | agent |
| **7** | Defekty kodu wg wagi — sekcja „BŁĘDY W APLIKACJI" | dni | — | agenci |

**Punkty 1, 3, 4 i 5 są tylko dla Ciebie** — to decyzje i ustawienia, nie kod. Razem ~20 minut.
Bez nich reszta pracy nie dojedzie na produkcję.

> ### ⚠️ JEDNO ZAPYTANIE, KTÓRE MUSISZ PUŚCIĆ NA PRODUKCJI ZANIM WDROŻYSZ
>
> Naprawa obejścia SCIM (commit `0d6eac85`) dokłada do głównej bramki autoryzacji warunek
> `deleted_at is null`. Na kopii testowej liczba użytkowników w stanie sprzecznym wynosi **0**,
> więc zmiana nikogo nie zablokuje. **Ale to była kopia, nie produkcja.**
>
> ```sql
> select count(*) from public.users
>  where deleted_at is not null and is_active = true;
> ```
>
> **Jeśli wynik jest większy od zera — NIE WDRAŻAJ tej zmiany bez wcześniejszego uporządkowania
> tych rekordów.** Zablokowałaby ich wszystkich naraz, a idzie to przez bramkę, przez którą
> przechodzi **każda akcja w aplikacji**.

## Stan repozytorium po tej nocy

| | przed | po |
|---|---|---|
| `pnpm build` | **pada** (`'use server'` eksportował stałą) | **kod 0**, 66/66 stron |
| `pnpm typecheck` | **5 błędów** (`main` był rozcięty w pół) | **0** |
| łańcuch migracji | **stawał na 563** (odwrócona bramka widoczności) | **dochodzi do 564** |
| wykonywane testy w odzyskanych suitach | **32** | **161** |
| testy cicho pomijane | 142 | **17** |
| bramka terminu w wysyłkach | liczyła dobę w strefie sesji | liczy w **strefie zakładu** |
| bramki lintu z korzenia | **nigdy nie chodziły w CI** | wpięte |
| `lint-workflows` | **nigdy nie przelintował ani jednego pliku** | działa |

## Co zostało naprawione — 43 commity

Każda pozycja ma dowód uruchomieniowy. Kolumna „kliknięte" mówi, czy naprawę
potwierdzono dodatkowo **w przeglądarce**, a nie tylko testem.

| naprawa | commit | kliknięte |
|---|---|---|
| bloker builda: `'use server'` eksportował stałą | `036bdbff` | — |
| `main` rozcięty w pół — brakujący plik kładł **18 tras kaskadowo** | `6a4e3590` | ✅ (przez tor B) |
| migracja 563 odwracała bramkę widoczności zakładów | `b81ad9de` | — |
| bramka terminu w 4 ścieżkach wysyłkowych | `93730681` | ✅ |
| księga: anulowanie wysyłki nie pisało ruchu zwrotnego | `b59a5285` | ✅ |
| księga: anulowanie zlecenia — 100 kg znikało | `1308ce11` | ✅ |
| księga: cofnięcie konsumpcji miało **odwrócony znak** | `58900b69` | ✅ |
| **błąd tysiąckrotny** w koszcie receptury | `2dcd9a73` | ✅ |
| pracownik usunięty z katalogu firmowego działał dalej | `0d6eac85` | — |
| trzy bramki jakościowe połykały awarię | `bf7f0579` | ⚠️ częściowo |
| wyciek odczytu kartoteki (42 pozycje bez uprawnień) | `5f286e3a` | ✅ |
| świadectwo alergenowe mówiło „passed" przy `FAIL` | `11095c7c` | ✅ |
| prefiks GS1 i powody zwrotu — martwe ścieżki | `9ad47fbf` | ⚠️ jedna nie działała |
| **ścisła walidacja odrzucała własną organizację** (5 miejsc) | `0f9f4c08` | ✅ |
| CI: `lint-workflows` nigdy nie działał, bramki nie chodziły | `48f1918f` | — |
| bramka lintu na `'use server'` (1,35 s zamiast builda) | `88672aca` | — |
| **35 odzyskanych suit: 32 → 161 wykonywanych testów** | `6341c847` | — |
| mój test był **niespełnialny przez 10 h na dobę** | `125016b2` | — |

## Co zostaje — uszeregowane wg skutku, nie wg trudności

### Wymaga TWOJEJ decyzji, nie kodu

| # | rzecz | dlaczego to Ty |
|---|---|---|
| D1 | **Dane historyczne są błędne.** Trzy naprawy księgowe naprawiły **pisarza, nie księgę**. Każde cofnięcie konsumpcji wykonane do dziś ma na palecie rozjazd **podwójnej ilości**; każde anulowanie wysyłki i zlecenia — rozjazd równy ilości. | backfill to migracja danych na żywej bazie |
| D2 | **Unieważnienie odpadu gubi towar bez śladu.** Paleta zostaje pomniejszona, rejestr wraca do zera, storno traci powiązanie z paletą. Żaden ekran nie wystawia pola „paleta" w formularzu odpadu — **obowiązują dwa sprzeczne modele naraz**. | trzeba wybrać model: czy unieważnienie oddaje kilogramy |
| D3 | **Flaga QC zatrzyma zakład, jeśli ją włączysz.** Bramka działa poprawnie, ale `lab_results` jest w praktyce pusta (endpoint zapisu zwraca **501**). Włączenie zablokuje zatwierdzanie specyfikacji dla **każdego** surowca. | to poprawne zachowanie bramki, nie błąd |
| D4 | **ATP = FAIL nie zatrzymuje linii.** Świadectwo mówi teraz prawdę, ale bramka na tym **zamurowałaby linię na zawsze** — pole nie ma ścieżki edycji. | brak wyjścia awaryjnego |
| D5 | **Widoczność zakładów jest wyłączona z projektu.** Komentarz w kodzie: *„zero site assignments → unrestricted (opt-in; **every user today**)"*. | decyzja, czy i kiedy włączyć |

### Defekty potwierdzone, nienaprawione — kolejność wdrożeniowa

| # | rzecz | dowód |
|---|---|---|
| 1 | **Migracja 501 ma ten sam błąd jednostek** co naprawiony rollup — i to **żywa** wersja funkcji zasilającej widok kosztów | przemiot klas, sprawdzone że nie jest nadpisana |
| 2 | **NPD zapisuje zatruty koszt** do `item_cost_history` i `items.cost_per_kg`; na produkcji mogą już siedzieć zawyżone wartości, a naprawiony rollup **przemnoży je poprawnie** | `compute.ts:899,925` |
| 3 | **Inwentaryzacja nie działa w ogóle** — żaden kod nie przestawia sesji na status wymagany do zapisu | zmierzone: `counted_qty = null` |
| 4 | **Zwroty meldują się jako przetworzone bez przyjęcia zapasu**; `shipping.rma.*` nie istnieje w wyliczeniu zdarzeń | dwa tory niezależnie |
| 5 | **Karta oceny dostawcy: „0 otwartych niezgodności" zielonym tonem**, gdy tabela nieosiągalna | `freight-actions.ts:494` |
| 6 | **Panel sensoryczny: operator sam deklaruje, że polityka nie wymaga testu** | `record-sensory-evaluation.ts:153` |
| 7 | **Kody alergenów: błąd relacji → „nie filtruj, zachowaj wszystkie"**, dane zapisywane | `save-draft.ts:447` |
| 8 | `inferOrgContext` **fail-open na losową organizację** (`select id from organizations limit 1`) | `inferOrgContextForQuery:382` |
| 9 | **`advanceCohort` martwy od migracji 040** — odpytuje kolumnę, której nie ma | 16 testów meldowało „pominięte" |
| 10 | **`clearAllergenOverride` — zero wywołań.** Operator nie ma ścieżki usunięcia nieaktualnego nadpisania alergenu | przemiot klas |
| 11 | **33 czerwone testy** w odzyskanych suitach — każdy to defekt, który przez ten czas nie istniał dla nikogo | `6341c847` |
| 12 | **`mwo-loto-signing` padnie na każdej poprawnie zaprowizjonowanej bazie** — przechodził tylko dlatego, że persony nie istniały | odzyskiwanie suit |
| 13 | `scripts/rules-deploy.ts:66` — **nie da się wdrożyć reguł dla organizacji pilota** | mapa klasy UUID |

## Jak czytać status dowodu

| status | znaczenie |
|---|---|
| **UDOWODNIONE** | odtworzone uruchomieniem, z pomiarem stanu przed/po. Można działać. |
| **DO ROZSTRZYGNIĘCIA** | kod działa świadomie tak, jak działa — potrzebna decyzja ownera, nie naprawa. |
| **TEZA** | ustalone z czytania kodu, **nieodtworzone**. Traktować jak hipotezę, nie jak błąd. |
| **OBALONE** | sprawdzone i nieprawdziwe. Zapisane celowo, żeby nikt tego drugi raz nie ścigał. |

---

# CZĘŚĆ I — ZANIM COKOLWIEK WDROŻYSZ

## 0. APLIKACJA SIĘ NIE BUDOWAŁA — NAPRAWIONE I UDOWODNIONE (commit `036bdbff`)

**Aplikacja buduje się po raz pierwszy od co najmniej tygodnia.** Mój własny przebieg:
```
✓ Compiled successfully in 11.8s
✓ Generating static pages using 9 workers (66/66)
pnpm typecheck → 0
```

Naprawa wg konwencji, która **już była w repo**: `_actions/shared.ts` — zwykły moduł bez
dyrektywy, trzymający stałe i typy dla plików akcji obok. **19 modułów tak robi**, `where-used`
po prostu tego pliku nie miało. Jedno źródło prawdy zachowane: i `limit ${WHERE_USED_LIMIT + 1}`
w zapytaniu, i `rows.length > WHERE_USED_LIMIT` w logice obcięcia czytają ten sam symbol.

Inwentaryzacja całego repozytorium: **397 modułów `'use server'`, to był jedyny przypadek.**
Mina z 28 lipca (`export type { X }` bez `from`) — **0 trafień**, nie wróciła. Wróciła
klasa siostrzana.

`export type` **zostaje i jest legalny** — SWC wymazuje aliasy typów przed transformem akcji
serwerowych. 222 pliki w repo tak robią; build przechodzi obok wszystkich i wywracał się
dopiero na `export const`. Potwierdzone empirycznie, nie założone.

<details><summary>Jak to wyglądało przed naprawą (zostawiam dla kontekstu)</summary>

## 0-STARE. APLIKACJA SIĘ NIE BUDUJE. To wyprzedza wszystko inne. — UDOWODNIONE

```
at (…/technical/where-used/_actions/list-where-used.ts:26:1)
at (…/technical/where-used/page.tsx:8:1)
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  web@0.1.0 build: `next build`   Exit status 1
```

Zweryfikowane moim własnym przebiegiem `pnpm build`, nie cudzym meldunkiem.

Przyczyna:
```ts
'use server';                          // linia 1
export const WHERE_USED_LIMIT = 100;   // linia 26  ← tu pada build
export type WhereUsedList = { … };     // linia 28
```
**Moduł `'use server'` może eksportować wyłącznie funkcje asynchroniczne.** Każdy inny eksport
jest nielegalny — Next odrzuca cały moduł, a z nim stronę, która go importuje.

**To nie jest nowy błąd.** 28 lipca ta sama klasa wywróciła moduł Units (`export type {}` bez
`from` emitował wiązanie runtime → `ReferenceError`). Naprawiono wtedy **jeden przypadek**.
Ten wrócił gdzie indziej. Dlatego naprawa idzie na całą klasę: przegląd **wszystkich** modułów
`'use server'` w `apps/web`.

**Jedyna dobra wiadomość:** nieudany build **zatrzymuje** wdrożenie — to akurat jest awaria
bezpieczna. Dlatego produkcja wciąż działa na starym kodzie z 30 lipca. Ale oznacza to też,
że **nic z ostatnich siedmiu dni nie mogło i nie może trafić na produkcję**, dopóki to nie
zostanie naprawione.

Kolejność jest więc taka: **najpierw ten build, potem fail-open migracji, potem webhooki.**
Podłączanie webhooków wcześniej nie ma sensu — build i tak by padł.

</details>

**Ta klasa błędu nie jest niczym chroniona i wróci trzeci raz.** Dwa wystąpienia w osiem dni,
oba wykryte dopiero przez wywrócony `pnpm build` — najdroższą możliwą bramkę. Zlecona reguła
lintu wpięta w `pnpm lint` (repo ma już konwencję: `scripts/lint-no-hardcoded-strings.mjs`).

## 1. Push nie uruchamia wdrożenia. Nic nie trafia na produkcję. — UDOWODNIONE

```
gh api repos/CoderMariusz/monopilot-kira/hooks  →  []
```

Repozytorium ma **zero webhooków**. GitHub nie ma komu powiedzieć, że coś się zmieniło,
więc Vercel nigdy nie startuje builda.

- najnowszy build produkcyjny: **30 lipca 07:59** (z rana, sprzed całego dnia audytu)
- na GitHubie leży **79 commitów**, których produkcja nie widziała
- produkcja **działa** — `/` i `/en/login` odpowiadają 200

**Do zrobienia:** podłączyć repozytorium w ustawieniach projektu Vercel — ale dopiero
po punkcie 2, bo podłączenie wyzwoli natychmiastowy deploy wszystkiego naraz.

## 2. Nieudana migracja NIE zatrzymuje wdrożenia. To jest fail-open. — UDOWODNIONE

Polecenie budujące projektu:
```
cd ../.. && (pnpm --filter @monopilot/db migrate || echo "[WARN] Migrations skipped …") && cd apps/web && pnpm build
```

To `||` **połyka błąd migracji**. Build wypisuje ostrzeżenie i buduje dalej — wdrażając kod,
który zakłada schemat, jakiego w bazie nie ma.

**To jest najgroźniejsza pojedyncza rzecz w tym repozytorium**, bo zamienia głośną awarię
w cichą. Wszystkie inne błędy z tej listy są mniejsze od tego jednego.

**Do zrobienia:** usunąć `|| echo …` z polecenia budującego. Niech nieudana migracja
zatrzyma deploy. Nie zrobiłem tego bez Ciebie — to zmiana zachowania wdrożeń,
a Ty spałeś. Zajmuje minutę.

*Sprostowanie:* przez cały 30 lipca twierdziłem — także w `OSTRZEZENIE-PRZED-PUSHEM.md` —
że odmowa migracji zatrzyma deploy i to jest awaria bezpieczna. **To było nieprawdziwe.**
Założyłem zamiast sprawdzić.

## 3. Migracja 563 odwracała bramkę widoczności zakładów — NAPRAWIONE I UDOWODNIONE

Commit `b81ad9de`.

Predykat przed naprawą:
```
(nieograniczony) OR site_id IS NULL OR site_id = any(widoczne)
```
Człon `site_id IS NULL` czynił wiersze bez zakładu **widocznymi** — dla administratora
i dla ścieżek bez zalogowanego użytkownika. Migracja 551 stanowi wprost coś przeciwnego.

Własna kontrola migracji to złapała (`old=f new=t`) i migracja odmawiała wykonania,
przez co **563 i 564 nie były zastosowane nigdzie** — ani lokalnie, ani na produkcji.

Po naprawie predykat ma kształt z 551:
```
site_id IS NOT NULL AND ((nieograniczony) OR site_id = any(widoczne))
```

Dowód (baza `monopilot_ver`, łańcuch dojechał do 564):

| | wynik |
|---|---|
| polityki przepisane na nowy predykat | 13 |
| polityki wciąż wołające starą funkcję per-wiersz | 0 |
| ten sam wiersz, prawdziwy zakład | **widoczny (1)** ← kontrola przeciwna |
| ten sam wiersz, `site_id = NULL` | **ukryty (0)** |

## 4. Nie wiem, na jakiej migracji stoi produkcyjna baza — NIEROZSTRZYGNIĘTE

Próba połączenia (wyłącznie `select`) została **zablokowana przez klasyfikator**, tak samo
jak 30 lipca. Nie obchodziłem tej blokady.

**To jest najważniejsza niewiadoma przed wdrożeniem.** Nie wiem, czy produkcja stoi na 550,
562, czy gdzie indziej, ani czy ma wiersze bez zakładu blokujące migrację 551.

**Do zrobienia — wykonaj to sam przed deployem:**
```sql
select max(filename) from schema_migrations;
```
oraz, dla każdej z pięciu tabel (`license_plates`, `lp_state_history`, `work_orders`,
`wo_events`, `wo_outputs`):
```sql
select count(*) from public.<tabela> where site_id is null;
```
Jeżeli którakolwiek liczba jest większa od zera — **migracja 551 odmówi, a build to połknie**.

---

# CZĘŚĆ II — BŁĘDY W APLIKACJI

## 5. W drzewie leżał celowo zepsuty kod — ZNALEZIONE I COFNIĘTE

`apps/web/app/api/warehouse/scanner/pick/lps/route.ts` — skasowana jedna linia:
```sql
and (lp.expiry_date is null or lp.expiry_date::date >= current_date)
```

Pozostałość po dowodzie mutacyjnym: agent skasował filtr, żeby pokazać, że test i tak zostaje
zielony, i nie cofnął. Skutek: skaner pokazywałby przeterminowane palety jako kandydatów
do pobrania. Sam ruch nadal blokuje osobna kontrola (409), więc towar by nie wyjechał — ale
operator wybiera pozycję, której wybrać nie wolno, i dowiaduje się dopiero przy zapisie.

Triage 66 plików kodu: **64 realne poprawki, 1 celowe uszkodzenie, 1 szum.**

## 6. Wiersze bez zakładu — źródło jest w kodzie, nie w danych — TEZA (dobrze udokumentowana)

Odbudowa bazy od zera z samych migracji **przeszła 551**, więc istniejące puste wiersze
to pozostałość po testach. Ale kod **nadal produkuje nowe**.

Najgroźniejsza aktywna ścieżka ma jawny komentarz w kodzie:

> `apps/web/lib/production/start-wo.ts:263` — *„When the WO has no site, site_id stays NULL"*

Zlecenie produkcyjne bez zakładu materializuje pozycje wyrobu bez zakładu.
Dalej `wo-state-machine.ts:237` propaguje to na zdarzenia. Trigger bazodanowy
`384-trigger-user-default-site.sql:93` robi `coalesce(linia, domyślny użytkownika,
domyślny organizacji)` i **przy pustym wyniku zwraca rekord** zamiast odmówić.

Do tego kilkanaście miejsc w historii palet przekazuje `lp.site_id` dalej bez odrzucenia
pustego (m.in. `complete-cancel-wo.ts:606`, `record-waste.ts:235`, `hold-actions.ts:1005`,
`ship-actions.ts:570`, `cancelShipment.ts:412`).

**Naprawa jednego miejsca niczego nie da — trzeba zamknąć źródło.** Pełna mapa ścieżek zapisu:
`RAPORT-PUSTY-ZAKLAD.md`.

## 7. Rozjazd uprawnień: 45 istnieje tylko w bazie, 4 tylko w kodzie — TEZA

Seed person wypisuje `[ADMIN PERMISSION DRIFT]`. Uprawnienia obecne wyłącznie w bazie to m.in.
`npd.project.create`, `settings.roles.manage`, `warehouse.lp.destroy`, `fa.create`, `fa.delete`.

Jeśli kod sprawdza uprawnienie, którego baza nie zna — bramka może **cicho nigdy nie trafiać**:
albo blokować wszystkich, albo nie blokować nikogo. Sprawdzane behawioralnie personami
`no_module_access` i `single_site_operator`.

## 8. Zachowanie ilości — 13 tez, w weryfikacji adwersarskiej

Pełna lista: `TEZY-ZACHOWANIE-ILOSCI.md`. Werdykty: `WERDYKTY-ZACHOWANIE-ILOSCI.md`.

**Nie traktuj tych tez jak błędów, dopóki nie mają werdyktu.** Powstały z czytania kodu bez
dostępu do bazy. Pierwsza z nich (rejestracja 103 kg wyrobu przy zużyciu 100 kg) już przy
pobieżnym czytaniu wygląda na **decyzję produktową**, nie błąd: testy jawnie asercjonują
sukces z ostrzeżeniem, a próg blokujący `block_pct` jest konfiguracją.

## 9. Poprawka strefy czasowej wdrożona w POŁOWIE miejsc — UDOWODNIONE

Wzorzec `expiredBySiteDaySql()` (liczy dobę w strefie **zakładu**) trafił do dwóch miejsc:
`lp-safety-guard.ts:46` i `scanner/movement.ts:747`. **Ścieżka wysyłkowa nadal liczy gołe
`current_date`** w czterech:

```
shipping/_actions/pick-actions.ts:68     and lp.expiry_date < current_date
shipping/_actions/ship-actions.ts:463    or (lp.expiry_date is not null and lp.expiry_date < current_date)
lib/shipping/pack-lp-into-box.ts:174     jw.
shipping/_actions/so-actions.ts:1398     and (lp.expiry_date is null or lp.expiry_date >= current_date)
```

Zmierzone na żywo w trakcie przebiegu przeglądarkowego:
```
wczoraj(zakład)= 2026-08-05   dziś(zakład)= 2026-08-06   ·   session current_date= 2026-08-05
```

Sesja bazy w `Europe/London`, zakład w `Europe/Warsaw`. Paleta przeterminowana według doby
zakładu **przechodzi bramkę wysyłkową**, choć bramka produkcyjna i skanera ją zatrzymują.
**Aplikacja ma dziś dwie różne granice doby.**

Waga: **POWAŻNY** — bramka bezpieczeństwa żywności. Wysłanie przeterminowanego towaru
do klienta jest zdarzeniem regulacyjnym.

To wzorzec, który znamy z kampanii: *naprawa pokrywa jeden przypadek i zamraża sąsiednie.*

## 10. Persona z ZEREM uprawnień czyta kartotekę produktową — UDOWODNIONE

| trasa | co widzi użytkownik bez żadnych uprawnień |
|---|---|
| `/en/technical/items` | **cała kartoteka indeksów — 42 pozycje** (12 surowców, 23 składniki, 2 wyroby) |
| `/en/settings/schema` | 18 definicji kolumn schematu organizacji |
| `/en/settings/sites` | 2 zakłady |
| `/en/planning/transfer-orders` | rejestr zleceń przesunięcia |

Dowód — ten sam ekran, trzy persony obok siebie:
```
no_module_access      → "Items … All 42 / Raw 12 / Ingredients 23 / FG 2"
single_site_operator  → identycznie (42)
harness (admin)       → identycznie (42) + przycisk "+ New item"
```

Przyczyna (`settings/schema/page.tsx:150-166`): zapytanie o uprawnienia **nie bramkuje
odczytu** — jego jedynym skutkiem jest podmiana etykiety roli na „Admin" albo „Operator".
Wiersze są pobierane bezwarunkowo.

**Zapisy są bronione poprawnie** — Create TO i Run MRP odrzucone, z kontrolą przeciwną
na adminie (admin tworzy, persona bez uprawnień dostaje odmowę i baza się nie zmienia).

Waga: **POWAŻNY** — to nie zapis, ale operator linii bez żadnych uprawnień czyta całą
kartotekę produktową i konfigurację organizacji.

**Teza o rozjeździe uprawnień — OBALONA.** Wszystkie **127** egzekwowanych uprawnień ma
przydzielenie w bazie. Enum `ALL_PERMISSIONS` jest **martwym katalogiem**, nie źródłem prawdy:
`has-permission.ts` porównuje surowe łańcuchy w SQL. Rozjazd to dług dokumentacyjny.

## 11. ⚠️ „Admin może" NIGDY nie dowodzi, że uprawnienie działa — UDOWODNIONE

```
apps/web/lib/auth/has-permission.ts:29-30
  r.code = any('{owner,admin,org_admin}')
```

Rola o kodzie `admin` przechodzi **każdą** bramkę niezależnie od `role_permissions`.

**Skutek metodyczny: każdy test uprawnień pisany na personie admina mierzy zero.** Zielony
wynik „admin może" jest zgodny zarówno ze światem, w którym uprawnienie jest poprawnie
zasiane, jak i z tym, w którym nie ma go wcale. To unieważnia część dotychczasowych „zieleni"
w tym repozytorium.

## 12. Job E2E w CI wykonuje 0 testów z 381 i melduje sukces — UDOWODNIONE

```
$ cd apps/web && pnpm exec playwright test 'e2e/**/*.spec.ts' --list
Total: 11 tests in 1 file
$ cd apps/web && pnpm exec playwright test 'e2e/**/*.spec.ts'
11 skipped
```

Trzy niezależne defekty nakładają się:
1. **`e2e/**/*.spec.ts` w bashu bez `globstar`** (domyślnie wyłączony na runnerach GitHuba)
   rozwija się do `e2e/*/*.spec.ts` = **wyłącznie 11 plików** z `e2e/settings/`.
   Sprawdzone: `set -- e2e/**/*.spec.ts; echo $#` → `11`.
2. `apps/web` **nie ma pliku konfiguracyjnego Playwrighta** — root `playwright.config.ts`
   nie jest ładowany.
3. Serwer CI stoi na porcie **3000**, a domyślny `baseURL` konfiguracji to **3100**.

**To jest czwarte wystąpienie „zieleni przez pominięcie" i najgroźniejsze,
bo dotyczy całej suity end-to-end.**

## 13. Suita UI — 3583 testy — nie wykonuje się nigdy — UDOWODNIONE

Skrypt `web:test` = `vitest run … && vitest run --config vitest.ui.config.ts`.
Suita node jest czerwona (97), więc **operator `&&` powoduje, że wszystkie 3583 testy UI
nie startują**. Tak samo w CI.

Uruchomiona osobno daje **3546 zielonych / 37 czerwonych**.

## 14. 39 plików melduje „pominięte", a NAPRAWDĘ PADA w `beforeAll` — UDOWODNIONE

vitest raportuje awarię hooka jako `skipped`, nie `failed`. To dlatego przeżył błąd krytyczny
w module wysyłek. Realne przyczyny (dryf schematu, dotknąłby też świeżej bazy CI):

`users.name NOT NULL` · `users.role_id NOT NULL` · brak ograniczenia pasującego do `ON CONFLICT`
(9 plików) · `work_orders.created_by_user` nie istnieje · `warehouses.warehouse_type NOT NULL` ·
`wo_outputs.transaction_id NOT NULL` · `npd_projects.name NOT NULL` · `operator does not exist: text = uuid`

W tym `generate-bol-ship-race.pg.test.ts` — **4 „pominięte", naprawdę: `null value in column
"warehouse_type"`**. To ten sam plik, o którym pisaliśmy 30 lipca.

## 15. Izolacja organizacji DZIAŁA — ale nie chroni jej ani jeden działający test

To najważniejszy wynik pozytywny nocy. Ponieważ **14 testów izolacji nie uruchamia się**
(patrz niżej), pomiar wykonano bezpośrednio na schemacie docelowym (migracja 564),
w transakcji z wycofaniem:

```
app_user: rolsuper=f, rolbypassrls=f
tabele public z kolumną org_id : 279
  RLS włączony                 : 279  (100 %)
  RLS wyłączony                :   0
```

Żywa próba wycieku (141 wierszy `sites` z ~30 organizacji), `app_user` z kontekstem org A:

| tabela | wierszy ogółem | widoczne dla org A | **wycieki** |
|---|---|---|---|
| sites | 141 | 3 | **0** |
| locations | 133 | 1 | **0** |
| roles | 3289 | 26 | **0** |
| unit_of_measure | 1215 | 9 | **0** |

Pięć prób obejścia, wszystkie odparte: `INSERT` z cudzym `org_id` → odmowa polityki ·
**`INSERT` do własnej organizacji → UDANY** (kontrola przeciwna, dowód nie-pustości asercji) ·
podmiana GUC-a na org B → widoczność bez zmian · sfałszowany token sesji → `28000` ·
brak kontekstu → 0 wierszy (fail-closed).

**Werdykt: nie znaleziono wycieku między organizacjami.**

Ale: **14 testów, które miały to udowadniać, nie uruchamia się od dawna.** Suita za flagą
`RLS_LIVE_TESTS` jest martwa **strukturalnie** — `new Function('specifier','return import(specifier)')`
nie działa pod module runnerem vitesta, więc padłaby **nawet w CI z Dockerem**.

Dwie flagi postawy (nie wyciek, ale warto): 3 tabele z `org_id` mają RLS **bez FORCE**
(właściciel omija RLS, a aplikacja ma pulę ownera); 11 tabel org-scoped nadal daje roli
`authenticated` pełne CRUD — regres wobec intencji migracji 051.

## 16. Realne defekty wyłuskane z czerwonych testów — DO WERYFIKACJI BEHAWIORALNEJ

| test | co mówi | ocena |
|---|---|---|
| `multi-write-transaction-contract` | **6 akcji z wieloma zapisami bez granicy transakcji**: `convertPlannedToWo` (5 zapisów), `splitLp`/`mergeLps` (7), `destroyLp` (3), `createStockMove` (2), `upsertReorderThreshold` (2) | **defekt** — ryzyko częściowego utrwalenia na paletach i MRP |
| `enforced-permissions` | 5 uprawnień egzekwowanych serwerowo **poza listą kontrolną** | **defekt** — dryf strażnika RBAC |
| `wave8-shipping-integrity` (7) | `cancelShipment … expected {ok:false,error:'not_found'}`; konwersja opakowań zwraca `undefined` | **defekt — P0 wysyłek z 30.07 NADAL NIE DZIAŁA** |
| `mwo-loto-signing` (4) | podwójny podpis LOTO nie tworzy parowanych wpisów; **sekwencja exploitu przechodzi** | **defekt bezpieczeństwa** |
| `production-site-visibility` | operator jednego zakładu widzi wiersz `wo_outputs` z zakładu B | **defekt** |
| `site-day` + `lp-expiry-site-day` (3) | granica doby wg strefy sesji | **defekt** — spójne z poz. 9 |

## 17. ODPOWIEDŹ NA „czy bugi z 30 lipca zostały wyeliminowane" — ZMIERZONE

32 znaleziska sprawdzone w kodzie, jedno po drugim:

| werdykt | ile |
|---|---|
| **naprawione częściowo** | **21** |
| naprawione | 7 |
| **nienaprawione** | **4** |

**Nie zostały tylko opisane — ale kampania jest daleka od zamknięcia.** Najczęstszy stan
to *„naprawiono przypadek główny, pozostawiono sąsiedni wariant"*. To wzorzec, który mamy
zapisany w `WZORCE-KAMPANII-NAPRAWCZEJ` — teraz **zmierzony na całej kampanii**.

Jak wygląda „połowa naprawy": `revalidatePath` — literalnych `/npd/` już zero, ale **zostały
cztery inne** bezskuteczne przez grupy tras · rewalidacja w transakcji — **78 wystąpień**
nadal wewnątrz callbacków · skaner między zakładami — zakład sprawdzany **tylko dla nie-NULL** ·
import 1/3 · spójność Auth↔DB 1/3 · skaner/GS1 2/6 · skala zapytań 2/8 · **integralność
danych 3/15**.

Pełna tabela: `WERYFIKACJA-ZNALEZISK-30-07.md`.

## 18. Towar znika z ewidencji — 10 z 13 tez POTWIERDZONYCH pomiarem

Tor adwersarski dostał polecenie **obalać**. Napisał 18 sond, **18 wykonanych**, każda
z pomiarem stanu bazy przed i po. Nie udało mu się prawie nigdzie.

| operacja | pomiar |
|---|---|
| anulowanie wysyłki | paleta 10→4→**10**, w księdze **nadal tylko `issue +6`** |
| anulowanie zakończonego zlecenia | paleta 100→**0, `destroyed`**, jedyny ruch to `receipt +100` |
| unieważnienie straty | po `ok:true` paleta **nadal 6 kg** (było 10), strata netto **zero** |
| odwrócenie konsumpcji | księga zapisuje `consume_to_wo **+4**` — **odwrócony znak** |
| konsumpcja i odpad bez palety | paleta nietknięta, `stock_moves` **puste**, logi zapisane |
| wyrób zastępczy | `wo_outputs +8` z pustym `lp_id` — **osiem kilogramów tylko na papierze** |

**Sprostowanie mojego wczorajszego osądu:** twierdziłem, że rejestracja 103 kg przy zużyciu
100 kg to prawdopodobnie decyzja produktowa. **Miałem rację co do połowy.** Po ustawieniu progu
`massbalance_threshold_pct = 1` operacja rzuca `insufficient_input_for_output` — bramka działa,
jest domyślnie wyłączona. **Ale wyrób 100 kg przy ZEROWYM zużyciu przechodzi nawet z włączonym
progiem**, bo bramka zwraca `undefined` przy zerowej konsumpcji. To jest realny błąd.

Poza listą: **cały moduł zwrotów RMA jest martwy** (`shipping.rma.*` nie istnieje
w `outbox_events_event_type_check` ani w wyliczeniu zdarzeń) · **demontaż wieloproduktowy
jest strukturalnie niewykonalny**.

Pełne werdykty: `WERDYKTY-ZACHOWANIE-ILOSCI.md`. Sondy: `probes/`.

## 19. Dezaktywacja pracownika nie odbiera dostępu — UDOWODNIONE z kodu

SCIM przy `active=false` ustawia **wyłącznie** `deleted_at`
(`api/scim/v2/Users/[id]/route.ts:184`). Główna bramka **wszystkich akcji serwerowych**
sprawdza **wyłącznie** `is_active` (`lib/auth/with-org-context.ts:243`). Bramka skanera
(`lib/scanner/auth.ts:15`) tak samo.

**Pracownik usunięty z katalogu firmowego, mając ważną sesję, nadal wykonuje operacje.**

Test SCIM sprawdza tylko, czy kolumna została ustawiona — **nie próbuje wykonać autoryzowanej
operacji po usunięciu**. To dokładnie ta luka, która pozwoliła defektowi przeżyć.

Architektonicznie: repo używa **trzech konwencji** kasowania miękkiego (`deleted_at`,
`voided_at`, `deactivated_at`+`active`) bez wspólnego mechanizmu filtrowania.

## 20. CI nie było zielone ani razu od ponad miesiąca — UDOWODNIONE

```
gh run list --branch main --status success  →  []
200 przebiegów od 3 lipca · 192 nieudane · ZERO zielonych
```

Trzy niezależne awarie nakładają się:

- **Migracja 051 zabija bazodanową połowę CI od 3 czerwca.** Robi
  `revoke ... from public, anon, authenticated`, a `anon`/`authenticated` to role **Supabase** —
  w gołym `postgres:16-alpine` ich nie ma. `vitest`, `migration-check` i `playwright` padają
  **przed uruchomieniem czegokolwiek**. Dwa miesiące zerowego sygnału.
- **`rhysd/actionlint@v1` w ogóle nie jest GitHub Action** — brak manifestu (tag 404, gałąź 404,
  `action.yml` 404). Job `lint-workflows` **nie przelintował nigdy ani jednego pliku**.
  Naprawione; actionlint od razu znalazł prawdziwy błąd w `ci.yml:201`.
- **Bramka driftu schematu zamrożona na migracji 281.** Baseline z 11 czerwca; od tego czasu
  **240 migracji jest dla niej niewidzialnych**. To baza z identyfikowalnością żywności.

**To domyka pytanie, dlaczego bloker builda przeżył tydzień:** job `build` jest **pomijany**,
bo zależy od `lint` i `typecheck`. Nigdy się nie uruchomił.

---

# CZĘŚĆ III — NARZĘDZIA, KTÓRE KŁAMIĄ

Lista z 30 lipca miała pięć pozycji. Tej nocy doszły trzy.

| komenda | fałszywy wynik | dlaczego |
|---|---|---|
| `pgrep -f 'codex exec'` | „6 torów żyje", gdy nie żył żaden | dopasowuje własną powłokę |
| `ls <katalog>` | pusto, choć są pliki | przechwytuje hook rtk |
| `wc -l < plik` | `0` dla pliku z 50 liniami | jw. |
| `grep` bez `-a` | „nikt nie pisze do tabeli", a zapis był w linii 481 | plik uznany za **binarny** |
| `rtk grep` z `> plik` | nadpisuje plik własnym podsumowaniem | wrapper wypisuje raport, nie wynik |
| **`test-db.sh clone`** | **kod 0, a nie sklonowało niczego** | przewraca się na migracji, kod powrotu bierze się z ostatniej instrukcji potoku |
| **`find -newermt "<data>"`** | **pustka, choć pliki istnieją** | predykat cicho nie dopasowuje |
| **kod powrotu polecenia w tle** | **„exit code 0" przy nieudanej migracji** | RC bierze się z ostatniej komendy łańcucha, nie z tej, która zawiodła |

**Wniosek metodyczny:** w tym repozytorium żadnej komendy nie wolno przyjmować na słowo.
Każde „zielone" musi mieć kontrolę przeciwną — dowód, że gdy warunek jest niespełniony,
wynik jest czerwony.

---

*Dokument uzupełniany w trakcie nocy. Ostatnia aktualizacja: 02:30.*
