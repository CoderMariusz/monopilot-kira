# RAPORT E — tor przeglądarkowy (weryfikacja napraw, których TOR D nie zdążył sprawdzić)

**Środowisko:** `/Users/mariuszkrawczyk/Projects/_noc/A`, baza `monopilot_t1`, PORT 3014 (app 3314).
**Commit pod testem:** `21d4845c` (pobrany z repo głównego).
**Migracje:** doszły do **564** (`563-site-visibility-rls-hoist.sql`, `564-complaint-box-number-uniqueness.sql` zaaplikowane w tym przebiegu; 517 wcześniejszych już było). Bez znaleziska.

---

## 1. BRAMKA HYDRACJI — **PRZESZŁA**

```
PORT=3014 bash scripts/e2e-local.sh --db monopilot_t1 apps/web/e2e/hydration-click-proof.spec.ts
[proof] picked item: RM-BEEF-50 Beef trim 50VL RM — /kg
  ✓  1 [chromium] › hydration-click-proof.spec.ts:20:5 › real click reaches upsertReorderThreshold and writes a row (4.3s)
  1 passed (5.7s)
```

Łańcuch React-hydruje → prawdziwe kliknięcie → server action → wiersz w bazie działa.
Wszystkie poniższe pomiary są na tym samym harnessie.

---

## 2. ŚWIADECTWO ALERGENOWE (commit `11095c7c`) — **POTWIERDZONA**

Test: `apps/web/e2e/_noc/atp-allergen-verdict.spec.ts` (1 passed, 13.7 s).

### Ścieżka odtworzenia (klikana, nie symulowana)
Dla każdego z czterech wejść, w pełnym cyklu:
1. `signIn(page, baseURL, 'en', 'harness')` → `/en/production/changeovers`
2. `changeover-new` → modal `changeover-create-form`
3. `#changeover-line` (combobox) → pierwsza opcja (`DEMO-LINE-*`)
4. `.changeover-to-trigger` → ItemPicker, wpisane `FG` → pierwsza opcja
5. `changeover-cleaning` = zaznaczone
6. **`changeover-atp` = wpisana wartość testowa** (`FAIL` / `PASS` / `7 RLU` / `41 RLU`)
7. `changeover-notes` = `TOR-E <wartość>` (znacznik do korelacji w bazie)
8. `changeover-create-submit`
9. `changeover-review-<id>` → `changeover-sign-first-<id>` → hasło → `changeover-sign-submit`
10. **przelogowanie na personę `admin`** (inny człowiek — inaczej `same_user_rejected`)
11. `changeover-review-<id>` → `changeover-sign-second-<id>` → hasło → submit
12. potwierdzone wizualnie `changeover-sign-complete-<id>` (zielony baner "kompletne")

### Dowód ze stanu (baza, po przeklikaniu)

```sql
select v.validation_result, v.atp_evidence, ce.atp_required, ce.cleaning_completed,
       ce.ext_jsonb->>'notes' as notes, ce.created_at
  from public.allergen_changeover_validations v
  join public.changeover_events ce on ce.id = v.changeover_event_id
 order by ce.created_at desc limit 8;
```

| validation_result | atp_evidence | atp_required | cleaning | notes | czas |
|---|---|---|---|---|---|
| **failed** | `"41 RLU"` | t | t | TOR-E 41 RLU | 04:09:56 |
| **passed** | `"7 RLU"` | t | t | TOR-E 7 RLU | 04:09:53 |
| **passed** | `"PASS"` | t | t | TOR-E PASS | 04:09:50 |
| **failed** | `"FAIL"` | t | t | TOR-E FAIL | 04:09:47 |
| passed | `"FAIL"` | t | t | **NOC-C z myciem, ATP FAIL** | **02:19:46** |

Ostatni wiersz to **ten sam scenariusz sprzed naprawy**, zostawiony w bazie przez TOR C:
`atp_evidence = "FAIL"` i `validation_result = passed`. Ta sama ścieżka po naprawie daje `failed`.
Dowód „przed/po" leży obok siebie w jednej tabeli.

### Werdykt per pozycja z zadania
- `FAIL` → **`failed`** — POTWIERDZONE (to była dziura)
- `PASS` → **`passed`** — kontrola przeciwna POTWIERDZONA
- **`7 RLU` → `passed`** — **kontrola krytyczna POTWIERDZONA. Naprawa NIE zatrzymuje zakładu:**
  normalny odczyt pomiarowy poniżej progu przechodzi.
- `41 RLU` → **`failed`** — próg org potwierdzony niezależnie:
  `select public.atp_swab_threshold_rlu('00000000-0000-0000-0000-000000000002', null)` → **10**

**WERDYKT: POTWIERDZONA.**

---

