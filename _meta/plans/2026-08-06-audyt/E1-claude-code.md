# E1 — Jak ulepszyć Claude Code w monopilot-kira

**Data:** 2026-08-06 · **Zakres:** badanie, zero zmian w repo · **Autor:** agent E1

Punkt odniesienia: 50 commitów w ostatnich 30 h, kilkanaście torów. Pipeline działa.
Kosztuje ręczną weryfikację każdego meldunku. Ten raport szuka miejsc, gdzie
**maszyna może sprawdzić agenta zamiast Ciebie**.

Wszystko poniżej zweryfikowane albo w repo, albo w bieżącej dokumentacji Claude Code
(link przy każdym mechanizmie). Nic nie jest wymyślone. Rzeczy, których **nie ma**,
są wprost oznaczone.

---

## 1. Co już mamy i działa

### Konfiguracja Claude Code

| Element | Gdzie | Stan |
|---|---|---|
| `permissions.defaultMode: bypassPermissions` + 7-pozycyjna lista `deny` | `.claude/settings.json` | **Działa.** Reguły `deny` obowiązują także w trybie bypass — to potwierdzone w dokumentacji, więc ta lista realnie chroni. |
| Hook `Notification` → `notify.sh` (ntfy na telefon) | `.claude/hooks/notify.sh` | **Działa i jest dobrze napisany** — bezpieczny no-op bez `KIRA_NOTIFY_URL`, czyta JSON ze stdin przez `jq`. To jedyny hook w projekcie. |
| Globalny hook `PreToolUse`/Bash → `rtk hook claude` | `~/.claude/settings.json` | Działa (oszczędność tokenów). ⚠️ Przed wdrożeniem #1 sprawdź jednym przebiegiem, czy hook projektowy na tym samym zdarzeniu **dokłada się** do rtk, czy go **przesłania** — tego nie potwierdziłem. Jeśli przesłania, bash-guard musi wywołać `rtk hook claude` na końcu. |
| 14 pluginów (superpowers, codex, vercel, supabase, playwright, ponytail, caveman…) | `~/.claude/settings.json` | Działa. |
| `model: opus[1m]`, `effortLevel: high` | `~/.claude/settings.json` | Działa. |

### Dokumentacja procesu (to jest mocna strona repo)

- **`AGENTS.md`** (root) — najlepszy plik w całym repo pod kątem agentów. Ma sekcję
  „Recurring gotchas — learned the hard way" z realnymi pułapkami (`withOrgContext`
  commituje na `return`, checksum migracji, `'use server'` eksportuje tylko funkcje async,
  `exec` przy vitest). Czyta go Codex.
- **`CLAUDE.md`** — krótki router + sekcja „Common commands", która **jako jedyna w repo
  poprawnie ostrzega** przed `pnpm --filter web vitest` bez `exec` i przed łańcuchem `&&`
  w skrypcie `test`. Ostatnia zmiana 2026-07-30 — najświeższy plik konfiguracyjny.
- **`_meta/WZORCE-KAMPANII-NAPRAWCZEJ.md`** — destylat 252 findingów jako reguły.
  To jest realnie używany dokument.
- **`docs/workflow/`** — 9 dokumentów, w tym `03-WORKTREE-PROTOCOL.md` (protokół izolacji)
  i `06-AUTONOMY-AND-REMOTE.md` (praca z telefonu).

### Skrypty, które już rozwiązują problemy, o które pytasz

To jest najważniejsze odkrycie tej sekcji: **dwa z pięciu bólów mają już zbudowane
narzędzie, którego nikt nie podpiął pod agentów.**

| Skrypt | Co robi | Który ból dotyka |
|---|---|---|
| `scripts/test-db.sh` (+ `README-test-db.md`, po polsku) | `up / recreate / migrate / verify / clone / reset t1\|t2\|t3 / urls / status / down`. Trzyma klony `monopilot_t1/t2/t3` z szablonu `monopilot`. `urls` **wypisuje gotowe URL-e**, `reset t1` resetuje pojedynczy klon nie ruszając pozostałych. | „Agenci deptali sobie po bazach" — mechanizm jest, brakuje tylko **automatycznego przydziału slotu agentowi**. |
| `~/.claude/scripts/worktree-bootstrap.sh` | Podlinkowuje `node_modules` (root + `apps/web` + `packages/*`) z głównego checkoutu do worktree, żeby testy i `tsc` w worktree naprawdę działały. Ma `--clean`. | „Agenci edytowali te same pliki równolegle" — brakuje tylko **włączenia izolacji przy spawnie**. |

### Umiejętności (skille) — te są świeże i poprawne

Zweryfikowane co do treści (ścieżki, tabele, migracje istnieją):
`MON-domain-technical`, `MON-domain-npd`, `MON-domain-settings`, `MON-domain-warehouse`,
`MON-domain-production`, `MON-domain-oee`, `MON-domain-finance`, `MON-domain-shipping`,
`MON-domain-maintenance`, `MON-orchestration`, `MON-verify-and-review`,
`MON-migration-safety`, `MON-api-transaction-safety`, `MON-t3-ui`,
`prd-decompose-hybrid`, `prototype-labeling`.

**16 z 28 skilli jest w porządku.** Pakiet MON-* nie jest do wyrzucenia — jest do przycięcia.

---

## 2. Co mamy i jest nieaktualne

