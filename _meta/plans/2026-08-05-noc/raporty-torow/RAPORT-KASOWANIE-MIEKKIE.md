# Kasowanie miękkie — czy skasowany rekord wraca? (Codex, 2026-08-06 00:35)

**NAJGROŹNIEJSZE:** użytkownik zdeprowizjonowany przez SCIM **nadal przechodzi główną
bramkę dostępu** — SCIM ustawia `deleted_at`, a bramka sprawdza wyłącznie `is_active`.

Repo używa **trzech konwencji** kasowania miękkiego: `deleted_at`, `voided_at`,
`deactivated_at`+`active`. To samo w sobie jest znaleziskiem architektonicznym.

Tak. Potwierdziłem kilka ścieżek, w których rekord po kasowaniu miękkim wraca do obliczeń, walidacji albo autoryzacji. Najgroźniejsza pozwala użytkownikowi zdeprowizjonowanemu przez SCIM nadal przechodzić główną bramkę dostępu.

## 1. TABELE Z KASOWANIEM MIĘKKIM

Repo używa trzech konwencji — to jest znalezisko architektoniczne:

- `deleted_at` — standardowe kasowanie miękkie.
- `voided_at` — wycofanie dowodu/audytowalnego rekordu.
- `deactivated_at` razem z `active` — wycofanie środka trwałego.

Nie znalazłem `is_deleted` ani `archived_at`.

Fizyczne relacje:

- `users`
- `unit_of_measure`
- `uom_custom_conversions`
- `compliance_docs`
- `fg_npd_ext`
- `product_legacy` — dawny `product`, obecnie szkielet utrzymujący stare FK
- Shipping:
  - `customers`
  - `customer_contacts`
  - `customer_addresses`
  - `customer_allergen_restrictions`
  - `customer_item_prices`
  - `sales_orders`
  - `sales_order_lines`
  - `inventory_allocations`
  - `waves`
  - `pick_lists`
  - `pick_list_lines`
  - `shipments`
  - `shipment_boxes`
  - `shipment_box_contents`
  - `bill_of_lading`
  - `rma_requests`
  - `rma_lines`
- `equipment` — `active` + `deactivated_at`
- `trial_batches` — `voided_at`
- `technical_sensory_evaluations` — `voided_at`

Specjalny przypadek produktu: `public.product` nie jest już tabelą, lecz nieprzefiltrowanym widokiem `items JOIN fg_npd_ext`; `deleted_at` pochodzi z `fg_npd_ext`. Stary `product_legacy` nadal istnieje jako kotwica FK. Dowód: [359-product-as-items-view-cut.sql:37](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/359-product-as-items-view-cut.sql:37>) i [359-product-as-items-view-cut.sql:61](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/359-product-as-items-view-cut.sql:61>).

Schemat Drizzle nie nadąża za migracjami:

- `users` nie ma `deletedAt` w [settings-core.ts:56](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/schema/settings-core.ts:56>).
- `technical_sensory_evaluations` nie ma kolumn `voided_*` ani `npd_project_id` w [technical-sensory-evaluations.ts:30](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/schema/technical-sensory-evaluations.ts:30>), mimo że dodała je migracja [516-npd-sensory-project-integrity.sql:7](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/516-npd-sensory-project-integrity.sql:7>).

## 2. PROPORCJE

Liczyłem unikalne statyczne literały SQL w kodzie runtime `apps/web` i `packages`; testy, seedy, backupy i historyczne treści migracji są wyłączone. „Pamiętają” oznacza jawny warunek dla właściwego aliasu. `users.is_active=true` nie liczy się, bo SCIM zmienia wyłącznie `deleted_at`.

Bieżące funkcje i widoki SQL z migracji oceniłem osobno w znaleziskach, żeby nie liczyć wielokrotnie starych, zastąpionych wersji.

