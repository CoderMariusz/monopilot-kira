# FALA 4 — rejestr znalezisk cross-review (arbitraż orchestratora)

Legenda: **[F]** = do naprawy w tej fali · **[R]** = tylko korekta raportu · **[N]** = poza zakresem, do backlogu

## Recenzja T1 (BOM lifecycle) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T1-1 | P1 | `Save version` gubi **współprodukty** i resetuje **yield do 100 %** — `VersionSaveModal` nie przekazuje `context.coProducts` ani `context.yieldPct` | **[F]** — zweryfikowałem: **defekt ZASTANY**, nie regresja fali (linie istnieją w `HEAD`). Naprawiam mimo to: to cicha utrata receptury, a poprawka to przekazanie dwóch propów już obecnych w kontekście |
| T1-2 | P1 | Ślad audytowy zapisuje `status:'draft'` także po ścieżce `in_review`, **a outbox dostaje drugi, sprzeczny event** (DB emituje `bom.version_submitted`, aplikacja dokłada `draft`) | **[F]** — potwierdza samozgłoszenie autora i idzie dalej. Audyt kłamiący o statusie jest gorszy niż oryginalne znalezisko |
| T1-3 | P1 | Dwa nowe testy **nie ładują modułów** — import do nieistniejącego `_lib/_lib/…`, JSON o jeden `../` za płytko | **[F]** — testy nigdy nie działały; dokładnie pułapka „self-declared green" |
| T1-4 | P2 | `newEditableDraftNotice` = **martwy klucz**, `VersionSaveModal` go nie renderuje | **[F]** — podpiąć (plik zwolniony przez T2) |
| T1-5 | P2 | Nowe klucze `*Blocked*` w `ro`/`uk` zostały **po angielsku** | **[F]** — potwierdziłem niezależnie: `addComponentBlocked*`, `approveBlocked` bajt w bajt jak `en`, podczas gdy sąsiednie stare klucze są przetłumaczone |
| T1-6 | P2 | Tabela w raporcie mówi `draft → Delete ✅` bezwarunkowo; serwer wymaga też `versionCount > 1` i `snapshotCount = 0` | **[F]** — **poprawka do poprawki**: fix na „UI obiecuje to, czego serwer odmawia" sam obiecuje to, czego serwer odmawia. Dodatkowo **T5 sprawia, że snapshotów będzie WIĘCEJ** → interakcja torów |

## Recenzja T5 (snapshot przy tworzeniu WO) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T5-1 | P1 | Błąd snapshotu **zostawia osierocony nagłówek WO** — `withOrgContext` COMMIT-uje przy zwykłym `return`, więc `{ok:false}` **nie cofa** transakcji. Raport autora twierdził, że cofa | **[F]** — najgroźniejsze. WO bez snapshotu, materiałów, harmonogramu i historii statusu |
| T5-2 | P1 | Ostrzeżenie `no_active_bom` jest **martwe w UI** — modal ustawia je i natychmiast się zamyka, rodzic ignoruje `result.warning` | **[F]** — znów klasa „martwy kod udający naprawę" |
| T5-3 | P1 | Drugi planowany WO tego samego BOM-u fałszywie `closed` — status liczony z „najnowszego snapshotu", bez czytania stanu WO | **[F]** |
| T5-4 | P1 | Idempotencja snapshotu **nie jest bezpieczna współbieżnie** — SELECT-then-INSERT bez UNIQUE | **[F]** + migracja 524. **Zweryfikowałem na prodzie: 0 duplikatów, 0 `work_order_id IS NULL`, 7 wierszy → UNIQUE da się dodać** |
| T5-5 | P2 | Dwa nowe testy są **zielone także przed naprawą** (łamią RED) | **[F]** |

## Recenzja T4 (FactorySpec) — Codex, werdykt FIX-FIRST, bez P0/P1
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T4-1 | P2 | Raport klasyfikuje parowanie BOM jako niedostępne dla autora — **błędnie**: całe authoring i tak wymaga `canApproveFactorySpec`, więc user bez niego jest widzem, nie autorem | **[R]** — korekta inwentarza; zdejmuję to z listy „realna luka" dla kolejnej fali |
| T4-2 | P2 | Test podstawia gotowy `href` jako prop zamiast ćwiczyć jego budowę w `page.tsx` — gdyby `page.tsx` zgubił `/{locale}`, testy dalej przechodzą | **[F]** — test graniczny dla ≥2 locale |

