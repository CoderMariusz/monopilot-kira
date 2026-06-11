import React from 'react';
import { getTranslations } from 'next-intl/server';

import {
  NPD_POST_RELEASE_EDIT_POLICY,
  TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
  readAuthorizationPolicy,
  type AuthorizationPolicyRow,
  type QueryClient,
} from '../../../../../../actions/authorization/preflight';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { createRole, listRolePermissions, setRolePermissions } from './_actions/role-admin-actions';
import type { EditableRole } from './_components/role-editor.client';
import RolesScreen, {
  type AssignableUser,
  type PermissionStatus,
  type RoleCode,
  type RolePermission,
  type SystemRole,
} from './roles-screen.client';

export const dynamic = 'force-dynamic';

type AssignRoleInput = { userId: string; roleCode: RoleCode; reason: string };

type RolesPageProps = {
  roles?: SystemRole[];
  permissionsByRole?: Record<RoleCode, RolePermission[]>;
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
      permissionsByRole: Record<RoleCode, RolePermission[]>;
      assignableUsers: AssignableUser[];
      canManageRoles: boolean;
      editableRoles: EditableRole[];
    }
  | { state: 'loading' | 'empty' | 'error' | 'permission-denied'; canManageRoles: boolean };

const ROLE_CODES = [
  'owner',
  'admin',
  'npd_manager',
  'module_admin',
  'planner',
  'production_lead',
  'quality_lead',
  'warehouse_operator',
  'auditor',
  'viewer',
] as const satisfies readonly RoleCode[];

const ROLE_MANAGE_PERMISSIONS = ['settings.roles.assign', 'settings.roles.manage'] as const;
const ROLE_VIEW_PERMISSIONS = ['settings.roles.view', ...ROLE_MANAGE_PERMISSIONS, 'owner', 'admin'] as const;

const STATE_COPY = {
  loading: { title: 'Roles & Permissions', body: 'Loading roles and permissions…' },
  empty: { title: 'Roles & Permissions', body: 'No system roles are configured yet.' },
  error: { title: 'Roles & Permissions', body: 'Roles and permissions could not be loaded.' },
  'permission-denied': { title: 'Roles & Permissions', body: 'Read-only: settings.roles.assign is required to manage role assignments.' },
  ready: { title: 'Roles & Permissions', body: '' },
} as const;

function isRoleCode(value: string | null | undefined): value is RoleCode {
  return ROLE_CODES.includes(value as RoleCode);
}

function scopeForRole(code: RoleCode): SystemRole['scope'] {
  if (code === 'owner' || code === 'admin') return 'Full system';
  if (code === 'npd_manager') return 'Workflow-scoped';
  if (code === 'auditor' || code === 'viewer') return 'Read-only';
  return 'Module-scoped';
}

