/**
 * WAVE E5 — SCREEN /yard (the YARD BOARD, mig 317 yard tables).
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * contains no yard/dock/weighbridge screen (verified: zero matches across all
 * prototype module folders). Presentation follows the locked MON-design-system
 * conventions reused from sibling list+dialog screens (PageHeader + card/table/
 * badge/empty-state + @monopilot/ui Modal forms), so prototype_match = false
 * (spec-driven; nearest pattern = planning/carriers).
 *
 * Real data only: appointments / yard-visits / gate-in-out / weighing go through
 * the org-scoped yard Server Actions (mig 317). RBAC is enforced server-side
 * inside those actions (they THROW `forbidden`); the board maps that to the
 * permission-denied state. Carriers for the gate-in picker come from the live
 * freight master (listCarriers).
 *
 * Desktop yard context — @monopilot/ui Select is used for the pickers (the
 * raw-<select> red-line applies only to the scanner).
 *
 * UI states: loading (client board shows its loading note), empty (no
 * appointments / no on-site vehicles → empty copy), error (action throws → red
 * alert), permission-denied (forbidden → amber note), optimistic (gate-out /
 * gate-in / weigh show pending + disabled while the action runs).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listAppointments, listYardVisits, gateIn, gateOut, recordWeighing } from './_actions/yard-actions';
import { listCarriers } from '../planning/_actions/freight-actions';
import { YardBoard } from './_components/yard-board.client';
import type { AppointmentRow, CarrierOption } from './_components/yard-shared';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type YardPageProps = {
  params: Promise<{ locale: string }>;
};

/** Today's [00:00, 24:00) UTC window for the board's appointment list. */
function todayWindow(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * Server Action seam bound to today's window — the client only knows "list
 * today's appointments", the page owns the date math. Marked 'use server' so it
 * is serializable across the RSC boundary.
 */
async function listAppointmentsToday(): Promise<AppointmentRow[]> {
  'use server';
  const { from, to } = todayWindow();
  return listAppointments({ from, to });
}

async function loadCarriers(): Promise<CarrierOption[]> {
  try {
    const rows = await listCarriers();
    return rows
      .filter((c) => c.isActive)
      .map((c) => ({ id: c.id, code: c.code, name: c.name }));
  } catch {
    // Carriers are optional for gate-in (manual gate-in works without one); a
    // freight-read failure must not break the board.
    return [];
  }
}

export default async function YardBoardPage({ params }: YardPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Yard');
  const carriers = await loadCarriers();

  return (
    <main
      data-screen="yard-board"
      data-testid="yard-board-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('board.title')}
        subtitle={t('board.subtitle')}
        breadcrumb={[
          { label: t('board.warehouse'), href: `/${locale}/warehouse` },
          { label: t('board.breadcrumb') },
        ]}
        actions={
          <div className="flex gap-2">
            <a
              href={`/${locale}/yard/appointments`}
              data-testid="yard-link-appointments"
              className="btn btn--secondary btn-sm"
            >
              {t('board.appointmentsLink')}
            </a>
            <a
              href={`/${locale}/yard/weighbridge`}
              data-testid="yard-link-weighbridge"
              className="btn btn--secondary btn-sm"
            >
              {t('board.weighbridgeLink')}
            </a>
          </div>
        }
      />
      <YardBoard
        listAppointmentsTodayAction={listAppointmentsToday}
        listYardVisitsAction={listYardVisits}
        gateInAction={gateIn}
        gateOutAction={gateOut}
        recordWeighingAction={recordWeighing}
        carriers={carriers}
      />
    </main>
  );
}
