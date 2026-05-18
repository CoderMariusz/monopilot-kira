# Permission-enum addition — audit summary

Date: 2026-05-14
Author: Opus (per-module permission-enum task batch)
Scope: 8 modules (`01-npd`, `03-technical`, `04-planning-basic`, `05-warehouse`, `06-scanner-p1`, `07-planning-ext`, `08-production`, `09-quality`).
Trigger: `_meta/audits/2026-05-14-prd-vs-tasks-coverage-gaps.md` §"Permission strings" / `top-10 #4` — every `<module>.*.*` PRD capability must be added to `packages/rbac/src/permissions.enum.ts` or the ESLint enum-lock guard (02-settings T-046) will block downstream module work at compile time.

---

## New tasks added

| Module | Task ID | Path | Permission count | Namespace prefix |
|---|---|---|---:|---|
| 01-npd | T-101 | `_meta/atomic-tasks/01-npd/tasks/T-101.json` | 17 | `npd.*` (+ one `brief.create`) |
| 03-technical | T-091 | `_meta/atomic-tasks/03-technical/tasks/T-091.json` | 10 | `technical.*` |
| 04-planning-basic | T-066 | `_meta/atomic-tasks/04-planning-basic/tasks/T-066.json` | 15 | `planning.*` |
| 05-warehouse | T-058 | `_meta/atomic-tasks/05-warehouse/tasks/T-058.json` | 12 | `warehouse.*` |
| 06-scanner-p1 | T-049 | `_meta/atomic-tasks/06-scanner-p1/tasks/T-049.json` | 10 | `scanner.*` |
| 07-planning-ext | T-058 | `_meta/atomic-tasks/07-planning-ext/tasks/T-058.json` | 11 | `scheduler.*` |
| 08-production | T-056 | `_meta/atomic-tasks/08-production/tasks/T-056.json` | 17 | `production.*` |
| 09-quality | T-037 | `_meta/atomic-tasks/09-quality/tasks/T-037.json` | 13 | `quality.*` |
| **Total** | | | **105** | |

---

## Per-module permission strings

### 01-npd (T-101) — 17 strings

`brief.create`, `npd.project.delete`, `npd.core.write`, `npd.dashboard.view`, `npd.d365_builder.execute`, `npd.closed_flag.unset`, `npd.schema.edit`, `npd.rule.edit`, `npd.risk.write`, `npd.compliance_doc.write`, `npd.formulation.create_draft`, `npd.formulation.lock`, `npd.recipe.submit_for_trial`, `npd.pilot.promote_to_bom`, `npd.gate.advance`, `npd.gate.approve`, `npd.bom.export`.

PRD source: §2.2 RBAC matrix lines 173-191, §17.9 Stage-Gate, §18 Risk, §19 Compliance, §10.7 BOM export.

Rationale: `FG_CREATE` / `FG_EDIT` / `BRIEF_CONVERT_TO_NPD_PROJECT` already exist in `permissions.enum.ts` with legacy aliases (`fa.create` / `fa.edit` / `brief.convert_to_fa`). The remaining 17 PRD capabilities are added under `npd.*` (with `brief.create` retained at the brief namespace per PRD wording). The cross-module `npd.released_product_edit.{request,authorize}` strings are already Settings-owned (02-settings T-002) and are intentionally NOT re-added here.

### 03-technical (T-091) — 10 strings

`technical.items.create`, `technical.items.edit`, `technical.items.deactivate`, `technical.bom.create`, `technical.bom.approve`, `technical.bom.version_publish`, `technical.bom.generate_batch`, `technical.allergens.edit`, `technical.cost.edit`, `technical.d365.sync_trigger`.

PRD source: §3 Permission surface lines 94-99. Note: the cross-module `technical.product_spec.approve` is Settings-owned (02-settings T-002) and not duplicated here.

### 04-planning-basic (T-066) — 15 strings

`planning.supplier.create`, `planning.supplier.delete`, `planning.po.create`, `planning.po.approve`, `planning.po.close`, `planning.to.create`, `planning.to.ship`, `planning.to.receive`, `planning.wo.create`, `planning.wo.release`, `planning.wo.override`, `planning.wo.release_to_warehouse`, `planning.dashboard.view`, `planning.settings.edit`, `planning.d365.so_trigger_run`.

