/**
 * @vitest-environment jsdom
 *
 * T-089 — TEC-052 Cost Import from D365: RTL parity + state + R15 tests.
 *
 * RELOCATED 2026-06-05 with the D365 group into Settings › Integrations › D365
 * (old path technical/costs/d365-import/__tests__/...). Imports are co-located
 * with the relocated component/actions so they move unchanged.
 *
 * Spec-driven anchor (layout-primitive, verified with `wc -l` = 793):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:551-648
 *   (cost_import_d365_screen).
 *
 * The page is an async RSC reading the D365 gate + cost diff via withOrgContext
 * (exercised live). Here we test the pure presentational CostImport client:
 *   - D365-disabled banner that keeps the rest of Settings usable (source-of-truth note)
 *   - KPI tiles, diff table with Δ% colour-coding (sign + value, never colour-only)
 *   - sign-off ReasonInput required on |Δ| ≥ 5% before Apply
 *   - Apply enqueues the import via the (mocked) trigger action
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const triggerCostImport = vi.fn();
vi.mock('../_actions/trigger-cost-import', () => ({
  triggerCostImport: (...a: unknown[]) => triggerCostImport(...a),
}));

import { CostImport, type CostImportCopy } from '../_components/cost-import.client';
import type { CostDiffRow } from '../_actions/load-d365-cost-import';

afterEach(() => {
  cleanup();
  triggerCostImport.mockReset();
});

const COPY: CostImportCopy = {
  disabledBanner: 'D365 connector disabled for this org. Cost import is unavailable.',
  settingsLink: 'Settings › Integrations',
  settingsHref: '/settings/integrations/d365',
  sourceOfTruthNote: 'Local cost history is source of truth. Import appends source=d365_sync; never overwrites in place.',
  kpi: { connector: 'Connector', connectorValue: 'OK', pulled: 'Items pulled', changed: 'Changed', over5: '|Δ| ≥ 5%' },
  signoffLabel: 'Sign-off reason',
  signoffHelp: 'Required when |Δ| ≥ 5% (min 10 chars).',
  signoffPlaceholder: 'reason…',
  apply: 'Apply import',
  applying: 'Applying…',
  applied: 'Import enqueued (job {jobId}).',
  duplicate: 'Already enqueued for today.',
  triggerForbidden: 'No permission to trigger import.',
  triggerError: 'Unable to trigger import.',
  col: { code: 'Code', name: 'Name', current: 'Current', incoming: 'Incoming', delta: 'Δ %', source: 'Source' },
  empty: 'No incoming D365 cost differences.',
  noChange: 'no change',
};

const ROWS: CostDiffRow[] = [
  { itemId: 'i1', itemCode: 'RM-1001', name: 'Pork', current: '8.4000', incoming: '8.6500', deltaPct: '2.98', needsSignoff: false, source: 'D365 ItemPrice' },
  { itemId: 'i2', itemCode: 'RM-3001', name: 'Casing', current: '12.4000', incoming: '13.0500', deltaPct: '5.24', needsSignoff: true, source: 'D365 ItemPrice' },
];
const COUNTS = { changed: 2, over5: 1, same: 0 };

describe('TEC-052 D365 disabled state (R15: keeps Settings usable, never blocks release)', () => {
  it('shows the disabled banner + settings link + source-of-truth note; no diff/apply', () => {
    render(<CostImport d365Enabled={false} canTrigger={false} rows={[]} counts={{ changed: 0, over5: 0, same: 0 }} copy={COPY} />);
    expect(screen.getByTestId('d365-cost-import-disabled')).toHaveTextContent(/connector disabled/i);
    expect(screen.getByTestId('d365-cost-import-settings-link')).toHaveAttribute('href', '/settings/integrations/d365');
    expect(screen.getByTestId('d365-cost-import-sot-note')).toHaveTextContent(/source of truth/i);
    expect(screen.queryByTestId('d365-cost-import-apply')).not.toBeInTheDocument();
  });
});

describe('TEC-052 parity (spec-driven-screens.jsx:551-648)', () => {
  it('renders KPI tiles, the diff table and the source-of-truth note (append-only, never overwrite)', () => {
    render(<CostImport d365Enabled canTrigger rows={ROWS} counts={COUNTS} copy={COPY} />);
    expect(screen.getByTestId('d365-cost-import-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('d365-cost-import-row-RM-1001')).toBeInTheDocument();
    expect(screen.getByTestId('d365-cost-import-row-RM-3001')).toBeInTheDocument();
    expect(screen.getByTestId('d365-cost-import-sot-note')).toHaveTextContent(/never overwrites in place/i);
  });

  it('renders Δ% with sign + value verbatim (colour is not the sole signal) and flags |Δ|≥5% rows', () => {
    render(<CostImport d365Enabled canTrigger rows={ROWS} counts={COUNTS} copy={COPY} />);
    expect(screen.getByTestId('d365-cost-import-row-RM-1001')).toHaveTextContent('+2.98%');
    const over = screen.getByTestId('d365-cost-import-row-RM-3001');
    expect(over).toHaveTextContent('+5.24%');
    expect(over).toHaveAttribute('data-needs-signoff', 'true');
  });
});

describe('TEC-052 sign-off gate + apply', () => {
  it('disables Apply until a sign-off reason is entered when a |Δ|≥5% row exists', async () => {
    const user = userEvent.setup();
    render(<CostImport d365Enabled canTrigger rows={ROWS} counts={COUNTS} copy={COPY} />);
    const apply = screen.getByTestId('d365-cost-import-apply');
    expect(apply).toBeDisabled();
    await user.type(screen.getByTestId('d365-cost-import-reason'), 'Q2 cost refresh approved');
    expect(apply).not.toBeDisabled();
  });

  it('Apply calls the trigger action and shows the enqueued feedback', async () => {
    triggerCostImport.mockResolvedValue({ ok: true, jobId: 'job-1234abcd', duplicate: false });
    const user = userEvent.setup();
    render(<CostImport d365Enabled canTrigger rows={ROWS} counts={COUNTS} copy={COPY} />);
    await user.type(screen.getByTestId('d365-cost-import-reason'), 'Q2 cost refresh approved');
    await user.click(screen.getByTestId('d365-cost-import-apply'));
    await waitFor(() => expect(triggerCostImport).toHaveBeenCalledOnce());
    expect(triggerCostImport).toHaveBeenCalledWith({ reason: 'Q2 cost refresh approved' });
    await waitFor(() =>
      expect(screen.getByTestId('d365-cost-import-feedback')).toHaveTextContent('Import enqueued (job job-1234'),
    );
  });

  it('keeps Apply disabled when the caller lacks the sync_trigger permission', () => {
    render(<CostImport d365Enabled canTrigger={false} rows={ROWS} counts={COUNTS} copy={COPY} />);
    expect(screen.getByTestId('d365-cost-import-apply')).toBeDisabled();
  });

  it('EMPTY state: shows empty copy when D365 is on but there is no incoming diff', () => {
    render(<CostImport d365Enabled canTrigger rows={[]} counts={{ changed: 0, over5: 0, same: 0 }} copy={COPY} />);
    expect(screen.getByTestId('d365-cost-import-empty')).toHaveTextContent('No incoming D365 cost differences.');
  });
});
