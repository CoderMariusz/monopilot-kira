/**
 * @vitest-environment jsdom
 * NPD PACKAGING stage — Artwork panel UI test (storage backend wired).
 *
 * Asserts: real <img> preview via signed URL, enabled Preview (window.open),
 * "New version" / "Upload artwork" upload flow (client validation + refresh),
 * version history with the Current badge + confirmed per-version delete, and
 * the honest no-artwork state.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/en/pipeline/p1/packaging',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@monopilot/ui/Modal', () => {
  function Modal({ children, open }: { children: React.ReactNode; open: boolean }) {
    if (!open) return null;
    return <div role="dialog">{children}</div>;
  }
  Modal.Header = ({ title }: { title: string }) => <h2>{title}</h2>;
  Modal.Body = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Modal.Footer = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  return { __esModule: true, default: Modal };
});

import {
  PackagingScreen,
  type ArtworkView,
  type PackagingLabels,
  type PackagingScreenData,
} from '../packaging-screen';

beforeEach(() => {
  refreshMock.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LABELS = {
  title: 'Packaging',
  subtitle: 'Primary & secondary packaging specification and artwork.',
  breadcrumb: 'NPD / Packaging',
  primaryTitle: 'Primary packaging',
  secondaryTitle: 'Secondary packaging',
  artworkTitle: 'Artwork',
  addComponent: '+ Add component',
  editComponent: 'Edit',
  deleteComponent: 'Delete',
  colComponent: 'Component',
  colMaterial: 'Material',
  colSupplier: 'Supplier',
  colSpec: 'Spec',
  colCostUnit: 'Cost / unit',
  colStatus: 'Status',
  colActions: 'Actions',
  statusApproved: 'Approved',
  statusPendingArtwork: 'Pending artwork',
  statusDraft: 'Draft',
  artworkPreview: 'Preview',
  artworkNewVersion: 'New version',
  artworkNone: 'No artwork uploaded yet.',
  artworkUnavailable: 'Not available yet',
  artworkUpload: 'Upload artwork',
  artworkUploading: 'Uploading…',
  artworkHistoryTitle: 'Version history',
  artworkCurrent: 'Current',
  artworkDownload: 'Download',
  artworkDelete: 'Delete',
  artworkDeleteConfirm: 'Remove this artwork version?',
  artworkTooLarge: 'File is larger than 20 MB.',
  artworkUnsupportedType: 'Unsupported file type. Allowed: PDF, PNG, JPG.',
  artworkUploadFailed: 'Could not upload the artwork. Please try again.',
  artworkDeleteFailed: 'Could not delete the artwork version. Please try again.',
  fieldComponent: 'Component name',
  fieldMaterial: 'Material',
  fieldSupplier: 'Supplier',
  fieldSpec: 'Spec',
  fieldCostUnit: 'Cost per unit (€)',
  fieldStatus: 'Status',
  fieldTier: 'Tier',
  tierPrimary: 'Primary',
  tierSecondary: 'Secondary',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save.',
  confirmDelete: 'Remove this component?',
  emDash: '—',
  pickerTrigger: '+ Pick from catalog',
  pickerSearchLabel: 'Search packaging items',
  pickerSearchPlaceholder: 'Search by code or name…',
  pickerLoading: 'Searching…',
  pickerEmpty: 'No matching packaging items',
  pickerCancel: 'Cancel',
  pickerError: 'Item search failed',
  pickedHint: 'Linked to {code}',
  pickerClear: 'Clear link',
  loading: 'Loading packaging data…',
  empty: 'No packaging components yet',
  emptyBody: 'Add a component to get started.',
  error: 'Unable to load packaging data.',
  forbidden: 'No permission.',
} satisfies PackagingLabels;

const ARTWORK: ArtworkView = {
  fileName: 'label-front.png',
  uploadedAt: '2026-06-10',
  fileSize: '1.2 MB',
  signedUrl: 'https://signed.example/v2.png',
  isImage: true,
  objectName: 'v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-label-front.png',
  versions: [
    {
      version: 2,
      objectName: 'v2-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb-label-front.png',
      fileName: 'label-front.png',
      uploadedAt: '2026-06-10',
      fileSize: '1.2 MB',
      signedUrl: 'https://signed.example/v2.png',
      isImage: true,
    },
    {
      version: 1,
      objectName: 'v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-draft.pdf',
      fileName: 'draft.pdf',
      uploadedAt: '2026-06-01',
      fileSize: '0.8 MB',
      signedUrl: 'https://signed.example/v1.pdf',
      isImage: false,
    },
  ],
};

function dataWith(artwork: ArtworkView | null): PackagingScreenData {
  return {
    projectId: '33333333-3333-4333-8333-333333333333',
    productName: 'Sliced Ham 200g',
    primary: [],
    secondary: [],
    artwork,
  };
}

function pngFile(name = 'art.png'): File {
  return new File(['png'], name, { type: 'image/png' });
}

describe('Artwork panel (storage-backed)', () => {
  it('renders the real image thumbnail and an enabled Preview that opens the signed URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<PackagingScreen state="ready" data={dataWith(ARTWORK)} labels={LABELS} />);

    const thumbnail = screen.getByTestId('artwork-thumbnail');
    expect(thumbnail.tagName).toBe('IMG');
    expect(thumbnail).toHaveAttribute('src', ARTWORK.signedUrl!);

    const preview = screen.getByTestId('artwork-preview');
    expect(preview).toBeEnabled();
    fireEvent.click(preview);
    expect(openSpy).toHaveBeenCalledWith(ARTWORK.signedUrl, '_blank', 'noopener,noreferrer');
  });

  it('uploads a new version through the hidden input and refreshes on success', async () => {
    const onUploadArtwork = vi.fn().mockResolvedValue({ ok: true });
    render(
      <PackagingScreen
        state="ready"
        data={dataWith(ARTWORK)}
        labels={LABELS}
        canWrite
        onUploadArtwork={onUploadArtwork}
      />,
    );
    expect(screen.getByTestId('artwork-new-version')).toBeEnabled();
    fireEvent.change(screen.getByTestId('artwork-upload-input'), { target: { files: [pngFile()] } });

    await waitFor(() => expect(onUploadArtwork).toHaveBeenCalledTimes(1));
    const form = onUploadArtwork.mock.calls[0]![0] as FormData;
    expect(form.get('projectId')).toBe('33333333-3333-4333-8333-333333333333');
    expect(form.get('file')).toBeInstanceOf(File);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('rejects an unsupported artwork type client-side without calling the action', async () => {
    const onUploadArtwork = vi.fn();
    render(
      <PackagingScreen
        state="ready"
        data={dataWith(ARTWORK)}
        labels={LABELS}
        canWrite
        onUploadArtwork={onUploadArtwork}
      />,
    );
    const docx = new File(['x'], 'art.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByTestId('artwork-upload-input'), { target: { files: [docx] } });

    expect(await screen.findByTestId('artwork-error')).toHaveTextContent(LABELS.artworkUnsupportedType);
    expect(onUploadArtwork).not.toHaveBeenCalled();
  });

  it('renders the version history (Current on the newest) and deletes a version after confirm', async () => {
    const onDeleteArtwork = vi.fn().mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <PackagingScreen
        state="ready"
        data={dataWith(ARTWORK)}
        labels={LABELS}
        canWrite
        onDeleteArtwork={onDeleteArtwork}
      />,
    );

    const rows = screen.getAllByTestId('artwork-version-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId('artwork-version-current')).toHaveTextContent(LABELS.artworkCurrent);
    expect(within(rows[1]!).queryByTestId('artwork-version-current')).toBeNull();
    expect(within(rows[1]!).getByTestId('artwork-version-download')).toHaveAttribute(
      'href',
      'https://signed.example/v1.pdf',
    );

    fireEvent.click(within(rows[1]!).getByTestId('artwork-version-delete'));
    expect(confirmSpy).toHaveBeenCalledWith(LABELS.artworkDeleteConfirm);
    await waitFor(() =>
      expect(onDeleteArtwork).toHaveBeenCalledWith({
        projectId: '33333333-3333-4333-8333-333333333333',
        objectName: 'v1-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-draft.pdf',
      }),
    );
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('shows the honest no-artwork state with a first-upload affordance for writers', () => {
    const onUploadArtwork = vi.fn();
    render(
      <PackagingScreen
        state="ready"
        data={dataWith(null)}
        labels={LABELS}
        canWrite
        onUploadArtwork={onUploadArtwork}
      />,
    );
    expect(screen.getByTestId('artwork-none')).toHaveTextContent(LABELS.artworkNone);
    expect(screen.getByTestId('artwork-upload')).toHaveTextContent(LABELS.artworkUpload);
  });

  it('offers no upload affordance to read-only users', () => {
    render(<PackagingScreen state="ready" data={dataWith(null)} labels={LABELS} />);
    expect(screen.queryByTestId('artwork-upload')).toBeNull();
    expect(screen.queryByTestId('artwork-new-version')).toBeNull();
  });
});
