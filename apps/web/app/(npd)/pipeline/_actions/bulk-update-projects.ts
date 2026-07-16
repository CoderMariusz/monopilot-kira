'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { advanceProjectGate } from './advance-project-gate';
import {
  hasPermission,
  type OrgContextLike,
  type ProjectGate,
  type ProjectPriority,
} from './shared';
import { revalidateLocalized } from '../../../../lib/i18n/revalidate-localized';

const BULK_PROJECT_PERMISSION = 'npd.core.write';

const projectIdsSchema = z.array(z.string().uuid()).min(1).max(100);

const assignOwnerSchema = z.object({
  projectIds: projectIdsSchema,
  owner: z.string().trim().min(1).max(120).nullable(),
});

const setPrioritySchema = z.object({
  projectIds: projectIdsSchema,
  priority: z.enum(['high', 'normal', 'low']),
});

// Stage-native bulk move (2026-06-06 pivot): the user picks the next operational
// stage; each selected project advances exactly one step into it (adjacency enforced
// per-project by advanceProjectGate — non-adjacent projects land in `failed`).
// `brief` is the gate-only G0→G1 target (stage stays brief, gate rises to G1).
const moveGateSchema = z.object({
  projectIds: projectIdsSchema,
  targetStage: z.enum([
    'brief',
    'recipe',
    'packaging',
    'costing_nutrition',
    'trial',
    'sensory',
    'pilot',
    'approval',
    'handoff',
    'launched',
  ]),
});

// NOTE: types cannot be exported from a 'use server' file (Next build rule); kept local.
type BulkProjectMutationResult =
  | { ok: true; data: { updated: number; projectIds: string[] } }
  | { ok: false; error: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED'; status: number };

type BulkMoveGateResult =
  | {
      ok: true;
      data: {
        updated: number;
        projectIds: string[];
        failed: Array<{ projectId: string; error: string; status: number }>;
      };
    }
  | {
      ok: false;
      error: 'INVALID_INPUT' | 'FORBIDDEN' | 'PERSISTENCE_FAILED';
      status: number;
      failed?: Array<{ projectId: string; error: string; status: number }>;
    };

export async function bulkAssignOwner(rawInput: unknown): Promise<BulkProjectMutationResult> {
  const parsed = assignOwnerSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext(async (ctx): Promise<BulkProjectMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, BULK_PROJECT_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN', status: 403 };
      }
      return updateProjectField(context, {
        projectIds: parsed.data.projectIds,
        field: 'owner',
        value: parsed.data.owner,
        action: 'npd.project.owner_bulk_assigned',
      });
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

export async function bulkSetPriority(rawInput: unknown): Promise<BulkProjectMutationResult> {
  const parsed = setPrioritySchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  try {
    return await withOrgContext(async (ctx): Promise<BulkProjectMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, BULK_PROJECT_PERMISSION))) {
        return { ok: false, error: 'FORBIDDEN', status: 403 };
      }
      return updateProjectField(context, {
        projectIds: parsed.data.projectIds,
        field: 'prio',
        value: parsed.data.priority,
        action: 'npd.project.priority_bulk_set',
      });
    });
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500 };
  }
}

export async function bulkMoveGate(rawInput: unknown): Promise<BulkMoveGateResult> {
  const parsed = moveGateSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', status: 400 };

  const failed: Array<{ projectId: string; error: string; status: number }> = [];
  const moved: Array<{ projectId: string; previousGate: ProjectGate; currentGate: ProjectGate }> = [];

  for (const projectId of parsed.data.projectIds) {
    const result = await advanceProjectGate({ projectId, targetStage: parsed.data.targetStage });
    if (result.ok) {
      moved.push({
        projectId,
        previousGate: result.data.previousGate,
        currentGate: result.data.currentGate,
      });
    } else {
      failed.push({ projectId, error: result.error, status: result.status });
    }
  }

  if (moved.length > 0) {
    await withOrgContext(async (ctx) => {
      await writeBulkGateAudit(ctx as OrgContextLike, moved);
    });
  }

  safeRevalidatePath('/npd/pipeline');
  safeRevalidatePath('/pipeline');
  if (failed.length > 0) {
    return { ok: false, error: 'PERSISTENCE_FAILED', status: 500, failed };
  }
  return { ok: true, data: { updated: moved.length, projectIds: moved.map((row) => row.projectId), failed } };
}

async function updateProjectField(
  ctx: OrgContextLike,
  input: {
    projectIds: string[];
    field: 'owner' | 'prio';
    value: string | null;
    action: string;
  },
): Promise<BulkProjectMutationResult> {
  const before = await ctx.client.query<{
    id: string;
    code: string;
    owner: string | null;
    prio: ProjectPriority;
    current_gate: ProjectGate;
  }>(
    `select id, code, owner, prio, current_gate
       from public.npd_projects
      where org_id = app.current_org_id()
        and id = any($1::uuid[])
      for update`,
    [input.projectIds],
  );

  if (before.rows.length !== input.projectIds.length) {
    return { ok: false, error: 'NOT_FOUND', status: 404 };
  }

  const updated = await ctx.client.query<{ id: string }>(
    input.field === 'owner'
      ? `update public.npd_projects
            set owner = $2
          where org_id = app.current_org_id()
            and id = any($1::uuid[])
          returning id`
      : `update public.npd_projects
            set prio = $2
          where org_id = app.current_org_id()
            and id = any($1::uuid[])
          returning id`,
    [input.projectIds, input.value],
  );

  await writeBulkAudit(ctx, {
    action: input.action,
    field: input.field,
    value: input.value,
    beforeState: before.rows,
    projectIds: updated.rows.map((row) => row.id),
  });

  safeRevalidatePath('/npd/pipeline');
  safeRevalidatePath('/pipeline');
  return { ok: true, data: { updated: updated.rows.length, projectIds: updated.rows.map((row) => row.id) } };
}

async function writeBulkAudit(
  ctx: OrgContextLike,
  input: {
    action: string;
    field: 'owner' | 'prio';
    value: string | null;
    beforeState: Array<{ id: string; code: string; owner: string | null; prio: ProjectPriority; current_gate: ProjectGate }>;
    projectIds: string[];
  },
): Promise<void> {
  const updatedIds = new Set(input.projectIds);
  for (const row of input.beforeState) {
    if (!updatedIds.has(row.id)) continue;
    await ctx.client.query(
      `insert into public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
          before_state, after_state, request_id, retention_class)
       values (app.current_org_id(), $1::uuid, 'user', $2, 'npd_project', $3,
               $4::jsonb, $5::jsonb, $6::uuid, 'operational')`,
      [
        ctx.userId,
        input.action,
        row.id,
        JSON.stringify(row),
        JSON.stringify({ id: row.id, code: row.code, field: input.field, value: input.value }),
        randomUUID(),
      ],
    );
  }
}

async function writeBulkGateAudit(
  ctx: OrgContextLike,
  moved: Array<{ projectId: string; previousGate: ProjectGate; currentGate: ProjectGate }>,
): Promise<void> {
  for (const row of moved) {
    await ctx.client.query(
      `insert into public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
          before_state, after_state, request_id, retention_class)
       values (app.current_org_id(), $1::uuid, 'user', 'npd.project.gate_bulk_moved',
               'npd_project', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
      [
        ctx.userId,
        row.projectId,
        JSON.stringify({ id: row.projectId, current_gate: row.previousGate }),
        JSON.stringify({ id: row.projectId, current_gate: row.currentGate }),
        randomUUID(),
      ],
    );
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path);
  } catch {
    // Tests import Server Actions outside a Next request/static generation store.
  }
}
