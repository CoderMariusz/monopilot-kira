# 02 Settings Codex B Content Polish

Date: 2026-05-09

## Deliverable Status

| Deliverable | Status | Files modified | Rationale / notes |
|---|---|---|---|
| 1. Deepen T-124..T-127 | done with coordination caveat | `_meta/atomic-tasks/02-settings/tasks/T-124.json`, `T-125.json`, `T-126.json`, `T-127.json` | Added rich prompt bodies, `prd_refs`, labels, structured ACs/test/risk/checkpoint fields. To avoid run A's path-string ownership, existing `pipeline_inputs.details` and `pipeline_inputs.scope_files` arrays in these existing tasks were left unchanged; concrete file scope was placed in editable prompt bodies. |
| 2. Fix T-077/T-078 prototype semantics | done | `_meta/atomic-tasks/02-settings/tasks/T-077.json`, `T-078.json` | Converted Manufacturing Operations list/edit tasks from adjacent-prototype 1:1 parity to UX/PRD §8.9 spec-driven semantics. Adjacent prototypes are now explicitly pattern-only references and `prototype_match=false`. |
| 3. Coverage gaps | done | `_meta/atomic-tasks/02-settings/tasks/T-128.json`, `T-129.json`, `_meta/atomic-tasks/02-settings/manifest.json`, `_meta/atomic-tasks/02-settings/coverage.md` | Created T-128 for SET-034 Schema Shadow Preview and T-129 for SET-100 Language Picker. Marked SET-015/017/019 deferred with T-105/T-106/T-107 rationale. Marked SET-051 covered by T-067 detail route. Did not create T-130 because no remaining gap required a new task after the explicit deferred/covered decisions. |
| 4. Settings PRD FA legacy reference | done | `docs/prd/02-SETTINGS-PRD.md` | Qualified legacy `npd.fa.edit` and Manufacturing Operations FA copy with `[LEGACY-FA]` and TODO notes where a confident rename to released FG/product terminology would risk guessing. |
| 5. Foundation sprint summary wording | done | `docs/foundation-sprint-summary.md` | Updated migration summary to acknowledge intentional reassignment holes at 008, 020, 021 while preserving the 032-036 no-gap statement. |

## Conflicts Avoided

- Did not edit `pipeline_inputs.details` or `pipeline_inputs.scope_files` for T-124..T-127 despite deliverable pressure, because run A owns existing task path/detail rewrites.
- Left unrelated run A changes in `_meta/atomic-tasks/02-settings/tasks/T-001..T-123.json` untouched, except T-077/T-078 where this run had explicit prototype-semantics scope.
- Did not run package tests (`pnpm`/`npm`/`pytest`) per constraint. Validation performed: JSON parse for changed task/manifest files.

## Validation

`node` JSON parse: passed for T-077, T-078, T-124, T-125, T-126, T-127, T-128, T-129, and `manifest.json`.

## Final git status --short

