/**
 * B4 admin/settings production-honesty guards.
 *
 * Static-source assertions that the production Wave 7/8 admin/settings pages
 * do not silently ship seeded fixture fallbacks (defaultRoles, defaultPolicies,
 * defaultOperations) and do not import workspace UI primitives via deep
 * relative `packages/ui/src/*` paths.
 *
 * Runs in the root node-env vitest config (no JSX, no jsdom).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const settingsRoot = resolve(__dirname, '..');
const appRoot = resolve(__dirname, '../../..'); // apps/web/app

// Structural consolidation (Class E): the canonical Roles & Authorization
// screens now live in the localized tree under
// `app/[locale]/(app)/(admin)/settings/**`. These guards follow the real source
// of truth instead of the retired non-localized duplicates.
const CANONICAL_PATHS: Record<string, string> = {
  'roles/page.tsx': resolve(appRoot, '[locale]/(app)/(admin)/settings/roles/roles-screen.client.tsx'),
  'authorization/page.tsx': resolve(appRoot, '[locale]/(app)/(admin)/settings/authorization/page.tsx'),
};

function read(relativePath: string): string {
  const canonical = CANONICAL_PATHS[relativePath];
  return readFileSync(canonical ?? resolve(settingsRoot, relativePath), 'utf8');
}

const SETTINGS_PAGES = [
  'roles/page.tsx',
  'authorization/page.tsx',
  'reference/manufacturing-operations/page.tsx',
  'users/page.tsx',
  'invitations/page.tsx',
  'security/page.tsx',
] as const;

describe('admin/settings no relative packages/ui imports', () => {
  for (const page of SETTINGS_PAGES) {
    it(`${page} resolves @monopilot/ui via workspace alias only`, () => {
      const source = read(page);
      expect(source, `${page} must not import workspace UI via deep relative path`).not.toMatch(
        /from\s+['"][./]+packages\/ui\/src\//,
      );
    });
  }
});

describe('admin/settings no production fixture defaults', () => {
  // Names that previously seeded fake tenant data in production paths.
  // If a future refactor reintroduces them, this guard fails so reviewers
  // catch the regression before it ships.
  const forbiddenIdentifiers: Array<{ page: (typeof SETTINGS_PAGES)[number]; identifiers: RegExp[] }> = [
    {
      page: 'roles/page.tsx',
      identifiers: [
        /\bconst\s+defaultRoles\b/,
        /\bconst\s+defaultNpdPermissions\b/,
        /\bconst\s+defaultPermissionsByRole\b/,
        /\bconst\s+defaultAssignableUsers\b/,
      ],
    },
    {
      page: 'authorization/page.tsx',
      identifiers: [/\bconst\s+defaultPolicies\b/],
    },
    {
      page: 'reference/manufacturing-operations/page.tsx',
      identifiers: [/\bconst\s+defaultOperations\b/],
    },
  ];

  for (const { page, identifiers } of forbiddenIdentifiers) {
    for (const identifier of identifiers) {
      it(`${page} does not declare ${identifier.source}`, () => {
        const source = read(page);
        expect(source, `${page} must not declare ${identifier.source}`).not.toMatch(identifier);
      });
    }
  }

  it('roles/page.tsx renders an unavailable-state alert when no roles data is wired', () => {
    const source = read('roles/page.tsx');
    expect(source).toMatch(/settings-roles-unavailable/);
    expect(source).toMatch(/props\.roles === undefined/);
  });

  it('authorization/page.tsx renders an unavailable-state alert when no policies data is wired', () => {
    const source = read('authorization/page.tsx');
    expect(source).toMatch(/settings-authorization-unavailable/);
    expect(source).toMatch(/policiesNotWired/);
  });

  it('manufacturing-operations/page.tsx renders an unavailable-state alert when operations data is not wired', () => {
    const source = read('reference/manufacturing-operations/page.tsx');
    expect(source).toMatch(/settings-manufacturing-operations-unavailable/);
    expect(source).toMatch(/operationsUnavailable/);
  });
});

describe('settings roles/authorization read REAL Supabase data (no FALLBACK fixtures)', () => {
  // The canonical localized server loaders for SET-011 / SET-011b. These read
  // org-scoped data via withOrgContext and MUST NOT fall back to seed/fixture
  // arrays when the DB returns empty (honest empty/missing-seed/error states).
  const rolesServerLoader = resolve(
    appRoot,
    '[locale]/(app)/(admin)/settings/roles/page.tsx',
  );
  const authorizationServerLoader = resolve(
    appRoot,
    '[locale]/(app)/(admin)/settings/authorization/page.tsx',
  );
  const rolesScreen = resolve(
    appRoot,
    '[locale]/(app)/(admin)/settings/roles/roles-screen.client.tsx',
  );

  it('roles canonical loader + screen carry no FALLBACK_* fixture arrays and read via withOrgContext', () => {
    const loader = readFileSync(rolesServerLoader, 'utf8');
    const screen = readFileSync(rolesScreen, 'utf8');
    expect(loader, 'roles loader must not seed FALLBACK_ROLES').not.toMatch(/\bFALLBACK_ROLES\b/);
    expect(loader, 'roles loader must not seed FALLBACK_USERS').not.toMatch(/\bFALLBACK_USERS\b/);
    expect(loader, 'roles loader must read real data via withOrgContext').toMatch(/withOrgContext/);
    expect(loader, 'roles loader must query the real public.roles table').toMatch(/public\.roles/);
    expect(loader, 'roles loader must query the real public.user_roles table').toMatch(/public\.user_roles/);
    expect(screen, 'roles screen must not seed FALLBACK_ROLES').not.toMatch(/\bFALLBACK_ROLES\b/);
    expect(screen, 'roles screen must not seed FALLBACK_USERS').not.toMatch(/\bFALLBACK_USERS\b/);
    expect(screen, 'roles screen must not import the retired non-localized duplicate').not.toMatch(
      /\(admin\)\/settings\/roles\/page/,
    );
  });

  it('localized roles loader does not depend on the non-localized (admin)/settings duplicate', () => {
    const loader = readFileSync(rolesServerLoader, 'utf8');
    expect(loader, 'localized roles loader must import RolesScreen from the local client island').toMatch(
      /from\s+['"]\.\/roles-screen\.client['"]/,
    );
    expect(loader, 'localized roles loader must NOT import from the non-localized (admin)/settings tree').not.toMatch(
      /\(admin\)\/settings\/roles\/page/,
    );
  });

  it('authorization canonical loader reads real org_authorization_policies via withOrgContext (no SERVER_DEFAULT fixtures)', () => {
    const loader = readFileSync(authorizationServerLoader, 'utf8');
    expect(loader, 'authorization loader must read real data via withOrgContext').toMatch(/withOrgContext/);
    expect(loader, 'authorization loader must read real policy rows via readAuthorizationPolicy').toMatch(
      /readAuthorizationPolicy/,
    );
    expect(loader, 'authorization loader must not ship a SERVER_DEFAULT_POLICIES fixture').not.toMatch(
      /\bSERVER_DEFAULT_POLICIES\b/,
    );
    expect(loader, 'authorization loader must not ship a SERVER_DEFAULT_ROLES fixture').not.toMatch(
      /\bSERVER_DEFAULT_ROLES\b/,
    );
  });
});
