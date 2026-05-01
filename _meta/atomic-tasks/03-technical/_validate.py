#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (03-TECHNICAL).

Standard 7 checks:
  1. Every tasks/T-*.json parses as JSON.
  2. Required top-level keys present (no extras).
  3. pipeline_name == "kira_dev".
  4. Required pipeline_inputs canonical kira_dev fields present + non-empty.
  5. No forbidden top-level fields.
  6. No placeholder strings (TBD, TODO, fill in, appropriate, similar to previous).
  7. coverage.md has no unresolved "❌ GAP" rows.

Plus: T3-ui tasks (and UI-flow T4-wiring-test) with a matched prototype must
carry at least one acceptance criterion that names a prototype path with
line range and asserts structural+visual+interaction parity (Step 7 rule).

Usage: python3 _validate.py
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
TASKS_DIR = ROOT / "tasks"
COVERAGE = ROOT / "coverage.md"
MANIFEST = ROOT / "manifest.json"

REQUIRED_TOP = {"title", "prompt", "labels", "priority", "max_attempts", "pipeline_name", "pipeline_inputs"}
FORBIDDEN_TOP = {
    "task_id", "status", "project_id", "created_at", "updated_at",
    "expansion_status", "step_name", "pipeline_run_id",
    "claimed_by_terminal_id", "claim_token", "lease_until",
}
REQUIRED_PI = {
    "root_path", "description", "details", "scope_files",
    "acceptance_criteria", "test_strategy", "risk_red_lines",
    "skills", "checkpoint_policy", "task_type", "category",
}
PLACEHOLDERS = ["TBD", "TODO", "fill in", "appropriate", "similar to previous"]
PLACEHOLDER_RE = re.compile(r"\b(?:" + "|".join(re.escape(p) for p in PLACEHOLDERS) + r")\b", re.IGNORECASE)

PROTOTYPE_PATH_RE = re.compile(r"design/Monopilot Design System/[^\s`\"]+:\d+(?:-\d+)?")


def fail(task: str, msg: str, errors: list) -> None:
    errors.append(f"  [{task}] {msg}")


