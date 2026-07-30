# PLAN DNIA 2026-07-30 — 12h ciągłej pracy

> **TO JEST PIERWSZE ŹRÓDŁO PO KOMPRESJI KONTEKSTU.**
> Jeśli czytasz to po kompakcie: nie zatrzymuj się, nie pytaj o potwierdzenie — pracuj dalej
> wg tego dokumentu aż do **20:00**. Sekcja 8 mówi, jak wznowić w 60 sekund.

---

## 1. Zlecenie ownera (dosłownie, 2026-07-30 ~08:10)

- **12h pełnego wykorzystania budżetu.** Max pracy na **Opus**, **Fable** i **Codex SOL**.
- **Crony co 20 minut przez 12h.** **Nie zatrzymuj się przed 20:00.**
  **Ostatnie zlecenie można puścić o 19:45.**
- W międzyczasie: **puszczaj zlecenia szukające błędów**, sprawdzaj **logikę działania aplikacji**,
  plus **fale napraw**.
- **E2E w przeglądarce — JEDEN NA RAZ.**
- Jestem **orchestratorem**: prowadzę flow napraw **plus** linię „finding", gdzie **Fable**
  sprawdza jakość aplikacji.
- **Cel:** znaleźć i naprawić jak największą liczbę błędów; przejść cały plan **1459 testów**;
  plus **wszystkie ścieżki E2E od NPD do finansów przez produkcję**.
- **Szczególna uwaga:** blokery · **niezgodności w obliczeniach** · niedziałające funkcje.

**Harmonogram:** start 08:13 · ostatnie zlecenie **19:45** · koniec **20:00**.

---

## 2. Dwie równoległe linie (to jest sedno)

### Linia A — FINDING (Fable)
Fable sprawdza **jakość i logikę aplikacji**, nie tylko zgodność z katalogiem.
Szuka tego, czego katalog nie zna: **błędnych obliczeń, niedziałających funkcji, blokerów**.
Wynik: zgłoszenia z `plik:linia` + dowód. **Fable nie naprawia.**

### Linia B — FIX (Codex SOL / Opus)
Naprawia potwierdzone defekty falami. **Codex `gpt-5.6-sol` @ `xhigh` = backend.**
**UI → subagent Opus** (Agent tool z **pominiętym** `model` = dziedziczy Opus 5).

### Linia C — E2E (ja, sekwencyjnie)
Ścieżki biznesowe w przeglądarce. **NIGDY dwie naraz.** Kolejność: NPD → technical → planning →
produkcja → magazyn → wysyłka → finanse.

---

## 3. Stan wyjściowy (na 08:13)

- **15 commitów WYPCHNIĘTYCH** (`9f9dd557..1323a7ae`). Produkcja ma migracje 543 + 544.
- **457 zaległych zdarzeń outboxu ostemplowanych** jako skonsumowane (decyzja ownera) —
  cron outboxu startuje od czystego stanu.
- **Faza 1 zamknięta: 55/55.** 25 defektów kodu → po deduplikacji **21 unikalnych przyczyn**
  (8 trywialnych, 8 średnich, 5 dużych).
- **Faza 2: 567 GAP** zinwentaryzowanych, poszardowanych na 51 torów. **0 domkniętych.**
- **Faza 3: 335 BLOCKED** — nietknięta.

### Decyzje ownera z 2026-07-30 (obowiązują, nie podważać)
| temat | decyzja |
|---|---|
| 457 zdarzeń outboxu | ostemplować jako skonsumowane ✅ zrobione |
| `WH-066` inwentaryzacja | **zostaje fail-closed**, katalog do korekty ✅ zrobione |
| `SFQ-072` przyjęcie z nierozwiązaną UoM | **zostaje blokada**, katalog do korekty ✅ zrobione |
| `completed→cancelled` i `blocked→active` | **oba zostają**, testy do korekty ✅ zrobione |
| **warunek ownera:** anulowanie ukończonego WO tylko dla outputu **nieskonsumowanego i niedzielonego** | **NIE był egzekwowany** — tor F3 naprawia obejście A |
| `UI-003` global search | **BEZ DECYZJI** — zapytać przy okazji |

---

## 4. Środowisko — gotowe, nie budować od nowa

```bash
./scripts/test-db.sh status     # 4 bazy: 507/507, 544/544, persony 5/5, harness TAK
./scripts/test-db.sh reset t1   # czyszczenie POJEDYNCZEGO klonu między szardami
bash scripts/e2e-local.sh <spec>   # E2E, asercja 127.0.0.1, --workers=1
```
Bazy: `monopilot` (harness przeglądarkowy) + klony `monopilot_t1/t2/t3` (tory równoległe).
Połączenie jako `mariuszkrawczyk` (superuser) — persony i seedy wymagają BYPASSRLS.

**Uruchamianie testów** (poprawione w `CLAUDE.md`):
```bash
pnpm --filter web exec vitest run --config ../../vitest.config.ts <plik>   # node
pnpm --filter web exec vitest run --config vitest.ui.config.ts <plik>      # UI
```
⚠️ Bez `exec` pnpm szuka SKRYPTU i nie uruchamia nic. `pnpm --filter web test` spina suity `&&`,
więc czerwony node blokuje UI — **uruchamiaj OSOBNO**.

