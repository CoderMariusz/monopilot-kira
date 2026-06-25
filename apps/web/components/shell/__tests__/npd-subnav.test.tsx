/**
 * @vitest-environment jsdom
 * 01-npd top sub-nav tab bar contract.
 * Parity SSOT: prototypes/design/Monopilot Design System/npd/chrome.jsx:76-121
 * (Projects / Formulations / Allergen cascade + collapsible Apex group with
 * FG Dashboard / Finished Goods / Briefs; FG-canonical labels; no Modal gallery).
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../i18n/en.json';
import {
  NPD_NAV_APEX_GROUP,
  NPD_NAV_TOP_TABS,
} from '../../../lib/navigation/npd-nav';

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
  it('renders the flat tabs + Apex group children as locale-prefixed anchors (Apex open by default)', () => {
    render(<NpdSubNav locale="en" pathnameOverride="/en/pipeline" />);

    const root = screen.getByTestId('npd-subnav');
    expect(screen.getByRole('navigation', { name: 'NPD' })).toBe(root);

    // Flat tabs in order.
    expect(within(root).getByTestId('npd-subnav-item-projects')).toHaveAttribute('href', '/en/pipeline');
    expect(within(root).getByTestId('npd-subnav-item-formulations')).toHaveAttribute('href', '/en/formulations');
    expect(within(root).getByTestId('npd-subnav-item-allergenCascade')).toHaveAttribute('href', '/en/allergen-cascade');

    // Apex toggle present, expanded by default, with chevron up.
    const toggle = within(root).getByTestId('npd-subnav-apex-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('▲');

    // Apex children visible by default.
    expect(within(root).getByTestId('npd-subnav-item-fgDashboard')).toHaveAttribute('href', '/en/npd');
    expect(within(root).getByTestId('npd-subnav-item-finishedGoods')).toHaveAttribute('href', '/en/fa');
    // 'briefs' nav item was removed when the standalone /briefs flow was folded into the project.

    // FG-canonical labels (no "FA Dashboard"/"Factory Articles").
    expect(within(root).getByTestId('npd-subnav-item-fgDashboard')).toHaveTextContent('FG Dashboard');
    expect(within(root).getByTestId('npd-subnav-item-finishedGoods')).toHaveTextContent('Finished Goods');

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

  it('lights the active Apex child (and the parent toggle) on a child route', () => {
    currentPathname = '/en/fa/FG-001';
    render(<NpdSubNav locale="en" pathnameOverride="/en/fa/FG-001" />);

    const root = screen.getByTestId('npd-subnav');
    expect(within(root).getByTestId('npd-subnav-item-finishedGoods')).toHaveAttribute('aria-current', 'page');
    expect(within(root).getByTestId('npd-subnav-apex-toggle')).toHaveAttribute('aria-current', 'page');
  });

  it('collapses and expands the Apex group on toggle click', () => {
    render(<NpdSubNav locale="en" pathnameOverride="/en/pipeline" />);

    const root = screen.getByTestId('npd-subnav');
    const toggle = within(root).getByTestId('npd-subnav-apex-toggle');

    // Collapse.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('▼');
    expect(within(root).queryByTestId('npd-subnav-item-fgDashboard')).toBeNull();

    // Expand again.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(root).getByTestId('npd-subnav-item-fgDashboard')).toBeInTheDocument();
  });

  it('exposes the expected tab/route map', () => {
    expect(NPD_NAV_TOP_TABS.map((t) => [t.key, t.route])).toEqual([
      ['projects', '/pipeline'],
      ['formulations', '/formulations'],
      ['allergenCascade', '/allergen-cascade'],
      ['costingRollup', '/costing/rollup'],
      ['workload', '/pipeline/workload'],
    ]);
    expect(NPD_NAV_APEX_GROUP.items.map((t) => [t.key, t.route])).toEqual([
      ['fgDashboard', '/npd'],
      ['finishedGoods', '/fa'],
    ]);
  });
});
