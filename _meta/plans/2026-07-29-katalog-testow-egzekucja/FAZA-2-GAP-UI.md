# FAZA 2 — inwentarz GAP: UI / Settings-infra (`UI`) — 32 pozycji

Wygenerowane 2026-07-29. Indeks i metodyka: [`FAZA-2-GAP-INWENTARZ.md`](FAZA-2-GAP-INWENTARZ.md).

`kat:N` = linia w `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md`.
Kolumna **test dziś** pochodzi z klasyfikacji dowodu z 18-19.07 — patrz ostrzeżenie o wieku werdyktu w indeksie.

Rozkład: brak testu 7 · zielony 25 · przeglądarka 18 · persona 6


## Shell / nawigacja globalna

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-001` | **Site-filter — scoping tylko WO/LP/OEE** — Deklarowany kontrakt filtra site (tooltip: "Filters work orders, license plates and OEE only — other screens stay org-wide"). Wybór site zmienia list… *Kroki:* 1) Wybierz konkretny site. 2) Przejdź WO/LP/OEE — dane zawężone. 3) Przejdź Shipping/Quality/Planning — dane org-wide. 4) Odśwież stronę — wybór site persystuje. | kat:8067 · Kontrakt z tooltipa; niespójność (np. inny ekran też filtrowany albo WO nie filtrowane) = bug. | Site selector persisted `Main Factory` after a full navigation; site-switcher component tests passed. Full WO/LP/OEE-versus-org-wide comparison was not completed for every named screen. | zielony | TAK | nie | P1 |
| `UI-002` | **Org-switcher (platform admin) — dostępność i skutki** — Przycisk "Switch organization" widoczny TYLKO dla platform-admina; przełączenie zmienia dane wszystkich ekranów; brak przecieku danych poprzedniego o… | kat:8073 | Platform-admin switcher was visible. Switching Apex 22 → Routing Org B changed dashboard KPIs from non-zero to zero and showed an audited act-as banner; exit restored Apex 22. Non-admin visibility and every screen/cache consumer… | zielony | TAK | tak | P0 |
| `UI-004` | **Dzwonek notyfikacji** — Licznik nieprzeczytanych; otwarcie listy; kliknięcie → nawigacja do encji; oznaczanie przeczytanych (spójne z XC-039). | kat:8081 | Notification menu opened and rendered `No notifications`; 10 notification-bell component assertions passed. No live notification fixture existed to verify count, navigation and mark-read. | zielony | TAK | nie | P1 |
| `UI-006` | **Nawigacja Premium — gating modułów** — Sekcja "Premium" (Technical/NPD/Finance/OEE/Maintenance) — czy jest realny plan-gating (org bez premium nie widzi / dostaje upsell), czy tylko etykie… | kat:8089 | `Premium` section is visible, but the catalog itself leaves plan-gating undefined and no second non-premium org/account contract was available. | brak testu | TAK | nie | P2 |

## Dashboard

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-007` | **KPI dashboardu zgodne ze źródłami** — Active WOs / Pending POs / Low Stock / Quality Holds / Today's Shipments = te same liczby co listy źródłowe z odpowiadającymi filtrami. | kat:8095 | Production dashboard showed all five KPIs and dashboard tests passed; exact equality with every source list/filter was not fully recomputed. | zielony | TAK | nie | P1 |
| `UI-009` | **Quick actions — deep-linki `?new=1`** — "Create Work Order" → work-orders z otwartym modalem create (query-param). Wejście bez uprawnienia → brak modala + komunikat, nie crash. Analogicznie… | kat:8103 | `/planning/work-orders?new=1` opened the `Create work order` modal. Create-PO deep-link and permission-denied persona were not both exercised. | brak testu | TAK | tak | P1 |
| `UI-010` | **Recent activity — wpisy klikalne i bezpieczne** — Feed pokazuje eventy audit (delete WO, TO status, signature). Czy skrócone UUID prowadzą do encji; usunięta encja → graceful (nie 500); brak wpisów i… | kat:8107 | Dashboard/activity unit coverage passed, but deleted-entity navigation and cross-org activity isolation lacked safe live fixtures. | zielony | nie | nie | P2 |

