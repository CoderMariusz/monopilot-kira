/**
 * @vitest-environment jsdom
 *
 * Platform org switcher + act-as banner — parity + behaviour + RBAC surface.
 *
 * Parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   .org-trigger / .org-panel (lines 128-150, 361-382) and .actas-banner (152-160,
 *   328-337). The switcher's act treatment (red border/glyph) mirrors .org-trigger.act;
 *   the banner uses the #b42318 strong-red control strip.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: routerRefresh }),
}));

import { OrgSwitcher } from '../org-switcher';
import { ActAsBanner } from '../act-as-banner';

const labels = {
  trigger: 'Switch organization (platform admin)',
  homeHeading: 'Your home org',
  actAsHeading: 'Act as (platform admin · audited)',
  footnote: 'Switching into another org opens an audited act_as session.',
  sitesLabel: (n: number) => `${n} sites`,
};

const HOME = { id: 'org-apex', code: 'APEX', name: 'Apex Dairy', industry: 'Dairy', siteCount: 3 };
const KOBE = { id: 'org-kobe', code: 'KOBE', name: 'Kobe Dairy', industry: 'Dairy', siteCount: 2 };

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

describe('OrgSwitcher', () => {
  it('renders the home org in the trigger and lists act-as targets when opened', () => {
    render(
      <OrgSwitcher
        homeOrg={HOME}
        actAsOrgs={[KOBE]}
        currentOrg={HOME}
        isActingAs={false}
        labels={labels}
        actAsOrgAction={vi.fn(async () => ({ ok: true }))}
        exitActAsAction={vi.fn(async () => ({ ok: true }))}
      />,
    );

    const trigger = screen.getByTestId('app-topbar-org-trigger');
    expect(trigger).toHaveTextContent('Apex Dairy');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');

    fireEvent.click(trigger);
    const panel = screen.getByTestId('app-topbar-org-panel');
    expect(within(panel, 'Your home org')).toBe(true);
    expect(screen.getByText('Act as (platform admin · audited)')).toBeInTheDocument();
    expect(screen.getByTestId('app-topbar-org-actas-KOBE')).toBeInTheDocument();
  });

  it('calls actAsOrgAction(orgId) then refreshes when an act-as target is picked', async () => {
    const actAs = vi.fn(async () => ({ ok: true }));
    render(
      <OrgSwitcher
        homeOrg={HOME}
        actAsOrgs={[KOBE]}
        currentOrg={HOME}
        isActingAs={false}
        labels={labels}
        actAsOrgAction={actAs}
        exitActAsAction={vi.fn(async () => ({ ok: true }))}
      />,
    );
    fireEvent.click(screen.getByTestId('app-topbar-org-trigger'));
    fireEvent.click(screen.getByTestId('app-topbar-org-actas-KOBE'));

    await waitFor(() => expect(actAs).toHaveBeenCalledWith('org-kobe'));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalled());
  });

  it('calls exitActAsAction when the home org is picked while acting-as', async () => {
    const exit = vi.fn(async () => ({ ok: true }));
    render(
      <OrgSwitcher
        homeOrg={HOME}
        actAsOrgs={[KOBE]}
        currentOrg={KOBE}
        isActingAs
        labels={labels}
        actAsOrgAction={vi.fn(async () => ({ ok: true }))}
        exitActAsAction={exit}
      />,
    );
    // While acting-as the trigger shows the target org.
    expect(screen.getByTestId('app-topbar-org-trigger')).toHaveTextContent('Kobe Dairy');

    fireEvent.click(screen.getByTestId('app-topbar-org-trigger'));
    fireEvent.click(screen.getByTestId('app-topbar-org-home'));
    await waitFor(() => expect(exit).toHaveBeenCalled());
  });
});

describe('ActAsBanner', () => {
  it('renders the acting-as org + code + exit control and calls exitActAsAction on exit', async () => {
    const exit = vi.fn(async () => ({ ok: true }));
    render(
      <ActAsBanner
        orgName="Kobe Dairy"
        orgCode="KOBE"
        actorEmail="owner@monopilot.test"
        labels={{ role: 'PLATFORM ADMIN', actingAs: 'acting as', exit: 'Exit act-as' }}
        exitActAsAction={exit}
      />,
    );

    const banner = screen.getByTestId('act-as-banner');
    expect(banner).toHaveTextContent('PLATFORM ADMIN');
    expect(screen.getByTestId('act-as-banner-org')).toHaveTextContent('Kobe Dairy');
    expect(banner).toHaveTextContent('KOBE');

    fireEvent.click(screen.getByTestId('act-as-banner-exit'));
    await waitFor(() => expect(exit).toHaveBeenCalled());
  });
});

// Tiny helper: assert some text appears inside a container.
function within(container: HTMLElement, text: string): boolean {
  return container.textContent?.includes(text) ?? false;
}
