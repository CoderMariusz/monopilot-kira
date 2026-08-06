# RAPORT — TOR B (łańcuch decyzyjny i papierowy)

Checkout: `/Users/mariuszkrawczyk/Projects/_noc/B` @ `80b2821a` · Baza: `monopilot_t2` (migracja 562/564)
Port harnessu: 3514 → aplikacja na 3814 · Persony 5/5 obecne.


---

## STRESZCZENIE — czytaj to najpierw

**Bramka hydracji: PRZESZŁA.** React hydruje się, kliknięcie dociera do akcji serwerowej,
wiersz ląduje w bazie. Wszystko poniżej stoi na sprawdzonym łańcuchu.

### Do naprawy — kolejność wg groźby

| # | Co | Waga | Gdzie |
|---|---|---|---|
| **B-1** | Brakujący plik `quality/_components/pending-quality-signoff` → **500 na szczegółach blokady jakościowej**, a po jednym wejściu **każda trasa w aplikacji zwraca 500**. Blokady jakościowej nie da się zdjąć. | **BLOKER** | sekcja „BLOKERY" |
| **S-1** | `app.user_can_see_site()` **bez kontekstu użytkownika zwraca „wolno" dla dowolnego zakładu** — także cudzej organizacji i dla zmyślonego uuid. Z kontekstem działa poprawnie (kontrola przeciwna). | POWAŻNY | §21 |
| **S-2** | Persona z **zerem uprawnień** czyta całą kartotekę indeksów (42 pozycje), definicje schematu (18) i listę zakładów — ścieżki odczytu nie mają bramki. | POWAŻNY | §6.3 |
| **S-3** | Import w Ustawieniach: **„↑ Run import" włączony wbrew własnemu komunikatowi**, klik nic nie robi, bez śladu. Połowa komunikatu to surowy klucz i18n. | POWAŻNY | §9 |
| **S-4** | Wycena zapasu pokazuje **170,0001** przy rejestrze WAC **170,0000** — ekran wylicza zamiast czytać. | POWAŻNY | §19 |
| **S-5** | Niezgodność hydracji na szczegółach zamówienia zakupu (oś czasu audytu). Tylko ten ekran z pięciu sprawdzonych. | POWAŻNY | §20 |
| **S-6** | NPD: awaria magazynu plików pokazana jako „brak załączników" (cicha awaria). | POWAŻNY | §13 N-3 |
| — | Duplikat numeru reklamacji **odtworzony w przeglądarce** — ale to **skutek niezastosowanej migracji 564**, nie nowe znalezisko. | (wg polecenia) | §7 |

### Co sprawdziłem i **działa** (równie ważne)

- **Bramki uprawnień po stronie serwera trzymają.** Persona bez uprawnień wypełnia
  cały formularz „Create TO" i dostaje „You don't have permission to do that.",
  baza bez zmian; „Run MRP" → „You don't have permission to run MRP.". Kontrola
  przeciwna: admin przechodzi obie ścieżki i zapisuje.
- **Import w module Planowania działa end-to-end** (upload → walidacja → podgląd →
  commit → zamówienie w bazie + wpis w `import_export_jobs`).
- **Bramkowanie etapów NPD** odmawia i **wylicza dokładnie, co blokuje** (6 pozycji).
- **Łańcuch zakup → przyjęcie → nośnik → WAC działa, także w gramach**
  (5000 g → 5 kg, wartość 10,00; średni koszt 1,545455 po trzech przyjęciach).
- **Rewalidacja NPD nie jest nieświeża** — zapis na briefie widać na liście od razu.

### Cztery podejrzenia z 30 lipca — werdykty

| Podejrzenie | Werdykt |
|---|---|
| Bramka blokad połyka „relacja nie istnieje" w 3 miejscach | **Trzy miejsca są**, ale na migracji 562 gałąź jest **nieosiągalna** (widok istnieje). Ryzyko utajone. §15 |
| Rozjazd uprawnień → bramka cicho nigdy nie trafia | **OBALONE.** Wszystkie 127 egzekwowanych uprawnień ma przydzielenie w bazie; enum to martwy katalog, bramka porównuje łańcuchy w SQL. §2.2 |
| Widoczność zakładu bez kontekstu = „wolno" | **POTWIERDZONE**, z kontrolą przeciwną. §21 |
| Główny ekran importu nic nie importuje | **POTWIERDZONE dla Ustawień** (celowo, z komunikatem — ale z trzema wadami), **OBALONE dla Planowania**. §8, §9 |
| `revalidatePath('/npd/...')` bezskuteczne w ~16 miejscach | **OBALONE** — w kodzie nie ma już ani jednego takiego celu, a zapis→lista jest świeży. §11 |
| Dwie reklamacje o tym samym numerze | **ODTWORZONE**, ale to skutek braku migracji 564. §7 |
| Łańcuch zwolnienia jakościowego potrójnie martwy | **NIE DOSZEDŁEM** (blokuje B-1). Jedno obalenie po drodze: `allergenGateRequired:false` nie ma ani jednego odbiorcy. §16 |

### Dwie pułapki, na które sam się nabrałem — dla kolejnych torów

1. **`window.confirm` w przejściach statusu PO.** Playwright domyślnie **odrzuca** natywne
   okna, więc „Send" wyglądał na martwy przycisk (status zostawał `draft` nawet po 30 s
   odpytywania bazy). Po `page.on('dialog', d => d.accept())` wszystko działa.
   Bez tego zgłosiłbym fałszywy bloker.
2. **`r.code = any('{owner,admin,org_admin}')` w `has-permission.ts:29-30`.** Rola `admin`
   przechodzi każdą bramkę **niezależnie od `role_permissions`** — więc „admin może"
   nie dowodzi, że uprawnienie jest poprawnie zasiane. Kontrolę przeciwną trzeba robić
   personą z konkretnym uprawnieniem.

---

## 1. BRAMKA HYDRACJI — **PRZESZŁA**

```
PORT=3514 bash scripts/e2e-local.sh --db monopilot_t2 apps/web/e2e/hydration-click-proof.spec.ts
[proof] picked item: RM-BEEF-50 Beef trim 50VL RM — /kg
✓ real click reaches upsertReorderThreshold and writes a row (3.4s)
1 passed
```

Łańcuch React → kliknięcie → akcja serwerowa → wiersz w bazie **działa**. Wszystkie dalsze
wyniki są na tej podstawie wiarygodne.

---

## 2. ROZJAZD UPRAWNIEŃ — stan na teraz

### 2.1. Policzyłem rozjazd dokładnie (nie z komunikatu, tylko z bazy i kodu)

`ALL_PERMISSIONS` z `packages/rbac/src/permissions.enum.ts` (276 kodów) kontra efektywne
uprawnienia roli `admin` w bazie (317 kodów):

**Tylko w enumie (5)** — kod je zna, rola admin ich nie ma:
`fa.edit`, `impersonate.org`, `npd.allergen.accept_declaration`, `org.scim.write`,
`settings.impersonate.tenant`

**Tylko w bazie (45)** — m.in.:
`npd.project.create`, `npd.project.view`, `npd.brief.read/write`, `npd.fa.*`,
`settings.roles.manage`, `settings.roles.view`, `settings.users.view`, `settings.units.manage`,
`settings.schema.admin`, `settings.schema.read`, `settings.security.view`, `settings.infra.*`,
`settings.d365.*`, `settings.email*`, `warehouse.lp.destroy`, `technical.wip.*`,
`technical.sensory.write`, `manufacturing_operations.*`, `fa.delete`, `fa.field_edit`,
`impersonate.tenant`

### 2.2. Teoria „bramka cicho nigdy nie trafia" — **OBALONA** dla zbioru egzekwowanego

Sprawdziłem mechanicznie: wszystkie **127** uprawnień z
`apps/web/lib/rbac/enforced-permissions.ts` (czyli te, które faktycznie są sprawdzane
po stronie serwera) mają **co najmniej jedno przydzielenie** w `public.role_permissions`.
Różnica: pusta.

