/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WipProcessRow } from '../../_lib/wip-definition-contract';
import { WIP_LIBRARY_DEFAULT_LABELS } from '../wip-labels';
import { WipProcessChainEditor } from '../wip-process-chain-editor';

const getProcessDefault = vi.fn();

vi.mock('../../../../../(admin)/settings/process-defaults/_actions/process-defaults-actions', () => ({
  getProcessDefault: (...args: unknown[]) => getProcessDefault(...args),
}));

const OPERATIONS = [{ id: 'op-cook', operationName: 'Cook' }];

function StatefulHarness({ onChangeSpy }: { onChangeSpy?: (next: WipProcessRow[]) => void }) {
  const [processes, setProcesses] = React.useState<WipProcessRow[]>([]);
  return (
    <WipProcessChainEditor
      processes={processes}
      operations={OPERATIONS}
      labels={WIP_LIBRARY_DEFAULT_LABELS}
      canEdit
      onChange={(next) => {
        onChangeSpy?.(next);
        setProcesses(next);
      }}
    />
  );
}

describe('WipProcessChainEditor', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    getProcessDefault.mockResolvedValue({
      ok: true as const,
      data: {
        operationId: 'op-cook',
        operationName: 'Cook',
        standardCost: 7.5,
        defaultDurationHours: 1.5,
        throughputPerHour: 120,
        throughputUom: 'pack',
        setupCost: 42,
        yieldPct: 95,
        roles: [{ roleGroup: 'Operator', defaultHeadcount: 2 }],
      },
    });
  });

  it('prefills yield/throughput/uom/setup from process default and allows editing yield in the dialog', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();

    render(<StatefulHarness onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByTestId('wip-add-process'));
    await user.click(await screen.findByRole('option', { name: 'Cook' }));

    await waitFor(() => expect(getProcessDefault).toHaveBeenCalledWith('op-cook'));

    await waitFor(() => {
      expect(onChangeSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          processName: 'Cook',
          durationHours: 1.5,
          additionalCost: 7.5,
          throughputPerHour: 120,
          throughputUom: 'pack',
          setupCost: 42,
          yieldPct: 95,
        }),
      ]);
    });

    const chain = screen.getByTestId('wip-process-chain');
    await user.click(within(chain).getByRole('button', { name: WIP_LIBRARY_DEFAULT_LABELS.processEdit }));

    const dialog = await screen.findByTestId('wip-process-editor');
    const yieldInput = within(dialog).getByTestId('wip-process-yield-pct');
    expect(yieldInput).toHaveValue(95);

    await user.clear(yieldInput);
    await user.type(yieldInput, '88');
    await user.click(within(dialog).getByTestId('wip-process-save'));

    await waitFor(() => {
      const lastCall = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1]?.[0] as WipProcessRow[];
      expect(lastCall[0]?.yieldPct).toBe(88);
    });
  });
});
