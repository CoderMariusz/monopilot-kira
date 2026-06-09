/**
 * T-038 — BOM Detail page with 7 tabs (TEC-021), Server Component.
 *
 * Route: /[locale]/(app)/technical/bom/[itemCode]
 *   `[itemCode]` resolves to `bom_headers.product_id` (the FG product_code).
 *   `?v=<n>` optionally selects a specific version (default: latest).
 *
 * Reads REAL, org-scoped data via the existing BOM read primitives
 * (`getBomDetailPage` → withOrgContext + RLS as app_user with
 * app.current_org_id()). No mocks. A cross-org / unknown FG → `notFound()` (404).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/technical/bom-detail.jsx:3-65 (7-tab shell)
 *
 * Red-lines: FG canonical; read-only (approved/released rows never mutated); the
 * shared BOM SSOT tables are the single source of truth.
 */

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getBomDetailPage, getBomFgSummary } from '../_actions/detail-page';
import {
  BomDetailScreen,
  type BomDetailData,
  type BomDetailLabels,
  type PageState,
} from '../_components/bom-detail-screen';
import { BomDetailActions } from '../_components/bom-detail-actions';
import {
  BomFirstAuthoring,
  type BomFirstAuthoringLabels,
} from '../_components/bom-first-authoring';

export const dynamic = 'force-dynamic';

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: {
    query<T = Record<string, unknown>>(
      sql: string,
      params?: readonly unknown[],
    ): Promise<{ rows: T[]; rowCount?: number | null }>;
  };
};

/** Server-resolved BOM-detail RBAC (never client-trusted). */
async function resolveDetailPermissions(): Promise<{ canCreate: boolean; canApprove: boolean }> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ permission: string }>(
        `select rp.permission
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id
          where ur.user_id = $1::uuid and ur.org_id = $2::uuid
            and rp.permission in ('technical.bom.create', 'technical.bom.approve')`,
        [ctx.userId, ctx.orgId],
      );
      const set = new Set(rows.map((r) => r.permission));
      return { canCreate: set.has('technical.bom.create'), canApprove: set.has('technical.bom.approve') };
    });
  } catch {
    return { canCreate: false, canApprove: false };
  }
}

const DETAIL_HREF_BASE = '/technical/bom';

const DEFAULT_LABELS: BomDetailLabels = {
  breadcrumbRoot: 'BOMs & recipes',
  versionBadge: 'v{n}',
  yieldLabel: 'Yield',
  tabComponents: 'Components',
  tabCoProducts: 'Co-products',
  tabSnapshots: 'Snapshots',
  tabVersions: 'Versions',
  tabApproval: 'Approval',
  tabWhereUsed: 'Where-used',
  tabRecipeSheet: 'Recipe sheet',
  colLine: '#',
  colComponent: 'Component',
  colType: 'Type',
  colQty: 'Qty',
  colUom: 'UoM',
  colScrap: 'Scrap',
  colOperation: 'Operation',
  phantomBadge: 'phantom',
  colCoProduct: 'Co-product item',
  colAllocation: 'Allocation',
  byproductBadge: 'By-product',
  coProductBadge: 'Co-product',
  colSnapshot: 'Snapshot',
  colWorkOrder: 'Work order',
  colSnapshotAt: 'Taken at',
  noWorkOrder: '—',
  colVersion: 'Version',
  colStatus: 'Status',
  colEffective: 'Effective from',
  colApprovedBy: 'Approved by',
  current: 'Current',
  approvalTitle: 'Approval',
  approvalStatus: 'Status',
  approvalApprovedBy: 'Approved by',
  approvalApprovedAt: 'Approved at',
  approvalPending: 'Pending approval',
  approvalChainTitle: 'Approval chain',
  approvalChain: 'NPD → Technologist → QA → Production lead',
  colParent: 'Used in (FG)',
  colParentVersion: 'Version',
  colUsageQty: 'Qty per parent',
  recipeTitle: 'Recipe sheet',
  recipeBatch: 'BOM {code} · v{version} · Yield {yield}%',
  recipeComponents: 'Components',
  recipeNotes: 'Notes',
  statusDraft: 'Draft',
  statusInReview: 'In review',
  statusApproved: 'Approved',
  statusActive: 'Active',
  statusSuperseded: 'Superseded',
  statusArchived: 'Archived',
  emptyComponents: 'This BOM version has no component lines.',
  emptyCoProducts: 'No co-products or by-products on this BOM version.',
  emptySnapshots: 'No work-order snapshots have been taken for this version yet.',
  emptyWhereUsed: 'This FG is not used as a component in any other BOM.',
  loading: 'Loading BOM…',
  error: 'Unable to load this BOM. Please try again.',
  notFound: 'BOM not found.',
  forbidden: 'You do not have permission to view this BOM.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof BomDetailLabels>;

function translateLabel(t: (key: string) => string, key: keyof BomDetailLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<BomDetailLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bomDetail' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as BomDetailLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

const DEFAULT_FIRST_AUTHORING_LABELS: BomFirstAuthoringLabels = {
  breadcrumbRoot: 'BOMs & recipes',
  emptyTitle: 'No BOM yet',
  emptyBody: 'No BOM yet for {code} — add the first component to create the v1 draft.',
  addFirstComponent: '+ Add first component',
  draftBadge: 'Not started',
};

const FIRST_AUTHORING_KEYS = Object.keys(
  DEFAULT_FIRST_AUTHORING_LABELS,
) as Array<keyof BomFirstAuthoringLabels>;

async function buildFirstAuthoringLabels(locale: string): Promise<BomFirstAuthoringLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'technical.bom.firstAuthoring' });
    return FIRST_AUTHORING_KEYS.reduce((labels, key) => {
      try {
        const value = t(key);
        labels[key] = value === key ? DEFAULT_FIRST_AUTHORING_LABELS[key] : value;
      } catch {
        labels[key] = DEFAULT_FIRST_AUTHORING_LABELS[key];
      }
      return labels;
    }, {} as BomFirstAuthoringLabels);
  } catch {
    return { ...DEFAULT_FIRST_AUTHORING_LABELS };
  }
}

