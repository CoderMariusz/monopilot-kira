# FALA 7 / TOR T4 — raport (R07-04, R08-09 + drugi defekt ze zwiadu)

Branch `main`, bez uruchamiania testów/builda/tsc/psql (bramka po stronie orchestratora).
Test na żywym PG **napisany, nie uruchomiony** — zgodnie z zasadami toru.

## Co zmieniłem (4 pliki produkcyjne + 3 testowe)

| plik | zmiana |
|---|---|
| `warehouse/_actions/receipt-corrections-actions.ts` | `left join public.grns` → `join` w `loadGrnLineForUpdate`; rewalidacja poza transakcją i osłonięta (2×) |
| `warehouse/_actions/lp-actions.ts` | `getLpDetail` filtruje po aktywnym site |
| `warehouse/_actions/grn-actions.ts` | `getGrnDetail` filtruje po aktywnym site — **⚠️ plik z listy NIE DOTYKAJ, patrz niżej** |
| `packages/db/__tests__/grn-line-for-update-outer-join.test.ts` | **nowy** — test na żywym Postgresie |
| `receipt-corrections-actions.test.ts`, `lp-actions-site.test.ts` | testy jednostkowe |

---

## [R07-04] Kasowanie przyjęcia — INNER JOIN

Wybrałem **INNER JOIN**, nie rozbicie na dwa zapytania. Uzasadnienie:

1. `grn_items.grn_id` jest `NOT NULL` (0 wierszy z NULL na produkcji — udowodnione
   w spec toru), więc outer join **nigdy** nie wpuszczał wiersza, którego inner
   join nie wpuści. Zbiór wyników jest identyczny.
2. Drugie zapytanie oznacza **drugi round-trip i drugi moment blokady** — między
   `for update of gi` a `for update of g` mieści się cudza transakcja. Jeden
   `select ... for update of gi, g` bierze obie blokady atomowo. Rozbicie
   naprawiłoby błąd i **wprowadziło wyścig**, którego dziś nie ma.
3. Diff: jedno słowo kluczowe.

Pozostałe dwa joiny w tym zapytaniu (`pol`, `po`) **zostają LEFT** — nie występują
w `for update of`, a przyjęcie bez linii PO (`po_line_id IS NULL`, przyjęcie
bez zamówienia) musi się nadal ładować. Zmiana ich na INNER byłaby regresją.
Dopisałem to jako komentarz w SQL, żeby ktoś „nie dokończył" naprawy.

### Czy ten wzorzec jest gdzieś indziej? **NIE.**

Przemiotłem **całe repo**, nie tylko swoje pliki: 46 miejsc z `for update of`
plus osobno gołe `for update`. **Zero innych wystąpień.** W każdym miejscu
blokowane aliasy pochodzą z tabeli `from` albo ze zwykłego `join`; tam gdzie w
zapytaniu jest `left join`, alias z nullowalnej strony jest konsekwentnie
**poza** listą `for update of`.

Dwa miejsca warte odnotowania na przyszłość (dziś poprawne, ale o kształcie,
który po drobnej edycji stanie się tym błędem):

- `(npd)/pipeline/_actions/toggle-gate-checklist-item.ts:77-82` — ma **komentarz
  dokumentujący dokładnie ten sam błąd 0A000 naprawiony w przeszłości**; relacja
  `done` to `left join lateral ... on true` i blokowane jest tylko `gci`. To znaczy,
  że ta klasa błędu **już raz uderzyła w tę bazę kodu** — nie jest jednorazowa.
- `production/_actions/consume-material-actions.ts:555` i
  `api/.../consume/route.ts:271` — CTE `cfg` jest tylko skalarnym podzapytaniem w
  liście selecta, więc nie wchodzi do zbioru blokowanych relacji. Bezpieczne, ale
  kształt nietypowy.

### Test na żywym Postgresie (wymagany przez audyt)

`packages/db/__tests__/grn-line-for-update-outer-join.test.ts` — skipuje się bez
`DATABASE_URL`, wzorzec z `496-routing-cross-site-scope.test.ts`.

Cztery asercje:
1. **kontrola porównania** — oba zapytania różnią się *wyłącznie* słowem `left`
   (asercja na stringach), więc 0A000 nie może pochodzić z niczego innego;
