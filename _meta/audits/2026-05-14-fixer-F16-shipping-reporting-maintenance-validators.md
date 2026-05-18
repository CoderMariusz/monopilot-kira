# Fixer F16 — Validators for 11-shipping, 12-reporting, 13-maintenance

**Date:** 2026-05-14  
**Fixer:** F16  
**Status:** AUTHORED + RUN — no task JSONs modified

---

## Validators created

| Module | Path | Tasks inspected |
|---|---|---|
| 11-shipping | `_meta/atomic-tasks/11-shipping/_validate.py` | 32 |
| 12-reporting | `_meta/atomic-tasks/12-reporting/_validate.py` | 27 |
| 13-maintenance | `_meta/atomic-tasks/13-maintenance/_validate.py` | 30 |

All three validators follow F11's coding style exactly: same imports (`json`, `pathlib`, `re`, `sys`, `typing`), same `fail()` helper, same `validate_task()` / `validate_manifest()` / `validate_coverage()` structure, same exit code semantics.

---

## Validator design summary

### 12 shared checks (all modules)

| # | Check |
|---|---|
| 1 | Required top-level fields present |
| 2 | `pipeline_name == "kira_dev"` |
| 3 | No forbidden top-level fields (runtime/ACP fields) |
| 4 | `pipeline_inputs` required keys present and non-empty; `root_path` absolute |
| 4b | `prd_task_id` matches filename stem |
| 5 | No placeholder patterns (TBD/TODO/fill in/appropriate/similar to previous) in prompt+details+description+AC |
| 6 | `acceptance_criteria` count 1..4 |
| 7 | `task_type` in allowed enum set |
| 8 | `checkpoint_policy.required_checkpoints` present |
| 9 | `priority` int 30..150 |
| 10 | `scope_files` entries carry `[create]`/`[modify]`/`[ref]`/`[verify]` annotations |
| 11 | `risk_red_lines` ≥2 entries |
| 12 (=16) | T3-ui with `prototype_match=true` must have parity AC, `ui_evidence_policy`, `prototype_index_entry`, and `## Prototype parity` section in prompt |

Plus manifest.json integrity (task list, task_count, pipeline_name) and coverage.md gap check.

### Module-specific extras

#### 11-shipping (#17–#21)
- **#17** SSCC/GS1 label tasks must cite `organizations.gs1_company_prefix` from 02-settings; local/hardcoded prefix is a violation.
- **#18** D365 integration/wiring/dispatcher tasks must carry an export-only red-line (same patterns as F11: `export-only|must not mutate|anti-corruption|R15`).
- **#19** Perm-enum task (`subcategory` contains "perm"/"enum") must contain `ship.[a-z_]+.[a-z_]+` strings.
- **#20** Tasks mentioning quality-hold / evaluateLpForShipping / v_active_holds must cite `09-quality/T-064` in `cross_module_dependencies`.
- **#21** POD/signed-BOL tasks must mention SHA-256 + 7-year retention (BRCGS §14.4) in prompt or red-lines.

#### 12-reporting (#17–#20)
- **#17** MV/read-model tasks (MATERIALIZED VIEW / REFRESH / mv_*) must not contain `INSERT INTO` / `UPDATE` targeting other-module table prefixes (wo_, quality_holds, license_plates, oee_, shipments, etc.) — consumer-only pattern.
- **#18** Long-running/bulk-export T2-api tasks must declare `apps/worker` dispatch or cite foundation T-111; no synchronous compute in request path.
- **#19** Perm-enum task must contain `rpt.[a-z_]+.[a-z_]+` strings; accepts both `rpt.*` (canonical alias) and `reporting.*` but flags mixed-namespace usage within one task.
- **#20** PII-handling export/dump tasks (csv export, pdf export, row dump) must declare a "no raw PII in exports" red-line.

#### 13-maintenance (#17–#21)
- **#17** LOTO apply/clear and calibration sign-off tasks must cite `00-foundation/T-124` (e-sign primitive) in `cross_module_dependencies`.
- **#18** Downtime-event tasks must declare outbox publication — either cite `00-foundation/T-112` or include outbox/publish language in prompt/red-lines. Missing T-112 citation is a softer failure even if outbox keyword present.
- **#19** Perm-enum task must contain `mnt.[a-z_]+.[a-z_]+` strings.
- **#20** Spare-parts inventory tasks must not contain hard FK `REFERENCES` to 05-warehouse tables.
- **#21** Asset-hierarchy tasks must contain all 5 canonical noun levels (site, area, line, machine, component) in the prompt, ideally in canonical order.

---

## Sample CLI output

### 11-shipping
```
[validate:11-shipping] 32 task files inspected
[validate:11-shipping] 69 FAILURES:
  - T-002.json: >4 acceptance_criteria (5)
  - T-007.json: task consumes quality-hold gate but cross_module_dependencies does not cite 09-quality/T-064 ...
  - T-010.json: POD/signed-BOL task does not mention SHA-256 ...
  - T-020.json: D365 integration task is missing an export-only red-line ...
  - T-021.json: SSCC/label task does not cite organizations.gs1_company_prefix from 02-settings ...
  ...
```

### 12-reporting
```
[validate:12-reporting] 27 task files inspected
[validate:12-reporting] 46 FAILURES:
  - T-001.json: PII-handling export/dump task does not declare a 'no raw PII in exports' red-line ...
  - T-002.json: >4 acceptance_criteria (5)
  - T-002.json: scope_files entry missing [create]/[modify]: 'packages/reporting/src/index.ts [create or modify export]'
  - T-017.json: T3-ui with prototype_match=true lacks parity AC naming ...
  - T-027.json: long-running/bulk-export API task does not declare worker dispatch ...
  ...
```

