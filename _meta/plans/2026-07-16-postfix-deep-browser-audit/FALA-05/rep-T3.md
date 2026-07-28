# FALA 5 / TOR T3 — Units & conversions: każda mutacja zwraca 500 (PF-R03-04)

Tor **diagnostyczny**. Zakres: `apps/web/app/[locale]/(app)/(admin)/settings/units/**`.
Testy napisane, **nie uruchamiane** (bramka po stronie orkiestratora).

---

## 1. Czy bug nadal występuje? — NAJWAŻNIEJSZA CZĘŚĆ

**Werdykt: NIE NAPRAWIONO, ale też NIE ODTWORZONO. Kod jest bajt w bajt taki sam jak w audytowanym
buildzie — więc jeśli przyczyna leżała w kodzie, nadal tam jest. Nie udało mi się jednak wskazać
w tym kodzie ścieżki, która potrafi wyprodukować 500.**

To nie jest wykręt — to twardy wniosek z dwóch dowodów, które trzeba czytać razem.

### Dowód A — nic nie zostało naprawione

Nagłówek raportu audytu (`run-03/REPORT.md:7`) podaje audytowany commit: `2eb57cf7`.

```
git diff --stat 2eb57cf7b90c23d4c55afeb01116eaabc3250385 HEAD -- \
  "apps/web/app/[locale]/(app)/(admin)/settings/units/" \
  "apps/web/lib/auth/with-org-context.ts" \
  "apps/web/lib/i18n/revalidate-localized.ts"
→ (pusty output)
```

**Zero różnic.** Ostatni commit dotykający `settings/units/**` to `0ea80488` z 2026-07-16 16:38 —
czyli **przed** audytem, nie po nim. Żaden fix nie wylądował. Hipoteza „naprawiono między 17.07
a dziś" jest **fałszywa**.

### Dowód B — zapisy naprawdę nigdy nie doszły do bazy

Produkcja, dziś:

```sql
select ... from public.unit_of_measure where code ilike '%N17R03%' or name ilike '%N17R03%'
union all
select ... from public.uom_custom_conversions where label ilike '%N17R03%';
→ (0 rows)
```

Nie ma ani `N17R03U`, ani `N17R03 PCS to Box` — także w stanie soft-deleted. Twierdzenie audytu
„żaden wiersz nie zapisany" jest **potwierdzone niezależnie**. To wyklucza wariant „akcja się
zatwierdziła, a 500 przyszło dopiero z re-renderu po commicie".

### Dowód C — i tu robi się niewygodnie: te akcje **nie potrafią** rzucić

Wszystkie cztery akcje w `manage-units.ts` opakowują **całe** ciało w `try/catch` i zwracają typowany
wynik (`{ ok: false, error, message? }`). `safeParse` nie rzuca. `console.error` nie rzuca.
`safeRevalidateUnitsRoute()` ma własny `catch`. **Żadna z nich nie może odrzucić promise'a** — a
Server Action zwracający wynik daje HTTP **200** z wynikiem błędu, nie 500.

Wniosek logiczny, nie domysł: **500 powstało POZA ciałami akcji** — w warstwie dispatchu Server
Actions Next.js albo w re-renderze RSC trasy po akcji. Nie w SQL-u jednostek. Zgadza się to z
Dowodem B: skoro nic nie zapisano, ciało akcji prawdopodobnie w ogóle się nie wykonało.

### Co wykluczyłem (z dowodem)

| Hipoteza | Status | Dowód |
|---|---|---|
| Brak partycji `audit_log` | **WYKLUCZONA** | 12 partycji, bieżący miesiąc pokryty do 2027-01-01 (szczegóły §4) |
| `isUnitCodeInUse` — nieistniejąca tabela/kolumna | **WYKLUCZONA** | 35/35 referencji istnieje (§3). Dodatkowo: wołane **wyłącznie** z `softDeleteUnit`, a delete nie było w trójce padających scenariuszy |
| `hasManagePermission` rzuca zamiast zwracać `false` | **WYKLUCZONA** | To samo, co do znaku, zapytanie stoi w `page.tsx:267-277` (`readUnitsData`) i wykonuje się przy **każdym** GET strony. Tabela się ładuje, a audytor widział przyciski „+ Add unit" ⇒ zapytanie zwróciło wiersz ⇒ nie rzuca |
| Pliki `.bak` importowane | **WYKLUCZONA** | `grep` po `apps/web` — zero importów `.bak` |
| `revalidateLocalized` wewnątrz transakcji | **NIE TŁUMACZY OBJAWU** | `createUnit` wołał je **poza** transakcją i też dał 500. Realny zapach — naprawiony (§5), ale to nie przyczyna |
| Deployment skew / stary bundle klienta | **WYKLUCZONA** | Po `2eb57cf7` (16.07 21:45) nie wszedł żaden commit w oknie audytu, więc action-ID nie mogły się przedawnić. Dodatkowo w tym samym przejściu run-03 **inne** Server Actions (create/edit itemu) działały |
| Błąd ładowania modułu `manage-units.ts` | **WYKLUCZONA** | Jedyny import spoza grafu strony to `revalidate-localized` — importuje go **210** modułów, w tym akcje, które w audycie działały |

