# RAPORT — TOR B (łańcuch decyzyjny i papierowy)

Checkout: `/Users/mariuszkrawczyk/Projects/_noc/B` @ `80b2821a` · Baza: `monopilot_t2` (migracja 562/564)
Port harnessu: 3514 → aplikacja na 3814 · Persony 5/5 obecne.

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
| `/en/settings/units` | 11 | **+ Add custom conversion** |
| `/en/settings/sites` | 2 | — (dane widoczne) |
| `/en/technical/items` | **42** (kartoteka indeksów) | ⊕Process additions |
| `/en/planning/transfer-orders` | 1 | **+ Create TO** (okno otwiera się w całości, „Save & Plan" aktywny) |
| `/en/planning/mrp` | 0 | **Run MRP** |
| `/en/settings/features` | 0 | Dry-run activation |
| `/en/dashboard` | 0 | Create Shipment |

**To jest na razie tylko widoczność, nie dowód zapisu.** Trwa faza dowodowa:
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

## 5. W TOKU / NIE DOSZEDŁEM (stan na 02:20)

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
