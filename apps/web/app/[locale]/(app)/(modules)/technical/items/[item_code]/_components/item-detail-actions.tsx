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

function detailToForm(item: ItemDetail): WizardFormState {
  return {
    itemCode: item.itemCode,
    name: item.name,
    description: item.description ?? '',
    itemType: item.itemType,
    status: item.status,
    productGroup: item.productGroup ?? '',
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
}: {
  item: ItemDetail;
  canEdit: boolean;
  canDeactivate: boolean;
  editLabel: string;
  deactivateLabel: string;
  wizardLabels?: ItemWizardLabels;
  deactivateLabels?: DeactivateLabels;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);

  if (!canEdit && !canDeactivate) return null;

  return (
    <div className="flex gap-2">
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

      {canEdit ? (
        <ItemWizard
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode={{ kind: 'edit', itemId: item.id }}
          initialForm={detailToForm(item)}
          labels={wizardLabels}
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
