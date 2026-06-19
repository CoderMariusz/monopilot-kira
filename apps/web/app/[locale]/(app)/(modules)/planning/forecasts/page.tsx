/**
 * Wave E6 (second slice) — SCREEN /planning/forecasts (mig 302 demand_forecasts).
 *
 * Independent (sales/forecast) demand input that runMrp can net against
 * (mrp_runs demand_source='forecast', mig 178). The grid is item × ISO-week
 * (forward window) with inline-editable qty cells.
 *
 * Prototype anchor: NONE EXISTS — prototypes/design/Monopilot Design System/
 * planning/ and planning-ext/ contain no demand-forecast screen (same sweep as
 * /planning/mrp + /planning/reorder-thresholds: zero matches). Presentation
 * follows the locked MON-design-system conventions reused from the sibling
 * planning screens (PageHeader + card/table/empty-state + @monopilot/ui).
 *
 * Real data only: list/upsert/copy/import go through the org-scoped Server
 * Actions over public.demand_forecasts; the item picker searches public.items.
 * RBAC enforced server-side (read scheduler.run.read, write planning.forecast.manage).
 */
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@monopilot/ui/PageHeader';

import {
  copyForecastWeek,
  importForecastCsv,
  listForecasts,
  searchForecastItems,
  upsertForecast,
} from '../_actions/forecasts';
import { ForecastsView, type ForecastsLabels } from './_components/forecasts-view';

// Org-scoped DB read per request — never statically prerendered.
export const dynamic = 'force-dynamic';

type ForecastsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function ForecastsPage({ params }: ForecastsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('Planning');

  const labels: ForecastsLabels = {
    add: t('forecasts.add'),
    copyWeek: t('forecasts.copyWeek'),
    copying: t('forecasts.copying'),
    importCsv: t('forecasts.importCsv'),
    empty: t('forecasts.empty'),
    emptyHint: t('forecasts.emptyHint'),
    loading: t('forecasts.loading'),
    denied: t('forecasts.denied'),
    error: t('forecasts.error'),
    itemColumn: t('forecasts.itemColumn'),
    saving: t('forecasts.saving'),
    cellError: t('forecasts.cellError'),
    copyResult: t('forecasts.copyResult'),
    picker: {
      trigger: t('forecasts.picker.trigger'),
      searchLabel: t('forecasts.picker.searchLabel'),
      searchPlaceholder: t('forecasts.picker.searchPlaceholder'),
      loading: t('forecasts.picker.loading'),
      empty: t('forecasts.picker.empty'),
      cancel: t('forecasts.picker.cancel'),
      error: t('forecasts.picker.error'),
    },
    importModal: {
      title: t('forecasts.importModal.title'),
      step1: t('forecasts.importModal.step1'),
      step2: t('forecasts.importModal.step2'),
      step3: t('forecasts.importModal.step3'),
      step4: t('forecasts.importModal.step4'),
      pasteLabel: t('forecasts.importModal.pasteLabel'),
      pastePlaceholder: t('forecasts.importModal.pastePlaceholder'),
      parse: t('forecasts.importModal.parse'),
      parsedRows: t('forecasts.importModal.parsedRows'),
      noRows: t('forecasts.importModal.noRows'),
      submit: t('forecasts.importModal.submit'),
      submitting: t('forecasts.importModal.submitting'),
      cancel: t('forecasts.importModal.cancel'),
      close: t('forecasts.importModal.close'),
      resultImported: t('forecasts.importModal.resultImported'),
      resultErrors: t('forecasts.importModal.resultErrors'),
      formatHint: t('forecasts.importModal.formatHint'),
      colItem: t('forecasts.importModal.colItem'),
      colWeek: t('forecasts.importModal.colWeek'),
      colQty: t('forecasts.importModal.colQty'),
    },
  };

  return (
    <main
      data-screen="planning-forecasts"
      data-testid="planning-forecasts-page"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6"
    >
      <PageHeader
        title={t('forecasts.title')}
        subtitle={t('forecasts.subtitle')}
        breadcrumb={[
          { label: t('breadcrumb.planning'), href: `/${locale}/planning` },
          { label: t('forecasts.breadcrumb') },
        ]}
      />
      <ForecastsView
        labels={labels}
        listAction={listForecasts}
        upsertAction={upsertForecast}
        copyWeekAction={copyForecastWeek}
        importCsvAction={importForecastCsv}
        searchItemsAction={searchForecastItems}
      />
    </main>
  );
}
