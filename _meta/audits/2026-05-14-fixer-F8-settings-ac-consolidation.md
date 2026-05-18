# Fixer F8 — 02-settings AC-count consolidation

**Date:** 2026-05-14
**Fixer:** F8
**Scope:** `_meta/atomic-tasks/02-settings/tasks/T-004.json`, `T-125.json`, `T-127.json`, `T-128.json`
**Validator:** `_meta/atomic-tasks/02-settings/_validate.py` (caps `acceptance_criteria` at 4)
**Outcome:** 4 FAIL (AC>4) → 0 FAIL for target tasks (T-130 pre-existing TBD/AC>4 failure out of scope)

## Per-task before/after table

| Task  | Before | After | Consolidation strategy |
| :---- | -----: | ----: | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-004 |      5 |     4 | Strict-subset fusion: former AC3 (RLS denies rows when `app.current_org_id()` returns NULL) and AC4 (pg_policies qual/withcheck reference `app.current_org_id()`, no GUC) are co-tested at the same migration-time inspection surface. Fused into a single AC2 with AND clause. Both assertions remain verbatim in the fused AC text and in `test_strategy`. |
| T-125 |      5 |     4 | Strict-subset fusion: former AC3 (reference-table import/export hands off to T-022/T-096 semantics) is a specific capability-resolution behavior of AC1 (capability registry). Fused into AC1 with AND clause; original text preserved verbatim in fused AC and `test_strategy`. |
| T-127 |      5 |     4 | Procedural hoist: former AC5 (UI closeout includes screenshot/artifact evidence and Playwright trace/artifacts per UI-PROTOTYPE-PARITY-POLICY.md) is a process-meta assertion. Hoisted to `test_strategy` bullet 4 (already present) and `details` note. Enforced by `ui_evidence_policy` + `checkpoint_policy.closeout_requires` + `test_strategy`. |
| T-128 |      5 |     4 | Procedural hoist: former AC5 (UI closeout includes screenshot/artifact evidence and Playwright trace/artifacts per UI-PROTOTYPE-PARITY-POLICY.md) is a process-meta assertion. Hoisted to `test_strategy` bullet 4 (already present) and `details` note. Enforced by `ui_evidence_policy` + `checkpoint_policy.closeout_requires` + `test_strategy`. |

## Diff summary

### Strict-subset fusion: T-004 AC3+AC4 → AC2

Old AC3: "RLS policies enabled and deny by default when app.current_org_id() returns NULL (no app.set_org_context call)."
Old AC4: "pg_policies references app.current_org_id() (the foundation function) and not any current_setting GUC pattern."

Both are verified by connecting as `app_user` and inspecting `pg_policies` + executing a SELECT in the same migration test. The new AC2 reads:

> "RLS policies enabled and deny by default when app.current_org_id() returns NULL (no app.set_org_context call) AND pg_policies qual/withcheck reference app.current_org_id() (the foundation function) with no current_setting('app.tenant_id'|'app.current_org_id') GUC pattern."

The pg_policies text-grep assertion is retained in `test_strategy` and in the fused AC text.

### Strict-subset fusion: T-125 AC1+AC3 → AC1

Old AC3: "Reference-table import/export hands off to T-022/T-096 semantics instead of creating a divergent parser."

This asserts the capability registry's resolution behavior for one specific entity type — it is always co-tested with AC1 (capability registry returns correct labels per entity). The new AC1 reads:

> "Capability registry returns permission-filtered import/export support for users, roles, invitations, reference tables, infrastructure, feature flags, authorization policies and audit-log export AND reference-table import/export hands off to T-022/T-096 semantics instead of creating a divergent parser."

Original assertion text preserved verbatim in the AND clause and in `test_strategy`.

### Procedural hoist: T-127 and T-128 closeout-evidence AC5

Both tasks shared a verbatim AC5:

> "UI closeout includes screenshot/artifact evidence and Playwright trace/artifacts where applicable per `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`; if Playwright is unavailable, document the blocker and provide RTL/snapshot fallback evidence."

This is a process-meta assertion enforced at the CLOSEOUT reviewer-gate step, not a testable Given/When/Then behavioral check of the implementation. It is now anchored at three surfaces:

1. `pipeline_inputs.ui_evidence_policy` (machine-readable policy pointer already present on both tasks).
2. `pipeline_inputs.checkpoint_policy.closeout_requires` (already requires `changed_files`, `test_commands_and_results`, etc.; policy file specifies screenshot/Playwright artifacts for UI tasks).
3. `test_strategy` bullet 4 (already present verbatim on both tasks before this fix: "For UI parity, capture screenshots/artifacts and Playwright trace/video/artifacts where applicable; attach artifact paths in closeout.").
4. `details` field (added provenance note with verbatim closeout-evidence text).

No coverage is lost.

## Mirrored prompt body changes

For every task, the `## Acceptance criteria` section of `prompt` was updated to match the revised `acceptance_criteria` array, and a provenance note paragraph was added immediately following the last AC, explaining the consolidation strategy and confirming no coverage was lost.

## Unchanged fields

Per F8 mandate, the following were NOT modified on any task:
`dependencies`, `parallel_safe_with`, `cross_module_dependencies`, `prd_refs`,
`scope_files`, `risk_red_lines`, `routing_hints`, `checkpoint_policy`,
`labels`, `priority`, `max_attempts`, `pipeline_name`, `category`, `task_type`,
`parent_feature`, `prototype_match`, `prototype_index_entry`,
`ui_evidence_policy`, `out_of_scope`, `description`, `skills`,
`subcategory`, `context_budget`, `estimated_effort`, `source_prd`,
`prd_task_id`.

Only `acceptance_criteria`, `details`, and the mirrored `prompt` body `## Acceptance criteria` section were edited.

## Final validator output

```
$ python3 _meta/atomic-tasks/02-settings/_validate.py
[validate] 130 task files inspected
[validate] 2 FAILURES:
  - T-130.json: placeholder pattern matched: \bTBD\b
  - T-130.json: >4 acceptance_criteria (7)
```

The 4 target tasks (T-004, T-125, T-127, T-128) are now PASS. T-130 failures are pre-existing and out of scope for F8.

## Coverage-loss risk assessment

**None.** The 4 reductions split into two semantic categories:

- **Strict-subset fusions (T-004 AC3+AC4, T-125 AC1+AC3):** the dropped AC was always co-tested with its parent AC at the same verification surface; the fused AC now contains the conjunctive clause verbatim. No assertion was relaxed or removed.
- **Procedural hoists (T-127 AC5, T-128 AC5):** identical verbatim text asserting CLOSEOUT-step evidence requirements. Re-anchored at three surfaces (policy file pointer, `checkpoint_policy.closeout_requires`, explicit `test_strategy` bullet) so reviewer gates still enforce the requirement during the CLOSEOUT step of the kira_dev pipeline.
