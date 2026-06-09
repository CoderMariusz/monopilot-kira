/**
 * @vitest-environment jsdom
 *
 * N1-B — Traceability search (TraceabilityScreen) RTL parity + states.
 *
 * Prototype parity source (translated, NOT pasted):
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:694-773
 *   (TraceabilityScreen) — query + direction; backward/forward chain. Rendered as
 *   a grouped, indented chain list (cascade chain-timeline pattern) because the
 *   reviewed backend returns a nodes+edges graph.
 *
 * Asserts:
 *  - the search submit drives the Server Action (query + direction args);
 *  - the direction toggle re-runs with the chosen direction;
 *  - nodes render grouped by kind with edge relation labels;
 *  - the prompt (no query) + no-results + error + permission-denied states;
 *  - the screen reads correctly with 0 results (sparse production data).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TraceabilityClient,
  type TraceEdge,
  type TraceNode,
  type TraceabilityLabels,
} from '../traceability.client';

afterEach(() => cleanup());

const LABELS: TraceabilityLabels = {
  searchPlaceholder: 'LP · WO · Batch · Lot',
  searchLabel: 'Trace query',
  search: 'Search',
  directionLabel: 'Direction',
  directionBackward: 'Backward',
  directionForward: 'Forward',
  directionBoth: 'Both',
  hint: 'Scanning a GS1 label auto-fills the LP.',
  prompt: 'Enter an LP, batch, lot or WO',
  promptBody: 'Trace components in and shipments out.',
  noResults: 'No trace found',
  noResultsBody: 'No license plate, batch or work order matched.',
  error: 'Trace search failed.',
  denied: 'You do not have access.',
  resultCount: '{count} nodes',
  kind: {
    license_plate: 'License plate',
    wo_output: 'WO output',
    wo_consumption: 'Consumption',
    work_order: 'Work order',
    bom_line: 'BOM line',
  },
  relation: {
    contains: 'contains',
    consumed_by: 'consumed by',
    produced: 'produced',
    requires_component: 'requires',
  },
  qtyLabel: 'Qty',
  lotLabel: 'Lot',
  statusLabel: 'Status',
};

const NODES: TraceNode[] = [
  {
    nodeType: 'license_plate',
    id: 'lp-1',
    label: 'LP-2026-04-14-00012',
    itemId: 'i-1',
    itemCode: 'R-3001',
    lotOrBatch: 'LOT-AB-001',
    quantity: '120',
    uom: 'kg',
    status: 'available',
    occurredAt: '2026-04-14 08:00:00+00',
  },
  {
    nodeType: 'work_order',
    id: 'wo-1',
    label: 'WO-00481',
    itemId: 'i-2',
    itemCode: 'FG5101',
    lotOrBatch: null,
    quantity: '500',
    uom: 'kg',
    status: 'completed',
    occurredAt: '2026-04-14 10:00:00+00',
  },
];

const EDGES: TraceEdge[] = [
  {
    fromType: 'license_plate',
    fromId: 'lp-1',
    toType: 'wo_consumption',
    toId: 'c-1',
    relation: 'consumed_by',
    quantity: '120',
    uom: 'kg',
  },
];

function makeAction(nodes: TraceNode[] = NODES, edges: TraceEdge[] = EDGES) {
  return vi.fn().mockResolvedValue({ ok: true, data: { nodes, edges } });
}

function renderClient(action = makeAction()) {
  render(<TraceabilityClient labels={LABELS} searchAction={action} />);
  return action;
}

describe('TraceabilityClient — parity + states', () => {
  it('starts in the prompt state with no query', () => {
    renderClient();
    expect(screen.getByTestId('traceability-prompt')).toBeInTheDocument();
    expect(screen.getByText('Enter an LP, batch, lot or WO')).toBeInTheDocument();
  });

  it('search submit drives the Server Action with query + direction', async () => {
    const action = renderClient();
    fireEvent.change(screen.getByTestId('traceability-query'), {
      target: { value: 'LP-2026-04-14-00012' },
    });
    fireEvent.click(screen.getByTestId('traceability-submit'));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'LP-2026-04-14-00012', direction: 'both' }),
    );
  });

  it('renders nodes grouped by kind with edge relation labels', async () => {
    const action = renderClient();
    fireEvent.change(screen.getByTestId('traceability-query'), { target: { value: 'LP' } });
    fireEvent.click(screen.getByTestId('traceability-submit'));
    await waitFor(() => expect(screen.getByTestId('traceability-results')).toBeInTheDocument());

    expect(screen.getByTestId('traceability-group-license_plate')).toBeInTheDocument();
    expect(screen.getByTestId('traceability-group-work_order')).toBeInTheDocument();
    const lpNode = screen.getByTestId('traceability-node-license_plate-lp-1');
    expect(within(lpNode).getByText('LP-2026-04-14-00012')).toBeInTheDocument();
    // outgoing edge label uses the relation + target-kind translations
    const edges = screen.getByTestId('traceability-edges-license_plate-lp-1');
    expect(edges).toHaveTextContent('consumed by');
    expect(edges).toHaveTextContent('Consumption');
    expect(screen.getByTestId('traceability-count')).toHaveTextContent('2 nodes');
  });

  it('direction toggle re-runs the search with the chosen direction', async () => {
    const action = renderClient();
    fireEvent.change(screen.getByTestId('traceability-query'), { target: { value: 'WO-00481' } });
    fireEvent.click(screen.getByTestId('traceability-submit'));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('traceability-direction-backward'));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'backward' }),
    );
  });

  it('shows the no-results state with 0 nodes (sparse production data)', async () => {
    const action = makeAction([], []);
    renderClient(action);
    fireEvent.change(screen.getByTestId('traceability-query'), { target: { value: 'NOPE' } });
    fireEvent.click(screen.getByTestId('traceability-submit'));
    await waitFor(() => expect(screen.getByTestId('traceability-no-results')).toBeInTheDocument());
    expect(screen.getByText('No trace found')).toBeInTheDocument();
  });

  it('shows the error state when the action fails', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'persistence_failed' });
    renderClient(action);
    fireEvent.change(screen.getByTestId('traceability-query'), { target: { value: 'LP' } });
    fireEvent.click(screen.getByTestId('traceability-submit'));
    await waitFor(() => expect(screen.getByTestId('traceability-error')).toBeInTheDocument());
  });

  it('submit is disabled with an empty query', () => {
    renderClient();
    expect(screen.getByTestId('traceability-submit')).toBeDisabled();
  });
});
