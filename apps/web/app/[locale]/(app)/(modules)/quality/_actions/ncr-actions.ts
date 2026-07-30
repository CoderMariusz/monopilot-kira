'use server';

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  ESignPolicyError,
  readSignoffPolicy,
  type ESignPolicyErrorCode,
} from '@monopilot/e-sign';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../lib/i18n/revalidate-localized';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';
import {
  DEFAULT_NCR_PAGE_SIZE,
  normalizePage,
  toPaginatedResult,
  type PaginatedResult,
} from '../../../../../../lib/shared/pagination';
import { qualityListSiteClause, qualityListSiteParams } from './list-site-scope';
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

function safeRevalidateNcrRoutes(ncrId?: string): void {
  try {
    revalidateLocalized('/quality');
    revalidateLocalized('/quality/ncrs');
    if (ncrId) {
      revalidateLocalized(`/quality/ncrs/${ncrId}`);
    }
  } catch {
    // revalidate is best-effort outside a Next request context (unit tests).
  }
}

type NcrType = 'quality' | 'yield_issue' | 'allergen_deviation' | 'supplier' | 'process' | 'complaint_related';
type NcrSeverity = 'critical' | 'major' | 'minor';
type NcrStatus = 'draft' | 'open' | 'investigating' | 'awaiting_capa' | 'closed' | 'reopened' | 'cancelled';
type NcrReferenceType = 'lp' | 'batch' | 'wo' | 'po' | 'grn' | 'inspection' | 'ccp_deviation' | 'complaint' | 'supplier';

type NcrListRow = {
  id: string;
  ncrNumber: string;
  ncrType: NcrType;
  severity: NcrSeverity;
  status: NcrStatus;
  title: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  linkedHoldId: string | null;
  linkedHoldNumber: string | null;
  responseDueAt: string | null;
  createdAt: string;
  rootCauseCategory: string | null;
  closedAt: string | null;
};

/**
 * Context for an NCR auto-created from a CCP critical-limit breach
 * (haccp-actions.ts::recordMonitoring writes reference_type='ccp_deviation',
 * reference_id=<ccpId> and links the triggering monitoring-log row via
 * haccp_monitoring_log.breach_ncr_id = ncr.id, migration 289). Surfaced so the
 * NCR detail screen can show WHICH CCP / what measured value breached which limit,
 * instead of an opaque ccp_deviation reference. Null for any other reference type.
 */
type NcrCcpBreach = {
  ccpId: string;
  ccpCode: string;
  ccpName: string;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string | null;
  measuredValue: string | null;
  measuredAt: string | null;
  recordedBy: string | null;
};

type NcrDetail = NcrListRow & {
  description: string;
  referenceType: NcrReferenceType | null;
  referenceId: string | null;
  affectedQtyKg: string | null;
  detectedById: string | null;
  detectedBy: string | null;
  detectedAt: string;
  rootCause: string | null;
  rootCauseCategory: string | null;
  immediateAction: string | null;
  capaRecordId: string | null;
  closedBy: string | null;
  closedAt: string | null;
  closureSignatureHash: string | null;
  pendingSignoff: PendingQualitySignoff | null;
  pendingCloseResolution: string | null;
  requiredCloseSignatures: 1 | 2;
  inspection: null;
  ccpBreach: NcrCcpBreach | null;
};

type CreatedNcr = { id: string; ncrNumber: string; status: 'open' };
type UpdatedNcrInvestigation = Pick<
  NcrDetail,
  'id' | 'status' | 'rootCause' | 'rootCauseCategory' | 'immediateAction' | 'capaRecordId'
>;
type ClosedNcr = { id: string; ncrNumber: string; status: 'closed'; closedAt: string; signatureHash: string | null };
type PendingNcrClose = {
  id: string;
  ncrNumber: string;
  status: 'pending_second_signature';
  pendingSignoff: PendingQualitySignoff;
};

const uuidSchema = z.string().uuid();
const ncrTypeSchema = z.enum(['quality', 'yield_issue', 'allergen_deviation', 'supplier', 'process', 'complaint_related']);
const severitySchema = z.enum(['critical', 'major', 'minor']);
const statusSchema = z.enum(['draft', 'open', 'investigating', 'awaiting_capa', 'closed', 'reopened', 'cancelled']);
const referenceTypeSchema = z.enum(['lp', 'batch', 'wo', 'po', 'grn', 'inspection', 'ccp_deviation', 'complaint', 'supplier']);
const decimalStringSchema = z.string().trim().regex(/^\d+(\.\d+)?$/, 'must be a decimal string');

