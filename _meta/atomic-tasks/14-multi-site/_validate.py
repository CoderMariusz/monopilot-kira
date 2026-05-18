#!/usr/bin/env python3
"""Validator for prd-decompose-hybrid output (14-MULTI-SITE module).

Runs the 7 checks from the SKILL.md self-review, plus:
- Checklist #16: parity AC for T3-ui tasks with matched prototype.
- Multi-site #17: site context accessed via app.current_site_id() (not raw GUC) in
  T1-schema / T2-api tasks that mention site_id or site context.
- Multi-site #18: tenant-scoped T1-schema tables that add site_id column must include
  a composite (org_id, site_id) index entry in scope_files or prompt.
- Multi-site #19: schema/API tasks involving site/org context that lack a
  cross_module_dependencies entry to 00-foundation T-125 (withOrgContext foundation).

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

# Multi-site #17: raw GUC read patterns that should never appear outside the helper itself
RAW_GUC_SITE_RE = re.compile(r"current_setting\(['\"]app\.current_site_id['\"]", re.I)

# Multi-site #17: acceptable reference (the helper function call itself)
SITE_HELPER_RE = re.compile(r"app\.current_site_id\(\)", re.I)

# Multi-site #18: composite org+site index patterns
COMPOSITE_INDEX_RE = re.compile(r"org_id,\s*site_id|idx_\w+_org_site", re.I)

# Multi-site #19: cross-module dependency to T-125 in various formats
T125_REF_RE = re.compile(r"T-?125|withOrgContext", re.I)

ALLOWED_TASK_TYPES = {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test", "T5-seed", "docs"}


def fail(failures: list[str], msg: str) -> None:
    failures.append(msg)


def _has_t125_cross_dep(pi: dict[str, Any]) -> bool:
    """Return True if cross_module_dependencies mentions T-125 or withOrgContext."""
    cross = pi.get("cross_module_dependencies")
    if not cross:
        return False
    if isinstance(cross, list):
        for c in cross:
            if isinstance(c, dict):
                if T125_REF_RE.search(str(c.get("task_id", "")) + " " + str(c.get("reason", ""))):
                    return True
            elif isinstance(c, str):
                if T125_REF_RE.search(c):
                    return True
    elif isinstance(cross, str):
        return bool(T125_REF_RE.search(cross))
    return False


def _task_involves_site_context(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if task body deals with site_id or site-scoped context."""
    prompt = data.get("prompt", "") or ""
    desc = (pi.get("description", "") or "") + " " + (pi.get("details", "") or "")
    combined = (prompt + " " + desc).lower()
    return (
        "site_id" in combined
        or "current_site_id" in combined
        or "withsitecontext" in combined
        or "site context" in combined
        or "site-scoped" in combined
        or "site_access_policy" in combined
        or "session_site_context" in combined
    )


