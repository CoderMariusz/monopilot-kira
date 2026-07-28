# FALA 5 — dowód behawioralny na produkcji

**Data:** 2026-07-28
**Commit:** `124e6b71` (main)
**Deploy:** `dpl_2ksFvaTdDwfrivoZ8LM9UEXdHFKq` → `monopilot-kira-p7vn1j004`, build ID `nTkvL_K1Jqh6ajIt3ZTe5`, status Ready
**Organizacja:** Apex 22 (`00000000-0000-0000-0000-000000000002`), użytkownik `admin@monopilot.test`

**Potwierdzenie, że testowany jest NOWY build:** krok „Review & create" kreatora pozycji pokazuje
teraz `Secondary UoM: g` oraz komplet pól catch-weight (`Nominal weight`, `Gross weight max`,
`Tare weight`, `Variance tolerance (%)`) — na starym buildzie tych wierszy nie było. Dodatkowo
kreator ma nowy krok 3 „Weight & shelf life".

Zasada dowodu: **akcja w przeglądarce + stan w bazie (albo log runtime)**. Sam render nie jest dowodem.

---

## Tabela wyników

| # | Znalezisko | Werdykt | Dowód |
|---|---|---|---|
| 1 | **PF-R03-04** — 500 w Units & conversions | ⛔ **NIE NAPRAWIONE** (ale **ROOT CAUSE ZNALEZIONY**) | 3/3 akcje dają HTTP 500, digest `1177263839`; log runtime: `ReferenceError: CreateUnitInputType is not defined`; 0 zapisów w bazie |
| 2 | **PF-R03-02** — catch weight egzekwowany | ✅ **PROVEN** | Pusty gross max → odmowa z komunikatem; `0.00001` → odmowa; poprawny zestaw → `nominal_weight=2.5000`, `gross_weight_max=10.0000`, `variance_tolerance_pct=5.00` w bazie |
| 3 | **PF-R03-01** — Base UoM ≠ Secondary UoM | ✅ **PROVEN** | Komunikat przy polu + krok zablokowany; w bazie `uom_base=kg`, `uom_secondary=g`; Review **pokazuje** Secondary UoM |
| 4 | **PF-R03-03** — shelf life | ✅ **PROVEN** | 0 dni → odmowa z komunikatem; `19` + `best_before` → w bazie `shelf_life_days=19`, `shelf_life_mode=best_before` |
| 5 | **PF-R01-04** — fałszywa dezaktywacja zaproszenia | ✅ **PROVEN** | Świeże zaproszenie: **Resend / Revoke**, **brak Deactivate**; w bazie `is_active=f` + `invite_token` ustawiony; Resend **realnie zrotował token** `79bd17c777bc`→`ca9c25905a43` i uczciwie zgłosił brak wysyłki maila |
| 6 | **PF-R01-03** — nieodświeżające się listy | ✅ **PROVEN** | Po invite wiersz pojawił się **bez ręcznego odświeżenia**; po revoke status zmienił się na `✕ Disabled` **bez przeładowania** |
| 7 | **PF-R06-13** — CTA marszruty | ✅ **PROVEN** | CTA `+ New routing → ?item=F5V-CATCH-01`; ekran routings wybrał `ce4d0e59…` = **F5V-CATCH-01** (3. alfabetycznie — stary bug wybrałby `Box-001`) |
| 8 | **PF-R03-06** — ułamkowe opakowania | ⛔ **NIE NAPRAWIONE** | `each per box = 2.5` **przechodzi** Review (`1 Box = 2.5 × 1 kg`), pada dopiero na submit **ogólnym** „Please check the values and try again." |
| 9 | **PF-R06-12** — Review pokazuje shelf life | 🟡 **PARTIAL** | Secondary UoM ✅ pokazany; **shelf life ⛔ NIE jest pokazany** mimo `19` + `best_before` |

**Podsumowanie: 6 udowodnionych, 2 niedziałające, 1 częściowe.**

---

## 1. PF-R03-04 — 500-tki w Units. ROOT CAUSE ZNALEZIONY

To był najcenniejszy cel i **kliknięcie na żywo dało dokładnie to, czego brakowało analizie statycznej.**

### Odtworzenie — 3/3 akcje padają