function actionError(err: unknown): ActionFailure {
  if (err instanceof ESignPolicyError) {
    return { ok: false, reason: 'policy', code: err.code, message: err.message };
  }
  return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
}

const listSchema = z.object({
  status: statusSchema.optional(),
  severity: severitySchema.optional(),
  ncrType: ncrTypeSchema.optional(),
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const createSchema = z
  .object({
    ncrType: ncrTypeSchema,
    severity: severitySchema,
    title: z.string().trim().max(240).optional(),
    description: z.string().trim().max(4000).optional(),
    referenceType: referenceTypeSchema.optional(),
    referenceId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
    affectedQtyKg: decimalStringSchema.optional(),
    linkedHoldId: uuidSchema.optional(),
  })
  .refine((input) => Boolean(input.referenceType) === Boolean(input.referenceId), {
    message: 'reference_type_and_id_must_match',
  });

type CreateNcrInput = z.infer<typeof createSchema>;

async function resolveNcrLinkedProductId(
  ctx: QualityContext,
  referenceType: NcrReferenceType,
  referenceId: string,
): Promise<string | null> {
  const { rows } = await ctx.client.query<{ product_id: string | null }>(
    `select lp.product_id::text as product_id
       from public.license_plates lp
      where $1::text = 'lp'
        and lp.org_id = app.current_org_id()
        and lp.id = $2::uuid
     union all
     select coalesce(qi.product_id, lp.product_id, woo.product_id)::text as product_id
       from public.quality_inspections qi
       left join public.license_plates lp on qi.reference_type = 'lp' and lp.id = qi.reference_id and lp.org_id = qi.org_id
       left join public.wo_outputs woo on qi.reference_type = 'wo_output' and woo.id = qi.reference_id and woo.org_id = qi.org_id
      where $1::text = 'inspection'
        and qi.org_id = app.current_org_id()
        and qi.id = $2::uuid
     union all
     select wo.product_id::text as product_id
       from public.work_orders wo
      where $1::text = 'wo'
        and wo.org_id = app.current_org_id()
        and wo.id = $2::uuid
     union all
     select woo.product_id::text as product_id
       from public.wo_outputs woo
      where $1::text = 'batch'
        and woo.org_id = app.current_org_id()
        and woo.id = $2::uuid
     union all
     -- A GRN is a receipt *header*; products live on its lines (grn_items) and one
     -- receipt may cover several. Only auto-derive when the receipt is unambiguous:
     -- the caller throws ncr_product_reference_mismatch against this value, so an
     -- arbitrary pick from a multi-product GRN would reject valid NCRs.
     select min(gi.product_id::text) as product_id
       from public.grn_items gi
      where $1::text = 'grn'
        and gi.org_id = app.current_org_id()
        and gi.grn_id = $2::uuid
     having count(distinct gi.product_id) = 1
      limit 1`,
    [referenceType, referenceId],
  );
  return rows[0]?.product_id ?? null;
}

async function assertNcrCreateLinks(
  ctx: QualityContext,
  parsed: CreateNcrInput,
): Promise<{ productId: string | null }> {
  let productId = parsed.productId ?? null;

  if (parsed.referenceType && parsed.referenceId) {
    const { rows } = await ctx.client.query<{ ok: boolean }>(
      `select true as ok
         from public.license_plates lp
        where $1::text = 'lp'
          and lp.org_id = app.current_org_id()
          and lp.id = $2::uuid
       union all
       select true as ok
         from public.quality_inspections qi
        where $1::text = 'inspection'
          and qi.org_id = app.current_org_id()
          and qi.id = $2::uuid
       union all
       select true as ok
         from public.grns grn
        where $1::text = 'grn'
          and grn.org_id = app.current_org_id()
          and grn.id = $2::uuid
       union all
       select true as ok
         from public.work_orders wo
        where $1::text = 'wo'
          and wo.org_id = app.current_org_id()
          and wo.id = $2::uuid
       union all
       select true as ok
         from public.purchase_orders po
        where $1::text = 'po'
          and po.org_id = app.current_org_id()
          and po.id = $2::uuid
       union all
       select true as ok
         from public.haccp_ccps c
        where $1::text = 'ccp_deviation'
          and c.org_id = app.current_org_id()
          and c.id = $2::uuid
       union all
       select true as ok
         from public.complaints c
        where $1::text = 'complaint'
          and c.org_id = app.current_org_id()
          and c.id = $2::uuid
       union all
       select true as ok
         from public.wo_outputs woo
        where $1::text = 'batch'
          and woo.org_id = app.current_org_id()
          and woo.id = $2::uuid
       union all
       select true as ok
         from public.suppliers s
        where $1::text = 'supplier'
          and s.org_id = app.current_org_id()
          and s.id = $2::uuid
        limit 1`,
      [parsed.referenceType, parsed.referenceId],
    );
    if (!rows[0]) throw new Error('ncr_reference_not_found');

    const sourceProductId = await resolveNcrLinkedProductId(ctx, parsed.referenceType, parsed.referenceId);
    if (sourceProductId) {
      if (productId && productId !== sourceProductId) {
        throw new Error('ncr_product_reference_mismatch');
      }
      if (!productId) {
        productId = sourceProductId;
      }
    }
  }

  if (productId) {
    const { rows } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.items
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [productId],
    );
    if (!rows[0]) throw new Error('ncr_product_not_found');
  }

  if (parsed.linkedHoldId) {
    const { rows } = await ctx.client.query<{ id: string }>(
      `select id::text
         from public.quality_holds
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1`,
      [parsed.linkedHoldId],
    );
    if (!rows[0]) throw new Error('ncr_linked_hold_not_found');
  }

  return { productId };
}

async function resolveNcrSourceSiteId(
  ctx: QualityContext,
  referenceType: NcrReferenceType | undefined,
  referenceId: string | undefined,
): Promise<string | null> {
  if (!referenceType || !referenceId) return null;
  const { rows } = await ctx.client.query<{ site_id: string | null }>(
    `select lp.site_id::text as site_id
       from public.license_plates lp
      where $1::text = 'lp'
        and lp.org_id = app.current_org_id()
        and lp.id = $2::uuid
     union all
     select grn.site_id::text as site_id
       from public.grns grn
      where $1::text = 'grn'
        and grn.org_id = app.current_org_id()
        and grn.id = $2::uuid
     union all
     select wo.site_id::text as site_id
       from public.work_orders wo
      where $1::text = 'wo'
        and wo.org_id = app.current_org_id()
        and wo.id = $2::uuid
     union all
     select qi.site_id::text as site_id
       from public.quality_inspections qi
      where $1::text = 'inspection'
        and qi.org_id = app.current_org_id()
        and qi.id = $2::uuid
      limit 1`,
    [referenceType, referenceId],
  );
  return rows[0]?.site_id ?? null;
}

const investigationSchema = z.object({
  ncrId: uuidSchema,
  rootCause: z.string().trim().max(4000).optional(),
  rootCauseCategory: z.string().trim().max(160).optional(),
  immediateAction: z.string().trim().max(4000).optional(),
  correctiveAction: z.string().trim().max(4000).optional(),
  capaRecordId: uuidSchema.optional(),
  assignedTo: uuidSchema.optional(),
  investigatorId: uuidSchema.optional(),
});

const closeSchema = z.object({
  ncrId: uuidSchema,
  resolution: z.string().trim().min(1).max(4000),
  signature: z.object({ password: z.string().min(1) }),
});

async function writeAuditEvent(
  ctx: QualityContext,
  params: {
    action: string;
    resourceType: 'ncr_report';
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.audit_events
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, request_id, retention_class)
     values
       (app.current_org_id(), $1::uuid, 'user', $2, $3, $4,
        $5::jsonb, $6::jsonb, $7::uuid, 'standard')`,
    [
      ctx.userId,
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
      randomUUID(),
    ],
  );
}

async function writeNcrOutbox(
  ctx: QualityContext,
  params: {
    eventType: 'quality.ncr.opened' | 'quality.ncr.updated' | 'quality.ncr.closed';
    aggregateId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'ncr_report', $2::uuid, $3::jsonb, 'quality-ncr-v1')`,
    [
      params.eventType,
      params.aggregateId,
      JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, ...params.payload }),
    ],
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapListRow(row: {
  id: string;
  ncr_number: string;
  ncr_type: NcrType;
  severity: NcrSeverity;
  status: NcrStatus;
  title: string;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  linked_hold_id: string | null;
  linked_hold_number: string | null;
  response_due_at: Date | string | null;
  created_at: Date | string;
  root_cause_category: string | null;
  closed_at: Date | string | null;
}): NcrListRow {
  return {
    id: row.id,
    ncrNumber: row.ncr_number,
    ncrType: row.ncr_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    linkedHoldId: row.linked_hold_id,
    linkedHoldNumber: row.linked_hold_number,
    responseDueAt: toIso(row.response_due_at),
    createdAt: toIso(row.created_at) ?? '',
    rootCauseCategory: row.root_cause_category,
    closedAt: toIso(row.closed_at),
  };
}

