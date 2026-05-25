import { getTranslations } from 'next-intl/server';

import { inviteUser } from '../../../../../../actions/users/invite';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import SettingsUsersScreen, {
  type PermissionCell,
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

type ModuleRow = {
  code: string;
  name: string;
};

type PermissionRow = {
  module_code: string;
  module_name: string;
  role_code: string;
  permission: string | null;
  permissions_json: unknown;
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
const DEFAULT_MODULES = ['NPD', 'Planning', 'Quality'];

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

function classifyPermission(moduleCode: string, moduleName: string, permission: string): PermissionCell {
  const normalizedPermission = permission.toLowerCase();
  const normalizedModuleCode = moduleCode.toLowerCase();
  const normalizedModuleName = moduleName.toLowerCase();
  if (!normalizedPermission.includes(normalizedModuleCode) && !normalizedPermission.includes(normalizedModuleName)) {
    return 'none';
  }
  if (/admin|manage|owner|all/.test(normalizedPermission)) return 'admin';
  if (/write|create|update|delete|edit|assign|invite|deactivate|toggle/.test(normalizedPermission)) return 'rw';
  if (/read|view|list/.test(normalizedPermission)) return 'r';
  return 'none';
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
      const [canView, canInviteUsers, canAssignRoles] = await Promise.all([
        hasAnyPermission(queryClient, userId, orgId, ['settings.users.view', 'settings.users.invite', 'settings.roles.assign', 'settings.users.create', 'settings.users.deactivate']),
        hasAnyPermission(queryClient, userId, orgId, ['settings.users.invite']),
        hasAnyPermission(queryClient, userId, orgId, ['settings.roles.assign']),
      ]);

      if (!canView) return { state: 'permission-denied' as const };

      const [roleResult, userResult, kpiResult] = await Promise.all([
        queryClient.query<RoleRow>(
          `select r.id,
                  r.code,
                  r.name
             from public.roles r
            where r.org_id = $1::uuid or r.org_id is null
            order by r.display_order nulls last, r.name asc`,
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

      let moduleRows: ModuleRow[] = DEFAULT_MODULES.map((name) => ({ code: name.toLowerCase(), name }));
      try {
        const moduleResult = await queryClient.query<ModuleRow>(
          `select code, name
             from public.modules
            order by display_order nulls last, name asc`,
        );
        if (moduleResult.rows.length > 0) moduleRows = moduleResult.rows;
      } catch (error) {
        console.error('[settings/users] modules_optional_load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
      }

      let permissionRows: PermissionRow[] = [];
      try {
        const permissionResult = await queryClient.query<PermissionRow>(
          `select m.code as module_code,
                  m.name as module_name,
                  r.code as role_code,
                  rp.permission,
                  r.permissions as permissions_json
             from public.modules m
             cross join public.roles r
             left join public.role_permissions rp on rp.role_id = r.id
            where r.org_id = $1::uuid or r.org_id is null`,
          [orgId],
        );
        permissionRows = permissionResult.rows;
      } catch (error) {
        console.error('[settings/users] permissions_optional_load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
      }

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

      const modules = moduleRows.map((module) => module.name);
      const moduleNameByCode = new Map(moduleRows.map((module) => [module.code, module.name]));
      const matrix = Object.fromEntries(
        modules.map((module) => [
          module,
          { Admin: 'none', Manager: 'none', Operator: 'none', Viewer: 'none' } satisfies Record<RoleCategory, PermissionCell>,
        ]),
      ) as Record<string, Record<RoleCategory, PermissionCell>>;

      for (const row of permissionRows) {
        const moduleName = moduleNameByCode.get(row.module_code);
        if (!moduleName) continue;
        const category = toCategory(undefined, row.role_code);
        const permissionStrings = [row.permission, ...permissionsFromJson(row.permissions_json)].filter((value): value is string => Boolean(value));
        for (const permission of permissionStrings) {
          const cell = classifyPermission(row.module_code, moduleName, permission);
          matrix[moduleName][category] = strongestPermission(matrix[moduleName][category], cell);
        }
      }

      const kpi = kpiResult.rows[0];
      return {
        state: 'ready' as const,
        data: {
          users,
          roles,
          modules,
          permissions: matrix,
          kpis: {
            activeUsers: Number(kpi?.active_users ?? 0),
            invitedUsers: Number(kpi?.invited_users ?? 0),
            disabledUsers: Number(kpi?.disabled_users ?? 0),
            seatLimit: kpi?.seat_limit ?? null,
          },
          canInviteUsers,
          canAssignRoles,
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
    summary: t('summary'),
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
    exportStatus: t('export_status'),
  };
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
    />
  );
}

export { LoadingState };
