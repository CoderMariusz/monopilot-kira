/**
 * QA-009 — NCR list route (/quality/ncrs).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/quality/
 *   ncr-screens.jsx:1-184 (QaNcrList) — §3.3 GHA attention/calm partition (overdue
 *   + critical-open + escalated auto-expanded on top), severity / type / status
 *   filters, search, dense table (NCR # mono link, type chip, severity badge,
 *   title, product, linked-hold link, response-due with overdue highlight),
 *   "+ Create NCR" opens MODAL-NCR-CREATE (modals.jsx:299-382). The kanban strip +
 *   KPI summary + bulk toolbar are RED-LINED as deferred. Per-region anchors +
 *   documented deviations live in ncrs/_components/ncr-list.client.tsx.
 *
 * Data: the reviewed listNcrs action (imported from the PARALLEL Codex _actions
 * lane, never authored here), run inside withOrgContext (RLS-scoped). RBAC is
 * enforced server-side in the action; this page never trusts a client flag — a
 * `forbidden` result renders the permission-denied panel.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty + empty-filtered (client
 * island), error (failed live read → banner, never a 500), permission-denied
 * (forbidden → panel), optimistic (create modal uses useTransition + the action
 * result; success closes the modal and revalidates the list).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listNcrs, createNcr } from '../_actions/ncr-actions';
import { getQaNcrsTranslator } from '../qa-ncrs-labels';
import { NcrListClient } from './_components/ncr-list.client';
import type { NcrListRow } from './_components/ncr-contracts';
import { buildNcrListLabels } from './_components/labels';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }>; searchParams?: Promise<{ page?: string }> };

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/quality/ncr-screens.jsx:1-184';

function ListSkeleton() {
  return (
    <div data-testid="ncr-list-loading" data-state="loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-10 animate-pulse rounded-md bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale, page }: { locale: string; page: number }) {
  const t = getQaNcrsTranslator(locale);
  const result = await listNcrs({ page });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="ncr-list-denied"
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
        data-testid="ncr-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  // DERIVE the §3.3 attention `overdue` flag honestly from responseDueAt < now
  // (the backend list row does not surface it) — non-terminal rows only.
  const now = Date.now();
  const TERMINAL = new Set(['closed', 'cancelled']);
  const rows: NcrListRow[] = result.data.items.map((r) => ({
    ...r,
    overdue:
      !TERMINAL.has(r.status) &&
      r.responseDueAt !== null &&
      Date.parse(r.responseDueAt) < now,
  }));

  return (
    <NcrListClient
      rows={rows}
      pagination={{ ...result.data, items: rows }}
      labels={buildNcrListLabels(t)}
      locale={locale}
      createNcrAction={createNcr}
    />
  );
}

export default async function NcrListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp: { page?: string } = searchParams ? await searchParams : {};
  const page = parsePage(sp.page);
  const t = getQaNcrsTranslator(locale);

  return (
    <main
      data-screen="quality-ncrs-list"
      data-prototype-label="ncr_list"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.quality'), href: `/${locale}/quality` },
          { label: t('list.breadcrumb.ncrs') },
        ]}
      />
      <Suspense key={page} fallback={<ListSkeleton />}>
        <ListContent locale={locale} page={page} />
      </Suspense>
    </main>
  );
}
