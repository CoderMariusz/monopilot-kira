# FALA-06 / TOR T5 — Raport: Display name w powłoce, adres magazynu, DialogTitle (R01-07, R02-05, R02-07)

## Podsumowanie zmian

| Finding | Plik(i) | Istota |
|---|---|---|
| R01-07 | `lib/shell/shell-identity.ts` (nowy), `app/[locale]/(app)/layout.tsx` | Powłoka czyta tożsamość z `public.users`, `user_metadata` = fallback |
| R02-05 | `actions/infra/warehouse.ts`, `settings/infra/warehouses/**`, 4× `messages/*/02-settings.json` | `renameWarehouse` → `updateWarehouseDetails` (nazwa **+ adres**), zapis `jsonb_set` punktowo |
| R02-07 | `settings/infra/docks/docks-view.client.tsx` | `Modal.Header` zamiast gołego `<h2>` |

---

## [R01-07] Display name — powłoka czyta z `public.users`

**Rozwiązanie:** nowy moduł `apps/web/lib/shell/shell-identity.ts` z dwoma eksportami:

- `loadShellIdentity()` — **jedno** zapytanie po kluczu głównym (`select display_name, name from public.users where id = $1::uuid limit 1`), owinięte w React `cache()`.
- `resolveShellUser(user, row)` — czysta funkcja precedencji + inicjały.

**Precedencja:** `users.display_name` → `users.name` → `metadata.name` → `metadata.full_name` → `email`.
`display_name` wygrywa z `name`, bo tak samo renderuje ekran /account/profile (`profile-data.ts:160` — `row.display_name ?? fullName`); inaczej profil i powłoka dalej pokazywałyby dwie różne wartości.
**Różnica względem profilu:** ja odrzucam też **puste stringi** (`'   '`), profil używa `??` i pusty `display_name` by wygrał. Moja wersja nie potrafi wyrenderować pustego menu użytkownika.

**Koszt na każdej stronie (wymóg ze spec):**
- zapytanie wrzucone do **istniejącego `Promise.all`** w layoucie (obok `getUserSites`/`getActiveSiteId`/…), więc **nie dokłada szeregowej rundy** — tylko jedno dodatkowe zapytanie równolegle;
- `cache()` deduplikuje w obrębie requestu;
- odczyt po PK, **brak N+1** (test to pinuje: `calls).toHaveLength(1)` + asercja na `where id = $1::uuid`).

**Brak wiersza nie wywala powłoki:** `loadShellIdentity` łapie wszystko i zwraca `null` — zarówno brak wiersza (`rows[0] ?? null`), jak i rzut z `withOrgContext` (user bez org, w trakcie zaproszenia, transient DB). Wtedy `resolveShellUser` schodzi do `user_metadata`, a na końcu do maila. Inicjały też idą teraz z utrwalonej nazwy, nie z maila.

Usunięte z layoutu: `shellUserFromSupabase()` i `initialsFor()` (przeniesione do modułu, testowalne bez ładowania całego grafu RSC).

### 📌 Inwentarz czytelników `name` vs `display_name` (do naprawy, NIE naprawiane)

**Fakty schematu** (`packages/db/migrations`):
- `display_name text` — `001-baseline.sql:127`, **nullable, bez defaultu**.
- `name text` — `037-settings-core.sql:196` (fresh DB) / `:207` (istniejące, nullable), backfill `coalesce(u.name, u.display_name, u.email::text)` (`:217-253`), potem **`set not null`** (`:255`).
- Zero constraintów / triggerów / indeksów na obu kolumnach.
- `packages/db/__tests__/settings-core.test.ts:168` wykrywa kolumnę **w runtime** (`columnExists ? 'name' : 'display_name'`) — dowód, że to historyczne alternatywy.

**Zapisujący — tu jest źródło rozjazdu:**

| Ścieżka | `name` | `display_name` |
|---|---|---|
| `account/profile/profile-data.ts:267-273` | ✅ | ✅ (`displayName \|\| fullName`) |
| `actions/users/invite.ts:249-253` | ✅ | ❌ |
| `actions/users/create-user-with-password.ts:252-256` | ✅ | ❌ (dodatkowo kopiuje do `user_metadata.name`, `:232`) |
| `app/api/scim/v2/Users/route.ts:145-148` + `[id]/route.ts:175,195-198` | ❌ | ✅ (PATCH umie ustawić `null`) |
| `migrations/115-npd-gdpr-erasure.sql:58` (sentinel) | `'[anonymised]'` | NULL |

