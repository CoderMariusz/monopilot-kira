# FALA-06 / FIX-LOC — hierarchia lokalizacji (post cross-review)

Repo: `monopilot-kira`, branch `main`. Bramka testów/buildu/migracji pozostawiona orchestratorowi —
nic nie uruchamiałem.

**Kierunek utrzymany:** niezmiennik nadal domykany przez **klamrowanie**, nie przez odrzucanie zapisu.
Cross-review miał rację co do tego, że klamrowanie nie było stosowane **spójnie** — i że jedna ścieżka
mimo wszystko odrzucała zapis. To jest naprawione.

Pliki dotknięte:

| plik | co |
|---|---|
| `apps/web/actions/infra/location.ts` | L-1 carve-out, L-2 protokół blokad, L-4 zwrot utrwalonej flagi |
| `apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/_actions/import-location-csv.ts` | L-2 lock rodzica, L-3 klamrowanie w `ON CONFLICT` |
| `…/settings/infra/locations/location-tree-client.tsx` | L-1 UI + ścieżka naprawcza, L-4 render stanu z serwera |
| `…/settings/infra/locations/location-types.ts`, `page.tsx` | typ wyniku + nowa etykieta |
| `apps/web/messages/{en,pl,ro,uk}/02-settings.json` | `parentInactiveLegacyHint` (4 locale) |
| testy | `actions/infra/location-active-parent.test.ts`, `…/__tests__/location-active-parent.client.test.tsx`, `…/_actions/__tests__/import-location-csv.test.ts`, `…/page.test.tsx` |

---

## [L-1 · P1] Aktywny węzeł POŚREDNI pod nieaktywnym rodzicem — **rekord był nieedytowalny**

**Status:** naprawione. Cross-review ma rację, że „tarcie" było błędnym słowem — zapis wracał
`has_active_children`, więc rekordu nie dało się zapisać **w ogóle**.

### Łańcuch przyczynowy (dlaczego to nie było „tarcie")

1. Dialog nie potrafi wyrenderować zaznaczonego checkboxa pod nieaktywnym rodzicem → wysyłał
   `active:false` dla L2, mimo że użytkownik zmieniał wyłącznie **nazwę**.
2. Serwer: `existing.is_active !== false && !active` → prawda → sonda `active_children`.
3. L2 ma aktywne dziecko L3 → `has_active_children` → **zapis odrzucony**. Zmiana nazwy niemożliwa.

Kluczowe: `active:false` **nigdy nie było intencją użytkownika** — wyprodukował je klamrujący UI.
Serwer nie miał jak odróżnić „użytkownik odznaczył" od „UI zaklamrował".

### Poprawka — zachowanie bieżącej flagi przy niezmienionym powiązaniu

`actions/infra/location.ts`:

```ts
const parentInactive = parent?.is_active === false;
const parentLinkUnchanged = existing ? (existing.parent_id ?? null) === input.parentId : false;
const keepsLegacyActive = Boolean(existing && parentInactive && parentLinkUnchanged && existing.is_active !== false);
const active = keepsLegacyActive ? true : input.active && !parentInactive;
```

Tabela decyzji przy **nieaktywnym rodzicu**:

| przypadek | powiązanie | bieżąca flaga | wynik | dlaczego |
|---|---|---|---|---|
| nowy wiersz | — | — | `false` (klamra) | tu powstaje nowe naruszenie |
| istniejący, **przeniesiony** | zmienione | dowolna | `false` (klamra) | zmiana rodzica to świeża decyzja |
| istniejący, powiązanie bez zmian, wiersz **nieaktywny** | bez zmian | `false` | `false` (klamra) | nie wolno aktywować pod nieaktywnym |
| istniejący, powiązanie bez zmian, wiersz **aktywny** (legacy) | bez zmian | `true` | **`true` (zachowane)** | edycja metadanych nie jest prośbą o wyłączenie |

Klamrowanie zostaje wszędzie tam, gdzie zapis **tworzy** albo **przenosi** wiersz — czyli wszędzie tam,
gdzie może powstać *nowe* naruszenie. Carve-out dotyczy wyłącznie danych, które już były niezgodne.

Efekt uboczny, który uważam za poprawę: zmiana nazwy nie wyłącza już po cichu lokalizacji.
Poprzednio zapis metadanych legacy-liścia **dezaktywował go bez pytania** (UI nie pozwalał wyrazić
zgody ani sprzeciwu) — to była cicha zmiana stanu, nie „normalizacja".

