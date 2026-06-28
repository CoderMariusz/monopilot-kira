import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const cwd = process.cwd();
const appRoot = existsSync(path.join(cwd, 'app'))
  ? path.join(cwd, 'app')
  : path.join(cwd, 'apps/web/app');
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';
const fromAppRoot = (relativePath: string) => path.join(appRoot, relativePath);
const routeUrl = (route: string) => new URL(route, baseURL).toString();

const finalRouteGroupLayouts = [
  '[locale]/(app)/layout.tsx',
  '[locale]/(auth)/layout.tsx',
  '[locale]/(scanner)/layout.tsx',
];

const requiredFinalRouteFiles = [
  '[locale]/(app)/page.tsx',
  '[locale]/(auth)/login/layout.tsx',
  '[locale]/(auth)/login/page.tsx',
  '[locale]/(auth)/login/forgot-password/page.tsx',
  '[locale]/(auth)/login/mfa/page.tsx',
  '[locale]/(auth)/login/_actions/auth.ts',
  '[locale]/(app)/(admin)/settings/users/page.tsx',
  '[locale]/(app)/(admin)/settings/users/users-screen.client.tsx',
  '[locale]/(app)/(admin)/settings/users/route-contract.test.ts',
  '[locale]/(app)/(admin)/settings/roles/page.tsx',
  '[locale]/(app)/(admin)/settings/invitations/page.tsx',
  '[locale]/(app)/(admin)/settings/schema/preview/page.tsx',
  '[locale]/(app)/(admin)/account/profile/page.tsx',
  '[locale]/(app)/(npd)/fg/[productCode]/page.tsx',
];

const conflictingOldLocaleRoutes = [
  '[locale]/page.tsx',
  '[locale]/login/layout.tsx',
  '[locale]/login/page.tsx',
  '[locale]/login/forgot-password/page.tsx',
  '[locale]/login/mfa/page.tsx',
  '[locale]/login/_actions/auth.ts',
  '[locale]/(admin)/settings/users/page.tsx',
  '[locale]/(admin)/settings/users/users-screen.client.tsx',
  '[locale]/(admin)/settings/users/route-contract.test.ts',
  '[locale]/(admin)/settings/roles/page.tsx',
  '[locale]/(admin)/settings/invitations/page.tsx',
  '[locale]/(admin)/settings/schema/preview/page.tsx',
  '[locale]/(admin)/account/profile/page.tsx',
];

// Structural consolidation (W4 / TASK-000563): the non-localized
// (admin)/settings/** full-page duplicates were eliminated or reduced to redirect
// shims; the canonical browser-visible screens live under
// [locale]/(app)/(admin)/settings/**. Any non-localized settings route that still
// exists must remain a redirect/shim only and never re-embed the duplicate UI.
const legacyShimOnlyRoutes = [
  {
    path: '(admin)/settings/users/page.tsx',
    forbiddenUiToken: 'SettingsUsersScreen',
  },
  {
    path: '(admin)/settings/security/page.tsx',
    forbiddenUiToken: 'SecurityScreen',
  },
  {
    path: '(npd)/fa/[productCode]/page.tsx',
    forbiddenUiToken: 'FaTabs',
  },
];

const preservedSpecialRouteFiles = [
  '(auth)/actions.ts',
  '(settings)/schema/_actions/draft.ts',
  'onboarding/profile/page.tsx',
  'onboarding/product/page.tsx',
  'onboarding/location/page.tsx',
  'onboarding/warehouse/page.tsx',
  'onboarding/workorder/page.tsx',
  'onboarding/complete/page.tsx',
  'onboarding/in-progress/page.tsx',
];

const canonicalUrlStatusBaseline = [
  { route: '/en', expectedStatus: 200, expectedFinalPath: '/en' },
  { route: '/en/login', expectedStatus: 200, expectedFinalPath: '/en/login' },
  { route: '/en/login/forgot-password', expectedStatus: 200, expectedFinalPath: '/en/login/forgot-password' },
  { route: '/en/login/mfa?factorId=route-topology', expectedStatus: 200, expectedFinalPath: '/en/login/mfa' },
  { route: '/en/settings/users', expectedStatus: 200, expectedFinalPath: '/en/settings/users' },
  { route: '/settings/users', expectedStatus: 200, expectedFinalPath: '/en/settings/users' },
  { route: '/en/settings/roles', expectedStatus: 200, expectedFinalPath: '/en/settings/roles' },
  { route: '/settings/roles', expectedStatus: 200, expectedFinalPath: '/en/settings/roles' },
  { route: '/en/settings/invitations', expectedStatus: 200, expectedFinalPath: '/en/settings/invitations' },
  { route: '/settings/invitations', expectedStatus: 200, expectedFinalPath: '/en/settings/invitations' },
  { route: '/en/settings/schema/preview', expectedStatus: 200, expectedFinalPath: '/en/settings/schema/preview' },
  { route: '/settings/schema/preview', expectedStatus: 200, expectedFinalPath: '/en/settings/schema/preview' },
  { route: '/en/account/profile', expectedStatus: 200, expectedFinalPath: '/en/account/profile' },
  { route: '/account/profile', expectedStatus: 200, expectedFinalPath: '/en/account/profile' },
];

test.describe('T-133 route topology contract', () => {
  test('final route groups are pass-through single sources and do not leave duplicate UI trees', () => {
    for (const relativePath of finalRouteGroupLayouts) {
      const absolutePath = fromAppRoot(relativePath);
      expect.soft(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
      if (!existsSync(absolutePath)) continue;
      const source = readFileSync(absolutePath, 'utf8');
      expect.soft(source.slice(0, 500), `${relativePath} header names TASK-000563`).toContain('TASK-000563');
      expect.soft(source.slice(0, 500), `${relativePath} header names follow-ons`).toMatch(/follow-?on|UI-131|T-134|ScannerFrame|AppShell/i);
      expect.soft(source, `${relativePath} remains a pass-through layout`).toMatch(/\{children\}|children/);
    }

    for (const relativePath of requiredFinalRouteFiles) {
      expect.soft(existsSync(fromAppRoot(relativePath)), `${relativePath} must be the final route source`).toBe(true);
    }

    for (const relativePath of conflictingOldLocaleRoutes) {
      expect.soft(existsSync(fromAppRoot(relativePath)), `${relativePath} must move out of the old locale topology`).toBe(false);
    }

    for (const route of legacyShimOnlyRoutes) {
      const absolutePath = fromAppRoot(route.path);
      if (!existsSync(absolutePath)) continue;
      const source = readFileSync(absolutePath, 'utf8');
      expect.soft(source, `${route.path} may remain only as a redirect/shim, not a duplicate UI implementation`).not.toContain(route.forbiddenUiToken);
    }

    expect.soft(existsSync(fromAppRoot('[locale]/(app)/(settings)')), 'do not introduce a parallel [locale]/(app)/(settings) settings UI tree').toBe(false);

    for (const relativePath of preservedSpecialRouteFiles) {
      expect.soft(existsSync(fromAppRoot(relativePath)), `${relativePath} must be preserved during the topology refactor`).toBe(true);
    }
  });

  for (const contract of canonicalUrlStatusBaseline) {
    test(`${contract.route} keeps the captured status/top-level redirect contract`, async ({ request }) => {
      const response = await request.get(routeUrl(contract.route), { maxRedirects: 10 });
      expect(response.status(), `${contract.route} status must match the pre-refactor baseline`).toBe(contract.expectedStatus);
      expect(new URL(response.url()).pathname, `${contract.route} final pathname must match the pre-refactor baseline`).toBe(contract.expectedFinalPath);
    });
  }
});
