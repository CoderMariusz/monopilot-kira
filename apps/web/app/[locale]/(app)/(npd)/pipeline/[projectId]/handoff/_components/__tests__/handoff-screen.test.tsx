/**
 * @vitest-environment jsdom
 * NPD HANDOFF stage — HandoffScreen component test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:485-533 (HandoffScreen)
 *
 * Asserts the parity checklist: the green "Ready to promote" success bar (and the
 * amber "blocked" bar when the checklist is incomplete), the "Handoff checklist"
 * (Checkbox primitive — NEVER a raw <input type="checkbox">), the two panels
 * "Destination BOM" (label/value) + "What happens on promote" (6-step ordered
 * list), and the footer "Export handoff packet" + "✓ Promote to production BOM"
 * (Promote DISABLED until the checklist is complete). Plus the five UI states
 * (loading / empty / ready / error / permission-denied), the optimistic toggle,
 * the promote callback, that all visible strings come from injected i18n labels
 * (no default leak), and that there is NO legacy banner.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HandoffScreen,
  type HandoffLabels,
  type HandoffScreenData,
} from '../handoff-screen';

afterEach(() => cleanup());

const LABELS: HandoffLabels = {
  title: 'L_TITLE',
  breadcrumb: 'L_CRUMB',
  readyTitle: 'L_READY_TITLE',
  readyBody: 'L_READY_BODY',
  blockedTitle: 'L_BLOCKED_TITLE',
  blockedBody: 'L_BLOCKED_BODY',
  promotedTitle: 'L_PROMOTED_TITLE',
  promotedBody: 'L_PROMOTED_BODY',
  checklistTitle: 'L_CHECKLIST_TITLE',
  destinationTitle: 'L_DEST_TITLE',
  whatHappensTitle: 'L_STEPS_TITLE',
  bomCode: 'L_BOM_CODE',
  productSku: 'L_SKU',
  effectiveFrom: 'L_EFF',
  productionLine: 'L_LINE',
  warehouse: 'L_WH',
  releaseStatus: 'L_REL_STATUS',
  step1: 'L_STEP1',
  step2: 'L_STEP2',
  step3: 'L_STEP3',
  step4: 'L_STEP4',
  step5: 'L_STEP5',
  step6: 'L_STEP6',
  exportPacket: 'L_EXPORT',
  promote: 'L_PROMOTE',
  promoting: 'L_PROMOTING',
  promoteError: 'L_PROMOTE_ERR',
  loading: 'L_LOADING',
  empty: 'L_EMPTY',
  emptyBody: 'L_EMPTY_BODY',
  error: 'L_ERROR',
  forbidden: 'L_FORBIDDEN',
  notSet: '—',
};

function dataReady(allChecked: boolean): HandoffScreenData {
  return {
    checklistId: 'cl-1',
    projectId: '07300000-0000-4000-8000-0000000000c1',
    bomVerificationStatus: 'pending',
    promoteToProductionDate: null,
    ready: allChecked,
    promoted: false,
    checklist: [
      { id: 'i1', label: 'Recipe locked', isChecked: true, displayOrder: 1 },
      { id: 'i2', label: 'Nutrition approved', isChecked: allChecked, displayOrder: 2 },
    ],
    destinationBom: {
      bomCode: 'BOM-238',
      productSku: 'SKU-2451',
      productName: 'Sliced Ham 200g',
      effectiveFrom: '2026-01-08',
      warehouseName: 'Main WH',
      releaseStatus: null,
      releaseBomHeaderId: null,
    },
  };
}

describe('HandoffScreen — parity structure', () => {
  it('renders checklist, both panels, 6 steps, and footer buttons (no legacy banner)', () => {
    render(<HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} />);
    expect(screen.getByTestId('handoff-checklist-card')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-destination-card')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-steps-card')).toBeInTheDocument();
    expect(within(screen.getByTestId('handoff-steps')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByTestId('handoff-export-btn')).toHaveTextContent('L_EXPORT');
    expect(screen.getByTestId('handoff-promote-btn')).toHaveTextContent('L_PROMOTE');
    // NO legacy banner.
    expect(screen.queryByText(/LEGACY/i)).not.toBeInTheDocument();
    // Checkbox primitive, never a raw checkbox input.
    expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('shows the green ready bar + enables Promote when the checklist is complete', () => {
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={vi.fn()} />,
    );
    expect(screen.getByTestId('handoff-ready-bar')).toHaveTextContent('L_READY_TITLE');
    expect(screen.getByTestId('handoff-promote-btn')).not.toBeDisabled();
  });

  it('shows the amber blocked bar + disables Promote when an item is unchecked', () => {
    render(
      <HandoffScreen state="ready" data={dataReady(false)} labels={LABELS} onPromote={vi.fn()} />,
    );
    expect(screen.getByTestId('handoff-blocked-bar')).toHaveTextContent('L_BLOCKED_TITLE');
    expect(screen.getByTestId('handoff-promote-btn')).toBeDisabled();
  });
});

describe('HandoffScreen — UI states', () => {
  it.each([
    ['loading', 'L_LOADING'],
    ['error', 'L_ERROR'],
    ['permission_denied', 'L_FORBIDDEN'],
  ] as const)('renders the %s state', (state, text) => {
    render(<HandoffScreen state={state} data={null} labels={LABELS} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<HandoffScreen state="empty" data={null} labels={LABELS} />);
    expect(screen.getByText('L_EMPTY')).toBeInTheDocument();
    expect(screen.getByText('L_EMPTY_BODY')).toBeInTheDocument();
  });
});

describe('HandoffScreen — interactions', () => {
  it('optimistically toggles a checklist item via the injected action', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen
        state="ready"
        data={dataReady(false)}
        labels={LABELS}
        onToggleChecklistItem={onToggle}
      />,
    );
    const second = screen.getByLabelText('Nutrition approved');
    fireEvent.click(second);
    await waitFor(() =>
      expect(onToggle).toHaveBeenCalledWith({ itemId: 'i2', isChecked: true }),
    );
  });

  it('invokes the promote callback when Promote is clicked (complete checklist)', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: true });
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() =>
      expect(onPromote).toHaveBeenCalledWith({
        projectId: '07300000-0000-4000-8000-0000000000c1',
      }),
    );
  });

  it('surfaces a promote error when the action fails', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: false, error: 'release_blocked' });
    render(
      <HandoffScreen state="ready" data={dataReady(true)} labels={LABELS} onPromote={onPromote} />,
    );
    fireEvent.click(screen.getByTestId('handoff-promote-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('handoff-promote-error')).toHaveTextContent('L_PROMOTE_ERR'),
    );
  });
});
