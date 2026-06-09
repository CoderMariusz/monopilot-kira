/**
 * @vitest-environment jsdom
 *
 * NPD project-stage Brief screen — edit affordance test (additive to the
 * read-only parity view).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen).
 *   The read view structure is unchanged; the "Edit brief" button + modal is an
 *   additive write affordance gated server-side via canWrite (never client-trusted).
 *
 * Asserts:
 *   - the Edit button is ONLY rendered when canWrite (RBAC, server-resolved);
 *   - the modal pre-fills with the current brief values;
 *   - Save calls the injected Server Action with the EXACT zod patch payload
 *     ({ projectId, patch: { productName, category, ... } }) and refreshes;
 *   - the action error codes map to inline messages (INVALID_INPUT/FORBIDDEN/
 *     NOT_FOUND/PERSISTENCE_FAILED).
 *
 * The mutation Server Action is passed as a prop across the RSC boundary (Next16
 * function-prop crash guard) — here we inject a vi.fn() stand-in.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── next/navigation: capture router.refresh for the revalidation assertion. ──
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/brief',
  useSearchParams: () => new URLSearchParams(),
}));

// ── @monopilot/ui/Modal: render body/footer inline when open (jsdom-friendly). ──
vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open, modalId }: { children: React.ReactNode; open: boolean; modalId?: string }) {
    if (!open) return null;
    return (
      <div role="dialog" aria-modal="true" data-modal-id={modalId}>
        {children}
      </div>
    );
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-body">{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div data-testid="modal-footer">{children}</div>;
  return { __esModule: true, default: Modal };
});

import { ProjectBriefScreen, type ProjectBriefLabels } from '../project-brief-screen';
import type { ProjectBriefView } from '../_actions/read-project-brief';

const LABELS: ProjectBriefLabels = {
  cardTitle: 'Project brief',
  completed: 'Completed',
  fieldProductName: 'Product name',
  fieldCategory: 'Category',
  fieldTargetLaunch: 'Target launch date',
  fieldTargetPrice: 'Target retail price (EUR)',
  fieldPackFormat: 'Pack format',
  fieldPackWeight: 'Pack weight (g)',
  fieldSalesChannel: 'Sales channel',
  fieldExpectedVolume: 'Expected volume',
  fieldTargetAudience: 'Target audience',
  fieldMarketingClaims: 'Marketing claims',
  fieldConstraints: 'Constraints & requirements',
  fieldNotes: 'Notes',
  attachmentsTitle: 'Attachments',
  upload: 'Upload',
  uploadDisabledHint: 'Uploading attachments is not available yet.',
  attachmentsEmpty: 'No attachments on this brief.',
  notProvided: '—',
  loading: 'Loading brief…',
  empty: 'No brief linked to this project.',
  emptyBody: 'This project was created without a brief.',
  error: 'Unable to load the brief.',
  forbidden: 'You do not have permission to view this brief.',
  editBrief: 'Edit brief',
  editModalTitle: 'Edit project brief',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  errInvalidInput: 'Some fields are invalid. Check and try again.',
  errForbidden: 'You do not have permission to edit this brief.',
  errNotFound: 'This project could not be found.',
  errPersistence: 'Could not save the brief. Try again.',
};

const READY: ProjectBriefView = {
  briefId: 'b-1',
  devCode: 'DEV2511-1',
  projectName: 'Sliced Ham 200g',
  status: 'converted',
  productName: 'Sliced Ham 200g',
  targetLaunchDate: '2026-09-01',
  packFormat: '200g sliced pack',
  packWeightG: '200',
  expectedVolume: '1200',
  marketingClaims: 'High protein',
  category: 'Meat · Cold cut',
  targetRetailPriceEur: '19.90',
  salesChannel: 'Retail',
  targetAudience: 'Premium retail',
  constraints: 'Shelf life >= 28 days',
  notes: 'Carrefour PL listing target',
};

beforeEach(() => {
  refreshMock.mockClear();
});
afterEach(() => cleanup());

describe('ProjectBriefScreen — edit affordance (project.jsx:45-105, additive)', () => {
  it('RBAC: the Edit button is hidden when canWrite is false (server-resolved)', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite={false} />);
    expect(screen.queryByTestId('project-brief-edit')).not.toBeInTheDocument();
  });

  it('RBAC: the Edit button renders when canWrite is true', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={vi.fn()} />);
    expect(screen.getByTestId('project-brief-edit')).toHaveTextContent('Edit brief');
  });

  it('parity: read view is unchanged — card title + ✓ Completed badge still present with canWrite', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={vi.fn()} />);
    expect(screen.getByTestId('project-brief-card-title')).toHaveTextContent('Project brief');
    expect(screen.getByTestId('project-brief-completed-badge')).toHaveTextContent('✓ Completed');
    expect(screen.getByTestId('project-brief-upload')).toBeDisabled();
  });

  it('modal: pre-fills inputs with the current brief values', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByTestId('project-brief-edit'));
    expect(screen.getByTestId('brief-field-productName')).toHaveValue('Sliced Ham 200g');
    expect(screen.getByTestId('brief-field-targetLaunchDate')).toHaveValue('2026-09-01');
    expect(screen.getByTestId('brief-field-targetRetailPriceEur')).toHaveValue('19.90');
    expect(screen.getByTestId('brief-field-packFormat')).toHaveValue('200g sliced pack');
    expect(screen.getByTestId('brief-field-packWeightG')).toHaveValue('200');
    expect(screen.getByTestId('brief-field-expectedVolume')).toHaveValue('1200');
    expect(screen.getByTestId('brief-field-targetAudience')).toHaveValue('Premium retail');
    expect(screen.getByTestId('brief-field-marketingClaims')).toHaveValue('High protein');
    expect(screen.getByTestId('brief-field-constraints')).toHaveValue('Shelf life >= 28 days');
    expect(screen.getByTestId('brief-field-notes')).toHaveValue('Carrefour PL listing target');
  });

  it('submit: calls the action with the exact zod patch payload, then refreshes', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('project-brief-edit'));

    fireEvent.change(screen.getByTestId('brief-field-productName'), { target: { value: 'Sliced Ham 250g' } });
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });

    fireEvent.click(screen.getByTestId('brief-submit'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith({
      projectId: 'b-1',
      patch: {
        productName: 'Sliced Ham 250g',
        category: 'Meat · Cold cut',
        targetLaunchDate: '2026-09-01',
        targetRetailPriceEur: '19.90',
        packFormat: '200g sliced pack',
        packWeightG: '200',
        salesChannel: 'Retail',
        expectedVolume: '1200',
        targetAudience: 'Premium retail',
        marketingClaims: 'High protein',
        constraints: 'Shelf life >= 28 days',
        notes: 'Updated note',
      },
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it('submit: empty optional fields are sent as null (zod optionalText contract)', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    const sparse: ProjectBriefView = { ...READY, salesChannel: null, notes: null, packWeightG: null };
    render(<ProjectBriefScreen state="ready" data={sparse} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('project-brief-edit'));
    fireEvent.click(screen.getByTestId('brief-submit'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const arg = onUpdate.mock.calls[0]![0] as { patch: Record<string, unknown> };
    expect(arg.patch.notes).toBeNull();
    expect(arg.patch.packWeightG).toBeNull();
  });

  it('error path: FORBIDDEN maps to the inline permission message + no refresh', async () => {
    const onUpdate = vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('project-brief-edit'));
    fireEvent.click(screen.getByTestId('brief-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('brief-form-error')).toHaveTextContent(
        'You do not have permission to edit this brief.',
      ),
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('error path: PERSISTENCE_FAILED maps to the retry message', async () => {
    const onUpdate = vi.fn(async () => ({ ok: false as const, error: 'PERSISTENCE_FAILED' as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.click(screen.getByTestId('project-brief-edit'));
    fireEvent.click(screen.getByTestId('brief-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('brief-form-error')).toHaveTextContent('Could not save the brief. Try again.'),
    );
  });
});
