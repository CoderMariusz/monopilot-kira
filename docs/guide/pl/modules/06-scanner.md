# Scanner — mobilna PWA: logowanie / przyjęcie / odłożenie / przesunięcie / pobranie / rozchód / rejestracja wyjścia / rewersja / QC / synchronizacja (przewodnik modułu)

> Szczegółowy przewodnik dla modułu. Każde twierdzenie poniżej jest zakotwiczone
> w rzeczywistym pliku w `apps/web/…` lub `packages/…`; nic nie jest wymyślone.
> Numer modułu to **06** (`06-scanner-p1`, kanoniczny prefiks zdarzeń
> `scanner.*.*`, zgodnie z `.claude/skills/MON-project-overview/SKILL.md`); plik
> nosi nazwę `06-scanner.md`, ponieważ interfejs pulpitu **Zakupy** zajął już
> `06-purchasing.md` — oba wywodzą się z tej samej epoki numeracji PRD, a skaner
> jest stroną operatorską tej warstwy.
>
> Skaner to **ciemna, telefoniczna PWA**, która stanowi cienki klient
> (`apps/web/app/[locale]/(scanner)/**`) obudowany wokół floty
> **bezstanowych obsługiwaczy tras JSON** (`apps/web/app/api/scanner/**`,
> `…/api/production/scanner/**`, `…/api/warehouse/scanner/**`,
> `…/api/quality/scanner/**`). **Nie posiada** własnej tabeli biznesowej —
> jest **powierzchnią zapisu** dla trzech kanonicznych właścicieli: przyjmuje /
> odkłada / przesuwa / pobiera LP-ki (05-warehouse), uruchamia / rejestruje rozchód /
> wyjście / odpad / rewersję na zlecenia produkcyjne (08-production jest właścicielem
> `wo_outputs` / `wo_waste_log` / `wo_material_consumption` — skaner **zapisuje przez
> ten sam SQL / tę samą warstwę serwisową** co pulpit), oraz przeprowadza
> **inspekcję QC** LP-ek (09-quality). Jego jedyne tabele pierwszej klasy to
> `scanner_sessions` (uwierzytelnianie na podstawie kodu PIN) oraz
> `scanner_audit_log` (każde skanowanie + klucz idempotencji).
>
> Trasy są zapisywane bez prefiksu `[locale]`. Ostatni przegląd na tle
> niezatwierdzonego drzewa roboczego (W11 reverse-consume, flaga
> supervisor-PIN dla rewersji w skanerze, rejestrowanie czasu pracy,
> inspekcja QC w skanerze, **skanowanie aparatem / kodem kreskowym** —
> `CameraScannerOverlay` oparty na `@zxing` jest teraz podłączony do wszystkich
> sześciu ekranów z polem skanowania; patrz *§d(viii)*).

---

## a. Przegląd

Skaner zastępuje mysz komputerową **kodem PIN i kodem kreskowym** (wpisanym ręcznie,
odczytanym przez czytnik-wedge lub — teraz — przechwyconym **aparatem urządzenia**
poprzez nakładkę wizjera opartą na `@zxing`; *§d(viii)*). Operator loguje się
za pomocą **adresu e-mail + numerycznego kodu PIN** (nie sesji ciasteczka Supabase),
wybiera kontekst **zakładu / linii / zmiany**, a następnie obsługuje halę produkcyjną
z siatki kafelków: **Produkcja** (zlecenia produkcyjne → rozchód / rejestracja
wyjścia / odpad / rewersja), **Magazyn** (przyjęcie na podstawie ZZ, odłożenie,
przesunięcie LP, pobranie do ZP, **Pakuj dla SO** — skanowanie nośnika LP wyrobu do kartonu wysyłki zamówienia sprzedaży, #13, z bramą bezpieczeństwa żywności przy pakowaniu, informacje o LP) oraz **Jakość** (inspekcja QC
LP — akceptacja/odrzucenie/wstrzymanie). Każde mutujące dotknięcie to pojedynczy
POST JSON zawierający wygenerowany po stronie klienta **`clientOpId`**, dzięki
czemu podwójne dotknięcie lub ponowna próba jest idempotentną operacją bez efektu.

Uwierzytelnianie celowo **nie** korzysta ze stosu Supabase/`withOrgContext`
aplikacji. Sesja skanera to **token nośny** emitowany przez `POST /api/scanner/login`
po weryfikacji PIN-u, przechowywany w formie skrótu w `scanner_sessions` i
weryfikowany przy każdym żądaniu przez `requireScannerSession`
(`lib/scanner/guard.ts`). Token jest przechowywany w `sessionStorage` przeglądarki
i dołączany jako `Authorization: Bearer …` przez kliencki `scannerFetch`
(`(scanner)/_components/scanner-session.tsx:116-142`); odpowiedź `401` czyści go
i przekierowuje z powrotem do `/scanner/login`. Ponieważ sesja nośna nie jest
sesją użytkownika Supabase, obsługiwacze tras nie mogą polegać na ciasteczkach
żądania dla `app.current_org_id()` — dlatego moduł dostarcza **własny styk
kontekstu organizacji** (`lib/scanner/with-scanner-org.ts` + `lib/scanner/txn-org-context.ts`),
który rejestruje `org_id` zweryfikowanej sesji w `app.active_org_contexts`
*wewnątrz transakcji*, aby RLS i funkcje zabezpieczone przez organizację
mogły się rozwiązać.

Na każdej trasie mutującej stany magazynowe nakładają się dwie warstwy
zabezpieczeń: (1) **prawidłowa sesja nośna** (`requireScannerSession`) oraz
(2) **ponownie sprawdzone uprawnienie RBAC** (`hasPermission(user, org, '…')`)
odzwierciedlające dokładnie tę samą bramkę co pulpit — mutacja magazynowa nigdy
nie może być osiągalna przez *dowolną* prawidłową sesję
(`consume/route.ts:90-97`). Ścieżki z podniesionym poziomem PIN (zatwierdzanie
nadmiernego rozchodu, rewersja przez przełożonego) weryfikują PIN *drugiego*
użytkownika (`verifyPin`) i *jego* uprawnienia.

Wspólna logika zapisu jest reużywana, nie reimplementowana: **wyjście** skanera
wywołuje `registerOutput` (`lib/production/output/register-output.ts`), **odpad**
wywołuje `recordWaste` (`lib/production/waste/record-waste.ts`), **start** wywołuje
`startWo` (`lib/production/start-wo.ts`), **przyjęcie** wywołuje
`receiveScannerPoLine` (`lib/warehouse/scanner/receive-po.ts`),
**odłożenie/przesunięcie/pobranie** wywołują pomocniki
`lib/warehouse/scanner/movement.ts`. **Rozchód** i **rewersja rozchodu** to dwie
ścieżki, które skaner reimplementuje lokalnie (w plikach tras), aby móc dodać
gałęzie zatwierdzania PIN-em dostępne tylko z urządzenia przenośnego — przy
zachowaniu lustrzanego SQL pulpitu.

---

## b. Inwentarz funkcji