## 3. BRAMKA TERMINU NA ŚCIEŻKACH PICK i SHIP (commit `93730681`) — **POTWIERDZONA (obie)**

Poprzedni tor sprawdził tylko PACK. Sprawdziłem PICK i SHIP osobnym pomiarem.

### Jak otworzyłem okno defektu (żeby to NIE był test byle jakiej przeterminowanej palety)
Strefa sesji bazy przestawiona **na czas pomiaru**:
```sql
alter database monopilot_t1 set TimeZone='Pacific/Honolulu';   -- na czas pomiaru
-- ... pomiar ...
alter database monopilot_t1 reset TimeZone;                    -- PRZYWRÓCONE (Europe/London)
```
Doby się rozjechały i paleta wpadła dokładnie w szczelinę:

| | wartość |
|---|---|
| doba sesji (`current_date`) | **2026-08-05** |
| doba zakładu (Europe/Warsaw, SITE-DEMO-01) | **2026-08-06** |
| `expiry_date` palety `LP-1785969190008-CP98` | 2026-08-05 12:00 UTC |
| **stara reguła sesyjna** `expiry_date < current_date` | **false** → PRZEPUŚCIŁABY |
| **nowa reguła doby zakładu** | **true** → ODRZUCA |

Czyli okno było realnie otwarte w chwili klikania — a nie „paleta przeterminowana o miesiąc”.

### PICK — `/en/shipping/{soId}/pick`, kliknięte „Confirm pick”

| przypadek | komunikat | `pick_list_lines` po kliknięciu |
|---|---|---|
| paleta przeterminowana wg doby zakładu | `This license plate cannot be picked (hold, QA, or expired).` | `{"status":"pending","quantity_picked":"0.000","picked_at":null}` — **bez zmian** |
| **kontrola przeciwna**: TA SAMA paleta, `expiry_date` = 2026-08-20 | brak błędu | `{"status":"picked","quantity_picked":"60.000","picked_at":"2026-08-05 17:15:00-10"}` |

Jedyna różnica między tymi dwoma przebiegami to data ważności tej samej palety
(`57f1f198-9747-495b-b763-8c05fa2a42ff`) — QA `released`, status `available` w obu.
`page errors: none`, brak 5xx.
Spec: `apps/web/e2e/_noc/expiry-gate-pick.spec.ts`.

### SHIP — `/en/shipping/shipments/310b74b7…` (SH-2026-00003), kliknięte „Ship”

Przygotowanie klikane, nie SQL-em: dopakowane brakujące 12 kg (`pack-lp-submit`, bez błędu —
przy okazji kontrola przeciwna dla PACK), zapieczętowane (`shipment-seal-submit`, `packing→packed`),
wygenerowany i e-podpisany BOL (`shipment-bol-submit`, bez błędu).

| przypadek | komunikat | `shipments` po kliknięciu |
|---|---|---|
| paleta przeterminowana wg doby zakładu | `Cannot ship — a license plate is on a quality hold, not QA-released, or expired.` | `{"status":"packed","shipped_at":null}` — **towar nie wyszedł**, transakcja wycofana |
| **kontrola przeciwna**: TA SAMA wysyłka, `expiry_date` = 2026-08-20 | brak | `status=shipped`, `shipped_at=2026-08-05 17:45:02-10` |

Bramka nie odrzuca wszystkiego — ta sama wysyłka po przywróceniu ważnego terminu wyszła.
Spec: `apps/web/e2e/_noc/expiry-gate-ship.spec.ts`.

**WERDYKT: POTWIERDZONA na PICK i na SHIP, obustronnie.**

### Stan pozostawiony w bazie (do wiadomości)
- strefa bazy `monopilot_t1` **przywrócona** do `Europe/London`
- paleta `57f1f198…` ma `expiry_date = 2026-08-20` (ważna)
- wysyłka `SH-2026-00003` została **wysłana** (`shipped`) — to skutek kontroli przeciwnej,
  celowy i udokumentowany, na bazie testowej
- dwie linie kompletacji przeszły w `picked` (60 kg) — jw.

---

## 4. WYCIEK ODCZYTU (commit `5f286e3a`) — **POTWIERDZONA w przeglądarce**

Spec: `apps/web/e2e/_noc/read-leak-browser.spec.ts` — **1 passed (34.7 s)**, `page errors: none`.
Mierzone jest RENDEROWANIE (`main table tbody tr`), nie odpowiedź warstwy uprawnień.

### A. persona `no_module_access` — **0 grantów** w `role_permissions` (policzone przed pomiarem)

| ekran | panel odmowy | wierszy danych |
|---|---|---|
| `/en/technical/items` (`items-list-denied`) | **tak** | **0** |
| `/en/settings/schema` (`schema-browser-denied`) | **tak** | **0** |
| `/en/settings/sites` (`sites-denied`) | **tak** | **0** |
| `/en/planning/transfer-orders` (`to-list-denied`) | **tak** | **0** |