### Czego brakuje do domknięcia

Audyt sam to zapisał (`REPORT.md:115`): *„Production hides the server stack behind digest `494781054`;
exact PF-R03-04 SQL root cause requires runtime-log correlation."* Sprawdziłem telemetrię Vercela za
ostatnie 7 dni — **żadnego błędu na `/settings/units`**, ale audyt jest sprzed 11 dni, czyli poza
oknem retencji, a od tamtej pory nikt tego ekranu nie kliknął. Telemetria działa (widać 8 innych
grup błędów), więc to brak ruchu, nie brak instrumentacji.

**Domknięcie wymaga jednego uwierzytelnionego kliknięcia na prodzie z podglądem runtime-logów.**
Logowanie, które dokładam w §5, jest dobrane dokładnie pod to: pierwsza próba po deployu wypluje
`code` / `constraint` / `detail`, więc jedno kliknięcie rozstrzyga sprawę zamiast kolejnej rundy
zgadywania.

---

## 2. Dlaczego awaria wywracała całą trasę — **to akurat znalazłem i naprawiłem**

Audyt: *„The failure was not reliably contained: the route later rendered the global
`Something went wrong` boundary."* Słowo `reliably` jest tu kluczowe i wyjaśnia się w kodzie klienta:

- `UnitsManager.tsx` / `AddUnitDialog` — wołanie akcji **było** w `try/catch` → błąd zostawał w modalu.
- `UnitsManager.tsx` / `AddConversionDialog` (L312) — **bez** `try/catch`.
- `UnitRowActions.tsx` / `onEditSubmit` (L139) i `onDeleteConfirm` (L152) — **bez** `try/catch`.

Odrzucony promise rzucony wewnątrz `startTransition` ucieka do najbliższego error-boundary. Tu nie ma
lokalnego `error.tsx`, więc łapie go `app/[locale]/(app)/error.tsx` i **podmienia całą trasę**.
Stąd „raz kontenerowane, raz nie": dodawanie jednostki miało `catch`, konwersja / edycja / usuwanie nie miały.

To jest mechanizm objawu opisanego w spec-u i **jest naprawiony niezależnie od tego, co
powodowało 500**.

---

## 3. Audyt 16 tabel z `isUnitCodeInUse` — wynik

Sprawdzone przeciwko żywemu schematowi (`information_schema`, odczyt). **Wszystkie istnieją — 35/35
par (tabela, kolumna), łącznie z `org_id` w każdej.** Zero braków.

| Tabela | Kolumna UoM | Status |
|---|---|---|
| `items` | `uom_base`, `uom_secondary` | ok (text) |
| `uom_custom_conversions` | `from_unit_code`, `to_unit_code`, `deleted_at` | ok |
| `spare_parts` | `unit_of_measure` | ok (text) |
| `calibration_instruments` | `unit_of_measure` | ok (text) |
| `bom_lines` | `uom` | ok (text) |
| `bom_co_products` | `uom` | ok (text) |
| `work_orders` | `uom` | ok (text) |
| `wo_materials` | `uom` | ok (text) |
| `wo_outputs` | `uom` | ok (text) |
| `wo_material_consumption` | `uom` | ok (text) |
| `purchase_order_lines` | `uom` | ok (text) |
| `transfer_order_lines` | `uom` | ok (text) |
| `transfer_order_line_lps` | `uom` | ok (text) |
| `license_plates` | `uom` | ok (text) |
| `stock_moves` | `uom` | ok (text) |
| `grn_items` | `uom` | ok (text) |

Hipoteza „UNION po 16 tabelach wywala się błędem SQL" — **martwa**. I tak nie mogła tłumaczyć objawu:
`isUnitCodeInUse` jest wołane wyłącznie z `softDeleteUnit`, a audyt testował add-unit, edit-name
i add-conversion.

---

## 4. Partycje `audit_log` — stan i propozycja (opis, NIE kod)

**Stan faktyczny (produkcja, dziś):**

- 12 partycji miesięcznych, `audit_log_2026_01` … `audit_log_2026_12`.
- Ostatnia: `FOR VALUES FROM ('2026-12-01') TO ('2027-01-01')`.
- `now()` = 2026-07-27 → mieści się w `audit_log_2026_07`. Dziś jest OK.
- Tworzy je **wyłącznie** `select public.audit_log_create_partitions(12)` — jednorazowo, w migracji
  `043-audit-log-partitioning.sql:82`. Grep po całym repo: poza migracją 043, grantem w 051 i testami
  **nikt tej funkcji nie woła**. Brak crona, brak joba, brak `pg_cron`.