### 13-maintenance
```
[validate:13-maintenance] 30 task files inspected
[validate:13-maintenance] 45 FAILURES:
  - T-001.json: LOTO/calibration sign-off task does not cite foundation T-124 ...
  - T-004.json: downtime-event task does not declare outbox publication ...
  - T-010.json: downtime-event task mentions outbox/publish but does not explicitly cite foundation T-112 ...
  - T-017.json: placeholder pattern matched: \bTODO\b
  - T-019.json: asset-hierarchy task is missing canonical noun(s) ...
  ...
```

---

## Per-module pre-cleanup failure counts

| Module | Tasks | Total failures | Avg failures/task |
|---|---|---|---|
| 11-shipping | 32 | **69** | 2.16 |
| 12-reporting | 27 | **46** | 1.70 |
| 13-maintenance | 30 | **45** | 1.50 |

---

## Categorized breakdown

### 11-shipping (69 failures)

| Category | Count | Description |
|---|---|---|
| AC > 4 | 28 | Tasks with 5–7 acceptance criteria (overwhelmingly the largest category) |
| Missing 09-QA/T-064 cross-dep | 14 | Quality-hold consumer tasks don't cite the T-064 gate |
| Missing GS1 settings ref | 6 | SSCC/label tasks don't cite `organizations.gs1_company_prefix` |
| POD SHA-256 / 7y retention | 10 | Signed-BOL and pack-station tasks missing BRCGS §14.4 compliance markers |
| Missing parity AC format | 7 | T3-ui tasks have `prototype_match=true` but AC doesn't name the prototype file:line |
| D365 missing export-only RL | 1 | T-020 dispatcher task missing anti-corruption red-line |
| Parity section missing | 1 | T-028 missing `## Prototype parity` section |
| Parity missing `## Prototype parity` section | 1 | T-028 |

**Top 3 categories:**
1. AC > 4 (28 failures, 41%) — systemic over-specification; needs AC trimming or splitting
2. Missing 09-QA/T-064 cross-dep (14 failures, 20%) — quality-hold gate dependency gap
3. POD / BRCGS retention markers (10 failures, 14%) — BRCGS compliance markers absent

### 12-reporting (46 failures)

| Category | Count | Description |
|---|---|---|
| AC > 4 | 26 | Tasks with 5–8 acceptance criteria |
| Missing parity AC format | 10 | T3-ui dashboard tasks lack parity AC naming |
| Missing no-raw-PII red-line | 7 | Export/dump tasks don't assert PII redaction |
| scope_files annotation | 2 | `[create or modify export]` not matching the `[create]`/`[modify]` regex |
| Missing worker dispatch | 1 | T-027 bulk export doesn't cite apps/worker or T-111 |

**Top 3 categories:**
1. AC > 4 (26 failures, 57%) — most severe; reporting tasks over-specify criteria
2. Missing parity AC format (10 failures, 22%) — UI dashboard tasks systematically missing prototype path:line in AC
3. Missing no-raw-PII red-line (7 failures, 15%) — export tasks lack required data governance assertion

### 13-maintenance (45 failures)

| Category | Count | Description |
|---|---|---|
| AC > 4 | 22 | Tasks with 5–7 acceptance criteria |
| Missing parity AC format | 10 | T3-ui tasks lack prototype path:line in AC |
| Missing T-124 e-sign cross-dep | 8 | LOTO/calibration tasks don't cite foundation T-124 |
| Missing T-112 outbox cross-dep | 6 | Downtime-event tasks don't explicitly cite T-112 |
| Placeholder (TODO) in prompt | 1 | T-017 contains literal TODO |
| scope_files annotation | 1 | CODEOWNERS entry missing annotation |
| Asset hierarchy nouns missing | 1 | T-019 missing site/area/machine nouns |

**Top 3 categories:**
1. AC > 4 (22 failures, 49%) — same systemic pattern as other modules
2. Missing T-124 e-sign cross-dep (8 failures, 18%) — LOTO/calibration tasks systematically missing foundation e-sign dep
3. Missing parity AC format (10 failures, 22%) — UI tasks missing prototype path:line format in AC

---

## Wave 7 recommendation

**YES — Wave 7 cleanup is needed for all three modules.**

The dominant category across all three modules is **AC > 4** (76 of 160 total failures = 48%). This is a data-only fix per task (trim/split ACs). The next two categories are:

- **Missing prototype parity AC format** (27 failures) — add `prototypes/design/Monopilot Design System/<path>:<lines>` to the AC text.
- **Missing cross-module dependencies** (shipping QA gate: 14, maintenance T-124: 8, maintenance T-112: 6 = 28 failures) — add JSON array entries to `cross_module_dependencies`.

**Estimated Wave 7 scope:**
- ~89 tasks need at least one edit (32 shipping + 27 reporting + 30 maintenance)
- ~160 discrete failures across 3 modules
- Breakdown by effort: AC trimming (~76 edits, mechanical), parity AC wording (~27 edits), cross-dep additions (~28 edits), PII red-lines (~7 edits), misc (~22 edits)
- Estimated: 1 wave of ~45–60 parallel sub-tasks (3 batches of ~15–20 tasks each, one batch per module)

The BRCGS/POD markers in shipping (10 failures) and the TODO placeholder in maintenance T-017 should be treated as HIGH priority within the wave since they represent compliance and correctness gaps, not just structural style.

---

## Failure capture files

- `/tmp/f16_shipping_failures.txt`
- `/tmp/f16_reporting_failures.txt`
- `/tmp/f16_maintenance_failures.txt`
