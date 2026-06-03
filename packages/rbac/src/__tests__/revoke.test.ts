import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getOwnerConnection } from '../../../db/src/clients.js';
import { revokeRole } from '../grant.js';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL || process.env.DATABASE_URL_OWNER);
const runIntegrationSuite = hasDatabaseUrl ? describe : describe.skip;

const tenantId = randomUUID();
const orgId = randomUUID();
const actorUserId = randomUUID();
const targetUserId = randomUUID();
const roleId = randomUUID();
const roleSlug = 'production.line_lead';
const actorEmail = `t091-rbac-actor-${actorUserId}@example.test`;
const targetEmail = `t091-rbac-target-${targetUserId}@example.test`;

let ownerPool: pg.Pool;

describe('revokeRole canonical guards', () => {
  it('rejects legacy permission aliases without opening a DB connection', async () => {
    await expect(
      revokeRole({
        actorUserId,
        targetUserId,
        orgId,
        roleSlug: 'fa.edit',
      }),
    ).resolves.toEqual({ success: false, error: 'legacy_alias' });
  });
});

runIntegrationSuite('revokeRole canonical audited revoke', () => {
  beforeAll(async () => {
    ownerPool = getOwnerConnection();

    await ownerPool.query(
      `insert into public.tenants (id, name, region_cluster, data_plane_url)
       values ($1, 'T-091 RBAC Tenant', 'eu', 'https://t091-rbac.test.invalid')
       on conflict (id) do nothing`,
      [tenantId],
    );
    await ownerPool.query(
      `insert into public.organizations (id, tenant_id, name, industry_code)
       values ($1, $2, 'T-091 RBAC Org', 'generic')
       on conflict (id) do nothing`,
      [orgId, tenantId],
    );
    await ownerPool.query(
      `insert into public.roles (id, org_id, slug, system, code, name, permissions, is_system)
       values ($1, $2, $3, false, $3, 'Production Line Lead', '[]'::jsonb, false)
       on conflict (id) do update
          set slug = excluded.slug,
              system = excluded.system,
              code = excluded.code,
              name = excluded.name,
              permissions = excluded.permissions,
              is_system = excluded.is_system`,
      [roleId, orgId, roleSlug],
    );
    await ownerPool.query(
      `insert into public.users (id, org_id, email, name, role_id)
       values ($1, $2, $3, 'T-091 RBAC Actor', $4),
              ($5, $2, $6, 'T-091 RBAC Target', $4)
       on conflict (id) do update
          set org_id = excluded.org_id,
              email = excluded.email,
              name = excluded.name,
              role_id = excluded.role_id`,
      [actorUserId, orgId, actorEmail, roleId, targetUserId, targetEmail],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [targetUserId, roleId, orgId],
    );
  });

  afterAll(async () => {
    if (!hasDatabaseUrl) return;

    await ownerPool.query(`delete from public.audit_events where org_id = $1`, [orgId]);
    await ownerPool.query(`delete from public.user_roles where org_id = $1`, [orgId]);
    await ownerPool.query(`delete from public.users where id in ($1, $2)`, [actorUserId, targetUserId]);
    await ownerPool.query(`delete from public.roles where id = $1`, [roleId]);
    await ownerPool.query(`delete from public.organizations where id = $1`, [orgId]);
    await ownerPool.query(`delete from public.tenants where id = $1`, [tenantId]);
    await ownerPool.end();
  });

  it('deletes only the org-scoped role membership and writes role.revoked security audit', async () => {
    const result = await revokeRole({
      actorUserId,
      targetUserId,
      orgId,
      roleSlug,
    });

    expect(result).toEqual({ success: true });

    const remaining = await ownerPool.query(
      `select 1
         from public.user_roles ur
         join public.roles r on r.id = ur.role_id
        where ur.user_id = $1
          and ur.org_id = $2
          and r.slug = $3`,
      [targetUserId, orgId, roleSlug],
    );
    expect(remaining.rowCount).toBe(0);

    const audit = await ownerPool.query<{ action: string; retention_class: string }>(
      `select action, retention_class
         from public.audit_events
        where org_id = $1
          and action = 'role.revoked'
        order by occurred_at desc
        limit 1`,
      [orgId],
    );
    expect(audit.rows[0]).toEqual({ action: 'role.revoked', retention_class: 'security' });
  });

  it('system actor revoke writes role.revoked with actor_user_id null', async () => {
    const role = await ownerPool.query<{ id: string }>(
      `select id from public.roles where org_id = $1 and slug = $2`,
      [orgId, roleSlug],
    );
    await ownerPool.query(
      `insert into public.user_roles (user_id, role_id, org_id)
       values ($1, $2, $3)
       on conflict do nothing`,
      [targetUserId, role.rows[0]!.id, orgId],
    );

    const result = await revokeRole({
      actorType: 'system',
      targetUserId,
      orgId,
      roleSlug,
    });

    expect(result).toEqual({ success: true });

    const audit = await ownerPool.query<{
      actor_type: string;
      actor_user_id: string | null;
      action: string;
      retention_class: string;
    }>(
      `select actor_type, actor_user_id, action, retention_class
         from public.audit_events
        where org_id = $1
          and action = 'role.revoked'
        order by occurred_at desc
        limit 1`,
      [orgId],
    );
    expect(audit.rows[0]).toEqual({
      actor_type: 'system',
      actor_user_id: null,
      action: 'role.revoked',
      retention_class: 'security',
    });
  });

  it('is idempotent: missing assignment returns success without writing a misleading audit row', async () => {
    const before = await ownerPool.query<{ count: string }>(
      `select count(*) as count
         from public.audit_events
        where org_id = $1
          and action = 'role.revoked'`,
      [orgId],
    );

    const result = await revokeRole({
      actorUserId,
      targetUserId,
      orgId,
      roleSlug,
    });

    expect(result).toEqual({ success: true });

    const after = await ownerPool.query<{ count: string }>(
      `select count(*) as count
         from public.audit_events
        where org_id = $1
          and action = 'role.revoked'`,
      [orgId],
    );
    expect(Number(after.rows[0]!.count)).toBe(Number(before.rows[0]!.count));
  });
});
