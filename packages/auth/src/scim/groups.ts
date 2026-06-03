import { randomUUID } from 'node:crypto';
import { grantRole, revokeRole } from '@monopilot/rbac';

const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rowCount: number | null; rows: T[] }>;
}

export interface RoleAdapter {
  grantRole(input: RoleChangeInput): Promise<{ success: boolean; error?: string }>;
  revokeRole(input: RoleChangeInput): Promise<{ success: boolean; error?: string }>;
}

export interface RoleChangeInput {
  actorUserId?: string;
  actorType?: 'user' | 'system';
  targetUserId: string;
  orgId: string;
  roleSlug: string;
  requestId: string;
}

export interface PatchOperation {
  op?: string;
  path?: string;
  value?: unknown;
}

export interface ScimGroupResource {
  schemas: [typeof GROUP_SCHEMA];
  id: string;
  displayName: string;
  externalId?: string;
  members: Array<{ value: string; $ref: string }>;
  meta: { resourceType: 'Group' };
}

interface GroupRow {
  id: string;
  org_id: string;
  display_name: string;
  external_id: string | null;
}

interface MemberRow {
  user_id: string;
}

interface GroupInput {
  db: Queryable;
  orgId: string;
  tenantId: string;
  requestId: string;
}

export class UnmappedScimGroupError extends Error {
  constructor(displayName: string) {
    super(`SCIM group is not mapped to a tenant role: ${displayName}`);
    this.name = 'UnmappedScimGroupError';
  }
}

export async function listScimGroups(input: { db: Queryable; orgId: string }): Promise<ScimGroupResource[]> {
  const { rows } = await input.db.query<GroupRow>(
    `select id, org_id, display_name, external_id
       from public.scim_groups
      where org_id = $1
      order by display_name asc`,
    [input.orgId],
  );

  const resources: ScimGroupResource[] = [];
  for (const row of rows) {
    resources.push(await toScimGroup(input.db, row));
  }
  return resources;
}

export async function getScimGroup(input: {
  db: Queryable;
  orgId: string;
  groupId: string;
}): Promise<ScimGroupResource | null> {
  const row = await findGroup(input.db, input.orgId, input.groupId);
  if (!row) return null;
  return toScimGroup(input.db, row);
}

export async function createScimGroup(
  input: GroupInput & {
    displayName: string;
    externalId?: string | null;
    idFactory?: () => string;
  },
): Promise<ScimGroupResource> {
  const id = input.idFactory?.() ?? randomUUID();
  const { rows } = await input.db.query<GroupRow>(
    `insert into public.scim_groups (id, org_id, display_name, external_id)
     values ($1, $2, $3, $4)
     returning id, org_id, display_name, external_id`,
    [id, input.orgId, input.displayName, input.externalId ?? null],
  );

  const row = rows[0];
  await insertAudit(input.db, {
    orgId: input.orgId,
    action: 'scim.group.created',
    resourceType: 'Group',
    resourceId: row.id,
    requestId: input.requestId,
    afterState: { displayName: row.display_name, externalId: row.external_id },
  });

  return toScimGroup(input.db, row);
}

export async function patchScimGroupMembers(
  input: GroupInput & {
    actorUserId?: string;
    actorType?: 'user' | 'system';
    groupId: string;
    operations: PatchOperation[];
    roleAdapter: RoleAdapter;
  },
): Promise<ScimGroupResource | null> {
  const group = await findGroup(input.db, input.orgId, input.groupId);
  if (!group) return null;

  const roleSlug = await mappedRoleForGroup(input.db, input.tenantId, group.display_name);
  const changes = collectMemberChanges(input.operations);

  for (const userId of changes.add) {
    await input.db.query(
      `insert into public.scim_group_members (group_id, user_id)
       values ($1, $2)
       on conflict do nothing`,
      [input.groupId, userId],
    );
    const result = await input.roleAdapter.grantRole({
      ...roleActorFields(input),
      targetUserId: userId,
      orgId: input.orgId,
      roleSlug,
      requestId: input.requestId,
    });
    assertRoleResult(result, 'grant', userId);
    await insertAudit(input.db, {
      orgId: input.orgId,
      action: 'scim.group.member_added',
      resourceType: 'Group',
      resourceId: input.groupId,
      requestId: input.requestId,
      afterState: { userId, roleSlug },
    });
  }

  for (const userId of changes.remove) {
    await input.db.query(
      `delete from public.scim_group_members
        where group_id = $1
          and user_id = $2`,
      [input.groupId, userId],
    );
    const result = await input.roleAdapter.revokeRole({
      ...roleActorFields(input),
      targetUserId: userId,
      orgId: input.orgId,
      roleSlug,
      requestId: input.requestId,
    });
    assertRoleResult(result, 'revoke', userId);
    await insertAudit(input.db, {
      orgId: input.orgId,
      action: 'scim.group.member_removed',
      resourceType: 'Group',
      resourceId: input.groupId,
      requestId: input.requestId,
      afterState: { userId, roleSlug },
    });
  }

  return toScimGroup(input.db, group);
}

