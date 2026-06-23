/**
 * WH-012 — Inventory browser route (/warehouse/inventory).
 *
 * Prototype parity (1:1): prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:3-155 (inventory_browser_page) — By product / By location /
 *   By batch pivots + dense tables. Per-region anchors + deviations live in
 *   inventory/_components/inventory-browser.client.tsx.
 *
 * Data: the reviewed getInventoryByProduct / ByLocation / ByBatch actions
 * (imported, never authored), each run inside withOrgContext (RLS-scoped) over
 * license_plates. RBAC enforced server-side; a `forbidden` result on any pivot
 * renders the permission-denied panel.
 *
 * UI states: loading (Suspense skeleton), empty + empty-filtered (in the client
 * island), error (failed read → banner), permission-denied (forbidden → panel),
 * optimistic (N/A on a read browser).
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  getInventoryByBatch,
  getInventoryByLocation,
  getInventoryByProduct,
} from '../_actions/inventory-actions';
import { getWhcTranslator } from '../wh-c-labels';
import { InventoryBrowserClient, type InventoryBrowserLabels } from './_components/inventory-browser.client';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

const PROTOTYPE_ANCHOR =
  'prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:3-155';

function buildLabels(t: ReturnType<typeof getWhcTranslator>): InventoryBrowserLabels {
  return {
    searchPlaceholder: t('inventory.searchPlaceholder'),
    searchLabel: t('inventory.searchLabel'),
    rowsLabel: t('inventory.rowsLabel'),
    emptyAll: t('inventory.emptyAll'),
    emptyFiltered: t('inventory.emptyFiltered'),
    none: t('inventory.none'),
    pickable: t('inventory.pickable'),
    pivots: {
      product: t('inventory.pivots.product'),
      location: t('inventory.pivots.location'),
      batch: t('inventory.pivots.batch'),
    },
    product: {
      item: t('inventory.product.columns.item'),
      total: t('inventory.product.columns.total'),
      lps: t('inventory.product.columns.lps'),
      earliestExpiry: t('inventory.product.columns.earliestExpiry'),
    },
    location: {
      location: t('inventory.location.columns.location'),
      warehouse: t('inventory.location.columns.warehouse'),
      total: t('inventory.location.columns.total'),
      lps: t('inventory.location.columns.lps'),
    },
    batch: {
      batch: t('inventory.batch.columns.batch'),
      item: t('inventory.batch.columns.item'),
      total: t('inventory.batch.columns.total'),
      lps: t('inventory.batch.columns.lps'),
      earliestExpiry: t('inventory.batch.columns.earliestExpiry'),
    },
  };
}

function BrowserSkeleton() {
  return (
    <div data-testid="inventory-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="h-9 w-72 animate-pulse rounded-full bg-slate-100" />
      <div className="h-12 w-full animate-pulse rounded-xl bg-slate-100" />
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

async function BrowserContent({ locale }: { locale: string }) {
  const t = getWhcTranslator(locale);
  const [product, location, batch] = await Promise.all([
    getInventoryByProduct(),
    getInventoryByLocation(),
    getInventoryByBatch(),
  ]);

  const forbidden = [product, location, batch].some((r) => !r.ok && r.reason === 'forbidden');
  if (forbidden) {
    return (
      <div
        role="alert"
        data-testid="inventory-denied"
        data-state="permission-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('inventory.denied')}
      </div>
    );
  }

  if (!product.ok || !location.ok || !batch.ok) {
    return (
      <div
        role="alert"
        data-testid="inventory-error"
        data-state="error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('inventory.error')}
      </div>
    );
  }

  return (
    <InventoryBrowserClient
      byProduct={product.data}
      byLocation={location.data}
      byBatch={batch.data}
      labels={buildLabels(t)}
    />
  );
}

export default async function InventoryBrowserPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getWhcTranslator(locale);

  return (
    <main
      data-screen="warehouse-inventory-browser"
      data-prototype-label="inventory_browser_page"
      data-prototype-anchor={PROTOTYPE_ANCHOR}
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        breadcrumb={[
          { label: t('inventory.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('inventory.breadcrumb.inventory') },
        ]}
      />
      <Suspense fallback={<BrowserSkeleton />}>
        <BrowserContent locale={locale} />
      </Suspense>
    </main>
  );
}
