# E2E na żywej produkcji — Fala 12 + regresja końcowa kampanii

**Data:** 2026-07-29 (sesja 02:41–03:14 UTC)
**Wdrożenie:** `dpl_HRLD7SGrdWecxyHsbJAATUnQqsF8`, commit `6bd4ad17`, gałąź `main`, target `production`
**Stan wdrożenia w chwili startu testów:** READY (osiągnięty 03:43:26 czasu lokalnego / 02:43 UTC — odczekano)
**Migracja 542:** zastosowana — kolumny `equipment.deactivated_at / deactivated_by / deactivation_reason` obecne na produkcji,
constraint `equipment_deactivation_reason_present` istnieje (NOT VALID, zgodnie z migracją)
**Organizacja:** Apex 22 (`00000000-0000-0000-0000-000000000002`), zakład: Main Factory
**Konto:** `admin@monopilot.test` (rola Admin — posiada `mnt.asset.deactivate`)
**Znaczniki danych testowych:** `REGR-FINAL-*`

Wszystkie zapisy wykonane **wyłącznie przez interfejs**. Baza używana tylko do `SELECT`.
Czasy w tabelach = UTC (baza); interfejs pokazuje czas lokalny BST (+1 h).

---

## SEKCJA A — weryfikacja Fali 12