export async function deleteScimGroup(
  input: GroupInput & {
    actorUserId?: string;
    actorType?: 'user' | 'system';
    groupId: string;
    roleAdapter: RoleAdapter;
  },
): Promise<boolean> {
  const group = await findGroup(input.db, input.orgId, input.groupId);
  if (!group) return false;

  const roleSlug = await mappedRoleForGroup(input.db, input.tenantId, group.display_name);
  const members = await listMemberIds(input.db, input.groupId);

  for (const userId of members) {
    const result = await input.roleAdapter.revokeRole({
      ...roleActorFields(input),
      targetUserId: userId,
      orgId: input.orgId,
      roleSlug,
      requestId: input.requestId,
    });
    assertRoleResult(result, 'revoke', userId);
  }

  await input.db.query(
    `delete from public.scim_group_members
      where group_id = $1
      returning user_id`,
    [input.groupId],
  );

  const { rowCount } = await input.db.query<GroupRow>(
    `delete from public.scim_groups
      where id = $1
        and org_id = $2
      returning id, org_id, display_name, external_id`,
    [input.groupId, input.orgId],
  );

  if (rowCount !== 1) return false;

  await insertAudit(input.db, {
    orgId: input.orgId,
    action: 'scim.group.deleted',
    resourceType: 'Group',
    resourceId: input.groupId,
    requestId: input.requestId,
    afterState: { displayName: group.display_name, revokedMembers: members.length, roleSlug },
  });

  return true;
}

export function createCanonicalRoleAdapter(): RoleAdapter {
  return {
    async grantRole(input) {
      return grantRole({
        ...roleActorFields(input),
        targetUserId: input.targetUserId,
        orgId: input.orgId,
        roleSlug: input.roleSlug,
      });
    },
    async revokeRole(input) {
      return revokeRole({
        ...roleActorFields(input),
        targetUserId: input.targetUserId,
        orgId: input.orgId,
        roleSlug: input.roleSlug,
      });
    },
  };
}

function roleActorFields(input: {
  actorUserId?: string;
  actorType?: 'user' | 'system';
}): Pick<RoleChangeInput, 'actorUserId' | 'actorType'> {
  return {
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.actorType ? { actorType: input.actorType } : {}),
  };
}

async function findGroup(db: Queryable, orgId: string, groupId: string): Promise<GroupRow | null> {
  const { rows } = await db.query<GroupRow>(
    `select id, org_id, display_name, external_id
       from public.scim_groups
      where id = $1
        and org_id = $2`,
    [groupId, orgId],
  );
  return rows[0] ?? null;
}

async function toScimGroup(db: Queryable, row: GroupRow): Promise<ScimGroupResource> {
  const members = await listMemberIds(db, row.id);
  return {
    schemas: [GROUP_SCHEMA],
    id: row.id,
    displayName: row.display_name,
    externalId: row.external_id ?? undefined,
    members: members.map((userId) => ({ value: userId, $ref: `/scim/v2/Users/${userId}` })),
    meta: { resourceType: 'Group' },
  };
}

async function listMemberIds(db: Queryable, groupId: string): Promise<string[]> {
  const { rows } = await db.query<MemberRow>(
    `select user_id
       from public.scim_group_members
      where group_id = $1
      order by user_id asc`,
    [groupId],
  );
  return rows.map((row) => row.user_id);
}

async function mappedRoleForGroup(db: Queryable, tenantId: string, displayName: string): Promise<string> {
  const { rows } = await db.query<{ scim_group_role_map: unknown }>(
    `select scim_group_role_map
       from public.tenant_idp_config
      where tenant_id = $1`,
    [tenantId],
  );
  const map = rows[0]?.scim_group_role_map;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new UnmappedScimGroupError(displayName);
  }

  const roleSlug = (map as Record<string, unknown>)[displayName];
  if (typeof roleSlug !== 'string' || roleSlug.trim() === '') {
    throw new UnmappedScimGroupError(displayName);
  }
  return roleSlug;
}

function collectMemberChanges(operations: PatchOperation[]): { add: string[]; remove: string[] } {
  const add = new Set<string>();
  const remove = new Set<string>();

  for (const operation of operations) {
    if (!operation || typeof operation.op !== 'string') continue;
    const op = operation.op.toLowerCase();
    if (op === 'add' && isMembersPath(operation.path)) {
      for (const userId of collectMemberValues(operation.value)) {
        add.add(userId);
        remove.delete(userId);
      }
    }
    if (op === 'remove') {
      const pathUserId = memberIdFromRemovePath(operation.path);
      const userIds = pathUserId ? [pathUserId] : collectMemberValues(operation.value);
      for (const userId of userIds) {
        remove.add(userId);
        add.delete(userId);
      }
    }
  }

  return { add: [...add], remove: [...remove] };
}

function isMembersPath(path: string | undefined): boolean {
  if (!path) return false;
  return path.toLowerCase().startsWith('members');
}

function collectMemberValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectMemberValues);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.value === 'string') return [record.value];
    if (Array.isArray(record.members)) return record.members.flatMap(collectMemberValues);
  }
  return [];
}

function memberIdFromRemovePath(path: string | undefined): string | null {
  if (!path) return null;
  const match = path.match(/members\s*\[\s*value\s+eq\s+"([^"]+)"\s*\]/i);
  return match?.[1] ?? null;
}

function assertRoleResult(
  result: { success: boolean; error?: string },
  action: 'grant' | 'revoke',
  userId: string,
): void {
  if (!result.success) {
    throw new Error(`SCIM group role ${action} failed for ${userId}: ${result.error ?? 'unknown_error'}`);
  }
}

async function insertAudit(
  db: Queryable,
  input: {
    orgId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    requestId: string;
    afterState: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `insert into public.audit_events (
       org_id, actor_user_id, actor_type, action, resource_type, resource_id,
       request_id, retention_class, after_state
     ) values ($1, null, 'scim', $2, $3, $4, $5::uuid, 'operational', $6::jsonb)`,
    [
      input.orgId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.requestId,
      JSON.stringify(input.afterState),
    ],
  );
}
