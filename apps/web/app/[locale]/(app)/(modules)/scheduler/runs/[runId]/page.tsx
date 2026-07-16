/**
 * F4 / P1-16 — SCREEN /scheduler/runs/[runId] — assignment detail for one run.
 */
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getSchedulerRunDetail } from '../_actions/runs-loaders';
import { overrideSchedulerAssignment } from '../../_actions/scheduler-actions';
import { loadSchedulerOverrideAccess } from '../../_lib/scheduler-labels';
import { RunDetail, type RunDetailLabels } from '../_components/run-detail';
import { SchedulerSectionNav } from '../_components/scheduler-section-nav';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; runId: string }>;
};

export default async function SchedulerRunDetailPage({ params }: PageProps) {
  const { locale, runId } = await params;
  const t = await getTranslations('Scheduler.runs');
  const tRoot = await getTranslations('Scheduler');
  // Close over next-intl Translator — avoids TS2345 on a string-keyed helper param.
  const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const result = await getSchedulerRunDetail(runId);

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
  } else if (!result.ok && result.error === 'not_found') {
    body = (
      <div
        role="alert"
        data-testid="scheduler-run-detail-not-found"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {opt('notFound', 'This scheduler run could not be found.')}
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
    const overrideAccess = await loadSchedulerOverrideAccess();
    const overrideLines = overrideAccess.ok ? overrideAccess.lines : [];
    const canOverride = overrideAccess.ok ? overrideAccess.canOverride : false;

    const labels: RunDetailLabels = {
      backToRuns: opt('backToRuns', '← All runs'),
      openOnBoard: opt('openOnBoard', 'Open on board'),
      applied: opt('applied', 'Applied'),
      allLines: opt('allLines', 'All lines'),
      emptyAssignments: opt('emptyAssignments', 'This run has no assignments.'),
      meta: {
        status: opt('columns.status', 'Status'),
        horizon: opt('columns.horizon', 'Horizon'),
        lines: opt('columns.lines', 'Line(s)'),
        when: opt('columns.when', 'When'),
        optimizer: opt('optimizer', 'Optimizer'),
      },
      assignments: {
        columns: {
          sequence: opt('detail.sequence', 'Seq'),
          wo: opt('detail.wo', 'Work order'),
          line: opt('detail.line', 'Line'),
          start: opt('detail.start', 'Planned start'),
          end: opt('detail.end', 'Planned end'),
          changeover: opt('detail.changeover', 'Changeover (min)'),
          status: opt('columns.status', 'Status'),
          actions: opt('detail.actions', 'Actions'),
        },
        override: opt('detail.override', 'Override'),
        overrideModal: {
          title: opt('override.title', 'Override assignment — {wo}'),
          currentLine: opt('override.currentLine', 'Current line'),
          currentStart: opt('override.currentStart', 'Current planned start'),
          newLine: opt('override.newLine', 'New line'),
          newStart: opt('override.newStart', 'New planned start'),
          reasonCode: opt('override.reasonCode', 'Reason code'),
          reasonNotes: opt('override.reasonNotes', 'Notes (optional)'),
          selectReason: opt('override.selectReason', '— Select reason —'),
          cancel: opt('override.cancel', 'Cancel'),
          confirm: opt('override.confirm', 'Confirm override'),
          saving: opt('override.saving', 'Saving…'),
          reasonOptions: {
            customer_priority: opt('override.reasons.customer_priority', 'Customer delivery deadline'),
            material_shortage: opt('override.reasons.material_shortage', 'Material not available'),
            line_maintenance: opt('override.reasons.line_maintenance', 'Line maintenance conflict'),
            capacity_constraint: opt('override.reasons.capacity_constraint', 'Capacity re-allocation'),
            planner_judgement: opt('override.reasons.planner_judgement', 'Professional judgement'),
            other: opt('override.reasons.other', 'Other'),
          },
          errors: {
            invalid_input: opt('override.errors.invalid_input', 'Complete all required fields.'),
            forbidden: opt('override.errors.forbidden', 'You do not have permission to override assignments.'),
            not_found: opt('override.errors.not_found', 'This assignment could not be found.'),
            run_already_applied: opt(
              'override.errors.run_already_applied',
              'This run was already applied — overrides are no longer allowed.',
            ),
            persistence_failed: opt('override.errors.persistence_failed', 'Something went wrong. Please try again.'),
          },
        },
      },
      horizonDays: (n) =>
        t.has('horizonDays') ? t('horizonDays', { n }) : `${n} days`,
    };
    body = (
      <RunDetail
        locale={locale}
        run={result.run}
        assignments={result.assignments}
        labels={labels}
        canOverride={canOverride}
        lines={overrideLines}
        overrideAction={canOverride ? overrideSchedulerAssignment : undefined}
      />
    );
  }

  return (
    <main
      data-screen="scheduler-run-detail"
      data-testid="scheduler-run-detail-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={opt('detailTitle', 'Run assignments')}
        subtitle={opt('detailSubtitle', 'Proposed sequence for this scheduler run.')}
        breadcrumb={[
          {
            label: tRoot.has('breadcrumb.scheduler')
              ? tRoot('breadcrumb.scheduler')
              : 'Scheduler',
            href: `/${locale}/scheduler`,
          },
          {
            label: opt('breadcrumb', 'Runs'),
            href: `/${locale}/scheduler/runs`,
          },
          { label: runId.slice(0, 8) },
        ]}
      />
      <SchedulerSectionNav locale={locale} active="runs" />
      {body}
    </main>
  );
}
