/**
 * @vitest-environment jsdom
 * T-043 — TEC-083 BOM Graph (where-used) — component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:471-544
 *
 * Asserts: parity (layered nodes/columns + direction toggle), 3+ layers for a
 * multi-level BOM (raw / sub / process / output), the where-used inverse toggle
 * rendering parent nodes, the down/up direction shadcn Select (no raw <select>),
 * and empty states. FG canonical (no FA labels).
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { BomGraphTab, type GraphData, type GraphTabLabels } from '../graph-tab';

afterEach(() => cleanup());

const LABELS: GraphTabLabels = {
  intro: 'Material flow: raw → sub-BOMs → process → finished product.',
  directionLabel: 'Direction',
  directionDown: 'Explode (down)',
  directionUp: 'Where-used (up)',
  layerRaw: 'Raw materials',
  layerSub: 'Sub-BOMs',
  layerProcess: 'Process',
  layerOutput: 'Finished product',
  layerParents: 'Used in (parent BOMs)',
  emptyComponents: 'No component lines to graph.',
  emptyParents: 'Not used as a component in any other BOM.',
  legendRaw: 'Raw material',
  legendSub: 'Sub-BOM',
  legendProcess: 'Process step',
  legendOutput: 'Finished product',
};

const DATA: GraphData = {
  rootCode: 'FG-1001',
  rootName: 'Kielbasa slaska 450g',
  components: [
    { id: 'l1', code: 'R-1001', type: 'RM', quantity: '0.54', uom: 'kg', operationName: 'Mince' },
    { id: 'l2', code: 'R-1002', type: 'RM', quantity: '0.22', uom: 'kg', operationName: null },
    { id: 'l3', code: 'WIP-002', type: 'WIP', quantity: '0.02', uom: 'kg', operationName: 'Smoke' },
  ],
  parents: [
    { productId: 'FG-9999', productName: 'Zestaw mieszany', version: 1, quantity: '2', uom: 'szt' },
  ],
};

describe('BomGraphTab — parity + layers', () => {
  it('renders the direction toggle as a combobox (no raw <select>)', () => {
    const { container } = render(<BomGraphTab data={DATA} labels={LABELS} />);
    expect(screen.getByRole('combobox', { name: 'Direction' })).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
  });

  it('shows 3+ layered columns for a multi-level BOM (raw / sub / process / output)', () => {
    render(<BomGraphTab data={DATA} labels={LABELS} />);
    expect(screen.getByTestId('bom-graph-layer-raw')).toBeInTheDocument();
    expect(screen.getByTestId('bom-graph-layer-sub')).toBeInTheDocument();
    expect(screen.getByTestId('bom-graph-layer-process')).toBeInTheDocument();
    expect(screen.getByTestId('bom-graph-layer-output')).toBeInTheDocument();
    // raw + untyped nodes
    expect(screen.getAllByTestId('bom-graph-node-raw')).toHaveLength(2);
    expect(screen.getAllByTestId('bom-graph-node-sub')).toHaveLength(1);
  });

  it('does not leak the legacy FA label', () => {
    const { container } = render(<BomGraphTab data={DATA} labels={LABELS} />);
    expect(container.textContent).not.toMatch(/Factory Article/i);
  });
});

describe('BomGraphTab — where-used toggle', () => {
  it('renders inverse parent nodes when the direction is switched to up', async () => {
    const user = userEvent.setup();
    render(<BomGraphTab data={DATA} labels={LABELS} />);
    // down by default — no parent nodes
    expect(screen.queryByTestId('bom-graph-up')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Direction' }));
    await user.click(screen.getByRole('option', { name: 'Where-used (up)' }));

    expect(screen.getByTestId('bom-graph-up')).toBeInTheDocument();
    expect(screen.getByTestId('bom-graph-node-parent')).toHaveTextContent('FG-9999');
  });

  it('shows the empty where-used copy when there are no parents', async () => {
    const user = userEvent.setup();
    render(<BomGraphTab data={{ ...DATA, parents: [] }} labels={LABELS} defaultDirection="up" />);
    expect(screen.getByText(LABELS.emptyParents)).toBeInTheDocument();
  });

  it('shows the empty components copy when there are no component lines', () => {
    render(<BomGraphTab data={{ ...DATA, components: [] }} labels={LABELS} />);
    expect(screen.getByText(LABELS.emptyComponents)).toBeInTheDocument();
  });
});
