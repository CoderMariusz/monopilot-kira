import type { SettingsNavGroup, SettingsNavItem, SettingsPermissionKey } from "./types";

const RBAC_TODO = "UI-128 keeps settings navigation ungated; wire permission_key in the future RBAC module.";

const item = (
  key: string,
  label: string,
  icon: string,
  highlight = false,
  route = `/settings/${key}`,
  permissionKey: SettingsPermissionKey = null,
): SettingsNavItem => ({
  key,
  label,
  i18n_key: `Navigation.settings.items.${key.replaceAll("-", "_")}`,
  route,
  icon_token: icon,
  ...(highlight ? { highlight: true } : {}),
  count_slot: null,
  permission_key: permissionKey,
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
    item("compliance", "Compliance profile", "✓", false, "/settings/compliance"),
    item("sites", "Sites & lines", "▤"),
    // Working infra screens that were URL-only dead-ends (2026-06-11 clickthrough §1).
    item("lines", "Production lines", "≣", false, "/settings/infra/lines"),
    item("warehouses", "Warehouses", "▥", false, "/settings/infra/warehouses"),
    item("locations", "Locations", "⌖", false, "/settings/infra/locations"),
    // E1 — label printers (printers + print_jobs, mig 304). Sits with the other
    // infra master screens so it is not a URL-only dead-end.
    item("printers", "Printers", "🖨", false, "/settings/infra/printers"),
    // E5 — yard dock doors (dock_doors, mig 317). Sits with the other infra
    // master screens so it is not a URL-only dead-end.
    item("docks", "Dock doors", "⚓", false, "/settings/infra/docks"),
    item("shifts", "Shifts & calendar", "⧗"),
    // E4B — hourly labor rates by role/group (feeds WO labor cost). Sits with the
    // other workforce/infra config so it is not a URL-only dead-end.
    item("labor-rates", "Labor rates", "💰", false, "/settings/labor-rates"),
  ]),
  group("data", "Data", true, [
    // W2-T4 (2026-07-06 consolidation) — "Products & SKUs" entry removed: the
    // settings screen was a third write path into public.items bypassing the
    // technical-items wizard. /settings/products now redirects to the Technical
    // items list filtered to finished goods.
    item("npd-fields", "NPD fields", "▦", false, "/settings/npd-fields"),
    // NPD approval requirements — per-org toggles for which approval criteria
    // (C1..C7) block product approval. Sits next to NPD fields so the screen is
    // not a URL-only dead-end. RBAC (npd.schema.edit) is enforced server-side on
    // the page/actions; the nav stays ungated per the UI-128 RBAC_TODO contract.
    item("npd-approval", "Approval requirements", "✔", false, "/settings/npd-approval"),
    // NPD gate checklist templates — per-org G0–G4 items copied into new projects.
    // Sits next to NPD fields / approval requirements; RBAC (npd.schema.edit) is
    // enforced server-side on the page/actions; nav stays ungated per UI-128.
    item("npd-checklist", "Gate checklists", "☑", false, "/settings/npd-checklist"),
    // NPD org-wide cost parameters — overhead £/kg + logistics £/box defaults for
    // the costing waterfall. RBAC (npd.schema.edit) enforced server-side.
    item("npd-cost-params", "Cost parameters", "£", false, "/settings/npd-cost-params"),
    item("boms", "BOMs & recipes", "⛓"),
    // W2-T1 (2026-07-06 consolidation) — ONE unified "Processes" entry. It points
    // at the unified screen (npd_process_defaults backbone + ManufacturingOperations
    // vocabulary) that replaced the separate "Process defaults" entry; the legacy
    // reference-A screen at /settings/processes retires in W2-T2, after which the
    // route renames and this becomes `/settings/processes` again. Manufacturing
    // operations stays reachable below as the name/suffix vocabulary sub-screen.
    item("processes", "Processes", "⟶", true, "/settings/process-defaults"),
    item("manufacturing-ops", "  └ Manufacturing operations", "⚒", true, "/settings/reference/manufacturing-operations"),
    item("product-categories", "Product categories", "🏷", true, "/settings/reference/product-categories"),
    item("partners", "Suppliers & customers", "↔"),
    // C7b — per-customer sell price overrides (customer_item_prices, mig 460).
    // Sits next to partners because prices are keyed by customer + FG item.
    item("customer-prices", "Customer prices", "£", false, "/settings/customer-prices"),
    item("units", "Units & conversions", "⚖"),
    // E2B — cold-chain product temperature ranges (mig 315). Master config that
    // drives the GRN delivery-condition check, so it sits with the other Data
    // master screens.
    item("temp-ranges", "Temperature ranges", "❄", false, "/settings/quality/temp-ranges"),
    item("import-export", "Import / Export", "⇅", true),
  ]),
  group("access", "Access", true, [
    item("users", "Users & roles", "◉"),
    item("security", "Security", "🔒"),
    item("audit-logs", "Audit logs", "◷", true, "/settings/audit"),
  ]),
  group("signoff", "Sign-off", true, [
    item("signoff", "Sign-off policies", "✍"),
    // Owner-requested section gathering the scanner PIN / sign-off toggles
    // (currently: supervisor-PIN requirement for scanner reverse-consume).
    item("scanner-auth", "Sign-off & PINs", "🔐", false, "/settings/scanner-auth"),
  ]),
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

// ── F2-C1 · settings-nav RBAC gate ─────────────────────────────────────────
// UI-128 froze the static SETTINGS_NAV_GROUPS shape (permission_key stays null,
// see settings-nav.test.ts). Rather than mutate that manifest, group visibility
// is decided by a SEPARATE, server-side filter: `filterSettingsNavGroups`.
//
// Every `admin: true` group is an org-configuration area whose pages themselves
// gate on settings.org.read / settings.org.update / org.access.admin (verified
// across settings/*/page.tsx). So the nav gate mirrors the pages exactly: an
// admin group renders only for callers who can read org settings, and the
// caller-only `myAccount` group (admin:false) is always visible. The permission
// probe is the caller's responsibility (server component) so the client nav
// never receives — and so can never leak — links the user cannot open.

/** Permission that unlocks the admin (org-configuration) settings groups. */
export const SETTINGS_ADMIN_READ_PERMISSION = "settings.org.read" as const;

/**
 * Permissions ANY of which reveal the admin settings groups. Kept broad so a
 * user who can edit (but whose role omits the read grant) is never locked out
 * of a screen they can otherwise reach — the same fail-open-to-the-page
 * semantics the individual pages use. Platform/super-admin bypass is handled
 * upstream by hasAnyPermission (app.current_user_is_platform_admin()).
 */
export const SETTINGS_ADMIN_NAV_PERMISSIONS = [
  "settings.org.read",
  "settings.org.update",
  "org.access.admin",
] as const;

export type SettingsNavAccess = {
  /** True when the caller may see the admin (org-configuration) groups. */
  canViewAdminSettings: boolean;
};

/**
 * Pure, server-side nav filter. `admin: true` groups appear only when
 * `canViewAdminSettings` is true; non-admin groups (My account) always appear.
 * Returns a new array — never mutates SETTINGS_NAV_GROUPS.
 */
export function filterSettingsNavGroups(
  groups: readonly SettingsNavGroup[],
  access: SettingsNavAccess,
): SettingsNavGroup[] {
  return groups.filter((navGroup) => !navGroup.admin || access.canViewAdminSettings);
}
