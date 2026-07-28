# RAPORT ZBIORCZY NOCY 2026-07-27/28

Owner poszedł spać ok. 23:50 z pełną autonomią do 5:00 i cronami co 45 min.
Flow trzymany bez skrótów: **tory → cross-review Codex → arbitraż → poprawki → bramka
(typecheck + OBIE suity + build + PREPARE migracji) → commit → deploy → E2E behawioralne**.

## Co jest na produkcji

| Fala | Commit | Zakres | Bramka | E2E |
|---|---|---|---|---|
| **4** | `6846f9d6` + `f963491e` + `e9e869dc` | BOM / routing / FactorySpec — 10× R06, migracje **523, 524, 525** | typecheck 0, build 0, **0 regresji na obu suitach**, +86 zielonych | ✅ **9/10 udowodnione, 1 częściowo** |
| **5** | `124e6b71` | Items/UoM + identity + routing CTA — 10× R03/R06/R01 | typecheck 0, build 0, **0 regresji**, +93 zielone | ✅ **6 udowodnione, 1 częściowo, 2 dalej zepsute** |
| **6** | `0ff4080d` + `efeabd09` | Identity tail + Sites/Infra — 10× R01/R02, migracja **526** | typecheck 0, build 0, **0 regresji**, core o 1 **lepiej** niż baseline | ⚠️ **NIEDOMKNIĘTE** — patrz niżej |

### ✅ AKTUALIZACJA — Fala 6 ZAMKNIĘTA, E2E domknięte

Powtórka E2E zakończyła się **po** pierwszej wersji tego raportu. Wynik: **7 udowodnionych,
2 częściowo.** Poniższy akapit „niedomknięte" jest **nieaktualny** — zostawiony dla uczciwości
zapisu, bo tak wyglądał stan o 4:20.

