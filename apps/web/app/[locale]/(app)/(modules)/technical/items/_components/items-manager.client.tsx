'use client';

/**
 * Lane A — 03-technical Items Master client island.
 *
 * The "+ New item" CTA (T-033 / TEC-011 — 4-step wizard) and the per-row Edit
 * (TEC-013 — wizard reuse in edit mode) / Deactivate (T-035 / TEC-081 — reason +
 * type-to-confirm modal) actions for the Materials/Items master list
 * (prototypes/design/Monopilot Design System/technical/other-screens.jsx:304-352
 * — `MaterialsListScreen`, TEC-003). All three surfaces call the real createItem /
 * updateItem / deactivateItem Server Actions under withOrgContext + RLS.
 *
 * This island is now a thin wrapper: the create/edit form lives in
 * `item-create-wizard.tsx` (ItemWizard) and the deactivate flow in
 * `deactivate-modal.tsx` (DeactivateItemModal). Both keep the established local
 * (non-Radix) Dialog deviation — see those files' headers. Localized labels are
 * resolved server-side by the page and threaded down; English fallbacks keep the
 * components self-sufficient when labels are omitted.
 */

import React from 'react';

import { Button } from '@monopilot/ui/Button';
import { type SelectOption } from '@monopilot/ui/Select';

import { type ItemListItem } from '../_actions/shared';
import { DeactivateItemModal, type DeactivateLabels } from './deactivate-modal';
import {
  type ItemWizardLabels,
  ItemWizard,
  type WizardFormState,
} from './item-create-wizard';
import {
  DEFAULT_TRANSITION_LABELS,
  type StatusTransitionLabels,
} from './item-transition-labels';
import { StatusTransitionModal } from './status-transition-modal';

function rowToForm(item: ItemListItem): WizardFormState {
  return {
    itemCode: item.itemCode,
    name: item.name,
    description: item.description ?? '',
    itemType: item.itemType,
    status: item.status,
    productGroup: item.productGroup ?? '',
    // A11 — supplier link. The list row does NOT carry the item's current active
    // supplier (listItems reads only public.items), so we leave this blank and let
    // the user pick in EDIT mode rather than over-fetch per row. A chosen supplier
    // is attached on save via createItemSupplierSpec.
    supplierCode: '',
    uomBase: item.uomBase,
    uomSecondary: item.uomSecondary ?? '',
    weightMode: item.weightMode,
    nominalWeight: item.nominalWeight ?? '',
    tareWeight: item.tareWeight ?? '',
    grossWeightMax: item.grossWeightMax ?? '',
    gs1Gtin: item.gs1Gtin ?? '',
    varianceTolerancePct: item.varianceTolerancePct ?? '',
    shelfLifeDays: item.shelfLifeDays === null ? '' : String(item.shelfLifeDays),
    shelfLifeMode:
      item.shelfLifeMode === 'use_by' || item.shelfLifeMode === 'best_before' ? item.shelfLifeMode : '',
    outputUom: item.outputUom ?? 'base',
    netQtyPerEach: item.netQtyPerEach ?? '',
    eachPerBox: item.eachPerBox == null ? '' : String(item.eachPerBox),
    boxesPerPallet: item.boxesPerPallet == null ? '' : String(item.boxesPerPallet),
    listPriceGbp: item.listPriceGbp ?? '',
  };
}

export function NewItemButton({
  label,
  wizardLabels,
  supplierOptions = [],
  autoOpen = false,
}: {
  label: string;
  wizardLabels?: ItemWizardLabels;
  /** A11 — org supplier list (CODE → "CODE — Name") for the wizard's optional supplier link. */
  supplierOptions?: SelectOption[];
  /**
   * F6 — deep-link auto-open (?modal=create). The page renders this CTA twice
   * (header + empty-state), so the auto-open must be owned by exactly ONE
   * instance to avoid a double modal. Mirrors the planning WO/PO `autoOpenCreate`
   * prop convention (seeds the open state); defaults off so the other instance
   * is a plain button.
   */
  autoOpen?: boolean;
}) {
  // F6 — deep-link auto-open: the page owns the `?modal=create` read and passes
  // `autoOpen` to exactly ONE of the two rendered CTAs (header vs empty-state),
  // so a fresh-org deep-link opens a single create wizard, not a double modal.
  const [open, setOpen] = React.useState(autoOpen);
  return (
    <>
      <Button
        type="button"
        className="btn-primary"
        data-modal-id="TEC-ITEM-ADD"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ItemWizard
        open={open}
        onClose={() => setOpen(false)}
        mode={{ kind: 'create' }}
        labels={wizardLabels}
        supplierOptions={supplierOptions}
      />
    </>
  );
}

