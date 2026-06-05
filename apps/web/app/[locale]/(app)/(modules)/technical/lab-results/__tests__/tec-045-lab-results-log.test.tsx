/**
 * @vitest-environment jsdom
 *
 * T-088 — TEC-045 Lab Results Log: RTL parity + state + read-only tests.
 *
 * Spec-driven anchor (layout-primitive, verified with `wc -l` = 793):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:451-546
 *   (lab_results_log_screen).
 *
 * The page is an async RSC reading the Quality-owned lab_results read model via
 * withOrgContext (exercised live). Here we test the pure presentational
 * LabResultsLog client: read-only banner + Open-in-QA cross-link, verdict filter
 * pills + search, verdict pills, ATP RLU pass/fail visualization, and the empty
 * state. There is NO write/NCR/sign-off CTA (Quality owns the lifecycle).
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LabResultsLog, type LabResultsCopy } from '../_components/lab-results-log.client';
import type { LabResultLogRow } from '../_actions/list-lab-results';

afterEach(cleanup);

const COPY: LabResultsCopy = {
  readOnlyNotice: 'Read-only here. To enter or sign off, open',
  openInQa: 'Open in QA →',
  qaHref: '/quality/lab',
  searchPlaceholder: 'Filter by FG / work order / lab id',
  sourceNote: 'Source: Quality-owned lab_results projection.',
  empty: 'No lab results match the current filter.',
  verdictLabel: (v) => v,
  testTypeLabel: (t) => t,
  col: { labId: 'Lab ID', taken: 'Taken', fgLot: 'FG / work order', test: 'Test', reading: 'Reading', verdict: 'Verdict', action: '' },
  rluUnit: 'RLU',
  thresholdLabel: (n) => `threshold ${n} RLU`,
  qualitativeLabel: 'n/a (qualitative)',
};

const ROWS: LabResultLogRow[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    itemId: 'item-1',
    siteId: null,
    workOrderId: 'wo-001-aaaa',
    qualityResultId: 'qr-1',
    testType: 'atp_swab',
    testCode: 'ATP-1',
    resultValue: '18',
    resultUnit: null,
    resultStatus: 'pass',
    thresholdRlu: '30',
    testedAt: '2026-04-19T09:14:00.000Z',
    labProvider: 'Hygiena EnSURE',
    notes: null,
    createdAt: '2026-04-19T09:14:00.000Z',
    itemCode: 'FG5101',
    itemName: 'Sausage',
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    itemId: 'item-2',
    siteId: null,
    workOrderId: 'wo-014-bbbb',
    qualityResultId: 'qr-2',
    testType: 'atp_swab',
    testCode: 'ATP-2',
    resultValue: '41',
    resultUnit: null,
    resultStatus: 'fail',
    thresholdRlu: '30',
    testedAt: '2026-04-18T14:32:00.000Z',
    labProvider: 'Hygiena EnSURE',
    notes: null,
    createdAt: '2026-04-18T14:32:00.000Z',
    itemCode: 'FG5210',
    itemName: 'Ham',
  },
];

describe('TEC-045 parity (spec-driven-screens.jsx:451-546)', () => {
  it('renders the read-only banner with an Open-in-QA cross-link (Quality owns lifecycle)', () => {
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    expect(screen.getByTestId('lab-results-readonly-notice')).toHaveTextContent(/read-only here/i);
    expect(screen.getByTestId('lab-results-qa-link')).toHaveAttribute('href', '/quality/lab');
  });

  it('renders the verdict filter pills and a row per result', () => {
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    expect(screen.getByTestId('lab-results-pill-all')).toBeInTheDocument();
    expect(screen.getByTestId('lab-results-pill-fail')).toBeInTheDocument();
    expect(screen.getByTestId(`lab-results-row-${ROWS[0].id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`lab-results-row-${ROWS[1].id}`)).toBeInTheDocument();
  });

  it('renders the ATP RLU pass/fail visualization with the verbatim reading', () => {
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    const passCell = screen.getByTestId(`lab-results-atp-${ROWS[0].id}`);
    expect(passCell).toHaveTextContent('18 RLU');
    const failCell = screen.getByTestId(`lab-results-atp-${ROWS[1].id}`);
    expect(failCell).toHaveTextContent('41 RLU');
  });

  it('does NOT render any write / add / NCR / sign-off control (read-only)', () => {
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    // The verdict filters are the design-system .tabs-counted (role="tab") toggles;
    // there is no plain write/action button on this read-only surface.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    // 6 verdict tabs (all/pass/fail/inconclusive/pending/hold) and nothing else.
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.queryByText(/add lab result/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/raise ncr/i)).not.toBeInTheDocument();
  });
});

describe('TEC-045 filter + empty state', () => {
  it('filters to a single verdict when a pill is clicked', async () => {
    const user = userEvent.setup();
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    await user.click(screen.getByTestId('lab-results-pill-fail'));
    expect(screen.queryByTestId(`lab-results-row-${ROWS[0].id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`lab-results-row-${ROWS[1].id}`)).toBeInTheDocument();
  });

  it('shows the empty copy when no rows match the search', async () => {
    const user = userEvent.setup();
    render(<LabResultsLog rows={ROWS} copy={COPY} />);
    await user.type(screen.getByTestId('lab-results-search'), 'zzz-no-match');
    expect(screen.getByTestId('lab-results-empty')).toHaveTextContent('No lab results match the current filter.');
  });

  it('EMPTY data state: shows empty copy when there are zero rows', () => {
    render(<LabResultsLog rows={[]} copy={COPY} />);
    expect(screen.getByTestId('lab-results-empty')).toBeInTheDocument();
  });
});