→ **SCIM zapisuje wyłącznie `display_name`, invite/create wyłącznie `name`.** Użytkownik z SCIM jest niewidoczny po nazwie na liście userów (która czyta `name`), i odwrotnie.

**Czytelnicy `display_name` (~28 miejsc)** — wybrane: `_actions/get-document-audit-timeline.ts:113,155,201`; `quality/_actions/ncr-actions.ts:435`; `quality/_actions/inspection-actions.ts:461,468,473,591`; `quality/_actions/ccp-deviation-actions.ts:156,158`; `production/_actions/changeover-actions.ts:168,172,392,396`; `technical/bom/_actions/history.ts:102`, `detail-page.ts:196`; `npd .../trial/_actions/list-trial-batches.ts:100`, `trial/page.tsx:320,324,339`; `pilot/_actions/get-pilot-run.ts:189`, `pilot/page.tsx:256`; `settings/manufacturing-ops/[operation_id]/history/page.tsx:231`; `actions/d365/sync-config.ts:210`; `packages/queries/src/list-fa-history.ts:118,137`, `list-approval-history.ts:110`; SCIM routes.

**Czytelnicy `name` (~22 miejsca)** — wybrane: `settings/users/page.tsx:242,256,314,318,320`; `settings/audit/audit-log-loader.ts:186,193,202,209,223,242`; `settings/roles/page.tsx:185`; `settings/security/page.tsx:190`; `settings/schema/migrations/page.tsx:173`; `settings/tenant/migrations/page.tsx:266` + `export/route.ts:104` (**wychodzi na zewnątrz w CSV**); `settings/promotions/page.tsx:207`; `settings/reference/[code]/[row_key]/history/page.tsx:196`; `quality/_actions/inspection-actions.ts:779`; `production/downtime/_actions/downtime-data.ts:236`; `production/waste/_actions/waste-data.ts:198`; `technical/sensory/_actions/list-sensory.ts:128`; `maintenance/calibration/_actions/list-calibration.ts:105,113,152`; `maintenance/_actions/mwo-actions.ts:431`; `warehouse/adjustments/_actions/adjust-form-actions.ts:104`; `actions/users/invitations-lifecycle.ts:68`; `lib/scanner/auth.ts:16`.

**Mieszani (już robią coalesce, w NIEZGODNEJ kolejności)** — `production/_actions/labor-actions.ts:245` (`display_name, name`), `quality/_actions/hold-actions.ts:578` (`display_name, name`), `ncr-actions.ts:503` (`display_name, name`), `npd/pipeline/page.tsx:327` (**`name, display_name`**), `technical/revisions/_actions/list-revisions.ts:78` (**`name, display_name`**), `approval/page.tsx:684`, `(npd)/pipeline/_actions/get-project.ts:227,264`, `fa/[productCode]/_lib/allergen-cascade.tsx:161`.

**Rekomendacja — kanoniczna kolumna: `name`, ale kanoniczny jest *odczyt*, nie kolumna.**

1. **`name` = tożsamość prawna/systemowa** (już `NOT NULL`, ma backfill, pisze ją invite/create — najmniej ruchu, żeby uczynić ją niezawodną).
2. **`display_name` = opcjonalna nadpiska użytkownika** (nullable, świadomie).
3. **Jedno wyrażenie odczytu wszędzie:** `coalesce(nullif(display_name,''), nullif(name,''), email::text)` — to jest już zachowanie 3 z 9 „mieszanych" miejsc, więc ustala precedens, a nie wymyśla nowy.
4. **Warunek konieczny przed ujednoliceniem: SCIM musi zacząć zapisywać `name`** (`api/scim/v2/Users/route.ts:145`, `[id]/route.ts:175`) — inaczej użytkownik z SCIM ma `name` z NOT-NULL-owego defaultu i po ujednoliceniu wyjdzie na wierzch śmieć.
5. Kandydat na helper: jedna stała SQL (jak `INVITATION_AUDIT_JOIN` z toru T4) zamiast 50 ręcznych coalesce'ów.

