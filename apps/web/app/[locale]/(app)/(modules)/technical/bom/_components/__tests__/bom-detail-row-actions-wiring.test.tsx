/**
 * @vitest-environment jsdom
 *
 * Wiring test: the BOM detail Components tab renders the per-row edit/delete
 * actions (keyed by the selected version's header id + line id) only when the
 * caller can edit lines, and forwards the editability flag so the actions render
 * disabled on a non-editable (active) version. BomLineRowActions is stubbed so we
 * assert the SCREEN passes the right props at the wiring seam.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { rowActionsSpy } = vi.hoisted(() => ({ rowActionsSpy: vi.fn() }));

vi.mock('../bom-line-row-actions', () => ({
  BomLineRowActions: (props: Record<string, unknown>) => {
    rowActionsSpy(props);
    return <button data-testid="stub-row-actions" type="button" />;
  },
}));

import { BomDetailScreen, type BomDetailData, type BomDetailLabels } from '../bom-detail-screen';

afterEach(() => {
  cleanup();
  rowActionsSpy.mockClear();
});

// Full label stub — every key resolves to its own name so interpolate() never
// dereferences undefined; only colActions is asserted on directly.
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
    lines: [
      { id: 'L1', lineNo: 1, componentCode: 'RM-001', componentType: 'RM', quantity: '1.5', uom: 'kg', scrapPct: '1.0', manufacturingOperationName: 'Mix', isPhantom: false },
    ],
    coProducts: [],
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

describe('BomDetailScreen ↔ row actions wiring', () => {
  it('renders the row actions with the header id, line id and editable=true on a draft', () => {
    render(<BomDetailScreen state="ready" data={makeData({})} labels={LABELS} />);
    expect(screen.getByTestId('stub-row-actions')).toBeInTheDocument();
    expect(rowActionsSpy).toHaveBeenCalledTimes(1);
    const props = rowActionsSpy.mock.calls[0][0];
    expect(props.editable).toBe(true);
    expect(props.canEdit).toBe(true);
    expect(props.target).toMatchObject({ bomHeaderId: 'H1', lineId: 'L1', componentCode: 'RM-001', quantity: '1.5', uom: 'kg' });
  });

  it('forwards editable=false on a non-editable (active) version', () => {
    render(<BomDetailScreen state="ready" data={makeData({ status: 'active', isEditable: false })} labels={LABELS} />);
    const props = rowActionsSpy.mock.calls[0][0];
    expect(props.editable).toBe(false);
  });

  it('omits the actions column entirely when the caller cannot edit lines', () => {
    render(<BomDetailScreen state="ready" data={makeData({ canEditLines: false })} labels={LABELS} />);
    expect(screen.queryByTestId('stub-row-actions')).not.toBeInTheDocument();
    expect(rowActionsSpy).not.toHaveBeenCalled();
  });
});
