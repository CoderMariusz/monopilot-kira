/**
 * T-046 — 03-technical Shelf Life Config (TEC-030) page.
 *
 * Real Supabase-backed list of finished-good shelf-life rules (org-scoped via
 * withOrgContext + RLS), translated from the prototype ShelfLifeScreen
 * (prototypes/design/Monopilot Design System/technical/other-screens.jsx:587-633):
 * PageHeader + 4-KPI grid + Product / Mode / Duration / Date code / Override
 * table + regulatory-preset note. The override modal mirrors
 * prototypes/design/Monopilot Design System/technical/modals.jsx:486-513.
 *
 * Shelf-life is Technical-owned and lives directly on the item master (migration
 * 153 columns shelf_life_days / shelf_life_mode / date_code_format) — there is NO
 * separate shelf-life table, so this needs no migration. Loading / empty / error
 * / permission-denied states are all rendered.
 *
 * Red-line: FG is canonical — the list filters `item_type = 'fg'`; no FA aliases.
 */

import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader } from '@monopilot/ui/Card';
import { PageHeader } from '@monopilot/ui/PageHeader';

import { listShelfLife } from './_actions/list-shelf-life';
import { ShelfLifeTable, type ShelfLifeLabels } from './_components/override-modal';

export const dynamic = 'force-dynamic';

function Kpi({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: string }) {
  return (
    <Card className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums" data-tone={tone}>
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

export default async function TechnicalShelfLifePage() {
  const t = await getTranslations('Technical.shelfLife');
  const { rows, canEdit, state, kpis } = await listShelfLife();

  const labels: ShelfLifeLabels = {
    override: t('override'),
    notConfigured: t('notConfigured'),
    modeUseBy: t('mode.useBy'),
    modeBestBefore: t('mode.bestBefore'),
    days: t('days'),
    dash: '—',
    colProduct: t('col.product'),
    colMode: t('col.mode'),
    colDuration: t('col.duration'),
    colDateCode: t('col.dateCode'),
    colNotes: t('col.notes'),
    colActions: t('col.actions'),
    modalTitle: t('modal.title'),
    warningOverride: t('modal.warning'),
    fieldCurrent: t('modal.current'),
    fieldNewDays: t('modal.newDays'),
    fieldMode: t('modal.mode'),
    fieldDateCode: t('modal.dateCode'),
    fieldReason: t('modal.reason'),
    reasonHelp: t('modal.reasonHelp'),
    reasonPlaceholder: t('modal.reasonPlaceholder'),
    preview: t('modal.preview'),
    cancel: t('modal.cancel'),
    apply: t('modal.apply'),
    errInvalid: t('error.invalid'),
    errForbidden: t('error.forbidden'),
    errNotFound: t('error.notFound'),
    errGeneric: t('error.generic'),
  };

  return (
    <main data-screen="technical-shelf-life" className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        breadcrumb={[{ label: t('breadcrumb.technical') }, { label: t('breadcrumb.shelfLife') }]}
      />

      <section aria-label={t('kpi.region')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={t('kpi.products')} value={kpis.products} sub={t('kpi.productsSub')} tone="default" />
        <Kpi label={t('kpi.useBy')} value={kpis.useBy} sub={t('kpi.useBySub')} tone="red" />
        <Kpi label={t('kpi.bestBefore')} value={kpis.bestBefore} sub={t('kpi.bestBeforeSub')} tone="green" />
        <Kpi label={t('kpi.unconfigured')} value={kpis.unconfigured} sub={t('kpi.unconfiguredSub')} tone="amber" />
      </section>

      {state === 'error' ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
          {t('state.error')}
        </div>
      ) : state === 'empty' ? (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardHeader className="space-y-1 px-6 py-6">
            <h2 className="text-lg font-semibold tracking-tight">{t('state.emptyTitle')}</h2>
            <CardDescription className="text-sm text-muted-foreground">{t('state.emptyBody')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="rounded-xl border bg-white shadow-sm">
          <CardContent className="p-0">
            <ShelfLifeTable rows={rows} labels={labels} canEdit={canEdit} />
          </CardContent>
        </Card>
      )}

      <div
        role="note"
        className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-800"
      >
        {t('regulatoryNote')}
      </div>

      {!canEdit ? (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-800">
          {t('state.readOnly')}
        </div>
      ) : null}
    </main>
  );
}
