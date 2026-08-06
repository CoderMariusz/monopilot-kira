# C1 — Wydajność bazy danych (audyt 2026-08-06)

**Baza pomiarowa:** `monopilot_ver` (lokalny Postgres 16, pełny schemat repo, migracja 564)
**Skala zasiewu:** 30 000 `stock_moves` + 120 000 `lp_state_history` = 150 000 wierszy, jedna organizacja, jeden zakład
**Metoda:** `explain (analyze, buffers)` w roli `app_user` z ustawionym kontekstem org — czyli z włączonym RLS, dokładnie jak działa aplikacja
**Raport CZĘŚCIOWY** — patrz sekcja „Czego nie zdążyłem" na końcu.

---

## Ostrzeżenie, bez którego liczby wprowadzą w błąd

Produkcja stoi na migracji **544**, repo ma **564**.

- Funkcja `app.user_site_scope_unrestricted()` **na produkcji nie istnieje**.
- Polityki RLS widoczności zakładów (migracje 551 i 563) **dziś na produkcji nie chodzą**.
- Wszystkie moje pomiary opisują stan **PO wdrożeniu** 545-564, a nie dzisiejszy koszt produkcyjny.

Druga rzecz: **`stock_moves` i `lp_state_history` mają na tym klonie 0 wierszy przed zasiewem.**
Zasiałem je do 150 000, bo tyle wynosiła skala, na której mierzono migrację 563. Nie wiem, ile
wierszy ma produkcja. Wszystko poniżej to zatem **prognoza wyskalowana liczbą wierszy** —
podaję przy każdej pozycji, przy jakiej skali problem zaczyna boleć.

Sprawdziłem też, czy nie zgłaszam czegoś, co już czeka w niewdrożonych migracjach:
**migracje 545-564 nie dodają ani jednego indeksu wydajnościowego** (jedyne dwa `create index`
to ograniczenia unikalności w 564 — numer reklamacji i numer kartonu). Moje pozycje niczego
nie dublują.

---

## Podsumowanie jednym akapitem

Migracja 563 znalazła i naprawiła **jeden** predykat RLS wykonywany raz na wiersz
(`app.user_can_see_site(site_id)`). **Ten sam błąd występuje w drugim, dużo powszechniejszym
miejscu i nikt go nie ruszył:** `app.current_org_id()` w **307 politykach RLS** i w
**3 651 miejscach w kodzie aplikacji**. Ta funkcja robi JOIN dwóch tabel i kosztuje 3 bufory
na wywołanie. W planie z sekwencyjnym skanem jest wywoływana **raz na wiersz**.
Zmierzone: ekran Ruchów Magazynowych przy 150 000 wierszy **1 545 ms → 163 ms**,
bufory **905 443 → 4 079**.

---

## Pozycje, uszeregowane wg zmierzonego zysku

### C1-1 — `app.current_org_id()` wykonuje się raz na wiersz w 307 politykach RLS

| pole | treść |
|---|---|
| **co** | Każda z 307 polityk RLS ma predykat `org_id = app.current_org_id()`. Funkcja jest `stable`, ale gołe wywołanie w warunku planer wykonuje raz na sprawdzany wiersz, a nie raz na zapytanie. Owinięcie w `(select ...)` zamienia je w InitPlan liczony raz. |
| **gdzie** | 307 polityk `*_org_context` w katalogu bazy; wzorzec pochodzi z `packages/db/migrations/383-user-site-visibility-rls.sql` i jest kopiowany dalej. Definicja funkcji: `packages/db/migrations/561-rls-context-functions-stable.sql`. |
| **dowód** | patrz niżej |
| **korzyść** | −44% czasu i −50% odczytów buforów na **każdym** ekranie listowym w systemie; jedna migracja, zero zmian w kodzie aplikacji |
| **koszt** | **M** — migracja przepisująca 307 polityk sterowana katalogiem (wzorzec gotowy w mig 563) + post-check równoważności |
| **ryzyko** | To predykat bezpieczeństwa. `(select f())` musi decydować identycznie — decyduje, bo `app.current_org_id()` jest stałe w obrębie transakcji (wiąże się przez `txid_current_if_assigned()`, patrz ciało funkcji). Mimo to migracja **musi** mieć post-check wykonujący oba warianty, jak mig 563. Druga rzecz do sprawdzenia: polityki `with check` przy zapisach. |
| **zależy od** | — |

