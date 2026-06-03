import { beforeEach, describe, expect, it, vi } from 'vitest';

const { grantRoleMock, revokeRoleMock } = vi.hoisted(() => ({
  grantRoleMock: vi.fn(async () => ({ success: true })),
  revokeRoleMock: vi.fn(async () => ({ success: true })),
}));

vi.mock('@monopilot/rbac', () => ({
  grantRole: grantRoleMock,
  revokeRole: revokeRoleMock,
}));

import {
  createCanonicalRoleAdapter,
  createScimGroup,
  deleteScimGroup,
  getScimGroup,
  patchScimGroupMembers,
  type RoleAdapter,
} from '../groups.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const SCIM_ACTOR_USER_ID = '55555555-5555-4555-8555-555555555555';

describe('T-091 SCIM group provisioning', () => {
  beforeEach(() => {
    grantRoleMock.mockClear();
    revokeRoleMock.mockClear();
  });

  it('creates a group row and writes an audit_events row', async () => {
    const db = createMockDb();

    const created = await createScimGroup({
      db,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      displayName: 'Line Leads',
      externalId: 'okta-group-1',
      requestId: REQUEST_ID,
      idFactory: () => GROUP_ID,
    });

    expect(created).toMatchObject({
      id: GROUP_ID,
      displayName: 'Line Leads',
      externalId: 'okta-group-1',
    });
    expect(db.groups).toHaveLength(1);
    expect(db.groups[0]).toMatchObject({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: 'okta-group-1',
    });
    expect(db.audits).toEqual([
      expect.objectContaining({
        org_id: ORG_ID,
        action: 'scim.group.created',
        resource_type: 'Group',
        resource_id: GROUP_ID,
        request_id: REQUEST_ID,
        retention_class: 'operational',
      }),
    ]);
  });

  it('adds two member refs and grants the mapped tenant role twice', async () => {
    const db = createMockDb();
    db.groups.push({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: null,
    });
    const roles = createCanonicalRoleAdapter();

    const group = await patchScimGroupMembers({
      db,
      roleAdapter: roles,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      actorUserId: SCIM_ACTOR_USER_ID,
      groupId: GROUP_ID,
      requestId: REQUEST_ID,
      operations: [
        {
          op: 'add',
          path: 'members',
          value: [
            { value: USER_A, $ref: `/scim/v2/Users/${USER_A}` },
            { value: USER_B, $ref: `/scim/v2/Users/${USER_B}` },
          ],
        },
      ],
    });

    expect(group?.members).toEqual([
      { value: USER_A, $ref: `/scim/v2/Users/${USER_A}` },
      { value: USER_B, $ref: `/scim/v2/Users/${USER_B}` },
    ]);
    expect(grantRoleMock).toHaveBeenCalledTimes(2);
    expect(grantRoleMock).toHaveBeenNthCalledWith(1, {
      actorUserId: SCIM_ACTOR_USER_ID,
      targetUserId: USER_A,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
    });
    expect(grantRoleMock).toHaveBeenNthCalledWith(2, {
      actorUserId: SCIM_ACTOR_USER_ID,
      targetUserId: USER_B,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
    });
    expect(db.audits.map((audit) => audit.action)).toContain('scim.group.member_added');
  });

  it('supports SCIM as a system principal without a reserved actor user id', async () => {
    const db = createMockDb();
    db.groups.push({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: null,
    });

    await patchScimGroupMembers({
      db,
      roleAdapter: createCanonicalRoleAdapter(),
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      actorType: 'system',
      groupId: GROUP_ID,
      requestId: REQUEST_ID,
      operations: [{ op: 'add', path: 'members', value: [{ value: USER_A }] }],
    });

    expect(grantRoleMock).toHaveBeenCalledWith({
      actorType: 'system',
      targetUserId: USER_A,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
    });
  });

  it('removes a member ref and revokes the mapped tenant role once', async () => {
    const db = createMockDb();
    db.groups.push({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: null,
    });
    db.members.push({ group_id: GROUP_ID, user_id: USER_A }, { group_id: GROUP_ID, user_id: USER_B });
    const roles = createCanonicalRoleAdapter();

    const group = await patchScimGroupMembers({
      db,
      roleAdapter: roles,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      actorUserId: SCIM_ACTOR_USER_ID,
      groupId: GROUP_ID,
      requestId: REQUEST_ID,
      operations: [{ op: 'remove', path: `members[value eq "${USER_A}"]` }],
    });

    expect(group?.members).toEqual([{ value: USER_B, $ref: `/scim/v2/Users/${USER_B}` }]);
    expect(revokeRoleMock).toHaveBeenCalledTimes(1);
    expect(revokeRoleMock).toHaveBeenCalledWith({
      actorUserId: SCIM_ACTOR_USER_ID,
      targetUserId: USER_A,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
    });
    expect(db.audits.map((audit) => audit.action)).toContain('scim.group.member_removed');
  });

  it('deletes a group and revokes every member role through the audited adapter', async () => {
    const db = createMockDb();
    db.groups.push({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: null,
    });
    db.members.push({ group_id: GROUP_ID, user_id: USER_A }, { group_id: GROUP_ID, user_id: USER_B });
    const roles = createRoleAdapter();

    const deleted = await deleteScimGroup({
      db,
      roleAdapter: roles,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      actorUserId: SCIM_ACTOR_USER_ID,
      groupId: GROUP_ID,
      requestId: REQUEST_ID,
    });

    expect(deleted).toBe(true);
    expect(db.groups).toHaveLength(0);
    expect(db.members).toHaveLength(0);
    expect(roles.revokeRole).toHaveBeenCalledTimes(2);
    expect(roles.revokeRole).toHaveBeenNthCalledWith(1, {
      actorUserId: SCIM_ACTOR_USER_ID,
      targetUserId: USER_A,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
      requestId: REQUEST_ID,
    });
    expect(roles.revokeRole).toHaveBeenNthCalledWith(2, {
      actorUserId: SCIM_ACTOR_USER_ID,
      targetUserId: USER_B,
      orgId: ORG_ID,
      roleSlug: 'production.line_lead',
      requestId: REQUEST_ID,
    });
    expect(db.audits.map((audit) => audit.action)).toContain('scim.group.deleted');
  });

  it('returns null for unknown group ids so GET /Groups/{id} can return 404', async () => {
    const db = createMockDb();

    await expect(getScimGroup({ db, orgId: ORG_ID, groupId: GROUP_ID })).resolves.toBeNull();
  });

  it('rejects PATCH when displayName is not in tenant scim_group_role_map', async () => {
    const db = createMockDb({ roleMap: { Other: 'org.viewer' } });
    db.groups.push({
      id: GROUP_ID,
      org_id: ORG_ID,
      display_name: 'Line Leads',
      external_id: null,
    });

    await expect(
      patchScimGroupMembers({
        db,
        roleAdapter: createRoleAdapter(),
        orgId: ORG_ID,
        tenantId: TENANT_ID,
        actorUserId: SCIM_ACTOR_USER_ID,
        groupId: GROUP_ID,
        requestId: REQUEST_ID,
        operations: [{ op: 'add', path: 'members', value: [{ value: USER_A }] }],
      }),
    ).rejects.toThrow('SCIM group is not mapped to a tenant role');
  });
});

