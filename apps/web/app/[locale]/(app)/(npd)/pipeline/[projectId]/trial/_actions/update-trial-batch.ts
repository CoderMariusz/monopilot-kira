'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  TRIAL_WRITE_PERMISSION,
  type TrialResult,
  type UpdateTrialBatchError,
} from './errors';

const NON_NEG_DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');

const PERCENT_0_100 = NON_NEG_DECIMAL.refine(
  (s) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  },
  { message: 'yieldPct must be between 0 and 100' },
);

const RESULT = z.enum(['pass', 'fail', 'pending']);
const ISO_DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const UpdateInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  trialNo: z.string().trim().min(1).max(64),
  trialDate: ISO_DATE.nullable().optional(),
  batchSizeKg: NON_NEG_DECIMAL.nullable().optional(),
  yieldPct: PERCENT_0_100.nullable().optional(),
  technologistUserId: z.string().uuid().nullable().optional(),
  result: RESULT,
  notes: z.string().trim().max(2000).nullable().optional(),
});

type UpdateTrialBatchResult =
  | { ok: true; data: { id: string; trialNo: string; result: TrialResult } }
  | { ok: false; error: UpdateTrialBatchError; message?: string };

type QueryClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ rows: T[] }>;
};

async function hasPermission(
  client: QueryClient,
  userId: string,
  orgId: string,
  permission: string,
): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

async function writeAudit(
  client: QueryClient,
  args: {
    orgId: string;
    userId: string;
    action: string;
    resourceId: string;
    before: unknown;
    after: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
        before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'npd.trial_batch', $4,
             $5::jsonb, $6::jsonb, 'standard')`,
    [
      args.orgId,
      args.userId,
      args.action,
      args.resourceId,
      args.before === null ? null : JSON.stringify(args.before),
      args.after === null ? null : JSON.stringify(args.after),
    ],
  );
}

function mapDbError(err: unknown): UpdateTrialBatchError {
  const code = (err as { code?: string }).code;
  const constraint = (err as { constraint?: string }).constraint;
  if (code === '23505' || constraint === 'trial_batches_org_project_trial_no_unique') {
    return 'duplicate_trial_no';
  }
  if (code === '23503') return 'not_found';
  return 'persistence_failed';
}

export async function updateTrialBatch(raw: unknown): Promise<UpdateTrialBatchResult> {
  const parsed = UpdateInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const canWrite = await hasPermission(client, userId, orgId, TRIAL_WRITE_PERMISSION);
      if (!canWrite) return { ok: false as const, error: 'forbidden' as const };

      const before = await client.query<{
        trial_no: string;
        trial_date: string | null;
        batch_size_kg: string | null;
        yield_pct: string | null;
        technologist_user_id: string | null;
        result: TrialResult;
        notes: string | null;
      }>(
        `select trial_no,
                to_char(trial_date, 'YYYY-MM-DD') as trial_date,
                batch_size_kg::text               as batch_size_kg,
                yield_pct::text                   as yield_pct,
                technologist_user_id::text        as technologist_user_id,
                result,
                notes
           from public.trial_batches
          where id = $1::uuid and project_id = $2::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [input.id, input.projectId],
      );
      if (before.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const updated = await client.query<{ id: string }>(
        `update public.trial_batches
            set trial_no             = $3,
                trial_date           = $4::date,
                batch_size_kg        = $5::numeric,
                yield_pct            = $6::numeric,
                technologist_user_id = $7::uuid,
                result               = $8,
                notes                = $9,
                updated_by           = $10::uuid
          where id = $1::uuid and project_id = $2::uuid
            and org_id = app.current_org_id()
          returning id`,
        [
          input.id,
          input.projectId,
          input.trialNo,
          input.trialDate ?? null,
          input.batchSizeKg ?? null,
          input.yieldPct ?? null,
          input.technologistUserId ?? null,
          input.result,
          input.notes ?? null,
          userId,
        ],
      );
      const id = updated.rows[0]?.id;
      if (!id) return { ok: false as const, error: 'not_found' as const };

      await writeAudit(client, {
        orgId,
        userId,
        action: 'npd.trial_batch.updated',
        resourceId: id,
        before: before.rows[0],
        after: { trialNo: input.trialNo, result: input.result, projectId: input.projectId },
      });

      safeRevalidatePath(`/pipeline/${input.projectId}/trial`);
      return { ok: true as const, data: { id, trialNo: input.trialNo, result: input.result } };
    });
  } catch (err) {
    const error = mapDbError(err);
    if (error === 'persistence_failed') {
      console.error('[updateTrialBatch] persistence_failed', {
        id: input.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return { ok: false, error };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}
