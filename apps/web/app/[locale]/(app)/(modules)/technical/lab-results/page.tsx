/**
 * T-088 — TEC-045 Lab Results Log (spec-driven server page).
 *
 * Spec-driven Wave0 surface (PRD §0/§5/§17). Parity anchor (layout-primitive):
 *   prototypes/design/Monopilot Design System/technical/spec-driven-screens.jsx:451-546
 *   (lab_results_log_screen). See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Reads REAL Supabase data via the EXISTING T-020 lab read model (listLabResults
 * → buildLabResultsQuery/toLabResultReadRow) org-scoped under withOrgContext +
 * RLS; no mocks. Quality-OWNED data, Technical READS ONLY (no write/NCR/sign-off).
 *
 * UI states: loading (Suspense skeleton), empty (no lab results → empty card),
 * error (failed read / invalid filter → banner), permission-denied (the read
 * model is RLS-org-scoped; cross-links target the Quality-gated lab surface),
 * optimistic — N/A (read-only).
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listLabResults } from './_actions/list-lab-results';
import { LabResultsLog, type LabResultsCopy } from './_components/lab-results-log.client';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function LabResultsSkeleton() {
  return (
    <div data-testid="technical-lab-results-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-12 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
      <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function LabResultsContent({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('technical.labResults');
  const sp = await searchParams;
  const result = await listLabResults({
    test_type: firstParam(sp.test_type),
    result_status: firstParam(sp.result_status),
    item_id: firstParam(sp.item_id),
  });

  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="technical-lab-results-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {result.state === 'invalid_filter' ? t('invalidFilter', { field: result.field }) : t('error')}
      </div>
    );
  }

  const copy: LabResultsCopy = {
    readOnlyNotice: t('readOnlyNotice'),
    openInQa: t('openInQa'),
    qaHref: '/quality/lab',
    searchPlaceholder: t('searchPlaceholder'),
    sourceNote: t('sourceNote'),
    empty: t('empty'),
    verdictLabel: (v) => t(`verdict.${v}`),
    testTypeLabel: (tt) => t(`testType.${tt}`),
    col: {
      labId: t('col.labId'),
      taken: t('col.taken'),
      fgLot: t('col.fgLot'),
      test: t('col.test'),
      reading: t('col.reading'),
      verdict: t('col.verdict'),
      action: t('col.action'),
    },
    rluUnit: t('rluUnit'),
    thresholdLabel: (n) => t('threshold', { value: n }),
    qualitativeLabel: t('qualitative'),
  };

  return <LabResultsLog rows={result.rows} copy={copy} />;
}

export default async function TechnicalLabResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('technical.labResults');

  return (
    <main data-screen="technical-lab-results-page" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.labResults') }]}
      />
      <Suspense fallback={<LabResultsSkeleton />}>
        <LabResultsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
