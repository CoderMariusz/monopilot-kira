/**
 * WH-017 — Reservations list route (/warehouse/reservations).
 *
 * Prototype parity (1:1):
 *   prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:202-295
 *     (WhReservations) — info note + reserved-LP table + per-row Release.
 *   prototypes/design/Monopilot Design System/warehouse/modals.jsx:879-924
 *     (ReleaseReservationModal) — release confirm modal (reason required).
 *   Per-region anchors + deviations live in
 *   reservations/_components/reservation-list.client.tsx.
 *
 * Data: the reviewed listReservations + releaseReservation actions (imported,
 * never authored), run inside withOrgContext (RLS-scoped). releaseReservation is
 * passed to the client island as a Server Action prop; RBAC for it
 * (warehouse.lp.reserve) is enforced server-side in the action and surfaces
 * `forbidden` inline in the modal. The read is RLS-scoped; a `forbidden` read
 * result renders the permission-denied panel.
 *
 * UI states: loading (Suspense skeleton), empty (in the client island), error
 * (failed read → banner), permission-denied (forbidden read → panel), optimistic
 * (Confirm release shows a pending state, then router.refresh drops the LP).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listReservations, releaseReservation } from '../_actions/reservation-actions';
import { getWhcTranslator } from '../wh-c-labels';
import { ReservationListClient, type ReservationListLabels } from './_components/reservation-list.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/movement-screens.jsx:202-295; modals.jsx:879-924';

function buildLabels(t: ReturnType<typeof getWhcTranslator>): ReservationListLabels {
  return {
    rowsLabel: t('reservations.rowsLabel'),
    infoNote: t('reservations.infoNote'),
    emptyAll: t('reservations.emptyAll'),
    release: t('reservations.release'),
    none: t('reservations.none'),
    status: {
      reserved: t('reservations.status.reserved'),
      available: t('reservations.status.available'),
      blocked: t('reservations.status.blocked'),
    },
    col: {
      lp: t('reservations.columns.lp'),
      item: t('reservations.columns.item'),
      reservedQty: t('reservations.columns.reservedQty'),
      lpTotal: t('reservations.columns.lpTotal'),
      wo: t('reservations.columns.wo'),
      status: t('reservations.columns.status'),
      actions: t('reservations.columns.actions'),
    },
    modal: {
      title: t('reservations.modal.title'),
      intro: t('reservations.modal.intro'),
      facts: {
        lp: t('reservations.modal.facts.lp'),
        wo: t('reservations.modal.facts.wo'),
        qty: t('reservations.modal.facts.qty'),
        item: t('reservations.modal.facts.item'),
      },
      reasonLabel: t('reservations.modal.reasonLabel'),
      reasonPlaceholder: t('reservations.modal.reasonPlaceholder'),
      reasons: {
        consumed: t('reservations.modal.reasons.consumed'),
        cancelled: t('reservations.modal.reasons.cancelled'),
        wo_cancelled: t('reservations.modal.reasons.wo_cancelled'),
        admin_override: t('reservations.modal.reasons.admin_override'),
      },
      overrideTextLabel: t('reservations.modal.overrideTextLabel'),
      overrideTextPlaceholder: t('reservations.modal.overrideTextPlaceholder'),
      overrideNote: t('reservations.modal.overrideNote'),
      cancel: t('reservations.modal.cancel'),
      confirm: t('reservations.modal.confirm'),
      releasing: t('reservations.modal.releasing'),
      denied: t('reservations.modal.denied'),
      notFound: t('reservations.modal.notFound'),
      errorLocked: t('reservations.modal.errorLocked'),
      error: t('reservations.modal.error'),
      success: t('reservations.modal.success'),
    },
  };
}

function ListSkeleton() {
  return (
    <div data-testid="reservation-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-14 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getWhcTranslator(locale);
  const result = await listReservations();

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="reservation-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('reservations.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="reservation-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('reservations.error')}
      </div>
    );
  }

  return (
    <ReservationListClient
      rows={result.data}
      labels={buildLabels(t)}
      locale={locale}
      releaseAction={releaseReservation}
    />
  );
}

export default async function ReservationsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getWhcTranslator(locale);

  return (
    <main
      data-screen="warehouse-reservation-list"
      data-prototype-label="reservations_list_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('reservations.title')}
        subtitle={t('reservations.subtitle')}
        breadcrumb={[
          { label: t('reservations.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('reservations.breadcrumb.reservations') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
