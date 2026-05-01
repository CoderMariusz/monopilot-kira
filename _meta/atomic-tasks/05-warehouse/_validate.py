#!/usr/bin/env python3
"""Validate ACP TaskCreate payloads for 05-warehouse decomposition."""
import json
import sys
import re
from pathlib import Path

ROOT = Path(__file__).parent
TASK_DIR = ROOT / "tasks"

REQUIRED_TOP = {"title", "prompt", "labels", "priority", "max_attempts", "pipeline_name", "pipeline_inputs"}
ALLOWED_TOP = REQUIRED_TOP  # ACP TaskCreate accepts only these
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
PLACEHOLDERS = [
    re.compile(r"\bTBD\b", re.I),
    re.compile(r"\bTODO\b"),
    re.compile(r"fill in", re.I),
    re.compile(r"\bappropriate\b", re.I),
    re.compile(r"similar to previous", re.I),
]
ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}
ALLOWED_CATEGORIES = {"ui", "api", "data", "infra", "auth", "docs", "test", "integration"}


def validate_task(path: Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as e:
        return [f"{path.name}: invalid JSON: {e}"]

    keys = set(data.keys())
    missing = REQUIRED_TOP - keys
    extra = keys - ALLOWED_TOP
    if missing:
        errors.append(f"{path.name}: missing top-level: {sorted(missing)}")
    if extra:
        errors.append(f"{path.name}: unexpected top-level: {sorted(extra)}")

    forbidden = keys & FORBIDDEN_TOP
    if forbidden:
        errors.append(f"{path.name}: forbidden top-level: {sorted(forbidden)}")

    if data.get("pipeline_name") != "kira_dev":
        errors.append(f"{path.name}: pipeline_name must be 'kira_dev', got {data.get('pipeline_name')!r}")

    pi = data.get("pipeline_inputs", {})
    if not isinstance(pi, dict):
        errors.append(f"{path.name}: pipeline_inputs not a dict")
        return errors

    pi_missing = [k for k in REQUIRED_PI if not pi.get(k)]
    if pi_missing:
        errors.append(f"{path.name}: pipeline_inputs missing/empty: {pi_missing}")

    rp = pi.get("root_path", "")
    if not isinstance(rp, str) or not rp.startswith("/"):
        errors.append(f"{path.name}: root_path must be absolute, got {rp!r}")

    # priority band 50-150
    pri = data.get("priority")
    if not isinstance(pri, int) or pri < 50 or pri > 150:
        errors.append(f"{path.name}: priority out of band [50,150]: {pri}")

    # max_attempts sane
    ma = data.get("max_attempts")
    if not isinstance(ma, int) or ma < 1 or ma > 10:
        errors.append(f"{path.name}: max_attempts out of band [1,10]: {ma}")

    # task_type valid
    tt = pi.get("task_type")
    if tt not in ALLOWED_TASK_TYPES:
        errors.append(f"{path.name}: invalid task_type: {tt!r}")

    cat = pi.get("category")
    if cat not in ALLOWED_CATEGORIES:
        errors.append(f"{path.name}: invalid category: {cat!r}")

    # AC count and content
    ac = pi.get("acceptance_criteria", [])
    if not isinstance(ac, list) or len(ac) == 0:
        errors.append(f"{path.name}: acceptance_criteria empty")
    elif len(ac) > 4:
        errors.append(f"{path.name}: acceptance_criteria > 4 (got {len(ac)})")

    # test_strategy non-empty
    ts = pi.get("test_strategy", [])
    if not isinstance(ts, list) or len(ts) == 0:
        errors.append(f"{path.name}: test_strategy empty")

    # scope_files non-empty
    sf = pi.get("scope_files", [])
    if not isinstance(sf, list) or len(sf) == 0:
        errors.append(f"{path.name}: scope_files empty")

    # risk_red_lines non-empty
    rrl = pi.get("risk_red_lines", [])
    if not isinstance(rrl, list) or len(rrl) == 0:
        errors.append(f"{path.name}: risk_red_lines empty")

    # skills non-empty
    skills = pi.get("skills", [])
    if not isinstance(skills, list) or len(skills) == 0:
        errors.append(f"{path.name}: skills empty")

    # checkpoint_policy required keys
    cp = pi.get("checkpoint_policy", {})
    if not isinstance(cp, dict):
        errors.append(f"{path.name}: checkpoint_policy not dict")
    else:
        if "required_checkpoints" not in cp or not cp["required_checkpoints"]:
            errors.append(f"{path.name}: checkpoint_policy.required_checkpoints missing")
        if "closeout_requires" not in cp or not cp["closeout_requires"]:
            errors.append(f"{path.name}: checkpoint_policy.closeout_requires missing")

    # placeholder grep on prompt + details
    haystacks = [
        ("prompt", data.get("prompt", "")),
        ("details", pi.get("details", "")),
        ("description", pi.get("description", "")),
    ]
    for field_name, hay in haystacks:
        if not isinstance(hay, str):
            continue
        for rx in PLACEHOLDERS:
            if rx.search(hay):
                errors.append(f"{path.name}: placeholder match in {field_name}: /{rx.pattern}/")

    # title format
    title = data.get("title", "")
    if not re.match(r"^T-\d{3} — ", title):
        errors.append(f"{path.name}: title must start with 'T-NNN — ', got {title!r}")

    # T3-ui or UI-flow T4 with prototype must have parity AC
    is_ui = tt == "T3-ui"
    parent = pi.get("parent_feature", "")
    has_proto = any(
        isinstance(s, str) and "design/Monopilot Design System" in s
        for s in sf
    )
    if is_ui and has_proto:
        ac_text = " ".join(ac if isinstance(ac, list) else [])
        if "design/Monopilot Design System" not in ac_text:
            errors.append(f"{path.name}: T3-ui with prototype must have parity AC referencing prototype path")

    return errors


def main() -> int:
    files = sorted(TASK_DIR.glob("T-*.json"))
    if not files:
        print("No tasks found in", TASK_DIR)
        return 1

    all_errors = []
    for f in files:
        errs = validate_task(f)
        all_errors.extend(errs)

    print(f"Validated {len(files)} tasks")
    if all_errors:
        print(f"FAIL: {len(all_errors)} errors")
        for e in all_errors:
            print(" -", e)
        return 1

    # Validate manifest
    manifest_path = ROOT / "manifest.json"
    if not manifest_path.exists():
        print("FAIL: manifest.json missing")
        return 1
    m = json.loads(manifest_path.read_text())
    expected_keys = {"source_prd", "root_path", "generated_at", "generator", "pipeline_name", "task_count", "tasks", "coverage_file"}
    if not expected_keys <= set(m.keys()):
        print(f"FAIL: manifest missing keys: {expected_keys - set(m.keys())}")
        return 1
    if m["task_count"] != len(files):
        print(f"FAIL: manifest task_count {m['task_count']} != files {len(files)}")
        return 1

    # coverage.md exists
    cov = ROOT / "coverage.md"
    if not cov.exists():
        print("FAIL: coverage.md missing")
        return 1

    print(f"PASS: {len(files)} tasks, manifest + coverage.md OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
