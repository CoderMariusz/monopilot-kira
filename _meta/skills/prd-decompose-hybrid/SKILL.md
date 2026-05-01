---
name: prd-decompose-hybrid
description: Use when user has a PRD (or multi-PRD corpus) that needs to be split into atomic, ACP-importable tasks. Produces manifest.json, coverage.md, and one validated JSON payload per task in tasks/T-XXX.json — ready for ACP POST /api/v1/tasks or POST /api/v1/tasks/backlog/import with kira_dev canonical metadata. No taskmaster output.
---

# PRD Decomposition — Hybrid for ACP

Use this skill when a PRD exists and the user wants it split into tasks that can be imported into Agent Control Plane (ACP).

The output is **ACP-first**, **not Taskmaster-first**:

```text
prd-decomposition/
  manifest.json
  coverage.md
  tasks/
    T-001.json
    T-002.json
    T-003.json
```

We do **not** emit `.taskmaster/tasks/tasks.json` or any Taskmaster-shaped artifact. Taskmaster is no longer the dispatcher — ACP is. Each `tasks/T-XXX.json` must be a valid payload for one of:

```text
POST /api/v1/tasks                     # single task
POST /api/v1/tasks/backlog/import      # batch (preferred for waves)
```

Body shape for the batch endpoint:

```json
{
  "items": [ <TaskCreate>, <TaskCreate>, ... ],
  "stage_as": "draft" | "queued",
  "source": "prd-decompose-hybrid"
}
```

`stage_as: "draft"` is the safe default for a generated wave — tasks are visible in the backlog but not picked up by claimers until promoted. Use `stage_as: "queued"` only when the user explicitly wants the wave to start immediately.

## ACP storage model — important

ACP does **not** store tasks as files. Task files are only a transport/audit format.

ACP stores active tasks in Postgres table `tasks` and assigns canonical IDs such as:

```text
TASK-001820
```

PRD/decomposer IDs like `T-001` must **not** be emitted as top-level `task_id`. Keep them inside the payload:

```text
title                    e.g. "T-001 — <title>"
pipeline_inputs.prd_task_id
```

Forbidden top-level fields (ACP owns or generates these):

```text
task_id
status
project_id
created_at
updated_at
expansion_status
step_name
pipeline_run_id
claimed_by_terminal_id
claim_token
lease_until
```

## When to use

Use this skill when:

- user has a PRD and wants executable tasks;
- user wants every PRD section covered, with no silent dropped requirements;
- tasks should be easy for ACP workers to accept and execute;
- tasks should be atomic enough for RED → implementation → review → closeout;
- multi-PRD corpora need one coherent backlog with dependencies.

Do not use it for a trivial one-paragraph PRD unless the user explicitly wants ACP-ready JSON files.

## Required outputs

### 1. `manifest.json`

```json
{
  "source_prd": "prd/master-prd.md",
  "root_path": "/ABSOLUTE/PATH/TO/PROJECT",
  "generated_at": "2026-04-30T00:00:00Z",
  "generator": "prd-decompose-hybrid",
  "pipeline_name": "kira_dev",
  "task_count": 3,
  "tasks": [
    "tasks/T-001.json",
    "tasks/T-002.json",
    "tasks/T-003.json"
  ],
  "coverage_file": "coverage.md"
}
```

### 2. `coverage.md`

Coverage must prove that every relevant PRD section, heading, numbered bullet, DoD item, and cross-cutting requirement maps to at least one task.

Required shape:

```markdown
# PRD Coverage — <PRD name>

## Coverage by PRD section

| PRD ref | Requirement | Task file | Status |
|---|---|---|---|
| §1.1 | User can create project | tasks/T-001.json | covered |
| §1.2 | Project status is tracked | tasks/T-002.json | covered |
| §5.4 | Billing integration | none | out-of-scope per PRD §8 |

## Coverage by category

### api (<N> tasks)
| PRD ref | Task | Subcategory |
|---|---|---|
| §2.1 | T-001 | endpoint-post |

## Gaps

| PRD ref | Requirement | Status |
|---|---|---|
| §X.Y | <requirement> | ❌ GAP |
```

If any row is `❌ GAP`, do not declare decomposition complete. Add a task or mark the row explicitly out-of-scope with a PRD reference.

### 3. One JSON file per task — ACP `TaskCreate` payload

Top-level shape (only these keys; ACP `TaskCreate` schema accepts no others):