**Dowód 1 — koszt samej funkcji, w izolacji** (`monopilot_ver`, rola `app_user`, kontekst org ustawiony):

```
select count(app.current_org_id())    from generate_series(1,10000);
  → Buffers: shared hit=30183     Execution Time: 76.571 ms
select count((select app.current_org_id())) from generate_series(1,10000);
  → Buffers: shared hit=6         Execution Time:  0.763 ms
```

3 bufory i ~7,7 µs na wywołanie × liczba wierszy. Owinięcie: **100× szybciej, 5 000× mniej buforów.**

**Dowód 2 — realny ekran.** Zapytanie skopiowane 1:1 z
`apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:58-109` (`UNIFIED_MOVEMENTS_CTE`)
i `:159-166` (strona 1). 150 000 wierszy, `limit 25`. Mediana z 6 przebiegów; bufory są deterministyczne:

| wariant | strona 1 (limit 25) | bufory | COUNT(*) |
|---|---|---|---|
| 0 — stan repo | **1 545 ms** | **905 443** | 1 557 ms |
| 1 — tylko polityki RLS w `(select ...)` | **867 ms** | **454 079** | 869 ms |
| 2 — polityki RLS **i** SQL aplikacji | **163 ms** | **4 079** | 166 ms |

Ślad z planu wariantu 0 — funkcja siedzi w `Filter`, wywoływana 120 000 razy:

```
->  Seq Scan on lp_state_history h  (actual time=0.374..1092.334 rows=120000 loops=1)
      Filter: ((site_id IS NOT NULL) AND (site_id = '...'::uuid) AND ($4 OR (site_id = ANY ($5)))
               AND (org_id = app.current_org_id()) AND (org_id = app.current_org_id()))
      Buffers: shared hit=722698          <-- 6,02 bufora na wiersz
```

Dla porównania ten sam węzeł w wariancie 2:

```
->  Seq Scan on lp_state_history h  (actual time=0.232..14.588 rows=120000 loops=1)
      Filter: ((site_id IS NOT NULL) AND (org_id = $14) AND (site_id = '...'::uuid) ...)
      Buffers: shared hit=2692
```

`$14` to InitPlan — jedno wywołanie na całe zapytanie. **1 092 ms → 14,6 ms na jednym węźle.**

**Kiedy boli:** liniowo z liczbą wierszy skanowanych sekwencyjnie. Przy 10 000 wierszy to ~100 ms
narzutu — niezauważalne. Przy 150 000 to 1,4 s. Przy milionie `stock_moves` to ~9 s na jedno
odświeżenie ekranu.

---

### C1-2 — to samo w SQL aplikacji: 3 651 gołych `app.current_org_id()`

| pole | treść |
|---|---|
| **co** | Kod aplikacji dopisuje własny `where x.org_id = app.current_org_id()` obok predykatu RLS. Ten sam koszt raz na wiersz, drugi raz. |
| **gdzie** | 3 651 wystąpień w 810 plikach `.ts`/`.tsx` w `apps/web` i `packages`. Reprezentatywny: `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:74,75,76,77,105,106,107` — **siedem** wywołań w jednym zapytaniu. |
| **dowód** | wariant 1 → 2 w tabeli wyżej: **867 ms → 163 ms**, bufory **454 079 → 4 079** (111×). Sama zmiana polityk RLS (C1-1) daje tylko połowę zysku, bo druga połowa siedzi w SQL aplikacji. |
| **korzyść** | druga połowa efektu; dopiero C1-1 **i** C1-2 razem dają 1 545 ms → 163 ms |
| **koszt** | **L** — 3 651 miejsc, ale zmiana czysto mechaniczna: `app.current_org_id()` → `(select app.current_org_id())` wewnątrz literałów SQL. Da się zrobić skryptem + lint blokujący nawrót. |
| **ryzyko** | Niskie funkcjonalnie (identyczna wartość), ale **duży diff w wielu plikach naraz** → ryzyko konfliktów z równoległymi falami i przypadkowego trafienia w łańcuch znaków, który nie jest SQL-em. Wymaga lintu, nie sed-a na ślepo. |
| **zależy od** | najlepiej po C1-1 (żeby zmierzyć każdą połowę osobno) |

