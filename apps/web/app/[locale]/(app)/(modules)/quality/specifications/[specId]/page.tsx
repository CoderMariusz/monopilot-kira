/**
 * QA-003b — Specification detail route (/quality/specifications/[specId]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   specs-screens.jsx:304-418 (QaSpecDetail) — header + status badge, status banner
 *   per state, header card, parameters table with critical badges, Approve action
 *   (MODAL-SPEC-SIGN, modals.jsx:158-206), signature sidebar. Per-region anchors +
 *   documented deviations live in [specId]/_components/spec-detail.client.tsx.
 *
 * Data: the reviewed getSpecDetail action (imported from the parallel T2-owned
 * spec-actions.ts, never authored here), run inside withOrgContext (RLS-scoped).
 * RBAC is server-side: getSpecDetail gates quality.dashboard.view (forbidden →
 * denied panel); canApproveSpec()/canManageSpecLifecycle() resolve quality.spec.*
 * server-side to drive the action affordances only — each action re-checks the
 * grant authoritatively, so the buttons are never trusted.
 *
 * Supersede targets: an active spec can be superseded by a NEWER version of the
 * SAME product + spec code. We derive the candidate list server-side from listSpecs
 * (filtered to that product+code, version > current) so the picker only offers real
 * targets; when none exist the button is disabled with an honest title.
 *
 * UI states: loading (Suspense skeleton), empty (spec not found → notFound), error
 * (failed read → banner, never 500), permission-denied (forbidden → panel),
 * optimistic (submit/approve/supersede useTransition; a superseded spec renders the
 * dimmed immutable banner and NO action buttons).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import {
  getSpecDetail,
  listSpecs,
  submitSpecForReview,
  approveSpec,
  supersedeSpec,
  updateSpecParameter,
  deleteSpecParameter,
} from '../../_actions/spec-actions';
import { getQaSpecsTranslator } from '../../qa-specs-labels';
import { canApproveSpec, canManageSpecLifecycle, canEditSpecParameters } from '../_components/can-spec';
import { buildSpecDetailLabels } from '../_components/labels';
import { SpecDetailClient, type SupersedeCandidate } from './_components/spec-detail.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; specId: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/specs-screens.jsx:304-418';

function DetailSkeleton() {
  return (
    <div data-testid="spec-detail-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-72 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function DetailContent({ locale, specId }: { locale: string; specId: string }) {
  const t = getQaSpecsTranslator(locale);
  const result = await getSpecDetail(specId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="spec-detail-denied"
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
        data-testid="spec-detail-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('detail.error')}
      </div>
    );
  }

  const spec = result.data;
  if (!spec) {
    notFound();
  }

  const [canApprove, canManage, canEdit] = await Promise.all([
    canApproveSpec(),
    canManageSpecLifecycle(),
    canEditSpecParameters(),
  ]);

  // Supersede candidates: newer versions of the SAME product + spec code.
  let supersedeCandidates: SupersedeCandidate[] = [];
  if (spec.status === 'active') {
    const all = await listSpecs({ search: spec.specCode, limit: 200 });
    if (all.ok) {
      supersedeCandidates = all.data
        .filter((r) => r.productId === spec.productId && r.specCode === spec.specCode && r.version > spec.version)
        .map((r) => ({ id: r.id, version: r.version }))
        .sort((a, b) => a.version - b.version);
    }
  }

  return (
    <SpecDetailClient
      spec={spec}
      canApprove={canApprove}
      canSubmit={canManage}
      canSupersede={canManage}
      canEdit={canEdit}
      supersedeCandidates={supersedeCandidates}
      labels={buildSpecDetailLabels(t)}
      locale={locale}
      submitForReviewAction={submitSpecForReview}
      approveSpecAction={approveSpec}
      supersedeSpecAction={supersedeSpec}
      updateSpecParameterAction={updateSpecParameter}
      deleteSpecParameterAction={deleteSpecParameter}
    />
  );
}

export default async function SpecDetailPage({ params }: PageProps) {
  const { locale, specId } = await params;

  return (
    <main
      data-screen="quality-spec-detail"
      data-prototype-label="spec_detail"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} specId={specId} />
      </Suspense>
    </main>
  );
}
