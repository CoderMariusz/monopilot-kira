/**
 * F4 / P1-16 — SCREEN /scheduler/runs — historical scheduler run list.
 * Spec-driven read UI over persisted scheduler_runs (+ assignment counts).
 * No dedicated prototype for this history screen; conventions follow MRP run history.
 */
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listSchedulerRuns } from './_actions/runs-loaders';
import { RunsList, type RunsListLabels } from './_components/runs-list';
import { SchedulerSectionNav } from './_components/scheduler-section-nav';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SchedulerRunsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Scheduler.runs');
  const tRoot = await getTranslations('Scheduler');
  // Close over next-intl Translator — avoids TS2345 on a string-keyed helper param.
  const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const result = await listSchedulerRuns();

  let body: ReactNode;
  if (!result.ok && result.error === 'forbidden') {
    body = (
      <div
        role="note"
        data-testid="scheduler-runs-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {opt('denied', 'You do not have permission to view scheduler runs.')}
      </div>
    );
  } else if (!result.ok) {
    body = (
      <div
        role="alert"
        data-testid="scheduler-runs-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {opt('loadError', 'Could not load scheduler runs. Try again.')}
      </div>
    );
  } else {
    const labels: RunsListLabels = {
      empty: opt('empty', 'No scheduler runs yet'),
      emptyHint: opt(
        'emptyHint',
        'Run the scheduler from the board to create a draft proposal. Completed runs appear here.',
      ),
      columns: {
        when: opt('columns.when', 'When'),
        status: opt('columns.status', 'Status'),
        lines: opt('columns.lines', 'Line(s)'),
        assignments: opt('columns.assignments', 'Assignments'),
        horizon: opt('columns.horizon', 'Horizon'),
        actions: opt('columns.actions', 'Actions'),
      },
      allLines: opt('allLines', 'All lines'),
      applied: opt('applied', 'Applied'),
      viewAssignments: opt('viewAssignments', 'View assignments'),
      openOnBoard: opt('openOnBoard', 'Open on board'),
      horizonDays: (n) =>
        t.has('horizonDays') ? t('horizonDays', { n }) : `${n} days`,
      counts: (total, draft, approved) =>
        t.has('counts')
          ? t('counts', { total, draft, approved })
          : `${total} total · ${draft} draft · ${approved} approved`,
    };
    body = <RunsList locale={locale} runs={result.runs} labels={labels} />;
  }

  return (
    <main
      data-screen="scheduler-runs"
      data-testid="scheduler-runs-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={opt('title', 'Scheduler runs')}
        subtitle={opt('subtitle', 'History of draft and applied schedule proposals.')}
        breadcrumb={[
          {
            label: tRoot.has('breadcrumb.scheduler')
              ? tRoot('breadcrumb.scheduler')
              : 'Scheduler',
            href: `/${locale}/scheduler`,
          },
          { label: opt('breadcrumb', 'Runs') },
        ]}
      />
      <SchedulerSectionNav locale={locale} active="runs" />
      {body}
    </main>
  );
}
