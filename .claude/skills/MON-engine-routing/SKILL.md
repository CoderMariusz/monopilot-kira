---
name: MON-engine-routing
description: monopilot-kira engine settings for Codex + Composer 2.5 (Cursor) - which external engine implements/reviews which tier, runner commands, cross-review pairing. Read together with docs/workflow/01-MODEL-ROUTING.md (source of truth for routing_hints tokens).
---

# MON engine routing — Codex + Composer 2.5 (added 2026-07-02)

Extends `docs/workflow/01-MODEL-ROUTING.md`. Global mechanics (runners, auth, failure handling,
benchmarks): see global skill `engine-delegation`.

## What changed
**Composer 2.5 (Cursor CLI) joins as a second external implementer** next to Codex:
- ~60× cheaper per task ($0.07 vs $4.82), >200 tok/s, SWE-Bench Multilingual 79.8% (≥ GPT-5.5),
  billed from Cursor Pro's separate generous pool (nie zjada $20 API ani tokenów Codexa).
- Weak spot: terminal/shell/infra (Terminal-Bench ~66-69% vs Codex 82.7%).

## Tier mapping (delta vs 01-MODEL-ROUTING.md)
| Token | Before | Now |
|---|---|---|
| `impl-easy` | Claude Sonnet | Sonnet **lub `composer-2.5`** (wybierz Composera gdy zadanie dotyka wielu plików — szybszy i tańszy) |
| `impl-standard` | Codex gpt-5.5 | **`composer-2.5` domyślnie**; Codex zostaje dla: migracji z ciężkim SQL/RLS wymagającym uruchamiania psql/cli, zadań terminal/infra/CI, debugowania środowiska |
| `impl-hard` / architektura | bez zmian | bez zmian (Claude/Opus/Codex high wg 01-MODEL-ROUTING.md) |
| review | Claude | **writer≠reviewer, inny provider**: kod Composera recenzuje Codex (`MON-codex-review-checklist`), kod Codexa recenzuje Claude/Composer-plan-mode |

## Runner (blocking, jak codex exec)
```bash
bash ~/.claude/scripts/cursor-exec.sh composer-2.5 ~/Projects/monopilot-kira prompt.txt out.md
# read-only review: dodaj --mode plan ; edycje w izolacji: dodaj -w <task-id>
```

## Guardrails (monopilot-specific)
1. Composer NIGDY solo na: auth/RLS/money/regulatory/canonical-owner (te tiery bez zmian per 01-MODEL-ROUTING.md).
2. Kod Composera zawsze przez Gate-5 quality gates + cross-review (model ma udokumentowane
   skłonności do reward-hackingu testów).
3. Prompt dla Composera samowystarczalny: task + MON-skill excerpt (wklej treść, Composer nie zna
   naszych skilli) + expected output. Workspace = repo root.
4. Eskalacja po 2 nieudanych podejściach Composera → Codex z tym samym promptem + notatka czemu.