2. wariant `left join ... for update of gi, g` → odrzucony z `code = '0A000'`
   i komunikatem `nullable side of an outer join`;
3. wariant `join ... for update of gi, g` → przechodzi, 0 wierszy;
4. `information_schema` potwierdza `grn_items.grn_id is_nullable = 'NO'` — czyli
   przesłanka, na której opiera się wybór INNER, jest sprawdzana, a nie założona.

**Bez seedu i bez sprzątania**: oba zapytania bindują losowy `uuid`, więc nie
trafiają w żaden wiersz, nie biorą blokady i nic nie zapisują. Błąd 0A000 leci na
etapie planowania, przed dotknięciem danych. To jest cały powód, dla którego test
na mockach nie mógł tego złapać — reguła jest w **planerze**, nie w tekście SQL.

**Czego ten test NIE robi (świadomie):** nie wykonuje dosłownie stringa z
produkcji. `receipt-corrections-actions.ts` ma `'use server'`, więc nie mogę z
niego wyeksportować stałej z SQL-em (Next wymaga, by wszystkie eksporty takiego
modułu były funkcjami async), a wyciąganie template literala regexem z pliku
`apps/web` w teście `packages/db` byłoby kruche. Zamiast tego produkcyjny SQL jest
**przypięty asercją w teście jednostkowym** (`for update of gi, g` musi zawierać
`join public.grns g` i nie może zawierać `left join public.grns`), a test PG
dowodzi, *dlaczego* to przypięcie ma znaczenie. Razem pokrywają regresję z obu stron.

---

## [DRUGI DEFEKT, niezgłoszony przez audyt] Rewalidacja w otwartej transakcji

Potwierdzam zwiad. `revalidateLocalized` stało **wewnątrz** callbacku
`withOrgContext`, po wszystkich siedmiu mutacjach. `revalidatePath` rzuca, gdy
leci poza zakresem requestu — rzut wychodził przez `withOrgContext` (rollback
całej siódemki) prosto w `catch`, a operator dostawał `persistence_failed`
przy **zerze zmian w bazie**. Identycznie w `updateLpMetadata` — **naprawiłem
oba**, bo to ten sam błąd, a nie dwa.

Kształt skopiowany z `receive-po-line.ts:230-241` (rewalidacja poza transakcją,
w `try/catch`) z **jednym świadomym odstępstwem**: ścieżka przyjęcia rzut
**przerzuca** dalej (poza `VITEST`), ja go **połykam** i loguję `console.warn`.
Powód: po commicie praca jest już trwała. Przerzucenie zamienia „zrobione, cache
nieodświeżony" w `persistence_failed`, operator ponawia i dostaje
`already_cancelled` — czyli komunikat sprzeczny z tym, co widzi na ekranie.
Nieświeży cache to nie jest powód, żeby zameldować porażkę wykonanej pracy.

Efekt uboczny naprawy: `cancelGrnLine` i `updateLpMetadata` mają teraz jawne
typy zwrotne (`CancelGrnLineResult`, `UpdateLpMetadataResult`). Było to konieczne —
bez kontekstu typu z `return await withOrgContext(...)` TS rozszerzyłby `error`
do `string`. Zero zmian w zachowaniu.

Test: `revalidatePath` rzuca → `cancelGrnLine` nadal zwraca `{ ok: true }`, a
mutacje są w logu zapytań. Przed naprawą ten test daje `persistence_failed`.

---

## [R08-09] Site na szczegółach LP i GRN

Naprawione **w loaderach**, nie na stronach: `getLpDetail` i `getGrnDetail`
same rozwiązują aktywny site i wkładają go do `where`. Żaden caller nie może
tego pominąć i **nie ma parametru site do podrobienia** przez wywołującego.

Predykat jest dosłownie ten sam co na liście LP (`lp-actions.ts:81`):

```sql
and ($2::uuid is null or lp.site_id = $2::uuid or lp.site_id is null)
```

Wynik dla operatora: strona szczegółów renderuje istniejący panel „nie
znaleziono" (`lp-detail-not-found` / `grnDetail.notFound`) — bez nagłówka,
bez lineage i **bez akcji mutujących**, bo `getLpDetail` jest pierwszym `await`
w komponencie. Nie dokładałem nowego UI.

