/**
 * 08-Production — Waste analytics sub-page (read-only).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
 *   new-screens.jsx:5-213 (WasteAnalyticsScreen). Structural correspondence:
 *     page-head "Production · Waste analytics"           → new-screens.jsx:24-39
 *     KPI row (total · top category · lines)             → new-screens.jsx:42-65
 *     Waste Pareto — by category                         → new-screens.jsx:69-91
 *     Waste by line table                                → new-screens.jsx:112-157
 *     Waste events table                                 → new-screens.jsx:160-200
 *
 * The prototype's WASTE_* mock arrays are replaced 1:1 with real Supabase reads
 * (wo_waste_log ⋈ waste_categories ⋈ work_orders ⋈ users) via withOrgContext,
 * RLS-scoped, no mocks. Read-only here (logging is the WO waste action). The rolling
 * %-of-consumed target framing is not surfaced — consumption is not joined here; the
 * waste log is presented as captured (deviation logged in closeout).
 *
 * UI states: loading / empty / error / permission-denied / optimistic (N/A read-only).
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import { ParetoBars, type ParetoBar } from '../_components/pareto-bars';
import { getWasteScreen, type WasteByLineRow, type WasteParetoRow } from './_actions/waste-data';
import { WasteTable, type WasteTableLabels } from './_components/waste-table';

export const dynamic = 'force-dynamic';

function WasteSkeleton() {
  return (
    <div data-testid="production-waste-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function WasteContent() {
  const t = await getTranslations('production.waste');
  const locale = await getLocale();
  const result = await getWasteScreen();

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div role="note" data-testid="production-waste-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" data-testid="production-waste-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const data = result.data;
  const kgFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dtf = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const paretoBars: ParetoBar[] = data.pareto.map((p: WasteParetoRow, i) => ({
    key: `${p.categoryName}-${i}`,
    label: p.categoryName,
    value: p.qtyKg,
    valueLabel: t('paretoKg', { kg: kgFmt.format(p.qtyKg) }),
    countLabel: t('paretoEvents', { count: p.events }),
    tone: 'process',
  }));

  const byLineBars: ParetoBar[] = data.byLine.map((r: WasteByLineRow, i) => ({
    key: `${r.lineId}-${i}`,
    label: r.lineId,
    value: r.qtyKg,
    valueLabel: t('paretoKg', { kg: kgFmt.format(r.qtyKg) }),
    countLabel: t('paretoEvents', { count: r.events }),
    tone: 'plant',
  }));

  const tableLabels: WasteTableLabels = {
    empty: t('table.empty'),
    uncategorized: t('table.uncategorized'),
    col: {
      time: t('table.col.time'),
      line: t('table.col.line'),
      wo: t('table.col.wo'),
      category: t('table.col.category'),
      qty: t('table.col.qty'),
      operator: t('table.col.operator'),
      reason: t('table.col.reason'),
    },
    voidedBadge: t('table.voidedBadge'),
    qtyFmt: (kg) => kgFmt.format(kg),
    dateFmt: (iso) => dtf.format(new Date(iso)),
    correctionOfFmt: (ref) => t('table.correctionOf', { ref }),
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card data-testid="production-waste-kpi-total" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.total')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{t('kg', { kg: kgFmt.format(data.totalKg) })}</div>
        </Card>
        <Card data-testid="production-waste-kpi-events" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.events')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{data.eventCount}</div>
        </Card>
        <Card data-testid="production-waste-kpi-top" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.topCategory')}</div>
          <div className="mt-2 truncate text-lg font-bold text-slate-900">{data.topCategory ? data.topCategory.name : '—'}</div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {data.topCategory ? t('kg', { kg: kgFmt.format(data.topCategory.qtyKg) }) : t('kpi.none')}
          </div>
        </Card>
        <Card data-testid="production-waste-kpi-lines" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.lines')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{data.lineCount}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('paretoTitle')}</h2>
          {paretoBars.length === 0 ? (
            <p data-testid="production-waste-pareto-empty" className="py-4 text-sm text-slate-500">{t('paretoEmpty')}</p>
          ) : (
            <ParetoBars bars={paretoBars} testid="production-waste-pareto" />
          )}
        </Card>
        <Card className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('byLineTitle')}</h2>
          {byLineBars.length === 0 ? (
            <p data-testid="production-waste-byline-empty" className="py-4 text-sm text-slate-500">{t('byLineEmpty')}</p>
          ) : (
            <ParetoBars bars={byLineBars} testid="production-waste-byline" />
          )}
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('eventsTitle', { count: data.eventCount })}</h2>
        <WasteTable rows={data.events} labels={tableLabels} />
      </section>
    </div>
  );
}

export default async function WastePage() {
  const t = await getTranslations('production.waste');
  return (
    <main
      data-screen="production-waste"
      data-prototype-label="waste_analytics_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production'), href: '/production' }, { label: t('breadcrumb.waste') }]}
      />
      <Suspense fallback={<WasteSkeleton />}>
        <WasteContent />
      </Suspense>
    </main>
  );
}
