'use server';

/**
 * Sensory WRITE path — record (create + edit) a Technical-owned sensory panel.
 *
 * Parity source = the existing sensory READ screens (technical/sensory/page.tsx
 * list, NPD pipeline sensory-screen.tsx + sensory-radar.tsx) + Technical Server
 * Action conventions (factory-specs/_actions/recall-spec.ts, items
 * supplier-spec-actions). There is NO standalone sensory JSX prototype — this is
 * the first sensory write path.
 *
 * Ownership: sensory is OWNED by 03-Technical (mig 166/237/347). This action is
 * the canonical writer for the 3 sensory tables (header + per-attribute scores +
 * panelist comments). NPD/Quality stay READ-ONLY consumers of the derived state.
 *
 * Conventions mirrored from update-fa-cell.ts / recall-spec.ts:
 *   - withOrgContext → one org-scoped transaction, RLS via app.current_org_id().
 *   - client.query(sql, params) shape; NUMERIC values bound as params (no float).
 *   - dual-store RBAC: LEFT JOIN role_permissions AND roles.permissions jsonb.
 *   - audit_events insert (operational) wrapped in a SAVEPOINT so an audit failure
 *     never rolls back the save.
 *   - safeRevalidatePath (no-op outside a Next request store, e.g. vitest).
 *
 * A 'use server' file may only export async functions; the perm string + enums +
 * the seed attribute list live in the plain sibling record-sensory-constants.ts.
 */

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  SENSORY_REVALIDATE_PATHS,
  SENSORY_STATUSES,
  SENSORY_SUBJECT_TYPES,
  SENSORY_VERDICT_STATUSES,
  SENSORY_WRITE_PERMISSION,
} from './record-sensory-constants';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

const VERDICT_SET = new Set<string>(SENSORY_VERDICT_STATUSES);

const attributeSchema = z.object({
  attributeName: z.string().trim().min(1),
  scoreOutOf10: z.number().min(0).max(10).nullable().optional(),
  vsBenchmark: z.number().min(-10).max(10).nullable().optional(),
});

const commentSchema = z.object({
  panelistCode: z.string().trim().min(1),
  comment: z.string().trim().min(1),
});

const recordInputSchema = z.object({
  panelId: z.string().uuid().optional(),
  subjectType: z.enum(SENSORY_SUBJECT_TYPES),
  subjectRef: z.string().trim().min(1),
  subjectItemId: z.string().uuid().nullable().optional(),
  status: z.enum(SENSORY_STATUSES),
  statusReason: z.string().trim().max(2000).nullable().optional(),
  panelDate: z.string().trim().min(1).nullable().optional(),
  panelistCount: z.number().int().min(0).nullable().optional(),
  benchmarkProductCode: z.string().trim().max(120).nullable().optional(),
  overallScore: z.number().min(0).max(10).nullable().optional(),
  attributes: z.array(attributeSchema),
  comments: z.array(commentSchema),
});

export type RecordSensoryEvaluationInput = z.input<typeof recordInputSchema>;

export type RecordSensoryEvaluationResult =
  | { ok: true; panelId: string }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

export type DeleteSensoryEvaluationResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_INPUT' | 'FORBIDDEN' | 'NOT_FOUND' | 'PERSISTENCE_FAILED' };

/** Dual-store RBAC: role_permissions table OR roles.permissions jsonb cache. */
async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

function nullableNumberParam(value: number | null | undefined): number | null {
  return value === undefined || value === null ? null : value;
}

