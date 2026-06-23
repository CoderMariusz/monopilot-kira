/**
 * P-L1 — `/production/wos` WO list page (prototype wo-list.jsx:4-106).
 *
 * The dashboard's "Work orders" deep-link (production/page.tsx NAV_CARDS →
 * `/production/wos`) lands here. Server Component: gates + reads org-scoped data
 * via the `listWorkOrders` Server Action (production.oee.read, the same read
 * permission the dashboard loader uses), then hands view-models + i18n labels to
 * the presentational <WoListScreen> which owns the client-side tab/search state.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no released WOs copy),
 * error (live read failed → banner, never a 500), permission-denied (forbidden →
 * denied panel, the page renders nothing privileged). Optimistic — N/A (read-only;
 * mutations are a follow-up lane).
 *
 * See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import { listWorkOrders, type WoListStatus } from '../_actions/list-work-orders';
import { getWoListActionContext } from '../_actions/get-wo-action-context';
import { buildWoModalLabels } from '../_actions/wo-modal-labels';
import {
  WoListScreen,
  type WoListActions,
  type WoListLabels,
} from './_components/wo-list-screen';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

function WoListSkeleton() {
  return (
    <div data-testid="wo-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-9 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
      <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function WoListContent({ locale }: { locale: string }) {
  const t = await getTranslations('production.wos');
  // 14-multi-site (CL4): topbar site picker cookie; null = All sites (no filter).
  const siteId = await getActiveSiteId();
  const result = await listWorkOrders({ siteId });

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="wo-list-denied"
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
        data-testid="wo-list-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const { rows, statusCounts } = result.data;

  const tabKeys: Array<'all' | WoListStatus> = [
    'all',
    'in_progress',
    'paused',
    'planned',
    'completed',
    'closed',
    'cancelled',
  ];
  const statusKeys: WoListStatus[] = [
    'planned',
    'in_progress',
    'paused',
    'completed',
    'closed',
    'cancelled',
  ];

  const labels: WoListLabels = {
    title: t('title'),
    countLine: t('countLine', { count: rows.length }),
    searchPlaceholder: t('searchPlaceholder'),
    rowsLabel: t('rowsLabel', { count: 0 }).replace('0', '{count}'),
    emptyAll: t('emptyAll'),
    emptyFiltered: t('emptyFiltered'),
    allergenBadge: t('allergenBadge'),
    deferredActionTitle: t('deferredActionTitle'),
    pauseAction: t('action.pause'),
    resumeAction: t('action.resume'),
    startAction: t('action.start'),
    viewAction: t('action.view'),
    tab: tabKeys.reduce(
      (acc, k) => {
        acc[k] = t(`tab.${k}`);
        return acc;
      },
      {} as Record<'all' | WoListStatus, string>,
    ),
    status: statusKeys.reduce(
      (acc, k) => {
        acc[k] = t(`status.${k}`);
        return acc;
      },
      {} as Record<WoListStatus, string>,
    ),
    col: {
      wo: t('col.wo'),
      product: t('col.product'),
      line: t('col.line'),
      status: t('col.status'),
      planned: t('col.planned'),
      progress: t('col.progress'),
      output: t('col.output'),
      schedule: t('col.schedule'),
      actions: t('col.actions'),
    },
  };

  // Org-level action affordances (RBAC + downtime categories) for the per-row
  // Start / Pause / Resume controls. A failed read just hides the row actions.
  const actionCtx = await getWoListActionContext();
  const at = await getTranslations('production.wos.actions');
  const actions: WoListActions | null = actionCtx.ok
    ? {
        locale,
        permissions: actionCtx.data.permissions,
        downtimeCategories: actionCtx.data.downtimeCategories,
        shifts: actionCtx.data.shifts,
        lines: actionCtx.data.lines,
        modalLabels: buildWoModalLabels((k) => at(k)),
      }
    : null;

  return (
    <WoListScreen
      rows={rows}
      statusCounts={statusCounts}
      labels={labels}
      actions={actions}
    />
  );
}

export default async function ProductionWoListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('production.wos');

  return (
    <main
      data-screen="production-wo-list"
      data-prototype-label="wo_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production') }, { label: t('breadcrumb.workOrders') }]}
      />
      <Suspense fallback={<WoListSkeleton />}>
        <WoListContent locale={locale} />
      </Suspense>
    </main>
  );
}
