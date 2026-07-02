'use server';

import type pg from 'pg';
import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { releaseHoldCore } from './hold-actions';

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
type CcpHoldDisposition =
  | { kind: 'release' }
  | {
      kind: 'non_release';
      holdDisposition: 'pending' | 'rework' | 'scrap' | 'other';
      lpQaStatus: 'on_hold' | 'rejected';
      lpStatus: 'quarantine';
      itemStatus: 'held' | 'scrapped';
    };

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

const TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

function classifyCcpHoldDisposition(disposition: string): CcpHoldDisposition {
  const normalized = disposition.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = new Set(normalized.split(/\s+/).filter(Boolean));

  if (tokens.has('scrap') || tokens.has('scrapped') || tokens.has('dispose') || tokens.has('disposed')) {
    return { kind: 'non_release', holdDisposition: 'scrap', lpQaStatus: 'rejected', lpStatus: 'quarantine', itemStatus: 'scrapped' };
  }
  if (tokens.has('reject') || tokens.has('rejected') || tokens.has('condemn') || tokens.has('condemned')) {
    return { kind: 'non_release', holdDisposition: 'other', lpQaStatus: 'rejected', lpStatus: 'quarantine', itemStatus: 'held' };
  }
  if (tokens.has('rework') || tokens.has('reworked')) {
    return { kind: 'non_release', holdDisposition: 'rework', lpQaStatus: 'on_hold', lpStatus: 'quarantine', itemStatus: 'held' };
  }
  if (tokens.has('quarantine') || tokens.has('quarantined') || tokens.has('hold') || tokens.has('held')) {
    return { kind: 'non_release', holdDisposition: 'pending', lpQaStatus: 'on_hold', lpStatus: 'quarantine', itemStatus: 'held' };
  }
  if (tokens.has('release') || tokens.has('released') || tokens.has('accept') || tokens.has('accepted')) {
    return { kind: 'release' };
  }

  return { kind: 'non_release', holdDisposition: 'pending', lpQaStatus: 'on_hold', lpStatus: 'quarantine', itemStatus: 'held' };
}

async function applyNonReleaseHoldDisposition(
  ctx: QualityContext,
  params: {
    holdId: string;
    disposition: Extract<CcpHoldDisposition, { kind: 'non_release' }>;
    reasonText: string;
  },
): Promise<void> {
  const current = await ctx.client.query<{ id: string; hold_status: string; released_at: Date | string | null }>(
    `select id::text, hold_status, released_at
       from public.quality_holds
      where org_id = app.current_org_id()
        and id = $1::uuid
      for update`,
    [params.holdId],
  );
  const hold = current.rows[0];
  if (!hold) throw new Error('quality hold not found');
  if (hold.hold_status === 'released' || hold.released_at !== null) {
    throw new Error('quality hold is already released');
  }

  await ctx.client.query(
    `update public.quality_holds
        set hold_status = 'quarantined',
            disposition = $2,
            disposition_notes = $3
      where org_id = app.current_org_id()
        and id = $1::uuid
        and hold_status <> 'released'
        and released_at is null`,
    [params.holdId, params.disposition.holdDisposition, params.reasonText],
  );

  await ctx.client.query(
    `update public.quality_hold_items
        set item_status = $2
      where org_id = app.current_org_id()
        and hold_id = $1::uuid`,
    [params.holdId, params.disposition.itemStatus],
  );

  const heldLps = await ctx.client.query<{
    id: string;
    status: string;
    qa_status: string;
    site_id: string | null;
    wo_id: string | null;
    grn_id: string | null;
  }>(
    `select lp.id::text, lp.status, lp.qa_status, lp.site_id::text, lp.wo_id::text, lp.grn_id::text
       from public.quality_hold_items qhi
       join public.license_plates lp on lp.id = qhi.license_plate_id and lp.org_id = qhi.org_id
      where qhi.org_id = app.current_org_id()
        and qhi.hold_id = $1::uuid
        and qhi.license_plate_id is not null`,
    [params.holdId],
  );

  const activeLpIds = heldLps.rows
    .filter((lp) => !TERMINAL_LP_STATUSES.includes(lp.status as (typeof TERMINAL_LP_STATUSES)[number]))
    .map((lp) => lp.id);

  if (activeLpIds.length > 0) {
    await ctx.client.query(
      `update public.license_plates
          set qa_status = $2,
              status = $3,
              updated_by = $4::uuid
        where org_id = app.current_org_id()
          and id = any($1::uuid[])
          and status <> all($5::text[])`,
      [activeLpIds, params.disposition.lpQaStatus, params.disposition.lpStatus, ctx.userId, [...TERMINAL_LP_STATUSES]],
    );
  }

  for (const lp of heldLps.rows.filter((row) => activeLpIds.includes(row.id))) {
    await ctx.client.query(
      `insert into public.lp_state_history (
         org_id,
         site_id,
         lp_id,
         from_state,
         to_state,
         reason_code,
         reason_text,
         wo_id,
         grn_id,
         created_by,
         ext_jsonb
       )
       values (
         app.current_org_id(),
         $2::uuid,
         $1::uuid,
         $3,
         $4,
         'ccp_deviation_disposition',
         $5,
         $6::uuid,
         $7::uuid,
         $8::uuid,
         $9::jsonb
       )`,
      [
        lp.id,
        lp.site_id,
        lp.status,
        params.disposition.lpStatus,
        params.reasonText,
        lp.wo_id,
        lp.grn_id,
        ctx.userId,
        JSON.stringify({
          action: 'ccp_deviation_disposition',
          holdId: params.holdId,
          holdDisposition: params.disposition.holdDisposition,
          qaStatusFrom: lp.qa_status,
          qaStatusTo: params.disposition.lpQaStatus,
          statusFrom: lp.status,
          statusTo: params.disposition.lpStatus,
        }),
      ],
    );
  }
}

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
        const holdId = deviation.hold_id;
        const holdDisposition = classifyCcpHoldDisposition(parsed.disposition);
        if (holdDisposition.kind === 'release') {
          const released = await releaseHoldCore(
            ctx,
            {
              holdId,
              disposition: 'release',
              reasonText: 'CCP deviation resolved',
            },
            {
              releaseSource: 'ccp_deviation_resolution',
              getSignatureHash: async () => {
                const holdReceipt = await signEvent(
                  {
                    signerUserId: ctx.userId,
                    pin: parsed.signature.password,
                    intent: 'qa.hold.release',
                    subject: { holdId, disposition: 'release', deviationId: parsed.id },
                    reason: 'CCP deviation resolved',
                  },
                  { client: ctx.client as unknown as pg.PoolClient },
                );
                return holdReceipt.subjectHash;
              },
            },
          );
          if (!released.ok) {
            throw new Error(released.message ?? `CCP deviation hold release failed: ${released.reason}`);
          }
        } else {
          await applyNonReleaseHoldDisposition(ctx, {
            holdId,
            disposition: holdDisposition,
            reasonText: `CCP deviation resolved: ${parsed.disposition}`,
          });
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
