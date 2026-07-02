/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../i18n/en.json';

const multiSiteMessages = (enMessages as { MultiSite: Record<string, unknown> }).MultiSite;
const qualityTrace = (enMessages as { quality: { trace: Record<string, string> } }).quality.trace;

function translateMultiSite(key: string): string {
  const parts = key.split('.');
  let node: unknown = multiSiteMessages;
  for (const part of parts) {
    node = (node as Record<string, unknown>)?.[part];
  }
  return typeof node === 'string' ? node : key;
}

function translateQualityTrace(key: string): string {
  return qualityTrace[key] ?? key;
}

const gate = vi.hoisted(() => ({
  allowCrossSiteRead: true,
  sites: [] as Array<{
    id: string;
    site_code: string;
    name: string;
    is_default: boolean;
    timezone: string;
    country: string | null;
  }>,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace?: string) => {
    if (namespace === 'quality.trace') {
      return (key: string) => translateQualityTrace(key);
    }
    if (namespace === 'Navigation.app.items') {
      return (key: string) => (key === 'multiSite' ? 'Multi-Site' : key);
    }
    return (key: string) => translateMultiSite(key);
  }),
}));

vi.mock('../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async (_ctx, permission: string) => {
    if (permission === 'multi_site.cross_site.read') return gate.allowCrossSiteRead;
    return false;
  }),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: unknown }) => Promise<unknown>) =>
    action({
      userId: '22222222-2222-4222-8222-222222222222',
      orgId: '11111111-1111-4111-8111-111111111111',
      client: {
        query: vi.fn(async (sql: string) => {
          const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
          if (normalized.includes('from public.sites') && normalized.includes('site_code')) {
            return { rows: gate.sites };
          }
          if (normalized.includes('count(*) as site_count')) {
            return { rows: [{ site_count: String(gate.sites.length) }] };
          }
          if (normalized.includes('in_transit_count')) {
            return { rows: [{ in_transit_count: '0' }] };
          }
          if (normalized.includes('inventory_total_qty')) {
            return { rows: [{ inventory_total_qty: '100' }] };
          }
          return { rows: [] };
        }),
      },
    }),
  ),
}));

async function renderPage() {
  const mod = await import('./page');
  const node = await mod.default();
  return render(<>{node}</>);
}

beforeEach(() => {
  gate.allowCrossSiteRead = true;
  gate.sites = [
    {
      id: 'site-1',
      site_code: 'HQ',
      name: 'Headquarters',
      is_default: true,
      timezone: 'Europe/Warsaw',
      country: 'PL',
    },
  ];
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('MultiSiteRoutePage RBAC', () => {
  it('renders denied without multi_site.cross_site.read', async () => {
    gate.allowCrossSiteRead = false;

    await renderPage();

    expect(screen.getByTestId('multi-site-denied')).toBeInTheDocument();
    expect(screen.queryByLabelText('Network KPIs')).not.toBeInTheDocument();
  });

  it('renders overview when multi_site.cross_site.read is granted', async () => {
    await renderPage();

    expect(screen.queryByTestId('multi-site-denied')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Network KPIs')).toBeInTheDocument();
    expect(screen.getByText('Headquarters')).toBeInTheDocument();
  });
});
