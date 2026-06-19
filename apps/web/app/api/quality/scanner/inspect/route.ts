import { NextRequest } from 'next/server';

import { hasPermission, type ProductionContext } from '../../../../../lib/production/shared';
import { requireScannerSession } from '../../../../../lib/scanner/guard';
import { stringField } from '../../../../../lib/scanner/route-utils';
import { cleanupTxnOrgContext, registerTxnOrgContext } from '../../../../../lib/scanner/txn-org-context';
import { withScannerOrg } from '../../../../../lib/scanner/with-scanner-org';
import {
  auditAttempt,
  readRecordBody,
  requiredClientOpId,
  scannerError,
  scannerOk,
  scannerValidationError,
} from '../../../production/scanner/_support';

type Decision = 'pass' | 'fail' | 'hold';
type QaStatus = 'released' | 'rejected' | 'on_hold';

const TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

function decisionField(body: Record<string, unknown>): Decision | null {
  const value = stringField(body, 'decision');
  return value === 'pass' || value === 'fail' || value === 'hold' ? value : null;
}

async function createHoldForLp(params: {
  client: ProductionContext['client'];
  lpId: string;
  userId: string;
  orgId: string;
  note: string | null;
}): Promise<void> {
  const hold = await params.client.query<{ id: string; hold_number: string }>(
    `insert into public.quality_holds (
       org_id,
       reference_type,
       reference_id,
       reason_free_text,
       priority,
       hold_status,
       created_by
     )
     values (
       app.current_org_id(),
       'lp',
       $1::uuid,
       $2,
       'high',
       'open',
       $3::uuid
     )
     returning id::text, hold_number`,
    [params.lpId, params.note ?? 'scanner inspection hold', params.userId],
  );
  const createdHold = hold.rows[0];
  if (!createdHold?.id) throw new Error('quality hold insert did not return a row');

  const lp = await params.client.query<{ id: string; quantity: string }>(
    `select id::text, quantity::text
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [params.lpId],
  );
  const current = lp.rows[0];
  if (!current) throw new Error('lp_not_found');

  await params.client.query(
    `insert into public.quality_hold_items (
       org_id,
       hold_id,
       license_plate_id,
       qty_held_kg,
       item_status,
       notes
     )
     values (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, 'held', $4)
     on conflict (hold_id, license_plate_id) do nothing`,
    [createdHold.id, current.id, current.quantity, params.note],
  );

  // Emit the canonical `quality.hold.created` outbox event (same event_type +
  // aggregate_type + app_version + payload shape as hold-actions.ts::createHold).
  // The scanner fast-path hold MUST be visible to outbox consumers / audit like
  // any manually-created hold; stays inside the same transaction as the insert.
  await params.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), 'quality.hold.created', 'quality_hold', $1::uuid, $2::jsonb, 'quality-holds-v1')`,
    [
      createdHold.id,
      JSON.stringify({
        org_id: params.orgId,
        actor_user_id: params.userId,
        holdId: createdHold.id,
        holdNumber: createdHold.hold_number,
        referenceType: 'lp',
        referenceId: params.lpId,
        lpIds: [params.lpId],
        source: 'scanner_inspection',
      }),
    ],
  );
}

async function applyLpDecision(params: {
  client: ProductionContext['client'];
  lpId: string;
  userId: string;
  orgId: string;
  decision: Decision;
  note: string | null;
}): Promise<QaStatus | null> {
  const qaStatus: QaStatus = params.decision === 'pass' ? 'released' : params.decision === 'fail' ? 'rejected' : 'on_hold';
  const updated = await params.client.query<{ id: string }>(
    `update public.license_plates
        set qa_status = $2,
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status <> all($4::text[])
      returning id::text`,
    [params.lpId, qaStatus, params.userId, [...TERMINAL_LP_STATUSES]],
  );
  if (!updated.rows[0]) return null;
  if (params.decision === 'hold') {
    await createHoldForLp({
      client: params.client,
      lpId: params.lpId,
      userId: params.userId,
      orgId: params.orgId,
      note: params.note,
    });
  }
  return qaStatus;
}

