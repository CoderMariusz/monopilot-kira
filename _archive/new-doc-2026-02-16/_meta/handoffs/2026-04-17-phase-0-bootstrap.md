# HANDOFF — Phase 0 Bootstrap

**From session:** 2026-04-17 brainstorm
**To session:** Phase 0 — Meta-spec + Skill audit
**Phase:** 0 of (0 → A → D → B → C)

---

## Co zrobione (brainstorm session)

- Pełny brainstorm: 4 sekcje designu zatwierdzone
- Spec zapisany: `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md` (+ kopia w `_meta/specs/`)
- Strategiczne decyzje:
  - Approach 2 (A → D → B → C) + Hybryda 1+3 (Claude dla A/D/B, armia agentów dla C)
  - Config level: (a) schema-light + furtka na (b) rule engine w 3–5 obszarach
  - Target PLD v7: Bridge → replace (12-m dual maintenance, potem Monopilot zastępuje)
  - Monopilot docelowo zastępuje D365 (kolejny reality source po PLD v7)
  - Multi-tenant from day 1 (Apex = pierwsza konfiguracja, nie jedyna)
  - Custom reports = universal templates + metadata-driven content (nie per-client code)
  - Custom workflows = dane (JSON/DB), nie kod — silnik universal, definicje per org

## Co dalej — Phase 0 deliverables (1 sesja + parallel agent track)

**Claude track:**
1. Napisać `00-foundation/decisions/META-MODEL.md` wg §2 spec-a (8 punktów)
2. Napisać 4 nowe ADRs:
   - ADR-028 Schema-driven column definition
   - ADR-029 Rule engine DSL scope + workflow definitions as data
   - ADR-030 Configurable department taxonomy
   - ADR-031 Schema variation per org
3. Draft 4 nowych skilli w `00-foundation/skills/`:
   - `schema-driven-design`
   - `rule-engine-dsl`
   - `reality-sync-workflow`
   - `multi-tenant-variation`
4. Update istniejącego skilla `documentation-patterns` o markery [UNIVERSAL]/[APEX-CONFIG]/[EVOLVING]/[LEGACY-D365]
5. Napisać `00-foundation/patterns/REALITY-SYNC.md`

**Parallel agent track (spawn na początku):**
- Agent audytuje 47 istniejących skilli w `00-foundation/skills/`
- Output: `SKILL-AUDIT.md` z rekomendacjami (deprecate/merge/tune/add) + weryfikacja dopasowania pod tech stack
- Po review: aktualizacja `REGISTRY.yaml` + nowy `SKILL-MAP.yaml`

**Quality gate na koniec Phase 0:** user review META-MODEL + 4 ADRs + skille + SKILL-AUDIT. Dopiero potem Phase A.

## Kontekst do odświeżenia (MUSI przeczytać na starcie)

Kolejność czytania od najważniejszego:

1. `docs/superpowers/specs/2026-04-17-monopilot-migration-design.md` — **pełny spec**, rozdz. 2–5 kluczowe
2. `new-doc/00-foundation/ANALYSIS.md` — istniejąca struktura foundation (60+ plików, 25 ADRs, 47 skilli)
3. `new-doc/00-foundation/decisions/` — istniejące ADRs (lista po nazwach, pełne tylko te które są relevant: ADR-003 RLS, ADR-011 module toggle, ADR-012 role-permission, ADR-015 constants)
4. `new-doc/00-foundation/skills/REGISTRY.yaml` — obecny rejestr skilli
5. `new-doc/00-foundation/patterns/DOCUMENTATION-SYNC.md` — istniejący pattern (REALITY-SYNC będzie nań oparty)

**Zasada minimalizacji:** NIE czytać 16 modułów. Phase 0 dotyczy tylko foundation + meta.

## Skille do inwokowania (zgodnie z SKILL-MAP phase-0)

- `superpowers:writing-plans` — pierwsze po bootstrapie (stworzenie implementation plan dla Phase 0 z konkretnymi taskami)
- `architecture-adr` — przy pisaniu 4 nowych ADRs
- `documentation-patterns` — ogólne zasady
- `skill-creator:skill-creator` — przy draft nowych skilli i selektywnym tuningu (po skill audit)

## Open questions (do rozstrzygnięcia w Phase 0)

- Konkretna składnia rule engine DSL (Mermaid pseudo-code / JSON schema / textual) — decyzja w ADR-029
- Czy `SKILL-MAP.yaml` trzymać w foundation/skills czy foundation/decisions — sugeruję skills (blisko REGISTRY)
- Layout METAMODEL.md — single file czy split na 8 plików (po 1 per punkt)? Sugeruję single + section anchors

## Zasady które obowiązują (przypomnienie)

- **Pure documentation, NO CODE SNIPPETS** — opisy semantyczne, tabele, Mermaid. Wyjątek: context/*.yaml jako contract files.
- **Markery obowiązkowe:** [UNIVERSAL] / [APEX-CONFIG] / [EVOLVING] / [LEGACY-D365]
- **Cross-referencing:** każdy link do innych docs używa pełnych ścieżek
- **Brainstorm przed pisaniem:** invoke `superpowers:brainstorming` jeśli cokolwiek niejasne przed touching docs
- **Writing-plans jako terminal step brainstormu:** po brainstormie, pisz plan, potem dopiero dokumentacja

## Następny krok po Phase 0 close

Phase A — dokumentacja PLD v7 (3 sesje), nowy HANDOFF wygenerowany na końcu Phase 0.
