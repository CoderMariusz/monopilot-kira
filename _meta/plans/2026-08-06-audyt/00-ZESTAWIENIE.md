# 00 — ZESTAWIENIE ZBIORCZE

Audyt 2026-08-06 · synteza z **12 raportów** (A1, A2, B1, B2, C1, C2, D1, D2, E1, E2, F1, F2)
· **112 pozycji roboczych + 10 jawnie odrzuconych** · nic nie naprawiono, nic nie zacommitowano.

Rozkład: Warstwa 1 — 14 · W2 — 28 · W3 — 13 · W4 — 3 · W5 — 6 · W6 — 5 · W7 — 6 ·
W8 (👤 decyzje) — 10 · W9 (duże, później) — 27.

---

## 1. Teza

> **To repozytorium nie ma problemu z brakiem rozwiązań — ma problem z tym, że rozwiązania
> już w nim są, tylko wyłączone, skopiowane zamiast zaimportowane, albo pilnowane przez
> bramkę, która nie umie się zaczerwienić.**

Cztery liczby, które to niosą, każda z innego toru:

- **Sentry, OpenTelemetry i PostHog są napisane i skonfigurowane** — `vercel env ls production`
  pokazuje 15 zmiennych i **ani jednej** `SENTRY_*` / `POSTHOG_*` / `OTEL_*` (E2).
- **Jedyny w repo wzór na sumę z księgi magazynowej istnieje** — jako `const` wewnątrz pliku
  testowego, w jednym z **42 z 43** plików `.pg.test.ts`, które bez `DATABASE_URL` cicho się
  pomijają (F2).
- **Skrypt izolujący tory (worktree + osobna baza) jest napisany i zapomniany** —
  `_meta/runs/launch-batch.sh`, przy `scripts/test-db.sh` z pulą **trzech** klonów na
  kilkanaście torów (F1).
- **`pnpm -r typecheck` melduje kod wyjścia 0 po skompilowaniu 10 z 23 projektów** —
  odtworzone sondą: wstawiony błąd typu, exit 0 (D1).

A na wierzchu: **100 na 100 ostatnich przebiegów CI na `main` to `failure`**, i w całym
katalogu `.github/` nie ma ani jednego odwołania do `ntfy|slack|notif|webhook|discord|telegram`
(E2). Nie było komu powiedzieć.

---

## 2. Jak czytać tabelę

Uszeregowane wg **korzyść ÷ ryzyko**, nie wg łatwości. Pogrupowane w warstwy, żeby dało się
ciąć na granicy warstwy, a nie w środku.

| oznaczenie | znaczenie |
|---|---|
| 🔒 | **musi wejść jednym commitem** z pozycją wskazaną w „zależy od" |
| ⚠️ | pozycja **niepewna albo częściowa** — tor sam się do tego przyznaje |
| 👤 | **decyzja właściciela**, nie zadanie dla programisty |
| ✌️ | **dwa lub więcej torów niezależnie** — najmocniejszy sygnał w materiale |

Koszt: **S** ≤ dzień · **M** ≤ kilka dni · **L** = osobna kampania.

---

## 3. Tabela pozycji

### Warstwa 1 — odblokowuje wszystko inne (rób najpierw)

Dziś **trzy joby CI nie mają jak wystartować**, a suita, która ma dowodzić poprawności, nie
uruchamia się. Każda pozycja poniżej Warstwy 1 jest **niemierzalna**, dopóki to nie stoi.

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **A2-21** 🔒 | migracja 549 leży na dysku, **nie ma jej w gicie** (`git ls-files` → pusto) | `packages/db/migrations/549-site-id-pre-gate-repair.sql` | domknięcie łańcucha migracji; bez tego wzorzec schematu nie ma sensu | S | **nie usuwać w ciemno** — jeśli zastosowana na prodzie, baza CI ≠ prod na zawsze | — · **blokuje A2-04** | A2 |
| **A2-04** ✌️🔒 | wzorzec dryfu schematu z **11.06, ~mig 197**, przy 564 w repo; `diff` = **55 512 linii**, bramka trwale czerwona | `packages/db/__expected__/schema.sql` (22 501 linii) | odblokowuje `migration-check` → `playwright` → `storybook-build` (3 joby) | M | **największe ryzyko to zrobić to źle** — regeneracja z produkcji zalegalizuje wszystko, co ktoś dodał ręcznie. Tylko z czystej bazy + pełny łańcuch | A2-21 | A2-04 · D2-M1/L6 |
| **A2-08** 🔒 | 17 testów integracyjnych celuje w 5 tabel skasowanych migracją 404 | `packages/db/__tests__/r13-business-tables.test.ts` (615 linii) | usunięcie miny, która wybuchnie w pierwszym zielonym przebiegu od 3 miesięcy | S | brak — tabele nie istnieją | A2-04 (ten sam przebieg) | A2 |
| **A2-20** ✌️🔒 | „próba odtworzenia z kopii" odtwarza **pusty plik** (`printf -- '-- …' > dump`) i sprawdza polityki RLS na tabelach z mig 404 | `.github/workflows/restore-drill.yml:52-55`, `tooling/restore-drill/src/smoke-queries.ts:26-33` | „mamy kopie i sprawdzamy je co kwartał" przestaje być nieprawdą **na dwa niezależne sposoby** | S (zapytanie) / M (prawdziwy zrzut) | brak regresji | A2-04 | A2-20 · D2-M9 |
| **D2-M7** 🔒 | `pnpm -r test` bez `--no-bail`; `apps/web` jest **ostatni** w kolejności → jedna czerwień w dowolnym pakiecie kasuje całą suitę web | `.github/workflows/ci.yml:136` | dopiero wtedy wiadomo, ile naprawdę jest czerwone | S (flaga) | raport CI będzie brzydszy — **to jest cel** | ↔ C2-4 | D2 |
| **C2-4** ✌️🔒 | suita UI (**418 plików / 3 588 testów**) nie chodzi wcale, bo poprzedza ją `&&` po czerwonej suicie node | `apps/web/package.json:11` | 3 588 testów wraca; **38 czerwonych, dziś niewidocznych dla nikogo** | S | CI natychmiast bardziej czerwone — **to ujawnienie, nie regresja**; zapowiedzieć, żeby ktoś tego nie „naprawił" cofnięciem | ↔ D2-M7 | C2-4 · D2-M8 · F2-2c |
| **E1-2** 🔒 | dokumentacja jakości uczy komendy, która uruchamia **zero** testów (brak `exec`, zła nazwa pakietu) | `MON-t4-test:55,56,194,195` · `MON-t3-ui:192` · `docs/workflow/02-QUALITY-GATES.md:20` | zamyka pętlę „skill uczy zepsutej komendy → 0 testów → `\| tail` daje rc=0 → meldunek zielony" | S (6 linii) | brak | 🔒 **z E1-1** | E1 |
| **E1-1** 🔒 | hook `PreToolUse`/Bash blokujący 6 zmierzonych pułapek narzędziowych, każda blokada z działającym zamiennikiem | `.claude/hooks/bash-guard.sh` (nowy) | 3–6 h/tydz. pilnowania; działa też w subagencie, który nie czytał `CLAUDE.md` | S | fałszywe blokady; **sam hook zacznie blokować komendę, której uczy skill** → dlatego jeden commit z E1-2 | 🔒 **z E1-2** · sprawdzić, czy nie przesłania globalnego `rtk hook claude` | E1 |
| **E2-3.1** | powiadomienie ntfy przy czerwonym `main`; kanał już stoi, publikacja zweryfikowana (HTTP 200) | nowy job w `ci.yml`, `if: failure()` | **CI było czerwone 100/100 i nikt się nie dowiedział** — to jest cała przyczyna | S (~10 linii YAML) | ~zero; temat w sekrecie repo, nie w YAML | — | E2 |
| **A2-07** | 5 plików testowych leży **poza workspace** — `pnpm -r` pomija korzeń, korzeń nie ma skryptu `test` → nigdy się nie uruchomiły | `scripts/*.test.*`, `_foundation/__tests__/`, `lib/reference/__tests__/` | 5 plików zaczyna cokolwiek chronić; wśród nich strażnik konfiguracji pakietów | S | możliwe, że któryś od razu padnie | — | A2 |
| **A1-01** ✌️ | duplikat suity w `apps/web/apps/web/` zamieniony na atrapę **zamiast usunięty** — te same 14 testów liczą się dwa razy (28 = 14×2), **oba pliki czerwone** | `apps/web/apps/web/tests/settings-wiring-contract.test.ts:1` | uczciwa liczba testów w CI, jedna czerwień zamiast dwóch | S | ~zero | — | A1-01 · C2 |
| **A2-09** | 7 skryptów wygląda jak strażnicy, **nikt ich nie woła**; dwa z nich **przechodzą dziś** → podpięcie darmowe. `_foundation/regulatory/README.md:16` twierdzi, że bramka blokuje CI — nieprawda | `scripts/check-{domain-glossary,regulatory-staleness,markers}.mjs` i 4 dalsze | 2 darmowe bramki + usunięcie kłamstwa z README | S | brak — zweryfikowane uruchomieniem | — | A2 |
| **E1-8** | `.agents/skills/` — **trzeci, rozjechany katalog skilli** poza gitem, 10 różniących się `SKILL.md`; `MON-INDEX` deklaruje 21 skilli/4400 linii przy 28/5607 | `.agents/skills/`, `.claude/skills/MON-INDEX.md` | ta sama klasa co `_meta/i18n-staging` (trzeci katalog tłumaczeń, który już raz położył ~20 modułów) | S | brak | — | E1 |
| **F1-5** | `permissions.deny` ma strażników **tylko na `git push`**; zagarnięcie cudzej pracy przyszło przez `git add` | `.claude/settings.json` | działa niezależnie od tego, co agent sobie pomyślał | S (2 linie) | ⚠️ niezweryfikowane, czy `deny` bije `defaultMode: bypassPermissions` w 2.1.221 — E1 twierdzi z dokumentacji, że tak | — | F1 · E1 |