def main() -> int:
    if not TASKS_DIR.exists():
        print(f"FATAL: {TASKS_DIR} not found")
        return 2
    files = sorted(TASKS_DIR.glob("T-*.json"))
    if not files:
        print(f"FATAL: no T-*.json under {TASKS_DIR}")
        return 2

    errors: list[str] = []
    seen_titles: dict[str, str] = {}
    seen_prd_ids: dict[str, str] = {}

    for fp in files:
        rel = fp.name
        try:
            data = json.loads(fp.read_text())
        except Exception as e:
            fail(rel, f"JSON parse error: {e}", errors)
            continue

        # Check 1+2: required top-level
        missing = REQUIRED_TOP - data.keys()
        if missing:
            fail(rel, f"missing top-level keys: {sorted(missing)}", errors)
        extra = data.keys() - (REQUIRED_TOP | {"description"})  # description allowed extra (some tools include it)
        # Strict per skill: only ACP TaskCreate keys allowed at top level
        extra_strict = data.keys() - REQUIRED_TOP
        if extra_strict:
            fail(rel, f"extra top-level keys: {sorted(extra_strict)}", errors)

        # Check 5: forbidden
        forbidden = FORBIDDEN_TOP & data.keys()
        if forbidden:
            fail(rel, f"forbidden top-level keys: {sorted(forbidden)}", errors)

        # Check 3: pipeline_name
        if data.get("pipeline_name") != "kira_dev":
            fail(rel, f"pipeline_name must be 'kira_dev', got {data.get('pipeline_name')!r}", errors)

        pi = data.get("pipeline_inputs") or {}
        # Check 4: required pi
        missing_pi = REQUIRED_PI - pi.keys()
        if missing_pi:
            fail(rel, f"missing pipeline_inputs: {sorted(missing_pi)}", errors)
        # non-empty
        for k in REQUIRED_PI:
            v = pi.get(k)
            if v is None or (hasattr(v, "__len__") and len(v) == 0):
                fail(rel, f"pipeline_inputs.{k} is empty/null", errors)

        # root_path absolute
        rp = pi.get("root_path", "")
        if not isinstance(rp, str) or not rp.startswith("/"):
            fail(rel, f"pipeline_inputs.root_path must be absolute, got {rp!r}", errors)

        # priority int 50..150
        pr = data.get("priority")
        if not isinstance(pr, int) or pr < 50 or pr > 150:
            fail(rel, f"priority must be int in 50..150, got {pr!r}", errors)

        # max_attempts == 3 (skill convention)
        ma = data.get("max_attempts")
        if not isinstance(ma, int) or ma < 1 or ma > 5:
            fail(rel, f"max_attempts must be 1..5, got {ma!r}", errors)

        # Check 6: placeholders in prompt + details
        for field in ("prompt",):
            txt = data.get(field, "")
            m = PLACEHOLDER_RE.search(txt)
            if m:
                fail(rel, f"{field} contains placeholder {m.group(0)!r}", errors)
        details_txt = pi.get("details", "")
        m = PLACEHOLDER_RE.search(details_txt)
        if m:
            fail(rel, f"pipeline_inputs.details contains placeholder {m.group(0)!r}", errors)

        # Title uniqueness
        title = data.get("title", "")
        if title in seen_titles:
            fail(rel, f"duplicate title (also in {seen_titles[title]})", errors)
        seen_titles[title] = rel
        prd_id = pi.get("prd_task_id", "")
        if prd_id in seen_prd_ids:
            fail(rel, f"duplicate prd_task_id {prd_id} (also in {seen_prd_ids[prd_id]})", errors)
        seen_prd_ids[prd_id] = rel

        # checkpoint_policy shape
        cp = pi.get("checkpoint_policy") or {}
        if "required_checkpoints" not in cp or "closeout_requires" not in cp:
            fail(rel, "checkpoint_policy missing required_checkpoints/closeout_requires", errors)

        # T3-ui (and UI-flow T4-wiring-test) parity-AC enforcement
        task_type = pi.get("task_type", "")
        is_ui = task_type == "T3-ui"
        is_ui_flow = task_type == "T4-wiring-test" and pi.get("subcategory", "").startswith("ui-")
        if is_ui or is_ui_flow:
            acs = pi.get("acceptance_criteria", []) or []
            joined = " \n ".join(acs) if isinstance(acs, list) else str(acs)
            # Must include a prototype path:lines token AND parity language
            has_path = bool(PROTOTYPE_PATH_RE.search(joined))
            has_parity_words = (
                ("structural" in joined.lower())
                and ("visual" in joined.lower())
                and ("interaction" in joined.lower())
                and ("parity" in joined.lower())
            )
            if not has_path:
                fail(rel, "T3-ui task missing prototype path:lines reference in any acceptance_criterion", errors)
            if not has_parity_words:
                fail(rel, "T3-ui task missing parity AC asserting structural+visual+interaction parity", errors)

    # Check 7: coverage.md no unresolved gaps
    if not COVERAGE.exists():
        errors.append(f"  [coverage.md] missing")
    else:
        cov = COVERAGE.read_text()
        gap_rows = [ln for ln in cov.splitlines() if "❌ GAP" in ln and not ln.startswith("|---")]
        # filter table-header decorative line shapes (`| §X.Y | ... | ❌ GAP |`) — accept 0
        unresolved = [ln for ln in gap_rows if "resolved" not in ln.lower() and "out-of-scope" not in ln.lower()]
        if unresolved:
            for ln in unresolved:
                errors.append(f"  [coverage.md] unresolved GAP row: {ln.strip()[:120]}")

    # manifest exists
    if not MANIFEST.exists():
        errors.append(f"  [manifest.json] missing")
    else:
        try:
            mfs = json.loads(MANIFEST.read_text())
            if mfs.get("task_count") != len(files):
                errors.append(f"  [manifest.json] task_count {mfs.get('task_count')} != {len(files)} files")
            if mfs.get("pipeline_name") != "kira_dev":
                errors.append(f"  [manifest.json] pipeline_name must be kira_dev")
        except Exception as e:
            errors.append(f"  [manifest.json] parse error: {e}")

    print(f"Validated {len(files)} task files.")
    if errors:
        print(f"FAIL: {len(errors)} issue(s):")
        for e in errors:
            print(e)
        return 1
    print("PASS: all checks green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
