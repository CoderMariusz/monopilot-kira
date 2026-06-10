import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_NAV_GROUPS } from '../app-nav';
import { APP_MODULES } from '../module-registry';
import { SETTINGS_NAV_GROUPS } from '../settings-nav';

type NavItem = {
  key: string;
  route: string;
  i18n_key: string;
  count_slot: null;
  permission_key: string | null;
  rbac_todo: string;
};

type MessageTree = Record<string, unknown>;

const locales = ['en', 'pl', 'uk', 'ro'] as const;
const i18nDir = path.resolve(process.cwd(), 'i18n');
const expectedModulePermissionKeys = {
  foundation: null,
  settings: 'settings.org.read',
  npd: 'npd.dashboard.view',
  technical: 'technical.sensory.read',
  'planning-basic': 'scheduler.run.read',
  warehouse: 'warehouse.inventory.read',
  scanner: 'warehouse.inventory.read',
  'planning-ext': 'scheduler.run.read',
  production: 'production.oee.read',
  quality: 'quality.dashboard.view',
  finance: 'fin.costs.read',
  shipping: 'ship.dashboard.view',
  reporting: 'rpt.dashboard.view',
  maintenance: 'mnt.asset.read',
  'multi-site': 'multi_site.site.view',
  oee: 'oee.dashboard.read',
} as const;

function loadMessages(locale: (typeof locales)[number]): MessageTree {
  return JSON.parse(readFileSync(path.join(i18nDir, `${locale}.json`), 'utf8')) as MessageTree;
}

function readPath(root: MessageTree, dottedPath: string) {
  return dottedPath.split('.').reduce<unknown>((node, key) => {
    if (node && typeof node === 'object' && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, root);
}

function expectI18nResolves(i18nKey: string) {
  for (const locale of locales) {
    const value = readPath(loadMessages(locale), i18nKey);
    expect(typeof value, `${i18nKey} must resolve in ${locale}.json`).toBe('string');
    expect((value as string).trim(), `${i18nKey} in ${locale}.json must be non-empty`).not.toBe('');
  }
}

function expectLocaleRelativeRoute(route: string, label: string) {
  expect(route, `${label} route must be app-relative`).toMatch(/^\//);
  expect(route, `${label} route must not be locale-prefixed in the manifest`).not.toMatch(/^\/(en|pl|uk|ro)(\/|$)/);
}

function expectUnique(values: string[], label: string) {
  expect(new Set(values).size, `${label} must be unique`).toBe(values.length);
}

function expectDeferredRbac(item: NavItem, label: string) {
  expect(item.count_slot, `${label} count_slot must stay null until live counters land`).toBeNull();
  expect(item.permission_key, `${label} permission_key remains deferred here`).toBeNull();
  expect(item.rbac_todo?.trim(), `${label} rbac_todo must document the deferred RBAC gate`).not.toBe('');
}

describe('T-135 navigation manifest integrity contracts', () => {
  it('keeps APP_MODULES as the 16-module matrix and APP_NAV_GROUPS as 15 locale-relative sidebar items', () => {
    // brief §3 Luka C/F: desktop sidebar routes must come from one manifest and exclude scanner/platform routes.
    const expectedModuleIds = [
      'foundation',
      'settings',
      'npd',
      'technical',
      'planning-basic',
      'warehouse',
      'scanner',
      'planning-ext',
      'production',
      'quality',
      'finance',
      'shipping',
      'reporting',
      'maintenance',
      'multi-site',
      'oee',
    ];
    const appItems = APP_NAV_GROUPS.flatMap((group) => group.items);

    expect(APP_MODULES.map((module) => module.id)).toEqual(expectedModuleIds);
    expect(APP_MODULES).toHaveLength(16);
    expect(APP_NAV_GROUPS).toHaveLength(5);
    expect(appItems).toHaveLength(15);
    expectUnique(APP_MODULES.map((module) => module.id), 'APP_MODULES ids');
    expectUnique(APP_NAV_GROUPS.map((group) => group.id), 'APP_NAV_GROUPS ids');
    expectUnique(appItems.map((item) => item.key), 'APP_NAV_GROUPS item keys');
    expectUnique(appItems.map((item) => item.route), 'APP_NAV_GROUPS item routes');

    const scannerModule = APP_MODULES.find((module) => module.id === 'scanner');
    expect(scannerModule).toMatchObject({ shell_kind: 'scanner', nav_exposure: 'excluded', route: null });
    expect(appItems.some((item) => item.key === 'scanner' || item.module_id === 'scanner')).toBe(false);

    for (const group of APP_NAV_GROUPS) {
      expectI18nResolves(group.i18n_key);
      for (const item of group.items) {
        expectLocaleRelativeRoute(item.route, `APP_NAV_GROUPS.${item.key}`);
        expectI18nResolves(item.i18n_key);
        expect(item.count_slot, `APP_NAV_GROUPS.${item.key} count_slot must stay null until live counters land`).toBeNull();
        expect(item.permission_key, `APP_NAV_GROUPS.${item.key} permission_key must pass through from APP_MODULES`).toBe(
          item.module_id === null ? null : expectedModulePermissionKeys[item.module_id],
        );
        expect(item.rbac_todo?.trim(), `APP_NAV_GROUPS.${item.key} rbac_todo must document the deferred RBAC gate`).not.toBe('');
      }
    }

    for (const module of APP_MODULES) {
      expectI18nResolves(module.i18n_key);
      if (module.route !== null) {
        expectLocaleRelativeRoute(module.route, `APP_MODULES.${module.id}`);
      }
      expect(module.count_slot, `APP_MODULES.${module.id} count_slot must be null`).toBeNull();
      expect(module.permission_key, `APP_MODULES.${module.id} permission_key must match the enum-backed module gate`).toBe(
        expectedModulePermissionKeys[module.id],
      );
      expect(module.rbac_todo.trim(), `APP_MODULES.${module.id} rbac_todo must be populated`).not.toBe('');
    }
  });

  it('keeps SETTINGS_NAV_GROUPS unique, locale-relative, translated in en/pl/uk/ro, and visibly RBAC-deferred', () => {
    // brief §7 risk: settings navigation looks complete before T-130; no item may silently gain a permission gate.
    const settingsItems = SETTINGS_NAV_GROUPS.flatMap((group) => group.items);

    expect(SETTINGS_NAV_GROUPS.length, 'settings nav should expose the full settings group matrix').toBeGreaterThanOrEqual(8);
    expect(settingsItems.length, 'settings nav should expose the full settings item matrix').toBeGreaterThan(20);
    expectUnique(SETTINGS_NAV_GROUPS.map((group) => group.id), 'SETTINGS_NAV_GROUPS ids');
    expectUnique(settingsItems.map((item) => item.key), 'SETTINGS_NAV_GROUPS item keys');
    expectUnique(settingsItems.map((item) => item.route), 'SETTINGS_NAV_GROUPS routes');

    for (const group of SETTINGS_NAV_GROUPS) {
      expectI18nResolves(group.i18n_key);
      for (const item of group.items) {
        expectLocaleRelativeRoute(item.route, `SETTINGS_NAV_GROUPS.${item.key}`);
        expectI18nResolves(item.i18n_key);
        expectDeferredRbac(item, `SETTINGS_NAV_GROUPS.${item.key}`);
      }
    }
  });
});
