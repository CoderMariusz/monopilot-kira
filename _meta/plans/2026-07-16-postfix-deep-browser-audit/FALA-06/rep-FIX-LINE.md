# rep-FIX-LINE — runda naprawcza po cross-review (9 findingów)

Branch `main`. Testy **napisane, nie uruchamiane** (bramkę odpala orchestrator).
Pliki spoza mojej listy nietknięte.

## Zmienione pliki

| Plik | Finding |
|---|---|
| `apps/web/lib/production/output/line-output-target.ts` *(nowy)* | N-1 |
| `apps/web/lib/production/output/register-output.ts` | N-1 |
| `apps/web/lib/production/output/register-disassembly-output.ts` | N-1 |
| `packages/db/migrations/526-production-line-default-location-canonical.sql` | N-2 |
| `apps/web/actions/infra/line.ts` | N-3, N-9 |
| `apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/sites.ts` | N-3, N-4, N-5 |
| `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/lines-screen.client.tsx` | N-3, N-8 |
| `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/page.tsx` | N-3 (label) |

Testy: `__tests__/register-output-line-target.test.ts` *(nowy)*,
`actions/infra/line-default-location.test.ts`,
`settings/sites/_actions/sites-settings.test.ts`,
`settings/sites/_actions/site-create-errors.test.ts`,
`settings/infra/lines/page.test.tsx`.

---

## [N-1 · P1] Rejestracja outputu ignorowała skonfigurowane wyjście linii

**Potwierdzone.** Obie ścieżki brały pierwszą lokalizację magazynu
(`order by l.level asc, l.code asc limit 1`) i **aliasowały** ją jako
`default_location_id`. Alias tylko wyglądał jak ustawienie linii — nikt nie czytał
`production_lines.default_location_id`, więc linia ustawiona na `R02-ZONE`
produkowała do `R02-BIN1`, a wszystkie ekrany pokazywały `R02-ZONE`.

**Fix:** jeden wspólny resolver `resolveLineOutputTarget(ctx, woId)`
(`lib/production/output/line-output-target.ts`) — `work_orders.production_line_id
→ production_lines.default_location_id`, plus **magazyn tej lokalizacji**
(`locations.warehouse_id`), żeby `license_plates.warehouse_id` i `location_id`
były spójne. Jeden plik zamiast dwóch kopii tego samego SQL-a — obie ścieżki
routują teraz przez to samo miejsce.

**Fallback dla WO bez linii — dokładnie jak wygląda:**

```ts
// register-output.ts (createOutputLp)
const warehouse = (await resolveLineOutputTarget(ctx, input.woId)) ?? (await resolveWarehouseForSessionSite(ctx));

// register-disassembly-output.ts
const warehouse = (await resolveLineOutputTarget(ctx, wo.id)) ?? (await resolveWarehouseForSite(ctx, wo.site_id));
```

`resolveLineOutputTarget` zwraca `null` (→ stara ścieżka, bez zmian) w **trzech**
przypadkach:
1. WO nie ma linii (`production_line_id is null`) — `join` nie daje wiersza;
2. linia nie ma skonfigurowanego wyjścia (`default_location_id is null`) — `join`
   na `locations` nie daje wiersza;
3. lokalizacja nie leży w żadnym magazynie (`warehouse_id is null`) — odfiltrowane
   w `WHERE`, bo LP bez magazynu jest nie do zapisania.

Dodatkowo jawny kontrakt w TS: `if (!target?.id || !target.default_location_id) return null;`
— „albo obie połowy, albo nic". Bez tego pół-rozwiązany cel zapisałby LP z pustą
lokalizacją zamiast zejść do fallbacku.
**Rejestracja produkcji nie jest nigdzie blokowana** — żadnej nowej ścieżki błędu,
`no_warehouse_for_site` rzuca się tak samo jak wcześniej i tylko wtedy, gdy org
naprawdę nie ma magazynu.

