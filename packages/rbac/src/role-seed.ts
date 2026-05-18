import { ALL_PERMISSIONS, Permission, type Permission as PermissionValue } from './permissions.enum.js';

export type SystemRoleCode =
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

export type SystemRoleSeed = {
  code: SystemRoleCode;
  name: string;
  permissions: readonly PermissionValue[];
  isSystem: true;
};

const settingsPermissions = ALL_PERMISSIONS.filter((permission) =>
  permission.startsWith('settings.'),
) as readonly PermissionValue[];

const auditReadPermissions = [Permission.SETTINGS_AUDIT_READ] as const;
const settingsReadPermissions = [Permission.SETTINGS_ORG_READ] as const;
const userAdminPermissions = [
  Permission.SETTINGS_ORG_READ,
  Permission.SETTINGS_USERS_CREATE,
  Permission.SETTINGS_USERS_DEACTIVATE,
  Permission.SETTINGS_USERS_INVITE,
  Permission.SETTINGS_ROLES_ASSIGN,
] as const;

export const SYSTEM_ROLE_SEEDS = [
  {
    code: 'owner',
    name: 'Owner',
    permissions: ALL_PERMISSIONS,
    isSystem: true,
  },
  {
    code: 'admin',
    name: 'Admin',
    permissions: settingsPermissions,
    isSystem: true,
  },
  {
    code: 'npd_manager',
    name: 'NPD Manager',
    permissions: [
      Permission.SETTINGS_ORG_READ,
      Permission.NPD_RELEASED_PRODUCT_EDIT_REQUEST,
      Permission.NPD_RELEASED_PRODUCT_EDIT_AUTHORIZE,
    ],
    isSystem: true,
  },
  {
    code: 'module_admin',
    name: 'Module Admin',
    permissions: userAdminPermissions,
    isSystem: true,
  },
  {
    code: 'planner',
    name: 'Planner',
    permissions: settingsReadPermissions,
    isSystem: true,
  },
  {
    code: 'production_lead',
    name: 'Production Lead',
    permissions: settingsReadPermissions,
    isSystem: true,
  },
  {
    code: 'quality_lead',
    name: 'Quality Lead',
    permissions: [Permission.SETTINGS_ORG_READ, Permission.TECHNICAL_PRODUCT_SPEC_APPROVE],
    isSystem: true,
  },
  {
    code: 'warehouse_operator',
    name: 'Warehouse Operator',
    permissions: settingsReadPermissions,
    isSystem: true,
  },
  {
    code: 'auditor',
    name: 'Auditor',
    permissions: auditReadPermissions,
    isSystem: true,
  },
  {
    code: 'viewer',
    name: 'Viewer',
    permissions: settingsReadPermissions,
    isSystem: true,
  },
] as const satisfies readonly SystemRoleSeed[];
