/**
 * WH-002 — `/warehouse/license-plates` LP list page.
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   lp-screens.jsx:3-215 (lp_list_page) — status tabs + counts, search, dense LP
 *   table (LP mono link, item code+name, qty+uom, batch, expiry coloring, status +
 *   QA badges, location). The status/QA badge families mirror shell.jsx
 *   LPStatus/QAStatus. See lp-list.client.tsx for per-region anchors + the
 *   documented deviations (multi-select / bulk bar / extra filters deferred).
 *
 * Server Component: reads org-scoped data via the `listLPs` Server Action (owned
 * by the parallel Codex lane — imported, never authored). RBAC
 * (warehouse.inventory.read) is enforced INSIDE the action; this page surfaces the
 * action's `forbidden` reason as the denied panel and never trusts a client flag.
 *
 * i18n: the `warehouse` namespace is not yet merged into next-intl, so labels are
 * resolved server-side from the staged bundle (_meta/i18n-staging/warehouse-lp.json)
 * via getLpTranslator (en + pl real, EN fallback per missing key). Strings are
 * passed down as plain props — no inline JSX strings.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no LPs copy), error
 * (failed live read → banner, never a 500), permission-denied (forbidden → denied
 * panel, nothing privileged rendered). Optimistic — N/A (read-only; mutations are
 * a later lane).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import { listLPs } from '../_actions/lp-actions';
import { getLpTranslator } from './lp-labels';
import { LpListClient, type LpListLabels } from './_components/lp-list.client';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="lp-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-9 w-full max-w-md animate-pulse rounded-lg bg-slate-100" />
      <div className="h-10 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-96 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildLabels(locale: string): LpListLabels {
  const t = getLpTranslator(locale);
  return {
    searchPlaceholder: t('list.searchPlaceholder'),
    searchLabel: t('list.searchLabel'),
    rowsLabel: t('list.rowsLabel'),
    emptyAll: t('list.emptyAll'),
    emptyFiltered: t('list.emptyFiltered'),
    deferredMultiSelect: t('list.deferredMultiSelect'),
    tab: {
      all: t('list.tabs.all'),
      available: t('list.tabs.available'),
      reserved: t('list.tabs.reserved'),
      blocked: t('list.tabs.blocked'),
      qc_hold: t('list.tabs.qc_hold'),
    },
    status: {
      received: t('status.received'),
      available: t('status.available'),
      reserved: t('status.reserved'),
      blocked: t('status.blocked'),
      consumed: t('status.consumed'),
      shipped: t('status.shipped'),
      merged: t('status.merged'),
      destroyed: t('status.destroyed'),
    },
    col: {
      lp: t('list.columns.lp'),
      item: t('list.columns.item'),
      qty: t('list.columns.qty'),
      batch: t('list.columns.batch'),
      expiry: t('list.columns.expiry'),
      status: t('list.columns.status'),
      qa: t('list.columns.qa'),
      location: t('list.columns.location'),
    },
    expiry: { expired: t('list.expiry.expired'), soon: t('list.expiry.soon') },
    pagination: {
      showing: t('list.pagination.showing'),
      previous: t('list.pagination.previous'),
      next: t('list.pagination.next'),
    },
  };
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

async function ListContent({ locale, page }: { locale: string; page: number }) {
  const t = getLpTranslator(locale);
  // 14-multi-site (CL4): topbar site picker cookie; null = All sites (no filter).
  const siteId = await getActiveSiteId();
  const result = await listLPs({ page, siteId: siteId ?? undefined });

  // ── Permission-denied state (server-resolved by the action) ──────────────────
  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="lp-list-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('list.denied')}
      </div>
    );
  }

  // ── Error state (failed live read → banner, never a 500) ─────────────────────
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="lp-list-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('list.error')}
      </div>
    );
  }

  const rows = result.data.items;
  const reserved = rows.filter((r) => r.status === 'reserved').length;
  const blocked = rows.filter((r) => r.status === 'blocked').length;
  const hold = rows.filter((r) => ['HOLD', 'PENDING', 'QUARANTINED'].includes(r.qaStatus.toUpperCase())).length;

  return (
    <div className="flex flex-col gap-4">
      <p data-testid="lp-list-count-line" className="text-xs text-slate-500">
        {t('list.countLine', { total: result.data.total, reserved, hold, blocked })}
      </p>
      <LpListClient rows={rows} pagination={result.data} labels={buildLabels(locale)} locale={locale} />
    </div>
  );
}

export default async function LicensePlatesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp: { page?: string } = searchParams ? await searchParams : {};
  const page = parsePage(sp.page);
  const t = getLpTranslator(locale);

  return (
    <main
      data-screen="warehouse-lp-list"
      data-prototype-label="lp_list_page"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/lp-screens.jsx:3-215"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('list.breadcrumb.licensePlates') },
        ]}
      />
      <Suspense key={page} fallback={<ListSkeleton />}>
        <ListContent locale={locale} page={page} />
      </Suspense>
    </main>
  );
}
