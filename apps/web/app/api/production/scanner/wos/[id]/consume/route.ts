import { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { stringField } from '../../../../../../../lib/scanner/route-utils';
import {
  auditAttempt,
  getWoId,
  isDecimalString,
  readRecordBody,
  requiredClientOpId,
  scannerError,
  scannerOk,
  scannerValidationError,
  type RouteContext,
} from '../../../_support';

type MaterialUpdateRow = {
  id: string;
  product_id: string;
  material_name: string;
  consumed_qty: string;
  uom: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.consume';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpId = requiredClientOpId(body);
  const materialId = stringField(body, 'materialId');
  const qty = stringField(body, 'qty');
  const lpId = stringField(body, 'lpId');
  if (!clientOpId || !materialId || !qty) {
    return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });
  }
  if (!isDecimalString(qty) || qty === '0' || /^0+(\.0+)?$/.test(qty)) {
    return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  }

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) => {
    // RBAC re-check (review HIGH finding): a stock-mutating endpoint must not
    // be reachable by ANY valid scanner session — mirror the desktop gate.
    // hasPermission takes explicit user/org ids, so it is safe on this client.
    const permCtx = { client, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
    if (!(await hasPermission(permCtx, 'production.consumption.write'))) {
      await auditAttempt(client, session, operation, 'forbidden', { woId, materialId, lpId });
      return scannerError('forbidden', 403);
    }

    try {
      await client.query('begin');
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `${session.org_id}:scanner:${clientOpId}`,
      ]);

      const replay = await client.query<{ exists: boolean }>(
        `select true as exists
           from public.scanner_audit_log
          where org_id = $1::uuid
            and client_op_id = $2
          limit 1`,
        [session.org_id, clientOpId],
      );
      if (replay.rows[0]) {
        await client.query('commit');
        await auditAttempt(client, session, 'production.scanner.wos.consume', 'replay', { woId, materialId, lpId });
        return scannerOk({ replay: true });
      }

      const materialRes = await client.query<MaterialUpdateRow>(
        `update public.wo_materials
            set consumed_qty = consumed_qty + $4::numeric
          where org_id = $1::uuid
            and wo_id = $2::uuid
            and id = $3::uuid
            and $4::numeric > 0
          returning id, product_id, material_name, consumed_qty::text as consumed_qty, uom`,
        [session.org_id, woId, materialId, qty],
      );
      const material = materialRes.rows[0];
      if (!material) {
        await client.query('rollback');
        await auditAttempt(client, session, 'production.scanner.wos.consume', 'invalid_material', {
          woId,
          materialId,
        });
        return scannerError('invalid_material', 422);
      }

      if (lpId) {
        const lpRes = await client.query<{ id: string; quantity: string }>(
          `update public.license_plates
              set quantity = quantity - $3::numeric,
                  status = case when quantity - $3::numeric = 0 then 'consumed' else status end,
                  consumed_by_wo_id = $4::uuid,
                  updated_by = $5::uuid,
                  updated_at = now()
            where org_id = $1::uuid
              and id = $2::uuid
              and product_id = $6::uuid
              and uom = $7
              and quantity - $3::numeric >= reserved_qty
            returning id, quantity::text as quantity`,
          [session.org_id, lpId, qty, woId, session.user_id, material.product_id, material.uom],
        );
        if (!lpRes.rows[0]) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'lp_unavailable', {
            woId,
            materialId,
            lpId,
          });
          return scannerError('lp_unavailable', 409);
        }
      }

      await client.query(
        `insert into public.scanner_audit_log (
           org_id, session_id, user_id, device_id, operation, lp_id, wo_id,
           result_code, client_op_id, ext
         )
         values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7::uuid,
                 'ok', $8, $9::jsonb)`,
        [
          session.org_id,
          session.id,
          session.user_id,
          session.device_id,
          'production.scanner.wos.consume',
          lpId,
          woId,
          clientOpId,
          JSON.stringify({
            materialId,
            materialName: material.material_name,
            qty,
            uom: material.uom,
          }),
        ],
      );

      await client.query('commit');
      return scannerOk({
        materialId: material.id,
        consumedQty: material.consumed_qty,
        uom: material.uom,
        replay: false,
      });
    } catch (error) {
      try {
        await client.query('rollback');
      } catch {
        /* noop */
      }
      await auditAttempt(client, session, 'production.scanner.wos.consume', 'error', {
        woId,
        materialId,
        lpId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
