'use server';

import type pg from 'pg';
import { signEvent } from '@monopilot/e-sign';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type QualityContext = { userId: string; orgId: string; client: QueryClient };
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type ComplaintSeverity = 'low' | 'medium' | 'high' | 'critical';
type ComplaintStatus = 'open' | 'investigating' | 'converted' | 'closed';
type CapaSourceType = 'complaint' | 'ncr';
type CapaActionType = 'corrective' | 'preventive';
type CapaStatus = 'open' | 'in_progress' | 'closed';
type NcrSeverity = 'critical' | 'major' | 'minor';

type ComplaintRow = {
  id: string;
  complaintNumber: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  customerDisplay: string | null;
  lpId: string | null;
  lpCode: string | null;
  batchRef: string | null;
  batchDisplay: string | null;
  description: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  ncrId: string | null;
  openedBy: string | null;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CapaActionRow = {
  id: string;
  sourceType: CapaSourceType;
  sourceId: string;
  actionType: CapaActionType;
  description: string;
  ownerUserId: string | null;
  dueDate: string | null;
  status: CapaStatus;
  closedBy: string | null;
  closedAt: string | null;
  esignRef: string | null;
  createdAt: string;
  updatedAt: string;
};

type ComplaintDbRow = {
  id: string;
  complaint_number: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_display: string | null;
  lp_id: string | null;
  lp_code: string | null;
  batch_ref: string | null;
  batch_display: string | null;
  description: string;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  ncr_id: string | null;
  opened_by: string | null;
  opened_at: Date | string;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CapaActionDbRow = {
  id: string;
  source_type: CapaSourceType;
  source_id: string;
  action_type: CapaActionType;
  description: string;
  owner_user_id: string | null;
  due_date: Date | string | null;
  status: CapaStatus;
  closed_by: string | null;
  closed_at: Date | string | null;
  esign_ref: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const READ_PERMISSION = 'quality.dashboard.view';
const WRITE_PERMISSION = 'quality.ncr.create';

const uuidSchema = z.string().uuid();
const complaintSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
const complaintStatusSchema = z.enum(['open', 'investigating', 'converted', 'closed']);
const capaSourceTypeSchema = z.enum(['complaint', 'ncr']);
const capaActionTypeSchema = z.enum(['corrective', 'preventive']);
const capaStatusSchema = z.enum(['open', 'in_progress', 'closed']);
const dateStringSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date');

const createComplaintSchema = z.object({
  customerId: uuidSchema.nullish(),
  lpId: uuidSchema.nullish(),
  batchRef: z.string().trim().min(1).max(120).nullish(),
  description: z.string().trim().min(1).max(4000),
  severity: complaintSeveritySchema,
});

const listComplaintsSchema = z.object({
  status: complaintStatusSchema.optional(),
});

const createCapaActionSchema = z.object({
  sourceType: capaSourceTypeSchema,
  sourceId: uuidSchema,
  actionType: capaActionTypeSchema,
  description: z.string().trim().min(1).max(4000),
  ownerUserId: uuidSchema.nullish(),
  dueDate: dateStringSchema.nullish(),
});

const listCapaActionsSchema = z.object({
  sourceType: capaSourceTypeSchema.optional(),
  sourceId: uuidSchema.optional(),
  status: capaStatusSchema.optional(),
});

const resolveCapaActionSchema = z.object({
  signature: z.object({ password: z.string().min(1) }),
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

function toDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function mapComplaintRow(row: ComplaintDbRow): ComplaintRow {
  return {
    id: row.id,
    complaintNumber: row.complaint_number,
    customerId: row.customer_id,
    customerCode: row.customer_code,
    customerName: row.customer_name,
    customerDisplay: row.customer_display,
    lpId: row.lp_id,
    lpCode: row.lp_code,
    batchRef: row.batch_ref,
    batchDisplay: row.batch_display,
    description: row.description,
    severity: row.severity,
    status: row.status,
    ncrId: row.ncr_id,
    openedBy: row.opened_by,
    openedAt: toIso(row.opened_at) ?? '',
    closedAt: toIso(row.closed_at),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapCapaActionRow(row: CapaActionDbRow): CapaActionRow {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    actionType: row.action_type,
    description: row.description,
    ownerUserId: row.owner_user_id,
    dueDate: toDate(row.due_date),
    status: row.status,
    closedBy: row.closed_by,
    closedAt: toIso(row.closed_at),
    esignRef: row.esign_ref,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapComplaintSeverity(severity: ComplaintSeverity): 'critical' | 'major' | 'minor' {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'major';
  return 'minor';
}

async function writeNcrOpenedOutbox(
  ctx: QualityContext,
  params: { ncrId: string; ncrNumber: string; severity: NcrSeverity; ncrType: 'complaint_related' },
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), 'quality.ncr.opened', 'ncr_report', $1::uuid, $2::jsonb, 'quality-ncr-v1')`,
    [
      params.ncrId,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        ncrId: params.ncrId,
        ncrNumber: params.ncrNumber,
        severity: params.severity,
        ncrType: params.ncrType,
      }),
    ],
  );
}

const complaintSelect = `
  select
    comp.id::text,
    comp.complaint_number,
    comp.customer_id::text,
    cust.customer_code,
    cust.name as customer_name,
    case
      when cust.id is null then null
      else concat_ws(' - ', cust.customer_code, cust.name)
    end as customer_display,
    comp.lp_id::text,
    coalesce(lp.lp_code, lp.lp_number) as lp_code,
    comp.batch_ref,
    coalesce(comp.batch_ref, lp.batch_number, lp.supplier_batch_number) as batch_display,
    comp.description,
    comp.severity,
    comp.status,
    comp.ncr_id::text,
    comp.opened_by::text,
    comp.opened_at,
    comp.closed_at,
    comp.created_at,
    comp.updated_at
  from public.complaints comp
  left join public.customers cust on cust.id = comp.customer_id and cust.org_id = comp.org_id
  left join public.license_plates lp on lp.id = comp.lp_id and lp.org_id = comp.org_id
`;

export async function createComplaint(input: {
  customerId?: string | null;
  lpId?: string | null;
  batchRef?: string | null;
  description: string;
  severity: ComplaintSeverity;
}): Promise<ActionResult<ComplaintRow>> {
  try {
    const parsed = createComplaintSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<ComplaintRow>> => {
      if (!(await hasPermission(ctx, WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const inserted = await ctx.client.query<ComplaintDbRow>(
        `with inserted as (
           insert into public.complaints (
             org_id,
             customer_id,
             lp_id,
             batch_ref,
             description,
             severity,
             status,
             opened_by
           )
           values (
             app.current_org_id(),
             $1::uuid,
             $2::uuid,
             $3,
             $4,
             $5,
             'open',
             $6::uuid
           )
           returning *
         )
         select
           comp.id::text,
           comp.complaint_number,
           comp.customer_id::text,
           cust.customer_code,
           cust.name as customer_name,
           case
             when cust.id is null then null
             else concat_ws(' - ', cust.customer_code, cust.name)
           end as customer_display,
           comp.lp_id::text,
           coalesce(lp.lp_code, lp.lp_number) as lp_code,
           comp.batch_ref,
           coalesce(comp.batch_ref, lp.batch_number, lp.supplier_batch_number) as batch_display,
           comp.description,
           comp.severity,
           comp.status,
           comp.ncr_id::text,
           comp.opened_by::text,
           comp.opened_at,
           comp.closed_at,
           comp.created_at,
           comp.updated_at
         from inserted comp
         left join public.customers cust on cust.id = comp.customer_id and cust.org_id = comp.org_id
         left join public.license_plates lp on lp.id = comp.lp_id and lp.org_id = comp.org_id`,
        [
          parsed.customerId ?? null,
          parsed.lpId ?? null,
          parsed.batchRef ?? null,
          parsed.description,
          parsed.severity,
          ctx.userId,
        ],
      );
      const row = inserted.rows[0];
      if (!row) return { ok: false, error: 'insert_failed' };
      return { ok: true, data: mapComplaintRow(row) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listComplaints(input: { status?: ComplaintStatus } = {}): Promise<ActionResult<ComplaintRow[]>> {
  try {
    const parsed = listComplaintsSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<ComplaintRow[]>> => {
      if (!(await hasPermission(ctx, READ_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<ComplaintDbRow>(
        `${complaintSelect}
         where comp.org_id = app.current_org_id()
           and ($1::text is null or comp.status = $1)
         order by comp.opened_at desc, comp.created_at desc`,
        [parsed.status ?? null],
      );
      return { ok: true, data: rows.map(mapComplaintRow) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function getComplaint(id: string): Promise<ActionResult<ComplaintRow>> {
  try {
    const parsedId = uuidSchema.parse(id);
    return await withOrgContext(async (ctx): Promise<ActionResult<ComplaintRow>> => {
      if (!(await hasPermission(ctx, READ_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<ComplaintDbRow>(
        `${complaintSelect}
         where comp.org_id = app.current_org_id()
           and comp.id = $1::uuid
         limit 1`,
        [parsedId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      return { ok: true, data: mapComplaintRow(row) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function convertComplaintToNcr(complaintId: string): Promise<ActionResult<{ complaintId: string; ncrId: string }>> {
  try {
    const parsedComplaintId = uuidSchema.parse(complaintId);
    return await withOrgContext(async (ctx): Promise<ActionResult<{ complaintId: string; ncrId: string }>> => {
      if (!(await hasPermission(ctx, WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const current = await ctx.client.query<{
        id: string;
        complaint_number: string | null;
        description: string;
        severity: ComplaintSeverity;
        status: ComplaintStatus;
        ncr_id: string | null;
        batch_ref: string | null;
        lp_code: string | null;
        product_id: string | null;
      }>(
        `select
           comp.id::text,
           comp.complaint_number,
           comp.description,
           comp.severity,
           comp.status,
           comp.ncr_id::text,
           comp.batch_ref,
           coalesce(lp.lp_code, lp.lp_number) as lp_code,
           lp.product_id::text
         from public.complaints comp
         left join public.license_plates lp on lp.id = comp.lp_id and lp.org_id = comp.org_id
        where comp.org_id = app.current_org_id()
          and comp.id = $1::uuid
        limit 1
        for update of comp`,
        [parsedComplaintId],
      );
      const complaint = current.rows[0];
      if (!complaint) return { ok: false, error: 'not_found' };
      if (complaint.ncr_id) return { ok: true, data: { complaintId: complaint.id, ncrId: complaint.ncr_id } };
      if (complaint.status === 'converted') return { ok: false, error: 'already_converted' };

      const existingNcr = await ctx.client.query<{ id: string }>(
        `select id::text
           from public.ncr_reports
          where org_id = app.current_org_id()
            and reference_type = 'complaint'
            and reference_id = $1::uuid
          order by created_at asc
          limit 1`,
        [parsedComplaintId],
      );
      const existing = existingNcr.rows[0];
      if (existing) {
        const linkedExisting = await ctx.client.query<{ id: string; ncr_id: string }>(
          `update public.complaints
              set ncr_id = $2::uuid,
                  status = 'converted'
            where org_id = app.current_org_id()
              and id = $1::uuid
              and ncr_id is null
              and status <> 'converted'
            returning id::text, ncr_id::text`,
          [parsedComplaintId, existing.id],
        );
        const existingRow = linkedExisting.rows[0];
        if (!existingRow) return { ok: false, error: 'already_converted' };
        return { ok: true, data: { complaintId: existingRow.id, ncrId: existingRow.ncr_id } };
      }

      const title = complaint.complaint_number
        ? `Customer complaint ${complaint.complaint_number}`
        : `Customer complaint ${parsedComplaintId.slice(0, 8)}`;
      const context = [
        complaint.description,
        complaint.lp_code ? `LP: ${complaint.lp_code}` : null,
        complaint.batch_ref ? `Batch: ${complaint.batch_ref}` : null,
      ].filter(Boolean).join('\n\n');
      const severity = mapComplaintSeverity(complaint.severity);

      const ncr = await ctx.client.query<{ id: string; ncr_number: string; status: 'open' }>(
        `insert into public.ncr_reports (
           org_id,
           ncr_type,
           severity,
           status,
           title,
           description,
           reference_type,
           reference_id,
           product_id,
           detected_by
         )
         values (
           app.current_org_id(),
           'complaint_related',
           $1,
           'open',
           $2,
           $3,
           'complaint',
           $4::uuid,
           $5::uuid,
           $6::uuid
         )
         returning id::text, ncr_number, status`,
        [severity, title, context, parsedComplaintId, complaint.product_id ?? null, ctx.userId],
      );
      const created = ncr.rows[0];
      if (!created) throw new Error('NCR insert did not return a row');

      await writeNcrOpenedOutbox(ctx, {
        ncrId: created.id,
        ncrNumber: created.ncr_number,
        severity,
        ncrType: 'complaint_related',
      });

      const linked = await ctx.client.query<{ id: string; ncr_id: string }>(
        `update public.complaints
            set ncr_id = $2::uuid,
                status = 'converted'
          where org_id = app.current_org_id()
            and id = $1::uuid
            and ncr_id is null
            and status <> 'converted'
          returning id::text, ncr_id::text`,
        [parsedComplaintId, created.id],
      );
      const row = linked.rows[0];
      if (!row) return { ok: false, error: 'already_converted' };

      return { ok: true, data: { complaintId: row.id, ncrId: row.ncr_id } };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function createCapaAction(input: {
  sourceType: CapaSourceType;
  sourceId: string;
  actionType: CapaActionType;
  description: string;
  ownerUserId?: string | null;
  dueDate?: string | null;
}): Promise<ActionResult<CapaActionRow>> {
  try {
    const parsed = createCapaActionSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CapaActionRow>> => {
      if (!(await hasPermission(ctx, WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const inserted = await ctx.client.query<CapaActionDbRow>(
        `insert into public.capa_actions (
           org_id,
           source_type,
           source_id,
           action_type,
           description,
           owner_user_id,
           due_date,
           status
         )
         values (
           app.current_org_id(),
           $1,
           $2::uuid,
           $3,
           $4,
           $5::uuid,
           $6::date,
           'open'
         )
         returning
           id::text,
           source_type,
           source_id::text,
           action_type,
           description,
           owner_user_id::text,
           due_date::text,
           status,
           closed_by::text,
           closed_at,
           esign_ref,
           created_at,
           updated_at`,
        [
          parsed.sourceType,
          parsed.sourceId,
          parsed.actionType,
          parsed.description,
          parsed.ownerUserId ?? null,
          parsed.dueDate ?? null,
        ],
      );
      const row = inserted.rows[0];
      if (!row) return { ok: false, error: 'insert_failed' };
      return { ok: true, data: mapCapaActionRow(row) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listCapaActions(input: {
  sourceType?: CapaSourceType;
  sourceId?: string;
  status?: CapaStatus;
} = {}): Promise<ActionResult<CapaActionRow[]>> {
  try {
    const parsed = listCapaActionsSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CapaActionRow[]>> => {
      if (!(await hasPermission(ctx, READ_PERMISSION))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<CapaActionDbRow>(
        `select
           id::text,
           source_type,
           source_id::text,
           action_type,
           description,
           owner_user_id::text,
           due_date::text,
           status,
           closed_by::text,
           closed_at,
           esign_ref,
           created_at,
           updated_at
         from public.capa_actions
        where org_id = app.current_org_id()
          and ($1::text is null or source_type = $1)
          and ($2::uuid is null or source_id = $2::uuid)
          and ($3::text is null or status = $3)
        order by created_at desc`,
        [parsed.sourceType ?? null, parsed.sourceId ?? null, parsed.status ?? null],
      );
      return { ok: true, data: rows.map(mapCapaActionRow) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function resolveCapaAction(
  id: string,
  input: { signature: { password: string } },
): Promise<ActionResult<CapaActionRow>> {
  let parsedId: string;
  try {
    parsedId = uuidSchema.parse(id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  const parsedSignature = resolveCapaActionSchema.safeParse(input);
  if (!parsedSignature.success) return { ok: false, error: 'esign_failed' };

  try {
    return await withOrgContext(async (ctx): Promise<ActionResult<CapaActionRow>> => {
      if (!(await hasPermission(ctx, WRITE_PERMISSION))) return { ok: false, error: 'forbidden' };

      const current = await ctx.client.query<{
        id: string;
        source_type: CapaSourceType;
        source_id: string;
        action_type: CapaActionType;
        description: string;
        status: CapaStatus;
      }>(
        `select
           id::text,
           source_type,
           source_id::text,
           action_type,
           description,
           status
         from public.capa_actions
        where org_id = app.current_org_id()
          and id = $1::uuid
        limit 1
        for update`,
        [parsedId],
      );
      const capa = current.rows[0];
      if (!capa) return { ok: false, error: 'not_found' };
      if (capa.status === 'closed') return { ok: false, error: 'already_closed' };

      let esignRef: string;
      try {
        const receipt = await signEvent(
          {
            signerUserId: ctx.userId,
            pin: parsedSignature.data.signature.password,
            intent: 'qa.capa.close',
            subject: {
              capaActionId: parsedId,
              sourceType: capa.source_type,
              sourceId: capa.source_id,
              actionType: capa.action_type,
            },
            reason: 'CAPA action closure',
          },
          { client: ctx.client as unknown as pg.PoolClient },
        );
        esignRef = receipt.subjectHash;
      } catch {
        return { ok: false, error: 'esign_failed' };
      }

      const updated = await ctx.client.query<CapaActionDbRow>(
        `update public.capa_actions
            set status = 'closed',
                closed_by = $2::uuid,
                closed_at = pg_catalog.now(),
                esign_ref = $3
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status <> 'closed'
          returning
            id::text,
            source_type,
            source_id::text,
            action_type,
            description,
            owner_user_id::text,
            due_date::text,
            status,
            closed_by::text,
            closed_at,
            esign_ref,
            created_at,
            updated_at`,
        [parsedId, ctx.userId, esignRef],
      );
      const row = updated.rows[0];
      if ((updated.rowCount ?? 0) === 0 || !row) return { ok: false, error: 'already_closed' };
      return { ok: true, data: mapCapaActionRow(row) };
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
