/**
 * @vitest-environment jsdom
 *
 * Wiring test: the BOM detail Co-products tab renders the per-row edit/delete
 * actions (keyed by the selected version's header id + co-product id) only when
 * the caller can edit lines, gated on the SAME editability the Components tab uses
 * (canEditLines + draft/in_review status). BomCoProductRowActions is stubbed so we
 * assert the SCREEN passes the right props at the wiring seam and that the actions
 * column is omitted entirely without the create permission.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { coProductActionsSpy } = vi.hoisted(() => ({ coProductActionsSpy: vi.fn() }));

vi.mock('../bom-coproduct-row-actions.client', () => ({
  BomCoProductRowActions: (props: Record<string, unknown>) => {
    coProductActionsSpy(props);
    return <button data-testid="stub-coproduct-actions" type="button" />;
  },
}));
// The Components-tab island is unrelated here — stub it so it stays inert.
vi.mock('../bom-line-row-actions', () => ({ BomLineRowActions: () => null }));

import { BomDetailScreen, type BomDetailData, type BomDetailLabels } from '../bom-detail-screen';

afterEach(() => {
  cleanup();
  coProductActionsSpy.mockClear();
});

// Full label stub — every key resolves to its own name; colActions is asserted on.
const LABELS = new Proxy(
  { colActions: 'Actions' } as Record<string, string>,
  { get: (target, prop: string) => target[prop] ?? prop },
) as unknown as BomDetailLabels;

function makeData(over: Partial<BomDetailData>): BomDetailData {
  return {
    productId: 'FG1234',
    productName: 'Smoked Ham',
    category: null,
    selectedVersion: 1,
    status: 'draft',
    yieldPct: '100',
    effectiveFrom: '2026-04-14',
    notes: null,
    lines: [],
    coProducts: [
      {
        id: 'CP1',
        coProductItemId: 'CP-9001',
        quantity: '0.1',
        uom: 'kg',
        allocationPct: '5',
        isByproduct: false,
        expectedYieldPct: '8',
      },
    ],
    versions: [],
    snapshots: [],
    whereUsed: [],
    detailHrefBase: '/technical/bom',
    selectedHeaderId: 'H1',
    isEditable: true,
    canEditLines: true,
    ...over,
  } as BomDetailData;
}

async function openCoProductsTab() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('bom-tab-co-products'));
  return user;
}

describe('BomDetailScreen ↔ co-product row actions wiring', () => {
  it('renders the co-product actions with the header id, co-product id and editable=true on a draft', async () => {
    render(<BomDetailScreen state="ready" data={makeData({})} labels={LABELS} />);
    await openCoProductsTab();

    expect(screen.getByTestId('stub-coproduct-actions')).toBeInTheDocument();
    expect(coProductActionsSpy).toHaveBeenCalledTimes(1);
    const props = coProductActionsSpy.mock.calls[0][0];
    expect(props.editable).toBe(true);
    expect(props.canEdit).toBe(true);
    expect(props.target).toMatchObject({
      bomHeaderId: 'H1',
      coProductId: 'CP1',
      coProductItemId: 'CP-9001',
      quantity: '0.1',
      uom: 'kg',
      allocationPct: '5',
      expectedYieldPct: '8',
      isByproduct: false,
    });
  });

  it('forwards editable=false on a non-editable (active) version', async () => {
    render(
      <BomDetailScreen
        state="ready"
        data={makeData({ status: 'active', isEditable: false })}
        labels={LABELS}
      />,
    );
    await openCoProductsTab();
    const props = coProductActionsSpy.mock.calls[0][0];
    expect(props.editable).toBe(false);
  });

  it('omits the actions column entirely when the caller cannot edit lines', async () => {
    render(<BomDetailScreen state="ready" data={makeData({ canEditLines: false })} labels={LABELS} />);
    await openCoProductsTab();
    expect(screen.queryByTestId('stub-coproduct-actions')).not.toBeInTheDocument();
    expect(coProductActionsSpy).not.toHaveBeenCalled();
  });
});
