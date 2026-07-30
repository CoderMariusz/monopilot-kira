/**
 * F1 — a brand-new organization must be able to resolve a write site, otherwise
 * onboarding step 2 (first warehouse) dead-ends on `no_active_site` and there is
 * no screen that could create one (Settings -> Sites is behind the onboarding
 * redirect).
 *
 * Drives the REAL resolution queries from `lib/site/site-context.ts` against a
 * freshly inserted org, plus the anti-regression cases the seed could plausibly
 * break: the demo org the pilot runs on, and a fixture that inserts its OWN
 * default site right after creating an org (the shape used by
 * packages/db/__tests__/owner-org-context.ts and ~20 other pg fixtures).
 *
 * Everything runs in ONE transaction that is rolled back.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../../../../packages/db/test-utils/test-pool.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const migrationPath = resolve(repoRoot, 'packages/db/migrations/560-org-default-site-seed.sql');
const DEMO_ORG = '00000000-0000-0000-0000-000000000002';

/** getActiveSiteId, org-default branch — site-context.ts:91-96. */
const DEFAULT_SITE_SQL = `select id::text as id
   from public.sites
  where org_id = $1::uuid and is_default and is_active
  limit 1`;
/** resolveWriteSiteId, single-active-site fallback — site-context.ts:139-144. */
const WRITE_SITE_SQL = `select id::text as id
   from public.sites
  where org_id = $1::uuid and is_active
  order by is_default desc, site_code asc
  limit 2`;

const run = process.env.DATABASE_URL ? describe : describe.skip;

run('mig 560 — first site exists for every organization (real Postgres)', () => {
  let owner: pg.Pool;
  let client: pg.PoolClient;

  /** Reuses the demo org's tenant — `organizations.tenant_id` is FK-constrained. */
  let tenantId: string;

  async function insertOrg(name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values (gen_random_uuid(), $2::uuid, $1, 'generic')
       returning id::text as id`,
      [name, tenantId],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    owner = getOwnerConnection();
    client = await owner.connect();
    await client.query('begin');
    const tenant = await client.query<{ tenant_id: string }>(
      `select tenant_id::text as tenant_id from public.organizations where id = $1::uuid`,
      [DEMO_ORG],
    );
    tenantId = tenant.rows[0]!.tenant_id;
    await client.query(readFileSync(migrationPath, 'utf8'));
  });

  afterAll(async () => {
    await client.query('rollback').catch(() => undefined);
    client.release();
  });

  it('a brand-new org resolves BOTH site-resolution queries (the onboarding deadlock)', async () => {
    const orgId = await insertOrg('Seed Test Plant');

    const asDefault = await client.query(DEFAULT_SITE_SQL, [orgId]);
    const asWrite = await client.query(WRITE_SITE_SQL, [orgId]);

    // getActiveSiteId must find a default → withSiteContext write mode no longer fails closed.
    expect(asDefault.rows).toHaveLength(1);
    // resolveWriteSiteId must be unambiguous → onboarding step 2 can insert the warehouse.
    expect(asWrite.rows).toHaveLength(1);
    expect(asWrite.rows[0]).toEqual(asDefault.rows[0]);
  });

  it('the seeded site carries the org name and timezone, and is editable master data', async () => {
    const orgId = await insertOrg('Warszawa Zakład');
    const { rows } = await client.query<{ site_code: string; name: string; timezone: string; is_active: boolean }>(
      `select site_code, name, timezone, is_active from public.sites where org_id = $1::uuid`,
      [orgId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ site_code: 'SITE-01', name: 'Warszawa Zakład', timezone: 'Europe/Warsaw', is_active: true });
  });

  it('the backfill left the demo org (the pilot) exactly as it was', async () => {
    const { rows } = await client.query<{ site_code: string }>(
      `select site_code from public.sites where org_id = $1::uuid order by site_code`,
      [DEMO_ORG],
    );
    expect(rows.map((r) => r.site_code)).toEqual(['SITE-DEMO-01', 'UI022A']);
  });

  it('a fixture inserting its OWN default site still works (no 23505 on idx_sites_default)', async () => {
    const orgId = await insertOrg('Fixture Org');
    const fixtureSite = randomUUID();

    await expect(
      client.query(
        `insert into public.sites (id, org_id, site_code, name, is_default, is_active, timezone)
         values ($1::uuid, $2::uuid, 'FX-SITE', 'Fixture Site', true, true, 'Europe/London')`,
        [fixtureSite, orgId],
      ),
    ).resolves.toBeTruthy();

    const { rows } = await client.query<{ id: string; site_code: string }>(DEFAULT_SITE_SQL, [orgId]);
    // The fixture's site wins; the seed was demoted, not duplicated.
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(fixtureSite);
    const defaults = await client.query<{ n: string }>(
      `select count(*)::text as n from public.sites where org_id = $1::uuid and is_default`,
      [orgId],
    );
    expect(defaults.rows[0]!.n).toBe('1');
  });

  it('re-running the seed for an org that already has a site is a no-op', async () => {
    const orgId = await insertOrg('Idempotent Org');
    await client.query(`select public.seed_default_site_for_org($1::uuid)`, [orgId]);
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.sites where org_id = $1::uuid`,
      [orgId],
    );
    expect(rows[0]!.n).toBe('1');
  });
});
