# Wave 14 Codex re-review — commit 3caef844

## Scope verified

- Commit `3caef844` adds the two requested `.pg.test.ts` files and updates only `_meta/plans/wave-14-summary.md`; `import-po.ts`, `import-to.ts`, `create-purchase-order-core.ts`, and `create-transfer-order-core.ts` are unchanged in this fix round.
- Both files gate on `DATABASE_URL` with `describe.skip`, import `getOwnerConnection` / `getAppConnection` at the correct depth, and seed/assert through real PostgreSQL owner queries.
- Both use the real `withOrgContext` test-stub path (`NEXT_SERVER_ACTION_ACTOR_USER_ID` / `NEXT_SERVER_ACTION_ORG_ID`). They do **not** define or call the explicit `bindOrg` helper used by some older pg tests; the imported action binds its own session token inside `withOrgContext`, so this does not make the persisted-state assertions mocked.
- PO all-or-nothing supplies a valid first group and a blocked-supplier second group. The blocked supplier is loaded by import validation, then rejected by `createPurchaseOrderCore`, so the failure occurs at runtime after group 1's real insert. It asserts both PO counts and the import-job count are zero. The `skip_invalid` contrast proves group 1 and one import job commit.
- TO all-or-nothing lets the first real core call persist, forces the second core call to return `persistence_failed`, and queries `public.transfer_orders` plus `public.import_export_jobs` after the importer returns. Its `skip_invalid` contrast proves order 1 and one import job commit. The second failure is injected, but the transaction and persisted-state assertions are real.
- SQL aliases (`count`) are not reserved, parameters are cast appropriately, and cleanup is org-scoped and ordered before tenant/org deletion.

## Finding

### Medium — rollback tests do not assert the requested audit-row invariant

- `{severity: medium, file: apps/web/app/[locale]/(app)/(modules)/planning/purchase-orders/_actions/__tests__/import-po-rollback.pg.test.ts:195, claim: The all-or-nothing test deletes audit_events during setup but never queries it after the importer call. Therefore it does not prove the requested "no import-job/audit row persisted" invariant., suggested-fix: Add an org-scoped countAuditEvents helper and assert zero after the all-or-nothing call (and, if audit creation is part of successful importer behavior, assert the expected positive count in the contrast test).}`
- `{severity: medium, file: apps/web/app/[locale]/(app)/(modules)/planning/transfer-orders/_actions/__tests__/import-to-rollback.pg.test.ts:201, claim: The TO test has the same omission: audit_events is cleaned but never asserted after rollback, so it is not fully the requested same-shape proof., suggested-fix: Add the equivalent org-scoped persisted audit count assertion.}`

## Test evidence

Command:

`pnpm --filter web exec vitest run <PO pg test> <TO pg test>`

Raw stdout tail:

```text
Test Files  2 skipped (2)
     Tests  4 skipped (4)
  Start at  14:01:53
  Duration  228ms (transform 84ms, setup 0ms, import 206ms, tests 0ms, environment 0ms)
```

This confirms both files parse and collect cleanly without `DATABASE_URL`; no live-DB execution was possible in this environment.

## Tree proof

`git diff --stat` before writing this report showed no tracked implementation/test changes in the working tree; the existing workspace contained untracked orchestration artifacts and dependency symlinks. This review overwrites only this report.

VERDICT: fail
