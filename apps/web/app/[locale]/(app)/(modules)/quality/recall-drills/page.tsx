/**
 * Wave E2A — Recall Drills route (/quality/recall-drills).
 *
 * Spec-driven DS conformance (nearest reusable pattern = the sibling quality
 * list screens): PageHeader + a drills table with the KPI duration vs the 4h
 * target badge, the input ref, direction and date; a [New drill] CTA →
 * /quality/trace; each row deep-links to the drill detail.
 *
 * Data: the reviewed `getRecallDrills` Server Action (imported from
 * quality/trace/_actions/trace-actions.ts — never authored here), run inside
 * withOrgContext (RLS-scoped). RBAC is enforced server-side in the action
 * (quality.dashboard.view); a `forbidden` throw is mapped to the permission-
 * denied panel — never client-trusted.
 *
 * UI states (all four): loading (Suspense skeleton, no CLS), empty (no drills →
 * CTA to the trace screen), error (failed live read → banner, never a 500),
 * permission-denied (forbidden → panel). No raw UUID reaches the UI (rule 0.11):
 * the row renders the human input ref + direction + date; the drill id is used
 * only for the detail href.
 */
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getRecallDrills } from '../trace/_actions/trace-actions';
import { RecallDrillsList } from './_components/recall-drills-list.client';
import { buildRecallDrillsLabels, type Translator } from '../trace/_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function ListSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div
      data-testid="recall-drills-loading"
      data-state="loading"
      aria-busy="true"
      aria-label={loadingLabel}
      className="flex flex-col gap-3"
    >
      <div className="h-9 w-40 animate-pulse self-end rounded-md bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale, t }: { locale: string; t: Translator }) {
  const labels = buildRecallDrillsLabels(t);

  let drills;
  try {
    drills = await getRecallDrills();
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="recall-drills-denied"
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
        data-testid="recall-drills-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        <p className="font-semibold">{labels.states.errorTitle}</p>
        <p className="mt-1">{labels.states.errorBody}</p>
      </div>
    );
  }

  return (
    <RecallDrillsList
      drills={drills}
      labels={labels}
      locale={locale}
      newDrillHref={`/${locale}/quality/trace`}
    />
  );
}

export default async function RecallDrillsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations('quality.recallDrills');

  return (
    <main
      data-screen="quality-recall-drills"
      data-prototype-label="quality_recall_drills"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('breadcrumb.recallDrills') },
        ]}
      />
      <Suspense fallback={<ListSkeleton loadingLabel={t('states.loading')} />}>
        <ListContent locale={locale} t={t as unknown as Translator} />
      </Suspense>
    </main>
  );
}