Uszeregowane wg szkodliwości, nie wg wieku. Skill, który opisuje nieistniejący wzorzec,
jest gorszy niż jego brak — agent na nim polega.

### 2.1. 🔴 KRYTYCZNE — dokumentacja UCZY komendy, która nie uruchamia testów

To jest **źródło meldunków „zielono" bez uruchomienia**, o które pytasz w punkcie 3.

Sprawdziłem to empirycznie na żywym repo:

```
$ pnpm --filter web vitest run lib/x.test.ts
 ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT  None of the selected packages has a "vitest" script
```

Zero uruchomionych testów. A teraz gdzie ta komenda jest **zalecana**:

| Plik | Linia | Co uczy | Ile błędów |
|---|---|---|---|
| `.claude/skills/MON-t4-test/SKILL.md` | 55, 56, 194, 195 | `pnpm --filter @monopilot/web vitest run <pattern>` | **dwa naraz**: brak `exec` **i** zła nazwa pakietu (`apps/web/package.json` → `"name": "web"`) |
| `.claude/skills/MON-t3-ui/SKILL.md` | 192 | `pnpm --filter @monopilot/web vitest run <path>` | dwa naraz |
| **`docs/workflow/02-QUALITY-GATES.md`** | **20** | `pnpm --filter web vitest run <path>` | brak `exec` |

Ostatni wiersz jest najgorszy: **dokument definiujący bramki jakości — czyli „jak dowodzimy
zieleni" — zawiera komendę, która nie uruchamia ani jednego testu.**
`MON-t4-test` to skill, który agent ładuje dokładnie wtedy, gdy zabiera się za dowodzenie zieleni.

Domykający element mechaniki: `pnpm ... vitest` bez `exec` kończy się `rc=1`, ale **agent,
który przepuści wynik przez `| tail -5`, dostaje `rc=0`** (sprawdzone — `rc_A=0`).
Widzi „brak błędów", melduje zielono. Nikt nie kłamie; narzędzie kłamie za niego.

### 2.2. 🔴 `.agents/skills/` — trzeci, rozjechany katalog skilli

29 folderów, lustro `.claude/skills/`. **Nie jest w gicie** (`git ls-files .agents` → 0).
`diff -rq` pokazuje **10 plików SKILL.md, które się różnią** od wersji w `.claude/`
(`MON-orchestration`, `MON-engine-routing`, `MON-multi-tenant-site`, `MON-migration-safety`,
`MON-domain-npd`, `MON-domain-technical`, `MON-api-transaction-safety`, `MON-design-system`,
`prd-decompose-hybrid` + jeden folder `source-command-kira-skeleton` istniejący tylko tam).

To jest **dokładnie ten sam wzorzec, który już Cię ugryzł** przy `_meta/i18n-staging/`
(trzeci katalog tłumaczeń importowany przez ~20 modułów, pominięty przy commicie).
Każdy `grep -r` po repo trafia w obie kopie; każda poprawka skilla musi być zrobiona dwa razy
albo katalogi się rozjadą jeszcze bardziej. Referencje do `.agents/skills` są tylko w czterech
starych raportach z lipca — nic żywego tego nie czyta.

### 2.3. 🟠 `/kira:*` — 8 komend do procesu, którego już nie prowadzisz

`.claude/commands/kira/`: `audit`, `consolidate`, `plan`, `run-wave`, `run-module`,
`review`, `skeleton`, `skills-overhaul`. Ostatnia zmiana **2026-06-02/03**.

Opisują budowę modułów z kontraktów `_meta/atomic-tasks/<NN>/tasks/T-NNN.json`
przez fale z `_meta/plans/waves/wave-NN.json` (Fazy 0–4). Tymczasem **wszystko
w `_meta/plans/` od 2026-07-12 to kampanie datowane** (`2026-07-30-dzien-12h`,
`2026-08-05-noc`…), prowadzone wg `engine-delegation` + `WZORCE-KAMPANII-NAPRAWCZEJ.md`.
`/kira:run-wave` odwołuje się do plików, których dla obecnej pracy nikt nie generuje.

Skutek: agent, który wpisze `/kira:run-wave`, dostanie instrukcję do martwego trybu pracy.

### 2.4. 🟠 5 subagentów `kira-*` z przypiętymi modelami sprzed dwóch pinów

`.claude/agents/`: `kira-ui` (`model: opus`), `kira-codex-review` (`opus`),
`kira-easy` (`sonnet`), `kira-research` (`sonnet`), `kira-mechanical` (`haiku`).
Ostatnia zmiana 2026-06-02 (jeden 2026-07-02).

Twoja twarda reguła mówi: **UI + weryfikacja = Opus 5, wymuszany przez POMINIĘCIE pola
`model`** (dziedziczenie po main-loopie). Te pliki mają `model: opus` wpisane na sztywno —
czyli przypinają rodzinę modelu w miejscu, w którym reguła każe dziedziczyć.
W pliku definicji subagenta poprawny zapis to `model: inherit` (wartość udokumentowana
obok `sonnet`/`opus`/`haiku`/`fable`/pełnego ID) albo usunięcie pola.
Do tego `kira-easy` opisuje układ „Codex jest głównym implementatorem",
który zastąpił pipeline Composer→Codex→Claude.

### 2.5. 🟡 Rdza ścieżkowa w skillach — 4 błędy powtórzone w 6+ plikach

Jeden przebieg naprawia wszystkie:

