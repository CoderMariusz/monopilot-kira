/**
 * 03-technical Recipe costing (TEC-013) — server page (/technical/cost).
 *
 * Real BOM-driven standard-cost roll-up (org-scoped via withOrgContext + RLS).
 * The server component loads the set of products that have a BOM header; the
 * client island renders the product picker and, per selection, the rolled-up
 * material cost = Σ(line.quantity × items.cost_per_kg) computed in SQL NUMERIC.
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:536-585
 *   (CostingScreen) — KPI row + cost breakdown bars + total + yield note.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Cost HISTORY (the previous content of this route) moved to /technical/cost/history.
 *
 * Ownership (dual with Finance): reads ONLY items.cost_per_kg + bom_*; never the
 * Finance standard-cost / valuation / variance tables. NUMERIC-exact (strings).
 *
 * UI states: loading (client skeleton on selection), empty (no BOMs / no costed
 * lines), error (failed read), permission-denied (RLS org-scoped — recipe cost is
 * a read surface; edits live on /technical/cost/history), optimistic — N/A (read).
 */

import { getTranslations } from 'next-intl/server';

import { listCostedProducts } from './_actions/list-recipe-cost';
import { RecipeCostClient, type RecipeCostCopy } from './_components/recipe-cost.client';

export const dynamic = 'force-dynamic';

export default async function TechnicalRecipeCostPage() {
  const t = await getTranslations('technical.recipeCost');
  const { products, state } = await listCostedProducts();

  const copy: RecipeCostCopy = {
    selectLabel: t('selectLabel'),
    selectPlaceholder: t('selectPlaceholder'),
    selectPrompt: t('selectPrompt'),
    loading: t('loading'),
    loadError: t('loadError'),
    kpiStdCost: t('kpi.stdCost'),
    kpiStdCostSub: t('kpi.stdCostSub'),
    kpiYield: t('kpi.yield'),
    kpiYieldSub: t('kpi.yieldSub'),
    kpiComponents: t('kpi.components'),
    kpiComponentsSub: t('kpi.componentsSub'),
    kpiCosted: t('kpi.costed'),
    kpiCostedSub: t('kpi.costedSub'),
    breakdownTitle: t('breakdownTitle'),
    totalLabel: t('totalLabel'),
    noLines: t('noLines'),
    noCost: t('noCost'),
    bomNote: t('bomNote', { version: '{version}', status: '{status}' }),
    uncosted: t('uncosted'),
    exportCostSheet: t('exportCostSheet'),
    csvComponent: t('csv.component'),
    csvComponentName: t('csv.componentName'),
    csvComponentType: t('csv.componentType'),
    csvQuantity: t('csv.quantity'),
    csvUom: t('csv.uom'),
    csvUnitCost: t('csv.unitCost'),
    csvLineCost: t('csv.lineCost'),
    csvTotal: t('csv.total'),
    recompute: t('recompute'),
    recomputeTitle: t('recomputeModal.title'),
    recomputeIntro: t('recomputeModal.intro'),
    recomputeNote: t('recomputeModal.note'),
    recomputeConfirm: t('recomputeModal.confirm'),
    cancel: t('recomputeModal.cancel'),
    seeNpdCosting: t('seeNpdCosting'),
  };

  return (
    <main data-screen="technical-cost-page" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / {t('breadcrumb.cost')}
      </nav>

      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>

      {state === 'error' ? (
        <div role="alert" data-testid="technical-cost-error" className="alert alert-red">
          <div className="alert-title">{t('state.error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" data-testid="technical-cost-empty">
          <div className="empty-state">
            <div className="empty-state-icon">💰</div>
            <div className="empty-state-title">{t('state.emptyTitle')}</div>
            <div className="empty-state-body">{t('state.emptyBody')}</div>
          </div>
        </div>
      ) : (
        <RecipeCostClient products={products} copy={copy} />
      )}
    </main>
  );
}