| Akcja | Wynik HTTP | Digest | Stan w bazie |
|---|---|---|---|
| (a) Dodanie jednostki masy `F5V01` (Fala5 Verify Mass, factor 0.5) | **500** | `1177263839` | **BRAK WIERSZA** — nadal 12 jednostek |
| (b) Edycja samej nazwy `t` → „Tonne F5V" | **500** | `1177263839` | `name=Tonne`, `updated_at=2026-07-07 15:04:44` — **nietknięte** |
| (c) Dodanie konwersji „F5V Conv pcs to box", factor 12 | **500** | `1177263839` | `uom_custom_conversions` = **0 wierszy** |

Ciało odpowiedzi Server Action (identyczne dla wszystkich trzech):
```
0:{"a":"$@1","f":"","q":"","i":false,"b":"nTkvL_K1Jqh6ajIt3ZTe5"}
1:E{"digest":"1177263839"}
```

### Log runtime z Vercela — sedno sprawy

Trzy wystąpienia, po jednym na każdą akcję, wszystkie z **tym samym** błędem:

```
### 00:21:41 POST /en/settings/units 500 [error/serverless]
dep=dpl_2ksFvaTdDwfrivoZ8LM9UEXdHFKq branch=main cache=MISS
    ReferenceError: CreateUnitInputType is not defined
        at <unknown> (.next/server/chunks/ssr/apps_web_0yet67j._.js:120:452) {
      digest: '1177263839'
    }
```
(pozostałe: `00:17:01` — dodanie jednostki, `00:20:11` — edycja nazwy)

### Przyczyna

`manage-units.ts` linia **32** — moduł ma dyrektywę `'use server'`:

```ts
export type { CreateUnitInputType, CreateUnitResult, UnitsActionError, UnitsActionSubcode };
```

To **lokalny re-eksport typów bez klauzuli `from`**. Wszystkie cztery nazwy to czyste typy
(`units-validation.ts:28` — `export type CreateUnitInputType = z.infer<typeof CreateUnitInput>`),
więc TypeScript je wymazuje. Kompilator modułu `'use server'` wystawia jednak dla nich **wiązanie
runtime** w chunku SSR — a wiązania już nie ma. Stąd `ReferenceError` przy ewaluacji modułu,
czyli **poza ciałami akcji**.