PRD source: §3 Permission surface lines 130-142 (wildcards `planning.supplier.*` / `planning.po.*` / `planning.to.*` / `planning.wo.*` expanded to explicit 3-segment verbs to satisfy the enum-lock regex). Naming conflict resolved: PRD original `integration.d365.so_trigger.run` is 4 segments and therefore invalid; renamed to `planning.d365.so_trigger_run` to keep the consumer ownership clear and the regex valid.

### 05-warehouse (T-058) — 12 strings

`warehouse.grn.create`, `warehouse.lp.split`, `warehouse.lp.merge`, `warehouse.lp.block`, `warehouse.lp.move`, `warehouse.qa_status.change`, `warehouse.adjustment.approve`, `warehouse.fefo.override`, `warehouse.scanner_lock.force_release`, `warehouse.settings.edit`, `warehouse.dashboard.view`, `warehouse.inventory_value.view`.

PRD source: §3 Permission surface table lines 119-135 + §6.6 (FR-WH-036 force-unlock) + §14.5 (V-WH-DASH-001 server-side inventory value gate).

Naming conflict resolved: audit flagged `wh.*` as the assumed prefix; chose canonical `warehouse.*` to match (a) Settings's `settings.*` lower-case-prefix convention and (b) the table-naming pattern (`warehouses`, not `whs`). The audit's parenthetical `wh.*` is treated as informal shorthand.

### 06-scanner-p1 (T-049) — 10 strings

`scanner.access.base`, `scanner.receive.execute`, `scanner.move.execute`, `scanner.pick.execute`, `scanner.output.execute`, `scanner.qa.inspect`, `scanner.fefo_override.approve`, `scanner.lp.unlock`, `scanner.session.terminate`, `scanner.pin.reset`.

PRD source: §12.5 role hierarchy + §12.6 supervisor authorities.

Naming conflict resolved: PRD §12.5 line 1125 uses `scanner.access` (2 segments) which would fail the regex `^[a-z_]+\.[a-z_]+\.[a-z_]+$`. Renamed to `scanner.access.base` to preserve intent while passing the validator. Similarly the PRD role labels `warehouse.operator` / `production.operator` / `quality.inspector` / `scanner.supervisor` / `scanner.admin` are **role names**, not permissions — left out of the enum; the four scanner workflow verbs (`receive`, `move`, `pick`, `output`) + `qa.inspect` cover their authority surface.

### 07-planning-ext (T-058) — 11 strings

`scheduler.run.execute`, `scheduler.run.read`, `scheduler.assignment.approve`, `scheduler.assignment.override`, `scheduler.assignment.reject`, `scheduler.assignment.bulk_approve`, `scheduler.matrix.edit`, `scheduler.matrix.publish`, `scheduler.forecast.upload`, `scheduler.forecast.read`, `scheduler.settings.edit`.

PRD source: §3.2 RBAC matrix + OQ-EXT-06 bulk-approve scope clarification + §8 SCR-07-04 Scheduler Settings.

Naming conflict resolved: audit flagged `sched.*` as the assumed prefix; chose `scheduler.*` to match table names (`scheduler_runs`, `scheduler_assignments`) and PRD wording.

### 08-production (T-056) — 17 strings

`production.wo.start`, `production.wo.pause`, `production.wo.resume`, `production.wo.complete`, `production.consumption.write`, `production.consumption.override_approve`, `production.output.write`, `production.output.catch_weight_override`, `production.waste.write`, `production.waste.overthreshold_approve`, `production.downtime.write`, `production.downtime.taxonomy_edit`, `production.changeover.write`, `production.allergen_gate.sign_first`, `production.allergen_gate.sign_second`, `production.d365_dlq.replay`, `production.oee.read`.

PRD source: §3.2 RBAC matrix lines 192-202 + §12 D365 DLQ + §13 OEE.

Design choice: allergen changeover dual sign-off is split into two distinct permissions (`sign_first` and `sign_second`) to enforce SoD — a single role grant cannot satisfy both signatures.

### 09-quality (T-037) — 13 strings

`quality.hold.create`, `quality.hold.release`, `quality.spec.approve`, `quality.inspection.execute`, `quality.inspection.assign`, `quality.ncr.create`, `quality.ncr.close_critical`, `quality.ccp.deviation_override`, `quality.haccp.plan_edit`, `quality.batch.release`, `quality.dashboard.view`, `quality.settings.edit`, `quality.audit.export`.

