/**
 * Permissions that grant access to the Settings → Users directory (PII + role matrix).
 * Read-only business roles such as `viewer` must NOT hold any of these — they may have
 * module *.read grants but must not enumerate org user emails or the full RBAC matrix.
 */
export const USERS_DIRECTORY_ACCESS_PERMISSIONS = [
  'settings.users.manage',
  'org.access.admin',
  'settings.users.invite',
  'settings.roles.assign',
  'settings.users.create',
  'settings.users.deactivate',
] as const;