function createRoleAdapter(): RoleAdapter {
  return {
    grantRole: vi.fn(async () => ({ success: true })),
    revokeRole: vi.fn(async () => ({ success: true })),
  };
}

function createMockDb(options: { roleMap?: Record<string, string> } = {}) {
  const state = {
    groups: [] as Array<{
      id: string;
      org_id: string;
      display_name: string;
      external_id: string | null;
    }>,
    members: [] as Array<{ group_id: string; user_id: string }>,
    audits: [] as Array<Record<string, unknown>>,
    roleMap: options.roleMap ?? { 'Line Leads': 'production.line_lead' },
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('from public.tenant_idp_config')) {
        return { rowCount: 1, rows: [{ scim_group_role_map: state.roleMap }] };
      }

      if (normalized.includes('insert into public.scim_groups')) {
        const [id, orgId, displayName, externalId] = params as [string, string, string, string | null];
        const row = { id, org_id: orgId, display_name: displayName, external_id: externalId };
        state.groups.push(row);
        return { rowCount: 1, rows: [row] };
      }

      if (normalized.includes('delete from public.scim_groups')) {
        const [id, orgId] = params as [string, string];
        const row = state.groups.find((group) => group.id === id && group.org_id === orgId);
        state.groups = state.groups.filter((group) => !(group.id === id && group.org_id === orgId));
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (normalized.includes('from public.scim_groups') && normalized.includes('where id =')) {
        const [id, orgId] = params as [string, string];
        const row = state.groups.find((group) => group.id === id && group.org_id === orgId);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (normalized.includes('from public.scim_groups') && normalized.includes('order by')) {
        const [orgId] = params as [string];
        const rows = state.groups.filter((group) => group.org_id === orgId);
        return { rowCount: rows.length, rows };
      }

      if (normalized.includes('insert into public.scim_group_members')) {
        const [groupId, userId] = params as [string, string];
        if (!state.members.some((member) => member.group_id === groupId && member.user_id === userId)) {
          state.members.push({ group_id: groupId, user_id: userId });
        }
        return { rowCount: 1, rows: [] };
      }

      if (normalized.includes('delete from public.scim_group_members') && normalized.includes('and user_id =')) {
        const [groupId, userId] = params as [string, string];
        const before = state.members.length;
        state.members = state.members.filter(
          (member) => !(member.group_id === groupId && member.user_id === userId),
        );
        return { rowCount: before - state.members.length, rows: [] };
      }

      if (normalized.includes('delete from public.scim_group_members')) {
        const [groupId] = params as [string];
        const deleted = state.members.filter((member) => member.group_id === groupId);
        state.members = state.members.filter((member) => member.group_id !== groupId);
        return { rowCount: deleted.length, rows: deleted };
      }

      if (normalized.includes('from public.scim_group_members')) {
        const [groupId] = params as [string];
        const rows = state.members
          .filter((member) => member.group_id === groupId)
          .map((member) => ({ user_id: member.user_id }));
        return { rowCount: rows.length, rows };
      }

      if (normalized.includes('insert into public.audit_events')) {
        const [orgId, action, resourceType, resourceId, requestId, afterState] = params;
        state.audits.push({
          org_id: orgId,
          action,
          resource_type: resourceType,
          resource_id: resourceId,
          request_id: requestId,
          retention_class: 'operational',
          after_state: afterState,
        });
        return { rowCount: 1, rows: [] };
      }

      throw new Error(`Unhandled query: ${sql}`);
    }),
  };

  return state;
}
