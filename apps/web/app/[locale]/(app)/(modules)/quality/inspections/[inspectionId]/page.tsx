/**
 * QA-005a — Inspection detail route (/quality/inspections/[inspectionId]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:100-297 (QaInspectionDetail) — header + status badge,
 *   immutable signed banner when decided, editable Test Parameters table, overall
 *   result banner, decision footer (Pass / Fail / Hold → e-sign password modal),
 *   reference context sidebar. Per-region anchors + documented deviations live in
 *   [inspectionId]/_components/inspection-detail.client.tsx.
 *
 * Data: the reviewed getInspectionDetail / recordInspectionResult /
 * submitInspectionDecision actions (imported from the C2-owned _actions/
 * inspection-actions, never authored here), run inside withOrgContext (RLS-scoped).
 * RBAC is server-side: getInspectionDetail gates quality.dashboard.view (forbidden →
 * denied panel); canDecideInspections() resolves quality.inspection.execute
 * server-side to drive the editable inputs + decision affordance only — the actions
 * re-check the grant authoritatively, so the buttons are never trusted.
 *
 * UI states: loading (Suspense skeleton), empty (inspection not found → notFound),
 * error (failed read → banner, never 500), permission-denied (forbidden → panel),
 * optimistic (record-results + e-sign useTransition; a decided/cancelled inspection
 * renders the immutable banner and NO editable inputs / decision buttons).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

// Owned by the parallel C2 lane (quality/_actions/inspection-actions.ts). Imported,
// never authored here; until C2 lands the runtime import resolves at integration.
import {
  getInspectionDetail,
  recordInspectionResult,
  submitInspectionDecision,
} from '../../_actions/inspection-actions';
import { getQaInspectionsTranslator } from '../../qa-inspections-labels';
import { canDecideInspections } from '../_components/can-decide';
import { buildInspectionDetailLabels } from '../_components/labels';
import type {
  InspectionDetail,
  RecordInspectionResultAction,
  SubmitInspectionDecisionAction,
} from '../_components/inspection-contracts';
import { InspectionDetailClient } from './_components/inspection-detail.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; inspectionId: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/inspection-screens.jsx:100-297';

function DetailSkeleton() {
  return (
    <div data-testid="inspection-detail-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function DetailContent({ locale, inspectionId }: { locale: string; inspectionId: string }) {
  const t = getQaInspectionsTranslator(locale);
  const result = await getInspectionDetail(inspectionId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="inspection-detail-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('detail.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="inspection-detail-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('detail.error')}
      </div>
    );
  }

  if (!result.data) {
    notFound();
  }

  const canDecide = await canDecideInspections();

  // The action's InspectionDetail / result envelopes are structural supersets of
  // the island contracts (extra signatureHash/createdBy/qaStatus fields are
  // harmless); cast defensively at the boundary — drift reconciles at integration.
  return (
    <InspectionDetailClient
      inspection={result.data as unknown as InspectionDetail}
      canDecide={canDecide}
      labels={buildInspectionDetailLabels(t)}
      locale={locale}
      recordResultAction={recordInspectionResult as unknown as RecordInspectionResultAction}
      submitDecisionAction={submitInspectionDecision as unknown as SubmitInspectionDecisionAction}
    />
  );
}

export default async function InspectionDetailPage({ params }: PageProps) {
  const { locale, inspectionId } = await params;

  return (
    <main
      data-screen="quality-inspection-detail"
      data-prototype-label="inspection_detail"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} inspectionId={inspectionId} />
      </Suspense>
    </main>
  );
}
