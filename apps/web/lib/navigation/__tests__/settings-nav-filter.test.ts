import { describe, expect, it } from 'vitest';

import {
  SETTINGS_ADMIN_NAV_PERMISSIONS,
  SETTINGS_NAV_GROUPS,
  filterSettingsNavGroups,
} from '../settings-nav';

describe('F2-C1 filterSettingsNavGroups (server-side settings-nav RBAC gate)', () => {
  it('hides every admin (org-configuration) group from a caller without settings access', () => {
    const visible = filterSettingsNavGroups(SETTINGS_NAV_GROUPS, { canViewAdminSettings: false });

    // No admin group survives — only the caller-only (My account) group(s).
    expect(visible.every((group) => group.admin === false)).toBe(true);
    expect(visible.map((group) => group.id)).toContain('myAccount');
    // Admin groups like Access (users) / Admin are gone.
    expect(visible.map((group) => group.id)).not.toContain('access');
    expect(visible.map((group) => group.id)).not.toContain('admin');
  });

  it('shows the full manifest to a caller who can view org settings', () => {
    const visible = filterSettingsNavGroups(SETTINGS_NAV_GROUPS, { canViewAdminSettings: true });

    expect(visible).toHaveLength(SETTINGS_NAV_GROUPS.length);
    expect(visible.map((group) => group.id)).toEqual(SETTINGS_NAV_GROUPS.map((group) => group.id));
  });

  it('always keeps the non-admin My account group regardless of access', () => {
    for (const canViewAdminSettings of [true, false]) {
      const visible = filterSettingsNavGroups(SETTINGS_NAV_GROUPS, { canViewAdminSettings });
      expect(visible.some((group) => group.id === 'myAccount')).toBe(true);
    }
  });

  it('never mutates the source manifest', () => {
    const before = SETTINGS_NAV_GROUPS.length;
    filterSettingsNavGroups(SETTINGS_NAV_GROUPS, { canViewAdminSettings: false });
    expect(SETTINGS_NAV_GROUPS).toHaveLength(before);
    // The frozen contract: static nav items stay ungated (permission_key null).
    for (const group of SETTINGS_NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.permission_key).toBeNull();
      }
    }
  });

  it('gates on org-settings read/update/admin permissions (mirrors the pages)', () => {
    // The admin gate probes these permission strings — same grants the settings
    // pages themselves enforce server-side.
    expect(SETTINGS_ADMIN_NAV_PERMISSIONS).toContain('settings.org.read');
    expect(SETTINGS_ADMIN_NAV_PERMISSIONS).toContain('settings.org.update');
    expect(SETTINGS_ADMIN_NAV_PERMISSIONS).toContain('org.access.admin');
  });
});
