#!/usr/bin/env python3
"""
validate_wave.py — Foundation AppShell wave validator.

Validates every task JSON in this draft wave against the ACP TaskCreate shape,
the wave's house style (consistent with the README), and the wave's UI parity
fail-closed policy. Also asserts manifest / import-request consistency.

Exit codes:
  0 — all checks pass.
  1 — one or more validation failures (printed grouped per file).

Usage:
  python3 validate_wave.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

WAVE_DIR = Path(__file__).resolve().parent
TASKS_DIR = WAVE_DIR / "tasks"
MANIFEST_PATH = WAVE_DIR / "manifest.json"
IMPORT_REQUEST_PATH = WAVE_DIR / "import-request.draft.json"

EXPECTED_ROOT_PATH = "/Users/mariuszkrawczyk/Projects/monopilot-kira"
EXPECTED_PIPELINE = "kira_dev"
EXPECTED_WAVE = "app-shell-foundation-20260520"

ALLOWED_TOP_LEVEL_KEYS = {
    "title",
    "prompt",
    "labels",
    "priority",
    "max_attempts",
    "pipeline_name",
    "pipeline_inputs",
}

REQUIRED_TOP_LEVEL_KEYS = ALLOWED_TOP_LEVEL_KEYS  # all 7 are required

FORBIDDEN_TOP_LEVEL_KEYS = {
    "id",
    "task_id",
    "uuid",
    "status",
    "state",
    "attempt",
    "attempts",
    "created_at",
    "updated_at",
    "human_task_id",  # belongs only in pipeline_inputs
    "display_task_id",
    "prd_task_id",
    "root_path",
    "wave",
    "source_prd",
    "category",
    "task_type",
    "dependencies",
    "description",
    "details",
    "acceptance_criteria",
    "test_strategy",
    "skills",
    "checkpoint_policy",
}

REQUIRED_PIPELINE_INPUT_KEYS = {
    "root_path",
    "prd_task_id",
    "human_task_id",
    "display_task_id",
    "source_prd",
    "task_type",
    "wave",
    "acceptance_criteria",
    "test_strategy",
    "scope_files",
    "out_of_scope",
    "risk_red_lines",
    "skills",
    "checkpoint_policy",
}

# Patterns that flag literal "fill me in later" sentinels, not English prose.
# - "T-XXX" appears as a metavariable in prose (e.g. "T-XXX.json outside this
#   wave") — XXX is only flagged when it stands alone, not preceded by "-".
# - The English noun "placeholder" / abbreviation "TBD" appear legitimately
#   in narrative ("static placeholder for T-020", "scanner auth model TBD by
#   scanner module") and are NOT flagged. Genuine unfilled sentinels use
#   the explicit patterns below.
PLACEHOLDER_PATTERNS = [
    re.compile(r"\bTODO\(\s*\)"),  # empty TODO
    re.compile(r"\bFIXME\b"),
    re.compile(r"(?<![A-Za-z\-])XXX(?![A-Za-z])"),
    re.compile(r"<\s*INSERT[^>]*>"),
    re.compile(r"\$\{[A-Z_]+\}"),  # ${ENV_VAR} literals in prompts
    re.compile(r"\blorem ipsum\b", re.IGNORECASE),
]

# Domain-specific TODO refs that are legitimate (cross-module placeholders).
ALLOWED_TODO_SUBSTRINGS = [
    "TODO(multi-site/T-020)",
    "TODO(multi-site/14-multi-site/T-020)",
    "TODO(rbac/02-settings/T-130)",
    "TODO(rbac/02-settings/T-130/T-131)",
    "TODO(scanner-module)",
]

UI_CLOSEOUT_REQUIRED = {
    "screenshots",
    "screenshot_or_dom_diff_artifacts",
    "visual_parity_evidence",
    "prototype_reference",
    "console_network_check",
    "acceptance_criteria_status",
    "test_commands_and_results",
    "changed_files",
    "git_status",
    "deviations_from_prototype",
}

UI_BLOCKING_STATES = {"ui_parity_evidence_missing"}

# T-136 browser error-discovery specific failure-condition keywords that MUST
# appear (case-insensitive) somewhere in the prompt or pipeline_inputs JSON.
T136_REQUIRED_KEYWORDS = [
    "pageerror",
    "console.error",
    "requestfailed",
    "404",
    "500",
    "hydration",
    "missing landmark",
    "wrong active nav",
    "wrong localized redirect",
    "recommended_followups",
]

# Strings that imply T-136 is actually calling out to ACP rather than just
# describing the prohibition. We only flag a fetch/POST style usage.
T136_FORBIDDEN_PATTERNS = [
    re.compile(r"fetch\(['\"][^'\"]*acp", re.IGNORECASE),
    re.compile(r"taskCreate\s*\("),
    re.compile(r"POST\s+/api/acp", re.IGNORECASE),
]


def is_ui_task(payload: dict) -> bool:
    pi = payload.get("pipeline_inputs", {})
    task_type = pi.get("task_type", "")
    category = pi.get("category", "")
    return task_type == "T3-ui" or category == "ui"


def collect_placeholder_hits(text: str) -> list[str]:
    hits: list[str] = []
    for pat in PLACEHOLDER_PATTERNS:
        for m in pat.finditer(text):
            hits.append(m.group(0))
    return hits


def disallowed_todo_tokens(text: str) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r"TODO\([^)]*\)", text):
        token = m.group(0)
        if any(allowed in token for allowed in ALLOWED_TODO_SUBSTRINGS):
            continue
        if token == "TODO()":  # empty TODO already caught above; included for clarity
            out.append(token)
            continue
        # Unknown TODO ref token — flag.
        out.append(token)
    return out


def validate_task_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        with path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"]

    if not isinstance(payload, dict):
        return ["root must be an object"]

    keys = set(payload.keys())

    missing = REQUIRED_TOP_LEVEL_KEYS - keys
    if missing:
        errors.append(f"missing required top-level keys: {sorted(missing)}")

    extra = keys - ALLOWED_TOP_LEVEL_KEYS
    if extra:
        errors.append(f"unexpected top-level keys (must be exactly the allowed 7): {sorted(extra)}")

    forbidden_present = keys & FORBIDDEN_TOP_LEVEL_KEYS
    if forbidden_present:
        errors.append(f"forbidden top-level keys present: {sorted(forbidden_present)}")

    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("title must be a non-empty string")

    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or len(prompt) < 200:
        errors.append("prompt must be a substantive string (>=200 chars)")

    labels = payload.get("labels")
    if not isinstance(labels, list) or not all(isinstance(x, str) for x in labels):
        errors.append("labels must be list[str]")
    elif "wave-app-shell-foundation" not in labels:
        errors.append("labels must include 'wave-app-shell-foundation'")

    priority = payload.get("priority")
    if not isinstance(priority, int) or not (0 <= priority <= 100):
        errors.append("priority must be int in [0, 100]")

    max_attempts = payload.get("max_attempts")
    if not isinstance(max_attempts, int) or max_attempts < 1:
        errors.append("max_attempts must be a positive int")

    pipeline_name = payload.get("pipeline_name")
    if pipeline_name != EXPECTED_PIPELINE:
        errors.append(f"pipeline_name must be '{EXPECTED_PIPELINE}', got {pipeline_name!r}")

    pi = payload.get("pipeline_inputs")
    if not isinstance(pi, dict):
        errors.append("pipeline_inputs must be an object")
        return errors

    pi_missing = REQUIRED_PIPELINE_INPUT_KEYS - set(pi.keys())
    if pi_missing:
        errors.append(f"pipeline_inputs missing required keys: {sorted(pi_missing)}")

    if pi.get("root_path") != EXPECTED_ROOT_PATH:
        errors.append(f"pipeline_inputs.root_path must be {EXPECTED_ROOT_PATH!r}, got {pi.get('root_path')!r}")

    if pi.get("wave") != EXPECTED_WAVE:
        errors.append(f"pipeline_inputs.wave must be {EXPECTED_WAVE!r}, got {pi.get('wave')!r}")

    if pi.get("source_prd") != f"_meta/atomic-tasks/00-foundation/waves/{EXPECTED_WAVE}/README.md":
        errors.append("pipeline_inputs.source_prd must point to this wave's README.md")

    task_type = pi.get("task_type")
    if task_type not in {"T1-schema", "T2-api", "T3-ui", "T4-wiring-test"}:
        errors.append(f"pipeline_inputs.task_type invalid: {task_type!r}")

    for list_key in ("acceptance_criteria", "test_strategy", "scope_files", "out_of_scope", "risk_red_lines", "skills"):
        value = pi.get(list_key)
        if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
            errors.append(f"pipeline_inputs.{list_key} must be list[str]")
        elif not value:
            errors.append(f"pipeline_inputs.{list_key} must be non-empty")

    cp = pi.get("checkpoint_policy")
    if not isinstance(cp, dict):
        errors.append("pipeline_inputs.checkpoint_policy must be an object")
    else:
        required_checkpoints = cp.get("required_checkpoints")
        if not isinstance(required_checkpoints, list) or set(required_checkpoints) < {"RED", "GREEN", "REVIEW", "CLOSEOUT"}:
            errors.append("checkpoint_policy.required_checkpoints must include RED, GREEN, REVIEW, CLOSEOUT")
        closeout_requires = cp.get("closeout_requires")
        if not isinstance(closeout_requires, list):
            errors.append("checkpoint_policy.closeout_requires must be list[str]")
        if is_ui_task(payload):
            cr_set = set(closeout_requires or [])
            missing_ui = UI_CLOSEOUT_REQUIRED - cr_set
            if missing_ui:
                errors.append(f"UI task closeout_requires missing: {sorted(missing_ui)}")
            if not cp.get("fail_closed_on_missing_ui_evidence", False):
                errors.append("UI task must set checkpoint_policy.fail_closed_on_missing_ui_evidence=true")
            blocking = set(cp.get("blocking_states") or [])
            if not (UI_BLOCKING_STATES <= blocking):
                errors.append(f"UI task blocking_states must include {sorted(UI_BLOCKING_STATES)}")

    haystack = json.dumps(payload, ensure_ascii=False)
    hits = collect_placeholder_hits(haystack)
    if hits:
        errors.append(f"placeholder strings present: {sorted(set(hits))[:10]}")

    bad_todos = disallowed_todo_tokens(haystack)
    if bad_todos:
        errors.append(f"disallowed TODO tokens (not in cross-module allowlist): {sorted(set(bad_todos))[:10]}")

    fname = path.name
    display_id = pi.get("display_task_id", "")
    if display_id and not fname.startswith(f"{display_id}-"):
        errors.append(f"filename {fname!r} should start with display_task_id {display_id!r}")

    prd_task_id = pi.get("prd_task_id", "")
    if display_id and prd_task_id and display_id != prd_task_id:
        errors.append(f"display_task_id != prd_task_id ({display_id!r} vs {prd_task_id!r})")

    if display_id == "T-136":
        lowered = haystack.lower()
        for kw in T136_REQUIRED_KEYWORDS:
            if kw.lower() not in lowered:
                errors.append(f"T-136 prompt must mention {kw!r}")
        for pat in T136_FORBIDDEN_PATTERNS:
            if pat.search(haystack):
                errors.append(f"T-136 contains forbidden ACP-call pattern: {pat.pattern!r}")

    return errors


def validate_manifest() -> tuple[list[str], list[str]]:
    errors: list[str] = []
    try:
        with MANIFEST_PATH.open("r", encoding="utf-8") as fh:
            manifest = json.load(fh)
    except FileNotFoundError:
        return [f"manifest.json missing at {MANIFEST_PATH}"], []
    except json.JSONDecodeError as exc:
        return [f"manifest.json invalid JSON: {exc}"], []

    if manifest.get("wave") != EXPECTED_WAVE:
        errors.append(f"manifest.wave must be {EXPECTED_WAVE!r}")
    if manifest.get("pipeline_name") != EXPECTED_PIPELINE:
        errors.append(f"manifest.pipeline_name must be {EXPECTED_PIPELINE!r}")
    if manifest.get("stage_as") != "draft":
        errors.append("manifest.stage_as must be 'draft'")
    if manifest.get("root_path") != EXPECTED_ROOT_PATH:
        errors.append(f"manifest.root_path must be {EXPECTED_ROOT_PATH!r}")

    tasks = manifest.get("tasks", [])
    if not isinstance(tasks, list) or not tasks:
        errors.append("manifest.tasks must be a non-empty list")
        return errors, []

    if manifest.get("task_count") != len(tasks):
        errors.append(f"manifest.task_count ({manifest.get('task_count')}) != len(tasks) ({len(tasks)})")

    return errors, tasks


def validate_import_request(manifest_tasks: list[str]) -> list[str]:
    errors: list[str] = []
    try:
        with IMPORT_REQUEST_PATH.open("r", encoding="utf-8") as fh:
            req = json.load(fh)
    except FileNotFoundError:
        return [f"import-request.draft.json missing at {IMPORT_REQUEST_PATH}"]
    except json.JSONDecodeError as exc:
        return [f"import-request.draft.json invalid JSON: {exc}"]

    if req.get("stage_as") != "draft":
        errors.append("import-request.stage_as must be 'draft'")
    if req.get("source") != "foundation-app-shell-opus-wave":
        errors.append("import-request.source must be 'foundation-app-shell-opus-wave'")

    items = req.get("items")
    if not isinstance(items, list):
        errors.append("import-request.items must be a list")
        return errors

    if len(items) != len(manifest_tasks):
        errors.append(f"import-request.items count ({len(items)}) != manifest.tasks count ({len(manifest_tasks)})")

    expected_display_ids: list[str] = []
    for relpath in manifest_tasks:
        try:
            with (WAVE_DIR / relpath).open("r", encoding="utf-8") as fh:
                expected_display_ids.append(json.load(fh)["pipeline_inputs"]["display_task_id"])
        except (FileNotFoundError, KeyError, json.JSONDecodeError) as exc:
            errors.append(f"could not resolve display_task_id for manifest entry {relpath}: {exc}")
            expected_display_ids.append("<unresolved>")

    for idx, (item, expected_id) in enumerate(zip(items, expected_display_ids)):
        if not isinstance(item, dict):
            errors.append(f"items[{idx}] must be an object")
            continue
        got_id = item.get("pipeline_inputs", {}).get("display_task_id")
        if got_id != expected_id:
            errors.append(f"items[{idx}].pipeline_inputs.display_task_id mismatch: got {got_id!r}, expected {expected_id!r}")
        keys = set(item.keys())
        if keys != ALLOWED_TOP_LEVEL_KEYS:
            errors.append(f"items[{idx}] top-level keys must be exactly the allowed 7; got {sorted(keys)}")

    return errors


def main() -> int:
    if not TASKS_DIR.is_dir():
        print(f"ERROR: tasks directory missing: {TASKS_DIR}", file=sys.stderr)
        return 1

    task_files = sorted(TASKS_DIR.glob("*.json"))
    if not task_files:
        print(f"ERROR: no task files found under {TASKS_DIR}", file=sys.stderr)
        return 1

    failures = 0
    for path in task_files:
        errs = validate_task_file(path)
        if errs:
            failures += 1
            print(f"FAIL {path.relative_to(WAVE_DIR)}")
            for err in errs:
                print(f"  - {err}")
        else:
            print(f"OK   {path.relative_to(WAVE_DIR)}")

    manifest_errs, manifest_tasks = validate_manifest()
    if manifest_errs:
        failures += 1
        print("FAIL manifest.json")
        for err in manifest_errs:
            print(f"  - {err}")
    else:
        print("OK   manifest.json")

    if manifest_tasks:
        fs_tasks = sorted(str(p.relative_to(WAVE_DIR)) for p in task_files)
        manifest_set = set(manifest_tasks)
        fs_set = set(fs_tasks)
        missing_on_fs = manifest_set - fs_set
        extra_on_fs = fs_set - manifest_set
        if missing_on_fs or extra_on_fs:
            failures += 1
            print("FAIL manifest vs filesystem")
            if missing_on_fs:
                print(f"  - listed in manifest but missing on disk: {sorted(missing_on_fs)}")
            if extra_on_fs:
                print(f"  - present on disk but missing from manifest: {sorted(extra_on_fs)}")
        else:
            print("OK   manifest vs filesystem")

    import_errs = validate_import_request(manifest_tasks)
    if import_errs:
        failures += 1
        print("FAIL import-request.draft.json")
        for err in import_errs:
            print(f"  - {err}")
    else:
        print("OK   import-request.draft.json")

    if failures:
        print(f"\n{failures} group(s) failed.")
        return 1
    print("\nAll wave artifacts valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
