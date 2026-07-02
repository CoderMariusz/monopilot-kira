'use server';

import { randomUUID } from 'node:crypto';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { ALL_PERMISSIONS } from '../../../../../../../../../packages/rbac/src/permissions.enum';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

/**
 * DEFECT-8 — Settings Roles Editor server actions.
 *
 * Makes custom roles possible: createRole / listRolePermissions /
 * setRolePermissions, org-scoped under RLS via withOrgContext (one txn per
 * action — COMMIT on success, ROLLBACK on throw).
 *
 * CRITICAL — dual-store consistency: `hasPermission`
 * (apps/web/lib/production/shared.ts:131 and the byte-aligned BOM/page helpers)
 * resolves a grant from EITHER the normalized `role_permissions` rows OR the
 * legacy `roles.permissions` jsonb cache. So EVERY grant write here updates BOTH
 * stores to the exact same set inside ONE transaction, or the jsonb cache goes
 * stale and a removed permission would still resolve as granted.
 *
 * System roles (the owner/admin family — the SYSTEM_ROLE_CODES the user-creation
 * fix forbids as a self-serve default, mirrored here) are LOCKED: they cannot be
 * created, and their permission grants cannot be edited (honest
 * `system_role_locked`). This also covers DB-seeded `roles.is_system = true`.
 *
 * Permission gate: `settings.roles.assign` — the only roles permission in the
 * canonical catalog and the manage-check the sibling Roles screen + assignRole
 * action already use. Read with the same dual-store-aware query the rest of the
 * app uses so a grant in EITHER store satisfies the gate.
 */

// Mirror of actions/users/create-user-with-password.ts SYSTEM_ROLE_CODES_FORBIDDEN_AS_DEFAULT.
const SYSTEM_ROLE_CODES = new Set<string>([
  'owner',
  'admin',
  'org_admin',
  'org.access.admin',
  'org.platform.admin',
  'org.schema.admin',
]);

const SUPER_ROLE_CODES = ['owner', 'admin', 'org_admin'] as const;
const MANAGE_PERMISSION = 'settings.roles.assign';
const ROLES_SETTINGS_PATH = '/settings/roles';
const CATALOG: ReadonlySet<string> = new Set(ALL_PERMISSIONS as readonly string[]);

// slug: lower-snake/dot segments, must start with a letter, 2..64 chars. Mirrors
// the canonical role-code shape (e.g. `npd_manager`, `org.access.admin`) without
// allowing whitespace, uppercase, or leading separators.
const ROLE_CODE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type CreateRoleInput = { code: string; name: string; description?: string };
export type CreateRoleResult =
  | { ok: true; data: { roleId: string; code: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'system_role_locked' | 'code_taken' | 'persistence_failed' };

export type ListRolePermissionsResult =
  | { ok: true; permissions: string[] }
  | { ok: false; error: 'forbidden' | 'role_not_found' | 'persistence_failed' };

export type SetRolePermissionsInput = { roleId: string; permissions: string[] };
export type SetRolePermissionsResult =
  | { ok: true; data: { roleId: string; count: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'system_role_locked' | 'invalid_permission' | 'role_not_found' | 'persistence_failed' };

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function hasManagePermission({ client, userId, orgId }: OrgActionContext): Promise<boolean> {
  return hasPermission({ client, userId, orgId }, MANAGE_PERMISSION);
}

async function hasSuperRole({ client, userId, orgId }: OrgActionContext): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (r.code = any($3::text[]) or r.slug = any($3::text[]))
      limit 1`,
    [userId, orgId, SUPER_ROLE_CODES],
  );
  return rows[0]?.ok === true;
}

async function callerHasRole({ client, userId, orgId }: OrgActionContext, roleId: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles
      where user_id = $1::uuid
        and org_id = $2::uuid
        and role_id = $3::uuid
      limit 1`,
    [userId, orgId, roleId],
  );
  return rows[0]?.ok === true;
}

async function readCallerPermissions({ client, userId, orgId }: OrgActionContext): Promise<Set<string>> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct permission
       from (
         select rp.permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
       ) grants
      where permission is not null`,
    [userId, orgId],
  );
  return new Set(rows.map((row) => row.permission));
}

type RoleRow = { id: string; code: string; name: string; is_system: boolean };

async function readRoleById(client: QueryClient, roleId: string): Promise<RoleRow | null> {
  const { rows } = await client.query<RoleRow>(
    `select id::text as id, code, coalesce(name, code) as name, coalesce(is_system, false) as is_system
       from public.roles
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [roleId],
  );
  return rows[0] ?? null;
}

async function readRolePermissions(client: QueryClient, roleId: string): Promise<string[]> {
  const { rows } = await client.query<{ permission: string }>(
    `select distinct permission
       from (
         select rp.permission
           from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
         union
         select jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) as permission
           from public.roles r
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
       ) grants
      where permission is not null
      order by permission`,
    [roleId],
  );
  return rows.map((row) => row.permission);
}

