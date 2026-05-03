# Opus + Sonnet Polish Final Synthesis

Date: 2026-05-03
Repo: `/Users/mariuszkrawczyk/Projects/monopilot-kira`
Status: not committed.

## Executive verdict

Opus Technical polish and Sonnet labeling polish have both completed successfully.

After their changes and independent Hermes validation:

- all module validators for 00-08 pass;
- custom ACP/task-shape validation checks 651 task payloads successfully;
- prototype index validation passes for referenced files and line ranges;
- `git diff --check` passes;
- 03 Technical no longer has misleading blocker language for Wave0 spec-driven UI surfaces;
- high-value scanner/production source anchors were added;
- 04/06 UI tasks now explicitly reference the shared UI prototype parity policy;
- 01-08 module indexes are discoverable through master-index for the known mismatch labels.

Conclusion: 00-08 remain ready for staged ACP draft import / staged implementation. The Opus/Sonnet polish improved UI traceability and Technical readiness without introducing validation failures.

## Claude Opus — Technical polish

Report:

- `_meta/reviews/2026-05-03-opus-technical-polish-closeout.md`

Main changes:

- `03-TECHNICAL-PRD.md`
  - added §17A Spec-driven UI anchor map for T-085..T-090;
  - added §17B recommended staged ACP wave order for Technical;
  - normalized stale `BLOCKER` wording into `SPEC-DRIVEN` for Wave0 surfaces;
  - added changelog v3.3.1.

- `_meta/atomic-tasks/03-technical/tasks/T-085.json` through `T-090.json`
  - replaced weak placeholder parity anchors like `other-screens.jsx:1-200` with meaningful adjacent layout-primitive anchors;
  - preserved required structural/visual/interaction/parity language;
  - clarified that PRD/UX is canonical and prototypes are layout primitives where exact dedicated prototype does not exist.

Technical wave order from Opus:

1. NPD T-097 canonical release dependency.
2. Technical schema/contract spine: T-079 / T-073 / T-074 / T-081.
3. Approval/release bundle: T-080 / T-090.
4. Cross-module events: T-082 / T-076 / T-077.
5. Supplier specs Phase 1: T-072 / T-075.
6. Spec-driven UI Wave0: T-085..T-089.
7. Governance/red-lines: T-083 / T-084.

Opus verdict: 03 Technical is ready for staged ACP implementation.

## Claude Sonnet — Labeling polish

Report:

- `_meta/reviews/2026-05-03-sonnet-labeling-polish-closeout.md`

Main changes:

- Fixed module-index/master-index mismatches for:
  - NPD;
  - Settings;
  - Technical;
  - Planning;
  - Production;
  - Warehouse taxonomy entries.

- Corrected stale line ranges:
  - scanner indexes, especially flow-other / flow-consume / flow-register / flow-pick / flow-receive / login;
  - production modal indexes after `release_wo_modal` deprecation shifted lines.

- Fixed taxonomy violations:
  - invalid component_type / ui_pattern / interaction / complexity values in scanner, warehouse, planning, production entries.

- Added high-value JSX source anchors, no visual rewrites:
  - scanner done screens;
  - scanner PIN setup/change;
  - scanner camera;
  - production START modal.

- Added explicit `UI-PROTOTYPE-PARITY-POLICY.md` references to UI tasks in:
  - 04 Planning Basic: 30 UI tasks;
  - 06 Scanner P1: 29 UI tasks.

Sonnet verdict: Labeling is ready for staged ACP implementation. Universal `data-prototype-label` coverage is still optional future polish, not a blocker, because external indexes are canonical.

## Hermes validation after Opus/Sonnet

Command group:

```bash
cd /Users/mariuszkrawczyk/Projects/monopilot-kira
python3 _meta/atomic-tasks/00-foundation/_validate.py
python3 _meta/atomic-tasks/01-npd/_validate.py
python3 _meta/atomic-tasks/02-settings/_validate.py
python3 _meta/atomic-tasks/03-technical/_validate.py
python3 _meta/atomic-tasks/04-planning-basic/_validate.py
python3 _meta/atomic-tasks/05-warehouse/_validate.py
python3 _meta/atomic-tasks/06-scanner-p1/_validate.py
python3 _meta/atomic-tasks/07-planning-ext/_validate.py
python3 _meta/atomic-tasks/08-production/_validate.py
```

Results:

- 00 Foundation: PASS — 52 tasks.
- 01 NPD: PASS — 100 tasks.
- 02 Settings: PASS — 127 tasks.
- 03 Technical: PASS — 90 tasks.
- 04 Planning Basic: PASS — 65 tasks.
- 05 Warehouse: PASS — 57 tasks.
- 06 Scanner P1: PASS — 48 tasks.
- 07 Planning Ext: PASS — 57 tasks.
- 08 Production: PASS — 55 tasks.

Custom validation:

- 651 ACP task payloads checked.
- Required ACP top-level shape OK.
- Required `kira_dev` pipeline_inputs OK.
- Dependencies are concrete local `T-XXX` IDs.
- Prototype JSON parses.
- Referenced JSX files exist.
- Checked line ranges do not exceed current file lengths.

Result:

- `CUSTOM_ACP_AND_PROTO_OK`

Whitespace/conflict validation:

- `git diff --check`: PASS.

## Remaining non-blocking follow-ups

1. Universal source-level `data-prototype-label` anchors are still not complete across every JSX file. This is optional because the canonical source is external prototype index + master-index.
2. 03 Technical dedicated prototype build for TEC-014/025/031/045/052 remains optional. Opus made the current state implementation-ready through spec-driven anchors.
3. `available_lp_picker` and `wo_reservations_panel` are spec-driven and will get source anchors when production UI exists.
4. 09 Quality exact task IDs are still pending; 05/06/08 use typed external Quality contracts until 09 is hardened.
5. Working tree is very dirty and should be reviewed/split before commit.

## Current diff size after polish

Latest observed diff stat:

- 604 files changed;
- 18,960 insertions;
- 4,663 deletions.

Latest observed `git status --short | wc -l`:

- 721 entries.

No commit was made.