| Skill uczy | Jest naprawdę | Gdzie |
|---|---|---|
| `apps/web/middleware.ts` | `apps/web/proxy.ts` (przemianowane w Next 16) | `MON-project-overview` ×2, `MON-t2-api`, `MON-foundation-primitives` ×2 |
| `packages/rbac/permissions.enum.ts` | `packages/rbac/src/permissions.enum.ts` | `MON-project-overview`, `MON-multi-tenant-site`, `MON-INDEX.md:131` |
| `lib/outbox/events.enum.ts` | `packages/outbox/src/events.enum.ts` | `MON-foundation-primitives`, `MON-integrations-compliance` |
| `.eslintrc.cjs` | `eslint.config.mjs` (flat config) | `MON-multi-tenant-site` |

Dalej, pojedynczo:
- `MON-project-overview` twierdzi, że **`apps/worker/` „nie istnieje jeszcze"** — istnieje,
  z 6+ jobami (`outbox-consumer.ts`, `gdpr-erasure-cron.ts`, …). Mówi też „Next.js 15" przy
  `"next": "^16.0.0"`.
- `MON-t1-schema`: `packages/db/src/schema/` → naprawdę `packages/db/schema/`;
  `packages/reporting/` — **taki pakiet nie istnieje w ogóle**; `pnpm db:check` — nie ma
  takiego skryptu.
- `MON-t4-test`: `apps/web/e2e/_fixtures/` → naprawdę `apps/web/e2e/fixtures/` (bez podkreślnika).
- `MON-domain-quality`, `MON-domain-planning`, `MON-multi-tenant-site`: cytują migracje w formacie
  `0134_v_active_holds_view.sql`. **Zero plików w repo używa tego formatu** — schemat to
  `NNN-nazwa.sql`, od `000-app-user-role.sql` do `564-complaint-box-number-uniqueness.sql`
  (520 plików). Same *numery* migracji cytowane w skillach są poprawne — zły jest tylko format nazwy.
- `MON-engine-routing` (37 linii) kieruje recenzję do **`MON-codex-review-checklist`** — skilla,
  który `MON-INDEX.md` sam ogłasza wycofanym 2026-07-07 i którego folderu nie ma.
  Ten sam martwy wskaźnik jest w `docs/workflow/01-MODEL-ROUTING.md:152`.
- `MON-design-system` wskazuje jako „kanoniczną specyfikację wizualną" plik
  `/Users/mariuszkrawczyk/Downloads/components.html` — istnieje tylko na Twoim Macu,
  nie w repo. Każdy agent w worktree/CI go nie znajdzie.

### 2.6. 🟡 `MON-INDEX.md` — mapa nie zgadza się z terenem

Index deklaruje **21 skilli / ~4400 linii**. Faktycznie: **28 folderów / 5607 linii**.
Wszystkie liczby linii w tabeli inwentarza są błędne.

**7 skilli nie ma wiersza w inwentarzu.** Cztery nie występują w indeksie **nigdzie**:
`MON-api-transaction-safety`, `MON-design-system`, `MON-migration-safety`,
`MON-packaging-staffing`. Trzy są cytowane w tabelach routingu, ale wypadły z inwentarza:
`MON-orchestration`, `MON-verify-and-review`, `MON-engine-routing`.

Najgorszy z nich to `MON-design-system` — jego własny opis mówi „Read FIRST on every polish
task", a mapa, wg której agent wybiera skille, w ogóle o nim nie wie. Agent robiący UI
nigdy do niego nie trafi.

### 2.7. 🟡 `docs/workflow/01-MODEL-ROUTING.md` — nazwy modeli sprzed pinu

256 linii. Wymienia **Opus 4.8** i **`codex exec --model gpt-5.5`**.
Ciągi `gpt-5.6-sol` i `Opus 5` **nie występują ani razu** w `.claude/skills/` ani
w `docs/workflow/` (grep = 0 trafień). Plik ma też zdublowany blok tytułowy (linie 1–6 i 8–15).

---

## 3. Co dodać

Kolejność wg **godzin Twojego pilnowania oszczędzonych tygodniowo**, nie wg elegancji.
Szacunki są szacunkami — oznaczam je jako takie.

---

### #1 — Hook `PreToolUse` na Bash: blokada pułapek narzędziowych

**Szac. oszczędność: 3–6 h/tydz.** · **Koszt: S** · **Ryzyko: niskie, kontrolowane**

**Ból:** dokładnie Twoja lista — `pnpm --filter web vitest` bez `exec` nie uruchamia nic;
`grep` bez `-a`; `grep -c` zwracające 0 przerywa `&&`; backticki w `git commit -m`;
szeroki `git add`. Napisałeś, że to kandydat numer jeden — **zgadzam się, i to hook, nie skill.**

**Dlaczego hook, a nie skill:** skill działa tylko wtedy, gdy model go załaduje i zapamięta.
Hook jest deterministyczny — biegnie przy *każdym* wywołaniu Bash, także w subagencie,
także u agenta, który nigdy nie czytał `CLAUDE.md`. A jak pokazuje §2.1, w tym repo skille
uczą **złej** komendy, więc poleganie na tekście już raz zawiodło.

**Co utworzyć:** `.claude/hooks/bash-guard.sh` + wpis w `.claude/settings.json`:

```json
"PreToolUse": [
  { "matcher": "Bash",
    "hooks": [{ "type": "command",
                "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/bash-guard.sh\"" }] }
]
```

