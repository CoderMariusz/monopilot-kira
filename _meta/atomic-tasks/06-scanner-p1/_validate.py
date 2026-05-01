#!/usr/bin/env python3
"""Validator for 06-scanner-p1 atomic tasks (prd-decompose-hybrid Step 8 + Step 7 parity AC gate).

Standard checks:
  - JSON parses
  - Required top-level keys present
  - No forbidden top-level keys
  - pipeline_name == 'kira_dev'
  - Canonical kira_dev pipeline_inputs fields present + non-empty
  - root_path is absolute
  - No placeholder strings (TBD/TODO/fill in/appropriate/similar to previous)
  - title startswith 'T-NNN — '
  - dependencies use T-XXX form
  - acceptance_criteria <= 4 (atomicity gate)
  - T3-ui (or T4-wiring-test on UI flow) — at least one AC mentions
    'design/Monopilot Design System/' with a line range (parity AC gate)
  - manifest.json references all task files
  - coverage.md has no '❌ GAP' rows
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
MANIFEST = ROOT / "manifest.json"
COVERAGE = ROOT / "coverage.md"

REQUIRED_TOP = {"title", "prompt", "labels", "priority", "max_attempts",
                "pipeline_name", "pipeline_inputs"}
FORBIDDEN_TOP = {"task_id", "status", "project_id", "created_at", "updated_at",
                 "expansion_status", "step_name", "pipeline_run_id",
                 "claimed_by_terminal_id", "claim_token", "lease_until"}
REQUIRED_PI = {"root_path", "description", "details", "scope_files",
               "acceptance_criteria", "test_strategy", "risk_red_lines",
               "skills", "checkpoint_policy"}
PLACEHOLDERS = ("TBD", "TODO", "fill in", "appropriate", "similar to previous")
T_ID_RE = re.compile(r"^T-\d{3}$")
TITLE_RE = re.compile(r"^T-\d{3} — .+")
PARITY_PATH_RE = re.compile(r"design/Monopilot Design System/[^\s`'\"]+:\d+-?\d*")


def fail(msgs: list[str], path: Path, msg: str) -> None:
    msgs.append(f"[{path.name}] {msg}")


def validate_task(p: Path) -> list[str]:
    errs: list[str] = []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"[{p.name}] JSON parse error: {e}"]

    keys = set(data.keys())
    missing = REQUIRED_TOP - keys
    if missing:
        fail(errs, p, f"missing top-level keys: {sorted(missing)}")
    forbidden = FORBIDDEN_TOP & keys
    if forbidden:
        fail(errs, p, f"forbidden top-level keys present: {sorted(forbidden)}")

    if data.get("pipeline_name") != "kira_dev":
        fail(errs, p, f"pipeline_name must be 'kira_dev', got {data.get('pipeline_name')!r}")

    title = data.get("title", "")
    if not isinstance(title, str) or not TITLE_RE.match(title):
        fail(errs, p, f"title must start with 'T-NNN — ', got {title!r}")

    pi = data.get("pipeline_inputs") or {}
    if not isinstance(pi, dict):
        fail(errs, p, "pipeline_inputs must be an object")
        return errs
    pi_missing = REQUIRED_PI - set(pi.keys())
    if pi_missing:
        fail(errs, p, f"pipeline_inputs missing: {sorted(pi_missing)}")
    for k in REQUIRED_PI & set(pi.keys()):
        v = pi[k]
        if v in (None, "", [], {}):
            fail(errs, p, f"pipeline_inputs.{k} is empty")

    rp = pi.get("root_path", "")
    if not isinstance(rp, str) or not rp.startswith("/"):
        fail(errs, p, f"root_path must be absolute, got {rp!r}")

    deps = pi.get("dependencies") or []
    for d in deps:
        if not (isinstance(d, str) and T_ID_RE.match(d)):
            fail(errs, p, f"dependency {d!r} must match T-XXX (3 digits)")

    ac = pi.get("acceptance_criteria") or []
    if not isinstance(ac, list) or len(ac) == 0:
        fail(errs, p, "acceptance_criteria must be non-empty list")
    elif len(ac) > 4:
        fail(errs, p, f"atomicity gate: acceptance_criteria has {len(ac)} (>4)")

    ttype = pi.get("task_type", "")
    is_ui = ttype == "T3-ui" or (ttype == "T4-wiring-test" and "ui" in str(pi.get("category", "")))
    if is_ui and isinstance(ac, list):
        has_parity = any(PARITY_PATH_RE.search(str(a)) for a in ac)
        if not has_parity:
            fail(errs, p, "UI task missing prototype parity AC (must reference 'design/Monopilot Design System/...:lines')")

    body = json.dumps(data, ensure_ascii=False)
    for ph in PLACEHOLDERS:
        # avoid false positives: 'TBD' must be a whole word
        if re.search(rf"\b{re.escape(ph)}\b", body, re.IGNORECASE):
            fail(errs, p, f"placeholder '{ph}' found")

    pri = data.get("priority")
    if not isinstance(pri, int) or not (50 <= pri <= 150):
        fail(errs, p, f"priority {pri!r} outside 50..150 band")

    if data.get("max_attempts") != 3:
        fail(errs, p, f"max_attempts should be 3, got {data.get('max_attempts')!r}")

    return errs


def validate_manifest(task_files: list[Path]) -> list[str]:
    errs: list[str] = []
    if not MANIFEST.exists():
        return [f"[manifest.json] missing"]
    try:
        m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return [f"[manifest.json] JSON parse error: {e}"]
    listed = set(m.get("tasks") or [])
    expected = {f"tasks/{p.name}" for p in task_files}
    missing = expected - listed
    extra = listed - expected
    if missing:
        errs.append(f"[manifest.json] missing tasks: {sorted(missing)}")
    if extra:
        errs.append(f"[manifest.json] extra tasks: {sorted(extra)}")
    if m.get("pipeline_name") != "kira_dev":
        errs.append(f"[manifest.json] pipeline_name must be 'kira_dev'")
    if not str(m.get("root_path", "")).startswith("/"):
        errs.append(f"[manifest.json] root_path must be absolute")
    if m.get("task_count") != len(task_files):
        errs.append(f"[manifest.json] task_count {m.get('task_count')} != {len(task_files)}")
    return errs


def validate_coverage() -> list[str]:
    if not COVERAGE.exists():
        return ["[coverage.md] missing"]
    text = COVERAGE.read_text(encoding="utf-8")
    if "❌ GAP" in text:
        return ["[coverage.md] contains '❌ GAP' rows — gaps must be resolved or marked out-of-scope"]
    return []


def main() -> int:
    task_files = sorted(TASKS_DIR.glob("T-*.json"))
    if not task_files:
        print("No tasks/T-*.json files found", file=sys.stderr)
        return 2
    all_errs: list[str] = []
    pass_count = 0
    for p in task_files:
        errs = validate_task(p)
        if not errs:
            pass_count += 1
        all_errs.extend(errs)
    all_errs.extend(validate_manifest(task_files))
    all_errs.extend(validate_coverage())
    print(f"Tasks validated: {pass_count}/{len(task_files)}")
    if all_errs:
        print("\nFAILURES:")
        for e in all_errs:
            print(f"  {e}")
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
