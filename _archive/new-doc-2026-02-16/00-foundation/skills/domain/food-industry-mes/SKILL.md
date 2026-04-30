---
name: food-industry-mes
description: Food-manufacturing MES domain patterns — BOM modeling, lot/traceability, allergen management, shelf-life calc, Stage-Gate NPD, GMP baseline. Currently a PLACEHOLDER — full draft in Phase A after PLD v7 reality docs are written.
tags: [monopilot, domain, food-industry, mes, bom, traceability]
status: draft-placeholder
---

## Status: PLACEHOLDER — to be drafted in Phase A

**Reason:** Ten skill agreguje wiedzę domenową food-manufacturing MES. Żeby nie zgadywać, co jest `[UNIVERSAL]` vs `[APEX-CONFIG]`, **pełny draft powstaje w Phase A** — po napisaniu reality docs PLD v7 w `_meta/reality-sources/pld-v7-excel/`. Dopiero wtedy wiemy, co z procesów Apexa jest fundamentem branży, a co specyfiką.

## Planned scope (Phase A deliverable)

Skill docelowo pokryje 6 obszarów domenowych:

1. **BOM modeling** — recipe/formulation structure, ingredient dependencies, BOM snapshot pattern (ADR-002)
2. **Lot/traceability** — forward/backward trace <30s (ADR-001 LP genealogy), batch management, expiry + manufacturing dates
3. **Allergen management** — EU-14 allergens as [UNIVERSAL] baseline, custom per-org allergens as [APEX-CONFIG]
4. **Shelf-life calculation** — FIFO/FEFO strategies (ADR-005), shelf-life formulas per product class
5. **Stage-Gate NPD** — G0→G4 workflow as data (ADR-029 + META-MODEL §8), gate criteria per stage
6. **GMP baseline** — HACCP/CCP integration points, audit trail requirements (ADR-008), 21CFR11 groundwork

## When full draft should be written

- **Trigger:** End of Phase A (3 sessions dokumentujące PLD v7 reality)
- **Inputs:** `_meta/reality-sources/pld-v7-excel/*` (8 docs) + cross-check z FEATURE-GAP-ANALYSIS + DISCOVERY-FUTURE-TRENDS
- **Output:** Pełny SKILL.md z patterns, anti-patterns, examples, markers per domain area

## Related

- `META-MODEL.md` (primary meta-model reference)
- ADR-001 (LP inventory), ADR-002 (BOM snapshot), ADR-005 (FIFO/FEFO), ADR-007 (state machine)
- REALITY-SYNC.md — pattern through which this skill will be informed
- Planned `_meta/reality-sources/pld-v7-excel/*` (Phase A)
- Spec §3.2 Phase A scope