### ⚠️ Co robię z LP bez przypisanego site (`site_id IS NULL`)

**Zostają widoczne w każdym kontekście site — i przy „All sites", i przy
konkretnym site.** To decyzja, nie przeoczenie:

1. **Zgodność z listą.** `listLPs` już dziś ma `or lp.site_id is null`. Gdyby
   szczegóły były ostrzejsze, powstałby stan „widzę wiersz na liście, klikam,
   dostaję «nie znaleziono»" — czyli **wymieniłbym jeden defekt na drugi**.
   Reguła, którą utrzymuję: *szczegóły nigdy nie odmawiają tego, co lista pokazuje*.
2. **Anty-over-blocking.** LP bez site pochodzi z magazynu org-wide. Zablokowanie
   go zabrałoby dostęp do towaru, który dziś działa — a spec toru zakazuje tego wprost.
3. **To nie jest wyciek.** Wyciek z R08-09 to LP **cudzego** site (Main Factory przy
   wybranym `tester1`). Ten przypadek jest teraz zamknięty. Wiersz bez site nie
   należy do żadnego site, więc nie przecieka *między* nimi.

**Na GRN świadomie użyłem tej samej, łagodniejszej reguły**, mimo że `listGrns`
filtruje twardo (`g.site_id = $4::uuid`, bez dysjunkcji NULL). Czyli
`getGrnDetail` jest *odrobinę* luźniejsze niż `listGrns`: GRN z `site_id IS NULL`
(przyjęcie do magazynu org-wide) nadal otworzy się z bezpośredniego linku, choć
na liście go nie ma. Wybrałem to zamiast lustrzanego odbicia `listGrns`, bo
odwrotny błąd — 404 na GRN, do którego prowadzi link z PO albo z LP — jest
utratą dostępu do żywego dokumentu, a korzyści bezpieczeństwa zero (wiersz bez
site nie należy do cudzego site). **Jeżeli właściciel woli symetrię z listą,
zmiana to skasowanie `or g.site_id is null` w jednej linii.**

### Rozwiązywanie aktywnego site — różne w LP i GRN, celowo

| loader | jak rozwiązuje | dlaczego tak |
|---|---|---|
| `getLpDetail` | `getActiveSiteId()` — **bez klienta** | tak robi `license-plates/page.tsx:108`. Z klientem doszedłby fallback na *domyślny site org*, którego lista **nie stosuje** → przy braku cookie lista pokazuje wszystko, a szczegóły filtrowałyby do domyślnego site. To jest dokładnie over-blocking, przed którym ostrzega spec. |
| `getGrnDetail` | `getActiveSiteId({ client })` | tak robi `listGrns:81`. Ta sama rozdzielczość co lista GRN. |

Niesymetryczne z wyglądu, ale niezmiennik jest jeden: **każdy loader szczegółów
rozwiązuje site tak samo jak JEGO lista.** Przypiąłem to asercją
(`expect(getActiveSiteIdMock).toHaveBeenCalledWith()`), bo inaczej ktoś „ujednolici"
to przy pierwszej okazji i wprowadzi over-blocking.

**„All sites" (`null`) → brak filtra, bez zmian.** Dotyczy obu loaderów.
Zwłaszcza dla GRN: `listGrns` przy `null` **fail-close'uje na pustą listę**, ale
`getGrnDetail` przy `null` działa jak dziś. Nie kopiowałem fail-close'a do
szczegółów — to byłaby regresja dla każdego linku do GRN w trybie „All sites".

---

## ⚠️ KONFLIKT WŁASNOŚCI PLIKU — do decyzji orchestratora

`grn-actions.ts` jest na liście **NIE DOTYKAJ** w spec toru, a jednocześnie
zwiad w tym samym spec'u każe naprawić `getGrnDetail` „raz, w loaderze" i takie
było też polecenie prowadzącego. Wykonałem naprawę, bo bez niej otwór R08-09
zostaje otwarty na GRN — ale **zgłaszam to jawnie**:

