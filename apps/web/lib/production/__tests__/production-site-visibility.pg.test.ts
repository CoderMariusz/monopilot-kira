import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getAppConnection,
  getOwnerConnection,
} from '../../../../../packages/db/test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const backfillPath = resolve(repoRoot, 'packages/db/migrations/550-production-site-id-backfill.sql');
const policyPath = resolve(repoRoot, 'packages/db/migrations/551-production-site-visibility-rls.sql');
const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const personaEmail = 'persona.single-site-operator@monopilot.test';

describe('550/551 production site visibility migration files', () => {
  it('backfills all three production tables and installs restrictive policies', () => {
    expect(existsSync(backfillPath)).toBe(true);
    expect(existsSync(policyPath)).toBe(true);

    const backfill = readFileSync(backfillPath, 'utf8');
    const policy = readFileSync(policyPath, 'utf8');
    for (const table of ['wo_outputs', 'wo_events', 'downtime_events']) {
      expect(backfill).toMatch(new RegExp(`update public\\.${table}`, 'i'));
      expect(policy).toMatch(new RegExp(`create policy ${table}_site_visibility`, 'i'));
    }
    expect(policy.match(/as\s+restrictive\s+for\s+all\s+to\s+app_user/gi)).toHaveLength(3);
    expect(policy).toMatch(/select\s+p_site_id\s+is\s+not\s+null\s+and/i);
    expect(policy).not.toMatch(/or\s+p_site_id\s+is\s+null/i);
  });
});

const run = databaseUrl ? describe : describe.skip;