export async function POST(request: NextRequest) {
  const operation = 'quality.scanner.inspect';
  const body = await readRecordBody(request);
  if (!body) return scannerValidationError(request, null, operation, 'invalid_json', 400);

  const clientOpId = requiredClientOpId(body);
  const lpId = stringField(body, 'lpId');
  const decision = decisionField(body);
  const note = stringField(body, 'note');
  if (!clientOpId || !lpId || !decision) {
    return scannerValidationError(request, body, operation, 'missing_fields', 400, { clientOpId, lpId });
  }

  const result = await requireScannerSession(request, body, operation, async ({ client, session }) =>
    withScannerOrg(client, session, async ({ client: scopedClient }) => {
      const permCtx = { client: scopedClient, userId: session.user_id, orgId: session.org_id } as unknown as ProductionContext;
      if (!(await hasPermission(permCtx, 'quality.inspection.execute'))) {
        await auditAttempt(scopedClient, session, operation, 'forbidden', { lpId, clientOpId });
        return scannerError('forbidden', 403);
      }

      // DELIBERATE no-e-sign fast path (wave-8a review F10): unlike the desktop
      // submitInspectionDecision (which collects a CFR-21-Part-11 signEvent),
      // the scanner flow records the decision WITHOUT an e-signature. The user
      // is already individually identified by the PIN-bound scanner session;
      // decided_by + the scanner_audit_log row (operation + client_op_id + ext)
      // give full traceability. signature_hash is intentionally NULL here.
      let orgContextToken: string | null = null;
      try {
        await scopedClient.query('begin');
        // app.current_org_id() resolves via app.active_org_contexts keyed on
        // the CURRENT txid (migration 002); next_quality_inspection_number()
        // and the org_id values below depend on it. Register the context
        // inside this transaction (see lib/scanner/txn-org-context.ts).
        orgContextToken = await registerTxnOrgContext(scopedClient, session.org_id);
        await scopedClient.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `${session.org_id}:quality-inspect:${lpId}`,
        ]);
        await scopedClient.query(`select pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `${session.org_id}:scanner:${clientOpId}`,
        ]);

        const replay = await scopedClient.query<{ inspection_id: string | null; qa_status: QaStatus | null }>(
          `select
             nullif(ext->>'inspectionId', '') as inspection_id,
             nullif(ext->>'qaStatus', '') as qa_status
           from public.scanner_audit_log
          where org_id = $1::uuid
            and client_op_id = $2
          limit 1`,
          [session.org_id, clientOpId],
        );
        const replayRow = replay.rows[0];
        if (replayRow) {
          await scopedClient.query('commit');
          await auditAttempt(scopedClient, session, operation, 'replay', { lpId, clientOpId });
          return scannerOk({
            inspectionId: replayRow.inspection_id,
            qaStatus: replayRow.qa_status,
            replay: true,
          });
        }

        const lp = await scopedClient.query<{ id: string; product_id: string | null }>(
          `select id::text, product_id::text
             from public.license_plates
            where org_id = app.current_org_id()
              and id = $1::uuid
            for update`,
          [lpId],
        );
        const currentLp = lp.rows[0];
        if (!currentLp) {
          await scopedClient.query('rollback');
          await auditAttempt(scopedClient, session, operation, 'lp_not_found', { lpId, clientOpId });
          return scannerError('lp_not_found', 404);
        }

        const status = decision === 'pass' ? 'passed' : decision === 'fail' ? 'failed' : 'on_hold';
        const inspection = await scopedClient.query<{ id: string }>(
          `insert into public.quality_inspections (
             org_id,
             inspection_number,
             reference_type,
             reference_id,
             product_id,
             status,
             result_notes,
             decided_by,
             decided_at,
             signature_hash,
             created_by
           )
           values (
             app.current_org_id(),
             public.next_quality_inspection_number(app.current_org_id()),
             'lp',
             $1::uuid,
             $2::uuid,
             $3,
             $4,
             $5::uuid,
             pg_catalog.now(),
             null,
             $5::uuid
           )
           returning id::text`,
          [lpId, currentLp.product_id, status, note ?? null, session.user_id],
        );
        const inspectionId = inspection.rows[0]?.id;
        if (!inspectionId) throw new Error('quality inspection insert did not return a row');

        const qaStatus = await applyLpDecision({
          client: scopedClient,
          lpId,
          userId: session.user_id,
          orgId: session.org_id,
          decision,
          note: note ?? null,
        });
        if (!qaStatus) {
          await scopedClient.query('rollback');
          await auditAttempt(scopedClient, session, operation, 'lp_not_found', { lpId, clientOpId });
          return scannerError('lp_not_found', 404);
        }

        await scopedClient.query(
          `insert into public.scanner_audit_log (
             org_id, session_id, user_id, device_id, operation, lp_id,
             result_code, client_op_id, ext
           )
           values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid,
                   'ok', $7, $8::jsonb)`,
          [
            session.org_id,
            session.id,
            session.user_id,
            session.device_id,
            operation,
            lpId,
            clientOpId,
            JSON.stringify({ inspectionId, qaStatus, decision }),
          ],
        );

        await scopedClient.query('commit');
        return scannerOk({ inspectionId, qaStatus });
      } catch (error) {
        try {
          await scopedClient.query('rollback');
        } catch {
          /* noop */
        }
        await auditAttempt(scopedClient, session, operation, 'error', {
          lpId,
          clientOpId,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        await cleanupTxnOrgContext(scopedClient, orgContextToken);
      }
    }),
  );

  if ('guardError' in result) return scannerError(result.error, result.status);
  return result;
}
