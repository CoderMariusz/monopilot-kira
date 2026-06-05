/**
 * T-046 — 03-technical Shelf Life Config (TEC-030) page.
 *
 * Real Supabase-backed list of finished-good shelf-life rules (org-scoped via
 * withOrgContext + RLS), translated from the prototype ShelfLifeScreen
 * (prototypes/design/Monopilot Design System/technical/other-screens.jsx:587-633):
 * breadcrumb + .page-title + muted desc + 4-KPI row (.kpi accent) + Product /
 * Mode / Duration / Date code / Override table (.card/.table) + regulatory note
 * (.alert-blue). The override modal mirrors modals.jsx:486-513.
 *
 * Shelf-life is Technical-owned and lives directly on the item master (migration
 * 153 columns shelf_life_days / shelf_life_mode / date_code_format) — there is NO
 * separate shelf-life table, so this needs no migration. Loading / empty / error
 * / permission-denied states are all rendered.
 *
 * i18n: namespace is the canonical lowercase `technical.shelfLife` (matching the
 * cost / nutrition / labResults siblings), present in all four locales. The page
 * previously read the capital `Technical.shelfLife` namespace which only existed
 * in en.json — that hard-crashed render in pl/ro/uk ("Unable to load").
 *
 * Red-line: FG is canonical — the list filters `item_type = 'fg'`; no FA aliases.
 */

import { getTranslations } from 'next-intl/server';

import { listShelfLife } from './_actions/list-shelf-life';
import { ShelfLifeTable, type ShelfLifeLabels } from './_components/override-modal';

export const dynamic = 'force-dynamic';

export default async function TechnicalShelfLifePage() {
  const t = await getTranslations('technical.shelfLife');
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
    <main data-screen="technical-shelf-life" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / {t('breadcrumb.shelfLife')}
      </nav>

      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>

      <section aria-label={t('kpi.region')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="kpi">
          <div className="kpi-label">{t('kpi.products')}</div>
          <div className="kpi-value tabular-nums">{kpis.products}</div>
          <div className="kpi-change muted">{t('kpi.productsSub')}</div>
        </div>
        <div className="kpi red">
          <div className="kpi-label">{t('kpi.useBy')}</div>
          <div className="kpi-value tabular-nums">{kpis.useBy}</div>
          <div className="kpi-change muted">{t('kpi.useBySub')}</div>
        </div>
        <div className="kpi green">
          <div className="kpi-label">{t('kpi.bestBefore')}</div>
          <div className="kpi-value tabular-nums">{kpis.bestBefore}</div>
          <div className="kpi-change muted">{t('kpi.bestBeforeSub')}</div>
        </div>
        <div className="kpi amber">
          <div className="kpi-label">{t('kpi.unconfigured')}</div>
          <div className="kpi-value tabular-nums">{kpis.unconfigured}</div>
          <div className="kpi-change muted">{t('kpi.unconfiguredSub')}</div>
        </div>
      </section>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('state.error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">{t('state.emptyTitle')}</div>
            <div className="empty-state-body">{t('state.emptyBody')}</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <ShelfLifeTable rows={rows} labels={labels} canEdit={canEdit} />
        </div>
      )}

      <div role="note" className="alert alert-blue">
        {t('regulatoryNote')}
      </div>

      {!canEdit ? (
        <div role="alert" className="alert alert-amber">
          {t('state.readOnly')}
        </div>
      ) : null}
    </main>
  );
}