run('single_site_operator production site visibility (real Postgres)', () => {
  let owner: pg.Pool;
  let app: pg.Pool;
  let originalDatabaseUrlApp: string | undefined;
  let orgId: string;
  let userId: string;
  let siteA: string;
  let siteB: string;
  let createdSiteB = false;
  const fixtureIds = {
    outputA: randomUUID(),
    outputB: randomUUID(),
    eventA: randomUUID(),
    eventB: randomUUID(),
    downtimeA: randomUUID(),
    downtimeB: randomUUID(),
  };
  const transactions = Array.from({ length: 4 }, () => randomUUID());

  function appConnectionString(): string {
    const url = new URL(databaseUrl!);
    url.username = 'app_user';
    url.password = appUserPassword;
    return url.toString();
  }

  async function cleanup(): Promise<void> {
    await owner.query(`delete from public.wo_events where id = any($1::uuid[])`, [
      [fixtureIds.eventA, fixtureIds.eventB],
    ]);
    await owner.query(`delete from public.downtime_events where id = any($1::uuid[])`, [
      [fixtureIds.downtimeA, fixtureIds.downtimeB],
    ]);
    await owner.query(`delete from public.wo_outputs where id = any($1::uuid[])`, [
      [fixtureIds.outputA, fixtureIds.outputB],
    ]);
    if (createdSiteB) {
      await owner.query(`delete from public.sites where id = $1::uuid`, [siteB]);
    }
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');

    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = appConnectionString();
    owner = getOwnerConnection();
    app = getAppConnection();

    const migrationClient = await owner.connect();
    migrationClient.on('notice', (notice) => {
      console.info(`[postgres notice] ${notice.message}`);
    });
    try {
      await migrationClient.query('begin');
      await migrationClient.query(readFileSync(backfillPath, 'utf8'));
      await migrationClient.query('rollback');
      console.info('[migration 550 dry-run] rolled back');

      await migrationClient.query('begin');
      await migrationClient.query(readFileSync(backfillPath, 'utf8'));
      await migrationClient.query('commit');

      await migrationClient.query('begin');
      await migrationClient.query(readFileSync(policyPath, 'utf8'));
      await migrationClient.query('commit');
    } catch (error) {
      await migrationClient.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      migrationClient.release();
    }

    const postMigrationCounts = await owner.query<{
      table_name: string;
      total: number;
      site_id_null: number;
    }>(
      `select table_name, count(*)::integer as total,
              count(*) filter (where site_id is null)::integer as site_id_null
         from (
           select 'wo_outputs'::text as table_name, site_id from public.wo_outputs
           union all
           select 'wo_events', site_id from public.wo_events
           union all
           select 'downtime_events', site_id from public.downtime_events
         ) production_rows
        group by table_name
        order by table_name`,
    );
    console.info(`[post-migration site_id counts] ${JSON.stringify(postMigrationCounts.rows)}`);

    const persona = await owner.query<{ user_id: string; org_id: string; site_id: string }>(
      `select u.id::text as user_id, u.org_id::text as org_id, us.site_id::text as site_id
         from public.users u
         join public.user_sites us on us.user_id = u.id and us.org_id = u.org_id
        where u.email::text = $1
        limit 1`,
      [personaEmail],
    );
    expect(persona.rowCount, `${personaEmail} must have one site assignment`).toBe(1);
    userId = persona.rows[0]!.user_id;
    orgId = persona.rows[0]!.org_id;
    siteA = persona.rows[0]!.site_id;

    const otherSite = await owner.query<{ id: string }>(
      `select s.id::text as id
         from public.sites s
        where s.org_id = $1::uuid
          and s.id <> $2::uuid
          and not exists (
            select 1 from public.user_sites us
             where us.user_id = $3::uuid and us.org_id = s.org_id and us.site_id = s.id
          )
        order by s.id
        limit 1`,
      [orgId, siteA, userId],
    );
    siteB = otherSite.rows[0]?.id ?? randomUUID();
    if (otherSite.rowCount === 0) {
      createdSiteB = true;
      await owner.query(
        `insert into public.sites (id, org_id, site_code, name, timezone, created_by)
         values ($1::uuid, $2::uuid, $3, 'H2 policy fixture site B', 'UTC', $4::uuid)`,
        [siteB, orgId, `H2-${siteB.slice(0, 8)}`, userId],
      );
    }

    const source = await owner.query<{
      wo_id: string;
      product_id: string;
      category_id: string;
      line_id: string;
    }>(
      `select wo.id::text as wo_id,
              out.product_id::text as product_id,
              dt.category_id::text as category_id,
              dt.line_id
         from public.work_orders wo
         join public.wo_outputs out on out.wo_id = wo.id and out.org_id = wo.org_id
         join public.downtime_events dt on dt.wo_id = wo.id and dt.org_id = wo.org_id
        where wo.org_id = $1::uuid
        order by wo.id
        limit 1`,
      [orgId],
    );
    expect(source.rowCount, 'persona org needs the supplied output+downtime fixture').toBe(1);
    const seed = source.rows[0]!;

    await owner.query(
      `insert into public.wo_outputs
         (id, org_id, site_id, transaction_id, wo_id, output_type, product_id,
          batch_number, qty_kg, uom, qa_status)
       values
         ($1, $2, $3, $4, $5, 'primary', $6, $7, 1, 'kg', 'PENDING'),
         ($8, $2, $9, $10, $5, 'primary', $6, $11, 1, 'kg', 'PENDING')`,
      [
        fixtureIds.outputA, orgId, siteA, transactions[0], seed.wo_id, seed.product_id,
        `H2-A-${fixtureIds.outputA}`, fixtureIds.outputB, siteB, transactions[1],
        `H2-B-${fixtureIds.outputB}`,
      ],
    );
    await owner.query(
      `insert into public.wo_events
         (id, org_id, site_id, wo_id, transaction_id, event_type, to_status, actor_user_id)
       values
         ($1, $2, $3, $4, $5, 'start', 'in_progress', $6),
         ($7, $2, $8, $4, $9, 'start', 'in_progress', $6)`,
      [
        fixtureIds.eventA, orgId, siteA, seed.wo_id, transactions[2], userId,
        fixtureIds.eventB, siteB, transactions[3],
      ],
    );
    await owner.query(
      `insert into public.downtime_events
         (id, org_id, site_id, line_id, wo_id, category_id, source, started_at)
       values
         ($1, $2, $3, $4, $5, $6, 'manual', pg_catalog.now()),
         ($7, $2, $8, $4, $5, $6, 'manual', pg_catalog.now())`,
      [
        fixtureIds.downtimeA, orgId, siteA, seed.line_id, seed.wo_id, seed.category_id,
        fixtureIds.downtimeB, siteB,
      ],
    );
  });

  afterAll(async () => {
    if (!owner) return;
    await cleanup().catch(() => undefined);
    await app?.end();
    await owner.end();
    if (originalDatabaseUrlApp === undefined) delete process.env.DATABASE_URL_APP;
    else process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
  });

  it('sees all three rows from site A and none from site B', async () => {
    const token = randomUUID();
    await owner.query(
      `insert into app.session_org_contexts (session_token, org_id, user_id)
       values ($1::uuid, $2::uuid, $3::uuid)`,
      [token, orgId, userId],
    );
    const client = await app.connect();
    try {
      await client.query('begin');
      await client.query(`select app.set_org_context($1::uuid, $2::uuid)`, [token, orgId]);
      const nullVisibility = await client.query<{ visible: boolean }>(
        `select app.user_can_see_site(null) as visible`,
      );
      expect(nullVisibility.rows[0]?.visible).toBe(false);
      console.info('[NULL visibility] user_can_see_site(NULL)=false');

      for (const [table, ownId, foreignId] of [
        ['wo_outputs', fixtureIds.outputA, fixtureIds.outputB],
        ['wo_events', fixtureIds.eventA, fixtureIds.eventB],
        ['downtime_events', fixtureIds.downtimeA, fixtureIds.downtimeB],
      ] as const) {
        const visible = await client.query<{ id: string }>(
          `select id::text as id from public.${table} where id = any($1::uuid[]) order by id`,
          [[ownId, foreignId]],
        );
        expect(visible.rows.map((row) => row.id), `${table}: own visible, site B hidden`).toEqual([ownId]);
        console.info(`[counter-control] ${table}: site_A_visible=1 site_B_visible=0`);
      }
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
      await owner.query(`delete from app.session_org_contexts where session_token = $1::uuid`, [token]);
    }
  });
});
