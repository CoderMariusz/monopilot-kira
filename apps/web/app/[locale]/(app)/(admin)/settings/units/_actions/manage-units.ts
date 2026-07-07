'use server';

/**
 * T-073 / SET-094 — Units (UoM) management Server Actions.
 *
 * Owns the write side of /settings/units: create a unit of measure, create a
 * custom (non-linear) conversion, and soft-delete a unit. Every write is gated
 * by the real `settings.units.manage` RBAC permission (seeded to owner/admin/
 * org_admin in Wave 1 migration 064) and runs inside `withOrgContext` so RLS
 * (`app.current_org_id()`) scopes every statement to the caller's org.
 *
 * Tables (Wave 1 migration 064, public schema):
 *   - unit_of_measure(org_id, category, code, name, factor_to_base, is_base, deleted_at)
 *   - uom_custom_conversions(org_id, label, from_unit_code, to_unit_code, factor, deleted_at)
 */

import { z } from 'zod';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import {
  CreateUnitInput,
  UpdateUnitInput,
  type CreateUnitInputType,
  type UnitCategory,
  type UpdateUnitInputType,
} from './units-validation';

export type { CreateUnitInputType };

const MANAGE_PERMISSION = 'settings.units.manage';
const APP_VERSION = 'settings-units-v1';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type UnitsActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'already_exists'
  | 'not_found'
  | 'invalid_reference'
  | 'in_use'
  | 'persistence_failed';

export type CreateUnitResult =
  | { ok: true; data: { id: string; code: string; category: UnitCategory } }
  | { ok: false; error: UnitsActionError; message?: string };

const CreateConversionInput = z.object({
  label: z.string().trim().min(1).max(120),
  fromUnitCode: z.string().trim().min(1).max(32),
  toUnitCode: z.string().trim().min(1).max(32),
  factor: z.coerce.number().positive().finite(),
});
export type CreateConversionInputType = z.infer<typeof CreateConversionInput>;

export type CreateConversionResult =
  | { ok: true; data: { id: string; label: string } }
  | { ok: false; error: UnitsActionError; message?: string };

const SoftDeleteUnitInput = z.object({ id: z.string().uuid() });

export type SoftDeleteUnitResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: UnitsActionError; message?: string };

export type UpdateUnitResult =
  | { ok: true; data: { id: string; code: string; name: string; factorToBase: number } }
  | { ok: false; error: UnitsActionError; message?: string };

async function hasManagePermission(ctx: OrgActionContext): Promise<boolean> {
  // Canonical dual-store RBAC check (matches actions/infra/line.ts,
  // warehouse.ts): LEFT JOIN the normalized role_permissions AND fall back to the
  // legacy roles.permissions jsonb store + the admin role code/slug allowlist, so a
  // grant that lives only in jsonb (or an admin role) is never wrongly denied.
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
      limit 1`,
    [ctx.userId, ctx.orgId, MANAGE_PERMISSION, ['owner', 'admin', 'org_admin']],
  );
  return rows.length > 0;
}

async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'unit_of_measure', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}

async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'unit_of_measure', $3::uuid, $4::jsonb, $5)`,
    [params.orgId, params.eventType, params.aggregateId, JSON.stringify(params.payload), APP_VERSION],
  );
}

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

