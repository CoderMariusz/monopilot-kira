/**
 * Shell gap #2 — pure RBAC nav-filter contract.
 *
 * Verifies the permission gate that the (app) shell layout applies to the
 * sidebar. Pure function, no DB / React — exercises the defensive null-key rule,
 * the admin short-circuit, and group pruning.
 */
import { describe, expect, it } from "vitest";

import { APP_NAV_GROUPS } from "../app-nav";
import {
  canSeeNavItem,
  filterNavGroupsByPermissions,
  type NavPermissionContext,
} from "../filter-nav";
import type { AppNavGroup, AppSidebarNavItem } from "../types";

function item(overrides: Partial<AppSidebarNavItem>): AppSidebarNavItem {
  return {
    key: "k",
    label: "L",
    i18n_key: "Navigation.app.items.k",
    route: "/k",
    icon_token: "x",
    module_id: null,
    count_slot: null,
    permission_key: null,
    rbac_todo: "todo",
    ...overrides,
  } as AppSidebarNavItem;
}

function group(id: string, items: AppSidebarNavItem[]): AppNavGroup {
  return { id: id as AppNavGroup["id"], label: id, i18n_key: `g.${id}`, items };
}

const NO_PERMS: NavPermissionContext = { permissions: new Set(), isAdmin: false };

describe("canSeeNavItem", () => {
  it("shows an ungated item (permission_key=null) to a user with no permissions", () => {
    expect(canSeeNavItem(item({ permission_key: null }), NO_PERMS)).toBe(true);
  });

  it("hides a gated item the user lacks", () => {
    expect(
      canSeeNavItem(item({ permission_key: "finance.read" as AppSidebarNavItem["permission_key"] }), NO_PERMS),
    ).toBe(false);
  });

  it("shows a gated item the user holds", () => {
    const ctx: NavPermissionContext = { permissions: new Set(["finance.read"]), isAdmin: false };
    expect(canSeeNavItem(item({ permission_key: "finance.read" as AppSidebarNavItem["permission_key"] }), ctx)).toBe(true);
  });

  it("shows every item to an admin regardless of keys", () => {
    const admin: NavPermissionContext = { permissions: new Set(), isAdmin: true };
    expect(canSeeNavItem(item({ permission_key: "finance.read" as AppSidebarNavItem["permission_key"] }), admin)).toBe(true);
  });
});

describe("filterNavGroupsByPermissions", () => {
  it("on the live registry, a permission-less non-admin keeps only ungated (null-key) items", () => {
    // The RBAC lane has backfilled permission_key on the module registry, so a
    // user with no permissions now sees ONLY the items whose permission_key is
    // null (e.g. the Dashboard) — every keyed module is gated out. This proves
    // the gate is wired against the real manifest, not a fixture.
    const result = filterNavGroupsByPermissions(APP_NAV_GROUPS, NO_PERMS);
    const visible = result.flatMap((g) => g.items);
    const totalIn = APP_NAV_GROUPS.flatMap((g) => g.items).length;

    // Strictly fewer than the full set (gating is actually happening)...
    expect(visible.length).toBeLessThan(totalIn);
    // ...and every surviving item is an ungated one.
    expect(visible.every((i) => i.permission_key == null)).toBe(true);
    // Dashboard (null key) survives.
    expect(visible.some((i) => i.key === "dashboard")).toBe(true);
  });

  it("on the live registry, an admin sees every sidebar item", () => {
    const result = filterNavGroupsByPermissions(APP_NAV_GROUPS, { permissions: new Set(), isAdmin: true });
    const totalIn = APP_NAV_GROUPS.flatMap((g) => g.items).length;
    expect(result.flatMap((g) => g.items)).toHaveLength(totalIn);
    expect(result).toHaveLength(APP_NAV_GROUPS.length);
  });

  it("on the live registry, granting a module's key reveals exactly that module", () => {
    const ctx: NavPermissionContext = { permissions: new Set(["fin.costs.read"]), isAdmin: false };
    const visible = filterNavGroupsByPermissions(APP_NAV_GROUPS, ctx).flatMap((g) => g.items);
    expect(visible.some((i) => i.key === "finance")).toBe(true);
    // A module the user was NOT granted stays hidden.
    expect(visible.some((i) => i.key === "quality")).toBe(false);
  });

  it("on the live registry, yard.manage reveals the Yard route only to permitted users", () => {
    const withYard = filterNavGroupsByPermissions(APP_NAV_GROUPS, {
      permissions: new Set(["yard.manage"]),
      isAdmin: false,
    }).flatMap((g) => g.items);
    const withoutYard = filterNavGroupsByPermissions(APP_NAV_GROUPS, NO_PERMS).flatMap((g) => g.items);

    expect(withYard.some((i) => i.key === "yard" && i.route === "/yard")).toBe(true);
    expect(withoutYard.some((i) => i.key === "yard" || i.route === "/yard")).toBe(false);
  });

  it("on the live registry, freight.manage reveals the Freight route only to permitted users", () => {
    const withFreight = filterNavGroupsByPermissions(APP_NAV_GROUPS, {
      permissions: new Set(["freight.manage"]),
      isAdmin: false,
    }).flatMap((g) => g.items);
    const withoutFreight = filterNavGroupsByPermissions(APP_NAV_GROUPS, NO_PERMS).flatMap((g) => g.items);

    expect(withFreight.some((i) => i.key === "freight" && i.route === "/planning/carriers")).toBe(true);
    expect(withoutFreight.some((i) => i.key === "freight" || i.route === "/planning/carriers")).toBe(false);
  });

  it("drops gated items the user lacks but keeps ungated siblings", () => {
    const groups = [
      group("core", [item({ key: "dash", permission_key: null }), item({ key: "fin", permission_key: "finance.read" as AppSidebarNavItem["permission_key"] })]),
    ];
    const result = filterNavGroupsByPermissions(groups, NO_PERMS);
    expect(result[0].items.map((i) => i.key)).toEqual(["dash"]);
  });

  it("removes a group entirely when all its items are gated-out", () => {
    const groups = [
      group("a", [item({ key: "x", permission_key: "x.read" as AppSidebarNavItem["permission_key"] })]),
      group("b", [item({ key: "y", permission_key: null })]),
    ];
    const result = filterNavGroupsByPermissions(groups, NO_PERMS);
    expect(result.map((g) => g.id)).toEqual(["b"]);
  });

  it("admin sees all gated items", () => {
    const groups = [
      group("a", [item({ key: "x", permission_key: "x.read" as AppSidebarNavItem["permission_key"] }), item({ key: "y", permission_key: "y.read" as AppSidebarNavItem["permission_key"] })]),
    ];
    const result = filterNavGroupsByPermissions(groups, { permissions: new Set(), isAdmin: true });
    expect(result[0].items.map((i) => i.key)).toEqual(["x", "y"]);
  });

  it("does not mutate the input groups", () => {
    const groups = [group("a", [item({ key: "x", permission_key: "x.read" as AppSidebarNavItem["permission_key"] })])];
    const before = groups[0].items.length;
    filterNavGroupsByPermissions(groups, NO_PERMS);
    expect(groups[0].items.length).toBe(before);
  });
});