**Dwa znaleziska poboczne (nie w scope, warte osobnego findingu):**
- `gdpr_redact_user_pii()` (`115-npd-gdpr-erasure.sql:72+`) przepina FK aktorów na sentinel, ale **nigdy nie czyści `users.name` ani `users.display_name`** — dane osobowe skasowanego podmiotu zostają w wierszu users.
- `lib/auth/saml.ts:334-342` — SAML JIT tworzy usera **bez** `name`/`full_name` w `user_metadata`; przed moją zmianą taki user widział w powłoce swój e-mail. Po zmianie zobaczy `users.name`, o ile wiersz istnieje.
- Korpus testowy (152 inserty do `public.users`) prawie zawsze wpisuje **obie kolumny identycznie** — dlatego rozjazd nigdy nie wychodzi w CI.

---

## [R02-05] Adres magazynu — edytowalny, ale zapis punktowy

**Akcja:** `renameWarehouse` → **`updateWarehouseDetails({ warehouseId, name, address? })`**.
Nie dołożyłem drugiej akcji obok istniejącej — jedna akcja = jeden UPDATE = zapis atomowy i brak dwóch ścieżek zmiany nazwy. `renameWarehouse` usunięte; zaktualizowani wszyscy wołający: `crud.test.ts:450-457`, `warehouses/page.tsx`, `page.test.tsx`, `warehouse-list-screen.client.tsx`.

### Jak zabezpieczyłem `deactivated_at` (PUŁAPKA ze spec)

`public.warehouses.address` to **wspólny blob**, nie tylko adres. Rekonesans potwierdza, że trzyma co najmniej:

| Klucz | Kto pisze / czyta |
|---|---|
| `line1` | `createWarehouse:121`, teraz też edycja |
| `deactivated_at`, `deactivated_by` | `deactivateWarehouse:200-201` (`\|\|`), `reactivateWarehouse:154` (`- klucz`) |
| `city`, `country` | czytane w `warehouses/page.tsx` (`address_label`) |
| `site` | czytane jako fallback `site_label` |
| `capacity_label`/`capacity`, `usedPercent`/`used_percent` | czytane do kolumn Capacity/Used |

Czyli nadpisanie całego obiektu zdmuchnęłoby **nie tylko** `deactivated_at` (= zmartwychwstanie magazynu), ale też capacity i usage.

Zapis jest więc **wyłącznie na kluczu `line1`**:

```sql
set name = $2,
    address = case
      when not $4::boolean then address                                              -- adres nie podany → nie ruszaj
      when $3::text is null then coalesce(address, '{}'::jsonb) - 'line1'            -- czyszczenie → odejmij TYLKO line1
      else jsonb_set(coalesce(address, '{}'::jsonb), '{line1}', to_jsonb($3::text), true)
    end
```

Trzy własności, które to gwarantują:
1. **Każda gałąź bazuje na istniejącym `address`** (`coalesce(address, …)`), nigdy na świeżym obiekcie.
2. **Statement w ogóle nie wymienia `deactivated_at`/`deactivated_by`** — nie może ich dodać, ruszyć ani usunąć.
3. **`$4::boolean` (`addressProvided`) odróżnia „nie podano" od „wyczyść"** — bez tego `address: undefined` z wywołania name-only kasowałoby `line1`.

Typy parametrów są spójne (`$3::text` w obu użyciach, `$4::boolean` w obu) — nie wchodzę w pułapkę przypinania typu parametru rzutem (`pg_bind_param_cast_pins_type`).

**Guard w testach:** `actions/infra/warehouse-address.test.ts` asercjonuje kształt SQL — obecność `jsonb_set` + `'{line1}'` + `coalesce(address, '{}'::jsonb)`, **brak** `address = $n` / `address = $n::jsonb`, **brak** słowa `deactivated_at`. To celowo regression-guard „nie uprość tego", bo fake client nie ma silnika jsonb (patrz „czego nie jestem pewien").

### Site — świadomie NIEedytowalny, powiedziane wprost w UI

