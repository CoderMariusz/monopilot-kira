/**
 * WAVE E10 — stock-count sessions list route (/warehouse/counts).
 *
 * Spec-driven (no JSX prototype exists for stock counts under
 * prototypes/design/Monopilot Design System/warehouse/). Built off the in-repo
 * warehouse list+detail convention (reservations/page.tsx): PageHeader +
 * Suspense skeleton + a list client island with status badges + a shadcn create
 * dialog. Per-region notes live in the client island.
 *
 * Data: the reviewed listCountSessions Server Action (backend lane — imported,
 * never authored) throws on error / forbidden; the page calls it in try/catch and
 * renders the error / permission-denied panels (RBAC is enforced server-side in
 * the action; the page never trusts a client flag). Warehouse options for the
 * create dialog come from the reviewed listTransferWarehouses read
 * (planning/transfer-orders) — the real public.warehouses master, never a
 * hardcoded list. createCountSession is wrapped by a thin page-authored adapter
 * Server Action (createCountSessionSafe) that maps a throw → a CountClientResult
 * code; the island surfaces `forbidden`/`error` inline.
 *
 * UI states: loading (Suspense skeleton), empty (client island), error (failed
 * read → banner), permission-denied (forbidden read → panel), optimistic (Create
 * disabled + "Creating…").
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { createCountSession, listCountSessions } from './_actions/count-actions';
import {
  listTransferWarehouses,
  type WarehouseOption,
} from '../../planning/transfer-orders/_actions/to-form-data';
import { getCountsTranslator } from './counts-labels';
import {
  CountSessionListClient,
  type CountSessionListLabels,
} from './_components/count-session-list.client';
import { toCountErrorCode, type CountClientResult } from './_components/count-client-result';
import type { CreateCountSessionInput } from './_actions/count-types';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function buildLabels(t: ReturnType<typeof getCountsTranslator>): CountSessionListLabels {
  return {
    newSession: t('list.newSession'),
    rowsLabel: t('list.rowsLabel'),
    empty: t('list.empty'),
    none: t('list.none'),
    columns: {
      session: t('list.columns.session'),
      warehouse: t('list.columns.warehouse'),
      type: t('list.columns.type'),
      status: t('list.columns.status'),
      lines: t('list.columns.lines'),
      variances: t('list.columns.variances'),
      created: t('list.columns.created'),
    },
    type: {
      cycle: t('list.type.cycle'),
      full: t('list.type.full'),
      spot: t('list.type.spot'),
    },
    status: {
      open: t('list.status.open'),
      in_review: t('list.status.in_review'),
      approved: t('list.status.approved'),
      applied: t('list.status.applied'),
      cancelled: t('list.status.cancelled'),
    },
    linesSummary: t('list.linesSummary'),
    create: {
      title: t('create.title'),
      intro: t('create.intro'),
      warehouseLabel: t('create.warehouseLabel'),
      warehousePlaceholder: t('create.warehousePlaceholder'),
      warehouseEmpty: t('create.warehouseEmpty'),
      typeLabel: t('create.typeLabel'),
      typePlaceholder: t('create.typePlaceholder'),
      type: {
        cycle: t('create.type.cycle'),
        full: t('create.type.full'),
        spot: t('create.type.spot'),
      },
      cancel: t('create.cancel'),
      create: t('create.create'),
      creating: t('create.creating'),
      denied: t('create.denied'),
      error: t('create.error'),
    },
  };
}

/**
 * Page-authored adapter (legitimate wiring, NOT data access): wraps the throwing
 * createCountSession into a CountClientResult the list island can surface inline.
 * RBAC stays server-side inside createCountSession.
 */
async function createCountSessionSafe(
  input: CreateCountSessionInput,
): Promise<CountClientResult<{ id: string }>> {
  'use server';
  try {
    const id = await createCountSession(input);
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, code: toCountErrorCode(e instanceof Error ? e.message : undefined) };
  }
}

function ListSkeleton() {
  return (
    <div data-testid="count-session-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function ListContent({ locale }: { locale: string }) {
  const t = getCountsTranslator(locale);

  let sessions;
  try {
    sessions = await listCountSessions();
  } catch (e) {
    const code = toCountErrorCode(e instanceof Error ? e.message : undefined);
    return (
      <div
        role="alert"
        data-testid={code === 'forbidden' ? 'count-session-denied' : 'count-session-error'}
        data-state={code === 'forbidden' ? 'permission-denied' : 'error'}
        className={
          code === 'forbidden'
            ? 'rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800'
            : 'rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700'
        }
      >
        {code === 'forbidden' ? t('list.denied') : t('list.error')}
      </div>
    );
  }

  // Warehouse options are best-effort: a failed read just yields an empty picker
  // (the dialog shows its "no warehouses" copy) — never blocks the list.
  let warehouses: WarehouseOption[];
  try {
    warehouses = await listTransferWarehouses();
  } catch {
    warehouses = [];
  }

  return (
    <CountSessionListClient
      sessions={sessions}
      warehouses={warehouses}
      labels={buildLabels(t)}
      locale={locale}
      createAction={createCountSessionSafe}
    />
  );
}

export default async function CountSessionsListPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getCountsTranslator(locale);

  return (
    <main
      data-screen="warehouse-count-list"
      data-prototype-label="count_sessions_list_page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('list.title')}
        subtitle={t('list.subtitle')}
        breadcrumb={[
          { label: t('list.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('list.breadcrumb.counts') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} />
      </Suspense>
    </main>
  );
}
