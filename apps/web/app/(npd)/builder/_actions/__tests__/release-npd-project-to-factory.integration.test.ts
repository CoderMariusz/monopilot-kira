/**
 * T-096 — REAL DB-backed integration tests for releaseNpdProjectToFactory.
 *
 * Exercises the Server Action through the real withOrgContext app-role
 * transaction and RLS. Requires DATABASE_URL; skipped in no-DB CI.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const projectId = randomUUID();
const nonG4ProjectId = randomUUID();
const activeBomHeaderId = randomUUID();
const inactiveBomHeaderId = randomUUID();
const factorySpecId = randomUUID();
const productCode = `FG-T096-${randomUUID().slice(0, 8)}`;
const nonG4ProductCode = `FG-T096-${randomUUID().slice(0, 8)}`;

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `insert into public.tenants (id, name, region_cluster, data_plane_url)
     values ($1, 'T-096 IT Tenant', 'eu', 'https://t096-it.example.test')`,
    [tenantId],
  );
  await owner.query(
    `insert into public.organizations (id, tenant_id, name, industry_code)
     values ($1, $2, 'T-096 IT Org', 'bakery')`,
    [orgId, tenantId],
  );
  await owner.query(
    `insert into public.roles (id, org_id, code, name, permissions)
     values ($1, $2, 't096-admin', 'T-096 Admin', '[]'::jsonb)`,
    [roleId, orgId],
  );
  await owner.query(
    `insert into public.role_permissions (role_id, permission)
     values ($1, 'npd.gate.approve')
     on conflict do nothing`,
    [roleId],
  );
  await owner.query(
    `insert into public.users (id, org_id, email, name, role_id)
     values ($1, $2, 't096-action@example.test', 'T-096 Action User', $3)`,
    [userId, orgId, roleId],
  );
  await owner.query(
    `insert into public.user_roles (org_id, user_id, role_id)
     values ($1, $2, $3)
     on conflict do nothing`,
    [orgId, userId, roleId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
     values ($1, $2, 'T-096 Product', false, 1, $3),
            ($4, $2, 'T-096 Non-G4 Product', false, 1, $3)`,
    [productCode, orgId, userId, nonG4ProductCode],
  );
  await owner.query(
    `insert into public.npd_projects
       (id, org_id, code, name, type, current_gate, current_stage, product_code, created_by_user)
     values
       ($1, $2, 'NPD-T096-IT', 'T-096 IT Project', 'standard', 'G4', 'approval', $3, $4),
       ($5, $2, 'NPD-T096-G3', 'T-096 G3 Project', 'standard', 'G3', 'trial', $6, $4)`,
    [projectId, orgId, productCode, userId, nonG4ProjectId, nonG4ProductCode],
  );
  await owner.query(
    `insert into public.bom_headers
       (id, org_id, product_id, npd_project_id, origin_module, status, version, approved_by, approved_at)
     values
       ($1, $2, $3, $4, 'npd', 'draft', 1, null, null),
       ($5, $2, $6, $7, 'npd', 'in_review', 1, null, null)`,
    [activeBomHeaderId, orgId, productCode, projectId, inactiveBomHeaderId, nonG4ProductCode, nonG4ProjectId],
  );
  await owner.query(
    `insert into public.bom_lines
       (org_id, bom_header_id, line_no, component_code, component_type, quantity, uom, source)
     values
       ($1, $2, 1, 'RM-T096-A', 'RM', 1.000000, 'kg', 'test'),
       ($1, $3, 1, 'RM-T096-B', 'RM', 1.000000, 'kg', 'test')`,
    [orgId, activeBomHeaderId, inactiveBomHeaderId],
  );
  await owner.query(
    `update public.bom_headers
        set status = 'active',
            approved_by = $3,
            approved_at = now()
      where org_id = $1
        and id = $2`,
    [orgId, activeBomHeaderId, userId],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id = $1`, [orgId]).catch(() => undefined);
  await owner.query(`delete from public.factory_release_status where org_id = $1`, [orgId]).catch(() => undefined);
  await owner.query(`delete from public.bom_headers where org_id = $1`, [orgId]);
  await owner.query(`delete from public.npd_projects where org_id = $1`, [orgId]);
  await owner.query(`delete from public.product where org_id = $1`, [orgId]);
  await owner.query(`delete from public.user_roles where org_id = $1`, [orgId]).catch(() => undefined);
  await owner.query(`delete from public.role_permissions where role_id = $1`, [roleId]).catch(() => undefined);
  await owner.query(`delete from public.users where org_id = $1`, [orgId]);
  await owner.query(`delete from public.roles where org_id = $1`, [orgId]);
  await owner.query(`delete from public.organizations where id = $1`, [orgId]);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
}

run('releaseNpdProjectToFactory — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- owner pool is test setup/assertion only; action uses withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    await cleanup().catch(() => undefined);
    await seed();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  });

  it('blocks release unless the project is at G4', async () => {
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');

    const result = await releaseNpdProjectToFactory({
      projectId: nonG4ProjectId,
      activeFactorySpecId: factorySpecId,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
    });
    expect(result.ok === false ? result.blockers : []).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'G4_REQUIRED' })]),
    );
    const statusRows = await owner.query(`select 1 from public.factory_release_status where org_id = $1`, [orgId]);
    expect(statusRows.rowCount).toBe(0);
  });

  it('releases a G4 project only when an active shared BOM and factory spec evidence exist', async () => {
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');

    const result = await releaseNpdProjectToFactory({
      projectId,
      activeFactorySpecId: factorySpecId,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        projectId,
        productCode,
        activeBomHeaderId,
        activeFactorySpecId: factorySpecId,
        releaseStatus: 'released_to_factory',
        outboxEventType: 'fg.released_to_factory',
      },
    });

    const persisted = await owner.query<{
      release_status: string;
      active_bom_header_id: string;
      active_factory_spec_id: string;
      factory_approved_by: string;
      release_event_id: string;
    }>(
      `select release_status, active_bom_header_id, active_factory_spec_id, factory_approved_by, release_event_id
         from public.factory_release_status
        where org_id = $1 and project_id = $2`,
      [orgId, projectId],
    );
    expect(persisted.rows[0]).toMatchObject({
      release_status: 'released_to_factory',
      active_bom_header_id: activeBomHeaderId,
      active_factory_spec_id: factorySpecId,
      factory_approved_by: userId,
    });

    const events = await owner.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload
         from public.outbox_events
        where org_id = $1 and aggregate_id = $2
        order by id`,
      [orgId, projectId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual(['fg.released_to_factory']);
    expect(events.rows[0]?.payload).toMatchObject({
      projectId,
      productCode,
      activeBomHeaderId,
      activeFactorySpecId: factorySpecId,
    });
  });

  it('is idempotent and does not duplicate fg.released_to_factory', async () => {
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');

    const result = await releaseNpdProjectToFactory(projectId);

    expect(result).toMatchObject({
      ok: true,
      data: {
        projectId,
        activeFactorySpecId: factorySpecId,
        releaseStatus: 'released_to_factory',
      },
    });

    const events = await owner.query<{ count: string }>(
      `select count(*)::text as count
         from public.outbox_events
        where org_id = $1
          and aggregate_id = $2
          and event_type = 'fg.released_to_factory'`,
      [orgId, projectId],
    );
    expect(events.rows[0]?.count).toBe('1');
  });
});
