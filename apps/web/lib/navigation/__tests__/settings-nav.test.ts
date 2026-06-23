import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd().endsWith("/apps/web") ? process.cwd() : resolve(process.cwd(), "apps/web");
const navigationDir = resolve(appRoot, "lib/navigation");

const EXPECTED_SETTINGS_NAV = [
  {
    label: "Organization",
    admin: true,
    items: [
      { key: "profile", label: "Company profile", icon: "◆" },
      { key: "sites", label: "Sites & lines", icon: "▤" },
      // LANE QF — infra screens surfaced from URL-only dead-ends (clickthrough §1).
      { key: "lines", label: "Production lines", icon: "≣" },
      { key: "warehouses", label: "Warehouses", icon: "▥" },
      { key: "locations", label: "Locations", icon: "⌖" },
      // E1 — label printers (printers + print_jobs, mig 304).
      { key: "printers", label: "Printers", icon: "🖨" },
      { key: "shifts", label: "Shifts & calendar", icon: "⧗" },
    ],
  },
  {
    label: "Data",
    admin: true,
    items: [
      { key: "products", label: "Products & SKUs", icon: "▢" },
      { key: "boms", label: "BOMs & recipes", icon: "⛓" },
      { key: "processes", label: "Processes", icon: "⟶", highlight: true },
      // Wave-7 machines CRUD screen (supersedes /settings/infra/machines).
      { key: "machines", label: "Machines", icon: "⚙" },
      { key: "manufacturing-ops", label: "Manufacturing operations", icon: "⚒", highlight: true },
      { key: "partners", label: "Suppliers & customers", icon: "↔" },
      { key: "units", label: "Units & conversions", icon: "⚖" },
      { key: "import-export", label: "Import / Export", icon: "⇅", highlight: true },
    ],
  },
  {
    label: "Access",
    admin: true,
    items: [
      { key: "users", label: "Users & roles", icon: "◉" },
      { key: "security", label: "Security", icon: "🔒" },
      { key: "audit-logs", label: "Audit logs", icon: "◷", highlight: true },
    ],
  },
  {
    label: "Sign-off",
    admin: true,
    items: [{ key: "signoff", label: "Sign-off policies", icon: "✍" }],
  },
  {
    label: "Operations",
    admin: true,
    items: [
      { key: "devices", label: "Scanner devices", icon: "📱" },
      { key: "notifications", label: "Notifications", icon: "◔" },
      { key: "features", label: "Feature flags", icon: "◨" },
    ],
  },
  {
    label: "Integrations",
    admin: true,
    items: [{ key: "integrations", label: "Integrations", icon: "⇄" }],
  },
  {
    label: "Document templates",
    admin: true,
    items: [
      { key: "labels", label: "Label templates", icon: "▭", highlight: true },
      { key: "documents", label: "Document numbering", icon: "№" },
    ],
  },
  {
    label: "Onboarding",
    admin: true,
    items: [{ key: "onboarding", label: "Onboarding wizard", icon: "✦", highlight: true }],
  },
  {
    label: "Admin",
    admin: true,
    items: [
      { key: "d365-conn", label: "D365 connection", icon: "⇆" },
      { key: "d365-mapping", label: "D365 field mapping", icon: "↔" },
      { key: "d365-cost-import", label: "D365 cost import", icon: "⇣" },
      { key: "d365-dlq", label: "D365 DLQ (shipping)", icon: "!" },
      { key: "rules", label: "Rules registry", icon: "✦" },
      { key: "flags", label: "Feature flags (L)", icon: "◨" },
      { key: "schema", label: "Schema browser", icon: "▦" },
      { key: "schema-wizard", label: "  └ Column wizard", icon: "✎" },
      { key: "schema-migrations", label: "  └ Migrations queue", icon: "⇣", highlight: true },
      { key: "tenant", label: "Tenant variations", icon: "❖", highlight: true },
      { key: "reference", label: "Reference data", icon: "⚙" },
      { key: "email-config", label: "Email templates", icon: "✉" },
      { key: "email-vars", label: "Email variables", icon: "§" },
      { key: "ship-override-reasons", label: "Shipping override reasons", icon: "≡" },
      { key: "gallery", label: "Modal gallery", icon: "◇" },
    ],
  },
  {
    label: "My account",
    admin: false,
    items: [
      { key: "my-profile", label: "My profile", icon: "◯" },
      { key: "my-notifications", label: "Notifications", icon: "◔" },
      // W9-L7 — shared scanner/e-sign PIN management screen.
      { key: "my-pin", label: "E-sign & scanner PIN", icon: "✱" },
    ],
  },
] as const;