```text
 M _meta/atomic-tasks/02-settings/coverage.md
 M _meta/atomic-tasks/02-settings/manifest.json
 M _meta/atomic-tasks/02-settings/tasks/T-001.json
 M _meta/atomic-tasks/02-settings/tasks/T-002.json
 M _meta/atomic-tasks/02-settings/tasks/T-004.json
 M _meta/atomic-tasks/02-settings/tasks/T-005.json
 M _meta/atomic-tasks/02-settings/tasks/T-006.json
 M _meta/atomic-tasks/02-settings/tasks/T-007.json
 M _meta/atomic-tasks/02-settings/tasks/T-008.json
 M _meta/atomic-tasks/02-settings/tasks/T-009.json
 M _meta/atomic-tasks/02-settings/tasks/T-010.json
 M _meta/atomic-tasks/02-settings/tasks/T-011.json
 M _meta/atomic-tasks/02-settings/tasks/T-012.json
 M _meta/atomic-tasks/02-settings/tasks/T-013.json
 M _meta/atomic-tasks/02-settings/tasks/T-014.json
 M _meta/atomic-tasks/02-settings/tasks/T-039.json
 M _meta/atomic-tasks/02-settings/tasks/T-041.json
 M _meta/atomic-tasks/02-settings/tasks/T-042.json
 M _meta/atomic-tasks/02-settings/tasks/T-043.json
 M _meta/atomic-tasks/02-settings/tasks/T-044.json
 M _meta/atomic-tasks/02-settings/tasks/T-045.json
 M _meta/atomic-tasks/02-settings/tasks/T-046.json
 M _meta/atomic-tasks/02-settings/tasks/T-047.json
 M _meta/atomic-tasks/02-settings/tasks/T-048.json
 M _meta/atomic-tasks/02-settings/tasks/T-049.json
 M _meta/atomic-tasks/02-settings/tasks/T-050.json
 M _meta/atomic-tasks/02-settings/tasks/T-051.json
 M _meta/atomic-tasks/02-settings/tasks/T-052.json
 M _meta/atomic-tasks/02-settings/tasks/T-053.json
 M _meta/atomic-tasks/02-settings/tasks/T-054.json
 M _meta/atomic-tasks/02-settings/tasks/T-055.json
 M _meta/atomic-tasks/02-settings/tasks/T-056.json
 M _meta/atomic-tasks/02-settings/tasks/T-057.json
 M _meta/atomic-tasks/02-settings/tasks/T-058.json
 M _meta/atomic-tasks/02-settings/tasks/T-059.json
 M _meta/atomic-tasks/02-settings/tasks/T-060.json
 M _meta/atomic-tasks/02-settings/tasks/T-061.json
 M _meta/atomic-tasks/02-settings/tasks/T-062.json
 M _meta/atomic-tasks/02-settings/tasks/T-063.json
 M _meta/atomic-tasks/02-settings/tasks/T-064.json
 M _meta/atomic-tasks/02-settings/tasks/T-065.json
 M _meta/atomic-tasks/02-settings/tasks/T-066.json
 M _meta/atomic-tasks/02-settings/tasks/T-067.json
 M _meta/atomic-tasks/02-settings/tasks/T-068.json
 M _meta/atomic-tasks/02-settings/tasks/T-069.json
 M _meta/atomic-tasks/02-settings/tasks/T-070.json
 M _meta/atomic-tasks/02-settings/tasks/T-071.json
 M _meta/atomic-tasks/02-settings/tasks/T-072.json
 M _meta/atomic-tasks/02-settings/tasks/T-073.json
 M _meta/atomic-tasks/02-settings/tasks/T-074.json
 M _meta/atomic-tasks/02-settings/tasks/T-075.json
 M _meta/atomic-tasks/02-settings/tasks/T-076.json
 M _meta/atomic-tasks/02-settings/tasks/T-077.json
 M _meta/atomic-tasks/02-settings/tasks/T-078.json
 M _meta/atomic-tasks/02-settings/tasks/T-079.json
 M _meta/atomic-tasks/02-settings/tasks/T-089.json
 M _meta/atomic-tasks/02-settings/tasks/T-091.json
 M _meta/atomic-tasks/02-settings/tasks/T-092.json
 M _meta/atomic-tasks/02-settings/tasks/T-093.json
 M _meta/atomic-tasks/02-settings/tasks/T-096.json
 M _meta/atomic-tasks/02-settings/tasks/T-097.json
 M _meta/atomic-tasks/02-settings/tasks/T-098.json
 M _meta/atomic-tasks/02-settings/tasks/T-099.json
 M _meta/atomic-tasks/02-settings/tasks/T-100.json
 M _meta/atomic-tasks/02-settings/tasks/T-101.json
 M _meta/atomic-tasks/02-settings/tasks/T-102.json
 M _meta/atomic-tasks/02-settings/tasks/T-103.json
 M _meta/atomic-tasks/02-settings/tasks/T-104.json
 M _meta/atomic-tasks/02-settings/tasks/T-105.json
 M _meta/atomic-tasks/02-settings/tasks/T-106.json
 M _meta/atomic-tasks/02-settings/tasks/T-107.json
 M _meta/atomic-tasks/02-settings/tasks/T-108.json
 M _meta/atomic-tasks/02-settings/tasks/T-109.json
 M _meta/atomic-tasks/02-settings/tasks/T-110.json
 M _meta/atomic-tasks/02-settings/tasks/T-111.json
 M _meta/atomic-tasks/02-settings/tasks/T-112.json
 M _meta/atomic-tasks/02-settings/tasks/T-113.json
 M _meta/atomic-tasks/02-settings/tasks/T-114.json
 M _meta/atomic-tasks/02-settings/tasks/T-115.json
 M _meta/atomic-tasks/02-settings/tasks/T-116.json
 M _meta/atomic-tasks/02-settings/tasks/T-117.json
 M _meta/atomic-tasks/02-settings/tasks/T-118.json
 M _meta/atomic-tasks/02-settings/tasks/T-119.json
 M _meta/atomic-tasks/02-settings/tasks/T-120.json
 M _meta/atomic-tasks/02-settings/tasks/T-121.json
 M _meta/atomic-tasks/02-settings/tasks/T-122.json
 M _meta/atomic-tasks/02-settings/tasks/T-123.json
 M _meta/atomic-tasks/02-settings/tasks/T-124.json
 M _meta/atomic-tasks/02-settings/tasks/T-125.json
 M _meta/atomic-tasks/02-settings/tasks/T-126.json
 M _meta/atomic-tasks/02-settings/tasks/T-127.json
 M docs/foundation-sprint-summary.md
 M docs/prd/02-SETTINGS-PRD.md
?? .acp/
?? _meta/atomic-tasks/02-settings/tasks/T-128.json
?? _meta/atomic-tasks/02-settings/tasks/T-129.json
?? _meta/plans/2026-05-09-02-settings-codex-A-path-polish.md
?? _meta/plans/2026-05-09-02-settings-codex-B-content-polish.md
```

## git diff --stat for Codex B changes

```text
_meta/atomic-tasks/02-settings/coverage.md      | 21 ++++++--
_meta/atomic-tasks/02-settings/manifest.json    |  6 ++-
_meta/atomic-tasks/02-settings/tasks/T-077.json | 19 ++++----
_meta/atomic-tasks/02-settings/tasks/T-078.json | 19 ++++----
_meta/atomic-tasks/02-settings/tasks/T-124.json | 61 ++++++++++++++++-------
_meta/atomic-tasks/02-settings/tasks/T-125.json | 62 +++++++++++++++++-------
_meta/atomic-tasks/02-settings/tasks/T-126.json | 62 +++++++++++++++++-------
_meta/atomic-tasks/02-settings/tasks/T-127.json | 64 ++++++++++++++++++-------
docs/foundation-sprint-summary.md               |  3 +-
docs/prd/02-SETTINGS-PRD.md                     | 24 +++++-----
10 files changed, 236 insertions(+), 105 deletions(-)
```

Untracked new task files are not included by `git diff --stat`: `T-128.json` has 91 lines, `T-129.json` has 90 lines.
