# FALA 11 — weryfikacja behawioralna na ŻYWEJ PRODUKCJI

**Wdrożenie:** `d5c2319f` · deploy `dpl_7RqhXvjoDhpuux69WDZquySsAgHM` → **READY** 2026-07-29 02:11:32 UTC,
alias `monopilot-kira.vercel.app`.
**Migracja 541:** zastosowana — `schema_migrations`: `541-shipping-allergen-reference-id.sql`,
`applied_at = 2026-07-29 02:08:17.705396+00`, checksum `beb4b6ac…3707`.
**Organizacja:** Apex 22 (`00000000-0000-0000-0000-000000000002`), zakład **Main Factory**
(`7b72b4af-48d5-4da2-a3fe-d191d9e6ec19`).
**Metoda:** zapisy wyłącznie przez interfejs; baza tylko do odczytu (SELECT).

---

## Tabela wyników

| punkt | status | twardy dowód |
|---|---|---|
| **1a** wynik POZA specyfikacją nie zapisuje się jako zaliczony | **POTWIERDZONE** | Kontrola `INSP-00000012` (`dd4ce4e8-cf73-46d6-97d8-cde8b9b11c28`), wyrób ING-FLOUR, spec aktywna `E2E-ING-FLOUR-0712` param **Moisture min 10 / max 14 %**. Wpisano **25**, ręcznie przełączono na **Pass**, ekran pokazał „Overall result: **PASS** / All parameters pass.". Po „Save results" **serwer odmówił** (POST #29 → 200 z odmową). Baza NIEZMIENIONA: `status=pending`, `parameters=[]`, `updated_at` nadal `2026-07-12 15:11:07`. Żaden PASS nie powstał. |
| **1b** wartość NA GRANICY | **UDOKUMENTOWANE — granica DOMKNIĘTA (zalicza)** | Ta sama kontrola, wpisano **14** (= `max_value`), zapis przeszedł. Baza: `parameters=[{"name":"Moisture","pass":true,"actual":"14","expected":"12 %"}]`, `status` `pending`→`in_progress`, `updated_at=2026-07-29 02:16:17`. Kod potwierdza intencję: `isWithinSpecBounds` odrzuca dopiero przy `cmp > 0` / `cmp < 0`, komentarz „Inclusive spec limits: value equal to min or max passes." Ten sam zapis dowodzi, że ścieżka zapisu DZIAŁA — więc odmowa w 1a to bramka, nie awaria. |
| **1c** pominięcie / zmiana nazwy wymaganego parametru odrzucane (fail-closed) | **POTWIERDZONE — odrzucił SERWER** | Podmieniono w wychodzącym żądaniu nazwę `"Moisture"`→`"Moistur"`. Następnie próba podpisania decyzji **Pass** (e-podpis hasłem konta, modal 21 CFR Part 11) → **odmowa**. Baza: `status` nadal `in_progress`, `decided_at = NULL`, `signature_hash = NULL`. **Odrzucił serwer, nie formularz** — POST doszedł i wrócił z serwerowym kodem `missing_spec_parameters` (guard `validateSpecParameterCompleteness` czyta parametry ZAPISANE W BAZIE, nie z ładunku klienta, więc jest nieomijalny od strony przeglądarki). |
| **1d** podpisana kontrola negatywna zakłada blokadę / tworzy NCR | **POTWIERDZONE — jedno i drugie** | Podpisano **Fail** na `INSP-00000012`. Kontrola: `status=failed`, `decided_at=2026-07-29 02:22:33`, `signature_hash=47f5aa5c6338a4dde75d…`. Powstała **blokada `HLD-00001029`** (`cf9b4813-525b-4f79-b5de-723ce1ac0753`, `reference_type=lp`, priority `high`, `hold_status=open`, reason „Inspection dd4ce4e8…: E2E-FALA11-1d moisture 25% out of spec 10-14"). Powstał **`NCR-00001007`** (`9075a06a-0539-4cee-ab80-a36340323b8b`, `ncr_type=quality`, `severity=major`, `status=open`, `reference_type=inspection`, `linked_hold_id=cf9b4813…`, `product_id=37b6315e…`). Nośnik `E2E-A-S14-QA-LP`: `qa_status` `pending`→**`on_hold`**. Liczniki: holds 11→12, NCR 3→4. **Bramka podpisu NIE była obchodzona** — użyto legalnego hasła konta. |
| **1e** pusty wynik → komunikat po ludzku, nie surowy JSON | **CZĘŚCIOWO** | Wyczyszczono pole „Measured value" i zapisano. Na ekranie dosłownie: **„Actual Required"** (`data-testid="inspection-result-save-error"`). To **nie jest surowy JSON** (guard przed zrzutem Zod działa), ale **nie jest też zamierzonym zdaniem**. Zamierzone „Enter a measured value for every parameter before saving." **nie zostało wdrożone** — patrz **Z-01**. |
| **2a(a)** nie da się zaplombować NIEKOMPLETNEJ wysyłki | **POTWIERDZONE (UI+baza); serwer nie sprawdzony osobno** | Utworzono `SH-2026-00013` (`4af11d0d-a01e-4e4d-925a-c129c2ab20aa`) ze `SO-202607-00015`. Stan: `status=packing`, 0 pudeł, packed `0`, picked `2.125 kg`. Przycisk „Seal shipment" **wyłączony**, `title="Pack at least one box before sealing."` Po spakowaniu **1 pudła niepełnego** (1.000 z 2.125 kg) nadal **wyłączony**, `title="Pack the remaining 1.125 kg before sealing."` — jednostka poprawna („kg", nie zaszyte). Baza przez cały czas `status=packing`. **Ograniczenie:** nie udało się wymusić serwerowego POST-a plombowania na pustej wysyłce — harness zablokował manipulację DOM (odblokowanie wyłączonego przycisku). Gałęzie `no_boxes` / `incomplete_pack` w `sealShipment` wykonują się przed jakimkolwiek zapisem statusu, ale **nie zostały wywołane po drucie** i tego nie zaliczam jako dowiedzione. |
| **2a(b)** kompletną wysyłkę DA SIĘ zaplombować | **POTWIERDZONE** | Dopakowano 1.125 kg (2 pudła, razem 2.125 kg = picked 2.125 kg). Przycisk odblokował się, kliknięto „Seal shipment". Baza: `shipments.status` `packing`→**`packed`**, `updated_at=2026-07-29 02:34:28`. Zawartość: pudło 1 = 1.000, pudło 2 = 1.125, oba na linię `fe70fb9a…`. Guard nie jest już za ciasny. |
| **2b** kwoty linii sumują się do wartości zamówienia | **POTWIERDZONE co do grosza** | `SO-202607-00013`: nagłówek `total_amount_gbp = 8.00`, `sum(round(line_total_gbp,2)) = 8.00` (suma nieokrąglona 8.0046). Ekran: linie £5.25 + £2.75, „Total £8.00". Nowo utworzone: `SO-202607-00014` nagłówek **11.03** = suma zaokrąglonych linii **11.03** (surowa 11.0250); `SO-202607-00015` nagłówek **7.81** = **7.81** (surowa 7.8094). Zaokrąglenie per linia, potem suma — zgodność dokładna. |
| **2c** podwójne wysłanie formularza daje JEDNO zamówienie | **POTWIERDZONE — także po stronie serwera** | (i) Dwa kliknięcia „Create sales order" w tym samym ticku: `sales_orders` **9 → 10** (dokładnie +1), powstało `SO-202607-00014`; zatrzask klienta wypuścił 1 żądanie. (ii) **Test serwerowy:** przechwycono realne żądanie akcji i **odtworzono je dwukrotnie równolegle** (`Promise.all`) z tym samym `client_op_id`. Oba: **HTTP 200**, oba zwróciły **TEN SAM** identyfikator `9a229656-fe77-4671-9bf9-de27d7bcf60a`. `sales_orders` **11 → 11**, `idempotency_keys` **2 → 2**. Żadne żądanie nie zostało twardo zablokowane (nie ma przeblokowania), a duplikat nie powstał. `idempotency_keys.response_json` = `{"ok":true,"data":{"id":"f89fbba5…"}}`. |
| **2d** ograniczenia alergenowe na kanonicznym słowniku | **POTWIERDZONE — NIE jest to P0** | Ekran klienta „store" (`56663675…`) → zakładka „Allergen restrictions" → „+ Add restriction". Lista **NIE jest pusta** — pełne EU-14: Celery, Crustaceans, Eggs, Fish, Gluten, Lupin, Milk, Molluscs, Mustard, Nuts, Peanuts, Sesame, Soybeans, Sulphites (14 pozycji = dokładnie zawartość `"Reference"."Allergens"` dla Apex 22). Zapisano **Peanuts / Refuses**. Wiersz `76436783-8853-4879-a4e7-4317d17a4435`: `allergen_id = fea0128e-17db-4835-ac07-08adf1c05ce4`, co **równa się** `public.shipping_allergen_reference_id('<org>','peanuts')`, a odwrotne rozwiązanie trafia w kanoniczny wiersz **`peanuts / Peanuts`**. Brak równoległego rejestru. UI pokazuje „Peanuts · Refuses". |
| **3** `/en/production` renderuje treść | **POTWIERDZONE** | 2021 znaków treści, pasek KPI (`production-kpi-strip`) + tabela „Work orders (25)". Zero 500. |
| **3** MRP „Save this run" zapisuje przebieg | **POTWIERDZONE** | Zaznaczono `mrp-persist-toggle`, kliknięto „Run MRP". Nowy wiersz `mrp_runs`: `MRP-20260729-266438D9` (`e39a2e45-24b2-4a7c-9348-11a0d9213542`), `site_id=7b72b4af…` (Main Factory), `status=completed`, `created_at=2026-07-29 02:38:16`, **11 wierszy `mrp_requirements`**. Ekran: „Last run: 29/07/2026, 03:38:16 · saved as MRP-20260729-266438D9". |
| **3** historia MRP widoczna przy wybranym zakładzie | **POTWIERDZONE** | „Previous runs" z 4 przebiegami przed testem (MRP-20260729-97CB4D75, 2× MRP-20260712, MRP-20260711), po teście 5. `mrp_runs` = 5. |
| **3** dashboard produkcji = ta sama liczba co listy (Z10-01) | **POTWIERDZONE — poprawka działa** | KPI „WOS IN PROGRESS **3 / 3**". Baza dla Main Factory: `IN_PROGRESS = 3`, `RELEASED = 0` → **3/3, zgodne**. Dowód, że to naprawa Z10-01: org-wide byłoby `IN_PROGRESS = 3 (Main) + 1 (warehouse 1) = 4`, aktywne `4 + 1 released = 5` — czyli dokładnie stare **„4/5"**. KPI jest teraz skalowane zakładem. |
| **4** skan ogólny — zero 500, zero pustych stanów błędu | **POTWIERDZONE** | HTTP 200 na: `/en/quality`, `/quality/holds`, `/quality/ncrs`, `/quality/inspections`, `/quality/specifications`, `/quality/ccp-monitoring`, `/quality/complaints`, `/en/shipping`, `/shipping/shipments`, `/shipping/customers`, `/shipping/returns`, `/en/production`, `/en/planning/mrp`, `/en/settings/units`. **Zero błędów konsoli** na ekranach: klienci, widok pakowania wysyłki, szczegóły kontroli, NCR. Ekrany renderują dane, nie stany błędu. Jedyne 404: `/en/settings/printers` (trasa nie istnieje — poza zakresem Fali 11). |
| **PF-R16-03** NCR linkuje kontrolę, nośnik, wyrób i blokadę | **POTWIERDZONE (przy okazji)** | Lista NCR ma kolumnę „LINKED HOLD"; `NCR-00001007` pokazuje PRODUCT `ING-FLOUR` i LINKED HOLD `HLD-00001029` (starsze NCR-y mają „—"). Szczegóły NCR renderują się bez wywrotki i pokazują „Linked records: Hold **HLD-00001029**" (link do `/en/quality/holds/cf9b4813…`) oraz „Source reference: **INSPECTION · dd4ce4e8**". |

