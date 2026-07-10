/**
 * Wave 17 — deleteProject transaction faithfulness (N-42).
 * Skips when DATABASE_URL is unset.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deleteProject } from '../delete-project';
import { getAppConnection, getOwnerConnection } from '../../../../../../../packages/db/src/clients.js';

const databaseUrl = process.env.DATABASE_URL;
const runPg = databaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const userId = randomUUID();
const roleId = randomUUID();
const projectId = randomUUID();
const blockedProjectId = randomUUID();
const approvalId = randomUUID();
const blockedApprovalId = randomUUID();
const projectCode = `W17-DEL-${orgId.slice(0, 8)}`;
const blockedProjectCode = `W17-BLK-${orgId.slice(0, 8)}`;

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

runPg('deleteProject gate approval preservation (real Postgres)', () => {
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
         (id, org_id, code, current_stage, current_gate, created_by_user)
       values
         ($1, $2, $3, 'brief', 'G0', $4),
         ($5, $2, $6, 'brief', 'G0', $4)
       on conflict (id) do nothing`,
      [projectId, orgId, projectCode, userId, blockedProjectId, blockedProjectCode],
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
         if old.id = '${blockedProjectId}'::uuid then
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
    await ownerPool?.query('delete from public.gate_approvals where org_id = $1', [orgId]).catch(() => undefined);
    await ownerPool?.query('delete from public.npd_projects where org_id = $1', [orgId]).catch(() => undefined);
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
});