export async function listNcrs(input: {
  status?: NcrStatus;
  severity?: NcrSeverity;
  ncrType?: NcrType;
  search?: string;
  page?: number;
  offset?: number;
  limit?: number;
} = {}): Promise<ActionResult<PaginatedResult<NcrListRow>>> {
  try {
    const parsed = listSchema.parse(input);
    const page = normalizePage({
      page: parsed.page,
      offset: parsed.offset,
      limit: parsed.limit,
      defaultLimit: DEFAULT_NCR_PAGE_SIZE,
      maxLimit: 200,
    });
    return await withOrgContext(async (ctx): Promise<ActionResult<PaginatedResult<NcrListRow>>> => {
      const s = await getActiveSiteId({ client: ctx.client });

      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const filterParams = [
        parsed.status ?? null,
        parsed.severity ?? null,
        parsed.ncrType ?? null,
        parsed.search || null,
      ] as const;
      const siteClause = qualityListSiteClause('n', s, filterParams.length + 1);
      const baseParams = qualityListSiteParams(filterParams, s);
      const limitParam = `$${baseParams.length + 1}`;
      const offsetParam = `$${baseParams.length + 2}`;

      const [countResult, dataResult] = await Promise.all([
        ctx.client.query<{ total: number }>(
          `select count(*)::int as total
             from public.ncr_reports n
             left join public.items i on i.id = n.product_id and i.org_id = n.org_id
             left join public.quality_holds h on h.id = n.linked_hold_id and h.org_id = n.org_id
            where n.org_id = app.current_org_id()
              ${siteClause}
              and ($1::text is null or n.status = $1)
              and ($2::text is null or n.severity = $2)
              and ($3::text is null or n.ncr_type = $3)
              and ($4::text is null or (
                n.ncr_number ilike '%' || $4 || '%'
                or n.title ilike '%' || $4 || '%'
                or n.description ilike '%' || $4 || '%'
                or i.item_code ilike '%' || $4 || '%'
                or i.name ilike '%' || $4 || '%'
                or h.hold_number ilike '%' || $4 || '%'
              ))`,
          [...baseParams],
        ),
        ctx.client.query<Parameters<typeof mapListRow>[0]>(
        `select
           n.id::text,
           n.ncr_number,
           n.ncr_type,
           n.severity,
           n.status,
           n.title,
           n.product_id::text,
           i.item_code as product_code,
           i.name as product_name,
           n.linked_hold_id::text,
           h.hold_number as linked_hold_number,
           n.response_due_at,
           n.created_at,
           n.root_cause_category,
           n.closed_at
         from public.ncr_reports n
         left join public.items i on i.id = n.product_id and i.org_id = n.org_id
         left join public.quality_holds h on h.id = n.linked_hold_id and h.org_id = n.org_id
        where n.org_id = app.current_org_id()
          ${siteClause}
          and ($1::text is null or n.status = $1)
          and ($2::text is null or n.severity = $2)
          and ($3::text is null or n.ncr_type = $3)
          and ($4::text is null or (
            n.ncr_number ilike '%' || $4 || '%'
            or n.title ilike '%' || $4 || '%'
            or n.description ilike '%' || $4 || '%'
            or i.item_code ilike '%' || $4 || '%'
            or i.name ilike '%' || $4 || '%'
            or h.hold_number ilike '%' || $4 || '%'
          ))
        order by n.created_at desc, n.id desc
        limit ${limitParam}::int offset ${offsetParam}::int`,
        [...baseParams, page.limit, page.offset],
        ),
      ]);

      return {
        ok: true,
        data: toPaginatedResult(
          dataResult.rows.map(mapListRow),
          Number(countResult.rows[0]?.total ?? 0),
          page,
        ),
      };
    });
  } catch (err) {
    return actionError(err);
  }
}

