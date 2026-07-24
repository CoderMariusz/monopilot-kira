'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import {
  PROJECT_CREATE_PERMISSION,
  type OrgContextLike,
  hasPermission,
} from './shared';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';
import {
  archiveLinkedFgForDeletedProject,
  LinkedFgArchiveBlockedError,
} from './_lib/project-fg-sync';

const PROJECT_DELETED_EVENT = 'npd.project.deleted';

export type DeleteProjectResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | 'INVALID_INPUT'
        | 'FORBIDDEN'
        | 'NOT_FOUND'
        | 'HAS_DEPENDENTS'
        | 'LINKED_FG_BLOCKED'
        | 'PERSISTENCE_FAILED';
      blockReason?: string;
    };

/** Postgres SQLSTATE for foreign_key_violation. */
const PG_FK_VIOLATION = '23503';

/** Thrown inside withOrgContext after pre-delete writes so the txn rolls back. */
class HasDependentsError extends Error {
  constructor() {
    super('HAS_DEPENDENTS');
    this.name = 'HasDependentsError';
  }
}

function throwIfPreDeleteWrites(preDeleteWrites: boolean): void {
  if (preDeleteWrites) throw new HasDependentsError();
}

async function voidProjectSensory(
  ctx: OrgContextLike,
  project: { id: string; code: string },
): Promise<boolean> {
  const reason = `Parent NPD project ${project.code} was deleted`;
  const { rows } = await ctx.client.query<{ resource_id: string }>(
    `with voided as (
       update public.technical_sensory_evaluations sensory
          set voided_at = now(),
              voided_by = $3::uuid,
              void_reason = $4,
              updated_at = now()
        where sensory.org_id = app.current_org_id()
          and sensory.subject_type = 'project'
          and sensory.voided_at is null
          and (
            sensory.npd_project_id = $1::uuid
            or (
              sensory.npd_project_id is null
              and sensory.subject_ref in ($1::uuid::text, $2)
            )
          )
      returning sensory.id::text as resource_id,
                sensory.subject_ref,
                sensory.status,
                sensory.status_reason
     ),
     audited as (
       insert into public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
          before_state, after_state, request_id, retention_class)
       select app.current_org_id(),
              $3::uuid,
              'user',
              'technical.sensory.voided',
              'technical_sensory_evaluation',
              voided.resource_id,
              jsonb_build_object(
                'subject_ref', voided.subject_ref,
                'status', voided.status,
                'status_reason', voided.status_reason
              ),
              jsonb_build_object(
                'voided', true,
                'void_reason', $4,
                'npd_project_id', $1::uuid
              ),
              gen_random_uuid(),
              'operational'
         from voided
      returning resource_id
     )
     select resource_id from audited`,
    [project.id, project.code, ctx.userId, reason],
  );
  return rows.length > 0;
}

/**
 * Delete an NPD project. Deleting the row cascades gate_checklist_items (ON DELETE
 * CASCADE, mig 085) and nulls gate_approvals.project_id (ON DELETE SET NULL). Durable
 * project_code + project_id_snapshot are populated by the DB trigger on that SET NULL
 * path (mig 484) — no app-side pre-delete stamp.
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

      const { rows: existing } = await ctx.client.query<{ id: string; code: string; product_code: string | null }>(
        `select id, code, product_code
           from public.npd_projects
          where id = $1::uuid
            and org_id = app.current_org_id()
          for update`,
        [projectId],
      );
      const project = existing[0];
      if (!project) return { ok: false, error: 'NOT_FOUND' };

      // Preserve Technical sensory history but make it non-live/non-editable.
      // Migration 516 provides the durable parent id; UUID/code fallbacks cover
      // legacy rows created while subject_ref was the only soft reference.
      const voidedSensory = await voidProjectSensory(ctx, project);
      const linkedProductCode = project.product_code?.trim() || null;
      let archivedLinkedFg = false;
      if (linkedProductCode) {
        await archiveLinkedFgForDeletedProject(ctx, project.id, linkedProductCode);
        archivedLinkedFg = true;
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
          throwIfPreDeleteWrites(voidedSensory || archivedLinkedFg);
          return { ok: false, error: 'HAS_DEPENDENTS' };
        }
        throw err;
      }

      if (!deleted) {
        throwIfPreDeleteWrites(voidedSensory || archivedLinkedFg);
        return { ok: false, error: 'NOT_FOUND' };
      }

      // Atomic with the delete — a failed outbox insert must roll back the deletion.
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
        revalidateLocalized('/pipeline');
      } catch {
        // Vitest imports Server Actions outside a Next request store.
      }
      return { ok: true };
    });
  } catch (err) {
    if (err instanceof HasDependentsError) {
      return { ok: false, error: 'HAS_DEPENDENTS' };
    }
    if (err instanceof LinkedFgArchiveBlockedError) {
      return { ok: false, error: 'LINKED_FG_BLOCKED', blockReason: err.reason };
    }
    console.error('[deleteProject] persistence failed', {
      projectId,
      code: (err as { code?: string })?.code,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'PERSISTENCE_FAILED' };
  }
}
