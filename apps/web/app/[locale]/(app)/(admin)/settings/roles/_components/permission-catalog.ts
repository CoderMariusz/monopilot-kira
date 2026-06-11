/**
 * DEFECT-8 — module-grouped permission catalog for the role permissions editor.
 *
 * Single source of truth = the ALL_<MODULE>_PERMISSIONS exports in
 * packages/rbac/src/permissions.enum.ts. Every group header is a module name and
 * every checkbox is one canonical permission string; the editor never invents a
 * permission outside this catalog (setRolePermissions also fail-closes on any
 * string not in ALL_PERMISSIONS).
 */
import {
  ALL_SETTINGS_CORE_PERMISSIONS,
  ALL_SETTINGS_EXT_PERMISSIONS,
  ALL_NPD_PERMISSIONS,
  ALL_TECHNICAL_PERMISSIONS,
  ALL_PRODUCTION_PERMISSIONS,
  ALL_WAREHOUSE_PERMISSIONS,
  ALL_QUALITY_PERMISSIONS,
  ALL_FINANCE_PERMISSIONS,
  ALL_MAINTENANCE_PERMISSIONS,
  ALL_OEE_PERMISSIONS,
  ALL_SHIP_PERMISSIONS,
  ALL_REPORTING_CORE_PERMISSIONS,
  ALL_MULTI_SITE_PERMISSIONS,
  ALL_SCHEDULER_PERMISSIONS,
} from '../../../../../../../../../packages/rbac/src/permissions.enum';

export type PermissionGroup = {
  /** i18n key suffix under `roles.editor.groups.*`. */
  id: string;
  permissions: readonly string[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { id: 'settings_core', permissions: ALL_SETTINGS_CORE_PERMISSIONS },
  { id: 'settings_ext', permissions: ALL_SETTINGS_EXT_PERMISSIONS },
  { id: 'npd', permissions: ALL_NPD_PERMISSIONS },
  { id: 'technical', permissions: ALL_TECHNICAL_PERMISSIONS },
  { id: 'production', permissions: ALL_PRODUCTION_PERMISSIONS },
  { id: 'warehouse', permissions: ALL_WAREHOUSE_PERMISSIONS },
  { id: 'quality', permissions: ALL_QUALITY_PERMISSIONS },
  { id: 'finance', permissions: ALL_FINANCE_PERMISSIONS },
  { id: 'maintenance', permissions: ALL_MAINTENANCE_PERMISSIONS },
  { id: 'oee', permissions: ALL_OEE_PERMISSIONS },
  { id: 'shipping', permissions: ALL_SHIP_PERMISSIONS },
  { id: 'reporting', permissions: ALL_REPORTING_CORE_PERMISSIONS },
  { id: 'multi_site', permissions: ALL_MULTI_SITE_PERMISSIONS },
  { id: 'scheduler', permissions: ALL_SCHEDULER_PERMISSIONS },
] as const;

/** Flat set of every catalog permission the editor can render/toggle. */
export const CATALOG_PERMISSION_SET: ReadonlySet<string> = new Set(
  PERMISSION_GROUPS.flatMap((group) => group.permissions),
);
