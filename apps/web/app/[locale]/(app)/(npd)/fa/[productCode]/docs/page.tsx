/**
 * T-086 — Compliance documents page (SCR-10, per-FA).
 *
 * Server Component. Reads REAL, org-scoped compliance docs from public.compliance_docs
 * via the T-084 `listDocs` Server Action (RLS-enforced as app_user with
 * app.current_org_id()). No mocks, no hard-coded rows. Upload / download / delete are
 * wired to the T-084 uploadDoc / getSignedUrl / softDeleteDoc Server Actions (owned by
 * T-084 — imported, never authored here).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/docs-screens.jsx:6-53 (ComplianceDocsScreen)
 *   prototypes/design/Monopilot Design System/npd/modals.jsx:667-689    (DocUploadModal)
 *
 * RBAC: listDocs returns FORBIDDEN when the caller lacks npd.compliance_doc.write — that
 * maps to the permission_denied UI state (no rows ever leak). When listDocs succeeds the
 * caller holds the write permission, so canWrite is true.
 */

import { getTranslations } from 'next-intl/server';

import {
  ComplianceDocsScreen,
  type ComplianceDocRow,
  type ComplianceDocsLabels,
  type DocType,
  type PageState,
} from '../../../../../../(npd)/fa/[productCode]/docs/_components/compliance-docs-screen';
import { getSignedUrl } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/get-signed-url';
import { listDocs } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/list-docs';
import { softDeleteDoc } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/soft-delete-doc';
import { uploadDoc } from '../../../../../../(npd)/fa/[productCode]/docs/_actions/upload-doc';

export const dynamic = 'force-dynamic';

type DocsPageProps = {
  params?: Promise<{ locale: string; productCode: string }>;
  // Test-only injection seam (mirrors risks/page.tsx convention).
  rows?: ComplianceDocRow[];
  canWrite?: boolean;
  state?: PageState;
};

const DEFAULT_LABELS: ComplianceDocsLabels = {
  title: 'Compliance documents',
  subtitle: 'Read-only attachments tied to this Finished Good.',
  upload: '+ Upload document',
  colType: 'Type',
  colTitle: 'Title',
  colVersion: 'Version',
  colUploaded: 'Uploaded',
  colExpires: 'Expires',
  colStatus: 'Status',
  colActions: 'Actions',
  download: 'Download',
  delete: 'Delete',
  noExpiry: 'No expiry',
  statusValid: 'Valid',
  statusExpiring: 'Expiring',
  statusExpired: 'Expired',
  loading: 'Loading compliance documents…',
  empty: 'No compliance documents yet',
  emptyBody:
    'Upload the compliance artefacts tied to this FA (specs, certificates, CoA). PDF, XLSX, DOCX up to 20 MB.',
  error: 'Unable to load compliance documents. Try again after the backend is available.',
  forbidden: 'You do not have permission to view compliance documents for this FA.',
  fileTypesNote:
    'File types: PDF, XLSX, DOCX. Max 20 MB per upload. Documents nearing expiry are flagged automatically.',
  docTypeCoA: 'CoA',
  docTypeSDS: 'SDS',
  docTypeSpec: 'Spec',
  docTypeCert: 'Certificate',
  docTypeOther: 'Other',
  modalTitle: 'Upload compliance document',
  modalSubtitle: 'FA {code}',
  fieldDocType: 'Document type',
  fieldTitle: 'Title',
  fieldTitleHint: 'A short human-readable name (3–300 characters).',
  fieldFile: 'File',
  fieldFileHint: 'PDF, XLSX, DOCX · max 20 MB',
  fieldExpires: 'Expiry date',
  fieldExpiresHint: 'Optional. Documents are flagged 30 days before this date.',
  cancel: 'Cancel',
  uploadAction: 'Upload',
  errorTitleRequired: 'Title must be at least 3 characters.',
  errorTitleTooLong: 'Title must be at most 300 characters.',
  errorFileRequired: 'A file is required.',
  errorFileTooLarge: 'File exceeds the 20 MB limit.',
  errorFileType: 'Unsupported file type. Use PDF, XLSX or DOCX.',
  errorUpload: 'Upload failed. Please try again.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof ComplianceDocsLabels>;

function translateLabel(t: (key: string) => string, key: keyof ComplianceDocsLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<ComplianceDocsLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.compliance' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as ComplianceDocsLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type LoaderResult = { state: PageState; rows: ComplianceDocRow[]; canWrite: boolean };

async function readPageData(productCode: string): Promise<LoaderResult> {
  try {
    const result = await listDocs({ productCode });
    if (!result.ok) {
      const state: PageState = result.code === 'FORBIDDEN' ? 'permission_denied' : 'error';
      return { state, rows: [], canWrite: false };
    }
    const rows: ComplianceDocRow[] = result.docs.map((doc) => ({
      id: doc.id,
      productCode: doc.productCode,
      docType: doc.docType as DocType,
      title: doc.title,
      versionNumber: doc.versionNumber,
      uploadedAt: doc.uploadedAt,
      expiresAt: doc.expiresAt,
    }));
    // listDocs is gated on the write permission, so a successful read implies write access.
    return { state: rows.length === 0 ? 'empty' : 'ready', rows, canWrite: true };
  } catch (error) {
    console.error('[compliance-docs] org-scoped read failed:', error);
    return { state: 'error', rows: [], canWrite: false };
  }
}

export default async function ComplianceDocsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as DocsPageProps;
  const { locale, productCode } = props.params
    ? await props.params
    : { locale: 'en', productCode: '' };

  const labels = await buildLabels(locale);

  const injected = Array.isArray(props.rows);
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
        canWrite: props.canWrite ?? true,
      }
    : await readPageData(productCode);

  return (
    <ComplianceDocsScreen
      productCode={productCode}
      rows={loaded.rows}
      labels={labels}
      canWrite={props.canWrite ?? loaded.canWrite}
      state={props.state ?? loaded.state}
      uploadDocAction={uploadDoc}
      getSignedUrlAction={getSignedUrl}
      softDeleteDocAction={softDeleteDoc}
    />
  );
}
