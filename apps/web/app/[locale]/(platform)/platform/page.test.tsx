/**
 * @vitest-environment jsdom
 *
 * Platform console — parity + states + i18n + RBAC contract.
 *
 * Parity anchor:
 *   prototypes/design/Monopilot Design System/platform/platform-console-and-org-shell.html
 *   VIEW 1 (lines 197-320): dark .plat-top brand/subtitle, 4 KPI tiles, the
 *   organizations table (Home tag / You-are-here / ⚑ Act as), the Recent
 *   platform audit card with coloured .audit-action chips, and the MVP-disabled
 *   Export / Add-platform-admin / View-full-log controls.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../i18n/en.json';

const platformMessages = (enMessages as { platform: Record<string, string> }).platform;

function translate(key: string, values?: Record<string, string | number>): string {
  const template = platformMessages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(values?.[k] ?? ''));
}

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => translate),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href, ...props }, children),
}));

const state = vi.hoisted(() => ({
  orgs: [] as unknown[],
  kpis: { organizations: 0, usersAllOrgs: 0, active: 0, trialOrOnboarding: 0 },
  audit: [] as unknown[],
  homeOrgId: null as string | null,
  orgsThrows: false,
}));

vi.mock('../../../../lib/auth/supabase-server', () => ({
  getCachedUser: vi.fn(async () => ({ data: { user: { id: 'u1', email: 'owner@monopilot.test' } }, error: null })),
}));

vi.mock('../../../../lib/platform/queries', () => ({
  listOrganizationsForPlatform: vi.fn(async () => {
    if (state.orgsThrows) throw new Error('boom');
    return state.orgs;
  }),
  getPlatformKpis: vi.fn(async () => {
    if (state.orgsThrows) throw new Error('boom');
    return state.kpis;
  }),
  listRecentPlatformAudit: vi.fn(async () => state.audit),
}));

vi.mock('../../../../lib/platform/actions', () => ({
  actAsOrgAction: vi.fn(async () => ({ ok: true })),
  addPlatformAdminAction: vi.fn(async () => ({ ok: true, outcome: 'added', email: 'x@y.com' })),
}));

vi.mock('../../../../lib/platform/actor-home-org', () => ({
  resolvePlatformActorHomeOrgId: vi.fn(async () => state.homeOrgId),
}));

const pagePath = path.resolve(process.cwd(), 'app/[locale]/(platform)/platform/page.tsx');

async function renderPage() {
  const mod = (await import(/* @vite-ignore */ pagePath)) as {
    default: (props: { params: Promise<{ locale: 'en' }> }) => Promise<React.ReactNode>;
  };
  const node = await mod.default({ params: Promise.resolve({ locale: 'en' }) });
  return render(<>{node}</>);
}

const APEX = {
  id: 'org-apex',
  code: 'APEX',
  name: 'Apex Dairy',
  industry: 'Dairy · Food manufacturing',
  userCount: 28,
  siteCount: 3,
  createdAt: '2025-11-12',
  lastActivityAt: new Date(Date.now() - 2 * 60000).toISOString(),
  status: 'active',
};
const KOBE = {
  id: 'org-kobe',
  code: 'KOBE',
  name: 'Kobe Dairy',
  industry: 'Dairy · Co-manufacturing',
  userCount: 41,
  siteCount: 2,
  createdAt: '2026-01-08',
  lastActivityAt: new Date(Date.now() - 18 * 60000).toISOString(),
  status: 'active',
};

