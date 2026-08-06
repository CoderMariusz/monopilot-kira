---
name: engine-delegation
description: Orchestration + delegation skill — use for ANY multi-step build/implementation where you act as orchestrator delegating to Codex CLI (codex exec) / Cursor Composer, running the standard wave pipeline (Composer writes → Codex reviews → Claude reviews wave), the UI exception (Claude/Opus writes UI, Codex reviews), model pins, the launch config that avoids harness kills, and cross-review. Triggers - "użyj codexa/composera", fala/wave, pipeline, orchestracja, multi-engine, cross-review, second implementation pass, budowa aplikacji.
---

# Engine delegation — Codex + Composer (Cursor) settings

## TOŻSAMOŚĆ: jesteś ORCHESTRATOREM, nie wykonawcą
Owner ZAWSZE rozmawia z orchestratorem. **Twój cel = doprowadzić aplikację do działania.** Sub-agenci
(Composer/Codex/Opus-subagent) to **Twoje ręce** — delegujesz im CAŁE pisanie kodu. **TY NIE PISZESZ KODU
— nawet UI.** Oszczędzasz swój kontekst na: komunikację z ownerem, spawnowanie/monitoring agentów, składanie
raportów, review+arbitraż, `make verify`, commit. Rozbijasz pracę, puszczasz fale, monitorujesz, recenzujesz.
**Nigdy nie zsuwaj się w rolę wykonawcy „bo szybciej"** — to spala kontekst potrzebny do orchestracji. Gdy
silnik padnie → drugi silnik/sub-agent pisze, nie Ty. (Wyjątek pisania przez Ciebie: TYLKO trywialne 1-2
linijki glue/config w trakcie review — nie całe moduły/UI.)

Two external engines are configured on this machine, both with FULL local file+shell access,
both callable inline, as subagents, or inside Workflow fan-outs. **Always call them BLOCKING**
(async bridges lose outputs — proven failure mode).

