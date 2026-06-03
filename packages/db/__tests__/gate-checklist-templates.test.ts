import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTest = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = '05500000-0000-4000-8000-000000000055';
const orgA = '05500000-0000-4000-8000-0000000000aa';
const orgB = '05500000-0000-4000-8000-0000000000bb';

async function ensureAppUser(pool: pg.Pool) {
  await pool.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'app_user') then
        create role app_user login password '${appUserPassword}';
      else
        alter role app_user login password '${appUserPassword}';
      end if;
    end
    $$;
  `);
}

async function seedOrg(pool: pg.Pool, orgId: string, name: string) {
  await pool.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'Gate Checklist Templates Tenant', 'eu', 'https://gate-checklist-templates.example.test')
      on conflict (id) do update
        set name = excluded.name,
            region_cluster = excluded.region_cluster,
            data_plane_url = excluded.data_plane_url
    `,
    [tenantId],
  );
  await pool.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, $3, 'bakery')
      on conflict (id) do update
        set tenant_id = excluded.tenant_id,
            name = excluded.name,
            industry_code = excluded.industry_code
    `,
    [orgId, tenantId, name],
  );
}

async function withOrgContext<T>(
  appPool: pg.Pool,
  ownerPool: pg.Pool,
  orgId: string,
  callback: (client: pg.PoolClient) => Promise<T>,
) {
  const sessionToken = randomUUID();
  await ownerPool.query(
    `
      insert into app.session_org_contexts (session_token, org_id)
      values ($1, $2)
      on conflict (session_token) do update set org_id = excluded.org_id
    `,
    [sessionToken, orgId],
  );

  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query('select app.set_org_context($1::uuid, $2::uuid)', [sessionToken, orgId]);
    const result = await callback(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

describe('092 gate checklist templates migration source', () => {
  it('uses org_id scope, forced app.current_org_id RLS, app_user grants, and no stale tenant/current_setting policy reads', () => {
    const sql = readFileSync(resolve(process.cwd(), 'migrations/092-gate-checklist-templates.sql'), 'utf8');

    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+"Reference"\."GateChecklistTemplates"/i);
    expect(sql).toMatch(/org_id\s+uuid\s+not\s+null/i);
    expect(sql).not.toMatch(/\btenant_id\b/i);
    expect(sql).toMatch(/primary\s+key\s*\(\s*org_id\s*,\s*template_id\s*,\s*gate_code\s*,\s*sequence\s*\)/i);
    expect(sql).toMatch(/alter\s+table\s+"Reference"\."GateChecklistTemplates"\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/alter\s+table\s+"Reference"\."GateChecklistTemplates"\s+force\s+row\s+level\s+security/i);
    expect(sql).toMatch(/using\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(/with\s+check\s*\(\s*org_id\s*=\s*app\.current_org_id\(\)\s*\)/i);
    expect(sql).toMatch(
      /grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+"Reference"\."GateChecklistTemplates"\s+to\s+app_user/i,
    );
    expect(sql).not.toMatch(/current_setting\s*\(\s*['"]app\.(tenant_id|current_org_id)['"]/i);
  });
});

runIntegrationTest('gate checklist template table', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();
    await ensureAppUser(ownerPool);
    await seedOrg(ownerPool, orgA, 'Gate Checklist Templates Org A');
    await seedOrg(ownerPool, orgB, 'Gate Checklist Templates Org B');
  });

  afterAll(async () => {
    await appPool?.end();
    await ownerPool?.end();
  });

  it('creates required columns, composite primary key, seed index, and forced RLS', async () => {
    const columns = await ownerPool.query<{ column_name: string; is_nullable: 'YES' | 'NO' }>(
      `
        select column_name, is_nullable
        from information_schema.columns
        where table_schema = 'Reference'
          and table_name = 'GateChecklistTemplates'
      `,
    );
    const columnNames = new Set(columns.rows.map((row) => row.column_name));

    for (const column of [
      'template_id',
      'org_id',
      'gate_code',
      'category_code',
      'item_text',
      'required',
      'sequence',
      'schema_version',
    ]) {
      expect(columnNames.has(column), `GateChecklistTemplates is missing ${column}`).toBe(true);
    }
    expect(columnNames.has('tenant_id')).toBe(false);
    for (const column of ['template_id', 'org_id', 'gate_code', 'category_code', 'item_text', 'required', 'sequence']) {
      expect(columns.rows.find((row) => row.column_name === column)?.is_nullable, `${column} nullable`).toBe('NO');
    }

    const primaryKey = await ownerPool.query<{ column_name: string }>(
      `
        select kcu.column_name
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_schema = tc.constraint_schema
         and kcu.constraint_name = tc.constraint_name
         and kcu.table_schema = tc.table_schema
         and kcu.table_name = tc.table_name
        where tc.table_schema = 'Reference'
          and tc.table_name = 'GateChecklistTemplates'
          and tc.constraint_type = 'PRIMARY KEY'
        order by kcu.ordinal_position
      `,
    );
    expect(primaryKey.rows.map((row) => row.column_name)).toEqual([
      'org_id',
      'template_id',
      'gate_code',
      'sequence',
    ]);

    const seedIndex = await ownerPool.query<{ indexname: string }>(
      `
        select indexname
        from pg_indexes
        where schemaname = 'Reference'
          and tablename = 'GateChecklistTemplates'
          and indexdef ilike '%(org_id, template_id, gate_code)%'
      `,
    );
    expect(seedIndex.rowCount).toBeGreaterThan(0);

    const rls = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `
        select relrowsecurity, relforcerowsecurity
        from pg_class
        where oid = format('%I.%I', 'Reference', 'GateChecklistTemplates')::regclass
      `,
    );
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('scopes rows by app.current_org_id and rejects cross-org inserts for app_user', async () => {
    await ownerPool.query(
      `
        insert into "Reference"."GateChecklistTemplates" (
          org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version
        )
        values
          ($1, 'default', 'G0', 'technical', 'Org A item', true, 1, 1),
          ($2, 'default', 'G0', 'technical', 'Org B item', true, 1, 1)
        on conflict (org_id, template_id, gate_code, sequence) do update
          set item_text = excluded.item_text,
              required = excluded.required,
              schema_version = excluded.schema_version
      `,
      [orgA, orgB],
    );

    const visibleRows = await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      const result = await client.query<{ org_id: string; item_text: string }>(
        `
          select org_id, item_text
          from "Reference"."GateChecklistTemplates"
          where template_id = 'default'
          order by item_text
        `,
      );
      return result.rows;
    });
    expect(visibleRows).toEqual([{ org_id: orgA, item_text: 'Org A item' }]);

    await withOrgContext(appPool, ownerPool, orgA, async (client) => {
      await expect(
        client.query(
          `
            insert into "Reference"."GateChecklistTemplates" (
              org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version
            )
            values ($1, 'cross-org', 'G0', 'technical', 'Cross org item', true, 1, 1)
          `,
          [orgB],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('rejects NULL required values', async () => {
    await expect(
      ownerPool.query(
        `
          insert into "Reference"."GateChecklistTemplates" (
            org_id, template_id, gate_code, category_code, item_text, required, sequence, schema_version
          )
          values ($1, 'null-required', 'G0', 'technical', 'Missing required flag', null, 1, 1)
        `,
        [orgA],
      ),
    ).rejects.toMatchObject({ code: '23502' });
  });
});