async function loadSettingsNavModule<T extends Record<string, unknown>>(): Promise<T> {
  const filePath = resolve(navigationDir, "settings-nav.ts");
  expect(
    existsSync(filePath),
    `Expected UI-128 production settings navigation manifest to exist at ${filePath}`,
  ).toBe(true);
  return (await import(pathToFileURL(filePath).href)) as T;
}

function labelOf(groupOrItem: Record<string, unknown>): string {
  return String(groupOrItem.label ?? groupOrItem.title ?? groupOrItem.name ?? groupOrItem.id);
}

function keyOf(item: Record<string, unknown>): string {
  return String(item.key ?? item.id);
}

function iconOf(item: Record<string, unknown>): string | undefined {
  const value = item.icon ?? item.icon_token ?? item.ic;
  return typeof value === "string" ? value : undefined;
}

function i18nKeyOf(item: Record<string, unknown>): string {
  const value = item.i18n_key ?? item.i18nKey;
  expect(value, `Missing i18n key for settings nav item ${labelOf(item)}`).toBeTypeOf("string");
  return String(value);
}

function routeOf(item: Record<string, unknown>): string {
  const value = item.route ?? item.href ?? item.path;
  expect(value, `Missing route for settings nav item ${labelOf(item)}`).toBeTypeOf("string");
  return String(value);
}

function itemsOf(group: Record<string, unknown>): Record<string, unknown>[] {
  expect(Array.isArray(group.items), `Settings nav group ${labelOf(group)} must expose items[]`).toBe(true);
  return group.items as Record<string, unknown>[];
}