### UI + ścieżka naprawcza

`location-tree-client.tsx`: checkbox pokazuje **stan faktyczny** wiersza (zaznaczony, `disabled`),
a zamiast ostrzeżenia „zostanie zapisana jako nieaktywna" (nieprawdziwego w tym przypadku) leci
osobny komunikat z **konkretną ścieżką naprawczą**:

```
This location is active even though its parent is inactive. Editing it here keeps its current
status — reactivate {parent} to repair the hierarchy.
```

`{parent}` = ścieżka rodzica (`R02-L1`, `A › B` dla głębszych). Osobne `data-testid`
(`location-parent-inactive-legacy-hint` vs `location-parent-inactive-hint`), klucz dodany w en/pl/ro/uk.

> Uwaga na przyszłość: `formatLabel` robi `String.replace` ze **stringiem**, więc podmienia tylko
> **pierwsze** wystąpienie placeholdera. Etykieta celowo używa `{parent}` raz.

### Test trzech węzłów (wymagany)

`apps/web/actions/infra/location-active-parent.test.ts` — fixture `L1 (inactive) → L2 (active) → L3 (active)`:

```ts
const L1_ID = '88888888-…'; // L1, INACTIVE
const L2_ID = '99999999-…'; // L2, ACTIVE  pod nieaktywnym L1
const L3_ID = 'aaaaaaaa-…'; // L3, ACTIVE  pod L2

it('lets an active INTERMEDIATE node under an inactive parent be renamed (L1 inactive → L2 active → L3 active)', async () => {
  // `active: false` = dokładnie ten payload, który wysyłał stary dialog i który był odrzucany
  const result = await upsert({
    id: L2_ID, warehouseId: WAREHOUSE_ID, parentId: L1_ID,
    code: 'R02-L2', name: 'Renamed L2', level: 2, locationType: 'storage',
    active: false,
  });

  expect(result).toMatchObject({ ok: true, data: { active: true } });
  expect(currentClient.locations.get(L2_ID)).toMatchObject({ name: 'Renamed L2', is_active: true });
  // nic się nie kaskadowało
  expect(currentClient.locations.get(L1_ID)?.is_active).toBe(false);
  expect(currentClient.locations.get(L3_ID)?.is_active).toBe(true);
});
```

Dołożone obok:
- `preserves the flag whichever activity the dialog sends` — ten sam wynik dla `active:true` (nowy payload UI);
- `still clamps when the SAME row is MOVED under an inactive parent` — pilnuje, że carve-out jest **link-scoped**;
- odpowiednik po stronie UI w `location-active-parent.client.test.tsx` (checked + disabled + hint z ścieżką naprawczą + `active:true` w payloadzie).

**Zmieniona asercja istniejącego testu:** `keeps a PRE-EXISTING non-compliant LEAF editable…` oczekiwał
`is_active:false` po zapisie (normalizacja). Teraz oczekuje `is_active:true` (zachowanie flagi) — to
świadoma zmiana kontraktu wynikająca z [L-1], nie regresja.

---

## [L-2 · P1] Wyścig dezaktywacja-rodzica ↔ utworzenie-dziecka

**Status:** naprawione blokadami wierszy. **Bez migracji / bez triggera.**

`withOrgContext` opakowuje całą akcję w `begin … commit`
(`apps/web/lib/auth/with-org-context.ts`), więc `FOR UPDATE` trzyma blokadę do końca akcji —
to była przesłanka konieczna, sprawdziłem ją zanim cokolwiek zmieniłem.

### PRZYJĘTA KOLEJNOŚĆ BLOKAD (wymagana w raporcie)

> **ANCESTOR-FIRST: najpierw wiersz RODZICA, potem wiersz zapisywany.**
> Blokada zawsze idzie w dół drzewa — przodek przed potomkiem — i tak samo we **wszystkich** writerach.

| writer | kolejność |
|---|---|
| `upsertLocation` | `parent` (`FOR UPDATE`) → `existing` (`FOR UPDATE`) → sonda `active_children` → zapis |
| `deleteLocation` | własny wiersz (`FOR UPDATE`) → licznik dzieci → `DELETE` |
| import CSV (`importOneRow`) | `parent` po `path` (`FOR UPDATE`) → `INSERT … ON CONFLICT` (blokada dziecka bierze się z samego zapisu) |

