# FALA 4 / FIX-BOM — raport z poprawek po cross-review

Zakres: `[B-1]` … `[B-15]`. Branch `main`, repo `monopilot-kira`.
Kolejność pracy: `[B-10]` (czerwona bramka) → P1 (B-1, B-2, B-8, B-9, B-11, B-12) → P2.

**Nie uruchamiałem** testów, buildów, `tsc`, migracji ani psql — zgodnie z zasadami bramkę
odpala orchestrator. Jedyne, co uruchomiłem, to skrypt Pythona przepisujący bundle i18n
oraz odczyty `json.load` do weryfikacji (nie są to testy ani build).

Nie tknąłem: `technical/routings/**`, `technical/factory-specs/**`, `planning/**`,
`lib/production/**`, `lib/technical/bom/snapshot.ts`, `technical/boms/snapshots/**`.

---

## [B-10 · P1] Dwie statycznie błędne asercje — bramka była CZERWONA

**Pliki:** `apps/web/app/[locale]/(app)/(modules)/technical/bom/__tests__/bom-pure.test.ts`,
`.../technical/bom/_lib/scrap-precision.ts`,
`.../technical/bom/_actions/__tests__/bom-line-edit-version-guard.unit.test.ts`

1. Asercja `expect(2.35 * 100).not.toBe(235)` failowała deterministycznie — `2.35 * 100`
   to dokładnie `235`. Przykład był zmyślony, a komentarz w `scrap-precision.ts` powtarzał
   to kłamstwo (`=== 234.99999999999997`). Zamieniłem przykład na **realny** float-dust
   `8.45 * 100 = 844.9999999999999`; test teraz asertuje jedno i drugie jawnie
   (`expect(2.35 * 100).toBe(235)` + `expect(8.45 * 100).not.toBe(845)`), żeby przykład
   nie mógł po cichu zgnić po raz drugi. Komentarz w module poprawiony.
