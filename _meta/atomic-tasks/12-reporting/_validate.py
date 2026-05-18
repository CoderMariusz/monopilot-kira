#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (12-REPORTING module).

Runs the 12 shared checks from the SKILL.md self-review, plus:
- Checklist #16: parity AC for T3-ui tasks with matched prototype.
- Reporting #17: MV/read-model tasks must NOT write to other modules' tables (consumer-only pattern).
- Reporting #18: Long-running query tasks must declare apps/worker dispatch (cite foundation T-111).
- Reporting #19: Permission-enum task must contain rpt.*.* or reporting.*.* permission strings.
- Reporting #20: PII-handling tasks (export, raw row dump) must declare a "no raw PII" red-line.

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

# Reporting #17: MV/read-model tasks must not write to other-module tables.
# We flag INSERT INTO / UPDATE targeting known other-module table name prefixes.
# Tables owned by modules other than reporting:
OTHER_MODULE_TABLE_PREFIXES = [
    # 08-production
    "work_orders", "wo_outputs", "wo_consumptions", "production_runs",
    # 09-quality
    "quality_checks", "quality_holds", "hold_items", "qa_",
    # 10-finance
    "invoices", "cost_allocations", "invoice_lines", "financial_",
    # 05-warehouse
    "license_plates", "stock_locations", "movements", "warehouse_",
    # 15-oee
    "oee_", "downtime_events", "line_performance",
    # 11-shipping
    "shipments", "sales_orders", "shipping_",
    # 13-maintenance
    "maintenance_", "work_orders_maint",
]
# We look for INSERT INTO <table> or UPDATE <table> patterns referencing any of the above
MV_WRITE_RE_LIST = [
    re.compile(r"INSERT\s+INTO\s+" + re.escape(t), re.I)
    for t in OTHER_MODULE_TABLE_PREFIXES
] + [
    re.compile(r"UPDATE\s+" + re.escape(t), re.I)
    for t in OTHER_MODULE_TABLE_PREFIXES
]

# Reporting #17: Is this an MV / read-model task?
MV_TASK_RE = re.compile(
    r"\bMATERIALIZED\s+VIEW\b|\bmv_[a-z]|\bread.?model\b|\bread_model\b|REFRESH\s+MATERIALIZED",
    re.I,
)

# Reporting #18: Long-running / heavy query tasks must dispatch to worker
LONG_QUERY_RE = re.compile(
    r"long.running|heavy.query|bulk.export|csv.export|pdf.export|"
    r"large.dataset|background.job|async.report|timeout.*report|"
    r"worker.*dispatch|dispatch.*worker",
    re.I,
)
WORKER_DISPATCH_RE = re.compile(
    r"apps/worker|worker.*dispatch|T-?111|foundation.*T-?111|"
    r"background.queue|job.queue|async.*export|dispatch.*queue",
    re.I,
)

# Reporting #19: permission prefix patterns
RPT_PERM_RE = re.compile(r"^rpt\.[a-z_]+\.[a-z_]+$")
REPORTING_PERM_RE = re.compile(r"^reporting\.[a-z_]+\.[a-z_]+$")

# Reporting #20: PII export tasks must carry no-raw-PII red-line
PII_EXPORT_TASK_RE = re.compile(
    r"export.*csv|csv.*export|export.*pdf|pdf.*export|"
    r"raw.*row|dump.*row|row.*dump|pii.*export|export.*pii|"
    r"rpt\.export\.|data.*download",
    re.I,
)
NO_RAW_PII_RE = re.compile(
    r"no\s+raw\s+pii|no.*pii.*in.*export|pii.*redact|redact.*pii|"
    r"anonymi[sz]e.*export|export.*anonymi[sz]e|mask.*pii|pii.*mask",
    re.I,
)

ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}


def fail(failures: list[str], msg: str) -> None:
    failures.append(msg)


def _is_perm_enum_task(pi: dict[str, Any]) -> bool:
    """Return True if this is the permissions-enum task."""
    subcat = (pi.get("subcategory", "") or "").lower()
    return "perm" in subcat or "enum" in subcat


def _is_mv_or_read_model_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task is building or refreshing a materialized view / read model."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("details", "") or "")
    )
    return bool(MV_TASK_RE.search(combined))


