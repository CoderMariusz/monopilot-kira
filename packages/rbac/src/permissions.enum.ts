export const Permission = {
  ORG_ACCESS_ADMIN: 'org.access.admin',
  ORG_SCHEMA_ADMIN: 'org.schema.admin',
  ORG_SCIM_WRITE: 'org.scim.write',
  FG_CREATE: 'fg.create',
  FG_EDIT: 'fg.edit',
  BRIEF_CONVERT_TO_NPD_PROJECT: 'brief.convert_to_npd_project',
  REF_EDIT: 'ref.edit',
  AUDIT_READ: 'audit.read',
  OUTBOX_ADMIN: 'outbox.admin',
  IMPERSONATE_ORG: 'impersonate.org',
  /** Settings org read access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_ORG_READ: 'settings.org.read',
  /** Settings org update access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_ORG_UPDATE: 'settings.org.update',
  /** Settings user creation access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_USERS_CREATE: 'settings.users.create',
  /** Settings user deactivation access; PRD 02-SETTINGS §3 lines 140-143. */
  SETTINGS_USERS_DEACTIVATE: 'settings.users.deactivate',
  /** Settings user invitation access; PRD 02-SETTINGS §3 lines 116-123. */
  SETTINGS_USERS_INVITE: 'settings.users.invite',
  /** Settings role assignment access; PRD 02-SETTINGS §3 lines 121-125. */
  SETTINGS_ROLES_ASSIGN: 'settings.roles.assign',
  /** Settings audit read access; PRD 02-SETTINGS §3 lines 118-119. */
  SETTINGS_AUDIT_READ: 'settings.audit.read',
  /** Settings tenant impersonation access; PRD 02-SETTINGS §3 lines 119-120. */
  SETTINGS_IMPERSONATE_TENANT: 'settings.impersonate.tenant',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_SETTINGS_CORE_PERMISSIONS = [
  Permission.SETTINGS_ORG_READ,
  Permission.SETTINGS_ORG_UPDATE,
  Permission.SETTINGS_USERS_CREATE,
  Permission.SETTINGS_USERS_DEACTIVATE,
  Permission.SETTINGS_USERS_INVITE,
  Permission.SETTINGS_ROLES_ASSIGN,
  Permission.SETTINGS_AUDIT_READ,
  Permission.SETTINGS_IMPERSONATE_TENANT,
] as readonly Permission[];

export const LegacyPermissionAlias = {
  'fa.create': Permission.FG_CREATE,
  'fa.edit': Permission.FG_EDIT,
  'brief.convert_to_fa': Permission.BRIEF_CONVERT_TO_NPD_PROJECT,
} as const;

export type LegacyPermissionAlias = keyof typeof LegacyPermissionAlias;

export const ALL_PERMISSIONS = Object.values(Permission) as readonly Permission[];

export const SOD_EXCLUSIVE_PAIRS = [
  [Permission.ORG_ACCESS_ADMIN, Permission.ORG_SCHEMA_ADMIN],
] as const;

export function normalizePermission(input: string): Permission {
  if (isPermission(input)) {
    return input;
  }

  if (isLegacyPermissionAlias(input)) {
    return LegacyPermissionAlias[input];
  }

  throw new Error(`Unknown permission string: ${input}`);
}

function isPermission(input: string): input is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(input);
}

function isLegacyPermissionAlias(input: string): input is LegacyPermissionAlias {
  return Object.prototype.hasOwnProperty.call(LegacyPermissionAlias, input);
}
