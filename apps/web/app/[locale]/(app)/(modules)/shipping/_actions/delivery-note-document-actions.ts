'use server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { assembleDeliveryNoteDocument } from '../../../../../../lib/documents/delivery-note-document';
import type { DeliveryNoteDocumentData } from '../../../../../../lib/documents/types';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ShippingContext = { userId: string; orgId: string; client: QueryClient };

export type DeliveryNoteDocumentResult =
  | { ok: true; data: DeliveryNoteDocumentData }
  | { ok: false; reason: 'forbidden' | 'not_found' | 'error' };

/** ship.dashboard.view — shipping read permission for printable documents. */
const SHIP_DASHBOARD_VIEW = 'ship.dashboard.view';

/**
 * Assemble a printable delivery note / packing list payload (org+site-scoped, read-only).
 *
 * Document number is the stable shipments.delivery_note_number assigned at creation —
 * this action never mints a new number.
 */
export async function getDeliveryNoteDocument(shipmentId: string): Promise<DeliveryNoteDocumentResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<DeliveryNoteDocumentResult> => {
      const ctx: ShippingContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, SHIP_DASHBOARD_VIEW))) {
        return { ok: false, reason: 'forbidden' };
      }

      const activeSiteId = await getActiveSiteId({ client: ctx.client });
      if (!activeSiteId) return { ok: false, reason: 'not_found' };

      const generatedAt = new Date().toISOString();
      const assembled = await assembleDeliveryNoteDocument(ctx.client, shipmentId, activeSiteId, generatedAt);
      if (assembled === 'not_found') return { ok: false, reason: 'not_found' };

      return { ok: true, data: assembled };
    });
  } catch (error) {
    console.error('[shipping] getDeliveryNoteDocument failed', error);
    return { ok: false, reason: 'error' };
  }
}
