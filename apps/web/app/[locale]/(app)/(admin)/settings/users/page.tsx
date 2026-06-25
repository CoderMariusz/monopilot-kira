import { getTranslations } from 'next-intl/server';

import { assignRole } from '../../../../../../actions/users/assign-role';
import { createUserWithPassword } from '../../../../../../actions/users/create-user-with-password';
import { inviteUser } from '../../../../../../actions/users/invite';
import { resetPassword } from '../../../../../../actions/users/reset-password';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { ALL_PERMISSIONS } from '../../../../../../../../packages/rbac/src/permissions.enum';
import SettingsUsersScreen, {
  type PermissionCell,
  type PermissionModuleSummary,
  type RoleCategory,
  type RoleFilter,
  type RoleSummary,
  type SettingsUser,
  type UsersScreenData,
  type UsersScreenLabels,
  type UsersSearchParams,
} from './users-screen.client';

export const dynamic = 'force-dynamic';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RoleRow = {
  id: string;
  code: string;
  name: string;
  permissions: string[] | null;
  permissions_json: unknown;
};

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role_id: string;
  role_code: string;
  role_name: string;
  is_active: boolean;
  invite_token: string | null;
  invite_token_expires_at: string | Date | null;
  last_login_at: string | Date | null;
  updated_at: string | Date | null;
};

type KpiRow = {
  active_users: string | number;
  invited_users: string | number;
  disabled_users: string | number;
  seat_limit: number | null;
};

type PermissionCheckRow = { ok: boolean };
type UsersScreenReadResult =
  | { state: 'ready'; data: UsersScreenData }
  | { state: 'permission-denied' }
  | { state: 'error' };

const ROLE_CATEGORY_FALLBACKS: Record<string, RoleCategory> = {
  owner: 'Admin',
  admin: 'Admin',
  org_admin: 'Admin',
  'org.access.admin': 'Admin',
  'org.platform.admin': 'Admin',
  'org.schema.admin': 'Admin',
  npd_manager: 'Manager',
  module_admin: 'Manager',
  planner: 'Manager',
  production_lead: 'Manager',
  quality_lead: 'Manager',
  operator: 'Operator',
  warehouse_operator: 'Operator',
  viewer: 'Viewer',
  auditor: 'Viewer',
};
const PERMISSION_STRENGTH: Record<PermissionCell, number> = { none: 0, r: 1, rw: 2, admin: 3 };