**Testy** (`register-output-line-target.test.ts`): (a) linia skonfigurowana →
LP ląduje w `LINE_WAREHOUSE_ID`/`LINE_LOCATION_ID`, jawna asercja
`not.toBe(FALLBACK_LOCATION_ID)`; (b) WO bez linii → LP ląduje w starym celu i
rejestracja **przechodzi**. Harness skopiowany z
`register-output-transaction-safety.test.ts` (ten test dowodzi, że taki fake
client przeprowadza `registerOutput` aż za insert LP), przerwanie na `upsertWac`,
który leci **po** `createOutputLp` — asercje nie zależą od WAC/outboxu/genealogii.

⚠️ **Uwaga o istniejących harnessach.** 13 plików testowych w
`lib/production/output/` matchuje `from public.work_orders` generycznie i **żaden**
nie zna `production_lines`. Nowe zapytanie trafia więc u nich w gałąź WO i
dostaje wiersz WO (ma `id`, nie ma `default_location_id`). Strażnik „obie połowy
albo nic" zamienia to na `null` → fallback → te testy zostają zielone bez
przepisywania trzynastu harnessów.

---

## [N-2 · P1] Backfill gubi zapisy z okna wdrożenia

**Wybrana droga: (b) trigger** synchronizujący obie kolumny — `production_lines_sync_default_location`,
`before insert or update`, dopisany jako sekcja 4 migracji 526.

**Dlaczego nie (a) „coalesce na jeden cykl":** to rozwiązanie, które **wymaga
ręcznego kroku** — ktoś musi pamiętać, żeby usunąć `coalesce` przy następnym
wdrożeniu. Dokładnie ten sam problem co post-deploy sweep, tylko odłożony o
release. Do tego trzeba by dotknąć **każdego** czytelnika (ekran linii, ekran
sites, `api/warehouse/scanner/pick`, `lib/warehouse/scanner/movement.ts`, nowy
resolver z N-1), a część z nich jest własnością równoległych torów.

**Dlaczego trigger działa bez ręcznej interwencji:**
- działa od chwili zaaplikowania migracji, czyli **od początku okna wdrożenia** —
  stara wersja aplikacji pisze `default_output_location_id`, trigger natychmiast
  przepisuje wartość do kolumny kanonicznej, więc nowi czytelnicy ją widzą;
- nie wymaga żadnego kolejnego deployu ani przypomnienia — **nie ma kroku do
  zapomnienia**;
- łapie pisarzy spoza tego repo, których `coalesce` po stronie odczytu nie łapie:
  konsola SQL, stary bundle w ciepłej lambdzie, **rollback do poprzedniego
  deploymentu**;
- jest samokasujący się: `drop column default_output_location_id` zabiera trigger
  razem z kolumną, nic więcej nie trzeba zmieniać (zapisane w komentarzu kolumny).

Reguła rozstrzygania: przy UPDATE mirrorowana jest ta kolumna, którą pisarz
**faktycznie ruszył**; gdy ruszone obie (albo żadna) — wygrywa kanoniczna, czyli
ten sam tie-break co backfill w kroku 1. Wyczyszczenie wartości propaguje się jako
`null`, więc „usuń domyślną lokalizację" dalej działa.

**Post-check (sekcja 5)** buduje własny wiersz i sprawdza **oba kierunki**:
(a) zapis starej aplikacji tylko w martwą kolumnę → kanoniczna podąża;
(b) wyczyszczenie kanonicznej → martwa podąża. Potem wiersz jest odwijany tym
samym wzorcem zagnieżdżonego bloku co istniejący post-check.

Trigger jest **za** istniejącym post-checkiem backfillu celowo: gdyby powstał
przed nim, gałąź INSERT ustawiałaby kolumnę kanoniczną sama i asercja „backfill
wykonał się" byłaby fałszywie zielona (updated 0 rows, a wynik i tak dobry).

⚠️ Migracja 526 jest **untracked** (`git status` → `??`, `git log` pusty) → nie
została nigdzie zaaplikowana, więc edycja w miejscu jest bezpieczna. Runner
(`packages/db/scripts/migrate.ts`) trzyma `schema_migrations(filename, checksum)`
i **twardo failuje na dryfie checksumy** — gdyby 526 gdziekolwiek już poszła,
trigger musi trafić do osobnej migracji 527.

---

## [N-3 · P1] Znana lokalizacja przechodziła bez magazynu

