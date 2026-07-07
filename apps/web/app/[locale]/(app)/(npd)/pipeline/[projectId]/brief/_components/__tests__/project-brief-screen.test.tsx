/**
 * @vitest-environment jsdom
 *
 * NPD project-stage Brief screen — inline-edit form test.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:45-105 (BriefScreen).
 *   The prototype BriefScreen is itself a LIVE inline editable form (every field is
 *   bound to setForm), so the write view here mirrors that: the ready card is the
 *   form, gated server-side by canWrite (never client-trusted). Read-only users
 *   keep the static read view.
 *
 * Asserts:
 *   - read-only user (canWrite=false): static read view, no inputs, no Save;
 *   - write user (canWrite=true): editable controls + a dirty-gated "Save changes";
 *   - Save calls the injected Server Action with the EXACT zod patch payload
 *     ({ projectId, patch: { productName, category, ... } }) and refreshes;
 *   - empty optional fields are sent as null (zod optionalText/-Decimal contract);
 *   - action error codes map to inline messages + no refresh on failure.
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
  fieldPacksPerCase: 'Packs per case',
  fieldOutputUnit: 'Output unit',
  fieldOutputUnitKg: 'kg',
  fieldOutputUnitPieces: 'pieces',
  fieldOutputUnitBoxes: 'boxes',
  fieldSalesChannel: 'Sales channel',
  fieldWeeklyVolumePacks: 'Weekly volume (packs/week)',
  fieldRunsPerWeek: 'Runs per week (estimate)',
  fieldRunsPerWeekHelp: 'Estimate help copy',
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
  saveChanges: 'Save changes',
  saved: 'Saved',
  errInvalidInput: 'Some fields are invalid. Check and try again.',
  errForbidden: 'You do not have permission to edit this brief.',
  errNotFound: 'This project could not be found.',
  errPersistence: 'Could not save the brief. Try again.',
  uploading: 'Uploading…',
  attachColName: 'File',
  attachColSize: 'Size',
  attachColUploaded: 'Uploaded',
  attachDownload: 'Download',
  attachDelete: 'Delete',
  attachDeleteConfirm: 'Remove this attachment?',
  attachTooLarge: 'File is larger than 20 MB.',
  attachUnsupportedType: 'Unsupported file type. Allowed: PDF, PNG, JPG, DOCX, XLSX.',
  attachUploadFailed: 'Could not upload the attachment. Please try again.',
  attachDeleteFailed: 'Could not delete the attachment. Please try again.',
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
  packsPerCase: 12,
  weeklyVolumePacks: '1200',
  runsPerWeek: '3',
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

describe('ProjectBriefScreen — read-only view (project.jsx:45-105)', () => {
  it('RBAC: read-only user (canWrite=false) sees the static read view — no inline form, no Save', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite={false} />);
    expect(screen.getByTestId('project-brief-card-title')).toHaveTextContent('Project brief');
    expect(screen.getByTestId('project-brief-completed-badge')).toHaveTextContent('✓ Completed');
    // No editable controls / Save in the read view.
    expect(screen.queryByTestId('brief-inline-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('brief-save')).not.toBeInTheDocument();
    expect(screen.queryByTestId('brief-field-productName')).not.toBeInTheDocument();
    // The read field still renders the value as static text.
    expect(screen.getByTestId('project-brief-field-product-name')).toHaveTextContent('Sliced Ham 200g');
    // Packs per case renders its integer value in the read view.
    expect(screen.getByTestId('project-brief-field-packs-per-case')).toHaveTextContent('12');
    // Upload stays disabled in both views.
    expect(screen.getByTestId('project-brief-upload')).toBeDisabled();
  });

  it('RBAC: no inline form when canWrite is true but no onUpdate action is injected', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite />);
    expect(screen.queryByTestId('brief-inline-form')).not.toBeInTheDocument();
  });
});

describe('ProjectBriefScreen — inline edit form (write grant)', () => {
  it('renders editable controls bound to the current brief values + a Save changes button', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={vi.fn()} />);
    expect(screen.getByTestId('brief-inline-form')).toBeInTheDocument();
    expect(screen.getByTestId('brief-field-productName')).toHaveValue('Sliced Ham 200g');
    expect(screen.getByTestId('brief-field-targetLaunchDate')).toHaveValue('2026-09-01');
    expect(screen.getByTestId('brief-field-targetRetailPriceEur')).toHaveValue('19.90');
    expect(screen.getByTestId('brief-field-packFormat')).toHaveValue('200g sliced pack');
    expect(screen.getByTestId('brief-field-packWeightG')).toHaveValue(200);
    expect(screen.getByTestId('brief-field-packsPerCase')).toHaveValue(12);
    expect(screen.getByTestId('brief-field-weeklyVolumePacks')).toHaveValue(1200);
    expect(screen.getByTestId('brief-field-runsPerWeek')).toHaveValue(3);
    expect(screen.getByTestId('brief-field-targetAudience')).toHaveValue('Premium retail');
    expect(screen.getByTestId('brief-field-marketingClaims')).toHaveValue('High protein');
    expect(screen.getByTestId('brief-field-constraints')).toHaveValue('Shelf life >= 28 days');
    expect(screen.getByTestId('brief-field-notes')).toHaveValue('Carrefour PL listing target');
    // Category / Sales channel render as accessible comboboxes (shadcn Select, not raw <select>).
    expect(screen.getByRole('combobox', { name: LABELS.fieldCategory })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: LABELS.fieldSalesChannel })).toBeInTheDocument();
    expect(document.querySelector('select')).toBeNull();
  });

  it('dirty gating: Save changes is disabled until a field is edited, then enabled', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={vi.fn()} />);
    const save = screen.getByTestId('brief-save');
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });
    expect(save).toBeEnabled();
  });

  it('submit: calls the action with the exact zod patch payload, then refreshes', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);

    fireEvent.change(screen.getByTestId('brief-field-productName'), { target: { value: 'Sliced Ham 250g' } });
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByTestId('brief-save'));

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
        // Present (unchanged) value sent as a number per the zod patch contract.
        packsPerCase: 12,
        weeklyVolumePacks: '1200',
        runsPerWeek: '3',
        salesChannel: 'Retail',
        targetAudience: 'Premium retail',
        marketingClaims: 'High protein',
        constraints: 'Shelf life >= 28 days',
        notes: 'Updated note',
      },
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it('submit: empty optional fields are sent as null (zod optionalText/-Decimal contract)', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    const sparse: ProjectBriefView = { ...READY, salesChannel: null, notes: null, packWeightG: null };
    render(<ProjectBriefScreen state="ready" data={sparse} labels={LABELS} canWrite onUpdate={onUpdate} />);
    // Make the form dirty (Save is dirty-gated) without re-populating the empty fields.
    fireEvent.change(screen.getByTestId('brief-field-productName'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('brief-save'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const arg = onUpdate.mock.calls[0]![0] as { patch: Record<string, unknown> };
    expect(arg.patch.notes).toBeNull();
    expect(arg.patch.packWeightG).toBeNull();
    expect(arg.patch.salesChannel).toBeNull();
  });

  it('Packs per case: an empty input is OMITTED from the patch (existing value NOT clobbered to null)', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    // Brief already has packsPerCase = 12 (READY). The user clears it and saves
    // some OTHER field — the patch must NOT carry packsPerCase at all, so the
    // backend keeps the existing 12 instead of nulling it.
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    expect(screen.getByTestId('brief-field-packsPerCase')).toHaveValue(12);
    fireEvent.change(screen.getByTestId('brief-field-packsPerCase'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByTestId('brief-save'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const { patch } = onUpdate.mock.calls[0]![0] as { patch: Record<string, unknown> };
    expect(patch).not.toHaveProperty('packsPerCase');
    expect(patch.notes).toBe('Updated note');
  });

  it('Packs per case: an edited integer is sent as a number in the patch', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.change(screen.getByTestId('brief-field-packsPerCase'), { target: { value: '24' } });
    fireEvent.click(screen.getByTestId('brief-save'));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const { patch } = onUpdate.mock.calls[0]![0] as { patch: Record<string, unknown> };
    expect(patch.packsPerCase).toBe(24);
  });

  it('error path: FORBIDDEN maps to the inline permission message + no refresh', async () => {
    const onUpdate = vi.fn(async () => ({ ok: false as const, error: 'FORBIDDEN' as const }));
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite onUpdate={onUpdate} />);
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByTestId('brief-save'));

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
    fireEvent.change(screen.getByTestId('brief-field-notes'), { target: { value: 'Updated note' } });
    fireEvent.click(screen.getByTestId('brief-save'));

    await waitFor(() =>
      expect(screen.getByTestId('brief-form-error')).toHaveTextContent('Could not save the brief. Try again.'),
    );
  });
});
