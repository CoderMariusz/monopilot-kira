#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (11-SHIPPING module).

Runs the 12 shared checks from the SKILL.md self-review, plus:
- Checklist #16: parity AC for T3-ui tasks with matched prototype.
- Shipping #17: SSCC/label tasks must cite organizations.gs1_company_prefix from 02-settings (no local config).
- Shipping #18: D365 dispatcher integration tasks must carry the export-only/R15 anti-corruption red-line.
- Shipping #19: Permission-enum task must contain ship.*.* permission strings.
- Shipping #20: Quality-hold consume gate tasks (consumers of 09-QA T-064) must cite it in cross_module_dependencies.
- Shipping #21: POD (proof-of-delivery) tasks must mention SHA-256 + 7y retention (BRCGS).

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

# Shipping #17: SSCC/GS1 label tasks must NOT local-configure the prefix
GS1_LOCAL_CONFIG_RE = re.compile(
    r"gs1_company_prefix\s*=|local.*gs1|hardcode.*gs1|config\.gs1_company_prefix",
    re.I,
)
GS1_SETTINGS_REF_RE = re.compile(
    r"organizations\.gs1_company_prefix|02.settings.*gs1|settings.*gs1_company_prefix",
    re.I,
)

# Shipping #18: D365 export-only contract in risk_red_lines (same as 10-finance)
D365_EXPORT_ONLY_PATTERNS = [
    re.compile(r"export.?only", re.I),
    re.compile(r"must not mutate", re.I),
    re.compile(r"anti.?corruption", re.I),
    re.compile(r"R15", re.I),
    re.compile(r"no.*canonical.*state", re.I),
    re.compile(r"not.*mutate.*state", re.I),
]

# Shipping #19: ship.*.* permission prefix pattern
SHIP_PERM_RE = re.compile(r"^ship\.[a-z_]+\.[a-z_]+$")

# Shipping #20: quality-hold gate — 09-quality T-064 cross-module dep
QA_T064_REF_RE = re.compile(r"09.quality/T-?064|09-quality.*T-?064|T-?064.*09.quality", re.I)

# Shipping #21: POD tasks — SHA-256 + 7y/7 year retention (BRCGS)
POD_SHA256_RE = re.compile(r"sha.?256|sha256", re.I)
POD_RETENTION_RE = re.compile(r"7\s*y(?:ear)?|7-year|retention.*7|brcgs.*retention|retention.*brcgs", re.I)

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


def _is_sscc_label_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if this task involves SSCC or GS1 label generation."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("details", "") or "")
    ).lower()
    return "sscc" in combined or "gs1" in combined or "label" in combined and "sscc" in combined


def _is_pod_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if this task involves proof of delivery."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
    ).lower()
    return (
        "proof of delivery" in combined
        or "proof-of-delivery" in combined
        or "pod" in combined and "delivery" in combined
        or "bol" in combined and "sign" in combined
        or "signed bol" in combined
        or "ship.bol.sign" in combined
    )


def _is_quality_hold_consumer(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if this task consumes quality hold gate from 09-QA."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("details", "") or "")
    ).lower()
    return (
        "quality_hold" in combined
        or "quality hold" in combined
        or "evaluatelpforshipping" in combined
        or "v_active_holds" in combined
        or "critical.*hold" in combined
        or bool(re.search(r"qa.*hold|hold.*qa", combined))
    )