Dlaczego akurat ta, a nie „po `id` rosnąco": porządek po `id` byłby odporny na odwrotne re-parenty, ale
**rozjeżdżałby się z importem CSV**, który blokuje rodzica jawnie, a dziecko dopiero zapisem. Gdyby
`upsertLocation` brał parę `{existing, parent}` posortowaną po `id`, to dla `id(dziecko) < id(rodzic)`
import (rodzic→dziecko) i upsert (dziecko→rodzic) tworzyłyby cykl. Ancestor-first jest jedynym
porządkiem, który obie ścieżki mogą utrzymać bez dokładania blokad tam, gdzie ich nie potrzeba.

**Reszta ryzyka (świadoma):** dwa *jednoczesne, wzajemnie odwrotne* re-parenty (T_a: X pod Y, T_b: Y pod X)
biorą blokady w odwrotnej kolejności → możliwy deadlock. Jedna z tych operacji i tak jest nielegalna
(cycle guard). Postgres wykrywa deadlock (40P01), ubija jedną transakcję, `catch` zwraca
`persistence_failed`. Żaden niezmiennik nie pęka; to awaria widoczna, nie cicha.

### Jak wyścig jest domknięty

Sekwencja z raportu (T1 liczy 0 aktywnych dzieci, T2 czyta rodzica jako aktywnego, T1 zapisuje rodzica
nieaktywnego, T2 zapisuje aktywne dziecko) jest niemożliwa, bo **oba** writery muszą wziąć blokadę na
**tym samym** wierszu rodzica P zanim cokolwiek policzą lub zapiszą:

- T1 wygrywa → T2 czyta P **po** commicie T1, widzi `is_active=false`, klamruje dziecko na nieaktywne;
- T2 wygrywa → T1 liczy dzieci **po** commicie T2, widzi aktywne dziecko, zwraca `has_active_children`.

Oba porządki kończą się stanem zgodnym.

### Test dwóch współbieżnych transakcji (wymagany)

`location-active-parent.test.ts` → `describe('R02-03 · locations: concurrent parent deactivation and child creation')`.
Fake `makeLockWorld()` **modeluje blokadę wiersza**: `SELECT … FOR UPDATE` zajmuje mutex na `id`
i zwalnia go dopiero na „commicie" (w `finally` mocka `withOrgContext`); blokujące czytanie odczytuje
wiersz **po** przejęciu blokady, więc widzi stan zwycięzcy. `await Promise.resolve()` na wejściu do
każdego statementu wymusza realne przeplecenie dwóch łańcuchów.

```ts
const [deactivateParent, createActiveChild] = await Promise.all([
  upsert({ id: ZONE_ID, parentId: null,     …, active: false }), // T1
  upsert({           parentId: ZONE_ID, code: 'R02-RACE', …, active: true  }), // T2
]);

expect(invariantViolations(world.locations)).toEqual([]);   // ← pada bez `for update`
// …plus asercja, że wygrał dokładnie jeden i drugi się do tego dostosował
```

Test jest **wrażliwy na usunięcie `for update`**: mutex zakłada się na podstawie treści SQL, więc
skasowanie klauzuli natychmiast przywraca przeplot łamiący niezmiennik.

Dodatkowo strukturalny pin (deterministyczny, nie zależy od schedulera):
`locks every row it reasons about, ancestor-first, before writing` — sprawdza, że odczyty
`id::text = $1` idą w kolejności `[parent, existing]`, każdy z `for update`, i **przed** `INSERT`.
Po stronie CSV: `imports a child of an INACTIVE parent as inactive, and takes the parent row lock first`.

---

## [L-3 · P1] `ON CONFLICT` importu mógł PRZENIEŚĆ aktywną lokalizację pod nieaktywnego rodzica

**Status:** naprawione. Intencja „re-import nie wskrzesza wyłączonej lokalizacji" zachowana.

Gałąź `ON CONFLICT` nie tylko odświeża metadane — ustawia też `parent_id`, więc mogła przenieść aktywny
wiersz pod nieaktywnego rodzica, nie ruszając flagi.

```sql
on conflict (org_id, warehouse_id, code) do update set
  parent_id = excluded.parent_id,
  name      = excluded.name,
  level     = excluded.level,
  path      = excluded.path,
  is_active = case
    when locations.parent_id is distinct from excluded.parent_id
      then locations.is_active and excluded.is_active
    else locations.is_active
  end
```