---

## Rezydua danych testowych

Wszystko w organizacji **Apex 22**, zakład **Main Factory**. Nic nie kasowałem — do decyzji ownera.

**Jakość**
| obiekt | id / numer | zmiana |
|---|---|---|
| `quality_inspections` | `INSP-00000012` / `dd4ce4e8-cf73-46d6-97d8-cde8b9b11c28` | `pending` → **`failed`** (rekord niezmienny, 21 CFR Part 11). `parameters=[{"name":"Moisture","pass":false,"actual":"25","expected":"12 %"}]`, `result_notes` = „E2E-FALA11-1d moisture 25% out of spec 10-14", `signature_hash=47f5aa5c…` |
| `quality_holds` | `HLD-00001029` / `cf9b4813-525b-4f79-b5de-723ce1ac0753` | **NOWA** blokada, `hold_status=open`, priority `high`, `retention_until=2040-07-29` |
| `ncr_reports` | `NCR-00001007` / `9075a06a-0539-4cee-ab80-a36340323b8b` | **NOWY**, `status=open`, `response due 2026-07-31 02:22` |
| `license_plates` | `E2E-A-S14-QA-LP` / `a0000006-0000-4000-8000-000000000009` | `qa_status` `pending` → **`on_hold`** |

**Wysyłki / zamówienia**
| obiekt | id / numer | zmiana |
|---|---|---|
| `sales_orders` | `SO-202607-00014` / `f89fbba5-449c-4b51-90de-8bd9f9a37b61` | **NOWE**, `draft`, £11.03, notatka „E2E-FALA11-2c double-submit probe" |
| `sales_orders` | `SO-202607-00015` / `9a229656-fe77-4671-9bf9-de27d7bcf60a` | **NOWE**, doprowadzone do `picked`, £7.81, notatka „E2E-FALA11-2c server replay probe" |
| `sales_order_lines` | 2 wiersze | dla obu nowych zamówień (12 → 14) |
| `idempotency_keys` | 2 wiersze | `0264a0b5-…` i klucz dla SO-15 (0 → 2) |
| pick list | `PL-2026-00005` | **NOWA**, pobrane 2.125 kg z `LP-1783403708585-ARVA` |
| `shipments` | `SH-2026-00013` / `4af11d0d-a01e-4e4d-925a-c129c2ab20aa` | **NOWA**, `packing` → **`packed`** |
| `shipment_boxes` / `_box_contents` | 2 pudła + 2 wiersze zawartości | 1.000 kg + 1.125 kg (boxes 3 → 5) |
| `customer_allergen_restrictions` | `76436783-8853-4879-a4e7-4317d17a4435` | **NOWE** — klient „store", **Peanuts / refuses**, notatka „E2E-FALA11-2d canonical allergen probe" (0 → 1) |