def _task_creates_site_table(data: dict[str, Any], pi: dict[str, Any]) -> bool:
    """Return True if a T1-schema task is adding a table with a site_id column."""
    scope = pi.get("scope_files", []) or []
    prompt = data.get("prompt", "") or ""
    has_new_table = any(
        "[create]" in sf and (sf.endswith(".sql [create]") or "migration" in sf.lower())
        for sf in scope if isinstance(sf, str)
    )
    has_site_col = "site_id" in prompt
    return has_new_table and has_site_col


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

    # Check 5: placeholder patterns
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

    # Check 9: priority range 30..150
    pri = data.get("priority")
    if not isinstance(pri, int) or not (30 <= pri <= 150):
        fail(failures, f"{path.name}: priority must be int 30..150 (got {pri!r})")

    # Check 10: scope_files [create]/[modify] annotations
    scope_files = pi.get("scope_files", []) or []
    if isinstance(scope_files, list):
        for sf in scope_files:
            if isinstance(sf, str) and not re.search(r"\[(create|modify)\]", sf, re.I):
                fail(failures, f"{path.name}: scope_files entry missing [create]/[modify]: {sf!r}")

    # Check 11: risk_red_lines ≥2
    rl = pi.get("risk_red_lines", []) or []
    if not isinstance(rl, list) or len(rl) < 2:
        fail(failures, f"{path.name}: risk_red_lines must have ≥2 entries (got {len(rl) if isinstance(rl, list) else '?'})")

    # Check 12: T3-ui + prototype_match
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
    # MULTI-SITE-SPECIFIC CHECKS
    # -------------------------------------------------------------------------

    prompt_text = data.get("prompt", "") or ""

    # Multi-site #17: site context must be accessed via app.current_site_id(), not raw GUC
    # Only flag tasks that actually reference site_id / site context (not T5-seed or docs tasks).
    if task_type in ("T1-schema", "T2-api", "T4-wiring-test") and _task_involves_site_context(data, pi):
        # If the task prompt directly reads the raw GUC (outside the setter/helper definition),
        # that is a violation. We allow it only in T-001 (which IS creating the helper).
        raw_guc_hits = RAW_GUC_SITE_RE.findall(prompt_text)
        helper_hits = SITE_HELPER_RE.findall(prompt_text)
        # If raw GUC reads > 0 but NOT also defining the helper function (i.e. not the
        # creator of the SECURITY DEFINER fn), flag it.
        is_helper_creator = (
            "CREATE FUNCTION app.current_site_id" in prompt_text
            or "SECURITY DEFINER" in prompt_text and "current_site_id" in prompt_text
        )
        if raw_guc_hits and not is_helper_creator:
            fail(failures, (
                f"{path.name}: raw GUC read current_setting('app.current_site_id') found in "
                f"task that should call app.current_site_id() helper instead "
                f"(multi-site context contract, T-001)"
            ))
        # For tasks that involve site_id but don't mention the helper at all (and are not
        # creating the helper), warn that they should reference the function.
        if not is_helper_creator and not helper_hits and "site_id" in prompt_text:
            # Only flag schema/API tasks that ALSO set up RLS policies (not pure data tasks
            # or tasks that are only creating data tables without their own RLS logic).
            if re.search(r"RLS|ROW LEVEL SECURITY|POLICY|withSiteContext|site-scoped", prompt_text):
                fail(failures, (
                    f"{path.name}: site-scoped task with RLS/policy does not reference "
                    f"app.current_site_id() helper — TypeScript code and policies must call "
                    f"the helper, not raw GUCs (multi-site context contract)"
                ))

    # Multi-site #18: T1-schema tasks that add a site_id column to operational tables
    # must include a composite (org_id, site_id) index (D-MS-13 mandatory index).
    if task_type == "T1-schema" and _task_creates_site_table(data, pi):
        has_composite_idx = COMPOSITE_INDEX_RE.search(prompt_text)
        if not has_composite_idx:
            fail(failures, (
                f"{path.name}: T1-schema adds site_id column but prompt has no composite "
                f"(org_id, site_id) index — D-MS-13 mandates this index on every "
                f"tenant-scoped table that adds site_id"
            ))

    # Multi-site #19: T1-schema / T2-api tasks with site or org context should cross-dep T-125
    # (the withOrgContext HOF in 00-foundation) because withSiteContext composes on top of it.
    # Exception: T-001 itself is the one that establishes the T-125 dependency.
    if task_type in ("T1-schema", "T2-api") and _task_involves_site_context(data, pi):
        if not _has_t125_cross_dep(pi) and path.stem != "T-001":
            fail(failures, (
                f"{path.name}: site/org-context task lacks cross_module_dependencies entry "
                f"to 00-foundation T-125 (withOrgContext HOF) — withSiteContext composes on "
                f"top of T-125; all site-scoped tasks must carry this cross-module dep"
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
    print(f"[validate:14-multi-site] {len(task_files)} task files inspected")
    if failures:
        print(f"[validate:14-multi-site] {len(failures)} FAILURES:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("[validate:14-multi-site] PASS — 0 failures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
