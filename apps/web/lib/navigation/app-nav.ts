import { getAppModule } from "./module-registry";
import type { AppModuleId, AppNavGroup, AppSidebarNavItem, NavGroupId } from "./types";

const RBAC_TODO = "UI-128 keeps navigation ungated; wire permission_key in the future RBAC module.";

const DASHBOARD_ITEM: AppSidebarNavItem = {
  key: "dashboard",
  label: "Dashboard",
  i18n_key: "Navigation.app.items.dashboard",
  route: "/dashboard",
  icon_token: "◆",
  module_id: null,
  count_slot: null,
  permission_key: null,
  rbac_todo: RBAC_TODO,
};

const GROUP_LABELS: Record<NavGroupId, { label: string; i18n_key: string }> = {
  core: { label: "Core", i18n_key: "Navigation.app.groups.core" },
  operations: { label: "Operations", i18n_key: "Navigation.app.groups.operations" },
  "qa-shipping": { label: "QA & Shipping", i18n_key: "Navigation.app.groups.qaShipping" },
  premium: { label: "Premium", i18n_key: "Navigation.app.groups.premium" },
  "analytics-network": { label: "Analytics & Network", i18n_key: "Navigation.app.groups.analyticsNetwork" },
};

/**
 * Modules whose sidebar link navigates OUT of the (app) shell into another
 * route group (e.g. the chrome-less device shell). Their page does NOT live
 * under app/[locale]/(app)/.../page.tsx, so the (app) route-contract test
 * treats them as a cross-shell exception. The link itself is a plain href, so
 * navigation just works.
 */
const CROSS_SHELL_SIDEBAR_MODULES: ReadonlySet<AppModuleId> = new Set(["scanner"]);

export function isCrossShellSidebarModule(moduleId: AppModuleId): boolean {
  return CROSS_SHELL_SIDEBAR_MODULES.has(moduleId);
}

function sidebarItem(moduleId: AppModuleId): AppSidebarNavItem {
  const module = getAppModule(moduleId);

  if (module.nav_exposure !== "sidebar" || !module.route) {
    throw new Error(`${module.id} is not exposed in the desktop sidebar`);
  }

  return {
    key: module.id,
    label: module.label,
    i18n_key: module.i18n_key,
    route: module.route,
    icon_token: module.icon_token,
    module_id: module.id,
    count_slot: module.count_slot,
    permission_key: module.permission_key,
    rbac_todo: module.rbac_todo,
  };
}

function group(id: NavGroupId, items: AppSidebarNavItem[]): AppNavGroup {
  return {
    id,
    label: GROUP_LABELS[id].label,
    i18n_key: GROUP_LABELS[id].i18n_key,
    items,
  };
}

export const APP_NAV_GROUPS = [
  group("core", [DASHBOARD_ITEM, sidebarItem("settings")]),
  group("operations", [
    sidebarItem("planning-basic"),
    sidebarItem("planning-ext"),
    sidebarItem("production"),
    sidebarItem("warehouse"),
    sidebarItem("scanner"),
  ]),
  group("qa-shipping", [sidebarItem("quality"), sidebarItem("shipping")]),
  group("premium", [
    sidebarItem("technical"),
    sidebarItem("npd"),
    sidebarItem("finance"),
    sidebarItem("oee"),
    sidebarItem("maintenance"),
  ]),
  group("analytics-network", [sidebarItem("reporting"), sidebarItem("multi-site")]),
] as const satisfies readonly AppNavGroup[];
