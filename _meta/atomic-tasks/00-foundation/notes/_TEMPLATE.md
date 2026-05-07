# T-XXX — <title>

## Task spec
- Task JSON: `_meta/atomic-tasks/00-foundation/tasks/T-XXX.json`
- All scope_files / acceptance_criteria / out_of_scope / risk_red_lines live in the JSON. **Read it.**

## Migration number lock
See `_meta/atomic-tasks/00-foundation/STATUS.md` migration ordering section. Use the number assigned to your task; do not pick your own.

---

## Phase: RED (test author)
Status: <pending|done|skipped>
Files added/changed:
- ...
Tests written:
- ...
Test command + expected red output:
```
```
Notes for implementer:
- ...

---

## Phase: GREEN (implementer)
Status: <pending|done>
Files added/changed:
- ...
Implementation summary:
- ...
Test command + green output:
```
```
Acceptance criteria status (per AC from JSON):
- AC1: ...
- AC2: ...
Deviations from PRD/scope (if any):
- ...
Notes for reviewer:
- pay attention to ...

---

## Phase: REVIEW
Status: <pending|PASS|REWORK>
Reviewer agent type/model: ...
Findings:
- ...
Verdict reasoning:
- ...

If REWORK, exact list for implementer:
1. ...
2. ...

---

## Phase: REWORK (if needed)
Files changed:
- ...
What was fixed:
- ...
Re-review verdict: ...

---

## CLOSEOUT
- changed_files: ...
- test_commands_and_results: ...
- acceptance_criteria_status: all PASS
- deviations_from_prd: ...
- git_status: clean / N files modified