export function ItemRowActions({
  item,
  canEdit,
  canDeactivate,
  editLabel,
  deactivateLabel,
  allergensLabel,
  wizardLabels,
  deactivateLabels,
  transitionLabels = DEFAULT_TRANSITION_LABELS,
  supplierOptions = [],
  supplierIdByCode = {},
}: {
  item: ItemListItem;
  canEdit: boolean;
  canDeactivate: boolean;
  editLabel: string;
  deactivateLabel: string;
  allergensLabel: string;
  wizardLabels?: ItemWizardLabels;
  deactivateLabels?: DeactivateLabels;
  transitionLabels?: StatusTransitionLabels;
  /** A11 — org supplier list (CODE → "CODE — Name") for the edit wizard's supplier picker. */
  supplierOptions?: SelectOption[];
  /** A11 — supplier CODE → UUID map so EDIT-mode save can call createItemSupplierSpec. */
  supplierIdByCode?: Record<string, string>;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [activateOpen, setActivateOpen] = React.useState(false);
  // Row quick-action for audit finding #8: draft rows get an inline "Activate"
  // (the dominant stuck case). Deprecate/Reactivate live on the detail header.
  const canActivateDraft = canEdit && item.status === 'draft';

  const allergensLink = (
    <a
      href={`/technical/items/${encodeURIComponent(item.itemCode)}`}
      data-testid={`item-allergens-link-${item.itemCode}`}
      className="font-medium text-blue-600 underline-offset-4 hover:underline"
    >
      {allergensLabel}
    </a>
  );

  if (!canEdit && !canDeactivate) {
    return <span className="flex justify-end gap-2">{allergensLink}</span>;
  }

  return (
    <span className="flex justify-end gap-2">
      {allergensLink}
      {canActivateDraft ? (
        <button
          type="button"
          data-testid={`item-activate-${item.itemCode}`}
          className="font-medium text-green-700 underline-offset-4 hover:underline"
          onClick={() => setActivateOpen(true)}
        >
          {transitionLabels.activate}
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="font-medium text-blue-600 underline-offset-4 hover:underline"
          onClick={() => setEditOpen(true)}
        >
          {editLabel}
        </button>
      ) : null}
      {canDeactivate && item.status !== 'blocked' ? (
        <button
          type="button"
          className="font-medium text-red-600 underline-offset-4 hover:underline"
          onClick={() => setDeactivateOpen(true)}
        >
          {deactivateLabel}
        </button>
      ) : null}

      {canEdit ? (
        <ItemWizard
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode={{ kind: 'edit', itemId: item.id }}
          initialForm={rowToForm(item)}
          labels={wizardLabels}
          supplierOptions={supplierOptions}
          supplierIdByCode={supplierIdByCode}
        />
      ) : null}

      {canDeactivate ? (
        <DeactivateItemModal
          open={deactivateOpen}
          onClose={() => setDeactivateOpen(false)}
          itemId={item.id}
          itemCode={item.itemCode}
          itemName={item.name}
          labels={deactivateLabels}
        />
      ) : null}

      {canActivateDraft ? (
        <StatusTransitionModal
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
          itemId={item.id}
          itemCode={item.itemCode}
          itemName={item.name}
          toStatus="active"
          title={transitionLabels.activateTitle}
          body={transitionLabels.activateBody}
          labels={transitionLabels}
        />
      ) : null}
    </span>
  );
}
