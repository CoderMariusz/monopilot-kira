/**
 * P2-PLANNING — Suppliers master list route (/planning/suppliers).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:29-152 (plan_supplier_list) — KPI strip, status tabs + counts,
 *   search, dense table, per-row View, "＋ New supplier" modal. See
 *   supplier-list-view.tsx for the per-region anchors + the documented deviations
 *   (no-source D365 / products / PO columns dropped against the reviewed action).
 *
 * Data: the reviewed listSuppliers / createSupplier actions (imported, never
 * authored) over public.suppliers (mig 261), run inside withOrgContext (RLS-scoped).
 * RBAC for create is enforced server-side inside createSupplier; this page never
 * trusts a client flag. The list read is RLS-scoped so a denied user simply sees an
 * empty org-scoped list.
 *
 * Deep-link: ?new=1 auto-opens the create modal.
 *
 * i18n: Planning.suppliers.* — staged in _meta/i18n-staging/suppliers.json (en+pl
 * real, ro/uk mirror en). resolveSupplierMessages prefers next-intl once the keys
 * are merged, falling back to the staged tree today (no shared i18n file edited).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (EmptyState in the view),
 * error (failed live read → banner, never a 500), permission-denied (RLS-scoped
 * read → empty list; create surfaces forbidden inline), optimistic (create pending
 * in the modal).
 */
import { Suspense } from 'react';
import { getMessages } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listSuppliers, createSupplier } from './_actions/actions';
import { SupplierListView } from './_components/supplier-list-view';
import { resolveSupplierMessages, msg, buildListLabels } from './_components/supplier-labels';
import type { Supplier, SupplierStatus } from './_components/supplier-types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ new?: string }>;
};

function ListSkeleton() {
  return (
    <div data-testid="supplier-list-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="h-8 w-80 animate-pulse rounded-md bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

type Tree = Record<string, unknown>;

async function ListContent({ locale, autoOpenCreate }: { locale: string; autoOpenCreate: boolean }) {
  const messages = (await getMessages()) as Tree;
  const intlSuppliers = (messages.Planning as Tree | undefined)?.suppliers as Tree | undefined;
  const m = resolveSupplierMessages(locale, intlSuppliers);

  const result = await listSuppliers({ limit: 200 });

  if (!result.ok) {
    return (
      <div role="alert" data-testid="supplier-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {msg(m, 'error')}
      </div>
    );
  }

  return (
    <SupplierListView
      locale={locale}
      suppliers={result.data as Supplier[]}
      autoOpenCreate={autoOpenCreate}
      labels={buildListLabels(m)}
      createSupplierAction={createSupplier as CreateSupplierSeam}
    />
  );
}

// Cast seam: the 'use server' createSupplier exports as (rawInput: unknown) but the
// view types it structurally — same runtime contract, just a narrower signature.
type CreateSupplierSeam = (input: {
  code: string;
  name: string;
  currency: string;
  leadTimeDays: number;
  status: SupplierStatus;
  contact?: Record<string, unknown>;
  notes?: string;
}) => ReturnType<typeof createSupplier>;

export default async function SuppliersListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = await searchParams;
  const autoOpenCreate = sp.new === '1';

  const messages = (await getMessages()) as Tree;
  const intlSuppliers = (messages.Planning as Tree | undefined)?.suppliers as Tree | undefined;
  const m = resolveSupplierMessages(locale, intlSuppliers);

  return (
    <main
      data-screen="planning-supplier-list"
      data-prototype-label="plan_supplier_list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={msg(m, 'title')}
        subtitle={msg(m, 'subtitle')}
        breadcrumb={[
          { label: msg(m, 'breadcrumb.planning'), href: `/${locale}/planning` },
          { label: msg(m, 'breadcrumb.suppliers') },
        ]}
      />
      <Suspense fallback={<ListSkeleton />}>
        <ListContent locale={locale} autoOpenCreate={autoOpenCreate} />
      </Suspense>
    </main>
  );
}