**Wariant tańszy, który zmierzyłem:** zamiast przepisywać SQL aplikacji — **usunąć** z niego
duplikat `org_id = app.current_org_id()`, bo polityka RLS i tak go wymusza (pula aplikacji łączy się
jako `app_user`, `apps/web/lib/auth/with-org-context.ts:144-152`). Wynik: **154 ms / 4 037 buforów**,
czyli tyle samo co wariant 2.
**Nie rekomenduję tego bez decyzji właściciela** — duplikat jest drugą warstwą obrony przed
wyciekiem między organizacjami i usunięcie go zamienia zmianę wydajnościową w zmianę
bezpieczeństwa. Podaję liczbę, żeby decyzja była świadoma.

---

### C1-3 — trzy polityki widoczności zakładu zostały w starym kształcie

| pole | treść |
|---|---|
| **co** | Migracja 563 przepisała 10 polityk z per-wierszowego `app.user_can_see_site(site_id)` na wersję z InitPlan. Trzy polityki dodane migracją 551 zostały w starym kształcie na tym klonie. |
| **gdzie** | `wo_outputs.wo_outputs_site_visibility`, `wo_events.wo_events_site_visibility`, `downtime_events.downtime_events_site_visibility` — utworzone w `packages/db/migrations/551-production-site-visibility-rls.sql:6-31` |
| **dowód** | ```select polrelid::regclass, polname from pg_policy where pg_get_expr(polqual,polrelid) = 'app.user_can_see_site(site_id)';``` → 3 wiersze na `monopilot_ver`. Ponowne uruchomienie mig 563 w transakcji: `NOTICE: mig563: rewrote 3 site-visibility policies`. |
| **korzyść** | te trzy tabele to gorące tabele produkcyjne (wyjścia z WO, zdarzenia WO, przestoje); koszt predykatu to trzy podzapytania i `security definer` na wiersz — mig 563 zmierzyła to jako 10 995 ms → 90,9 ms przy 150 000 wierszy |
| **koszt** | **S** |
| **ryzyko** | niskie — kod naprawy istnieje i jest sprawdzony (blok `do $$` z mig 563 jest sterowany katalogiem, wystarczy go powtórzyć) |
| **zależy od** | — |

**Uczciwe zastrzeżenie:** to najprawdopodobniej **artefakt tego klonu**, nie wada kodu.
Przy czystym przebiegu migracji w kolejności 551 → 563 blok z 563 łapie wszystkie 13 polityk.
Nie ustaliłem, jak `monopilot_ver` doszedł do stanu, w którym 3 zostały pominięte.
**Co z tego wynika mimo wszystko:** po wdrożeniu 545-564 na produkcję trzeba **sprawdzić
katalogiem**, że zapytanie wyżej zwraca zero wierszy — i **nie ma dziś żadnego strażnika**,
który by to wymuszał ani powstrzymał migrację 565 przed napisaniem predykatu w starym kształcie
(wzorzec do skopiowania nadal leży w 551).

**Efekt uboczny, którego szukałem gdzie indziej, a znalazłem tutaj:** post-check migracji 563
**wywala się na tej bazie**:

```
ERROR: mig563: restricted probe never produced a hidden site — assertion is vacuous
CONTEXT: PL/pgSQL function inline_code_block line 90 at RAISE
```

Sonda „ograniczonej gałęzi" zakłada, że po skasowaniu ról użytkownika i przypisaniu go do
jednego zakładu drugi zakład stanie się niewidoczny. Na `monopilot_ver` tak się nie dzieje.
To **blokada wdrożenia**, nie wydajność — zgłaszam, bo trafiłem na to przy weryfikacji.
Poza moim zakresem; przekazać torowi migracyjnemu.

---

### C1-4 — 103 indeksy redundantne (prefiks szerszego indeksu na tej samej tabeli)

