#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (10-FINANCE module).

Runs the 7 checks from the SKILL.md self-review, plus:
- Checklist #16: parity AC for T3-ui tasks with matched prototype.
- Finance-specific #17: money fields (NUMERIC with explicit precision) on schema tasks.
- Finance-specific #18: D365 export-only red-line on integration/wiring tasks.
- Finance-specific #19: fin.*.* permission prefix on the perm-enum task (T1-schema
  with subcategory permissions-enum).

Exit code 0 only when 0 failures.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).parent
TASK_DIR = ROOT / "tasks"
COVERAGE_FILE = ROOT / "coverage.md"
MANIFEST_FILE = ROOT / "manifest.json"

REQUIRED_TOP_LEVEL = {
    "title", "prompt", "labels", "priority", "max_attempts",
    "pipeline_name", "pipeline_inputs",
}
FORBIDDEN_TOP_LEVEL = {
    "task_id", "status", "project_id", "created_at", "updated_at",
    "expansion_status", "step_name", "pipeline_run_id",
    "claimed_by_terminal_id", "claim_token", "lease_until",
}
REQUIRED_PIPELINE_INPUTS = {
    "root_path", "description", "details", "scope_files",
    "acceptance_criteria", "test_strategy", "risk_red_lines",
    "skills", "checkpoint_policy",
}
PLACEHOLDER_PATTERNS = [
    r"\bTBD\b", r"\bTODO\b", r"\bfill in\b",
    r"\bappropriate\b", r"\bsimilar to previous\b",
]
PROTOTYPE_PARITY_RE = re.compile(
    r"prototypes/design/Monopilot Design System/[^:`]+:\d+(?:-\d+)?",
)

# Finance-specific: bare NUMERIC without precision e.g. NUMERIC not NUMERIC(p,s)
BARE_NUMERIC_RE = re.compile(r"\bNUMERIC\b(?!\s*\()")

# Finance-specific: D365 export-only contract in risk_red_lines
# Integration/wiring tasks must carry a red line asserting the dispatcher is export-only
# (does not mutate canonical state). We detect integration-domain tasks by subcategory or
# task_type=T4-wiring-test with "d365" present in the task body.
D365_EXPORT_ONLY_PATTERNS = [
    re.compile(r"export.?only", re.I),
    re.compile(r"must not mutate", re.I),
    re.compile(r"anti.?corruption", re.I),
    re.compile(r"R15", re.I),
    re.compile(r"no.*canonical.*state", re.I),
    re.compile(r"not.*mutate.*state", re.I),
]

# Finance-specific: fin.*.* permission prefix pattern
FIN_PERM_RE = re.compile(r"^fin\.[a-z_]+\.[a-z_]+$")

ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}


def fail(failures: list[str], msg: str) -> None:
    failures.append(msg)