2. Drugi test oczekiwał **pięciu** parametrów UPDATE, a zmieniona gałąź wysyła **sześć**
   (`scrap_pct = coalesce($6::numeric, scrap_pct)`, końcowy `null` = „nie ruszaj"). Oczekiwanie
   ma teraz 6 pozycji, a wszystkie trzy fixture'y `bom_lines` w tym pliku dostały `scrap_pct: '1.00'`
   (bez tego `updateBomLine` audytował `undefined` jako stan przed).

**Dlaczego to naprawia:** obie asercje były fałszywe wobec kodu, nie wobec intencji. Intencja
obronna `toFixed` jest słuszna i została utrzymana — poprawiłem wyłącznie przykład i kontrakt
liczby parametrów.

---

## [B-1 · P1] `Save version` gubił współprodukty i resetował yield

**Pliki:** `.../technical/bom/_components/bom-edit-dialog.tsx` (`VersionSaveModal`),
`.../technical/bom/_components/__tests__/bom-detail-save-version-wiring.test.tsx` (nowy),
`.../technical/bom/_components/__tests__/tec-022-bom-edit.test.tsx`

**Zmiana:** **usunąłem** propa `coProducts` z `VersionSaveModal`. Modal czyta teraz
`context.coProducts` i dokłada `yieldPct` z `context.yieldPct`:

```ts
const carriedCoProducts = context.coProducts ?? [];
...(context.yieldPct != null ? { yieldPct: context.yieldPct } : {}),
```

Usunięcie propa, a nie dodanie jego przekazania, jest tu istotne: prop, którego jedyny
produkcyjny wywołujący mógł zapomnieć, **zostanie** zapomniany. `context` to obiekt, który
rodzic i tak buduje i który już zawierał oba pola.

**DOWÓD OSIĄGALNOŚCI (ścieżka wykonania):**

1. `technical/bom/[itemCode]/page.tsx:395` renderuje `<BomDetailActions … coProducts={…} yieldPct={Number(d.header.yieldPct)} />`
   (dane z `getBomDetailPage`, realne wiersze `bom_co_products` i `bom_headers.yield_pct`).
2. `bom-detail-actions.tsx:107-118` pakuje je do `ctx: BomEditContext` (`coProducts`, `yieldPct` — **już tam były**).
3. `bom-detail-actions.tsx:357` montuje `<VersionSaveModal … context={ctx} lines={lines} />` — **bez** `coProducts`.
   To był cały błąd: modal czytał propa, którego nikt nie podawał → `coProducts ?? []` → `[]`,
   a brak `yieldPct` → serwer stosował `yieldPct ?? 100`.
4. Przycisk otwierający ten modal (`data-testid="bom-save-version-cta"`) jest aktywny dla
   `draft | in_review | technical_approved | active` przy `lines.length > 0`, więc ścieżka
   jest zwykłym, codziennym kliknięciem, nie przypadkiem brzegowym.

**Test przez rzeczywisty wiring** (wymóg ze spec): nowy plik
`bom-detail-save-version-wiring.test.tsx` renderuje **`BomDetailActions`** (komponent, który
montuje strona), klika prawdziwe CTA, wypełnia „Change reason", klika Save i sprawdza
**ładunek `createBomDraft`**: `coProducts` = źródłowe, `yieldPct` = 95, `parentAllocationPct` = 70.
Test podający propa wprost modalowi przechodziłby dalej mimo błędu — dlatego go nie użyłem.
W `tec-022` przeniosłem istniejący przypadek F4 z propa na `context` i dołożyłem test yieldu.

---

## [B-2 · P1] Ślad audytowy kłamał, outbox dostawał drugi, sprzeczny event

**Plik:** `.../technical/bom/_actions/create-draft.ts`

Wprowadziłem dwie zmienne w miejsce literału: `resultStatus` (domyślnie `'draft'`) oraz
`versionSubmittedAlreadyEmitted`. W gałęzi `technical_approved`/`active`:

```ts
resultStatus = edit.status;              // realny status wiersza — 'in_review'
versionSubmittedAlreadyEmitted = true;   // helper DB już wyemitował event
```

Audyt zapisuje `status: resultStatus`, a `writeOutbox` jest **pominięty**, gdy helper już
emitował.

**Dlaczego to naprawia (dowód z SQL):** `packages/db/migrations/479-bom-request-version-edit-concurrency-lock.sql:104-120`
wstawia `outbox_events` z `'bom.version_submitted'` i `'status', 'in_review'`, w gałęzi
`v_decision := 'cloned'`, z osłoną `where not exists (…)`. Przy decyzji `'existing'` helper
**nie** emituje nic (event dla tego agregatu już istnieje z pierwszego klonowania). Zatem:
- ścieżka `cloned` — event istnieje i jest poprawny; nasz drugi był sprzeczny;
- ścieżka `existing` — event istnieje z wcześniejszego zapisu; nasz dokładał kolejny błędny
  przy **każdym** ponownym zapisie forka.

W obu przypadkach właściwym zachowaniem jest cisza po stronie aplikacji. Ścieżka pierwszego
autorstwa i fork `draft`/`in_review` emitują dalej dokładnie jeden event, teraz z `resultStatus`
(czyli `'draft'` — bez zmiany zachowania, ale bez zaszytego literału).

Testy: `create-draft.version-edit.unit.test.ts` (audyt = `in_review`, zero `writeOutbox`, brak
narastania eventów przy podwójnym zapisie forka) + `create-draft.unit.test.ts` (ścieżka
pierwszego autorstwa nadal ma **dokładnie jeden** event, `status: 'draft'`).

---

## [B-8 · P1] Reorder bez blokady zostawiał lukę w `line_no`

**Plik:** `.../technical/bom/_actions/line-actions.ts` (`moveBomLine`)

Dwie zmiany:
1. Odczyt kolejności linii dostał **`for update`** — blokuje wiersze nagłówka na czas transakcji.
2. Faza 1 (staging `unnest`) sprawdza `rowCount`:

```ts
if (staged.rowCount !== nextOrder.length) { throw new Error(`bom line reorder raced: …`); }
```

**Dlaczego to naprawia:** scenariusz z recenzji to `moveBomLine` czytające `[A,B,C]`, po czym
równoległy `deleteBomLine` usuwa `B`. Z `FOR UPDATE` jedno z dwóch: (a) move trzyma blokady,
więc `DELETE` czeka do commitu i działa na spójnym stanie, albo (b) delete trzyma blokadę
wiersza, więc `select … for update` czeka i **widzi stan po usunięciu**. Lista ID nie może się
już zestarzeć między odczytem a UPDATE-em.

Kontrola `rowCount` jest drugą linią obrony na wypadek ścieżki, której blokada nie obejmuje:
zamiast zapisać częściową permutację (efekt `[A=2,C=3]` — luka, którą UNIQUE i CHECK
przepuszczają), akcja rzuca wyjątek. `withOrgContext` robi `begin` (`lib/auth/with-org-context.ts:352`)
i **ROLLBACK w `catch` (:359-365)**, więc nic nie zostaje zaparkowane w paśmie 100001+; zewnętrzny
`catch` mapuje to na `persistence_failed`. Faza 2 i audyt nie wykonują się — audyt nie ma jak
skłamać o przesunięciu usuniętej linii.

Samego SQL nie ruszałem (spec potwierdza, że jest poprawny — zweryfikowany na prawdziwym PG).
Nie dokładałem blokad do `addBomLine`: append liczy `max(line_no)+1` w jednym zapytaniu, nie
widzi niezacommitowanych wartości parkowanych i nie zostaje przez to zablokowany.

Testy: `line-actions.unit.test.ts` — asercja `for update` w odczycie oraz nowa flaga
`staleReorderRows` (faza 1 dotyka 2 z 3 wierszy) → `persistence_failed`, **brak** fazy 2 i **brak** audytu.

---

## [B-9 · P1] Tabela pokazywała inny scrap niż baza i modal Edit

**Plik:** `.../technical/bom/_components/bom-component-lines.client.tsx`

Oba renderery (`:175` tabela główna, `:288` pod-BOM WIP) używały `toFixed(1)`. Dodałem jeden
helper obok istniejącego `fmtQty` i podpiąłem w obu miejscach:

```ts
function fmtScrapPct(value: number): string { return String(Number(value.toFixed(2))); }
```

`2.35 → "2.35%"`, `0.01 → "0.01%"`, `5.00 → "5%"`, `2.50 → "2.5%"`. Kolumna `scrap_pct` to
`numeric(5,2)`, więc 2 miejsca to dokładnie tyle, ile baza umie przechować — ekran zgadza się
teraz z bazą i z modalem edycji. Nowy plik testowy `bom-component-lines-scrap.test.tsx`
sprawdza `2.35` i `0.01` (oraz brak `2.4%` / `0.0%`), zero nadal renderuje się jako `—`,
a ten sam format obowiązuje w rozwiniętym pod-BOM-ie WIP.

Sprawdziłem, że żaden istniejący test nie asertuje starego formatu (`bom-detail-screen.test.tsx`
używa `scrapPct: '2.00'`, ale nie sprawdza wyrenderowanego tekstu; `bom-detail-row-actions-wiring.test.tsx`
asertuje propa `target`, nie tekst).

---

## [B-11 · P1] Legalna linia bez operacji blokowała zapis (OVER-BLOCKING)

**Plik:** `.../technical/bom/_components/bom-line-row-actions.tsx`

Usunąłem `operationMissing` z `canSave`, gwiazdkę `req` przy etykiecie i komunikat
„Select a manufacturing operation.". `canSave` to teraz `!qtyInvalid && !scrapInvalid && !pending`.

**Dlaczego to jest poprawne, a nie rozluźnienie:** kontrakt serwera dopuszcza pustą wartość
**wprost** — `_actions/shared.ts:412`: *„Null/empty names are allowed (optional field)"*;
`UpdateBomLineInput.manufacturingOperationName` jest `.nullish()`, a `updateBomLine` mapuje
`''` → `null`. Kolumna jest nullowalna. Draft z NPD/generatora ma tam `NULL`, więc UI
wymagające operacji czyniło taką linię **nieedytowalną w całości** — nie dało się zmienić
nawet samego scrapu.

**Nie dołożyłem żadnej nowej blokady.** Testy pilnują obu stron: linia bez operacji ma Save
aktywny i zapisuje się (`manufacturingOperationName: ''`, `scrapPct: 3.5`), brak markera
„required", ale **realnie** błędne pole (scrap `2.3456`) dalej blokuje zapis.

Świadomie **nie** ruszałem `ComponentAddModal` (`bom-edit-dialog.tsx`), który przy *dodawaniu*
nowej linii nadal wymaga operacji — to inny ekran i inna decyzja produktowa; znalezisko
wskazywało `bom-line-row-actions.tsx`. Odnotowuję to niżej jako niepewność.

---

## [B-12 · P1] Ręczne first-authoring po cichu zaokrąglało `2.3456`

**Plik:** `.../technical/bom/_actions/shared.ts`

`LineInput.scrapPct` (schemat zbiorczy `createBomDraft`) przeszedł z
`z.coerce.number().min(0).max(100)` na wspólny `ScrapPct` z regułą 2 miejsc. Definicję
`ScrapPct` **przeniosłem powyżej** `LineInput` — użycie jej w miejscu deklaracji byłoby
błędem TDZ przy ładowaniu modułu (`LineInput` jest ewaluowany ~380 linii wcześniej).

**Dlaczego to NIE jest over-blocking generatora/NPD** — sprawdziłem wszystkich konsumentów:
- `createBomDraft` ma **dokładnie dwóch** wywołujących w repo, oba w `bom-edit-dialog.tsx`
  (`ComponentAddModal` fork + `VersionSaveModal`) — obie to ścieżki ręczne. `bom-first-authoring.tsx`
  używa `ComponentAddModal`.
- `CreateBomDraftInput` nie jest importowany nigdzie indziej (grep po całym `apps/`).
- Ścieżka NPD/generatora pisze `bom_lines` **własnym SQL-em**:
  `apps/web/app/(npd)/pipeline/_actions/_lib/materialize-npd-bom.ts` — nigdy nie parsuje tego
  schematu. BOM-y disassembly mają osobną akcję (`createBomDraft` jawnie je odrzuca).

Czyli zaostrzenie dotyka wyłącznie tego, co wpisuje człowiek. Wartości niesione przy zapisie
wersji też są bezpieczne: pochodzą z bazy (`numeric(5,2)`), więc z definicji mieszczą się w 2 miejscach.
Stary komentarz twierdzący, że „bulk LineInput obsługuje generator/NPD", był nieaktualny — poprawiony.

Testy w `create-draft.unit.test.ts`: `2.3456` → `invalid_input` z komunikatem „2 decimal places"
i **zerem zapytań do bazy**; `2.35`, `8.45`, `0` i brak pola nadal przechodzą.

---

## [B-13 · P2] Walidator „dwóch miejsc" przepuszczał dodatkowe cyfry

**Plik:** `.../technical/bom/_lib/scrap-precision.ts`

```ts
// było: Number.isInteger(Number((value * 10 ** SCRAP_PCT_DECIMALS).toFixed(6)))
return Number(value.toFixed(SCRAP_PCT_DECIMALS)) === value;
```

Porównanie z dwumiejscową normalizacją, bez mnożenia przez 100 i bez tolerancji rzędu sześciu
cyfr. `2.350000001` → `"2.35"` → `2.35 !== 2.350000001` → **odrzucone** (wcześniej przechodziło,
a baza zapisywała 2.35). Jednocześnie `toFixed` zaokrągla reprezentację dziesiętną, więc szum
IEEE nie ma jak przetrwać: `8.45` i `2.35` nadal przechodzą, `2.3456`, `0.001`, `12.345` nadal
nie. Regresyjny test w `bom-pure.test.ts` (`2.350000001`, `49.990000001`).

To jedna zmiana obsługująca `[B-10]` i `[B-13]` naraz — intencja obronna zachowana, szerokość
tolerancji zmniejszona do tego, co faktycznie przechowuje kolumna.

---

## [B-3 · P1] Dwa testy nie ładowały modułów

**Pliki:** `.../technical/bom/_lib/__tests__/bom-version-mutation.unit.test.ts`,
`.../technical/bom/_lib/__tests__/bom-lifecycle-copy.unit.test.ts`

- `'../_lib/bom-version-mutation'` → `'../bom-version-mutation'` (plik leży w `_lib/__tests__`,
  moduł jest **jeden** poziom wyżej; poprzednia ścieżka celowała w `_lib/_lib/…`).
- Importy JSON: 7 × `../` → **8 × `../`** (`__tests__ → _lib → bom → technical → (modules) →
  (app) → [locale] → app → apps/web/i18n`).

Obie ścieżki zweryfikowałem `os.path.exists` — istnieją.

**Czy asercje faktycznie coś sprawdzają po naprawie:** tak, sprawdziłem wartości w bundlach.
`en.newDraftNotice` = „…creates a new version **in review**…" (pasuje `/in review/i`, nie pasuje
`/new draft version/i`), `en.newEditableDraftNotice` = „…creates a new **draft version**…"
(odwrotnie), `pl.newDraftNotice` zawiera „do przeglądu (in review)" i nie zawiera „wersję roboczą",
`pl.newEditableDraftNotice` odwrotnie. Wszystkie cztery asercje są prawdziwe **i nietrywialne** —
odwrócenie tekstów wywali test. Do pliku matrycy dołożyłem też pokrycie nowych warunków z `[B-6]`.

