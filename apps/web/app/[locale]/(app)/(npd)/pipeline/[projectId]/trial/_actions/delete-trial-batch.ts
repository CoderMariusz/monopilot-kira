'use server';

/**
 * 01-NPD TRIAL stage — `deleteTrialBatch` write Server Action.
 *
 * Org-scoped hard delete of a pending trial batch. RBAC: `npd.trial.write`.
 * Rejects rows that already have a pass/fail result (`has_progressed`).
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';
import { TRIAL_WRITE_PERMISSION, type DeleteTrialBatchError } from './errors';

const Input = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
});

export type DeleteTrialBatchResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: DeleteTrialBatchError; message?: string };

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

export async function deleteTrialBatch(raw: unknown): Promise<DeleteTrialBatchResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const canWrite = await hasPermission(client, userId, orgId, TRIAL_WRITE_PERMISSION);
      if (!canWrite) return { ok: false as const, error: 'forbidden' as const };

      const deleted = await client.query<{
        id: string;
        trial_no: string;
        result: string;
        deleted: boolean;
      }>(
        `with target as (
           select id, trial_no, result
             from public.trial_batches
            where id = $1::uuid
              and project_id = $2::uuid
              and org_id = app.current_org_id()
         ), removed as (
           delete from public.trial_batches tb
            using target t
            where tb.id = t.id
              and tb.result = 'pending'
            returning tb.id
         )
         select t.id::text as id, t.trial_no, t.result,
                (r.id is not null) as deleted
           from target t
           left join removed r on r.id = t.id`,
        [input.id, input.projectId],
      );
      const row = deleted.rows[0];
      if (!row) return { ok: false as const, error: 'not_found' as const };
      if (!row.deleted) return { ok: false as const, error: 'has_progressed' as const };
      const id = row.id;

      await client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            before_state, after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.trial_batch.deleted', 'npd.trial_batch', $2,
                 $3::jsonb, null, gen_random_uuid(), 'standard')`,
        [userId, id, JSON.stringify({ trialNo: row.trial_no, result: row.result })],
      );

      revalidateLocalized(`/pipeline/${input.projectId}/trial`);
      return { ok: true as const, data: { id } };
    });
  } catch (err) {
    console.error('[deleteTrialBatch] persistence_failed', {
      projectId: input.projectId,
      id: input.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
