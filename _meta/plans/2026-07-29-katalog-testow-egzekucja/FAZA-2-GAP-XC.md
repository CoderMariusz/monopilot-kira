# FAZA 2 — inwentarz GAP: Przekrojowe (`XC`) — 27 pozycji

Wygenerowane 2026-07-29. Indeks i metodyka: [`FAZA-2-GAP-INWENTARZ.md`](FAZA-2-GAP-INWENTARZ.md).

`kat:N` = linia w `_meta/plans/2026-07-18-full-test-catalog/FULL-TEST-CATALOG.md`.
Kolumna **test dziś** pochodzi z klasyfikacji dowodu z 18-19.07 — patrz ostrzeżenie o wieku werdyktu w indeksie.

Rozkład: brak testu 6 · czerwony/pominięty 4 · zielony 16 · zielony+pominięty 1 · przeglądarka 6 · persona 8


## Crony (vercel.json: drift 02:00, catch-weight-variance 02:30, outbox 03:00, reporting-refresh 03:30, pm-schedule-due 06:00; + d365-pull w kodzie)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-001` | **Autoryzacja crona — header x-vercel-cron** — Request z `x-vercel-cron: 1` przechodzi bez Bearer. *Kroki:* 1) Wywołaj `/api/internal/cron/outbox` z headerem platformowym. 2) Sprawdź 200 + wykonanie runOnce(). | kat:7784 · `cronBearerMatches`/header-check w `system-actor-connection.js`; auth OR: header LUB `Authorization: Bearer ${CRON_SECR… | PM/reporting route tests prove `x-vercel-cron` acceptance, but invoking production outbox would consume/dispatch real events; no full outbox `runOnce` production assertion was made. | zielony | nie | tak | P0 |
| `XC-002` | **Autoryzacja crona — fail-closed bez CRON_SECRET na prod** — Gdy CRON_SECRET nieustawiony w produkcji, bearer-auth jest ODRZUCANY (nie fail-open). *Kroki:* 1) Env prod bez CRON_SECRET. 2) Request z dowolnym Bearer. 3) Oczekuj 401. | kat:7790 · Fail-closed; dev-fallback tylko `NODE_ENV==='development' && !VERCEL_ENV`. outbox/route.ts komentarz Auth. | Unauthorized cron tests pass, but the exact production env-without-`CRON_SECRET` bearer matrix is not isolated. | zielony | nie | nie | P0 |
| `XC-004` | **Outbox worker — at-least-once + retry po crashu handlera** — Handler rzucający wyjątek NIE stempluje consumed_at → wiersz zostaje do następnego ticku. *Kroki:* 1) Wstaw event z handlerem rzucającym. 2) Uruchom runOnce(). 3) Sprawdź consumed_at IS NULL. 4) Napraw handler, drugi tick → consumed. | kat:7802 · LocalDispatchQueue publikuje PRZED stemplem; throw abortuje stempel (Slot F-1 fix). outbox/route.ts sekcja Queue. | Queue tests prove handler throw is rethrown and not added to processed, but DB-backed `consumed_at IS NULL` and second tick are skipped. | czerwony/pominięty | nie | nie | P0 |
| `XC-005` | **Outbox — duplikat dostarczenia (publish przed stemplem)** — Crash między publish a update → republikacja; konsument musi dedupować (aggregate_id+event_type+created_at). *Kroki:* 1) Symuluj crash po publish. 2) Drugi tick → handler wywołany 2×. 3) Zweryfikuj, że efekty handlera są idempotentne (np. cascade alergenów UPSERT). | kat:7808 · Kontrakt at-least-once; idempotencja po stronie konsumenta. | At-least-once shape exists, but crash-after-publish plus idempotent downstream side effect was not executed. | czerwony/pominięty | nie | nie | P1 |

