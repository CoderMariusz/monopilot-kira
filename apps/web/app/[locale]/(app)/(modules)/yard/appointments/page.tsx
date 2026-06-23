/**
 * WAVE E5 — SCREEN /yard/appointments (mig 317 dock_appointments).
 *
 * A day/week appointment list with a "Book appointment" dialog. Overlap
 * rejection is enforced server-side (bookAppointment THROWS on overlap) and
 * surfaced inline in the dialog.
 *
 * Prototype anchor: NONE EXISTS (no yard/dock prototype). Spec-driven;
 * prototype_match=false, nearest pattern = planning/carriers list+dialog.
 *
 * Real data only: dock doors / carriers / appointments come from the org-scoped
 * yard + freight Server Actions (RBAC server-side, they THROW `forbidden`).
 *
 * UI states: loading, empty, error, permission-denied (list seam rejects →
 * denied note), optimistic (dialog pending → submit busy + disabled).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listAppointments, bookAppointment, listDockDoors } from '../_actions/yard-actions';
import { listCarriers } from '../../planning/_actions/freight-actions';
import { buildAppointmentsLabels } from '../_components/yard-labels';
import { AppointmentsView } from '../_components/appointments-view.client';
import type { CarrierOption, DockDoorRow } from '../_components/yard-shared';

export const dynamic = 'force-dynamic';

type AppointmentsPageProps = {
  params: Promise<{ locale: string }>;
};

async function loadDockDoors(): Promise<DockDoorRow[]> {
  try {
    return (await listDockDoors()).filter((d) => d.isActive);
  } catch {
    // The list view re-fetches appointments and surfaces forbidden/error itself;
    // an empty dock-door list just disables booking until docks exist.
    return [];
  }
}

async function loadCarriers(): Promise<CarrierOption[]> {
  try {
    return (await listCarriers())
      .filter((c) => c.isActive)
      .map((c) => ({ id: c.id, code: c.code, name: c.name }));
  } catch {
    return [];
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AppointmentsPage({ params }: AppointmentsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Yard');
  const [dockDoors, carriers] = await Promise.all([loadDockDoors(), loadCarriers()]);

  return (
    <main
      data-screen="yard-appointments"
      data-testid="yard-appointments-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('appointments.title')}
        subtitle={t('appointments.subtitle')}
        breadcrumb={[
          { label: t('board.breadcrumb'), href: `/${locale}/yard` },
          { label: t('appointments.breadcrumb') },
        ]}
      />
      <AppointmentsView
        labels={buildAppointmentsLabels(t)}
        dockDoors={dockDoors}
        carriers={carriers}
        listAppointmentsAction={listAppointments}
        bookAppointmentAction={bookAppointment}
        initialDate={todayIsoDate()}
      />
    </main>
  );
}
