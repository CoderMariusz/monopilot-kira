#!/usr/bin/env python3
"""Validator for 08-PRODUCTION atomic tasks.

Standard checks per prd-decompose-hybrid skill Step 8:
1. JSON parse
2. required top-level fields
3. pipeline_name == kira_dev
4. canonical kira_dev pipeline_inputs fields present + non-empty
5. no forbidden top-level fields
6. placeholder grep
7. coverage.md has no '❌ GAP' rows (unless explicitly out-of-scope)
8. atomicity gate: AC count <= 4
9. T3-ui parity AC includes 'design/Monopilot Design System' path
10. priority within band 50..150
11. dependencies use T-XXX form
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
TASK_DIR = ROOT / "tasks"
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
    "skills", "checkpoint_policy",
}
PLACEHOLDERS = ("TBD", "TODO ", "fill in", "appropriate", "similar to previous", "<...>")


def fail(msg: str, errors: list[str]) -> None:
    errors.append(msg)


def validate_task(p: pathlib.Path, errors: list[str]) -> None:
    try:
        data = json.loads(p.read_text())
    except json.JSONDecodeError as e:
        fail(f"{p.name}: invalid JSON: {e}", errors)
        return

    # 1. top-level fields
    missing_top = REQUIRED_TOP - set(data.keys())
    if missing_top:
        fail(f"{p.name}: missing top-level fields {missing_top}", errors)
    forbidden = FORBIDDEN_TOP & set(data.keys())
    if forbidden:
        fail(f"{p.name}: forbidden top-level fields {forbidden}", errors)
    extra = set(data.keys()) - REQUIRED_TOP
    if extra:
        fail(f"{p.name}: extra top-level keys {extra} (only {REQUIRED_TOP} allowed)", errors)

    # 2. pipeline_name
    if data.get("pipeline_name") != "kira_dev":
        fail(f"{p.name}: pipeline_name must be 'kira_dev'", errors)

    # 3. priority band
    pr = data.get("priority")
    if not isinstance(pr, int) or not (50 <= pr <= 150):
        fail(f"{p.name}: priority {pr!r} not in band [50..150]", errors)

    # 4. max_attempts
    if data.get("max_attempts") != 3:
        fail(f"{p.name}: max_attempts should be 3 (got {data.get('max_attempts')})", errors)

    pi = data.get("pipeline_inputs") or {}
    if not isinstance(pi, dict):
        fail(f"{p.name}: pipeline_inputs must be object", errors)
        return

    # 5. canonical kira_dev fields
    missing_pi = REQUIRED_PI - set(pi.keys())
    if missing_pi:
        fail(f"{p.name}: pipeline_inputs missing {missing_pi}", errors)
    for k in REQUIRED_PI & set(pi.keys()):
        v = pi[k]
        if v in (None, "", [], {}):
            fail(f"{p.name}: pipeline_inputs.{k} is empty", errors)

    # 6. root_path absolute
    rp = pi.get("root_path", "")
    if not (isinstance(rp, str) and rp.startswith("/")):
        fail(f"{p.name}: pipeline_inputs.root_path must be absolute path", errors)

    # 7. AC <= 4 (atomicity gate)
    ac = pi.get("acceptance_criteria") or []
    if isinstance(ac, list) and len(ac) > 4:
        fail(f"{p.name}: acceptance_criteria has {len(ac)} entries (>4 atomicity gate)", errors)
    if isinstance(ac, list) and len(ac) == 0:
        fail(f"{p.name}: acceptance_criteria empty", errors)

    # 8. dependencies use T-XXX
    deps = pi.get("dependencies") or []
    for d in deps:
        if not re.match(r"^T-\d{3}$", d):
            fail(f"{p.name}: dependency {d!r} not in T-XXX form", errors)

    # 9. T3-ui parity AC: must reference design/Monopilot Design System
    task_type = pi.get("task_type", "")
    if task_type == "T3-ui":
        scope_files = pi.get("scope_files") or []
        details = pi.get("details", "")
        joined = " ".join(scope_files) + " " + details
        if "design/Monopilot Design System" not in joined:
            fail(f"{p.name}: T3-ui task must reference 'design/Monopilot Design System/<path>:<lines>' in details/scope_files", errors)

    # 10. placeholders
    text = json.dumps(data)
    for ph in PLACEHOLDERS:
        if ph in text:
            fail(f"{p.name}: contains placeholder {ph!r}", errors)

    # 11. labels include prd
    labels = data.get("labels") or []
    if "prd" not in labels:
        fail(f"{p.name}: labels must include 'prd'", errors)

    # 12. checkpoint_policy
    cp = pi.get("checkpoint_policy") or {}
    req_ckpts = cp.get("required_checkpoints") if isinstance(cp, dict) else None
    if req_ckpts != ["RED", "GREEN", "REVIEW", "CLOSEOUT"]:
        fail(f"{p.name}: checkpoint_policy.required_checkpoints must be [RED,GREEN,REVIEW,CLOSEOUT]", errors)


def validate_coverage(errors: list[str]) -> None:
    if not COVERAGE.exists():
        fail("coverage.md missing", errors)
        return
    txt = COVERAGE.read_text()
    # row that has GAP without explicit out-of-scope/PRD ref
    for ln in txt.splitlines():
        if "❌ GAP" in ln or "GAP " in ln and "out-of-scope" not in ln and "explicit" not in ln:
            if "❌ GAP" in ln:
                fail(f"coverage.md: unresolved GAP row: {ln.strip()}", errors)


def validate_manifest(errors: list[str]) -> None:
    if not MANIFEST.exists():
        fail("manifest.json missing", errors)
        return
    try:
        m = json.loads(MANIFEST.read_text())
    except json.JSONDecodeError as e:
        fail(f"manifest.json invalid: {e}", errors)
        return
    if m.get("pipeline_name") != "kira_dev":
        fail("manifest.json: pipeline_name must be 'kira_dev'", errors)
    rp = m.get("root_path", "")
    if not (isinstance(rp, str) and rp.startswith("/")):
        fail("manifest.json: root_path must be absolute", errors)
    listed = set(m.get("tasks") or [])
    on_disk = {f"tasks/{p.name}" for p in TASK_DIR.glob("T-*.json")}
    if listed != on_disk:
        missing = on_disk - listed
        extra = listed - on_disk
        if missing:
            fail(f"manifest.json: tasks on disk not in manifest: {sorted(missing)}", errors)
        if extra:
            fail(f"manifest.json: tasks listed but missing from disk: {sorted(extra)}", errors)


def main() -> int:
    errors: list[str] = []
    task_files = sorted(TASK_DIR.glob("T-*.json"))
    if not task_files:
        fail("no task files found in tasks/", errors)
    for p in task_files:
        validate_task(p, errors)
    validate_coverage(errors)
    validate_manifest(errors)

    if errors:
        print(f"FAIL: {len(errors)} errors")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"PASS: {len(task_files)} tasks validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