Uwaga o mechanice: `matcher` dopasowuje **tylko nazwę narzędzia**, nigdy treści komendy —
`Bash(command: ...)` w matcherze jest ignorowane z ostrzeżeniem. Całe rozpoznawanie musi być
w ciele skryptu: czyta JSON ze stdin, wyciąga `.tool_input.command`, i przy trafieniu wypisuje

```json
{ "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<tu poprawna komenda>" } }
```

Reguła żelazna: **`permissionDecisionReason` zawsze podaje działający zamiennik.**
Blokada bez zamiennika zamienia się w agenta, który się zapętla.

Reguły do wpisania (prototyp przetestowałem na żywych komendach — 6/6 trafień, 4/4 przepuszczenia):

| Wzorzec | Powód | Komunikat |
|---|---|---|
| `pnpm --filter … vitest\|playwright` bez ` exec ` | `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`, 0 testów | `pnpm --filter web exec vitest run --config ../../vitest.config.ts <ścieżka względem apps/web>` |
| `@monopilot/web` w komendzie | pakiet nazywa się `web` | podmień na `web` |
| `pnpm --filter web test` | skrypt spina 2 suity przez `&&` → suita UI nigdy nie startuje | uruchom obie osobno |
| `grep` z `-r`/`-R` bez `a` we flagach | pomija pliki uznane za binarne | dodaj `-a` |
| `git add -A` / `git add .` / `git add -u` | zagarnia pracę równoległego toru | wymień ścieżki jawnie |
| `` git commit -m `` z backtickiem | substytucja powłoki psuje komunikat | `git commit -F <plik>` |

Jedna pułapka implementacyjna, na którą sam wpadłem przy prototypie: naiwne szukanie
podciągu `-a` **fałszywie blokuje `grep -ran`** (flagi łączone). Poprawna detekcja
to regex na wiązce flag — u mnie po poprawce 7/7 przypadków dobrze, łącznie
z `find . | xargs grep -al x`.

**Ryzyko:** fałszywe blokady. Ograniczniki: (1) tylko wzorce dosłowne, żadnej heurystyki
„wygląda podejrzanie"; (2) każdy komunikat z zamiennikiem; (3) zostaw furtkę — komenda
z prefiksem `rtk proxy` przechodzi bez sprawdzania, do debugowania.

⚠️ **Jedna rzecz do sprawdzenia przy wdrożeniu:** czy hook projektowy na `PreToolUse`/Bash
dokłada się do globalnego `rtk hook claude`, czy go przesłania. Test zajmuje minutę
(odpal `git status` i zobacz, czy filtrowanie rtk nadal działa). Jeśli przesłania —
bash-guard po przejściu kontroli musi na końcu wywołać `rtk hook claude` i przekazać jego wyjście.

---

### #2 — Naprawić dokumenty, które uczą zepsutych komend

**Szac. oszczędność: 1–3 h/tydz.** · **Koszt: S (kilkanaście linii)** · **Ryzyko: brak**

**Ból:** ten sam, co #1 — ale to jest **przyczyna**, nie objaw. Jeśli zrobisz tylko #1,
agent będzie dostawał blokadę na komendę, którą **skill kazał mu uruchomić**, i będzie
walczył z hookiem zamiast pracować.

**Co utworzyć — nic. Poprawić 6 linii:**
- `.claude/skills/MON-t4-test/SKILL.md:55,56,194,195`
- `.claude/skills/MON-t3-ui/SKILL.md:192`
- `docs/workflow/02-QUALITY-GATES.md:20`

na formę z `CLAUDE.md`, która już jest poprawna:
`pnpm --filter web exec vitest run --config ../../vitest.config.ts <ścieżka>`.

Przy okazji przenieść sekcję „Common commands" z `CLAUDE.md` do `MON-t4-test`
(albo odwrotnie) — teraz **jedyne poprawne ostrzeżenie w repo siedzi w pliku, którego
subagent z wąskim kontekstem nie musi przeczytać**, a błędna wersja jest w skillu,
który ładuje się właśnie do dowodzenia zieleni.

**Robić razem z #1, tym samym commitem.** Osobno każde z nich jest gorsze.

---

### #3 — Hook `SubagentStop`: zakaz meldowania „zielono" bez uruchomienia

**Szac. oszczędność: 2–5 h/tydz.** · **Koszt: M** · **Ryzyko: średnie — wymaga strojenia**

**Ból:** „Wielokrotnie musiałem sam odpalać testy, żeby sprawdzić agenta."
**Odpowiedź na Twoje pytanie: tak, da się to zautomatyzować hookiem.**

**Mechanizm (potwierdzony w dokumentacji):** `Stop` i `SubagentStop` **mogą zablokować
zakończenie** — hook wypisuje `{"decision": "block", "reason": "…"}` i agent musi
kontynuować, widząc `reason`. `SubagentStop` odpala się dla subagentów Task/Agent.
Hook dostaje na stdin `transcript_path` — czyli **pełny zapis tego, co agent naprawdę
uruchomił**.

**Co utworzyć:** `.claude/hooks/no-green-without-run.sh`, logika w trzech krokach:

1. Czy ostatnia wiadomość agenta **twierdzi, że jest zielono**?
   Regex PL+EN: `zielon|ZIELON|green|GREEN|\bPASS\b|przechodz|testy przesz|wszystkie testy|0 failed`.
   Nie ma twierdzenia → przepuść. (Agent badawczy, taki jak ten raport, nigdy nie odpala testów
   i **nie powinien** być blokowany.)
