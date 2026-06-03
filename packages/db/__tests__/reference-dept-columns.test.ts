import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migration077 = readFileSync(
  resolve(packageRoot, 'migrations/077-reference-dept-columns.sql'),
  'utf8',
);
const migration077Statements = migration077.replace(/--.*$/gm, '');

const orgA = '00300000-0000-4000-8000-00000000000a';
const orgB = '00300000-0000-4000-8000-00000000000b';
const tenantA = '00300000-0000-4000-8000-0000000000aa';
const tenantB = '00300000-0000-4000-8000-0000000000bb';

async function setOrgContext(client: pg.PoolClient, ownerPool: pg.Pool, orgId: string) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `insert into app.session_org_contexts (session_token, org_id)
     values ($1::uuid, $2::uuid)
     on conflict (session_token) do update set org_id = excluded.org_id`,
    [sessionToken, orgId],
  );
  await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
}

describe('Reference.DeptColumns NPD §4.2 extension', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(`
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1::uuid, 'T-003 Tenant A', 'eu', 'local'),
             ($2::uuid, 'T-003 Tenant B', 'eu', 'local')
      on conflict (id) do update set name = excluded.name
    `, [tenantA, tenantB]);

    await ownerPool.query(`
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1::uuid, $2::uuid, 'T-003 Org A', 'bakery'),
             ($3::uuid, $4::uuid, 'T-003 Org B', 'bakery')
      on conflict (id) do update set name = excluded.name
    `, [orgA, tenantA, orgB, tenantB]);

    await ownerPool.query(
      `delete from "Reference"."DeptColumns"
       where org_id in ($1::uuid, $2::uuid)
         and dept_code = 'npd-t003'`,
      [orgA, orgB],
    );
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('extends the existing Reference.DeptColumns table without creating a public shadow table', async () => {
    expect(migration077Statements).toMatch(/alter\s+table\s+"Reference"\."DeptColumns"/i);
    expect(migration077Statements).not.toMatch(/create\s+table/i);
    expect(migration077Statements).not.toMatch(/public\."Reference\.DeptColumns"/i);

    const tableLocations = await ownerPool.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name
       from information_schema.tables
       where table_name = 'DeptColumns'
          or table_name = 'Reference.DeptColumns'
       order by table_schema, table_name`,
    );

    expect(tableLocations.rows).toEqual([{ table_schema: 'Reference', table_name: 'DeptColumns' }]);

    const columns = await ownerPool.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema = 'Reference'
         and table_name = 'DeptColumns'
       order by column_name`,
    );
    const byName = new Map(columns.rows.map((row) => [row.column_name, row]));

    expect(byName.get('dept_code')?.data_type).toBe('text');
    expect(byName.get('field_type')?.data_type).toBe('text');
    expect(byName.get('validation_dsl')?.data_type).toBe('jsonb');
    expect(byName.get('is_required')?.data_type).toBe('boolean');

    expect(byName.get('dropdown_source')?.data_type).toBe('text');
    expect(byName.get('blocking_rule')?.data_type).toBe('text');
    expect(byName.get('required_for_done')?.data_type).toBe('boolean');
    expect(byName.get('required_for_done')?.is_nullable).toBe('NO');
    expect(byName.get('display_order')?.data_type).toBe('integer');
    expect(byName.get('marker')?.data_type).toBe('text');
  });

  it('keeps existing Reference.DeptColumns RLS org isolation under app_user', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await setOrgContext(client, ownerPool, orgA);
      await client.query(
        `insert into "Reference"."DeptColumns"
           (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
            dropdown_source, blocking_rule, required_for_done, display_order, marker)
         values
           ($1::uuid, 'npd-t003', 'formula_weight', 'number', true, '{"min":0}'::jsonb,
            'npd.units', 'formula_weight_required', true, 10, 'critical')`,
        [orgA],
      );
      await client.query('commit');

      await client.query('begin');
      await setOrgContext(client, ownerPool, orgB);
      await client.query(
        `insert into "Reference"."DeptColumns"
           (org_id, dept_code, column_key, field_type, is_required, validation_dsl,
            dropdown_source, blocking_rule, required_for_done, display_order, marker)
         values
           ($1::uuid, 'npd-t003', 'customer_segment', 'string', false, '{}'::jsonb,
            'npd.segments', null, false, 20, 'optional')`,
        [orgB],
      );
      await client.query('commit');

      await client.query('begin');
      await setOrgContext(client, ownerPool, orgA);
      const orgARows = await client.query<{ org_id: string; column_key: string; marker: string }>(
        `select org_id::text, column_key, marker
         from "Reference"."DeptColumns"
         where dept_code = 'npd-t003'
         order by column_key`,
      );
      expect(orgARows.rows).toEqual([
        { org_id: orgA, column_key: 'formula_weight', marker: 'critical' },
      ]);
      await client.query('commit');

      await client.query('begin');
      await setOrgContext(client, ownerPool, orgB);
      const orgBRows = await client.query<{ org_id: string; column_key: string; marker: string }>(
        `select org_id::text, column_key, marker
         from "Reference"."DeptColumns"
         where dept_code = 'npd-t003'
         order by column_key`,
      );
      expect(orgBRows.rows).toEqual([
        { org_id: orgB, column_key: 'customer_segment', marker: 'optional' },
      ]);
      await client.query('commit');
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});
