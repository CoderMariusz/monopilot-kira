import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

// What the schema-admin role is allowed to keep after migration 155: schema-scoped
// grants + the literal role-name gate. Everything else migration 150 granted it is
// revoked under the org.access.admin ⊥ org.schema.admin SoD lock.
const SCHEMA_ADMIN_KEEP = ['org.schema.admin', 'settings.schema.admin', 'settings.schema.read'];

// A representative sample of the dangerous admin-class strings migration 150
// over-granted to the schema-admin role and that migration 155 must revoke.
const MUST_BE_REVOKED = [
  'impersonate.tenant',
  'settings.users.manage',
  'settings.roles.manage',
  'settings.d365.rotate_secret',
  'settings.sso.edit',
  'settings.scim.edit',
  'settings.security.edit',
  'org.access.admin',
];

runIntegrationSuite('155 schema-admin SoD over-grant revoke', () => {
  let ownerPool: pg.Pool;

  const tenantId = randomUUID();
  const orgId = randomUUID();
  let schemaAdminRoleId = '';
  let realAdminRoleId = '';

  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'mig155 sod tenant', 'eu', 'https://mig155.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    // Inserting the org fires the role-seed trigger chain, which creates the
    // standard role set — including the pure schema-admin role (slug
    // org.schema.admin, code org.schema.admin) and the real admin role (code
    // admin). We look those up rather than inventing our own.
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'mig155 SoD Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `mig155-${orgId.slice(0, 8)}`],
    );

    const schemaAdmin = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and slug = 'org.schema.admin' limit 1`,
      [orgId],
    );
    const realAdmin = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and code = 'admin' limit 1`,
      [orgId],
    );
    schemaAdminRoleId = schemaAdmin.rows[0]?.id ?? '';
    realAdminRoleId = realAdmin.rows[0]?.id ?? '';
    expect(schemaAdminRoleId, 'schema-admin role must exist for the org').not.toEqual('');
    expect(realAdminRoleId, 'admin role must exist for the org').not.toEqual('');

    // Reproduce the P0 over-grant: migration 150's matrix seed grants the schema
    // admin (and the real admin) the full settings.* family — including dangerous
    // admin-class capabilities. (Migration 155's org-insert trigger already ran
    // once above; calling 150's seed here re-introduces the over-grant so the
    // tests below exercise the revoke function directly.)
    await ownerPool.query(`select public.seed_settings_rbac_matrix_for_org($1)`, [orgId]);
  });

  afterAll(async () => {
    if (!ownerPool) return;
    await ownerPool
      .query(
        `delete from public.role_permissions rp using public.roles r
         where rp.role_id = r.id and r.org_id = $1`,
        [orgId],
      )
      .catch(() => undefined);
    await ownerPool.query(`delete from public.roles where org_id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);
    await ownerPool?.end();
  });

  runIntegrationTest('precondition — migration 150 over-granted impersonate.tenant to the schema-admin role', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions
       where role_id = $1 and permission = 'impersonate.tenant'`,
      [schemaAdminRoleId],
    );
    expect(rows).toHaveLength(1);
  });

  runIntegrationTest('revokes every dangerous admin-class string from the schema-admin role (role_permissions)', async () => {
    await ownerPool.query(`select public.revoke_schema_admin_sod_overgrant_for_org($1)`, [orgId]);

    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1
         and permission = any($2::text[])`,
      [schemaAdminRoleId, MUST_BE_REVOKED],
    );
    expect(rows).toEqual([]);
  });

  runIntegrationTest('leaves the schema-admin role exactly its schema-scoped grants + the literal gate', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 order by permission`,
      [schemaAdminRoleId],
    );
    expect(rows.map((r) => r.permission)).toEqual(SCHEMA_ADMIN_KEEP);
  });

  runIntegrationTest('also strips the revoked strings from the legacy roles.permissions jsonb cache', async () => {
    const { rows } = await ownerPool.query<{ perms: string[] }>(
      `select (select array_agg(p order by p)
               from jsonb_array_elements_text(coalesce(permissions, '[]'::jsonb)) as p) as perms
       from public.roles where id = $1`,
      [schemaAdminRoleId],
    );
    const perms = rows[0]?.perms ?? [];
    for (const revoked of MUST_BE_REVOKED) {
      expect(perms).not.toContain(revoked);
    }
    expect(perms).toEqual(SCHEMA_ADMIN_KEEP);
  });

  runIntegrationTest('does NOT touch the real org-admin role (still holds impersonate.tenant)', async () => {
    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions
       where role_id = $1 and permission = 'impersonate.tenant'`,
      [realAdminRoleId],
    );
    expect(rows).toHaveLength(1);
  });

  runIntegrationTest('is idempotent (re-running keeps the schema-admin grant set stable)', async () => {
    await ownerPool.query(`select public.revoke_schema_admin_sod_overgrant_for_org($1)`, [orgId]);
    await ownerPool.query(`select public.revoke_schema_admin_sod_overgrant_for_org($1)`, [orgId]);

    const { rows } = await ownerPool.query<{ permission: string }>(
      `select permission from public.role_permissions where role_id = $1 order by permission`,
      [schemaAdminRoleId],
    );
    expect(rows.map((r) => r.permission)).toEqual(SCHEMA_ADMIN_KEEP);
  });
});
