/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { USERS_DIRECTORY_ACCESS_PERMISSIONS } from '../../../../../../lib/rbac/users-directory-access';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWER_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN_USER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const hasAnyPermissionMock = vi.fn();
const withOrgContextMock = vi.fn();

vi.mock('../../../../../../lib/auth/has-permission', () => ({
  hasAnyPermission: (...args: unknown[]) => hasAnyPermissionMock(...args),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) => withOrgContextMock(action),
}));

vi.mock('../../../../../../actions/users/invite', () => ({ inviteUser: vi.fn() }));
vi.mock('../../../../../../actions/users/assign-role', () => ({ assignRole: vi.fn() }));
vi.mock('../../../../../../actions/users/assign-user-sites', () => ({ assignUserSites: vi.fn() }));
vi.mock('../../../../../../actions/users/create-user-with-password', () => ({ createUserWithPassword: vi.fn() }));
vi.mock('../../../../../../actions/users/deactivate', () => ({ deactivateUser: vi.fn() }));
vi.mock('../../../../../../actions/users/reactivate', () => ({ reactivateUser: vi.fn() }));
vi.mock('../../../../../../actions/users/reset-user-mfa', () => ({ resetUserMfa: vi.fn() }));
vi.mock('../../../../../../actions/users/reset-password', () => ({ resetPassword: vi.fn() }));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => {
    const t = (key: string) => key;
    (t as { has: (key: string) => boolean }).has = () => false;
    return t;
  }),
}));

describe('settings/users page RBAC (C004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    withOrgContextMock.mockImplementation(async (action) =>
      action({
        userId: VIEWER_USER_ID,
        orgId: ORG_ID,
        client: { query: vi.fn().mockResolvedValue({ rows: [] }) },
      }),
    );
  });

  it('does not treat settings.users.view alone as directory access', () => {
    expect(USERS_DIRECTORY_ACCESS_PERMISSIONS).not.toContain('settings.users.view');
    expect(USERS_DIRECTORY_ACCESS_PERMISSIONS).toContain('settings.users.manage');
  });

  it('blocks a Viewer who only holds settings.users.view from loading the users directory', async () => {
    hasAnyPermissionMock.mockImplementation(async (_ctx, permissions: string[]) => {
      const allowed = new Set(permissions);
      return allowed.has('settings.users.view');
    });

    const pageModule = await import('./page');
    const element = await pageModule.default({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    expect(hasAnyPermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VIEWER_USER_ID, orgId: ORG_ID }),
      [...USERS_DIRECTORY_ACCESS_PERMISSIONS],
    );

    render(element as React.ReactElement);
    expect(screen.getByRole('alert')).toHaveTextContent('permission_denied');
  });

  it('allows an admin with settings.users.manage to load the users directory', async () => {
    hasAnyPermissionMock.mockImplementation(async (_ctx, permissions: string[]) => {
      const allowed = new Set(permissions);
      if (allowed.has('settings.users.manage')) return true;
      if (allowed.has('settings.users.invite')) return false;
      if (allowed.has('settings.roles.assign')) return false;
      if (allowed.has('org.access.admin')) return false;
      if (allowed.has('settings.users.deactivate')) return false;
      return false;
    });

    withOrgContextMock.mockImplementation(async (action) =>
      action({
        userId: ADMIN_USER_ID,
        orgId: ORG_ID,
        client: {
          query: vi.fn(async (sql: string) => {
            const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
            if (normalized.includes('from public.roles r')) {
              return { rows: [{ id: 'role-admin', code: 'admin', name: 'Admin', permissions_json: [], permissions: [] }] };
            }
            if (normalized.includes('from public.users u')) {
              return { rows: [] };
            }
            if (normalized.includes('from public.organizations o') && normalized.includes('count(*)')) {
              return { rows: [{ active_users: 0, invited_users: 0, disabled_users: 0, seat_limit: null }] };
            }
            if (normalized.includes('from public.sites')) {
              return { rows: [] };
            }
            if (normalized.includes('from public.user_sites us')) {
              return { rows: [] };
            }
            return { rows: [] };
          }),
        },
      }),
    );

    const pageModule = await import('./page');
    const element = await pageModule.default({
      params: Promise.resolve({ locale: 'en' }),
      searchParams: Promise.resolve({}),
    });

    render(element as React.ReactElement);
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
