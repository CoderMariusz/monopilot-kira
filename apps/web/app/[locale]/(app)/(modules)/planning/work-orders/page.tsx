/**
 * P2-PLANNING — Work Orders list + create route (/planning/work-orders).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   wo-list.jsx:4-279 (plan_wo_list) — status tabs, search, dense table, per-row
 *   Release action, "＋ Create WO" modal. See wo-list-view.tsx for the per-region
 *   anchors and the documented deviations (no-source columns dropped).
 *
 * Data: the reviewed listPlanningWorkOrders / createWorkOrder / releaseWorkOrder
 * actions (imported, never authored) + the small searchFgProducts /
 * listProductionResources read helpers in _actions/wo-form-data.ts. All run inside
 * withOrgContext (RLS-scoped). RBAC for create/release is enforced server-side in
 * those actions; this page never trusts a client flag.
 *
 * Deep-link: ?new=1 auto-opens the create modal (the planning dashboard's
 * "Create WO" button + /planning/work-orders/new redirect both target it).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (read is
 * RLS-scoped so a denied user simply sees an empty org-scoped list; create/release
 * surface forbidden inline), optimistic (release/create pending in the view/modal).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listPlanningWorkOrders } from './_actions/listPlanningWorkOrders';
import { createWorkOrderFromPlanning } from './_actions/createWorkOrder';
import { deleteDraftWorkOrder, releaseWorkOrder } from './_actions/releaseWorkOrder';
import { searchFgProducts, listProductionResources } from './_actions/wo-form-data';
import { previewWorkOrderChain } from './_actions/chain-preview';
import { WoListView, type WoListFilters, type WoListLabels } from './_components/wo-list-view';
import { makeImportLabel } from '../../../../../../lib/import/import-i18n-staging';
import archiveTabsStaging from '../../../../../../../../_meta/i18n-staging/archive-tabs.json';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string; archived?: string; page?: string; status?: string; q?: string }>;
};

function parseWoFilters(sp: { status?: string; q?: string }): WoListFilters {
  return {
    status: sp.status?.trim() ?? '',
    search: sp.q?.trim() ?? '',
  };
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/**
 * Archive-tab labels staged in _meta/i18n-staging/archive-tabs.json (en/pl real)
 * until the merge lane lands. Prefer the live bundle (t.has) then staging.
 */
function archiveLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: string,
  key: 'list.tabs.archive' | 'list.archivedHint' | 'list.backToActive',
): string {
  if (t.has(key)) return t(key);
  const path = key.split('.');
  const staging = archiveTabsStaging as unknown as Record<string, { Planning?: { workOrders?: unknown } }>;
  const pick = (loc: 'en' | 'pl') => {
    let node: unknown = staging[loc]?.Planning?.workOrders;
    for (const p of path) node = (node as Record<string, unknown> | undefined)?.[p];
    return typeof node === 'string' ? node : undefined;
  };
  return (locale === 'pl' ? pick('pl') : undefined) ?? pick('en') ?? key;
}

