import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration502 = resolve(packageRoot, 'migrations/502-items-net-qty-per-each-scale.sql');
const migration503 = resolve(packageRoot, 'migrations/503-routing-operation-numeric-scale.sql');

const tenantId = '50200000-0000-4000-8000-000000000001';
const orgId = '50200000-0000-4000-8000-0000000000aa';
const itemId = '50200000-0000-4000-8000-00000000f001';

async function applyMigration(adminPool: pg.Pool, path: string) {
  await adminPool.query(readFileSync(path, 'utf8'));
}

describe('502/503 numeric precision scale migrations (file contract)', () => {
  it('502 expands items.net_qty_per_each to numeric(18,6)', () => {
    expect(existsSync(migration502)).toBe(true);
    const sql = readFileSync(migration502, 'utf8');
    expect(sql).toMatch(/alter table public\.items/i);
    expect(sql).toMatch(/net_qty_per_each type numeric\(18,\s*6\)/i);
  });

  it('503 expands routing_operations run_time and cost_per_hour to numeric(18,6)', () => {
    expect(existsSync(migration503)).toBe(true);
    const sql = readFileSync(migration503, 'utf8');
    expect(sql).toMatch(/alter table public\.routing_operations/i);
    expect(sql).toMatch(/run_time_per_unit_sec type numeric\(18,\s*6\)/i);
    expect(sql).toMatch(/cost_per_hour type numeric\(18,\s*6\)/i);
  });
});

runIntegrationTest('502/503 numeric precision scale (live DB)', () => {
  let adminPool: pg.Pool;

  beforeAll(async () => {
    adminPool = getOwnerConnection();
    await applyMigration(adminPool, migration502);
    await applyMigration(adminPool, migration503);

    await adminPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Numeric Scale Tenant', 'eu', 'https://numeric-scale.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await adminPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'Numeric Scale Org', 'bakery')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );
    await adminPool.query(
      `insert into public.items (id, org_id, item_code, item_type, name, status, uom_base, output_uom, net_qty_per_each)
       values ($1, $2, 'T502-NET', 'fg', 'Net scale FG', 'active', 'kg', 'each', $3::numeric)
       on conflict (id) do update set net_qty_per_each = excluded.net_qty_per_each`,
      [itemId, orgId, '0.333333'],
    );
  });

  afterAll(async () => {
    await adminPool.query(`delete from public.items where id = $1`, [itemId]);
    await adminPool.query(`delete from public.organizations where id = $1`, [orgId]);
    await adminPool.end();
  });

  it('stores items.net_qty_per_each at 6 decimal places without truncation', async () => {
    const cols = await adminPool.query<{
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `select column_name, numeric_precision, numeric_scale
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'items'
          and column_name = 'net_qty_per_each'`,
    );
    expect(cols.rows[0]).toEqual({
      column_name: 'net_qty_per_each',
      numeric_precision: 18,
      numeric_scale: 6,
    });

    const stored = await adminPool.query<{ net_qty_per_each: string }>(
      `select net_qty_per_each::text from public.items where id = $1`,
      [itemId],
    );
    expect(stored.rows[0]?.net_qty_per_each).toBe('0.333333');
  });

  it('exposes routing_operations run_time and cost_per_hour at numeric(18,6)', async () => {
    const cols = await adminPool.query<{
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `select column_name, numeric_precision, numeric_scale
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'routing_operations'
          and column_name in ('run_time_per_unit_sec', 'cost_per_hour')
        order by column_name`,
    );
    expect(cols.rows).toEqual([
      { column_name: 'cost_per_hour', numeric_precision: 18, numeric_scale: 6 },
      { column_name: 'run_time_per_unit_sec', numeric_precision: 18, numeric_scale: 6 },
    ]);
  });
});