function getByPath(source: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((cursor, part) => {
    if (cursor && typeof cursor === "object" && part in cursor) {
      return (cursor as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function loadLocale(locale: string): Record<string, unknown> {
  const localePath = resolve(appRoot, "i18n", `${locale}.json`);
  return JSON.parse(readFileSync(localePath, "utf8")) as Record<string, unknown>;
}

const localizedAppRoot = resolve(appRoot, "app/[locale]/(app)");

function toRoutePath(pagePath: string) {
  const routeParts = relative(localizedAppRoot, pagePath)
    .split(/[\\/]/)
    .slice(0, -1)
    .filter((part) => !/^\(.+\)$/.test(part));
  return routeParts.length === 0 ? "/" : `/${routeParts.join("/")}`;
}

function collectLocalizedPageRoots(dir = localizedAppRoot): Map<string, string> {
  const roots = new Map<string, string>();
  if (!existsSync(dir)) return roots;

  const entries = readdirSync(dir, { withFileTypes: true }) as Dirent[];
  for (const entry of entries) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [route, file] of collectLocalizedPageRoots(absolute)) roots.set(route, file);
    } else if (entry.isFile() && entry.name === "page.tsx") {
      roots.set(toRoutePath(absolute), absolute);
    }
  }

  return roots;
}

describe("UI-128 SETTINGS_NAV_GROUPS", () => {
  it("matches the prototype SETTINGS_NAV groups, items, labels, icons, highlights, and admin metadata 1:1", async () => {
    const { SETTINGS_NAV_GROUPS } = await loadSettingsNavModule<{ SETTINGS_NAV_GROUPS?: Record<string, unknown>[] }>();

    expect(SETTINGS_NAV_GROUPS, "SETTINGS_NAV_GROUPS must be an array").toBeInstanceOf(Array);
    expect(SETTINGS_NAV_GROUPS).toHaveLength(EXPECTED_SETTINGS_NAV.length);
    expect(SETTINGS_NAV_GROUPS?.map(labelOf)).toEqual(EXPECTED_SETTINGS_NAV.map((group) => group.label));
    expect(SETTINGS_NAV_GROUPS?.map((group) => group.admin)).toEqual(EXPECTED_SETTINGS_NAV.map((group) => group.admin));

    const actualItemsByGroup = (SETTINGS_NAV_GROUPS ?? []).map(itemsOf);
    expect(actualItemsByGroup.map((items) => items.length)).toEqual(EXPECTED_SETTINGS_NAV.map((group) => group.items.length));

    for (const [groupIndex, expectedGroup] of EXPECTED_SETTINGS_NAV.entries()) {
      const actualItems = actualItemsByGroup[groupIndex] ?? [];
      expect(actualItems.map(keyOf), `${expectedGroup.label} keys`).toEqual(expectedGroup.items.map((item) => item.key));
      expect(actualItems.map(labelOf), `${expectedGroup.label} labels`).toEqual(expectedGroup.items.map((item) => item.label));
      expect(actualItems.map(iconOf), `${expectedGroup.label} icons`).toEqual(expectedGroup.items.map((item) => item.icon));
      expect(actualItems.map((item) => item.highlight === true), `${expectedGroup.label} highlights`).toEqual(
        expectedGroup.items.map((item) => (item as { highlight?: boolean }).highlight === true),
      );
    }
  });

  it("uses unique locale-relative settings/account routes and i18n keys resolvable in all locales", async () => {
    const { SETTINGS_NAV_GROUPS } = await loadSettingsNavModule<{ SETTINGS_NAV_GROUPS?: Record<string, unknown>[] }>();
    const actualItems = (SETTINGS_NAV_GROUPS ?? []).flatMap(itemsOf);
    const routes = actualItems.map(routeOf);

    expect(new Set(routes).size, "Each settings subnav route must be unique").toBe(routes.length);
    for (const [index, route] of routes.entries()) {
      const key = keyOf(actualItems[index] ?? {});
      expect(route, `${key} route must be an internal app route`).toMatch(/^\/(settings|account)(\/|$)/);
      expect(route, `${key} route must not hard-code a locale prefix`).not.toMatch(/^\/(en|pl|uk|ro)(\/|$)/);
      expect(route, `${key} route must not be an external URL`).not.toMatch(/^https?:\/\//);
    }

    const keys = actualItems.map(i18nKeyOf);
    expect(new Set(keys).size, "Each settings subnav i18n key must be unique").toBe(keys.length);

    for (const locale of ["en", "pl", "uk", "ro"]) {
      const messages = loadLocale(locale);
      for (const key of keys) {
        expect(getByPath(messages, key), `${key} must resolve in ${locale}.json`).toEqual(expect.any(String));
      }
    }
  });

  it("maps every settings subnav route to a localized app page so authenticated clicks cannot land on 404", async () => {
    const { SETTINGS_NAV_GROUPS } = await loadSettingsNavModule<{ SETTINGS_NAV_GROUPS?: Record<string, unknown>[] }>();
    const pageRoots = collectLocalizedPageRoots();
    const missingRoutes = (SETTINGS_NAV_GROUPS ?? [])
      .flatMap(itemsOf)
      .filter((item) => !pageRoots.has(routeOf(item)))
      .map((item) => `${keyOf(item)}:${routeOf(item)}`);

    expect(
      missingRoutes,
      `Every SettingsSubNav item must have a localized apps/web/app/[locale]/(app)/.../page.tsx route; found routes: ${JSON.stringify([...pageRoots.keys()].sort())}`,
    ).toEqual([]);
  });

  it("keeps settings subnav item counts and permissions unset with documented RBAC todos", async () => {
    const { SETTINGS_NAV_GROUPS } = await loadSettingsNavModule<{ SETTINGS_NAV_GROUPS?: Record<string, unknown>[] }>();

    for (const item of (SETTINGS_NAV_GROUPS ?? []).flatMap(itemsOf)) {
      expect(item.count_slot, `${labelOf(item)} count_slot remains unimplemented in UI-128`).toBeNull();
      expect(item.permission_key, `${labelOf(item)} permission_key remains unimplemented in UI-128`).toBeNull();
      expect(item.rbac_todo, `${labelOf(item)} rbac_todo documents the future RBAC gate`).toEqual(expect.any(String));
      expect(String(item.rbac_todo).trim().length, `${labelOf(item)} rbac_todo must be non-empty`).toBeGreaterThan(0);
    }
  });
});
