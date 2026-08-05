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
 * The SAME defect survived on the whole EGRESS side — pick / pack / ship / SO
 * allocation each carried its own bare `current_date`, so a pallet that
 * production and the scanner refused was still pickable, packable and
 * shippable. All six sites now share this ONE boundary.
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

const CALL = `\${expiredBySiteDaySql('lp.expiry_date', 'lp.site_id')}`;

/**
 * Every site that decides "is this pallet past its expiry", with the EXACT
 * fragment it must carry. Five keep the BLOCKED rows, `so-actions` keeps the
 * USABLE ones — hence `not`. Mechanically pasting the block form into the
 * allocation filter would let ONLY expired pallets be allocated, so the
 * direction is pinned here per site, not assumed.
 */
const GUARDS: ReadonlyArray<readonly [string, URL, string]> = [
  ['production/lp-safety-guard.ts', new URL('./lp-safety-guard.ts', import.meta.url), `${CALL} as expired`],
  ['scanner/movement.ts', new URL('../warehouse/scanner/movement.ts', import.meta.url), `${CALL} as expired`],
  ['shipping/pick-actions.ts', new URL('../../app/[locale]/(app)/(modules)/shipping/_actions/pick-actions.ts', import.meta.url), `and ${CALL}`],
  ['shipping/ship-actions.ts', new URL('../../app/[locale]/(app)/(modules)/shipping/_actions/ship-actions.ts', import.meta.url), `or ${CALL} )`],
  ['shipping/pack-lp-into-box.ts', new URL('../shipping/pack-lp-into-box.ts', import.meta.url), `or ${CALL} )`],
  ['shipping/so-actions.ts', new URL('../../app/[locale]/(app)/(modules)/shipping/_actions/so-actions.ts', import.meta.url), `and not ${CALL}`],
];

// Runs without a database: the PG proof below exercises the SQL, this pins every
// guard to it so nobody reintroduces a bare `current_date` comparison.
describe('every expiry guard shares ONE boundary', () => {
  it.each(GUARDS)('%s reads expiry through expiredBySiteDaySql, never current_date', (_name, url, fragment) => {
    const src = readFileSync(url, 'utf8');
    expect(src).toContain(fragment);
    // Targeted, not blanket: `so-actions` legitimately uses current_date for the
    // sales-order ORDER date. Only the food-safety comparison is forbidden.
    expect(src).not.toMatch(/expiry_date(::date)?\s*[<>]=?\s*current_date/);
  });
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

    // Real rows in the real table, so the egress guards are proven against
    // license_plates under RLS — not only against a synthetic probe CTE.
    await client.query(
      `insert into public.license_plates
         (org_id, site_id, warehouse_id, product_id, lp_number, quantity, uom, status, qa_status, expiry_date)
       select $1::uuid, $2::uuid,
              (select id from public.warehouses where org_id = $1::uuid order by id limit 1),
              (select id from public.items where org_id = $1::uuid order by id limit 1),
              p.label, 10, 'kg', 'available', 'released',
              ((date(pg_catalog.now() at time zone (select timezone from public.sites where id = $2::uuid)) + p.offs)::timestamp
                 at time zone 'UTC')
         from (values ('SITE-DAY-PROOF-1-EXPIRED-YESTERDAY', -1),
                      ('SITE-DAY-PROOF-2-VALID-TODAY', 0),
                      ('SITE-DAY-PROOF-3-VALID-TOMORROW', 1)) p(label, offs)`,
      [DEMO_ORG, DEMO_SITE],
    );
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

  // BOTH directions on REAL license_plates rows. A guard that rejects
  // everything also "lets no expired pallet through", so the valid rows are
  // half of the proof, not decoration.
  it('egress BLOCKS the expired pallet and still PASSES the valid ones (real rows)', async () => {
    const { rows } = await client.query<{
      lp_number: string;
      egress_blocks: boolean;
      so_allocatable: boolean;
      old_guard_blocks: boolean;
    }>(
      `select lp.lp_number,
              ${expiredBySiteDaySql('lp.expiry_date', 'lp.site_id')}     as egress_blocks,
              not ${expiredBySiteDaySql('lp.expiry_date', 'lp.site_id')} as so_allocatable,
              (lp.expiry_date is not null and lp.expiry_date < current_date) as old_guard_blocks
         from public.license_plates lp
        where lp.org_id = app.current_org_id()
          and lp.lp_number like 'SITE-DAY-PROOF-%'
        order by lp.lp_number`,
    );
    // eslint-disable-next-line no-console -- this table IS the evidence
    console.log('[site-day egress proof]', JSON.stringify(rows));

    expect(rows).toHaveLength(3);
    const [expired, today, tomorrow] = rows;

    // Direction 1 — expired by the SITE day is refused by pick/pack/ship and
    // dropped by SO allocation, while the OLD `current_date` guard let it pass.
    expect(expired!.egress_blocks).toBe(true);
    expect(expired!.so_allocatable).toBe(false);
    expect(expired!.old_guard_blocks).toBe(false);

    // Direction 2 — valid stock still ships. Same-day expiry is usable today.
    for (const ok of [today!, tomorrow!]) {
      expect(ok.egress_blocks).toBe(false);
      expect(ok.so_allocatable).toBe(true);
    }
  });
});
