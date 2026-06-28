'use server';

import type pg from 'pg';
import { revalidatePath } from 'next/cache';
import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import { getActiveSiteId } from '../../../../../../lib/site/site-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };
type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;
type ReferenceType = 'lp' | 'grn' | 'wo_output';
type InspectionStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'on_hold' | 'cancelled';
type Decision = 'pass' | 'fail' | 'hold';
type InspectionParameter = { name: string; expected?: string; actual: string; pass: boolean };

type InspectionListRow = {
  id: string;
  inspectionNumber: string;
  referenceType: ReferenceType;
  referenceId: string;
  referenceDisplay: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  status: InspectionStatus;
  assignedTo: { id: string; email: string | null; name: string | null } | null;
  dueDate: string | null;
  createdAt: string;
};

type InspectionDetail = InspectionListRow & {
  parameters: InspectionParameter[];
  resultNotes: string | null;
  decidedBy: { id: string; email: string | null; name: string | null } | null;
  decidedAt: string | null;
  signatureHash: string | null;
  createdBy: { id: string; email: string | null; name: string | null } | null;
  updatedAt: string;
  /**
   * The active quality hold for this inspection's LP, when a `hold` decision (or a
   * fail side-effect) created/keeps one open. There is no FK column linking the
   * inspection to the hold (migration 272), so this is resolved as the latest
   * active hold for the same reference_type='lp' + reference_id. Drives the
   * detail "View hold" deep link (/quality/holds/<holdId>); null → link to the
   * holds list.
   */
  holdId: string | null;
};

type CreatedInspection = {
  id: string;
  inspectionNumber: string;
  referenceType: ReferenceType;
  referenceId: string;
  status: 'pending';
};

type RecordedInspection = {
  id: string;
  status: 'in_progress';
  parameters: InspectionParameter[];
  notes: string | null;
};

type SubmittedInspection = {
  id: string;
  inspectionNumber: string;
  status: 'passed' | 'failed' | 'on_hold';
  qaStatus: 'released' | 'rejected' | 'on_hold' | null;
  signatureHash: string;
};

const TERMINAL_LP_STATUSES = ['consumed', 'merged', 'shipped', 'returned'] as const;

/** Searchable LP result for the create-inspection reference picker (lp). */
type LpReferenceResult = {
  id: string;
  lpNumber: string;
  itemCode: string | null;
  qty: string;
  uom: string;
  status: string;
};
/** Resolved grn / wo_output reference (number → uuid). */
type ReferenceResolveResult = { id: string; display: string };
/** Searchable org user for the assignee picker. */
type AssigneeResult = { id: string; name: string | null; email: string | null };

const searchTermSchema = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

const uuidSchema = z.string().uuid();
const listSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'passed', 'failed', 'on_hold', 'cancelled']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  referenceType: z.enum(['lp', 'grn', 'wo_output']),
  referenceId: uuidSchema,
  productId: uuidSchema.optional(),
  assignedTo: uuidSchema.optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const parameterSchema = z.object({
  name: z.string().trim().min(1).max(160),
  expected: z.string().trim().max(500).optional(),
  actual: z.string().trim().min(1).max(500),
  pass: z.boolean(),
});

const recordSchema = z.object({
  inspectionId: uuidSchema,
  parameters: z.array(parameterSchema).min(1).max(200),
  notes: z.string().trim().max(4000).optional(),
});

const decisionSchema = z.object({
  inspectionId: uuidSchema,
  decision: z.enum(['pass', 'fail', 'hold']),
  signature: z.object({ password: z.string().min(1) }),
  note: z.string().trim().max(4000).optional(),
});

async function hasPermission(ctx: QualityContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function parseParameters(value: unknown): InspectionParameter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is InspectionParameter => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.name === 'string' && typeof candidate.actual === 'string' && typeof candidate.pass === 'boolean';
    })
    .map((item) => ({
      name: item.name,
      expected: item.expected,
      actual: item.actual,
      pass: item.pass,
    }));
}

