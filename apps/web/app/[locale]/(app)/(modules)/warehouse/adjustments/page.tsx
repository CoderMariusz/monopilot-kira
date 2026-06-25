import { PageHeader } from '@monopilot/ui/PageHeader';

import { listStockAdjustments } from './_actions/list-adjustments';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string }> };

function formatDate(value: string, locale: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatItemReference(row: Awaited<ReturnType<typeof listStockAdjustments>>[number]): string {
  const item = [row.itemCode, row.itemName].filter(Boolean).join(' - ');
  const lp = row.lpNumber ? `LP ${row.lpNumber}` : row.lpId ? `LP ${row.lpId}` : '';
  return [item || row.itemId || '', lp].filter(Boolean).join(' / ') || '-';
}

async function AdjustmentsContent({ locale }: { locale: string }) {
  try {
    const rows = await listStockAdjustments();

    if (rows.length === 0) {
      return (
        <div
          data-testid="stock-adjustments-empty"
          data-state="empty"
          className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-sm text-slate-600"
        >
          No stock adjustments found.
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Type</th>
                <th scope="col" className="px-4 py-3">Item / LP reference</th>
                <th scope="col" className="px-4 py-3 text-right">Qty delta</th>
                <th scope="col" className="px-4 py-3">Reason</th>
                <th scope="col" className="px-4 py-3">Created by</th>
                <th scope="col" className="px-4 py-3">Created at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3 font-medium capitalize text-slate-900">
                    {row.direction}
                  </td>
                  <td className="px-4 py-3">{formatItemReference(row)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {row.direction === 'decrease' ? '-' : '+'}
                    {row.adjustmentQty}
                  </td>
                  <td className="px-4 py-3">{row.reason || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                    {row.appliedBy || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(row.appliedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error && error.message === 'forbidden'
      ? 'You do not have permission to view stock adjustments.'
      : 'Stock adjustments could not be loaded.';

    return (
      <div
        role="alert"
        data-testid="stock-adjustments-error"
        data-state={error instanceof Error && error.message === 'forbidden' ? 'permission-denied' : 'error'}
        className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
      >
        {message}
      </div>
    );
  }
}

export default async function StockAdjustmentsPage({ params }: PageProps) {
  const { locale } = await params;

  return (
    <main
      data-screen="warehouse-stock-adjustments-list"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title="Stock adjustments"
        subtitle="Read-only audit list of recent stock quantity adjustments."
        breadcrumb={[
          { label: 'Warehouse', href: `/${locale}/warehouse` },
          { label: 'Stock adjustments' },
        ]}
      />
      <AdjustmentsContent locale={locale} />
    </main>
  );
}
