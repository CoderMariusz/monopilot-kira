/**
 * 08-Production — Downtime sub-page (read-only).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
 *   other-screens.jsx:126-217 (DowntimeScreen). Structural correspondence:
 *     page-head "Production · Downtime" + summary line   → other-screens.jsx:130-142
 *     KPI summary (events · total · open)                → other-screens.jsx:134 + 172-183
 *     Downtime Pareto — categories                       → other-screens.jsx:145-171
 *     Event log table                                    → other-screens.jsx:186-211
 *
 * The prototype's DOWNTIME / PARETO mock arrays are replaced 1:1 with real Supabase
 * reads (downtime_events ⋈ downtime_categories — the same reference table the WO pause
 * endpoint references — ⋈ work_orders ⋈ users) via withOrgContext, RLS-scoped, no mocks.
 * Read-only here: the prototype "Log downtime" action is owned by the WO pause flow.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no events copy), error
 * (failed read → banner), permission-denied (production.oee.read gated → denied panel),
 * optimistic — N/A (read-only).
 *
 * See `_meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md`.
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import { DateWindowSelect, type DateWindowOption } from '../_components/date-window-select.client';
import { ParetoBars, type ParetoBar, type ParetoTone } from '../_components/pareto-bars';
import {
  getDowntimeScreen,
  type DowntimeKind,
  type DowntimeParetoRow,
} from './_actions/downtime-data';
import { DowntimeTable, type DowntimeTableLabels } from './_components/downtime-table';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<{ days?: string }>;
};

function parseWindowDays(value: string | undefined): number {
  const days = Number(value);
  return [1, 7, 30, 90].includes(days) ? days : 1;
}

async function buildDateWindowOptions(): Promise<{ ariaLabel: string; options: DateWindowOption[] }> {
  const t = await getTranslations('production.dateWindow');
  return {
    ariaLabel: t('ariaLabel'),
    options: [
      { value: '1', label: t('today') },
      { value: '7', label: t('days7') },
      { value: '30', label: t('days30') },
      { value: '90', label: t('days90') },
    ],
  };
}

function kindTone(kind: DowntimeKind | null): ParetoTone {
  if (kind === 'unplanned') return 'plant';
  if (kind === 'changeover') return 'process';
  if (kind === 'planned') return 'people';
  return 'neutral';
}

function DowntimeSkeleton() {
  return (
    <div data-testid="production-downtime-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function DowntimeContent({ windowDays }: { windowDays: number }) {
  const t = await getTranslations('production.downtime');
  const locale = await getLocale();
  const result = await getDowntimeScreen(windowDays);

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="production-downtime-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="production-downtime-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('error')}
      </div>
    );
  }

  const data = result.data;
  const hours = Math.floor(data.totalMin / 60);
  const mins = data.totalMin % 60;

  const dtf = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const paretoBars: ParetoBar[] = data.pareto.map((p: DowntimeParetoRow, i) => ({
    key: `${p.categoryName ?? 'uncat'}-${i}`,
    label: p.categoryName ?? t('table.uncategorized'),
    value: p.totalMin,
    valueLabel: t('paretoMin', { min: p.totalMin }),
    countLabel: t('paretoEvents', { count: p.events }),
    tone: kindTone(p.categoryKind),
  }));

  const tableLabels: DowntimeTableLabels = {
    title: t('eventLog'),
    empty: t('table.empty'),
    open: t('table.open'),
    uncategorized: t('table.uncategorized'),
    col: {
      started: t('table.col.started'),
      line: t('table.col.line'),
      shift: t('table.col.shift'),
      wo: t('table.col.wo'),
      category: t('table.col.category'),
      reason: t('table.col.reason'),
      operator: t('table.col.operator'),
      duration: t('table.col.duration'),
      source: t('table.col.source'),
    },
    kind: {
      planned: t('kind.planned'),
      unplanned: t('kind.unplanned'),
      changeover: t('kind.changeover'),
    },
    source: {
      manual: t('source.manual'),
      wo_pause: t('source.wo_pause'),
      plc_auto: t('source.plc_auto'),
      changeover: t('source.changeover'),
    },
    durationFmt: (min) => t('table.minutes', { min }),
    dateFmt: (iso) => dtf.format(new Date(iso)),
  };

  return (
    <div className="flex flex-col gap-6">
      <p data-testid="production-downtime-summary" className="text-sm text-slate-500">
        {t('summary', { events: data.eventCount, hours, mins })}
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card data-testid="production-downtime-kpi-events" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.events')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{data.eventCount}</div>
        </Card>
        <Card data-testid="production-downtime-kpi-total" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.total')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{t('hoursMins', { hours, mins })}</div>
        </Card>
        <Card
          data-testid="production-downtime-kpi-open"
          data-tone={data.openCount > 0 ? 'danger' : 'default'}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.open')}</div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${data.openCount > 0 ? 'text-red-600' : 'text-slate-900'}`}
          >
            {data.openCount}
          </div>
        </Card>
      </div>

      <Card className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('paretoTitle')}</h2>
        {paretoBars.length === 0 ? (
          <p data-testid="production-downtime-pareto-empty" className="py-4 text-sm text-slate-500">
            {t('paretoEmpty')}
          </p>
        ) : (
          <ParetoBars bars={paretoBars} testid="production-downtime-pareto" />
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('eventLog')}</h2>
        <DowntimeTable rows={data.events} labels={tableLabels} />
      </section>
    </div>
  );
}

export default async function DowntimePage({ searchParams }: PageProps) {
  const locale = await getLocale();
  const t = await getTranslations('production.downtime');
  const sp: { days?: string } = searchParams ? await searchParams : {};
  const windowDays = parseWindowDays(sp.days);
  const dateWindow = await buildDateWindowOptions();
  return (
    <main
      data-screen="production-downtime"
      data-prototype-label="production_downtime_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production'), href: `/${locale}/production` }, { label: t('breadcrumb.downtime') }]}
        actions={<DateWindowSelect value={windowDays} ariaLabel={dateWindow.ariaLabel} options={dateWindow.options} />}
      />
      <Suspense key={windowDays} fallback={<DowntimeSkeleton />}>
        <DowntimeContent windowDays={windowDays} />
      </Suspense>
    </main>
  );
}
