import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../..');
// Stale route contract: localized auth routes live under the (auth) route group.
const loginRoot = path.join(webRoot, 'app/[locale]/(auth)/login');
const i18nRoot = path.join(webRoot, 'i18n');

function readLoginFile(relativePath: string): string {
  const absolutePath = path.join(loginRoot, relativePath);
  expect(existsSync(absolutePath), `Expected localized login route file to exist: ${relativePath}`).toBe(true);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
}

function readI18n(locale: 'en' | 'pl'): Record<string, unknown> {
  const absolutePath = path.join(i18nRoot, `${locale}.json`);
  expect(existsSync(absolutePath), `Expected next-intl messages for ${locale}`).toBe(true);
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as Record<string, unknown>;
}

function topLevelUseClient(source: string): boolean {
  const firstCodeLine = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith('//'));
  return firstCodeLine === "'use client';" || firstCodeLine === '"use client";' || firstCodeLine === "'use client'" || firstCodeLine === '"use client"';
}

function flatKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('T-126 login RSC/client-island RED contract', () => {
  const routePages = [
    'page.tsx',
    'forgot-password/page.tsx',
    'mfa/page.tsx',
  ] as const;

  it('keeps localized login pages as Server Components and moves interactive form state into leaf client islands', () => {
    for (const relativePath of routePages) {
      const source = readLoginFile(relativePath);

      expect(topLevelUseClient(source), `${relativePath} must be an RSC page, not a page-level Client Component`).toBe(false);
      expect(source, `${relativePath} RSC wrapper must not own useActionState`).not.toContain('useActionState');
      expect(source, `${relativePath} RSC wrapper must not unwrap params with React.use()`).not.toMatch(/\buse\(params\)/);
      expect(source, `${relativePath} should delegate form interactivity to a leaf *.client component`).toMatch(
        /from ['"][^'"]*(?:\.client|login-form|login-card|auth-card|mfa-form|forgot-password-form)[^'"]*['"]|<\w*(?:Login|ForgotPassword|Mfa)\w*(?:Form|Card|Client)/,
      );
    }
  });

  it('composes sign-in, forgot-password, and MFA surfaces from package UI Card, Field/Form, Input, and Button primitives', () => {
    const source = routePages.map((relativePath) => readLoginFile(relativePath)).join('\n');

    expect(source, 'auth cards must use the real @monopilot/ui Card primitives').toMatch(/@monopilot\/ui\/Card/);
    expect(source, 'auth forms must use the package form/field primitive instead of raw label-only wrappers').toMatch(
      /@monopilot\/ui\/(?:Field|Form)/,
    );
    expect(source).toMatch(/@monopilot\/ui\/Input/);
    expect(source).toMatch(/@monopilot\/ui\/Button/);
    expect(source, 'raw section-as-card scaffolds are not a shadcn Card replacement').not.toMatch(/<section\b[^>]*className=/);
  });

  it('stores auth page copy in next-intl EN and PL message namespaces for the Server Component wrappers', () => {
    const requiredKeys = [
      'auth.login.title',
      'auth.login.subtitle',
      'auth.login.emailLabel',
      'auth.login.passwordLabel',
      'auth.login.submit',
      'auth.login.forgotPassword',
      'auth.login.error.invalidCredentials',
      'auth.login.forgot.title',
      'auth.login.forgot.submit',
      'auth.login.forgot.successTitle',
      'auth.login.mfa.title',
      'auth.login.mfa.codeLabel',
      'auth.login.mfa.submit',
    ];

    for (const locale of ['en', 'pl'] as const) {
      const keys = new Set(flatKeys(readI18n(locale)));
      for (const key of requiredKeys) {
        expect(keys.has(key), `${locale}.json must define ${key}`).toBe(true);
      }
    }

    for (const relativePath of routePages) {
      const source = readLoginFile(relativePath);
      expect(source, `${relativePath} should resolve text with next-intl in the RSC wrapper`).toMatch(/getTranslations|useTranslations/);
    }
  });
});
