/**
 * WH-010 — GRN detail route (/warehouse/grns/[grnId]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   grn-screens.jsx:96-171 (WhGRNDetail) — header facts strip, notes card,
 *   receipt-lines table with the created LP number as a link. Per-region anchors
 *   + deviations live in [grnId]/_components/grn-detail.client.tsx.
 *
 * Data: the reviewed getGrnDetail action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). RBAC enforced server-side; a `forbidden` result
 * renders the permission-denied panel, `not_found` renders the not-found panel.
 *
 * UI states: loading (Suspense skeleton), empty (no lines → in client island),
 * error (failed read → banner), permission-denied (forbidden → panel),
 * not-found (not_found → panel). Optimistic: N/A on a read detail.
 */
import { Suspense } from 'react';
import Link from 'next/link';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getGrnDetail } from '../../_actions/grn-actions';
import { releaseLpQa } from '../../_actions/lp-qa-actions';
import { getWhcTranslator } from '../../wh-c-labels';
import { GrnDetailClient, type GrnDetailLabels } from './_components/grn-detail.client';
import { cancelGrnLineAction } from './receipt-corrections-adapter';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; grnId: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/grn-screens.jsx:96-171';

function buildLabels(t: ReturnType<typeof getWhcTranslator>): GrnDetailLabels {
  return {
    notesLabel: t('grnDetail.notesLabel'),
    itemsTitle: t('grnDetail.itemsTitle'),
    emptyItems: t('grnDetail.emptyItems'),
    facts: {
      source: t('grnDetail.facts.source'),
      supplier: t('grnDetail.facts.supplier'),
      receiptDate: t('grnDetail.facts.receiptDate'),
      warehouse: t('grnDetail.facts.warehouse'),
      status: t('grnDetail.facts.status'),
      none: t('grnDetail.facts.none'),
    },
    status: {
      draft: t('grnList.status.draft'),
      completed: t('grnList.status.completed'),
      cancelled: t('grnList.status.cancelled'),
      in_progress: t('grnList.status.in_progress'),
    },
    col: {
      line: t('grnDetail.columns.line'),
      item: t('grnDetail.columns.item'),
      ordered: t('grnDetail.columns.ordered'),
      received: t('grnDetail.columns.received'),
      batch: t('grnDetail.columns.batch'),
      supplierBatch: t('grnDetail.columns.supplierBatch'),
      expiry: t('grnDetail.columns.expiry'),
      location: t('grnDetail.columns.location'),
      qa: t('grnDetail.columns.qa'),
      lp: t('grnDetail.columns.lp'),
      action: t('grnDetail.columns.action'),
    },
    qaRelease: {
      action: t('grnDetail.qaRelease.action'),
      released: t('grnDetail.qaRelease.released'),
      rejected: t('grnDetail.qaRelease.rejected'),
      note: t('grnDetail.qaRelease.note'),
      denied: t('grnDetail.qaRelease.denied'),
      invalidState: t('grnDetail.qaRelease.invalidState'),
      error: t('grnDetail.qaRelease.error'),
    },
    cancelLine: {
      rowAction: t('grnDetail.cancelLine.rowAction'),
      cancelledBadge: t('grnDetail.cancelLine.cancelledBadge'),
      title: t('grnDetail.cancelLine.title'),
      intro: t('grnDetail.cancelLine.intro'),
      reasonCode: t('grnDetail.cancelLine.reasonCode'),
      reasonPlaceholder: t('grnDetail.cancelLine.reasonPlaceholder'),
      reasonOptions: {
        entry_error: t('grnDetail.cancelLine.reasonOptions.entry_error'),
        wrong_quantity: t('grnDetail.cancelLine.reasonOptions.wrong_quantity'),
        wrong_batch: t('grnDetail.cancelLine.reasonOptions.wrong_batch'),
        wrong_product: t('grnDetail.cancelLine.reasonOptions.wrong_product'),
        other: t('grnDetail.cancelLine.reasonOptions.other'),
      },
      note: t('grnDetail.cancelLine.note'),
      noteOptional: t('grnDetail.cancelLine.noteOptional'),
      notePlaceholder: t('grnDetail.cancelLine.notePlaceholder'),
      cancel: t('grnDetail.cancelLine.cancel'),
      submit: t('grnDetail.cancelLine.submit'),
      submitting: t('grnDetail.cancelLine.submitting'),
      formIncomplete: 'Complete all required fields to continue.',
      errors: {
        forbidden: t('grnDetail.cancelLine.errors.forbidden'),
        not_found: t('grnDetail.cancelLine.errors.not_found'),
        lp_not_cancellable: t('grnDetail.cancelLine.errors.lp_not_cancellable'),
        already_cancelled: t('grnDetail.cancelLine.errors.already_cancelled'),
        invalid_input: t('grnDetail.cancelLine.errors.invalid_input'),
        persistence_failed: t('grnDetail.cancelLine.errors.persistence_failed'),
        generic: t('grnDetail.cancelLine.errors.generic'),
      },
    },
  };
}

function DetailSkeleton() {
  return (
    <div data-testid="grn-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-24 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function Panel({
  testid,
  state,
  tone,
  children,
  back,
}: {
  testid: string;
  state: string;
  tone: 'amber' | 'red' | 'slate';
  children: React.ReactNode;
  back?: React.ReactNode;
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <div className="flex flex-col gap-3">
      <div role="alert" data-testid={testid} data-state={state} className={`rounded-xl border px-6 py-4 text-sm ${cls}`}>
        {children}
      </div>
      {back}
    </div>
  );
}

async function DetailContent({ locale, grnId }: { locale: string; grnId: string }) {
  const t = getWhcTranslator(locale);
  const result = await getGrnDetail(grnId);

  const backLink = (
    <Link
      href={`/${locale}/warehouse/grns`}
      data-testid="grn-detail-back"
      className="text-sm text-sky-700 hover:underline"
    >
      ← {t('grnDetail.back')}
    </Link>
  );

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <Panel testid="grn-detail-denied" state="permission-denied" tone="amber" back={backLink}>
          {t('grnDetail.denied')}
        </Panel>
      );
    }
    if (result.reason === 'not_found') {
      return (
        <Panel testid="grn-detail-not-found" state="not-found" tone="slate" back={backLink}>
          {t('grnDetail.notFound')}
        </Panel>
      );
    }
    return (
      <Panel testid="grn-detail-error" state="error" tone="red" back={backLink}>
        {t('grnDetail.error')}
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {backLink}
      <GrnDetailClient
        grn={result.data}
        labels={buildLabels(t)}
        locale={locale}
        releaseQaAction={releaseLpQa}
        cancelGrnLineAction={cancelGrnLineAction}
        canCancelLines={result.data.status !== 'cancelled'}
      />
    </div>
  );
}

export default async function GrnDetailPage({ params }: PageProps) {
  const { locale, grnId } = await params;
  const t = getWhcTranslator(locale);

  return (
    <main
      data-screen="warehouse-grn-detail"
      data-prototype-label="grn_detail_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('grnDetail.breadcrumb.grns')}
        breadcrumb={[
          { label: t('grnDetail.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('grnDetail.breadcrumb.grns'), href: `/${locale}/warehouse/grns` },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} grnId={grnId} />
      </Suspense>
    </main>
  );
}
