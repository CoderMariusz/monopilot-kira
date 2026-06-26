/**
 * @vitest-environment jsdom
 * T-086 — ComplianceDocsScreen + DocUploadModal component test (RED → GREEN).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:6-53  (ComplianceDocsScreen)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:667-689     (DocUploadModal)
 *
 * Asserts:
 *  - Parity grouping (one group header per doc_type) + columns
 *    (Type/Title/Version/Uploaded/Expires/Status/Actions).
 *  - Expiry status badge mapping (Valid=success/green, Expiring=warning/amber,
 *    Expired=danger/red) — color is NOT the sole signal (badge carries text + icon).
 *  - shadcn Table + Badge primitives, no raw <select>.
 *  - The five required UI states (loading / empty / ready / error / permission_denied).
 *  - i18n: component renders LABELS (message values), never inline English literals.
 *  - RBAC: the Upload control is omitted when canWrite is false (server-resolved gate).
 *  - DocUploadModal RHF fields (doc_type, title, file, expires_at) via shadcn primitives,
 *    no raw <select>, and §19 client size validation (25 MB) blocks uploadDoc.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ComplianceDocsScreen,
  type ComplianceDocRow,
  type ComplianceDocsLabels,
} from '../compliance-docs-screen';
import { DocUploadModal } from '../doc-upload-modal';

// next/link → plain anchor so the back-link href is assertable in jsdom.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

// Distinct sentinel strings prove the component renders LABELS (i18n message
// values), never inline English literals.
const LABELS: ComplianceDocsLabels = {
  title: 'lbl.title',
  subtitle: 'lbl.subtitle',
  upload: 'lbl.upload',
  colType: 'lbl.colType',
  colTitle: 'lbl.colTitle',
  colVersion: 'lbl.colVersion',
  colUploaded: 'lbl.colUploaded',
  colExpires: 'lbl.colExpires',
  colStatus: 'lbl.colStatus',
  colActions: 'lbl.colActions',
  download: 'lbl.download',
  delete: 'lbl.delete',
  noExpiry: 'lbl.noExpiry',
  statusValid: 'lbl.statusValid',
  statusExpiring: 'lbl.statusExpiring',
  statusExpired: 'lbl.statusExpired',
  loading: 'lbl.loading',
  empty: 'lbl.empty',
  emptyBody: 'lbl.emptyBody',
  error: 'lbl.error',
  forbidden: 'lbl.forbidden',
  fileTypesNote: 'lbl.fileTypesNote',
  approvalC7Note: 'lbl.approvalC7Note',
  backToApproval: 'lbl.backToApproval',
  // doc type labels
  docTypeCoA: 'lbl.docTypeCoA',
  docTypeSDS: 'lbl.docTypeSDS',
  docTypeSpec: 'lbl.docTypeSpec',
  docTypeCert: 'lbl.docTypeCert',
  docTypeOther: 'lbl.docTypeOther',
  // modal labels
  modalTitle: 'lbl.modalTitle',
  modalSubtitle: 'lbl.modalSubtitle',
  fieldDocType: 'lbl.fieldDocType',
  fieldTitle: 'lbl.fieldTitle',
  fieldTitleHint: 'lbl.fieldTitleHint',
  fieldFile: 'lbl.fieldFile',
  fieldFileHint: 'lbl.fieldFileHint',
  fieldExpires: 'lbl.fieldExpires',
  fieldExpiresHint: 'lbl.fieldExpiresHint',
  cancel: 'lbl.cancel',
  uploadAction: 'lbl.uploadAction',
  errorTitleRequired: 'lbl.errorTitleRequired',
  errorTitleTooLong: 'lbl.errorTitleTooLong',
  errorFileRequired: 'lbl.errorFileRequired',
  errorFileTooLarge: 'lbl.errorFileTooLarge',
  errorFileType: 'lbl.errorFileType',
  errorUpload: 'lbl.errorUpload',
};

// Reference "today" for deterministic expiry classification in tests.
// Valid: expiry > today+30. Expiring: today <= expiry <= today+30. Expired: < today.
const TODAY = new Date();
function isoDaysFromToday(days: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const ROWS: ComplianceDocRow[] = [
  {
    id: 'd-valid',
    productCode: 'FA5601',
    docType: 'Spec',
    title: 'Finished good specification',
    versionNumber: 2,
    uploadedAt: '2026-01-10T08:00:00.000Z',
    expiresAt: isoDaysFromToday(200),
  },
  {
    id: 'd-expiring',
    productCode: 'FA5601',
    docType: 'CoA',
    title: 'Certificate of analysis batch 42',
    versionNumber: 1,
    uploadedAt: '2026-02-01T08:00:00.000Z',
    expiresAt: isoDaysFromToday(10),
  },
  {
    id: 'd-expired',
    productCode: 'FA5601',
    docType: 'CoA',
    title: 'Certificate of analysis batch 41',
    versionNumber: 1,
    uploadedAt: '2025-12-01T08:00:00.000Z',
    expiresAt: isoDaysFromToday(-5),
  },
  {
    id: 'd-noexpiry',
    productCode: 'FA5601',
    docType: 'Cert',
    title: 'BRCGS certificate',
    versionNumber: 1,
    uploadedAt: '2026-01-15T08:00:00.000Z',
    expiresAt: null,
  },
];

function renderScreen(overrides: Partial<React.ComponentProps<typeof ComplianceDocsScreen>> = {}) {
  return render(
    <ComplianceDocsScreen
      productCode="FA5601"
      rows={ROWS}
      labels={LABELS}
      canWrite
      state="ready"
      {...overrides}
    />,
  );
}

describe('ComplianceDocsScreen — prototype parity (docs-screens.jsx:6-53)', () => {
  it('renders the parity columns (Type→Title→Version→Uploaded→Expires→Status→Actions)', () => {
    renderScreen();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent ?? '');
    const idx = (l: string) => headers.findIndex((h) => h.includes(l));
    expect(idx(LABELS.colType)).toBeGreaterThanOrEqual(0);
    expect(idx(LABELS.colType)).toBeLessThan(idx(LABELS.colTitle));
    expect(idx(LABELS.colTitle)).toBeLessThan(idx(LABELS.colVersion));
    expect(idx(LABELS.colVersion)).toBeLessThan(idx(LABELS.colUploaded));
    expect(idx(LABELS.colUploaded)).toBeLessThan(idx(LABELS.colExpires));
    expect(idx(LABELS.colExpires)).toBeLessThan(idx(LABELS.colStatus));
    expect(idx(LABELS.colStatus)).toBeLessThan(idx(LABELS.colActions));
  });

  it('groups docs per doc_type with a labelled group header per type present', () => {
    renderScreen();
    // CoA, Spec, Cert groups exist (Other / SDS not present in fixtures).
    expect(screen.getByTestId('doc-group-CoA')).toBeInTheDocument();
    expect(screen.getByTestId('doc-group-Spec')).toBeInTheDocument();
    expect(screen.getByTestId('doc-group-Cert')).toBeInTheDocument();
    expect(screen.queryByTestId('doc-group-SDS')).toBeNull();
    // The CoA group carries both CoA docs.
    const coa = screen.getByTestId('doc-group-CoA');
    expect(within(coa).getByTestId('doc-row-d-expiring')).toBeInTheDocument();
    expect(within(coa).getByTestId('doc-row-d-expired')).toBeInTheDocument();
  });

  it('uses shadcn Table + Badge primitives, no raw <select>', () => {
    renderScreen();
    expect(document.querySelector('[data-slot="table"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="badge"]')).not.toBeNull();
    expect(document.querySelector('select')).toBeNull();
  });

  it('maps expiry status badge tone Valid=success, Expiring=warning, Expired=danger and carries a text label (not color alone)', () => {
    renderScreen();
    const valid = within(screen.getByTestId('doc-row-d-valid')).getByTestId('doc-status-badge');
    const expiring = within(screen.getByTestId('doc-row-d-expiring')).getByTestId('doc-status-badge');
    const expired = within(screen.getByTestId('doc-row-d-expired')).getByTestId('doc-status-badge');
    const noexpiry = within(screen.getByTestId('doc-row-d-noexpiry')).getByTestId('doc-status-badge');

    expect(valid).toHaveAttribute('data-variant', 'success');
    expect(expiring).toHaveAttribute('data-variant', 'warning');
    expect(expired).toHaveAttribute('data-variant', 'danger');
    expect(noexpiry).toHaveAttribute('data-variant', 'success');

    // a11y: status conveyed by text, not color alone
    expect(valid).toHaveTextContent(LABELS.statusValid);
    expect(expiring).toHaveTextContent(LABELS.statusExpiring);
    expect(expired).toHaveTextContent(LABELS.statusExpired);
  });

  it('calls getSignedUrl when the Download action is clicked (signed-URL flow)', async () => {
    const user = userEvent.setup();
    const getSignedUrlAction = vi
      .fn()
      .mockResolvedValue({ ok: true, url: 'https://signed.example/doc', expiresInSeconds: 900 });
    renderScreen({ getSignedUrlAction });
    const row = screen.getByTestId('doc-row-d-valid');
    await user.click(within(row).getByRole('button', { name: new RegExp(LABELS.download) }));
    await vi.waitFor(() =>
      expect(getSignedUrlAction).toHaveBeenCalledWith({ productCode: 'FA5601', docId: 'd-valid' }),
    );
  });
});

describe('ComplianceDocsScreen — required UI states', () => {
  it('loading: polite status with the loading label', () => {
    renderScreen({ state: 'loading' });
    expect(screen.getByText(LABELS.loading)).toBeInTheDocument();
  });

  it('empty: prototype EmptyState copy', () => {
    renderScreen({ rows: [], state: 'empty' });
    expect(screen.getByText(LABELS.empty)).toBeInTheDocument();
    expect(screen.getByText(LABELS.emptyBody)).toBeInTheDocument();
  });

  it('error: alert with the error label', () => {
    renderScreen({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.error);
  });

  it('permission_denied: alert with the forbidden label', () => {
    renderScreen({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(LABELS.forbidden);
  });
});

describe('ComplianceDocsScreen — approval criterion C7 wayfinding', () => {
  it('ready: renders the C7 banner note and a locale-prefixed "Back to Approval" link when projectId is set', () => {
    renderScreen({ projectId: 'proj-123', locale: 'pl', state: 'ready' });
    const banner = screen.getByTestId('compliance-docs-c7-banner');
    expect(banner).toHaveTextContent(LABELS.approvalC7Note);
    const back = screen.getByTestId('compliance-docs-back-to-approval');
    expect(back).toHaveTextContent(LABELS.backToApproval);
    expect(back).toHaveAttribute('href', '/pl/pipeline/proj-123/approval');
  });

  it('empty: still renders the C7 banner (so a failing C7 with no docs is actionable)', () => {
    renderScreen({ rows: [], state: 'empty', projectId: 'proj-9', locale: 'en' });
    const banner = screen.getByTestId('compliance-docs-c7-banner');
    expect(banner).toHaveTextContent(LABELS.approvalC7Note);
    expect(screen.getByTestId('compliance-docs-back-to-approval')).toHaveAttribute(
      'href',
      '/en/pipeline/proj-9/approval',
    );
  });

  it('omits the back-link (banner note only) when projectId is null', () => {
    renderScreen({ projectId: null, state: 'ready' });
    expect(screen.getByTestId('compliance-docs-c7-banner')).toHaveTextContent(LABELS.approvalC7Note);
    expect(screen.queryByTestId('compliance-docs-back-to-approval')).toBeNull();
  });

  it('suppresses the C7 banner in non-data-loaded states (error / permission_denied / loading)', () => {
    renderScreen({ state: 'error', projectId: 'proj-123' });
    expect(screen.queryByTestId('compliance-docs-c7-banner')).toBeNull();
    cleanup();
    renderScreen({ state: 'permission_denied', projectId: 'proj-123' });
    expect(screen.queryByTestId('compliance-docs-c7-banner')).toBeNull();
    cleanup();
    renderScreen({ state: 'loading', projectId: 'proj-123' });
    expect(screen.queryByTestId('compliance-docs-c7-banner')).toBeNull();
  });
});

describe('ComplianceDocsScreen — RBAC', () => {
  it('renders the Upload control when canWrite is true', () => {
    renderScreen({ canWrite: true });
    expect(screen.getByRole('button', { name: LABELS.upload })).toBeInTheDocument();
  });

  it('omits the Upload control entirely when canWrite is false (no render-then-disable)', () => {
    renderScreen({ canWrite: false });
    expect(screen.queryByRole('button', { name: LABELS.upload })).toBeNull();
  });
});

describe('DocUploadModal — prototype parity (modals.jsx:667-689) + §19 client validation', () => {
  function makeFile(name: string, type: string, sizeBytes: number): File {
    const file = new File(['x'], name, { type });
    Object.defineProperty(file, 'size', { value: sizeBytes });
    return file;
  }

  it('renders RHF fields (doc_type, title, file, expires_at) via shadcn primitives, no raw <select>', () => {
    render(
      <DocUploadModal
        open
        productCode="FA5601"
        labels={LABELS}
        onClose={() => {}}
        uploadDocAction={vi.fn()}
      />,
    );
    expect(screen.getByText(LABELS.fieldDocType)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(LABELS.fieldTitle))).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(LABELS.fieldFile))).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(LABELS.fieldExpires))).toBeInTheDocument();
    // doc_type uses shadcn Select (combobox) — never raw <select>
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(1);
    expect(document.querySelector('select')).toBeNull();
    // file input restricts accepted MIME extensions
    const fileInput = screen.getByLabelText(new RegExp(LABELS.fieldFile)) as HTMLInputElement;
    expect(fileInput.getAttribute('accept')).toContain('.pdf');
    expect(fileInput.getAttribute('accept')).toContain('.xlsx');
    expect(fileInput.getAttribute('accept')).toContain('.docx');
  });

  it('does NOT call uploadDoc when a 25 MB file is picked (§19 client size validation)', async () => {
    const user = userEvent.setup();
    const uploadDocAction = vi.fn().mockResolvedValue({ ok: true, docId: 'x', versionNumber: 1 });
    render(
      <DocUploadModal
        open
        productCode="FA5601"
        labels={LABELS}
        onClose={() => {}}
        uploadDocAction={uploadDocAction}
      />,
    );

    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldTitle)), 'Spec document');
    const fileInput = screen.getByLabelText(new RegExp(LABELS.fieldFile)) as HTMLInputElement;
    const big = makeFile('huge.pdf', 'application/pdf', 25 * 1024 * 1024);
    await user.upload(fileInput, big);
    await user.click(screen.getByRole('button', { name: LABELS.uploadAction }));

    expect(await screen.findByText(LABELS.errorFileTooLarge)).toBeInTheDocument();
    expect(uploadDocAction).not.toHaveBeenCalled();
  });

  it('does NOT call uploadDoc when an unsupported MIME type is picked (§19 client MIME validation)', async () => {
    const user = userEvent.setup();
    const uploadDocAction = vi.fn().mockResolvedValue({ ok: true, docId: 'x', versionNumber: 1 });
    render(
      <DocUploadModal
        open
        productCode="FA5601"
        labels={LABELS}
        onClose={() => {}}
        uploadDocAction={uploadDocAction}
      />,
    );

    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldTitle)), 'Spec document');
    const fileInput = screen.getByLabelText(new RegExp(LABELS.fieldFile)) as HTMLInputElement;
    const png = makeFile('image.png', 'image/png', 1024);
    // Use fireEvent.change with an explicit file so the file lands despite the accept= filter —
    // this exercises the zod MIME superRefine (defence-in-depth: a user can still drop a
    // renamed file or a file whose declared type slips past the OS picker).
    fireEvent.change(fileInput, { target: { files: [png] } });
    await user.click(screen.getByRole('button', { name: LABELS.uploadAction }));

    expect(await screen.findByText(LABELS.errorFileType)).toBeInTheDocument();
    expect(uploadDocAction).not.toHaveBeenCalled();
  });

  it('DOES call uploadDoc with FormData (productCode, docType, title, file) for a valid 1 MB PDF', async () => {
    const user = userEvent.setup();
    const uploadDocAction = vi.fn().mockResolvedValue({ ok: true, docId: 'new', versionNumber: 1 });
    const onClose = vi.fn();
    render(
      <DocUploadModal
        open
        productCode="FA5601"
        labels={LABELS}
        onClose={onClose}
        uploadDocAction={uploadDocAction}
      />,
    );

    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldTitle)), 'Spec document v1');
    const fileInput = screen.getByLabelText(new RegExp(LABELS.fieldFile)) as HTMLInputElement;
    const pdf = makeFile('spec.pdf', 'application/pdf', 1024 * 1024);
    await user.upload(fileInput, pdf);
    await user.click(screen.getByRole('button', { name: LABELS.uploadAction }));

    await vi.waitFor(() => expect(uploadDocAction).toHaveBeenCalledTimes(1));
    const fd = uploadDocAction.mock.calls[0][0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('productCode')).toBe('FA5601');
    expect(fd.get('docType')).toBe('Spec');
    expect(fd.get('title')).toBe('Spec document v1');
    expect(fd.get('file')).toBeInstanceOf(File);
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a server error (e.g. STORAGE_FAILED) without closing the modal', async () => {
    const user = userEvent.setup();
    const uploadDocAction = vi.fn().mockResolvedValue({ ok: false, code: 'STORAGE_FAILED' });
    const onClose = vi.fn();
    render(
      <DocUploadModal
        open
        productCode="FA5601"
        labels={LABELS}
        onClose={onClose}
        uploadDocAction={uploadDocAction}
      />,
    );

    await user.type(screen.getByLabelText(new RegExp(LABELS.fieldTitle)), 'Spec document v1');
    const fileInput = screen.getByLabelText(new RegExp(LABELS.fieldFile)) as HTMLInputElement;
    const pdf = makeFile('spec.pdf', 'application/pdf', 1024 * 1024);
    await user.upload(fileInput, pdf);
    await user.click(screen.getByRole('button', { name: LABELS.uploadAction }));

    expect(await screen.findByText(LABELS.errorUpload)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
