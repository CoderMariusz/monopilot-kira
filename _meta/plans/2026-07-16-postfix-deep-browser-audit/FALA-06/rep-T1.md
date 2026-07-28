# FALA 6 / TOR T1 — raport (R02-01, R02-04, R02-06)

Branch `main`. Testy **napisane, nie uruchamiane** (bramkę odpala orchestrator).

---

## R02-01 — która kolumna wygrała

**Kanoniczna: `production_lines.default_location_id`.** Potwierdziłem to niezależnie, zanim cokolwiek
zmieniłem — i zgadza się z Twoim ustaleniem, nie z tezą audytu:

| dowód | `default_location_id` | `default_output_location_id` |
|---|---|---|
| pochodzenie | mig **042** (kolumna oryginalna) | mig **337** (dołożona później) |
| indeks | `production_lines_default_location_idx` | brak |
| FK → `locations(id)` | tak | tak |
| model Drizzle (`packages/db/schema/infra-master.ts`) | **jest** (`defaultLocationId`) | **nie ma jej wcale** |
| czytelnicy w kodzie | 4 realne ścieżki (niżej) | tylko własny read-back akcji zapisu |

Teza audytu („czytają go legacy/scanner flows") jest **nieprawdziwa** — scanner czyta
`line.default_location_id` (sprawdziłem oba miejsca, patrz lista niżej).

### Co zrobiłem z osieroconą wartością — **PRZENIOSŁEM** (nie porzuciłem)

`packages/db/migrations/526-production-line-default-location-canonical.sql`

Uzasadnienie: to świadoma konfiguracja operatora (ktoś wszedł na ekran i ustawił wyjście linii),
a nie śmieć po migracji. Porzucenie = ciche skasowanie ustawienia użytkownika, którego on nigdy nie
zobaczył, więc nawet by nie zauważył, że zniknęło. Ryzyko przeniesienia jest zerowe: na produkcji
`default_location_id` jest ustawione w **0 z 13** wierszy, więc nie ma żadnej kolizji do rozstrzygania.

- backfill: `set default_location_id = default_output_location_id where default_output_location_id is not null and default_location_id is null` — **idempotentny** (po pierwszym przebiegu warunek nie łapie już nic);
- wiersze, gdzie **obie** kolumny są ustawione i **różne**: wygrywa kanoniczna, martwa wartość jest porzucana — ale głośno, przez `raise notice` z licznikiem (na prodzie: 0 takich wierszy);
- kolumna przegrana **nie jest kasowana**, tylko oznaczona `comment on column ... 'DEAD as of migration 526 — do NOT read or write...'`, żeby nikt jej nie ożywił i żeby rollout był odwracalny;
- post-check ma **dwie niezależne asercje**:
  1. **inwariant całotabelowy** (bez `limit`, bez „dowolnego wiersza") — żaden wiersz nie może zostać z `default_location_id is null` przy ustawionej martwej kolumnie;
  2. **własny obiekt testowy**: wstawiam własny wiersz `production_lines`, **wykonuję na nim dokładnie to samo zdanie backfillu**, sprawdzam wynik i **wycofuję** go zagnieżdżonym `BEGIN … EXCEPTION … END` (`SAVEPOINT` w PL/pgSQL to błąd składni — użyłem wzorca, który już jest w mig 497). Zielone nie może więc wyjść z „nie było pasujących wierszy".
  Jeśli w bazie nie ma ani jednej lokalizacji do zbudowania wiersza testowego — post-check **rzuca**, a nie po cichu przechodzi.

Wiersz testowy ma `site_id`/`warehouse_id` NULL, więc trigger `production_line_warehouse_site_match`
(mig 498) wychodzi od razu, a `production_lines_guard_site_while_routing_locked` (mig 496) w ogóle
nie odpala (`before update of site_id`).

### Zsynchronizowani czytelnicy/pisarze (pełna lista)

| plik | było | jest |
|---|---|---|
| `apps/web/actions/infra/line.ts` (INSERT + `on conflict do update` + `returning`) | `default_output_location_id` | **`default_location_id`** |
| `apps/web/actions/infra/line.ts` — payload outboxu `settings.line.upserted` | klucz `default_output_location_id` | klucz `default_location_id` |
| `settings/sites/_actions/sites.ts` → `getExistingLineForUpsert` (**dawne L845**) | `default_output_location_id` | **`default_location_id`** |
| `settings/infra/lines/page.tsx` (lista + join lokalizacji) | już kanoniczna | bez zmian |
| `settings/sites/_actions/sites.ts` → `queryLinesForSite` | już kanoniczna | bez zmian |
| `app/api/warehouse/scanner/pick/route.ts` | już kanoniczna | bez zmian |
| `lib/warehouse/scanner/movement.ts` | już kanoniczna | bez zmian |

**Osobny bug wyłapany przy okazji (nie był w zgłoszeniu):** `getExistingLineForUpsert` to
read-modify-write — `updateLine` z ekranu Sites czyta obecną lokalizację i przepycha ją przez
`upsertLine`. Dopóki ten *odczyt* celował w martwą kolumnę, **każda zmiana nazwy/statusu linii z
ekranu Sites kasowała jej domyślną lokalizację** (czytało null → zapisywało null). Sam fix zapisu
by tego nie naprawił, a nawet by to uwidocznił.

Zaktualizowałem też testy, które kodowały złą kolumnę (inaczej bramka byłaby czerwona):
`tests/settings-wiring-contract.test.ts`, `actions/infra/crud.test.ts`,
`actions/infra/line-site-code.test.ts`, `settings/sites/_actions/c010-line-warehouse-site.test.ts`,
`settings/sites/_actions/sites-settings.test.ts`.

---

## R02-04 — nieaktywne lokalizacje

Oba pickery + walidacja serwerowa. Kluczowa decyzja projektowa: **nieaktywne lokalizacje nadal
jadą z serwera, z flagą `isActive`** — a nie są odfiltrowane w SQL. Gdybym odfiltrował je w zapytaniu,
klient (efekt uzgadniający `defaultOutputLocationId` z listą opcji, `lines-screen.client.tsx`)
**wyzerowałby** bieżącą wartość, bo nie znalazłby jej na liście — czyli cicho skasowałby ustawienie
przy najbliższym zapisie i **zamroziłby** linię. To dokładnie ta pułapka, przed którą ostrzega
anty-regresja.

- `settings/infra/lines/page.tsx` → `loadLocationOptions`: dochodzi `is_active` → `isActive`.
- `settings/sites/_actions/sites.ts` → `getLineFormOptions`: to samo (`LineFormLocationOption.isActive`).
- **Jedno miejsce filtrowania dla obu ekranów**: nowy `settings/infra/lines/output-location-options.ts`
  (`buildOutputLocationOptions`). Sites reużywa `LineCreateFields` z ekranu Lines, więc jedna zmiana
  naprawia oba pickery. Wydzieliłem to do zwykłego `.ts` (wzorzec `site-map-pins.ts` z tego repo),
  żeby dało się to przetestować bez renderowania Radix Selecta.
- Reguła: aktywne z **tego samego magazynu** + **zawsze** bieżąca wartość linii, nawet gdy została
  zdezaktywowana (etykieta dostaje sufiks `— inactive`).
- Serwer (`actions/infra/line.ts`) waliduje **ponownie i niezależnie**: lokalizacja musi istnieć
  w organizacji, zgadzać się z magazynem, a jeśli jest nieaktywna — przechodzi **tylko wtedy, gdy
  jest niezmieniona** względem tego, co linia ma zapisane (`getStoredDefaultLocationId`).
  Nowy kod błędu `inactive_location_reference` (osobny komunikat, nie „coś poszło nie tak").

**Przy okazji zamknięta dziura:** stary warunek brzmiał `if (locationId && warehouseId)` — gdy linia
nie miała magazynu, walidacja **nie odpalała się w ogóle**, więc przechodził dowolny UUID lokalizacji,
także **z cudzej organizacji** (RLS nie chroni sprawdzenia FK). Teraz waliduje się zawsze, gdy podano
lokalizację.

**Anty-regresja pokryta testami w obie strony:** linia z nieaktywną lokalizacją daje się zapisać
(zmiana nazwy przechodzi), ale podmiana na *inną* nieaktywną jest odrzucana, a przejście na aktywną działa.

---

## R02-06 — duplikat site raportowany jako „brakujące pole"

1. **`invalid_input` ≠ „brakujące pole".** Serwer nie zwraca już samego kodu błędu — `describeRejection()`
   robi z odrzucenia zoda **`message` + `field`**. Rozróżnia realny brak wartości
   (`invalid_type` + `received: 'undefined'` → „…: this field is required.") od odrzucenia walidacji
   (→ prawdziwy powód). `mapError` przestał mapować `invalid_input` → `errorRequired`; teraz preferuje
   komunikat z serwera, a jako ostateczność daje `errorGeneric` (uczciwe „nie wiem"), nie kłamstwo.
   Komunikat refine'a timezone zmieniłem na akcyjny: *„not a valid IANA time zone name (for example
   Europe/Warsaw or UTC)"* — bo to pole jest free-textem i „invalid" nie mówiło, co wpisać.
   Objąłem tym też `updateSiteSettings`/`renameSite`/`updateLine`/`createLine` oraz **`EditSiteSettingsModal`**,
   który miał własny, identycznie kłamiący mapper (ten sam free-textowy timezone).
2. **Zakotwiczenie błędu.** `AddSiteModal` renderuje komunikat **przy polu**, którego dotyczy
   (`field` z serwera → id inputu), i **fokusuje** ten input (przewinięcie w kadr gratis). Gdy serwer
   nie wskaże pola, alert idzie na **górę** `Modal.Body`, a nie pod sześć pól w scrollowanym kontenerze.
   `data-testid="sites-modal-error"` zostaje jeden, więc istniejący test dalej go znajduje.
3. **Wielkość liter w kodzie site'u.** `CodeInput` dostał `.toUpperCase()` — `waw` i `WAW` trafiają
   teraz w to samo `sites_org_code_uq`. Kod linii był już podnoszony w `upsertLine`, więc dla linii
   to no-op (poza tym, że zwracany kod zgadza się wreszcie z zapisanym).
4. **Kolejność przy `is_default`.** Tu **poprawiam tezę audytu**: ścieżka 23505 **nigdy nie była
   dziurawa**. `withOrgContext` (`lib/auth/with-org-context.ts:356-365`) robi COMMIT tylko przy
   normalnym `return`, a przy rzucie ROLLBACK — więc wyjątek z INSERT-a cofał też wcześniejsze
   czyszczenie defaultu. **Realna dziura była gdzie indziej i została naprawiona:** `if (!row) return
   { ok: false, error: 'persistence_failed' }` to **normalny return po pierwszym zapisie** → COMMIT
   wyczyszczonego defaultu bez wstawienia nowego site'u. Zamieniłem na `throw`, więc rollback obejmuje
   teraz wszystkie wyjścia po pierwszym zapisie. Przestawianie kolejności byłoby **błędem**: częściowy
   unikalny indeks `idx_sites_default` (jeden default na org) wymusza czyszczenie *przed* insertem.

---

## Testy (napisane, NIE uruchamiane)

| plik | co pilnuje |
|---|---|
| `apps/web/actions/infra/line-default-location.test.ts` | zapis trafia w `default_location_id` (i **nie** w martwą kolumnę), wartość wraca tą samą kolumną; odrzucenie nowo wybranej nieaktywnej lokalizacji podanej wprost; **anty-regresja**: linia z nieaktywną lokalizacją dalej edytowalna; podmiana inactive→inactive odrzucona; inactive→active działa; cudzy magazyn i nieznany UUID odrzucone |
| `apps/web/app/[locale]/(app)/(admin)/settings/infra/lines/output-location-options.test.ts` | picker nie oferuje nieaktywnej; **zawsze** pokazuje bieżącą nieaktywną; nie pokazuje *innej* nieaktywnej; brak pola `is_active` = aktywna; cudzy magazyn odfiltrowany |
| `apps/web/app/[locale]/(app)/(admin)/settings/sites/_actions/site-create-errors.test.ts` | duplikat kodu → `duplicate_code` + komunikat o duplikacie (nie „required"); odrzucony timezone → `field: 'timezone'` + akcyjny komunikat; realny brak wartości dalej mówi „required"; `waw` = `WAW` (duplikat, `params[0] === 'WAW'`, brak drugiego wiersza); **nieudany insert z `is_default` → rollback, nie commit** (fake `withOrgContext` odwzorowuje kontrakt commit/rollback) |
| `apps/web/app/[locale]/(app)/(admin)/settings/sites/_components/modal-utils.test.tsx` | `invalid_input` nigdy nie renderuje się jako `errorRequired`; komunikat serwera wygrywa z etykietą |

Rozbicie na `.test.ts` / `.test.tsx` jest celowe: `vitest.ui.config.ts` bierze tylko
`app/**/*.test.tsx` (jsdom + transform JSX), a `modal-utils` ciągnie wartość z modułu `.tsx`, więc
test tego mappera **musi** być `.tsx`. Dlatego `site-create-errors.test.ts` nie importuje `mapError`.

---

## Czego NIE jestem pewien

1. **Nie uruchomiłem niczego** — zero testów, buildów, `tsc`, psql (zgodnie z zasadami toru).
   Najbardziej narażone na czerwone: nowe testy z fake'owym klientem SQL (dopasowania regexów po
   treści zapytań) i `settings-wiring-contract.test.ts`, gdzie zmieniłem asercję
   `duplicateLine` z `persistence_failed` na `duplicate_code` — to **zamierzona zmiana zachowania**
   (`createLine` spłaszczał duplikat kodu linii do „coś poszło nie tak"), a nie dopasowanie testu do kodu.
2. **Nie ruszałem istniejących wierszy `sites.site_code` w mixed-case.** Uppercase działa tylko na
   nowych zapisach; jeśli w bazie leży już `waw` obok `WAW`, oba zostają. Backfill wymagałby obsługi
   kolizji, a trwałym fixem jest unikalny indeks na `(org_id, upper(site_code))` — zostawiłem to
   opisane w komentarzu `ponytail:` przy `CodeInput`. **Nie sprawdzałem, czy takie duplikaty już są.**
3. **Nie zweryfikowałem post-checku migracji na żywej bazie** (zakaz psql). Logika opiera się na tym,
   że rola migracyjna ma BYPASSRLS — wnioskuję to z precedensu (mig 312 i 366 robią UPDATE na tych
   samych, RLS-forced tabelach i działają na prodzie), ale mój INSERT to jednak mocniejsza operacja
   niż UPDATE. Jeśli rola nie ma BYPASSRLS, post-check wywali migrację (głośno, nie po cichu).
4. **Nie wiem, czy nowe klucze etykiet** (`inactiveLocationError`, `invalidLocationError`) mają trafić
   do katalogów tłumaczeń. Świadomie nie dodawałem kluczy i18n — `buildLabels` fall-backuje per-klucz
   na angielski default, więc jest to bezpieczne, ale po polsku pokaże angielski.
   Z tego samego powodu komunikaty z serwera (`message`) są **tylko po angielsku** — to świadomy
   kompromis: konkretny angielski komunikat > przetłumaczone kłamstwo „to pole jest wymagane".
5. **`packages/db/__expected__/schema.sql` jest nieaktualny** (nie ma w nim `locations.is_active`,
   `barcode` ani `default_output_location_id`). Nie dotykałem go — nie wiem, czy coś go weryfikuje.
6. **`revalidateLocalized('/settings/sites')`** — z pamięci projektu wynika, że `revalidatePath` na
   route-groupach bywa no-opem. Nie badałem tego tutaj, bo to poza zakresem toru.
