/**
 * R4-CL2 — Factory-spec "Recall to draft" reversibility UI: RTL parity + behaviour.
 *
 * Spec-driven off the in-repo confirm/modal precedents (review-modal.client.tsx local
 * Dialog + the production correction modals' reason-then-submit shape). Asserts:
 *   - the affordance appears ONLY when status === 'released_to_factory';
 *   - RBAC: the button is disabled with a tooltip when the caller lacks
 *     technical.factory_spec.recall (server re-checks; client never trusts itself);
 *   - the confirm dialog carries an OPTIONAL reason and names the spec CODE (no UUID);
 *   - the recallFactorySpec action is called with { specId, reason } and the route
 *     refreshes on success;
 *   - the WO-blocking server error is surfaced VERBATIM (it already names WO numbers);
 *   - forbidden maps to localized copy.
 *
 * The recallFactorySpec Server Action is OWNED by the technical lane and mocked here
 * (it has its own DB-gated suite); next-intl resolves to the real EN bundle.
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FactorySpecListItem } from '../../_actions/shared';

const refreshMock = vi.fn();
const recallMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));
// The release-bundle deps the row-actions tree pulls in transitively — stub so the
// island renders in isolation (covered by their own suites).
vi.mock('../../_actions/recall-spec', () => ({
  recallFactorySpec: (...args: unknown[]) => recallMock(...args),
}));
vi.mock('../../_actions/bundle-data', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../_actions/bundle-data');
  return { ...actual, loadReleaseBundle: vi.fn() };
});
vi.mock('../../../../../../../../actions/technical/release-bundles/approve-bundle', () => ({
  approveReleaseBundleAction: vi.fn(),
}));
vi.mock('../../../../../../../../actions/technical/release-bundles/reject-bundle', () => ({
  rejectReleaseBundleAction: vi.fn(),
}));

const { FactorySpecRowActions } = await import('../review-modal.client');

const releasedSpec: FactorySpecListItem = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  specCode: 'FS-FG5101',
  version: 4,
  status: 'released_to_factory',
  source: 'technical',
  fgItemId: 'fg-1',
  fgItemCode: 'FG5101',
  fgName: 'Kielbasa slaska 450g',
  productGroup: 'Deli',
  shelfLifeDays: 21,
  bomHeaderId: 'bom-1',
  bomVersion: 8,
  bomStatus: 'active',
  d365ItemId: null,
  fgNpdProjectId: null,
  updatedAt: '2026-04-30T11:22:00.000Z',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('R4-CL2 — Factory spec recall to draft', () => {
  it('shows the recall affordance only for a released spec', () => {
    const { rerender } = render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: true, canRecall: true, reviewLabel: 'Review' }),
    );
    expect(screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`)).toBeInTheDocument();

    // A draft (non-released) spec must NOT carry the recall affordance.
    rerender(
      React.createElement(FactorySpecRowActions, {
        spec: { ...releasedSpec, status: 'draft' },
        canApprove: true,
        canRecall: true,
        reviewLabel: 'Review',
      }),
    );
    expect(screen.queryByTestId(`factory-spec-recall-${releasedSpec.id}`)).not.toBeInTheDocument();
  });

  it('disables the recall button with a permission tooltip when canRecall is false', () => {
    render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: false, canRecall: false, reviewLabel: 'Review' }),
    );
    const btn = screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`);
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'You need the factory spec recall permission to recall this specification.');
  });

  it('opens a confirm dialog naming the spec code with an optional reason', () => {
    render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: true, canRecall: true, reviewLabel: 'Review' }),
    );
    fireEvent.click(screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Recall specification to draft')).toBeInTheDocument();
    // The body names the spec CODE (no UUID).
    expect(within(dialog).getByText(/FS-FG5101/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/aaaaaaaa-aaaa-4aaa/)).not.toBeInTheDocument();
    // Reason is optional.
    expect(within(dialog).getByText(/optional/i)).toBeInTheDocument();
    expect(screen.getByTestId('factory-spec-recall-reason')).toBeInTheDocument();
  });

  it('calls recallFactorySpec with { specId, reason } and refreshes on success', async () => {
    recallMock.mockResolvedValue({ success: true });
    render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: true, canRecall: true, reviewLabel: 'Review' }),
    );
    fireEvent.click(screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`));
    fireEvent.change(screen.getByTestId('factory-spec-recall-reason'), { target: { value: 'Spec error found' } });
    fireEvent.click(screen.getByTestId('factory-spec-recall-confirm'));

    await waitFor(() =>
      expect(recallMock).toHaveBeenCalledWith({ specId: releasedSpec.id, reason: 'Spec error found' }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('surfaces the WO-blocking server error verbatim', async () => {
    recallMock.mockResolvedValue({
      error: 'Factory spec cannot be recalled while released or in-progress work orders reference it: WO-2026-0042, WO-2026-0043',
    });
    render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: true, canRecall: true, reviewLabel: 'Review' }),
    );
    fireEvent.click(screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`));
    fireEvent.click(screen.getByTestId('factory-spec-recall-confirm'));

    expect(await screen.findByTestId('factory-spec-recall-error')).toHaveTextContent(
      'Factory spec cannot be recalled while released or in-progress work orders reference it: WO-2026-0042, WO-2026-0043',
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('maps a forbidden server error to localized copy', async () => {
    recallMock.mockResolvedValue({ error: 'forbidden' });
    render(
      React.createElement(FactorySpecRowActions, { spec: releasedSpec, canApprove: true, canRecall: true, reviewLabel: 'Review' }),
    );
    fireEvent.click(screen.getByTestId(`factory-spec-recall-${releasedSpec.id}`));
    fireEvent.click(screen.getByTestId('factory-spec-recall-confirm'));

    expect(await screen.findByTestId('factory-spec-recall-error')).toHaveTextContent(
      'You do not have permission to recall this specification.',
    );
  });
});
