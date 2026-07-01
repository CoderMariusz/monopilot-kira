import type { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { isRecord, jsonError, jsonOk, readJson, stringField } from '../../../../../lib/scanner/route-utils';
import { withTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import { packLpIntoBoxCore } from '../../../../../lib/shipping/pack-lp-into-box';
import { auditAttempt } from '../../../production/scanner/_support';

// Maps the shared pack core's result codes to HTTP statuses for the scanner.
const STATUS_BY_ERROR: Record<string, number> = {
  invalid_state: 409,
  lp_not_found: 404,
  already_packed: 409,
  lp_not_allocated: 409,
  lp_blocked_for_pack: 409,
  invalid_box: 422,
  persistence_failed: 500,
};

// FEAT-2 / map dead-end #13 — scan an FG license plate into a Sales Order's
// shipment box from the scanner. Reuses packLpIntoBoxCore (the exact allocation
// + food-safety validation the desktop pack uses), gated on the same
// `ship.pack.close` permission, and wrapped in withTxnOrgContext so
// `app.current_org_id()` resolves and the box+content writes are atomic.
export async function POST(request: NextRequest) {
  const body = await readJson(request);
  if (!isRecord(body)) return jsonError('invalid_input', 422);

  const input = {
    clientOpId: stringField(body, 'clientOpId') ?? '',
    shipmentId: stringField(body, 'shipmentId') ?? '',
    lpId: stringField(body, 'lpId') ?? '',
    boxId: stringField(body, 'boxId') || undefined,
  };
  if (!input.shipmentId || !input.lpId) return jsonError('invalid_input', 422);

  const result = await requireScannerSession(request, body, 'warehouse.scanner.ship', async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      // Inventory/shipment WRITE — gate on the same permission the desktop pack
      // Server Action uses (ship.pack.close); mirror the pick route's forbidden
      // audit. The gate uses explicit org/user params (no txn context needed).
      const permCtx = {
        client: scopedClient,
        userId: session.user_id,
        orgId: session.org_id,
      } as unknown as ProductionContext;
      if (!(await hasPermission(permCtx, 'ship.pack.close'))) {
        await auditAttempt(scopedClient, session, 'warehouse.scanner.ship', 'forbidden', {
          lpId: input.lpId,
          clientOpId: input.clientOpId,
        });
        return jsonError('forbidden', 403, {
          message: 'You need the "ship.pack.close" permission to pack shipments. Ask an admin to grant it.',
        });
      }

      const packResult = await withTxnOrgContext(scopedClient, session.org_id, session.user_id, () =>
        packLpIntoBoxCore(
          { userId: session.user_id, orgId: session.org_id, client: scopedClient },
          { shipmentId: input.shipmentId, lpId: input.lpId, boxId: input.boxId },
        ),
      );

      if (!packResult.ok) {
        return jsonError(packResult.error, STATUS_BY_ERROR[packResult.error] ?? 422);
      }
      return jsonOk({ boxId: packResult.boxId });
    }),
  );

  if ('guardError' in result) return jsonError(result.error, result.status);
  return result;
}
