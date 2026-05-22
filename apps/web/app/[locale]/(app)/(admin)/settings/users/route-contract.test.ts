import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();
const canonicalPagePath = resolve(appRoot, 'app/[locale]/(app)/(admin)/settings/users/page.tsx');
const clientPath = resolve(appRoot, 'app/[locale]/(app)/(admin)/settings/users/users-screen.client.tsx');
const legacyPagePath = resolve(appRoot, 'app/(admin)/settings/users/page.tsx');

describe('T-059 localized Settings Users route contract', () => {
  it('keeps the user-visible implementation under [locale]/(app)/(admin)', () => {
    expect(existsSync(canonicalPagePath)).toBe(true);
    expect(readFileSync(canonicalPagePath, 'utf8')).toContain('SettingsUsersScreen');
  });

  it('keeps page.tsx as a Server Component and moves interactivity to the leaf client component', () => {
    const pageSource = readFileSync(canonicalPagePath, 'utf8');
    const clientSource = readFileSync(clientPath, 'utf8');

    expect(pageSource.trimStart().startsWith("'use client'")).toBe(false);
    expect(clientSource.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('does not fake shadcn/ui primitives with raw data-slot attributes in production route code', () => {
    const combinedSource = [canonicalPagePath, clientPath]
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');

    expect(combinedSource).not.toMatch(/<(span|div|button)\b[^>]*\bdata-slot=/);
  });

  it('leaves the legacy non-localized route as a redirect shim only', () => {
    const legacySource = readFileSync(legacyPagePath, 'utf8');

    expect(legacySource).toContain("redirect('/en/settings/users')");
    expect(legacySource).not.toContain('SettingsUsersScreen');
  });
});
