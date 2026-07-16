'use server';

/**
 * 13-MAINTENANCE — equipment asset registry (Wave W8 C117).
 *
 * Uses the existing `equipment` table from migration 201 — no new migration.
 * RBAC from migration 202:
 *   read/list → mnt.asset.read
 *   create    → mnt.asset.edit
 */

import { z } from 'zod';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

import {
  createEquipmentSchema,
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

type ActionFailure = {
  ok: false;
  reason: 'forbidden' | 'validation_error' | 'conflict' | 'error';
  message?: string;
};
type ActionResult<T> = { ok: true; data: T } | ActionFailure;

async function hasMntPermission(ctx: AssetContext, permission: string): Promise<boolean> {
  return hasPermission({ client: ctx.client, userId: ctx.userId, orgId: ctx.orgId }, permission);
}

export async function getAssetPermissions(): Promise<AssetPermissions> {
  return withOrgContext(async (ctx: AssetContext): Promise<AssetPermissions> => {
    const [canRead, canEdit] = await Promise.all([
      hasMntPermission(ctx, MNT_READ_PERMISSION),
      hasMntPermission(ctx, MNT_EDIT_PERMISSION),
    ]);
    return { canRead, canEdit };
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
      }>(
        `select id::text,
                equipment_code,
                name,
                equipment_type,
                requires_loto,
                requires_calibration,
                active
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

        revalidateLocalized('/maintenance/assets');
        revalidateLocalized('/maintenance');
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