> Odczyty/zapisy wymieniają dotykane tabele Postgres. „Bramka" to uwierzytelnianie
> sprawdzane po stronie serwera **wewnątrz** trasy: każda trasa wymaga
> **sesji PIN skanera** (`requireScannerSession`); trasy mutujące stany
> magazynowe dodatkowo **ponownie sprawdzają uprawnienie RBAC** za pomocą
> `hasPermission` (brak uprawnienia zwraca typowany błąd `forbidden`, nigdy 500).
> Wszystkie obliczenia ilości są dokładne NUMERIC (ciągi dziesiętne bezpośrednio do
> `NUMERIC`, nigdy liczba zmiennoprzecinkowa JS). Idempotencja oparta jest na
> dostarczanym przez klienta `clientOpId`, odtwarzanym względem
> `scanner_audit_log(org_id, client_op_id)` pod `pg_advisory_xact_lock`.

### Sesja / uwierzytelnianie — `apps/web/app/api/scanner/*` (`lib/scanner/{auth,session,guard,db}.ts`)

| Trasa (plik) | Co robi | Odczytuje / zapisuje | Bramka | Uwagi |
|---|---|---|---|---|
| `POST /api/scanner/set-pin` (`set-pin/route.ts`) | Pierwsze nadanie kodu PIN. Weryfikuje **hasło Supabase** użytkownika (`verifySupabaseLoginPassword`, prawdziwe wywołanie GoTrue `grant_type=password`), a następnie `setPin` haszuje nowy 4–6-cyfrowy PIN. | odczytuje `users`; zapisuje `user_pins`, `scanner_audit_log` | brak (bramkowane hasłem) | `validPin` = `^\d{4,6}$`. |
| `POST /api/scanner/login` (`login/route.ts`) | E-mail + PIN → sesja nośna. `findUserByEmail` (tylko aktywni) → `userHasPin` → `verifyPin` (z uwzględnieniem blokady: `locked` → 423) → `createScannerSession` (TTL 12 h, token = podwójny UUID, **SHA-256-haszowany** w spoczynku). | odczytuje `users`, `user_pins`; zapisuje `scanner_sessions`, `scanner_audit_log` | PIN | Zwraca `{ token, user, expiresAt }`. |
| `POST /api/scanner/change-pin` (`change-pin/route.ts`) | Zmiana PIN-u (weryfikacja aktualnego PIN-u, następnie `setPin`). | zapisuje `user_pins`, `scanner_audit_log` | sesja skanera + aktualny PIN | — |
| `GET /api/scanner/bootstrap` (`bootstrap/route.ts`) | Dane do wyboru kontekstu po zalogowaniu: aktywne **zakłady** + aktywne **linie produkcyjne** dla organizacji. | odczytuje `sites`, `production_lines` | sesja skanera | — |
| `POST /api/scanner/context` (`context/route.ts`) | Ustawia **zakład / linię / zmianę** sesji (aktualizacja częściowa; każde pole zapisywane tylko jeśli obecne). | zapisuje `scanner_sessions` | sesja skanera | linia ogranicza zakres wszystkich dalszych odczytów ZP/przyjęcia. |
| `POST /api/scanner/logout` (`logout/route.ts`) | Kończy sesję (ustawia `ended_at = now()`). | zapisuje `scanner_sessions` | sesja skanera | `verifyScannerSession` następnie odrzuca token ze stemplem `ended_at`. |
| `POST /api/scanner/lock-lp` (`lock-lp/route.ts`) | Pozyskuje / zwalnia miękką blokadę edycji LP. Pozyskanie kradnie blokadę **przetrzymywaną > 5 min** (auditowane jako `lp_stolen`); zwolnienie czyści tylko własną. | zapisuje `license_plates` (`locked_by`/`locked_at`) | sesja skanera | 5-minutowe okno przejęcia przestarzałej blokady (mig 191). |
| `POST /api/scanner/print-label` (`print-label/route.ts`) | Tworzy wiersz `print_jobs` z etykietą GS1-LP (`status='sent'`, `result_url` = data-URL) dla zeskanowanego LP. | odczytuje `license_plates`, `items`; zapisuje `print_jobs` | sesja skanera **+ JEDNO Z** `settings.org.update` / `warehouse.grn.receive` / `warehouse.stock.move` / `production.output.write` | Ciąg elementów GS1 to **TODO** (`build.ts` nie jest jeszcze podłączony — flaga `gtin_missing`). |
| `POST /api/scanner/audit` (`audit/route.ts`) | **Endpoint do odtwarzania offline** — masowy zapis ≤50 buforowanych wierszy `ScannerAuditEntry`; deduplikacja wewnątrz partii + między wierszami na podstawie `client_op_id`. | zapisuje `scanner_audit_log` | sesja skanera | Endpoint, do którego spłukuje się kolejka IndexedDB — **żaden żywy klient go jeszcze nie wywołuje** (patrz luki). |

### Produkcja — lista/szczegóły/odczyty ZP — `…/api/production/scanner/wos/**`

| Trasa (plik) | Co robi | Odczytuje | Bramka |
|---|---|---|---|
| `GET /api/production/scanner/wos` (`wos/route.ts`) | Lista ZP do wyboru w skanerze: `RELEASED` **lub** `in_progress`/`paused` w czasie rzeczywistym, zakres linii ograniczony do `line_id` sesji, posortowane według zaplanowanego startu. | `work_orders`, `wo_executions`, `items`, `production_lines` | sesja skanera |
| `GET …/wos/[id]` (`wos/[id]/route.ts`) | Pakiet centrum wykonania ZP: nagłówek (zwinięty status, wyprodukowane kg bazowe + jednostki wyjściowe z kanonicznego `wo_outputs`), materiały (`wymagane/rozchodowane/jm`), sumy wyjściowe wg typu oraz flaga **bramki alergenowej** (`allergen_profile_snapshot` niepusty). | `work_orders`, `wo_executions`, `items`, `production_lines`, `wo_outputs`, `wo_materials` | sesja skanera |
| `GET …/wos/[id]/lps?materialId=` (`wos/[id]/lps/route.ts`) | Kandydaci LP do rozchodu metodą **FEFO** dla materiału (`v_inventory_available`, `expiry asc nulls last`, ≤25). Najpierw rozwiązuje `product_id` + `uom` materiału; wykonywany wewnątrz `withTxnOrgContext`, aby `app.current_org_id()` rozwiązał się *wewnątrz transakcji*. | `wo_materials`, `v_inventory_available` | sesja skanera |
| `GET …/wos/[id]/consumptions` (`wos/[id]/consumptions/route.ts`) | Odwracalne **oryginalne** wiersze rozchodu do wyboru przy rewersji: `qty_consumed>0`, `correction_of_id is null`, brak istniejącego wpisu korygującego (≤50). Celowo bez bramki uprawnień na poziomie odczytu — destrukcyjna bramka jest na POST. | `wo_material_consumption`, `wo_materials`, `items`, `license_plates` | sesja skanera |
| `GET /api/production/scanner/waste-categories` (`waste-categories/route.ts`) | Aktywne kategorie odpadów (`code`/`name`) dla listy rozwijanej odpadów. | `waste_categories` | sesja skanera |

