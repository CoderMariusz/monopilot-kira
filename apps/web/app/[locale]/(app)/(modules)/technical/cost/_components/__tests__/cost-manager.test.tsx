/**
 * @vitest-environment jsdom
 *
 * T-050 — CostManager (TEC-050) RTL tests (real component, mocked Server Actions).
 *
 * Prototype anchors (verified with `wc -l` = 1659):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:633-692 (CostHistoryScreen)
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585 (CostingScreen)
 *
 * Parity + behaviour:
 *   - item picker (shadcn Select, not raw <select>), cost-history table with
 *     Date / Source / Cost / Δ% / Reason, sparkline.
 *   - NUMERIC-exact display: cost strings shown verbatim; Δ% exact.
 *   - Edit modal calls postCost; on `approver_required` reveals the approver field.
 *   - empty + permission-denied states.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listCostHistory = vi.fn();
const postCost = vi.fn();

vi.mock('../../_actions/list-cost-history', () => ({ listCostHistory: (...a: unknown[]) => listCostHistory(...a) }));
vi.mock('../../_actions/post-cost', () => ({ postCost: (...a: unknown[]) => postCost(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { CostManager } from '../cost-manager.client';
import type { CostItemOption } from '../../_actions/list-cost-items';

const ITEMS: CostItemOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', itemCode: 'RM-1001', name: 'Pork shoulder', costPerKg: '12.3400' },
  { id: '22222222-2222-2222-2222-222222222222', itemCode: 'FG-2001', name: 'Sausage', costPerKg: '20.0000' },
];

const HISTORY = {
  ok: true as const,
  data: {
    rows: [
      {
        id: 'h2',
        itemId: ITEMS[0].id,
        costPerKg: '12.3400',
        currency: 'PLN',
        effectiveFrom: '2026-05-01',
        effectiveTo: null,
        source: 'manual' as const,
        createdBy: null,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'h1',
        itemId: ITEMS[0].id,
        costPerKg: '10.0000',
        currency: 'PLN',
        effectiveFrom: '2026-04-01',
        effectiveTo: '2026-04-30',
        source: 'd365_sync' as const,
        createdBy: null,
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CostManager — T-050 (other-screens.jsx:633-692)', () => {
  it('parity: renders the item picker as a combobox (no raw <select>) and the history table with exact NUMERIC + Δ%', async () => {
    listCostHistory.mockResolvedValue(HISTORY);
    render(<CostManager items={ITEMS} canEdit />);

    // shadcn Select → role=combobox (red-line: never a raw <select>)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    expect(document.querySelector('select')).toBeNull();

    const table = await screen.findByRole('table', { name: 'Cost history' });
    // NUMERIC shown EXACTLY: 12.3400 → 12.34, 10.0000 → 10.00
    expect(within(table).getByText('12.34')).toBeInTheDocument();
    expect(within(table).getByText('10.00')).toBeInTheDocument();
    // Δ% of the newest row vs the prior (10.00 → 12.34) = +23.4%
    expect(within(table).getByText('+23.4%')).toBeInTheDocument();
    // sparkline rendered
    expect(screen.getByRole('img', { name: 'Cost per kg sparkline' })).toBeInTheDocument();
  });

  it('interaction: Edit cost opens the modal and reveals the approver field on approver_required (>20% V-TEC-53)', async () => {
    const user = userEvent.setup();
    listCostHistory.mockResolvedValue(HISTORY);
    postCost.mockResolvedValueOnce({ ok: false, error: 'approver_required' });
    render(<CostManager items={ITEMS} canEdit />);

    await screen.findByRole('table', { name: 'Cost history' });
    await user.click(screen.getByRole('button', { name: 'Edit cost' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Edit cost · RM-1001/)).toBeInTheDocument();
    // no approver field until the server says it's needed
    expect(within(dialog).queryByLabelText(/Approver/)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/New cost \/ kg/), '99.0000');
    await user.click(within(dialog).getByRole('button', { name: 'Record cost' }));

    await waitFor(() => expect(postCost).toHaveBeenCalledTimes(1));
    expect(postCost).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: ITEMS[0].id, costPerKg: '99.0000', source: 'manual' }),
    );
    // approver-required surfaced + field revealed
    expect(await within(dialog).findByText(/exceeds 20%/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Approver/)).toBeInTheDocument();
  });

  it('state: permission-denied hides the Edit CTA and shows the read-only notice', async () => {
    listCostHistory.mockResolvedValue(HISTORY);
    render(<CostManager items={ITEMS} canEdit={false} />);
    await screen.findByRole('table', { name: 'Cost history' });
    expect(screen.queryByRole('button', { name: 'Edit cost' })).not.toBeInTheDocument();
    expect(screen.getByText(/do not have permission to edit master cost/)).toBeInTheDocument();
  });

  it('state: empty history renders the empty message', async () => {
    listCostHistory.mockResolvedValue({ ok: true, data: { rows: [] } });
    render(<CostManager items={ITEMS} canEdit />);
    expect(await screen.findByText(/No cost history yet for RM-1001/)).toBeInTheDocument();
  });

  it('state: a failed history load renders the error alert', async () => {
    listCostHistory.mockResolvedValue({ ok: false, error: 'persistence_failed' });
    render(<CostManager items={ITEMS} canEdit />);
    expect(await screen.findByText(/Unable to load cost history/)).toBeInTheDocument();
  });
});