`excluded.is_active` = `$7` = flaga **zablokowanego** rodzica (albo `true` w korzeniu), ten sam bind co przy
insercie — bez nowego parametru.

- **koniunkcja, nigdy przypisanie** — wiersz wyłączony ręcznie zostaje wyłączony (to jest ta „intencja");
- **tylko przy zmianie rodzica** — przy niezmienionym powiązaniu flaga nie jest w ogóle dotykana;
- przeniesienie aktywnego wiersza pod nieaktywnego rodzica → `true and false` = `false`, czyli dokładnie
  ta sama klamra co przy insercie.

Test: `clamps is_active on re-import only when the row is MOVED, and never resurrects a disabled row [L-3]`.
Jest to pin **kształtu SQL** (asercja na treści zapytania + negatywna asercja `is_active = excluded.is_active`),
bo fake klienta z tego pliku nie emuluje semantyki `ON CONFLICT`. Emulowanie `case … is distinct from …`
w JS testowałoby mój własny reimplement, a nie Postgresa. Realną walidację robi bramka (PREPARE na PG).

---

## [L-4 · P1] Ekran pokazywał inną aktywność niż baza

**Status:** naprawione — ekran renderuje wartość **zwróconą z serwera po klamrowaniu**.

Wynik sukcesu niesie teraz utrwaloną flagę (`actions/infra/location.ts` + `location-types.ts`):

```ts
| { ok: true; data: { id: string; path: string; level: number; active: boolean } }
```

Źródłem jest `RETURNING`, nie zmienna policzona przed zapisem:

```ts
const persistedActive = row.is_active !== false;   // to samo idzie do outboxa
```

Klient (`submitDialog`) zamiast `isActive: input.active ?? true` używa `isActive: result.data.active`.
Payload outboxa `settings.location.upserted` też niesie `persistedActive` — konsumenci dostają to,
co jest w bazie.

Test: `renders the activity the server PERSISTED, not the one the dialog asked for` — dialog wysyła
`active:true`, serwer (mock) zwraca `active:false`, panel pokazuje `○ Inactive`.

Zaktualizowane fabryki wyniku w `page.test.tsx` i `location-active-parent.client.test.tsx`
(pole jest wymagane celowo — kompilator wyłapie każde przyszłe miejsce, które zgadywałoby stan).

---

## [L-5 · P2] Argument indukcyjny nie obejmuje istniejących niezgodnych danych — **NIE zamknięte kodem**

**Status: świadomie nienaprawione. Mówię to wprost, zgodnie z poleceniem.**

Niezmiennik jest indukcyjny **tylko przy zgodnym stanie startowym**. Kod domyka wszystkie *przejścia*
(insert, move, dezaktywacja, import), ale **nie leczy danych, które już są niezgodne**. Produkcja może mieć
aktywnego wnuka pod nieaktywnym dziadkiem i po tej fali nadal go mieć.

Co więcej — **[L-1] tę sytuację utrwala celowo**: legacy-wiersz przy edycji metadanych zachowuje flagę,
więc nie „samo-naprawi się przy zapisie". To była cena za edytowalność rekordu i uważam ją za właściwą,
ale trzeba ją nazwać: **jedyną drogą naprawy jest reaktywacja rodzica przez użytkownika** (do której UI
teraz wprost kieruje) albo świadoma migracja danych.

Migracji danych **nie pisałem** — polecenie było „nie pisz bez potrzeby", a masowe wyłączanie aktywnych
lokalizacji na produkcji jest operacją nieodwracalną (traci informację, które wiersze operator wyłączył
świadomie) i wymaga decyzji ownera, nie repair-agenta.

### Zapytanie diagnostyczne — policzy takie wiersze

```sql
-- ile bezpośrednich naruszeń: aktywne dziecko pod nieaktywnym rodzicem
select count(*) as violations
  from public.locations child
  join public.locations parent
    on parent.id = child.parent_id
   and parent.org_id = child.org_id
 where child.is_active
   and parent.is_active is false;
```

Rozbicie per organizacja + magazyn, do oceny skali przed jakąkolwiek decyzją:

```sql
select child.org_id,
       child.warehouse_id,
       count(*)                                as violations,
       min(child.path)                         as sample_child_path,
       min(parent.path)                        as sample_parent_path
  from public.locations child
  join public.locations parent
    on parent.id = child.parent_id
   and parent.org_id = child.org_id
 where child.is_active
   and parent.is_active is false
 group by child.org_id, child.warehouse_id
 order by violations desc;
```

Pełna lista do ręcznego przeglądu (te wiersze użytkownik naprawia reaktywacją rodzica):

```sql
select child.id      as child_id,
       child.path    as child_path,
       parent.id     as inactive_parent_id,
       parent.path   as inactive_parent_path
  from public.locations child
  join public.locations parent
    on parent.id = child.parent_id
   and parent.org_id = child.org_id
 where child.is_active
   and parent.is_active is false
 order by child.org_id, child.path;
```

Sprawdzanie **tylko bezpośredniego** powiązania wystarcza: niezmiennik jest per-krawędź, więc każde
naruszenie w drzewie musi objawić się na co najmniej jednej krawędzi rodzic-dziecko.
`parent.is_active is false` (a nie `not parent.is_active`) — żeby ewentualny `NULL` nie zniknął po cichu.

---

## Czego NIE jestem pewien

1. **Czy uniform „preserve" nie zabiera możliwości dezaktywacji legacy-węzła.** Przy nieaktywnym rodzicu
   `input.active` jest ignorowany, więc L2 nie da się wyłączyć dopóki L1 jest wyłączony. Uznałem to za
   bezkosztowe, bo dialog i tak **nie pozwala** wyrazić takiej intencji (checkbox `disabled`) — ale jeśli
   kiedyś powstanie inny klient tej akcji (API, import), będzie to realne ograniczenie. Alternatywa
   (osobne pole „intencja użytkownika" w payloadzie) była droższa niż wartość.
2. **Zachowanie `next-intl` dla nowego klucza z placeholderem.** `buildLabels` woła `t(key)` bez wartości;
   przy komunikacie z `{parent}` next-intl może zwrócić fallback → wtedy pl/ro/uk pokażą angielski default
   z `page.tsx`. To **istniejąca** właściwość tego ekranu (`expand`, `level`, `dialogDeleteBody` działają
   tak samo i tak samo są trzymane w JSON-ach), więc nie ruszałem `formatLabel` ani `buildLabels` — ale
   nie zweryfikowałem tego runtime'owo.
3. **Test współbieżności jest symulacją, nie prawdziwym Postgresem.** Modeluje blokadę wiersza i przeplot
   w JS. Dowodzi, że *logika akcji* jest poprawna pod serializacją i że usunięcie `for update` łamie
   niezmiennik — **nie** dowodzi, że `FOR UPDATE` faktycznie blokuje pod realnym RLS/Supavisor.
   To jest do potwierdzenia na bramce / prod-E2E.
4. **`FOR UPDATE` a tryb poolera.** Blokada jest poprawna, bo `withOrgContext` trzyma jedną transakcję na
   jednym połączeniu. Przy transaction-mode poolerze (port 6543) to dalej działa — ale wydłuża czas trzymania
   blokady wiersza rodzica na czas całej akcji (łącznie z zapisem outboxa). Przy imporcie CSV
   **każdy wiersz to osobna transakcja**, więc blokada rodzica jest brana i zwalniana N razy pod rząd;
   przy dużym pliku i równoległej edycji tego samego rodzica w UI może to być zauważalne czekanie.
   Nie mierzyłem.
5. **`deleteLocation` dostał `FOR UPDATE`** choć finding go nie wymieniał — to writer czytający własny wiersz
   przed policzeniem dzieci, więc trzymanie go poza protokołem byłoby niespójne. Uznałem, że jedno słowo
   jest tańsze niż wyjątek do udokumentowania; jeśli orchestrator chce ściśle minimalny diff, to jest
   pierwsza rzecz do cofnięcia.
6. **Nie ruszałem plików innych torów** (`line.ts`, `warehouse.ts`, `settings/infra/{lines,warehouses,printers,docks}`,
   `sites`, `users`, `invitations`, `layout.tsx`). `crud.test.ts` jest współdzielony i **nie** był przeze mnie
   edytowany — jego fake dopasowuje SQL po `includes('from public.locations')`, więc dopisane `for update`
   go nie rozjeżdża, a lokalizacje w jego fixture nie mają `is_active` (→ traktowane jako aktywne, bez zmiany
   zachowania). Sprawdziłem to czytając, nie uruchamiając.