**Planowanie**
| obiekt | id / numer | zmiana |
|---|---|---|
| `mrp_runs` | `MRP-20260729-266438D9` / `e39a2e45-24b2-4a7c-9348-11a0d9213542` | **NOWY** przebieg + **11** wierszy `mrp_requirements` (4 → 5) |

**Zapisy pośrednie, które NIE przetrwały** (bramki je odrzuciły — brak rezyduów): próba zapisu 25 % jako PASS, próba zapisu z pustą wartością, próba podpisu Pass przy przemianowanym parametrze.

**Uwaga o jednym pośrednim stanie:** w trakcie testu 1c parametr był chwilowo zapisany pod błędną nazwą `"Moistur"` z `pass:true`. **Przywrócono** poprawną nazwę `"Moisture"` przed podpisem — stan końcowy w bazie jest poprawny (patrz tabela wyżej).

---

## Znalezione przy okazji

### Z-01 [P1] — cała warstwa komunikatów po ludzku dla modułu jakości NIE ZOSTAŁA WDROŻONA
To bezpośrednio dotyka **PF-R16-05**, ale skutki są szersze — psuje komunikaty WSZYSTKICH bramek specyfikacji.

Plik `_meta/i18n-staging/quality-inspections.json` **w commicie `d5c2319f`** (czyli na prodzie) zawiera:
- `en.detail.params.saveError = "Could not save results: {message}"` ← **z placeholderem, który nigdy nie jest podstawiany**
- `en.detail.params.saveErrors` = **`null`** (klucza nie ma)
- `en.detail.esign.submitErrors` = **`null`** (klucza nie ma)