```json
{
  "title": "T-001 — <atomic deliverable title>",
  "prompt": "<FULL SELF-CONTAINED EXECUTION PROMPT>",
  "labels": ["prd", "<category>", "<subcategory>", "<task_type>"],
  "priority": 100,
  "max_attempts": 3,
  "pipeline_name": "kira_dev",
  "pipeline_inputs": {
    "root_path": "/ABSOLUTE/PATH/TO/PROJECT",
    "prd_task_id": "T-001",
    "source_prd": "prd/master-prd.md",
    "prd_refs": ["§2.1", "§2.2"],

    "category": "api|ui|data|infra|auth|docs|test|integration",
    "subcategory": "<subcategory>",
    "task_type": "T1-schema|T2-api|T3-ui|T4-wiring-test|T5-seed|docs",
    "parent_feature": "<feature/module slug>",
    "context_budget": "40k",
    "estimated_effort": "1-3h",

    "description": "<short description>",
    "details": "<detailed implementation contract>",
    "scope_files": ["exact/file/path"],
    "out_of_scope": ["<non-goal>"],
    "dependencies": ["T-000"],
    "parallel_safe_with": ["T-004"],

    "acceptance_criteria": [
      "Given <state>, when <action>, then <observable result>"
    ],
    "test_strategy": [
      "Add failing RED test before implementation",
      "Run <exact command>"
    ],
    "risk_red_lines": [
      "Do not expose secrets",
      "Do not broaden scope beyond listed files without documenting why"
    ],
    "skills": [
      "test-driven-development",
      "requesting-code-review"
    ],
    "checkpoint_policy": {
      "required_checkpoints": ["RED", "GREEN", "REVIEW", "CLOSEOUT"],
      "closeout_requires": [
        "changed_files",
        "test_commands_and_results",
        "acceptance_criteria_status",
        "deviations_from_prd",
        "git_status"
      ]
    },
    "routing_hints": {
      "red": "hermes_gpt55",
      "implementation": "hermes_gpt55",
      "review": "opus_if_high_risk_or_ui_or_architecture",
      "close": "spark_low_risk_else_opus"
    }
  }
}
```

### Priority semantics

ACP sorts the queue by `priority ASC`. **Lower number = picked up sooner.** The DB default is `100`. Convention used by this skill:

```text
 50  P0 / hard blocker (enum lock, baseline migration)
 80  high (foundation, API a downstream depends on)
100  default
120  nice-to-have
150  doc / cleanup
```

Do not invent values outside this range without documenting why.

### `pipeline_inputs.root_path` is mandatory

ACP's `TaskCreate` validator enforces:

```text
pipeline_name set AND pipeline_inputs.root_path missing  →  422
```

Always provide an absolute path under `pipeline_inputs.root_path`. Use the same `root_path` as `manifest.json`.

## Canonical `kira_dev` fields — mandatory

For `pipeline_name = "kira_dev"`, ACP runs `_validate_kira_dev_canonical_metadata`. These `pipeline_inputs` fields must always be present and non-empty:

```text
description
details
scope_files
acceptance_criteria
test_strategy
risk_red_lines
skills
checkpoint_policy
```

Plus `root_path` from the universal validator above. If any are missing or empty, ACP returns 422 `kira_dev pipeline_inputs missing canonical metadata`.

## Atomicity gate

Every non-doc task must pass all four checks (full reference: `references/atomicity-gate.md`):

1. **One deliverable** — not a feature bundle.
2. **≤5 implementation steps** — if it needs more, split it.
3. **Context estimate <100k tokens** — if above ~80k, consider splitting.
4. **Exactly one task type** — no mixed schema + API + UI mega-task.

Allowed task types:

```text
T1-schema        schema, migration, data model, enum lock
T2-api           endpoint, service method, backend behavior
T3-ui            UI component/page/visual slice
T4-wiring-test   integration wiring, e2e, cross-layer proof
T5-seed          seed/mock/import fixture/data setup
docs             ADR/readme/spec/documentation task
```

## Workflow

### Step 1 — Read the PRD completely

Capture every: H2-H4 heading, numbered section, behavior-changing bullet, requirements table row, DoD/acceptance item, out-of-scope item, and cross-cutting constraint (security, auth, observability, deployment, retention).

### Step 2 — Build a coverage worksheet before task writing

Before emitting tasks, create an internal worksheet:

```markdown
| PRD ref | Requirement | Candidate task | Category/subcategory | Notes |
|---|---|---|---|---|
| §1.1 | Create project | T-001 | api/endpoint-post | backend only |
| §1.2 | Project card UI | T-002 | ui/card | depends on T-001 |
```

Every row needs a task or explicit out-of-scope status. Granularity rule:

- Collapse sibling bullets only when they are attributes of the same deliverable.
- Split when bullets describe different artifacts, layers, or testable outcomes.

### Step 3 — Cluster and sequence

Order tasks by dependency:

1. enum locks / baseline schema (`priority: 50`);
2. foundation/schema (`priority: 80`);
3. backend/API;
4. UI slices;
5. integration/e2e;
6. docs/closeout polish.

Dependencies inside task JSON must reference decomposer IDs (`T-001`), not ACP `TASK-xxxxx` — ACP IDs do not exist until import.

See `references/parallel-dispatch.md` for enum-lock-first patterns and file-disjointness rules for parallel waves.

### Step 4 — Assign category / subcategory / task_type

Full taxonomy: `references/taxonomy.md`. Categories: `ui`, `api`, `data`, `infra`, `auth`, `docs`, `test`, `integration`. If a task wants two categories, it is too large. Split it.

### Step 5 — (Optional) Markdown plan as intermediate

For large multi-PRD corpora the MonoPilot-kira convention is:

1. Write a markdown plan file (`_meta/plans/YYYY-MM-DD-<module>-tasks.md`) using the §4 atomic-task format from `references/atomic-task-template.md`. Each task block contains `### ACP Submit` (labels, priority, max_attempts) and `### ACP Prompt` (the verbatim prompt that lands in the JSON).
2. Convert the markdown plan to `tasks/T-XXX.json` files for ACP import.

The markdown plan stays the human-readable source of truth. The JSON files are the wire format. Both are kept in sync by the decomposer.

For single-PRD or smaller projects skip Step 5 and write JSON directly.

### Step 6 — Write task JSON files

For each task:

- write `tasks/T-XXX.json` (valid JSON);
- top-level keys are only ACP `TaskCreate` keys (`title`, `prompt`, `labels`, `priority`, `max_attempts`, `pipeline_name`, `pipeline_inputs`);
- `prompt` is self-contained — readable without re-opening the PRD;
- `pipeline_inputs.root_path` is set to an absolute path;
- all canonical `kira_dev` fields are present and non-empty;
- include PRD refs, exact files (when inferable), RED test command, out-of-scope, and risk red lines.

### Step 7 — UI tasks: reuse stable prototype indexes when available

If the project ships a prototype label index (e.g. MonoPilot-kira `_meta/prototype-labels/master-index.json`), each T3-ui task should:

- list the matched prototype path under `pipeline_inputs.scope_files` as read-only reference (label `[ref]`);
- copy the relevant `translation-notes-<module>.md` shadcn/Radix/RHF-Zod gotchas into `pipeline_inputs.details`;
- keep the actual production file under `scope_files` as `[create]` or `[modify]`.

Do not paste the full prototype JSX into the prompt — just reference path + line ranges. (Background: `references/prototype-reuse-someday.md`.)

#### Mandatory 1:1 prototype-parity AC (UI tasks only)

If a task is `T3-ui` (or `T4-wiring-test` whose subject is a UI flow) AND a matching prototype entry exists in the prototype label index, the task **MUST** carry at least one acceptance criterion that asserts 1:1 parity with the prototype.

The parity AC must name the prototype file + line range and assert that the production component matches the prototype on **all** of:

1. **Structural parity** — same DOM/component hierarchy: same number/order of major regions (header, table, form sections, action buttons), same field set with same labels, same modals invoked from same triggers.
2. **Visual parity** — same shadcn/Radix primitive choices (no drift to a different component family, e.g., HTML `<select>` instead of `<Select>`), same spacing/density tokens where the prototype declares them.
3. **Interaction parity** — same enable/disable rules, same field validation messages, same loading/empty/error states, same keyboard shortcuts and focus order if the prototype defines them.

Phrase the AC concretely so it is testable. Examples:

> "Given the production page renders, when compared to `design/Monopilot Design System/settings/access-screens.jsx:162-244`, then it has the same 9 form fields in the same order, the same 3 action buttons, and uses the same shadcn primitives (Input, Select, Switch) — verified by RTL snapshot + manual review checklist in `pipeline_inputs.details`."

