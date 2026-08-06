/**
 * F2 — "today" must be the SITE-local day, evaluated by real Postgres.
 *
 * Runs the exact SQL the dashboards emit inside an org context (app_user, org
 * bound through `app.set_org_context`) and compares it against the old UTC
 * expressions. Everything is inside a transaction that is ROLLED BACK.
 *
 * The demo SITE is `Europe/Warsaw` while its ORG row says `UTC` — the exact
 * shape of the defect: `sites.timezone` was set and had no effect. Warsaw local
 * midnight is 1-2h before UTC midnight, which is the window in which an output
 * used to be filed under the wrong day.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SITE_DAY_START_SQL, siteDayWindowPredicate } from './site-day';
import { getOwnerConnection } from '../../../../packages/db/test-utils/test-pool.js';

const DEMO_ORG = '00000000-0000-0000-0000-000000000002';
const DEMO_USER = '00000000-0000-0000-0000-000000000000';
/**
 * Demo plant — `sites.timezone = 'Europe/Warsaw'`, while the org row says 'UTC'.
 * Resolved by (org_id, site_code): mig 266 inserts the row WITHOUT an explicit id,
 * so the uuid differs on every freshly migrated database — a hardcoded literal only
 * matched the one database that happened to generate it.
 */
const DEMO_SITE_CODE = 'SITE-DEMO-01';
const ORG_TOKEN = '11111111-2222-4333-8444-555555555555';
const SITE_TOKEN = '11111111-2222-4333-8444-666666666666';
/** Literal the code carried before this fix (production/_actions/dashboard-data.ts:194). */
const UTC_DAY_START_SQL = `(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')`;
/** Literal the waste/shifts/downtime screens carried — no zone, so cast in the SESSION zone. */
const NAKED_UTC_DAY_START_SQL = `(date_trunc('day', now() at time zone 'UTC'))::timestamptz`;

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('site-local day boundary (real Postgres)', () => {
  let owner: pg.Pool;
  let client: pg.PoolClient;

  beforeAll(async () => {
    owner = getOwnerConnection();
    client = await owner.connect();
    await client.query('begin');
    // Session zone deliberately NOT UTC: it must not influence any boundary.
    await client.query(`set local timezone = 'Europe/London'`);
    const { rows: siteRows } = await client.query<{ id: string }>(
      `select id::text from public.sites where org_id = $1::uuid and site_code = $2`,
      [DEMO_ORG, DEMO_SITE_CODE],
    );
    const demoSite = siteRows[0]?.id;
    if (!demoSite) throw new Error(`demo site ${DEMO_SITE_CODE} missing for org ${DEMO_ORG} (mig 266)`);
    // Both trust rows must be written BEFORE dropping to app_user (revoked from it).
    await client.query(
      `insert into app.session_org_contexts (session_token, user_id, org_id)
       values ($1::uuid, $2::uuid, $3::uuid)`,
      [ORG_TOKEN, DEMO_USER, DEMO_ORG],
    );
    await client.query(
      `insert into app.session_site_contexts (session_token, user_id, org_id, site_id)
       values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
      [SITE_TOKEN, DEMO_USER, DEMO_ORG, demoSite],
    );
    await client.query(`set local role app_user`);
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [ORG_TOKEN, DEMO_ORG]);
    await client.query(`select app.set_site_context($1::uuid, $2::uuid)`, [SITE_TOKEN, demoSite]);
  });

  afterAll(async () => {
    await client.query('rollback').catch(() => undefined);
    client.release();
  });

  it('resolves the bound SITE timezone, not UTC (and not the org row, which says UTC)', async () => {
    const { rows } = await client.query<{ site_start: string; utc_start: string; naked_start: string; expected: string }>(
      `select ${SITE_DAY_START_SQL}::text                                                       as site_start,
              ${UTC_DAY_START_SQL}::text                                                        as utc_start,
              ${NAKED_UTC_DAY_START_SQL}::text                                                  as naked_start,
              (date_trunc('day', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw')::text as expected`,
    );
    const row = rows[0]!;
    expect(row.site_start).toBe(row.expected);
    // The three boundaries really are different — that was the whole defect.
    expect(row.site_start).not.toBe(row.utc_start);
    expect(row.site_start).not.toBe(row.naked_start);
  });

  it('excludes the half hour before site midnight and includes the half hour after', async () => {
    const predicate = siteDayWindowPredicate('probe.ts', 1);
    const { rows } = await client.query<{ before_midnight: boolean; after_midnight: boolean; utc_drops_night_shift: boolean }>(
      `select bool_or(probe.ts < ${SITE_DAY_START_SQL} and (${predicate}))  as before_midnight,
              bool_or(probe.ts > ${SITE_DAY_START_SQL} and (${predicate}))  as after_midnight,
              bool_or(probe.ts > ${SITE_DAY_START_SQL}
                      and probe.ts < ${UTC_DAY_START_SQL})                  as utc_drops_night_shift
         from (values (${SITE_DAY_START_SQL} - interval '30 minutes'),
                      (${SITE_DAY_START_SQL} + interval '30 minutes')) as probe(ts)`,
    );
    const row = rows[0]!;
    // 30 min BEFORE site midnight belongs to yesterday...
    expect(row.before_midnight).toBe(false);
    // ...30 min after belongs to today.
    expect(row.after_midnight).toBe(true);
    // ...and that same instant is BEFORE the old UTC boundary, so "Output today"
    // dropped it — the night-shift hour the finding describes (Warsaw is ahead
    // of UTC, so its local day opens before the UTC one).
    expect(row.utc_drops_night_shift).toBe(true);
  });

  it('a multi-day window still ends at the site-local end of today', async () => {
    const { rows } = await client.query<{ spans_seven_days: boolean }>(
      `select bool_and(inside) as spans_seven_days
         from (
           select (${siteDayWindowPredicate('probe.ts', 7)}) as inside
             from (values (${SITE_DAY_START_SQL} - interval '6 days'),
                          (${SITE_DAY_START_SQL} + interval '23 hours 59 minutes')) as probe(ts)
         ) q`,
    );
    expect(rows[0]!.spans_seven_days).toBe(true);
  });
});
