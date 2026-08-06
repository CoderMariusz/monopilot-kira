# D2 — Co nas chroni, a co tylko udaje

Audyt bramek, 2026-08-06. Metoda: **bramka liczy się dopiero wtedy, gdy zobaczyłem ją czerwoną.**
Każda pozycja w tabeli „bramki żywe" ma odtwarzalny dowód: wstawione naruszenie → odmowa →
cofnięcie → czysty `git status`. Bramki ocenione wyłącznie z kodu są oznaczone
**NIEPRZETESTOWANA** i nie liczą się jako zabezpieczenie.

Baza użyta do dowodów: **`monopilot_d2`** — własny klon `monopilot` utworzony na tę sesję
(517 migracji, max `562-fg-npd-ext-finite-numerics.sql`). Nie dotykałem baz zajętych przez
inne tory ani produkcji.

Stan drzewa po wszystkich sondach: **czysty** — każdy plik, który tknąłem, pokazany niżej
z pustym `git status`.

---

## 1. Bramki ŻYWE — z dowodem zaczerwienienia

| # | bramka | gdzie | jak ją zaczerwieniłem | wynik | kontrola przeciwna |
|---|---|---|---|---|---|
| Ż1 | `'use server'` może eksportować tylko funkcje async | `scripts/lint-use-server-exports.mjs` | nowy plik `apps/web/lib/__d2_probe_use_server.ts` z `export const D2_PROBE_LIMIT = 100` | **exit 1**, `…:3 export const (D2_PROBE_LIMIT)` | po usunięciu pliku: `No illegal exports in 397 'use server' modules.`, exit 0 |
| Ż2 | ta sama reguła jako reguła ESLint | `apps/web/eslint.config.mjs:87-146 (definicja), :302 (severity `error`)` (`monopilot/no-export-type-in-use-server`, severity **error**) | — | patrz Ż1/Ż8 | — |
| Ż3 | zakaz importu `getOwnerPool` poza `lib/{auth,scim,platform}` | `apps/web/eslint.config.mjs:224-231` | plik sondy `apps/web/components/__d2_probe.ts` z tym importem | **eslint exit 1**: `getOwnerPool is owner-pool/BYPASSRLS — only apps/web/lib/auth, apps/web/lib/scim, and apps/web/lib/platform may import it` | po usunięciu pliku `git status` pusty |
| Ż4 | zakaz literałów `Reference.*` (dryf nazw tabel) | `apps/web/eslint.config.mjs:189-193` | ta sama sonda, `const x = 'Reference.Warehouses'` | **eslint exit 1**: `Do not hardcode Reference.* table-name strings` | jak wyżej |
| Ż5 | izolacja organizacji w `hasPermission` / `hasAnyPermission` | test: `apps/web/lib/auth/__tests__/has-permission.pg.test.ts`; kod: `apps/web/lib/auth/has-permission.ts:25,50` | podmieniłem `and ur.org_id = $2::uuid` na `and (ur.org_id = $2::uuid or true)` | **2 testy padły**: `denies the same user the same permission in the other organization` → `expected true to be false` | 2 pozostałe testy (nadanie w org A) dalej zielone → bramka nie odrzuca wszystkiego; po `cp` z kopii `git status` pusty |
| Ż6 | etykieta operatorska dla każdego kodu błędu pakowania | `apps/web/tests/pack-error-label-contract.test.ts` | dodałem `return { ok: false, error: 'd2_probe_unmapped_code' }` do `apps/web/lib/shipping/pack-lp-into-box.ts:86` | **1 test padł**: `unmapped pack codes fall back to "please retry": d2_probe_unmapped_code` | 6 pozostałych zielonych; po przywróceniu `git status` pusty |
| Ż7 | post-check migracji 551 (widoczność zakładów, fail-closed) | `packages/db/migrations/551-production-site-visibility-rls.sql:36-69` | wstawiłem do `public.wo_events` wiersz z `site_id = NULL` | **psql exit 3**: `ERROR: migration 551 refuses fail-closed flip: 1 site-scoped rows still have NULL site_id; repair their producers/backfill first` | po `delete` tego wiersza ponowny przebieg: **exit 0, 0 błędów** |
| Ż8 | `pnpm -r lint` idzie do końca i wraca 0 | mierzone | pełny przebieg | **exit 0**, `1465 problems (0 errors, 1465 warnings)` | — |

