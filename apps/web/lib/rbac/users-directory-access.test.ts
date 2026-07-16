import { describe, expect, it } from 'vitest';

import { USERS_DIRECTORY_ACCESS_PERMISSIONS } from './users-directory-access';

describe('USERS_DIRECTORY_ACCESS_PERMISSIONS (C004)', () => {
  it('requires elevated user-admin permissions and excludes read-only settings.users.view', () => {
    expect(USERS_DIRECTORY_ACCESS_PERMISSIONS).toContain('settings.users.manage');
    expect(USERS_DIRECTORY_ACCESS_PERMISSIONS).toContain('org.access.admin');
    expect(USERS_DIRECTORY_ACCESS_PERMISSIONS).not.toContain('settings.users.view');
  });
});