type BomDetailPageProps = {
  params?: Promise<{ locale: string; itemCode: string }>;
  searchParams?: Promise<{ v?: string }>;
  // Test-only injection seam.
  data?: BomDetailData | null;
  state?: PageState;
  // Test-only injection seam for the FIRST-AUTHORING state (FG exists, no BOM yet).
  firstAuthoring?: {
    productId: string;
    productName: string | null;
    canCreate: boolean;
  } | null;
};

export default async function BomDetailPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as BomDetailPageProps;
  const { locale, itemCode } = props.params
    ? await props.params
    : { locale: 'en', itemCode: '' };
  const sp = props.searchParams ? await props.searchParams : {};

  const labels = await buildLabels(locale);

  // Test-only injection seam for the first-authoring shell.
  if (props.firstAuthoring !== undefined && props.firstAuthoring !== null) {
    const firstAuthoringLabels = await buildFirstAuthoringLabels(locale);
    return (
      <BomFirstAuthoring
        productId={props.firstAuthoring.productId}
        productName={props.firstAuthoring.productName}
        detailHrefBase={DETAIL_HREF_BASE}
        canCreate={props.firstAuthoring.canCreate}
        labels={firstAuthoringLabels}
      />
    );
  }

  const injected = props.data !== undefined || props.state !== undefined;
  if (injected) {
    return (
      <BomDetailScreen
        state={props.state ?? (props.data ? 'ready' : 'not_found')}
        data={props.data ?? null}
        labels={labels}
      />
    );
  }

  const productId = decodeURIComponent(itemCode);
  const versionParam = sp.v ? Number(sp.v) : undefined;
  const version = versionParam && Number.isFinite(versionParam) ? versionParam : undefined;

  const [result, perms] = await Promise.all([
    getBomDetailPage(productId, version),
    resolveDetailPermissions(),
  ]);

  if (!result.ok) {
    if (result.error === 'not_found') {
      // The FG has no bom_headers row yet — distinguish a real FG awaiting its
      // FIRST BOM (→ authoring shell) from a truly unknown item code (→ 404).
      const fg = await getBomFgSummary(productId);
      if (fg.ok) {
        const firstAuthoringLabels = await buildFirstAuthoringLabels(locale);
        return (
          <BomFirstAuthoring
            productId={fg.data.productId}
            productName={fg.data.productName}
            detailHrefBase={DETAIL_HREF_BASE}
            canCreate={perms.canCreate}
            labels={firstAuthoringLabels}
          />
        );
      }
      if (fg.error === 'load_failed') {
        return <BomDetailScreen state="error" data={null} labels={labels} />;
      }
      notFound();
    }
    return <BomDetailScreen state="error" data={null} labels={labels} />;
  }

  const d = result.data;
  const data: BomDetailData = {
    productId: d.productId,
    productName: d.productName,
    category: d.category,
    selectedVersion: d.selectedVersion,
    status: d.header.status,
    yieldPct: d.header.yieldPct,
    effectiveFrom: d.header.effectiveFrom,
    notes: d.header.notes,
    lines: d.lines.map((l) => ({
      id: l.id,
      lineNo: l.lineNo,
      componentCode: l.componentCode,
      componentType: l.componentType,
      quantity: l.quantity,
      uom: l.uom,
      scrapPct: l.scrapPct,
      manufacturingOperationName: l.manufacturingOperationName,
      isPhantom: l.isPhantom,
    })),
    coProducts: d.coProducts.map((cp) => ({
      id: cp.id,
      coProductItemId: cp.coProductItemId,
      quantity: cp.quantity,
      uom: cp.uom,
      allocationPct: cp.allocationPct,
      isByproduct: cp.isByproduct,
    })),
    versions: d.versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      effectiveFrom: v.effectiveFrom,
      effectiveTo: v.effectiveTo,
      approvedByName: v.approvedByName,
      approvedAt: v.approvedAt,
      notes: v.notes,
      isSelected: v.isSelected,
    })),
    snapshots: d.snapshots.map((s) => ({
      id: s.id,
      workOrderId: s.workOrderId,
      snapshotAt: s.snapshotAt,
    })),
    whereUsed: d.whereUsed.map((w) => ({
      parentProductId: w.parentProductId,
      parentProductName: w.parentProductName,
      parentVersion: w.parentVersion,
      parentStatus: w.parentStatus,
      quantity: w.quantity,
      uom: w.uom,
    })),
    detailHrefBase: DETAIL_HREF_BASE,
  };

  return (
    <BomDetailScreen
      state="ready"
      data={data}
      labels={labels}
      actions={
        <BomDetailActions
          productId={d.productId}
          productName={d.productName}
          currentVersion={d.selectedVersion}
          status={d.header.status}
          snapshotCount={d.snapshots.length}
          lines={d.lines.map((l) => ({
            itemId: l.itemId ?? undefined,
            componentCode: l.componentCode,
            quantity: Number(l.quantity),
            uom: l.uom,
            scrapPct: Number(l.scrapPct),
            manufacturingOperationName: l.manufacturingOperationName ?? undefined,
          }))}
          canCreate={perms.canCreate}
          canApprove={perms.canApprove}
        />
      }
    />
  );
}
