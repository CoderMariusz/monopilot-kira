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
type ActionFailure = { ok: false; reason: 'forbidden' | 'error'; message?: string };
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

type HaccpPlanScopeType = 'product' | 'category' | 'line';
type HaccpPlanStatus = 'draft' | 'active' | 'superseded';
type HazardType = 'biological' | 'chemical' | 'physical' | 'allergen';

type HaccpPlanHeader = {
  id: string;
  name: string;
  scopeType: HaccpPlanScopeType;
  scopeRef: string | null;
  siteId: string | null;
  version: number;
  status: HaccpPlanStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type HaccpPlanCcp = {
  id: string;
  ccpCode: string;
  name: string;
  processStep: string;
  hazardType: HazardType;
  criticalLimitMin: string | null;
  criticalLimitMax: string | null;
  unit: string;
  monitoringFrequency: string;
  correctiveAction: string;
  lineId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type HaccpPlan = HaccpPlanHeader & { ccps: HaccpPlanCcp[] };

type PlanDbRow = {
  id: string;
  name: string;
  scope_type: HaccpPlanScopeType;
  scope_ref: string | null;
  site_id: string | null;
  version: number | string;
  status: HaccpPlanStatus;
  approved_by: string | null;
  approved_at: Date | string | null;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type PlanWithCcpDbRow = {
  plan_id: string;
  plan_name: string;
  scope_type: HaccpPlanScopeType;
  scope_ref: string | null;
  site_id: string | null;
  version: number | string;
  status: HaccpPlanStatus;
  approved_by: string | null;
  approved_at: Date | string | null;
  created_by: string | null;
  plan_created_at: Date | string;
  plan_updated_at: Date | string;
  ccp_id: string | null;
  ccp_code: string | null;
  ccp_name: string | null;
  process_step: string | null;
  hazard_type: HazardType | null;
  critical_limit_min: string | null;
  critical_limit_max: string | null;
  unit: string | null;
  monitoring_frequency: string | null;
  corrective_action: string | null;
  line_id: string | null;
  is_active: boolean | null;
  ccp_created_at: Date | string | null;
  ccp_updated_at: Date | string | null;
};

const PLAN_EDIT_PERMISSION = 'quality.haccp.plan_edit';
const uuidSchema = z.string().uuid();

const upsertPlanSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(1).max(240),
  scopeType: z.enum(['product', 'category', 'line']),
  scopeRef: z.string().trim().max(240).nullish(),
  siteId: uuidSchema.nullish(),
});

const activatePlanSchema = z.object({
  planId: uuidSchema,
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

function mapPlanHeader(row: PlanDbRow): HaccpPlanHeader {
  return {
    id: row.id,
    name: row.name,
    scopeType: row.scope_type,
    scopeRef: row.scope_ref,
    siteId: row.site_id,
    version: Number(row.version),
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: toIso(row.approved_at),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
  };
}

function mapPlanRows(rows: PlanWithCcpDbRow[]): HaccpPlan[] {
  const plans = new Map<string, HaccpPlan>();
  for (const row of rows) {
    let plan = plans.get(row.plan_id);
    if (!plan) {
      plan = {
        id: row.plan_id,
        name: row.plan_name,
        scopeType: row.scope_type,
        scopeRef: row.scope_ref,
        siteId: row.site_id,
        version: Number(row.version),
        status: row.status,
        approvedBy: row.approved_by,
        approvedAt: toIso(row.approved_at),
        createdBy: row.created_by,
        createdAt: toIso(row.plan_created_at) ?? '',
        updatedAt: toIso(row.plan_updated_at) ?? '',
        ccps: [],
      };
      plans.set(row.plan_id, plan);
    }

    if (!row.ccp_id) continue;
    plan.ccps.push({
      id: row.ccp_id,
      ccpCode: row.ccp_code ?? '',
      name: row.ccp_name ?? '',
      processStep: row.process_step ?? '',
      hazardType: row.hazard_type ?? 'physical',
      criticalLimitMin: row.critical_limit_min,
      criticalLimitMax: row.critical_limit_max,
      unit: row.unit ?? '',
      monitoringFrequency: row.monitoring_frequency ?? '',
      correctiveAction: row.corrective_action ?? '',
      lineId: row.line_id,
      isActive: row.is_active ?? false,
      createdAt: toIso(row.ccp_created_at) ?? '',
      updatedAt: toIso(row.ccp_updated_at) ?? '',
    });
  }
  return [...plans.values()];
}

async function selectPlanWithCcps(ctx: QualityContext, planId: string): Promise<HaccpPlan | null> {
  const { rows } = await ctx.client.query<PlanWithCcpDbRow>(
    `select
       p.id::text as plan_id,
       p.name as plan_name,
       p.scope_type,
       p.scope_ref,
       p.site_id::text,
       p.version,
       p.status,
       p.approved_by::text,
       p.approved_at,
       p.created_by::text,
       p.created_at as plan_created_at,
       p.updated_at as plan_updated_at,
       c.id::text as ccp_id,
       c.ccp_code,
       c.name as ccp_name,
       c.process_step,
       c.hazard_type,
       c.critical_limit_min::text,
       c.critical_limit_max::text,
       c.unit,
       c.monitoring_frequency,
       c.corrective_action,
       c.line_id::text,
       c.is_active,
       c.created_at as ccp_created_at,
       c.updated_at as ccp_updated_at
     from public.haccp_plans p
     left join public.haccp_ccps c on c.org_id = p.org_id and c.plan_id = p.id
    where p.org_id = app.current_org_id()
      and p.id = $1::uuid
    order by c.ccp_code`,
    [planId],
  );
  return mapPlanRows(rows)[0] ?? null;
}

export async function upsertHaccpPlan(input: {
  id?: string;
  name: string;
  scopeType: HaccpPlanScopeType;
  scopeRef?: string | null;
  siteId?: string | null;
}): Promise<ActionResult<HaccpPlanHeader>> {
  try {
    const parsed = upsertPlanSchema.parse(input);
    return await withOrgContext(async (ctx): Promise<ActionResult<HaccpPlanHeader>> => {
      if (!(await hasPermission(ctx, PLAN_EDIT_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const result = parsed.id
        ? await ctx.client.query<PlanDbRow>(
            `update public.haccp_plans
                set site_id = $1::uuid,
                    scope_type = $2,
                    scope_ref = $3,
                    name = $4
              where org_id = app.current_org_id()
                and id = $5::uuid
              returning
                id::text,
                name,
                scope_type,
                scope_ref,
                site_id::text,
                version,
                status,
                approved_by::text,
                approved_at,
                created_by::text,
                created_at,
                updated_at`,
            [parsed.siteId ?? null, parsed.scopeType, parsed.scopeRef || null, parsed.name, parsed.id],
          )
        : await ctx.client.query<PlanDbRow>(
            `insert into public.haccp_plans (
               org_id,
               site_id,
               scope_type,
               scope_ref,
               name,
               status,
               version,
               created_by
             )
             values (
               app.current_org_id(),
               $1::uuid,
               $2,
               $3,
               $4,
               'draft',
               1,
               $5::uuid
             )
             returning
               id::text,
               name,
               scope_type,
               scope_ref,
               site_id::text,
               version,
               status,
               approved_by::text,
               approved_at,
               created_by::text,
               created_at,
               updated_at`,
            [parsed.siteId ?? null, parsed.scopeType, parsed.scopeRef || null, parsed.name, ctx.userId],
          );

      const row = result.rows[0];
      if (!row) throw new Error('HACCP plan upsert did not return a row');
      return { ok: true, data: mapPlanHeader(row) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function activateHaccpPlan(
  planId: string,
  signature: { password: string },
): Promise<ActionResult<HaccpPlanHeader>> {
  try {
    const parsed = activatePlanSchema.parse({ planId, signature });
    return await withOrgContext(async (ctx): Promise<ActionResult<HaccpPlanHeader>> => {
      if (!(await hasPermission(ctx, PLAN_EDIT_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const current = await ctx.client.query<{ id: string; name: string; version: number | string; status: HaccpPlanStatus }>(
        `select id::text, name, version, status
           from public.haccp_plans
          where org_id = app.current_org_id()
            and id = $1::uuid
          for update`,
        [parsed.planId],
      );
      const plan = current.rows[0];
      if (!plan) throw new Error('HACCP plan not found');
      if (plan.status !== 'draft') throw new Error(`HACCP plan cannot be activated from status '${plan.status}'`);

      await signEvent(
        {
          signerUserId: ctx.userId,
          pin: parsed.signature.password,
          intent: 'qa.haccp.plan.activate',
          subject: { planId: parsed.planId, name: plan.name, version: Number(plan.version) },
          reason: 'HACCP plan activation',
        },
        { client: ctx.client as unknown as pg.PoolClient },
      );

      await ctx.client.query(
        `update public.haccp_plans
            set status = 'superseded'
          where org_id = app.current_org_id()
            and id <> $1::uuid
            and name = $2
            and status = 'active'`,
        [parsed.planId, plan.name],
      );

      const updated = await ctx.client.query<PlanDbRow>(
        `update public.haccp_plans
            set status = 'active',
                approved_by = $2::uuid,
                approved_at = pg_catalog.now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and status = 'draft'
          returning
            id::text,
            name,
            scope_type,
            scope_ref,
            site_id::text,
            version,
            status,
            approved_by::text,
            approved_at,
            created_by::text,
            created_at,
            updated_at`,
        [parsed.planId, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error('HACCP plan activation update did not return a row');
      return { ok: true, data: mapPlanHeader(row) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function newPlanVersion(planId: string): Promise<ActionResult<HaccpPlan>> {
  try {
    const parsedPlanId = uuidSchema.parse(planId);
    return await withOrgContext(async (ctx): Promise<ActionResult<HaccpPlan>> => {
      if (!(await hasPermission(ctx, PLAN_EDIT_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const current = await ctx.client.query<PlanDbRow>(
        `select
           id::text,
           name,
           scope_type,
           scope_ref,
           site_id::text,
           version,
           status,
           approved_by::text,
           approved_at,
           created_by::text,
           created_at,
           updated_at
         from public.haccp_plans
        where org_id = app.current_org_id()
          and id = $1::uuid
          and status = 'active'
        for update`,
        [parsedPlanId],
      );
      const source = current.rows[0];
      if (!source) throw new Error('active HACCP plan not found');

      const nextVersion = Number(source.version) + 1;
      const inserted = await ctx.client.query<PlanDbRow>(
        `insert into public.haccp_plans (
           org_id,
           site_id,
           scope_type,
           scope_ref,
           name,
           version,
           status,
           created_by
         )
         values (
           app.current_org_id(),
           $1::uuid,
           $2,
           $3,
           $4,
           $5::int,
           'draft',
           $6::uuid
         )
         returning
           id::text,
           name,
           scope_type,
           scope_ref,
           site_id::text,
           version,
           status,
           approved_by::text,
           approved_at,
           created_by::text,
           created_at,
           updated_at`,
        [source.site_id, source.scope_type, source.scope_ref, source.name, nextVersion, ctx.userId],
      );
      const newPlan = inserted.rows[0];
      if (!newPlan) throw new Error('HACCP plan version insert did not return a row');

      await ctx.client.query(
        `insert into public.haccp_ccps (
           org_id,
           plan_id,
           ccp_code,
           name,
           process_step,
           hazard_type,
           critical_limit_min,
           critical_limit_max,
           unit,
           monitoring_frequency,
           corrective_action,
           line_id,
           is_active,
           created_by
         )
         select
           app.current_org_id(),
           $2::uuid,
           ccp_code || '-v' || ($3::int)::text,
           name,
           process_step,
           hazard_type,
           critical_limit_min,
           critical_limit_max,
           unit,
           monitoring_frequency,
           corrective_action,
           line_id,
           is_active,
           $4::uuid
         from public.haccp_ccps
        where org_id = app.current_org_id()
          and plan_id = $1::uuid`,
        [parsedPlanId, newPlan.id, nextVersion, ctx.userId],
      );

      const plan = await selectPlanWithCcps(ctx, newPlan.id);
      if (!plan) throw new Error('new HACCP plan version could not be loaded');
      return { ok: true, data: plan };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function listHaccpPlans(): Promise<ActionResult<HaccpPlan[]>> {
  try {
    return await withOrgContext(async (ctx): Promise<ActionResult<HaccpPlan[]>> => {
      if (!(await hasPermission(ctx, PLAN_EDIT_PERMISSION))) return { ok: false, reason: 'forbidden' };

      const { rows } = await ctx.client.query<PlanWithCcpDbRow>(
        `select
           p.id::text as plan_id,
           p.name as plan_name,
           p.scope_type,
           p.scope_ref,
           p.site_id::text,
           p.version,
           p.status,
           p.approved_by::text,
           p.approved_at,
           p.created_by::text,
           p.created_at as plan_created_at,
           p.updated_at as plan_updated_at,
           c.id::text as ccp_id,
           c.ccp_code,
           c.name as ccp_name,
           c.process_step,
           c.hazard_type,
           c.critical_limit_min::text,
           c.critical_limit_max::text,
           c.unit,
           c.monitoring_frequency,
           c.corrective_action,
           c.line_id::text,
           c.is_active,
           c.created_at as ccp_created_at,
           c.updated_at as ccp_updated_at
         from public.haccp_plans p
         left join public.haccp_ccps c on c.org_id = p.org_id and c.plan_id = p.id
        where p.org_id = app.current_org_id()
        order by p.name, p.version desc, c.ccp_code`,
      );

      return { ok: true, data: mapPlanRows(rows) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function getHaccpPlan(id: string): Promise<ActionResult<HaccpPlan | null>> {
  try {
    const parsedId = uuidSchema.parse(id);
    return await withOrgContext(async (ctx): Promise<ActionResult<HaccpPlan | null>> => {
      if (!(await hasPermission(ctx, PLAN_EDIT_PERMISSION))) return { ok: false, reason: 'forbidden' };

      return { ok: true, data: await selectPlanWithCcps(ctx, parsedId) };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
