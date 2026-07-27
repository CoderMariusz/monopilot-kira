# FALA-04 / TOR T4 — PF-R06-02: authoring nie widzi tego, co Review

## Streszczenie

Decyzja architektoniczna z zadania utrzymana: **nie dodano kolumny `shelf_life_days` do `factory_specs`**
i nie zduplikowano pola w formularzu. Zamiast tego Review mówi teraz wprost, **czyja to wartość**,
brak wartości jest **nazwany**, a autor dostaje **trasę do źródła** (kartoteka itemu FG).

Fakt rozstrzygający potwierdzony niezależnie w tym torze:

* `packages/db/migrations/165-factory-specs.sql:25-70` — `factory_specs` nie ma kolumny shelf-life
  ani żadnego parametru procesowego. Kolumny „treściowe" to wyłącznie `spec_code`, `notes`,
  `source`, `bom_header_id`/`bom_version`, `d365_item_id`.
* `_actions/list-factory-specs.ts:84-105` — `i.shelf_life_days` pochodzi z `join public.items i`.
* `packages/db/migrations/153-items-master.sql:26-27` — `items.shelf_life_days` **oraz**
  `items.shelf_life_mode` to jedyne źródło prawdy.

---

## 1. Inwentarz pól Review vs authoring (główny produkt toru)

Legenda werdyktu:
**DZIEDZICZENIE** = wartość należy do innego agregatu, duplikat w specyfikacji byłby drugim źródłem prawdy.
**LUKA AUTHORINGU** = wartość należy do specyfikacji (albo do nikogo) i autor realnie nie ma jak jej ustawić.
**Z DEFINICJI** = pole systemowe/workflow, celowo nieedytowalne — nie jest defektem.

### 1a. Pola renderowane przez `review-modal.client.tsx`

