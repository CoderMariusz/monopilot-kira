/**
 * @vitest-environment jsdom
 * NPD project-stage Brief — attachments card UI test (storage backend wired).
 *
 * Asserts: "+ Upload" enabled only with write grant + injected action; client
 * oversize/type rejection (action never called); upload happy path (FormData
 * carries projectId + file, router.refresh on success); attachment rows with
 * signed-URL download links; confirmed delete; empty state.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/brief',
  useSearchParams: () => new URLSearchParams(),
}));

import {
  ProjectBriefScreen,
  type BriefAttachmentItem,
  type ProjectBriefLabels,
} from '../project-brief-screen';
import type { ProjectBriefView } from '../../_actions/read-project-brief';

beforeEach(() => {
  refreshMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LABELS = {
  cardTitle: 'Project brief',
  completed: 'Completed',
  fieldProductName: 'Product name',
  fieldCategory: 'Category',
  fieldTargetLaunch: 'Target launch date',
  fieldTargetPrice: 'Target retail price (EUR)',
  fieldPackFormat: 'Pack format',
  fieldPackWeight: 'Pack weight (g)',
  fieldPacksPerCase: 'Packs per case',
  fieldSalesChannel: 'Sales channel',
  fieldWeeklyVolumePacks: 'Weekly volume (packs/week)',
  fieldRunsPerWeek: 'Runs per week (estimate)',
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
  emptyBody: 'No brief.',
  error: 'Unable to load the brief.',
  forbidden: 'No permission.',
  editBrief: 'Edit brief',
  editModalTitle: 'Edit project brief',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveChanges: 'Save changes',
  saved: 'Saved',
  errInvalidInput: 'Invalid input.',
  errForbidden: 'Forbidden.',
  errNotFound: 'Not found.',
  errPersistence: 'Persistence failed.',
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
} satisfies ProjectBriefLabels;

const READY: ProjectBriefView = {
  briefId: '33333333-3333-4333-8333-333333333333',
  devCode: 'DEV2606-1',
  projectName: 'Sliced Ham 200g',
  status: 'converted',
  productName: 'Sliced Ham 200g',
  targetLaunchDate: '2026-09-01',
  packFormat: '200g sliced pack',
  packWeightG: '200',
  weeklyVolumePacks: '1200',
  runsPerWeek: null,
  expectedVolume: null,
  marketingClaims: 'High protein',
  category: 'Meat · Cold cut',
  targetRetailPriceEur: '19.90',
  salesChannel: 'Retail',
  targetAudience: 'Families',
  constraints: null,
  notes: null,
};

const ATTACHMENT: BriefAttachmentItem = {
  objectName: '44444444-4444-4444-8444-444444444444-spec.pdf',
  fileName: 'spec.pdf',
  sizeBytes: 2 * 1024 * 1024,
  uploadedAt: '2026-06-11T08:00:00.000Z',
  signedUrl: 'https://signed.example/spec.pdf',
};

function pdfFile(name = 'brief.pdf'): File {
  return new File(['pdf'], name, { type: 'application/pdf' });
}

describe('Brief attachments card', () => {
  it('keeps "+ Upload" disabled (with hint) when no upload action is injected', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} canWrite />);
    const button = screen.getByTestId('project-brief-upload');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', LABELS.uploadDisabledHint);
  });

  it('enables "+ Upload" with a write grant + injected action and uploads a valid file', async () => {
    const onUploadAttachment = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProjectBriefScreen
        state="ready"
        data={READY}
        labels={LABELS}
        canWrite
        onUploadAttachment={onUploadAttachment}
      />,
    );
    const button = screen.getByTestId('project-brief-upload');
    expect(button).toBeEnabled();

    const input = screen.getByTestId('project-brief-upload-input');
    fireEvent.change(input, { target: { files: [pdfFile()] } });

    await waitFor(() => expect(onUploadAttachment).toHaveBeenCalledTimes(1));
    const form = onUploadAttachment.mock.calls[0]![0] as FormData;
    expect(form.get('projectId')).toBe(READY.briefId);
    expect(form.get('file')).toBeInstanceOf(File);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('rejects an oversize file client-side without calling the action', async () => {
    const onUploadAttachment = vi.fn();
    render(
      <ProjectBriefScreen
        state="ready"
        data={READY}
        labels={LABELS}
        canWrite
        onUploadAttachment={onUploadAttachment}
      />,
    );
    const big = pdfFile('big.pdf');
    Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
    fireEvent.change(screen.getByTestId('project-brief-upload-input'), { target: { files: [big] } });

    expect(await screen.findByTestId('project-brief-attachments-error')).toHaveTextContent(
      LABELS.attachTooLarge,
    );
    expect(onUploadAttachment).not.toHaveBeenCalled();
  });

  it('rejects an unsupported type client-side', async () => {
    const onUploadAttachment = vi.fn();
    render(
      <ProjectBriefScreen
        state="ready"
        data={READY}
        labels={LABELS}
        canWrite
        onUploadAttachment={onUploadAttachment}
      />,
    );
    const exe = new File(['x'], 'evil.exe', { type: 'application/x-msdownload' });
    fireEvent.change(screen.getByTestId('project-brief-upload-input'), { target: { files: [exe] } });

    expect(await screen.findByTestId('project-brief-attachments-error')).toHaveTextContent(
      LABELS.attachUnsupportedType,
    );
    expect(onUploadAttachment).not.toHaveBeenCalled();
  });

  it('surfaces a server rejection honestly', async () => {
    const onUploadAttachment = vi.fn().mockResolvedValue({ ok: false, error: 'STORAGE_FAILED' });
    render(
      <ProjectBriefScreen
        state="ready"
        data={READY}
        labels={LABELS}
        canWrite
        onUploadAttachment={onUploadAttachment}
      />,
    );
    fireEvent.change(screen.getByTestId('project-brief-upload-input'), { target: { files: [pdfFile()] } });
    expect(await screen.findByTestId('project-brief-attachments-error')).toHaveTextContent(
      LABELS.attachUploadFailed,
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('renders attachment rows with signed-URL downloads and a confirmed delete', async () => {
    const onDeleteAttachment = vi.fn().mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ProjectBriefScreen
        state="ready"
        data={READY}
        labels={LABELS}
        canWrite
        attachments={[ATTACHMENT]}
        onDeleteAttachment={onDeleteAttachment}
      />,
    );

    const row = screen.getByTestId('project-brief-attachment-row');
    expect(row).toHaveTextContent('spec.pdf');
    expect(row).toHaveTextContent('2.0 MB');
    const link = screen.getByTestId('project-brief-attachment-download');
    expect(link).toHaveAttribute('href', ATTACHMENT.signedUrl);

    fireEvent.click(screen.getByTestId('project-brief-attachment-delete'));
    expect(confirmSpy).toHaveBeenCalledWith(LABELS.attachDeleteConfirm);
    await waitFor(() =>
      expect(onDeleteAttachment).toHaveBeenCalledWith({
        projectId: READY.briefId,
        objectName: ATTACHMENT.objectName,
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows the honest empty state with no attachments', () => {
    render(<ProjectBriefScreen state="ready" data={READY} labels={LABELS} />);
    expect(screen.getByTestId('project-brief-attachments-empty')).toHaveTextContent(
      LABELS.attachmentsEmpty,
    );
  });
});
