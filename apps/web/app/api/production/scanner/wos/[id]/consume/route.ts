import { createHash } from 'node:crypto';

import { NextRequest } from 'next/server';

import { assertWoNotOnHold } from '../../../../../../../lib/production/holds-guard';
import { assertLpConsumableForProduction } from '../../../../../../../lib/production/lp-safety-guard';
import {
  APP_VERSION,
  emitConsumeBlocked,
  hasPermission,
  OUTPUT_RECORDABLE_STATES,
  QualityHoldError,
  readWoExecutionStatus,
  type ProductionContext,
} from '../../../../../../../lib/production/shared';
import { findUserByEmail, userHasPin, verifyPin } from '../../../../../../../lib/scanner/auth';
import { requireScannerSession } from '../../../../../../../lib/scanner/guard';
import { findServerReplay, insertServerReplay } from '../../../../../../../lib/scanner/replay';
import { isRecord, stringField } from '../../../../../../../lib/scanner/route-utils';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../../../../../../lib/scanner/txn-org-context';
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

type MaterialGateRow = {
  id: string;
  product_id: string;
  material_name: string;
  required_qty: string;
  consumed_qty: string;
  uom: string;
  threshold_pct: string;
  warn_pct: string;
  over_limit: boolean;
  over_warn: boolean;
  over_pct: string | null;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function numericJson(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deterministicTransactionId(seed: string): string {
  const hex = createHash('md5').update(seed).digest('hex');
  const v = hex.slice(0, 12) + '3' + hex.slice(13, 16) + ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 32);
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20, 32)}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const woId = await getWoId(context);
  const operation = 'production.scanner.wos.consume';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400, { woId });

  const clientOpId = requiredClientOpId(body);
  const materialId = stringField(body, 'materialId');
  const qty = stringField(body, 'qty');
  const lpId = stringField(body, 'lpId');
  const reasonCode = stringField(body, 'reasonCode');
  const approverBody = isRecord(body.approver) ? body.approver : null;
  if (!clientOpId || !materialId || !qty) {
    return scannerValidationError(request, body, operation, 'missing_fields', 400, { woId });
  }
  if (!isDecimalString(qty) || qty === '0' || /^0+(\.0+)?$/.test(qty)) {
    return scannerValidationError(request, body, operation, 'invalid_qty', 422, { woId, clientOpId });
  }
  if (!lpId && !reasonCode) {
    return scannerValidationError(request, body, operation, 'reason_required', 422, { woId, clientOpId, materialId });
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
      let txnOrgContextToken: string | null = null;
      await client.query('begin');
      try {
        txnOrgContextToken = await registerTxnOrgContext(client, session.org_id, session.user_id);
        const txnId = deterministicTransactionId(`${session.org_id}:scanner-consume:${clientOpId}`);

        const woHoldGate = await assertWoNotOnHold(woId, { client });
        if (!woHoldGate.ok) {
          const emitCtx = {
            client,
            userId: session.user_id,
            orgId: session.org_id,
          } as unknown as ProductionContext;
          await emitConsumeBlocked(
            emitCtx,
            new QualityHoldError({
              hold: woHoldGate.hold,
              woId,
              blockedPath: 'consume',
              transactionId: clientOpId,
              lpId: null,
              lotId: null,
            }),
          );
          await client.query('commit');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'quality_hold_active', {
            woId,
            materialId,
            lpId,
          });
          return scannerError('quality_hold_active', 409);
        }

        await client.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `${session.org_id}:scanner:${clientOpId}`,
        ]);

        // Replay fidelity: only the success path writes client_op_id (auditAttempt
        // rows never carry it), so this row's ext is the original 'ok' response
        // material — reconstruct the original payload instead of a bare marker.
        const replay = await findServerReplay(
          client,
          session.org_id,
          clientOpId,
          'production.scanner.wos.consume',
        );
        if (replay) {
          await client.query('commit');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'replay', { woId, materialId, lpId });
          const storedExt = replay.ext;
          return scannerOk({
            replay: true,
            ...(typeof storedExt.materialId === 'string' ? { materialId: storedExt.materialId } : {}),
            ...(typeof storedExt.consumedQty === 'string' ? { consumedQty: storedExt.consumedQty } : {}),
            ...(typeof storedExt.uom === 'string' ? { uom: storedExt.uom } : {}),
            approverUserId: typeof storedExt.approverUserId === 'string' ? storedExt.approverUserId : null,
            ...(storedExt.warned === true
              ? {
                  warning: {
                    overconsumed: true,
                    overPct: typeof storedExt.overPct === 'number' ? storedExt.overPct : 0,
                    warnPct: typeof storedExt.warnPct === 'number' ? storedExt.warnPct : 0,
                  },
                }
              : {}),
          });
        }

        const executionStatus = await readWoExecutionStatus(
          { client, userId: session.user_id, orgId: session.org_id } as ProductionContext,
          woId,
        );
        if (executionStatus === null || !OUTPUT_RECORDABLE_STATES.has(executionStatus)) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'wo_not_recordable', {
            woId,
            clientOpId,
            status: executionStatus,
          });
          return scannerError('wo_not_recordable', 422, { status: executionStatus });
        }

        if (lpId) {
          const lpGate = await assertLpConsumableForProduction(
            { client, userId: session.user_id } as unknown as Pick<ProductionContext, 'client' | 'userId'>,
            lpId,
          );
          if (!lpGate.ok) {
            if (lpGate.error === 'quality_hold_active') {
              // T-064 contract (holds-guard.ts:5-9): an active hold MUST emit
              // `production.consume.blocked`. Nothing stock-mutating has run
              // yet in this txn (locks + reads only), so COMMIT persists just
              // the outbox event; dedup_key (clientOpId) keeps retries no-ops.
              const emitCtx = {
                client,
                userId: session.user_id,
                orgId: session.org_id,
              } as unknown as ProductionContext;
              await emitConsumeBlocked(
                emitCtx,
                new QualityHoldError({
                  hold: lpGate.hold,
                  woId,
                  blockedPath: 'consume',
                  transactionId: clientOpId,
                  lpId,
                  lotId: null,
                }),
              );
              await client.query('commit');
            } else {
              await client.query('rollback');
            }
            await auditAttempt(client, session, 'production.scanner.wos.consume', lpGate.error, {
              woId,
              materialId,
              lpId,
            });
            return scannerError(lpGate.error, 409);
          }
        }

      // Two-tier gate, BOTH flags read in the same locked statement:
      //   warn tier  (overconsume_warn_pct,      absent = 0) — proceed + warn,
      //   approve tier (overconsume_threshold_pct, absent = 0) — PIN approval.
      const materialGateRes = await client.query<MaterialGateRow>(
        `with cfg as (
           select coalesce(
                    case
                      when (tv.feature_flags->>'overconsume_threshold_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                        then (tv.feature_flags->>'overconsume_threshold_pct')::numeric
                      else 0
                    end,
                    0
                  ) as threshold_pct,
                  coalesce(
                    case
                      when (tv.feature_flags->>'overconsume_warn_pct') ~ '^[0-9]+(\\.[0-9]+)?$'
                        then (tv.feature_flags->>'overconsume_warn_pct')::numeric
                      else 0
                    end,
                    0
                  ) as warn_pct
             from public.tenant_variations tv
            where tv.org_id = $1::uuid
         )
         select wm.id,
                wm.product_id,
                wm.material_name,
                wm.required_qty::text as required_qty,
                wm.consumed_qty::text as consumed_qty,
                wm.uom,
                coalesce((select threshold_pct from cfg), 0)::text as threshold_pct,
                coalesce((select warn_pct from cfg), 0)::text as warn_pct,
                (wm.consumed_qty + $4::numeric)
                  > (wm.required_qty * (1 + coalesce((select threshold_pct from cfg), 0) / 100)) as over_limit,
                (wm.consumed_qty + $4::numeric)
                  > (wm.required_qty * (1 + coalesce((select warn_pct from cfg), 0) / 100)) as over_warn,
                case
                  when wm.required_qty > 0 then
                    (((wm.consumed_qty + $4::numeric) / wm.required_qty - 1) * 100)::text
                  else null
                end as over_pct
           from public.wo_materials wm
          where wm.org_id = $1::uuid
            and wm.wo_id = $2::uuid
            and wm.id = $3::uuid
            and $4::numeric > 0
            and exists (
              select 1
                from public.work_orders wo
               where wo.org_id = $1::uuid
                 and wo.id = wm.wo_id
                 and app.user_can_see_site(wo.site_id)
            )
          limit 1
          for update of wm`,
        [session.org_id, woId, materialId, qty],
      );
      const gate = materialGateRes.rows[0];
      if (!gate) {
        await client.query('rollback');
        await auditAttempt(client, session, 'production.scanner.wos.consume', 'invalid_material', {
          woId,
          materialId,
        });
        return scannerError('invalid_material', 422);
      }

      // Between the tiers: consume PROCEEDS, the response carries a warning
      // payload and the audit row is flagged (warned + overPct). Above the
      // approve tier the 409/PIN path below is unchanged.
      const warnBand = gate.over_warn && !gate.over_limit;

      let approverUserId: string | null = null;
      if (gate.over_limit) {
        const overPayload = {
          requiredQty: numericJson(gate.required_qty),
          consumedQty: numericJson(gate.consumed_qty),
          attemptedQty: numericJson(qty),
          thresholdPct: numericJson(gate.threshold_pct),
          overPct: numericJson(gate.over_pct),
        };

        if (!approverBody) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'overconsume_approval_required', {
            woId,
            materialId,
            ...overPayload,
          });
          return scannerError('overconsume_approval_required', 409, overPayload);
        }

        const approverEmail = stringField(approverBody, 'email')?.toLowerCase();
        const approverPin = stringField(approverBody, 'pin');
        if (!approverEmail || !approverPin) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'invalid_approver', {
            woId,
            materialId,
          });
          return scannerError('invalid_approver', 401);
        }

        const approver = await findUserByEmail(client, approverEmail);
        if (!approver || approver.org_id !== session.org_id || approver.id === session.user_id) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'invalid_approver', {
            woId,
            materialId,
          });
          return scannerError('invalid_approver', 401);
        }
        if (!(await userHasPin(client, approver.id))) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'pin_not_enrolled', {
            woId,
            materialId,
          });
          return scannerError('pin_not_enrolled', 409);
        }

        const pinResult = await verifyPin(approver.id, approverPin, { client });
        if (pinResult === 'locked') {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'pin_locked', {
            woId,
            materialId,
          });
          return scannerError('pin_locked', 423);
        }
        if (pinResult !== true) {
          // COMMIT (not rollback): nothing has been written in this txn except
          // verifyPin's failed-attempt counter — rolling back would erase the
          // lockout increment and allow unlimited PIN brute-force via consume.
          await client.query('commit');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'invalid_pin', {
            woId,
            materialId,
          });
          return scannerError('invalid_pin', 401);
        }

        const approverCtx = { client, userId: approver.id, orgId: session.org_id } as unknown as ProductionContext;
        // Canonical RBAC string (seeded by migration 185 to the org-admin +
        // production-supervisor role families): production.consumption.override_approve.
        if (!(await hasPermission(approverCtx, 'production.consumption.override_approve'))) {
          await client.query('rollback');
          await auditAttempt(client, session, 'production.scanner.wos.consume', 'approver_forbidden', {
            woId,
            materialId,
          });
          return scannerError('approver_forbidden', 403);
        }
        approverUserId = approver.id;
      }

      const materialRes = await client.query<MaterialUpdateRow>(
        `update public.wo_materials
            set consumed_qty = consumed_qty + $4::numeric
          where org_id = $1::uuid
            and wo_id = $2::uuid
            and id = $3::uuid
            and $4::numeric > 0
            and exists (
              select 1
                from public.work_orders wo
               where wo.org_id = $1::uuid
                 and wo.id = wo_materials.wo_id
                 and app.user_can_see_site(wo.site_id)
            )
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

      let fefoAdherence = true;
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
              and app.user_can_see_site(site_id)
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

        const fefo = await client.query<{ violates: boolean }>(
          `select exists (
                    select 1
                      from public.v_inventory_available cand
                      join public.license_plates chosen
                        on chosen.id = $2::uuid
                       and chosen.org_id = $1::uuid
                     where cand.org_id = $1::uuid
                       and app.user_can_see_site(cand.site_id)
                       and app.user_can_see_site(chosen.site_id)
                       and cand.product_id = $3::uuid
                       and cand.uom = $4
                       and cand.lp_id <> $2::uuid
                       and cand.expiry_date is not null
                       and (chosen.expiry_date is null
                            or cand.expiry_date < chosen.expiry_date)
                  ) as violates`,
          [session.org_id, lpId, material.product_id, material.uom],
        );
        fefoAdherence = !(fefo.rows[0]?.violates ?? false);
      }

      const consumption = await client.query<{ id: string }>(
        `insert into public.wo_material_consumption
           (org_id, transaction_id, wo_id, component_id, lp_id, qty_consumed, uom,
            operator_id, fefo_adherence_flag, ext_jsonb)
         values
           ($10::uuid, $1::uuid, $2::uuid, $3::uuid,
            coalesce($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            $5::numeric, $6, $7::uuid, $8, $9::jsonb)
         returning id::text as id`,
        [
          txnId,
          woId,
          material.product_id,
          lpId,
          qty,
          material.uom,
          session.user_id,
          fefoAdherence,
          JSON.stringify({
            source: 'scanner',
            clientOpId,
            ...(reasonCode ? { reasonCode } : {}),
            materialId: material.id,
            materialName: material.material_name,
            ...(warnBand ? { warned: true, overPct: numericJson(gate.over_pct) } : {}),
          }),
          session.org_id,
        ],
      );

      if (lpId && lpId !== NIL_UUID) {
        await emitMaterialConsumed(client, {
          aggregateId: consumption.rows[0]?.id ?? woId,
          woId,
          lpId,
          itemId: material.product_id,
          qty,
          uom: material.uom,
          orgId: session.org_id,
          actor: session.user_id,
        });
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
            ...(reasonCode ? { reasonCode } : {}),
            // consumedQty/uom/warnPct mirror the success response so an
            // idempotent replay can reconstruct the original payload.
            consumedQty: material.consumed_qty,
            uom: material.uom,
            approverUserId,
            overPct: gate.over_limit || warnBand ? numericJson(gate.over_pct) : null,
            ...(warnBand ? { warned: true, warnPct: numericJson(gate.warn_pct) } : {}),
          }),
        ],
      );

      await client.query('commit');
      return scannerOk({
        materialId: material.id,
        consumedQty: material.consumed_qty,
        uom: material.uom,
        replay: false,
        ...(warnBand
          ? {
              warning: {
                overconsumed: true,
                overPct: numericJson(gate.over_pct),
                warnPct: numericJson(gate.warn_pct),
              },
            }
          : {}),
      });
      } finally {
        await cleanupTxnOrgContext(client, txnOrgContextToken);
      }
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

async function emitMaterialConsumed(
  client: ProductionContext['client'],
  input: {
    aggregateId: string;
    woId: string;
    lpId: string;
    itemId: string;
    qty: string;
    uom: string;
    orgId: string;
    actor: string;
  },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, $2, $3::uuid, $4::jsonb, $5)`,
    [
      'warehouse.material.consumed',
      'wo_material_consumption',
      input.aggregateId,
      JSON.stringify({
        wo_id: input.woId,
        lp_id: input.lpId,
        item_id: input.itemId,
        qty: input.qty,
        uom: input.uom,
        org_id: input.orgId,
        actor: input.actor,
      }),
      APP_VERSION,
    ],
  );
}
