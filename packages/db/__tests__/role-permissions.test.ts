import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAppConnection, getOwnerConnection } from '../test-utils/test-pool.js';

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationSuite = databaseUrl ? describe : describe.skip;
const runIntegrationTest = databaseUrl ? it : it.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';

const expectedMatrix = new Map<string, string[]>([
  ['brief.convert_to_npd_project', ['admin', 'npd_manager']],
  ['brief.create', ['admin', 'core_user', 'npd_manager']],
  ['fg.create', ['admin', 'core_user', 'npd_manager']],
  ['npd.closed_flag.unset', ['admin', 'core_user', 'dept_manager', 'npd_manager']],
  ['npd.compliance_doc.write', ['admin', 'dept_manager', 'npd_manager']],
  ['npd.core.write', ['admin', 'core_user', 'npd_manager']],
  ['npd.d365_builder.execute', ['npd_manager']],
  ['npd.dashboard.view', ['admin', 'core_user', 'dept_manager', 'dept_user', 'npd_manager', 'viewer']],
  ['npd.formulation.create_draft', ['admin', 'core_user', 'npd_manager']],
  ['npd.formulation.lock', ['admin', 'npd_manager']],
  ['npd.gate.advance', ['admin', 'npd_manager']],
  ['npd.gate.approve', ['admin', 'npd_manager']],
  ['npd.pilot.promote_to_bom', ['admin', 'npd_manager']],
  ['npd.project.delete', ['admin', 'npd_manager']],
  ['npd.recipe.submit_for_trial', ['admin', 'core_user', 'npd_manager']],
  ['npd.risk.write', ['admin', 'npd_manager']],
  ['npd.rule.edit', ['admin']],
  ['npd.schema.edit', ['admin']],
]);

const legacyPermissions = [
  'closed_flag.unset',
  'compliance_doc.write',
  'core.write',
  'd365_builder.execute',
  'dashboard.view',
  'dept.write',
  'fa.delete',
  'formulation.create_draft',
  'formulation.lock',
  'pilot.promote_to_bom',
  'recipe.submit_for_trial',
  'risk.write',
  'rule.edit',
  'schema.edit',
];

