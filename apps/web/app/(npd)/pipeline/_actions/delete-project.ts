'use server';

import { revalidatePath } from 'next/cache';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  PROJECT_CREATE_PERMISSION,
  type OrgContextLike,
  hasPermission,
} from './shared';

const PROJECT_DELETED_EVENT = 'npd.project.deleted';

export type DeleteProjectResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'HAS_DEPENDENTS' | 'PERSISTENCE_FAILED' };

/** Postgres SQLSTATE for foreign_key_violation. */
const PG_FK_VIOLATION = '23503';

/**
 * Delete an NPD project. Deleting the row cascades gate_checklist_items (ON DELETE
 * CASCADE, mig 085) and nulls gate_approvals.project_id (ON DELETE SET NULL, kept for
 * audit). A project that already has downstream work (formulation/packaging/trial/…)
 * whose FK restricts deletion returns HAS_DEPENDENTS rather than a hard failure.
 *
 * RBAC: gated on npd.project.create (whoever can create projects can delete them).
 */
export async function deleteProject(rawInput: unknown): Promise<DeleteProjectResult> {
  const projectId = typeof rawInput === 'string' ? rawInput : (rawInput as { projectId?: unknown })?.projectId;
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    return { ok: false, error: 'INVALID_INPUT' };
  }

  try {
    return await withOrgContext<DeleteProjectResult>(async (rawCtx): Promise<DeleteProjectResult> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, PROJECT_CREATE_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN' };
      }

      let deleted: { id: string; code: string } | undefined;
      try {
        const { rows } = await ctx.client.query<{ id: string; code: string }>(
          `delete from public.npd_projects
            where id = $1::uuid
              and org_id = app.current_org_id()
          returning id, code`,
          [projectId],
        );
        deleted = rows[0];
      } catch (err) {
        if ((err as { code?: string })?.code === PG_FK_VIOLATION) {
          return { ok: false, error: 'HAS_DEPENDENTS' };
        }
        throw err;
      }

      if (!deleted) return { ok: false, error: 'NOT_FOUND' };

      await ctx.client.query(
        `insert into public.outbox_events
           (org_id, event_type, aggregate_type, aggregate_id, payload, app_version, dedup_key)
         values
           (app.current_org_id(), $1, 'npd_project', $2, $3::jsonb, 'npd-project-actions-v1', $4)
         on conflict (org_id, dedup_key) where dedup_key is not null do nothing`,
        [
          PROJECT_DELETED_EVENT,
          deleted.id,
          JSON.stringify({ org_id: ctx.orgId, actor_user_id: ctx.userId, project_id: deleted.id, code: deleted.code }),
          `${PROJECT_DELETED_EVENT}:${deleted.id}`,
        ],
      );

      try {
        revalidatePath('/pipeline');
      } catch {
        // Vitest imports Server Actions outside a Next request store.
      }
      return { ok: true };
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}