---

## [B-4 · P2] `newEditableDraftNotice` był martwym kluczem

**Plik:** `.../technical/bom/_components/bom-edit-dialog.tsx` (`VersionSaveModal`)

W ciele modala renderuje się teraz komunikat **zależny od `sourceStatus`**:

```tsx
<div data-testid="bom-save-version-notice" className={RELEASED_STATUSES.has(context.sourceStatus) ? 'alert alert-amber mb-3' : 'alert alert-blue mb-3'}>
  {RELEASED_STATUSES.has(context.sourceStatus)
    ? t('newDraftNotice', { status: context.sourceStatus })   // → in review
    : t('newEditableDraftNotice')}                            // → nowy draft
</div>
```

Poprawiłem też mylące komentarze: w `onSubmit` („createBomDraft always opens a NEW draft" —
nieprawda) i w docstringu modułu.

**DOWÓD OSIĄGALNOŚCI (obie gałęzie):**

- Modal montuje się w `bom-detail-actions.tsx:356`: `canCreate && saveVersionAllowed && saveOpen`.
- `saveVersionAllowed = isBomVersionMutationAllowed(status,'saveVersion') && lines.length > 0`,
  a `saveVersion` jest dozwolone dla `draft`, `in_review`, `technical_approved`, `active`
  (blokada tylko `superseded`/`archived`).