### Warstwa 2 — darmowe wygrane (S, zero decyzji, ryzyko bliskie zeru)

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **B1-A4** | `toMicro` w 4 kopiach, **3 bez strażnika wejścia** — rzucają `SyntaxError` na `'1e-7'` i `TypeError` na `null` | `transfer-orders/_actions/actions.ts:861`, `to-conservation.ts:6`, `register-output.ts:197` | ścieżka zachowania ilości przestaje móc paść na złym wejściu. B1: **„najlepszy stosunek korzyści do ryzyka w całym raporcie"** | S | niskie — zmiana ściśle rozszerzająca | — | B1 |
| **B1-A0a** | `negateDecimalString` — **4 kopie bajt w bajt identyczne**, 5 linii każda | `corrections-actions.ts:208`, `receipt-corrections-actions.ts:157`, `reverse-consume/route.ts:87`, `upsert-wac.ts:562` | zdejmuje 1 z 4 mechanizmów wyznaczania znaku ruchu | S | **zerowe** (ciała identyczne) | — | B1 |
| **F2-4** ✌️ | `CHECK (site_id is not null) NOT VALID` na 5 tabelach — nowe wiersze bez zakładu przestają powstawać **natychmiast**, istniejące nieskanowane | `license_plates`, `lp_state_history`, `work_orders`, `wo_events`, `wo_outputs` | rozcina zakleszczenie: bramka 551 przestaje być warunkiem wstępnym czegokolwiek. F2: **„najlepszy stosunek zysku do kosztu w całym zestawie — jedna godzina"** | S (~1 h, 15 linii) | ścieżka „WO bez zakładu" zacznie rzucać; kolizja z `ON DELETE SET NULL` (mig 334) → kasowanie zakładu zacznie odmawiać (**poprawnie**, ale to zmiana zachowania) | ⚠️ policzyć **świeżym `SELECT`** (7 / 11 / 25 / 37 to cztery różne pomiary z różnych baz) | F2 · D2-Ż7 · C1-3 |
| **F2-6** | `validation_result` to `text not null` **bez żadnego `CHECK`**, a tabela to dowód BRCGS z 7-letnią retencją; ten sam werdykt ATP **istnieje już jako trigger** na `lab_results` (mig 187) i to kopia w TypeScripcie pękła | `allergen_changeover_validations` | wiersz `passed` + `atp_evidence='FAIL'` staje się **niezapisywalny** | S (~30 min) | ⚠️ niskie, ale **to nie jest naprawa klasy** — lista tokenów będzie dryfować; `negative`/`negatywny` świadomie pominięte (w mikrobiologii znaczy CZYSTO) | — | F2 |
| **B1-C1a** | `.modal-body` nie ma `min-height: 0` → w kolumnie flex stopka wyjeżdża poza `max-height: 86vh`. Defekt naprawiony w komponencie kanonicznym, **nienaprawiony w CSS, z którego korzysta 46 kopii** | `apps/web/app/globals.css:497` | jedna deklaracja CSS zamyka defekt na **46 ekranach** | S | niskie, ale dotyka 46 ekranów naraz — **wymaga przeglądu w przeglądarce, nie tylko testu** | — | B1 |
| **B2-03** | `apps/web/tsconfig.json` **nie ma sekcji `paths`** → 1 586 importów z ≥5 poziomami `../`, rekordy po 10 poziomów | `tsconfig.base.json:9-14` | znika klasa „policzyłem o jeden za mało i trafiłem w cudzy moduł". **Odblokowuje B2-02 i B2-04** | S (alias) / L (migracja, opcjonalna i przyrostowa) | niskie — `moduleResolution: NodeNext`, sprawdzić `next build`, nie sam `tsc` | — | B2 |
| **C2-1** | `@zxing` ładowany zachłannie na 11 ekranach skanera, choć kamera otwiera się dopiero po kliknięciu | `camera-scanner-overlay.tsx:33-34` + 9 ekranów | **89 kB brotli z 123 kB = 72 % paczki**; trasa 3× cięższa od mediany, jedyna używana na telefonie w hali | S | niskie, ale realne: pierwsze otwarcie kamery czeka na 89 kB (łagodzić prefetchem na `onPointerDown`); testy mockują `@zxing/browser` → mock musi trafić w leniwy import | — | C2 |
| **B1-C2** | `ONBOARDING_STEPS` w 6 kopiach klienckich tego samego kreatora, **jedna już rozjechana** (`warehouse-client.tsx` zna cele przekierowania, pozostałe pięć nie); trzy różne typy → **TypeScript tego nie łapie** | `app/onboarding/*/_components/*-client.tsx` (~330 linii) | pasek postępu przestaje zależeć od tego, na której stronie kreatora stoi użytkownik | S | niskie; `warehouse-client.tsx` jest nadzbiorem | — | B1 |
| **D1-09** | 18 rezolwerów etykiet humanizuje brakujący klucz, **jeden zwraca całą ścieżkę z kropkami** | `planning/suppliers/_components/supplier-labels.ts:49` | zdejmuje minę; **dziś nie strzela** (0 braków w 130 sprawdzonych ścieżkach), uzbroi się przy pierwszym nowym kluczu | S (1 linia) | żadne | — | D1 |
| **D1-03** | `deactivateEquipment` wyłącza maszynę **i** jej harmonogramy przeglądów; `reactivateEquipment` włącza **tylko maszynę** — maszyna wraca do produkcji bez profilaktyki, żaden ekran o tym nie mówi | `maintenance/assets/_actions/asset-actions.ts:278` vs `:317-324` | w zakładzie mięsnym pominięty przegląd to ścieżka do awarii na linii | S | ślepe `set active = true` **wskrzesi** harmonogramy wyłączone ręcznie z innego powodu → wersja ze znacznikiem | — | D1 |
| **E2-3.2** | włączyć `SENTRY_DSN` na produkcji — kod jest napisany, przetestowany, ma `redactBeforeSend`; **6 cronów chodzi co noc bez żadnego raportowania błędów** (owner miał już awarię crona, przeszła niezauważona) | `apps/web/sentry.*.config.ts` | **zero zmian w kodzie** | S | ⚠️ warunek wstępny: **sprawdzić, co dokładnie czyści `redactBeforeSend`** przed wysyłaniem śladów z danymi produkcyjnymi na zewnątrz | E2 §5 pkt 5 | E2 |
| **A1-05** | 9 funkcji `*Core` eksportowanych z modułu `'use server'`, używanych **wyłącznie wewnątrz pliku** — Next zamienia każdy taki eksport w publiczną akcję serwerową przyjmującą kontekst organizacji od wołającego | `reporting/_actions/report-read-actions.ts:172,225,455,574,709,828,924,1030` | 9 publicznych endpointów mniej, jednym słowem | S | niskie; bramka lintu tego **nie łapie z założenia** (luka w zakresie, nie błąd bramki) | — | A1 |
| **F2-2d** | 3 poprawki w jednej linii CI playwrighta: `PLAYWRIGHT_BASE_URL` (serwer na 3000, konfiguracja na 3100), `--config=../../playwright.config.ts` (`apps/web` nie ma własnej), **cudzysłów wokół globu** (`e2e/**/*.spec.ts` bez `globstar` → `e2e/*/*.spec.ts`) | `.github/workflows/ci.yml` | **11 plików z 381 testów** przestaje być całym pokryciem E2E; wśród niewykonywanych `scanner-rbac-org-scoping` i `scanner-isolation` | S | niskie | A2-04 (playwright i tak nieosiągalny) | F2 |
| **A1-08** | 12 plików bez ani jednego importera | m.in. `lib/cascade/manufacturing-ops-lookup.ts`, `lib/technical/routing/service.ts`, `components/app/_components/user-menu-language-picker.tsx` | −12 plików | S | ⚠️ **wyjąć `components/settings/modals/vitest.config.ts`** — jest martwy jako konfiguracja, ale 8 testów modali chodzi bez aliasu `@radix-ui/react-dialog`, który on dokłada. **Czy je to psuje — niesprawdzone** | — | A1 |
| **A2-10** | `scripts/cron.json` — nieużywana i **sprzeczna** kopia harmonogramu (`0 6 * * *` vs `0 2 * * *` w `vercel.json`); `combined-migrations.sql` — zamrożony zlepek z constraintem na kolumnie usuniętej mig 040 (to on wygenerował martwe `advanceCohort`) | `scripts/` | −2 pliki wprowadzające w błąd, w tym jeden z udowodnioną szkodą | S | brak | — | A2 |
| **A2-19** | `eu-14-allergens.sql` wstawia do `public.allergens`, skasowanej mig 402; test **sprawdza, że plik zawiera tę instrukcję** i przechodzi, bo czyta plik z dysku | `packages/db/seeds/`, `__tests__/infra-master.test.ts:129` | klasyczna para: martwy artefakt + zielony test, który go zamraża | S | brak | — | A2 |
| **A2-02** | `@monopilot/sync-queue` deklaruje wejście `./dist/index.js`, a jego `build` to `tsc --noEmit` — `dist/` nie istnieje. Jedyny konsument importuje po ścieżce względnej. Jedyny pakiet **bez `"private": true`** | `packages/sync-queue/package.json:7-12,16` | usunięcie pułapki „działa w teście, pada w apce" | S | niskie — offline-queue nie jest podpięte do UI | — | A2 |
| **A2-16** | `packages/ui/test/Modal.a11y.test.ts` importuje `playwright`, którego `@monopilot/ui` nie deklaruje — działa tylko przez hoisting pnpm | `packages/ui/package.json` | odporność na zmianę strategii hoistingu | S | brak | — | A2 |
| **A2-11** ✌️ | `storybook-build` ma `continue-on-error` gdy `storybook --version` nie startuje — czyli **wyłącza się dokładnie w scenariuszu, w którym jest potrzebny** | `.github/workflows/ci.yml:255-263` | bramka albo blokuje, albo znika z CI | S | brak. **Sprostowanie:** sam Storybook żyje (20 `*.stories.tsx`) — hipoteza „zależności nieużywane" jest fałszywa, dodatki wskazywane łańcuchem znaków | A2-04 (job nieosiągalny) | A2-11 · D2 zał. B |
| **C1-3** | 3 polityki widoczności zakładu zostały w per-wierszowym kształcie `app.user_can_see_site(site_id)`; mig 563 przepisała 10, te trzy (z mig 551) pominęła | `wo_outputs`, `wo_events`, `downtime_events` | mig 563 zmierzyła tę klasę jako **10 995 ms → 90,9 ms** przy 150 000 wierszy | S | niskie — kod naprawy istnieje, blok `do $$` z 563 jest sterowany katalogiem | ⚠️ najprawdopodobniej **artefakt klonu**, nie wada kodu — ale **nie ma dziś strażnika**, który powstrzyma mig 565 przed napisaniem starego kształtu (wzorzec do skopiowania leży w 551) | C1 |
| **B1-A7** | próg ATP 10 RLU w 4 miejscach + reguła porównania w 2 — **rekomendacja: NIE scalać**, tylko test przypinający, wzorem `recipe-cost-uom.pg.test.ts` | mig 162/167/187 + `changeover-actions.ts` | wyzwalacz bazy i kod aplikacji stoją w różnych warstwach; wymuszenie jednego źródła = zapytanie w gorącej ścieżce albo generowanie kodu | S (sam test) | brak. **Sama reguła werdyktu jest już scalona** (`certifyVerdict`, `11095c7c`) — **pozycja zamknięta, nie dublować** | — | B1 |
| **F2-NUL** | `changeover-actions.ts:307` wstawia **dosłowny bajt NUL** jako separator klucza → `rg` melduje „binary file matches", BSD `grep` „1 matches in 0 files". **Każdy audyt tekstowy po cichu pomija plik z logiką świadectwa alergenowego** | `production/_actions/changeover-actions.ts:307` | przywraca wyszukiwalność za darmo; F2 traktuje to jako **czynnik współsprawczy** defektu bezpieczeństwa żywności, nie ciekawostkę | S | brak | **warunek wstępny dla F2-5a i F2-5b** | F2 |
| **E1-4/5 + F1-3** ✌️ | izolacja torów: `isolation: "worktree"` w spawnach piszących + `worktree-bootstrap.sh` + odświeżyć `launch-batch.sh` (2 linie: `-m gpt-5.5` → `gpt-5.6-sol`; `--dangerously-bypass-…` → `--sandbox workspace-write`) | `.claude/agents/*`, `_meta/runs/launch-batch.sh` | **nie trzeba nic budować** — oba mechanizmy istnieją. `test-db.sh` ma **3 klony** na kilkanaście torów: to wyjaśnia, jak jedna baza trafiła do dwóch torów i **oba zameldowały zieleń** | S | niskie; punkty serializacji (numer migracji, `events.enum.ts`, `permissions.enum.ts`) **nadal wymagają pojedynki** | — | E1-4/5 · F1-3/7 |
| **F1-1** | `--output-schema` dla Codexa — meldunek jako JSON z `raw_output` i `exit_code`, odsiew po `verdict` bez czytania prozy | `_meta/runs/lane-report.schema.json` | „czytanie 14 meldunków" → „czytanie tych, które same się przyznały". Zweryfikowane uruchomieniem | S | niskie; **schemat wymusza kształt, nie prawdziwość** | — | F1 |
| **F1-2b** | `VERDICT: verified\|failed\|not_executed` + dosłowne wyjście komendy bramkującej, jako **jedno zdanie** w prompcie subagenta; `not_executed` jawnie dopuszczone jako poprawna odpowiedź | szablon promptu toru | subagenci nie mają `--output-schema`; furtka „nie udawaj" zgodna z tym, jak faktycznie się zachowują | S | niskie | — | F1 |
| **F1-4** | hook `SubagentStart` wstrzykujący 4 ostrzeżenia do **każdego** startującego agenta (baza = klon; `git add` tylko po jawnej liście; `VERDICT:`; najnowsza migracja dotykająca obiektu) | `.claude/settings.json` | plik z briefem wymaga, żeby agent go przeczytał; hook nie. **Dowód działania jest w tej sesji** | S (~30 min) | niskie; największe to rozrost hooka | ⚠️ E1: **niepotwierdzone, czy `SubagentStart` przyjmuje `additionalContext`** | F1 · E1 |
| **E1-6A** | `scripts/prod-read.sh` z `PGOPTIONS='-c default_transaction_read_only=on'` + jedna pozycja `allow`, jedna `deny`; sekret zostaje w `.env.local`, **nie trafia do wiersza poleceń ani do transkryptu** | `.claude/settings.json` | odblokowuje pracę z telefonu | S | **średnie i nazwane wprost**: agent, który świadomie zrobi `SET default_transaction_read_only = off`, obejdzie to. Wariant B (rola `kira_ro`) jest jedynym nie do obejścia. **Nie udawajmy, że A jest B** | — | E1 |
| **A1-03** | osierocona druga implementacja ekranu powiadomień (337 linii) pod trasą, do której nie da się wejść; wersja żywa ma własny komponent (`diff` = 407 linii) | `app/(admin)/account/notifications/page.tsx:170` | −337 linii; koniec z dwiema wersjami tego samego ekranu | S | obok leży `page.test.tsx` — padnie razem z plikiem | A1-02 | A1 |

### Warstwa 3 — liczniki, które mają się stać bramkami (CI zrobi się czerwieńsze **celowo**)