## Planning dashboard (obserwacje)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-013` | **Cancelled WO na 7-dniowej tablicy harmonogramu** — Board pokazuje WO Cancelled na równi z Released — czy anulowane powinny zajmować sloty? Ustalić kontrakt (proponowane: ukryte lub wyszarzone) i zamro… | kat:8121 | Numerous cancelled WOs were rendered on the 7-day board. The catalog explicitly leaves the required hidden-versus-grey contract unresolved. | zielony | TAK | nie | P2 |
| `UI-014` | **Przyciski disabled "Run sequencing" / "Trigger D365 pull"** — Stany disabled — kiedy się odblokowują (uprawnienie? flaga D365? brak linii?). Tooltip z powodem. D365 pull przy flag OFF → disabled zamiast 412 po k… | kat:8125 | Both buttons were disabled and exposed reasons via `title` (`Sequencing optimizer not built yet…`, `Not available yet`). The exact flag/permission unlock matrix remains unproven. | brak testu | TAK | tak | P2 |
| `UI-015` | **PO aging — sumy kubełków** — 0-30/31-60/61-90/90+ — suma pozycji = liczba przeterminowanych PO; wartość = suma wartości; PO opłacone/received znikają. | kat:8129 | Planning dashboard tests passed, but live aging buckets were not independently recomputed from every PO status/value. | zielony | nie | nie | P1 |

