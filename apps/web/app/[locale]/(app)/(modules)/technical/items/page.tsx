/**
 * Lane A — 03-technical Items Master list page (T-008 list + reachability).
 *
 * Real Supabase-backed list of public.items (org-scoped via withOrgContext +
 * RLS), with a "+ New item" CTA and per-row Edit / Deactivate gated by the real
 * technical.items.* RBAC family. Loading / empty / error / permission-denied
 * states are all rendered.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:304-352 — `MaterialsListScreen` (TEC-003). Design-system
 * conformance pass: breadcrumb + 20/700 page title, full-width content, dense
 * design table with TabsCounted by type, search + status/D365 filters, 5-tone
 * status/type badges, Allergens + BOMs columns, EmptyState. The interactive list
 * lives in items-table.client.tsx; this server page resolves data + labels only.
 */

import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { listItems } from './_actions/list-items';
import type { DeactivateLabels } from './_components/deactivate-modal';
import type { ItemWizardLabels } from './_components/item-create-wizard';
import { NewItemButton } from './_components/items-manager.client';
import { ItemsTableClient } from './_components/items-table.client';

export const dynamic = 'force-dynamic';

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildWizardLabels(t: Translator): ItemWizardLabels {
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
      grossWeightMax: t('create.fields.grossWeightMax'),
      varianceTolerance: t('create.fields.varianceTolerance'),
      shelfLifeDays: t('create.fields.shelfLifeDays'),
      shelfLifeMode: t('create.fields.shelfLifeMode'),
    },
    catchHint: t('create.catchHint'),
    review: { ready: t('create.review.ready') },
    errors: {
      codeRequired: t('create.errors.codeRequired'),
      nameRequired: t('create.errors.nameRequired'),
      uomRequired: t('create.errors.uomRequired'),
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
        <Link href=".">Technical</Link> / Items
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Items</h1>
          <p className="helper mt-1 max-w-3xl">
            Raw materials, intermediates, finished goods, co-products and by-products — the universal item
            master consumed by BOMs, NPD components and specifications.
          </p>
        </div>
        {canCreate ? <NewItemButton label={newItemLabel} wizardLabels={wizardLabels} /> : null}
      </header>

      {state === 'error' ? (
        <div role="alert" className="alert alert-red">
          <div className="alert-title">Unable to load items</div>
          Please try again.
        </div>
      ) : state === 'empty' ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No items yet</div>
            <div className="empty-state-body">
              {canCreate
                ? 'Create your first item to make it pickable as a component in NPD and BOMs.'
                : 'No items have been created in this organization yet.'}
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
              Showing first {limit} of {total} items.
            </div>
          ) : null}
          <ItemsTableClient
            items={items}
            canEdit={canEdit}
            canDeactivate={canDeactivate}
            editLabel={editLabel}
            deactivateLabel={deactivateLabel}
            wizardLabels={wizardLabels}
            deactivateLabels={deactivateLabels}
          />
        </>
      )}

      {!canCreate && !canEdit && !canDeactivate ? (
        <div role="alert" className="alert alert-amber">
          You can view items but do not have permission to create, edit or deactivate them.
        </div>
      ) : null}
    </main>
  );
}
