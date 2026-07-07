/**
 * WH-010 — Goods receipts (GRN) list route (/warehouse/grns).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   grn-screens.jsx:3-90 (WhGRNList) — status tabs all/draft/completed/cancelled,
 *   search, source-type filter, dense GRN table. Per-region anchors + documented
 *   deviations live in grns/_components/grn-list.client.tsx.
 *
 * Data: the reviewed listGrns action (imported, never authored), run inside
 * withOrgContext (RLS-scoped). RBAC is enforced server-side in the action; this
 * page never trusts a client flag — a `forbidden` result renders the
 * permission-denied panel.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty + empty-filtered (in the
 * client island), error (failed live read → banner, never a 500),
 * permission-denied (forbidden result → panel), optimistic (N/A on a read list).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { listGrns } from '../_actions/grn-actions';
import { getWhcTranslator } from '../wh-c-labels';
import { GrnListClient, type GrnListFilters, type GrnListLabels } from './_components/grn-list.client';
import {
  GrnListReceiveActions,
  type GrnListReceiveActionLabels,
} from './_components/grn-list-receive-actions';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string; status?: string; q?: string; source?: string }>;
};

function parseGrnFilters(sp: { status?: string; q?: string; source?: string }): GrnListFilters {
  const status = sp.status?.trim() ?? '';
  const allowed = new Set(['draft', 'completed', 'cancelled']);
  return {
    status: status && allowed.has(status) ? status : '',
    search: sp.q?.trim() ?? '',
    sourceType: sp.source?.trim() ?? '',
  };
}

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/grn-screens.jsx:3-90';

const WAREHOUSE_GRN_RECEIVE_PERMISSION = 'warehouse.grn.receive';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

async function resolveCanReceive(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      const { rows } = await ctx.client.query<{ ok: boolean }>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
            and (
              rp.permission is not null
              or r.code = $3
              or coalesce(r.permissions, '[]'::jsonb) ? $3
            )
          limit 1`,
        [ctx.userId, ctx.orgId, WAREHOUSE_GRN_RECEIVE_PERMISSION],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

function buildLabels(t: ReturnType<typeof getWhcTranslator>): GrnListLabels {
  return {
    searchPlaceholder: t('grnList.searchPlaceholder'),
    searchLabel: t('grnList.searchLabel'),
    rowsLabel: t('grnList.rowsLabel'),
    sourceFilterLabel: t('grnList.sourceFilterLabel'),
    sourceAll: t('grnList.sourceAll'),
    emptyAll: t('grnList.emptyAll'),
    emptyFiltered: t('grnList.emptyFiltered'),
    tab: {
      all: t('grnList.tabs.all'),
      draft: t('grnList.tabs.draft'),
      completed: t('grnList.tabs.completed'),
      cancelled: t('grnList.tabs.cancelled'),
    },
    status: {
      draft: t('grnList.status.draft'),
      completed: t('grnList.status.completed'),
      cancelled: t('grnList.status.cancelled'),
      in_progress: t('grnList.status.in_progress'),
    },
    col: {
      grn: t('grnList.columns.grn'),
      source: t('grnList.columns.source'),
      supplier: t('grnList.columns.supplier'),
      warehouse: t('grnList.columns.warehouse'),
      receiptDate: t('grnList.columns.receiptDate'),
      status: t('grnList.columns.status'),
      items: t('grnList.columns.items'),
    },
    pagination: {
      showing: t('grnList.pagination.showing'),
      previous: t('grnList.pagination.previous'),
      next: t('grnList.pagination.next'),
    },
  };
}

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function buildReceiveActionLabels(t: ReturnType<typeof getWhcTranslator>): GrnListReceiveActionLabels {
  return {
    receiveFromPo: t('grnList.receiveFromPo'),
    receiveFromTo: t('grnList.receiveFromTo'),
  };
}

function ListSkeleton() {
  return (
    <div data-testid="grn-list-loading" aria-busy="true" className="flex flex-col gap-4">
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
  filters: GrnListFilters;
}) {
  const t = getWhcTranslator(locale);
  const result = await listGrns({
    page,
    status: filters.status || undefined,
    search: filters.search || undefined,
    sourceType: filters.sourceType || undefined,
  });

  if (!result.ok) {
    if (result.reason === 'forbidden') {
      return (
        <div
          role="alert"
          data-testid="grn-list-denied"
          data-state="permission-denied"
          className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
        >
          {t('grnList.denied')}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-testid="grn-list-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('grnList.error')}
      </div>
    );
  }

  const sourceTypes = [...new Set(result.data.items.map((g) => g.sourceType))].sort();

  return (
    <GrnListClient
      rows={result.data.items}
      pagination={result.data}
      filters={filters}
      sourceTypes={sourceTypes}
      labels={buildLabels(t)}
      locale={locale}
    />
  );
}

export default async function GrnsListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp: { page?: string; status?: string; q?: string; source?: string } = searchParams ? await searchParams : {};
  const page = parsePage(sp.page);
  const filters = parseGrnFilters(sp);
  const suspenseKey = `${page}:${filters.status}:${filters.search}:${filters.sourceType}`;
  const t = getWhcTranslator(locale);
  const canReceive = await resolveCanReceive();

  return (
    <main
      data-screen="warehouse-grn-list"
      data-prototype-label="grn_list_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('grnList.title')}
        subtitle={t('grnList.subtitle')}
        breadcrumb={[
          { label: t('grnList.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('grnList.breadcrumb.grns') },
        ]}
        actions={
          <GrnListReceiveActions
            locale={locale}
            labels={buildReceiveActionLabels(t)}
            canReceive={canReceive}
          />
        }
      />
      <Suspense key={suspenseKey} fallback={<ListSkeleton />}>
        <ListContent locale={locale} page={page} filters={filters} />
      </Suspense>
    </main>
  );
}
