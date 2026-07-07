/**
 * 13-MAINTENANCE — /maintenance module landing = MWO list + PM schedule list
 * (Wave-8 lane CL1, first vertical; replaces the Wave-0 ModuleStubNotice).
 *
 * Prototype parity (1:1 within slice scope):
 *   prototypes/design/Monopilot Design System/maintenance/work-orders.jsx:48-238
 *   (MntMWOList — status tabs + search + dense table + per-status row action),
 *   modals.jsx:186-233 (MwoCreateModal), pm-schedules.jsx:3-277 (PM list view).
 *   Documented deviations live in _components/mwo-list.client.tsx.
 *
 * Data: live Supabase via the mwo-actions Server Actions, each inside ONE
 * withOrgContext txn (RLS org-scoped, migration 201 policies). RBAC resolved
 * server-side (mnt.* family, migration 202 seed — FIRST enforcement point);
 * the client island receives plain booleans and the actions re-check anyway.
 *
 * UI states: loading (Suspense skeleton), empty + empty-filtered (client),
 * error (banner, never a 500), permission-denied (panel).
 */
import { Suspense } from 'react';
import Link from 'next/link';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  createMwo,
  generateMwoFromPmSchedule,
  getMwoPermissions,
  getMwoOverviewStats,
  listEquipmentForMwo,
  listMwos,
  listPmSchedules,
  transitionMwo,
} from './_actions/mwo-actions';
import { getMaintenanceTranslator, type MaintenanceTranslator } from './maintenance-labels';
import { buildMwoListLabels } from './_components/mwo-detail-labels';
import { MwoListScreen, type MwoListLabels } from './_components/mwo-list.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/maintenance/work-orders.jsx:48-238';

function ListSkeleton() {
  return (
    <div data-testid="mwo-list-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-9 w-64 animate-pulse rounded-lg bg-slate-100" />
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

export function buildLabels(t: MaintenanceTranslator): MwoListLabels {
  return buildMwoListLabels(t);
}

async function ListContent({ locale }: { locale: string }) {
  const t = getMaintenanceTranslator(locale);

  const [mwoResult, permissions, overviewStats] = await Promise.all([
    listMwos(),
    getMwoPermissions(),
    getMwoOverviewStats(),
  ]);

  if (!mwoResult.ok) {
    if (mwoResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="mwo-list-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('list.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="mwo-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  // Secondary reads — non-fatal: an empty equipment list degrades the create
  // modal to its honest "no equipment" notice; PM list shows its empty state.
  const [equipmentResult, pmResult] = await Promise.all([listEquipmentForMwo(), listPmSchedules()]);
  const equipment = equipmentResult.ok ? equipmentResult.data : [];
  const pmSchedules = pmResult.ok ? pmResult.data : [];

  const { rows, statusCounts } = mwoResult.data;
  const labels = buildLabels(t);
  labels.countLine = t('list.countLine', {
    total: rows.length,
    open: statusCounts.open,
    inProgress: statusCounts.in_progress,
  });

  return (
    <MwoListScreen
      rows={rows}
      statusCounts={statusCounts}
      overviewStats={overviewStats}
      pmSchedules={pmSchedules}
      equipment={equipment}
      labels={labels}
      permissions={{
        canCreate: permissions.canCreate,
        canExecute: permissions.canExecute,
        canCancel: permissions.canCancel,
      }}
      createMwoAction={createMwo}
      generateMwoFromPmScheduleAction={generateMwoFromPmSchedule}
      transitionMwoAction={transitionMwo}
    />
  );
}

export default async function MaintenancePage({ params }: PageProps) {
  const { locale } = await params;
  const t = getMaintenanceTranslator(locale);

  return (
    <main
      data-screen="maintenance-mwos-list"
      data-prototype-label="mwo_list"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.maintenance'), href: `/${locale}/maintenance` },
          { label: t('list.title') },
        ]}
      />
      <nav aria-label="Maintenance navigation">
        <Link
          href={`/${locale}/maintenance/calibration`}
          prefetch={false}
          className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Calibration
        </Link>
      </nav>
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
