/**
 * WH-014 — Lot genealogy client: RTL parity + state tests.
 *
 * Prototype: prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:280-374.
 * Tests the presentational <GenealogyTreeClient> directly (the page is an async RSC
 * that reads Supabase via listLPs/traceGenealogy + renders the denied/error panels).
 * Asserts: the trace renders ancestors above → focal LP highlighted → descendants
 * below (DOM order), the focal node is the highlighted self node, the search box
 * filters the LP pool and navigates on pick, the prompt + empty-trace states, and
 * en + pl staged bundles resolve every label.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

import { GenealogyTreeClient, type GenealogyLabels } from '../genealogy-tree.client';
import { getWhFacilityTranslator } from '../../../wh-facility-labels';
import type { GenealogyNode } from '../../../_actions/shared';
import type { LicensePlateListItem } from '../../../_actions/shared';

function buildLabels(locale: string): GenealogyLabels {
  const t = getWhFacilityTranslator(locale);
  return {
    searchPlaceholder: t('genealogy.searchPlaceholder'),
    searchLabel: t('genealogy.searchLabel'),
    noResults: t('genealogy.noResults'),
    prompt: t('genealogy.prompt'),
    promptHint: t('genealogy.promptHint'),
    emptyTrace: t('genealogy.emptyTrace'),
    ancestorsLabel: t('genealogy.ancestorsLabel'),
    focalLabel: t('genealogy.focalLabel'),
    descendantsLabel: t('genealogy.descendantsLabel'),
    depthLabel: t('genealogy.depthLabel'),
    capNote: t('genealogy.capNote'),
    nodesFound: t('genealogy.nodesFound'),
    nodesFoundPlural: t('genealogy.nodesFoundPlural'),
    openLp: t('genealogy.openLp'),
    status: {
      available: t('genealogy.status.available'),
      reserved: t('genealogy.status.reserved'),
      allocated: t('genealogy.status.allocated'),
      received: t('genealogy.status.received'),
      quarantine: t('genealogy.status.quarantine'),
      consumed: t('genealogy.status.consumed'),
      blocked: t('genealogy.status.blocked'),
    },
  };
}

function node(over: Partial<GenealogyNode> & Pick<GenealogyNode, 'lpId' | 'direction' | 'depth'>): GenealogyNode {
  return {
    lpNumber: `LP-${over.lpId}`,
    itemCode: 'R-1001',
    quantity: '100',
    uom: 'kg',
    status: 'available',
    createdAt: '2026-01-01T00:00:00.000Z',
    parentLpId: null,
    ...over,
  };
}

const NODES: GenealogyNode[] = [
  node({ lpId: 'anc-2', direction: 'ancestor', depth: 2, lpNumber: 'LP-ANC-2' }),
  node({ lpId: 'anc-1', direction: 'ancestor', depth: 1, lpNumber: 'LP-ANC-1' }),
  node({ lpId: 'focal', direction: 'self', depth: 0, lpNumber: 'LP-FOCAL', status: 'reserved' }),
  node({ lpId: 'desc-1', direction: 'descendant', depth: 1, lpNumber: 'LP-DESC-1' }),
];

const POOL: LicensePlateListItem[] = [
  {
    id: 'focal',
    lpNumber: 'LP-FOCAL',
    itemCode: 'R-1001',
    itemName: 'Beef trim',
    quantity: '100',
    reservedQty: '0',
    availableQty: '100',
    uom: 'kg',
    status: 'reserved',
    qaStatus: 'PASS',
    batchNumber: 'B-2026-04-02',
    expiryDate: null,
    locationCode: 'B3',
    warehouseCode: 'WH-A',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function renderGen(opts: { selectedLpId?: string | null; nodes?: GenealogyNode[] | null; locale?: string } = {}) {
  const locale = opts.locale ?? 'en';
  const selectedLpId = opts.selectedLpId === undefined ? 'focal' : opts.selectedLpId;
  const nodes = opts.nodes === undefined ? NODES : opts.nodes;
  // prettier-ignore
  return render(<GenealogyTreeClient searchPool={POOL} selectedLpId={selectedLpId} nodes={nodes} labels={buildLabels(locale)} locale="en" basePath="/en/warehouse/genealogy" />);
}

describe('GenealogyTreeClient (WH-014)', () => {
  it('renders ancestors above, the focal LP, then descendants (DOM order)', () => {
    renderGen();
    const canvas = screen.getByTestId('gen-canvas');
    const anc = within(canvas).getByTestId('gen-ancestors');
    const focal = within(canvas).getByTestId('gen-focal');
    const desc = within(canvas).getByTestId('gen-descendants');

    // documentPosition: anc precedes focal precedes desc.
    expect(anc.compareDocumentPosition(focal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(focal.compareDocumentPosition(desc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(within(anc).getByTestId('gen-node-anc-1')).toBeInTheDocument();
    expect(within(anc).getByTestId('gen-node-anc-2')).toBeInTheDocument();
    expect(within(desc).getByTestId('gen-node-desc-1')).toBeInTheDocument();
  });

  it('highlights the focal (self) node and links every node to its LP detail', () => {
    renderGen();
    const focalNode = screen.getByTestId('gen-node-focal');
    expect(focalNode).toHaveAttribute('data-direction', 'self');
    expect(screen.getByTestId('gen-lp-link-focal')).toHaveAttribute(
      'href',
      '/en/warehouse/license-plates/focal',
    );
    expect(screen.getByTestId('gen-lp-link-desc-1')).toHaveAttribute(
      'href',
      '/en/warehouse/license-plates/desc-1',
    );
  });

  it('shows the prompt when no LP is selected', () => {
    renderGen({ selectedLpId: null, nodes: null });
    expect(screen.getByTestId('gen-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('gen-canvas')).not.toBeInTheDocument();
  });

  it('shows the empty-trace note when only the focal node exists', () => {
    renderGen({ nodes: [node({ lpId: 'focal', direction: 'self', depth: 0, lpNumber: 'LP-FOCAL' })] });
    expect(screen.getByTestId('gen-empty-trace')).toBeInTheDocument();
    expect(screen.getByTestId('gen-focal-only')).toBeInTheDocument();
  });

  it('search filters the LP pool and navigates to ?lp= on pick', () => {
    pushSpy.mockClear();
    renderGen({ selectedLpId: null, nodes: null });
    fireEvent.change(screen.getByTestId('gen-search'), { target: { value: 'focal' } });
    const result = screen.getByTestId('gen-search-result-focal');
    expect(result).toBeInTheDocument();
    fireEvent.click(result);
    expect(pushSpy).toHaveBeenCalledWith('/en/warehouse/genealogy?lp=focal');
  });

  it('shows no-results when the search matches nothing', () => {
    renderGen({ selectedLpId: null, nodes: null });
    fireEvent.change(screen.getByTestId('gen-search'), { target: { value: 'nope-xyz' } });
    expect(screen.getByTestId('gen-search-empty')).toBeInTheDocument();
  });

  it('resolves every label in en and pl staged bundles (no raw keys)', () => {
    for (const locale of ['en', 'pl']) {
      const labels = buildLabels(locale);
      const flat = [...Object.values(labels).filter((v) => typeof v === 'string'), ...Object.values(labels.status)];
      for (const v of flat) {
        expect(typeof v).toBe('string');
        expect(v as string).not.toMatch(/^genealogy\./);
      }
    }
  });
});
