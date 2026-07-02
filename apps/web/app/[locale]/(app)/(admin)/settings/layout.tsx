import type { ReactNode } from 'react';

import { SettingsSubNav } from '../../../../../components/shell/settings-subnav';
import { hasAnyPermission } from '../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import {
  SETTINGS_ADMIN_NAV_PERMISSIONS,
  SETTINGS_NAV_GROUPS,
  filterSettingsNavGroups,
} from '../../../../../lib/navigation/settings-nav';

type SettingsLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

/**
 * F2-C1 — server-side settings-nav RBAC gate.
 *
 * Probes the caller once (settings.org.read / settings.org.update /
 * org.access.admin, with platform-admin bypass inside hasAnyPermission) and
 * hides every admin (org-configuration) nav group from users who cannot open
 * those pages. The gate runs in the Server Component so filtered links never
 * reach the client — a permission-less user cannot even see the link. Any
 * auth/session failure fails CLOSED to the caller-only (My account) groups.
 */
async function resolveAdminSettingsAccess(): Promise<boolean> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      return hasAnyPermission({ client: queryClient, userId, orgId }, [...SETTINGS_ADMIN_NAV_PERMISSIONS]);
    });
  } catch {
    return false;
  }
}

export default async function SettingsLayout({ children, params }: SettingsLayoutProps) {
  const [{ locale }, canViewAdminSettings] = await Promise.all([params, resolveAdminSettingsAccess()]);
  const groups = filterSettingsNavGroups(SETTINGS_NAV_GROUPS, { canViewAdminSettings });

  return (
    <div
      data-testid="settings-layout"
      className="grid min-h-full bg-slate-50"
      style={{ gridTemplateColumns: 'var(--shell-subnav-w) minmax(0, 1fr)' }}
    >
      <SettingsSubNav locale={locale} groups={groups} />
      <main data-testid="settings-main" className="min-w-0 overflow-auto px-8 py-6">
        {children}
      </main>
    </div>
  );
}
