# Fixer F15 — Misc cleanup report
Date: 2026-05-14

## Issue A — T-130 AC consolidation (02-settings)

### Problem
T-130.json had 7 acceptance_criteria (validator cap = 4) → `>4 acceptance_criteria (7)` failure.
No TBD/TODO placeholders were found in prompt, details, description, or ACs (F10 had already resolved the 09-quality reference).

### Actions taken
1. Fused 7 ACs → 4 using strict-subset fusion (F6/F8 patterns):
   - AC1: old AC5 (no-op on non-target) + old AC1 (zero violations on unmodified target) — both test the "clean/silent" path
   - AC2: old AC2 (illegal-removal) + old AC3 (regex-violation) — both test "bad edit → error" path
   - AC3: old AC4 (orphan-array) — standalone invariant, kept as-is
   - AC4: old AC7 (vitest RuleTester pass) + old AC6 (CI gate + snapshot approval) — both test the "approved path"
2. Mirrored the 4 fused ACs in the `## Acceptance criteria` section of the `prompt` field, with provenance comment `<!-- F15-consolidation 2026-05-14: 7 ACs fused to 4... -->`.
3. Updated `test_strategy` to explicitly cross-reference that vitest pass satisfies AC4.
4. Added `vitest_run_output` to `checkpoint_policy.closeout_requires` (procedural hoist from old AC7).
5. Priority 90 and `p0-blocker` label preserved unchanged.

### Result
`python3 _meta/atomic-tasks/02-settings/_validate.py` → **PASS — 0 failures** (was 1 failure).

---

## Issue B — 01-NPD coverage.md line 113 GAP substring

### Problem
coverage.md line 113 contained the word "GAP" inside `...coverage-gaps.md GAP)` — the 01-npd validator flags any line with "GAP" not containing "out-of-scope".

### Actions taken
Rewrote the parenthetical from `coverage-gaps.md GAP)` → `coverage-gaps.md coverage delta)`. Column contents (PRD ref, task file, type, status, notes) unchanged.

### Result
`python3 _meta/atomic-tasks/01-npd/_validate.py` → **PASS: 101 task files validated, coverage.md clean** (was 1 failure).

---

## Issue C — Spot-check across all 11 modules

All 11 validators were run before and after fixes.

### Pre-fix baseline
| Module | Failures |
|---|---|
| 00-foundation | 0 |
| 01-npd | 1 (coverage.md:113 GAP row) |
| 02-settings | 1 (T-130 >4 ACs) |
| 03-technical | 0 |
| 04-planning-basic | 0 |
| 05-warehouse | 0 |
| 06-scanner-p1 | 0 |
| 07-planning-ext | 0 |
| 08-production | 0 |
| 09-quality | 0 |
| 15-oee | 0 |

### Post-fix final
All 11 modules: **0 failures**.

### Deferred non-trivial findings
None. No additional trivial defects were surfaced during the spot-check.

---

## Files modified
- `_meta/atomic-tasks/02-settings/tasks/T-130.json` — AC consolidation 7→4, prompt AC section updated, test_strategy updated, closeout_requires updated
- `_meta/atomic-tasks/01-npd/coverage.md` — line 113: "GAP" substring removed from audit file reference
