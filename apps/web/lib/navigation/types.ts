export type AppModuleId =
  | "foundation"
  | "settings"
  | "npd"
  | "technical"
  | "planning-basic"
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

export type AppModuleKind = "platform" | "business";

export type AppShellKind = "desktop" | "scanner" | "platform";

export type AppNavExposure = "desktop_sidebar" | "scanner_shell" | "platform_only";

export type NavGroupId = "core" | "operations" | "qa-shipping" | "premium" | "analytics-network";

export type CountSlot = null;

export type PermissionKey = null;

export interface RbacDeferredMetadata {
  count_slot: CountSlot;
  permission_key: PermissionKey;
  rbac_todo: string;
}

export interface AppModuleDefinition extends RbacDeferredMetadata {
  id: AppModuleId;
  label: string;
  i18n_key: string;
  route: string | null;
  icon: string;
  module_kind: AppModuleKind;
  shell_kind: AppShellKind;
  nav_exposure: AppNavExposure;
  nav_group: NavGroupId | null;
}

export interface AppSidebarNavItem extends RbacDeferredMetadata {
  key: string;
  label: string;
  i18n_key: string;
  route: string;
  icon: string;
  module_id: AppModuleId | null;
}

export interface AppNavGroup {
  id: NavGroupId;
  label: string;
  i18n_key: string;
  items: AppSidebarNavItem[];
}

export interface SettingsNavItem extends RbacDeferredMetadata {
  key: string;
  label: string;
  i18n_key: string;
  route: string;
  icon: string;
  highlight?: boolean;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  i18n_key: string;
  admin: boolean;
  items: SettingsNavItem[];
}
