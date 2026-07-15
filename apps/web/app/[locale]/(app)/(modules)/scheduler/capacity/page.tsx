/**
 * F4 / P1-16 — SCREEN /scheduler/capacity — read-only line/day utilisation.
 */
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { SchedulerSectionNav } from '../runs/_components/scheduler-section-nav';
import { loadSchedulerCapacity } from './_actions/capacity-loaders';
import { CapacityView, type CapacityViewLabels } from './_components/capacity-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SchedulerCapacityPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Scheduler.capacity');
  const tRoot = await getTranslations('Scheduler');
  // Close over next-intl Translator — avoids TS2345 on a string-keyed helper param.
  const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const result = await loadSchedulerCapacity();

  let body: ReactNode;
  if (!result.ok && result.error === 'forbidden') {
    body = (
      <div
        role="note"
        data-testid="scheduler-capacity-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {opt('denied', 'You do not have permission to view scheduler capacity.')}
      </div>
    );
  } else if (!result.ok) {
    body = (
      <div
        role="alert"
        data-testid="scheduler-capacity-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {opt('loadError', 'Could not load capacity. Try again.')}
      </div>
    );
  } else {
    const dayKeys = result.lines[0]?.days.map((d) => d.day) ?? [];
    const labels: CapacityViewLabels = {
      empty: opt('empty', 'No production lines configured'),
      emptyHint: opt(
        'emptyHint',
        'Add production lines in Settings to see capacity utilisation.',
      ),
      horizonNote: '',
      legendWo: opt('legendWo', 'WO = released / in-progress scheduled hours'),
      legendDraft: opt('legendDraft', 'draft = unapplied scheduler assignments'),
      noCap: opt('noCap', 'No daily cap'),
      hours: (n) => (t.has('hours') ? t('hours', { n }) : `${n}h`),
      util: (pct) => (t.has('util') ? t('util', { pct }) : `${pct}%`),
    };
    const horizonNote = t.has('horizonNote')
      ? t('horizonNote', { days: result.horizonDays })
      : `Horizon: next ${result.horizonDays} days (UTC) · occupancy from released/in-progress WOs + draft assignments.`;
    body = (
      <CapacityView
        lines={result.lines}
        dayKeys={dayKeys}
        horizonNote={horizonNote}
        labels={labels}
      />
    );
  }

  return (
    <main
      data-screen="scheduler-capacity"
      data-testid="scheduler-capacity-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={opt('title', 'Line capacity')}
        subtitle={opt(
          'subtitle',
          'Read-only utilisation of production lines over the planning horizon.',
        )}
        breadcrumb={[
          {
            label: tRoot.has('breadcrumb.scheduler')
              ? tRoot('breadcrumb.scheduler')
              : 'Scheduler',
            href: `/${locale}/scheduler`,
          },
          { label: opt('breadcrumb', 'Capacity') },
        ]}
      />
      <SchedulerSectionNav locale={locale} active="capacity" />
      {body}
    </main>
  );
}