Persona w przeglądarce: `signIn(page, baseURL, 'en', 'no_module_access')`
(`admin`, `second_signer`, `single_site_operator`, `no_asset_deactivate`).

---

## 5. ⚠️ Czego NIE wolno uznać za dowód lokalnie
e-podpis (fałszywy auth przyjmuje **dowolne** hasło) · Supabase Storage (atrapa) ·
unieważnianie tokenów · przełączanie flag funkcji (nie działa nigdzie) ·
moduły (`public.modules` puste) · **renderowanie strony**.

**Dowód = akcja + STAN TRWAŁY w bazie.** Zawsze **kontrola przeciwna**: pokaż, że sąsiednia
legalna ścieżka nadal działa. Sam dowód „odrzucone" to połowa roboty.

---

## 6. Wzorce z nocy — sprawdzaj, nie odkrywaj od nowa

1. **ANTY-TEST (12 wystąpień)** — zielony test utrwalający zachowanie **sprzeczne** z kontraktem.
   Skrajny `XC-047`: 624 zielone testy i18n przy 119 brakujących kluczach.
   **Gdy test zielony, a kontrakt mówi co innego — czytaj asercję DOSŁOWNIE.**
2. **„Brak testu kontraktowego" (19/55)** — test istnieje, zielony, mierzy coś obok.
3. **Rola `admin` nie może dać `forbidden`** (`has-permission.ts:14,26-35`) — testy negatywne
   wymagają persony.
4. **Brakujący grant w fixture'ze maskuje INNĄ bramkę** — `forbidden` tam, gdzie kontrakt mówi
   o czym innym.
5. **Dopasowanie po zbyt słabym znaczniku** — grep łapie komentarze, filtry łapią dwa projekty.
6. **Anchor z raportu toru to HIPOTEZA** — 8 z nich było nieaktualnych. Otwórz plik przed naprawą.
7. **Testy na atrapach nie dowodzą stanu trwałego** — dwa defekty (g→kg zwracające 0, netting WAC)
   wyszły wyłącznie przy przebiegu przeciw prawdziwemu Postgresowi.
8. **Guard chroniący jeden przypadek ZAMRAŻA sąsiedni** — 9 udokumentowanych wystąpień.

---

## 7. Reguły delegacji (twarde, z engine-delegation)
- Codex: `codex exec --sandbox workspace-write --skip-git-repo-check -C <repo> "$(cat prompt)" < /dev/null > out 2> err`
  **NIGDY `--full-auto`.** **NIGDY `make verify`/build/typecheck w promptcie toru** — bramkę odpala orchestrator.
- **Sandbox Codexa NIE MA dostępu do bazy** (`EPERM`) — tory piszą kod, **weryfikację uruchamiam ja**.
- Cel ~5 torów naraz. 1 tor ≈ 2 defekty / ~12 ID.
- **Ja nie piszę kodu** — wyjątek: trywialne 1-2 linie glue w trakcie review.
- Bramka przed commitem: **typecheck** · **obie suity OSOBNO** · **build** · **PREPARE migracji 3×** ·
  **różnica ZBIORÓW** czerwonych plików vs baseline (nie liczb).

---

## 8. JAK WZNOWIĆ PO KOMPAKCIE (60 sekund)
```bash
date "+%H:%M"                                  # ile zostało do 20:00
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
./scripts/test-db.sh status                    # środowisko gotowe?
/usr/bin/git log --oneline -5                  # gdzie jestem
/usr/bin/pgrep -f 'codex exec' | wc -l         # czy tory żyją
cat _meta/plans/2026-07-30-dzien-12h/DZIENNIK.md   # co zrobione, co następne
```
Potem: **pracuj dalej**. Nie pytaj o potwierdzenie. Nie zatrzymuj się przed 20:00.
Ostatnie zlecenie **19:45**, potem raport zbiorczy.

---

## 9. Kolejność prac (aktualizowana w DZIENNIK.md)

1. **Naprawa 21 przyczyn** — w toku (tory F1, F3). Poparcie: 59 czerwonych plików dziś,
   10 pokrywa się z defektami Fazy 1.
2. **Linia Fable — finding** — start natychmiast, równolegle. Priorytet: **obliczenia**
   (WAC, koszty, konwersje jednostek, wariancje), potem niedziałające funkcje, potem blokery.
3. **E2E ścieżki biznesowe** — sekwencyjnie: NPD → technical → planning → produkcja → magazyn →
   wysyłka → finanse.
4. **Faza 2 (567 GAP)** — szardy P1-P42 równolegle, B1-B9 przeglądarkowe pojedynczo.
5. **Faza 3 (335 BLOCKED)** — jeśli starczy czasu.

**Znane otwarte defekty do naprawy** (pełna lista: `../2026-07-29-katalog-testow-egzekucja/DEFEKTY-DO-DECYZJI.md`):
konwersja g→kg zwraca `0` · netting WAC po anulowaniu · flagi funkcji nie działają nigdzie ·
`pgcrypto` nieinstalowany przez żadną migrację · brak konta po świeżej migracji ·
rozjazd enum uprawnień vs baza · dwie implementacje wysyłki maili ·
`FORMATTING_ERROR` na `/en/dashboard` i `/en/settings/features` · wyciek notatek deweloperskich
do UI (`_meta/i18n-staging/`) · `NSA-027` release materializuje BOM przed preflightem.
