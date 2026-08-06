# A2 — martwy kod w `packages/*`, `apps/worker`, `tooling/*`, `scripts/*` + zależności

Data: 2026-08-06 · Agent: Grupa A / Agent 2 · Obszar: **wszystko poza `apps/web`**
Produkt: **inwentaryzacja**. Niczego nie naprawiałem. Sondy wykonane wyłącznie w `/tmp`
(`git status` na plikach repo bez zmian z mojej strony).

---

## Streszczenie w trzech liczbach

| | |
|---|---|
| martwy kod źródłowy poza `apps/web` | **~17 800 linii** (3 pakiety bez konsumenta + warstwa Drizzle + `apps/worker` niewdrożony) |
| bramki, które istnieją i **nie blokują niczego** | **9** (w tym 1 z 911 naruszeniami w trybie `warn`) |
| pliki testowe, które **nigdy się nie uruchamiają** | **5** (poza workspace) + **17 testów** celujących w tabele skasowane migracją 404 |

Najważniejsze zdanie raportu: **największą pozycją nie jest martwy kod, tylko martwy strażnik.**
Bramka dryfu schematu (`check:drift`) ma wzorzec cofnięty do migracji ~197 przy 564 w repo —
odblokowana wczoraj poprawka CI sprawi, że **przy najbliższym przebiegu zapali się na czerwono**,
a „naprawa" przez ślepe przegenerowanie wzorca zalegalizuje cokolwiek jest w bazie.

---

## GRUPA 1 — pakiety bez konsumenta

### A2-01 · Trzy pakiety, których nie importuje ani jeden plik produkcyjny

| pole | treść |
|---|---|
| **co** | `@monopilot/cascade-engine`, `@monopilot/storage` i `@monopilot/queries` nie są importowane przez żaden kod poza własnymi testami; `cascade-engine` i `storage` nie występują nawet jako zależność w cudzym `package.json` |
| **gdzie** | `packages/cascade-engine/src/index.ts:1`, `packages/storage/src/index.ts:1`, `packages/queries/src/index.ts:1` |
| **dowód** | Grep po całym repo (bez `_meta`, `docs`, `.next`, `node_modules`) na `@monopilot/cascade-engine` → **0 trafień w kodzie**; na `@monopilot/storage` → **0 trafień w ogóle**; na `@monopilot/queries` → **1 trafienie: `apps/web/package.json:27` (deklaracja zależności, zero importów)**. Osobno przeszukałem każdą eksportowaną funkcję po nazwie: `handlePackSizeChange`, `queueAllergenCascadeRebuild`, `handleOperationChange`, `handleRecipeComponentsChanged`, `handleTemplateChange`, `persistDownloadable`, `listFaByDept`, `listFaHistory` → **0 wywołań**. `listApprovalHistory` występuje raz — w **łańcuchu znaków w komentarzu testu** (`apps/web/app/[locale]/(app)/(npd)/pipeline/[projectId]/_components/__tests__/approval-history-parity-evidence.test.tsx:136`). Sprawdziłem też import po ścieżce względnej (`from '…/packages/<nazwa>/'`) — te trzy pakiety nie występują. Rozmiar: `cascade-engine` 883 linie src + 1673 testy, `queries` 1498 + 970, `storage` 289 + 480 → **razem 2 670 linii kodu + 3 123 linie testów** |
| **korzyść** | −5 793 linie, −3 pakiety z `pnpm install`, −3 zestawy zależności (`pg`, `drizzle`), krótszy czas CI (`pnpm -r test` przestaje uruchamiać 9 plików testowych bez wartości) |
| **koszt** | S (usunięcie 3 katalogów + wpis w `apps/web/package.json`) |
| **ryzyko** | Niskie–średnie. `cascade-engine` implementuje 4 łańcuchy kaskad NPD opisane w PRD (`docs/prd/01-NPD-PRD.md:641`) i w skillu `MON-domain-npd`. Jeśli to **zaplanowana**, a nie porzucona funkcjonalność — usunięcie kasuje projekt, nie dług. **Wymaga decyzji właściciela: „porzucone" czy „jeszcze nie podłączone".** Dla `storage` i `queries` takiego kontekstu nie ma |
| **zależy od** | — |

### A2-02 · `@monopilot/sync-queue` — mapa `exports` wskazuje na `dist/`, którego nikt nie buduje

| pole | treść |
|---|---|
| **co** | Pakiet deklaruje wejście `./dist/index.js`, ale jego skrypt `build` to `tsc --noEmit` — katalog `dist/` nie istnieje. Każdy `import … from '@monopilot/sync-queue'` padnie z błędem rozwiązania modułu |
| **gdzie** | `packages/sync-queue/package.json:7-12` (`exports`) i `:16` (`"build": "tsc --noEmit"`) |
| **dowód** | `find packages/sync-queue -maxdepth 1 -type d` → tylko `src` (brak `dist`). Jedyny konsument w repo — `apps/web/__tests__/pwa/install-offline.e2e.test.ts:197,225` — importuje **po ścieżce względnej** `'../../../../packages/sync-queue/src/index.js'`, a komentarz w tym samym pliku (linia 165) mówi wprost: *„The web app itself would import from '@monopilot/sync-queue'"* — czyli aplikacja tego nie robi. `grep sync-queue apps/web/package.json` → 0 trafień. Dodatkowo: `idb-keyval` i `uuid` są w `dependencies`, a **nie są importowane w żadnym pliku pakietu** (UUID v7 jest napisany ręcznie w `src/index.ts:20`). To jedyny pakiet w workspace **bez `"private": true`** |
| **korzyść** | Usunięcie pułapki „działa w teście, pada w apce"; −2 nieużywane zależności; −1 pakiet publikowalny przez pomyłkę |
| **koszt** | S |
| **ryzyko** | Niskie. Offline-queue nie jest podpięte do UI — usunięcie nie zmienia zachowania produkcji |
| **zależy od** | — |

### A2-03 · `packages/db/schema/` — 11 248 linii modelu Drizzle bez ani jednego importu z zewnątrz

