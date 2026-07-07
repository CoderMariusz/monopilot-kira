/**
 * Wave E2A — Trace route (/quality/trace). Read-only forward/backward trace.
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { runTraceReport } from './_actions/trace-actions';
import { canViewTrace } from './_actions/can-view-trace';
import { TraceWorkbench } from './_components/trace-workbench.client';
import { buildTraceLabels, type Translator } from './_components/labels';
import type { RunTraceReportAction } from './_components/trace-contracts';

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
          runTraceReportAction={runTraceReport as unknown as RunTraceReportAction}
        />
      )}
    </main>
  );
}