- `RELEASED_STATUSES = {technical_approved, active}` → gałąź **amber/in-review** osiągalna dla
  BOM-u aktywnego i zatwierdzonego technicznie.
- `draft`/`in_review` → gałąź **blue/new-draft**, czyli klucz `newEditableDraftNotice`, który
  dotąd nie miał żadnego renderu.
- Zgodność z serwerem: `create-draft.ts` dla źródła `draft`/`in_review` tworzy wersję `draft`,
  a dla `technical_approved`/`active` idzie przez `bom_request_version_edit` → `in_review`.
  Komunikat mówi dokładnie to, co robi serwer.

Testy: w `tec-022` (render modala dla obu statusów) **oraz** w nowym pliku wiringowym przez
`BomDetailActions` + realne kliknięcie CTA — czyli osiągalność jest sprawdzona ścieżką UI, nie
tylko bezpośrednim renderem.

---

## [B-6 · P2] Macierz Delete obiecywała to, czego serwer odmawia

**Pliki:** `.../technical/bom/_lib/bom-version-mutation.ts`,
`.../technical/bom/_components/bom-detail-actions.tsx`,
`.../technical/bom/[itemCode]/page.tsx`

**Dokładne warunki serwerowe, które odwzorowałem** — `_actions/delete-bom-version.ts`, cytaty:

```ts
// :71-73  (najpierw status)
if (header.status !== 'draft') {
  return { ok: false, error: 'not_draft', message: 'Only draft BOM versions can be deleted' };
}
// :97-100 (potem liczba wersji)
const versionCount = Number(countRows[0]?.version_count ?? 0);
if (versionCount <= 1) {
  return { ok: false, error: 'only_version', message: 'Cannot delete the only BOM version' };
}
// :102-110 (na końcu snapshoty)
const snapshotCount = Number(snapshotRows[0]?.snapshot_count ?? 0);
if (snapshotCount > 0) {
  return { ok: false, error: 'snapshot_referenced', message: 'Cannot delete a BOM version referenced by snapshots' };
}
```

Zapytania źródłowe (`:75-95`): `version_count` = `count(*) from public.bom_headers where org_id
= app.current_org_id() and item_id = (select id from public.items … item_code = $1)` — **wszystkie**
wersje produktu, niezależnie od statusu; `snapshot_count` = `count(*) from public.bom_snapshots
where org_id = app.current_org_id() and bom_header_id = $1::uuid` — snapshoty **wybranej** wersji.

Odwzorowanie: `isBomVersionMutationAllowed(status, action, counts?)` i
`bomVersionMutationBlockedKey(status, action, counts?)` przyjmują opcjonalne
`{ versionCount, snapshotCount }`. Dla `draft + deleteVersion`:

```ts
if (counts.versionCount <= 1) return 'deleteOnlyVersion';
if (counts.snapshotCount > 0) return 'deleteSnapshotBlocked';
```

— ta sama **kolejność** co po stronie serwera, więc przy obu blokadach naraz komunikat jest ten
sam, który zwróci akcja. Statusy inne niż `draft` dalej dają `deleteStatusBlocked`; wyłączony
przycisk na drafcie **nigdy** nie twierdzi już, że problemem jest status.

