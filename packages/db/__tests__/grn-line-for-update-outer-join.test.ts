/**
 * R07-04 — `FOR UPDATE OF` may not name the nullable side of an outer join.
 *
 * `cancelGrnLine` loaded the GRN line it was about to reverse with
 *
 *     from public.grn_items gi
 *     left join public.grns g on g.org_id = gi.org_id and g.id = gi.grn_id
 *     ... for update of gi, g
 *
 * Postgres rejects that combination while planning the statement:
 *   0A000 — FOR UPDATE cannot be applied to the nullable side of an outer join
 * so EVERY receipt cancellation in production failed on the validation read,
 * before the LP return, the GRN line cancellation, the stock move and the WAC
 * reversal. The operator saw only "We could not cancel this receipt line."
 *
 * WHY THIS TEST MUST HIT A REAL DATABASE: the rule lives in the planner, not in
 * the SQL text. A query-mock test passes whether the join is LEFT or INNER —
 * which is precisely how the defect reached production. The only way to fail on
 * a regression is to hand both statements to Postgres.
 *
 * Safety: both statements bind a random uuid, so they match no row, take no
 * lock and write nothing. 0A000 is raised at plan time, before any row is read.
 *
 * Fixed in apps/web/app/[locale]/(app)/(modules)/warehouse/_actions/
 * receipt-corrections-actions.ts (`loadGrnLineForUpdate`): the join to
 * public.grns is now INNER. That loses nothing — grn_items.grn_id is NOT NULL,
 * so the outer join never admitted a row an inner join drops. The pol/po joins
 * in the same query stay LEFT precisely because they are not locked.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'grn-line-for-update-outer-join.test.ts is mandatory and requires DATABASE_URL (local Postgres via pnpm db:up). Refusing silent skip.',
  );
}

/** The shape that shipped and failed: `g` is left-joined AND locked. */
const OUTER_JOIN_LOCK = `select gi.id::text, g.status
       from public.grn_items gi
       left join public.grns g
         on g.org_id = gi.org_id
        and g.id = gi.grn_id
      where gi.id = $1::uuid
      limit 1
      for update of gi, g`;

/** The fix: identical, except `g` is inner-joined. */
const INNER_JOIN_LOCK = `select gi.id::text, g.status
       from public.grn_items gi
       join public.grns g
         on g.org_id = gi.org_id
        and g.id = gi.grn_id
      where gi.id = $1::uuid
      limit 1
      for update of gi, g`;

describe('R07-04 — FOR UPDATE OF on an outer join (live Postgres)', () => {
  let pool: pg.Pool;

  beforeAll(() => {
    pool = getOwnerConnection();
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('is a controlled comparison — the two statements differ only in the join keyword', () => {
    expect(OUTER_JOIN_LOCK.replace('left join', 'join')).toBe(INNER_JOIN_LOCK);
  });

  it('rejects the pre-fix LEFT JOIN lock with 0A000', async () => {
    await expect(pool.query(OUTER_JOIN_LOCK, [randomUUID()])).rejects.toMatchObject({
      code: '0A000',
      message: expect.stringContaining('nullable side of an outer join'),
    });
  });

  it('accepts the shipped INNER JOIN lock', async () => {
    const result = await pool.query(INNER_JOIN_LOCK, [randomUUID()]);
    expect(result.rows).toEqual([]);
  });

  it('confirms grn_items.grn_id is NOT NULL, so the INNER join drops no row', async () => {
    const { rows } = await pool.query<{ is_nullable: string }>(
      `select is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'grn_items'
          and column_name = 'grn_id'`,
    );
    expect(rows[0]?.is_nullable).toBe('NO');
  });
});
