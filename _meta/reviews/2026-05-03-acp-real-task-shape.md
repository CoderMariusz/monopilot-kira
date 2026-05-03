# ACP Real Task Shape — observed from agent-control-plane

Date: 2026-05-03
Source repo: `/Users/mariuszkrawczyk/Projects/agent-control-plane`
Observed files:
- `src/acp/api/schemas.py`
- `src/acp/api/routes_tasks.py`

## TaskCreate schema

Actual accepted top-level payload shape:

```json
{
  "title": "string, max 512",
  "prompt": "string",
  "labels": ["string"],
  "priority": 100,
  "max_attempts": 3,
  "pipeline_name": "kira_dev",
  "pipeline_inputs": {}
}
```

Top-level forbidden/generated fields should not be emitted in atomic files:
- `task_id`
- `status`
- `project_id`
- `created_at`
- `updated_at`
- `expansion_status`
- `step_name`
- `pipeline_run_id`
- `claimed_by_terminal_id`
- `claim_token`
- `lease_until`

## Required root path

`TaskCreate.validate_pipeline_inputs()` rejects any payload with `pipeline_name` set and missing `pipeline_inputs.root_path`.

## kira_dev / ACP_dev canonical metadata

`routes_tasks._validate_kira_dev_canonical_metadata()` requires these `pipeline_inputs` fields for `pipeline_name in {"kira_dev", "ACP_dev"}` unless using internal compatibility paths:

- `description`
- `details`
- `scope_files`
- `acceptance_criteria`
- `test_strategy`
- `risk_red_lines`
- `skills`
- `checkpoint_policy`

## Backlog import behavior

Endpoint:

`POST /api/v1/tasks/backlog/import`

Request shape:

```json
{
  "items": [TaskCreate],
  "stage_as": "draft",
  "source": "backlog-import"
}
```

Observed behavior:
- accepts `stage_as` only `draft` or `queued`;
- validates each item with `_validate_kira_dev_canonical_metadata`;
- creates ACP-owned `TASK-xxxxx` IDs;
- stores `status = stage_as`;
- stores `priority`, `labels`, `max_attempts`, `pipeline_name`, `pipeline_inputs`;
- sets `expansion_status = "not_required"` for backlog/import rows;
- resolves `project_id` by exact `pipeline_inputs.root_path` match against ACP `projects.root_path`;
- returns created rows without `pipeline_inputs`.

## Readiness implication for monopilot-kira atomic tasks

The repo's atomic JSON files can be ACP-importable if they match the top-level schema and required canonical metadata, but 95%+ autonomous implementation readiness requires stricter local conventions that ACP itself does not enforce:

- exactly one atomic task type;
- dependencies in importable format or explicit non-ACP cross-module metadata;
- no misleading `parallel_safe_with`;
- lower `priority` means sooner;
- rich self-contained `prompt`, preferably long enough to avoid rework;
- exact files, exact tests, exact acceptance criteria;
- UI tasks include prototype/UX lines, structural/visual/interaction parity, screenshot and trace/artifact evidence;
- cross-module blockers are represented in `pipeline_inputs.cross_module_dependencies` and the prompt, not as invalid local `dependencies` values unless ACP import mapping exists.
