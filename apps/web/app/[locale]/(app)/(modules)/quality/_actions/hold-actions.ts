'use server';

import type pg from 'pg';
import { ESignPolicyError, signEvent, type ESignPolicyErrorCode } from '@monopilot/e-sign';
import { assertNoActiveHoldForLp } from '@monopilot/server/quality/holdsGuard.js';
import { z } from 'zod';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  applyWoOutputHoldForContext,
  restoreWoOutputsAfterWoHoldReleaseForContext,
} from '../../../../../../lib/production/output/transition-output-qa';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';

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

type HoldStatusFilter = 'active' | 'released' | 'all';
type ReferenceType = 'lp' | 'batch' | 'wo' | 'po' | 'grn';
type HoldPriority = 'low' | 'medium' | 'high' | 'critical';
type ReleaseDisposition = 'release' | 'scrap' | 'rework' | 'partial';

type HoldListRow = {
  id: string;
  holdNumber: string;
  referenceType: ReferenceType;
  referenceId: string;
  referenceDisplay: string;
  reasonCodeId: string | null;
  reasonLabel: string | null;
  reasonText: string | null;
  priority: HoldPriority;
  status: string;
  itemCount: number;
  createdAt: string;
  estimatedReleaseAt: string | null;
  releasedAt: string | null;
};

type HoldDetail = HoldListRow & {
  disposition: string | null;
  releaseNotes: string | null;
  releaseSignatureHash: string | null;
  releasedBy: string | null;
  items: Array<{
    id: string;
    licensePlateId: string | null;
    lpNumber: string | null;
    itemId: string | null;
    itemCode: string | null;
    qtyHeldKg: string | null;
    qtyReleasedKg: string | null;
    status: string;
  }>;
  ncrs: Array<{
    id: string;
    ncrNumber: string;
    title: string;
    severity: string;
    status: string;
  }>;
};

type CreatedHold = {
  id: string;
  holdNumber: string;
  referenceType: ReferenceType;
  referenceId: string;
  status: 'open';
  heldLpIds: string[];
};

type ReleasedHold = {
  id: string;
  holdNumber: string;
  status: 'released';
  disposition: ReleaseDisposition;
  releasedAt: string;
  signatureHash: string;
};

const ACTIVE_HOLD_STATUSES = ['open', 'investigating', 'escalated', 'quarantined'] as const;
const TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

function actionError(err: unknown): ActionFailure {
  if (err instanceof ESignPolicyError) {
    return { ok: false, reason: 'policy', code: err.code, message: err.message };
  }
  return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
}