Wybrałem drugi wariant ze spec („jeśli nie dopuszczasz — powiedz to wprost w UI"). Uzasadnienie:
- na magazynie wiszą `locations`, `production_lines` i stan (`license_plates`) — przepięcie `site_id` osierociłoby je semantycznie;
- **ścieżka naprawy już istnieje i jest bezpieczna dokładnie wtedy, kiedy powinna:** `deleteWarehouse` blokuje usunięcie tylko przy zależnościach, więc świeżo utworzony magazyn ze złym site'em **można skasować i utworzyć ponownie**. Argument „nie ma żadnej ścieżki korekty" dotyczy adresu, nie site'u.

W dialogu Site jest renderowany read-only + `labels.warehouseSiteLocked`: *„Site cannot be changed after creation — locations, production lines and stock are tied to this warehouse. A warehouse with no dependents can be deleted and recreated."* (PL w `messages/pl`).

Alternatywa (dopuścić zmianę + walidować `locations == 0 && productionLines == 0` przez istniejące `getWarehouseDependents`) jest ~12 linii i można ją dołożyć później bez zmiany kontraktu akcji — sygnalizuję jako świadomie pominiętą.

### UI

- Dialog „Rename warehouse" → **„Edit warehouse"** (Name + Address + read-only Site). Klucze i18n `renameWarehouse*` → `editWarehouse*` w 4 lokalizacjach (`en/pl/uk/ro`), plus nowy `warehouseSiteLocked`.
- **Nowa kolumna Address** w tabeli — używa **istniejącej, dotąd martwej** etykiety `columnAddress`. Bez niej efekt edycji jest niewidoczny: adres pokazywał się tylko jako *fallback* kolumny Site (`site = warehouse.site || warehouse.address`, L688), więc magazyn z przypisanym site'em nigdy adresu nie pokazywał.
- **Prefill z `addressLine1`, nie z `address`.** `address` to sklejka `line1, city, country` (`concat_ws` w `page.tsx`). Wpisanie sklejki z powrotem do `line1` duplikowałoby miasto/kraj przy każdym zapisie. Dołożyłem `w.address->>'line1' as address_line1` do obu wariantów zapytania listy + pole `addressLine1` w typie `Warehouse`.

---

## [R02-07] DialogTitle w dialogu kasowania doku

`docks-view.client.tsx:219-233` — goły `<h2 className="text-lg font-semibold">` zamieniony na `Modal.Header` + `Modal.Body` + `Modal.Footer`, dokładnie jak siostrzany `DockModal` (L292-293). `Modal.Header` renderuje `Dialog.Title` (`packages/ui/src/Modal.tsx:21-23`), więc kontrakt Radix jest spełniony i dochodzi darmowo przycisk zamknięcia (respektuje `deletePending` przez istniejący `onOpenChange`).

**`packages/ui/src/Modal.tsx` — NIE ruszany.** To komponent współdzielony przez całą apkę i równoległe tory; dodanie tam fallbackowego `Dialog.Title` naprawiłoby wszystkich konsumentów naraz, ale w trakcie fali to niekontrolowany blast radius. Zgłaszam jako kandydata na osobny task (patrz niżej).

### 📌 Promotions — ZGŁASZAM, nie naprawiam

`settings/promotions/promotions-screen.client.tsx:255-264` (`modalId="SM-05"`) — **nie jest to jedna linia**, więc zgodnie ze spec zgłaszam:

1. Ten modal ma **własny `<div className="modal-head">` z tytułem ORAZ podtytułem `<p>`** — `Modal.Header` przyjmuje tylko `title`, więc podmiana wymaga przeniesienia podtytułu do `Modal.Body` (≈8 linii, zmiana wizualna).
2. Ma też **efekt ręcznie ustawiający `aria-labelledby`** na węźle dialogu (L207-212). Efekt trzeba by usunąć razem z divem.
3. **Ważne rozróżnienie: to jest tylko ostrzeżenie w konsoli, nie realny brak dostępności** — dzięki temu efektowi dialog **ma** nazwę dostępną. Radix i tak ostrzega, bo szuka własnego `titleId` w DOM. Priorytet niższy niż w dokach, gdzie nazwy nie było wcale.
4. Plik jest poza `settings/infra`, czyli poza moim obszarem własności.

**Rekomendowana poprawka** (do osobnego taska): albo `Modal.Header title={title}` + podtytuł jako pierwszy element `Modal.Body`, albo — lepiej, root-cause dla wszystkich konsumentów — dodać w `packages/ui/src/Modal.tsx` opcjonalny `subtitle` do `ModalHeader` **oraz** visually-hidden fallbackowy `Dialog.Title` w `Modal`, żeby żaden konsument nie mógł już złamać kontraktu.

Zgodnie ze spec **nie ruszałem** `printers-screen.client.tsx` ani `location-tree-client.tsx` (czyste, ręczne divy z poprawnym `aria-labelledby`).

---

## Testy (napisane, NIE uruchamiane)

| Wymóg ze spec | Gdzie |
|---|---|
| powłoka pokazuje zapisany display name, nie `user_metadata` | `lib/shell/shell-identity.test.ts` — „renders the saved display name instead of the stale user_metadata name" |
| brak wiersza w `public.users` → powłoka nie pada, fallback | `shell-identity.test.ts` — „returns null when the user has no public.users row yet" + „swallows a failing lookup instead of taking the whole shell down" |
| edycja adresu utrwala się i **zachowuje** `deactivated_at` | `actions/infra/warehouse-address.test.ts` (kształt zapisu) + `warehouses/page.test.tsx` — „corrects a warehouse address after creation without disturbing its deactivated status" (wiersz po edycji nadal `Deactivated`) |
| dialog kasowania doku ma dostępny tytuł | `docks/docks-view.test.tsx` — „gives the delete dialog an accessible title via Modal.Header" |

Dodatkowo: brak N+1 w powłoce (`calls).toHaveLength(1)`), precedencja `display_name → name → metadata → email`, `invalid_input` przed dotknięciem bazy, `not_found`.

Zmodyfikowane istniejące testy: `crud.test.ts:450-457` (nazwa akcji), `warehouses/page.test.tsx` (mock + typy + „Rename warehouse" → „Edit warehouse").

---

## Czego NIE jestem pewien

1. **Zapis jsonb nie ma dowodu behawioralnego na prawdziwym Postgresie.** Fake client w testach nie ma silnika jsonb, więc `warehouse-address.test.ts` asercjonuje **kształt SQL**, nie efekt. Twardy dowód, że `deactivated_at` przeżywa edycję adresu, musi dać bramka (PREPARE na realnym PG / prod-E2E: dezaktywuj magazyn → zmień adres → sprawdź, że wiersz dalej ma `deactivated_at` i status „Deactivated"). **Proszę to wpisać jako obowiązkowy krok bramki.**
2. **Nie odpalałem `tsc`, buildu ani testów** (zakaz ze spec). Ryzyko w kilku miejscach: layout renderuje się na każdej stronie, a `page.test.tsx` (698 linii) miał hoistowany mock modułu akcji — zmieniłem klucz `renameWarehouse` → `updateWarehouseDetails` w `vi.mock`; jeśli coś przeoczyłem, `page.tsx` dostanie `undefined` zamiast akcji.
3. **`crud.test.ts` jest współdzielony z innym torem** (widzę tam równoległe zmiany dot. `default_location_id` w liniach). Możliwy konflikt merge'a — moja zmiana to wyłącznie 3 linie w teście magazynu.
4. **Kolumna Address zmienia szerokość tabeli magazynów** — nie weryfikowałem parity wobec prototypu (`org-screens.jsx:191-252`). Asercja nagłówków w `page.test.tsx:403` jest whitelistą, nie liczbą kolumn, więc testy nie powinny paść, ale wizualnie warto zerknąć.
5. **RLS na `public.users`** — zakładam, że rola `app_user` w `withOrgContext` widzi własny wiersz, bo tą samą drogą czyta go `profile-data.ts:131`. Jeśli w jakimś org-context tak nie jest, powłoka po cichu zejdzie do fallbacku (nie padnie), ale fix będzie „nie działał" — warto sprawdzić na prodzie na koncie z SAML/SCIM.
6. **Harness e2e `shell-parity.ts`** ustawia `user_metadata.name = 'Shell Parity'`, a `settings-users-parity-evidence.spec.ts:164` sieje `users.name = 'Shell Parity'` — te same wartości, więc nie spodziewam się regresji, ale to e2e poza bramką jednostkową.
7. **Świadomie pominięte:** walidowana zmiana site'u (opisana wyżej), zdarzenie outbox przy edycji magazynu (`renameWarehouse` też go nie emitował — nie chciałem wprowadzać nowego typu zdarzenia, który może odbić się o `outbox_events_event_type_check`), naprawa promotions, fallbackowy `Dialog.Title` w `packages/ui/src/Modal.tsx`.
