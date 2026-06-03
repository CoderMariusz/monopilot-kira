import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');
const appRoot = resolve(repoRoot, 'apps/web/app');

function pageExists(path: string) {
  return existsSync(resolve(appRoot, path, 'page.tsx'));
}

function pageSource(path: string) {
  return readFileSync(resolve(appRoot, path, 'page.tsx'), 'utf8');
}

describe('localized route parity', () => {
  it('exposes onboarding pages at the locale-prefixed URLs used by next-intl and Vercel', () => {
    for (const route of [
      'profile',
      'warehouse',
      'location',
      'product',
      'workorder',
      'complete',
      'in-progress',
    ]) {
      const path = `[locale]/onboarding/${route}`;
      expect(pageExists(path), `missing localized onboarding route ${path}`).toBe(true);
      expect(pageSource(path)).toContain(`../../../onboarding/${route}/page`);
    }

    expect(pageSource('[locale]/onboarding')).toContain("redirect(`/${locale}/onboarding/profile`)");
  });

  it('exposes settings/admin pages at locale-prefixed URLs instead of 404ing after proxy localization', () => {
    // Structural consolidation (W4 / TASK-000563): the canonical browser-visible
    // settings tree lives under [locale]/(app)/(admin)/settings/**. The retired
    // non-localized (admin)/settings/** duplicates and the never-built middle
    // [locale]/(admin)/settings/** shims have been eliminated, so parity is now
    // asserted against the single canonical localized AppShell tree.
    for (const route of [
      'users',
      'invitations',
      'roles',
      'authorization',
      'security',
      'profile',
      'schema/preview',
      'reference/manufacturing-operations',
    ]) {
      const path = `[locale]/(app)/(admin)/settings/${route}`;
      expect(pageExists(path), `missing localized settings route ${path}`).toBe(true);
    }

    expect(pageExists('[locale]/(admin)/schema/wizard')).toBe(true);
  });
});
