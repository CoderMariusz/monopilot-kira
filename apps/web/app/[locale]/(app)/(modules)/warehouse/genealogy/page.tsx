/**
 * WH-014 — Lot genealogy & traceability route (/warehouse/genealogy).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:280-374 (WhGenealogy, data-prototype-label:
 *   genealogy_traceability_page) — LP search box → pick → recursive trace chain
 *   (ancestors above, focal LP highlighted, descendants below). Per-region anchors
 *   + deviations live in genealogy/_components/genealogy-tree.client.tsx.
 *
 * Data: the reviewed traceGenealogy action (warehouse/_actions/genealogy-actions.ts,
 * cycle-safe both directions, capped at 20 levels) for the trace, plus
 * listLPs({ limit }) to feed the search box (imported never authored). Both run
 * inside withOrgContext (RLS-scoped). The selected LP comes from the ?lp= search
 * param so the trace is computed SERVER-SIDE (no client-trusted data, no client
 * data fetch). RBAC (warehouse.inventory.read) is enforced server-side inside the
 * actions; a `forbidden` result renders the permission panel.
 *
 * i18n: the `warehouse` namespace is not yet merged into next-intl, so labels are
 * resolved server-side from the staged warehouse-facility bundle via
 * getWhFacilityTranslator (en + pl real, EN fallback). No inline JSX strings.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no LP selected → prompt;
 * selected LP with no links yet → "no genealogy yet" note), error (failed/not-found
 * trace → banner), permission-denied (forbidden → panel). Optimistic — N/A.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { traceGenealogy } from '../_actions/genealogy-actions';
import { listLPs } from '../_actions/lp-actions';
import type { GenealogyNode } from '../_actions/shared';
import { getWhFacilityTranslator } from '../wh-facility-labels';
import { GenealogyTreeClient, type GenealogyLabels } from './_components/genealogy-tree.client';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ lp?: string }>;
};

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:280-374';

const SEARCH_POOL_CAP = 500;

function buildLabels(t: ReturnType<typeof getWhFacilityTranslator>): GenealogyLabels {
  return {
    searchPlaceholder: t('genealogy.searchPlaceholder'),
    searchLabel: t('genealogy.searchLabel'),
    noResults: t('genealogy.noResults'),
    prompt: t('genealogy.prompt'),
    promptHint: t('genealogy.promptHint'),
    emptyTrace: t('genealogy.emptyTrace'),
    ancestorsLabel: t('genealogy.ancestorsLabel'),
    focalLabel: t('genealogy.focalLabel'),
    descendantsLabel: t('genealogy.descendantsLabel'),
    depthLabel: t('genealogy.depthLabel'),
    capNote: t('genealogy.capNote'),
    nodesFound: t('genealogy.nodesFound'),
    nodesFoundPlural: t('genealogy.nodesFoundPlural'),
    openLp: t('genealogy.openLp'),
    status: {
      available: t('genealogy.status.available'),
      reserved: t('genealogy.status.reserved'),
      allocated: t('genealogy.status.allocated'),
      received: t('genealogy.status.received'),
      quarantine: t('genealogy.status.quarantine'),
      consumed: t('genealogy.status.consumed'),
      blocked: t('genealogy.status.blocked'),
    },
  };
}

function ListSkeleton() {
  return (
    <div data-testid="gen-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-12 animate-pulse rounded-md bg-slate-100" />
      <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function GenealogyContent({ locale, selectedLpId }: { locale: string; selectedLpId: string | null }) {
  const t = getWhFacilityTranslator(locale);
  const lpResult = await listLPs({ limit: SEARCH_POOL_CAP });

  // Permission-denied (server-resolved by the action).
  if (!lpResult.ok && lpResult.reason === 'forbidden') {
    return (
      <div
        role="alert"
        data-testid="gen-denied"
        data-state="permission-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('genealogy.denied')}
      </div>
    );
  }
  if (!lpResult.ok) {
    return (
      <div
        role="alert"
        data-testid="gen-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('genealogy.error')}
      </div>
    );
  }

  let nodes: GenealogyNode[] | null = null;
  if (selectedLpId) {
    const traceResult = await traceGenealogy(selectedLpId);
    if (!traceResult.ok && traceResult.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="gen-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('genealogy.denied')}
        </div>
      );
    }
    if (!traceResult.ok) {
      return (
        <div
          role="alert"
          data-testid="gen-error"
          data-state="error"
          className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {t('genealogy.error')}
        </div>
      );
    }
    nodes = traceResult.data;
  }

  return (
    <GenealogyTreeClient
      searchPool={lpResult.data}
      selectedLpId={selectedLpId}
      nodes={nodes}
      labels={buildLabels(t)}
      locale={locale}
      basePath={`/${locale}/warehouse/genealogy`}
    />
  );
}

export default async function GenealogyPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { lp } = await searchParams;
  const selectedLpId = typeof lp === 'string' && lp.trim() !== '' ? lp.trim() : null;
  const t = getWhFacilityTranslator(locale);

  return (
    <main
      data-screen="warehouse-genealogy"
      data-prototype-label="genealogy_traceability_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('genealogy.title')}
        subtitle={t('genealogy.subtitle')}
        breadcrumb={[
          { label: t('genealogy.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('genealogy.breadcrumb.genealogy') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        {/* key forces a fresh Suspense fetch when the selected LP changes. */}
        <GenealogyContent key={selectedLpId ?? '__none__'} locale={locale} selectedLpId={selectedLpId} />
      </Suspense>
    </main>
  );
}