| punkt | status | twardy dowód |
|---|---|---|
| **A1 · korekta aktywu** | ✅ ZALICZONE | Aktyw `REGR-FINAL-A1` (id `fffafe46-fdb5-42fe-9365-54b31aaeecc7`) utworzony przez UI o 02:44:42. Po edycji przez modal: `name` = `Regression Final A1 Mixer CORRECTED`, `requires_loto` = `t`, `updated_at` = 02:45:25 > `created_at` = 02:44:42. Zmieniona nazwa propaguje się do innych ekranów — pojawia się w selektorze maszyn przy tworzeniu MWO jako `REGR-FINAL-A1 · Regression Final A1 Mixer CORRECTED`. |
| **A1 · powód wycofania wymagany** | ✅ ZALICZONE | Submit „Withdraw from service" z pustym powodem → komunikat na ekranie: *„A withdrawal reason of at least 3 characters is required."*, a w bazie `active` nadal `t`, `deactivated_at` NULL. Zero zapisu. |
| **A1 · wycofanie ≠ kasowanie** | ✅ ZALICZONE | Po wycofaniu wiersz **nadal istnieje**: `active=f`, `deactivated_at=2026-07-29 02:46:58.754531+00`, `deactivated_by` → `admin@monopilot.test`, `deactivation_reason='Final regression 2026-07-29: withdrawn from service (scrapped after audit)'`. Na liście aktywów widoczny ze statusem `Inactive`. |
| **A1 · znika z wyboru maszyny czynnej** | ✅ ZALICZONE | Selektor `mwo-create-equipment` (modal „+ New MWO"): **przed** wycofaniem lista 13 pozycji zawierała `REGR-FINAL-A1 · Regression Final A1 Mixer CORRECTED`; **po** wycofaniu lista ma 12 pozycji, `hasREGR=false`. Oba warunki (wiersz zostaje / znika z wyboru) spełnione jednocześnie. |
| **A2 · bramka uprawnień na reaktywacji** | ⚠️ DOWÓD STATYCZNY, NIE BEHAWIORALNY | Konto testowe **ma** `mnt.asset.deactivate` (potwierdzone zapytaniem do `role_permissions`: rola Admin → `mnt.asset.deactivate`, `mnt.asset.edit`, `mnt.asset.read`, …), więc odmowy nie da się wywołać przez UI. Sprawdzenie po stronie serwera istnieje: `apps/web/app/[locale]/(app)/(modules)/maintenance/assets/_actions/asset-actions.ts:313` — `if (!(await hasMntPermission(ctx, MNT_DEACTIVATE_PERMISSION))) return { ok: false, reason: 'forbidden' }` w `reactivateEquipment`, ten sam stały `MNT_DEACTIVATE_PERMISSION = 'mnt.asset.deactivate'` co w `deactivateEquipment`. **Nie udowodnione behawioralnie.** |
| **A2 · ślad wycofania przeżywa reaktywację** | ✅ ZALICZONE | Po kliknięciu „Return to service": `active=t`, ale `deactivated_at=2026-07-29 02:46:58.754531+00`, `deactivated_by=admin@monopilot.test`, `deactivation_reason` — **wszystkie trzy nadal w bazie**, niewyzerowane. Kod potwierdza: `reactivateEquipment` ustawia wyłącznie `active=true, updated_by, updated_at` — nie dotyka kolumn wycofania. |
| **A2 · wycofanie NIE jest awarią** | ✅ ZALICZONE | Jedyny wpis w `maintenance_history` dla tego aktywu: `event_type='cancellation'`, `summary='Asset withdrawn: …'`. Typ awarii w tym słowniku to `breakdown` (`packages/db/schema/maintenance.ts:651`: `completion\|cancellation\|calibration\|sanitation\|breakdown`). Wskaźniki niezawodności nie są fałszowane. |
| **A3 · cykliczność przeglądów prewencyjnych** | ❌ **NIEZALICZONE — ŻYWA AWARIA** | Modal „Create Schedule" otwiera się i ma komplet pól cykliczności (maszyna, typ, interwał, dni ostrzeżenia, pierwszy termin). Po kliknięciu Submit: **`TypeError: Cannot read properties of undefined (reading 'id')`** w konsoli i **cały ekran Utrzymania ruchu wpada w error boundary** („Something went wrong / An unexpected error occurred while loading this screen"). W bazie **zero** wierszy: `select count(*) from public.maintenance_schedules` = **0 w CAŁEJ bazie, dla wszystkich organizacji**. Ścieżka tworzenia harmonogramu nigdy nie zadziałała. |
| **A3 · przyczyna źródłowa** | — | `apps/web/app/[locale]/(app)/(modules)/maintenance/_components/pm-schedule-form-modal.tsx:110` — obiekt `updatePayload` z polem `scheduleId: schedule!.id` jest budowany **bezwarunkowo**, przed rozgałęzieniem `mode === 'create' ? createPmScheduleAction(...) : updatePmScheduleAction(updatePayload)`. W trybie `create` prop `schedule` jest `undefined`, więc `schedule!.id` rzuca wyjątek **zanim akcja serwera zostanie w ogóle wywołana**. Operator `!` uciszył typecheck, dlatego bramka CI tego nie złapała. Naprawa: przenieść budowę `updatePayload` do gałęzi `edit`. |
| **A3 · generator cykliczny** | ℹ️ NIE DA SIĘ POTWIERDZIĆ | Cron `/api/internal/cron/pm-schedule-due` (`apps/web/vercel.json`, harmonogram `0 6 * * *`) istnieje, ale **nie ma z czego generować** — brak jakichkolwiek harmonogramów PM w bazie (patrz wyżej). Nie odpali się w czasie sesji i nawet gdyby odpalił, nie wyprodukowałby zlecenia. |
| **A3 · tekst na ekranie zaprzecza funkcji** | ❌ NIEZALICZONE (osobne znalezisko) | Zakładka „PM schedules" nadal głosi: *„Preventive maintenance schedules (read-only list)"* oraz *„No PM schedules yet. The PM engine and schedule editor arrive in a later slice."* — obok w pełni widocznego przycisku „Create Schedule". Przyczyna: commit `6bd4ad17` **nie zaktualizował** bundla `_meta/i18n-staging/maintenance-mwo.json`; w wersji zacommitowanej blok `en.pm` wciąż zawiera stare `subtitle` i `empty`, a nowych kluczy (`createSchedule`, `editSchedule`, `form.*`, `colActions`) tam **nie ma**. Resolver `maintenance-labels.ts` schodzi na fallback „humanized last key segment", stąd na ekranie surowe „Create Title", „Interval Value (Interval Unit)", „Submit". |
| **A4 · interfejs nie obiecuje pobierania z D365** | ✅ ZALICZONE | `/en/settings/integrations/d365` — cytaty z ekranu: *„Export queue batch size, retry policy, and worker scheduling are configured on the D365 sync config page. This screen does not store cron schedules; **inbound pull from D365 is not supported (R15)**."* oraz przy przełączniku: *„Enables Monopilot → D365 export when pre-flight passes. **Inbound import from D365 is not supported (R15)**."* Na `/…/d365/sync`: *„R15 export-only: Monopilot → D365 only. **Inbound pull/import from D365 is not supported or configurable here.**"* Nawigacja Ustawień nazywa pozycję wprost „D365 cost (export-only)". Żadna kontrolka nie obiecuje importu. |
| **A4 · wyłączone kontrolki mają uzasadnienie** | ✅ ZALICZONE | Na ekranie połączenia formularz renderuje się jako `aria-disabled="true"` z czerwonym `role="alert"`: *„D365 connection prerequisites are missing. Configure the endpoint, Azure AD tenant, client ID, and secret reference before saving or enabling sync."* Wyłączone: Save configuration, Base URL, Environment, Tenant ID, Client ID, Client Secret, Rotate secret, Service account email. Powód podany na ekranie. |
| **A4 · zapis ustawień eksportu działa** | ✅ ZALICZONE | Zmiana Batch size 50→**75** i Max attempts 3→**4**, „Save sync config". W bazie `public.integration_settings` (org Apex 22, `category='d365_sync'`): `{"pull_cron": "0 2 * * *", "batch_size": 75, "max_attempts": 4, "applied_by_user": "Admin", "last_applied_at": "2026-07-29T02:54:26.057Z", "push_queue_enabled": false, "retry_backoff_minutes": 15}`, `updated_at=2026-07-29 02:54:25.88+00`. Po przeładowaniu ekran pokazuje „Last applied Jul 29, 2026, 2:54 AM · Applied by Admin" i wartości 75 / 4. **Regresja z ukrytym polem nie wróciła** — na ekranie nie ma żadnego pola `hidden`, a `pull_cron` jest zachowywany w JSON bez wystawiania martwej kontrolki cron. |

