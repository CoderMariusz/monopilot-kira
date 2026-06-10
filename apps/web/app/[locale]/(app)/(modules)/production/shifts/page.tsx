/**
 * 08-Production — Shifts sub-page (read-only).
 *
 * Prototype parity: prototypes/design/Monopilot Design System/production/
 *   other-screens.jsx:218-297 (ShiftsScreen). Structural correspondence:
 *     page-head "Production · Shifts"                     → other-screens.jsx:220-231
 *     shift roll-up table (line assignments in prototype) → other-screens.jsx:234-263
 *     shift targets vs actual (per-shift metrics)         → other-screens.jsx:282-290
 *
 * DEVIATION (logged): there is NO shifts master table (per the audit), so the
 * prototype's crew assignments / handover notes are not data-backed. Instead the page
 * aggregates the operational `shift_id` text carried on downtime_events / wo_waste_log /
 * oee_snapshots into a per-shift roll-up (downtime · waste · latest OEE). When nothing
 * references a shift, an honest empty-state is shown. No mocks.
 *
 * UI states: loading / empty / error / permission-denied / optimistic (N/A read-only).
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getShiftsScreen } from './_actions/shifts-data';

export const dynamic = 'force-dynamic';

function ShiftsSkeleton() {
  return (
    <div data-testid="production-shifts-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ShiftsContent() {
  const t = await getTranslations('production.shifts');
  const locale = await getLocale();
  const result = await getShiftsScreen();

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div role="note" data-testid="production-shifts-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" data-testid="production-shifts-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const data = result.data;
  const numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });

  if (data.shifts.length === 0) {
    return (
      <div
        data-testid="production-shifts-empty"
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
      >
        <p className="text-sm font-medium text-slate-700">{t('empty.title')}</p>
        <p className="mt-1 text-sm text-slate-500">{t('empty.body')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{t('note')}</div>
      <div data-testid="production-shifts-table" className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-semibold">{t('col.shift')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('col.downtime')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('col.downtimeEvents')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('col.waste')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('col.wasteEvents')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('col.oee')}</th>
            </tr>
          </thead>
          <tbody>
            {data.shifts.map((s) => (
              <tr key={s.shiftId} data-testid={`production-shifts-row-${s.shiftId}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono font-semibold text-slate-900">{s.shiftId}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{t('minutes', { min: s.downtimeMin })}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{s.downtimeEvents}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{t('kg', { kg: numFmt.format(s.wasteKg) })}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{s.wasteEvents}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">
                  {s.oeePct === null ? '—' : `${numFmt.format(s.oeePct)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function ShiftsPage() {
  const t = await getTranslations('production.shifts');
  return (
    <main
      data-screen="production-shifts"
      data-prototype-label="shifts_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production'), href: '/production' }, { label: t('breadcrumb.shifts') }]}
      />
      <Suspense fallback={<ShiftsSkeleton />}>
        <ShiftsContent />
      </Suspense>
    </main>
  );
}
