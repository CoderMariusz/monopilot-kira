/**
 * WH-006 — Stock movements list route (/warehouse/movements).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   movement-screens.jsx:3-200 (WhMovementList) — move-type tabs, search, dense
 *   table. Per-region anchors + deviations live in
 *   movements/_components/movement-list.client.tsx.
 *
 * Data: the reviewed listStockMoves action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). The whole set is loaded once and the tab grouping
 * (transfers = transfer + putaway) happens client-side, matching the prototype.
 * RBAC enforced server-side; a `forbidden` result renders the permission panel.
 *
 * UI states: loading (Suspense skeleton), empty + empty-filtered (in the client
 * island), error (failed read → banner), permission-denied (forbidden → panel),
 * optimistic (N/A on a read list).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listStockMoves } from '../_actions/stock-move-actions';
import { getWhcTranslator } from '../wh-c-labels';
import { MovementListClient, type MovementListLabels } from './_components/movement-list.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:3-200';

function buildLabels(t: ReturnType<typeof getWhcTranslator>): MovementListLabels {
  return {
    searchPlaceholder: t('movements.searchPlaceholder'),
    searchLabel: t('movements.searchLabel'),
    rowsLabel: t('movements.rowsLabel'),
    emptyAll: t('movements.emptyAll'),
    emptyFiltered: t('movements.emptyFiltered'),
    none: t('movements.none'),
    tab: {
      all: t('movements.tabs.all'),
      receipts: t('movements.tabs.receipts'),
      consume: t('movements.tabs.consume'),
      transfers: t('movements.tabs.transfers'),
      adjustments: t('movements.tabs.adjustments'),
    },
    moveType: {
      receipt: t('movements.moveType.receipt'),
      putaway: t('movements.moveType.putaway'),
      transfer: t('movements.moveType.transfer'),
      consume_to_wo: t('movements.moveType.consume_to_wo'),
      adjustment: t('movements.moveType.adjustment'),
      quarantine: t('movements.moveType.quarantine'),
      return: t('movements.moveType.return'),
    },
    col: {
      move: t('movements.columns.move'),
      lp: t('movements.columns.lp'),
      type: t('movements.columns.type'),
      from: t('movements.columns.from'),
      to: t('movements.columns.to'),
      qty: t('movements.columns.qty'),
      date: t('movements.columns.date'),
      reason: t('movements.columns.reason'),
    },
  };
}

function ListSkeleton() {
  return (
    <div data-testid="movement-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getWhcTranslator(locale);
  const result = await listStockMoves({ limit: 500 });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="movement-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('movements.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="movement-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('movements.error')}
      </div>
    );
  }

  return <MovementListClient rows={result.data} labels={buildLabels(t)} locale={locale} />;
}

export default async function MovementsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getWhcTranslator(locale);

  return (
    <main
      data-screen="warehouse-movement-list"
      data-prototype-label="movement_list_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('movements.title')}
        subtitle={t('movements.subtitle')}
        breadcrumb={[
          { label: t('movements.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('movements.breadcrumb.movements') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