Liczniki płyną z tych samych danych, co serwer: `page.tsx` przekazuje `versionCount={d.versions.length}`
(w `detail-page.ts:194-207` to wszystkie `bom_headers` danego `item_id`) i istniejące
`snapshotCount={d.snapshots.length}` (`detail-page.ts:285-292`, `bom_header_id = selectedId`).
Zapytanie o snapshoty ma `limit 50`, co przycina *liczbę*, ale nigdy nie zamienia „>0" w „0",
więc test `snapshotCount === 0` jest bezpieczny.

Klucze i18n `deleteOnlyVersion` / `deleteSnapshotBlocked` **już istniały** (używa ich `onDelete`
po odmowie serwera) — nie dokładałem nowych, a przy okazji doczekały się tłumaczeń ro/uk (patrz `[B-5]`).

Uwaga o interakcji torów jest uwzględniona: skoro równoległy tor tworzy snapshot BOM już przy
**tworzeniu** WO, `snapshotCount > 0` na żywym drafcie będzie częste — dlatego przycisk musi to
odzwierciedlać, zamiast wysyłać użytkownika po odmowę.

Testy: 6 nowych przypadków w `bom-version-mutation.unit.test.ts` (w tym kolejność `only_version`
przed `snapshot_referenced` oraz **brak** wpływu liczników na add/save) + 3 w
`bom-detail-actions-status-guards.test.tsx` na poziomie przycisku i jego `title`.

---

## [B-5 · P2] Nowe powody blokady bez tłumaczeń `ro` / `uk`

Przetłumaczyłem na rumuński i ukraiński **wszystkie** klucze `*Blocked*` w obszarze BOM oraz
całą resztę pasków akcji, która była kopią angielskiego (te same ekrany, ten sam wave):

- `technical.bom.actions` — **23 klucze** (w tym `addComponentBlocked{Archived,Superseded,Status}`,
  `saveVersionBlocked{Archived,Superseded,Status,Empty}`, `deleteSnapshotBlocked`,
  `deleteStatusBlocked`, `deleteOnlyVersion`, `deleteForbidden`, `deleteError`, approve/publish).
- `technical.bomDelete` — **8 kluczy** (modal usuwania: `blockedBySnapshots`, `blockedByStatus`, …).
- `technical.bom.edit.usabilityBlocked`, `technical.bom.newBom.blockedHint`,
  `technical.bom.newBom.status.blocked`.