| tabela / powierzchnia | miejsc odczytu | pamiętają | zapominają |
|---|---:|---:|---:|
| `users` | 94 | 7 | 87 |
| `unit_of_measure` | 9 | 9 | 0 |
| `uom_custom_conversions` | 2 | 2 | 0 |
| `compliance_docs` | 5 | 4 | 1 |
| `public.product` → `fg_npd_ext` | 49 | 13 | 36 |
| bezpośrednie `fg_npd_ext` | 1 | 0 | 1 |
| `product_legacy` | 0 | 0 | 0 |
| `customers` | 25 | 11 | 14 |
| `customer_contacts` | 2 | 2 | 0 |
| `customer_addresses` | 5 | 4 | 1 |
| `customer_allergen_restrictions` | 2 | 2 | 0 |
| `customer_item_prices` | 3 | 3 | 0 |
| `sales_orders` | 23 | 17 | 6 |
| `sales_order_lines` | 24 | 17 | 7 |
| `inventory_allocations` | 11 | 7 | 4 |
| `waves` | 0 | 0 | 0 |
| `pick_lists` | 4 | 4 | 0 |
| `pick_list_lines` | 4 | 4 | 0 |
| `shipments` | 29 | 26 | 3 |
| `shipment_boxes` | 27 | 25 | 2 |
| `shipment_box_contents` | 17 | 15 | 2 |
| `bill_of_lading` | 0 | 0 | 0 |
| `rma_requests` | 2 | 2 | 0 |
| `rma_lines` | 3 | 3 | 0 |
| `equipment` (`active=true`) | 20 | 3 | 17 |
| `trial_batches` | 8 | 2 | 6 |
| `technical_sensory_evaluations` | 6 | 5 | 1 |

Wysoki wynik „zapominają” nie zawsze oznacza błąd. Przykładowo użytkownik, urządzenie albo klient muszą pozostać widoczni w historii audytu. `trial_batches` celowo pokazuje wycofane próby jako dowód. Do znalezisk poniżej awansowałem wyłącznie miejsca z konkretnym skutkiem użytkowym.

## 3. ZNALEZISKA

### Krytyczne — użytkownik skasowany przez SCIM nadal może działać

SCIM przy `active=false` wykonuje wyłącznie:

```sql
deleted_at = now()
```

Dowód: [Users/[id]/route.ts:184](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/api/scim/v2/Users/[id]/route.ts:184>).

Główna bramka wszystkich Server Actions robi natomiast:

```sql
select org_id, is_active
from public.users
where id = $1::uuid
```

i odrzuca tylko `is_active=false`: [with-org-context.ts:243](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/auth/with-org-context.ts:243>). SCIM nie zmienia `is_active`.

Osobna bramka skanera także sprawdza tylko `is_active=true`: [scanner/auth.ts:15](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/lib/scanner/auth.ts:15>).

Scenariusz: administrator usuwa pracownika w IdP. SCIM ustawia `users.deleted_at`. Pracownik ze zweryfikowaną, nadal ważną sesją Supabase wywołuje Server Action — `withOrgContext` nadal przypisuje mu organizację i dopuszcza operację. Jeżeli ma PIN skanera, lookup e-maila również nadal go znajduje.

Test SCIM sprawdza tylko, czy `deleted_at` został ustawiony, nie próbuje wykonać autoryzowanej operacji po usunięciu: [users.integration.test.ts:427](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/__tests__/scim/users.integration.test.ts:427>). Test jest dodatkowo wyłączany bez `DATABASE_URL`: [users.integration.test.ts:44](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/__tests__/scim/users.integration.test.ts:44>).

### a) Unikalność licząca skasowane

#### Wysokie — nie można ponownie dodać restrykcji alergenu klienta

Indeks:

```sql
unique (org_id, customer_id, allergen_id)
```

nie ma `WHERE deleted_at IS NULL`: [211-shipping-schema-foundation.sql:208](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/211-shipping-schema-foundation.sql:208>).

Kasowanie ustawia `deleted_at`: [customer-allergen-actions.ts:294](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.ts:294>), a ponowne dodanie jest zwykłym `INSERT`: [customer-allergen-actions.ts:178](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.ts:178>).

Scenariusz: użytkownik usuwa „klient odrzuca mleko”, po czym chce dodać tę samą restrykcję ponownie. Nie widzi jej na liście, ale stary wiersz blokuje `INSERT`; otrzyma ogólny błąd zapisu.

Test sprawdza samo ustawienie `deleted_at`, ale nie sekwencję usuń → dodaj ponownie: [customer-allergen-actions.test.ts:189](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/shipping/customers/_actions/customer-allergen-actions.test.ts:189>).

