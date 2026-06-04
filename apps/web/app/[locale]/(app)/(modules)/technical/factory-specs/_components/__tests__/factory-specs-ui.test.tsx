/**
 * T-060 (TEC-085/086) + T-090 — Factory Specs Review modal + FactorySpec+BOM
 * bundle approval panel: RTL parity + behaviour tests.
 *
 * Prototype anchors:
 *   - modals.jsx:460-483 (SpecReviewModal)            → review-modal.client.tsx
 *   - other-screens.jsx:40-75 (SpecsScreen)           → page.tsx (list columns)
 *   - spec-driven-screens.jsx:653-781 (bundle modal)  → release-bundle-panel.client.tsx
 *
 * next-intl + ICU are mocked in test-setup.ui.ts (resolve to the real EN bundle).
 * The T-080 release-bundle server actions and the T-090 read model are mocked so the
 * UI is exercised in isolation (the actions themselves are covered by their own
 * DB-gated suites under apps/web/tests/).
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FactorySpecListItem } from '../../_actions/shared';
import type { ReleaseBundleData } from '../../_actions/bundle-data';

// ── Mocks ──────────────────────────────────────────────────────────────────────
const approveMock = vi.fn();
const rejectMock = vi.fn();
const loadBundleMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
}));

vi.mock('../../../../../../../../actions/technical/release-bundles/approve-bundle', () => ({
  approveReleaseBundleAction: (...args: unknown[]) => approveMock(...args),
}));
vi.mock('../../../../../../../../actions/technical/release-bundles/reject-bundle', () => ({
  rejectReleaseBundleAction: (...args: unknown[]) => rejectMock(...args),
}));
vi.mock('../../_actions/bundle-data', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../_actions/bundle-data');
  return { ...actual, loadReleaseBundle: (...args: unknown[]) => loadBundleMock(...args) };
});

// Imported AFTER the mocks above so the components pick up the mocked modules.
const { FactorySpecRowActions } = await import('../review-modal.client');
const { ReleaseBundlePanelButton } = await import('../release-bundle-panel.client');

afterEach(() => {
  vi.clearAllMocks();
});

const baseSpec: FactorySpecListItem = {
  id: 'spec-1',
  specCode: 'FS-FG5101',
  version: 3,
  status: 'in_review',
  source: 'technical',
  fgItemId: 'fg-1',
  fgItemCode: 'FG5101',
  fgName: 'Kielbasa slaska 450g',
  productGroup: 'Deli',
  shelfLifeDays: 21,
  bomHeaderId: 'bom-1',
  bomVersion: 8,
  bomStatus: 'in_review',
  d365ItemId: null,
  updatedAt: '2026-04-30T11:22:00.000Z',
};

function bundleData(overrides: Partial<ReleaseBundleData> = {}): ReleaseBundleData {
  return {
    factorySpecId: 'spec-1',
    bomHeaderId: 'bom-1',
    fg: { itemCode: 'FG5101', name: 'Kielbasa slaska 450g' },
    spec: { specCode: 'FS-FG5101', version: 3, status: 'in_review', source: 'technical', lastEdit: '2026-04-30T11:22', owner: 'A. Majewska' },
    bom: { id: 'bom-1', version: 8, status: 'in_review', clonedFrom: 'v7' },
    blockers: [
      { kind: 'release', severity: 'info', code: 'D365_INFORMATIONAL', message: 'D365 informational.' },
    ],
    history: [{ at: '2026-04-30T11:22', who: 'A. Majewska', action: 'factory_spec.bundle_rejected' }],
    cloneOnWrite: false,
    d365Enabled: false,
    canApprove: true,
    ...overrides,
  };
}

// ── T-060 Review modal (TEC-085) ────────────────────────────────────────────────
describe('T-060 FactorySpecRowActions review modal', () => {
  it('renders Review CTA and opens the review modal with release + paired-BOM status', () => {
    render(<FactorySpecRowActions spec={baseSpec} canApprove reviewLabel="Review" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Release status row + paired BOM version are visible (canonical, not FA-*).
    expect(screen.getByText('Release status')).toBeInTheDocument();
    expect(screen.getByText('Paired BOM')).toBeInTheDocument();
    expect(screen.getByText('BOM v8')).toBeInTheDocument();
    // Pending paired BOM → the G4-alone note is shown.
    expect(
      screen.getByText(/Gate-4 alone does not unlock factory use/i),
    ).toBeInTheDocument();
    // FA-* legacy id must NOT appear.
    expect(screen.queryByText(/FA5101|SP-0421/)).not.toBeInTheDocument();
  });

  it('shows the clone-on-write warning for an approved (immutable) version', () => {
    render(
      <FactorySpecRowActions
        spec={{ ...baseSpec, status: 'approved_for_factory', bomStatus: 'technical_approved' }}
        canApprove
        reviewLabel="Review"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(/Editing creates a new version \(clone-on-write\)/i)).toBeInTheDocument();
  });

  it('hides the approve path and explains the Technical permission when canApprove is false', () => {
    render(<FactorySpecRowActions spec={baseSpec} canApprove={false} reviewLabel="Review" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).not.toBeInTheDocument();
    expect(screen.getByText(/do not have the Technical permission/i)).toBeInTheDocument();
    // No bundle-approval entry point for a non-approver.
    expect(screen.queryByRole('button', { name: 'Open bundle approval' })).not.toBeInTheDocument();
  });
});

// ── T-090 Bundle approval panel ─────────────────────────────────────────────────
describe('T-090 ReleaseBundlePanelButton', () => {
  it('loads the bundle on open and renders paired statuses + history', async () => {
    loadBundleMock.mockResolvedValue({ ok: true, data: bundleData() });
    render(<ReleaseBundlePanelButton factorySpecId="spec-1" label="Open bundle approval" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open bundle approval' }));

    await waitFor(() => expect(loadBundleMock).toHaveBeenCalledWith('spec-1'));
    expect(await screen.findByText('factory_spec')).toBeInTheDocument();
    expect(screen.getByText('shared BOM')).toBeInTheDocument();
    expect(screen.getByText('Approval / rejection history')).toBeInTheDocument();
    // D365 disabled → local-approval-still-works messaging.
    expect(screen.getByText(/local Technical approval still unlocks factory use/i)).toBeInTheDocument();
  });

  it('disables approve when a blocking blocker is present and shows the exact reason', async () => {
    loadBundleMock.mockResolvedValue({
      ok: true,
      data: bundleData({
        blockers: [
          { kind: 'rm', severity: 'block', code: 'ITEM_NOT_ACTIVE', message: 'Component RM-3001 is blocked (RM usability failed).' },
          { kind: 'release', severity: 'info', code: 'D365_INFORMATIONAL', message: 'D365 informational.' },
        ],
      }),
    });
    render(<ReleaseBundlePanelButton factorySpecId="spec-1" label="Open bundle approval" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open bundle approval' }));

    const approveBtn = await screen.findByRole('button', { name: /Approve \(blocked\)/i });
    expect(approveBtn).toBeDisabled();
    expect(screen.getByText(/Component RM-3001 is blocked/i)).toBeInTheDocument();
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('approves the bundle with PIN + reason and calls the T-080 action', async () => {
    loadBundleMock.mockResolvedValue({ ok: true, data: bundleData() });
    approveMock.mockResolvedValue({ ok: true, data: { factorySpecId: 'spec-1' } });
    render(<ReleaseBundlePanelButton factorySpecId="spec-1" label="Open bundle approval" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open bundle approval' }));

    await screen.findByText('factory_spec');
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Bundle reviewed and approved.' },
    });
    fireEvent.change(screen.getByLabelText('e-signature PIN'), { target: { value: '1234' } });

    const approveBtn = screen.getByRole('button', { name: 'Approve bundle' });
    expect(approveBtn).toBeEnabled();
    fireEvent.click(approveBtn);

    await waitFor(() =>
      expect(approveMock).toHaveBeenCalledWith({
        factorySpecId: 'spec-1',
        bomHeaderId: 'bom-1',
        pin: '1234',
        reason: 'Bundle reviewed and approved.',
      }),
    );
    expect(refreshMock).toHaveBeenCalled();
    expect(await screen.findByText(/Bundle approved/i)).toBeInTheDocument();
  });

  it('rejects the bundle with a reason via the T-080 reject action', async () => {
    loadBundleMock.mockResolvedValue({ ok: true, data: bundleData() });
    rejectMock.mockResolvedValue({ ok: true, data: { factorySpecId: 'spec-1' } });
    render(<ReleaseBundlePanelButton factorySpecId="spec-1" label="Open bundle approval" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open bundle approval' }));

    await screen.findByText('factory_spec');
    fireEvent.click(screen.getByLabelText('Reject bundle'));
    fireEvent.change(screen.getByLabelText('Reject reason'), {
      target: { value: 'Missing supplier_spec for S-202.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject bundle' }));

    await waitFor(() =>
      expect(rejectMock).toHaveBeenCalledWith({
        factorySpecId: 'spec-1',
        bomHeaderId: 'bom-1',
        reason: 'Missing supplier_spec for S-202.',
      }),
    );
    expect(await screen.findByText(/Bundle rejected/i)).toBeInTheDocument();
  });

  it('shows the error state when the read model fails to load', async () => {
    loadBundleMock.mockResolvedValue({ ok: false, error: 'error' });
    render(<ReleaseBundlePanelButton factorySpecId="spec-1" label="Open bundle approval" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open bundle approval' }));
    expect(await screen.findByText(/Unable to load the release bundle/i)).toBeInTheDocument();
  });
});
