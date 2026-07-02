/**
 * W8 — SCREEN /planning/schedule — Line schedule board RSC shell.
 *
 * Prototype anchor: prototypes/design/Monopilot Design System/planning/
 * gantt.jsx:1-160 (SCREEN-08 WO Gantt View). See
 * _components/schedule-board-view.tsx for the parity map + honest deltas
 * (no drag&drop, no sequencing optimizer, no changeover/allergen overlays).
 *
 * Reads the real board via getScheduleBoard (production_lines + work_orders,
 * org-scoped, statuses DRAFT/RELEASED/IN_PROGRESS over the next 7 days) and
 * injects rescheduleWorkOrder as the client seam. RBAC server-side:
 * scheduler.run.read (view) / npd.planning.write (reschedule).
 *
 * UI states: loading (Suspense skeleton), empty (no lines / no scheduled WOs),
 * error (read failed → banner, never a 500), permission-denied (denied panel).
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getScheduleBoard, rescheduleWorkOrder } from './_actions/schedule-board';
import { ScheduleBoardView, type ScheduleBoardLabels } from './_components/schedule-board-view';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type SchedulePageProps = {
  params: Promise<{ locale: string }>;
};

function BoardSkeleton() {
  return (
    <div data-testid="planning-schedule-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function BoardContent({ locale }: { locale: string }) {
  const t = await getTranslations('Planning');
  const result = await getScheduleBoard();

  if (!result.ok && result.error === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="planning-schedule-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('schedule.denied')}
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="planning-schedule-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('schedule.error')}
      </div>
    );
  }

  const labels: ScheduleBoardLabels = {
    linesCol: t('schedule.board.linesCol'),
    noLine: t('schedule.board.noLine'),
    emptyLines: t('schedule.board.emptyLines'),
    emptyScheduled: t('schedule.board.emptyScheduled'),
    legendConflict: t('schedule.legend.conflict'),
    legendOpenEnd: t('schedule.legend.openEnd'),
    status: {
      draft: t('woStatus.draft'),
      released: t('woStatus.released'),
      in_progress: t('woStatus.in_progress'),
    },
    unscheduledTitle: t('schedule.unscheduled.title'),
    unscheduledEmpty: t('schedule.unscheduled.empty'),
    scheduleCta: t('schedule.unscheduled.cta'),
    modal: {
      title: t('schedule.modal.title'),
      line: t('schedule.modal.line'),
      lineKeep: t('schedule.modal.lineKeep'),
      start: t('schedule.modal.start'),
      end: t('schedule.modal.end'),
      item: t('schedule.modal.item'),
      statusLabel: t('schedule.modal.statusLabel'),
      save: t('schedule.modal.save'),
      saving: t('schedule.modal.saving'),
      cancel: t('schedule.modal.cancel'),
      errors: {
        invalid_input: t('schedule.modal.errors.invalid_input'),
        invalid_range: t('schedule.modal.errors.invalid_range'),
        forbidden: t('schedule.modal.errors.forbidden'),
        not_found: t('schedule.modal.errors.not_found'),
        invalid_state: t('schedule.modal.errors.invalid_state'),
        invalid_line: t('schedule.modal.errors.invalid_line'),
        line_site_mismatch: t('schedule.modal.errors.line_site_mismatch'),
        dependency_cycle: t('schedule.modal.errors.dependency_cycle'),
        persistence_failed: t('schedule.modal.errors.persistence_failed'),
      },
    },
  };

  return (
    <ScheduleBoardView
      data={result.data}
      labels={labels}
      locale={locale}
      rescheduleAction={rescheduleWorkOrder}
    />
  );
}

export default async function PlanningSchedulePage({ params }: SchedulePageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning');

  return (
    <main
      data-screen="planning-schedule"
      data-prototype-label="plan_gantt"
      data-testid="planning-schedule-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('schedule.title')}
        subtitle={t('schedule.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('schedule.breadcrumb') },
        ]}
      />
      <Suspense fallback={<BoardSkeleton />}>
        <BoardContent locale={locale} />
      </Suspense>
    </main>
  );
}