### Produkcja — zapisy wykonania ZP — `…/api/production/scanner/wos/[id]/**`

| Trasa (plik) | Co robi | Odczytuje / zapisuje | Bramka | Rewersja |
|---|---|---|---|---|
| `POST …/wos/[id]/start` (`start/route.ts`) | `RELEASED → in_progress` przez wspólny serwis `startWo` (zamrożenie BOM + miejsca zarezerwowane `wo_outputs` + bramka alergenów). Przemapowuje `allergen_changeover_required` → kanoniczne `changeover_signoff_required` (409 z `changeoverId`). Deterministyczne `transactionId` z `clientOpId`. | odczytuje/zapisuje pełny zestaw `startWo` (`wo_events`, `wo_executions`, `work_orders`, `wo_outputs`, `bom_snapshots`, …) | sesja skanera **+ `production.wo.start`** | `cancelWo` pulpitu |
| `POST …/wos/[id]/consume` (`consume/route.ts`) | **Ręczny rozchód** — odzwierciedla SQL `recordDesktopConsumption`. Bramka bezpieczeństwa LP (`assertLpConsumableForProduction`: `lp_not_released` / `lp_expired` / **T-064** `quality_hold_active` → emituje `production.consume.blocked`). **Dwupoziomowa bramka nadmiernego rozchodu**: poziom ostrzegawczy (`overconsume_warn_pct`) → kontynuacja z ostrzeżeniem bursztynowym; poziom zatwierdzenia (`overconsume_threshold_pct`) → **PIN przełożonego** (`overconsume_approval_required` 409, jeśli brak; zatwierdzający to *inny* użytkownik tej samej organizacji z `production.consumption.override_approve`). Zwiększa `wo_materials.consumed_qty`, zmniejsza LP (z ochroną rezerw, → `consumed` przy 0), rejestruje zgodność z FEFO, na końcu wstawia wpis w księdze rozchodu, emituje `warehouse.material.consumed`. Idempotentne. | odczytuje `tenant_variations`, `wo_materials`, `v_inventory_available`, `license_plates`; zapisuje `wo_materials`, `license_plates`, `wo_material_consumption`, `scanner_audit_log`, `outbox_events` | sesja skanera **+ `production.consumption.write`** (+ zatwierdzający `production.consumption.override_approve` powyżej limitu) | `…/reverse-consume` |
| `POST …/wos/[id]/output` (`output/route.ts`) | Rejestruje wyjście `primary`/`co_product`/`by_product` przez wspólny `registerOutput` (tworzy LP wyjściowy, łączy genealogią z rozchodowanymi LP, bramka wstrzymań, catch-weight). Ogranicza ZP do linii (`production_line_id = session.line_id`). Przy `QualityHoldError` emituje `production.consume.blocked`. | odczytuje `work_orders`; zapisuje przez `registerOutput` (`wo_outputs`, `license_plates`, `lp_genealogy`, `lp_state_history`, `outbox_events`) + `scanner_audit_log` | sesja skanera **+** (bramki `holdsGuard` / stanu w `registerOutput`) | `voidWoOutput` pulpitu |
| `POST …/wos/[id]/waste` (`waste/route.ts`) | Rejestruje skategoryzowany wiersz `wo_waste_log` (ilość **zawsze w kg**, `> 0`) przez wspólny `recordWaste`. `shift_id` domyślnie przyjmuje zmianę sesji, w przeciwnym razie `'scanner'`. | zapisuje przez `recordWaste` (`wo_waste_log`, `outbox_events`) + `scanner_audit_log` | sesja skanera | `voidWasteEntry` pulpitu |
| `POST …/wos/[id]/reverse-consume` (`reverse-consume/route.ts`) | **Ręczna rewersja R3** — pełny model autoryzacji w *§e*. PIN operatora + `production.consumption.correct` ZAWSZE; e-mail + PIN przełożonego + `production.consumption.override_approve` **jeśli** flaga organizacji `scanner_reverse_require_supervisor_pin` ≠ `'false'`; zamknięte ZP wymaga `production.corrections.closed_wo`. Wstawia **negowany storno** `wo_material_consumption` (`correction_of_id`), zmniejsza `consumed_qty` (walidacja SQL ≥0 → w przeciwnym razie `inconsistent_ledger`), przywraca ilość LP + stan uwzględniający QA (`consumed`→`available` tylko jeśli nadal `qa released`, w przeciwnym razie `received`), zapisuje historię LP + audyt `production.consumption.corrected`. Idempotentne (odtworzenie + `23505` → `already_corrected`). | odczytuje `tenant_variations`, `wo_material_consumption`, `license_plates`, `wo_materials`, `work_orders`, `wo_executions`; zapisuje `wo_material_consumption`, `wo_materials`, `license_plates`, `lp_state_history`, `audit_events`, `scanner_audit_log` | sesja skanera **+ PIN operatora + `production.consumption.correct`** (+ PIN przełożonego + `production.consumption.override_approve` jeśli flaga włączona; + `production.corrections.closed_wo` jeśli ZP zamknięte) | **jest** rewersją rozchodu |
| `POST /api/scanner/labor` (`labor/route.ts`) | E4B rejestracja wejścia / wyjścia dla ZP (automatyczne zamknięcie poprzedniego otwartego wpisu przy rejestrowaniu wejścia). `GET` zwraca bieżący stan. **Bez e-podpisu CFR**; tożsamość = sesja PIN. | zapisuje `wo_labor_log` | sesja skanera | wyjście / wejście |

### Magazyn — przyjęcie / odłożenie / przesunięcie / pobranie / LP — `…/api/warehouse/scanner/**`

> Wywołują `lib/warehouse/scanner/{receive-po,movement}.ts` (szczegółowo
> udokumentowane w *05-warehouse.md §b*). Specyficzne dla skanera fakty to
> **ciągi operacji sesji** i **ponowna weryfikacja RBAC**: trzy trasy zapisu
> stanów magazynowych (odłożenie / przesunięcie / pobranie) ponownie bramkują
> na pojedynczym uprawnieniu **`warehouse.stock.move`**
> (`putaway/route.ts:27`, `move/route.ts:28`, `pick/route.ts:28`);
> przyjęcie bramkuje tylko na operacji sesji `scanner.receive_po`.

