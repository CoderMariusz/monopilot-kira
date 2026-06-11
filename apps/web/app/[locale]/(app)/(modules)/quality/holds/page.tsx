/**
 * QA-002 — Quality holds list route (/quality/holds).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   holds-screens.jsx:1-161 (QaHoldsList) — status tabs Active/Released/All with
 *   counts, search, reference-type filter, dense holds table, "+ Create hold"
 *   opens the MODAL-HOLD-CREATE modal (modals.jsx:22-96). Per-region anchors +
 *   documented deviations live in holds/_components/holds-list.client.tsx.
 *
 * Data: the reviewed listHolds action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). RBAC is enforced server-side in the action; this
 * page never trusts a client flag — a `forbidden` result renders the
 * permission-denied panel (the action gates quality.dashboard.view).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty + empty-filtered (client
 * island), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → panel), optimistic (create modal uses useTransition + the action
 * result; success closes the modal and revalidates).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listHolds, createHold } from '../_actions/hold-actions';
import { getQaHoldsTranslator } from '../qa-holds-labels';
import { HoldsListClient, type HoldRow } from './_components/holds-list.client';
import { buildHoldsListLabels, buildHoldCreateLabels } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/holds-screens.jsx:1-161';

function ListSkeleton() {
  return (
    <div data-testid="holds-list-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getQaHoldsTranslator(locale);
  // status 'all' so the client island can split Active/Released/All client-side.
  const result = await listHolds({ status: 'all', limit: 200 });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="holds-list-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('list.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="holds-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  const rows: HoldRow[] = result.data.map((h) => ({
    id: h.id,
    holdNumber: h.holdNumber,
    referenceType: h.referenceType,
    referenceId: h.referenceId,
    referenceDisplay: h.referenceDisplay,
    reasonLabel: h.reasonLabel,
    reasonText: h.reasonText,
    priority: h.priority,
    status: h.status,
    createdAt: h.createdAt,
    estimatedReleaseAt: h.estimatedReleaseAt,
    releasedAt: h.releasedAt,
  }));

  return (
    <HoldsListClient
      rows={rows}
      labels={buildHoldsListLabels(t)}
      createLabels={buildHoldCreateLabels(t)}
      locale={locale}
      createHoldAction={createHold}
    />
  );
}

export default async function HoldsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getQaHoldsTranslator(locale);

  return (
    <main
      data-screen="quality-holds-list"
      data-prototype-label="holds_list"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('list.breadcrumb.holds') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