async function loadUnitRow(
  client: QueryClient,
  id: string,
): Promise<{ id: string; code: string; name: string; factor_to_base: string; is_base: boolean } | null> {
  const { rows } = await client.query<{
    id: string;
    code: string;
    name: string;
    factor_to_base: string;
    is_base: boolean;
  }>(
    `select id::text,
            code,
            name,
            factor_to_base::text,
            is_base
       from public.unit_of_measure
      where org_id = app.current_org_id()
        and id = $1::uuid
        and deleted_at is null
      limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Referential safety: unit codes are matched as strings across items, conversions, etc. */
async function isUnitCodeInUse(client: QueryClient, code: string): Promise<boolean> {
  const { rows } = await client.query<{ in_use: boolean }>(
    `select exists (
       select 1
         from public.items i
        where i.org_id = app.current_org_id()
          and (i.uom_base = $1 or i.uom_secondary = $1)
       union all
       select 1
         from public.uom_custom_conversions c
        where c.org_id = app.current_org_id()
          and c.deleted_at is null
          and (c.from_unit_code = $1 or c.to_unit_code = $1)
       union all
       select 1
         from public.spare_parts sp
        where sp.org_id = app.current_org_id()
          and sp.unit_of_measure = $1
       union all
       select 1
         from public.calibration_instruments ci
        where ci.org_id = app.current_org_id()
          and ci.unit_of_measure = $1
     ) as in_use`,
    [code],
  );
  return rows[0]?.in_use === true;
}

export async function createUnit(rawInput: unknown): Promise<CreateUnitResult> {
  const parsed = CreateUnitInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateUnitResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasManagePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<{ id: string }>(
        `insert into public.unit_of_measure
           (org_id, category, code, name, factor_to_base, is_base)
         values ($1::uuid, $2, $3, $4, $5::numeric, $6::boolean)
         returning id`,
        [orgId, input.category, input.code, input.name, input.factorToBase, input.isBase ?? false],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'unit.created',
        resourceId: inserted.id,
        beforeState: null,
        afterState: { code: input.code, category: input.category, factorToBase: input.factorToBase, isBase: input.isBase ?? false },
      });
      await writeOutbox(client as QueryClient, {
        orgId,
        eventType: 'unit_of_measure.created',
        aggregateId: inserted.id,
        payload: { code: input.code, category: input.category },
      });

      revalidateLocalized('/settings/units');
      return { ok: true, data: { id: inserted.id, code: input.code, category: input.category } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'invalid_reference' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[settings/units] createUnit persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createCustomConversion(rawInput: unknown): Promise<CreateConversionResult> {
  const parsed = CreateConversionInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<CreateConversionResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasManagePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<{ id: string }>(
        `insert into public.uom_custom_conversions
           (org_id, label, from_unit_code, to_unit_code, factor)
         values ($1::uuid, $2, $3, $4, $5::numeric)
         returning id`,
        [orgId, input.label, input.fromUnitCode, input.toUnitCode, input.factor],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'unit.conversion_created',
        resourceId: inserted.id,
        beforeState: null,
        afterState: { label: input.label, from: input.fromUnitCode, to: input.toUnitCode, factor: input.factor },
      });
      await writeOutbox(client as QueryClient, {
        orgId,
        eventType: 'unit_of_measure.conversion_created',
        aggregateId: inserted.id,
        payload: { label: input.label, from: input.fromUnitCode, to: input.toUnitCode },
      });

      revalidateLocalized('/settings/units');
      return { ok: true, data: { id: inserted.id, label: input.label } };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[settings/units] createCustomConversion persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateUnit(rawInput: unknown): Promise<UpdateUnitResult> {
  const parsed = UpdateUnitInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input: UpdateUnitInputType = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<UpdateUnitResult> => {
      const queryClient = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: queryClient };
      if (!(await hasManagePermission(ctx))) return { ok: false, error: 'forbidden' };

      const existing = await loadUnitRow(queryClient, input.id);
      if (!existing) return { ok: false, error: 'not_found' };

      const { rows } = await queryClient.query<{ id: string; code: string; name: string; factor_to_base: string }>(
        `update public.unit_of_measure
            set name = $2,
                factor_to_base = $3::numeric,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
        returning id::text, code, name, factor_to_base::text`,
        [input.id, input.name, input.factorToBase],
      );
      const updated = rows[0];
      if (!updated) return { ok: false, error: 'not_found' };

      await writeAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'unit.updated',
        resourceId: input.id,
        beforeState: {
          code: existing.code,
          name: existing.name,
          factorToBase: existing.factor_to_base,
        },
        afterState: {
          code: updated.code,
          name: updated.name,
          factorToBase: updated.factor_to_base,
        },
      });

      revalidateLocalized('/settings/units');
      return {
        ok: true,
        data: {
          id: updated.id,
          code: updated.code,
          name: updated.name,
          factorToBase: Number(updated.factor_to_base),
        },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[settings/units] updateUnit persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function softDeleteUnit(rawInput: unknown): Promise<SoftDeleteUnitResult> {
  const parsed = SoftDeleteUnitInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SoftDeleteUnitResult> => {
      const queryClient = client as QueryClient;
      const ctx: OrgActionContext = { userId, orgId, client: queryClient };
      if (!(await hasManagePermission(ctx))) return { ok: false, error: 'forbidden' };

      const existing = await loadUnitRow(queryClient, input.id);
      if (!existing) return { ok: false, error: 'not_found' };
      if (existing.is_base) return { ok: false, error: 'invalid_input', message: 'Cannot delete a base unit.' };
      if (await isUnitCodeInUse(queryClient, existing.code)) {
        return { ok: false, error: 'in_use', message: `Unit "${existing.code}" is referenced elsewhere and cannot be deleted.` };
      }

      const { rows, rowCount } = await queryClient.query<{ id: string }>(
        `update public.unit_of_measure
            set deleted_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
            and deleted_at is null
        returning id`,
        [input.id],
      );
      if ((rowCount ?? rows.length) < 1 || !rows[0]) return { ok: false, error: 'not_found' };

      await writeAudit(queryClient, {
        orgId,
        actorUserId: userId,
        action: 'unit.soft_deleted',
        resourceId: input.id,
        beforeState: { id: input.id, code: existing.code },
        afterState: { id: input.id, deleted: true },
      });
      await writeOutbox(queryClient, {
        orgId,
        eventType: 'unit_of_measure.soft_deleted',
        aggregateId: input.id,
        payload: { id: input.id },
      });

      revalidateLocalized('/settings/units');
      return { ok: true, data: { id: input.id } };
    });
  } catch (err) {
    console.error('[settings/units] softDeleteUnit persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