runIntegrationSuite('080 NPD role permissions seed', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  const tenantId = randomUUID();
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const sessionTokenA = randomUUID();
  const sessionTokenB = randomUUID();
  let appInsertedRoleId: string | undefined;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(`
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

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-006 role permissions tenant', 'eu', 'https://t-006.example')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code, external_id)
       values
         ($1, $3, 'T-006 Org A', 'fmcg', 't-006-org-a'),
         ($2, $3, 'T-006 Org B', 'bakery', 't-006-org-b')
       on conflict (id) do nothing`,
      [orgAId, orgBId, tenantId],
    );
    await ownerPool.query(
      `insert into app.session_org_contexts (session_token, org_id)
       values ($1, $2), ($3, $4)
       on conflict (session_token) do nothing`,
      [sessionTokenA, orgAId, sessionTokenB, orgBId],
    );
  });

  afterAll(async () => {
    if (!ownerPool) return;

    if (appInsertedRoleId) {
      await ownerPool.query(`delete from public.role_permissions where role_id = $1`, [appInsertedRoleId]).catch(() => undefined);
      await ownerPool.query(`delete from public.roles where id = $1`, [appInsertedRoleId]).catch(() => undefined);
    }
    await ownerPool
      .query(`delete from app.session_org_contexts where session_token in ($1, $2)`, [sessionTokenA, sessionTokenB])
      .catch(() => undefined);
    await ownerPool.query(`delete from public.organizations where id in ($1, $2)`, [orgAId, orgBId]).catch(() => undefined);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]).catch(() => undefined);

    await appPool?.end();
    await ownerPool?.end();
  });

  runIntegrationTest('seeds the exact canonical PRD §2.2 role-permission matrix for new orgs', async () => {
    const { rows } = await ownerPool.query<{ permission: string; role_codes: string[] }>(
      `select rp.permission, array_agg(r.code order by r.code) as role_codes
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and (
           rp.permission = any($2::text[])
           or rp.permission = any($3::text[])
         )
       group by rp.permission
       order by rp.permission`,
      [orgAId, [...expectedMatrix.keys()], legacyPermissions],
    );

    const actualMatrix = new Map(rows.map((row) => [row.permission, row.role_codes]));
    expect(actualMatrix).toEqual(expectedMatrix);
    expect(rows.filter((row) => legacyPermissions.includes(row.permission))).toEqual([]);
    expect(actualMatrix.get('npd.d365_builder.execute')).toEqual(['npd_manager']);
    expect(actualMatrix.get('npd.schema.edit')).toEqual(['admin']);
    expect(actualMatrix.get('npd.rule.edit')).toEqual(['admin']);
  });

  runIntegrationTest('keeps the seed idempotent and removes legacy un-namespaced rows', async () => {
    const adminRole = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and code = 'admin'`,
      [orgAId],
    );
    expect(adminRole.rows[0]?.id).toBeTruthy();

    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'schema.edit'), ($1, 'dept.write')
       on conflict do nothing`,
      [adminRole.rows[0]!.id],
    );
    await ownerPool.query(`select public.seed_npd_role_permissions_for_org($1)`, [orgAId]);
    await ownerPool.query(`select public.seed_npd_role_permissions_for_org($1)`, [orgAId]);

    const legacy = await ownerPool.query<{ permission: string }>(
      `select rp.permission
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
         and rp.permission = any($2::text[])
       order by rp.permission`,
      [orgAId, legacyPermissions],
    );
    expect(legacy.rows).toEqual([]);

    const duplicates = await ownerPool.query<{ role_code: string; permission: string; copies: string }>(
      `select r.code as role_code, rp.permission, count(*)::text as copies
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       where r.org_id = $1
       group by r.code, rp.permission
       having count(*) > 1`,
      [orgAId],
    );
    expect(duplicates.rows).toEqual([]);
  });

  runIntegrationTest('enforces non-vacuous app_user cross-org RLS on roles and role_permissions', async () => {
    const client = await appPool.connect();
    try {
      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [sessionTokenA, orgAId]);

      const insertedRole = await client.query<{ id: string }>(
        `insert into public.roles (org_id, code, name, permissions, is_system)
         values ($1, 't006_app_inserted', 'T-006 App Inserted', '[]'::jsonb, false)
         returning id`,
        [orgAId],
      );
      appInsertedRoleId = insertedRole.rows[0]!.id;

      await client.query(
        `insert into public.role_permissions (role_id, permission)
         values ($1, 'npd.dashboard.view')`,
        [appInsertedRoleId],
      );
      await client.query('commit');

      await client.query('begin');
      await client.query('select app.set_org_context($1, $2)', [sessionTokenB, orgBId]);
      const visibleFromOrgB = await client.query<{ permission: string }>(
        `select rp.permission
         from public.role_permissions rp
         where rp.role_id = $1`,
        [appInsertedRoleId],
      );
      expect(visibleFromOrgB.rows).toHaveLength(0);

      let roleInsertCode: string | undefined;
      await client.query('savepoint before_cross_org_role_insert');
      try {
        await client.query(
          `insert into public.roles (org_id, code, name, permissions, is_system)
           values ($1, 't006_cross_org_role', 'T-006 Cross Org Role', '[]'::jsonb, false)`,
          [orgAId],
        );
      } catch (err) {
        roleInsertCode = (err as { code?: string }).code;
        await client.query('rollback to savepoint before_cross_org_role_insert');
      }
      expect(roleInsertCode).toBe('42501');

      let permissionInsertCode: string | undefined;
      await client.query('savepoint before_cross_org_permission_insert');
      try {
        await client.query(
          `insert into public.role_permissions (role_id, permission)
           values ($1, 'npd.risk.write')`,
          [appInsertedRoleId],
        );
      } catch (err) {
        permissionInsertCode = (err as { code?: string }).code;
        await client.query('rollback to savepoint before_cross_org_permission_insert');
      }
      expect(permissionInsertCode).toBe('42501');

      await client.query('rollback');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
});
