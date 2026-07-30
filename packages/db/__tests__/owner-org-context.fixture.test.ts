import { describe, expect, it } from 'vitest';

import * as helpers from './owner-org-context.js';

type QueryCall = {
  sql: string;
  params: readonly unknown[];
};

type FixtureCreator = (
  owner: { query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }> },
  options: { permissions: readonly string[] },
) => Promise<{
  tenantId: string;
  orgId: string;
  roleId: string;
  userId: string;
  siteId: string;
  warehouseId: string;
  locationId: string;
  cleanup: () => Promise<void>;
}>;

const createPgTestFixture = (helpers as { createPgTestFixture?: FixtureCreator }).createPgTestFixture;

describe('createPgTestFixture guards', () => {
  it('rejects an owner role that cannot bypass FORCE RLS before any write', async () => {
    expect(createPgTestFixture).toBeTypeOf('function');
    if (!createPgTestFixture) return;

    const writes: string[] = [];
    await expect(
      createPgTestFixture(
        {
          query: async (sql) => {
            if (/\b(insert|update|delete)\b/i.test(sql)) writes.push(sql);
            return { rows: [{ role: 'plain_owner', rolsuper: false, rolbypassrls: false }] };
          },
        },
        { permissions: [] },
      ),
    ).rejects.toThrow('plain_owner is neither superuser nor BYPASSRLS');
    expect(writes).toEqual([]);
  });

  it('names a new required column before writing an incomplete fixture', async () => {
    expect(createPgTestFixture).toBeTypeOf('function');
    if (!createPgTestFixture) return;

    const writes: string[] = [];
    await expect(
      createPgTestFixture(
        {
          query: async (sql) => {
            if (sql.includes('from pg_roles')) {
              return { rows: [{ role: 'fixture_owner', rolsuper: false, rolbypassrls: true }] };
            }
            if (sql.includes('information_schema.columns')) {
              return { rows: [{ table_name: 'warehouses', column_name: 'future_required' }] };
            }
            if (/\b(insert|update|delete)\b/i.test(sql)) writes.push(sql);
            return { rows: [] };
          },
        },
        { permissions: [] },
      ),
    ).rejects.toThrow('public.warehouses requires uncovered column(s): future_required');
    expect(writes).toEqual([]);
  });

  it('creates and cleans one coherent org fixture through app.set_org_context', async () => {
    expect(createPgTestFixture).toBeTypeOf('function');
    if (!createPgTestFixture) return;

    const calls: QueryCall[] = [];
    const requiredColumns = {
      tenants: ['id', 'name', 'data_plane_url'],
      organizations: ['tenant_id', 'name', 'industry_code'],
      roles: ['org_id', 'code', 'name', 'permissions'],
      users: ['org_id', 'email', 'name', 'role_id'],
      sites: ['org_id', 'site_code', 'name'],
      warehouses: ['org_id', 'code', 'name', 'warehouse_type'],
      locations: ['org_id', 'warehouse_id', 'code', 'name', 'location_type', 'level', 'path'],
    } as const;
    const owner = {
      query: async (sql: string, params: readonly unknown[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('from pg_roles')) {
          return { rows: [{ role: 'fixture_owner', rolsuper: false, rolbypassrls: true }] };
        }
        if (sql.includes('information_schema.columns')) {
          return {
            rows: Object.entries(requiredColumns).flatMap(([table_name, columns]) =>
              columns.map((column_name) => ({ table_name, column_name })),
            ),
          };
        }
        return { rows: [] };
      },
    };

    const fixture = await createPgTestFixture(owner, {
      permissions: ['warehouse.lp.reserve', 'production.output.write'],
    });

    for (const key of [
      'tenantId',
      'orgId',
      'roleId',
      'userId',
      'siteId',
      'warehouseId',
      'locationId',
    ] as const) {
      expect(fixture[key]).toMatch(/^[0-9a-f-]{36}$/i);
    }
    for (const [table, columns] of Object.entries(requiredColumns)) {
      const insert = calls
        .map(({ sql }) => sql.match(new RegExp(`insert into public\\.${table}\\s*\\(([^)]*)\\)`, 'i')))
        .find(Boolean);
      expect(insert, `missing public.${table} insert`).toBeTruthy();
      const insertedColumns = insert?.[1].split(',').map((column) => column.trim()) ?? [];
      expect(insertedColumns).toEqual(expect.arrayContaining([...columns]));
    }
    expect(calls.some(({ sql }) => sql.includes('select app.set_org_context'))).toBe(true);
    expect(
      calls.some(
        ({ sql, params }) =>
          sql.includes('insert into public.warehouses') &&
          sql.includes('site_id') &&
          sql.includes('warehouse_type') &&
          params[2] === fixture.siteId,
      ),
    ).toBe(true);
    expect(
      calls.some(
        ({ sql, params }) =>
          sql.includes('insert into public.users') && sql.includes('role_id') && params[3] === fixture.roleId,
      ),
    ).toBe(true);
    expect(calls.some(({ sql }) => /\bset_config\b|\bset\s+(local\s+)?app\./i.test(sql))).toBe(false);

    await fixture.cleanup();

    expect(calls.some(({ sql, params }) => sql.includes('delete from public.tenants') && params[0] === fixture.tenantId))
      .toBe(true);
  });
});