- **Dokładny zakres mojej zmiany:** `getGrnDetail` i **tylko** ona — jedna linia
  `const siteId = await getActiveSiteId({ client: ctx.client });` przed zapytaniem
  nagłówkowym, jedna linia w `where`, `[grnId]` → `[grnId, siteId]`. Plus komentarz.
- **Nie dotknąłem** `listGrns` ani niczego poniżej `getGrnDetail`.
- Import `getActiveSiteId` już był w pliku (linia 4) — nie dokładałem importu.
- Jeśli równoległy tor przepisuje ten plik, ta zmiana jest **trywialna do
  ponownego naniesienia**; przy konflikcie ma pierwszeństwo wersja tamtego toru
  **plus** te trzy linie.

---

## Czego NIE jestem pewien / czego NIE zrobiłem

1. **Akcje mutujące LP nadal nie sprawdzają site.**
   `license-plates/[lpId]/_actions/lp-split-merge-destroy-actions.ts` (`splitLp`,
   `mergeLps`, `destroyLp`) czyta `lp.site_id` tylko po to, żeby go propagować do
   dzieci i do `stock_moves` — **nigdy nie porównuje go z aktywnym site** (nie
   importuje `getActiveSiteId` w ogóle). Ścieżka przez UI jest zamknięta (strona
   nie wyrenderuje przycisków ani nie ujawni id), ale **bezpośredni POST server
   action z znanym `lpId` z cudzego site nadal zmutuje LP**. Ten plik nie jest w
   moim zakresie i nie tknąłem go. Audyt prosił o „przeprowadzenie site przez
   odczyty szczegółów **i mutacji**" — **odczyty zrobione, mutacje nie**.
   Rekomendacja: ten sam predykat w `where` ładowania źródłowego LP w tych trzech
   akcjach. Osobny tor, mały diff.
2. **Nie zweryfikowałem zachowania na żywej bazie** — zero uruchomień (zasada
   toru). Kierunek INNER JOIN jest udowodniony przez prowadzącego na produkcji;
   moje testy są napisane, nie odpalone. **Bramka musi je uruchomić** — szczególnie
   test PG, który bez `DATABASE_URL` **cicho się skipuje** i da fałszywą zieleń.
3. **Furtka z migracji 299** (kontekst ze zwiadu, nie naprawiałem): aplikacja
   (`cancelGrnLine`, warunek `grn_status === 'completed'`) jest **ostrzejsza niż
   baza**, która celowo dopuszcza pierwszy zapis `cancelled_at` na GRN `completed`.
   Ponieważ `completeFullyReceivedGrns` auto-kompletuje GRN, gdy PO dochodzi do
   `received`, **furtka jest z UI nieosiągalna** — a to znaczy, że po tej naprawie
   operator odzyska możliwość kasowania przyjęć tylko **przed** domknięciem PO.
   Jeżeli w produkcji są błędne przyjęcia na już-completed GRN-ach, ta naprawa ich
   **nie odblokuje** — potrzebna byłaby osobna decyzja produktowa. Zgłaszam, nie rozstrzygam.
4. **Nie testowałem `getGrnDetail` na poziomie site w teście jednostkowym.**
   `grn-display.test.ts` mockuje `getActiveSiteId` na `SITE_ID` i dopasowuje
   zapytania po fragmencie SQL, więc moja zmiana go nie psuje (dołożyłem klauzulę
   i drugi parametr, żaden matcher nie sprawdza arności) — ale **nie dopisywałem
   tam nowych testów**, bo to plik testowy toru, który jest właścicielem
   `grn-actions.ts`. Jeśli orchestrator zatwierdzi moją zmianę w tym pliku,
   analogiczne 2 testy jak w `lp-actions-site.test.ts` warto tam dołożyć.
5. **Kolejność w `cancelGrnLine` (LP → pozycja GRN → stock_move → WAC → rollup PO)
   pozostała bez zmian.** Nie było powodu jej ruszać — cała sekwencja po prostu
   nigdy nie była wykonywana. Test z toru („kasowanie zwraca LP, anuluje pozycję i
   odwraca WAC — kolejność!") **już istniał** w `receipt-corrections-actions.test.ts`
   i przechodził na mockach mimo defektu, bo mock nie zna reguły planera. Nie
   duplikowałem go.
