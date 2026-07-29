'use server';

/**
 * 13-MAINTENANCE — equipment asset registry (Wave W8 C117).
 *
 * Uses the existing `equipment` table from migration 201 — withdrawal audit
 * columns land in migration 542.
 * RBAC from migration 202:
 *   read/list → mnt.asset.read
 *   create/update → mnt.asset.edit
 *   withdraw / reactivate → mnt.asset.deactivate
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  createEquipmentSchema,
  deactivateEquipmentSchema,
  reactivateEquipmentSchema,
  updateEquipmentSchema,
  type AssetPermissions,
  type EquipmentAssetRow,
} from '../_types/asset-schemas';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type AssetContext = { userId: string; orgId: string; client: QueryClient };

const MNT_READ_PERMISSION = 'mnt.asset.read';
const MNT_EDIT_PERMISSION = 'mnt.asset.edit';
const MNT_DEACTIVATE_PERMISSION = 'mnt.asset.deactivate';

type ActionFailure = {
  ok: false;
  reason: 'forbidden' | 'validation_error' | 'conflict' | 'not_found' | 'error';
  message?: string;
};
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

async function hasMntPermission(ctx: AssetContext, permission: string): Promise<boolean> {
  return hasPermission({ client: ctx.client, userId: ctx.userId, orgId: ctx.orgId }, permission);
}

function revalidateAssetRoutes(): void {
  revalidateLocalized('/maintenance/assets');
  revalidateLocalized('/maintenance');
}

export async function getAssetPermissions(): Promise<AssetPermissions> {
  return withOrgContext(async (ctx: AssetContext): Promise<AssetPermissions> => {
    const [canRead, canEdit, canDeactivate] = await Promise.all([
      hasMntPermission(ctx, MNT_READ_PERMISSION),
      hasMntPermission(ctx, MNT_EDIT_PERMISSION),
      hasMntPermission(ctx, MNT_DEACTIVATE_PERMISSION),
    ]);
    return { canRead, canEdit, canDeactivate };
  });
}

export async function listEquipmentAssets(): Promise<ActionResult<EquipmentAssetRow[]>> {
  try {
    return await withOrgContext(async (ctx: AssetContext): Promise<ActionResult<EquipmentAssetRow[]>> => {
      if (!(await hasMntPermission(ctx, MNT_READ_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const { rows } = await ctx.client.query<{
        id: string;
        equipment_code: string;
        name: string;
        equipment_type: string;
        requires_loto: boolean;
        requires_calibration: boolean;
        active: boolean;
        deactivated_at: Date | string | null;
        deactivation_reason: string | null;
      }>(
        `select id::text,
                equipment_code,
                name,
                equipment_type,
                requires_loto,
                requires_calibration,
                active,
                deactivated_at,
                deactivation_reason
           from public.equipment
          where org_id = app.current_org_id()
          order by equipment_code`,
      );

      return {
        ok: true,
        data: rows.map((r) => ({
          id: r.id,
          equipmentCode: r.equipment_code,
          name: r.name,
          equipmentType: r.equipment_type,
          requiresLoto: r.requires_loto,
          requiresCalibration: r.requires_calibration,
          active: r.active,
          deactivatedAt:
            r.deactivated_at instanceof Date
              ? r.deactivated_at.toISOString()
              : r.deactivated_at,
          deactivationReason: r.deactivation_reason,
        })),
      };
    });
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function createEquipment(input: {
  equipmentCode: string;
  name: string;
  equipmentType: 'mixer' | 'oven' | 'packer' | 'scale' | 'thermometer' | 'conveyor' | 'other';
  requiresLoto?: boolean;
  requiresCalibration?: boolean;
}): Promise<ActionResult<{ equipmentId: string }>> {
  try {
    const parsed = createEquipmentSchema.parse(input);
    return await withOrgContext(async (ctx: AssetContext): Promise<ActionResult<{ equipmentId: string }>> => {
      if (!(await hasMntPermission(ctx, MNT_EDIT_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      try {
        const inserted = await ctx.client.query<{ id: string }>(
          `insert into public.equipment (
             org_id, equipment_code, name, equipment_type,
             requires_loto, requires_calibration,
             active, created_by, updated_by
           )
           values (
             app.current_org_id(), $1, $2, $3,
             $4, $5,
             true, $6::uuid, $6::uuid
           )
           returning id::text`,
          [
            parsed.equipmentCode,
            parsed.name,
            parsed.equipmentType,
            parsed.requiresLoto,
            parsed.requiresCalibration,
            ctx.userId,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error('equipment insert returned no row');

        revalidateAssetRoutes();
        return { ok: true, data: { equipmentId: row.id } };
      } catch (err) {
        if (err instanceof Error && err.message.includes('equipment_org_code_uq')) {
          return { ok: false, reason: 'conflict', message: 'equipment code already exists' };
        }
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateEquipment(input: {
  equipmentId: string;
  equipmentCode?: string;
  name: string;
  equipmentType: 'mixer' | 'oven' | 'packer' | 'scale' | 'thermometer' | 'conveyor' | 'other';
  requiresLoto: boolean;
  requiresCalibration: boolean;
}): Promise<ActionResult<{ equipmentId: string }>> {
  try {
    const parsed = updateEquipmentSchema.parse(input);
    return await withOrgContext(async (ctx: AssetContext): Promise<ActionResult<{ equipmentId: string }>> => {
      if (!(await hasMntPermission(ctx, MNT_EDIT_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      try {
        const updated = await ctx.client.query<{ id: string }>(
          `update public.equipment e
              set equipment_code = coalesce($2, e.equipment_code),
                  name = $3,
                  equipment_type = $4,
                  requires_loto = $5,
                  requires_calibration = $6,
                  updated_by = $7::uuid,
                  updated_at = pg_catalog.now()
            where e.org_id = app.current_org_id()
              and e.id = $1::uuid
          returning e.id::text`,
          [
            parsed.equipmentId,
            parsed.equipmentCode ?? null,
            parsed.name,
            parsed.equipmentType,
            parsed.requiresLoto,
            parsed.requiresCalibration,
            ctx.userId,
          ],
        );
        const row = updated.rows[0];
        if (!row) return { ok: false, reason: 'not_found' };

        revalidateAssetRoutes();
        return { ok: true, data: { equipmentId: row.id } };
      } catch (err) {
        if (err instanceof Error && err.message.includes('equipment_org_code_uq')) {
          return { ok: false, reason: 'conflict', message: 'equipment code already exists' };
        }
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deactivateEquipment(input: {
  equipmentId: string;
  reason: string;
}): Promise<ActionResult<{ equipmentId: string }>> {
  try {
    const parsed = deactivateEquipmentSchema.parse(input);
    return await withOrgContext(async (ctx: AssetContext): Promise<ActionResult<{ equipmentId: string }>> => {
      if (!(await hasMntPermission(ctx, MNT_DEACTIVATE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const updated = await ctx.client.query<{ id: string; site_id: string | null }>(
        `update public.equipment e
            set active = false,
                deactivated_at = pg_catalog.now(),
                deactivated_by = $2::uuid,
                deactivation_reason = $3,
                updated_by = $2::uuid,
                updated_at = pg_catalog.now()
          where e.org_id = app.current_org_id()
            and e.id = $1::uuid
            and e.active = true
        returning e.id::text, e.site_id::text`,
        [parsed.equipmentId, ctx.userId, parsed.reason],
      );
      const row = updated.rows[0];
      if (!row) {
        const exists = await ctx.client.query<{ active: boolean }>(
          `select active
             from public.equipment
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [parsed.equipmentId],
        );
        if (!exists.rows[0]) return { ok: false, reason: 'not_found' };
        return { ok: false, reason: 'error', message: 'asset is already withdrawn' };
      }

      await ctx.client.query(
        `update public.maintenance_schedules s
            set active = false,
                updated_by = $2::uuid,
                updated_at = pg_catalog.now()
          where s.org_id = app.current_org_id()
            and s.equipment_id = $1::uuid
            and s.active = true`,
        [parsed.equipmentId, ctx.userId],
      );

      await ctx.client.query(
        `insert into public.maintenance_history (
           org_id, site_id, equipment_id, event_type, event_date, summary, technician_id
         )
         select app.current_org_id(), $2::uuid, $1::uuid, 'cancellation', pg_catalog.now(), $3, $4::uuid`,
        [parsed.equipmentId, row.site_id, `Asset withdrawn: ${parsed.reason}`, ctx.userId],
      );

      revalidateAssetRoutes();
      return { ok: true, data: { equipmentId: row.id } };
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function reactivateEquipment(input: {
  equipmentId: string;
}): Promise<ActionResult<{ equipmentId: string }>> {
  try {
    const parsed = reactivateEquipmentSchema.parse(input);
    return await withOrgContext(async (ctx: AssetContext): Promise<ActionResult<{ equipmentId: string }>> => {
      if (!(await hasMntPermission(ctx, MNT_DEACTIVATE_PERMISSION))) {
        return { ok: false, reason: 'forbidden' };
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.equipment e
            set active = true,
                updated_by = $2::uuid,
                updated_at = pg_catalog.now()
          where e.org_id = app.current_org_id()
            and e.id = $1::uuid
            and e.active = false
        returning e.id::text`,
        [parsed.equipmentId, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };

      revalidateAssetRoutes();
      return { ok: true, data: { equipmentId: row.id } };
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, reason: 'validation_error', message: err.message };
    }
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
