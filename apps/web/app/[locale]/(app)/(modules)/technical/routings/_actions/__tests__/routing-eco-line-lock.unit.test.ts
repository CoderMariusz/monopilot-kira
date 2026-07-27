/**
 * R-7 — the ECO write path must lock the routing it is about to point at.
 *
 * deleteRouting reads the routing header `for update`, counts referencing ECO
 * lines, then deletes. `technical_change_order_lines.target_id` is polymorphic
 * with no FK, so without a conflicting lock on the ECO side the two transactions
 * interleave: A counts 0 → B inserts its line → A deletes the routing → both
 * commit → B's line is an orphan the moment it is written.
 *
 * `for key share` conflicts with `for update`, so the flows serialize. This test
 * pins the protocol in the code (the lock is taken, on the routing, BEFORE the
 * insert, and the insert is abandoned when the routing is gone); the lock
 * semantics themselves are proven against a real Postgres in
 * packages/db/__tests__/525-routing-reference-guard.test.ts.
 *
 * Lives in the routings suite: the delete guard is what depends on this
 * protocol, and technical/eco owns nothing else in this round.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { replaceEcoLines, type QueryClient } from '../../../eco/_actions/shared';

const CHANGE_ORDER_ID = '66666666-6666-4666-8666-666666666666';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ROUTING_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient({ routingExists = true }: { routingExists?: boolean } = {}) {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalizeSql(sql);
    if (n.includes('from public.routings') && n.includes('for key share')) {
      return routingExists ? { rows: [{ id: ROUTING_ID }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return { rows: [], rowCount: 1 };
  });
  // The real signature is generic (`query<T>`); a concrete mock is not assignable
  // to it, and this module is called directly here rather than through a mocked
  // withOrgContext.
  return { calls, client: { query } as unknown as QueryClient };
}

const routingLine = {
  lineNo: 1,
  action: 'change' as const,
  targetType: 'routing' as const,
  targetId: ROUTING_ID,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('R-7 — replaceEcoLines locks the routing it references', () => {
  it('takes FOR KEY SHARE on the routing before inserting the line', async () => {
    const { calls, client } = makeClient();

    await replaceEcoLines(client, CHANGE_ORDER_ID, USER_ID, [routingLine]);

    const lockIndex = calls.findIndex(
      (c) => normalizeSql(c.sql).includes('from public.routings') && normalizeSql(c.sql).includes('for key share'),
    );
    const insertIndex = calls.findIndex((c) =>
      normalizeSql(c.sql).startsWith('insert into public.technical_change_order_lines'),
    );

    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThanOrEqual(0);
    // Order is the whole point: a lock taken after the insert proves nothing.
    expect(lockIndex).toBeLessThan(insertIndex);
    expect(calls[lockIndex]!.params).toContain(ROUTING_ID);
    // Org-scoped like every other statement in the module.
    expect(normalizeSql(calls[lockIndex]!.sql)).toContain('app.current_org_id()');
    // KEY SHARE, not UPDATE: two ECOs referencing the same routing must not
    // block each other, only a delete of that routing may.
    expect(normalizeSql(calls[lockIndex]!.sql)).not.toContain('for update');
  });

  it('refuses the write when the routing disappeared instead of inserting an orphan', async () => {
    const { calls, client } = makeClient({ routingExists: false });

    await expect(replaceEcoLines(client, CHANGE_ORDER_ID, USER_ID, [routingLine])).rejects.toThrow(
      /no longer exists/i,
    );

    expect(
      calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.technical_change_order_lines')),
    ).toBe(false);
  });

  it('does not lock anything for a line that does not target a routing', async () => {
    const { calls, client } = makeClient();

    await replaceEcoLines(client, CHANGE_ORDER_ID, USER_ID, [
      { lineNo: 1, action: 'change', targetType: 'item', targetId: ITEM_ID },
      // A routing line with no target id points at nothing to lock.
      { lineNo: 2, action: 'change', targetType: 'routing', targetId: null },
    ]);

    expect(calls.some((c) => normalizeSql(c.sql).includes('for key share'))).toBe(false);
    expect(
      calls.filter((c) => normalizeSql(c.sql).startsWith('insert into public.technical_change_order_lines')),
    ).toHaveLength(2);
  });
});
