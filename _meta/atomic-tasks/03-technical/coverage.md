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
