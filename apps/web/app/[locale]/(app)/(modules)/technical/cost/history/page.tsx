/**
 * 03-technical Cost history (TEC-015) — server page (/technical/cost/history).
 *
 * Real Supabase-backed cost-history surface (org-scoped via withOrgContext + RLS).
 * The server component loads the item list + the `technical.cost.edit` gate; the
 * client island (CostManager) renders the item picker, the cost-history sparkline
 * + Date/Source/Cost/Δ% table, and the cost-edit modal (postCost, with the >20%
 * variance approver gate).
 *
 * Prototype parity:
 *   prototypes/design/Monopilot Design System/technical/other-screens.jsx:633-694
 *   (CostHistoryScreen) — sparkline + Date/Version(source)/Cost(zł)/Δ%/Reason table.
 *   See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 *
 * Split from /technical/cost (Recipe costing). Dual-owned with Finance: Technical
 * edits ONLY items.cost_per_kg + item_cost_history; never Finance costing tables.
 * NUMERIC-exact (strings, no float).
 *
 * UI states: loading (client skeleton on selection), empty (no items / no history),
 * error (failed read), permission-denied (read allowed, edit hidden + amber notice
 * when `technical.cost.edit` is absent), optimistic (modal save → refresh).
 */

import { getTranslations } from 'next-intl/server';

import { listCostItems } from '../_actions/list-cost-items';
import { CostManager, type CostManagerCopy } from '../_components/cost-manager.client';

export const dynamic = 'force-dynamic';

export default async function TechnicalCostHistoryPage() {
  const t = await getTranslations('technical.costHistory');
  const { items, canEdit, state } = await listCostItems();

  const copy: CostManagerCopy = {
    itemLabel: t('itemLabel'),
    itemPlaceholder: t('itemPlaceholder'),
    editCost: t('editCost'),
    selectPrompt: t('selectPrompt'),
    loading: t('loading'),
    loadError: t('loadError'),
    noHistory: t('noHistory', { code: '{code}' }),
    noHistoryCanEdit: t('noHistoryCanEdit'),
    readOnlyNotice: t('readOnlyNotice'),
    tableAriaLabel: t('title'),
    colDate: t('col.date'),
    colSource: t('col.source'),
    colCost: t('col.cost'),
    colDelta: t('col.delta'),
    colReason: t('col.reason'),
    sparklineTitle: t('sparklineTitle'),
    min: t('min'),
    max: t('max'),
    modalTitle: t('modal.title', { code: '{code}' }),
    modalIntro: t('modal.intro'),
    fieldNewCost: t('modal.newCost'),
    fieldCurrency: t('modal.currency'),
    fieldSource: t('modal.source'),
    fieldReason: t('modal.reason'),
    fieldReasonPlaceholder: t('modal.reasonPlaceholder'),
    fieldApprover: t('modal.approver'),
    fieldApproverPlaceholder: t('modal.approverPlaceholder'),
    cancel: t('modal.cancel'),
    record: t('modal.record'),
    source: {
      manual: t('source.manual'),
      d365_sync: t('source.d365_sync'),
      supplier_update: t('source.supplier_update'),
      variance_roll: t('source.variance_roll'),
    },
    err: {
      forbidden: t('error.forbidden'),
      invalid_input: t('error.invalid'),
      not_found: t('error.notFound'),
      approver_required: t('error.approverRequired'),
      persistence_failed: t('error.generic'),
    },
  };

  return (
    <main data-screen="technical-cost-history-page" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        {t('breadcrumb.technical')} / <a href="cost">{t('breadcrumb.cost')}</a> / {t('breadcrumb.history')}
      </nav>

      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="helper mt-1 max-w-3xl">{t('subtitle')}</p>
      </header>

      {state === 'error' ? (
        <div role="alert" data-testid="technical-cost-history-error" className="alert alert-red">
          <div className="alert-title">{t('state.error')}</div>
        </div>
      ) : state === 'empty' ? (
        <div className="card" data-testid="technical-cost-history-empty">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-title">{t('state.emptyTitle')}</div>
            <div className="empty-state-body">{t('state.emptyBody')}</div>
          </div>
        </div>
      ) : (
        <CostManager items={items} canEdit={canEdit} copy={copy} />
      )}
    </main>
  );
}
