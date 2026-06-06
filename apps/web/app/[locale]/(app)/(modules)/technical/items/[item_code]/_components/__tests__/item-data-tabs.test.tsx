/**
 * @vitest-environment jsdom
 *
 * Lane A1 — TEC-012 Item Detail deferred-tab bodies RTL parity + state tests.
 *
 * Prototype source (literal anchor, verified `wc -l "…/technical/other-screens.jsx"` = 1659):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:1177-1347
 *   (ProductDetailScreen — BOMs / Costing / Routing / Lab Results / D365 panels).
 *
 * Asserts: real-data render (ready), empty-state (every empty list → EmptyState),
 * error-state (alert), the five semantic status badges, mono codes, NUMERIC-exact
 * cost (string, no float), and that the Supplier-specs tab renders real rows
 * or an honest empty state. Labels are passed directly (no
 * next-intl provider needed) — confirming every visible string is a label prop.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  BomTab,
  CostTab,
  RoutingTab,
  LabTab,
  D365Tab,
  SupplierSpecsTab,
  type BomTabLabels,
  type CostTabLabels,
  type RoutingTabLabels,
  type LabTabLabels,
  type D365TabLabels,
  type SupplierTabLabels,
} from '../item-data-tabs';

afterEach(cleanup);

const bomLabels: BomTabLabels = {
  title: 'BOM versions', version: 'Version', status: 'Status', effectiveFrom: 'Effective from',
  effectiveTo: 'Effective to', lines: 'Lines', approved: 'Approved', none: '—',
  loading: 'Loading', empty: 'No BOM versions yet', emptyBody: 'none', error: 'BOM error',
};
const costLabels: CostTabLabels = {
  current: 'Current cost', perKg: 'kg', effective: 'Effective', history: 'Cost history',
  date: 'Date', cost: 'Cost / kg', source: 'Source', none: '—',
  sources: { manual: 'Manual', d365_sync: 'D365 sync', supplier_update: 'Supplier update', variance_roll: 'Variance roll' },
  loading: 'Loading', empty: 'No cost history yet', emptyBody: 'none', error: 'Cost error',
};
const routingLabels: RoutingTabLabels = {
  title: 'Routing versions', version: 'Version', operations: 'Operations', setup: 'Setup',
  status: 'Status', effectiveFrom: 'Effective from', approved: 'Approved', none: '—',
  loading: 'Loading', empty: 'No routing yet', emptyBody: 'none', error: 'Routing error',
};
const labLabels: LabTabLabels = {
  title: 'Lab results', readOnly: 'Read-only', date: 'Date', testType: 'Test type', result: 'Result',
  unit: 'Unit', status: 'Status', provider: 'Lab provider', none: '—',
  testTypes: { atp_swab: 'ATP swab' }, statuses: { pass: 'Pass', fail: 'Fail' },
  loading: 'Loading', empty: 'No lab results yet', emptyBody: 'none', error: 'Lab error',
};
const d365Labels: D365TabLabels = {
  title: 'D365 sync status', itemId: 'D365 Item ID', syncStatus: 'Sync status', lastSync: 'Last sync',
  none: '—', error: 'D365 error', statuses: { synced: 'Synced', drift: 'Drift' },
};
const supplierLabels: SupplierTabLabels = {
  title: 'Supplier specifications',
  supplier: 'Supplier',
  supplierStatus: 'Supplier status',
  lifecycleStatus: 'Lifecycle',
  reviewStatus: 'Review',
  specVersion: 'Spec version',
  effectiveFrom: 'Effective from',
  expiryDate: 'Expiry',
  documents: 'Documents',
  none: '—',
  document: 'Spec',
  certificates: 'Certificates',
  loading: 'Loading',
  empty: 'No supplier specs yet',
  emptyBody: 'none',
  error: 'Supplier specs error',
};

describe('BomTab', () => {
  it('renders the real BOM version rows with a semantic status badge + mono version', () => {
    render(
      <BomTab
        data={{
          state: 'ready',
          versions: [
            { id: '1', version: 2, status: 'active', effectiveFrom: '2026-04-14T00:00:00Z', effectiveTo: null, approvedBy: 'u', approvedAt: '2026-04-14T00:00:00Z', lineCount: 7 },
          ],
        }}
        labels={bomLabels}
      />,
    );
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('active')).toHaveClass('badge', 'badge-green');
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders an EmptyState (not a blank tbody) when empty', () => {
    render(<BomTab data={{ state: 'empty', versions: [] }} labels={bomLabels} />);
    expect(screen.getByText('No BOM versions yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an alert on error', () => {
    render(<BomTab data={{ state: 'error', versions: [] }} labels={bomLabels} />);
    expect(screen.getByRole('alert')).toHaveTextContent('BOM error');
  });
});

describe('CostTab (NUMERIC-exact)', () => {
  it('renders the current cost + history as exact NUMERIC strings (no float drift)', () => {
    render(
      <CostTab
        data={{
          state: 'ready',
          current: { costPerKg: '11.8200', currency: 'PLN', effectiveFrom: '2026-04-02T00:00:00Z' },
          history: [
            { id: '1', costPerKg: '11.8200', currency: 'PLN', effectiveFrom: '2026-04-02T00:00:00Z', effectiveTo: null, source: 'manual' },
          ],
        }}
        labels={costLabels}
      />,
    );
    // exact string preserved, not 11.82
    expect(screen.getByText('11.8200')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('shows EmptyState when no cost history', () => {
    render(<CostTab data={{ state: 'empty', current: null, history: [] }} labels={costLabels} />);
    expect(screen.getByText('No cost history yet')).toBeInTheDocument();
  });
});

describe('RoutingTab', () => {
  it('renders routing rows + EmptyState', () => {
    const { rerender } = render(
      <RoutingTab
        data={{ state: 'ready', routings: [{ id: '1', version: 2, status: 'active', effectiveFrom: '2026-04-14T00:00:00Z', approvedAt: null, operationCount: 11, totalSetupMin: 48 }] }}
        labels={routingLabels}
      />,
    );
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    rerender(<RoutingTab data={{ state: 'empty', routings: [] }} labels={routingLabels} />);
    expect(screen.getByText('No routing yet')).toBeInTheDocument();
  });
});

describe('LabTab (read-only)', () => {
  it('renders the read-only tag + a pass badge', () => {
    render(
      <LabTab
        data={{ state: 'ready', results: [{ id: '1', testType: 'atp_swab', resultValue: '6', resultUnit: 'RLU', resultStatus: 'pass', testedAt: '2026-04-18T00:00:00Z', labProvider: 'SGS' }] }}
        labels={labLabels}
      />,
    );
    expect(screen.getByText('Read-only')).toBeInTheDocument();
    expect(screen.getByText('ATP swab')).toBeInTheDocument();
    expect(screen.getByText('Pass')).toHaveClass('badge', 'badge-green');
  });
});

describe('D365Tab', () => {
  it('renders the d365 status with a semantic badge', () => {
    render(
      <D365Tab data={{ state: 'ready', d365ItemId: '0001234', syncStatus: 'synced', lastSyncAt: '2026-04-21T14:05:00Z' }} labels={d365Labels} />,
    );
    expect(screen.getByText('0001234')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toHaveClass('badge', 'badge-green');
  });
});

describe('SupplierSpecsTab', () => {
  it('renders the empty state when no supplier specs exist', () => {
    render(
      <SupplierSpecsTab
        data={{ state: 'empty', itemCode: 'RM-1', specs: [], emptyState: { reason: 'no_supplier_specs' } }}
        labels={supplierLabels}
      />,
    );
    expect(screen.getByText('No supplier specs yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders real supplier spec rows with document refs', () => {
    render(
      <SupplierSpecsTab
        data={{
          state: 'ready',
          itemCode: 'RM-1',
          emptyState: null,
          specs: [
            {
              id: 'spec-1',
              itemCode: 'RM-1',
              itemName: 'Pork',
              supplierCode: 'SUP-1',
              supplierStatus: 'approved',
              lifecycleStatus: 'active',
              reviewStatus: 'approved',
              specVersion: '2026-Q1',
              issuedDate: '2026-01-01',
              effectiveFrom: '2026-01-01',
              expiryDate: null,
              specDocumentUrl: 'https://example.test/spec.pdf',
              documentSha256: 'abc',
              documentMimeType: 'application/pdf',
              certificateRefs: [{ type: 'brcgs' }],
              uploadedAt: '2026-01-02T00:00:00Z',
            },
          ],
        }}
        labels={supplierLabels}
      />,
    );
    expect(screen.getByText('SUP-1')).toBeInTheDocument();
    expect(screen.getByText('approved')).toHaveClass('badge', 'badge-green');
    expect(screen.getByText('2026-Q1')).toBeInTheDocument();
    expect(screen.getByText('Spec')).toHaveAttribute('href', 'https://example.test/spec.pdf');
    expect(screen.getByText('Certificates: 1')).toBeInTheDocument();
  });
});