beforeEach(() => {
  state.orgs = [];
  state.kpis = { organizations: 0, usersAllOrgs: 0, active: 0, trialOrOnboarding: 0 };
  state.audit = [];
  state.homeOrgId = null;
  state.orgsThrows = false;
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('Platform console — parity chrome', () => {
  it('renders the dark platform topbar with brand + super-admin subtitle + actor email', async () => {
    state.orgs = [APEX];
    state.homeOrgId = 'org-apex';
    await renderPage();

    const topbar = screen.getByTestId('platform-topbar');
    expect(within(topbar).getByText(/MonoPilot/)).toBeInTheDocument();
    expect(within(topbar).getByText('PLATFORM')).toBeInTheDocument();
    expect(within(topbar).getByText(/above all organizations/i)).toBeInTheDocument();
    expect(within(topbar).getByText('owner@monopilot.test')).toBeInTheDocument();
  });

  it('renders four KPI tiles from the real KPI reader', async () => {
    state.orgs = [APEX, KOBE];
    state.kpis = { organizations: 5, usersAllOrgs: 88, active: 3, trialOrOnboarding: 2 };
    state.homeOrgId = 'org-apex';
    await renderPage();

    // Some KPI labels ("Organizations", "Active") also appear elsewhere (page
    // title / status badge), so assert the tile labels that are unique to the
    // KPI row plus the distinct KPI values.
    expect(screen.getByText('Users · all orgs')).toBeInTheDocument();
    expect(screen.getByText('Trial / onboarding')).toBeInTheDocument();
    expect(screen.getByText('88')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders the org table with Home tag + "You are here" for the home org and an Act-as button for others', async () => {
    state.orgs = [APEX, KOBE];
    state.homeOrgId = 'org-apex';
    await renderPage();

    const homeRow = screen.getByTestId('platform-org-row-APEX');
    expect(within(homeRow).getByText('Apex Dairy')).toBeInTheDocument();
    expect(within(homeRow).getByText('Home')).toBeInTheDocument();
    expect(within(homeRow).getByText('You are here')).toBeInTheDocument();
    // Home row must NOT offer an act-as button.
    expect(within(homeRow).queryByTestId('act-as-btn-org-apex')).not.toBeInTheDocument();

    const otherRow = screen.getByTestId('platform-org-row-KOBE');
    expect(within(otherRow).getByTestId('act-as-btn-org-kobe')).toBeInTheDocument();
  });

  it('renders the recent platform audit card with a coloured action chip', async () => {
    state.orgs = [APEX];
    state.homeOrgId = 'org-apex';
    state.audit = [
      {
        id: 'pa-1',
        occurredAt: '2026-07-02T09:41:00.000Z',
        actorEmail: 'owner@monopilot.test',
        action: 'platform.act_as.entered',
        kind: 'enter',
        orgCode: 'KOBE',
        detail: 'Entered act-as for Kobe Dairy',
      },
    ];
    await renderPage();

    const auditRow = screen.getByTestId('platform-audit-row-pa-1');
    expect(within(auditRow).getByText('platform.act_as.entered')).toBeInTheDocument();
    expect(within(auditRow).getByText('KOBE')).toBeInTheDocument();
    expect(within(auditRow).getByText('2026-07-02 09:41')).toBeInTheDocument();
  });

  it('renders Export + Add-admin controls (enabled) and a View-full-log link to /platform/audit', async () => {
    state.orgs = [APEX, KOBE];
    state.homeOrgId = 'org-apex';
    await renderPage();

    // Export is enabled (there are orgs to export).
    const exportBtn = screen.getByTestId('platform-export');
    expect(exportBtn).not.toBeDisabled();

    // Add-admin trigger opens a modal (feature enabled, not "coming soon").
    const addAdmin = screen.getByTestId('platform-add-admin');
    expect(addAdmin).not.toBeDisabled();
    expect(addAdmin).not.toHaveAttribute('title', 'Coming soon');

    // View-full-log is now a real link to the guarded audit page.
    const fullLog = screen.getByTestId('platform-view-full-log');
    expect(fullLog).toHaveAttribute('href', '/en/platform/audit');
  });
});

describe('Platform console — states', () => {
  it('renders the empty state when there are no organizations', async () => {
    state.orgs = [];
    state.kpis = { organizations: 0, usersAllOrgs: 0, active: 0, trialOrOnboarding: 0 };
    await renderPage();
    expect(screen.getByTestId('platform-orgs-empty')).toBeInTheDocument();
  });

  it('renders the error state when the org reader throws', async () => {
    state.orgsThrows = true;
    await renderPage();
    expect(screen.getByTestId('platform-orgs-error')).toBeInTheDocument();
  });

  it('renders the audit empty state when there is no platform activity', async () => {
    state.orgs = [APEX];
    state.homeOrgId = 'org-apex';
    state.audit = [];
    await renderPage();
    expect(screen.getByTestId('platform-audit-empty')).toBeInTheDocument();
  });
});

describe('Platform console — i18n', () => {
  it('defines the platform namespace in all four locale files with no raw keys in the UI', () => {
    for (const locale of ['en', 'pl', 'ro', 'uk'] as const) {
      const filePath = path.resolve(process.cwd(), `i18n/${locale}.json`);
      expect(existsSync(filePath), `${locale}.json must exist`).toBe(true);
      const messages = JSON.parse(readFileSync(filePath, 'utf8')) as { platform?: Record<string, string> };
      expect(messages.platform, `${locale}.json must define the platform namespace`).toEqual(
        expect.objectContaining({
          brand: expect.any(String),
          brandSuffix: expect.any(String),
          title: expect.any(String),
          actAs: expect.any(String),
          bannerRole: expect.any(String),
          switcherActAsHeading: expect.any(String),
        }),
      );
    }
  });
});