Wspólna technika: **linia bazowa „nie gorzej niż dziś"**. Wszystkie te bramki już umieją się
zaczerwienić — nikt ich o to nie prosi.

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **A2-17** 🔒 | 7 `tsconfig.json` nie dziedziczy z bazy, 2 nadpisują `moduleResolution` na `Bundler` → **ten sam plik daje różne wyniki w różnych pakietach**; `packages/gdpr` jest zielony u siebie i daje 3 błędy `TS2835` pod ustawieniami bazy, a konsumuje go `apps/worker`, który **dziedziczy z bazy** | `packages/{domain,gdpr,ops,rule-engine,schema-runtime,ui}`, `tooling/restore-drill`, `packages/{outbox,rate-limit}` | jedna reguła rozwiązywania modułów; bramka typów przestaje kłamać | M | ujednolicenie odsłoni błędy | **musi poprzedzać A2-05** — inaczej A2-05 daje różne wyniki w różnych pakietach | A2 |
| **A2-05** ✌️ | `pnpm -r typecheck` obejmuje **10–11 z 23–26 projektów**; brak skryptu w 13 pakietach, brak `tsconfig.json` w `packages/{db,server}`. Sonda D1: wstawiony błąd typu w `rule-engine` → **exit 0**. Sonda A2: `tsc` na `packages/db` pod ustawieniami bazy → **6 realnych błędów** | 13 × `package.json` + 2 × `tsconfig.json` | bramka mierzy cały workspace zamiast 43 % projektów | S (zmiana) / praca na czerwieni | **pierwsze uruchomienie będzie czerwone — to wynik fali, nie porażka**. `pnpm -r` przerywa na pierwszej awarii → dodawać **partiami** | A2-17 | D1-01 · A2-05 · D2-L7 |
| **D2-L5** ✌️🔒 | `monopilot/no-ok-false-in-org-context` ma severity **`warn`**: **1 328 ostrzeżeń**, `pnpm -r lint` → **exit 0**. Bramka pilnująca spójności zapisów nie blokuje niczego | `apps/web/eslint.config.mjs:301` | chroni przed **nowymi** wystąpieniami, gdy stare są jeszcze naprawiane | M | 1 328 wystąpień → **wyłącznie** z linią bazową (`eslint --format json` → `.eslint-partial-commit-baseline.json`) | 🔒 baseline i flip **w jednym commicie** | D2-M3/L5 · B2-01 |
| **D2-M5** | `typecheck:tests` mierzy **1 722 błędy TS**, exit 2, i ma **zero** odwołań w `.github/workflows/*.yml`. To nie bramka, to licznik długu — **rosnący**: 1 644 (30.07 13:00) → 1 699 (30.07 17:17) → 1 722 dziś | `apps/web/package.json:10` | zatrzymanie przyrostu przy zerowym koszcie sprzątania starego | S (próg ≤1 722) | brak | — | D2 |
| **A2-06** ✌️⚠️ | `lint-no-hardcoded-strings.mjs` chodzi w CI, `Mode: warn`, `exit 0`. Z `HARDCODED_STRINGS_MODE=error` → exit 1 (umie się zaczerwienić, nikt nie prosi) | `scripts/lint-no-hardcoded-strings.mjs:91,103` | bramka albo chroni, albo przestaje udawać | M | ⚠️ **liczbę trzeba przeliczyć raz**: A2 podaje **911**, D2 podaje **6 804** — dwie metody liczenia, jedna linia bazowa | — | A2-06 · D2-M2 |
| **F2-2ab** ✌️ | **42 z 43** plików `.pg.test.ts` ma `const run = databaseUrl ? describe : describe.skip`; vitest raportuje awarię `beforeAll` jako `skipped`, nie `failed`; suita izolacji stoi za flagą `RLS_LIVE_TESTS`, której **`rg` nie znajduje w `.github/workflows/` ani razu** — a gdyby ustawić, i tak padnie (`new Function('specifier',…)` nie działa pod module runnerem) | 41 plików + nowy test „spisu kolekcji" | **I5 (izolacja organizacji) ma 14 testów dowodzących, z których żaden nie chodzi.** F2: „mnoży wartość każdej innej pozycji w tym raporcie przez różną od zera" | M (~3 h) | **zapali się szeroko** (39 plików padających w `beforeAll`); noc 5/6.08 odzyskała tak 35 suit i zmierzyła 33 czerwone testy = 33 defekty, które nie istniały dla nikogo | C2-4, D2-M7 | F2-2 · C2 (473 pominięte) · D2 (118 `skipped` mimo `DATABASE_URL`) |
| **D1-04-S** | `_meta/i18n-staging/` (**37 plików, 3 538 kluczy, importowanych przez 42 moduły**) nie jest objęty **żadną** z dwóch istniejących bramek i18n. Kontrola przeciwna: główny katalog ma po **10 910 kluczy w en/pl/ro/uk, zero braków** | `apps/web/i18n/__tests__/wave-4-locale-parity.test.ts` | jedna miara pokrycia zamiast dwóch, z których druga nie istnieje | S | brak — wariant tani **nie scala** katalogów, tylko daje pomiar | **przed** B2-04 | D1 |
| **D2-L8** | żadna migracja tworząca funkcję SQL nie ma post-checku, który tę funkcję **wywołuje**; `PREPARE` nie waliduje ciał funkcji | szablon w skillu migracyjnym | bez tego `PREPARE` dalej jest fałszywą zielenią | S (szablon) / M (wstecz) | brak | — | D2 |
| **F2-5a** | reguła: w plikach `guard\|gate\|hold\|permission\|qc\|release\|policy` `catch` **nie może** zwrócić wartości przepuszczającej. Bezpieczna, bo „BRAK BLOKADY PRZYCHODZI JAKO PUSTY ZBIÓR, NIGDY JAKO WYJĄTEK" — w tej rodzinie **nie istnieje legalny spodziewany wyjątek** | analizator AST już jest (`multi-write-transaction-analyzer`) | **zapala się dziś na żywym, nienaprawionym miejscu**: `packages/auth/src/password-policy.ts:133` — błąd bazy po cichu **przepuszcza ponowne użycie starego hasła** | M (~4 h) | średnie — allowlist będzie rosnąć; zakotwiczyć w **rodzinie plików**, nie w kształcie `catch` (szeroki przemiot daje ~40 dalszych trafień, wszystkie to degradacja modelu odczytu) | F2-NUL | F2 |
| **F2-5c** | spis skal `numeric`: ta sama operacja zapisana jako `1.235` (`wo_outputs.qty_kg`, `numeric(12,3)`) i `1.234500` (`license_plates.quantity`, `numeric(18,6)`) | migracje | **0,0005 kg na operację; 2 000 operacji = 1 kg.** Wariant I1, którego ani wyzwalacz, ani cron nie zobaczą — obie strony równania mogą się zgadzać | M (~3 h) | niskie | — | F2 |
| **F2-5d** | osiągalność stanów: status z `CHECK` w migracji × krawędzie z tablicy przejść w kodzie | `318-stock-count-adjustments.sql:13` | **zapala się dziś: żadna akcja nie wykonuje `open → counting`. Inwentaryzacja nie działa w ogóle** (`counted_qty = null`), ślepy zaułek od migracji 318 | M (~4 h) | niskie. To **cała wartość, jaką dałaby weryfikacja formalna**, za 40 linii | — | F2 |
| **D2-L3** | `pack-error-label-contract.test.ts` pilnuje **jednej** ścieżki; ekranów z własną mapą `errors: {`: **89** | `apps/web/app/**` | ten sam kod, pętla zamiast dwóch stałych | M | średnie | D1-05 (kształt) | D2 |
| **E1-3** ⚠️ | hook `SubagentStop`: blokada zakończenia, gdy agent **twierdzi zieleń**, a w transkrypcie nie ma wywołania testu. Wykrywanie potwierdzone (`grep -a` po JSONL → 6 trafień) | `.claude/hooks/no-green-without-run.sh` | 2–5 h/tydz.; wariant mocniejszy łapie też `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` / `0 passed` | M | **średnie — jedyna propozycja, której E1 nie poleca włączać na ślepo przed nocną falą.** Ryzyko zapętlenia (sprawdzić flagę „blokada już zadziałała"); daj jeden dzień obserwacji | E1-1 | E1 |

### Warstwa 4 — baza danych: największy zmierzony zysk w całym audycie

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **C1-1** | `org_id = app.current_org_id()` w **307 politykach RLS** wykonuje się **raz na wiersz**; owinięcie w `(select …)` robi z tego InitPlan. Funkcja robi JOIN dwóch tabel = 3 bufory na wywołanie | katalog bazy; wzorzec z mig 563 gotowy do skopiowania | zmierzone na ekranie Ruchów Magazynowych, 150 000 wierszy: **1 545 ms → 867 ms, bufory 905 443 → 454 079**. Izolowany pomiar funkcji: **100× szybciej, 5 000× mniej buforów**. **Zero zmian w kodzie aplikacji** | M | **to predykat bezpieczeństwa** — migracja **musi** mieć post-check wykonujący oba warianty, jak mig 563; sprawdzić też polityki `with check` | mig 561 (`stable`) już jest — **warunek konieczny, nie duplikat** | C1 |
| **C1-2** | to samo w SQL aplikacji: **3 651 gołych wywołań w 810 plikach** (7 w jednym zapytaniu w `stock-move-actions.ts`) | `apps/web` + `packages` | dopiero C1-1 **i** C1-2 razem: **1 545 ms → 163 ms, bufory 905 443 → 4 079** (111×) | L | niskie funkcjonalnie, ale **diff w 810 plikach** → musi iść osobno od czegokolwiek. Lint blokujący nawrót, nie `sed` na ślepo | C1-1 (żeby zmierzyć każdą połowę osobno) | C1 |
| — | **wariant tańszy, zmierzony:** usunąć duplikat `org_id = …` z SQL aplikacji (RLS i tak go wymusza) → **154 ms / 4 037 buforów**, czyli tyle samo | — | — | S | 👤 **C1 wprost nie rekomenduje bez decyzji właściciela**: duplikat jest drugą warstwą obrony przed wyciekiem między organizacjami; usunięcie zamienia zmianę wydajnościową w **zmianę bezpieczeństwa** | — | C1 |

### Warstwa 5 — księga magazynowa i niezmienniki w schemacie

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **F2-1** ✌️ | wzór uzgadniania księgi **istnieje** jako `const` w pliku testowym i ma drugą kopię — obie w plikach, które cicho się pomijają. Wyjąć do modułu + wspólna asercja `expectLedgerBalanced()` + cron (szablon `catch-weight-variance` robi dokładnie to, co trzeba; indeks `stock_moves_lp_idx` już jest) | `apps/web/lib/warehouse/ledger-reconciliation.ts` (nowy) | łapie **obie klasy I1**: brak wiersza (P0.2/3/4/7/10) **i** odwrócony znak (P0.8). D2: **„najwyższy stosunek korzyść ÷ ryzyko w całym raporcie — dodaje test, nie zmienia kodu produkcyjnego"** | M (~4 h) | **zapali się natychmiast i szeroko**: `receive-po-line-core.ts` nie pisze kanonicznego `receipt` (P0.9), więc **każda paleta z przyjęcia PO** pokaże `ledger_sum = 0`. Planować jako raport (tabela + alarm **przy wzroście**), nie jako czerwony build | F2-2ab | F2-1 · D2-L1 |
| **F2-3** | `CREATE CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` na `license_plates`: przy COMMIT musi istnieć **jakikolwiek** ruch dla tej palety. **Świadomie nie sprawdza sumy** — wersja „suma = stan" wywróciłaby przyjęcia PO i inwentaryzacje, czyli zatrzymała zakład | migracja + ~40 linii plpgsql | reguła w kodzie musiałaby być powtórzona **21 razy**; w bazie obowiązuje raz i **nie da się jej ominąć**. Łapie klasę, która pękła **trzy razy w dobę** | M (~1 dzień) | **etapami**: najpierw zapis do tabeli naruszeń bez `raise exception`, przez jeden pełny przebieg + dzień na dev; flip dopiero przy pustej tabeli. **Nie złapie odwróconego znaku** (wiersz istnieje) | F2-1 | F2 |
| **B1-B0a** | 3 zapisy księgi z przesunięć pomijają `reason_code` i `ext_jsonb`; sąsiad **w tym samym module** (`reverse-receive.ts:286`) ustawia komplet → wąski kształt **nie jest wymuszony dziedziną** | `transfer-orders/_actions/actions.ts:1119,1301,1454` | przywraca możliwość **złączenia** wiersza księgi z zamówieniem przesunięcia (dziś tylko wolny tekst `"TO ship TO-1234"`) | S | niskie. **Sprawdzone: brak `site_id`/`status` NIE jest błędem** — łata je trigger z mig 380 i wartość domyślna | — | B1 |
| **B1-B0b** | warunek brzegowy zmniejszania palety: podział używa ostrego `<`, **pięć bliźniaczych ścieżek** nieostrego `>=` | `lp-split-merge-destroy-actions.ts:465` vs 5 miejsc | ujednolicić **albo udokumentować, dlaczego podział ma być ostrzejszy** — B1 nie znalazł testu, który to przypina | S | niskie | — | B1 |
| **F2-7** | FK złożony `(org_id, uom) → unit_of_measure(org_id, code)` — dziś **nic** nie łączy kolumn jednostki z katalogiem | `bom_lines`, `license_plates`, `wo_material_consumption`, `wo_outputs` | ⚠️ **uczciwie: NIE łapie I2** (kod jednostki był poprawny, nikt go nie odczytał). Łapie klasę obok. Wchodzi, bo spis przy okazji ujawnia **prawdziwą dziurę**: `formulation_ingredients(qty_kg, cost_per_kg_eur)` **nie ma kolumny `uom` w ogóle** — i to ona zasila `compute-waterfall.ts` | S (~2 h) | zerowe utrzymanie | — | F2 |
| **D2-M10** | ograniczenia FIFO z mig 199 (`qty_remaining <= qty_received`) **nie istnieją** — `drop table public.inventory_cost_layers` w mig 404 zabił je po cichu. Ostrzeżenie metodyczne: **sprawdzanie `drop constraint` nie wystarcza** | `item_wac_state` | przegląd, czy dziura po FIFO ma następcę | S | brak | — | D2 |

### Warstwa 6 — jednostki i koszt (**zablokowana decyzją właściciela**)

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **B1-B2** 🔒 | loader kosztu WIP wklejony 3× w TS + 4. raz w SQL migracji; pomiar `diff`: **61 z 75 linii bajt w bajt identycznych**. Plik sam podaje przyczynę: *„compute.ts is owned by another wave lane and must not be edited here"* — **kopia powstała z granicy własności toru, nie z powodu technicznego** | `costing/_actions/compute.ts:671`, `lib/npd/live-wip-cost-query.ts:79,159`, mig 501 | naprawa B1-A2 idzie w jedno miejsce zamiast w sześć | M | niskie w TS. **Kopia w SQL (mig 501) zostaje** — wołana z bazy, nie da się zastąpić importem; dla niej właściwe narzędzie to test przypinający | 🔒 **przed B1-A2, w tej samej fali** | B1 |
| **B1-A2** 👤 | naprawa błędu tysiąckrotnego (`2dcd9a73`, 200 g @ 5 GBP/kg = 1000 GBP) objęła **2 z 8** miejsc. Pozostałe 6 mnoży ilość z BOM przez koszt za jednostkę bazową **bez konwersji**. Kontrola żywotności wykonana: obowiązuje mig **501**, nie 491/492 | `compute.ts:692,716`, `live-wip-cost-query.ts:101,125,193,217`, mig 501:43,54 | koniec z wyceną receptury zawyżoną o czynnik jednostki (1000× dla gramów) | M | **wysokie i wymaga kolejności**: NPD zapisał już zatruty koszt do `item_cost_history` i `items.cost_per_kg`; naprawiony rollup przemnoży te wartości **poprawnie**, czyli **utrwali błąd** | 👤 **BLOKADA: decyzja o backfillu `item_cost_history`** (BIBLIA D1) | B1 |
| **B1-A3** | 6 niezależnych implementacji „sprowadź do jednostki bazowej", **2 z cichymi błędnymi rezerwami** (przy braku wpisu w katalogu zwracają liczbę zamiast odmowy). `consumption-qty-to-kg.ts:22` ma stałą `* 0.45359237` dla `lb`, **której nie ma w katalogu** (mig 449) — jedyne miejsce w repo z przelicznikiem zaszytym w kodzie zamiast w danych | `lib/uom/convert.ts`, `wac-qty-kg-sql.ts:41`, `consumption-qty-to-kg.ts:14-22`, `register-disassembly-output.ts:225-241` **i znowu** `:248-262` | jedna tabela przeliczników; znikają rezerwy dające liczbę zamiast `null` („wiarygodna zła liczba jest gorsza od absurdalnej — nikt nie audytuje 30,00") | L | średnie. Ujednolicenie na „zwracaj `null`" **zamrozi** pozycje, które dziś przechodzą przez cichą rezerwę — **to jest pożądane, ale zobaczy to operator**. Wymaga zapowiedzi | B1-A2 | B1 |
| **F2-5b** | reguła kontraktowa: `ilość × cena` w SQL musi mieć uznany fragment sprowadzający do jednostki bazowej albo wpis na liście wyjątków. **Ekstraktor już istnieje** (`scripts/extract-sql.mjs`) → koszt spada z ~6 h do ~3 h | analizator + lista wyjątków | **jedyna propozycja, która zamyka klasę, a nie przypadek.** Zapala się dziś na 3 żywych rodzeństwach + `complete-cancel-wo.ts:626` (`wo_outputs.qty_kg` **nie jest w kilogramach** — przyrostek kłamie) | M (~3 h) | średnie — lista wyjątków ma pozycje legalne (`sales-line-price.ts`, `get-po-aging.ts`, `rma-actions.ts:410`), każdy wyjątek z jednym zdaniem uzasadnienia | F2-NUL | F2 |
| **D2-L2** | `public.compute_intermediate_unit_cost` (mig 501, **żywa** — żadna z 502-564 jej nie nadpisuje) obsługuje **tylko** `lower(pc.throughput_uom) = 'kg'`; `grep -rl` po `apps/` i `packages/` → **zero trafień, także w testach** | mig 501:97 | żywa funkcja, **zerowe pokrycie**, znany błąd tysiąckrotny w rodzinie obok | S | niskie | F2-5b (uzupełniają się: 5b skanuje literały TS, L2 sięga do funkcji SQL) | D2 |

### Warstwa 7 — podziały o niskim ryzyku (żadna granica commitu się nie przesuwa)

| id | co | gdzie | korzyść | koszt | ryzyko | zależy od | źródło |
|---|---|---|---|---|---|---|---|
| **B2-13** | plik wygląda na moloch (2 107 linii), a jest **dziewięcioma komponentami**, z których **sześć jest całkowicie samodzielnych** (bez stanu); eksportowany `FaProductionTab` trzyma tylko 4 `useState` | `app/(npd)/fa/[productCode]/_components/fa-production-tab.tsx` | **najtańszy duży podział w repo** — przeniesienie funkcji + import, zero przenoszenia stanu | S–M | niskie; zachować powierzchnię re-eksportu (`fa/_components/fa-production-tab.tsx:6-18` wystawia 10 symboli) | — | B2 |
| **B2-05** | `gate-helpers.ts`: 1 425 linii, 58 eksportów, **26 funkcji / 385 linii nie dotyka bazy** — a test czystej `nextGate()` ładuje całą warstwę dostępu do danych | `app/(npd)/pipeline/_actions/_lib/gate-helpers.ts` | automat stanów bramek NPD — **najbardziej regulacyjnie wrażliwa logika w NPD** — daje się testować bez bazy | S–M | **bardzo niskie — jedyna duża ekstrakcja, która nie dotyka żadnej transakcji**; 11 plików testowych już istnieje | — | B2 |
| **B2-08** | `mwo-actions.ts` 1 900 linii, **5 niezależnych odpowiedzialności**; LOTO ma własną tabelę, własne uprawnienia i własne inwarianty, a z MWO styka się **jednym** warunkiem `requires_loto` | `maintenance/_actions/mwo-actions.ts` | **najlepszy kandydat na podział w repo, bo ryzyko jest niskie: wszystkie 15 transakcji ma poniżej 150 linii** — nie ma tu transakcji do rozbicia. LOTO (bezpieczeństwo pracowników) przestaje być czytane razem z listą harmonogramów | M | niskie; `updateMwo:1079-1182` **już** stosuje wzorzec docelowy | — | B2 |
| **B2-09** | 19 z 51 długich bloków `withOrgContext` **nie wykonuje żadnego zapisu**; najdłuższy 622 linie. Wzorzec `XCore(ctx,…)` działa już w 8 plikach i ma **udokumentowany powód**: *„~7 of them CONCURRENTLY … exhausted the Supavisor pool (pool_size=15) → EMAXCONNSESSION"* | `get-work-order-detail.ts:305-926`, `search-traceability.ts:84-407`, +17 | krótsze trzymanie połączenia przy `pool_size=15`; wzorzec **gotowy do skopiowania, nie do wymyślenia** | M | **najniższe z pozycji transakcyjnych — przy odczycie nie ma czego utrwalić częściowo.** ⚠️ spójność odczytu dla `search-traceability` (genealogia) **niesprawdzona** | — | B2 |
| **C2-5** | 34 wywołania rewalidacji **wewnątrz** transakcji (zlecenie mówiło o 78 — **połowa już naprawiona**, helper `revalidateAfterCommit` istnieje) | `actions/tenant/*` (6), NPD pipeline (14), `actions/{schema,users,security,flags,modules}` (11) | ⚠️ **kosztu wydajnościowego nie ma** — zmierzone: 379 tras dynamicznych, 1 statyczna, 0 `'use cache'`, `staleTimes.dynamic = 0`. Korzyść to **mniej pułapek**: znika ścieżka, w której udany zapis wraca jako `persistence_failed`, a operator ponawia go w duplikat | M | niskie; wzorzec i testy już są | — | C2 |
| **B2-01-przegląd** ✌️ | przegląd **56 bloków** `try`-z-zapisami-i-`catch`-który-`return`uje, z czego **41 bez ani jednego `throw`**. Priorytet: 6 miejsc z `esign_failed` | `changeover-actions.ts:739,968,1113`, `consume-material-actions.ts:649,757`, `complaint-actions.ts:728` | zamyka klasę „zielono zgłoszona porażka z utrwalonym półproduktem" | M | ⚠️ **nie zamieniać hurtem `return` na `throw`** — `count-actions.ts:1275` zwraca `supervisor_pin_reject` **właśnie po to**, żeby licznik blokady PIN przetrwał commit; rollback zniósłby blokadę konta. **B2 sprawdził osiągalność 3 z 56** — to lista do przeglądu, nie lista potwierdzonych defektów | D2-L5 (bramka najpierw) | B2-01 · D2-M3 · D1 (nie policzył) |

