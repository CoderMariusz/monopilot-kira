#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (13-MAINTENANCE module).

Runs the 12 shared checks from the SKILL.md self-review, plus:
- Checklist #16: parity AC for T3-ui tasks with matched prototype.
- Maintenance #17: LOTO and calibration sign-off tasks must cite foundation T-124 e-sign in cross_module_dependencies.
- Maintenance #18: Downtime event tasks must declare outbox publication (cite foundation T-112) for OEE consumption.
- Maintenance #19: Permission-enum task must contain mnt.*.* permission strings.
- Maintenance #20: Spare-parts inventory tasks must reference 05-warehouse FK softly (no hard FK).
- Maintenance #21: Asset hierarchy tasks must follow the canonical noun chain (site→area→line→machine→component).

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

# Maintenance #17: LOTO / calibration sign-off tasks must cross-dep foundation T-124 (e-sign)
T124_ESIGN_RE = re.compile(r"T-?124|e.?sign|esign|foundation.*T-?124", re.I)

# Maintenance #18: Downtime event tasks must cite foundation T-112 (outbox)
T112_OUTBOX_RE = re.compile(r"T-?112|foundation.*T-?112|outbox.*T-?112|T-?112.*outbox", re.I)
OUTBOX_EMIT_RE = re.compile(
    r"outbox|publish.*event|event.*publish|enqueue.*downtime|downtime.*enqueue|"
    r"mwo\..*outbox|downtime.*event.*oee|oee.*downtime.*event",
    re.I,
)

# Maintenance #19: mnt.*.* permission prefix pattern
MNT_PERM_RE = re.compile(r"^mnt\.[a-z_]+\.[a-z_]+$")

# Maintenance #20: spare-parts tasks — soft FK check (no hard FK to 05-warehouse)
# Hard FK syntax patterns that would be violations
HARD_FK_WH_RE = re.compile(
    r"REFERENCES\s+(?:public\.)?(?:stock_locations|license_plates|warehouse_locations|"
    r"inventory_items|05.warehouse)\b",
    re.I,
)
# Soft reference patterns that are acceptable
SOFT_REF_WH_RE = re.compile(
    r"soft.*fk|no.*hard.*fk|no.*references.*warehouse|warehouse.*fk.*soft|"
    r"05.warehouse.*soft|soft.*reference.*warehouse|"
    r"stock_location_id.*uuid.*not.*references|uuid.*no.*fk",
    re.I,
)

# Maintenance #21: asset hierarchy noun chain
# Canonical: site → area → line → machine → component
ASSET_HIERARCHY_NOUNS = ["site", "area", "line", "machine", "component"]
ASSET_HIERARCHY_RE = re.compile(
    r"site.*area.*line.*machine.*component|"
    r"site\s*→\s*area\s*→\s*line\s*→\s*machine\s*→\s*component|"
    r"site\s*>\s*area\s*>\s*line\s*>\s*machine\s*>\s*component",
    re.I,
)

ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}


def fail(failures: list[str], msg: str) -> None:
    failures.append(msg)


def _is_perm_enum_task(pi: dict[str, Any]) -> bool:
    """Return True if this is the permissions-enum task."""
    subcat = (pi.get("subcategory", "") or "").lower()
    return "perm" in subcat or "enum" in subcat


def _is_loto_or_calibration_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task involves LOTO application/clearance or calibration sign-off."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("subcategory", "") or "")
    ).lower()
    return (
        "loto" in combined
        or "lockout" in combined
        or "tagout" in combined
        or "lock-out" in combined
        or "tag-out" in combined
        or ("calibrat" in combined and "sign" in combined)
        or ("calibrat" in combined and "certif" in combined)
        or "mnt.loto" in combined
        or "mnt.calib" in combined
    )


def _is_downtime_event_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task creates or publishes downtime events."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
    ).lower()
    return (
        "downtime" in combined
        and ("event" in combined or "outbox" in combined or "publish" in combined or "oee" in combined)
    )


def _is_spare_parts_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task involves spare-parts inventory."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("subcategory", "") or "")
    ).lower()
    return (
        "spare" in combined
        or "spare_part" in combined
        or "spare part" in combined
        or "mnt.spare" in combined
        or "stock_items" in combined and "maint" in combined
        or ("inventory" in combined and "maintenance" in combined)
    )


