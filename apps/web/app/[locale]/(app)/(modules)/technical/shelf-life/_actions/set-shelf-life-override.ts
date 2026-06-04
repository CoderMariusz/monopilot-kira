'use server';

/**
 * T-046 — 03-technical Shelf Life Config (TEC-030): override Server Action.
 *
 * Gated on the real `technical.items.edit` RBAC permission. RLS-scoped UPDATE of
 * the shelf-life columns on public.items (shelf_life_days / shelf_life_mode /
 * date_code_format, migration 153) for a finished good. An override leaves the
 * regulatory preset, so it carries a mandatory reason that is written to
 * audit_log (mirroring the prototype ShelfLifeOverrideModal's QA-signoff note).
 *
 * zod-validated against the migration-153 CHECK constraints (shelf_life_mode
 * enum, shelf_life_days >= 0). Never mutates a non-FG item from this surface.
 */

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
  isPgError,
  ITEMS_EDIT_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  ShelfLifeOverrideInput,
  type ShelfLifeOverrideResult,
  writeAudit,
} from './shared';

type BeforeRow = {
  shelf_life_days: number | string | null;
  shelf_life_mode: string | null;
  date_code_format: string | null;
};

export async function setShelfLifeOverride(rawInput: unknown): Promise<ShelfLifeOverrideResult> {
  const parsed = ShelfLifeOverrideInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<ShelfLifeOverrideResult> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const before = await (client as QueryClient).query<BeforeRow>(
        `select shelf_life_days, shelf_life_mode, date_code_format
           from public.items
          where org_id = app.current_org_id() and id = $1::uuid and item_type = 'fg'`,
        [input.id],
      );
      if (before.rows.length === 0) return { ok: false, error: 'not_found' };

      const { rows, rowCount } = await (client as QueryClient).query<{ id: string }>(
        `update public.items
            set shelf_life_days = $2::integer,
                shelf_life_mode = $3,
                date_code_format = $4
          where org_id = app.current_org_id()
            and id = $1::uuid
            and item_type = 'fg'
        returning id`,
        [input.id, input.shelfLifeDays, input.shelfLifeMode, input.dateCodeFormat ?? null],
      );
      if ((rowCount ?? rows.length) < 1 || !rows[0]) return { ok: false, error: 'not_found' };

      await writeAudit(client as QueryClient, {
        orgId,
        actorUserId: userId,
        action: 'item.shelf_life_overridden',
        resourceId: input.id,
        beforeState: before.rows[0],
        afterState: {
          shelf_life_days: input.shelfLifeDays,
          shelf_life_mode: input.shelfLifeMode,
          date_code_format: input.dateCodeFormat ?? null,
          reason: input.reason,
        },
      });

      safeRevalidatePath('/technical/shelf-life');
      return {
        ok: true,
        data: { id: input.id, shelfLifeDays: input.shelfLifeDays, shelfLifeMode: input.shelfLifeMode },
      };
    });
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/shelf-life] setShelfLifeOverride persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
