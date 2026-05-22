import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = process.cwd().endsWith("/apps/web") ? process.cwd() : resolve(process.cwd(), "apps/web");
const navigationDir = resolve(appRoot, "lib/navigation");

const MODULE_IDS = [
  "foundation",
  "settings",
  "npd",
  "technical",
  "planning-basic",
  "warehouse",
  "scanner",
  "planning-ext",
  "production",
  "quality",
  "finance",
  "shipping",
  "reporting",
  "maintenance",
  "multi-site",
  "oee",
] as const;

const EXPECTED_NAV_GROUPS = [
  {
    label: "Core",
    items: [
      { label: "Dashboard", module_id: null, route: "/dashboard" },
      { label: "Settings", module_id: "settings", route: "/settings/profile" },
      { label: "Technical", module_id: "technical", route: "/technical" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Planning", module_id: "planning-basic", route: "/planning" },
      { label: "Scheduler", module_id: "planning-ext", route: "/scheduler" },
      { label: "Production", module_id: "production", route: "/production" },
      { label: "Warehouse", module_id: "warehouse", route: "/warehouse" },
    ],
  },
  {
    label: "QA & Shipping",
    items: [
      { label: "Quality", module_id: "quality", route: "/quality" },
      { label: "Shipping", module_id: "shipping", route: "/shipping" },
    ],
  },
  {
    label: "Premium",
    items: [
      { label: "NPD", module_id: "npd", route: "/npd" },
      { label: "Finance", module_id: "finance", route: "/finance" },
      { label: "OEE", module_id: "oee", route: "/oee" },
      { label: "Maintenance", module_id: "maintenance", route: "/maintenance" },
    ],
  },
  {
    label: "Analytics & Network",
    items: [
      { label: "Reporting", module_id: "reporting", route: "/reporting" },
      { label: "Multi-Site", module_id: "multi-site", route: "/multi-site" },
    ],
  },
] as const;

async function loadNavigationModule<T extends Record<string, unknown>>(fileName: string): Promise<T> {
  const filePath = resolve(navigationDir, fileName);
  expect(
    existsSync(filePath),
    `Expected UI-128 production navigation module to exist at ${filePath}`,
  ).toBe(true);
  return (await import(pathToFileURL(filePath).href)) as T;
}

function labelOf(groupOrItem: Record<string, unknown>): string {
  return String(groupOrItem.label ?? groupOrItem.title ?? groupOrItem.name ?? groupOrItem.id);
}

function iconOf(item: Record<string, unknown>): string | undefined {
  const value = item.icon ?? item.icon_token ?? item.ic;
  return typeof value === "string" ? value : undefined;
}

function moduleIdOf(item: Record<string, unknown>): string | null {
  const value = item.module_id ?? item.moduleId ?? item.module;
  return value == null ? null : String(value);
}

function i18nKeyOf(item: Record<string, unknown>): string {
  const value = item.i18n_key ?? item.i18nKey;
  expect(value, `Missing i18n key for sidebar item ${labelOf(item)}`).toBeTypeOf("string");
  return String(value);
}

function routeOf(item: Record<string, unknown>): string {
  const value = item.route ?? item.href ?? item.path;
  expect(value, `Missing route for sidebar item ${labelOf(item)}`).toBeTypeOf("string");
  return String(value);
}

function itemsOf(group: Record<string, unknown>): Record<string, unknown>[] {
  expect(Array.isArray(group.items), `Navigation group ${labelOf(group)} must expose items[]`).toBe(true);
  return group.items as Record<string, unknown>[];
}

function assertLocaleRelativeUniqueRoutes(items: Record<string, unknown>[]) {
  const routes = items.map(routeOf);
  expect(new Set(routes).size, "Each sidebar route must be unique").toBe(routes.length);

  for (const route of routes) {
    expect(route, `${route} must be an absolute app route`).toMatch(/^\//);
    expect(route, `${route} must not hard-code a locale prefix`).not.toMatch(/^\/(en|pl|uk|ro)(\/|$)/);
    expect(route, `${route} must not be an external URL`).not.toMatch(/^https?:\/\//);
  }
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

describe("UI-128 APP_MODULES", () => {
  it("contains the complete 16-module shell registry with explicit shell/nav decisions", async () => {
    const { APP_MODULES } = await loadNavigationModule<{ APP_MODULES?: Record<string, unknown>[] }>("module-registry.ts");

    expect(APP_MODULES, "APP_MODULES must be an array").toBeInstanceOf(Array);
    expect(APP_MODULES).toHaveLength(MODULE_IDS.length);
    expect(APP_MODULES?.map((module) => module.id)).toEqual(MODULE_IDS);

    for (const module of APP_MODULES ?? []) {
      expect(module.module_kind, `${module.id} must declare module_kind`).toBeTypeOf("string");
      expect(module.shell_kind, `${module.id} must declare shell_kind`).toBeTypeOf("string");
      expect(module.nav_exposure, `${module.id} must declare nav_exposure`).toBeTypeOf("string");
    }

    const byId = Object.fromEntries((APP_MODULES ?? []).map((module) => [module.id, module]));
    expect(byId.foundation).toMatchObject({ module_kind: "platform" });
    expect(byId.foundation?.nav_exposure, "foundation is platform-only and excluded from desktop sidebar").not.toBe(
      "desktop_sidebar",
    );
    expect(byId.scanner).toMatchObject({ shell_kind: "scanner" });
    expect(byId.scanner?.nav_exposure, "scanner uses scanner shell and is excluded from desktop sidebar").not.toBe(
      "desktop_sidebar",
    );
  });

  it("keeps count and permission gates unset while preserving future-RBAC todos", async () => {
    const { APP_MODULES } = await loadNavigationModule<{ APP_MODULES?: Record<string, unknown>[] }>("module-registry.ts");

    for (const module of APP_MODULES ?? []) {
      expect(module.count_slot, `${module.id}.count_slot remains unimplemented in UI-128`).toBeNull();
      expect(module.permission_key, `${module.id}.permission_key remains unimplemented in UI-128`).toBeNull();
      expect(module.rbac_todo, `${module.id}.rbac_todo documents the future RBAC gate`).toEqual(expect.any(String));
      expect(String(module.rbac_todo).trim().length, `${module.id}.rbac_todo must be non-empty`).toBeGreaterThan(0);
    }
  });
});

describe("UI-128 APP_NAV_GROUPS", () => {
  it("derives five ordered desktop sidebar groups with 15 items and explicit module coverage", async () => {
    const { APP_NAV_GROUPS } = await loadNavigationModule<{ APP_NAV_GROUPS?: Record<string, unknown>[] }>("app-nav.ts");

    expect(APP_NAV_GROUPS, "APP_NAV_GROUPS must be an array").toBeInstanceOf(Array);
    expect(APP_NAV_GROUPS).toHaveLength(EXPECTED_NAV_GROUPS.length);
    expect(APP_NAV_GROUPS?.map(labelOf)).toEqual(EXPECTED_NAV_GROUPS.map((group) => group.label));

    const actualItems = (APP_NAV_GROUPS ?? []).flatMap(itemsOf);
    expect(actualItems).toHaveLength(15);
    expect(actualItems.map(labelOf)).toEqual(EXPECTED_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label)));
    expect(actualItems.map(moduleIdOf)).toEqual(EXPECTED_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.module_id)));
    expect(actualItems.map(routeOf)).toEqual(EXPECTED_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.route)));
    expect(actualItems.map(moduleIdOf)).not.toContain("foundation");
    expect(actualItems.map(moduleIdOf)).not.toContain("scanner");
  });

  it("uses unique locale-relative routes and i18n keys resolvable in all locales", async () => {
    const { APP_NAV_GROUPS } = await loadNavigationModule<{ APP_NAV_GROUPS?: Record<string, unknown>[] }>("app-nav.ts");
    const actualItems = (APP_NAV_GROUPS ?? []).flatMap(itemsOf);

    assertLocaleRelativeUniqueRoutes(actualItems);

    const keys = actualItems.map(i18nKeyOf);
    expect(new Set(keys).size, "Each sidebar i18n key must be unique").toBe(keys.length);

    for (const locale of ["en", "pl", "uk", "ro"]) {
      const messages = loadLocale(locale);
      for (const key of keys) {
        expect(getByPath(messages, key), `${key} must resolve in ${locale}.json`).toEqual(expect.any(String));
      }
    }
  });

  it("keeps sidebar item counts and permissions unset with documented RBAC todos", async () => {
    const { APP_NAV_GROUPS } = await loadNavigationModule<{ APP_NAV_GROUPS?: Record<string, unknown>[] }>("app-nav.ts");

    for (const item of (APP_NAV_GROUPS ?? []).flatMap(itemsOf)) {
      expect(iconOf(item), `${labelOf(item)} must declare an icon token`).toEqual(expect.any(String));
      expect(item.count_slot, `${labelOf(item)} count_slot remains unimplemented in UI-128`).toBeNull();
      expect(item.permission_key, `${labelOf(item)} permission_key remains unimplemented in UI-128`).toBeNull();
      expect(item.rbac_todo, `${labelOf(item)} rbac_todo documents the future RBAC gate`).toEqual(expect.any(String));
      expect(String(item.rbac_todo).trim().length, `${labelOf(item)} rbac_todo must be non-empty`).toBeGreaterThan(0);
    }
  });
});