Poprawione łańcuchy istnieją **wyłącznie w niezacommitowanym drzewie roboczym** (`git status` → ` M _meta/i18n-staging/quality-inspections.json`, +52 linie). Czyli językowa połowa naprawy została napisana i nigdy nie wypchnięta.

Co widzi operator NA PRODZIE (dosłownie, zmierzone):
| sytuacja | komunikat na ekranie | miało być |
|---|---|---|
| zapis PASS przy wartości poza specyfikacją | **`Could not save results: {message}`** | „Could not save results. Please try again." |
| pusta wartość zmierzona | **`Actual Required`** | „Enter a measured value for every parameter before saving." |
| podpis Pass przy brakującym parametrze | **`Missing_spec_parameters`** | „Measure every parameter required by the active specification before signing a Pass decision." |

Widoczny na ekranie ciąg `{message}` jest najgorszy — wygląda jak awaria aplikacji, a to poprawnie zadziałała bramka jakości. Operator w zakładzie spożywczym dostaje sygnał „system się zepsuł" zamiast „ta wartość jest poza specyfikacją". Ryzyko: obejście bramki „bo apka nie działa".

Naprawa: zacommitować i wdrożyć obecny stan `_meta/i18n-staging/quality-inspections.json`. Bramki logiczne działają — brakuje tylko tekstów. Warto też dołożyć bramkę CI, która nie przepuści `t('…')` na klucz nieobecny w pakiecie EN.

