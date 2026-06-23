/**
 * Wave E2A — Recall Drill detail route (/quality/recall-drills/[drillId]).
 *
 * Spec-driven DS conformance (nearest reusable pattern = the sibling quality
 * detail screens): PageHeader + a meta panel (input ref, direction, start /
 * complete timestamps, KPI duration vs the 4h target badge) + the saved trace
 * report (the 5 summary counts + the flat table). A [Re-run] CTA links back to
 * the trace screen.
 *
 * Data: the reviewed `getRecallDrill` Server Action (imported from
 * quality/trace/_actions/trace-actions.ts — never authored here), run inside
 * withOrgContext (RLS-scoped). RBAC enforced server-side; a `forbidden` throw is
 * mapped to the permission-denied panel.
 *
 * UI states: loading (Suspense skeleton), empty / not-found (null drill →
 * not-found panel), error (failed read → banner), permission-denied (forbidden →
 * panel). No raw UUID reaches the UI (rule 0.11): only the human input ref and
 * the saved report's human node refs are rendered.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';
import { Card } from '@monopilot/ui/Card';
import { Badge } from '@monopilot/ui/Badge';

import { getRecallDrill } from '../../trace/_actions/trace-actions';
import {
  buildRecallDrillsLabels,
  buildTraceLabels,
  formatDuration,
  RECALL_TARGET_MS,
  type TraceLabels,
  type Translator,
} from '../../trace/_components/labels';
import { DrillReportPanel } from '../_components/drill-report-panel';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; drillId: string }> };

function DetailSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="recall-drill-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-3"
    >
      <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function formatTs(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ');
}

async function DetailContent({
  locale,
  drillId,
  t,
  traceLabels,
}: {
  locale: string;
  drillId: string;
  t: Translator;
  traceLabels: TraceLabels;
}) {
  const labels = buildRecallDrillsLabels(t);

  let drill;
  try {
    drill = await getRecallDrill(drillId);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="recall-drill-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{labels.states.deniedTitle}</p>
          <p className="mt-1">{labels.states.deniedBody}</p>
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="recall-drill-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{labels.states.errorTitle}</p>
        <p className="mt-1">{labels.states.errorBody}</p>
      </div>
    );
  }

  if (!drill) {
    return (
      <Card
        data-testid="recall-drill-not-found"
        data-state="empty"
        className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center"
      >
        <span className="text-base font-semibold text-slate-700">{labels.detail.notFoundTitle}</span>
        <span className="max-w-md text-sm text-slate-500">{labels.detail.notFoundBody}</span>
        <a
          href={`/${locale}/quality/recall-drills`}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          {labels.detail.backToList}
        </a>
      </Card>
    );
  }

  const withinTarget = drill.durationMs !== null && drill.durationMs <= RECALL_TARGET_MS;
  const inProgress = drill.completedAt === null || drill.durationMs === null;

  return (
    <div data-testid="recall-drill-detail" className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold text-sky-700">{drill.inputRef}</span>
            <Badge variant="secondary">{labels.inputType[drill.inputType]}</Badge>
            <Badge variant="outline">{labels.direction[drill.direction]}</Badge>
          </div>
          <Badge
            variant={inProgress ? 'muted' : withinTarget ? 'success' : 'danger'}
            data-testid="recall-drill-detail-badge"
          >
            {inProgress ? labels.inProgress : withinTarget ? labels.withinTarget : labels.overTarget}
          </Badge>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.detail.startedAt}</dt>
            <dd className="font-mono text-slate-700">{formatTs(drill.startedAt)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.detail.completedAt}</dt>
            <dd className="font-mono text-slate-700">{formatTs(drill.completedAt)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{labels.detail.duration}</dt>
            <dd
              className="font-mono font-semibold tabular-nums text-slate-900"
              data-testid="recall-drill-detail-duration"
            >
              {formatDuration(t, drill.durationMs)}
            </dd>
          </div>
        </dl>
      </Card>

      <DrillReportPanel report={drill.result} labels={labels} traceLabels={traceLabels} />

      <a
        href={`/${locale}/quality/trace`}
        className="w-fit rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {labels.detail.rerun}
      </a>
    </div>
  );
}

export default async function RecallDrillDetailPage({ params }: PageProps) {
  const { locale, drillId } = await params;
  const t = await getTranslations('quality.recallDrills');
  // The persisted report's node-type / summary / table copy lives under
  // quality.trace — resolve it once and pass the labels into the report panel.
  const tTrace = await getTranslations('quality.trace');
  const traceLabels = buildTraceLabels(tTrace as unknown as Translator);

  return (
    <main
      data-screen="quality-recall-drill-detail"
      data-prototype-label="quality_recall_drill_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      {/* Breadcrumb leaf is a static label — the drill id is a UUID and must
          never reach the UI (rule 0.11); the human input ref is shown in the
          meta panel once the drill is loaded server-side. */}
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.recallDrills'), href: `/${locale}/quality/recall-drills` },
          { label: t('detail.crumb') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton loadingLabel={t('states.loading')} />}>
        <DetailContent
          locale={locale}
          drillId={drillId}
          t={t as unknown as Translator}
          traceLabels={traceLabels}
        />
      </Suspense>
    </main>
  );
}
