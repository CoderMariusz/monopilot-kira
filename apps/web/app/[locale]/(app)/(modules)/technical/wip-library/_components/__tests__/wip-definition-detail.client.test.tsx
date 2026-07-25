/**
 * @vitest-environment jsdom
 *
 * PF-R05-09 — a successful archive must retire the lifecycle controls IMMEDIATELY.
 * The component only learned the new status from router.refresh() → fresh props →
 * the re-sync effect, so on a slow link the Archive button and the reusable switch
 * stayed live for ~a second after the server had already archived the row.
 *
 * router.refresh/push are stubs here, so props NEVER change: whatever the header
 * renders after the action resolves is the optimistic state alone.
 *
 * DEPTH GUARD: mocks are one level up for siblings in `_components/` and two for
 * `../../_actions/…` — the same depths this file's own imports use.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { archiveWipDefinition, saveWipDefinition, refresh, push } = vi.hoisted(() => ({
  archiveWipDefinition: vi.fn(),
  saveWipDefinition: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

vi.mock('../../_actions/wip-definition-actions', () => ({ archiveWipDefinition, saveWipDefinition }));

// The composition/process/where-used panels are irrelevant to the archive flow and
// drag server-only action modules in behind them.
vi.mock('../wip-composition-editor', () => ({ WipCompositionEditor: () => null }));
vi.mock('../wip-process-chain-editor', () => ({ WipProcessChainEditor: () => null }));
vi.mock('../wip-where-used-panel', () => ({ WipWhereUsedPanel: () => null }));

import type { WipDefinitionDetail } from '../../_lib/wip-definition-contract';
import { WIP_LIBRARY_DEFAULT_LABELS } from '../wip-labels';
import { WipDefinitionDetailClient } from '../wip-definition-detail.client';

const DEFINITION: WipDefinitionDetail = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Sauce base',
  description: 'Draft description',
  baseUom: 'kg',
  yieldPct: '100.000',
  reusable: true,
  status: 'active',
  version: 3,
  itemCode: 'WIP-0001',
};

function renderDetail() {
  return render(
    <WipDefinitionDetailClient
      definition={DEFINITION}
      ingredients={[]}
      processes={[]}
      whereUsed={[]}
      operations={[]}
      canEdit
      canDeactivate
      labels={WIP_LIBRARY_DEFAULT_LABELS}
      locale="en"
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WipDefinitionDetailClient — archive (PF-R05-09)', () => {
  it('retires the archive button and the reusable switch without waiting for fresh props', async () => {
    archiveWipDefinition.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderDetail();

    // An edit the user started before hitting Archive — must survive the update.
    const nameInput = screen.getByLabelText(WIP_LIBRARY_DEFAULT_LABELS.headerName);
    await user.clear(nameInput);
    await user.type(nameInput, 'Sauce base v2');

    await user.click(screen.getByTestId('wip-archive-definition'));
    const modal = screen.getByTestId('wip-archive-modal');
    await user.click(
      within(modal).getByRole('button', { name: WIP_LIBRARY_DEFAULT_LABELS.detailArchiveConfirm }),
    );

    await waitFor(() => expect(archiveWipDefinition).toHaveBeenCalledWith({ id: DEFINITION.id }));

    // Props are unchanged (router.refresh is a stub) — this is the optimistic state.
    await waitFor(() => expect(screen.queryByTestId('wip-archive-definition')).not.toBeInTheDocument());
    expect(screen.getByTestId('wip-header-reusable')).toBeDisabled();
    expect(screen.queryByTestId('wip-save-definition')).not.toBeInTheDocument();
    expect(screen.getByLabelText(WIP_LIBRARY_DEFAULT_LABELS.headerName)).toHaveValue('Sauce base v2');
  });

  it('leaves the controls live when the archive is refused', async () => {
    archiveWipDefinition.mockResolvedValue({ ok: false, error: 'WIP definition is referenced' });
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByTestId('wip-archive-definition'));
    await user.click(
      within(screen.getByTestId('wip-archive-modal')).getByRole('button', {
        name: WIP_LIBRARY_DEFAULT_LABELS.detailArchiveConfirm,
      }),
    );

    await waitFor(() => expect(screen.getByTestId('wip-archive-error')).toBeInTheDocument());
    expect(screen.getByTestId('wip-archive-definition')).toBeInTheDocument();
    expect(screen.getByTestId('wip-header-reusable')).not.toBeDisabled();
  });
});
