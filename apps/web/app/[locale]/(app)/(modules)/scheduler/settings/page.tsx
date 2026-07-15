/**
 * F4 / P1-16 — SCREEN /scheduler/settings — read-only solver params.
 * Shift calendars are owned by another lane — not shown here.
 */
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { SchedulerSectionNav } from '../runs/_components/scheduler-section-nav';
import { loadSchedulerSettings } from './_actions/settings-loaders';
import { SettingsView, type SettingsViewLabels } from './_components/settings-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SchedulerSettingsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('Scheduler.settings');
  const tRoot = await getTranslations('Scheduler');
  // Close over next-intl Translator — avoids TS2345 on a string-keyed helper param.
  const opt = (key: string, fallback: string): string => (t.has(key) ? t(key) : fallback);
  const result = await loadSchedulerSettings();

  let body: ReactNode;
  if (!result.ok && result.error === 'forbidden') {
    body = (
      <div
        role="note"
        data-testid="scheduler-settings-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {opt('denied', 'You do not have permission to view scheduler settings.')}
      </div>
    );
  } else if (!result.ok) {
    body = (
      <div
        role="alert"
        data-testid="scheduler-settings-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {opt('loadError', 'Could not load scheduler settings. Try again.')}
      </div>
    );
  } else {
    const labels: SettingsViewLabels = {
      defaultsNote: opt(
        'defaultsNote',
        'No scheduler_config rows for this organisation yet. Showing the solver defaults used when a run is dispatched (read-only).',
      ),
      readOnlyNote: opt(
        'readOnlyNote',
        'Solver parameters are shown read-only. Shift calendars are managed separately.',
      ),
      scopeOrg: opt('scopeOrg', 'Organisation default'),
      scopeLine: opt('scopeLine', 'Line override'),
      scopeDefaults: opt('scopeDefaults', 'Built-in defaults'),
      yes: opt('yes', 'Yes'),
      no: opt('no', 'No'),
      fields: {
        scope: opt('fields.scope', 'Scope'),
        horizon: opt('fields.horizon', 'Default horizon'),
        strategy: opt('fields.strategy', 'Sequencing strategy'),
        optimizer: opt('fields.optimizer', 'Optimizer version'),
        capacity: opt('fields.capacity', 'Capacity hours / day'),
        changeoverWeight: opt('fields.changeoverWeight', 'Changeover weight'),
        duedateWeight: opt('fields.duedateWeight', 'Due-date weight'),
        utilizationWeight: opt('fields.utilizationWeight', 'Utilisation weight'),
        respectPm: opt('fields.respectPm', 'Respect PM windows'),
        alternateRoutings: opt('fields.alternateRoutings', 'Allow alternate routings'),
      },
    };
    body = (
      <SettingsView
        rows={result.rows}
        showingDefaultsOnly={result.showingDefaultsOnly}
        labels={labels}
      />
    );
  }

  return (
    <main
      data-screen="scheduler-settings"
      data-testid="scheduler-settings-page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={opt('title', 'Scheduler settings')}
        subtitle={opt(
          'subtitle',
          'Solver parameters used when building a schedule proposal.',
        )}
        breadcrumb={[
          {
            label: tRoot.has('breadcrumb.scheduler')
              ? tRoot('breadcrumb.scheduler')
              : 'Scheduler',
            href: `/${locale}/scheduler`,
          },
          { label: opt('breadcrumb', 'Settings') },
        ]}
      />
      <SchedulerSectionNav locale={locale} active="settings" />
      {body}
    </main>
  );
}
