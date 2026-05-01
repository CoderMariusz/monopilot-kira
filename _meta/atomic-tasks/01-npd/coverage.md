# 01-NPD Atomic Task Coverage

PRD: `01-NPD-PRD.md` (v3.3 + N-* gap-backlog amendments 2026-04-30)

## Sub-module map

| Sub-module | Scope | Tasks |
|---|---|---|
| **NPD-a** | Core schema (product/fa view, prod_detail, brief, R13 audit, RLS, Reference seeds) | T-001..T-018 |
| **NPD-b** | Brief module + convert-to-PLD | T-024..T-029 (mixed with NPD-a UI) |
| **NPD-c** | Allergens cascade (Reference.Allergens, by_RM, by_Process, V07) | T-009..T-017 (mixed) |
| **NPD-d** | D365 Builder (8-tab xlsx, Builder wizard, V01-V08 validators) | T-030..T-047 |
| **NPD-e** | Dashboard (counters, alerts, per-dept, controls, refresh) | T-048..T-053, T-091 |
| **NPD-f** | Stage-Gate Pipeline (G0-G4, projects, gates, approvals, e-sig, kanban/table/split) | T-054..T-062 |
| **NPD-g** | Recipe / Formulation editor (versions, ingredients, compute, lock) | T-063..T-068 |
| **NPD-h** | Nutrition + Costing + Sensory stage screens | T-069..T-076 |
| **NPD-i** | Approval + Risk Register (V18) + Compliance Documents (expiry) | T-077..T-088 |
| **NPD misc** | GDPR right-to-erasure (§15), D365 cache scheduled sync (§10.8) | T-089, T-090 |

## Coverage rows (T-048..T-091, gap-fill batch 2026-05-01)

| PRD ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| §11.2, §11.3, §11.4 | tasks/T-048.json | NPD-e | T1-schema | covered |
| §11.3, §10.8, §11.7 | tasks/T-049.json | NPD-e | T1-schema | covered |
| §11.3, §17.11.3 | tasks/T-050.json | NPD-e | T5-seed | covered |
| §11.5, §11.6, §11.7 | tasks/T-051.json | NPD-e | T2-api | covered |
| §11.1, §11.5, §11.7 | tasks/T-052.json | NPD-e | T3-ui | covered |
| §11.1, §11.5, §11.6 | tasks/T-053.json | NPD-e | T4-wiring-test | covered |
| §17.3, §17.4, §17.5 | tasks/T-054.json | NPD-f | T1-schema | covered |
| §17.10 | tasks/T-055.json | NPD-f | T1-schema | covered |
| §17.10, §17.6 | tasks/T-056.json | NPD-f | T5-seed | covered |
| §17.3, §17.6, §17.8, §17.9 | tasks/T-057.json | NPD-f | T2-api | covered |
| §17.6, §17.7, §17.12 | tasks/T-058.json | NPD-f | T2-api | covered |
| §17.8, §17.12 | tasks/T-059.json | NPD-f | T3-ui | covered |
| §17.8, §17.12 | tasks/T-060.json | NPD-f | T3-ui | covered |
| §17.6, §17.7 | tasks/T-061.json | NPD-f | T3-ui | covered |
| §17.6, §17.7, §17.12 | tasks/T-062.json | NPD-f | T4-wiring-test | covered |
| §17.11.1 | tasks/T-063.json | NPD-g | T1-schema | covered |
| §17.11.1, §6 | tasks/T-064.json | NPD-g | T2-api | covered |
| §17.11.1 | tasks/T-065.json | NPD-g | T2-api | covered |
| §17.11.1 | tasks/T-066.json | NPD-g | T3-ui | covered |
| §17.11.1, §8.5 | tasks/T-067.json | NPD-g | T3-ui | covered |
| §17.11.1, §6 | tasks/T-068.json | NPD-g | T4-wiring-test | covered |
| §17.11.2 | tasks/T-069.json | NPD-h | T1-schema | covered |
| §17.11.3 | tasks/T-070.json | NPD-h | T1-schema | covered |
| §17.11.4 | tasks/T-071.json | NPD-h | T1-schema | covered |
| §17.11.2 | tasks/T-072.json | NPD-h | T2-api | covered |
| §17.11.3 | tasks/T-073.json | NPD-h | T2-api | covered |
| §17.11.2 | tasks/T-074.json | NPD-h | T3-ui | covered |
| §17.11.3 | tasks/T-075.json | NPD-h | T3-ui | covered |
| §17.11.4 | tasks/T-076.json | NPD-h | T3-ui | covered |
| §17.11.5 | tasks/T-077.json | NPD-i | T1-schema | covered |
| §17.11.5, §18 | tasks/T-078.json | NPD-i | T2-api | covered |
| §17.11.5, §17.6 | tasks/T-079.json | NPD-i | T3-ui | covered |
| §18 | tasks/T-080.json | NPD-i | T1-schema | covered |
| §18 | tasks/T-081.json | NPD-i | T2-api | covered |
| §18 | tasks/T-082.json | NPD-i | T3-ui | covered |
| §19 | tasks/T-083.json | NPD-i | T1-schema | covered |
| §19 | tasks/T-084.json | NPD-i | T2-api | covered |
| §19 | tasks/T-085.json | NPD-i | T2-api | covered |
| §19 | tasks/T-086.json | NPD-i | T3-ui | covered |
| §18, §10.6.1 | tasks/T-087.json | NPD-i | T4-wiring-test | covered |
| §19 | tasks/T-088.json | NPD-i | T4-wiring-test | covered |
| §15 (GDPR right-to-erasure) | tasks/T-089.json | NPD misc | T1-schema | covered |
| §10.8, §11.7 (D365 cache scheduled sync) | tasks/T-090.json | NPD misc | T2-api | covered |
| §11.7 | tasks/T-091.json | NPD-e | T4-wiring-test | covered |

## Notes

- T-001..T-047 emitted in earlier batch and remain unchanged; this batch only adds T-048..T-091.
- §17.11.4 Sensory follows the BUILD path; D4 reduction (collapse to single FA cell) is a separate downstream decision and not in scope here.
- §17.11.6 LEGACY (Trial/Pilot/Handoff/Packaging) is deprecated per BL-NPD-02 and intentionally not decomposed into atomic tasks.
- The SECURITY DEFINER + cron pattern (T-085, T-090) requires a worker package (`apps/worker`) — assumed present from Foundation 00-f outbox/worker scope.
