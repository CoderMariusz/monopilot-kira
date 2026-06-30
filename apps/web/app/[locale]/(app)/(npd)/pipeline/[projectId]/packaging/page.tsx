/**
 * NPD PACKAGING stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/packaging
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - npd_projects                  → resolve product_name + confirm the project
 *   - public.packaging_components   → primary + secondary tier components (mig 232)
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:165-219
 *   (PackagingScreen). The prototype "LEGACY — Phase 2 deprecation" banner is
 *   DELIBERATELY NOT rendered (product-owner decision: all 8 stages are real).
 *
 * RBAC (resolved server-side, never client-trusted):
 *   read  → npd.packaging.read   (gates the whole screen → permission_denied)
 *   write → npd.packaging.write  (gates Add/Edit/Delete → canWrite flag)
 *
 * Money (cost_per_unit) is read as a decimal STRING (::text) and rendered
 * without float coercion. The write Server Actions are wrapped in small
 * 'use server' adapters and passed across the RSC boundary (Next16 guard).
 */

import { getTranslations } from 'next-intl/server';

import {
  PackagingScreen,
  type ArtworkDeleteCall,
  type ArtworkView,
  type PackagingLabels,
  type PackagingScreenData,
  type PageState,
  type MutationOutcome,
  type UpsertCall,
} from './_components/packaging-screen';
import { upsertPackagingComponent } from './_actions/upsertPackagingComponent';
import { deletePackagingComponent } from './_actions/deletePackagingComponent';
import { uploadArtworkVersion } from './_actions/uploadArtworkVersion';
import { listArtworkVersions } from './_actions/listArtworkVersions';
import { deleteArtworkVersion } from './_actions/deleteArtworkVersion';
import { searchItems, type ItemPickerOption } from '../../../../../../(npd)/fa/actions/search-items';
import type { ItemSearchFn } from '../../../_components/item-picker';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  PACKAGING_READ_PERMISSION,
  PACKAGING_WRITE_PERMISSION,
  hasPermission,
  type PackagingComponentRow,
  type PackagingStatus,
  type PackagingTier,
  type QueryClient,
} from './_actions/shared';

export const dynamic = 'force-dynamic';

type PackagingPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/nutrition pages).
  data?: PackagingScreenData | null;
  state?: PageState;
  canWrite?: boolean;
};

type LoaderResult = { state: PageState; data: PackagingScreenData | null; canWrite: boolean };

