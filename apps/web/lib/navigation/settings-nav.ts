import type { SettingsNavGroup, SettingsNavItem } from "./types";

const RBAC_TODO = "UI-128 keeps settings navigation ungated; wire permission_key in the future RBAC module.";

const item = (key: string, label: string, icon: string, highlight = false, route = `/settings/${key}`): SettingsNavItem => ({
  key,
  label,
  i18n_key: `Navigation.settings.items.${key.replaceAll("-", "_")}`,
  route,
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
    item("profile", "Company profile", "◆", false, "/settings/company"),
    item("sites", "Sites & lines", "▤"),
    // Working infra screens that were URL-only dead-ends (2026-06-11 clickthrough §1).
    // NOTE: /settings/infra/machines is deliberately NOT added — the newer
    // /settings/machines CRUD screen (Data group) supersedes it.
    item("lines", "Production lines", "≣", false, "/settings/infra/lines"),
    item("warehouses", "Warehouses", "▥", false, "/settings/infra/warehouses"),
    item("locations", "Locations", "⌖", false, "/settings/infra/locations"),
    item("shifts", "Shifts & calendar", "⧗"),
  ]),
  group("data", "Data", true, [
    item("products", "Products & SKUs", "▢"),
    item("boms", "BOMs & recipes", "⛓"),
    item("processes", "Processes", "⟶", true),
    item("machines", "Machines", "⚙"),
    item("manufacturing-ops", "Manufacturing operations", "⚒", true, "/settings/reference/manufacturing-operations"),
    item("partners", "Suppliers & customers", "↔"),
    item("units", "Units & conversions", "⚖"),
    item("import-export", "Import / Export", "⇅", true),
  ]),
  group("access", "Access", true, [
    item("users", "Users & roles", "◉"),
    item("security", "Security", "🔒"),
    item("audit-logs", "Audit logs", "◷", true, "/settings/audit"),
  ]),
  group("signoff", "Sign-off", true, [item("signoff", "Sign-off policies", "✍")]),
  group("operations", "Operations", true, [
    item("devices", "Scanner devices", "📱"),
    item("notifications", "Notifications", "◔"),
    item("features", "Feature flags", "◨"),
  ]),
  group("integrations", "Integrations", true, [item("integrations", "Integrations", "⇄")]),
  group("documentTemplates", "Document templates", true, [
    item("labels", "Label templates", "▭", true),
    item("documents", "Document numbering", "№"),
  ]),
  group("onboarding", "Onboarding", true, [item("onboarding", "Onboarding wizard", "✦", true)]),
  group("admin", "Admin", true, [
    item("d365-conn", "D365 connection", "⇆", false, "/settings/integrations/d365"),
    item("d365-mapping", "D365 field mapping", "↔", false, "/settings/integrations/d365/mapping"),
    item("d365-cost-import", "D365 cost import", "⇣", false, "/settings/integrations/d365/cost-import"),
    item("d365-dlq", "D365 DLQ (shipping)", "!"),
    item("rules", "Rules registry", "✦"),
    item("flags", "Feature flags (L)", "◨"),
    item("schema", "Schema browser", "▦"),
    item("schema-wizard", "  └ Column wizard", "✎", false, "/settings/schema/new"),
    item("schema-migrations", "  └ Migrations queue", "⇣", true, "/settings/schema/migrations"),
    item("tenant", "Tenant variations", "❖", true),
    item("reference", "Reference data", "⚙"),
    item("email-config", "Email templates", "✉", false, "/settings/email"),
    item("email-vars", "Email variables", "§", false, "/settings/email/variables"),
    item("ship-override-reasons", "Shipping override reasons", "≡"),
    item("gallery", "Modal gallery", "◇"),
  ]),
  group("myAccount", "My account", false, [
    item("my-profile", "My profile", "◯", false, "/account/profile"),
    item("my-notifications", "Notifications", "◔", false, "/account/notifications"),
    // W9-L7 — desktop management for the SHARED scanner-login + e-sign PIN
    // (chain dead-end #17: e-sign flows demanded a PIN only the scanner could set).
    item("my-pin", "E-sign & scanner PIN", "✱", false, "/account/pin"),
  ]),
] as const satisfies readonly SettingsNavGroup[];
