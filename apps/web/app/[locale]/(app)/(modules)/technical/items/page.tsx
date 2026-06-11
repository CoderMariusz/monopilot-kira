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
import { DEFAULT_WIZARD_LABELS, type ItemWizardLabels } from './_components/item-create-wizard';
import { NewItemButton } from './_components/items-manager.client';
import { ItemsTableClient } from './_components/items-table.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/**
 * Resolves the wizard label bundle from the `technical.items` namespace, falling
 * back to the component's DEFAULT_WIZARD_LABELS for any key not yet present in
 * the i18n catalog. The UOM pack-hierarchy keys are staged in
 * `_meta/i18n-staging/item-uom.json` (en+pl) and merged into the live catalog by
 * the established i18n-staging step; until then `t.has` guards keep the labels
 * resolving to the English defaults instead of leaking the raw key path.
 */
export function buildWizardLabels(t: Translator): ItemWizardLabels {
  const D = DEFAULT_WIZARD_LABELS;
  const has = (key: string) => {
    try {
      return t.has(key);
    } catch {
      return false;
    }
  };
  const get = (key: string, fallback: string) => (has(key) ? t(key) : fallback);

  return {
    title: t('create.title'),
    subtitle: t('create.subtitle'),
    cancel: t('create.cancel'),
    back: t('create.back'),
    next: t('create.next'),
    create: t('create.create'),
    creating: t('create.creating'),
    steps: {
      basic: t('create.steps.basic'),
      classification: t('create.steps.classification'),
      weight: t('create.steps.weight'),
      review: t('create.steps.review'),
    },
    fields: {
      itemCode: t('create.fields.itemCode'),
      itemCodeHelp: t('create.fields.itemCodeHelp'),
      name: t('create.fields.name'),
      description: t('create.fields.description'),
      itemType: t('create.fields.itemType'),
      status: t('create.fields.status'),
      uomBase: t('create.fields.uomBase'),
      uomSecondary: t('create.fields.uomSecondary'),
      productGroup: t('create.fields.productGroup'),
      weightMode: t('create.fields.weightMode'),
      nominalWeight: t('create.fields.nominalWeight'),
      tareWeight: t('create.fields.tareWeight'),
      grossWeightMax: t('create.fields.grossWeightMax'),
      gs1Gtin: t('create.fields.gs1Gtin'),
      varianceTolerance: t('create.fields.varianceTolerance'),
      shelfLifeDays: t('create.fields.shelfLifeDays'),
      shelfLifeMode: t('create.fields.shelfLifeMode'),
      packaging: get('create.fields.packaging', D.fields.packaging),
      outputUom: get('create.fields.outputUom', D.fields.outputUom),
      netQtyPerEach: get('create.fields.netQtyPerEach', D.fields.netQtyPerEach),
      eachPerBox: get('create.fields.eachPerBox', D.fields.eachPerBox),
      boxesPerPallet: get('create.fields.boxesPerPallet', D.fields.boxesPerPallet),
    },
    uomLabels: {
      kg: get('create.uomLabels.kg', D.uomLabels.kg),
      g: get('create.uomLabels.g', D.uomLabels.g),
      l: get('create.uomLabels.l', D.uomLabels.l),
      ml: get('create.uomLabels.ml', D.uomLabels.ml),
      szt: get('create.uomLabels.szt', D.uomLabels.szt),
    },
    uomNone: get('create.uomNone', D.uomNone),
    outputUomLabels: {
      base: get('create.outputUomLabels.base', D.outputUomLabels.base),
      each: get('create.outputUomLabels.each', D.outputUomLabels.each),
      box: get('create.outputUomLabels.box', D.outputUomLabels.box),
    },
    packagingHelp: get('create.packagingHelp', D.packagingHelp),
    catchHint: t('create.catchHint'),
    intermediateHint: t('create.intermediateHint'),
    review: {
      ready: t('create.review.ready'),
      packaging: get('create.review.packaging', D.review.packaging),
    },
    errors: {
      codeRequired: t('create.errors.codeRequired'),
      nameRequired: t('create.errors.nameRequired'),
      uomRequired: t('create.errors.uomRequired'),
      netRequired: get('create.errors.netRequired', D.errors.netRequired),
      eachPerBoxRequired: get('create.errors.eachPerBoxRequired', D.errors.eachPerBoxRequired),
    },
    actionErrors: {
      already_exists: t('errors.already_exists'),
      forbidden: t('errors.forbidden'),
      invalid_input: t('errors.invalid_input'),
      not_found: t('errors.not_found'),
      persistence_failed: t('errors.persistence_failed'),
    },
  };
}

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

  const wizardLabels = buildWizardLabels(t);
  const deactivateLabels = buildDeactivateLabels(t);
  const newItemLabel = t('create.open');
  const editLabel = t('detail.edit');
  const deactivateLabel = t('detail.deactivate');

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
            wizardLabels={wizardLabels}
            deactivateLabels={deactivateLabels}
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
