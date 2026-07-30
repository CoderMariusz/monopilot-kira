/**
 * Food-safety expiry boundary — proven against real Postgres, ROLLED BACK.
 *
 * Defect: both consume guards (`lp-safety-guard.ts`, warehouse
 * `scanner/movement.ts`) wrote `lp.expiry_date::date < current_date`. BOTH sides
 * are session-zone dependent — the cast re-reads the timestamptz in the session
 * TimeZone and `current_date` is the session zone's date. Production runs UTC,
 * the plants are Europe/Warsaw, so every night between 00:00 and 02:00 Warsaw
 * time the session date was still YESTERDAY and an expired pallet passed.
 *
 * The 00:00-02:00 window is reproduced deterministically here: the site row is
 * repointed (inside the transaction) at a timezone whose LOCAL time right now is
 * between 00:00 and 02:00, so "01:30 site-local" holds whenever this test runs.
 */
import { readFileSync } from 'node:fs';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { expiredBySiteDaySql } from '../site/site-day';
import { getOwnerConnection } from '../../../../packages/db/test-utils/test-pool.js';

const DEMO_ORG = '00000000-0000-0000-0000-000000000002';
const DEMO_USER = '00000000-0000-0000-0000-000000000000';
const DEMO_SITE = '359242c6-7dfe-40e7-a486-42d8e2966126';
const ORG_TOKEN = '11111111-2222-4333-8444-555555555577';
const SITE_TOKEN = '11111111-2222-4333-8444-666666666677';

/** The expression both guards carried before this fix. */
const OLD_EXPIRED_SQL = `(probe.exp is not null and probe.exp::date < current_date)`;
const NEW_EXPIRED_SQL = expiredBySiteDaySql('probe.exp', 'probe.site');

/** Session zones a real deployment can present. None may change the verdict. */
const SESSION_ZONES = ['UTC', 'Europe/London', 'Europe/Warsaw', 'Pacific/Niue', 'Pacific/Kiritimati'];

type Verdict = { yesterday: boolean; today: boolean; tomorrow: boolean };

const run = process.env.DATABASE_URL ? describe : describe.skip;

// Runs without a database: the PG proof below exercises the SQL, this pins the
// two guards to it so nobody reintroduces `::date < current_date` in either one.
describe('both consume guards share ONE expiry boundary', () => {
  const guards = [
    new URL('./lp-safety-guard.ts', import.meta.url),
    new URL('../warehouse/scanner/movement.ts', import.meta.url),
  ];

  it.each(guards.map((u) => [u.pathname.split('/').slice(-2).join('/'), u] as const))(
    '%s reads expiry through expiredBySiteDaySql and never through current_date',
    (_name, url) => {
      const src = readFileSync(url, 'utf8');
      expect(src).toContain(`\${expiredBySiteDaySql('lp.expiry_date', 'lp.site_id')} as expired`);
      expect(src).not.toContain('current_date');
    },
  );
});

