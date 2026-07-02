import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS } from '../../../../packages/rbac/src/permissions.enum';

import {
  ENFORCED_PERMISSIONS,
  ENFORCED_PERMISSIONS_LIST,
  isEnforcedPermission,
} from './enforced-permissions';

describe('enforced-permissions', () => {
  it('exports a non-empty sorted list backed by a Set', () => {
    expect(ENFORCED_PERMISSIONS_LIST.length).toBeGreaterThan(40);
    expect(ENFORCED_PERMISSIONS.size).toBe(ENFORCED_PERMISSIONS_LIST.length);
    const sorted = [...ENFORCED_PERMISSIONS_LIST].sort();
    expect([...ENFORCED_PERMISSIONS_LIST]).toEqual(sorted);
  });

  it('only contains catalog permissions', () => {
    const catalog = new Set(ALL_PERMISSIONS);
    for (const permission of ENFORCED_PERMISSIONS_LIST) {
      expect(catalog.has(permission)).toBe(true);
    }
  });

  it('isEnforcedPermission mirrors Set membership', () => {
    expect(isEnforcedPermission('settings.org.read')).toBe(true);
    expect(isEnforcedPermission('settings.scim.view')).toBe(false);
  });

  it('includes known enforced permissions from representative check sites', () => {
    expect(ENFORCED_PERMISSIONS.has('settings.org.read')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('production.wo.start')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('npd.pilot.read')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('settings.onboarding.complete')).toBe(true);
  });

  it('excludes permissions only referenced in tests or unenforced seeds', () => {
    expect(ENFORCED_PERMISSIONS.has('settings.scim.view')).toBe(false);
    expect(ENFORCED_PERMISSIONS.has('production.wo.release')).toBe(false);
    expect(ENFORCED_PERMISSIONS.has('warehouse.lp.adjust')).toBe(false);
    expect(ENFORCED_PERMISSIONS.has('quality.ncr.close')).toBe(false);
  });

  it('settings.users.create is NOT in the set (UI-only gate; real server action uses settings.users.invite)', () => {
    // settings.users.create only appears in a page.tsx visibility check; the
    // create-user-with-password Server Action gates on settings.users.invite instead.
    expect(ENFORCED_PERMISSIONS.has('settings.users.create')).toBe(false);
  });

  it('settings.users.invite IS in the set (server gate: create-user-with-password.ts:36)', () => {
    expect(ENFORCED_PERMISSIONS.has('settings.users.invite')).toBe(true);
  });

  it('settings.users.deactivate IS in the set (server gate: deactivate.ts requireAnyPermission OR-list — wave F3 G2)', () => {
    expect(ENFORCED_PERMISSIONS.has('settings.users.deactivate')).toBe(true);
  });
});
