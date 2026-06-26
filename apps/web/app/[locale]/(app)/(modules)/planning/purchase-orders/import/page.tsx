/**
 * P2-PLANNING — Bulk PO import screen (/planning/purchase-orders/import).
 *
 * Thin UI host for the shipped bulk-import server actions
 *   apps/web/lib/import/po-import-actions.ts
 *     previewBulkImportPo(formData) → { valid: PreviewRow[]; errors: ImportError[] }
 *     confirmBulkImportPo(rows)     → { created: number; errors: ImportError[] }
 * (imported, never authored — the actions OWN parsing + validation + RLS-scoped
 * lookups + PO creation). This page does no parsing of its own.
 *
 * Parity: NO prototype exists for this screen. Parity is achieved by reusing the
 * existing Purchase Orders pages' chrome — the same PageHeader + Suspense + centered
 * `max-w-6xl` main, and the PoBulkImportView reuses the PO list's
 * @monopilot/ui/Button (btn--primary / btn--secondary) + dense bordered table
 * conventions (po-list-view.tsx). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * RBAC: resolved server-side once via canImportPurchaseOrders() (the same
 * npd.planning.write gate the import actions re-check on every call) so the page
 * renders the importer or a permission-denied panel WITHOUT trusting a client flag.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no file picked / zero
 * valid rows — handled in the view), error (preview/confirm throw → alert banner;
 * per-row validation + create errors lists in the view), permission-denied (the
 * denied panel below), optimistic (busy CTAs in the view during the transitions).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { previewBulkImportPo, confirmBulkImportPo } from '../../../../../../../lib/import/po-import-actions';
import type { ImportError, PreviewRow } from '../../../../../../../lib/import/po-import-validator';
import { canImportPurchaseOrders } from '../../import/_actions/can-import-po';
import { PoBulkImportView, type PoBulkImportLabels } from '../_components/po-bulk-import-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** Client-facing seams around the shipped actions so the client island gets stable
 *  function references it can call with a FormData / the previewed rows. RBAC +
 *  validation live inside the imported actions; these adapters add nothing. */
async function previewAction(formData: FormData) {
  'use server';
  return previewBulkImportPo(formData);
}
async function confirmAction(rows: PreviewRow[]): Promise<{ created: number; errors: ImportError[] }> {
  'use server';
  return confirmBulkImportPo(rows);
}

function ImportSkeleton() {
  return (
    <div data-testid="po-bulk-import-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): PoBulkImportLabels {
  return {
    fileLabel: t('bulkImport.fileLabel'),
    fileHelp: t('bulkImport.fileHelp'),
    selectedFile: t('bulkImport.selectedFile'),
    preview: t('bulkImport.preview'),
    previewing: t('bulkImport.previewing'),
    confirm: t('bulkImport.confirm'),
    confirming: t('bulkImport.confirming'),
    reset: t('bulkImport.reset'),
    previewError: t('bulkImport.previewError'),
    confirmError: t('bulkImport.confirmError'),
    validTitle: t('bulkImport.validTitle'),
    validCount: t('bulkImport.validCount'),
    errorsTitle: t('bulkImport.errorsTitle'),
    errorsCount: t('bulkImport.errorsCount'),
    noValidRows: t('bulkImport.noValidRows'),
    noErrors: t('bulkImport.noErrors'),
    createdTitle: t('bulkImport.createdTitle'),
    createdCount: t('bulkImport.createdCount'),
    createErrorsTitle: t('bulkImport.createErrorsTitle'),
    backToList: t('bulkImport.backToList'),
    columns: {
      row: t('bulkImport.columns.row'),
      supplier: t('bulkImport.columns.supplier'),
      item: t('bulkImport.columns.item'),
      qty: t('bulkImport.columns.qty'),
      uom: t('bulkImport.columns.uom'),
      unitPrice: t('bulkImport.columns.unitPrice'),
      currency: t('bulkImport.columns.currency'),
      expected: t('bulkImport.columns.expected'),
    },
    errorColumns: {
      row: t('bulkImport.errorColumns.row'),
      column: t('bulkImport.errorColumns.column'),
      message: t('bulkImport.errorColumns.message'),
    },
  };
}

async function ImportContent({ locale }: { locale: string }) {
  const t = await getTranslations('Planning.purchaseOrders');
  const canImport = await canImportPurchaseOrders();

  if (!canImport) {
    return (
      <div
        role="note"
        data-testid="po-bulk-import-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('bulkImport.denied')}
      </div>
    );
  }

  return (
    <PoBulkImportView
      locale={locale}
      labels={buildLabels(t)}
      previewAction={previewAction}
      confirmAction={confirmAction}
    />
  );
}

export default async function PurchaseOrdersBulkImportPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning.purchaseOrders');

  return (
    <main
      data-screen="planning-po-bulk-import"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('bulkImport.title')}
        subtitle={t('bulkImport.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.purchaseOrders'), href: `/${locale}/planning/purchase-orders` },
          { label: t('bulkImport.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<ImportSkeleton />}>
        <ImportContent locale={locale} />
      </Suspense>
    </main>
  );
}
