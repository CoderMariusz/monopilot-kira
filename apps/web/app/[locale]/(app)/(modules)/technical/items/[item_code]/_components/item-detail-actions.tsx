'use client';

/**
 * T-034 — TEC-012 Item Detail page header actions.
 *
 * Prototype parity: prototypes/design/Monopilot Design System/technical/
 * other-screens.jsx:363-365 (`MaterialDetailScreen` PageHeader actions — the
 * "Where-used" + "Edit" buttons). The detail-page Edit reuses the TEC-011 wizard
 * in edit mode (T-033) and Deactivate opens the TEC-081 modal (T-035), both gated
 * by the real technical.items.{edit,deactivate} permissions resolved server-side.
 */

import React from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';
import { type SelectOption } from '@monopilot/ui/Select';

import type { ItemDetail } from '../../_actions/get-item';
import {
  DeactivateItemModal,
  type DeactivateLabels,
} from '../../_components/deactivate-modal';
import {
  type ItemWizardLabels,
  ItemWizard,
  type WizardFormState,
} from '../../_components/item-create-wizard';
import {
  DEFAULT_TRANSITION_LABELS,
  type StatusTransitionLabels,
  transitionForStatus,
} from '../../_components/item-transition-labels';
import { StatusTransitionModal } from '../../_components/status-transition-modal';

function detailToForm(item: ItemDetail): WizardFormState {
  return {
    itemCode: item.itemCode,
    name: item.name,
    description: item.description ?? '',
    itemType: item.itemType,
    status: item.status,
    productGroup: item.productGroup ?? '',
    categoryCode: item.categoryCode ?? '',
    // A11 — supplier link. The detail-page edit wizard is NOT wired with the org
    // supplier list (no supplierOptions/supplierIdByCode below), so its supplier
    // picker shows only the "none" row and never attaches a spec — richer
    // multi-supplier management lives in this page's own Supplier Specs tab.
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
    // Pack hierarchy (migration 267) — seed the edit form so it preserves the row.
    outputUom: item.outputUom ?? 'base',
    netQtyPerEach: item.netQtyPerEach ?? '',
    eachPerBox: item.eachPerBox == null ? '' : String(item.eachPerBox),
    boxesPerPallet: item.boxesPerPallet == null ? '' : String(item.boxesPerPallet),
    listPriceGbp: item.listPriceGbp ?? '',
  };
}

export function ItemDetailActions({
  item,
  canEdit,
  canDeactivate,
  editLabel,
  deactivateLabel,
  wizardLabels,
  deactivateLabels,
  transitionLabels = DEFAULT_TRANSITION_LABELS,
  categoryOptions = [],
}: {
  item: ItemDetail;
  canEdit: boolean;
  canDeactivate: boolean;
  editLabel: string;
  deactivateLabel: string;
  wizardLabels?: ItemWizardLabels;
  deactivateLabels?: DeactivateLabels;
  transitionLabels?: StatusTransitionLabels;
  categoryOptions?: SelectOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [transitionOpen, setTransitionOpen] = React.useState(false);

  if (!canEdit && !canDeactivate) return null;

  // Lifecycle action for the current status (audit finding #8): draft → Activate
  // (primary), active → Deprecate, deprecated → Reactivate; blocked offers none
  // (it stays owned by the TEC-081 deactivate flow). Same write permission as Edit.
  const transition = canEdit ? transitionForStatus(item.status, transitionLabels) : null;

  return (
    <div className="flex gap-2">
      {transition ? (
        <Button
          type="button"
          className={transition.primary ? 'btn-primary' : 'btn-secondary'}
          data-action={`item-status-${transition.toStatus}`}
          onClick={() => setTransitionOpen(true)}
        >
          {transition.label}
        </Button>
      ) : null}
      {canEdit ? (
        <Button type="button" className="btn-secondary" onClick={() => setEditOpen(true)}>
          {editLabel}
        </Button>
      ) : null}
      {canDeactivate && item.status !== 'blocked' ? (
        <Button type="button" className="btn-danger" onClick={() => setDeactivateOpen(true)}>
          {deactivateLabel}
        </Button>
      ) : null}

      {transition ? (
        <StatusTransitionModal
          open={transitionOpen}
          onClose={() => setTransitionOpen(false)}
          itemId={item.id}
          itemCode={item.itemCode}
          itemName={item.name}
          toStatus={transition.toStatus}
          title={transition.title}
          body={transition.body}
          labels={transitionLabels}
          onTransitioned={() => router.refresh()}
        />
      ) : null}

      {canEdit ? (
        <ItemWizard
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode={{ kind: 'edit', itemId: item.id }}
          initialForm={detailToForm(item)}
          labels={wizardLabels}
          categoryOptions={categoryOptions}
          onSaved={() => router.refresh()}
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
          onDeactivated={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

export default ItemDetailActions;
