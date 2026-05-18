# Fixer F6 — 05-warehouse AC-count consolidation

**Date:** 2026-05-14
**Fixer:** F6
**Scope:** `_meta/atomic-tasks/05-warehouse/tasks/T-002.json`, `T-048.json`..`T-055.json`
**Validator:** `_meta/atomic-tasks/05-warehouse/_validate.py` (caps `acceptance_criteria` at 4)
**Outcome:** 9 FAIL → 0 FAIL (58 tasks pass)

## Mandate

F1 fixer report (`_meta/audits/2026-05-14-fixer-F1-tenant-and-foundation-citations.md`)
noted that 9 warehouse tasks remained in FAIL state because their
`acceptance_criteria` arrays exceeded the validator's hard cap of 4. F6's job
was to consolidate them without losing coverage — every original assertion
must remain testable post-consolidation, either as a fused AC or as an
explicit check in `test_strategy`.

## Per-task before/after table

| Task   | Before | After | Consolidation strategy                                                                                                                                                                |
| :----- | -----: | ----: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-002  |      5 |     4 | Fused AC5 (pg_policies must reference `app.current_org_id()` with no GUC `current_setting` calls) into AC1 (schema/RLS inspection). The pg_policies text assertion is still explicitly tested in `test_strategy`. |
| T-048  |      6 |     4 | Fused AC5 (every component root has matching `data-prototype-label`) into AC1 (prototype parity comparison). Hoisted AC6 (procedural closeout-evidence) into `test_strategy` + `details` note (still gated by `checkpoint_policy.closeout_requires`). |
| T-049  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-050  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-051  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-052  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-053  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-054  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |
| T-055  |      5 |     4 | Hoisted AC5 (procedural closeout-evidence) into `test_strategy` + `details` note.                                                                                                        |

## Diff summary

### Substantive consolidation: T-002

Old AC5 ("Given pg_policies is inspected... qual/withcheck reference
`app.current_org_id()` and contain no `current_setting('app.tenant_id'|'app.current_org_id')` GUC.")
was a strict subset of the same migration-time verification surface as AC1
(table column / RLS inspection). The new AC1 reads:

> Given the migration runs, when `\d license_plates` and `pg_policies` are
> inspected, then every PRD §5.2 column exists with the documented type and
> nullability, org_id is NOT NULL, RLS+FORCE ROW LEVEL SECURITY are enabled,
> and the license_plates policy qual/withcheck reference `app.current_org_id()`
> with no `current_setting('app.tenant_id'|'app.current_org_id')` GUC.

The pg_policies text-grep assertion is still listed in `test_strategy`
(pg_policies text contains `app.current_org_id()`).

### Substantive consolidation: T-048

Old AC5 ("each implemented surface's root DOM element exposes a matching
`data-prototype-label` from prototype-index-warehouse.json") was a strict
subset of the parity surface and is now fused into AC1 with explicit "AND"
clause. The `test_strategy` already asserts each label by selector — no
coverage loss.

### Procedural hoist: T-048..T-055 closeout-evidence AC

All 8 UI / E2E tasks shared a verbatim AC of the form:

> UI closeout includes screenshot/artifact evidence and Playwright
> trace/artifacts where applicable per
> `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`; if Playwright is
> unavailable, document the blocker and provide RTL/snapshot fallback evidence.

This is a procedural / process-meta assertion, not a Given/When/Then behavioral
verification of the implementation. It is enforced by:

1. `pipeline_inputs.ui_evidence_policy` (machine-readable policy pointer).
2. `pipeline_inputs.checkpoint_policy.closeout_requires` (CLOSEOUT requires
   `changed_files`, `test_commands_and_results`, `acceptance_criteria_status`,
   `deviations_from_prd`, `git_status` — and the policy file specifies that
   parity tasks must additionally attach screenshot/Playwright artifacts).
3. The `test_strategy` array (re-stated explicitly as a "Closeout-evidence
   check (hoisted from former AC5)" bullet in each task).
4. A `details`-field marker recording the consolidation provenance.

No coverage is lost because the closeout-evidence requirement is a reviewer-
gated CLOSEOUT-step verification, not an implementation-time AC, and it is now
explicitly captured at three checkpoint surfaces (policy file + closeout_requires + test_strategy bullet).

## Mirrored prompt body changes

For every task, the `## Acceptance criteria` section of `prompt` was updated
to match the JSON `acceptance_criteria` array exactly, and the dropped
procedural AC was replaced by a "Note: UI closeout must include
screenshot/artifact evidence ... (verified via test_strategy +
checkpoint_policy.closeout_requires; previously a 5th [or 6th] AC, hoisted to
process layer by Fixer F6 2026-05-14)." paragraph immediately following AC4.

## Unchanged fields

Per F6 mandate, the following were NOT modified on any task:
`dependencies`, `parallel_safe_with`, `cross_module_dependencies`, `prd_refs`,
`scope_files`, `risk_red_lines`, `routing_hints`, `checkpoint_policy`,
`labels`, `priority`, `max_attempts`, `pipeline_name`, `category`, `task_type`,
`parent_feature`, `prototype_match`, `prototype_index_entry`,
`ui_evidence_policy`, `out_of_scope`, `description`, `skills`,
`subcategory`, `context_budget`, `estimated_effort`, `source_prd`,
`prd_task_id`.

Only `acceptance_criteria`, `test_strategy`, `details`, and the mirrored
`prompt` body `## Acceptance criteria` section were edited.

## Final validator output

```
$ python3 _meta/atomic-tasks/05-warehouse/_validate.py
Validated 58 tasks
PASS: 58 tasks, manifest + coverage.md OK
```

## Coverage-loss risk assessment

**None.** The 9 reductions split into two semantic categories:

- **Strict-subset fusions (T-002 AC1+AC5, T-048 AC1+AC5):** the dropped AC
  was always co-tested with its parent AC in the same test surface; the fused
  AC now contains the conjunctive clause verbatim. No assertion was relaxed
  or removed.
- **Procedural hoists (T-048 AC6, T-049..T-055 AC5):** identical verbatim text
  across 8 tasks asserting CLOSEOUT-step evidence requirements. Re-anchored at
  three surfaces (policy file pointer, `checkpoint_policy.closeout_requires`,
  explicit `test_strategy` bullet) so reviewer gates still enforce the
  requirement during the CLOSEOUT step of the kira_dev pipeline.

No task required dropping a substantive verification without preservation.
