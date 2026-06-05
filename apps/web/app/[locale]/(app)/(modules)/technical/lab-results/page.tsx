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

import { LAB_TEST_TYPES } from '../../../../../../lib/technical/lab/read-model';
import { listLabResults } from './_actions/list-lab-results';
import { LabResultsLog, VERDICTS, type LabResultsCopy } from './_components/lab-results-log.client';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function LabResultsSkeleton() {
  return (
    <div data-testid="technical-lab-results-loading" aria-busy="true" className="flex flex-col gap-4">
      <div
        className="h-12 animate-pulse rounded-md"
        style={{ background: 'var(--gray-100)', border: '1px solid var(--border)' }}
      />
      <div
        className="h-80 animate-pulse rounded-md"
        style={{ background: 'var(--gray-100)', border: '1px solid var(--border)' }}
      />
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
      <div role="alert" data-testid="technical-lab-results-error" className="alert alert-red">
        <div className="alert-title">
          {result.state === 'invalid_filter' ? t('invalidFilter', { field: result.field }) : t('error')}
        </div>
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
    verdictLabel: Object.fromEntries(
      VERDICTS.map((v) => [v, t(`verdict.${v}`)]),
    ) as LabResultsCopy['verdictLabel'],
    testTypeLabel: Object.fromEntries(
      LAB_TEST_TYPES.map((tt) => [tt, t(`testType.${tt}`)]),
    ) as LabResultsCopy['testTypeLabel'],
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
    thresholdLabel: t('threshold', { value: '{value}' }),
    qualitativeLabel: t('qualitative'),
  };

  return <LabResultsLog rows={result.rows} copy={copy} />;
}

export default async function TechnicalLabResultsPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('technical.labResults');

  return (
    <main data-screen="technical-lab-results-page" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / {t('breadcrumb.labResults')}
      </nav>

      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>

      <Suspense fallback={<LabResultsSkeleton />}>
        <LabResultsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
