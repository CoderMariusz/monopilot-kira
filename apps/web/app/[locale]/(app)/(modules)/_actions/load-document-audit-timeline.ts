'use server';

import { hasPermission } from '../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../lib/auth/with-org-context';
import { getDocumentAuditTimeline } from './get-document-audit-timeline';
import {
  DOCUMENT_AUDIT_ENTITY_TYPES,
  type DocumentAuditEntityType,
  type LoadDocumentAuditTimelineInput,
  type LoadDocumentAuditTimelineResult,
  type QueryClient,
} from './document-audit-timeline.types';

function isEntityType(value: string): value is DocumentAuditEntityType {
  return (DOCUMENT_AUDIT_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Gate-parity map: for each entity type, the SAME permission the corresponding
 * detail page / primary read action enforces.
 *
 * Evidence:
 *   purchase_order  → getPurchaseOrder (planning/purchase-orders/_actions/actions.ts:382)
 *                     has NO hasPermission call — org-RLS only → null
 *   transfer_order  → transfer-orders/_actions/to-actions.ts: no hasPermission call → null
 *   sales_order     → getSalesOrder (shipping/_actions/so-actions.ts:541)
 *                     requirePermission(ctx, SHIP_SO_READ) where SHIP_SO_READ = 'ship.dashboard.view'
 *   grn             → getGrnDetail (warehouse/_actions/grn-actions.ts:109)
 *                     hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION) = 'warehouse.inventory.read'
 *   quality_hold    → listHolds / getHoldDetail (quality/_actions/hold-actions.ts:223)
 *                     hasPermission(ctx, 'quality.dashboard.view')
 *   ncr_report      → getNcrDetail (quality/_actions/ncr-actions.ts:361)
 *                     hasPermission(ctx, 'quality.dashboard.view')
 *   license_plate   → listLPs (warehouse/_actions/lp-actions.ts:65)
 *                     hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION) = 'warehouse.inventory.read'
 */
const ENTITY_READ_PERMISSION: Record<DocumentAuditEntityType, string | null> = {
  purchase_order: null,
  transfer_order: null,
  sales_order: 'ship.dashboard.view',
  grn: 'warehouse.inventory.read',
  quality_hold: 'quality.dashboard.view',
  ncr_report: 'quality.dashboard.view',
  license_plate: 'warehouse.inventory.read',
};

export async function loadDocumentAuditTimeline(
  input: LoadDocumentAuditTimelineInput,
): Promise<LoadDocumentAuditTimelineResult> {
  const entityId = (input.entityId ?? '').trim();
  const entityType = input.entityType;
  if (!entityId || !isEntityType(entityType)) {
    return { ok: false, error: 'invalid_input' };
  }

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const requiredPermission = ENTITY_READ_PERMISSION[entityType];
      if (requiredPermission !== null) {
        const allowed = await hasPermission({ userId, orgId, client }, requiredPermission);
        if (!allowed) {
          return { ok: false, error: 'forbidden' } as LoadDocumentAuditTimelineResult;
        }
      }

      const data = await getDocumentAuditTimeline(entityType, entityId, {
        client: client as QueryClient,
        limit: input.limit,
        offset: input.offset,
      });
      return { ok: true, data };
    });
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
