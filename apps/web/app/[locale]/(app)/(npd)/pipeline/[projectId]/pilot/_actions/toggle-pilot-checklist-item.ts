'use server';

/**
 * NPD PILOT stage — `togglePilotChecklistItem` write Server Action.
 *
 * Toggles a single pilot-checklist item's checked state. Org-scoped via
 * withOrgContext → RLS with app.current_org_id(). RBAC write gate =
 * `npd.pilot.write` (BYTE-IDENTICAL to the seeded permission string).
 *
 * Writes an append-only audit_events row and revalidates the pilot route.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasPilotPermission } from './get-pilot-run';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

const Input = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
});

export type TogglePilotChecklistItemInput = z.infer<typeof Input>;

export type TogglePilotChecklistItemError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type TogglePilotChecklistItemResult =
  | { ok: true; data: { itemId: string; isChecked: boolean } }
  | { ok: false; error: TogglePilotChecklistItemError; message?: string };

const WRITE_PERMISSION = 'npd.pilot.write';

export async function togglePilotChecklistItem(
  raw: unknown,
): Promise<TogglePilotChecklistItemResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasPilotPermission(ctx, WRITE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // RLS scopes the update to the org; the join guard ties the item to a run
      // owned by the given project so a foreign item id cannot be flipped.
      const updated = await ctx.client.query<{ id: string; is_checked: boolean }>(
        `update public.pilot_run_checklist_items ci
            set is_checked = $3,
                updated_by = $4::uuid
           from public.pilot_runs pr
          where ci.id = $1::uuid
            and ci.org_id = app.current_org_id()
            and pr.id = ci.pilot_run_id
            and pr.project_id = $2::uuid
            and pr.org_id = app.current_org_id()
          returning ci.id, ci.is_checked`,
        [input.itemId, input.projectId, input.isChecked, ctx.userId],
      );
      const row = updated.rows[0];
      if (!row) return { ok: false as const, error: 'not_found' as const };

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.pilot.checklist.toggled', 'pilot_run_checklist_item', $2,
                 $3::jsonb, gen_random_uuid(), 'standard')`,
        [ctx.userId, row.id, JSON.stringify({ isChecked: row.is_checked })],
      );

      revalidateLocalized(`/pipeline/${input.projectId}/pilot`, 'page');

      return { ok: true as const, data: { itemId: row.id, isChecked: row.is_checked } };
    });
  } catch (error) {
    console.error('[togglePilotChecklistItem] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