### Warstwa 8 — 👤 decyzje właściciela (**to nie są zadania dla programisty**)

Każda z nich blokuje pozycję o dużym zysku. Bez odpowiedzi kasowanie jest hazardem,
a zostawianie produkuje zielone testy przy niedziałających funkcjach.

| id | pytanie | co od tego zależy | źródło |
|---|---|---|---|
| **A2-01** | `@monopilot/cascade-engine` — **porzucony czy niepodłączony?** Jest w PRD (`docs/prd/01-NPD-PRD.md:641`) i w skillu `MON-domain-npd`. `storage` i `queries` nie mają tego kontekstu i są bezsporne | „porzucony" → **−5 793 linie**. „Niepodłączony" → to zadanie budowlane, nie sprzątanie | A2 |
| **A2-03** | model Drizzle (**11 248 linii, 94 pliki**) ma wrócić do użycia? Dziś aplikacja rozmawia z bazą surowym SQL; `packages/db/src/index.ts:8` re-eksportuje z barrela **dokładnie dwa** symbole; `drizzle-kit` nie jest uruchamiany przez żaden skrypt | −11 248 linii i koniec dryfu **drugiego** opisu schematu obok 523 plików SQL | A2 |
| **B1-B1-krok1** | `audit_events` (67 wystąpień / 60 plików) vs `audit_log` (52) — **podział zamierzony czy przypadkowy?** Tylko `audit_log` jest partycjonowana (czyli retencja działa dla połowy zdarzeń); tylko `audit_events` ma IP i podszywanie się | Dla zakładu pod BRCGS: audytor pyta „pokaż wszystkie zmiany specyfikacji", a odpowiedź zależy od tego, którą tabelę ktoś odpyta. **Bez tej decyzji nie zaczynać kroku 2** | B1 |
| **B1-A6** | czy zamówienie zakupu w statusie `sent` wolno cofnąć do wersji roboczej? **Serwer to przyjmuje (2 warstwy), interfejs tego nie pokazuje** — etykieta w tym samym pliku mówi *„Wave-R reversibility — sent→draft reopen affordance"* | funkcja zaimplementowana, przetestowana i nieosiągalna dla użytkownika. S, jeśli decyzja brzmi „ma działać" | B1 |
| **A1-04** | `setAppointmentStatus` robi realny `update public.dock_appointments set status` i **nie ma ani jednego wywołania** — czy status awizacji na bramie ma dać się zmienić z aplikacji? To samo pytanie dla `getCcpDeviation` | 2 z 7 pozycji to prawdopodobnie **luka funkcjonalna, nie śmieć** | A1 |
| **A1-06 / A1-10** | trzy skupiska „napisane i nigdy niepodpięte": **cały łańcuch konfiguracji SSO** (`actions/sso/*` → `save-saml-config.ts` → trasa `/settings/saml`, sama nieosiągalna), **cykl aktualizacji dzierżawcy** (5 akcji, zero ekranów), **tokeny SCIM** | 62 akcje + 22 pliki. Dokończyć czy wyrzucić — **lista, potem decyzja, dopiero na końcu kod** | A1 |
| **E2-2.2** | **Vercel → Project → Settings → Git: czy repo jest wciąż podpięte?** Produkcja stoi **7 dni i 2 pushe** za `origin/main`; `vercel ls` nie pokazuje w tym oknie **żadnego** wdrożenia — nawet nieudanego. Gdyby webhook działał a build padał, byłyby wdrożenia `Error` | **jedna rzecz do kliknięcia.** Sprostowanie: pusta lista `hooks` **nie jest dowodem rozłączenia** — Vercel podpina się przez GitHub App, która nie zakłada webhooków na poziomie repo | E2 |
| **C2-2** | czy job `typecheck` jest **required check** w ustawieniach gałęzi? | jeśli tak → `ignoreBuildErrors: true` zdejmuje **15–39 s z każdego builda** (faza TS to 45–55 % czasu ściany). Jeśli nie — **nie ruszać**, bo odtworzy wzorzec „job `build` był POMIJANY, więc bloker przeżył tydzień" | C2 |
| **E2-2.1 / 3.4** | odnowić konektor MCP Vercel (interaktywnie, przez przeglądarkę). Supabase MCP — **tylko po weryfikacji**, czy `--read-only` wymusza rolę read-only w Postgresie, czy to sugestia w prompcie | `vercel logs` **nie jest zamiennikiem** — pokazuje tylko strumień od teraz, ubijany po 5 min, **zero historii**. Ale konektor ma `deploy_to_vercel` i `buy_*` w tym samym zestawie: **narzędzie do sesji z właścicielem, nie stały dostęp agenta nocnego** | E2 |
| **A2-12** ⚠️ | **teza A2 o dziurze zgodności RODO jest fałszywa — patrz §6.** Prawdziwe pytanie: czy `apps/worker` ma hosta poza Vercelem (20 projektów, żadnego workera; brak Dockerfile/fly.toml/systemd) | 4 z 6 zadań workera (weryfikacja kopii, wygasanie dokumentów zgodności) nie wykonuje się nigdzie | A2 + weryfikacja koordynatora |

### Warstwa 9 — duże i wartościowe, ale nie teraz

