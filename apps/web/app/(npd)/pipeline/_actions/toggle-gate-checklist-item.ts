'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { hasPermission, type OrgContextLike } from './shared';

const WRITE_PERMISSION = 'npd.core.write';

const inputSchema = z.object({
  projectId: z.string().uuid(),
  itemId: z.string().uuid(),
  completed: z.boolean(),
});

type ToggleGateChecklistItemResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED'; status: number };

type ChecklistAuditRow = {
  id: string;
  project_id: string;
  gate_code: string;
  item_text: string;
  required: boolean;
  completed_at: string | null;
  completed_by_user: string | null;
  fa_dept: string | null;
};

export async function toggleGateChecklistItem(rawInput: unknown): Promise<ToggleGateChecklistItemResult> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext(async (ctx): Promise<ToggleGateChecklistItemResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN', status: 403 };
      }

      const before = await context.client.query<ChecklistAuditRow>(
        `select gci.id,
                gci.project_id::text as project_id,
                gci.gate_code,
                gci.item_text,
                gci.required,
                gci.completed_at::text as completed_at,
                gci.completed_by_user::text as completed_by_user,
                done.dept as fa_dept
           from public.gate_checklist_items gci
           join public.npd_projects p
             on p.id = gci.project_id
            and p.org_id = gci.org_id
           left join lateral (
             select closure.dept
               from public.product pfa
               cross join (values
                 ('Core', pfa.closed_core),
                 ('Planning', pfa.closed_planning),
                 ('Commercial', pfa.closed_commercial),
                 ('Production', pfa.closed_production),
                 ('Technical', pfa.closed_technical),
                 ('MRP', pfa.closed_mrp),
                 ('Procurement', pfa.closed_procurement)
              ) as closure(dept, closed_value)
              where pfa.org_id = app.current_org_id()
                and pfa.product_code = p.product_code
                and gci.item_text like ('Done\\_' || closure.dept || ':%') escape $$\$$
              limit 1
           ) done on true
          where gci.id = $2::uuid
            and gci.project_id = $1::uuid
            and gci.org_id = app.current_org_id()
          for update`,
        [parsed.data.projectId, parsed.data.itemId],
      );
      const beforeRow = before.rows[0];
      if (!beforeRow) return { ok: false, code: 'NOT_FOUND', status: 404 };
      if (beforeRow.fa_dept !== null) return { ok: false, code: 'FORBIDDEN', status: 403 };

      const updated = await context.client.query<ChecklistAuditRow>(
        `update public.gate_checklist_items
            set completed_at = case when $3::boolean then now() else null end,
                completed_by_user = case when $3::boolean then $4::uuid else null end
          where id = $1::uuid
            and project_id = $2::uuid
            and org_id = app.current_org_id()
          returning id,
                    project_id,
                    gate_code,
                    item_text,
                    required,
                    completed_at::text as completed_at,
                    completed_by_user::text as completed_by_user`,
        [parsed.data.itemId, parsed.data.projectId, parsed.data.completed, context.userId],
      );
      const afterRow = updated.rows[0];
      if (!afterRow) return { ok: false, code: 'NOT_FOUND', status: 404 };

      await context.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user', 'npd.gate_checklist_item.toggled',
                 'gate_checklist_item', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
        [
          context.userId,
          parsed.data.itemId,
          JSON.stringify(beforeRow),
          JSON.stringify(afterRow),
          randomUUID(),
        ],
      );

      safeRevalidatePath('/pipeline');
      return { ok: true };
    });
  } catch (error) {
    console.error('[toggleGateChecklistItem] persistence_failed', {
      projectId: parsed.data.projectId,
      itemId: parsed.data.itemId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'PERSISTENCE_FAILED', status: 500 };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
