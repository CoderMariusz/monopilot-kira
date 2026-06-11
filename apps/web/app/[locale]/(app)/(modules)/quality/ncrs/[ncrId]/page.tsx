/**
 * QA-009a — NCR detail route (/quality/ncrs/[ncrId]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   ncr-screens.jsx:186-352 (QaNcrDetail) — header badges, overdue alert, immutable
 *   closed banner (21 CFR Part 11), NCR context card, Investigation section
 *   (editable while non-terminal, read-only once closed), CAPA P2 placeholder,
 *   linked-records sidebar (hold → /quality/holds/<id>), sticky Close action
 *   (MODAL-NCR-CLOSE, modals.jsx:384-466). Per-region anchors + documented
 *   deviations live in [ncrId]/_components/ncr-detail.client.tsx.
 *
 * Data: the reviewed getNcrDetail action (imported from the PARALLEL Codex _actions
 * lane, never authored here), run inside withOrgContext (RLS-scoped). RBAC is
 * server-side: getNcrDetail returns forbidden → denied panel; updateNcrInvestigation
 * + closeNcr re-check the grant authoritatively (the close button is never trusted —
 * critical closes require the e-sign password, enforced server-side).
 *
 * UI states: loading (Suspense skeleton), empty (NCR not found → notFound), error
 * (failed read → banner, never 500), permission-denied (forbidden → panel),
 * optimistic (investigation save + close use useTransition; a closed NCR renders the
 * immutable banner and NO actions).
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { getNcrDetail, updateNcrInvestigation, closeNcr } from '../../_actions/ncr-actions';
import { getQaNcrsTranslator } from '../../qa-ncrs-labels';
import { buildNcrDetailLabels } from '../_components/labels';
import { NcrDetailClient } from './_components/ncr-detail.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; ncrId: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/ncr-screens.jsx:186-352';

function DetailSkeleton() {
  return (
    <div data-testid="ncr-detail-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-8 w-64 animate-pulse rounded-md bg-slate-100" />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

async function DetailContent({ locale, ncrId }: { locale: string; ncrId: string }) {
  const t = getQaNcrsTranslator(locale);
  const result = await getNcrDetail(ncrId);

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="ncr-detail-denied"
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
        data-testid="ncr-detail-error"
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

  // DERIVE the overdue flag honestly (responseDueAt < now AND non-terminal).
  const TERMINAL = new Set(['closed', 'cancelled']);
  const detail = {
    ...result.data,
    overdue:
      !TERMINAL.has(result.data.status) &&
      result.data.responseDueAt !== null &&
      Date.parse(result.data.responseDueAt) < Date.now(),
  };

  return (
    <NcrDetailClient
      ncr={detail}
      labels={buildNcrDetailLabels(t)}
      locale={locale}
      updateInvestigationAction={updateNcrInvestigation}
      closeNcrAction={closeNcr}
    />
  );
}

export default async function NcrDetailPage({ params }: PageProps) {
  const { locale, ncrId } = await params;

  return (
    <main
      data-screen="quality-ncr-detail"
      data-prototype-label="ncr_detail"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} ncrId={ncrId} />
      </Suspense>
    </main>
  );
}
