'use server';

import type pg from 'pg';
import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { releaseHold } from './hold-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };
type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
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
  disposition: string | null;
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
};

const uuidSchema = z.string().uuid();
const statusSchema = z.enum(['open', 'resolved']);

const listSchema = z.object({
  status: statusSchema.optional(),
});

const resolveSchema = z.object({
  id: uuidSchema,
  actionTaken: z.string().trim().min(1).max(4000),
  disposition: z.string().trim().min(1).max(2000),
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
  disposition: string | null;
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
  return rows.map(mapDeviationRow);
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
  input: { actionTaken: string; disposition: string; signature: { password: string } },
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
      }>(
        `select
           d.id::text,
           d.status,
           d.ccp_id::text,
           c.ccp_code,
           d.monitoring_log_id::text,
           d.measured_value::text,
           d.hold_id::text
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

      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'qa.haccp.ccp.deviation',
          subject: {
            deviationId: parsed.id,
            ccpId: deviation.ccp_id,
            ccpCode: deviation.ccp_code,
            monitoringLogId: deviation.monitoring_log_id,
            measuredValue: deviation.measured_value,
          },
          reason: 'CCP deviation resolution',
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

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
        [parsed.id, parsed.actionTaken, parsed.disposition, ctx.userId, receipt.signatureId],
      );

      if (deviation.hold_id) {
        const released = await releaseHold({
          holdId: deviation.hold_id,
          disposition: 'release',
          reasonText: 'CCP deviation resolved',
          signature: parsed.signature,
        });
        if (!released.ok) {
          throw new Error(released.message ?? `CCP deviation hold release failed: ${released.reason}`);
        }
      }

      const rows = await selectDeviationRows(ctx, undefined, parsed.id);
      const row = rows[0];
      if (!row) throw new Error('CCP deviation resolution update did not return a row');
      return { ok: true, data: row };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