### Z-02 [P2, ograniczony] — resztkowy fail-open przy ZAPISIE wyników (nie przy decyzji)
`recordInspectionResult` wywołuje guard z `requireSpecCompleteness: false`. W tej gałęzi enforcement dotyczy **wyłącznie** parametrów, których nazwa pasuje do specyfikacji (`specMatched`). Parametr o nazwie spoza specyfikacji przechodzi **nietknięty razem z flagą `pass` od klienta**.

Dowód na prodzie: wysłano `{"name":"Moistur","actual":"25","pass":true}` (spec: Moisture 10–14). Serwer **przyjął** i zapisał dosłownie:
`[{"name": "Moistur", "pass": true, "actual": "25", "expected": "12 %"}]`,
a ekran pokazał **„Results saved." + „Overall result: PASS / All parameters pass."**

Dlaczego to nie jest P0: werdykt końcowy (`quality_inspections.status`) ustawia dopiero `submitInspectionDecision`, który liczy kompletność wobec **specyfikacji i danych z bazy** — i tę próbę odrzucił (punkt 1c). Rekord nie może więc zostać podpisany jako `passed`.

Dlaczego mimo to warto poprawić: (a) w bazie zostaje wiersz parametru oznaczony `pass:true` dla pomiaru rażąco poza specyfikacją, (b) ekran operatora pokazuje zielone „PASS", (c) `unknown_spec_parameters` jest już policzone w `validateSpecParameterCompleteness` — wystarczy odrzucać nieznane nazwy również w gałęzi zapisu, gdy dla wyrobu istnieje aktywna specyfikacja.