function asSingle(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSearchParams(raw: Record<string, string | string[] | undefined>): UsersSearchParams {
  const view = asSingle(raw.view) === 'cards' ? 'cards' : 'table';
  const roleValue = asSingle(raw.role);
  const role: RoleFilter = ['all', 'admin', 'manager', 'operator', 'viewer'].includes(roleValue ?? '')
    ? (roleValue as RoleFilter)
    : 'all';
  const q = asSingle(raw.q);
  return { view, role, q };
}

function toCategory(value: string | null | undefined, code?: string): RoleCategory {
  if (value === 'admin') return 'Admin';
  if (value === 'manager') return 'Manager';
  if (value === 'operator') return 'Operator';
  if (value === 'viewer') return 'Viewer';
  return ROLE_CATEGORY_FALLBACKS[code ?? ''] ?? 'Viewer';
}

function initials(name: string, email: string) {
  const source = name.trim() || email.split('@')[0] || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function toIsoString(value: string | Date | null | undefined) {
  if (!value) return '—';
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace('T', ' ');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().slice(0, 16).replace('T', ' ');
}

function permissionsFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function permissionGroupId(permission: string): string {
  return permission.split('.')[0] ?? permission;
}

function permissionGroupLabel(groupId: string): string {
  return groupId
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function buildPermissionModules(): Array<PermissionModuleSummary & { permissions: string[] }> {
  const groups = new Map<string, string[]>();
  for (const permission of ALL_PERMISSIONS) {
    const groupId = permissionGroupId(permission);
    const permissions = groups.get(groupId) ?? [];
    permissions.push(permission);
    groups.set(groupId, permissions);
  }
  return Array.from(groups, ([id, permissions]) => ({ id, label: permissionGroupLabel(id), permissions }));
}

function classifyPermission(permission: string): PermissionCell {
  const normalizedPermission = permission.toLowerCase();
  if (/admin|manage|owner|all/.test(normalizedPermission)) return 'admin';
  if (/write|create|update|delete|edit|assign|invite|deactivate|toggle/.test(normalizedPermission)) return 'rw';
  if (/read|view|list/.test(normalizedPermission)) return 'r';
  return 'r';
}

function strongestPermission(current: PermissionCell, next: PermissionCell): PermissionCell {
  return PERMISSION_STRENGTH[next] > PERMISSION_STRENGTH[current] ? next : current;
}

async function hasAnyPermission(client: QueryClient, userId: string, orgId: string, permissions: string[]) {
  const { rows } = await client.query<PermissionCheckRow>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = any($3::text[])
          or coalesce(r.permissions, '[]'::jsonb) ?| $3::text[]
        )
      limit 1`,
    [userId, orgId, permissions],
  );
  return rows.length > 0;
}

async function readUsersScreenData(labels: UsersScreenLabels): Promise<UsersScreenReadResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const [canView, canInviteUsers, canAssignRoles, canResetPasswords] = await Promise.all([
        hasAnyPermission(queryClient, userId, orgId, ['settings.users.view', 'settings.users.invite', 'settings.roles.assign', 'settings.users.create', 'settings.users.deactivate']),
        hasAnyPermission(queryClient, userId, orgId, ['settings.users.invite']),
        hasAnyPermission(queryClient, userId, orgId, ['settings.roles.assign']),
        hasAnyPermission(queryClient, userId, orgId, ['org.access.admin']),
      ]);

      if (!canView) return { state: 'permission-denied' as const };

      const [roleResult, userResult, kpiResult] = await Promise.all([
        queryClient.query<RoleRow>(
          `select r.id,
                  r.code,
                  coalesce(r.name, r.code) as name,
                  r.permissions as permissions_json,
                  coalesce(array_remove(array_agg(distinct rp.permission), null), '{}'::text[]) as permissions
             from public.roles r
             left join public.role_permissions rp on rp.role_id = r.id
            where r.org_id = $1::uuid or r.org_id is null
            group by r.id, r.code, r.name, r.permissions, r.display_order
            order by r.display_order nulls last, coalesce(r.name, r.code) asc`,
          [orgId],
        ),
        queryClient.query<UserRow>(
          `select u.id,
                  u.email::text as email,
                  u.name,
                  u.role_id,
                  r.code as role_code,
                  coalesce(r.name, r.code) as role_name,
                  u.is_active,
                  u.invite_token,
                  u.invite_token_expires_at,
                  u.last_login_at,
                  u.updated_at
             from public.users u
             join public.roles r on r.id = u.role_id
            where u.org_id = $1::uuid
            order by u.name asc, u.email asc`,
          [orgId],
        ),
        queryClient.query<KpiRow>(
          `select count(*) filter (where u.is_active = true) as active_users,
                  count(*) filter (where u.is_active = false and u.invite_token is not null) as invited_users,
                  count(*) filter (where u.is_active = false and u.invite_token is null) as disabled_users,
                  max(o.seat_limit) as seat_limit
             from public.organizations o
             left join public.users u on u.org_id = o.id
            where o.id = $1::uuid`,
          [orgId],
        ),
      ]);

      const roles: RoleSummary[] = roleResult.rows.map((role) => ({
        id: role.id,
        code: role.code,
        label: role.name,
        category: toCategory(undefined, role.code),
      }));

      const users: SettingsUser[] = userResult.rows.map((user) => {
        const name = user.name?.trim() || user.email;
        return {
          id: user.id,
          name,
          email: user.email,
          initials: initials(name, user.email),
          roleCode: user.role_code,
          roleId: user.role_id,
          roleLabel: user.role_name,
          roleCategory: toCategory(undefined, user.role_code),
          site: labels.allSites,
          lastActive: toIsoString(user.last_login_at ?? user.updated_at),
          status: user.is_active ? 'active' : user.invite_token ? 'invited' : 'disabled',
        };
      });

      const modules = buildPermissionModules();
      const matrix = Object.fromEntries(
        modules.map((module) => [
          module.id,
          Object.fromEntries(roles.map((role) => [role.id, 'none' satisfies PermissionCell])),
        ]),
      ) as Record<string, Record<string, PermissionCell>>;

      for (const role of roleResult.rows) {
        const permissionStrings = [
          ...(role.permissions ?? []),
          ...permissionsFromJson(role.permissions_json),
        ];
        const grantedPermissions = new Set(permissionStrings);
        const roleMatrix = roles.find((summary) => summary.id === role.id);
        if (!roleMatrix) continue;
        for (const module of modules) {
          let strongest: PermissionCell = 'none';
          for (const permission of module.permissions) {
            if (!grantedPermissions.has(permission)) continue;
            strongest = strongestPermission(strongest, classifyPermission(permission));
          }
          matrix[module.id][roleMatrix.id] = strongest;
        }
      }

      const visibleModules: PermissionModuleSummary[] = modules.map(({ id, label }) => ({ id, label }));

      const kpi = kpiResult.rows[0];
      return {
        state: 'ready' as const,
        data: {
          users,
          roles,
          modules: visibleModules,
          permissions: matrix,
          kpis: {
            activeUsers: Number(kpi?.active_users ?? 0),
            invitedUsers: Number(kpi?.invited_users ?? 0),
            disabledUsers: Number(kpi?.disabled_users ?? 0),
            seatLimit: kpi?.seat_limit ?? null,
          },
          canInviteUsers,
          canAssignRoles,
          canResetPasswords,
        },
      };
    });
  } catch (error) {
    console.error('[settings/users] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { state: 'error' };
  }
}

async function buildLabels(locale: string): Promise<UsersScreenLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.users_screen' });
  return {
    title: t('title'),
    summary: t('summary', { users: '{users}', roles: '{roles}' }),
    export: t('export'),
    inviteUser: t('invite_user'),
    active: t('active'),
    invited: t('invited'),
    disabled: t('disabled'),
    seatsUsed: t('seats_used'),
    seatsUnlimited: t('seats_unlimited'),
    userDirectory: t('user_directory'),
    roleFilters: {
      all: t('role_filter_all'),
      admin: t('role_filter_admin'),
      manager: t('role_filter_manager'),
      operator: t('role_filter_operator'),
      viewer: t('role_filter_viewer'),
    },
    tableView: t('table_view'),
    cardsView: t('cards_view'),
    viewToggle: t('view_toggle'),
    avatar: t('avatar'),
    searchLabel: t('search_label'),
    searchPlaceholder: t('search_placeholder'),
    noUsersTitle: t('no_users_title'),
    noUsersBody: t('no_users_body'),
    emptyRoleName: {
      all: t('empty_role_all'),
      admin: t('empty_role_admin'),
      manager: t('empty_role_manager'),
      operator: t('empty_role_operator'),
      viewer: t('empty_role_viewer'),
    },
    tableHeaders: {
      name: t('table_name'),
      email: t('table_email'),
      role: t('table_role'),
      site: t('table_site'),
      lastActive: t('table_last_active'),
      status: t('table_status'),
      actions: t('table_actions'),
    },
    statuses: {
      active: t('status_active'),
      invited: t('status_invited'),
      disabled: t('status_disabled'),
    },
    rolePermissions: t('role_permissions'),
    rolePermissionsDescription: t('role_permissions_description'),
    module: t('module'),
    roleCategoryLabels: {
      Admin: t('category_admin'),
      Manager: t('category_manager'),
      Operator: t('category_operator'),
      Viewer: t('category_viewer'),
    },
    permissionLabels: {
      admin: t('permission_admin'),
      rw: t('permission_rw'),
      r: t('permission_r'),
      none: t('permission_none'),
    },
    lastActivePrefix: t('last_active_prefix'),
    inviteDialogTitle: t('invite_dialog_title'),
    closeInviteDialog: t('close_invite_dialog'),
    emailAddress: t('email_address'),
    emailPlaceholder: t('email_placeholder'),
    nameOptional: t('name_optional'),
    role: t('role'),
    site: t('site'),
    allSites: t('all_sites'),
    personalMessage: t('personal_message'),
    personalMessagePlaceholder: t('personal_message_placeholder'),
    inviteHelp: t('invite_help'),
    cancel: t('cancel'),
    sendInvitation: t('send_invitation'),
    invitationSent: t('invitation_sent'),
    invitationFailed: t('invitation_failed'),
    invalidInvite: t('invalid_invite'),
    loadError: t('load_error'),
    permissionDenied: t('permission_denied'),
    roleAssignmentUnavailable: t('role_assignment_unavailable'),
    assignRoleDialogTitle: t('assign_role_dialog_title'),
    roleAssignmentSubtitle: t('role_assignment_subtitle'),
    searchUser: t('search_user'),
    searchUserPlaceholder: t('search_user_placeholder'),
    newRole: t('new_role'),
    pickRole: t('pick_role'),
    roleAssignmentPreview: t('role_assignment_preview'),
    roleAssignmentSuccess: t('role_assignment_success'),
    roleAssignmentFailed: t('role_assignment_failed'),
    resetPassword: t('reset_password'),
    resetPasswordUnavailable: t('reset_password_unavailable'),
    passwordResetSuccess: t('password_reset_success'),
    passwordResetFailed: t('password_reset_failed'),
    exportStatus: t('export_status'),
    setPasswordToggle: t('set_password_toggle'),
    setPasswordToggleHint: t('set_password_toggle_hint'),
    password: t('password'),
    passwordPlaceholder: t('password_placeholder'),
    confirmPassword: t('confirm_password'),
    confirmPasswordPlaceholder: t('confirm_password_placeholder'),
    passwordStrengthHint: t('password_strength_hint'),
    passwordMismatch: t('password_mismatch'),
    createUserButton: t('create_user_button'),
    createUserHelp: t('create_user_help'),
    userCreated: t('user_created'),
    userCreationFailed: t('user_creation_failed'),
    userCreationForbiddenRole: t('user_creation_forbidden_role'),
  };
}

// Top-level `'use server'` adapter: maps the client's { userId } shape to the
// resetPassword action's { targetUserId } shape. It MUST be a module-scope
// server action — an inline arrow defined in the Server Component cannot be
// serialized across the RSC boundary ("Functions cannot be passed directly to
// Client Components") and crashes the page with an uncaught 500.
async function resetPasswordAction(input: { userId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  'use server';
  const result = await resetPassword({ targetUserId: input.userId });
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error };
}

// Module-scope `'use server'` adapter for the admin-only create-with-password
// path (same RSC-serialization constraint as resetPasswordAction). The
// underlying action self-gates on settings.users.invite and scopes the new
// user to the caller's org — the page never passes an org_id.
async function createUserWithPasswordAction(input: {
  email: string;
  password: string;
  name?: string;
  roleId: string;
  language?: string;
}): Promise<{ ok: true; data: { email: string; userId: string } } | { ok: false; error: string }> {
  'use server';
  const result = await createUserWithPassword(input);
  if (result.ok) return { ok: true, data: result.data };
  return { ok: false, error: result.error };
}

function LoadingState() {
  return (
    <main data-testid="settings-users-loading" aria-busy="true" className="space-y-4 p-6">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 rounded-xl border bg-slate-100" />
        ))}
      </div>
    </main>
  );
}

export default async function SettingsUsersPage({ params, searchParams }: PageProps) {
  const [{ locale }, rawSearchParams] = await Promise.all([params, searchParams ?? Promise.resolve({})]);
  const labels = await buildLabels(locale);
  const result = await readUsersScreenData(labels);
  const normalizedSearchParams = normalizeSearchParams(rawSearchParams);

  if (result.state !== 'ready') {
    const message = result.state === 'permission-denied' ? labels.permissionDenied : labels.loadError;
    const tone = result.state === 'permission-denied' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-900';
    return (
      <main className="p-6">
        <div role="alert" className={`rounded-lg border p-4 text-sm ${tone}`}>
          {message}
        </div>
      </main>
    );
  }

  return (
    <SettingsUsersScreen
      data={result.data}
      labels={labels}
      searchParams={normalizedSearchParams}
      locale={locale}
      inviteUserAction={inviteUser}
      assignRoleAction={assignRole}
      resetPasswordAction={resetPasswordAction}
      createUserWithPasswordAction={result.data.canInviteUsers ? createUserWithPasswordAction : undefined}
    />
  );
}

export { LoadingState };