#### Średnie — dezaktywowana cena blokuje ponowne użycie tej samej daty

Unikalność `(org_id, customer_id, item_id, effective_from)` również obejmuje skasowane rekordy: [460-customer-item-prices.sql:30](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/460-customer-item-prices.sql:30>).

Po dezaktywacji [customer-item-prices-actions.ts:391](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(admin)/settings/customer-prices/_actions/customer-item-prices-actions.ts:391>) ponowny `INSERT` dla tej samej daty [customer-item-prices-actions.ts:286](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(admin)/settings/customer-prices/_actions/customer-item-prices-actions.ts:286>) zwraca `conflict`.

Scenariusz: administrator dezaktywuje błędny cennik i próbuje wprowadzić poprawioną cenę od tej samej daty. Starego wpisu nie widzi, ale system odmawia utworzenia nowego.

Za poprawne uznaję nieprzefiltrowane unikalności trwałych identyfikatorów: kod UOM, kod produktu/urządzenia/klienta, e-mail użytkownika, SO/wave/pick/shipment/BOL/RMA oraz SSCC. Ich ponowne użycie uszkodziłoby historię albo zewnętrzne dokumenty. Wersje dokumentów compliance także celowo pozostają monotoniczne — stąd `max(version_number)` obejmujący skasowane dokumenty nie jest błędem.

### b) Powiązanie ze skasowanym rodzicem

#### Wysokie — skasowany produkt nadal jest prawidłowym rodzicem

`public.product` jest nieprzefiltrowanym widokiem. Stary `product_legacy` pozostaje fizycznym szkieletem dla FK i przy soft-delete nie jest kasowany.

Potwierdzone zapisy bez sprawdzenia `deleted_at`:

- Tworzenie BOM-u: [create-draft.ts:54](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/bom/_actions/create-draft.ts:54>).
- Wgrywanie dokumentu compliance: [upload-doc.ts:95](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/docs/_actions/upload-doc.ts:95>).
- Dodawanie override alergenu: [set-allergen-override.ts:131](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/set-allergen-override.ts:131>).
- Edycja komórki FA: [update-fa-cell.ts:143](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/update-fa-cell.ts:143>).
- Funkcja DB materializująca `prod_detail`: [434-sync-prod-detail-formulation-fallback.sql:32](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/434-sync-prod-detail-formulation-fallback.sql:32>).

Scenariusz: manager usuwa FA, ale inny operator ma otwartą starą kartę. Wysłanie formularza może nadal utworzyć BOM, dokument lub override albo zmodyfikować skasowany produkt.

#### Wysokie — MWO można przepiąć na wycofane urządzenie

Aktualizacja MWO pobiera urządzenie bez `active=true`: [mwo-actions.ts:1102](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:1102>) i następnie zapisuje je do zlecenia: [mwo-actions.ts:1149](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/maintenance/_actions/mwo-actions.ts:1149>).

Ścieżka tworzenia nowego MWO sprawdza `active`, ale ścieżka edycji nie.

Scenariusz: urządzenie zostaje wycofane, gdy ktoś ma otwarty formularz MWO. Zapis starego formularza przypisuje zlecenie do wycofanego urządzenia.

Testy obejmują aktywne urządzenia i blokadę reaktywacji harmonogramu, ale nie edycję MWO z `active=false`.

### c) Sumy i raporty liczące skasowane

#### Wysokie — dashboard NPD liczy usunięte produkty

Dashboard pobiera wszystkie produkty organizacji bez sentinela: [get-dashboard-summary.ts:209](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/get-dashboard-summary.ts:209>), a potem zwiększa `done`, `pending` i `blocked` dla każdego zwróconego produktu.

Alerty launch również czytają nieprzefiltrowany `product`: [get-launch-alerts.ts:70](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/get-launch-alerts.ts:70>).

Scenariusz: manager usuwa FA. Po odświeżeniu dashboard nadal pokazuje ją jako brakującą/blocked, zawyża liczniki działów i może nadal generować czerwony alert startowy.

Test dashboardu jest DB-gated przez `DATABASE_URL`: [dashboard-actions.test.ts:16](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/dashboard/_actions/__tests__/dashboard-actions.test.ts:16>) i nie znalazłem scenariusza ze skasowanym produktem.