## Recenzja T3a (routing: kolejność + ułamkowy setup) — Codex, werdykt FIX-FIRST
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T3a-1 | **P1** | **Post-check migracji 523 wywróciłby deploy.** Probe bierze **dowolny** wiersz (`limit 1` bez `order by`), a trigger `routing_operations_guard_locked_routing` (mig 496) odrzuca UPDATE operacji routingu `approved`/`active`/`superseded` → `23514` jest re-raise'owany → **cała migracja rollback** | **[F]** — **POTWIERDZIŁEM DOWODEM**, patrz niżej |
| T3a-2 | **P1** | **Brakująca SZÓSTA warstwa — ścieżka ODCZYTU.** `setup_time_min` idzie do `jsonb_build_object` jako liczba, sterownik parsuje JSONB przez `JSON.parse`, kod robi jeszcze `Number(...)`. Zapis naprawiono na string, odczytu nie | **[F]** — samo otwarcie i zapisanie draftu **utrwala zaokrągloną wartość**. Klasa „ekran ≠ baza" |
| T3a-3 | **P1** | **Snapshot schematu + blokujący gate CI.** `packages/db/__expected__/schema.sql` dalej deklaruje `setup_time_min integer`, a CI odpala blokujące `@monopilot/db check:drift`. Raport twierdził, że „nikt tego nie egzekwuje" — nieprawda | **[F]** — regeneracja snapshotu z czystej bazy, nie ręczna poprawka jednej linii |
| T3a-4 | P2 | Nowy test wartości ujemnej był **zielony także przed poprawką** (stare `z.number().int()` też odrzucało `'-1'`) | **[F]** |
| T3a-5 | P2 | Raport **błędnie** opisuje `$6::integer` jako ciche zaokrąglenie. `pg` wysyła parametry tekstowo → `12.345` jako `integer` daje **błąd wejścia `int4`**, nie zaokrąglenie. Zmiana na `::numeric` jest słuszna, ale opis łańcucha nie odpowiada rzeczywistemu przepływowi | **[R]** — **korekta także mojego raportu do ownera**: powtórzyłem twierdzenie silnika bez weryfikacji |

## Znaleziska własne orchestratora
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| O-1 | P2 | **8 kluczy etykiet nie istnieje w ŻADNYM z 4 bundli**: `deleteAction`, `moveDownFor`, `moveUpFor`, `notEditable`, `rowActionsLabel`, `scrapHigh`, `scrapInvalid`, `scrapPrecision`. Wzorzec `tg(key, fallback)` chroni przed `MISSING_MESSAGE`, ale renderuje **angielski w UI pl/ro/uk** — w tym **nowe komunikaty walidacji scrap**, czyli sedno naprawy | **[F]** |
| O-2 | — | **Bramka poprzednich fal nie uruchamiała suity UI.** `pnpm --filter web test` łączy dwa `vitest run` przez `&&`; pierwszy pada → `.test.tsx` nigdy się nie wykonują. Baseline: core **39** plików failed, UI **25** plików failed | **[F]** — bramka Fali 4 mierzy obie suity osobno |

## Dowody wykonane przez orchestratora (nie delegowane)
| Dowód | Wynik |
|---|---|
| PREPARE migracji **523** na prodzie (`begin; \i; rollback;`) | ✅ `ALTER TABLE`, post-check **wykonał realny zapis** `12.345678` i zgłosił `NOTICE: setup_time_min keeps 6 decimal places on write` |
| **Real-PG probe reorderu** (`unnest($2::uuid[], $3::int[])` + parkowanie `+100000`) na prawdziwym nagłówku BOM z 5 liniami, **pełne odwrócenie kolejności** = najgorszy przypadek | ✅ obie fazy po `UPDATE 5`, wynik **gęste 1..N**, brak naruszenia nie-deferrable `UNIQUE(bom_header_id,line_no)` ani `CHECK(line_no>0)`; `ROLLBACK`. **To zamyka główną niepewność raportu T2** — mocki tego nie łapią |
| Zwiad `bom_snapshots` pod migrację 524 | ✅ 0 duplikatów `(org, wo, header)`, 0 `work_order_id IS NULL`, 7 wierszy |
| Zwiad zależności widoków od `routing_operations` | ✅ **brak** — `ALTER TYPE` nie wpada w pułapkę `0A000` z Fali 3 |
| **Dowód, że PREPARE 523 był FAŁSZYWĄ ZIELENIĄ** | ⛔ Trigger `routing_operations_guard_locked_routing` **istnieje** (BEFORE INSERT/DELETE/UPDATE). Wymuszony UPDATE operacji routingu `active` → `ERROR: routing_operations_immutable (V-TEC-64)`. Zapytanie probe'a `limit 1` **bez `order by`** zwróciło przy pierwszym PREPARE wiersz `draft` (zielono), a przy powtórzeniu wiersz **`superseded`** → deploy byłby **rzutem monetą**. Na prodzie są operacje routingów `draft`, `active` i `superseded` |