function mapListRow(row: {
  id: string;
  inspection_number: string;
  reference_type: ReferenceType;
  reference_id: string;
  reference_display: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  status: InspectionStatus;
  assigned_to: string | null;
  assigned_email: string | null;
  assigned_name: string | null;
  due_date: string | null;
  created_at: Date | string;
}): InspectionListRow {
  return {
    id: row.id,
    inspectionNumber: row.inspection_number,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    referenceDisplay: row.reference_display ?? row.reference_id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    status: row.status,
    assignedTo: row.assigned_to
      ? { id: row.assigned_to, email: row.assigned_email, name: row.assigned_name }
      : null,
    dueDate: row.due_date,
    createdAt: toIso(row.created_at) ?? '',
  };
}

function mapDetailRow(row: Parameters<typeof mapListRow>[0] & {
  parameters: unknown;
  result_notes: string | null;
  decided_by: string | null;
  decided_email: string | null;
  decided_name: string | null;
  decided_at: Date | string | null;
  signature_hash: string | null;
  created_by: string | null;
  created_email: string | null;
  created_name: string | null;
  updated_at: Date | string;
  hold_id: string | null;
}): InspectionDetail {
  return {
    ...mapListRow(row),
    parameters: parseParameters(row.parameters),
    resultNotes: row.result_notes,
    decidedBy: row.decided_by ? { id: row.decided_by, email: row.decided_email, name: row.decided_name } : null,
    decidedAt: toIso(row.decided_at),
    signatureHash: row.signature_hash,
    createdBy: row.created_by ? { id: row.created_by, email: row.created_email, name: row.created_name } : null,
    updatedAt: toIso(row.updated_at) ?? '',
    holdId: row.hold_id,
  };
}

/**
 * Emits the canonical `quality.hold.created` outbox event (same event_type +
 * aggregate_type + app_version + payload shape as hold-actions.ts::createHold's
 * writeOutbox). The inline hold created on an inspection `hold` decision MUST be
 * visible to outbox consumers / audit just like a manually-created hold; the only
 * difference is provenance, captured here in the payload. Stays inside the same
 * withOrgContext transaction as the hold insert (atomic with the decision).
 */
async function writeHoldCreatedOutbox(
  ctx: QualityContext,
  params: { holdId: string; holdNumber: string; lpId: string },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), 'quality.hold.created', 'quality_hold', $1::uuid, $2::jsonb, 'quality-holds-v1')`,
    [
      params.holdId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        holdId: params.holdId,
        holdNumber: params.holdNumber,
        referenceType: 'lp',
        referenceId: params.lpId,
        lpIds: [params.lpId],
        source: 'inspection_decision',
      }),
    ],
  );
}

async function createLpHold(
  ctx: QualityContext,
  params: { lpId: string; note: string | null },
): Promise<void> {
  const hold = await ctx.client.query<{ id: string; hold_number: string }>(
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
    [params.lpId, params.note ?? 'inspection hold', ctx.userId],
  );
  const createdHold = hold.rows[0];
  if (!createdHold?.id) throw new Error('quality hold insert did not return a row');

  const lp = await ctx.client.query<{ id: string; quantity: string }>(
    `select id::text, quantity::text
       from public.license_plates
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [params.lpId],
  );
  const current = lp.rows[0];
  if (!current) throw new Error('license plate not found');

  await ctx.client.query(
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

  await writeHoldCreatedOutbox(ctx, {
    holdId: createdHold.id,
    holdNumber: createdHold.hold_number,
    lpId: params.lpId,
  });
}

async function applyLpDecisionSideEffects(
  ctx: QualityContext,
  params: { referenceType: ReferenceType; referenceId: string; decision: Decision; note: string | null },
): Promise<'released' | 'rejected' | 'on_hold' | null> {
  if (params.referenceType !== 'lp') return null;

  const qaStatus = params.decision === 'pass' ? 'released' : params.decision === 'fail' ? 'rejected' : 'on_hold';
  const updated = await ctx.client.query<{ id: string }>(
    `update public.license_plates
        set qa_status = $2,
            updated_by = $3::uuid
      where org_id = app.current_org_id()
        and id = $1::uuid
        and status <> all($4::text[])
      returning id::text`,
    [params.referenceId, qaStatus, ctx.userId, [...TERMINAL_LP_STATUSES]],
  );
  if (!updated.rows[0]) throw new Error('license plate not found');
  if (params.decision === 'hold') await createLpHold(ctx, { lpId: params.referenceId, note: params.note });
  return qaStatus;
}