### B. kontrola przeciwna — **świadomie NIE adminem**

Rola `test_single_site_operator` (`07021a1f-c422-410b-a6d8-5a64aebdfabc`, **nie** owner/admin/org_admin)
dostała na czas pomiaru cztery uprawnienia ODCZYTU (`technical.sensory.read`, `settings.schema.read`,
`settings.org.read`, `scheduler.run.read`) — **granty usunięte po pomiarze**.

| ekran | panel odmowy | wierszy danych |
|---|---|---|
| `/en/technical/items` | nie | **42** |
| `/en/settings/schema` | nie | **18** |
| `/en/settings/sites` | nie | **2** |
| `/en/planning/transfer-orders` | nie | **1** |

42 pozycji i 18 definicji kolumn to dokładnie te liczby, które przed naprawą widział
użytkownik z zerem uprawnień (commit `5f286e3a`). Teraz widzi je **rola operacyjna z grantem**,
a persona bez uprawnień — nic.

To jednocześnie wyklucza dwie wersje fałszywej zieleni: bramka **nie odmawia wszystkim**
(rola operacyjna widzi) i **nie przepuszcza po kodzie roli admina** (przeszła rola nie-adminowa,
przez sam grant, i zniknęła po jego usunięciu).

**WERDYKT: POTWIERDZONA.**

---

## 5. BRAMKI BLOKAD JAKOŚCIOWYCH W PRODUKCJI (commit `bf7f0579`) — **NIE DOSZEDŁEM**

Uczciwie: nie zdążyłem. Zabrakło czasu po pozycjach 1-3, bo ścieżka SHIP wymagała
przeklikania całego łańcucha przygotowania (dopakowanie → pieczęć → BOL z e-podpisem),
a każde załadowanie ciężkiego ekranu wysyłki w `next dev` zajmowało 1-2 minuty.
Trzy przebiegi Playwrighta zostały ucięte limitem czasu runnera, zanim doszły do końca.

**Nie zgłaszam żadnego werdyktu dla ścieżki produkcyjnej.** Do zrobienia w następnym torze:
paleta pod aktywną blokadą jakościową ma być odrzucona przy konsumpcji na zlecenie
produkcyjne (nie tylko przy pakowaniu, co potwierdził TOR D) + kontrola przeciwna czystą paletą.

## 6. Anulowanie WO / cofnięcie konsumpcji — **NIE DOSZEDŁEM** (pozycja „jeśli starczy czasu")

---

## DROBNE — znalezione przy okazji, zbiorczo

**Błąd konsoli na KAŻDEJ stronie aplikacji (powłoka aplikacji).** Zbierany przez
`page.on('console')` w specu ATP, na `/en/production/changeovers`:

```
Server Error: FORMATTING_ERROR: The intl string context variable "n" was not provided
to the string "{n}h ago"
  at buildNotificationBellLabels (...)
  at AppRouteGroupLayout (...)
```
Ten sam błąd dla `"{n}d ago"` i `"{n}m ago"`. Źródło: `buildNotificationBellLabels`
w layoucie grupy `(app)` — woła `t()` na łańcuchu z placeholderem `{n}` bez podania `n`.
Waga: **DROBNY** (dzwonek powiadomień renderuje się dalej), ale zaśmieca konsolę na każdej
stronie i **maskuje prawdziwe błędy** przy każdej diagnostyce prowadzonej przez konsolę.

---

## CZEGO NIE SPRAWDZIŁEM I DLACZEGO

- **Pozycja 3 (blokady jakościowe w produkcji)** i **pozycja 5 (anulowanie WO / cofnięcie
  konsumpcji)** — brak czasu, patrz wyżej. Zero zgadywania.
- **Ścieżka PICK przez `reassignPickLine`** (drugie wywołanie `assertLpPickable`,
  `pick-actions.ts:558`) — sprawdziłem tylko `pickLine` (`:329`). Predykat jest ten sam
  i w tym samym pliku, ale — zgodnie z lekcją tej nocy — „ten sam predykat" to argument,
  nie pomiar. Niezmierzone.
- **Ostrzeżenie o zbliżającym się terminie** (`so-actions.ts:1379`, `days_to_expiry`) —
  autor naprawy sam zgłosił, że prawdopodobnie NIGDY się nie odpala (`timestamptz - date`
  daje `interval`, `Number(...)` → `NaN`). Nie weryfikowałem.
- **Trzy przebiegi Playwrighta zakończyły się formalnym FAIL** (limit czasu runnera po
  wypisaniu wszystkich pomiarów). Wnioski opieram na **stanie bazy odczytanym po przebiegu**,
  nie na kolorze testu — każda liczba w tym raporcie ma pod sobą zapytanie SQL.
