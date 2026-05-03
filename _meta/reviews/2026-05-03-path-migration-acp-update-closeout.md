# 2026-05-03 — Path migration + ACP task path update closeout

## Scope

User moved MonoPilot-Kira documentation/prototype files into canonical directories. This closeout records the path migration and live ACP task update.

Canonical paths applied:

- PRDs: `docs/prd/*.md`
- UX docs: `prototypes/design/*-UX.md`
- Design-system prototype JSX: `prototypes/design/Monopilot Design System/...`

## Agent waves

Four Spark/Hermes specialist waves were used:

1. SPARK-1: `00-foundation`, `01-npd`, `02-settings` atomic tasks/coverage/manifests.
2. SPARK-2: `03-technical`, `04-planning-basic`, `05-warehouse` atomic tasks/coverage/manifests.
3. SPARK-3: `06-scanner-p1`, `07-planning-ext`, `08-production` atomic tasks/coverage/manifests.
4. SPARK-4: prototype label indexes, master index, PRD/UX/meta docs, and scanner unresolved prototype filenames.

Sonnet 4.6 was attempted as a tool-enabled full-repo review twice. Both tool-enabled runs hung while scanning/starting the repo context and were killed. A Sonnet 4.6 no-tools evidence review was then run successfully against the verification evidence and returned PASS with only low residual risks.

Sonnet evidence review output file:

- `/tmp/monopilot-sonnet-evidence-review.json`

## Repository updates

Updated path references across tracked non-archive repo files, including:

- `_meta/atomic-tasks/00-foundation` through `_meta/atomic-tasks/08-production`
- `_meta/prototype-labels/*.json`
- `_meta/prototype-labels/translation-notes-*.md`
- `docs/prd/*.md`
- `prototypes/design/*-UX.md`
- `prototypes/design/Monopilot Design System/*`
- relevant README/audit/handoff/meta docs and tracked Claude skills

Scanner filename corrections applied where old placeholder prototype filenames did not exist:

- `scanner/auth-screens.jsx` -> `scanner/login.jsx`
- `scanner/receive-screens.jsx` -> `scanner/flow-receive.jsx`
- `scanner/move-screens.jsx` -> `scanner/flow-putaway.jsx`
- `scanner/settings-screens.jsx` -> `scanner/home.jsx`

## ACP live task updates

Updated existing ACP tasks for the `00-foundation` draft-expanded set:

- Foundation root tasks: 52
- `setup_dev` root tasks: 5
- `ACP_dev` root tasks: 47
- Total ACP rows in this foundation tree after recovery children appeared: 260
- Final ACP status: 260/260 `draft`
- Final ACP stale path refs: 0

Important runtime note:

- Two `setup_dev` tasks had been picked up by the runner/recovery loop before restaging.
- Hermes killed the two active recovery/setup shell processes and restaged the affected foundation tree back to draft.
- Final verification confirmed no non-draft rows remained in this foundation ACP tree.

## Verification

Repository validation:

```text
MODULE_COUNTS [('00-foundation', 52), ('01-npd', 100), ('02-settings', 127), ('03-technical', 90), ('04-planning-basic', 65), ('05-warehouse', 57), ('06-scanner-p1', 48), ('07-planning-ext', 57), ('08-production', 55)]
JSON_CHECK 667 0
STALE_TRACKED_NONARCHIVE 0
MISSING_INDEX_FILES 0
VALIDATORS_00_08_PASS
DIFF_CHECK_PASS
```

ACP validation:

```text
{'total': 260, 'draft': 260, 'non_draft': 0, 'setup_roots': 5, 'acp_roots': 47}
ACP stale rows: 0
```

Sonnet 4.6 evidence-review verdict:

```text
PASS — checks are sufficient for a path-only migration closeout.
Residual risks are low: untracked/cache files, external configs, and future CI scripts outside tracked tree.
```

## Current status

- Repo has path-migration changes in working tree; not committed in this closeout.
- 00-08 task/index/PRD/prototype path validation is green.
- ACP foundation draft tree is path-updated and draft-only again.
