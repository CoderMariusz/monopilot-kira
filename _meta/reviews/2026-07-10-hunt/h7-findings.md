# Static bug hunt — Quality, holds, and production QA

## Findings

### P1 — Creating a WO hold destroys every production output’s prior QA state

Evidence: [hold-actions.ts:337](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/hold-actions.ts:337)

`createHoldCore` directly updates production-owned `wo_outputs`:

```sql
update public.wo_outputs
set qa_status = 'ON_HOLD'
where wo_id = $1
```

This affects every output for the WO regardless of whether it was `PENDING`, `PASSED`, or `FAILED`. No previous status is stored in the hold, hold items, or history, so a previously failed or passed output becomes indistinguishable from a pending output after the hold is applied.

It also violates the canonical ownership boundary: Quality directly mutates a table owned by `08-production`.

Concrete failure: a batch output already marked `FAILED` is changed to `ON_HOLD`; downstream code can no longer distinguish its failed QA decision from an ordinary hold.

Suggested fix: route this through a production-owned transition API and persist each output’s pre-hold state, or represent the hold orthogonally without overwriting `wo_outputs.qa_status`.

---

### P1 — Passing a `wo_output` inspection releases its LP but leaves the output QA decision pending

Evidence: [inspection-actions.ts:356](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:356), [output-qa-actions.ts:89](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/production/_actions/output-qa-actions.ts:89)

For a passed `wo_output` inspection, Quality obtains the output’s LP and invokes only `releaseLpQaForContext`. It never transitions the corresponding `wo_outputs.qa_status`. The production-owned action is the code that separately changes that status from `PENDING` to `PASSED` or `FAILED`.

Concrete failure: the signed inspection becomes `passed` and its LP becomes `released`/available for downstream use, while the canonical production output remains `PENDING`. The two QA read models disagree, and the LP is usable before the production output records a passing decision.

Suggested fix: introduce a production-owned atomic transition that records the output decision and applies the LP side effect together; call that transition from the signed inspection flow.

---

### P1 — CCP and inspection holds are deduplicated against unrelated active holds

Evidence: [haccp-actions.ts:238](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/haccp-actions.ts:238), [haccp-actions.ts:267](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/haccp-actions.ts:267), [inspection-actions.ts:266](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:266), [inspection-actions.ts:286](/Users/mariuszkrawczyk/Projects/monopilot-kira/apps/web/app/[locale]/(app)/(modules)/quality/_actions/inspection-actions.ts:286)

Both `createCcpDeviationHoldIfMissing` and `createInspectionHoldIfMissing` treat any active hold with the same `(reference_type, reference_id)` as satisfying the new safety event. They do not check the hold’s reason, originating deviation/inspection, or affected-item set.

For CCP breaches, the unrelated hold is then linked to the new deviation instead of creating a CCP-specific hold.

Concrete failure:

1. An LP has an open administrative hold.
2. A CCP breach occurs for the LP.
3. The breach reuses the administrative hold and creates no independent CCP hold.
4. Releasing the older administrative hold removes the only gate, even though the CCP deviation has not had its own hold disposition.

For WO holds, reuse can also omit newly produced LPs from `quality_hold_items`.

Suggested fix: make hold idempotency specific to the originating safety event, such as an immutable source type/source ID stored in structured columns or `ext_jsonb`. Never deduplicate solely by target reference.

## CLEAN areas verified

- `quality_holds` remains org-global by design; migration 385 correctly removes the unsafe site-restrictive policy while retaining org RLS.
- Hold, inspection, CCP-deviation, NCR, LP, and WO queries reviewed consistently bind `org_id` through `app.current_org_id()`.
- Hold release and CCP deviation resolution require e-signatures.
- CCP deviation resolution deliberately does not auto-release its linked hold.
- LP release paths inspected use the canonical active-hold guard before setting `qa_status='released'`.
- CCP limit comparisons use decimal-string/`bigint` scaling rather than floating-point arithmetic.
- NCR creation from a WO-linked CCP breach derives the NCR’s `site_id` from the WO.
- No `tenant_id` leakage was found in the inspected flows.

## Not covered

- UI parity, accessibility, localization packs, and parity-evidence tests.
- Complaints/CAPA, specifications, recall drills, traceability mass balance, and cold-chain behavior beyond their hold-related references.
- Warehouse and shipping workflows except where called directly by Quality/production QA.
- Live Supabase trigger execution, migration dry-runs, and runtime RLS behavior.
- Dynamic tests; this was a read-only static review and no test suite was run.
- The explicitly excluded known bugs, including the hold-release blanket QA reset, were not reported.

No files were modified.
