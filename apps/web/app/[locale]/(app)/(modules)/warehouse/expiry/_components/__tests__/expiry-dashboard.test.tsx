/**
 * WH-019 — Expiry-management client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:375-508.
 * Tests the presentational <ExpiryDashboardClient> directly (the page is an async RSC
 * that reads Supabase via getExpiryDashboard and is exercised live). Asserts:
 *   - summary strip red/amber count cards (parity other-screens.jsx:399-410)
 *   - rows split into the red tier and amber tier sections (the tier field drives it)
 *   - rows render LP detail link, item, days-left, location (other-screens.jsx:464-485)
 *   - "Force block" renders DISABLED with a "Coming soon" title (documented red-line)
 *   - global empty state when there are no rows
 *   - i18n: en + pl staged bundles resolve every label (no leaked dotted key)
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpiryDashboardClient, type ExpiryLabels, type ExpiryRow } from '../expiry-dashboard.client';
import { getWhdTranslator } from '../../../wh-d-labels';

// Mirrors the page's label builder (kept local to avoid importing the RSC page,
// which transitively pulls the 'use server' action module into the jsdom test).
function buildExpiryLabels(locale: string): ExpiryLabels {
  const t = getWhdTranslator(locale);
  return {
    summary: {
      red: t('expiryPage.summary.red'),
      redSub: t('expiryPage.summary.redSub'),
      amber: t('expiryPage.summary.amber'),
      amberSub: t('expiryPage.summary.amberSub'),
    },
    red: { title: t('expiryPage.red.title'), empty: t('expiryPage.red.empty') },
    amber: { title: t('expiryPage.amber.title'), empty: t('expiryPage.amber.empty') },
    columns: {
      lp: t('expiryPage.columns.lp'),
      item: t('expiryPage.columns.item'),
      batch: t('expiryPage.columns.batch'),
      expiry: t('expiryPage.columns.expiry'),
      daysLeft: t('expiryPage.columns.daysLeft'),
      location: t('expiryPage.columns.location'),
      status: t('expiryPage.columns.status'),
      action: t('expiryPage.columns.action'),
    },
    rows: t('expiryPage.rows'),
    daysLeft: t('expiryPage.daysLeft'),
    expired: t('expiryPage.expired'),
    forceBlock: t('expiryPage.forceBlock'),
    forceBlockComingSoon: t('expiryPage.forceBlockComingSoon'),
    none: t('expiryPage.none'),
    empty: t('expiryPage.empty'),
    status: {
      available: t('dashboard.status.available'),
      reserved: t('dashboard.status.reserved'),
      allocated: t('dashboard.status.allocated'),
      received: t('dashboard.status.received'),
      quarantine: t('dashboard.status.quarantine'),
      blocked: t('dashboard.status.blocked'),
    },
  };
}

const EN = buildExpiryLabels('en');

function makeRow(over: Partial<ExpiryRow>): ExpiryRow {
  return {
    lpId: over.lpId ?? 'lp-1',
    lpNumber: over.lpNumber ?? 'LP00000007',
    tier: over.tier ?? 'red',
    itemCode: over.itemCode ?? 'R-1002',
    itemName: over.itemName ?? 'Słonina wieprzowa',
    batchNumber: over.batchNumber ?? null,
    locationCode: over.locationCode ?? 'COLD-B2',
    warehouseCode: over.warehouseCode ?? 'WH-A',
    quantity: over.quantity ?? '120',
    uom: over.uom ?? 'kg',
    expiryDate: over.expiryDate ?? '2026-04-15T00:00:00.000Z',
    daysLeft: over.daysLeft ?? -6,
    status: over.status ?? '',
  };
}

function renderExpiry(rows: ExpiryRow[], redCount: number, amberCount: number, labels: ExpiryLabels = EN) {
  return render(<ExpiryDashboardClient rows={rows} redCount={redCount} amberCount={amberCount} labels={labels} locale="en" />);
}

describe('ExpiryDashboardClient (WH-019 parity)', () => {
  it('renders the summary strip red/amber count cards', () => {
    renderExpiry([makeRow({ tier: 'red' })], 5, 12);
    expect(screen.getByTestId('expiry-summary-red-count')).toHaveTextContent('5');
    expect(screen.getByTestId('expiry-summary-amber-count')).toHaveTextContent('12');
  });

  it('splits rows into the red tier and amber tier sections', () => {
    renderExpiry(
      [
        makeRow({ lpId: 'r1', tier: 'red' }),
        makeRow({ lpId: 'a1', tier: 'amber', daysLeft: 20 }),
        makeRow({ lpId: 'a2', tier: 'amber', daysLeft: 25 }),
      ],
      1,
      2,
    );
    const red = screen.getByTestId('expiry-tier-red');
    const amber = screen.getByTestId('expiry-tier-amber');
    expect(within(red).getByTestId('expiry-row-r1')).toBeInTheDocument();
    expect(within(red).queryByTestId('expiry-row-a1')).not.toBeInTheDocument();
    expect(within(amber).getByTestId('expiry-row-a1')).toBeInTheDocument();
    expect(within(amber).getByTestId('expiry-row-a2')).toBeInTheDocument();
    // per-section row counts
    expect(screen.getByTestId('expiry-tier-red-count')).toHaveTextContent('1');
    expect(screen.getByTestId('expiry-tier-amber-count')).toHaveTextContent('2');
  });

  it('renders a row with an LP detail link and a days-left value', () => {
    renderExpiry([makeRow({ lpId: 'lp-x', lpNumber: 'LP-9999', tier: 'amber', daysLeft: 12 })], 0, 1);
    const link = screen.getByTestId('expiry-link-lp-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/license-plates/lp-x');
    expect(link).toHaveTextContent('LP-9999');
    const row = screen.getByTestId('expiry-row-lp-x');
    expect(within(row).getByText('12d')).toBeInTheDocument();
  });

  it('renders an expired row with the "expired Nd ago" days-left copy', () => {
    renderExpiry([makeRow({ lpId: 'exp', tier: 'red', daysLeft: -6 })], 1, 0);
    const row = screen.getByTestId('expiry-row-exp');
    expect(within(row).getByText(EN.expired.replace('{days}', '6'))).toBeInTheDocument();
  });

  it('renders Force block DISABLED with a "Coming soon" title (red-line, never faked)', () => {
    renderExpiry([makeRow({ lpId: 'lp-1' })], 1, 0);
    const btn = screen.getByTestId('expiry-force-block-lp-1');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', EN.forceBlockComingSoon);
    expect(btn).toHaveTextContent(EN.forceBlock);
  });

  it('shows the global empty state when there are no rows', () => {
    renderExpiry([], 0, 0);
    expect(screen.getByTestId('expiry-empty')).toHaveTextContent(EN.empty);
    expect(screen.queryByTestId('expiry-tier-red')).not.toBeInTheDocument();
    expect(screen.queryByTestId('expiry-tier-amber')).not.toBeInTheDocument();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildExpiryLabels(locale));
      expect(flat).not.toMatch(/expiryPage\.[a-z]/i);
      expect(flat).not.toMatch(/dashboard\.status\./i);
    }
    expect(buildExpiryLabels('pl').forceBlock).not.toBe(EN.forceBlock);
  });
});
