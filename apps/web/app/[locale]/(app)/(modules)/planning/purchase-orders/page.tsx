/**
 * P2-PLANNING — Purchase Orders list + create route (/planning/purchase-orders).
 *
 * Prototype parity (1:1): prototypes/planning/po-screens.jsx:1-139 (PlanPOList) —
 *   page head + "＋ Create PO", status tabs with counts, search + supplier filter,
 *   dense table (PO / supplier / expected / lines / status), per-row View. The
 *   create-PO modal mechanics mirror prototypes/planning/modals.jsx + the WO modal
 *   (supplier select + line editor). See po-list-view.tsx / create-po-modal.tsx for
 *   the per-region anchors and the documented deviations (no KPI strip / bulk
 *   toolbar / D365-drift — no backing data in the reviewed actions).
 *
 * Data: the reviewed listPurchaseOrders / createPurchaseOrder actions (imported,
 * never authored) + the small listPoSuppliers / searchPoItems read helpers in
 * _actions/po-form-data.ts. All run inside withOrgContext (RLS-scoped). RBAC for
 * create is enforced server-side in createPurchaseOrder (npd.planning.write); this
 * page never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (read is
 * RLS-scoped so a denied user simply sees an empty org-scoped list; create surfaces
 * forbidden inline), optimistic (create pending in the modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listPurchaseOrders, createPurchaseOrder } from './_actions/actions';
import { createExportJob } from './_actions/create-export-job';
import { listPoSuppliers, listPoUnits, listPurchaseOrderLineCounts, searchPoItems } from './_actions/po-form-data';
import { buildUomDropdown, type UomDropdown } from '../_actions/uom-dropdown';
import { PoListView, type PoListLabels } from './_components/po-list-view';
import archiveTabsStaging from '../../../../../../../../_meta/i18n-staging/archive-tabs.json';

export const dynamic = 'force-dynamic';

/**
 * Archive-tab + auto-number labels are staged in _meta/i18n-staging/archive-tabs.json
 * (en/pl real, two-locale rule) until the parent merge lane folds them into the live
 * i18n bundles. Resolved defensively: prefer the live bundle (t.has) then the staging
 * value, then the EN staging value — so an un-merged bundle never throws.
 */
function archiveLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: string,
  key: 'list.tabs.archive' | 'list.archivedHint' | 'list.backToActive' | 'create.poNumberPlaceholder' | 'create.poNumberHelp',
): string {
  if (t.has(key)) return t(key);
  const path = key.split('.');
  const staging = archiveTabsStaging as unknown as Record<string, { Planning?: { purchaseOrders?: unknown } }>;
  const pick = (loc: 'en' | 'pl') => {
    let node: unknown = staging[loc]?.Planning?.purchaseOrders;
    for (const p of path) node = (node as Record<string, unknown> | undefined)?.[p];
    return typeof node === 'string' ? node : undefined;
  };
  return (locale === 'pl' ? pick('pl') : undefined) ?? pick('en') ?? key;
}

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string; archived?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="po-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

/**
 * Canonical UoM fallback labels, staged in _meta/i18n-staging/uom-sweep.json and
 * threaded here without touching the live i18n bundles. en/pl carry real values;
 * other locales mirror EN (two-locale rule). Used ONLY as the fallback when the org
 * has no readable units — the real options now come from public.unit_of_measure
 * (listPoUnits → buildUomDropdown), so admin-added units appear in the picker.
 */