```bash
comm -23 <enforced 127> <318 uprawnień w bazie>   # → brak wierszy
```

Powód, dla którego rozjazd nie zabija bramek: `apps/web/lib/auth/has-permission.ts` **nie używa
enumu** — porównuje surowy łańcuch znaków z `role_permissions.permission` / `roles.permissions`
w SQL. Enum jest więc martwym katalogiem, nie źródłem prawdy. Rozjazd jest długiem
dokumentacyjnym (edytor ról pokazuje „jeszcze nieegzekwowane" na podstawie tej listy),
a nie dziurą w bramce.

**Uwaga do sprawdzenia dalej**: `hasPermission` ma obejście przez kod roli —
`r.code = any('{owner,admin,org_admin}')`. Rola o kodzie `admin` przechodzi wszystko
**niezależnie** od `role_permissions`. To znaczy, że test „admin może" nigdy nie dowodzi,
że dana permisja jest poprawnie przydzielona.

### 2.3. Przemiał ekranów personami — co się renderuje

Persony: `no_module_access` (**0 uprawnień**), `single_site_operator` (**9**, wyłącznie
produkcja/magazyn). **Obie dają identyczny wynik** na wszystkich 31 sprawdzonych trasach.

**Odmawia poprawnie (panel „Permission denied", nawigacja przycięta do MY ACCOUNT):**
`/en/settings/users`, `/settings/security`, `/settings/labor-rates`, `/settings/audit-logs`,
`/settings/reference`, `/settings/import-export`, `/quality/holds`, `/quality/ncrs`,
`/quality/specifications`, `/finance`, `/finance/valuation`, `/warehouse/license-plates`,
`/warehouse/inventory`, `/pipeline`, `/pipeline/new`, `/formulations`

Przykład dowodu (persona bez uprawnień na `/en/settings/users`):
> „Permission denied: settings.users.view or settings.users.invite is required to view users and roles."

**Renderuje się BEZ odmowy, z danymi i włączonymi przyciskami zmieniającymi stan** (0 uprawnień):

| Trasa | wierszy | włączone przyciski |
|---|---|---|
| `/en/settings/schema` | 18 | **New schema column** → wchodzi na `/settings/schema/new`, „Save as Draft" aktywny |
| `/en/settings/units` | 11 (cały katalog jednostek) | — *(„+ Add custom conversion" okazał się tekstem w stanie pustym, nie przyciskiem; kolumna Actions ma „—". Sprostowanie po weryfikacji.)* |
| `/en/settings/sites` | 2 | — (dane widoczne) |
| `/en/technical/items` | **42** (kartoteka indeksów) | ⊕Process additions |
| `/en/planning/transfer-orders` | 1 | **+ Create TO** (okno otwiera się w całości, „Save & Plan" aktywny) |
| `/en/planning/mrp` | 0 | **Run MRP** |
| `/en/settings/features` | 0 | Dry-run activation |
| `/en/dashboard` | 0 | Create Shipment |

**To była wtedy tylko widoczność, nie dowód zapisu.** Faza dowodowa zamknięta w §6:
klikam każdą z tych akcji personą bez uprawnień i sprawdzam bazę.
Wynik częściowy: kreator kolumny schematu (`/settings/schema/new`) to formularz wieloetapowy
sterowany parametrami URL — nie doprowadziłem go do ostatniego kroku, `reference_schemas`
i `schema_migrations` bez zmian (18 / 517 wierszy przed i po). Nie liczę tego jako znaleziska.

---

## 3. CO PRZEKLIKAŁEM — przegląd renderowania (persona admin)

Wszystkie poniższe zwracają 200 i renderują właściwy nagłówek, bez błędów konsoli i bez 5xx:

**Planowanie**: purchase-orders, transfer-orders, mrp, schedule, suppliers, reorder-thresholds,
forecasts, work-orders, carriers, import — **10/10 DZIAŁA (render)**
**Jakość**: ncrs, holds, inspections, complaints, specifications, trace, haccp, ccp-monitoring,
ccp-deviations, cold-chain, recall-drills — **11/11 DZIAŁA (render)**
**NPD**: pipeline, pipeline/new, pipeline/workload, formulations, fg, costing/rollup,
allergen-cascade, npd, products/new — **DZIAŁA (render)**
**Finanse**: finance (WO actual costs), finance/valuation, technical/cost — **DZIAŁA (render)**
**Ustawienia**: users, roles, sites, units, import-export, reference, quality, npd-approval,
signoff, authorization — **DZIAŁA (render)**

**404 (trasy nieistniejące, prawdopodobnie martwe linki w dokumentacji, nie w nawigacji):**
`/en/products`, `/en/costing`, `/en/technical/costs`

---

## 4. DROBNE — potwierdzone

### D-1. Komunikaty z liczbą renderują się jako SUROWY KLUCZ (widoczne dla użytkownika)

next-intl rzuca `FORMATTING_ERROR: The intl string context variable "n" was not provided`
i w zamian wypisuje na ekranie klucz. Potwierdzone na ekranie:

- `/en/planning/transfer-orders` → w stopce listy i w kolumnie LINES widnieje dosłownie
  `Planning.transferOrders.list.rowsCount` oraz `Planning.transferOrders.list.linesCount`
  zamiast „1 wiersz" / „2 pozycje" (zrzut z przebiegu: patrz sekcja 5)
- `/en/quality/complaints` → `quality.complaints.list.rowsLabel`
- `/en/settings/sites` → `settings.sites.sites_title`, `settings.sites.site_meta`
- `/en/settings/audit-logs` → `settings.audit_log_viewer.forbidden_message`

Ta sama klasa błędu leci w konsoli **na każdej stronie** dla `{n} unread notifications`,
`{n}m ago`, `{n}h ago`, `{n}d ago` (dzwonek powiadomień w nagłówku) — czyli licznik
powiadomień i „ile temu" są zepsute globalnie, nie tylko na tych czterech ekranach.

Waga: DROBNY (kosmetyka), ale występuje w miejscu, gdzie użytkownik oczekuje liczby.

---

## 5. W TOKU / NIE DOSZEDŁEM (migawka z 00:20 — **NIEAKTUALNA**, patrz §24 na końcu)

- Dowód zapisu dla akcji dostępnych personie bez uprawnień (TO / MRP / units / schema) — **w toku**
- Bramka blokad jakościowych, łańcuch zwolnienia QA, widoczność zakładu — **nie zacząłem**
- NPD (bramki, podpisy, rewalidacja `/npd/...`) — **nie zacząłem**
- Import główny, duplikaty reklamacji — **nie zacząłem**
- Finanse (WAC, wycena) — **nie zacząłem**

**Ostrzeżenie metodyczne do własnych wyników**: przy pierwszej próbie utworzenia TO personą
admin formularz przyjął „Save & Plan" i baza się nie zmieniła — ale ustaliłem, że to **wina
mojego testu** (pole ilości miało `placeholder="0"`, a wartość pustą, więc nigdy go nie
wypełniłem; produkt wybrałem z pozycji-wypełniacza). Nie zgłaszam tego jako błędu aplikacji
dopóki nie powtórzę z poprawnym wejściem.

---

# AKTUALIZACJA 00:00 — faza dowodowa uprawnień zamknięta

## 6. UPRAWNIENIA — WERDYKT: **nie znalazłem akcji, którą wykona persona bez uprawnień**

Przeprowadziłem dwie pełne ścieżki zapisu, każdą z kontrolą przeciwną.

### 6.1. Utworzenie zlecenia przesunięcia (Create TO) — bramka DZIAŁA

**Kontrola przeciwna (persona `harness`, admin)** — `/en/planning/transfer-orders` →
`+ Create TO` → numer `TO-NOC-CTRL2`, z magazynu `WH-DEMO-01`, do `WH-DEMO-02`,
`+ Add line` → produkt z listy → ilość `7` → jednostka `box` → **Save & Plan**.
Wynik: pozycja pojawia się na liście, w bazie:

```
TO-NOC-CTRL2|draft|11111111-1111-4111-8111-111111111111|2026-08-05 23:40:35
```

**Próba personą `no_module_access` (0 uprawnień)** — identyczne kroki, numer `TO-NOC-NOPERM`.
Okno dialogowe otwiera się w całości, wszystkie pola i „Save & Plan" aktywne.
Po kliknięciu: **„You don't have permission to do that."**, lista bez zmian, w bazie:

```
TO-NOC-CTRL2|draft|...      ← tylko wpis admina
TO-DEMO-0001|draft|...
```
(brak `TO-NOC-NOPERM`)

### 6.2. Uruchomienie MRP — bramka DZIAŁA

`harness`: „Run MRP" → pełna analiza (3 pozycje z niedoborem, „Last run: 8/5/2026, 11:42:13 PM").
`no_module_access`: „Run MRP" → **„You don't have permission to run MRP."**, `mrp_runs` = 0.

### 6.3. Co jednak **wycieka** — POWAŻNY (ujawnienie danych, nie zapis)

Persona z **zerem uprawnień** widzi pełne dane na trasach, które nie mają żadnej bramki odczytu:

| Trasa | Co widzi persona bez uprawnień |
|---|---|
| `/en/technical/items` | **cała kartoteka indeksów: 42 pozycje** + rozbicie (12 surowców, 23 składniki, 2 wyroby gotowe). Ukryty jest wyłącznie przycisk „+ New item" |
| `/en/settings/schema` | **18 definicji kolumn schematu** (tabela, dział, typ, warstwa, magazyn, wersja) |
| `/en/settings/sites` | 2 zakłady |
| `/en/planning/transfer-orders` | rejestr zleceń przesunięcia |

Dowód dla kartoteki indeksów — ten sam ekran, trzy persony:

```
no_module_access      → "Items … All 42 / Raw materials 12 / Ingredients 23 / Finished goods 2"
single_site_operator  → identycznie (42)
harness (admin)       → identycznie (42) + przycisk "+ New item"
```

Przyczyna po stronie kodu (`settings/schema/page.tsx:150-166`): zapytanie o uprawnienia
**nie bramkuje odczytu** — jego jedynym skutkiem jest podmiana etykiety `userRole`
na `'Admin'` albo `'Operator'`. Wiersze `reference_schemas` są pobierane bezwarunkowo.
W `technical/items/page.tsx` komentarz nagłówkowy zapowiada „rodzinę RBAC `technical.items.*`
i stan permission-denied", ale ścieżka odczytu go nie używa.

**Waga**: POWAŻNY. To nie jest zapis, ale operator linii bez żadnych uprawnień czyta
całą kartoteką produktową i konfigurację schematu organizacji.

### 6.4. Wyciek afordancji — DROBNY, ale mylący

Persona bez uprawnień dostaje w pełni działające okna dialogowe (Create TO — wszystkie
pola, wybór magazynów, dodanie pozycji, aktywny „Save & Plan") i dopiero **po** wypełnieniu
całego formularza dostaje odmowę. Ten sam wzorzec: „Run MRP", „New schema column",
„Create Shipment", „Dry-run activation". Serwer broni poprawnie — użytkownik traci pracę.

### 6.5. Dlaczego „test admina" nigdy nie dowodzi poprawności przydziału

`apps/web/lib/auth/has-permission.ts:29-30` przepuszcza po **kodzie roli**:
`r.code = any('{owner,admin,org_admin}')`. Rola `admin` przechodzi każdą bramkę
niezależnie od `role_permissions`. Skutek praktyczny: zielony wynik „admin może"
nie mówi nic o tym, czy uprawnienie jest w ogóle poprawnie zasiane.

---

## 7. JAKOŚĆ — duplikat numeru reklamacji **ODTWORZONY W PRZEGLĄDARCE**

Klasyfikacja wg polecenia: **skutek zablokowanego łańcucha migracji** (mig 564 niezastosowana),
nie nowe znalezisko. Zgłaszam z dowodem, bo do tej pory było to podejrzenie.

**Kontrola przeciwna (sekwencyjnie)**: jedna reklamacja → `CMP-00000001`. Numeracja działa.

**Odtworzenie**: dwie niezależne sesje przeglądarki (osobne konteksty, ta sama persona),
obie z otwartym formularzem `/en/quality/complaints` → `+ New complaint`
(referencja `BATCH-NOC-001`, waga „High"), oba przyciski „Log complaint" kliknięte
w tej samej chwili (`Promise.all`).

Stan bazy po operacji:

```
CMP-00000001|NOC sequential complaint A|23:53:18.010626
CMP-00000002|NOC race complaint 1     |23:53:28.801523
CMP-00000002|NOC race complaint 0     |23:53:28.802091   ← ten sam numer
```

Rejestr reklamacji pokazuje **dwa wiersze `CMP-00000002`** obok siebie.

Kod sam to zapowiada (`quality/_actions/complaint-actions.ts:265-272`): blokada doradcza
`pg_advisory_xact_lock` **nie może** temu zapobiec, bo pod READ COMMITTED migawka
instrukcji poprzedza oczekiwanie na blokadę, więc `max()` nigdy nie zobaczy świeżego
zatwierdzenia drugiej sesji. Jedyną realną obroną jest `complaints_org_complaint_number_uq`
z migracji 564 — a pętla ponawiająca (`isComplaintNumberConflict`) wyłapuje wyłącznie
`23505` na **tej właśnie** nazwie ograniczenia. Bez 564 pętla nie ma czego złapać
i nigdy się nie uruchamia.

`\d public.complaints` na `monopilot_t2`: brak ograniczenia unikalności na `complaint_number`
(indeksy: tylko `complaints_pkey` i `idx_complaints_org`).

---

# BLOKERY

## B-1 (NAJGROŹNIEJSZY). Brakujący plik rozwala szczegóły blokady jakościowej — i po jednym wejściu **całą aplikację**

**Waga: BLOKER**

### Ścieżka odtworzenia

1. `/en/quality/holds` → `+ Create hold` → typ referencji **Batch**, Reference ID
   `BATCH-NOC-HOLD-1`, powód „NOC exploratory hold", priorytet **High** → **Create hold**
   → blokada powstaje poprawnie (`HLD-00001000`, widoczna na liście jako Open)
2. Kliknij numer blokady na liście — link prowadzi do
   `/en/quality/holds/f2be2d05-90a2-426b-909f-169358073815`

### Co zaobserwowałem

**HTTP 500, biały ekran** (`document.body` ma 5 węzłów, zero tekstu, `__NEXT_DATA__`
z `statusCode: 500`). W konsoli i w `pageerror`:

```
./apps/web/app/[locale]/(app)/(modules)/quality/holds/_components/hold-release-modal.client.tsx:37:1
Module not found: Can't resolve '../../_components/pending-quality-signoff'
  37 | import {
  38 |   PendingQualitySignoffPanel,
  39 |   type PendingSignoffLabels,
  40 | } from '../../_components/pending-quality-signoff';

Import traces:
  ./…/quality/holds/_components/hold-release-modal.client.tsx
  ./…/quality/holds/[holdId]/_components/hold-detail.client.tsx
  ./…/quality/holds/[holdId]/page.tsx
```

Katalog `apps/web/app/[locale]/(app)/(modules)/quality/_components/` **nie istnieje**
(`ls` → No such file or directory). Plik nie występuje nigdzie w repozytorium:

```bash
find apps/web -name "pending-quality-signoff*" -not -path "*/node_modules/*"   # → pusto
```

`PendingQualitySignoffPanel` nie jest zdefiniowany w żadnym innym pliku — jedynym miejscem,
gdzie ta nazwa w ogóle występuje w kodzie źródłowym, jest ten wadliwy import.
Testy jednostkowe blokad i NCR-ów odwołują się do `data-testid`
`pending-quality-signoff-signer` / `-role`, więc komponent był zakładany jako istniejący.
Ostatni commit dotykający importera: `ca983d45`
(„jakosc: »zwolnienie czesciowe« USUNIETE (nigdy nie istnialo) + przyczyna zrodlowa egzekwowana").

### Dowód ze stanu — dwa skutki

**Skutek 1 — blokady jakościowej NIE DA SIĘ ZWOLNIĆ.**
Baza po utworzeniu:

```
HLD-00001000|batch|BATCH-NOC-HOLD-1|open|high|released_at=NULL
v_active_holds → 1 wiersz
```

Lista blokad **nie ma żadnego przycisku zwolnienia** — jedyne przyciski to
Export CSV, + Create hold, filtry (Active 1 / Released 0 / All 1) i filtry typu referencji.
Jedyne wyjście do zwolnienia prowadzi przez szczegóły blokady, a szczegóły są martwe.
**Blokada jakościowa to stan, z którego nie da się wyjść.** Partia zostaje w kwarantannie
na zawsze.

**Skutek 2 — jedno wejście na tę trasę kładzie CAŁĄ aplikację (serwer deweloperski).**
Odtworzone kontrolą przeciwną w jednym przebiegu, świeży serwer, kolejność ma znaczenie:

```
[ok ] 200 /en/quality/ncrs/new
[ok ] 200 /en/quality/complaints/181a8d67-…    :: Complaint
[ok ] 200 /en/technical/items/1c49bc06-…       :: OVERVIEW
[ok ] 200 /en/planning/suppliers/6fe8f6c7-…    :: Supplier
[ok ] 200 /en/planning/work-orders/25900000-…  :: Work order
[ok ] 200 /en/settings/roles
[ok ] 200 /en/settings/units                   ← DZIAŁA
[ok ] 200 /en/settings/npd-fields
[ok ] 200 /en/settings/processes
[ok ] 200 /en/settings/warehouses
[XX ] 500 /en/quality/holds/f2be2d05-…         ← wejście na zepsutą trasę
[XX ] 500 /en/settings/units                   ← TA SAMA TRASA, teraz 500
```

Ten sam adres `/en/settings/units` daje 200 przed i 500 po. Od tego momentu **każda**
trasa zwraca 500 z tym samym komunikatem, aż do restartu serwera. W jednym z przebiegów
padło w ten sposób 18 kolejnych tras (PO, TO, dostawcy, zlecenia, wszystkie ustawienia).

**Powtórka minimalna na świeżym serwerze** (te same trzy adresy przed i po, jeden przebieg):

```
[ok ] 200 /en/dashboard                  :: Dashboard
[ok ] 200 /en/settings/units             :: ORGANIZATION
[ok ] 200 /en/planning/purchase-orders   :: Purchase orders
[XX ] 500 /en/quality/holds/f2be2d05-…   ← wejście na zepsutą trasę
[XX ] 500 /en/settings/units
[XX ] 500 /en/dashboard
[XX ] 500 /en/planning/purchase-orders
```

Pulpit, ustawienia i zamówienia zakupu — wszystko zwraca 500 z komunikatem o
`hold-release-modal.client.tsx:37`, choć chwilę wcześniej działały.

### Dlaczego to jest BLOKER, a nie usterka deweloperska

`Module not found` w komponencie klienckim to błąd **kompilacji**, nie runtime'u —
`next build` nie ma jak go pominąć. Uwaga: **tego nie zmierzyłem** (nie uruchamiałem builda,
żeby nie deptać katalogu `.next` używanego przez harness E2E). Zmierzone jest to, co wyżej:
500 na trasie i kaskada na wszystkie pozostałe trasy w trybie deweloperskim.

### Naprawa

Albo dodać brakujący `quality/_components/pending-quality-signoff.tsx`, albo — jeśli panel
został świadomie usunięty — wyciąć import i użycie z `hold-release-modal.client.tsx`.
Sam import to jedyne odwołanie w kodzie produkcyjnym.

---

# OBSZAR: IMPORT

## 8. Import w Planowaniu — **DZIAŁA** (podejrzenie o „nic nie importuje" OBALONE dla tego ekranu)

`/en/planning/import?source=po`, persona admin. Wgrałem plik `noc-po.csv`:

```csv
external_ref,supplier_code,item_code,qty,uom,price,currency,expected_delivery,warehouse_code,notes
NOC-IMP-1,SUP-DEMO-01,RM-BEEF-50,25,kg,3.10,PLN,2026-09-01,WH-DEMO-01,noc import probe
```

Kreator przeszedł wszystkie cztery kroki: **Upload → Validate rows → Preview → Commit import**.
Walidacja: „Rows in file 1 · OK 1 · Errors 0", tabela `#1 OK — No issues`.

Stan bazy po commicie:

```
purchase_orders:      NOC-IMP-1|draft|2026-08-06 00:08:03
import_export_jobs:   kind=import target=purchase_orders status=completed
                      progress 1/1  metadata={"total":1,"failed_count":0,"created_count":1,"skipped_count":0}
```

**Werdykt: DZIAŁA.** Import zakłada zamówienie, loguje zadanie, liczniki się zgadzają.

## 9. Import w Ustawieniach — **NIC NIE IMPORTUJE, wyłączony celowo** — POTWIERDZONE, z trzema zastrzeżeniami

**Waga: POWAŻNY** (przycisk, który nic nie robi, i komunikat po części nieczytelny)

`/en/settings/import-export` → kafelek **Finished goods** → `↑ Import` → wgrany
`code,name / NOC-TEST-1,NOC probe row` → **Next: Review**.

Ekran przeglądu mówi wprost:

> **Import processing not available yet**
> This wizard previews your file against real master-data counts, but the master-data
> import worker is not wired yet — running the import is disabled.
> (TODO: wire master-data import action.)

a baner na stronie:

> **Import/export processing is not available yet.** Recent job history is read-only.
> Starting new imports or exports is disabled until the background worker drains
> `import_export_jobs`.

### Zastrzeżenie 1 — przycisk NIE jest wyłączony, wbrew własnemu komunikatowi

```
DIALOG-BUTTONS: "✕" disabled=false | "Cancel" disabled=false | "← Back" disabled=false
              | "↑ Run import (1 rows)" disabled=false aria-disabled=null
```

Kliknięcie: okno zostaje otwarte, **żadnej reakcji, żadnego komunikatu o odmowie**.
Baza przed i po identyczna:

```
public.items                 42  →  42
public.import_export_jobs     1  →   1   (jedyny wiersz to import z Planowania, target=purchase_orders)
```

Czyli: ekran zapowiada „wyłączone", przycisk wygląda na aktywny, użytkownik wgrywa plik,
klika „Run import (1 rows)" i **nic się nie dzieje**. Klasa: przycisk, który nic nie robi.

### Zastrzeżenie 2 — połowa „uczciwego komunikatu" to surowy klucz

Na stronie widnieje dosłownie `settings.import_export.alerts.unsupported_import`
(potwierdzone jako drugi `role="alert"` obok tego czytelnego).

### Zastrzeżenie 3 — komunikat jest napisany dla programisty, nie dla użytkownika

„until the background worker drains `import_export_jobs`" i „(TODO: wire master-data
import action.)" — użytkownik zakładu mięsnego nie ma z tego jak wywnioskować,
co ma zrobić zamiast tego (a odpowiedź brzmi: użyć importu w module Planowania,
który działa).

### Dodatkowo — tabela „Recent jobs" pokazuje pustkę mimo istniejącego zadania

`import_export_jobs` ma 1 wiersz (`status=completed`, import PO z Planowania), a sekcja
„Recent jobs" na `/en/settings/import-export` wyświetla sam nagłówek kolumn i żadnego wiersza.
Waga: DROBNY (prawdopodobnie filtr po `target` z zakresu ustawień).

---

# OBSZAR: NPD

## 10. Tworzenie projektu NPD — **DZIAŁA**

`/en/pipeline/new`, kreator 4-krokowy (Basics → Brief → Starting point → Review), persona admin.
Wypełnione: nazwa „NOC Probe Ham 1", format „200g sliced pack", masa 200 g, 12 szt./karton,
5000 szt./tydz., 3 uruchomienia/tydz., cena 19.90, punkt startowy „Blank recipe".
Ostatni przycisk: **✓ Create project & open recipe**.

Baza:

```
code=NPD-001  name=NOC Probe Ham 1  type=Meat · Cold cut  current_gate=G0  current_stage=brief
product_code=FG-001  start_from=blank  weekly_volume_packs=5000.000  runs_per_week=3.00
pack_weight_g=200.000  packs_per_case=12  target_retail_price_eur=19.90
created_by_user=11111111-…  app_version=npd-project-actions-v1
```

Lista `/en/pipeline` pokazuje projekt natychmiast, liczniki zgodne
(„Active projects 1", „Pipeline · 1", kolumna BRIEF: 1).

## 11. Rewalidacja `/npd/...` — **PODEJRZENIE OBALONE** (i w kodzie, i behawioralnie)

**W kodzie**: zgrupowałem wszystkie cele `revalidatePath` / `revalidateLocalized`
w `apps/web` (pomijając testy). **Żaden nie celuje w `/npd/...`.** Cele NPD to dziś
`/pipeline/${projectId}/brief`, `/pipeline/${projectId}/trial`, `/pipeline/${projectId}/pilot`,
`/pipeline/${projectId}/packaging`, `/${locale}/pipeline/${projectId}/approval`,
`/fg/${productCode}/risks` — czyli **rzeczywiste adresy URL**, zgodne z tym, co widzi
przeglądarka. Ta usterka została naprawiona.

**Behawioralnie** (objaw z podejrzenia: „zapisujesz, wracasz na listę, widzisz starą wartość"):

1. `/en/pipeline/8514d57f-…/brief` → pole PRODUCT NAME zmienione z „NOC Probe Ham 1"
   na **„RENAMED-NOC-A"** → **Save changes**
2. Powrót na listę **kliknięciem w nawigację** („Projects" → `/en/pipeline`), czyli
   nawigacją klienta bez przeładowania — dokładnie ten scenariusz, w którym zła rewalidacja boli

```
AFTER-SAVE  (strona szczegółów) zawiera nową nazwę:  true
LISTA po nawigacji klienta       zawiera nową nazwę:  true   ← brak nieświeżości
LISTA po twardym przeładowaniu   zawiera nową nazwę:  true
baza: NPD-001|RENAMED-NOC-A|2026-08-06 00:35:49
```

**Werdykt: nieświeżości nie ma.**

## 12. Bramkowanie etapów NPD (Stage-Gate) — **DZIAŁA, uczciwie blokuje**

`/en/pipeline/<id>` → **Advance stage →** → okno „Advance gate":

```
GATE TRANSITION      G0 Idea (Current)  - - - ▸  G1 Feasibility (Target)
G0 CHECKLIST — IDEA  0%
  ✗ Initial feasibility check      Required
  ✗ Market opportunity identified  Required
  ✗ Product concept documented     Required
  ✗ Preliminary cost target set    Optional
0 of 6 required items complete
ℹ 6 required checklist items must be completed before advancing.
   ○ Checklist: Initial feasibility check
   ○ Checklist: Market opportunity identified
   ○ Checklist: Product concept documented
   ○ Core: Pack Size
   ○ Core: Number Of Cases
   ○ Core: Recipe Components
```

Bramka nie tylko odmawia — **wylicza dokładnie, co blokuje** (3 pozycje z listy kontrolnej
+ 3 pola rdzeniowe). To dobra robota. Projekt pozostał w `current_gate=G0`.

Drobna nieścisłość: panel listy kontrolnej pokazuje 3 pozycje „Required", a licznik mówi
„0 of **6** required". Szóstka bierze się z 3 pól rdzeniowych wymienionych niżej —
zrozumiałe dopiero po przeczytaniu całości. DROBNY.

## 13. NPD — usterki towarzyszące

### N-1. Etykieta waluty kłóci się z kolumną w bazie — POWAŻNY (dane)

Ekran brief i kreator pokazują pole **„TARGET RETAIL PRICE (GBP)"**.
Wpisana wartość ląduje w kolumnie **`npd_projects.target_retail_price_eur`**:

```
target_retail_price_eur=19.90     ← wpisane w polu opisanym jako GBP
```

Ani GBP, ani EUR nie jest walutą tego wdrożenia (zakład w Polsce, ceny PO w PLN —
w moim imporcie `currency=PLN` przeszło bez zastrzeżeń). Użytkownik nie ma jak
się dowiedzieć, w czym właściwie podaje cenę docelową, a wycena i marża w NPD
liczą się z tej liczby.

### N-2. Nazwy kolumn bazy jako etykiety pól — DROBNY (UX)

Sekcja „Core" na ekranie brief pokazuje jako etykiety/podpowiedzi surowe nazwy techniczne:
`product_code`, `product_name`, `number_of_cases`, `recipe_components`, `dev_code`,
`price_brief`, `weekly_volume_packs`, `runs_per_week`, `comments`, `volume`, `weight`,
`packs_per_case`. Każda z nich ma osobny przycisk „Save".

### N-3. Awaria magazynu plików pokazana jako „brak załączników" — POWAŻNY (cicha awaria)

Każde wejście na `/en/pipeline/<id>/brief` loguje:

```
[listBriefAttachments] failed: Error: supabaseKey is required
```

a użytkownik widzi: **„No attachments on this brief."**

`list-brief-attachments.ts:81-83` łapie **każdy** wyjątek, zwraca `PERSISTENCE_FAILED`,
a ekran degraduje do „brak załączników". Użytkownik nie odróżni „nie ma załączników"
od „magazyn plików nie działa" — a to jest projekt rozwoju produktu, gdzie brakujący
załącznik do briefu jest realną stratą informacji.

**Zastrzeżenie uczciwościowe**: konkretnie ten błąd (`supabaseKey is required`) to skutek
lokalnego harnessu, który nie ma kluczy Supabase — **nie twierdzę, że na produkcji
magazyn jest zepsuty**. Znaleziskiem jest **sposób obsługi**: awaria mapowana na pustą
listę bez śladu w interfejsie. Ta sama klasa co podejrzenie o połykanie „relacja nie istnieje".

### N-4. „Watch" — przycisk wyłączony z uczciwym komunikatem (poprawnie)

`⚑ Watch` jest `disabled` z podpowiedzią „Watching projects is not available yet."
Tak powinien wyglądać niedokończony ekran — inaczej niż import w Ustawieniach (sekcja 9).

---

# OBSZAR: JAKOŚĆ — blokady i łańcuch zwolnienia

## 14. Blokada jakościowa działa przy zakładaniu, ale nie da się jej zdjąć

Utworzone dwie blokady przez interfejs (persona admin):

```
HLD-00001000 | batch | BATCH-NOC-HOLD-1                  | open | high
HLD-00001001 | lp    | LP-1785973288957-8GC8 / ING-SUGAR | open | high
```

Blokada na nośniku **przestawia stan nośnika**: `license_plates.qa_status: pending → on_hold`,
a ekran nośnika pokazuje znacznik **„On hold"**.

**Efekt blokady na ekranie nośnika (porównanie nośnik zablokowany vs. wolny — kontrola przeciwna):**

| przycisk | LP zablokowany (HLD-00001001) | LP wolny (LP-…-V89L) |
|---|---|---|
| Merge | **WYŁĄCZONY** | włączony |
| Change QA status | **WYŁĄCZONY** | włączony |
| Reserve | wyłączony | **też wyłączony** |
| Split / Move / Block / Destroy | włączone | włączone |

Czyli: blokada realnie odbiera „Merge" i „Change QA status". **Ale** „Reserve" jest wyłączony
**również na nośniku bez blokady** — więc wyłączony „Reserve" na zablokowanym nośniku
**niczego nie dowodzi**. Serwerowej bramki rezerwacji (`lp-detail-actions.ts:475-490`)
nie udało mi się wywołać z przeglądarki, bo nie ma do niej włączonego wejścia.

**Zdjęcie blokady jest niemożliwe** — patrz BLOKER B-1: lista blokad nie ma przycisku zwolnienia,
a jedyne wejście (szczegóły blokady) zwraca 500.

## 15. Bramka „relacja nie istnieje" (fail-open) — **znalazłem dokładnie trzy miejsca**, uśpione na tej bazie

| plik | linia | zachowanie |
|---|---|---|
| `apps/web/lib/production/holds-guard.ts` | 115, 169 | na `42P01` → traktuje jak „brak blokady" |
| `apps/web/lib/warehouse/scanner/movement.ts` | 796 | j.w. |
| `apps/web/app/[locale]/(app)/(modules)/warehouse/license-plates/[lpId]/_actions/lp-detail-actions.ts` | 487 | j.w. |

Zgadza się z podejrzeniem („trzy miejsca"). Każde z nich jest jawnie skomentowane jako
świadome „fail-OPEN, gdy widok jest NIEOBECNY (09-quality jeszcze nie wdrożone)".

**Na tej bazie (migracja 562) gałąź jest nieosiągalna**: widok istnieje i zwraca moją blokadę.

```
select count(*) from public.v_active_holds;   →  1
```

Czyli: **podejrzenie o „przepuszczanie surowca z aktywną blokadą" nie potwierdziło się
w tej konfiguracji**. Ryzyko jest utajone: wystarczy jedna baza bez `v_active_holds`
(migracja 197 niezastosowana), żeby wszystkie trzy bramki żywności zamilkły naraz.
`42P01` łapie też przypadek „widok istnieje, ale nie w `search_path`".

## 16. Łańcuch zwolnienia jakościowego — **NIE DOSZEDŁEM** (i jedno obalenie po drodze)

Nie zdołałem wykazać ani obalić „potrójnej martwoty":

- **Zwolnienia blokady nie da się uruchomić** — blokuje BLOKER B-1 (500 na szczegółach).
- **Rejestr kontroli (`quality_inspections`) jest pusty, ale nie dlatego, że ekran jest martwy.**
  `/en/quality/inspections` → `+ New inspection` otwiera poprawny formularz
  („Open an inspection against a license plate, GRN receipt or work-order output"),
  wymagający **wskazania nośnika / przyjęcia / wyjścia zlecenia**. Zanim zbudowałem zapas,
  w bazie nie było ani jednego nośnika — więc pustka wynikała z braku danych, nie z błędu.
  Po zbudowaniu zapasu nie zdążyłem powtórzyć tej ścieżki. **Uczciwy wynik: nie doszedłem.**

**Obalenie**: jedyna flaga w tym obszarze zaszyta na `false`, jaką znalazłem, to
`allergenGateRequired: false` w `apps/web/lib/production/start-wo.ts:326`. Sprawdziłem
wszystkich jej odbiorców w repozytorium:

```
apps/web/lib/production/start-wo.ts:67    (deklaracja typu)
apps/web/lib/production/start-wo.ts:326   (jedyne przypisanie)
…/__tests__/scanner-production-routes.test.ts:1333   (test sprawdzający, że jest false)
```

**Nikt jej nie czyta.** To martwe pole w odpowiedzi akcji, nie wyłączona bramka.
Nie znalazłem „drugiego konsumenta biorącego flagę z wejścia klienta".

## 17. Split zablokowanego nośnika — **NIE DOSZEDŁEM** (ślepy zaułek w interfejsie)

Chciałem sprawdzić najgroźniejszy obejściowy scenariusz: *czy odszczepiony nośnik potomny
dziedziczy blokadę, czy wychodzi „czysty" i wraca do produkcji.*

„Split" jest **włączony na zablokowanym nośniku** (stopka ekranu mówi wprost:
„Split, Merge, and Destroy are live"). Okno się otwiera, ilość przyjmuje.
Ale pole **„Destination location *"** jest wymagane, a jego lista ma **zero pozycji**:

```
[split] location options=0
[split] submit="Split LP" disabled=true
```

Przyczyna w danych: w bazie jest **jedna** lokalizacja, `DEFAULT` w magazynie `MAIN`,
a nośnik leży w `WH-DEMO-01`. Aplikacja nie mówi o tym ani słowa — pokazuje pusty wybór
i trwale wyszarzony przycisk. **DROBNY** (pusty wymagany wybór bez wyjaśnienia),
ale zablokował mi dowód w kwestii, która jest istotna dla bezpieczeństwa żywności.
Do sprawdzenia następnym razem po dodaniu lokalizacji w `WH-DEMO-01`.

---

# OBSZAR: FINANSE / KOSZTY

## 18. Łańcuch zakup → przyjęcie → nośnik → wycena — **DZIAŁA**, także przeliczenie gramów

Przeszedłem pełną ścieżkę **sam, w przeglądarce**, dwa razy — raz w kg (kontrola przeciwna),
raz w gramach:

| krok | kg | g |
|---|---|---|
| utworzenie PO (ING-SUGAR, dostawca GBP) | ✓ | ✓ |
| draft → **sent** (potwierdzone odpytywaniem bazy przez 30 s) | ✓ | ✓ |
| sent → **confirmed** | ✓ | ✓ |
| przyjęcie linii (`po-receive-submit`) | ✓ bez błędu | ✓ bez błędu |
| status PO | `received` | `received` |

Zaksięgowanie WAC dla linii **5000 g @ 0.002**:

```
grn_items.uom = g   ext_jsonb->>'wac_qty_kg' = 5   ext_jsonb->>'wac_value' = 10
```

5000 g → **5 kg** (nie 5000), wartość **10.00** (5000 × 0.002). Przeliczenie jest poprawne;
nie ma błędu tysiąckrotnego ani „WAC na zerowej ilości".

Rejestr WAC po trzech przyjęciach (100 kg @1.50 + 5 kg @2.00 + 5000 g @0.002):

```
item_wac_state: total_qty_kg=110.000  total_value=170.0000  avg_cost=1.545455
```

Arytmetyka się zgadza: (150 + 10 + 10) / 110 = 1,545454…

### Sprostowanie do własnego wyniku pośredniego

Gotowy spec `apps/web/e2e/purchase-to-grn-valuation-chain.spec.ts` **przewrócił się** na
teście „T10 linia w gramach przelicza się na kilogramy" z komunikatem
„przyjęcie odrzucone: Something went wrong receiving. Please retry.".
**Nie potwierdziło się to w niezależnym odtworzeniu** (powyżej). Ten spec jest zależny
od kolejności i od stanu zbudowanego przez wcześniejsze testy w tym samym przebiegu.
**Nie zgłaszam gramów jako błędu aplikacji.**

Osobno: przy pierwszych próbach transakcja „Send" nie zmieniała statusu i wyglądało to na
martwy przycisk. To była **wina mojego testu** — `onTransition` używa natywnego
`window.confirm`, który Playwright domyślnie odrzuca. Po `dialog → accept` przejścia
działają bez zarzutu. Zapisuję to jako ostrzeżenie dla kolejnych torów.

## 19. F-1. Wycena zapasu pokazuje inną kwotę niż rejestr WAC — POWAŻNY (liczby w finansach)

`/en/finance/valuation`, persona admin:

```
1 valued item · Method: WAC
GRAND TOTAL   170.0001   GBP
ING-SUGAR  Sugar  110.000000  1.545455  170.0001  GBP
```

Rejestr w bazie:

```
item_wac_state: total_qty_kg=110.000  total_value=170.0000  avg_cost=1.545455
round(total_qty_kg * avg_cost, 4) = 170.0001
```

Ekran **wylicza** wartość jako `ilość × średni koszt` zamiast **odczytać** przechowywaną
`total_value`. Zaokrąglony średni koszt (6 miejsc) pomnożony przez ilość daje
**170,0001** zamiast **170,0000**.

Rozbieżność jest dziś groszowa, ale rośnie z ilością i z liczbą pozycji — a to jest raport
wyceny zapasu, który ma się zgadzać z księgą. Istniejące testy łańcucha sprawdzają
**ilość** na ekranie (T7) i uzgadniają **ilość** z nośnikami (T12); **wartości nikt nie uzgadnia**.

## 20. F-2. Niezgodność hydracji na szczegółach zamówienia zakupu — POWAŻNY (ryzyko cichej utraty klikalności)

Każde wejście na `/en/planning/purchase-orders/<id>` dla zamówienia z historią rzuca:

```
Hydration failed because the server rendered text didn't match the client.
As a result this tree will be regenerated on the client.
  … <PurchaseOrderDetailPage> → <DetailContent> → <PoDetailView> → <Card> → <CardContent>
      → <ul aria-label="History"> → <TimelineRow row={{id:"audit_…"}}>
          → <li data-testid="document-a…" data-source="audit_events">
```

Winowajcą jest **oś czasu zdarzeń audytowych** — klasyczny objaw formatowania daty
w strefie/lokalizacji serwera innej niż klienta (React wprost wymienia tę przyczynę).

Sprawdziłem kontrolnie cztery inne ekrany szczegółów — **żaden nie rzuca** tego błędu:
dostawca, zlecenie przesunięcia, reklamacja, nośnik → `hydration-errors: 0`.
Czyli to nie jest szum globalny, tylko konkretny komponent.

Dlaczego POWAŻNY, a nie kosmetyczny: to dokładnie ta klasa awarii, przed którą ostrzega
instrukcja nocy — po błędzie hydracji React **wyrzuca i odtwarza poddrzewo**, więc kliknięcie,
które trafi w to okno, przepada bez śladu w konsoli i bez 4xx.

---

# 21. WIDOCZNOŚĆ ZAKŁADU BEZ KONTEKSTU UŻYTKOWNIKA — **PODEJRZENIE POTWIERDZONE**

**Waga: POWAŻNY (bezpieczeństwo — izolacja zakładów i organizacji)**

Funkcja `app.user_can_see_site(uuid)` — `SECURITY DEFINER`, używana przez polityki RLS
widoczności zakładu (migracja 551 „per-user site visibility for production facts")
oraz wprost w kodzie (`warehouse/counts/_actions/count-actions.ts:1009-1021`):

```sql
select p_site_id is not null
  and (
    app.current_user_id() is null            -- ⓵ BRAK KONTEKSTU ⇒ WOLNO
    or exists (… role owner/admin/org_admin/org.access.admin/org.platform.admin …)
    or not exists (select 1 from public.user_sites
                    where user_id = app.current_user_id()
                      and org_id = app.current_org_id())   -- ⓶ BRAK PRZYPISAŃ ⇒ WOLNO
    or exists (… user_sites dla TEGO zakładu …)
  )
```

## Dowód ⓵ — brak kontekstu użytkownika przepuszcza WSZYSTKO

Zwykłe połączenie do bazy, bez ustawionego kontekstu:

```
current_user_id()                                   = NULL
user_can_see_site(SITE-DEMO-01)                     = true
user_can_see_site(SITE-01, ZAKŁAD INNEJ ORGANIZACJI)= true
user_can_see_site(11111111-2222-3333-4444-5555…)    = true   ← uuid, którego nie ma w bazie
user_can_see_site(NULL)                             = false  ← jedyne, co odrzuca
```

Bramka odrzuca wyłącznie `NULL`. Dla dowolnego innego identyfikatora — łącznie z zakładem
**cudzej organizacji** i identyfikatorem zmyślonym — odpowiada „wolno".

## Kontrola przeciwna — z prawdziwym kontekstem bramka DZIAŁA

Zarejestrowałem kontekst dokładnie tak, jak robi to aplikacja
(`app.session_org_contexts` → `app.set_org_context`), dla persony
`single_site_operator` przypisanej do `SITE-DEMO-01`:

```
current_user_id() = 7f290000-0000-4000-8000-000000000004
jego własny zakład SITE-DEMO-01           -> true
zakład SITE-01 (inna organizacja)         -> false
zmyślony uuid                             -> false
```

Bramka nie odrzuca wszystkiego — rozróżnia poprawnie. **Awaria dotyczy wyłącznie
przypadku „brak kontekstu".** (Cały test w transakcji zakończonej `rollback`.)

## Dowód ⓶ — użytkownik BEZ przypisanych zakładów widzi wszystkie

Ta sama procedura dla persony `no_module_access` (zero uprawnień, **zero wierszy
w `user_sites`**):

```
SITE-DEMO-01                              -> true
SITE-01 (INNA ORGANIZACJA)                -> true
zmyślony uuid                             -> true
```

Gałąź ⓶ (`not exists user_sites ⇒ wolno`) może być świadomą decyzją („nie skonfigurowano
ograniczenia = widzi wszystko"), ale w praktyce znaczy, że **domyślnym stanem nowego
użytkownika jest pełna widoczność międzyzakładowa**, a jedynym sposobem ograniczenia
jest pamiętanie o dopisaniu wiersza w `user_sites`. W bazie taki wiersz ma dziś
**jeden użytkownik na siedmiu**.

Gałąź ⓵ nie jest do obronienia: jest to fail-open w funkcji `SECURITY DEFINER`,
której zadaniem jest odgradzanie zakładów. Każda ścieżka wykonania, która nie ustawi
kontekstu (zadanie cron, workflow, migracja, ręczne zapytanie serwisowe, świeże połączenie
z puli przed `set_org_context`), dostaje pełny dostęp międzyzakładowy — i, jak pokazuje
druga linia dowodu, **również międzyorganizacyjny na poziomie tej funkcji**.

Ten sam wzorzec powtórzony w kodzie aplikacji:
`count-actions.ts:1017` → `const canSeeSite = siteRows[0]?.can_see ?? true;`
(brak wiersza ⇒ „wolno"). Tam jest uśpiony, bo wyżej stoi `if (!session) throw`,
ale to ta sama domyślna odpowiedź.

---

# 22. PRZEMIAŁ „czy formularz naprawdę zapisuje" — 5/5 ścieżek DZIAŁA

Najgroźniejsza klasa z instrukcji to „formularz przyjmuje zapis i nic nie zapisuje".
Przeszedłem pięć ścieżek tworzenia w moim obszarze, każdą z odczytem licznika wierszy
w tabeli **przed i po**:

| ekran | tabela | przed | po | wynik |
|---|---|---|---|---|
| Planowanie → Dostawcy → „+ New supplier" | `public.suppliers` | 3 | 4 | **ZAPISUJE** |
| Planowanie → Przewoźnicy → „+ Add carrier" | `public.carriers` | 0 | 1 | **ZAPISUJE** |
| Jakość → NCR → „+ Create NCR" | `public.ncr_reports` | 0 | 1 | **ZAPISUJE** |
| Jakość → Specyfikacje → „+ Create specification" | `public.quality_specifications` | 0 | 1 | **ZAPISUJE** |
| Ustawienia → Role → „+ Create role" | `public.roles` | 53 | 54 | **ZAPISUJE** |

Do tego wcześniej: zlecenie przesunięcia (`transfer_orders`), zamówienie zakupu przez
kreator importu i przez okno tworzenia, reklamacja (`complaints`), blokada jakościowa
(`quality_holds`), projekt NPD (`npd_projects`), przyjęcie → nośnik → WAC.
**Nie znalazłem ani jednego formularza, który przyjmuje zapis i nic nie zapisuje.**

Walidacja też działa uczciwie: przy próbie utworzenia roli o kluczu `NOC-ROLE-0`
ekran odmówił i wyjaśnił dlaczego —
> „Use a lowercase slug: letters, digits and underscores (e.g. qa_reviewer)."

— a baza została nietknięta (53 → 53). Po podaniu `noc_night_reviewer` rola powstała
(53 → 54). To wzorcowa para: odmowa przy złym wejściu **i** przepuszczenie przy dobrym.

## Zgodność liczb między ekranami — sprawdzona, ZGODNA

| ekran | licznik na ekranie | baza |
|---|---|---|
| Jakość → NCR | „1 rows" | `ncr_reports` = 1 |
| Jakość → Blokady | „Active 2 · Released 0 · All 2 · 2 rows" | `quality_holds` = 2 (obie `open`) |
| Planowanie → Dostawcy | „ACTIVE SUPPLIERS 4 · All 4 · Active 4 · 4 rows" | `suppliers` = 4 |
| NPD → Pipeline | „Active projects 1 · Pipeline · 1 · BRIEF 1" | `npd_projects` = 1 |
| Finanse → Wycena | „110.000000 kg" | `item_wac_state.total_qty_kg` = 110.000 |

Jedyna rozbieżność liczbowa, jaką znalazłem, to **wartość** w wycenie (§19), nie ilość.

---

# 23. DROBNE — zbiorczo

## D-1. Surowe klucze i18n widoczne na ekranie (10 potwierdzonych miejsc)

Mechanizm: `next-intl` rzuca `FORMATTING_ERROR: The intl string context variable "…"
was not provided` i zamiast tekstu wypisuje klucz.

| ekran | co widać zamiast tekstu |
|---|---|
| Planowanie → Zlecenia przesunięcia | `Planning.transferOrders.list.rowsCount`, `Planning.transferOrders.list.linesCount` |
| Jakość → Reklamacje | `quality.complaints.list.rowsLabel` |
| Ustawienia → Zakłady | `settings.sites.sites_title`, `settings.sites.site_meta` |
| Ustawienia → Dzienniki audytu | `settings.audit_log_viewer.forbidden_message` |
| Ustawienia → Import/Eksport | `settings.import_export.alerts.unsupported_import` |
| Planowanie → Import masowy (krok walidacji) | `Planning.import.wizard.validate.counter` |
| Ustawienia → Pola NPD | `settings.npdFields.assigned_fields_title`, `settings.npdFields.catalog_assignment_count` |

Dodatkowo **na każdej stronie** ta sama awaria dotyczy dzwonka powiadomień:
`{n} unread notifications`, `{n}m ago`, `{n}h ago`, `{n}d ago`. To nie jest brak
tłumaczenia — klucz istnieje, tylko wywołanie nie podaje liczby.

## D-2. Trasy zwracające 404 (linki poza nawigacją)

`/en/products`, `/en/costing`, `/en/technical/costs` — 404. W nawigacji ich nie ma,
więc to najpewniej martwe adresy w dokumentacji/zakładkach.

## D-3. Nazwy kolumn bazy jako etykiety pól (ekran brief NPD)

`product_code`, `product_name`, `number_of_cases`, `recipe_components`, `dev_code`,
`price_brief`, `weekly_volume_packs`, `runs_per_week`, `comments`, `volume`, `weight`,
`packs_per_case` — każde z osobnym przyciskiem „Save".

## D-4. Kolumna `target_retail_price_eur` przechowuje kwoty w GBP

Etykieta na ekranie („TARGET RETAIL PRICE (GBP)") jest **zgodna z walutą organizacji** —
okno tworzenia PO też domyślnie ustawia GBP. Błędem jest **nazwa kolumny**:
`npd_projects.target_retail_price_eur` = 19.90 dla kwoty w funtach. Mylące przy raportach
i migracjach; nie zmienia zachowania aplikacji.

## D-5. Licznik listy kontrolnej bramki NPD: „0 of 6", a widocznych pozycji 3

Panel „G0 CHECKLIST — IDEA" pokazuje 3 pozycje „Required" (+1 „Optional"),
a licznik mówi „0 of 6 required items complete". Brakujące trzy to pola rdzeniowe
(Pack Size, Number Of Cases, Recipe Components) wymienione niżej na liście blokad.
Poprawne, ale czyta się jak sprzeczność.

## D-6. Pusty obowiązkowy wybór bez wyjaśnienia (Split nośnika)

„Destination location *" ma zero pozycji, bo w bazie jest jedna lokalizacja i to
w innym magazynie. Ekran nie mówi ani słowa — przycisk zostaje trwale wyszarzony. §17

## D-7. „Recent jobs" na ekranie Import/Eksport nie pokazuje istniejącego zadania

`import_export_jobs` ma wiersz `status=completed` (import PO z Planowania),
a sekcja „Recent jobs" wyświetla same nagłówki kolumn.

## D-8. Ekran Ról: zdublowane przyciski zakładek

„System Roles" i „Custom Roles" pojawiają się po dwa razy w drzewie
(„Custom Roles" oba razy wyłączone).

---

# 24. CZEGO NIE SPRAWDZIŁEM I DLACZEGO

1. **Zwolnienia blokady jakościowej** (podpis elektroniczny, drugi podpisujący,
   dyspozycje) — **fizycznie niemożliwe**: jedyne wejście to szczegóły blokady, a te
   zwracają 500 (BLOKER B-1). To jest największa dziura w moim pokryciu i znika
   natychmiast po naprawie jednego importu.
2. **Czy odszczepiony nośnik dziedziczy blokadę** — najgroźniejsze obejście bramki
   żywnościowej. Zablokował mnie pusty wybór lokalizacji (§17). Do zrobienia po
   dodaniu lokalizacji w `WH-DEMO-01`.
3. **Serwerowa bramka rezerwacji zablokowanego nośnika** (`lp-detail-actions.ts:475-490`)
   — nie ma do niej włączonego wejścia w interfejsie („Reserve" wyłączony także
   na nośniku bez blokady), więc nie mogłem jej wywołać z przeglądarki.
4. **Czy `next build` przewraca się na brakującym imporcie z B-1** — nie uruchamiałem
   builda, żeby nie deptać katalogu `.next` używanego przez harness E2E. Zmierzone jest
   500 w trybie deweloperskim i kaskada na wszystkie trasy.
5. **Rejestr kontroli jakości (`quality_inspections`)** — formularz wymaga nośnika /
   przyjęcia / wyjścia zlecenia; zbudowałem zapas dopiero pod koniec nocy i nie zdążyłem
   wrócić do tej ścieżki.
6. **Harmonogram, prognozy, MRP „Save this run"** — obejrzane, nie przeklikane do zapisu.
7. **Podpisy elektroniczne w NPD (bramki G3/G4, drugi podpisujący)** — projekt utknął
   na G0, bo bramka słusznie wymaga 6 pozycji listy kontrolnej, których nie uzupełniałem.
8. **Wielozakładowość** — w organizacji Apex jest jeden zakład, więc widoczności
   międzyzakładowej nie dało się sprawdzić z przeglądarki; sprawdziłem ją na poziomie
   funkcji bazodanowej (§21).

---

# 25. CO ZOSTAWIŁEM W BAZIE `monopilot_t2` (dowody do obejrzenia rano)

```
complaints           CMP-00000001, CMP-00000002, CMP-00000002   ← duplikat numeru
quality_holds        HLD-00001000 (batch), HLD-00001001 (LP, powoduje qa_status=on_hold)
npd_projects         NPD-001 „RENAMED-NOC-A" (gate G0)
transfer_orders      TO-NOC-CTRL2 (utworzone przez admina; TO-NOC-NOPERM celowo NIE powstało)
purchase_orders      NOC-IMP-1 (import CSV), PO-NOC-KG-* i PO-NOC-G-* (received)
license_plates       3 nośniki, w tym jeden 5000 g i jeden „on hold"
item_wac_state       110 kg / 170.0000 / 1.545455
suppliers/carriers/ncr_reports/quality_specifications/roles — po jednym rekordzie „NOC*"
```

Spece robocze: `apps/web/e2e/_noc/` (`crawl-B`, `probe-B`, `perm-sweep-B`, `act-B`,
`quality-B`, `import-B`, `npd-B`, `grams-B`, `writes-B`). Materiał roboczy, nie do wdrożenia.