#### Wysokie — widok kaskady alergenów zwraca usunięte produkty

Aktualna definicja agreguje alergeny i kończy się:

```sql
from product p;
```

bez filtru: [391-allergen-cascade-from-wip-processes.sql:98](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/391-allergen-cascade-from-wip-processes.sql:98>).

Sam ekran wyboru FG również czyta `public.product` bez filtru: [allergen-cascade/page.tsx:133](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(npd)/allergen-cascade/page.tsx:133>).

Scenariusz: skasowane FA wraca do selektora alergenów, a widok nadal wylicza i prezentuje dla niej deklarację.

Dla porównania funkcja kolejkująca przebudowę w tej samej migracji poprawnie używa `product.deleted_at is null`: [391-allergen-cascade-from-wip-processes.sql:141](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/391-allergen-cascade-from-wip-processes.sql:141>). To pokazuje, że brak w widoku nie jest globalną decyzją projektową.

#### Niższe, obecnie utajone — dashboard wysyłek

Dwa `count(*)` w [dashboard-summary.ts:145](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/_actions/dashboard-summary.ts:145>) nie filtrują `shipments.deleted_at`.

Nie znalazłem jednak aktywnej ścieżki aplikacyjnej ustawiającej `shipments.deleted_at`, więc nie promuję tego do potwierdzonego błędu użytkowego. To defekt gotowy ujawnić się po dodaniu takiej operacji lub po imporcie danych.

Nie znalazłem dowodu, aby WAC/FIFO, OEE albo podstawowe sumy stanów magazynowych agregowały którąkolwiek z wykrytych tabel soft-delete bez filtru.

### d) Kasowanie bez właściwej kaskady

#### Wysokie — skasowane linie SO blokują usunięcie projektu NPD

Kontrola „FG jest na zamówieniu” sprawdza `sales_order_lines` bez `sol.deleted_at is null` i bez aktywnego rodzica SO: [project-fg-sync.ts:123](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/pipeline/_actions/_lib/project-fg-sync.ts:123>).

Scenariusz: użytkownik tworzy draft SO z FG, potem usuwa zamówienie — linie są poprawnie soft-deletowane. Następnie próbuje usunąć projekt NPD. Niewidoczna linia nadal powoduje `LINKED_FG_ON_ORDER`, więc projektu nie da się skasować.

#### Wysokie — martwe alokacje i zawartości kartonów blokują reversal TO

Lista oraz właściwa operacja reversal sprawdzają samo istnienie wierszy:

```sql
exists (select 1 from inventory_allocations ...)
exists (select 1 from shipment_box_contents ...)
```

bez `deleted_at` i, dla alokacji, bez ograniczenia do żywych statusów:

- [actions.ts:285](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/actions.ts:285>)
- [reverse-receive.ts:180](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/reverse-receive.ts:180>)

Scenariusz: zawartość kartonu zostaje soft-deletowana podczas anulowania wysyłki albo alokacja zostaje zwolniona. Operator próbuje odwrócić przyjęcie TO. Interfejs pokazuje blokadę, a akcja zwraca `lp_active/outbound_shipments`, mimo że aktywnego powiązania już nie ma.

Test `reverse-receive.test.ts` sprawdza konsumpcje i korekty, lecz nie skasowaną zawartość kartonu ani zwolnioną/skasowaną alokację.

#### Wysokie — usunięcie produktu nie wycofuje dokumentów compliance

`deleteFa` aktualizuje wyłącznie `public.product`: [delete-fa.ts:129](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/delete-fa.ts:129>).

Lista dokumentów filtruje `compliance_docs.deleted_at`, ale nie sprawdza, czy produkt nadal żyje: [list-docs.ts:27](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/[productCode]/docs/_actions/list-docs.ts:27>). Upload również akceptuje skasowany produkt.

Scenariusz: manager usuwa FA, a użytkownik wchodzi przez zapisany URL dokumentów. Stare dokumenty nadal są zwracane, a nowy dokument może zostać dołączony do usuniętego produktu.

