/**
 * Lane A — 03-technical Items Master list page (T-008 list + reachability).
 *
 * Real Supabase-backed list of public.items (org-scoped via withOrgContext +
 * RLS), with a "+ New item" CTA and per-row Edit / Deactivate gated by the real
 * technical.items.* RBAC family. Loading / empty / error / permission-denied
 * states are all rendered.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:931-1073 — `ProductsListScreen` (TEC-001): the master list of
 * every item (finished goods, intermediates, raw materials, co-products,
 * by-products — the single source of truth per PRD §6). Design-system conformance:
 * breadcrumb (Technical › Products) + 20/700 page title + one-line muted
 * description, full-width content, TabsCounted by type, search + status/D365
 * filters, dense design table with mono codes, 5-tone status/type badges,
 * Allergens + BOMs columns, EmptyState. The interactive list lives in
 * items-table.client.tsx; this server page resolves data + labels only.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listItems } from './_actions/list-items';
import type { DeactivateLabels } from './_components/deactivate-modal';
import { buildTransitionLabels } from './_components/item-transition-labels';
import { buildWizardLabels } from './_components/item-wizard-labels';
import { NewItemButton } from './_components/items-manager.client';
import { ItemsTableClient, type ItemsTableLabels } from './_components/items-table.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildDeactivateLabels(t: Translator): DeactivateLabels {
  return {
    title: t('deactivate.title'),
    // subtitle/warning/confirmLabel carry {code}/{name} placeholders the client
    // modal interpolates per row — t.raw avoids next-intl FORMATTING_ERROR.
    subtitle: t.raw('deactivate.subtitle'),
    warning: t.raw('deactivate.warning'),
    reason: t('deactivate.reason'),
    reasonRequired: t('deactivate.reasonRequired'),
    reasons: {
      discontinued: t('deactivate.reasons.discontinued'),
      recipe_change: t('deactivate.reasons.recipe_change'),
      d365_mismatch: t('deactivate.reasons.d365_mismatch'),
      other: t('deactivate.reasons.other'),
    },
    notes: t('deactivate.notes'),
    notesRequired: t('deactivate.notesRequired'),
    confirmLabel: t.raw('deactivate.confirmLabel'),
    confirmMismatch: t('deactivate.confirmMismatch'),
    cancel: t('deactivate.cancel'),
    confirm: t('deactivate.confirm'),
    deactivating: t('deactivate.deactivating'),
    actionErrors: {
      already_exists: t('errors.already_exists'),
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

export default async function TechnicalItemsPage() {
  const { items, canCreate, canEdit, canDeactivate, state, limit, total, truncated } = await listItems();
  const t = await getTranslations('technical.items');
  const tItems = await getTranslations('items');

  const wizardLabels = buildWizardLabels(t);
  wizardLabels.fields.listPriceGbp = tItems('list_price_gbp_label');
  const deactivateLabels = buildDeactivateLabels(t);
  const transitionLabels = buildTransitionLabels(t);
  const newItemLabel = t('create.open');
  const editLabel = t('detail.edit');
  const deactivateLabel = t('detail.deactivate');

  // Items master-list chrome — localized tabs / filter pills / column headers /
  // search placeholder / footer + the type & status badge maps (reused from the
  // wizard bundle). has()-guarded so any not-yet-merged key falls back to English.
  const has = (key: string) => {
    try {
      return t.has(key);
    } catch {
      return false;
    }
  };
  const gt = (key: string, fallback: string) => (has(key) ? t(key) : fallback);
  const tableLabels: ItemsTableLabels = {
    typeLabels: wizardLabels.typeLabels,
    statusLabels: wizardLabels.statusLabels,
    tabLabels: {
      all: gt('list.tabs.all', 'All'),
      rm: gt('list.tabs.rm', 'Raw materials'),
      ingredient: gt('list.tabs.ingredient', 'Ingredients'),
      intermediate: gt('list.tabs.intermediate', 'Intermediate'),
      fg: gt('list.tabs.fg', 'Finished goods'),
      co_product: gt('list.tabs.co_product', 'Co-products'),
      byproduct: gt('list.tabs.byproduct', 'By-products'),
      packaging: gt('list.tabs.packaging', 'Packaging'),
    },
    statusFilterLabels: {
      all: gt('list.statusFilters.all', 'All status'),
      active: gt('list.statusFilters.active', 'Active'),
      draft: gt('list.statusFilters.draft', 'Draft'),
      deprecated: gt('list.statusFilters.deprecated', 'Deprecated'),
      blocked: gt('list.statusFilters.blocked', 'Blocked'),
    },
    d365FilterLabels: {
      all: gt('list.d365Filters.all', 'D365: all'),
      synced: gt('list.d365Filters.synced', 'Synced'),
      drift: gt('list.d365Filters.drift', 'Drift'),
      unsynced: gt('list.d365Filters.unsynced', 'Not synced'),
    },
    columns: {
      code: gt('list.columns.code', 'Code'),
      name: gt('list.columns.name', 'Name'),
      type: gt('list.columns.type', 'Type'),
      uom: gt('list.columns.uom', 'UoM'),
      costPerKg: gt('list.columns.costPerKg', 'Cost / kg (zł)'),
      allergens: gt('list.columns.allergens', 'Allergens'),
      boms: gt('list.columns.boms', 'BOMs'),
      updated: gt('list.columns.updated', 'Updated'),
      status: gt('list.columns.status', 'Status'),
      actions: gt('list.columns.actions', 'Actions'),
    },
    searchPlaceholder: gt('list.searchPlaceholder', 'Search by code or name…'),
    // {shown}/{total} are interpolated client-side — t.raw avoids next-intl FORMATTING_ERROR.
    footer: has('list.footer') ? (t.raw('list.footer') as string) : '{shown} of {total} items',
  };

  return (
    <main data-screen="technical-items" className="flex w-full flex-col gap-4 px-6 py-6">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href=".">{t('list.breadcrumbRoot')}</Link> / {t('list.breadcrumb')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('list.title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('list.description')}</p>
        </div>
        {canCreate ? <NewItemButton label={newItemLabel} wizardLabels={wizardLabels} /> : null}
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">{t('list.errorTitle')}</div>
          {t('list.errorBody')}
        </div>
      ) : state === 'empty' ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">{t('list.emptyTitle')}</div>
            <div className="empty-state-body">
              {canCreate ? t('list.emptyBodyCreate') : t('list.emptyBodyView')}
            </div>
            {canCreate ? (
              <div className="empty-state-action">
                <NewItemButton label={newItemLabel} wizardLabels={wizardLabels} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {truncated ? (
            <div role="alert" className="alert alert-amber">
              {t('list.truncated', { limit, total })}
            </div>
          ) : null}
          <ItemsTableClient
            items={items}
            canEdit={canEdit}
            canDeactivate={canDeactivate}
            editLabel={editLabel}
            deactivateLabel={deactivateLabel}
            allergensLabel={t('detail.allergens')}
            filterEmptyTitle={t('list.filterEmptyTitle')}
            filterEmptyBody={t('list.filterEmptyBody')}
            labels={tableLabels}
            wizardLabels={wizardLabels}
            deactivateLabels={deactivateLabels}
            transitionLabels={transitionLabels}
          />
        </>
      )}

      {!canCreate && !canEdit && !canDeactivate ? (
        <div role="alert" className="alert alert-amber">
          {t('list.viewerOnly')}
        </div>
      ) : null}
    </main>
  );
}
