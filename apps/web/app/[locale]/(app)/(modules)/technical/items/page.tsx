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

import { type SelectOption } from '@monopilot/ui/Select';

import { listSuppliers } from '../../planning/suppliers/_actions/actions';
import { listActiveProductCategories } from '../../../../../../actions/reference/product-categories/list';
import { listItems } from './_actions/list-items';
import { ITEM_TYPES, type ItemType } from './_actions/shared';
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
      invalid_category: t.has('errors.invalid_category') ? t('errors.invalid_category') : 'Choose an active product category or leave blank.',
    },
  };
}

export default async function TechnicalItemsPage({
  searchParams,
}: {
  searchParams?: Promise<{ modal?: string; type?: string }>;
}) {
  // F6 — the "+ New item" CTA is rendered twice (header + empty-state). The
  // ?modal=create deep-link auto-open must be owned by exactly ONE instance
  // (the always-present header CTA) to avoid a double modal.
  const params = await searchParams;
  const autoOpenCreate = params?.modal === 'create';
  // W2-T4 — ?type=<item_type> deep-link pre-selects a type tab. The retired
  // /settings/products screen redirects here with ?type=fg (finished goods).
  const initialTab: ItemType | undefined = ITEM_TYPES.find((tab) => tab === params?.type);
  const { items, canCreate, canEdit, canDeactivate, state, limit, total, truncated } = await listItems();
  const t = await getTranslations('technical.items');
  const tItems = await getTranslations('items');

  // A11 — optional supplier link in the create/edit wizard. Resolve the org
  // supplier master server-side (when the user can create OR edit) and thread it
  // down to the wizard, mirroring how labels/list data are loaded here. The field
  // is optional, so a failed/empty list degrades gracefully to "no suppliers"
  // (just the none row). supplierOptions value = supplier CODE (matches the
  // createItem payload); supplierIdByCode maps each code → UUID so the EDIT-mode
  // save can call createItemSupplierSpec, which keys its row on the supplier id.
  let supplierOptions: SelectOption[] = [];
  let categoryOptions: SelectOption[] = [];
  const supplierIdByCode: Record<string, string> = {};
  if (canCreate || canEdit) {
    const [suppliers, categories] = await Promise.all([
      listSuppliers({ status: 'active', limit: 200 }),
      listActiveProductCategories(),
    ]);
    if (suppliers.ok) {
      supplierOptions = suppliers.data.map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` }));
      for (const s of suppliers.data) supplierIdByCode[s.code] = s.id;
    }
    if (categories.ok) {
      categoryOptions = categories.data.map((c) => ({ value: c.code, label: c.label }));
    }
  }

  const wizardLabels = buildWizardLabels(t);
  wizardLabels.fields.listPriceGbp = tItems('list_price_gbp_label');
  const deactivateLabels = buildDeactivateLabels(t);
  const transitionLabels = buildTransitionLabels(t);
  const newItemLabel = t('create.open');
  const editLabel = t('detail.edit');
  const deactivateLabel = t('detail.deactivate');

  // Items master-list chrome — localized tabs / filter pills / column headers /
  // search placeholder / footer + the type & status badge maps (reused from the
  // wizard bundle).
  const tableLabels: ItemsTableLabels = {
    typeLabels: wizardLabels.typeLabels,
    statusLabels: wizardLabels.statusLabels,
    tabLabels: {
      all: t('list.tabs.all'),
      rm: t('list.tabs.rm'),
      ingredient: t('list.tabs.ingredient'),
      intermediate: t('list.tabs.intermediate'),
      fg: t('list.tabs.fg'),
      co_product: t('list.tabs.co_product'),
      byproduct: t('list.tabs.byproduct'),
      packaging: t('list.tabs.packaging'),
    },
    statusFilterLabels: {
      all: t('list.statusFilters.all'),
      active: t('list.statusFilters.active'),
      draft: t('list.statusFilters.draft'),
      deprecated: t('list.statusFilters.deprecated'),
      blocked: t('list.statusFilters.blocked'),
    },
    d365FilterLabels: {
      all: t('list.d365Filters.all'),
      synced: t('list.d365Filters.synced'),
      drift: t('list.d365Filters.drift'),
      unsynced: t('list.d365Filters.unsynced'),
    },
    columns: {
      code: t('list.columns.code'),
      name: t('list.columns.name'),
      type: t('list.columns.type'),
      uom: t('list.columns.uom'),
      costPerKg: t('list.columns.costPerKg'),
      allergens: t('list.columns.allergens'),
      boms: t('list.columns.boms'),
      updated: t('list.columns.updated'),
      status: t('list.columns.status'),
      actions: t('list.columns.actions'),
    },
    searchPlaceholder: t('list.searchPlaceholder'),
    // {shown}/{total} are interpolated client-side — t.raw avoids next-intl FORMATTING_ERROR.
    footer: t.raw('list.footer') as string,
    aria: {
      itemType: t('create.fields.itemType'),
      search: t('list.searchPlaceholder'),
      statusFilter: t('create.fields.status'),
      d365Filter: t('detail.tabs.d365'),
      table: t('list.title'),
    },
  };

  return (
    <main
      data-screen="technical-items"
      data-prototype-source="prototypes/design/Monopilot Design System/technical/other-screens.jsx:931-1073"
      className="flex w-full flex-col gap-4 px-6 py-6"
    >
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href=".">{t('list.breadcrumbRoot')}</Link> / {t('list.breadcrumb')}
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{t('list.title')}</h1>
          <p className="helper mt-1 max-w-3xl">{t('list.description')}</p>
        </div>
        {canCreate ? (
          <NewItemButton
            label={newItemLabel}
            wizardLabels={wizardLabels}
            supplierOptions={supplierOptions}
            categoryOptions={categoryOptions}
            autoOpen={autoOpenCreate}
          />
        ) : null}
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
                <NewItemButton label={newItemLabel} wizardLabels={wizardLabels} supplierOptions={supplierOptions} categoryOptions={categoryOptions} />
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
            initialTab={initialTab}
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
            supplierOptions={supplierOptions}
            categoryOptions={categoryOptions}
            supplierIdByCode={supplierIdByCode}
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