/**
 * Resolves the CCP-breach context for an NCR whose reference_type='ccp_deviation'.
 * reference_id is the haccp_ccps id (see haccp-actions.ts::recordMonitoring); the
 * triggering reading is the haccp_monitoring_log row that links back via
 * breach_ncr_id = <this NCR> (migration 289). Returns the CCP code/name + critical
 * limits + uom, plus the measured value / timestamp / reader (resolved to a display
 * name — never a raw UUID). The monitoring-log half is a LEFT join so a missing
 * breach row still surfaces the CCP code/limits via reference_id (graceful degrade).
 */
async function fetchCcpBreachContext(
  ctx: QualityContext,
  ncrId: string,
  ccpId: string,
): Promise<NcrCcpBreach | null> {
  const { rows } = await ctx.client.query<{
    ccp_id: string;
    ccp_code: string;
    ccp_name: string;
    critical_limit_min: string | null;
    critical_limit_max: string | null;
    unit: string | null;
    measured_value: string | null;
    measured_at: Date | string | null;
    recorded_by_name: string | null;
  }>(
    `select
       c.id::text as ccp_id,
       c.ccp_code,
       c.name as ccp_name,
       c.critical_limit_min::text,
       c.critical_limit_max::text,
       nullif(c.unit, '') as unit,
       l.measured_value::text,
       l.measured_at,
       coalesce(u.display_name, u.email::text) as recorded_by_name
     from public.haccp_ccps c
     left join public.haccp_monitoring_log l
       on l.org_id = c.org_id
      and l.ccp_id = c.id
      and l.breach_ncr_id = $2::uuid
     left join public.users u
       on u.id = l.recorded_by and u.org_id = c.org_id
    where c.org_id = app.current_org_id()
      and c.id = $1::uuid
    order by l.measured_at desc nulls last
    limit 1`,
    [ccpId, ncrId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ccpId: row.ccp_id,
    ccpCode: row.ccp_code,
    ccpName: row.ccp_name,
    criticalLimitMin: row.critical_limit_min,
    criticalLimitMax: row.critical_limit_max,
    unit: row.unit,
    measuredValue: row.measured_value,
    measuredAt: toIso(row.measured_at),
    recordedBy: row.recorded_by_name,
  };
}

export async function getNcrDetail(ncrId: string): Promise<ActionResult<NcrDetail | null>> {
  try {
    const parsedNcrId = uuidSchema.parse(ncrId);
    return await withOrgContext(async (ctx): Promise<ActionResult<NcrDetail | null>> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<
        Parameters<typeof mapListRow>[0] & {
          description: string;
          reference_type: NcrReferenceType | null;
          reference_id: string | null;
          affected_qty_kg: string | null;
          detected_by_id: string | null;
          detected_by: string | null;
          detected_at: Date | string;
          root_cause: string | null;
          root_cause_category: string | null;
          immediate_action: string | null;
          capa_record_id: string | null;
          closed_by: string | null;
          closed_at: Date | string | null;
          closure_signature_hash: string | null;
          ext_jsonb: Record<string, unknown>;
        }
      >(
        `select
           n.id::text,
           n.ncr_number,
           n.ncr_type,
           n.severity,
           n.status,
           n.title,
           n.description,
           n.reference_type,
           n.reference_id::text,
           n.product_id::text,
           i.item_code as product_code,
           i.name as product_name,
           n.affected_qty_kg::text,
           n.detected_by::text as detected_by_id,
           coalesce(detected.display_name, detected.name, detected.email::text, n.detected_by::text) as detected_by,
           n.detected_at,
           n.root_cause,
           n.root_cause_category,
           n.immediate_action,
           n.capa_record_id::text,
           n.closed_by::text,
           n.closed_at,
           n.closure_signature_hash,
           n.ext_jsonb,
           n.linked_hold_id::text,
           h.hold_number as linked_hold_number,
           n.response_due_at,
           n.created_at
         from public.ncr_reports n
         left join public.items i on i.id = n.product_id and i.org_id = n.org_id
         left join public.quality_holds h on h.id = n.linked_hold_id and h.org_id = n.org_id
         left join public.users detected on detected.id = n.detected_by and detected.org_id = n.org_id
        where n.org_id = app.current_org_id()
          and n.id = $1::uuid
        limit 1`,
        [parsedNcrId],
      );
      const row = rows[0];
      if (!row) return { ok: true, data: null };

      const [ccpBreach, closePolicy] = await Promise.all([
        row.reference_type === 'ccp_deviation' && row.reference_id
          ? fetchCcpBreachContext(ctx, parsedNcrId, row.reference_id)
          : Promise.resolve(null),
        readSignoffPolicy(ctx.client as pg.PoolClient, 'qa.ncr.close'),
      ]);
      const closure = row.ext_jsonb?.closure;
      const closurePending =
        typeof closure === 'object'
        && closure !== null
        && (closure as { pending?: unknown }).pending === true;
      const pendingCloseResolution =
        closurePending && typeof (closure as { resolution?: unknown }).resolution === 'string'
          ? (closure as { resolution: string }).resolution
          : null;
      const pendingSignoff =
        closurePending && row.closure_signature_hash && row.status !== 'closed'
          ? await readPendingQualitySignoff(
              ctx.client,
              'qa.ncr.close',
              { subjectHash: row.closure_signature_hash },
            )
          : null;

      return {
        ok: true,
        data: {
          ...mapListRow(row),
          description: row.description,
          referenceType: row.reference_type,
          referenceId: row.reference_id,
          affectedQtyKg: row.affected_qty_kg,
          detectedById: row.detected_by_id,
          detectedBy: row.detected_by,
          detectedAt: toIso(row.detected_at) ?? '',
          rootCause: row.root_cause,
          rootCauseCategory: row.root_cause_category,
          immediateAction: row.immediate_action,
          capaRecordId: row.capa_record_id,
          closedBy: row.closed_by,
          closedAt: toIso(row.closed_at),
          closureSignatureHash: row.closure_signature_hash,
          pendingSignoff,
          pendingCloseResolution,
          requiredCloseSignatures: closePolicy?.requiredSignatures === 2 ? 2 : 1,
          inspection: null,
          ccpBreach,
        },
      };
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function createNcr(input: {
  ncrType: NcrType;
  severity: NcrSeverity;
  title?: string;
  description?: string;
  referenceType?: NcrReferenceType;
  referenceId?: string;
  productId?: string;
  affectedQtyKg?: string;
  linkedHoldId?: string;
}): Promise<ActionResult<CreatedNcr>> {
  try {
    const parsed = createSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CreatedNcr>> => {
      if (!(await hasPermission(ctx, 'quality.ncr.create'))) return { ok: false, reason: 'forbidden' };

      const s =
        (await resolveNcrSourceSiteId(ctx, parsed.referenceType, parsed.referenceId)) ??
        (await getActiveSiteId({ client: ctx.client }));

      const { productId } = await assertNcrCreateLinks(ctx, parsed);

      const created = await ctx.client.query<CreatedNcr & { ncr_number: string }>(
        `insert into public.ncr_reports (
           org_id,
           site_id,
           ncr_type,
           severity,
           status,
           title,
           description,
           reference_type,
           reference_id,
           product_id,
           detected_by,
           affected_qty_kg,
           linked_hold_id
         )
         values (
           app.current_org_id(),
           $11::uuid,
           $1,
           $2,
           'open',
           $3,
           $4,
           $5,
           $6::uuid,
           $7::uuid,
           $8::uuid,
           $9::numeric,
           $10::uuid
         )
         returning id::text, ncr_number, status`,
        [
          parsed.ncrType,
          parsed.severity,
          parsed.title || 'Non-conformance',
          parsed.description || '',
          parsed.referenceType ?? null,
          parsed.referenceId ?? null,
          productId,
          ctx.userId,
          parsed.affectedQtyKg ?? null,
          parsed.linkedHoldId ?? null,
          s,
        ],
      );
      const row = created.rows[0];
      if (!row) throw new Error('NCR insert did not return a row');

      await writeNcrOutbox(ctx, {
        eventType: 'quality.ncr.opened',
        aggregateId: row.id,
        payload: { ncrId: row.id, ncrNumber: row.ncr_number, severity: parsed.severity, ncrType: parsed.ncrType },
      });

      await writeAuditEvent(ctx, {
        action: 'quality.ncr.opened',
        resourceType: 'ncr_report',
        resourceId: row.id,
        beforeState: null,
        afterState: {
          ncrId: row.id,
          ncrNumber: row.ncr_number,
          status: 'open',
          severity: parsed.severity,
          ncrType: parsed.ncrType,
        },
      });

      safeRevalidateNcrRoutes(row.id);

      return { ok: true, data: { id: row.id, ncrNumber: row.ncr_number, status: 'open' } };
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function updateNcrInvestigation(input: {
  ncrId: string;
  rootCause?: string;
  rootCauseCategory?: string;
  immediateAction?: string;
  correctiveAction?: string;
  capaRecordId?: string;
  assignedTo?: string;
  investigatorId?: string;
}): Promise<ActionResult<UpdatedNcrInvestigation>> {
  try {
    const parsed = investigationSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<UpdatedNcrInvestigation>> => {
      if (!(await hasPermission(ctx, 'quality.ncr.create'))) return { ok: false, reason: 'forbidden' };

      const before = await ctx.client.query<{
        id: string;
        status: NcrStatus;
        root_cause: string | null;
        root_cause_category: string | null;
        immediate_action: string | null;
      }>(
        `select id::text, status, root_cause, root_cause_category, immediate_action
           from public.ncr_reports
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status not in ('closed', 'cancelled')
          limit 1`,
        [parsed.ncrId],
      );
      const prior = before.rows[0];
      if (!prior) throw new Error('NCR not found or already terminal');

      const updated = await ctx.client.query<{
        id: string;
        status: NcrStatus;
        root_cause: string | null;
        root_cause_category: string | null;
        immediate_action: string | null;
        capa_record_id: string | null;
      }>(
        `update public.ncr_reports
            set status = case when status in ('draft', 'open', 'reopened') then 'investigating' else status end,
                root_cause = coalesce($2, root_cause),
                root_cause_category = coalesce($3, root_cause_category),
                immediate_action = coalesce($4, immediate_action),
                capa_record_id = coalesce($5::uuid, capa_record_id),
                assigned_to = coalesce($6::uuid, assigned_to),
                investigator_id = coalesce($7::uuid, investigator_id),
                ext_jsonb = case
                  when $8::text is null then ext_jsonb
                  else jsonb_set(
                    ext_jsonb,
                    '{investigation,corrective_action}',
                    to_jsonb($8::text),
                    true
                  )
                end
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status not in ('closed', 'cancelled')
          returning id::text, status, root_cause, root_cause_category, immediate_action, capa_record_id::text`,
        [
          parsed.ncrId,
          parsed.rootCause ?? null,
          parsed.rootCauseCategory ?? null,
          parsed.immediateAction ?? null,
          parsed.capaRecordId ?? null,
          parsed.assignedTo ?? null,
          parsed.investigatorId ?? null,
          parsed.correctiveAction ?? null,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('NCR not found or already terminal');

      await writeNcrOutbox(ctx, {
        eventType: 'quality.ncr.updated',
        aggregateId: row.id,
        payload: { ncrId: row.id, status: row.status },
      });

      await writeAuditEvent(ctx, {
        action: 'quality.ncr.updated',
        resourceType: 'ncr_report',
        resourceId: row.id,
        beforeState: {
          ncrId: prior.id,
          status: prior.status,
          rootCause: prior.root_cause,
          rootCauseCategory: prior.root_cause_category,
          immediateAction: prior.immediate_action,
        },
        afterState: {
          ncrId: row.id,
          status: row.status,
          rootCause: row.root_cause,
          rootCauseCategory: row.root_cause_category,
          immediateAction: row.immediate_action,
        },
      });

      safeRevalidateNcrRoutes(row.id);

      return {
        ok: true,
        data: {
          id: row.id,
          status: row.status,
          rootCause: row.root_cause,
          rootCauseCategory: row.root_cause_category,
          immediateAction: row.immediate_action,
          capaRecordId: row.capa_record_id,
        },
      };
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function closeNcr(input: {
  ncrId: string;
  resolution: string;
  signature: { password: string };
}): Promise<ActionResult<ClosedNcr | PendingNcrClose>> {
  try {
    const parsed = closeSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<ClosedNcr | PendingNcrClose>> => {
      const [canCreateNcr, canCloseCritical] = await Promise.all([
        hasPermission(ctx, 'quality.ncr.create'),
        hasPermission(ctx, 'quality.ncr.close_critical'),
      ]);
      if (!canCreateNcr && !canCloseCritical) return { ok: false, reason: 'forbidden' };

      const current = await ctx.client.query<{
        id: string;
        ncr_number: string;
        severity: NcrSeverity;
        status: NcrStatus;
        closed_at: Date | string | null;
        closure_signature_hash: string | null;
        root_cause: string | null;
        ext_jsonb: Record<string, unknown>;
      }>(
        `select id::text, ncr_number, severity, status, closed_at, closure_signature_hash,
                root_cause, ext_jsonb
           from public.ncr_reports
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.ncrId],
      );
      const ncr = current.rows[0];
      if (!ncr) throw new Error('NCR not found');
      if (ncr.status === 'closed' || ncr.status === 'cancelled' || ncr.closed_at !== null) {
        throw new Error('NCR is already terminal');
      }

      if (ncr.severity === 'critical') {
        if (!canCloseCritical) return { ok: false, reason: 'forbidden' };
      } else if (!canCreateNcr) {
        return { ok: false, reason: 'forbidden' };
      }

      // V-QA-NCR-005 — close requires a recorded root cause (the Investigation card
      // marks the field required and the prototype hides Close until it is filled:
      // quality/ncr-screens.jsx:191,268). Enforced HERE, not in
      // updateNcrInvestigation, so saving a partial investigation stays possible.
      // CAPA stays optional on purpose — capa_records is Phase 2 (PRD Epic 8G).
      if ((ncr.root_cause ?? '').trim().length === 0) {
        return { ok: false, reason: 'error', message: 'root_cause_required' };
      }

      const closure =
        typeof ncr.ext_jsonb?.closure === 'object' && ncr.ext_jsonb.closure !== null
          ? (ncr.ext_jsonb.closure as { pending?: unknown; resolution?: unknown })
          : null;
      const pendingResolution =
        closure?.pending === true && typeof closure.resolution === 'string'
          ? closure.resolution
          : null;
      if (pendingResolution && !ncr.closure_signature_hash) {
        throw new Error('NCR has an incomplete pending close-signature state');
      }
      if (pendingResolution && pendingResolution !== parsed.resolution) {
        throw new Error('The pending NCR close decision cannot be changed');
      }
      const resolution = pendingResolution ?? parsed.resolution;
      const signoff = await collectQualitySignoff({
        client: ctx.client,
        signerUserId: ctx.userId,
        pin: parsed.signature.password,
        intent: 'qa.ncr.close',
        subject: { ncrId: parsed.ncrId, resolution, severity: ncr.severity },
        reason: resolution,
        pending: pendingResolution && ncr.closure_signature_hash
          ? { subjectHash: ncr.closure_signature_hash }
          : undefined,
        receiptHashErrorMessage: 'NCR close e-signature did not produce a receipt hash',
      });

      if (!signoff.complete) {
        const pending = await ctx.client.query<{ status: NcrStatus }>(
          `update public.ncr_reports
              set closure_signature_hash = $2,
                  ext_jsonb = jsonb_set(
                    ext_jsonb,
                    '{closure}',
                    jsonb_build_object(
                      'pending', true,
                      'resolution', $3::text,
                      'firstSignatureId', $4::text
                    ),
                    true
                  )
            where org_id = app.current_org_id()
              and id = $1::uuid
              and status not in ('closed', 'cancelled')
              and closed_at is null
            returning status`,
          [parsed.ncrId, signoff.receipt.subjectHash, resolution, signoff.receipt.signatureId],
        );
        if (!pending.rows[0]) throw new Error('NCR pending close update did not return a row');

        safeRevalidateNcrRoutes(parsed.ncrId);
        return {
          ok: true,
          data: {
            id: parsed.ncrId,
            ncrNumber: ncr.ncr_number,
            status: 'pending_second_signature',
            pendingSignoff: signoff.pendingSignoff,
          },
        };
      }
      const receipt = signoff.receipt;

      const updated = await ctx.client.query<{ closed_at: Date | string }>(
        `update public.ncr_reports
            set status = 'closed',
                closed_by = $2::uuid,
                closed_at = pg_catalog.now(),
                closure_signature_hash = $3,
                ext_jsonb = jsonb_set(
                  ext_jsonb,
                  '{closure}',
                  jsonb_build_object(
                    'pending', false,
                    'resolution', $4::text,
                    'firstSignatureId', $5::text,
                    'finalSignatureId', $6::text
                  ),
                  true
                )
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status not in ('closed', 'cancelled')
            and closed_at is null
          returning closed_at`,
        [
          parsed.ncrId,
          ctx.userId,
          receipt.subjectHash,
          resolution,
          signoff.firstSignature?.signatureId ?? receipt.signatureId,
          receipt.signatureId,
        ],
      );
      const closedAt = updated.rows[0]?.closed_at;
      if (!closedAt) throw new Error('NCR close update did not return a row');

      await writeNcrOutbox(ctx, {
        eventType: 'quality.ncr.closed',
        aggregateId: parsed.ncrId,
        payload: {
          ncrId: parsed.ncrId,
          ncrNumber: ncr.ncr_number,
          severity: ncr.severity,
          signatureHash: receipt.subjectHash,
        },
      });

      await writeAuditEvent(ctx, {
        action: 'quality.ncr.closed',
        resourceType: 'ncr_report',
        resourceId: parsed.ncrId,
        beforeState: {
          ncrId: ncr.id,
          ncrNumber: ncr.ncr_number,
          status: ncr.status,
          severity: ncr.severity,
        },
        afterState: {
          ncrId: parsed.ncrId,
          ncrNumber: ncr.ncr_number,
          status: 'closed',
          severity: ncr.severity,
          signatureHash: receipt.subjectHash,
          closedAt: toIso(closedAt),
          resolution,
        },
      });

      safeRevalidateNcrRoutes(parsed.ncrId);

      return {
        ok: true,
        data: {
          id: parsed.ncrId,
          ncrNumber: ncr.ncr_number,
          status: 'closed',
          closedAt: toIso(closedAt) ?? '',
          signatureHash: receipt.subjectHash,
        },
      };
    });
  } catch (err) {
    return actionError(err);
  }
}