def _is_d365_integration_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if this task is a D365 integration / wiring task."""
    subcat = pi.get("subcategory", "") or ""
    task_type = pi.get("task_type", "") or ""
    prompt_lower = (data.get("prompt", "") or "").lower()
    labels = data.get("labels", []) or []
    return (
        "d365" in subcat.lower()
        or "outbox" in subcat.lower()
        or "consolidat" in subcat.lower()
        or "integration" in subcat.lower()
        or "dispatcher" in subcat.lower()
        or (task_type == "T4-wiring-test" and "d365" in prompt_lower)
        or "integration" in labels
        or (task_type in ("T2-api", "T4-wiring-test") and "d365" in prompt_lower and "dispatch" in prompt_lower)
    )


def _is_perm_enum_task(pi: dict[str, Any]) -> bool:
    """Return True if this is the permissions-enum task."""
    subcat = (pi.get("subcategory", "") or "").lower()
    return "perm" in subcat or "enum" in subcat


def validate_task(path: pathlib.Path, failures: list[str]) -> None:
    try:
        data = json.loads(path.read_text())
    except Exception as e:
        fail(failures, f"{path.name}: invalid JSON ({e})")
        return

    # Check 1: required top-level
    missing = REQUIRED_TOP_LEVEL - set(data.keys())
    if missing:
        fail(failures, f"{path.name}: missing top-level fields: {sorted(missing)}")

    # Check 2: pipeline_name
    if data.get("pipeline_name") != "kira_dev":
        fail(failures, f"{path.name}: pipeline_name must be 'kira_dev'")

    # Check 3: forbidden top-level
    forbidden = FORBIDDEN_TOP_LEVEL & set(data.keys())
    if forbidden:
        fail(failures, f"{path.name}: forbidden top-level fields: {sorted(forbidden)}")

    # Check 4: pipeline_inputs required keys + non-empty
    pi = data.get("pipeline_inputs", {})
    if not isinstance(pi, dict):
        fail(failures, f"{path.name}: pipeline_inputs must be object")
        return
    missing_pi = REQUIRED_PIPELINE_INPUTS - set(pi.keys())
    if missing_pi:
        fail(failures, f"{path.name}: missing pipeline_inputs: {sorted(missing_pi)}")
    for k in REQUIRED_PIPELINE_INPUTS:
        v = pi.get(k)
        if v is None or (isinstance(v, (str, list, dict)) and len(v) == 0):
            fail(failures, f"{path.name}: pipeline_inputs.{k} empty")

    # root_path absolute
    rp = pi.get("root_path", "")
    if not (isinstance(rp, str) and rp.startswith("/")):
        fail(failures, f"{path.name}: pipeline_inputs.root_path must be absolute")

    # prd_task_id must match filename
    prd_task_id = pi.get("prd_task_id", "")
    expected_id = path.stem  # e.g. "T-001"
    if prd_task_id != expected_id:
        fail(failures, f"{path.name}: prd_task_id '{prd_task_id}' must match filename '{expected_id}'")

    # Check 5: placeholder patterns in prompt + details + description + AC
    haystack_parts = [data.get("prompt", "")]
    haystack_parts.append(pi.get("details", "") or "")
    haystack_parts.append(pi.get("description", "") or "")
    for ac in pi.get("acceptance_criteria", []) or []:
        haystack_parts.append(ac)
    haystack = "\n".join(str(p) for p in haystack_parts)
    for pat in PLACEHOLDER_PATTERNS:
        if re.search(pat, haystack, flags=re.IGNORECASE):
            fail(failures, f"{path.name}: placeholder pattern matched: {pat}")

    # Check 6: acceptance_criteria count 1..4
    acs = pi.get("acceptance_criteria", []) or []
    if not isinstance(acs, list):
        fail(failures, f"{path.name}: acceptance_criteria must be list")
    elif len(acs) > 4:
        fail(failures, f"{path.name}: >4 acceptance_criteria ({len(acs)})")
    elif len(acs) == 0:
        fail(failures, f"{path.name}: 0 acceptance_criteria")

    # Check 7: task_type allowed
    task_type = pi.get("task_type", "")
    if task_type not in ALLOWED_TASK_TYPES:
        fail(failures, f"{path.name}: task_type must be one of {sorted(ALLOWED_TASK_TYPES)} (got {task_type!r})")

    # Check 8: checkpoint_policy.required_checkpoints present
    cp = pi.get("checkpoint_policy", {})
    if not isinstance(cp, dict) or not cp.get("required_checkpoints"):
        fail(failures, f"{path.name}: checkpoint_policy.required_checkpoints missing")

    # Check 9: priority in 30..150 (finance includes p0-blockers at 30)
    pri = data.get("priority")
    if not isinstance(pri, int) or not (30 <= pri <= 150):
        fail(failures, f"{path.name}: priority must be int 30..150 (got {pri!r})")

    # Check 10: scope_files entries carry [create] or [modify] annotations
    scope_files = pi.get("scope_files", []) or []
    if isinstance(scope_files, list):
        for sf in scope_files:
            if isinstance(sf, str) and not re.search(r"\[(create|modify)\]", sf, re.I):
                fail(failures, f"{path.name}: scope_files entry missing [create]/[modify]: {sf!r}")

    # Check 11: risk_red_lines must have ≥2 entries
    rl = pi.get("risk_red_lines", []) or []
    if not isinstance(rl, list) or len(rl) < 2:
        fail(failures, f"{path.name}: risk_red_lines must have ≥2 entries (got {len(rl) if isinstance(rl, list) else '?'})")

    # Check 12: T3-ui with prototype_match=true → parity AC + ui_evidence_policy
    is_ui = task_type == "T3-ui"
    has_prototype_match = pi.get("prototype_match", False)
    if is_ui and has_prototype_match:
        joined_ac = "\n".join(str(a) for a in acs)
        if not PROTOTYPE_PARITY_RE.search(joined_ac):
            fail(failures, f"{path.name}: T3-ui with prototype_match=true lacks parity AC naming 'prototypes/design/Monopilot Design System/<path>:<lines>'")
        if "parity" not in joined_ac.lower():
            fail(failures, f"{path.name}: T3-ui parity AC must reference 'parity' explicitly")
        if not pi.get("ui_evidence_policy"):
            fail(failures, f"{path.name}: T3-ui with prototype_match=true requires ui_evidence_policy field")
        if not pi.get("prototype_index_entry"):
            fail(failures, f"{path.name}: T3-ui with prototype_match=true requires prototype_index_entry field")
        prompt_text = data.get("prompt", "")
        if "## Prototype parity" not in prompt_text:
            fail(failures, f"{path.name}: T3-ui with prototype_match=true must include '## Prototype parity' section in prompt")

    # -------------------------------------------------------------------------
    # FINANCE-SPECIFIC CHECKS
    # -------------------------------------------------------------------------

    # Finance #17: schema tasks (T1-schema) must use NUMERIC with explicit precision
    # (bare NUMERIC without (p,s) is a finance smell — amounts/rates must have scale).
    if task_type == "T1-schema":
        prompt_text = data.get("prompt", "")
        bare_hits = BARE_NUMERIC_RE.findall(prompt_text)
        if bare_hits:
            fail(failures, (
                f"{path.name}: T1-schema task contains bare NUMERIC without precision "
                f"(x{len(bare_hits)}); finance money fields must declare NUMERIC(p,s) explicitly "
                f"(e.g. NUMERIC(15,4) for cost, NUMERIC(15,6) for rates)"
            ))

    # Finance #18: D365 integration / wiring tasks must carry an export-only red line
    if _is_d365_integration_task(data, pi):
        rl_text = " ".join(rl) if isinstance(rl, list) else ""
        has_export_only = any(p.search(rl_text) for p in D365_EXPORT_ONLY_PATTERNS)
        if not has_export_only:
            fail(failures, (
                f"{path.name}: D365 integration task is missing an export-only red-line "
                f"(must assert dispatcher does not mutate canonical Monopilot state / R15 "
                f"anti-corruption contract; patterns: export-only|must not mutate|anti-corruption|R15)"
            ))

    # Finance #19: perm-enum task must list fin.*.* permission strings
    if _is_perm_enum_task(pi):
        prompt_text = data.get("prompt", "")
        fin_perms = re.findall(r"\bfin\.[a-z_]+\.[a-z_]+\b", prompt_text)
        if not fin_perms:
            fail(failures, (
                f"{path.name}: perm-enum task appears to define finance permissions "
                f"but no fin.*.* strings found in prompt"
            ))
        else:
            # Check all found strings match the canonical pattern
            bad = [s for s in fin_perms if not FIN_PERM_RE.match(s)]
            if bad:
                fail(failures, (
                    f"{path.name}: finance permission strings not matching ^fin\\.[a-z_]+\\.[a-z_]+$: {bad[:5]}"
                ))


def validate_manifest(failures: list[str]) -> dict[str, Any]:
    if not MANIFEST_FILE.exists():
        fail(failures, "manifest.json missing")
        return {}
    try:
        m = json.loads(MANIFEST_FILE.read_text())
    except Exception as e:
        fail(failures, f"manifest.json invalid: {e}")
        return {}
    expected = {p.name for p in TASK_DIR.glob("T-*.json")}
    listed = {pathlib.Path(t).name for t in m.get("tasks", [])}
    if expected != listed:
        missing = expected - listed
        extra = listed - expected
        if missing:
            fail(failures, f"manifest.json missing tasks: {sorted(missing)}")
        if extra:
            fail(failures, f"manifest.json lists nonexistent tasks: {sorted(extra)}")
    task_count = m.get("task_count")
    actual_count = len(list(TASK_DIR.glob("T-*.json")))
    if task_count is not None and int(task_count) != actual_count:
        fail(failures, f"manifest.json task_count={task_count} but {actual_count} T-*.json files found")
    if m.get("pipeline_name") != "kira_dev":
        fail(failures, "manifest.json pipeline_name must be 'kira_dev'")
    return m


def validate_coverage(failures: list[str]) -> None:
    if not COVERAGE_FILE.exists():
        fail(failures, "coverage.md missing")
        return
    text = COVERAGE_FILE.read_text()
    if "❌ GAP" in text:
        fail(failures, "coverage.md contains unresolved '❌ GAP' rows")


def main() -> int:
    failures: list[str] = []
    validate_manifest(failures)
    validate_coverage(failures)
    task_files = sorted(TASK_DIR.glob("T-*.json"))
    if not task_files:
        fail(failures, "no T-*.json task files found")
    for p in task_files:
        validate_task(p, failures)
    print(f"[validate:10-finance] {len(task_files)} task files inspected")
    if failures:
        print(f"[validate:10-finance] {len(failures)} FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[validate:10-finance] PASS — 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