run('LP expiry boundary is the SITE day, not the session day (real Postgres)', () => {
  let owner: pg.Pool;
  let client: pg.PoolClient;
  let nightZone: string;

  /**
   * Probes are UTC-midnight timestamps — the shape the writers store — for the
   * site-local day before / of / after "today at the site".
   */
  const probesCte = `(
    select p.label, p.exp, $1::uuid as site
      from (
        select 'yesterday' as label,
               ((date(pg_catalog.now() at time zone (select timezone from public.sites where id = $1::uuid)) - 1)::timestamp at time zone 'UTC') as exp
        union all
        select 'today',
               ((date(pg_catalog.now() at time zone (select timezone from public.sites where id = $1::uuid)))::timestamp at time zone 'UTC')
        union all
        select 'tomorrow',
               ((date(pg_catalog.now() at time zone (select timezone from public.sites where id = $1::uuid)) + 1)::timestamp at time zone 'UTC')
      ) p
  ) probe`;

  async function verdicts(expr: string): Promise<Verdict> {
    const { rows } = await client.query<{ label: string; expired: boolean }>(
      `select probe.label, (${expr}) as expired from ${probesCte}`,
      [DEMO_SITE],
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.expired]));
    return { yesterday: byLabel.yesterday!, today: byLabel.today!, tomorrow: byLabel.tomorrow! };
  }

  beforeAll(async () => {
    owner = getOwnerConnection();
    client = await owner.connect();
    await client.query('begin');
    await client.query(`set local timezone = 'UTC'`);

    // A timezone that is RIGHT NOW inside the 00:00-02:00 window — the exact
    // slot the finding describes, made deterministic at any wall-clock time.
    const { rows } = await client.query<{ name: string }>(
      `select name from pg_timezone_names
        where extract(hour from (pg_catalog.now() at time zone name)) < 2
          and name like 'Etc/GMT%'
        order by name limit 1`,
    );
    nightZone = rows[0]!.name;
    await client.query(`update public.sites set timezone = $2 where id = $1::uuid`, [DEMO_SITE, nightZone]);

    await client.query(
      `insert into app.session_org_contexts (session_token, user_id, org_id) values ($1::uuid, $2::uuid, $3::uuid)`,
      [ORG_TOKEN, DEMO_USER, DEMO_ORG],
    );
    await client.query(
      `insert into app.session_site_contexts (session_token, user_id, org_id, site_id) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
      [SITE_TOKEN, DEMO_USER, DEMO_ORG, DEMO_SITE],
    );
    await client.query(`set local role app_user`);
    await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [ORG_TOKEN, DEMO_ORG]);
    await client.query(`select app.set_site_context($1::uuid, $2::uuid)`, [SITE_TOKEN, DEMO_SITE]);
  });

  afterAll(async () => {
    await client.query('rollback').catch(() => undefined);
    client.release();
  });

  it('the site really is inside the 00:00-02:00 window the finding names', async () => {
    const { rows } = await client.query<{ local_hour: number }>(
      `select extract(hour from (pg_catalog.now() at time zone $1))::int as local_hour`,
      [nightZone],
    );
    expect(rows[0]!.local_hour).toBeLessThan(2);
  });

  it('BLOCKS an LP that expired yesterday, PASSES tomorrow, PASSES today', async () => {
    const v = await verdicts(NEW_EXPIRED_SQL);
    expect(v.yesterday).toBe(true);
    expect(v.tomorrow).toBe(false);
    // Counter-control: same-day expiry is still USABLE today. so-actions
    // (`expiry_date >= current_date`), mrp + po-form-data
    // (`expiry_date >= coalesce($n::date, current_date)`) and expiry-actions
    // (days_left = 0 is the red tier, not a block) all agree. Flipping this to
    // `<=` would freeze good raw material on its last legal day.
    expect(v.today).toBe(false);
  });

  it('the verdict no longer depends on the session TimeZone (it used to)', async () => {
    const fresh: Array<{ zone: string; now: Verdict; old: Verdict }> = [];
    for (const zone of SESSION_ZONES) {
      await client.query(`set local timezone = '${zone}'`);
      fresh.push({ zone, now: await verdicts(NEW_EXPIRED_SQL), old: await verdicts(OLD_EXPIRED_SQL) });
    }
    await client.query(`set local timezone = 'UTC'`);

    const distinctNew = new Set(fresh.map((f) => JSON.stringify(f.now)));
    expect([...distinctNew]).toHaveLength(1);
    expect(JSON.parse([...distinctNew][0]!)).toEqual({ yesterday: true, today: false, tomorrow: false });

    // ...and the OLD expression really did flip with the session zone, so this
    // test fails loudly if anyone reintroduces `::date < current_date`.
    const distinctOld = new Set(fresh.map((f) => JSON.stringify(f.old)));
    expect(distinctOld.size).toBeGreaterThan(1);
    // At least one session zone let an ALREADY-EXPIRED pallet through.
    expect(fresh.some((f) => f.old.yesterday === false)).toBe(true);
  });
});
