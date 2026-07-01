import { describe, expect, it } from 'vitest';
import { hasAnyPermission, hasPermission, type HasPermissionClient } from '../has-permission';

type RoleFixture = {
  orgId?: string;
  rpPermissions?: string[];
  jsonbPermissions?: string[];
  code?: string;
  slug?: string;
};

const ORG_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_ORG_ID = '00000000-0000-4000-8000-000000000003';

class FakePermissionClient implements HasPermissionClient {
  readonly calls: Array<{ sql: string; params?: readonly unknown[] }> = [];

  constructor(private readonly roles: RoleFixture[]) {}

  async query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }> {
    this.calls.push({ sql, params });

    const requested = params?.[2];
    const superRoles = params?.[3];
    const orgId = params?.[1];
    const permissions = Array.isArray(requested) ? requested : [requested];
    const bypassRoles = Array.isArray(superRoles) ? superRoles : [];

    const ok = this.roles.some((role) => {
      if (role.orgId !== undefined && role.orgId !== orgId) {
        return false;
      }

      const normalizedPermissions = permissions.filter((permission): permission is string => typeof permission === 'string');
      return (
        normalizedPermissions.some((permission) => role.rpPermissions?.includes(permission)) ||
        normalizedPermissions.some((permission) => role.jsonbPermissions?.includes(permission)) ||
        (typeof role.code === 'string' && bypassRoles.includes(role.code)) ||
        (typeof role.slug === 'string' && bypassRoles.includes(role.slug))
      );
    });

    return { rows: ok ? ([{ ok: true }] as T[]) : [] };
  }
}

const ctxFor = (client: HasPermissionClient) => ({
  userId: '00000000-0000-4000-8000-000000000001',
  orgId: ORG_ID,
  client,
});

describe('hasPermission', () => {
  it('grants when a role_permissions row exists', async () => {
    const client = new FakePermissionClient([{ rpPermissions: ['production.wo.release'] }]);

    await expect(hasPermission(ctxFor(client), 'production.wo.release')).resolves.toBe(true);
  });

  it('grants when only roles.permissions jsonb contains the permission', async () => {
    const client = new FakePermissionClient([{ jsonbPermissions: ['technical.items.edit'] }]);

    await expect(hasPermission(ctxFor(client), 'technical.items.edit')).resolves.toBe(true);
  });

  it('denies module_admin without an explicit permission', async () => {
    const client = new FakePermissionClient([{ code: 'module_admin' }]);

    await expect(hasPermission(ctxFor(client), 'warehouse.lp.adjust')).resolves.toBe(false);
  });

  it('grants module_admin when an explicit seeded permission exists', async () => {
    const client = new FakePermissionClient([{ code: 'module_admin', rpPermissions: ['settings.users.create'] }]);

    await expect(hasPermission(ctxFor(client), 'settings.users.create')).resolves.toBe(true);
  });

  it('grants owner/admin/org_admin as super roles without an explicit permission', async () => {
    for (const code of ['owner', 'admin', 'org_admin']) {
      const client = new FakePermissionClient([{ code }]);

      await expect(hasPermission(ctxFor(client), 'warehouse.lp.adjust')).resolves.toBe(true);
    }
  });

  it('grants when role.slug is a super role without an explicit permission', async () => {
    const client = new FakePermissionClient([{ slug: 'org_admin' }]);

    await expect(hasPermission(ctxFor(client), 'quality.ncr.close')).resolves.toBe(true);
  });

  it('denies when the user has a role but no permission or super-role bypass', async () => {
    const client = new FakePermissionClient([{ code: 'operator', slug: 'operator' }]);

    await expect(hasPermission(ctxFor(client), 'production.wo.release')).resolves.toBe(false);
  });

  it('denies when the user has no role rows', async () => {
    const client = new FakePermissionClient([]);

    await expect(hasPermission(ctxFor(client), 'production.wo.release')).resolves.toBe(false);
  });

  it('emits SQL containing downstream mock guard tokens', async () => {
    const client = new FakePermissionClient([{ rpPermissions: ['production.wo.release'] }]);

    await hasPermission(ctxFor(client), 'production.wo.release');

    expect(client.calls[0]?.sql).toContain('user_roles');
    expect(client.calls[0]?.sql).toContain('role_permissions');
    expect(client.calls[0]?.sql).toContain('coalesce');
    expect(client.calls[0]?.sql).toContain('any($4');
    expect(client.calls[0]?.sql).not.toContain('r.code = $3');
    expect(client.calls[0]?.sql).not.toContain('r.slug = $3');
  });

  it('denies when a matching role permission belongs to another org', async () => {
    const client = new FakePermissionClient([
      { orgId: OTHER_ORG_ID, rpPermissions: ['production.wo.release'] },
    ]);

    await expect(hasPermission(ctxFor(client), 'production.wo.release')).resolves.toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('grants if any listed permission matches', async () => {
    const client = new FakePermissionClient([{ rpPermissions: ['production.wo.release'] }]);

    await expect(
      hasAnyPermission(ctxFor(client), ['production.wo.cancel', 'production.wo.release']),
    ).resolves.toBe(true);
  });

  it('denies if none of the listed permissions match', async () => {
    const client = new FakePermissionClient([{ jsonbPermissions: ['quality.holds.release'] }]);

    await expect(
      hasAnyPermission(ctxFor(client), ['production.wo.cancel', 'production.wo.release']),
    ).resolves.toBe(false);
  });
});
