import { getTranslations } from 'next-intl/server';

import { getInventoryValuation } from './_actions/get-inventory-valuation';

export const dynamic = 'force-dynamic';

export default async function FinanceInventoryValuationPage() {
  const t = await getTranslations('Finance.valuation');
  const result = await getInventoryValuation();

  if (!result.ok && result.reason === 'forbidden') {
    return (
      <main className="p-6 lg:p-8" aria-labelledby="finance-valuation-title">
        <h1 id="finance-valuation-title" className="text-3xl font-semibold text-slate-950">
          {t('title')}
        </h1>
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {t('permissionDenied')}
        </div>
      </main>
    );
  }

  if (!result.ok) {
    return (
      <main className="p-6 lg:p-8" aria-labelledby="finance-valuation-title">
        <h1 id="finance-valuation-title" className="text-3xl font-semibold text-slate-950">
          {t('title')}
        </h1>
        <div role="alert" className="mt-6 rounded border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {t('error')}
        </div>
      </main>
    );
  }

  const { rows, grandTotals, unvalued } = result.data;

  return (
    <main className="p-6 lg:p-8" aria-labelledby="finance-valuation-title">
      <div className="mb-6">
        <h1 id="finance-valuation-title" className="text-3xl font-semibold text-slate-950">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-slate-500">
          {t('meta', { itemCount: rows.length, method: t('methodWac') })}
        </p>
      </div>

      <section aria-label={t('grandTotalLabel')} className="mb-6 rounded border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-medium uppercase text-slate-500">{t('grandTotalLabel')}</p>
        {grandTotals.length === 0 ? (
          <p className="mt-2 text-2xl font-semibold text-slate-950">0</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-4">
            {grandTotals.map((total) => (
              <div key={total.currency}>
                <p className="text-2xl font-semibold text-slate-950">{total.totalValue}</p>
                <p className="text-xs text-slate-500">{total.currency}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {unvalued.lpCount > 0 ? (
        <section
          aria-label={t('unvalued.title')}
          className="mb-6 rounded border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900"
          data-testid="finance-valuation-unvalued"
        >
          <p className="font-medium">{t('unvalued.title')}</p>
          <p className="mt-1 text-amber-800">
            {t('unvalued.summary', { lpCount: unvalued.lpCount, qty: unvalued.qty })}
          </p>
          <p className="mt-1 text-xs text-amber-700">{t('unvalued.hint')}</p>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          {t('empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm" aria-label={t('tableLabel')}>
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('columns.itemCode')}</th>
                <th className="px-4 py-3">{t('columns.itemName')}</th>
                <th className="px-4 py-3 text-right">{t('columns.qtyOnHand')}</th>
                <th className="px-4 py-3 text-right">{t('columns.wac')}</th>
                <th className="px-4 py-3 text-right">{t('columns.totalValue')}</th>
                <th className="px-4 py-3">{t('columns.currency')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={`${row.itemId}:${row.currency}`} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-950">{row.itemCode ?? row.itemId}</td>
                  <td className="px-4 py-3">{row.itemName ?? t('unmatchedItem')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.qtyOnHand}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.wac}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.totalValue}</td>
                  <td className="px-4 py-3">{row.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
