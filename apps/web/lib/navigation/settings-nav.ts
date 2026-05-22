import type { SettingsNavGroup, SettingsNavItem } from "./types";

const RBAC_TODO = "UI-128 keeps settings navigation ungated; wire permission_key in the future RBAC module.";

const item = (key: string, label: string, icon: string, highlight = false): SettingsNavItem => ({
  key,
  label,
  i18n_key: `Navigation.settings.items.${key.replaceAll("-", "_")}`,
  route: `/settings/${key}`,
  icon_token: icon,
  ...(highlight ? { highlight: true } : {}),
  count_slot: null,
  permission_key: null,
  rbac_todo: RBAC_TODO,
});

const group = (id: string, label: string, admin: boolean, items: SettingsNavItem[]): SettingsNavGroup => ({
  id,
  label,
  i18n_key: `Navigation.settings.groups.${id}`,
  admin,
  items,
});

export const SETTINGS_NAV_GROUPS = [
  group("organization", "Organization", true, [
    item("profile", "Company profile", "◆"),
    item("sites", "Sites & lines", "▤"),
    item("warehouses", "Warehouses", "▥"),
    item("shifts", "Shifts & calendar", "⧗"),
  ]),
  group("data", "Data", true, [
    item("products", "Products & SKUs", "▢"),
    item("boms", "BOMs & recipes", "⛓"),
    item("processes", "Processes", "⟶", true),
    item("manufacturing-ops", "Manufacturing operations", "⚒", true),
    item("partners", "Suppliers & customers", "↔"),
    item("units", "Units & conversions", "⚖"),
    item("import-export", "Import / Export", "⇅", true),
  ]),
  group("access", "Access", true, [
    item("users", "Users & roles", "◉"),
    item("security", "Security", "🔒"),
    item("audit-logs", "Audit logs", "◷", true),
  ]),
  group("operations", "Operations", true, [
    item("devices", "Scanner devices", "📱"),
    item("notifications", "Notifications", "◔"),
    item("features", "Feature flags", "◨"),
  ]),
  group("integrations", "Integrations", true, [item("integrations", "Integrations", "⇄")]),
  group("documentTemplates", "Document templates", true, [item("labels", "Label templates", "▭", true)]),
  group("onboarding", "Onboarding", true, [item("onboarding", "Onboarding wizard", "✦", true)]),
  group("admin", "Admin", true, [
    item("d365-conn", "D365 connection", "⇆"),
    item("d365-mapping", "D365 field mapping", "↔"),
    item("d365-dlq", "D365 DLQ (shipping)", "!"),
    item("rules", "Rules registry", "✦"),
    item("flags", "Feature flags (L)", "◨"),
    item("schema", "Schema browser", "▦"),
    item("schema-wizard", "  └ Column wizard", "✎"),
    item("schema-migrations", "  └ Migrations queue", "⇣", true),
    item("tenant", "Tenant variations", "❖", true),
    item("reference", "Reference data", "⚙"),
    item("email-config", "Email templates", "✉"),
    item("email-vars", "Email variables", "§"),
    item("ship-override-reasons", "Shipping override reasons", "≡"),
    item("gallery", "Modal gallery", "◇"),
  ]),
  group("myAccount", "My account", false, [
    item("my-profile", "My profile", "◯"),
    item("my-notifications", "Notifications", "◔"),
  ]),
] as const satisfies readonly SettingsNavGroup[];
