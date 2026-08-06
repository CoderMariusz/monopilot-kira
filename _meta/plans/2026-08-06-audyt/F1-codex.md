# F1 — Codex i orkiestracja wielu torów

Data: 2026-08-06 · Zakres: badawczy, nic nie zmieniano w kodzie.
Wersje zmierzone: `codex-cli 0.144.1`, `claude 2.1.221 (Claude Code)`.

**Raport CZĘŚCIOWY** — budżet sesji przycięty w połowie. Sekcja „Czego nie zdążyłem" na końcu.

---

## TL;DR — pięć ruchów, uszeregowane wg oszczędzonego czasu na weryfikacji

| # | Ruch | Rozwiązuje ból | Koszt | Ryzyko |
|---|------|----------------|-------|--------|
| 1 | `--output-schema` — meldunek Codexa jako JSON z surowym wyjściem i kodem wyjścia | 1 (weryfikacja każdego meldunku) | 1 plik schematu, ~15 min | Niskie. Wąskie gardło: model musi **wkleić** wyjście, nie da się tego wymusić maszynowo |
| 2 | `-c sandbox_workspace_write.network_access=true` — Codex dostaje lokalną bazę | 1 (poprawki „na ślepo" z błędem składni) | jedna flaga | Średnie — otwiera **cały** ruch sieciowy, nie tylko localhost |
| 3 | `_meta/runs/launch-batch.sh` — **już masz** działający przydział worktree + bazy per tor | 2 i 4 (przydział zasobów, kolizje) | 0 — istnieje; wymaga odświeżenia 2 linii | Niskie |
| 4 | Hook `SubagentStart` — wstrzykuje ostrzeżenia do **każdego** startującego agenta | 3 (powtarzanie ostrzeżeń) | ~30 min | Niskie. Dowód działania masz w tej sesji |
| 5 | `permissions.deny` na szerokie `git add` | 4 (zagarnięcie cudzej pracy) | 2 linie w settings.json | Niskie |

**`Workflow` — moja uczciwa odpowiedź: nie w tej kampanii.** Uzasadnienie w sekcji 5.

---

## Zmierzone fakty (uruchomione, nie wywnioskowane)

### F-1. Twoja konfiguracja Codexa mówi „pełny dostęp", ale pipeline ją nadpisuje

`~/.codex/config.toml` zawiera:

```toml
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

Czyli **globalnie Codex ma pełny dostęp**. Ale flaga `--sandbox` w linii poleceń bije config, a wasz pipeline (za notatką `engine_pipeline_reliability_2026_07_17.md`) woła:

```
codex exec --sandbox workspace-write ...
```

`workspace-write` domyślnie **wyłącza sieć**. To jest cała przyczyna „Codex nie mógł uruchomić migracji". Nie ograniczenie Codexa — jedna flaga, którą sam dodałeś, żeby pipeline przestał padać.

### F-2. Test A — potwierdzenie, że to właśnie ta flaga blokuje bazę

```
codex exec --sandbox workspace-write -C /tmp/codexnet \
  'psql "postgresql://postgres@127.0.0.1:5432/postgres" -c "select 1 as ok"'
```

Surowe wyjście:

```
psql: error: connection to server at "127.0.0.1", port 5432 failed: Operation not permitted
	Is the server running on that host and accepting TCP/IP connections?
Exit code: 2
```

`Operation not permitted` = piaskownica, nie Postgres. Localhost też jest siecią dla seatbelta.

### F-3. Test B — jedna flaga to odblokowuje

```
codex exec --sandbox workspace-write -C /tmp/codexnet \
  -c sandbox_workspace_write.network_access=true \
  'psql "postgresql://postgres@127.0.0.1:5432/postgres" -c "select 1 as ok"'
```

Surowe wyjście:

```
psql: error: connection to server at "127.0.0.1", port 5432 failed: FATAL:  role "postgres" does not exist
exit code: 2
```

**To jest sukces.** Błąd przyszedł z samego Postgresa (rola nie istnieje — bo lokalna rola to `mariuszkrawczyk`), czyli gniazdo się połączyło i serwer odpowiedział. Zapis do dysku nadal ograniczony do workspace'a. To nie jest `danger-full-access`.

### F-4. Test C — `--output-schema` działa i zwraca surowe wyjście obok wniosku

Schemat (`/tmp/codexnet/verify-schema.json`) wymusza `claim`, tablicę `commands_run` z polami `cmd`/`exit_code`/`raw_output`, oraz `verdict` z enumem `verified|failed|not_executed`.

```
codex exec --output-schema /tmp/codexnet/verify-schema.json -o /tmp/codexnet/last.json '...'
```

Zawartość `last.json` (dosłownie):

```json
{"claim":"echo dziala","commands_run":[{"cmd":"rtk echo hello","exit_code":0,"raw_output":"hello\n"}],"verdict":"verified"}
```

Ten sam JSON trafia na stdout jako ostatnia wiadomość. **Meldunek jest maszynowo parsowalny** — możesz odsiać tory po `verdict` bez czytania prozy.

Przy okazji potwierdzone: hook rtk przepisuje komendy **także wewnątrz Codexa** (`rtk echo hello`).

### F-5. Flagi `codex exec`, których pipeline nie używa

Z `codex exec --help` (wersja 0.144.1), nieużywane w waszych launcherach:

- `--output-schema <FILE>` — patrz F-4
- `-p, --profile <NAZWA>` — nakłada `$CODEX_HOME/<nazwa>.config.toml` na config bazowy. **Kandydat na profil `lane` z gotowym zestawem: model, network_access, reasoning effort** — zamiast powtarzania `-c` w każdym torze
- `--add-dir <DIR>` — dodatkowe zapisywalne katalogi obok workspace'a
- `--json` — zdarzenia jako JSONL na stdout (postęp toru bez blokowania)
- `--ignore-user-config` + `--strict-config` — powtarzalność: tor nie dziedziczy twojego prywatnego configu
- `--ephemeral` — bez zapisu sesji na dysk

### F-6. `_meta/runs/launch-batch.sh` — izolacja zasobów, którą już zbudowałeś

Ten skrypt **już robi wszystko, o co pytasz w bólu 2 i 4**. Dla każdego zadania:

- osobny worktree: `git worktree add $WT/$T -b wt/$T` (`$WT=~/Projects/kira-wt`)
- osobna baza jako klon szablonu: `create database monopilot_${TAG}_${task} template monopilot`
- osobny plik promptu `.codex-task.md` w worktree toru
- twardy limit czasu: `perl -e 'alarm shift @ARGV; exec @ARGV' 1800`
- meldunek do pliku: `-o "$WT/$T/.codex-last.md"`

Dwie rzeczy do odświeżenia przed ponownym użyciem:

1. `-m gpt-5.5` — **nieaktualny pin**. Twoja reguła to `gpt-5.6-sol @ xhigh`.
2. `--dangerously-bypass-approvals-and-sandbox` — to jest drugi launcher, z **przeciwną** postawą niż `--sandbox workspace-write` z notatki. Masz dwa launchery o sprzecznych ustawieniach piaskownicy i wczoraj użyłeś tego ślepego. To jest źródło problemu, nie Codex.

### F-7. `scripts/test-db.sh` — trzy klony na sztywno

```
13:readonly CLONES=("monopilot_t1" "monopilot_t2" "monopilot_t3")
```

Trzy bazy. Ty prowadziłeś kilkanaście torów. **To wyjaśnia, jak jedna baza trafiła do dwóch torów** — nie pomyliłeś się w arytmetyce, wyczerpałeś pulę. `launch-batch.sh` z F-6 nie ma tego ograniczenia (nazwa bazy pochodzi z tagu zadania).

### F-8. `.claude/settings.json` — pusty pod kątem obrony przed kolizjami

```json
"permissions": {
  "defaultMode": "bypassPermissions",
  "deny": ["Bash(git push --force:*)", "Bash(git push -f:*)", "Bash(git push origin main:*)", ...]
}
"hooks": { "Notification": [...] }
```

- Strażnicy są **tylko na `git push`**. Na `git add` nie ma nic — stąd ból 4.
- Jedyny hook to `Notification`. **Brak `SubagentStart`, brak `PreToolUse`.**
- `.claude/agents/` — 5 definicji (`kira-codex-review`, `kira-easy`, `kira-mechanical`, `kira-research`, `kira-ui`), żadna nie używa `isolation` ani własnych hooków.

### F-9. Środowisko

- Postgres natywnie na `127.0.0.1:5432` (i `[::1]:5432`).
- **Dockera nie ma zainstalowanego** (`docker: command not found`). Kontenery jako izolacja = najpierw instalacja Dockera. Odpada jako „tanie".

---

## 1. Reguła routingu — Codex / Opus / nikt

Zbudowana na twoich zmierzonych obserwacjach, nie na teorii o modelach.

> **Pytanie rozstrzygające: czy wynik zadania da się sprawdzić bez uruchomienia czegokolwiek?**
>
> - **TAK → Codex.** Czytanie, mapowanie, przemiot klas, „gdzie się to zapisuje", spis wywołań, review diffa, generowanie kodu z jasnym kontraktem.
> - **NIE → Opus.** Migracje, baza, przeglądarka, E2E, „czy to naprawdę działa", bramki.
> - **Zadanie brzmi jak fakt o repo, nie jak zmiana → nikt.** Zrób to grepem sam. Delegowanie „ile jest wystąpień X" kosztuje więcej niż `grep -c`.

Dwa dopiski wprost z twoich danych:

**Dopisek A — „Codex pisze, ktoś inny weryfikuje" przestaje być regułą, jeśli dasz mu bazę.** Poprawka z błędem składni powstała dlatego, że pisał **na ślepo**. Z F-3 przestaje być ślepy. Nadal weryfikujesz — ale weryfikujesz kod, który **raz się wykonał**, a nie kod, którego nikt nie uruchomił. To jest różnica między łapaniem błędów składni a łapaniem błędów logiki.

**Dopisek B — martwy plik.** Codex zgłosił tezę opartą na funkcji nadpisanej przez dwie późniejsze migracje. To nie jest wada modelu, to brak w zleceniu. Reguła: **każde zlecenie „przeczytaj i zgłoś tezę" musi zawierać zdanie „podaj najnowszą migrację dotykającą tego obiektu i dowód, że nie została nadpisana"**. Ten jeden wiersz w promptcie kosztuje mniej niż dzień, który by cię to kosztowało.

### Czy da się dać Codexowi bazę bezpiecznie? Tak, z jednym zastrzeżeniem

Zalecany zestaw dla toru kodowo-bazowego:

```
codex exec --sandbox workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -m gpt-5.6-sol -c model_reasoning_effort=xhigh \
  -C <worktree-toru>
```

To jest **ściśle bezpieczniejsze** niż `--dangerously-bypass-approvals-and-sandbox`, którego już używasz w `launch-batch.sh`: zapis nadal ograniczony do workspace'a.

**Zastrzeżenie, które musi być powiedziane wprost:** `network_access=true` otwiera **całą** sieć, nie tylko localhost. Nie znalazłem w 0.144.1 sposobu na zawężenie do `127.0.0.1`. Więc: agent z tą flagą może wyjść w internet. Praktyczna konsekwencja — **nie dawaj torowi z `network_access=true` produkcyjnego `DATABASE_URL`**. Dawaj klon z `launch-batch.sh`. Klon i tak jest ci potrzebny z powodu izolacji.

- **Ból:** 1 · **Koszt:** jedna flaga · **Ryzyko:** średnie, ograniczane przez klon zamiast produkcji

---

## 2. Tańsza weryfikacja — kontrakt meldunku zamiast prozy

Nie chcesz weryfikować mniej. Chcesz, żeby weryfikacja była tańsza. Najdroższy element to **czytanie prozy i zgadywanie, czy pod nią coś się uruchomiło**.

### 2a. Dla Codexa: `--output-schema` (potwierdzone w F-4)

Jeden plik schematu, wspólny dla wszystkich torów, np. `_meta/runs/lane-report.schema.json`. Wtedy sprawdzenie fali to:

```
jq -r 'select(.verdict!="verified") | .claim' $WT/*/.codex-last.json
```

Tory, które nie mają `verified`, czytasz. Reszta ma surowe wyjście w polu, do którego zaglądasz wyrywkowo. **To zamienia czytanie czternastu meldunków na czytanie tych, które same się przyznały.**

Twarde ograniczenie, którego nie zamiotę: schemat wymusza **kształt** odpowiedzi, nie jej **prawdziwość**. Model nadal może wpisać w `raw_output` coś, czego nie uruchomił. Ale różnica jest realna: zmyślenie stringa w polu `raw_output` obok `exit_code: 0` to jawna fabrykacja, a nie mgliste „zaimplementowałem i wygląda dobrze". Twój Codex już raz odmówił fabrykowania wyników — ten format gra na tę jego mocną stronę.

- **Ból:** 1 · **Koszt:** 1 plik + `jq` w pętli · **Ryzyko:** niskie

### 2b. Dla subagentów Opus: pole `verdict` w zleceniu

Subagenci nie mają `--output-schema`. Tańszy substytut, który kosztuje jedno zdanie w promptcie:

> Zakończ meldunek blokiem: `VERDICT: verified|failed|not_executed`, a nad nim wklej **dosłowne** wyjście komendy bramkującej wraz z kodem wyjścia. Jeśli komenda nie została uruchomiona, `not_executed` — to jest poprawna odpowiedź, nie porażka.

Ostatnie zdanie jest ważne: daje agentowi wyjście awaryjne, żeby nie udawał. Twoi subagenci już czterokrotnie odrzucili zlecenie i mieli rację — ta furtka jest zgodna z tym, jak faktycznie się zachowują.

- **Ból:** 1 · **Koszt:** jedno zdanie · **Ryzyko:** niskie

### 2c. Postęp bez blokowania: `--json`

`codex exec --json` wypluwa JSONL zdarzeń. Do żywego podglądu fali (`tail -f | jq`) zamiast czekania do końca i czytania loga po fakcie.

- **Ból:** 1 (pośrednio) · **Koszt:** flaga + `jq` · **Ryzyko:** żadne

---

## 3. Izolacja zasobów — masz to już zbudowane

**Odpowiedź brzmi: nie buduj nic nowego, użyj `_meta/runs/launch-batch.sh` (F-6).**

Twoje ręczne przydzielanie baz i portów to nie brak narzędzia — to zapomniane narzędzie. Skrypt robi worktree + klon bazy + prompt per tor jednym wywołaniem, i jest niewrażliwy na liczbę torów (nazwa bazy z tagu zadania).

Co poprawić, w kolejności:

1. `-m gpt-5.5` → `gpt-5.6-sol`, dodaj `-c model_reasoning_effort=xhigh`.
2. `--dangerously-bypass-approvals-and-sandbox` → `--sandbox workspace-write -c sandbox_workspace_write.network_access=true`. **Ściśle mniejsze uprawnienia przy tej samej sprawności** (F-3).
3. Dorzuć `--output-schema` i zmień `-o .codex-last.md` na `-o .codex-last.json`.

O trzech alternatywach, o które pytasz:

- **Worktree'y** — już ich używasz w tym skrypcie, i dodatkowo Claude Code ma `isolation: "worktree"` w narzędziu Agent (worktree w `.claude/worktrees/`, auto-sprzątany jeśli nietknięty). To jest dobra warstwa dla subagentów Opus, których dziś odpalasz bez izolacji — żadna z 5 definicji w `.claude/agents/` jej nie ma.
- **Kontenery** — **odpada jako tanie.** Dockera nie masz zainstalowanego (F-9). Klon bazy z `template monopilot` daje ci izolację danych za ułamek kosztu.
- **Coś w samym Claude Code** — `isolation: "worktree"` powyżej; poza tym nic, co przydzielałoby porty czy bazy. Porty i bazy zostają po stronie skryptu.

- **Ból:** 2 i 4 · **Koszt:** ~20 min na odświeżenie skryptu · **Ryzyko:** niskie

### 3b. `scripts/test-db.sh` — pula trzech baz to pułapka na fale

`CLONES=("monopilot_t1" "monopilot_t2" "monopilot_t3")` (F-7). Przy czternastu torach to nie jest izolacja, to loteria. Albo używaj `launch-batch.sh` do fal, albo podnieś pulę — ale wtedy i tak musisz przydzielać ręcznie, czyli wracasz do bólu 2.

**Zalecenie:** `test-db.sh` zostaw do pracy pojedynczej (do trzech torów), `launch-batch.sh` do fal. Zapisz tę granicę, bo jest niewidoczna — nic nie krzyknie, gdy ją przekroczysz. Dwa tory dostaną tę samą bazę i **oba zameldują zieleń**.

---

## 4. Wspólny kontekst dla torów — hook zamiast pliku do przeczytania

Plik z briefem zadziałał, ale ma dziurę: **agent musi go przeczytać**. Nie masz gwarancji, że przeczytał, ani że przeczytał całość.

Mechanizm mocniejszy: **hook `SubagentStart`**, który dopisuje tekst do kontekstu **każdego** startującego agenta, zanim ten cokolwiek zrobi.

**Dowód, że to działa, masz w tej sesji.** Ten agent (ja) dostał na starcie wstrzyknięty blok:

```
SubagentStart hook additional context: PONYTAIL MODE ACTIVE — level: full
```

Nie przeczytałem go z pliku. Był w kontekście od pierwszej tury. Dokładnie tego potrzebujesz dla ostrzeżeń o pułapkach narzędziowych (ból 3): trzy–pięć linii, których nie da się pominąć.

Kandydaci do wstrzyknięcia — same twoje zmierzone pułapki:

- baza toru to **klon**, nigdy produkcja; `DATABASE_URL` bierzesz z pliku toru
- `git add` **tylko po jawnej liście ścieżek**, nigdy `-A` ani `.`
- meldunek kończysz `VERDICT:` + dosłowne wyjście komendy bramkującej
- teza o schemacie wymaga wskazania **najnowszej** migracji dotykającej obiektu

Trzymaj to **krótkie**. Hook, który wstrzykuje dwie strony, zostanie zignorowany tak samo jak plik.

Warstwa druga, komplementarna: brief w `_meta/WZORCE-KAMPANII-NAPRAWCZEJ.md` zostaje dla treści długiej, hook niesie tylko to, czego złamanie kosztuje falę.

- **Ból:** 3 · **Koszt:** ~30 min · **Ryzyko:** niskie; największe to rozrost hooka

### 4b. Ból 4 — `git add` zabezpiecz permisją, nie prośbą

`.claude/settings.json` ma dziś strażników wyłącznie na `git push` (F-8). Zagarnięcie cudzej pracy przyszło przez `git add`. Wpis w `permissions.deny` w rodzaju `Bash(git add -A:*)` / `Bash(git add .:*)` kosztuje dwie linie i działa **niezależnie od tego, co agent sobie pomyślał**.

To jest tańsze niż ostrzeżenie w promptcie, bo ostrzeżenie trzeba powtarzać, a permisja obowiązuje zawsze.

Zastrzeżenie: `defaultMode: "bypassPermissions"` w tym pliku oznacza, że lista `deny` jest **jedyną** obroną. Warto sprawdzić, czy `deny` faktycznie bije `bypassPermissions` w 2.1.221, zanim na tym polegniesz. **Tego nie zweryfikowałem uruchomieniem.**

- **Ból:** 4 · **Koszt:** 2 linie · **Ryzyko:** niskie, ale wymaga jednego testu potwierdzającego

---

## 5. `Workflow` — uczciwa odpowiedź: nie w tej kampanii

Prosiłeś, żebym powiedział wprost, jeśli nie pasuje. Nie pasuje, z trzech powodów:

**Powód 1 — nie jest dostępny tam, gdzie orkiestrujesz.** W tej sesji subagenta `Workflow` **nie istnieje** — trzy niezależne zapytania `ToolSearch` go nie znajdują. Jeśli jest tylko w głównej pętli, to nie możesz nim rozdzielać torów z wnętrza toru, a twój wzorzec fal jest właśnie zagnieżdżony.

**Powód 2 — twoje fale nie są deterministyczne, i to jest ich zaleta.** `Workflow` wygrywa tam, gdzie kroki są znane z góry i stałe. Twoja fala wygląda inaczej: pięć torów rusza, ty czytasz meldunki, **jeden odrzuca zlecenie i ma rację**, przeplanowujesz. To zdarzyło się kilkakrotnie w ostatniej dobie. Ustalony z góry graf kroków nie ma jak przyjąć „twoja propozycja naprawy migracji nie odblokowałaby ani jednego joba CI" — a to była najcenniejsza rzecz, jaką dostałeś.

**Powód 3 — nie adresuje ani jednego z twoich czterech bólów.** Weryfikacja (1) to `--output-schema` i kontrakt meldunku. Zasoby (2) i kolizje (4) to `launch-batch.sh` i permisje. Powtarzane ostrzeżenia (3) to hook `SubagentStart`. `Workflow` nie dotyka żadnego z nich — on porządkuje **kolejność**, a twoim problemem nie jest kolejność.

**Ręczne fale działały dobrze. Zostaw je.** Zysk siedzi w tym, co dostają tory na wejściu i co oddają na wyjściu, nie w tym, kto je odpala.

Jeśli kiedyś sięgniesz po `Workflow`, to na jeden wzorzec: **powtarzalna bramka po fali** (typecheck → build → testy → PREPARE migracji), gdzie kroki naprawdę są stałe. Ale to dziś robi skrypt bash i robi to taniej.

---

## Czego nie zdążyłem

Ucięty budżet. W kolejności, w jakiej bym to dokończył:

1. **`-p, --profile` nie przetestowany uruchomieniem.** Flaga jest w `--help` 0.144.1 i ma nakładać `$CODEX_HOME/<nazwa>.config.toml`. Nie stworzyłem profilu `lane.config.toml` i nie sprawdziłem, czy faktycznie się nakłada. To jest najczystsza droga do „jeden zestaw ustawień toru zamiast pięciu `-c`" — warto potwierdzić jednym przebiegiem.
2. **Czy `permissions.deny` bije `defaultMode: "bypassPermissions"`.** Zalecenie 4b na tym stoi. Test: wpis deny na nieszkodliwą komendę + próba jej uruchomienia.
3. **Zawężenie `network_access` do localhost.** Nie znalazłem takiej opcji w 0.144.1, ale nie przeczesałem pełnego `config-reference`. Gdyby istniała, ryzyko z ruchu 2 spada do zera.
4. **Fakty o Claude Code z podagenta** (limity równoległości, pełna lista pól frontmatter agentów, kontrakt hooka `SubagentStart`) — dostałem raport, ale **nie zweryfikowałem osobiście**. Osobiście potwierdziłem tylko: `Workflow` niedostępny w sesji subagenta, oraz że `SubagentStart` realnie wstrzykuje kontekst (dowód w sekcji 4). Resztę traktuj jako do sprawdzenia.
5. **Test „czy Codex z bazą naprawdę złapałby tamten błąd składni"** — odtworzenie wczorajszej migracji pod `network_access=true`. To zamieniłoby zalecenie 2 z prawdopodobnego w udowodnione.

### Gotcha środowiskowa, na którą się nadziałem

Bare `ls` jest przechwytywany przez hook rtk i zwraca **pusty wynik z kodem wyjścia 0**. Nie błąd — pustkę. Straciłem na tym trzy wywołania, zanim przeszedłem na `/bin/ls`. To jest ten sam wzorzec „zieleń przez pominięcie", który tropisz w testach: komenda mówi „w porządku", a nie zrobiła nic.