## ⛔ ZNALEZISKO INFRASTRUKTURALNE (zastane, poza zakresem fali) — **bramka migracyjna CI jest MARTWA**

Wyszło przy próbie regeneracji snapshotu schematu (znalezisko T3a-3). Łańcuch dowodowy:

1. `.github/workflows/ci.yml` — **dwa** joby (`build` i `migration-check`) robią
   `pnpm --filter @monopilot/db migrate` na czystym **`postgres:16-alpine`**.
2. `packages/db/migrations/279-npd-storage.sql` robi **bezwarunkowe**
   `insert into storage.buckets (...)` — schemat `storage` istnieje **tylko w Supabase**.
   Nie ma żadnego guardu, żadnego shimu w repo (`grep` po `create schema … storage` = 0 trafień),
   `migrate.ts` też go nie tworzy.
3. **Odtworzyłem lokalnie:** czysta baza + `pnpm --filter @monopilot/db migrate` →
   `Migration runner error: Migration failed: 279-npd-storage.sql — relation "storage.buckets" does not exist`
   (przeszło 278 migracji, padło na 279).
4. `packages/db/__expected__/schema.sql` **nie zawiera** tabeli `npd_attachments`
   → snapshot jest zamrożony **sprzed migracji 279**.
5. `check:drift` stoi **za** krokiem `migrate` w tym samym jobie → **nigdy się nie wykonuje**.

**Wniosek:** `migration-check` pada na kroku `migrate`, zanim dojdzie do `check:drift`.
Dlatego dryf po migracji **503** (`run_time_per_unit_sec`/`cost_per_hour` → `numeric(18,6)`,
a snapshot dalej mówi `numeric(10,2)`) mógł przejść niezauważony — **nic tego nie sprawdzało**.

**Decyzja:** **[N] poza zakresem Fali 4.** Naprawa to osobne zadanie infrastrukturalne
(uczynić migracje uruchamialnymi na czystym Postgresie **albo** dać CI obraz zgodny z Supabase),
nie doklejka do fali produktowej. **Nie łatam snapshotu ręcznie** — regeneracja na bazie
z shimem `storage` wstrzyknęłaby ten shim do snapshotu.
**Nie ukrywam też, że moja fala dokłada do dryfu** migracje 523 i 524.

### Lekcja metodologiczna (do pamięci)
**PREPARE, który przechodzi, nie dowodzi, że przejdzie następnym razem** — jeśli post-check
zależy od `limit 1` bez `order by`, wynik jest niedeterministyczny. Zielony PREPARE uśpił moją
czujność; złapał to dopiero cross-review, a ja potwierdziłem dowodem dopiero po jego wskazówce.
Post-check migracji musi być **samowystarczalny** (tworzyć własny obiekt testowy), a nie
opierać się na dowolnym wierszu biznesowym.

## Recenzja T2 (scrap + kolejność linii BOM) — Codex, werdykt FIX-FIRST (5×P1, 3×P2)
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T2-1 | P1 | Reorder **bez blokady** zostawia lukę w `line_no` — brak `FOR UPDATE`, brak sprawdzenia `rowCount`. Równoległy `deleteBomLine` → `[A=2,C=3]`, a audyt twierdzi, że przesunięto usuniętą linię | **[F]** — sam SQL jest OK (dowiodłem na realnym PG); problem to **współbieżność** |
| T2-2 | P1 | **Tabela pokazuje inny scrap niż baza** — renderery robią `toFixed(1)`, zapis obsługuje 2 miejsca. `2.35` → ekran `2.4%`; `0.01` → ekran `0.0%` | **[F]** — klasa „ekran ≠ baza" |
| T2-3 | P1 | Dwie **statycznie błędne asercje** zostawiają bramkę czerwoną | **[F]** — patrz weryfikacja niżej |
| T2-4 | P1 | **Over-blocking:** legalna linia bez operacji nie pozwala zapisać edycji scrap. Draft z NPD/generatora ma `manufacturing_operation_name = null` → `operationMissing` trwale wyłącza Save | **[F]** |
| T2-5 | P1 | Ręczne first-authoring **nadal po cichu zaokrągla** `2.3456` — granica Server Action (`LineInput`) nie sprawdza 2 miejsc; walidacja tylko po stronie klienta | **[F]** |
| T2-6 | P2 | Walidator „2 miejsc" przepuszcza `2.350000001` | **[F]** |
| T2-7 | P2 | **Cały namespace `technical.bom.rowActions` nie istnieje w runtime i18n** — klucze są tylko w `_meta/i18n-staging/`, którego aplikacja nie konsumuje. ~30 kluczy, nie 8 | **[F]** — szersze niż moje O-1 |
| T2-8 | P2 | Test „antyregresji" delete nie sprawdza końcowej renumeracji — fake nie usuwa wiersza | **[F]** |

