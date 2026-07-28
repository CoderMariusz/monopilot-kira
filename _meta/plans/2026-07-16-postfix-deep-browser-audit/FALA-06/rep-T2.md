# FALA 6 / TOR T2 — Lokalizacje: aktywne dziecko pod nieaktywnym rodzicem (R02-03)

**Task:** `[R02-03 · P1]` Aktywna lokalizacja może powstać pod NIEAKTYWNYM rodzicem.
Repro audytu: `R02-ZONE` → `R02-BIN1` → BIN1 na Inactive → `+ Child` → `R02-SUB1` powstaje **aktywny**.

---

## 1. Którą z trzech opcji audytu wybrałem i dlaczego

Audyt dopuszczał: *„child creation is blocked, defaults inactive, or requires the parent to be reactivated"*.

**Wybrałem opcję drugą — „defaults inactive", w wersji mocnej: KLAMROWANIE (clamp).**

Niezmiennik jest liczony, nie sprawdzany:

```ts
const active = input.active && parent?.is_active !== false;
```

To nie jest walidacja, tylko operacja kraty (`meet`): stan zapisany = koniunkcja tego, o co poprosił
klient, i stanu rodzica. Zapis **nigdy nie może się z tego powodu nie powieść**.

**Dlaczego nie „block" i nie „requires parent reactivated":** obie te opcje to ta sama rzecz —
odrzucenie zapisu — i obie wprost łamią wymaganie anty-over-blockingu. Produkcja **już ma** wiersze
aktywne pod nieaktywnym rodzicem (dokładnie te z repro audytu). Gdyby reguła odrzucała taki zapis,
to każda próba edycji takiego wiersza (zmiana nazwy, typu, kodu kreskowego) kończyłaby się błędem,
dopóki użytkownik nie odznaczyłby „Active". Reguła nie zablokowałaby wtedy *naruszenia* — zablokowałaby
*wiersz*. Klamrowanie daje ten sam stan końcowy w bazie bez ani jednej ścieżki, w której legacy-wiersz
staje się nieedytowalny: zapis przechodzi, a wiersz przy okazji się normalizuje.

Drugi argument: klamrowanie jest **idempotentne i monotoniczne**. Wielokrotny zapis daje ten sam wynik,
a dane zbiegają do zgodności zamiast się rozjeżdżać. Walidacja tego nie daje — zostawia niezgodne
wiersze w bazie w nieskończoność (bo są nieedytowalne, więc nikt ich nie naprawi).