> "Given the modal opens, when compared to `modals.jsx:431-594` (D365 wizard, 8 steps), then it renders all 8 step labels, the same Next/Back/Cancel buttons, and the dismissible=false guard during execute step — verified by RTL test counting steps and asserting button states."

Embed the parity checklist in `pipeline_inputs.details` as a numbered list of items the worker must verify. The validator (Step 8) must reject any UI task that lacks a parity AC when a prototype index entry is matched.

If no prototype exists for the UI surface (rare; explicitly noted in the prototype index as `prototype: none`), the task instead requires a parity AC against `02-SETTINGS-UX.md` / `01-NPD-UX.md` / etc. — the UX spec replaces the prototype as the parity reference.

**Why this exists:** prototypes are the contract for UI shape; without a parity AC, UI tasks drift toward "looks roughly like the spec" and review burden falls back on humans. The parity AC pushes the comparison into the RED test where it belongs.

### Step 8 — Validate before handoff

Use `references/validate-tasks.py` (or inline the same checks):

1. Parse every `tasks/T-*.json` as JSON.
2. Assert required top-level fields:

```text
title
prompt
labels
priority
max_attempts
pipeline_name
pipeline_inputs
```

3. Assert `pipeline_name == "kira_dev"`.
4. Assert required `pipeline_inputs` fields:

```text
root_path
description
details
scope_files
acceptance_criteria
test_strategy
risk_red_lines
skills
checkpoint_policy
```

5. Assert no forbidden top-level fields (see "ACP storage model").
6. Grep prompts for placeholders:

```text
TBD
TODO
fill in
appropriate
similar to previous
```

7. Verify `coverage.md` has no `❌ GAP` rows unless explicitly reported as unresolved.

## Importing into ACP

### Preferred: batch import a wave (draft-staged)

```bash
cd /path/to/agent-control-plane
uv run python - <<'PY'
import json, pathlib, httpx

API = 'http://127.0.0.1:8000/api/v1/tasks/backlog/import'
TASK_DIR = pathlib.Path('prd-decomposition/tasks')

items = [json.loads(p.read_text()) for p in sorted(TASK_DIR.glob('T-*.json'))]
body = {"items": items, "stage_as": "draft", "source": "prd-decompose-hybrid"}
r = httpx.post(API, json=body, timeout=60)
r.raise_for_status()
for row in r.json()['created']:
    print(f"{row.get('task_id')} :: {row.get('title')}")
PY
```

Promote draft → queued only after the user reviews the staged backlog.

### Alternative: single-task import

```bash
uv run python - <<'PY'
import json, pathlib, httpx
payload = json.loads(pathlib.Path('prd-decomposition/tasks/T-001.json').read_text())
r = httpx.post('http://127.0.0.1:8000/api/v1/tasks', json=payload, timeout=30)
r.raise_for_status()
print(json.dumps(r.json(), indent=2))
PY
```

### Rollout discipline

Do not import 100+ generated tasks blindly:

1. validate all generated files locally;
2. batch-import one wave staged as `draft`;
3. promote only the first 2-3 P0/foundation tasks to `queued`;
4. verify ACP expansion creates expected `kira_red`, `kira_impl`, `kira_review`, `kira_close` children;
5. verify execution health;
6. then promote the next wave.

## Prompt template to give to a PRD decomposer

Use this when asking another model to perform the decomposition:

