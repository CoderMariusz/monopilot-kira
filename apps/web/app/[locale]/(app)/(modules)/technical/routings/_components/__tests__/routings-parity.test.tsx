/**
 * @vitest-environment jsdom
 *
 * Routings rebuild — design-system parity gate (lane A2).
 *
 * Prototype anchors (verified with `wc -l`):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:4-34 (RoutingsScreen)
 *   prototypes/design/Monopilot Design System/technical/modals.jsx:271-304 (RoutingStepAddModal)
 *
 * Asserts MON-design-system conformance on the restyled RoutingsManager:
 *  - dense `.card` shells (no `rounded-xl bg-white shadow-sm` drift)
 *  - `.table` dense table with mono lead cell
 *  - semantic `.badge` status chips
 *  - `.empty-state` for empty routings
 *  - `.alert` permission-denied notice
 *  - i18n: labels are injected, never hardcoded (the picker label renders the
 *    provided value)
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const listRoutings = vi.fn();
const routingCostPreview = vi.fn();

vi.mock('../../_actions/list-routings', () => ({ listRoutings: (...a: unknown[]) => listRoutings(...a) }));
vi.mock('../../_actions/create-routing', () => ({ createRouting: vi.fn() }));
vi.mock('../../_actions/update-routing', () => ({ updateRouting: vi.fn() }));
vi.mock('../../_actions/approve-routing', () => ({ approveRouting: vi.fn(), publishRouting: vi.fn() }));
vi.mock('../../_actions/cost-preview', () => ({ routingCostPreview: (...a: unknown[]) => routingCostPreview(...a) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RoutingsManager, ROUTINGS_DEFAULT_LABELS } from '../routings-manager.client';
import type { RoutingItemOption, ResourceOption } from '../../_actions/list-routing-items';

const ITEMS: RoutingItemOption[] = [
  { id: '11111111-1111-1111-1111-111111111111', itemCode: 'FG-2001', name: 'Sausage' },
];
const LINES: ResourceOption[] = [{ id: 'l1', code: 'LINE-A', name: 'Line A' }];
const MACHINES: ResourceOption[] = [{ id: 'm1', code: 'CUT-02', name: 'Cutter 2' }];
const OP_NAMES = ['Cutting', 'Smoking'];

const ROUTINGS = {
  ok: true as const,
  data: {
    routings: [
      { id: 'r1', itemId: ITEMS[0].id, version: 2, status: 'active' as const, effectiveFrom: '2026-05-01', effectiveTo: null, operationCount: 3 },
      { id: 'r0', itemId: ITEMS[0].id, version: 1, status: 'superseded' as const, effectiveFrom: '2026-04-01', effectiveTo: '2026-04-30', operationCount: 2 },
    ],
  },
};

const COST_PREVIEW = {
  ok: true as const,
  data: { routingId: 'r1', volume: '100', operations: [], totalCost: '0.00' },
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoutingsManager — design-system parity (lane A2)', () => {
  it('renders dense .card shells and a .table (no rounded-xl/shadow-sm drift) with a mono lead cell', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    const { container } = render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite
        canApprove
        labels={ROUTINGS_DEFAULT_LABELS}
      />,
    );

    await screen.findByRole('table', { name: ROUTINGS_DEFAULT_LABELS.versionsTableLabel });

    expect(container.querySelector('.card')).not.toBeNull();
    expect(container.querySelector('table.table, .card table')).not.toBeNull();
    // No heavy-card drift anywhere in the routings surface.
    expect(container.querySelector('.shadow-sm, .rounded-xl, [class*="bg-white"]')).toBeNull();
    // Lead version cell is mono.
    const lead = screen.getByText('v2');
    expect(lead.className).toMatch(/mono/);
    // Semantic badges
    expect(container.querySelector('.badge')).not.toBeNull();
  });

  it('empty routings renders a design-system .empty-state', async () => {
    listRoutings.mockResolvedValue({ ok: true, data: { routings: [] } });
    const { container } = render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite
        canApprove
        labels={ROUTINGS_DEFAULT_LABELS}
      />,
    );
    await waitFor(() => expect(container.querySelector('.empty-state')).not.toBeNull());
    expect(screen.getByText(ROUTINGS_DEFAULT_LABELS.emptyTitle)).toBeInTheDocument();
  });

  it('permission-denied renders a design-system .alert and hides the create CTA', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    const { container } = render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite={false}
        canApprove={false}
        labels={ROUTINGS_DEFAULT_LABELS}
      />,
    );
    await screen.findByRole('table', { name: ROUTINGS_DEFAULT_LABELS.versionsTableLabel });
    expect(container.querySelector('.alert')).not.toBeNull();
    expect(screen.queryByRole('button', { name: ROUTINGS_DEFAULT_LABELS.newRouting })).not.toBeInTheDocument();
  });

  it('i18n: injected labels render (no hardcoded picker label)', async () => {
    listRoutings.mockResolvedValue(ROUTINGS);
    routingCostPreview.mockResolvedValue(COST_PREVIEW);
    const labels = { ...ROUTINGS_DEFAULT_LABELS, itemLabel: 'Pozycja' };
    render(
      <RoutingsManager
        items={ITEMS}
        lines={LINES}
        machines={MACHINES}
        operationNames={OP_NAMES}
        canWrite
        canApprove
        labels={labels}
      />,
    );
    expect(screen.getByText('Pozycja')).toBeInTheDocument();
  });
});
