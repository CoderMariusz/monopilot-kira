/**
 * @vitest-environment jsdom
 * 14-multi-site (CL4) — topbar SiteSwitcher RTL tests: options render from the
 * org's sites, the active cookie value is selected, and choosing a site calls
 * the server-action cookie seam then refreshes the route tree.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteSwitcher, type SiteSwitcherOption } from '../site-switcher';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const SITES: SiteSwitcherOption[] = [
  { id: '11111111-1111-4111-8111-111111111111', siteCode: 'SITE-A', name: 'Plant Warsaw', isDefault: true },
  { id: '22222222-2222-4222-8222-222222222222', siteCode: 'SITE-B', name: 'Plant Krakow', isDefault: false },
];

const LABELS = {
  label: 'Site',
  allSites: 'All sites',
  tooltip: 'Filters work orders, license plates and OEE only',
};

let setSiteAction: ReturnType<typeof vi.fn>;

beforeEach(() => {
  refresh.mockClear();
  setSiteAction = vi.fn(async () => ({ ok: true }));
});

afterEach(() => {
  cleanup();
});

function renderSwitcher(activeSiteId: string | null = null) {
  return render(
    <SiteSwitcher
      sites={SITES}
      activeSiteId={activeSiteId}
      labels={LABELS}
      setSiteAction={setSiteAction}
    />,
  );
}

describe('SiteSwitcher (14-multi-site CL4)', () => {
  it('renders the All-sites option plus one option per org site', () => {
    renderSwitcher();
    const select = screen.getByRole('combobox', { name: 'Site' });
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['All sites', 'Plant Warsaw', 'Plant Krakow']);
    expect(select).toHaveValue('');
  });

  it('carries the honest tooltip naming the wired screens', () => {
    renderSwitcher();
    expect(screen.getByTestId('app-topbar-site-switcher')).toHaveAttribute(
      'title',
      LABELS.tooltip,
    );
  });

  it('preselects the active site from the cookie value', () => {
    renderSwitcher(SITES[1].id);
    expect(screen.getByRole('combobox', { name: 'Site' })).toHaveValue(SITES[1].id);
  });

  it('falls back to All sites when the cookie id is not an org site', () => {
    renderSwitcher('33333333-3333-4333-8333-333333333333');
    expect(screen.getByRole('combobox', { name: 'Site' })).toHaveValue('');
  });

  it('selecting a site calls the cookie write seam then refreshes the route tree', async () => {
    const user = userEvent.setup();
    renderSwitcher();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Site' }), SITES[0].id);
    await waitFor(() => expect(setSiteAction).toHaveBeenCalledWith(SITES[0].id));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('selecting All sites writes null (cookie delete)', async () => {
    const user = userEvent.setup();
    renderSwitcher(SITES[0].id);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Site' }), '');
    await waitFor(() => expect(setSiteAction).toHaveBeenCalledWith(null));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