| pole | treść |
|---|---|
| **co** | 103 indeksy w 94 tabelach są ścisłym prefiksem innego indeksu na tej samej tabeli, z tym samym warunkiem częściowym. Postgres użyje szerszego do wszystkiego, do czego użyłby węższego. Kosztują tylko przy zapisie. |
| **gdzie** | m.in. `stock_moves.stock_moves_org_idx` (prefiks `stock_moves_org_site_idx`, `stock_moves_lp_idx`, `stock_moves_move_type_idx`), `lp_state_history.lp_state_history_org_idx`, `customers.customers_org_idx`, `grns.grns_org_idx`, `finance_outbox_events.finance_outbox_events_org_idx` — pełna lista zapytaniem niżej |
| **dowód** | zapytanie katalogowe, **bez** oparcia o statystyki użycia (patrz zastrzeżenie): |
| **korzyść** | −103 operacje utrzymania indeksu na każdy `insert`/`update` w tych tabelach; na `stock_moves` z 9 indeksami to −1 z 9 |
| **koszt** | **S** na indeks, **M** na całość (jedna migracja `drop index`) |
| **ryzyko** | Niskie, ale **nie zerowe**: indeks węższy bywa tańszy przy skanie zakresu (mniej stron). Przed skasowaniem warto potwierdzić, że planer nie wybiera węższego w żadnym z gorących zapytań. |
| **zależy od** | — |

```sql
with idx as (
  select indrelid::regclass::text tbl, indexrelid::regclass::text idx,
         indkey::text keys, indisunique u, pg_get_expr(indpred, indrelid) pred
    from pg_index i join pg_class c on c.oid = i.indexrelid
   where c.relnamespace = 'public'::regnamespace)
select distinct a.tbl, a.idx as zbedny, b.idx as pokryty_przez
  from idx a join idx b on a.tbl = b.tbl and a.idx <> b.idx
   and b.keys like a.keys || '%' and length(b.keys) > length(a.keys)
   and coalesce(a.pred,'') = coalesce(b.pred,'') and not a.u
 order by 1;
-- 103 wiersze, 94 tabele
```

**Dlaczego nie użyłem `pg_stat_user_indexes`:** na tym klonie `idx_scan` odzwierciedla przebiegi
harnessu testowego, nie produkcję. Lista „indeksów nigdy nieużytych" z klonu jest **bezwartościowa**
i celowo jej nie zgłaszam. Redundancja prefiksowa jest dowiedziona z samego katalogu i nie
wymaga statystyk — dlatego zgłaszam tylko ją. **Lista indeksów nieużywanych: nie sprawdzone**,
wymaga `pg_stat_user_indexes` z produkcji.

---

### C1-5 — CTE `unified` nie jest wstawiane w miejsce; 150 000 szerokich wierszy ląduje w pliku tymczasowym

| pole | treść |
|---|---|
| **co** | CTE `unified` na ekranie Ruchów Magazynowych nie jest inline'owane. Cały wynik (150 000 wierszy, 360 bajtów szerokości) trafia do tuplestore, dopiero potem idzie sortowanie i `limit 25`. |
| **gdzie** | `apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/stock-move-actions.ts:58` (`UNIFIED_MOVEMENTS_CTE`) |
| **dowód** | `-> CTE Scan on unified (actual time=2.663..230.423 rows=150000) Buffers: shared hit=4073, temp written=3395` — **3 395 bloków = ~27 MB zapisu tymczasowego na jedno wyświetlenie strony**, przy zwracanych 25 wierszach |
| **korzyść** | po naprawie C1-1+C1-2 zostaje 163 ms, z czego sortowanie po `CTE Scan` to ~230 ms→ to jest teraz dominujący składnik. Plan z `MergeAppend` (`limit 25` schodzi do gałęzi) obciąłby to do odczytu ~25 wierszy. |
| **koszt** | **M** |
| **ryzyko** | Blokerem jest `order by move_date desc, id desc`, gdzie `id` to **`sm.id::text`** i `h.id::text` (linie 61 i 83) — rzutowanie na tekst zabija porządek indeksowy (kolacja tekstu ≠ porządek uuid). Zmiana sortowania na surowy `uuid` **zmienia kolejność wyników przy równych znacznikach czasu** — widoczne dla użytkownika, więc wymaga decyzji, nie tylko refaktoru. |
| **zależy od** | C1-1, C1-2 (przed nimi ta pozycja jest niemierzalna — ginie w szumie) |

Migracja 563 stwierdziła, że „dodanie indeksów (org_id, site_id, ts) nie pomaga, bo planer ich
nie wybiera". **To prawda dla obecnego kształtu zapytania** i moje pomiary to potwierdzają.
Powód nie leży jednak w indeksach, tylko w `id::text` w kluczu sortowania — dopóki on tam jest,
`MergeAppend` jest niemożliwy. Nie mierzyłem wariantu z sortowaniem po `uuid`: **nie sprawdzone.**