async function fetchInspectionDetail(ctx: QualityContext, inspectionId: string): Promise<InspectionDetail | null> {
  const { rows } = await ctx.client.query<Parameters<typeof mapDetailRow>[0]>(
    `select
       qi.id::text,
       qi.inspection_number,
       qi.reference_type,
       qi.reference_id::text,
       coalesce(
         case when qi.reference_type = 'lp' then lp.lp_number end,
         case when qi.reference_type = 'grn' then grn.grn_number end,
         case when qi.reference_type = 'wo_output' then wo.wo_number || coalesce(' / ' || woo.batch_number, '') end,
         qi.reference_id::text
       ) as reference_display,
       coalesce(qi.product_id, lp.product_id, woo.product_id)::text as product_id,
       i.item_code as product_code,
       i.name as product_name,
       qi.status,
       qi.assigned_to::text,
       assigned.email::text as assigned_email,
       assigned.display_name as assigned_name,
       qi.due_date::text,
       qi.created_at,
       qi.parameters,
       qi.result_notes,
       qi.decided_by::text,
       decided.email::text as decided_email,
       decided.display_name as decided_name,
       qi.decided_at,
       qi.signature_hash,
       qi.created_by::text,
       creator.email::text as created_email,
       creator.display_name as created_name,
       qi.updated_at,
       hold.id::text as hold_id
     from public.quality_inspections qi
     left join public.license_plates lp on qi.reference_type = 'lp' and lp.id = qi.reference_id and lp.org_id = qi.org_id
     left join public.grns grn on qi.reference_type = 'grn' and grn.id = qi.reference_id and grn.org_id = qi.org_id
     left join public.wo_outputs woo on qi.reference_type = 'wo_output' and woo.id = qi.reference_id and woo.org_id = qi.org_id
     left join public.work_orders wo on wo.id = woo.wo_id and wo.org_id = qi.org_id
     left join public.items i on i.id = coalesce(qi.product_id, lp.product_id, woo.product_id) and i.org_id = qi.org_id
     left join public.users assigned on assigned.id = qi.assigned_to and assigned.org_id = qi.org_id
     left join public.users decided on decided.id = qi.decided_by and decided.org_id = qi.org_id
     left join public.users creator on creator.id = qi.created_by and creator.org_id = qi.org_id
     -- Latest ACTIVE hold for this inspection's LP. No FK links inspection→hold
     -- (migration 272), and submitInspectionDecision creates the hold via
     -- createLpHold against reference_type='lp' + reference_id, so we deep-link to
     -- the most recent still-active hold for the same LP.
     left join lateral (
       select qh.id
         from public.quality_holds qh
        where qh.org_id = qi.org_id
          and qi.reference_type = 'lp'
          and qh.reference_type = 'lp'
          and qh.reference_id = qi.reference_id
          -- Canonical "active hold" definition (migration 197 v_active_holds):
          -- non-terminal hold_status AND released_at IS NULL (review fix F6).
          and qh.hold_status in ('open', 'investigating', 'escalated', 'quarantined')
          and qh.released_at is null
        order by qh.created_at desc
        limit 1
     ) hold on true
    where qi.org_id = app.current_org_id()
      and qi.id = $1::uuid
    limit 1`,
    [inspectionId],
  );
  return rows[0] ? mapDetailRow(rows[0]) : null;
}