function uomFallbackLabels(locale: string): {
  placeholder: string;
  options: { kg: string; g: string; l: string; ml: string; pcs: string; pack: string; box: string; pallet: string };
} {
  if (locale === 'pl') {
    return {
      placeholder: 'Jednostka',
      options: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'szt', pack: 'opak.', box: 'karton', pallet: 'paleta' },
    };
  }
  return {
    placeholder: 'Unit',
    options: { kg: 'kg', g: 'g', l: 'l', ml: 'ml', pcs: 'pcs', pack: 'pack', box: 'box', pallet: 'pallet' },
  };
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string, uom: UomDropdown): PoListLabels {
  return {
    createPo: t('actions.createPo'),
    exportLabel: t('actions.export'),
    exporting: t('actions.exporting'),
    exportError: t('actions.exportError'),
    importLabel: t('actions.import'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: t('list.rowsCount'),
    supplierFilterLabel: t('list.supplierFilterLabel'),
    allSuppliers: t('list.allSuppliers'),
    clearFilters: t('list.clearFilters'),
    tabsAll: t('list.tabs.all'),
    tabArchive: archiveLabel(t, locale, 'list.tabs.archive'),
    archivedHint: archiveLabel(t, locale, 'list.archivedHint'),
    backToActive: archiveLabel(t, locale, 'list.backToActive'),
    status: {
      draft: t('poStatus.draft'),
      sent: t('poStatus.sent'),
      confirmed: t('poStatus.confirmed'),
      partially_received: t('poStatus.partially_received'),
      received: t('poStatus.received'),
      cancelled: t('poStatus.cancelled'),
    },
    columns: {
      po: t('list.columns.po'),
      supplier: t('list.columns.supplier'),
      expected: t('list.columns.expected'),
      lines: t('list.columns.lines'),
      status: t('list.columns.status'),
      currency: t('list.columns.currency'),
      actions: t('list.columns.actions'),
    },
    view: t('list.view'),
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    create: {
      title: t('create.title'),
      poNumberLabel: t('create.poNumberLabel'),
      // Number is now OPTIONAL (createPurchaseOrder auto-generates per-org). Updated
      // placeholder + helper come from the staging bundle until the merge lane lands.
      poNumberPlaceholder: archiveLabel(t, locale, 'create.poNumberPlaceholder'),
      poNumberHelp: archiveLabel(t, locale, 'create.poNumberHelp'),
      supplierLabel: t('create.supplierLabel'),
      supplierPlaceholder: t('create.supplierPlaceholder'),
      expectedLabel: t('create.expectedLabel'),
      currencyLabel: t('create.currencyLabel'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      linesTitle: t('create.linesTitle'),
      addLine: t('create.addLine'),
      removeLine: t('create.removeLine'),
      lineItem: t('create.lineItem'),
      lineQty: t('create.lineQty'),
      lineUom: t('create.lineUom'),
      lineUnitPrice: t('create.lineUnitPrice'),
      // UoM dropdown now reads from the REAL org units (public.unit_of_measure via
      // listPoUnits → buildUomDropdown), so admin-added units appear. `uom.units`
      // is the ordered code list; `uom.options` the code→"code — name" labels. When
      // the org has no readable units, buildUomDropdown returns the canonical
      // per-locale fallback labels and an empty `units` (dropdown keeps its default).
      uomPlaceholder: uom.placeholder,
      uomOptions: uom.options,
      uomUnits: uom.units,
      qtyPlaceholder: t('create.qtyPlaceholder'),
      unitPricePlaceholder: t('create.unitPricePlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        poNumberRequired: t('create.errors.poNumberRequired'),
        supplierRequired: t('create.errors.supplierRequired'),
        linesRequired: t('create.errors.linesRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        already_exists: t('errors.already_exists'),
        invalid_state: t('errors.invalid_state'),
        persistence_failed: t('errors.persistence_failed'),
      },
      picker: {
        trigger: t('create.picker.trigger'),
        searchLabel: t('create.picker.searchLabel'),
        searchPlaceholder: t('create.picker.searchPlaceholder'),
        loading: t('create.picker.loading'),
        empty: t('create.picker.empty'),
        cancel: t('create.picker.cancel'),
        error: t('create.picker.error'),
      },
    },
  };
}

async function ListContent({
  locale,
  autoOpenCreate,
  archived,
}: {
  locale: string;
  autoOpenCreate: boolean;
  archived: boolean;
}) {
  const t = await getTranslations('Planning.purchaseOrders');
  const [listResult, suppliers, lineCounts, orgUnits] = await Promise.all([
    listPurchaseOrders({ limit: 200, archived }),
    listPoSuppliers(),
    listPurchaseOrderLineCounts(),
    listPoUnits(),
  ]);
  const uom = buildUomDropdown(orgUnits, uomFallbackLabels(locale));

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="po-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <PoListView
      locale={locale}
      purchaseOrders={listResult.data.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierCode: po.supplierCode,
        supplierName: po.supplierName,
        status: po.status,
        expectedDelivery: po.expectedDelivery,
        currency: po.currency,
        notes: po.notes,
        lineCount: lineCounts[po.id] ?? 0,
      }))}
      suppliers={suppliers}
      archived={archived}
      archivedCount={listResult.archivedCount}
      autoOpenCreate={autoOpenCreate}
      labels={buildLabels(t, locale, uom)}
      searchPoItemsAction={searchPoItems}
      createPurchaseOrderAction={createPurchaseOrder}
      createExportJobAction={createExportJob}
    />
  );
}

export default async function PurchaseOrdersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const archived = sp.archived === '1';
  const t = await getTranslations('Planning.purchaseOrders');

  return (
    <main
      data-screen="planning-po-list"
      data-prototype-label="plan_po_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.purchaseOrders') }]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} archived={archived} />
      </Suspense>
    </main>
  );
}
