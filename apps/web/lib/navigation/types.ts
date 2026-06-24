export type AppModuleId =
  | "foundation"
  | "settings"
  | "npd"
  | "technical"
  | "planning-basic"
  | "yard"
  | "freight"
  | "warehouse"
  | "scanner"
  | "planning-ext"
  | "production"
  | "quality"
  | "finance"
  | "shipping"
  | "reporting"
  | "maintenance"
  | "multi-site"
  | "oee";

export type AppModuleKind = "platform" | "desktop" | "scanner";

export type AppShellKind = "none" | "app" | "scanner";

export type AppNavExposure = "sidebar" | "excluded" | "merged";

export type NavGroupId = "core" | "operations" | "qa-shipping" | "premium" | "analytics-network";

export type CountSlot = null;

export type ModulePermissionKey =
  | "settings.org.read"
  | "technical.sensory.read"
  | "npd.dashboard.view"
  | "scheduler.run.read"
  | "yard.manage"
  | "freight.manage"
  | "production.oee.read"
  | "warehouse.inventory.read"
  | "quality.dashboard.view"
  | "ship.dashboard.view"
  | "fin.costs.read"
  | "rpt.dashboard.view"
  | "mnt.asset.read"
  | "multi_site.site.view"
  | "oee.dashboard.read";

export type PermissionKey = ModulePermissionKey | "npd.schema.edit" | null;
export type SettingsPermissionKey = PermissionKey;

export interface RbacDeferredMetadata {
  count_slot: CountSlot;
  permission_key: PermissionKey;
  rbac_todo: string;
}

export interface AppModule extends RbacDeferredMetadata {
  id: AppModuleId;
  label: string;
  i18n_key: string;
  route: string | null;
  icon_token: string;
  module_kind: AppModuleKind;
  shell_kind: AppShellKind;
  nav_exposure: AppNavExposure;
  merged_into: AppModuleId | null;
  nav_group: NavGroupId | null;
}

export type AppModuleDefinition = AppModule;

export interface AppNavItem extends RbacDeferredMetadata {
  key: string;
  label: string;
  i18n_key: string;
  route: string;
  icon_token: string;
  module_id: AppModuleId | null;
}

export type AppSidebarNavItem = AppNavItem;

export interface AppNavGroup {
  id: NavGroupId;
  label: string;
  i18n_key: string;
  items: AppNavItem[];
}

export interface SettingsNavItem extends RbacDeferredMetadata {
  key: string;
  label: string;
  i18n_key: string;
  route: string;
  icon_token: string;
  highlight?: boolean;
  permission_key: SettingsPermissionKey;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  i18n_key: string;
  admin: boolean;
  items: SettingsNavItem[];
}
