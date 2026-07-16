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
import { blockLp, listOpenWorkOrdersForLpReserve, reserveLp, unblockLp } from './_actions/lp-detail-actions';
import { destroyLp, listSiblingLpsForMerge, mergeLps, splitLp } from './_actions/lp-split-merge-destroy-actions';
import { updateLpMetadataAction } from './lp-metadata-adapter';
// E1 — label printing wired through the printers settings actions (mig 304).
import { printLabel } from '../../../../(admin)/settings/infra/printers/_actions/printers';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { getLpTranslator } from '../lp-labels';
// RSC boundary: runtime VALUES must come from the server-safe constants module —
// importing them from the 'use client' module yields client-reference proxies and
// crashed every LP detail render (`LP_DEFERRED_ACTIONS is not iterable`, live
// error digest 1984471676). Type-only imports from the client module are erased
// at compile time and stay safe.
import { DocumentAuditTimelineSection } from '../../../_components/audit-timeline/document-audit-timeline-section';
import {
  LpDetailClient,
  type LpDetailLabels,
  type LpPrintLabelInput,
  type LpPrintLabelResult,
} from './_components/lp-detail.client';
import {
  LP_DETAIL_ACTIONS,
  type LpDetailAction,
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
  const labelByKey = {} as Record<LpDetailAction, string>;
  for (const k of LP_DETAIL_ACTIONS) labelByKey[k] = t(`detail.actions.${k}`);
  return {
    back: t('detail.back'),
    qtyLine: t('detail.header.qtyLine'),
    statusLabel: {
      received: t('status.received'),
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
      destroyed: t('status.destroyed'),
    },
    // QA-status badge dict (raw lowercase qa_status → localized label). The raw
    // value (e.g. "pending") was leaking next to the translated LP-status badge.
    qaStatusLabel: {
      pending: t('qaStatus.pending'),
      released: t('qaStatus.released'),
      on_hold: t('qaStatus.on_hold'),
      rejected: t('qaStatus.rejected'),
      quarantined: t('qaStatus.quarantined'),
      passed: t('qaStatus.passed'),
      failed: t('qaStatus.failed'),
      hold: t('qaStatus.hold'),
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
      reserve: {
        title: t('detail.actions.reserveModal.title'),
        intro: t('detail.actions.reserveModal.intro'),
        search: t('detail.actions.reserveModal.search'),
        searchPlaceholder: t('detail.actions.reserveModal.searchPlaceholder'),
        wo: t('detail.actions.reserveModal.wo'),
        woPlaceholder: t('detail.actions.reserveModal.woPlaceholder'),
        qty: t('detail.actions.reserveModal.qty'),
        qtyHint: t('detail.actions.reserveModal.qtyHint'),
        loading: t('detail.actions.reserveModal.loading'),
        empty: t('detail.actions.reserveModal.empty'),
        cancel: t('detail.actions.reserveModal.cancel'),
        confirm: t('detail.actions.reserveModal.confirm'),
        submitting: t('detail.actions.reserveModal.submitting'),
        errors: {
          forbidden: t('detail.actions.reserveModal.errors.forbidden'),
          invalidInput: t('detail.actions.reserveModal.errors.invalidInput'),
          notFound: t('detail.actions.reserveModal.errors.notFound'),
          locked: t('detail.actions.reserveModal.errors.locked'),
          invalidState: t('detail.actions.reserveModal.errors.invalidState'),
          notReleased: t('detail.actions.reserveModal.errors.notReleased'),
          otherWo: t('detail.actions.reserveModal.errors.otherWo'),
          woNotOpen: t('detail.actions.reserveModal.errors.woNotOpen'),
          qtyExceedsAvailable: t('detail.actions.reserveModal.errors.qtyExceedsAvailable'),
          productNotInWoBom: t('detail.actions.reserveModal.errors.productNotInWoBom'),
          generic: t('detail.actions.reserveModal.errors.generic'),
        },
      },
      block: {
        title: t('detail.actions.blockModal.title'),
        intro: t('detail.actions.blockModal.intro'),
        reason: t('detail.actions.blockModal.reason'),
        reasonPlaceholder: t('detail.actions.blockModal.reasonPlaceholder'),
        cancel: t('detail.actions.blockModal.cancel'),
        confirm: t('detail.actions.blockModal.confirm'),
        submitting: t('detail.actions.blockModal.submitting'),
        errors: {
          forbidden: t('detail.actions.blockModal.errors.forbidden'),
          alreadyBlocked: t('detail.actions.blockModal.errors.alreadyBlocked'),
          terminal: t('detail.actions.blockModal.errors.terminal'),
          locked: t('detail.actions.blockModal.errors.locked'),
          invalidInput: t('detail.actions.blockModal.errors.invalidInput'),
          notFound: t('detail.actions.blockModal.errors.notFound'),
          generic: t('detail.actions.blockModal.errors.generic'),
        },
      },
      unblock: {
        title: t('detail.actions.unblockModal.title'),
        intro: t('detail.actions.unblockModal.intro'),
        reason: t('detail.actions.unblockModal.reason'),
        reasonPlaceholder: t('detail.actions.unblockModal.reasonPlaceholder'),
        esign: {
          title: t('detail.actions.unblockModal.esign.title'),
          meaning: t('detail.actions.unblockModal.esign.meaning'),
          password: t('detail.actions.unblockModal.esign.password'),
          passwordHelp: t('detail.actions.unblockModal.esign.passwordHelp'),
          passwordPlaceholder: t('detail.actions.unblockModal.esign.passwordPlaceholder'),
        },
        cancel: t('detail.actions.unblockModal.cancel'),
        confirm: t('detail.actions.unblockModal.confirm'),
        submitting: t('detail.actions.unblockModal.submitting'),
        success: t('detail.actions.unblockModal.success'),
        errors: {
          forbidden: t('detail.actions.unblockModal.errors.forbidden'),
          invalidState: t('detail.actions.unblockModal.errors.invalidState'),
          noOpenHold: t('detail.actions.unblockModal.errors.noOpenHold'),
          invalidInput: t('detail.actions.unblockModal.errors.invalidInput'),
          notFound: t('detail.actions.unblockModal.errors.notFound'),
          generic: t('detail.actions.unblockModal.errors.generic'),
        },
      },
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
      split: {
        title: t('detail.actions.splitModal.title'),
        intro: t('detail.actions.splitModal.intro'),
        qty: t('detail.actions.splitModal.qty'),
        qtyHint: t('detail.actions.splitModal.qtyHint'),
        reason: t('detail.actions.splitModal.reason'),
        reasonPlaceholder: t('detail.actions.splitModal.reasonPlaceholder'),
        cancel: t('detail.actions.splitModal.cancel'),
        confirm: t('detail.actions.splitModal.confirm'),
        submitting: t('detail.actions.splitModal.submitting'),
        validation: {
          positive: t('detail.actions.splitModal.validation.positive'),
          lessThanAvailable: t('detail.actions.splitModal.validation.lessThanAvailable'),
          reasonRequired: t('detail.actions.splitModal.validation.reasonRequired'),
        },
        errors: {
          forbidden: t('detail.actions.splitModal.errors.forbidden'),
          notFound: t('detail.actions.splitModal.errors.notFound'),
          invalidInput: t('detail.actions.splitModal.errors.invalidInput'),
          invalidState: t('detail.actions.splitModal.errors.invalidState'),
          onHold: t('detail.actions.splitModal.errors.onHold'),
          qtyTooLarge: t('detail.actions.splitModal.errors.qtyTooLarge'),
          generic: t('detail.actions.splitModal.errors.generic'),
        },
      },
      merge: {
        title: t('detail.actions.mergeModal.title'),
        intro: t('detail.actions.mergeModal.intro'),
        candidates: t('detail.actions.mergeModal.candidates'),
        loading: t('detail.actions.mergeModal.loading'),
        empty: t('detail.actions.mergeModal.empty'),
        reason: t('detail.actions.mergeModal.reason'),
        reasonPlaceholder: t('detail.actions.mergeModal.reasonPlaceholder'),
        cancel: t('detail.actions.mergeModal.cancel'),
        confirm: t('detail.actions.mergeModal.confirm'),
        submitting: t('detail.actions.mergeModal.submitting'),
        validation: {
          selectionRequired: t('detail.actions.mergeModal.validation.selectionRequired'),
          reasonRequired: t('detail.actions.mergeModal.validation.reasonRequired'),
        },
        errors: {
          forbidden: t('detail.actions.mergeModal.errors.forbidden'),
          notFound: t('detail.actions.mergeModal.errors.notFound'),
          invalidInput: t('detail.actions.mergeModal.errors.invalidInput'),
          mismatch: t('detail.actions.mergeModal.errors.mismatch'),
          invalidState: t('detail.actions.mergeModal.errors.invalidState'),
          reserved: t('detail.actions.mergeModal.errors.reserved'),
          onHold: t('detail.actions.mergeModal.errors.onHold'),
          generic: t('detail.actions.mergeModal.errors.generic'),
        },
      },
      destroy: {
        title: t('detail.actions.destroyModal.title'),
        intro: t('detail.actions.destroyModal.intro'),
        warning: t('detail.actions.destroyModal.warning'),
        acknowledge: t('detail.actions.destroyModal.acknowledge'),
        reason: t('detail.actions.destroyModal.reason'),
        reasonPlaceholder: t('detail.actions.destroyModal.reasonPlaceholder'),
        cancel: t('detail.actions.destroyModal.cancel'),
        confirm: t('detail.actions.destroyModal.confirm'),
        submitting: t('detail.actions.destroyModal.submitting'),
        errors: {
          forbidden: t('detail.actions.destroyModal.errors.forbidden'),
          notFound: t('detail.actions.destroyModal.errors.notFound'),
          invalidInput: t('detail.actions.destroyModal.errors.invalidInput'),
          terminal: t('detail.actions.destroyModal.errors.terminal'),
          reserved: t('detail.actions.destroyModal.errors.reserved'),
          generic: t('detail.actions.destroyModal.errors.generic'),
        },
      },
      ineligible: {
        split: t('detail.actions.ineligible.split'),
        destroy: t('detail.actions.ineligible.destroy'),
        merge: t('detail.actions.ineligible.merge'),
        reserve: t('detail.actions.ineligible.reserve'),
        expired: t('detail.actions.ineligible.expired'),
        onHold: t('detail.actions.ineligible.onHold'),
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
      noAlternateLocations: t('detail.move.noAlternateLocations'),
      locationsError: t('detail.move.locationsError'),
      cancel: t('detail.move.cancel'),
      submit: t('detail.move.submit'),
      submitting: t('detail.move.submitting'),
      formIncomplete: 'Complete all required fields to continue.',
      validation: { destinationRequired: t('detail.move.validation.destinationRequired') },
      error: t('detail.move.error'),
      errorForbidden: t('detail.move.errorForbidden'),
      errorLocked: t('detail.move.errorLocked'),
      errorInvalidState: t('detail.move.errorInvalidState'),
      errorSameLocation: t('detail.move.errorSameLocation'),
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
    labels: {
      deferred: t('detail.labels.deferred'),
      printAction: t('detail.labels.printAction'),
      printing: t('detail.labels.printing'),
      queued: t('detail.labels.queued'),
      sent: t('detail.labels.sent'),
      download: t('detail.labels.download'),
      error: t('detail.labels.error'),
      forbidden: t('detail.labels.forbidden'),
      historyLink: t('detail.labels.historyLink'),
      errors: {
        generic: t('detail.labels.error'),
        entityNotFound: t.has('detail.labels.errors.entityNotFound')
          ? t('detail.labels.errors.entityNotFound')
          : 'License plate not found — it may have been removed.',
        printerNotFound: t.has('detail.labels.errors.printerNotFound')
          ? t('detail.labels.errors.printerNotFound')
          : 'The selected printer is missing or inactive.',
        unsupportedEntity: t.has('detail.labels.errors.unsupportedEntity')
          ? t('detail.labels.errors.unsupportedEntity')
          : 'Only license-plate labels can be printed from here.',
      },
    },
    raw: { title: t('detail.raw.title'), empty: t('detail.raw.empty') },
    expiryBanner: t('detail.expiryBanner'),
  };
}

const PRINT_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

/**
 * E1 — resolve the SAME permission the printers actions enforce, server-side, so
 * the labels-tab Print button is rendered enabled/disabled honestly (never
 * render-then-disable leak; the action re-checks regardless). Failures degrade to
 * "no permission" rather than crashing the detail page.
 */
async function resolveCanPrint(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, PRINT_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

/**
 * E1 — Server Action adapter: maps the printers `printLabel` PrintJobRow down to
 * the minimal {status, result_url} the labels tab renders. The action itself
 * re-validates RBAC + the entity, so this is a thin import-only seam.
 */
async function printLpLabel(input: LpPrintLabelInput): Promise<LpPrintLabelResult> {
  'use server';
  try {
    const job = await printLabel({ entityType: input.entityType, entityId: input.entityId });
    if (job.status === 'failed') {
      return { status: 'failed', result_url: null, code: job.error_text ?? 'print_failed' };
    }
    return { status: job.status, result_url: job.result_url };
  } catch (e) {
    const code = e instanceof Error ? e.message : 'print_failed';
    return { status: 'failed', result_url: null, code };
  }
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

  const canPrint = await resolveCanPrint();

  return (
    <div className="flex flex-col gap-4">
      <LpDetailClient
        detail={result.data}
        labels={buildLabels(locale)}
        locale={locale}
        releaseQaAction={releaseLpQa}
        blockLpAction={blockLp}
        unblockLpAction={unblockLp}
        reserveLpAction={reserveLp}
        listOpenWorkOrdersForLpReserveAction={listOpenWorkOrdersForLpReserve}
        listLocationsAction={listLocations}
        createStockMoveAction={createStockMove}
        splitLpAction={splitLp}
        mergeLpAction={mergeLps}
        listSiblingLpsForMergeAction={listSiblingLpsForMerge}
        destroyLpAction={destroyLp}
        updateLpMetadataAction={updateLpMetadataAction}
        printLabelAction={printLpLabel}
        canPrint={canPrint}
      />
      <DocumentAuditTimelineSection entityType="license_plate" entityId={result.data.id} locale={locale} />
    </div>
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