const listSchema = z.object({
  status: z.enum(['active', 'released', 'all']).optional(),
  referenceType: z.enum(['lp', 'batch', 'wo', 'po', 'grn']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const uuidSchema = z.string().uuid();

const createSchema = z
  .object({
    referenceType: z.enum(['lp', 'batch', 'wo', 'po', 'grn']),
    referenceId: z.string().trim().min(1).max(120),
    reasonCodeId: uuidSchema.optional(),
    reasonText: z.string().trim().max(2000).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    lpIds: z.array(uuidSchema).optional(),
    estimatedReleaseAt: z.string().date().optional(),
  })
  .refine((input) => input.reasonCodeId || input.reasonText, {
    message: 'reasonCodeId or reasonText is required',
  })
  .refine((input) => input.referenceType === 'batch' || uuidSchema.safeParse(input.referenceId).success, {
    message: 'referenceId must be a UUID for this reference type',
    path: ['referenceId'],
  });

const releaseSchema = z.object({
  holdId: uuidSchema,
  disposition: z.enum(['release', 'scrap', 'rework', 'partial']),
  reasonText: z.string().trim().min(1).max(2000),
  signature: z.object({ password: z.string().min(1) }),
});

const warehouseLpUnblockReleaseSchema = z.object({
  lpId: uuidSchema,
  reasonText: z.string().trim().min(1).max(2000),
  signature: z.object({ password: z.string().min(1) }),
});

async function writeOutbox(
  ctx: QualityContext,
  params: { eventType: 'quality.hold.created' | 'quality.hold.released'; aggregateId: string; payload: Record<string, unknown> },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'quality_hold', $2::uuid, $3::jsonb, 'quality-holds-v1')`,
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
  hold_number: string;
  reference_type: ReferenceType;
  reference_id: string;
  reference_display: string | null;
  reason_code_id: string | null;
  reason_label: string | null;
  reason_free_text: string | null;
  priority: HoldPriority;
  hold_status: string;
  item_count: number | string | null;
  created_at: Date | string;
  estimated_release_at: string | null;
  released_at: Date | string | null;
}): HoldListRow {
  return {
    id: row.id,
    holdNumber: row.hold_number,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    referenceDisplay: row.reference_display ?? row.reference_id,
    reasonCodeId: row.reason_code_id,
    reasonLabel: row.reason_label,
    reasonText: row.reason_free_text,
    priority: row.priority,
    status: row.hold_status,
    itemCount: Number(row.item_count ?? 0),
    createdAt: toIso(row.created_at) ?? '',
    estimatedReleaseAt: row.estimated_release_at,
    releasedAt: toIso(row.released_at),
  };
}

async function getReasonDurationDays(ctx: QualityContext, reasonCodeId?: string): Promise<number | null> {
  if (!reasonCodeId) return null;
  const { rows } = await ctx.client.query<{ duration_days: number | string | null }>(
    `select case when (rt.row_data->>'default_hold_duration_days') ~ '^[0-9]+$' then (rt.row_data->>'default_hold_duration_days')::int else null end as duration_days
       from public.reference_tables rt
      where rt.org_id = $1::uuid
        and rt.table_code = 'reference.quality_hold_reasons'
        and rt.is_active
        and (
          rt.row_key = $2
          or rt.row_data->>'id' = $2
          or rt.row_data->>'reason_code_id' = $2
        )
      limit 1`,
    [ctx.orgId, reasonCodeId],
  );
  return rows[0]?.duration_days == null ? null : Number(rows[0].duration_days);
}

async function getExplicitDurationDays(ctx: QualityContext, estimatedReleaseAt?: string): Promise<number | null> {
  if (!estimatedReleaseAt) return null;
  const { rows } = await ctx.client.query<{ days: number | string }>(
    `select greatest(($1::date - current_date), 0)::int as days`,
    [estimatedReleaseAt],
  );
  return Number(rows[0]?.days ?? 0);
}

async function createHoldCore(
  ctx: QualityContext,
  parsed: z.infer<typeof createSchema>,
): Promise<CreatedHold> {
  const siteId = await getActiveSiteId({ client: ctx.client });

  const explicitDurationDays = await getExplicitDurationDays(ctx, parsed.estimatedReleaseAt);
  const reasonDurationDays = await getReasonDurationDays(ctx, parsed.reasonCodeId);
  const defaultHoldDurationDays = explicitDurationDays ?? reasonDurationDays;

  const hold = await ctx.client.query<{
    id: string;
    hold_number: string;
    reference_type: ReferenceType;
    reference_id: string;
    hold_status: 'open';
  }>(
    `insert into public.quality_holds (
       org_id,
       site_id,
       reference_type,
       reference_id,
       reference_text,
       reason_code_id,
       reason_free_text,
       priority,
       hold_status,
       default_hold_duration_days,
       created_by
     )
     values (
       app.current_org_id(),
       $8::uuid,
       $1,
       $2::uuid,
       $9,
       $3::uuid,
       $4,
       $5,
       'open',
       $6::int,
       $7::uuid
     )
     returning id::text, hold_number, reference_type, coalesce(reference_text, reference_id::text) as reference_id, hold_status`,
    [
      parsed.referenceType,
      // pg infers a parameter's type from its cast, so one $n used as both
      // ::uuid and bare text fails at BIND time for batch references (22P02).
      // Split reference into two parameters computed here instead.
      parsed.referenceType === 'batch' ? null : parsed.referenceId,
      parsed.reasonCodeId ?? null,
      parsed.reasonText ?? null,
      parsed.priority,
      defaultHoldDurationDays,
      ctx.userId,
      siteId,
      parsed.referenceType === 'batch' ? parsed.referenceId.trim() : null,
    ],
  );
  const created = hold.rows[0];
  if (!created) throw new Error('quality hold insert did not return a row');

  const lpIds = [...new Set(parsed.referenceType === 'lp' ? [parsed.referenceId, ...(parsed.lpIds ?? [])] : parsed.lpIds ?? [])];
  if (lpIds.length > 0) {
    const lps = await ctx.client.query<{
      id: string;
      status: string;
      qa_status: string;
      quantity: string;
    }>(
      `select id::text, status, qa_status, quantity::text
         from public.license_plates
        where org_id = app.current_org_id()
          and id = any($1::uuid[])
        order by lp_number`,
      [lpIds],
    );
    const found = new Set(lps.rows.map((lp) => lp.id));
    const missing = lpIds.filter((lpId) => !found.has(lpId));
    if (missing.length > 0) throw new Error(`license plate not found: ${missing.join(',')}`);

    for (const lp of lps.rows) {
      await ctx.client.query(
        `insert into public.quality_hold_items (
           org_id,
           hold_id,
           license_plate_id,
           qty_held_kg,
           item_status
         )
         values (app.current_org_id(), $1::uuid, $2::uuid, $3::numeric, 'held')
         on conflict (hold_id, license_plate_id) do nothing`,
        [created.id, lp.id, lp.quantity],
      );
    }

    const activeLpIds = lps.rows
      .filter((lp) => !TERMINAL_LP_STATUSES.includes(lp.status as (typeof TERMINAL_LP_STATUSES)[number]))
      .map((lp) => lp.id);
    if (activeLpIds.length > 0) {
      await ctx.client.query(
        `update public.license_plates
            set qa_status = 'on_hold',
                updated_by = $2::uuid
          where org_id = app.current_org_id()
            and id = any($1::uuid[])
            and status <> all($3::text[])`,
        [activeLpIds, ctx.userId, [...TERMINAL_LP_STATUSES]],
      );
    }
  }

  if (parsed.referenceType === 'wo') {
    const qaSnapshots = await applyWoOutputHoldForContext(
      { userId: ctx.userId, orgId: ctx.orgId, client: ctx.client },
      parsed.referenceId,
    );
    await ctx.client.query(
      `update public.quality_holds
          set ext_jsonb = ext_jsonb || jsonb_build_object('wo_output_qa_snapshots', $2::jsonb)
        where org_id = app.current_org_id()
          and id = $1::uuid`,
      [created.id, JSON.stringify(qaSnapshots)],
    );
  }

  await writeOutbox(ctx, {
    eventType: 'quality.hold.created',
    aggregateId: created.id,
    payload: {
      holdId: created.id,
      holdNumber: created.hold_number,
      referenceType: parsed.referenceType,
      referenceId: parsed.referenceId,
      lpIds,
    },
  });

  return {
    id: created.id,
    holdNumber: created.hold_number,
    referenceType: created.reference_type,
    referenceId: created.reference_id,
    status: created.hold_status,
    heldLpIds: lpIds,
  };
}

export async function createHoldForContext(
  ctx: QualityContext,
  input: {
    referenceType: ReferenceType;
    referenceId: string;
    reasonCodeId?: string;
    reasonText?: string;
    priority: HoldPriority;
    lpIds?: string[];
    estimatedReleaseAt?: string;
  },
): Promise<ActionResult<CreatedHold>> {
  try {
    const parsed = createSchema.parse(input);
    return { ok: true, data: await createHoldCore(ctx, parsed) };
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function listHolds(input: {
  status?: HoldStatusFilter;
  referenceType?: ReferenceType;
  search?: string;
  limit?: number;
} = {}): Promise<ActionResult<HoldListRow[]>> {
  try {
    const parsed = listSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<HoldListRow[]>> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapListRow>[0]>(
        `select
           h.id::text,
           h.hold_number,
           h.reference_type,
           h.reference_id::text,
           coalesce(
             case when h.reference_type = 'lp' then
               lp.lp_number || coalesce(' / ' || i.item_code, '')
             end,
             case when h.reference_type = 'wo' then wo.wo_number end,
             case when h.reference_type = 'grn' then grn.grn_number end,
             h.reference_text,
             h.reference_id::text
           ) as reference_display,
           h.reason_code_id::text,
           coalesce(
             rt.row_data->>'label',
             rt.row_data->>'name',
             rt.row_data->>'reason_label',
             rt.row_data->>'reason_code'
           ) as reason_label,
           h.reason_free_text,
           h.priority,
           h.hold_status,
           count(qhi.id)::int as item_count,
           h.created_at,
           h.estimated_release_at::text,
           h.released_at
         from public.quality_holds h
         left join public.quality_hold_items qhi on qhi.hold_id = h.id and qhi.org_id = h.org_id
         left join public.license_plates lp on h.reference_type = 'lp' and lp.id = h.reference_id and lp.org_id = h.org_id
         left join public.items i on i.id = lp.product_id and i.org_id = h.org_id
         left join public.work_orders wo on h.reference_type = 'wo' and wo.id = h.reference_id and wo.org_id = h.org_id
         left join public.grns grn on h.reference_type = 'grn' and grn.id = h.reference_id and grn.org_id = h.org_id
         left join public.reference_tables rt
           on rt.org_id = h.org_id
          and rt.table_code = 'reference.quality_hold_reasons'
          and rt.is_active
          and h.reason_code_id is not null
          and (
            rt.row_key = h.reason_code_id::text
            or rt.row_data->>'id' = h.reason_code_id::text
            or rt.row_data->>'reason_code_id' = h.reason_code_id::text
          )
        where h.org_id = app.current_org_id()
          and ($1::text = 'all'
            or ($1::text = 'active' and h.hold_status = any($5::text[]) and h.released_at is null)
            or ($1::text = 'released' and h.hold_status = 'released'))
          and ($2::text is null or h.reference_type = $2)
          and ($3::text is null or (
            h.hold_number ilike '%' || $3 || '%'
            or h.reference_id::text ilike '%' || $3 || '%'
            or h.reference_text ilike '%' || $3 || '%'
            or h.reason_free_text ilike '%' || $3 || '%'
            or lp.lp_number ilike '%' || $3 || '%'
            or wo.wo_number ilike '%' || $3 || '%'
            or grn.grn_number ilike '%' || $3 || '%'
          ))
        group by h.id, lp.lp_number, i.item_code, wo.wo_number, grn.grn_number, rt.row_data
        order by h.created_at desc
        limit $4::int`,
        [
          parsed.status ?? 'active',
          parsed.referenceType ?? null,
          parsed.search || null,
          parsed.limit ?? 100,
          [...ACTIVE_HOLD_STATUSES],
        ],
      );

      return { ok: true, data: rows.map(mapListRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getHoldDetail(holdId: string): Promise<ActionResult<HoldDetail | null>> {
  try {
    const parsedHoldId = uuidSchema.parse(holdId);
    return await withOrgContext(async (ctx): Promise<ActionResult<HoldDetail | null>> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const header = await ctx.client.query<
        Parameters<typeof mapListRow>[0] & {
          disposition: string | null;
          release_notes: string | null;
          release_signature_hash: string | null;
          released_by: string | null;
        }
      >(
        `select
           h.id::text,
           h.hold_number,
           h.reference_type,
           h.reference_id::text,
           coalesce(
             case when h.reference_type = 'lp' then lp.lp_number || coalesce(' / ' || i.item_code, '') end,
             case when h.reference_type = 'wo' then wo.wo_number end,
             case when h.reference_type = 'grn' then grn.grn_number end,
             h.reference_text,
             h.reference_id::text
           ) as reference_display,
           h.reason_code_id::text,
           coalesce(rt.row_data->>'label', rt.row_data->>'name', rt.row_data->>'reason_label', rt.row_data->>'reason_code') as reason_label,
           h.reason_free_text,
           h.priority,
           h.hold_status,
           (select count(*)::int from public.quality_hold_items qhi where qhi.hold_id = h.id and qhi.org_id = h.org_id) as item_count,
           h.created_at,
           h.estimated_release_at::text,
           h.released_at,
           h.disposition,
           h.release_notes,
           h.release_signature_hash,
           coalesce(releaser.display_name, releaser.name, releaser.email::text, h.released_by::text) as released_by
         from public.quality_holds h
         left join public.license_plates lp on h.reference_type = 'lp' and lp.id = h.reference_id and lp.org_id = h.org_id
         left join public.items i on i.id = lp.product_id and i.org_id = h.org_id
         left join public.work_orders wo on h.reference_type = 'wo' and wo.id = h.reference_id and wo.org_id = h.org_id
         left join public.grns grn on h.reference_type = 'grn' and grn.id = h.reference_id and grn.org_id = h.org_id
         left join public.users releaser on releaser.id = h.released_by and releaser.org_id = h.org_id
         left join public.reference_tables rt
           on rt.org_id = h.org_id
          and rt.table_code = 'reference.quality_hold_reasons'
          and rt.is_active
          and h.reason_code_id is not null
          and (
            rt.row_key = h.reason_code_id::text
            or rt.row_data->>'id' = h.reason_code_id::text
            or rt.row_data->>'reason_code_id' = h.reason_code_id::text
          )
        where h.org_id = app.current_org_id()
          and h.id = $1::uuid
        limit 1`,
        [parsedHoldId],
      );
      const row = header.rows[0];
      if (!row) return { ok: true, data: null };

      const [items, ncrs] = await Promise.all([
        ctx.client.query<{
          id: string;
          license_plate_id: string | null;
          lp_number: string | null;
          item_id: string | null;
          item_code: string | null;
          qty_held_kg: string | null;
          qty_released_kg: string | null;
          item_status: string;
        }>(
          `select
             qhi.id::text,
             qhi.license_plate_id::text,
             lp.lp_number,
             lp.product_id::text as item_id,
             i.item_code,
             qhi.qty_held_kg::text,
             qhi.qty_released_kg::text,
             qhi.item_status
           from public.quality_hold_items qhi
           left join public.license_plates lp on lp.id = qhi.license_plate_id and lp.org_id = qhi.org_id
           left join public.items i on i.id = lp.product_id and i.org_id = qhi.org_id
          where qhi.org_id = app.current_org_id()
            and qhi.hold_id = $1::uuid
          order by lp.lp_number nulls last, qhi.created_at`,
          [parsedHoldId],
        ),
        ctx.client.query<{
          id: string;
          ncr_number: string;
          title: string;
          severity: string;
          status: string;
        }>(
          `select id::text, ncr_number, title, severity, status
             from public.ncr_reports
            where org_id = app.current_org_id()
              and linked_hold_id = $1::uuid
            order by created_at desc`,
          [parsedHoldId],
        ),
      ]);

      return {
        ok: true,
        data: {
          ...mapListRow(row),
          disposition: row.disposition,
          releaseNotes: row.release_notes,
          releaseSignatureHash: row.release_signature_hash,
          releasedBy: row.released_by,
          items: items.rows.map((item) => ({
            id: item.id,
            licensePlateId: item.license_plate_id,
            lpNumber: item.lp_number,
            itemId: item.item_id,
            itemCode: item.item_code,
            qtyHeldKg: item.qty_held_kg,
            qtyReleasedKg: item.qty_released_kg,
            status: item.item_status,
          })),
          ncrs: ncrs.rows.map((ncr) => ({
            id: ncr.id,
            ncrNumber: ncr.ncr_number,
            title: ncr.title,
            severity: ncr.severity,
            status: ncr.status,
          })),
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createHold(input: {
  referenceType: ReferenceType;
  referenceId: string;
  reasonCodeId?: string;
  reasonText?: string;
  priority: HoldPriority;
  lpIds?: string[];
  estimatedReleaseAt?: string;
}): Promise<ActionResult<CreatedHold>> {
  try {
    const parsed = createSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CreatedHold>> => {
      if (!(await hasPermission(ctx, 'quality.hold.create'))) return { ok: false, reason: 'forbidden' };
      return { ok: true, data: await createHoldCore(ctx, parsed) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

type HoldForRelease = {
  id: string;
  hold_number: string;
  reference_type: ReferenceType;
  reference_id: string;
  hold_status: string;
  released_at: Date | string | null;
};

type ReleaseHoldCoreInput = {
  holdId: string;
  disposition: ReleaseDisposition;
  reasonText: string;
};

export async function releaseHoldCore(
  ctx: QualityContext,
  input: ReleaseHoldCoreInput,
  options: {
    releaseSource: string;
    expectedReference?: { type: ReferenceType; id: string };
    getSignatureHash: (current: HoldForRelease) => Promise<string>;
  },
): Promise<ActionResult<ReleasedHold>> {
  const hold = await ctx.client.query<HoldForRelease>(
    `select id::text, hold_number, reference_type, reference_id::text, hold_status, released_at
       from public.quality_holds
      where org_id = app.current_org_id()
        and id = $1::uuid
      for update`,
    [input.holdId],
  );
  const current = hold.rows[0];
  if (!current) throw new Error('quality hold not found');
  if (current.hold_status === 'released' || current.released_at !== null) {
    throw new Error('quality hold is already released');
  }
  if (
    options.expectedReference &&
    (current.reference_type !== options.expectedReference.type || current.reference_id !== options.expectedReference.id)
  ) {
    throw new Error('quality hold does not match license plate');
  }

  const signatureHash = await options.getSignatureHash(current);

  const dbDisposition =
    input.disposition === 'release'
      ? 'release_as_is'
      : input.disposition === 'scrap'
        ? 'scrap'
        : input.disposition === 'rework'
          ? 'rework'
          : 'other';
  const itemStatus = input.disposition === 'scrap' ? 'scrapped' : input.disposition === 'partial' ? 'partial_released' : 'released';
  const lpQaStatus = input.disposition === 'scrap' ? 'rejected' : 'released';

  const updated = await ctx.client.query<{ released_at: Date | string }>(
    `update public.quality_holds
        set hold_status = 'released',
            released_by = $2::uuid,
            released_at = pg_catalog.now(),
            disposition = $3,
            release_notes = $4,
            release_signature_hash = $5
      where org_id = app.current_org_id()
        and id = $1::uuid
        and hold_status <> 'released'
        and released_at is null
      returning released_at`,
    [input.holdId, ctx.userId, dbDisposition, input.reasonText, signatureHash],
  );
  const releasedAt = updated.rows[0]?.released_at;
  if (!releasedAt) throw new Error('quality hold release update did not return a row');

  await ctx.client.query(
    `update public.quality_hold_items
        set item_status = $2,
            qty_released_kg = case when $2 = 'released' then qty_held_kg else qty_released_kg end
      where org_id = app.current_org_id()
        and hold_id = $1::uuid`,
    [input.holdId, itemStatus],
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
    [input.holdId],
  );

  if (heldLps.rows.length > 0) {
    let restoreReleasedLpIds = heldLps.rows.map((lp) => lp.id);
    const blockedByOtherHold = new Set<string>();
    const restoresReleasedQaStatus = lpQaStatus === 'released';

    if (restoresReleasedQaStatus) {
      for (const lpId of restoreReleasedLpIds) {
        try {
          await assertNoActiveHoldForLp(lpId, ctx.client);
        } catch (error) {
          if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'QA_HOLD_ACTIVE') {
            blockedByOtherHold.add(lpId);
            continue;
          }
          throw error;
        }
      }
      restoreReleasedLpIds = restoreReleasedLpIds.filter((lpId) => !blockedByOtherHold.has(lpId));
    }

    const lpUpdateIds = restoresReleasedQaStatus ? restoreReleasedLpIds : heldLps.rows.map((lp) => lp.id);
    if (lpUpdateIds.length > 0) {
      await ctx.client.query(
        `update public.license_plates
            set qa_status = $2,
                status = case
                  when $5::boolean and status = 'blocked' then 'available'
                  else status
                end,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = any($1::uuid[])
            and status <> all($4::text[])`,
        [
          lpUpdateIds,
          lpQaStatus,
          ctx.userId,
          [...TERMINAL_LP_STATUSES],
          input.disposition === 'release',
        ],
      );
    }

    for (const lp of heldLps.rows.filter((row) => !TERMINAL_LP_STATUSES.includes(row.status as (typeof TERMINAL_LP_STATUSES)[number]))) {
      const restoresQaStatus = !blockedByOtherHold.has(lp.id);
      const restoresBlockedStatus = input.disposition === 'release' && restoresQaStatus && lp.status === 'blocked';
      const toState = restoresBlockedStatus ? 'available' : lp.status;
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
           $5,
           $6,
           $7::uuid,
           $8::uuid,
           $9::uuid,
           $10::jsonb
         )`,
        [
          lp.id,
          lp.site_id,
          lp.status,
          toState,
          restoresBlockedStatus ? 'status_change' : 'quality_hold_release',
          input.reasonText,
          lp.wo_id,
          lp.grn_id,
          ctx.userId,
          JSON.stringify({
            action: restoresBlockedStatus ? 'status_change' : 'qa_status_change',
            holdId: input.holdId,
            disposition: input.disposition,
            qaStatusFrom: lp.qa_status,
            qaStatusTo: restoresQaStatus ? lpQaStatus : lp.qa_status,
            releaseSource: options.releaseSource,
            statusFrom: lp.status,
            statusTo: toState,
          }),
        ],
      );
    }
  }

  if (current.reference_type === 'wo' && input.disposition === 'release') {
    await ctx.client.query(
      `select pg_advisory_xact_lock(
         hashtext(app.current_org_id()::text || ':wo-hold-release:' || $1::text)
       )`,
      [current.reference_id],
    );

    const otherOpenHold = await ctx.client.query<{ hold_id: string }>(
      `select hold_id
         from public.v_active_holds
        where org_id = app.current_org_id()
          and reference_type = 'wo'
          and reference_id = $1::uuid
          and hold_id <> $2::uuid
        limit 1`,
      [current.reference_id, input.holdId],
    );

    if (otherOpenHold.rows.length === 0) {
      const snapshots = await ctx.client.query<{ snapshots: Record<string, string> | null }>(
        `select ext_jsonb -> 'wo_output_qa_snapshots' as snapshots
           from public.quality_holds
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.holdId],
      );
      const qaSnapshots = snapshots.rows[0]?.snapshots ?? {};
      await restoreWoOutputsAfterWoHoldReleaseForContext(
        { userId: ctx.userId, orgId: ctx.orgId, client: ctx.client },
        { woId: current.reference_id, snapshots: qaSnapshots },
      );
    }
  }

  await writeOutbox(ctx, {
    eventType: 'quality.hold.released',
    aggregateId: input.holdId,
    payload: {
      holdId: input.holdId,
      holdNumber: current.hold_number,
      disposition: input.disposition,
      signatureHash,
      releaseSource: options.releaseSource,
    },
  });

  return {
    ok: true,
    data: {
      id: input.holdId,
      holdNumber: current.hold_number,
      status: 'released',
      disposition: input.disposition,
      releasedAt: toIso(releasedAt) ?? '',
      signatureHash,
    },
  };
}

export async function releaseHold(input: {
  holdId: string;
  disposition: ReleaseDisposition;
  reasonText: string;
  signature: { password: string };
}): Promise<ActionResult<ReleasedHold>> {
  try {
    const parsed = releaseSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<ReleasedHold>> => {
      if (!(await hasPermission(ctx, 'quality.hold.release'))) return { ok: false, reason: 'forbidden' };

      return releaseHoldCore(ctx, parsed, {
        releaseSource: 'quality_hold_release',
        getSignatureHash: async () => {
          const receipt = await signEvent(
            {
              signerUserId: ctx.userId,
              pin: parsed.signature.password,
              intent: 'qa.hold.release',
              subject: { holdId: parsed.holdId, disposition: parsed.disposition },
              reason: parsed.reasonText,
            },
            { client: ctx.client as unknown as pg.PoolClient },
          );
          return receipt.subjectHash;
        },
      });
    });
  } catch (err) {
    return actionError(err);
  }
}

export async function releaseHoldFromWarehouseLpUnblock(input: {
  lpId: string;
  reasonText: string;
  // Required, MIRRORING warehouseLpUnblockReleaseSchema (P0-B3): the warehouse
  // LP-unblock path now demands a real 21-CFR-Part-11 e-sign. Keeping this
  // non-optional makes tsc reject any stale caller that forgets the password,
  // instead of failing with a runtime ZodError.
  signature: { password: string };
}): Promise<ActionResult<ReleasedHold>> {
  try {
    const parsed = warehouseLpUnblockReleaseSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<ReleasedHold>> => {
      if (!(await hasPermission(ctx, 'quality.hold.release'))) return { ok: false, reason: 'forbidden' };

      const lp = await ctx.client.query<{ id: string; status: string; qa_status: string }>(
        `select id::text, status, qa_status
           from public.license_plates
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.lpId],
      );
      const currentLp = lp.rows[0];
      if (!currentLp) return { ok: false, reason: 'error', message: 'license plate not found' };
      if (currentLp.status !== 'blocked' || currentLp.qa_status !== 'on_hold') {
        return { ok: false, reason: 'error', message: 'invalid_state' };
      }

      const hold = await ctx.client.query<{ id: string }>(
        `select id::text
           from public.quality_holds
          where org_id = app.current_org_id()
            and reference_type = 'lp'
            and reference_id = $1::uuid
            and hold_status = any($2::text[])
            and released_at is null
          order by created_at desc
          limit 1
          for update`,
        [parsed.lpId, [...ACTIVE_HOLD_STATUSES]],
      );
      const activeHold = hold.rows[0];
      if (!activeHold) return { ok: false, reason: 'error', message: 'no_open_hold' };

      return releaseHoldCore(ctx, { holdId: activeHold.id, disposition: 'release', reasonText: parsed.reasonText }, {
        releaseSource: 'warehouse_lp_unblock',
        expectedReference: { type: 'lp', id: parsed.lpId },
        getSignatureHash: async () => {
          const receipt = await signEvent(
            {
              signerUserId: ctx.userId,
              pin: parsed.signature.password,
              intent: 'qa.hold.release',
              subject: { holdId: activeHold.id, disposition: 'release' },
              reason: parsed.reasonText,
            },
            { client: ctx.client as unknown as pg.PoolClient },
          );
          return receipt.subjectHash;
        },
      });
    });
  } catch (err) {
    return actionError(err);
  }
}
