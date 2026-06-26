'use server';

import { randomUUID } from 'node:crypto';
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
type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

type SpecStatus = 'draft' | 'under_review' | 'active' | 'expired' | 'superseded';
type ParameterType = 'visual' | 'measurement' | 'attribute' | 'microbiological' | 'chemical' | 'sensory' | 'equipment';

type SpecListRow = {
  id: string;
  productId: string;
  productCode: string | null;
  productName: string | null;
  specCode: string;
  version: number;
  status: SpecStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  supersededBy: string | null;
  createdAt: string;
};

type SpecParameter = {
  id: string;
  parameterName: string;
  parameterType: ParameterType;
  targetValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  unit: string | null;
  isCritical: boolean;
  sortOrder: number;
};

type SpecDetail = SpecListRow & {
  appliesTo: string;
  approvalSignatureHash: string | null;
  parameters: SpecParameter[];
};

type CreatedSpec = { id: string; specCode: string; version: number; status: 'draft' };
type UpdatedSpecStatus = { id: string; status: SpecStatus; approvalSignatureHash?: string | null };
type SupersededSpec = { id: string; status: 'superseded'; supersededBy: string };

const uuidSchema = z.string().uuid();
const specStatusSchema = z.enum(['draft', 'under_review', 'active', 'expired', 'superseded']);
const parameterTypeSchema = z.enum(['visual', 'measurement', 'attribute', 'microbiological', 'chemical', 'sensory', 'equipment']);
const decimalStringSchema = z.string().trim().regex(/^-?\d+(\.\d+)?$/, 'must be a decimal string');

