/**
 * DEFECT-8 — Settings Roles Editor server actions.
 *
 * Covers:
 *  - createRole: org-scoped, slug-validated, refuses SYSTEM_ROLE_CODES.
 *  - listRolePermissions: reads role_permissions for an org-scoped role.
 *  - setRolePermissions: catalog validation, system-role lock, and the
 *    CRITICAL dual-store consistency — in ONE withOrgContext transaction it
 *    must (a) delete the removed role_permissions rows, (b) insert the added
 *    role_permissions rows, AND (c) rebuild roles.permissions jsonb to the exact
 *    same set, plus a security-retained audit row.
 *
 * The fake client captures every SQL string + params so we can assert the full
 * dual-store write happened inside the single callback (one txn).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidateLocalized } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidateLocalized: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => _withOrgContextRunner(action)),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: _revalidateLocalized }));

import {
  createRole,
  listRolePermissions,
  setRolePermissions,
} from './role-admin-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const CUSTOM_ROLE_ID = '33333333-3333-4333-8333-333333333333';
const SYSTEM_ROLE_ID = '44444444-4444-4444-8444-444444444444';

const MANAGE_PERMISSION = 'settings.roles.assign';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeRole = {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  permissions: string[];
};

type FakeClient = {
  calls: QueryCall[];
  roles: FakeRole[];
  rolePermissions: Map<string, Set<string>>;
  actorPermissions: Set<string>;
  actorRoleCodes: Set<string>;
  actorRoleIds: Set<string>;
  query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    roles: [
      { id: CUSTOM_ROLE_ID, code: 'reviewer', name: 'Reviewer', is_system: false, permissions: ['settings.org.read'] },
      { id: SYSTEM_ROLE_ID, code: 'owner', name: 'Owner', is_system: true, permissions: [] },
    ],
    rolePermissions: new Map([[CUSTOM_ROLE_ID, new Set(['settings.org.read'])]]),
    actorPermissions: new Set([MANAGE_PERMISSION]),
    actorRoleCodes: new Set(['role_manager']),
    actorRoleIds: new Set(['role-manager-id']),
    async query(sql: string, params: readonly unknown[] = []) {
      client.calls.push({ sql, params });
      const text = normalize(sql);

      // Super-role check
      if (text.includes('from public.user_roles ur') && text.includes('r.code = any($3::text[])')) {
        const superRoles = new Set(params[2] as readonly string[]);
        const ok = [...client.actorRoleCodes].some((code) => superRoles.has(code));
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      // SoD self-role membership check
      if (text.includes('from public.user_roles') && text.includes('role_id = $3::uuid')) {
        const ok = client.actorRoleIds.has(params[2] as string);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      // Caller grantable subset query
      if (text.startsWith('select distinct permission') && text.includes('from public.user_roles ur')) {
        const rows = [...client.actorPermissions].map((permission) => ({ permission }));
        return { rows, rowCount: rows.length };
      }

      // RBAC gate check
      if (text.includes('from public.user_roles ur') && text.includes('rp.permission')) {
        const perm = params[2] as string;
        const ok = client.actorPermissions.has(perm);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }

      // Role lookup by code (createRole conflict / generic)
      if (text.startsWith('select') && text.includes('from public.roles') && text.includes('where') && text.includes('code = $')) {
        const code = params.find((p) => typeof p === 'string' && client.roles.some((r) => r.code === p)) as string | undefined;
        const role = client.roles.find((r) => r.code === code);
        return { rows: role ? [{ id: role.id }] : [], rowCount: role ? 1 : 0 };
      }

      // readRolePermissions UNION query — must come before the plain role-by-id branch
      // because it also contains `from public.roles` and `id = $`.
      if (text.includes('union') && text.includes('role_permissions') && text.includes('from public.roles')) {
        const set = client.rolePermissions.get(params[0] as string) ?? new Set<string>();
        return { rows: [...set].map((permission) => ({ permission })), rowCount: set.size };
      }

      // Role lookup by id (setRolePermissions / listRolePermissions)
      if (text.startsWith('select') && text.includes('from public.roles') && text.includes('id = $')) {
        const role = client.roles.find((r) => r.id === params[0]);
        return {
          rows: role ? [{ id: role.id, code: role.code, name: role.name, is_system: role.is_system }] : [],
          rowCount: role ? 1 : 0,
        };
      }

      // list current role_permissions
      if (text.startsWith('select') && text.includes('from public.role_permissions') && text.includes('permission')) {
        const set = client.rolePermissions.get(params[0] as string) ?? new Set<string>();
        return { rows: [...set].map((permission) => ({ permission })), rowCount: set.size };
      }

      // createRole insert
      if (text.startsWith('insert into public.roles')) {
        return { rows: [{ id: 'new-role-id' }], rowCount: 1 };
      }

      // dual-store: delete role_permissions
      if (text.startsWith('delete from public.role_permissions')) {
        return { rows: [], rowCount: 0 };
      }
      // dual-store: insert role_permissions
      if (text.startsWith('insert into public.role_permissions')) {
        return { rows: [], rowCount: 0 };
      }
      // dual-store: update roles.permissions jsonb
      if (text.startsWith('update public.roles')) {
        return { rows: [{ id: params[params.length - 1] }], rowCount: 1 };
      }
      // audit row
      if (text.includes('insert into public.audit_events')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
    ...overrides,
  };
  return client;
}

function runWith(client: FakeClient) {
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: ACTOR_ID, orgId: ORG_ID, client }),
  );
}

describe('DEFECT-8 createRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses system role codes (owner/admin family) with system_role_locked', async () => {
    const client = makeClient();
    runWith(client);
    for (const code of ['owner', 'admin', 'org_admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin']) {
      const res = await createRole({ code, name: 'Hijack' });
      expect(res).toEqual({ ok: false, error: 'system_role_locked' });
    }
    // never reached an INSERT
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.roles'))).toBe(false);
  });

  it('rejects invalid slug codes', async () => {
    const client = makeClient();
    runWith(client);
    for (const code of ['Bad Code', 'UPPER', 'has space', '-leading', '', 'sym$bol']) {
      const res = await createRole({ code, name: 'X' });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('invalid_input');
    }
  });

  it('enforces the manage permission gate (forbidden when missing)', async () => {
    const client = makeClient({ actorPermissions: new Set() });
    runWith(client);
    const res = await createRole({ code: 'qa_reviewer', name: 'QA Reviewer' });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('creates an org-scoped custom role with an empty permission set', async () => {
    const client = makeClient();
    runWith(client);
    const res = await createRole({ code: 'qa_reviewer', name: 'QA Reviewer', description: 'desc' });
    expect(res.ok).toBe(true);
    const insert = client.calls.find((c) => normalize(c.sql).startsWith('insert into public.roles'));
    expect(insert).toBeTruthy();
    // org-scoped via app.current_org_id() and carries the validated code + empty perms
    expect(normalize(insert!.sql)).toContain('app.current_org_id()');
    expect(insert!.params).toContain('qa_reviewer');
  });
});

describe('DEFECT-8 setRolePermissions dual-store consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses edits to system roles with system_role_locked (no writes)', async () => {
    const client = makeClient();
    runWith(client);
    const res = await setRolePermissions({ roleId: SYSTEM_ROLE_ID, permissions: ['settings.org.read'] });
    expect(res).toEqual({ ok: false, error: 'system_role_locked' });
    expect(client.calls.some((c) => normalize(c.sql).startsWith('delete from public.role_permissions'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.role_permissions'))).toBe(false);
  });

  it('rejects permission strings outside the rbac catalog', async () => {
    const client = makeClient();
    runWith(client);
    const res = await setRolePermissions({ roleId: CUSTOM_ROLE_ID, permissions: ['settings.org.read', 'not.a.real.permission'] });
    expect(res).toEqual({ ok: false, error: 'invalid_permission' });
    expect(client.calls.some((c) => normalize(c.sql).startsWith('update public.roles'))).toBe(false);
  });

  it('enforces the manage permission gate (forbidden when missing)', async () => {
    const client = makeClient({ actorPermissions: new Set() });
    runWith(client);
    const res = await setRolePermissions({ roleId: CUSTOM_ROLE_ID, permissions: ['settings.org.read'] });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('blocks non-super callers from granting permissions they do not hold', async () => {
    const client = makeClient({ actorPermissions: new Set([MANAGE_PERMISSION, 'settings.org.read']) });
    runWith(client);

    const res = await setRolePermissions({
      roleId: CUSTOM_ROLE_ID,
      permissions: ['settings.org.read', 'settings.org.update'],
    });

    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls.some((c) => normalize(c.sql).startsWith('delete from public.role_permissions'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('update public.roles'))).toBe(false);
  });

  it('blocks non-super callers from modifying a role they currently hold', async () => {
    const client = makeClient({
      actorPermissions: new Set([MANAGE_PERMISSION, 'settings.org.read']),
      actorRoleIds: new Set([CUSTOM_ROLE_ID]),
    });
    runWith(client);

    const res = await setRolePermissions({ roleId: CUSTOM_ROLE_ID, permissions: ['settings.org.read'] });

    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls.some((c) => normalize(c.sql).startsWith('delete from public.role_permissions'))).toBe(false);
  });

  it('writes BOTH stores in one txn: delete+insert role_permissions AND rebuild roles.permissions jsonb + audit', async () => {
    const nextPerms = ['settings.org.read', 'settings.org.update', 'settings.users.invite'];
    const client = makeClient({ actorPermissions: new Set([MANAGE_PERMISSION, ...nextPerms]) });
    runWith(client);

    const res = await setRolePermissions({ roleId: CUSTOM_ROLE_ID, permissions: nextPerms });
    expect(res.ok).toBe(true);

    const sqls = client.calls.map((c) => normalize(c.sql));

    // (a) normalized table: delete removed rows
    const del = client.calls.find((c) => normalize(c.sql).startsWith('delete from public.role_permissions'));
    expect(del, 'must DELETE role_permissions for the removed set').toBeTruthy();

    // (b) normalized table: insert the new rows (idempotent on conflict)
    const ins = client.calls.find((c) => normalize(c.sql).startsWith('insert into public.role_permissions'));
    expect(ins, 'must INSERT role_permissions for the new set').toBeTruthy();
    expect(normalize(ins!.sql)).toContain('on conflict');

    // (c) jsonb cache: rebuild roles.permissions to the EXACT same set
    const upd = client.calls.find((c) => normalize(c.sql).startsWith('update public.roles') && normalize(c.sql).includes('permissions'));
    expect(upd, 'must UPDATE roles.permissions jsonb cache (dual-store)').toBeTruthy();

    // the jsonb payload must equal the same permission set written to role_permissions
    const jsonbParam = upd!.params.find((p) => typeof p === 'string' && (p as string).trim().startsWith('['));
    expect(jsonbParam, 'roles.permissions must be written as a json array of the same set').toBeTruthy();
    expect(new Set(JSON.parse(jsonbParam as string))).toEqual(new Set(nextPerms));

    // audit row, security-retained
    const audit = client.calls.find((c) => normalize(c.sql).includes('insert into public.audit_events'));
    expect(audit, 'must write an audit row').toBeTruthy();
    // security-retained (constant in the SQL, per the audit_events red line)
    expect(normalize(audit!.sql)).toContain("'security'");
    expect(normalize(audit!.sql)).toContain('retention_class');
    expect(normalize(audit!.sql)).toContain('before_state');
    expect(normalize(audit!.sql)).toContain('after_state');
    expect(JSON.parse(audit!.params[4] as string)).toEqual({
      code: 'reviewer',
      permissions: ['settings.org.read'],
      removed: [],
    });
    expect(JSON.parse(audit!.params[5] as string)).toEqual({
      code: 'reviewer',
      permissions: nextPerms,
      added: ['settings.org.update', 'settings.users.invite'],
    });

    // ordering: both stores written, and the audit is part of the same callback (one txn)
    const delIdx = sqls.findIndex((s) => s.startsWith('delete from public.role_permissions'));
    const updIdx = sqls.findIndex((s) => s.startsWith('update public.roles') && s.includes('permissions'));
    expect(delIdx).toBeGreaterThanOrEqual(0);
    expect(updIdx).toBeGreaterThan(delIdx);
  });
});

describe('DEFECT-8 listRolePermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current granted set for an org-scoped role', async () => {
    const client = makeClient();
    runWith(client);
    const res = await listRolePermissions(CUSTOM_ROLE_ID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(new Set(res.permissions)).toEqual(new Set(['settings.org.read']));
  });
});
