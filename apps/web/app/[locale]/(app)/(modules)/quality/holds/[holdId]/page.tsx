/**
 * QA-002a — Quality hold detail route (/quality/holds/[holdId]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   holds-screens.jsx:163-286 (QaHoldDetail) — header + status/priority badges,
 *   immutable signed banner when released, hold-context card, Held Items + linked
 *   NCRs tabs, Release action (MODAL-HOLD-RELEASE, modals.jsx:98-156). Per-region
 *   anchors + documented deviations live in [holdId]/_components/hold-detail.client.tsx.
 *
 * Data: the reviewed getHoldDetail action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). RBAC is server-side: getHoldDetail gates
 * quality.dashboard.view (forbidden → denied panel); canReleaseHolds() resolves
 * quality.hold.release server-side to drive the Release button affordance only —
 * releaseHold re-checks the grant authoritatively, so the button is never trusted.
 *
 * UI states: loading (Suspense skeleton), empty (hold not found → notice), error
 * (failed read → banner, never 500), permission-denied (forbidden → panel),
 * optimistic (release modal useTransition; a released hold renders the immutable
 * banner and NO action buttons).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { getHoldDetail, releaseHold } from '../../_actions/hold-actions';
import { getQaHoldsTranslator } from '../../qa-holds-labels';
import { canReleaseHolds } from '../_components/can-release';
import { buildHoldDetailLabels } from '../_components/labels';
import { HoldDetailClient } from './_components/hold-detail.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; holdId: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/holds-screens.jsx:163-286';

function DetailSkeleton() {
  return (
    <div data-testid="hold-detail-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function DetailContent({ locale, holdId }: { locale: string; holdId: string }) {
  const t = getQaHoldsTranslator(locale);
  const result = await getHoldDetail(holdId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="hold-detail-denied"
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
        data-testid="hold-detail-error"
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

  const canRelease = await canReleaseHolds();

  return (
    <HoldDetailClient
      hold={result.data}
      canRelease={canRelease}
      labels={buildHoldDetailLabels(t)}
      locale={locale}
      releaseHoldAction={releaseHold}
    />
  );
}

export default async function HoldDetailPage({ params }: PageProps) {
  const { locale, holdId } = await params;

  return (
    <main
      data-screen="quality-hold-detail"
      data-prototype-label="hold_detail"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} holdId={holdId} />
      </Suspense>
    </main>
  );
}