---

## SEKCJA B — regresja końcowa całej kampanii (12 fal)

| punkt | status | twardy dowód |
|---|---|---|
| **1. `/en/production`** | ✅ ZALICZONE | Ekran renderuje treść, brak stanu błędu. KPI „WOS IN PROGRESS **3 / 3**" zgadza się z bazą: `select status, count(*) … where site_id = Main Factory` → `IN_PROGRESS = 3` (`E2E-A-HOLD-CONSUME`, `E2E-A-N1-DISPLAY`, `E2E-A-S8-TIMESTAMPS`). Pozostałe KPI: OPEN DOWNTIME 0, OVER-PRODUCED WOS 0, OUTPUT TODAY 0 kg. Naprawa Z10-01 trzyma. Uwaga bez wpływu na poprawność: tabela pod KPI to widok ograniczony do 25 wierszy z 40 istniejących w zakładzie i przy obecnym sortowaniu żaden z 3 wierszy „w toku" się w niej nie mieści — KPI jest poprawne, ale użytkownik nie dojdzie z niego do tych zleceń jednym kliknięciem. |
| **2. MRP — „Save this run"** | ✅ ZALICZONE | `mrp-persist-toggle` zaznaczony → „Run MRP". Nowy wiersz w `public.mrp_runs`: `MRP-20260729-25A199F3`, `status=completed`, `started_at=2026-07-29 02:56:46.966+00`, `requirement_count=11`, `exception_count=7`, `site = Main Factory`. Historia „Previous runs" na ekranie pokazuje go na szczycie przy wybranym zakładzie, obok starszych przebiegów. |
| **3. Prognozy i progi zapasu — pusty zakład widoczny** | ✅ ZALICZONE | Przy filtrze zakładu **Main Factory** siatka prognoz pokazuje **dwa** wiersze tego samego produktu: jeden z wartością `77.5` w tygodniu 2026-W31 (to wiersz Main Factory) i drugi z wartością `12.345` w tygodniu 2026-W40 — a ten drugi ma w bazie `site_id = NULL`. Wiersz z pustym zakładem **nie jest ukrywany**. Progi zapasu: jedyny wiersz `RM-R09-144638` ma `site_id = NULL` i jest widoczny, oznaczony w kolumnie SITE jako „All sites". Twarda bramka Fali 9 trzyma. |
| **4. Zamówienia zakupu + przyjęcie, precyzja 6 miejsc** | ✅ ZALICZONE | Lista PO: 16 wierszy, brak stanu błędu. Przyjęcie linii PO `PO-R09-144638` na ilość **`1.234567`** kg z batchem `REGR-FINAL-B4`. W bazie `public.grn_items`: `received_qty = 1.234567`, `ordered_qty = 12.375000`, `supplier_batch_number = REGR-FINAL-B4`, GRN `GRN-20260729-0001` o 02:59:57. Precyzja 6 miejsc przyjęta i zachowana bez zaokrąglenia. |
| **5. Nośniki (LP) — szczegóły, druk etykiety** | ✅ ZALICZONE | Utworzony przyjęciem LP `LP-1785293997614-0Y4S` — ekran szczegółów renderuje `1.234567 kg` (ilość, dostępne), batch, lokalizację RECV, magazyn WH1, źródło `grn`, siedem zakładek. Zakładka Labels → „Print label" → 1 kopia, drukarka „E2E-FAL78 ZPL Printer" → w `public.print_jobs` wiersz `669e3c51-b356-48a9-b126-03f38bce9de8`, `status=queued`, `entity_type=lp`, `entity_id=6cdb2f82-469c-4bcc-aedc-b8aabd6ca76c` (nasz LP), `created_at=03:01:28`. |
| **6. Lokalizacje — dezaktywacja** | ✅ ZALICZONE W OBIE STRONY | **Z zapasem — odmawia:** `RECV` (26 żywych LP), odznaczenie „Is active" + Save → błąd na ekranie: *„This location still holds 26 live license plate(s). Move or consume that stock first — an inactive location cannot be scanned as a move target."*, w bazie `is_active` nadal `t`. **Pusta — działa:** `OUT` (0 LP), ta sama ścieżka → w bazie `is_active = f`. |
| **7. Transfery — lista i szczegóły** | ✅ ZALICZONE | Lista: 4 wiersze (`SOL-R10-…-TO`, `NIGHT-R10-TO-174328`, `CODEX-R15-TO-20260714`, `TO-202607-0005`), zakładki statusów spójne. Szczegóły `NIGHT-R10-TO-174328`: 2 linie, stan Received, linia 1 z paletą docelową `LP-1784311327233-1IIY`, ilości `6.125000` i `3.875000` kg, ślad audytowy. Brak stanu błędu. |
| **8. Zlecenia produkcyjne — czas anulowanego nie rośnie** | ✅ ZALICZONE | Lista: 31 zleceń, filtry statusów zgodne (3 w toku, 2 ukończone, 26 anulowanych). Szczegóły anulowanego `WO-202607-0036-W1` (start rzeczywisty `2026-07-18 06:24`, czyli **11 dni temu**) pokazują **„Elapsed 9 min"**. Po ponownym załadowaniu z innym query stringiem: nadal **„Elapsed 9 min"**. Gdyby licznik nie był zamrożony, pokazałby ~15 800 min. |
| **9. Jakość — kontrole i NCR** | ✅ ZALICZONE | `/quality`: kafelki KPI (3 wstrzymania, 1 otwarty NCR, 63% zdawalność, 0 odchyleń CCP). `/quality/inspections`: 7 wierszy, KPI 7/5/71%. `/quality/ncrs`: 4 wiersze po rozwinięciu grupy — `NCR-00001007` (Open, powiązany hold `HLD-00001029`), `…006`, `…005`, `…004` (Closed). Brak stanu błędu na żadnym z trzech ekranów. |
| **10. Wysyłki — SO, wysyłki, alergeny klienta** | ✅ ZALICZONE | Sales orders: 10 wierszy z kwotami i statusami. Shipments: 4 wysyłki (`SH-2026-00011..13`). Customers: 4 klientów, KPI 4/4/0/3. **Realna akcja:** dodano ograniczenie alergenowe klientowi `CODEX-R12-…` — w bazie `public.customer_allergen_restrictions` wiersz `50317c25-7939-4988-aed1-30f4604de9aa`, `restriction_type='refuses'`, `notes='REGR-FINAL-B10 regression check 2026-07-29'`, `created_at=03:08:56`. |
| **11. Utrzymanie ruchu — aktywa** | ✅ ZALICZONE | Pełny cykl korekta → wycofanie → reaktywacja udowodniony w Sekcji A. |
| **11. Utrzymanie ruchu — przeglądy** | ❌ **NIEZALICZONE** | Patrz A3: tworzenie harmonogramu PM wywraca ekran, 0 harmonogramów w bazie. |
| **11. Utrzymanie ruchu — kalibracja** | 🔒 ZABLOKOWANE PRZEZ BRAMKĘ | Rejestr kalibracji renderuje 3 przyrządy z zakresami, wynikami i terminami. Modal „Record calibration" otwiera się, przyrząd wybieralny, ale przycisk „Save record" jest **wyłączony** — brak drugiego uprawnionego użytkownika do podpisu. Kod: `record-calibration-modal.tsx:245` — `reviewers.length === 0` renderuje komunikat zamiast selektora recenzenta. To poprawnie działająca bramka dwuosobowego podpisu, nie usterka; w tej organizacji istnieje tylko jedno konto zdolne podpisać. |