### Bramki bazy — 7 ograniczeń CHECK, wszystkie zaczerwienione

Metoda: `create temp table t (like public.<tabela> including constraints)`, potem zdjęcie
**wszystkich** `NOT NULL`, żeby została **wyłącznie** bramka CHECK. Dzięki temu odmowa nie może
pochodzić z innego powodu (pierwsze podejście dało „czerwień" z `product_id NOT NULL` —
kontrola przeciwna to złapała). Wszystko w tabelach tymczasowych: nic nie zostało zapisane.

| # | co chroni | ograniczenie | naruszenie | wynik |
|---|---|---|---|---|
| B1 | **ilość** — rezerwacja nie może przekroczyć stanu | `license_plates_reserved_qty_le_quantity_check` | `quantity=10, reserved_qty=11` | **23514** odmowa |
| B2 | **ilość** — stan nieujemny | `license_plates_quantity_nonneg_check` | `quantity=-1` | **23514** odmowa |
| B3 | **ilość** — zwykły wyrób nie może być ujemny | `wo_outputs_qty_kg_nonneg_check` | `qty_kg=-5, correction_of_id=null` | **23514** odmowa |
| B4 | **ilość** — storno nie może DODAWAĆ towaru | `wo_outputs_qty_kg_nonneg_check` | `qty_kg=+5, correction_of_id=<uuid>` | **23514** odmowa |
| B5 | **pieniądze** — wartość zapasu nieujemna | `item_wac_state_value_nonneg_check` | `total_value=-1` | **23514** odmowa |
| B6 | **ilość** — storno konsumpcji nie może dodawać | `wo_material_consumption_qty_consumed_positive_check` | `qty=+5` przy `correction_of_id` | **23514** odmowa |
| B7 | **ilość** — storno odpadu nie może dodawać | `wo_waste_log_qty_kg_positive_check` | `qty_kg=+5` przy `correction_of_id` | **23514** odmowa |

**Kontrole przeciwne (3/3 przeszły)**: poprawny LP `10/10` — zapisany; poprawne storno ujemne
`-5` — zapisane; poprawny WAC `qty=10, value=50` — zapisany. Bramki nie są przypadkowymi
blokerami wszystkiego.

**Efekt uboczny wart odnotowania**: przy próbie wstawienia wiersza sondy do `public.wo_events`
baza odmówiła **pięć razy z rzędu** z pięciu różnych powodów (`transaction_id NOT NULL`,
`to_status NOT NULL`, `wo_events_event_type_check`, `wo_events_to_status_check`, FK `org_id`).
To niezależny dowód, że warstwa ograniczeń bazy jest gęsta i żywa — a nie tylko zadeklarowana.

---

## 2. Bramki MARTWE albo POZORNE