| Pole w Review | Skąd wartość | Czy authoring potrafi ustawić | Werdykt |
|---|---|---|---|
| **Release status** (badge + `blockingReason`) | `factory_specs.status` | Nie bezpośrednio — zmienia się przez przejścia workflow (submit-for-review / approve / reject / release / recall) | **Z DEFINICJI**. Stan cyklu życia nigdy nie może być wolnym polem formularza. |
| **Paired BOM** (`bomVersion`) | `factory_specs.bom_header_id` + `bom_version` | **Tak, ale tylko** w `release-bundle-panel.client.tsx` (select „Link BOM" → `linkFactorySpecBom`) | **LUKA AUTHORINGU (osiągalność)** — patrz §1c, poz. A. |
| **Paired BOM — status** (`bomStatus`, steruje alertem `modal.g4Note`) | `bom_headers.status` (JOIN) | Nie | **DZIEDZICZENIE** z agregatu BOM. Poprawnie. |
| **Shelf life** | `items.shelf_life_days` (JOIN) | Nie na specyfikacji; **tak** na itemie (`items/_components/item-create-wizard.tsx:945`, `technical/shelf-life/_components/override-modal.tsx:261`) | **DZIEDZICZENIE** — naprawione w tym torze. |
| **Source** | `factory_specs.source` — zahardkodowane `'technical'` w INSERT (`actions/create-factory-spec.ts:109`), plus default w DB | Nie | **Z DEFINICJI** (stempel proweniencji). Ale ma defekt copy — patrz §1c, poz. C. |
| **Notes** | `factory_specs.notes` | Tak (create + edit + save-version) | OK — jedyne w pełni autorskie pole treściowe. |
| **Tytuł: `specCode`** | `factory_specs.spec_code` | Tak | OK |
| **Tytuł: `version`** | `factory_specs.version` | Nie — nadawana przez `saveFactorySpecVersion` / INSERT | **Z DEFINICJI** |
| **Podtytuł: `fgItemCode` + `fgName`** | `items` (JOIN) | Wybór itemu przy tworzeniu (`fg_item_id`); po utworzeniu niezmienny | **DZIEDZICZENIE** |
| **„Release via NPD handoff"** (gate na `fgNpdProjectId`) | `items.npd_project_id` (JOIN) | Nie | **DZIEDZICZENIE**. Poprawnie — to NPD jest właścicielem powiązania. |

### 1b. Pola w modelu/SQL, których Review NIE pokazuje

| Pole | Skąd | Uwaga |
|---|---|---|
| `productGroup` | `items.product_group` (JOIN) | Widoczne tylko w kolumnie listy „Category". **DZIEDZICZENIE**. |
| `d365ItemId` | `factory_specs.d365_item_id` | Nigdzie nie ustawiane w UI i nigdzie nie pokazywane w Review. Po mig 218 (usunięcie D365 import-pull) kolumna wygląda na **martwą** — kandydat do usunięcia, nie do dobudowania formularza. |
| `bomHeaderId`, `updatedAt`, `supersedes_factory_spec_id`, `approved_by/at`, `released_by/at` | `factory_specs` | Audyt/lineage. **Z DEFINICJI**. |

### 1c. Znaleziska do decyzji o kolejnej fali (NIE naprawiane w tym torze)

**A. `bomVersion` / `bomStatus` — luka osiągalności authoringu.** *(sugerowany priorytet: P1)*
Sparowanie BOM to jedyna droga do release'u (`factory-spec-flow.ts:319` blokuje release bez `bom_header_id`),
a mimo to:
* modal tworzenia i modal edycji **w ogóle nie wspominają o BOM** — autor nie dowie się, że dokument jest niekompletny;
* jedyny selektor („Link BOM") żyje w panelu bundle, otwieranym z Review przyciskiem
  `modal.openBundle` renderowanym **tylko gdy `canApprove === true`** (`review-modal.client.tsx:301`);
* to znaczy, że autor bez `technical.product_spec.approve` **nie ma żadnej ścieżki UI** do sparowania BOM —
  widzi w Review „No BOM paired yet" i nie ma czym na to odpowiedzieć.

To jest ta sama klasa błędu co PF-R06-02 (ekran pokazuje pole, którego autor nie potrafi wypełnić),
ale **odwrotna diagnoza**: tutaj wartość naprawdę należy do `factory_specs`, więc to jest realna luka,
a nie dziedziczenie. Naprawa = link/afordancja z modala edycji do panelu bundle, albo rozdzielenie
uprawnienia „paruj BOM" od „zatwierdzaj".

**B. `shelf_life_mode` — niekompletne dziedziczenie.** *(sugerowany priorytet: P2)*
`items.shelf_life_mode` (`use_by` / `best_before`, mig 153:26-27) **nie jest w ogóle selectowany**
przez `list-factory-specs.ts` i nie dociera do Review. Karta itemu go pokazuje
(`items/[item_code]/_components/item-overview-tab.tsx:138`), Review — nie.
Recenzent podpisuje więc „21 d" nie wiedząc, czy to termin przydatności do spożycia czy najlepiej-przed.
Naprawa jest tania (jedna kolumna w SELECT + jedno pole w mapowaniu) i jest **dziedziczeniem**,
dokładnie jak shelf life — świadomie zostawione poza tym torem, bo wymaga zmiany w `_actions/shared.ts`,
a to plik współdzielony.

**C. `source` renderowany jako surowy enum.** *(sugerowany priorytet: P3, kosmetyka)*
`<SummaryRow label={t('modal.source')} value={spec.source} />` wypisuje literał `technical` /
`npd_builder` — nietłumaczony, w interfejsie po polsku. To defekt copy, nie luka authoringu.

**D. „Storage" — pole prototypowe bez żadnego zaplecza.** *(sugerowany priorytet: P2)*
Klucze i18n `Technical.factorySpecs.col.storage` i `Technical.factorySpecs.modal.storage`
istnieją we **wszystkich czterech** locale'ach, ale **nic ich nie renderuje**. Sprawdziłem schemat:
kolumny warunków przechowywania **nie ma ani w `factory_specs`, ani w `items`, ani nigdzie w migracjach**
(`grep storage_condition|storage_temp|storage_class packages/db/migrations/` → 0 trafień).
Prototyp `technical/other-screens.jsx:40-75` przewidywał kolumnę Storage; nigdy nie została zbudowana.
To **ani dziedziczenie, ani luka authoringu — to niezbudowana funkcja**, i jedyna pozycja w tym
inwentarzu, która wymagałaby nowej kolumny. Do decyzji ownera: zbudować czy usunąć osierocone klucze.

---

## 2. Co zostało zmienione

| Plik | Zmiana |
|---|---|
| `technical/factory-specs/_components/review-modal.client.tsx` | Wiersz Shelf life: wartość + jawna adnotacja „Inherited from FG item {code}" + link do kartoteki itemu. Gdy `shelfLifeDays === null` → nazwany komunikat w badge'u amber zamiast `—`. `SummaryRow.value` rozszerzone `string` → `React.ReactNode`. Nowy opcjonalny prop `fgItemHref` (przekazywany dalej do `EditFactorySpecModal`). |
| `technical/factory-specs/_components/factory-spec-lifecycle-modals.client.tsx` | `EditFactorySpecModal`: hint „Shelf life is not a specification field — it is inherited from FG item {code}" + ten sam link. Nowy opcjonalny prop `fgItemHref`. |
| `technical/factory-specs/page.tsx` | `locale` przekazany do `FactorySpecsTable`; buduje `fgItemHref={/${locale}/technical/items/${encodeURIComponent(spec.fgItemCode)}}` dla każdego wiersza. |
| `i18n/{en,pl,ro,uk}.json` | Punktowo, bez przestawiania kluczy: `modal.shelfLifeInherited`, `modal.shelfLifeUnset`, `modal.openFgItem`, `lifecycle.edit.shelfLifeHint`, `lifecycle.edit.openFgItem`. PL przetłumaczone; RO/UK dostały copy EN — zgodnie z aktualnym stanem tych bloków (są tam angielskie placeholdery). Wszystkie 4 pliki przechodzą `json.load` i mają komplet nowych kluczy. |
| `_components/__tests__/factory-spec-shelf-life-provenance.test.tsx` | **nowy** — 3 testy (NIE uruchamiane, zgodnie z zasadami toru). |

### Dlaczego href jest propem, a nie hookiem w kliencie

`useLocale()` / `useParams()` w `review-modal.client.tsx` byłyby krótsze, ale:
1. `pipeline-tabs.tsx:220` dokumentuje w tym repo **realny bug**, w którym linki bez prefiksu locale
   wrzucały użytkowników `/pl` do angielskiej aplikacji;
2. oba istniejące suity RTL (`factory-specs-ui.test.tsx:36`, `factory-spec-recall.test.tsx:28`)
   lokalnie mockują `next/navigation` **tylko** `useRouter`, a `test-setup.ui.ts` mockuje z next-intl
   **tylko** `useTranslations` — więc `useParams()`/`useLocale()` wywaliłyby 10 istniejących testów.

Prop z komponentu serwerowego to wzorzec już używany w tym module
(`items/page.tsx:240` → `ItemsTableClient` → `basePath`). Prop jest **opcjonalny**, żeby zmiana była
czystym dodatkiem (żaden istniejący call-site nie wymaga edycji); jedyny produkcyjny konsument,
`page.tsx`, zawsze go podaje. Bez propa tekst o dziedziczeniu i tak się renderuje — znika tylko link.

---

## 3. Dowód osiągalności (lekcja Fali 3: weryfikuj osiągalność, nie istnienie)

Ścieżka renderu, gałąź po gałęzi:

1. `GET /{locale}/technical/factory-specs` → `page.tsx` (`export const dynamic = 'force-dynamic'`)
   → `listFactorySpecs()` → `state === 'ready'`.
2. `<FactorySpecsTable locale={locale}>` → dla **każdego** wiersza
   `<FactorySpecRowActions … fgItemHref="/{locale}/technical/items/{fgItemCode}">` — **bez warunku**.
3. `FactorySpecRowActions` renderuje przycisk „Review" **bezwarunkowo** (`review-modal.client.tsx:156`,
   brak bramki uprawnień) → `setOpen(true)` → `<Dialog open>` → `<dl>` z wierszem Shelf life.
   ⇒ adnotacja o dziedziczeniu i link renderują się dla **każdego wiersza i każdego użytkownika**,
   który w ogóle widzi listę (również dla nie-approvera — on dostaje alert o uprawnieniach,
   ale podsumowanie widzi).
4. Rozgałęzienie `shelfLifeDays != null` / `== null` jest **totalne** — zawsze wykonuje się dokładnie
   jedna z dwóch gałęzi. Nie ma stanu, w którym wiersz nie powstaje. To jest różnica względem
   martwego kodu z Fali 3: tam dodana gałąź siedziała za warunkiem, który nigdy nie był prawdziwy.
5. Gałąź „unset" jest osiągalna **na obecnych danych produkcyjnych** — to dokładnie ten stan,
   który zgłaszający zaobserwował (Review pokazywał `—`, bo item FG nie miał shelf life).
   Nie trzeba tworzyć fixture'u, żeby ją zobaczyć.
6. Hint w modalu edycji: opener jest bramkowany `isMutable && canApprove`
   (`review-modal.client.tsx:183`, `isMutable = status ∈ {draft, in_review}`) — czyli dokładnie
   populacja autorów, którzy mogą jeszcze coś zmienić. Dla specyfikacji approved/released
   modal edycji z założenia nie istnieje (clone-on-write), więc nie ma tam czego podpowiadać.
7. Cel linku: `/{locale}/technical/items/{item_code}` — trasa istnieje
   (`technical/items/[item_code]/page.tsx`, segment `[item_code]`, `decodeURIComponent(rawCode)`),
   a jej nagłówek ma przycisk „Edit" otwierający kreator z prefillowanym `shelfLifeDays`
   (`items/[item_code]/_components/item-detail-actions.tsx:56`). Trasa prowadzi więc do pola,
   nie tylko do ekranu.

**Dowód dla Walk E z E2E-PLAN.md** („Review pokazuje wartość, która NIE jest `—`"):
w wariancie z ustawionym shelf life Review pokazuje `21 d` + źródło; w wariancie bez —
„Not set on FG item FG5101" w badge'u amber. W żadnym wariancie nie pada goły `—`.

---

## 4. Testy (napisane, NIE uruchamiane)

`_components/__tests__/factory-spec-shelf-life-provenance.test.tsx`:

| Test | Asercja | Dlaczego failuje na obecnym `main` |
|---|---|---|
| shelf life obecny | `21 d` + tekst `/Inherited from FG item FG5101/` + link `href="/pl/technical/items/FG5101"` | Obecny kod renderuje samo `21 d` — nie ma ani adnotacji, ani linku, ani `data-testid`. |
| shelf life pusty | badge `Not set on FG item FG5101`; **`queryByText('—')` → brak**; link nadal obecny | Obecny kod renderuje dosłownie `'—'` (`review-modal.client.tsx:276` przed zmianą). |
| trasa z authoringu | modal edycji: hint `Shelf life is not a specification field` + `FG5101` + link do właściwego itemu | W obecnym modalu edycji są wyłącznie pola `specCode` i `notes`. |

`notes` w fixture jest niepusty celowo — inaczej `modal.noNotes` (też `—`) fałszowałby asercję
„brak gołego myślnika".
`next/link` zamockowany na zwykły `<a>` (wzorzec z ~10 innych suit w tym repo); asercje na `href`
są przez to nienaruszone.

---

## 5. Czego NIE jestem pewien

1. **Nie uruchamiałem niczego** — ani testów, ani `tsc`, ani builda (zasada toru). Bramka jest po
   stronie orchestratora. Zweryfikowałem tylko parsowalność 4 plików JSON (`json.load`), bo to moja
   własna edycja mogła je zepsuć.
2. **Baseline UI = 25 failujących plików.** Nie mam jak sprawdzić, czy `factory-specs-ui.test.tsx`
   i `factory-spec-recall.test.tsx` są wśród nich. Zmieniłem sygnaturę `SummaryRow` (`string` →
   `React.ReactNode`) i dodałem **opcjonalne** propy — żaden istniejący call-site nie wymaga edycji,
   więc nie powinno być regresji typów, ale tego nie udowodniłem uruchomieniem.
3. **Zauważyłem, że pliki `i18n/*.json` zmieniały się na dysku w trakcie mojej pracy** (równoległe tory).
   Moje edycje były punktowe i zaaplikowały się czysto, ale przy merge'u konfliktów w tych plikach
   warto sprawdzić, czy moje 5 kluczy przetrwało.
4. **`encodeURIComponent(fgItemCode)` a kod itemu ze slashem.** Trasa `[item_code]` to pojedynczy
   segment; kod zawierający `/` zepsułby routing mimo enkodowania. Nie sprawdzałem, czy schemat
   dopuszcza takie kody. `page.tsx` nie ma pokrycia RTL (komponent serwerowy + DB), więc budowanie
   href-a nie jest testowane jednostkowo.
5. **Nie ruszałem kolumny „Shelf life" na liście** (`page.tsx:46`, `formatShelfLife` → `—`).
   Ten sam problem uczciwości prezentacji, ale w gęstej tabeli zdanie o dziedziczeniu byłoby szkodliwe.
   Zostawiam do decyzji — ewentualnie `title` na komórce.
6. **Nie weryfikowałem na produkcji** (brak zgody na uruchamianie czegokolwiek w tym torze).
   Dowód behawioralny Walk E musi domknąć orchestrator.
7. **Pozycja D (Storage)** — nie wykluczam, że inny tór właśnie buduje to pole i osierocone klucze
   i18n są celowe. Nie usuwałem ich.
