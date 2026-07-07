/**
 * QA-005 — Incoming Inspections list route (/quality/inspections).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   inspection-screens.jsx:3-97 (QaIncomingList) — status tabs with counts, search,
 *   "Create manual inspection" opens MODAL-INSPECTION-CREATE, dense inspections
 *   table (inspection # mono link, reference, product, status badge, assigned,
 *   due, created). Per-region anchors + documented deviations live in
 *   inspections/_components/inspections-list.client.tsx.
 *
 * Data: the reviewed listInspections action (imported from the C2-owned
 * _actions/inspection-actions, never authored here), run inside withOrgContext
 * (RLS-scoped). RBAC is enforced server-side in the action; this page never trusts
 * a client flag — a `forbidden` result renders the permission-denied panel.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty + empty-filtered (client
 * island), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → panel), optimistic (create modal uses useTransition + the action
 * result; success closes the modal).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

// Owned by the parallel C2 lane (quality/_actions/inspection-actions.ts). Imported,
// never authored here; until C2 lands the runtime import resolves at integration.
import {
  listInspections,
  createInspection,
  searchInspectionLps,
  resolveInspectionGrn,
  resolveInspectionWoOutput,
  searchInspectionAssignees,
} from '../_actions/inspection-actions';
import { getQaInspectionsTranslator } from '../qa-inspections-labels';
import { InspectionsListClient, type InspectionListFilters } from './_components/inspections-list.client';
import { buildInspectionsListLabels, buildInspectionCreateLabels } from './_components/labels';
import type {
  CreateInspectionAction,
  InspectionListRow,
  SearchInspectionLpsAction,
  ResolveInspectionGrnAction,
  ResolveInspectionWoOutputAction,
  SearchInspectionAssigneesAction,
} from './_components/inspection-contracts';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; status?: string; q?: string }>;
};

function parseInspectionFilters(sp: { status?: string; q?: string }): InspectionListFilters {
  const status = sp.status?.trim() ?? '';
  const allowed = new Set(['pending', 'in_progress', 'passed', 'failed', 'on_hold', 'cancelled']);
  return {
    status: status && allowed.has(status) ? status : '',
    search: sp.q?.trim() ?? '',
  };
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/inspection-screens.jsx:3-97';

function ListSkeleton() {
  return (
    <div
      data-testid="inspections-list-loading"
      data-state="loading"
      aria-busy="true"
      className="flex flex-col gap-4"
    >
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({
  locale,
  page,
  filters,
}: {
  locale: string;
  page: number;
  filters: InspectionListFilters;
}) {
  const t = getQaInspectionsTranslator(locale);
  const result = await listInspections({
    page,
    status: filters.status || undefined,
    search: filters.search || undefined,
  });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="inspections-list-denied"
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
        data-testid="inspections-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  // The action row is structurally a superset of the island's InspectionListRow
  // (extra productId is harmless); pass it through defensively.
  const rows: InspectionListRow[] = (result.data.items ?? []) as unknown as InspectionListRow[];

  return (
    <InspectionsListClient
      rows={rows}
      pagination={{ ...result.data, items: rows }}
      filters={filters}
      labels={buildInspectionsListLabels(t)}
      createLabels={buildInspectionCreateLabels(t)}
      locale={locale}
      createInspectionAction={createInspection as unknown as CreateInspectionAction}
      searchLpsAction={searchInspectionLps as unknown as SearchInspectionLpsAction}
      resolveGrnAction={resolveInspectionGrn as unknown as ResolveInspectionGrnAction}
      resolveWoOutputAction={resolveInspectionWoOutput as unknown as ResolveInspectionWoOutputAction}
      searchAssigneesAction={searchInspectionAssignees as unknown as SearchInspectionAssigneesAction}
    />
  );
}

export default async function InspectionsListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp: { page?: string; status?: string; q?: string } = searchParams ? await searchParams : {};
  const page = parsePage(sp.page);
  const filters = parseInspectionFilters(sp);
  const suspenseKey = `${page}:${filters.status}:${filters.search}`;
  const t = getQaInspectionsTranslator(locale);

  return (
    <main
      data-screen="quality-inspections-list"
      data-prototype-label="inspections_list"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('list.breadcrumb.inspections') },
        ]}
      />
      <Suspense key={suspenseKey} fallback={<ListSkeleton />}>
        <ListContent locale={locale} page={page} filters={filters} />
      </Suspense>
    </main>
  );
}