### Błędy konsoli przeglądarki — wszystkie ekrany

| błąd | gdzie | ocena |
|---|---|---|
| `TypeError: Cannot read properties of undefined (reading 'id')` + `[app/error] uncaught render error` | `/en/maintenance`, zakładka PM schedules, po Submit | **Blokujące.** Opisane w A3, przyczyna źródłowa wskazana. |
| `Minified React error #418` (niezgodność hydratacji tekstu), 6 wystąpień | m.in. szczegóły transferu | Ostrzeżenie hydratacji, najpewniej formatowanie dat/stref. Nie przerywa działania, żaden ekran nie wpadł przez nie w stan błędu. Do posprzątania, nie pilne. |
| `404 /favicon.ico` | globalnie | Kosmetyka. |
| `500 /en/settings/units` (3×), `500 /en/pipeline/…/brief`, `404 /en/settings/printers` | dziennik konsoli sprzed tego wdrożenia | **Nie z tej sesji.** Zweryfikowano ponownie na bieżącym wdrożeniu: `/en/settings/units` renderuje pełną treść (Mass/Volume/Count/Length + konwersje własne) bez stanu błędu. `/en/settings/printers` to zgadnięty ręcznie adres — prawdziwy odsyłacz w nawigacji prowadzi do `/settings/infra/printers` (`apps/web/lib/navigation/settings-nav.ts:43`), więc nie jest to zepsuty link. |

