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
| **NPD-f** | Stage-Gate Pipeline (G0-G4 canonical MVP, projects, gates, approvals, e-sig, kanban/table/split; Trial/Pilot/Handoff/Packaging stay in NPD flow) | T-054..T-062 |
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

- T-001..T-047 emitted in earlier batch and remain unchanged except targeted 2026-05-03 PO-decision safety patches in T-044/T-047.
- T-092/T-093/T-094 were re-authored after the final 2026-05-03 decisions and are no longer blocked on FA/FG naming or BOM SSOT clarification:
  - T-092: actionable shared BOM SSOT schema/lifecycle for NPD-originated initial BOM versions and Technical approval/versioning.
  - T-093: actionable after T-092; NPD Builder writes initial shared BOM version, switches readers/backfill, and enforces post-release new version + Technical approval.
  - T-094: actionable safe FG terminology/i18n compatibility pass; physical DB/route/event mass rename remains out of scope.
- Canonical term is `FG` / Finished Good. `FA` may remain only as a compatibility alias in legacy fields/routes/prototype identifiers/external codes; do not introduce FA as final user-facing language.
- Stage-Gate `G0-G4` is canonical MVP. Brief creates NPD project (`DEV-123`); project creates/maps FG at G3; NPD Builder creates WIP/intermediates + FG + initial shared BOM/product-spec version after department closure + approval.
- §17.11.4 Sensory is Technical-owned per `_meta/decisions/2026-05-03-flow-d365-settings-technical-decisions.md`; NPD sensory tasks T-071/T-076 are deferred/cross-module and must not be implemented as standalone NPD BUILD tasks unless re-owned by Technical.
- §17.11.6 LEGACY (Trial/Pilot/Handoff/Packaging) is not deprecated. These stages return as part of NPD and must be represented in Stage-Gate flow coverage.
- One shared BOM table/model is SSOT across NPD Builder, Technical, Planning, Production and integrations. D365 is export/import integration only, not canonical source of truth.
- Any post-release NPD edit to product/BOM/factory-spec data must create a new BOM/product-spec version and route to Technical approval before factory use; tasks must not model it as in-place mutation or simple built-flag reset.
- The SECURITY DEFINER + cron pattern (T-085, T-090) requires a worker package (`apps/worker`) — assumed present from Foundation 00-f outbox/worker scope.

## Coverage rows (E2E spine blocker closeout 2026-05-03)

| PRD/review ref | Task file | Sub-module | Type | Status |
|---|---|---|---|---|
| Brief→Project spine / BL-E2E-01 | tasks/T-030.json, tasks/T-031.json, tasks/T-033.json, tasks/T-034.json, tasks/T-035.json | NPD-b/NPD-f | T1/T2/T3 | patched |
| Gate matrix / BL-E2E-03 | tasks/T-056.json | NPD-f | T5-seed | patched |
| G3/G4 blockers / BL-E2E-02/03 | tasks/T-058.json | NPD-f | T2-api | patched |
| Stage-Gate E2E extended to G4/release | tasks/T-062.json | NPD-f | T4-wiring-test | patched |
| Shared BOM handoff to release orchestrator | tasks/T-093.json | NPD Builder/BOM SSOT | T2-api | patched |
| G3 FG create/map | tasks/T-095.json | NPD-f | T2-api+T3-ui+T4 | added |
| NPD Builder release orchestrator | tasks/T-096.json | NPD Builder | T2-api+T4 | added |
| Factory release status/read model | tasks/T-097.json | NPD/shared read model | T1-schema+T2-api | added |
| Full Brief→factory release E2E | tasks/T-098.json | NPD E2E | T4-wiring-test | added |

### 2026-05-03 E2E spine decisions now encoded in tasks

- Brief creates/links canonical `npd_project` first; FG is not created during Brief create/complete.
- G3 owns create/map of one canonical FG / Finished Good candidate (`FA` only as legacy alias).
- G4/NPD Builder release is a Monopilot-owned transaction creating/confirming WIP/intermediates + FG + initial shared BOM SSOT + initial factory_spec handoff.
- Shared `bom_headers`/`bom_lines` remain SSOT; no NPD-only BOM authority.
- D365 is optional export/import only and never sets release/factory availability state.
- Technical approval is required before factory_spec/BOM can be consumed by factory/Planning.
- Release status/read model separates `pending_npd_release`, `pending_technical_approval`, `approved_for_factory`, `released_to_factory`, and `blocked`; `Built` is not canonical release state.

- Wave0 readiness patch: added T-099/T-100 and hardened Brief→Project, G3 FG, BOM SSOT, sensory N/A, final gate matrix and real Technical approval requirements.
