#!/usr/bin/env python3
"""Validator for 01-NPD atomic ACP task payloads.

Checks:
1. JSON parses; top-level keys subset of {title, prompt, labels, priority,
   max_attempts, pipeline_name, pipeline_inputs}; no forbidden keys.
2. pipeline_name == "kira_dev"; canonical pipeline_inputs all present non-empty.
3. 1 <= len(acceptance_criteria) <= 4; 50 <= priority <= 150.
4. task_type in allowed set.
5. No placeholders (TBD, TODO, fill in, appropriate, similar to previous).
6. T3-ui tasks: at least one AC contains 'design/Monopilot Design System/' or
   'prototype' AND a line-range pattern (NN-NN or NN:NN).
7. coverage.md: no rows containing GAP marker (unless explicitly out-of-scope).
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
COVERAGE = ROOT / "coverage.md"

ALLOWED_TOP = {
    "title", "prompt", "labels", "priority", "max_attempts",
    "pipeline_name", "pipeline_inputs",
}
FORBIDDEN_TOP = {
    "task_id", "status", "project_id", "created_at", "updated_at",
    "expansion_status", "step_name", "pipeline_run_id",
    "claimed_by_terminal_id", "claim_token", "lease_until",
}
CANONICAL_PI = [
    "root_path", "description", "details", "scope_files",
    "acceptance_criteria", "test_strategy", "risk_red_lines",
    "skills", "checkpoint_policy",
]
ALLOWED_TASK_TYPES = {
    "T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs",
}
PLACEHOLDERS = [
    "TBD", "TODO", "fill in", "appropriate", "similar to previous",
]
LINE_RANGE_RX = re.compile(r":\d+(?:-\d+)?\b")
PROTO_RX = re.compile(r"design/Monopilot Design System/|prototype", re.I)


def fail(path: pathlib.Path, msg: str, errors: list[str]) -> None:
    errors.append(f"[{path.name}] {msg}")


def validate_task(path: pathlib.Path, errors: list[str]) -> None:
    try:
        data: dict[str, Any] = json.loads(path.read_text())
    except Exception as e:
        fail(path, f"JSON parse error: {e}", errors)
        return

    # 1. top-level keys
    keys = set(data.keys())
    extra = keys - ALLOWED_TOP
    if extra:
        fail(path, f"unexpected top-level keys: {sorted(extra)}", errors)
    forbidden = keys & FORBIDDEN_TOP
    if forbidden:
        fail(path, f"forbidden top-level keys: {sorted(forbidden)}", errors)
    missing_top = ALLOWED_TOP - keys
    required_missing = {"title", "prompt", "labels", "priority",
                        "max_attempts", "pipeline_name", "pipeline_inputs"} & missing_top
    if required_missing:
        fail(path, f"missing required top-level keys: {sorted(required_missing)}", errors)
        return

    # 2. pipeline_name + canonical inputs
    if data.get("pipeline_name") != "kira_dev":
        fail(path, f"pipeline_name must be 'kira_dev' (got {data.get('pipeline_name')!r})", errors)
    pi = data.get("pipeline_inputs") or {}
    if not isinstance(pi, dict):
        fail(path, "pipeline_inputs must be an object", errors)
        return
    for key in CANONICAL_PI:
        v = pi.get(key)
        if v is None or (isinstance(v, (list, dict, str)) and len(v) == 0):
            fail(path, f"pipeline_inputs.{key} missing or empty", errors)
    if "root_path" in pi and pi["root_path"] != "/Users/mariuszkrawczyk/Projects/monopilot-kira":
        fail(path, f"root_path must be project absolute path (got {pi.get('root_path')!r})", errors)

    # 3. acceptance_criteria count + priority
    ac = pi.get("acceptance_criteria") or []
    if not (1 <= len(ac) <= 4):
        fail(path, f"acceptance_criteria count must be 1..4 (got {len(ac)})", errors)
    pri = data.get("priority")
    if not isinstance(pri, int) or not (50 <= pri <= 150):
        fail(path, f"priority must be int in 50..150 (got {pri!r})", errors)

    # 4. task_type
    tt = pi.get("task_type")
    if tt not in ALLOWED_TASK_TYPES:
        fail(path, f"task_type must be in {sorted(ALLOWED_TASK_TYPES)} (got {tt!r})", errors)

    # 5. placeholders in prompt + details
    text_blob = " ".join([
        data.get("prompt", ""),
        pi.get("details", "") or "",
        pi.get("description", "") or "",
        " ".join(ac) if isinstance(ac, list) else "",
    ])
    for ph in PLACEHOLDERS:
        # word-boundary insensitive match (avoid matching inside legit words)
        if re.search(rf"\b{re.escape(ph)}\b", text_blob, re.I):
            fail(path, f"placeholder text found: {ph!r}", errors)

    # 6. UI tasks must carry parity AC referencing prototype path + line range
    if tt == "T3-ui" or (tt == "T4-wiring-test" and pi.get("ui_flow") is True):
        has_parity = False
        for c in ac:
            if isinstance(c, str) and PROTO_RX.search(c) and LINE_RANGE_RX.search(c):
                has_parity = True
                break
        if not has_parity:
            fail(path, "T3-ui (or UI-flow T4) must include AC naming prototype path + line range", errors)


def validate_coverage(errors: list[str]) -> None:
    if not COVERAGE.exists():
        errors.append("[coverage.md] missing")
        return
    text = COVERAGE.read_text()
    for i, line in enumerate(text.splitlines(), 1):
        if "GAP" in line and "out-of-scope" not in line.lower():
            errors.append(f"[coverage.md:{i}] unresolved GAP row: {line.strip()}")


def main() -> int:
    errors: list[str] = []
    if not TASKS_DIR.exists():
        print(f"FAIL: {TASKS_DIR} missing")
        return 2
    files = sorted(TASKS_DIR.glob("T-*.json"))
    if not files:
        print("FAIL: no T-*.json files in tasks/")
        return 2
    for p in files:
        validate_task(p, errors)
    validate_coverage(errors)
    if errors:
        print(f"FAIL ({len(errors)} issues across {len(files)} task files):")
        for e in errors:
            print("  -", e)
        return 1
    print(f"PASS: {len(files)} task files validated, coverage.md clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