Test `delete-fa` dowodzi jedynie, że rekord znika z przefiltrowanego `public.fa`: [delete-fa.test.ts:183](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/(npd)/fa/actions/__tests__/delete-fa.test.ts:183>). Nie sprawdza dzieci ani nieprzefiltrowanego `public.product`.

#### Wysokie — voided sensory evidence można twardo usunąć razem z dziećmi

Migracja mówi wprost „void, never delete”: [516-npd-sensory-project-integrity.sql:1](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/516-npd-sensory-project-integrity.sql:1>).

Tymczasem `deleteSensoryEvaluation` bez sprawdzenia `voided_at` najpierw kasuje wyniki i komentarze, następnie samą ocenę: [record-sensory-evaluation.ts:351](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/sensory/_actions/record-sensory-evaluation.ts:351>).

Scenariusz: projekt zostaje usunięty, a jego panel sensoryczny poprawnie otrzymuje `voided_at`. Późniejsze wywołanie akcji delete ze starym `panelId` fizycznie usuwa panel oraz jego dowody.

Test potwierdza tylko, że voided panelu nie da się edytować: [record-sensory-evaluation.test.ts:193](</Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/technical/sensory/_actions/__tests__/record-sensory-evaluation.test.ts:193>). Nie obejmuje `deleteSensoryEvaluation`.

### Mechanizm wspólny

Jedyny wyraźny centralny mechanizm to `public.fa`:

```sql
from public.product
where deleted_at is null
```

[359-product-as-items-view-cut.sql:560](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/359-product-as-items-view-cut.sql:560>).

Problem polega na tym, że większość kodu używa bezpośrednio nieprzefiltrowanego `public.product`: 36 z 49 miejsc. Dla shipping, users, UOM, equipment i sensory nie ma wspólnego aktywnego widoku ani polityki RLS usuwającej martwe wiersze. Filtr jest powtarzany ręcznie.

## 4. CO WYSZŁO CZYSTO

- Wszystkie odczyty `customer_contacts`, `customer_allergen_restrictions`, `customer_item_prices`, `pick_lists`, `pick_list_lines`, `rma_requests`, `rma_lines`, `unit_of_measure` i `uom_custom_conversions` mają właściwy filtr.
- Odczyty aktywnych `technical_sensory_evaluations` konsekwentnie używają `voided_at is null`; problem dotyczy wyłącznie osobnej operacji hard-delete.
- `trial_batches` świadomie zachowuje voided próby na liście i blokuje ich edycję/rebooking. To nie jest zapomniany filtr, lecz audytowalny model wycofania.
- Usunięcie SO poprawnie soft-deletuje jego linie.
- Anulowanie/rozpakowanie wysyłki poprawnie soft-deletuje zawartości kartonów przed kartonami.
- Wycofanie urządzenia dezaktywuje jego harmonogramy PM.
- Org-wide forward trace filtruje `shipment_box_contents`, `shipment_boxes`, `shipments` i `sales_orders` przed `sum(quantity)`: [409-forward-shipments-org-wide-definer.sql:36](</Users/mariuszkrawczyk/Projects/monopilot-kira/packages/db/migrations/409-forward-shipments-org-wide-definer.sql:36>).
- Aktywna unikalność alokacji, domyślnego adresu oraz numeru kartonu ma indeksy częściowe uwzględniające lifecycle.
- Nie znalazłem popartego kodem przypadku, w którym martwe wiersze zmieniają WAC/FIFO, OEE lub podstawowy stan magazynu.

## 5. CZEGO NIE SPRAWDZIŁEM

- Testy: **nie zostało wykonane**.
- Build/typecheck/lint: **nie zostało wykonane**.
- Baza, migracje, kontener Postgresa i stan Supabase: **nie zostało wykonane**.
- Nie mogę potwierdzić, czy DB-gated testy rzeczywiście przechodzą. Wiele używa `DATABASE_URL ? describe : describe.skip`, a część ma rozbudowany `beforeAll`; bez realnego uruchomienia nie da się odróżnić testu wykonanego od pominiętego lub niedoszłego do asercji.
- Proporcje są statycznym audytem literałów SQL. Dynamiczne SQL tworzone poza statycznymi fragmentami może nie wejść do licznika.
- Nie potwierdzałem, czy wszystkie migracje widoczne w repo są zastosowane w konkretnym środowisku produkcyjnym.