function nullableTextParam(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function writeAudit(
  ctx: OrgContextLike,
  panelId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  // SAVEPOINT so an audit failure never rolls back the panel save (recall-spec
  // writes audit inline; here we isolate it because the audit table grants/columns
  // are the only part of the txn we treat as best-effort).
  try {
    await ctx.client.query('savepoint sensory_audit');
    await ctx.client.query(
      `insert into public.audit_events
         (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
          before_state, after_state, request_id, retention_class)
       values
         (app.current_org_id(), $1::uuid, 'user', 'technical.sensory.recorded',
          'technical_sensory_evaluation', $2, $3::jsonb, $4::jsonb, $5::uuid, 'operational')`,
      [
        ctx.userId,
        panelId,
        JSON.stringify(before ?? {}),
        JSON.stringify(after ?? {}),
        randomUUID(),
      ],
    );
    await ctx.client.query('release savepoint sensory_audit');
  } catch (error) {
    console.error('[technical/sensory] audit write failed (non-fatal)', {
      err: error instanceof Error ? error.message : String(error),
    });
    try {
      await ctx.client.query('rollback to savepoint sensory_audit');
    } catch {
      // savepoint may not exist if the first query failed before creating it.
    }
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}

export async function recordSensoryEvaluation(
  rawInput: unknown,
): Promise<RecordSensoryEvaluationResult> {
  const parsed = recordInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const input = parsed.data;

  // Invariant guards — mirror the DB CHECKs so a bad combo returns a clean error,
  // not a 500. status='not_required' forces policy_required=false; only a real
  // verdict (pass/fail/hold) stamps evaluated_at/evaluated_by.
  const isVerdict = VERDICT_SET.has(input.status);
  const policyRequired = input.status === 'not_required' ? false : true;

  try {
    return await withOrgContext(async (rawCtx): Promise<RecordSensoryEvaluationResult> => {
      const ctx = rawCtx as OrgContextLike;

      if (!(await hasPermission(ctx, SENSORY_WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      const subjectRef = input.subjectRef.trim();
      const subjectItemId = input.subjectItemId ?? null;
      const statusReason = nullableTextParam(input.statusReason);
      const panelDate = nullableTextParam(input.panelDate);
      const panelistCount = nullableNumberParam(input.panelistCount);
      const benchmarkProductCode = nullableTextParam(input.benchmarkProductCode);
      const overallScore = nullableNumberParam(input.overallScore);

      let panelId: string;
      let beforeState: unknown = null;

      if (!input.panelId) {
        // CREATE — org_id/created_by from context; schema_version takes its default.
        // evaluated_at/by stamped only for a verdict status (else null).
        const insert = await ctx.client.query<{ id: string }>(
          `insert into public.technical_sensory_evaluations
             (org_id, subject_type, subject_ref, subject_item_id, status, status_reason,
              policy_required, evaluated_at, evaluated_by, panel_date, panelist_count,
              benchmark_product_code, overall_score, created_by)
           values
             (app.current_org_id(), $1, $2, $3::uuid, $4, $5,
              $6, ${isVerdict ? 'now()' : 'null'}, ${isVerdict ? '$7::uuid' : 'null'},
              $8::date, $9, $10, $11, $7::uuid)
           returning id::text as id`,
          [
            input.subjectType,
            subjectRef,
            subjectItemId,
            input.status,
            statusReason,
            policyRequired,
            ctx.userId,
            panelDate,
            panelistCount,
            benchmarkProductCode,
            overallScore,
          ],
        );
        const created = insert.rows[0];
        if (!created) return { ok: false, code: 'PERSISTENCE_FAILED' };
        panelId = created.id;
      } else {
        // EDIT — load the prior row (for audit before-state), then UPDATE by id +
        // org. NOT_FOUND when the row is not visible / not in this org.
        const prior = await ctx.client.query<Record<string, unknown>>(
          `select id::text as id, subject_type, subject_ref, status, status_reason,
                  policy_required, panel_date::text as panel_date, panelist_count,
                  benchmark_product_code, overall_score::text as overall_score
             from public.technical_sensory_evaluations
            where id = $1::uuid
              and org_id = app.current_org_id()
            limit 1`,
          [input.panelId],
        );
        beforeState = prior.rows[0] ?? null;

        const update = await ctx.client.query<{ id: string }>(
          `update public.technical_sensory_evaluations
              set subject_type = $2,
                  subject_ref = $3,
                  subject_item_id = $4::uuid,
                  status = $5,
                  status_reason = $6,
                  policy_required = $7,
                  evaluated_at = ${isVerdict ? 'now()' : 'null'},
                  evaluated_by = ${isVerdict ? '$8::uuid' : 'null'},
                  panel_date = $9::date,
                  panelist_count = $10,
                  benchmark_product_code = $11,
                  overall_score = $12,
                  updated_at = now()
            where id = $1::uuid
              and org_id = app.current_org_id()
          returning id::text as id`,
          [
            input.panelId,
            input.subjectType,
            subjectRef,
            subjectItemId,
            input.status,
            statusReason,
            policyRequired,
            ctx.userId,
            panelDate,
            panelistCount,
            benchmarkProductCode,
            overallScore,
          ],
        );
        const updated = update.rows[0];
        if (!updated) return { ok: false, code: 'NOT_FOUND' };
        panelId = updated.id;
      }

      // Replace child sets (delete-then-insert, org-scoped by panel_id).
      await ctx.client.query(
        `delete from public.technical_sensory_attribute_scores
          where panel_id = $1::uuid and org_id = app.current_org_id()`,
        [panelId],
      );
      for (let i = 0; i < input.attributes.length; i += 1) {
        const attr = input.attributes[i]!;
        await ctx.client.query(
          `insert into public.technical_sensory_attribute_scores
             (org_id, panel_id, attribute_name, score_out_of_10, vs_benchmark, display_order, created_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5, $6::uuid)`,
          [
            panelId,
            attr.attributeName.trim(),
            nullableNumberParam(attr.scoreOutOf10),
            nullableNumberParam(attr.vsBenchmark),
            i,
            ctx.userId,
          ],
        );
      }

      await ctx.client.query(
        `delete from public.technical_sensory_panelist_comments
          where panel_id = $1::uuid and org_id = app.current_org_id()`,
        [panelId],
      );
      for (let i = 0; i < input.comments.length; i += 1) {
        const c = input.comments[i]!;
        await ctx.client.query(
          `insert into public.technical_sensory_panelist_comments
             (org_id, panel_id, panelist_code, comment, display_order, created_by)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4, $5::uuid)`,
          [panelId, c.panelistCode.trim(), c.comment.trim(), i, ctx.userId],
        );
      }

      await writeAudit(ctx, panelId, beforeState, {
        subject_type: input.subjectType,
        subject_ref: subjectRef,
        status: input.status,
        policy_required: policyRequired,
        panel_date: panelDate,
        panelist_count: panelistCount,
        benchmark_product_code: benchmarkProductCode,
        overall_score: overallScore,
        attribute_count: input.attributes.length,
        comment_count: input.comments.length,
      });

      for (const path of SENSORY_REVALIDATE_PATHS) safeRevalidatePath(path);
      // Best-effort NPD pipeline sensory path when the subject IS a project.
      if (input.subjectType === 'project') {
        safeRevalidatePath(`/en/pipeline/${subjectRef}/sensory`);
      }

      return { ok: true, panelId };
    });
  } catch (error) {
    console.error('[technical/sensory] recordSensoryEvaluation failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}

const deleteInputSchema = z.object({ panelId: z.string().uuid() });

export async function deleteSensoryEvaluation(
  rawInput: unknown,
): Promise<DeleteSensoryEvaluationResult> {
  const parsed = deleteInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const { panelId } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx): Promise<DeleteSensoryEvaluationResult> => {
      const ctx = rawCtx as OrgContextLike;

      if (!(await hasPermission(ctx, SENSORY_WRITE_PERMISSION))) {
        return { ok: false, code: 'FORBIDDEN' };
      }

      await ctx.client.query(
        `delete from public.technical_sensory_attribute_scores
          where panel_id = $1::uuid and org_id = app.current_org_id()`,
        [panelId],
      );
      await ctx.client.query(
        `delete from public.technical_sensory_panelist_comments
          where panel_id = $1::uuid and org_id = app.current_org_id()`,
        [panelId],
      );
      const removed = await ctx.client.query<{ id: string }>(
        `delete from public.technical_sensory_evaluations
          where id = $1::uuid and org_id = app.current_org_id()
        returning id::text as id`,
        [panelId],
      );
      if (!removed.rows[0]) return { ok: false, code: 'NOT_FOUND' };

      await writeAudit(ctx, panelId, { panel_id: panelId }, { deleted: true });

      for (const path of SENSORY_REVALIDATE_PATHS) safeRevalidatePath(path);
      return { ok: true };
    });
  } catch (error) {
    console.error('[technical/sensory] deleteSensoryEvaluation failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, code: 'PERSISTENCE_FAILED' };
  }
}
