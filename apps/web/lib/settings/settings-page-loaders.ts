import { withOrgContext } from '../auth/with-org-context';

type UserRoleCode =
  | 'org_admin'
  | 'npd_manager'
  | 'module_admin'
  | 'planner'
  | 'production_lead'
  | 'quality_lead'
  | 'operator'
  | 'viewer';
type RoleCategory = 'Admin' | 'Manager' | 'Operator' | 'Viewer';
type PermissionCell = 'admin' | 'rw' | 'r' | 'none';
type SettingsUser = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleCode: UserRoleCode;
  roleLabel: string;
  roleCategory: RoleCategory;
  site: string;
  lastActive: string;
  status: 'active' | 'invited' | 'disabled';
};
type RoleSummary = { code: UserRoleCode; label: string; category: RoleCategory };
type UsersPageProps = {
  users: SettingsUser[];
  roles: RoleSummary[];
  modules: string[];
  permissions: Record<string, Record<string, PermissionCell>>;
  kpis: { activeUsers: number; invitedUsers: number; disabledUsers: number; seatLimit: number };
  searchParams?: { view?: 'table' | 'cards'; role?: 'all' | 'admin' | 'manager' | 'operator' | 'viewer'; q?: string };
  canManageUsers: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
};
type SecurityAuditRow = {
  id: string;
  createdAt: string;
  actorName: string;
  action: string;
  tableName: string;
  ipAddress: string | null;
};
type SecurityPolicy = {
  mfaRequirement: 'required_admins' | 'required_all' | 'optional' | 'disabled';
  mfaAllowedMethods: Array<'totp' | 'sms' | 'webauthn'>;
  passwordMinLength: number;
  passwordComplexity: 'basic' | 'standard' | 'strong' | 'custom';
  passwordExpiryDays: number | null;
  passwordHistoryCount: number;
  sessionIdleTimeoutMinutes: number;
  sessionMaxLengthMinutes: number;
};
type SsoConfig = {
  providerName: string;
  tenantDomain: string;
  connected: boolean;
  metadataConfigured: boolean;
  enforceForNonAdmins: boolean;
  scimProvisioning: boolean;
};
type SecurityPageProps = {
  policy: SecurityPolicy;
  sso: SsoConfig;
  ipAllowlist: Array<{ id: string; label: string; cidr: string }>;
  auditLogRows: SecurityAuditRow[];
  canManageSecurity: boolean;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission-denied';
};

export const SETTINGS_USERS_MANAGE_PERMISSION = 'settings.users.manage';
export const SETTINGS_SECURITY_MANAGE_PERMISSION = 'settings.security.manage';

const DEFAULT_MODULES = ['NPD', 'Planning', 'Quality'];

const defaultPolicy: SecurityPolicy = {
  mfaRequirement: 'required_admins',
  mfaAllowedMethods: ['totp'],
  passwordMinLength: 12,
  passwordComplexity: 'strong',
  passwordExpiryDays: null,
  passwordHistoryCount: 5,
  sessionIdleTimeoutMinutes: 60,
  sessionMaxLengthMinutes: 480,
};

const defaultSso: SsoConfig = {
  providerName: 'Microsoft Entra ID',
  tenantDomain: 'apex.onmicrosoft.com',
  connected: false,
  metadataConfigured: false,
  enforceForNonAdmins: false,
  scimProvisioning: false,
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = unknown>(sql: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
};

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role_code: string | null;
  role_name: string | null;
  ui_category: string | null;
  last_login_at: string | Date | null;
  updated_at: string | Date | null;
  is_active: boolean | null;
  invite_token_expires_at: string | Date | null;
};

type RoleRow = {
  code: string | null;
  slug: string | null;
  name: string | null;
  ui_category: string | null;
};

type ModuleRow = {
  code: string | null;
  name: string | null;
};

type SecurityPolicyRow = Record<string, unknown>;
type IpAllowlistRow = { id: string; label: string | null; cidr: string | null };
type AuditEventRow = {
  id: string | number;
  created_at: string | Date | null;
  occurred_at: string | Date | null;
  actor_name: string | null;
  action: string | null;
  table_name: string | null;
  resource_type: string | null;
  ip_address: string | null;
};

type SettingsUsersLoaderInput = {
  searchParams?: UsersPageProps['searchParams'];
};

export async function loadSettingsUsersPageProps(
  input: SettingsUsersLoaderInput = {},
): Promise<Partial<UsersPageProps>> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      const canManageUsers = await hasPermission(client, userId, orgId, SETTINGS_USERS_MANAGE_PERMISSION);
      if (!canManageUsers) {
        return {
          users: [],
          roles: [],
          modules: [],
          permissions: {},
          kpis: { activeUsers: 0, invitedUsers: 0, disabledUsers: 0, seatLimit: 0 },
          searchParams: input.searchParams,
          canManageUsers: false,
          state: 'permission-denied' as const,
        };
      }

      const [users, roles, modules, seatLimit] = await Promise.all([
        loadUsers(client),
        loadRoles(client),
        loadModules(client),
        loadSeatLimit(client),
      ]);

      return {
        users,
        roles,
        modules,
        permissions: buildPermissionMatrix(modules),
        kpis: buildUsersKpis(users, seatLimit),
        searchParams: input.searchParams,
        canManageUsers: true,
        state: users.length > 0 ? ('ready' as const) : ('empty' as const),
      };
    });
  } catch {
    return {
      users: [],
      roles: [],
      modules: [],
      permissions: {},
      kpis: { activeUsers: 0, invitedUsers: 0, disabledUsers: 0, seatLimit: 0 },
      searchParams: input.searchParams,
      canManageUsers: false,
      state: 'error' as const,
    };
  }
}

