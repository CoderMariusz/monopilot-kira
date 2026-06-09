/**
 * @vitest-environment jsdom
 * T-136 RED: FA detail tabs shell.
 *
 * These tests intentionally load the future fa-tabs component dynamically so the
 * pre-implementation failure is a behavior failure (missing tabs/placeholders),
 * not a module-resolution error.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FaTabsProps = {
  productCode: string;
  // T-105: the Core-close gate (default false) locks dept tabs; the T-136 shell
  // contract (order / deferred-empty / activation) is asserted on the UNLOCKED
  // shell, so these tests render with coreDone+prodDone = true.
  coreDone?: boolean;
  prodDone?: boolean;
};

type FaTabsComponent = (props: FaTabsProps) => React.ReactElement;

const EXPECTED_FA_TABS = [
  'Core',
  'Planning',
  'Commercial',
  'Production',
  'Technical',
  'MRP',
  'Procurement',
  'BOM',
  'History',
] as const;

const TAB_SLUGS = [
  'core',
  'planning',
  'commercial',
  'production',
  'technical',
  'mrp',
  'procurement',
  'bom',
  'history',
] as const;

let pathname = '/(npd)/fa/FA-RED-001';
let searchParams = new URLSearchParams();

const routerPush = vi.fn((href: string) => {
  const nextUrl = new URL(href, 'https://monopilot.test');
  pathname = nextUrl.pathname;
  searchParams = new URLSearchParams(nextUrl.searchParams);
});

const routerReplace = vi.fn((href: string) => {
  const nextUrl = new URL(href, 'https://monopilot.test');
  pathname = nextUrl.pathname;
  searchParams = new URLSearchParams(nextUrl.searchParams);
});

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(searchParams.toString()),
}));

async function loadFaTabs(): Promise<FaTabsComponent> {
  try {
    const modulePath = '../fa-tabs';
    const mod = await import(/* @vite-ignore */ modulePath);
    return (mod.FaTabs ?? mod.default) as FaTabsComponent;
  } catch {
    return function MissingFaTabs() {
      return React.createElement('section', {
        'aria-label': 'missing FA tabs implementation',
        'data-testid': 'missing-fa-tabs',
      });
    };
  }
}

function setUrlTab(tab: string | null) {
  pathname = '/(npd)/fa/FA-RED-001';
  searchParams = new URLSearchParams();
  if (tab) searchParams.set('tab', tab);
}

async function renderFaTabs(tab: string | null = null) {
  setUrlTab(tab);
  const FaTabs = await loadFaTabs();
  return render(React.createElement(FaTabs, { productCode: 'FA-RED-001', coreDone: true, prodDone: true }));
}

describe('T-136 FA detail tabs shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUrlTab(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('matches the fa_detail tab parity checklist with 8 shadcn/Radix tabs in prototype order', async () => {
    await renderFaTabs();

    const tablist = screen.getByRole('tablist', { name: /fa detail departments|factory article departments|fa tabs/i });
    expect(tablist).toHaveAttribute('data-slot', 'tabs-list');
    expect(document.querySelector('.subnav-inline')).not.toBeInTheDocument();

    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(9);
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([...EXPECTED_FA_TABS]);

    tabs.forEach((tab, index) => {
      expect(tab.tagName, `${EXPECTED_FA_TABS[index]} must be a primitive trigger button, not a raw anchor`).toBe('BUTTON');
      expect(tab).toHaveAttribute('data-slot', 'tabs-trigger');
      expect(tab).toHaveAttribute('data-value', TAB_SLUGS[index]);
    });
  });

  it('activates the Technical trigger and deferred-empty placeholder from ?tab=technical', async () => {
    await renderFaTabs('technical');

    const technicalTab = screen.getByRole('tab', { name: 'Technical' });
    expect(technicalTab).toHaveAttribute('aria-selected', 'true');
    expect(technicalTab).toHaveAttribute('data-state', 'active');

    const panel = screen.getByRole('tabpanel', { name: /technical/i });
    expect(panel).toHaveAttribute('data-state', 'active');
    expect(within(panel).getByText(/technical/i)).toBeInTheDocument();
    expect(within(panel).getByText(/deferred-empty|tab content deferred/i)).toBeInTheDocument();
    expect(panel.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });

  it('persists tab switches in ?tab= and restores the previous tab when URL state moves back', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderFaTabs('core');
    const FaTabs = await loadFaTabs();

    await user.click(screen.getByRole('tab', { name: 'Production' }));

    expect(routerPush).toHaveBeenCalledWith(expect.stringMatching(/\?tab=production(?:$|&)/));

    rerender(React.createElement(FaTabs, { productCode: 'FA-RED-001', coreDone: true, prodDone: true }));
    expect(screen.getByRole('tab', { name: 'Production' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: /production/i })).toHaveTextContent(/deferred-empty|tab content deferred/i);

    setUrlTab('core');
    rerender(React.createElement(FaTabs, { productCode: 'FA-RED-001', coreDone: true, prodDone: true }));

    expect(screen.getByRole('tab', { name: 'Core' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: /core/i })).toHaveTextContent(/deferred-empty|tab content deferred/i);
  });
});
