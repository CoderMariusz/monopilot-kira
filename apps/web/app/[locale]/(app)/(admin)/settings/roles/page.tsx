import React from 'react';
import { getTranslations } from 'next-intl/server';

import { type QueryClient } from '../../../../../../actions/authorization/preflight';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createRole, listRolePermissions, setRolePermissions } from './_actions/role-admin-actions';
import type { EditableRole } from './_components/role-editor.client';
import RolesScreen, {
  type AssignableUser,
  type RoleCode,
  type SystemRole,
} from './roles-screen.client';

export const dynamic = 'force-dynamic';

type AssignRoleInput = { userId: string; roleCode: RoleCode; reason: string };

type RolesPageProps = {
  roles?: SystemRole[];
  /** roleCode → the role's REAL granted permission strings (from role_permissions). */
  permissionsByRole?: Record<RoleCode, string[]>;
  assignableUsers?: AssignableUser[];
  canManageRoles?: boolean;
  assignRole?: (payload: AssignRoleInput) => Promise<unknown> | unknown;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
};

type PageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
};

type RoleRow = {
  code: string;
  name: string | null;
  is_system: boolean | null;
  display_order: number | string | null;
  users_assigned: number | string | null;
  permissions: string[] | null;
};

type EditableRoleRow = {
  id: string;
  code: string;
  name: string | null;
  is_system: boolean | null;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  current_role_code: string | null;
};

type PermissionCheckRow = { ok: boolean };
type RoleIdRow = { id: string };

type RolesScreenReadResult =
  | {
      state: 'ready';
      roles: SystemRole[];
      permissionsByRole: Record<RoleCode, string[]>;
      assignableUsers: AssignableUser[];
      canManageRoles: boolean;
      editableRoles: EditableRole[];
    }
  | { state: 'loading' | 'empty' | 'error' | 'permission-denied'; canManageRoles: boolean };

/**
 * Platform-internal roles excluded from the business-role matrix. Every other
 * org-scoped role (owner/admin family + every persona seed) is surfaced; the
 * filter is `r.code not like 'org.%'`, which matches exactly these three
 * `org.*.admin` codes. There is no curated allow-list anymore.
 */
const PLATFORM_INTERNAL_ROLE_CODES = new Set<string>(['org.access.admin', 'org.platform.admin', 'org.schema.admin']);

function isBusinessRoleCode(value: string | null | undefined): value is RoleCode {
  if (!value) return false;
  // Mirror the SQL filter `code not like 'org.%'` so the client/action contract
  // (a non-empty, non-platform-internal role code) matches what the list query
  // returns. Belt-and-braces: also reject the three known platform-internal codes.
  return !value.startsWith('org.') && !PLATFORM_INTERNAL_ROLE_CODES.has(value);
}

// Only the canonical roles permission in the rbac catalog gates management.
// (`settings.roles.view` / `settings.roles.manage` are NOT in
// packages/rbac/src/permissions.enum.ts — they were phantom strings.)
const ROLE_MANAGE_PERMISSIONS = ['settings.roles.assign'] as const;
const ROLE_VIEW_PERMISSIONS = [...ROLE_MANAGE_PERMISSIONS, 'owner', 'admin'] as const;

const STATE_COPY = {
  loading: { title: 'Roles & Permissions', body: 'Loading roles and permissions…' },
  empty: { title: 'Roles & Permissions', body: 'No system roles are configured yet.' },
  error: { title: 'Roles & Permissions', body: 'Roles and permissions could not be loaded.' },
  'permission-denied': { title: 'Roles & Permissions', body: 'Read-only: settings.roles.assign is required to manage role assignments.' },
  ready: { title: 'Roles & Permissions', body: '' },
} as const;

function scopeForRole(code: string): SystemRole['scope'] {
  if (code === 'owner' || code === 'admin') return 'Full system';
  if (code === 'npd_manager') return 'Workflow-scoped';
  if (code === 'auditor' || code === 'viewer') return 'Read-only';
  // Every other surfaced role (persona seeds + in-app custom roles) is
  // module-scoped — the matrix shows their real granted permissions per module.
  return 'Module-scoped';
}

function labelForRole(code: string, label?: string | null): string {
  if (label?.trim()) return label;
  return code.split(/[._]/).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function hasAnyPermission(client: QueryClient, userId: string, orgId: string, permissions: readonly string[]): Promise<boolean> {
  const { rows, rowCount } = await client.query<PermissionCheckRow>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = any($3::text[])
          or r.slug = any($3::text[])
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [userId, orgId, permissions],
  );
  return (rowCount ?? rows.length) > 0;
}