## Warehouse landing (obserwacje)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-016` | **KPI "Unique SKUs 0" przy 25 aktywnych LP** — Sprzeczność: 25 aktywnych LP nie może dawać 0 SKU. Prawdopodobnie zepsute źródło licznika (site-scope? join?). Test: liczba distinct produktów w akty… | kat:8135 | Live page now showed 34 active LPs and 8 unique SKUs; warehouse dashboard assertions passed. Distinct SKU count was not independently queried against production data. | zielony | nie | tak | P1 |
| `UI-019` | **Kafle expiry 7d/30d zgodne z dashboardem expiry** — Liczby "Expiring ≤7d: 2 / ≤30d: 10" = liczby na /warehouse/expiry (red/amber); definicja progów spójna z expiry-actions (warn_days org może ≠ 7 — kaf… | kat:8147 | Landing and expiry areas both showed 3 (≤7d) and 14 (≤30d). Tenant-configured warning-day behavior was not changed on production. | brak testu | nie | nie | P1 |

## Finance / Reporting / Multi-site (obserwacje)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-023` | **Reporting — filtry okresów i custom range** — Każdy preset (Today/Week/Month/Quarter/7d/30d/Custom) zmienia zakres WSZYSTKICH 7 kart; custom range waliduje od≤do; nagłówki kart pokazują faktyczny… | kat:8165 | 8 reporting UI tests passed. Live `Today` changed the URL to `?period=today` and five period cards to `2026-07-18 - 2026-07-18`; custom invalid range and all seven card consumers were not fully exercised. | zielony | TAK | nie | P1 |
| `UI-024` | **Reporting — 7× Export CSV** — Każdy eksport zawiera dokładnie dane widoczne (z filtrami), poprawne nagłówki, escaping przecinków/cudzysłowów, format liczb bez utraty precyzji. | kat:8169 | Seven export controls were present and report action/UI tests passed; seven downloaded CSVs were not byte-compared with every visible filtered table. | zielony | TAK | nie | P1 |
| `UI-025` | **Finance WO actual costs — okres + eksport + refresh** — Combobox okresu przelicza agregaty (Scrap/waste cost); Export CSV zgodny z tabelą; Refresh nie duplikuje wierszy. | kat:8173 | No complete period/export/refresh comparison was performed on Finance WO actual costs. | brak testu | nie | nie | P2 |

## Scanner shell (obserwacje)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-028` | **Scanner — wskaźnik ONLINE/sync** — Status "ONLINE" odzwierciedla łączność; przejście offline → komunikat/blokada akcji (lub kolejkowanie — ustalić kontrakt z kodu i zamrozić). | kat:8187 | Live scanner showed `ONLINE` and scanner shell tests passed; an actual offline transition/queue-or-block contract was not induced. | zielony | TAK | nie | P2 |

## Settings — luka pokrycia (~30 ekranów bez testów w sekcji F)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-030` | **Shifts & calendar** — Definicje zmian (start/koniec, nakładanie się, przez północ), kalendarz dni wolnych; wpływ na scheduler capacity i OEE availability. | kat:8197 | Shift action/UI tests passed; overnight/overlap/calendar effects on live scheduler capacity and OEE were not fully proven. | zielony | nie | nie | P1 |
| `UI-031` | **Labor rates** — CRUD stawek per rola; waluta; wpływ na koszt WO i routing-cost-preview (labor = hours×rate); zmiana stawki nie przelicza wstecz zamkniętych WO (koszt… | kat:8201 | Labor-rates page returned 200, but live rate changes and historical WO cost freeze were not executed. | zielony | nie | tak | P0 |
| `UI-032` | **NPD settings: fields, approval requirements, gate checklists, cost parameters** — Konfiguracja pól/gate'ów odzwierciedlona w pipeline (wymagany checklist blokuje gate; approval req wymusza approvera); cost parameters (np. overhead… | kat:8205 | NPD settings pages returned 200 and targeted actions passed; end-to-end propagation through gates/costing was not fully executed. | zielony | nie | nie | P1 |
| `UI-033` | **Units & conversions** — CRUD jednostek i konwersji; usunięcie jednostki w użyciu (items/BOM) zablokowane; konwersja okrężna/cykliczna wykryta; zmiana przelicznika NIE przeli… | kat:8209 | Units action tests passed and page returned 200; production cyclic conversion and in-use deletion/historical immutability were not safely exercised. | zielony | nie | nie | P0 |
| `UI-034` | **Temperature ranges (quality)** — Zakresy temperatur per kategoria; walidacja min<max; użycie w cold-chain breach detection. | kat:8213 | Temperature-ranges page returned 200; live cold-chain breach propagation was not executed. | zielony | nie | nie | P1 |
| `UI-035` | **Partners (Suppliers & customers) + Customer prices** — Wspólny ekran partnerów spójny z Planning/suppliers i Shipping/customers (ta sama encja? duplikacja?); customer prices: tiery, waluta, okresy ważnośc… | kat:8217 | Partner/customer-price UI and action tests passed; full identity reconciliation, overlapping tiers and deterministic selection were not all executed live. | zielony | TAK | nie | P1 |
| `UI-038` | **Label templates + Document numbering** — Edycja szablonu etykiety → print-label używa nowego; document numbering (maski) spójne z XC-035; podgląd maski; zmiana maski nie łamie istniejącej se… | kat:8229 | Label/document screens returned 200 and UI tests passed; changing shared templates/number sequences and proving downstream output was not executed. | zielony | TAK | nie | P1 |
| `UI-040` | **Rules registry / Tenant variations** — Rejestr reguł (np. count_variance_warn_pct w tenant_variations.feature_flags) — edycja wartości zmienia zachowanie (próg wariancji, expiry_warning_da… | kat:8237 | Tenant rule-variant screen returned 200 and rendered its table; no shared production threshold was changed to prove downstream behavior. | zielony | nie | nie | P1 |
| `UI-042` | **Shipping override reasons** — CRUD powodów; użycie w flow override w Shipping; usunięcie powodu w użyciu. | kat:8245 | Override-reasons UI tests passed and page returned 200; in-use deletion and downstream Shipping override were not executed live. | zielony | nie | nie | P2 |
| `UI-043` | **Import / Export (settings)** — Hub importu/eksportu danych referencyjnych — zgodność z XC-029…034; eksport kompletny; reimport eksportu = no-op. | kat:8249 | Import/export UI tests passed and hub returned 200; production export→reimport no-op was not performed. | zielony | nie | nie | P1 |
| `UI-045` | **My account: profile, notifications, E-sign & scanner PIN** — Zmiana profilu; preferencje notyfikacji respektowane przez wysyłki; ustawienie/zmiana PIN (stary PIN wymagany? lockout po zmianie zresetowany); PIN n… | kat:8257 | `/account/profile`, `/account/pin`, `/account/notifications` returned 200 and targeted UI coverage passed; mutation, lockout and plaintext-response checks were incomplete. | zielony | TAK | tak | P1 |
| `UI-046` | **Compliance profile** — Ekran /settings/compliance — pola profilu zgodności; wpływ na moduł Technical/compliance. | kat:8261 | Compliance screen/actions returned/passed, but downstream Technical impact was not fully executed. | zielony | TAK | nie | P2 |

## Przekrojowe UI (z lekcji kampanii)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `UI-048` | **Modal footer clip @720px** — Wszystkie form-modale (create WO/PO/TO, supplier, item…) na viewport 1280×720: stopka z przyciskami widoczna bez scrolla lub modal scrollowalny (regr… | kat:8271 | At 1280×720 the WO create modal opened with visible `Cancel` and `Create work order` footer. The contract requires all named modal families, not only WO. | brak testu | TAK | nie | P1 |
| `UI-049` | **Sesja idle — re-login bez utraty kontekstu** — Po wygaśnięciu sesji (szybki idle na prod) akcja na otwartym ekranie → redirect do logina i powrót na ten sam ekran; niezapisany formularz — ustalić… | kat:8275 | Initial expired session redirected with `reason=idle`; same-screen restoration and unsaved form handling were not deterministically exercised. | brak testu | TAK | nie | P1 |
| `UI-051` | **Paginacja i "Showing X of Y"** — Listy >1 strony: nawigacja stron, licznik zgodny z faktyczną liczbą, filtry resetują stronę do 1. | kat:8283 | Relevant list/component tests passed and live lists rendered pagination/count controls; all multi-page lists and filter-reset behavior were not exhausted. | zielony | TAK | nie | P2 |
| `UI-052` | **PWA /sw.js + manifest** — /sw.js zwraca 200 (regresja C009); instalacja PWA skanera; update SW nie łamie zalogowanej sesji. | kat:8287 | Live `/sw.js` returned 200 JavaScript and `/manifest.webmanifest` returned 200 `application/manifest+json`; install and service-worker update session continuity were not completed. | zielony | nie | nie | P2 |
