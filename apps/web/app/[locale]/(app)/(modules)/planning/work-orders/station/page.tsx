/**
 * P2-PLANNING — per-station (production line) work queue route
 * (/planning/work-orders/station?lineId=…).
 *
 * A production line opens this to see ONLY its own stage's work orders across every
 * chain. Data comes from the read-only getStationQueue action (org-/RLS-scoped) plus
 * listProductionResources for the line picker — no writes, no mocks.
 *
 * i18n: this NEW surface ships with the component's English defaults; bundle keys are
 * a follow-up (flagged for the owner), consistent with the chain preview.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listProductionResources } from '../_actions/wo-form-data';
import { getStationQueue } from '../_actions/chain-preview';
import { StationQueueView } from '../_components/station-queue-view';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lineId?: string }>;
};

const UUID = /^[0-9a-fA-F-]{36}$/;

async function StationContent({ locale, lineId }: { locale: string; lineId: string | null }) {
  const resources = await listProductionResources();
  const selectedLineId = lineId && UUID.test(lineId) ? lineId : resources.lines[0]?.id ?? null;
  const queue = selectedLineId ? await getStationQueue({ lineId: selectedLineId }) : null;

  return (
    <StationQueueView
      locale={locale}
      lines={resources.lines}
      selectedLineId={selectedLineId}
      queue={queue}
    />
  );
}

export default async function StationQueuePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { lineId } = await searchParams;

  return (
    <main
      data-screen="planning-wo-station"
      data-prototype-label="plan_wo_list"
      data-prototype-source="prototypes/design/Monopilot Design System/planning/wo-list.jsx:4-279"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title="Station work queue"
        subtitle="Work orders scheduled on a production line, across every chain"
        breadcrumb={[{ label: 'Planning' }, { label: 'Work orders' }, { label: 'Station' }]}
      />
      <Suspense fallback={<div data-testid="station-loading" aria-busy className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />}>
        <StationContent locale={locale} lineId={lineId ?? null} />
      </Suspense>
    </main>
  );
}
