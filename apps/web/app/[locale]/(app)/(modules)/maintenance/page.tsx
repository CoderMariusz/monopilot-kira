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

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  createMwo,
  getMwoPermissions,
  listMachinesForMwo,
  listMwos,
  listPmSchedules,
  transitionMwo,
} from './_actions/mwo-actions';
import { getMaintenanceTranslator, type MaintenanceTranslator } from './maintenance-labels';
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

function buildLabels(t: MaintenanceTranslator): MwoListLabels {
  return {
    countLine: '', // overwritten with live counts in ListContent
    searchPlaceholder: t('list.searchPlaceholder'),
    rowsLabel: t('list.rows'),
    emptyAll: t('list.empty'),
    emptyFiltered: t('list.emptyFiltered'),
    viewWorkOrders: t('view.workOrders'),
    viewPmSchedules: t('view.pmSchedules'),
    tab: {
      all: t('tabs.all'),
      requested: t('tabs.requested'),
      approved: t('tabs.approved'),
      open: t('tabs.open'),
      in_progress: t('tabs.in_progress'),
      completed: t('tabs.completed'),
      cancelled: t('tabs.cancelled'),
    },
    status: {
      requested: t('status.requested'),
      approved: t('status.approved'),
      open: t('status.open'),
      in_progress: t('status.in_progress'),
      completed: t('status.completed'),
      cancelled: t('status.cancelled'),
    },
    priority: {
      low: t('priority.low'),
      medium: t('priority.medium'),
      high: t('priority.high'),
      critical: t('priority.critical'),
    },
    source: {
      manual_request: t('source.manual_request'),
      auto_downtime: t('source.auto_downtime'),
      pm_schedule: t('source.pm_schedule'),
      oee_trigger: t('source.oee_trigger'),
      calibration_alert: t('source.calibration_alert'),
    },
    overdue: t('actions.overdue'),
    col: {
      mwo: t('col.mwo'),
      machine: t('col.machine'),
      title: t('col.title'),
      priority: t('col.priority'),
      status: t('col.status'),
      source: t('col.source'),
      due: t('col.due'),
      created: t('col.created'),
      actions: t('col.actions'),
    },
    action: {
      start: t('actions.start'),
      complete: t('actions.complete'),
      cancel: t('actions.cancel'),
    },
    create: {
      button: t('create.button'),
      title: t('create.title'),
      machine: t('create.machine'),
      machinePlaceholder: t('create.machinePlaceholder'),
      noMachines: t('create.noMachines'),
      titleField: t('create.titleField'),
      titlePlaceholder: t('create.titlePlaceholder'),
      description: t('create.description'),
      descriptionPlaceholder: t('create.descriptionPlaceholder'),
      priority: t('create.priority'),
      dueDate: t('create.dueDate'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errorRequired: t('create.errorRequired'),
      errorFailed: t('create.errorFailed'),
    },
    transition: {
      startTitle: t('transition.startTitle'),
      completeTitle: t('transition.completeTitle'),
      cancelTitle: t('transition.cancelTitle'),
      noteComplete: t('transition.noteComplete'),
      noteCancel: t('transition.noteCancel'),
      confirmStart: t('transition.confirmStart'),
      confirmComplete: t('transition.confirmComplete'),
      confirmCancel: t('transition.confirmCancel'),
      dismiss: t('transition.dismiss'),
      errorFailed: t('transition.errorFailed'),
      errorIllegal: t('transition.errorIllegal'),
      errorForbidden: t('transition.errorForbidden'),
    },
    pm: {
      title: t('pm.title'),
      empty: t('pm.empty'),
      col: {
        equipment: t('pm.col.equipment'),
        type: t('pm.col.type'),
        interval: t('pm.col.interval'),
        nextDue: t('pm.col.nextDue'),
        lastCompleted: t('pm.col.lastCompleted'),
        active: t('pm.col.active'),
      },
      type: {
        preventive: t('pm.type.preventive'),
        calibration: t('pm.type.calibration'),
        sanitation: t('pm.type.sanitation'),
        inspection: t('pm.type.inspection'),
      },
      intervalUnit: {
        calendar_days: t('pm.intervalUnit.calendar_days'),
        usage_hours: t('pm.intervalUnit.usage_hours'),
        usage_cycles: t('pm.intervalUnit.usage_cycles'),
      },
      activeYes: t('pm.activeYes'),
      activeNo: t('pm.activeNo'),
    },
  };
}

async function ListContent({ locale }: { locale: string }) {
  const t = getMaintenanceTranslator(locale);

  const [mwoResult, permissions] = await Promise.all([listMwos(), getMwoPermissions()]);

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

  // Secondary reads — non-fatal: an empty machines list degrades the create
  // modal to its honest "no machines" notice; PM list shows its empty state.
  const [machinesResult, pmResult] = await Promise.all([listMachinesForMwo(), listPmSchedules()]);
  const machines = machinesResult.ok ? machinesResult.data : [];
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
      pmSchedules={pmSchedules}
      machines={machines}
      labels={labels}
      permissions={{
        canCreate: permissions.canCreate,
        canExecute: permissions.canExecute,
        canCancel: permissions.canCancel,
      }}
      createMwoAction={createMwo}
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
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
