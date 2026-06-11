/**
 * QA-003 — Specifications list route (/quality/specifications).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   specs-screens.jsx:1-79 (QaSpecsList) — status filter pills, applies-to pills,
 *   search, dense table (spec code mono link, version badge, product, status badge,
 *   parameter count, approved by/at), "+ Create Specification" opens the
 *   create-spec modal (collapsed QA-003a wizard, specs-screens.jsx:81-302). Plus
 *   MODAL-SPEC-SIGN (modals.jsx:158-206) is wired on the detail route. Per-region
 *   anchors + documented deviations live in _components/spec-list.client.tsx.
 *
 * Data: the reviewed listSpecs action (imported from the parallel T2-owned
 * spec-actions.ts, never authored here), run inside withOrgContext (RLS-scoped).
 * RBAC is enforced server-side in the action; this page never trusts a client flag
 * — a `forbidden` result renders the permission-denied panel. searchItems (NPD
 * fa/actions) feeds the product ItemPicker (itemTypes ['fg','intermediate']).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty + empty-filtered (client
 * island), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → panel), optimistic (create modal uses useTransition + the action
 * result; success closes the modal and revalidates on navigation).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listSpecs, createSpec } from '../_actions/spec-actions';
import { searchItems } from '../../../../../(npd)/fa/actions/search-items';
import { getQaSpecsTranslator } from '../qa-specs-labels';
import { SpecListClient } from './_components/spec-list.client';
import type { SpecListRow } from './_components/spec-actions-contract';
import { buildSpecListLabels, buildSpecCreateLabels } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/specs-screens.jsx:1-79';

function ListSkeleton() {
  return (
    <div data-testid="spec-list-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getQaSpecsTranslator(locale);
  const result = await listSpecs({ limit: 200 });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="spec-list-denied"
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
        data-testid="spec-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  const rows: SpecListRow[] = result.data;

  return (
    <SpecListClient
      rows={rows}
      labels={buildSpecListLabels(t)}
      createLabels={buildSpecCreateLabels(t)}
      locale={locale}
      createSpecAction={createSpec}
      searchItemsAction={searchItems}
    />
  );
}

export default async function SpecsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getQaSpecsTranslator(locale);

  return (
    <main
      data-screen="quality-specs-list"
      data-prototype-label="specs_list"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('list.breadcrumb.specs') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