**To potwierdza diagnozę toru T3 co do MIEJSCA** („500 powstaje POZA ciałami akcji — w dispatchu
Server Actions"; akcje zwracają typowany wynik, więc nie mogą dać 500) — ale przyczyna nie została
wtedy znaleziona.

### Dlaczego analiza statyczna diffu nie mogła tego złapać

Linia jest **zastana** — pochodzi z commita `546358f9` („Add m/cm length units…"), a Fala 5
tylko **dopisała do niej** `UnitsActionSubcode`:
```
-export type { CreateUnitInputType, CreateUnitResult, UnitsActionError };
+export type { CreateUnitInputType, CreateUnitResult, UnitsActionError, UnitsActionSubcode };
```
Diff `2eb57cf7..HEAD` po `settings/units/**` faktycznie był pusty w czasie audytu — bug nie leżał
w żadnej zmianie, tylko w linii, której nikt nie ruszał.

### Skala — czy to bomba w innych miejscach?

Przeskanowałem **wszystkie 1955 plików `.ts`/`.tsx`** w `apps/web` (bez testów). Moduły `'use server'`
zawierające `export type { … }`: **9**. Osiem z nich ma klauzulę `from` (re-eksport ze źródła —
kompilator zna źródło i usuwa całość). **Tylko `manage-units.ts:32` nie ma `from`.**

Korelacja jest idealna: **jedyny plik o tym kształcie = jedyny ekran, który pada na każdym zapisie.**

| Plik | Kształt | Status |
|---|---|---|
| `planning/_actions/freight-actions.ts:53` | `} from './freight-types'` | bezpieczny |
| `technical/compliance/_actions/load-compliance.ts:42` | `} from './shared'` | bezpieczny |
| `warehouse/_actions/receive-po-line.ts:247` | `from './receive-po-line.types'` | bezpieczny |
| `(npd)/fa/_actions/set-production-line.ts:23` | `from './set-production-line-types'` | bezpieczny |
| `(npd)/fa/_actions/load-formulation-wip-panel.ts:125` | `from '../_components/…'` | bezpieczny |
| `(npd)/fa/actions/get-component-processes.ts:16` | `from './map-definition-process-chain'` | bezpieczny |
| `lib/production/shared.ts:24, 185` | `from './holds-guard*'` | bezpieczny |
| **`settings/units/_actions/manage-units.ts:32`** | **brak `from`** | ⛔ **PADA** |

### Skutki uboczne zaobserwowane przy 500

- **Trasa przeżywa** — globalny `(app)/error.tsx` nie przejmuje ekranu. Naprawa kontenerowania z
  Fali 5 działa w tym zakresie.
- **Ale użytkownik nie dostaje ŻADNEGO komunikatu.** Modal „Add unit" po 500 **zostaje otwarty
  i pusty** (wszystkie pola znikają, zero tekstu błędu). Zapis nie przeszedł, a ekran tego nie mówi.
- **Modal „Edit unit" zostaje zablokowany** — po 500 nakładka `.modal-overlay` dalej przechwytuje
  kliknięcia, więc reszta strony jest nieklikalna aż do ręcznego przeładowania.

---

## 2. PF-R03-02 — catch weight ✅ PROVEN

Pozycja `F5V-CATCH-01` / „Fala5 Catch Weight Test", Weight mode = **Catch weight**.

| Próba | Wejście | Wynik |
|---|---|---|
| Brak gross max | `nominal=2.5`, `tolerance=5`, `gross=` (puste) | **Odmowa.** Krok 3 nie przepuszcza. Komunikat `role="alert"`: „Catch weight requires nominal weight, gross weight max and a variance tolerance." |
| **Bug samounieważniający** | `nominal=0.00001`, `gross=10`, `tolerance=5` | **Odmowa.** Ten sam komunikat. Wcześniej przechodziło i zapisywało się jako `0.0000` |
| Poprawny zestaw | `nominal=2.5`, `gross=10`, `tolerance=5` | Przechodzi do Review i **zapisuje się** |

Stan w bazie po utworzeniu:
```
 item_code    | uom_base | uom_secondary | weight_mode | nominal_weight | gross_weight_max | tare_weight | variance_tolerance_pct | shelf_life_days | shelf_life_mode
 F5V-CATCH-01 | kg       | g             | catch       |         2.5000 |          10.0000 |             |                   5.00 |              19 | best_before
```

**Uwaga o precyzji komunikatu:** to alert na poziomie kroku (stopka modala), a nie komunikat pod
konkretnym polem. Wymienia trzy pola po nazwie, więc jest akcjonowalny, ale nie jest to ściśle
„field-level" tak jak przy Secondary UoM (patrz niżej).

---

## 3. PF-R03-01 — identyczne UoM ✅ PROVEN

Base UoM = `kg`, ustawiam Secondary UoM = `kg`:

- **Komunikat przy samym polu** (pod comboboxem Secondary UoM):
  „Secondary UoM must be different from Base UoM, or left empty."
- Przycisk **Next nie przenosi** — po kliknięciu krok dalej to nadal `2 Classification`.
- Po zmianie na `g` krok przechodzi, a w bazie: `uom_base=kg`, `uom_secondary=g`.
- **Review DISPLAYS Secondary UoM**: wiersz `Secondary UoM: g` jest obecny. ✅

Selektor oferuje 7 pozycji (`—, kg, g, l, ml, pcs (each), m, cm`) z hardkodowanej stałej, mimo że
Apex 22 ma **12** jednostek w `unit_of_measure` — to znane **PF-R03-05**, świadomie przeniesione
poza tę falę.

---

## 4. PF-R03-03 — shelf life ✅ PROVEN

- `Has shelf life` = zaznaczone, `Shelf life (days)` = **0**, tryb pusty → **odmowa**, krok
  zablokowany, komunikat: „Shelf life needs a positive number of days and a mode — or switch it off."
- `19` + `Best before` → przechodzi; w bazie `shelf_life_days=19`, `shelf_life_mode=best_before`.

---

## 5. PF-R01-04 — fałszywa dezaktywacja ✅ PROVEN

### Zastane zaproszenia (wygasłe) — zachowanie poprawne

Dwa wiersze `⟳ Invited` w Apex 22, oba z **wygasłym** tokenem (`2026-07-22` i `2026-07-09`, dziś `2026-07-28`):

```
e2e-f4r-inv@test.local             => Assign sites / Reset password / Resend
sol-r01-20260715-0511-inv@…test    => Assign sites / Reset password / Resend
```

**Brak Deactivate ✅.** Brak Revoke jest tu **zamierzony i poprawny** — `UPDATE` w Revoke wymaga
`invite_token_expires_at > now()`, więc na wygasłym wierszu byłby trwale niewykonalny
(to naprawa T4-3, udokumentowana w kodzie w `users-screen.client.tsx:53-56`).

### Świeże zaproszenie — pełny cykl

Utworzyłem `f5v-invite-20260728@monopilot.test`:

| Etap | UI | Baza |
|---|---|---|
| Po invite | `⟳ Invited` → **Reset password / Resend / Revoke**, **brak Deactivate** ✅ | `is_active=f`, `invite_token` ustawiony (`79bd17c777bc…`), `expires=2026-08-04 00:35:44` |
| Po **Resend** | „Invitation link renewed for … , **but no email was sent — this deployment has no email transport.** Pass the new invite link on yourself." | token **zmieniony** → `ca9c25905a43…`, `expires=2026-08-04 00:36:17` — **realna rotacja, nie atrapa** |
| Po **Revoke** | „Invitation revoked for … Audit result recorded.", wiersz → `✕ Disabled` / `Reactivate` | `is_active=f`, `invite_token=NULL`, `invite_token_expires_at=NULL` |

Revoke **realnie unieważnia token** — dokładne przeciwieństwo starego buga, gdzie „dezaktywacja"
zostawiała zaproszenie możliwe do wykorzystania.

---

## 6. PF-R01-03 — nieodświeżające się listy ✅ PROVEN

Bez żadnego ręcznego odświeżenia ani nawigacji:
- **po invite** — nowy wiersz `f5v-invite-20260728@monopilot.test` pojawił się od razu,
  komunikat „Invitation sent to …";
- **po revoke** — ten sam wiersz zmienił się w miejscu z `⟳ Invited` (Resend/Revoke)
  na `✕ Disabled` (Reactivate).

---

## 7. PF-R06-13 — CTA marszruty ✅ PROVEN

Zakładka **Routing** pozycji `F5V-CATCH-01` (brak marszruty) pokazuje CTA:
```
+ New routing  ->  /en/technical/routings?item=F5V-CATCH-01
```

Po wejściu pod ten adres combobox **Item** ma wartość `ce4d0e59-d71e-4f96-8c33-f2a8ffb5b498`,
co w bazie odpowiada **`F5V-CATCH-01 | Fala5 Catch Weight Test`**.

Test jest rozstrzygający, bo `F5V-CATCH-01` **nie jest** pierwszy alfabetycznie —
kolejność w Apex 22 to `Box-001`, `E2E-CRUD-0712`, **`F5V-CATCH-01`**, `FG-014`, `FG-016`.
Stary bug wybrałby `Box-001` i utworzył marszrutę dla cudzej pozycji.

---

## 8. PF-R03-06 — ułamkowe opakowania ⛔ NIE NAPRAWIONE

**Odtworzenie:** kreator pozycji → krok 3 → `Output unit = Box`, `net qty per each = 1`,
**`each per box = 2.5`**.

1. **Next przechodzi bez żadnego ostrzeżenia** — brak `role="alert"`, brak komunikatu przy polu.
2. Krok **Review pokazuje wartość niemożliwą fizycznie**:
   `Pack hierarchy: 1 Box = 2.5 × 1 kg = 2.5 kg`
3. Dopiero **„Create item"** kończy się **ogólnym** komunikatem:
   **„Please check the values and try again."** — bez wskazania pola.
4. W bazie: **brak wiersza** `F5V-PACK-01` (serwer odrzucił, dane są bezpieczne).

**Przyczyna w kodzie** — rozjazd klient/serwer, ta sama klasa błędu co T1-1:

`item-create-wizard.tsx:467-468` (klient) sprawdza tylko dodatniość:
```ts
const eachPerBoxValid =
  form.eachPerBox.trim().length > 0 && Number.isFinite(eachPerBoxNum) && eachPerBoxNum > 0;
```
`shared.ts:165-168` (serwer) wymaga liczby **całkowitej**:
```ts
const OptionalPositiveInt = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);
```
Brakuje `Number.isInteger(eachPerBoxNum)` po stronie klienta.

**Dlaczego fala uznała to za naprawione:** commit opisuje R03-06 jako „odrzucane w preview z błędem
per wiersz" — czyli językiem **importu CSV**. Tymczasem oryginalne znalezisko dotyczy **kreatora**
(„pass the client review and fail only generically on submit"), a `each_per_box` **nie jest nawet
kolumną CSV** (`REQUIRED_HEADERS` + `OPTIONAL_HEADERS` w `parse-items-csv.ts:29-43` go nie zawierają).
Naprawa trafiła w ścieżkę, która tego pola nie potrafi wyrazić.

---

## 9. PF-R06-12 — Review a shelf life 🟡 PARTIAL

Commit deklaruje: „Review kreatora pokazuje shelf life i secondary UoM".

Przy `Has shelf life` = zaznaczone, `19` dni, tryb `Best before`, krok Review renderuje **komplet**:
```
Item code, Name, Item type, Status, Base UoM, Secondary UoM, Pack hierarchy, Weight mode,
GS1 GTIN, Nominal weight, Gross weight max, Tare weight, Variance tolerance (%), List price
```
- `Secondary UoM: g` — **jest** ✅
- **`Shelf life` ani `Shelf-life mode` — BRAK** ⛔

Wartości zapisują się poprawnie (`shelf_life_days=19`, `shelf_life_mode=best_before`), ale
użytkownik **nie widzi ich na ostatnim ekranie przed zapisem** — czyli dokładnie to, co PF-R06-12
miało usunąć. Połowa znaleziska pozostaje otwarta.

---

## Nie udowodnione i dlaczego

1. **PF-R03-04 nie został naprawiony — i to jest wynik, nie wymówka.** Odtworzyłem go w 3/3
   akcjach z dowodem w logu runtime i pustą bazą. Zidentyfikowałem przyczynę
   (`export type { … }` bez `from` w module `'use server'`), ale **nie mogłem jej potwierdzić
   eksperymentalnie przez usunięcie linii i redeploy** — zadanie zabrania edycji plików
   źródłowych. Dowód jest poszlakowy, ale mocny: nazwa w `ReferenceError` to dokładnie pierwszy
   identyfikator z tej listy, wszystkie cztery nazwy są typami, a skan całego `apps/web` pokazuje,
   że to **jedyny** moduł `'use server'` o tym kształcie i **jedyny** ekran, który pada.

2. **Nie sprawdziłem `Revoke` na świeżym zaproszeniu w innym locale niż `en`.** Znalezisko T4-4
   (angielskie etykiety na `/pl/settings/users`) nie było na liście do weryfikacji, więc go
   nie testowałem — nie mam podstaw twierdzić ani że działa, ani że nie.

3. **Nie testowałem importu CSV.** PF-R03-06 okazał się defektem kreatora, a nie importu,
   i tam go odtworzyłem. Ścieżki CSV (T1-2 „import zeruje kopertę catch-weight", T1-3 „zielone
   Applied mimo błędu") **nie były na liście** i pozostają niezweryfikowane behawioralnie.

4. **Komunikat catch-weight nie jest ściśle „field-level".** Jest to alert w stopce modala
   wymieniający trzy pola z nazwy, a nie tekst pod konkretnym polem (jak przy Secondary UoM).
   Odmowa jest realna i czytelna, więc raportuję PROVEN, ale odnotowuję rozbieżność z literalnym
   brzmieniem wymagania.

5. **Nie próbowałem obejść żadnej blokady.** Nie forsowałem wyłączonych kontrolek ani nie
   podrabiałem PIN-u e-podpisu. Wyłączone pola `Shelf life (days)` / `Shelf-life mode` przed
   zaznaczeniem `Has shelf life` uznaję za poprawne zachowanie.

6. **Jeden mój wczesny odczyt był fałszywie negatywny i został skorygowany.** Najpierw uznałem
   odmowy w kroku 3 za „ciche", bo szukałem tekstu zbyt wąskim filtrem. Po ponownym sprawdzeniu
   przez `[role=alert]` komunikaty **są obecne**. Odnotowuję to, bo pierwsza wersja tej obserwacji
   była błędna. Powiązany błąd metodyczny: próba wyczyszczenia pola przez `element.value=''`
   nie aktualizuje stanu Reacta i dała pozorne „przepuszczenie" pustego gross max — powtórzone
   poprawnie (fokus + `Ctrl+A` + `Delete`) potwierdziło odmowę.

---

## Nowe defekty

### N-1 · P0 — `export type { … }` bez `from` w module `'use server'` wywraca cały ekran Units
Patrz sekcja 1. Każdy zapis w `/settings/units` daje HTTP 500. **Ekran jest w 100% niefunkcjonalny
od strony zapisu.**
**Repro:** `/en/settings/units` → „+ Add unit" → dowolne poprawne dane → „Save unit" → 500,
digest `1177263839`.
**Naprawa (1 linia):** usunąć `manage-units.ts:32` — konsumenci (`UnitsManager.tsx:25`,
`UnitRowActions.tsx:13`) i tak importują te typy **bezpośrednio z `units-validation.ts`**,
więc ten re-eksport nie ma ani jednego użytkownika.

### N-2 · P2 — po 500 modal „Add unit" pustoszeje bez komunikatu
Po nieudanym zapisie dialog zostaje otwarty, ale traci całą zawartość (pola, nagłówek, przyciski).
Użytkownik nie wie, że zapis się nie udał.
**Repro:** jak N-1, następnie zrzut drzewa dostępności modala — same puste kontenery.

### N-3 · P2 — po 500 modal „Edit unit" blokuje stronę
Nakładka `.modal-overlay` dalej przechwytuje kliknięcia po błędzie; kliknięcia w tło są
odrzucane (`<div class="modal-overlay"> … intercepts pointer events`). Wyjście tylko przez
pełne przeładowanie.
**Repro:** `⋮` przy jednostce `t` → „Edit" → zmiana nazwy → „Save unit" → 500 → próba kliknięcia
w cokolwiek poza modalem.

### N-4 · P2 — ułamkowe `each per box` przechodzi walidację klienta (PF-R03-06 nadal otwarte)
Patrz sekcja 8. Brak `Number.isInteger` w `item-create-wizard.tsx:467-468`.
**Repro:** kreator → `Output unit = Box`, `net qty per each = 1`, `each per box = 2.5` → Next
przechodzi → Review pokazuje `1 Box = 2.5 × 1 kg` → „Create item" → „Please check the values and try again."

### N-5 · P2 — Review nie pokazuje shelf life (PF-R06-12 połowicznie otwarte)
Patrz sekcja 9.
**Repro:** kreator → `Has shelf life` + `19` + `Best before` → krok Review nie zawiera wiersza shelf life.

### Zastane, potwierdzone ponownie (spoza zakresu fali)
- **PF-R03-05** — selektor UoM w kreatorze oferuje **7** hardkodowanych jednostek,
  a rejestr Apex 22 ma **12** (`mg`, `t`, `box`, `EACH`, `pallet` niedostępne).
- **N-1 z rejestru fali** — partycje `audit_log` kończą się `2027-01-01`, brak crona.

---

## Mutacje wykonane na produkcji

| # | Obiekt | Operacja | Stan końcowy |
|---|---|---|---|
| 1 | `items` / **`F5V-CATCH-01`** | **CREATE — powiodła się** | Pozycja **istnieje** w Apex 22: catch weight `2.5000 / 10.0000 / 5.00`, `uom kg/g`, shelf life `19 best_before`. Utworzona celowo jako dowód persystencji |
| 2 | `users` / **`f5v-invite-20260728@monopilot.test`** | INVITE → RESEND → **REVOKE** | Wiersz **pozostaje** jako `is_active=f`, `invite_token=NULL` (konto nieaktywne, token unieważniony). Cykl domknięty revokiem |
| 3 | `items` / `F5V-PACK-01` | CREATE — **odrzucona przez serwer** | **Brak wiersza** — nic nie zapisano |
| 4 | `unit_of_measure` / `F5V01` | CREATE — **HTTP 500** | **Brak wiersza** — nic nie zapisano |
| 5 | `unit_of_measure` / `t` (Tonne) | UPDATE nazwy — **HTTP 500** | **Bez zmian** — `name=Tonne`, `updated_at=2026-07-07` |
| 6 | `uom_custom_conversions` / „F5V Conv pcs to box" | CREATE — **HTTP 500** | **Brak wiersza** — tabela nadal pusta (0) |

Żadnej blokady bezpieczeństwa nie obchodzono. Nie modyfikowano plików źródłowych.
Pozycja `F5V-CATCH-01` i nieaktywny wiersz użytkownika `f5v-invite-…` zostają w Apex 22 jako
dane testowe (zgodnie z konwencją istniejących wierszy `e2e-*` / `sol-*` w tej organizacji) —
do usunięcia, jeśli owner uzna to za wskazane.