const listSchema = z.object({
  status: specStatusSchema.optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const parameterSchema = z.object({
  parameterName: z.string().trim().min(1).max(160),
  parameterType: parameterTypeSchema,
  targetValue: decimalStringSchema.optional(),
  minValue: decimalStringSchema.optional(),
  maxValue: decimalStringSchema.optional(),
  unit: z.string().trim().max(40).optional(),
  isCritical: z.boolean().optional(),
});

const createSchema = z.object({
  productId: uuidSchema,
  specCode: z.string().trim().min(1).max(80),
  parameters: z.array(parameterSchema).min(1).max(200),
});

const signatureSchema = z.object({
  specId: uuidSchema,
  signature: z.object({ password: z.string().min(1) }),
});

const specIdSchema = z.object({ specId: uuidSchema });
const supersedeSchema = z.object({ specId: uuidSchema, bySpecId: uuidSchema });
const updateSpecParameterSchema = z.object({
  specId: uuidSchema,
  parameterId: uuidSchema,
  parameterName: z.string().trim().min(1).max(160),
  parameterType: parameterTypeSchema,
  targetValue: decimalStringSchema.optional(),
  minValue: decimalStringSchema.optional(),
  maxValue: decimalStringSchema.optional(),
  unit: z.string().trim().max(40).optional(),
  isCritical: z.boolean(),
});
const deleteSpecParameterSchema = z.object({ specId: uuidSchema, parameterId: uuidSchema });

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

async function writeAuditEvent(
  ctx: QualityContext,
  params: {
    action: string;
    resourceType: string;
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

async function requireDraftSpec(ctx: QualityContext, specId: string): Promise<void> {
  const { rows } = await ctx.client.query<{ id: string; status: SpecStatus }>(
    `select id::text, status
       from public.quality_specifications
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [specId],
  );
  const spec = rows[0];
  if (!spec) throw new Error('spec not found');
  if (spec.status !== 'draft') throw new Error('spec must be draft');
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapSpecListRow(row: {
  id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  spec_code: string;
  version: number | string;
  status: SpecStatus;
  approved_by: string | null;
  approved_at: Date | string | null;
  superseded_by: string | null;
  created_at: Date | string;
}): SpecListRow {
  return {
    id: row.id,
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    specCode: row.spec_code,
    version: Number(row.version),
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: toIso(row.approved_at),
    supersededBy: row.superseded_by,
    createdAt: toIso(row.created_at) ?? '',
  };
}

export async function listSpecs(input: {
  status?: SpecStatus;
  search?: string;
  limit?: number;
} = {}): Promise<ActionResult<SpecListRow[]>> {
  try {
    const parsed = listSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<SpecListRow[]>> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<Parameters<typeof mapSpecListRow>[0]>(
        `select
           s.id::text,
           s.product_id::text,
           i.item_code as product_code,
           i.name as product_name,
           s.spec_code,
           s.version,
           s.status,
           s.approved_by::text,
           s.approved_at,
           s.superseded_by::text,
           s.created_at
         from public.quality_specifications s
         join public.items i on i.id = s.product_id and i.org_id = s.org_id
        where s.org_id = app.current_org_id()
          and ($1::text is null or s.status = $1)
          and ($2::text is null or (
            s.spec_code ilike '%' || $2 || '%'
            or i.item_code ilike '%' || $2 || '%'
            or i.name ilike '%' || $2 || '%'
          ))
        order by s.created_at desc
        limit $3::int`,
        [parsed.status ?? null, parsed.search || null, parsed.limit ?? 100],
      );

      return { ok: true, data: rows.map(mapSpecListRow) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getSpecDetail(specId: string): Promise<ActionResult<SpecDetail | null>> {
  try {
    const parsedSpecId = uuidSchema.parse(specId);
    return await withOrgContext(async (ctx): Promise<ActionResult<SpecDetail | null>> => {
      if (!(await hasPermission(ctx, 'quality.dashboard.view'))) return { ok: false, reason: 'forbidden' };

      const header = await ctx.client.query<
        Parameters<typeof mapSpecListRow>[0] & {
          applies_to: string;
          approval_signature_hash: string | null;
        }
      >(
        `select
           s.id::text,
           s.product_id::text,
           i.item_code as product_code,
           i.name as product_name,
           s.spec_code,
           s.version,
           s.status,
           s.applies_to,
           s.approved_by::text,
           s.approved_at,
           s.approval_signature_hash,
           s.superseded_by::text,
           s.created_at
         from public.quality_specifications s
         join public.items i on i.id = s.product_id and i.org_id = s.org_id
        where s.org_id = app.current_org_id()
          and s.id = $1::uuid
        limit 1`,
        [parsedSpecId],
      );
      const row = header.rows[0];
      if (!row) return { ok: true, data: null };

      const parameters = await ctx.client.query<{
        id: string;
        parameter_name: string;
        parameter_type: ParameterType;
        target_value: string | null;
        min_value: string | null;
        max_value: string | null;
        unit: string | null;
        is_critical: boolean;
        sort_order: number | string;
      }>(
        `select
           id::text,
           parameter_name,
           parameter_type,
           target_value::text,
           min_value::text,
           max_value::text,
           unit,
           is_critical,
           sort_order
         from public.quality_spec_parameters
        where org_id = app.current_org_id()
          and specification_id = $1::uuid
        order by sort_order asc, created_at asc`,
        [parsedSpecId],
      );

      return {
        ok: true,
        data: {
          ...mapSpecListRow(row),
          appliesTo: row.applies_to,
          approvalSignatureHash: row.approval_signature_hash,
          parameters: parameters.rows.map((param) => ({
            id: param.id,
            parameterName: param.parameter_name,
            parameterType: param.parameter_type,
            targetValue: param.target_value,
            minValue: param.min_value,
            maxValue: param.max_value,
            unit: param.unit,
            isCritical: param.is_critical,
            sortOrder: Number(param.sort_order),
          })),
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createSpec(input: {
  productId: string;
  specCode: string;
  parameters: Array<{
    parameterName: string;
    parameterType: ParameterType;
    targetValue?: string;
    minValue?: string;
    maxValue?: string;
    unit?: string;
    isCritical?: boolean;
  }>;
}): Promise<ActionResult<CreatedSpec>> {
  try {
    const parsed = createSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<CreatedSpec>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };

      await ctx.client.query(
        `select pg_advisory_xact_lock(hashtext($1::text || '::' || $2::text))`,
        [parsed.productId, parsed.specCode],
      );
      const versionResult = await ctx.client.query<{ next_version: number | string }>(
        `select coalesce(max(version), 0) + 1 as next_version
           from public.quality_specifications
          where org_id = app.current_org_id()
            and product_id = $1::uuid
            and spec_code = $2`,
        [parsed.productId, parsed.specCode],
      );
      const version = Number(versionResult.rows[0]?.next_version ?? 1);

      const spec = await ctx.client.query<{ id: string; spec_code: string; version: number | string; status: 'draft' }>(
        `insert into public.quality_specifications (
           org_id,
           product_id,
           spec_code,
           version,
           status,
           applies_to,
           created_by
         )
         values (app.current_org_id(), $1::uuid, $2, $3::int, 'draft', 'all', $4::uuid)
         returning id::text, spec_code, version, status`,
        [parsed.productId, parsed.specCode, version, ctx.userId],
      );
      const created = spec.rows[0];
      if (!created) throw new Error('spec insert did not return a row');

      for (const [index, parameter] of parsed.parameters.entries()) {
        await ctx.client.query(
          `insert into public.quality_spec_parameters (
             org_id,
             specification_id,
             parameter_name,
             parameter_type,
             target_value,
             min_value,
             max_value,
             unit,
             is_critical,
             sort_order
           )
           values (
             app.current_org_id(),
             $1::uuid,
             $2,
             $3,
             $4::numeric,
             $5::numeric,
             $6::numeric,
             $7,
             $8::boolean,
             $9::int
           )`,
          [
            created.id,
            parameter.parameterName,
            parameter.parameterType,
            parameter.targetValue ?? null,
            parameter.minValue ?? null,
            parameter.maxValue ?? null,
            parameter.unit ?? null,
            parameter.isCritical ?? false,
            index,
          ],
        );
      }

      return { ok: true, data: { id: created.id, specCode: created.spec_code, version: Number(created.version), status: 'draft' } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateSpecParameter(input: {
  specId: string;
  parameterId: string;
  parameterName: string;
  parameterType: ParameterType;
  targetValue?: string;
  minValue?: string;
  maxValue?: string;
  unit?: string;
  isCritical: boolean;
}): Promise<ActionResult<SpecParameter>> {
  try {
    const parsed = updateSpecParameterSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<SpecParameter>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };
      await requireDraftSpec(ctx, parsed.specId);

      const before = await ctx.client.query<{
        id: string;
        parameter_name: string;
        parameter_type: ParameterType;
        target_value: string | null;
        min_value: string | null;
        max_value: string | null;
        unit: string | null;
        is_critical: boolean;
        sort_order: number | string;
      }>(
        `select id::text,
                parameter_name,
                parameter_type,
                target_value::text,
                min_value::text,
                max_value::text,
                unit,
                is_critical,
                sort_order
           from public.quality_spec_parameters
          where org_id = app.current_org_id()
            and specification_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [parsed.specId, parsed.parameterId],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) throw new Error('spec parameter not found');

      const updated = await ctx.client.query<{
        id: string;
        parameter_name: string;
        parameter_type: ParameterType;
        target_value: string | null;
        min_value: string | null;
        max_value: string | null;
        unit: string | null;
        is_critical: boolean;
        sort_order: number | string;
      }>(
        `update public.quality_spec_parameters
            set parameter_name = $3,
                parameter_type = $4,
                target_value = $5::numeric,
                min_value = $6::numeric,
                max_value = $7::numeric,
                unit = $8,
                is_critical = $9::boolean
          where org_id = app.current_org_id()
            and specification_id = $1::uuid
            and id = $2::uuid
          returning id::text,
                    parameter_name,
                    parameter_type,
                    target_value::text,
                    min_value::text,
                    max_value::text,
                    unit,
                    is_critical,
                    sort_order`,
        [
          parsed.specId,
          parsed.parameterId,
          parsed.parameterName,
          parsed.parameterType,
          parsed.targetValue ?? null,
          parsed.minValue ?? null,
          parsed.maxValue ?? null,
          parsed.unit ?? null,
          parsed.isCritical,
        ],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('spec parameter update did not return a row');

      await writeAuditEvent(ctx, {
        action: 'quality_spec.parameter_updated',
        resourceType: 'quality_specification',
        resourceId: parsed.specId,
        beforeState: {
          parameterId: beforeRow.id,
          parameterName: beforeRow.parameter_name,
          parameterType: beforeRow.parameter_type,
          targetValue: beforeRow.target_value,
          minValue: beforeRow.min_value,
          maxValue: beforeRow.max_value,
          unit: beforeRow.unit,
          isCritical: beforeRow.is_critical,
          sortOrder: Number(beforeRow.sort_order),
        },
        afterState: {
          parameterId: row.id,
          parameterName: row.parameter_name,
          parameterType: row.parameter_type,
          targetValue: row.target_value,
          minValue: row.min_value,
          maxValue: row.max_value,
          unit: row.unit,
          isCritical: row.is_critical,
          sortOrder: Number(row.sort_order),
        },
      });

      return {
        ok: true,
        data: {
          id: row.id,
          parameterName: row.parameter_name,
          parameterType: row.parameter_type,
          targetValue: row.target_value,
          minValue: row.min_value,
          maxValue: row.max_value,
          unit: row.unit,
          isCritical: row.is_critical,
          sortOrder: Number(row.sort_order),
        },
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteSpecParameter(input: { specId: string; parameterId: string }): Promise<ActionResult<{ specId: string; parameterId: string }>> {
  try {
    const parsed = deleteSpecParameterSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<{ specId: string; parameterId: string }>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };
      await requireDraftSpec(ctx, parsed.specId);

      const before = await ctx.client.query<{
        id: string;
        parameter_name: string;
        parameter_type: ParameterType;
        target_value: string | null;
        min_value: string | null;
        max_value: string | null;
        unit: string | null;
        is_critical: boolean;
        sort_order: number | string;
      }>(
        `select id::text,
                parameter_name,
                parameter_type,
                target_value::text,
                min_value::text,
                max_value::text,
                unit,
                is_critical,
                sort_order
           from public.quality_spec_parameters
          where org_id = app.current_org_id()
            and specification_id = $1::uuid
            and id = $2::uuid
          limit 1`,
        [parsed.specId, parsed.parameterId],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) throw new Error('spec parameter not found');

      const { rowCount } = await ctx.client.query(
        `delete from public.quality_spec_parameters
          where org_id = app.current_org_id()
            and specification_id = $1::uuid
            and id = $2::uuid`,
        [parsed.specId, parsed.parameterId],
      );
      if (rowCount !== 1) throw new Error('spec parameter delete did not affect one row');

      await ctx.client.query(
        `with ranked as (
           select id, row_number() over (order by sort_order asc, id asc) as rn
             from public.quality_spec_parameters
            where org_id = app.current_org_id()
              and specification_id = $1::uuid
         )
         update public.quality_spec_parameters p
            set sort_order = ranked.rn
           from ranked
          where p.id = ranked.id
            and p.org_id = app.current_org_id()
            and p.specification_id = $1::uuid
            and p.sort_order <> ranked.rn`,
        [parsed.specId],
      );

      await writeAuditEvent(ctx, {
        action: 'quality_spec.parameter_deleted',
        resourceType: 'quality_specification',
        resourceId: parsed.specId,
        beforeState: {
          parameterId: beforeRow.id,
          parameterName: beforeRow.parameter_name,
          parameterType: beforeRow.parameter_type,
          targetValue: beforeRow.target_value,
          minValue: beforeRow.min_value,
          maxValue: beforeRow.max_value,
          unit: beforeRow.unit,
          isCritical: beforeRow.is_critical,
          sortOrder: Number(beforeRow.sort_order),
        },
        afterState: null,
      });

      return { ok: true, data: { specId: parsed.specId, parameterId: parsed.parameterId } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function submitSpecForReview(input: { specId: string }): Promise<ActionResult<UpdatedSpecStatus>> {
  try {
    const parsed = specIdSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<UpdatedSpecStatus>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };

      const updated = await ctx.client.query<{ id: string; status: SpecStatus }>(
        `update public.quality_specifications
            set status = 'under_review'
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
          returning id::text, status`,
        [parsed.specId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('spec not found or not in draft status');
      return { ok: true, data: { id: row.id, status: row.status } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function approveSpec(input: {
  specId: string;
  signature: { password: string };
}): Promise<ActionResult<UpdatedSpecStatus>> {
  try {
    const parsed = signatureSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<UpdatedSpecStatus>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };

      const current = await ctx.client.query<{ id: string; spec_code: string; version: number | string; status: SpecStatus }>(
        `select id::text, spec_code, version, status
           from public.quality_specifications
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.specId],
      );
      const spec = current.rows[0];
      if (!spec) throw new Error('spec not found');
      if (spec.status !== 'under_review') throw new Error('spec must be under_review before approval');

      const receipt = await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'qa.spec.approve',
          subject: { specId: parsed.specId, specCode: spec.spec_code, version: Number(spec.version) },
          reason: 'quality specification approval',
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

      const updated = await ctx.client.query<{ id: string; status: SpecStatus; approval_signature_hash: string | null }>(
        `update public.quality_specifications
            set status = 'active',
                approved_by = $2::uuid,
                approved_at = pg_catalog.now(),
                approval_signature_hash = $3
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'under_review'
          returning id::text, status, approval_signature_hash`,
        [parsed.specId, ctx.userId, receipt.subjectHash],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('spec approval update did not return a row');
      return { ok: true, data: { id: row.id, status: row.status, approvalSignatureHash: row.approval_signature_hash } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function supersedeSpec(input: { specId: string; bySpecId: string }): Promise<ActionResult<SupersededSpec>> {
  try {
    const parsed = supersedeSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<SupersededSpec>> => {
      if (!(await hasPermission(ctx, 'quality.spec.approve'))) return { ok: false, reason: 'forbidden' };

      const updated = await ctx.client.query<{ id: string; status: 'superseded'; superseded_by: string }>(
        `update public.quality_specifications
            set status = 'superseded',
                superseded_by = $2::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status <> 'superseded'
          returning id::text, status, superseded_by::text`,
        [parsed.specId, parsed.bySpecId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('spec not found or already superseded');
      return { ok: true, data: { id: row.id, status: row.status, supersededBy: row.superseded_by } };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
