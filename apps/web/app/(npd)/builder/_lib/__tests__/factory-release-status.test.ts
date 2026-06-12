import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ownerQueryWithInferredOrgContext, ensureAppUser as ensureAppUserWithAdvisoryLock } from '../../../../../tests/helpers/owner-org-context.js';

const databaseUrl = process.env.DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const appUserPassword = process.env.APP_USER_PASSWORD ?? 'app-user-test-password';
const tenantId = randomUUID();
const orgId = randomUUID();
const otherOrgId = randomUUID();
const userId = randomUUID();
const otherUserId = randomUUID();
const roleId = randomUUID();
const otherRoleId = randomUUID();
const projectId = randomUUID();
const otherProjectId = randomUUID();
const bomHeaderId = randomUUID();
const otherBomHeaderId = randomUUID();
const factorySpecId = randomUUID();
const otherFactorySpecId = randomUUID();
const productCode = `FG-T097-${randomUUID().slice(0, 8)}`;
const otherProductCode = `FG-T097-${randomUUID().slice(0, 8)}`;

let owner: pg.Pool;

async function ensureAppUser(): Promise<void> {
  await ensureAppUserWithAdvisoryLock(owner);
}

async function seed(): Promise<void> {
  await ensureAppUser();
  await owner.query(
    `
      insert into public.tenants (id, name, region_cluster, data_plane_url)
      values ($1, 'T-097 IT Tenant', 'eu', 'https://t097-it.example.test')
    `,
    [tenantId],
  );
  await owner.query(
    `
      insert into public.organizations (id, tenant_id, name, industry_code)
      values ($1, $2, 'T-097 IT Org', 'bakery'),
             ($3, $2, 'T-097 IT Other Org', 'fmcg')
    `,
    [orgId, tenantId, otherOrgId],
  );
  await owner.query(
    `
      insert into public.roles (id, org_id, code, name, permissions)
      values ($1, $2, 't097-admin', 'T-097 Admin', '[]'::jsonb),
             ($3, $4, 't097-admin', 'T-097 Other Admin', '[]'::jsonb)
    `,
    [roleId, orgId, otherRoleId, otherOrgId],
  );
  await owner.query(
    `
      insert into public.users (id, org_id, email, name, role_id)
      values ($1, $2, 't097-action@example.test', 'T-097 Action User', $3),
             ($4, $5, 't097-other@example.test', 'T-097 Other User', $6)
    `,
    [userId, orgId, roleId, otherUserId, otherOrgId, otherRoleId],
  );
  // One wrapped statement per org: the org-context trigger validates each
  // row against app.current_org_id(), so a statement cannot span orgs.
  await ownerQueryWithInferredOrgContext(owner,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'T-097 Product', false, 1, $3)
    `,
    [productCode, orgId, userId],
  );
  await ownerQueryWithInferredOrgContext(owner,
    `
      insert into public.product (product_code, org_id, product_name, built, schema_version, created_by_user)
      values ($1, $2, 'T-097 Other Product', false, 1, $3)
    `,
    [otherProductCode, otherOrgId, otherUserId],
  );
  await owner.query(
    `
      insert into public.npd_projects (id, org_id, code, name, type, product_code, created_by_user)
      values ($1, $2, 'NPD-T097-IT', 'T-097 IT Project', 'standard', $3, $4),
             ($5, $6, 'NPD-T097-OTHER', 'T-097 Other Project', 'standard', $7, $8)
    `,
    [projectId, orgId, productCode, userId, otherProjectId, otherOrgId, otherProductCode, otherUserId],
  );
  await owner.query(
    `
      insert into public.bom_headers
        (id, org_id, product_id, npd_project_id, origin_module, status, version, approved_by, approved_at)
      values
        ($1, $2, $3, $4, 'npd', 'technical_approved', 1, $5, now()),
        ($6, $7, $8, $9, 'npd', 'technical_approved', 1, $10, now())
    `,
    [
      bomHeaderId,
      orgId,
      productCode,
      projectId,
      userId,
      otherBomHeaderId,
      otherOrgId,
      otherProductCode,
      otherProjectId,
      otherUserId,
    ],
  );
}

async function cleanup(): Promise<void> {
  await owner.query(`delete from public.outbox_events where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.factory_release_status where org_id in ($1, $2)`, [orgId, otherOrgId]).catch(() => undefined);
  await owner.query(`delete from public.bom_headers where org_id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.npd_projects where org_id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.product where org_id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.users where org_id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.roles where org_id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.organizations where id in ($1, $2)`, [orgId, otherOrgId]);
  await owner.query(`delete from public.tenants where id = $1`, [tenantId]);
}

run('factory release status transitions — REAL DB integration', () => {
  beforeAll(async () => {
    // eslint-disable-next-line no-restricted-syntax -- test-only owner pool for setup/assertions; actions use withOrgContext app_user + RLS
    owner = new pg.Pool({ connectionString: databaseUrl });
    process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
    process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
    await seed();
  }, 120000);

  afterAll(async () => {
    await cleanup();
    delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    await owner.end();
  });

  it('creates pending_technical_approval with active IDs and no factory availability before Technical approval', async () => {
    const { requestFactoryRelease } = await import('../factory-release-status');
    const { isFactoryUsable } = await import('../factory-release-helpers');

    const release = await requestFactoryRelease({
      projectId,
      productCode,
      activeBomHeaderId: bomHeaderId,
      activeFactorySpecId: factorySpecId,
    });

    expect(release.releaseStatus).toBe('pending_technical_approval');
    expect(release.activeBomHeaderId).toBe(bomHeaderId);
    expect(release.activeFactorySpecId).toBe(factorySpecId);
    expect(release.factoryAvailableAt).toBeNull();
    expect(isFactoryUsable(release)).toBe(false);

    const persisted = await owner.query<{
      release_status: string;
      factory_available_at: Date | null;
      active_bom_header_id: string;
      active_factory_spec_id: string;
    }>(
      `
        select release_status, factory_available_at, active_bom_header_id, active_factory_spec_id
        from public.factory_release_status
        where org_id = $1 and project_id = $2
      `,
      [orgId, projectId],
    );
    expect(persisted.rows[0]).toEqual({
      release_status: 'pending_technical_approval',
      factory_available_at: null,
      active_bom_header_id: bomHeaderId,
      active_factory_spec_id: factorySpecId,
    });

    const events = await owner.query<{ event_type: string; aggregate_id: string }>(
      `
        select event_type, aggregate_id
        from public.outbox_events
        where org_id = $1
          and aggregate_id = $2
        order by id
      `,
      [orgId, projectId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual([
      'npd.project.release_requested',
      'npd.builder.released_records_created',
    ]);
  });

  it('transitions to released_to_factory only for the real Technical-approved active BOM/spec bundle', async () => {
    const { recordTechnicalFactoryApproval } = await import('../factory-release-status');
    const { isFactoryUsable } = await import('../factory-release-helpers');

    const release = await recordTechnicalFactoryApproval({
      projectId,
      productCode,
      activeBomHeaderId: bomHeaderId,
      activeFactorySpecId: factorySpecId,
    });

    expect(release.releaseStatus).toBe('released_to_factory');
    expect(release.factoryApprovedBy).toBe(userId);
    expect(release.factoryAvailableAt).toEqual(expect.any(String));
    expect(release.releaseEventId).toEqual(expect.any(Number));
    expect(release.releaseBlockers).toEqual([]);
    expect(isFactoryUsable(release)).toBe(true);

    const persisted = await owner.query<{
      release_status: string;
      factory_available_at: Date | null;
      factory_approved_by: string | null;
      release_event_id: number | null;
    }>(
      `
        select release_status, factory_available_at, factory_approved_by, release_event_id
        from public.factory_release_status
        where org_id = $1 and project_id = $2
      `,
      [orgId, projectId],
    );
    expect(persisted.rows[0]).toMatchObject({
      release_status: 'released_to_factory',
      factory_approved_by: userId,
      release_event_id: expect.any(String),
    });
    expect(persisted.rows[0]?.factory_available_at).toEqual(expect.any(Date));

    const event = await owner.query<{ event_type: string; payload: Record<string, unknown> }>(
      `
        select event_type, payload
        from public.outbox_events
        where id = $1
      `,
      [persisted.rows[0]?.release_event_id],
    );
    expect(event.rows[0]?.event_type).toBe('fg.released_to_factory');
    expect(event.rows[0]?.payload).toMatchObject({
      projectId,
      productCode,
      activeBomHeaderId: bomHeaderId,
      activeFactorySpecId: factorySpecId,
    });
  });

  it('emits typed blockers and prevents factory usability when blocked', async () => {
    const { blockFactoryRelease } = await import('../factory-release-status');
    const { isFactoryUsable } = await import('../factory-release-helpers');

    const blockers = [
      {
        type: 'missing_rm_usability',
        message: 'RM usability failed',
        remediationHref: `/technical/bom/${bomHeaderId}/usability`,
      },
    ];
    const release = await blockFactoryRelease({
      projectId,
      productCode,
      activeBomHeaderId: bomHeaderId,
      activeFactorySpecId: factorySpecId,
      blockers,
    });

    expect(release.releaseStatus).toBe('blocked');
    expect(release.releaseBlockers).toEqual(blockers);
    expect(isFactoryUsable(release)).toBe(false);

    const event = await owner.query<{ event_type: string; payload: { blockers: unknown[] } }>(
      `
        select event_type, payload
        from public.outbox_events
        where id = $1
      `,
      [release.releaseEventId],
    );
    expect(event.rows[0]?.event_type).toBe('fg.release_blocked');
    expect(event.rows[0]?.payload.blockers).toEqual(blockers);
  });

  it('treats D365 export as a no-op for canonical factory release status', async () => {
    const { recordD365Export, getFactoryReleaseStatus } = await import('../factory-release-status');

    const before = await owner.query<{ count: string }>(
      `
        select count(*)::text as count
        from public.outbox_events
        where org_id = $1
          and aggregate_id = $2
          and event_type in ('technical.factory_spec.approved', 'fg.released_to_factory')
      `,
      [orgId, projectId],
    );

    await recordD365Export({
      projectId,
      productCode,
      d365ExportRunId: randomUUID(),
    });

    const release = await getFactoryReleaseStatus({ projectId, productCode });
    expect(release?.releaseStatus).toBe('blocked');

    const d365Events = await owner.query<{ count: string }>(
      `
        select count(*)::text as count
        from public.outbox_events
        where org_id = $1
          and aggregate_id = $2
          and event_type in ('technical.factory_spec.approved', 'fg.released_to_factory')
      `,
      [orgId, projectId],
    );
    expect(d365Events.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('does not let the action cross org boundaries through withOrgContext + RLS', async () => {
    const { requestFactoryRelease } = await import('../factory-release-status');

    await expect(
      requestFactoryRelease({
        projectId: otherProjectId,
        productCode: otherProductCode,
        activeBomHeaderId: otherBomHeaderId,
        activeFactorySpecId: otherFactorySpecId,
      }),
    ).rejects.toThrow(/not found|row-level security|violates|permission denied/i);

    const otherRows = await owner.query<{ count: string }>(
      `select count(*)::text as count from public.factory_release_status where org_id = $1`,
      [otherOrgId],
    );
    expect(otherRows.rows[0]?.count).toBe('0');
  });
});