| # | bramka | gdzie | dowód, że nie zatrzyma niczego | skutek |
|---|---|---|---|---|
| **M1** | **bramka dryfu schematu** | `packages/db/package.json` → `check:drift`; wzorzec `packages/db/__expected__/schema.sql` | wzorzec ma **22 501 linii, data 2026-06-11**; zrzut z w pełni zmigrowanej bazy ma **47 501 linii**; `diff` = **55 512 linii**. `check:drift` → **exit 1** | bramka jest **trwale czerwona**, więc nie da się jej użyć. Job `migration-check` nie ma szans przejść, a `playwright` (`needs: [build, migration-check]`) i `storybook-build` (`needs: […, migration-check, playwright]`) **nigdy nie ruszą** |
| **M2** | **lint twardych napisów** | `scripts/lint-no-hardcoded-strings.mjs` | pełny przebieg: **6 804 znaleziska**, `Mode: warn`, **exit 0**. Ostatnia linia: `[WARN] Hardcoded string debt is currently non-blocking. Set HARDCODED_STRINGS_MODE=error to enforce.` Z `HARDCODED_STRINGS_MODE=error` → **exit 1** | chodzi w CI, mierzy, **nie blokuje**. Umie się zaczerwienić — tylko nikt jej o to nie prosi |
| **M3** | **reguła „częściowego commitu"** — `return {ok:false}` w `withOrgContext` COMMITUJE zapisy | `apps/web/eslint.config.mjs:301` → `'monopilot/no-ok-false-in-org-context': 'warn'` | **1 328 ostrzeżeń** w przebiegu `pnpm -r lint`, severity `warn`, `pnpm -r lint` → **exit 0** | to jest bramka pilnująca **spójności zapisów** (wzorzec „`return` = commit", 3 wystąpienia w audycie 30.07) i nie blokuje **niczego** |
| **M4** | **ESLint jako bramka jakości TS** | `tooling/eslint/base.mjs:36-47` | dla `**/*.{ts,tsx,mts,cts}` wyłączone są: `no-unused-vars`, `no-redeclare`, `no-undef`, oraz **wszystkie** `@typescript-eslint/*` (`no-unused-vars`, `no-explicit-any`, `no-unused-expressions`, `ban-ts-comment`, `no-require-imports`, `no-implied-eval`) | w praktyce cały `pnpm -r lint` na TypeScripcie egzekwuje **cztery** reguły własne (Ż2, Ż3, Ż4 + `pg.Pool`). Reszta to `warn`. Zielony `lint` nie znaczy „kod przeszedł lint" |
| **M5** | **typecheck testów** | `apps/web/package.json:10` → `typecheck:tests`; root `package.json:11` | zmierzone dziś: **1 722 błędy TS**, exit 2. Referencji w `.github/workflows/*.yml`: **zero** (jedyne wystąpienia to oba `package.json` i dziennik z 30.07) | to nie jest bramka, to licznik długu. Rosnący: 1 644 (30.07 13:00) → 1 699 (30.07 17:17) → **1 722 dziś** |
| **M6** | **typecheck w ogóle nie widzi testów** | `apps/web/tsconfig.json` → `exclude: ["node_modules", ".next", "dist", "e2e", "test-setup.ui.ts", "**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"]` | job `typecheck` w CI robi `pnpm -r typecheck`, a ten dla web to `tsc --noEmit` z powyższym `exclude` | **żaden plik testowy nie jest typowany w CI.** Test może wołać nieistniejącą funkcję i przejść przez bramkę typów |
| **M7** | **`pnpm -r test` zatrzymuje się na pierwszej czerwieni** | `.github/workflows/ci.yml:136` → `pnpm -r test` (bez `--no-bail`) | zmierzone: przebieg padł na `packages/queries` i **`packages/ui` oraz wszystko po nim się nie wykonało** (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`). `apps/web` jest ostatni w kolejności → jedna czerwień w dowolnym pakiecie **kasuje całą suitę web** | jedna awaria maskuje wszystkie następne. To samo dotyczy `pnpm -r lint` i `pnpm -r typecheck` |
| **M8** | **suita UI za `&&`** | `apps/web/package.json:11` → `vitest run … && vitest run --config vitest.ui.config.ts` | pierwsza część musi wrócić 0, żeby druga w ogóle wystartowała | przy jakimkolwiek czerwonym teście node **cała suita komponentów nie wykona się ani razu** — i nie zgłosi tego jako pominięcia |
| **M9** | **próba odtworzeniowa (restore drill)** | `.github/workflows/restore-drill.yml:4-5` → `cron: '0 5 1 */3 *'` | uruchamiana **raz na kwartał**. Lokalnie dziś: `FAIL … Migration failed: 279-npd-storage.sql / relation "storage.buckets" does not exist` | bramka odtwarzania kopii ma cykl 3-miesięczny — dłuższy niż całe życie większości defektów z tego audytu |
| **M10** | **`item_wac_state` — dziura po `inventory_cost_layers`** | `packages/db/migrations/404-drop-dead-tables-p7.sql:14` → `drop table if exists public.inventory_cost_layers;` | sprawdziłem w żywej bazie: `to_regclass('public.inventory_cost_layers')` → **NULL** | ograniczenia FIFO z migracji 199 (`qty_remaining <= qty_received` itd.) **nie istnieją**. Ostrzeżenie metodyczne: sprawdzanie `drop constraint` **nie wystarcza** — `drop table` zabija ograniczenia po cichu |

### Jedna korekta cudzej tezy

Sonda podrzędna zgłosiła mi, że `shipment_boxes_sscc_mod10_check` (cyfra kontrolna SSCC —
identyfikowalność palety w wysyłce) został usunięty i nie ma następcy. **To nieprawda.**
Zapytanie do żywej bazy:

```
shipment_boxes_sscc_check       CHECK ((sscc IS NULL) OR ((sscc)::text ~ '^[0-9]{18}$'))
shipment_boxes_sscc_mod10_check CHECK ((sscc IS NULL) OR (sscc_mod10(left(sscc,17)) = substr(sscc,18,1)::integer))
```

Oba ograniczenia **są żywe** — przywrócone przez `packages/db/migrations/459-generate-sscc-validate-before-increment.sql`.
Zostawiam to w raporcie jako przykład, dlaczego czytanie migracji bez odpytania bazy jest
niewystarczające.

---

## 3. Luki bez bramki — udowodnione defekty, których nic nie złapie przy nawrocie

| # | defekt bez bramki | dowód, że bramki nie ma | najtańsze zabezpieczenie | koszt |
|---|---|---|---|---|
| **L1** | **rozjazd księgi ze stanem** — trzy naprawy księgowe z nocy naprawiły pisarza, nie księgę | brak jakiegokolwiek triggera / widoku / testu porównującego `sum(stock_moves)` z `license_plates.quantity`; `grep -rniE "reconcil\|ledger_balance\|qty_mismatch\|stock_mismatch"` po migracjach i `apps/web/lib` daje **wyłącznie** trafienia o `outbox_events_event_type_check` — zero o zapasie | **jeden test `.pg.test.ts`**: zaseeduj LP, przeprowadź konsumpcję → cofnięcie → anulowanie wysyłki → anulowanie zlecenia, na końcu `assert sum(stock_moves.qty) = license_plates.quantity` dla tego LP. Jeden `expect`, cztery ścieżki, łapie wszystkie trzy naprawione dziury naraz | **M** |
| **L2** | **jednostka × koszt za kilogram** — `public.compute_intermediate_unit_cost` (migracja 501) obsługuje **tylko** `lower(pc.throughput_uom) = 'kg'` (`501-intermediate-cost-batch-normalize.sql:97`) | funkcja jest **żywa** (żadna z 502-564 jej nie nadpisuje; ostatnie `create or replace` to 501). `grep -rl compute_intermediate_unit_cost` po `apps/` i `packages/` → **zero trafień**, także w testach | **test czytający źródło**, wzorem `pack-error-label-contract.test.ts`: wyciągnij z pliku migracji wszystkie `lower(...uom) = '...'` i porównaj ze słownikiem UoM w kodzie; padnij, gdy jednostka używana w danych nie ma gałęzi. Albo mocniej: `.pg.test.ts` liczący koszt dla `throughput_uom='g'` i sprawdzający, że wynik **nie jest** 1000× obok | **S** (wersja czytająca źródło) |
| **L3** | **kod błędu bez etykiety — poza pakowaniem** | `pack-error-label-contract.test.ts` pilnuje **jednej** ścieżki (`lib/shipping/pack-lp-into-box.ts` → jeden ekran). Ekranów z własną mapą `errors: {` w `apps/web/app`: **89** | **uogólnij istniejący test**: zamiast pary (jeden plik core, jeden ekran) — przejdź po wszystkich `errors: {` w `app/**/*.tsx`, zbierz klucze, zbierz `error: '…'` z sąsiadującego `_actions/`, zgłoś różnicę. Ten sam kod, pętla zamiast dwóch stałych | **M** |
| **L4** | **`'use server'` eksportujący nie-funkcję** | **bramka jest i działa** — Ż1 + Ż2 zaczerwienione dziś. Uwaga innej natury: **ta sama reguła istnieje w trzech implementacjach** (`scripts/lint-use-server-exports.mjs`, reguła ESLint `monopilot/no-export-type-in-use-server`, oraz `apps/web/tests/use-server-export-contract.test.ts`) | nic nie dodawać. Rozważyć skasowanie dwóch z trzech — reguła ESLint jest najtańsza (chodzi w `lint`), skrypt korzenia jest najszybszy (1,35 s). Test kontraktowy jest zbędny | **S** (usunięcie) |
| **L5** | **wzorzec „`return` = commit" w `withOrgContext`** | reguła istnieje, ale jako `warn` — **1 328 ostrzeżeń**, `exit 0` (M3) | nie pisać nowej bramki. **Podnieść severity do `error` z listą wyjątków** wygenerowaną z dzisiejszego przebiegu (`eslint --format json` → plik `.eslint-partial-commit-baseline.json`), żeby nowe wystąpienia padały, a stare nie blokowały. Wzorzec „nie gorzej niż dziś" | **M** |
| **L6** | **bramka dryfu schematu nie mierzy niczego od 2026-06-11** | M1 | **regeneracja wzorca**: `pg_dump` z bazy po pełnym łańcuchu → `packages/db/__expected__/schema.sql`. Bez tego `migration-check` nie przejdzie **nigdy**, a razem z nim `playwright` i `storybook-build` | **S** |
| **L7** | **13 z 23 pakietów nie ma skryptu `typecheck`** | pakiety bez `typecheck` w `package.json`: `ui`, `rbac`, `schema-driven`, `auth`, `cascade-engine`, `schema-runtime`, `server`, `rule-engine`, `sync-queue` (ma `build`, nie `typecheck`), `db`, `ops`, `e-sign`, `validation`. `pnpm -r typecheck` **po cichu je pomija** | **częściowo już chronione, nie panikować**: sprawdziłem — wstawiony błąd typu w `packages/rbac/src/grant.ts` **został złapany**, bo `apps/web` kompiluje ich źródła przez ścieżki. Realna luka to tylko pakiety nieimportowane przez `apps/web`/`apps/worker`. Najtaniej: dopisać `"typecheck": "tsc --noEmit"` do trzynastu `package.json` | **S** |
| **L8** | **`compute_intermediate_unit_cost` i cała rodzina funkcji SQL** nie ma post-checku wywołującego funkcję | migracja 501 nie ma bloku `do $$ … raise exception` weryfikującego wynik | zgodnie z lekcją z 25.07 (`PREPARE` nie waliduje ciał funkcji SQL): każda migracja tworząca funkcję **musi** mieć `do $$` **wywołujący** ją na danych syntetycznych i porównujący wynik. To jedna linia szablonu w skillu migracyjnym | **S** (szablon) + **M** (dorobienie wstecz) |

---

## 4. Czego NIE zdążyłem — uczciwie

- **RLS pod rolą `app_user`** — nie zaczerwieniłem. Test `screen-read-gates.pg.test.ts` istnieje,
  ale nie uruchomiłem go z naruszeniem. Uwaga z `scripts/test-db.sh:191`: post-checki migracji
  chodzą przy **podniesionych** uprawnieniach, więc **nie dowodzą zachowania pod RLS** — to trzeba
  sprawdzić osobno, rolą nieuprzywilejowaną. **NIEPRZETESTOWANA.**
- **Triggery bazy** — nie zaczerwieniłem ani jednego. Wiem tylko, że przy `disable trigger all`
  wstawienie wiersza się udało, a bez tego FK odmawiał. **NIEPRZETESTOWANE.**
- **`pnpm build`** jako bramka — nie uruchomiłem (jest droga, a Ż1 mierzy dokładnie tę klasę,
  którą build łapał).
- **Playwright / E2E** — nie uruchomiłem. Wzorzec „job wykonujący 0 z 381" z briefu został
  potwierdzony pośrednio: `playwright` zależy od `migration-check`, który przy M1 nie ma jak przejść.
- **Pełny przebieg `apps/web`** — uruchomiony na moim klonie **bez person i danych startowych**,
  więc obserwowane czerwienie (`to-stock.integration.test.ts` 6/6, `routings.integration.test.ts`
  5/11) **prawdopodobnie pochodzą z braku danych, nie z kodu**. Nie przypisuję ich repozytorium.
  To jest dokładnie piętro nr 5 z briefu, tylko odwrócone. Przebieg **dojechał do końca**
  (276 s): `Test Files 76 failed | 586 passed | 1 skipped (663)`,
  `Tests 160 failed | 4898 passed | 118 skipped (5176)`, exit 1.
  **Czerwieni NIE przypisuję repozytorium** — klon nie miał person ani danych startowych.
  Kto powtórzy: użyć klonu **zaseedowanego** (`bash scripts/test-db.sh clone`), nie gołego
  klonu szablonu.
  Jedna liczba z tego przebiegu jest jednak **niezależna od danych** i warta zgłoszenia:
  **118 testów raportuje się jako `skipped` mimo ustawionego `DATABASE_URL`** — to nie są
  testy bazodanowe czekające na bazę, tylko pominięcia z innego powodu. Do zbadania osobno
  (kandydat na falę: policzyć je i dla każdego ustalić, czy pominięcie jest zamierzone).
- **`check-markers.mjs`, `check-domain-glossary.mjs`, `check-regulatory-staleness.mjs`,
  `prepare-check-sql.mjs`, `scan-dual-cast-params.py`** — nie zdążyłem sprawdzić, czy cokolwiek
  je uruchamia. **NIEPRZETESTOWANE.**

---

## 5. Propozycja fal — kryterium korzyść ÷ ryzyko

### Fala A — odblokuj to, co już jest napisane (ryzyko ~0, korzyść największa)

Dzisiaj **trzy jobs CI nie mają jak wystartować**, bo blokuje je jedna nieaktualna kopia pliku.
To najtańsza rzecz w całym raporcie.

1. **L6 — regeneracja `packages/db/__expected__/schema.sql`** (S). Odblokowuje `migration-check`,
   a przez to `playwright` i `storybook-build`. Ryzyko: żadne — to plik odniesienia, nie kod.
2. **L7 — `"typecheck": "tsc --noEmit"` do 13 `package.json`** (S). Ryzyko: może odsłonić błędy
   typów, które dziś nikt nie widzi. To jest cel, nie skutek uboczny.
3. **M7 — `pnpm -r --no-bail test` w CI** (S). Jedna flaga. Bez niej dalej nie wiemy, ile
   naprawdę jest czerwone. Ryzyko: raport CI będzie brzydszy — to też jest cel.

### Fala B — zamień liczniki w bramki (ryzyko średnie, korzyść trwała)

Wszystkie trzy pozycje **już umieją się zaczerwienić** — trzeba tylko pozwolić im blokować.

4. **L5 — `no-ok-false-in-org-context` na `error` z linią bazową** (M). 1 328 wystąpień,
   więc **wyłącznie** z listą wyjątków. Chroni spójność zapisów.
5. **M2 — `HARDCODED_STRINGS_MODE=error` z linią bazową** (M). Ta sama technika, 6 804 wystąpienia.
6. **M5 — `typecheck:tests` do CI z progiem „nie więcej niż 1 722"** (S). Dziś rośnie
   niezauważony: +78 od 30 lipca.

### Fala C — bramki na pieniądze i ilość (największa korzyść merytoryczna)

7. **L1 — test zachowania ilości w jednym `.pg.test.ts`** (M). Jedna asercja pokrywa cztery
   ścieżki, na których w nocy znaleziono trzy dziury. **To jest pozycja o najwyższym stosunku
   korzyść ÷ ryzyko w całym raporcie** — dodaje test, nie zmienia kodu produkcyjnego.
8. **L2 — bramka na jednostki w `compute_intermediate_unit_cost`** (S). Żywa funkcja, zerowe
   pokrycie, znany błąd tysiąckrotny w rodzinie obok.
9. **L8 — szablon post-checku wywołującego funkcję** (S na szablon). Bez tego `PREPARE` dalej
   będzie fałszywą zielenią.

### Fala D — sprzątanie (niski priorytet, ale tanie)

10. **L4 — skasować dwie z trzech implementacji reguły `'use server'`** (S).
11. **M10 — przejrzeć ograniczenia z migracji 199 pod kątem `drop table` w 404** (S).
12. **M9 — próba odtworzeniowa częściej niż raz na kwartał** (S) — plus naprawa shimu
    `storage.buckets`, przez który pada lokalnie.

### Czego świadomie NIE proponuję

- **M4 (ESLint wyłączony na TS)** — nie ruszać w tej kampanii. Włączenie `@typescript-eslint/*`
  odsłoniłoby tysiące ostrzeżeń i pochłonęłoby całą falę bez jednego naprawionego defektu.
  Zamiast tego: Fala B, która blokuje **przyrost** długu przy zerowym koszcie sprzątania starego.
- **M8 (suita UI za `&&`)** — samo się naprawi po Fali A, punkt 3.

---

## Załącznik — dyscyplina cofania sond

Każdy plik tknięty w tej sesji, z potwierdzeniem czystego stanu:

| plik | sonda | jak cofnięte | `git status` |
|---|---|---|---|
| `apps/web/lib/__d2_probe_use_server.ts` | nowy plik | `rm` | pusty |
| `apps/web/components/__d2_probe.ts` | nowy plik | `rm` | pusty |
| `packages/rbac/src/grant.ts` | `export const __d2_probe: number = "…"` | `git restore` | pusty |
| `apps/web/lib/auth/has-permission.ts` | `or true` w filtrze org (2 miejsca) | `cp` z kopii `/tmp/d2-hp-backup.ts` | pusty |
| `apps/web/lib/shipping/pack-lp-into-box.ts` | dodatkowy kod błędu | `cp` z kopii `/tmp/d2-pack-backup.ts` | pusty |
| `public.wo_events` w `monopilot_d2` | wiersz z `site_id = NULL` | `delete` + `enable trigger all` | migracja 551 znowu przechodzi |

Niezacommitowany `production/changeover/_actions/changeover-data.ts` **nie był dotykany**.

---

## Załącznik B — pełna lista bramek CI z werdyktem

| job | `ci.yml` | co robi | werdykt |
|---|---|---|---|
| `lint-workflows` | :17 | `actionlint` na `.github/workflows/*.yml` | żywy (naprawiony `48f1918f`) — **NIEPRZETESTOWANY przeze mnie** |
| `pr-labels` | :29 | wymaga etykiety `feat\|fix\|…`, zakazuje `wip` | **NIEPRZETESTOWANY** |
| `lint` | :49 | `pnpm lint` = 2 skrypty korzenia + `pnpm -r lint` | **żywy** (Ż1, Ż3, Ż4, Ż8) — ale patrz M2, M3, M4, M7 |
| `typecheck` | :65 | `pnpm -r typecheck` | **żywy**, ale ślepy na testy (M6) i na 13 pakietów bez skryptu (L7) |
| `build` | :79 | `pnpm build`, `needs: [lint, typecheck]` | **NIEPRZETESTOWANY** |
| `vitest` | :94 | shim Supabase → migracje → `pnpm -r test` | żywy, ale przerywa na pierwszej czerwieni (M7) |
| `migration-check` | :138 | migracje + `check:drift` | **MARTWY** — `check:drift` nie może przejść (M1) |
| `playwright` | :179 | `needs: [build, migration-check]` | **NIEOSIĄGALNY** dopóki M1 |
| `storybook-build` | :242 | `needs: […, migration-check, playwright]` + `continue-on-error` gdy brak zależności | **NIEOSIĄGALNY** dopóki M1; dodatkowo `continue-on-error` czyni go nieblokującym |