export async function listInspections(input: {
  status?: string;
  search?: string;
  limit?: number;
} = {}): Promise<ActionResult<InspectionListRow[]>> {
  try {
    const parsed = listSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<InspectionListRow[]>> => {
      const s = await getActiveSiteId({ client: ctx.client });
      if (!s) {
        return { ok: true, data: [], noActiveSite: true } as ActionResult<InspectionListRow[]> & { noActiveSite: true };
      }

      if (!(await hasPermission(ctx, 'quality.inspection.execute'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapListRow>[0]>(
        `select
           qi.id::text,
           qi.inspection_number,
           qi.reference_type,
           qi.reference_id::text,
           coalesce(
             case when qi.reference_type = 'lp' then lp.lp_number end,
             case when qi.reference_type = 'grn' then grn.grn_number end,
             case when qi.reference_type = 'wo_output' then wo.wo_number || coalesce(' / ' || woo.batch_number, '') end,
             qi.reference_id::text
           ) as reference_display,
           coalesce(qi.product_id, lp.product_id, woo.product_id)::text as product_id,
           i.item_code as product_code,
           i.name as product_name,
           qi.status,
           qi.assigned_to::text,
           assigned.email::text as assigned_email,
           assigned.display_name as assigned_name,
           qi.due_date::text,
           qi.created_at
         from public.quality_inspections qi
         left join public.license_plates lp on qi.reference_type = 'lp' and lp.id = qi.reference_id and lp.org_id = qi.org_id
         left join public.grns grn on qi.reference_type = 'grn' and grn.id = qi.reference_id and grn.org_id = qi.org_id
         left join public.wo_outputs woo on qi.reference_type = 'wo_output' and woo.id = qi.reference_id and woo.org_id = qi.org_id
         left join public.work_orders wo on wo.id = woo.wo_id and wo.org_id = qi.org_id
         left join public.items i on i.id = coalesce(qi.product_id, lp.product_id, woo.product_id) and i.org_id = qi.org_id
         left join public.users assigned on assigned.id = qi.assigned_to and assigned.org_id = qi.org_id
        where qi.org_id = app.current_org_id()
          and qi.site_id = $4::uuid
          and ($1::text is null or qi.status = $1)
          and (
            $2::text is null
            or qi.inspection_number ilike '%' || $2 || '%'
            or lp.lp_number ilike '%' || $2 || '%'
            or grn.grn_number ilike '%' || $2 || '%'
            or wo.wo_number ilike '%' || $2 || '%'
            or i.item_code ilike '%' || $2 || '%'
          )
        order by qi.created_at desc
        limit $3::int`,
        [parsed.status ?? null, parsed.search ?? null, parsed.limit ?? 100, s],
      );
      return { ok: true, data: rows.map(mapListRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getInspectionDetail(inspectionId: string): Promise<ActionResult<InspectionDetail | null>> {
  try {
    const parsedInspectionId = uuidSchema.parse(inspectionId);
    return await withOrgContext(async (ctx): Promise<ActionResult<InspectionDetail | null>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.execute'))) return { ok: false, reason: 'forbidden' };
      return { ok: true, data: await fetchInspectionDetail(ctx, parsedInspectionId) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reference picker — LP autocomplete for the create-inspection modal (referenceType
 * 'lp'). Mirrors the holds create-modal LP search (lookup-actions.searchLps): org-
 * scoped, matches LP number OR item code, ordered by number, capped. Gated on
 * quality.inspection.assign (the create grant) — the operator who can create an
 * inspection can search references for it.
 */
export async function searchInspectionLps(input: {
  query: string;
  limit?: number;
}): Promise<ActionResult<LpReferenceResult[]>> {
  try {
    const parsed = searchTermSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<LpReferenceResult[]>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.assign'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{
        id: string;
        lp_number: string;
        item_code: string | null;
        quantity: string;
        uom: string;
        status: string;
      }>(
        `select lp.id::text,
                lp.lp_number,
                i.item_code,
                lp.quantity::text,
                lp.uom,
                lp.status
           from public.license_plates lp
           left join public.items i on i.id = lp.product_id and i.org_id = lp.org_id
          where lp.org_id = app.current_org_id()
            and (lp.lp_number ilike '%' || $1 || '%' or i.item_code ilike '%' || $1 || '%')
          order by lp.lp_number
          limit $2::int`,
        [parsed.query, parsed.limit ?? 10],
      );
      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          lpNumber: r.lp_number,
          itemCode: r.item_code,
          qty: String(r.quantity),
          uom: r.uom,
          status: r.status,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reference resolver — GRN number → uuid (referenceType 'grn'). Exact, case-
 * insensitive, org-scoped; null when nothing/ambiguous so the modal surfaces an
 * inline "could not resolve" error and submits nothing.
 */
export async function resolveInspectionGrn(input: {
  grnNumber: string;
}): Promise<ActionResult<ReferenceResolveResult | null>> {
  try {
    const grnNumber = z.string().trim().min(1).max(120).parse(input.grnNumber);
    return await withOrgContext(async (ctx): Promise<ActionResult<ReferenceResolveResult | null>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.assign'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; grn_number: string }>(
        `select id::text, grn_number
           from public.grns
          where org_id = app.current_org_id()
            and lower(grn_number) = lower($1)
          limit 2`,
        [grnNumber],
      );
      if (rows.length !== 1) return { ok: true, data: null };
      return { ok: true, data: { id: rows[0].id, display: rows[0].grn_number } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reference resolver — WO output BATCH number → uuid (referenceType 'wo_output').
 * wo_outputs.batch_number is the human-typed key (migration 181, unique per org per
 * year); exact case-insensitive match, org-scoped. null when nothing/ambiguous.
 * Display is "<wo_number> / <batch_number>" to mirror the list reference_display.
 */
export async function resolveInspectionWoOutput(input: {
  batchNumber: string;
}): Promise<ActionResult<ReferenceResolveResult | null>> {
  try {
    const batchNumber = z.string().trim().min(1).max(120).parse(input.batchNumber);
    return await withOrgContext(async (ctx): Promise<ActionResult<ReferenceResolveResult | null>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.assign'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; batch_number: string; wo_number: string | null }>(
        `select woo.id::text, woo.batch_number, wo.wo_number
           from public.wo_outputs woo
           left join public.work_orders wo on wo.id = woo.wo_id and wo.org_id = woo.org_id
          where woo.org_id = app.current_org_id()
            and lower(woo.batch_number) = lower($1)
          limit 2`,
        [batchNumber],
      );
      if (rows.length !== 1) return { ok: true, data: null };
      const row = rows[0];
      const display = row.wo_number ? `${row.wo_number} / ${row.batch_number}` : row.batch_number;
      return { ok: true, data: { id: row.id, display } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Assignee picker — org-user autocomplete for the create-inspection modal. Matches
 * users whose name OR email ilike-matches the query (mirrors the settings users
 * loader query against public.users). Returns the UUID the createInspection schema
 * requires (assignedTo is a uuid FK to public.users). Gated on
 * quality.inspection.assign.
 */
export async function searchInspectionAssignees(input: {
  query: string;
  limit?: number;
}): Promise<ActionResult<AssigneeResult[]>> {
  try {
    const parsed = searchTermSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<AssigneeResult[]>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.assign'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<{ id: string; name: string | null; email: string | null }>(
        `select u.id::text,
                u.name,
                u.email::text as email
           from public.users u
          where u.org_id = app.current_org_id()
            and u.is_active is not false
            and (u.name ilike '%' || $1 || '%' or u.email::text ilike '%' || $1 || '%')
          order by u.name asc, u.email asc
          limit $2::int`,
        [parsed.query, parsed.limit ?? 10],
      );
      return {
        ok: true,
        data: rows.map((r) => ({ id: r.id, name: r.name, email: r.email })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createInspection(input: {
  referenceType: 'lp' | 'grn' | 'wo_output';
  referenceId: string;
  productId?: string;
  assignedTo?: string;
  dueDate?: string;
  notes?: string;
}): Promise<ActionResult<CreatedInspection>> {
  try {
    const parsed = createSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CreatedInspection>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.assign'))) return { ok: false, reason: 'forbidden' };

      const s = await getActiveSiteId({ client: ctx.client });

      const inserted = await ctx.client.query<{
        id: string;
        inspection_number: string;
        reference_type: ReferenceType;
        reference_id: string;
        status: 'pending';
      }>(
        `insert into public.quality_inspections (
           org_id,
           site_id,
           inspection_number,
           reference_type,
           reference_id,
           product_id,
           status,
           assigned_to,
           due_date,
           result_notes,
           created_by
         )
         values (
           app.current_org_id(),
           $8::uuid,
           public.next_quality_inspection_number(app.current_org_id()),
           $1,
           $2::uuid,
           $3::uuid,
           'pending',
           $4::uuid,
           $5::date,
           $6,
           $7::uuid
         )
         returning id::text, inspection_number, reference_type, reference_id::text, status`,
        [
          parsed.referenceType,
          parsed.referenceId,
          parsed.productId ?? null,
          parsed.assignedTo ?? null,
          parsed.dueDate ?? null,
          parsed.notes ?? null,
          ctx.userId,
          s,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error('quality inspection insert did not return a row');
      revalidatePath('/quality');
      return {
        ok: true,
        data: {
          id: row.id,
          inspectionNumber: row.inspection_number,
          referenceType: row.reference_type,
          referenceId: row.reference_id,
          status: row.status,
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function recordInspectionResult(input: {
  inspectionId: string;
  parameters: Array<{ name: string; expected?: string; actual: string; pass: boolean }>;
  notes?: string;
}): Promise<ActionResult<RecordedInspection>> {
  try {
    const parsed = recordSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<RecordedInspection>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.execute'))) return { ok: false, reason: 'forbidden' };

      const updated = await ctx.client.query<{ id: string; status: 'in_progress'; parameters: unknown; result_notes: string | null }>(
        `update public.quality_inspections
            set status = 'in_progress',
                parameters = $2::jsonb,
                result_notes = $3
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status in ('pending', 'in_progress')
          returning id::text, status, parameters, result_notes`,
        [parsed.inspectionId, JSON.stringify(parsed.parameters), parsed.notes ?? null],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('quality inspection not found or not editable');
      revalidatePath('/quality');
      return {
        ok: true,
        data: {
          id: row.id,
          status: row.status,
          parameters: parseParameters(row.parameters),
          notes: row.result_notes,
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function submitInspectionDecision(input: {
  inspectionId: string;
  decision: 'pass' | 'fail' | 'hold';
  signature: { password: string };
  note?: string;
}): Promise<ActionResult<SubmittedInspection>> {
  try {
    const parsed = decisionSchema.parse(input);
    // ATOMICITY INVARIANT (review fix F7): withOrgContext (lib/auth/with-org-context.ts)
    // opens an app-role transaction (BEGIN → app.set_org_context → callback →
    // COMMIT, ROLLBACK on throw), so the status update + LP qa_status side
    // effect + hold insert below are all-or-nothing without an explicit
    // transaction here. Do not move these mutations out of this callback.
    return await withOrgContext(async (ctx): Promise<ActionResult<SubmittedInspection>> => {
      if (!(await hasPermission(ctx, 'quality.inspection.execute'))) return { ok: false, reason: 'forbidden' };

      const currentResult = await ctx.client.query<{
        id: string;
        inspection_number: string;
        reference_type: ReferenceType;
        reference_id: string;
        status: InspectionStatus;
      }>(
        `select id::text, inspection_number, reference_type, reference_id::text, status
           from public.quality_inspections
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.inspectionId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new Error('quality inspection not found');
      if (['passed', 'failed', 'on_hold', 'cancelled'].includes(current.status)) {
        throw new Error('quality inspection decision is already final');
      }

      const nextStatus = parsed.decision === 'pass' ? 'passed' : parsed.decision === 'fail' ? 'failed' : 'on_hold';
      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'qa.inspection.submit',
          subject: {
            inspectionId: current.id,
            inspectionNumber: current.inspection_number,
            decision: parsed.decision,
          },
          reason: parsed.note ?? `quality inspection ${parsed.decision}`,
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

      const updated = await ctx.client.query<{ id: string; inspection_number: string; status: 'passed' | 'failed' | 'on_hold' }>(
        `update public.quality_inspections
            set status = $2,
                result_notes = coalesce($3, result_notes),
                decided_by = $4::uuid,
                decided_at = pg_catalog.now(),
                signature_hash = $5
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id::text, inspection_number, status`,
        [parsed.inspectionId, nextStatus, parsed.note ?? null, ctx.userId, receipt.subjectHash],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('quality inspection decision update did not return a row');

      const qaStatus = await applyLpDecisionSideEffects(ctx, {
        referenceType: current.reference_type,
        referenceId: current.reference_id,
        decision: parsed.decision,
        note: parsed.note ?? null,
      });

      revalidatePath('/quality');
      return {
        ok: true,
        data: {
          id: row.id,
          inspectionNumber: row.inspection_number,
          status: row.status,
          qaStatus,
          signatureHash: receipt.subjectHash,
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
