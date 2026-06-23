/**
 * Wave E2A — Trace & Recall route (/quality/trace).
 *
 * Spec-driven (no JSX prototype for trace/recall in the Monopilot Design System;
 * nearest reusable pattern = the sibling quality CCP-monitoring screen + the
 * warehouse genealogy panel). DS conformance: PageHeader + Card + Badge + shadcn
 * Select + Table, matching the sibling quality screens.
 *
 * Data: the reviewed Trace Server Actions (runTraceReport + startRecallDrill +
 * completeRecallDrill), imported from quality/trace/_actions/trace-actions.ts —
 * never authored here — and run inside withOrgContext (RLS-scoped). RBAC is
 * enforced server-side in the actions (quality.dashboard.view); this page never
 * trusts a client flag: it probes the SAME permission server-side (canViewTrace)
 * and renders the permission-denied panel when it is absent, rather than
 * render-then-disable.
 *
 * No raw UUID ever reaches the UI (plan rule 0.11): the actions return human
 * refs (lp_code / wo_number / grn number / supplier code+name) in node.ref /
 * node.label; the deep-link href is built SERVER-SIDE from the internal nodeId by
 * `toDetailHref` (passed into the island as a bound resolver) and used only in
 * the href attribute.
 *
 * UI states (all four): loading (the client island shows a skeleton while the
 * action runs), empty (no run yet → CTA to enter a ref), error (a thrown trace
 * surfaces an inline banner, never a 500), permission-denied (forbidden →
 * panel).
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the reviewed Trace backend (quality/trace/_actions/trace-actions.ts).
// Imported, never authored here.
import {
  runTraceReport,
  startRecallDrill,
  completeRecallDrill,
} from './_actions/trace-actions';
// Read-only RBAC probe (additive read confined to trace/**).
import { canViewTrace } from './_actions/can-view-trace';
import { TraceWorkbench } from './_components/trace-workbench.client';
import { buildTraceLabels, toDetailHref, type Translator } from './_components/labels';
import type {
  RunTraceReportAction,
  StartRecallDrillAction,
  CompleteRecallDrillAction,
  TraceNodeType,
} from './_components/trace-contracts';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

export default async function TracePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.trace');
  const labels = buildTraceLabels(t as unknown as Translator);

  const allowed = await canViewTrace();

  return (
    <main
      data-screen="quality-trace"
      data-prototype-label="quality_trace"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.trace') },
        ]}
      />

      {!allowed ? (
        <div
          role="alert"
          data-testid="trace-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          <p className="font-semibold">{t('states.deniedTitle')}</p>
          <p className="mt-1">{t('states.deniedBody')}</p>
        </div>
      ) : (
        <TraceWorkbench
          labels={labels}
          locale={locale}
          buildDetailHref={(type: TraceNodeType, nodeId: string) => toDetailHref(locale, type, nodeId)}
          runTraceReportAction={runTraceReport as unknown as RunTraceReportAction}
          startRecallDrillAction={startRecallDrill as unknown as StartRecallDrillAction}
          completeRecallDrillAction={completeRecallDrill as unknown as CompleteRecallDrillAction}
          recallDrillsHref={`/${locale}/quality/recall-drills`}
        />
      )}
    </main>
  );
}
