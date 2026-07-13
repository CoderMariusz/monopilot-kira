/**
 * @vitest-environment jsdom
 * 01-npd top sub-nav tab bar contract.
 * Parity SSOT: prototypes/design/Monopilot Design System/npd/chrome.jsx:76-121
 * (Projects / Formulations / Allergen cascade + Costing roll-up / Owner workload).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../i18n/en.json';
import { NPD_NAV_TOP_TABS } from '../../../lib/navigation/npd-nav';

let currentPathname = '/en/pipeline';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

const npdMessages = (enMessages as Record<string, any>).Navigation.npd as Record<string, any>;

function resolveNpdKey(key: string): string {
  return key.split('.').reduce<any>((acc, part) => acc?.[part], npdMessages);
}

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => resolveNpdKey(key),
}));

vi.mock('next/link', () => ({
  // Drop `prefetch` (a Link-only prop) so it is not forwarded to the DOM <a>.
  default: ({ href, children, prefetch: _prefetch, ...props }: { href: string; children: React.ReactNode; prefetch?: boolean }) =>
    React.createElement('a', { href, 'data-next-link': 'true', ...props }, children),
}));

import { NpdSubNav } from '../npd-subnav';

afterEach(() => cleanup());
beforeEach(() => {
  currentPathname = '/en/pipeline';
});

describe('NpdSubNav', () => {
  it('renders the flat tabs as locale-prefixed anchors', () => {
    render(<NpdSubNav locale="en" pathnameOverride="/en/pipeline" />);

    const root = screen.getByTestId('npd-subnav');
    expect(screen.getByRole('navigation', { name: 'NPD' })).toBe(root);

    expect(within(root).getByTestId('npd-subnav-item-projects')).toHaveAttribute('href', '/en/pipeline');
    expect(within(root).getByTestId('npd-subnav-item-formulations')).toHaveAttribute('href', '/en/formulations');
    expect(within(root).getByTestId('npd-subnav-item-allergenCascade')).toHaveAttribute('href', '/en/allergen-cascade');
    expect(within(root).getByTestId('npd-subnav-item-costingRollup')).toHaveAttribute('href', '/en/costing/rollup');
    expect(within(root).getByTestId('npd-subnav-item-workload')).toHaveAttribute('href', '/en/pipeline/workload');

    // C7b: legacy Apex group (FG Dashboard / Finished Goods) removed — routes redirect to pipeline.
    expect(within(root).queryByTestId('npd-subnav-apex-toggle')).toBeNull();
    expect(within(root).queryByTestId('npd-subnav-item-fgDashboard')).toBeNull();
    expect(within(root).queryByTestId('npd-subnav-item-finishedGoods')).toBeNull();

    // No "Modal gallery" tab (explicitly out of scope).
    expect(within(root).queryByText(/modal gallery/i)).toBeNull();
  });

  it('marks exactly one tab active on a flat route', () => {
    currentPathname = '/en/pipeline';
    render(<NpdSubNav locale="en" pathnameOverride="/en/pipeline" />);

    const active = screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveAttribute('data-testid', 'npd-subnav-item-projects');
  });

  it('marks the workload tab active on a nested pipeline/workload route', () => {
    currentPathname = '/en/pipeline/workload';
    render(<NpdSubNav locale="en" pathnameOverride="/en/pipeline/workload" />);

    const root = screen.getByTestId('npd-subnav');
    expect(within(root).getByTestId('npd-subnav-item-workload')).toHaveAttribute('aria-current', 'page');
  });

  it('exposes the expected tab/route map', () => {
    expect(NPD_NAV_TOP_TABS.map((t) => [t.key, t.route])).toEqual([
      ['projects', '/pipeline'],
      ['formulations', '/formulations'],
      ['allergenCascade', '/allergen-cascade'],
      ['costingRollup', '/costing/rollup'],
      ['workload', '/pipeline/workload'],
    ]);
  });
});