**Żadna z 11 pozycji regresji nie wykazała cofnięcia wcześniejszej naprawy przez którąś z późniejszych fal.**

---

## SEKCJA C — pozostałości po audycie i rezydua danych testowych

### C.1 Artefakty wskazane w zleceniu

| punkt | status | twardy dowód |
|---|---|---|
| **Aktyw `NIGHT-R20`** | ⚠️ WYMAGA UWAGI OWNERA | `public.equipment`: `equipment_code='NIGHT-R20-20260718T102013Z-AST'`, id `2ada0d6b-80b0-4327-a9f7-41094abd97ae`, `active='t'`, `deactivated_at` NULL, `requires_loto='t'`, `requires_calibration='t'`, utworzony 2026-07-18 10:23:09. Jest **czynny**, więc występuje jako pełnoprawna maszyna w każdym selektorze (potwierdzone: lista `mwo-create-equipment` oraz lista maszyn w modalu harmonogramu PM). Ma też bliźniaczy przyrząd kalibracyjny `NIGHT-R20-20260718T102013Z-CAL` — `Never` kalibrowany, `Next due` nieustawiony. **Nie usunięto.** |
| **`MWO-2026-00003`** | ⚠️ WYMAGA UWAGI OWNERA — NAJPILNIEJSZE | `public.maintenance_work_orders`: id `e5bbbb9b-dd5e-4abe-a629-33759c948e06`, `state='in_progress'`, `type='reactive'`, `started_at=2026-07-18 06:24:34+00` — **wisi w toku od 11 dni**. Powiązany wpis LOTO (`public.mwo_loto_checklists`, id `1f3d121f-…`): `verified_at=2026-07-18 10:27:35+00`, **`released_at` = NULL** → blokada LOTO **nadal założona** na czynnej maszynie. Dodatkowo `energy_sources_isolated = []` i `tags_applied = []` — czyli „zerowa energia" została potwierdzona bez wskazania ani jednego źródła energii i bez ani jednej kłódki. To zapis audytowy, nie prawdziwy lockout, ale w systemie wygląda jak realna, otwarta blokada bezpieczeństwa. **Nie usunięto.** |

