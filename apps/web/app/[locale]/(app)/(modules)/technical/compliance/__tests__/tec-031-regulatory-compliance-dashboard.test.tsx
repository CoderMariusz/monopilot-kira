/**
 * @vitest-environment jsdom
 *
 * T-087 — TEC-031 Regulatory Compliance Dashboard: RTL parity + state tests.
 *
 * Spec-driven anchor (layout-primitive, verified with `wc -l` = 793):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:359-446
 *   (regulatory_compliance_dashboard_screen).
 *
 * The page is an async RSC reading Supabase via withOrgContext (exercised live).
 * Here we test the pure presentational ComplianceDashboard + its parity surface:
 *   - routing-only notice (not legal advice)
 *   - 5 per-regulation KPI tiles in spec order
 *   - coverage-by-regulation bars
 *   - per-FG flag table with a Route → action dispatching to the owning module
 *   - empty (no flags) state
 *   - real (non-mocked) coverage % rendered verbatim
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ComplianceDashboard, type ComplianceCopy } from '../_components/compliance-dashboard.client';
import {
  REGULATION_CODES,
  type ComplianceFlag,
  type RegulationCoverage,
} from '../_actions/shared';

afterEach(cleanup);

const COPY: ComplianceCopy = {
  routingNotice: 'Routing only. Surfaces gaps; not legal advice.',
  coverageTitle: 'Coverage by regulation',
  flagsTitle: (n) => `Per-FG flags · ${n}`,
  flagsHint: 'Click Route to dispatch.',
  col: { fg: 'Finished good', regulation: 'Regulation', issue: 'Issue', severity: 'Severity', action: '' },
  route: 'Route →',
  emptyTitle: 'No FG yet',
  emptyBody: 'No open compliance flags.',
  regulationLabel: (c) => c,
  regulationScope: (c) => `scope:${c}`,
  issueLabel: (k) => `issue:${k}`,
  remediationLabel: (k) => `rem:${k}`,
  severityLabel: (s) => s,
  gapsLabel: (n) => `${n} gaps`,
};

const REGS: RegulationCoverage[] = [
  { code: 'eu_1169_2011', total: 10, covered: 10, coveragePct: 100, gaps: 0, tone: 'green' },
  { code: 'fsma_204', total: 10, covered: 9, coveragePct: 90, gaps: 1, tone: 'amber' },
  { code: 'brcgs_v9', total: 10, covered: 8, coveragePct: 80, gaps: 2, tone: 'red' },
  { code: 'iso_22000', total: 10, covered: 9, coveragePct: 90, gaps: 1, tone: 'amber' },
  { code: 'eu_2023_915', total: 10, covered: 7, coveragePct: 70, gaps: 3, tone: 'red' },
];

const FLAGS: ComplianceFlag[] = [
  {
    id: 'i1:fsma_204',
    fg: 'FG5101 Sausage',
    regulation: 'fsma_204',
    issueKey: 'factory_spec_unapproved',
    severity: 'high',
    routeTo: 'technical',
    routeHref: '/technical/factory-specs',
  },
  {
    id: 'i2:eu_2023_915',
    fg: 'FG5400 Meatballs',
    regulation: 'eu_2023_915',
    issueKey: 'lab_result_failing',
    severity: 'high',
    routeTo: 'quality',
    routeHref: '/quality/lab',
  },
];

describe('TEC-031 parity (spec-driven-screens.jsx:359-446)', () => {
  it('renders the routing-only notice (remediation routing, not legal advice)', () => {
    render(<ComplianceDashboard regulations={REGS} flags={FLAGS} copy={COPY} />);
    expect(screen.getByTestId('compliance-routing-notice')).toHaveTextContent(/routing only/i);
  });

  it('renders exactly 5 KPI tiles in the spec regulation order', () => {
    render(<ComplianceDashboard regulations={REGS} flags={FLAGS} copy={COPY} />);
    const strip = screen.getByTestId('compliance-kpi-strip');
    const tiles = within(strip).getAllByTestId(/^compliance-kpi-/);
    expect(tiles).toHaveLength(5);
    expect(tiles.map((el) => el.getAttribute('data-testid'))).toEqual(
      REGULATION_CODES.map((c) => `compliance-kpi-${c}`),
    );
  });

  it('shows real coverage % verbatim on each tile (no fabrication)', () => {
    render(<ComplianceDashboard regulations={REGS} flags={FLAGS} copy={COPY} />);
    expect(within(screen.getByTestId('compliance-kpi-eu_1169_2011')).getByText('100%')).toBeInTheDocument();
    expect(within(screen.getByTestId('compliance-kpi-eu_2023_915')).getByText('70%')).toBeInTheDocument();
  });

  it('renders coverage bars for every regulation', () => {
    render(<ComplianceDashboard regulations={REGS} flags={FLAGS} copy={COPY} />);
    for (const c of REGULATION_CODES) {
      expect(screen.getByTestId(`compliance-bar-${c}`)).toBeInTheDocument();
    }
  });
});

describe('TEC-031 per-FG flags table (Route → owning module, never auto-resolved)', () => {
  it('renders one row per flag with a Route link to the owning module', () => {
    render(<ComplianceDashboard regulations={REGS} flags={FLAGS} copy={COPY} />);
    const route1 = screen.getByTestId('compliance-route-i1:fsma_204');
    expect(route1).toHaveAttribute('href', '/technical/factory-specs');
    expect(route1).toHaveAttribute('data-route-to', 'technical');

    const route2 = screen.getByTestId('compliance-route-i2:eu_2023_915');
    // Lab/HACCP lifecycle gaps route to 09-Quality (Quality owns the lifecycle).
    expect(route2).toHaveAttribute('href', '/quality/lab');
    expect(route2).toHaveAttribute('data-route-to', 'quality');
  });

  it('EMPTY flags state: shows the empty copy, no flag rows', () => {
    render(<ComplianceDashboard regulations={REGS} flags={[]} copy={COPY} />);
    expect(screen.getByTestId('compliance-flags-empty')).toHaveTextContent('No open compliance flags.');
    expect(screen.queryByTestId(/^compliance-flag-/)).not.toBeInTheDocument();
  });
});
