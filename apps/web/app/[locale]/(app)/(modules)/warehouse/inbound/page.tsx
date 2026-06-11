/**
 * WAREHOUSE INBOUND SCHEDULE (warehouse/inbound).
 *
 * Owner-reported gap: from the warehouse PC you cannot see open POs / TOs / what
 * arrives TODAY. This screen answers "what is coming in, and is anything late?"
 * by reading the OPEN purchase + transfer orders and partitioning them into
 * Overdue / Arriving today / Upcoming.
 *
 * CROSS-MODULE READ: this warehouse screen reads PLANNING (procurement) data via
 * the reviewed planning Server Actions — listPurchaseOrders /
 * listPurchaseOrderLineCounts (planning/purchase-orders) + listTransferOrders /
 * listTransferWarehouses (planning/transfer-orders). They are imported VERBATIM,
 * never authored here; RBAC (planning.read) is enforced INSIDE those actions, so
 * a `forbidden` result renders the denied panel and is never client-trusted.
 *
 * Parity basis: there is NO dedicated JSX prototype for this screen. The visual
 * language is BASED ON the established warehouse dashboard + GRN-list family
 * (warehouse/page.tsx dashboard + warehouse/grns grn-list.client.tsx): dense
 * shadcn Table, mono doc links, status Badge, Card-wrapped counted sections,
 * em-dash for absent values. Documented as the parity basis per
 * _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md (spec-driven source).
 *
 * UI states: loading (Suspense skeleton, no CLS), empty (per-section honest
 * empties + a global empty when nothing is open), error (failed live read →
 * banner), permission-denied (forbidden → denied panel). Optimistic — N/A
 * (read-only surface). No raw <select>. i18n via the staged warehouse-inbound
 * bundle (en + pl real, EN fallback) — no inline strings.
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listPurchaseOrders } from '../../planning/purchase-orders/_actions/actions';
import { listPurchaseOrderLineCounts } from '../../planning/purchase-orders/_actions/po-form-data';
import { listTransferOrders } from '../../planning/transfer-orders/_actions/actions';
import { listTransferWarehouses } from '../../planning/transfer-orders/_actions/to-form-data';
import { getWhInboundTranslator } from './wh-inbound-labels';
import {
  InboundScheduleClient,
  type InboundLabels,
  type InboundRow,
} from './_components/inbound-schedule.client';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

// Open = not-yet-received, not-cancelled. These are the documents whose goods are
// still expected at the dock.
const OPEN_PO_STATUSES = ['sent', 'confirmed', 'partially_received'] as const;
const OPEN_TO_STATUSES = ['draft', 'in_transit'] as const;

type InboundRoutePageProps = { params: Promise<{ locale: string }> };

/** YYYY-MM-DD for a (possibly null) date string; null stays null. */
function dateKey(iso: string | null): string | null {
  if (!iso) return null;
  const key = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
}

function wholeDaysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export type InboundPartition = {
  today: InboundRow[];
  overdue: InboundRow[];
  upcoming: InboundRow[];
};

/**
 * Partition open inbound rows against `today` (YYYY-MM-DD, server-provided):
 *   - today    : expectedDate === today
 *   - overdue  : expectedDate !== null && expectedDate < today  (date-desc-ish:
 *                most-overdue first → soonest-overdue date asc puts oldest first)
 *   - upcoming : expectedDate === null OR expectedDate > today, sorted
 *                soonest-first with no-date rows last.
 *
 * Exported so the RTL test asserts the partition directly off fixture dates
 * without a DB. Pure: no `Date.now()`, the clock is the `today` argument.
 */
export function partitionInbound(rows: InboundRow[], today: string): InboundPartition {
  const todayRows: InboundRow[] = [];
  const overdue: InboundRow[] = [];
  const upcoming: InboundRow[] = [];

  for (const row of rows) {
    const key = row.expectedDate;
    if (key !== null && key === today) {
      todayRows.push(row);
    } else if (key !== null && key < today) {
      overdue.push({ ...row, overdueDays: wholeDaysBetween(key, today) });
    } else {
      // key === null (no date) OR key > today.
      upcoming.push(row);
    }
  }

  // Overdue: oldest (most overdue) first.
  overdue.sort((a, b) => (a.expectedDate! < b.expectedDate! ? -1 : a.expectedDate! > b.expectedDate! ? 1 : 0));
  // Upcoming: soonest first, no-date rows last.
  upcoming.sort((a, b) => {
    if (a.expectedDate === null && b.expectedDate === null) return 0;
    if (a.expectedDate === null) return 1;
    if (b.expectedDate === null) return -1;
    return a.expectedDate < b.expectedDate ? -1 : a.expectedDate > b.expectedDate ? 1 : 0;
  });

  return { today: todayRows, overdue, upcoming };
}

