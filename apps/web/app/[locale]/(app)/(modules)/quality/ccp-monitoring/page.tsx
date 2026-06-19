/**
 * Wave E3 — CCP Monitoring route (/quality/ccp-monitoring).
 *
 * Design-system conformance to the CCP Monitoring prototype
 * (prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:108-226,
 * QaCcpMonitoring): page header + breadcrumb, KPI summary, "+ Record reading",
 * a board of CCPs with the latest reading + IN/OUT-of-limit badge. The
 * prototype's filter bar / timeline chart / full readings table
 * (haccp-screens.jsx:150-223) are a documented deviation (deferred) — this is
 * the cheapest E3 slice. No JSX prototype exists for the record-reading modal;
 * it follows the sibling MODAL-INSPECTION-CREATE island for DS conformance.
 *
 * Data: the reviewed HACCP Server Actions (listCcps + listMonitoringLog +
 * recordMonitoring), imported from quality/_actions/haccp-actions.ts — never
 * authored here — and run inside withOrgContext (RLS-scoped). RBAC is enforced
 * server-side in the actions; this page never trusts a client flag: a
 * `forbidden` result renders the permission-denied panel.
 *
 * The latest reading per CCP is derived SERVER-SIDE (listMonitoringLog returns
 * rows newest-first; the first row per ccpId is the latest). No `*_id` ever
 * reaches the UI — only CCP code/name + a derived status (plan rule 0.11).
 *
 * UI states (all four — plan rule 0.11): loading (Suspense skeleton, no CLS),
 * empty (board CTA → HACCP setup), error (failed live read → banner, never a
 * 500), permission-denied (forbidden → panel). Optimistic: the record modal
 * uses useTransition + router.refresh() and surfaces a breach (auto NCR) inline.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed HACCP backend (quality/_actions/haccp-actions.ts).
// Imported, never authored here.
import { listCcps, listMonitoringLog, recordMonitoring, upsertCcp } from '../_actions/haccp-actions';
// Read-only RBAC probe (additive read confined to ccp-monitoring/**) — gates the
// "Add CCP" button on quality.haccp.plan_edit (rule 0.13c).
import { canEditCcpPlan } from './_actions/can-edit-ccp';
import { CcpBoardClient } from './_components/ccp-board.client';
import type {
  CcpBoardItem,
  MonitoringLogRow,
  RecordMonitoringAction,
  UpsertCcpAction,
} from './_components/ccp-contracts';
import { buildCcpBoardLabels, buildCcpRecordLabels, buildCcpCreateLabels, type Translator } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/haccp-screens.jsx:108-226';

function BoardSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="ccp-board-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-4"
    >
      <div className="h-9 w-40 animate-pulse self-end rounded-md bg-slate-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

/** Newest log row per ccpId (the action returns rows ordered measured_at desc). */
function latestByCcp(logs: MonitoringLogRow[]): Map<string, MonitoringLogRow> {
  const latest = new Map<string, MonitoringLogRow>();
  for (const row of logs) {
    if (!latest.has(row.ccpId)) latest.set(row.ccpId, row);
  }
  return latest;
}

async function BoardContent({ locale, t }: { locale: string; t: Translator }) {
  const labels = buildCcpBoardLabels(t);
  const recordLabels = buildCcpRecordLabels(t);
  const createLabels = buildCcpCreateLabels(t);

  const ccpsResult = await listCcps({ activeOnly: true });

  if (!ccpsResult.ok) {
    if (ccpsResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="ccp-board-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('denied.title')}</p>
          <p className="mt-1">{t('denied.body')}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="ccp-board-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1">{t('error.body')}</p>
      </div>
    );
  }

  // Latest reading per CCP — best-effort: if the log read fails we still render
  // the board (every CCP shows "no reading yet") rather than a hard error.
  // canEdit is resolved server-side (plan_edit probe) to gate the "Add CCP"
  // button (rule 0.13c) — never client-trusted; upsertCcp re-checks the gate.
  const [logResult, canEdit] = await Promise.all([
    listMonitoringLog({ days: 366 }),
    canEditCcpPlan(),
  ]);
  const latest = logResult.ok ? latestByCcp(logResult.data) : new Map<string, MonitoringLogRow>();

  const items: CcpBoardItem[] = ccpsResult.data.map((ccp) => {
    const last = latest.get(ccp.id) ?? null;
    return {
      id: ccp.id,
      ccpCode: ccp.ccpCode,
      name: ccp.name,
      processStep: ccp.processStep,
      hazardType: ccp.hazardType,
      criticalLimitMin: ccp.criticalLimitMin,
      criticalLimitMax: ccp.criticalLimitMax,
      unit: ccp.unit,
      monitoringFrequency: ccp.monitoringFrequency,
      lastValue: last ? last.measuredValue : null,
      lastAt: last ? last.measuredAt : null,
      lastStatus: last ? (last.withinLimits ? 'in_limit' : 'out_of_limit') : 'no_data',
    };
  });

  return (
    <CcpBoardClient
      items={items}
      labels={labels}
      recordLabels={recordLabels}
      createLabels={createLabels}
      locale={locale}
      recordMonitoringAction={recordMonitoring as unknown as RecordMonitoringAction}
      upsertCcpAction={upsertCcp as unknown as UpsertCcpAction}
      canEdit={canEdit}
      setupHref={`/${locale}/quality`}
      t={t}
    />
  );
}

export default async function CcpMonitoringPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.ccpMonitoring');

  return (
    <main
      data-screen="quality-ccp-monitoring"
      data-prototype-label="ccp_monitoring"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.ccpMonitoring') },
        ]}
      />
      <Suspense fallback={<BoardSkeleton loadingLabel={t('loading')} />}>
        <BoardContent locale={locale} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
