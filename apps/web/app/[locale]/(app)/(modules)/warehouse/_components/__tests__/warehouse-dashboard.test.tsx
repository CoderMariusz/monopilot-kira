/**
 * WH-001 — Warehouse dashboard client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/dashboard.jsx:3-213.
 * Tests the presentational <WarehouseDashboardClient> directly (the page is an async
 * RSC that reads Supabase via listLPs/getExpiryDashboard/getInventoryByProduct and is
 * exercised live). Asserts:
 *   - the 6 computable KPI cards render with values (parity dashboard.jsx:39-60)
 *   - inventory-value + FEFO-override cards are OMITTED (documented red-line)
 *   - expiry summary red/amber cards reflect the 7d/30d counts (dashboard.jsx:99-110)
 *   - top-5 table renders rows with LP link, item, batch, status (dashboard.jsx:113-127)
 *   - empty top-5 state
 *   - i18n: en + pl staged bundles resolve every label (no leaked dotted key)
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  WarehouseDashboardClient,
  type DashboardExpiryRow,
  type DashboardKpis,
  type DashboardLabels,
} from '../warehouse-dashboard.client';
import { getWhdTranslator } from '../../wh-d-labels';

function buildLabels(locale: string): DashboardLabels {
  const t = getWhdTranslator(locale);
  return {
    kpi: {
      activeLps: t('dashboard.kpi.activeLps'),
      activeLpsSub: t('dashboard.kpi.activeLpsSub'),
      uniqueSkus: t('dashboard.kpi.uniqueSkus'),
      uniqueSkusSub: t('dashboard.kpi.uniqueSkusSub'),
      expiring7d: t('dashboard.kpi.expiring7d'),
      expiring7dSub: t('dashboard.kpi.expiring7dSub'),
      expiring30d: t('dashboard.kpi.expiring30d'),
      expiring30dSub: t('dashboard.kpi.expiring30dSub'),
      qcHold: t('dashboard.kpi.qcHold'),
      qcHoldSub: t('dashboard.kpi.qcHoldSub'),
      blocked: t('dashboard.kpi.blocked'),
      blockedSub: t('dashboard.kpi.blockedSub'),
    },
    expiry: {
      title: t('dashboard.expiry.title'),
      open: t('dashboard.expiry.open'),
      redCard: t('dashboard.expiry.redCard'),
      redCardSub: t('dashboard.expiry.redCardSub'),
      amberCard: t('dashboard.expiry.amberCard'),
      amberCardSub: t('dashboard.expiry.amberCardSub'),
      top5Title: t('dashboard.expiry.top5Title'),
      columns: {
        lp: t('dashboard.expiry.columns.lp'),
        product: t('dashboard.expiry.columns.product'),
        batch: t('dashboard.expiry.columns.batch'),
        expiry: t('dashboard.expiry.columns.expiry'),
        location: t('dashboard.expiry.columns.location'),
        status: t('dashboard.expiry.columns.status'),
      },
      empty: t('dashboard.expiry.empty'),
      daysLeft: t('dashboard.expiry.daysLeft'),
      expired: t('dashboard.expiry.expired'),
      none: t('dashboard.expiry.none'),
    },
    omitted: {
      inventoryValue: t('dashboard.omitted.inventoryValue'),
      fefoOverride: t('dashboard.omitted.fefoOverride'),
    },
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

const EN = buildLabels('en');

const KPIS: DashboardKpis = {
  activeLps: 1247,
  uniqueSkus: 83,
  expiring7d: 12,
  expiring30d: 47,
  qcHold: 8,
  blocked: 3,
};

function makeExpiryRow(over: Partial<DashboardExpiryRow>): DashboardExpiryRow {
  return {
    lpId: over.lpId ?? 'lp-1',
    lpNumber: over.lpNumber ?? 'LP00000007',
    tier: over.tier ?? 'red',
    itemCode: over.itemCode ?? 'R-1002',
    itemName: over.itemName ?? 'Słonina wieprzowa',
    batchNumber: over.batchNumber ?? 'B-2026-02-01',
    locationCode: over.locationCode ?? 'COLD-B2',
    warehouseCode: over.warehouseCode ?? 'WH-A',
    expiryDate: over.expiryDate ?? '2026-04-15T00:00:00.000Z',
    daysLeft: over.daysLeft ?? -6,
    status: over.status ?? 'blocked',
  };
}

function renderDashboard(rows: DashboardExpiryRow[], kpis: DashboardKpis = KPIS, labels: DashboardLabels = EN) {
  return render(<WarehouseDashboardClient kpis={kpis} expiryRows={rows} labels={labels} locale="en" />);
}

describe('WarehouseDashboardClient (WH-001 parity)', () => {
  it('renders the six computable KPI cards with their values', () => {
    renderDashboard([makeExpiryRow({})]);
    expect(within(screen.getByTestId('wh-kpi-activeLps-value')).getByText('1,247')).toBeInTheDocument();
    expect(within(screen.getByTestId('wh-kpi-uniqueSkus-value')).getByText('83')).toBeInTheDocument();
    expect(within(screen.getByTestId('wh-kpi-expiring7d-value')).getByText('12')).toBeInTheDocument();
    expect(within(screen.getByTestId('wh-kpi-expiring30d-value')).getByText('47')).toBeInTheDocument();
    expect(within(screen.getByTestId('wh-kpi-qcHold-value')).getByText('8')).toBeInTheDocument();
    expect(within(screen.getByTestId('wh-kpi-blocked-value')).getByText('3')).toBeInTheDocument();
  });

  it('omits the inventory-value and FEFO-override cards (documented red-line)', () => {
    renderDashboard([makeExpiryRow({})]);
    // No value/FEFO KPI tile renders…
    expect(screen.queryByTestId('wh-kpi-inventoryValue')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wh-kpi-fefo')).not.toBeInTheDocument();
    // …but the omission is documented (auditable) rather than silently dropped.
    expect(screen.getByTestId('wh-kpi-omitted-value')).toHaveTextContent(EN.omitted.inventoryValue);
    expect(screen.getByTestId('wh-kpi-omitted-fefo')).toHaveTextContent(EN.omitted.fefoOverride);
  });

  it('renders the expiry summary red/amber cards from the 7d/30d counts', () => {
    renderDashboard([makeExpiryRow({})]);
    expect(screen.getByTestId('wh-expiry-card-red-count')).toHaveTextContent('12');
    expect(screen.getByTestId('wh-expiry-card-amber-count')).toHaveTextContent('47');
  });

  it('renders the top-5 table with an LP detail link, item, batch and status', () => {
    renderDashboard([makeExpiryRow({ lpId: 'lp-x', lpNumber: 'LP-9999', status: 'reserved' })]);
    const link = screen.getByTestId('wh-expiry-top5-link-lp-x');
    expect(link).toHaveAttribute('href', '/en/warehouse/license-plates/lp-x');
    expect(link).toHaveTextContent('LP-9999');
    expect(screen.getByTestId('wh-expiry-top5-row-lp-x')).toHaveTextContent('B-2026-02-01');
    expect(screen.getByTestId('wh-expiry-top5-status-lp-x')).toHaveTextContent(EN.status.reserved);
  });

  it('shows the empty top-5 state when there are no expiring rows', () => {
    renderDashboard([]);
    expect(screen.getByTestId('wh-expiry-top5-empty')).toHaveTextContent(EN.expiry.empty);
    expect(screen.queryByTestId('wh-expiry-top5-table')).not.toBeInTheDocument();
  });

  it('resolves every staged i18n key in en and pl (no leaked dotted keys)', () => {
    for (const locale of ['en', 'pl']) {
      const flat = JSON.stringify(buildLabels(locale));
      expect(flat).not.toMatch(/dashboard\.[a-z]/i);
      expect(flat).not.toMatch(/kpi\.[a-z]/i);
    }
    // pl differs from en (real translation, not an EN echo)
    expect(buildLabels('pl').kpi.activeLps).not.toBe(EN.kpi.activeLps);
  });
});
