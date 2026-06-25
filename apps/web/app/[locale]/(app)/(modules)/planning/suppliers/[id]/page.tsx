/**
 * P2-PLANNING — Supplier detail route (/planning/suppliers/[id]).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/planning/
 *   suppliers.jsx:158-403 (plan_supplier_detail) — header + status badge, "Supplier
 *   info" card, and the soft-delete status actions. See supplier-detail-view.tsx for
 *   the per-region anchors + the documented deviations (Products / PO / D365 tabs
 *   dropped — no backing read; the active⇄inactive toggle becomes the real 3-state
 *   active/inactive/blocked transition).
 *
 * Data: the reviewed getSupplier / transitionSupplierStatus actions (imported, never
 * authored), run inside withOrgContext (RLS-scoped). The read is org-scoped, so an
 * out-of-org id returns not_found rather than another org's supplier. RBAC for the
 * transition is enforced server-side inside transitionSupplierStatus.
 *
 * UI states: loading (Suspense skeleton, no CLS), error (failed read → banner),
 * not-found / invalid id (honest panel + back link), permission-denied (org-scoped
 * read → not_found for out-of-org ids; transition surfaces forbidden inline),
 * optimistic (transition pending → buttons busy + disabled).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getMessages } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getSupplier, transitionSupplierStatus, updateSupplier } from '../_actions/actions';
import { SupplierDetailView } from '../_components/supplier-detail-view';
import { resolveSupplierMessages, msg, buildDetailLabels } from '../_components/supplier-labels';
import type { Supplier, SupplierStatus, TransitionSupplierResult, UpdateSupplierResult } from '../_components/supplier-types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

function DetailSkeleton() {
  return (
    <div data-testid="supplier-detail-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      </div>
    </div>
  );
}

type Tree = Record<string, unknown>;

async function DetailContent({ locale, id, m }: { locale: string; id: string; m: Tree }) {
  const result = await getSupplier(id);

  if (!result.ok) {
    if (result.error === 'not_found' || result.error === 'invalid_input') {
      return (
        <div role="note" data-testid="supplier-detail-not-found" className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
          <p className="mb-3">{msg(m, 'detail.notFound')}</p>
          <Link href={`/${locale}/planning/suppliers`} prefetch={false} className="text-blue-700 hover:underline">
            {msg(m, 'detail.backToList')}
          </Link>
        </div>
      );
    }
    return (
      <div role="alert" data-testid="supplier-detail-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {msg(m, 'error')}
      </div>
    );
  }

  return (
    <SupplierDetailView
      supplier={result.data as Supplier}
      labels={buildDetailLabels(m)}
      transitionSupplierStatusAction={
        transitionSupplierStatus as (id: string, status: SupplierStatus) => Promise<TransitionSupplierResult>
      }
      updateSupplierAction={
        updateSupplier as (input: {
          id: string;
          code: string;
          name: string;
          currency: string;
          leadTimeDays: number;
          status: SupplierStatus;
          contact?: Record<string, unknown>;
          notes?: string;
        }) => Promise<UpdateSupplierResult>
      }
      scorecardHref={`/${locale}/planning/suppliers/${id}/scorecard`}
    />
  );
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { locale, id } = await params;

  const messages = (await getMessages()) as Tree;
  const intlSuppliers = (messages.Planning as Tree | undefined)?.suppliers as Tree | undefined;
  const m = resolveSupplierMessages(locale, intlSuppliers);

  return (
    <main
      data-screen="planning-supplier-detail"
      data-prototype-label="plan_supplier_detail"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={msg(m, 'detail.title')}
        breadcrumb={[
          { label: msg(m, 'breadcrumb.planning'), href: `/${locale}/planning` },
          { label: msg(m, 'breadcrumb.suppliers'), href: `/${locale}/planning/suppliers` },
          { label: msg(m, 'detail.breadcrumbCurrent') },
        ]}
      />
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent locale={locale} id={id} m={m} />
      </Suspense>
    </main>
  );
}
