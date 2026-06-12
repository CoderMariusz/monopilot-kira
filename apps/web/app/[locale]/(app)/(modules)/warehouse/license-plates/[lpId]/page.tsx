/**
 * WH-003 — `/warehouse/license-plates/[lpId]` LP detail page (7-tab).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   lp-screens.jsx:216-571 (lp_detail) — page head, expiry banner, identity card +
 *   action group, and the 7 tabs (overview / state history / reservations /
 *   movements / genealogy / labels / raw). See lp-detail.client.tsx for the
 *   per-region anchors and the documented deviations (actions disabled, label
 *   print + audit-table deferred, reservations reduced to the single reserved-WO
 *   fact the action exposes).
 *
 * Server Component: reads org-scoped data via the `getLpDetail` Server Action
 * (owned by the parallel Codex lane — imported, never authored). RBAC
 * (warehouse.inventory.read) is enforced INSIDE the action; this page surfaces the
 * `forbidden` / `not_found` reasons as panels and never trusts a client flag.
 *
 * i18n resolved server-side from the staged bundle (see ../lp-labels.ts).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (not-found panel for a
 * missing LP), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → denied panel). Optimistic — N/A (the action group is deferred and
 * rendered disabled, no mutations here).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';
import Link from 'next/link';

import { getLpDetail } from '../../_actions/lp-actions';
import { releaseLpQa } from '../../_actions/lp-qa-actions';
import { listLocations } from '../../_actions/location-read-actions';
import { createStockMove } from '../../_actions/stock-move-actions';
import { updateLpMetadataAction } from './lp-metadata-adapter';
import { getLpTranslator } from '../lp-labels';
// RSC boundary: runtime VALUES must come from the server-safe constants module —
// importing them from the 'use client' module yields client-reference proxies and
// crashed every LP detail render (`LP_DEFERRED_ACTIONS is not iterable`, live
// error digest 1984471676). Type-only imports from the client module are erased
// at compile time and stay safe.
import { LpDetailClient, type LpDetailLabels } from './_components/lp-detail.client';
import {
  LP_DEFERRED_ACTIONS,
  type LpDeferredAction,
} from './_components/lp-detail-constants';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; lpId: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="lp-detail-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="h-12 w-96 animate-pulse rounded-lg bg-slate-100" />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

function buildLabels(locale: string): LpDetailLabels {
  const t = getLpTranslator(locale);
  const labelByKey = {} as Record<LpDeferredAction, string>;
  for (const k of LP_DEFERRED_ACTIONS) labelByKey[k] = t(`detail.actions.${k}`);
  return {
    back: t('detail.back'),
    qtyLine: t('detail.header.qtyLine'),
    statusLabel: {
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
      destroyed: t('status.destroyed'),
    },
    identity: {
      title: t('detail.identity.title'),
      product: t('detail.identity.product'),
      itemType: t('detail.identity.itemType'),
      quantity: t('detail.identity.quantity'),
      reserved: t('detail.identity.reserved'),
      available: t('detail.identity.available'),
      batch: t('detail.identity.batch'),
      supplierBatch: t('detail.identity.supplierBatch'),
      expiry: t('detail.identity.expiry'),
      bestBefore: t('detail.identity.bestBefore'),
      catchWeight: t('detail.identity.catchWeight'),
      location: t('detail.identity.location'),
      warehouse: t('detail.identity.warehouse'),
      source: t('detail.identity.source'),
      parentLp: t('detail.identity.parentLp'),
      none: t('detail.identity.none'),
    },
    actions: {
      comingSoon: t('detail.actions.comingSoon'),
      labelByKey,
      qaRelease: {
        title: t('detail.actions.qaRelease.title'),
        decision: t('detail.actions.qaRelease.decision'),
        released: t('detail.actions.qaRelease.released'),
        rejected: t('detail.actions.qaRelease.rejected'),
        note: t('detail.actions.qaRelease.note'),
        notePlaceholder: t('detail.actions.qaRelease.notePlaceholder'),
        cancel: t('detail.actions.qaRelease.cancel'),
        confirm: t('detail.actions.qaRelease.confirm'),
        unavailable: t('detail.actions.qaRelease.unavailable'),
        denied: t('detail.actions.qaRelease.denied'),
        invalidState: t('detail.actions.qaRelease.invalidState'),
        error: t('detail.actions.qaRelease.error'),
      },
    },
    move: {
      title: t('detail.move.title'),
      subtitle: t('detail.move.subtitle'),
      destination: t('detail.move.destination'),
      destinationHelp: t('detail.move.destinationHelp'),
      destinationPlaceholder: t('detail.move.destinationPlaceholder'),
      reason: t('detail.move.reason'),
      reasonHelp: t('detail.move.reasonHelp'),
      reasonPlaceholder: t('detail.move.reasonPlaceholder'),
      currentLocation: t('detail.move.currentLocation'),
      loadingLocations: t('detail.move.loadingLocations'),
      noLocations: t('detail.move.noLocations'),
      locationsError: t('detail.move.locationsError'),
      cancel: t('detail.move.cancel'),
      submit: t('detail.move.submit'),
      submitting: t('detail.move.submitting'),
      validation: { destinationRequired: t('detail.move.validation.destinationRequired') },
      error: t('detail.move.error'),
      errorForbidden: t('detail.move.errorForbidden'),
      errorLocked: t('detail.move.errorLocked'),
      errorInvalidState: t('detail.move.errorInvalidState'),
      errorNotFound: t('detail.move.errorNotFound'),
      success: t('detail.move.success'),
    },
    metadata: {
      action: t('detail.metadata.action'),
      title: t('detail.metadata.title'),
      intro: t('detail.metadata.intro'),
      expiry: t('detail.metadata.expiry'),
      expiryHelp: t('detail.metadata.expiryHelp'),
      batch: t('detail.metadata.batch'),
      batchHelp: t('detail.metadata.batchHelp'),
      reasonCode: t('detail.metadata.reasonCode'),
      reasonPlaceholder: t('detail.metadata.reasonPlaceholder'),
      reasonOptions: {
        entry_error: t('detail.metadata.reasonOptions.entry_error'),
        wrong_quantity: t('detail.metadata.reasonOptions.wrong_quantity'),
        wrong_batch: t('detail.metadata.reasonOptions.wrong_batch'),
        wrong_product: t('detail.metadata.reasonOptions.wrong_product'),
        other: t('detail.metadata.reasonOptions.other'),
      },
      note: t('detail.metadata.note'),
      noteOptional: t('detail.metadata.noteOptional'),
      notePlaceholder: t('detail.metadata.notePlaceholder'),
      noChange: t('detail.metadata.noChange'),
      cancel: t('detail.metadata.cancel'),
      submit: t('detail.metadata.submit'),
      submitting: t('detail.metadata.submitting'),
      errors: {
        forbidden: t('detail.metadata.errors.forbidden'),
        not_found: t('detail.metadata.errors.not_found'),
        lp_not_editable: t('detail.metadata.errors.lp_not_editable'),
        invalid_input: t('detail.metadata.errors.invalid_input'),
        persistence_failed: t('detail.metadata.errors.persistence_failed'),
        generic: t('detail.metadata.errors.generic'),
      },
    },
    ruleNote: t('detail.ruleNote'),
    tab: {
      overview: t('detail.tabs.overview'),
      history: t('detail.tabs.history'),
      reservations: t('detail.tabs.reservations'),
      movements: t('detail.tabs.movements'),
      genealogy: t('detail.tabs.genealogy'),
      labels: t('detail.tabs.labels'),
      raw: t('detail.tabs.raw'),
    },
    overview: { title: t('detail.overview.title') },
    history: {
      empty: t('detail.history.empty'),
      by: t('detail.history.by'),
      reason: t('detail.history.reason'),
      from: t('detail.history.from'),
      to: t('detail.history.to'),
      at: t('detail.history.at'),
      reasonCol: t('detail.history.reasonCol'),
    },
    reservations: {
      empty: t('detail.reservations.empty'),
      wo: t('detail.reservations.wo'),
      reservedQty: t('detail.reservations.reservedQty'),
      available: t('detail.reservations.available'),
      note: t('detail.reservations.note'),
    },
    movements: {
      empty: t('detail.movements.empty'),
      timestamp: t('detail.movements.timestamp'),
      type: t('detail.movements.type'),
      from: t('detail.movements.from'),
      to: t('detail.movements.to'),
      qty: t('detail.movements.qty'),
      reason: t('detail.movements.reason'),
      reference: t('detail.movements.reference'),
    },
    genealogy: {
      parentTitle: t('detail.genealogy.parentTitle'),
      childrenTitle: t('detail.genealogy.childrenTitle'),
      noParent: t('detail.genealogy.noParent'),
      noChildren: t('detail.genealogy.noChildren'),
      status: t('detail.genealogy.status'),
      qty: t('detail.genealogy.qty'),
    },
    labels: { deferred: t('detail.labels.deferred'), printAction: t('detail.labels.printAction') },
    raw: { title: t('detail.raw.title'), empty: t('detail.raw.empty') },
    expiryBanner: t('detail.expiryBanner'),
  };
}

async function DetailContent({ locale, lpId }: { locale: string; lpId: string }) {
  const t = getLpTranslator(locale);
  const result = await getLpDetail(lpId);

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="lp-detail-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('detail.denied')}
      </div>
    );
  }

  if (!result.ok && result.reason === 'not_found') {
    return (
      <div
        role="note"
        data-testid="lp-detail-not-found"
        className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-6 py-5 text-sm text-slate-600"
      >
        <span>{t('detail.notFound')}</span>
        <Link
          href={`/${locale}/warehouse/license-plates`}
          className="text-sky-700 hover:underline"
        >
          ← {t('detail.back')}
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="lp-detail-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('detail.error')}
      </div>
    );
  }

  return (
    <LpDetailClient
      detail={result.data}
      labels={buildLabels(locale)}
      locale={locale}
      releaseQaAction={releaseLpQa}
      listLocationsAction={listLocations}
      createStockMoveAction={createStockMove}
      updateLpMetadataAction={updateLpMetadataAction}
    />
  );
}

export default async function LicensePlateDetailPage({ params }: PageProps) {
  const { locale, lpId } = await params;

  return (
    <main
      data-screen="warehouse-lp-detail"
      data-prototype-label="lp_detail"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:216-571"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} lpId={lpId} />
      </Suspense>
    </main>
  );
}
