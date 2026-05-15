# PRD Coverage — 03-TECHNICAL final decision rebuild

Source PRD: `docs/prd/03-TECHNICAL-PRD.md` v3.3 + 2026-05-03 PO decisions.

## Final decision coverage

| Decision / PRD ref | Requirement | Task file | Status |
|---|---|---|---|
| §0, §15A.1 | FG is canonical; FA is legacy/compat only | tasks/T-032.json..T-063.json, tasks/T-078.json | covered |
| §0, §15A.1 | NPD Builder creates WIP/FG and initial shared BOM version | tasks/T-016.json, tasks/T-073.json | covered |
| §0, §15A.1 | Shared BOM model/table is SSOT across NPD/Technical/Planning/Production | tasks/T-073.json | covered |
| §0, §15A.1 | Released BOM/product/factory_spec edits clone a new version and require Technical approval | tasks/T-073.json, tasks/T-079.json | covered |
| §0, §15A.3 | supplier_specs Phase 1 upload/view/review | tasks/T-072.json, tasks/T-075.json | covered |
| §0, §15A.3 | PO actuals do not mutate supplier_spec/cost_per_kg; deviations trigger review/non-conformance | tasks/T-076.json | covered |
| §0, §15A.3 | TO actuals do not mutate specs; location/lot/shelf-life issues trigger review/non-conformance | tasks/T-077.json | covered |
| §0, §15A.3 | RM usability validation checks approved supplier, active supplier_spec, allergen compatibility, item active, cost/spec review, QC/release | tasks/T-074.json | covered |
| §0, §15A.4 | lab_results are Quality-owned read model for Technical | tasks/T-020.json, tasks/T-078.json | covered |
| §0, §15A.5 | factory_spec/internal_product_spec is Technical-owned factory spec | tasks/T-079.json | tasked |
| §0, §15A.1/§15A.5 | FactorySpec+BOM bundle approval API/UI and Technical approval workflow | tasks/T-080.json | tasked |
| §0, §15A.1 | Shared release status/read model for pending/released/blocked factory availability | tasks/T-081.json | tasked |
| §0, §15A.3 | Canonical non-conformance event contract for PO/TO actual triggers | tasks/T-082.json | tasked |
| §0, UX final red-lines | Local UI copy/prototype red-lines for FG/factory_spec/shared BOM/RM usability/D365 | tasks/T-083.json | tasked |
| §15A.2 | D365 is optional import/export integration only, never source of truth | tasks/T-028.json, tasks/T-055.json..T-059.json, tasks/T-068.json, tasks/T-083.json | tasked |
| §17 / Wave0 | Technical no-prototype MVP screens receive spec-driven UI tasks with screenshot + trace evidence | tasks/T-085.json..T-089.json | tasked |
| §15A / Wave0 | Technical-owned sensory contract/read model is added so NPD does not own sensory schema/UI | tasks/T-090.json | tasked |
| §5 / Wave0 | factory_specs, supplier_specs, NCR/outbox, Quality-owned lab read model are represented in PRD/task contracts | tasks/T-020.json, tasks/T-060.json, tasks/T-072.json, tasks/T-075.json, tasks/T-082.json | tasked |
| §0 / Wave0 | Technical release status uses canonical NPD T-097 model; Technical task is adapter only | tasks/T-081.json | tasked |

## Notes

- This coverage file was added during the 2026-05-03 final-decision rebuild so the 03-TECHNICAL module has an explicit manifest/coverage pair like other decompositions.
- Status `tasked` means the requirement now has an ACP task contract; it does not claim the application is implemented.
- T-072 remains the earlier supplier_specs docs brief. T-073..T-079 are final-decision implementation/depth tasks added after PO confirmed FG, factory_spec, shared BOM SSOT, PO/TO trigger semantics, and Technical approval rules.
- T-080..T-083 were added after review to cover approval/release/NCR/UI blockers that remained after the first final-decision patch.
- T-084..T-090 were added/updated in Wave0 readiness hardening to close the remaining 95%+ blockers: no-prototype MVP screens, supplier specs Phase 1 UI readiness, Technical sensory ownership, release adapter semantics, screenshots/traces, and UI red-line evidence.
- No unresolved GAP rows remain for the final decisions listed above; downstream 04 Planning / 08 Production consumer contracts should still be patched before claiming full product-to-factory E2E readiness across the whole program.

## Coverage rows (gold-standard re-author 2026-05-14)