PRD source: §2.3 RBAC matrix lines 77-85 + §6.4 NCR + §6.5 HACCP + §8 QA-031A inspection.assign + §8 QA-060 settings admin + §2.2 auditor 7y export.

Note: Allergen dual-sign permissions are owned by 08-PRODUCTION (`production.allergen_gate.sign_{first,second}`) per cross-module decision; 09-QUALITY's `quality_lead` consumes the `sign_second` permission rather than declaring its own.

---

## Resolved naming conflicts

1. **`scanner.access` (2-segment) → `scanner.access.base`** — PRD §12.5 line 1125 declares the base role as `scanner.access`, which fails the `^[a-z_]+\.[a-z_]+\.[a-z_]+$` regex. Suffix `.base` preserves intent and unblocks the enum-lock guard.
2. **`integration.d365.so_trigger.run` (4-segment) → `planning.d365.so_trigger_run`** — PRD §3 line 142 has a 4-segment string; collapsed the last two segments to keep ownership in `planning` and stay within 3 dots.
3. **Prefix shorthand normalised** — audit's parenthetical `wh.*` and `sched.*` shorthand mapped to canonical `warehouse.*` / `scheduler.*` to match table names and the existing `settings.*` lowercase-full-word convention.
4. **NPD legacy aliases left intact** — `FG_CREATE` / `FG_EDIT` / `BRIEF_CONVERT_TO_NPD_PROJECT` are already present with `LegacyPermissionAlias` mapping `fa.create` / `fa.edit` / `brief.convert_to_fa`. T-101 explicitly does NOT remove or rename them and adds `brief.create` (a new, distinct permission for creating a brief, separate from converting one).
5. **Workflow Authorization permissions** (`settings.authorization.*`, `npd.released_product_edit.*`, `technical.product_spec.approve`) are already owned by 02-settings T-002 and are NOT duplicated in any of the 8 new tasks.

---

## Process notes

- Task JSONs follow the 02-settings T-001 gold standard: title, multi-section prompt (Goal / Implementation contract / Permission strings / Files / AC G-W-T / Test strategy RED-first vitest / Risk red lines / Closeout evidence), pipeline_inputs with `category: "auth"`, `subcategory: "permissions-enum"`, `task_type: "T1-schema"`, dependencies linking to 02-settings T-001 + T-046 via `cross_module_dependencies`, `parallel_safe_with` listing the other 7 sibling tasks, full checkpoint policy, and standard `routing_hints`.
- Each task's `acceptance_criteria` contains exactly 4 ACs: presence, regex+uniqueness, `ALL_<MODULE>_PERMISSIONS` typed array length, CODEOWNERS architect-only.
- Each task's `pipeline_inputs.permission_strings` is a literal array — downstream agents can copy/paste without re-parsing the prompt.
- JSON-validated all 8 files (`python3 -c "import json; json.load(open(p))"`).
- Manifests updated for 7 modules (01/03/04/05/06/07/08); `task_count` incremented and task path appended. 07-planning-ext required the richer `{id, file, title, priority}` object shape and was handled separately.
- Coverage.md appended for 7 modules with a new "Permission-enum addition 2026-05-14" section.
- **09-quality is the exception**: its manifest.json and coverage.md do not yet exist (parallel agent is bootstrapping them per audit gap §09-Quality). T-037.json was written to `tasks/` only; manifest/coverage row should be picked up by the parallel agent when it lands manifest.json + coverage.md. If the parallel agent finishes before this batch is reviewed, append a row for `tasks/T-037.json` under "Permission-enum addition 2026-05-14".

---

## Follow-up suggestions (not in scope of this batch)

- After all 8 tasks GREEN, run a cross-module dedupe sweep to verify no module reused a string owned by another (`ALL_PERMISSIONS.length === sum(ALL_<MODULE>_PERMISSIONS.length)`).
- Consider deprecating `LegacyPermissionAlias` once D365 importers have all migrated off `fa.*` / `brief.convert_to_fa`.
- The audit's broader RBAC gaps (`AUDIT_READ`, `OUTBOX_ADMIN`, `IMPERSONATE_ORG`) are Foundation-owned and already in the enum; no action here.
- Foundation `GDPR right-to-erasure` and `apps/worker` scaffold are separate audit BLOCKERS — not addressed by this batch.
