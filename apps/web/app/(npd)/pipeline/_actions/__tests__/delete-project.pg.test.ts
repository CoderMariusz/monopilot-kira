/**
 * Wave 17 — deleteProject transaction faithfulness (N-42).
 * Requires DATABASE_URL — loud fail, no describe.skip.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteProject } from '../delete-project';
import { getAppConnection, getOwnerConnection } from '../../../../../../../packages/db/src/clients.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('delete-project.pg.test.ts requires DATABASE_URL (no silent describe.skip)');
}

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const projectId = randomUUID();
const blockedProjectId = randomUUID();
const linkedFgBlockedProjectId = randomUUID();
const linkedFgWoProjectId = randomUUID();
const approvalId = randomUUID();
const blockedApprovalId = randomUUID();
const projectCode = `W17-DEL-${orgId.slice(0, 8)}`;
const blockedProjectCode = `W17-BLK-${orgId.slice(0, 8)}`;
const linkedFgBlockedProjectCode = `W17-FG-${orgId.slice(0, 8)}`;
const linkedFgWoProjectCode = `W17-WO-${orgId.slice(0, 8)}`;
const linkedFgProductCode = `FG-W17-${orgId.slice(0, 8).toUpperCase()}`;
const linkedFgWoProductCode = `FG-W17W-${orgId.slice(0, 8).toUpperCase()}`;
const linkedFgWoId = randomUUID();

const BLOCK_TRIGGER = 'test_w17_block_npd_delete';

async function withActionActor<T>(fn: () => Promise<T>): Promise<T> {
  const priorUser = process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
  const priorOrg = process.env.NEXT_SERVER_ACTION_ORG_ID;
  process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = userId;
  process.env.NEXT_SERVER_ACTION_ORG_ID = orgId;
  try {
    return await fn();
  } finally {
    if (priorUser === undefined) delete process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID;
    else process.env.NEXT_SERVER_ACTION_ACTOR_USER_ID = priorUser;
    if (priorOrg === undefined) delete process.env.NEXT_SERVER_ACTION_ORG_ID;
    else process.env.NEXT_SERVER_ACTION_ORG_ID = priorOrg;
  }
}

describe('deleteProject gate approval preservation (real Postgres)', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    ownerPool = getOwnerConnection();
    appPool = getAppConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'Wave17 Delete Tenant', 'eu', 'https://wave17-delete.example.test')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, slug, industry_code)
       values ($1, $2, 'Wave17 Delete Org', $3, 'fmcg')
       on conflict (id) do nothing`,
      [orgId, tenantId, `w17-del-${orgId.slice(0, 8)}`],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, code, name, permissions)
       values ($1, $2, 'w17-del', 'w17-del', 'Wave17 Delete Role', '[]'::jsonb)
       on conflict (id) do nothing`,
      [roleId, orgId],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'Wave17 Delete User', $4)
       on conflict (id) do nothing`,
      [userId, orgId, `w17-del-${userId}@example.test`, roleId],
    );
    await ownerPool.query(
      `insert into public.user_roles (org_id, user_id, role_id)
       values ($1, $2, $3) on conflict do nothing`,
      [orgId, userId, roleId],
    );
    await ownerPool.query(
      `insert into public.role_permissions (role_id, permission)
       values ($1, 'npd.project.create')
       on conflict (role_id, permission) do nothing`,
      [roleId],
    );
    await ownerPool.query(
      `insert into public.npd_projects
         (id, org_id, code, current_stage, current_gate, created_by_user, product_code)
       values
         ($1, $2, $3, 'brief', 'G0', $4, null),
         ($5, $2, $6, 'brief', 'G0', $4, null),
         ($7, $2, $8, 'brief', 'G0', $4, $9),
         ($10, $2, $11, 'brief', 'G0', $4, $12)
       on conflict (id) do nothing`,
      [
        projectId,
        orgId,
        projectCode,
        userId,
        blockedProjectId,
        blockedProjectCode,
        linkedFgBlockedProjectId,
        linkedFgBlockedProjectCode,
        linkedFgProductCode,
        linkedFgWoProjectId,
        linkedFgWoProjectCode,
        linkedFgWoProductCode,
      ],
    );
    await ownerPool.query(
      `insert into public.product
         (org_id, product_code, product_name, created_by_user, app_version)
       values ($1, $2, 'W17 linked draft FG', $3, 'w17-delete-test')
       on conflict do nothing`,
      [orgId, linkedFgProductCode, userId],
    );
    await ownerPool.query(
      `update public.items
          set npd_project_id = $3::uuid,
              status = 'active'
        where org_id = $1
          and item_code = $2
          and item_type = 'fg'`,
      [orgId, linkedFgProductCode, linkedFgBlockedProjectId],
    );
    await ownerPool.query(
      `insert into public.product
         (org_id, product_code, product_name, created_by_user, app_version)
       values ($1, $2, 'W17 linked draft FG (WO guard)', $3, 'w17-delete-test')
       on conflict do nothing`,
      [orgId, linkedFgWoProductCode, userId],
    );
    await ownerPool.query(
      `update public.items
          set npd_project_id = $3::uuid,
              status = 'active'
        where org_id = $1
          and item_code = $2
          and item_type = 'fg'`,
      [orgId, linkedFgWoProductCode, linkedFgWoProjectId],
    );
    const { rows: linkedFgWoItems } = await ownerPool.query<{ id: string }>(
      `select id
         from public.items
        where org_id = $1::uuid
          and item_code = $2
          and item_type = 'fg'`,
      [orgId, linkedFgWoProductCode],
    );
    const linkedFgWoItemId = linkedFgWoItems[0]?.id;
    if (!linkedFgWoItemId) {
      throw new Error('linked FG item twin missing for WO dependency seed');
    }
    await ownerPool.query(
      `insert into public.work_orders
         (id, org_id, wo_number, product_id, item_type_at_creation, planned_quantity, uom, status, created_by, updated_by)
       values ($1, $2, $3, $4, 'fg', 1.000, 'pcs', 'DRAFT', $5, $5)
       on conflict (id) do nothing`,
      [linkedFgWoId, orgId, `W17-WO-${orgId.slice(0, 8)}`, linkedFgWoItemId, userId],
    );
    await ownerPool.query(
      `insert into public.gate_approvals
         (id, org_id, project_id, gate_code, decision, approver_user_id, notes)
       values
         ($1, $2, $3, 'G0', 'approved', $4, 'delete test approval'),
         ($5, $2, $6, 'G0', 'approved', $4, 'blocked delete approval')
       on conflict (id) do nothing`,
      [approvalId, orgId, projectId, userId, blockedApprovalId, blockedProjectId],
    );

    await ownerPool.query(
      `create or replace function public.${BLOCK_TRIGGER}()
       returns trigger
       language plpgsql
       as $$
       begin
         if old.id in ('${blockedProjectId}'::uuid, '${linkedFgBlockedProjectId}'::uuid) then
           raise foreign_key_violation using message = 'test dependent blocks delete';
         end if;
         return old;
       end;
       $$`,
    );
    await ownerPool.query(
      `drop trigger if exists ${BLOCK_TRIGGER} on public.npd_projects`,
    );
    await ownerPool.query(
      `create trigger ${BLOCK_TRIGGER}
         before delete on public.npd_projects
         for each row
         execute function public.${BLOCK_TRIGGER}()`,
    );
  });

  afterAll(async () => {
    await ownerPool?.query(`drop trigger if exists ${BLOCK_TRIGGER} on public.npd_projects`).catch(() => undefined);
    await ownerPool?.query(`drop function if exists public.${BLOCK_TRIGGER}()`).catch(() => undefined);
    await ownerPool?.query('delete from public.outbox_events where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.work_orders where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.gate_approvals where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.npd_projects where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool
      ?.query(
        `delete from public.fg_npd_ext where org_id = $1 and item_id in (
          select id from public.items where org_id = $1 and item_code = $2
        )`,
        [orgId, linkedFgProductCode],
      )
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.items where org_id = $1 and item_code = $2', [orgId, linkedFgProductCode])
      .catch(() => undefined);
    await ownerPool
      ?.query(
        `delete from public.fg_npd_ext where org_id = $1 and item_id in (
          select id from public.items where org_id = $1 and item_code = $2
        )`,
        [orgId, linkedFgWoProductCode],
      )
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.items where org_id = $1 and item_code = $2', [orgId, linkedFgWoProductCode])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.product_legacy where org_id = $1 and product_code = $2', [
        orgId,
        linkedFgWoProductCode,
      ])
      .catch(() => undefined);
    await ownerPool
      ?.query('delete from public.product_legacy where org_id = $1 and product_code = $2', [
        orgId,
        linkedFgProductCode,
      ])
      .catch(() => undefined);
    await ownerPool?.query('delete from public.user_roles where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.role_permissions where role_id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.users where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.roles where id = $1', [roleId]).catch(() => undefined);
    await ownerPool?.query('delete from public.organizations where id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.tenants where id = $1', [tenantId]).catch(() => undefined);
    await appPool?.end();
    await ownerPool?.end();
  });

  it('stamps gate_approvals via SET NULL trigger on successful delete', async () => {
    const result = await withActionActor(() => deleteProject({ projectId }));
    expect(result).toEqual({ ok: true });

    const { rows: projects } = await ownerPool.query(
      `select id from public.npd_projects where id = $1::uuid`,
      [projectId],
    );
    expect(projects).toHaveLength(0);

    const { rows: approvals } = await ownerPool.query<{
      project_id: string | null;
      project_code: string | null;
      project_id_snapshot: string | null;
    }>(
      `select project_id, project_code, project_id_snapshot
         from public.gate_approvals
        where id = $1::uuid`,
      [approvalId],
    );
    expect(approvals[0]).toMatchObject({
      project_id: null,
      project_code: projectCode,
      project_id_snapshot: projectId,
    });

    const { rows: events } = await ownerPool.query(
      `select event_type from public.outbox_events
        where org_id = $1::uuid and event_type = 'npd.project.deleted'`,
      [orgId],
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('leaves gate_approvals unstamped when delete fails with FK violation', async () => {
    const result = await withActionActor(() => deleteProject({ projectId: blockedProjectId }));
    expect(result).toEqual({ ok: false, error: 'HAS_DEPENDENTS' });

    const { rows: projects } = await ownerPool.query(
      `select id from public.npd_projects where id = $1::uuid`,
      [blockedProjectId],
    );
    expect(projects).toHaveLength(1);

    const { rows: approvals } = await ownerPool.query<{
      project_id: string | null;
      project_code: string | null;
      project_id_snapshot: string | null;
    }>(
      `select project_id, project_code, project_id_snapshot
         from public.gate_approvals
        where id = $1::uuid`,
      [blockedApprovalId],
    );
    expect(approvals[0]).toMatchObject({
      project_id: blockedProjectId,
      project_code: null,
      project_id_snapshot: null,
    });
  });

  it('rolls back linked FG archive when FK blocks delete after side-effect writes', async () => {
    const result = await withActionActor(() => deleteProject({ projectId: linkedFgBlockedProjectId }));
    expect(result).toEqual({ ok: false, error: 'HAS_DEPENDENTS' });

    const { rows: projects } = await ownerPool.query<{ deleted_at: string | null }>(
      `select deleted_at
         from public.npd_projects
        where id = $1::uuid`,
      [linkedFgBlockedProjectId],
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]?.deleted_at).toBeNull();

    const { rows: products } = await ownerPool.query<{ deleted_at: string | null }>(
      `select deleted_at
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [orgId, linkedFgProductCode],
    );
    expect(products[0]?.deleted_at).toBeNull();

    const { rows: items } = await ownerPool.query<{ status: string }>(
      `select status
         from public.items
        where org_id = $1::uuid
          and item_code = $2
          and item_type = 'fg'`,
      [orgId, linkedFgProductCode],
    );
    expect(items[0]?.status).not.toBe('blocked');

    const { rows: events } = await ownerPool.query(
      `select id
         from public.outbox_events
        where org_id = $1::uuid
          and event_type = 'npd.project.deleted'
          and aggregate_id = $2::text`,
      [orgId, linkedFgBlockedProjectId],
    );
    expect(events).toHaveLength(0);
  });

  it('leaves linked FG untouched when a work order dependency blocks delete before archive writes', async () => {
    const result = await withActionActor(() => deleteProject({ projectId: linkedFgWoProjectId }));
    expect(result).toMatchObject({ ok: false, error: 'LINKED_FG_BLOCKED', blockReason: 'LINKED_FG_IN_PRODUCTION' });

    const { rows: projects } = await ownerPool.query<{ deleted_at: string | null }>(
      `select deleted_at
         from public.npd_projects
        where id = $1::uuid`,
      [linkedFgWoProjectId],
    );
    expect(projects).toHaveLength(1);
    expect(projects[0]?.deleted_at).toBeNull();

    const { rows: products } = await ownerPool.query<{ deleted_at: string | null }>(
      `select deleted_at
         from public.product
        where org_id = $1::uuid
          and product_code = $2`,
      [orgId, linkedFgWoProductCode],
    );
    expect(products[0]?.deleted_at).toBeNull();

    const { rows: items } = await ownerPool.query<{ status: string }>(
      `select status
         from public.items
        where org_id = $1::uuid
          and item_code = $2
          and item_type = 'fg'`,
      [orgId, linkedFgWoProductCode],
    );
    expect(items[0]?.status).not.toBe('blocked');

    const { rows: events } = await ownerPool.query(
      `select id
         from public.outbox_events
        where org_id = $1::uuid
          and event_type = 'npd.project.deleted'
          and aggregate_id = $2::text`,
      [orgId, linkedFgWoProjectId],
    );
    expect(events).toHaveLength(0);
  });
});
