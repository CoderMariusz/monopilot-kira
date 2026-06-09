/**
 * Revision history screen — /technical/revisions.
 *
 * Parity anchor: prototypes/design/Monopilot Design System/technical/
 *   other-screens.jsx:182-216 (HistoryScreen). Immutable audit timeline of every
 *   change to items / BOMs / factory specs / change orders — when · who · entity ·
 *   action · what changed. See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Wired to the reviewed read model v_technical_revision_history (migration 229)
 * via listTechnicalRevisions — withOrgContext + RLS, real Supabase data, no
 * mocks. Read-only by design (RLS-scoped, any org user — no permission gate).
 * Five states: loading (Suspense), empty, error, permission-denied (shared
 * contract), ready. No optimistic state — read-only surface.
 */

import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listTechnicalRevisions } from './_actions/list-revisions';
import {
  RevisionsClient,
  type RevisionsLabels,
  type RevisionRow,
  type RevisionsState,
} from './_components/revisions.client';

export const dynamic = 'force-dynamic';

function RevisionsSkeleton() {
  return (
    <div data-testid="revisions-loading" aria-busy="true" className="flex flex-col gap-3">
      <div className="h-14 animate-pulse rounded border border-slate-200 bg-slate-100" />
      <div className="h-72 animate-pulse rounded border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function RevisionsContent() {
  const t = await getTranslations('technical.revisions');

  const labels: RevisionsLabels = {
    filterAll: t('filter.all'),
    filterItem: t('filter.item'),
    filterBom: t('filter.bom'),
    filterFactorySpec: t('filter.factorySpec'),
    filterEco: t('filter.eco'),
    searchPlaceholder: t('searchPlaceholder'),
    searchLabel: t('searchLabel'),
    limitLabel: t('limitLabel'),
    apply: t('apply'),
    colWhen: t('col.when'),
    colTag: t('col.tag'),
    colWho: t('col.who'),
    colWhat: t('col.what'),
    unknownActor: t('unknownActor'),
    revisionPrefix: t('revisionPrefix'),
    loading: t('loading'),
    empty: t('empty'),
    emptyBody: t('emptyBody'),
    error: t('error'),
    denied: t('denied'),
    resultCount: t('resultCount'),
  };

  const result = await listTechnicalRevisions({ limit: 100 });

  let initialState: RevisionsState;
  let initialRevisions: RevisionRow[] = [];
  if (!result.ok) {
    initialState = 'error';
  } else {
    initialRevisions = result.data.revisions as RevisionRow[];
    initialState = initialRevisions.length === 0 ? 'empty' : 'ready';
  }

  return (
    <RevisionsClient
      initialState={initialState}
      initialRevisions={initialRevisions}
      labels={labels}
      listAction={listTechnicalRevisions}
    />
  );
}

export default async function RevisionsPage() {
  const t = await getTranslations('technical.revisions');

  return (
    <main data-screen="technical-revisions" className="flex w-full flex-col gap-4 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.revisions') }]}
      />
      <Suspense fallback={<RevisionsSkeleton />}>
        <RevisionsContent />
      </Suspense>
    </main>
  );
}
