'use server';

/**
 * NPD HANDOFF stage — `toggleHandoffChecklistItem` write Server Action.
 *
 * Toggles a single handoff-checklist item's checked state. Org-scoped via
 * withOrgContext → RLS with app.current_org_id(). The checklist toggle is a
 * low-risk edit consistent with the sibling stages (pilot/trial), so it gates on
 * `npd.handoff.read` (BYTE-IDENTICAL to the seeded permission string in
 * migration 236) — the high-risk promote action gates on `npd.handoff.promote`.
 *
 * Writes an append-only audit_events row and revalidates the handoff route.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasHandoffPermission } from './get-handoff';

const Input = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  isChecked: z.boolean(),
});

export type ToggleHandoffChecklistItemInput = z.infer<typeof Input>;

export type ToggleHandoffChecklistItemError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'persistence_failed';

export type ToggleHandoffChecklistItemResult =
  | { ok: true; data: { itemId: string; isChecked: boolean } }
  | { ok: false; error: ToggleHandoffChecklistItemError; message?: string };

const TOGGLE_PERMISSION = 'npd.handoff.read';

export async function toggleHandoffChecklistItem(
  raw: unknown,
): Promise<ToggleHandoffChecklistItemResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async (ctx) => {
      if (!(await hasHandoffPermission(ctx, TOGGLE_PERMISSION))) {
        return { ok: false as const, error: 'forbidden' as const };
      }

      // RLS scopes the update to the org; the join guard ties the item to the
      // checklist owned by the given project so a foreign item id cannot flip.
      const updated = await ctx.client.query<{ id: string; is_checked: boolean }>(
        `update public.handoff_checklist_items ci
            set is_checked = $3,
                updated_by = $4::uuid
           from public.handoff_checklists hc
          where ci.id = $1::uuid
            and ci.org_id = app.current_org_id()
            and hc.id = ci.handoff_checklist_id
            and hc.project_id = $2::uuid
            and hc.org_id = app.current_org_id()
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
                 'npd.handoff.checklist.toggled', 'handoff_checklist_item', $2,
                 $3::jsonb, gen_random_uuid(), 'standard')`,
        [ctx.userId, row.id, JSON.stringify({ isChecked: row.is_checked })],
      );

      revalidatePath(`/[locale]/(app)/(npd)/pipeline/${input.projectId}/handoff`, 'page');

      return { ok: true as const, data: { itemId: row.id, isChecked: row.is_checked } };
    });
  } catch (error) {
    console.error('[toggleHandoffChecklistItem] persistence_failed:', error);
    return { ok: false, error: 'persistence_failed' };
  }
}
