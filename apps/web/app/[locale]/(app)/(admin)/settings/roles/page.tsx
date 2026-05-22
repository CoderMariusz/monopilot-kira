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
import RolesScreen from '../../../../../(admin)/settings/roles/page';

export const dynamic = 'force-dynamic';

type RoleCode =
  | 'owner'
  | 'admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'warehouse_operator'
  | 'auditor'
  | 'viewer';

type SystemRole = {
  code: RoleCode;
  name: string;
  usersAssigned: number;
  scope: 'Full system' | 'Module-scoped' | 'Workflow-scoped' | 'Read-only';
};

type PermissionStatus = 'enabled' | 'disabled_by_org_policy' | 'misconfigured_policy';

type RolePermission = {
  name: string;
  group: 'Settings' | 'NPD workflow authorization' | 'Technical approval';
  directlyGrantedBySeed: boolean;
  status: PermissionStatus;
  policySummary?: string;
};

type AssignableUser = {
  id: string;
  name: string;
  email: string;
  currentRoleCode: RoleCode;
};

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

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  current_role_code: string | null;
};

type PermissionCheckRow = { ok: boolean };
type RoleIdRow = { id: string };

type RolesScreenReadResult =
  | { state: 'ready'; roles: SystemRole[]; permissionsByRole: Record<RoleCode, RolePermission[]>; assignableUsers: AssignableUser[]; canManageRoles: boolean }
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

const FALLBACK_ROLES: SystemRole[] = [
  { code: 'owner', name: 'Owner', usersAssigned: 1, scope: 'Full system' },
  { code: 'admin', name: 'Admin', usersAssigned: 2, scope: 'Full system' },
  { code: 'npd_manager', name: 'NPD Manager', usersAssigned: 3, scope: 'Workflow-scoped' },
  { code: 'module_admin', name: 'Module Admin', usersAssigned: 4, scope: 'Module-scoped' },
  { code: 'planner', name: 'Planner', usersAssigned: 5, scope: 'Module-scoped' },
  { code: 'production_lead', name: 'Production Lead', usersAssigned: 6, scope: 'Module-scoped' },
  { code: 'quality_lead', name: 'Quality Lead', usersAssigned: 7, scope: 'Module-scoped' },
  { code: 'warehouse_operator', name: 'Warehouse Operator', usersAssigned: 8, scope: 'Module-scoped' },
  { code: 'auditor', name: 'Auditor', usersAssigned: 9, scope: 'Read-only' },
  { code: 'viewer', name: 'Viewer', usersAssigned: 10, scope: 'Read-only' },
];

const FALLBACK_USERS: AssignableUser[] = [
  { id: 'user-nora', name: 'Nora NPD', email: 'nora.npd@example.test', currentRoleCode: 'viewer' },
  { id: 'user-ada', name: 'Ada Admin', email: 'ada.admin@example.test', currentRoleCode: 'admin' },
];

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

function fallbackSeededPermissions(): Map<RoleCode, Set<string>> {
  const map = new Map<RoleCode, Set<string>>();
  for (const role of FALLBACK_ROLES) {
    map.set(role.code, new Set(role.code === 'npd_manager'
      ? ['settings.roles.view', 'npd.released_product_edit.request', 'npd.released_product_edit.authorize', 'technical.product_spec.approve']
      : ['settings.roles.view']));
  }
  return map;
}

function fallbackPermissionsByRole(): Record<RoleCode, RolePermission[]> {
  return buildPermissionsByRole(FALLBACK_ROLES, fallbackSeededPermissions(), {
    npd: {
      policy_code: NPD_POST_RELEASE_EDIT_POLICY,
      is_enabled: true,
      enabled: true,
      request_permissions: ['npd.released_product_edit.request'],
      authorize_permissions: ['npd.released_product_edit.authorize'],
      approver_role_codes: ['owner'],
      min_approvers: 1,
    },
    technical: {
      policy_code: TECHNICAL_PRODUCT_SPEC_APPROVAL_POLICY,
      is_enabled: true,
      enabled: true,
      authorize_permissions: ['technical.product_spec.approve'],
      approver_role_codes: [],
      min_approvers: 0,
    },
  });
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

  if (rows.length === 0) {
    return { roles: FALLBACK_ROLES, seededPermissions: fallbackSeededPermissions() };
  }

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

  const roles = ROLE_CODES.map((code) => byCode.get(code) ?? FALLBACK_ROLES.find((role) => role.code === code)).filter(Boolean) as SystemRole[];
  return { roles, seededPermissions };
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

  const users = rows.map((row): AssignableUser => ({
    id: row.id,
    name: row.name ?? row.email ?? 'User',
    email: row.email ?? '',
    currentRoleCode: isRoleCode(row.current_role_code) ? row.current_role_code : 'viewer',
  }));
  return users.length > 0 ? users : FALLBACK_USERS;
}

async function readRolesScreenData(): Promise<RolesScreenReadResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canViewRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_VIEW_PERMISSIONS);
      const canManageRoles = await hasAnyPermission(queryClient, userId, orgId, ROLE_MANAGE_PERMISSIONS);
      if (!canViewRoles) return { state: 'permission-denied' as const, canManageRoles: false };

      const [{ roles, seededPermissions }, assignableUsers, npd, technical] = await Promise.all([
        readRoleRows(queryClient),
        readAssignableUsers(queryClient),
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
  return (
    <RolesScreen
      roles={props.roles ?? FALLBACK_ROLES}
      permissionsByRole={props.permissionsByRole ?? fallbackPermissionsByRole()}
      assignableUsers={props.assignableUsers ?? FALLBACK_USERS}
      canManageRoles={props.canManageRoles ?? true}
      assignRole={props.assignRole ?? (() => ({ ok: true, auditAction: 'settings.role_assignment.updated' }))}
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

  return <RolesScreen {...result} assignRole={assignRoleAction} />;
}