**Bomba jest opóźniona, nie rozbrojona: `2027-01-01T00:00:00Z`.** Od tej sekundy **każdy zapis
z audytem w całej aplikacji** (nie tylko jednostki) pada z SQLSTATE 23514.

**Zweryfikowałem, jaki dokładnie błąd to jest** (transakcja z rollbackiem, tabela tymczasowa):

```
ERROR:  23514: no partition of relation "part_probe" found for row
```

To ważne dla §5: brak partycji **to jest** `23514`, ten sam kod co prawdziwe naruszenie CHECK.

**Propozycja (do osobnego taska, nie pisałem migracji):**

1. **Cron dosypujący partycje** — miesięczne wywołanie `audit_log_create_partitions(3)` (idempotentne,
   trzymiesięczny bufor). Repo ma już infrastrukturę: `/api/internal/cron/*` + `CRON_SECRET` +
   `vercel.json`. Alternatywa: `pg_cron` po stronie Supabase — mniej ruchomych części, ale wypada
   poza repo i poza review.
2. **Partycja `DEFAULT` jako bezpiecznik** — żeby przeoczony cron degradował się do „wiersze lądują
   w DEFAULT" zamiast „całkowity zanik zapisów". Zastrzeżenie: gdy w DEFAULT są wiersze, dołożenie
   normalnej partycji na ten zakres wymaga skanu i przeniesienia, więc DEFAULT musi mieć alert
   („cokolwiek tu wpadło = cron nie zadziałał"), a nie być cichym wysypiskiem.
3. **Monitoring wyprzedzający** — ostrzeżenie, gdy najdalsza partycja jest bliżej niż 60 dni.

Rekomendacja: 1 + 2 razem. Sam cron zamienia jedną awarię (brak partycji) na inną (cron padł
i nikt nie zauważył).

---

## 5. Naprawy w tym torze

### 5.1 Martwa gałąź — komunikat kłamał (Krok 3.1)

**Było** (`manage-units.ts`, ~L310): warunek `err.code === '23514'` stał **przed** testem komunikatu
`'no partition of relation' && 'audit_log'`. Ponieważ brak partycji **jest** błędem 23514 (dowód w §4),
gałąź partycji była **nieosiągalna**, a awaria audit-logu pokazywała się administratorowi jako:

> „Conversion factor must be greater than zero."

Czyli: odsyłała go do poprawiania pola, które było w porządku, podczas gdy padał audyt.

**Jest:** jeden wspólny `mapWriteError(err, op)` — **najpierw** test komunikatu partycji, **potem**
`switch` po kodzie. Kolejność jest zabezpieczona komentarzem i testem.

### 5.2 `softDeleteUnit` nie mapował żadnego kodu (Krok 3.2)

Zawsze zwracał gołe `persistence_failed`. Teraz przechodzi przez ten sam mapper, z rozróżnieniem
kierunku: przy **delete** `23503` (FK) znaczy „coś jeszcze na to wskazuje" → `in_use`; przy **insert**
znaczy „wskazana jednostka zniknęła" → `invalid_reference`. Ten sam kod, przeciwna porada.

Mapowane: `23505` → `already_exists`, `23503` → `in_use`/`invalid_reference`, `23514` →
`invalid_input` (współczynnik), `42501` → `forbidden`, brak partycji → `persistence_failed`
z nazwanym komunikatem o audycie.

### 5.3 Awaria nie wywraca już trasy (Krok 3.3)

`try/catch` dołożony w `AddConversionDialog`, `onEditSubmit`, `onDeleteConfirm` (add-unit już miał).
Nieudana mutacja = alert w modalu, tabela jednostek zostaje na ekranie.

### 5.4 Nazwane komunikaty zamiast „Please check the values and try again." (Krok 3.4)

- `createCustomConversion`, `updateUnit`, `softDeleteUnit` zwracały `parsed.error.message` — czyli
  **JSON-owy zrzut wszystkich issue'ów zoda**. `UnitRowActions.errorLabel` i tak go ignorował, więc
  użytkownik dostawał generyk. Teraz: `firstIssueMessage()` + nazwany fallback.
- Oba `errorLabel` preferują komunikat z serwera dla `invalid_input` / `in_use` / `persistence_failed`;
  dla pozostałych przypadków wygrywa **przetłumaczona** etykieta. Dzięki temu nie tracimy i18n
  i nie wyciekamy surowego tekstu z bazy na ekran.

### 5.5 Logowanie pod przyszłą korelację

`handleWriteError` loguje `code` / `constraint` / `detail` / `mappedTo`. To jest dokładnie to, czego
audytowi zabrakło (widział tylko nieprzezroczysty digest).

### 5.6 `revalidateLocalized` wyprowadzone z transakcji

W `createCustomConversion`, `updateUnit`, `softDeleteUnit` rewalidacja szła **wewnątrz** transakcji
(`createUnit` miał już dobrze). Wszystkie cztery są teraz identyczne: `commit` → `if (result.ok)
safeRevalidateUnitsRoute()` → `return`. Nie jest to przyczyna 500 (patrz §1), ale czyszczenie cache
dla zapisu, który może się jeszcze wycofać, jest po prostu błędne — i zdejmuje tego kandydata
ze stołu na stałe.

### Pliki

- `apps/web/app/[locale]/(app)/(admin)/settings/units/_actions/manage-units.ts`
- `apps/web/app/[locale]/(app)/(admin)/settings/units/_components/UnitsManager.tsx`
- `apps/web/app/[locale]/(app)/(admin)/settings/units/_components/UnitRowActions.tsx`

---

## 6. Testy (napisane, NIE uruchamiane)

`_actions/manage-units.test.ts`:
- brak partycji `audit_log` → komunikat mówi o **audycie**, jawna asercja `not.toMatch(/conversion factor/i)`
- prawdziwe naruszenie CHECK (23514 bez tekstu o partycji) → **nadal** komunikat o współczynniku (strażnik kolejności)
- `softDeleteUnit` + FK (23503) → `in_use` z nazwanym komunikatem, nie gołe `persistence_failed`
- `softDeleteUnit` + brak partycji → komunikat o audycie
- brak wycieku JSON-owego zrzutu zoda do komunikatu

`page.test.tsx`:
- odrzucone `softDeleteUnit` / `updateUnit` / `createCustomConversion` → alert inline, **tabela dalej
  wyrenderowana** (trasa nie wywrócona)
- `persistence_failed` z komunikatem o partycji → alert mówi o audycie, nie o współczynniku

---

## 7. Czego NIE jestem pewien

1. **Nie znam przyczyny 500 i tego nie ukrywam.** Wiem, gdzie jej **nie ma** (SQL jednostek, RBAC,
   16 tabel, partycje, pliki `.bak`, skew deploya) i wiem, że musi być **poza** ciałami akcji.
   Nie wiem, czy to dispatch Server Action, re-render RSC, czy coś środowiskowego z tamtej chwili.
2. **Czy to jeszcze 500-ka — nierozstrzygnięte empirycznie.** Kod jest niezmieniony, więc przyczyna
   *kodowa* przetrwała. Ale przyczyna *środowiskowa* mogła zniknąć sama. Nie robiłem E2E przez
   przeglądarkę na prodzie (poza zakresem toru).
3. **Interpretacja dowodu z konsoli.** Jedyny ślad sieciowy to
   `Failed to load resource: 500 @ /en/settings/units:0`. Ten URL jest zarazem celem POST-a Server
   Action i celem RSC-refetchu tej trasy. Nie da się z niego odróżnić, które z dwóch padło —
   obie ścieżki leżą poza ciałami akcji, więc wniosek z §1 się trzyma, ale precyzja jest mniejsza,
   niż by się chciało.
4. **Moje naprawy nie usuwają objawu z audytu, jeśli był on dispatchowy.** Usuwają: kłamiący
   komunikat, brak mapowania w delete, wywracanie trasy i brak danych w logach. Gdyby 500 wróciło,
   dzięki §5.3 użytkownik zobaczy alert zamiast globalnego boundary, a dzięki §5.5 log powie, co padło.
   To jest uczciwy zakres tego, co zmieniłem.
5. **Nie uruchamiałem testów ani builda** (zakaz w spec-u). Testy są napisane pod istniejące
   konwencje mocków w obu plikach, ale nie mam potwierdzenia, że przechodzą.

---

## 8. Znalezisko poboczne (POZA zakresem toru — do zgłoszenia)

Przy przeglądaniu telemetrii Vercela zobaczyłem **żywy, trwający** błąd produkcyjny bez związku
z jednostkami:

```
[cron/pm-schedule-due] org failed — error: missing FROM-clause entry for table "pg_catalog"
SQLSTATE 42P01 · 117 wystąpień · 3 organizacje
first=2026-07-08 · last=2026-07-27T06:08Z · route=/api/internal/cron/pm-schedule-due
```

Cron PM-scheduling pada dla wszystkich organizacji od 8.07 i **nadal pada**. Nie dotykałem — nie mój
tor — ale to wygląda na cichą awarię harmonogramowania konserwacji, której nikt nie zgłosił.
