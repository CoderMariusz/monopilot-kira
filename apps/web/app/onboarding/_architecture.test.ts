/**
 * Architecture guard — onboarding routes must be Server Components.
 *
 * Spec contract: T-041..T-046 require "data via Server Components (Drizzle);
 * mutations via Server Actions". A top-level `'use client'` on any of the
 * onboarding `page.tsx` files breaks that contract — Next.js bundles the
 * whole page as a client component and the server-side `withOrgContext`
 * loader is skipped. This test fails fast if anyone reintroduces it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROUTES = [
  'profile',
  'warehouse',
  'location',
  'product',
  'workorder',
  'complete',
] as const;

const FIRST_NON_COMMENT_LINE_REGEX = /^\s*(?:\/\/.*|\/\*[\s\S]*?\*\/|\s)*/;

function firstCodeLine(source: string): string {
  const stripped = source.replace(FIRST_NON_COMMENT_LINE_REGEX, '');
  return stripped.split('\n', 1)[0]?.trim() ?? '';
}

describe('onboarding RSC architecture', () => {
  it.each(ROUTES)('onboarding/%s/page.tsx is a Server Component (no top-level "use client")', (route) => {
    const filePath = join(process.cwd(), 'app/onboarding', route, 'page.tsx');
    const source = readFileSync(filePath, 'utf8');
    const first = firstCodeLine(source);

    expect(first, `${route}/page.tsx must not start with 'use client'; move client code to _components/`).not.toMatch(/^['"]use client['"]/);
  });

  it.each(ROUTES)('onboarding/%s page imports its client island', (route) => {
    const filePath = join(process.cwd(), 'app/onboarding', route, 'page.tsx');
    const source = readFileSync(filePath, 'utf8');

    expect(source, `${route}/page.tsx must import from ./_components/${route}-client to render the client island`).toMatch(
      new RegExp(`from ['"]\\./_components/${route}-client['"]`),
    );
  });

  it.each(ROUTES)('onboarding/%s/_components/<name>-client.tsx is a Client Component', (route) => {
    const filePath = join(process.cwd(), 'app/onboarding', route, '_components', `${route}-client.tsx`);
    const source = readFileSync(filePath, 'utf8');
    const first = firstCodeLine(source);

    expect(first, `${route}-client.tsx must start with 'use client' so its interactive UI ships as a Client island`).toMatch(
      /^['"]use client['"]/,
    );
  });
});