def _is_asset_hierarchy_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task defines or manages the asset hierarchy structure."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
    ).lower()
    return (
        "asset.*hierarch" in combined
        or "hierarch.*asset" in combined
        or bool(re.search(r"asset.*hierarch|hierarch.*asset", combined))
        or ("equipment" in combined and "hierarch" in combined)
        or ("site.*area.*line" in combined)
        or ("asset_nodes" in combined or "asset_tree" in combined)
        or ("mnt.asset" in combined and "hierarch" in combined)
        or ("component" in combined and "machine" in combined and "area" in combined)
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
    # MAINTENANCE-SPECIFIC CHECKS
    # -------------------------------------------------------------------------

    prompt_text = data.get("prompt", "") or ""
    rl_text = " ".join(rl) if isinstance(rl, list) else ""
    cross_text = _cross_module_dep_text(pi)

    # Maintenance #17: LOTO and calibration sign-off tasks must cite foundation T-124 e-sign
    if _is_loto_or_calibration_task(data, pi):
        if not T124_ESIGN_RE.search(cross_text + " " + prompt_text):
            fail(failures, (
                f"{path.name}: LOTO/calibration sign-off task does not cite foundation T-124 "
                f"(e-sign primitive) in cross_module_dependencies — LOTO apply/clear and "
                f"calibration certificate upload require the e-sign attestation from T-124; "
                f"add '00-foundation/T-124' to cross_module_dependencies"
            ))

    # Maintenance #18: Downtime event tasks must declare outbox publication (cite T-112)
    if _is_downtime_event_task(data, pi):
        has_t112 = T112_OUTBOX_RE.search(cross_text + " " + prompt_text)
        has_outbox = OUTBOX_EMIT_RE.search(prompt_text + " " + rl_text)
        if not has_t112 and not has_outbox:
            fail(failures, (
                f"{path.name}: downtime-event task does not declare outbox publication "
                f"(must cite foundation T-112 or declare outbox emit in prompt/red-lines); "
                f"15-OEE MTBF/MTTR consumers depend on mwo.*/downtime.* events — "
                f"add '00-foundation/T-112' to cross_module_dependencies"
            ))
        elif not has_t112:
            # Has outbox keyword but no explicit T-112 citation — softer warning
            fail(failures, (
                f"{path.name}: downtime-event task mentions outbox/publish but does not "
                f"explicitly cite foundation T-112 in cross_module_dependencies — "
                f"add '00-foundation/T-112' to make the dependency traceable"
            ))

    # Maintenance #19: perm-enum task must list mnt.*.* permission strings
    if _is_perm_enum_task(pi):
        mnt_perms = re.findall(r"\bmnt\.[a-z_]+\.[a-z_]+\b", prompt_text)
        if not mnt_perms:
            fail(failures, (
                f"{path.name}: perm-enum task appears to define maintenance permissions "
                f"but no mnt.*.* strings found in prompt"
            ))
        else:
            bad = [s for s in mnt_perms if not MNT_PERM_RE.match(s)]
            if bad:
                fail(failures, (
                    f"{path.name}: maintenance permission strings not matching ^mnt\\.[a-z_]+\\.[a-z_]+$: {bad[:5]}"
                ))

    # Maintenance #20: Spare-parts inventory tasks must reference 05-warehouse FK softly
    if _is_spare_parts_task(data, pi):
        if HARD_FK_WH_RE.search(prompt_text):
            fail(failures, (
                f"{path.name}: spare-parts task contains a hard FK REFERENCES to a 05-warehouse "
                f"table — maintenance spare-parts must reference warehouse via soft FK (uuid column "
                f"without REFERENCES constraint) to avoid cross-module coupling; "
                f"use a soft reference pattern per maintenance PRD"
            ))

    # Maintenance #21: Asset hierarchy tasks must follow PRD canonical noun chain
    # (site → area → line → machine → component)
    if _is_asset_hierarchy_task(data, pi):
        # Check that all 5 nouns appear in the prompt (order-sensitive via regex, or at minimum present)
        missing_nouns = [
            noun for noun in ASSET_HIERARCHY_NOUNS
            if noun not in prompt_text.lower()
        ]
        if missing_nouns:
            fail(failures, (
                f"{path.name}: asset-hierarchy task is missing canonical noun(s) from the "
                f"PRD hierarchy chain (site→area→line→machine→component): "
                f"absent={missing_nouns} — all 5 levels must appear in the prompt to ensure "
                f"the full hierarchy is addressed per PRD §X"
            ))
        elif not ASSET_HIERARCHY_RE.search(prompt_text):
            # Nouns present but not in canonical order — just flag if out of order
            # Find positions
            positions = {
                noun: prompt_text.lower().find(noun)
                for noun in ASSET_HIERARCHY_NOUNS
                if noun in prompt_text.lower()
            }
            ordered = sorted(positions.items(), key=lambda kv: kv[1])
            actual_order = [k for k, _ in ordered]
            if actual_order != ASSET_HIERARCHY_NOUNS:
                fail(failures, (
                    f"{path.name}: asset-hierarchy task mentions all 5 levels but not in "
                    f"canonical order (site→area→line→machine→component); "
                    f"found order: {' → '.join(actual_order)} — add a section explicitly "
                    f"stating the hierarchy chain in the prompt"
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
    print(f"[validate:13-maintenance] {len(task_files)} task files inspected")
    if failures:
        print(f"[validate:13-maintenance] {len(failures)} FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[validate:13-maintenance] PASS — 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