2. Czy w transkrypcie jest realne wywołanie Bash pasujące do
   `vitest run|playwright test|pnpm -r test|test-db\.sh|pnpm typecheck|pnpm build`?
   Wystarczy `grep -a` po pliku JSONL — sprawdziłem format, komendy są tam jako pole `command`.
3. Twierdzi + nie uruchomił → `{"decision":"block","reason":"Zadeklarowałeś zieleń bez
   uruchomienia. Uruchom <konkretna komenda> i wklej PEŁNE wyjście z liczbą testów."}`

**Wariant mocniejszy, jeśli #1 już stoi:** blokuj też, gdy uruchomienie **było**, ale wyjście
zawiera `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`, `No test files found`, `0 passed` albo
`Ran 0 of` — to łapie „zieleń przez pominięcie", czyli wzorzec, który wg
`BIBLIA-BLEDOW.md` poz. 12 siedzi też w CI („Job E2E w CI wykonuje 0 testów z 381
i melduje sukces").

**Ryzyko i jak je ograniczyć:**
- **Zapętlenie.** Hooki `Stop`/`SubagentStop` dostają flagę oznaczającą, że blokada już
  raz zadziałała — trzeba ją sprawdzić i przepuścić za drugim razem, inaczej agent
  utknie na zawsze. **Przed włączeniem na noc: przetestuj na jednym torze w dzień.**
- **Fałszywe blokady na agentach badawczych/UI.** Chroni przed tym warunek 1 (musi
  paść twierdzenie o zieleni).
- To jedyna propozycja, której **nie polecam włączać na ślepo przed nocną falą** —
  daj jej jeden dzień obserwacji.

---

### #4 — Izolacja worktree dla torów piszących

**Szac. oszczędność: 1–4 h/tydz. (skokowo: jedna zepsuta fala = cała noc)** · **Koszt: S** · **Ryzyko: niskie**

**Ból:** „Agenci edytowali te same pliki równolegle i psuli sobie nawzajem build."

**Dobra wiadomość: nie trzeba nic budować.** Dokumentacja potwierdza, że **nie ma**
wbudowanego blokowania plików dla równoległych agentów — ale **jest** wbudowana izolacja:
narzędzie `Agent` przyjmuje parametr `isolation: "worktree"`, a definicja subagenta
(`.claude/agents/*.md`) pole `isolation: worktree`. Każdy tor dostaje własny worktree
i własny katalog roboczy. Worktree bez zmian jest sprzątany automatycznie.

**Co utworzyć:**
1. **Nic w kodzie** — dopisać `isolation: "worktree"` do każdego spawnu toru *piszącego*
   (tory *czytające*/review niech zostają w głównym checkoucie — szybciej i nie ma konfliktów).
2. Jedna linijka w kanonie fali: po utworzeniu worktree odpalić
   `~/.claude/scripts/worktree-bootstrap.sh <worktree>` — **ten skrypt już istnieje**
   i podlinkowuje `node_modules` (root + `apps/web` + `packages/*`), bez czego testy
   i `tsc` w worktree fałszywie padają.

**Ryzyko:** worktree ×5 to ×5 miejsca na dysku, ale `node_modules` są symlinkowane,
więc to głównie kod źródłowy. Punkty serializacji (numer migracji, `events.enum.ts`,
`permissions.enum.ts`, `MON-INDEX.md`) **nadal wymagają uruchomienia w pojedynkę** —
worktree nie rozwiązuje konfliktu numeru migracji, tylko konflikt edycji pliku.
To jest już zapisane w `docs/workflow/03-WORKTREE-PROTOCOL.md` i pozostaje aktualne.

---

### #5 — Automatyczny przydział bazy `monopilot_t1/t2/t3` torowi

**Szac. oszczędność: 1–2 h/tydz.** · **Koszt: S–M** · **Ryzyko: niskie**

**Ból:** „Agenci deptali sobie po bazach — musiałem ręcznie rozdzielać `monopilot_t1/t2/t3`."

**Stan wyjściowy:** `scripts/test-db.sh urls` już wypisuje URL-e, `reset t1` resetuje
pojedynczy klon. Brakuje wyłącznie tego, żeby **tor sam dostał swój slot**, zamiast Ciebie.

**Ograniczenie, które trzeba znać:** dokumentacja **nie przewiduje** ustawiania
zmiennych środowiskowych per-subagent. Blok `env` w `settings.json` jest globalny dla sesji.
Czyli „daj każdemu agentowi inny `DATABASE_URL` przez konfigurację" — **nie da się**.

**Co da się, dwie drogi:**

**(a) przez hook `SubagentStart`** — hook dostaje na stdin `agent_id` i `agent_type`
(potwierdzone), więc mógłby wziąć blokadę `flock`, wybrać wolny slot i wstrzyknąć go
agentowi jako `additionalContext`: „Twoja baza na czas tego zadania: `monopilot_t2`,
URL: …". Deterministyczne, agent nie musi pamiętać.
⚠️ **Nie potwierdziłem, czy `SubagentStart` przyjmuje `additionalContext`** —
sprawdź to zanim zaczniesz pisać ten hook (dla `SessionStart` i `UserPromptSubmit`
to pole jest udokumentowane).

**(b) przez skrypt w kanonie fali** — dopisać do `test-db.sh` podkomendę
`acquire` / `release` na `flock` + plik-znacznik, a w szablonie promptu toru pierwszą linię
`eval "$(./scripts/test-db.sh acquire)"`. Prostsze do napisania i debugowania, ale zależy
od tego, czy agent posłucha promptu.

**Rekomendacja: (b) najpierw** (jeden wieczór, testowalne z ręki), **(a) dopiero jeśli
tory zaczną pomijać krok**. Rozszerzenie `test-db.sh` jest tańsze niż nowy hook,
a skrypt i tak już zna wszystkie 4 bazy (`monopilot`, `t1`, `t2`, `t3`; plus `monopilot_ver`
używana wg raportu z 2026-08-06 jako jedyna z pełnym schematem 564).

---

### #6 — Odczyt z produkcji bez otwierania zapisu

**Szac. oszczędność: 0,5–2 h/tydz., ale odblokowuje pracę z telefonu** · **Koszt: S–M** · **Ryzyko: średnie, do przeczytania w całości**

**Ból:** dziś klasyfikator zablokował odczyt z bazy produkcyjnej, a Ty nie byłeś przy komputerze.

#### Jak naprawdę działają reguły Bash w `settings.json`

Zweryfikowane w bieżącej dokumentacji (`code.claude.com/docs/en/permissions.md`):

- **Dopasowanie prefiksowe z globem `*`.** `Bash(npm run test *)` łapie `npm run test foo`,
  ale nie `npm run other test`.
- **Spacja przed `*` wymusza granicę słowa**: `Bash(ls *)` łapie `ls -la`, **nie** łapie `lsof`.
- **`:*` na końcu znaczy dokładnie to samo co ` *`** i jest rozpoznawane tylko na końcu.
  Czyli Twoje `Bash(rtk git *)` i `Bash(git push -f:*)` to ta sama konstrukcja.
- **Reguły rozumieją operatory powłoki** (`&&`, `||`, `;`, `|`, `&`, nowe linie) — każda
  podkomenda jest dopasowywana osobno, więc `deny` **nie da się obejść** przez potok,
  `&&`, podpowłokę ani `bash -c`. Owijki (`timeout`, `command`, `noglob`) są zdejmowane
  przed dopasowaniem.
- **Kolejność: `deny` → `ask` → `allow`.** Pierwsze trafienie wygrywa.
- **`bypassPermissions` pomija pytania, ale reguły `deny` NADAL obowiązują.**
  To jest kluczowe dla Twojego ustawienia — lista `deny` w `.claude/settings.json`
  realnie działa mimo trybu bypass.
- **Kolejność plików ustawień:** managed → flagi CLI → `.claude/settings.local.json` →
  `.claude/settings.json` → `~/.claude/settings.json`.

#### Czego zrobić NIE można (i to jest udokumentowane wprost)

**Reguła `Bash(...)` nie potrafi wiarygodnie odróżnić odczytu od zapisu.** Dokumentacja
mówi to wprost przy przykładzie z `curl`: reguła nie złapie wariantów z inną kolejnością
opcji, zmiennymi, dodatkowymi spacjami. **Nie da się napisać reguły „pozwól na `psql -c
'select …'`, zabroń `insert`".** Każdy zapis takiej reguły, który wygląda, że działa,
jest fałszywym poczuciem bezpieczeństwa.

Udokumentowana furtka to **hook `PreToolUse`** — parsowanie w skrypcie zamiast we wzorcu.

#### Konkretny zapis, który proponuję

Bramka jest **po stronie Postgresa**, nie we wzorcu uprawnień. Wzorzec tylko wpuszcza
jedną nazwę skryptu.

**Krok 1 — `scripts/prod-read.sh`** (nowy plik, ~15 linii):

```bash
#!/usr/bin/env bash
set -euo pipefail
# Odczyt z produkcji. Zapis niemożliwy — połączenie startuje read-only.
[ $# -ge 1 ] || { echo "użycie: prod-read.sh \"<SQL SELECT>\"" >&2; exit 2; }
url="$(grep -a '^DATABASE_URL_OWNER=' .env.local | cut -d= -f2- | tr -d '"')"
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30s' \
  psql "$url" -v ON_ERROR_STOP=1 --no-psqlrc -P pager=off -c "$1"
```

Sekret zostaje w `.env.local` — **nie trafia do wiersza poleceń**, więc nie ląduje
w transkrypcie ani w logach.

**Krok 2 — `.claude/settings.json`** (jedna pozycja w `allow`, jedna w `deny`):

```json
"permissions": {
  "defaultMode": "bypassPermissions",
  "allow": [
    "Bash(bash scripts/prod-read.sh:*)",
    "Bash(./scripts/prod-read.sh:*)"
  ],
  "deny": [
    "Bash(psql postgresql://*pooler.supabase.com*)",
    "Bash(psql postgres://*pooler.supabase.com*)"
    // … dotychczasowe 7 pozycji zostaje
  ]
}
```

Rola `allow` jest tu **nie bezpieczeństwo, tylko przepustka**: jedna nazwana komenda,
jawnie dopuszczona, przechodzi bez pytania także w sesji, która **nie** działa
w `bypassPermissions` — a więc również wtedy, gdy sterujesz z telefonu.
`deny` odcina prostą drogę wokół skryptu.
Musi to być `.claude/settings.json` (wersjonowany, wspólny), nie `settings.local.json` —
inaczej działa tylko na jednej maszynie.

Uwaga metodologiczna: **nie ustaliłem z pewnością, co dokładnie zatrzymało dzisiejszy
odczyt** — pod `bypassPermissions` pytania są pomijane, więc albo tamta sesja nie działała
w tym trybie (np. zdalna), albo zadziałał wbudowany bezpiecznik. Powyższy zapis pomaga
w obu przypadkach, ale to jest projekt odporny na obie hipotezy, a nie diagnoza przyczyny.

**Krok 3 — decyzja o tym, jak twarda ma być bramka. To Twoja decyzja, nie moja:**

| Wariant | Co daje | Czego nie daje | Koszt |
|---|---|---|---|
| **A. samo `PGOPTIONS` (wyżej)** | blokuje **przypadkowy** zapis — każda transakcja startuje read-only | agent, który świadomie zrobi `SET default_transaction_read_only = off`, obejdzie to | S, gotowe od ręki |
| **B. rola `kira_ro` w Postgresie** z samym `SELECT` | **nie da się obejść** — Postgres odmawia, nie skrypt | wymaga jednorazowego `create role` + grantów **przez Ciebie**; przy `FORCE ROW LEVEL SECURITY` odczyt trzeba obudować kontekstem `app.current_org_id()`, inaczej rola zobaczy pusto | S–M, jednorazowo |

**Rekomendacja: A dzisiaj, B przy najbliższej okazji przy bazie.** A wystarcza na wypadek
„agent się pomylił"; B jest jedynym wariantem odpornym na „agent zrobił coś sprytnego".
Nie udawajmy, że A jest B.

---

### #7 — Kanon fali jako jedna komenda (w miejsce ośmiu martwych)

**Szac. oszczędność: 1–2 h/tydz.** · **Koszt: M** · **Ryzyko: niskie**

**Ból:** „Kontrola przeciwna — musiałem ją wymuszać w każdym zleceniu z osobna."

**Uczciwie: to jest jedyny ból na Twojej liście, którego NIE da się domknąć hookiem.**
Nie ma mechanizmu, który wykryje „ten kod nie przeszedł cross-review innego dostawcy" —
to nie jest fakt obserwowalny w transkrypcie. Zostaje redukcja przepisywania.

**Co utworzyć:** `.claude/commands/kira/fala.md` (albo skill `MON-fala`) — jeden plik
zawierający kanon, który dziś rozpisujesz ręcznie za każdym razem:
- rozbicie na tory ~2 bugi/tor, ~5 torów w fali (3 Composer + 2 Codex przy ciężkiej);
- piny modeli — **`gpt-5.6-sol` @ `xhigh`, `composer-2.5`, UI/weryfikacja = Opus 5 przez
  POMINIĘCIE `model`**, a nie przez `model: opus`;
- `--sandbox workspace-write`, **bez `make verify` w promptcie toru**;
- `isolation: "worktree"` + `worktree-bootstrap.sh` (#4);
- slot bazy (#5);
- **writer ≠ reviewer, zawsze inny dostawca** — jako punkt listy kontrolnej, nie jako prośba;
- arbitraż Claude → poprawki → `verify` → commit.

Frontmatter komend jest wspierany (`description`, `argument-hint`, `allowed-tools`,
`model`, `disable-model-invocation`), więc `/kira:fala 3` z argumentem zadziała.

**Jednocześnie: usunąć albo przenieść do `_meta/archiwum/` osiem komend `/kira:*` z §2.3.**
Zostawienie ich obok nowej to gwarancja, że któryś agent trafi w martwą.
To samo z pięcioma `kira-*` z §2.4 — albo skasować, albo zamienić wpisane `model: opus`
na `model: inherit`, żeby dziedziczyły po main-loopie zgodnie z Twoją regułą.

---

### #8 — Usunąć `.agents/skills/` i zsynchronizować `MON-INDEX.md`

**Szac. oszczędność: 0,5–1 h/tydz. (plus jedna uniknięta pomyłka klasy „i18n-staging")** · **Koszt: S** · **Ryzyko: brak**

**Ból:** nie ma go jeszcze na Twojej liście — i to jest właśnie powód, żeby to zrobić teraz.
Rozjechana kopia skilli (§2.2) jest niewidoczna, dopóki agent nie zacytuje starej wersji
reguły i nie zbuduje na niej fali.

**Co zrobić:**
1. `rm -rf .agents/skills` — nietrackowane, nic żywego tego nie czyta.
   (Gdyby jednak Codex/Cursor to czytał: zastąp **symlinkiem** do `.claude/skills`,
   nigdy kopią.)
2. `MON-INDEX.md`: dopisać 7 brakujących skilli (§2.6), poprawić licznik 21 → 28
   i cztery ścieżki z §2.5.
3. Poprawić martwy wskaźnik `MON-codex-review-checklist` w `MON-engine-routing:23`
   i `docs/workflow/01-MODEL-ROUTING.md:152`.
4. `01-MODEL-ROUTING.md`: nazwy modeli na `gpt-5.6-sol` / Opus 5, usunąć zdublowany
   blok tytułowy.

Punkt 2 najlepiej dopisać jako stały krok w kanonie fali (#7): *„nowy skill = wiersz
w MON-INDEX w tym samym commicie"*. Inaczej rozjazd wróci.

---

## 4. Czego świadomie NIE proponuję

Ograniczenia potwierdzone w bieżącej dokumentacji — żeby nie szukać tego drugi raz:

| Pomysł | Dlaczego nie |
|---|---|
| Hook `PostToolUse`, który cofa złą komendę | **Nie potrafi blokować.** Narzędzie już się wykonało. Może tylko wstrzyknąć `additionalContext` albo podmienić wyświetlany wynik. Do prewencji służy `PreToolUse`. |
| Reguła uprawnień odróżniająca `select` od `insert` | Udokumentowane wprost, że **reguły Bash tego nie potrafią**. Stąd wariant ze skryptem + bramką w Postgresie (#6). |
| Osobny `DATABASE_URL` per subagent przez konfigurację | **Brak takiego mechanizmu.** `env` w `settings.json` jest globalny. Stąd #5 przez skrypt/hook. |
| Wbudowana blokada plików dla równoległych agentów | **Nie istnieje.** Zastępnik to izolacja worktree (#4). |
| Matcher hooka po treści komendy (`Bash(command: rm *)`) | Ignorowany z ostrzeżeniem — matcher widzi tylko nazwę narzędzia. Rozpoznawanie musi być w ciele skryptu. |
| Nowy plugin / marketplace „na jakość agentów" | Nie rozwiązuje żadnego z siedmiu bólów z Twojej listy. |

---

## 5. Kolejność wdrożenia

Krótko, bo to jest cała rekomendacja:

**Dziś, jeden commit (koszt S, ryzyko ~zero):** #2 (6 linii w dokumentach) + #1 (bash-guard)
+ #8 (skasować `.agents/skills`, poprawić INDEX). To zamyka pętlę
„dokumentacja uczy zepsutej komendy → agent jej używa → 0 testów → `| tail` zwraca rc=0 →
meldunek zielony".

**W tym tygodniu:** #6 wariant A (odblokowuje Cię z telefonu) + #4 (`isolation: "worktree"`
w spawnach) — oba prawie darmowe, bo skrypty już są.

**Następnie, z jednym dniem obserwacji:** #3 (`SubagentStop`) — to jedyna rzecz, której
nie włączaj na ślepo przed nocną falą.

**Przy okazji:** #5, #7, #6 wariant B.

---

## Załącznik — co zostało sprawdzone uruchomieniem, a co tylko przeczytane

Zgodnie z zasadą „meldunek bez uruchomienia to nie dowód" — poniżej rozdział na jedno i drugie.

### Uruchomione i potwierdzone na tej maszynie

| Twierdzenie | Jak sprawdzone | Wynik |
|---|---|---|
| `pnpm --filter web vitest run <plik>` nie uruchamia testów | uruchomione w repo | `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`, 0 testów |
| To samo wyjście przepuszczone przez `\| tail -5` daje `rc=0` | uruchomione | `rc_A=0` — mechanika fałszywej zieleni potwierdzona |
| `grep -c <brak trafień>` przerywa łańcuch `&&` | uruchomione | wypisało `0`, `rc=1`, człon po `&&` się nie wykonał |
| Kody ANSI w wyjściu pnpm | widoczne w surowym wyjściu | `[41m[30m ERR_PNPM…` — grepowanie po tym wyjściu jest zawodne |
| Logika bash-guarda z #1 | prototyp na 10 komendach | 6/6 blokad trafionych, 4/4 przepuszczeń; po poprawce flag łączonych 7/7 na wariantach `grep` (w tym `grep -ran`, `find \| xargs grep -al`) |
| Wykrywanie uruchomień testów w transkrypcie (#3) | `grep -a -oE '"command":"[^"]*(vitest run\|playwright test)'` na żywym pliku JSONL | 6 trafień — podejście działa |
| `.agents/skills` rozjechane z `.claude/skills` | `diff -rq` | 10 różniących się `SKILL.md`, `git ls-files` → 0 (nietrackowane) |
| `apps/web` nazywa się `web`, nie `@monopilot/web` | `apps/web/package.json` | `"name": "web"` |
| Skrypt `test` spina 2 suity przez `&&` | `apps/web/package.json:11` | potwierdzone |
| Najwyższa migracja / format nazw | `packages/db/migrations/` | `564-…`, 520 plików, format `NNN-nazwa.sql`, zero plików `0NNN_…` |
| `psql` dostępny, produkcja przez pooler | `psql --version`, `.env.local` | PostgreSQL 16.13; `DATABASE_URL_OWNER` → `aws-1-eu-central-2.pooler.supabase.com:5432` |
| 50 commitów / 30 h | `git log --since` | potwierdzone |

### Przeczytane w dokumentacji Claude Code, nieuruchomione

Cała mechanika hooków i uprawnień w §3 i §4 (`PreToolUse` `permissionDecision: deny`;
`Stop`/`SubagentStop` `decision: block`; `PostToolUse` nie blokuje; matcher tylko po nazwie
narzędzia; prefiks + glob w regułach Bash; `:*` ≡ ` *`; `deny` obowiązuje pod
`bypassPermissions`; brak per-agentowego `env`; brak blokowania plików;
`isolation: worktree`) pochodzi z bieżącej dokumentacji
(`code.claude.com/docs/en/hooks.md`, `…/permissions.md`, `…/sub-agents.md`, `…/settings.md`).

**Nie odpaliłem żadnego z proponowanych hooków** — to jest zadanie badawcze, nie zmieniałem
konfiguracji. Przed zaufaniem szczególnie #3 (`SubagentStop`) zrób jeden przebieg testowy
w dzień: hook, który błędnie blokuje, zatrzyma tor tak samo skutecznie jak zły kod.
