---
name: MON-api-transaction-safety
description: Add-on guidance for MON-t2-api when implementing or reviewing transaction-heavy Server Actions and SQL. Covers withOrgContext commit-on-return behavior, validation-before-write ordering, throw-to-rollback, aggregate fanout, and ON CONFLICT deduplication.
tags:
  - monopilot
  - server-actions
  - transactions
  - withOrgContext
  - sql
  - api
---

# MON-api-transaction-safety

## Purpose

This skill is an overlay for `MON-t2-api`. Use it when a Server Action writes data, emits outbox/audit rows, performs multi-step state changes, runs SQL aggregates, or uses `INSERT ... SELECT ... ON CONFLICT`.

The core rule: `withOrgContext` commits on normal return and rolls back only on throw. Returning `{ ok: false }` from inside the callback is still a successful transaction return.

## When To Use

- Any `apps/web/app/**/_actions/*.ts` mutation.
- Any action that writes more than one row/table.
- Any action that validates state both before and after a write.
- Any query that aggregates before/after joins.
- Any `INSERT ... SELECT` with `ON CONFLICT`.

## Required Reading

1. `.claude/skills/MON-t2-api/SKILL.md`
2. `packages/db/src/with-org-context.ts`
3. The action's tests and task acceptance criteria
4. Any SQL text being executed by the action, exactly as shipped

## `withOrgContext` Commit-On-Return Trap

Inside the callback:

```ts
return withOrgContext(async ({ client }) => {
  await client.query('insert ...');
  return { ok: false, error: 'late_failure' };
});
```

This commits the `insert`. It does not roll back.

### Safe Patterns

Validate before writing:

```ts
const parsed = Input.safeParse(raw);
if (!parsed.success) return { ok: false, error: 'invalid_input' };

return withOrgContext(async ({ client }) => {
  const current = await readCurrentState(client, parsed.data.id);
  if (!current.ok) return { ok: false, error: current.error };

  await client.query('insert ...');
  return { ok: true };
});
```

Throw after writing when failure should abort:

```ts
class RollbackDomainError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

try {
  return await withOrgContext(async ({ client }) => {
    await client.query('insert ...');

    if (lateInvariantFailed) {
      throw new RollbackDomainError('invalid_state');
    }

    return { ok: true };
  });
} catch (err) {
  if (err instanceof RollbackDomainError) {
    return { ok: false, error: err.code };
  }
  throw err;
}
```

Keep the mapping outside the transaction so the thrown error forces rollback.

## Validation Ordering Rule

Order checks by cost and side effect:

1. Parse and validate input with zod before opening the transaction.
2. Rate-limit before opening the transaction where possible.
3. Inside `withOrgContext`, check permission and target existence before writes.
4. Check state-transition preconditions before writes.
5. Perform all writes and outbox/audit rows.
6. Only after all required writes succeed, return `{ ok: true }`.

If a precondition can only be known after a write, treat failure as exceptional for rollback.

## Transaction Review Checklist

For every action:

- Mark the first `insert`, `update`, `delete`, helper write, outbox insert, audit insert, or function call with side effects.
- Inspect every later `return { ok: false }`.
- If the return happens after a write, require proof the write is intentionally committed; otherwise require throw-to-rollback.
- Check helpers: any helper that opens its own pool/connection can commit outside the caller's rollback boundary. Pass the active `client`.
- Tests must assert database absence on at least one failing path after the first planned write.

## SQL Aggregate Fanout Rule

If a query aggregates parent rows and also joins a many-side table such as roles, permissions, tags, lines, assignments, or comments, aggregate at the parent grain first.

Wrong:

```sql
select
  wo.id,
  sum(op.downtime_minutes * op.cost_per_minute) / count(role.id) as downtime_cost
from work_orders wo
join operations op on op.wo_id = wo.id
left join operation_roles role on role.operation_id = op.id
group by wo.id;
```

Right:

```sql
with op_cost as (
  select
    op.id,
    op.wo_id,
    sum(op.downtime_minutes * op.cost_per_minute) as downtime_cost
  from operations op
  group by op.id, op.wo_id
),
wo_cost as (
  select wo_id, sum(downtime_cost) as downtime_cost
  from op_cost
  group by wo_id
)
select
  wo.id,
  wc.downtime_cost,
  array_agg(role.role_code) as roles
from work_orders wo
join wo_cost wc on wc.wo_id = wo.id
left join operations op on op.wo_id = wo.id
left join operation_roles role on role.operation_id = op.id
group by wo.id, wc.downtime_cost;
```

Tests must include a parent with at least two child rows on the many side.

## `ON CONFLICT` Dedup Rule

Postgres can still fail with `ON CONFLICT cannot affect row a second time` when the source query contains two rows that conflict with each other after normalization.

Wrong:

```sql
insert into public.reference_values (org_id, key)
select $1::uuid, app.normalize_key(raw_key)
from staging_values
on conflict (org_id, key) do nothing;
```

Right:

```sql
with normalized as (
  select distinct
    $1::uuid as org_id,
    app.normalize_key(raw_key) as key
  from staging_values
)
insert into public.reference_values (org_id, key)
select org_id, key
from normalized
on conflict (org_id, key) do nothing;
```

If non-key columns differ, choose one deterministically with `distinct on (org_id, key) ... order by ...`.

## Required Tests

For transaction-heavy actions:
- success path commits all intended rows,
- pre-write invalid input writes nothing,
- post-write simulated failure rolls back all prior writes,
- outbox/audit rows commit atomically with the state change.

For aggregate SQL:
- fixture with one parent and multiple joined child rows,
- assertion on derived metrics, not only headline totals.

For `ON CONFLICT`:
- fixture with two raw values that normalize to the same conflict key,
- assertion that the statement succeeds and only one target row exists.

## Closeout Notes

In closeout, explicitly state:
- where the first write occurs,
- whether any post-write failure path exists,
- how rollback is tested,
- whether aggregate CTE grain was verified,
- whether `ON CONFLICT` source deduplication was needed.