- `Technical.releaseBundle.approveBlocked` — to jest `approveBlocked` z opisu znaleziska
  (leży poza `technical.bom`, dlatego wcześniej „nie było go widać" w sąsiedztwie).

`deleteOnlyVersion` nie ma w nazwie „Blocked", ale to on wyświetla się po `[B-6]` na wyłączonym
przycisku — bez tłumaczenia naprawa jednego znaleziska produkowałaby angielski komunikat w drugim.

Placeholders (`{version}`, `{count}`, `{code}`, `{message}`) zachowane; unikałem apostrofów
w łańcuchach z placeholderami (w ICU apostrof escape'uje `{`).

---

## [B-7 · P2] Osiem kluczy etykiet nie istniało w żadnym bundlu → patrz `[B-14]`

Wszystkie osiem (`deleteAction`, `moveDownFor`, `moveUpFor`, `notEditable`, `rowActionsLabel`,
`scrapHigh`, `scrapInvalid`, `scrapPrecision`) należy do namespace'u `technical.bom.rowActions`,
którego brakowało **w całości** — naprawione łącznie w `[B-14]`, z prawdziwymi tłumaczeniami
pl/ro/uk (nie kopiami angielskiego). Sweep pozostałych braków: sekcja „Klucze, których NIE naprawiłem".

---

## [B-14 · P2] Cały namespace `technical.bom.rowActions` nie istniał w runtime i18n

**Pliki:** `apps/web/i18n/{en,pl,ro,uk}.json` + skrypt `_meta/i18n-staging/apply-bom-row-actions.py`

Wprowadziłem `technical.bom.rowActions` do **wszystkich czterech** bundli runtime, zaraz po
`technical.bom.actions` (kolejność podkluczy jest identyczna we wszystkich czterech plikach).

**Co dokładnie trafiło do bundli — 30 kluczy, wyprowadzonych z kodu, nie z pliku staging.**
Wyciągnąłem je regexem z `bom-line-row-actions.tsx` (`tg('<key>'` + trzy klucze podawane przez
`fallbackKey`: `saveError`, `deleteError`, `moveError`). Różnice wobec `_meta/i18n-staging/bom-row-actions.json`:
- **pominąłem** `notes` i `notesPlaceholder` — komponent ich nie renderuje (dokładnie tak
  powstaje martwy klucz, którego dotyczy `[B-4]`);
- **dodałem** `manufacturingOperation` i `manufacturingOperationPlaceholder` (staging ich nie miał);
- **świadomie pominąłem** `manufacturingOperationRequired` — `[B-11]` usunął ten komunikat,
  więc jego dodanie byłoby wprowadzeniem nowego martwego klucza;
- staging miał tylko `en`/`pl`; `ro` i `uk` napisałem od zera (konwencja „ro/uk = kopia en"
  jest właśnie tym, co to znalezisko wytyka).

**WERYFIKACJA PROGRAMOWA (`json.load`, nie grep):**

```
en: technical.bom.rowActions present -> True | keys: 30
pl: technical.bom.rowActions present -> True | keys: 30
ro: technical.bom.rowActions present -> True | keys: 30
uk: technical.bom.rowActions present -> True | keys: 30

-- every used key resolves in all 4 -- True     (0 brakujących, 0 pustych, 0 nieużywanych)
pl: keys identical to en -> none (all translated)
ro: keys identical to en -> none (all translated)
uk: keys identical to en -> none (all translated)
```

Skrypt sprawdzał zbiór kluczy **użytych w komponencie** przeciwko zawartości bundla (a nie
odwrotnie), więc pokrycie jest liczone od strony runtime'u. Dodatkowo sprawdzenie
„identical to en" pilnuje, że pl/ro/uk nie są kopią angielskiego.

**Integralność plików:** skrypt najpierw asertuje, że
`json.dumps(data, indent=2, ensure_ascii=False) + "\n"` odtwarza plik **bajt w bajt** przed
zapisem, i odmawia zapisu, gdy nie odtwarza. Po zapisie potwierdzone dla wszystkich czterech:
round-trip stabilny, pojedynczy LF na końcu, brak CRLF, znaki spoza ASCII zapisane dosłownie,
**żadnego przestawiania ani usuwania** istniejących kluczy (diff: en/pl +57 linii, ro/uk +113).

---

## [B-15 · P2] Test „antyregresji" delete nie sprawdzał renumeracji

**Plik:** `.../technical/bom/_actions/__tests__/line-actions.unit.test.ts`

Fake DB faktycznie wykonuje teraz obie operacje:
- `delete from public.bom_lines` **usuwa** wiersz z `client.lines` (wcześniej zwracał tylko `rowCount: 1`);
- gałąź `with ranked as` **rankuje** ocalałe po `(line_no asc, id asc)` i parkuje każdy na
  `rank + 100000`, z odwzorowaniem filtra no-op `bl.line_no <> ranked.rn + 100000`, więc `rowCount`
  jest prawdziwy (wcześniej zwracała sztywne `rowCount: 2` i nie ruszała `line_no`).

Asercje sprawdzają **wynik**, nie fragmenty SQL: po usunięciu środkowego wiersza zostaje
dokładnie `[[LINE_A,1],[LINE_C,2]]`, a po usunięciu pierwszego `[[LINE_B,1],[LINE_C,2]]` —
czyli zbiór ID **oraz** dokładne `line_no = 1..N`. Zepsucie mapowania rang przy zachowaniu
substringów SQL wywali teraz te testy. Stary test na obecność fragmentów zostawiłem
(pilnuje pasma `+100000`, które chroni CHECK i UNIQUE), ale dołożyłem mu asercję końcowego stanu.

---

## Klucze i18n, których NIE naprawiłem (sweep)

Wszystkie znalezione `json.load`-em; poza zakresem tego toru, zgłaszam zgodnie z poleceniem:

| Namespace | Stan | Dlaczego nie ruszam |
|---|---|---|
| `Technical.releaseBundle.*` (≈64 klucze poza `approveBlocked`) | ro/uk = en | Cały ekran release-bundle, sąsiaduje z `factory-specs` (równoległy tor). Naprawiłem tylko wskazany `approveBlocked`. |
| `Technical.factorySpecs.modal.blockingReason.RELEASE_BLOCKED` | ro/uk = en | `technical/factory-specs/**` — jawnie zakazane. |
| `npd.costing.*` (12 × `blocked*`), `npd.dashboard.*` (3), `npd.advanceGateModal.softGateBlockedError`, `npd.faMrpTab.priceBlocked{Title,Body,Hint}`, `npd.faDetailModals.deleteBlockedBuilt` | ro/uk = en | Moduł NPD, poza torem BOM. |
| `npd.faProcurementTab.priceBlockedTitle` | ro/uk = en **i pl = en** | j.w.; dodatkowo brak polskiego — warto zgłosić torowi NPD. |
| `production.wos.actions.complete.gateBlocked`, `…gateStatusBlocked` | **BRAK we wszystkich trzech** (pl/ro/uk) | `lib/production/**` / moduł produkcji — zakazane. To realne `MISSING_MESSAGE`, nie tylko brak tłumaczenia. |
| `production.wos.detail.errors.overconsume_blocked`, `Dashboard.activity.events.consumeBlocked`, `Planning.*` (5), `Shipping.*` (2), `Yard.docks.deleteBlocked`, `technical.items.*` (2), `technical.sensory.*` (2) | ro/uk = en | Poza modułem BOM. |
| `technical.bomDetail.openBom` (z pliku staging) | brak w bundlach | Inny namespace niż `technical.bom`; nie jest to klucz `rowActions` ani cel żadnego znaleziska. Komponent BOM-owy z tego toru go nie woła. |

W obszarze `technical.bom.*` i `technical.bomDelete.*` po tych zmianach **nie ma już** klucza
`*Blocked*` równego angielskiemu w ro/uk (potwierdzone programowo).

---

## Czego NIE jestem pewien

1. **Nie uruchomiłem żadnego testu ani typechecku** (zakaz z briefu). Największe ryzyko
   kompilacji widzę w: (a) nowym `bom-component-lines-scrap.test.tsx`, gdzie `LABELS` jest
   rzutowane `as unknown as BomDetailLabels` (celowo, żeby nie kopiować 70 kluczy) —
   jeśli lint zabrania takich rzutów w testach, trzeba dołożyć pełny fixture; (b) w
   `create-draft.version-edit.unit.test.ts`, gdzie sięgam po `writeAudit.mock.calls[0][1].afterState`
   typowane jako `unknown` — `toMatchObject` powinno to przyjąć, ale nie zweryfikowałem tego kompilatorem.
2. **`ComponentAddModal` nadal wymaga operacji produkcyjnej** przy *dodawaniu* linii
   (`bom-edit-dialog.tsx`, `operationMissing` w `canSubmit`). Znalezisko `[B-11]` wskazywało
   `bom-line-row-actions.tsx`, więc tam się ograniczyłem. Jeżeli organizacja nie ma
   skonfigurowanej **żadnej** aktywnej operacji w Reference, ten modal jest nadal nieprzejezdny —
   to ta sama klasa over-blockingu, ale decyzja produktowa, nie oczywisty defekt. Do rozstrzygnięcia.
3. **`deleteBomLine` vs `deleteBomLine`** (dwa równoległe usunięcia) nadal nie jest
   serializowane — dodałem `FOR UPDATE` tylko w `moveBomLine`, bo scenariusz z `[B-8]` (move vs
   delete) jest tym zamknięty. Dwa jednoczesne DELETE-y mogą teoretycznie policzyć rangi z
   dwóch różnych migawek. Nie ruszałem tego bez znaleziska, żeby nie rozszerzać diffu na
   ścieżkę, której nikt nie zgłosił.
4. **Tłumaczenia ro/uk** napisałem samodzielnie; terminologia domenowa (np. „scrap %" jako
   „Pierderi %" / „Втрати %", „instantanee"/„знімки" dla snapshotów) powinna przejść przegląd
   native speakera pod kątem spójności z resztą aplikacji.
5. **`snapshotCount` z `limit 50`** — dla progu „> 0" jest to bezpieczne, ale gdyby kiedyś UI
   chciał **pokazać liczbę** snapshotów, wartość powyżej 50 będzie zaniżona. Nie zmieniałem
   zapytania (`detail-page.ts` bywa współdzielony).
6. **Skrypt `_meta/i18n-staging/apply-bom-row-actions.py`** zostawiłem w repo jako zapis tego,
   co dokładnie wstawiono (jest idempotentnie zabezpieczony asercją `'rowActions' not in bom`,
   więc drugie uruchomienie się wywali, zamiast duplikować). Jeśli konwencja repo nie przewiduje
   trzymania takich skryptów — do usunięcia, bundle są już zmienione.