function ListSkeleton() {
  return (
    <div data-testid="wo-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>, locale: string): WoListLabels {
  // P0-UOM — the UoM keys live in the REAL bundles (apps/web/i18n/{en,pl,ro,uk}
  // .json under Planning.workOrders.create.*; F-D08a). `t.has` + inline EN
  // fallback is kept as a defensive seam so a key regression degrades to EN
  // copy instead of throwing at runtime.
  const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  // F-D08a — messages that are CLIENT-side `.replace()` templates ("{qty} {unit}
  // = {kg} {base}") must be read with `t.raw`: next-intl's development build
  // treats `{…}` as ICU arguments and a bare `t(key)` (no values) raises
  // FORMATTING_ERROR, returning the key path instead of the template (the
  // production build only passes the template through by accident). `t.raw`
  // returns the literal string in both builds.
  const tpl = (key: string): string => String(t.raw(key));
  const optTpl = (key: string, fallback: string): string => (t.has(key) ? tpl(key) : fallback);
  return {
    createWo: t('actions.createWo'),
    bulkImportLabel: makeImportLabel(t, 'wo', locale)('actions.bulkImport'),
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsCount: tpl('list.rowsCount'),
    tabs: {
      all: t('list.tabs.all'),
      DRAFT: t('woStatus.draft'),
      RELEASED: t('woStatus.released'),
      IN_PROGRESS: t('woStatus.in_progress'),
      ON_HOLD: t('woStatus.on_hold'),
      COMPLETED: t('woStatus.completed'),
    },
    status: {
      draft: t('woStatus.draft'),
      released: t('woStatus.released'),
      in_progress: t('woStatus.in_progress'),
      on_hold: t('woStatus.on_hold'),
      completed: t('woStatus.completed'),
      closed: t('woStatus.closed'),
      cancelled: t('woStatus.cancelled'),
    },
    columns: {
      wo: t('list.columns.wo'),
      product: t('list.columns.product'),
      status: t('list.columns.status'),
      qty: t('list.columns.qty'),
      scheduled: t('list.columns.scheduled'),
      line: t('list.columns.line'),
      bom: t('list.columns.bom'),
      actions: t('list.columns.actions'),
    },
    bomBadge: t('list.bomBadge'),
    noBomBadge: t('list.noBomBadge'),
    notAssigned: t('list.notAssigned'),
    release: t('list.release'),
    releasing: t('list.releasing'),
    confirmRelease: tpl('list.confirmRelease'),
    deleteDraft: opt('list.deleteDraft', 'Delete draft'),
    deletingDraft: opt('list.deletingDraft', 'Deleting...'),
    confirmDeleteDraft: optTpl('list.confirmDeleteDraft', 'Delete draft work order {wo}? This cannot be undone.'),
    tabArchive: archiveLabel(t, locale, 'list.tabs.archive'),
    archivedHint: archiveLabel(t, locale, 'list.archivedHint'),
    backToActive: archiveLabel(t, locale, 'list.backToActive'),
    pagination: {
      showing: t('list.pagination.showing'),
      previous: t('list.pagination.previous'),
      next: t('list.pagination.next'),
    },
    empty: {
      title: t('list.empty.title'),
      body: t('list.empty.body'),
      clear: t('list.empty.clear'),
    },
    releaseError: {
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      invalid_state: t('errors.invalid_state'),
      invalid_input: t('errors.invalid_input'),
      persistence_failed: t('errors.persistence_failed'),
      pack_hierarchy_incomplete: opt(
        'errors.pack_hierarchy_incomplete',
        'This product is packed in boxes/eaches but the pack factors (net weight per each, eaches per box) are not set — fix the item master in Technical before releasing.',
      ),
      chain_delete_blocked: opt(
        'errors.chain_delete_blocked',
        'This draft work order is part of an active production chain and cannot be deleted. Cancel it instead.',
      ),
    },
    factoryReleaseIncomplete: {
      title: optTpl(
        'create.factoryReleaseIncomplete.title',
        'This work order can’t be released — missing {missing}.',
      ),
      activeBom: opt('create.factoryReleaseIncomplete.activeBom', 'an active BOM'),
      factorySpec: opt('create.factoryReleaseIncomplete.factorySpec', 'an approved factory spec'),
      technicalHint: opt(
        'create.factoryReleaseIncomplete.technicalHint',
        'These are created in Technical.',
      ),
    },
    create: {
      title: t('create.title'),
      productLabel: t('create.productLabel'),
      productPlaceholder: t('create.productPlaceholder'),
      picker: {
        trigger: t('create.picker.trigger'),
        searchLabel: t('create.picker.searchLabel'),
        searchPlaceholder: t('create.picker.searchPlaceholder'),
        loading: t('create.picker.loading'),
        empty: t('create.picker.empty'),
        cancel: t('create.picker.cancel'),
        error: t('create.picker.error'),
      },
      quantityLabel: t('create.quantityLabel'),
      quantityPlaceholder: t('create.quantityPlaceholder'),
      quantityUom: {
        base: opt('create.quantityUom.base', 'kg'),
        each: opt('create.quantityUom.each', 'each'),
        box: opt('create.quantityUom.box', 'box'),
      },
      conversionPreview: optTpl('create.conversionPreview', '{qty} {unit} = {kg} {base}'),
      scheduledStartLabel: t('create.scheduledStartLabel'),
      lineLabel: t('create.lineLabel'),
      machineLabel: t('create.machineLabel'),
      noneOption: t('create.noneOption'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      selectedProduct: t('create.selectedProduct'),
      errors: {
        productRequired: t('create.errors.productRequired'),
        quantityRequired: t('create.errors.quantityRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        invalid_state: t('errors.invalid_state'),
        persistence_failed: t('errors.persistence_failed'),
        uom_conversion_unavailable: opt(
          'errors.uom_conversion_unavailable',
          'This product is missing the pack data needed to convert units — set it in Technical.',
        ),
        // F10 — a WO write with no resolvable site fails closed instead of
        // persisting site_id=NULL; surface the actionable reason.
        no_active_site: opt(
          'create.errors.no_active_site',
          'Select a site before creating a work order. This organisation has no active site yet — add one in Settings → Sites.',
        ),
        ambiguous_site: opt(
          'create.errors.ambiguous_site',
          'Select a site in the top bar before creating a work order.',
        ),
        not_released_to_factory: opt(
          'create.errors.not_released_to_factory',
          'This product has not been released to factory yet. Complete NPD Handoff → Release to factory before creating a planning work order.',
        ),
      },
      noBomWarning: t('create.noBomWarning'),
      chainCreatedWarning: opt('create.chainCreatedWarning', '{count} work orders created — root {root}.'),
      noFactorySpecWarning: opt(
        'create.noFactorySpecWarning',
        'Created — but this product has no approved factory spec yet. Create it in Technical before release-to-start.',
      ),
    },
  };
}

async function ListContent({
  locale,
  autoOpenCreate,
  archived,
  page,
  filters,
}: {
  locale: string;
  autoOpenCreate: boolean;
  archived: boolean;
  page: number;
  filters: WoListFilters;
}) {
  const t = await getTranslations('Planning.workOrders');
  const [listResult, resources] = await Promise.all([
    listPlanningWorkOrders({
      page,
      archived,
      status: filters.status || undefined,
      q: filters.search || undefined,
    }),
    listProductionResources(),
  ]);

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="wo-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  return (
    <WoListView
      locale={locale}
      workOrders={listResult.workOrders}
      pagination={listResult.pagination}
      filters={filters}
      statusCounts={listResult.statusCounts}
      resources={resources}
      archived={archived}
      archivedCount={listResult.archivedCount}
      autoOpenCreate={autoOpenCreate}
      labels={buildLabels(t, locale)}
      searchFgProductsAction={searchFgProducts}
      createWorkOrderAction={createWorkOrderFromPlanning}
      releaseWorkOrderAction={releaseWorkOrder}
      deleteDraftWorkOrderAction={deleteDraftWorkOrder}
      previewChainAction={previewWorkOrderChain}
    />
  );
}

export default async function WorkOrdersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';
  const archived = sp.archived === '1';
  const page = parsePage(sp.page);
  const filters = parseWoFilters(sp);
  const suspenseKey = `${archived}-${page}-${filters.status}-${filters.search}`;
  const t = await getTranslations('Planning.workOrders');

  return (
    <main
      data-screen="planning-wo-list"
      data-prototype-label="plan_wo_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.planning') }, { label: t('breadcrumb.workOrders') }]}
      />
      <Suspense key={suspenseKey} fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} archived={archived} page={page} filters={filters} />
      </Suspense>
    </main>
  );
}
