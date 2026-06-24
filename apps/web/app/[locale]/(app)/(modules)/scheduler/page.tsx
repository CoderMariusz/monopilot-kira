/**
 * Wave E8 — SCREEN /scheduler — changeover-aware sequencing board.
 *
 * Replaces the ModuleStubNotice stub. Spec-driven UI extending the planning
 * schedule-board conventions; prototype parity anchor:
 *   prototypes/design/Monopilot Design System/planning-ext/sequencing-screens.jsx:1-179
 *     (run/preview control + per-line proposed sequence + changeover cost summary).
 *
 * The page gates read access (scheduler.run.read) and supplies display label
 * maps; the proposal is generated on demand by the client island via the
 * backend-owned runScheduler Server Action and applied (explicit confirm) via
 * applySchedule. RBAC is enforced server-side inside both the loader and the
 * actions — the client is never trusted.
 *
 * UI states: loading (Suspense skeleton), permission-denied (denied panel),
 * error (loader failed → banner, never a 500), empty (no run yet → board's idle
 * state), optimistic (run/apply pending handled in the island).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { runScheduler, applySchedule } from './_actions/scheduler-actions';
import { loadSchedulerAccess } from './_lib/scheduler-labels';
import { SchedulerBoardView, type SchedulerBoardLabels } from './_components/scheduler-board-view';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type SchedulerPageProps = {
  params: Promise<{ locale: string }>;
};

function BoardSkeleton() {
  return (
    <div data-testid="scheduler-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function BoardContent({ locale }: { locale: string }) {
  const t = await getTranslations('Scheduler');
  const access = await loadSchedulerAccess();

  if (!access.ok && access.error === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="scheduler-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }

  if (!access.ok) {
    return (
      <div
        role="alert"
        data-testid="scheduler-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('loadError')}
      </div>
    );
  }

  const labels: SchedulerBoardLabels = {
    run: {
      title: t('run.title'),
      horizon: t('run.horizon'),
      horizonDays: t('run.horizonDays'),
      button: t('run.button'),
      running: t('run.running'),
    },
    board: {
      proposedTitle: t('board.proposedTitle'),
      sequenceCol: t('board.sequenceCol'),
      woCol: t('board.woCol'),
      plannedStart: t('board.plannedStart'),
      profileCol: t('board.profileCol'),
      changeover: t('board.changeover'),
      totalCost: t('board.totalCost'),
      empty: t('board.empty'),
      emptyHint: t('board.emptyHint'),
      noAssignments: t('board.noAssignments'),
      appliedBadge: t('board.appliedBadge'),
    },
    apply: {
      button: t('apply.button'),
      applying: t('apply.applying'),
      confirmTitle: t('apply.confirmTitle'),
      confirmBody: t('apply.confirmBody'),
      confirm: t('apply.confirm'),
      cancel: t('apply.cancel'),
    },
    errors: {
      invalid_input: t('errors.invalid_input'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };

  return (
    <SchedulerBoardView
      labels={labels}
      locale={locale}
      runAction={runScheduler}
      applyAction={applySchedule}
      labelMaps={access.labelMaps}
    />
  );
}

export default async function SchedulerPage({ params }: SchedulerPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Scheduler');

  return (
    <main
      data-screen="scheduler"
      data-testid="scheduler-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.scheduler') }]}
        actions={
          <Link
            href={`/${locale}/scheduler/changeover-matrix`}
            data-testid="scheduler-matrix-link"
            className="btn"
          >
            {t('matrixLink')}
          </Link>
        }
      />
      <Suspense fallback={<BoardSkeleton />}>
        <BoardContent locale={locale} />
      </Suspense>
    </main>
  );
}