## Recenzja T3b (kasowanie draftu + selektor linii) — Codex, werdykt FIX-FIRST (2×P1, 3×P2)
| # | P | Znalezisko | Decyzja |
|---|---|---|---|
| T3b-1 | P1 | **Site-RLS pozwala guardowi przeoczyć referencję WO.** Podzapytanie do `work_orders` działa jako `app_user`, a polityka `work_orders_site_visibility` (mig 383) ukrywa WO spoza site'ów usera — podczas gdy `routings` ma tylko RLS org. User z site A kasuje routing używany przez WO w site B → **sierota** | **[F]** — najsubtelniejsze znalezisko fali |
| T3b-2 | P1 | **TOCTOU z zapisem ECO** — `FOR UPDATE` blokuje tylko nagłówek routingu; `replaceEcoLines` wstawia polimorficzny `target_id` bez FK i bez blokady → referencja powstaje między guardem a DELETE | **[F]** |
| T3b-3 | P2 | **Globalny `LIMIT 200` PRZED filtrem site** — linie właściwego site'u mogą wypaść poza limit → pusty selektor. Unieważnia też deklarowaną anty-regresję powyżej 200 rekordów | **[F]** |
| T3b-4 | P2 | `boundLineIds` udostępnia obcą linię **we wszystkich** operacjach formularza → picker obiecuje wybór, który zapis odrzuci (`v_tec_64_cross_site_lines`) | **[F]** |
| T3b-5 | P2 | Osierocony nie-NULL `site_id` bez wpisu w `sites` renderuje się jako **„All sites"**, choć baza traktuje linię jako site-specific | **[F]** |

**Czyste w T3b (potwierdzone przez recenzenta):** wyścig delete–approve zamknięty; kaskada
`ON DELETE CASCADE` poprawna, trigger 496 nie blokuje; inwentarz miękkich referencji kompletny;
**8 nowych kluczy i18n JEST w runtime bundlach** (82 klucze `technical.routings.manager`
w każdym locale, 0 brakujących) — w przeciwieństwie do toru T2, który zostawił je w stagingu.

## Weryfikacje wykonaniem (nie delegowane) — druga tura
| Sprawdzenie | Wynik |
|---|---|
| Arytmetyka float-dust w `scrap-precision.ts` | ⛔ **Komentarz w kodzie jest FAŁSZYWY.** `2.35 * 100 === 235` **dokładnie** (żadnego szumu). Realny przykład to `8.45 * 100 = 844.9999999999999`. Asercja `not.toBe(235)` **failuje deterministycznie**. Dziura: `2.350000001` przechodzi walidator (`toFixed(6)` maskuje realne cyfry). **Intencja obronna słuszna, przykład zmyślony** |
| Namespace `technical.bom.rowActions` w 4 bundlach (`json.load`) | ⛔ **`False` we wszystkich czterech.** Mój wcześniejszy grep był zbyt luźny — łapał `"moveUp"` z innego namespace'u. Codex miał rację, ja się myliłem |

### Lekcja metodologiczna nr 2 (do pamięci)
**Dwa razy powtórzyłem twierdzenie silnika bez weryfikacji** i raz podałem je ownerowi jako fakt
(rzekome „zaokrąglanie przez `$6::integer`" oraz pochwalony komentarz o float-dust przy `2.35`).
Oba okazały się nieprawdziwe. Reguła: **zanim zacytuję uzasadnienie silnika, uruchamiam je** —
jednolinijkowy `node -e` albo `json.load` kosztuje sekundy i zamienia domysł w dowód.