### Z-03 [info] — lista zleceń na dashboardzie produkcji ukrywa wszystkie aktywne WO
KPI „3 / 3" jest **poprawne** (zgodne z bazą dla Main Factory). Ale tabela pod nim pokazuje 25 z 40 zleceń, posortowanych tak, że widać **24 Cancelled + 1 Completed, a zero In progress**. Sam błąd Z10-01 jest naprawiony, natomiast wrażenie „KPI mówi co innego niż lista" może wrócić z innego powodu — tym razem przez sortowanie/limit, nie przez zakres zakładu. Sugestia: sortować aktywne przed anulowanymi.

### Z-04 [info] — `createShipment` traktuje `packed` jako blokujący, ale komunikat mówi „open packing"
Próba utworzenia drugiej wysyłki dla `SO-202607-00009` (wysyłka `SH-2026-00010` jest w stanie **`packed`**) zwraca: **„An open packing shipment already exists for this sales order."** `BLOCKING_SHIPMENT_STATUSES` obejmuje `packed`, więc zamówienie wysłane częściowo nigdy nie dostanie drugiej wysyłki. Jeśli to zamierzone — komunikat wprowadza w błąd (mówi o „packing", a wysyłka jest „packed"). Jeśli nie — to brak obsługi dosyłek.

### Z-05 [info] — starsze zamówienia mają `total_amount_gbp = NULL`, ekran liczy z linii
`SO-202607-00008`, `-00009`, `-00012` mają w bazie `total_amount_gbp = NULL`, a listy i szczegóły pokazują poprawnie £11.38 / £11.38 / £7.46 (liczone z linii przez `sum(round(...,2))`). Użytkownik nie widzi rozjazdu, ale każdy raport czytający kolumnę nagłówka wprost zobaczy pustkę. Poprawka PF-R18-03 działa przy tworzeniu/edycji — nie przeliczyła danych historycznych.

### Z-06 [info] — drobiazgi
- `/en/settings/printers` → **404** (trasa nie istnieje). Poza zakresem Fali 11.
- W szczegółach NCR „Source reference: INSPECTION · dd4ce4e8" **nie jest linkiem** (blokada jest). Skrócony identyfikator bez przejścia do kontroli utrudnia audyt.
- Historia konsoli z wcześniejszej sesji przeglądarki zawierała 500 na `/en/settings/units` i `/en/pipeline/<id>/brief`; **w tej weryfikacji `/en/settings/units` zwraca 200**. Nie potwierdzam ich jako żywych awarii.

---

## Czego NIE udowodniłem (jawnie)

1. **Serwerowa odmowa plombowania PUSTEJ wysyłki (2a punkt a).** Odmowa jest potwierdzona po stronie UI (przycisk wyłączony + tooltip) i w bazie (`status` pozostał `packing`), ale nie wystawiłem żądania plombowania na pustą wysyłkę po drucie — harness zablokował odblokowanie wyłączonego przycisku w DOM. Gałęzie `no_boxes` / `incomplete_pack` istnieją w `sealShipment` przed zapisem statusu, lecz nie zostały wywołane na żywo.
2. **Werdykt serwerowy dla wartości granicznej przy sprzecznej fladze klienta (1b).** Zapis 14 z `pass:true` przeszedł, ale klient też twierdził `pass:true` — zgodność nie rozstrzyga sama z siebie, czy werdykt wyliczył serwer. Rozstrzyga to jednak 1a: identyczny układ z wartością 25 i `pass:true` został odrzucony, więc serwer porównuje do granic.
3. **Wielokrotne aktywne specyfikacje (`ambiguous_active_spec`).** Na dzisiejszych danych są dokładnie dwie aktywne specyfikacje, ale dla RÓŻNYCH wyrobów — kolizji nie da się wywołać bez tworzenia nowej specyfikacji. Nieosiągalne bez ingerencji w dane.
4. **Kontrole `final` / `in_process`.** Obie aktywne specyfikacje mają `applies_to = incoming`, a wszystkie kontrole to `reference_type = lp`. Poprawki `specAppliesToCandidates` dla `wo_output` **nie dało się** zweryfikować behawioralnie na dzisiejszych danych — nieosiągalne.