---

### C1-6 — klucze obce bez indeksu (prognoza, dziś nie boli)

| pole | treść |
|---|---|
| **co** | 40+ ograniczeń klucza obcego nie ma indeksu, którego prefiksem byłyby kolumny klucza. Kosztuje przy `delete`/`update` na tabeli nadrzędnej (skan potomnej) i przy złączeniach po tej kolumnie. |
| **gdzie** | m.in. `bom_lines.item_id`, `bom_lines.substitute_item_id`, `bom_headers.npd_project_id`, `locations.parent_id`, `user_roles.role_id`, `items.created_by`, `supplier_specs.supplier_id` |
| **dowód** | zapytanie katalogowe po `pg_constraint` × `pg_index` (w treści raportu wyżej w historii sesji); największa dotknięta tabela ma **2 736 wierszy** na tym klonie |
| **korzyść** | żadna mierzalna dzisiaj |
| **koszt** | **S** za sztukę |
| **ryzyko** | Dodanie 40 indeksów „na wszelki wypadek" **pogarsza** zapis i jest sprzeczne z C1-4. |
| **zależy od** | — |

**Rekomendacja: NIE robić tego teraz.** Te tabele mają setki wierszy. Pozycja istnieje po to,
żeby ktoś jej nie zgłosił drugi raz jako odkrycia. Wracać do niej dopiero, gdy któraś z tych
tabel przekroczy ~100 000 wierszy **i** profil produkcyjny pokaże skan sekwencyjny.

---

## Sprawdzone i szybkie — tu problemu nie ma

| co sprawdziłem | wynik |
|---|---|
| **Przycinanie partycji `audit_log`** (33 partycje, `range (occurred_at)`) | **DZIAŁA.** Zapytanie ekranu (`audit-log-loader.ts:183-184`, `occurred_at between $1 and $2`) daje `Append` dotykający **2 z 33** partycji, 0,74 ms. Filtr po dacie jest parametrem — działa przycinanie w czasie wykonania. Bez zastrzeżeń. |
| **Kontrola uprawnień na każde żądanie** (`apps/web/lib/auth/has-permission.ts:16-39`) | **W PORZĄDKU.** Mimo 387 522 wierszy w `role_permissions` i 5 598 w `roles`: **140 buforów**, poniżej 1 ms. `role_permissions_pkey (role_id, permission)` pokrywa złączenie, `Seq Scan on roles` w planie ma status `never executed`. |
| **Migracja 561** (`current_org_id`/`current_user_id` → `stable`) | **Zrobiona i słuszna.** Bez `stable` wariant `(select ...)` z C1-1 w ogóle by nie zadziałał — 561 jest warunkiem koniecznym C1-1, nie duplikatem. |
| **Migracja 563** — 10 polityk widoczności zakładu | **Przepisane poprawnie**, `(select app.user_site_scope_unrestricted())` widoczne jako InitPlan w planach. Zostały 3 (C1-3). |
| **Pozostałe kształty predykatów RLS** — przejrzałem wszystkie 409 polityk | 307 × `org_id = app.current_org_id()` (C1-1) · 10 × nowy kształt po 563 · 3 × stary kształt (C1-3) · 4 × `user_id in (select … from users)` — podzapytanie nieskorelowane, planer robi z tego hash raz na zapytanie, **OK** · ~8 × skorelowany `exists (select 1 from rodzic where rodzic.id = dziecko.rodzic_id …)` (`formulation_calc_cache`, `costing_waterfall_steps`, `bom_co_products`, `formulation_versions`, `scim_group_members`, `tenant_idp_config`) — planer zamienia je na półzłączenie, **nie jest to kształt per-wierszowy**, OK · 28 polityk bez `using` (tylko `with check`) |
| **Czy „brakujące" indeksy nie czekają w migracjach 545-564** | **Nie czekają.** Te migracje dodają dokładnie 2 indeksy, oba to unikalności biznesowe w 564. Żadnego indeksu wydajnościowego. |
| **Odczyty `audit_log` w kodzie** | 12 miejsc, wszystkie z przedziałem po `occurred_at` albo z `resource_id = $n`. Bez zastrzeżeń. |

---

## Propozycja fal (kryterium: korzyść ÷ ryzyko)