All 90 tasks were re-authored on 2026-05-14 to align prompt structure, PRD anchors, prototype anchors, and module red-lines with the 01-NPD / 02-SETTINGS gold-standard exemplars. Status `re-authored` for every row.

| Task | Parent feature | Task type | PRD refs | prototype_match | Status |
|---|---|---|---|---|---|
| T-001 | 03-TECHNICAL-a Item Master | T1-schema | §5.1, §6.1, §6.4 | false | re-authored |
| T-002 | 03-TECHNICAL-a BOM | T1-schema | §5.2, §7.1, §7.2 | false | re-authored |
| T-003 | 03-TECHNICAL-c Cost | T1-schema | §5.3, §11.1, §11.2 | false | re-authored |
| T-004 | 03-TECHNICAL-b Allergens | T1-schema | §5.4, §10.1, §10.4, §10.5 | false | re-authored |
| T-005 | 03-TECHNICAL-b Lab | T1-schema | §5.5, §10.6 | false | re-authored |
| T-006 | 03-TECHNICAL-c Routing | T1-schema | §5.6, §12.1, §12.2 | false | re-authored |
| T-007 | 03-TECHNICAL-d D365 | T1-schema | §5.7, §13.1, §13.5, §13.7 | false | re-authored |
| T-008 | 03-TECHNICAL-a Item Master | T2-api | §6.2, §6.5 | false | re-authored |
| T-009 | 03-TECHNICAL-a Item Master | T2-api | §6.2, §6.6, §3 | false | re-authored |
| T-010 | 03-TECHNICAL-a Item Master | T2-api | §6.2, §6.4, §6.6 | false | re-authored |
| T-011 | 03-TECHNICAL-a Item Master | T2-api | §6.2, §6.4, §6.6 | false | re-authored |
| T-012 | 03-TECHNICAL-a BOM | T2-api | §7.1, §7.5 | false | re-authored |
| T-013 | 03-TECHNICAL-a BOM | T2-api | §7.1, §7.4, §7.6 | false | re-authored |
| T-014 | 03-TECHNICAL-a BOM | T2-api | §7.4, §7.6 | false | re-authored |
| T-015 | 03-TECHNICAL-a BOM | T2-api | §7.5 | false | re-authored |
| T-016 | 03-TECHNICAL-d BOM Generator | T2-api | §7.3, §7.6 | false | re-authored |
| T-017 | 03-TECHNICAL-b Allergens | T2-api | §10.1, §10.3, §10.8 | false | re-authored |
| T-018 | 03-TECHNICAL-b Allergens | T2-api | §10.4, §6.5, §10.7 | false | re-authored |
| T-019 | 03-TECHNICAL-b Allergens | T2-api | §10.5, §10.8 | false | re-authored |
| T-020 | 03-TECHNICAL-b Lab | T2-api | §5.5, §10.6, §10.8 | false | re-authored |
| T-021 | 03-TECHNICAL-c Cost | T2-api | §11.1, §11.2, §11.6 | false | re-authored |
| T-022 | 03-TECHNICAL-c Routing | T2-api | §12.1, §12.2, §12.4, §12.5 | false | re-authored |
| T-023 | 03-TECHNICAL-c Routing | T2-api | §12.4 | false | re-authored |
| T-024 | 03-TECHNICAL-b Allergens | T4-wiring-test | §10.2, §10.3, §10.8 | false | re-authored |
| T-025 | 03-TECHNICAL-a BOM | T4-wiring-test | §7.1, §7.5 | false | re-authored |
| T-026 | 03-TECHNICAL-b Lab | T4-wiring-test | §10.6, §10.8 | false | re-authored |
| T-027 | 03-TECHNICAL-a Item Master | T4-wiring-test | §6.3, §14.3 | false | re-authored |
| T-028 | 03-TECHNICAL-d D365 | T4-wiring-test | §13.1, §13.3, §13.5, §13.10 | false | re-authored |
| T-029 | 03-TECHNICAL-d D365 | T4-wiring-test | §13.4, §13.5, §13.7, §13.10 | false | re-authored |
| T-030 | 03-TECHNICAL-d D365 | T2-api | §13.6, §13.10 | false | re-authored |
| T-031 | 03-TECHNICAL-c Catch Weight | T4-wiring-test | §8.1, §8.5, §8.6 | false | re-authored |
| T-032 | 03-TECHNICAL-a Item Master | T3-ui | §6.5, §4A TEC-010 | true | re-authored |
| T-033 | 03-TECHNICAL-a Item Master | T3-ui | §6.5, §6.6 | true | re-authored |
| T-034 | 03-TECHNICAL-a Item Master | T3-ui | §6.5, §4A TEC-012 | true | re-authored |
| T-035 | 03-TECHNICAL-a Item Master | T3-ui | §6A TEC-081 | true | re-authored |
| T-036 | 03-TECHNICAL Dashboard | T3-ui | §6A TEC-080 | true | re-authored |
| T-037 | 03-TECHNICAL-a BOM | T3-ui | §7.5 | true | re-authored |
| T-038 | 03-TECHNICAL-a BOM | T3-ui | §7.5, §7A TEC-083, §7A TEC-084 | true | re-authored |
| T-039 | 03-TECHNICAL-a BOM | T3-ui | §7.5 | true | re-authored |
| T-040 | 03-TECHNICAL-a BOM | T3-ui | §7.5 TEC-023 | true | re-authored |
| T-041 | 03-TECHNICAL-d BOM Generator | T3-ui | §7.3, §7.5 TEC-024 | true | re-authored |
| T-042 | 03-TECHNICAL-a BOM | T3-ui | §7A TEC-082 | true | re-authored |
| T-043 | 03-TECHNICAL-a BOM | T3-ui | §7A TEC-083 | true | re-authored |
| T-044 | 03-TECHNICAL-a BOM | T3-ui | §7A TEC-084 | true | re-authored |
| T-045 | 03-TECHNICAL-a BOM | T3-ui | §7A TEC-089 | true | re-authored |
| T-046 | 03-TECHNICAL-b Shelf Life | T3-ui | §9.1, §9.2, §9.5 | true | re-authored |
| T-047 | 03-TECHNICAL-b Allergens | T3-ui | §10.7 TEC-040, §10.7 TEC-041 | true | re-authored |
| T-048 | 03-TECHNICAL-b Allergens | T3-ui | §10.4, §10.5, §10.7 TEC-042, §10.7 TEC-043 | true | re-authored |
| T-049 | 03-TECHNICAL-b Allergens | T3-ui | §10.3, §10.7 TEC-044 | true | re-authored |
| T-050 | 03-TECHNICAL-c Cost | T3-ui | §11.5 TEC-050, §11.5 TEC-051, §11A | true | re-authored |
| T-051 | 03-TECHNICAL-c Routing | T3-ui | §12.4 TEC-060, §12.4 TEC-061 | true | re-authored |
| T-052 | 03-TECHNICAL-c Routing | T3-ui | §12.4 TEC-062, §12.4 TEC-063 | true | re-authored |
| T-053 | 03-TECHNICAL-c Routing | T3-ui | §12A TEC-087 | true | re-authored |
| T-054 | 03-TECHNICAL Cross-link | T3-ui | §12A TEC-088 | true | re-authored |
| T-055 | 03-TECHNICAL-d D365 | T3-ui | §13.8 TEC-070, §13.8 TEC-071 | true | re-authored |
| T-056 | 03-TECHNICAL-d D365 | T3-ui | §13.8 TEC-072 | true | re-authored |
| T-057 | 03-TECHNICAL-d D365 | T3-ui | §13A TEC-090 | true | re-authored |
| T-058 | 03-TECHNICAL-d D365 | T3-ui | §13.7, §13.8 TEC-073 | true | re-authored |
| T-059 | 03-TECHNICAL-d D365 | T3-ui | §13A TEC-091 | true | re-authored |
| T-060 | 03-TECHNICAL-b Specs | T3-ui | §0, §5.1A, §7.4, §10A TEC-085, §10A TEC-086 | true | re-authored |
| T-061 | 03-TECHNICAL Cross-tag | T3-ui | §10A TEC-093 | true | re-authored |
| T-062 | 03-TECHNICAL Cross-tag | T3-ui | §11A TEC-094, §11.4 | true | re-authored |
| T-063 | 03-TECHNICAL Cross-tag | T3-ui | §9.4, §10A TEC-095 | true | re-authored |
| T-064 | 03-TECHNICAL-a Item Master | docs | §6.5 TEC-014, §4A TEC-014 | false | re-authored |
| T-065 | 03-TECHNICAL-a BOM | docs | §7.5 TEC-025, §4A TEC-025 | false | re-authored |
| T-066 | 03-TECHNICAL-b Regulatory | docs | §9.3, §9.5 TEC-031, §4A TEC-031 | false | re-authored |
| T-067 | 03-TECHNICAL-b Lab | docs | §10.6, §10.7 TEC-045, §4A TEC-045 | false | re-authored |
| T-068 | 03-TECHNICAL-d D365 | docs | §11.5 TEC-052, §4A TEC-052 | false | re-authored |
| T-069 | 03-TECHNICAL-a BOM | docs | §4.4, §7A TEC-092 | false | re-authored |
| T-070 | 03-TECHNICAL-a baseline | T5-seed | §6.1, §10.6, §8.5 | false | re-authored |
| T-071 | 03-TECHNICAL References | docs | §16 | false | re-authored |
| T-072 | 03-TECHNICAL-b Supplier Specs | docs | §5.5, §15A.3, §15A.5 | false | re-authored |
| T-073 | 03-TECHNICAL-a BOM | T2-api | §0, §5.1A, §7.1, §7.4, §7.6 | false | re-authored |
| T-074 | 03-TECHNICAL-a BOM | T2-api | §0, §5.1A, §7.1, §7.6 | false | re-authored |
| T-075 | 03-TECHNICAL-b Supplier Specs | T1-schema | §0, §5.1A, §5.5 | false | re-authored |
| T-076 | 03-TECHNICAL Cross-module Receiving | T4-wiring-test | §0, §5.1A, §11.2 | false | re-authored |
| T-077 | 03-TECHNICAL Cross-module Inventory | T4-wiring-test | §0, §5.1A, §9.4 | false | re-authored |
| T-078 | 03-TECHNICAL UI Governance | T3-ui | §0, §5.1A, §7.4, prototypes/design/03-TECHNICAL-UX.md §0A | false (UX-policy task, no single prototype anchor) | re-authored |
| T-079 | 03-TECHNICAL-a Factory Spec | T1-schema | §0, §5.1A, §7.4 | false | re-authored |
| T-080 | 03-TECHNICAL Approval/Release | T2-api | §0, §5.1A, §7.4, §7.6, prototypes/design/03-TECHNICAL-UX.md §0A | false | re-authored |
| T-081 | 03-TECHNICAL Approval/Release | T2-api | §0, §5.1A, §7.4, prototypes/design/03-TECHNICAL-UX.md §0A | false | re-authored |
| T-082 | 03-TECHNICAL Cross-module NCR | T2-api | §0, §5.1A, §9.4, §11.2 | false | re-authored |
| T-083 | 03-TECHNICAL UI Governance | T3-ui | §0, §5.1A, §7.4, prototypes/design/03-TECHNICAL-UX.md §0A | false (UX-policy task, no single prototype anchor) | re-authored |
| T-084 | 03-TECHNICAL Readiness Patch | T2-api | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | false | re-authored |
| T-085 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | spec-driven (layout-primitive only; not 1:1 parity) | re-authored |
| T-086 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | spec-driven | re-authored |
| T-087 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | spec-driven | re-authored |
| T-088 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | spec-driven | re-authored |
| T-089 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | spec-driven | re-authored |
| T-090 | 03-TECHNICAL Readiness Patch | T3-ui | §0, §5, §17, prototypes/design/03-TECHNICAL-UX.md | true | re-authored |