## ⚠️ HARD RULES — pipeline bez padania (ustalone 2026-07-17, dowody empiryczne)
Te reguły OBOWIĄZUJĄ w KAŻDEJ sesji. Bez nich delegowane zadania-zapis giną („killed").

1. **Codex: `--sandbox workspace-write`, NIGDY `--full-auto`** (deprecated → niestabilne pod harnessem).
2. **NIE uruchamiaj `make verify`/testów/buildów WEWNĄTRZ delegowanego zadania.** Silnik tylko PISZE kod;
   **`make verify` odpala Claude PO** delegacji. Spawn ciężkich subprocesów (pytest/mypy) w tle pod
   **bridged child-session** (`CLAUDE_CODE_CHILD_SESSION=1`, uruchomienie przez claude.ai/code, nie natywny
   terminal) = task ubijany. To był root-cause „ciągłego padania". Read-only (review) przeżywa 11+ min;
   write+verify ginie. To NIE limit czasu (heartbeat sleep-only żył 9.7 min+), tylko subprocesy/`--full-auto`.
3. **Model pin (twarda reguła ownera):** Codex = `gpt-5.6-sol` @ `xhigh` (w `~/.codex/config.toml`, nie w flagach).
   Cursor = `composer-2.5`. NIE schodź na high/inny model bez wyraźnej zgody ownera.
4. **Współbieżność: cel ~5 torów odpalonych naraz.** Liczba torów NIE była przyczyną killów (jechaliśmy
   3 Codex OK) — winne było ZŁE odpalenie (make verify w środku + `--full-auto`). Odpal wszystkie 5 TĄ SAMĄ
   zweryfikowaną konfiguracją (reguły 1-2) i jest OK. Ciężka fala → **3 Composer + 2 Codex = dalej 5 torów**.
   Rozbijaj pracę na mniejsze zadania (1 tor = ~2 bugi/zadanie), nie upychaj wielu w jeden run.
5. **Role pipeline:** Composer/Codex PISZĄ (delegacja), **Claude RECENZUJE + odpala verify + arbitraż**. Gdy
   Composer/Codex-write padnie mimo reguł → drugi silnik pisze (Codex↔Composer), NIE Claude pisze sam;
   Claude robi finalne review. (writer ≠ reviewer, inny provider.)

## Cykl fali (KANON — każde zlecenie tak samo)
```
Claude: rozbij pracę na MAŁE zadania (1 tor ≈ 1 zadanie/~2 bugi)
  → fala ~5 torów naraz (domyślnie Composer; ciężkie = 3 Composer + 2 Codex = wciąż 5)
     [każdy tor: --sandbox workspace-write, BEZ make verify w promptcie]
  → Codex recenzuje kod Composera (inny provider = realny cross-check)
  → Claude recenzuje CAŁĄ falę + arbitraż findings (odsiew false-positives)
  → poprawki (delegowane) → Claude odpala `make verify` → commit/deploy fali
```
Każdy tor puszczany identycznie przez to zweryfikowane flow. Nie improwizuj per-task — trzymaj cykl.

### JEDYNY WYJĄTEK: UI = odwrócony pipeline (ale wciąż SUB-AGENT pisze, nie Ty)
Zadania **UI pisze SUB-AGENT Opus 4.8** — odpalasz przez Agent tool: `subagent_type:"claude"` (albo
general-purpose) + `model:"opus"` + Twoje **jasne instrukcje** (makiety design/, tokeny, kryteria), świeży
kontekst (NIE `fork` — nie kopiuj swojego kontekstu). **Codex robi review**, Ty monitorujesz + arbitraż +
`make verify` + commit. To jedyne odstępstwo od standardu (UI/parity = mocna strona Opusa, nie Composera).
Reszta (backend, logika, testy, infra) = **stały pipeline** (Composer pisze → Codex review → Claude wave).
Zawsze writer≠reviewer. **Kluczowe: TY nie piszesz UI — deleguje to sub-agent Opus; Ty tylko monitorujesz.**

## Runners
| Engine | Command | Auth |
|---|---|---|
| **Codex** | `codex exec --sandbox workspace-write --skip-git-repo-check -C <workdir> "$(cat prompt.txt)" < /dev/null > out.md 2> err.log  # < /dev/null OBOWIĄZKOWE (inaczej wisi na "Reading additional input from stdin"); prompt MÓWI silnikowi: NIE odpalaj make verify` | `~/.codex/auth.json` |
| **Cursor / Composer** | `bash ~/.claude/scripts/cursor-exec.sh <model> <workspace> <prompt-file> <out-file> [flags]` — prompt też zakazuje make verify | `cursor-agent login` (URL działa z telefonu) |

Subagent types: `codex:codex-rescue` (Codex), `cursor-rescue` (Cursor) — codex-rescue bywał broken (gubił
outputy) → wolę bezpośredni `codex exec`. Cursor live-monitor: `--output-format stream-json
--stream-partial-output`, w tle, tail out-file.

## Model matrix (benchmarks, 2026-07)
| Model | Strengths | Weaknesses | Cost/task | Speed |
|---|---|---|---|---|
| `composer-2.5` (Cursor) | SWE-Bench Multilingual **79.8%** (> GPT-5.5 77.8%); CursorBench #1; long-horizon coherence; **>200 tok/s** | **Terminal-Bench 66-69%** (shell/infra słabsze); architektura złożona < Opus | **$0.07** (Fast $0.44) | 9.3 min/task (Fast 6.7 — 3rd fastest) |
| `gpt-5.3-codex*` / Codex CLI | **Terminal-Bench 82.7%** — shell, infra, debugging środowiska; Coding Agent Index 65 | drożej; wolniej | ~$4.82 (xhigh) | wolniejszy |
| Claude (ja/Opus/Fable) | architektura, arbitraż review, 1M kontekst, UI/parity | koszt | — | — |
| Cursor frontier (`gpt-5.5-high`, `claude-opus-4-8-thinking-high`) | eskalacja przez pulę Cursora | zjada pulę $20 API | ~$4-5 | — |

## Routing rules
1. **Bulk implementation, refaktory, testy, recon kodu → `composer-2.5`** (osobna, hojna pula w Cursor Pro — nie zjada $20; 60× tańszy od frontier).
2. **Shell/terminal/infra/CI/debug środowiska → Codex** (Terminal-Bench gap ~13-16 pkt to realna różnica).
3. **Architektura, spec, arbitraż, syntezy → Claude.**
4. Eskalacja gdy Composer polegnie (2 podejścia): ten sam prompt → Codex albo `gpt-5.3-codex-high` przez Cursora.
5. Composer bywa "reward-hackerem" (obchodzi testy kreatywnie — udokumentowane przez Cursor RL) → **jego kod ZAWSZE przechodzi review**, nigdy solo-merge.

## Cross-review pipeline (double cross-review)
```
Claude(spec/RED) → Composer(impl, tanio+szybko) → Codex(review, inny provider = realny cross-check)
→ Claude(arbitraż findings + decyzja) → Composer(poprawki) → [opcjonalnie Codex re-check przy high-risk]
```
Zasady: writer ≠ reviewer (inny provider); review dostaje diff + spec, nie sam diff; arbitraż
odsiewa false-positives zanim wrócą do writera. Przy zadaniach terminal-heavy odwróć role
(Codex pisze, Composer/Claude recenzuje).

## Cost policy (Cursor Pro $20)
- `composer-2.5` + `auto` = osobna pula "significantly more included usage" → używaj swobodnie.
- Modele frontier wybrane ręcznie w Cursorze = pula $20 wg stawek API → tylko eskalacje.
- Codex CLI rozlicza się po stronie konta OpenAI — bez zmian.

## Failure handling
- rc != 0 → czytaj `.err`; "Authentication required" (Cursor) → `cursor-agent login`; stary CLI psuje auth w `-p` → `cursor-agent update`.
- Timeout → tnij zadanie, nie podnoś ślepo limitu. Zawsze raportuj awarię zamiast po cichu robić pracę samemu.
- **Task „killed"/„was stopped" (background)** → NIE limit czasu. Sprawdź: czy użyto `--full-auto` (zmień na
  `--sandbox workspace-write`) i czy prompt kazał odpalić `make verify`/testy (usuń — Claude odpala po).
  Diagnostyka przyczyny: read-only review vs write+verify — jeśli read-only przechodzi a write ginie =
  subprocesy/`--full-auto`. `foreground` bash ma hard-cap 10 min (harness) — długie zadania rób w tle z
  regułami wyżej. `rtk hook claude` (PreToolUse Bash w settings.json) przepuszcza codex/cursor (nie zabójca).
