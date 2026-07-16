import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { listCustomers } from '../customers/_actions/customer-actions';
import { createRma, listRmaReasonCodes, listRmas } from '../_actions/rma-actions';
import { ShippingTabs } from '../shipments/_components/shipping-tabs';
import { RmaListView, type RmaListLabels } from './_components/rma-list-view';
import type { RmaStatus } from '../_actions/rma-actions-types';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ status?: string; new?: string }>;
};

function parseStatus(value: string | undefined): string {
  const status = value?.trim() ?? '';
  const allowed = new Set(['pending', 'approved', 'receiving', 'received', 'processed', 'closed']);
  return status && allowed.has(status) ? status : '';
}

function ListSkeleton() {
  return <div data-testid="rma-list-loading" aria-busy="true" className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />;
}

function buildLabels(t: Awaited<ReturnType<typeof getTranslations>>): RmaListLabels {
  return {
    createRma: t('createRma'),
    rowsCount: t('rowsCount'),
    view: t('view'),
    allStatuses: t('allStatuses'),
    statusFilterLabel: t('statusFilterLabel'),
    empty: { title: t('empty.title'), body: t('empty.body') },
    status: {
      pending: t('status.pending'),
      approved: t('status.approved'),
      receiving: t('status.receiving'),
      received: t('status.received'),
      processed: t('status.processed'),
      closed: t('status.closed'),
    },
    disposition: {
      none: t('disposition.none'),
      restock: t('disposition.restock'),
      scrap: t('disposition.scrap'),
      quality_hold: t('disposition.quality_hold'),
    },
    columns: {
      rma: t('columns.rma'),
      salesOrder: t('columns.salesOrder'),
      customer: t('columns.customer'),
      reason: t('columns.reason'),
      lines: t('columns.lines'),
      status: t('columns.status'),
      created: t('columns.created'),
      disposition: t('columns.disposition'),
      actions: t('columns.actions'),
    },
    create: {
      title: t('create.title'),
      customerLabel: t('create.customerLabel'),
      customerPlaceholder: t('create.customerPlaceholder'),
      salesOrderLabel: t('create.salesOrderLabel'),
      salesOrderPlaceholder: t('create.salesOrderPlaceholder'),
      reasonLabel: t('create.reasonLabel'),
      reasonPlaceholder: t('create.reasonPlaceholder'),
      notesLabel: t('create.notesLabel'),
      notesPlaceholder: t('create.notesPlaceholder'),
      productLabel: t('create.productLabel'),
      productPlaceholder: t('create.productPlaceholder'),
      qtyLabel: t('create.qtyLabel'),
      addLine: t('create.addLine'),
      removeLine: t('create.removeLine'),
      submit: t('create.submit'),
      submitting: t('create.submitting'),
      cancel: t('create.cancel'),
      errors: {
        linesRequired: t('create.errors.linesRequired'),
        invalid_input: t('errors.invalid_input'),
        forbidden: t('errors.forbidden'),
        not_found: t('errors.not_found'),
        persistence_failed: t('errors.persistence_failed'),
      },
    },
  };
}

async function ListContent({ locale, statusFilter }: { locale: string; statusFilter: string }) {
  const t = await getTranslations('Shipping.rma');
  const [listResult, customersResult, reasonResult] = await Promise.all([
    listRmas({ status: statusFilter || undefined }),
    listCustomers({ activeOnly: true }),
    listRmaReasonCodes(),
  ]);

  if (!listResult.ok) {
    return (
      <div role="alert" data-testid="rma-list-error" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
        {t('error')}
      </div>
    );
  }

  const customers =
    customersResult.ok && customersResult.data
      ? customersResult.data.map((c) => ({ id: c.id, code: c.code, name: c.name }))
      : [];
  const reasonCodes = reasonResult.ok ? reasonResult.data : [];

  return (
    <RmaListView
      locale={locale}
      rmas={listResult.data}
      statusFilter={statusFilter}
      labels={buildLabels(t)}
      customers={customers}
      reasonCodes={reasonCodes}
      createRmaAction={createRma}
    />
  );
}

export default async function RmaListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  const statusFilter = parseStatus(sp.status);
  const t = await getTranslations('Shipping.rma');
  const tShip = await getTranslations('Shipping.shipments');

  return (
    <main
      data-screen="shipping-rma-list"
      data-prototype-label="rma_list_page"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.shipping'), href: `/${locale}/shipping` }, { label: t('breadcrumb.rma') }]}
      />
      <ShippingTabs
        locale={locale}
        labels={{
          salesOrders: tShip('tabs.salesOrders'),
          shipments: tShip('tabs.shipments'),
          customers: tShip('tabs.customers'),
          rma: tShip('tabs.rma'),
        }}
      />
      <Suspense key={statusFilter} fallback={<ListSkeleton />}>
        <ListContent locale={locale} statusFilter={statusFilter} />
      </Suspense>
    </main>
  );
}