async function readRoleRows(client: QueryClient): Promise<{ roles: SystemRole[]; permissionsByRole: Record<RoleCode, string[]> }> {
  // Surface EVERY business role of the org. The only roles withheld are the
  // three platform-internal `org.*.admin` codes (matched by `code not like
  // 'org.%'`). Ordered by display_order then code so the seeded personas land in
  // their intended order. No curated allow-list — the DB is the source of truth.
  const { rows } = await client.query<RoleRow>(
    `select r.code,
            coalesce(r.name, r.code) as name,
            coalesce(r.is_system, false) as is_system,
            coalesce(r.display_order, 0) as display_order,
            count(distinct ur.user_id)::int as users_assigned,
            coalesce(array_remove(array_agg(distinct rp.permission), null), '{}'::text[]) as permissions
       from public.roles r
       left join public.user_roles ur on ur.role_id = r.id and ur.org_id = r.org_id
       left join public.role_permissions rp on rp.role_id = r.id
      where r.org_id = app.current_org_id()
        and r.code not like 'org.%'
      group by r.code, r.name, r.is_system, r.display_order
      order by coalesce(r.display_order, 0), r.code`,
  );

  const roles: SystemRole[] = [];
  const permissionsByRole: Record<RoleCode, string[]> = {};
  for (const row of rows) {
    // Belt-and-braces: the SQL already excludes `org.%`, but keep the predicate
    // so the contract is enforced in one place even if the query is edited.
    if (!isBusinessRoleCode(row.code)) continue;
    roles.push({
      code: row.code,
      name: labelForRole(row.code, row.name),
      usersAssigned: toCount(row.users_assigned),
      scope: scopeForRole(row.code),
    });
    // The role's REAL granted permission strings (normalized role_permissions),
    // de-duped + sorted for a stable View-Permissions render.
    permissionsByRole[row.code] = Array.from(new Set(row.permissions ?? [])).sort();
  }

  // Real data only — render exactly the org-scoped roles returned by RLS. No
  // seed/fixture fallback. An empty DB resolves to an honest empty-state in
  // readRolesScreenData.
  return { roles, permissionsByRole };
}

async function readEditableRoles(client: QueryClient): Promise<EditableRole[]> {
  // DEFECT-8: ALL org-scoped roles (incl. custom ones created via createRole),
  // carrying the real roles.id + is_system flag the permission editor needs.
  const { rows } = await client.query<EditableRoleRow>(
    `select r.id::text as id,
            r.code,
            coalesce(r.name, r.code) as name,
            coalesce(r.is_system, false) as is_system
       from public.roles r
      where r.org_id = app.current_org_id()
      order by r.is_system desc, r.display_order nulls last, r.code`,
  );
  return rows.map((row): EditableRole => ({
    roleId: row.id,
    code: row.code,
    name: row.name ?? row.code,
    isSystem: row.is_system === true,
  }));
}

async function readAssignableUsers(client: QueryClient): Promise<AssignableUser[]> {
  const { rows } = await client.query<UserRow>(
    `select u.id::text as id,
            coalesce(u.name, u.email, 'User') as name,
            coalesce(u.email, '') as email,
            coalesce(r.code, 'viewer') as current_role_code
       from public.users u
       left join public.user_roles ur on ur.user_id = u.id and ur.org_id = app.current_org_id()
       left join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where u.org_id = app.current_org_id()
      order by u.name nulls last, u.email nulls last, u.id
      limit 50`,
  );

  // Real data only — no demo/fixture users. An org with no members resolves to
  // an empty assignable-users list (the Assign-role listbox shows an honest
  // empty state).
  return rows.map((row): AssignableUser => ({
    id: row.id,
    name: row.name ?? row.email ?? 'User',
    email: row.email ?? '',
    // Carry the real assigned business-role code; fall back to `viewer` only for
    // unassigned members or platform-internal codes (never surfaced in the matrix).
    currentRoleCode: isBusinessRoleCode(row.current_role_code) ? row.current_role_code : 'viewer',
  }));
}