**Fala 1 — jedna migracja, największy zysk na ryzyko**
- **C1-1** — 307 polityk RLS na `(select app.current_org_id())`, wzorzec sterowany katalogiem skopiowany z mig 563, z post-checkiem równoważności.
- **C1-3** — dorzucić do tej samej migracji ponowne uruchomienie bloku z 563 (łapie 3 pozostałe) **plus strażnik**: `do $$ ... raise exception` gdy jakakolwiek polityka wraca do starego kształtu. Wtedy migracja 565 nie może cofnąć 563.
- Zysk: **−44% czasu, −50% buforów** na każdym ekranie listowym. Zero zmian w kodzie aplikacji.
- Dlaczego pierwsza: cały zysk siedzi w jednym pliku, który da się w całości zweryfikować post-checkiem w tej samej transakcji.

**Fala 2 — mechaniczna, duża, ale nudna**
- **C1-2** — 3 651 wystąpień w SQL aplikacji + reguła lintu blokująca nawrót (repo ma już `scripts/lint-use-server-exports.mjs` jako wzorzec własnego lintu).
- Zysk: druga połowa — dopiero po tej fali jest **1 545 ms → 163 ms**.
- Dlaczego druga: diff dotyka 810 plików, więc musi iść osobno od czegokolwiek innego.

**Fala 3 — sprzątanie, mierzalne dopiero po produkcji**
- **C1-4** — 103 redundantne indeksy, po potwierdzeniu na profilu produkcyjnym.
- **C1-5** — sortowanie po `uuid` zamiast `id::text` + `MergeAppend` na ekranie Ruchów Magazynowych, o ile właściciel zgodzi się na zmianę kolejności przy równych znacznikach czasu.
- **C1-6** — nie robić. Wrócić przy 100 000 wierszy.

**Poza falami, do tora migracyjnego:** post-check migracji 563 wywala się na bazie o kształcie
`monopilot_ver` („restricted probe never produced a hidden site"). To blokada wdrożenia 545-564.

---

## Czego nie zdążyłem

- **Wzorce N+1 w kodzie** — zlecone równolegle, nie wróciło przed końcem budżetu. Punkt 1 zlecenia
  (helper konwersji jednostek `async` = jedno zapytanie na pozycję i analogiczne przypadki)
  **pozostaje niesprawdzony przeze mnie**.
- **Zapytania bez `limit`** na rosnących tabelach — jw., zlecone, nie wróciło.
- **Indeksy nieużywane** — celowo pominięte, bo `pg_stat_user_indexes` z klonu odzwierciedla
  harness testowy. Wymaga zrzutu statystyk **z produkcji**; to jedno zapytanie tylko do odczytu.
- **Wariant `MergeAppend`** dla C1-5 — nie zmierzony.
- **Ekrany inne niż Ruchy Magazynowe.** Zmierzyłem jeden ekran do dna, bo znalezisko C1-1 jest
  systemowe (307 polityk) i pojedynczy dowód wystarcza, żeby je uzasadnić. Ale **nie wiem,
  który ekran jest najwolniejszy** — do tego trzeba `pg_stat_statements` z produkcji.
- **Skala produkcyjna** — nie znam liczby wierszy w `stock_moves`, `lp_state_history`, `audit_log`
  na produkcji. Wszystkie liczby są z zasiewu 150 000.

---

## Odtworzenie pomiarów

Dane zasiewu zostały w `monopilot_ver` (org `00000000-0000-0000-0000-000000000002`,
zakład `1cd96965-59dd-4434-ba77-6c2fd8c1cd10`). Usunięcie:

```sql
delete from lp_state_history where lp_id = '00000c11-0000-4000-8000-000000000003';
delete from stock_moves      where lp_id = '00000c11-0000-4000-8000-000000000003';
delete from license_plates   where id    = '00000c11-0000-4000-8000-000000000003';
delete from locations        where id    = '00000c11-0000-4000-8000-000000000002';
delete from warehouses       where id    = '00000c11-0000-4000-8000-000000000001';
delete from app.session_org_contexts where session_token = '00000c11-0000-4000-8000-0000000000c1';
```

W repozytorium **nie zmieniłem ani jednego pliku** poza tym raportem. Wszystkie sondy
(`alter policy`) biegły w transakcji zakończonej `rollback` — katalog `monopilot_ver`
jest w stanie sprzed pomiarów.