```text
Masz PRD w pliku: <PRD_PATH>.
Root projektu: <ABSOLUTE_PROJECT_ROOT>.

Rozbij PRD na atomowe zadania gotowe do importu do ACP.

NIE generuj żadnych plików Taskmaster (.taskmaster/, tasks.json itd.).
Generujesz wyłącznie payloady ACP.

Wymagany output:
1. manifest.json
2. coverage.md
3. osobny plik JSON dla każdego zadania w katalogu tasks/

Każdy plik tasks/T-XXX.json musi być poprawnym payloadem dla ACP TaskCreate
(POST /api/v1/tasks lub items[] w POST /api/v1/tasks/backlog/import).

ACP sam nada TASK-xxxxx, status, created_at, expansion_status itd.
Nie dodawaj top-level pól, których ACP nie obsługuje:
task_id, status, project_id, created_at, updated_at, expansion_status,
step_name, pipeline_run_id, claimed_by_terminal_id, claim_token, lease_until.

Każdy task musi mieć dokładnie ten top-level shape:

{
  "title": "T-XXX — <title>",
  "prompt": "<full self-contained prompt>",
  "labels": ["prd", "<category>", "<subcategory>", "<task_type>"],
  "priority": <int — niższe = ważniejsze; foundation 80, default 100, P0 50>,
  "max_attempts": 3,
  "pipeline_name": "kira_dev",
  "pipeline_inputs": {
    "root_path": "<ABSOLUTE_PROJECT_ROOT>",
    "prd_task_id": "T-XXX",
    "source_prd": "<PRD_PATH>",
    "prd_refs": ["§..."],

    "category": "<api|ui|data|infra|auth|docs|test|integration>",
    "subcategory": "<subcategory>",
    "task_type": "<T1-schema|T2-api|T3-ui|T4-wiring-test|T5-seed|docs>",
    "parent_feature": "<feature slug>",
    "context_budget": "<estimate>",
    "estimated_effort": "<estimate>",

    "description": "<short description>",
    "details": "<detailed implementation contract>",
    "scope_files": ["<exact paths>"],
    "out_of_scope": ["<non-goals>"],
    "dependencies": ["T-..."],
    "parallel_safe_with": ["T-..."],

    "acceptance_criteria": ["<measurable criterion>"],
    "test_strategy": ["<exact test requirement>", "<exact command>"],
    "risk_red_lines": ["<what must not happen>"],
    "skills": ["test-driven-development", "requesting-code-review"],
    "checkpoint_policy": {
      "required_checkpoints": ["RED", "GREEN", "REVIEW", "CLOSEOUT"],
      "closeout_requires": [
        "changed_files",
        "test_commands_and_results",
        "acceptance_criteria_status",
        "deviations_from_prd",
        "git_status"
      ]
    },
    "routing_hints": {
      "red": "hermes_gpt55",
      "implementation": "hermes_gpt55",
      "review": "opus_if_high_risk_or_ui_or_architecture",
      "close": "spark_low_risk_else_opus"
    }
  }
}

Atomicity rules:
- one task = one deliverable
- max 5 implementation steps
- one task_type only
- no feature bundles
- no vague placeholders (TBD, appropriate, similar to previous, fill in, TODO)
- every PRD section appears in coverage.md (covered or out-of-scope with PRD ref)
- dependencies używają decomposer IDs (T-001), nie ACP TASK-xxxxx
- pipeline_inputs.root_path zawsze absolute path
- wszystkie canonical kira_dev fields wypełnione

Dla każdego prompta:
- self-contained (czyta się bez PRD obok)
- include PRD refs
- include exact files jeśli da się wywnioskować
- include RED test requirement + dokładną komendę
- include scope/out-of-scope
- include acceptance criteria
- include closeout evidence required
- include safety constraints

Zwróć wyłącznie zawartość plików.
```

## Self-review checklist

Before finishing any decomposition, verify:

1. `manifest.json` exists and references all task files.
2. Every task file parses as JSON.
3. Every task has only ACP `TaskCreate` top-level keys.
4. Every task uses `pipeline_name: kira_dev`.
5. Every task has `pipeline_inputs.root_path` (absolute path).
6. Every task has all canonical `kira_dev` `pipeline_inputs` fields, non-empty.
7. No forbidden top-level fields appear.
8. Every non-doc task passes the 4-check atomicity gate.
9. Every task has measurable acceptance criteria.
10. Every task has RED/test strategy and closeout evidence requirements.
11. Dependencies use `T-XXX` IDs, not ACP `TASK-xxxxx`.
12. Priority values are within the documented band (50–150) with rationale.
13. `coverage.md` covers every PRD section or explicitly marks out-of-scope with a PRD ref.
14. No `TBD`, `TODO`, `fill in`, `appropriate`, or `similar to previous` placeholders remain.
15. No Taskmaster artifacts written (`.taskmaster/`, `tasks.json`, etc.).
16. Every `T3-ui` (or UI-flow `T4-wiring-test`) task with a matched prototype carries a 1:1 parity AC per Step 7 — naming prototype file + line range and asserting structural + visual + interaction parity.

## Notes

- This skill decomposes PRDs; it does not execute the generated tasks.
- After decomposition, batch-import staged as `draft`, then promote one foundation wave at a time.
- After each wave, verify ACP expansion and execution health before promoting the next one.
- Use `kira-hq-hermes-pipeline` or `kira-hq-claude-pipeline` when executing imported tasks.