## Integracja D365 (lib/integrations/d365, api/settings/d365)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-011` | **Gate D365 — flaga wyłączona → 412 V-TEC-70** — Każdy endpoint D365 (sync, health, dlq, pull cron, push) odmawia gdy `integration.d365.enabled` OFF. *Kroki:* 1) Flaga OFF. 2) POST sync. 3) HTTP 412, kod V-TEC-70. | kat:7842 · `assertD365Enabled` — jedyny guard wszystkich entry-pointów (gate.ts:1-30). | D365 gate files were discovered but all three DB-backed gate assertions were skipped; production flag/config was not changed. | zielony+pominięty | nie | nie | P0 |
| `XC-013` | **D365 push — idempotencja** — Dwukrotny push tego samego rekordu nie tworzy duplikatu (idempotency.ts). | kat:7854 | Idempotency implementation exists, but the D365 push suite was skipped without DB and no external push was attempted. | czerwony/pominięty | nie | nie | P1 |
| `XC-015` | **D365 — anti-corruption (export/import only)** — Gate nigdy nie woła D365 przy sprawdzaniu warunków; awaria D365 nie blokuje lokalnych operacji poza syncem. | kat:7862 · R15; gate czyta tylko lokalną konfigurację. | Two export-only policy assertions pass (inbound cost import blocked, inbound mappings dropped), but the complete local-operation-versus-D365-failure matrix is not executed. | czerwony/pominięty | nie | nie | P1 |

## SCIM 2.0 (api/scim/v2)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-022` | **SCIM ServiceProviderConfig — deklarowane capabilities zgodne z implementacją** —  | kat:7894 | Unauthorized ServiceProviderConfig format is correct; capability payload under a valid SCIM token was not obtained. | brak testu | nie | nie | P2 |

## Platform admin ((platform)/platform, lib/platform)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-024` | **Act-as — wyjście i wygaśnięcie** — Exit → `platform.act_as.exited` (:187-189); po wyjściu brak dostępu do danych orgu; sesja act-as nie przeżywa relogin. | kat:7904 | Exit was executed and live audit shows matching `platform.act_as.exited`; no-access and relogin-expiry portions remain unproven. | brak testu | nie | tak | P0 |
| `XC-027` | **Export orgs — zakres danych** — export-orgs-button generuje zestawienie bez wycieku PII poza uprawnienia platformowe; tylko platform-admin. | kat:7916 | CSV escaping/formula-hardening and download UI tests pass; full PII scope under a non-platform caller was not exercised. | zielony | nie | tak | P1 |
| `XC-028` | **Platform audit page — kompletność** — /platform/audit pokazuje act-as entered/exited + add-admin; filtrowanie; paginacja. | kat:7920 | Live audit showed entered/exited rows; pagination/empty/error unit tests pass. Catalog-required filtering was not observed. | zielony | TAK | tak | P2 |

## Importy CSV (lib/import)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-029` | **Import PO — walidacja wierszy i częściowe odrzucenie** — Plik z 3 dobrymi + 2 złymi wierszami → raport per-wiersz; czy import jest all-or-nothing czy partial (ustalić z po-import-validator.ts i zamrozić tes… | kat:7926 | PO import parser/validation tests pass, but exact 3-good/2-bad production transaction policy was not persisted. | zielony | nie | nie | P1 |
| `XC-030` | **Import PO — duplikaty i konflikt z istniejącymi PO** — Ten sam plik 2× → brak zdublowanych PO (idempotencja lub jasny błąd duplikatu). | kat:7930 | No complete repeated-file idempotency assertion was found/executed. | brak testu | nie | nie | P1 |
| `XC-031` | **Import WO/TO — walidatory** — wo-import-validator/to-import-validator: nieistniejący item, ujemne qty, zła data, nieznany magazyn → odrzucone z komunikatem; TO same-warehouse odrz… | kat:7934 | TO/WO validator and UI tests pass representative cases; full bad-item/qty/date/warehouse matrix is incomplete. | zielony | TAK | nie | P1 |
| `XC-032` | **Import items CSV — encoding i format** — parse-items-csv: UTF-8 BOM, przecinki w cudzysłowach, puste linie końcowe; separator; liczby z przecinkiem dziesiętnym (locale PL!). | kat:7938 | No focused complete UTF-8-BOM/quoted-comma/trailing-blank/PL-decimal assertion was found for items CSV. | brak testu | TAK | nie | P2 |
| `XC-033` | **Import — i18n staging** — import-i18n-staging.ts — tłumaczenia trafiają do stagingu, nie bezpośrednio na produkcyjne etykiety; zatwierdzenie przenosi. | kat:7942 | Locale staging files exist, but staging→approval→production transfer was not executed. | brak testu | TAK | nie | P2 |
| `XC-034` | **Import — RBAC** — Akcje importu wymagają uprawnień modułu docelowego (PO→procurement, WO→planning); user read-only nie zaimportuje. | kat:7946 | Import UI/actions have permission coverage, but the complete module-by-module read-only denial matrix is not fresh/live. | zielony | nie | tak | P0 |