| pole | treść |
|---|---|
| **co** | 94 pliki definicji tabel Drizzle. Żaden plik poza `packages/db/schema/` ich nie importuje. Aplikacja rozmawia z bazą surowym SQL przez `pg` |
| **gdzie** | `packages/db/schema/` (94 pliki, 11 248 linii); barrel `packages/db/schema/index.ts`; publiczne API pakietu: `packages/db/src/index.ts:8` |
| **dowód** | `packages/db/src/index.ts:8` re-eksportuje z barrela **dokładnie dwa** symbole: `export { outboxEvents, tenantMigrations } from '../schema/index.js';`. Grep na `from '…packages/db/schema'` / `@monopilot/db/schema` poza `packages/db` → **0 plików**. Skan 554 eksportów z `schema/*`: **457 nie występuje nigdzie poza katalogiem `schema/`**, 12 tylko w testach; reszta „trafień" to fałszywe dopasowania po nazwach pospolitych (`items`, `users`, `product`). `packages/db/drizzle.config.ts` istnieje, ale **żaden skrypt ani workflow nie uruchamia `drizzle-kit`** — migracje idą przez własny runner `packages/db/scripts/migrate.ts` (jego nagłówek, linia 13, mówi wprost: *„no drizzle-kit involvement"*). Jedyny test barrela — `packages/db/__tests__/schema-discovery.test.ts:17` — robi `import * as schema` tylko po to, by sprawdzić, że barrel coś eksportuje: **test broniący istnienia martwego kodu** |
| **korzyść** | −11 248 linii, koniec cichego dryfu drugiego (nieużywanego) modelu schematu wobec 523 plików SQL; `drizzle-kit` + `drizzle-orm` z `packages/db` do usunięcia lub zawężenia |
| **koszt** | M (trzeba przenieść `outboxEvents`/`tenantMigrations` albo potwierdzić, że i one są martwe — patrz dowód: ich nazwy poza `schema/` pojawiają się tylko jako lokalne zmienne w testach `apps/web`) |
| **ryzyko** | Średnie: `packages/outbox/src/emit-fa-event.ts` i `packages/schema-runtime/src/build-dept-zod.ts` **używają `drizzle-orm`** (typy `PgTransaction`, helper `sql`), więc sama biblioteka zostaje; kasujemy tylko definicje tabel |
| **zależy od** | A2-05 (najpierw ustalić, który opis schematu jest źródłem prawdy) |

---

## GRUPA 2 — bramki, które nie chodzą (najcenniejsze)

### A2-04 · Wzorzec dryfu schematu cofnięty o ~367 migracji — bramka `check:drift` nie ma szans przejść

| pole | treść |
|---|---|
| **co** | Plik wzorcowy, z którym CI porównuje żywy schemat, pochodzi z 11 czerwca i odzwierciedla stan bazy mniej więcej z migracji 197. W repo jest 523 migracje, najwyższy prefiks 564 |
| **gdzie** | `packages/db/__expected__/schema.sql` (22 501 linii); bramka: `packages/db/package.json:12` (`check:drift`), wywołanie: `.github/workflows/ci.yml:177` |
| **dowód** | `git log -1 -- packages/db/__expected__/schema.sql` → `59d47c37, Thu Jun 11 2026`. Przeliczyłem 330 instrukcji `create table` w łańcuchu migracji: **165 z nich nie ma odpowiednika we wzorcu**. Najwyższa migracja, której tabela jest we wzorcu: `197-quality-holds-ncr-specs.sql`. Pierwsza nieobecna: `193-warehouse-lp-transitions-grn-stock-spare-parts.sql` → `public.stock_moves` (`grep stock_moves __expected__/schema.sql` → **0 trafień**, a to tabela księgi magazynowej, do której odwołuje się 171 miejsc w kodzie). Bramka to `diff -u __expected__/schema.sql <(pg_dump …)` — przy takiej różnicy zwraca 1. Nie zapaliła się przez dwa miesiące, bo krok wcześniejszy (`pnpm --filter @monopilot/db migrate`) padał na migracji 051 — potwierdza to komentarz dopisany wczoraj w `.github/workflows/ci.yml:127-130`. Po wczorajszej poprawce (`78bfb862`, `48f1918f`) łańcuch migracji w CI wreszcie dochodzi do końca — **więc `check:drift` zapali się przy pierwszym przebiegu** |
| **korzyść** | Jedyna bramka w repo, która wykrywa rozjazd „migracje vs. rzeczywistość", zaczyna działać. Bez niej migracja psująca schemat przechodzi bez śladu |
| **koszt** | M — przegenerować wzorzec **z bazy zbudowanej wyłącznie łańcuchem migracji od zera** (nie z produkcji!) i obejrzeć diff, zanim się go zatwierdzi |
| **ryzyko** | **Największe ryzyko to zrobić to źle.** Przegenerowanie z produkcji zamrozi jako „wzorzec" wszystko, co ktoś kiedyś dodał ręcznie poza migracjami. Wzorzec musi powstać z czystej bazy + `pnpm db:migrate` |
| **zależy od** | — |

### A2-05 · `pnpm -r typecheck` obejmuje 11 z 26 pakietów; `packages/db` i `packages/server` nie mają nawet `tsconfig.json`

