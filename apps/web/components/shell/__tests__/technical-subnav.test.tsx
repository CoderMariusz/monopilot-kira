/**
 * @vitest-environment jsdom
 * Technical left sub-nav rail contract (design 01-DESIGN-SPEC §5).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TECHNICAL_NAV_GROUPS, isTechnicalNavItemActive } from '../../../lib/navigation/technical-nav';
import enMessages from '../../../i18n/en.json';

let currentPathname = '/en/technical';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

// Translator backed by the real EN `Navigation.technical` namespace so the
// rail renders the same English source labels the assertions reference.
const navMessages = (enMessages as Record<string, any>).Navigation.technical as Record<string, any>;
function lookup(key: string): string | undefined {
  return key.split('.').reduce<any>((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), navMessages);
}
const tFn = ((key: string) => lookup(key) ?? key) as ((key: string) => string) & { has: (key: string) => boolean };
tFn.has = (key: string) => typeof lookup(key) === 'string';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => tFn,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, 'data-next-link': 'true', ...props }, children),
}));

import { TechnicalSubNav } from '../technical-subnav';

const allItems = TECHNICAL_NAV_GROUPS.flatMap((g) => g.items);

afterEach(() => cleanup());
beforeEach(() => {
  currentPathname = '/en/technical';
});

describe('TechnicalSubNav', () => {
  it('renders every group header and nav item as a locale-prefixed anchor', () => {
    render(<TechnicalSubNav locale="en" pathnameOverride="/en/technical" />);

    const root = screen.getByTestId('technical-subnav');
    expect(screen.getByRole('navigation', { name: 'Technical' })).toBe(root);

    const headers = Array.from(root.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headers).toEqual(TECHNICAL_NAV_GROUPS.map((g) => g.label));

    const links = within(root).getAllByRole('link');
    expect(links).toHaveLength(allItems.length);
    for (const item of allItems) {
      const link = screen.getByTestId(`technical-subnav-item-${item.key}`);
      expect(link).toHaveAttribute('href', `/en${item.route}`);
      expect(link).toHaveTextContent(item.label);
    }
  });

  it('marks exactly one item active and never lights Overview on a subroute', () => {
    currentPathname = '/en/technical/items';
    render(<TechnicalSubNav locale="en" pathnameOverride="/en/technical/items" />);

    const active = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('data-testid', 'technical-subnav-item-products');
  });

  it('isTechnicalNavItemActive: exact for overview, prefix for sections', () => {
    expect(isTechnicalNavItemActive('/technical', '/technical')).toBe(true);
    expect(isTechnicalNavItemActive('/technical', '/technical/items')).toBe(false);
    expect(isTechnicalNavItemActive('/technical/bom', '/technical/bom/RM-1')).toBe(true);
    expect(isTechnicalNavItemActive('/technical/items', '/technical/cost')).toBe(false);
    // Recipe costing (/technical/cost) must not light up on Cost history.
    expect(isTechnicalNavItemActive('/technical/cost', '/technical/cost/history')).toBe(false);
    expect(isTechnicalNavItemActive('/technical/cost/history', '/technical/cost/history')).toBe(true);
  });
});
