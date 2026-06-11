/**
 * CL2 slice 2 — SCREEN /planning/reorder-thresholds (mig 178 reorder_thresholds,
 * T-045 Material Demand config).
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning/ and planning-ext/ contain no reorder-threshold screen (verified by
 * the same sweep as /planning/mrp: zero matches). Presentation follows the
 * locked MON-design-system conventions reused from sibling planning screens
 * (PageHeader + card/table/badge/empty-state + @monopilot/ui Modal forms).
 *
 * Real data only: list/upsert/delete go through the org-scoped Server Actions
 * over public.reorder_thresholds; the item picker searches public.items; the
 * supplier select loads public.suppliers (lead times mig 261). RBAC enforced
 * server-side (read scheduler.run.read, write npd.planning.write).
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  deleteReorderThreshold,
  listReorderThresholds,
  listThresholdSuppliers,
  searchThresholdItems,
  upsertReorderThreshold,
} from '../_actions/reorder-thresholds';
import { ThresholdsView, type ThresholdsLabels } from './_components/thresholds-view';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type ThresholdsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ReorderThresholdsPage({ params }: ThresholdsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning');

  const labels: ThresholdsLabels = {
    add: t('reorderThresholds.add'),
    empty: t('reorderThresholds.empty'),
    emptyHint: t('reorderThresholds.emptyHint'),
    loading: t('reorderThresholds.loading'),
    denied: t('reorderThresholds.denied'),
    error: t('reorderThresholds.error'),
    edit: t('reorderThresholds.edit'),
    remove: t('reorderThresholds.remove'),
    removing: t('reorderThresholds.removing'),
    days: t('reorderThresholds.days'),
    noSupplier: t('reorderThresholds.noSupplier'),
    columns: {
      item: t('reorderThresholds.columns.item'),
      minQty: t('reorderThresholds.columns.minQty'),
      reorderQty: t('reorderThresholds.columns.reorderQty'),
      supplier: t('reorderThresholds.columns.supplier'),
      leadTime: t('reorderThresholds.columns.leadTime'),
      updated: t('reorderThresholds.columns.updated'),
    },
    modal: {
      titleAdd: t('reorderThresholds.modal.titleAdd'),
      titleEdit: t('reorderThresholds.modal.titleEdit'),
      itemLabel: t('reorderThresholds.modal.itemLabel'),
      minQtyLabel: t('reorderThresholds.modal.minQtyLabel'),
      reorderQtyLabel: t('reorderThresholds.modal.reorderQtyLabel'),
      reorderQtyHint: t('reorderThresholds.modal.reorderQtyHint'),
      supplierLabel: t('reorderThresholds.modal.supplierLabel'),
      supplierNone: t('reorderThresholds.modal.supplierNone'),
      submit: t('reorderThresholds.modal.submit'),
      submitting: t('reorderThresholds.modal.submitting'),
      cancel: t('reorderThresholds.modal.cancel'),
      clearItem: t('reorderThresholds.modal.clearItem'),
      errors: {
        itemRequired: t('reorderThresholds.modal.errors.itemRequired'),
        qtyInvalid: t('reorderThresholds.modal.errors.qtyInvalid'),
        invalid_input: t('reorderThresholds.modal.errors.invalid_input'),
        forbidden: t('reorderThresholds.modal.errors.forbidden'),
        not_found: t('reorderThresholds.modal.errors.not_found'),
        persistence_failed: t('reorderThresholds.modal.errors.persistence_failed'),
      },
      picker: {
        trigger: t('reorderThresholds.modal.picker.trigger'),
        searchLabel: t('reorderThresholds.modal.picker.searchLabel'),
        searchPlaceholder: t('reorderThresholds.modal.picker.searchPlaceholder'),
        loading: t('reorderThresholds.modal.picker.loading'),
        empty: t('reorderThresholds.modal.picker.empty'),
        cancel: t('reorderThresholds.modal.picker.cancel'),
        error: t('reorderThresholds.modal.picker.error'),
      },
    },
  };

  // Supplier select options resolved server-side (real suppliers master).
  const suppliers = await listThresholdSuppliers();

  return (
    <main
      data-screen="planning-reorder-thresholds"
      data-testid="planning-reorder-thresholds-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('reorderThresholds.title')}
        subtitle={t('reorderThresholds.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('reorderThresholds.breadcrumb') },
        ]}
      />
      <ThresholdsView
        labels={labels}
        suppliers={suppliers}
        listAction={listReorderThresholds}
        upsertAction={upsertReorderThreshold}
        deleteAction={deleteReorderThreshold}
        searchItemsAction={searchThresholdItems}
      />
    </main>
  );
}
