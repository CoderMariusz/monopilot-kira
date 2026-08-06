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
trasa zwraca 500 z tym samym komunikatem, aż do restartu serwera. W poprzednim przebiegu
padło w ten sposób 18 kolejnych tras (PO, TO, dostawcy, zlecenia, wszystkie ustawienia).

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
