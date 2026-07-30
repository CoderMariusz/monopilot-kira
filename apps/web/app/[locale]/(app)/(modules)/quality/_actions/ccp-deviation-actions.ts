'use server';

import {
  ESignPolicyError,
  type ESignPolicyErrorCode,
} from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

import type { CcpDeviationDisposition } from './ccp-deviation-types';
import { collectQualitySignoff, readPendingQualitySignoff } from './quality-signoff';
import type { PendingQualitySignoff } from './quality-signoff-types';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };
type ActionFailure =
  | { ok: false; reason: 'forbidden' | 'error'; message?: string }
  | { ok: false; reason: 'policy'; code: ESignPolicyErrorCode; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

type DeviationStatus = 'open' | 'resolved';
type HoldReferenceType = 'lp' | 'batch' | 'wo' | 'po' | 'grn';

type CcpDeviationRow = {
  id: string;
  status: DeviationStatus;
  ccpId: string;
  ccpCode: string;
  ccpName: string;
  monitoringLogId: string | null;
  measuredValue: string | null;
  uom: string | null;
  actionTaken: string | null;
  disposition: CcpDeviationDisposition | null;
  hold: {
    id: string;
    holdNumber: string;
    referenceType: HoldReferenceType;
    referenceDisplay: string | null;
    status: string;
  } | null;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  eSignRef: string | null;
  pendingSignoff: PendingQualitySignoff | null;
};

const uuidSchema = z.string().uuid();
const statusSchema = z.enum(['open', 'resolved']);
const dispositionSchema = z.enum(['corrected', 'product_held', 'disposed']);

const listSchema = z.object({
  status: statusSchema.optional(),
});

const resolveSchema = z.object({
  id: uuidSchema,
  actionTaken: z.string().trim().min(1).max(4000),
  disposition: dispositionSchema,
  signature: z.object({ password: z.string().min(1) }),
});

async function canReadDeviationRegister(ctx: QualityContext): Promise<boolean> {
  const [dashboardView, deviationOverride] = await Promise.all([
    hasPermission(ctx, 'quality.dashboard.view'),
    hasPermission(ctx, 'quality.ccp.deviation_override'),
  ]);
  return dashboardView || deviationOverride;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

type CcpDeviationDbRow = {
  id: string;
  status: DeviationStatus;
  ccp_id: string;
  ccp_code: string;
  ccp_name: string;
  monitoring_log_id: string | null;
  measured_value: string | null;
  uom: string | null;
  action_taken: string | null;
  disposition: CcpDeviationDisposition | null;
  hold_id: string | null;
  hold_number: string | null;
  hold_reference_type: HoldReferenceType | null;
  hold_reference_display: string | null;
  hold_status: string | null;
  opened_at: Date | string;
  opened_by_display: string | null;
  closed_at: Date | string | null;
  closed_by_display: string | null;
  esign_ref: string | null;
};

function mapDeviationRow(row: CcpDeviationDbRow): CcpDeviationRow {
  return {
    id: row.id,
    status: row.status,
    ccpId: row.ccp_id,
    ccpCode: row.ccp_code,
    ccpName: row.ccp_name,
    monitoringLogId: row.monitoring_log_id,
    measuredValue: row.measured_value,
    uom: row.uom,
    actionTaken: row.action_taken,
    disposition: row.disposition,
    hold:
      row.hold_id && row.hold_number && row.hold_reference_type && row.hold_status
        ? {
            id: row.hold_id,
            holdNumber: row.hold_number,
            referenceType: row.hold_reference_type,
            referenceDisplay: row.hold_reference_display ?? row.hold_number,
            status: row.hold_status,
          }
        : null,
    openedAt: toIso(row.opened_at) ?? '',
    openedBy: row.opened_by_display,
    closedAt: toIso(row.closed_at),
    closedBy: row.closed_by_display,
    eSignRef: row.esign_ref,
    pendingSignoff: null,
  };
}

async function selectDeviationRows(ctx: QualityContext, status?: DeviationStatus, id?: string): Promise<CcpDeviationRow[]> {
  const { rows } = await ctx.client.query<CcpDeviationDbRow>(
    `select
       d.id::text,
       d.status,
       d.ccp_id::text,
       c.ccp_code,
       c.name as ccp_name,
       d.monitoring_log_id::text,
       d.measured_value::text,
       d.uom,
       d.action_taken,
       d.disposition,
       h.id::text as hold_id,
       h.hold_number,
       h.reference_type as hold_reference_type,
       coalesce(
         case when h.reference_type = 'lp' then lp.lp_number || coalesce(' / ' || i.item_code, '') end,
         case when h.reference_type = 'wo' then wo.wo_number end,
         case when h.reference_type = 'grn' then grn.grn_number end,
         h.hold_number
       ) as hold_reference_display,
       h.hold_status,
       d.opened_at,
       coalesce(opened.display_name, opened.email::text) as opened_by_display,
       d.closed_at,
       coalesce(closed.display_name, closed.email::text) as closed_by_display,
       d.esign_ref
     from public.ccp_deviations d
     join public.haccp_ccps c on c.id = d.ccp_id and c.org_id = d.org_id
     left join public.quality_holds h on h.id = d.hold_id and h.org_id = d.org_id
     left join public.license_plates lp on h.reference_type = 'lp' and lp.id = h.reference_id and lp.org_id = h.org_id
     left join public.items i on i.id = lp.product_id and i.org_id = lp.org_id
     left join public.work_orders wo on h.reference_type = 'wo' and wo.id = h.reference_id and wo.org_id = h.org_id
     left join public.grns grn on h.reference_type = 'grn' and grn.id = h.reference_id and grn.org_id = h.org_id
     left join public.users opened on opened.id = d.opened_by and opened.org_id = d.org_id
     left join public.users closed on closed.id = d.closed_by and closed.org_id = d.org_id
    where d.org_id = app.current_org_id()
      and ($1::text is null or d.status = $1)
      and ($2::uuid is null or d.id = $2::uuid)
    order by d.opened_at desc`,
    [status ?? null, id ?? null],
  );
  return Promise.all(
    rows.map(async (row) => {
      const mapped = mapDeviationRow(row);
      if (row.status === 'open' && row.esign_ref) {
        mapped.pendingSignoff = await readPendingQualitySignoff(
          ctx.client,
          'qa.haccp.ccp.deviation',
          { signatureId: row.esign_ref },
        );
      }
      return mapped;
    }),
  );
}

export async function listCcpDeviations(input: { status?: DeviationStatus } = {}): Promise<ActionResult<CcpDeviationRow[]>> {
  try {
    const parsed = listSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CcpDeviationRow[]>> => {
      if (!(await canReadDeviationRegister(ctx))) return { ok: false, reason: 'forbidden' };
      return { ok: true, data: await selectDeviationRows(ctx, parsed.status) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCcpDeviation(id: string): Promise<ActionResult<CcpDeviationRow | null>> {
  try {
    const parsedId = uuidSchema.parse(id);
    return await withOrgContext(async (ctx): Promise<ActionResult<CcpDeviationRow | null>> => {
      if (!(await canReadDeviationRegister(ctx))) return { ok: false, reason: 'forbidden' };
      const rows = await selectDeviationRows(ctx, undefined, parsedId);
      return { ok: true, data: rows[0] ?? null };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveCcpDeviation(
  id: string,
  input: { actionTaken: string; disposition: CcpDeviationDisposition; signature: { password: string } },
): Promise<ActionResult<CcpDeviationRow>> {
  try {
    const parsed = resolveSchema.parse({ id, ...input });
    return await withOrgContext(async (ctx): Promise<ActionResult<CcpDeviationRow>> => {
      if (!(await hasPermission(ctx, 'quality.ccp.deviation_override'))) return { ok: false, reason: 'forbidden' };

      const current = await ctx.client.query<{
        id: string;
        status: DeviationStatus;
        ccp_id: string;
        ccp_code: string;
        monitoring_log_id: string | null;
        measured_value: string | null;
        hold_id: string | null;
        opened_by: string;
        action_taken: string | null;
        disposition: CcpDeviationDisposition | null;
        esign_ref: string | null;
      }>(
        `select
           d.id::text,
           d.status,
           d.ccp_id::text,
           c.ccp_code,
           d.monitoring_log_id::text,
           d.measured_value::text,
           d.hold_id::text,
           d.opened_by::text,
           d.action_taken,
           d.disposition,
           d.esign_ref
         from public.ccp_deviations d
         join public.haccp_ccps c on c.id = d.ccp_id and c.org_id = d.org_id
        where d.org_id = app.current_org_id()
          and d.id = $1::uuid
        for update`,
        [parsed.id],
      );
      const deviation = current.rows[0];
      if (!deviation) throw new Error('CCP deviation not found');
      if (deviation.status === 'resolved') throw new Error('CCP deviation is already resolved');

      if (
        deviation.esign_ref
        && (!deviation.action_taken || !deviation.disposition)
      ) {
        throw new Error('CCP deviation has an incomplete pending resolution-signature state');
      }
      if (
        deviation.esign_ref
        && (
          deviation.action_taken !== parsed.actionTaken
          || deviation.disposition !== parsed.disposition
        )
      ) {
        throw new Error('The pending CCP deviation decision cannot be changed');
      }
      const actionTaken = deviation.action_taken ?? parsed.actionTaken;
      const disposition = deviation.disposition ?? parsed.disposition;
      const signoff = await collectQualitySignoff({
        client: ctx.client,
        signerUserId: ctx.userId,
        pin: parsed.signature.password,
        intent: 'qa.haccp.ccp.deviation',
        subject: {
          deviationId: parsed.id,
          ccpId: deviation.ccp_id,
          ccpCode: deviation.ccp_code,
          monitoringLogId: deviation.monitoring_log_id,
          measuredValue: deviation.measured_value,
          disposition,
        },
        reason: 'CCP deviation resolution',
        pending: deviation.esign_ref
          ? { signatureId: deviation.esign_ref }
          : undefined,
      });

      if (!signoff.complete) {
        const pending = await ctx.client.query<{ id: string }>(
          `update public.ccp_deviations
              set action_taken = $2,
                  disposition = $3,
                  esign_ref = $4
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status = 'open'
              and esign_ref is null
            returning id::text`,
          [parsed.id, actionTaken, disposition, signoff.receipt.signatureId],
        );
        if (!pending.rows[0]) throw new Error('CCP deviation pending resolution update did not return a row');
        const rows = await selectDeviationRows(ctx, undefined, parsed.id);
        const row = rows[0];
        if (!row) throw new Error('CCP deviation pending resolution update did not return a row');
        return { ok: true, data: { ...row, pendingSignoff: signoff.pendingSignoff } };
      }
      const receipt = signoff.receipt;

      await ctx.client.query(
        `update public.ccp_deviations
            set status = 'resolved',
                action_taken = $2,
                disposition = $3,
                closed_by = $4::uuid,
                closed_at = pg_catalog.now(),
                esign_ref = $5
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'open'`,
        [parsed.id, actionTaken, disposition, ctx.userId, receipt.signatureId],
      );

      // Linked holds are NOT auto-released or dispositioned here — operators manage
      // quality_holds separately via releaseHold (see hold prompt in the resolve modal).

      const rows = await selectDeviationRows(ctx, undefined, parsed.id);
      const row = rows[0];
      if (!row) throw new Error('CCP deviation resolution update did not return a row');
      return { ok: true, data: row };
    });
  } catch (err) {
    if (err instanceof ESignPolicyError) {
      return { ok: false, reason: 'policy', code: err.code, message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