**Cichy zapis został zneutralizowany w UI, nie w serwerze.** Klamrowanie samo w sobie byłoby cichą
podmianą danych („zaznaczyłem Active, zapisało nieaktywne"). Dlatego dialog renderuje **wartość po
klamrowaniu**: gdy wybrany rodzic jest nieaktywny, checkbox „Is active" jest odznaczony, `disabled`
i pojawia się nazwany powód (`parentInactiveHint`). Użytkownik widzi regułę **zanim** kliknie Zapisz.
Serwerowy clamp jest wtedy tylko backstopem granicy zaufania, którego przez UI się nie dotyka.

### Dezaktywacja rodzica (punkt 3 zlecenia) — świadoma decyzja: BLOKADA, nie kaskada

Klamrowanie zamyka jeden kierunek (dziecko dołącza do nieaktywnego rodzica). Drugi kierunek —
wyłączenie rodzica, który ma aktywne dzieci — tworzy dokładnie to samo naruszenie od drugiej strony.

**Wybrałem blokadę z nazwanym powodem (`has_active_children`), świadomie odrzucając kaskadę.**

Uzasadnienie: kaskada jest **nieodwracalna w sensie informacyjnym**. Jeśli strefa Z ma dzieci B1
(aktywne) i B2 (nieaktywne, wyłączone celowo miesiąc temu), to kaskadowe wyłączenie Z spłaszcza oba
do `false`. Ponowna aktywacja Z **nie ma z czego odtworzyć**, że B1 było aktywne, a B2 nie —
ta informacja została nadpisana. Użytkownik nie ma „cofnij"; musi z pamięci odtworzyć stan
poddrzewa. Blokada jest natomiast w pełni symetryczna: wyłącz dzieci → wyłącz rodzica; włącz
rodzica → włącz dzieci. Żaden bit nie ginie.

Blokada jest **wąska i indukcyjna**:

```ts
if (existing && existing.is_active !== false && !active) { /* policz aktywne dzieci */ }
```

- Odpala się **tylko na przejściu** `aktywny → nieaktywny`. Wiersz, który już jest nieaktywny i
  nieaktywny pozostaje, nie jest w ogóle sprawdzany — to jest zawias całego anty-over-blockingu.
- Sprawdza **tylko bezpośrednie dzieci**, nie całe poddrzewo. Niezmiennik jest indukcyjny: jeśli
  każde ogniwo rodzic–dziecko trzyma, to trzyma cały łańcuch przodków. Zapytanie o poddrzewo byłoby
  droższe i nic by nie dodało.
- Łapie też **przenoszenie poddrzewa** pod nieaktywnego rodzica (bo tam `active` też schodzi do
  `false`) — jeden warunek, dwa scenariusze.

---

## 2. Co się dzieje z istniejącymi niezgodnymi danymi

Wiersz niezgodny = `is_active = true`, a jego rodzic ma `is_active = false`.
Odpowiedź wprost, per zachowanie:

| Sytuacja | Zachowanie po zmianie |
|---|---|
| **Lista lokalizacji się renderuje** | Bez zmian. Nie ruszałem zapytania czytającego (`page.tsx` `readLocationData`), nie ma filtra, który mógłby wyciąć wiersz. Drzewo pokazuje dokładnie to co dziś. |
| **Otwarcie niezgodnego dziecka do edycji** | Działa. Dialog się otwiera, wszystkie pola edytowalne, przycisk Zapisz **aktywny** (`parentInactive` celowo **nie** wchodzi do predykatu `valid`). |
| **Zapis niezgodnego dziecka** | `ok: true`. Zmiana nazwy/typu/kodu zapisuje się normalnie, a przy okazji `is_active` schodzi do `false` — wiersz się **sam naprawia**. Nie jest to ciche: przed zapisem checkbox jest odznaczony, wyszarzony i opisany. |
| **Nieaktywny rodzic z aktywnymi dziećmi (edycja rodzica)** | Edytowalny bez ograniczeń. Nie ma przejścia `aktywny → nieaktywny`, więc probe aktywnych dzieci w ogóle się nie wykonuje. Pokrywa to test `…without tripping the guard`, który asercjonuje, że zapytanie `active_children` **nie poszło**. |
| **Ścieżka naprawcza (żeby dziecko ZOSTAŁO aktywne)** | Jedno kliknięcie: **aktywuj rodzica**. `upsert(BIN1, active: true)` przechodzi bez żadnej dodatkowej reguły (przejście idzie w górę, nie w dół), a dziecko nigdy nie było ruszane — całe poddrzewo staje się zgodne bez żadnej migracji danych. |
| **Dropdown „Parent location" na legacy wierszu** | Nieaktywne lokalizacje są usunięte z listy wyboru **z wyjątkiem aktualnego rodzica danego wiersza**, który zostaje i dostaje sufiks `(Inactive)`. To nie kosmetyka: `SelectValue` (`packages/ui/src/Select.tsx:370`) renderuje `options.find(...)?.label ?? value`, więc bez tego wyjątku pole „Parent" pokazałoby **surowy UUID**, a zapis w ciemno mógłby przepiąć wiersz pod root. |

**Jedyny przypadek z tarciem** (uczciwie): legacy-kształt `L1 nieaktywny → L2 aktywny → L3 aktywny`.
Edycja L2 jest przejściem `aktywny → nieaktywny` (bo rodzic jest wyłączony) przy aktywnym dziecku,
więc dostanie `has_active_children` z nazwanym komunikatem. Wiersz **nie jest nieedytowalny** — ma
dwie udokumentowane drogi: aktywować L1 (wtedy nic się nie klamruje i edycja przechodzi), albo
najpierw wyłączyć L3. Świadomie wolę tu nazwany błąd niż cichą kaskadę, która wyłączyłaby L3 bez
pytania. Kształt z repro audytu (`ZONE aktywna → BIN1 nieaktywny → SUB1 aktywny`) **nie** wpada w ten
przypadek — SUB1 jest liściem (cap głębokości = 3), więc jego edycja tylko klamruje.

**Nie dodałem migracji ani triggera — świadomie.** Audyt słusznie zauważa brak CHECK-a/triggera, ale
CHECK nie umie patrzeć na inny wiersz, więc jedyną opcją byłby trigger. Trigger egzekwujący ten
niezmiennik odrzuciłby `UPDATE` na **każdym** istniejącym niezgodnym wierszu — czyli dokładnie
over-blocking, przed którym ostrzega zlecenie — a migracje aplikują się **automatycznie na żywej
bazie przy buildzie Vercela**, więc błąd w warunku trigger'a zamroziłby lokalizacje pilota od razu.
Backfill danych też odpada: nie ma sposobu odróżnić „dziecko celowo aktywne, rodzic pomyłkowo
wyłączony" od odwrotności, a zbiorcze wyłączenie dzieci to ta sama nieodwracalna kaskada, tylko
hurtowo. Zbieżność przez zapisy jest tu bezpieczniejsza niż jednorazowy UPDATE.

---

## 3. Trzy poziomy hierarchii, trzy różne mechanizmy aktywności (analiza, bez kodu)

Zwiad ustalił rozjazd i potwierdzam go w całości — to nie jest kosmetyka, to trzy niekompatybilne
kontrakty na jednej ścieżce nadrzędności `site → warehouse → location`:

1. **`sites.is_active`** — zwykła kolumna boolean. Czytelna, indeksowalna, filtrowalna w SQL.
2. **`locations.is_active`** — też zwykła kolumna, ale **doszła późno** (mig 303) do tabeli z mig 042,
   z komentarzem *„Inactive locations stay in the hierarchy"*. Ten komentarz to właśnie źródło R02-03:
   flaga została zaprojektowana jako **czysto prezentacyjna** (wiersz zostaje w drzewie, tylko jest
   inaczej wyświetlony), więc nikt nie napisał do niej reguły relacyjnej.
3. **`warehouses` — NIE MA kolumny `is_active` w ogóle.** Dezaktywacja magazynu to klucz
   `deactivated_at` **wewnątrz `address jsonb`**, czytany jako `w.address->>'deactivated_at'`
   (`actions/infra/warehouse.ts:200`). Czyli: inny typ (timestamp-w-tekście vs boolean), inne miejsce
   (dokument JSON vs kolumna), inna polaryzacja (obecność klucza = wyłączony).

**Czy mój niezmiennik powinien sięgać magazynu i site'u?** Semantycznie **tak** — aktywna lokalizacja
w wyłączonym magazynie jest równie niespójna jak aktywna lokalizacja pod wyłączoną strefą, a dziś
`page.tsx` nawet nie czyta stanu magazynu do drzewa. Ale **nie zrobiłem tego w tym torze** i uważam,
że nie powinno się tego robić przed ujednoliceniem mechanizmów, z trzech powodów:

- **Nie da się tego zrobić jednym warunkiem.** Musiałbym w `location.ts` czytać `warehouses` i
  parsować `address->>'deactivated_at'` — czyli utrwalić jsonb-owy hack w kolejnym module i wpisać
  go na stałe w granicę zaufania lokalizacji.
- **Zasięg cudzy.** `settings/infra/warehouses/**` należy do równoległego toru; zmiana kontraktu
  aktywności magazynu musi iść stamtąd.
- **Over-blocking skaluje się wykładniczo.** Reguła „lokalizacja aktywna ⇒ magazyn aktywny" na
  produkcji, gdzie magazyny wyłączano bez oglądania się na lokalizacje, dotknęłaby całych magazynów
  naraz, nie pojedynczych binów.

**Rekomendacja do osobnego toru (nie robię tu):** najpierw migracja `warehouses.is_active boolean not
null default true`, wypełniona z `address->>'deactivated_at' is null`, z `deactivated_at` zostawionym
jako pole audytowe „kiedy", nie „czy". Dopiero gdy wszystkie trzy poziomy mają ten sam typ flagi,
opłaca się wprowadzić pojęcie **aktywności efektywnej** (`site ∧ warehouse ∧ wszyscy przodkowie ∧
własna flaga`) jako pochodnej przy odczycie. To jest właściwa docelowa architektura, bo jest
**w pełni odwracalna**: każdy wiersz trzyma własną intencję, wyłączenie przodka zaciemnia poddrzewo
bez nadpisywania czegokolwiek, a ponowna aktywacja przywraca dokładnie poprzedni stan — czyli
znika sam powód, dla którego dziś musiałem wybierać między kaskadą a blokadą. Konsumentem, który
najbardziej na tym skorzysta, jest `lib/warehouse/receive-po-line-core.ts` — dziś sprawdza wyłącznie
`coalesce(l.is_active, true)` na samej lokalizacji, więc przyjmie towar do aktywnego binu leżącego
w wyłączonej strefie.

---

## 4. Co zmieniłem

| Plik | Zmiana |
|---|---|
| `apps/web/actions/infra/location.ts` | Clamp `active`, blokada przejścia `has_active_children`, `getLocation` czyta `is_active`, outbox raportuje wartość po klamrowaniu. |
| `.../settings/infra/locations/location-tree-client.tsx` | Opcje rodzica bez nieaktywnych (z wyjątkiem bieżącego, oznaczonego `(Inactive)`), checkbox „Is active" pokazuje wartość po klamrowaniu + `disabled` + nazwany hint. |
| `.../settings/infra/locations/location-upsert-errors.ts` | Nowy kod `has_active_children` → własny komunikat. |
| `.../settings/infra/locations/page.tsx` | Dwa nowe klucze w typie etykiet i `DEFAULT_LABELS`. |
| `.../settings/infra/locations/_actions/import-location-csv.ts` | **Druga furtka:** import CSV wstawiał wiersze bez `is_active`, więc default kolumny (`true`) robił każde importowane dziecko aktywnym również pod nieaktywnym rodzicem. Nowe wiersze dziedziczą flagę rodzica; gałąź `ON CONFLICT` celowo **nie** rusza `is_active`, żeby ponowny import nie wskrzeszał lokalizacji wyłączonej ręcznie. |
| `messages/{en,pl,ro,uk}/02-settings.json` | `parentInactiveHint`, `hasActiveChildrenError` (sprawdzona parzystość EN/PL — 2111 kluczy, test `02-settings.namespace.test.ts` wymaga równości). |

**Testy (napisane, NIE uruchamiane — zgodnie ze zleceniem):**
- `apps/web/actions/infra/location-active-parent.test.ts` (9 przypadków) — nowy plik z własnym fake
  clientem modelującym `is_active`; **celowo nie dopisany do `crud.test.ts`**, bo tamten plik dzielą
  tory lines/warehouses.
- `apps/web/app/[locale]/(app)/(admin)/settings/infra/locations/__tests__/location-active-parent.client.test.tsx` (5 przypadków).

Pokrycie względem listy ze zlecenia: dziecko pod nieaktywnym rodzicem → powstaje nieaktywne ✔;
dziecko pod aktywnym rodzicem dalej działa ✔; istniejący niezgodny wiersz dalej edytowalny ✔;
serwer klamruje mimo `active: true` w surowym wejściu (asercja na bindzie `$10` i na payloadzie
outboxa) ✔. Plus: blokada dezaktywacji z aktywnymi dziećmi, brak kaskady, ścieżka naprawcza przez
aktywację rodzica, przenoszenie poddrzewa pod nieaktywnego rodzica.

---

## 5. Czego NIE jestem pewien

1. **Nie uruchomiłem niczego** — ani testów, ani `tsc`, ani builda (zakaz w zleceniu). Testy klienckie
   są najbardziej narażone: `getByLabelText(/code/i)` działa tylko dlatego, że pole „Barcode" renderuje
   się dopiero gdy `code` lub `name` jest niepuste, więc zapytanie musi paść **przed** wpisaniem kodu.
   Jeśli bramka to wywali, to jest to problem selektora, nie logiki.
2. **Etykiety w teście klienckim idą przez `Proxy`** (nieprzesłonięty klucz zwraca własną nazwę),
   żeby nie wypisywać ~80 stringów. Jeśli konwencja repo tego nie akceptuje, zamiana na pełny literał
   jest mechaniczna.
3. **Klamruję po BEZPOŚREDNIM rodzicu, nie po całym łańcuchu przodków.** Dla danych zgodnych to
   równoważne (indukcja). Dla legacy-danych oznacza, że aktywne dziecko aktywnego rodzica, którego
   dziadek jest wyłączony, przejdzie bez klamrowania. Świadomie — pełne przejście łańcucha nie usunęłoby
   naruszenia, tylko przeniosło je poziom wyżej, a docelowo rozwiązuje to aktywność efektywna z §3.
4. **Nieaktywne lokalizacje nadal mogą być rodzicem dla wierszy, które już je mają** — i to jest celowe
   (bez tego pole „Parent" pokazuje UUID). Nie sprawdziłem, czy `(Inactive)` doklejone do etykiety
   opcji nie psuje jakiegoś istniejącego selektora E2E dopasowującego ścieżkę po pełnym tekście.
5. **`page.tsx` ma martwego bliźniaka importu CSV** (`postLocationImport`, przypisany do nieużywanej
   stałej w linii ~464; żywą ścieżką jest `_actions/import-location-csv.ts`). Naprawiłem tylko żywą.
   Jeśli ktoś kiedyś podepnie tę stałą z powrotem, dziura R02-03 wróci tą drogą.
6. **Nie wiem, ile realnie jest niezgodnych wierszy na produkcji** — nie wolno mi było użyć psql.
   Zapytanie diagnostyczne dla ownera (samo `select`, bezpieczne):
   `select c.id, c.path from public.locations c join public.locations p on p.id = c.parent_id where c.is_active and not p.is_active;`
7. **Nie ruszyłem `actions/onboarding/create-first-location.ts`** (trzeci writer) — tworzy wyłącznie
   lokalizację root bez `parent_id`, więc nie ma jak naruszyć niezmiennika. Gdyby kiedyś zaczął
   tworzyć dzieci, trzeba go dopisać do listy.