Notes on the 2026-05-14 re-author:

- 33 UI tasks (T-032..T-063, T-090) have `prototype_match: true` with a real `prototypes/design/Monopilot Design System/technical/<file>.jsx:<lines>` anchor pulled from `_meta/prototype-labels/prototype-index-technical.json`.
- 5 spec-driven Wave0 tasks (T-085..T-089) keep `prototype_match: false` and cite `prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx` as a layout-primitive reference only; PRD/UX is canonical.
- 12 tasks (T-060, T-073..T-083) had `§5.0` corrected to `§5.1A` (factory_specs section). No §5.0 heading exists in the PRD.
- Module red-lines (FG canonical, D365 soft-FK only, clone-on-write on release edits, shared BOM SSOT) and UI red-lines (no raw <select>, no inline styles, no @radix-ui outside packages/ui, no verbatim JSX paste) are now applied uniformly.
## Permission-enum addition 2026-05-14

| PRD/review ref | Task file | Sub-module | Type | Status | Notes |
|---|---|---|---|---|---|
| §3 (RBAC enum delta — closes _meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md GAP) | tasks/T-091.json | 03-TECHNICAL RBAC enum addition | T1-schema | added | 10 `technical.*` strings appended to packages/rbac/src/permissions.enum.ts + ALL_<MODULE>_PERMISSIONS export |
