import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '@monopilot/db/test-utils/test-pool.js';

import { upsertWac } from '../upsert-wac';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const itemId = randomUUID();

runIntegrationSuite('upsertWac real Postgres behavior', () => {
  let ownerPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'WAC Upsert Test Tenant', 'eu', 'https://wac-upsert.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'WAC Upsert Test Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wac-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name)
       values ($1, $2, $3, 'WAC Upsert Test User')
       on conflict (id) do nothing`,
      [userId, orgId, `wac-${userId}@example.test`],
    );
    await ownerPool.query(
      `insert into public.currencies (code, name)
       values ('GBP', 'Pound Sterling')
       on conflict (code) do nothing`,
    );
  });

  afterAll(async () => {
    await ownerPool
      ?.query('delete from public.item_wac_state where org_id = $1 and item_id = $2', [orgId, itemId])
      .catch(() => undefined);
    await ownerPool?.query('delete from public.users where id = $1', [userId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  it('omits generated avg_cost and sums quantity/value on conflict', async () => {
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '10',
      deltaValue: '100',
      updatedBy: userId,
    });
    await upsertWac(ownerPool, {
      orgId,
      siteId: null,
      itemId,
      deltaQtyKg: '5',
      deltaValue: '80',
      updatedBy: userId,
    });

    const { rows } = await ownerPool.query<{
      total_qty_kg: string;
      total_value: string;
      avg_cost: string;
      site_id: string | null;
      currency_code: string;
    }>(
      `select wac.total_qty_kg::text,
              wac.total_value::text,
              wac.avg_cost::text,
              wac.site_id::text,
              c.code::text as currency_code
         from public.item_wac_state wac
         join public.currencies c on c.id = wac.currency_id
        where wac.org_id = $1::uuid
          and wac.item_id = $2::uuid`,
      [orgId, itemId],
    );

    expect(rows).toEqual([
      {
        total_qty_kg: '15.000',
        total_value: '180.0000',
        avg_cost: '12.000000',
        site_id: null,
        currency_code: 'GBP',
      },
    ]);
  });
});
