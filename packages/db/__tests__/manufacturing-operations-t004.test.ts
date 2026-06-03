import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedManufacturingOperations } from '../seeds/manufacturing-operations.js';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(packageRoot, 'migrations/078-manufacturing-operations-t004.sql');

const tenantId = '00400000-0000-4000-8000-000000000001';
const bakeryOrgId = '00400000-0000-4000-8000-0000000000b1';
const pharmaOrgId = '00400000-0000-4000-8000-0000000000f1';
const fmcgOrgId = '00400000-0000-4000-8000-0000000000c1';

async function seedOrgContext(adminPool: pg.Pool, sessionToken: string, orgId: string) {
  await adminPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );
}

async function selectOperationsForOrg(
  appPool: pg.Pool,
  adminPool: pg.Pool,
  orgId: string,
  industryCode: string,
) {
  const sessionToken = randomUUID();
  await seedOrgContext(adminPool, sessionToken, orgId);
  const client = await appPool.connect();

  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await client.query<{ operation_name: string; process_suffix: string }>(
      `
        select operation_name, process_suffix
        from "Reference"."ManufacturingOperations"
        where industry_code = $1
        order by operation_seq
      `,
      [industryCode],
    );
    await client.query('rollback');
    return result.rows;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('T-004 manufacturing operations migration static contract', () => {
  it('uses the required 078 migration filename and org_id RLS contract', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('"Reference"."ManufacturingOperations"');
    expect(migration).toMatch(/\borg_id\b/);
    expect(migration).not.toMatch(/\btenant_id\b/);
    expect(migration).toMatch(/app\.current_org_id\s*\(\s*\)/);
    expect(migration).not.toMatch(/current_setting\s*\(\s*'app\.(tenant_id|current_org_id)'/i);
    expect(migration).toMatch(/enable\s+row\s+level\s+security/i);
    expect(migration).toMatch(/force\s+row\s+level\s+security/i);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."ManufacturingOperations"\s+to\s+app_user/i);
  });

  it('declares per-org uniqueness for operation names and process suffixes', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toMatch(/unique\s*\(\s*org_id\s*,\s*operation_name\s*\)/i);
    expect(migration).toMatch(/unique\s*\(\s*org_id\s*,\s*process_suffix\s*\)/i);
  });
});

runIntegrationSuite('T-004 Reference.ManufacturingOperations seeds', () => {
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    appPool = getAppConnection();

    await adminPool.query(
      `
        insert into public.tenants (id, name, region_cluster, data_plane_url)
        values ($1, 'T-004 Tenant', 'eu', 'https://t-004.example.test')
        on conflict (id) do update
          set name = excluded.name,
              region_cluster = excluded.region_cluster,
              data_plane_url = excluded.data_plane_url
      `,
      [tenantId],
    );

    await adminPool.query(
      `
        insert into public.organizations (id, tenant_id, name, industry_code)
        values
          ($1, $2, 'T-004 Bakery', 'bakery'),
          ($3, $2, 'T-004 Pharma', 'pharma'),
          ($4, $2, 'T-004 FMCG', 'fmcg')
        on conflict (id) do update
          set tenant_id = excluded.tenant_id,
              name = excluded.name,
              industry_code = excluded.industry_code
      `,
      [bakeryOrgId, tenantId, pharmaOrgId, fmcgOrgId],
    );

    await adminPool.query(
      `delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2, $3)`,
      [bakeryOrgId, pharmaOrgId, fmcgOrgId],
    );

    await seedManufacturingOperations(adminPool, { orgId: bakeryOrgId, industryCode: 'bakery' });
    await seedManufacturingOperations(adminPool, { orgId: pharmaOrgId, industryCode: 'pharma' });
    await seedManufacturingOperations(adminPool, { orgId: fmcgOrgId, industryCode: 'fmcg' });
  });

  afterAll(async () => {
    await adminPool
      ?.query(`delete from "Reference"."ManufacturingOperations" where org_id in ($1, $2, $3)`, [
        bakeryOrgId,
        pharmaOrgId,
        fmcgOrgId,
      ])
      .catch(() => undefined);
    await adminPool
      ?.query(`delete from public.organizations where id in ($1, $2, $3)`, [
        bakeryOrgId,
        pharmaOrgId,
        fmcgOrgId,
      ])
      .catch(() => undefined);
    await adminPool?.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await adminPool?.end();
  });

  it('AC1: bakery seed creates Mix/Knead/Proof/Bake with MX/KN/PR/BK', async () => {
    await expect(selectOperationsForOrg(appPool, adminPool, bakeryOrgId, 'bakery')).resolves.toEqual([
      { operation_name: 'Mix', process_suffix: 'MX' },
      { operation_name: 'Knead', process_suffix: 'KN' },
      { operation_name: 'Proof', process_suffix: 'PR' },
      { operation_name: 'Bake', process_suffix: 'BK' },
    ]);
  });

  it('AC2: duplicate operation name in the same org is rejected', async () => {
    await expect(
      adminPool.query(
        `
          insert into "Reference"."ManufacturingOperations"
            (org_id, operation_name, process_suffix, operation_seq, industry_code)
          values ($1, 'Mix', 'M2', 99, 'bakery')
        `,
        [bakeryOrgId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('risk guard: duplicate process suffix in the same org is rejected', async () => {
    await expect(
      adminPool.query(
        `
          insert into "Reference"."ManufacturingOperations"
            (org_id, operation_name, process_suffix, operation_seq, industry_code)
          values ($1, 'Mixer', 'MX', 99, 'bakery')
        `,
        [bakeryOrgId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('AC3: pharma seed creates Synthesis/Separation/Crystallization/Drying with SY/SE/CZ/DR', async () => {
    await expect(selectOperationsForOrg(appPool, adminPool, pharmaOrgId, 'pharma')).resolves.toEqual([
      { operation_name: 'Synthesis', process_suffix: 'SY' },
      { operation_name: 'Separation', process_suffix: 'SE' },
      { operation_name: 'Crystallization', process_suffix: 'CZ' },
      { operation_name: 'Drying', process_suffix: 'DR' },
    ]);
  });

  it('risk guard: FMCG seed contains only Mix/Fill/Seal/Label defaults', async () => {
    await expect(selectOperationsForOrg(appPool, adminPool, fmcgOrgId, 'fmcg')).resolves.toEqual([
      { operation_name: 'Mix', process_suffix: 'MX' },
      { operation_name: 'Fill', process_suffix: 'FL' },
      { operation_name: 'Seal', process_suffix: 'SL' },
      { operation_name: 'Label', process_suffix: 'LB' },
    ]);
  });
});
