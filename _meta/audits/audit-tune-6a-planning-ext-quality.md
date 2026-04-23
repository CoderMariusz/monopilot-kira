# Audit: tune-6a — Planning-EXT + Quality
**Auditor:** Audit-6a (READ-ONLY)  
**Date:** 2026-04-23  
**Sources:** 07-PLANNING-EXT-PRD.md v3.1, 09-QUALITY-PRD.md v3.0, 00-FOUNDATION-PRD.md v3.0, design/07-PLANNING-EXT-UX.md v1.1, design/09-QUALITY-UX.md v1.0, Monopilot Design System/planning-ext/*, Monopilot Design System/quality/*, TUNING-PLAN.md

---

## MODULE A — 07-PLANNING-EXT

### A. Coverage

PRD §4 P1 scope: Finite-capacity engine, allergen optimizer, changeover matrix editor, manual forecast entry, GanttView, run lifecycle, run history.

**Prototype coverage:**
- GanttView (SCR-07-01): Full — 5 lines, WO blocks, changeover blocks, maintenance blocks, allergen colors, KPI strip, shift boundaries. Read-only confirmed (no drag handlers).
- Changeover Matrix Editor (SCR-07-02): Full — N×N matrix, heatmap colors, per-line overrides (LINE-03, LINE-04), version history (v1–v5), matrix review requests (MRR-*).
- Run History (SCR-07-04): Full — scheduler_runs list, run detail (OPT-0042), override log, KPI snapshots, dry-run row (OPT-0033, `run_type='dry_run'`).
- Allergen Sequencing screen: Full — v1 baseline vs v2 proposed sequence, cross-line moves, savings %.
- Forecast screens: Full — manual upload (P1) + Prophet toggle (P2), 8-week grid, forecast health.
- What-If Simulation (SCR-07-05): Present as P2 preview — SCN-0089 active scenario, baseline vs delta badges. Marked P2.
- Disposition Bridge (07-d): Not rendered as screen (P2, correct).
- Modals: 12 modal catalog present; includes Run Scheduler (MODAL-07-01), Assignment Override (MODAL-07-03), Dry-Run Preview.

**Coverage gaps:**
- G1: `matrix_review_request` table (OQ-EXT-04) defined in PRD comments as "PRD to define table" — data model stub in data.jsx (PEXT_MATRIX_REVIEWS) but no DB schema in PRD. Minor — affects SCR-07-02 only.
- G2: Disposition Bridge Planner-decides modal (MODAL-07-04) with `[Extend 1h]`/`[Extend 4h]` buttons (OQ-EXT-07) appears in modal catalog listing but body is placeholder. Acceptable for P2.

**Coverage score: ~95% P1, ~70% P2 placeholder.**

---

### B. Hallucinations

| # | Location | Claim in prototype | PRD says | Classification | Severity |
|---|---|---|---|---|---|
| H1 | data.jsx `PEXT_LAST_RUN.status` | `"converged"` | PRD §9.2 scheduler_run_status ENUM: `queued\|running\|completed\|failed\|cancelled`. No `"converged"` value. | HALLUCINATION — invented status term | HIGH |
| H2 | data.jsx `PEXT_RUNS` | Status `"converged"` used 9×, `"partial"` used 1× | PRD ENUM = `completed`. `"partial"` not in ENUM (partial result described in prose as `completed` with `warning_flag`, not separate status). | HALLUCINATION — two spurious status values | HIGH |
| H3 | data.jsx `PEXT_RUN_DETAIL.outputSummary.coDelta` | `-20` (delta changeover minutes) | PRD §9.2 `output_summary JSONB` structure specified as `{wos_scheduled, wos_unscheduled, total_changeover_minutes, utilization_avg_pct, overdue_count}`. No `coDelta` field. | HALLUCINATION — extra field not in PRD schema | LOW |
| H4 | data.jsx `PEXT_SCENARIOS[].type` | `"conservative"`, `"aggressive"`, `"balanced"` | PRD §9.7 `scheduler_scenarios.scenario_params` is pure JSONB. No `type` ENUM defined. | INVENTION — plausible but undefined field | LOW |
| H5 | UX §1.11 badge table | `"completed"` maps to `badge-green`, `"failed"` to `badge-red` — and the UX doc lists a `"converged"` label nowhere | The UX doc itself does NOT introduce `"converged"` (only data.jsx does), so the UX doc is consistent with PRD ENUM. The contradiction is data.jsx vs PRD. | Root hallucination is in data layer, not UX. | — |

**Summary:** 2 HIGH hallucinations (status values `"converged"` and `"partial"` not in PRD ENUM). If implemented literally these would fail DB constraint validation on `scheduler_run_status`.

---

### C. Drift

| # | PRD decision | Prototype rendering | Delta |
|---|---|---|---|
| D1 | OQ-EXT-05: GanttView is READ-ONLY; rescheduling via Override modal + Re-run (decision 2026-04-21) | WO blocks have `cursor: pointer` only; no drag handlers; `[Reschedule WO]` in side panel; `[Re-run Scheduler]` button present | ALIGNED |
| D2 | OQ-EXT-09: dry-run persists as `scheduler_runs` row `run_type='dry_run'`, `status='preview'`, auto-expires 24h | OPT-0033 in run history: `status:"preview"`, `type:"dry_run"`, `expiresAt` present; `[Commit Preview]`/`[Discard]` in modal | ALIGNED |
| D3 | OQ-EXT-06: `[Approve All]` covers ALL completed runs, not just most recent | UX §3 Zone D: "Approve All approves assignments from all completed runs… sorted by run_id_short" | ALIGNED |
| D4 | OQ-EXT-10: Total Changeover KPI = approved schedule sum, not draft run | Zone B KPI 2 explicitly states "from the approved schedule (not draft solver run)" | ALIGNED |
| D5 | OQ-EXT-01: penalty weights 2.0/1.0/0.5 seed values | PEXT_RULES `allergen_sequencing_optimizer_v2` references penalty weights conceptually; exact values not surfaced in rule config screen (only description text) | MINOR DRIFT — weights not shown in Rule Config UI, only in PRD DSL |
| D6 | PRD §4.1 manual forecast entry: CSV format `(product_id, week_iso, qty_kg)` | Forecast screen shows correct column names in preview table | ALIGNED |
| D7 | PRD §5.1 idempotency (R14): `run_id` = UUID v7 client-generated | data.jsx `PEXT_LAST_RUN.uuid` = UUIDv7 format `018e5a42-...` | ALIGNED |
| D8 | PRD §9.4 changeover_matrix: line_id NULL = default, specific = per-line override | PEXT_LINE_OVERRIDES keyed by line ID; "Default matrix" tab + "Per-line overrides" tab in UX | ALIGNED |

**Drift finding:** D5 (penalty weights not shown in rule config UI) is a MINOR gap but does not contradict PRD. All major P1 decisions correctly rendered.

---

### D. Fitness

| Dimension | Assessment |
|---|---|
| Coverage | 95% P1 scope rendered. matrix_review_request table schema missing (low risk). |
| Hallucinations | 2 HIGH severity (status ENUM violations). |
| Drift | 1 minor gap (D5). All major architectural decisions aligned. |
| Optimizer/solver fidelity | Dry-run, run history, sequencing, GanttView read-only — all correctly rendered. |

**Coverage %: 95%**  
**Risk: HIGH on H1/H2 (ENUM violations would break DB inserts in impl)**  

**FITNESS: YELLOW**  
Rationale: Strong coverage and decision alignment, but H1/H2 are concrete bugs that would surface immediately in implementation. Must fix `"converged"` → `"completed"` and `"partial"` → `"completed"` (with `error_message` field) in data.jsx before handoff to story-writing.

---

## MODULE B — 09-QUALITY

### A. Coverage

PRD §7 P1 scope: 5 epics (09-a Hold/Release, 09-b Specs, 09-c Incoming Inspection, 09-d Basic NCR, 09-e HACCP + CCP Rule).

**Prototype coverage:**
- Dashboard (QA-001): Full — 6 KPI cards, critical alerts panel, tabs (Inspections/NCRs/HACCP). Matches PRD §8.2 layout exactly.
- Holds (QA-002/002a): Full — hold list, hold detail (QH-24), multi-LP hold, release workflow, e-signature badge.
- Specifications (QA-003/003a/003b): Full — spec list (active/draft/superseded), SPEC-0142 detail with 14-allergen profile snapshot, parameter table with critical flags.
- Test Templates (QA-004): Present — 7 templates.
- Incoming Inspections (QA-005/005a): Full — queue, INS-2026-0474 detail (in-progress, 8 parameters, partial results), sampling plan binding.
- Sampling Plans (QA-008): Present — 5 plans, AQL fields.
- NCR (QA-009/009a): Full — NCR list 11 records, NCR-2026-0091 detail (CCP deviation, auto-created by DSL rule).
- HACCP Plans (QA-013): Full — 4 plans, CCPs definitions with limits.
- CCP Monitoring (QA-014/015): Full — 7 CCPs with readings, 3 deviations, within_limits computed column.
- Allergen Changeover Gates (QA-016): Full — 6 gates with dual-sign states.
- Audit Trail (QA-021): Full — 13 audit events with old/new data, SIGN/RELEASE/APPROVE operations.
- Scanner QA (SCN-070..073, SCN-081): Referenced in nav; screen bodies not in data.jsx (in holds-screens.jsx separately, per file structure).

**Coverage gaps:**
- G1: `quality_status_types` table has 7 seeded statuses (PENDING/PASSED/FAILED/HOLD/RELEASED/QUARANTINED/COND_APPROVED) per PRD §6.3. Prototype badge palette covers only 6 distinct rendering paths — `FAILED` maps to `badge-fail` and `COND_APPROVED` to `badge-cond` but `QUARANTINED` is present as `badge-quarantined`. All 7 statuses addressable. ALIGNED.
- G2: `quality_complaints` (stub P1 per PRD) — not shown in prototype nav or data. Minor omission of stub screen. LOW RISK.
- G3: `quality_incidents` table defined in PRD §6.3 but not in data.jsx. Should appear in QA-052 Complaint + Incident form. LOW RISK (stub P1).

---

### B. Hallucinations

| # | Location | Claim in prototype | PRD says | Classification | Severity |
|---|---|---|---|---|---|
| H1 | UX §1.3 badge table | 11 badge variants listed (pass/fail/hold/released/pending/conditional/quarantined/critical/major/minor/signed) | PRD §6.3 `quality_status_types` seeds 7 statuses. PRD §7 mentions severity badges for NCR. No badge named `badge-pass` vs `badge-released` distinction specified in PRD | SEMI-HALLUCINATION — badge naming is UX design interpretation, not contradiction. PRD does not specify CSS class names. Acceptable design liberty. | LOW |
| H2 | data.jsx `QA_HOLDS[QH-22]` | `reasonCat: "Documentation"` for reason "Pending lab results" | PRD §6.3 hold reasons come from `quality_hold_reasons` reference table in 02-SETTINGS. The category mapping is illustrative, not PRD-defined. | DESIGN DATA — not a structural hallucination. | INFO |
| H3 | data.jsx `QA_ALLERGEN_GATES` | `status: "pending_second_sign"` for ACG-2026-0042 and ACG-2026-0041 | PRD §5.2 `allergen_changeover_validations` (defined in 08-PROD §9.8, consumed by 09-QA): `validation_result` column. Status value `"pending_second_sign"` is plausible but no ENUM defined in either PRD. | MINOR INVENTION — consistent with 08-PROD dual-sign pattern but not in spec | LOW |
| H4 | data.jsx `QA_HOLDS` | `reasonCat` field on every hold record | PRD `quality_holds` schema (§6.3) has `reason_code_id UUID REFERENCES reference_tables_rows(id)` (FK to reference table). `reasonCat` is a denormalized UI convenience. | PRESENTATION LAYER CHOICE — not a DB field hallucination, acceptable in mock data | INFO |

**Summary:** No HIGH hallucinations. H1 and H3 are low-risk design interpretations. The badge CSS class naming convention is a UX design decision not constrained by PRD.

---

### C. Drift — 15-badge → 5-tone consolidation

**Tuning requirement** (TUNING-PLAN.md §2.11): "Badge palette consolidation — 15 `.badge-*` variants — many duplicate (e.g. `.badge-pass` + `.badge-released` both green). Consolidate to 5 semantic tones; keep legacy class names as aliases."

**Audit of 15 PRD status terms addressability after consolidation:**

The 15 status terms appearing across PRD §6 and prototype:

| PRD status term | Current badge | Target semantic tone | Still addressable? |
|---|---|---|---|
| PASSED (LP) | `badge-pass` (#dcfce7 / #166534) | `tone-success` | YES — alias `badge-pass → tone-success` |
| RELEASED (LP) | `badge-released` (#d1fae5 / #065f46) | `tone-success` (variant shade) | YES — alias kept; same tone different shade acceptable |
| FAILED (LP/inspection) | `badge-fail` (#fee2e2 / #991b1b) | `tone-danger` | YES — alias `badge-fail → tone-danger` |
| HOLD (LP) | `badge-hold` (#fef3c7 / #92400e) | `tone-warning` | YES |
| PENDING (inspection) | `badge-pending` (#dbeafe / #1e40af) | `tone-info` | YES |
| COND_APPROVED (LP) | `badge-cond` (#f3e8ff / #6b21a8) | `tone-purple` (5th tone) | YES — purple is the 5th semantic tone |
| QUARANTINED (LP) | `badge-quarantined` (#fce7f3 / #9d174d) | Risk: collapsed into `tone-danger`? | RISK — distinct pink hue (#fce7f3) would become red. Distinct clinical meaning. Needs alias kept as-is OR separate sub-tone. |
| critical (NCR) | `badge-critical` (#fee2e2 / #991b1b) | `tone-danger` | YES — same colors as badge-fail |
| major (NCR) | `badge-major` (#fef3c7 / #92400e) | `tone-warning` | YES — same as badge-hold |
| minor (NCR) | `badge-minor` (#f0fdf4 / #166534) | `tone-success` (light) | YES |
| signed/immutable | `badge-signed` (#e0e7ff / #3730a3) | `tone-info` (blue variant) | YES — alias kept |
| draft (spec) | rendered as `badge-pending` | `tone-info` | YES |
| under_review (spec) | rendered as `badge-pending` or `badge-hold` | `tone-warning` | YES |
| superseded (spec) | rendered at 60% opacity, no distinct badge | neutral/gray | YES |
| active (spec) | rendered as `badge-pass` green | `tone-success` | YES |

**DRIFT FINDING — D1 (RISK):** `badge-quarantined` (#fce7f3 pink-magenta) does NOT map cleanly to any of the 5 standard semantic tones (success/warning/danger/info/purple). Collapsing it to `tone-danger` (red) would visually conflate QUARANTINED with FAILED — clinically and regulatorily distinct (quarantine ≠ fail; quarantined items may still be dispositioned to rework). TUNING-PLAN §6 already notes "Quality 15→5 with aliases" risk flag. **Recommendation: retain `badge-quarantined` as a permanent alias pointing to a distinct 5th-tone sub-class, not collapsed into danger.**

**Other drift items:**
| # | Item | Delta |
|---|---|---|
| D2 | PRD §4.3 retention formulas (GENERATED ALWAYS AS columns) | Prototype data shows `retention_until` on holds, NCRs, inspections — all correctly set. ALIGNED. |
| D3 | PRD §5.2 e-signature: `signature_hash = SHA-256(user_id || record_id || table || signed_at_iso || record_content_hash || PIN_proof)` | Prototype audit trail shows `signature_hash: "a3f9c2d1e4b7..."` — truncated placeholder. Acceptable for prototype. |
| D4 | PRD §8.2 QA-012 Hold priority default from `reason.default_hold_duration_days` | data.jsx `QA_HOLD_REASONS` has `defaultDuration` per reason code. Hold detail `estRelease` computed. ALIGNED. |
| D5 | PRD §6 `ncr_reports.response_due_at` = GENERATED column from severity | data.jsx NCR records have `responseDue` correctly computed (critical=24h, major=48h, minor=7d). ALIGNED. |

---

### D. Fitness

| Dimension | Assessment |
|---|---|
| Coverage | 93% P1 scope. Missing: quality_complaints stub screen, quality_incidents form. |
| Hallucinations | 0 HIGH. 1 LOW (ACG status enum). Remainder are INFO/presentation choices. |
| Drift | 1 significant risk (quarantined badge consolidation). All other drift items aligned. |
| Badge consolidation | 14 of 15 PRD status terms cleanly addressable post-5-tone consolidation. 1 requires alias retention (QUARANTINED). |

**Coverage %: 93%**  
**Risk: MEDIUM on badge consolidation (quarantined alias must be preserved)**  

**FITNESS: GREEN (with advisory)**  
Rationale: No structural hallucinations, strong PRD coverage, all regulatory patterns (e-sig, retention, dual-sign, CCP deviation escalation) correctly modeled in data and screens. Single advisory: `badge-quarantined` alias retention is non-negotiable for clinical and regulatory correctness; must be called out in tuning task spec.

---

## Cross-Module Observations

1. **Scheduler ↔ Quality integration (§15.2 / §3.3):** PRD 07-EXT §15.2 notes `09-QUALITY` consumes allergen changeover gate handoff (P2). Data cross-references are consistent — `QA_ALLERGEN_GATES` in quality data references `WO-2026-0041/0042` which appear in planning-ext `PEXT_ASSIGNMENTS`. Cross-module FK consistency: PASS.

2. **Design token inheritance:** Both modules correctly inherit from `colors_and_type.css` base tokens. Both UX docs reference `--blue: #1976D2`, `--green: #22c55e`, etc. verbatim. Planning-ext adds `--co-*` changeover heatmap tokens; Quality adds `badge-*` QA palette. Neither redefines base tokens. PASS.

3. **FOUNDATION compliance:** Both modules carry `[UNIVERSAL]`, `[FORZA-CONFIG]`, `[EVOLVING]`, `[LEGACY-D365]` markers per 00-FOUNDATION §2 P6. Both reference ADR-003/013 (RLS), ADR-028 (L3 ext_jsonb on key tables), ADR-029 (DSL rules). PASS.

---

## Summary Table

| Module | Coverage % | Hallucinations | Drift | Fitness |
|---|---|---|---|---|
| 07-PLANNING-EXT | 95% | 2 HIGH (status ENUM: "converged"/"partial" not in PRD) | 1 minor (penalty weights not in Rule Config UI) | YELLOW |
| 09-QUALITY | 93% | 0 HIGH, 1 LOW (ACG status enum) | 1 risk (badge-quarantined collapse) | GREEN |

---

## Top-3 Findings Per Module

### 07-PLANNING-EXT — Top 3
1. **[HIGH] Status ENUM hallucination:** `PEXT_LAST_RUN.status = "converged"` and 9× uses in `PEXT_RUNS`. PRD `scheduler_run_status` ENUM is `queued|running|completed|failed|cancelled`. Fix: replace `"converged"` → `"completed"` throughout data.jsx before story generation. Also replace `"partial"` → `"completed"` (add `error_message` for partial-result signal).
2. **[HIGH] Partial result status phantom:** OPT-0040 `status: "partial"` with `error: "Solver timeout at 120s; 19 of 22 WOs assigned"` — PRD §10.1 says timeout returns partial results with `warning flag` inside a `completed` run, not a separate status. Implementation would fail constraint check.
3. **[LOW] matrix_review_request table unspecced:** Data model referenced in OQ-EXT-04 resolution ("Creates `matrix_review_request` record — PRD to define table") but table schema never added to PRD §9. SCR-07-02 matrix review panel is fully mocked (PEXT_MATRIX_REVIEWS) but there is no backing schema. Add table spec to PRD before 07-b stories.

### 09-QUALITY — Top 3
1. **[RISK] badge-quarantined alias required:** TUNING-PLAN §2.11 mandates 15→5 badge consolidation. `badge-quarantined` (#fce7f3 / #9d174d) is clinically distinct from `tone-danger` (red). Collapsing it loses the QUARANTINED visual signal. Must be listed in tuning task as "keep alias, do not collapse to danger."
2. **[LOW] ACG status enum undefined:** `allergen_changeover_validations.validation_result` uses `"pending_second_sign"` in data.jsx, but this column's ENUM is never defined (defined in 08-PROD §9.8 which was not in scope of this audit). Coordinate with 08-PROD audit to confirm ENUM values.
3. **[INFO] quality_complaints + quality_incidents stubs absent from prototype:** PRD §7 EPIC 8E specifies both tables as P1 stubs. Neither appears in data.jsx or via QA-052 screen data. Low risk (stub only) but story 09-e-04 ("Complaints + incidents CRUD P1 stub") needs data support.

---

*Audit complete. Output: `C:/Users/MaKrawczyk/PLD/_audits/audit-tune-6a-planning-ext-quality.md`*