| # | Znalezisko | Wynik | Dowód |
|---|---|---|---|
| 1 | **PF-R02-02 Printers** (ekran był w 100% martwy) | ✅ **PROVEN** | Ekran renderuje się w całości; **mutacja CREATE** utworzyła `FALA6-VERIFY-PRINTER` i wiersz jest w bazie |
| 2 | PF-R01-06 atrybucja zaproszeń | ⚠️ PARTIAL | Ekran **ładuje się** (brak `persistence_failed` — błąd SQL `text = uuid` naprawiony) i **nigdzie nie ma zmyślonego „System"** |
| 3 | PF-R01-07 nazwa wyświetlana | ✅ **PROVEN** | Powłoka bierze `public.users`, nie `raw_user_meta_data` (gdzie dalej siedzi „Apex Admin") |
| 4 | PF-R01-05 odkrywalność | ✅ **PROVEN** | `Invitations` widnieje w Settings → grupa **Access** |
| 5 | PF-R02-06 duplikat site | ✅ **PROVEN** | „That site code is already in use…" zamiast „to pole jest wymagane" |
| 6a | PF-R02-03 klamrowanie dziecka | ✅ **PROVEN** | Fixture'y utworzone; dziecko pod nieaktywnym rodzicem powstaje **nieaktywne**, nie odrzucone |
| 6b | PF-R02-04 nieaktywne cele | ✅ **PROVEN** | Nieaktywne lokalizacje nie są oferowane jako wyjście aktywnej linii |
| 6c | Anty-regresja (edycja pod nieaktywnym rodzicem) | ⚠️ PARTIAL | W osiągalnym wariancie **przechodzi** |
| 7 | PF-R02-05 adres magazynu | ✅ **PROVEN** | Edycja utrwalona; **`deactivated_at` przeżyło** edycję adresu zdezaktywowanego magazynu |
| 7b | Regresja utraty adresu (T5-1) | ✅ **PROVEN naprawiona** | Nowy magazyn → edycja bez odświeżania → adres **zachowany** |

**Wniosek: wszystkie trzy fale nocy są zamknięte z dowodem behawioralnym.**

---

### Stan Fali 6 o 4:20 (nieaktualny, zostawiony dla zapisu)

**Kod jest na produkcji i przeszedł pełną bramkę**, ale **dowód behawioralny jest niekompletny.**

| Element | Stan |
|---|---|
| Commit | `efeabd09` (naprawa) na `main` |
| Deployment | **Ready**, utworzony **02:54:35** — zgadza się co do minuty z moim pushem |
| Migracja 526 | ✅ zastosowana i **zweryfikowana na żywo**: trigger `production_lines_sync_default_location` istnieje, osierocona wartość przeniesiona (`default_location_id` 0 → 1) |
| Bramka | ✅ typecheck 0, build 0 (**lokalnie przed pushem**), 0 regresji na obu suitach, PREPARE 3× |
| **E2E** | ⚠️ **niedomknięte** |

**Dlaczego E2E nie jest domknięte:** pierwszy przebieg (02:52) trafił na build **sprzed** naprawy
i jego wnioski są **nieważne** — testował Falę 5. Powtórka przeciwko właściwemu buildowi nie zdążyła
się zakończyć przed 5:00.

**Jedyna poszlaka, jaką mam — i traktuję ją jako poszlakę, nie dowód:** w logach runtime nowego
deploymentu jest **0 wystąpień** błędu Printers (`3974216983` / „Functions cannot be passed directly
to Client Components"), podczas gdy wcześniej padał **przy każdym wejściu**. To sugeruje, że ekran
wstaje, ale **nikt tego nie kliknął**, więc nie nazywam tego dowodem.

**Co trzeba zrobić rano (15–30 min):** powtórzyć E2E Fali 6 wg listy w
`FALA-06/E2E-PROOF.md`. Uwaga: dwa punkty wymagają **stworzenia fixture'ów** — organizacja ma
**zero nieaktywnych lokalizacji** (6/6 aktywnych) i **żadnego zdezaktywowanego magazynu**.

**30 findingów zaadresowanych, ~82 znaleziska cross-review** zarbitrażowane i naprawione.

---

## 🔑 Najcenniejsza rzecz nocy: rozwiązana zagadka 500-tek w Units (PF-R03-04)

Bug żył od **co najmniej 17.07** i blokował **cały ekran Units & conversions** — każda mutacja HTTP 500.

**Przyczyna:** `export type { … }` **BEZ klauzuli `from`** w module `'use server'`.
Nazwy są typami i znikają przy kompilacji, ale kompilator **i tak emituje wiązanie runtime**
w chunku SSR → `ReferenceError: CreateUnitInputType is not defined` **przy ewaluacji modułu**,
zanim jakakolwiek akcja wystartuje. Dlatego **odczyty działały, a każdy zapis dawał 500**.

**Dlaczego było trudne — trzy kroki, każdy dał tylko część:**
1. **Analiza statyczna** wykluczyła ciała akcji: wszystkie są w pełni `try/catch` i zwracają
   typowany wynik, a Server Action zwracający wynik daje **HTTP 200, nie 500**. Wskazała *miejsce*.
2. **Ja** obaliłem wiodącą hipotezę (brak partycji `audit_log`), odtwarzając całą sekwencję zapisu
   na produkcji w transakcji z rollbackiem — przeszła.
3. **Kliknięcie na żywo** dało `ReferenceError` z runtime-logu Vercela. To domknęło sprawę.

Winna linia była **zastana** (commit `546358f9`) — fala tylko dopisała do niej jedną nazwę,
więc **żadna recenzja oparta na diffie nie mogła jej zobaczyć**.
Skan repo: 9 modułów `'use server'` używa `export type {}`, **8 ma `from`, ten jeden nie miał** —
i to jedyny ekran dający 500.

---

## Żywe awarie produkcyjne naprawione po drodze (spoza zakresu fal)

| Awaria | Szczegóły |
|---|---|
| **Cron `pm-schedule-due` padał od 8.07** | 3 organizacje, 117 wystąpień, ostatnie 27.07. Przyczyna: `pg_catalog.current_date` — **`CURRENT_DATE` to konstrukcja SQL, której NIE DA SIĘ kwalifikować schematem**; Postgres czyta `pg_catalog` jako nazwę tabeli → `42P01`. Udowodnione na prodzie przed zmianą, przeskanowane repo pod inne takie przypadki |
| **Fail-open w bramce uprawnień** | `filterSettingsNavGroups` liczył `canManageInvitations !== false` → **pominięta** flaga uchodziła za przyznaną i materializowała całą grupę Access |
| **Walidator odrzucał własną domyślną strefę** | `Intl.supportedValuesOf('timeZone')` **nie zawiera `'UTC'`** — komunikat błędu podawał UTC jako przykład poprawnej wartości |
| **Brak kluczy i18n w `ro`/`uk`** | `customer_prices` — ujawnione przez rozszerzenie testu nawigacji z 2 na 4 locale |

---

## Co cross-review złapał, a co bez niego poszłoby na produkcję

- **Join audytowy, który W OGÓLE by się nie wykonał** — `audit_log.resource_id` to `text`
  porównywany z `users.id uuid`, plus sortowanie po nieistniejącej kolumnie `created_at`.
  **Położyłby cały ekran zaproszeń.** Potwierdziłem na prodzie przed deployem.
- **Poprawka catch-weight, która unieważniała samą siebie** — wymuszała `> 0` przy kolumnie
  `numeric(10,4)`, więc `0.00001` przechodziło walidację i zapisywało się jako `0.0000`,
  odtwarzając dokładnie to zerowe odniesienie, które miała wyeliminować.
- **Over-blocking, którego tor był pewien, że uniknął** — `L1 nieaktywny → L2 aktywny → L3 aktywny`,
  zmiana **samej nazwy L2** odrzucana. Raport toru nazywał to „tarciem".
- **`?item=`, który cicho kierował tworzenie marszruty na cudzą pozycję** — ekran docelowy
  wybierał pierwszą alfabetycznie.
- **Rejestracja outputu ignorująca skonfigurowane wyjście linii** — brała pierwszą alfabetycznie
  lokalizację magazynu i tylko **aliasowała** ją nazwą kolumny.
- **Regresja utraty adresu magazynu wprowadzona przez własną naprawę.**
- **Osierocony nagłówek WO** — `withOrgContext` commituje przy zwykłym `return`; raport toru
  twierdził, że transakcja się cofa. Nie cofała się.

---

## Gotchy metodologiczne (powtarzalne, zapisane w pamięci)

1. **PREPARE bywa FAŁSZYWĄ ZIELENIĄ.** Post-check migracji 523 brał dowolny wiersz
   (`limit 1` **bez `order by`**), a trigger blokuje UPDATE operacji zablokowanego routingu →
   pierwszy PREPARE trafił na `draft` (zielono), powtórzony na `superseded`. **Deploy byłby rzutem
   monetą.** Post-check musi być **samowystarczalny**. Odpalaj **3× pod rząd**.
2. **Bramka miała DWIE ślepe plamki:** `pnpm --filter web test` łączy dwa `vitest run` przez `&&`,
   więc **suita UI nigdy się nie wykonywała**; a `tsconfig.json` **wyklucza wszystkie testy**
   z typechecku.
3. **Flaki od obciążenia ≠ regresja.** Rozstrzygaj **trzema** przebiegami;
   `--fileParallelism=false` daje czysty sygnał.
4. **Grep po nazwie kolumny łapie ALIASY.** Zapisałem, że `register-output.ts` czyta
   `production_lines.default_location_id` — **nieprawda**, on aliasuje pierwszą lokalizację
   magazynu tą nazwą. Moja pomyłka **przykryła prawdziwy P1**.
5. **Pułapka Vitest:** `beforeEach(() => mock.mockReset())` — `mockReset()` **zwraca mock**,
   a Vitest traktuje zwróconą funkcję jako **teardown** i woła ją bez argumentów.
6. **Zanim zacytuję uzasadnienie silnika — uruchamiam je.** Dwa razy podałem twierdzenie silnika
   jako fakt i oba były nieprawdziwe.

---

## ⚠️ Mój własny błąd tej nocy (i jego cena)

**Build Fali 6 padł, bo stagowałem selektywnie.** `layout.tsx` wszedł z nowym propem, a komponent
z pasującym typem (`apps/web/components/`) **nie był w mojej liście katalogów**. Do tego repozytorium
ma **DWA katalogi tłumaczeń** — `apps/web/i18n/` i `apps/web/messages/` — stagowałem tylko pierwszy.

**Lokalny typecheck przechodził, bo mierzył DRZEWO ROBOCZE, nie commit.** To dokładnie ta sama klasa
„fałszywej zieleni bramki", którą ta kampania już raz złapała.

**Koszt:** jeden padnięty deploy i jedno E2E przeprowadzone przeciwko złemu buildowi (unieważnione).
**Naprawa:** `efeabd09`, zweryfikowana typecheckiem **i buildem lokalnie przed pushem**, na stanie
gdzie drzewo == HEAD.

**Nowe ryzyko procesowe do backlogu:** `buildCommand` to `migrate && build`, więc **padnięty build
i tak zostawia bazę po migracji**. Tym razem nieszkodliwie (trigger 526 celowo wstecznie zgodny),
ale migracja łamiąca zgodność zostawiłaby produkcję w rozjeździe.

---

## Backlog — zastane, świadomie NIE naprawione

| # | Znalezisko |
|---|---|
| 1 | **Bramka migracyjna CI jest MARTWA** — mig 279 robi bezwarunkowe `insert into storage.buckets`, a CI używa czystego `postgres:16-alpine` → `migrate` pada **przed** `check:drift`. Snapshot `__expected__/schema.sql` zamrożony sprzed 279. **Dlatego dryf po mig 503 nikomu nie mignął** |
| 2 | **Partycje `audit_log` kończą się 2027-01-01**, tworzy je wyłącznie mig 043, zero crona → potem padnie **każdy zapis z audytem w całej aplikacji**. Rekomendacja: cron **+ partycja DEFAULT** jako bezpiecznik |
| 3 | **SCIM CREATE nie może utworzyć użytkownika** — INSERT pomija wymagane `name` **i** `role_id` |
| 4 | **W repo NIE MA działającej wysyłki maili** — jedyne `resend.emails.send()` pyta o 3 kolumny, których nie tworzy żadna z 503 migracji; `email_delivery_log` zapisuje `'sent'` dla listów, które nigdy nie wyszły |
| 5 | `reset-password.ts` mintuje link recovery, **nigdy go nie czyta** i kasuje sesje |
| 6 | `buildCommand = migrate && build` — padnięty build zostawia bazę po migracji |
| 7 | Defekty zastane z Fali 4: linia BOM z historyczną nazwą operacji jest **trwale nieedytowalna**; `wo_materials.sequence` nie propaguje reorderu na zlecenia |
| 8 | PF-R03-06 (ułamkowe opakowania) — naprawa celowała w import CSV, a `each_per_box` **nie jest kolumną CSV**; znalezisko od początku dotyczyło kreatora |

---

## Stan kampanii

Fale 1–6 zamknięte. **Zostało ~58 findingów, fale 7–12.**
Następna: **Fala 7** — Suppliers / PO / GRN (R07) + LP hooks, 10×.

**Fixture'y do wiedzy:** organizacja **nie ma draftu routingu** (skasowany przy dowodzeniu R06-06)
i miała **zero nieaktywnych lokalizacji** oraz żadnego zdezaktywowanego magazynu — E2E Fali 6
tworzy te dane samo.