| pole | treść |
|---|---|
| **co** | Bramka typów w CI to `pnpm -r typecheck`, a skrypt `typecheck` ma tylko 11 pakietów. Piętnaście — w tym największy pakiet po `web` — nie jest sprawdzane nigdy |
| **gdzie** | `.github/workflows/ci.yml:77`; brak `"typecheck"` w: `packages/auth`, `cascade-engine`, `db`, `e-sign`, `ops`, `rbac`, `rule-engine`, `schema-driven`, `schema-runtime`, `server`, `sync-queue`, `ui`, `validation`, `tooling/eslint-rules`, `tooling/restore-drill`. Brak `tsconfig.json` w: `packages/db`, `packages/server`, `tooling/eslint`, `tooling/eslint-rules` |
| **dowód** | Macierz skryptów zebrana z 26 plików `package.json` (pełna lista w sekcji „co jest żywe"). Sonda: uruchomiłem `tsc --noEmit` na `packages/db/src/**` z ustawieniami z `tsconfig.base.json` (config w `/tmp`, repo nietknięte) → **6 błędów w kodzie produkcyjnym**: `packages/db/schema/allergens.ts:13`, `packages/db/schema/infra-master.ts:18` i `:19` oraz `packages/gdpr/src/index.ts:6,7,15` — wszystkie `TS2835` (import względny bez rozszerzenia `.js` przy `moduleResolution: NodeNext`) |
| **korzyść** | 15 pakietów wchodzi pod bramkę typów; 6 realnych błędów znika. `packages/db` to 258 plików TS, dziś kompletnie poza kontrolą typów |
| **koszt** | M (dodać `tsconfig.json` + skrypt do 15 pakietów, potem posprzątać to, co się zapali) |
| **ryzyko** | Niskie technicznie, ale **CI zrobi się czerwone, dopóki błędy nie zostaną naprawione** — to praca do zaplanowania, nie do wrzucenia w locie |
| **zależy od** | A2-14 (najpierw ujednolicić `moduleResolution`, inaczej te same pliki dają różne wyniki w różnych pakietach) |

### A2-06 · `lint-no-hardcoded-strings.mjs` chodzi w CI, ale w trybie `warn` — 911 naruszeń, zero blokad

| pole | treść |
|---|---|
| **co** | Skrypt został wczoraj podpięty do łańcucha lintu z korzenia, ale domyślnie kończy się `exit 0` i tylko wypisuje ostrzeżenia. Blokuje wyłącznie przy `HARDCODED_STRINGS_MODE=error`, którego nikt nie ustawia |
| **gdzie** | `scripts/lint-no-hardcoded-strings.mjs:91` (`const mode = process.env.HARDCODED_STRINGS_MODE === 'error' ? 'error' : 'warn';`) i `:103` (`process.exit(0)`); wywołanie: `package.json:9` |
| **dowód** | Uruchomiłem: `node scripts/lint-no-hardcoded-strings.mjs` → kończy się kodem 0 i wypisuje **911 linii naruszeń** (`grep -c "^\s\+apps/web"`). Grep na `HARDCODED_STRINGS_MODE` w całym repo → **3 trafienia: dwa w samym skrypcie, jedno w `apps/web/lib/i18n/__tests__/format.test.ts:158`** (test podstawia zmienną sam sobie). Ani w `ci.yml`, ani w `apps/web/vercel.json` jej nie ma |
| **korzyść** | Albo bramka zaczyna chronić, albo przestaje udawać. Dziś kosztuje czas przebiegu CI i daje zero |
| **koszt** | S na decyzję (`error` + tymczasowa lista wyjątków) · L na wyzerowanie 911 naruszeń |
| **ryzyko** | Włączenie `error` bez listy wyjątków zablokuje każdy PR |
| **zależy od** | — |

### A2-07 · Pięć plików testowych leży poza workspace — `pnpm -r test` ich nie widzi, korzeń nie ma skryptu `test`

| pole | treść |
|---|---|
| **co** | Testy w `scripts/`, `_foundation/` i `lib/` nie należą do żadnego pakietu workspace. `pnpm -r` pomija korzeń, a korzeń nie ma skryptu `test` — te pliki nie uruchomiły się nigdy |
| **gdzie** | `scripts/rules-deploy.test.ts`, `scripts/lint-drift-fixtures.test.mjs`, `scripts/__tests__/verify-supabase-config.test.ts`, `_foundation/__tests__/marker-discipline.test.ts`, `lib/reference/__tests__/ref-tables.test.ts` |
| **dowód** | `pnpm-workspace.yaml` → `packages: [apps/*, packages/*, tooling/*]`. Korzeniowy `package.json` (linie 4-28) nie ma klucza `"test"`. CI woła `pnpm -r test` (`.github/workflows/ci.yml:136`). Root `vitest.config.ts` istnieje, ale nic go nie uruchamia — nie ma skryptu, który by go użył. Skutek uboczny: `scripts/lint-drift-fixtures.test.mjs` jest **jedynym** miejscem odwołującym się do `@monopilot/schema-runtime` i `@monopilot/rule-engine` z listy pakietów (linia 22) — czyli ten „strażnik konfiguracji pakietów" też nie chodzi |
| **korzyść** | 5 plików testowych zaczyna cokolwiek chronić — albo znikają, jeśli nie są potrzebne |
| **koszt** | S (skrypt `test` w korzeniu + krok w CI) |
| **ryzyko** | Niskie; możliwe, że któryś z nich od razu padnie (patrz A2-09 — `marker-discipline.test.ts` waliduje `check-markers.mjs`) |
| **zależy od** | — |

### A2-08 · 17 testów integracyjnych celuje w pięć tabel skasowanych migracją 404

| pole | treść |
|---|---|
| **co** | Plik testowy sprawdza kolumny, indeksy i polityki RLS na tabelach `lot`, `work_order`, `quality_event`, `shipment`, `bom_item` — usuniętych z bazy. Uruchomiony z `DATABASE_URL` wybuchnie błędem 42P01 |
| **gdzie** | `packages/db/__tests__/r13-business-tables.test.ts` (615 linii, 17 wywołań `runIntegrationTest` w blokach od linii 194 do 580) |
| **dowód** | `packages/db/migrations/404-drop-dead-tables-p7.sql:8-12` — `drop table if exists public.lot; … public.quality_event; … public.bom_item; … public.shipment; … public.work_order;`. Przeliczyłem cykl życia każdej tabeli w całym łańcuchu migracji: powstają w `014-r13-placeholder-tables.sql`, **nie są odtwarzane po 404**. Test robi m.in. `insert into public.lot (…)` (linia 352). Nie wybuchał, bo `const runIntegrationTest = databaseUrl ? it : it.skip` (linia 28), a w CI job `vitest` nie docierał do testów — łańcuch migracji padał wcześniej. **Po wczorajszej poprawce CI ten plik zapali się na czerwono.** Bloki statyczne (czytające plik migracji 014 z dysku) dalej przechodzą — to klasyczna „zieleń przez pominięcie" |
| **korzyść** | −615 linii; usunięcie miny, która wybuchnie w pierwszym zielonym przebiegu CI od trzech miesięcy |
| **koszt** | S (usunąć plik) |
| **ryzyko** | Brak — tabele nie istnieją, test nie chroni niczego żywego |
| **zależy od** | — |

### A2-09 · Siedem skryptów, które wyglądają jak strażnicy, a nikt ich nie woła

| pole | treść |
|---|---|
| **co** | Skrypty istnieją, mają komunikaty „FAILED / PASSED" i kod wyjścia 1, ale nie wywołuje ich ani `package.json`, ani workflow, ani inny skrypt |
| **gdzie** | `scripts/check-domain-glossary.mjs`, `scripts/check-regulatory-staleness.mjs`, `scripts/check-markers.mjs`, `scripts/scan-dual-cast-params.py`, `scripts/extract-sql.mjs`, `scripts/prepare-check-sql.mjs`, `scripts/setup-dev.sh` |
| **dowód** | Grep po całym repo (bez `docs/` i samego pliku) na każdą nazwę: `check-domain-glossary.mjs` → **0**, `scan-dual-cast-params.py` → 0 poza `_meta`, `extract-sql.mjs` → **0**, `prepare-check-sql.mjs` → **0**, `setup-dev.sh` → 0 poza `_meta`. `check-regulatory-staleness.mjs` → trafienia tylko w `_foundation/regulatory/README.md:16`, gdzie napisano: *„The staleness guard fails CI"* — **to nieprawda, nic go nie uruchamia**. `check-markers.mjs` → tylko `_foundation/__tests__/marker-discipline.test.ts`, który sam nigdy nie chodzi (A2-07). Uruchomiłem oba „czyste" strażniki ręcznie: `check-domain-glossary.mjs` → `PASSED: all 13 required term(s) present`, `check-regulatory-staleness.mjs` → `PASSED: 7 file(s) validated`. **Dziś przechodzą — czyli podpięcie ich do CI jest darmowe** |
| **korzyść** | Dwie darmowe bramki (glosariusz, świeżość dokumentów regulacyjnych) zaczynają chronić; reszta do skasowania. Znika kłamstwo w README |
| **koszt** | S |
| **ryzyko** | Brak — zweryfikowałem, że przechodzą na obecnym drzewie |
| **zależy od** | — |

### A2-10 · Martwe artefakty konfiguracyjne: `scripts/cron.json` i `scripts/combined-migrations.sql`

| pole | treść |
|---|---|
| **co** | `scripts/cron.json` to nieużywana, **sprzeczna** kopia harmonogramu cronów; `scripts/combined-migrations.sql` to zamrożony zlepek starych migracji, do którego nikt się nie odwołuje |
| **gdzie** | `scripts/cron.json` (harmonogram `0 6 * * *` dla `/api/internal/cron/drift`) vs. `apps/web/vercel.json` (ten sam endpoint, `0 2 * * *`); `scripts/combined-migrations.sql` (zawiera m.in. definicję `public.tenant_migrations` sprzed migracji 040 — linie 1200-1218) |
| **dowód** | Grep na `cron.json` → 2 trafienia, oba w `_meta`. Grep na `combined-migrations.sql` → **0 trafień**. Vercel czyta wyłącznie `apps/web/vercel.json` (`crons`, 6 wpisów). W `combined-migrations.sql:1211` żyje `tenant_migrations_cohort_check` — constraint z **kolumny `cohort` usuniętej przez migrację 040**; kto sięgnie po ten plik jako po opis schematu, odtworzy błąd `advanceCohort` |
| **korzyść** | −2 pliki wprowadzające w błąd, w tym jeden, który już raz wygenerował martwą funkcję |
| **koszt** | S |
| **ryzyko** | Brak |
| **zależy od** | — |

### A2-11 · `storybook-build` — job, który sam się wyłącza dokładnie wtedy, gdy jest potrzebny

| pole | treść |
|---|---|
| **co** | Krok budujący Storybooka nie blokuje, jeśli `storybook --version` nie wystartuje. Warunek „nie blokuj, gdy narzędzie nie działa" zamienia bramkę w dekorację |
| **gdzie** | `.github/workflows/ci.yml:255-263` |
| **dowód** | `continue-on-error: ${{ steps.storybook-deps.outputs.installed != 'true' }}` — flaga pochodzi z `pnpm --filter @monopilot/ui exec storybook --version >/dev/null 2>&1`. Jedyny scenariusz, w którym build Storybooka pada, to najczęściej właśnie zepsuta instalacja — a wtedy job świadomie przechodzi na zielono |
| **korzyść** | Bramka albo blokuje, albo znika z CI (job jest ostatni w łańcuchu `needs`, więc kosztuje pełny przebieg) |
| **koszt** | S |
| **ryzyko** | Brak |
| **zależy od** | — |
| **sprostowanie** | Sam Storybook **żyje**: `packages/ui/.storybook/main.ts` + 20 plików `*.stories.tsx` (10 wzorców P1–P10). Wcześniejsza hipoteza „zależności Storybooka są nieużywane" jest **fałszywa** — dodatki są wskazywane łańcuchami znaków w `main.ts:9-11`, nie importem, więc skan importów ich nie widzi |

### A2-20 · Kwartalna „próba odtworzenia z kopii" odtwarza pusty plik i sprawdza tabele skasowane migracją 404

| pole | treść |
|---|---|
| **co** | Workflow `RESTORE_DRILL_QUARTERLY` nie odtwarza żadnej kopii zapasowej — sam sobie generuje pusty plik zrzutu, a potem stosuje migracje. Do tego jedno z pięciu zapytań kontrolnych sprawdza polityki RLS na pięciu tabelach usuniętych migracją 404, więc próba **musi** kończyć się porażką |
| **gdzie** | `.github/workflows/restore-drill.yml:52-55` (generowanie zrzutu) i `:56` (`pnpm drill`); zapytanie kontrolne: `tooling/restore-drill/src/smoke-queries.ts:26-33`; kryterium zaliczenia: `tooling/restore-drill/src/run-drill.ts:182` |
| **dowód** | Workflow: `printf -- '-- T-122 quarterly restore drill empty baseline\n' > "$DRILL_DUMP_PATH"` — to cała „kopia zapasowa": jedna linia komentarza SQL. Zapytanie `placeholder_r13_rls` liczy wiersze w `pg_policies` dla `('lot','work_order','quality_event','shipment','bom_item')` i wymaga `>= 5`; te pięć tabel usuwa `packages/db/migrations/404-drop-dead-tables-p7.sql:8-12`, więc zapytanie zwróci 0. `run-drill.ts:182`: `const passed = report.smokeResults.every((result) => result.passed);` → cała próba wypada na `false`. Harmonogram: `cron: '0 5 1 */3 *'` (raz na kwartał), więc porażka jest cicha między przebiegami |
| **korzyść** | Jedyny mechanizm weryfikacji odtwarzania po awarii albo zaczyna cokolwiek weryfikować, albo przestaje udawać, że istnieje. To najbardziej kosztowna klasa błędu w całym raporcie — „mamy kopie zapasowe, sprawdzamy je co kwartał" jest dziś nieprawdą na dwa niezależne sposoby |
| **koszt** | S na usunięcie martwego zapytania kontrolnego · M na podpięcie prawdziwego zrzutu produkcyjnego |
| **ryzyko** | Brak ryzyka regresji — nic działającego nie zostanie zepsute |
| **zależy od** | — |

### A2-21 · Migracja 549 leży na dysku, ale nie jest w gicie

| pole | treść |
|---|---|
| **co** | W katalogu migracji jest plik, którego nie ma w repozytorium. Jeśli został zastosowany na czyjejś bazie, jego skutków nie odtworzy ani CI, ani build Vercela |
| **gdzie** | `packages/db/migrations/549-site-id-pre-gate-repair.sql` |
| **dowód** | `find packages/db/migrations -name "549-*"` → plik istnieje. `git ls-files packages/db/migrations | grep 549` → **pusto**. `git log -- <ścieżka>` → brak historii. `git status --short` pokazuje go jako `??`. Sąsiednia, zacommitowana migracja `550-production-site-id-backfill.sql` operuje na tym samym obszarze (`migration_550_site_candidates`), więc 549 wygląda na świadomy krok przygotowawczy, a nie na przypadkowy plik |
| **korzyść** | Domknięcie łańcucha migracji. Dziś stan bazy zależy od tego, na której maszynie uruchomiono `db:migrate` |
| **koszt** | S (zacommitować albo usunąć — po ustaleniu, czy została gdzieś zastosowana) |
| **ryzyko** | **Nie usuwać w ciemno.** Jeśli plik został już zastosowany na produkcji, jego brak w łańcuchu oznacza, że baza CI i baza produkcyjna nigdy nie będą identyczne — i A2-04 (wzorzec dryfu) nigdy nie da się domknąć |
| **zależy od** | — · blokuje A2-04 |

---

## GRUPA 3 — `apps/worker`

### A2-12 · `apps/worker` nie jest wdrażany; cztery zadania nie mają odpowiednika w cronach Vercela

| pole | treść |
|---|---|
| **co** | Worker to długożyjący proces Node uruchamiany przez `tsx`. Wdrożenie tego repo to Vercel (Next.js). Cztery z sześciu zadań workera nie mają odpowiednika w trasach cron aplikacji — czyli nie wykonują się nigdzie |
| **gdzie** | `apps/worker/src/index.ts:74-79` (rejestracja 6 zadań) vs. `apps/web/vercel.json` (`crons`, 6 tras) |
| **dowód** | Zadania workera: `backup-verification-cron`, `allergen-cascade-rebuild`, `compliance-docs-expiry`, `d365-cache-sync`, `outbox-consumer`, `gdpr-erasure-cron`. Crony Vercela: `drift`, `d365-pull`, `catch-weight-variance`, `outbox`, `reporting-refresh`, `pm-schedule-due`. Pokrywają się tylko outbox i D365. Grep na `runErasure` w `apps/web` → **0 trafień** (`@monopilot/gdpr` jest importowany w `packages/db/src/erasure/npd.ts:26`, ale dyspozytor `runErasure` woła wyłącznie `apps/worker/src/jobs/gdpr-erasure-cron.ts`). `apps/web/app/(admin)/gdpr/_actions/redact-user.ts` robi własny SQL i **nie używa rejestru domen** — komentarz w linii 8 mówi, że powiela ciało migracji 115. Podobnie `queue_allergen_cascade_rebuild` jest odsączane tylko przez `apps/worker/src/jobs/allergen-cascade-rebuild.ts` (drugi konsument to martwy `packages/cascade-engine/src/bulk-rebuild.ts`). Rozmiar: `apps/worker/src` = **3 860 linii** |
| **korzyść** | Albo −3 860 linii, albo — jeśli te zadania mają działać — **zamknięcie realnej dziury zgodności (usuwanie danych RODO nie wykonuje się nigdzie)** i luki operacyjnej (weryfikacja kopii zapasowych, wygasanie dokumentów zgodności) |
| **koszt** | S na decyzję; M na przeniesienie 4 zadań do tras cron; L na postawienie osobnego hosta |
| **ryzyko** | **To nie jest czysta pozycja „martwy kod" — to pytanie o zgodność.** Zanim ktokolwiek usunie workera, właściciel musi potwierdzić, że kolejka usunięć RODO faktycznie nie ma wykonawcy |
| **zależy od** | — |
| **nie sprawdzone** | Czy poza Vercelem istnieje inny host (VPS, launchd, kontener) uruchamiający `pnpm --filter @monopilot/worker start`. W repo nie ma na to śladu (brak Dockerfile, `fly.toml`, `railway.json`, jednostki systemd) |

---

## GRUPA 4 — zależności

### A2-13 · Importy międzypakietowe po ścieżce względnej omijają `package.json` (88 wystąpień)

| pole | treść |
|---|---|
| **co** | Kod sięga do sąsiednich pakietów przez `../../packages/<nazwa>/src/...`, zamiast przez nazwę pakietu. `package.json` przestaje być prawdą o zależnościach — to dokładnie ta klasa błędu, którą w tym repo wywołał kiedyś niezadeklarowany `resend` |
| **gdzie** | Rozkład trafień: `packages/db/` 41, `packages/auth/` 18, `packages/ui/` 10, `packages/rbac/` 8, `packages/outbox/` 7, `packages/schema-driven/` 1, `packages/rule-engine/` 1, `packages/rate-limit/` 1. Przykłady jednokrotne: `apps/web/proxy.ts:14` → `'../../packages/rate-limit/src/index.js'`; `apps/web/app/api/internal/cron/outbox/route.ts:62` → `'../../../../../../../packages/rule-engine/src/dispatch'`; `apps/web/app/(settings)/schema/_actions/draft.ts:23` → `'../../../../../../packages/schema-driven/src/actions/draft.js'` |
| **dowód** | `grep -roE "from '[^']*packages/[a-z-]+/"` po `apps`, `packages`, `tooling`, `scripts` → 88 trafień w powyższym rozkładzie. Skutek uboczny, na który się nadziałem sam: pierwszy przelot po `@monopilot/<nazwa>` pokazał `rule-engine` i `rate-limit` jako pakiety bez konsumenta — **to były fałszywe alarmy**, znalezione dopiero po dołożeniu skanu ścieżek względnych |
| **korzyść** | `package.json` znowu opisuje rzeczywistość; `pnpm` może zbudować poprawny graf; znika ryzyko „działa lokalnie, pada na Vercelu" |
| **koszt** | M (88 importów + uzupełnienie deklaracji) |
| **ryzyko** | Niskie mechanicznie; trzeba sprawdzić, czy `next.config.mjs` (`transpilePackages`) obejmuje pakiety, które przestaną być importowane po ścieżce |
| **zależy od** | — |

### A2-14 · `@monopilot/reference` — pakiet, który nie istnieje, rozwiązywany aliasem

| pole | treść |
|---|---|
| **co** | Kod importuje `@monopilot/reference`, ale w workspace nie ma takiego pakietu. Działa wyłącznie dzięki mapowaniu ścieżek w `tsconfig` i aliasowi vitesta, wskazującym na katalog `lib/reference` poza workspace |
| **gdzie** | Import: `packages/schema-runtime/src/compile.ts:3`. Aliasy: `packages/schema-runtime/tsconfig.json:17` i `packages/schema-runtime/vitest.config.ts:7` → `../../lib/reference/index.ts` |
| **dowód** | `find . -maxdepth 2 -type d -name reference` → tylko `./lib/reference` (nie jest w `pnpm-workspace.yaml`). `@monopilot/reference` nie występuje w żadnym `package.json`. Ten sam alias **nie istnieje** w `apps/worker`, choć `apps/worker/eslint.config.mjs:15` każe importować `RefTables` właśnie z `@monopilot/reference` — a osiem innych konfiguracji eslinta (`packages/auth`, `outbox`, `rbac`, `schema-driven`, `schema-runtime`, `server`, `e-sign`, `apps/web`) każe importować z `'lib/reference'`. **Dwie sprzeczne instrukcje w regułach lintu tego samego repo** |
| **korzyść** | Znika import, który przetrwa tylko dopóki nikt nie uruchomi tego kodu poza `tsc`/`vitest`; ujednolicenie komunikatu reguły |
| **koszt** | S (zrobić z `lib/reference` normalny pakiet workspace albo zamienić import na względny) |
| **ryzyko** | Niskie — `packages/schema-runtime` i tak nie ma dziś konsumenta produkcyjnego |
| **zależy od** | — |

### A2-15 · Zależności zadeklarowane i nieimportowane

| pole | treść |
|---|---|
| **co** | Pakiety ciągną zależności, których żaden ich plik nie importuje |
| **gdzie / dowód** | Skan importów (`import … from`, `require()`, `import()`, `vi.mock`) we wszystkich plikach `.ts/.tsx/.mjs/.js` każdego pakietu: <br>• `packages/observability` — `@opentelemetry/sdk-trace-node`, `@opentelemetry/semantic-conventions`, `pino-pretty` <br>• `packages/sync-queue` — `idb-keyval`, `uuid`, `@vitest/ui` <br>• `packages/e-sign` — `argon2` (ciężka zależność natywna, na liście `onlyBuiltDependencies`) <br>• `packages/gdpr` — `zod`, `@monopilot/db` (oba w `peerDependencies`/`dependencies`) <br>• `packages/rbac`, `packages/rule-engine`, `packages/schema-driven` — `@monopilot/db` <br>• `packages/rule-engine` — `@types/pg` w `dependencies` zamiast `devDependencies` <br>• `packages/schema-runtime` — `json-schema-to-zod` <br>• `apps/worker` — `@monopilot/gdpr`, `@monopilot/server` (worker importuje `gdpr` tylko pośrednio przez `packages/db`) <br>• `packages/db` — `@testcontainers/postgresql` <br>• `apps/web/package.json:27` — `@monopilot/queries` (patrz A2-01) |
| **korzyść** | Krótszy `pnpm install`, mniejszy lockfile, mniej fałszywych alertów bezpieczeństwa. `argon2` i `@testcontainers/postgresql` to najcięższe pozycje |
| **koszt** | S |
| **ryzyko** | **Skan importów nie widzi zależności wskazywanych łańcuchem znaków w konfiguracji.** Tak wypadły z listy `storybook`/`@storybook/addon-*` (`packages/ui/.storybook/main.ts:9-11`), `jsdom` (`environment` w konfiguracji vitesta) i `axe-core`. Każdą pozycję z listy wyżej **potwierdzić grepem po nazwie w plikach konfiguracyjnych**, zanim się ją usunie. Osobno: `@opentelemetry/sdk-trace-node` bywa ładowany dynamicznie przez `@opentelemetry/sdk-node` |
| **zależy od** | — |

### A2-16 · Brakujące deklaracje (importowane, niezadeklarowane)

| pole | treść |
|---|---|
| **co** | `packages/ui/test/Modal.a11y.test.ts` importuje `playwright`, którego `@monopilot/ui` nie deklaruje |
| **gdzie** | `packages/ui/test/Modal.a11y.test.ts` (import `playwright`); `packages/ui/package.json` — brak w `dependencies` i `devDependencies` |
| **dowód** | Skan importów kontra zadeklarowane klucze. Działa tylko dlatego, że `playwright` jest w `devDependencies` korzenia (`package.json:33`) i pnpm hoistuje go do korzeniowego `node_modules` |
| **korzyść** | Odporność na zmianę strategii hoistingu pnpm |
| **koszt** | S |
| **ryzyko** | Brak |
| **zależy od** | — |

### A2-17 · Siedem `tsconfig.json` nie dziedziczy z bazy — ten sam plik daje różne wyniki w różnych pakietach

| pole | treść |
|---|---|
| **co** | `tsconfig.base.json` ustala `module: NodeNext` / `moduleResolution: NodeNext`. Siedem pakietów nie rozszerza bazy i używa `bundler`, dwa rozszerzają, ale nadpisują na `Bundler`. Skutek: bramka typów w tych pakietach jest zielona przy kodzie, który nie skompiluje się u konsumenta |
| **gdzie** | Bez `extends`: `packages/domain`, `packages/gdpr`, `packages/ops`, `packages/rule-engine`, `packages/schema-runtime`, `packages/ui`, `tooling/restore-drill`. Z `extends`, ale z nadpisanym `moduleResolution: Bundler`: `packages/outbox`, `packages/rate-limit` |
| **dowód** | `packages/gdpr/tsconfig.json` — `"moduleResolution": "bundler"`, brak `extends`. Jego `pnpm typecheck` kończy się kodem 0. Ten sam plik `packages/gdpr/src/index.ts` przepuszczony przez ustawienia bazowe daje **3 błędy TS2835** (linie 6, 7, 15). `@monopilot/gdpr` jest konsumowany przez `apps/worker`, który **dziedziczy z bazy** (`apps/worker/tsconfig.json` → `extends: ../../tsconfig.base.json`) |
| **korzyść** | Jedna reguła rozwiązywania modułów w całym repo; bramka typów przestaje kłamać |
| **koszt** | M |
| **ryzyko** | Ujednolicenie odsłoni błędy — patrz A2-05 |
| **zależy od** | — |

---

## GRUPA 5 — eksporty bez konsumenta

### A2-18 · Eksporty, do których nikt się nie odwołuje

Skan: dla każdego `export function|const|class|type|interface|enum` w `packages/*/src` policzyłem
wystąpienia nazwy w **całym repo** (`apps`, `packages`, `tooling`, `scripts`, `lib`), z podziałem na
kod produkcyjny / testy / wnętrze własnego pakietu.

| pakiet | eksportów | używane na zewnątrz (prod) | tylko testy | tylko wewnątrz pakietu | **nigdzie** |
|---|---|---|---|---|---|
| ui | 105 | 51 | 2 | 10 | **42** |
| db | 579 | 88* | 5 | 466 | **20** |
| domain | 39 | 22 | 0 | 3 | **14** |
| outbox | 29 | 7 | 3 | 6 | **13** |
| auth | 46 | 25 | 0 | 11 | **10** |
| rule-engine | 21 | 4 | 0 | 10 | **7** |
| ops | 5 | 1 | 0 | 0 | **4** |
| rbac | 34 | 19 | 0 | 12 | **3** |
| pozostałe | — | — | — | — | 0–2 każdy |

\* liczba `db` zawyżona — dopasowania po nazwach pospolitych (`items`, `users`, `product`, `roles`);
faktyczne importy z `packages/db/schema` spoza tego katalogu: **zero** (A2-03).

Przykłady z dowodem (pełne listy w sondzie, do odtworzenia jednym skanem):
- `packages/ops/src/drift-detect.ts:32,38,44,55` — `DriftDiff`, `DriftItem`, `DetectDriftOptions`,
  `DetectDriftResult`: 4 z 5 eksportów pakietu bez ani jednego odwołania.
- `packages/outbox/src/events.enum.ts:284,318,334,357,394,408,427,441` — osiem stałych
  `ALL_PRODUCTION_EVENTS` … `ALL_MULTI_SITE_EVENTS`, żadna nieużywana.
- `packages/domain/src/nutrition/compute-nutrition.ts:13-46` — 11 typów bez odbiorcy.
- `packages/auth/src/saml/relay-state.ts:6-21` i `saml/slo.ts:1-19` — cała powierzchnia typów SAML
  SLO bez odbiorcy; `revokeLocalSession` (`slo.ts:26`) wołany **wyłącznie z testu**.
- `packages/cascade-engine` — 1 eksport używany na zewnątrz (i to tylko w komentarzu), 8 tylko
  w testach, 14 nigdzie (spójne z A2-01).

| pole | treść |
|---|---|
| **korzyść** | Zwężenie publicznej powierzchni pakietów; mniej kodu do utrzymania przy refaktorach |
| **koszt** | M (rozproszone po 8 pakietach) |
| **ryzyko** | Niskie, ale **eksport typu nieużywany dziś bywa częścią kontraktu API** — przed usunięciem sprawdzić, czy nie jest to zaplanowany interfejs (SAML SLO wygląda na niedokończoną funkcjonalność, nie na śmieć) |
| **zależy od** | A2-01 (usunięcie 3 pakietów zdejmuje część listy) |

---

## Co sprawdziłem i **jest żywe** — nie marnujcie na to fal

1. **Duplikaty prefiksów migracji: są dokładnie dwa (238, 459) i nie powodują niedeterminizmu.**
   Przeliczyłem wszystkie 523 pliki: kolidują `238-npd-core-extra-fields` / `238-settings-scanner-devices`
   oraz `459-generate-sscc-validate-before-increment` / `459-yield-gate-override-reasons`. Runner
   (`packages/db/scripts/migrate.ts:87-91`) sortuje po prefiksie **i po nazwie pliku** — kolejność jest
   deterministyczna i powtarzalna. Zero nowych duplikatów.
2. **Runner migracji jest solidny.** Waliduje nazwy regexem, liczy sumę kontrolną, stosuje każdą
   migrację w transakcji, ma jawny (a nie cichy) mechanizm akceptacji dryfu sumy kontrolnej.
3. **`scripts/lint-use-server-exports.mjs` jest prawdziwą bramką i przechodzi.** Uruchomiłem:
   `No illegal exports in 397 'use server' modules`, kod wyjścia 0, `process.exit(1)` przy naruszeniu
   (linia 180). Jest w łańcuchu `pnpm lint`.
4. **Wszystkie 22 pakiety mają `eslint.config.mjs` i skrypt `lint`** — `pnpm -r lint` naprawdę
   obejmuje `packages/*` i `apps/worker`. Bez konfiguracji są tylko `tooling/eslint` i
   `tooling/eslint-rules` (to same narzędzia lintujące).
5. **`apps/worker` sam w sobie jest napisany porządnie.** `JobRegistry` (`src/registry.ts`) blokuje
   podwójną rejestrację, waliduje interwały, ma `AbortController` i wygaszanie; `src/index.ts:71`
   świadomie bierze połączenie systemowe (`getSystemActorConnection`), bo zadania działają
   międzyorganizacyjnie. Problemem jest wdrożenie, nie kod.
6. **Pakiety, które **mają** żywych konsumentów** (weryfikowane po imporcie, nie po `package.json`):
   `db`, `ui`, `auth`, `rbac`, `e-sign`, `domain`, `observability`, `outbox`, `gs1`, `validation`,
   `server`, `gdpr`, `ops`, `rate-limit`, `rule-engine`, `schema-driven`. Szesnaście z dwudziestu
   jeden — to zdrowy stosunek.
7. **`packages/gdpr` ma spójny rejestr domen** (`registry.ts` + `dispatcher.ts` + rejestracja
   w `packages/db/src/erasure/register-all.ts`). Problem to brak wykonawcy w produkcji (A2-12),
   a nie jakość samego pakietu.
8. **`tooling/eslint-rules` żyje**: reguła `no-direct-permissions-enum-edit` ma migawkę
   (`baselines/permissions.snapshot.json`), test i generator. Używa jej `packages/rbac`.
9. **`scripts/test-db.sh` (20 odwołań) i `scripts/e2e-local.sh` (48 odwołań)** są w powszechnym
   użyciu — nie ruszać.
10. **Wzorzec `advanceCohort` nie powtarza się na poziomie tabel.** Przeliczyłem pełny cykl życia
    każdej tabeli w 523 migracjach: 20 tabel ma stan końcowy `DROP`, 2 mają `RENAME`
    (`tenant_migrations` → `tenant_migrations_legacy_t038` w mig. 040, `product` → `product_legacy`
    w mig. 359). Odwołania w kodzie do skasowanych tabel znalazłem **tylko w dwóch plikach
    testowych** (A2-08 i A2-19 niżej) — żaden kod produkcyjny poza `apps/web` nie sięga do
    usuniętego obiektu.

### A2-19 (drobne) · Martwe ziarno + test, który go broni

`packages/db/seeds/eu-14-allergens.sql:4` zaczyna się od `insert into public.allergens (code, name,
name_pl, is_active)`. Tabela `public.allergens` została usunięta migracją
`402-drop-dead-public-allergens.sql:8` (jej komentarz mówi wprost: jedynym słownikiem alergenów jest
`"Reference"."Allergens"`). Ziarna nie da się już zastosować. Jednocześnie
`packages/db/__tests__/infra-master.test.ts:129` sprawdza, że ten plik **zawiera** tę instrukcję —
i przechodzi, bo czyta plik SQL z dysku, a nie bazę. Klasyczna para: martwy artefakt + zielony test,
który go zamraża. Koszt S, ryzyko brak.

---

## Propozycja fal — kryterium korzyść ÷ ryzyko

### Fala A2-I — „przestań kłamać o ochronie" (1 dzień, ryzyko niskie, korzyść największa)
Najpierw to, bo dopóki bramki kłamią, każda kolejna zmiana idzie na ślepo.

| poz. | dlaczego tu |
|---|---|
| **A2-21** migracja 549 poza gitem | **pierwsze zadanie w kolejności** — dopóki łańcuch migracji jest niekompletny, żaden wzorzec schematu nie ma sensu |
| **A2-04** wzorzec dryfu schematu | CI zapali się na czerwono przy pierwszym przebiegu po wczorajszej poprawce — lepiej zrobić to świadomie niż w panice |
| **A2-08** usunięcie `r13-business-tables.test.ts` | 17 testów wybuchnie w tym samym przebiegu; usunięcie jest bezkosztowe |
| **A2-20** kwartalna próba odtworzenia z kopii | ta sama migracja 404 wywala trzecią rzecz; naprawa to usunięcie jednego zapytania kontrolnego. Osobno: fakt, że próba odtwarza **pusty plik**, jest do zgłoszenia właścicielowi jeszcze przed falą |
| **A2-09** podpiąć 2 działające bramki, skasować 5 martwych | oba strażniki dziś przechodzą — podpięcie jest darmowe; usuwa nieprawdę z `_foundation/regulatory/README.md` |
| **A2-07** skrypt `test` w korzeniu | 5 plików testowych zaczyna cokolwiek robić |
| **A2-10, A2-19** martwe artefakty | −3 pliki wprowadzające w błąd |

**Efekt:** po tej fali zielone CI zaczyna coś znaczyć. Bez tego reszta fal jest niemierzalna.

### Fala A2-II — „decyzje właściciela" (nie do zlecenia, do rozstrzygnięcia)
Trzy pytania, na które nie znajdę odpowiedzi w kodzie. Każde blokuje pozycję z dużym zyskiem.

1. **Kto uruchamia usuwanie danych RODO?** (A2-12) Jeśli nikt — to nie dług techniczny, tylko
   dziura zgodności; zadanie idzie do tras cron w tym tygodniu.
2. **Czy `cascade-engine` jest porzucony, czy niepodłączony?** (A2-01) Jest w PRD i w skillu.
   „Porzucony" → −2 556 linii. „Niepodłączony" → to zadanie budowlane, nie sprzątanie.
3. **Czy model Drizzle ma wrócić do użycia?** (A2-03) Jeśli nie — −11 248 linii i koniec dryfu
   drugiego opisu schematu.

### Fala A2-III — „usuń to, co bezsporne" (1–2 dni, ryzyko niskie)
Po decyzjach z fali II.

`A2-01` (co najmniej `storage` + `queries`, bezsporne) · `A2-02` sync-queue ·
`A2-15` nieużywane zależności · `A2-11` Storybook · `A2-16` brakująca deklaracja `playwright`.
**Efekt:** ~2 300 linii mniej, lżejszy `pnpm install`.

### Fala A2-IV — „przywróć bramkę typów" (2–3 dni, ryzyko średnie: CI będzie czerwone w trakcie)
`A2-17` ujednolicić `moduleResolution` → `A2-05` `tsconfig` + skrypt `typecheck` do 15 pakietów →
`A2-14` `@monopilot/reference`. Kolejność jest wiążąca: bez A2-17 A2-05 daje różne wyniki w różnych
pakietach.

### Fala A2-V — „higiena" (bez pilności)
`A2-13` importy względne → nazwy pakietów (88 miejsc) · `A2-18` zwężenie eksportów ·
`A2-06` `HARDCODED_STRINGS_MODE=error` z listą wyjątków (911 naruszeń to osobny projekt).

---

## Czego nie zdążyłem sprawdzić

1. **Nie uruchomiłem żadnej suity testowej.** Nie dostałem bazy w zleceniu, a wszystkie zajęte były
   przypisane innym torom. Twierdzenia o `r13-business-tables.test.ts` (A2-08) opierają się na
   analizie statycznej łańcucha migracji, nie na obserwowanym wybuchu. Jest to sprawdzalne jednym
   przebiegiem `pnpm --filter @monopilot/db test` z `DATABASE_URL`.
2. **Nie sprawdziłem, czy `apps/worker` ma hosta poza Vercelem.** Nie znalazłem `Dockerfile`,
   `fly.toml`, `railway.json` ani jednostki systemd, ale nieobecność w repo nie dowodzi
   nieobecności w infrastrukturze.
3. **Kolumny-sieroty przeanalizowałem tylko dla jawnych `drop column` (9 wystąpień) i dla dwóch
   zmian nazw tabel.** Nie zbudowałem pełnego modelu kolumn z 523 migracji — do tego trzeba
   postawić bazę i porównać `information_schema` z odwołaniami w kodzie. **Klasa „`advanceCohort`
   na poziomie kolumny" pozostaje niedomknięta.**
4. **Nie zweryfikowałem, czy `@opentelemetry/sdk-trace-node` nie jest ładowany dynamicznie**
   przez `@opentelemetry/sdk-node` (A2-15).
5. **Nie policzyłem realnego czasu CI** oszczędzonego przez każdą pozycję — nie mam dostępu do
   historii przebiegów GitHub Actions. Z tego samego powodu **nie potwierdziłem, że kwartalna
   próba odtworzenia z kopii (A2-20) faktycznie kończy się porażką** — twierdzenie opiera się na
   analizie kodu, nie na obserwowanym przebiegu.
6. **Nie zweryfikowałem zależności wskazywanych łańcuchem znaków w konfiguracji** poza tymi,
   które sam wyłapałem po fakcie (Storybook, `jsdom`). Lista z A2-15 wymaga jeszcze jednego
   przejścia grepem po plikach `*.config.*`.
7. **`packages/db/seeds/` i `packages/db/migrations/__verify__/` przeszedłem tylko pod kątem
   19 tabel skasowanych migracjami** (wynik: jedno trafienie — A2-19; trafienia w `__verify__`
   to nazwy kolumn, nie tabel). **Nie sprawdziłem, czy pozostałych 11 plików ziarna jest w ogóle
   stosowanych** — żaden skrypt w `package.json` ich nie uruchamia, ale nie prześledziłem, czy
   robią to same migracje.
