#!/usr/bin/env python3
"""Validator for 07-PLANNING-EXT atomic tasks (ACP TaskCreate payloads)."""

import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
TASK_DIR = ROOT / "tasks"

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
ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}
ALLOWED_CATEGORIES = {"ui", "api", "data", "infra", "auth", "docs", "test", "integration"}
PLACEHOLDER_RE = re.compile(r"\b(TBD|TODO|fill in|appropriate|similar to previous)\b", re.IGNORECASE)
EXPECTED_PIPELINE = "kira_dev"
EXPECTED_ROOT = "/Users/mariuszkrawczyk/Projects/monopilot-kira"


def fail(file: str, msg: str, errors: list) -> None:
    errors.append(f"{file}: {msg}")


def validate(path: pathlib.Path, errors: list) -> None:
    name = path.name
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        fail(name, f"invalid JSON: {e}", errors)
        return

    keys = set(data.keys())
    missing = REQUIRED_TOP - keys
    if missing:
        fail(name, f"missing top-level keys: {sorted(missing)}", errors)
    extra_forbidden = keys & FORBIDDEN_TOP
    if extra_forbidden:
        fail(name, f"forbidden top-level keys: {sorted(extra_forbidden)}", errors)
    extra = keys - REQUIRED_TOP
    if extra:
        fail(name, f"unexpected top-level keys: {sorted(extra)}", errors)

    if data.get("pipeline_name") != EXPECTED_PIPELINE:
        fail(name, f"pipeline_name must be '{EXPECTED_PIPELINE}'", errors)

    pi = data.get("pipeline_inputs") or {}
    if not isinstance(pi, dict):
        fail(name, "pipeline_inputs must be object", errors)
        return

    pi_missing = REQUIRED_PI - set(pi.keys())
    if pi_missing:
        fail(name, f"pipeline_inputs missing: {sorted(pi_missing)}", errors)

    if pi.get("root_path") != EXPECTED_ROOT:
        fail(name, f"root_path must be '{EXPECTED_ROOT}'", errors)

    for k in ("description", "details"):
        v = pi.get(k)
        if not v or not isinstance(v, str) or not v.strip():
            fail(name, f"pipeline_inputs.{k} empty/non-string", errors)

    for k in ("scope_files", "acceptance_criteria", "test_strategy", "risk_red_lines", "skills"):
        v = pi.get(k)
        if not v or not isinstance(v, list) or len(v) == 0:
            fail(name, f"pipeline_inputs.{k} empty/non-list", errors)

    cp = pi.get("checkpoint_policy")
    if not isinstance(cp, dict) or "required_checkpoints" not in cp or "closeout_requires" not in cp:
        fail(name, "checkpoint_policy malformed", errors)

    ac = pi.get("acceptance_criteria") or []
    if isinstance(ac, list) and len(ac) > 4:
        fail(name, f"AC count {len(ac)} > 4 (atomicity rule)", errors)

    tt = pi.get("task_type")
    if tt not in ALLOWED_TASK_TYPES:
        fail(name, f"invalid task_type '{tt}'", errors)

    cat = pi.get("category")
    if cat not in ALLOWED_CATEGORIES:
        fail(name, f"invalid category '{cat}'", errors)

    pri = data.get("priority")
    if not isinstance(pri, int) or not (50 <= pri <= 150):
        fail(name, f"priority {pri} out of band [50,150]", errors)

    prompt = data.get("prompt", "")
    if PLACEHOLDER_RE.search(prompt):
        fail(name, "prompt contains placeholder (TBD/TODO/fill in/appropriate/similar to previous)", errors)
    for k in ("description", "details"):
        v = pi.get(k, "")
        if isinstance(v, str) and PLACEHOLDER_RE.search(v):
            fail(name, f"pipeline_inputs.{k} contains placeholder", errors)

    # T3-ui with prototype matched must have parity AC
    if tt == "T3-ui":
        scope = pi.get("scope_files", [])
        proto_ref = any(
            isinstance(s, str) and "design/Monopilot Design System" in s for s in scope
        )
        if proto_ref:
            ac_text = " ".join(ac) if isinstance(ac, list) else ""
            if "parity" not in ac_text.lower() and "prototype" not in ac_text.lower():
                fail(name, "T3-ui with prototype must include parity AC mentioning prototype", errors)


def main() -> int:
    files = sorted(TASK_DIR.glob("T-*.json"))
    if not files:
        print("ERROR: no task files found")
        return 1
    errors: list = []
    for p in files:
        validate(p, errors)
    manifest_path = ROOT / "manifest.json"
    coverage_path = ROOT / "coverage.md"
    if not manifest_path.exists():
        errors.append("manifest.json missing")
    else:
        try:
            m = json.loads(manifest_path.read_text())
            if m.get("task_count") != len(files):
                errors.append(
                    f"manifest task_count {m.get('task_count')} != actual {len(files)}"
                )
        except json.JSONDecodeError as e:
            errors.append(f"manifest.json invalid: {e}")
    if not coverage_path.exists():
        errors.append("coverage.md missing")
    else:
        if "❌ GAP" in coverage_path.read_text():
            errors.append("coverage.md has unresolved ❌ GAP rows")

    print(f"Tasks scanned: {len(files)}")
    print(f"Errors: {len(errors)}")
    for e in errors:
        print(f"  - {e}")
    if errors:
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