| id | co | korzyść / uwaga | koszt | źródło |
|---|---|---|---|---|
| **A1-11** ✌️ | **71 martwych kolumn** w bazie (przemielone 151 tabel / 2 018 kolumn); osobne podzlecenie **niezależnie udowodniło 19** metodą „dokładnie 1 wystąpienie w całych migracjach = tylko `CREATE TABLE`" | nazwane z dowodem: 7 kolumn opakowań w `brief_lines` (mig 081:88-94), 4 kolumny tłumaczeń w `allergens` (mig 042:202-205), `ideal_cycle_time_sec` (184:170), `plc_fault_code` (183:175), `work_orders.scrap_percent` (176:194). **`brief_field_mapping.fa_target` jest `NOT NULL`, a do tabeli nikt nigdy nie robi `INSERT`** → prawdopodobnie martwa cała tabela (**hipoteza, nie dowód**). Ta sama klasa co znany `changeover_events.cleaning_checklist` | M | **koordynator** — podzlecenie A1, **nie ma go w pliku A1** (raport przyznaje, że ta kategoria jest pusta) |
| **A1-07** ✌️ | 163 martwe eksporty (106 typów, 37 funkcji, 18 stałych). **Współczynnik błędu ZMIERZONY: 30 z 31 ręcznie sprawdzonych prawdziwie martwych ⇒ ~3,2 %, ekstrapolacja ~5 błędnych na 163** | Warte uwagi ponad statystykę: `computeWacDebitDelta` + `applyWacDebitDelta` (martwe w ścieżce pieniężnej WAC), `scannerCanSeeSite` + `scannerWoSiteAccess` (dwie funkcje kontroli dostępu do zakładu, zero wywołań), `__dayUsageHoursForTests` (wyeksportowana „dla testów", **żaden test jej nie używa**). **Raport A1 twierdzi, że współczynnik jest nieznany — to nieaktualne, liczba pochodzi z podzlecenia, które wróciło do koordynatora** | M (S dla typów) | A1-07 + **koordynator** |
| — | **fałszywy pozytyw wart osobnej linijki:** `actions/security/force-mfa.ts:26` `forceMfa` wygląda na martwy, bo test **nie importuje symbolu — czyta plik jako tekst i sprawdza regexem nazwę funkcji** (`policy.test.ts:59,64`). Usunięcie eksportu wywala zielony test | **każdy detektor martwego kodu w tym repo będzie się o to potykał** | — | koordynator |
| **A1-09** ✌️ | 4 kopie komponentów pulpitu NPD, **żadna nie jest renderowana przez stronę**; test w drzewie `(npd)` importuje **przez granicę drzewa**, a jego komentarz sam się przyznaje: *„Stale route contract: the compact preview implementation moved under the localized NPD route tree"*. Kopia **bogatsza** (203 linie, i18n, stany błędu) jest tą **starszą i martwą** | 👤 **rozstrzygnąć przed działaniem**: jeśli pulpit NPD **ma** te kafelki pokazywać, to nie martwy kod, tylko **niepodłączona funkcja** — i pozycja zmienia się z „usuń" na „podłącz właściwą". Sprawdzić `e2e/npd-dashboard-interactive.spec.ts` | S | A1-09 · B1-C3 |
| **A1-02** ⚠️ | 7 atrap tras administracyjnych w `app/(admin)/` — nieosiągalne, bo proxy przekierowuje wcześniej. Komentarz przyznaje wprost, po co istnieją: *„…tak żeby legacy route, the route-topology spec, i the i18n-consumption guard dalej się rozwiązywały"* | **kod istnieje wyłącznie po to, żeby przechodził test** → poprawić test, nie zostawiać kodu. ⚠️ **Warunek wejścia: `curl -I` na dev-serwerze** — A1 nie odtworzył przekierowania uruchomieniowo (3 próby padły na rozwiązywanie `next/server` z magazynu pnpm), a `middleware.test.ts:48` **mockuje `intlHandler` w całości**, więc żaden istniejący test nie sprawdza realnego zachowania warstwy locale | S | A1 · C2-3 (odtworzone `curl`em: 307) |
| **C2-3** | **19 tras zbudowanych i nieosiągalnych** (odtworzone uruchomionym serwerem: `curl -I /onboarding` → 307). **Własna hipoteza C2 obalona pomiarem:** te trasy **nie dokładają martwego JS** (2 pliki, 10 kB raw). To problem powierzchni buildu i utrzymania, nie rozmiaru paczki | M | średnie | C2 |
| **D1-02** | dezaktywacja magazynu mieszka **wewnątrz kolumny `warehouses.address` typu jsonb**; zwrotka udaje kolumnę (`returning id, false as is_active` — **takiej kolumny nie ma**). **61 miejsc czyta `warehouses`, dokładnie 2 filtrują `deactivated_at`** — oba w tym samym ekranie ustawień | Dezaktywacja zaczyna cokolwiek znaczyć. Filtr hurtem na 61 miejsc **wybieli dokumenty historyczne** → rozdzielić „czy mogę tu **założyć** nową pracę" (~6 ścieżek) od „czy mogę **pokazać** nazwę". Wzorcowy jest `equipment`/`users`: kolumna, nie blob | M | D1 |
| **D1-07** | `quantity` w widoku ruchów ma **dwa znaczenia**: gałąź (a) to ilość ruchu, gałąź (b) to **bieżący stan palety odczytany dziś**. Historyczne przyjęcie 100 kg wyświetli się jako „4", jeśli paleta została zużyta do 4 kg | rejestr ruchów przestaje kłamać o historii — to ekran, po który się sięga **przy dochodzeniu, gdzie zniknął towar**. Pole `source` (`'lp_state'` vs `'stock_move'`) **już jest w zapytaniu** | M | D1 |
| **D1-08** | bramka dostępu międzyzakładowego skanera jest **w środku `if (isUuid(...))`** — identyfikator spoza RFC-4122 pomija całą kontrolę | D1 **nie twierdzi, że to fail-open** (`moveScannerLp` ma własną warstwę). Twierdzi, że bramka jest warunkowa tam, gdzie nic tego nie wymaga, a jej warunkiem jest **ten sam walidator, który raz już odrzucił własną organizację aplikacji**. ⚠️ **przed zmianą policzyć w logach, ile żądań ma dziś `isUuid === false`** (sentinel `00000000-…` jest realnie używany) | S | D1 |
| **D1-05** | trzy nazwy pola niepowodzenia (`error` / `reason` / `errorCode` / `state`) w tym samym `ok:false`. **Dowód, że koszt jest realny:** most w `page.tsx:209` obsługuje oba kształty naraz i wprowadza **trzeci**. 20 lokalnych `type ActionResult`, 7 `ActionFailure` | ⚠️ **najgorszy stosunek korzyści do ryzyka w D1**: pomyłka przy migracji produkuje **dokładnie ten sam defekt**, przed którym broni (komunikat → `undefined`). **Wyłącznie krok pierwszy (S)**: jeden wyeksportowany typ + 27 lokalnych deklaracji. Bez dotykania setek akcji | S (krok 1) / L | D1 |
| **D1-06** ⚠️ | `catch` w `load-compliance.ts:235` zwraca `ok: true` z pustymi listami — awaria bazy wygląda identycznie jak zgodność. **Pole `state: 'error'` istnieje w zwrotce** | **to jest teza, nie defekt**, dopóki ktoś nie sprawdzi, czy komponent renderuje `state:'error'` inaczej niż `'empty'` | S | D1 |
| **B1-A1** | 15 prywatnych kopii sprawdzania uprawnień, **4 różne predykaty**; żadna nie ma obejścia dla ról nadrzędnych ani administratora platformy → ten sam właściciel organizacji jest wpuszczany na 144 ekranach i **odrzucany na 15**. W2 dodatkowo **przyznaje** dostęp tam, gdzie W1 odmawia | **osobna fala, sama** — to jedyna zmiana w całym audycie, która **rozluźnia** dostęp. Jeśli coś pójdzie źle, musi być widać, co cofnąć. **Test na personach, nie na mockach** | M | B1 |
| **B1-A0b + B1-B3** | `restoreLicensePlate` w 2 kopiach + **205 wspólnych linii** między akcją serwerową a trasą skanera (pomiar `difflib`: 10 bloków ≥8 linii). **To już raz kosztowało podwójną naprawę** — `58900b69` musiał dotknąć obu plików | **ta sama para plików — robić jednym ruchem.** Scalać **tylko wnętrze**, zostawić dwie obudowy (skaner ma inne uwierzytelnianie) | M | B1 |
| **B1-A5** | definicja „aktywna blokada" w 10 kopiach; `inspection-actions.ts:796` **nazywa źródło prawdy w komentarzu i mimo to je kopiuje** | **wszystkie 10 dziś się zgadza.** Zrobić **przy okazji** dodawania 11. statusu blokady, nie osobno. ⚠️ 2 kopie odpytują `quality_holds` bezpośrednio — przełączenie na widok zmienia ścieżkę RLS | M | B1 |
| **B1-B1-krok2** | jeden writer per tabela zamiast **45 prywatnych funkcji** `writeAudit`/`writeAuditEvent`/`writeAuditLog` | wymaga decyzji z kroku 1 | M | B1 |
| **B1-C4 / C5** | typy śledzenia partii w 2 kopiach (65 wspólnych linii, nagłówek przyznaje się wprost); typy PO/TO skopiowane **obok zaimportowanego rdzenia** | dodanie 8. rodzaju powiązania po stronie serwera **nie wywoła błędu kompilacji** po stronie klienta — dane wpadną w gałąź domyślną i nic się nie narysuje | S | B1 |
| **B2-04** | 39 modułów produkcyjnych importuje JSON z `_meta/i18n-staging/` — **katalog roboczy jest wejściem builda**; ani `.gitignore`, ani `.vercelignore` nie wspomina `_meta` → działa **przez przypadek, nie przez projekt** | ⚠️ liczby się różnią (B2: 18 plików / 39 importów; D1: 37 plików / 42 moduły; C2: 37 plików / 492 kB / 90 modułów odwołuje się do `_meta/`) — **przeliczyć raz przed planowaniem**. Komentarz nazywa mechanizm świadomie tymczasowym | M | B2-03, D1-04-S | B2 · D1 · C2 |
| **B2-11** | angielskie zdania instruktażowe składane w akcjach serwerowych; najgorsze skupisko **wewnątrz zapytania SQL** jako kolumna `reverse_block_reason` | zdania są dziś **niedostępne dla tłumacza**, a zakład pracuje po polsku; trzy warianty tego samego komunikatu w trzech modułach. ⚠️ `actions.ts:255-268` to zmiana w SQL, nie w TS | M | B2 |
| **B2-12 / B2-14** | 4 ekrany ze zrośniętym stanem i JSX (`FormulationEditor`: **74 wywołania hooków w jednej funkcji**, rozsypane po pięciu wyspach) + reguły biznesowe zduplikowane w przeglądarce | **zacząć od 14 bloków bezstanowych** — 8 paneli w `wo-detail-screen`, 6 zakładek w `lp-detail.client` nie dotyka żadnego stanu. **Osobno, jako pozycja S:** `lp-detail.client.tsx:275-277` liczy przeterminowanie **w strefie UTC przeglądarki** — ta sama klasa, którą noc 5/6.08 naprawiła w wysyłkach (`93730681`); kanoniczny helper istnieje (`site-day.ts:70`) | M / M–L | B2 |
| **B2-02** | `app/(npd)/` — **236 plików, 54 774 linie, zero tras**; importuje to 137 plików spoza katalogu | ⚠️ **NIE jest to martwe drzewo** — patrz §6. To biblioteka mieszkająca w drzewie routingu. Po B2-03 przenosiny są istotnie tańsze; to i tak największa jednorazowa zmiana w repo | L | B2-03 | B2 |
| **A2-13** | **88 importów międzypakietowych po ścieżce względnej** omija `package.json` — ta sama klasa, którą wywołał niezadeklarowany `resend` | skutek uboczny wart zapamiętania: pierwszy przelot A2 pokazał `rule-engine` i `rate-limit` jako pakiety bez konsumenta — **fałszywe alarmy**, znalezione dopiero po dołożeniu skanu ścieżek względnych | M | A2 |
| **A2-14 / A2-15 / A2-18** | `@monopilot/reference` — **pakiet, którego nie ma**, rozwiązywany aliasem; przy czym `apps/worker/eslint.config.mjs:15` każe importować stamtąd, a **osiem innych konfiguracji lintu każe importować z `'lib/reference'`** — dwie sprzeczne instrukcje w tym samym repo · zależności zadeklarowane i nieimportowane (`argon2`, `@testcontainers/postgresql` najcięższe) · eksporty bez konsumenta w 8 pakietach | ⚠️ **skan importów nie widzi zależności wskazywanych łańcuchem znaków w konfiguracji** — tak wypadły `storybook`, `jsdom`, `axe-core`. Każdą pozycję potwierdzić grepem po plikach `*.config.*` przed usunięciem | S / S / M | A2 |
| **C1-4 / C1-5** | 103 indeksy redundantne (ścisły prefiks szerszego, ten sam warunek częściowy) · CTE `unified` nie jest wstawiane w miejsce: **3 395 bloków ≈ 27 MB zapisu tymczasowego na jedno wyświetlenie strony** przy zwracanych 25 wierszach | C1-4: ⚠️ lista „indeksów nigdy nieużytych" z klonu jest **bezwartościowa** i C1 celowo jej nie zgłasza; redundancja prefiksowa jest dowiedziona z samego katalogu. C1-5: blokerem jest **`sm.id::text` w kluczu sortowania** — rzutowanie na tekst zabija porządek indeksowy i uniemożliwia `MergeAppend`; zmiana na `uuid` **zmienia kolejność wyników przy równych znacznikach czasu** → 👤 decyzja, nie refaktor | M / M | C1-1, C1-2 | C1 |
| **D2-L4** | reguła `'use server'` istnieje w **trzech implementacjach** (skrypt korzenia, reguła ESLint, test kontraktowy) | skasować dwie: reguła ESLint jest najtańsza, skrypt najszybszy (1,35 s), test kontraktowy zbędny | S | D2 |
| **E1-7 / E1-2.3-2.7** | kanon fali jako jedna komenda **w miejsce ośmiu martwych** `/kira:*` (ostatnia zmiana 02-03.06, opisują proces, którego już nie prowadzisz) + 5 subagentów `kira-*` z **przypiętym `model: opus`** tam, gdzie reguła każe dziedziczyć (`model: inherit` albo usunięcie pola) + rdza ścieżkowa (`middleware.ts` → `proxy.ts`, `packages/rbac/permissions.enum.ts` → `src/`, format migracji `0134_…` → `NNN-…`) + `01-MODEL-ROUTING.md` wymienia **Opus 4.8** i **`gpt-5.5`** | E1: *„jedyny ból, którego NIE da się domknąć hookiem"* — nie ma mechanizmu wykrywającego „ten kod nie przeszedł cross-review innego dostawcy". Zostaje redukcja przepisywania. **`MON-design-system` mówi „Read FIRST on every polish task", a mapa, wg której agent wybiera skille, w ogóle o nim nie wie** | M | E1 |
| **E2-3.3** | czujnik zastoju: cron co 6 h sprawdza wiek ostatniego wdrożenia i konkluzję ostatniego CI, pcha do ntfy. **Wykrywa brak zdarzenia, a nie zdarzenie** — jedyna klasa monitoringu łapiąca „webhook cicho przestał działać" | gdyby to stało 30.07, właściciel wiedziałby **31.07**, a nie po tygodniu. ⚠️ koszt realny: `VERCEL_TOKEN` w sekretach GitHuba **umie też deployować** (Vercel nie daje tokenów tylko do odczytu) | S | E2 |
| **F1-2** | `-c sandbox_workspace_write.network_access=true` — Codex dostaje lokalną bazę. Odtworzone: bez flagi `Operation not permitted` (piaskownica), z flagą `FATAL: role "postgres" does not exist` (**czyli gniazdo się połączyło**) | **ściśle bezpieczniejsze niż `--dangerously-bypass-approvals-and-sandbox`, którego już używasz w `launch-batch.sh`**. ⚠️ otwiera **całą** sieć, nie tylko localhost — **nie dawać torowi z tą flagą produkcyjnego `DATABASE_URL`**, dawać klon | S | F1 |

### Jawnie odrzucone — **nie zlecać**, tory podały powód

| co | dlaczego nie | źródło |
|---|---|---|
| **40+ kluczy obcych bez indeksu** | największa dotknięta tabela ma **2 736 wierszy**. Dodanie 40 indeksów „na wszelki wypadek" **pogarsza zapis** i jest sprzeczne z pozycją o 103 redundantnych. Wrócić przy ~100 000 wierszy **i** profilu produkcyjnym pokazującym skan sekwencyjny | C1-6 |
| **89 stron ładujących dane sekwencyjnie** | naiwne `Promise.all` **nie zadziała** wewnątrz jednego `withOrgContext` (jeden klient pg szereguje zapytania z definicji) → pozycja zawęża się do kilkunastu stron. Zysk **niezmierzony** (brak bazy), a dwie równoległe transakcje na tej samej encji to dokładnie wzorzec, który dawał `deadlock`. **Wymieniamy 40 ms na incydent produkcyjny** | C2-6 |
| **Włączyć `@typescript-eslint/*`** (dziś **wszystkie** wyłączone dla `.ts`) | odsłoniłoby tysiące ostrzeżeń i pochłonęło całą falę **bez jednego naprawionego defektu**. Zamiast tego Warstwa 3, która blokuje **przyrost** długu przy zerowym koszcie sprzątania starego | D2-M4 |
| **15 lokalnych kopii `formatMoney`/`formatQty`** | B1 sprawdził tylko, że istnieją — **nie zmierzył, czy zaokrąglają różnie**. Jeśli wszystkie robią `toFixed(2)`, korzyść jest kosmetyczna. **Bez tego pomiaru nie kwalifikuje się do fali** | B1-C6 |
| **Migracja 69 modali na `@monopilot/ui/Modal`** | po poprawce CSS defekt znika; zostaje dostępność (pułapka fokusu) — realna, ale to osobna kampania. B1: *„nie jestem przekonany, że warto"* | B1-C1b |
| **Wspólny pisarz księgi magazynowej** (21 zapisów, 20 mutacji ilości) | **to nie jest pozycja do fali** — L, osobna kampania z odtworzeniem **każdej z 21 ścieżek** na realnej bazie. Warstwy 1/5 zdejmują objawy i zmniejszają liczbę mechanizmów z czterech do dwóch; przyczynę zamyka dopiero to | B1-B0c |
| **PBT modelowe na żywej bazie** (`fc.asyncModelRun`) | stos jest dojrzały i **złapałoby I1 szerzej niż ręcznie**, ale: kurczenie przez bazę jest wolne i zawodne; **model to druga implementacja tej samej reguły** — przy jednoosobowym zespole to ten sam człowiek z tym samym martwym punktem; **rotuje** (nowa operacja bez komendy = cicha luka). **80 % wartości daje coś o rząd tańszego.** Wrócić **wtedy i tylko wtedy**, gdy ręczne pary przestaną znajdować błędy | F2-8b |
| **Weryfikacja formalna (TLA+, Alloy, TLC)** | **zero z sześciu niezmienników.** I1 to nie były złe przeploty, tylko **brakujące skutki uboczne w pojedynczym, sekwencyjnym przejściu** — a specyfikację pisze ta sama osoba, która napisała kod. Jedyna rzecz, którą model by znalazł (ślepy zaułek statusu), kosztuje **40 linii** (F2-5d). Specyfikacja, która się rozjedzie z kodem, **jest gorsza niż jej brak** | F2 |
| **PBT na czystych funkcjach · pgTAP · nowa biblioteka do liczb** | PBT: **zero z sześciu** — arytmetyka była poprawna, brakowało wiersza i znaku · pgTAP: drugi język testów i rozszerzenie w czterech środowiskach za funkcjonalność, którą daje istniejący `.pg.test.ts` · biblioteka: repo ma **dwie** własne implementacje stałoprzecinkowe, trzecia pogarsza sprawę — prawdziwy problem to **milczące porażki w obu** (`Dec.div()` → `zero()` przy dzieleniu przez zero; `toMicro()` → `0n` na śmieciach) | F2 |
| **`Workflow` do orkiestracji fal** | nie jest dostępny w sesji subagenta (a Twój wzorzec fal jest zagnieżdżony) · Twoje fale **nie są deterministyczne, i to jest ich zaleta** — ustalony graf nie przyjmie „tor odrzuca zlecenie i ma rację", a to zdarzyło się kilkakrotnie · **nie adresuje ani jednego z czterech bólów.** *„Ręczne fale działały dobrze. Zostaw je"* | F1-5 |

---

## 4. Fale

**Kryterium podziału — jedno, i nie jest nim łatwość:** *czy ta pozycja zmienia to, co
wiadomo o repozytorium?* Fala 1 nie naprawia ani jednego defektu produktowego. Odblokowuje
**pomiar**. Wszystko dalej jest zgadywaniem, dopóki bramka nie umie się zaczerwienić, a suita
UI nie startuje.

Drugie kryterium, dla kolejności wewnątrz reszty: **czy pozycja odblokowuje inną.**
Trzecie: **czy wymaga decyzji, której nie da się podjąć w kodzie.**

### 🔒 Pozycje, które MUSZĄ wejść jednym commitem

| # | pary | dlaczego osobno jest gorzej |
|---|---|---|
| **1** | **E1-1 (hook `bash-guard`) + E1-2 (6 linii w skillach)** | **hook zacznie blokować komendę, której uczy skill.** Agent dostanie blokadę na to, co `MON-t4-test` kazał mu uruchomić, i będzie walczył z hookiem zamiast pracować. E1 mówi to wprost: *„Osobno każde z nich jest gorsze"*. Dołóż do tego samego commita E1-8 (`rm -rf .agents/skills` + MON-INDEX) |
| **2** | **A2-21 (mig 549 do gita) → A2-04 (regeneracja wzorca)** | regeneracja wzorca schematu przy niekompletnym łańcuchu **zapiecze brak 549 w pliku odniesienia**. A2 zaznacza wprost: 549 **blokuje** A2-04 |
| **3** | **A2-04 + A2-08 + A2-20** | **ta sama migracja 404 wywala trzy rzeczy w tym samym przebiegu.** Naprawa wzorca bez usunięcia testu `r13` i zapytania kontrolnego próby odtworzeniowej tylko przesuwa czerwień o jeden job dalej |
| **4** | **C2-4 (`&&` → `;`) + D2-M7 (`--no-bail`)** | `apps/web` jest **ostatni** w kolejności `pnpm -r`. Rozdzielenie `&&` przy zachowanym `bail` nie da nic: jedna czerwień w dowolnym wcześniejszym pakiecie i tak nie dopuści do suity web. **Obie albo żadna** |
| **5** | **D2-L5: wygenerowanie linii bazowej + podniesienie severity** | osobno pierwszy PR po zmianie blokuje się na **1 328** zastanych ostrzeżeniach |
| **6** | **B1-B2 przed B1-A2** (jedna fala, ustalona kolejność) | B2 usuwa kopie, w które A2 musiałaby wejść **sześć razy**. A3 usuwa ciche rezerwy, które A2 by utrwaliła |
| **7** | **A2-17 przed A2-05** (wiążąca kolejność, niekoniecznie jeden commit) | bez ujednolicenia `moduleResolution` ten sam plik daje różne wyniki w różnych pakietach — A2-05 zmierzy nieprawdę |

### Fala 1 — „bramki zaczynają mierzyć" (1–2 dni, ryzyko ~0)

Cała Warstwa 1. Nie naprawia żadnego defektu produktowego i **to jest jej sens**.
Po niej zielone CI zaczyna cokolwiek znaczyć, a 3 588 testów wraca do obiegu.

**Zapowiedz zespołowi, że CI zrobi się brzydsze.** To ujawnienie, nie regresja — inaczej ktoś
„naprawi" to cofnięciem zmiany.

### Fala 2 — „darmowe wygrane" (1 dzień)

Cała Warstwa 2. Wspólny mianownik: **żadna nie zmienia reguły biznesowej i żadna nie
wymaga decyzji.** Trzy z nich (`F2-4`, `F2-6`, `B1-C1a`) zamykają defekt permanentnie za
mniej niż godzinę pracy każda.

Wyjątek do wyjęcia, jeśli fala ma być bez ryzyka wizualnego: **B1-C1a** dotyka 46 ekranów
naraz i wymaga przeglądu w przeglądarce, nie tylko testu.

### Fala 3 — „liczniki → bramki" (2–4 dni, CI **celowo** czerwieńsze)

Warstwa 3. Kolejność wymuszona: **A2-17 → A2-05**, reszta równolegle.
Wszystkie idą z linią bazową „nie gorzej niż dziś". **Zaplanuj to jako pracę, nie jako
awarię** — pierwsze uruchomienie każdej z tych bramek będzie czerwone.

`F2-2ab` jest w tej fali sercem, nie dodatkiem: **bez niej pozycje z Fal 5 i 6 mogą
wylądować w pliku, który się nie uruchamia.**

### Fala 4 — „jedna migracja, największy zmierzony zysk" (2–3 dni)

`C1-1` + `C1-3` w **jednej** migracji sterowanej katalogiem, z post-checkiem równoważności
w tej samej transakcji, plus strażnik `raise exception`, gdy jakakolwiek polityka wraca do
starego kształtu — **wtedy migracja 565 nie może cofnąć 563**.

`C1-2` **osobno i sama**: diff w 810 plikach nie może iść równolegle z niczym innym.

### Fala 5 — „księga i niezmienniki w schemacie" (3–5 dni)

`F2-1` → `F2-3` (etapami) → `B1-B0a`, `B1-B0b`, `F2-7`, `D2-M10`.

`F2-1` pierwsze, bo daje **pomiar**; `F2-3` drugie, bo bez pomiaru nie wiadomo, ile ścieżek
zapali. Oba zapalą się szeroko — planuj jako raport, nie jako czerwony build.

### Fala 6 — „jednostki i koszt" (**zablokowana**)

`B1-B2` → `B1-A2` → `B1-A3`, plus `F2-5b` i `D2-L2` jako bramki na klasę.

**Nie zaczynać bez odpowiedzi na pytanie o backfill `item_cost_history`.** Naprawa kodu bez
decyzji o danych historycznych **pogarsza stan** — naprawiony rollup przemnoży zatrute
wartości poprawnie, czyli je utrwali.

### Fala 7 — „podziały o niskim ryzyku"

`B2-13` → `B2-05` → `B2-08` → `B2-09` → `C2-5` → `B2-01-przegląd`.

Kolejność rosnącego ryzyka: pierwsze trzy **nie przesuwają żadnej granicy commitu**
(to przenoszenie funkcji między plikami), `B2-09` uczy zespołu kształtu `Core(ctx,…)`
**zanim** dotknie zapisów, `B2-01-przegląd` na końcu i dopiero po `D2-L5`.

**Przed startem przeczytać listę czterech transakcji zapisujących ponad 200 linii**
(`consume-material-actions.ts:447-964` = 518 linii / 6 zapisów, `ship-actions.ts`,
`create-draft.ts`, `save-draft.ts`) — to jest lista miejsc, gdzie zwolnić.

### Fala 8 — 👤 decyzje właściciela

Warstwa 8. **Nie do zlecenia.** Dziesięć pytań; każde odblokowuje pozycję o dużym zysku.
Trzy z nich to jedno kliknięcie albo jedno spojrzenie (Vercel Settings→Git; czy `typecheck`
jest required; czy `cascade-engine` jest planowany).

### Poza falami — osobne kampanie

`B1-B0c` (wspólny pisarz księgi), `B2-02` (`app/(npd)` → `lib/npd`), `A1-07` (163 eksporty),
`D1-05` (kształt akcji, poza krokiem 1), `A1-11` (71 martwych kolumn), `C1-2`.

---

## 5. Zbieżności między torami

Tory pracowały rozłącznie i nie czytały nawzajem swoich raportów. Tam, gdzie kilka z nich
**doszło do tego samego z różnych stron**, pewność jest wyższa niż przy jakimkolwiek
pojedynczym pomiarze. To jest najmocniejszy sygnał w całym materiale.

### Z1 · `withOrgContext` zatwierdza przy `return` — **3 tory, jeden defekt**

| tor | co zmierzył | z której strony |
|---|---|---|
| **B2** | mechanizm: `with-org-context.ts:366-368` (`action()` → `commit` → `return`). **56 bloków** `try`-z-zapisami-i-`catch`-który-`return`uje, **41 bez ani jednego `throw`** | czytanie kodu, AST |
| **D2** | ta reguła **istnieje jako reguła ESLint** — `monopilot/no-ok-false-in-org-context`, severity **`warn`**, **1 328 ostrzeżeń**, `pnpm -r lint` → **exit 0** | uruchomienie bramki |
| **D1** | **nie zdążył policzyć.** Zapisał wprost: *„Wiem z pamięci kampanii, że klasa istniała (3 wystąpienia, 30.07); nie policzyłem jej dzisiaj. Nie traktować braku pozycji jako dowodu, że jest czysto"* | — |
| **E1** | ta sama pułapka jest **udokumentowana w `AGENTS.md`** w sekcji „Recurring gotchas — learned the hard way" | czytanie dokumentacji procesu |

**Co z tego wynika, czego żaden tor nie napisał sam:** defekt jest znany, opisany w dokumentacji
dla agentów, **ma napisaną bramkę** — i ta bramka mierzy 1 328 przypadków, nie blokując ani
jednego. To nie jest „nie wiedzieliśmy". To jest „wiedzieliśmy, napisaliśmy strażnika
i ustawiliśmy go na `warn`".

Sąsiedni, **przeciwny** wektor tej samej mechaniki (C2-5): `revalidatePath` wołany **wewnątrz**
callbacku **rzuca** poza zakresem żądania → `withOrgContext` **wycofuje całą transakcję**,
udana praca znika, a użytkownik dostaje `persistence_failed` i ponawia w duplikat.
34 wystąpienia. Ta sama funkcja, ten sam plik, dwa przeciwne sposoby przegrania.

### Z2 · Ten sam kształt predykatu RLS co w migracji 563 — **naprawiono JEDEN**

- **C1-1**: `app.current_org_id()` siedzi w **307 politykach RLS**; funkcja robi JOIN dwóch
  tabel = **3 bufory na wywołanie**, wykonywana **raz na wiersz**. Zmierzone: **1 545 ms → 163 ms**,
  bufory **905 443 → 4 079**.
- **C1-2**: ta sama funkcja **3 651 razy w SQL aplikacji**, 810 plików. Siedem wywołań
  w jednym zapytaniu ekranu Ruchów Magazynowych.
- **C1-3**: mig 563 przepisała 10 polityk; **3 z migracji 551 zostały w starym kształcie**.
- **Migracja 563 naprawiła DOKŁADNIE JEDEN taki predykat** (`app.user_can_see_site`) i zmierzyła
  go jako 10 995 ms → 90,9 ms.

**Wzorzec, nie incydent:** ktoś znalazł per-wierszowe wywołanie funkcji w predykacie RLS,
zmierzył 120-krotną poprawę, naprawił **jedno wystąpienie** i nie sprawdził, czy ten sam kształt
występuje gdzie indziej. Występuje — **307 razy w bazie i 3 651 razy w kodzie**.
I **nie ma dziś strażnika**, który powstrzymałby migrację 565 przed napisaniem go po raz 308:
wzorzec do skopiowania nadal leży w mig 551.

### Z3 · Fałszywa zieleń — **8 torów, 12 niezależnych mechanizmów**

Najgęstsza zbieżność w całym audycie. Każdy wiersz to **inny sposób**, w jaki „zielono" nie
znaczy „sprawdzono":

| mechanizm | liczba | tor |
|---|---|---|
| bramka dryfu schematu **trwale czerwona** → `migration-check`, `playwright`, `storybook-build` nie mają jak wystartować | 3 joby | D2-M1 · A2-04 |
| `pnpm -r test` bez `--no-bail`; `apps/web` **ostatni** w kolejności | cała suita web | D2-M7 |
| suita UI za `&&` po czerwonej suicie node | **3 588 testów, 38 czerwonych niewidocznych** | C2-4 · D2-M8 · F2 |
| `.pg.test.ts` z `describe.skip` bez `DATABASE_URL` | **42 z 43 plików** | F2-2 |
| vitest raportuje awarię `beforeAll` jako `skipped`, nie `failed` | 39 plików | F2-2 |
| flaga `RLS_LIVE_TESTS` **nie występuje w `.github/workflows/` ani razu**, a komentarz twierdzi, że jest ustawiona „in Docker-enabled CI" | 14 testów izolacji organizacji | F2-2 |
| glob playwrighta bez `globstar` → `e2e/*/*.spec.ts` | **11 plików z 381 testów** | F2-2 |
| `pnpm -r typecheck` melduje 0 po skompilowaniu 10 z 23 projektów (**sonda: wstawiony błąd typu → exit 0**) | 13 pakietów | D1-01 · A2-05 · D2-L7 |
| `typecheck` **w ogóle nie widzi testów** (`exclude` w tsconfig); osobny `typecheck:tests` ma **1 722 błędy** i **zero** odwołań w CI | 1 722 | D2-M5/M6 |
| lint na TypeScripcie egzekwuje **cztery** reguły własne; **wszystkie** `@typescript-eslint/*` wyłączone | — | D2-M4 |
| dokumentacja jakości uczy komendy uruchamiającej **zero** testów; jej wyjście przez `\| tail` daje **rc=0** | 3 pliki, 6 linii | E1-2.1 |
| bare `ls` przechwycony przez hook rtk zwraca **pustkę z kodem 0** | — | F1 |
| 5 plików testowych poza workspace — nigdy się nie uruchomiły | 5 | A2-07 |
| duplikat suity liczy te same 14 testów dwa razy | 28 zamiast 14 | A1-01 · C2 |
| próba odtworzeniowa odtwarza **pusty plik** i sprawdza tabele skasowane mig 404 | — | A2-20 · D2-M9 |
| `storybook-build` ma `continue-on-error`, gdy narzędzie nie startuje | — | A2-11 |
| martwe ziarno + zielony test, który **czyta plik z dysku** zamiast bazy | — | A2-19 |
| 17 testów integracyjnych na 5 tabel usuniętych mig 404 | 17 | A2-08 |

**Piętro, którego nie było w poprzednich audytach — „zieleń przez pominięcie wewnątrz
techniki, którą właśnie polecamy":** F2 zauważył, że `changeover-actions.ts:307` zawiera
**dosłowny bajt NUL**, przez co `rg` i `grep` po cichu pomijają plik z logiką świadectwa
alergenowego. Test kontraktowy czytający źródło **pominąłby ten plik i zameldował zieleń**.
Stąd żelazna reguła F2: **każdy taki test musi mieć asercję nie-pustości** („wczytałem N plików,
N > oczekiwane"). Bez tego jest tylko droższym sposobem na fałszywą zieleń.

### Z4 · Kod, który istnieje i jest wyłączony — **6 torów**

| co | stan | tor |
|---|---|---|
| Sentry + OpenTelemetry + PostHog | zbudowane, przetestowane, z `redactBeforeSend`; **15 zmiennych na prodzie, żadna `SENTRY_*`/`POSTHOG_*`/`OTEL_*`**. Sentry sam się wycisza jednym `if (!dsn)` | E2 |
| wzór uzgadniania księgi (`LEDGER_RECONCILIATION_SQL`) | `const` w pliku testowym + **druga kopia** w innym; **obie w plikach, które cicho się pomijają** → nie da się tego zaimportować, więc każdy napisze swój | F2 |
| `_meta/runs/launch-batch.sh` — worktree + klon bazy + prompt per tor, jednym wywołaniem | **napisany i zapomniany**; równolegle `test-db.sh` ma **3 klony** na kilkanaście torów | F1 |
| `scripts/test-db.sh` (`urls`, `reset t1`) + `~/.claude/scripts/worktree-bootstrap.sh` | **dwa z pięciu bólów mają już zbudowane narzędzie, którego nikt nie podpiął pod agentów** | E1 |
| 7 skryptów-strażników | nikt ich nie woła; **dwa przechodzą dziś** → podpięcie jest darmowe. README twierdzi, że jeden „fails CI" — nieprawda | A2-09 |
| `apps/worker` (3 860 linii, `JobRegistry` z `AbortController` i wygaszaniem) | **napisany porządnie, nie wdrożony** — 20 projektów na Vercelu, żadnego workera; 4 z 6 zadań nie ma odpowiednika w cronach | A2-12 |
| moduł inwentaryzacji | `status` ma 5 wartości, tworzenie zapisuje `open`, **żadna akcja nie wykonuje `open → counting`**; zmierzone `counted_qty = null`. **Ślepy zaułek od migracji 318** | F2-5d |
| `lib/shared/sql-placeholders.ts` | **10 plików testowych, zero produkcyjnych** — czyli każde miejsce buduje listy `$1,$2,…` po swojemu | A1-10 |
| 3 pakiety + model Drizzle | `cascade-engine`/`storage`/`queries` = **5 793 linie** bez konsumenta; `packages/db/schema` = **11 248 linii** i **zero importów z zewnątrz** | A2-01/03 |
| 62 akcje serwerowe + 22 pliki | żyją **wyłącznie przez test** — w tym **cały łańcuch konfiguracji SSO** | A1-06/10 |

**Wspólny wniosek:** w każdym z tych przypadków ktoś wykonał trudną część pracy. Brakuje
ostatniego kroku — zmiennej środowiskowej, `export`a, wpisu w `crons`, podpięcia do CI.
To zmienia szacunek kosztu całej kampanii: **duża część pozycji to nie budowanie, tylko włączanie.**

### Z5 · Jednostka × koszt — **4 tory, cztery różne warstwy tej samej pomyłki**

- **B1-A2**: naprawa błędu tysiąckrotnego objęła **2 z 8** miejsc. Sześć nadal liczy bez konwersji.
- **B1-A3**: **6 niezależnych implementacji** „sprowadź do jednostki bazowej", 2 z cichymi rezerwami;
  stała `* 0.45359237` dla `lb`, **której nie ma w katalogu jednostek**.
- **F2-5b**: reguła kontraktowa zamykająca **klasę**; zapala się dziś na 3 żywych rodzeństwach.
  Plus: `wo_outputs.qty_kg` **nie jest w kilogramach** — regułę trzeba oprzeć na nazwie kolumny,
  bo **przyrostek kłamie**.
- **D2-L2**: `compute_intermediate_unit_cost` obsługuje **tylko `'kg'`** i ma **zero wywołań
  w całym repo, także w testach**.
- **B1-B2**: ten sam loader wklejony 3× — czyli naprawa musiałaby wejść sześć razy.

Migracja **501 istnieje wyłącznie dlatego**, że kopia SQL rozjechała się z kopią TS. Jej własny
nagłówek to przyznaje: *„Aligns SQL with apps/web/lib/npd/wip-cost.ts"*. **To nie jest teza —
to udokumentowany precedens tego samego rozjazdu.**

### Z6 · Zakres zakładu (`site_id`) — **5 torów**

`F2-4` (45 tabel niesie `site_id`, **ani jedna nie jest `NOT NULL`**; mig 334 mówi wprost
*„app code fail-CLOSES new writes — NOT enforced here"*) · `A2-21` (mig 549 — pre-gate repair —
**nie ma jej w gicie**) · `D2-Ż7` (post-check mig 551 **udowodniony żywy**: wstawiony wiersz
z `site_id = NULL` → `exit 3`, fail-closed) · `C1-3` (3 polityki widoczności w starym kształcie) ·
`D1-08` (bramka międzyzakładowa skanera pod `if (isUuid)`) · `A1-07` (`scannerCanSeeSite`
i `scannerWoSiteAccess` — **dwie funkcje kontroli dostępu do zakładu, zero wywołań**).

Do tego `F2` cytuje trzy **żywe gałęzie fail-open** w `app.user_can_see_site` (mig 383:22-52),
w tym „zero przypisań do zakładu → bez ograniczeń (**każdy użytkownik dzisiaj**)", a mig 466
to **migracja złożona wyłącznie z komentarza**, dokumentująca to jako znane TODO.

**Wniosek:** widoczność zakładu ma dziś bramkę bazodanową, która działa i odmawia (551),
naprawę, która nie może się uruchomić (557 sortuje się **po** bramce), naprawę przygotowawczą,
której **nie ma w gicie** (549), funkcję z trzema fail-openami i dwie martwe funkcje kontroli
dostępu. `F2-4` (`CHECK … NOT VALID`, jedna godzina) rozcina to w obie strony naraz.

### Z7 · Trzy katalogi tego samego — **wzorzec, nie przypadek**

- `_meta/i18n-staging/` — trzeci katalog tłumaczeń, **importowany przez 42 moduły produkcyjne**,
  poza **wszystkimi** bramkami i18n; pominięty przy commicie **już raz położył ~20 modułów** (D1-04, B2-04, C2)
- `.agents/skills/` — trzeci katalog skilli, **poza gitem**, **10 rozjechanych `SKILL.md`** (E1-2.2)
- `apps/web/apps/web/` — zagnieżdżona kopia suity testowej (A1-01, C2)
- `app/(npd)` ↔ `app/[locale]/(app)/(npd)` — dwa drzewa, **testy skrzyżowane między nimi** (A1-09, B1-C3, B2-02)

E1 nazywa to sam: *„dokładnie ten sam wzorzec, który już Cię ugryzł przy `_meta/i18n-staging/`"*.
Każdy `grep -r` po repo trafia w obie kopie; każda poprawka musi być zrobiona dwa razy.

### Z8 · Granica własności toru **wytwarza duplikaty** — samo repo to dokumentuje

`live-wip-cost-query.ts:3` mówi wprost: *„SQL mirrors costing/compute.ts … compute.ts itself
is owned by another wave lane and must not be edited here."*

**Kopia powstała z powodu organizacyjnego, nie technicznego.** 61 z 75 linii bajt w bajt.
To jest jedyna pozycja w całym audycie, która diagnozuje **sposób prowadzenia kampanii**,
a nie kod — i warto ją przeczytać przed zaplanowaniem następnych fal.

### Z9 · Ścieżka pieniężna — **4 tory, żaden nie patrzył na nią wprost**

`D2-M10` (ograniczenia FIFO z mig 199 **nie istnieją** — `drop table` w mig 404 zabił je po cichu) ·
`A1-07` (`computeWacDebitDelta` i `applyWacDebitDelta` — **martwe funkcje w ścieżce WAC**) ·
`F2` (`upsert-wac.ts:56` — `numeric(14,3)` **zeruje przyjęcie subgramowe i porzuca pieniądze**;
`wac-qty-kg-sql.ts:27-29` — gałąź `g` odpala się **bezwarunkowo**, bez sprawdzenia jednostki
bazowej) · `B1` (potwierdza dobrą wiadomość: **WAC ma dokładnie jedną implementację**, brak
bliźniaka w triggerach).

Jedyne miejsce, gdzie zbieżność mówi „jest lepiej, niż się wydaje" — implementacja jest jedna,
ale **ograniczenia wokół niej zniknęły, dwie funkcje pomocnicze umarły, a skala kolumny gubi grosze.**

### Z10 · Reguła zapisana dwa razy — **raz w bazie, raz w kodzie — pęka ta w kodzie**

To jest **empiryczna odpowiedź** na pytanie „czy warto przenosić niezmienniki do schematu",
i pochodzi z tego repozytorium:

> Reguła ATP istnieje **dwa razy**: jako trigger na `lab_results` (mig 187) i jako TypeScript
> w produkcji. Po roku mają różne wartości. **Pękła ta w TypeScripcie** (F2).

Tę samą strukturę widać w: `BOM_LINE_BASE_QTY_SQL` vs `normalizeItemQuantityToBase` (B1 —
**ale tu autor świadomie przypiął obie testem, i to jest wzorzec do naśladowania**),
`item-create-wizard.tsx:464-474` *„mirroring DB CHECK (mig 267)"* (B2-14), `v_active_holds`
vs 10 kopii predykatu (B1-A5), `PO_TRANSITIONS` serwer vs klient (B1-A6).

**Rozstrzygnięcie, które daje materiał:** duplikacja kod↔baza jest do przyjęcia **tylko
z testem przypinającym**. Bez niego rozjazd jest kwestią czasu, nie prawdopodobieństwa.

---

## 6. Sprzeczności między torami

Nie rozstrzygam arbitralnie. Przy każdej: **obie wersje, kto ma dowód, kto tezę, i czego
brakuje do rozstrzygnięcia.**

### S1 · Znak w `stock_moves` — **czysto czy cztery mechanizmy?**

**D1 twierdzi: czysto, i pilnowane przez bazę.**
- Ograniczenie `stock_moves_quantity_sign_check (move_type = 'adjustment' or quantity >= 0)`
  z mig 193 **nigdy nie było zmieniane** — `grep` po całym katalogu migracji: jedno trafienie.
- Przejrzał **15 miejsc zapisu**; każde, które potrzebuje znaku, używa `'adjustment'`
  (wymienione z liniami). Pozostałe typy piszą dodatnio.
- **Kontrola przeciwna:** *„Szukałem sumowania księgi, które musiałoby znać kierunek per typ:
  `sum(quantity)` nad `stock_moves` — **zero trafień w całym repo**. Znak nie zasila dziś
  żadnego salda, więc rozjazd nie miałby gdzie wyjść."* → **hipoteza obalona.**

**B1 twierdzi: znak wyznaczają cztery różne mechanizmy w czterech modułach.**
- negacja przez `bigint` (3 miejsca, dwa to **identyczna linia**) · negacja przez szablon
  łańcucha (4 miejsca) · funkcja `negateDecimalString` (**4 kopie bajt w bajt**) ·
  **wnioskowanie kierunku z wiodącego minusa** (`input.quantity.startsWith('-')` decyduje,
  czy wypełnić `from_location_id` czy `to_location_id` — mechanizm **niewystępujący nigdzie indziej**).
- **Trzy rozjazdy księgowe naprawione tej nocy** (`58900b69`, `b59a5285`, `1308ce11`) —
  commity, nie teza.
- Reguła „zwrot z anulowanej wysyłki to `move_type='return'` z ilością **dodatnią**, mimo
  że towar wraca" jest zapisana **wyłącznie w treści commita** — w kodzie nie ma o tym słowa.

**Rozstrzygnięcie części sporu — jest w trzecim raporcie.**
Kontrola przeciwna D1 jest **literalnie prawdziwa i mimo to prowadzi do złego wniosku**.
F2 cytuje wzór, który sumuje księgę ze znakiem per typ:

```sql
sum(case when sm.move_type = 'receipt' then sm.quantity
         when sm.move_type in ('issue','consume_to_wo','return') then -sm.quantity
         when sm.move_type = 'adjustment' then sm.quantity else 0 end)
```

Sprawdziłem to grepem: literał `sum(quantity)` występuje w repo **11 razy — ale nad
`license_plates`, nie nad `stock_moves`**. Wzór księgowy jest napisany jako `sum(case … end)`
i żyje w **dwóch plikach `.pg.test.ts`** (`stock-moves-production-ledger` i
`wave8-shipping-integrity`) — czyli **dokładnie tam, gdzie D1 nie szukał, i w plikach, które
cicho się pomijają**, więc nie pokazałby ich też żaden pomiar uruchomieniowy.

| | werdykt |
|---|---|
| **„baza pilnuje znaku"** | **D1 ma rację, i B1 to potwierdza** (punkt 11 własnej sekcji „co jest dobre"). Bezsporne. |
| **„znak nie zasila żadnego salda"** | **obalone.** Saldo jest liczone — w dwóch plikach, które się nie uruchamiają. |
| **„jeden mechanizm czy cztery"** | **B1 ma mocniejszy dowód**: 4 zmierzone kopie + 3 awarie produkcyjne w jedną dobę. D1 przejrzał 15 miejsc **zapisu** i pytał o poprawność wyniku; B1 pytał o **liczbę mechanizmów** i policzył je. To dwa różne pytania, i oba mają poprawne odpowiedzi. |

**Czego brakuje, żeby domknąć:** uruchomić wzór uzgadniania na realnej bazie — czyli
**F2-1 + F2-2ab**. Dopóki te dwa pliki się pomijają, „znak jest w porządku" jest twierdzeniem
bez pomiaru, niezależnie od tego, ile miejsc ktoś przeczyta.

### S2 · RODO — **teza A2 jest fałszywa, zweryfikowana**

**A2 twierdzi:** *„usuwanie danych RODO nie wykonuje się nigdzie"* — bo `runErasure` ma zero
trafień w `apps/web`, a dyspozytor woła go wyłącznie z `apps/worker`, który nie jest wdrożony.
A2 nazywa to **dziurą zgodności**, nie długiem technicznym.

**Weryfikacja (koordynator) — teza obalona:** `apps/web/app/(admin)/gdpr/_actions/redact-user.ts`
istnieje, jest gatowany uprawnieniem `gdpr.erasure.execute` i woła funkcję SQL
`public.gdpr_redact_user_pii` (mig 115) — a ta funkcja **jest ciałem handlera NPD**.
`register-all.ts` rejestruje **dokładnie jedną** domenę (`npd`), więc ścieżka webowa pokrywa
dziś **100 % zarejestrowanych domen**. **Usuwanie danych działa.**

**Prawdziwa pozycja jest inna i lepsza.** `register-all.ts` obiecuje w komentarzu:
*„any new db-owned erasure domain registers here, and is therefore wired into production
by construction"*. **Ta obietnica jest nieprawdziwa** — jedynym konsumentem tego pliku jest
`apps/worker`, którego na Vercelu nie ma (20 projektów, żadnego workera; sześć cronów to
`drift`, `d365-pull`, `catch-weight-variance`, `outbox`, `reporting-refresh`, `pm-schedule-due`).

→ **Zapisz to jako: komentarz, który gwarantuje powstanie dziury przy następnej domenie.
Ryzyko przyszłe, nie obecne.** Szersza teza A2 („`apps/worker` nie jest wdrażany") **jest
potwierdzona pomiarem**, ale brak projektu na Vercelu **nie dowodzi braku hostingu gdzie
indziej** — A2 sam to zastrzegł.

**To jest wzorcowy przykład, po co robi się weryfikację krzyżową:** grep po nazwie symbolu
w jednym katalogu dał tezę o utracie zgodności regulacyjnej. Przejście ścieżką wywołania
ją obaliło i **zamieniło w lepszą, mniejszą, prawdziwą pozycję.**

### S3 · `shipment_boxes_sscc_mod10_check` — **korekta cudzej tezy, z zapytaniem do bazy**

**Teza (sonda podrzędna D2):** cyfra kontrolna SSCC — identyfikowalność palety w wysyłce —
została usunięta i nie ma następcy.

**D2: nieprawda.** Zapytanie do żywej bazy pokazuje **oba** ograniczenia jako żywe
(`shipment_boxes_sscc_check` i `shipment_boxes_sscc_mod10_check`), przywrócone migracją
`459-generate-sscc-validate-before-increment.sql`.

**Kto ma dowód:** D2, i to najmocniejszego rodzaju — odpytanie działającej bazy.
D2 zostawia to w raporcie świadomie, jako **regułę metodyczną**: *„czytanie migracji bez
odpytania bazy jest niewystarczające"*. Ta sama reguła obowiązuje wszystkich pozostałych —
B1 zastosował ją sam (kontrola żywotności `compute_intermediate_unit_cost` przez 491/492/**501**
i `seed_units_of_measure_for_org` przez 064/447/**449**), A2 nie mógł (nie dostał bazy).

### S4 · 13 pakietów bez `typecheck` — **jak groźne?** Trzy pomiary, trzy różne wnioski

| tor | sonda | wniosek |
|---|---|---|
| **D1-01** | błąd typu w `packages/rule-engine/src/executor.ts` → `pnpm -r typecheck` **exit 0** | **„żaden proces `tsc` w tym repozytorium nigdy nie czyta ich źródeł"** → Fala A, **przed wszystkim innym** |
| **D2-L7** | błąd typu w `packages/rbac/src/grant.ts` → **został złapany**, bo `apps/web` kompiluje ich źródła przez ścieżki | **„częściowo już chronione, nie panikować"** → realna luka to tylko pakiety **nieimportowane** przez `apps/web`/`apps/worker` |
| **A2-05** | `tsc --noEmit` na `packages/db` pod ustawieniami **bazowymi** → **6 realnych błędów** (`TS2835`) | luka jest realna **także dla pakietów importowanych** |

**Wszystkie trzy są prawdziwe, i dopiero razem dają obraz gorszy niż każdy z osobna.**
Brakujący element to **A2-17**: siedem `tsconfig.json` nie dziedziczy z bazy i używa
`moduleResolution: bundler`. Czyli `apps/web` **kompiluje ich źródła — ale swoimi
ustawieniami**, więc błędy, które pojawiają się wyłącznie pod `NodeNext`, **pozostają
niewidoczne u konsumenta, który dziedziczy z bazy** (`apps/worker`). D1 wybrał do sondy
pakiet nieimportowany, D2 wybrał importowany, i obaj dostali poprawne odpowiedzi na dwa
różne pytania.

**Praktyczny skutek dla planu:** nie zaczynać od dopisania 13 skryptów (D1), tylko od
**A2-17 → A2-05** — bez tego bramka będzie mierzyć nieprawdę i D2 miałby rację, że nie warto
panikować.

### S5 · Ile jest twardych napisów: **911 czy 6 804?**

Ten sam skrypt, dwa przebiegi, dwa wyniki. **A2-06: 911** (`grep -c "^\s\+apps/web"` na
wyjściu). **D2-M2: 6 804 znaleziska.** To nie jest sprzeczność merytoryczna — to dwie różne
metody liczenia tego samego wyjścia (prawdopodobnie: linie z odsądzoną ścieżką `apps/web`
kontra wszystkie znaleziska we wszystkich katalogach).

**Nikt nie ma tu „dowodu" nad drugim.** Obie liczby są zmierzone i obie mogą być poprawne
dla swojego pytania. **Czego brakuje:** jednego przebiegu, którego wyjście staje się linią
bazową — i to jest i tak pierwszy krok pozycji A2-06, więc rozstrzygnie się samo.

### S6 · Ile plików ma `_meta/i18n-staging/`: **18, 37 czy 42?**

**B2-04: 18** różnych plików JSON, 39 importów · **D1-04: 37** plików / **3 538 kluczy** /
`grep -ra "i18n-staging" apps/web -l` → **42 pliki** · **C2: 37 plików / 492 kB**, a `_meta/`
w ogóle dotyka **90 modułów produkcyjnych**.

Znowu: **różne pytania, nie sprzeczne odpowiedzi.** 18 = plików faktycznie importowanych
(B2), 37 = plików w katalogu (D1, C2), 42 = plików w `apps/web`, które **wspominają**
katalog (D1), 90 = modułów sięgających do `_meta/` w ogóle (C2).
**Do zaplanowania fali trzeba tego jednego pomiaru, który się liczy: ile plików JSON trzeba
przenieść i ilu importów dotknąć.** Dziś nie ma go w żadnym raporcie.

### S7 · Czy `app/(npd)` jest martwe? — **trzy tory, trzy podejścia, ta sama pułapka**

**Nikt nie twierdzi, że jest martwe** — ale **wszyscy trzej byli o krok**, i to jest cenniejsze
niż zgodność:

- **A1** postawił tezę o porzuconym drzewie i **sam ją obalił**: strony pod `[locale]` importują
  stamtąd implementację wprost. Wniosek metodyczny A1: *„w tym repo «krótszy plik» częściej
  jest atrapą niż implementacją. Zanim uznasz drzewo za martwe, sprawdź, w którą stronę idzie
  import."* Realnie martwych: **7 z 236**.
- **C2** zapisał: *„Byłem o krok od zgłoszenia tego jako 236 plików do skasowania."*
- **B2** nigdy nie powiedział „martwe" — powiedział **„źle położone"**: biblioteka współdzielona
  w drzewie routingu App Routera, 137 importerów spoza katalogu.

**Napięcie do zapisania, żeby nie zlało się w jedną pozycję:** martwe są **konkretne pliki
pulpitu** (4 kopie, żadna renderowana — potwierdzone przez A1-09 i B1-C3, a kopia sama się
do tego przyznaje w komentarzu testu: *„Stale route contract: the compact preview
implementation moved under the localized NPD route tree"*), **nie drzewo**.
Pozycja „usuń 4 pliki" i pozycja „przenieś 236 plików do `lib/`" to dwie różne rzeczy
o różnym koszcie i różnym ryzyku.

### S8 · Ile wierszy ma `site_id IS NULL`: **7, 11, 25 czy 37?**

**F2 prostuje samo zlecenie:** *„Liczba 37 nie występuje w żadnym pomiarze tego repozytorium."*
`RAPORT-PUSTY-ZAKLAD.md` sam się koryguje (7 na `monopilot`, 11 na `monopilot_t1` —
**dwie różne bazy**), a mig 549 cytuje suchy przebieg na produkcji: **19 + 4 + 2 = 25**.

**Kto ma dowód:** nikt na dziś. **Czego brakuje:** świeżego `SELECT`-a przed wymiarowaniem
naprawy — i F2 mówi to wprost: *„nie brać żadnej z tych liczb"*.

**Dodatkowa komplikacja, której F2 nie znał:** cytuje nagłówek migracji **549** jako dowód
zakleszczenia kolejnościowego (*„557 repairs license_plates → runs AFTER the gate. Too late."*).
**A2-21 zmierzył, że pliku 549 nie ma w gicie.** F2 zbudował poprawne rozumowanie na
artefakcie, którego CI i build Vercela **nigdy nie zobaczą**. Wniosek nie upada — `CHECK …
NOT VALID` rozcina zakleszczenie niezależnie od 549 — ale **kolejność zadań się zmienia:
najpierw 549 do gita (albo świadomie usunąć), potem cokolwiek innego w tym obszarze.**

### S9 · Regeneracja wzorca schematu: **S czy M?**

**D2-L6: S** — *„`pg_dump` z bazy po pełnym łańcuchu → `packages/db/__expected__/schema.sql`.
Ryzyko: żadne — to plik odniesienia, nie kod."*
**A2-04: M** — *„**największe ryzyko to zrobić to źle**. Przegenerowanie z produkcji zamrozi
jako «wzorzec» wszystko, co ktoś kiedyś dodał ręcznie poza migracjami."*

**Mocniejszy jest A2**, z dwóch powodów, których D2 nie miał: (1) A2 przeliczył **330
instrukcji `create table`** i ustalił, że **165 nie ma odpowiednika we wzorcu**, a pierwsza
nieobecna tabela to `public.stock_moves` — **księga magazynowa, do której odwołuje się 171
miejsc w kodzie**; (2) A2 znalazł **migrację 549 poza gitem**, więc „pełny łańcuch" na dysku
i „pełny łańcuch" w repozytorium to dziś **dwie różne rzeczy**.

**Werdykt: koszt M, kolejność wiążąca (A2-21 przed A2-04), regeneracja wyłącznie z czystej
bazy po `pnpm db:migrate`, z obejrzeniem diffu przed zatwierdzeniem.**
Obaj zgadzają się co do skutku: to odblokowuje `migration-check`, `playwright` i `storybook-build`.

---

## 7. Białe plamy — lista zleceń na następną rundę

Każdy tor napisał, czego **nie** sprawdził. Zebrane w jedno miejsce, ta lista jest równie
cenna co pozycje: mówi, gdzie „brak pozycji" **nie znaczy** „sprawdzone i czysto".

### 7.1 · Białe plamy, które inny tor **już wypełnił** (sprawdź, zanim zlecisz)

Cztery pary, w których jeden raport zapisał lukę, a drugi ma na nią odpowiedź:

| kto zapisał lukę | kto ją wypełnił |
|---|---|
| **D2**: *„`check-markers.mjs`, `check-domain-glossary.mjs`, `check-regulatory-staleness.mjs`, `prepare-check-sql.mjs`, `scan-dual-cast-params.py` — nie zdążyłem sprawdzić, czy cokolwiek je uruchamia. NIEPRZETESTOWANE"* | **A2-09**: **nic ich nie uruchamia**; dwa z nich **przechodzą dziś** → podpięcie darmowe; README kłamie, twierdząc, że jeden blokuje CI |
| **C2**: *„473 testy «pominięte» w suicie node to pliki `*.pg.test.ts` bez `DATABASE_URL` … kosztu testów bazodanowych nie znam"* | **F2**: **42 z 43** plików `.pg.test.ts` ma `describe.skip` — to nie jest brak bazy, to **domyślna postawa kodu** |
| **C1**: *„Wzorce N+1 w kodzie — zlecone równolegle, nie wróciło. Punkt 1 zlecenia (helper konwersji jednostek `async` = jedno zapytanie na pozycję) **pozostaje niesprawdzony**"* | **B1-A3** opisuje ten sam helper: `normalizeItemQuantityToBase` jest kanoniczny, **async, jedno zapytanie na pozycję** — i to jest **udokumentowany powód**, dla którego istnieje `BOM_LINE_BASE_QTY_SQL`. Nie N+1 przez pomyłkę, tylko świadomy kompromis przypięty testem |
| **A1**: *„nie znam współczynnika fałszywych trafień dla listy 163 martwych eksportów"* | **podzlecenie (koordynator)**: 30 z 31 ręcznie sprawdzonych prawdziwie martwych ⇒ **~3,2 %, ~5 błędnych na 163** |

### 7.2 · Nic nie zostało uruchomione — pięć raportów opiera się na czytaniu

| tor | co zapisał |
|---|---|
| **B1** | *„Nie uruchomiłem żadnego testu ani builda. Wszystkie pomiary to czytanie kodu, `diff`, `difflib` i `git show`. **Żadna pozycja nie jest odtworzona uruchomieniowo**"* |
| **A2** | *„Nie uruchomiłem żadnej suity testowej. Nie dostałem bazy — wszystkie zajęte były przypisane innym torom"*; twierdzenia o `r13-business-tables.test.ts` i o próbie odtworzeniowej to **analiza statyczna, nie obserwowany wybuch** |
| **A1** | przekierowanie z A1-02 **nieodtworzone** (3 próby padły na rozwiązywanie `next/server` z magazynu pnpm) — a to samo jest powodem, dla którego `middleware.test.ts` **mockuje `intlHandler` w całości**, czyli **żaden istniejący test nie sprawdza realnego zachowania warstwy locale** |
| **C2** | *„Ani jeden pomiar czasu nie jest «czysty»"* — `load average` 4,12 → 14,80 przy 10 rdzeniach; build ×3: 31,4 s / 41,5 s / 70,5 s **na tym samym commicie**. **Rozmiary bajtów są wiarygodne**, czasy nie |
| **E1** | *„Nie odpaliłem żadnego z proponowanych hooków"* — cała mechanika hooków i uprawnień pochodzi z dokumentacji, nie z uruchomienia |

**Praktyczny wniosek:** przed każdą falą, która dotyka pozycji z B1 lub A2, **pierwszym
zadaniem toru jest odtworzenie znaleziska**, nie naprawa.

### 7.3 · Produkcja — sześć rzeczy, których nikt nie zmierzył

1. **Skala produkcyjna.** C1 nie zna liczby wierszy w `stock_moves`, `lp_state_history`,
   `audit_log`. **Wszystkie liczby C1 pochodzą z zasiewu 150 000** — i C1 podaje próg
   („przy 10 000 to ~100 ms narzutu, przy milionie ~9 s"), żeby dało się to przeskalować.
2. **Który ekran jest najwolniejszy** — C1 zmierzył **jeden ekran do dna**, bo znalezisko jest
   systemowe. Do reszty potrzeba `pg_stat_statements` **z produkcji**.
3. **Indeksy nieużywane** — celowo pominięte: `pg_stat_user_indexes` z klonu odzwierciedla
   harness testowy, więc **lista z klonu jest bezwartościowa**. Wymaga zrzutu z produkcji;
   to **jedno zapytanie tylko do odczytu**.
4. **Czy `apps/worker` ma hosta poza Vercelem** — brak `Dockerfile`, `fly.toml`, `railway.json`,
   jednostki systemd; **nieobecność w repo nie dowodzi nieobecności w infrastrukturze**.
5. **Czy `_meta/` trafia na Vercel** — B2 sprawdził brak `.vercelignore`, **nie potwierdził
   uruchomieniem**, że build ciągnie te JSON-y z katalogu roboczego.
6. **Czy `typecheck` jest required check** — C2 nie ma dostępu do ustawień repo, a od tego
   zależy, czy C2-2 wolno w ogóle ruszyć.

### 7.4 · Luki wewnątrz zakresu, które tory nazwały same

**Najpoważniejsza, nazwana tak przez własny tor:**
> **D1: bramki uprawnień — pełny przemiot NIE WYKONANY.** *„Zdążyłem tylko potwierdzić, że
> `mwo-actions.ts` gatuje poprawnie. Ilu akcjom zapisu brakuje bramki, czy istnieją opakowania
> modułowe zachowujące się inaczej niż wspólne — nie wykonane. **To najpoważniejsza luka tego
> raportu.**"*
>
> To jest szczególnie niewygodne w zestawieniu z **B1-A1** (15 prywatnych kopii sprawdzania
> uprawnień, 4 różne predykaty) i **A1-07** (dwie martwe funkcje kontroli dostępu do zakładu).
> **Nikt nie policzył, ile akcji zapisu nie ma bramki w ogóle.**

Dalej, w kolejności wartości:

| obszar | stan | tor |
|---|---|---|
| **osiągalność 53 z 56 miejsc `return`=commit** | sprawdzone ręcznie **trzy**. Reszta to **lista do przeglądu, nie lista potwierdzonych defektów** | B2 |
| **gałęzie nieosiągalne i martwe kolumny** | **kategoria w raporcie A1 jest PUSTA** — podzlecenie nie wróciło do toru. Wróciło do koordynatora: **71 martwych kolumn, 19 udowodnionych niezależnie** (patrz A1-11). **Nie zlecać od nowa — zlecić weryfikację pozostałych 52** | A1 + koordynator |
| **kolumny-sieroty na poziomie kolumny** | A2 przeanalizował tylko jawne `drop column` (9) i 2 zmiany nazw tabel. **Klasa „`advanceCohort` na poziomie kolumny" pozostaje niedomknięta** — do tego trzeba postawić bazę i porównać `information_schema` z odwołaniami w kodzie | A2 |
| **`materialize-npd-bom.ts` (1 703 linie)** | **nie czytany.** Trzeci co do wielkości plik logiki w repo | B2 |
| **czy 15 kopii `formatMoney`/`formatQty` zaokrągla różnie** | sprawdzone tylko, **że istnieją**. Bez tego pomiaru pozycja nie kwalifikuje się do fali | B1 |
| **kształty interfejsu poza modalami** | **niezmierzone**: powtórzenia obsługi wyniku akcji w komponentach, powiadomienia, tabele z paginacją i **pole „ilość + jednostka"**. B1: *„to ostatnie jest **najbardziej warte sprawdzenia** — rozjazd w polu ilości ma skutek biznesowy, nie kosmetyczny"* | B1 |
| **asymetria `deleted_at`** | **niezmierzone**: ile jest niezależnych implementacji `withOrgContext` i czy istnieją **pary zapytań na tej samej tabeli, gdzie jedno ma `deleted_at is null`, a drugie nie**. B1: *„ta sama klasa co A1, ale po stronie danych — osobne zlecenie, warto je zlecić"* | B1 |
| **`voided_at`** | niedokończone. Ustalone, że dotyczy `trial_batches` **oraz** `sensory_evaluations` — czyli **więcej tabel, niż mówiła teza**. Nie policzono, czy wszyscy czytelnicy filtrują | D1 |
| **czy komponent renderuje `state:'error'`** | bez tego **D1-06 jest tezą, nie defektem** | D1 |
| **RLS pod rolą `app_user`** | **nie zaczerwienione.** Uwaga metodyczna z `test-db.sh:191`: post-checki migracji chodzą przy **podniesionych** uprawnieniach, więc **nie dowodzą zachowania pod RLS** | D2 |
| **triggery bazy** | **ani jeden nie zaczerwieniony.** NIEPRZETESTOWANE | D2 |
| **118 testów `skipped` mimo ustawionego `DATABASE_URL`** | to **nie** są testy bazodanowe czekające na bazę — pominięcia z innego powodu. **Kandydat na osobną falę: policzyć je i dla każdego ustalić, czy pominięcie jest zamierzone** | D2 |
| **duplikacja w `*.test.ts`** | skaner bloków **celowo pomijał testy**. Może maskować „anty-test" (12 wystąpień tej klasy 30.07) | B1 |
| **granica serwer/klient** | **451 plików `'use client'`, z czego 21 bez haka, handlera i `window`/`document`** — kandydaci na komponenty serwerowe. **NIE zweryfikowano, który jest importowany przez komponent serwerowy** — a tylko takie dają zysk. Lista jest, pozycji nie ma | C2 |
| **obrazy i czcionki** | **nie sprawdzone w ogóle** | C2 |
| **wpływ importów z `_meta/` na czas kompilacji** | zmierzony powierzchownie, **nie da się go rozdzielić** od reszty. Do zmierzenia trzeba przenieść katalog i przebudować — czyli zmiana w drzewie | C2 |
| **`pnpm lint` i czas instalacji zależności** | nie mierzone | C2 |
| **wariant `MergeAppend`** dla ekranu Ruchów | **nie zmierzony** | C1 |
| **zapytania bez `limit`** na rosnących tabelach | zlecone, nie wróciło | C1 |
| **`import()` ze ścieżką w zmiennej w kodzie produkcyjnym** | detektor A1 łapie **tylko literały**. Gdyby taki wzorzec występował, część pozycji A1-07/A1-08 byłaby fałszywa | A1 |
| **czy 8 testów modali psuje się bez martwego `vitest.config.ts`** | nie sprawdzone | A1 |
| **cykle między pakietami przez alias `@monopilot/*`** | **nie były w grafie** — B2 badał tylko importy względne | B2 |
| **zależności wskazywane łańcuchem znaków w konfiguracji** | lista A2-15 wymaga **jeszcze jednego przejścia grepem po `*.config.*`** — tak wypadły `storybook`, `jsdom`, `axe-core` | A2 |
| **czy 11 plików ziarna jest w ogóle stosowanych** | żaden skrypt w `package.json` ich nie uruchamia; **nie prześledzono, czy robią to same migracje** | A2 |
| **`pnpm build` jako bramka · Playwright/E2E** | nie uruchomione. Wzorzec „job wykonujący 0 z 381" **potwierdzony pośrednio** (playwright zależy od `migration-check`) | D2 |

### 7.5 · Badanie w sieci — **osiem pytań, na które nikt nie odpowiedział**

E2 zapisał uczciwie: *„trzy zlecone zadania badawcze w sieci nie wróciły. Nie zacytowałem
ani jednego wyniku, którego nie widziałem — pozycje **[Z PAMIĘCI]** są oznaczone właśnie dlatego."*

1. **Czy `--read-only` w Supabase MCP wymusza rolę read-only w Postgresie, czy to tylko
   sugestia w prompcie?** — **rozstrzyga, czy pozycja 3.4 jest „warto" czy „odradzam całkowicie".**
   Do tego: znaleźć opublikowane badanie o wstrzykiwaniu poleceń **przez treść wierszy w bazie**
   i oficjalne stanowisko Supabase wobec produkcji.
2. **Czy Vercel MCP da się postawić na długowiecznym tokenie API zamiast OAuth** — jeśli tak,
   nocna praca przestaje się wywracać o re-autoryzację.
3. **Retencja i plan Vercela** — ile historii błędów runtime realnie widać i czy
   `get_runtime_errors` ma z czego czytać.
4. **Darmowy pułap Sentry** — limity zdarzeń i retencji.
5. **Co dokładnie czyści `redactBeforeSend`** w `packages/observability` — **to jest lokalne,
   do przeczytania w kodzie, i jest warunkiem wstępnym włączenia Sentry na produkcji.**
6. **Czy `-p/--profile` w `codex exec` faktycznie nakłada `$CODEX_HOME/<nazwa>.config.toml`** —
   najczystsza droga do „jeden zestaw ustawień toru zamiast pięciu `-c`" (F1).
7. **Czy `permissions.deny` bije `defaultMode: "bypassPermissions"`** w 2.1.221 — F1 opiera
   na tym całe zalecenie i **nie zweryfikował uruchomieniem**; E1 twierdzi z dokumentacji, że tak.
8. **Czy da się zawęzić `network_access` do localhost** — F1 nie znalazł takiej opcji w 0.144.1,
   ale nie przeczesał pełnego `config-reference`. Gdyby istniała, **ryzyko F1-2 spada do zera**.

### 7.6 · Testy niewykonane, które by rozstrzygnęły

- **`curl -I http://localhost:3000/settings/security`** na dev-serwerze → zamyka A1-02
  (C2 zrobił analogiczny test dla `/onboarding` i dostał 307 — więc mechanizm jest potwierdzony,
  brakuje tego jednego wywołania dla tras `(admin)`).
- **Uruchomić wzór uzgadniania księgi na realnej bazie** → rozstrzyga S1 i wymiaruje F2-1.
- **Świeży `SELECT count(*) where site_id is null`** na produkcji → wymiaruje F2-4 (S8).
- **Jeden przebieg `lint-no-hardcoded-strings`** z zapisanym wyjściem → rozstrzyga S5
  i **jest i tak pierwszym krokiem** pozycji A2-06.
- **Odtworzenie wczorajszej migracji pod `network_access=true`** → zamieniłoby zalecenie F1-2
  z prawdopodobnego w udowodnione.
- **Test „czy hook projektowy `PreToolUse` dokłada się do globalnego `rtk hook claude`,
  czy go przesłania"** — E1: *„zajmuje minutę"*, a od tego zależy kształt `bash-guard.sh`.

---

## Załącznik — stan drzewa

Żaden tor nie zmienił kodu. Wszystkie sondy cofnięte, `git status` czysty w każdym raporcie,
który sondował (D2 ma pełną tabelę cofnięć, D1 jedną sondę cofniętą,
C1 wszystkie `alter policy` w transakcji zakończonej `rollback`).

Niezacommitowany `production/changeover/_actions/changeover-data.ts` **nie był dotykany
przez nikogo** — potwierdzone jawnie w B2, D1 i D2.