export async function createRole(input: CreateRoleInput): Promise<CreateRoleResult> {
  // Validate the code exactly as entered — the slug shape forbids uppercase and
  // whitespace, so we do NOT silently lowercase a malformed code into a valid one.
  const code = normalizeString(input?.code);
  const name = normalizeString(input?.name);
  if (!code || !name || !ROLE_CODE_RE.test(code) || code.length > 64) {
    return { ok: false, error: 'invalid_input' };
  }
  if (SYSTEM_ROLE_CODES.has(code)) {
    return { ok: false, error: 'system_role_locked' };
  }

  return withOrgContext<CreateRoleResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      if (!(await hasManagePermission({ client, userId, orgId }))) {
        return { ok: false, error: 'forbidden' };
      }

      const existing = await client.query<{ id: string }>(
        `select id::text as id from public.roles where org_id = app.current_org_id() and code = $1 limit 1`,
        [code],
      );
      if (existing.rows.length > 0) return { ok: false, error: 'code_taken' };

      // New custom role: empty permission set in BOTH stores from the start.
      // slug mirrors code (017 left slug NOT NULL; supply it explicitly).
      const inserted = await client.query<{ id: string }>(
        `insert into public.roles (org_id, slug, code, name, permissions, is_system, display_order)
         values (app.current_org_id(), $1, $1, $2, '[]'::jsonb, false, 100)
         on conflict (org_id, code) do nothing
         returning id::text as id`,
        [code, name],
      );
      const roleId = inserted.rows[0]?.id;
      if (!roleId) return { ok: false, error: 'code_taken' };

      await writeAudit(client, { orgId, userId, action: 'settings.role.created', roleId, after: { code, name } });
      revalidateLocalized(ROLES_SETTINGS_PATH);
      return { ok: true, data: { roleId, code } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

export async function listRolePermissions(roleId: string): Promise<ListRolePermissionsResult> {
  const id = normalizeString(roleId);
  if (!id) return { ok: false, error: 'role_not_found' };

  return withOrgContext<ListRolePermissionsResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      if (!(await hasManagePermission({ client, userId, orgId }))) {
        return { ok: false, error: 'forbidden' };
      }
      const role = await readRoleById(client, id);
      if (!role) return { ok: false, error: 'role_not_found' };

      const { rows } = await client.query<{ permission: string }>(
        `select rp.permission
           from public.role_permissions rp
           join public.roles r on r.id = rp.role_id
          where r.org_id = app.current_org_id()
            and r.id = $1::uuid
          order by rp.permission`,
        [id],
      );
      return { ok: true, permissions: rows.map((row) => row.permission) };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

export async function setRolePermissions(input: SetRolePermissionsInput): Promise<SetRolePermissionsResult> {
  const roleId = normalizeString(input?.roleId);
  if (!roleId || !Array.isArray(input?.permissions)) return { ok: false, error: 'invalid_input' };

  // De-dup + validate EVERY string against the canonical rbac catalog before any
  // write. A single unknown string fails the whole edit (fail-closed).
  const requested = Array.from(new Set(input.permissions.map((p) => (typeof p === 'string' ? p.trim() : ''))));
  for (const permission of requested) {
    if (!permission || !CATALOG.has(permission)) {
      return { ok: false, error: 'invalid_permission' };
    }
  }

  return withOrgContext<SetRolePermissionsResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    try {
      if (!(await hasManagePermission({ client, userId, orgId }))) {
        return { ok: false, error: 'forbidden' };
      }

      const role = await readRoleById(client, roleId);
      if (!role) return { ok: false, error: 'role_not_found' };
      if (role.is_system || SYSTEM_ROLE_CODES.has(role.code)) {
        return { ok: false, error: 'system_role_locked' };
      }
      const isSuper = await hasSuperRole({ client, userId, orgId });
      if (!isSuper) {
        if (await callerHasRole({ client, userId, orgId }, roleId)) {
          return { ok: false, error: 'forbidden' };
        }
        const callerPermissions = await readCallerPermissions({ client, userId, orgId });
        if (requested.some((permission) => !callerPermissions.has(permission))) {
          return { ok: false, error: 'forbidden' };
        }
      }

      const beforePermissions = await readRolePermissions(client, roleId);

      // ── DUAL-STORE WRITE (single txn) ──────────────────────────────────────
      // (1) normalized role_permissions: delete the rows no longer in the set …
      await client.query(
        `delete from public.role_permissions
          where role_id = $1::uuid
            and ($2::text[] = '{}'::text[] or not (permission = any($2::text[])))`,
        [roleId, requested],
      );
      // … (2) insert the new rows (idempotent — ON CONFLICT DO NOTHING).
      if (requested.length > 0) {
        await client.query(
          `insert into public.role_permissions (role_id, permission)
           select $1::uuid, unnest($2::text[])
           on conflict (role_id, permission) do nothing`,
          [roleId, requested],
        );
      }
      // (3) rebuild the roles.permissions jsonb cache to the EXACT same set so
      // the legacy cache hasPermission also reads can never go stale.
      await client.query(
        `update public.roles
            set permissions = $2::jsonb
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [roleId, JSON.stringify(requested)],
      );

      await writeAudit(client, {
        orgId,
        userId,
        action: 'settings.role_permissions.updated',
        roleId,
        before: {
          code: role.code,
          permissions: beforePermissions,
          removed: beforePermissions.filter((permission) => !requested.includes(permission)),
        },
        after: {
          code: role.code,
          permissions: requested,
          added: requested.filter((permission) => !beforePermissions.includes(permission)),
        },
      });

      revalidateLocalized(ROLES_SETTINGS_PATH);
      return { ok: true, data: { roleId, count: requested.length } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    userId: string;
    action: string;
    roleId: string;
    before?: Record<string, unknown> | null;
    after: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, request_id, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'role', $4, $5::jsonb, $6::jsonb, $7::uuid, 'security')`,
    [
      params.orgId,
      params.userId,
      params.action,
      params.roleId,
      params.before ? JSON.stringify(params.before) : null,
      JSON.stringify(params.after),
      randomUUID(),
    ],
  );
}
