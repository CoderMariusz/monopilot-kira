/**
 * @vitest-environment jsdom
 *
 * P2-PLANNING — chain preview tree renderer (WoChainTree) RTL test.
 * Verifies the tree idiom: root FG node + nested WIP stage, throughput surfaced,
 * consumes/output qty rendered, ARIA tree roles present.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WoChainTree } from '../_components/wo-chain-preview';
import type { ChainStage } from '../_actions/chain-preview';

const root: ChainStage = {
  key: 'fg-FG',
  stageLabel: 'FG',
  itemId: 'fg',
  itemCode: 'FG-PIZZA',
  itemName: 'Pizza',
  requiredQty: '1000',
  uom: 'kg',
  lines: [{ code: 'PACK-01', name: 'Packing line' }],
  processes: [{ name: 'Bake & top', throughputPerHour: 200, throughputUom: 'kg', durationHours: 2 }],
  consumes: [{ itemCode: 'WIP-DOUGH', requiredQty: '700.0000', uom: 'kg' }],
  children: [
    {
      key: 'wip-W1',
      stageLabel: 'W1',
      itemId: 'wip',
      itemCode: 'WIP-DOUGH',
      itemName: 'Dough',
      requiredQty: '700.0000',
      uom: 'kg',
      lines: [{ code: 'MIX-01', name: 'Mixer line' }],
      processes: [{ name: 'Mix dough', throughputPerHour: 120, throughputUom: 'kg', durationHours: 1.5 }],
      consumes: [],
      children: [],
    },
  ],
};

describe('WoChainTree', () => {
  it('renders the FG root and the nested WIP stage as an ARIA tree', () => {
    render(<WoChainTree root={root} />);

    const tree = screen.getByRole('tree');
    expect(tree).toBeInTheDocument();

    const fgStage = screen.getByTestId('wo-chain-stage-FG');
    expect(within(fgStage).getByText('FG-PIZZA')).toBeInTheDocument();
    // FG consumes the WIP output qty (also appears as the nested stage's own code).
    expect(screen.getAllByText(/WIP-DOUGH/).length).toBeGreaterThanOrEqual(2);

    const wipStage = screen.getByTestId('wo-chain-stage-W1');
    expect(within(wipStage).getByText('MIX-01')).toBeInTheDocument();
    expect(within(wipStage).getByText('Mix dough')).toBeInTheDocument();
    // throughput_per_hour surfaced for the WIP stage.
    expect(within(wipStage).getByText(/120 kg\/h/)).toBeInTheDocument();
    // required output qty for the stage.
    expect(within(wipStage).getByText(/700\.0000 kg/)).toBeInTheDocument();
  });
});