const DEFAULT_LABELS: PackagingLabels = {
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
  fieldScrapPct: 'Scrap %',
  fieldStatus: 'Status',
  fieldTier: 'Tier',
  tierPrimary: 'Primary',
  tierSecondary: 'Secondary',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the component. Check the fields and try again.',
  confirmDelete: 'Remove this component?',
  emDash: '—',
  loading: 'Loading packaging data…',
  empty: 'No packaging components yet',
  emptyBody: 'Add a primary or secondary packaging component to get started.',
  error: 'Unable to load packaging data.',
  forbidden: 'You do not have permission to view packaging data.',
  pickerTrigger: '+ Pick from catalog',
  pickerSearchLabel: 'Search packaging items',
  pickerSearchPlaceholder: 'Search by code or name…',
  pickerLoading: 'Searching…',
  pickerEmpty: 'No matching packaging items',
  pickerCancel: 'Cancel',
  pickerError: 'Item search failed',
  pickedHint: 'Linked to {code}',
  pickerClear: 'Clear link',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof PackagingLabels>;

function translateLabel(t: (key: string) => string, key: keyof PackagingLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<PackagingLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.packaging' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as PackagingLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

type LoaderRow = {
  id: string;
  tier: string;
  component_name: string;
  material: string | null;
  supplier_code: string | null;
  spec: string | null;
  cost_per_unit: string | null;
  /** NUMERIC(5,2) — the pg driver may hand this back as a string; coerced on map. */
  scrap_pct: string | number | null;
  status: string;
  artwork_file_id: string | null;
  artwork_status: string | null;
  display_order: number;
};

function toRow(r: LoaderRow): PackagingComponentRow {
  return {
    id: r.id,
    tier: r.tier as PackagingTier,
    componentName: r.component_name,
    material: r.material,
    supplierCode: r.supplier_code,
    spec: r.spec,
    costPerUnit: r.cost_per_unit,
    scrapPct: Number(r.scrap_pct ?? 0),
    status: r.status as PackagingStatus,
    artworkFileId: r.artwork_file_id,
    artworkStatus: r.artwork_status,
    displayOrder: r.display_order,
  };
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as unknown as QueryClient;

      const canRead = await hasPermission(queryClient, userId, orgId, PACKAGING_READ_PERMISSION);
      if (!canRead) return { state: 'permission_denied' as const, data: null, canWrite: false };

      const canWrite = await hasPermission(queryClient, userId, orgId, PACKAGING_WRITE_PERMISSION);

      const project = await queryClient.query<{ product_code: string | null; product_name: string | null }>(
        `select p.product_code,
                pr.product_name
           from public.npd_projects p
           left join public.product pr
             on pr.org_id = p.org_id and pr.product_code = p.product_code
          where p.id = $1::uuid and p.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      if (project.rows.length === 0) {
        return { state: 'empty' as const, data: null, canWrite };
      }
      const productName = project.rows[0]?.product_name ?? project.rows[0]?.product_code ?? projectId;

      const { rows } = await queryClient.query<LoaderRow>(
        `select id, tier, component_name, material, supplier_code, spec,
                cost_per_unit::text as cost_per_unit, coalesce(scrap_pct, 0) as scrap_pct,
                status, artwork_file_id,
                artwork_status, display_order
           from public.packaging_components
          where org_id = app.current_org_id() and project_id = $1::uuid
          order by tier asc, display_order asc, component_name asc`,
        [projectId],
      );

      // NOTE: an existing project with zero components is NOT the 'empty' state.
      // The screen must still render the tables + the "+ Add component" affordances
      // (the empty-state notice is reserved for a missing/foreign project) — this
      // is what unblocks the previous dead-end where a write-capable user saw a
      // bare "Add … to get started" card with no buttons.
      const components = rows.map(toRow);
      const data: PackagingScreenData = {
        projectId,
        productName,
        primary: components.filter((c) => c.tier === 'primary'),
        secondary: components.filter((c) => c.tier === 'secondary'),
        // Artwork file store is a future deliverable (artwork_file_id is a soft
        // nullable ref per mig 232) — no fabricated artwork metadata.
        artwork: null,
      };
      return { state: 'ready' as const, data, canWrite };
    });
  } catch (error) {
    console.error('[packaging] org-scoped read failed:', error);
    return { state: 'error', data: null, canWrite: false };
  }
}

// Artwork view assembly — versions come from the npd-attachments bucket via the
// listArtworkVersions action (separate withOrgContext call, AFTER the page read;
// a storage failure degrades to artwork:null instead of killing the page).
function formatArtworkBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readArtworkView(projectId: string): Promise<ArtworkView | null> {
  try {
    const result = await listArtworkVersions({ projectId });
    if (!result.ok || result.versions.length === 0) return null;
    const versions = result.versions.map((v) => ({
      version: v.version,
      objectName: v.objectName,
      fileName: v.fileName,
      uploadedAt: v.uploadedAt ? v.uploadedAt.slice(0, 10) : '',
      fileSize: formatArtworkBytes(v.sizeBytes),
      signedUrl: v.signedUrl,
      isImage: v.isImage,
    }));
    const current = versions[0]!;
    return {
      fileName: current.fileName,
      uploadedAt: current.uploadedAt,
      fileSize: current.fileSize,
      signedUrl: current.signedUrl,
      isImage: current.isImage,
      objectName: current.objectName,
      versions,
    };
  } catch (error) {
    console.error('[packaging] artwork listing failed:', error);
    return null;
  }
}

// ─── Server Action adapters (passed across the RSC boundary, Next16 guard) ─────
async function upsertAction(call: UpsertCall): Promise<MutationOutcome> {
  'use server';
  const result = await upsertPackagingComponent(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function uploadArtworkAction(form: FormData): Promise<MutationOutcome> {
  'use server';
  const result = await uploadArtworkVersion(form);
  return result.ok ? { ok: true } : { ok: false, error: result.code };
}

async function deleteArtworkAction(call: ArtworkDeleteCall): Promise<MutationOutcome> {
  'use server';
  const result = await deleteArtworkVersion(call);
  return result.ok ? { ok: true } : { ok: false, error: result.code };
}

async function deleteAction(call: { id: string; projectId: string }): Promise<MutationOutcome> {
  'use server';
  const result = await deletePackagingComponent(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// Org-scoped catalog search seam for the optional packaging item picker. Restricts
// callers to the 'packaging' subset (the recipe pickers pass their own non-packaging
// subsets, so nothing leaks across stages).
async function searchPackagingItemsAction(input: {
  query?: string;
  itemTypes?: Array<'rm' | 'ingredient' | 'intermediate' | 'co_product' | 'byproduct' | 'packaging'>;
  limit?: number;
}): Promise<ItemPickerOption[]> {
  'use server';
  return searchItems({ ...input, itemTypes: ['packaging'] });
}

export default async function PackagingPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PackagingPageProps;
  const { locale, projectId } = props.params
    ? await props.params
    : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? {
        state: props.state ?? (props.data ? 'ready' : 'empty'),
        data: props.data ?? null,
        canWrite: props.canWrite ?? false,
      }
    : await readPageData(projectId);

  // Real artwork from the npd-attachments bucket (never fabricated). Injected
  // test data keeps whatever artwork the test provided.
  if (!injected && loaded.state === 'ready' && loaded.data) {
    loaded.data.artwork = await readArtworkView(projectId);
  }

  return (
    <>
      {/* Nutrition is run after recipe approval (owner) — surface it on this
          post-recipe stage instead of the recipe stage. Plain anchor, no island. */}
      <nav
        aria-label="Related"
        data-testid="packaging-related-links"
        className="mb-3 flex flex-wrap items-center gap-2 text-sm"
      >
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Related</span>
        <a
          href={`/${locale}/pipeline/${projectId}/nutrition`}
          data-testid="packaging-link-nutrition"
          className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 font-medium text-[var(--muted)] hover:bg-[var(--gray-050)]"
        >
          Nutrition
        </a>
      </nav>
      <PackagingScreen
        state={loaded.state}
        data={loaded.data}
        labels={labels}
        canWrite={loaded.canWrite}
        onUpsert={upsertAction}
        onDelete={deleteAction}
        onUploadArtwork={uploadArtworkAction}
        onDeleteArtwork={deleteArtworkAction}
        searchItemsAction={searchPackagingItemsAction}
      />
    </>
  );
}