export async function loadSettingsSecurityPageProps(): Promise<Partial<SecurityPageProps>> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      const canManageSecurity = await hasPermission(client, userId, orgId, SETTINGS_SECURITY_MANAGE_PERMISSION);
      if (!canManageSecurity) {
        return {
          policy: defaultPolicy,
          sso: defaultSso,
          ipAllowlist: [],
          auditLogRows: [],
          canManageSecurity: false,
          state: 'permission-denied' as const,
        };
      }

      const [policy, ipAllowlist, auditLogRows] = await Promise.all([
        loadSecurityPolicy(client),
        loadIpAllowlist(client),
        loadSecurityAuditRows(client),
      ]);

      return {
        policy,
        sso: defaultSso,
        ipAllowlist,
        auditLogRows,
        canManageSecurity: true,
        state: 'ready' as const,
      };
    });
  } catch {
    return {
      policy: defaultPolicy,
      sso: defaultSso,
      ipAllowlist: [],
      auditLogRows: [],
      canManageSecurity: false,
      state: 'error' as const,
    };
  }
}

async function hasPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or r.slug = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

async function loadUsers(client: QueryClient): Promise<SettingsUser[]> {
  const { rows } = await client.query<UserRow>(
    `select
        u.id,
        u.name,
        u.email::text as email,
        coalesce(r.code, r.slug) as role_code,
        coalesce(r.name, r.code, r.slug) as role_name,
        rc.ui_category,
        u.last_login_at,
        u.updated_at,
        u.is_active,
        u.invite_token_expires_at
       from public.users u
       left join public.user_roles ur on ur.user_id = u.id and ur.org_id = u.org_id
       left join public.roles r on r.id = coalesce(u.role_id, ur.role_id) and r.org_id = u.org_id
       left join public.role_categories rc on rc.role_code = coalesce(r.code, r.slug)
      order by u.name asc, u.email asc
      limit 250`,
  );

  return rows.map((row) => {
    const email = row.email ?? '';
    const name = row.name || email || 'Unknown user';
    const roleCode = toUserRoleCode(row.role_code);
    return {
      id: row.id,
      name,
      email,
      initials: initials(name, email),
      roleCode,
      roleLabel: roleLabel(row.role_name, roleCode),
      roleCategory: toRoleCategory(row.ui_category, roleCode),
      site: 'All sites',
      lastActive: formatDate(row.last_login_at ?? row.updated_at),
      status: userStatus(row),
    } satisfies SettingsUser;
  });
}

async function loadRoles(client: QueryClient): Promise<RoleSummary[]> {
  const { rows } = await client.query<RoleRow>(
    `select
        coalesce(r.code, r.slug) as code,
        r.slug,
        coalesce(r.name, r.code, r.slug) as name,
        rc.ui_category
       from public.roles r
       left join public.role_categories rc on rc.role_code = coalesce(r.code, r.slug)
      order by coalesce(r.display_order, 0), coalesce(r.name, r.code, r.slug)`,
  );

  return rows.map((row) => {
    const code = toUserRoleCode(row.code ?? row.slug);
    return {
      code,
      label: roleLabel(row.name, code),
      category: toRoleCategory(row.ui_category, code),
    } satisfies RoleSummary;
  });
}

async function loadModules(client: QueryClient): Promise<string[]> {
  const { rows } = await client.query<ModuleRow>(
    `select code, name from public.modules order by coalesce(display_order, 999), name, code`,
  );
  const modules = rows.map((row) => row.name ?? row.code).filter((value): value is string => Boolean(value));
  return modules.length > 0 ? modules : DEFAULT_MODULES;
}

async function loadSeatLimit(client: QueryClient): Promise<number> {
  const { rows } = await client.query<{ seat_limit: number | string | null }>(
    `select seat_limit from public.organizations where id = app.current_org_id()`,
  );
  return Number(rows[0]?.seat_limit ?? 0);
}

