'use server';

/**
 * 01-NPD TRIAL stage — `logTrialBatch` (write Server Action).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/trial
 *
 * Writes REAL, org-scoped trial batches via `withOrgContext` (RLS as app_user
 * with app.current_org_id()). zod-validated; the unique (org_id, project_id,
 * trial_no) constraint (migration 233) surfaces as a friendly
 * `duplicate_trial_no` error (DB 23505), never a raw constraint string.
 *
 * Every write inserts a `public.audit_log` row in the SAME txn (MON-t2-api
 * §audit) and `revalidatePath`s the trial route so the RSC list refreshes.
 *
 * RBAC write permission: `npd.trial.write` (BYTE-IDENTICAL to the seeded string).
 *
 * Money/percent inputs are accepted as decimal STRINGS and bound raw ::numeric
 * — NEVER a JS number (NUMERIC-exact red line, MON-t2-api).
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import {
  TRIAL_WRITE_PERMISSION,
  type LogTrialBatchError,
  type TrialResult,
} from './errors';

// ── Decimal-string validators (no float coercion) ─────────────────────────────
const NON_NEG_DECIMAL = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal string');
// yield_pct is NUMERIC(5,2) with a 0..100 CHECK at the DB; mirror it here.
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

const LogInput = z.object({
  projectId: z.string().uuid(),
  trialNo: z.string().trim().min(1).max(64),
  trialDate: ISO_DATE.nullable().optional(),
  batchSizeKg: NON_NEG_DECIMAL.nullable().optional(),
  yieldPct: PERCENT_0_100.nullable().optional(),
  technologistUserId: z.string().uuid().nullable().optional(),
  result: RESULT.default('pending'),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type LogTrialBatchInput = z.infer<typeof LogInput>;

export type LogTrialBatchResult =
  | { ok: true; data: { id: string; trialNo: string; result: TrialResult } }
  | { ok: false; error: LogTrialBatchError; message?: string };

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

/** Map a pg error to the closed enum; the unique constraint → duplicate_trial_no. */
function mapDbError(err: unknown): LogTrialBatchError {
  const code = (err as { code?: string }).code;
  const constraint = (err as { constraint?: string }).constraint;
  if (code === '23505' || constraint === 'trial_batches_org_project_trial_no_unique') {
    return 'duplicate_trial_no';
  }
  if (code === '23503') return 'not_found';
  return 'persistence_failed';
}

export async function logTrialBatch(raw: unknown): Promise<LogTrialBatchResult> {
  const parsed = LogInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const canWrite = await hasPermission(client, userId, orgId, TRIAL_WRITE_PERMISSION);
      if (!canWrite) return { ok: false as const, error: 'forbidden' as const };

      // Project must exist within the org (RLS scopes to org).
      const project = await client.query<{ id: string }>(
        `select id from public.npd_projects
          where id = $1::uuid and org_id = app.current_org_id()
          limit 1`,
        [input.projectId],
      );
      if (project.rows.length === 0) return { ok: false as const, error: 'not_found' as const };

      const inserted = await client.query<{ id: string }>(
        `insert into public.trial_batches
           (org_id, project_id, trial_no, trial_date, batch_size_kg, yield_pct,
            technologist_user_id, result, notes, created_by, updated_by)
         values (app.current_org_id(), $1::uuid, $2, $3::date, $4::numeric, $5::numeric,
                 $6::uuid, $7, $8, $9::uuid, $9::uuid)
         returning id`,
        [
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
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('trial_batch_insert_returned_no_id');

      await writeAudit(client, {
        orgId,
        userId,
        action: 'npd.trial_batch.logged',
        resourceId: id,
        before: null,
        after: { trialNo: input.trialNo, result: input.result, projectId: input.projectId },
      });

      revalidateLocalized(`/pipeline/${input.projectId}/trial`);
      return { ok: true as const, data: { id, trialNo: input.trialNo, result: input.result } };
    });
  } catch (err) {
    const error = mapDbError(err);
    if (error === 'persistence_failed') {
      console.error('[logTrialBatch] persistence_failed', {
        projectId: input.projectId,
        trialNo: input.trialNo,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return { ok: false, error };
  }
}
