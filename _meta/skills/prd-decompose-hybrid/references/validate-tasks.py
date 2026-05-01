#!/usr/bin/env python3
"""
Validate a directory of prd-decompose-hybrid task JSON files against the ACP
TaskCreate contract for pipeline_name=kira_dev.

Usage:
    python references/validate-tasks.py prd-decomposition/tasks
    python references/validate-tasks.py prd-decomposition/tasks --strict-priority

Exits non-zero on any violation. Prints one line per task on success.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from typing import Iterable

ALLOWED_TOP = {
    "title",
    "prompt",
    "labels",
    "priority",
    "max_attempts",
    "pipeline_name",
    "pipeline_inputs",
}
REQUIRED_TOP = ALLOWED_TOP

FORBIDDEN_TOP = {
    "task_id",
    "status",
    "project_id",
    "created_at",
    "updated_at",
    "expansion_status",
    "step_name",
    "pipeline_run_id",
    "claimed_by_terminal_id",
    "claim_token",
    "lease_until",
}

REQUIRED_INPUTS = {
    "root_path",
    "description",
    "details",
    "scope_files",
    "acceptance_criteria",
    "test_strategy",
    "risk_red_lines",
    "skills",
    "checkpoint_policy",
}

PLACEHOLDER_PATTERNS = [
    re.compile(r"\bTBD\b", re.IGNORECASE),
    re.compile(r"\bTODO\b", re.IGNORECASE),
    re.compile(r"\bfill in\b", re.IGNORECASE),
    re.compile(r"\bappropriate\b", re.IGNORECASE),
    re.compile(r"\bsimilar to previous\b", re.IGNORECASE),
]

TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}
PRIORITY_BAND = (50, 150)


def fail(path: pathlib.Path, msg: str) -> None:
    print(f"FAIL {path.name}: {msg}", file=sys.stderr)


def check_one(path: pathlib.Path, *, strict_priority: bool) -> list[str]:
    errors: list[str] = []
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"]

    keys = set(payload)
    missing_top = REQUIRED_TOP - keys
    if missing_top:
        errors.append(f"missing top-level fields: {sorted(missing_top)}")
    extra_top = keys - ALLOWED_TOP
    if extra_top:
        errors.append(f"unexpected top-level fields: {sorted(extra_top)}")
    forbidden = FORBIDDEN_TOP & keys
    if forbidden:
        errors.append(f"forbidden top-level fields: {sorted(forbidden)}")

    if payload.get("pipeline_name") != "kira_dev":
        errors.append(f"pipeline_name must be 'kira_dev', got {payload.get('pipeline_name')!r}")

    inputs = payload.get("pipeline_inputs")
    if not isinstance(inputs, dict):
        errors.append("pipeline_inputs must be an object")
        inputs = {}

    missing_inputs = REQUIRED_INPUTS - set(inputs)
    if missing_inputs:
        errors.append(f"missing pipeline_inputs fields: {sorted(missing_inputs)}")

    for required in REQUIRED_INPUTS:
        value = inputs.get(required)
        if value in (None, "", [], {}):
            errors.append(f"pipeline_inputs.{required} is empty")

    root_path = inputs.get("root_path")
    if isinstance(root_path, str) and not root_path.startswith("/"):
        errors.append(f"pipeline_inputs.root_path must be absolute, got {root_path!r}")

    task_type = inputs.get("task_type")
    if task_type and task_type not in TASK_TYPES:
        errors.append(f"pipeline_inputs.task_type {task_type!r} not in {sorted(TASK_TYPES)}")

    deps = inputs.get("dependencies", [])
    if isinstance(deps, list):
        for dep in deps:
            if isinstance(dep, str) and dep.startswith("TASK-"):
                errors.append(f"dependency {dep!r} looks like an ACP id; use decomposer ids (T-XXX)")

    priority = payload.get("priority")
    if isinstance(priority, int):
        lo, hi = PRIORITY_BAND
        if not (lo <= priority <= hi):
            msg = f"priority {priority} outside documented band [{lo}-{hi}]"
            (errors if strict_priority else _warnings).append(msg)

    prompt = payload.get("prompt", "")
    for pat in PLACEHOLDER_PATTERNS:
        if pat.search(prompt):
            errors.append(f"prompt contains placeholder match {pat.pattern!r}")

    return errors


_warnings: list[str] = []


def iter_task_files(directory: pathlib.Path) -> Iterable[pathlib.Path]:
    return sorted(directory.glob("T-*.json"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=pathlib.Path)
    parser.add_argument("--strict-priority", action="store_true",
                        help="Fail (instead of warn) when priority is outside the documented band")
    args = parser.parse_args()

    if not args.directory.is_dir():
        print(f"not a directory: {args.directory}", file=sys.stderr)
        return 2

    files = list(iter_task_files(args.directory))
    if not files:
        print(f"no T-*.json files in {args.directory}", file=sys.stderr)
        return 2

    failed = 0
    for path in files:
        errors = check_one(path, strict_priority=args.strict_priority)
        if errors:
            failed += 1
            for err in errors:
                fail(path, err)
        else:
            print(f"OK   {path.name}")

    for warning in _warnings:
        print(f"WARN {warning}", file=sys.stderr)

    if failed:
        print(f"\n{failed} task file(s) failed validation", file=sys.stderr)
        return 1
    print(f"\nAll {len(files)} task file(s) passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