async function loadSecurityPolicy(client: QueryClient): Promise<SecurityPolicy> {
  const { rows } = await client.query<SecurityPolicyRow>(
    `select to_jsonb(p.*) as policy
       from public.org_security_policies p
      where p.org_id = app.current_org_id()
      limit 1`,
  );
  const policy = (rows[0]?.policy && typeof rows[0].policy === 'object' ? rows[0].policy : {}) as Record<string, unknown>;
  return {
    mfaRequirement: normalizeMfaRequirement(policy.mfa_requirement),
    mfaAllowedMethods: normalizeMfaMethods(policy.mfa_allowed_methods),
    passwordMinLength: numberOr(policy.password_min_length, defaultPolicy.passwordMinLength),
    passwordComplexity: normalizePasswordComplexity(policy.password_complexity),
    passwordExpiryDays: nullableNumber(policy.password_expiry_days),
    passwordHistoryCount: numberOr(policy.password_history_count, defaultPolicy.passwordHistoryCount),
    sessionIdleTimeoutMinutes: numberOr(policy.session_idle_timeout_minutes, defaultPolicy.sessionIdleTimeoutMinutes),
    sessionMaxLengthMinutes: numberOr(policy.session_max_length_minutes, defaultPolicy.sessionMaxLengthMinutes),
  };
}

async function loadIpAllowlist(client: QueryClient): Promise<Array<{ id: string; label: string; cidr: string }>> {
  const { rows } = await client.query<IpAllowlistRow>(
    `select id, label, cidr::text as cidr
       from public.admin_ip_allowlist
      order by created_at desc
      limit 25`,
  );
  return rows.map((row) => ({ id: row.id, label: row.label ?? row.cidr ?? 'IP range', cidr: row.cidr ?? '' }));
}

async function loadSecurityAuditRows(client: QueryClient): Promise<SecurityAuditRow[]> {
  const { rows } = await client.query<AuditEventRow>(
    `select
        id,
        occurred_at,
        occurred_at as created_at,
        null::text as actor_name,
        action,
        coalesce(resource_type, action) as table_name,
        resource_type,
        null::text as ip_address
       from public.audit_events
      where retention_class = 'security'
      order by occurred_at desc
      limit 25`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    createdAt: formatDate(row.created_at ?? row.occurred_at),
    actorName: row.actor_name ?? 'System',
    action: row.action ?? 'security.event',
    tableName: row.table_name ?? row.resource_type ?? 'org_security_policies',
    ipAddress: row.ip_address,
  }));
}

function buildUsersKpis(users: SettingsUser[], seatLimit: number): UsersPageProps['kpis'] {
  return {
    activeUsers: users.filter((user) => user.status === 'active').length,
    invitedUsers: users.filter((user) => user.status === 'invited').length,
    disabledUsers: users.filter((user) => user.status === 'disabled').length,
    seatLimit,
  };
}

function buildPermissionMatrix(modules: string[]): Record<string, Record<string, PermissionCell>> {
  return Object.fromEntries(
    modules.map((module) => [
      module,
      { Admin: 'admin', Manager: 'rw', Operator: 'r', Viewer: 'none' } satisfies Record<RoleCategory, PermissionCell>,
    ]),
  );
}

function toUserRoleCode(value: string | null | undefined): UserRoleCode {
  const normalized = String(value ?? '').toLowerCase();
  if (['owner', 'admin', 'org_admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin'].includes(normalized)) return 'org_admin';
  if (normalized === 'npd_manager') return 'npd_manager';
  if (normalized === 'module_admin') return 'module_admin';
  if (normalized === 'planner') return 'planner';
  if (normalized === 'production_lead') return 'production_lead';
  if (normalized === 'quality_lead') return 'quality_lead';
  if (['operator', 'warehouse_operator'].includes(normalized)) return 'operator';
  return 'viewer';
}

function toRoleCategory(value: string | null | undefined, roleCode: UserRoleCode): RoleCategory {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'manager') return 'Manager';
  if (normalized === 'operator') return 'Operator';
  if (normalized === 'viewer') return 'Viewer';
  if (roleCode === 'org_admin') return 'Admin';
  if (roleCode === 'operator') return 'Operator';
  if (roleCode === 'viewer') return 'Viewer';
  return 'Manager';
}

function roleLabel(value: string | null | undefined, roleCode: UserRoleCode): string {
  if (value) return value;
  return roleCode
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(name: string, email: string): string {
  const source = name || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const value = parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : source.slice(0, 2);
  return value.toUpperCase();
}

function userStatus(row: UserRow): SettingsUser['status'] {
  if (row.is_active) return 'active';
  if (row.invite_token_expires_at) return 'invited';
  return 'disabled';
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function normalizeMfaRequirement(value: unknown): SecurityPolicy['mfaRequirement'] {
  if (value === 'required_admins' || value === 'required_all' || value === 'optional') return value;
  if (value === 'off' || value === 'disabled') return 'disabled';
  return defaultPolicy.mfaRequirement;
}

function normalizeMfaMethods(value: unknown): SecurityPolicy['mfaAllowedMethods'] {
  if (!Array.isArray(value)) return defaultPolicy.mfaAllowedMethods;
  const allowed = value.filter((item): item is 'totp' | 'sms' | 'webauthn' => item === 'totp' || item === 'sms' || item === 'webauthn');
  return allowed.length > 0 ? allowed : defaultPolicy.mfaAllowedMethods;
}

function normalizePasswordComplexity(value: unknown): SecurityPolicy['passwordComplexity'] {
  if (value === 'basic' || value === 'standard' || value === 'strong' || value === 'custom') return value;
  return defaultPolicy.passwordComplexity;
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === 0 || value === '0') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
