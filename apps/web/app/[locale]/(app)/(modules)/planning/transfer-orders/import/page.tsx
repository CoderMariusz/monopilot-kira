/**
 * P2-PLANNING — Bulk Transfer-Order import screen (/planning/transfer-orders/import).
 *
 * Thin UI host for the shipped bulk-import server actions
 *   apps/web/lib/import/to-import-validator.ts → previewToImport(formData)
 *   apps/web/lib/import/to-import-actions.ts    → confirmToImport(rows)
 * (imported, never authored — the actions OWN parsing + validation + RLS-scoped
 * lookups + TO creation). This page does no parsing of its own.
 *
 * Parity: NO prototype exists for this screen. It mirrors the shipped PO import
 * screen 1:1 (purchase-orders/import/page.tsx + po-bulk-import-view.tsx) — same
 * PageHeader + Suspense + centered `max-w-6xl` main, same preview→confirm flow,
 * and the shared BulkImportView reuses the planning lists' @monopilot/ui/Button
 * (btn--primary / btn--secondary) + dense bordered table conventions
 * (to-list-view.tsx). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * RBAC: resolved server-side once via canImportPurchaseOrders() — the SAME
 * npd.planning.write gate (hasPlanningWritePermission) the TO create + import
 * actions re-check on every call — so the page renders the importer or a
 * permission-denied panel WITHOUT trusting a client flag.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no file picked / zero
 * valid rows — handled in the view), error (preview/confirm throw → alert banner;
 * per-row validation + create errors lists in the view), permission-denied (the
 * denied panel below), optimistic (busy CTAs in the view during the transitions).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { previewToImport, type PreviewToRow } from '../../../../../../../lib/import/to-import-validator';
import { confirmToImport } from '../../../../../../../lib/import/to-import-actions';
import type { ImportError } from '../../../../../../../lib/import/po-import-validator';
import { makeImportLabel } from '../../../../../../../lib/import/import-i18n-staging';
import { canImportPurchaseOrders } from '../../import/_actions/can-import-po';
import { ToBulkImportView } from './_components/to-bulk-import-view';
import type { ToBulkImportLabels } from './_components/to-bulk-import-columns';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/** Client-facing seams around the shipped actions so the client island gets stable
 *  function references. RBAC + validation live inside the imported actions. */
async function previewAction(formData: FormData) {
  'use server';
  return previewToImport(formData);
}
async function confirmAction(rows: PreviewToRow[]): Promise<{ created: number; errors: ImportError[] }> {
  'use server';
  return confirmToImport(rows);
}

function ImportSkeleton() {
  return (
    <div data-testid="to-bulk-import-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(tx: (key: string) => string): ToBulkImportLabels {
  return {
    fileLabel: tx('bulkImport.fileLabel'),
    fileHelp: tx('bulkImport.fileHelp'),
    selectedFile: tx('bulkImport.selectedFile'),
    preview: tx('bulkImport.preview'),
    previewing: tx('bulkImport.previewing'),
    confirm: tx('bulkImport.confirm'),
    confirming: tx('bulkImport.confirming'),
    reset: tx('bulkImport.reset'),
    previewError: tx('bulkImport.previewError'),
    confirmError: tx('bulkImport.confirmError'),
    validTitle: tx('bulkImport.validTitle'),
    validCount: tx('bulkImport.validCount'),
    errorsTitle: tx('bulkImport.errorsTitle'),
    errorsCount: tx('bulkImport.errorsCount'),
    noValidRows: tx('bulkImport.noValidRows'),
    noErrors: tx('bulkImport.noErrors'),
    createdTitle: tx('bulkImport.createdTitle'),
    createdCount: tx('bulkImport.createdCount'),
    createErrorsTitle: tx('bulkImport.createErrorsTitle'),
    backToList: tx('bulkImport.backToList'),
    columns: {
      row: tx('bulkImport.columns.row'),
      toNumber: tx('bulkImport.columns.toNumber'),
      fromSite: tx('bulkImport.columns.fromSite'),
      toSite: tx('bulkImport.columns.toSite'),
      item: tx('bulkImport.columns.item'),
      qty: tx('bulkImport.columns.qty'),
      uom: tx('bulkImport.columns.uom'),
      scheduled: tx('bulkImport.columns.scheduled'),
    },
    errorColumns: {
      row: tx('bulkImport.errorColumns.row'),
      column: tx('bulkImport.errorColumns.column'),
      message: tx('bulkImport.errorColumns.message'),
    },
  };
}

async function ImportContent({ locale }: { locale: string }) {
  const t = await getTranslations('Planning.transferOrders');
  const tx = makeImportLabel(t, 'to', locale);
  const canImport = await canImportPurchaseOrders();

  if (!canImport) {
    return (
      <div
        role="note"
        data-testid="to-bulk-import-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {tx('bulkImport.denied')}
      </div>
    );
  }

  return (
    <ToBulkImportView
      backHref={`/${locale}/planning/transfer-orders`}
      labels={buildLabels(tx)}
      previewAction={previewAction}
      confirmAction={confirmAction}
    />
  );
}

export default async function TransferOrdersBulkImportPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning.transferOrders');
  const tx = makeImportLabel(t, 'to', locale);

  return (
    <main
      data-screen="planning-to-bulk-import"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={tx('bulkImport.title')}
        subtitle={tx('bulkImport.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('breadcrumb.transferOrders'), href: `/${locale}/planning/transfer-orders` },
          { label: tx('bulkImport.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<ImportSkeleton />}>
        <ImportContent locale={locale} />
      </Suspense>
    </main>
  );
}
