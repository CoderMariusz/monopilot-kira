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

function read(relativePath: string): string {
  return readFileSync(resolve(settingsRoot, relativePath), 'utf8');
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