## Dokumenty i numeracja (lib/documents)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-035` | **Numeracja dokumentów — sekwencja bez dziur i duplikatów przy współbieżności** — numbering.ts + code-mask.ts: 2 równoległe generacje → 2 różne kolejne numery (lock/advisory); maska (prefix/data/sekwencja) zgodna z konfiguracją. | kat:7952 | Numbering tests prove atomic SQL increment shape and mask formatting, but no real two-transaction concurrency proof ran. | zielony | nie | nie | P0 |
| `XC-036` | **Delivery note — kompletność danych** — delivery-note-document.ts: pozycje = pozycje shipmentu, adres klienta, nagłówek firmy (company-header.ts), SSCC; wygenerowany dokument dla partial sh… | kat:7956 | Delivery-note address/stable-number/site-scope tests pass; partial shipment line-only + SSCC completeness is not fully asserted. | zielony | nie | tak | P1 |
| `XC-038` | **Code-mask — walidacja maski użytkownika** — Nieprawidłowa maska (nieznany token) → błąd przy zapisie konfiguracji, nie w momencie generacji dokumentu. | kat:7964 | Code-mask tests pass, but invalid token rejection specifically at configuration save (not generation) is not fully wired in one assertion. | zielony | nie | nie | P2 |

## Notyfikacje (lib/notifications)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-039` | **Unread count — poprawność i skoping** — get-unread-notification-count: liczy tylko nieprzeczytane danego usera+org; przeczytanie zmniejsza; cross-org nie przecieka. | kat:7970 | Bell component tests prove unread badge, single mark-read and mark-all; real user+org cross-scope DB count was not run. | zielony | nie | tak | P1 |
| `XC-040` | **Bell labels — typy notyfikacji** — build-notification-bell-labels mapuje wszystkie notification-types (brak "unknown" dla realnych eventów: hold, CCP breach, invite, MWO due...). | kat:7974 | Notification UI tests pass, but no exhaustive registry assertion proves every real event avoids an `unknown` label. | zielony | nie | nie | P2 |

## Korekty ledgera (lib/corrections)

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-041` | **Correct-ledger-entry — storno i wpis korygujący** — Korekta wpisu → oryginał nietknięty (append-only), powstaje storno + nowy wpis; WAC przeliczony; suma ledgera = stan po korekcie. | kat:7980 · correct-ledger-entry.ts + material-scope.ts (zakres materiałowy korekty). | Correction framework exists, but append-only storno + replacement + WAC + ledger sum was not executed against DB. | brak testu | nie | tak | P0 |

## Feature flags / telemetria

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-044` | **PostHog flags endpoint** — api/posthog/flags — nie wycieka flag innych orgów; działa bez PostHog env (graceful). | kat:7995 | Tests prove org group passed to PostHog, auth, cache and typed 502 behavior. Production returned typed 502; cross-org cache isolation and absent-env fallback remain incomplete. | zielony | nie | nie | P2 |
| `XC-045` | **Internal upgrade endpoint** — api/internal/upgrade — auth (jak crony), skutki idempotentne. | kat:7999 | Upgrade action tests pass; the catalog-named `/api/internal/upgrade` GET is not a route, and production POST resolved to HTML rather than an independently verified authenticated API effect. | zielony | nie | nie | P1 |

## i18n / locale

| ID | kontrakt (dosłownie z katalogu) | anchor | czego zabrakło 18-19.07 | test dziś | przegl. | persona | prio |
|---|---|---|---|---|---|---|---|
| `XC-046` | **Routing locale — en/pl parity** — Każdy ekran działa pod /en i /pl; brak twardych linków bez locale (redirect); przełączenie zachowuje bieżącą stronę. | kat:8005 | Locale routing/component tests pass representative routes; “every screen” EN/PL parity was not exhaustively browser-walked. | zielony | TAK | nie | P1 |
| `XC-048` | **Formaty liczb/dat per locale** — Ilości/kwoty/daty formatowane per locale, ale INPUTY przyjmują format zgodny z parserem serwera (kropka dziesiętna — parser core odrzuca przecinek; t… | kat:8013 | Locale number/date tests pass, but the exact Polish `1,5` live form/server rejection was not executed across the named inputs. | zielony | TAK | nie | P1 |