def _cross_module_dep_text(pi: dict[str, Any]) -> str:
    """Return stringified cross_module_dependencies for pattern search."""
    cross = pi.get("cross_module_dependencies")
    if not cross:
        return ""
    if isinstance(cross, list):
        parts = []
        for c in cross:
            if isinstance(c, dict):
                parts.append(str(c.get("task_id", "")) + " " + str(c.get("reason", "")))
            else:
                parts.append(str(c))
        return " ".join(parts)
    return str(cross)


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
    expected_id = path.stem
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

    # Check 9: priority in 30..150
    pri = data.get("priority")
    if not isinstance(pri, int) or not (30 <= pri <= 150):
        fail(failures, f"{path.name}: priority must be int 30..150 (got {pri!r})")

    # Check 10: scope_files entries carry [create] or [modify] annotations
    scope_files = pi.get("scope_files", []) or []
    if isinstance(scope_files, list):
        for sf in scope_files:
            if isinstance(sf, str) and not re.search(r"\[(create|modify|ref|verify)\]", sf, re.I):
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
    # SHIPPING-SPECIFIC CHECKS
    # -------------------------------------------------------------------------

    prompt_text = data.get("prompt", "") or ""
    rl_text = " ".join(rl) if isinstance(rl, list) else ""
    cross_text = _cross_module_dep_text(pi)

    # Shipping #17: SSCC/GS1 label tasks must cite organizations.gs1_company_prefix from 02-settings
    if _is_sscc_label_task(data, pi):
        if GS1_LOCAL_CONFIG_RE.search(prompt_text):
            fail(failures, (
                f"{path.name}: SSCC/label task appears to local-configure gs1_company_prefix "
                f"instead of reading from organizations.gs1_company_prefix (02-settings); "
                f"GS1 prefix must never be hardcoded or set via local config"
            ))
        if not GS1_SETTINGS_REF_RE.search(prompt_text + " " + cross_text):
            fail(failures, (
                f"{path.name}: SSCC/label task does not cite organizations.gs1_company_prefix "
                f"from 02-settings — the GS1 company prefix MUST come from the organizations "
                f"table (02-settings), never from local config or hardcoded value"
            ))

    # Shipping #18: D365 integration / wiring tasks must carry an export-only red line
    if _is_d365_integration_task(data, pi):
        has_export_only = any(p.search(rl_text) for p in D365_EXPORT_ONLY_PATTERNS)
        if not has_export_only:
            fail(failures, (
                f"{path.name}: D365 integration task is missing an export-only red-line "
                f"(must assert dispatcher does not mutate canonical Monopilot state / R15 "
                f"anti-corruption contract; patterns: export-only|must not mutate|anti-corruption|R15)"
            ))

    # Shipping #19: perm-enum task must list ship.*.* permission strings
    if _is_perm_enum_task(pi):
        ship_perms = re.findall(r"\bship\.[a-z_]+\.[a-z_]+\b", prompt_text)
        if not ship_perms:
            fail(failures, (
                f"{path.name}: perm-enum task appears to define shipping permissions "
                f"but no ship.*.* strings found in prompt"
            ))
        else:
            bad = [s for s in ship_perms if not SHIP_PERM_RE.match(s)]
            if bad:
                fail(failures, (
                    f"{path.name}: shipping permission strings not matching ^ship\\.[a-z_]+\\.[a-z_]+$: {bad[:5]}"
                ))

    # Shipping #20: quality-hold consumer tasks must cite 09-quality T-064 in cross_module_dependencies
    if _is_quality_hold_consumer(data, pi):
        if not QA_T064_REF_RE.search(cross_text):
            fail(failures, (
                f"{path.name}: task consumes quality-hold gate but cross_module_dependencies "
                f"does not cite 09-quality/T-064 (the evaluateLpForShipping gate owned by QA); "
                f"shipping tasks that check holds must declare this dependency explicitly"
            ))

    # Shipping #21: POD (proof-of-delivery) / signed-BOL tasks must mention SHA-256 + 7y retention
    if _is_pod_task(data, pi):
        if not POD_SHA256_RE.search(prompt_text):
            fail(failures, (
                f"{path.name}: POD/signed-BOL task does not mention SHA-256 — "
                f"BRCGS audit trail requires SHA-256 integrity hash on uploaded documents"
            ))
        if not POD_RETENTION_RE.search(prompt_text + " " + rl_text):
            fail(failures, (
                f"{path.name}: POD/signed-BOL task does not declare 7-year retention (BRCGS §14.4); "
                f"risk_red_lines or prompt must assert retention period"
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
    print(f"[validate:11-shipping] {len(task_files)} task files inspected")
    if failures:
        print(f"[validate:11-shipping] {len(failures)} FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[validate:11-shipping] PASS — 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
