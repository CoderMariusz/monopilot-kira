/**
 * WH-019 — `/warehouse/expiry` expiry-management page.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/warehouse/
 *   other-screens.jsx:375-508 (expiry_management_page) — summary strip (red/amber
 *   count cards) + tier sections with dense rows (LP, item, batch, expiry, days
 *   left, location, status) + per-row action column. See expiry-dashboard.client.tsx
 *   for per-region anchors + the documented deviations.
 *
 * Server Component: reads org-scoped data via the `getExpiryDashboard` Server Action
 * (owned by the Codex lane — imported, never authored). RBAC
 * (warehouse.inventory.read) is enforced INSIDE the action; this page surfaces the
 * action's `forbidden` reason as the denied panel and never trusts a client flag.
 *
 * i18n: the `warehouse` namespace is not yet merged into next-intl, so labels are
 * resolved server-side from the staged bundle (_meta/i18n-staging/warehouse-d.json)
 * via getWhdTranslator (en + pl real, EN fallback per missing key). Strings are
 * passed down as plain props — no inline JSX strings.
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (no expiring LPs copy),
 * error (failed live read → banner, never a 500), permission-denied (forbidden →
 * denied panel, nothing privileged rendered). Optimistic — N/A (read-only; the
 * "Force block" mutation is a later lane, rendered disabled).
 *
 * Data note: getExpiryDashboard returns the FEFO `tier` (red/amber), item, location,
 * warehouse, qty, uom and expiry date — but NOT a per-LP status or batch number, so
 * those columns render the neutral "—" placeholder (never fabricated).
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import { Suspense } from 'react';

import { PageHeader } from '@monopilot/ui/PageHeader';

import { getExpiryDashboard } from '../_actions/expiry-actions';
import { getWhdTranslator } from '../wh-d-labels';
import { ExpiryDashboardClient, type ExpiryLabels, type ExpiryRow } from './_components/expiry-dashboard.client';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string }>;
};

function ExpirySkeleton() {
  return (
    <div data-testid="expiry-loading" aria-busy="true" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
    </div>
  );
}

function buildExpiryLabels(locale: string): ExpiryLabels {
  const t = getWhdTranslator(locale);
  return {
    summary: {
      red: t('expiryPage.summary.red'),
      redSub: t('expiryPage.summary.redSub'),
      amber: t('expiryPage.summary.amber'),
      amberSub: t('expiryPage.summary.amberSub'),
    },
    red: { title: t('expiryPage.red.title'), empty: t('expiryPage.red.empty') },
    amber: { title: t('expiryPage.amber.title'), empty: t('expiryPage.amber.empty') },
    columns: {
      lp: t('expiryPage.columns.lp'),
      item: t('expiryPage.columns.item'),
      batch: t('expiryPage.columns.batch'),
      expiry: t('expiryPage.columns.expiry'),
      daysLeft: t('expiryPage.columns.daysLeft'),
      location: t('expiryPage.columns.location'),
      status: t('expiryPage.columns.status'),
      action: t('expiryPage.columns.action'),
    },
    rows: t('expiryPage.rows'),
    daysLeft: t('expiryPage.daysLeft'),
    expired: t('expiryPage.expired'),
    forceBlock: t('expiryPage.forceBlock'),
    forceBlockComingSoon: t('expiryPage.forceBlockComingSoon'),
    none: t('expiryPage.none'),
    empty: t('expiryPage.empty'),
    status: {
      available: t('dashboard.status.available'),
      reserved: t('dashboard.status.reserved'),
      allocated: t('dashboard.status.allocated'),
      received: t('dashboard.status.received'),
      quarantine: t('dashboard.status.quarantine'),
      blocked: t('dashboard.status.blocked'),
    },
  };
}

function daysFromNow(iso: string): number {
  const exp = new Date(iso).getTime();
  if (Number.isNaN(exp)) return 0;
  return Math.floor((exp - Date.now()) / 86_400_000);
}

async function ExpiryContent({ locale }: { locale: string }) {
  const t = getWhdTranslator(locale);
  const result = await getExpiryDashboard();

  // ── Permission-denied state (server-resolved by the action) ──────────────────
  if (!result.ok && result.reason === 'forbidden') {
    return (
      <div
        role="note"
        data-testid="expiry-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('expiryPage.denied')}
      </div>
    );
  }

  // ── Error state (failed live read → banner, never a 500) ─────────────────────
  if (!result.ok) {
    return (
      <div
        role="alert"
        data-testid="expiry-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('expiryPage.error')}
      </div>
    );
  }

  const rows: ExpiryRow[] = result.data.rows.map((r) => ({
    lpId: r.lpId,
    lpNumber: r.lpNumber,
    tier: r.tier,
    itemCode: r.itemCode,
    itemName: r.itemName,
    // getExpiryDashboard does not expose batch number or per-LP status — never fabricated.
    batchNumber: null,
    locationCode: r.locationCode,
    warehouseCode: r.warehouseCode,
    quantity: r.quantity,
    uom: r.uom,
    expiryDate: r.expiryDate,
    daysLeft: daysFromNow(r.expiryDate),
    status: '',
  }));

  return (
    <ExpiryDashboardClient
      rows={rows}
      redCount={result.data.redCount}
      amberCount={result.data.amberCount}
      labels={buildExpiryLabels(locale)}
      locale={locale}
    />
  );
}

export default async function WarehouseExpiryPage({ params }: PageProps) {
  const { locale } = await params;
  const t = getWhdTranslator(locale);

  return (
    <main
      data-screen="warehouse-expiry"
      data-prototype-label="expiry_management_page"
      data-prototype-anchor="prototypes/design/Monopilot Design System/warehouse/other-screens.jsx:375-508"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('expiryPage.title')}
        subtitle={t('expiryPage.subtitle')}
        breadcrumb={[
          { label: t('expiryPage.breadcrumb.warehouse'), href: `/${locale}/warehouse` },
          { label: t('expiryPage.breadcrumb.expiry') },
        ]}
      />
      <Suspense fallback={<ExpirySkeleton />}>
        <ExpiryContent locale={locale} />
      </Suspense>
    </main>
  );
}
