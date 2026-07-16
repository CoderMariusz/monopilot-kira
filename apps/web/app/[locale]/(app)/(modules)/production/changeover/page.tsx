/**
 * 08-Production — Changeover sub-page (read-only).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/production/
 *   other-screens.jsx:298-397 (ChangeoverScreen). Structural correspondence:
 *     page-head "Production · Allergen changeover" + risk → other-screens.jsx:300-310
 *     dual sign-off requirement note                      → other-screens.jsx:312-318
 *     changeover events + allergen-risk badge + sign-off  → other-screens.jsx:320-392
 *
 * The prototype's single hard-coded changeover (with its checklist + sign-off boxes) is
 * the live-detail flow; this dashboard-linked read-only page lists every
 * changeover_events row with its risk badge + sign-off status, from real Supabase reads
 * (changeover_events ⋈ work_orders, migration 184). No mocks. The interactive
 * cleaning-checklist + PIN sign-off gate is owned by the changeover execution flow
 * (deviation logged in closeout — this is the read-only register).
 *
 * UI states: loading / empty / error / permission-denied / optimistic (N/A read-only).
 */
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';

import { Card } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getChangeoverScreen,
  type SignOffStatus,
} from './_actions/changeover-data';
import { formatUtcDateTime } from '../../../../../../lib/shared/format-utc-datetime';
import { ChangeoverTable, type ChangeoverTableLabels } from './_components/changeover-table';
import type { BadgeVariant } from '@monopilot/ui/Badge';

export const dynamic = 'force-dynamic';

function ChangeoverSkeleton() {
  return (
    <div data-testid="production-changeover-loading" aria-busy="true" className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ChangeoverContent() {
  const t = await getTranslations('production.changeover');
  const locale = await getLocale();
  const result = await getChangeoverScreen();

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div role="note" data-testid="production-changeover-denied" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
        {t('denied')}
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div role="alert" data-testid="production-changeover-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const data = result.data;
  const formatStartedAt = (iso: string) =>
    formatUtcDateTime(iso, locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  // C4/F2: canonical write value is 'complete' (migration 280); legacy rows may
  // still read 'completed' until normalized — the shim accepts both.
  const normalizeStatus = (status: SignOffStatus): SignOffStatus =>
    status === 'complete' ? 'completed' : status;
  const signOffLabel = (status: SignOffStatus): string => {
    const s = normalizeStatus(status);
    if (s === 'pending' || s === 'first_signed' || s === 'completed') {
      return t(`signOff.${s}`);
    }
    return status;
  };
  const signOffVariant = (status: SignOffStatus): BadgeVariant => {
    const s = normalizeStatus(status);
    if (s === 'completed') return 'success';
    if (s === 'first_signed') return 'warning';
    if (s === 'pending') return 'muted';
    return 'muted';
  };

  const tableLabels: ChangeoverTableLabels = {
    empty: t('table.empty'),
    none: t('table.none'),
    col: {
      started: t('table.col.started'),
      line: t('table.col.line'),
      transition: t('table.col.transition'),
      allergens: t('table.col.allergens'),
      risk: t('table.col.risk'),
      signOff: t('table.col.signOff'),
    },
    risk: {
      low: t('risk.low'),
      medium: t('risk.medium'),
      high: t('risk.high'),
      segregated: t('risk.segregated'),
    },
    signOff: signOffLabel,
    signOffVariant,
    dateFmt: formatStartedAt,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card data-testid="production-changeover-kpi-events" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.events')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{data.eventCount}</div>
        </Card>
        <Card data-testid="production-changeover-kpi-open" className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.open')}</div>
          <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900">{data.openCount}</div>
        </Card>
        <Card
          data-testid="production-changeover-kpi-highrisk"
          data-tone={data.highRiskCount > 0 ? 'danger' : 'default'}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('kpi.highRisk')}</div>
          <div className={`mt-2 font-mono text-2xl font-bold tabular-nums ${data.highRiskCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
            {data.highRiskCount}
          </div>
        </Card>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{t('signOffNote')}</div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('eventsTitle')}</h2>
        <ChangeoverTable rows={data.events} labels={tableLabels} />
      </section>
    </div>
  );
}

export default async function ChangeoverPage() {
  const locale = await getLocale();
  const t = await getTranslations('production.changeover');
  return (
    <main
      data-screen="production-changeover"
      data-prototype-label="changeover_screen"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.production'), href: `/${locale}/production` }, { label: t('breadcrumb.changeover') }]}
      />
      <Suspense fallback={<ChangeoverSkeleton />}>
        <ChangeoverContent />
      </Suspense>
    </main>
  );
}
