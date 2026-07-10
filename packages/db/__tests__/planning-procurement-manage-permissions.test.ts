import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getOwnerConnection } from '../test-utils/test-pool.js';

const repoRoot = resolve(__dirname, '../../..');
const migrationPath = resolve(repoRoot, 'packages/db/migrations/464-planning-procurement-manage-permissions.sql');

const PROCUREMENT_PERMISSIONS = ['planning.po.manage', 'planning.to.manage', 'planning.supplier.manage'] as const;
const PLANNING_SOURCE_PERM = 'npd.planning.write';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

describe('464 planning procurement manage permission seed', () => {
  it('grants dedicated permissions to npd.planning.write predecessor holders (migration 319 pattern)', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain(`v_planning_source_perm text := '${PLANNING_SOURCE_PERM}'`);
    expect(migration).toContain('with target_roles as (');
    expect(migration).toContain('rp.permission = v_planning_source_perm');
    expect(migration).toContain("coalesce(r.permissions, '[]'::jsonb) ? v_planning_source_perm");
    for (const permission of PROCUREMENT_PERMISSIONS) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toContain('on conflict (role_id, permission) do nothing');
    expect(migration).not.toMatch(/\br\.tenant_id\b/i);
    expect(migration).not.toMatch(/current_setting\s*\(/);
  });
});

runIntegrationSuite('464 planning procurement manage permission seed — live continuity', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId = randomUUID();
  const buyerRoleId = randomUUID();

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave2 procurement RBAC tenant', 'eu', 'https://wave2-proc.example')
       on conflict (id) do nothing`,
      [tenantId],
    );

    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave2 Procurement RBAC Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `wave2-proc-${orgId.slice(0, 8)}`],
    );

    await ownerPool.query(
      `insert into public.roles (id, org_id, code, slug, name, permissions)
       values ($1, $2, 'buyer', 'buyer', 'Buyer', $3::jsonb)
       on conflict (id) do nothing`,
      [buyerRoleId, orgId, JSON.stringify([PLANNING_SOURCE_PERM])],
    );

    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, $2)
       on conflict (role_id, permission) do nothing`,
      [buyerRoleId, PLANNING_SOURCE_PERM],
    );

    await ownerPool.query(`select public.seed_planning_procurement_manage_permissions_for_org($1::uuid)`, [orgId]);
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool
      .query(
        `delete from public.role_permissions rp
         using public.roles r
         where rp.role_id = r.id and r.org_id = $1`,
        [orgId],
      )
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  runIntegrationTest(
    'custom buyer role with npd.planning.write receives all three dedicated procurement permissions',
    async () => {
      const { rows } = await ownerPool.query<{ permission: string }>(
        `select rp.permission
         from public.role_permissions rp
         where rp.role_id = $1
           and rp.permission = any($2::text[])
         order by rp.permission`,
        [buyerRoleId, PROCUREMENT_PERMISSIONS],
      );

      expect(rows.map((row) => row.permission)).toEqual([...PROCUREMENT_PERMISSIONS]);

      const { rows: jsonRows } = await ownerPool.query<{ perms: string[] | null }>(
        `select (
           select array_agg(p order by p)
           from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p
           where p = any($2::text[])
         ) as perms
         from public.roles
         where id = $1`,
        [buyerRoleId, PROCUREMENT_PERMISSIONS],
      );

      expect(jsonRows[0]?.perms ?? []).toEqual([...PROCUREMENT_PERMISSIONS]);
    },
  );
});
