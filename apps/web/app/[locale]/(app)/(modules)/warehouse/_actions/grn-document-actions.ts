'use server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { assembleGrnDocument } from '../../../../../../lib/documents/grn-document';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import type { GrnDocumentData } from '../../../../../../lib/documents/types';
import {
  WAREHOUSE_READ_PERMISSION,
  hasWarehousePermission,
  type QueryClient,
  type WarehouseContext,
  type WarehouseResult,
} from './shared';

/**
 * Assemble a printable GRN document payload (org-scoped, read-only).
 *
 * Document number is the stable grns.grn_number assigned at receipt creation —
 * this action never mints a new number.
 */
export async function getGrnDocument(grnId: string): Promise<WarehouseResult<GrnDocumentData>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<WarehouseResult<GrnDocumentData>> => {
      const ctx: WarehouseContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasWarehousePermission(ctx, WAREHOUSE_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const activeSiteId = await getActiveSiteId({ client: ctx.client });
      if (!activeSiteId) return { ok: false, reason: 'not_found' };

      const generatedAt = new Date().toISOString();
      const assembled = await assembleGrnDocument(ctx.client, grnId, activeSiteId, generatedAt);
      if (assembled === 'not_found') return { ok: false, reason: 'not_found' };

      return { ok: true, data: assembled };
    });
  } catch (error) {
    console.error('[warehouse] getGrnDocument failed', error);
    return { ok: false, reason: 'error' };
  }
}