async function readRolesScreenData(): Promise<RolesScreenReadResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canViewRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_VIEW_PERMISSIONS);
      const canManageRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_MANAGE_PERMISSIONS);
      if (!canViewRoles) return { state: 'permission-denied' as const, canManageRoles: false };

      const [{ roles, permissionsByRole }, assignableUsers, editableRoles] = await Promise.all([
        readRoleRows(queryClient),
        readAssignableUsers(queryClient),
        readEditableRoles(queryClient),
      ]);

      if (roles.length === 0) return { state: 'empty' as const, canManageRoles };

      return {
        state: 'ready' as const,
        roles,
        permissionsByRole,
        assignableUsers,
        canManageRoles,
        editableRoles,
      };
    });
  } catch {
    return { state: 'error', canManageRoles: false };
  }
}

function StateShell({ state }: { state: NonNullable<RolesPageProps['state']> }) {
  const copy = STATE_COPY[state];
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6" aria-busy={state === 'loading'}>
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <div role={state === 'error' ? 'alert' : 'status'} className="rounded-xl border bg-white p-6 text-sm text-slate-700">
        {copy.body}
      </div>
    </main>
  );
}

function hasInjectedRolesProps(props: PageProps | RolesPageProps): props is RolesPageProps {
  return 'roles' in props || 'permissionsByRole' in props || 'assignableUsers' in props || 'canManageRoles' in props || 'assignRole' in props || 'state' in props;
}

function renderRolesScreen(props: RolesPageProps) {
  const state = props.state ?? 'ready';
  if (state !== 'ready') return <StateShell state={state} />;
  // Pass real injected data through verbatim — no seed/fixture fallback. If a
  // caller omits `roles`, RolesScreen renders its honest unavailable-state.
  return (
    <RolesScreen
      roles={props.roles}
      permissionsByRole={props.permissionsByRole}
      assignableUsers={props.assignableUsers}
      canManageRoles={props.canManageRoles}
      assignRole={props.assignRole}
    />
  );
}

export async function assignRoleAction(input: AssignRoleInput): Promise<{ ok: boolean; auditAction?: string; error?: string }> {
  'use server';

  // Validate the target is a non-empty, non-platform-internal (business) role
  // code; the role itself is re-resolved against the DB below, and the manage
  // gate is re-checked server-side, so the gate is never client-trusted.
  if (!isBusinessRoleCode(input.roleCode) || !input.userId || input.reason.trim().length === 0) {
    return { ok: false, error: 'invalid_role_assignment' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canAssign = await hasAnyPermission(queryClient, userId, orgId, ROLE_MANAGE_PERMISSIONS);
      if (!canAssign) return { ok: false, error: 'settings.roles.assign_required' };

      // Re-resolve the role within RLS so only an org-scoped, non-platform role
      // can be assigned (the `not like 'org.%'` guard mirrors the list filter).
      const { rows } = await queryClient.query<RoleIdRow>(
        `select id::text as id
           from public.roles
          where org_id = app.current_org_id()
            and code = $1
            and code not like 'org.%'
          limit 1`,
        [input.roleCode],
      );
      const roleId = rows[0]?.id;
      if (!roleId) return { ok: false, error: 'role_not_found' };

      await queryClient.query(
        `delete from public.user_roles
          where org_id = app.current_org_id()
            and user_id = $1::uuid`,
        [input.userId],
      );
      await queryClient.query(
        `insert into public.user_roles (user_id, org_id, role_id)
         values ($1::uuid, app.current_org_id(), $2::uuid)`,
        [input.userId, roleId],
      );

      return { ok: true, auditAction: 'settings.role_assignment.updated' };
    });
  } catch {
    return { ok: false, error: 'role_assignment_failed' };
  }
}

export default async function SettingsRolesPage(props: PageProps | RolesPageProps = {}) {
  if (hasInjectedRolesProps(props)) return renderRolesScreen(props);

  const params = props.params ? await props.params : { locale: 'en' };
  await getTranslations({ locale: params.locale, namespace: 'settings.users_screen' });

  const result = await readRolesScreenData();
  if (result.state !== 'ready') return <StateShell state={result.state} />;

  // DEFECT-8: wire the role-management surface (create + per-role permission
  // editor) only for operators who can manage roles. The server actions re-check
  // the gate server-side — this is presentation gating only.
  const roleAdmin = result.canManageRoles
    ? { editableRoles: result.editableRoles, createRole, listRolePermissions, setRolePermissions }
    : undefined;

  return <RolesScreen {...result} assignRole={assignRoleAction} roleAdmin={roleAdmin} />;
}