function buildLabels(locale: string): InboundLabels {
  const t = getWhInboundTranslator(locale);
  return {
    sections: {
      today: t('inbound.sections.today'),
      todaySub: t('inbound.sections.todaySub'),
      overdue: t('inbound.sections.overdue'),
      overdueSub: t('inbound.sections.overdueSub'),
      upcoming: t('inbound.sections.upcoming'),
      upcomingSub: t('inbound.sections.upcomingSub'),
    },
    columns: {
      doc: t('inbound.columns.doc'),
      type: t('inbound.columns.type'),
      party: t('inbound.columns.party'),
      expected: t('inbound.columns.expected'),
      status: t('inbound.columns.status'),
      lines: t('inbound.columns.lines'),
    },
    type: { po: t('inbound.type.po'), to: t('inbound.type.to') },
    status: {
      sent: t('inbound.status.sent'),
      confirmed: t('inbound.status.confirmed'),
      partially_received: t('inbound.status.partially_received'),
      draft: t('inbound.status.draft'),
      in_transit: t('inbound.status.in_transit'),
    },
    noDate: t('inbound.noDate'),
    overdueBy: t('inbound.overdueBy'),
    todayMarker: t('inbound.today_marker'),
    empty: {
      today: t('inbound.empty.today'),
      overdue: t('inbound.empty.overdue'),
      upcoming: t('inbound.empty.upcoming'),
      all: t('inbound.empty.all'),
    },
  };
}

function InboundSkeleton() {
  return (
    <div data-testid="inbound-loading" aria-busy="true" className="flex flex-col gap-5">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      ))}
    </div>
  );
}

async function InboundContent({ locale }: { locale: string }) {
  const t = getWhInboundTranslator(locale);
  const today = new Date().toISOString().slice(0, 10);

  // Load open POs (per open status) + open TOs + line counts + warehouse names
  // in parallel — the reviewed list actions take a single status, so we fan out
  // and merge. RBAC is enforced inside each action.
  const [poResults, toResults, lineCounts, warehouses] = await Promise.all([
    Promise.all(OPEN_PO_STATUSES.map((status) => listPurchaseOrders({ status, limit: 200 }))),
    Promise.all(OPEN_TO_STATUSES.map((status) => listTransferOrders({ status, limit: 200 }))),
    listPurchaseOrderLineCounts(),
    listTransferWarehouses().catch(() => []),
  ]);

  const allResults = [...poResults, ...toResults];

  // Permission-denied (server-resolved by the planning actions).
  if (allResults.some((r) => !r.ok && r.error === 'forbidden')) {
    return (
      <div
        role="note"
        data-testid="inbound-denied"
        className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800"
      >
        {t('inbound.denied')}
      </div>
    );
  }

  // Error (failed live read → banner, never a 500).
  if (allResults.some((r) => !r.ok)) {
    return (
      <div
        role="alert"
        data-testid="inbound-error"
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {t('inbound.error')}
      </div>
    );
  }

  const warehouseName = new Map(warehouses.map((w) => [w.id, w.code || w.name]));
  const route = (fromId: string | null, toId: string | null): string => {
    const from = fromId ? warehouseName.get(fromId) ?? '—' : '—';
    const dest = toId ? warehouseName.get(toId) ?? '—' : '—';
    return `${from} → ${dest}`;
  };

  const poRows: InboundRow[] = poResults.flatMap((r) =>
    r.ok
      ? r.data.map((po) => ({
          id: `po-${po.id}`,
          type: 'po' as const,
          docNumber: po.poNumber,
          href: `/${locale}/planning/purchase-orders/${po.id}`,
          party: po.supplierName ?? po.supplierCode ?? '—',
          status: po.status,
          expectedDate: dateKey(po.expectedDelivery),
          lineCount: lineCounts[po.id] ?? 0,
          overdueDays: 0,
        }))
      : [],
  );

  const toRows: InboundRow[] = toResults.flatMap((r) =>
    r.ok
      ? r.data.map((to) => ({
          id: `to-${to.id}`,
          type: 'to' as const,
          docNumber: to.toNumber,
          href: `/${locale}/planning/transfer-orders/${to.id}`,
          party: route(to.fromWarehouseId, to.toWarehouseId),
          status: to.status,
          expectedDate: dateKey(to.scheduledDate),
          lineCount: null,
          overdueDays: 0,
        }))
      : [],
  );

  const partition = partitionInbound([...poRows, ...toRows], today);

  return <InboundScheduleClient {...partition} labels={buildLabels(locale)} />;
}

export default async function InboundRoutePage({ params }: InboundRoutePageProps) {
  const { locale } = await params;
  const nav = await getTranslations('Navigation.app.items');
  const t = getWhInboundTranslator(locale);

  return (
    <section
      data-testid="warehouse-inbound"
      data-screen="warehouse-inbound"
      data-parity-basis="spec-driven; visual language based on warehouse dashboard + grns grn-list.client.tsx (no dedicated prototype)"
      className="p-8"
      aria-labelledby="warehouse-inbound-title"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{nav('warehouse')}</p>
            <h1 id="warehouse-inbound-title" className="text-3xl font-semibold tracking-tight text-slate-950">
              {t('inbound.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('inbound.subtitle')}</p>
          </div>
          {/* The receiving flow lives on the scanner — link out, do not re-implement. */}
          <Link
            href={`/${locale}/scanner/receive-po`}
            data-testid="inbound-receive-link"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
          >
            {t('inbound.receiveOnScanner')} →
          </Link>
        </div>

        <div className="mt-8">
          <Suspense fallback={<InboundSkeleton />}>
            <InboundContent locale={locale} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