| Trasa (plik) | Co robi | Bramka |
|---|---|---|
| `GET …/scanner/pos` + `…/pos/[id]` | Lista otwartych ZZ / szczegóły do przyjęcia. | sesja skanera (`scanner.receive_po.list` / `.detail`) |
| `POST …/scanner/receive-line` (`receive-line/route.ts` → `receiveScannerPoLine`) | **Jedna** transakcja przyjęcia (pulpit + skaner ją współdzielą): tworzy wiersz GRN + LP (`received`/`qa pending`), limit nadmiernego przyjęcia 110%, opcjonalne miejsce docelowe, otwiera inspekcję GRN-QC gdy jest zaznaczone. | sesja skanera (`scanner.receive_po`) — **nie** jest uprawnieniem RBAC |
| `GET …/scanner/lp` + `…/scanner/location` | Skanowanie numeru LP / kodu lokalizacji → szczegóły do info o LP oraz miejsca docelowego przesunięcia/odłożenia. | sesja skanera (`warehouse.scanner.lp.lookup` / `.location.lookup`) |
| `GET …/scanner/putaway/suggest` | Rankingowe sugestie miejsca docelowego (ten sam produkt → puste → domyślne). | sesja skanera (`warehouse.scanner.putaway.suggest`) |
| `POST …/scanner/putaway` (`moveScannerLp` odłożenie) | Relokacja + **promocja `received→available`** (widoczność FEFO). | sesja skanera **+ `warehouse.stock.move`** |
| `POST …/scanner/move` (`moveScannerLp` transfer) | Czyste przesunięcie do lokalizacji (bez promocji). | sesja skanera **+ `warehouse.stock.move`** |
| `POST …/scanner/pick` (`pickScannerLp`) | Pobranie FEFO → staging ZP (`move_type='issue'`, bez odjęcia ilości; tylko towar zwolniony przez QA). | sesja skanera **+ `warehouse.stock.move`** |
| `GET …/scanner/pick/wos` + `…/pick/lps` | Dostępne ZP + kandydaci LP FEFO dla materiału. | sesja skanera (`warehouse.scanner.pick.wos` / `.pick.lps`) |
| `GET …/scanner/ship/shipments` (`ship/shipments/route.ts`) | **Pakuj dla SO (#13, 2026-06-25):** lista OTWARTYCH wysyłek (`packing`), aby skaner wybrał, do której pakować. | sesja skanera **+ `ship.pack.close`** |
| `POST …/scanner/ship` (`ship/route.ts`) | **Pakuje jeden nośnik LP wyrobu do kartonu wysyłki SO** — używa `packLpIntoBoxCore` (ta sama alokacja + walidacja **bezpieczeństwa żywności** co pakowanie desktop): LP wstrzymany / QA-niezwolniony / przeterminowany jest odrzucany z `lp_blocked_for_pack` (409); rewersja przez desktop `unpackShipment`. | sesja skanera **+ `ship.pack.close`** |

### Jakość — inspekcja QC skanera — `…/api/quality/scanner/inspect`

| Trasa (plik) | Co robi | Odczytuje / zapisuje | Bramka | Rewersja |
|---|---|---|---|---|
| `POST /api/quality/scanner/inspect` (`inspect/route.ts`) | Rejestruje szybką decyzję QC dla LP: `pass`→`qa_status='released'`, `fail`→`'rejected'`, `hold`→`'on_hold'` **i** otwiera rzeczywisty wiersz `quality_holds`/`quality_hold_items` + emituje `quality.hold.created`. Zapisuje wiersz `quality_inspections` (`next_quality_inspection_number`, `signature_hash` **NULL celowo**). Odmawia dla LP w stanie terminalnym (`consumed/merged/shipped/returned`). Idempotentne. | odczytuje `license_plates`; zapisuje `quality_inspections`, `license_plates`, `quality_holds`, `quality_hold_items`, `outbox_events`, `scanner_audit_log` | sesja skanera **+ `quality.inspection.execute`** | przepływy QA / wstrzymania pulpitu |

**Zinwentaryzowane trasy: 27** — 8 sesja/uwierzytelnianie, 5 odczyty produkcji, 6 zapisów
produkcji (łącznie z rejestracją czasu), 8 magazyn (odwołanie do 05), 1 jakość.
Rdzeń wykonawczy to **rozchód + rewersja rozchodu** (lokalnie, z podniesionym PIN-em)
oraz wspólne serwisy piszące **start / wyjście / odpad / przyjęcie / odłożenie /
przesunięcie / pobranie / inspekcja**.

> Trasa `inspect` QC celowo rejestruje **bez e-podpisu CFR-21** —
> w odróżnieniu od desktopowego `submitInspectionDecision` — ponieważ
> „użytkownik jest już indywidualnie zidentyfikowany przez sesję skanera
> powiązaną z PIN-em" (`inspect/route.ts:160-165`); `decided_by` + wiersz
> `scanner_audit_log` zapewniają identyfikowalność, a `signature_hash` jest
> celowo `NULL`.

---

## c. Maszyna stanów

Skaner **nie posiada własnego cyklu życia** — napędza maszynę stanów uruchomień ZP
(08-production) i maszynę stanów LP (05-warehouse). To, co *posiada*, to
**cykl życia sesji** i **maszyna stanów idempotencji dla każdej mutacji**.

### Sesja skanera (`scanner_sessions`, `lib/scanner/session.ts`)

```
 set-pin (hasło) ─► (użytkownik zarejestrowany, brak sesji)
        │
   login (PIN)
        ▼
   active ──context(site/line/shift)──► active (scoped)
     │  ▲                                  │
     │  └────── każde żądanie: verifyScannerSession (last_seen_at = now)
     │                                     │
   logout / wygaśnięcie TTL 12-h           │
        ▼                                  ▼
   ended (ended_at ustawiony) ◄──── expired (expires_at < now)
```

| Stan | Ustawiany przez | Uwagi |
|---|---|---|
| enrolled (brak sesji) | `setPin` (bramkowane hasłem Supabase) | PIN istnieje w `user_pins`; brak tokenu nośnego. |
| `active` | `createScannerSession` | TTL 12 h; token SHA-256-haszowany w spoczynku; nośnik w `sessionStorage`. |
| `active (scoped)` | `POST /context` | Ustawione `site_id`/`line_id`/`shift` — linia ogranicza zakres odczytów ZP/przyjęcia. |
| `ended` | `POST /logout` | Stempel `ended_at`; `verifyScannerSession` następnie odrzuca. |
| `expired` | TTL | `expires_at < now()` → `invalid_session` (401) → klient czyści + przekierowuje. |

`verifyScannerSession` to jedno `UPDATE … set last_seen_at=now() where
session_token_hash=$1 and expires_at>now() and ended_at is null returning *`
(`session.ts:103-119`) — weryfikacja i odświeżenie w jednej instrukcji; nieudana
weryfikacja nadal audituje przez `findScannerSessionForAudit` (`guard.ts:42-46`).

### Idempotencja dla każdej mutacji (każdy mutujący POST na stany magazynowe)

```
klient: clientOpId = crypto.randomUUID()  (przechowywany do sukcesu; reużywany przy ponownej próbie)
        ▼
begin ─► registerTxnOrgContext ─► pg_advisory_xact_lock($org:scanner:clientOpId)
        ▼
   odtworzenie? (scanner_audit_log where client_op_id = clientOpId)
     ├─ tak ─► commit + zwróć zapisany ładunek 'ok' (replay:true)
     └─ nie  ─► wykonaj mutację ─► zapisz scanner_audit_log(result_code='ok', client_op_id, ext)
                                 ─► commit (ext odzwierciedla odpowiedź sukcesu dla wierności odtwarzania)
```

**Blokada doradcza xact + unikalny wiersz `(org_id, client_op_id)`** sprawiają,
że podwójne dotknięcie, ponowna próba sieciowa lub ponowne wysłanie po naciśnięciu
Wstecz są operacją bez efektu, która **odtwarza oryginalną odpowiedź** zamiast
mutować dwukrotnie (`consume/route.ts:105-140`, `reverse-consume/route.ts:500-516`).
Przy rewersji rozchodu naruszenie unikalności `23505` w warunkach wyścigu
odczytuje ponownie odtworzenie *po* wycofaniu (`readReplayAfterRollback`),
więc przegrany wyścig nadal zwraca ładunek zwycięzcy.

### Styk kontekstu organizacji (dlaczego SQL skanera to nie po prostu `withOrgContext`)

`app.current_org_id()` (mig 002) **nie** odczytuje GUC — łączy
`app.active_org_contexts` (kluczowane na PID backendu + bieżące **txid**)
z `app.session_org_contexts`. Sesja nośna nie ma ciasteczka Supabase do zasilenia
tego mechanizmu, więc skaner rejestruje to explicite:
- **`withScannerOrg(session, fn)`** (`with-scanner-org.ts`) — odpowiednik
  `withOrgContext` dla roli aplikacji/RLS, wiążący `org_id` zweryfikowanej sesji;
  używany przez wspólne serwisy piszące (wyjście/odpad/start/rejestracja czasu/przyjęcie/inspekcja).
- **`registerTxnOrgContext` / `withTxnOrgContext`** (`txn-org-context.ts`) — wywoływany
  bezpośrednio po `begin`, aby automatyczne SELECTy filtrujące po
  `app.current_org_id()` (lista FEFO, kategorie odpadów, lista rozchodów)
  rozwiązały organizację *wewnątrz transakcji*. Czyszczenie po commit; janitor mig-031
  usuwa wycieki.

### Logowanie na skanerze / wejście do powłoki urządzenia

Aby zalogować się do skanera, wejdź na `/pl/scanner/login` (lub `/pl/scanner/home`, które automatycznie przekierowuje do logowania). Zaloguj się za pomocą adresu e-mail i kodu PIN.

![Ekran logowania skanera — pola e-mail i PIN (4–6 cyfr), status ONLINE](screenshots/scanner-device-login.png)

---

## d. Instrukcje użytkownika

> Kafelki i etykiety to pakiety i18n PWA skanera
> (`(scanner)/_components/scanner-*labels`); siatka kafelków ekranu głównego to
> `home-screen.tsx:31-56`. Kafelki, których ekrany nie są zbudowane, są
> renderowane jako **wyłączone** z `title="Coming soon"` (`home-screen.tsx:118-120`).
>
> Każdy ekran skanujący kod używa wspólnego prymitywu `ScanInputArea`
> (`scanner-primitives.tsx:404-490`) — wpisz/wedge w pole **lub**
> dotknij **📷 Aparat**, aby otworzyć wizjer kamery (*§d(viii)*). Kamera jest
> podłączona do **wszystkich sześciu** ekranów z polem skanowania:
> **Przesuń LP** (`move-screen.tsx:269,333`), **Odłóż** (`putaway-screen.tsx:273,427`),
> **Pobierz** (`pick-screen.tsx:358,367` — dwie nakładki: wyszukiwanie ZP + lokalizacja
> stagingu, otwierane przez `setWoCameraOpen`/`setDestCameraOpen` w `:441,546`),
> **Info o LP** (`lp-info-screen.tsx:103,123`), **Inspekcja QC**
> (`qa-screen.tsx:167,229`) i **Przyjęcie ZZ** (`receive-po-list-screen.tsx:80,99`).
> Ekran, który nie przekazuje `onOpenCamera`, pokazuje przycisk Aparat **wyłączony**
> zamiast martwego braku efektu (`scanner-primitives.tsx:466-475`).

### (i) Rejestracja PIN-u i logowanie

1. Z urządzenia otwórz `/scanner/login`. Tylko za pierwszym razem: **Ustaw PIN** →
   `POST /api/scanner/set-pin` z **adresem e-mail konta + hasłem Supabase** + nowym
   **4–6-cyfrowym PIN-em**.
2. Zaloguj się za pomocą **e-mail + PIN** → `POST /api/scanner/login`. Po 5 błędnych
   PIN-ach konto zostaje zablokowane (423 `pin_locked`).
3. Trafiasz na **Wybór zakładu / linii / zmiany** (`/scanner/login/site`,
   `GET /bootstrap` → `POST /context`). Wybrana **linia** ogranicza zakres list ZP
   i przyjęć, które będziesz widzieć.

### (ii) Przyjęcie towaru na podstawie ZZ

Główna → **Magazyn → Przyjęcie (ZZ)** → lista otwartych ZZ → pozycja → podaj Partię /
Datę ważności / opcjonalne miejsce docelowe / Ilość → **Przyjmij**
(`POST …/warehouse/scanner/receive-line`). Otrzymujesz nowy **numer LP**; LP
powstaje w stanie `received`/`qa pending`; wyświetla się baner **wstrzymania QC**,
jeśli włączone jest Wymagaj GRN-QC. (Powyżej 110% zamówionej ilości → `over_receive_cap`.)
Pełny przepływ: *05-warehouse.md §d(i)*.

### (iii) Odłożenie / Przesunięcie / Pobranie

- **Odłożenie:** Główna → **Odłóż** → skanuj LP → zaakceptuj sugerowaną lokalizację → potwierdź
  (`POST …/scanner/putaway`). LP w stanie `received` jest **promowane do `available`**.
- **Przesuń LP:** Główna → **Przesuń LP** → skanuj LP → skanuj miejsce docelowe → potwierdź
  (`POST …/scanner/move`). Czysta relokacja.
- **Pobranie:** Główna → **Pobierz** → wybierz ZP + materiał → skanuj LP sugerowane przez FEFO +
  lokalizację stagingu → **Pobierz** (`POST …/scanner/pick`). Tylko towar zwolniony przez QA;
  bez odjęcia ilości (rozchód nastąpi później). Wszystkie trzy wymagają `warehouse.stock.move`.

### (iv) Start + rozchód + wyjście + odpad dla ZP

1. Główna → **Zlecenia produkcyjne** → otwórz ZP → **Start** (`POST …/wos/[id]/start`,
   wymaga `production.wo.start`). Zablokowane starty wyświetlają `changeover_signoff_required`
   z `changeoverId` do rozliczenia najpierw na pulpicie.
2. **Rozchód:** kafelek **Rozchód** → skanuj LP, podaj ilość → **Przyjmij**
   (`POST …/wos/[id]/consume`). **Rozchód na poziomie ostrzegawczym** zwraca sukces
   z bursztynowym ostrzeżeniem; powyżej **poziomu zatwierdzenia** ekran odsłania
   pole **e-mail + PIN przełożonego** (inny użytkownik tej samej organizacji
   z `production.consumption.override_approve`). LP-y z wstrzymaniem jakościowym /
   niezwolnione / przeterminowane są odmawiane.
3. **Rejestracja wyjścia:** kafelek **Wyjście** → wybierz typ (primary/co/by) + ilość
   (jednostki + `each|box`, lub `actualWeightKg`, lub `qtyKg`) → wyślij
   (`POST …/wos/[id]/output`). Tworzy LP wyjściowy wstrzymany przez QA, połączony genealogią.
4. **Odpad:** kafelek **Odpad** → wybierz kategorię + ilość (**zawsze kg**) → wyślij
   (`POST …/wos/[id]/waste`).

### (v) Rewersja błędnego rozchodu (ręczna R3)

1. ZP → **Rewersja rozchodu** → wybierz odwracalny wiersz
   (`GET …/wos/[id]/consumptions`).
2. Podaj **kod przyczyny** + uwagę + swój **PIN operatora** → wyślij
   (`POST …/wos/[id]/reverse-consume`).
3. Jeśli organizacja tego wymaga, serwer odpowiada `invalid_supervisor` i ekran
   **reaktywnie odsłania sekcję e-mail + PIN przełożonego**
   (`reverse-consume-screen.tsx:15-16, 227`) — wyślij ponownie z danymi przełożonego.
   Dla **zamkniętego** ZP dodatkowo potrzebne jest `production.corrections.closed_wo`.
4. Po sukcesie oryginał jest przekreślony, `consumed_qty` jest zmniejszone,
   a ilość/stan LP są przywrócone (do ponownego pobrania tylko jeśli nadal zwolniony przez QA).

### (vi) Inspekcja QC LP

Główna → **Jakość → Inspekcja QC** → skanuj LP → **Akceptuj / Odrzuć / Wstrzymaj** + uwaga → wyślij
(`POST /api/quality/scanner/inspect`, wymaga `quality.inspection.execute`). Akceptacja
zwalnia LP do FEFO; odrzucenie odrzuca; wstrzymanie otwiera rzeczywiste wstrzymanie
jakościowe. Bez e-podpisu — sesja PIN jest tożsamością.

### (vii) Rejestracja czasu pracy + drukowanie etykiety

- **Rejestracja czasu:** centrum wykonania ZP pokazuje **Zarejestruj wejście / wyjście**
  (`POST /api/scanner/labor`), automatycznie zamykając poprzedni otwarty wpis przy
  rejestracji wejścia.
- **Drukuj etykietę:** skanuj LP → **Drukuj** (`POST /api/scanner/print-label`)
  tworzy wiersz `print_jobs`; wymaga jednego z `settings.org.update` /
  `warehouse.grn.receive` / `warehouse.stock.move` / `production.output.write`.

### (viii) Skanowanie kodu kreskowego aparatem urządzenia

Każdy ekran z polem skanowania odsłania przycisk **📷 Aparat** obok pola ręcznego
(`scanner-primitives.tsx:466-478`). Dotknięcie otwiera **pełnoekranową nakładkę
wizjera** (`CameraScannerOverlay`), która wykonuje ciągłe dekodowanie na żywo
przez tylny aparat telefonu; zdekodowany kod trafia do tego samego handlera
wyszukiwania / wysyłania, który obsługuje już pole ręczne — istnieje **jedna**
ścieżka dalszego przetwarzania niezależnie od tego, czy wpiszesz kod ręcznie,
skanujesz czytnikiem wedge, czy aparatem.

- Nakładka przejmuje aparat przez `getUserMedia({ video: { facingMode:
  'environment' } })` i dekoduje przez `BrowserMultiFormatReader`
  z `@zxing/browser` (`camera-scanner-overlay.tsx:143-196`). Celownik + animowana
  linia skanowania pokazują obszar docelowy; przycisk **latarki** pojawia się tylko
  tam, gdzie urządzenie raportuje możliwość latarki, a przycisk **odwrócenia kamery**
  przełącza front/tył (`camera-scanner-overlay.tsx:438-509`).
- Po trafieniu nakładka miga `✓ <code>` przez ~600 ms, następnie wywołuje
  `onDecode(code)`, a ekran główny ją zamyka + uruchamia wyszukiwanie (np.
  `move-screen.tsx:269-278`, przekierowując zeskanowaną wartość do `lookupLp`).
- **Odmowa uprawnień** (`NotAllowedError`) i **brak kamery** (`NotFoundError`,
  np. pulpit) renderują w nakładce panel z przyciskiem **„Wpisz ręcznie"**,
  który wraca do skupionego pola ręcznego
  (`camera-scanner-overlay.tsx:147-153, 396-435`) — kamera nigdy nie jest ślepą
  uliczką.
- Zamknięcie, anulowanie, sprzętowy przycisk wstecz lub odwrócenie kamery
  **demontują dekoder i zatrzymują każdy tor `MediaStream`**
  (`camera-scanner-overlay.tsx:99-122, 210-214`), więc lampka kamery nigdy
  nie pozostaje włączona.

> **Zastrzeżenia.** `getUserMedia` działa **tylko przez HTTPS** (bez problemu na
> Vercel; localhost jest wyłączony). **iOS Safari wymaga gestu użytkownika**
> do uruchomienia kamery — dotknięcie przycisku Aparat je dostarcza, ale
> nakładka nie może otwierać się automatycznie przy montowaniu. **Latarka nie jest
> powszechnie obsługiwana** (niedostępna w iOS Safari + większości urządzeń
> stacjonarnych), więc kontrolka jest wyświetlana tylko po sprawdzeniu możliwości
> urządzenia i w przeciwnym razie renderowana jako wyłączona
> (`camera-scanner-overlay.tsx:160-168, 472-491`). Cały tekst nakładki jest
> zlokalizowany przez blok etykiet `cameraScanner` (`scanner-labels.ts:418-428` EN /
> `:871-881` PL).

---

## e. Model autoryzacji rewersji rozchodu (precyzyjny)

`POST …/wos/[id]/reverse-consume` (`reverse-consume/route.ts`) to trasa
z najgęstszą autoryzacją w module. Kolejność decyzji (każdy błąd wycofuje
i audituje):

1. **Najpierw idempotencja** — sprawdzenie odtworzenia (dwukrotnie: przed + po
   blokadzie doradczej); wyścig `23505` odczytuje ponownie ładunek zwycięzcy
   (`already_corrected`).
2. **PIN operatora — ZAWSZE.** `verifyPin(session.user_id, operatorPin)` →
   `locked` = 423, błędny = **commit** (zachowanie licznika blokady) + 401
   `invalid_pin` (`route.ts:518-528`).
3. **Uprawnienie operatora — ZAWSZE.** `hasPermission(operator,
   'production.consumption.correct')` → w przeciwnym razie 403 `forbidden`
   (`route.ts:530-534`). To jest bezwarunkowa bramka: *każda* rewersja w skanerze
   wymaga od operatora posiadania `production.consumption.correct`.
4. **Poziom przełożonego — sterowany flagą funkcji.** `supervisorPinRequired(ctx)`
   odczytuje `tenant_variations.feature_flags->>'scanner_reverse_require_supervisor_pin'`;
   **brak wartości lub dowolna wartość inna niż `'false'` = wymagane (domyślnie WŁĄCZONE)**
   (`route.ts:226-234`). Gdy wymagane:
   - **e-mail + PIN przełożonego** są obowiązkowe (`invalid_supervisor` 401, jeśli brak);
   - przełożony musi być **innym** użytkownikiem tej samej organizacji (`route.ts:549`);
   - PIN przełożonego jest weryfikowany (`pin_locked` 423 / `invalid_pin` 401);
   - przełożony musi posiadać **`production.consumption.override_approve`**
     (`supervisor_forbidden` 403) (`route.ts:572-577`).
   Gdy WYŁĄCZONE (`'false'`), wymagany jest **tylko PIN operatora** — ale operator
   *nadal* potrzebuje `production.consumption.correct`.
5. **Eskalacja dla zamkniętego ZP.** Jeśli ZP ma status `closed`, operator
   dodatkowo potrzebuje **`production.corrections.closed_wo`**
   (`closed_wo_correction_forbidden` 403, `route.ts:594-598`).
6. **Bramki odwracalności.** Oryginał musi istnieć + być nieskorygowany
   (`already_corrected` 409); LP musi być w stanie `consumed|available|received`
   (`lp_not_restorable` 409); dekrementacja `wo_materials` musi pozostać ≥0
   (`inconsistent_ledger` 409) — wszystko walidowane **przed** jakimkolwiek zapisem.

Flaga organizacji jest administrowana w **Ustawienia → Podpisy i PIN-y → scanner-auth**
(`settings/scanner-auth/_actions/scanner-auth-actions.ts`): `getScannerAuthPolicy`
odczytuje ją (domyślnie zamknięte za `org.access.admin`), `setScannerReverseAuthPolicy`
upsertuje do `tenant_variations.feature_flags` jako tekst `'true'`/`'false'`
za `settings.flags.edit` + wiersz audytu. Interfejs skanera **nie** pobiera flagi
z wyprzedzeniem — odkrywa ją reaktywnie z odpowiedzi serwera `invalid_supervisor`
(`reverse-consume-screen.tsx:227`), więc flaga serwerowa jest jedynym źródłem prawdy.

---

## f. RBAC i uprawnienia

> Skaner nakłada **dwa** poziomy uwierzytelniania: **sesję nośną** (wywodzoną z PIN-u,
> nie-Supabase) i **ponownie sprawdzony ciąg RBAC** przy mutacjach magazynowych.
> Sama sesja nigdy nie wystarcza do mutowania stanów magazynowych.

**Ciągi uprawnień RBAC sprawdzane przez skaner** (wszystkie obecne w
`packages/rbac/src/permissions.enum.ts`):

| Uprawnienie | Sprawdzane przez | Poziom |
|---|---|---|
| `production.wo.start` | `start` skanera | operator |
| `production.consumption.write` | `consume` skanera | operator |
| `production.consumption.override_approve` | zatwierdzający nadmierny rozchód + przełożony rewersji | drugi użytkownik (PIN) |
| `production.consumption.correct` | `reverse-consume` skanera | operator (ZAWSZE) |
| `production.corrections.closed_wo` | rewersja zamkniętego ZP | operator (eskalacja) |
| `quality.inspection.execute` | `inspect` skanera | operator |
| `warehouse.stock.move` | odłożenie / przesunięcie / pobranie | operator |
| `settings.org.update` / `warehouse.grn.receive` / `warehouse.stock.move` / `production.output.write` (JEDNO Z) | `print-label` | operator |

**Ciągi operacji poziomu sesji** (NIE są elementami enum RBAC; oznaczają
`scanner_audit_log.operation` i bramkują trasy odczytu tylko przez *ważność sesji*):
`scanner.receive_po(.list/.detail)`, `warehouse.scanner.lp.lookup`,
`warehouse.scanner.location.lookup`, `warehouse.scanner.putaway(.suggest)`,
`warehouse.scanner.move`, `warehouse.scanner.pick(.wos/.lps)`,
`production.scanner.wos.{list,detail,lps,consumptions,consume,output,waste,
start,reverse_consume}`, `quality.scanner.inspect`, `scanner.{login,logout,
context,bootstrap,change_pin,set_pin,lock_lp,print_label,audit,labor}`.
To są wolne ciągi, nie enum-locked — przyznanie „korzystania ze skanera"
jest domyślne przy posiadaniu ważnej sesji.

**Prymitywy tożsamości i PIN-u** (`packages/auth/src/verify-pin.ts`, reeksportowane
przez `lib/scanner/auth.ts`): `setPin` (haszowanie + rejestracja), `verifyPin`
(uwzględniający blokadę: zwraca `true` / `false` / `'locked'`), `userHasPin`.
`verifySupabaseLoginPassword` uderza w prawdziwy GoTrue (`grant_type=password`) —
używane tylko przy rejestracji PIN-u.

---

## g. Źródła danych (tabele Supabase)

Własne skanera (pierwsza klasa):

- `scanner_sessions` — sesje nośne (`session_token_hash` SHA-256, `org_id`,
  `user_id`, `site_id`/`line_id`/`shift`, `mode`, `expires_at` 12 h, `ended_at`,
  `last_seen_at`).
- `scanner_audit_log` — każde skanowanie + kod wyniku + **klucz idempotencji**
  `(org_id, client_op_id)`; `ext` jsonb w wierszu sukcesu odzwierciedla odpowiedź
  dla wierności odtwarzania.
- `user_pins` — haszowane PIN-y (`setPin`/`verifyPin`; stan blokady).

Produkcja (właściciel 08-production; skaner **zapisuje przez** te same tabele/serwisy):

- `work_orders`, `wo_executions`, `wo_events`, `bom_snapshots` — cykl życia ZP (start).
- `wo_materials` — `consumed_qty` (rozchód zwiększa, rewersja zmniejsza).
- `wo_material_consumption` — księdze rozchodu (UNIQUE `transaction_id`;
  rewersja wstawia negowany storno `correction_of_id`).
- `wo_outputs` — **kanoniczny (08-production)** stół wyjść (skaner tworzy przez
  `registerOutput`).
- `wo_waste_log` — **kanoniczny (08-production)** odpad (kg).
- `wo_labor_log` — E4B rejestracja wejścia/wyjścia.

Magazyn / zapasy (właściciel 05-warehouse):

- `license_plates` — rozchód dekrementuje, odłożenie promuje, pobranie relokuje,
  QC przełącza `qa_status`, rewersja przywraca; `locked_by`/`locked_at` miękka
  blokada (przejęcie po 5 min).
- `v_inventory_available` — widok do rozchodu/pobrania FEFO (`available` + `released`
  minus zarezerwowane, `expiry asc nulls last`).
- `lp_state_history`, `lp_genealogy` — księdze przejść LP + krawędzie rodzic/dziecko.
- `grns`, `grn_items` — przyjęcie (wspólna transakcja; *05/06-purchasing*).
- `stock_moves`, `locations`, `warehouses` — odłożenie/przesunięcie/pobranie + rozwiązanie miejsca docelowego.
- `print_jobs` — wydruki etykiet skanera.

Jakość (właściciel 09-quality):

- `quality_inspections` — decyzja QC skanera (`signature_hash` NULL celowo).
- `quality_holds`, `quality_hold_items` — otwierane przy decyzji QC `hold`.

Konfiguracja / referencje / zarządzanie:

- `tenant_variations.feature_flags` — `scanner_reverse_require_supervisor_pin`
  (poziom przełożonego rewersji), `overconsume_threshold_pct` / `overconsume_warn_pct`
  (poziomy nadmiernego rozchodu), `require_grn_qc_inspection` (QC przy przyjęciu).
- `sites`, `production_lines`, `items`, `waste_categories` — kontekst + listy rozwijane.
- `users`, `user_roles`, `roles`, `role_permissions` — ponowna weryfikacja RBAC + wyszukiwanie zatwierdzającego.
- `audit_events` — `production.consumption.corrected` (rewersja).
- `outbox_events` — `warehouse.material.consumed` (rozchód), `quality.hold.created`
  (wstrzymanie QC), `production.consume.blocked` (wstrzymanie T-064) + zdarzenia
  emitowane przez wspólne serwisy (`production.output.recorded`,
  `production.waste.recorded`, …).
- `app.session_org_contexts` / `app.active_org_contexts` — styk kontekstu organizacji
  skanera (mig 002/031).

---

## h. Znane luki / TODO

Oparte na odczytanym kodzie — bez domysłów:

> **To już nie jest luka — skanowanie aparatem / kodów kreskowych zostało wdrożone.**
> Wcześniejsze przeglądy wymieniały skanowanie aparatem jako niezbudowane (martwy
> przycisk **Aparat** bez efektu / odroczona fala „SCN"). Jest ono teraz
> **zaimplementowane**: `CameraScannerOverlay`
> (`components/shell/camera-scanner-overlay.tsx`) uruchamia prawdziwe ciągłe
> dekodowanie `BrowserMultiFormatReader` z `@zxing/browser` przez `getUserMedia`,
> a przycisk Aparat w `ScanInputArea` jest podłączony
> (`scanner-primitives.tsx:466-478`) do wszystkich sześciu ekranów z polem
> skanowania (*§d(viii)* + uwaga nagłówkowa §d). Zależności `@zxing/browser`
> + `@zxing/library` są w `apps/web/package.json:33-34`. To, co pozostaje dla
> pełnego pokrycia sprzętowego, ma charakter środowiskowy, a nie brakującej
> funkcji: `getUserMedia` tylko przez HTTPS, wymóg gestu użytkownika w iOS Safari
> i obsługa latarki zależna od urządzenia (wszystkie omówione w *§d(viii)*).

1. **Kolejka synchronizacji offline jest zbudowana, ale NIEPODŁĄCZONA.**
   `packages/sync-queue` (IndexedDB `enqueue`/`listPending`/`flusher` + UUID-v7
   `generateTransactionId`, T-043/T-044) oraz zbiorczy endpoint odtwarzania
   `POST /api/scanner/audit` oba istnieją, ale **żaden plik w `apps/web` nie
   importuje `sync-queue`** i **żaden klient nie wywołuje `/api/scanner/audit`**.
   Żywy `scannerFetch` to zwykły `fetch` online przez `sessionStorage`
   (`scanner-session.tsx:116-142`); utrata połączenia po prostu powoduje błąd
   dotknięcia. Idempotencja na poziomie mutacji (`clientOpId` + `scanner_audit_log`)
   jest podłączona, więc bufor offline *można* bezpiecznie dodać — po prostu jeszcze
   nie jest. PWA jest „telefonicznie wyglądająca + świadoma połączenia" (kropka
   `navigator.onLine` w `scanner-frame.tsx:79-120`), a nie zdolna do pracy offline.

2. **Kilka kafelków głównych to „Coming soon".**  `home-screen.tsx:31-56` podłącza
   żywe kafelki do `scanner/wos`, `scanner/pick`, `scanner/receive-po`,
   `scanner/putaway`, `scanner/move`, `scanner/qa`, `scanner/lp`; każdy kafelek
   z `to: null` jest renderowany jako **wyłączony** (żaden nie jest null w bieżącej
   siatce, ale mechanizm jest wyraźny, a kafelki `consume`/`output` obie prowadzą do
   `scanner/wos`, nie do dedykowanego wejścia — rozchód/wyjście osiąga się z wnętrza ZP).

3. **Nie znaleziono service workera / instalowalnego manifestu PWA** w grupie tras
   skanera — „PWA" to ciemna, telefonicznie oprawiona SPA, nie zarejestrowana
   aplikacja serwist/`sw.js` (powtarzająca się klasa błędów live #7 w
   `MON-project-overview`). W połączeniu z luką 1, „działa offline / instaluje się
   na ekranie głównym" ma charakter aspiracyjny.

4. **Odłożenie/przesunięcie/pobranie magazynowe współdzielą jeden ciąg RBAC.**
   Wszystkie trzy ponownie bramkują na `warehouse.stock.move` (trasy `putaway`/`move`/`pick`)
   — nie można przyznać pobrania bez przyznania swobodnych przesunięć; nie istnieje
   `warehouse.lp.pick` / `warehouse.putaway` (ta sama luka odnotowana w
   *05-warehouse.md §f.3*).

5. **Ścieżka inspekcji QC skanera nie ma e-podpisu** zgodnie z celową decyzją
   (`inspect/route.ts:160-165`) — desktopowa inspekcja zbiera `signEvent` CFR-21,
   skaner polega na sesji PIN + wierszu audytu. Odnotowane, aby czytelnik nie
   pomylił nieobecnego `signature_hash` z błędem.

6. **`scanner.receive_po` to ciąg sesji, nie uprawnienie RBAC.** Przyjęcie w skanerze
   jest bramkowane **tylko przez ważność sesji** (`receive-line/route.ts:28`), w
   odróżnieniu od desktopowego zapisu GRN, który jest również świadomy
   `warehouse.grn.receive` — każda ważna sesja skanera może przyjmować. (Odłożenie/
   przesunięcie/pobranie *ponownie sprawdzają* `warehouse.stock.move`;
   przyjęcie tego nie robi.)

7. **Ciąg elementów etykiety GS1 to TODO.** `print-label/route.ts:106-107` wysyła
   ładunek JSON z flagą `gtin_missing`, gdy `buildGs1Element` /
   `packages/gs1/src/build.ts` nie jest podłączony — drukowany „etykieta" to blob
   JSON data-URL, nie prawdziwy ciąg elementów GS1-128.

8. **`apps/worker` teraz istnieje, ale konsument outboxa nadal nie działa end-to-end.**
   Notatka w pamięci „`apps/worker` NIE istnieje" jest **nieaktualna** (pakiet jest
   obecny: `apps/worker/src/{index,registry}.ts`), ale zgodnie z `MON-project-overview`
   żywy dyspozytor dla `warehouse.material.consumed` / `quality.hold.created` /
   `production.*` nadal jest stykiem — zdarzenia skanera utrwalają się w
   `outbox_events` i tam oczekują.

W plikach lib/tras skanera nie znaleziono surowych znaczników `// TODO` poza uwagą
GS1 (luka 7); lista luk wynika w pozostałej części z ograniczeń możliwości
(offline, instalacja PWA, kodowanie etykiet) i dryftu bramkowania sesja-a-RBAC
zaobserwowanego w kodzie.
