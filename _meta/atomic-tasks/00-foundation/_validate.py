#!/usr/bin/env python3
"""Validator for 00-FOUNDATION atomic tasks (per prd-decompose-hybrid skill rules)."""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
TASKS = sorted((ROOT / "tasks").glob("T-*.json"))
MANIFEST = json.loads((ROOT / "manifest.json").read_text())
COVERAGE = (ROOT / "coverage.md").read_text()

ALLOWED_TOP = {"title", "prompt", "labels", "priority", "max_attempts", "pipeline_name", "pipeline_inputs"}
FORBIDDEN_TOP = {
    "task_id", "status", "project_id", "created_at", "updated_at",
    "expansion_status", "step_name", "pipeline_run_id",
    "claimed_by_terminal_id", "claim_token", "lease_until",
}
CANONICAL_PIPELINE_INPUTS = {
    "root_path", "description", "details", "scope_files",
    "acceptance_criteria", "test_strategy", "risk_red_lines",
    "skills", "checkpoint_policy",
}
ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}
PLACEHOLDERS = ["TBD", "TODO", "fill in", "appropriate", "similar to previous"]
ROOT_ABS = "/Users/mariuszkrawczyk/Projects/monopilot-kira"

LINE_RANGE_RE = re.compile(r":\d+(-\d+)?")


def check(cond, msg, errors):
    if not cond:
        errors.append(msg)


def main():
    errors = []
    deliverables = set()

    for path in TASKS:
        tid = path.stem
        try:
            data = json.loads(path.read_text())
        except Exception as e:
            errors.append(f"{tid}: JSON parse failure {e}")
            continue

        # 2. top-level keys subset
        keys = set(data.keys())
        extra = keys - ALLOWED_TOP
        check(not extra, f"{tid}: forbidden top-level keys {extra}", errors)
        # 3. forbidden ACP-owned keys
        forb = keys & FORBIDDEN_TOP
        check(not forb, f"{tid}: forbidden ACP-owned keys {forb}", errors)
        # 4. pipeline_name
        check(data.get("pipeline_name") == "kira_dev", f"{tid}: pipeline_name != 'kira_dev'", errors)

        pi = data.get("pipeline_inputs", {})
        # 5. canonical fields present + non-empty
        for f in CANONICAL_PIPELINE_INPUTS:
            v = pi.get(f)
            check(v not in (None, "", [], {}), f"{tid}: pipeline_inputs.{f} missing or empty", errors)
        check(pi.get("root_path") == ROOT_ABS, f"{tid}: root_path != {ROOT_ABS}", errors)

        # 6. AC count 1..4
        ac = pi.get("acceptance_criteria", [])
        check(1 <= len(ac) <= 4, f"{tid}: acceptance_criteria count {len(ac)} not in [1,4]", errors)

        # 7. priority 50..150
        p = data.get("priority")
        check(isinstance(p, int) and 50 <= p <= 150, f"{tid}: priority {p} not in [50,150]", errors)

        # 8. task_type allowed
        tt = pi.get("task_type")
        check(tt in ALLOWED_TASK_TYPES, f"{tid}: task_type {tt} invalid", errors)

        # 9. no placeholders
        haystack = " ".join([
            data.get("prompt", ""),
            pi.get("details", ""),
            " ".join(ac),
        ])
        for ph in PLACEHOLDERS:
            if re.search(rf"\b{re.escape(ph)}\b", haystack, flags=re.IGNORECASE):
                errors.append(f"{tid}: placeholder '{ph}' found in prompt/details/AC")

        # 10. T3-ui parity AC
        if tt == "T3-ui":
            has_parity = False
            for c in ac:
                if ("design/Monopilot Design System/" in c or "prototype" in c.lower()) and LINE_RANGE_RE.search(c):
                    has_parity = True
                    break
            check(has_parity, f"{tid}: T3-ui task lacks parity AC with prototype path + line-range", errors)

        # 12. unique deliverables — use title as proxy for deliverable
        title = data.get("title", "")
        if title in deliverables:
            errors.append(f"{tid}: duplicate deliverable title '{title}'")
        deliverables.add(title)

    # 11. coverage.md no GAP rows
    if "❌ GAP" in COVERAGE:
        errors.append("coverage.md contains '❌ GAP' rows")

    # 12b. manifest task_count == count of unique deliverables
    if MANIFEST.get("task_count") != len(deliverables):
        errors.append(f"manifest.task_count {MANIFEST.get('task_count')} != unique deliverables {len(deliverables)}")

    if errors:
        print("VALIDATION FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"VALIDATION PASS — {len(TASKS)} tasks, {len(deliverables)} unique deliverables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