**Rekomendacja dla ownera:** zamknąć `MWO-2026-00003` (przyciski „Complete" / „Cancel" są dostępne wprost na liście zleceń — do zrobienia przez interfejs), co powinno zdjąć blokadę LOTO, a następnie wycofać aktyw `NIGHT-R20-…-AST` z eksploatacji ścieżką zweryfikowaną w A1 (zostanie ze śladem, zniknie z selektorów). Przyrząd `NIGHT-R20-…-CAL` do dezaktywacji w rejestrze kalibracji.

### C.2 Rezydua danych testowych z tej nocy

Pozostawione przez **moją** sesję (znacznik `REGR-FINAL-*`):

| co | identyfikator | czas UTC | usuwalne przez interfejs? |
|---|---|---|---|
| Aktyw utrzymania ruchu | `REGR-FINAL-A1` (`fffafe46-…`), obecnie **czynny** po reaktywacji | 02:44 | Tak — wycofanie z eksploatacji przez modal edycji (skasowanie nie jest przewidziane z założenia). |
| Wpis historii utrzymania | `maintenance_history`, `event_type='cancellation'`, „Asset withdrawn: Final regression…" | 02:46 | Nie — ślad audytowy, celowo nieusuwalny. |
| Konfiguracja D365 sync | `integration_settings` org Apex 22, `batch_size=75`, `max_attempts=4` | 02:54 | Tak — przywrócić 50 / 3 na ekranie D365 sync config. |
| Przebieg MRP | `MRP-20260729-25A199F3` | 02:56 | Nie widziałem akcji usuwania przebiegu — historia jest tylko do odczytu. |
| Przyjęcie PO + GRN + LP | `GRN-20260729-0001`, `LP-1785293997614-0Y4S` (1.234567 kg, batch `REGR-FINAL-B4`), linia PO `PO-R09-144638` przesunięta o 1.234567 kg | 02:59 | Częściowo — LP ma akcje Block / Destroy-scrap; przyjęcia GRN nie da się cofnąć poza „Reverse receipt" na poziomie linii. |
| Zadanie druku | `print_jobs` `669e3c51-…`, status `queued` | 03:01 | Nie — kolejka worker-owned. Zostanie w stanie `queued`, bo nie ma podpiętej fizycznej drukarki. |
| Dezaktywacja lokalizacji | `OUT` / `out01` (magazyn WH01, zakład tester1), `is_active` `t`→`f`, 0 LP | 03:04 | Tak — ponowne zaznaczenie „Is active" w Ustawienia → Lokalizacje. |
| Ograniczenie alergenowe klienta | `customer_allergen_restrictions` `50317c25-…`, klient `CODEX-R12-…`, `refuses` Celery, notatka `REGR-FINAL-B10` | 03:08 | Tak — tabela ma `deleted_at`, zakładka „Allergen restrictions" na karcie klienta. |

