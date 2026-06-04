import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const migrationPath = resolve(process.cwd(), 'migrations/111-v03-v04-validators.sql');

describe('T-028 V03/V04 validator migration source', () => {
  it('uses the 111 migration slot without creating canonical tables owned by earlier tasks', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.d365_import_cache/i);
    expect(migration).not.toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?"Reference"\."PackSizes"/i);
    expect(migration).toMatch(/app\.current_org_id\(\)/);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+public\.d365_import_cache\s+to\s+app_user/i);
    expect(migration).toMatch(/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."PackSizes"\s+to\s+app_user/i);
    expect(migration).not.toMatch(/\btenant_id\b|current_setting\s*\(\s*['"]app\.(?:tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationSuite('T-028 V03/V04 validator DB smoke', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const sessionTokenA = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-028 Tenant', 'eu', 'https://t-028.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-028 Org A', 'fmcg', 't-028-org-a')
       on conflict (id) do nothing`,
      [orgA, tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values ($1, $2, 'T-028 Org B', 'fmcg', 't-028-org-b')
       on conflict (id) do nothing`,
      [orgB, tenantId],
    );

    await ownerPool.query(
      `insert into "Reference"."PackSizes" (org_id, value)
       values ($1, '250g'), ($2, '500g')
       on conflict (org_id, value) do nothing`,
      [orgA, orgB],
    );
    await ownerPool.query(
      `insert into public.d365_import_cache (org_id, code, status, comment)
       values ($1, 'RM123', 'Found', 'visible'), ($2, 'RM456', 'Missing', 'hidden')
       on conflict (org_id, code) do update set status = excluded.status, comment = excluded.comment`,
      [orgA, orgB],
    );
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2)
       on conflict (session_token) do update set org_id = excluded.org_id`,
      [sessionTokenA, orgA],
    );
  });

  afterAll(async () => {
    await ownerPool?.query(`delete from app.session_org_contexts where session_token = $1`, [sessionTokenA]).catch(() => undefined);
    await ownerPool?.query(`delete from public.d365_import_cache where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from "Reference"."PackSizes" where org_id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.organizations where id in ($1, $2)`, [orgA, orgB]).catch(() => undefined);
    await ownerPool?.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  runIntegrationTest('app_user sees only current-org validator rows and rejects cross-org writes', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionTokenA, orgA]);

      const packSizes = await client.query<{ value: string }>(
        `select value from "Reference"."PackSizes" order by value`,
      );
      const materials = await client.query<{ code: string; status: string }>(
        `select code, status from public.d365_import_cache order by code`,
      );

      expect(packSizes.rows).toEqual([{ value: '250g' }]);
      expect(materials.rows).toEqual([{ code: 'RM123', status: 'Found' }]);

      await expect(
        client.query(
          `insert into public.d365_import_cache (org_id, code, status)
           values ($1, 'RM999', 'Found')`,
          [orgB],
        ),
      ).rejects.toMatchObject({ code: '42501' });

      await client.query('rollback');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
});
