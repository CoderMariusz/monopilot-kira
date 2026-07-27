/**
 * @vitest-environment jsdom
 * [B-9] the Components table must show the scrap % that is actually stored.
 *
 * `bom_lines.scrap_pct` is numeric(5,2) and the row-edit modal accepts 2 decimals,
 * but both table renderers formatted with toFixed(1): a saved 2.35 displayed as
 * "2.4%" and 0.01 as "0.0%". Screen ≠ database is treated as its own defect class in
 * this campaign, so this asserts the rendered text, not the formatter.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadWipSubBomMock = vi.fn();
vi.mock('../../_actions/wip-sub-bom', () => ({
  loadWipSubBom: (...args: unknown[]) => loadWipSubBomMock(...args),
}));
vi.mock('../../_actions/line-actions', () => ({
  addBomLine: vi.fn(),
  updateBomLine: vi.fn(),
  deleteBomLine: vi.fn(),
  moveBomLine: vi.fn(),
}));

import { BomComponentLines } from '../bom-component-lines.client';
import type { BomDetailLabels, BomLineView } from '../bom-detail-screen';

// Only the keys this table reads; the rest of BomDetailLabels is irrelevant here.
const LABELS = {
  tabComponents: 'Components',
  colLine: '#',
  colComponent: 'Component',
  colType: 'Type',
  colQty: 'Qty',
  colUom: 'UoM',
  colScrap: 'Scrap',
  colOperation: 'Operation',
  colActions: 'Actions',
  phantomBadge: 'phantom',
  substituteLabel: 'Substitute:',
  perBoxBasis: 'per box (× {n} packs)',
  perPackValue: '{value} / pack',
  expandWip: 'Show WIP sub-BOM',
  collapseWip: 'Hide WIP sub-BOM',
  wipSubBomLoading: 'Loading…',
  wipSubBomEmpty: 'No active BOM for this WIP.',
  wipSubBomError: 'Unable to load this WIP sub-BOM.',
} as unknown as BomDetailLabels;

function line(id: string, scrapPct: string, overrides: Partial<BomLineView> = {}): BomLineView {
  return {
    id,
    lineNo: 1,
    itemId: `item-${id}`,
    componentCode: `RM-${id}`,
    componentName: null,
    componentType: 'RM',
    quantity: '1.000',
    uom: 'kg',
    scrapPct,
    manufacturingOperationName: 'Mixing',
    isPhantom: false,
    substituteCode: null,
    substituteName: null,
    ...overrides,
  } as BomLineView;
}

function renderLines(lines: BomLineView[]) {
  return render(
    <BomComponentLines
      lines={lines}
      labels={LABELS}
      lineBasis="per_base"
      eachPerBox={null}
      canEditLines={false}
      isEditable={false}
    />,
  );
}

afterEach(() => {
  cleanup();
  loadWipSubBomMock.mockReset();
});

describe('BOM components table — scrap % matches the persisted value', () => {
  it('renders a 2-decimal scrap exactly, not rounded to one decimal', () => {
    renderLines([line('a', '2.35')]);
    expect(screen.getByText('2.35%')).toBeInTheDocument();
    expect(screen.queryByText('2.4%')).not.toBeInTheDocument();
  });

  it('does not collapse a small scrap to 0.0%', () => {
    renderLines([line('b', '0.01')]);
    expect(screen.getByText('0.01%')).toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('keeps whole and one-decimal values readable (no gratuitous padding)', () => {
    renderLines([line('c', '5.00'), line('d', '2.50', { lineNo: 2 })]);
    expect(screen.getByText('5%')).toBeInTheDocument();
    expect(screen.getByText('2.5%')).toBeInTheDocument();
  });

  it('still hides a zero scrap behind the em dash', () => {
    renderLines([line('e', '0.00')]);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('applies the same precision inside an expanded WIP sub-BOM', async () => {
    loadWipSubBomMock.mockResolvedValue({
      ok: true,
      lines: [
        {
          id: 'sub-1',
          lineNo: 1,
          componentCode: 'RM-SUB',
          componentType: 'RM',
          quantity: '0.500',
          uom: 'kg',
          scrapPct: '2.35',
          isPhantom: false,
          substituteCode: null,
          substituteName: null,
        },
      ],
    });
    const user = userEvent.setup();
    renderLines([line('w', '0.00', { componentType: 'WIP' })]);

    await user.click(screen.getByTestId('bom-wip-toggle-w'));
    const subRow = await screen.findByTestId('bom-wip-subrow-w');
    await waitFor(() => expect(within(subRow).getByText('2.35%')).toBeInTheDocument());
    expect(within(subRow).queryByText('2.4%')).not.toBeInTheDocument();
  });
});