Rezydua z **wcześniejszych weryfikacji tej samej nocy** (nie moje, znalezione w bazie):

| co | identyfikator | czas UTC |
|---|---|---|
| Przebiegi MRP | `MRP-20260729-266438D9`, `MRP-20260729-97CB4D75` | 02:38, 01:15 |
| Prognozy popytu | 2 wiersze `FG-R09-144638` (zakład makery 0.000, Main Factory 77.500) | 00:36, 00:37 |
| Próg zapasu | `RM-R09-144638` (`site_id` NULL) — zmodyfikowany | 01:18 |
| Zlecenie transferu | `TO-202607-0005`, stan `received` | 00:46 |
| Przyjęcie GRN + LP | `GRN-20260728-0001` (0.000600 kg), LP `…ZMX3` | 2026-07-28 23:47 |
| Nośniki LP | `…BRZR` (0.123), `…27R4` (0.001), `…679T` (1.000) | 23:45 – 00:47 |
| Zadania druku | `c1eb3bd5` (sent), `d24795a5` (queued), `b31a7880` (sent) | 23:58 – 00:02 |
| Przestoje | 2 zdarzenia, `duration_min` 2 i 0, oba zamknięte (`ended_at` ustawione) | 01:23, 01:25 |
| NCR + wstrzymanie | `NCR-00001007` (Open, „Failed inspection INSP-00000012") + `HLD-00001029` | 02:22 |
| Ograniczenie alergenowe | notatka „E2E-FALA11-2d canonical allergen probe" | 02:36 |

Poza tym w bazie siedzą starsze artefakty audytowe z poprzednich nocy o prefiksach `E2E-A-*`, `NIGHT-R*`, `SOL-R*`, `CODEX-R*` — m.in. 3 zlecenia produkcyjne `E2E-A-*` trwale w stanie IN_PROGRESS, klienci, dostawcy i przyrządy z takimi prefiksami. Nie były przedmiotem tego zlecenia i ich nie ruszałem.

---

## Konkluzja

Po dwunastu falach aplikacja jest **zdatna do użytku** — wszystkie jedenaście punktów regresji przeszło, żadna późniejsza fala nie cofnęła wcześniejszej naprawy, a trzy z czterech celów Fali 12 (korekta i wycofanie aktywu ze śladem audytowym przeżywającym reaktywację, oraz eksport-only D365 z działającym zapisem) są udowodnione twardym stanem w bazie; w pierwszej kolejności uwagi ownera wymaga **niedziałające tworzenie harmonogramów przeglądów prewencyjnych** (`pm-schedule-form-modal.tsx:110` — `schedule!.id` wykonywane w trybie `create`, wywraca cały ekran Utrzymania ruchu i pozostawia 0 harmonogramów w bazie, przez co cel PF-R20-03 nie został dostarczony na produkcję), a zaraz po nim **otwarta od 11 dni blokada LOTO na `MWO-2026-00003`** wisząca na czynnej maszynie `NIGHT-R20`.