def _is_long_running_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task involves long-running / async report generation."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (pi.get("description", "") or "")
        + " " + (pi.get("details", "") or "")
    )
    # Only flag if also an API / wiring task (not MV DDL or schema-only)
    task_type = pi.get("task_type", "") or ""
    return (
        task_type in ("T2-api", "T4-wiring-test")
        and bool(LONG_QUERY_RE.search(combined))
        and "worker" not in (pi.get("subcategory", "") or "").lower()  # worker tasks themselves are exempt
    )


def _is_pii_export_task(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task handles CSV/PDF export or raw row dumps (PII risk)."""
    combined = (
        (data.get("prompt", "") or "")
        + " " + (data.get("title", "") or "")
        + " " + (pi.get("description", "") or "")
    )
    return bool(PII_EXPORT_TASK_RE.search(combined))


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
    # REPORTING-SPECIFIC CHECKS
    # -------------------------------------------------------------------------

    prompt_text = data.get("prompt", "") or ""
    rl_text = " ".join(rl) if isinstance(rl, list) else ""

    # Reporting #17: MV/read-model tasks must NOT write to other modules' tables
    if _is_mv_or_read_model_task(data, pi):
        forbidden_writes = [
            pattern.pattern
            for pattern in MV_WRITE_RE_LIST
            if pattern.search(prompt_text)
        ]
        if forbidden_writes:
            # Shorten pattern strings for readability
            short = [p.split(r"\s+")[2] for p in forbidden_writes[:3]]
            fail(failures, (
                f"{path.name}: MV/read-model task contains INSERT INTO or UPDATE targeting "
                f"non-reporting table(s) — reporting is consumer-only (no writes to other modules): "
                f"{short}"
            ))

    # Reporting #18: Long-running query tasks must declare apps/worker dispatch (cite T-111)
    if _is_long_running_task(data, pi):
        full_text = prompt_text + " " + rl_text + " " + (pi.get("details", "") or "")
        if not WORKER_DISPATCH_RE.search(full_text):
            fail(failures, (
                f"{path.name}: long-running/bulk-export API task does not declare worker dispatch "
                f"(must cite apps/worker or foundation T-111); synchronous compute in request path "
                f"is forbidden for reports that may time out — dispatch to background queue"
            ))

    # Reporting #19: perm-enum task must list rpt.*.* (or reporting.*.*) permission strings
    if _is_perm_enum_task(pi):
        rpt_perms = re.findall(r"\brpt\.[a-z_]+\.[a-z_]+\b", prompt_text)
        reporting_perms = re.findall(r"\breporting\.[a-z_]+\.[a-z_]+\b", prompt_text)
        all_perms = rpt_perms + reporting_perms
        if not all_perms:
            fail(failures, (
                f"{path.name}: perm-enum task appears to define reporting permissions "
                f"but no rpt.*.* or reporting.*.* strings found in prompt"
            ))
        else:
            bad_rpt = [s for s in rpt_perms if not RPT_PERM_RE.match(s)]
            bad_rep = [s for s in reporting_perms if not REPORTING_PERM_RE.match(s)]
            if bad_rpt or bad_rep:
                fail(failures, (
                    f"{path.name}: reporting permission strings with invalid format: "
                    f"{(bad_rpt + bad_rep)[:5]}"
                ))
            # Flag if task uses BOTH rpt.* and reporting.* namespaces (mixed namespace)
            if rpt_perms and reporting_perms:
                fail(failures, (
                    f"{path.name}: perm-enum task uses both 'rpt.*' and 'reporting.*' namespaces "
                    f"(R2: rpt.* is the canonical alias; pick one namespace consistently — "
                    f"found rpt.*: {rpt_perms[:2]}, reporting.*: {reporting_perms[:2]})"
                ))

    # Reporting #20: PII-handling tasks (export, raw row dump) must declare no-raw-PII red-line
    if _is_pii_export_task(data, pi):
        if not NO_RAW_PII_RE.search(prompt_text + " " + rl_text):
            fail(failures, (
                f"{path.name}: PII-handling export/dump task does not declare a "
                f"'no raw PII in exports' red-line — export and row-dump tasks must "
                f"explicitly assert PII redaction/anonymization in risk_red_lines or prompt"
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
    print(f"[validate:12-reporting] {len(task_files)} task files inspected")
    if failures:
        print(f"[validate:12-reporting] {len(failures)} FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[validate:12-reporting] PASS — 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