function labelForRole(code: RoleCode, label?: string | null): string {
  if (label?.trim()) return label;
  return code.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function toCount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function policyEnabled(policy: AuthorizationPolicyRow | null): boolean {
  return policy?.is_enabled === true || policy?.enabled === true;
}

function policyHasPermission(policy: AuthorizationPolicyRow | null, permission: string): boolean {
  return Boolean(policy?.request_permissions?.includes(permission) || policy?.authorize_permissions?.includes(permission));
}

function workflowStatus(policy: AuthorizationPolicyRow | null, permission: string): PermissionStatus {
  if (!policy || !policyEnabled(policy)) return 'disabled_by_org_policy';
  if (!policyHasPermission(policy, permission)) return 'misconfigured_policy';
  if (permission === 'technical.product_spec.approve' && (!policy.approver_role_codes?.length || toCount(policy.min_approvers) < 1)) {
    return 'misconfigured_policy';
  }
  if (permission === 'npd.released_product_edit.authorize' && !policy.approver_role_codes?.length) {
    return 'misconfigured_policy';
  }
  return 'enabled';
}

function workflowSummary(status: PermissionStatus, enabledCopy: string): string {
  if (status === 'disabled_by_org_policy') return 'Disabled by org authorization policy.';
  if (status === 'misconfigured_policy') return 'Misconfigured org authorization policy blocks this workflow.';
  return enabledCopy;
}

function buildPermissionsByRole(
  roles: SystemRole[],
  seededPermissions: Map<RoleCode, Set<string>>,
  policies: { npd: AuthorizationPolicyRow | null; technical: AuthorizationPolicyRow | null },
): Record<RoleCode, RolePermission[]> {
  return roles.reduce<Record<RoleCode, RolePermission[]>>((acc, role) => {
    const direct = seededPermissions.get(role.code) ?? new Set<string>();
    const hasDirect = (permission: string) => direct.has(permission) || role.code === 'owner';
    const npdRequestStatus = workflowStatus(policies.npd, 'npd.released_product_edit.request');
    const npdAuthorizeStatus = workflowStatus(policies.npd, 'npd.released_product_edit.authorize');
    const technicalStatus = workflowStatus(policies.technical, 'technical.product_spec.approve');

    acc[role.code] = [
      {
        group: 'Settings',
        name: 'settings.roles.view',
        directlyGrantedBySeed: hasDirect('settings.roles.view'),
        status: 'enabled',
        policySummary: 'System role seed controls Settings role visibility.',
      },
      {
        group: 'Settings',
        name: 'settings.roles.assign',
        directlyGrantedBySeed: hasDirect('settings.roles.assign') || hasDirect('settings.roles.manage'),
        status: 'enabled',
        policySummary: 'Role assignment is gated by settings.roles.assign or settings.roles.manage.',
      },
      {
        group: 'NPD workflow authorization',
        name: 'npd.released_product_edit.request',
        directlyGrantedBySeed: hasDirect('npd.released_product_edit.request'),
        status: npdRequestStatus,
        policySummary: workflowSummary(npdRequestStatus, 'Request workflow remains enabled by org policy.'),
      },
      {
        group: 'NPD workflow authorization',
        name: 'npd.released_product_edit.authorize',
        directlyGrantedBySeed: hasDirect('npd.released_product_edit.authorize'),
        status: npdAuthorizeStatus,
        policySummary: workflowSummary(npdAuthorizeStatus, 'Authorization workflow remains enabled by org policy.'),
      },
      {
        group: 'Technical approval',
        name: 'technical.product_spec.approve',
        directlyGrantedBySeed: hasDirect('technical.product_spec.approve'),
        status: technicalStatus,
        policySummary: workflowSummary(technicalStatus, 'Technical product-spec approval remains enabled by org policy.'),
      },
    ];
    return acc;
  }, {} as Record<RoleCode, RolePermission[]>);
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

async function readRoleRows(client: QueryClient): Promise<{ roles: SystemRole[]; seededPermissions: Map<RoleCode, Set<string>> }> {
  const { rows } = await client.query<RoleRow>(
    `select r.code,
            coalesce(r.name, r.code) as name,
            count(distinct ur.user_id)::int as users_assigned,
            coalesce(array_remove(array_agg(distinct rp.permission), null), '{}'::text[]) as permissions
       from public.roles r
       left join public.user_roles ur on ur.role_id = r.id and ur.org_id = r.org_id
       left join public.role_permissions rp on rp.role_id = r.id
      where r.org_id = app.current_org_id()
        and r.code = any($1::text[])
      group by r.code, r.name
      order by array_position($1::text[], r.code)`,
    [ROLE_CODES],
  );

  const seededPermissions = new Map<RoleCode, Set<string>>();
  const byCode = new Map<RoleCode, SystemRole>();
  for (const row of rows) {
    if (!isRoleCode(row.code)) continue;
    byCode.set(row.code, {
      code: row.code,
      name: labelForRole(row.code, row.name),
      usersAssigned: toCount(row.users_assigned),
      scope: scopeForRole(row.code),
    });
    seededPermissions.set(row.code, new Set(row.permissions ?? []));
  }

  // Real data only — render exactly the org-scoped roles returned by RLS, in
  // canonical order. No seed/fixture fallback. An empty DB resolves to an
  // honest empty-state in readRolesScreenData.
  const roles = ROLE_CODES.map((code) => byCode.get(code)).filter((role): role is SystemRole => role !== undefined);
  return { roles, seededPermissions };
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
    currentRoleCode: isRoleCode(row.current_role_code) ? row.current_role_code : 'viewer',
  }));
}

async function readRolesScreenData(): Promise<RolesScreenReadResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canViewRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_VIEW_PERMISSIONS);
      const canManageRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_MANAGE_PERMISSIONS);
      if (!canViewRoles) return { state: 'permission-denied' as const, canManageRoles: false };

      const [{ roles, seededPermissions }, assignableUsers, editableRoles, npd, technical] = await Promise.all([
        readRoleRows(queryClient),
        readAssignableUsers(queryClient),
        readEditableRoles(queryClient),
        readAuthorizationPolicy(queryClient, NPD_POST_RELEASE_EDIT_POLICY),
        readAuthorizationPolicy(queryClient, TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY),
      ]);

      if (roles.length === 0) return { state: 'empty' as const, canManageRoles };

      return {
        state: 'ready' as const,
        roles,
        permissionsByRole: buildPermissionsByRole(roles, seededPermissions, { npd, technical }),
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

  if (!isRoleCode(input.roleCode) || !input.userId || input.reason.trim().length === 0) {
    return { ok: false, error: 'invalid_role_assignment' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canAssign = await hasAnyPermission(queryClient, userId, orgId, ROLE_MANAGE_PERMISSIONS);
      if (!canAssign) return { ok: false, error: 'settings.roles.assign_required' };

      const { rows } = await queryClient.query<RoleIdRow>(
        `select id::text as id
           from public.roles
          where org_id = app.current_org_id()
            and code = $1
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
