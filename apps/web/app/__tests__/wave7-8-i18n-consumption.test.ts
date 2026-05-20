/**
 * Wave 7+8 i18n consumption tests.
 *
 * Validates that onboarding and admin/settings page components actually
 * consume next-intl (not just that namespace files exist) and that the
 * keys they use are present in all four locale files.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_WEB = path.resolve(__dirname, '..', '..');
const I18N_DIR = path.resolve(REPO_WEB, 'i18n');
const LOCALES = ['en', 'pl', 'ro', 'uk'] as const;

interface I18nTree {
  [k: string]: string | I18nTree;
}

function loadLocale(locale: string): I18nTree {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), 'utf8')) as I18nTree;
}

function resolveKey(tree: I18nTree, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((cur, seg) => {
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) return (cur as Record<string, unknown>)[seg];
    return undefined;
  }, tree);
}

const WAVE_7_8_PAGES = [
  'app/onboarding/profile/page.tsx',
  'app/onboarding/complete/page.tsx',
  'app/onboarding/in-progress/page.tsx',
  'app/onboarding/location/page.tsx',
  'app/onboarding/product/page.tsx',
  'app/onboarding/warehouse/page.tsx',
  'app/onboarding/workorder/page.tsx',
  'app/(admin)/settings/users/page.tsx',
  'app/(admin)/settings/invitations/page.tsx',
  'app/(admin)/settings/roles/page.tsx',
  'app/(admin)/settings/authorization/page.tsx',
  'app/(admin)/settings/security/page.tsx',
  'app/(admin)/settings/reference/manufacturing-operations/page.tsx',
];

const REQUIRED_KEYS = [
  'onboarding.wizard_title',
  'onboarding.continue',
  'onboarding.back',
  'onboarding.restart',
  'onboarding.permission_denied',
  'onboarding.in_progress_title',
  'onboarding.in_progress_body',
  'settings.users.heading',
  'settings.users.invite_user',
  'settings.users.export',
  'settings.users.error_load',
  'settings.users.permission_denied',
  'settings.invitations.heading',
  'settings.roles.heading',
  'settings.authorization.heading',
  'settings.security.heading',
  'settings.reference_mfg.heading',
  'settings.reference_mfg.add_operation',
  'settings.reference_mfg.reset_seed',
];

describe('Wave 7+8 i18n consumption', () => {
  it('every Wave 7+8 page imports next-intl translator (useTranslations or getTranslations)', () => {
    for (const rel of WAVE_7_8_PAGES) {
      const full = path.resolve(REPO_WEB, rel);
      expect(fs.existsSync(full), `missing page: ${rel}`).toBe(true);
      const source = fs.readFileSync(full, 'utf8');
      const consumesIntl = /from\s+['"]next-intl(\/server)?['"]/.test(source) &&
        /(useTranslations|getTranslations)\s*\(/.test(source);
      expect(consumesIntl, `page must import & call useTranslations or getTranslations: ${rel}`).toBe(true);
    }
  });

  it('every required Wave 7+8 key resolves to a non-empty string in all four locales', () => {
    for (const locale of LOCALES) {
      const tree = loadLocale(locale);
      for (const key of REQUIRED_KEYS) {
        const value = resolveKey(tree, key);
        expect(typeof value, `${locale}:${key} must be a string`).toBe('string');
        expect((value as string).trim(), `${locale}:${key} must not be empty`).not.toBe('');
      }
    }
  });

  it('root layout wires NextIntlClientProvider so client components can use useTranslations', () => {
    const layoutPath = path.resolve(REPO_WEB, 'app/layout.tsx');
    const source = fs.readFileSync(layoutPath, 'utf8');
    expect(source).toMatch(/from\s+['"]next-intl['"]/);
    expect(source).toMatch(/NextIntlClientProvider/);
    expect(source).toMatch(/getMessages/);
  });
});
