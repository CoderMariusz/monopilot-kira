/**
 * P-L1 — `/production/wos/[id]` WO Execution detail page (prototype wo-detail.jsx:4-530).
 *
 * The UI page lives at `/production/wos/[id]` (NOT `/production/work-orders/[id]`)
 * because `work-orders/[id]/route.ts` already owns that segment as the GET API
 * handler — a Route Handler and a page Component cannot coexist on one segment.
 * The list at `/production/wos` links rows here; the dashboard WO-list rows are
 * re-pointed here too.
 *
 * Server Component: gates + reads ALL eight tabs' org-scoped data via the
 * `getWorkOrderDetail` Server Action (production.oee.read), then hands view-models
 * + i18n labels to the presentational <WoDetailScreen> (owns active-tab state).
 *
 * UI states: loading (Suspense skeleton), empty (per-tab empty copy inside the
 * screen), error (live read failed → banner), permission-denied (forbidden →
 * denied panel), not-found (unknown / cross-org id → notFound()). Optimistic —
 * N/A (read-only; mutations are a follow-up lane).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getWorkOrderDetail } from '../../_actions/get-work-order-detail';
import { getWoActionContext } from '../../_actions/get-wo-action-context';
import { releaseWoOutputQa } from '../../_actions/output-qa-actions';
import { listConsumableLps, recordDesktopConsumption } from '../../_actions/consume-material-actions';
import {
  WoDetailScreen,
  type WoDetailActions,
  type WoDetailLabels,
} from './_components/wo-detail-screen';
import { buildWoModalLabels } from '../../_actions/wo-modal-labels';

export const dynamic = 'force-dynamic';

function WoDetailSkeleton() {
  return (
    <div data-testid="wo-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-10 w-full max-w-xl animate-pulse rounded-lg bg-slate-100" />
      <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function WoDetailContent({ id, locale }: { id: string; locale: string }) {
  const t = await getTranslations('production.wos.detail');
  const result = await getWorkOrderDetail(id);

  if (!result.ok && result.reason === 'not_found') {
    notFound();
  }

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="wo-detail-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="wo-detail-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const status = (k: string) => t(`status.${k}`);

  // M-5 — staged desktop-consume labels. Keys live in
  // _meta/i18n-staging/desktop-consume.json under
  // production.wos.detail.consumption.record.* until the bundle-merge lane folds
  // them in; guarded with `t.has` so a not-yet-merged bundle never throws (EN
  // fallbacks keep it honest live). Mirrors the catch-weight / wo-uom injection.
  const rec = (key: string, fallback: string): string =>
    t.has(`consumption.record.${key}`) ? t(`consumption.record.${key}`) : fallback;

  const labels: WoDetailLabels = {
    status: {
      planned: status('planned'),
      in_progress: status('in_progress'),
      paused: status('paused'),
      completed: status('completed'),
      closed: status('closed'),
      cancelled: status('cancelled'),
    },
    deferredActionTitle: t('deferredActionTitle'),
    changeoverGate: {
      title: t('changeoverGate.title'),
      body: t('changeoverGate.body'),
      link: t('changeoverGate.link'),
    },
    headerActions: {
      start: t('headerActions.start'),
      pause: t('headerActions.pause'),
      resume: t('headerActions.resume'),
      waste: t('headerActions.waste'),
      catchWeight: t('headerActions.catchWeight'),
      complete: t('headerActions.complete'),
      cancel: t('headerActions.cancel'),
      close: t('headerActions.close'),
    },
    tabs: {
      overview: t('tabs.overview'),
      consumption: t('tabs.consumption'),
      output: t('tabs.output'),
      waste: t('tabs.waste'),
      downtime: t('tabs.downtime'),
      qa: t('tabs.qa'),
      genealogy: t('tabs.genealogy'),
      history: t('tabs.history'),
    },
    overview: {
      summaryTitle: t('overview.summaryTitle'),
      kpisTitle: t('overview.kpisTitle'),
      wo: t('overview.wo'),
      product: t('overview.product'),
      line: t('overview.line'),
      machine: t('overview.machine'),
      planned: t('overview.planned'),
      output: t('overview.output'),
      plannedWindow: t('overview.plannedWindow'),
      actualStart: t('overview.actualStart'),
      elapsed: t('overview.elapsed'),
      allergens: t('overview.allergens'),
      bomVersion: t('overview.bomVersion'),
      consumption: t('overview.consumption'),
      consumptionKpi: t('overview.consumptionKpi'),
      outputKpi: t('overview.outputKpi'),
      allergenYes: t('overview.allergenYes'),
      allergenNo: t('overview.allergenNo'),
      elapsedMin: t('overview.elapsedMin'),
    },
    consumption: {
      title: t('consumption.title'),
      empty: t('consumption.empty'),
      addAction: t('consumption.addAction'),
      col: {
        code: t('consumption.col.code'),
        component: t('consumption.col.component'),
        planned: t('consumption.col.planned'),
        consumed: t('consumption.col.consumed'),
        remaining: t('consumption.col.remaining'),
        progress: t('consumption.col.progress'),
      },
      record: {
        trigger: rec('trigger', 'Record consumption'),
        rowTrigger: rec('rowTrigger', 'Record'),
        title: rec('title', 'Record material consumption'),
        subtitle: rec(
          'subtitle',
          "Decrement on-hand stock for a BOM component. Pick a license plate (FEFO order) or record without one.",
        ),
        material: rec('material', 'Component'),
        materialPlaceholder: rec('materialPlaceholder', 'Select a component'),
        qty: rec('qty', 'Quantity'),
        qtyHint: rec('qtyHint', "Amount to consume, in the component's unit of measure."),
        lp: rec('lp', 'License plate (FEFO)'),
        lpLoading: rec('lpLoading', 'Loading license plates…'),
        lpEmpty: rec('lpEmpty', 'No license plates available for this component.'),
        lpError: rec('lpError', 'Unable to load license plates.'),
        lpNone: rec('lpNone', '— no LP —'),
        lpSuggested: rec('lpSuggested', 'suggested'),
        submit: rec('submit', 'Record consumption'),
        submitting: rec('submitting', 'Recording…'),
        cancel: rec('cancel', 'Cancel'),
        warningOver: rec('warningOver', 'Over required quantity by {pct}% — recorded and flagged.'),
        warningClose: rec('warningClose', 'Close'),
        errors: {
          forbidden: rec('errors.forbidden', 'You do not have permission to record consumption.'),
          lp_unavailable: rec(
            'errors.lp_unavailable',
            'That license plate no longer has enough free stock for this quantity.',
          ),
          invalid_material: rec('errors.invalid_material', 'This component is no longer valid for this work order.'),
          invalid_qty: rec('errors.invalid_qty', 'Enter a quantity greater than zero.'),
          generic: rec('errors.generic', 'Unable to record consumption.'),
        },
      },
    },
    output: {
      title: t('output.title'),
      empty: t('output.empty'),
      addAction: t('output.addAction'),
      col: {
        type: t('output.col.type'),
        product: t('output.col.product'),
        qty: t('output.col.qty'),
        batch: t('output.col.batch'),
        expiry: t('output.col.expiry'),
        qa: t('output.col.qa'),
        lp: t('output.col.lp'),
      },
      qaPass: t.has('output.qaPass') ? t('output.qaPass') : 'QA pass',
      qaFail: t.has('output.qaFail') ? t('output.qaFail') : 'QA fail',
      qaDenied: t.has('output.qaDenied') ? t('output.qaDenied') : 'You do not have permission to release output QA.',
      qaInvalidState: t.has('output.qaInvalidState') ? t('output.qaInvalidState') : 'This output is no longer pending QA.',
      qaError: t.has('output.qaError') ? t('output.qaError') : 'Unable to update output QA.',
    },
    waste: {
      title: t('waste.title'),
      empty: t('waste.empty'),
      addAction: t('waste.addAction'),
      totalLabel: t('waste.totalLabel', { kg: 0 }).replace('0', '{kg}'),
      col: {
        time: t('waste.col.time'),
        category: t('waste.col.category'),
        qty: t('waste.col.qty'),
        reason: t('waste.col.reason'),
      },
    },
    downtime: {
      title: t('downtime.title'),
      empty: t('downtime.empty'),
      addAction: t('downtime.addAction'),
      openLabel: t('downtime.openLabel'),
      col: {
        category: t('downtime.col.category'),
        start: t('downtime.col.start'),
        end: t('downtime.col.end'),
        duration: t('downtime.col.duration'),
        reason: t('downtime.col.reason'),
      },
    },
    qa: {
      title: t('qa.title'),
      empty: t('qa.empty'),
      total: t('qa.total'),
      pass: t('qa.pass'),
      hold: t('qa.hold'),
      fail: t('qa.fail'),
    },
    genealogy: {
      title: t('genealogy.title'),
      empty: t('genealogy.empty'),
      inputsLabel: t('genealogy.inputsLabel'),
      fefoOk: t('genealogy.fefoOk'),
      fefoDeviation: t('genealogy.fefoDeviation'),
    },
    history: {
      title: t('history.title'),
      empty: t('history.empty'),
      sourceStatus: t('history.sourceStatus'),
      sourceExecution: t('history.sourceExecution'),
      col: {
        time: t('history.col.time'),
        source: t('history.col.source'),
        action: t('history.col.action'),
        transition: t('history.col.transition'),
        reason: t('history.col.reason'),
      },
    },
  };

  // Resolve the server-side action context (RBAC + runtime status + reference
  // lists + e-sign signer). A failed/forbidden read just hides the action bar —
  // the read-only screen still renders.
  const actionCtx = await getWoActionContext(id);
  const at = await getTranslations('production.wos.actions');

  let actions: WoDetailActions | null = null;
  if (actionCtx.ok) {
    const modalLabels = buildWoModalLabels((k) => at(k));

    // P0-UOM — inject the staged output-unit labels + the conversion-unavailable
    // error onto the server-resolved labels object (keys live in
    // _meta/i18n-staging/wo-uom.json until the bundle-merge lane lands; guarded
    // with `at.has` so a not-yet-merged bundle never throws at runtime).
    const opt = (key: string): string | undefined => (at.has(key) ? at(key) : undefined);
    modalLabels.output.qtyUom = {
      base: opt('output.qtyUom.base') ?? modalLabels.output.qty,
      each: opt('output.qtyUom.each') ?? 'each',
      box: opt('output.qtyUom.box') ?? 'box',
    };
    modalLabels.output.actualWeight = opt('output.actualWeight') ?? 'Actual weight (kg)';
    modalLabels.output.actualWeightHint =
      opt('output.actualWeightHint') ?? 'Leave empty to use the nominal conversion.';
    modalLabels.output.conversionPreview =
      opt('output.conversionPreview') ?? '{qty} {unit} = {kg} {base}';
    if (!modalLabels.errors.uom_conversion_unavailable) {
      modalLabels.errors.uom_conversion_unavailable =
        opt('errors.uom_conversion_unavailable') ??
        'This product is missing the pack data needed to convert units — set it in Technical.';
    }

    // B-3 — inject the staged catch-weight per-unit capture labels (keys live in
    // _meta/i18n-staging/catch-weight.json until the bundle-merge lane folds them
    // into production.wos.actions.output.catchWeight.*). Guarded with `at.has` so
    // a not-yet-merged bundle never throws; EN fallbacks keep it honest live.
    modalLabels.output.catchWeight = {
      sectionTitle: opt('output.catchWeight.sectionTitle') ?? 'Per-unit weights (kg)',
      sectionHint:
        opt('output.catchWeight.sectionHint') ??
        'Catch-weight item — enter the actual scale reading for each unit.',
      unitLabel: opt('output.catchWeight.unitLabel') ?? 'Unit {n}',
      sumLabel: opt('output.catchWeight.sumLabel') ?? 'Σ {total} kg',
      tooMany:
        opt('output.catchWeight.tooMany') ??
        'Too many units to enter individually (max {max}). Reduce the quantity or register in smaller batches.',
      baseTextareaLabel:
        opt('output.catchWeight.baseTextareaLabel') ?? 'Per-unit weights (one per line, kg)',
      baseTextareaHint:
        opt('output.catchWeight.baseTextareaHint') ?? 'Enter one positive weight per line.',
      invalidWeights:
        opt('output.catchWeight.invalidWeights') ?? 'Every unit weight must be a positive number.',
    };

    actions = {
      locale,
      status: actionCtx.data.executionStatus,
      permissions: actionCtx.data.permissions,
      currentUserId: actionCtx.data.currentUserId,
      downtimeCategories: actionCtx.data.downtimeCategories,
      wasteCategories: actionCtx.data.wasteCategories,
      modalLabels,
    };
  }

  return (
    <WoDetailScreen
      data={result.data}
      labels={labels}
      actions={actions}
      changeoverGate={
        result.data.openChangeoverId ? { lineId: result.data.header.lineId } : null
      }
      releaseOutputQaAction={releaseWoOutputQa}
      recordConsumptionAction={recordDesktopConsumption}
      listConsumableLpsAction={listConsumableLps}
    />
  );
}

export default async function ProductionWoDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  const t = await getTranslations('production.wos.detail');

  return (
    <main
      data-screen="production-wo-detail"
      data-prototype-label="wo_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        breadcrumb={[
          { label: t('breadcrumb.production'), href: '/production' },
          { label: t('breadcrumb.workOrders'), href: '/production/wos' },
        ]}
      />
      <Suspense fallback={<WoDetailSkeleton />}>
        <WoDetailContent id={id} locale={locale} />
      </Suspense>
    </main>
  );
}