Stary warunek `if (input.warehouseId && location.warehouse_id !== input.warehouseId)`
odrzucał tylko **nieznane** id. Lokalizacja, która istnieje, przechodziła bez
sprawdzenia, gdy linia nie miała magazynu — bo nie było z czym porównać.

**Fix:** walidacja biegnie zawsze; przy braku magazynu linii → nowy, **nazwany**
kod `location_requires_warehouse` (nie generyczny błąd), przeniesiony przez
`toLineMutationFailure` (z `field: 'warehouseId'` i tekstem „Pick a warehouse for
this line first…") oraz przez `lineErrorMessage` + nowy label
`locationRequiresWarehouseError` (dwa literały `LinesLabels`: `lines-screen.client.tsx`
i `page.tsx`; `toLineLabels` w modal-utils spreaduje defaulty, więc łapie się sam).

⚠️ **Świadome odstępstwo od litery findingu — do rozstrzygnięcia przez arbitra.**
Finding mówi „zawsze… nie przepuszczaj". Zaimplementowałem odrzucenie dla
**nowych i zmienionych** przypisań, ale **niezmieniona, już zapisana** wartość
przechodzi. Powód: `updateLine` z ekranu sites przenosi istniejącą lokalizację
przez upsert bez zmiany (`warehouseId: existing.warehouse_id`,
`defaultOutputLocationId: existing.default_location_id`), więc twarde „zawsze"
uczyniłoby **każdą legacy linię z lokalizacją i bez magazynu niemożliwą do
zapisania** — nie dałoby się jej nawet przemianować ani dezaktywować. To ten sam
tryb awarii (over-blocking zamrażający pilota), który wychodził w Fali 2 i 3.
Wyjątek jest wąski i ma **identyczny kształt** co istniejący, zaakceptowany
carve-out dla nieaktywnej lokalizacji dwa warunki niżej. Scenariusz z findingu
(„linia nie ma **jeszcze** magazynu", czyli formularz nowej linii) jest odrzucany
w pełni. Jeśli arbiter chce literalne „zawsze" — usunięcie `if (!unchanged)`
w linii 112 `actions/infra/line.ts` to jednoznakowa zmiana.

Zapytanie diagnostyczne (ile wierszy korzysta z carve-outu):

```sql
select pl.org_id, count(*) as legacy_lines
  from public.production_lines pl
 where pl.default_location_id is not null
   and pl.warehouse_id is null
 group by pl.org_id;
```

---

## [N-4 · P1] `updateSiteSettings` mógł zatwierdzić wyczyszczenie domyślnego site'u

**Potwierdzone, naprawione.** Przy `primary: true` akcja najpierw gasi
`is_default` na wszystkich innych site'ach, a potem robi UPDATE z `returning`.
Gdy ten UPDATE nie trafił w wiersz, było `return { ok: false, error: 'not_found' }`
→ `withOrgContext` **COMMITuje** przy normalnym returnie → org zostaje **bez
żadnego domyślnego site'u**. Teraz `throw new Error(SITE_NOT_FOUND_SENTINEL)`,
a `catch` mapuje sentinel z powrotem na `not_found` — **kontrakt dla wołającego
niezmieniony**, zmienia się tylko wynik transakcji. Test: `sites-settings.test.ts`
→ „rolls back — never commits…" (mock nagrywa BEGIN/COMMIT/ROLLBACK, oczekuje
`['BEGIN','ROLLBACK']` **i** `{ok:false,error:'not_found'}`).

### Wszystkie akcje w `sites.ts` — sprawdzone co do jednej

| Akcja | Pisze? | Wyjście po pierwszym zapisie | Werdykt |
|---|---|---|---|
| `updateSiteSettings` | tak (clear-down + update) | **było `return`** | ❌ → naprawione (`throw` + mapowanie) |
| `createSite` | tak (clear-down + insert) | `throw` | ✅ naprawione w poprzedniej rundzie |
| `renameSite` | tak (1 UPDATE) | `return not_found` | ✅ bezpieczne — UPDATE jest **pierwszym i jedynym** zapisem; brak trafienia = pusta transakcja, nie ma czego cofać |
| `deleteSite` | tak (kaskada) | `throw 'site_not_found_after_cascade'` | ✅ — wszystkie guardy zależności biegną **przed** pierwszym zapisem, po kaskadzie jest już `throw` |
| `createLine` | nie (deleguje do `upsertLine`, własna transakcja) | `return` | ✅ brak zapisu we własnej transakcji |
| `updateLine` | nie (read + delegacja) | `return not_found` | ✅ read-only przed delegacją |
| `getSites` / `getLinesForSite` / `readSitesSettingsData` / `getLineFormOptions` | nie | — | ✅ read-only |
| `siteCodeTaken` *(nowa)* | nie | — | ✅ read-only, nigdy nie rzuca |

Sprawdziłem też `upsertLine` w `actions/infra/line.ts`: jedyny `return` po
INSERT to `persistence_failed` przy pustym `returning` — INSERT jest tam
pierwszym zapisem, więc commit dotyczy pustej transakcji. Bezpieczne, zostawione.

---

## [N-5 · P1] Domyślny `UTC` zatrzymywał formularz przed kontrolą duplikatu

Znalazłem **przyczynę źródłową**, nie tylko kolejność. `Intl.supportedValuesOf('timeZone')`
**nie zawiera `'UTC'`** — zweryfikowane w tym środowisku (`has UTC: false`, 418
stref). A `'UTC'` to domyślna strefa tej aplikacji (`coalesce($3, 'UTC')` w
insercie `createSite`, fallback w `toSiteRow`). Czyli walidator odrzucał wartość,
z którą formularz startuje, komunikatem, który **podaje UTC jako przykład
poprawnej strefy**. Odrzucał też każdy alias IANA (`Etc/GMT+5`, `US/Pacific`).

**Fix (a) — źródło:** `isValidIanaTimezone` to teraz sam konstruktor
`Intl.DateTimeFormat` (gałąź `supportedValuesOf` **skasowana**). Zweryfikowane
zachowanie: `UTC` ✅, `Europe/Warsaw` ✅, `+01:00` ✅, `Etc/GMT+5` ✅,
`UTC+1` ❌, `Not/A/Timezone` ❌ — czyli oba istniejące fixture'y „niepoprawnej
strefy" w testach **dalej są odrzucane**.

**Fix (b) — to, o co prosi finding:** kontrola duplikatu kodu biegnie **niezależnie**
od walidacji strefy. Duplikat jest wykrywany dopiero przez 23505 na INSERT, a
INSERT nigdy nie startuje, gdy walidacja pada — więc formularz z zajętym kodem
**i** odrzuconą strefą raportował tylko strefę, a użytkownik po jej poprawieniu
dowiadywał się, że kod jest zajęty (dwa obroty na jeden formularz, a pierwszy
komunikat nie był powodem blokującym). Teraz na ścieżce odrzucenia schematu
`createSite` sprawdza kod przez `siteCodeTaken` (case-insensitive `upper()` po
obu stronach — łapie też legacy `waw` vs `WAW` z N-7) i raportuje `duplicate_code`
**przed** komunikatem schematu.

`siteCodeTaken` czyta wyłącznie site'y własnego orga (RLS + `app.current_org_id()`),
które każdy członek i tak widzi przez `readSitesSettingsData` — brak nowego wycieku.
Nigdy nie rzuca (`catch → false`), żeby diagnostyka nie połknęła prawdziwego powodu.

Testy: `site-create-errors.test.ts` → „accepts UTC…" + „reports an already-taken
code even when another field is rejected too"; `sites-settings.test.ts` → „accepts
UTC…".

---

## [N-6 · P1] Czerwony test po zmianie kontraktu

**Znaleziony:** `settings/sites/_actions/sites-settings.test.ts:148-155`,
`it('rejects an invalid IANA timezone')` →
`expect(result).toEqual({ ok: false, error: 'invalid_input' })`.
`updateSiteSettings` zwraca teraz dodatkowo `field` i `message` z
`describeRejection`, a `toEqual` jest ścisłe wobec nadmiarowych kluczy → czerwony.
Poprzednia runda **dotknęła tego samego pliku** (mock w linii 172:
`default_output_location_id` → `default_location_id`), ale asercji w 154 nie
poprawiła.

**Nie osłabiłem asercji — zaostrzyłem.** Stara wersja utrwalała **gorsze**
zachowanie: gołe `invalid_input` bez powodu, które modal renderował jako „This
field is required." na formularzu z wypełnionym polem. Zamiast rozluźnić do
`toMatchObject`, asercja pinuje **pełny nowy kształt**:

```ts
expect(result).toEqual({
  ok: false,
  error: 'invalid_input',
  field: 'timezone',
  message: 'Timezone: not a valid IANA time zone name (for example Europe/Warsaw or UTC).',
});
```

Regres z powrotem do gołego kodu **wywala ten test**. Nazwa testu zaktualizowana
(„…naming the field and the reason"), powód opisany w komentarzu przy asercji.

Poza tym: cross-check całego repo (subagent) nie znalazł **żadnego innego**
czerwonego testu — przeszukane `apps/web/tests/`, wszystkie `__tests__/`,
`*.test.ts(x)` pod `actions/infra/` i `settings/{sites,infra}/`, `packages/db/__tests__/`,
`e2e/`, oraz repo-wide `toEqual({ ok: false, error: 'invalid_input' })` (39 trafień)
skrzyżowane z 5 miejscami wołania `describeRejection`.

---

## [N-7 · P2] Uppercase nie chroni przed ISTNIEJĄCYM lowercase site'em

**Migracji danych nie pisałem** (zgodnie z poleceniem). Zapytanie diagnostyczne —
liczy realne kolizje wielkości liter przed ewentualnym unikalnym indeksem na
`(org_id, upper(site_code))`:

```sql
-- Kolizje case-insensitive w sites: które kody istnieją w >1 wariancie.
select org_id,
       upper(site_code)                       as normalized_code,
       count(*)                               as variants,
       array_agg(site_code order by site_code) as raw_codes,
       array_agg(id        order by site_code) as site_ids
  from public.sites
 group by org_id, upper(site_code)
having count(*) > 1
 order by variants desc, org_id;
```

Pusty wynik = można od razu założyć `create unique index concurrently … on
public.sites (org_id, upper(site_code))` i uppercase w aplikacji przestaje być
jedyną obroną. Niepusty = najpierw decyzja biznesowa, który wariant przeżywa
(scalanie site'u dotyka work orderów, magazynów i linii — nie do zrobienia
migracją bez właściciela danych).

To samo dla linii (`upsertLine` też uppercase'uje kod, ta sama klasa problemu):

```sql
select org_id, site_id, upper(code) as normalized_code, count(*) as variants,
       array_agg(code order by code) as raw_codes
  from public.production_lines
 group by org_id, site_id, upper(code)
having count(*) > 1;
```

Bieżący stan `sites.ts` jest opisany komentarzem `ponytail:` przy `CodeInput` —
normalizuje **nowe** zapisy, istniejące wiersze zostawia.

---

## [N-8 · P2] Nowe komunikaty błędów linii schowane za otwartym modalem

**Potwierdzone.** `submitCreateLine` przy porażce robi `setCreateError(...)` i
`return` — **modal zostaje otwarty**, a banner błędu renderował się w body strony
(`lines-screen.client.tsx:693`), pod nakładką dialogu (`fixed inset-0 z-50`).
Użytkownik widział formularz, który po prostu się nie wysyła, bez powodu
gdziekolwiek na ekranie.

**Fix:** komunikat renderuje się **wewnątrz** dialogu (nad przyciskami
Cancel/Create), a banner strony tylko gdy dialog jest **zamknięty**
(`createError && !createDialogOpen`). Oba są wzajemnie wykluczające się, więc w
DOM istnieje dokładnie jeden `role="alert"` z tym tekstem — istniejące testy
używające `getByRole('alert')` nie dostaną „found multiple elements".
Dodatkowo `openCreateDialog` czyści `createError` (bo błąd jest teraz w modalu,
więc stary greetowałby użytkownika przy świeżym otwarciu; `openEditDialog` już to
robił).

Test: `page.test.tsx` → „shows a failed save INSIDE the still-open dialog"
(`within(dialog).getByRole('alert')`).

---

## [N-9 · P2] Reguła „inactive tylko gdy niezmienione" ma wyścig

**Naprawione, nie tylko opisane.** `getStoredDefaultLocationId` bierze teraz
`for update` na wierszu `production_lines` — spójnie z protokołem blokad reszty
modułu (`actions/infra/location.ts:112-119` + `:329`, importer CSV lokalizacji).
Blokada trzyma do COMMIT-u, bo `withOrgContext` opakowuje całą akcję w
begin/commit, więc sekwencja „przeczytaj zapisaną wartość → zdecyduj →
zapisz" jest atomowa per linia. Odczyt został **wyniesiony przed** oba carve-outy
i jest robiony **raz** (wcześniej był inline'owany w warunku i wykonywał się
tylko dla nieaktywnej lokalizacji).

Bez blokady: T1 przestawia linię na lokalizację nieaktywną/nieweryfikowalną, T2
czyta stan sprzed T1, uznaje „niezmienione" i commituje po wierzchu decyzji,
której nigdy nie widział. Nowa linia (`id === null`) nie ma czego blokować i nie
ma zapisanej wartości — oba carve-outy są dla niej zamknięte.

Test: „locks the line row before deciding whether the location is unchanged"
(asercja na `for update` w SQL odczytu — wyścigu nie da się odtworzyć na fake
kliencie; realny dowód wymagałby dwóch równoległych transakcji na żywym PG).

---

## Czego NIE jestem pewien

1. **N-3 / odstępstwo od „zawsze".** Świadomie przepuszczam **niezmienioną,
   już zapisaną** lokalizację na linii bez magazynu, żeby nie zamrozić legacy
   wierszy (`updateLine` przenosi ją przez upsert). To jest odstępstwo od litery
   findingu — wymaga decyzji arbitra. Cofnięcie = usunięcie `if (!unchanged)`
   w `actions/infra/line.ts:112`.
2. **N-1 a `site_id` LP.** LP dostaje `site_id` z sesji/WO, a magazyn z
   lokalizacji linii. Przy poprawnie skonfigurowanej linii to ten sam site
   (`upsertLine` pilnuje warehouse↔site, a po tej rundzie także location↔warehouse),
   ale legacy linia skonfigurowana w poprzek site'ów wyprodukuje LP z site'em WO i
   magazynem z innego site'u. **Nie dodałem twardej bramki**, bo blokowałaby
   rejestrację produkcji — a to jest wprost zakazane w findingu. Do rozważenia
   jako osobny finding (walidacja spójności lub raport diagnostyczny).
3. **N-1 a lokalizacja nieaktywna.** Jeśli lokalizacja skonfigurowana na linii
   została później dezaktywowana, output i tak tam idzie (migracja 526 mówi wprost,
   że istniejące przypisania są zachowywane). Nie filtruję po `is_active` —
   fallback w tym przypadku byłby cichą zmianą miejsca składowania.
4. **Trigger z N-2 a kolejność triggerów.** `production_lines` ma już triggery
   (mig 496 routing-lock na `site_id`, mig 498 warehouse↔site). Triggery BEFORE
   odpalają się w kolejności alfabetycznej nazw i każdy widzi NEW poprzednika;
   mój dotyka wyłącznie dwóch kolumn lokalizacji, więc interferencji nie widzę —
   ale **nie odpaliłem tego na żywym PG** (zakaz uruchamiania migracji), więc
   post-check sekcji 5 jest tu jedynym dowodem i zweryfikuje się dopiero na bramce.
5. **Nowe testy nie były uruchomione** (zakaz). Najbardziej narażony jest
   `register-output-line-target.test.ts` — jedzie przez cały `registerOutput` aż do
   `upsertWac`. Zminimalizowałem ryzyko kopiując harness z przechodzącego
   `register-output-transaction-safety.test.ts` i zatrzymując przepływ w tym samym
   miejscu, ale kolejność bindów w insercie `license_plates` (`params[1]` =
   warehouse, `params[2]` = location) pinuję z odczytu kodu, nie z runu.
6. **`page.test.tsx` / N-8:** referencja `dialog` jest brana przed odświeżeniem
   stanu. React zachowuje ten sam węzeł DOM (dialog nie odmontowuje się przy
   błędzie), więc `within(dialog)` powinno działać — gdyby bramka zgłosiła
   problem, wystarczy pobrać dialog ponownie po `waitFor`.
