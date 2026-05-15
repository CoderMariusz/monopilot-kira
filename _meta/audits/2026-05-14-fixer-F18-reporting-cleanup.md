# F18 Fixer Report — 12-reporting cleanup

**Date**: 2026-05-14  
**Validator**: `_meta/atomic-tasks/12-reporting/_validate.py`  
**Pre-fix FAIL count**: 46  
**Post-fix FAIL count**: 0  
**Tasks touched**: 27/27

---

## Category breakdown

### Cat 2 — Missing parity AC format (10 T3-ui tasks)
**Tasks**: T-017, T-018, T-019, T-020, T-021, T-022, T-023, T-024, T-025, T-026

Each received a literal prototype anchor AC in the format:
```
prototypes/design/Monopilot Design System/reporting/<file>.jsx:<start>-<end>
```
sourced from `_meta/prototype-labels/prototype-index-reporting.json`.

Multi-prototype tasks (T-017: 2 anchors; T-020: 3; T-023: 2; T-024: 5; T-026: 3) include all anchors in one consolidated parity AC.

A `## Prototype parity` section was added to the prompt for each task where it was absent, citing the same anchors and referencing `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.

T-015 and T-016 already had the parity anchor in AC[0] — no change needed for Cat 2.

### Cat 3 — Missing no-raw-PII red-line (7 tasks)
**Tasks**: T-001, T-004, T-013, T-023, T-025, T-026, T-027

Each received the following red-line appended to `risk_red_lines`:
> "No raw PII in reports/exports — PII columns (email, phone, address, surname, dob, national_id) must be redacted, hashed, or omitted at the read-model boundary. Consult Foundation T-117 pino redact allowlist for the canonical PII column set."

Where AC budget allowed (≤3 existing ACs), a corresponding PII AC was also added to `acceptance_criteria`.

### Cat 1 — AC > 4 (26 tasks)
**Tasks**: T-002 through T-027 (all except T-001 which was already at 4)

Fusion strategy applied:
- **T3-ui tasks (T-015–T-026)**: Slot 0 = prototype parity anchor; Slots 1–2 = top 2 functional ACs; Slot 3 = fused access-control + 4-states + i18n procedural hoist.
- **T1-schema/T2-api/T4-wiring-test tasks (T-002–T-014, T-027)**: Grouped into schema-correctness, multi-tenant isolation, edge/error, and infra/compliance quadrants; related criteria fused preserving their concrete assertions.

No semantic information was lost — all original test conditions are represented within the fused ACs.

### Cat 4 — Shape drift (3 issues)
- **T-002 scope_files**: `packages/reporting/src/index.ts` was missing `[create]/[modify]` tag → fixed to `[modify]`.
- **T-004 scope_files**: `packages/db/src/schema/index.ts` was missing tag → fixed to `[modify]`.
- **T-027 worker dispatch**: Long-running bulk-export wiring task lacked `apps/worker` / T-111 citation → added to `risk_red_lines`.

---

## Consumer-only violation audit
All MV/read-model tasks were scanned for `INSERT INTO` or `UPDATE` targeting non-reporting module tables. No violations found. The 12-reporting module remains consumer-only throughout.

---

## Deferred items
None. All 46 failures resolved inline. No architectural consumer-only violations surfaced that would require deferral.

---

## Evidence
- Pre-fix: 46 FAILURES (captured in `/tmp/f18_failures.txt`)
- Post-fix: `[validate:12-reporting] PASS — 0 failures`
- All 27 tasks JSON-valid (validator parses each file before checks)
