/**
 * WAVE E9 — /planning/suppliers/[id]/scorecard RTL tests (jsdom).
 *
 * The async RSC page resolves getSupplierScorecard server-side; here we exercise
 * the client view against a mocked scorecard payload: KPI tiles (on-time %, avg
 * qty variance %, NCRs, open NCRs) and the recent-POs table with per-row on-time
 * / variance flags + the honest empty state.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ScorecardView, type ScorecardLabels } from '../_components/scorecard-view';
import type { SupplierScorecard } from '../../../../_actions/freight-actions';

const LABELS: ScorecardLabels = {
  kpis: {
    onTime: 'On-time %',
    onTimeHint: 'Share of received POs delivered on time.',
    qtyVariance: 'Avg qty variance',
    qtyVarianceHint: 'Average over/under received vs ordered.',
    ncr: 'NCRs',
    ncrHint: 'Total non-conformance reports.',
    openNcr: 'Open NCRs',
    openNcrHint: 'Not yet closed.',
  },
  recent: {
    title: 'Recent purchase orders',
    empty: 'No purchase orders for this supplier yet.',
    columns: {
      po: 'PO',
      status: 'Status',
      expected: 'Expected',
      received: 'Received',
      onTime: 'On time',
      variance: 'Qty variance',
    },
    onTimeYes: 'On time',
    onTimeNo: 'Late',
    pending: 'Pending',
    none: '—',
  },
};

const SCORECARD: SupplierScorecard = {
  onTimePct: 92.5,
  avgQtyVariancePct: -1.25,
  ncrCount: 4,
  openNcrCount: 1,
  recentPos: [
    {
      id: 'po-1',
      poNumber: 'PO-1001',
      status: 'received',
      expectedDelivery: '2026-06-01T00:00:00.000Z',
      receivedAt: '2026-06-03T00:00:00.000Z',
      onTime: false,
      qtyVariancePct: 6.5,
    },
    {
      id: 'po-2',
      poNumber: 'PO-1002',
      status: 'received',
      expectedDelivery: '2026-06-10T00:00:00.000Z',
      receivedAt: '2026-06-09T00:00:00.000Z',
      onTime: true,
      qtyVariancePct: 0,
    },
  ],
};

describe('/planning/suppliers/[id]/scorecard — ScorecardView', () => {
  it('renders the four KPI tiles from the mocked loader payload', () => {
    render(<ScorecardView scorecard={SCORECARD} labels={LABELS} />);

    expect(screen.getByTestId('scorecard-kpi-on-time-value')).toHaveTextContent('92.5%');
    expect(screen.getByTestId('scorecard-kpi-qty-variance-value')).toHaveTextContent('-1.25%');
    expect(screen.getByTestId('scorecard-kpi-ncr-value')).toHaveTextContent('4');
    expect(screen.getByTestId('scorecard-kpi-open-ncr-value')).toHaveTextContent('1');
  });

  it('renders the recent-POs table with on-time / late + variance flags', () => {
    render(<ScorecardView scorecard={SCORECARD} labels={LABELS} />);

    expect(screen.getByTestId('scorecard-recent-table')).toBeInTheDocument();

    const late = screen.getByTestId('scorecard-po-PO-1001');
    expect(late).toHaveTextContent('PO-1001');
    expect(late).toHaveTextContent('Late');
    expect(late).toHaveTextContent('+6.5%');

    const onTime = screen.getByTestId('scorecard-po-PO-1002');
    expect(onTime).toHaveTextContent('On time');
    expect(onTime).toHaveTextContent('0%');
  });

  it('shows an em-dash for a null KPI and the pending badge for an unreceived PO', () => {
    const partial: SupplierScorecard = {
      onTimePct: null,
      avgQtyVariancePct: null,
      ncrCount: 0,
      openNcrCount: 0,
      recentPos: [
        {
          id: 'po-3',
          poNumber: 'PO-1003',
          status: 'sent',
          expectedDelivery: '2026-07-01T00:00:00.000Z',
          receivedAt: null,
          onTime: null,
          qtyVariancePct: null,
        },
      ],
    };
    render(<ScorecardView scorecard={partial} labels={LABELS} />);

    expect(screen.getByTestId('scorecard-kpi-on-time-value')).toHaveTextContent('—');
    expect(screen.getByTestId('scorecard-kpi-qty-variance-value')).toHaveTextContent('—');
    expect(screen.getByTestId('scorecard-po-PO-1003')).toHaveTextContent('Pending');
  });

  it('shows the honest empty state when there are no recent POs', () => {
    const empty: SupplierScorecard = {
      onTimePct: null,
      avgQtyVariancePct: null,
      ncrCount: 0,
      openNcrCount: 0,
      recentPos: [],
    };
    render(<ScorecardView scorecard={empty} labels={LABELS} />);

    expect(screen.getByTestId('scorecard-recent-empty')).toHaveTextContent(
      'No purchase orders for this supplier yet.',
    );
    expect(screen.queryByTestId('scorecard-recent-table')).toBeNull();
  });
});
